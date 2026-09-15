// RFC 0011 (V24a-T) — §8-ruling witness cells T1-T5 (the post-compaction
// transcript-reader totality claim).
//
// Spec: docs/rfcs/0011-session-control-tools.md §8 (replacement text, "Test
// cells replacing the RFC's [compaction] arm renders cells");
// `.localpi/tmp/rfc-0011-seam-sheet.md` §1 (§8 RULING — "discharged by
// exclusion (bug 0478)").
//
// GREEN AT BIRTH. Unlike every other RFC 0011 seam-sheet cell, T1-T5 assert
// EXISTING, ALREADY-SHIPPED behaviour: bug 0478 (fixed 0.474.0, human-ruled
// "option A (EXCLUDE)") already drops `compactionSummary` / `branchSummary` /
// `bashExecution` before the truncation walk, `extractTrailingTurnText` is
// already total over a `user`-less / summary-led list (it falls back to the
// whole list and yields `""`), and the per-turn settle probe
// (`turnSliceSince` / `thisTurnSettled`) is already total over a
// mid-flight-compaction-shrunk list. RFC 0011 "adds witnesses, not arms" here
// (§8 replacement text) — these cells are expected to be GREEN today, and
// stay green once V24a lands (V24a touches none of the binder / prompt-mode
// trailing-turn / settle-phase code this file exercises).
//
// RED-DIRECTION CHECK (per AGENTS.md "verify both directions when adding or
// strengthening an assertion"): T5 is a re-pin of the b0478 cells (cited, not
// duplicated — `tests/b0478-augmented-agentmessage-variants-excluded-before-
// walk.test.ts:247` / `:321` stay green, unmodified, and own the full
// closed-set matrix). Locally commenting out the `isTranscriptMessage`
// closed-set guard's `compactionSummary` arm inside
// `src/binder/compact-transcript.ts` (disabling the bug 0478 exclusion) and
// re-running THIS file reds T5 (the leading `compactionSummary` reaches the
// renderer and its transcript body diverges from the without-summary control)
// — verified locally while authoring this file, then restored; no `src/`
// change ships with this commit.
//
// T3/T4 (`turnSliceSince`) cannot import the production symbol: it is a
// PRIVATE, unexported function of `src/extension/production-theta-producer.ts`
// (`#classifyCall`'s neighbour at that module's settle-phase probe), and this
// task's OWNED file set does not include that module. `localTurnSliceSince`
// below is a byte-for-byet mirror of its documented algorithm (seam sheet
// table + the symbol's own doc comment, cited by symbol not line), asserting
// the SAME totality property the production symbol owns. This is flagged as
// an ambiguity in the builder's handoff report: an implementer wiring V24a
// could additionally export `turnSliceSince` (or a thin re-export) so this
// file exercises the production symbol directly.

import { describe, expect, it } from "vitest";
import type { Message } from "@earendil-works/pi-ai";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { extractTrailingTurnText } from "../src/runtime/conversation-drive";
import {
  renderCompactTranscript,
} from "../src/binder/compact-transcript";
import { walkSessionContext } from "../src/binder/session-context-walk";
import { FakeTokenEstimator } from "./helpers/fake-token-estimator";

// --- AgentMessage / Message constructors (mirrors b0478's) ------------------

function user(text: string): Message & AgentMessage {
  return { role: "user", content: text, timestamp: 0 } as Message & AgentMessage;
}

function assistant(text: string): Message & AgentMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "test-model",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: 0,
  } as unknown as Message & AgentMessage;
}

function compactionSummary(summary: string): AgentMessage {
  return { role: "compactionSummary", summary, tokensBefore: 1234, timestamp: 0 } as AgentMessage;
}

// ===========================================================================
// T1 / T2 — extractTrailingTurnText totality over a compaction-led list.
// ===========================================================================

describe("session-control-transcript-readers (V24a-T, green at birth) — extractTrailingTurnText (T1/T2)", () => {
  it("T1: [compactionSummary, user('q'), assistant('a')] anchors on the user message; the summary contributes nothing", () => {
    const messages = [
      compactionSummary("SUMMARY-BYTES") as unknown as Message,
      user("q"),
      assistant("a"),
    ];
    expect(extractTrailingTurnText(messages)).toBe("a");
  });

  it("T2: [compactionSummary] with no user message falls back to the whole list, yielding '' (no throw)", () => {
    const messages = [compactionSummary("SUMMARY-BYTES") as unknown as Message];
    expect(extractTrailingTurnText(messages)).toBe("");
  });
});

