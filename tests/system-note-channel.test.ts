// V7d-T — failing tests for the `theta-system-note` delivery channel (V7d).
//
// Spec: pi-integration-contract/runtime-event-channel.md §"System notes",
// PIC-21 (extension-bootstrap-and-per-theta.md), PIC-54
// (runtime-event-channel.md#pic-54), diagnostics/code-registry-runtime.md
// (`theta/runtime/system-note-delivery-failed`).
//
// These tests red on their own primary assertions while the V7d delivery /
// fallback implementation is absent (the V7d-T stub is a no-op), per the
// per-phase TDD ritual's "fail red for the intended reason" gate.

import { afterEach, describe, expect, it, vi } from "vitest";
import { visibleWidth } from "@earendil-works/pi-tui";
import type { Component } from "@earendil-works/pi-tui";
import {
  assembleDiagnostics,
  renderDiagnosticBatch,
  type Diagnostic,
} from "../src/diagnostics/diagnostic";
import { createSystemNoteRenderer } from "../src/extension/system-note-renderer";
import {
  RendererGate,
  SYSTEM_NOTE_CHANNEL,
  SYSTEM_NOTE_DELIVERY_FAILED_CODE,
  SystemNoteChannelHealth,
  emitDiagnosticBatch,
  sendSystemNote,
  type SystemNote,
  type SystemNoteChannelDeps,
  type SystemNoteDetails,
  type SystemNoteSender,
} from "../src/extension/system-note-channel";

// --- recording channel double --------------------------------------------

interface SentNote {
  readonly customType: string;
  readonly content: string;
  readonly display: boolean;
  readonly details: SystemNoteDetails;
  readonly options: { readonly triggerTurn: false };
}

interface ChannelFixture {
  readonly deps: SystemNoteChannelDeps;
  readonly sent: SentNote[];
  readonly notified: Array<readonly [string, string]>;
  readonly emitted: Diagnostic[];
}

