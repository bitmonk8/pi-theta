// Bug 0010 — typed-query two-phase restore, LIVE prompt-mode path
// (regression pins).
//
// docs/bugs/0010-typed-forced-respond-user-visible-no-toolchoice.md: the
// PRE-FIX live prompt-mode implementation fused the typed query's two phases
// into ONE user-visible `pi.sendUserMessage` turn whose text inlined the
// lowered schema behind a prose JSON-only instruction, and obtained the
// payload by text-parse of the trailing assistant turn — no respond tool was
// registered, no `options.toolChoice` was ever set, the governor was skipped
// for typed turns (`governor: typed ? undefined`), and `maxRounds: typed ? 0`
// collapsed the free phase. The fix restored the spec's TWO-PHASE loop, which
// this suite pins:
//
//   1. FREE PHASE — on-session via `pi.sendUserMessage`, opening user turn =
//      the RENDERED QUERY TEMPLATE BODY ONLY (no schema, no JSON instruction),
//      bounded by `tool_loop.max_rounds` (CIO-4 — the governor IS armed for
//      typed turns), with the synthesised one-shot respond tool
//      `__theta_respond_<slug>` registered (`pi.registerTool` through the
//      PIC-44 registration cache) and in the session active set (PIC-17
//      install vector `[...thetaCallableSetNames, respondToolName]`). The
//      model may call the respond tool EARLY: a valid call captures the
//      payload and the off-session forced turn is skipped; an invalid call
//      returns an `isError` tool-result and the turn continues.
//   2. FORCED RESPOND TURN — dispatched OFF-SESSION through pi-ai `complete()`
//      (the binder's channel): conversation = the query window read from
//      `ctx.sessionManager`, trailing `context.messages` entry = the QRY-15
//      template as a `user` message, `context.tools` = exactly the respond
//      tool, `options.toolChoice = { type: "tool", name }` forced, model = the
//      theta-resolved `model:` falling back to `ctx.model`, `options.signal` =
//      the theta signal, auth threaded from `modelRegistry.getApiKeyAndHeaders`
//      (bug 0010 §auth threading, mirroring `#completeBinderReply`). It
//      attaches NO turn to the driven session — ZERO `pi.sendUserMessage`
//      calls (SLSH-2). Extraction: the FIRST matching `ToolCall`'s `arguments`
//      is the payload, and success extraction PRECEDES stopReason
//      classification (binder-inference.md); no matching call classifies via
//      the 0007/0009-aligned stop-reason rules (transport / overflow, provider
//      = the RESOLVED RESPOND MODEL's `.api`) or ERR-17 non-compliance
//      (`wrong_tool` / `plain_text`).
//
// Spec: pi-integration-contract/conversation-drive.md (typed-query bullet,
// PIC-50/PIC-51, PIC-17, PIC-53), slash-invocation.md (SLSH-2),
// query/query-tool-loop.md (QRY-14 two-phase loop + `max_rounds: 0` boundary,
// QRY-15 template bytes, QRY-16/CIO-4), query/query-failure-and-repair.md
// (QRY-11/QRY-12), errors-and-results/queryerror-variants.md (ERR-17, provider
// derivation), pi-integration-contract/tool-registration-lifetime.md (PIC-44,
// PIC-17 install vector), implementation-notes.md §Runtime.
//
// Method: the tests/prompt-provider-field-derivation.test.ts LIVE session
// double harness (drive the production producer `createProductionProducerDeps`
// → `bindPromptConversation` → `executeBody` over an in-memory user-session
// double) PLUS the tests/off-session-transport-classification.test.ts
// `vi.mock("@earendil-works/pi-ai/compat")` scripted-queue pattern, extended to
// record the full `(model, context, options)` argument triple of every
// `complete()` call. Deterministic; no live network. Every cell asserts the
// `sendUserMessage` and `complete()` call COUNTS so the two-phase shape is
// pinned everywhere.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The recorded off-session `complete()` calls and the scripted reply queue.
// `vi.hoisted` so the `vi.mock` factory (hoisted above the imports) can close
// over a mutable holder each cell sets. Each queue entry is a FACTORY invoked
// with the recorded call triple, so a cell can build its reply from what the
// production code actually passed (e.g. the registered respond tool name).
const scripted = vi.hoisted(() => ({
  queue: [] as Array<
    (call: { model: unknown; context: unknown; options: unknown }) => unknown
  >,
  calls: [] as Array<{ model: unknown; context: unknown; options: unknown }>,
}));

// Replace ONLY the off-session `complete()` free function; every other pi-ai
// export passes through unchanged.
vi.mock("@earendil-works/pi-ai/compat", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    complete: vi.fn(async (model: unknown, context: unknown, options: unknown) => {
      const call = { model, context, options };
      const index = scripted.calls.length;
      scripted.calls.push(call);
      if (scripted.queue.length === 0) {
        // No silent skipping: a dispatch against an unscripted cell fails
        // loudly (cells that pin ZERO complete() calls leave the queue empty).
        throw new Error(
          `scripted complete() called with an EMPTY reply queue (call #${index + 1})`,
        );
      }
      // Sticky-last consumption (the bug-0007 suite discipline): a drive that
      // issues MORE calls than the cell scripted keeps observing the terminal
      // reply, so over-driving stays observable as a CALL-COUNT assertion
      // instead of a mid-flight harness throw.
      const factory = scripted.queue[Math.min(index, scripted.queue.length - 1)]!;
      return factory(call);
    }),
  };
});

import { createHash } from "node:crypto";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import { executeBody, type BodyExecution } from "../src/runtime/statement-executor";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import type { RuntimeRoot } from "../src/runtime-root";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type SchemaDecl,
  type ThetaDocument,
} from "../src/parser/theta-document";
import type { ThetaSource } from "../src/lexer/lexer";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";

// --- The resolved models ------------------------------------------------------
// DISTINCT `.api` and `.provider` strings (the bug-0007/0009 fixture
// discipline) so a provider assertion catches a wrong-field read.

/** The user session's selected model (`ctx.model`). */
const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};

/** The theta-frontmatter-resolved respond model for cell (b). */
const THETA_MODEL = {
  id: "m-theta",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};

/**
 * The theta-frontmatter-resolved respond model for cell (j) — an
 * openai-completions api, whose forced tool choice takes the provider-native
 * OpenAI-style `{type:"function",function:{name}}` spelling (bug 0010 fix
 * round 1; FORCED_TOOL_CHOICE_BY_API).
 */
const OPENAI_MODEL = {
  id: "m-oai",
  api: "openai-completions",
  provider: "openai",
  strictCapable: true,
};

/** The ambient user-session active-tool set the PIC-17 gate must restore. */
const AMBIENT_ACTIVE_TOOLS: readonly string[] = ["ambient-a"];

// --- The driven thetas ----------------------------------------------------------
// Prompt-mode thetas whose TOP-LEVEL typed `@`-query drives the LIVE seam
// (`userVisible: true` → `LivePromptQueryModel`).

const TYPED_LIVE_THETA = [
  "---",
  "mode: prompt",
  "---",
  "schema Verdict {",
  "  score: number",
  "}",
  "let v: Verdict = @`Ping`?",
  "v",
  "",
].join("\n");

/** Cell (b): frontmatter `model:` names the respond model (theta-resolved). */
const TYPED_LIVE_THETA_MODEL = [
  "---",
  "mode: prompt",
  "model: m-theta",
  "---",
  "schema Verdict {",
  "  score: number",
  "}",
  "let v: Verdict = @`Ping`?",
  "v",
  "",
].join("\n");

/** Cell (e): the QRY-14 `max_rounds: 0` boundary — no free-phase turn at all. */
const TYPED_LIVE_THETA_MAX0 = [
  "---",
  "mode: prompt",
  "tool_loop:",
  "  max_rounds: 0",
  "---",
  "schema Verdict {",
  "  score: number",
  "}",
  "let v: Verdict = @`Ping`?",
  "v",
  "",
].join("\n");

/** Cells (f): `respond_repair.attempts: 0` so ERR-17 is terminal at once. */
const TYPED_LIVE_THETA_REPAIR0 = [
  "---",
  "mode: prompt",
  "respond_repair:",
  "  attempts: 0",
  "---",
  "schema Verdict {",
  "  score: number",
  "}",
  "let v: Verdict = @`Ping`?",
  "v",
  "",
].join("\n");

/** Cell (f3): `respond_repair.attempts: 1` — ONE repair follow-up is driven. */
const TYPED_LIVE_THETA_REPAIR1 = [
  "---",
  "mode: prompt",
  "respond_repair:",
  "  attempts: 1",
  "---",
  "schema Verdict {",
  "  score: number",
  "}",
  "let v: Verdict = @`Ping`?",
  "v",
  "",
].join("\n");

/** Cell (j): frontmatter `model:` names the openai-completions respond model. */
const TYPED_LIVE_THETA_MODEL_OAI = [
  "---",
  "mode: prompt",
  "model: m-oai",
  "---",
  "schema Verdict {",
  "  score: number",
  "}",
  "let v: Verdict = @`Ping`?",
  "v",
  "",
].join("\n");

