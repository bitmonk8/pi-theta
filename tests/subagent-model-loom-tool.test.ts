// SUBAG-2 (model-callable `.loom`) — the model-driven `.loom`-callable dispatch.
//
// Wires the residual SUBAG-2 gap: a subagent-mode loom that lists another
// `.loom` in its `tools:` now exposes that callable TO THE MODEL, not only to
// code-driven `<name>(args)`. This file pins both halves of the fix:
//
//   (A) the extracted, deterministic model-driven core `lowerModelDrivenLoomCall`
//       — the object-arg → positional mapping in `params:` DECLARATION ORDER,
//       the ceiling-#4 model-arg depth block (before any spawn), the `Result`
//       lowering (Ok → text, Err → `isError`), the tool-calls.md:30 setup-throw
//       translation, the `HostFatal` re-raise (NOCEIL-3), and re-entrancy
//       (two concurrent calls dispatch through independent collaborators);
//   (B) the integration surface through the REAL `spawnSubagentConversation`
//       (SDK spawn mocked): the `.loom` is installed as a `defineTool`
//       `customTool` + allowlisted in `tools` on `createAgentSession`
//       (tool-registration-lifetime.md §"Subagent mode"), it appears in the
//       loom-owned `complete()` loop's `tools` (the model-facing tool schemas),
//       and a model `tool_use` for it drives the callee through `#driveCallee`
//       (a fresh child `AgentSession` spawns).
//
// Spec: tool-calls.md (SHARED callable set; §Concurrency; :30 setup-throw),
// pi-integration-contract/extension-bootstrap-and-per-loom.md §Per-loom
// registration, tool-registration-lifetime.md §"Subagent mode",
// hard-ceilings ceiling #4 (model-driven row).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- (B) SDK spawn surface: mock only the spawn seam (spread the rest) -------
const sdkHook = vi.hoisted(() => ({
  sessions: [] as { customTools: unknown; tools: unknown }[],
}));
vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@earendil-works/pi-coding-agent")>();
  class FakeResourceLoader {
    constructor(_opts: unknown) {}
    reload(): Promise<void> {
      return Promise.resolve();
    }
    getSystemPrompt(): string {
      return "";
    }
    getAppendSystemPrompt(): string[] {
      return [];
    }
  }
  return {
    ...actual,
    getAgentDir: (): string => "/agent",
    DefaultResourceLoader: FakeResourceLoader,
    SessionManager: { inMemory: (): object => ({}) },
    createAgentSession: (opts: {
      customTools: unknown;
      tools: unknown;
    }): Promise<{ session: unknown }> => {
      sdkHook.sessions.push({ customTools: opts.customTools, tools: opts.tools });
      return Promise.resolve({
        session: {
          abort: (): Promise<void> => Promise.resolve(),
          dispose: (): void => {},
        },
      });
    },
  };
});

// --- (B) pi-ai `complete`: script the parent's turns, capture the tools -------
const aiHook = vi.hoisted(() => ({
  toolsSeen: [] as unknown[],
  // The full `context.messages` captured per `complete()` turn (Gap-1: the
  // tool-result turn fed back after a `.loom` call rides on the NEXT turn's
  // messages).
  messagesSeen: [] as unknown[],
  replies: [] as unknown[],
  calls: 0,
}));
vi.mock("@earendil-works/pi-ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@earendil-works/pi-ai")>();
  return {
    ...actual,
    complete: (
      _model: unknown,
      context: { tools?: unknown; messages?: unknown },
      _options: unknown,
    ): Promise<unknown> => {
      aiHook.toolsSeen.push(context.tools);
      aiHook.messagesSeen.push(context.messages);
      const reply = aiHook.replies[aiHook.calls] ?? aiHook.replies[aiHook.replies.length - 1];
      aiHook.calls += 1;
      return Promise.resolve(reply);
    },
  };
});

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import {
  createProductionProducerDeps,
  lowerModelDrivenLoomCall,
  type ModelDrivenLoomCall,
} from "../src/extension/production-loom-producer";
import type {
  ConversationBindInput,
  LoomCompositionInput,
  LoomProducerDeps,
} from "../src/extension/loom-composition-producer";
import { executeBody } from "../src/runtime/statement-executor";
import { parseExpressionSource } from "../src/parser/loom-document";
import { makeErr, makeOk, type LoomValue, type ResultValue } from "../src/runtime/value";
import { HostFatal } from "../src/runtime/runtime-panics";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint, CheckpointKind, CheckpointSite } from "../src/seams/checkpoint";
import type { CallableSetSnapshot } from "../src/parser/callable-set";
import type { LoomBody } from "../src/parser/loom-document";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";

