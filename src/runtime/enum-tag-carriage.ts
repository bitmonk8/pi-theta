// RFC-0006 §D3 — subagent-leg enum-tag carriage sidecar (bug 0342 §Fix).
//
// The PIC-59 envelope (`serializeOkEnvelope`, `subagent-envelope.ts`) is plain
// `JSON.stringify`: it collapses a boxed enum carrier (`makeEnumValue`,
// `value.ts`) to its bare wire string, so a value forwarded across a subagent
// hop loses its declaring-enum tag before the parent's decode ever sees it —
// the multi-hop misattribution bug 0342 files. The in-process attach leg has
// no such boundary and is unaffected: `wire-translation.ts`'s inbound retag
// (`rebuildInbound`) fires only on a bare wire string, so an already-boxed
// carrier forwarded in-process passes through with its deep declaring key
// intact. This module owns the two value-graph walks that carry the
// declaring key around the envelope boundary the attach leg never crosses:
//
//   - `collectForwardedEnumTags` (CHILD side, run before the child emits its
//     envelope): record each enum-boxed position's declaring tag, keyed by
//     its RFC-6901 JSON Pointer within the returned value.
//   - `retagForwardedEnums` (PARENT side, run after the parent's ordinary
//     immediate-callee decode): re-apply the recorded per-position tags,
//     restoring the value's declaring identity at every hop.
//
// Neither walk descends a `Result` payload — mirroring `rebuildInbound`'s own
// `isResultValue` passthrough (`wire-translation.ts`). The only `Result` this
// carriage could ever meet is an in-process callee's own tail `Ok(…)` /
// `Err(…)`, already theta-side-named and already tagged; descending into it
// could only strip a brand, never add one. Widening either walk to reach
// inside a `Result` is out of scope for this fix.
//
// Both walks are bounded by `MAX_JSON_DEPTH` (CIO-3): the counting discipline
// mirrors `subagent-envelope.ts`'s own bounded walks (`firstNonFiniteNumber`,
// `wireFormExceedsDepthCap`) — root at level 1, one level added per descent,
// fast-failing past the cap.
//
// `EnumTagEntry` is defined in `subagent-envelope.ts` (the wire owner of the
// PIC-59 envelope shape) and imported here TYPE-ONLY, so this module has no
// runtime dependency on it and `subagent-envelope.ts` has none on this module
// — avoiding a cycle between the two.
//
// Spec: pi-integration-contract/subagent.md (PIC-59, #subagent-return-envelope),
// runtime-value-model.md (§"Wire-name translation").

import { MAX_JSON_DEPTH } from "./depth-walk";
import {
  defineRecordField,
  enumDeclaringTagOf,
  isResultValue,
  makeEnumValue,
  type ThetaValue,
} from "./value";
import type { EnumTagEntry } from "./subagent-envelope";

/** RFC 6901 JSON Pointer reference-token escaping: `~` → `~0`, `/` → `~1` (mirrors `subagent-envelope.ts`'s own escaping). */
function escapePointerToken(token: string): string {
  return token.replace(/~/g, "~0").replace(/\//g, "~1");
}

/**
 * Pre-order walk collecting each enum-boxed position's declaring tag, keyed
 * by RFC-6901 pointer. An enum-boxed position is a LEAF for this walk's
 * purposes — the `makeEnumValue` boxed `String` carries nothing else worth
 * descending into — so the walk does not recurse past it.
 */
function walkCollect(value: ThetaValue, level: number, pointer: string, out: EnumTagEntry[]): void {
  if (level > MAX_JSON_DEPTH) {
    return;
  }
  const tag = enumDeclaringTagOf(value);
  if (tag !== undefined) {
    out.push({ p: pointer, k: tag });
    return;
  }
  if (isResultValue(value)) {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((element, index) => {
      walkCollect(element as ThetaValue, level + 1, `${pointer}/${index}`, out);
    });
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, member] of Object.entries(value)) {
      walkCollect(member as ThetaValue, level + 1, `${pointer}/${escapePointerToken(key)}`, out);
    }
  }
}

/**
 * Collect the declaring-enum tag of every enum-boxed position `value`
 * carries, as RFC-6901 pointer → tag entries in pre-order. Empty when
 * `value` carries no enum position — the caller (the child-side envelope
 * emit) omits the sidecar field entirely on that result, so an enum-free
 * return stays byte-identical on the wire.
 */
export function collectForwardedEnumTags(value: ThetaValue): readonly EnumTagEntry[] {
  const out: EnumTagEntry[] = [];
  walkCollect(value, 1, "", out);
  return out;
}

/**
 * Re-apply `tags`' per-position declaring keys onto `value`, at each mapped
 * pointer whose position is itself enum-boxed. At such a position, re-box
 * via `makeEnumValue` only when the mapped tag differs from the position's
 * current (immediate-callee) tag; a position with no mapped pointer, or a
 * mapped pointer whose position is not enum-boxed, is left exactly as the
 * immediate-callee decode produced it — the fallback, and never a throw, on
 * an unknown or hostile pointer.
 *
 * Containers are mutated IN PLACE (array elements by index assignment,
 * object fields via `defineRecordField`) so an existing schema brand and
 * every untouched sibling field survive unchanged. An object field is
 * rewritten through `defineRecordField`, never plain assignment: a
 * payload-derived position naming `__proto__` must not replace the record's
 * prototype (the 0031/0038/0343 hazard class).
 */
export function retagForwardedEnums(value: ThetaValue, tags: readonly EnumTagEntry[]): ThetaValue {
  if (tags.length === 0) {
    return value;
  }
  const byPointer = new Map<string, string>();
  for (const entry of tags) {
    byPointer.set(entry.p, entry.k);
  }
  return retagAt(value, "", 1, byPointer);
}

function retagAt(
  value: ThetaValue,
  pointer: string,
  level: number,
  byPointer: ReadonlyMap<string, string>,
): ThetaValue {
  if (level > MAX_JSON_DEPTH) {
    return value;
  }
  const currentTag = enumDeclaringTagOf(value);
  if (currentTag !== undefined) {
    const mapped = byPointer.get(pointer);
    return mapped !== undefined && mapped !== currentTag
      ? makeEnumValue(mapped, String(value))
      : value;
  }
  if (isResultValue(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    const mutable = value as ThetaValue[];
    for (let index = 0; index < mutable.length; index++) {
      const child = mutable[index] as ThetaValue;
      const retagged = retagAt(child, `${pointer}/${index}`, level + 1, byPointer);
      if (retagged !== child) {
        // Array elements are rewritten by index assignment — no `__proto__`
        // hazard on a numeric index (only an object field's own-key path
        // carries that hazard; see `defineRecordField` below).
        mutable[index] = retagged;
      }
    }
    return value;
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, ThetaValue>;
    for (const [key, member] of Object.entries(record)) {
      const childPointer = `${pointer}/${escapePointerToken(key)}`;
      const retagged = retagAt(member as ThetaValue, childPointer, level + 1, byPointer);
      if (retagged !== member) {
        defineRecordField(record, key, retagged);
      }
    }
    return value;
  }
  return value;
}
