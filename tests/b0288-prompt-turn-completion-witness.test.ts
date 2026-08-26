// Bug 0288 — the on-session prompt-mode turn-completion contract: bound
// expiry must FAIL LOUDLY, and a query must never bind a value from a turn
// that was not observed to run and settle.
//
// docs/bugs/0288-multi-query-prompt-drive-completes-without-the-second-querys-reply.md
// (§Fix, §Fix→Verification "Offline witness (the gate)"). At HEAD the drive
// decides a turn finished by polling `ctx.isIdle()`:
//
//   - `LivePromptQueryModel.#driveUserVisibleTurn`
//     (src/extension/production-theta-producer.ts:4791) sends at
//     production-theta-producer.ts:4833, then polls
//     `#pollWhile(() => this.#ctx.isIdle(), TURN_START_POLL_BOUND)` at
//     production-theta-producer.ts:4838, then
//     `#pollWhile(() => !this.#ctx.isIdle(), TURN_END_POLL_BOUND)` at
//     production-theta-producer.ts:4854, then `ctx.waitForIdle()` at
//     production-theta-producer.ts:4855.
//   - `#pollWhile` (production-theta-producer.ts:4882 through :4886) returns
//     `void` on BOTH exits, so the caller cannot distinguish "the condition
//     cleared" from "the bound expired" (bug doc P1). On start-poll expiry the
//     session is by construction still idle, so the end poll runs zero
//     iterations and `waitForIdle()` returns at once.
//   - the untyped / free-phase round 0 then takes
//     `extractTrailingTurnText(this.#readMessages())` at
//     production-theta-producer.ts:4520 unconditionally (P2).
//     `extractTrailingTurnText` (src/runtime/conversation-drive.ts:202)
//     anchors the trailing turn on the LAST `user` message, so the two silent
//     failure shapes are `Ok("")` and `Ok(<the PREVIOUS query's answer>)`.
//   - only a SYNCHRONOUS `pi.sendUserMessage` throw is representable
//     (production-theta-producer.ts:4834 through :4837, PIC-50). The
//     extension-API `sendUserMessage` returns `void` and routes every
//     asynchronous rejection to the host's extension-error channel
//     (node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js:1858)
//     — including `prompt()`'s "Agent is already processing" throw
//     (agent-session.js:834) — so a send that appends no user entry and starts
//     no run is invisible to the drive (P3).
//
// The behaviour these cells encode is the §Fix contract, not HEAD's:
//   1. start-poll expiry, end-bound expiry, `waitForIdle` expiry and
//      post-turn settlement expiry each surface as the query's
//      `Err(TransportError)` on the existing PIC-50/PIC-51 register
//      (`kind: "transport"`, `http_status: null`, the resolved `provider`,
//      `retryable: false`) carrying a FIXED NAMED per-phase message. No new
//      diagnostic-registry code is minted (the registry is closed — DIAG-2).
//   2. a per-turn PRE-SEND settlement gate: query N+1 is never issued while
//      query N's turn is streaming.
//   3. no path binds a value from an unattributed turn.
//
// The phase messages are exported constants beside
// `PROMPT_MODE_TRANSPORT_FALLBACK_MESSAGE`
// (src/runtime/prompt-transport-mapping.ts). Each loud cell asserts three
// layers over the observed message: the Err's SHAPE, a phase-naming regex
// (`START_PHASE_NAMING` / `SETTLE_PHASE_NAMING` / `GATE_PHASE_NAMING`) so the
// wording stays diagnosable, and the IDENTITY of the minted stem the message
// was built from — plus that it is not the generic PIC-51 fallback string.
//
// Harness: the house pattern of tests/prompt-provider-field-derivation.test.ts
// — drive the REAL producer (`createProductionProducerDeps` →
// `bindPromptConversation` → `executeBody`) against an in-memory session
// double with an injected `Clock`, so the REAL `#resolvePromptQuery`
// constructs the REAL `LivePromptQueryModel` (never hand-built; it is not
// exported). The `Clock.setTimeout` hook is the drive's only wait primitive
// (`macrotask`, production-theta-producer.ts:4899), so one `setTimeout` == one
// poll interval: the double advances its scripted turn lifecycle by exactly
// one poll per hook call. No real timers, no network, no provider.
//
// Spec: pi-integration-contract/conversation-drive.md (PIC-70 — the driven-turn
// started-and-settled completion contract and its loud bounded-expiry register —
// plus PIC-50, PIC-51, PIC-53); errors-and-results/queryerror-variants.md
// (§TransportError schema, §provider derivation).

