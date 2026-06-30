// V3f / V3f-T — the `string` standard-library member seam.
//
// This module owns the `string` standard-library member surface of
// expressions.md §"Built-in methods and properties" (the EXPR code-keyed
// obligation area — no numbered REQ-IDs), evaluated on top of the V3a
// expression interpreter:
//
//   - the `string` members of the loom-1.0 stdlib table — the `length`
//     property (the UTF-16 code-unit count, matching JS `.length`, no grapheme
//     segmentation), `toLowerCase()` / `toUpperCase()` / `trim()` (the
//     locale-independent transforms), `startsWith(s)` / `endsWith(s)` /
//     `includes(s)` (each returning `boolean` with JS semantics), and
//     `split(sep)` (literal-only, returning `array<string>`, with the empty
//     separator decomposing into one string per UTF-16 code unit);
//   - `replace(from, to)` — the all-occurrences, single left-to-right
//     non-overlapping scan matching host `String.prototype.replaceAll`, with
//     `$`-sequences in `to` inserted literally (never interpreted as JS
//     replacement patterns) and an empty `from` returning the receiver
//     unchanged. The five normative reference vectors of expressions.md MUST
//     reproduce exactly;
//   - the static result element type of `array<T>.concat(array<U>)` — the least
//     upper bound `T ⊔ U` under the V2b `⊑` relation, the same LUB the
//     array-literal common-type rule computes (`integer ⊔ number = number`;
//     disjoint element types union to `T | U`).
//
// V3f-T (tests-task) declares the seam — the `evaluateStringMember` runtime
// dispatcher and the `concatElementType` LUB computation — and stubs the
// behaviour-bearing functions inertly so the failing tests compile and red on
// their own primary assertions:
//
//   - `evaluateStringMember` returns the inert `null` sentinel without
//     evaluating any member, so every result-value assertion reds (a `length`
//     count, a transform string, a `boolean` membership result, a `split`
//     array, or a `replace` reference vector);
//   - `concatElementType` returns the inert `null`-primitive sentinel without
//     computing the LUB, so every result-type assertion reds.
//
// No test reds on a compile error, a missing fixture, or a harness throw. The
// paired V3f implementation leaf fills these in (and wires member-access /
// method-call parsing into the V3a evaluator).

import type { CompatType, TypeEnv } from "../parser/type-compat";
import type { LoomValue } from "./value";

/**
 * Evaluate a `string` standard-library member on `receiver`: the `length`
 * property (called with `args === []`) or one of the method calls
 * (`toLowerCase` / `toUpperCase` / `trim` / `startsWith` / `endsWith` /
 * `includes` / `split` / `replace`), with the arguments already evaluated by
 * the V3a interpreter. Returns the member's loom value per the expressions.md
 * stdlib table and the normative `replace` reference vectors.
 *
 * V3f-T stubs this as the inert `null` sentinel: it evaluates no member, so
 * every value assertion reds on its own primary expectation. The paired V3f
 * leaf implements it.
 */
export function evaluateStringMember(
  receiver: string,
  member: string,
  args: readonly LoomValue[],
): LoomValue {
  return null;
}

/**
 * Compute the static result element type of `array<T>.concat(array<U>)` — the
 * least upper bound `T ⊔ U` of the receiver element type `left` and the
 * argument element type `right` under the V2b `⊑` relation, the same LUB the
 * array-literal common-type rule computes (`integer ⊔ number = number`;
 * disjoint element types union to `left | right`).
 *
 * V3f-T stubs this as the inert `null`-primitive sentinel: it computes no LUB,
 * so every result-type assertion reds. The paired V3f leaf implements it.
 */
export function concatElementType(
  left: CompatType,
  right: CompatType,
  env: TypeEnv,
): CompatType {
  return { kind: "prim", name: "null" };
}
