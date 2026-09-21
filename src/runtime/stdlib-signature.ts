// Shared stdlib member signatures and runtime argument arity/kind checks.

import { StdlibMethodArgumentDefectError, StdlibMethodArgumentKindDefectError } from "./runtime-panics";
import type { ThetaValue } from "./value";

/**
 * Bug 0315 — the per-parameter type descriptor a stdlib member's positional
 * argument is checked against. `"element"` and `"array"` exist only for the
 * `array<T>` table (`stdlib-array.ts`) — `T`, the receiver's own element type,
 * and "any `array<U>`" (for `concat`) respectively; neither descriptor is
 * meaningful outside an array receiver, so `string`/`object` signatures never
 * spell them. Defined once in this shared module, beside the belts' defect
 * errors in `runtime-panics.ts`, rather than redeclared in each stdlib surface,
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
