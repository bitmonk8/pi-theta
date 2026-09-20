// Bug 0482 — a host auto-compaction landing MID driven-turn is read by the
// prompt-mode drive as the turn settling: the query binds the PARTIAL reply
// that precedes the compaction instead of waiting for (or loudly failing on)
// the post-compaction continuation.
//
// docs/bugs/0482-prompt-drive-treats-host-auto-compaction-as-turn-settled.md
// (§Fix, settled 2026-09-20). CONTRACT 1 — WAIT THROUGH IT: a `compaction`
// session entry appended mid driven-turn does NOT settle the driven turn. The
// turn is settled only when an assistant reply FOLLOWS the compaction entry.
// PIC-70's settle-phase expiry is the loud backstop: a compaction with no
// following reply must eventually time out and fail loudly (a query
// `Err(transport)` on the PIC-50/PIC-51 register), NEVER bind an empty/partial
// string.
//
// THE DEFECT (this file pins it):
//   - The prompt-mode drive is `LivePromptQueryModel.#driveUserVisibleTurn`
//     (production-theta-producer.ts:6490). Its settle detection is
//     `thisTurnSettled(this.#readMessages(), turnStart, ...)` at TWO sites —
//     the start-poll (production-theta-producer.ts:6677) and the settle-poll
//     (production-theta-producer.ts:6772).
//   - `thisTurnSettled` (production-theta-producer.ts:6983) =
//     `turnSliceSince(messages, turnStart).opened &&
//      isSettledTurnEnding(slice.after)`. `turnSliceSince`
//     (production-theta-producer.ts:6963) locates the slice after the LAST
//     `user`-role message; `isSettledTurnEnding`
//     (production-theta-producer.ts:6945) returns true if any trailing
//     `assistant` message exists in that slice (or it ends in a `toolResult`).
//   - `#readMessages()` builds `buildSessionContext(getEntries(),
//     getLeafId()).messages` (`readMessages`, production-theta-producer.ts:2211). VERIFIED
//     against node_modules/@earendil-works/pi-coding-agent/dist/core/
//     session-manager.js: `buildContextEntries` REORDERS a compacted leaf path
//     to `[compactionEntry, ...keptEntriesFromFirstKeptEntryId..., ...entries
//     AfterTheCompaction...]`, and `sessionEntryToContextMessages` projects a
//     `type:"compaction"` entry to a `{role:"compactionSummary", ...}` message
//     — so a `compaction` entry HOISTS to the HEAD of the built message list.
//   - When a compaction lands mid-turn with a PARTIAL assistant already
//     committed (the non-split case: `firstKeptEntryId` = the driven user
//     turn), the built messages become
//     `[compactionSummary, user(driven), assistant(partial)]`. `turnSliceSince`
//     finds the last `user` and the slice-after is `[assistant(partial)]`, so
//     `isSettledTurnEnding` returns TRUE — the turn reads SETTLED and the drive
//     extracts the PARTIAL text (via `extractTrailingTurnText`,
//     src/runtime/conversation-drive.ts:171), even though no reply followed the
//     compaction. This is the silent bind.
//
// EMPIRICAL PROJECTION CONFIRMATION (see the top-of-cell comments): the harness
// drives the REAL producer against a session double whose `getEntries()` yields
// the faithful `[user, assistant(partial), compaction]` topology, so
// `#readMessages()` performs the REAL `buildSessionContext` reorder — the RED
// below is the genuine premature-settle defect, not a fabricated message list.
//
// CHILD-REGIME TWIN (bug §Fix "Child-regime twin"): the subagent `--no-session`
// visible child drives the root theta through this SAME
// `LivePromptQueryModel.#driveUserVisibleTurn` seam — pi-integration-contract/
// subagent.md:33 (PIC-58, subagent-root regime): "the child MUST instead drive
// the root theta against the process's own host session (prompt-mode driver
// mechanics)". There is no divergent child settle-detection code path: the
// child regime and the parent prompt-mode drive share the single
// `#driveUserVisibleTurn` seam this offline witness exercises. This file
// therefore covers BOTH regimes; a live subagent-child variant would exercise
// no additional settle-detection logic. (The harness asserts
// `binding.drivenAgainst === "prompt-user-session"` — the shared seam.)
//
// TIER: unit, offline, deterministic, provider-free. The house pattern of
// tests/b0288-prompt-turn-completion-witness.test.ts and tests/b0478-*: drive
// the REAL prompt-mode binding (`createProductionProducerDeps` →
// `bindPromptConversation` → `executeBody`) against a hand-built session double
// with an injected `Clock` whose `setTimeout` `tick()`s the double then fires
// synchronously (one setTimeout == one drive poll — `macrotask`,
// production-theta-producer.ts). No provider, no network, no real timers. The
// integration/live tier is not needed: the defect is entirely in the built
// `Message[]` projection the settle probe reads, reachable with a scripted
// `SessionManager` double.
//
// Spec: pi-integration-contract/conversation-drive.md (PIC-53 extraction,
// PIC-70 settle-phase expiry); pi-integration-contract/subagent.md:33 (PIC-58).

