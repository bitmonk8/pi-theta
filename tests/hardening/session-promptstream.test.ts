// Hardening lens: PROMPT-MODE USER-VISIBLE STREAMING FOR EVERY QUERY (SLSH-2).
//
// This probe pins the QTL-1 fix: in prompt mode, assistant tokens for EVERY
// query (not just the first) stream into the user's transcript in real time.
// The pre-fix behaviour drove only the FIRST non-short-circuit query as a
// user-visible streamed turn and ran every subsequent query off-session
// (`complete()`, no transcript card), so a body's trailing query never appeared
// in the transcript (and the off-session path resolved no auth, so a chained
// query could return an empty error-stop reply).
//
// Method: a single prompt-mode loom issues TWO queries in its body. Each
// dispatches as a real user-visible turn in the SAME session, so the exact
// loom-computed query prompt appears in the deterministic `userTexts` channel;
// the streamed reply accumulates in `assistantText`. Sequential execution (the
// executor awaits each query) means there is no stream-interleaving risk — the
// original DIVERGENCE rationale does not hold.
//
// The load-bearing SLSH-2/QTL-1 claim ("both queries dispatch a user-visible
// turn") is pinned on `userTexts` (model-independent), NOT on the model obeying
// "Reply with exactly" — opus does not reliably obey that, so asserting
// `assistantText` contains the sentinel is flaky. `assistantText` is only
// checked non-empty to confirm each turn streamed.
//
// NOTE (QRY-19): the FIRST query must NOT be a bare non-tail `@`-query — that is
// a `loom/parse/discarded-query-result` (must-use Result discarded) ERROR that
// un-registers the loom, after which `/twostream` falls through to the model as
// literal text. It is bound to `_` (explicit discard) so it still dispatches a
// user-visible turn without tripping QRY-19; the second stays the void tail.
//
// Findings: QTL-1 (tests/hardening/cli-findings/queries-toolloop.md).

import { describe, it, expect } from "vitest";
import { requireLiveProvider, runProbe } from "./probe-harness";
import type { PlantedFile } from "./probe-harness";

const provider = requireLiveProvider();

const F = (path: string, lines: string[]): PlantedFile => ({
  source: "project",
  path,
  text: lines.join("\n"),
});

describe("prompt-mode user-visible streaming for every query (SLSH-2 / QTL-1)", () => {
  it(
    "QTL-1 FIXED: both queries in a prompt-mode body stream into the transcript",
    { retry: 1, timeout: 180000 },
    async () => {
      const probe = await runProbe({
        provider,
        files: [
          F("twostream.loom", [
            "---",
            "description: twostream",
            "mode: prompt",
            "---",
            "let _ = @`Reply with exactly: AAA`",
            "@`Reply with exactly: BBB`",
          ]),
        ],
        drives: ["/twostream"],
      });
      try {
        const t = probe.turns[0];
        console.log("QTL-1 assistantText:", JSON.stringify(t.assistantText));
        console.log("QTL-1 userTexts:", JSON.stringify(t.userTexts));
        console.log("QTL-1 error:", t.error);
        // The loom registered (QRY-19 did not drop it) — zero model tokens.
        expect(probe.registeredNames).toContain("twostream");
        // BOTH queries dispatched a real user-visible turn (deterministic,
        // model-independent): the exact loom-computed prompt text appears as a
        // user turn. Pre-fix, the trailing query ran off-session (no turn).
        expect(t.userTexts.join("\n")).toContain("Reply with exactly: AAA");
        expect(t.userTexts.join("\n")).toContain("Reply with exactly: BBB");
        // Guard the QRY-19 fall-through regression: an unregistered slash would
        // send the literal "/twostream" to the model instead.
        expect(t.userTexts.join("\n")).not.toContain("/twostream");
        // Each dispatched turn streamed a non-empty reply into the transcript.
        // (NOT asserting the sentinel content — opus does not reliably obey
        // "Reply with exactly", so a content assert is flaky; dispatch is the
        // SLSH-2/QTL-1 contract and is pinned by userTexts above.)
        expect(t.assistantText.length).toBeGreaterThan(0);
        expect(t.error).toBeUndefined();
      } finally {
        await probe.dispose();
      }
    },
  );
});
