// Bug 0454 — under a degraded `RendererGate` the System-notes channel silently
// drops every `display: false` note in its entirety: no `pi.sendMessage`
// transcript send, no `ctx.ui.notify` toast, no delivery-failed diagnostic, no
// stderr. The degraded branch's rationale ("delivering to the transcript would
// render nothing", system-note-channel.ts:299) is VACUOUS for a `display: false`
// note — such a note is never rendered (runtime-event-channel.md:14), so its
// transcript delivery does not involve the renderer at any point; its whole
// value is the structured payload (`/tree`, replay, `convertToLlm` context).
// The degrade skip therefore discards a delivery that `pi.sendMessage` — which
// is fully functional in the degraded state, only `registerMessageRenderer`
// threw — would have carried at full fidelity. At HEAD this bites the
// clean-cancel note (session-shutdown-semantics.md:19, the only production
// `display: false` note): every in-flight invocation cancelled at `/reload`,
// session swap, or quit on a renderer-degraded instance loses its
// spec-mandated shutdown record silently.
//
// SETTLED FIX (parent-adjudicated Option 1, "display gate"): the DEGRADED
// branch (`if (deps.rendererGate?.available() === false) { ... }`,
// system-note-channel.ts:312) carves out `display: false` notes — they are
// delivered through the normal `pi.sendMessage` transcript arm (they never
// needed the renderer); `display: true` notes keep the toast-only degrade.
// This file WITNESSES that fix; it does not implement it.
//
// Cells:
//   Cell 1 (RED-now → green after fix): a `display: false` clean-cancel note
//     under the degraded gate must be SENT via `pi.sendMessage` with its
//     `details.shutdown.*` payload intact. At the fork the degraded branch
//     returns having touched nothing (sends: [], notifies: [], diags: []) —
//     the red anchor is the EMPTY `sends` array, the doc's exact symptom.
//   Cell 2 (GREEN-control, green both directions): a `display: true` note under
//     the SAME degraded gate still takes the toast arm (`ui.notify`) and does
//     NOT send — locking that the carve-out does not disturb the display:true
//     toast-only degrade (system-note-channel.ts:313).
//
// TIER: unit — offline, provider-free, deterministic. `sendSystemNote` is a
// pure function over an injected `SystemNoteChannelDeps`; the degraded branch
// at system-note-channel.ts:312 is reachable by a direct call with a degraded
// `RendererGate` and recording sinks — no dispatch drive, no provider, no
// filesystem. An integration/live tier would re-drive the full slash/shutdown
// path to reach the same branch and witness nothing further about the drop.

import { describe, expect, it } from "vitest";

import {
  RendererGate,
  SystemNoteChannelHealth,
  sendSystemNote,
  SYSTEM_NOTE_CHANNEL,
  type SystemNoteChannelDeps,
} from "../src/extension/system-note-channel";
import type { Diagnostic } from "../src/diagnostics/diagnostic";

// The wire message a recording `pi.sendMessage` captured. `details` is optional
// so `"details" in note` and the nested `shutdown` fields can be asserted for
// the clean-cancel payload the fix must preserve byte-for-byte.
interface CapturedNote {
  readonly customType: string;
  readonly content: string;
  readonly display?: boolean;
  readonly details?: { readonly shutdown?: Record<string, unknown> };
}

interface NotifyCall {
  readonly message: string;
  readonly type: "error";
}

interface DegradedRecording {
  readonly deps: SystemNoteChannelDeps;
  readonly sends: CapturedNote[];
  readonly notifies: NotifyCall[];
  readonly diags: Diagnostic[];
}

/**
 * A channel whose `RendererGate` is DEGRADED (`gate.degrade()`) — modelling a
 * factory-time `pi.registerMessageRenderer` throw — but whose `pi.sendMessage`
 * is fully functional and RECORDING, mirroring the degraded state's real seam
 * health (only `registerMessageRenderer` failed). `ui.notify` and
 * `emitDiagnostic` record too, so every surface the degraded branch could touch
 * is observable. A fresh `SystemNoteChannelHealth` proves the drop is not a
 * stale-dead latch (that branch is never reached — the note vanishes in the
 * degrade skip). This is Probe P3's shape from the bug doc's §Reproduction.
 */
