---
id: PTQ-0094
title: SUBSET_PRIMITIVE_KINDS's docstring calls the set "the seven subset scalar/structural kinds" while the constant holds five entries, all scalar
lens: D2                     # the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/tool-call.ts:340-352
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# SUBSET_PRIMITIVE_KINDS's docstring calls the set "the seven subset scalar/structural kinds" while the constant holds five entries, all scalar

## Observation
The RFC 0002 provable-disjointness reduction in tool-call.ts keys on a constant
`SUBSET_PRIMITIVE_KINDS`. Its docstring describes it as "The seven subset
scalar/structural kinds a rendered type maps onto". The set contains five
members — `string`, `number`, `integer`, `boolean`, `null` — and no structural
kind: the neighbouring `subsetKinds` reducer explicitly treats `object` and
`array<T>` arms as unrepresentable (returns `undefined`), which is the
constant's whole point. The "seven" matches the schema subset's *Types* list
(which adds `object` and `array`), not the constant the sentence annotates.

## Evidence
src/runtime/tool-call.ts:340-352 — the claim and the five-member set:

```ts
/**
 * The seven subset scalar/structural kinds a rendered type maps onto
 * (schema-subset.md §"The subset"). `integer` widens into `number` for the
 * accepted-value intersection (an integer value is a valid `number`), so both
 * are retained and reconciled in `kindsDisjoint`.
 */
const SUBSET_PRIMITIVE_KINDS: ReadonlySet<string> = new Set([
  "string",
  "number",
  "integer",
  "boolean",
  "null",
]);
```

src/runtime/tool-call.ts:368-374 — the same file excludes the two structural
kinds from this set by design:

```ts
    const t = arm.trim();
    if (!SUBSET_PRIMITIVE_KINDS.has(t)) {
      // A non-primitive arm (named schema, enum, literal, array<T>, object,
      // format/pattern/refinement) is not enumerable as a flat kind here.
      return undefined;
    }
```

docs/spec_topics/schema-subset.md ("The subset", Types bullet) — the
seven-entry list the count was copied from:

```
- **Types**: `string`, `number`, `integer`, `boolean`, `object`, `array`, `null`.
```

## Why this is a problem
Doc narration contradicting the code it annotates, with a mechanical count
mismatch: the sentence says seven and says "structural", the constant holds
five and is named `PRIMITIVE`; `object` and `array` are deliberately outside
the set (the `subsetKinds` comment three lines below names them as the
unrepresentable arms). A reader auditing the disjointness front-run against
schema-subset.md is told this set covers the subset's full type vocabulary when
its correctness argument depends on it covering only the scalars. The same
stale-count class is already on file for other modules
(countable-frame-three-count-stale, type-grammar-rule-counts-stale,
enum-decl-variants-absent-claim-stale); none covers this site.

## Suggested direction (non-binding, optional)
Restate the docstring to what the constant is: the five scalar subset kinds
(the subset's `object`/`array` types are handled by falling through to the
runtime AJV boundary, per `subsetKinds`).

## False-positive check
- Counted the set members by reading the initializer (five string literals);
  `grep -c '"' ` over :346-352 confirms no member is hidden by formatting.
- Verified no alternate seven-member reading: the constant is consumed only by
  `subsetKinds` (:370), whose own comment names `array<T>`/`object` as
  non-members; nothing string-keys extra entries into the set anywhere
  (`grep -rn "SUBSET_PRIMITIVE_KINDS" src tests` → the declaration and the one
  `.has` read).
- Verified the source of the "seven": both schema-subset.md copies' Types
  bullet lists exactly seven type kinds including `object` and `array`, so the
  count describes the spec's list, not this constant.
- Checked already-filed intake and the triage log: the filed tool-call.ts
  finding (qw20260907130901-d2-05-tool-call-stub-narration-stale) covers the
  V14a-T stub-narration sites (:39-58, :185-186, :497-549, :806-831); this
  docstring (:340-345) is not among its locations and is a different root
  cause (a count restatement error, not tests-task scaffolding).

## Triage
verdict: confirmed — reproduced at src/runtime/tool-call.ts:339-350: the docstring says "seven ... scalar/structural" while the set it annotates holds five scalars, and :371 names object/array<T> as deliberate non-members; grep shows only the decl and one `.has`, so no seven-member reading exists and no filed finding covers this site. (triage: claude-opus-5)