// =============================================================================
// (A) The deterministic model-driven core — scripted collaborators, no SDK.
// =============================================================================

/** A `ModelDrivenLoomCall` recording the positional `argValues` it was driven with. */
function recordingSpec(
  paramOrder: readonly string[],
  drive: (argValues: readonly LoomValue[]) => Promise<ResultValue>,
): { spec: ModelDrivenLoomCall; driven: { argValues: readonly LoomValue[] }[]; setupThrows: unknown[] } {
  const driven: { argValues: readonly LoomValue[] }[] = [];
  const setupThrows: unknown[] = [];
  const spec: ModelDrivenLoomCall = {
    paramOrder,
    driveCallee: (argValues) => {
      driven.push({ argValues });
      return drive(argValues);
    },
    onSetupThrow: (thrown) => {
      setupThrows.push(thrown);
      const message = (thrown as { message?: unknown }).message;
      return {
        text: `loom callee aborted with internal error: ${String(message)}`,
        isError: true,
      };
    },
  };
  return { spec, driven, setupThrows };
}

describe("SUBAG-2 (A) — lowerModelDrivenLoomCall model-driven core", () => {
  const signal = new AbortController().signal;

  it("maps the model's object arguments to positional argValues in params DECLARATION ORDER (Ok → text)", async () => {
    const { spec, driven } = recordingSpec(["first", "second", "third"], () =>
      Promise.resolve(makeOk("DONE")),
    );
    // The model emits the fields in a DIFFERENT order than declared.
    const lowered = await lowerModelDrivenLoomCall(
      { third: "C", first: "A", second: "B" },
      spec,
      signal,
    );
    expect(driven).toHaveLength(1);
    expect(driven[0]!.argValues).toEqual(["A", "B", "C"]);
    expect(lowered).toEqual({ text: "DONE", isError: false });
  });

  it("binds a missing model argument to null (declaration order preserved)", async () => {
    const { spec, driven } = recordingSpec(["a", "b"], () => Promise.resolve(makeOk("X")));
    await lowerModelDrivenLoomCall({ a: "A" }, spec, signal);
    expect(driven[0]!.argValues).toEqual(["A", null]);
  });

  it("lowers an Ok(non-string) value to its JSON form", async () => {
    const { spec } = recordingSpec(["p"], () => Promise.resolve(makeOk({ k: 1, v: [true] })));
    const lowered = await lowerModelDrivenLoomCall({ p: 0 }, spec, signal);
    expect(lowered).toEqual({ text: '{"k":1,"v":[true]}', isError: false });
  });

  it("lowers an Err(Result) to an isError tool-result carrying the error message", async () => {
    const err = makeErr({ kind: "invoke_callee", message: "callee said no" } as unknown as LoomValue);
    const { spec } = recordingSpec(["p"], () => Promise.resolve(err));
    const lowered = await lowerModelDrivenLoomCall({ p: 1 }, spec, signal);
    expect(lowered.isError).toBe(true);
    expect(lowered.text).toBe("callee said no");
  });

  it("blocks a depth-6 model argument by ceiling #4 BEFORE the callee spawns", async () => {
    const { spec, driven } = recordingSpec(["deep"], () => Promise.resolve(makeOk("never")));
    // `{ deep: { a: { b: { c: { d: { e: 1 } } } } } }` — the argument document is
    // depth 6 (object → deep → a → b → c → d), exceeding the ≤5 cap.
    const depth6 = { deep: { a: { b: { c: { d: { e: 1 } } } } } };
    const lowered = await lowerModelDrivenLoomCall(depth6, spec, signal);
    expect(lowered.isError).toBe(true);
    expect(lowered.text).toContain("depth");
    // CIO-3: the callee is NEVER driven on a depth breach.
    expect(driven).toHaveLength(0);
  });

  it("translates a non-HostFatal setup/body throw via onSetupThrow (isError, callee never re-raised)", async () => {
    const { spec, setupThrows } = recordingSpec(["p"], () =>
      Promise.reject(new Error("spawn setup exploded")),
    );
    const lowered = await lowerModelDrivenLoomCall({ p: 1 }, spec, signal);
    expect(setupThrows).toHaveLength(1);
    expect((setupThrows[0] as Error).message).toBe("spawn setup exploded");
    expect(lowered.isError).toBe(true);
    expect(lowered.text).toContain("internal error: spawn setup exploded");
  });

  it("re-raises a HostFatal (NOCEIL-3) and does NOT route it through onSetupThrow", async () => {
    const { spec, setupThrows } = recordingSpec(["p"], () =>
      Promise.reject(new HostFatal("fatal host condition")),
    );
    await expect(lowerModelDrivenLoomCall({ p: 1 }, spec, signal)).rejects.toBeInstanceOf(
      HostFatal,
    );
    expect(setupThrows).toHaveLength(0);
  });

  it("is re-entrant: two concurrent calls dispatch through independent collaborators without cross-talk", async () => {
    // Each call resolves its own callee value after a microtask hop, so the two
    // are genuinely interleaved on the event loop.
    const specA = recordingSpec(["x"], (args) =>
      Promise.resolve().then(() => makeOk(`A:${String(args[0])}`)),
    );
    const specB = recordingSpec(["x"], (args) =>
      Promise.resolve().then(() => makeOk(`B:${String(args[0])}`)),
    );
    const [a, b] = await Promise.all([
      lowerModelDrivenLoomCall({ x: "1" }, specA.spec, signal),
      lowerModelDrivenLoomCall({ x: "2" }, specB.spec, signal),
    ]);
    expect(a).toEqual({ text: "A:1", isError: false });
    expect(b).toEqual({ text: "B:2", isError: false });
    expect(specA.driven[0]!.argValues).toEqual(["1"]);
    expect(specB.driven[0]!.argValues).toEqual(["2"]);
  });
});

