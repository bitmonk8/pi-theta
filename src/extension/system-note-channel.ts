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
//
// The channel's wire/contract vocabulary (`SYSTEM_NOTE_CHANNEL`, the
// note/details shapes, `SystemNoteChannelDeps`, `inertSystemNoteChannel`, …)
// is homed in diagnostics/system-note.ts and re-exported here for this
// module's existing importers; this module owns the delivery mechanics only.

import {
  renderDiagnosticBatch,
  toPosixFileSpelling,
  type Diagnostic,
} from "../diagnostics/diagnostic";
import {
  SYSTEM_NOTE_CHANNEL,
  serializeSystemNote,
  type SystemNote,
  type SystemNoteChannelDeps,
  type SystemNoteDetails,
  type SystemNoteSender,
} from "../diagnostics/system-note";
import { isStaleCtxError } from "./stale-ctx";

export * from "../diagnostics/system-note";

/**
 * Spell a single diagnostic's `file` / `related[].file` with the pinned POSIX
 * convention, rebuilding the `Diagnostic` only when a spelling actually
 * changes (bug 0268 §Fix constraint 2 — every other field, including object
 * identity when nothing moves, is carried through unchanged).
 */
function normaliseDiagnosticSpelling(diagnostic: Diagnostic): Diagnostic {
  const file =
    diagnostic.file === undefined ? undefined : toPosixFileSpelling(diagnostic.file);
  let relatedChanged = false;
  const related = diagnostic.related?.map((site) => {
    const normalised = toPosixFileSpelling(site.file);
    if (normalised === site.file) {
      return site;
    }
    relatedChanged = true;
    return { ...site, file: normalised };
  });
  if (file === diagnostic.file && !relatedChanged) {
    return diagnostic;
  }
  // `exactOptionalPropertyTypes` forbids assigning `file: undefined` onto the
  // optional `file?: string` field, so the located/file-only/location-less
  // categories (diagnostic-shape.md "Internal diagnostic shape") are rebuilt
  // by presence rather than by a single object-spread carrying `file` always.
  const rebuilt: Diagnostic =
    file === undefined ? { ...diagnostic } : { ...diagnostic, file };
  return related === undefined ? rebuilt : { ...rebuilt, related };
}

/**
 * Spell every `details.diagnostics[].file` / `.related[].file` with the
 * pinned POSIX convention (bug 0268 §Fix constraint 1) so the structured
 * payload agrees with the rendered `content` string. Keys ONLY on the
 * `diagnostics` shape — the `event` / `structural` / `recovery` / `shutdown`
 * shapes carry author- and host-supplied strings that are not `Diagnostic.file`
 * and pass through byte-identical.
 */
function normaliseDetailsFileSpelling(
  details: SystemNoteDetails | undefined,
): SystemNoteDetails | undefined {
  // Bug 0437 §Fix: an informational note (bug 0401) carries NO `details` on
  // the wire at all — `undefined` means "omit the key", not "the diagnostics
  // shape with nothing in it", so this normaliser must pass `undefined`
  // through rather than dereference into the closed union below.
  if (details === undefined) {
    return undefined;
  }
  if (!("diagnostics" in details)) {
    return details;
  }
  let changed = false;
  const diagnostics = details.diagnostics.map((diagnostic) => {
    const normalised = normaliseDiagnosticSpelling(diagnostic);
    if (normalised !== diagnostic) {
      changed = true;
    }
    return normalised;
  });
  // Already-POSIX payloads are the common case, so the caller keeps its own
  // object identity rather than an equal copy when no row's spelling moved.
  return changed ? { diagnostics } : details;
}

/**
 * One note re-spelled under the pinned POSIX `file` convention (bug 0268
 * §Fix constraint 1), keeping the caller's own object identity — and, with it
 * bug 0401's details-ABSENT wire shape — whenever no spelling moved.
 */
function withNormalisedFileSpelling(note: SystemNote): SystemNote {
  const details = normaliseDetailsFileSpelling(note.details);
  // `undefined` can only come back when the note carried no `details` key at
  // all, so an unchanged payload (the common case) returns the note itself and
  // the key is never materialised as `details: undefined`.
  if (details === undefined || details === note.details) {
    return note;
  }
  return { ...note, details };
}

