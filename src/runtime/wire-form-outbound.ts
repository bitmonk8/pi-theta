// V2e / V2e-T — the outbound half of the wire-name translation boundary seam:
// theta value → wire-named JSON lowering (`translateOutbound`), plus the
// rename-free wire projection AJV gates read (`projectForValidation`). The
// inbound rebuild walk lives in `wire-translation.ts`; the shared stateless
// helper `isPlainObject` lives here and `encodePointerSegment` is re-exported
// from `../parser/schema-lowering`, both imported back by that module.

import { encodePointerSegment, type SchemaSidecar } from "../parser/schema-lowering";
import { isResultValue, type ThetaValue } from "./value";

export { encodePointerSegment };

/** Whether `value` is a plain (non-array, non-enum-boxed, non-null) JS object. */
export function isPlainObject(value: unknown): value is { readonly [k: string]: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof String)
  );
}

/**
 * Outbound translation input: a theta-side value plus the per-`$defs` sidecars
 * and the root `$defs` name, mirroring {@link InboundTranslationInput}.
 */
export interface OutboundTranslationInput {
  /** The theta-side value to lower to wire-named JSON. */
  readonly value: ThetaValue;
  /** Per-`$defs` sidecars keyed by `$defs` name, for recursion through `$ref`. */
  readonly sidecars: ReadonlyMap<string, SchemaSidecar>;
  /** The `$defs` name of the schema `value` conforms to. */
  readonly rootDef: string;
}

/**
 * Outbound wire-name translation (theta value → JSON). Walks the theta-side value
 * and produces wire-named JSON before AJV validation: object keys are rewritten
 * theta→wire, enum values collapse to their bare wire string, and the walk
 * recurses through arrays, nested objects, and — per-position, via the
 * sidecar's `refTargets` — `$ref` targets (bug 0424: a schema-typed field's
 * OWN renames translate at any depth, not only at the root).
 */
export function translateOutbound(input: OutboundTranslationInput): unknown {
  return lowerOutbound(input.value, input.sidecars.get(input.rootDef), "", input.sidecars);
}

/**
 * Recursively lower one theta-side value to its wire-named JSON form under
 * `sidecar`, tracked by `pointer` (the JSON Pointer into `sidecar`'s own
 * lowered fragment that `value` occupies). Renames object keys theta→wire,
 * collapses an enum value to its bare wire string (the declaring-enum tag
 * never appears in JSON output), and recurses through arrays and nested
 * objects. At a position whose sidecar carries a `$ref` target for `pointer`,
 * the walk re-enters `sidecars.get(refTarget)` at that schema's OWN root
 * (pointer reset to `""`) rather than continuing under the enclosing
 * sidecar — the same per-`$defs` recursion `translateInbound` already uses,
 * so a nested schema's renames apply at any depth without a flat wire-key
 * namespace (the round-1 F2 collision this recursion must not reintroduce).
 */
function lowerOutbound(
  value: ThetaValue,
  sidecar: SchemaSidecar | undefined,
  pointer: string,
  sidecars: ReadonlyMap<string, SchemaSidecar>,
): unknown {
  const refTarget = sidecar?.refTargets?.find((rt) => rt.pointer === pointer)?.defName;
  if (refTarget !== undefined) {
    return lowerOutbound(value, sidecars.get(refTarget), "", sidecars);
  }
  if (value instanceof String) {
    // An enum value is a boxed string carrying a non-enumerable declaring-enum
    // tag; its wire form is the bare string (the tag never crosses the wire).
    return value.valueOf();
  }
  if (Array.isArray(value)) {
    // An `array<Schema>`'s elements conform to the array's OWN element schema,
    // so QRY-18's "translation applied recursively" (renames every level, not
    // just the container's own object keys) must rename them under that
    // schema's sidecar too — passing `undefined` here dropped every
    // element-level rename (bug 0407). Elements keep the SAME pointer: an
    // `array<Schema>`'s element sidecar is already the element schema's own
    // root (0407), so the element position carries no `$ref` of its own here.
    return value.map((element) => lowerOutbound(element, sidecar, pointer, sidecars));
  }
  if (!isPlainObject(value)) {
    return value;
  }

  // Renames apply at the fragment's OWN root only (`pointer === ""`): a
  // deeper position's rename lives on the schema it `$ref`s to, reached above
  // by re-entering that schema's sidecar at pointer `""`, never by continuing
  // to read the enclosing sidecar's wire-name map at a non-root pointer.
  const thetaToWire = new Map<string, string>();
  if (sidecar !== undefined && pointer === "") {
    for (const entry of sidecar.wireNames) {
      thetaToWire.set(entry.theta, entry.wire);
    }
  }

  // Same rule as `rebuildInbound`'s record: `wireKey` below is a wire name
  // the schema author chose, and `schemas.md:30` admits an arbitrary JSON
  // property name there, so this key space is author-controlled without
  // restriction and may spell `__proto__` too.
  const result: { [k: string]: unknown } = Object.create(null) as { [k: string]: unknown };
  for (const [thetaKey, fieldValue] of Object.entries(value)) {
    const wireKey = thetaToWire.get(thetaKey) ?? thetaKey;
    const fieldPointer = `${pointer}/properties/${encodePointerSegment(wireKey)}`;
    result[wireKey] = lowerOutbound(fieldValue as ThetaValue, sidecar, fieldPointer, sidecars);
  }
  return result;
}

