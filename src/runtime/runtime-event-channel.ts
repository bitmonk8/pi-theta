// V9d / V9d-T — the runtime-event channel and `masked` hard-ceiling co-fire.
//
// This module owns the group-A `details: { event: RuntimeEvent }` runtime-event
// shape, the `display`/`content` matrix across the four `details` variants, the
// always-log set with its success-side null-policy, the group-A/B single-shape
// routing, the dedup tuple, and the PIC-1 `masked` co-fire field
// (pi-integration-contract/runtime-event-channel.md §"Runtime event channel"
// and §PIC-1).
//
// V9d-T (tests-task) declares the seam shapes and stubs every behaviour-bearing
// function inertly — builders that return a wrong-display / sentinel-content
// note, a `computeMasked` that returns a sentinel id, emit helpers that emit
// nothing, a `cascadeReemit` that strips `masked`, and a `dedupKey` that wrongly
// includes `masked` — so the failing tests red on their own primary assertions.
// The paired V9d implementation leaf fills these in.

import type { Diagnostic } from "../diagnostics/diagnostic";
import {
  sendSystemNote,
  type SystemNote,
  type SystemNoteChannelDeps,
} from "../extension/system-note-channel";

// --- RuntimeEvent payload shape (additive-only) ----------------------------

/**
 * The normative group-A runtime-event payload, carried as
 * `details: { event: RuntimeEvent }` (runtime-event-channel.md §"Runtime event
 * channel"). Declared as a `type` alias (not an `interface`) so it carries an
 * implicit index signature and remains assignable to the channel's
 * `{ event: Record<string, unknown> }` detail arm.
 */
export type RuntimeEvent = {
  /** A group-A `QueryError.kind` value or binder failure cause; never a `loom/runtime/*` panic code. */
  kind: string;
  /** Diagnostic code when one applies (`loom/runtime/*`, `loom/load/*`, …). */
  code?: string;
  /** Slash name of the loom that owned the failure (e.g. `/code-review`). */
  loom: string;
  /** Per-invocation UUID (canonical lowercase 8-4-4-4-12 hex). */
  invocation_id: string;
  /** Source location of the `@`-template / tool call / invoke; absent for binder failures. */
  query_site?: { file: string; line: number; column: number };
  /** Source location of the discarding `let _ =` / `void`-tail; present only on discarded-query events. */
  discard_site?: { file: string; line: number; column: number };
  /** The message string surfaced through the user-facing template. */
  message: string;
  /** Populated for `validation` events on respond-repair exhaustion. */
  attempts?: number;
  /** Populated for `context_overflow` events when the provider supplies the count. */
  tokens_used?: number;
  /** Hard-ceiling co-fire enumeration (PIC-1); omitted when no co-fire occurred. */
  masked?: readonly string[];
  /** Unix epoch ms, stamped at the originating emission site via `Clock.wallNow()`. */
  occurred_at: number;
};

// --- Closed identifier sets ------------------------------------------------

/**
 * PIC-1 clause (a): the closed four-element identifier set each `masked` entry
 * is drawn from, naming a sibling hard ceiling.
 */
export const MASKED_CEILING_IDS = [
  "ceiling#1",
  "ceiling#2",
  "ceiling#3",
  "ceiling#4",
] as const;

export type MaskedCeilingId = (typeof MASKED_CEILING_IDS)[number];

/**
 * The group-A `QueryError.kind` members of the always-log set (the Group A
 * enumeration; binder failure causes are also group-A but route via a separate
 * source). `validation`, `context_overflow`, `cancelled`, and `invoke_callee`
 * are deliberately excluded.
 */
export const GROUP_A_KINDS = [
  "transport",
  "model_tool",
  "code_tool",
  "tool_loop_exhausted",
  "invoke_infra",
] as const;

/** The four QueryError kinds deliberately NOT in the always-log set. */
export const NON_ALWAYS_LOG_KINDS = [
  "validation",
  "context_overflow",
  "cancelled",
  "invoke_callee",
] as const;

// --- masked V1 reachable predicate (PIC-1 clauses c, d) --------------------

