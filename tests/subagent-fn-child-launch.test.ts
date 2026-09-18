// RFC-0012 §10 — `subagent fn` bodies run in a spawned child process.
//
// PARENT side (the production producer, offline over a fake spawn): a
// `subagent fn` call from a prompt-mode theta launches a child of the CALLING
// theta — `-p "/<slug>"`, the `fn` entry on the env control plane
// (`PI_THETA_SUBAGENT_ENTRY`), the arguments marshalled by declared parameter
// name on the PIC-60 channel, the FN-7 `with { model }` on `--provider` /
// `--model`, the INV-4 frame pushed and its depth marshalled, the
// execution-status `subagent-fn` binding, the base label `<slug>#<fn>` (the bind appends `#<id8>`), the call-site
// `with { cwd }` (Erratum B) as the child cwd — and the call evaluates to the
// value the in-process drive returned for the same envelope: a bare tail bare,
// an `Ok(x)` tail (`fn_tail: "ok"`) as `Ok(x)`, an `Err(e)` tail (`fn_tail:
// "err"`) as the bare `Err(e)`, a propagated `Err` wrapped in
// `InvokeCalleeError`, a boundary mint bare. No in-process fallback exists
// (D4): the fn body's own statements never run in the parent.
//
// CHILD side (`driveSubagentRootRegime` under a `fn` entry): the named fn is
// resolved in the theta's own environment (same-file, and imported through the
// theta's materialised imports), its arguments intaken by parameter name, its
// body run as the process-root invocation, and the envelope stamped with the
// body's tail constructor; an unknown name is the internal-error arm (mint).
//
// Spec: functions.md FN-6/FN-7/FN-9, invocation.md INV-4/INV-8,
// pi-integration-contract/subagent.md #subagent-launch-contract, PIC-58/59/60.
import { resolve as resolvePath } from "node:path";
import { describe, expect, it } from "vitest";
import type { ExtensionAPI, ExtensionCommandContext, ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { ThetaSource } from "../src/lexer/lexer";
import type { ModelReferenceMatcher, ParsedFrontmatter } from "../src/parser/frontmatter";
import { parseThetaDocument, type ParseThetaDocumentDeps, type ThetaDocument } from "../src/parser/theta-document";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type { ConversationBindInput, ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import type { ExecutionStatusBus } from "../src/extension/execution-status/types";
import { noopExecutionStatusBus } from "./helpers/execution-status-progress";
import { executeBody, type BodyExecution } from "../src/runtime/statement-executor";
import { isResultValue, type ThetaValue } from "../src/runtime/value";
import type { QueryError } from "../src/runtime/query-error";
import { parseEnvelopeLine, serializeErrEnvelope, serializeOkEnvelope, type FnTail } from "../src/runtime/subagent-envelope";
import { SUBAGENT_LAUNCH_ENTRY_ENV, SUBAGENT_INVOKE_DEPTH_ENV, type SpawnFn } from "../src/runtime/subagent-launcher";
import { SUBAGENT_PARAMS_ENV } from "../src/runtime/subagent-params";
import { SUBAGENT_ROOT_ENV_MARKER } from "../src/runtime/subagent-root-regime";
import { fakeExecutableHost, makeFakeJsonChildLauncher, type FakeJsonChild, type SpawnRecord } from "./helpers/fake-json-child";
import { childRegimeRootDouble, driveSubagentFnEntry, RecordingBus } from "./helpers/subagent-fn-child-regime";
import { SUBAGENT_CHILD_OUTCOME_CHANNEL } from "../src/runtime/subagent-placement-registry";

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}

function parse(src: string, path = "/thetadir/caller.theta"): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(`fixture must parse clean: ${errors.map((d) => d.code).join(", ")}`);
  }
  return doc;
}

function callerTheta(src: string, mode: "prompt" | "subagent" = "prompt"): ThetaCompositionInput {
  const doc = parse(src);
  return {
    slashName: "caller",
    sourcePath: "/thetadir/caller.theta",
    frontmatter: { ...(doc.frontmatter ?? {}), mode } as unknown as ParsedFrontmatter,
    body: doc.body,
    callableSet: { entries: new Map() },
  } as unknown as ThetaCompositionInput;
}

