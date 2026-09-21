---
id: PTQ-1143
title: Object field declaration order is enforced by two independent runtime walks
lens: D4
status: fixed
verdict: confirmed
locations:
  - src/runtime/value.ts:340-345
  - src/runtime/value.ts:400-437
  - src/runtime/wire-translation.ts:280-282
  - src/runtime/wire-translation.ts:520-596
sites: 2
fix_scope: module
d4_class: parallel
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# Object field declaration order is enforced by two independent runtime walks

## Observation

`src/runtime/value.ts` and `src/runtime/wire-translation.ts` each contain a separate, non-shared implementation of the rule that a named schema's object keys must appear in schema declaration order. `buildObjectSchemaValue` reorders constructor-built records using a resolved `SchemaFieldOrder`, while `orderedEntries` reorders inbound wire-translated records using the `V5f` sidecar's `fieldOrder` list. Both functions are reached from different call sites and neither delegates to the other; the `rebuildUnder` doc-comment explicitly states that the inbound walk deliberately does not call `buildObjectSchemaValue` even though it establishes the same ordering rule.

## Evidence

`src/runtime/value.ts:340-345` documents the construction-side ordering obligation:

```typescript
 * The returned record's own-key order IS declaration order:
 * theta field names are identifiers (`[A-Za-z_][A-Za-z0-9_]*`), never
 * integer-like, so JS orders them by insertion. `evaluateObjectMember`'s
 * `keys()`/`values()` (stdlib-object.ts) and a bare `JSON.stringify` see
 * that unconditionally; the QRY-18 walk ... does not
```

`src/runtime/value.ts:400-437` implements that ordering:

```typescript
export function buildObjectSchemaValue(
  constructedFields: Record<string, ThetaValue>,
  typeName: string | null,
  resolveSchema: (name: string) => SchemaFieldOrder | undefined,
): { readonly [key: string]: ThetaValue } {
  if (typeName === null) {
    return constructedFields;
  }
  const decl = resolveSchema(typeName);
  if (decl === undefined) {
    return constructedFields;
  }
  if (decl.fields === undefined) {
    return brandSchemaValue(constructedFields, typeName);
  }
  const ordered: Record<string, ThetaValue> = {};
  for (const field of decl.fields) {
    if (Object.prototype.hasOwnProperty.call(constructedFields, field.name)) {
      defineRecordField(ordered, field.name, constructedFields[field.name] as ThetaValue);
    }
  }
  for (const key of Object.keys(constructedFields)) {
    if (!Object.prototype.hasOwnProperty.call(ordered, key)) {
      defineRecordField(ordered, key, constructedFields[key] as ThetaValue);
    }
  }
  return brandSchemaValue(ordered, typeName);
}
```

`src/runtime/wire-translation.ts:280-282` acknowledges the parallel ordering rule and the deliberate non-sharing:

```typescript
 * Branding goes through {@link brandSchemaValue} directly, never through
 * `buildObjectSchemaValue` (`value.ts`), even though this walk now establishes
 * the same declaration order that function does.
```

`src/runtime/wire-translation.ts:520-596` implements the inbound-side ordering:

```typescript
 * The fragment root's payload entries in the order the rebuilt record must
 * carry them: every field the sidecar's step-5 field-order list names, in
 * DECLARATION order, then every remaining payload entry in its existing
 * relative order.
 *
 * ...
 *
 * `expressions.md` §"Built-in methods and properties" fixes `keys()` to
 * "schema declaration order for named schemas" and qualifies that clause only
 * by whether the schema is named — not by how the value was produced — so a
 * record rebuilt from a MODEL-ordered payload is inside it, exactly as a
 * constructor-built one is (bug 0080 established the same order at
 * construction).
 */
function orderedEntries(
  value: { readonly [k: string]: unknown },
  index: SidecarIndex | undefined,
): readonly (readonly [string, unknown])[] {
  const entries = Object.entries(value);
  const fieldOrder = index?.fieldOrder;
  if (fieldOrder === undefined || entries.length < 2) {
    return entries;
  }
  const positions = new Map<string, number[]>();
  entries.forEach(([wireKey], position) => {
    const thetaKey = index?.wireToTheta.get(wireKey) ?? wireKey;
    const bucket = positions.get(thetaKey);
    if (bucket === undefined) {
      positions.set(thetaKey, [position]);
    } else {
      bucket.push(position);
    }
  });
  const ordered: (readonly [string, unknown])[] = [];
  const taken = new Set<number>();
  for (const declared of fieldOrder) {
    const position = positions.get(declared)?.shift();
    if (position !== undefined) {
      taken.add(position);
      ordered.push(entries[position] as readonly [string, unknown]);
    }
  }
  entries.forEach((entry, position) => {
    if (!taken.has(position)) {
      ordered.push(entry);
    }
  });
  return ordered;
}
```

## Why this is a problem

