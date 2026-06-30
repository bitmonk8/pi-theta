// V3h / V3h-T — the `object` standard-library member seam.
//
// This module owns the `object` standard-library member surface of
// expressions.md §"Built-in methods and properties" (the EXPR code-keyed
// obligation area — no numbered REQ-IDs), evaluated on top of the V3a
// expression interpreter and the V2c runtime value model. The members apply to
// any object value (schema-typed or anonymous):
//
//   - `keys()` returns the loom-side field names as an `array<string>`, in
//     schema declaration order for named schemas and insertion order otherwise
//     (at runtime both reduce to the object's own key order, established at
//     construction time);
//   - `values()` returns the field values as a heterogeneous `array<T>`, in the
//     same order as `keys()`;
//   - `has(k)` returns whether a loom-side name is present — `false` for an
//     unknown key, with no panic (the explicit safe-check).
//
// The V3h implementation fills in the runtime member dispatch: `keys()` /
// `values()` follow the object value's own key order (established at
// construction time — schema declaration order for named schemas, insertion
// order otherwise), and `has(k)` tests own loom-side names only (never the JS
// prototype chain), returning `false` for an unknown key without panic.

import type { LoomValue } from "./value";

/**
 * Evaluate an `object` standard-library member on `receiver`: one of the method
 * calls `keys()` / `values()` / `has(k)`, with the arguments already evaluated
 * by the V3a interpreter. Returns the member's loom value per the expressions.md
 * stdlib table (`keys()` / `values()` follow the object's key order; `has(k)`
 * returns `false` for an unknown key without panic).
 */
export function evaluateObjectMember(
  receiver: { readonly [key: string]: LoomValue },
  member: string,
  args: readonly LoomValue[],
): LoomValue {
  switch (member) {
    // `keys()` — the loom-side field names as an `array<string>`, in the
    // object value's own key order (schema declaration order for named schemas,
    // insertion order otherwise; both reduce to `Object.keys` at runtime).
    case "keys":
      return Object.keys(receiver);
    // `values()` — the field values as a heterogeneous `array<T>`, in the same
    // order as `keys()`.
    case "values":
      return Object.values(receiver) as LoomValue[];
    // `has(k)` — whether a loom-side name is present. Own keys only (not the JS
    // prototype chain), so an inherited name such as `toString` reports absent;
    // an unknown key returns `false` with no panic (the explicit safe-check).
    case "has":
      return Object.prototype.hasOwnProperty.call(receiver, args[0] as string);
    default:
      throw new Error(`unknown object stdlib member: ${member}`);
  }
}
