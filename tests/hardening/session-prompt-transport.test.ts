// Hardening lens: PROMPT-MODE @-QUERY TRANSPORT-ERROR CLASSIFICATION — NO
// REGRESSION on the SUCCESS path (guards PIC-50 / PIC-51).
//
// The prompt-mode `@`-query driver (`LivePromptQueryModel`) now probes the
// driven turn's trailing assistant `stopReason` (PIC-51) and maps a
// `stopReason:"error"` turn to `Err(TransportError)` instead of `Ok(text)`. It
// also maps a `pi.sendUserMessage` synchronous throw to `Err(TransportError)`
// (PIC-50).
//
// RISK guarded here: a false positive where a NORMAL, successful prompt turn
// (stopReason "end_turn"/"stop") is misclassified as a transport error, which
// would break every prompt loom. A real transport error cannot be forced
// deterministically, so this probe only proves the SUCCESS path is unregressed:
// a successful query must still bind a value and let the body continue, and no
// transport error must escape the drive.
//
// Method: sentinel-pinned, token-bounded queries. We assert on the deterministic
// per-drive `userTexts` channel (the exact turn text the loom CODE computed):
// the presence of the SECOND query's text proves the FIRST query returned and
// the body continued (not aborted / not thrown). `turn.error` undefined proves
// no transport error escaped.

import { describe, it, expect } from "vitest";
import { requireLiveProvider, runProbe } from "./probe-harness";
import type { ProbeResult, ProbeTurn } from "./probe-harness";

const provider = requireLiveProvider();

function transportish(s: string | undefined): boolean {
  if (s === undefined) return false;
  return /429|overloaded|transport|rate.?limit|ECONNRESET|timeout|503|529/i.test(s);
}

/** Drive one probe; retry once on a transport-ish failure. Returns the last turn + probe. */
async function drive(
  make: () => Promise<ProbeResult>,
): Promise<{ turn: ProbeTurn | undefined; text: string; probe: ProbeResult }> {
  let probe = await make();
  let turn = probe.turns[probe.turns.length - 1];
  if (turn !== undefined && transportish(turn.error)) {
    await probe.dispose();
    probe = await make();
    turn = probe.turns[probe.turns.length - 1];
  }
  return { turn, text: (turn?.userTexts ?? []).join("\n"), probe };
}

const P = (mode: string, body: string): string =>
  ["---", "description: x", `mode: ${mode}`, "---", body].join("\n");

describe("prompt-mode @-query transport classification — success path unregressed (PIC-50 / PIC-51)", () => {
  it(
    "untyped prompt query success is unregressed (Ok(text), no spurious transport Err)",
    { retry: 1, timeout: 180000 },
    async () => {
      const files = [
        {
          source: "project" as const,
          path: "ptu.loom",
          text: P(
            "prompt",
            [
              "let r = @`PROBE_ECHO reply with exactly the token: PONG`",
              "@`DONE r=${r}|reply with exactly: OK`",
            ].join("\n"),
          ),
        },
      ];
      const { turn, text, probe } = await drive(() => runProbe({ provider, files, drives: ["/ptu"] }));
      try {
        console.log("PIC-51 untyped userTexts:", JSON.stringify(text));
        console.log("PIC-51 untyped error:", turn?.error);
        // First query issued.
        expect(text).toContain("PROBE_ECHO");
        // Second query issued — proves the FIRST query returned and the body
        // continued (a misclassification-abort would not reach the second turn).
        expect(text).toContain("DONE r=");
        // No transport error escaped the drive.
        expect(turn?.error).toBeUndefined();
      } finally {
        await probe.dispose();
      }
    },
  );

  it(
    "typed prompt query success is unregressed (structured value bound, no spurious transport Err)",
    { retry: 1, timeout: 180000 },
    async () => {
      const files = [
        {
          source: "project" as const,
          path: "ptt.loom",
          text: P(
            "prompt",
            [
              "schema Ans { token: string }",
              "let a: Ans = @<Ans>`Return JSON only. Set token to the exact string PONG.`?",
              "@`TYPED token=${a.token}|reply with exactly: OK`",
            ].join("\n"),
          ),
        },
      ];
      const { turn, text, probe } = await drive(() => runProbe({ provider, files, drives: ["/ptt"] }));
      try {
        console.log("PIC-51 typed userTexts:", JSON.stringify(text));
        console.log("PIC-51 typed error:", turn?.error);
        // Second query issued — proves the typed forced-respond turn returned a
        // value and bound `a` (NOT misclassified as a transport error).
        expect(text).toContain("TYPED token=");
        expect(turn?.error).toBeUndefined();
      } finally {
        await probe.dispose();
      }
    },
  );
});