const MODELS = [
  { id: "claude-test", provider: "anthropic", api: "anthropic-messages" },
  { id: "sonnet", provider: "anthropic", api: "anthropic-messages" },
  // Bug 0479: a third identity so an enclosing-theta `model:` pin, a fn-level
  // `with { model }` override and the session model are pairwise distinct.
  { id: "claude-pinned", provider: "anthropic", api: "anthropic-messages" },
];

function ctxOf(cwd = "/work/project"): ExtensionCommandContext {
  return {
    model: MODELS[0],
    cwd,
    signal: undefined,
    sessionManager: { getEntries: () => [], getLeafId: () => undefined },
  } as unknown as ExtensionCommandContext;
}

function noopPi(): ExtensionAPI {
  return { sendMessage: (): void => {}, getAllTools: () => [] } as unknown as ExtensionAPI;
}

// ---------------------------------------------------------------------------
// Parent side
// ---------------------------------------------------------------------------

/** A scripted child reply: the raw envelope line the fake child writes, then exit 0. */
type Reply = (child: FakeJsonChild) => void;

const okLine = (value: unknown, fnTail?: FnTail): Reply => (child): void => {
  child.emitRawLine(serializeOkEnvelope(value, undefined, fnTail).replace(/\n$/, ""));
  child.crashWith(0, null);
};
const errLine = (error: QueryError, provenance: "mint" | "propagated", fnTail?: FnTail): Reply => (child): void => {
  child.emitRawLine(serializeErrEnvelope(error, provenance, fnTail).replace(/\n$/, ""));
  child.crashWith(0, null);
};

function recordingBus(): { bus: ExecutionStatusBus; bound: { id: string; mode: string }[] } {
  const bound: { id: string; mode: string }[] = [];
  const bus = noopExecutionStatusBus({
    invocationBound: (id: string, info: { mode: string }): void => {
      bound.push({ id, mode: info.mode });
    },
  });
  return { bus, bound };
}

async function driveCaller(input: {
  readonly src: string;
  readonly reply: Reply;
  readonly cwd?: string;
  readonly inboundDepth?: number;
  readonly paramBindings?: ReadonlyMap<string, ThetaValue>;
}): Promise<{ execution: BodyExecution; spawns: SpawnRecord[]; bound: { id: string; mode: string }[] }> {
  const launcher = makeFakeJsonChildLauncher();
  const spawn: SpawnFn = (execPath, args, options) => {
    const child = launcher.spawn(execPath, args, options) as FakeJsonChild;
    // A macrotask, so the reply lands after the drive has subscribed to the
    // child's stdout (a real child's first line is never synchronous either).
    setTimeout(() => input.reply(child), 0);
    return child;
  };
  const { bus, bound } = recordingBus();
  const deps = createProductionProducerDeps({
    pi: noopPi(),
    root: childRegimeRootDouble(),
    modelRegistry: { getAvailable: () => MODELS } as unknown as ModelRegistry,
    subagentSpawn: spawn,
    subagentExecutableHost: fakeExecutableHost(),
    subagentParentEnv: {},
    subagentParentPid: 4242,
    statusBus: bus,
    ...(input.inboundDepth !== undefined ? { subagentInboundInvokeDepth: input.inboundDepth } : {}),
  });
  const theta = callerTheta(input.src);
  const bindInput: ConversationBindInput = {
    theta,
    args: "",
    ctx: ctxOf(input.cwd),
    ...(input.paramBindings !== undefined ? { paramBindings: input.paramBindings } : {}),
  };
  const binding = deps.bindPromptConversation(bindInput);
  const execution = await executeBody(theta.body, binding.executeDeps);
  return { execution, spawns: launcher.spawns, bound };
}

const STEP_SRC = ["subagent fn step(x: string, n: integer) {", "  x", "}", 'step("go", 3)'].join("\n");

