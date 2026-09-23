// The runtime access / depth / `?` evaluators (errors-and-results/
// error-model.md §"Runtime panics"): `evaluateIndexAccess`,
// `evaluateMemberAccess`, the INV-4 `enterInvokeFrame` depth guard, and the
// `evaluateQuestion` `?`-propagation seam. These raise the closed panic set
// declared in ./runtime-panics.ts and route gated receiver kinds through
// ./runtime-receiver-gate.ts. Split from ./runtime-panics.ts (PTQ-1261).

import { renderInteger, renderSourceDerived } from "../diagnostics/placeholder";
import {
  IndexOutOfBoundsPanic,
  InvokeDepthExceededPanic,
  MissingObjectKeyPanic,
  NullIndexAccessPanic,
  NullMemberAccessPanic,
} from "./runtime-panics";
import { nonObjectReceiverRejection } from "./runtime-receiver-gate";
import { isObjectValue, type ResultValue, type ThetaValue } from "./value";

/** The `invoke`-chain depth cap (INV-4 / invocation.md §"Invocation depth bound"). */
export const INVOKE_DEPTH_CAP = 32;

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