/** Cell (k): frontmatter `model:` names a reference NO available model matches. */
const TYPED_LIVE_THETA_MODEL_GHOST = [
  "---",
  "mode: prompt",
  "model: m-ghost",
  "---",
  "schema Verdict {",
  "  score: number",
  "}",
  "let v: Verdict = @`Ping`?",
  "v",
  "",
].join("\n");

/**
 * Degraded-arm cell (bug 0010 fix review, F5): an EMPTY `@<>` annotation — the
 * one annotation form `lowerQueryResponseSchema` cannot lower (author error;
 * parses clean, no diagnostic) — so no respond context is built and the
 * pre-0010 fused mechanism survives on this arm.
 */
const TYPED_LIVE_THETA_UNLOWERABLE = [
  "---",
  "mode: prompt",
  "---",
  "let v = @<>`Ping`?",
  "v",
  "",
].join("\n");

// --- The lowered `Verdict` schema / slug / QRY-15 template ---------------------

/**
 * The lowered `Verdict` response schema, its slug, the respond tool name, and
 * the QRY-15 template body — computed through the SAME production collaborators
 * the runtime uses (`lowerQueryResponseSchema` + the sha256-first-16-hex slug
 * recipe of src/runtime/typed-query-validation.ts `schemaSlug`), so the pins
 * below are byte-exact against the contract, not against copied constants.
 */
interface RespondFixture {
  readonly lowered: LoweredSchema;
  readonly slug: string;
  readonly toolName: string;
}

let cachedRespondFixture: RespondFixture | undefined;

function respondFixture(): RespondFixture {
  if (cachedRespondFixture !== undefined) {
    return cachedRespondFixture;
  }
  const doc = parse(TYPED_LIVE_THETA);
  const decls = doc.body.statements.filter(
    (stmt): stmt is SchemaDecl => stmt.kind === "schema",
  );
  const lowered = lowerQueryResponseSchema("Verdict", decls);
  if (lowered === undefined) {
    throw new Error("fixture defect: the Verdict schema annotation must lower");
  }
  // The slug recipe pinned by the design (bug 0010): sha256 over
  // JSON.stringify(lowered), first 16 hex chars — shared by registration,
  // QRY-15, and QRY-12 so tool name ↔ template references stay byte-equal.
  const slug = createHash("sha256")
    .update(JSON.stringify(lowered))
    .digest("hex")
    .slice(0, 16);
  cachedRespondFixture = {
    lowered,
    slug,
    toolName: `__theta_respond_${slug}`,
  };
  return cachedRespondFixture;
}

/**
 * The QRY-15 initial-respond-turn template body, byte-exact
 * (query-tool-loop.md QRY-15): the instruction sentence naming the backticked
 * respond tool, a single U+000A, `JSON.stringify(lowered, null, 2)`, and the
 * mandated trailing U+000A.
 */
function qry15Body(lowered: LoweredSchema, toolName: string): string {
  return (
    "Return your final answer using the `" +
    toolName +
    "` tool, conforming to this schema:\n" +
    JSON.stringify(lowered, null, 2) +
    "\n"
  );
}

// --- Scripted `complete()` assistant replies ------------------------------------

/**
 * An `AssistantMessage`-shaped reply for the mocked `complete()`. `toolCalls`
 * scripts pi-ai `ToolCall` content parts (`{type: "toolCall", ...}`) alongside
 * any text part.
 */
function assistantReply(fields: {
  readonly stopReason: string;
  readonly text?: string;
  readonly errorMessage?: string;
  readonly toolCalls?: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly arguments: Record<string, unknown>;
  }>;
}): Record<string, unknown> {
  const content: Record<string, unknown>[] = [];
  if (fields.text !== undefined) {
    content.push({ type: "text", text: fields.text });
  }
  for (const call of fields.toolCalls ?? []) {
    content.push({
      type: "toolCall",
      id: call.id,
      name: call.name,
      arguments: call.arguments,
    });
  }
  return {
    role: "assistant",
    content,
    api: "anthropic-messages",
    stopReason: fields.stopReason,
    ...(fields.errorMessage !== undefined ? { errorMessage: fields.errorMessage } : {}),
    timestamp: 0,
  };
}

// --- The in-memory live user session --------------------------------------------

/** The scripted trailing assistant message one driven turn commits. */
interface ScriptedAssistantReply {
  readonly stopReason: string;
  readonly text?: string;
  readonly errorMessage?: string;
}

/** A `SessionManager` message entry (the `buildSessionContext` read shape). */
interface SessionEntryDouble {
  readonly type: "message";
  readonly id: string;
  readonly parentId: string | undefined;
  readonly message: Record<string, unknown>;
}

/**
 * The live user-session double the free phase drives (adapted from
 * tests/prompt-provider-field-derivation.test.ts):
 *
 *  - `sendUserMessage` commits the `user` entry and marks the session
 *    streaming;
 *  - `tick()` (invoked from the injected `Clock`'s `setTimeout`) completes the
 *    in-flight streamed turn — invoking the one-shot `onMidTurn` hook FIRST
 *    (mid-turn, so a cell can call the registered respond tool's `execute` or
 *    replay governor events while the turn is live), then committing the
 *    scripted trailing `assistant` entry;
 *  - the reply queue is STICKY-LAST (the bug-0007 discipline): a runtime that
 *    drives MORE turns than the two-phase contract scripts (the retired fused
 *    turn + text-parse respond-repair re-drives did) keeps observing the
 *    terminal reply, so the over-driving stays observable as the
 *    `sendUserMessageCalls` COUNT pin instead of a mid-flight harness throw;
 *  - `entries` back `ctx.sessionManager.getEntries()` — the PIC-51/PIC-53 read
 *    surface AND the query-window rebuild surface the off-session respond turn
 *    reads (bug 0010).
 */
class LiveSessionDouble {
  readonly entries: SessionEntryDouble[] = [];
  /** Proof of ON-SESSION traffic (the off-session respond turn issues none). */
  sendUserMessageCalls = 0;
  readonly sentQueryTexts: string[] = [];
  /** One-shot mid-turn hook: fires inside the FIRST in-flight `tick()`. */
  onMidTurn: (() => void) | undefined = undefined;

  #idle = true;
  #completedTurns = 0;
  #midTurnFired = false;
  readonly #replies: readonly ScriptedAssistantReply[];

  constructor(replies: readonly ScriptedAssistantReply[]) {
    this.#replies = [...replies];
  }

  sendUserMessage(content: string): void {
    this.sendUserMessageCalls += 1;
    this.sentQueryTexts.push(content);
    this.#append({
      role: "user",
      content: [{ type: "text", text: content }],
      timestamp: 0,
    });
    this.#idle = false;
  }

  isIdle(): boolean {
    return this.#idle;
  }

  /** Complete the in-flight streamed turn (inert while idle). */
  tick(): void {
    if (this.#idle) {
      return;
    }
    if (!this.#midTurnFired) {
      // The turn is live: the governor (if armed) is between `begin`/`end` and
      // the respond capture slot (if any) is active — exactly the window the
      // early-respond and governor cells need.
      this.#midTurnFired = true;
      this.onMidTurn?.();
    }
    if (this.#replies.length === 0) {
      // No silent skipping: a cell that scripts NO session replies pins a
      // drive that must issue NO session turn at all.
      throw new Error(
        "live session double: a driven turn completed with an EMPTY reply queue",
      );
    }
    const reply =
      this.#replies[Math.min(this.#completedTurns, this.#replies.length - 1)]!;
    this.#completedTurns += 1;
    this.#append({
      role: "assistant",
      content: reply.text !== undefined ? [{ type: "text", text: reply.text }] : [],
      api: "anthropic-messages",
      provider: "anthropic",
      model: "m1",
      stopReason: reply.stopReason,
      ...(reply.errorMessage !== undefined ? { errorMessage: reply.errorMessage } : {}),
      timestamp: 0,
    });
    this.#idle = true;
  }

  #append(message: Record<string, unknown>): void {
    const id = `e${this.entries.length + 1}`;
    const parentId = this.entries.length === 0 ? undefined : `e${this.entries.length}`;
    this.entries.push({ type: "message", id, parentId, message });
  }
}

// --- The recording `pi` double ---------------------------------------------------

/**
 * The `ExtensionAPI` surface the two-phase drive touches, RECORDING every
 * observable the bug-0010 pins read: `registerTool` definitions (the PIC-44
 * respond-tool registration), every `setActiveTools` vector in order (the
 * PIC-17 install vector + restore), the `getActiveTools` snapshot reads, and
 * every `pi.on` registration (the CIO-4 governor arming).
 */
class RecordingPi {
  readonly registeredTools: ToolDefinition[] = [];
  readonly setActiveToolsCalls: string[][] = [];
  getActiveToolsCalls = 0;
  readonly onEvents: string[] = [];
  readonly handlers = new Map<string, Array<(...args: unknown[]) => unknown>>();
  readonly api: ExtensionAPI;

