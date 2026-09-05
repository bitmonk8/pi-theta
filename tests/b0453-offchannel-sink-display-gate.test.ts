// Bug 0453 — the fallback chain inverts its own display gate for a
// `display: false` note: step 1 SUPPRESSES the toast per the skip rule, then
// step 2's off-channel sink SHOWS the same content on the transient UI.
//
// WHY this is a bug:
//   - The step-1 skip rule exists precisely so a `display: false` note's
//     `content` NEVER reaches `ctx.ui.notify`:
//     `runtime-event-channel.md:134` — "**Skipped when `display: false`**:
//     notifying the user transiently about an event whose author handled the
//     underlying `Err` (or a subagent-private cascade) defeats the purpose of
//     `display: false`; the fallback proceeds straight to step 2."
//   - The clean-cancel note the skip rule protects is pinned
//     "operator-visible only via the structured payload"
//     (`runtime-event-channel.md:26`, table row `:39`), so the transient toast
//     of its `content` is a contract violation.
//   - The step-2 diagnostic's `message = content` mandate stays
//     (`runtime-event-channel.md:135` — "with `message` set to the original
//     note's `content`"); the structured artefact is a NON-GOAL to change.
//     The leak is the step-2 SINK: `makeLoadEmit`
//     (`production-composition.ts:227–231`) toasts EVERY error-severity
//     diagnostic via `ctx.ui.notify`, so the delivery-failed diagnostic —
//     whose `message` IS the gated content
//     (`system-note-channel.ts:387–392`, step 2) — gets toasted two lines
//     after step 1 honoured the gate.
//
// THE FIX (bug 0453 §Fix option 1, recommended): `SystemNoteChannelDeps` gains
// an OPTIONAL display-aware sink
//     readonly emitDeliveryFailed?: (d: Diagnostic, originatingDisplay: boolean) => void;
// and step 2 calls `deps.emitDeliveryFailed(diagnostic, note.display)` when
// present (else the current `deps.emitDiagnostic(diagnostic)`). In production
// that sink skips the toast when `originatingDisplay === false` and delegates
// to `makeLoadEmit` when `true` (so a `display: true` failure keeps its toast —
// this is why bug 0435 stays green).
//
// TYPE HANDLING: `emitDeliveryFailed` is not yet a member of
// `SystemNoteChannelDeps` at the fork. A LOCAL intersection type
// (`ChannelWithDeliveryFailed`) lets this file typecheck at BOTH the fork and
// post-fix — `SystemNoteChannelDeps`'s param accepts the superset.
//
// Offline, provider-free, deterministic: host doubles only, no provider, no
// child process, no filesystem. Modelled on `tests/system-note-channel.test.ts`
// (its direct `sendSystemNote` + recording-double shape).
//
// No silent skipping: a fail-loud precondition (`sendAttempts`) asserts the
// throwing send was actually attempted before every cell asserts, so a red is
// never vacuous.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import {
  createBootstrapDiagnosticSink,
  makeDeliveryFailedEmit,
} from "../src/extension/production-composition";
import { isStaleCtxError } from "../src/extension/stale-ctx";
import {
  SYSTEM_NOTE_CHANNEL,
  SYSTEM_NOTE_DELIVERY_FAILED_CODE,
  RendererGate,
  SystemNoteChannelHealth,
  sendSystemNote,
  type SystemNote,
  type SystemNoteChannelDeps,
} from "../src/extension/system-note-channel";

// The post-fix superset. Defining `emitDeliveryFailed` locally keeps
// `npm run typecheck` clean at the fork (the member is absent from
// `SystemNoteChannelDeps` today) and after the fix (the real member is
// assignable to this shape). The channel is BUILT as this type and PASSED to
// `sendSystemNote`, whose `SystemNoteChannelDeps` param accepts the superset.
type ChannelWithDeliveryFailed = SystemNoteChannelDeps & {
  readonly emitDeliveryFailed?: (
    d: Diagnostic,
    originatingDisplay: boolean,
  ) => void;
};

interface Toast {
  readonly message: string;
  readonly type: string;
}
interface SinkEntry {
  readonly diagnostic: Diagnostic;
  readonly originatingDisplay: boolean;
}

