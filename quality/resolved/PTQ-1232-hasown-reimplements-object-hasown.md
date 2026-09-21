---
id: PTQ-1232
title: ajv-schema-validator.ts hand-rolls a hasOwn wrapper over Object.prototype.hasOwnProperty.call where ES2022 Object.hasOwn is the compiled-against library and the codebase's stated idiom
lens: D8
status: fixed
verdict: confirmed
locations:
  - src/seams/ajv-schema-validator.ts:67-69
  - src/seams/ajv-schema-validator.ts:143
  - src/seams/ajv-schema-validator.ts:212
  - src/seams/ajv-schema-validator.ts:255
  - src/seams/ajv-schema-validator.ts:294
sites: 5
fix_scope: module
d8_class: reimplemented
d8_host: src/seams/ajv-schema-validator.ts#hasOwn
wave: qw20260921183818
reported_by: lens-d8-simplification (anthropic/claude-fable-5)
date: 2026-09-21
---

# ajv-schema-validator.ts hand-rolls a hasOwn wrapper over Object.prototype.hasOwnProperty.call where ES2022 Object.hasOwn is the compiled-against library and the codebase's stated idiom

## Observation
`src/seams/ajv-schema-validator.ts` declares a private `hasOwn(target, key)` function whose body is `Object.prototype.hasOwnProperty.call(target, key)`, and calls it at four sites in the bug-0212 schema-translation pass. The project compiles against `"target": "ES2022"` / `"lib": ["ES2022", ...]` (tsconfig.json:3,6), where `Object.hasOwn` provides the same operation directly; `src/` already uses `Object.hasOwn` at 20 sites, and other modules cite it by name as the guard idiom (e.g. wire-translation.ts:383 "uses `Object.hasOwn`, per `resolveNamed` (`type-compat.ts`)").

## Evidence
The reimplementation — src/seams/ajv-schema-validator.ts:67-69:

```ts
function hasOwn(target: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}
```

Its four call sites (grep `hasOwn(` in the file): line 143 (`hasOwn(position.map, AJV_FILTERED_SCHEMA_PROPERTY)`), line 212 (`hasOwn(target, pattern)`), line 255 (`hasOwn(propertiesValue, AJV_FILTERED_SCHEMA_PROPERTY)`), line 294 (`hasOwn(schema, "patternProperties")`). Every call passes a non-null object and a string key.

The facility's own location: ECMAScript 2022 `Object.hasOwn(o: object, v: PropertyKey): boolean` (TypeScript `lib.es2022.object.d.ts`), enabled by tsconfig.json:

```json
"target": "ES2022",
"lib": ["ES2022", "ES2024.Collection"],
```

Feature-for-feature: `Object.hasOwn(o, k)` is specified as `HasOwnProperty(ToObject(o), ToPropertyKey(k))` — identical to `Object.prototype.hasOwnProperty.call(o, k)` for these four call sites (all plain-object receivers, string keys, including null-prototype records, which is the case `.call` exists to handle and `Object.hasOwn` handles equally).

Existing in-repo use of the facility: `grep -rn "Object.hasOwn" src/` — 20 hits across production-theta-producer.ts, binder-temperature.ts, structural-checks.ts, static-type-inference.ts, type-layer-walk.ts, type-compat.ts, subagent-envelope.ts, subagent-result-frames.ts.

## Why this is a problem
A three-line private function reimplements a standard-library function the build already targets and the codebase already uses and documents as its own-key-guard idiom. The wrapper adds a name to learn and a definition to maintain while providing nothing the platform call does not; the file's doc comment at line 126 even describes the mechanism in the long-form spelling ("tests membership with `Object.prototype.hasOwnProperty.call`"), so the indirection is not hiding any additional behaviour.

## Suggested direction (non-binding, optional)
Unproven hypothesis: the four call sites could call `Object.hasOwn` directly and the wrapper be deleted; the line-126 comment would follow. (The wider mixed idiom — 26 direct `Object.prototype.hasOwnProperty.call` sites elsewhere in `src/` — is repo-wide style variance outside this shard and is not claimed here.)

## False-positive check
- Reference search: `hasOwn` in this file has exactly the 4 call sites cited plus the declaration; it is not exported and no other module references it.
- Facility availability: tsconfig target/lib ES2022 verified; `node -e "typeof Object.hasOwn"` prints `function` on the toolchain in use; 20 existing `Object.hasOwn` uses in `src/` confirm no lint/style rule bans it.
- Semantics: no call site passes a primitive or symbol key, so the `ToObject`/`ToPropertyKey` coercions in `Object.hasOwn` cannot diverge from the `.call` form here.
- Exemption check: D8's durable exemptions name discovery-walk.ts#enumerateDirectory and production-theta-producer.ts#firstAdmittingArmProperties only — no match.
- Duplicate check: PTQ-0730 (hasOwn triplicated) concerns the proto-named test suite, not this production wrapper; no other filed issue names this declaration.
- Spec check: bug 0212's fix constraints (verdict equivalence, cache-key stability) concern the translation's output, not the spelling of the own-key test; no docs/spec_topics/ clause pins the `.call` form.

## Triage
verdict: questionable — accounting verified: `hasOwn` at ajv-schema-validator.ts:67-69 is byte-exact `Object.prototype.hasOwnProperty.call(target, key)`, private, with exactly four in-file callers (actual lines 138/210/245/289, minor drift from the cited 143/212/255/294; all object receivers + string keys, so `Object.hasOwn` is semantically identical); tsconfig target/lib ES2022 confirmed, `Object.hasOwn` used 20× in src/ vs 25 `.call` sites, `node` reports `typeof Object.hasOwn === 'function'`; no D8 exemption for this host (only discovery-walk#enumerateDirectory and production-theta-producer#firstAdmittingArmProperties); bug 0212's `hasOwnProperty` mentions describe AJV's internal `ownProperties` data-side read, not the seam's spelling, and no spec clause pins the `.call` form; not a duplicate of PTQ-0730 (test-side harness copy) — the simpler shape (inline `Object.hasOwn`, delete wrapper, update line-126 comment) is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): confirmed - D8 wave-1 batch ruling; triage equivalence verification trusted.