import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import { executeBody, type BodyExecution } from "../src/runtime/statement-executor";
import { PROMPT_MODE_SETTLE_PHASE_EXPIRY_MESSAGE } from "../src/runtime/prompt-transport-mapping";
import type { RuntimeRoot } from "../src/runtime-root";
import {
  ajv,
  ANTHROPIC_MODEL,
  appendAssistantEntry,
  appendMessageEntry,
  appendUserEntry,
  parse,
  type SessionEntryDouble,
} from "./helpers/scripted-live-session-harness";

// --- The compaction session-entry helper (§the seam) ------------------------

/**
 * Append a `type:"compaction"` session entry, chaining its `id`/`parentId` from
 * the existing entry list exactly as `appendMessageEntry` does so
 * `getLeafId(): undefined` resolves the leaf as the last entry and the
 * `parentId` walk reconstructs the path (buildSessionPath,
 * node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.js).
 *
 * The field shape mirrors tests/b0478-*'s `compactedEntries()`:
 * `{ type, id, summary, firstKeptEntryId, tokensBefore }`. `buildContextEntries`
 * hoists this entry to the head of the context path and
 * `sessionEntryToContextMessages` projects it to `{role:"compactionSummary",…}`
 * via `createCompactionSummaryMessage` (which reads `summary`/`tokensBefore`).
 */
function appendCompactionEntry(entries: SessionEntryDouble[], firstKeptEntryId: string): void {
  const id = `e${entries.length + 1}`;
  const parentId = entries.length === 0 ? undefined : `e${entries.length}`;
  entries.push({
    type: "compaction",
    id,
    parentId,
    summary: "auto-compaction: prior context summarised",
    firstKeptEntryId,
    tokensBefore: 130000,
  } as unknown as SessionEntryDouble);
}

// --- The scripted mid-turn-compaction session lifecycle ---------------------

/**
 * One scripted milestone, expressed in POLL INTERVALS (`Clock.setTimeout` hook
 * invocations, i.e. drive polls) since the driven `sendUserMessage`.
 */
interface Milestone {
  /** Poll ordinal (1-based, since the send) at which this milestone fires. */
  readonly atPoll: number;
  /** What to append at this poll. */
  readonly append: "partial" | "compaction" | "reply";
  /** The assistant text (for `partial` / `reply`). */
  readonly text?: string;
  /** For `compaction`: the `firstKeptEntryId` (the non-split case = the driven user entry). */
  readonly firstKeptEntryId?: string;
  /** Whether the session goes idle AFTER this append (the run's idle window). */
  readonly goIdle?: boolean;
}

