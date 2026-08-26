// V3h / V3h-T — the `object` standard-library member seam.
//
// This module owns the `object` standard-library member surface of
// expressions.md §"Built-in methods and properties" (the EXPR code-keyed
// obligation area — no numbered REQ-IDs), evaluated on top of the V3a
// expression interpreter and the V2c runtime value model. The members apply to
// any object value (schema-typed or anonymous):
//
//   - `keys()` returns the theta-side field names as an `array<string>`, in
//     schema declaration order for named schemas and insertion order otherwise
//     (at runtime both reduce to the object's own key order, established at
//     construction time);
//   - `values()` returns the field values as a heterogeneous `array<T>`, in the
//     same order as `keys()`;
//   - `has(k)` returns whether a theta-side name is present — `false` for an
//     unknown key, with no panic (the explicit safe-check).
//
// This surface PRESUPPOSES an object-value receiver. An enum value and a
// `Result` value both satisfy JS `typeof "object"`, but neither is an object
// value in the language's sense (runtime-value-model.md's enum / `Result`
// rows) — both entry points that reach this module (`applyStdlibMethod` in
// statement-executor.ts, `evaluateStdlibMethod` in
// production-theta-producer.ts) gate such a receiver ahead of
// `evaluateObjectMember`, rejecting it with the registered
// `theta/runtime/non-object-receiver` code (bug 0027 §Fix) before it ever
// reaches this module. `evaluateObjectMember`'s `default` arm below is
// therefore unreachable for an enum or `Result` receiver. It remains reachable
// for a genuine object receiver: the parse-time `theta/parse/unknown-method`
// rejection (expressions.md) covers a STATICALLY-RESOLVABLE receiver only, so
// an unknown member on a laundered object receiver — `fn f(x) { return
// x.bogus() }` applied to a schema value, which is parse-clean because the A2
// layer defers on an unannotated parameter — reaches the arm at runtime and its
// raw throw is reclassified as `theta/runtime/internal-error`, whose trigger is
// open-ended. That disposition is pre-existing and outside bug 0027's scope:
// the gate above is receiver-kind-shaped and does not claim the unknown-member
// case on an object receiver.
//
// The V3h implementation fills in the runtime member dispatch: `keys()` /
// `values()` follow the object value's own key order (established at
// construction time — schema declaration order for named schemas, insertion
// order otherwise), and `has(k)` tests own theta-side names only (never the JS
// prototype chain), returning `false` for an unknown key without panic.

import type { Diagnostic } from "../diagnostics/diagnostic";
import {
  classifyIndexReceiver,
  displayType,
  type CompatSite,
  type CompatType,
  type TypeEnv,
} from "../parser/type-compat";
import { StdlibMethodArgumentDefectError } from "./runtime-panics";
import type { StdlibMemberSignature } from "./stdlib-string";
import type { ThetaValue } from "./value";

/**
 * The type-phase object-index check (expressions.md §"Supported forms").
 * Reports `theta/parse/non-string-object-index` when an `obj[k]` index
 * expression addresses an object-value receiver with a non-`string` index `k`
 * (e.g. `obj[0]`) — an object value is keyed by its `string` theta-side names.
 * Returns no diagnostic for a `string` index, a non-object receiver (handled
 * by `theta/parse/non-indexable-receiver` / array indexing), or a
 * statically-unresolvable one (deferred to the runtime safety net).
 */
export function checkObjectIndex(opts: {
  readonly receiverType: CompatType;
  readonly indexType: CompatType;
  readonly env: TypeEnv;
  readonly site: CompatSite;
}): Diagnostic | undefined {
  const { receiverType, indexType, env, site } = opts;
  if (classifyIndexReceiver(receiverType, env) !== "object") {
    return undefined;
  }
  const isString =
    (indexType.kind === "prim" && indexType.name === "string") ||
    (indexType.kind === "literal" && indexType.typesAs === "string");
  if (isString) {
    return undefined;
  }
  // Message from diagnostics/code-registry-parse.md (`theta/parse/non-string-object-index`).
  return {
    severity: "error",
    code: "theta/parse/non-string-object-index",
    file: site.file,
    range: site.range,
    message: `object index must be string; got ${displayType(indexType)}`,
  };
}