The two implementations are a load-bearing parallel truth: both must realize the exact same declaration-order rule because the spec fixes one key order for named schemas regardless of how the value was produced. If they drift—for example, one changes the tie-breaking order for undeclared payload keys, or one stops preserving the key set during reorder—then the same schema-typed value can serialize differently depending on whether it was constructed in Theta or arrived from model output. The read paths (`evaluateObjectMember`/`keys()`, bare `JSON.stringify`, and the QRY-18 outbound render) all consume the record's own key order, so any divergence is user-visible and spec-visible. Today both sites cover the same two cases (declared fields first in declaration order, remaining keys second in their original relative order), but they are maintained independently.

## Suggested direction (non-binding, optional)

A shared source of truth for the declaration-ordering algorithm (hypothesis): a runtime helper that both construction and inbound translation call, parameterized over the field-order source (resolved `SchemaFieldOrder.fields` versus sidecar `fieldOrder`).

## False-positive check

- Clone-scan map for this shard reported no clone groups covering either file, so this parallel was found by reading rather than by the scanner.
- The two implementations do not call each other; `rebuildUnder`'s doc-comment explicitly states the inbound walk avoids `buildObjectSchemaValue` for structural reasons.
- Both files are live production paths: `buildObjectSchemaValue` is imported by `src/runtime/statement-executor.ts` and `src/extension/production-theta-producer.ts`; `translateInbound` is imported by `src/binder/inbound-boundary.ts` and `src/extension/invoke-static-checks.ts`.
- The ordering rule is spec-anchored (`expressions.md` §"Built-in methods and properties"), not an incidental similarity.

## Triage

verdict: questionable — accounting verified: both excerpts match at the cited lines, both copies are live (`buildObjectSchemaValue` ← statement-executor/production-theta-producer/err-field-summary; `orderedEntries` ← `rebuildInbound` :406 via `translateInbound` ← src/runtime/inbound-boundary.ts, err-field-summary, invoke-static-checks — the filing's `src/binder/` path is wrong but immaterial), clone-scan lists no group for either file, and both realise the same two-step rule (declared names in declaration order, then remaining keys in original relative order); the copies differ in order source (resolved `SchemaFieldOrder` vs sidecar `fieldOrder`), wire→theta key mapping with repeated-key buckets, and pre-branches/branding, and `rebuildUnder`'s doc states structural reasons for not sharing, so the shared source of truth is a design decision for a human ruling (triage: claude-fable-5-1)

verdict: questionable — accounting re-verified independently: all four excerpts match byte-for-byte at value.ts:340-345/400-437 and wire-translation.ts:280-282/520-596; both copies realise the identical two-step rule (declared names in declaration order, then remaining entries in original relative order) that expressions.md:118 pins for `keys()`; both are live — `buildObjectSchemaValue` ← statement-executor.ts:1297 + production-theta-producer.ts:8260, `orderedEntries` ← rebuildInbound:406 ← `translateInbound` ← src/runtime/inbound-boundary.ts:24 + err-field-summary.ts (the filing's `src/binder/inbound-boundary.ts` path is wrong and `invoke-static-checks.ts` does NOT import it — immaterial, liveness holds via production-theta-producer/theta-composition-producer); clone-scan map lists no group for either file; no tracked issue covers this parallel (d9-02 is a D9 breakdown of wire-translation.ts, different root cause); the copies differ in order source, wire→theta bucketing, `__proto__`-safe null-prototype record, and pre-branches, and rebuildUnder:278-291 states structural reasons for not sharing — parallel class: shared source of truth is a human design ruling, never confirmed (triage: claude-fable-5-1)

verdict: questionable — accounting re-verified independently a third time: all four excerpts byte-exact at value.ts:340-345/400-437 and wire-translation.ts:280-282/520-596; coverage claim holds — both copies realise the same two steps (declared names in declaration order, then remaining entries in original relative order, key-set preserving) that expressions.md:118 pins for `keys()`; both live — `buildObjectSchemaValue` ← statement-executor.ts:1297 + production-theta-producer.ts:8224, `orderedEntries` ← rebuildInbound:406 ← `translateInbound` ← src/runtime/inbound-boundary.ts (← production-theta-producer, theta-composition-producer) + err-field-summary.ts (filing's `src/binder/` path is wrong and invoke-static-checks.ts does NOT import it — immaterial); clone-scan map: no group for either file; no exemptions.json row; not a duplicate (d9-02 is a D9 breakdown of wire-translation.ts, d9-09 a D9 misplacement of the pure evaluator, PTQ-1086 keyorderof is a test helper); the copies differ in order source (resolved `SchemaFieldOrder.fields` vs sidecar `fieldOrder`), wire→theta key mapping with repeated-key buckets, `entries.length < 2` short-circuit vs three pre-branches, and plain-`{}`+defineRecordField vs null-prototype record, and rebuildUnder:278-291 states those as structural reasons for not sharing — D4 parallel: the shared source of truth is a design decision for a human ruling, never confirmed (triage: claude-fable-5-1)

verdict: confirmed — RATIFIED (human, 2026-09-21): accepted as confirmed - batch ruling, all D4/D9 intake items accepted.