/**
 * The live user-session double, driven by a scripted milestone list. Models the
 * FAITHFUL overflow-recovery lifecycle (docs/compaction.md, bug §Evidence):
 *
 *   send  → append the driven `user` entry, go ACTIVE (streaming)
 *   poll1 → append the PARTIAL assistant while STILL ACTIVE (the turn began
 *           to answer, then overflowed)
 *   poll2 → append the `compaction` entry and go IDLE — the aborted-turn idle
 *           window: the run was aborted on overflow, a host auto-compaction
 *           entry appended, the run went idle. THIS is the moment HEAD
 *           mis-reads as the turn settling.
 *   pollR → (wait-through variant only) the turn is RETRIED: append the
 *           following assistant reply and go idle again.
 *
 * `isIdle()` mirrors the host: `isIdle === !isStreaming`. The compaction and
 * partial are committed while ACTIVE / at the aborted-idle boundary, never in
 * the same instant as the driven user entry, so the built projection the
 * settle probe reads is genuinely `[compactionSummary, user, assistant(partial)]`.
 */
class CompactionScriptedSession {
  readonly entries: SessionEntryDouble[] = [];
  readonly sentTexts: string[] = [];
  sendUserMessageCalls = 0;
  rejectedSends = 0;

  #idle = true;
  #ticks = 0;
  #sent = false;
  readonly #milestones: readonly Milestone[];

  constructor(milestones: readonly Milestone[], preseed?: (entries: SessionEntryDouble[]) => void) {
    this.#milestones = [...milestones];
    preseed?.(this.entries);
  }

  sendUserMessage(text: string): void {
    if (!this.#idle) {
      // The host rejects a send while streaming (agent-session.js:834), swallowed
      // async (agent-session.js:1858) — no user entry, no run. None of these cells
      // issues a second send, so this only guards a harness-wiring error.
      this.rejectedSends += 1;
      return;
    }
    this.sendUserMessageCalls += 1;
    this.sentTexts.push(text);
    appendUserEntry(this.entries, text);
    this.#idle = false; // go active — the driven turn is now streaming
    this.#sent = true;
    this.#ticks = 0;
  }

  isIdle(): boolean {
    return this.#idle;
  }

  /**
   * Advance the scripted lifecycle by one poll interval. Invoked from the
   * injected `Clock.setTimeout`, i.e. exactly once per drive poll.
   */
  tick(): void {
    if (!this.#sent) {
      return;
    }
    this.#ticks += 1;
    for (const m of this.#milestones) {
      if (m.atPoll !== this.#ticks) {
        continue;
      }
      if (m.append === "partial" || m.append === "reply") {
        appendAssistantEntry(this.entries, m.text);
      } else {
        appendCompactionEntry(this.entries, m.firstKeptEntryId!);
      }
      if (m.goIdle === true) {
        this.#idle = true;
      }
    }
  }

  /** The RAW chronological entry roles/types (topology premise, not `#readMessages`'s built projection). */
  builtRoles(): string[] {
    // Reports entries in `this.entries`' own append order (chronological, un-hoisted) — the
    // topology the cells' premise guards assert against. `#readMessages()` instead builds
    // `buildSessionContext(...).messages`, which reorders a compacted path by hoisting the
    // `compaction` entry to the head; that reordered projection is deliberately NOT what this
    // helper reports.
    return this.entries.map((e) => String((e as { message?: { role?: unknown } }).message?.role ?? (e as { type: string }).type));
  }
}

// --- Harness (mirrors b0288's local harness exactly) ------------------------

/**
 * `clock.setTimeout` advances the session double by one poll interval and then
 * fires the callback synchronously: `macrotask` is the drive's only wait
 * primitive, so the drive's poll count and the double's lifecycle clock are the
 * same clock. Deterministic, no real timers.
 */
