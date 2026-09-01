// Bug 0010 — INCREMENT C: respond-repair RESTARTS the whole two-phase loop on
// the LIVE prompt-mode path (regression pins — these cells red before the
// increment-C fix and now pin the fixed behaviour).
//
// docs/bugs/0010-typed-forced-respond-user-visible-no-toolchoice.md
// §"Respond-repair follow-ups" row + the fix brief §RESPOND-REPAIR: with
// Increments A+B in the tree, the INITIAL typed dispatch was two-phase (free
// phase on-session, forced respond off-session through pi-ai `complete()`),
// but each PRE-FIX respond-repair attempt still drove through the OLD
// `driveStreamedUserTurn` — one user-visible turn whose trailing assistant
// TEXT was JSON-parsed as the corrected payload. No respond tool was armed for
// the repair turn, no governor bounded it, and no fresh off-session forced
// respond dispatch terminated it. The spec pins a FULL TWO-PHASE RESTART per
// attempt instead (query-tool-loop.md QRY-14 ¶3: respond-repair follow-ups
// "restart the *whole* two-phase loop — the model may need to retool … before
// answering the repair request — and each follow-up gets a fresh `tool_loop`
// budget"; conversation-drive.md typed-query bullet: "respond-repair
// follow-ups … restart the whole two-phase loop with a fresh `tool_loop`
// budget"):
//
//   1. The QRY-12 methodology template (validator_error default) is sent as an
//      ON-SESSION user turn via `pi.sendUserMessage` — the OPENING turn of a
//      RESTARTED free phase: respond tool active in the PIC-17 install vector,
//      governor re-armed with a FRESH `max_rounds` budget (QRY-16), the
//      early-respond capture RESET/re-armed so the model may answer the repair
//      request by CALLING the respond tool mid-turn.
//   2. When that turn text-terminates (or its budget exhausts — CIO-4's
//      `max_rounds`-final branch, which on a typed query dispatches the
//      exempt terminator, never `tool_loop_exhausted`), a FRESH off-session
//      forced respond turn dispatches: `complete()` with the SAME
//      tools+toolChoice shape, messages = the query window (which now includes
//      the original turns AND the follow-up turn) + the trailing QRY-15
//      template message. Extraction / ERR-17 / transport classification are
//      identical to the initial respond turn.
//   3. A transport/overflow failure ANYWHERE in the attempt (follow-up send
//      sync-throw, streamed-turn error-stop, respond-dispatch failure)
//      terminates repair with the PROXIMATE error and NO attempts debit
//      (query-failure-and-repair.md §"Non-validation failures during a
//      respond-repair follow-up"; bug 0007 discipline). A validated payload →
//      value; an AJV failure → next attempt (issues update); an ERR-17
//      noncompliance → next attempt (the synthesised issue drives the next
//      `<ajv-summary>`) — one debit each.
//   4. `max_rounds: 0` boundary: a repair attempt issues NO on-session turn;
//      the off-session call's SINGLE user message is the QRY-12 follow-up
//      template TEXT ALONE (it already carries the instruction + schema —
//      QRY-15 is NOT concatenated after it, and no prompt fusion applies).
//
// Spec: query/query-tool-loop.md (QRY-14 ¶3 restart, QRY-15 template bytes,
// QRY-16 fresh per-follow-up `tool_loop` budget, CIO-4),
// query/query-failure-and-repair.md (QRY-11 respond-repair, QRY-12 template
// bytes + `<ajv-summary>`, §Non-validation failures — proximate propagation,
// no debit), pi-integration-contract/conversation-drive.md (typed-query
// bullet: restart + off-session respond; SLSH-2 via slash-invocation.md),
// errors-and-results/queryerror-variants.md (ERR-14 issue order, ERR-17
// synthesised issues), pi-integration-contract/tool-registration-lifetime.md
// (PIC-17 install vector, PIC-44 registration cache).
//
// Method: the tests/typed-two-phase-live.test.ts harness, DUPLICATED per the
// increment-C rules (that suite stays untouched; its cell (f3) deliberately
// pinned only the follow-up-text seed + terminal shape so it survives this
// increment). The LiveSessionDouble here additionally supports PER-TURN
// mid-turn hooks (the AB double fires one hook on the FIRST turn only), so a
// cell can invoke the registered respond tool's `execute` — or replay
// fabricated governor rounds — during the SECOND (repair follow-up) streamed
// turn. Scripted `complete()` queue + session replies keep the bug-0007
// sticky-last + throw-on-unscripted discipline. Every cell asserts BOTH
// counters (`sendUserMessage`, `complete()`) so the two-phase shape is pinned
// everywhere. Deterministic; no live network.

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
import { respondSchemaSlug } from "../src/runtime/typed-query-validation";
import { renderFollowUpTurn } from "../src/runtime/query-followup-render";
import {
  synthesizeForcedRespondIssue,
  type ValidationIssue,
} from "../src/runtime/query-error";

// --- The resolved models ------------------------------------------------------

/** The user session's selected model (`ctx.model`) — also the respond fallback. */
const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};

// --- The driven thetas ----------------------------------------------------------
// Prompt-mode thetas whose TOP-LEVEL typed `@`-query drives the LIVE seam
// (`userVisible: true` → `LivePromptQueryModel`). All share the same `Verdict`
// schema so one lowered-schema/slug fixture serves every cell.