import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import { executeBody, type BodyExecution } from "../src/runtime/statement-executor";
import {
  PROMPT_MODE_TRANSPORT_FALLBACK_MESSAGE,
  PROMPT_MODE_START_PHASE_EXPIRY_MESSAGE,
  PROMPT_MODE_SETTLE_PHASE_EXPIRY_MESSAGE,
  PROMPT_MODE_PRE_SEND_GATE_EXPIRY_MESSAGE,
} from "../src/runtime/prompt-transport-mapping";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import type { RuntimeRoot } from "../src/runtime-root";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type ThetaDocument,
} from "../src/parser/theta-document";
import type { ThetaSource } from "../src/lexer/lexer";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";

// --- The user session's selected model ---------------------------------------
// Distinct `.api` / `.provider` strings (the bug-0009 fixture discipline) so a
// synthesised `TransportError.provider` is checked against the API-shaped
// value the PIC-50 derivation pins.

const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};

/**
 * Phase-naming demands on the §Fix's minted per-phase messages. The alternation
 * is one unconditional assertion over the vocabulary the two phases can
 * reasonably be named with — not a branch.
 */
const START_PHASE_NAMING = /turn/i;
const START_PHASE_WORD = /start|begin/i;
const SETTLE_PHASE_NAMING = /turn/i;
const SETTLE_PHASE_WORD = /settle|end|complet/i;
const GATE_PHASE_NAMING = /turn/i;
const GATE_PHASE_WORD = /gate|issued/i;

// --- The scripted turn lifecycle --------------------------------------------

/**
 * One on-session turn's scripted lifecycle, in POLL INTERVALS from the send.
 * Every field is a count of `Clock.setTimeout` hook invocations — the drive's
 * poll cadence (`POLL_INTERVAL_MS`, production-theta-producer.ts:4890) — so a
 * script's numbers are directly comparable with `TURN_START_POLL_BOUND` (1000,
 * at production-theta-producer.ts:4893) and `TURN_END_POLL_BOUND` (60000, at
 * production-theta-producer.ts:4896).
 */
interface TurnScript {
  /**
   * Polls between the send and the run becoming observably non-idle.
   * `Number.POSITIVE_INFINITY` = the run is never observed to start (bug doc
   * P4: `_isAgentRunActive` is set inside `_runAgentPrompt`,
   * agent-session.js:751, after everything `prompt()` awaits — the auth check,
   * the compaction check, `before_agent_start` — all of which run while
   * `isIdle` is still true).
   */
  readonly startsAfterPolls: number;
  /** Polls after the run starts before its assistant text is committed; `Infinity` = never. */
  readonly replyAfterPolls: number;
  /** Polls after the run starts before it goes idle again; `Infinity` = never. */
  readonly endsAfterPolls: number;
  /** The committed assistant text (absent = the turn commits no assistant message). */
  readonly reply?: string;
  /**
   * The swallowed asynchronous send failure (agent-session.js:1858): the call
   * returns `void`, appends NO user entry and starts NO run, ever.
   */
  readonly inertSend?: boolean;
  /**
   * The turn commits its user entry AND its reply inside the send and never
   * holds a run: the limiting case of a turn that starts and settles inside a
   * single poll interval, where `isIdle()` is never observed false.
   */
  readonly instantSettle?: boolean;
}

/** What the double observed about the session at the moment of one send. */
interface SendObservation {
  readonly text: string;
  /** `ctx.isIdle()` at the send — the §Fix's pre-send gate demands `true`. */
  readonly sessionIdle: boolean;
  /**
   * Whether every user entry already on the session had a non-empty assistant
   * text after it — the §Fix's "prior turn's slice is settled" precondition.
   */
  readonly priorSliceSettled: boolean;
  /**
   * Whether the send took effect. A send issued while the host reports
   * streaming is rejected asynchronously into the host's extension-error
   * channel (agent-session.js:834, swallowed at agent-session.js:1858),
   * appending nothing.
   */
  readonly effective: boolean;
  /**
   * The transcript already on the session at the instant of this send, as
   * `<role>:<text>` entries. This is the ordering observable the §Fix's
   * sequencing demand is stated over: query N+1's send may only be issued
   * once query N's own settled slice — its `user` entry AND the reply that
   * settled it — already exists.
   */
  readonly transcriptAtSend: readonly string[];
}

