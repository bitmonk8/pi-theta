// H4a — the `theta-system-note` message renderer.
//
// A minimal `pi-tui` `Component`-returning renderer for the theta-internal
// `theta-system-note` channel, registered synchronously inside the extension
// factory body (per extension-bootstrap-and-per-theta.md §"Renderer
// registration"). The renderer constructs a `Component` (NOT a string and NOT
// a React node — a bare-string body silently leaves the channel unrendered)
// from `message.content`, sourcing no hard-coded styling, and returns
// `undefined` when `display === false` (Pi skips rendering that message).
//
// PIC-21's render-time exception-safety wrap (catch-internally / return a
// minimal raw-content `Component`) is owned by this V7d leaf. The factory
// wraps the `pi.registerMessageRenderer` call itself in a per-call
// `try`/`catch` so a registration-time throw never escapes the factory body.

import { wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { Component } from "@earendil-works/pi-tui";
import type { MessageRenderer } from "@earendil-works/pi-coding-agent";

/**
 * A minimal text `Component` that honours the render `width` the TUI supplies.
 * Pi's TUI rejects any rendered line wider than the terminal, so each content
 * line is wrapped (ANSI-aware, preserving any injected styling) to `width`; a
 * blank line is preserved as a single blank line rather than dropped. A
 * non-positive `width` (no width contract available) falls back to the raw
 * lines.
 */
function textComponent(lines: readonly string[]): Component {
  return {
    render: (width: number): string[] => {
      if (!(width > 0)) {
        return [...lines];
      }
      return lines.flatMap((line) => {
        const wrapped = wrapTextWithAnsi(line, width);
        return wrapped.length > 0 ? wrapped : [""];
      });
    },
    invalidate: (): void => {},
  };
}

/**
 * The shared note-body formatting step (PIC-71): given a note's `content` and
 * `display`, produce the very `Component` the `theta-system-note` message
 * renderer draws — `undefined` for `display === false`. The `theta-progress-
 * entry` renderer reuses THIS function so a migrated operator note renders
 * byte-identical lines on either channel.
 *
 * PIC-21 / PIC-56 obligations ride here: an internal throw from the injected
 * `formatLines` step falls back to the raw content lines, and every returned
 * `Component` fits its output to the supplied render width.
 */
export function renderSystemNoteBody(
  content: string,
  display: boolean | undefined,
  formatLines?: (content: string) => readonly string[],
): Component | undefined {
  try {
    if (display === false) {
      return undefined;
    }
    const lines = formatLines ? formatLines(content) : content.split("\n");
    return textComponent(lines);
  } catch (e: unknown) { // allow-broad-catch: PIC-21 — runtime-event-channel.md / extension-bootstrap-and-per-theta.md#pic-21
    // PIC-21: trap any internal renderer-body failure. `display === false`
    // still renders nothing; otherwise fall back to the raw content lines.
    void e;
    if (display === false) {
      return undefined;
    }
    return textComponent(content.split("\n"));
  }
}

/**
 * RFC 0015 (D6, decision 5) — the `Running /<name>` note-class discriminator.
 *
 * The binder success echo is one of the channel's INFORMATIONAL notes
 * (runtime-event-channel.md §"Informational notes carry no `details`"): its
 * wire shape is pinned as `details`-ABSENT (bug 0401's byte contract), so the
 * payload could not grow a class marker without changing the LLM-context /
 * print/json bytes decision 5 requires byte-identical. The discriminator is
 * therefore CONTENT-SHAPE + details-absence:
 *
 *  - `content` starts with the verbatim `Running /` prefix — produced only by
 *    `renderArgumentEcho` (src/render/argument-echo.ts), the echo's single
 *    template owner;
 *  - `details` is absent — which excludes every five-shape `details` note
 *    whose free-text content could conceivably collide (a diagnostics batch's
 *    serialised message lines, an event template, …).
 *
 * No other details-less informational note's template starts with
 * `Running /` (they all open `theta …` / `theta: …` / `'system:' …`), so the
 * pair is exact today; a future informational note MUST NOT adopt the
 * `Running /` prefix without revisiting decision 5's hiding rule.
 */
export function isRunningEchoNote(content: string, details: unknown): boolean {
  return details === undefined && content.startsWith("Running /");
}

/**
 * Construction dependencies for the `theta-system-note` renderer. `formatLines`
 * is the dim-styling step PIC-21 wraps: a throw from it is an internal
 * renderer failure the V7d hardening catches, falling back to the raw
 * `message.content` rendering. Absent, the renderer renders raw content lines.
 */
export interface SystemNoteRendererDeps {
  readonly formatLines?: (content: string) => readonly string[];
}

/**
 * Construct the `theta-system-note` renderer. Returns `undefined` for
 * `display === false` messages (Pi skips them); otherwise returns a text
 * `Component` rendering the message's string content.
 *
 * PIC-21: an internal renderer-body throw (e.g. from the injected
 * `formatLines` dim-styling step) MUST NOT escape the `MessageRenderer`
 * invocation. On such a throw the renderer falls back to a minimal `Component`
 * rendering the raw `message.content` for `display === true` and `undefined`
 * for `display === false`, and emits no `theta/runtime/*` diagnostic (the
 * factory takes no diagnostics sink, so that property holds by construction).
 */
export function createSystemNoteRenderer(
  deps?: SystemNoteRendererDeps,
): MessageRenderer {
  return (message, _options, _theme): Component | undefined => {
    const content =
      typeof message.content === "string" ? message.content : "";
    // RFC 0015 (D6, decision 5): the `Running /<name>` binder echo is hidden
    // in TUI entirely. The hide MUST be a zero-output Component, NOT
    // `undefined`: the host's `CustomMessageComponent.rebuild()` (pi
    // dist/modes/interactive/components/custom-message.js) treats a falsy
    // renderer return as "no custom rendering" and FALLS THROUGH to the
    // default purple box with a `[theta-system-note]` label and the raw
    // content — louder than pre-D6, the opposite of hidden. Returning a
    // component whose `render` yields zero lines (the same zero-line trick
    // `captureTuiRenderHandle` uses) makes the host adopt it and draw
    // nothing. Residual: the host constructor adds an unconditional
    // `Spacer(1)` sibling that `rebuild()` never removes, so a hidden note
    // still occupies ONE blank line (recorded in PIC-77). Every OTHER note
    // class (err notes, cancelled, panics, binder failures, diagnostics
    // batches…) renders exactly as before; the channel emission itself is
    // untouched (see `isRunningEchoNote`).
    if (isRunningEchoNote(content, message.details)) {
      return { render: (): string[] => [], invalidate: (): void => {} };
    }
    return renderSystemNoteBody(content, message.display, deps?.formatLines);
  };
}
