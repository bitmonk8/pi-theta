// The receiver-kind gate (bug 0027 §Fix, widened by bug 0393 §Fix): the
// registered `theta/runtime/non-object-receiver` runtime-defect-surface code,
// the closed `<receiver kind>` set it renders, and the single construction
// point (`nonObjectReceiverRejection`) every gated read routes through. Split
// from ./runtime-panics.ts (PTQ-1261); the rejection still surfaces through
// that module's `surfaceUnexpectedThrow` routing.

import { isEnumValue, isResultValue, type ThetaValue } from "./value";

/**
 * The runtime-defect-surface code for a deliberate receiver-kind gate (bug
 * 0027 §Fix) — a REGISTERED rejection, not an unanticipated throw, so it is a
 * second, distinct code from {@link INTERNAL_ERROR_CODE} even though both
 * route through {@link surfaceUnexpectedThrow} onto the same channels.
 */
export const NON_OBJECT_RECEIVER_CODE = "theta/runtime/non-object-receiver";

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