// ===========================================================================
// T3 / T4 — the per-turn settle probe (`turnSliceSince`) totality over a
// compaction-led / mid-flight-shrunk list. See file header: mirrors the
// PRIVATE production symbol's documented algorithm (cited by symbol,
// `production-theta-producer.ts` `turnSliceSince`), asserting the same
// totality property.
// ===========================================================================

/**
 * Mirror of `turnSliceSince` (production-theta-producer.ts, PRIVATE): locate
 * the slice after the LAST `user`-role message at or after `fromIndex`.
 * `opened: false` when no such `user` exists at or after `fromIndex` —
 * including when `fromIndex` itself is past the list's end (a mid-flight
 * compaction shrinking the list below the recorded `turnStart`), never a
 * thrown index-out-of-range or a wrong-turn anchor.
 */
function localTurnSliceSince(
  messages: readonly Message[],
  fromIndex: number,
): { readonly opened: boolean; readonly after: readonly Message[] } {
  for (let i = messages.length - 1; i >= fromIndex; i -= 1) {
    if (messages[i]?.role === "user") {
      return { opened: true, after: messages.slice(i + 1) };
    }
  }
  return { opened: false, after: [] };
}

describe("session-control-transcript-readers (V24a-T, green at birth) — turnSliceSince totality (T3/T4)", () => {
  it("T3: [compactionSummary, user, assistant], fromIndex 0 opens on the user and returns the post-user slice", () => {
    const a = assistant("a");
    const messages = [compactionSummary("SUMMARY-BYTES") as unknown as Message, user("q"), a];
    const result = localTurnSliceSince(messages, 0);
    expect(result.opened).toBe(true);
    expect(result.after).toEqual([a]);
  });

  it("T4: a list SHORTER than fromIndex (mid-flight compaction shrank it) reads opened:false — never a wrong-turn anchor", () => {
    const messages = [user("q"), assistant("a")];
    // A `turnStart` recorded before a compaction shrank the list below it (the
    // PIC-70 loud-expiry input the seam sheet cites).
    const result = localTurnSliceSince(messages, 10);
    expect(result.opened).toBe(false);
    expect(result.after).toEqual([]);
  });
});

// ===========================================================================
// T5 — walkSessionContext + renderCompactTranscript over a compaction-led
// list is byte-identical to the same list without the summary. Re-pin of the
// b0478 cells (cited, not duplicated).
// ===========================================================================

describe("session-control-transcript-readers (V24a-T, green at birth) — binder walk + render totality (T5)", () => {
  it("T5: a compaction-led session's rendered transcript is byte-identical to the same session without the leading compactionSummary", () => {
    const u = user("recent question") as unknown as AgentMessage;
    const a = assistant("recent answer") as unknown as AgentMessage;

    const summary = compactionSummary("SUMMARY-BYTES");
    const withSummary: readonly AgentMessage[] = [summary, u, a];
    const without: readonly AgentMessage[] = [u, a];

    // A SMALL weight for the summary (not the b0478 file's large "foreign"
    // weight): the goal here is to prove the closed-set exclusion itself
    // (T5), not budget-truncation dropping the whole turn regardless of
    // classification, which would mask the property under test.
    const counts = new Map<AgentMessage, number>([
      [summary, 10],
      [u, 10],
      [a, 10],
    ]);
    const estimator = new FakeTokenEstimator(counts);
    const walkedWith = walkSessionContext({
      messages: withSummary,
      estimator,
      mode: "prompt",
      bindContext: "session",
    });
    const walkedWithout = walkSessionContext({
      messages: without,
      estimator,
      mode: "prompt",
      bindContext: "session",
    });

    const renderedWith = renderCompactTranscript(walkedWith.includedMessages);
    const renderedWithout = renderCompactTranscript(walkedWithout.includedMessages);

    expect(renderedWith.kind).toBe("ok");
    expect(renderedWithout.kind).toBe("ok");
    if (renderedWith.kind === "ok" && renderedWithout.kind === "ok") {
      expect(renderedWith.sessionContext?.transcriptBody).toEqual(
        renderedWithout.sessionContext?.transcriptBody,
      );
    }
  });
});