// =============================================================================
// (B) Integration through the REAL spawnSubagentConversation (SDK mocked).
// =============================================================================

class RecordingCheckpoint implements Checkpoint {
  before(_kind: CheckpointKind, _site: CheckpointSite): Promise<void> {
    return Promise.resolve();
  }
}

function rootDouble(checkpoint?: Checkpoint): RuntimeRoot {
  return {
    checkpoint: checkpoint ?? new RecordingCheckpoint(),
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    clock: { wallNow: () => 0 },
  } as unknown as RuntimeRoot;
}

function noopPi(): ExtensionAPI {
  return { sendMessage: (): void => {} } as unknown as ExtensionAPI;
}

const USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function textReply(text: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "claude-test",
    usage: USAGE,
    stopReason: "stop",
    timestamp: 0,
  };
}

function toolCallReply(name: string, id: string, args: Record<string, unknown>): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "toolCall", id, name, arguments: args }],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "claude-test",
    usage: USAGE,
    stopReason: "toolUse",
    timestamp: 0,
  };
}

/**
 * A parent subagent loom whose callable set exposes one `.loom` callee. Defaults
 * to a bare-basename `child` → `./child.loom`; pass `presentedName` / `calleePath`
 * to model a renamed (`as foo`) or hyphenated (`./my-tool.loom` → `my_tool`)
 * entry (Gap-2). The frozen entry carries the authoritative `calleePath` exactly
 * as `resolveCallableSet` records it from the `tools:` `spec`.
 */
function parentLoom(
  body: LoomBody,
  opts?: { readonly presentedName?: string; readonly calleePath?: string },
): LoomCompositionInput {
  const presentedName = opts?.presentedName ?? "child";
  const calleePath = opts?.calleePath ?? "./child.loom";
  const entries = new Map([
    [
      presentedName,
      {
        kind: "loom" as const,
        mode: "subagent" as const,
        calleePath,
        callee: undefined,
      },
    ],
  ]);
  const callableSet: CallableSetSnapshot = { entries };
  const frontmatter = {
    mode: "subagent",
    tools: [calleePath === `./${presentedName}.loom` ? calleePath : `${calleePath} as ${presentedName}`],
  } as unknown as ParsedFrontmatter;
  return {
    slashName: "parent",
    sourcePath: "/looms/parent.loom",
    frontmatter,
    body,
    callableSet,
  } as unknown as LoomCompositionInput;
}