/** Cells (r1)(r2)(r4)(r4b): ONE repair attempt is budgeted. */
const REPAIR1_THETA = [
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

/** Cell (r3): TWO attempts budgeted — the transport failure must stop attempt 2. */
const REPAIR2_THETA = [
  "---",
  "mode: prompt",
  "respond_repair:",
  "  attempts: 2",
  "---",
  "schema Verdict {",
  "  score: number",
  "}",
  "let v: Verdict = @`Ping`?",
  "v",
  "",
].join("\n");

/** Cell (r5): the QRY-14 `max_rounds: 0` boundary + one repair attempt. */
const MAX0_REPAIR1_THETA = [
  "---",
  "mode: prompt",
  "tool_loop:",
  "  max_rounds: 0",
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

/** Cell (r6): `max_rounds: 2` — the fresh-budget re-arm probe's cap. */
const ROUNDS2_REPAIR1_THETA = [
  "---",
  "mode: prompt",
  "tool_loop:",
  "  max_rounds: 2",
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

// --- The lowered `Verdict` schema / slug / QRY-15 template ---------------------

/**
 * The lowered `Verdict` response schema, its slug, and the respond tool name —
 * computed through the SAME production collaborators the runtime uses
 * (`lowerQueryResponseSchema` + `respondSchemaSlug`,
 * src/runtime/typed-query-validation.ts), so the pins below are byte-exact
 * against the contract, not against copied constants.
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
  const doc = parse(REPAIR1_THETA);
  const decls = doc.body.statements.filter(
    (stmt): stmt is SchemaDecl => stmt.kind === "schema",
  );
  const lowered = lowerQueryResponseSchema("Verdict", decls);
  if (lowered === undefined) {
    throw new Error("fixture defect: the Verdict schema annotation must lower");
  }
  const slug = respondSchemaSlug(lowered);
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
 * mandated trailing U+000A. The REPAIR attempt's fresh respond dispatch trails
 * the SAME template (the restart re-enters the same forced-respond mechanism).
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

/**
 * The EXACT QRY-12 `validator_error` follow-up bytes for an AJV-rejected
 * payload: the probe validates `payload` through the SAME production AJV
 * collaborator the loop uses, maps the errors to `ValidationIssue`s exactly as
 * src/runtime/typed-query-validation.ts `validateAgainst` does
 * (`instancePath`/`message`/`keyword`), and renders through the production
 * QRY-12 renderer — so the expectation is byte-derived from the contract, not
 * a hardcoded AJV message string.
 */
function expectedValidatorErrorFollowUp(payload: unknown): string {
  const { lowered, slug } = respondFixture();
  const verdict = ajv().compile(lowered).validate(payload);
  if (verdict.ok) {
    throw new Error("fixture defect: the probe payload must FAIL AJV validation");
  }
  const issues: ValidationIssue[] = verdict.errors.map((e) => ({
    path: e.instancePath,
    message: e.message,
    schema_keyword: e.keyword,
  }));
  return renderFollowUpTurn({
    methodology: "validator_error",
    loweredSchema: lowered,
    slug,
    issues,
  });
}

/**
 * The EXACT QRY-12 `validator_error` follow-up bytes for an ERR-17
 * noncompliance opener: the `<ajv-summary>` renders the single synthesised
 * issue exactly as if AJV had produced it (empty path → the double space).
 */
function expectedNoncomplianceFollowUp(): string {
  const { lowered, slug } = respondFixture();
  return renderFollowUpTurn({
    methodology: "validator_error",
    loweredSchema: lowered,
    slug,
    issues: [synthesizeForcedRespondIssue({ kind: "plain_text" })],
  });
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
 * The live user-session double the on-session turns drive (duplicated from
 * tests/typed-two-phase-live.test.ts; increment-C extension: PER-TURN mid-turn
 * hooks):
 *
 *  - `sendUserMessage` commits the `user` entry and marks the session
 *    streaming;
 *  - `tick()` (invoked from the injected `Clock`'s `setTimeout`) completes the
 *    in-flight streamed turn — firing the hook registered for THAT turn
 *    ordinal FIRST (mid-turn, so a cell can call the registered respond tool's
 *    `execute` or replay governor events while the REPAIR follow-up turn is
 *    live), then committing the scripted trailing `assistant` entry;
 *  - the reply queue is STICKY-LAST (the bug-0007 discipline): a runtime that
 *    drives MORE turns than the restart contract scripts keeps observing the
 *    terminal reply, so over-driving stays observable as the
 *    `sendUserMessageCalls` COUNT pin instead of a mid-flight harness throw;
 *  - `entries` back `ctx.sessionManager.getEntries()` — the PIC-51/PIC-53 read
 *    surface AND the query-window rebuild surface the off-session respond
 *    turns (initial AND repair) read (bug 0010).
 */
class LiveSessionDouble {
  readonly entries: SessionEntryDouble[] = [];
  /** Proof of ON-SESSION traffic (the off-session respond turns issue none). */
  sendUserMessageCalls = 0;
  readonly sentQueryTexts: string[] = [];
  /** Per-turn one-shot mid-turn hooks, keyed by 0-based driven-turn ordinal. */
  readonly midTurnHooks = new Map<number, () => void>();

  #idle = true;
  #completedTurns = 0;
  readonly #firedMidTurnHooks = new Set<number>();
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
    const turn = this.#completedTurns;
    const hook = this.midTurnHooks.get(turn);
    if (hook !== undefined && !this.#firedMidTurnHooks.has(turn)) {
      // The turn is live: the governor (if re-armed) is between `begin`/`end`
      // and the respond capture slot (if re-armed) is active — exactly the
      // window the repair-turn early-respond and fresh-budget cells need.
      this.#firedMidTurnHooks.add(turn);
      hook();
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
 * every `pi.on` registration + handler (the CIO-4 governor probe surface).
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
        return ["ambient-a"];
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
 * suites): the `ModelRegistry` double carries `getAvailable` (the frontmatter
 * `model:` resolution surface) and `getApiKeyAndHeaders` (the respond call's
 * auth threading copied from `#completeBinderReply`).
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
  /** Present only when the cell supplied one (see makeHarness opts.thetaAbort). */
  readonly thetaAbort?: AbortController;
}

function makeHarness(opts: {
  readonly source: string;
  readonly sessionReplies: readonly ScriptedAssistantReply[];
  /**
   * Cancellation cells (bug 0010 fix round 2, R2-1): the harness-owned
   * per-invocation controller, threaded as the bind input's `thetaAbort` so a
   * scripted `complete()` factory can abort the theta signal mid-flight (the
   * off-session suite's established pattern, applied to the live binding).
   */
  readonly thetaAbort?: AbortController;
  /**
   * Per-turn one-shot mid-turn hooks, keyed by 0-based driven-turn ordinal —
   * turn 0 is the ORIGINAL free-phase turn, turn 1 the FIRST repair follow-up
   * turn. Fired inside the turn's in-flight `tick()`, before the assistant
   * reply commits.
   */
  readonly midTurnHooks?: ReadonlyArray<
    readonly [turn: number, hook: (harness: TwoPhaseHarness) => void]
  >;
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
    modelRegistry: registryDouble([ANTHROPIC_MODEL]),
  });
  const harness: TwoPhaseHarness = {
    session,
    pi,
    deps,
    theta,
    ctx: ctxDouble(session, ANTHROPIC_MODEL),
    ...(opts.thetaAbort !== undefined ? { thetaAbort: opts.thetaAbort } : {}),
  };
  for (const [turn, hook] of opts.midTurnHooks ?? []) {
    session.midTurnHooks.set(turn, (): void => hook(harness));
  }
  return harness;
}

/** Drive the harness theta once through the PRODUCTION prompt-mode binding. */
async function drive(harness: TwoPhaseHarness): Promise<BodyExecution> {
  const binding = harness.deps.bindPromptConversation({
    theta: harness.theta,
    args: "",
    ctx: harness.ctx,
    ...(harness.thetaAbort !== undefined ? { thetaAbort: harness.thetaAbort } : {}),
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
 * name so cells stay total before registration happens.
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
 * (the tests/prompt-tool-loop-governor.test.ts observation pattern, via the AB
 * suite): each round is one `before_provider_request` followed by one
 * `tool_call`, returning each round's first non-undefined
 * `ToolCallEventResult` (`undefined` = the round was ALLOWED; a `{block:true}`
 * result = the governor blocked it). Returns `undefined` when the governor
 * hooks were never registered.
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

/** Invoke the registered respond tool's `execute` as the model would mid-turn. */
function invokeRespondExecute(
  definition: ToolDefinition,
  id: string,
  params: unknown,
): Promise<unknown> {
  return (
    definition.execute as unknown as (
      id: string,
      params: unknown,
      signal: AbortSignal | undefined,
    ) => Promise<unknown>
  )(id, params, new AbortController().signal);
}

/** Read a respond-tool `execute` result's joined text parts. */
function executeResultText(result: unknown): string {
  const shaped = result as {
    readonly content?: ReadonlyArray<{ readonly type?: unknown; readonly text?: unknown }>;
  };
  return (shaped.content ?? [])
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("");
}

beforeEach(() => {
  scripted.queue = [];
  scripted.calls = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// Regression pins — the restart contract (red before Increment C). PRE-FIX
// each repair attempt drove ONE user-visible streamed turn through the OLD
// `driveStreamedUserTurn` and text-parsed its trailing assistant reply —
// no fresh off-session respond dispatch, no capture arming, no governor
// re-arm, and the `max_rounds: 0` boundary still drove an on-session turn.
// ===========================================================================

describe("bug 0010 increment C (regression pins) — respond-repair restarts the whole two-phase loop on the live path (QRY-14 ¶3, QRY-11/QRY-12, QRY-16)", () => {
  it("(r1) AJV-fail then repaired: the QRY-12 follow-up opens a restarted free phase ON-SESSION, then a FRESH off-session respond dispatch over the grown window resolves {score: 9}", async () => {
    const { lowered } = respondFixture();
    const harness = makeHarness({
      source: REPAIR1_THETA,
      sessionReplies: [
        // The ORIGINAL free-phase turn's streamed reply.
        { stopReason: "stop", text: "thinking done" },
        // The REPAIR follow-up turn's streamed reply (the restarted free
        // phase): plain prose — the corrected payload arrives via the repair
        // attempt's OFF-SESSION respond dispatch, never via text-parse of this
        // reply (the retired driveStreamedUserTurn mechanism).
        { stopReason: "stop", text: "reworking the answer" },
      ],
    });
    scripted.queue = [
      // complete() #1 — the INITIAL forced respond turn: an AJV-rejected
      // payload ({score: "bad"} vs number) opens respond-repair.
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [
            { id: "tc1", name: respondToolNameOf(harness), arguments: { score: "bad" } },
          ],
        }),
      // complete() #2 — the REPAIR attempt's FRESH forced respond turn: the
      // corrected, schema-valid payload.
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [
            { id: "tc2", name: respondToolNameOf(harness), arguments: { score: 9 } },
          ],
        }),
    ];

    const execution = await drive(harness);

    // The original free phase opens with the rendered prompt ONLY (QRY-14
    // step 1 — pinned green by the AB suite, re-asserted for self-containment).
    expect(
      harness.session.sentQueryTexts[0],
      "the original free-phase user turn is the rendered prompt ONLY (QRY-14 step 1)",
    ).toBe("Ping");
    // EXACTLY two on-session turns: the original free phase + the ONE repair
    // attempt's restarted-free-phase opener. The off-session respond dispatches
    // add none (SLSH-2).
    expect(
      harness.session.sendUserMessageCalls,
      "exactly TWO sendUserMessage calls — the original free-phase turn plus the repair " +
        "attempt's QRY-12 follow-up opener (QRY-11: the follow-up is a NEW user turn; " +
        "SLSH-2: the off-session respond dispatches add none)",
    ).toBe(2);
    // The repair opener is the QRY-12 validator_error template, byte-exact,
    // rendered over the REAL AJV issues of the rejected payload (QRY-12
    // verbatim-template rule + ERR-14 issue order). Byte-derived in-test from
    // the production AJV + renderer, never a hardcoded message string.
    expect(
      harness.session.sentQueryTexts[1],
      "the repair attempt's ON-SESSION opener is the QRY-12 validator_error template, " +
        "byte-exact over the most recent AJV failure's issues (QRY-12/ERR-14)",
    ).toBe(expectedValidatorErrorFollowUp({ score: "bad" }));

    // THE RESTART PIN (red pre-fix): the repair attempt terminates with a FRESH
    // off-session forced respond dispatch — a SECOND complete() call. Pre-fix
    // the repair text-parsed the streamed reply instead and never re-dispatched.
    expect(
      scripted.calls.length,
      "TWO complete() calls — the initial forced respond turn AND the repair attempt's " +
        "FRESH off-session forced respond turn (QRY-14 ¶3: each follow-up restarts the " +
        "whole two-phase loop; bug 0010 increment C)",
    ).toBe(2);

    const repairCall = scripted.calls[1]!;
    // SAME tools+toolChoice shape as the initial respond dispatch (the restart
    // re-enters the same forced-respond mechanism — spec finding T34's channel).
    expect(
      (repairCall.options as Record<string, unknown>)["toolChoice"],
      "the repair respond dispatch forces the SAME respond tool via options.toolChoice " +
        "(QRY-14 step 2, unchanged by the restart)",
    ).toEqual({ type: "tool", name: respondToolNameOf(harness) });
    const tools = (repairCall.context as { readonly tools?: unknown }).tools as
      | readonly Record<string, unknown>[]
      | undefined;
    expect(
      Array.isArray(tools) && tools.length === 1 && tools[0]!["name"] === respondToolNameOf(harness),
      `the repair respond dispatch carries exactly the respond tool; observed: ${JSON.stringify(tools)}`,
    ).toBe(true);

    // The repair respond conversation is the QUERY WINDOW — which now includes
    // the ORIGINAL turns AND the follow-up turn — plus the trailing QRY-15
    // template (QRY-11: "the conversation history, including the malformed
    // response …, stays intact"; the window start is recorded ONCE per query
    // and never rewound to the follow-up's send position).
    const messages = contextMessagesOf(repairCall);
    expect(
      messages[0]!["role"],
      "the repair respond window still opens at the ORIGINAL query's first user turn",
    ).toBe("user");
    expect(
      messageText(messages[0]),
      "the repair respond window's first message is the original 'Ping' turn",
    ).toContain("Ping");
    const followUpText = expectedValidatorErrorFollowUp({ score: "bad" });
    const followUpIndex = messages.findIndex(
      (message) => message["role"] === "user" && messageText(message) === followUpText,
    );
    expect(
      followUpIndex,
      "the repair respond window CONTAINS the QRY-12 follow-up user turn (the window " +
        "now includes the follow-up turn — QRY-14 ¶3)",
    ).toBeGreaterThan(0);
    const trailing = messages[messages.length - 1]!;
    expect(trailing["role"], "the trailing template rides a user message").toBe("user");
    expect(
      messageText(trailing),
      "the repair respond dispatch trails the QRY-15 template, byte-exact (the restart " +
        "re-enters the same forced-respond mechanism)",
    ).toBe(qry15Body(lowered, respondToolNameOf(harness)));
    expect(
      followUpIndex,
      "the QRY-12 follow-up turn precedes the trailing QRY-15 template in the window",
    ).toBeLessThan(messages.length - 1);

    // The corrected payload resolves the typed query (one attempt debited).
    expectValue(
      execution,
      { score: 9 },
      "the repair attempt's fresh respond dispatch supplies the corrected payload " +
        "and the typed query resolves (QRY-11)",
    );
  });

  it("(r2) ERR-17 noncompliance then repaired: the follow-up's <ajv-summary> renders the synthesised plain_text issue and the repair attempt's fresh respond dispatch resolves", async () => {
    const harness = makeHarness({
      source: REPAIR1_THETA,
      sessionReplies: [
        { stopReason: "stop", text: "free phase text" },
        { stopReason: "stop", text: "let me use the tool" },
      ],
    });
    scripted.queue = [
      // complete() #1 — a plain-text reply on a normal stop: ERR-17
      // non-compliance (plain_text branch), one attempt debit.
      () => assistantReply({ stopReason: "stop", text: "nope" }),
      // complete() #2 — the repair attempt's fresh respond dispatch complies.
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [
            { id: "tc2", name: respondToolNameOf(harness), arguments: { score: 4 } },
          ],
        }),
    ];

    const execution = await drive(harness);

    expect(
      harness.session.sendUserMessageCalls,
      "exactly TWO on-session turns — the original free phase + the repair opener",
    ).toBe(2);
    // The ERR-17 seed (green since the AB suite's (f3)): the noncompliance
    // opener's <ajv-summary> renders the synthesised issue — empty path, so a
    // DOUBLE SPACE after 'Validation errors:' — exactly as if AJV had produced
    // it. Pinned byte-exact via the production renderer AND by the literal
    // substring for readability.
    expect(
      harness.session.sentQueryTexts[1],
      "the repair opener's <ajv-summary> renders the ERR-17 synthesised plain_text " +
        "issue (empty path → double space; queryerror-variants.md ERR-17)",
    ).toContain(
      "Validation errors:  model returned plain text instead of calling the " +
        "forced respond tool. Return your final answer",
    );
    expect(
      harness.session.sentQueryTexts[1],
      "the repair opener is the full QRY-12 validator_error template over the " +
        "synthesised issue, byte-exact",
    ).toBe(expectedNoncomplianceFollowUp());

    // The restart pin (red pre-fix): a fresh off-session respond dispatch
    // terminates the repair attempt.
    expect(
      scripted.calls.length,
      "TWO complete() calls — the non-compliant initial respond turn AND the repair " +
        "attempt's fresh respond dispatch (QRY-14 ¶3 restart)",
    ).toBe(2);
    expectValue(
      execution,
      { score: 4 },
      "the repair attempt recovers the ERR-17 noncompliance: the fresh respond " +
        "dispatch's payload validates and resolves the query",
    );
  });

  it("(r3) transport during the repair attempt's respond dispatch: the PROXIMATE transport error terminates repair — no attempts debit, no second attempt driven", async () => {
    const harness = makeHarness({
      source: REPAIR2_THETA,
      // Scripted sticky-last: the pre-fix implementation drove BOTH budgeted
      // attempts as streamed turns; the count pins below keep that observable.
      sessionReplies: [
        { stopReason: "stop", text: "free phase text" },
        { stopReason: "stop", text: "repair follow-up reply" },
      ],
    });
    scripted.queue = [
      // complete() #1 — AJV-rejected payload opens repair.
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [
            { id: "tc1", name: respondToolNameOf(harness), arguments: { score: "bad" } },
          ],
        }),
      // complete() #2 — the repair attempt's respond dispatch FAILS at the
      // transport layer (stopReason 'error'). Sticky-last: any further dispatch
      // keeps observing this failure, so over-driving shows in the count pin.
      () => assistantReply({ stopReason: "error", errorMessage: "dead" }),
    ];

    const execution = await drive(harness);

    // QRY-11 §Non-validation failures: the proximate transport failure WINS —
    // the query returns Err(transport), never Err(validation) with the prior
    // attempt count (pre-fix: attempts 2 exhausted through text-parse and the
    // query mis-surfaced validation).
    const err = expectErrOfKind(execution, "transport");
    expect(
      err.message,
      "the PROXIMATE transport error propagates verbatim (QRY-11 §non-validation: " +
        "'the proximate cause wins'; bug 0007 discipline on the new seam)",
    ).toBe("dead");
    expect(
      err.provider,
      "the repair respond dispatch's provider derives from the RESOLVED RESPOND " +
        "MODEL's api-shaped `.api` (queryerror-variants.md §provider derivation)",
    ).toBe("anthropic-messages");
    expect(err.http_status, "no HTTP status is observable at the complete() seam").toBeNull();
    expect(err.retryable, "the no-HTTP-response class routes retryable:true (provider-error-mapping.md:7/:13; bug 0291)").toBe(true);

    // Termination WITHOUT debit: the transport failure consumes no attempts
    // slot, so the SECOND budgeted attempt is never driven — no third
    // complete() and no third on-session turn.
    expect(
      scripted.calls.length,
      "exactly TWO complete() calls — the transport failure terminates repair " +
        "immediately; the second budgeted attempt never dispatches (QRY-11: a " +
        "non-validation follow-up consumes NO attempts slot)",
    ).toBe(2);
    expect(
      harness.session.sendUserMessageCalls,
      "exactly TWO on-session turns — the original free phase + the ONE repair opener; " +
        "attempt 2 is never driven after the transport termination",
    ).toBe(2);
  });

  it("(r4) early respond during the REPAIR free phase: a valid mid-turn respond-tool call captures {score: 5} and the repair attempt needs NO off-session dispatch", async () => {
    let earlyPlaced = false;
    let earlyResult: Promise<unknown> | undefined;
    const harness = makeHarness({
      source: REPAIR1_THETA,
      sessionReplies: [
        // Turn 0 — the original free phase: no early call here.
        { stopReason: "stop", text: "no early call yet" },
        // Turn 1 — the REPAIR follow-up turn: the mid-turn hook below places
        // the early respond call, then this reply commits normally.
        { stopReason: "stop", text: "answered via the respond tool" },
      ],
      midTurnHooks: [
        [
          1,
          (h): void => {
            const definition = h.pi.registeredTools[0];
            if (definition === undefined) {
              // Registration is AB-green; the post-drive pin below reds first
              // if it ever regresses.
              return;
            }
            earlyPlaced = true;
            // QRY-14 ¶3: the restarted free phase runs with the respond tool
            // ACTIVE and the capture slot ARMED — "the model may need to
            // retool … before answering the repair request", and it may answer
            // by calling the respond tool early, exactly as in the original
            // free phase.
            earlyResult = invokeRespondExecute(definition, "tc-early-repair", { score: 5 });
          },
        ],
      ],
    });
    scripted.queue = [
      // complete() #1 — the initial respond turn AJV-fails, opening repair.
      // Sticky-last: were the implementation to dispatch a SECOND respond call
      // despite the early capture, it would re-observe this AJV failure and
      // the count pin below reds.
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [
            { id: "tc1", name: respondToolNameOf(harness), arguments: { score: "bad" } },
          ],
        }),
    ];

    const execution = await drive(harness);

    expect(
      harness.pi.registeredTools.length,
      "the respond tool is registered (AB-green PIC-44 registration)",
    ).toBe(1);
    expect(earlyPlaced, "the harness placed the mid-turn respond call on the REPAIR turn").toBe(
      true,
    );
    // THE CAPTURE-ARM PIN (red pre-fix): the repair turn must arm the capture
    // slot exactly as the original free phase does. Pre-fix the repair drove
    // through driveStreamedUserTurn with NO armed capture, so the execute
    // resolved the inert "no typed query is active" error.
    const result = (await earlyResult!) as { readonly isError?: unknown };
    expect(
      result.isError,
      "a VALID early respond call during the REPAIR free phase is not an error " +
        "result — the restarted phase re-arms the capture slot (QRY-14 ¶3; bug 0010 " +
        `increment C); observed: ${JSON.stringify(result)}`,
    ).toBeFalsy();
    expect(
      executeResultText(result),
      "the valid early call's tool-result text indicates the final answer was " +
        `recorded; observed: ${JSON.stringify(result)}`,
    ).toMatch(/recorded/i);
    // The captured payload resolves the attempt — the repair needed NO fresh
    // off-session dispatch (the early-capture skip applies to the restarted
    // phase exactly as to the original).
    expectValue(
      execution,
      { score: 5 },
      "the repair turn's early-captured payload resolves the typed query",
    );
    expect(
      scripted.calls.length,
      "exactly ONE complete() — the initial respond turn; the repair attempt's " +
        "early capture SKIPS its off-session dispatch",
    ).toBe(1);
    expect(
      harness.session.sendUserMessageCalls,
      "exactly TWO on-session turns — the original free phase + the repair opener",
    ).toBe(2);
  });

  it("(r4b) GREEN control — original-phase early capture unchanged: a valid capture during the ORIGINAL free phase resolves {score: 1} with ZERO complete() calls", async () => {
    // AB behaviour (typed-two-phase-live cell (d1)), re-pinned here as the
    // increment-C control: the original phase's early-capture mechanics must
    // not move while the repair path gains the same mechanics.
    let earlyPlaced = false;
    let earlyResult: Promise<unknown> | undefined;
    const harness = makeHarness({
      source: REPAIR1_THETA,
      sessionReplies: [{ stopReason: "stop", text: "done" }],
      midTurnHooks: [
        [
          0,
          (h): void => {
            const definition = h.pi.registeredTools[0];
            if (definition === undefined) {
              return;
            }
            earlyPlaced = true;
            earlyResult = invokeRespondExecute(definition, "tc-early", { score: 1 });
          },
        ],
      ],
    });
    // Any complete() dispatch would throw loudly — the capture makes the
    // off-session respond turn unnecessary.
    scripted.queue = [];

    const execution = await drive(harness);

    expect(earlyPlaced, "the harness placed the mid-turn early respond call").toBe(true);
    const result = (await earlyResult!) as { readonly isError?: unknown };
    expect(
      result.isError,
      `a VALID early respond call is not an error result; observed: ${JSON.stringify(result)}`,
    ).toBeFalsy();
    expectValue(
      execution,
      { score: 1 },
      "the original phase's early capture resolves the typed query (unchanged AB behaviour)",
    );
    expect(
      scripted.calls.length,
      "ZERO complete() calls — the early capture skips the off-session respond turn",
    ).toBe(0);
    expect(
      harness.session.sendUserMessageCalls,
      "exactly one on-session turn — the free-phase turn",
    ).toBe(1);
  });

  // (r4c) — DELIBERATELY NOT A CELL. The stale-capture-leak transcript is
  // unreachable as a distinct observable: the capture slot only ever records
  // an AJV-VALID payload (the execute validates before capturing, one-shot),
  // and a valid capture terminates its own phase immediately — the original
  // phase's capture short-circuits the initial respond dispatch (r4b), and a
  // repair turn's capture resolves its attempt (r4). No sequence therefore
  // leaves a phase-N capture alive when phase N+1 begins EXCEPT via the
  // implementation failing to reset its per-turn snapshot — and (r4) already
  // pins that per-turn arm/read/reset cycle on the repair turn: were the
  // restart to read a stale (empty) original-phase snapshot instead of arming
  // and reading its own, (r4) reds on the capture result and the resolution.
  // A synthetic r4c would need to fabricate an invalid-captured state the
  // production execute cannot produce — a harness fiction, not a contract pin.

  it("(r5) max_rounds: 0 repair boundary: NO on-session turn for the attempt; the fresh respond dispatch's SINGLE user message is the QRY-12 text ALONE (no QRY-15 concatenation, no window)", async () => {
    const harness = makeHarness({
      source: MAX0_REPAIR1_THETA,
      // Scripted defensively: the restart contract drives NO session turn at
      // max_rounds 0, but the pre-fix repair did — sticky-last keeps that
      // over-driving observable as the count pin below.
      sessionReplies: [{ stopReason: "stop", text: "must not run" }],
    });
    scripted.queue = [
      // complete() #1 — the initial (fused single-message) respond turn:
      // AJV-rejected payload opens repair.
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [
            { id: "tc1", name: respondToolNameOf(harness), arguments: { score: "bad" } },
          ],
        }),
      // complete() #2 — the repair attempt's fresh respond dispatch complies.
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [
            { id: "tc2", name: respondToolNameOf(harness), arguments: { score: 6 } },
          ],
        }),
    ];

    const execution = await drive(harness);

    // THE BOUNDARY PIN (red pre-fix): at max_rounds 0 a repair attempt issues NO
    // on-session turn at all — the restarted free phase degenerates exactly as
    // the original did (QRY-14 step 2 boundary), so the WHOLE typed query
    // drives ZERO sendUserMessage calls.
    expect(
      harness.session.sendUserMessageCalls,
      "ZERO sendUserMessage calls — at max_rounds: 0 neither the original phase nor " +
        "the repair attempt issues an on-session turn (QRY-14 step 2 boundary applied " +
        "to the restarted loop; bug 0010 increment C)",
    ).toBe(0);
    expect(
      scripted.calls.length,
      "TWO complete() calls — the fused initial respond turn AND the repair attempt's " +
        "fresh off-session dispatch",
    ).toBe(2);

    // The repair dispatch's conversation is a SINGLE user message whose content
    // is the QRY-12 validator_error template TEXT ALONE — it already carries
    // the instruction + schema, so QRY-15 is NOT concatenated after it and no
    // prompt fusion applies (fix brief §RESPOND-REPAIR max_rounds: 0 rule;
    // exact equality pins both non-concatenations at once).
    const messages = contextMessagesOf(scripted.calls[1]!);
    expect(
      messages.length,
      "the max_rounds: 0 repair respond conversation is a SINGLE user message " +
        "(no session window exists)",
    ).toBe(1);
    expect(messages[0]!["role"], "the single message rides the user role").toBe("user");
    expect(
      messageText(messages[0]),
      "the single message is the QRY-12 validator_error rendered text EXACTLY — " +
        "no QRY-15 concatenation, no prompt fusion (the follow-up template already " +
        "carries instruction + schema)",
    ).toBe(expectedValidatorErrorFollowUp({ score: "bad" }));

    expectValue(
      execution,
      { score: 6 },
      "the max_rounds: 0 repair attempt resolves through its fresh respond dispatch",
    );
  });

  it("(r6) fresh budget re-arm (QRY-16): the repair turn is governed under a FRESH max_rounds cap — 2 fabricated rounds allowed, the 3rd blocked — even though the original phase consumed its whole budget", async () => {
    let originalProbe: Array<unknown | undefined> | undefined;
    let repairProbe: Array<unknown | undefined> | undefined;
    const harness = makeHarness({
      source: ROUNDS2_REPAIR1_THETA,
      sessionReplies: [
        { stopReason: "stop", text: "original phase work" },
        { stopReason: "stop", text: "repair phase work" },
      ],
      midTurnHooks: [
        [
          0,
          (h): void => {
            // The ORIGINAL free phase consumes its WHOLE budget: 2 fabricated
            // rounds at cap 2, both allowed (no block — the cap is a ceiling).
            originalProbe = runGovernorRoundProbe(h.pi, 2);
          },
        ],
        [
          1,
          (h): void => {
            // The REPAIR follow-up turn: 3 fabricated rounds. Under the QRY-16
            // fresh-budget contract the governor is RE-ARMED with a fresh cap
            // of 2 — rounds 1..2 allowed, round 3 blocked. A residue-sharing
            // implementation would block round 1 (budget already exhausted);
            // the pre-fix ungoverned repair drive allowed all 3.
            repairProbe = runGovernorRoundProbe(h.pi, 3);
          },
        ],
      ],
    });
    scripted.queue = [
      // complete() #1 — AJV-rejected payload opens repair.
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [
            { id: "tc1", name: respondToolNameOf(harness), arguments: { score: "bad" } },
          ],
        }),
      // complete() #2 — the repair attempt's respond dispatch (dispatched on
      // the budget-exhaust entry point — CIO-4's max_rounds-final branch, the
      // exempt terminator; tool_loop_exhausted is unreachable on a typed path).
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [
            { id: "tc2", name: respondToolNameOf(harness), arguments: { score: 9 } },
          ],
        }),
    ];

    const execution = await drive(harness);

    // Control (green since AB cell (i)): the ORIGINAL typed free phase is
    // governed — both in-cap fabricated rounds were allowed.
    expect(
      originalProbe !== undefined,
      "the governor hooks are registered and the original-turn probe ran (AB-green CIO-4 arming)",
    ).toBe(true);
    expect(originalProbe!.length, "the original-turn probe replayed 2 rounds").toBe(2);
    expect(
      originalProbe![0],
      "original phase round 1 of 2 is within the cap — allowed",
    ).toBeUndefined();
    expect(
      originalProbe![1],
      "original phase round 2 of 2 is within the cap — allowed (budget now fully consumed)",
    ).toBeUndefined();

    // THE FRESH-BUDGET PIN (red pre-fix): the repair turn runs GOVERNED under a
    // FRESH max_rounds budget. Rounds 1..2 allowed proves freshness (a shared
    // residue would block round 1); round 3 blocked proves the repair turn is
    // governed at all (the pre-fix repair drive never re-armed the governor, so
    // all three fabricated rounds passed unbounded).
    expect(
      repairProbe !== undefined,
      "the repair-turn probe found the registered governor hooks",
    ).toBe(true);
    expect(repairProbe!.length, "the repair-turn probe replayed 3 rounds").toBe(3);
    expect(
      repairProbe![0],
      "repair round 1 is allowed — the budget is FRESH, not the original phase's " +
        "exhausted residue (QRY-16: each follow-up gets a fresh tool_loop budget)",
    ).toBeUndefined();
    expect(
      repairProbe![1],
      "repair round 2 is allowed — the fresh cap of 2 admits both rounds",
    ).toBeUndefined();
    expect(
      repairProbe![2],
      "repair round 3 exceeds the FRESH max_rounds (2) and is BLOCKED — the repair " +
        "turn is governed under a re-armed budget (QRY-16/CIO-4; bug 0010 increment C " +
        "— the pre-fix repair drive never armed the governor and the round passed)",
    ).toEqual({ block: true, reason: "tool_loop_exhausted" });

    // The exhausted repair free phase still terminates through the exempt
    // forced respond dispatch (QRY-16: tool_loop_exhausted is unreachable on a
    // typed query) and the corrected payload resolves.
    expect(
      scripted.calls.length,
      "TWO complete() calls — the initial respond turn AND the repair attempt's fresh " +
        "respond dispatch (dispatched on budget exhaustion, the max_rounds-final branch)",
    ).toBe(2);
    expect(
      harness.session.sendUserMessageCalls,
      "exactly TWO on-session turns — the original free phase + the repair opener",
    ).toBe(2);
    expectValue(
      execution,
      { score: 9 },
      "the budget-exhausted repair attempt still terminates through the exempt respond " +
        "dispatch and resolves (QRY-16)",
    );
  });

  it("(r7) cancellation during the repair follow-up's streamed turn: the CANCEL terminal outcome — never a transport Err — and NO post-abort off-session dispatch", async () => {
    // Bug 0010 fix review C, finding 1 (regression pin). `driveRepairAttempt`
    // probes the repair turn's post-idle state through
    // `extractPromptModeQueryResult`, whose aborted arm synthesises the
    // CANCELLED error — pre-fix the drive diverted only on
    // `kind === "transport"`, so a cancellation observed during the repair
    // follow-up's streamed turn fell THROUGH to the fresh off-session forced
    // respond dispatch: one more complete() fired against an already-aborted
    // signal, whose reply classified as transport "cancelled" (kind transport,
    // 2 complete() calls). The pinned contract: cancellation is its own
    // terminal outcome (error-model.md §Terminal outcomes; cancellation.md —
    // the loop/checkpoint surfaces `cancelled` downstream;
    // query-failure-and-repair.md QRY-11 lists `cancelled` among the
    // non-validation follow-up failures that terminate respond-repair
    // immediately with no attempts debit), and an aborted attempt must issue
    // NO post-abort provider dispatch.
    //
    // Trigger route (the CANCEL-2 path the production drive already walks):
    // pi surfaces the per-turn `ctx.signal` only while a turn is streaming —
    // the harness ctxDouble models idle-entry as `signal: undefined` — so the
    // mid-turn hook plants an ALREADY-ABORTED per-turn signal while the repair
    // follow-up turn is in flight (an Esc during the turn). After the turn
    // settles, the drive's own `ctx.signal?.aborted === true` branch fires
    // `abortForAgentEnd(thetaAbort)` and the attempt's post-turn probe
    // observes the aborted thetaAbort.
    const harness = makeHarness({
      source: REPAIR1_THETA,
      sessionReplies: [
        // Turn 0 — the original free phase completes cleanly.
        { stopReason: "stop", text: "free phase text" },
        // Turn 1 — the repair follow-up's streamed reply commits normally:
        // the cancellation is observed via ctx.signal, not via the reply.
        { stopReason: "stop", text: "repair turn reply" },
      ],
      midTurnHooks: [
        [
          1,
          (h): void => {
            (h.ctx as unknown as { signal: AbortSignal | undefined }).signal =
              AbortSignal.abort();
          },
        ],
      ],
    });
    scripted.queue = [
      // complete() #1 — the initial forced respond turn: an AJV-rejected
      // payload opens respond-repair.
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [
            { id: "tc1", name: respondToolNameOf(harness), arguments: { score: "bad" } },
          ],
        }),
      // Defensive sticky-last: the contract forbids ANY dispatch after the
      // abort. A plain-text reply here keeps a regressed over-dispatch
      // observable as the transport-"cancelled" misclassification (extraction
      // never matches), so both the outcome pin and the count pin red loudly.
      () => assistantReply({ stopReason: "stop", text: "post-abort reply" }),
    ];

    const execution = await drive(harness);

    expect(
      execution.outcome,
      "cancellation is its own TERMINAL OUTCOME — the cancel arm, never a fail " +
        "outcome carrying Err(transport 'cancelled') fabricated by a post-abort " +
        "dispatch (error-model.md §Terminal outcomes; bug 0010 fix review C " +
        "finding 1 — pre-fix the aborted attempt fell through to the dispatch)",
    ).toBe("cancel");
    expect(
      scripted.calls.length,
      "exactly ONE complete() — the initial forced respond turn; the aborted " +
        "repair attempt issues NO post-abort off-session dispatch (pre-fix: 2)",
    ).toBe(1);
    expect(
      harness.session.sendUserMessageCalls,
      "exactly TWO on-session turns — the original free phase + the repair " +
        "opener already in flight when the abort landed",
    ).toBe(2);
  });

  it("(r8) mid-flight abort during the REPAIR attempt's FRESH respond dispatch complete(): the CANCEL terminal outcome — never Err(transport 'cancelled') — with exactly TWO complete() calls", async () => {
    // Bug 0010 fix round 2, R2-1 (regression pin — the live twin of
    // tests/off-session-two-phase.test.ts (d16)). Cell (r7) covers an abort
    // observed on the repair follow-up's STREAMED turn (the post-turn probe
    // diverts before any dispatch); HERE the streamed repair turn settles
    // cleanly and the abort lands WHILE the fresh off-session forced respond
    // dispatch's complete() is in flight. pi-ai resolves the abort as an
    // aborted-stop reply; the dispatch's aborted-precedence arm folds it into
    // the fixed transport-'cancelled' shape, and `mapForcedTurnToRepairOutcome`
    // — threaded with the theta signal — maps the signal-aborted transport
    // result to `provider_failure: CancelledError` (QRY-11 §non-validation:
    // `cancelled` terminates repair with no debit; the propagated error
    // resolves to the CANCEL terminal outcome downstream). PRE-FIX the mapping
    // passed the raw TransportError 'cancelled' through, so the abort surfaced
    // as a FAIL outcome carrying Err(transport 'cancelled').
    const thetaAbort = new AbortController();
    const harness = makeHarness({
      source: REPAIR1_THETA,
      thetaAbort,
      sessionReplies: [
        // Turn 0 — the original free phase completes cleanly.
        { stopReason: "stop", text: "free phase text" },
        // Turn 1 — the repair follow-up's streamed turn settles cleanly BEFORE
        // the abort: the cancellation lands inside the fresh dispatch below.
        { stopReason: "stop", text: "repair turn reply" },
      ],
    });
    scripted.queue = [
      // complete() #1 — the initial forced respond turn: an AJV-rejected
      // payload opens respond-repair.
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [
            { id: "tc1", name: respondToolNameOf(harness), arguments: { score: "bad" } },
          ],
        }),
      // complete() #2 — the repair attempt's FRESH respond dispatch: the abort
      // lands while THIS call is in flight (the factory flips the theta
      // signal), and pi-ai resolves it as an aborted-stop reply (no matching
      // ToolCall, so extraction cannot win). Sticky-last doubles as the
      // defence: a regressed post-abort re-dispatch keeps observing this
      // factory and reds the count pin.
      () => {
        thetaAbort.abort();
        return assistantReply({ stopReason: "aborted" });
      },
    ];

    const execution = await drive(harness);

    expect(
      execution.outcome,
      "an abort during the repair attempt's fresh respond dispatch is the " +
        "CANCEL terminal outcome — never a fail outcome carrying " +
        "Err(transport 'cancelled') (mapForcedTurnToRepairOutcome signal " +
        "threading; bug 0010 fix round 2, R2-1; QRY-11 §non-validation)",
    ).toBe("cancel");
    expect(
      scripted.calls.length,
      "exactly TWO complete() calls — the initial respond turn and the aborted " +
        "fresh respond dispatch; the aborted attempt issues nothing further",
    ).toBe(2);
    expect(
      harness.session.sendUserMessageCalls,
      "exactly TWO on-session turns — the original free phase + the repair " +
        "opener that settled before the abort",
    ).toBe(2);
  });
});