  constructor(session: LiveSessionDouble) {
    const record = this;
    this.api = {
      sendUserMessage: (content: string): void => session.sendUserMessage(content),
      getActiveTools: (): string[] => {
        record.getActiveToolsCalls += 1;
        return [...AMBIENT_ACTIVE_TOOLS];
      },
      setActiveTools: (names: string[]): void => {
        record.setActiveToolsCalls.push([...names]);
      },
      registerTool: (tool: ToolDefinition): void => {
        record.registeredTools.push(tool);
      },
      on: (event: string, handler: (...args: unknown[]) => unknown): void => {
        record.onEvents.push(event);
        const list = record.handlers.get(event) ?? [];
        list.push(handler);
        record.handlers.set(event, list);
      },
      sendMessage: (): void => {},
    } as unknown as ExtensionAPI;
  }
}

// --- Harness ---------------------------------------------------------------------

function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}

/** Parse `.theta` source through the production whole-file parser (must be clean). */
function parse(src: string): ThetaDocument {
  const source: ThetaSource = {
    path: "probe.theta",
    bytes: new TextEncoder().encode(src),
  };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
  expect(errors, "the fixture theta must parse cleanly before it is driven").toEqual([]);
  expect(doc.frontmatter, "the fixture theta must carry parseable frontmatter").not.toBeNull();
  return doc;
}

/** The production AJV validator (real schema validation, as the sibling suites). */
function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}

/**
 * A runtime-root double for the LIVE prompt-mode drive: a noop checkpoint,
 * deterministic ids, and a `Clock` whose `setTimeout` first `tick()`s the
 * session double (completing any in-flight streamed turn) and then fires the
 * callback synchronously — the prompt-provider-field-derivation harness shape.
 */
function rootDouble(session: LiveSessionDouble): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    clock: {
      now: (): number => 0,
      wallNow: (): number => 0,
      setTimeout: (fn: () => void): unknown => {
        session.tick();
        fn();
        return 0;
      },
      clearTimeout: (): void => {},
    },
    schemaValidator: ajv(),
  } as unknown as RuntimeRoot;
}

/**
 * Bug 0010 harness accommodation (permitted outside the frozen scripted-driver
 * suites): the `ModelRegistry` double carries `getAvailable` — the surface a
 * present frontmatter `model:` resolves against (`matchAvailableModel(ref,
 * modelRegistry.getAvailable())`) for the respond dispatch — and
 * `getApiKeyAndHeaders`, the respond call's auth threading copied from
 * `#completeBinderReply` (`options.apiKey` / `options.headers` when `auth.ok`).
 */
function registryDouble(available: readonly unknown[]): ModelRegistry {
  return {
    getAvailable: () => [...available],
    getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "k-test" }),
  } as unknown as ModelRegistry;
}

/** The dispatch ctx: the user-session model + the committed-transcript surface. */
function ctxDouble(session: LiveSessionDouble, model: unknown): ExtensionCommandContext {
  return {
    model,
    signal: undefined,
    isIdle: (): boolean => session.isIdle(),
    waitForIdle: (): Promise<void> => Promise.resolve(),
    sessionManager: {
      getEntries: (): readonly SessionEntryDouble[] => [...session.entries],
      getLeafId: (): undefined => undefined,
    },
  } as unknown as ExtensionCommandContext;
}

/** One assembled drive: the session/pi doubles plus the REUSABLE producer deps. */
interface TwoPhaseHarness {
  readonly session: LiveSessionDouble;
  readonly pi: RecordingPi;
  readonly deps: ReturnType<typeof createProductionProducerDeps>;
  readonly theta: ThetaCompositionInput;
  readonly ctx: ExtensionCommandContext;
}

function makeHarness(opts: {
  readonly source: string;
  readonly model?: unknown;
  readonly availableModels?: readonly unknown[];
  readonly sessionReplies: readonly ScriptedAssistantReply[];
  /** Fires ONCE inside the first in-flight `tick()` — mid-turn. */
  readonly onMidTurn?: (harness: TwoPhaseHarness) => void;
}): TwoPhaseHarness {
  const doc = parse(opts.source);
  const theta: ThetaCompositionInput = {
    slashName: "probe",
    sourcePath: "/theta/probe.theta",
    frontmatter: doc.frontmatter!,
    body: doc.body,
  };
  const session = new LiveSessionDouble(opts.sessionReplies);
  const pi = new RecordingPi(session);
  const deps = createProductionProducerDeps({
    pi: pi.api,
    root: rootDouble(session),
    modelRegistry: registryDouble(opts.availableModels ?? [ANTHROPIC_MODEL]),
  });
  const harness: TwoPhaseHarness = {
    session,
    pi,
    deps,
    theta,
    ctx: ctxDouble(session, opts.model === undefined ? ANTHROPIC_MODEL : opts.model),
  };
  if (opts.onMidTurn !== undefined) {
    session.onMidTurn = (): void => opts.onMidTurn!(harness);
  }
  return harness;
}

/**
 * Drive the harness theta once through the PRODUCTION prompt-mode binding.
 * Re-invocable on the SAME harness: cell (c) drives twice through the same
 * producer instance to pin the PIC-44 registration-cache reuse.
 */
async function drive(harness: TwoPhaseHarness): Promise<BodyExecution> {
  const binding = harness.deps.bindPromptConversation({
    theta: harness.theta,
    args: "",
    ctx: harness.ctx,
  });
  expect(
    binding.drivenAgainst,
    "the harness must bind the LIVE prompt-mode drive (the user session), not an off-session host",
  ).toBe("prompt-user-session");
  return executeBody(harness.theta.body, binding.executeDeps);
}

/**
 * The respond tool name the drive minted — read from the `registerTool`
 * capture (the authoritative PIC-44 name), falling back to the recipe-computed
 * name so a cell can script a reply factory before any drive has registered
 * (the two names are byte-equal for these non-colliding fixtures).
 */
function respondToolNameOf(harness: TwoPhaseHarness): string {
  return harness.pi.registeredTools[0]?.name ?? respondFixture().toolName;
}

/** Extract a message's text (string content or text-part array). */
function messageText(message: unknown): string {
  const msg = message as { readonly content?: unknown };
  if (typeof msg.content === "string") {
    return msg.content;
  }
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter(
        (part): part is { readonly type: string; readonly text: string } =>
          (part as { readonly type?: unknown }).type === "text" &&
          typeof (part as { readonly text?: unknown }).text === "string",
      )
      .map((part) => part.text)
      .join("");
  }
  return "";
}

/** The recorded `complete()` call's context.messages, duck-typed. */
function contextMessagesOf(call: {
  readonly context: unknown;
}): readonly Record<string, unknown>[] {
  const context = call.context as { readonly messages?: unknown };
  expect(
    Array.isArray(context.messages),
    `the complete() context must carry a messages array; observed context: ${JSON.stringify(call.context)}`,
  ).toBe(true);
  return context.messages as readonly Record<string, unknown>[];
}

/** Dig the leaf `QueryError` of the given kind out of a `?`-unwound failed drive. */
function expectErrOfKind(execution: BodyExecution, kind: string): Record<string, unknown> {
  expect(
    execution.outcome,
    `the \`?\`-unwound Err must FAIL the body (ERR-18); observed outcome '${execution.outcome}' ` +
      `(final value: ${JSON.stringify(execution.result.value)})`,
  ).toBe("fail");
  const error = execution.error;
  expect(
    error !== null && typeof error === "object",
    `the fail outcome must carry the leaf QueryError; observed: ${JSON.stringify(error)}`,
  ).toBe(true);
  const leaf = error as unknown as Record<string, unknown>;
  expect(
    leaf.kind,
    `the leaf QueryError classifies as ${kind}; observed: ${JSON.stringify(leaf)}`,
  ).toBe(kind);
  return leaf;
}

/** Assert a successful drive resolving the typed value. */
function expectValue(execution: BodyExecution, expected: unknown, why: string): void {
  expect(
    execution.outcome,
    `${why}; observed outcome '${execution.outcome}' (error: ${JSON.stringify(execution.error)})`,
  ).toBe("success");
  expect(execution.result.value, why).toEqual(expected);
}

/**
 * Replay a fabricated CIO-4 round pattern through the CAPTURED governor hooks
 * (adapted from tests/prompt-tool-loop-governor.test.ts): each round is one
 * `before_provider_request` followed by one `tool_call`, returning each
 * round's first non-undefined `ToolCallEventResult`. Returns `undefined` when
 * the governor hooks were never registered (the pre-fix typed drive — the
 * calling cell reds on the registration pin first).
 */
function runGovernorRoundProbe(
  pi: RecordingPi,
  rounds: number,
): Array<unknown | undefined> | undefined {
  const providerRequestHandlers = pi.handlers.get("before_provider_request");
  const toolCallHandlers = pi.handlers.get("tool_call");
  if (
    providerRequestHandlers === undefined ||
    toolCallHandlers === undefined ||
    providerRequestHandlers.length === 0 ||
    toolCallHandlers.length === 0
  ) {
    return undefined;
  }
  const results: Array<unknown | undefined> = [];
  for (let round = 0; round < rounds; round += 1) {
    for (const handler of providerRequestHandlers) {
      handler(undefined, undefined);
    }
    let decision: unknown;
    for (const handler of toolCallHandlers) {
      const result = handler(
        { type: "tool_call", toolCallId: `fab-${round}`, toolName: "grep", input: {} },
        undefined,
      );
      if (decision === undefined) {
        decision = result;
      }
    }
    results.push(decision);
  }
  return results;
}