/** A `SessionManager` message entry (the `buildSessionContext` read shape). */
interface SessionEntryDouble {
  readonly type: "message";
  readonly id: string;
  readonly parentId: string | undefined;
  readonly message: Record<string, unknown>;
}

/** An in-flight scripted turn: its script plus polls elapsed since the milestone. */
interface TurnState {
  readonly script: TurnScript;
  polls: number;
}

/**
 * The live user-session double, driven by a per-turn lifecycle script instead
 * of the sibling harnesses' "settle on the first tick" shortcut — the whole
 * subject here is what the drive does when a turn does NOT settle on cue.
 *
 * `isIdle()` mirrors the host exactly: `isIdle === !isStreaming ===
 * !_isAgentRunActive` (agent-session.js:594–599), so one flag serves both the
 * drive's poll and the pre-send streaming check.
 */
class ScriptedLiveSession {
  readonly entries: SessionEntryDouble[] = [];
  readonly sendObservations: SendObservation[] = [];
  /** Sends the host rejected asynchronously (streaming, or a scripted inert send). */
  rejectedSends = 0;

  readonly #scripts: TurnScript[];
  #pending: TurnState | undefined = undefined;
  #active: TurnState | undefined = undefined;
  /**
   * A run this drive did not issue that is in flight for the whole cell. The
   * faithful shape of a slash dispatch that reaches the theta from INSIDE
   * `prompt()` (`_tryExecuteExtensionCommand`, agent-session.js:806 / :927):
   * `isIdle()` is false before the drive has sent anything at all.
   */
  readonly #ambientRunActive: boolean;

  constructor(scripts: readonly TurnScript[], options: { readonly ambientRunActive?: boolean } = {}) {
    this.#scripts = [...scripts];
    this.#ambientRunActive = options.ambientRunActive === true;
  }

  get sendUserMessageCalls(): number {
    return this.sendObservations.length;
  }

  get sentQueryTexts(): readonly string[] {
    return this.sendObservations.map((o) => o.text);
  }

  /** The transcript as `<role>:<text>` entries, in chronological order. */
  transcript(): readonly string[] {
    return this.entries.map(
      (entry) => `${String(entry.message.role)}:${this.#assistantTextOf(entry)}`,
    );
  }

  sendUserMessage(text: string): void {
    const idle = this.isIdle();
    const priorSliceSettled = this.#everyUserEntryAnswered();
    const transcriptAtSend = this.transcript();
    if (!idle) {
      // agent-session.js:834–837 — `prompt()` throws while streaming when no
      // `streamingBehavior` is passed (the producer passes none), and the
      // extension-API wrapper swallows that rejection
      // (agent-session.js:1858 through :1866). No user entry, no run.
      this.rejectedSends += 1;
      this.sendObservations.push({
        text,
        sessionIdle: idle,
        priorSliceSettled,
        effective: false,
        transcriptAtSend,
      });
      return;
    }
    const script = this.#scripts.shift();
    if (script === undefined) {
      // No silent skipping: a drive that issues more effective turns than the
      // cell scripted fails loudly naming the unmet precondition.
      throw new Error(
        `scripted live session: an effective send #${this.sendObservations.length + 1} ` +
          `('${text}') had NO scripted turn lifecycle`,
      );
    }
    if (script.inertSend === true) {
      this.rejectedSends += 1;
      this.sendObservations.push({
        text,
        sessionIdle: idle,
        priorSliceSettled,
        effective: false,
        transcriptAtSend,
      });
      return;
    }
    this.sendObservations.push({
      text,
      sessionIdle: idle,
      priorSliceSettled,
      effective: true,
      transcriptAtSend,
    });
    this.#appendUser(text);
    if (script.instantSettle === true) {
      this.#appendAssistant(script.reply);
      return;
    }
    this.#pending = { script, polls: 0 };
  }

  isIdle(): boolean {
    return this.#active === undefined && !this.#ambientRunActive;
  }

