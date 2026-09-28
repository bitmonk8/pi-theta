---
id: pending
title: "Bug 0124's 0.121.0 residual 1 says the `checkLetMismatch` refusal-plus-warning pairing is \"Not fixed here\" and \"Pinned in both directions as group (o), whose cell messages name 0093 and 0130 as the owners\", but af108d2f (bug 0222) re-pinned o1/o2 to the refusal ALONE and appended no note to 0124"
lens: D10
status: intake
verdict: pending
locations:
  - docs/bugs/0124-parsetype-trailing-punctuation-leniency.md:1572-1597
  - tests/annotation-nontype-text-refusal.test.ts:1844-1861
  - tests/annotation-nontype-text-refusal.test.ts:1891-1919
  - docs/bugs/0222-qry4-let-mismatch-reads-refused-annotation.md:642-644
  - tests/qry4-refused-annotation-withhold.test.ts
sites: 1
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0124's 0.121.0 residual 1 says the `checkLetMismatch` refusal-plus-warning pairing is "Not fixed here" and "Pinned in both directions as group (o), whose cell messages name 0093 and 0130 as the owners", but af108d2f (bug 0222) re-pinned o1/o2 to the refusal ALONE and appended no note to 0124

## Observation
Residual 1 of bug 0124's `## Fix (0.121.0)` records an eighth consumer, `checkLetMismatch`. The record says a nested refusal still draws `theta/parse/explicit-schema-mismatch` beside it, and that this is pinned in group (o) of `tests/annotation-nontype-text-refusal.test.ts`, whose cell messages name bugs 0093 and 0130 as owners. Commit af108d2f (bug 0222, v0.166.0) gated `checkLetMismatch` on the withhold. The same commit re-titled o1/o2 from `RESIDUAL` to `WITHHELD`, changed them to assert the refusal alone, and renamed the group "…withholds on a refused annotation (settled by bug 0222)". Their `why` strings now name 0222 through `WITHHOLD_OWNER`. Bug 0222's record says the flip is "recorded above rather than by a note on that report". 0124 has no mention of 0222. So the group (o) pointer resolves to cells that assert the opposite pairing, under a different owner.

## Evidence
Claim side, `docs/bugs/0124-parsetype-trailing-punctuation-leniency.md:1572-1578` and `:1585`, `:1595-1597`:
```
  1. **An EIGHTH consumer of refused annotation text survives, at a site two
     open reports own.** `checkLetMismatch`
     (`src/parser/query-schema-resolve.ts`, the QRY-4 explicit-schema check)
     reads `stmt.annotation` directly and converts it, so a refusal whose junk
     sits one level down under a well-formed outer constructor still draws
     `theta/parse/explicit-schema-mismatch` (W) beside it. Measured:
     ``let a: array<integer--> = @<integer>`x` `` → the refusal AND the warning;
...
     before the junk argument is inspected. **Not fixed here, deliberately.**
...
     Pinned in both directions as group (o), whose cell messages name 0093 and
     0130 as the owners, and stated as a labelled exception in the new row's
     *Trigger* so the row does not over-claim. Neither owner's claim is
```

Witness today, `tests/annotation-nontype-text-refusal.test.ts:1844` and `:1855-1858`:
```
// (o) THE EIGHTH CONSUMER — GATED BY THE WITHHOLD AS OF BUG 0222. §Fix (f)(1)
...
// drew `theta/parse/explicit-schema-mismatch` (W) beside the refusal. Bug
// 0222 added a leading `annotationSourceIsNotTypeExpression` guard to
// `checkLetMismatch`, joining the four sites above, so a refused annotation
// is now absent to this consumer too: o1 and o2 pin the WITHHELD reading (the
```
`:1891-1893`, `:1896-1899`, `:1909-1916`:
```
const WITHHOLD_OWNER =
  "bug 0222, which gated `checkLetMismatch` behind `annotationSourceIsNotTypeExpression` so a " +
  "refused `let` annotation reads as absent to the QRY-4 explicit-schema check, the same as it " +
describe(
  "bug 0124 (o) — the QRY-4 explicit-schema check withholds on a refused annotation (settled by bug 0222)",
  () => {
    it("WITHHELD (o1): a refusal nested under `array<…>` draws the refusal ALONE", () => {
...
      expectSequence(
        "o1 (let, array<integer-->, @<integer>)",
        "let",
        "array<integer-->",
        [refusalLine("a")],
        {
          rhsOrBody: "@<integer>`x`",
          why: `this consumer withholds the annotation as of ${WITHHOLD_OWNER}`,
```