describe("RFC-0012 §10 — parent side: a subagent fn call is a child launch of the CALLING theta", () => {
  it("launches -p /<slug> with the fn entry on the env control plane, the args marshalled by parameter name, the depth pushed, the label and the subagent-fn status binding", async () => {
    const outcome = await driveCaller({ src: STEP_SRC, reply: okLine("go"), inboundDepth: 4 });
    expect(outcome.spawns).toHaveLength(1);
    const spawn = outcome.spawns[0]!;
    // The CALLING theta's slug — the child re-discovers and re-parses the same file.
    expect(spawn.args).toContain("/caller");
    expect(spawn.env[SUBAGENT_ROOT_ENV_MARKER]).toBe("caller");
    expect(JSON.parse(spawn.env[SUBAGENT_LAUNCH_ENTRY_ENV] as string)).toEqual({ kind: "fn", name: "step" });
    expect(JSON.parse(spawn.env[SUBAGENT_PARAMS_ENV] as string)).toEqual({ n: 3, x: "go" });
    // INV-4: the `subagent-fn` frame pushed on the inbound chain (depth 4 → 5).
    expect(spawn.env[SUBAGENT_INVOKE_DEPTH_ENV]).toBe("5");
    expect(outcome.bound.map((b) => b.mode)).toEqual(["prompt", "subagent-fn"]);
    // The caller's own model rides the launch when the fn carries no override.
    expect(spawn.args).toContain("claude-test");
    // FN-6: the bare tail is the call's value; the caller body's tail is that value.
    expect(outcome.execution.outcome).toBe("success");
    expect(outcome.execution.result.value).toBe("go");
  });

  it("FN-7: a declaration-site `with { model }` override rides --model; the child cwd is the caller's ctx.cwd", async () => {
    const src = ["subagent fn step(x: string) with { model: \"sonnet\" } {", "  x", "}", 'step("a")'].join("\n");
    const outcome = await driveCaller({ src, reply: okLine("a"), cwd: "/work/project" });
    const spawn = outcome.spawns[0]!;
    expect(spawn.args).toContain("sonnet");
    expect(spawn.args).not.toContain("claude-test");
    expect(spawn.cwd).toBe("/work/project");
  });

  it("bug 0479 / FN-7 collision: an enclosing `model:` pin AND a declaration-site `with { model }` override — the OVERRIDE rides --model (the clause replaces the inherited value)", async () => {
    const src = [
      "---",
      'model: "anthropic/claude-pinned"',
      "mode: prompt",
      "---",
      'subagent fn step(x: string) with { model: "sonnet" } {',
      "  x",
      "}",
      'step("a")',
    ].join("\n");
    const outcome = await driveCaller({ src, reply: okLine("a"), cwd: "/work/project" });
    const spawn = outcome.spawns[0]!;
    const modelFlag = spawn.args[spawn.args.indexOf("--model") + 1];
    expect(modelFlag, `argv: ${JSON.stringify(spawn.args)}`).toBe("sonnet");
    expect(spawn.args).not.toContain("claude-pinned");
    expect(spawn.args).not.toContain("claude-test");
  });

  it("bug 0479: an enclosing `model:` pin with NO fn override rides --model — the theta's model, never the session's", async () => {
    const src = ["---", 'model: "anthropic/claude-pinned"', "mode: prompt", "---", "subagent fn step(x: string) {", "  x", "}", 'step("a")'].join("\n");
    const outcome = await driveCaller({ src, reply: okLine("a"), cwd: "/work/project" });
    const spawn = outcome.spawns[0]!;
    expect(spawn.args[spawn.args.indexOf("--model") + 1]).toBe("claude-pinned");
    expect(spawn.args).not.toContain("claude-test");
  });

  it("RFC 0009 Erratum B: a call-site `with { cwd }` on a subagent fn call is the child's working directory, resolved against ctx.cwd", async () => {
    const src = ["subagent fn step(x: string) {", "  x", "}", 'step("a") with { cwd: "sub/tree" }'].join("\n");
    const outcome = await driveCaller({ src, reply: okLine("a"), cwd: "/work/project" });
    expect(outcome.spawns).toHaveLength(1);
    expect(outcome.spawns[0]!.cwd).toBe(resolvePath("/work/project", "sub/tree"));
    expect(outcome.execution.result.value).toBe("a");
  });

  it("an `Ok(x)` tail (fn_tail: ok) evaluates to the Result Ok(x); an `Err(e)` tail (fn_tail: err) to the BARE Err(e) — the in-process values", async () => {
    const okOutcome = await driveCaller({ src: STEP_SRC, reply: okLine(7, "ok") });
    const okValue = okOutcome.execution.result.value as ThetaValue;
    expect(isResultValue(okValue)).toBe(true);
    expect((okValue as { ok: boolean; value: unknown }).ok).toBe(true);
    expect((okValue as { value: unknown }).value).toBe(7);

    const tailErr: QueryError = { kind: "validation", cause: "schema_validation", message: "tail err", attempts: 0, validation_errors: [], raw_response: null } as unknown as QueryError;
    const errOutcome = await driveCaller({ src: STEP_SRC, reply: errLine(tailErr, "propagated", "err") });
    const errValue = errOutcome.execution.result.value as ThetaValue;
    expect(isResultValue(errValue)).toBe(true);
    const err = errValue as unknown as { ok: boolean; error: { kind: string } };
    expect(err.ok).toBe(false);
    // Bare — NOT wrapped in InvokeCalleeError.
    expect(err.error.kind).toBe("validation");
  });

  it("a `?`-propagated Err (propagated, no fn_tail) wraps as InvokeCalleeError naming the fn; a boundary mint stays bare", async () => {
    const propagated: QueryError = { kind: "validation", cause: "schema_validation", message: "inner", attempts: 0, validation_errors: [], raw_response: null } as unknown as QueryError;
    const wrapped = await driveCaller({ src: STEP_SRC, reply: errLine(propagated, "propagated") });
    const w = wrapped.execution.result.value as unknown as { ok: boolean; error: { kind: string; callee_path: string; inner: { kind: string } } };
    expect(w.ok).toBe(false);
    expect(w.error.kind).toBe("invoke_callee");
    expect(w.error.callee_path).toBe("step");
    expect(w.error.inner.kind).toBe("validation");

    const minted: QueryError = { kind: "invoke_infra", message: "internal error: boom", callee_path: "step", cause: "internal_error" } as unknown as QueryError;
    const bare = await driveCaller({ src: STEP_SRC, reply: errLine(minted, "mint") });
    const b = bare.execution.result.value as unknown as { ok: boolean; error: { kind: string; cause: string } };
    expect(b.ok).toBe(false);
    expect(b.error.kind).toBe("invoke_infra");
    expect(b.error.cause).toBe("internal_error");
  });

  it("a non-string / empty call-site cwd is the boundary-minted validation Err — no child is launched", async () => {
    const src = ["subagent fn step(x: string) {", "  x", "}", 'step("a") with { cwd: "" }'].join("\n");
    const outcome = await driveCaller({ src, reply: okLine("a") });
    expect(outcome.spawns).toHaveLength(0);
    const v = outcome.execution.result.value as unknown as { ok: boolean; error: { kind: string; cause: string; message: string } };
    expect(v.ok).toBe(false);
    expect(v.error.kind).toBe("invoke_infra");
    expect(v.error.cause).toBe("validation");
    expect(v.error.message).toContain("with-clause cwd is empty");
  });

  it("D4: the fn body's own statements never run in the parent — the body's effect would have thrown here, and the call still settles on the child's envelope", async () => {
    // The body's `@` query would drive a live turn against this harness's
    // bare `pi` / `ctx` fakes and surface a defect had it run in-process. The
    // child's envelope alone decides the call.
    const src = ["subagent fn step(x: string) {", "  let r = @`Do ${x}`?", "  r", "}", 'step("a")'].join("\n");
    const outcome = await driveCaller({ src, reply: okLine("from-child") });
    expect(outcome.spawns).toHaveLength(1);
    expect(outcome.execution.outcome).toBe("success");
    expect(outcome.execution.result.value).toBe("from-child");
  });
});

