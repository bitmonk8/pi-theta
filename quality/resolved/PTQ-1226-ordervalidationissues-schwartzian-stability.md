---
id: PTQ-1226
title: orderValidationIssues hand-rolls sort stability via a decorate-with-index/tiebreak/undecorate transform that Array.prototype.sort already guarantees
lens: D8
status: fixed
verdict: confirmed
locations:
  - src/runtime/query-error.ts:197-216
sites: 1
fix_scope: localized
d8_class: reimplemented
d8_host: src/runtime/query-error.ts#orderValidationIssues
wave: qw20260921183818
reported_by: lens-d8-simplification (anthropic/claude-fable-5)
date: 2026-09-21
---

# orderValidationIssues hand-rolls sort stability via a decorate-with-index/tiebreak/undecorate transform that Array.prototype.sort already guarantees

## Observation
`orderValidationIssues` (src/runtime/query-error.ts:197-216) implements ERR-14's
"stable ascending sort" by wrapping each issue in an `{ issue, index }` pair
(one `.map`), sorting with a comparator whose final tiebreak is `a.index -
b.index`, then unwrapping (a second `.map`). The comparator's three key
comparisons are code-point comparisons via `compareByCodePoint`. The
decorate/tiebreak/undecorate machinery exists solely to make the sort stable;
the key comparison itself needs none of it.

## Evidence
src/runtime/query-error.ts:200-216 (re-read before filing):

```ts
  return [...issues]
    .map((issue, index) => ({ issue, index }))
    .sort((a, b) => {
      const byPath = compareByCodePoint(a.issue.path, b.issue.path);
      if (byPath !== 0) return byPath;
      const byKeyword = compareByCodePoint(
        a.issue.schema_keyword,
        b.issue.schema_keyword,
      );
      if (byKeyword !== 0) return byKeyword;
      const byMessage = compareByCodePoint(a.issue.message, b.issue.message);
      if (byMessage !== 0) return byMessage;
      // Stable: fall back to input position for fully equal-key entries.
      return a.index - b.index;
    })
    .map((entry) => entry.issue);
```

The facility: ECMA-262 requires `Array.prototype.sort` to be stable since
ES2019 ("The sort must be stable", §23.1.3.30 SortCompare note; introduced by
the ES2019 change to Array.prototype.sort). This repository pins
`"node": ">=22.19.0"` (package.json:43-45) and compiles with
`"target": "ES2022", "lib": ["ES2022", "ES2024.Collection"]` (tsconfig.json:3,6),
so every runtime this code can execute on provides the guarantee. Feature-for-
feature at the call sites: `[...issues].sort(threeKeyComparator)` returns the
identical ordering, including identical relative order for fully equal-key
entries, because the engine's stable sort preserves input order exactly as the
`a.index - b.index` tiebreak does. The four production call sites
(src/binder/defaulting.ts:109, src/runtime/query-followup-render.ts:119,
src/runtime/typed-query-validation.ts:365, and this module's consumers) pass
small `ValidationIssue` arrays (per-attempt AJV issue lists) and read only the
returned array, so no observable behaviour depends on the wrapper objects.

## Why this is a problem
The mechanism is a hand-rolled reimplementation of a guarantee the platform
already provides: two extra full-array `.map` passes, N wrapper allocations per
call, and four extra comparator lines exist only to reproduce ES2019 sort
stability on a Node ≥ 22 / ES2022 codebase where the engine guarantee is
unconditional. The doc comment states the requirement ("The sort is stable:
equal-key entries retain their input relative order") but no code comment or
bug doc states a rationale for not trusting the engine guarantee — this is a
requirement restatement, not a documented belt with a distrust rationale, so
the D2 belt-and-braces precedent does not apply.

## Suggested direction (non-binding, optional)
Unproven hypothesis: `return [...issues].sort((a, b) => { ...three
compareByCodePoint comparisons...; return 0; })` — the copy for immutability
stays, the decorate/undecorate passes and the index tiebreak go. Output is
byte-identical under the ES2019+ stability guarantee.

## False-positive check
- Spec check: ERR-14 (errors-and-results/queryerror-variants.md) pins a
  "stable ascending sort keyed on the tuple (path, schema_keyword, message)";
  a native stable sort with the same comparator satisfies the clause
  identically — no behaviour is dropped, so no `challenges_spec` is needed.
- Engine-guarantee check: package.json engines `>=22.19.0` and tsconfig target
  ES2022 verified in-repo; ES2019 mandated stability predates both.
- Exemption check: no D8 durable exemption exists for query-error.ts or
  `orderValidationIssues` (the two listed exemptions cover discovery-walk.ts
  and production-theta-producer.ts).
- Duplicate check: PTQ-0357 (comparecodepoint-duplicated) tracks the
  duplication of `compareByCodePoint` across files — a different root cause
  (D4 clone of the comparator) from this filing (the stability scaffolding
  around one sort call); no other intake/issue file names
  orderValidationIssues.
- Liveness check: grep for `orderValidationIssues` across src/ shows 4
  importer files (binder/defaulting.ts, query-followup-render.ts,
  typed-query-validation.ts, plus the ajv-schema-validator.ts doc reference) —
  the function is live production code; this filing proposes no reachability
  change, only the removal of redundant scaffolding inside it.

## Triage
verdict: questionable — accounting verified: excerpt byte-matches src/runtime/query-error.ts:200-216 (decorate `.map`, three compareByCodePoint keys, `a.index - b.index` tiebreak, undecorate `.map`); package.json:44 `"node": ">=22.19.0"` and tsconfig.json:3,6 `ES2022` reproduce, so ES2019 mandated Array.prototype.sort stability holds unconditionally on every reachable runtime and the named facility covers the only need the scaffolding serves (input-order preservation for equal keys — tests/queryerror-variants.test.ts:60-74 would pass unchanged); ERR-14 (queryerror-variants.md:56) pins only "a stable ascending sort keyed on the tuple", satisfied identically by a native stable sort, so no challenges_spec needed; the doc comment and inline comment restate the requirement with no distrust rationale (D2 belt precedent does not apply); no D8 exemption for query-error.ts (exemptions.json rows cover discovery-walk.ts and production-theta-producer.ts only); live callers reproduce (defaulting.ts:109, query-followup-render.ts:119, typed-query-validation.ts:365; ajv-schema-validator.ts:423 is a doc reference); not tracked elsewhere (PTQ-0357 is D4 on compareCodePoint in compact-transcript/schema-lowering, a different root cause; the qw20260920183643 D8 shard-10 note mentions a stable-sort filing but no such intake/issue file exists) — the simpler shape (drop decorate/undecorate and index tiebreak, keep the copy) is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): confirmed - D8 wave-1 batch ruling; triage equivalence verification trusted.