function rootDouble(session: CompactionScriptedSession): RuntimeRoot {
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

function piDouble(session: CompactionScriptedSession): ExtensionAPI {
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
 * `waitForIdle()` resolves IMMEDIATELY (the faithful host limiting case, bug
 * 0288 P5) so no cell can be discharged by a hang; the settle detection under
 * test runs on `#readMessages()` regardless.
 */
function ctxDouble(session: CompactionScriptedSession): ExtensionCommandContext {
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

/** Drive a fixture theta through the production prompt-mode binding — the shared PIC-58 seam. */
async function driveLiveTheta(
  source: string,
  milestones: readonly Milestone[],
  preseed?: (entries: SessionEntryDouble[]) => void,
): Promise<{ readonly execution: BodyExecution; readonly session: CompactionScriptedSession }> {
  const doc = parse(source);
  const theta: ThetaCompositionInput = {
    slashName: "probe",
    sourcePath: "/theta/probe.theta",
    frontmatter: doc.frontmatter!,
    body: doc.body,
  };
  const session = new CompactionScriptedSession(milestones, preseed);
  const deps = createProductionProducerDeps({
    pi: piDouble(session),
    root: rootDouble(session),
    modelRegistry: {} as unknown as ModelRegistry,
  });
  const binding = deps.bindPromptConversation({ theta, args: "", ctx: ctxDouble(session) });
  // PIC-58: the subagent-root child drives THIS same prompt-user-session seam.
  expect(
    binding.drivenAgainst,
    "the harness must bind the LIVE prompt-mode drive (the user session) — the single seam " +
      "the parent prompt drive AND the subagent-root child (PIC-58) both use",
  ).toBe("prompt-user-session");
  const execution = await executeBody(theta.body, binding.executeDeps);
  return { execution, session };
}

// --- The driven theta -------------------------------------------------------
// The `?` unwinds a query `Err` out of the body (ERR-18): a loud failure is a
// `fail` outcome whose `execution.error` IS the leaf QueryError; a silent bound
// value is a `success` outcome whose final value is the extracted string.
const ONE_QUERY_THETA = ["---", "mode: prompt", "---", "let v = @`Ping`?", "v", ""].join("\n");

const PARTIAL = "The review of shard-02 begins: file 1 of 15";
const REPLY = "shard-02 complete: no blocking issues across all 15 files";

/** The driven user entry's id on an empty session (appendUserEntry → `e1`). */
const DRIVEN_USER_ID = "e1";

// The faithful mid-turn-compaction lifecycle: PARTIAL committed while active
// (poll 1), then the `compaction` lands and the run goes idle (poll 2). The
// following reply, when present, arrives on the retry well AFTER the aborted
// idle window (poll 6) — beyond the two polls HEAD consumes before it walks out
// binding the partial.
const MID_TURN_COMPACTION: readonly Milestone[] = [
  { atPoll: 1, append: "partial", text: PARTIAL },
  { atPoll: 2, append: "compaction", firstKeptEntryId: DRIVEN_USER_ID, goIdle: true },
];

/**
 * Assert a drive failed loudly with the §Fix's settle-phase `Err(TransportError)`
 * on the PIC-50/PIC-51 register, binding NO value (mirrors b0288's
 * `expectLoudTransportErr`, settle phase only).
 */
function expectLoudSettleErr(execution: BodyExecution): void {
  expect(
    execution.outcome,
    "bug 0482 contract 1: a trailing compaction with NO following reply must time out via the " +
      "PIC-70 settle-phase expiry and bind NO value — never a silent partial/empty bind; " +
      `observed outcome '${execution.outcome}' with final value ${JSON.stringify(execution.result.value)}`,
  ).toBe("fail");
  const error = execution.error as unknown as Record<string, unknown> | null;
  expect(
    error !== null && typeof error === "object",
    `the fail outcome must carry the leaf QueryError; observed: ${JSON.stringify(error)}`,
  ).toBe(true);
  const leaf = error as Record<string, unknown>;
  expect(leaf.kind, `PIC-50/PIC-51 transport register; observed: ${JSON.stringify(leaf)}`).toBe(
    "transport",
  );
  expect(leaf.http_status, "no HTTP status is observable at the prompt-mode seam").toBeNull();
  expect(leaf.retryable, "a bound expiry is a definite outcome — retryable: false").toBe(false);
  expect(
    leaf.provider,
    "provider is the user session model's API-shaped `.api` value (PIC-50)",
  ).toBe("anthropic-messages");
  const message = typeof leaf.message === "string" ? leaf.message : "";
  expect(
    message.includes(PROMPT_MODE_SETTLE_PHASE_EXPIRY_MESSAGE),
    "the expiry must be built from the settle-phase stem " +
      "PROMPT_MODE_SETTLE_PHASE_EXPIRY_MESSAGE; observed: " +
      JSON.stringify(message),
  ).toBe(true);
}

// ===========================================================================
// WITNESS cells — RED at HEAD for the settle-detection defect.
// ===========================================================================

describe("bug 0482 (RED) — a mid-turn host auto-compaction must not settle the driven prompt turn", () => {
  it("(1) WAIT-THROUGH: a reply FOLLOWS the compaction — the drive must wait through it and bind the reply, not the premature partial", async () => {
    // Projection (VERIFIED against session-manager.js): the driven turn commits
    // a PARTIAL assistant (poll 1), then a `compaction` entry (firstKeptEntryId
    // = the driven user entry) lands and the run goes idle (poll 2). At that
    // idle window `#readMessages()` builds — via `buildContextEntries`'s reorder
    // to `[compaction, user, partial]` + `sessionEntryToContextMessages` —
    // `[compactionSummary, user, assistant(partial)]`. `turnSliceSince`
    // (production-theta-producer.ts:6942) anchors the last `user`; the
    // slice-after is `[assistant(partial)]`, so `isSettledTurnEnding`
    // (production-theta-producer.ts:6945) returns TRUE and `thisTurnSettled`
    // (production-theta-producer.ts:6983) reads the turn SETTLED. The settle
    // detection at production-theta-producer.ts:6677/:6772 then lets the drive
    // walk out and `extractTrailingTurnText` (conversation-drive.ts:171) binds
    // the PARTIAL — before the retry's following reply (poll 6) ever lands.
    // HEAD therefore returns success with value === PARTIAL: RED here, because
    // the reply is missing.
    const { execution, session } = await driveLiveTheta(ONE_QUERY_THETA, [
      ...MID_TURN_COMPACTION,
      { atPoll: 6, append: "reply", text: REPLY, goIdle: true },
    ]);

    expect(
      session.sendUserMessageCalls,
      "the drive issued exactly one user-visible send (the live seam was reached)",
    ).toBe(1);
    const value = execution.result.value;
    // Contract 1: the turn is settled only when a reply FOLLOWS the compaction,
    // so the bound value must include the post-compaction reply text. At HEAD
    // the drive settled on the partial and never saw the reply.
    expect(
      execution.outcome,
      "bug 0482 contract 1: waiting through a mid-turn compaction to its following reply is a " +
        `SUCCESS, not a failure; observed outcome '${execution.outcome}' (error: ${JSON.stringify(execution.error)})`,
    ).toBe("success");
    expect(
      value,
      "bug 0482 contract 1: the bound value must WAIT THROUGH the compaction and include the " +
        `following reply (PIC-53 concatenates the turn's assistant texts); observed: ${JSON.stringify(value)}`,
    ).toContain(REPLY);
    expect(
      value,
      "bug 0482 THE DEFECT: HEAD binds the PARTIAL that precedes the compaction — the premature " +
        `settle — instead of waiting for the following reply; observed: ${JSON.stringify(value)}`,
    ).not.toBe(PARTIAL);
  });

  it("(2) REPLY ABSENT: a trailing compaction with no reply EVER must fail loudly via the PIC-70 settle-phase expiry, never bind the partial", async () => {
    // Same lifecycle as (1) up to the aborted-idle window, but the retry never
    // produces a reply. At HEAD the built `[compactionSummary, user, partial]`
    // reads SETTLED (as in (1)) and the drive binds the PARTIAL silently:
    // success with value === PARTIAL — RED, because contract 1 demands the
    // settle-phase expiry loud failure instead.
    const { execution, session } = await driveLiveTheta(ONE_QUERY_THETA, MID_TURN_COMPACTION);

    expect(
      session.sendUserMessageCalls,
      "the drive issued exactly one user-visible send (the live seam was reached)",
    ).toBe(1);
    // Guard the topology premise: the RAW chronological entries carry exactly
    // the driven user turn, its partial, and a trailing compaction — no
    // following assistant reply.
    expect(
      session.builtRoles(),
      "the cell's premise: the RAW chronological entries are the driven user turn + partial + a " +
        "trailing compaction, with NO following reply",
    ).toEqual(["user", "assistant", "compaction"]);
    // It must NEVER bind an empty or partial string.
    expect(
      execution.result.value === "" || execution.result.value === PARTIAL,
      "bug 0482: HEAD binds the premature partial (or empty) — the silent bind; the fix must " +
        `fail loudly instead; observed value ${JSON.stringify(execution.result.value)}`,
    ).toBe(false);
    expectLoudSettleErr(execution);
  });
});

// ===========================================================================
// GUARD / CONTROL cells — GREEN both directions. They protect the fix from
// OVER-firing on a turn that carries no unanswered trailing compaction.
// ===========================================================================

describe("bug 0482 (GUARD) — the ordinary settle path is unchanged", () => {
  it("(3a) a normal turn with NO compaction settles and binds its reply exactly as today", async () => {
    // [user, assistant(reply)] — no compaction anywhere. The turn settles the
    // ordinary way (trailing assistant after the driven user) and binds its
    // reply. GREEN at HEAD and post-fix: the fix must not regress this.
    const { execution, session } = await driveLiveTheta(ONE_QUERY_THETA, [
      { atPoll: 1, append: "reply", text: REPLY, goIdle: true },
    ]);

    expect(session.sendUserMessageCalls, "exactly one user-visible send").toBe(1);
    expect(
      execution.outcome,
      `an ordinary settled turn must succeed; error: ${JSON.stringify(execution.error)}`,
    ).toBe("success");
    expect(
      execution.result.value,
      "the settled slice's assistant text is the query's value (PIC-53)",
    ).toBe(REPLY);
  });

  it("(3b) a compaction from a PRIOR already-answered turn precedes THIS turn's user+reply — the driven turn still settles and binds its own reply", async () => {
    // Pre-seed [user1, assistant1, compaction(firstKept=user1)] — an ANSWERED
    // prior turn plus its host compaction. THEN drive: send user2, reply2. The
    // built projection is
    // `[compactionSummary, user1, assistant1, user2, assistant2]`; the driven
    // turn's slice (after user2) ends in assistant2, so it settles and binds
    // assistant2. This proves the fix keys on an UNANSWERED trailing compaction,
    // not on the mere presence of any compaction. GREEN both directions.
    const preseed = (entries: SessionEntryDouble[]): void => {
      appendUserEntry(entries, "prior question"); // e1
      appendMessageEntry(entries, {
        role: "assistant",
        content: [{ type: "text", text: "prior answer" }],
        api: "anthropic-messages",
        provider: "anthropic",
        model: "m1",
        stopReason: "stop",
        timestamp: 0,
      }); // e2
      appendCompactionEntry(entries, "e1"); // e3 — keeps from the prior (answered) turn
    };
    const { execution, session } = await driveLiveTheta(
      ONE_QUERY_THETA,
      [{ atPoll: 1, append: "reply", text: REPLY, goIdle: true }],
      preseed,
    );

    expect(session.sendUserMessageCalls, "exactly one user-visible send (the driven turn)").toBe(1);
    expect(
      session.builtRoles(),
      "the pre-existing compaction is answered by assistant1 and precedes the driven user2 turn",
    ).toEqual(["user", "assistant", "compaction", "user", "assistant"]);
    expect(
      execution.outcome,
      `the driven turn settled the ordinary way; error: ${JSON.stringify(execution.error)}`,
    ).toBe("success");
    expect(
      execution.result.value,
      "the driven turn binds its OWN reply — a prior-turn compaction must not disturb it",
    ).toBe(REPLY);
  });
});