function makeChannel(opts?: {
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

function diag(file: string, line: number, column: number): Diagnostic {
  return {
    severity: "error",
    code: "theta/parse/unexpected-token",
    file,
    range: { start: { line, column }, end: { line, column: column + 1 } },
    message: `unexpected token at ${file}:${line}`,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// --- Multi-error batch delivery ------------------------------------------

describe("V7d-T — multi-error batch delivery", () => {
  it("delivers the assembled Diagnostic[] as exactly one sendMessage carrying the full batch (no per-error fan-out)", () => {
    const batch = assembleDiagnostics([
      [diag("a.theta", 3, 1), diag("a.theta", 1, 1)],
      [diag("b.thetalib", 2, 1)],
    ]);
    expect(batch.length).toBe(3);

    const { deps, sent } = makeChannel();
    emitDiagnosticBatch(batch, deps);

    // Exactly one `sendMessage` for the whole batch — not one per diagnostic.
    expect(sent).toHaveLength(1);
    const note = sent[0]!;
    expect(note.customType).toBe(SYSTEM_NOTE_CHANNEL);
    expect(note.display).toBe(true);
    expect(note.options.triggerTurn).toBe(false);
    // Full batch serialised into `content`.
    expect(note.content).toBe(renderDiagnosticBatch(batch));
    // Full `Diagnostic[]` carried in `details.diagnostics`.
    expect("diagnostics" in note.details).toBe(true);
    const carried = (note.details as { diagnostics: readonly Diagnostic[] })
      .diagnostics;
    expect(carried).toHaveLength(batch.length);
    expect(carried).toEqual(batch);
  });

  it("re-scan re-emits the batch with no dedup/supersede (a second emit is a second sendMessage)", () => {
    const batch = assembleDiagnostics([[diag("a.theta", 1, 1)]]);
    const { deps, sent } = makeChannel();

    emitDiagnosticBatch(batch, deps);
    emitDiagnosticBatch(batch, deps);

    // No dedup, no supersede: each scan emits its own `sendMessage`.
    expect(sent).toHaveLength(2);
    expect(sent[0]!.content).toBe(sent[1]!.content);
  });
});

// --- PIC-21 renderer exception safety ------------------------------------

describe("V7d-T — PIC-21 renderer exception safety", () => {
  const opts = { expanded: false } as never;
  const theme = {} as never;

  it("PIC-21: an internal renderer throw does not escape; display:true falls back to a raw-content Component, display:false returns undefined", () => {
    // Force an internal failure in the renderer body (the dim-styling step).
    const renderer = createSystemNoteRenderer({
      formatLines: (): never => {
        throw new Error("formatter boom");
      },
    });

    // display === true: the throw MUST NOT escape the MessageRenderer
    // invocation; the renderer returns a minimal Component rendering the raw
    // `message.content`.
    let component: Component | undefined;
    expect(() => {
      component = renderer(
        {
          customType: SYSTEM_NOTE_CHANNEL,
          content: "raw one\nraw two",
          display: true,
        } as never,
        opts,
        theme,
      );
    }).not.toThrow();
    expect(component).toBeDefined();
    expect(component?.render(80)).toEqual(["raw one", "raw two"]);

    // display === false: returns undefined and never escapes.
    let hidden: Component | undefined = component;
    expect(() => {
      hidden = renderer(
        {
          customType: SYSTEM_NOTE_CHANNEL,
          content: "hidden",
          display: false,
        } as never,
        opts,
        theme,
      );
    }).not.toThrow();
    expect(hidden).toBeUndefined();
    // No `theta/runtime/*` diagnostic surface exists on the renderer (PIC-21:
    // a caught render-time failure emits no diagnostic) — the renderer factory
    // takes no diagnostics sink, so the property holds by construction.
  });
});

// --- theta/runtime/system-note-delivery-failed fallback chain -------------

describe("V7d-T — renderer honours the TUI render width (no over-wide line)", () => {
  const opts = { expanded: false } as never;
  const theme = {} as never;

  it("wraps a long diagnostic line so no rendered line exceeds the render width (regression: Pi TUI rejects over-wide lines)", () => {
    // The real over-wide load diagnostic that crashed Pi's TUI on the manual
    // real-host smoke: a single 122-column line on an 80-column terminal.
    const content =
      "tests/fixtures/h7a/acceptance.theta:12:58: theta/parse/schema-case-mismatch: schema name must start with an uppercase letter";
    const width = 80;
    const renderer = createSystemNoteRenderer();
    const component = renderer(
      { customType: SYSTEM_NOTE_CHANNEL, content, display: true } as never,
      opts,
      theme,
    );
    expect(component).toBeDefined();
    const lines = component?.render(width) ?? [];
    // The pre-fix renderer returned the raw 122-wide line verbatim; the TUI
    // then threw. Every rendered line must now fit the render width.
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(width);
    }
    // Content is wrapped, not truncated: the message tail survives.
    expect(lines.join(" ")).toContain("uppercase letter");
  });

  it("preserves a blank line and honours a non-positive width fallback", () => {
    const renderer = createSystemNoteRenderer();
    const component = renderer(
      { customType: SYSTEM_NOTE_CHANNEL, content: "a\n\nb", display: true } as never,
      opts,
      theme,
    );
    // Blank line preserved at a real width.
    expect(component?.render(80)).toEqual(["a", "", "b"]);
    // Non-positive width: raw lines, no wrap attempt.
    expect(component?.render(0)).toEqual(["a", "", "b"]);
  });
});

// --- PIC-56 — system-note renderer render-width contract -----------------

describe("V7e-T — theta-system-note renderer render-width contract (PIC-56)", () => {
  const opts = { expanded: false } as never;
  const theme = {} as never;

  it("PIC-56: Component.render(width) returns only lines whose visible width is <= width for a content line longer than width", () => {
    // PIC-56 (runtime-event-channel.md#pic-56): the renderer's returned
    // Component MUST fit its output to the supplied render width — no returned
    // line's visible width may exceed `width`, wrapping (width-aware,
    // preserving injected styling) or truncating each content line as needed.
    // Pi's TUI aborts on any line wider than the terminal, so an over-wide
    // returned line crashes the host at emission time.
    const width = 24;
    const content =
      "this single content line is far wider than the supplied render width and must be split";
    const renderer = createSystemNoteRenderer();
    const component = renderer(
      { customType: SYSTEM_NOTE_CHANNEL, content, display: true } as never,
      opts,
      theme,
    );
    expect(component).toBeDefined();
    const lines = component?.render(width) ?? [];
    // The over-wide source line must be split into more than one returned line
    // and every returned line must fit the render width.
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(width);
    }
  });

  it("PIC-56: a blank content line is preserved as a single blank line", () => {
    // PIC-56: a blank content line MUST be preserved as one blank line, not
    // dropped or collapsed.
    const renderer = createSystemNoteRenderer();
    const component = renderer(
      { customType: SYSTEM_NOTE_CHANNEL, content: "before\n\nafter", display: true } as never,
      opts,
      theme,
    );
    expect(component?.render(80)).toEqual(["before", "", "after"]);
  });

  it("PIC-56: a non-positive width (no width contract) falls back to the raw lines", () => {
    // PIC-56: a non-positive `width` (no width contract available) falls back
    // to the raw lines — no wrap or truncate is attempted.
    const content = "an over-wide raw line that is definitely longer than zero columns wide";
    const renderer = createSystemNoteRenderer();
    const component = renderer(
      { customType: SYSTEM_NOTE_CHANNEL, content, display: true } as never,
      opts,
      theme,
    );
    expect(component?.render(0)).toEqual([content]);
    expect(component?.render(-5)).toEqual([content]);
  });
});

describe("V7d-T — theta/runtime/system-note-delivery-failed fallback chain", () => {
  function note(overrides?: Partial<SystemNote>): SystemNote {
    return {
      content: "theta /demo aborted: boom",
      display: true,
      details: { event: { kind: "transport", theta: "/demo" } },
      ...overrides,
    };
  }

  it("theta/runtime/system-note-delivery-failed: on a sendMessage throw, falls back to ctx.ui.notify(content,'error') then the diagnostic (message=content, hint=throw message), without aborting", () => {
    const thrown = new Error("sendMessage host dead");
    const { deps, notified, emitted } = makeChannel({ sendThrows: thrown });
    const n = note();

    expect(() => sendSystemNote(n, deps)).not.toThrow();

    // Step 1 — transient toast with the original content and "error" level.
    expect(notified).toHaveLength(1);
    expect(notified[0]).toEqual([n.content, "error"]);

    // Step 2 — `theta/runtime/system-note-delivery-failed` diagnostic.
    expect(emitted).toHaveLength(1);
    const d = emitted[0]!;
    expect(d.code).toBe(SYSTEM_NOTE_DELIVERY_FAILED_CODE);
    expect(d.severity).toBe("error");
    expect(d.message).toBe(n.content);
    expect(d.hint).toBe(thrown.message);
  });

  it("skips ctx.ui.notify when display:false but still emits the diagnostic", () => {
    const { deps, notified, emitted } = makeChannel({
      sendThrows: new Error("dead"),
    });
    sendSystemNote(note({ display: false, content: "" }), deps);

    expect(notified).toHaveLength(0);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.code).toBe(SYSTEM_NOTE_DELIVERY_FAILED_CODE);
  });

  it("skips ctx.ui.notify when content is the empty string", () => {
    const { deps, notified, emitted } = makeChannel({
      sendThrows: new Error("dead"),
    });
    sendSystemNote(note({ content: "", display: true }), deps);

    expect(notified).toHaveLength(0);
    expect(emitted).toHaveLength(1);
  });

  it("catches a throwing ctx.ui.notify and proceeds to the diagnostic step", () => {
    const { deps, notified, emitted } = makeChannel({
      sendThrows: new Error("dead"),
      notifyThrows: new Error("ui detached"),
    });

    expect(() => sendSystemNote(note(), deps)).not.toThrow();
    // notify was attempted (and threw)...
    expect(notified).toHaveLength(1);
    // ...and the fallback still proceeded to emit the diagnostic.
    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.code).toBe(SYSTEM_NOTE_DELIVERY_FAILED_CODE);
  });

  it("PIC-54: when sendMessage and the diagnostic step both fail, the terminal console.error is reached and a throw from it is silently swallowed", () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation((): void => {
        throw new Error("console detached");
      });

    const { deps } = makeChannel({
      sendThrows: new Error("dead"),
      emitThrows: new Error("diagnostics channel dead"),
    });

    // The terminal console.error is reached (both prior channels failed) and
    // its throw MUST NOT propagate out of the sendSystemNote fallback chain.
    expect(() => sendSystemNote(note(), deps)).not.toThrow();
    expect(errorSpy).toHaveBeenCalled();
  });
});

