// Bug 0415 — the prompt-mode governor never fires CIO-4's `max_rounds`-final
// branch when the model terminates: an untyped `@`-query whose model uses
// EXACTLY `tool_loop.max_rounds` tool rounds and then answers with text returns
// `Ok(text)` after an extra provider turn, where CIO-4 pins
// `Err(tool_loop_exhausted)` "before any further turn is issued".
//
// docs/bugs/0415-governor-max-rounds-final-boundary-ok-text.md. CIO-4
// (docs/spec_topics/hard-ceilings/ceilings-3-and-4.md:42): "the
// *`max_rounds`-final branch* (`slot_count == max_rounds`: for untyped queries
// the runtime surfaces `Err(QueryError { kind: "tool_loop_exhausted", … })`
// before any further turn is issued)". The in-loop / off-session driver
// (`runUntypedQueryLoop`, src/runtime/query-tool-loop.ts:396–405) enforces this
// — it breaks at `slotCount === maxRounds` BEFORE requesting the terminating
// turn. The prompt-mode native loop cannot: the governor
// (src/extension/prompt-tool-loop-governor.ts:172–186) only sets
// `exhausted: true` when the model ATTEMPTS a round BEYOND the cap. At the exact
// boundary its snapshot is `{ exhausted: false, slotCount: maxRounds }`, so
// `LivePromptQueryModel.nextFreePhaseTurn` round 0
// (src/extension/production-theta-producer.ts:5017) returns `{ kind: "text" }`
// and `runUntypedQueryLoop` binds `Ok(text)` at slotCount 0.
//
// These cells encode the parent-adjudicated route-(b) settle-fold contract that
// Phase 2 WILL implement — NOT the current tree's behaviour:
//   - In the prompt-mode settle fold, when the governor snapshot shows
//     `slotCount === maxRounds` AND the settled trailing turn is text AND the
//     query is UNTYPED (`#respond === undefined`) ⇒ fold to
//     `Err(tool_loop_exhausted)` instead of `Ok(text)`.
//   - The discarded terminating text is threaded as `raw_response` (via the
//     synthetic exhaustion `tool_use` round's `text` slot, exactly like the
//     over-cap `#exhaustionTurn`, production-theta-producer.ts:5038).
//   - `last_tool_name` = the last tool of the FINAL BUDGETED (allowed) round —
//     Phase 2 gains a new governor snapshot field `lastAllowedToolName`; the
//     existing block-only `lastToolName` is unchanged.
//   - An explicit informational `theta-system-note` (bug 0401 law: NO `details`
//     key) is emitted ONCE at the fold, naming the discarded-answer fact.
//   - Typed queries and the off-session driver are UNTOUCHED.
//
// Cells (A) and (B) are RED at the fork against the route-(b) contract (a value
// is bound / no note is emitted); (C) and (D) are GREEN in both directions.
//
// Harness lineage: tests/b0288-prompt-turn-completion-witness.test.ts — drive
// the REAL producer (`createProductionProducerDeps` → `bindPromptConversation`
// → `executeBody`) against an in-memory session double, so the REAL,
// module-local, UNEXPORTED `LivePromptQueryModel` and the REAL
// `PromptToolLoopGovernor` are constructed and reached end-to-end (never a
// hand-built stub). The ONE extension over b0288: this session double captures
// the governor's `before_provider_request` / `tool_call` handlers (registered
// via `pi.on(...)` in query dispatch) and FIRES them during the driven turn, so
// the governor counts real ALLOWED rounds before the terminating text settles.
// Cell (D) mirrors tests/b0327-untyped-exhaustion-raw-response.test.ts's
// ScriptedModel pattern to drive `runUntypedQueryLoop` directly for the
// cross-driver parity control.

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
import { SYSTEM_NOTE_CHANNEL } from "../src/extension/system-note-channel";
import type { Checkpoint, CheckpointKind, CheckpointSite } from "../src/seams/checkpoint";
import {
  runUntypedQueryLoop,
  type ForcedRespondTurn,
  type FreePhaseTurn,
  type QueryModelDriver,
  type QueryToolLoopConfig,
  type ToolCallRequest,
} from "../src/runtime/query-tool-loop";
import type { CommittedSideEffect } from "../src/runtime/no-rollback";