/**
 * Project a value to the wire-form shape an AJV gate reads structurally. Two
 * callers with differing retention: the `invoke<T>` return-value gate
 * validates the projection and hands the ORIGINAL value downstream, so there
 * the projection is disposable and never crosses the invoke boundary; the
 * `params:` defaults recovery (`#recoverDeclaredDefaults`,
 * `production-theta-producer.ts`) keeps the projection as the contracted
 * wire-form `DefaultedField.defaultValue`.
 *
 * AJV's `type: "string"` check is a `typeof` test, and the enum carrier
 * {@link makeEnumValue} builds is a boxed `String` (`typeof === "object"`).
 * This walk collapses exactly that gap — one boxed value, one level of
 * array, one level of plain-object field, recursively — and nothing else.
 *
 * Not {@link translateOutbound}: it renames nothing. The value at the
 * `invoke<T>` return boundary is the callee's own theta-side value, and the
 * lowered document that boundary validates against already emits
 * theta-side property names (`inbound-boundary.ts:68`'s doc-comment states
 * the same fact for the inbound direction), so a rename here would corrupt
 * an already-correct key. It also does not call {@link lowerOutbound}: that
 * walk always rebuilds its record and renames by sidecar — a materially
 * different job from this one's copy-on-change, rename-free walk, and
 * threading a "skip the rename" flag through a shared walk would leave both
 * jobs harder to read than two short functions.
 *
 * Copy-on-change — returning the SAME array/object reference whenever no
 * descendant needed collapsing — is load-bearing, not an optimisation: it
 * keeps "a payload with no named-enum value anywhere reaches the AJV seam
 * unchanged" structurally true rather than incidentally true (GOV-15,
 * docs/spec_topics/governance/source-language-stability.md:5).
 */
export function projectForValidation(value: ThetaValue): unknown {
  if (value instanceof String) {
    // The boxed enum carrier's wire form is its bare string — the same
    // collapse `lowerOutbound` performs for the outbound direction.
    return value.valueOf();
  }
  if (Array.isArray(value)) {
    let changed = false;
    const projected = value.map((element) => {
      const next = projectForValidation(element);
      if (next !== element) {
        changed = true;
      }
      return next;
    });
    return changed ? projected : value;
  }
  if (isResultValue(value)) {
    // `Result` is not a lowerable type form (schema-subset.md §"Lowering
    // Algorithm" step 3), so no position a `returnSchema` describes can hold
    // one; descending would differ from the gate above only at positions AJV
    // places no constraint on, and this projection exists solely for AJV's
    // eyes. Mirrors `rebuildInbound`'s own `isResultValue` arm.
    return value;
  }
  if (!isPlainObject(value)) {
    return value;
  }
  let changed = false;
  const projected: { [k: string]: unknown } = Object.create(null) as { [k: string]: unknown };
  for (const [key, fieldValue] of Object.entries(value)) {
    const next = projectForValidation(fieldValue as ThetaValue);
    if (next !== fieldValue) {
      changed = true;
    }
    projected[key] = next;
  }
  return changed ? projected : value;
}
