// Structural named-node predicates over CompatType, without alias resolution.

import type { CompatType } from "./type-compat";

/** Test named leaves in structural order, stopping at the first match. */
function someNamedType(
  type: CompatType,
  predicate: (type: Extract<CompatType, { readonly kind: "named" }>) => boolean,
): boolean {
  switch (type.kind) {
    case "named":
      return predicate(type);
    case "array":
      return someNamedType(type.element, predicate);
    case "union":
      return type.arms.some((arm) => someNamedType(arm, predicate));
    case "object":
      return type.fields.some((field) => someNamedType(field.type, predicate));
    case "prim":
    case "literal":
      return false;
  }
}

/**
 * Whether `type` contains a `named` node anywhere in its structure (prim /
 * literal are leaves; array / union / object recurse). Used by
 * `inferCalleeReturnPayload` to defer any payload that would need
 * callee-namespace resolution — see that function's comment in type-layer-checks.ts for why.
 */
export function containsNamedType(type: CompatType): boolean {
  return someNamedType(type, () => true);
}

/**
 * Whether `type` was read, in whole or in part, out of a WITHHELD binder entry —
 * the marker for "this position holds a value this layer cannot type".
 *
 * The judgement sinks that consume a raw scope-map read use it to withhold a
 * verdict, which is the discipline `provableArgType`'s identity channel gives
 * the fn-arg row. Two mechanisms make the sentinel's unresolvability
 * insufficient on its own: `checkForIterand` (./control-flow.ts) rejects EVERY
 * non-`array<T>` iterand, resolvable or not; and `decide` (./type-compat.ts)
 * answers `named ⊑ array<…>` and `named ⊑ { … }` structurally under TYPE-7 /
 * TYPE-8 BEFORE it tests whether the name resolves.
 *
 * Recursive because that structural decision recurses: `[x]` against
 * `array<array<integer>>` rests entirely on `x`. Terminating without an `env`,
 * because no alias is unfolded here: the walk is over the finite type tree the
 * inference pass built, never over the alias graph. A declared alias's
 * right-hand side CAN carry this NAME — it is a source-text slice, not a
 * token — but bug 0143 §Fix (b) route 1 moved the test off the name and onto
 * the `withheld` provenance marker `CompatType`'s `named` arm carries
 * (./type-compat.ts): only `withheldBinderType()` sets it, and no
 * author-reachable producer (`annotationToCompatType` in type-layer-checks.ts) ever does, so an
 * alias's twin still stays sound regardless — it never carries the marker and
 * therefore only ever defers, never trips a false verdict.
 */
export function containsWithheldBinderType(type: CompatType): boolean {
  return someNamedType(type, (named) => named.withheld === true);
}