beforeEach(() => {
  scripted.queue = [];
  scripted.calls = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// Regression pins — the restored two-phase contract (red before the bug-0010
// fix, green since). PRE-FIX the typed live drive fused both phases into ONE
// user-visible sendUserMessage turn carrying the inlined schema, never called
// complete(), never registered the respond tool, and skipped the governor.
// ===========================================================================

describe("bug 0010 (regression pins) — live typed query: free phase on-session + forced respond off-session (QRY-14, SLSH-2, conversation-drive typed bullet)", () => {
  it("(a) happy path: ONE free-phase sendUserMessage carrying the rendered prompt ONLY, then ONE off-session complete() with forced toolChoice, QRY-15 trailing message, window conversation, threaded auth/signal — resolving {score: 7}", async () => {
    const { lowered } = respondFixture();
    const harness = makeHarness({
      source: TYPED_LIVE_THETA,
      sessionReplies: [{ stopReason: "stop", text: "thinking done" }],
    });
    // The forced respond turn: the model calls the REGISTERED respond tool
    // (name read from the registerTool capture) with the schema-valid payload.
    scripted.queue = [
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [
            { id: "tc1", name: respondToolNameOf(harness), arguments: { score: 7 } },
          ],
        }),
    ];

    const execution = await drive(harness);

    // Two-phase shape (bug 0010): exactly ONE on-session turn for the whole
    // typed query — the FREE-PHASE turn. The forced respond turn is off-session
    // and issues ZERO sendUserMessage calls (SLSH-2; conversation-drive.md
    // typed-query bullet). This replaces the old fused-turn contract.
    expect(
      harness.session.sendUserMessageCalls,
      "exactly ONE sendUserMessage for the whole typed query — the free-phase turn; " +
        "the off-session forced respond turn issues ZERO (bug 0010, SLSH-2)",
    ).toBe(1);
    // The free-phase opening turn is the RENDERED QUERY TEMPLATE BODY ONLY —
    // no 'Respond with ONLY' prose, no inlined schema, no JSON instruction
    // (`renderTypedAwareQueryText` retires from this path, bug 0010).
    expect(
      harness.session.sentQueryTexts[0],
      "the free-phase user turn is the rendered prompt ONLY — no JSON-only instruction, " +
        "no inlined lowered schema (bug 0010; QRY-14 step 1)",
    ).toBe("Ping");
    // Exactly ONE off-session complete() — the forced respond turn
    // (conversation-drive.md: the only typed-query provider call routed
    // through pi-ai's complete()).
    expect(
      scripted.calls.length,
      "exactly ONE complete() call — the off-session forced respond turn (bug 0010)",
    ).toBe(1);

    const call = scripted.calls[0]!;
    const options = call.options as Record<string, unknown>;
    const respondName = respondToolNameOf(harness);
    // The forced tool choice — the entire content of spec finding T34
    // (`pi.sendUserMessage` exposes no toolChoice; complete() is the channel).
    expect(
      options["toolChoice"],
      "options.toolChoice forces the provider to the synthesised respond tool " +
        "(QRY-14 step 2; conversation-drive.md §complete() forced-tool)",
    ).toEqual({ type: "tool", name: respondName });
    expect(
      options["signal"] instanceof AbortSignal,
      "options.signal threads the theta signal into the respond dispatch (cancellation), " +
        `observed: ${String(options["signal"])}`,
    ).toBe(true);
    expect(
      options["apiKey"],
      "the respond call threads auth from modelRegistry.getApiKeyAndHeaders " +
        "(bug 0010 §auth threading, mirroring #completeBinderReply)",
    ).toBe("k-test");

    // context.tools = exactly one entry — the respond tool with its
    // description and the lowered schema as parameters
    // (implementation-notes.md §Runtime: "the synthesised respond tool as the
    // single context.tools entry").
    const tools = (call.context as { readonly tools?: unknown }).tools as
      | readonly Record<string, unknown>[]
      | undefined;
    expect(
      Array.isArray(tools) && tools.length === 1,
      `context.tools carries exactly the respond tool; observed: ${JSON.stringify(tools)}`,
    ).toBe(true);
    expect(tools![0]!["name"], "the single tool entry is the respond tool").toBe(respondName);
    expect(
      typeof tools![0]!["description"] === "string" &&
        (tools![0]!["description"] as string).length > 0,
      `the respond tool carries a description string; observed: ${JSON.stringify(tools![0])}`,
    ).toBe(true);
    expect(
      JSON.parse(JSON.stringify(tools![0]!["parameters"])),
      "the respond tool's parameters carry the lowered response schema (QRY-22 conveyance)",
    ).toEqual(JSON.parse(JSON.stringify(lowered)));

    // The trailing context.messages entry is the QRY-15 template, byte-exact:
    // instruction sentence + U+000A + JSON.stringify(lowered, null, 2) + U+000A.
    const messages = contextMessagesOf(call);
    const trailing = messages[messages.length - 1]!;
    expect(trailing["role"], "the QRY-15 template rides a user message").toBe("user");
    expect(
      messageText(trailing),
      "the trailing context.messages entry is the QRY-15 template, byte-exact",
    ).toBe(qry15Body(lowered, respondName));
    // The messages BEFORE the template are the query window: the free-phase
    // user turn + the assistant reply (window opens at the query's first
    // sendUserMessage — the PIC-53 read surface).
    expect(
      messages.length,
      "the respond conversation is the query window (free-phase user turn + assistant " +
        "reply) plus the trailing QRY-15 template — three messages",
    ).toBe(3);
    expect(messages[0]!["role"], "the window opens at the free-phase user turn").toBe("user");
    expect(
      messageText(messages[0]),
      "the window's first message is the free-phase 'Ping' turn",
    ).toContain("Ping");

    // The respond model: frontmatter has no `model:`, so the invocation-pinned
    // session model (`deps.ctx.model`) is the fallback.
    expect(
      (call.model as { readonly id?: unknown }).id,
      "with no frontmatter model: the respond dispatch falls back to the ctx session model",
    ).toBe("m1");

    // The validated payload resolves the typed query.
    expectValue(
      execution,
      { score: 7 },
      "the forced respond ToolCall's arguments validate and resolve the typed query (QRY-14 step 2)",
    );
  });

  it("(b) theta-resolved model: frontmatter `model: m-theta` routes the respond complete() to the theta-resolved model while the free phase stays on the session", async () => {
    const harness = makeHarness({
      source: TYPED_LIVE_THETA_MODEL,
      availableModels: [ANTHROPIC_MODEL, THETA_MODEL],
      sessionReplies: [{ stopReason: "stop", text: "free reply" }],
    });
    scripted.queue = [
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [
            { id: "tc1", name: respondToolNameOf(harness), arguments: { score: 7 } },
          ],
        }),
    ];

    const execution = await drive(harness);

    expect(
      harness.session.sendUserMessageCalls,
      "the free-phase turn still runs ON-SESSION (one sendUserMessage) even when the " +
        "respond model is theta-resolved (bug 0010)",
    ).toBe(1);
    expect(
      scripted.calls.length,
      "exactly ONE complete() call — the off-session forced respond turn",
    ).toBe(1);
    // The respond dispatch resolves `theta.frontmatter.model` via
    // matchAvailableModel against modelRegistry.getAvailable() — NOT the
    // session's ctx.model (conversation-drive.md §Provider compatibility;
    // bug 0010 respond-model selection).
    expect(
      (scripted.calls[0]!.model as { readonly id?: unknown }).id,
      "the respond complete() dispatches against the THETA-RESOLVED `model:` (m-theta), " +
        "not the session model",
    ).toBe("m-theta");
    expectValue(execution, { score: 7 }, "the typed query resolves through the m-theta respond turn");
  });

  it("(c) respond tool registration + active set: pi.registerTool once with the PIC-44 name/label/parameters, PIC-17 install vector [respondTool], snapshot restored; a second drive re-uses the registration", async () => {
    const { lowered } = respondFixture();
    const harness = makeHarness({
      source: TYPED_LIVE_THETA,
      sessionReplies: [{ stopReason: "stop", text: "free reply" }],
    });
    scripted.queue = [
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [
            { id: "tc1", name: respondToolNameOf(harness), arguments: { score: 7 } },
          ],
        }),
    ];

    const first = await drive(harness);

    // PIC-44 registration: the synthesised one-shot respond tool is registered
    // through the producer's registration cache exactly once.
    expect(
      harness.pi.registeredTools.length,
      "the typed drive registers the synthesised respond tool via pi.registerTool " +
        "(QRY-14 step 2; tool-registration-lifetime.md PIC-44) — pre-fix it never registered",
    ).toBe(1);
    const definition = harness.pi.registeredTools[0]!;
    expect(
      definition.name,
      "the registered name is the content-addressed __theta_respond_<slug> " +
        "(slug = sha256-first-16-hex over JSON.stringify(lowered))",
    ).toBe(respondFixture().toolName);
    expect(
      definition.label,
      'the materialised label is deriveToolLabel({kind:"typed-query-respond"}) — ' +
        'the fixed literal "Theta typed-query response"',
    ).toBe("Theta typed-query response");
    expect(
      definition.description,
      "the respond tool description is the fixed literal (bug-0010 design brief §Slug / naming)",
    ).toBe("Return the final answer for the typed query, conforming to the response schema.");
    expect(
      JSON.parse(JSON.stringify(definition.parameters)),
      "the registered parameters wrap the lowered response schema",
    ).toEqual(JSON.parse(JSON.stringify(lowered)));

    // PIC-17 install vector: the free-phase turn installs exactly
    // `[...thetaCallableSetNames, respondToolName]` — the callable set is empty
    // here, so the vector is exactly the respond tool. The ambient snapshot is
    // deliberately NOT unioned in.
    expect(
      harness.pi.setActiveToolsCalls[0],
      "the free-phase turn's PIC-17 step-2 install vector is " +
        "[...callableSetNames, respondToolName] — here exactly [__theta_respond_<slug>] " +
        "(tool-registration-lifetime.md §install vector; bug 0010)",
    ).toEqual([respondFixture().toolName]);
    // PIC-17 step 4: the final setActiveTools restores the step-1 snapshot.
    expect(
      harness.pi.setActiveToolsCalls[harness.pi.setActiveToolsCalls.length - 1],
      "the final setActiveTools restores the ambient step-1 snapshot (PIC-17 step 4)",
    ).toEqual([...AMBIENT_ACTIVE_TOOLS]);
    expect(
      harness.pi.getActiveToolsCalls > 0,
      "the gate snapshots the ambient active set before installing (PIC-17 step 1)",
    ).toBe(true);

    // Two-phase counts for the first drive.
    expect(
      harness.session.sendUserMessageCalls,
      "first drive: one free-phase sendUserMessage",
    ).toBe(1);
    expect(scripted.calls.length, "first drive: one off-session complete()").toBe(1);
    expectValue(first, { score: 7 }, "the first drive resolves the typed value");

    // SECOND drive of the same theta through the SAME producer: the lowered
    // schema is byte-identical, so the PIC-44 cache re-uses the registration —
    // registerTool is NOT called again.
    const second = await drive(harness);
    expect(
      harness.pi.registeredTools.length,
      "a second drive of the same lowered schema re-uses the PIC-44 registration — " +
        "registerTool still called exactly once (cache hit, byte-equal canonical form)",
    ).toBe(1);
    expect(
      harness.session.sendUserMessageCalls,
      "second drive adds exactly one more free-phase turn (two total)",
    ).toBe(2);
    expect(
      scripted.calls.length,
      "second drive adds exactly one more off-session complete() (two total)",
    ).toBe(2);
    expectValue(second, { score: 7 }, "the second drive resolves the typed value");
  });

  it("(d1) early respond call: a VALID mid-turn execute captures the payload — the query resolves {score: 3} with ZERO complete() dispatches", async () => {
    let earlyPlaced = false;
    let earlyResult: Promise<unknown> | undefined;
    const harness = makeHarness({
      source: TYPED_LIVE_THETA,
      // The streamed turn commits AFTER the mid-turn respond call.
      sessionReplies: [{ stopReason: "stop", text: "done" }],
      onMidTurn: (h): void => {
        const definition = h.pi.registeredTools[0];
        if (definition === undefined) {
          // Defensive: were registration ever to regress, the early call
          // cannot be placed — the post-drive registration pin reds first.
          return;
        }
        earlyPlaced = true;
        // QRY-14: "the respond tool ... available to the model during
        // query-time tool loops" — the model calls it EARLY by name; its
        // execute depth-walks (CIO-3) then AJV-validates and captures.
        earlyResult = (
          definition.execute as unknown as (
            id: string,
            params: unknown,
            signal: AbortSignal | undefined,
          ) => Promise<unknown>
        )("tc-early", { score: 3 }, new AbortController().signal);
      },
    });
    // The queue stays EMPTY: a valid early capture makes the off-session
    // dispatch unnecessary; any complete() call would throw loudly.
    scripted.queue = [];

    const execution = await drive(harness);

    expect(
      harness.pi.registeredTools.length,
      "the respond tool must be registered and callable DURING the free phase " +
        "(QRY-14 early-respond; bug 0010) — pre-fix it never registered",
    ).toBe(1);
    expect(earlyPlaced, "the harness placed the mid-turn early respond call").toBe(true);
    const result = (await earlyResult!) as {
      readonly isError?: unknown;
      readonly content?: ReadonlyArray<{ readonly type?: unknown; readonly text?: unknown }>;
    };
    expect(
      result.isError,
      `a VALID early respond call is not an error result; observed: ${JSON.stringify(result)}`,
    ).toBeFalsy();
    const resultText = (result.content ?? [])
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text as string)
      .join("");
    expect(
      resultText,
      "the valid early call's tool-result text indicates the final answer was recorded " +
        `(bug-0010 design brief §Early-respond capture); observed: ${JSON.stringify(result)}`,
    ).toMatch(/recorded/i);
    expect(
      scripted.calls.length,
      "a captured early respond payload SKIPS the off-session forced turn — ZERO complete() calls",
    ).toBe(0);
    expect(
      harness.session.sendUserMessageCalls,
      "still exactly one on-session turn — the free-phase turn",
    ).toBe(1);
    expectValue(
      execution,
      { score: 3 },
      "the first valid early respond call wins (one-shot) and resolves the typed query",
    );
  });

  it("(d2) early respond call: an INVALID mid-turn execute resolves isError with a validation message, does NOT resolve the query — the off-session respond turn then supplies the payload (ONE complete())", async () => {
    let earlyPlaced = false;
    let earlyResult: Promise<unknown> | undefined;
    const harness = makeHarness({
      source: TYPED_LIVE_THETA,
      sessionReplies: [{ stopReason: "stop", text: "done" }],
      onMidTurn: (h): void => {
        const definition = h.pi.registeredTools[0];
        if (definition === undefined) {
          return;
        }
        earlyPlaced = true;
        earlyResult = (
          definition.execute as unknown as (
            id: string,
            params: unknown,
            signal: AbortSignal | undefined,
          ) => Promise<unknown>
        )("tc-early-bad", { score: "nope" }, new AbortController().signal);
      },
    });
    // The invalid early call must NOT capture; the scripted off-session
    // respond turn then supplies the valid payload.
    scripted.queue = [
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [
            { id: "tc1", name: respondToolNameOf(harness), arguments: { score: 7 } },
          ],
        }),
    ];

    const execution = await drive(harness);

    expect(
      harness.pi.registeredTools.length,
      "the respond tool must be registered and callable DURING the free phase " +
        "(QRY-14 early-respond; bug 0010) — pre-fix it never registered",
    ).toBe(1);
    expect(earlyPlaced, "the harness placed the invalid mid-turn respond call").toBe(true);
    const result = (await earlyResult!) as {
      readonly isError?: unknown;
      readonly content?: ReadonlyArray<{ readonly type?: unknown; readonly text?: unknown }>;
    };
    expect(
      result.isError,
      "an INVALID early respond call ({score: 'nope'} vs number) resolves an isError " +
        `tool-result (QRY-14: AJV rejects in execute); observed: ${JSON.stringify(result)}`,
    ).toBe(true);
    const resultText = (result.content ?? [])
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text as string)
      .join("");
    expect(
      resultText.length > 0,
      "the isError result carries the validation message so the model can correct in-turn; " +
        `observed: ${JSON.stringify(result)}`,
    ).toBe(true);
    expect(
      scripted.calls.length,
      "an invalid early call does NOT capture — the off-session forced respond turn is " +
        "still dispatched (exactly ONE complete())",
    ).toBe(1);
    expect(
      harness.session.sendUserMessageCalls,
      "still exactly one on-session turn — the free-phase turn",
    ).toBe(1);
    expectValue(
      execution,
      { score: 7 },
      "the query resolves from the off-session respond payload, never the invalid early call",
    );
  });

  it("(e) max_rounds: 0 boundary (QRY-14 step 2): NO free-phase turn — ZERO sendUserMessage; ONE complete() whose SINGLE user message is prompt + U+000A + QRY-15 template body", async () => {
    const { lowered } = respondFixture();
    const harness = makeHarness({
      source: TYPED_LIVE_THETA_MAX0,
      // Scripted defensively: the two-phase contract drives NO session turn at
      // max_rounds 0 (the retired fused mechanism drove one) — sticky-last
      // keeps any regression observable as the count pin below.
      sessionReplies: [{ stopReason: "stop", text: "must not run" }],
    });
    scripted.queue = [
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [
            { id: "tc1", name: respondToolNameOf(harness), arguments: { score: 7 } },
          ],
        }),
    ];

    const execution = await drive(harness);

    expect(
      harness.session.sendUserMessageCalls,
      "max_rounds: 0 issues NO free-phase turn — ZERO sendUserMessage calls " +
        "(QRY-14 `max_rounds`-final branch at typed-query start; bug 0010)",
    ).toBe(0);
    expect(
      scripted.calls.length,
      "the forced respond turn is the ONLY provider call — exactly ONE complete()",
    ).toBe(1);
    const messages = contextMessagesOf(scripted.calls[0]!);
    expect(
      messages.length,
      "at max_rounds: 0 the respond conversation is a SINGLE user message " +
        "(no session window exists)",
    ).toBe(1);
    expect(messages[0]!["role"], "the fused single message rides the user role").toBe("user");
    expect(
      messageText(messages[0]),
      "the single message is the rendered prompt (right-trimmed of trailing newlines) + " +
        "a single U+000A + the QRY-15 template body, byte-exact (bug-0010 design brief " +
        "§max_rounds: 0 boundary)",
    ).toBe("Ping" + "\n" + qry15Body(lowered, respondToolNameOf(harness)));
    expectValue(execution, { score: 7 }, "the max_rounds: 0 typed query resolves the respond payload");
  });

  it("(f1) ERR-17 wrong-tool arm: a toolUse reply naming 'grep' (attempts 0) is terminal Err(ValidationError) with the synthesised wrong_tool issue and raw_response null", async () => {
    const harness = makeHarness({
      source: TYPED_LIVE_THETA_REPAIR0,
      sessionReplies: [{ stopReason: "stop", text: "free phase text" }],
    });
    scripted.queue = [
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [{ id: "tc-wrong", name: "grep", arguments: {} }],
        }),
    ];

    const execution = await drive(harness);

    expect(
      harness.session.sendUserMessageCalls,
      "one free-phase turn on-session; the non-compliant respond turn adds none",
    ).toBe(1);
    expect(
      scripted.calls.length,
      "exactly ONE complete() — the non-compliant forced respond turn (attempts 0: no repair re-drive)",
    ).toBe(1);
    const err = expectErrOfKind(execution, "validation");
    expect(err.cause, `ERR-17 rides cause schema_validation; observed: ${JSON.stringify(err)}`).toBe(
      "schema_validation",
    );
    expect(err.attempts, "respond_repair.attempts: 0 — terminal at once, zero debits").toBe(0);
    expect(
      err.message,
      "the ERR-17 terminal message is the fixed literal (queryerror-variants.md ERR-17)",
    ).toBe("model did not call the forced respond tool");
    const issues = err.validation_errors as ReadonlyArray<Record<string, unknown>>;
    expect(
      issues?.[0]?.message,
      "the synthesised wrong_tool issue names the provider's tool AND the real respond tool " +
        "(ERR-17 two-arm message; the slug interpolated from the registered name)",
    ).toBe(
      `model invoked tool 'grep' instead of the forced respond tool '${respondToolNameOf(harness)}'`,
    );
    expect(
      err.raw_response,
      "the wrong-tool reply carried no assistant text — raw_response null (ERR-17)",
    ).toBeNull();
  });

  it("(f2) ERR-17 plain-text arm: a text-only 'cannot' stop reply (attempts 0) is terminal Err(ValidationError) with the plain_text issue and raw_response 'cannot'", async () => {
    const harness = makeHarness({
      source: TYPED_LIVE_THETA_REPAIR0,
      sessionReplies: [{ stopReason: "stop", text: "free phase text" }],
    });
    scripted.queue = [() => assistantReply({ stopReason: "stop", text: "cannot" })];

    const execution = await drive(harness);

    expect(
      harness.session.sendUserMessageCalls,
      "one free-phase turn on-session; the non-compliant respond turn adds none",
    ).toBe(1);
    expect(
      scripted.calls.length,
      "exactly ONE complete() — the plain-text non-compliant respond turn",
    ).toBe(1);
    const err = expectErrOfKind(execution, "validation");
    expect(err.cause, `observed: ${JSON.stringify(err)}`).toBe("schema_validation");
    expect(err.attempts, "attempts 0 — terminal at once").toBe(0);
    expect(err.message, "the ERR-17 terminal message").toBe(
      "model did not call the forced respond tool",
    );
    const issues = err.validation_errors as ReadonlyArray<Record<string, unknown>>;
    expect(
      issues?.[0]?.message,
      "the synthesised plain_text issue literal (ERR-17: a normal stop with no ToolCall)",
    ).toBe("model returned plain text instead of calling the forced respond tool");
    expect(
      err.raw_response,
      "raw_response carries the assistant's plain text verbatim (ERR-17)",
    ).toBe("cannot");
  });

  it("(f3) ERR-17 opener seeds the repair follow-up (attempts 1): the FIRST follow-up's <ajv-summary> renders the synthesised plain_text issue, not an empty summary", async () => {
    // Bug 0010 fix round 1 (ERR-17): "the validator_error template's
    // <ajv-summary> placeholder is rendered from this synthesised issue exactly
    // as if AJV had produced it" — a noncompliance OPENER must seed the repair
    // loop's issue state from synthesizeForcedRespondIssue(branch); an empty
    // seed renders "Validation errors: . Return…" instead.
    //
    // The repair attempt is the increment-C two-phase RESTART: its free phase
    // opens as ONE streamed turn (the session double scripts that extra
    // reply), then a fresh off-session dispatch terminates the attempt;
    // complete() is scripted sticky-last. This cell deliberately pins ONLY the
    // follow-up text seed and the terminal outcome shape — the full restart
    // flow is pinned by tests/typed-repair-two-phase.test.ts.
    const harness = makeHarness({
      source: TYPED_LIVE_THETA_REPAIR1,
      sessionReplies: [
        { stopReason: "stop", text: "free phase text" },
        // The repair follow-up's streamed reply: non-JSON prose, so the
        // re-validation fails and the single attempt exhausts.
        { stopReason: "stop", text: "still cannot" },
      ],
    });
    // Sticky-last: the plain-text non-compliant respond reply, repeated for
    // any extra off-session call the drive issues.
    scripted.queue = [() => assistantReply({ stopReason: "stop", text: "cannot" })];

    const execution = await drive(harness);

    // THE LOAD-BEARING PIN: the first follow-up user turn's <ajv-summary> is
    // rendered from the synthesised ERR-17 issue — "<path> <message>" with the
    // empty path, i.e. TWO spaces after "Validation errors:" followed by the
    // ERR-17 plain-text literal (QRY-12 / ERR-14 rendering over the seeded
    // issue). An empty seed renders "Validation errors: . Return…" instead.
    expect(
      harness.session.sentQueryTexts[1],
      "the first repair follow-up's <ajv-summary> renders the synthesised " +
        "plain_text issue exactly as if AJV had produced it (ERR-17; bug 0010 " +
        "fix round 1 — the noncompliance opener seeds latestIssues)",
    ).toContain(
      "Validation errors:  model returned plain text instead of calling the " +
        "forced respond tool. Return your final answer",
    );

    // Minimal terminal-shape pin (Increment C reworks the repair drive): the
    // one re-validated follow-up debits its slot and exhaustion surfaces
    // Err(validation) with attempts 1.
    const err = expectErrOfKind(execution, "validation");
    expect(err.attempts, "the one re-validated follow-up debited its slot").toBe(1);
  });

  it("(g) respond-turn transport classification (0007/0009 alignment on the new seam): stopReason 'error' + errorMessage from complete() is Err(transport) with the RESPOND model's .api provider", async () => {
    const harness = makeHarness({
      source: TYPED_LIVE_THETA,
      sessionReplies: [{ stopReason: "stop", text: "free ok" }],
    });
    scripted.queue = [
      () => assistantReply({ stopReason: "error", errorMessage: "boom auth" }),
    ];

    const execution = await drive(harness);

    expect(
      harness.session.sendUserMessageCalls,
      "one free-phase turn; the failing respond turn is off-session and a transport " +
        "failure terminates repair with no re-drives (QRY-10; bug 0007 discipline)",
    ).toBe(1);
    expect(
      scripted.calls.length,
      "exactly ONE complete() — the transport failure terminates the typed query at the respond turn",
    ).toBe(1);
    const err = expectErrOfKind(execution, "transport");
    expect(err.message, "the provider's errorMessage is CARRIED, not destroyed (PIC-51)").toBe(
      "boom auth",
    );
    expect(
      err.provider,
      "the respond call's provider derives from the RESOLVED RESPOND MODEL's api-shaped " +
        "`.api` (queryerror-variants.md §provider derivation: the typed-query forced " +
        "respond turn takes that resolved model's `.api`; bug 0009 alignment)",
    ).toBe("anthropic-messages");
    expect(err.http_status, "no HTTP status is observable at the complete() seam").toBeNull();
    expect(err.retryable, "an error-stop is a definite outcome — retryable: false").toBe(false);
  });

  it("(h) success extraction PRECEDES stopReason classification: a reply carrying BOTH the matching respond ToolCall AND stopReason 'error' resolves Ok({score: 1})", async () => {
    const harness = makeHarness({
      source: TYPED_LIVE_THETA,
      sessionReplies: [{ stopReason: "stop", text: "free ok" }],
    });
    scripted.queue = [
      () =>
        assistantReply({
          stopReason: "error",
          errorMessage: "late warning",
          toolCalls: [
            { id: "tc1", name: respondToolNameOf(harness), arguments: { score: 1 } },
          ],
        }),
    ];

    const execution = await drive(harness);

    expect(harness.session.sendUserMessageCalls, "one free-phase turn on-session").toBe(1);
    expect(scripted.calls.length, "exactly ONE complete() — the respond turn").toBe(1);
    // binder-inference.md extraction rule (bug 0010): the FIRST ToolCall whose
    // name matches the respond tool supplies the payload, and success
    // extraction PRECEDES stopReason classification — the late 'error' stop
    // never launders a delivered payload into a transport Err.
    expectValue(
      execution,
      { score: 1 },
      "the matching ToolCall's arguments win over the late error stopReason " +
        "(binder-inference.md extraction rule; bug 0010)",
    );
  });

  it("(i) governor armed for typed (CIO-4): the typed drive registers the governor hooks, the free phase runs schema-free under the real cap, and a fabricated 26th round is blocked", async () => {
    let probe: Array<unknown | undefined> | undefined;
    const harness = makeHarness({
      source: TYPED_LIVE_THETA,
      sessionReplies: [{ stopReason: "stop", text: "free thinking" }],
      onMidTurn: (h): void => {
        // Mid-turn (the governor's begin/end window): replay 26 fabricated
        // tool-use rounds through the CAPTURED hooks — the
        // tests/prompt-tool-loop-governor.test.ts observation pattern. With
        // the default `tool_loop.max_rounds` (25), rounds 1..25 are allowed
        // and the 26th is blocked. `undefined` when the hooks were never
        // registered (the pre-fix typed drive).
        probe = runGovernorRoundProbe(h.pi, 26);
      },
    });
    scripted.queue = [
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [
            { id: "tc1", name: respondToolNameOf(harness), arguments: { score: 7 } },
          ],
        }),
    ];

    const execution = await drive(harness);

    // CIO-4 (bug 0010): the governor IS armed for typed turns — pre-fix
    // `ensureRegistered` was gated `!typed`, so no hook was ever registered on
    // a typed drive.
    expect(
      harness.pi.onEvents,
      "a typed drive registers the governor's before_provider_request hook " +
        "(CIO-4: the typed free phase is bounded by tool_loop.max_rounds; bug 0010 — " +
        "pre-fix `governor: typed ? undefined` skipped ensureRegistered)",
    ).toContain("before_provider_request");
    expect(
      harness.pi.onEvents,
      "a typed drive registers the governor's tool_call hook (CIO-4)",
    ).toContain("tool_call");
    expect(
      probe !== undefined,
      "the mid-turn governor probe found the registered hooks and replayed 26 rounds",
    ).toBe(true);
    expect(probe!.length, "the probe replayed all 26 fabricated rounds").toBe(26);
    for (let round = 0; round < 25; round += 1) {
      expect(
        probe![round],
        `fabricated round ${round + 1} of 25 is within the default cap — allowed (undefined)`,
      ).toBeUndefined();
    }
    expect(
      probe![25],
      "the 26th fabricated round exceeds the default tool_loop.max_rounds (25) and is " +
        "BLOCKED — the armed governor bounds the typed free phase (CIO-4/ceiling #2)",
    ).toEqual({ block: true, reason: "tool_loop_exhausted" });

    // The loop config no longer collapses typed to maxRounds 0: the free-phase
    // turn IS driven — distinguishable from the retired fused single turn only
    // via the schema-free sent text (the (a) discipline).
    expect(
      harness.session.sentQueryTexts[0],
      "the driven free-phase turn carries the rendered prompt ONLY — the fused " +
        "schema-bearing text is retired (bug 0010; distinguishes the restored free " +
        "phase from the pre-fix fused single turn)",
    ).toBe("Ping");
    expect(
      harness.session.sendUserMessageCalls,
      "exactly one on-session turn — the governed free-phase turn",
    ).toBe(1);
    expect(scripted.calls.length, "exactly one off-session complete() — the respond turn").toBe(1);
    expectValue(
      execution,
      { score: 7 },
      "an exhausted free phase still terminates through the exempt forced respond turn (CIO-4)",
    );
  });

  it("(j) per-api forced-tool-choice spelling: an openai-completions respond model receives options.toolChoice {type:'function',function:{name}} (bug 0010 fix round 1)", async () => {
    // At the theta-1.0 pi-ai pin the openai-completions adapter passes
    // options.toolChoice through VERBATIM as the OpenAI-native tool_choice
    // (dist/api/openai-completions.d.ts) and mistral-conversations'
    // mapToolChoice reads choice.function.name — {type:"tool",name} breaks
    // both. Theta supplies the per-api spelling (FORCED_TOOL_CHOICE_BY_API);
    // the anthropic cells (a)/(h) keep pinning {type:"tool",name} unchanged.
    const harness = makeHarness({
      source: TYPED_LIVE_THETA_MODEL_OAI,
      availableModels: [ANTHROPIC_MODEL, OPENAI_MODEL],
      sessionReplies: [{ stopReason: "stop", text: "free reply" }],
    });
    scripted.queue = [
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [
            { id: "tc1", name: respondToolNameOf(harness), arguments: { score: 7 } },
          ],
        }),
    ];

    const execution = await drive(harness);

    expect(
      scripted.calls.length,
      "exactly ONE complete() — the off-session forced respond turn",
    ).toBe(1);
    const call = scripted.calls[0]!;
    expect(
      (call.model as { readonly id?: unknown }).id,
      "the respond complete() dispatches against the theta-resolved m-oai model",
    ).toBe("m-oai");
    expect(
      (call.options as Record<string, unknown>)["toolChoice"],
      "an openai-completions respond model takes the provider-native OpenAI-style " +
        "forced-tool spelling (bug 0010 fix round 1; FORCED_TOOL_CHOICE_BY_API)",
    ).toEqual({ type: "function", function: { name: respondToolNameOf(harness) } });
    expectValue(execution, { score: 7 }, "the typed query resolves through the m-oai respond turn");
  });

  it("(k) unresolvable frontmatter model: `model: m-ghost` (no available match) does NOT fall back to ctx.model — Err(transport) provider 'unknown', ZERO complete() calls", async () => {
    // Bug 0010 fix round 1: a PRESENT frontmatter `model:` that matches no
    // available model is a refusal (mirroring the binder's unresolved-reference
    // posture) — never a silent substitution of the session model the author
    // explicitly steered away from. ctx.model is the fallback ONLY when
    // frontmatter omits `model:`.
    const harness = makeHarness({
      source: TYPED_LIVE_THETA_MODEL_GHOST,
      // The registry does NOT carry m-ghost; ctx.model (m1) stays available
      // and must NOT be substituted.
      availableModels: [ANTHROPIC_MODEL],
      sessionReplies: [{ stopReason: "stop", text: "free reply" }],
    });
    scripted.queue = []; // any complete() dispatch would throw loudly

    const execution = await drive(harness);

    expect(
      scripted.calls.length,
      "no resolved respond model — the forced respond turn short-circuits with " +
        "ZERO complete() calls",
    ).toBe(0);
    const err = expectErrOfKind(execution, "transport");
    expect(
      err.provider,
      "the model-unavailable transport Err carries the fixed sentinel provider",
    ).toBe("unknown");
    expect(
      err.message,
      "the existing generic model-unavailable message surfaces (no new literal)",
    ).toContain("no resolved model");
  });

  it("(l) aborted respond dispatch: complete() RESOLVES an abort (stopReason 'aborted') — Err(transport) message 'cancelled', never ERR-17 noncompliance", async () => {
    // Bug 0010 fix round 1: pi-ai's complete() resolves aborts (the adapter
    // surfaces stopReason "aborted"), it does not reject — the rejection catch
    // arm never sees them. The dispatch maps an aborted reply (or an aborted
    // respond signal) to the fixed "cancelled" transport Err, mirroring the
    // prompt path's aborted precedence; extraction still wins when a matching
    // ToolCall is present (cell (h)'s precedence, unchanged).
    //
    // DISTINCTION KEPT PINNED (fix review, F1): the THETA SIGNAL is never
    // aborted in this cell — the "aborted" stop is purely reply-side — so the
    // outcome is legitimately Err(transport), NOT the cancelled terminal
    // outcome (which requires an aborted theta signal; cell (m) pins that
    // side).
    const harness = makeHarness({
      source: TYPED_LIVE_THETA,
      sessionReplies: [{ stopReason: "stop", text: "free ok" }],
    });
    scripted.queue = [() => assistantReply({ stopReason: "aborted" })];

    const execution = await drive(harness);

    expect(scripted.calls.length, "exactly ONE complete() — the aborted respond turn").toBe(1);
    const err = expectErrOfKind(execution, "transport");
    expect(
      err.message,
      "the aborted respond dispatch maps to the fixed 'cancelled' message " +
        "(bug 0010 fix round 1 — complete() resolves aborts, it does not reject)",
    ).toBe("cancelled");
    expect(
      err.provider,
      "provider derives from the resolved respond model's `.api`",
    ).toBe("anthropic-messages");
  });

  it("(m) Esc DURING the free-phase streamed turn: the CANCEL terminal outcome — never Err(transport 'cancelled') — and ZERO post-abort complete() dispatches", async () => {
    // Bug 0010 fix review, F1 (regression pin). Pre-fix `runTypedQueryLoop`
    // re-checked `signal.aborted` only at free-phase ROUND TOPS: an Esc during
    // the streamed free-phase turn (the CANCEL-2 route — the per-turn
    // `ctx.signal` aborts, the drive flips thetaAbort after the turn settles,
    // and the post-idle probe's aborted arm synthesises `cancelled`, which is
    // NOT a transport verdict, so the turn still surfaced as `text`) fell
    // through the text break into a POST-ABORT forcedRespondTurn dispatch,
    // whose aborted arm returned {kind:"transport", message:"cancelled"} —
    // surfaced as Err(TransportError). The pinned contract: an aborted
    // in-flight query is the CANCELLED terminal outcome (cancellation.md
    // §Surfacing; error-model.md §Terminal outcomes) and an aborted query
    // issues NO post-abort provider dispatch (the r7 discipline applied to
    // the INITIAL forced respond turn).
    const harness = makeHarness({
      source: TYPED_LIVE_THETA,
      // The streamed turn completes normally — the cancellation is observed
      // via the planted per-turn ctx.signal, not via the reply.
      sessionReplies: [{ stopReason: "stop", text: "free ok" }],
      onMidTurn: (h): void => {
        // An Esc while the free-phase turn is in flight: pi surfaces the
        // per-turn ctx.signal only while a turn streams (idle entry models
        // `signal: undefined`), so the hook plants an already-aborted signal
        // mid-turn (the tests/typed-repair-two-phase.test.ts r7 trigger).
        (h.ctx as unknown as { signal: AbortSignal | undefined }).signal =
          AbortSignal.abort();
      },
    });
    // The queue stays EMPTY: the contract forbids ANY post-abort dispatch — a
    // complete() call would throw loudly AND fail the count pin.
    scripted.queue = [];

    const execution = await drive(harness);

    expect(
      execution.outcome,
      "cancellation is its own TERMINAL OUTCOME — the cancel arm, never a fail " +
        "outcome carrying Err(transport 'cancelled') fabricated by a post-abort " +
        "respond dispatch (cancellation.md §Surfacing; bug 0010 fix review F1)",
    ).toBe("cancel");
    expect(
      scripted.calls.length,
      "ZERO complete() calls — the aborted typed query never dispatches the " +
        "off-session forced respond turn (pre-fix: 1 post-abort dispatch)",
    ).toBe(0);
    expect(
      harness.session.sendUserMessageCalls,
      "exactly one on-session turn — the free-phase turn the abort landed in",
    ).toBe(1);
  });

  it("(g2) respond-side provider derivation, NON-degenerate (fix review F7a): a theta-resolved m-oai respond model failing at dispatch carries provider 'openai-completions' — NOT ctx.model's api", async () => {
    // Cell (g) pins the derivation only degenerately (no frontmatter model:,
    // so respondModel ≡ ctx.model and either feed read passes). Here the
    // RESOLVED respond model's api (openai-completions) DIFFERS from
    // ctx.model.api (anthropic-messages), so a wrong-feed read — deriving the
    // provider from the session model instead of the resolved respond model —
    // fails loudly (queryerror-variants.md §provider derivation: the typed
    // forced respond turn takes the RESOLVED model's api-shaped `.api`).
    const harness = makeHarness({
      source: TYPED_LIVE_THETA_MODEL_OAI,
      availableModels: [ANTHROPIC_MODEL, OPENAI_MODEL],
      sessionReplies: [{ stopReason: "stop", text: "free ok" }],
    });
    scripted.queue = [
      () => assistantReply({ stopReason: "error", errorMessage: "boom oai" }),
    ];

    const execution = await drive(harness);

    expect(
      scripted.calls.length,
      "exactly ONE complete() — the failing respond dispatch (no repair re-drives)",
    ).toBe(1);
    expect(
      (scripted.calls[0]!.model as { readonly id?: unknown }).id,
      "the respond dispatch ran against the theta-resolved m-oai model",
    ).toBe("m-oai");
    const err = expectErrOfKind(execution, "transport");
    expect(err.message, "the provider's errorMessage is carried (PIC-51)").toBe("boom oai");
    expect(
      err.provider,
      "provider = the RESOLVED RESPOND MODEL's api-shaped `.api` — " +
        "'openai-completions', never the ctx session model's 'anthropic-messages' " +
        "(queryerror-variants.md §provider derivation; fix review F7a)",
    ).toBe("openai-completions");
    expect(err.http_status, "no HTTP status at the complete() seam").toBeNull();
    expect(err.retryable, "an error-stop is definite — retryable: false").toBe(false);
  });
});