// --- The user session's selected model ---------------------------------------
// A distinct `.api` string so a synthesised provider is checked against the
// API-shaped value the PIC-50 derivation pins (the b0288 fixture discipline).

const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};

// --- The captured governor handlers ------------------------------------------
// The `PromptToolLoopGovernor` registers `before_provider_request` and
// `tool_call` via `pi.on(...)` in query dispatch (ensureRegistered,
// production-theta-producer.ts:3077) BEFORE the first `sendUserMessage`. The
// session double fires them during the driven turn so the governor counts real
// ALLOWED rounds — this is what reaches the boundary snapshot
// `{ exhausted: false, slotCount: maxRounds }`.

interface GovernorHandlers {
  beforeProviderRequest?: () => void;
  toolCall?: (event: Record<string, unknown>) => unknown;
}

/** A `SessionManager` message entry (the `buildSessionContext` read shape). */
interface SessionEntryDouble {
  readonly type: "message";
  readonly id: string;
  readonly parentId: string | undefined;
  readonly message: Record<string, unknown>;
}

/** A note observed on the `theta-system-note` channel via `pi.sendMessage`. */
interface CapturedMessage {
  readonly message: Record<string, unknown>;
}

// --- The session double ------------------------------------------------------

/**
 * The live user-session double for the boundary drive. Its `sendUserMessage`
 * FIRES exactly `allowedRounds` governor rounds — each a
 * `before_provider_request` followed by one `tool_call` the governor allows
 * (roundBoundary → roundsAllowed++) — THEN settles the terminating turn inside
 * the same send (the b0288 `instantSettle` shape: the user entry plus the
 * assistant's plain-text answer, so `isIdle()` is never observed false and the
 * trailing turn is text). With `allowedRounds === maxRounds` the governor's
 * end-of-turn snapshot is `{ exhausted: false, slotCount: maxRounds,
 * lastAllowedToolName: <toolName> }` — the exact boundary this bug is about.
 *
 * Shallow `input: {}` on each `tool_call` so the ceiling-#4 depth walk in
 * `#onToolCall` (prompt-tool-loop-governor.ts) does not block the round.
 */
class GovernorBoundarySession {
  readonly entries: SessionEntryDouble[] = [];
  sendUserMessageCalls = 0;

  readonly #allowedRounds: number;
  readonly #toolName: string;
  readonly #finalText: string;
  readonly #governor: GovernorHandlers;

  constructor(config: {
    readonly allowedRounds: number;
    readonly toolName: string;
    readonly finalText: string;
    readonly governor: GovernorHandlers;
  }) {
    this.#allowedRounds = config.allowedRounds;
    this.#toolName = config.toolName;
    this.#finalText = config.finalText;
    this.#governor = config.governor;
  }

  sendUserMessage(text: string): void {
    this.sendUserMessageCalls += 1;
    // No silent skipping: if the governor never registered its handlers the
    // drive is not reaching the REAL governor and the whole witness is void —
    // fail loudly naming the unmet precondition rather than firing nothing.
    if (this.#governor.beforeProviderRequest === undefined || this.#governor.toolCall === undefined) {
      throw new Error(
        "bug 0415 harness: the governor's before_provider_request/tool_call handlers were " +
          "never registered on the pi double — the REAL PromptToolLoopGovernor was not reached",
      );
    }
    // Fire N allowed rounds: each [before_provider_request, tool_call] pair is
    // one round the governor opens and allows (roundsAllowed++), leaving
    // roundBoundary false until the next provider request.
    for (let i = 0; i < this.#allowedRounds; i += 1) {
      this.#governor.beforeProviderRequest();
      this.#governor.toolCall({
        type: "tool_call",
        toolName: this.#toolName,
        toolUseId: `theta-b0415-round-${i}`,
        input: {},
      });
    }
    // The terminating turn settles instantly: the query's own user entry plus
    // the assistant's plain-text answer. The trailing turn is now text.
    this.#appendUser(text);
    this.#appendAssistant(this.#finalText);
  }

  /** The turn settled inside the send: the session is never observed streaming. */
  isIdle(): boolean {
    return true;
  }

  #appendUser(text: string): void {
    this.#append({ role: "user", content: [{ type: "text", text }], timestamp: 0 });
  }

  #appendAssistant(text: string): void {
    this.#append({
      role: "assistant",
      content: [{ type: "text", text }],
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

