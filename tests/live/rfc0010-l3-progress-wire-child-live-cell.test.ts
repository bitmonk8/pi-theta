// RFC 0010 (Phase 7d, H8a, live, L3) — the child-regime wire arm, driven
// end to end through a REAL spawned subagent child, updated for RFC 0015
// (D6, decision 4). Contract: child-regime `execute()` branch (EXST-15),
// `child-tap.ts`'s `theta_progress` ingest branch (EXST-5), PIC-74.
//
// H9a OBSERVABLE ROUTE — INVESTIGATED AND REJECTED, WITH REASON (unchanged):
//
// The naive H9a framing spawns an OUTER real `pi -p` process and asks
// whether ITS captured stdout can see a grandchild's `theta_progress` wire
// line. It cannot, by construction: PIC-74's no-relay clause means the wire
// line is written to the INNER (grandchild) process's OWN fd 1, consumed
// inside the OUTER process's own extension instance by
// `attachChildActivityTap`'s in-process line-pump listener — never
// re-emitted onto the OUTER process's stdout. The wire is
// parent-tap-internal by construction; its on-the-wire shape is
// `tests/live/acceptance/rfc0010-l3-wire-json-mode.test.ts`'s job (H9a).
//
// D6 RE-ANCHOR (RFC 0015 decision 4): this cell's original PRESENT
// observable — the parent tap's bus fold rendering the child's newest ✎
// segment on the injected UI double via the footer/widget sinks — RETIRED
// with those sinks (the run card, a TUI-only transcript entry, superseded
// them; a non-TUI composition runs a sink-less bus). What remains live-
// witnessable here, over the SAME real-child topology and the SAME
// `ExtensionRunner.setUIContext` seam:
//
//   PRESENT: a child that really emits `theta_progress` wire lines drives to
//   Ok while (a) ZERO status renders land on the retired ctx.ui surfaces
//   (decision 4 — pre-D6 this exact double recorded
//   `θ /l3wirepresentcaller … · ✎ child tick two` setStatus lines here), (b)
//   NO milestone entry is minted for the wire-ingested self-report (EXST-15:
//   untrusted wire data stays off the durable transcript — previously only
//   unit-pinned), and (c) the progress text never leaks into the chat
//   transcript (EXST-1).
//
//   ABSENT: the same topology with a callee that never calls
//   `theta_progress` behaves identically Ok with the same zero-render /
//   zero-milestone / zero-leak reads — proving the PRESENT arm's negatives
//   are not artefacts of invoking a subagent child per se.
//
// RECORDED LIMITATION (D6): the parent tap's POSITIVE fold (wire line →
// bus class-2 payload → rendered ✎) no longer has a live end-to-end
// witness — its rendering surface is the TUI run card, which this
// print-composed harness never arms. The fold stays pinned offline:
// `child-tap` unit suites (wire parse → bus publish) and the card author-row
// cells (`execution-status-card-lines` / `execution-status-progress-tool`
// L3-B16).
//
// BUDGET: one small model turn per callee — well inside ≤4 tiny turns.
// SUBAGENT CHILD PINS: required — `invoke(...)` reaches the RFC-0006
// child-process launch; `./harness` sets both pins at module scope.
// NO SILENT SKIPPING: `requireLiveProvider` fails loudly.

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  failLoudly,
  plantThetaWorkspace,
  requireLiveProvider,
} from "./harness";
import { createRecordingUi } from "../helpers/execution-status-progress";

/** Settle margin for any (wrongly) still-pending status tick before the
 *  absence reads (DONE_LINGER_MS=2000 + STATUS_TICK_MS=200 margin per
 *  `execution-status/types.ts`). */
const ABSENCE_SETTLE_MS = 2500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** `theta-progress-entry` entries carrying a `milestone` payload (PIC-71). */
function milestoneEntries(entries: readonly unknown[]): readonly unknown[] {
  return entries.filter((entry) => {
    const e = entry as { type?: string; customType?: string; data?: unknown };
    return (
      e.type === "custom" &&
      e.customType === "theta-progress-entry" &&
      (e.data as { milestone?: unknown } | undefined)?.milestone !== undefined
    );
  });
}

/** Chat-role (user/assistant) texts containing `needle`. */
function chatLeaks(entries: readonly unknown[], needle: string): readonly string[] {
  const leaked: string[] = [];
  for (const entry of entries) {
    const e = entry as { type?: string; message?: { role?: string; content?: unknown } };
    if (e.type !== "message") continue;
    if (e.message?.role !== "user" && e.message?.role !== "assistant") continue;
    const content = e.message?.content;
    const texts: string[] =
      typeof content === "string"
        ? [content]
        : Array.isArray(content)
          ? (content as readonly unknown[])
              .map((p) => (p as { text?: string }).text)
              .filter((t): t is string => typeof t === "string")
          : [];
    for (const t of texts) {
      if (t.includes(needle)) leaked.push(t);
    }
  }
  return leaked;
}

const PRESENT_CALLEE_STEM = "l3wirepresentcallee";
const PRESENT_CALLEE = [
  "---",
  "mode: subagent",
  "tools:",
  "  - theta_progress",
  "---",
  'let _ = theta_progress({message: "child tick one"})?',
  "@`What is 5 plus 6? Answer with the number only.`?",
  'let _ = theta_progress({message: "child tick two"})?',
  "",
].join("\n");

