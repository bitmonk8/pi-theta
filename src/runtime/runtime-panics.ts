// V4b / V4b-T — the runtime-panic surface seam.
//
// This module owns the closed theta 1.0 `theta/runtime/*` panic set, QRY-18's
// parse-namespaced interpolation panic, the `?`-operator runtime propagation
// seam that panics bypass, and the runtime-defect surface
// (`theta/runtime/internal-error`) for unexpected interpreter / adapter throws
// (errors-and-results/error-model.md §"Runtime panics"; the registered message
// templates live in diagnostics/code-registry-runtime.md).
//
// Five of the six closed panic sources are owned here — array index-out-of-
// bounds, missing-object-key, null-index-access, null-member-access, and
// `invoke`-chain depth-exceeded; the sixth (non-exhaustive `match`) is the
// `MatchError` panic owned by ./match-result.ts. A panic is a thrown JS
// exception, never a `Result` value, so it bypasses `?` and `match` (which
// operate on `Result` values) — the bypass is intrinsic to representing panics
// as thrown `ThetaPanic` instances rather than as values.
//
// The runtime-defect surface routes an *unexpected* throw (one that is not a
// panic source) to `theta/runtime/internal-error`. The NOCEIL-3 carve-out
// (errors-and-results/error-model.md §"Runtime panics";
// hard-ceilings/ceiling-invariants-and-audit.md §"No additional ceilings"):
// an *uncatchable* host fatal (V8 heap-OOM via the `OOMErrorCallback` /
// `abort()` path) terminates the host process before any wrap can observe it,
// so it delivers no throw to a catch site and `theta/runtime/internal-error`
// emits no diagnostic for it.
//
// V4b-T (tests-task) declared the seam — the `ThetaPanic` base and the five
// panic classes, the `evaluateIndexAccess` / `evaluateMemberAccess` /
// `enterInvokeFrame` accessor seams, the `evaluateQuestion` `?`-propagation
// seam, the `HostFatal` NOCEIL-3 marker, and the `surfaceUnexpectedThrow`
// runtime-defect surface; V4b (this leaf) supplies the behaviour: the accessors
// raise their panics, `?` propagates or lets a panic through, and the
// runtime-defect surface emits the registered codes.

import type { Diagnostic, SourceRange } from "../diagnostics/diagnostic";
import { toPosixFileSpelling } from "../diagnostics/diagnostic";
import { renderInteger, renderSourceDerived } from "../diagnostics/placeholder";
import { INTERPOLATED_RESULT_CODE } from "../render/query-render";
import { isEnumValue, isObjectValue, isResultValue, schemaTagOf, type ResultValue, type ThetaValue } from "./value";

/** The registry codes carried by the five panic sources this module owns. */
export const INDEX_OUT_OF_BOUNDS_CODE = "theta/runtime/index-out-of-bounds";
export const MISSING_OBJECT_KEY_CODE = "theta/runtime/missing-object-key";
export const NULL_INDEX_ACCESS_CODE = "theta/runtime/null-index-access";
export const NULL_MEMBER_ACCESS_CODE = "theta/runtime/null-member-access";
export const INVOKE_DEPTH_EXCEEDED_CODE = "theta/runtime/invoke-depth-exceeded";

/** The runtime-defect-surface code for an unexpected interpreter / adapter throw. */
export const INTERNAL_ERROR_CODE = "theta/runtime/internal-error";

/**
 * The runtime-defect-surface code for a deliberate receiver-kind gate (bug
 * 0027 §Fix) — a REGISTERED rejection, not an unanticipated throw, so it is a
 * second, distinct code from {@link INTERNAL_ERROR_CODE} even though both
 * route through {@link surfaceUnexpectedThrow} onto the same channels.
 */
export const NON_OBJECT_RECEIVER_CODE = "theta/runtime/non-object-receiver";

/** The `invoke`-chain depth cap (INV-4 / invocation.md §"Invocation depth bound"). */
export const INVOKE_DEPTH_CAP = 32;

/**
 * A runtime panic's SITE (bug 0476 §Fix; errors-and-results/error-model.md
 * §"Panic message string (normative)"): the file and range of the expression
 * that raised it. For a panic inside a `.thetalib`-imported fn body, `file` is
 * the leaf source location (the declaring lib), not the importer — the
 * existing normative leaf-location rule.
 */
export interface PanicSite {
  readonly file: string;
  readonly range: SourceRange;
}

/**
 * One open frame on a panic's unwind path (bug 0476 §Fix), pushed innermost-
 * first as the panic unwinds outward through {@link pushPanicFrame}:
 *   - `kind: "fn"` — a user `fn` call boundary; `file`/`range` are the CALL
 *     SITE (the caller's file and the call expression's own range), not the
 *     callee's declaration;
 *   - `kind: "par-for"` — a `par for` lane body; `file`/`range` are the
 *     enclosing `par for` expression's own file/range.
 */
export type PanicFrame =
  | { readonly kind: "fn"; readonly name: string; file: string | undefined; readonly range: SourceRange }
  | { readonly kind: "par-for"; file: string | undefined; readonly range: SourceRange }
  | {
      /**
       * A `${…}` interpolation boundary (bug 0476 follow-up): `source` is the
       * raw hole text (e.g. `cols[1]`, without the `${` `}` delimiters);
       * `file`/`range` are the enclosing `@`-query's own real file location,
       * never the interpolation-local coordinate the re-parsed substring
       * would otherwise carry — see {@link retargetInterpolationPanic}.
       */
      readonly kind: "interpolation";
      readonly source: string;
      file: string | undefined;
      readonly range: SourceRange;
    };

