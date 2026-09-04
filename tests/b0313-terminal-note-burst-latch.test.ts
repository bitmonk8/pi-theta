import { describe, expect, it, vi } from "vitest";
import { armWatcherWithTerminalRecovery } from "../src/extension/watcher-recovery";
import { ThetaRegistry } from "../src/extension/reload-wiring";
import {
  SYSTEM_NOTE_CHANNEL,
  type SystemNoteChannelDeps,
  type SystemNoteDetails,
  type SystemNoteSender,
  type UiNotifier,
} from "../src/extension/system-note-channel";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { FileWatchEvent, WatchTermination } from "../src/seams/file-watcher";
import { FakeFileWatcher } from "./helpers/fake-file-watcher";

// Witness suite for bug 0313 (fixed 0.316.0): the terminal `watcher-terminated`
// note carries no once-latch, so a synchronous error burst emits more than one
// persistent note; and the `FakeFileWatcher` cleared its terminal callback on
// unsubscribe (stronger than production), hiding the burst from the committed
// terminal-arm tests.
//
// Spec: pi-integration-contract/registration-steps.md (PIC-55) — the terminal
// case "MUST emit a single persistent `theta-system-note`".
//
// Unit tests: `npm test`, offline, deterministic. The burst is driven through
// the V8e `FakeFileWatcher.terminate()` injection point (mirrors the production
// chokidar adapter→runtime channel). The fake now keeps `onTerminate` attached
// across unsubscribe (bug 0313 constraint 4), so a second same-tick
// `terminate()` after the recovery's `unsub()` still reaches the arm — a
// minimal conforming `FileWatcher` seam (PIC-14) whose unsubscribe does not
// synchronously sever the terminal channel, exercised so the recovery layer's
// once-latch (constraint 2) is testable regardless of what the shipped
// `PiFileWatcher` adapter itself guarantees. All injection points are
// synchronous; no timers, sleeps, or awaited waits.

/** A captured `pi.sendMessage` call for the `theta-system-note` channel. */
interface SentMessage {
  readonly customType: string;
  readonly content: string;
  readonly display: boolean;
  readonly details?: SystemNoteDetails;
}

/**
 * A `SystemNoteChannelDeps` whose `pi.sendMessage` records every sent message,
 * so the single-note assertion can count the persistent `theta-system-note`
 * route and prove `ctx.ui.notify` is never reached.
 */
function channelHarness(): {
  readonly channel: SystemNoteChannelDeps;
  readonly sent: SentMessage[];
  readonly notify: ReturnType<typeof vi.fn>;
} {
  const sent: SentMessage[] = [];
  const pi: SystemNoteSender = {
    sendMessage(message, _options): void {
      sent.push({ ...message });
    },
  };
  const notify = vi.fn<UiNotifier["notify"]>();
  const ui: UiNotifier = { notify };
  const emitDiagnostic = vi.fn<(d: Diagnostic) => void>();
  return { channel: { pi, ui, emitDiagnostic }, sent, notify };
}

// ---------------------------------------------------------------------------
// (C) burst: a synchronous terminal-signal burst emits exactly one note.
// ---------------------------------------------------------------------------

describe("b0313 (C) — a synchronous terminal-signal burst emits exactly one persistent note", () => {
  it("two same-tick terminate() calls through armWatcherWithTerminalRecovery emit ONE watcher-terminated note and do not throw (bug 0313, fixed 0.316.0)", () => {
    const { channel, sent, notify } = channelHarness();
    const fw = new FakeFileWatcher();

    armWatcherWithTerminalRecovery({
      watcher: fw,
      roots: ["/root"],
      onChange: () => {},
      registry: new ThetaRegistry(),
      channel,
    });

    // chokidar invokes its error listener synchronously once per failing path
    // (bug 0313 §Reproduction). The weakened fake keeps `onTerminate` attached
    // across the recovery's first `unsub()`, so the second same-tick signal
    // still reaches the arm — a same-tick terminal burst observable at the
    // recovery layer, testing its once-latch (constraint 2) independent of the
    // shipped adapter's own active-guard. Exactly one persistent note must
    // survive the burst, and the burst must not throw.
    expect(() => {
      fw.terminate({ roots: ["/root"] });
      fw.terminate({ roots: ["/root"] });
    }).not.toThrow();

    expect(sent).toHaveLength(1);
    expect(sent[0]?.customType).toBe(SYSTEM_NOTE_CHANNEL);
    expect(notify).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// (E) FakeFileWatcher parity: post-unsub terminal window matches production.
// ---------------------------------------------------------------------------

describe("b0313 (E) — FakeFileWatcher post-unsubscribe terminal-delivery window parity", () => {
  it("the fake keeps onTerminate attached across unsubscribe, so a post-unsub terminate() still reaches it (bug 0313 constraint 4, fixed 0.316.0)", () => {
    // The fake-side of the window that makes cell (C)'s burst double-note
    // observable at the recovery layer: unsubscribe severs the change-delivery
    // contract but leaves the terminal channel live — a minimal conforming
    // `FileWatcher` seam (PIC-14), not the shipped `PiFileWatcher`, whose
    // active-guard swallows post-unsub callbacks (adapter suite cell (D)).
    const fw = new FakeFileWatcher();
    const terminations: WatchTermination[] = [];
    const unsub = fw.watch(["/root"], () => {}, (t) => terminations.push(t));

    unsub();
    fw.terminate({ roots: ["/root"] });

    expect(terminations).toEqual([{ roots: ["/root"] }]);
  });

  it("unsubscribe still severs the steady-state change-delivery contract — only the terminal channel survives (bug 0313, fixed 0.316.0)", () => {
    const fw = new FakeFileWatcher();
    const changes: FileWatchEvent[] = [];
    const unsub = fw.watch(["/root"], (event) => changes.push(event));

    unsub();
    fw.emit({ kind: "change", path: "/root/x.theta" });

    expect(changes).toEqual([]);
  });
});
