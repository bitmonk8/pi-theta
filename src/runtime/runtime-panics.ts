// V4b / V4b-T — the runtime-panic surface seam.
//
// This module owns the closed theta 1.0 runtime-panic set, the `?`-operator
// runtime propagation seam that panics bypass, and the runtime-defect surface
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
// V4b-T (tests-task) declares the seam — the `ThetaPanic` base and the five
// panic classes, the `evaluateIndexAccess` / `evaluateMemberAccess` /
// `enterInvokeFrame` accessor seams, the `evaluateQuestion` `?`-propagation
// seam, the `HostFatal` NOCEIL-3 marker, and the `surfaceUnexpectedThrow`
// runtime-defect surface — and stubs every behaviour-bearing function inertly
// so the failing tests red on their own primary assertions (an accessor that
// raises no panic, a `?` seam that neither propagates nor lets a panic through,
// and a runtime-defect surface that emits a wrong-code sentinel for every
// input). The paired V4b implementation leaf fills these in.

import type { Diagnostic, SourceRange } from "../diagnostics/diagnostic";
import { renderInteger, renderSourceDerived } from "../diagnostics/placeholder";
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
 * Base class for the closed theta 1.0 runtime panics this module owns. A panic
 * is a thrown JS exception, never a `Result` value, so `?` and `match` (which
 * operate on `Result` values) cannot intercept it — it bypasses them by
 * construction. Each subclass carries its registered `theta/runtime/*` code.
 */
export abstract class ThetaPanic extends Error {
  abstract readonly code: string;
}

/** `arr[i]` with `i < 0` or `i >= arr.length` (`theta/runtime/index-out-of-bounds`). */
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
 * The closed `<receiver kind>` set the `theta/runtime/non-object-receiver`
 * registry row registers (code-registry-runtime.md, and the §7 closed-enum
 * placeholder entry that sources its values from that row). A receiver whose
 * kind is outside this set is outside the row's registered *trigger* too, so
 * it must not carry the code — see {@link nonObjectReceiverRejection}.
 */
type GatedReceiverKind =
  | "an enum value"
  | "a Result value"
  | "a string"
  | "a number"
  | "a boolean";

/**
 * A gated receiver rejection (bug 0027 §Fix, code-registry-runtime.md
 * `theta/runtime/non-object-receiver`): raised by the widened
 * `evaluateIndexAccess` guard below, `evaluateMemberAccess`'s enum/`Result`
 * guard, and both stdlib-method hosts' object-arm gate (`applyStdlibMethod`
 * in statement-executor.ts, `evaluateStdlibMethod` in
 * production-theta-producer.ts) ahead of their `evaluateObjectMember` call —
 * all four through {@link nonObjectReceiverRejection}, which is what keeps
 * this code off receiver kinds the registry row does not register.
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
 * `receiver`; all four gated sites route through it.
 *
 * A receiver {@link gatedReceiverKind} cannot classify keeps its PRE-0027
 * disposition — a raw `Error` the runtime-defect surface classifies
 * `theta/runtime/internal-error`, whose trigger is open-ended and covers it —
 * because the registry row registers such a receiver neither as a trigger nor
 * as a `<receiver kind>`, so emitting the registered code on it would be a
 * DIAG-4 registry/behaviour mismatch. That arm is reachable, not defensive:
 * bug 0032 (docs/bugs/0032-absent-member-binds-undefined.md) binds raw JS
 * `undefined` for an absent member, so `x.absent[0]` reaches the widened
 * `evaluateIndexAccess` guard with `undefined` as its receiver. The
 * `indexed access` wording is that guard's own pre-0027 message, preserved
 * byte-for-byte: the guard is the only one of the four sites that can reach
 * this arm, because the other three admit only a `typeof "object"` value
 * {@link isObjectValue} rejects — an enum value or a `Result` value, both in
 * the closed set.
 */
export function nonObjectReceiverRejection(read: string, receiver: ThetaValue): Error {
  const kind = gatedReceiverKind(receiver);
  return kind === undefined
    ? new Error(`indexed access requires an array<T> or object receiver; got ${typeof receiver}`)
    : new NonObjectReceiverError(read, kind);
}

/**
 * Runtime `[i]` indexed access (errors-and-results/error-model.md §"Runtime
 * panics"). `target[index]`:
 *   - `null` target               → `NullIndexAccessPanic` (`[<i>]`);
 *   - array, `i < 0 || i >= len`  → `IndexOutOfBoundsPanic` (`<i> not in 0..<length>`);
 *   - a primitive, an enum value, or a `Result` value → `NonObjectReceiverError`
 *     (`theta/runtime/non-object-receiver`, bug 0027 §Fix — a registered
 *     runtime-defect-surface rejection, not a panic);
 *   - a receiver outside that registered closed kind set (raw JS `undefined`,
 *     via bug 0032's absent-member bind) → a raw `Error` →
 *     `theta/runtime/internal-error`, its pre-0027 disposition
 *     ({@link nonObjectReceiverRejection});
 *   - object, missing theta-side key → `MissingObjectKeyPanic` (`<key>`);
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
    // Array indexing: bounds-check `i < 0 || i >= arr.length`
    // (`theta/runtime/index-out-of-bounds`). `<i> not in 0..<length>`.
    const i = index as number;
    if (typeof i !== "number" || i < 0 || i >= target.length) {
      throw new IndexOutOfBoundsPanic(
        `index out of bounds: ${renderInteger(i)} not in 0..${renderInteger(target.length)}`,
      );
    }
    return target[i] as ThetaValue;
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
  // laundered primitive). A fourth input class also reaches this guard and is
  // NOT the code's: raw JS `undefined`, which bug 0032's absent-member bind
  // puts into a binding (`x.absent[0]`). It is outside the row's registered
  // trigger and `<receiver kind>` set, so `nonObjectReceiverRejection` keeps it
  // on its pre-0027 raw-`Error` → `theta/runtime/internal-error` path.
  if (typeof target !== "object" || !isObjectValue(target)) {
    const rendered = typeof index === "number" ? renderInteger(index) : index;
    throw nonObjectReceiverRejection(`[${rendered}]`, target);
  }
  // Object indexing: a key that is not a present theta-side name on the object
  // is the missing-object-key panic (`theta/runtime/missing-object-key`).
  const key = index as string;
  const obj = target as { readonly [k: string]: ThetaValue };
  if (!Object.prototype.hasOwnProperty.call(obj, key)) {
    throw new MissingObjectKeyPanic(`missing object key: ${renderSourceDerived({ kind: "key", text: key })}`);
  }
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
 *   - otherwise → the member value.
 *
 * The registered `null member access: .<field>` template is sourced from
 * diagnostics/code-registry-runtime.md (`<field>` is a category-5 source-
 * derived identifier rendered bare); so is the non-object-receiver template.
 */
export function evaluateMemberAccess(target: ThetaValue, field: string): ThetaValue {
  if (target === null) {
    throw new NullMemberAccessPanic(`null member access: .${field}`);
  }
  if (typeof target === "object" && !isObjectValue(target)) {
    throw nonObjectReceiverRejection(`.${field}`, target);
  }
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
function summariseNonResultOperand(value: ThetaValue): string {
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
