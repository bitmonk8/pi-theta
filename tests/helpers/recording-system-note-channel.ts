// Recording system-note channel double shared by delivery and runtime-event tests.

import type { Diagnostic } from "../../src/diagnostics/diagnostic";
import type {
  RendererGate,
  SystemNoteChannelDeps,
  SystemNoteChannelHealth,
  SystemNoteDetails,
  SystemNoteSender,
} from "../../src/extension/system-note-channel";

export interface SentNote {
  readonly customType: string;
  readonly content: string;
  readonly display: boolean;
  readonly details?: SystemNoteDetails;
  readonly options: { readonly triggerTurn: false };
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