const PRESENT_CALLER_STEM = "l3wirepresentcaller";
const PRESENT_CALLER = [
  "---",
  "mode: prompt",
  "---",
  `invoke("./${PRESENT_CALLEE_STEM}.theta")?`,
  "",
].join("\n");

const ABSENT_CALLEE_STEM = "l3wireabsentcallee";
const ABSENT_CALLEE = [
  "---",
  "mode: subagent",
  "---",
  "@`What is 5 plus 6? Answer with the number only.`?",
  "",
].join("\n");

const ABSENT_CALLER_STEM = "l3wireabsentcaller";
const ABSENT_CALLER = [
  "---",
  "mode: prompt",
  "---",
  `invoke("./${ABSENT_CALLEE_STEM}.theta")?`,
  "",
].join("\n");

describe("RFC 0010/0015 (H8a, live, L3/D6) — a real child's theta_progress wire: no retired-surface render, no milestone entry, no chat leak", () => {
  it("PRESENT: a child that calls theta_progress twice drives Ok with zero ctx.ui status renders, zero wire-sourced milestone entries, zero chat leakage", async () => {
    const provider = await requireLiveProvider();
    const workspace = plantThetaWorkspace([
      { source: "project", stem: PRESENT_CALLEE_STEM, text: PRESENT_CALLEE },
      { source: "project", stem: PRESENT_CALLER_STEM, text: PRESENT_CALLER },
    ]);
    const handle = await bootShippedExtension({ workspace, provider });
    const { calls, ui } = createRecordingUi();
    try {
      if (handle.command(PRESENT_CALLER_STEM) === undefined) {
        failLoudly(
          `no ${PRESENT_CALLER_STEM} command to invoke — the PRESENT caller failed ` +
            "discovery/parse. Registered: " + JSON.stringify(handle.registeredNames()),
        );
      }
      handle.runner.setUIContext(ui, "print");

      const turn = await driveSlashCaptureTurn(handle, `/${PRESENT_CALLER_STEM}`);

      const failureNotes = turn.systemNotes.filter((n) =>
        new RegExp(`^theta /${PRESENT_CALLER_STEM} (returned Err|cancelled|aborted)`).test(n),
      );
      expect(
        failureNotes,
        "the PRESENT wire drive surfaced fail-closed system note(s): " +
          JSON.stringify(failureNotes),
      ).toEqual([]);

      // Settle, then the three negatives over a drive whose child REALLY
      // emitted two wire lines (the callee errored out via `?` had either
      // theta_progress call failed, so the clean note channel above is the
      // positive control that both calls executed).
      await sleep(ABSENCE_SETTLE_MS);
      expect(
        calls,
        "a retired ctx.ui status surface rendered — the footer/widget sinks are " +
          "superseded by the run card (RFC 0015 decision 4). Calls: " +
          JSON.stringify(calls),
      ).toEqual([]);
      const entries = handle.sessionManager.getEntries() as readonly unknown[];
      expect(
        milestoneEntries(entries),
        "a wire-ingested child self-report was appended as a milestone entry — " +
          "EXST-15 keeps untrusted wire data off the durable transcript",
      ).toEqual([]);
      expect(
        chatLeaks(entries, "child tick"),
        "the child's progress text leaked into the chat transcript (EXST-1)",
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  }, 90_000);

  it("ABSENT: a child that never calls theta_progress behaves identically — Ok, zero renders, zero milestones", async () => {
    const provider = await requireLiveProvider();
    const workspace = plantThetaWorkspace([
      { source: "project", stem: ABSENT_CALLEE_STEM, text: ABSENT_CALLEE },
      { source: "project", stem: ABSENT_CALLER_STEM, text: ABSENT_CALLER },
    ]);
    const handle = await bootShippedExtension({ workspace, provider });
    const { calls, ui } = createRecordingUi();
    try {
      if (handle.command(ABSENT_CALLER_STEM) === undefined) {
        failLoudly(
          `no ${ABSENT_CALLER_STEM} command to invoke — the ABSENT caller failed ` +
            "discovery/parse. Registered: " + JSON.stringify(handle.registeredNames()),
        );
      }
      handle.runner.setUIContext(ui, "print");

      const turn = await driveSlashCaptureTurn(handle, `/${ABSENT_CALLER_STEM}`);

      const failureNotes = turn.systemNotes.filter((n) =>
        new RegExp(`^theta /${ABSENT_CALLER_STEM} (returned Err|cancelled|aborted)`).test(n),
      );
      expect(
        failureNotes,
        "the ABSENT wire drive surfaced fail-closed system note(s): " +
          JSON.stringify(failureNotes),
      ).toEqual([]);

      await sleep(ABSENCE_SETTLE_MS);
      expect(
        calls,
        "a retired ctx.ui status surface rendered during the ABSENT drive. Calls: " +
          JSON.stringify(calls),
      ).toEqual([]);
      expect(
        milestoneEntries(handle.sessionManager.getEntries() as readonly unknown[]),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  }, 90_000);
});
