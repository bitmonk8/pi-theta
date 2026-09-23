// The `theta-system-note` wire/contract vocabulary — the channel
// `customType`, the note/details payload shapes, the narrow send/toast seams
// (`SystemNoteSender`, `UiNotifier`), the wire serializer, the channel
// construction deps, and the shared inert deps. Homed in diagnostics/ (the
// cross-layer vocabulary layer, like diagnostic.ts) so lexer/parser/binder/
// runtime producers that emit notes depend on this contract rather than
// upward on the extension layer. The delivery/fallback mechanics
// (`sendSystemNote`, `RendererGate`, `SystemNoteChannelHealth`,
// `emitDiagnosticBatch`) stay in extension/system-note-channel.ts, which
// re-exports this contract for its existing importers.

import type { Diagnostic } from "./diagnostic";

/** The theta-internal system-note renderer channel `customType`. */
export const SYSTEM_NOTE_CHANNEL = "theta-system-note";

/**
 * The five normative `details` payload shapes the `theta-system-note` channel
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
  | { readonly recovery: { readonly thetas: readonly string[] } }
  // The per-invocation clean-cancel note's closed session-shutdown payload; the
  // `{ reason, theta, invocation_id }` field shape is owned by
  // diagnostic-shape.md#session-shutdown-details-conventions (bug 0432).
  | { readonly shutdown: Record<string, unknown> };

/**
 * A `theta-system-note` to deliver through the best-effort channel.
 *
 * `details` is OPTIONAL: an informational note (bug 0401) carries NO
 * `details` key on the wire — that details-ABSENT wire shape is normative,
 * so this chain type widens to match it. The closed `SystemNoteDetails` union
 * above is unchanged; there is no "absent" arm because absence is
 * `undefined`/omission, not a union member.
 */
export interface SystemNote {
  readonly content: string;
  readonly display: boolean;
  readonly details?: SystemNoteDetails;
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
      // Optional to mirror `SystemNote.details` (bug 0437 §Fix): an
      // informational note (bug 0401) omits this key on the wire entirely.
      readonly details?: SystemNoteDetails;
    },
    options: { readonly triggerTurn: false },
  ): void;
}

/** Serialize the system-note wire envelope without materialising absent details. */
export function serializeSystemNote(
  customType: string,
  content: string,
  display: boolean,
  details: SystemNoteDetails | undefined,
): Parameters<SystemNoteSender["sendMessage"]>[0] {
  // Bug 0437 §Fix: an informational note's `details` is `undefined`
  // (bug 0401's details-ABSENT wire contract). `exactOptionalPropertyTypes`
  // forbids writing `details: undefined` onto the wire message, and the
  // 0401 byte contract requires the KEY itself absent (`"details" in note`
  // must be `false`), not merely `undefined`-valued — so the key is
  // conditionally spread rather than always assigned.
  return {
    customType,
    content,
    display,
    ...(details !== undefined ? { details } : {}),
  };
}

/**
 * The transient toast surface (`ctx.ui`) the fallback chain calls — the only
 * member theta touches is `notify(message, "error")` (synchronous, may throw).
 */
export interface UiNotifier {
  notify(message: string, type: "error"): void;
}

/**
 * The structural surface of the renderer-availability gate the contract
 * consumes — `available()` only. The stateful gate itself (`RendererGate`,
 * whose factory-owned `degrade()` arm is delivery mechanics) lives in
 * extension/system-note-channel.ts and satisfies this shape.
 */
export interface SystemNoteRendererGate {
  available(): boolean;
}

/**
 * The structural surface of the per-channel delivery-health state (bug 0018,
 * PIC-67) the contract consumes. The stateful latch itself
 * (`SystemNoteChannelHealth`) lives in extension/system-note-channel.ts and
 * satisfies this shape.
 */
