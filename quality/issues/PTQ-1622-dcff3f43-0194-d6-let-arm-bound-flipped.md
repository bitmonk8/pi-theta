---
id: PTQ-1622
title: "Bug 0194's 0.113.0 Fix names cell `d6` of tests/loop-element-withhold-binding-scoped.test.ts as the `let`-arm BOUND (\"unmoved, before and after\", \"Cell `d6` pins it unmoved\"), but dcff3f43 (bug 0199) flipped d6 to assert the `fn-arg-type-mismatch` emission; 0194's discharge note does not re-point d6"
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0194-unprovable-marking-by-object-identity-shared-alias-element.md:889-890
  - docs/bugs/0194-unprovable-marking-by-object-identity-shared-alias-element.md:957-960
  - docs/bugs/0194-unprovable-marking-by-object-identity-shared-alias-element.md:1045
  - docs/bugs/0194-unprovable-marking-by-object-identity-shared-alias-element.md:1053-1059
  - tests/loop-element-withhold-binding-scoped.test.ts:758-791
  - tests/loop-element-withhold-binding-scoped.test.ts:90-100
  - docs/bugs/0199-let-arm-marks-borrowed-object-suppression.md:1023-1026
sites: 3
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0194's 0.113.0 Fix names cell `d6` of tests/loop-element-withhold-binding-scoped.test.ts as the `let`-arm BOUND ("unmoved, before and after", "Cell `d6` pins it unmoved"), but dcff3f43 (bug 0199) flipped d6 to assert the `fn-arg-type-mismatch` emission; 0194's discharge note does not re-point d6

## Observation
Bug 0194's `## Fix (0.113.0)` cites cell `d6` of its own witness three times as the pin holding the `let` arm's suppression unmoved: in the "What shipped" exclusion bullet, in the witness inventory, and in residual 1. At a7d15562 (bug 0194), d6 was `PIN d6: the \`let\` arm's own suppression is UNMOVED by a two-loop-arm fix` and asserted `CLEAN`. Commit dcff3f43 (bug 0199, v0.120.0) retitled it `RED d6` and changed it to assert one `theta/parse/fn-arg-type-mismatch`, located `@14:14-14:16`. The same commit appended a "Discharged in 0.120.0" paragraph to 0194's residual 1. That paragraph says the `let` arm was fixed, but it does not mention d6. The three d6 citations still describe the cell as an unmoved bound.

## Evidence
Claim side, `docs/bugs/0194-unprovable-marking-by-object-identity-shared-alias-element.md:889-890`:
```
    measured. Cell `d6` pins the `let` arm's behaviour as a BOUND — unmoved,
    before and after — and residual 1 below carries the evidence.
```
`:957-960` (the witness inventory under "§Fix (d) constraint 6 — the witness is new"):
```
    direction), the (d) fences (two provable loops, minted-literal element,
    typed-`let` sink, named-object-vs-element discrimination, `d5`'s withhold
    survival, `d6`'s `let`-arm bound), and the (e) group pinning the
    `resultBindings` carry in both arms with two controls. Whole ordered
```
`:1045` (residual 1): "WHOLE-array object rather than an element. Cell `d6` pins it unmoved."

Discharge paragraph dcff3f43 added, `:1053-1059`:
```
     **Discharged in 0.120.0** by bug
     [0199](./0199-let-arm-marks-borrowed-object-suppression.md), which takes the
     `let` arm as its subject and ships route 1 there: the arm resolves one
     `recorded` object — a `{ ...rhsType }` twin iff the initialiser is not a
     proof — and records, marks, MINTS and inherits off that one object, so the
     provenance carry this fix introduced at the loop arms is extended to the
     membership a `let` mints. **One sentence of this item is corrected by that
```
The rest of that paragraph, through `:1072`, discusses the `resultBindings` pair and residual 2. It does not name d6.

Witness today, `tests/loop-element-withhold-binding-scoped.test.ts:758`, `:766-768`, `:786-787`:
```
  it("RED d6: the `let` arm marks a borrowed object too, and the verdict it withholds is owed — bug 0199", () => {
...
    // writer as its subject and its §Fix (d)(2) is the authority for this flip.
    //
    // Gone: the `CLEAN` premise. It inverts into the one located emission
...
      expected: one(FN_ARG, fnArg("hs", 0, "a", "array<string>", "array<integer>")),
      located: [`error ${FN_ARG} @14:14-14:16`],
```
File header ledger, `:100`: "RED at HEAD, green under bug 0199's fix at the remaining writer: (d) d6." d6 was also removed from the "Green at HEAD and green under the route" list (`:101-104`).

Flip record on the other side, `docs/bugs/0199-let-arm-marks-borrowed-object-suppression.md:1023-1026`:
```
   - **§Fix (d)(2) — cell `d6` flipped under this report's authority.**
     `tests/loop-element-withhold-binding-scoped.test.ts` cell `d6` asserts the
     mismatch its own control `d6ctl` already asserts, located `@14:14-14:16`, with
     `sites` and fixture byte-identical and `d6ctl`'s verdict byte-equal. No other
```

