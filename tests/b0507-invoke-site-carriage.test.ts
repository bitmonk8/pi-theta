// Focused runtime-boundary controls, not source-admission or real-host tests.
// Real imports/CLI dispatch are covered by the immutable b0507 witnesses.
import type { ExtensionCommandContext, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InvokeMachinery } from "../src/extension/invoke-machinery";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import { parseThetaDocument, type CallExpr, type InvokeExpr } from "../src/parser/theta-document";
import { createEffectfulStatementHost } from "../src/runtime/effectful-statement-host";
import { newInvokeChain } from "../src/runtime/invoke-depth-cycle";
import type { DrivenInvokeResult, InvokeChild } from "../src/runtime/invoke-cancellation";
import { buildEnvironment } from "../src/runtime/lexical-environment";
import type { InvokeCalleeError, QueryError } from "../src/runtime/query-error";
import { makeErr, makeOk, type ThetaValue } from "../src/runtime/value";
import { rootDouble } from "./helpers/call-with-clause-harness";
import { parseDeps } from "./helpers/e2e-s1";
import { FakeFileSystem } from "./helpers/fake-file-system";
import { errNote, hostPi, type RecordedMessage } from "./helpers/fixture-dispatch-harness";
import { SEAM_NOOP_CHECKPOINT, SEAM_NOOP_SINK } from "./helpers/invoke-seam-scaffold";

const CALLER = "/ws/caller.theta";
const LIB = "/ws/lib/site.thetalib";
const CTX = { cwd: "/ws", model: { id: "m", provider: "p" } } as ExtensionCommandContext;
const LEAF: QueryError = { kind: "invoke_infra", cause: "load_failure", callee_path: "./leaf.theta", message: "leaf" };
const PREFIX = "theta /caller returned Err: invoke of ./leaf.theta failed (load_failure)";
function theta(sourcePath: string | undefined = CALLER): ThetaCompositionInput {
  const doc = parseThetaDocument({ path: CALLER, bytes: new TextEncoder().encode('---\nmode: prompt\n---\ninvoke("./child.theta")\n') }, parseDeps());
  expect(doc.diagnostics).toEqual([]);
  if (doc.frontmatter === null) throw new Error("frontmatter missing");
  return { slashName: "caller", ...(sourcePath !== undefined ? { sourcePath } : {}), frontmatter: doc.frontmatter, body: doc.body };
}
const EXPR = theta().body.tail as InvokeExpr;
const BARE: CallExpr = { kind: "call", callee: "worker", args: [], range: EXPR.range };
const result = (error: QueryError = LEAF): DrivenInvokeResult => ({ source: "callee-returned", result: makeErr(error as unknown as ThetaValue) });
afterEach(() => { vi.restoreAllMocks(); });

describe("bug 0507 — source snapshot metadata", () => {
  for (const style of ["literal", "bare"] as const) {
    it(`${style} snapshots residence before drive, independently of callee base`, async () => {
      const parseCallee = vi.fn(() => Promise.resolve({ kind: "unreadable" as const }));
      const machinery = new InvokeMachinery({
        input: { pi: hostPi([], "no provider"), root: rootDouble(), modelRegistry: {} as ModelRegistry, parseCallee },
        systemNoteChannel: () => { throw new Error("no system note expected"); },
        recoverDeclaredDefaults: () => Promise.resolve([]),
        bindPromptConversation: () => { throw new Error("no callee bind expected"); },
        spawnSubagentConversation: () => { throw new Error("no spawn expected"); },
      });
      for (const [source, residence, expected] of [
        [CALLER, LIB, LIB], [CALLER, undefined, CALLER], [undefined, undefined, undefined],
      ] as const) {
        const baseTheta = theta();
        const { sourcePath: _unused, ...withoutSource } = baseTheta;
        const input = source === undefined ? withoutSource : baseTheta;
        const env = buildEnvironment({ body: input.body, ...(residence !== undefined ? { moduleResidence: residence } : {}) });
        const readResidence = vi.spyOn(env, "currentResidence");
        const child = style === "literal"
          ? machinery.resolveInvoke(input, EXPR, env, CTX, newInvokeChain(), new AbortController().signal, "prompt", undefined, undefined)
          : machinery.resolveCallAsInvoke(input, BARE, env, CTX, newInvokeChain(), new AbortController().signal, "prompt", undefined, undefined);
        expect(readResidence).toHaveBeenCalledTimes(1);
        expect(child.invocationSourcePath).toBe(expected);
        expect(Object.hasOwn(child, "invocationSourcePath")).toBe(expected !== undefined);
        expect(child.resolvedCalleePath).toBe(source === undefined ? undefined : style === "literal" && residence !== undefined ? "/ws/lib/child.theta" : style === "bare" ? "/ws/worker.theta" : "/ws/child.theta");
        readResidence.mockReturnValue("/ws/changed.thetalib");
        const driven = await child.drive();
        expect(driven.source).toBe("boundary-minted");
        expect(driven.result.ok).toBe(false);
        expect(child.invocationSourcePath).toBe(expected);
        expect(readResidence).toHaveBeenCalledTimes(1);
        expect(parseCallee).toHaveBeenLastCalledWith(style === "literal" ? expected : source, style === "literal" ? "./child.theta" : "./worker.theta");
      }
    });
  }
});

