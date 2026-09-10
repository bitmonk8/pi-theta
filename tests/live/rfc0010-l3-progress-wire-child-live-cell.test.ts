// RFC 0010 (Phase 7d, H8a, live, L3) — the child-regime wire arm, both
// directions. Seam-sheet addendum rows L3-B33 (PRESENT) / L3-B34 (ABSENT).
// Contract: `.localpi/tmp/visibility-seam-sheet-l3.md` par. 3 (child-regime
// execute() branch), par. 5 (`child-tap.ts`'s `theta_progress` ingest
// branch), EXST-15, PIC-74.
//
// H9a OBSERVABLE ROUTE — INVESTIGATED AND REJECTED, WITH REASON:
//
// The addendum's H9a framing spawns an OUTER real `pi -p` process and asks
// whether ITS captured stdout can see a grandchild's `theta_progress` wire
// line. It cannot, by construction, and this is not a harness gap: PIC-74's
// no-relay clause (par. 5 of the addendum: "nothing here writes stdout; …
// the only stdout writer is the child-regime EXECUTE arm, never the tap")
// means the wire line is written to the INNER (grandchild) process's OWN fd
// 1, consumed inside the OUTER process's own extension instance by
// `attachChildActivityTap`'s in-process line-pump listener
// (`production-subagent-host.ts`'s `makeLinePump` fan-out) — never
// re-emitted onto the OUTER process's stdout. `tests/live/acceptance/
// harness.ts`'s `spawnPiPrint` captures only the OUTER `pi -p` process's own
// `child.stdout` (`node:child_process` pipe), which is a sibling stream to
// the grandchild's — nothing forwards the grandchild's bytes across that
// boundary. So no H9a spawn, however instrumented, can observe the wire line
// as a raw stdout string; the addendum's own par. 8 "F-questions" section (a
// prior phase) already establishes that the wire is parent-tap-internal.
//
// ROUTE CHOSEN — the addendum's sanctioned alternative: an H8a-style cell
// using the REAL spawned child through the production subagent-launch path
// (`invoke("./child.theta")` against a `mode: subagent` callee, exactly as
// `execution-status-parfor-ui-live-cell.test.ts` reaches a real child),
// asserting the PARENT TAP'S OWN observables — the bus fold's rendered ✎
// segment on the injected UI double (footer/widget), which is the same
// production surface `child-tap.ts`'s ingest branch (par. 5 of the addendum)
// feeds. This is strictly the parent-side effect the wire exists to produce,
// through the SAME public `ExtensionRunner.setUIContext` seam
// `execution-status-parfor-ui-live-cell.test.ts` uses, and requires the
// #subagent-child-pins this file's `./harness` import already sets at module
// scope (the `invoke(...)` reaches the RFC-0006 child-process launch).
//
// PRESENT (L3-B33 analogue): the subagent callee calls `theta_progress`
// twice, separated by a real model turn (natural real-wall-clock gap, well
// over the 200ms EXST-14 acceptance interval — no theta-language sleep
// primitive is needed). Assert: the NEWEST message's ✎ segment
// (`✎ child tick two`) renders on the UI double, and the drive is Ok.
//
// ABSENT (L3-B34 analogue): the same topology, but the callee never calls
// `theta_progress` at all. Assert: ZERO ✎ segments across every recorded
// render for the WHOLE drive, and the drive is identically Ok — proving the
// render only exists when the wire fires, not as an artefact of invoking a
// subagent child per se.
//
// BUDGET: one small model turn per callee (the fixed-pair arithmetic query
// that separates the two `theta_progress` calls in the PRESENT callee; a
// single arithmetic query in the ABSENT callee) — well inside ≤4 tiny turns.
//
// SCOPE NOTE: this file witnesses the PARENT's OWN ingestion of the wire
// (child-tap.ts's `theta_progress` branch folding into the bus and rendering
// on the parent's UI double) — it does NOT witness the raw wire bytes on any
// process's captured stdout. That is `tests/live/acceptance/
// rfc0010-l3-wire-json-mode.test.ts`'s job (H9a): it marks the SPAWNED `pi -p`
// process itself as the subagent child (no grandchild, no relay problem) and
// scores its OWN captured stdout for schema-valid `theta_progress` lines. The
// two files are complementary, not duplicates: this one proves the parent's
// rendered effect; that one proves the wire's on-the-wire shape.
//
// RED-DIRECTION PROOF (verified this pass, then restored): temporarily
// mis-spelled the PRESENT arm's render-poll needle (`"child tick two"` ->
// `"WRONG NEEDLE child tick two"`). Re-ran: PRESENT reds with `expected false
// to be true`, and the failure's OWN dumped `calls` array shows the real
// `✎ child tick two` segment DID land on the UI double
// (`{"kind":"setStatus","text":"θ /l3wirepresentcaller done · ✎ child tick
// two"}`) — the scan just stopped matching it under the wrong needle.
// Restored, green again. This proves the PRESENT assertion is live.

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  failLoudly,
  plantThetaWorkspace,
  requireLiveProvider,
} from "./harness";
import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";

