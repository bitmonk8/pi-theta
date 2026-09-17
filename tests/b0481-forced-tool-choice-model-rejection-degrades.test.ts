// Bug 0481 — a model that rejects forced `tool_choice` kills every typed query
// (and burns the binder budget) although the request is otherwise servable: the
// provider 400 ("tool_choice: type \"tool\" and \"any\" are not supported for
// this model", live-measured on anthropic/claude-fable-5-1 2026-09-17) is
// classified as a terminal transport Err, so the typed query dies AFTER its
// free phase did all the work, and a binder pass re-forces the same rejected
// option on its retry.
//
// docs/bugs/0481-typed-query-dies-on-model-level-forced-tool-choice-rejection.md.
//
// Contract under test (the fix): on a forced dispatch failing with the
// REJECTION SIGNATURE (`isForcedToolChoiceRejection` over the raw provider
// errorMessage — src/binder/forced-tool-choice.ts), the site re-issues the SAME
// request ONCE with `options.toolChoice` omitted (provider default `auto`; the
// context still carries exactly one tool and the trailing template already
// instructs the model to call it). The degraded reply flows through the
// UNCHANGED interpretation pipeline. One shot: a failure of the degraded
// dispatch is terminal for that dispatch (respond path) / feeds the normal
// attempt taxonomy (binder path, inside the SAME budgeted attempt). A
// non-matching failure never degrades.
//
// Two production sites, one fix point each:
//   - typed-query respond: `dispatchForcedRespondTurn`
//     (production-theta-producer.ts) — reached here through the REAL producer
//     (`bindPromptConversation` → `executeBody`) with a typed query at
//     `tool_loop.max_rounds: 0`, where the forced dispatch is the FIRST and
//     ONLY provider call (no free phase, no session turn — `pi.sendUserMessage`
//     throws loudly in this harness if ever touched).
//   - binder inference: `#classifyBinderAttempt` / `#completeBinderReply` —
//     reached through `deps.runBinder` (the tests/binder-forced-tool-dispatch
//     harness shape).
//
// The off-session `complete()` is the vi.mock seam (the established
// binder-forced-tool-dispatch pattern): every cell asserts the CAPTURED call
// options — `toolChoice` present on a forced dispatch, ABSENT on the degraded
// one — so the degradation is witnessed at the wire shape, not inferred.
//
// Spec: pi-integration-contract/conversation-drive.md
// §`complete()` forced-tool behavioural presupposition (the model-level
// rejection pin clarification rides the bug-0481 fix);
// query/query-tool-loop.md (two-phase shape; the `max_rounds: 0` boundary);
// query/query-failure-and-repair.md QRY-9/QRY-12 (the degraded plain-text
// reply lands in ERR-17 → respond-repair, whose fresh dispatch re-enters the
// same degradation-capable mechanism);
// binder/determinism-cancellation-failure.md §Per-invocation retry budget
// (degradation rides INSIDE one budgeted attempt; it is not a transport retry).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The scripted off-session replies. `vi.hoisted` so the `vi.mock` factory
// (hoisted above the imports) can close over the holder each cell sets.
// `replyFor` scripts the reply as a function of (call ordinal, captured call)
// so a cell can serve a rejection first and a tool call second; `calls`
// captures the full `complete(model, context, options)` triple per dispatch.
// A reply wrapped in `{ throws: Error }` makes the mock REJECT — the
// anthropic-adapter shape, whose `result()` converts an error-terminated
// stream into a THROW (pi-ai dist/api/anthropic-messages.js), so the live
// rejection arrives at the sites' catch arms on that adapter.
const scripted = vi.hoisted(() => ({
  replyFor: undefined as
    | undefined
    | ((index: number, model: unknown, context: unknown, options: unknown) => unknown),
  calls: [] as Array<{ model: unknown; context: unknown; options: unknown }>,
}));

/** Marks a scripted reply as a `complete()` REJECTION (the throw arm). */
class ThrownReply {
  constructor(readonly error: Error) {}
}