The re-pinning record, `docs/bugs/0222-qry4-let-mismatch-reads-refused-annotation.md:642-644`:
```
- **Discharge notes appended:** 0093 and 0130 (both fixed; append-only,
  statuses unchanged). Bug 0124's witness group (o) is the flip site and is
  recorded above rather than by a note on that report.
```

Searches run this session:
- `git log --format='%h %s' -S"settled by bug 0222" -- tests/annotation-nontype-text-refusal.test.ts` → 1 hit, `af108d2f fix(bug-0222): checkLetMismatch consults the annotation withhold — v0.166.0`.
- `git show af108d2f -- tests/annotation-nontype-text-refusal.test.ts | grep -E '^[-+].*(describe\(|it\(|"(RED|GREEN|WITHHELD|RESIDUAL))'` → `-it("RESIDUAL (o1): a refusal nested under \`array<…>\` still draws \`explicit-schema-mismatch\` beside it"` / `+it("WITHHELD (o1): … draws the refusal ALONE"`, and the matching o2 pair.
- `grep -c 0222 docs/bugs/0124-parsetype-trailing-punctuation-leniency.md` → 0.
- `grep -n 0222 docs/bugs/0093-*.md docs/bugs/0130-*.md` → both carry a "Coordination note — bug 0222 landed (0.166.0)" (`0093:625`, `0130:1290`), so 0222 wrote notes to the two owners it names but not to 0124.

## Why this is a problem
Residual 1 is the record's statement of what is still open, and it names group (o) as the pin. Today that pin shows the residual is closed, and a different bug is named as the owner. A reader of 0124 alone would take `checkLetMismatch` as an open eighth consumer. The house convention for a later fix discharging a record's residual is a dated note on that record. 0124 carries two, "**Discharged by bug 0203**" for residual 4 (`:1668`) and "**Discharged by bug 0204**" for residual 5 (`:1682`). Residual 1 has none. The claim was true at 9eb1290d, and the removed `RESIDUAL (o1) … still draws` title in af108d2f confirms it. Only the pointer's current resolution is at issue.

## Suggested direction (non-binding, optional)
A dated discharge note on 0124, like its 0203/0204 notes, recording that af108d2f closed residual 1 and re-pinned o1/o2 to `WITHHELD`. The equivalent witness is the group (o) cells as they stand plus bug 0222's own `tests/qry4-refused-annotation-withhold.test.ts` (added by af108d2f per its `--stat`).

## False-positive check
- Representations covered: bug-doc residual pin (0124:1572-1597 quoted); test titles (the o1/o2 `it()` strings before and after, via `git show`); test file names (`tests/annotation-nontype-text-refusal.test.ts` and `tests/qry4-refused-annotation-withhold.test.ts` both exist); coverage matrix (not cited by 0124); AGENTS.md gates (not a gate claim); CHANGELOG (not relied on).
- Distinct from finding 01 of this filing set. That one is a different commit (76489c61) and different cells (groups (n)/(g)/(f)). The cluster rule is per commit, so the two are filed separately.
- Bug 0222's explicit choice not to write a note does not make the 0124 pointer resolve. The record 0124 still says "Not fixed here" with no dated qualifier on the pin.
- No pending candidate cites bug 0124 or bug 0222.

## Triage
verdict: questionable — decay verified; the record's wording is a human's to change. Every excerpt and search reproduces. 0124:1572-1597 (residual 1) says the checkLetMismatch refusal-plus-warning pairing is "Not fixed here", "Pinned in both directions as group (o), whose cell messages name 0093 and 0130". `git log -S"settled by bug 0222"` gives 1 hit, af108d2f. Its diff renames `RESIDUAL (o1)/(o2) … still draws explicit-schema-mismatch` to `WITHHELD (o1)/(o2) … refusal ALONE`. At HEAD, annotation-nontype-text-refusal.test.ts:1896-1919 has the describe "…withholds on a refused annotation (settled by bug 0222)", and o1/o2 `why` names WITHHOLD_OWNER (0222). `grep -c 0222` in 0124 gives 0. 0093:625 and 0130:1290 carry 0222 coordination notes, and 0222:642-644 says it deliberately chose not to add one to 0124. The group (o) id still resolves, but it now asserts the opposite of what 0124 says. The equivalent witness is real: o1/o2 plus tests/qry4-refused-annotation-withhold.test.ts. A re-point alone cannot fix this: the record needs a new dated discharge note (the 0203/0204 idiom at :1668/:1682), and adding one overrides 0222's recorded choice. Same ruling as the sibling 76489c61/0124 filing. On same-sha: the other af108d2f intake (d10-02-af108d2f-0222-cell-d) is a different record with a different root cause (a token that never resolved, not a flip), and this file sorts first anyway (triage: claude-opus-5-5)
