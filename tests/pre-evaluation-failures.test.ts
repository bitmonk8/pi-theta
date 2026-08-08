// V4e-T — load-time pre-evaluation failure routing (tests). These tests are
// written against the seam the paired V4e implementation leaf fills in; they
// MUST fail red for the intended reason (the pre-eval routing is absent),
// citing ERR-1…ERR-6 and ERR-16 inline. Each cause's assembled
// `theta-system-note` is handed to the router; the router MUST route it onto the
// `theta-system-note` channel with `triggerTurn:false`, never firing a turn and
// never becoming an evaluation outcome.
//
// Spec: errors-and-results/error-model.md (ERR-1…ERR-6, ERR-16),
// hard-ceilings/ceilings-3-and-4.md (CIO-1 ceiling-#4 slash-load `params`
// cross-route through ceiling #3), pi-integration-contract/
// runtime-event-channel.md §"System notes".

import { describe, expect, it, vi } from "vitest";
import {
  createLoadFailurePreEvalRouter,
  type PreEvalFailureCause,
} from "../src/extension/load-pre-eval";
import {
  SYSTEM_NOTE_CHANNEL,
  type SystemNote,
  type SystemNoteChannelDeps,
  type SystemNoteDetails,
  type SystemNoteSender,
} from "../src/extension/system-note-channel";
import type { Diagnostic } from "../src/diagnostics/diagnostic";

// A recording `theta-system-note` channel. `pi.sendMessage` is the only surface
// asserted against — it carries the fixed `triggerTurn:false` option, so a
// routed pre-eval failure never fires a turn.
function recordingChannel(): {
  channel: SystemNoteChannelDeps;
  sendMessage: ReturnType<typeof vi.fn>;
} {
  const sendMessage = vi.fn<SystemNoteSender["sendMessage"]>();
  const channel: SystemNoteChannelDeps = {
    pi: { sendMessage },
    ui: { notify: vi.fn() },
    emitDiagnostic: vi.fn<(d: Diagnostic) => void>(),
  };
  return { channel, sendMessage };
}

// Pull the single `sendMessage` call and read its message + options.
function onlyNote(sendMessage: ReturnType<typeof vi.fn>): {
  customType: string;
  content: string;
  details: SystemNoteDetails;
  triggerTurn: unknown;
} {
  expect(sendMessage).toHaveBeenCalledTimes(1);
  const [message, options] = sendMessage.mock.calls[0] as [
    { customType: string; content: string; details: SystemNoteDetails },
    { triggerTurn: unknown },
  ];
  return {
    customType: message.customType,
    content: message.content,
    details: message.details,
    triggerTurn: options.triggerTurn,
  };
}

// A representative assembled `theta-system-note` for a diagnostic-batch cause
// (ERR-1…ERR-4, ERR-6). The producing subsystem assembles it; V4e routes it.
function diagNote(code: string): SystemNote {
  const diagnostic: Diagnostic = {
    severity: "error",
    code,
    message: `pre-eval failure: ${code}`,
  };
  return {
    content: `pre-eval failure: ${code}`,
    display: true,
    details: { diagnostics: [diagnostic] },
  };
}