/**
 * Base class for the closed theta 1.0 runtime panics this module owns. A panic
 * is a thrown JS exception, never a `Result` value, so `?` and `match` (which
 * operate on `Result` values) cannot intercept it — it bypasses them by
 * construction. Each subclass carries its registered `theta/runtime/*` code.
 *
 * `site` / `frames` (bug 0476 §Fix) are populated post-construction, at the
 * executor arms/boundaries that hold the AST node the closed construction
 * seams (`evaluateIndexAccess` et al.) do not see — see
 * {@link attachPanicSite} / {@link pushPanicFrame}. A panic that never reaches
 * an instrumented seam (defensive only — every shipped construction seam is
 * instrumented) carries neither.
 */
export abstract class ThetaPanic extends Error {
  abstract readonly code: string;
  /** The panic's site (bug 0476 §Fix) — set once, by the innermost raise. */
  site?: PanicSite;
  /** Open frames the panic unwound through, innermost first (bug 0476 §Fix). */
  readonly frames: PanicFrame[] = [];
  /**
   * A PENDING range attached by {@link attachPanicRange} (bug 0476 §Fix): the
   * innermost raise's range, recorded before the FILE it belongs to is known.
   * The pure host evaluator (production-theta-producer.ts) knows the raising
   * node but not the top-level body's on-disk file — only
   * `surfaceDispatchDefect` (theta-composition-producer.ts) does, so the range
   * waits here until {@link completePanicSite} supplies the file. Cleared (left
   * set but superseded) once `site` is set by either helper.
   */
  pendingRange?: SourceRange;
}

/**
 * Attach `site` to `panic` iff it carries none yet (bug 0476 §Fix): the
 * INNERMOST raise wins, so a later (outer) catch attaching a site is a no-op —
 * the diagnostic's `file`/`range` names the leaf expression that actually
 * panicked, never an enclosing one.
 */
export function attachPanicSite(panic: ThetaPanic, site: PanicSite): void {
  if (panic.site === undefined) {
    panic.site = site;
  }
}

/**
 * Attach a PENDING range to `panic` (bug 0476 §Fix, two-phase site) iff it
 * carries no site yet — the INNERMOST raise wins, same discipline as
 * {@link attachPanicSite}. Used by a raise site that knows the node's range
 * but not (yet) the file it lives in — the pure host evaluator, which has no
 * access to the top-level body's on-disk path. {@link completePanicSite}
 * later supplies the file and turns this into a real `site`.
 */
export function attachPanicRange(panic: ThetaPanic, range: SourceRange): void {
  if (panic.site === undefined && panic.pendingRange === undefined) {
    panic.pendingRange = range;
  }
}

/**
 * Complete a two-phase panic site (bug 0476 §Fix): when `panic` carries a
 * {@link ThetaPanic.pendingRange} but no `site` yet, combine it with `file`
 * into the real site. Also back-fills `file` on every {@link PanicFrame} that
 * was pushed with no file yet (the pure host's fn-call / depth-seam frames) —
 * both the site and every pending frame share the SAME top-level file, because
 * the pure host only ever raises/pushes frames within the one top-level body
 * `surfaceDispatchDefect` is framing. A no-op when `panic` already carries a
 * site (the executor's own instrumented arms already attached one) or no
 * pending range (nothing to complete). Called FIRST, before
 * `surfaceDispatchDefect` builds the diagnostic, so every downstream read of
 * `panic.site` / `panic.frames[*].file` sees the completed values.
 */
export function completePanicSite(panic: ThetaPanic, file: string): void {
  if (panic.site === undefined && panic.pendingRange !== undefined) {
    panic.site = { file, range: panic.pendingRange };
  }
  for (const frame of panic.frames) {
    if (frame.file === undefined) {
      frame.file = file;
    }
  }
}

/**
 * Push one open frame onto `panic` as it unwinds outward through a `fn` call
 * boundary or a `par for` lane body (bug 0476 §Fix). Frames accumulate
 * innermost-first: the first call (closest to the raise) lands at index 0.
 */
export function pushPanicFrame(panic: ThetaPanic, frame: PanicFrame): void {
  panic.frames.push(frame);
}

/**
 * Render `panic`'s site + open-frame stack as the ordered suffix lines (bug
 * 0476 §Fix; errors-and-results/error-model.md §"Panic site suffix
 * (normative)"): `at <file>:<line>:<col>` first, then one `in fn <name>
 * (<file>:<line>:<col>)` / `in par for lane (<file>:<line>:<col>)` line per
 * open frame, innermost first. `file` is spelled with the shared POSIX
 * convention ({@link toPosixFileSpelling}) — the same one
 * `renderDiagnosticLine` uses — so one path literal matches regardless of
 * which platform raised it.
 *
 * Returns `[]` when `panic.site === undefined` (bug 0476 §Fix, BLOCKER B /
 * option (a); errors-and-results/error-model.md §"Panic site suffix
 * (normative)"): frames render only UNDER a site, so a site-less panic
 * carries no suffix and no hint — the defensive case a panic reaches this
 * render with no site at all (every shipped construction seam attaches one,
 * per the bug 0476 tripwire witness).
 */
