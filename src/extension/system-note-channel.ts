// V7d / V7d-T — the `theta-system-note` delivery channel.
//
// This module owns the delivery-side `theta-system-note` `sendMessage`
// envelope, the multi-error batching (one `sendMessage` per `.theta` carrying
// the full `Diagnostic[]` assembled by V7a), the producer-facing
// diagnostic-emission seam, and the best-effort fallback chain
// (`sendSystemNote` → `ctx.ui.notify` → `theta/runtime/system-note-delivery-failed`
// → terminal `console.error`) per
// pi-integration-contract/runtime-event-channel.md §"System notes" and PIC-54.
//
// The V7d implementation fills in the delivery / fallback behaviour the
// V7d-T tests-task declared.
//
// Bug 0018 (PIC-67) carve-out: the fallback chain applies only to a LIVE
// runtime. A `pi.sendMessage` throw recognised as the host's stale-ctx
// invalidation error (stale-ctx.ts) means the whole runtime — including the
// `ctx.ui` fallback arm — is invalidated; the channel marks itself permanently
// dead and rethrows so the caller quiesces instead of walking a fallback chain
// whose every arm is equally stale.

import { renderDiagnosticBatch, type Diagnostic } from "../diagnostics/diagnostic";
import { isStaleCtxError } from "./stale-ctx";