/** Inputs to the PIC-1 V1 reachable predicate; both scalars the tool-loop driver maintains. */
export interface MaskedPredicateInput {
  /** The surfacing event kind. */
  readonly kind: string;
  /** For `validation` events: the underlying `ValidationError.cause`. */
  readonly validationCause?: string;
  /** Whether the failure was raised at the typed-query response AJV boundary. */
  readonly atTypedQueryResponse: boolean;
  /** The surfacing turn kind. */
  readonly turnKind: "forced_respond" | "free_phase";
  /** Post-increment `tool_loop` slot count after CIO-4's increment. */
  readonly toolLoopSlotCount: number;
  /** The configured `tool_loop.max_rounds`. */
  readonly maxRounds: number;
}

/**
 * PIC-1 clauses (c)/(d): compute the per-site reachable `masked` value. In loom
 * 1.0 the only non-empty reachable mask is `["ceiling#2"]`, on a `validation`
 * event whose `cause` is `"schema_validation"` raised at the typed-query
 * response boundary, on a forced respond turn whose post-increment slot count
 * equals `max_rounds` (and `max_rounds > 0`). Every other surface omits
 * `masked` — returns `undefined`, never `[]` (clause (b)).
 *
 * This MUST be a pure read (clause (e)): evaluating it causes no emission and
 * mutates no per-frame state.
 */
export function computeMasked(
  _input: MaskedPredicateInput,
): readonly string[] | undefined {
  // STUB (V9d-T): a sentinel id outside the closed set so the reachable-domain,
  // omit-when-empty, and closed-id-set assertions all red.
  return ["<unimplemented>"];
}

// --- dedup tuple (PIC-1 clause g) ------------------------------------------

/**
 * The dedup tuple key `(kind, query_site, message, occurred_at)` per
 * §"Deduplication and lifetime rules". PIC-1 clause (g): `masked` MUST NOT be
 * part of the dedup tuple — two emissions differing only in `masked` are the
 * same occurrence.
 */
export function dedupKey(event: RuntimeEvent): string {
  // STUB (V9d-T): wrongly includes `masked`, so two events differing only in
  // `masked` produce different keys and the non-inclusion assertion reds.
  return JSON.stringify({
    kind: event.kind,
    query_site: event.query_site ?? null,
    message: event.message,
    occurred_at: event.occurred_at,
    masked: event.masked ?? null,
  });
}

/**
 * PIC-1 clause (f): the cascade-twin re-emission copies the originating
 * `RuntimeEvent` instance verbatim — including `masked` and `occurred_at` —
 * rather than re-deriving the predicate at the boundary.
 */
export function cascadeReemit(event: RuntimeEvent): RuntimeEvent {
  // STUB (V9d-T): strips `masked`, so the verbatim-copy assertion reds.
  const copy: RuntimeEvent = { ...event };
  delete copy.masked;
  return copy;
}

// --- always-log set membership + group routing -----------------------------

/**
 * Whether a `QueryError.kind` is a group-A always-log member (the five Group A
 * kinds). The four §"deliberately not in the always-log set" kinds return
 * `false`.
 */
export function isAlwaysLogKind(_kind: string): boolean {
  // STUB (V9d-T): always false, so the group-A membership assertions red.
  return false;
}

/**
 * Group-A/B routing: a group-A `QueryError.kind` or binder failure cause routes
 * to `"A"` (the `details: { event }` shape); a `loom/runtime/*` panic code
 * routes to `"B"` (the `details: { diagnostics }` shape). A given failure routes
 * through exactly one shape — no fan-out.
 */
export function alwaysLogGroup(
  _failure: { readonly kind?: string; readonly code?: string },
): "A" | "B" {
  // STUB (V9d-T): always "B", so the group-A routing assertion reds.
  return "B";
}

// --- `details` builders (the display/content matrix) -----------------------

const STUB_CONTENT = "<runtime-event-channel: unimplemented>";

