// Bug 0507: isolate the production effect host -> invoke machinery -> ledger
// without discovery, slash dispatch, a provider, or a real child process.
// The module env is injected deliberately: the e2e witnesses establish that
// real imports supply it. These tests pin the output, not a proposed carrier API.
import type { ExtensionCommandContext, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import { parseThetaDocument, type Expr } from "../src/parser/theta-document";
import { buildEnvironment } from "../src/runtime/lexical-environment";
import { createInvocationProvenanceLedger } from "../src/runtime/invoke-provenance-ledger";
import type { InvokeCalleeError, QueryError } from "../src/runtime/query-error";
import { isResultValue, type ThetaValue } from "../src/runtime/value";
import { rootDouble } from "./helpers/call-with-clause-harness";
import { FakeFileSystem } from "./helpers/fake-file-system";
import { hostPi, errNote, type RecordedMessage } from "./helpers/fixture-dispatch-harness";
import { parseDeps } from "./helpers/e2e-s1";

const CALLER = "/ws/caller.theta";
const LIB = "/ws/workers/lib.thetalib";
const LIB_REAL = "/ws/workers/actual-lib.thetalib";
const LIB_CHILD = "/ws/workers/child.theta";
const CALLER_CHILD = "/ws/child.theta";
const FM = "---\nmode: prompt\n---\n";
const LEAF = { kind: "invoke_infra", cause: "load_failure", callee_path: "./leaf.theta", message: "B0507 leaf" } as const;

function parsed(path: string, body: string, withWorker = false): ThetaCompositionInput {
  const frontmatter = withWorker ? "---\nmode: prompt\ntools: ./child.theta as worker\n---\n" : FM;
  const doc = parseThetaDocument({ path, bytes: new TextEncoder().encode(frontmatter + body) }, parseDeps());
  expect(doc.diagnostics, "unit source must parse cleanly").toEqual([]);
  if (doc.frontmatter === null) throw new Error("unit frontmatter missing");
  return { slashName: "caller", sourcePath: path, frontmatter: doc.frontmatter, body: doc.body };
}

class RecordingFs extends FakeFileSystem {
  readonly realpaths: string[] = [];
  override realpath(path: string): Promise<string> {
    this.realpaths.push(path);
    return super.realpath(path);
  }
}

async function drive(style: "literal" | "bare", residence?: string) {
  const theta = parsed(CALLER, "null\n");
  const child = parsed(CALLER_CHILD, 'schema Leaf { kind: string, cause: string, callee_path: string, message: string }\n' +
    'Err(Leaf {kind: "invoke_infra", cause: "load_failure", callee_path: "./leaf.theta", message: "B0507 leaf"})\n');
  // Parse an expression fixture as a theta, then independently inject the
  // effect boundary's module env below. This unit does not test lib admission.
  const exprDoc = parsed(CALLER, "// token deliberately differs from caller's call line\n" +
    (style === "literal" ? 'invoke("./child.theta")\n' : "worker()\n"), style === "bare");
  const expr = exprDoc.body.tail as Expr;
  expect(expr?.kind).toBe(style === "literal" ? "invoke" : "call");
  const tokenLine = style === "bare" ? 6 : 5;
  expect(expr.range.start.line).toBe(tokenLine);
  const fs = new RecordingFs({
    homedir: "/home/test", cwd: "/ws",
    files: { [CALLER]: "caller", [LIB_REAL]: "library", [LIB_CHILD]: "child", [CALLER_CHILD]: "child" },
    dirs: { "/ws": [], "/ws/workers": [] },
    symlinks: { [LIB]: LIB_REAL },
  });
  const notes: RecordedMessage[] = [];
  const parseCalls: { base: string | undefined; literal: string }[] = [];
  const deps = createProductionProducerDeps({
    pi: hostPi(notes, "B0507 unit must never issue a provider turn"),
    root: rootDouble(), modelRegistry: {} as ModelRegistry,
    fileSystem: fs, activeRoots: ["/ws"],
    parseCallee: (base, literal) => {
      parseCalls.push({ base, literal });
      return Promise.resolve({ kind: "ok", input: child });
    },
  });
  // The bare call is injected at the effect boundary, not claimed as a legal
  // prompt-mode tools registration. Its caller-relative callee policy must
  // remain independent of its library-resident invocation site.
  const boundTheta: ThetaCompositionInput = {
    ...theta,
    callableSet: { entries: new Map([["worker", {
      kind: "theta" as const, mode: "prompt" as const, calleePath: "./child.theta",
    }]]) },
  };
  const binding = deps.bindPromptConversation({
    theta: boundTheta, args: "",
    ctx: { cwd: "/ws", model: { id: "m", provider: "p" } } as ExtensionCommandContext,
  });
  const env = buildEnvironment({ body: exprDoc.body, callables: ["worker"],
    ...(residence !== undefined ? { moduleResidence: residence } : {}) });
  expect(env.currentResidence()).toBe(residence);
  const outcome = await binding.executeDeps.host.runEffect(expr, env);
  expect(outcome.ok, "effect must complete, not fail as infrastructure").toBe(true);
  const value = outcome.ok ? outcome.value as ThetaValue : undefined;
  if (value === undefined || !isResultValue(value) || value.ok) throw new Error("unit did not return Err");
  const wrapper = value.error as unknown as InvokeCalleeError;
  expect(wrapper.kind, "child returned its own error, adding exactly one wrapper").toBe("invoke_callee");
  expect(wrapper.callee_path).toBe("./child.theta");
  expect(wrapper.inner).toEqual(LEAF);
  const base = style === "literal" ? residence ?? CALLER : CALLER;
  expect(parseCalls, "callee-resolution policy is unchanged").toEqual([{ base, literal: "./child.theta" }]);
  deps.emitTopLevelErrNote?.("caller", wrapper);
  return { note: errNote(notes, "caller"), realpaths: fs.realpaths, tokenLine };
}

const PREFIX = "theta /caller returned Err: invoke of ./leaf.theta failed (load_failure)";

describe("bug 0507 — isolated production hop site", () => {
  for (const style of ["literal", "bare"] as const) {
    it(`CONTROL: ${style} theta-body path and token line are unchanged`, async () => {
      const row = await drive(style);
      expect(row.note).toBe(`${PREFIX} from ${CALLER_CHILD} invoked at ${CALLER}:${row.tokenLine}`);
    });
    it(`${style} library-body hop uses canonical executing residence, not bind input`, async () => {
      const row = await drive(style, LIB);
      const callee = style === "literal" ? LIB_CHILD : CALLER_CHILD;
      expect(row.note, "B0507 isolated actual-site provenance").toBe(`${PREFIX} from ${callee} invoked at ${LIB_REAL}:${row.tokenLine}`);
      expect(row.realpaths, "actual source file passes through the existing canonicalizer").toContain(LIB);
    });
  }

  it("CONTROL: the ledger already preserves a supplied library-file/token pair for both styles", async () => {
    const fs = new FakeFileSystem({ homedir: "/home/test", cwd: "/ws",
      files: { [LIB_REAL]: "library", [LIB_CHILD]: "child" }, symlinks: { [LIB]: LIB_REAL } });
    for (const style of ["literal_invoke", "theta_callable_bare"] as const) {
      const ledger = createInvocationProvenanceLedger({ fs });
      const wrapper: InvokeCalleeError = { kind: "invoke_callee", message: "unit wrapper", callee_path: "./child.theta", inner: LEAF as QueryError };
      const token = { line: 17, column: 3 };
      await ledger.attach(wrapper, { parentPath: LIB, calleePath: LIB_CHILD,
        callSite: style === "literal_invoke" ? { style, invokeToken: token } : { style, calleeNameToken: token } });
      expect(ledger.chainFor(wrapper)).toEqual([{ calleePath: LIB_CHILD, record: { parentPath: LIB_REAL, callSiteLine: 17 } }]);
      expect(wrapper.callee_path, "theta-visible literal remains untouched").toBe("./child.theta");
    }
  });
});