// --- Harness (b0288 scaffolding) ---------------------------------------------

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
  const source: ThetaSource = { path: "probe.theta", bytes: new TextEncoder().encode(src) };
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
 * The runtime root. The fast-path drive never polls (the turn settles inside
 * the send, so `isIdle()` is never observed false and the start poll clears at
 * i=0), so `setTimeout` simply fires the callback — no real timers, no network.
 */
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    clock: {
      now: (): number => 0,
      wallNow: (): number => 0,
      setTimeout: (fn: () => void): unknown => {
        fn();
        return 0;
      },
      clearTimeout: (): void => {},
    },
    schemaValidator: ajv(),
  } as unknown as RuntimeRoot;
}

/** The `ExtensionAPI` surface the live drive touches. `on` captures the governor
 * handlers; `sendMessage` sinks every `theta-system-note` the drive emits. */
function piDouble(
  session: GovernorBoundarySession,
  governor: GovernorHandlers,
  messages: CapturedMessage[],
): ExtensionAPI {
  return {
    sendUserMessage: (content: string): void => session.sendUserMessage(content),
    getActiveTools: (): string[] => [],
    setActiveTools: (): void => {},
    registerTool: (): void => {},
    on: (event: string, handler: (...args: unknown[]) => unknown): void => {
      if (event === "before_provider_request") {
        governor.beforeProviderRequest = (): void => {
          void handler(undefined, undefined);
        };
      } else if (event === "tool_call") {
        governor.toolCall = (e: Record<string, unknown>): unknown => handler(e, undefined);
      }
    },
    sendMessage: (message: Record<string, unknown>): void => {
      messages.push({ message });
    },
  } as unknown as ExtensionAPI;
}

/** The dispatch ctx. `waitForIdle()` resolves immediately (b0288's settled-flag
 * limiting case) so no assertion can be discharged by a hang. */