export function renderPanicSuffixLines(panic: ThetaPanic): string[] {
  if (panic.site === undefined) {
    return [];
  }
  const lines: string[] = [];
  const { file, range } = panic.site;
  lines.push(`at ${toPosixFileSpelling(file)}:${range.start.line}:${range.start.column}`);
  for (const frame of panic.frames) {
    const file = toPosixFileSpelling(frame.file ?? "");
    const loc = `${file}:${frame.range.start.line}:${frame.range.start.column}`;
    if (frame.kind === "fn") {
      lines.push(`in fn ${frame.name} (${loc})`);
    } else if (frame.kind === "par-for") {
      lines.push(`in par for lane (${loc})`);
    } else {
      lines.push(`in interpolation \${${frame.source}} (${loc})`);
    }
  }
  return lines;
}

/**
 * Retarget an interpolation-local panic to its enclosing `@`-query's real
 * file coordinates and name the hole it came from (bug 0476 follow-up).
 *
 * WHY: an `Expr` inside a `${…}` interpolation is RE-PARSED from the
 * template substring (`stringifyInterpolation` → `parseExpressionSource`,
 * production-theta-producer.ts), so every node range that parse yields is
 * LOCAL to that substring — line 1, column within the `${…}` body — never a
 * file coordinate. A pure `fn` body reached from the SAME pure host is, by
 * contrast, part of the DOCUMENT AST evaluated in place
 * (`evaluatePureBlock` over `fn.body`), so its own node ranges are already
 * file-relative and need no retargeting. Nested template strings inside a
 * `${…}` interpolation are disallowed (expressions.md §"Nested template
 * strings inside a ${...} interpolation"), and a pure `fn` body carries no
 * queries of its own (a query expression has no pure value — it yields the
 * inert `null` safety net, so it can never nest a second interpolation
 * inside a `fn` body reached from the first) — so the ONLY substring-local
 * coordinate a panic emerging from `stringifyInterpolation` can carry is
 * exhaustively one of:
 *
 *   (a) its OWN site/pending range — `panic.frames.length === 0` — when it
 *       raised directly inside the interpolation with no intervening `fn`
 *       call boundary; or
 *   (b) the OUTERMOST (last-pushed) frame's range — the call expression
 *       WRITTEN INSIDE the interpolation that opened a `fn` call boundary.
 *       Every frame pushed BENEATH it belongs to a call made from inside
 *       that callee's own body — document AST, already file-relative — and
 *       is left untouched.
 *
 * Called exactly once, at the interpolation boundary
 * (`renderQueryText`'s wrap around `stringifyInterpolation`) — the one place
 * that knows both the local coordinate the pure host produced and the
 * enclosing query's real file range. `source` is the raw hole text (e.g.
 * `cols[1]`), carried onto the pushed `interpolation` frame so the rendered
 * suffix names the hole, not just its location.
 */
export function retargetInterpolationPanic(
  panic: ThetaPanic,
  interpolation: { readonly source: string; readonly file: string | undefined; readonly range: SourceRange },
): void {
  const { source, file, range } = interpolation;
  if (panic.frames.length === 0) {
    // (a) — nothing unwound through a `fn` call boundary: whatever the panic
    // carries (a completed site, or a pending range awaiting
    // `completePanicSite`) is the interpolation-local coordinate itself.
    // Discard it and install the enclosing query's real range instead.
    if (file !== undefined) {
      panic.site = { file, range };
    } else {
      panic.pendingRange = range;
    }
  } else {
    // (b) — the OUTERMOST (last-pushed) frame is the call expression written
    // inside the interpolation; its range is local the same way. Replace the
    // whole frame object (its `range` field is readonly) rather than mutate
    // it in place.
    const outerIndex = panic.frames.length - 1;
    const outer = panic.frames[outerIndex] as PanicFrame;
    const retargetedFile = file !== undefined ? file : outer.file;
    panic.frames[outerIndex] =
      outer.kind === "fn"
        ? { kind: "fn", name: outer.name, file: retargetedFile, range }
        : outer.kind === "par-for"
          ? { kind: "par-for", file: retargetedFile, range }
          : { kind: "interpolation", source: outer.source, file: retargetedFile, range };
  }
  pushPanicFrame(panic, { kind: "interpolation", source, file, range });
}

/** `arr[i]` where `i` is not an integer in `0..arr.length` (`theta/runtime/index-out-of-bounds`). */
export class IndexOutOfBoundsPanic extends ThetaPanic {
  readonly code = INDEX_OUT_OF_BOUNDS_CODE;
  constructor(message: string) {
    super(message);
    this.name = "IndexOutOfBoundsPanic";
  }
}

/** `obj[k]` where `k` is not a present theta-side key (`theta/runtime/missing-object-key`). */
export class MissingObjectKeyPanic extends ThetaPanic {
  readonly code = MISSING_OBJECT_KEY_CODE;
  constructor(message: string) {
    super(message);
    this.name = "MissingObjectKeyPanic";
  }
}

/** `[i]` access on `null` (`theta/runtime/null-index-access`). */
export class NullIndexAccessPanic extends ThetaPanic {
  readonly code = NULL_INDEX_ACCESS_CODE;
  constructor(message: string) {
    super(message);
    this.name = "NullIndexAccessPanic";
  }
}

/** `.field` access on `null` (`theta/runtime/null-member-access`). */
export class NullMemberAccessPanic extends ThetaPanic {
  readonly code = NULL_MEMBER_ACCESS_CODE;
  constructor(message: string) {
    super(message);
    this.name = "NullMemberAccessPanic";
  }
}

/** `invoke` chain depth exceeded (`theta/runtime/invoke-depth-exceeded`). */
export class InvokeDepthExceededPanic extends ThetaPanic {
  readonly code = INVOKE_DEPTH_EXCEEDED_CODE;
  constructor(message: string) {
    super(message);
    this.name = "InvokeDepthExceededPanic";
  }
}