// Inject only the InvokeChild boundary, then exercise the real production
// effect host, producer recorder, ledger and top-level note renderer.
async function producerDrive(options: { metadata?: string; noLedger?: boolean; noSource?: boolean; rejectSite?: boolean }) {
  const realpaths: string[] = [];
  class SiteFs extends FakeFileSystem {
    override realpath(path: string): Promise<string> {
      realpaths.push(path);
      if (options.rejectSite && path === LIB) return Promise.reject(new Error("site removed during drive"));
      return super.realpath(path);
    }
  }
  const fs = new SiteFs({ homedir: "/home/test", cwd: "/ws", files: { [CALLER]: "caller", [LIB]: "lib", "/ws/child.theta": "child" } });
  const child: InvokeChild = { calleePath: "./child.theta", committed: [],
    ...(options.metadata !== undefined ? { invocationSourcePath: options.metadata } : {}),
    drive: () => Promise.resolve(result()) };
  const resolve = vi.spyOn(InvokeMachinery.prototype, "resolveInvoke").mockReturnValue(child);
  const notes: RecordedMessage[] = [];
  const deps = createProductionProducerDeps({ pi: hostPi(notes, "no provider"), root: rootDouble(), modelRegistry: {} as ModelRegistry,
    ...(!options.noLedger ? { fileSystem: fs } : {}) });
  const { sourcePath: _unused, ...withoutSource } = theta();
  const input = options.noSource ? withoutSource : theta();
  const binding = deps.bindPromptConversation({ theta: input, args: "", ctx: CTX });
  const outcome = await binding.executeDeps.host.runEffect(EXPR, buildEnvironment({ body: input.body }));
  expect(resolve).toHaveBeenCalledTimes(1);
  expect(outcome.ok).toBe(true);
  if (!outcome.ok) throw new Error("effect failed, rather than returning Err");
  const wrapper = (outcome.value as { error: InvokeCalleeError }).error;
  expect(wrapper).toMatchObject({ kind: "invoke_callee", callee_path: "./child.theta", inner: LEAF });
  deps.emitTopLevelErrNote?.("caller", wrapper);
  return { note: errNote(notes, "caller"), realpaths };
}

describe("bug 0507 — producer compatibility and best-effort site", () => {
  it("legacy children retain caller source and relative callee fallback", async () => {
    expect((await producerDrive({})).note).toBe(`${PREFIX} from /ws/child.theta invoked at ${CALLER}:4`);
  });
  it("library site metadata never rebases a legacy relative callee", async () => {
    expect((await producerDrive({ metadata: LIB })).note).toBe(`${PREFIX} from /ws/child.theta invoked at ${LIB}:4`);
  });
  for (const options of [{ noLedger: true }, { noSource: true }]) {
    it(`does not invent a hop with ${JSON.stringify(options)}, even with library metadata`, async () => {
      const row = await producerDrive({ ...options, metadata: LIB });
      expect(row.note).toBe(PREFIX);
      expect(row.realpaths).toEqual([]);
    });
  }
  it("actual-site realpath rejection omits the hop, never substitutes the caller", async () => {
    const row = await producerDrive({ metadata: LIB, rejectSite: true });
    expect(row.note).toBe(PREFIX);
    expect(row.realpaths).toEqual([LIB, "/ws/child.theta"]);
  });
});

describe("bug 0507 — carriage preserves wrap/record exclusions", () => {
  for (const arm of ["callee-error", "success", "boundary-error", "parent-cancel", "child-cancel"] as const) {
    it(arm, async () => {
      const controller = new AbortController();
      const cancelled: QueryError = { kind: "cancelled", message: "cancelled" };
      const returned = arm === "success" ? makeOk(42) : makeErr((arm.endsWith("cancel") ? cancelled : LEAF) as unknown as ThetaValue);
      const drive = vi.fn(() => {
        if (arm === "parent-cancel") controller.abort(); // after pre-dispatch checkpoint
        return Promise.resolve({ source: arm === "boundary-error" ? "boundary-minted" as const : "callee-returned" as const, result: returned });
      });
      const recordInvokeHop = vi.fn(() => Promise.resolve());
      const child: InvokeChild = { calleePath: "./child.theta", resolvedCalleePath: "/ws/child.theta", invocationSourcePath: LIB, committed: [], drive };
      const host = createEffectfulStatementHost({ checkpoint: SEAM_NOOP_CHECKPOINT, signal: controller.signal, sink: SEAM_NOOP_SINK, file: CALLER,
        evaluatePure: () => null, resolveQuery: () => { throw new Error("no query"); }, resolveToolCall: () => { throw new Error("no tool"); },
        resolveInvoke: () => child, recordInvokeHop });
      const outcome = await host.runEffect(EXPR, buildEnvironment({ body: theta().body }));
      expect(drive).toHaveBeenCalledTimes(1);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) throw new Error("effect failed");
      if (arm === "callee-error" || arm === "child-cancel") {
        const value = outcome.value as { error: InvokeCalleeError };
        expect(value.error).toMatchObject({ kind: "invoke_callee", inner: arm === "child-cancel" ? cancelled : LEAF });
        expect(recordInvokeHop).toHaveBeenCalledTimes(1);
        expect(recordInvokeHop).toHaveBeenCalledWith(value.error, "/ws/child.theta", { style: "literal_invoke", invokeToken: EXPR.range.start }, LIB);
      } else {
        // INVCEIL-3: untyped invoke discards the child's Ok payload.
        if (arm === "success") expect(outcome.value).toEqual(makeOk(null));
        else expect(outcome.value).toBe(returned);
        expect(recordInvokeHop).not.toHaveBeenCalled();
      }
    });
  }
});