// Replace ONLY the off-session `complete()` free function; every other pi-ai
// export passes through unchanged.
vi.mock("@earendil-works/pi-ai/compat", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    complete: vi.fn(async (model: unknown, context: unknown, options: unknown) => {
      const index = scripted.calls.length;
      scripted.calls.push({ model, context, options });
      if (scripted.replyFor === undefined) {
        throw new Error(`no scripted complete() reply for call index ${index}`);
      }
      const reply = scripted.replyFor(index, model, context, options);
      if (reply instanceof ThrownReply) {
        throw reply.error;
      }
      return reply;
    }),
  };
});

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import { executeBody, type BodyExecution } from "../src/runtime/statement-executor";
import { parse, rootDouble } from "./helpers/scripted-live-session-harness";
import { isForcedToolChoiceRejection } from "../src/binder/forced-tool-choice";

// --- The resolved model (respond model = ctx.model; binder model by reference) --

const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};

const ANTHROPIC_BINDER_MODEL = {
  id: "binder-model",
  provider: "anthropic-messages",
  api: "anthropic-messages",
  strictCapable: true,
};

// --- The live-measured rejection signature ------------------------------------
// The RAW provider errorMessage pi-ai's anthropic adapter resolves the 400
// into (measured 2026-09-17 on claude-fable-5-1; request_id elided).

const FORCED_REJECTION_MESSAGE =
  '400 {"type":"error","error":{"type":"invalid_request_error","message":' +
  '"tool_choice: type \\"tool\\" and \\"any\\" are not supported for this model."},' +
  '"request_id":"req_test"}';

/** A provider failure that is NOT the rejection signature (control cells). */
const GENERIC_TRANSPORT_MESSAGE =
  "400 {\"type\":\"error\",\"error\":{\"type\":\"invalid_request_error\",\"message\":\"max_tokens: must be positive\"}}";

// --- Fixture thetas -------------------------------------------------------------

// The typed query at `max_rounds: 0`: the forced respond dispatch is the FIRST
// and ONLY provider interaction — no free phase, no session turn (QRY-14
// step 2 boundary), so every `complete()` capture below is a forced-respond
// dispatch (or its degraded re-issue / repair restart).
const TYPED_MAX0_THETA = [
  "---",
  "mode: prompt",
  "tool_loop:",
  "  max_rounds: 0",
  "---",
  "schema Out {",
  "  sum: integer",
  "}",
  "let r: Out = @`add the two numbers`?",
  "r",
  "",
].join("\n");

// The binder fixture (two required string params — a genuine binder pass).
const BINDER_THETA = [
  "---",
  "mode: prompt",
  "bind_model: binder-model",
  "params:",
  "  topic: string",
  "  audience: string",
  "---",
  "@`review ${topic} for ${audience}`",
  "",
].join("\n");

const OK_ENVELOPE = { kind: "ok", args: { topic: "async", audience: "team" } } as const;

/**
 * The `ExtensionAPI` double. `sendUserMessage` THROWS: at `max_rounds: 0` no
 * free-phase turn may ever be driven (QRY-14 step 2 boundary) and the binder
 * never touches the session — any call is a harness-visible contract breach.
 */
function piDouble(): ExtensionAPI {
  return {
    sendUserMessage: (): void => {
      throw new Error("harness breach: pi.sendUserMessage driven on a no-session-turn path");
    },
    getActiveTools: (): string[] => [],
    setActiveTools: (): void => {},
    registerTool: (): void => {},
    on: (): void => {},
    sendMessage: (): void => {},
  } as unknown as ExtensionAPI;
}

function ctxDouble(model: unknown): ExtensionCommandContext {
  return {
    model,
    signal: undefined,
    isIdle: (): boolean => true,
    waitForIdle: (): Promise<void> => Promise.resolve(),
    sessionManager: {
      getEntries: (): readonly unknown[] => [],
      getLeafId: (): undefined => undefined,
    },
  } as unknown as ExtensionCommandContext;
}

function registryDouble(models: readonly unknown[]): ModelRegistry {
  return {
    getAvailable: (): readonly unknown[] => models,
    getApiKeyAndHeaders: async (): Promise<{ ok: boolean }> => ({ ok: true }),
  } as unknown as ModelRegistry;
}

function thetaInput(source: string, opts?: { binderModel?: string }): ThetaCompositionInput {
  const doc = parse(source);
  return {
    slashName: "probe",
    sourcePath: "/theta/probe.theta",
    frontmatter: doc.frontmatter!,
    body: doc.body,
    ...(opts?.binderModel !== undefined ? { binderModel: opts.binderModel } : {}),
  };
}