// ---------------------------------------------------------------------------
// Child side
// ---------------------------------------------------------------------------

async function driveChild(input: {
  readonly src: string;
  readonly fnName: string;
  readonly params: Record<string, unknown> | undefined;
  readonly imports?: ThetaCompositionInput["imports"];
}): Promise<string[]> {
  const theta = callerTheta(input.src, "prompt");
  const withImports = input.imports !== undefined ? ({ ...theta, imports: input.imports } as ThetaCompositionInput) : theta;
  const outcome = await driveSubagentFnEntry({
    theta: withImports,
    slug: "caller",
    fnName: input.fnName,
    params: input.params,
    ctx: ctxOf(),
    modelRegistry: { getAvailable: () => MODELS } as unknown as ModelRegistry,
    pi: noopPi(),
  });
  return [...outcome.lines];
}

describe("bug 0479 — child side: PIC-62 obligation 2 confirms the marshalled model against the INTENDED pin", () => {
  const PINNED_WITH_OVERRIDE = [
    "---",
    'model: "anthropic/claude-pinned"',
    "mode: prompt",
    "---",
    'subagent fn step(x: string) with { model: "sonnet" } {',
    "  x",
    "}",
    'step("a")',
  ].join("\n");
  const PINNED_NO_OVERRIDE = ["---", 'model: "anthropic/claude-pinned"', "mode: prompt", "---", "subagent fn step(x: string) {", "  x", "}", 'step("a")'].join("\n");

  async function driveChildOnModel(src: string, model: (typeof MODELS)[number]): Promise<ReturnType<typeof parseEnvelopeLine>> {
    const outcome = await driveSubagentFnEntry({
      theta: callerTheta(src, "prompt"),
      slug: "caller",
      fnName: "step",
      params: { x: "a" },
      // The marshalled model IS the child's `ctx.model` (`--provider/--model`).
      ctx: { ...ctxOf(), model } as unknown as ExtensionCommandContext,
      modelRegistry: { getAvailable: () => MODELS } as unknown as ModelRegistry,
      pi: noopPi(),
    });
    return outcome.envelope;
  }

  it("a fn `with { model }` override marshalled by a compliant parent is confirmed (the intended model is the OVERRIDE, not the enclosing pin)", async () => {
    const envelope = await driveChildOnModel(PINNED_WITH_OVERRIDE, MODELS[1]!);
    expect(envelope).toEqual({ kind: "ok", value: "a" });
  });

  it("the enclosing pin marshalled by a compliant parent is confirmed", async () => {
    const envelope = await driveChildOnModel(PINNED_NO_OVERRIDE, MODELS[2]!);
    expect(envelope).toEqual({ kind: "ok", value: "a" });
  });

  it("a STALE parent that marshalled its session model for a pinned theta is refused with subagent-model-preflight-mismatch naming the pin", async () => {
    const envelope = await driveChildOnModel(PINNED_NO_OVERRIDE, MODELS[0]!);
    expect(envelope.kind).toBe("err");
    if (envelope.kind === "err") {
      const error = envelope.error as { kind: string; cause?: string; message?: string };
      expect(error.kind).toBe("invoke_infra");
      expect(error.cause).toBe("subagent_model_preflight_mismatch");
      expect(error.message ?? "").toContain("anthropic/claude-pinned");
      expect(error.message ?? "").toContain("anthropic/claude-test");
    }
  });
});