/**
 * The QRY-18 runtime fallback for a `Result`-valued `${expr}` interpolation
 * whose static type the type-layer gate (`src/parser/type-layer-checks.ts`)
 * could not resolve ahead of load (e.g. an inferred binding that widens past
 * the parser's static view). Carries the same registered
 * `theta/parse/interpolated-result` code the static gate emits — QRY-18's
 * "static where possible, runtime where not" posture. A `ThetaPanic`
 * subclass, not a plain thrown `Error`, so `isThetaPanic` classifies it and
 * QRY-21 (a panic during interpolation is never caught by `let _ =`) holds
 * for it, exactly as it already does for `MissingObjectKeyPanic` /
 * `NullMemberAccessPanic` (`../runtime/runtime-panics.ts`).
 */
export class InterpolatedResultPanic extends ThetaPanic {
  readonly code = INTERPOLATED_RESULT_CODE;
  constructor(message: string) {
    super(message);
    this.name = "InterpolatedResultPanic";
  }
}

/**
 * The closed, six-value `<receiver kind>` set the
 * `theta/runtime/non-object-receiver` registry row registers
 * (code-registry-runtime.md, and the §7 closed-enum placeholder entry that
 * sources its values from that row): five article-plus-noun phrases plus the
 * bare `null` sixth member (bug 0393 §Fix — the stdlib-method-call read's
 * laundered-`null` receiver). A receiver whose kind is outside this set is
 * outside the row's registered *trigger* too, so it must not carry the code
 * — see {@link nonObjectReceiverRejection}.
 */
type GatedReceiverKind =
  | "an enum value"
  | "a Result value"
  | "a string"
  | "a number"
  | "a boolean"
  | "null";

/**
 * A gated receiver rejection (bug 0027 §Fix, widened by bug 0393 §Fix,
 * code-registry-runtime.md `theta/runtime/non-object-receiver`): raised by
 * the widened `evaluateIndexAccess` guard below, `evaluateMemberAccess`'s
 * enum/`Result` guard, both stdlib-method hosts' object-arm gate
 * (`applyStdlibMethod` in statement-executor.ts, `evaluateStdlibMethod` in
 * production-theta-producer.ts) ahead of their `evaluateObjectMember` call,
 * and those same two hosts' terminal fall-through for a receiver kind with
 * no built-in method surface (a `number`, a `boolean`, or `null`) — all six
 * through {@link nonObjectReceiverRejection}, which is what keeps this code
 * off receiver kinds the registry row does not register.
 * Deliberately NOT a `ThetaPanic` subclass: the six-source panic list
 * (error-model.md §"Runtime panics") is closed and stays closed — this is
 * instead the second registered runtime-defect-surface code alongside
 * `theta/runtime/internal-error`, reached through the same
 * `surfaceUnexpectedThrow` routing rather than a new arm on `InvokeInfraError`.
 */
export class NonObjectReceiverError extends Error {
  readonly code = NON_OBJECT_RECEIVER_CODE;
  constructor(read: string, receiverKind: GatedReceiverKind) {
    super(`non-object receiver: cannot read ${read} on ${receiverKind}`);
    this.name = "NonObjectReceiverError";
  }
}

/**
 * The `<receiver kind>` clause of a {@link NonObjectReceiverError} message
 * (code-registry-runtime.md's registered template), or `undefined` when
 * `value`'s kind is outside that registered closed set.
 */
function gatedReceiverKind(value: ThetaValue): GatedReceiverKind | undefined {
  if (isEnumValue(value)) {
    return "an enum value";
  }
  if (isResultValue(value)) {
    return "a Result value";
  }
  // JS `typeof null === "object"`, so without this check `null` would fall
  // through to the `default: return undefined` arm below and lose its
  // sixth-kind classification (bug 0393 §Fix — the bare `null` receiver kind,
  // no article).
  if (value === null) {
    return "null";
  }
  switch (typeof value) {
    case "string":
      return "a string";
    case "number":
      return "a number";
    case "boolean":
      return "a boolean";
    default:
      return undefined;
  }
}

/**
 * The single construction point for a gated-read rejection of `read` on
 * `receiver`; all six gated sites route through it.
 *
 * A receiver {@link gatedReceiverKind} cannot classify keeps its PRE-0027
 * disposition — a raw `Error` the runtime-defect surface classifies
 * `theta/runtime/internal-error`, whose trigger is open-ended and covers it —
 * because the registry row registers such a receiver neither as a trigger nor
 * as a `<receiver kind>`, so emitting the registered code on it would be a
 * DIAG-4 registry/behaviour mismatch. This arm now covers only a value
 * {@link gatedReceiverKind} cannot classify at all — a host value outside the
 * theta 1.0 value model (e.g. raw JS `undefined`). `null` is NOT such a
 * value: bug 0393 §Fix widened {@link gatedReceiverKind} to classify it as
 * the sixth `GatedReceiverKind` member, so a `null` receiver reaching one of
 * the two stdlib-method-call fall-throughs (`applyStdlibMethod`,
 * `evaluateStdlibMethod`) carries the REGISTERED
 * `theta/runtime/non-object-receiver` code, not this raw-`Error` arm. A
 * `null` receiver at `evaluateIndexAccess` / `evaluateMemberAccess` never
 * reaches this function at all — the dedicated `NullIndexAccessPanic` /
 * `NullMemberAccessPanic` checks ahead of each of those gates intercept it
 * first. The `indexed access` wording is `evaluateIndexAccess`'s own
 * pre-0027 message, preserved byte-for-byte.
 */