/** The exact clean-cancel content the shutdown row pins as gated. */
const CLEAN_CANCEL_CONTENT =
  "theta /demo cancelled by session shutdown (reload)";

/** The non-stale host refusal driving the fallback chain. */
const NON_STALE_MESSAGE = "scratch: host refused the clean-cancel note (non-stale)";

interface Fixture {
  readonly channel: ChannelWithDeliveryFailed;
  /** Toasts recorded off `ctx.ui.notify` (the surface the gate protects). */
  readonly notified: Toast[];
  /** Entries the display-aware sink received (the preserved structured half). */
  readonly deliveredToSink: SinkEntry[];
  /** How many times `pi.sendMessage` (theta-system-note) was attempted. */
  sendAttempts(): number;
}

function makeFixture(): Fixture {
  const notified: Toast[] = [];
  const deliveredToSink: SinkEntry[] = [];
  let sendAttempts = 0;

  const notify = (message: string, type: "error"): void => {
    notified.push({ message, type });
  };

  const channel: ChannelWithDeliveryFailed = {
    pi: {
      sendMessage: (message): void => {
        if (message.customType === SYSTEM_NOTE_CHANNEL) {
          sendAttempts += 1;
          // A plain Error — deliberately NOT a stale-ctx error, so the
          // fallback chain is walked (rather than the channel latching dead
          // and rethrowing). Asserted below.
          throw new Error(NON_STALE_MESSAGE);
        }
      },
    },
    ui: { notify },
    // The CURRENT leak source: a byte-replica of `makeLoadEmit`'s UI arm
    // (`production-composition.ts:227–231`) — a display-UNAWARE toast of every
    // error-severity diagnostic. Replicated because `makeLoadEmit` is
    // module-private (bug 0453 §Reproduction probe P2 did the same).
    emitDiagnostic: (d: Diagnostic): void => {
      if (d.severity === "error") {
        notify(d.message, "error");
      }
    },
    // The production display-aware sink (`makeDeliveryFailedEmit`, added by the
    // fix): record the structured artefact always; skip the toast when the
    // originating note was `display: false`; for `display: true` delegate to
    // the toast arm (preserving the bug-0435 behaviour).
    emitDeliveryFailed: (d: Diagnostic, originatingDisplay: boolean): void => {
      deliveredToSink.push({ diagnostic: d, originatingDisplay });
      if (originatingDisplay === false) {
        return;
      }
      if (d.severity === "error") {
        notify(d.message, "error");
      }
    },
    health: new SystemNoteChannelHealth(),
  };

  return {
    channel,
    notified,
    deliveredToSink,
    sendAttempts: () => sendAttempts,
  };
}