/** Context for building a group-A runtime-event note. */
export interface RuntimeEventEmitContext {
  /**
   * `true` when the failure cascades out as a top-level `Err` at the
   * slash-dispatch boundary (slash caller, no invoke parent) → `display: true`;
   * `false` when author-handled or a subagent-mode invoke-reached cascade →
   * `display: false`.
   */
  readonly topLevelCascade: boolean;
  /** The normative user-facing template (SLSH-3) used as `content` when `display: true`. */
  readonly userFacingTemplate: string;
}

/**
 * Matrix row: `details: { event }`. `display` is the cascade flag; `content` is
 * the user-facing template when `display: true`, the empty string (verbatim)
 * when `display: false`.
 */
export function buildRuntimeEventNote(
  event: RuntimeEvent,
  _ctx: RuntimeEventEmitContext,
): SystemNote {
  // STUB (V9d-T): wrong display + sentinel content so both the cascade and the
  // author-handled rows red.
  return { content: STUB_CONTENT, display: false, details: { event } };
}

/**
 * Matrix row: `details: { diagnostics }`, parse / load / type batch.
 * `display: true`; `content` is the serialised batch lines.
 */
export function buildDiagnosticsBatchNote(
  diagnostics: readonly Diagnostic[],
  _content: string,
): SystemNote {
  // STUB (V9d-T): wrong display so the matrix row reds.
  return { content: STUB_CONTENT, display: false, details: { diagnostics } };
}

/**
 * Matrix row: `details: { diagnostics: [Diagnostic] }`, runtime panic.
 * `display: true`; `content` is the `"loom /<name> aborted: <message>"` framing.
 */
export function buildPanicNote(
  diagnostic: Diagnostic,
  _framing: string,
): SystemNote {
  // STUB (V9d-T): wrong display so the matrix row reds.
  return {
    content: STUB_CONTENT,
    display: false,
    details: { diagnostics: [diagnostic] },
  };
}

/**
 * Matrix row: `details: { structural: { added; removed } }`. `display: true`
 * always; `content` is the verbatim structural-change template.
 */
export function buildStructuralNote(
  structural: { readonly added: readonly string[]; readonly removed: readonly string[] },
  _content: string,
): SystemNote {
  // STUB (V9d-T): wrong display so the matrix row reds.
  return { content: STUB_CONTENT, display: false, details: { structural } };
}

/**
 * Matrix row: `details: { recovery: { looms } }`. `display: true` always;
 * `content` is the verbatim binder-model hot-reload template.
 */
export function buildRecoveryNote(
  looms: readonly string[],
  _content: string,
): SystemNote {
  // STUB (V9d-T): wrong display so the matrix row reds.
  return {
    content: STUB_CONTENT,
    display: false,
    details: { recovery: { looms } },
  };
}

// --- emission entry points -------------------------------------------------

/**
 * Emit a group-A runtime event exactly once through the `loom-system-note`
 * channel, attaching `masked` per the V1 reachable predicate at the originating
 * site. An occurrence produces exactly one always-log emission at its origin.
 */
export function emitRuntimeEvent(
  _event: RuntimeEvent,
  _ctx: RuntimeEventEmitContext,
  _deps: SystemNoteChannelDeps,
): void {
  // STUB (V9d-T): emits nothing, so the exactly-once / routing assertions red.
  void sendSystemNote;
}

/**
 * Emit a group-B runtime panic exactly once through the `loom-system-note`
 * channel as a single-element `details: { diagnostics }` batch.
 */
export function emitPanic(
  _diagnostic: Diagnostic,
  _framing: string,
  _deps: SystemNoteChannelDeps,
): void {
  // STUB (V9d-T): emits nothing, so the exactly-once / routing assertions red.
}

/**
 * Success-side null-policy: a loom terminating with `Ok(v)` emits no
 * `loom-system-note` keyed on the `Ok(v)` outcome. Returns `null` — there is no
 * always-log entry whose emission predicate is satisfied by a success.
 */
export function successSideNote(): SystemNote | null {
  // STUB (V9d-T): returns a non-null note so the null-policy assertion reds.
  return { content: STUB_CONTENT, display: true, details: { recovery: { looms: [] } } };
}
