import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GOOD_THETA, BAD_THETA, makeShippedHarness as makeHarness, plantThetaWorkspace, disposeWorkspace, type RecordedNote } from "./helpers/production-load-harness";

// V4e (production wiring) — load-phase pre-evaluation failure note-routing.
//
// Mirrors the wired RELOAD-path note tests in
// tests/watcher-hot-reload-integration.test.ts, but for the LOAD phase: boots
// the SHIPPED composition (`composeExtensionInstance`) through the real
// extension factory (`createThetaExtension`) over a real temp-dir workspace and
// asserts that a load-phase FAILURE surfaces one `theta-system-note` on the
// channel with `triggerTurn:false` (the ERR-1…ERR-6/ERR-16 pre-eval surface),
// while a clean load emits NO error note and `session_start` is never aborted.
//
// Spec: errors-and-results/error-model.md — every pre-evaluation failure
// "surfaces per Diagnostics on the theta-system-note channel, does not fire a
// new turn (triggerTurn:false) and produces no final value". Previously the
// shipped LOAD path surfaced load errors via a transient `ctx.ui.notify` toast
// (notes.md "known load-phase routing gap"), inconsistent with the RELOAD path.

/** The error-severity load-phase notes routed onto the channel this pass. */
function loadErrorNotes(notes: readonly RecordedNote[]): RecordedNote[] {
  return notes.filter((n) =>
    (n.details!.diagnostics ?? []).some((d) => d.severity === "error"),
  );
}

describe("V4e — load-phase pre-evaluation failures route onto the theta-system-note channel", () => {
  let workspace: string;
  let thetaDir: string;

  beforeEach(() => {
    workspace = plantThetaWorkspace("theta-v4e-load-", []);
    thetaDir = join(workspace, ".pi", "theta");
  });

  afterEach(() => {
    disposeWorkspace(workspace);
  });

  it("a load failure surfaces one theta-system-note (triggerTurn:false) and does not abort session_start", async () => {
    // A clean control theta AND a failing theta, so the assertion distinguishes
    // "routes the failure" from "drops everything".
    writeFileSync(join(thetaDir, "goodtool.theta"), GOOD_THETA, "utf8");
    writeFileSync(join(thetaDir, "unknowntool.theta"), BAD_THETA, "utf8");

    const harness = makeHarness(workspace);
    await harness.fireSessionStart();

    // session_start not aborted: the clean theta still registered.
    expect(harness.commands.has("goodtool")).toBe(true);
    // The failing theta was dropped (un-registered).
    expect(harness.commands.has("unknowntool")).toBe(false);

    // The load failure routed onto the `theta-system-note` channel with the
    // error-severity `theta/load/unknown-tool` diagnostic and triggerTurn:false —
    // the SAME envelope shape as the reload path's ERR-7 note.
    const errorNotes = loadErrorNotes(harness.notes);
    expect(errorNotes).toHaveLength(1);
    const note = errorNotes.find((n) =>
      (n.details!.diagnostics ?? []).some(
        (d) => d.code === "theta/load/unknown-tool",
      ),
    );
    expect(note).toBeDefined();
    expect(note?.customType).toBe("theta-system-note");
    expect(note?.triggerTurn).toBe(false);

    // The failure routed onto the channel, NOT the transient toast (the closed
    // load-phase routing gap): no error reached `ctx.ui.notify`.
    expect(harness.notifications).toHaveLength(0);
  });

  it("a clean load emits no error note on the theta-system-note channel", async () => {
    writeFileSync(join(thetaDir, "goodtool.theta"), GOOD_THETA, "utf8");

    const harness = makeHarness(workspace);
    await harness.fireSessionStart();

    expect(harness.commands.has("goodtool")).toBe(true);
    // Negative: a clean load produces no error-severity pre-eval note.
    expect(loadErrorNotes(harness.notes)).toHaveLength(0);
    expect(harness.notifications).toHaveLength(0);
  });
});