/**
 * Evaluate an `object` standard-library member on `receiver`: one of the method
 * calls `keys()` / `values()` / `has(k)`, with the arguments already evaluated
 * by the V3a interpreter. Returns the member's theta value per the expressions.md
 * stdlib table (`keys()` / `values()` follow the object's key order; `has(k)`
 * returns `false` for an unknown key without panic).
 */
/**
 * The `object` standard-library member surface (expressions.md §"Built-in
 * methods and properties"): the allow-list the `type`-phase
 * `theta/parse/unknown-method` check consumes. Kept in lockstep with the
 * `evaluateObjectMember` dispatcher below. Object *field* access (`obj.field`)
 * is not a stdlib member and is not gated by this set.
 */
export const OBJECT_MEMBERS: ReadonlySet<string> = new Set(["keys", "values", "has"]);

/**
 * Bug 0315 — the `object` member arity/argument-type table (expressions.md
 * §"Built-in methods and properties", the `object` Signature column),
 * included per the fix's premeasure: no
 * committed fixture pins the silent wrong-arity behaviour of `keys()` /
 * `values()` / `has(k)`, so gating them carries no compatibility cost.
 * `checkMethodCall` (`../parser/type-layer-checks.ts`) reads it for the
 * `stdlib-arity-mismatch` / `stdlib-arg-type-mismatch` parse checks, and
 * `evaluateObjectMember` below reads it for the runtime belt. Hand-written,
 * kept paired with `OBJECT_MEMBERS` above the same way
 * `STRING_MEMBER_SIGNATURES` is paired with `STRING_MEMBERS`.
 */
export const OBJECT_MEMBER_SIGNATURES: ReadonlyMap<string, StdlibMemberSignature> = new Map([
  ["keys", { min: 0, max: 0, params: [] }],
  ["values", { min: 0, max: 0, params: [] }],
  ["has", { min: 1, max: 1, params: ["string"] }],
]);

export function evaluateObjectMember(
  receiver: { readonly [key: string]: ThetaValue },
  member: string,
  args: readonly ThetaValue[],
): ThetaValue {
  // Bug 0315 runtime belt — see the matching comment in
  // `evaluateStringMember` (`stdlib-string.ts`): a laundered object receiver
  // reaches here without the parse-time arity check (this arm is reachable
  // only past the bug-0027 non-object-receiver gate, which the two call sites
  // apply BEFORE this dispatcher — see this module's header comment), so a
  // wrong-arity call (e.g. `o.has()`) would otherwise fall through to the
  // unchecked `args[0] as …` cast below.
  const signature = OBJECT_MEMBER_SIGNATURES.get(member);
  if (signature !== undefined && (args.length < signature.min || args.length > signature.max)) {
    throw new StdlibMethodArgumentDefectError(member, signature.min, signature.max, args.length);
  }
  switch (member) {
    // `keys()` — the theta-side field names as an `array<string>`, in the
    // object value's own key order (schema declaration order for named schemas,
    // insertion order otherwise; both reduce to `Object.keys` at runtime).
    case "keys":
      return Object.keys(receiver);
    // `values()` — the field values as a heterogeneous `array<T>`, in the same
    // order as `keys()`.
    case "values":
      return Object.values(receiver) as ThetaValue[];
    // `has(k)` — whether a theta-side name is present. Own keys only (not the JS
    // prototype chain), so an inherited name such as `toString` reports absent;
    // an unknown key returns `false` with no panic (the explicit safe-check).
    case "has":
      return Object.prototype.hasOwnProperty.call(receiver, args[0] as string);
    default:
      throw new Error(`unknown object stdlib member: ${member}`);
  }
}