describe("RFC-0012 §10 — child side: the fn entry runs the named subagent fn as the process-root invocation", () => {
  it("resolves the same-file fn, binds the marshalled args by name, runs the body and emits the bare final value", async () => {
    const lines = await driveChild({ src: STEP_SRC, fnName: "step", params: { x: "hello", n: 2 } });
    expect(lines).toHaveLength(1);
    const parsed = parseEnvelopeLine(lines[0]!.trimEnd());
    expect(parsed).toEqual({ kind: "ok", value: "hello" });
  });

  it("an `Ok(x)` tail stamps fn_tail: ok; an `Err(e)` tail stamps fn_tail: err with the propagated provenance", async () => {
    const okSrc = ["subagent fn step(n: integer) {", "  Ok(n)", "}", "step(1)"].join("\n");
    const okLines = await driveChild({ src: okSrc, fnName: "step", params: { n: 5 } });
    expect(parseEnvelopeLine(okLines[0]!.trimEnd())).toEqual({ kind: "ok", value: 5, fnTail: "ok" });

    const errSrc = ["subagent fn step(n: integer) {", '  Err("nope")', "}", "step(1)"].join("\n");
    const errLines = await driveChild({ src: errSrc, fnName: "step", params: { n: 5 } });
    const parsed = parseEnvelopeLine(errLines[0]!.trimEnd());
    expect(parsed.kind).toBe("err");
    if (parsed.kind === "err") {
      expect(parsed.error).toBe("nope");
      expect(parsed.provenance).toBe("propagated");
      expect(parsed.fnTail).toBe("err");
    }
  });

  it("a `?`-propagated Err is the propagated arm with NO fn_tail (the parent wraps it)", async () => {
    const src = ["subagent fn step(n: integer) {", '  let v = Err("inner")?', "  v", "}", "step(1)"].join("\n");
    const lines = await driveChild({ src, fnName: "step", params: { n: 1 } });
    const parsed = parseEnvelopeLine(lines[0]!.trimEnd());
    expect(parsed.kind).toBe("err");
    if (parsed.kind === "err") {
      expect(parsed.provenance).toBe("propagated");
      expect(parsed.fnTail).toBeUndefined();
    }
  });

  it("an unknown fn name is the internal-error arm, minted (a parent/child parse divergence)", async () => {
    const lines = await driveChild({ src: STEP_SRC, fnName: "ghost", params: { x: "a", n: 1 } });
    const parsed = parseEnvelopeLine(lines[0]!.trimEnd());
    expect(parsed.kind).toBe("err");
    if (parsed.kind === "err") {
      expect(parsed.provenance).toBe("mint");
      const error = parsed.error as unknown as { kind: string; cause: string; message: string };
      expect(error.kind).toBe("invoke_infra");
      expect(error.cause).toBe("internal_error");
      expect(error.message).toContain("subagent fn 'ghost' is not declared by 'caller'");
    }
  });

  it("a plain (non-subagent) fn of the same name is NOT an entry (the divergence arm); missing / extra / mistyped args refuse as the PIC-60 validation arm", async () => {
    const plain = ["fn step(x: string) {", "  x", "}", 'step("a")'].join("\n");
    const notSubagent = parseEnvelopeLine((await driveChild({ src: plain, fnName: "step", params: { x: "a" } }))[0]!.trimEnd());
    expect(notSubagent.kind === "err" && (notSubagent.error as unknown as { cause: string }).cause).toBe("internal_error");

    for (const params of [{ x: "a" }, { x: "a", n: 1, extra: true }, { x: "a", n: "not-an-integer" }]) {
      const lines = await driveChild({ src: STEP_SRC, fnName: "step", params });
      const parsed = parseEnvelopeLine(lines[0]!.trimEnd());
      expect(parsed.kind).toBe("err");
      if (parsed.kind === "err") {
        expect(parsed.provenance).toBe("mint");
        expect((parsed.error as unknown as { cause: string }).cause).toBe("validation");
      }
    }
  });

  it('M9: a bare-tail fn entry emits one "ok" outcome event and an ok envelope with its tail value', async () => {
    const bus = new RecordingBus();
    const outcome = await driveSubagentFnEntry({
      theta: callerTheta(STEP_SRC, "prompt"),
      slug: "caller",
      fnName: "step",
      params: { x: "hello", n: 2 },
      ctx: ctxOf(),
      modelRegistry: { getAvailable: () => MODELS } as unknown as ModelRegistry,
      pi: noopPi(),
      outcomeEvents: bus,
    });
    expect(outcome.envelope).toEqual({ kind: "ok", value: "hello" });
    expect(outcome.outcomeEmissions).toHaveLength(1);
    expect(outcome.outcomeEmissions[0]!.channel).toBe(SUBAGENT_CHILD_OUTCOME_CHANNEL);
    expect(outcome.outcomeEmissions[0]!.data).toEqual({ apiVersion: 1, outcome: "ok", slug: "caller" });
  });

  it('M10: an Err(e)-tail fn entry, a `?`-propagated Err, and an unknown fn name each emit exactly one "err" outcome event', async () => {
    const errSrc = ["subagent fn step(n: integer) {", '  Err("nope")', "}", "step(1)"].join("\n");
    const busErrTail = new RecordingBus();
    const errTailOutcome = await driveSubagentFnEntry({
      theta: callerTheta(errSrc, "prompt"),
      slug: "caller",
      fnName: "step",
      params: { n: 5 },
      ctx: ctxOf(),
      modelRegistry: { getAvailable: () => MODELS } as unknown as ModelRegistry,
      pi: noopPi(),
      outcomeEvents: busErrTail,
    });
    expect(errTailOutcome.envelope.kind).toBe("err");
    expect(busErrTail.emitted).toHaveLength(1);
    expect(busErrTail.emitted[0]!.data).toEqual({ apiVersion: 1, outcome: "err", slug: "caller" });

    const propagatedSrc = ["subagent fn step(n: integer) {", '  let v = Err("inner")?', "  v", "}", "step(1)"].join("\n");
    const busPropagated = new RecordingBus();
    const propagatedOutcome = await driveSubagentFnEntry({
      theta: callerTheta(propagatedSrc, "prompt"),
      slug: "caller",
      fnName: "step",
      params: { n: 1 },
      ctx: ctxOf(),
      modelRegistry: { getAvailable: () => MODELS } as unknown as ModelRegistry,
      pi: noopPi(),
      outcomeEvents: busPropagated,
    });
    expect(propagatedOutcome.envelope.kind).toBe("err");
    expect(busPropagated.emitted).toHaveLength(1);
    expect(busPropagated.emitted[0]!.data).toEqual({ apiVersion: 1, outcome: "err", slug: "caller" });

    const busUnknown = new RecordingBus();
    const unknownOutcome = await driveSubagentFnEntry({
      theta: callerTheta(STEP_SRC, "prompt"),
      slug: "caller",
      fnName: "ghost",
      params: { x: "a", n: 1 },
      ctx: ctxOf(),
      modelRegistry: { getAvailable: () => MODELS } as unknown as ModelRegistry,
      pi: noopPi(),
      outcomeEvents: busUnknown,
    });
    expect(unknownOutcome.envelope.kind).toBe("err");
    expect(busUnknown.emitted).toHaveLength(1);
    expect(busUnknown.emitted[0]!.data).toEqual({ apiVersion: 1, outcome: "err", slug: "caller" });
  });

  it("FN-9: an imported .thetalib subagent fn resolves through the theta's materialised imports and runs against the declaring module", async () => {
    // A `.thetalib` exports its top-level declarations by name (imports.md);
    // `helper` is a top-level `subagent fn` an importer names.
    const libDoc = parse(["subagent fn helper(x: string) {", "  x", "}", ""].join("\n"), "/thetadir/lib.thetalib");
    const helper = libDoc.body.statements.find((s) => s.kind === "fn");
    if (helper === undefined || helper.kind !== "fn") {
      throw new Error("fixture: the lib must declare `helper`");
    }
    const src = ['import { helper } from "./lib.thetalib"', 'helper("a")'].join("\n");
    const lines = await driveChild({
      src,
      fnName: "helper",
      params: { x: "from-lib" },
      imports: [
        {
          name: "helper",
          kind: "fn",
          fn: helper,
          moduleScope: { body: libDoc.body, imports: [], enums: [], residence: "/thetadir/lib.thetalib" },
        },
      ] as unknown as ThetaCompositionInput["imports"],
    });
    expect(parseEnvelopeLine(lines[0]!.trimEnd())).toEqual({ kind: "ok", value: "from-lib" });
  });
});