// --- bug 0018 (PIC-67) — stale-dead latch + fail-loud-once bounding --------

describe("bug 0018 (PIC-67) — stale-dead latch and fail-loud-once terminal bounding", () => {
  /**
   * The host's stale-ctx invalidation message, byte-exact from the installed
   * host package (dist/core/extensions/loader.js `invalidate` default;
   * identical text in runner.js and the agent-session.js bare-dispose call).
   * Deliberately the full host literal rather than the src prefix constant so
   * these tests witness recognition of the REAL host message.
   */
  const HOST_STALE_MESSAGE =
    "This extension ctx is stale after session replacement or reload. Do not use a captured pi or command ctx after ctx.newSession(), ctx.fork(), ctx.switchSession(), or ctx.reload(). For newSession, fork, and switchSession, move post-replacement work into withSession and use the ctx passed to withSession. For reload, do not use the old ctx after await ctx.reload().";

  function panicNote(): SystemNote {
    return {
      content: "theta /demo aborted: boom",
      display: true,
      details: { diagnostics: [] },
    };
  }

  it("PIC-67: a stale pi.sendMessage throw marks the channel dead and rethrows — no fallback arm, no diagnostic, no stderr", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation((): void => {});
    const health = new SystemNoteChannelHealth();
    const staleError = new Error(HOST_STALE_MESSAGE);
    const { deps, notified, emitted } = makeChannel({
      sendThrows: staleError,
      health,
    });

    let caught: unknown;
    try {
      sendSystemNote(panicNote(), deps);
    } catch (thrown) {
      caught = thrown;
    }

    expect(caught, "the stale throw must surface to the caller").toBe(staleError);
    expect(
      health.staleError(),
      "the channel records the stale error (permanently dead)",
    ).toBe(staleError);
    expect(
      notified,
      "the equally-stale ctx.ui arm must not be re-entered",
    ).toHaveLength(0);
    expect(emitted, "no delivery-failed diagnostic for the stale case").toHaveLength(0);
    expect(errorSpy, "no stderr for the stale case").not.toHaveBeenCalled();
  });

  it("PIC-67: a dead channel rethrows the recorded stale error touch-free (no pi / ui / diagnostic touch)", () => {
    const health = new SystemNoteChannelHealth();
    const staleError = new Error(HOST_STALE_MESSAGE);
    health.markStale(staleError);
    // A working (non-throwing) fixture: any touch after death would RECORD.
    const { deps, sent, notified, emitted } = makeChannel({ health });

    let caught: unknown;
    try {
      sendSystemNote(panicNote(), deps);
    } catch (thrown) {
      caught = thrown;
    }

    expect(caught, "the recorded stale error is rethrown by identity").toBe(
      staleError,
    );
    expect(sent, "pi.sendMessage must not be touched on a dead channel").toHaveLength(0);
    expect(notified).toHaveLength(0);
    expect(emitted).toHaveLength(0);
  });

  it("PIC-67 fail-loud-once: two non-stale double-failures log exactly one terminal line with health present, two without", () => {
    const stderr: unknown[] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]): void => {
      stderr.push(args[0]);
    });
    const terminalLines = (): number =>
      stderr.filter(
        (first) =>
          typeof first === "string" &&
          first.startsWith("system-note delivery failed:"),
      ).length;

    // Both channels fail (non-stale) → the PIC-54 terminal arm. With a health
    // latch: exactly one line across two failures on the same channel instance.
    const latched = makeChannel({
      sendThrows: new Error("send dead"),
      emitThrows: new Error("diagnostics dead"),
      health: new SystemNoteChannelHealth(),
    });
    sendSystemNote(panicNote(), latched.deps);
    sendSystemNote(panicNote(), latched.deps);
    expect(
      terminalLines(),
      "health bounds the terminal line to once per channel instance",
    ).toBe(1);

    // Without health (lightweight double): the unbounded pre-0018 behaviour.
    stderr.length = 0;
    const unlatched = makeChannel({
      sendThrows: new Error("send dead"),
      emitThrows: new Error("diagnostics dead"),
    });
    sendSystemNote(panicNote(), unlatched.deps);
    sendSystemNote(panicNote(), unlatched.deps);
    expect(terminalLines(), "no health latch → one line per failure").toBe(2);
  });

  it("PIC-67: on a degraded-renderer instance a stale ctx.ui.notify throw marks the channel dead and rethrows — no terminal line, and later sends rethrow touch-free", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation((): void => {});
    const health = new SystemNoteChannelHealth();
    const gate = new RendererGate();
    gate.degrade();
    const staleError = new Error(HOST_STALE_MESSAGE);
    const { deps, sent, emitted, notified } = makeChannel({
      notifyThrows: staleError,
      health,
      rendererGate: gate,
    });

    let caught: unknown;
    try {
      sendSystemNote(panicNote(), deps);
    } catch (thrown) {
      caught = thrown;
    }

    expect(caught).toBe(staleError);
    expect(health.staleError()).toBe(staleError);
    // The degraded arm's single notify touch IS the evidence touch.
    expect(notified).toHaveLength(1);
    expect(sent, "the degraded arm never touches pi.sendMessage").toHaveLength(0);
    expect(emitted).toHaveLength(0);
    expect(errorSpy, "no terminal line for the stale case").not.toHaveBeenCalled();

    // Follow-up send: the channel is now dead — touch-free rethrow.
    let second: unknown;
    try {
      sendSystemNote(panicNote(), deps);
    } catch (thrown) {
      second = thrown;
    }
    expect(second).toBe(staleError);
    expect(notified, "a dead channel adds no further touches").toHaveLength(1);
    expect(sent).toHaveLength(0);
  });
});
