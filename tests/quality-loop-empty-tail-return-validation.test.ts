// The 2026-09-10 quality-loop abort, from both sides of the check that could
// have caught it: `.pi/theta/quality-loop.theta` invokes its per-tree wrapper as
// `invoke<TreeFixReport>("./workers/fix-cluster-tree.theta", …)`, the wrapper
// ended on a trailing `if` STATEMENT (whose branch values go nowhere), so the
// callee's final value was `null`, the PIC-59 envelope carried
// `{"theta_result":{"v":1,"ok":null}}`, and the orchestrator's `.ok` read
// panicked one hop later.
//
// WHERE THE STATIC CHECK IS, AND IS NOT. `invocation.md` §"Typed return"
// (*Empty-tail callee compatibility*) states both halves: `invoke<Schema>` of an
// empty-tail callee is `theta/parse/invoke-return-type-mismatch` "when
// statically resolvable", and `Err(InvokeInfraError { cause:
// "return_validation" })` when the runtime AJV check rejects the literal `null`.
// Only the SECOND half is implemented. `checkInvokeReturnType`
// (src/parser/invoke-diagnostics.ts) has exactly ONE call site —
// `checkSubagentReturnAnnotation` (src/parser/type-layer-checks.ts), which
// passes `calleeResolvable: true` for an IN-FILE `subagent fn f(): T`
// declaration — and the load pass (src/extension/invoke-static-checks.ts)
// resolves a cross-file callee only for arity, per-slot argument types, cycles
// and root containment, never for its return type. So no load-time diagnostic
// exists for a typed `invoke<Schema>("./x.theta")` against a `.theta` callee,
// whatever that callee's tail is; the runtime boundary is the only net. Cells A
// and B pin that asymmetry as a tested state (the load path is SILENT
// cross-file, and LOUD for the in-file analogue) so it is a known shape rather
// than an unknown; cells C-E pin the net that actually caught this bug.
//
// Cells C-E drive the REAL production invoke path (`#resolveInvoke` ->
// `#driveCallee` -> the subagent spawn cell -> `#validateInvokeReturn`) over the
// in-process fake json child, with the caller body PARSED from real theta
// source so the `schema TreeFixReport` declaration the annotation resolves
// against is the parser's own. Offline / provider-free: no process is spawned
// and no credential is read.
//
// Spec: invocation.md §"Typed return" (#typed-return) + INV-5;
// pi-integration-contract/subagent.md PIC-59 (the `ok` arm's carriage);
// functions.md §"Empty-tail body" (FN-4: an empty tail infers `null`).

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { discoverAndComposeFixtures } from "../src/extension/production-composition";
import type {
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { ResultValue } from "../src/runtime/value";
import {
  createProductionProducerDeps,
  type CalleeParseOutcome,
} from "../src/extension/production-theta-producer";
import { executeBody } from "../src/runtime/statement-executor";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import { fakeExecutableHost, makeFakeJsonChildLauncher } from "./helpers/fake-json-child";
import { parseDoc } from "./helpers/e2e-s1";

// ---------------------------------------------------------------------------
// A + B — the LOAD path's reach, in both directions.
// ---------------------------------------------------------------------------

/** The wrapper's shape at the abort: statements only, no tail expression (FN-4). */
const EMPTY_TAIL_CALLEE = [
  "---",
  "description: a callee whose body has no tail expression",
  "mode: subagent",
  "---",
  "let staged = 1",
  "",
].join("\n");

/** The orchestrator's shape: a typed invoke of that callee, annotation declared same-file. */
const TYPED_INVOKE_CALLER = [
  "---",
  "description: typed invoke of an empty-tail callee",
  "mode: prompt",
  "---",
  "schema R { ok: boolean }",
  'let r = invoke<R>("./child.theta")?',
  "r",
  "",
].join("\n");

/** The IN-FILE analogue FN-6 equates with `invoke<T>`: a `subagent fn` return annotation. */
const IN_FILE_SUBAGENT_FN = [
  "---",
  "description: in-file subagent fn whose return annotation cannot hold its tail",
  "mode: prompt",
  "---",
  "subagent fn f(): number {",
  '  "not a number"',
  "}",
  "f()",
  "",
].join("\n");

interface LoadRecorder {
  readonly toasts: { message: string; type: string }[];
}

function loadPi(): ExtensionAPI {
  return {
    getFlag: (): undefined => undefined,
    getCommands: (): { name: string; source: string }[] => [],
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
    registerCommand: (): void => {},
    registerMessageRenderer: (): void => {},
    registerFlag: (): void => {},
    on: (): void => {},
  } as unknown as ExtensionAPI;
}

function loadCtx(cwd: string, recorder: LoadRecorder): ExtensionContext {
  return {
    cwd,
    hasUI: false,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string, type: string): void => {
        recorder.toasts.push({ message, type });
      },
    },
  } as unknown as ExtensionContext;
}

/**
 * Run the REAL load pass (discovery + compose, the same entry the H8a fixture
 * path uses) over a planted `.pi/theta` corpus, and return which thetas
 * registered plus every load diagnostic the router surfaced. The `-p`/no-UI
 * stderr mirror is captured too, since that is where a load diagnostic's CODE
 * is rendered (the toast carries the message only).
 */