export function nonObjectReceiverRejection(read: string, receiver: ThetaValue): Error {
  const kind = gatedReceiverKind(receiver);
  return kind === undefined
    ? new Error(`indexed access requires an array<T> or object receiver; got ${typeof receiver}`)
    : new NonObjectReceiverError(read, kind);
}

/**
 * The presence gate `evaluateIndexAccess`'s object arm and
 * `evaluateMemberAccess` share (bug 0032 §Fix,
 * docs/bugs/0032-absent-member-binds-undefined.md): `key` must be a theta-side
 * name `target` carries as an own property, or the read raises
 * `MissingObjectKeyPanic` with the registered `missing object key: <key>`
 * template — the ONE construction site for that panic, so the member and
 * index spellings of one absent name (expressions.md:9-10) raise
 * byte-identically. Testing `hasOwnProperty` on `target` itself, not a
 * narrowed object cast, is what admits `length` on a `string` or `array`
 * receiver (both carry it as an own property) while still gating every other
 * absent name on whatever receiver kind reaches this point — an object
 * value, or a primitive the earlier guards did not classify as `null`, an
 * enum value, or a `Result` value.
 */
function assertKeyPresent(target: ThetaValue, key: string): void {
  if (!Object.prototype.hasOwnProperty.call(target, key)) {
    throw new MissingObjectKeyPanic(
      `missing object key: ${renderSourceDerived({ kind: "key", text: key })}`,
    );
  }
}

// A string index renders QUOTED (JSON.stringify — the bug 0300 precedent) so a
// string cannot masquerade as an in-range integer in the message; an integer
// renders via the category-4 numeric rule (renderInteger), byte-identical to
// the pre-widening message; a non-integer number (1.5, NaN) renders as its
// plain decimal — the honest offending value.
function renderIndexOperand(index: number | string): string {
  if (typeof index === "string") return JSON.stringify(index);
  return Number.isInteger(index) ? renderInteger(index) : String(index);
}

/**
 * Runtime `[i]` indexed access (errors-and-results/error-model.md §"Runtime
 * panics"). `target[index]`:
 *   - `null` target               → `NullIndexAccessPanic` (`[<i>]`);
 *   - array, `i` not an integer in `0..len` → `IndexOutOfBoundsPanic` (`<i> not in 0..<length>`);
 *   - a primitive, an enum value, or a `Result` value → `NonObjectReceiverError`
 *     (`theta/runtime/non-object-receiver`, bug 0027 §Fix — a registered
 *     runtime-defect-surface rejection, not a panic);
 *   - a receiver outside that registered closed kind set (defensive only:
 *     bug 0032's fix closed the sole theta-source feeder, an absent-member
 *     `undefined` bind) → a raw `Error` → `theta/runtime/internal-error`,
 *     its pre-0027 disposition ({@link nonObjectReceiverRejection});
 *   - object, missing theta-side key → `MissingObjectKeyPanic` (`<key>`,
 *     {@link assertKeyPresent});
 *   - otherwise                    → the indexed element / member value.
 *
 * The registered message templates are sourced from
 * diagnostics/code-registry-runtime.md and interpolated per the placeholder-
 * rendering categories (`<i>` / `<length>` are category-4 numerics; `<key>` is
 * a category-5 source-derived identifier).
 */
export function evaluateIndexAccess(
  target: ThetaValue,
  index: number | string,
): ThetaValue {
  if (target === null) {
    // `[i]` access on `null` (`theta/runtime/null-index-access`). `<i>`.
    const rendered = typeof index === "number" ? renderInteger(index) : index;
    throw new NullIndexAccessPanic(`null index access: [${rendered}]`);
  }
  if (Array.isArray(target)) {
    // Array indexing: the trigger is "not an integer in 0..arr.length"
    // (`theta/runtime/index-out-of-bounds`, bug 0365 §Fix) — a fractional or
    // `NaN` number and a string index all address no element and panic
    // alongside a genuinely out-of-range integer; `Number.isInteger(-0)` is
    // true, so `xs[-0]` still reads element 0. `<i>`.
    if (typeof index === "number" && Number.isInteger(index) && index >= 0 && index < target.length) {
      return target[index] as ThetaValue;
    }
    throw new IndexOutOfBoundsPanic(
      `index out of bounds: ${renderIndexOperand(index)} not in 0..${renderInteger(target.length)}`,
    );
  }
  // A primitive receiver (`string` / `number` / `boolean`) is not indexable:
  // the type layer rejects a *statically-resolvable* one at parse time
  // (`theta/parse/non-indexable-receiver`). An enum value or a `Result` value
  // is not indexable either — both satisfy JS `typeof "object"` but neither is
  // an object value in the language's sense ({@link isObjectValue}, bug 0027
  // §Fix) — and has no static model at all (`Result` has no `CompatType` form;
  // an enum name resolves `"unknown"` in the A2 `TypeEnv`), so a laundered
  // instance of either is parse-clean regardless of annotation. On those three
  // receiver kinds, surface the registered
  // `theta/runtime/non-object-receiver` runtime-defect-surface code rather
  // than silently answering the receiver's reference encoding (the pre-0027
  // behaviour for enum/`Result` — `s["0"]` answering one character of the wire
  // string) or a raw unregistered `Error` (the pre-0027 behaviour for a
  // laundered primitive). A fourth input class used to reach this guard too:
  // raw JS `undefined`, which an absent member bound into `x.absent[0]`
  // before bug 0032's fix (docs/bugs/0032-absent-member-binds-undefined.md).
  // That value was outside the row's registered trigger and `<receiver kind>`
  // set, so `nonObjectReceiverRejection` routed it onto its pre-0027
  // raw-`Error` → `theta/runtime/internal-error` path; the arm stays for the
  // same reason, now defensively, since no theta expression binds `undefined`
  // anymore.
  if (typeof target !== "object" || !isObjectValue(target)) {
    const rendered = typeof index === "number" ? renderInteger(index) : index;
    throw nonObjectReceiverRejection(`[${rendered}]`, target);
  }
  // Object indexing: a key that is not a present theta-side name on the object
  // is the missing-object-key panic (`theta/runtime/missing-object-key`) —
  // the presence gate `evaluateMemberAccess` shares (bug 0032 §Fix).
  const key = index as string;
  const obj = target as { readonly [k: string]: ThetaValue };
  assertKeyPresent(obj, key);
  return obj[key] as ThetaValue;
}