Searches run this session:
- `git log --oneline -S'RED d6' -- tests/loop-element-withhold-binding-scoped.test.ts` → 1 hit: `dcff3f43 fix(bug-0199): key the let arm's unprovable mark to the binding it was recorded for — v0.120.0`.
- `git show dcff3f43 -- tests/loop-element-withhold-binding-scoped.test.ts` → `-  it("PIN d6: the \`let\` arm's own suppression is UNMOVED by a two-loop-arm fix — bug 0194 residual territory"` / `+  it("RED d6: …")`, and `-      expected: CLEAN,` / `+      expected: one(FN_ARG, …)`.
- `git show dcff3f43 -- docs/bugs/0194-…md` → a single hunk. It adds the discharge paragraph at residual 1 and contains no `d6` token.
- `grep -c "d6" docs/bugs/0194-unprovable-marking-by-object-identity-shared-alias-element.md` → 3 (the three claim lines above, `:889`, `:959`, `:1045`).
- `grep -n -i "flip" docs/bugs/0194-…md` → 3 hits (`:919` e4 flipped by 0190, `:986`, `:1115`). None concerns d6.

## Why this is a problem
Three sentences in the record name d6 as the pin that holds the `let`-arm suppression "unmoved, before and after". Today d6 asserts the opposite verdict, the emission that 0199's fix produces. A reader who follows the pointer finds a cell titled `RED d6 … owed — bug 0199` asserting a diagnostic, where the record says it pins `[]`. The discharge paragraph shows the `let` arm moved, but it leaves the witness citation unchanged. The claim was true at a7d15562, where the removed `PIN d6 … UNMOVED` title and `expected: CLEAN` show it. Only the pointer's current resolution is at issue.

## Suggested direction (non-binding, optional)
Add one clause to the 0.120.0 discharge paragraph, or a dated coordination note, recording that dcff3f43 flipped d6 under 0199 §Fix (d)(2). It should name d6 (now `RED d6`) and 0199's own witness `tests/let-arm-withhold-binding-scoped.test.ts` (exists) as the current pins of the `let` arm.

## False-positive check
- Representations covered: the bug-doc witness pins (all three d6 citations quoted); the test title (d6's `it()` string before and after, via `git show dcff3f43`); the test file name (`tests/loop-element-withhold-binding-scoped.test.ts` exists, and so does `tests/let-arm-withhold-binding-scoped.test.ts`); coverage matrix (0194 cites none); AGENTS.md gates (not a gate claim); CHANGELOG (not relied on).
- Honesty marker considered: the "Discharged in 0.120.0" paragraph is the culture working for the let-arm DEFECT, and this filing does not target it. It never re-points the d6 WITNESS citation, and the two other d6 citations (`:889-890`, `:957-960`) sit outside residual 1 with no note at all.
- Other pins in the same Fix section still resolve: a1, b1–b3, c1–c9, d1–d5, e1, e2 are all `it()` titles in the witness (grep `it\("[A-Z ]*…:` enumerated them). d5 is `PIN d5`, still the withhold-survival pin the record names. Live H8a cell for bug 0194 exists (`tests/live/live-production-acceptance.test.ts:8653` describe "H8a-T — bug 0194 …").
- No pending candidate cites bug 0194 or dcff3f43 (grep over quality/intake and quality/issues → 0 hits). Other records in this shard: 0193 mentions `u13e`, the other cell dcff3f43 restated, only as "restated under bug 0199's authority". That is accurate, so no second record is affected.

## Triage
verdict: questionable — decay verified: 0194 :889-890, :959 and :1045 still cite `d6` as the `let`-arm bound ("unmoved, before and after"), but dcff3f43 retitled `PIN d6: … UNMOVED …` (expected CLEAN, a7d15562 :1086) to `RED d6: … owed — bug 0199` asserting one fn-arg-type-mismatch @14:14-14:16 (test :758-791, header :100), and 0199 :1023-1026 records the flip. dcff3f43's 0194 hunk (1 hunk, excluding the commit message) has no `d6` token, and the only intake/issues hit for dcff3f43 is this file. No equivalent pin exists: the 'unmoved' observable is gone, not moved, so a fix has to add a supersession note naming RED d6 / tests/let-arm-withhold-binding-scoped.test.ts. That is rewording the record, not a mechanical re-point, so a human should rule (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: D10 RULED REWORD (decayed-pointer). APPEND EXACTLY the following block at the very end of docs/bugs/0194-unprovable-marking-by-object-identity-shared-alias-element.md, nothing else; every existing line stays byte-identical:

### Coordination note — 2026-09-28, bug 0199 (0.120.0)

Commit dcff3f43 (bug 0199 fix, v0.120.0) retitled witness cell d6 in tests/loop-element-withhold-binding-scoped.test.ts from the PIN-unmoved shape this record cites to RED d6 owed to bug 0199, asserting one fn-arg-type-mismatch. The unmoved-before-and-after observable no longer exists. The Fix (0.113.0) wording above stands as a dated record; current disposition: docs/bugs/0199-let-arm-marks-borrowed-object-suppression.md.
