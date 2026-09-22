// RFC 0015 (D6, live) — decision-4 supersession over the RFC 0010 L0 cell:
// a REAL live drive of a `par for` theta renders NOTHING on the retired
// `ctx.ui` status surfaces (`setStatus` / `setWorkingMessage` / the
// string-array `setWidget` status tree), witnessed via the same INJECTED UI
// double this cell used pre-D6 to witness the footer/widget lane rendering —
// the run card (a custom transcript entry, TUI-only) superseded both sinks,
// and non-TUI compositions run a sink-less bus.
//
// HISTORY: this file was born as the RFC 0010 L0 layer-gate (footer/widget
// lane evidence through the injected UI double). Decision 4 retired that
// surface, so the cell now pins the ABSENCE direction with the SAME topology
// and the SAME injection seam: a pre-D6 build (or a regression recomposing
// the sinks) reds instantly on the zero-calls assertions below, because this
// very double used to record `lanes N▶` footer lines and `par for N/3`
// widget trees during this exact drive. The positive lane-rendering grammar
// lives on in the run card's unit suites (`execution-status-card-lines`
// badges/lanes cells); the composition-level TUI witness is
// `tests/execution-status-supersession.test.ts`.
//
// INJECTION POINT (unchanged): `ExtensionRunner.setUIContext(uiContext,
// mode)` (`session.extensionRunner`, exposed by the harness as
// `handle.runner`) — the public, real, non-`src/**` seam a genuine host uses
// to attach ITS UI, called BEFORE the drive.
//
// FIXTURE TOPOLOGY (unchanged): `parforuicaller.theta` (`mode: prompt`) runs
// ONE `par for` over `[1, 2, 3]` with `max 2` (CTRL-2 width throttle), each
// iteration `invoke`-ing `parforuilane.theta` (`mode: subagent`) — CTRL-4
// forbids an `@`-query directly inside a `par for` body, so each lane's one
// small model turn lives in its own subagent callee. Each lane's query
// varies by its own loop-bound `n` (`100+n plus 1`) — a task-framed,
// fixed-pair-arithmetic discriminator per AGENTS.md, proving each lane
// reached a REAL, distinct model turn.
//
// TOKEN BUDGET: exactly 3 small model turns (one per lane; `max 2` bounds
// concurrency to 2 in flight).
//
// SUBAGENT CHILD PINS: required — `invoke(...)` against the `mode: subagent`
// callee reaches the RFC-0006 child-process launch. `./harness` sets both
// #subagent-child-pins at module scope, inherited by importing it.
//
// NO SILENT SKIPPING: a missing live provider/model fails loudly through
// `requireLiveProvider` (`failLoudly`); nothing here early-returns or skips.

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  failLoudly,
  plantThetaWorkspace,
  requireLiveProvider,
} from "./harness";
import { createRecordingUi } from "../helpers/execution-status-progress";

/** The subagent-mode lane callee: one tiny, lane-distinguishing model turn. */
const LANE_CALLEE = [
  "---",
  "mode: subagent",
  "params:",
  "  n: integer",
  "---",
  "@`What is ${100 + n} plus 1? Answer with the number only.`",
  "",
].join("\n");

/** The `par for` caller: no top-level `@`-query of its own (CTRL-4 forbids one
 *  inside the body; the caller issues none outside it either, so
 *  `session.prompt()` awaits the whole synchronous `par for` to completion). */
const PARFOR_CALLER = [
  "---",
  "mode: prompt",
  "---",
  'par for n in [1, 2, 3] max 2 { invoke("./parforuilane.theta", n) }',
  "",
].join("\n");

const CALLER_STEM = "parforuicaller";

describe("RFC 0015 (D6, live) — a real `par for` drive renders NOTHING on the retired ctx.ui status surfaces", () => {
  it("zero setStatus/setWorkingMessage/setWidget status renders across the whole drive, drive Ok, clean note channel, no chat-side progress leakage", async () => {
    const provider = await requireLiveProvider();

    const workspace = plantThetaWorkspace([
      { source: "project", stem: "parforuilane", text: LANE_CALLEE },
      { source: "project", stem: CALLER_STEM, text: PARFOR_CALLER },
    ]);

    const handle = await bootShippedExtension({ workspace, provider });
    const { calls, ui } = createRecordingUi({ recordWorkingMessage: true, now: Date.now });
    try {
      if (handle.command(CALLER_STEM) === undefined) {
        failLoudly(
          `no ${CALLER_STEM} command to invoke — the \`par for\` caller failed ` +
            "discovery/parse. Registered: " + JSON.stringify(handle.registeredNames()),
        );
      }

      // Attach the recording UI double BEFORE driving — the same public seam
      // a real host uses to attach its own TUI/RPC/print UI implementation,
      // and the exact double the pre-D6 footer/widget sinks rendered into.
      handle.runner.setUIContext(ui, "print");

      const turn = await driveSlashCaptureTurn(handle, `/${CALLER_STEM}`);

      // (1) The drive returned Ok — no fail-closed ending landed on the
      // theta-system-note channel (AGENTS.md: absence IS the success
      // observable). This is the positive control proving the zero-render
      // reads below measure a REAL completed 3-lane drive, not a dispatch
      // that never ran.
      const failureNotes = turn.systemNotes.filter((n) =>
        new RegExp(`^theta /${CALLER_STEM} (returned Err|cancelled|aborted)`).test(n),
      );
      expect(
        failureNotes,
        "the par-for drive surfaced fail-closed system note(s) instead of completing: " +
          JSON.stringify(failureNotes),
      ).toEqual([]);

      // (2) Decision 4: ZERO status renders on the retired surfaces, across
      // the WHOLE drive. Pre-D6 this exact double recorded `lanes N▶` footer
      // lines and `par for N/3` widget trees here.
      expect(
        calls,
        "a retired ctx.ui status surface rendered during the drive — the footer/widget " +
          "sinks are superseded by the run card (RFC 0015 decision 4). Calls: " +
          JSON.stringify(calls),
      ).toEqual([]);

      // (3) Zero `pi.sendMessage`-class progress traffic: no chat-role
      // (user/assistant) transcript entry carries an execution-status
      // fragment — EXST-1 is untouched by the supersession.
      const entries = handle.sessionManager.getEntries() as readonly unknown[];
      const chatTextsWithProgressLeakage: string[] = [];
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
          if (t.includes("par for") || t.includes(`θ /${CALLER_STEM}`)) {
            chatTextsWithProgressLeakage.push(t);
          }
        }
      }
      expect(
        chatTextsWithProgressLeakage,
        "an execution-status fragment leaked into the chat transcript instead of riding " +
          "the entry channel: " + JSON.stringify(chatTextsWithProgressLeakage),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  }, 60_000);
});