/**
 * Runtime `.field` member access (errors-and-results/error-model.md §"Runtime
 * panics"). `target.field`:
 *   - `null` target → `NullMemberAccessPanic` (`.<field>`);
 *   - an enum value or a `Result` value → `NonObjectReceiverError`
 *     (`theta/runtime/non-object-receiver`, bug 0027 §Fix): both satisfy JS
 *     `typeof "object"` but neither is an object value in the language's
 *     sense ({@link isObjectValue}), so the gate fires ahead of the generic
 *     read below rather than answering the boxed-`String` enum carrier's own
 *     `.length` or the `Result` literal's own `.ok` / `.value` / `.error`. A
 *     primitive and an array are NOT gated here — `"hi".length` and
 *     `[1,2].length` read the receiver's own declared member
 *     (expressions.md's `string` / `array` `length` declarations) and must
 *     keep working;
 *   - a name that is not a present theta-side name on `target` →
 *     `MissingObjectKeyPanic` (`<field>`, bug 0032 §Fix,
 *     {@link assertKeyPresent}): the SAME presence gate
 *     `evaluateIndexAccess`'s object arm uses, so the member and index
 *     spellings of one absent name (expressions.md:9-10) raise
 *     byte-identically;
 *   - otherwise → the member value.
 *
 * The registered `null member access: .<field>` template is sourced from
 * diagnostics/code-registry-runtime.md (`<field>` is a category-5 source-
 * derived identifier rendered bare); so are the non-object-receiver and
 * missing-object-key templates.
 */
export function evaluateMemberAccess(target: ThetaValue, field: string): ThetaValue {
  if (target === null) {
    throw new NullMemberAccessPanic(`null member access: .${field}`);
  }
  if (typeof target === "object" && !isObjectValue(target)) {
    throw nonObjectReceiverRejection(`.${field}`, target);
  }
  assertKeyPresent(target, field);
  return (target as { readonly [k: string]: ThetaValue })[field] as ThetaValue;
}

/**
 * Guard the `invoke`-chain depth bound (INV-4): about to push a frame bringing
 * the chain count to `nextDepth`. When `nextDepth > 32` the runtime raises
 * `InvokeDepthExceededPanic` (`invoke chain depth exceeded: <depth> > 32`);
 * otherwise it returns normally.
 *
 * The registered `invoke chain depth exceeded: <depth> > 32` template is
 * sourced from diagnostics/code-registry-runtime.md (`<depth>` is a category-4
 * numeric).
 */
export function enterInvokeFrame(nextDepth: number): void {
  if (nextDepth > INVOKE_DEPTH_CAP) {
    throw new InvokeDepthExceededPanic(
      `invoke chain depth exceeded: ${renderInteger(nextDepth)} > ${INVOKE_DEPTH_CAP}`,
    );
  }
}

/**
 * The outcome of evaluating a `?` operand (errors-and-results/error-model.md
 * §"Runtime panics" — the surface panics bypass):
 *   - `value`     — the operand was `Ok(v)`; `v` flows on;
 *   - `propagate` — the operand was `Err(e)`; the enclosing function early-
 *                   returns `Err(e)`.
 * A panic thrown while *producing* the operand is **not** captured here — it
 * propagates past `?` as a thrown `ThetaPanic`, never becoming a `propagate`
 * outcome.
 */
export type QuestionResult =
  | { readonly kind: "value"; readonly value: ThetaValue }
  | { readonly kind: "propagate"; readonly err: ThetaValue };

/**
 * Evaluate `operand?`: invoke `operand` (a thunk producing the `?` operand's
 * `Result`), then apply `?` propagation — `Ok(v)` yields `{ kind: "value" }`,
 * `Err(e)` yields `{ kind: "propagate" }`. A panic thrown by `operand`
 * propagates unchanged (the thunk is invoked without a surrounding catch), so a
 * panic bypasses `?`.
 *
 * Invoking `operand` *outside* any surrounding catch is the mechanism by which
 * a panic bypasses `?`: a thrown `ThetaPanic` (or `MatchError`) propagates from
 * this call unchanged, never becoming a `propagate` outcome.
 *
 * The internal `as ResultValue` cast is sound only under the caller contract:
 * the operand thunk must yield a brand-verified `ResultValue` (`evalTry`'s
 * `isResultValue` guard — bug 0019); a new caller must guard likewise.
 */
export function evaluateQuestion(operand: () => ThetaValue): QuestionResult {
  // A panic thrown while producing the operand propagates past this call
  // unchanged (no catch surrounds it), so `?` is bypassed.
  const result = operand() as ResultValue;
  return result.ok
    ? { kind: "value", value: result.value }
    : { kind: "propagate", err: result.error };
}