describe("bug 0453 — the step-2 off-channel sink inverts the display gate", () => {
  it("isStaleCtxError is false for the non-stale refusal, so the fallback chain IS walked", () => {
    // Fail-loud framing: the whole file depends on the send throwing NON-stale
    // (a stale throw would latch the channel dead and rethrow, never reaching
    // step 2). Pin that here so a mis-read of stale-ctx.ts cannot make the
    // reds/greens below vacuous.
    expect(isStaleCtxError(new Error(NON_STALE_MESSAGE))).toBe(false);
  });

  it("(a) WITNESS — a display:false note's gated content never reaches ctx.ui.notify", () => {
    const fx = makeFixture();
    const note: SystemNote = {
      content: CLEAN_CANCEL_CONTENT,
      display: false,
      details: {
        shutdown: { reason: "reload", theta: "demo", invocation_id: "x" },
      },
    };

    sendSystemNote(note, fx.channel);

    // Fail-loud precondition: the throwing send must have been attempted, else
    // the chain was never entered and an empty `notified` would be vacuous.
    expect(
      fx.sendAttempts(),
      "precondition unmet: pi.sendMessage(theta-system-note) was never attempted, so no fallback chain ran",
    ).toBe(1);

    // WITNESS: the display gate must hold across the WHOLE fallback. RED at
    // the fork — step 2's `emitDiagnostic` (the makeLoadEmit replica) toasts
    // the gated content: `notified === [{message: CLEAN_CANCEL_CONTENT,
    // type:"error"}]`. GREEN after the fix — step 2 routes to
    // `emitDeliveryFailed(diag, false)`, which skips the toast.
    expect(
      fx.notified,
      `the display:false clean-cancel content was toasted on ctx.ui.notify — the step-1 skip rule (runtime-event-channel.md:134) is defeated by the step-2 off-channel sink; toasts: ${JSON.stringify(fx.notified)}`,
    ).toEqual([]);
  });

  it("(b) WITNESS — the structured delivery-failed artefact is preserved (message=content mandate not dropped)", () => {
    const fx = makeFixture();
    const note: SystemNote = {
      content: CLEAN_CANCEL_CONTENT,
      display: false,
      details: {
        shutdown: { reason: "reload", theta: "demo", invocation_id: "x" },
      },
    };

    sendSystemNote(note, fx.channel);

    expect(
      fx.sendAttempts(),
      "precondition unmet: pi.sendMessage(theta-system-note) was never attempted, so no fallback chain ran",
    ).toBe(1);

    // WITNESS: §Non-goal — the `message = content` mandate
    // (runtime-event-channel.md:135) is NOT dropped; the delivery failure is
    // still accounted for through the display-aware sink. RED at the fork —
    // step 2 calls `emitDiagnostic`, not `emitDeliveryFailed`, so
    // `deliveredToSink === []`. GREEN after the fix.
    expect(
      fx.deliveredToSink.length,
      `the display-aware sink (emitDeliveryFailed) was never called — step 2 still routes the delivery-failed diagnostic through the display-unaware emitDiagnostic; sink entries: ${JSON.stringify(fx.deliveredToSink)}`,
    ).toBe(1);
    const entry = fx.deliveredToSink[0] as SinkEntry;
    expect(entry.originatingDisplay).toBe(false);
    expect(entry.diagnostic.code).toBe(SYSTEM_NOTE_DELIVERY_FAILED_CODE);
    expect(entry.diagnostic.message).toBe(CLEAN_CANCEL_CONTENT);
  });

  it("(c) CONTROL — a display:true note still toasts (the step-1 arm is unchanged by the fix)", () => {
    const fx = makeFixture();
    const note: SystemNote = {
      content: "theta /demo something",
      display: true,
      details: { event: {} },
    };

    sendSystemNote(note, fx.channel);

    expect(
      fx.sendAttempts(),
      "precondition unmet: pi.sendMessage(theta-system-note) was never attempted, so no fallback chain ran",
    ).toBe(1);

    // CONTROL (neighbour): a `display: true` note is NOT gated — step 1's
    // `ctx.ui.notify(content)` still fires. GREEN at the fork AND after the
    // fix (the fix does not gate `display: true`). Fail loudly if empty.
    expect(
      fx.notified.length,
      "CONTROL regressed: a display:true note produced no toast; the fix must not gate display:true",
    ).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Characterisation of the REAL exported sink `makeDeliveryFailedEmit`
// (production-composition.ts), non-circular coverage the replica cells above
// cannot give. Locks both arms — in particular the §Non-goal headless stderr
// mirror for a `display: false` failure, which no other test exercises (the
// clean-cancel note's own tests deliver over a SUCCEEDING send, so the
// fallback is never walked).
// ===========================================================================

describe("bug 0453 — makeDeliveryFailedEmit is display-aware", () => {
  const deliveryFailed: Diagnostic = {
    severity: "error",
    code: SYSTEM_NOTE_DELIVERY_FAILED_CODE,
    message: "theta /demo cancelled by session shutdown (reload)",
    hint: "scratch: host refused",
  };

  function ctxDouble(hasUI: boolean, notified: string[]): ExtensionContext {
    return {
      hasUI,
      ui: { notify: (m: string): void => void notified.push(m) },
    } as unknown as ExtensionContext;
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("display:false, headless: no toast (via loadEmit), mirrored to stderr", () => {
    const notified: string[] = [];
    const loadEmit = vi.fn();
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    makeDeliveryFailedEmit(ctxDouble(false, notified), loadEmit)(
      deliveryFailed,
      false,
    );
    expect(loadEmit, "display:false must not delegate to the toast router").not.toHaveBeenCalled();
    expect(notified, "display:false must not toast").toEqual([]);
    const lines = stderr.mock.calls.map((c) => String(c[0]));
    expect(
      lines.some((l) => l.includes(SYSTEM_NOTE_DELIVERY_FAILED_CODE)),
      `the headless stderr mirror must carry the delivery-failed diagnostic; wrote: ${lines.join("|")}`,
    ).toBe(true);
  });

  it("display:false, UI session: silent — no toast, no stderr", () => {
    const notified: string[] = [];
    const loadEmit = vi.fn();
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    makeDeliveryFailedEmit(ctxDouble(true, notified), loadEmit)(
      deliveryFailed,
      false,
    );
    expect(loadEmit).not.toHaveBeenCalled();
    expect(notified, "display:false on a UI session must be silent (no toast)").toEqual([]);
    expect(stderr, "display:false on a UI session must not write stderr").not.toHaveBeenCalled();
  });

  it("display:true: delegates to the toast/stderr router (loadEmit)", () => {
    const notified: string[] = [];
    const loadEmit = vi.fn();
    makeDeliveryFailedEmit(ctxDouble(true, notified), loadEmit)(
      deliveryFailed,
      true,
    );
    expect(loadEmit, "display:true must delegate to the standard router").toHaveBeenCalledTimes(1);
    expect(loadEmit).toHaveBeenCalledWith(deliveryFailed);
  });
});

// ===========================================================================
// Composition witness: the REAL buildSystemNoteDeps channel (obtained through
// the exported createBootstrapDiagnosticSink → latchSessionContext →
// currentChannel seam) gates display:false. This is the mutation-sensitive
// cell — deleting the `emitDeliveryFailed: makeDeliveryFailedEmit(...)` wiring
// line in buildSystemNoteDeps re-opens the leak here (the replica cells above
// cannot catch that, since they hand-roll the sink). Mirrors b0435's bar of
// driving the real composition-root channel against a throwing host double.
// ===========================================================================

describe("bug 0453 — the production buildSystemNoteDeps channel gates display:false", () => {
  const CLEAN_CANCEL = "theta /demo cancelled by session shutdown (reload)";

  function throwingPi(): ExtensionAPI {
    return {
      sendMessage: (): void => {
        throw new Error("scratch: host refused the clean-cancel note (non-stale)");
      },
    } as unknown as ExtensionAPI;
  }

  function uiCtx(notified: string[]): ExtensionContext {
    return {
      hasUI: true,
      ui: { notify: (m: string): void => void notified.push(m) },
    } as unknown as ExtensionContext;
  }

  function realChannel(notified: string[]): SystemNoteChannelDeps {
    const sink = createBootstrapDiagnosticSink(throwingPi(), new RendererGate());
    sink.latchSessionContext(uiCtx(notified));
    const channel = sink.currentChannel();
    // Fail loudly: the latched extension-instance channel must exist, else the
    // assertions below would be vacuous.
    expect(
      channel,
      "precondition unmet: currentChannel() returned undefined after latchSessionContext",
    ).toBeDefined();
    return channel as SystemNoteChannelDeps;
  }

  it("display:false: a non-stale send failure over the real channel toasts NOTHING", () => {
    const notified: string[] = [];
    sendSystemNote(
      {
        content: CLEAN_CANCEL,
        display: false,
        details: { shutdown: { reason: "reload", theta: "demo", invocation_id: "x" } },
      },
      realChannel(notified),
    );
    expect(
      notified,
      "the real buildSystemNoteDeps channel toasted a display:false note's gated content on ctx.ui.notify — the emitDeliveryFailed wiring is missing",
    ).toEqual([]);
  });

  it("display:true control: a non-stale send failure over the real channel DOES toast", () => {
    const notified: string[] = [];
    sendSystemNote(
      { content: "theta /demo something", display: true, details: { event: {} } },
      realChannel(notified),
    );
    expect(
      notified.length,
      "the real channel produced no toast for a display:true failure — the fix must not gate display:true",
    ).toBeGreaterThan(0);
  });
});