describe("V4e-T — load-time pre-evaluation failure routing", () => {
  it("ERR-1: a host-incompatible pre-eval failure routes onto theta-system-note without firing a turn", () => {
    // ERR-1: host-incompatibility detected by the capability probe (V9a)
    // surfaces `theta/load/host-incompatible`; it MUST route pre-eval, never
    // firing a turn.
    const { channel, sendMessage } = recordingChannel();
    const router = createLoadFailurePreEvalRouter({ channel });

    router.routePreEvalFailure(
      "capability-probe",
      diagNote("theta/load/host-incompatible"),
    );

    const note = onlyNote(sendMessage);
    expect(note.customType).toBe(SYSTEM_NOTE_CHANNEL);
    expect(note.customType).toBe("theta-system-note");
    // The routing never fires a turn (ERR-1: `triggerTurn:false`).
    expect(note.triggerTurn).toBe(false);
  });

  it("ERR-2: a lex/parse/type failure routes pre-eval with triggerTurn:false", () => {
    // ERR-2: lex / parse / type batches route pre-eval.
    const { channel, sendMessage } = recordingChannel();
    const router = createLoadFailurePreEvalRouter({ channel });

    router.routePreEvalFailure(
      "lex-parse-type",
      diagNote("theta/parse/unterminated-template"),
    );

    const note = onlyNote(sendMessage);
    expect(note.customType).toBe(SYSTEM_NOTE_CHANNEL);
    expect(note.triggerTurn).toBe(false);
  });

  it("ERR-3: a frontmatter failure routes pre-eval with triggerTurn:false", () => {
    // ERR-3: frontmatter rejection (V6a) surfaces e.g. `theta/load/missing-mode`.
    const { channel, sendMessage } = recordingChannel();
    const router = createLoadFailurePreEvalRouter({ channel });

    router.routePreEvalFailure("frontmatter", diagNote("theta/load/missing-mode"));

    const note = onlyNote(sendMessage);
    expect(note.customType).toBe(SYSTEM_NOTE_CHANNEL);
    expect(note.triggerTurn).toBe(false);
  });

  it("ERR-4: a binder-model resolution failure routes pre-eval with triggerTurn:false", () => {
    // ERR-4: binder-model resolution failure (V11a) surfaces
    // `theta/load/binder-model-unresolved`.
    const { channel, sendMessage } = recordingChannel();
    const router = createLoadFailurePreEvalRouter({ channel });

    router.routePreEvalFailure(
      "binder-model",
      diagNote("theta/load/binder-model-unresolved"),
    );

    const note = onlyNote(sendMessage);
    expect(note.customType).toBe(SYSTEM_NOTE_CHANNEL);
    expect(note.triggerTurn).toBe(false);
  });

  it("ERR-5: a binder arg-binding failure (ceiling #3) routes pre-eval with triggerTurn:false", () => {
    // ERR-5: binder argument-binding failure (hard ceiling #3, V11f) surfaces a
    // rendered binder system-note; it routes pre-eval, never an evaluation
    // outcome (excluded from the success/fail/cancelled trichotomy).
    const { channel, sendMessage } = recordingChannel();
    const router = createLoadFailurePreEvalRouter({ channel });

    const note: SystemNote = {
      content: "theta /demo: argument binding failed — could not parse arguments",
      display: true,
      details: { event: { kind: "ceiling", surfaced: "ceiling#3" } },
    };
    router.routePreEvalFailure("binder-arg-binding", note);

    const routed = onlyNote(sendMessage);
    expect(routed.customType).toBe(SYSTEM_NOTE_CHANNEL);
    expect(routed.triggerTurn).toBe(false);
  });

  it("ERR-6: a tools: resolution failure routes pre-eval with triggerTurn:false", () => {
    // ERR-6: `tools:` resolution failure (V10a/V6a) surfaces e.g.
    // `theta/load/unknown-tool`.
    const { channel, sendMessage } = recordingChannel();
    const router = createLoadFailurePreEvalRouter({ channel });

    router.routePreEvalFailure(
      "tools-resolution",
      diagNote("theta/load/unknown-tool"),
    );

    const note = onlyNote(sendMessage);
    expect(note.customType).toBe(SYSTEM_NOTE_CHANNEL);
    expect(note.triggerTurn).toBe(false);
  });

  it("ERR-16: the slash-load params arm of ceiling #4, cross-routed via CIO-1 / ceiling #3 no-retry, routes pre-eval with triggerTurn:false and omits masked", () => {
    // ERR-16: the slash-load `params` arm of ceiling #4, cross-routed through
    // ceiling #3's no-retry classification per CIO-1. The breach is detected and
    // the row rendered at the boundary that owns it — ceiling #4's depth walk at
    // the post-default-merge AJV validation hook, whose AJV-on-`args` class
    // renders the row below — and the assembled note routes pre-eval here,
    // never becoming an evaluation outcome.
    const { channel, sendMessage } = recordingChannel();
    const router = createLoadFailurePreEvalRouter({ channel });

    const crossRoute: SystemNote = {
      content:
        "theta /demo: argument binding produced invalid args — /a/b/c/d/e JSON document depth exceeds 5",
      display: true,
      // PIC-1 (c): this site's reachable `masked` domain is EMPTY. The
      // originating ceiling is recoverable from the rendered note's
      // `<ajv-summary>`, so the cross-route surfaces ceiling #3 alone.
      details: { event: { kind: "ceiling", surfaced: "ceiling#3" } },
    };
    router.routePreEvalFailure("slash-load-params", crossRoute);

    // Primary assertion — the cross-route note routes pre-eval onto the
    // theta-system-note channel with `triggerTurn:false`, never firing a turn.
    const note = onlyNote(sendMessage);
    expect(note.customType).toBe(SYSTEM_NOTE_CHANNEL);
    expect(note.triggerTurn).toBe(false);

    // PIC-1 (b)/(c) — `masked` is absent, not `[]`, at a site whose reachable
    // mask domain is empty.
    const details = note.details as { readonly event: Record<string, unknown> };
    expect(details.event["surfaced"]).toBe("ceiling#3");
    expect("masked" in details.event).toBe(false);
  });

  it("ERR-1…ERR-6/ERR-16: every load-time cause routes onto theta-system-note (no cause becomes an evaluation outcome)", () => {
    // Exercise every diagnostic-batch cause through the one routing surface:
    // each MUST surface exactly one theta-system-note carrying
    // `triggerTurn:false`, so no cause ever fires a turn or becomes an
    // evaluation Failure.
    const cases: ReadonlyArray<readonly [PreEvalFailureCause, string]> = [
      ["capability-probe", "theta/load/host-incompatible"],
      ["lex-parse-type", "theta/parse/unterminated-template"],
      ["frontmatter", "theta/load/missing-mode"],
      ["binder-model", "theta/load/binder-model-unresolved"],
      ["tools-resolution", "theta/load/unknown-tool"],
    ];
    for (const [cause, code] of cases) {
      const { channel, sendMessage } = recordingChannel();
      const router = createLoadFailurePreEvalRouter({ channel });

      router.routePreEvalFailure(cause, diagNote(code));

      const note = onlyNote(sendMessage);
      expect(note.customType).toBe(SYSTEM_NOTE_CHANNEL);
      expect(note.triggerTurn).toBe(false);
    }
  });
});
