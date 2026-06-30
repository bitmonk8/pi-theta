// V7d / V7d-T — the `loom-system-note` delivery channel.
//
// This module owns the delivery-side `loom-system-note` `sendMessage`
// envelope, the multi-error batching (one `sendMessage` per `.loom` carrying
// the full `Diagnostic[]` assembled by V7a), the producer-facing
// diagnostic-emission seam, and the best-effort fallback chain
// (`sendSystemNote` → `ctx.ui.notify` → `loom/runtime/system-note-delivery-failed`
// → terminal `console.error`) per
// pi-integration-contract/runtime-event-channel.md §"System notes" and PIC-54.
//
// The V7d implementation fills in the delivery / fallback behaviour the
// V7d-T tests-task declared.

import { renderDiagnosticBatch, type Diagnostic } from "../diagnostics/diagnostic";

/** Extract a human-readable message from an arbitrary thrown value. */
function throwMessage(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

/** The loom-internal system-note renderer channel `customType`. */
export const SYSTEM_NOTE_CHANNEL = "loom-system-note";

/**
 * The diagnostics-registry code the delivery-failure fallback emits, per the
 * `loom/runtime/system-note-delivery-failed` row in
 * diagnostics/code-registry-runtime.md.
 */
export const SYSTEM_NOTE_DELIVERY_FAILED_CODE =
  "loom/runtime/system-note-delivery-failed";

/**
 * The four normative `details` payload shapes the `loom-system-note` channel
 * carries, distinguished by which key is present (runtime-event-channel.md
 * §"system-note-details-shapes"). The shapes are disjoint by key.
 */
export type SystemNoteDetails =
  | { readonly diagnostics: readonly Diagnostic[] }
  | { readonly event: Record<string, unknown> }
  | {
      readonly structural: {
        readonly added: readonly string[];
        readonly removed: readonly string[];
      };
    }
  | { readonly recovery: { readonly looms: readonly string[] } };

/** A `loom-system-note` to deliver through the best-effort channel. */
export interface SystemNote {
  readonly content: string;
  readonly display: boolean;
  readonly details: SystemNoteDetails;
}

/**
 * The narrow `pi.sendMessage` subset the channel calls — `pi.sendMessage`
 * returns `void` (synchronous); the runtime MUST NOT `await` it. The V7d
 * implementation adapts the host `ExtensionAPI.sendMessage` to this seam.
 */
export interface SystemNoteSender {
  sendMessage(
    message: {
      readonly customType: string;
      readonly content: string;
      readonly display: boolean;
      readonly details: SystemNoteDetails;
    },
    options: { readonly triggerTurn: false },
  ): void;
}

/**
 * The transient toast surface (`ctx.ui`) the fallback chain calls — the only
 * member loom touches is `notify(message, "error")` (synchronous, may throw).
 */
export interface UiNotifier {
  notify(message: string, type: "error"): void;
}

/**
 * The renderer-availability gate shared between the extension factory and the
 * System-notes fallback chain. The factory degrades it once, permanently, when
 * the factory-time `pi.registerMessageRenderer` registration fails
 * (extension-bootstrap-and-per-loom.md §"`pi.registerMessageRenderer` failure"):
 * the persistent-transcript surface (the `loom-system-note` renderer) is then
 * unavailable, so the System-notes fallback chain degrades to the
 * `ctx.ui.notify` arm — `sendSystemNote` skips the `pi.sendMessage` arm and
 * routes through `ctx.ui.notify` for the remaining lifetime of this extension
 * instance. Constructed once per extension instance and injected (no
 * module-level state), so a fresh `/reload` instance starts with the renderer
 * available again.
 *
 * V9p-T declares this seam; the paired V9p implementation wires the factory's
 * renderer-failure path to call `degrade()` and `sendSystemNote` to consult
 * `available()`.
 */
export class RendererGate {
  /** True until the renderer registration fails; then permanently false. */
  #rendererAvailable = true;

  /** Whether the persistent-transcript (renderer) arm is still usable. */
  available(): boolean {
    return this.#rendererAvailable;
  }

  /** Permanently degrade system notes to the `ctx.ui.notify` arm. */
  degrade(): void {
    this.#rendererAvailable = false;
  }
}

/** Construction dependencies for the delivery channel. */
export interface SystemNoteChannelDeps {
  /** The `loom-system-note` send seam (adapts `pi.sendMessage`). */
  readonly pi: SystemNoteSender;
  /** The transient toast surface (`ctx.ui`). */
  readonly ui: UiNotifier;
  /** Submit a constructed `Diagnostic` through the standard diagnostics channel. */
  readonly emitDiagnostic: (diagnostic: Diagnostic) => void;
  /**
   * The renderer-availability gate (V9p). When present and degraded
   * (`available() === false`), the persistent-transcript `pi.sendMessage` arm
   * is skipped and the note routes straight through the `ctx.ui.notify` arm —
   * the renderer that would render a `loom-system-note` failed to register, so
   * delivering to the transcript would render nothing. Absent (or available)
   * means the steady-state `pi.sendMessage`-first path. Consumed by the paired
   * V9p implementation.
   */
  readonly rendererGate?: RendererGate;
}

/**
 * Deliver a single `loom-system-note` best-effort, falling back through
 * `ctx.ui.notify` → `loom/runtime/system-note-delivery-failed` → terminal
 * `console.error` (PIC-54) when `pi.sendMessage` throws.
 */
export function sendSystemNote(
  note: SystemNote,
  deps: SystemNoteChannelDeps,
): void {
  try {
    // Best-effort: `pi.sendMessage` returns `void` (synchronous); never await,
    // never attach a `.catch`. Only a synchronous throw is observable.
    deps.pi.sendMessage(
      {
        customType: SYSTEM_NOTE_CHANNEL,
        content: note.content,
        display: note.display,
        details: note.details,
      },
      { triggerTurn: false },
    );
    return;
  } catch (sendError: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
    // Fallback step 1 — transient toast so the user still sees the message in
    // the current session. Skipped when `display: false` (the author handled
    // the underlying `Err`, or it is a subagent-private cascade) and when
    // `content` is `""` (an empty toast carries no signal). A throwing
    // `ctx.ui.notify` (e.g. print mode with no attached UI) is caught and the
    // fallback proceeds to step 2.
    if (note.display !== false && note.content !== "") {
      try {
        deps.ui.notify(note.content, "error");
      } catch (notifyError: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
        void notifyError;
      }
    }

    // Fallback step 2 — a `loom/runtime/system-note-delivery-failed`
    // diagnostic: `message` = the original note's content, `hint` = the
    // underlying throw's message. Itself best-effort: a throw here routes to
    // the terminal `console.error`.
    try {
      deps.emitDiagnostic({
        severity: "error",
        code: SYSTEM_NOTE_DELIVERY_FAILED_CODE,
        message: note.content,
        hint: throwMessage(sendError),
      });
    } catch (emitError: unknown) { // allow-broad-catch: PIC-54 — runtime-event-channel.md#pic-54
      // Terminal `console.error` (PIC-54): wrapped so a throw from it is
      // silently swallowed and never propagates out of the fallback chain,
      // regardless of the reach-path. The original note content and both
      // underlying throws are logged for post-mortem triage.
      try {
        console.error(
          `system-note delivery failed: ${note.content}`,
          sendError,
          emitError,
        );
      } catch (consoleError: unknown) { // allow-broad-catch: PIC-54 — runtime-event-channel.md#pic-54
        void consoleError;
      }
    }
  }
  // The fallback never aborts the slash-command handler or spawned subagent
  // session: control returns normally on every path above.
}

/**
 * The producer-facing diagnostic-emission seam: submit a scan-time batch of
 * `Diagnostic`s for delivery as exactly one `loom-system-note` `sendMessage`
 * (no per-error fan-out). Producers hand `Diagnostic`s here and never call
 * `pi.sendMessage` directly.
 */
export function emitDiagnosticBatch(
  diagnostics: readonly Diagnostic[],
  deps: SystemNoteChannelDeps,
): void {
  // One `loom-system-note` per `.loom` scan carrying the full batch — no
  // per-error fan-out. Content is the serialised batch; `details.diagnostics`
  // carries the full `Diagnostic[]`. A re-scan re-emits with no dedup /
  // supersede (a second call is a second `sendMessage`).
  sendSystemNote(
    {
      content: renderDiagnosticBatch(diagnostics),
      display: true,
      details: { diagnostics },
    },
    deps,
  );
}