  /**
   * Advance the scripted lifecycle by one poll interval. Invoked from the
   * injected `Clock.setTimeout`, i.e. exactly once per drive poll. A pending
   * send waits while another run is active (the host serialises runs).
   */
  tick(): void {
    const active = this.#active;
    if (active !== undefined) {
      active.polls += 1;
      if (active.polls === active.script.replyAfterPolls) {
        this.#appendAssistant(active.script.reply);
      }
      if (active.polls >= active.script.endsAfterPolls) {
        this.#active = undefined;
      }
      return;
    }
    const pending = this.#pending;
    if (pending !== undefined) {
      pending.polls += 1;
      if (pending.polls >= pending.script.startsAfterPolls) {
        this.#pending = undefined;
        this.#active = { script: pending.script, polls: 0 };
      }
    }
  }

  /** Every `user` entry is followed by a non-empty assistant text (the settled-slice predicate). */
  #everyUserEntryAnswered(): boolean {
    let openUserEntry = false;
    for (const entry of this.entries) {
      const role = entry.message.role;
      if (role === "user") {
        openUserEntry = true;
        continue;
      }
      if (role === "assistant" && this.#assistantTextOf(entry).length > 0) {
        openUserEntry = false;
      }
    }
    return !openUserEntry;
  }

  /** The concatenated `text` parts of an entry's content (both roles carry the same shape). */
  #assistantTextOf(entry: SessionEntryDouble): string {
    const content = entry.message.content;
    if (!Array.isArray(content)) {
      return "";
    }
    return content
      .filter((part): part is { type: "text"; text: string } => {
        const shape = part as { type?: unknown; text?: unknown };
        return shape.type === "text" && typeof shape.text === "string";
      })
      .map((part) => part.text)
      .join("");
  }

  #appendUser(text: string): void {
    this.#append({ role: "user", content: [{ type: "text", text }], timestamp: 0 });
  }

  #appendAssistant(text: string | undefined): void {
    this.#append({
      role: "assistant",
      content: text !== undefined ? [{ type: "text", text }] : [],
      api: "anthropic-messages",
      provider: "anthropic",
      model: "m1",
      stopReason: "stop",
      timestamp: 0,
    });
  }

  #append(message: Record<string, unknown>): void {
    const id = `e${this.entries.length + 1}`;
    const parentId = this.entries.length === 0 ? undefined : `e${this.entries.length}`;
    this.entries.push({ type: "message", id, parentId, message });
  }
}

// --- Harness ------------------------------------------------------------------

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

/** The production AJV validator (matches the sibling live-seam harnesses). */
function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}

/**
 * The runtime root for the live drive. `clock.setTimeout` advances the session
 * double by exactly one poll interval and then fires the callback
 * synchronously: `macrotask` (production-theta-producer.ts:4899) is the only
 * wait primitive `#pollWhile` (production-theta-producer.ts:4882) has, so the
 * drive's poll count and the double's lifecycle clock are the same clock.
 * Deterministic, no real timers.
 */