/** Extract a human-readable message from an arbitrary thrown value. */
function throwMessage(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

/**
 * Bug 0437 §Fix: the pi-built fallback `SystemNoteChannelDeps` shared by every
 * site that resolves an extension-instance channel — used when the composition
 * root wired no `systemNoteChannel`, so a bare-`pi` harness (the bug doc's
 * §Reproduction shape) still gets a working fallback chain rather than a raw
 * `pi.sendMessage` throw. No real `ctx.ui` seam reaches these callers: a
 * production instance always wires a real channel (this fallback is a
 * harness-only degrade, never the live path), and `sendSystemNote`'s
 * `ui.notify` arm is itself best-effort, so the no-op only costs the toast
 * half of the fallback on that harness-only path — never the delivery-failed
 * diagnostic or terminal log.
 */
export function buildPiFallbackSystemNoteChannel(
  sender: SystemNoteSender,
  emitDiagnostic: (diagnostic: Diagnostic) => void,
): SystemNoteChannelDeps {
  return {
    pi: {
      sendMessage: (message, options): void => {
        sender.sendMessage(message, options);
      },
    },
    emitDiagnostic,
    ui: {
      notify: (): void => {},
    },
  };
}

/**
 * The diagnostics-registry code the delivery-failure fallback emits, per the
 * `theta/runtime/system-note-delivery-failed` row in
 * diagnostics/code-registry-runtime.md.
 */
export const SYSTEM_NOTE_DELIVERY_FAILED_CODE =
  "theta/runtime/system-note-delivery-failed";

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

/**
 * PIC-72: deliver one operator-facing note, preferring the LLM-context-free
 * entry channel and falling back to the unchanged `pi.sendMessage`
 * realization. Exactly one channel realizes each note — never both (the
 * channel change must not double-render), never neither (a dead/absent channel
 * always falls back, so no class is silently dropped). No dedup on either
 * channel: a re-scan re-emits (diagnostic-shape.md re-scan rule).
 */
export function deliverOperatorNotePreferringEntry(
  note: SystemNote,
  deps: SystemNoteChannelDeps,
): void {
  // PIC-71 requires the entry payload to carry the SAME payload as its
  // message-channel realization, so bug 0268 §Fix constraint 1's POSIX `file`
  // spelling is applied HERE — once, above the channel branch — rather than
  // inside either channel: `sendSystemNote`'s own normalisation would leave an
  // entry-delivered note carrying the mint sites' raw Win32 spellings in
  // `details.diagnostics[].file` while its rendered `content` (already POSIX
  // via `renderDiagnosticLine`) disagreed with it.
  const spelled = withNormalisedFileSpelling(note);
  if (deps.entryChannel !== undefined && deps.entryChannel.live()) {
    if (deps.entryChannel.append(spelled)) {
      return;
    }
  }
  sendSystemNote(spelled, deps);
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
  // persistent-transcript renderer is unavailable and delivering a
  // `display: true` note via `pi.sendMessage` would render nothing. Skip the
  // transcript arm for such notes and route straight through the
  // `ctx.ui.notify` arm of the System-notes fallback chain
  // (extension-bootstrap-and-per-theta.md §"`pi.registerMessageRenderer`
  // failure"). The renderer failure already emitted one
  // `theta/load/extension-bootstrap-failed` diagnostic at factory time, so no
  // per-note delivery-failed diagnostic fires for this expected degraded
  // route; only a throwing toast falls to the terminal `console.error`
  // (PIC-54). A `display: false` note is never rendered — its transcript
  // delivery does not involve the renderer at all — so it is carved out of
  // this branch entirely and falls through to the normal `pi.sendMessage` arm
  // below, which remains functional (only registration of the renderer
  // failed).
  if (deps.rendererGate?.available() === false && note.display !== false) {
    if (note.content !== "") {
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
    const normalisedDetails = normaliseDetailsFileSpelling(note.details);
    deps.pi.sendMessage(
      serializeSystemNote(SYSTEM_NOTE_CHANNEL, note.content, note.display, normalisedDetails),
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
      const deliveryFailed: Diagnostic = {
        severity: "error",
        code: SYSTEM_NOTE_DELIVERY_FAILED_CODE,
        message: note.content,
        hint: throwMessage(sendError),
      };
      // Bug 0453: the off-channel realization must honour the originating note's
      // display gate across the WHOLE fallback (runtime-event-channel.md
      // best-effort fallback steps 1–2) — a display:false note's gated content
      // MUST NOT surface transiently on any arm, though the structured
      // diagnostic is still carried (message=content, fallback step 2). A
      // display-aware sink skips the toast for display:false and delegates to
      // the toast/stderr router for display:true; doubles without it keep the
      // pre-0453 display-unaware emitDiagnostic path.
      if (deps.emitDeliveryFailed !== undefined) {
        deps.emitDeliveryFailed(deliveryFailed, note.display);
      } else {
        deps.emitDiagnostic(deliveryFailed);
      }
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
  // One note per `.theta` scan carrying the full batch — no per-error fan-out.
  // Content is the serialised batch; `details.diagnostics` carries the full
  // `Diagnostic[]`. A re-scan re-emits with no dedup / supersede (a second call
  // is a second delivery). PIC-72: the batch class is entry-first, so this one
  // swap migrates every batch emitter with no caller edits.
  deliverOperatorNotePreferringEntry(
    {
      content: renderDiagnosticBatch(diagnostics),
      display: true,
      details: { diagnostics },
    },
    deps,
  );
}