// ===========================================================================
// Residual pin (bug 0010 fix review, F5) — the degraded unlowerable-annotation
// arm DELIBERATELY keeps the pre-0010 fused mechanism; this describe makes the
// residual visible instead of silent (see the bug doc's Fix §Residuals).
// ===========================================================================

describe("bug 0010 (residual pin) — degraded unlowerable annotation (`@<>`): the fused mechanism survives and the payload binds UNVALIDATED", () => {
  it("(deg-live) `@<>` drives ONE fused user-visible JSON-in-text turn, ZERO complete(), ZERO respond-tool registrations, and binds the parsed payload with NO AJV", async () => {
    // Reachability (fix review F5 investigation): `lowerQueryResponseSchema`
    // returns `undefined` ONLY for an empty/whitespace annotation — the
    // parser captures `@<>` as `schema: ""` with no diagnostic; every
    // non-empty annotation lowers (unresolved names lower permissively since
    // bug 0004). So this author-error form is the arm's ONLY entry.
    const harness = makeHarness({
      source: TYPED_LIVE_THETA_UNLOWERABLE,
      // The fused turn's streamed reply: JSON that NO schema sanctioned — it
      // must bind verbatim, proving the arm validates nothing.
      sessionReplies: [
        { stopReason: "stop", text: '{"unvalidated": true, "score": "not-a-number"}' },
      ],
    });
    scripted.queue = []; // any complete() dispatch would throw loudly

    const execution = await drive(harness);

    expect(
      harness.session.sendUserMessageCalls,
      "the degraded arm keeps the fused mechanism — exactly ONE user-visible turn",
    ).toBe(1);
    expect(
      harness.session.sentQueryTexts[0],
      "the fused turn carries the pre-0010 typed-aware text — the JSON-only " +
        "instruction with the (unlowerable, hence empty) shape inlined",
    ).toBe(
      "Ping\n\nRespond with ONLY a single minified JSON object matching this JSON " +
        "schema, and nothing else — no prose, no markdown, no code fences: ",
    );
    expect(
      scripted.calls.length,
      "no respond context exists — ZERO off-session complete() dispatches",
    ).toBe(0);
    expect(
      harness.pi.registeredTools.length,
      "no respond tool is registered on the degraded arm",
    ).toBe(0);
    // THE RESIDUAL: the text-parsed payload binds UNVALIDATED — no lowered
    // schema exists, so no schema-validation collaborator (and no AJV) is
    // built; only the loop's CIO-3 depth walk ran (bug doc Fix §Residuals).
    expectValue(
      execution,
      { unvalidated: true, score: "not-a-number" },
      "the degraded arm binds the parsed JSON verbatim — NO AJV runs (residual, " +
        "bug 0010 fix review F5)",
    );
  });
});