/**
 * Bug 0019 (docs/bugs/0019-question-operand-bypasses-result-normalisation.md)
 * belt-and-braces: the `?` operand-type precondition is a static gate — a
 * non-`Result` operand is rejected at parse time (ERR-18,
 * `theta/parse/question-on-non-result`) — so a non-`Result` value reaching the
 * unwrap means the gate did not reject this site: the operand's inferred type
 * is an unresolvable `named` placeholder (a member access, an index read, a
 * stored binding), or the value entered through unknowable-typed ingress (a
 * code-tool return, a permissive `{}` lowering) no static check can see.
 * Unwrapping anyway reads `.ok` off a non-`Result` — forging `Err(undefined)`
 * (laundered downstream into a fabricated cancellation) or stripping a user
 * payload to `undefined` — so `evalTry` throws this instead, BEFORE
 * `evaluateQuestion`: a thrown Error routed to the
 * `theta/runtime/internal-error` surface exactly as `PiToolArgShapeDefectError`
 * (a plain Error caught by the top-level slash runtime-defect surface and
 * framed via `surfaceUnexpectedThrow`), so the gap fails loudly instead of
 * corrupting silently. Housed beside `evaluateQuestion` — the unwrap whose
 * `Result`-operand precondition it enforces — as the precedent defect classes
 * live beside the lowerings whose parse-gate preconditions they enforce
 * (`PiToolArgShapeDefectError` / `ShadowedCalleeDispatchDefectError`,
 * src/runtime/tool-call.ts).
 */
export class QuestionOperandDefectError extends Error {
  public constructor(operand: ThetaValue) {
    super(
      `internal defect: '?' operand evaluated to a non-Result value (${summariseNonResultOperand(operand)}); the parse-time ERR-18 operand gate (theta/parse/question-on-non-result) did not reject this site — a gate gap (bug 0019)`,
    );
    this.name = "QuestionOperandDefectError";
  }
}

/**
 * Bug 0315 (docs/bugs/0315-stdlib-method-argument-surface-unchecked.md)
 * belt-and-braces: a stdlib method call's argument-count precondition is a
 * static gate — `checkMethodCall` (`../parser/type-layer-checks.ts`) rejects a
 * wrong-arity call at parse time (`theta/parse/stdlib-arity-mismatch`) when
 * the receiver's static type is a concretely-resolvable built-in. That gate
 * defers on a statically-unresolvable ("laundered") receiver — an unannotated
 * `fn` parameter, e.g. — exactly as the A2 `unknown-method` check does, so a
 * wrong-arity call on such a receiver reaches `evaluateStringMember` /
 * `evaluateArrayMember` / `evaluateObjectMember` with the gate never having
 * run. Those dispatchers otherwise index `args[i] as …` unconditionally, so a
 * missing argument becomes raw JS `undefined` laundered into the host method
 * (`"a-b".replace("-")` → `"aundefinedb"`, bug 0315 §Reproduction). Each
 * dispatcher throws this defect instead, BEFORE the cast, on an out-of-`[min,
 * max]` `args.length`; it routes through `surfaceUnexpectedThrow` to
 * `theta/runtime/internal-error` exactly as `QuestionOperandDefectError`
 * above does, and fires only for a genuine arity mismatch — a correct-arity
 * call on the same laundered receiver passes through untouched.
 */
export class StdlibMethodArgumentDefectError extends Error {
  public constructor(method: string, min: number, max: number, provided: number) {
    const arity = min === max ? `exactly ${min}` : `between ${min} and ${max}`;
    super(
      `internal defect: stdlib method '${method}' called with ${provided} argument(s), outside its declared arity (expects ${arity}); the parse-time stdlib-arity-mismatch gate (theta/parse/stdlib-arity-mismatch) did not reject this site — a laundered-receiver gate gap (bug 0315)`,
    );
    this.name = "StdlibMethodArgumentDefectError";
  }
}

/**
 * Bug 0394 (docs/bugs/0394-stdlib-wrong-kind-args-coerce-and-replace-hangs.md)
 * belt-and-braces: the bug-0315 arity belt's KIND sibling. A correct-arity
 * stdlib call with a wrong-KIND positional argument reaches the same three
 * dispatchers past the arity check, past the `theta/parse/stdlib-arg-type-mismatch`
 * gate, by either of two routes: the gate defers because the receiver is
 * statically unresolvable (laundered) and it never gets a static type to
 * judge (bug 0394), or the gate runs and passes because the argument's static
 * type is the declared one (`integer`) while the *value* it evaluates to at
 * runtime is non-integral — `n % m` with a runtime-zero `m` is `NaN`, still
 * typed `integer` at parse time — the class bug 0402 admitted with its
 * integrality conjunct in `assertStdlibArgumentKinds` (`stdlib-signature.ts`). Either way the unchecked
 * `args[i] as …` casts below would otherwise forward the raw value into a
 * host JS method that either coerces it (e.g. `endsWith(null)` answering over
 * the literal spelling "null") or, for `replace`'s `from` position, diverges
 * (a `NaN` cursor makes the scan loop forever). Each dispatcher throws this
 * instead, AFTER the arity check and BEFORE the switch/cast, on a `typeof` /
 * `Array.isArray` mismatch against the member's `params` descriptor. It
 * routes through `surfaceUnexpectedThrow` to `theta/runtime/internal-error`
 * exactly as `StdlibMethodArgumentDefectError` and
 * `StdlibJoinElementDefectError` do — no new registry row.
 */