async function loadCorpus(files: Record<string, string>): Promise<{
  readonly registered: readonly string[];
  readonly stderr: string;
  readonly toasts: readonly { message: string; type: string }[];
}> {
  const workspace = mkdtempSync(join(tmpdir(), "theta-loadpath-"));
  const thetaDir = join(workspace, ".pi", "theta");
  mkdirSync(thetaDir, { recursive: true });
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(join(thetaDir, name), text, "utf8");
  }
  const recorder: LoadRecorder = { toasts: [] };
  const stderrSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((): boolean => true);
  try {
    const thetas = await discoverAndComposeFixtures(loadPi(), loadCtx(workspace, recorder));
    return {
      registered: thetas.map((t) => t.slashName),
      stderr: stderrSpy.mock.calls.map((c) => String(c[0])).join(""),
      toasts: recorder.toasts,
    };
  } finally {
    stderrSpy.mockRestore();
    rmSync(workspace, { recursive: true, force: true });
  }
}

describe("the load path's reach over a typed invoke of an empty-tail callee", () => {
  it("A: cross-file — `invoke<R>(\"./child.theta\")` against an empty-tail callee draws NO load/parse diagnostic and both thetas register (the runtime AJV net is the only guard)", async () => {
    const outcome = await loadCorpus({
      "caller.theta": TYPED_INVOKE_CALLER,
      "child.theta": EMPTY_TAIL_CALLEE,
    });

    // Both register: the caller is not un-registered, so nothing convicted it.
    expect(outcome.registered).toContain("caller");
    expect(outcome.registered).toContain("child");
    expect(outcome.stderr).not.toMatch(/theta\/parse\/invoke-return-type-mismatch/);
    // No theta/* diagnostic of ANY code reaches either surface for this corpus —
    // the assertion is on the whole channel, so a future cross-file return check
    // reddens this cell (at which point it flips to the load-gate cell the
    // investigation was looking for).
    expect(outcome.stderr).not.toMatch(/theta\//);
    expect(outcome.toasts).toEqual([]);
  });

  it("B: in-file — the same relation at a `subagent fn` return annotation FIRES theta/parse/invoke-return-type-mismatch and un-registers the theta (so cell A is a reach limit, not a dead probe)", async () => {
    const outcome = await loadCorpus({ "ctl.theta": IN_FILE_SUBAGENT_FN });

    expect(outcome.registered).not.toContain("ctl");
    expect(outcome.stderr).toMatch(/theta\/parse\/invoke-return-type-mismatch/);
    expect(
      outcome.toasts.some((t) =>
        /invoke<Schema> annotation incompatible with callee 'f' return type string/.test(
          t.message,
        ),
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// C-E — the runtime net: an `Ok(null)` envelope under `invoke<TreeFixReport>`.
// ---------------------------------------------------------------------------

/** The orchestrator's own call site, annotation and all, parsed from real source. */
const ORCHESTRATOR_SRC = [
  "---",
  "description: the per-tree fixer dispatch",
  "mode: prompt",
  "---",
  "schema TreeFixReport { ok: boolean, sha: string, fixed_confirmed: array<string>, notes: string }",
  'invoke<TreeFixReport>("./workers/fix-cluster-tree.theta")',
  "",
].join("\n");

const WRAPPER_PATH = "./workers/fix-cluster-tree.theta";

/** A conforming report — the shape the wrapper's bound-then-tail return produces. */
const CONFORMING_REPORT = {
  ok: true,
  sha: "abc1234",
  fixed_confirmed: ["Q-0001"],
  notes: "gate green, review confirmed Q-0001 on attempt 1",
} as const;

/**
 * Poll until `fn` yields a value, failing loudly on the unmet precondition
 * rather than hanging (the `tests/b0409-*` idiom).
 */
async function waitFor<T>(fn: () => T | undefined, label: string, budgetMs = 5000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = fn();
    if (value !== undefined) {
      return value;
    }
    if (Date.now() - start > budgetMs) {
      throw new Error(`harness precondition never met within ${budgetMs}ms: ${label}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

/** The production AJV validator — the seam `#validateInvokeReturn` compiles against. */
function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}

/**
 * The runtime root the drive reads: the checkpoint/id seams the invoke path
 * needs, a real `Clock`-shaped double (the subagent leg reads `now`/timers for
 * its teardown budget), and the production schema validator.
 */
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    clock: {
      now: (): number => Date.now(),
      wallNow: (): number => Date.now(),
      setTimeout: (fn: () => void, ms: number): unknown => setTimeout(fn, ms),
      clearTimeout: (handle: unknown): void =>
        clearTimeout(handle as ReturnType<typeof setTimeout>),
    },
    schemaValidator: ajv(),
  } as unknown as RuntimeRoot;
}

/**
 * Drive the parsed orchestrator body through the real producer against a
 * subagent-mode wrapper whose child answers `Ok(<value>)`, and return the typed
 * invoke's crossing `Result`.
 */
async function driveWrapperReturning(value: unknown): Promise<ResultValue> {
  const launcher = makeFakeJsonChildLauncher();
  const doc = parseDoc(ORCHESTRATOR_SRC, "/thetadir/quality-loop.theta");
  expect(
    doc.diagnostics.filter((d) => d.severity === "error"),
    "harness precondition unmet: the orchestrator fixture must parse clean, or the cell " +
      "would witness a parse fault instead of the return boundary",
  ).toEqual([]);

  const wrapper: Pick<ThetaCompositionInput, "sourcePath" | "frontmatter" | "body"> = {
    sourcePath: "/thetadir/workers/fix-cluster-tree.theta",
    frontmatter: { mode: "subagent" } as ThetaCompositionInput["frontmatter"],
    // The callee body is irrelevant to this leg: a subagent callee's body runs
    // in the CHILD process, so what crosses is exactly the scripted envelope.
    body: { statements: [], tail: null },
  };

  const parseCallee = (
    _callerPath: string | undefined,
    calleePath: string,
  ): Promise<CalleeParseOutcome> => {
    if (calleePath !== WRAPPER_PATH) {
      return Promise.reject(
        new Error(
          `harness precondition unmet: parseCallee asked for an unknown callee literal '${calleePath}'`,
        ),
      );
    }
    return Promise.resolve({
      kind: "ok",
      input: {
        slashName: "fix-cluster-tree",
        callableSet: { entries: new Map() },
        ...wrapper,
      } as ThetaCompositionInput,
    });
  };

  const deps = createProductionProducerDeps({
    pi: {
      sendMessage: (): void => {},
      getActiveTools: (): readonly string[] => [],
      setActiveTools: (): void => {},
    } as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
    parseCallee,
    subagentSpawn: launcher.spawn,
    subagentExecutableHost: fakeExecutableHost(),
    subagentParentEnv: {},
    subagentParentPid: 4242,
  });

  const callerTheta = {
    slashName: "quality-loop",
    sourcePath: "/thetadir/quality-loop.theta",
    frontmatter: { mode: "prompt" },
    body: doc.body,
    callableSet: { entries: new Map() },
  } as unknown as ThetaCompositionInput;
  const bindInput: ConversationBindInput = {
    theta: callerTheta,
    args: "",
    ctx: {
      model: { id: "claude-test", provider: "anthropic" },
      cwd: "/repo",
      signal: undefined,
    } as unknown as ExtensionCommandContext,
  };
  const binding = deps.bindPromptConversation(bindInput);
  // The launch is EAGER: the spawn record exists before the invoke settles, so
  // the envelope is scripted once the production `drive()` has subscribed to the
  // child's stdout (the fake child does not replay a line to a late subscriber).
  const pending = executeBody(callerTheta.body, binding.executeDeps);
  const spawn = await waitFor(() => launcher.spawns[0], "the caller's typed invoke spawned a child");
  await waitFor(
    () => (spawn.child.stdoutListenerCount > 0 ? true : undefined),
    "the child's drive() subscribed to stdout",
  );
  spawn.child.emitOkEnvelope(value);
  const execution = await pending;

  const final = execution.result;
  expect(final.present && final.value !== undefined, "the caller body produced a final value").toBe(
    true,
  );
  return final.value as ResultValue;
}

describe("bug-0010-shaped abort — Ok(null) under invoke<TreeFixReport> at the runtime boundary", () => {
  it("C: an `Ok(null)` envelope (the empty-tail wrapper's final value) surfaces Err(InvokeInfraError{cause:'return_validation'}) — never a bound null the caller's `.ok` read then panics on", async () => {
    const result = await driveWrapperReturning(null);

    expect(result.ok, "a null payload under an object annotation must NOT bind as Ok").toBe(false);
    const error = (result as { readonly ok: false; readonly error: Record<string, unknown> }).error;
    expect(error["kind"], "the refusal is an InvokeInfraError").toBe("invoke_infra");
    expect(error["cause"], "with cause 'return_validation' (the return boundary)").toBe(
      "return_validation",
    );
    expect(
      error["message"],
      "and the message names the annotation the value failed against",
    ).toBe("invoke<TreeFixReport> return value failed validation");
  });

  it("D: the same drive with a CONFORMING report binds Ok — so cell C convicts the null, not the harness (both directions)", async () => {
    const result = await driveWrapperReturning(CONFORMING_REPORT);

    expect(
      result.ok,
      `a conforming TreeFixReport must cross as Ok: ${JSON.stringify(result)}`,
    ).toBe(true);
    const value = (result as { readonly ok: true; readonly value: Record<string, unknown> }).value;
    expect(value["ok"]).toBe(true);
    expect(value["sha"]).toBe("abc1234");
  });

  it("E: a partial report (the `sha` key missing) is refused the same way — the AJV net is field-level, not merely a null check", async () => {
    const { sha: _dropped, ...partial } = CONFORMING_REPORT;
    const result = await driveWrapperReturning(partial);

    expect(result.ok, "a report missing a required field must not bind as Ok").toBe(false);
    const error = (result as { readonly ok: false; readonly error: Record<string, unknown> }).error;
    expect(error["cause"]).toBe("return_validation");
  });
});
