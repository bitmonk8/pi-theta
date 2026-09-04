// Bug 0432 — the per-invocation clean-cancel note
// `theta/runtime/cancelled-by-session-shutdown` is emitted on the
// `theta-system-note` channel with its OUTER `CustomMessage.details` keyed on
// `event` (`{ event: { reason, theta, invocation_id } }`). That presents the
// partition's `event` key WITHOUT a `RuntimeEvent` (no `kind`/`message`/
// `occurred_at`), so a `runtime-event-channel.md`-conformant, key-switching
// consumer classifies the note as a group-A runtime event and validates it as
// nothing.
//
// Parent-adjudicated fix is option (b) (`.pi/tmp/fixes/0432-decision.md`):
// re-key the NOTE's outer details off `event` to `{ shutdown: { reason, theta,
// invocation_id } }`, fields unchanged one level down. The CONSOLE-row twin —
// the `Diagnostic` object emitted through the `EmissionSink`, which is
// `console.error`-only and EXCLUDED from the channel (bug 0432 §Non-goals) —
// STAYS `details.event` and must not move.
//
// Witness: drive the exported emitter directly (bug 0432 §Reproduction shape),
// offline and deterministic — no producer, no provider, no filesystem. The two
// artifacts `emitCancelledBySessionShutdownNote` produces are captured on
// separate surfaces so the fix's asymmetry (note re-keyed, console twin frozen)
// is observable:
//   - the NOTE via `sendSystemNote` → the capturing `SystemNoteChannelDeps`
//     (`src/extension/session-shutdown.ts:492`; outer details built at `:491`);
//   - the CONSOLE-row twin via `emitNestedShapeDiagnostic` → the capturing
//     `EmissionSink` (`src/extension/session-shutdown.ts:480`).
//
// Cells:
//   (1) NOTE partition-classifiability — THE red at the fork. The note's outer
//       details must carry the `shutdown` key and NOT `event`. At the fork the
//       builder nests `details.event` (`session-shutdown.ts:260-265`) and the
//       emitter reuses that object verbatim as the note's outer details
//       (`session-shutdown.ts:491`), so `shutdown` is absent — RED.
//   (2) matrix-row pairing — `display: false` paired with NON-EMPTY `content`,
//       the pairing the new shutdown row legitimises and the channel matrix's
//       only historical `display: false` row (which mandates `content: ""`)
//       forbids.
//   (3) CONSOLE-row twin CONTROL — the serialised `Diagnostic` must keep
//       `details.event`. GREEN at the fork and STAYS GREEN after the fix; a red
//       here after the fix means the fix wrongly touched the console twin.
//   (4) `ui.notify` never reached — the `display: false` note must never take
//       the toast arm; the capturing channel's `notify` throws as a tripwire.

import { describe, expect, it } from "vitest";
import {
  emitCancelledBySessionShutdownNote,
  CANCELLED_BY_SESSION_SHUTDOWN_CODE,
  type EmissionSink,
  type CancelledBySessionShutdownDeps,
} from "../src/extension/session-shutdown";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ActiveInvocationEntry } from "../src/runtime/active-invocation-registry";

/** Canonical lowercase 8-4-4-4-12 `invocationId`, carried verbatim into the
 *  payload's `invocation_id` (mirrors `tests/cancelled-by-session-shutdown-note.test.ts`). */
const INVOCATION_ID = "11111111-2222-3333-4444-555555555555";
const THETA_NAME = "demo";
const SHUTDOWN_REASON = "reload";

/** The `code-registry-runtime.md` message template for the per-invocation row —
 *  identical on the note's `content` and the console twin's `message`. */
const CLEAN_CANCEL_MESSAGE = `theta /${THETA_NAME} cancelled by session shutdown (${SHUTDOWN_REASON})`;

/** The `{reason, theta, invocation_id}` payload both artifacts carry one level
 *  down (unchanged by the fix; only the OUTER key on the note moves). */
const PAYLOAD = {
  reason: SHUTDOWN_REASON,
  theta: THETA_NAME,
  invocation_id: INVOCATION_ID,
};

/** One recorded `pi.sendMessage` envelope (the note's outer `CustomMessage`). */
interface RecordedMessage {
  readonly customType?: string;
  readonly content?: string;
  readonly display?: boolean;
  readonly details?: Record<string, unknown>;
}

/**
 * Only the three fields the emitter reads (`theta`, `invocationId`,
 * `shutdownReason`) are populated; the remaining registry members are
 * irrelevant to the note payload, so the entry is cast rather than fully built
 * (the emitter never touches `thetaAbort`/`disposeBarrier`).
 */
function entryForNote(): ActiveInvocationEntry {
  return {
    theta: THETA_NAME,
    invocationId: INVOCATION_ID,
    shutdownReason: SHUTDOWN_REASON,
  } as unknown as ActiveInvocationEntry;
}

interface Captured {
  readonly notes: RecordedMessage[];
  readonly emitted: string[];
}

