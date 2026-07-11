// Cancellation lens — hardening probes.
//
// CANCELLATION is largely a SOURCE-INSPECTION lens: `runProbe` cannot inject a
// mid-turn AbortSignal into a live drive, so the cancelled terminal outcome, the
// loop-iter / binder-call checkpoints, and the late-settlement race rules are
// not live-reproducible here. The findings that require an injected abort live
// in `session-findings/cancellation.md` tagged `source-inspection`.
//
// What IS live-reachable is the negative surface: confirm that a straight-line
// run and a compute-only `for`-loop run to completion with NO spurious
// cancellation — no `cancelled` system note, deterministic user-turn text — so
// the never-aborting fallback signal (`ctx.signal ?? new AbortController().signal`,
// production-loom-producer.ts:529) never spuriously flips a checkpoint.

import { describe, it, expect } from "vitest";
import { requireLiveProvider, runProbe } from "./probe-harness";

describe("cancellation lens — no spurious cancel on the live surface", () => {
  const provider = requireLiveProvider();

  it("a compute-only for-loop then a query completes Ok with no cancelled note (CANCEL-6 negative)", async () => {
    const probe = await runProbe({
      provider,
      files: [
        {
          source: "project",
          path: "nocancel.loom",
          text: [
            "---",
            "description: cancel negative probe",
            "mode: prompt",
            "---",
            "let mut sum = 0",
            "for x in [1, 2, 3] {",
            "  sum += x",
            "}",
            "@`SUM=${sum} Reply with exactly: OK`",
          ].join("\n"),
        },
      ],
      drives: ["/nocancel"],
    });
    try {
      expect(probe.registeredNames).toContain("nocancel");
      const turn = probe.turns[0];
      // The loop ran all three iterations (no spurious cancel mid-loop): the
      // computed user-turn text is deterministic regardless of the model reply.
      const allUser = turn.userTexts.join("\n");
      expect(allUser).toContain("SUM=6");
      // No cancelled terminal outcome / SNK-f note was emitted for a clean run.
      const notes = turn.systemNotes.join("\n");
      expect(notes).not.toContain("cancelled");
      // The run did not throw.
      expect(turn.error).toBeUndefined();
    } finally {
      await probe.dispose();
    }
  });
});