export interface SystemNoteChannelHealthState {
  /** The recorded stale-ctx error once the channel is dead, else `undefined`. */
  staleError(): Error | undefined;
  /** Mark the channel permanently dead (first stale error wins; idempotent). */
  markStale(error: Error): void;
  /**
   * Claim the single PIC-54 terminal `console.error` slot: `true` exactly once
   * (the caller logs), `false` thereafter (the caller suppresses).
   */
  claimTerminalLog(): boolean;
}

/**
 * The structural subset of the RFC 0010 `theta-progress-entry` entry channel
 * the note contract consumes (`live()` / `append()`). The full
 * `EntryChannelHandle` — with the milestone/run-card appenders — lives in
 * extension/execution-status/entry-channel.ts and satisfies this shape.
 */
export interface SystemNoteEntryChannel {
  /** `true` iff both surfaces are present AND the renderer registered without throwing. */
  live(): boolean;
  /** `true` = delivered as an entry; `false` = caller falls back to `sendMessage`. */
  append(note: SystemNote): boolean;
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
   * Bug 0453: the display-aware off-channel realization of the step-2
   * delivery-failed diagnostic. When present, `sendSystemNote` routes step 2
   * here with the originating note's `display`, so a `display: false` note's
   * content is NOT toasted (runtime-event-channel.md best-effort fallback steps
   * 1–2) — it goes stderr-only (headless) / silent (UI), while the structured
   * diagnostic is still carried (message = content, fallback step 2). Absent
   * means the pre-0453 `emitDiagnostic` path (display-unaware); lightweight
   * test doubles may omit it.
   */
  readonly emitDeliveryFailed?: (
    diagnostic: Diagnostic,
    originatingDisplay: boolean,
  ) => void;
  /**
   * The renderer-availability gate (V9p). When present and degraded
   * (`available() === false`), a `display: true` note routes straight through
   * the `ctx.ui.notify` arm — the renderer that would render a
   * `theta-system-note` failed to register, so delivering it to the transcript
   * would render nothing; a `display: false` note is renderer-independent (it
   * is never rendered — its value is the structured payload) and proceeds
   * through the normal `pi.sendMessage` arm regardless of the gate. Absent (or
   * available) means the steady-state `pi.sendMessage`-first path for every
   * note. Consumed by the paired V9p implementation.
   */
  readonly rendererGate?: SystemNoteRendererGate;
  /**
   * Bug 0018 (PIC-67): the per-channel delivery-health state (stale-dead latch
   * + fail-loud-once terminal-log latch). Optional so lightweight test doubles
   * need not supply it; absent means the pre-0018 behaviour (no stale latch,
   * unbounded terminal logging) except that a recognised stale-ctx send error
   * still rethrows rather than re-entering the equally-stale `ctx.ui` fallback.
   */
  readonly health?: SystemNoteChannelHealthState;
  /**
   * RFC 0010 (PIC-71/72): the `theta-progress-entry` entry channel, when this
   * host exposes both entry members. The three OPERATOR-FACING note classes
   * (parse/load/type diagnostic batches, structural-change notes, binder-model
   * recovery notes) deliver through {@link deliverOperatorNotePreferringEntry}
   * first, because an entry never enters provider replay and so cannot land
   * between an assistant `tool_use` and its `tool_result` (bug 0469). Absent
   * (or dead) means the pre-migration `pi.sendMessage` realization owns
   * delivery for those classes too; every OTHER emitter is unchanged either
   * way.
   */
  readonly entryChannel?: SystemNoteEntryChannel;
}

/**
 * The shared inert note-channel deps (the PTQ-1237 consolidation): a
 * fresh, all-no-op `SystemNoteChannelDeps` per call for lex/parse paths
 * that read diagnostics off the returned result (or deliberately discard
 * them) and must not re-announce through the channel — snippet re-lexing in
 * the document parser, and the RFC 0015 run-card's re-lex of a script that
 * already lexed (and already noted) at drive start. Fresh per call keeps
 * callers free of shared state — no module-level mutable channel.
 */
export function inertSystemNoteChannel(): SystemNoteChannelDeps {
  return {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
}
