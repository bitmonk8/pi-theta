import { describe, expect, it, vi } from "vitest";
import {
  createReloadFailurePreEvalRouter,
} from "../src/extension/reload-pre-eval";
import {
  LoomRegistry,
  REGISTRY_SWAP_FAILED_CODE,
  SETTINGS_REMERGE_FAILED_CODE,
} from "../src/extension/reload-wiring";
import {
  SYSTEM_NOTE_CHANNEL,
  type SystemNoteChannelDeps,
  type SystemNoteDetails,
  type SystemNoteSender,
} from "../src/extension/system-note-channel";
import type { Diagnostic } from "../src/diagnostics/diagnostic";

// V4g-T — pre-evaluation reload-failure integration (tests). These tests are
// written against the seam the paired V4g implementation leaf fills in; they
// MUST fail red for the intended reason (the pre-eval routing is absent),
// citing ERR-7 inline. The synthetic watcher-time reload failure is injected
// through V9b's single `ReloadFailureInjector.injectReloadFailure` interface
// (registry-swap and `.loom`/`.warp` re-parse arms V9b wires, plus V10d's
// settings-re-merge arm) — no live V10d/V9b watcher is stood up.

// A recording `loom-system-note` channel. `pi.sendMessage` is the only surface
// asserted against — it carries the fixed `triggerTurn:false` option, so a
// routed pre-eval failure never fires a turn.
function recordingChannel(): {
  channel: SystemNoteChannelDeps;
  sendMessage: ReturnType<typeof vi.fn>;
  emitDiagnostic: ReturnType<typeof vi.fn>;
} {
  const sendMessage =
    vi.fn<SystemNoteSender["sendMessage"]>();
  const emitDiagnostic = vi.fn<(d: Diagnostic) => void>();
  const channel: SystemNoteChannelDeps = {
    pi: { sendMessage },
    ui: { notify: vi.fn() },
    emitDiagnostic,
  };
  return { channel, sendMessage, emitDiagnostic };
}

// Pull the single `sendMessage` call and read its message + options.
function onlyNote(sendMessage: ReturnType<typeof vi.fn>): {
  customType: string;
  details: SystemNoteDetails;
  triggerTurn: unknown;
} {
  expect(sendMessage).toHaveBeenCalledTimes(1);
  const [message, options] = sendMessage.mock.calls[0] as [
    { customType: string; details: SystemNoteDetails },
    { triggerTurn: unknown },
  ];
  return {
    customType: message.customType,
    details: message.details,
    triggerTurn: options.triggerTurn,
  };
}

// The `Diagnostic[]` carried by a `loom-system-note` whose details take the
// `{ diagnostics }` shape.
function diagnosticsOf(details: SystemNoteDetails): readonly Diagnostic[] {
  expect(details).toHaveProperty("diagnostics");
  return (details as { diagnostics: readonly Diagnostic[] }).diagnostics;
}

describe("V4g-T — pre-evaluation watcher-time reload failure (ERR-7)", () => {
  it("ERR-7: the registry-swap arm routes pre-eval to loom-system-note with triggerTurn:false", () => {
    const { channel, sendMessage } = recordingChannel();
    const router = createReloadFailurePreEvalRouter({
      registry: new LoomRegistry(),
      channel,
    });

    // Inject a synthetic registry-swap failure through V9b's one interface —
    // no live watcher is stood up.
    router.injectReloadFailure("registry-swap", new Error("swap boom"));

    const note = onlyNote(sendMessage);
    // Routed pre-eval onto the loom-system-note channel, never firing a turn.
    expect(note.customType).toBe(SYSTEM_NOTE_CHANNEL);
    expect(note.customType).toBe("loom-system-note");
    expect(note.triggerTurn).toBe(false);
    // The registry-swap arm surfaces `loom/runtime/registry-swap-failed`.
    const codes = diagnosticsOf(note.details).map((d) => d.code);
    expect(codes).toContain(REGISTRY_SWAP_FAILED_CODE);
    expect(codes).toContain("loom/runtime/registry-swap-failed");
  });

  it("ERR-7: the .loom/.warp re-parse arm routes pre-eval to loom-system-note with triggerTurn:false", () => {
    const { channel, sendMessage } = recordingChannel();
    const router = createReloadFailurePreEvalRouter({
      registry: new LoomRegistry(),
      channel,
    });

    router.injectReloadFailure("loom-warp-reparse", new Error("parse boom"));

    const note = onlyNote(sendMessage);
    expect(note.customType).toBe(SYSTEM_NOTE_CHANNEL);
    expect(note.triggerTurn).toBe(false);
    // The `.loom`/`.warp` re-parse arm also surfaces the registry-swap code.
    const codes = diagnosticsOf(note.details).map((d) => d.code);
    expect(codes).toContain(REGISTRY_SWAP_FAILED_CODE);
  });

  it("ERR-7: V10d's settings-re-merge arm routes the re-parse/re-merge diagnostic pre-eval with triggerTurn:false", () => {
    const { channel, sendMessage } = recordingChannel();
    const router = createReloadFailurePreEvalRouter({
      registry: new LoomRegistry(),
      channel,
    });

    // The settings-re-merge arm V10d contributes against the same interface —
    // it re-produces a load-phase `loom/load/settings-*` re-merge diagnostic,
    // the re-parse/re-merge diagnostic arm distinct from the swap arm.
    router.injectReloadFailure("settings-remerge", new Error("merge boom"));

    const note = onlyNote(sendMessage);
    expect(note.customType).toBe(SYSTEM_NOTE_CHANNEL);
    expect(note.triggerTurn).toBe(false);
    const codes = diagnosticsOf(note.details).map((d) => d.code);
    expect(codes).toContain(SETTINGS_REMERGE_FAILED_CODE);
    expect(codes).toContain("loom/load/settings-invalid-json");
  });

  it("ERR-7: every injected arm routes onto loom-system-note (no arm becomes an evaluation outcome)", () => {
    // Exercise both the re-parse/re-merge diagnostic arm and the
    // `loom/runtime/registry-swap-failed` registry-swap arm through the one
    // injection interface: each surfaces exactly one loom-system-note carrying
    // `triggerTurn:false`, so no arm ever fires a turn or becomes an
    // evaluation Failure.
    for (const arm of [
      "registry-swap",
      "loom-warp-reparse",
      "settings-remerge",
    ] as const) {
      const { channel, sendMessage } = recordingChannel();
      const router = createReloadFailurePreEvalRouter({
        registry: new LoomRegistry(),
        channel,
      });

      router.injectReloadFailure(arm, new Error(`${arm} boom`));

      const note = onlyNote(sendMessage);
      expect(note.customType).toBe(SYSTEM_NOTE_CHANNEL);
      expect(note.triggerTurn).toBe(false);
    }
  });
});
