// Bug 0177 — the total, prototype-blind summariser every position that embeds
// a `QueryError` payload field in a user-facing string must route through.
//
// JavaScript's default template-literal `ToString(...)` is a protocol lookup
// (`Symbol.toPrimitive`, then `toString`, then `valueOf`): a plain-prototype
// record finds `Object.prototype.toString` and yields the uninformative
// `[object Object]`; a null-prototype record (the shape
// `rebuildInbound` mints since bug 0173, `wire-translation.ts:370`) finds none
// of the three and raises `TypeError: Cannot convert object to primitive
// value`. Both are the same defect under two different masks — the renderer
// has no stringification rule and JavaScript's default supplies a different
// wrong answer depending on a prototype the renderer never looks at. For a
// directly-slash-invoked subagent-mode theta the SLSH-3 note is the ONLY
// user-facing surface for the failure (its transcript stays private), so the
// field's content is worth preserving where it can be rendered as a bounded,
// finite string, and worth falling back to a capped descriptor only where it
// cannot (QRY-18, `docs/spec_topics/query/query-escapes-stringification.md:16`).
//
// The law (bug 0177 §Fix (b), adjudicated):
//   1. a string renders verbatim — no quoting, no truncation, no escaping;
//   2. a number / boolean / bigint / undefined / null renders as
//      `String(value)` (`null` -> `null`);
//   3. an enum value (a boxed `String`) renders as its bare wire string;
//   4. any other object or array renders as compact `JSON.stringify`
//      (`summariseScrutinee`, `src/runtime/match-result.ts:88-89`);
//   5. except that when (4) cannot produce a bounded finite string —
//      `JSON.stringify` throws (a cycle) or returns `undefined`, or the
//      output exceeds a 200-character cap — the value renders as
//      `summariseNonResultOperand`'s capped descriptor instead
//      (`src/runtime/runtime-panics.ts:440`).
//
// Rule 5 reuses `summariseNonResultOperand` rather than duplicating its
// own-key-list logic — one descriptor implementation, two call sites that
// both need a bounded, non-throwing fallback for a value outside the
// contract the surrounding code was written against. The cycle half of rule
// 5 is detected by an explicit ancestor-stack walk (`hasCycle`, below)
// rather than by catching `JSON.stringify`'s `TypeError` — see that
// function's doc-comment for why.

import { isEnumValue, type ThetaValue } from "./value";
import { summariseNonResultOperand } from "./runtime-panics";

/** Rule 5's cap: the longest compact `JSON.stringify` output rule 4 accepts. */
const JSON_CAP = 200;

/**
 * Whether `value`'s object graph contains a cycle (a value reachable from
 * itself by following own keys) — the one shape `JSON.stringify` cannot
 * render, where it raises `TypeError: Converting circular structure to JSON`.
 * An explicit ancestor-stack walk rather than a `try`/`catch` around
 * `JSON.stringify` itself: this codebase forbids a broad `catch` (no
 * available narrow type — TS restricts a catch-clause annotation to `unknown`
 * / `any`, and `JSON.stringify`'s cycle error is a plain `TypeError` shared
 * with unrelated failure modes it does not distinguish), and the
 * `allow-broad-catch` exemption is reserved for a mandated Pi-SDK-boundary /
 * spec-mandated site, neither of which this is. `seen` tracks the CURRENT
 * ancestor chain, not every value visited: a value is removed on backtrack,
 * so two disjoint (non-cyclic) branches that happen to share a reference —
 * ordinary DAG sharing — do not false-positive as a cycle.
 */
function hasCycle(value: unknown, seen: Set<unknown>): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (seen.has(value)) {
    return true;
  }
  seen.add(value);
  const found = Array.isArray(value)
    ? value.some((item) => hasCycle(item, seen))
    : Object.keys(value).some((key) =>
        hasCycle((value as Record<string, unknown>)[key], seen),
      );
  seen.delete(value);
  return found;
}

/**
 * Render one `QueryError` payload field for embedding in a user-facing
 * string, per the law above. Total over any plain-data `ThetaValue`
 * (`src/runtime/value.ts:112-120`) — including a null-prototype record, which
 * a bare template substitution or `String(...)` cannot render at all.
 *
 * Not total beyond that contract: a `ThetaValue` field can never carry a
 * bigint (absent from the union) or an accessor/proxy-trapped object
 * (`buildObjectSchemaValue` and `translateInbound` mint only plain data), so
 * a nested bigint reaching rule 4's `JSON.stringify` (which throws "Do not
 * know how to serialize a BigInt") or a throwing getter/trap reaching the
 * key walk are both outside what this function is asked to render — the
 * same fails-loud posture `summariseNonResultOperand` documents for its own
 * proxy case (`src/runtime/runtime-panics.ts:435-439`).
 */
export function summariseErrorField(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  // An enum runtime value is a boxed `String`; render its bare wire string
  // rather than fall into the object arm below (`isEnumValue` is
  // prototype-blind — it consults a non-enumerable symbol brand, never a
  // prototype).
  if (isEnumValue(value as ThetaValue)) {
    return String(value);
  }
  // Any other object or array: rule 4's compact `JSON.stringify`, with rule
  // 5's fallback for the two ways it fails to produce a bounded finite
  // string — a cycle (checked explicitly before calling, above) or an
  // over-cap / `undefined` result (checked after).
  if (hasCycle(value, new Set())) {
    return summariseNonResultOperand(value as ThetaValue);
  }
  const json = JSON.stringify(value);
  if (json !== undefined && json.length <= JSON_CAP) {
    return json;
  }
  return summariseNonResultOperand(value as ThetaValue);
}
