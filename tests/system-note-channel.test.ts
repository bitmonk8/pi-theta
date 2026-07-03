// V7d-T — failing tests for the `loom-system-note` delivery channel (V7d).
//
// Spec: pi-integration-contract/runtime-event-channel.md §"System notes",
// PIC-21 (extension-bootstrap-and-per-loom.md), PIC-54
// (runtime-event-channel.md#pic-54), diagnostics/code-registry-runtime.md
// (`loom/runtime/system-note-delivery-failed`).
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
  SYSTEM_NOTE_CHANNEL,
  SYSTEM_NOTE_DELIVERY_FAILED_CODE,
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
  };
  return { deps, sent, notified, emitted };
}

function diag(file: string, line: number, column: number): Diagnostic {
  return {
    severity: "error",
    code: "loom/parse/unexpected-token",
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
      [diag("a.loom", 3, 1), diag("a.loom", 1, 1)],
      [diag("b.warp", 2, 1)],
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
    const batch = assembleDiagnostics([[diag("a.loom", 1, 1)]]);
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
    // No `loom/runtime/*` diagnostic surface exists on the renderer (PIC-21:
    // a caught render-time failure emits no diagnostic) — the renderer factory
    // takes no diagnostics sink, so the property holds by construction.
  });
});

// --- loom/runtime/system-note-delivery-failed fallback chain -------------

describe("V7d-T — renderer honours the TUI render width (no over-wide line)", () => {
  const opts = { expanded: false } as never;
  const theme = {} as never;

  it("wraps a long diagnostic line so no rendered line exceeds the render width (regression: Pi TUI rejects over-wide lines)", () => {
    // The real over-wide load diagnostic that crashed Pi's TUI on the manual
    // real-host smoke: a single 122-column line on an 80-column terminal.
    const content =
      "tests/fixtures/h7a/acceptance.loom:12:58: loom/parse/schema-case-mismatch: schema name must start with an uppercase letter";
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

describe("V7d-T — loom/runtime/system-note-delivery-failed fallback chain", () => {
  function note(overrides?: Partial<SystemNote>): SystemNote {
    return {
      content: "loom /demo aborted: boom",
      display: true,
      details: { event: { kind: "transport", loom: "/demo" } },
      ...overrides,
    };
  }

  it("loom/runtime/system-note-delivery-failed: on a sendMessage throw, falls back to ctx.ui.notify(content,'error') then the diagnostic (message=content, hint=throw message), without aborting", () => {
    const thrown = new Error("sendMessage host dead");
    const { deps, notified, emitted } = makeChannel({ sendThrows: thrown });
    const n = note();

    expect(() => sendSystemNote(n, deps)).not.toThrow();

    // Step 1 — transient toast with the original content and "error" level.
    expect(notified).toHaveLength(1);
    expect(notified[0]).toEqual([n.content, "error"]);

    // Step 2 — `loom/runtime/system-note-delivery-failed` diagnostic.
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