export class StdlibMethodArgumentKindDefectError extends Error {
  public constructor(method: string, argIndex: number, expectedKind: string, actual: ThetaValue) {
    super(
      `internal defect: stdlib method '${method}' argument ${argIndex} expects ${expectedKind}, got ${summariseNonResultOperand(actual)}; the parse-time stdlib-arg-type-mismatch gate covers only statically-resolvable mismatches, so this site's argument reached the runtime belt unjudged (bugs 0394/0402)`,
    );
    this.name = "StdlibMethodArgumentKindDefectError";
  }
}

/**
 * Render the offending-operand summary of a `QuestionOperandDefectError`
 * message. Defensive by construction — the value is by definition outside the
 * interpreter's `Result` contract, so no `JSON.stringify` (cycles, unbounded
 * size), only `typeof` plus, for objects, a shallow descriptor (the
 * interpreter-private schema/enum tag when present, else an own enumerable key
 * list capped at four names). Never throws or mutates on any plain-data
 * `ThetaValue`; an exotic proxy receiver whose traps throw from the key walk
 * fails into the same top-level `theta/runtime/internal-error` surface this
 * defect targets, so the abort stays loud either way.
 */
export function summariseNonResultOperand(value: ThetaValue): string {
  if (value === null) {
    return "null";
  }
  if (typeof value !== "object") {
    return `a ${typeof value}`;
  }
  if (Array.isArray(value)) {
    return `an array (length ${value.length})`;
  }
  if (isEnumValue(value)) {
    return "an enum value";
  }
  const schema = schemaTagOf(value);
  if (schema !== undefined) {
    return `a '${schema}' schema object`;
  }
  const keys = Object.keys(value);
  if (keys.length === 0) {
    return "an object with no keys";
  }
  return `an object with keys ${keys.slice(0, 4).join(", ")}${keys.length > 4 ? ", …" : ""}`;
}

/**
 * A marker for a host-fatal *uncatchable* condition (NOCEIL-3): a V8 heap-OOM
 * via the `OOMErrorCallback` / `abort()` path terminates the host process
 * before any wrap can observe it, so it never reaches a runtime catch site. The
 * runtime-defect surface emits **no** `theta/runtime/internal-error` for it.
 * Modelled as a distinct marker so the carve-out is testable without crashing
 * the test process.
 */
export class HostFatal {
  constructor(readonly description: string) {}
}

/**
 * The runtime-defect surface (errors-and-results/error-model.md §"Runtime
 * panics"). Classify a value reaching a runtime catch site:
 *   - a `ThetaPanic` → `undefined` (already a panic; not a runtime defect, not
 *     reclassified — the caller rethrows it so it bypasses `?`/`match`);
 *   - a `HostFatal` → `undefined` (NOCEIL-3 carve-out: no diagnostic at all);
 *   - a `NonObjectReceiverError` → its own registered
 *     `theta/runtime/non-object-receiver` `Diagnostic` (bug 0027 §Fix): a
 *     DELIBERATE receiver-kind gate, not an unanticipated throw, so its
 *     `message` is the bare registered template — no `internal error: `
 *     prefix, which marks the OTHER arm below;
 *   - any other thrown value → a `theta/runtime/internal-error` `Diagnostic`
 *     whose `message` is the underlying `error.message` and whose `hint` is the
 *     underlying `error.stack` (or `"<no stack available>"` when falsy).
 *
 * The `internal error: <error.message>` template is sourced from
 * diagnostics/code-registry-runtime.md; `hint` carries the underlying
 * `error.stack` (or `"<no stack available>"` when falsy) for operator triage
 * on both this arm and the `NonObjectReceiverError` arm above.
 */
export function surfaceUnexpectedThrow(
  thrown: unknown,
  site: { readonly file: string; readonly range: SourceRange },
): Diagnostic | undefined {
  // Already a panic (one of the six closed sources): not a runtime defect, not
  // reclassified — the caller rethrows it so it bypasses `?`/`match`.
  if (isThetaPanic(thrown)) {
    return undefined;
  }
  // NOCEIL-3 carve-out: an uncatchable host fatal terminates the host process
  // before any wrap observes it, so the runtime-defect surface emits no
  // diagnostic at all for it.
  if (thrown instanceof HostFatal) {
    return undefined;
  }
  // A deliberate receiver-kind gate (bug 0027 §Fix), not an unanticipated
  // throw: reuses this surface's routing (same channels, same
  // `cause: "internal_error"` on `InvokeInfraError`) but carries its OWN
  // registered code and the bare registered message.
  if (thrown instanceof NonObjectReceiverError) {
    return {
      severity: "error",
      code: thrown.code,
      file: site.file,
      range: site.range,
      message: thrown.message,
      hint:
        typeof thrown.stack === "string" && thrown.stack.length > 0
          ? thrown.stack
          : "<no stack available>",
    };
  }
  const errorLike = thrown as { readonly message?: unknown; readonly stack?: unknown };
  const message =
    typeof errorLike.message === "string" ? errorLike.message : String(thrown);
  const stack =
    typeof errorLike.stack === "string" && errorLike.stack.length > 0
      ? errorLike.stack
      : "<no stack available>";
  return {
    severity: "error",
    code: INTERNAL_ERROR_CODE,
    file: site.file,
    range: site.range,
    message: `internal error: ${message}`,
    hint: stack,
  };
}

/** Whether `error` is one of the runtime panics this module owns. */
export function isThetaPanic(error: unknown): error is ThetaPanic {
  return error instanceof ThetaPanic;
}