function ctxDouble(session: GovernorBoundarySession): ExtensionCommandContext {
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

interface DriveOutput {
  readonly execution: BodyExecution;
  readonly session: GovernorBoundarySession;
  readonly notes: readonly Record<string, unknown>[];
}

/** Drive an untyped-query boundary theta through the production prompt-mode binding. */
async function driveBoundary(config: {
  readonly maxRounds: number;
  readonly allowedRounds: number;
  readonly toolName: string;
  readonly finalText: string;
}): Promise<DriveOutput> {
  const source = ["---", "mode: prompt", "tool_loop:", `  max_rounds: ${config.maxRounds}`, "---", "let v = @`Ping`?", "v", ""].join("\n");
  const doc = parse(source);
  const theta: ThetaCompositionInput = {
    slashName: "probe",
    sourcePath: "/theta/probe.theta",
    frontmatter: doc.frontmatter!,
    body: doc.body,
  };
  const governor: GovernorHandlers = {};
  const captured: CapturedMessage[] = [];
  const session = new GovernorBoundarySession({
    allowedRounds: config.allowedRounds,
    toolName: config.toolName,
    finalText: config.finalText,
    governor,
  });
  const deps = createProductionProducerDeps({
    pi: piDouble(session, governor, captured),
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
  });
  const binding = deps.bindPromptConversation({ theta, args: "", ctx: ctxDouble(session) });
  expect(
    binding.drivenAgainst,
    "the harness must bind the LIVE prompt-mode drive (the user session), not an off-session host",
  ).toBe("prompt-user-session");
  const execution = await executeBody(theta.body, binding.executeDeps);
  const notes = captured
    .map((c) => c.message)
    .filter((m) => m["customType"] === SYSTEM_NOTE_CHANNEL);
  return { execution, session, notes };
}

/** The observed exhaustion `QueryError` on the fail path (`?` unwinds the Err). */
function expectExhaustionErr(
  execution: BodyExecution,
  expected: { readonly rounds: number; readonly lastToolName: string; readonly rawResponse: string },
): void {
  expect(
    execution.outcome,
    "bug 0415 route-(b): at the `slot_count == max_rounds` boundary an untyped query must fold " +
      "to Err(tool_loop_exhausted), not bind Ok(text); observed outcome " +
      `'${execution.outcome}' with final value ${JSON.stringify(execution.result.value)}`,
  ).toBe("fail");
  const error = execution.error as unknown as Record<string, unknown> | undefined;
  expect(
    error !== undefined && typeof error === "object",
    `the fail outcome must carry the leaf QueryError; observed: ${JSON.stringify(error)}`,
  ).toBe(true);
  const leaf = error as Record<string, unknown>;
  expect(
    leaf["kind"],
    "CIO-4 pins the max_rounds-final branch as tool_loop_exhausted; observed: " + JSON.stringify(leaf),
  ).toBe("tool_loop_exhausted");
  expect(leaf["rounds"], "ERR-19: `rounds == max_rounds` on exhaustion").toBe(expected.rounds);
  expect(
    leaf["last_tool_name"],
    "route-(b): last_tool_name is the last tool of the FINAL BUDGETED (allowed) round",
  ).toBe(expected.lastToolName);
  expect(
    leaf["raw_response"],
    "route-(b): the discarded terminating text is threaded as raw_response",
  ).toBe(expected.rawResponse);
}

// ===========================================================================
// (A) PROMPT-MODE WITNESS — RED at fork. At the exact `slotCount == maxRounds`
// boundary an untyped query terminating with text binds Ok(text) today; the
// route-(b) contract folds it to Err(tool_loop_exhausted). RED because a value
// is bound where the Err is pinned.
// ===========================================================================

describe("bug 0415 (A) — the prompt-mode boundary folds an untyped terminating turn to Err(tool_loop_exhausted)", () => {
  it("(A1) max_rounds:1, exactly 1 allowed round then text: Err(tool_loop_exhausted) with rounds 1, last_tool_name 'read', raw_response the discarded answer", async () => {
    // 1 allowed governor round then the terminating text "the-answer": the
    // governor snapshot is { exhausted: false, slotCount: 1,
    // lastAllowedToolName: "read" }. At the fork nextFreePhaseTurn round 0
    // (production-theta-producer.ts:5017) returns { kind: "text" } and
    // runUntypedQueryLoop binds Ok("the-answer") at slotCount 0 — outcome
    // "success", value "the-answer". The route-(b) fold makes it the Err.
    const { execution, session } = await driveBoundary({
      maxRounds: 1,
      allowedRounds: 1,
      toolName: "read",
      finalText: "the-answer",
    });
    expect(
      session.sendUserMessageCalls,
      "the drive issued exactly one user-visible send (the live seam was reached)",
    ).toBe(1);
    expectExhaustionErr(execution, { rounds: 1, lastToolName: "read", rawResponse: "the-answer" });
  });

  it("(A2) max_rounds:2, exactly 2 allowed rounds then text: Err(tool_loop_exhausted) with rounds 2 (the multi-round drive reaches slotCount == maxRounds)", async () => {
    // Two allowed rounds prove the synthetic exhaustion drive reaches
    // slotCount == maxRounds for maxRounds > 1, not only the degenerate 1==1
    // case. Snapshot { exhausted: false, slotCount: 2, lastAllowedToolName:
    // "read" }; the fork binds Ok("the-answer").
    const { execution, session, notes } = await driveBoundary({
      maxRounds: 2,
      allowedRounds: 2,
      toolName: "read",
      finalText: "the-answer",
    });
    expect(session.sendUserMessageCalls, "exactly one user-visible send").toBe(1);
    expectExhaustionErr(execution, { rounds: 2, lastToolName: "read", rawResponse: "the-answer" });
    // The round>0 synthetic re-entry (reached only for maxRounds>1) must NOT
    // re-emit the note — the note fires once in round 0. This closes the gap
    // that cell (B) (max_rounds:1, no round>0) cannot cover.
    const divergence = notes.filter((note) => {
      const content = typeof note["content"] === "string" ? (note["content"] as string) : "";
      return /discard/i.test(content) && /(exhaust|max[ _]?rounds|round budget)/i.test(content);
    });
    expect(
      divergence.length,
      "the multi-round fold must emit exactly one divergence note; observed theta-system-notes: " +
        JSON.stringify(notes),
    ).toBe(1);
  });
});

// ===========================================================================
// (B) DIVERGENCE NOTE — RED at fork. The route-(b) fold discards a
// user-visible, already-streamed answer, so it emits ONE informational
// `theta-system-note` witnessing the transcript/value divergence. Bug 0401 law:
// NO `details` key. At the fork no fold fires, so no such note exists → RED.
// ===========================================================================

describe("bug 0415 (B) — the fold emits one divergence note naming the discarded answer (no `details` key)", () => {
  it("(B) a theta-system-note lands whose content names the discarded answer and references exhaustion/max_rounds, carrying no `details` key", async () => {
    const { notes } = await driveBoundary({
      maxRounds: 1,
      allowedRounds: 1,
      toolName: "read",
      finalText: "the-answer",
    });
    // The discriminating note: it names the DISCARDED-answer fact and the
    // round-budget exhaustion that caused the divergence. (If Phase 2's exact
    // wording differs, this pattern is the contract it is written against.)
    const divergence = notes.filter((note) => {
      const content = typeof note["content"] === "string" ? (note["content"] as string) : "";
      return /discard/i.test(content) && /(exhaust|max[ _]?rounds|round budget)/i.test(content);
    });
    expect(
      divergence.length,
      "route-(b): the fold must emit exactly one divergence note; observed theta-system-notes: " +
        JSON.stringify(notes),
    ).toBe(1);
    const note = divergence[0]!;
    expect(
      "details" in note,
      `bug 0401 law: an informational theta-system-note carries NO \`details\` key; observed: ${JSON.stringify(note)}`,
    ).toBe(false);
  });
});

// ===========================================================================
// (C) WITHIN-CAP CONTROL — GREEN both directions. max_rounds:2 with only 1
// allowed round then text ⇒ slotCount(1) != maxRounds(2) ⇒ no fold ⇒
// Ok("the-answer") and NO divergence note. Proves the fold does NOT over-fire.
// ===========================================================================

describe("bug 0415 (C) — a within-cap terminating turn binds Ok(text) and emits no divergence note", () => {
  it("(C) max_rounds:2, 1 allowed round then text: outcome success, value the answer, no divergence note", async () => {
    const { execution, session, notes } = await driveBoundary({
      maxRounds: 2,
      allowedRounds: 1,
      toolName: "read",
      finalText: "the-answer",
    });
    expect(session.sendUserMessageCalls, "exactly one user-visible send").toBe(1);
    expect(
      execution.outcome,
      `slotCount(1) != maxRounds(2): no fold, the turn binds normally; error: ${JSON.stringify(execution.error)}`,
    ).toBe("success");
    expect(
      execution.result.value,
      "a within-cap terminating turn binds its own answer",
    ).toBe("the-answer");
    const divergence = notes.filter((note) => {
      const content = typeof note["content"] === "string" ? (note["content"] as string) : "";
      return /discard/i.test(content);
    });
    expect(
      divergence,
      `no fold fired, so no divergence note may be emitted; observed notes: ${JSON.stringify(notes)}`,
    ).toEqual([]);
  });
});

// ===========================================================================
// (D) CROSS-DRIVER PARITY — GREEN both directions. The off-session / in-loop
// driver (`runUntypedQueryLoop`) already Errs at the boundary: it breaks at
// slotCount == maxRounds BEFORE consuming the terminating text turn. This is
// exactly the outcome route-(b) brings the prompt driver level with — both
// drivers Err on identical model behaviour (N tool rounds then a text turn).
// Mirrors tests/b0327-untyped-exhaustion-raw-response.test.ts's ScriptedModel.
// ===========================================================================

const QUERY_SITE: CheckpointSite = { file: "b0415.theta", line: 6, column: 9 };

function loopConfig(maxRounds: number): QueryToolLoopConfig {
  return {
    maxRounds,
    querySite: QUERY_SITE,
    thetaSlashName: "/probe",
    invocationId: "00000000-0000-4000-8000-000000000000",
    occurredAt: 1_700_000_000_000,
  };
}

function liveSignal(): AbortSignal {
  return new AbortController().signal;
}

class NoopCheckpoint implements Checkpoint {
  before(_kind: CheckpointKind, _site: CheckpointSite): Promise<void> {
    return Promise.resolve();
  }
}

/** A scripted driver: ordered free-phase turns and an inert forced respond. */
class ScriptedModel implements QueryModelDriver {
  freePhaseCalls = 0;
  readonly #freeTurns: readonly FreePhaseTurn[];

  constructor(freeTurns: readonly FreePhaseTurn[]) {
    this.#freeTurns = freeTurns;
  }

  nextFreePhaseTurn(round: number): Promise<FreePhaseTurn> {
    this.freePhaseCalls += 1;
    const turn = this.#freeTurns[round];
    if (turn === undefined) {
      // Loud failure: a correct loop exhausts at the `max_rounds`-final branch
      // and never reads past the scripted free phase.
      throw new Error(`no scripted free-phase turn for round ${round}`);
    }
    return Promise.resolve(turn);
  }

  runToolBatch(): Promise<readonly CommittedSideEffect[]> {
    return Promise.resolve([]);
  }

  forcedRespondTurn(): Promise<ForcedRespondTurn> {
    return Promise.resolve({ kind: "respond", payload: null });
  }
}

const toolUseTurn = (toolName: string, text: string): FreePhaseTurn => ({
  kind: "tool_use",
  batch: [{ toolName, toolUseId: `${toolName}-call` } satisfies ToolCallRequest],
  text,
});
const textTurn = (text: string): FreePhaseTurn => ({ kind: "text", text });

describe("bug 0415 (D) — the off-session/in-loop driver Errs at the boundary before the terminating turn", () => {
  it("(D) N tool rounds then a text turn under maxRounds N: tool_loop_exhausted, the terminating text turn is never consumed", async () => {
    // Identical model behaviour to the prompt-mode drive: two tool rounds then
    // a terminating text turn, cap 2. runUntypedQueryLoop breaks at
    // slotCount == 2 == maxRounds BEFORE requesting the round-2 (text) turn.
    const model = new ScriptedModel([
      toolUseTurn("read0", "narration-0"),
      toolUseTurn("read1", "narration-1"),
      textTurn("the-terminating-answer"),
    ]);

    const outcome = await runUntypedQueryLoop(new NoopCheckpoint(), liveSignal(), model, loopConfig(2));

    expect(outcome.kind).toBe("tool_loop_exhausted");
    if (outcome.kind !== "tool_loop_exhausted") return;
    expect(outcome.error.rounds).toBe(2);
    expect(outcome.error.last_tool_name).toBe("read1");
    // The terminating text turn was NEVER requested — the loop Errs before it.
    expect(
      model.freePhaseCalls,
      "the boundary Err fires before the terminating turn is issued (CIO-4 'before any further turn')",
    ).toBe(2);
  });
});