// ===========================================================================
// Control — was green before the fix and stays green after it; it proves the
// drive reaches the live seam and pins the free-phase transport path the fix
// did not move.
// ===========================================================================

describe("bug 0010 (control) — free-phase transport failure precedes any respond dispatch", () => {
  it("(g-control) a stopReason 'error' on the streamed turn is Err(transport) BEFORE any complete() call — complete() count 0 (PIC-51 unchanged)", async () => {
    // Green across the fix: pre-fix the ONE driven (fused) turn's trailing
    // error-stop classified as transport (bugs 0007/0009); post-fix the
    // FREE-PHASE turn's transport failure terminates the typed query before
    // the off-session forced respond turn is dispatched (query-tool-loop.md:
    // a free-phase transport failure aborts the typed query before the
    // forced-respond terminator).
    const harness = makeHarness({
      source: TYPED_LIVE_THETA,
      sessionReplies: [{ stopReason: "error", errorMessage: "free boom" }],
    });
    scripted.queue = []; // any complete() dispatch would throw loudly

    const execution = await drive(harness);

    expect(
      harness.session.sendUserMessageCalls,
      "exactly one on-session turn — the failing streamed turn",
    ).toBe(1);
    expect(
      scripted.calls.length,
      "the free-phase transport failure terminates the typed query BEFORE any " +
        "off-session complete() dispatch — complete() count 0",
    ).toBe(0);
    const err = expectErrOfKind(execution, "transport");
    expect(err.message, "the provider's errorMessage is carried (PIC-51)").toBe("free boom");
    expect(
      err.provider,
      "the free-phase failure derives provider from ctx.model.api (PIC-50/51 — bug 0009, unchanged)",
    ).toBe("anthropic-messages");
    expect(err.http_status).toBeNull();
    expect(err.retryable).toBe(false);
  });
});
