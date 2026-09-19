// Recording system-note channel double and settled-entry readers shared by tests.

import { vi } from "vitest";
import type { Diagnostic } from "../../src/diagnostics/diagnostic";
import type {
  RendererGate,
  SystemNoteChannelDeps,
  SystemNoteChannelHealth,
  SystemNoteDetails,
  SystemNoteSender,
  UiNotifier,
} from "../../src/extension/system-note-channel";

export interface SentNote {
  readonly customType: string;
  readonly content: string;
  readonly display: boolean;
  readonly details?: SystemNoteDetails;
  readonly options: { readonly triggerTurn: false };
}

/** A captured `pi.sendMessage` call for the `theta-system-note` channel. */
type SentMessage = Omit<SentNote, "options">;

/**
 * Build a `SystemNoteChannelDeps` whose `pi.sendMessage` succeeds and records
 * every sent message, so the primary-sink assertions observe the persistent
 * `theta-system-note` route and can prove `ctx.ui.notify` is never reached.
 */
export function channelHarness(): {
  readonly channel: SystemNoteChannelDeps;
  readonly sent: SentMessage[];
  readonly notify: ReturnType<typeof vi.fn>;
  readonly emitDiagnostic: ReturnType<typeof vi.fn>;
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
  return { channel: { pi, ui, emitDiagnostic }, sent, notify, emitDiagnostic };
}

export interface ChannelFixture {
  readonly deps: SystemNoteChannelDeps;
  readonly sent: SentNote[];
  readonly notified: Array<readonly [string, string]>;
  readonly emitted: Diagnostic[];
}

/** Record channel deliveries and fallback attempts, with optional failure injection. */
export function makeRecordingChannel(opts?: {
  readonly sendThrows?: unknown;
  readonly notifyThrows?: unknown;
  readonly emitThrows?: unknown;
  readonly health?: SystemNoteChannelHealth;
  readonly rendererGate?: RendererGate;
}): ChannelFixture {
  const sent: SentNote[] = [];
  const notified: Array<readonly [string, string]> = [];
  const emitted: Diagnostic[] = [];

  const pi: SystemNoteSender = {
    sendMessage: (message, options): void => {
      if (opts?.sendThrows !== undefined) {
        throw opts.sendThrows;
      }
      sent.push({ ...message, options });
    },
  };
  const deps: SystemNoteChannelDeps = {
    pi,
    ui: {
      notify: (message: string, type: "error"): void => {
        notified.push([message, type]);
        if (opts?.notifyThrows !== undefined) {
          throw opts.notifyThrows;
        }
      },
    },
    emitDiagnostic: (diagnostic: Diagnostic): void => {
      emitted.push(diagnostic);
      if (opts?.emitThrows !== undefined) {
        throw opts.emitThrows;
      }
    },
    ...(opts?.rendererGate !== undefined ? { rendererGate: opts.rendererGate } : {}),
    ...(opts?.health !== undefined ? { health: opts.health } : {}),
  };
  return { deps, sent, notified, emitted };
}

/** One settled note, including empty content and its unmodified structured payload. */
export interface SystemNoteEntry {
  readonly contents: readonly string[];
  readonly details: unknown;
}

/**
 * Read settled system-note and progress entries, retaining text-part boundaries
 * and structured details. Keep entries with no text for per-note comparisons.
 */
export function collectSystemNoteEntries(entries: readonly unknown[]): readonly SystemNoteEntry[] {
  const notes: SystemNoteEntry[] = [];
  for (const entry of entries) {
    const e = entry as {
      customType?: string;
      content?: unknown;
      details?: unknown;
      data?: unknown;
    };
    if (e.customType === "theta-system-note") {
      const contents: string[] = [];
      if (typeof e.content === "string") contents.push(e.content);
      else if (Array.isArray(e.content)) {
        for (const part of e.content) {
          const t = (part as { text?: string }).text;
          if (typeof t === "string") contents.push(t);
        }
      }
      notes.push({ contents, details: e.details });
    } else if (e.customType === "theta-progress-entry") {
      // PIC-72 (runtime-event-channel.md): the three migrated operator-note
      // classes (parse/load/type diagnostic BATCH, structural-change,
      // binder-model recovery) deliver through the `theta-progress-entry`
      // custom-entry channel instead of `theta-system-note` whenever both
      // entry members are present (entry-channel.ts). The entry's `data`
      // carries the SAME `SystemNote` shape the message channel used to
      // carry (PIC-71: byte-identical rendered content), so extracting its
      // `content` keeps every existing substring assertion working
      // unchanged — a channel-union repair, not a weakening.
      const data = e.data as { content?: unknown; details?: unknown } | undefined;
      notes.push({
        contents: typeof data?.content === "string" ? [data.content] : [],
        details: data?.details,
      });
    }
  }
  return notes;
}

/** Extract content strings in transcript order, keeping each text part separate. */
export function collectSystemNotes(entries: readonly unknown[]): readonly string[] {
  return collectSystemNoteEntries(entries).flatMap((note) => note.contents);
}