interface RecordedCall {
  readonly kind: "setStatus" | "setWidget";
  readonly text: string | undefined;
  readonly lines: readonly string[] | undefined;
}

function createRecordingUi(): { readonly calls: RecordedCall[]; readonly ui: ExtensionUIContext } {
  const calls: RecordedCall[] = [];
  const ui = {
    select: async () => undefined,
    confirm: async () => false,
    input: async () => undefined,
    notify: () => {},
    onTerminalInput: () => () => {},
    setStatus: (_key: string, text: string | undefined) => {
      calls.push({ kind: "setStatus", text, lines: undefined });
    },
    setWorkingMessage: () => {},
    setWorkingVisible: () => {},
    setWorkingIndicator: () => {},
    setHiddenThinkingLabel: () => {},
    setWidget: (_key: string, content: unknown, _options?: unknown) => {
      calls.push({
        kind: "setWidget",
        text: undefined,
        lines: Array.isArray(content) ? (content as readonly string[]) : undefined,
      });
    },
    setFooter: () => {},
    setHeader: () => {},
    setTitle: () => {},
    custom: async <T>() => undefined as unknown as T,
    pasteToEditor: () => {},
    setEditorText: () => {},
    getEditorText: () => "",
    editor: async () => undefined,
    addAutocompleteProvider: () => {},
    setEditorComponent: () => {},
    getEditorComponent: () => undefined,
    theme: {} as ExtensionUIContext["theme"],
    getAllThemes: () => [],
    getTheme: () => undefined,
    setTheme: () => ({ success: true }),
    getToolsExpanded: () => false,
    setToolsExpanded: () => {},
  } as unknown as ExtensionUIContext;
  return { calls, ui };
}

const AUTHOR_MESSAGE_GLYPH = "\u270E";

function anyCallCarries(calls: readonly RecordedCall[], needle: string): boolean {
  const fragment = `${AUTHOR_MESSAGE_GLYPH} ${needle}`;
  return calls.some(
    (c) =>
      (typeof c.text === "string" && c.text.includes(fragment)) ||
      (c.lines !== undefined && c.lines.some((l) => l.includes(fragment))),
  );
}

/** Whether ANY recorded call carries the glyph at all (the absence-direction
 *  scan — zero hits, not merely zero hits for one particular message). */
function anyCallCarriesGlyph(calls: readonly RecordedCall[]): boolean {
  return calls.some(
    (c) =>
      (typeof c.text === "string" && c.text.includes(AUTHOR_MESSAGE_GLYPH)) ||
      (c.lines !== undefined && c.lines.some((l) => l.includes(AUTHOR_MESSAGE_GLYPH))),
  );
}

const RENDER_POLL_BOUND = 30;
const RENDER_POLL_INTERVAL_MS = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll bound for the completion settle (mirrors the parfor-ui cell's
 *  DONE_LINGER_MS + STATUS_TICK_MS margin) used by the ABSENT direction to
 *  give the render pipeline every chance to (wrongly) show a ✎ segment
 *  before declaring victory on its absence. */
const SETTLE_POLL_BOUND = 40;
const SETTLE_POLL_INTERVAL_MS = 100;

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

describe("RFC 0010 (H8a, live, L3) — PARENT-TAP INGESTION of the theta_progress wire through a real spawned child (complementary to, not a substitute for, the H9a wire-surface gate)", () => {
  it("PRESENT: a child that calls theta_progress twice lands its newest ✎ segment on the parent's UI double, drive Ok", async () => {
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

      let rendered = false;
      for (let attempt = 0; attempt < RENDER_POLL_BOUND; attempt++) {
        if (anyCallCarries(calls, "child tick two")) {
          rendered = true;
          break;
        }
        await sleep(RENDER_POLL_INTERVAL_MS);
      }
      expect(
        rendered,
        "no setStatus/setWidget render carried the child's newest `✎ child tick two` " +
          "segment via the parent tap. Calls: " + JSON.stringify(calls),
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  }, 90_000);

  it("ABSENT: a child that never calls theta_progress renders zero ✎ segments anywhere in the drive, drive Ok", async () => {
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

      // Give the render pipeline the SAME settle budget the PRESENT direction
      // gets to prove the wire fired, before declaring the negative.
      for (let attempt = 0; attempt < SETTLE_POLL_BOUND; attempt++) {
        if (anyCallCarriesGlyph(calls)) break;
        await sleep(SETTLE_POLL_INTERVAL_MS);
      }

      expect(
        anyCallCarriesGlyph(calls),
        "a ✎ segment rendered despite the child never calling theta_progress — the " +
          "wire (or the parent tap) fired with no source call. Calls: " +
          JSON.stringify(calls),
      ).toBe(false);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  }, 90_000);
});