function degradedRecordingChannel(): DegradedRecording {
  const gate = new RendererGate();
  gate.degrade();
  const sends: CapturedNote[] = [];
  const notifies: NotifyCall[] = [];
  const diags: Diagnostic[] = [];
  const deps: SystemNoteChannelDeps = {
    pi: {
      sendMessage: (message): void => {
        sends.push(message as CapturedNote);
      },
    },
    ui: {
      notify: (message: string, type: "error"): void => {
        notifies.push({ message, type });
      },
    },
    emitDiagnostic: (diagnostic: Diagnostic): void => {
      diags.push(diagnostic);
    },
    rendererGate: gate,
    health: new SystemNoteChannelHealth(),
  };
  return { deps, sends, notifies, diags };
}

// The clean-cancel note bytes (session-shutdown.ts:465-498; display:false at
// :497). A fixed invocation id witnesses that the structured payload survives
// the degraded delivery byte-exact.
const CLEAN_CANCEL_CONTENT =
  "theta /demo cancelled by session shutdown (reload)";
const CLEAN_CANCEL_INVOCATION_ID = "11111111-2222-3333-4444-555555555555";

describe("bug 0454 — the degraded RendererGate branch must deliver display:false notes through pi.sendMessage, not drop them", () => {
  it("Cell 1 (RED at fork): a display:false clean-cancel note is SENT via pi.sendMessage with its details.shutdown payload intact under a degraded gate", () => {
    const { deps, sends, notifies, diags } = degradedRecordingChannel();

    sendSystemNote(
      {
        content: CLEAN_CANCEL_CONTENT,
        display: false,
        details: {
          shutdown: {
            reason: "reload",
            theta: "demo",
            invocation_id: CLEAN_CANCEL_INVOCATION_ID,
          },
        },
      },
      deps,
    );

    // RED ANCHOR: at the fork the degraded branch (system-note-channel.ts:312)
    // takes neither the notify arm (gated out by `note.display !== false`,
    // :312) nor any other — the function returns having touched NOTHING. All
    // three recorders are empty; the doc's §Reproduction symptom exactly.
    // Pinning the empty `sends` array first makes the red the DROP itself, not
    // a downstream vacuous pass on the payload assertions below.
    expect(
      sends,
      "runtime-event-channel.md:14 — a display:false note's transcript delivery is renderer-independent; the degraded gate must not drop it",
    ).toHaveLength(1);
    expect(notifies, "a display:false note never takes the toast arm").toHaveLength(0);

    // GREEN-direction observables (reachable once the carve-out lands): the note
    // is delivered on the channel with its payload byte-exact.
    const note = sends[0]!;
    expect(note.customType).toBe(SYSTEM_NOTE_CHANNEL);
    expect(note.display).toBe(false);
    expect(
      note.content,
      "session-shutdown-semantics.md:19 — 'emits exactly one note' with content byte-exact",
    ).toBe(CLEAN_CANCEL_CONTENT);
    expect(
      note.details?.shutdown,
      "diagnostic-shape.md#session-shutdown-details-conventions — the structured payload is the note's whole value and must survive",
    ).toEqual({
      reason: "reload",
      theta: "demo",
      invocation_id: CLEAN_CANCEL_INVOCATION_ID,
    });

    // No delivery-failed diagnostic on the happy transcript send — the degraded
    // display:false carve-out succeeds, it does not fail-and-report.
    expect(diags, "a successful transcript send emits no delivery-failed diagnostic").toHaveLength(0);
  });

  it("Cell 2 (GREEN control, both directions): a display:true note under the SAME degraded gate still takes the toast arm and does not send", () => {
    const { deps, sends, notifies } = degradedRecordingChannel();

    sendSystemNote({ content: "visible degraded note", display: true }, deps);

    // The 0023-era toast-only degrade for display:true notes is a NON-GOAL of
    // this fix (bug 0454 §Non-goals) — it must be undisturbed by the carve-out.
    expect(
      notifies,
      "extension-bootstrap-and-per-theta.md:11 — a display:true note degrades to the ctx.ui.notify toast arm",
    ).toEqual([{ message: "visible degraded note", type: "error" }]);
    expect(
      sends,
      "system-note-channel.ts:313 — the display:true degrade skips the pi.sendMessage transcript arm",
    ).toHaveLength(0);
  });
});