/** Drive the typed max_rounds:0 fixture through the REAL producer. */
async function driveTypedMax0(): Promise<BodyExecution> {
  const theta = thetaInput(TYPED_MAX0_THETA);
  const deps = createProductionProducerDeps({
    pi: piDouble(),
    root: rootDouble(),
    modelRegistry: registryDouble([ANTHROPIC_MODEL]),
  });
  const binding = deps.bindPromptConversation({ theta, args: "", ctx: ctxDouble(ANTHROPIC_MODEL) });
  return executeBody(theta.body, binding.executeDeps);
}

/** Drive one binder pass over the binder fixture. */
async function driveBinder(): Promise<{
  readonly bound: boolean;
  readonly args?: Readonly<Record<string, unknown>>;
}> {
  const theta = thetaInput(BINDER_THETA, { binderModel: "binder-model" });
  const deps = createProductionProducerDeps({
    pi: piDouble(),
    root: rootDouble(),
    modelRegistry: registryDouble([ANTHROPIC_BINDER_MODEL]),
  });
  return deps.runBinder({ theta, args: "the async module for the team", ctx: ctxDouble(undefined) });
}

// --- Captured-call accessors ------------------------------------------------------

function capturedCall(index: number): { model: unknown; context: unknown; options: unknown } {
  const call = scripted.calls[index];
  if (call === undefined) {
    throw new Error(
      `no complete() call captured at index ${index} (captured: ${scripted.calls.length})`,
    );
  }
  return call;
}

function optionsOf(index: number): Record<string, unknown> {
  return capturedCall(index).options as Record<string, unknown>;
}

/** The single tool production attached on the captured call (asserted single). */
function attachedToolName(index: number): string {
  const tools = (capturedCall(index).context as { tools?: ReadonlyArray<{ name?: unknown }> })
    .tools;
  expect(tools, `call ${index} must carry context.tools`).toBeDefined();
  expect(tools!.length, `call ${index} carries exactly one synthesised tool`).toBe(1);
  const name = tools![0]!.name;
  expect(typeof name, `call ${index}'s tool must be named`).toBe("string");
  return name as string;
}

// --- Scripted replies --------------------------------------------------------------

/** The resolved-failure reply pi-ai returns for a provider 400 (never a rejection). */
function errorStopReply(errorMessage: string): unknown {
  return { role: "assistant", content: [], stopReason: "error", errorMessage, timestamp: 0 };
}

function toolCallReply(name: string, args: Record<string, unknown>): unknown {
  return {
    role: "assistant",
    content: [{ type: "toolCall", id: "tc-1", name, arguments: args }],
    stopReason: "toolUse",
    timestamp: 0,
  };
}

function plainTextReply(text: string): unknown {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    stopReason: "end_turn",
    timestamp: 0,
  };
}

/** The anthropic-adapter shape: `complete()` REJECTS with the raw message. */
function thrownRejection(message: string): ThrownReply {
  return new ThrownReply(new Error(message));
}