/**
 * Drive `emitCancelledBySessionShutdownNote` over a capturing channel + sink.
 * The channel's `ui.notify` throws so a wrongly-toasted `display: false` note
 * surfaces loudly (cell 4); `emitDiagnostic` is a no-op — no `pi.sendMessage`
 * throw is staged, so the delivery-failed arm is unreachable on this path.
 */
function driveEmitter(): Captured {
  const notes: RecordedMessage[] = [];
  const emitted: string[] = [];
  const channel: SystemNoteChannelDeps = {
    pi: {
      sendMessage: (message): void => {
        notes.push(message);
      },
    },
    ui: {
      notify: (): void => {
        throw new Error(
          "the display:false clean-cancel note must never reach the toast (ui.notify) arm",
        );
      },
    },
    emitDiagnostic: (): void => {},
  };
  const sink: EmissionSink = {
    emit: (line: unknown): void => {
      emitted.push(String(line));
    },
    serialise: (diagnostic): string => JSON.stringify(diagnostic),
  };
  const deps: CancelledBySessionShutdownDeps = { channel, sink };
  emitCancelledBySessionShutdownNote(entryForNote(), deps);
  return { notes, emitted };
}

/** The exact captured outer `details` object, for a red that names the wire. */
function wireDetails(note: RecordedMessage): string {
  return JSON.stringify(note.details);
}

describe("bug 0432 — clean-cancel note outer details keyed on `shutdown`, not `event`", () => {
  it("(1) the note's outer CustomMessage.details carries the `shutdown` key and no `event` key", () => {
    const { notes } = driveEmitter();

    expect(
      notes.length,
      "harness precondition unmet: the emitter sent no theta-system-note",
    ).toBe(1);
    const note = notes[0] as RecordedMessage;

    expect(note.customType).toBe("theta-system-note");
    expect(note.display).toBe(false);
    expect(note.content).toBe(CLEAN_CANCEL_MESSAGE);
    expect(
      (note.content ?? "").length,
      "harness precondition unmet: the note content is empty",
    ).toBeGreaterThan(0);

    // The partition classifiability assertions (RED at the fork): the note must
    // present a `shutdown`-keyed outer payload, never the `event` key that
    // falsely selects the group-A RuntimeEvent arm while carrying no
    // RuntimeEvent. At the fork the outer details is `{ event: {...} }`
    // (`session-shutdown.ts:491-492` reuses `cancelledBySessionShutdownDiagnostic`'s
    // `details.event` object verbatim), so both assertions red.
    expect(
      "shutdown" in (note.details ?? {}),
      `note outer details missing the \`shutdown\` key (option (b) re-key). Observed details on the wire: ${wireDetails(note)} — the old event-keyed non-RuntimeEvent signature (\`event\` present, no \`kind\`/\`message\`/\`occurred_at\`).`,
    ).toBe(true);
    expect(
      "event" in (note.details ?? {}),
      `note outer details still carries the \`event\` key, selecting the group-A RuntimeEvent arm with no RuntimeEvent. Observed details on the wire: ${wireDetails(note)}.`,
    ).toBe(false);
    expect(
      note.details?.shutdown,
      `note \`details.shutdown\` payload mismatch. Observed details on the wire: ${wireDetails(note)}.`,
    ).toEqual(PAYLOAD);
  });

  it("(2) display:false pairs with NON-EMPTY content (the shutdown row's legitimised pairing)", () => {
    const { notes } = driveEmitter();

    expect(
      notes.length,
      "harness precondition unmet: the emitter sent no theta-system-note",
    ).toBe(1);
    const note = notes[0] as RecordedMessage;

    // The channel matrix's only historical `display: false` row mandates
    // `content: ""`; this note pairs `display: false` with a non-empty registry
    // Message, the pairing the new shutdown row legitimises.
    expect(note.display).toBe(false);
    expect((note.content ?? "").length).toBeGreaterThan(0);
    expect(note.content).toBe(CLEAN_CANCEL_MESSAGE);
  });

  it("(3) CONTROL — the console-row twin Diagnostic stays keyed on `details.event`", () => {
    const { emitted } = driveEmitter();

    expect(
      emitted.length,
      "harness precondition unmet: the emitter wrote no console-row Diagnostic on the sink",
    ).toBe(1);

    // The console-row twin is `console.error`-only, EXCLUDED from the channel
    // partition (bug 0432 §Non-goals) — it MUST keep `details.event`. GREEN at
    // the fork and STAYS GREEN after the fix; a red here after the fix means the
    // fix wrongly touched the console twin instead of only the note's outer key.
    expect(JSON.parse(emitted[0] as string)).toEqual({
      severity: "error",
      code: CANCELLED_BY_SESSION_SHUTDOWN_CODE,
      message: CLEAN_CANCEL_MESSAGE,
      details: { event: PAYLOAD },
    });
  });

  it("(4) the display:false note never reaches the toast (ui.notify) arm", () => {
    // The capturing channel's `ui.notify` throws; a clean `driveEmitter()`
    // therefore proves the toast arm was never taken for this `display: false`
    // note.
    expect(() => driveEmitter()).not.toThrow();
  });
});