/**
 * The child subagent callee `parseCallee` resolves — params (a, b) + a body. The
 * default body is the literal `"CHILD-DONE"` (an `Ok` final value); pass
 * `tailSource` to inject a panicking body (Gap-1), e.g. `"[][0]"` (an index
 * out-of-bounds `LoomPanic` in the callee subtree).
 */
function childCallee(opts?: { readonly tailSource?: string }): LoomCompositionInput {
  const frontmatter = {
    mode: "subagent",
    description: "Echo child",
    params: {
      loweredSchema: {
        type: "object",
        properties: { a: { type: "string" }, b: { type: "string" } },
        required: ["a", "b"],
      },
      defaultedFields: [],
      fields: [
        { wireName: "a", type: "string", hasDefault: false },
        { wireName: "b", type: "string", hasDefault: false },
      ],
    },
  } as unknown as ParsedFrontmatter;
  return {
    slashName: "child",
    sourcePath: "/looms/child.loom",
    frontmatter,
    body: {
      statements: [],
      tail: parseExpressionSource(opts?.tailSource ?? '"CHILD-DONE"'),
    },
  } as unknown as LoomCompositionInput;
}

function queryBody(): LoomBody {
  return {
    statements: [],
    tail: {
      kind: "query",
      schema: null,
      template: "do the thing",
      range: { start: { line: 1, column: 1 }, end: { line: 1, column: 12 } },
    },
  } as unknown as LoomBody;
}

function makeParentDeps(
  parseCalleeSpy: { calls: string[] },
  opts?: {
    readonly pi?: ExtensionAPI;
    readonly checkpoint?: Checkpoint;
    readonly childTailSource?: string;
  },
): LoomProducerDeps {
  return createProductionProducerDeps({
    pi: opts?.pi ?? noopPi(),
    root: rootDouble(opts?.checkpoint),
    modelRegistry: {
      getApiKeyAndHeaders: () => Promise.resolve({ ok: false }),
    } as unknown as ModelRegistry,
    parseCallee: (_caller: string | undefined, calleePath: string) => {
      parseCalleeSpy.calls.push(calleePath);
      const childOpts =
        opts?.childTailSource !== undefined ? { tailSource: opts.childTailSource } : undefined;
      return Promise.resolve(childCallee(childOpts));
    },
  });
}

/**
 * Gap-1: a checkpoint whose `before("invoke", ...)` throws — a GENUINE
 * pre-dispatch dispatch-setup throw raised BEFORE the callee body runs (it fires
 * inside `runInvokeChild` prior to `child.drive()`). Distinguished from a
 * callee-BODY panic (which `runInvokeChild` converts to an `Err` VALUE): a
 * setup throw reaches `onSetupThrow` and gets the framed `isError` + one note.
 */
class ThrowingInvokeCheckpoint implements Checkpoint {
  constructor(private readonly make: () => unknown) {}
  before(kind: CheckpointKind, _site: CheckpointSite): Promise<void> {
    if (kind === "invoke") {
      throw this.make();
    }
    return Promise.resolve();
  }
}

/** A `pi` stub recording every `sendMessage` (Gap-1: assert note presence/absence). */
function recordingPi(): { pi: ExtensionAPI; messages: { customType?: string; content: unknown }[] } {
  const messages: { customType?: string; content: unknown }[] = [];
  const pi = {
    sendMessage: (msg: { customType?: string; content: unknown }): void => {
      messages.push(msg);
    },
  } as unknown as ExtensionAPI;
  return { pi, messages };
}

/** The loom-system-note channel a framed setup-throw note is delivered on. */
const SYSTEM_NOTE_CHANNEL = "loom-system-note";

/** The tool-result turns (role `toolResult`) fed back across every captured turn. */
function toolResultsIn(
  messagesSeen: readonly unknown[],
): { readonly isError?: boolean; readonly content: { readonly text?: string }[] }[] {
  const out: { readonly isError?: boolean; readonly content: { readonly text?: string }[] }[] = [];
  for (const messages of messagesSeen) {
    for (const m of (messages as { role?: string }[]) ?? []) {
      if ((m as { role?: string }).role === "toolResult") {
        out.push(m as { isError?: boolean; content: { text?: string }[] });
      }
    }
  }
  return out;
}