beforeEach(() => {
  scripted.replyFor = undefined;
  scripted.calls = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// The rejection predicate.
// ===========================================================================

describe("bug 0481 — isForcedToolChoiceRejection (the shared signature predicate)", () => {
  it("matches the live-measured anthropic rejection, case-insensitively", () => {
    expect(isForcedToolChoiceRejection(FORCED_REJECTION_MESSAGE)).toBe(true);
    expect(
      isForcedToolChoiceRejection('TOOL_CHOICE: type "tool" is NOT SUPPORTED for this model'),
    ).toBe(true);
  });

  it("never matches other provider failures (overflow, generic 400, absent)", () => {
    expect(isForcedToolChoiceRejection(GENERIC_TRANSPORT_MESSAGE)).toBe(false);
    expect(isForcedToolChoiceRejection("400 prompt is too long: 210000 tokens > 200000")).toBe(
      false,
    );
    expect(isForcedToolChoiceRejection("429 overloaded")).toBe(false);
    expect(isForcedToolChoiceRejection(undefined)).toBe(false);
  });
});

// ===========================================================================
// Respond path (dispatchForcedRespondTurn through the real producer).
// ===========================================================================

describe("bug 0481 — typed-query forced respond degrades once on the rejection signature", () => {
  it("RED: the rejected forced dispatch is re-issued WITHOUT toolChoice and the degraded tool call binds", async () => {
    scripted.replyFor = (index) =>
      index === 0
        ? errorStopReply(FORCED_REJECTION_MESSAGE)
        : toolCallReply(attachedToolName(index), { sum: 777 });

    const execution = await driveTypedMax0();

    expect(
      scripted.calls.length,
      "one forced dispatch + exactly one degraded re-dispatch",
    ).toBe(2);
    // The forced dispatch carried the anthropic spelling.
    expect(optionsOf(0)["toolChoice"]).toEqual({ type: "tool", name: attachedToolName(0) });
    // The degraded dispatch omits the option entirely (provider default) and
    // still carries the SAME single respond tool.
    expect("toolChoice" in optionsOf(1), "the degraded dispatch must omit toolChoice").toBe(
      false,
    );
    expect(attachedToolName(1)).toBe(attachedToolName(0));
    expect(execution.outcome, "the degraded payload binds the typed query").toBe("success");
    expect(execution.result.value).toEqual({ sum: 777 });
  });

  it("CONTROL: a non-matching provider failure never degrades — one dispatch, terminal transport Err", async () => {
    scripted.replyFor = () => errorStopReply(GENERIC_TRANSPORT_MESSAGE);

    const execution = await driveTypedMax0();

    expect(scripted.calls.length, "no degraded re-dispatch for a non-matching failure").toBe(1);
    expect(execution.outcome).toBe("fail");
    expect((execution.error as { kind?: unknown }).kind).toBe("transport");
  });

  it("RED: the degradation is one-shot — a rejection on the degraded dispatch is terminal", async () => {
    scripted.replyFor = () => errorStopReply(FORCED_REJECTION_MESSAGE);

    const execution = await driveTypedMax0();

    expect(scripted.calls.length, "forced + degraded, then terminal — never a loop").toBe(2);
    expect("toolChoice" in optionsOf(1)).toBe(false);
    expect(execution.outcome).toBe("fail");
    expect((execution.error as { kind?: unknown }).kind).toBe("transport");
  });

  it("RED (throw arm — the anthropic-adapter shape): a REJECTED forced complete() carrying the signature degrades and binds", async () => {
    scripted.replyFor = (index) =>
      index === 0
        ? thrownRejection(FORCED_REJECTION_MESSAGE)
        : toolCallReply(attachedToolName(index), { sum: 777 });

    const execution = await driveTypedMax0();

    expect(scripted.calls.length, "one rejected forced dispatch + one degraded re-dispatch").toBe(
      2,
    );
    expect("toolChoice" in optionsOf(0)).toBe(true);
    expect("toolChoice" in optionsOf(1), "the degraded dispatch must omit toolChoice").toBe(
      false,
    );
    expect(execution.outcome).toBe("success");
    expect(execution.result.value).toEqual({ sum: 777 });
  });

  it("CONTROL (throw arm): a non-matching rejection never degrades — one dispatch, terminal transport Err", async () => {
    scripted.replyFor = () => thrownRejection(GENERIC_TRANSPORT_MESSAGE);

    const execution = await driveTypedMax0();

    expect(scripted.calls.length).toBe(1);
    expect(execution.outcome).toBe("fail");
    expect((execution.error as { kind?: unknown }).kind).toBe("transport");
  });

  it("RED: a degraded plain-text reply lands in ERR-17 → respond-repair, whose fresh dispatch re-enters the same degradation", async () => {
    scripted.replyFor = (index) => {
      switch (index) {
        case 0:
          return errorStopReply(FORCED_REJECTION_MESSAGE); // initial forced → rejected
        case 1:
          return plainTextReply("I would rather explain in prose."); // degraded → non-compliant
        case 2:
          return errorStopReply(FORCED_REJECTION_MESSAGE); // repair forced → rejected again (stateless)
        default:
          return toolCallReply(attachedToolName(index), { sum: 777 }); // repair degraded → binds
      }
    };

    const execution = await driveTypedMax0();

    expect(
      scripted.calls.length,
      "initial forced+degraded, then the repair restart's forced+degraded",
    ).toBe(4);
    expect("toolChoice" in optionsOf(0)).toBe(true);
    expect("toolChoice" in optionsOf(1)).toBe(false);
    expect("toolChoice" in optionsOf(2), "a repair restart re-forces first (stateless)").toBe(
      true,
    );
    expect("toolChoice" in optionsOf(3)).toBe(false);
    expect(execution.outcome).toBe("success");
    expect(execution.result.value).toEqual({ sum: 777 });
  });
});

// ===========================================================================
// Binder path (#classifyBinderAttempt / #completeBinderReply).
// ===========================================================================

describe("bug 0481 — binder forced dispatch degrades once, inside the SAME budgeted attempt", () => {
  it("RED: the rejected binder dispatch is re-issued WITHOUT toolChoice and the degraded envelope binds — no retry budget consumed", async () => {
    scripted.replyFor = (index) =>
      index === 0
        ? errorStopReply(FORCED_REJECTION_MESSAGE)
        : toolCallReply(attachedToolName(index), { envelope: OK_ENVELOPE });

    const result = await driveBinder();

    expect(scripted.calls.length, "one forced dispatch + one degraded re-dispatch").toBe(2);
    expect(optionsOf(0)["toolChoice"]).toEqual({ type: "tool", name: attachedToolName(0) });
    expect("toolChoice" in optionsOf(1), "the degraded dispatch must omit toolChoice").toBe(
      false,
    );
    expect(result.bound, "the degraded envelope binds").toBe(true);
    expect(result.args).toEqual({ topic: "async", audience: "team" });
  });

  it("CONTROL: a non-matching transport failure keeps the existing taxonomy — the ONE transport retry re-forces (both calls carry toolChoice)", async () => {
    scripted.replyFor = () => errorStopReply(GENERIC_TRANSPORT_MESSAGE);

    const result = await driveBinder();

    expect(
      scripted.calls.length,
      "transport gets its one budgeted retry and nothing else",
    ).toBe(2);
    expect("toolChoice" in optionsOf(0)).toBe(true);
    expect("toolChoice" in optionsOf(1), "a transport RETRY is a fresh forced attempt").toBe(
      true,
    );
    expect(result.bound).toBe(false);
  });

  it("RED: a rejection on the degraded dispatch feeds the normal attempt taxonomy — the transport retry runs one more forced+degraded pair", async () => {
    scripted.replyFor = () => errorStopReply(FORCED_REJECTION_MESSAGE);

    const result = await driveBinder();

    expect(
      scripted.calls.length,
      "attempt 1 forced+degraded, then the budgeted transport retry's forced+degraded",
    ).toBe(4);
    expect("toolChoice" in optionsOf(0)).toBe(true);
    expect("toolChoice" in optionsOf(1)).toBe(false);
    expect("toolChoice" in optionsOf(2)).toBe(true);
    expect("toolChoice" in optionsOf(3)).toBe(false);
    expect(result.bound).toBe(false);
  });

  it("RED (throw arm — the anthropic-adapter shape): a REJECTED binder complete() carrying the signature degrades and the envelope binds", async () => {
    scripted.replyFor = (index) =>
      index === 0
        ? thrownRejection(FORCED_REJECTION_MESSAGE)
        : toolCallReply(attachedToolName(index), { envelope: OK_ENVELOPE });

    const result = await driveBinder();

    expect(scripted.calls.length, "one rejected forced dispatch + one degraded re-dispatch").toBe(
      2,
    );
    expect("toolChoice" in optionsOf(1), "the degraded dispatch must omit toolChoice").toBe(
      false,
    );
    expect(result.bound).toBe(true);
    expect(result.args).toEqual({ topic: "async", audience: "team" });
  });

  it("CONTROL (throw arm): a non-matching binder rejection never degrades — the transport retry re-forces (both calls carry toolChoice)", async () => {
    // The catch-arm twin of the resolved-arm control above: dropping the
    // predicate from `#classifyBinderAttempt`'s catch arm (degrading on EVERY
    // rejection) would put a choice-less second call here and fail this cell.
    scripted.replyFor = () => thrownRejection(GENERIC_TRANSPORT_MESSAGE);

    const result = await driveBinder();

    expect(
      scripted.calls.length,
      "transport gets its one budgeted retry and nothing else",
    ).toBe(2);
    expect("toolChoice" in optionsOf(0)).toBe(true);
    expect("toolChoice" in optionsOf(1), "a transport RETRY is a fresh forced attempt").toBe(
      true,
    );
    expect(result.bound).toBe(false);
  });
});
