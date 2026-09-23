// Shared stdlib member signatures and runtime argument arity/kind checks.

import { summariseNonResultOperand } from "./runtime-panics";
import type { ThetaValue } from "./value";

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
 * Bug 0315 — the per-parameter type descriptor a stdlib member's positional
 * argument is checked against. `"element"` and `"array"` exist only for the
 * `array<T>` table (`stdlib-array.ts`) — `T`, the receiver's own element type,
 * and "any `array<U>`" (for `concat`) respectively; neither descriptor is
 * meaningful outside an array receiver, so `string`/`object` signatures never
 * spell them. Defined once in this shared module, beside the belts' defect
 * errors above, rather than redeclared in each stdlib surface,
 * so the parser's type-check arm and the three runtime-belt dispatchers all
 * read ONE shape.
 */
export type StdlibParamKind = "string" | "integer" | "element" | "array";

/**
 * A stdlib member's declared signature: the positional-argument arity bounds
 * `[min, max]` (both the `type`-phase `stdlib-arity-mismatch` parse check and
 * the runtime dispatcher belt read this) and, for the arity range's own
 * indices, the per-parameter type descriptor the `stdlib-arg-type-mismatch`
 * parse check resolves against (the runtime dispatcher belt reads `params`
 * too, as of bug 0394 — arity and kind are its two concerns).
 */
export interface StdlibMemberSignature {
  readonly min: number;
  readonly max: number;
  readonly params: readonly StdlibParamKind[];
}

/**
 * Bug 0394 KIND belt — the sibling of the bug-0315 arity belt above. Reuses
 * the same `params` descriptors the parse-time `stdlib-arg-type-mismatch`
 * check resolves against, so the runtime and parse checks never drift on what
 * counts as the right kind. Runs AFTER the arity belt (arity is a precondition
 * of even indexing `args[i]`), so a wrong-kind argument on a laundered
 * receiver fails loudly here instead of reaching the switch below and
 * JS-coercing (or, for `replace`'s `from` position, diverging — bug 0394).
 * The `"integer"` arm rejects more than `typeof arg !== "number"`: a
 * non-integral `number` — fractional, `NaN`, or `±Infinity` — laundered
 * under an `integer` descriptor is the same kind of ToIntegerOrInfinity
 * coercion trap as a wrong-`typeof` value (bug 0402), so `Number.isInteger`
 * closes both the kind gap and the integrality gap in one conjunct.
 * `"element"` and an out-of-range index (an omitted optional argument) are
 * unchecked: `includes`/`indexOf` compare with `valuesEqual`, which is total
 * over any argument kind, and there is no descriptor to check for an argument
 * that was never supplied.
 */
export function assertStdlibArgumentKinds(
  member: string,
  signature: StdlibMemberSignature,
  args: readonly ThetaValue[],
): void {
  for (let i = 0; i < args.length; i += 1) {
    const kind = signature.params[i];
    const arg = args[i] as ThetaValue;
    if (kind === "string" && typeof arg !== "string") {
      throw new StdlibMethodArgumentKindDefectError(member, i, "a string", arg);
    }
    if (kind === "integer" && (typeof arg !== "number" || !Number.isInteger(arg))) {
      throw new StdlibMethodArgumentKindDefectError(member, i, "an integer", arg);
    }
    if (kind === "array" && !Array.isArray(arg)) {
      throw new StdlibMethodArgumentKindDefectError(member, i, "an array", arg);
    }
    // "element" / undefined: unchecked — includes/indexOf are total over any
    // argument kind (V2c valuesEqual), and an omitted optional arg has no
    // descriptor to check.
  }
}

/**
 * Bug 0315 runtime belt: a laundered receiver (a statically-unresolvable
 * value) reaches here without ever passing through the parse-time
 * `stdlib-arity-mismatch` check (`../parser/type-layer-checks.ts` defers on
 * an "unknown"-classified receiver), so a wrong-arity call would otherwise
 * fall through to unchecked `args[i] as …` casts in the dispatcher and forward
 * raw JS `undefined` into the host method (bug 0315 §Reproduction). Thrown
 * BEFORE the member switch, so no case ever sees an out-of-arity `args`. The
 * arity check is followed by the bug-0394 KIND check (same laundered-
 * receiver gap, one level down: a correct-arity call with a wrong-KIND
 * argument), so the belt now covers both arity and kind.
 */
export function assertStdlibMemberArguments(
  member: string,
  signatures: ReadonlyMap<string, StdlibMemberSignature>,
  args: readonly ThetaValue[],
): void {
  const signature = signatures.get(member);
  if (signature !== undefined) {
    if (args.length < signature.min || args.length > signature.max) {
      throw new StdlibMethodArgumentDefectError(member, signature.min, signature.max, args.length);
    }
    assertStdlibArgumentKinds(member, signature, args);
  }
}