function parentBindInput(loom: LoomCompositionInput): ConversationBindInput {
  const ctx = {
    model: "claude-test",
    cwd: "/tmp",
    signal: undefined,
  } as unknown as ExtensionCommandContext;
  return { loom, args: "", ctx, loomAbort: new AbortController() };
}

describe("SUBAG-2 (B) — spawnSubagentConversation exposes the `.loom` to the model", () => {
  beforeEach(() => {
    sdkHook.sessions = [];
    aiHook.toolsSeen = [];
    aiHook.messagesSeen = [];
    aiHook.replies = [];
    aiHook.calls = 0;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("installs the `.loom` as a defineTool customTool AND allowlists it in `tools` on createAgentSession", async () => {
    const deps = makeParentDeps({ calls: [] });
    await deps.spawnSubagentConversation(parentBindInput(parentLoom(queryBody())));

    expect(sdkHook.sessions).toHaveLength(1);
    const spawned = sdkHook.sessions[0]!;
    const customToolNames = (spawned.customTools as { name: string; label: string; description: string }[]).map(
      (t) => t.name,
    );
    expect(customToolNames).toContain("child");
    // tool-registration-lifetime.md §"Subagent mode": the allowlist gates the
    // active set to exactly the callable-set names.
    expect(spawned.tools as string[]).toContain("child");
    // extension-bootstrap-and-per-loom.md §Per-loom registration: label +
    // description derivations.
    const childDef = (spawned.customTools as { name: string; label: string; description: string }[]).find(
      (t) => t.name === "child",
    )!;
    expect(childDef.label).toBe("Child");
    expect(childDef.description).toBe("Echo child");
  });

  it("presents the `.loom` in the loom-owned complete() loop's tool schemas (SHARED callable set)", async () => {
    const deps = makeParentDeps({ calls: [] });
    // One plain-text turn terminates the query immediately; we only need the
    // tools captured on that turn.
    aiHook.replies = [textReply("OK")];
    const binding = await deps.spawnSubagentConversation(parentBindInput(parentLoom(queryBody())));

    const execution = await executeBody(queryBody(), binding.executeDeps);
    expect(execution.outcome).toBe("success");

    // The FIRST completion carried the model-facing tool schemas.
    expect(aiHook.toolsSeen.length).toBeGreaterThanOrEqual(1);
    const tools = aiHook.toolsSeen[0] as { name: string }[];
    expect(tools.map((t) => t.name)).toContain("child");
  });

  it("drives a model tool_use for the `.loom` through #driveCallee — a fresh child AgentSession spawns", async () => {
    const parseCalleeSpy = { calls: [] as string[] };
    const deps = makeParentDeps(parseCalleeSpy);
    // Round 1: the model calls `child`; round 2: it terminates with text.
    aiHook.replies = [
      toolCallReply("child", "call-1", { a: "A", b: "B" }),
      textReply("FINISHED"),
    ];
    const binding = await deps.spawnSubagentConversation(parentBindInput(parentLoom(queryBody())));

    const execution = await executeBody(queryBody(), binding.executeDeps);
    expect(execution.outcome).toBe("success");

    // The model's `.loom` call routed through `#driveCallee` → `parseCallee` for
    // the child, and the child spawned its own `AgentSession` (a SECOND
    // createAgentSession beyond the parent's).
    expect(parseCalleeSpy.calls).toContain("./child.loom");
    expect(sdkHook.sessions.length).toBeGreaterThanOrEqual(2);
  });
});

// =============================================================================
// Gap-1 — a callee-BODY panic cascades as Err(InvokeInfraError{cause:"panic"})
// (plain isError, NO operator note); only a GENUINE pre-dispatch setup throw
// gets the framed isError + one loom-system-note. HostFatal re-raises.
// =============================================================================

describe("Gap-1 (B) — body-panic vs setup-throw at the model `.loom` invoke boundary", () => {
  beforeEach(() => {
    sdkHook.sessions = [];
    aiHook.toolsSeen = [];
    aiHook.messagesSeen = [];
    aiHook.replies = [];
    aiHook.calls = 0;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("a callee-BODY panic lowers as a plain isError (from Err(cause:panic)) with NO note/diagnostic", async () => {
    const rp = recordingPi();
    const parseCalleeSpy = { calls: [] as string[] };
    // The child callee's body is `[][0]` — an index-out-of-bounds `LoomPanic`
    // in the callee subtree (NOT the depth-overflow panic `.drive()` alone
    // converts). `runInvokeChild` MUST turn it into an `Err` VALUE.
    const deps = makeParentDeps(parseCalleeSpy, { pi: rp.pi, childTailSource: "[][0]" });
    aiHook.replies = [
      toolCallReply("child", "call-1", { a: "A", b: "B" }),
      textReply("FINISHED"),
    ];
    const binding = await deps.spawnSubagentConversation(parentBindInput(parentLoom(queryBody())));
    const execution = await executeBody(queryBody(), binding.executeDeps);

    // The query loop CONTINUED (the model observed the failure as a tool-result
    // and terminated with text) — a body panic is a value, not a crash.
    expect(execution.outcome).toBe("success");

    // The tool-result fed back is a PLAIN isError carrying the panic message —
    // NOT the "aborted with internal error" setup-throw framing.
    const results = toolResultsIn(aiHook.messagesSeen);
    expect(results.length).toBeGreaterThanOrEqual(1);
    const panicResult = results.find((r) => r.isError === true);
    expect(panicResult, "a body panic yields an isError tool-result").toBeDefined();
    const text = panicResult!.content[0]?.text ?? "";
    expect(text).toContain("out of bounds");
    expect(text, "a body panic is NOT framed as a pre-eval setup throw").not.toContain(
      "aborted with internal error",
    );

    // NO emitPanicNote / loom/runtime/internal-error diagnostic fired: the
    // panic-note carries `details.diagnostics` on the loom-system-note channel.
    const panicNotes = rp.messages.filter(
      (m) =>
        m.customType === SYSTEM_NOTE_CHANNEL &&
        (m as { details?: { diagnostics?: unknown } }).details?.diagnostics !== undefined,
    );
    expect(panicNotes, "a body panic emits NO framed operator note").toHaveLength(0);
  });

  it("a GENUINE pre-dispatch setup throw yields the framed isError + EXACTLY ONE loom-system-note", async () => {
    const rp = recordingPi();
    const parseCalleeSpy = { calls: [] as string[] };
    // The `invoke` checkpoint throws a non-HostFatal BEFORE `child.drive()` — a
    // genuine dispatch-setup throw the body-panic conversion never sees.
    const deps = makeParentDeps(parseCalleeSpy, {
      pi: rp.pi,
      checkpoint: new ThrowingInvokeCheckpoint(() => new Error("dispatch setup exploded")),
    });
    aiHook.replies = [
      toolCallReply("child", "call-1", { a: "A", b: "B" }),
      textReply("FINISHED"),
    ];
    const binding = await deps.spawnSubagentConversation(parentBindInput(parentLoom(queryBody())));
    const execution = await executeBody(queryBody(), binding.executeDeps);
    expect(execution.outcome).toBe("success");

    // The child body NEVER ran — the setup throw preceded `child.drive()`, so
    // no child `AgentSession` spawned (only the parent's). `parseCallee` is
    // still called ONCE at spawn to build the tool schema, but not a SECOND
    // time by `#driveCallee` (the drive never started).
    expect(sdkHook.sessions, "no child session spawns on a pre-dispatch throw").toHaveLength(1);
    expect(
      parseCalleeSpy.calls.filter((p) => p === "./child.loom"),
      "parseCallee ran once (schema build), not again for a drive that never started",
    ).toHaveLength(1);

    // The tool-result is the FRAMED isError carrying the BARE callable name.
    const framed = toolResultsIn(aiHook.messagesSeen).find((r) => r.isError === true);
    expect(framed, "a setup throw yields a framed isError tool-result").toBeDefined();
    expect(framed!.content[0]?.text ?? "").toContain("aborted with internal error");
    expect(framed!.content[0]?.text ?? "").toContain("child");

    // EXACTLY ONE framed operator note (emitPanicNote → details.diagnostics).
    const panicNotes = rp.messages.filter(
      (m) =>
        m.customType === SYSTEM_NOTE_CHANNEL &&
        (m as { details?: { diagnostics?: unknown } }).details?.diagnostics !== undefined,
    );
    expect(panicNotes, "a setup throw emits exactly one framed note").toHaveLength(1);
  });

  it("a HostFatal at the invoke boundary re-raises (NOCEIL-3) — no note, no conversion to a value", async () => {
    const rp = recordingPi();
    const parseCalleeSpy = { calls: [] as string[] };
    const deps = makeParentDeps(parseCalleeSpy, {
      pi: rp.pi,
      checkpoint: new ThrowingInvokeCheckpoint(() => new HostFatal("fatal host condition")),
    });
    aiHook.replies = [toolCallReply("child", "call-1", { a: "A", b: "B" }), textReply("UNREACHED")];
    const binding = await deps.spawnSubagentConversation(parentBindInput(parentLoom(queryBody())));

    await expect(executeBody(queryBody(), binding.executeDeps)).rejects.toBeInstanceOf(HostFatal);

    const panicNotes = rp.messages.filter(
      (m) =>
        m.customType === SYSTEM_NOTE_CHANNEL &&
        (m as { details?: { diagnostics?: unknown } }).details?.diagnostics !== undefined,
    );
    expect(panicNotes, "a HostFatal emits no framed setup-throw note").toHaveLength(0);
  });
});

// =============================================================================
// Gap-2 — a RENAMED (`as`) and a HYPHENATED (`code_review`) `.loom` callee are
// presented to the model AND dispatchable (the frozen snapshot carries the
// authoritative calleePath; the model-driven adapter no longer re-derives it
// from the basename). Mirrors the bare-basename `child` test above.
// =============================================================================

describe("Gap-2 (B) — renamed / hyphenated `.loom` callees are presented + dispatchable", () => {
  beforeEach(() => {
    sdkHook.sessions = [];
    aiHook.toolsSeen = [];
    aiHook.messagesSeen = [];
    aiHook.replies = [];
    aiHook.calls = 0;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("a RENAMED entry `./child.loom as helper` is presented as `helper` AND dispatchable to `./child.loom`", async () => {
    const parseCalleeSpy = { calls: [] as string[] };
    const deps = makeParentDeps(parseCalleeSpy);
    const loom = parentLoom(queryBody(), { presentedName: "helper", calleePath: "./child.loom" });
    aiHook.replies = [toolCallReply("helper", "call-1", { a: "A", b: "B" }), textReply("DONE")];
    const binding = await deps.spawnSubagentConversation(parentBindInput(loom));

    // Presented under the renamed name on BOTH surfaces.
    const spawned = sdkHook.sessions[0]!;
    const names = (spawned.customTools as { name: string }[]).map((t) => t.name);
    expect(names, "the renamed callable is installed as a customTool").toContain("helper");
    expect(spawned.tools as string[], "and allowlisted").toContain("helper");

    const execution = await executeBody(queryBody(), binding.executeDeps);
    expect(execution.outcome).toBe("success");
    // The model-facing tool schemas presented it, and the dispatch resolved the
    // renamed name to the REAL callee path (never dropped, never `./helper.loom`).
    expect((aiHook.toolsSeen[0] as { name: string }[]).map((t) => t.name)).toContain("helper");
    expect(parseCalleeSpy.calls).toContain("./child.loom");
    expect(parseCalleeSpy.calls).not.toContain("./helper.loom");
  });

  it("a HYPHENATED entry `./my-tool.loom` is presented as `my_tool` AND dispatchable to `./my-tool.loom`", async () => {
    const parseCalleeSpy = { calls: [] as string[] };
    const deps = makeParentDeps(parseCalleeSpy);
    const loom = parentLoom(queryBody(), { presentedName: "my_tool", calleePath: "./my-tool.loom" });
    aiHook.replies = [toolCallReply("my_tool", "call-1", { a: "A", b: "B" }), textReply("DONE")];
    const binding = await deps.spawnSubagentConversation(parentBindInput(loom));

    const spawned = sdkHook.sessions[0]!;
    expect((spawned.customTools as { name: string }[]).map((t) => t.name)).toContain("my_tool");
    expect(spawned.tools as string[]).toContain("my_tool");

    const execution = await executeBody(queryBody(), binding.executeDeps);
    expect(execution.outcome).toBe("success");
    expect((aiHook.toolsSeen[0] as { name: string }[]).map((t) => t.name)).toContain("my_tool");
    // The hyphenated real path is resolved from the snapshot, NOT the basename
    // re-derivation `./my_tool.loom`.
    expect(parseCalleeSpy.calls).toContain("./my-tool.loom");
    expect(parseCalleeSpy.calls).not.toContain("./my_tool.loom");
  });
});