/** Extract a human-readable message from an arbitrary thrown value. */
function throwMessage(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

/** The theta-internal system-note renderer channel `customType`. */
export const SYSTEM_NOTE_CHANNEL = "theta-system-note";

/**
 * The diagnostics-registry code the delivery-failure fallback emits, per the
 * `theta/runtime/system-note-delivery-failed` row in
 * diagnostics/code-registry-runtime.md.
 */
export const SYSTEM_NOTE_DELIVERY_FAILED_CODE =
  "theta/runtime/system-note-delivery-failed";

/**
 * The four normative `details` payload shapes the `theta-system-note` channel
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
  | { readonly recovery: { readonly thetas: readonly string[] } };

/** A `theta-system-note` to deliver through the best-effort channel. */
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
 * member theta touches is `notify(message, "error")` (synchronous, may throw).
 */
export interface UiNotifier {
  notify(message: string, type: "error"): void;
}

/**
 * The renderer-availability gate shared between the extension factory and the
 * System-notes fallback chain. The factory degrades it once, permanently, when
 * the factory-time `pi.registerMessageRenderer` registration fails
 * (extension-bootstrap-and-per-theta.md §"`pi.registerMessageRenderer` failure"):
 * the persistent-transcript surface (the `theta-system-note` renderer) is then
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

/**
 * Bug 0018 (PIC-67) — per-channel mutable delivery-health state. Constructed
 * once per channel-deps instance and injected (no module-level state), like
 * `RendererGate`:
 *
 *  - **stale-dead latch** — the first `pi.sendMessage` throw recognised as the
 *    host's stale-ctx invalidation error marks the channel permanently dead
 *    (the runtime is invalidated; `ctx.ui` is the SAME invalidated runtime and
 *    is guaranteed equally stale, so no fallback arm can ever deliver again).
 *    A dead channel surfaces the recorded stale error to its caller instead of
 *    touching any invalidated surface.
 *  - **fail-loud-once latch** — the PIC-54 terminal `console.error` fires at
 *    most once per channel instance, so a repeated delivery failure cannot
 *    cascade unboundedly onto stderr.
 */
export class SystemNoteChannelHealth {
  /** The first observed stale-ctx error; `undefined` while the channel is live. */
  #staleError: Error | undefined;
  /** True once the PIC-54 terminal `console.error` has fired for this channel. */
  #terminalLogged = false;

  /** The recorded stale-ctx error once the channel is dead, else `undefined`. */
  staleError(): Error | undefined {
    return this.#staleError;
  }

  /** Mark the channel permanently dead (first stale error wins; idempotent). */
  markStale(error: Error): void {
    this.#staleError ??= error;
  }

  /**
   * Claim the single PIC-54 terminal `console.error` slot: `true` exactly once
   * (the caller logs), `false` thereafter (the caller suppresses).
   */
  claimTerminalLog(): boolean {
    if (this.#terminalLogged) {
      return false;
    }
    this.#terminalLogged = true;
    return true;
  }
}

/** Construction dependencies for the delivery channel. */
export interface SystemNoteChannelDeps {
  /** The `theta-system-note` send seam (adapts `pi.sendMessage`). */
  readonly pi: SystemNoteSender;
  /** The transient toast surface (`ctx.ui`). */
  readonly ui: UiNotifier;
  /** Submit a constructed `Diagnostic` through the standard diagnostics channel. */
  readonly emitDiagnostic: (diagnostic: Diagnostic) => void;
  /**
   * The renderer-availability gate (V9p). When present and degraded
   * (`available() === false`), the persistent-transcript `pi.sendMessage` arm
   * is skipped and the note routes straight through the `ctx.ui.notify` arm —
   * the renderer that would render a `theta-system-note` failed to register, so
   * delivering to the transcript would render nothing. Absent (or available)
   * means the steady-state `pi.sendMessage`-first path. Consumed by the paired
   * V9p implementation.
   */
  readonly rendererGate?: RendererGate;
  /**
   * Bug 0018 (PIC-67): the per-channel delivery-health state (stale-dead latch
   * + fail-loud-once terminal-log latch). Optional so lightweight test doubles
   * need not supply it; absent means the pre-0018 behaviour (no stale latch,
   * unbounded terminal logging) except that a recognised stale-ctx send error
   * still rethrows rather than re-entering the equally-stale `ctx.ui` fallback.
   */
  readonly health?: SystemNoteChannelHealth;
}

/**
 * Deliver a single `theta-system-note` best-effort, falling back through
 * `ctx.ui.notify` → `theta/runtime/system-note-delivery-failed` → terminal
 * `console.error` (PIC-54) when `pi.sendMessage` throws.
 */
export function sendSystemNote(
  note: SystemNote,
  deps: SystemNoteChannelDeps,
): void {
  // Bug 0018 (PIC-67): a channel already marked stale-dead surfaces the
  // recorded stale error WITHOUT touching any `pi.*` / `ctx.*` surface — every
  // guarded member of the invalidated runtime would throw the same error, and
  // re-touching it would only re-witness the invalidation. The throw is the
  // staleness signal callers quiesce on (hot-reload.ts); the compose pass MUST
  // NOT swallow-and-continue against a dead channel.
  const priorStale = deps.health?.staleError();
  if (priorStale !== undefined) {
    throw priorStale;
  }
  // Degraded-instance branch (V9p): when the factory-time
  // `pi.registerMessageRenderer` registration failed the `RendererGate` is
  // permanently degraded for this extension instance, so the
  // persistent-transcript renderer is unavailable and delivering to the
  // transcript via `pi.sendMessage` would render nothing. Skip the transcript
  // arm entirely and route straight through the `ctx.ui.notify` arm of the
  // System-notes fallback chain (extension-bootstrap-and-per-theta.md
  // §"`pi.registerMessageRenderer` failure"). The renderer failure already
  // emitted one `theta/load/extension-bootstrap-failed` diagnostic at factory
  // time, so no per-note delivery-failed diagnostic fires for this expected
  // degraded route; only a throwing toast falls to the terminal
  // `console.error` (PIC-54).
  if (deps.rendererGate?.available() === false) {
    if (note.display !== false && note.content !== "") {
      try {
        deps.ui.notify(note.content, "error");
      } catch (notifyError: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
        // Bug 0018 (PIC-67): a stale-ctx throw from the toast arm means the
        // runtime is invalidated — mark the channel dead and surface it.
        if (isStaleCtxError(notifyError)) {
          deps.health?.markStale(notifyError);
          throw notifyError;
        }
        if (deps.health === undefined || deps.health.claimTerminalLog()) {
          try {
            console.error(
              `system-note delivery failed: ${note.content}`,
              notifyError,
            );
          } catch (consoleError: unknown) { // allow-broad-catch: PIC-54 — runtime-event-channel.md#pic-54
            void consoleError;
          }
        }
      }
    }
    return;
  }
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
    // Bug 0018 (PIC-67): the host's stale-ctx error means the extension runtime
    // was invalidated (session replacement / reload / bare
    // `AgentSession.dispose()`). The `ctx.ui` fallback arm is the SAME
    // invalidated runtime — guaranteed equally stale — so re-entering it can
    // only add stale touches; and the delivery-failed diagnostic would route
    // back through the same dead surfaces. Mark the channel permanently dead
    // and rethrow so the caller quiesces (hot-reload.ts entry probe /
    // belt-and-braces arm) instead of continuing the pass on a dead channel.
    if (isStaleCtxError(sendError)) {
      deps.health?.markStale(sendError);
      throw sendError;
    }
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
        // No stale check here (unlike the degraded arm above): this arm is
        // reached only when `pi.sendMessage` threw NON-stale in the same
        // synchronous tick, and invalidation cannot interleave mid-tick — a
        // stale runtime would have thrown stale from `sendMessage` first.
        void notifyError;
      }
    }

    // Fallback step 2 — a `theta/runtime/system-note-delivery-failed`
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
      // underlying throws are logged for post-mortem triage. Bug 0018
      // (PIC-67): fail-loud-once — with a health latch present the terminal
      // line fires at most once per channel instance so a repeated delivery
      // failure cannot cascade unboundedly onto stderr.
      if (deps.health === undefined || deps.health.claimTerminalLog()) {
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
  }
  // On every live-runtime path above control returns normally — the fallback
  // never aborts the slash-command handler or spawned subagent session. The
  // sole throwing exits are the stale-ctx rethrows (bug 0018, PIC-67), where no
  // valid delivery surface remains and the caller must quiesce.
}

/**
 * The producer-facing diagnostic-emission seam: submit a scan-time batch of
 * `Diagnostic`s for delivery as exactly one `theta-system-note` `sendMessage`
 * (no per-error fan-out). Producers hand `Diagnostic`s here and never call
 * `pi.sendMessage` directly.
 */
export function emitDiagnosticBatch(
  diagnostics: readonly Diagnostic[],
  deps: SystemNoteChannelDeps,
): void {
  // One `theta-system-note` per `.theta` scan carrying the full batch — no
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