function rootDouble(session: ScriptedLiveSession): RuntimeRoot {
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

/** The `ExtensionAPI` surface the live drive touches (sibling harness shape). */
function piDouble(session: ScriptedLiveSession): ExtensionAPI {
  return {
    sendUserMessage: (content: string): void => session.sendUserMessage(content),
    getActiveTools: (): string[] => [],
    setActiveTools: (): void => {},
    registerTool: (): void => {},
    on: (): void => {},
    sendMessage: (): void => {},
  } as unknown as ExtensionAPI;
}

/**
 * The dispatch ctx. `waitForIdle()` resolves IMMEDIATELY — the faithful
 * limiting case of the host's own contract: `_emitAgentSettled` clears
 * `_isAgentRunActive` before awaiting the `agent_settled` emit
 * (agent-session.js:310–318) and `waitForIdle` (agent-session.js:1176) keys on
 * that flag, so a settled-flag wait is not a turn-completion signal (P5). It also
 * keeps every cell FINITE: no assertion here can be discharged by a hang.
 */
function ctxDouble(session: ScriptedLiveSession): ExtensionCommandContext {
  return {
    model: ANTHROPIC_MODEL,
    signal: undefined,
    isIdle: (): boolean => session.isIdle(),
    waitForIdle: (): Promise<void> => Promise.resolve(),
    sessionManager: {
      getEntries: (): readonly SessionEntryDouble[] => [...session.entries],
      getLeafId: (): undefined => undefined,
    },
  } as unknown as ExtensionCommandContext;
}

/** Drive a fixture theta through the production prompt-mode binding. */
async function driveLiveTheta(
  source: string,
  scripts: readonly TurnScript[],
  options: { readonly ambientRunActive?: boolean } = {},
): Promise<{ readonly execution: BodyExecution; readonly session: ScriptedLiveSession }> {
  const doc = parse(source);
  const theta: ThetaCompositionInput = {
    slashName: "probe",
    sourcePath: "/theta/probe.theta",
    frontmatter: doc.frontmatter!,
    body: doc.body,
  };
  const session = new ScriptedLiveSession(scripts, options);
  const deps = createProductionProducerDeps({
    pi: piDouble(session),
    root: rootDouble(session),
    modelRegistry: {} as unknown as ModelRegistry,
  });
  const binding = deps.bindPromptConversation({ theta, args: "", ctx: ctxDouble(session) });
  expect(
    binding.drivenAgainst,
    "the harness must bind the LIVE prompt-mode drive (the user session), not an off-session host",
  ).toBe("prompt-user-session");
  const execution = await executeBody(theta.body, binding.executeDeps);
  return { execution, session };
}

// --- The driven thetas --------------------------------------------------------
// The `?` unwinds a query `Err` out of the body (ERR-18), so a loud failure is
// observable as a `fail` outcome whose `execution.error` IS the leaf
// `QueryError`, and a SILENT bound value is observable as a `success` outcome
// whose final value is the silently extracted string.

const ONE_QUERY_THETA = ["---", "mode: prompt", "---", "let v = @`Ping`?", "v", ""].join("\n");

const Q1_TEXT = "What is 471 plus 133? Answer with the number only.";
const Q2_TEXT = "What is 306 plus 218? Answer with the number only.";
const Q1_REPLY = "604";
const Q2_REPLY = "524";

/** Cell 89's twin shape, reduced to the two on-session untyped queries. */
const TWO_QUERY_THETA = [
  "---",
  "mode: prompt",
  "---",
  "let a = @`" + Q1_TEXT + "`?",
  "let b = @`" + Q2_TEXT + "`?",
  "b",
  "",
].join("\n");

/**
 * Assert a drive failed loudly with the §Fix's `Err(TransportError)` on the
 * PIC-50/PIC-51 register, and that NO value was bound. Quotes the observed
 * shape on failure so a red reads as "a value was silently bound" rather than
 * as an opaque mismatch.
 */
function expectLoudTransportErr(
  execution: BodyExecution,
  naming: RegExp,
  phaseWord: RegExp,
  phase: string,
  mintedStem: string,
): void {
  expect(
    execution.outcome,
    `bug 0288: an unsettled on-session turn must yield the query's Err (${phase} expiry) and ` +
      "bind NO value; observed outcome " +
      `'${execution.outcome}' with final value ${JSON.stringify(execution.result.value)}`,
  ).toBe("fail");
  const error = execution.error as unknown as Record<string, unknown> | null;
  expect(
    error !== null && typeof error === "object",
    `the fail outcome must carry the leaf QueryError; observed: ${JSON.stringify(error)}`,
  ).toBe(true);
  const leaf = error as Record<string, unknown>;
  expect(
    leaf.kind,
    "the §Fix reuses the PIC-50/PIC-51 transport register — no new registry code (DIAG-2); " +
      `observed: ${JSON.stringify(leaf)}`,
  ).toBe("transport");
  expect(leaf.http_status, "no HTTP status is observable at the prompt-mode seam").toBeNull();
  expect(leaf.retryable, "a bound expiry is a definite outcome — retryable: false").toBe(false);
  expect(
    leaf.provider,
    "provider is the user session model's API-shaped `.api` value (PIC-50)",
  ).toBe("anthropic-messages");
  const message = typeof leaf.message === "string" ? leaf.message : "";
  expect(
    message,
    `the ${phase} expiry carries its own FIXED NAMED message, not the generic PIC-51 fallback`,
  ).not.toBe(PROMPT_MODE_TRANSPORT_FALLBACK_MESSAGE);
  expect(message, `the ${phase} expiry message names the turn`).toMatch(naming);
  expect(message, `the ${phase} expiry message names its phase`).toMatch(phaseWord);
  // The constant-identity assertion the module header names as deliberately
  // absent above: now that the §Fix's minted constants exist, pin the message
  // to the EXACT stem the implementer minted, not just the naming regex.
  expect(
    message.includes(mintedStem),
    `the ${phase} expiry message must be built from the minted ` +
      `prompt-transport-mapping.ts constant '${mintedStem}'; observed: '${message}'`,
  ).toBe(true);
}

// ===========================================================================
// WITNESS cells — RED at HEAD, for the filed reason: a value is silently bound
// from a turn that was never observed to run and settle, or a send is issued
// while the prior turn is still streaming.
// ===========================================================================

describe("bug 0288 (RED) — bound expiry on an on-session prompt-mode turn must fail loudly", () => {
  it('(i) the run is never observed non-idle and no reply is ever appended: the start-poll expiry must be the query\'s Err — today the drive walks out and binds Ok("")', async () => {
    // P4/P1: `isIdle()` stays true past `TURN_START_POLL_BOUND` (1000 polls,
    // production-theta-producer.ts:4893), so the start poll expires, the end
    // poll's `!isIdle()` is false on entry, `waitForIdle()` returns at once and
    // production-theta-producer.ts:4520 extracts the trailing turn — the
    // query's own user entry with no assistant message after it, i.e. `""`.
    const { execution, session } = await driveLiveTheta(ONE_QUERY_THETA, [
      {
        startsAfterPolls: Number.POSITIVE_INFINITY,
        replyAfterPolls: Number.POSITIVE_INFINITY,
        endsAfterPolls: Number.POSITIVE_INFINITY,
      },
    ]);

    expect(
      session.sendUserMessageCalls,
      "the drive issued exactly one user-visible send (the live seam was reached)",
    ).toBe(1);
    expectLoudTransportErr(
      execution,
      START_PHASE_NAMING,
      START_PHASE_WORD,
      "start-phase",
      PROMPT_MODE_START_PHASE_EXPIRY_MESSAGE,
    );
  });

  it("(iii) the run starts and never ends: the end/settlement-bound expiry must be the query's Err — today the drive walks out of the ≈600 s end poll and binds the trailing text", async () => {
    // P6: `TURN_END_POLL_BOUND` is 60000 polls
    // (production-theta-producer.ts:4896) and `ctx.waitForIdle()` at
    // production-theta-producer.ts:4855 adds nothing once the flag-based wait
    // resolves, so the drive returns while the run is still streaming and
    // production-theta-producer.ts:4520 extracts a turn with no assistant
    // message: `Ok("")`.
    //
    // The cell also pins FINITENESS: it completes inside vitest's default
    // per-test timeout because every wait runs on the injected `Clock`.
    const { execution, session } = await driveLiveTheta(ONE_QUERY_THETA, [
      {
        startsAfterPolls: 1,
        replyAfterPolls: Number.POSITIVE_INFINITY,
        endsAfterPolls: Number.POSITIVE_INFINITY,
      },
    ]);

    expect(
      session.sendUserMessageCalls,
      "the drive issued exactly one user-visible send (the live seam was reached)",
    ).toBe(1);
    expect(
      session.isIdle(),
      "the cell's premise: the scripted run never went idle, so nothing settled this turn",
    ).toBe(false);
    expectLoudTransportErr(
      execution,
      SETTLE_PHASE_NAMING,
      SETTLE_PHASE_WORD,
      "settlement-phase",
      PROMPT_MODE_SETTLE_PHASE_EXPIRY_MESSAGE,
    );
  });

  it('(iv) the send is swallowed asynchronously (no user entry, no run): the loud named Err — today the drive binds Ok("") off an empty transcript', async () => {
    // agent-session.js:1858–1866: the extension-API `sendUserMessage` returns
    // `void` and `.catch(...)`es its rejection into the host's extension-error
    // channel, so the drive can only ever see a SYNCHRONOUS throw (PIC-50,
    // production-theta-producer.ts:4834). Mechanically this is cell (i) with
    // the user entry ALSO absent — kept separate because the extraction
    // surface differs: production-theta-producer.ts:4520 reads a transcript
    // with no `user` anchor at all, so `extractTrailingTurnText`
    // (conversation-drive.ts:202) falls back to the whole (empty) list.
    const { execution, session } = await driveLiveTheta(ONE_QUERY_THETA, [
      {
        inertSend: true,
        startsAfterPolls: Number.POSITIVE_INFINITY,
        replyAfterPolls: Number.POSITIVE_INFINITY,
        endsAfterPolls: Number.POSITIVE_INFINITY,
      },
    ]);

    expect(
      session.rejectedSends,
      "the cell's premise: the one send was swallowed and appended nothing",
    ).toBe(1);
    expect(
      session.entries.length,
      "the cell's premise: the swallowed send left the transcript empty",
    ).toBe(0);
    expectLoudTransportErr(
      execution,
      START_PHASE_NAMING,
      START_PHASE_WORD,
      "start-phase",
      PROMPT_MODE_START_PHASE_EXPIRY_MESSAGE,
    );
  });

  it("(ii) two on-session queries: every send must be issued while the session is idle and the prior turn's slice is settled, and query 2 must never bind query 1's answer", async () => {
    // The cell-89 interleaving. Query 1's run commits its reply early and then
    // keeps streaming past `TURN_END_POLL_BOUND`, so at HEAD the drive walks
    // out of query 1 with the right value but with the run STILL ACTIVE, and
    // query 2's send lands while the host reports streaming — rejected
    // asynchronously (agent-session.js:834, swallowed at
    // agent-session.js:1858), appending no user entry. `extractTrailingTurnText` then anchors on query 1's user entry
    // and query 2 binds "604": the shape recorded verbatim in the bug's
    // §Reproduction (d).
    const { execution, session } = await driveLiveTheta(TWO_QUERY_THETA, [
      { startsAfterPolls: 1, replyAfterPolls: 3, endsAfterPolls: 70000, reply: Q1_REPLY },
      { startsAfterPolls: 1, replyAfterPolls: 2, endsAfterPolls: 3, reply: Q2_REPLY },
    ]);

    expect(
      session.sendUserMessageCalls >= 1,
      `the drive must reach the live seam; observed sends: ${JSON.stringify(session.sentQueryTexts)}`,
    ).toBe(true);
    // The §Fix's pre-send settlement gate, stated over the sends that were
    // actually issued: length-independent, because post-fix a query whose
    // gate expires yields its Err and issues no send at all.
    expect(
      session.sendObservations.filter((o) => !o.sessionIdle || !o.priorSliceSettled),
      "bug 0288 §Fix item 1: query N+1 is issued only after query N's turn settled — " +
        "no send may be issued while the session is streaming or the prior slice is open; " +
        `observed sends: ${JSON.stringify(session.sendObservations)}`,
    ).toEqual([]);
    expect(
      session.rejectedSends,
      "no send may be swallowed by the host's extension-error channel (§Fix item 1 removes " +
        `candidate 2 by construction); observed sends: ${JSON.stringify(session.sendObservations)}`,
    ).toBe(0);
    // §Fix item 3: the second query's value can only come from its own settled
    // slice — never the previous turn's text, never the empty string.
    const finalValue = execution.result.value;
    expect(
      finalValue,
      "bug 0288 §Reproduction (d): query 2 must not bind query 1's answer " +
        `(outcome '${execution.outcome}')`,
    ).not.toBe(Q1_REPLY);
    expect(
      finalValue,
      `query 2 must not bind the empty string either (outcome '${execution.outcome}')`,
    ).not.toBe("");
  });

  it("(vi) the dispatch reaches the drive while a run it did not issue is in flight: the pre-send gate expires loudly and NO send is issued", async () => {
    // The reachable pre-send-gate expiry. A slash command reaches the theta
    // from inside `prompt()` (`_tryExecuteExtensionCommand`,
    // agent-session.js:806 / :927), so `ctx.isIdle()` can be false before the
    // drive has sent anything at all; here that run never ends. The gate is
    // keyed on `ctx.isIdle()` alone, so this is the ONE shape that expires it:
    // the drive must not send into a streaming session (the send would be
    // rejected asynchronously and swallowed — agent-session.js:1858) and must
    // not walk out with a value either.
    const { execution, session } = await driveLiveTheta(ONE_QUERY_THETA, [], {
      ambientRunActive: true,
    });

    expect(
      session.isIdle(),
      "the cell's premise: a run this drive did not issue was in flight throughout",
    ).toBe(false);
    expect(
      session.sendUserMessageCalls,
      "a gate expiry issues NO send at all; observed sends: " +
        JSON.stringify(session.sentQueryTexts),
    ).toBe(0);
    expectLoudTransportErr(
      execution,
      GATE_PHASE_NAMING,
      GATE_PHASE_WORD,
      "pre-send-gate",
      PROMPT_MODE_PRE_SEND_GATE_EXPIRY_MESSAGE,
    );
  });
});

// ===========================================================================
// SEQUENCING cell — the positive half of §Fix→Verification's "a two-query case
// proving query 2's send is issued only after query 1's settled slice exists".
// Both turns settle well inside every bound, so the drive completes and the
// ORDERING itself is the observable.
// ===========================================================================

describe("bug 0288 (SEQUENCING) — two on-session queries settle in order and each binds its own reply", () => {
  it("(vii) query 2's send is issued on an idle session, strictly after query 1's settled slice exists, and binds query 2's own reply", async () => {
    const { execution, session } = await driveLiveTheta(TWO_QUERY_THETA, [
      { startsAfterPolls: 1, replyAfterPolls: 2, endsAfterPolls: 3, reply: Q1_REPLY },
      { startsAfterPolls: 1, replyAfterPolls: 2, endsAfterPolls: 3, reply: Q2_REPLY },
    ]);

    expect(
      session.sendUserMessageCalls,
      "both queries must reach the live seam; observed sends: " +
        JSON.stringify(session.sentQueryTexts),
    ).toBe(2);
    expect(session.sentQueryTexts, "the two sends are the two query bodies, in order").toEqual([
      Q1_TEXT,
      Q2_TEXT,
    ]);
    const secondSend = session.sendObservations[1]!;
    expect(
      secondSend.sessionIdle,
      "§Fix item 1: query 2's send observed the session IDLE at the moment it was issued; " +
        `observed: ${JSON.stringify(secondSend)}`,
    ).toBe(true);
    expect(
      secondSend.priorSliceSettled,
      `§Fix item 1: query 1's slice was settled at query 2's send; observed: ${JSON.stringify(secondSend)}`,
    ).toBe(true);
    // The strict ordering demand, stated over the transcript snapshot taken at
    // query 2's send: query 1's user entry AND the reply that settled it were
    // already on the session, and nothing of query 2's was.
    expect(
      secondSend.transcriptAtSend,
      "§Fix→Verification: query 2's `sendUserMessage` is issued strictly AFTER query 1's " +
        "settled slice exists — its user entry plus the non-empty assistant reply",
    ).toEqual([`user:${Q1_TEXT}`, `assistant:${Q1_REPLY}`]);
    expect(
      session.rejectedSends,
      "no send may be swallowed by the host's extension-error channel",
    ).toBe(0);
    expect(
      execution.outcome,
      `both turns settled, so the drive must succeed; error: ${JSON.stringify(execution.error)}`,
    ).toBe("success");
    expect(
      execution.result.value,
      "§Fix item 3: query 2 binds its OWN reply, never query 1's answer and never the empty string",
    ).toBe(Q2_REPLY);
  });
});

// ===========================================================================
// GUARD cell — GREEN at HEAD by construction. It protects the §Fix from
// OVER-firing: the loud expiry must not fire on a turn that simply settled
// faster than the drive could observe it.
// ===========================================================================

describe("bug 0288 (GUARD) — a turn that settles inside one poll interval still binds its reply", () => {
  it("(v) the user entry and the reply are both committed before the first poll, so `isIdle()` is never observed false: the query still binds its own reply", async () => {
    // Both `#pollWhile` calls (production-theta-producer.ts:4838 and :4854)
    // see a permanently idle
    // session — the start poll expires — yet the turn IS settled: its user
    // entry has a non-empty assistant text after it. HEAD binds the reply
    // (start-poll expiry is silent), and the §Fix must keep binding it: the
    // new loud expiry keys on the SETTLED SLICE, not on having observed the
    // run non-idle.
    const { execution, session } = await driveLiveTheta(ONE_QUERY_THETA, [
      {
        instantSettle: true,
        reply: "pong answer",
        startsAfterPolls: Number.POSITIVE_INFINITY,
        replyAfterPolls: Number.POSITIVE_INFINITY,
        endsAfterPolls: Number.POSITIVE_INFINITY,
      },
    ]);

    expect(session.sendUserMessageCalls, "exactly one user-visible send").toBe(1);
    expect(
      session.isIdle(),
      "the cell's premise: the session was idle throughout — the run was never observable",
    ).toBe(true);
    expect(
      execution.outcome,
      `a settled fast turn must not fail; error: ${JSON.stringify(execution.error)}`,
    ).toBe("success");
    expect(
      execution.result.value,
      "the settled slice's assistant text is the query's value (PIC-53)",
    ).toBe("pong answer");
  });
});
