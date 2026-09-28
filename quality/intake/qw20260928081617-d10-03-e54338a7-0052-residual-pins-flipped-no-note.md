---
id: pending
title: Commit e54338a7 (bug 0159) flipped the witness cells bug record 0052's residuals 1-3 name as pinning silence (group (k), d4, d5) to RED refusals, and 0052 carries no note for it, though it carries one for the later 0093 and 0176 re-pins of the same witness
lens: D10
status: intake
verdict: pending
locations:
  - docs/bugs/0052-inline-object-duplicate-field-names-silent-last-wins.md:294-305
  - docs/bugs/0052-inline-object-duplicate-field-names-silent-last-wins.md:321-332
  - docs/bugs/0052-inline-object-duplicate-field-names-silent-last-wins.md:817-847
  - tests/inline-object-duplicate-field-name.test.ts:738
  - tests/inline-object-duplicate-field-name.test.ts:783
  - tests/inline-object-duplicate-field-name.test.ts:1257-1258
  - tests/inline-object-duplicate-field-name.test.ts:1284-1537
  - docs/bugs/0159-inline-field-name-stop-masks-duplicate.md:3-5
  - docs/bugs/0159-inline-field-name-stop-masks-duplicate.md:848-859
  - docs/bugs/0159-inline-field-name-stop-masks-duplicate.md:937-943
sites: 3
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Commit e54338a7 (bug 0159) flipped the witness cells bug record 0052's residuals 1-3 name as pinning silence (group (k), d4, d5) to RED refusals, and 0052 carries no note for it, though it carries one for the later 0093 and 0176 re-pins of the same witness

## Observation
Three residuals in bug 0052's `## Fix (0.84.0)` point into its witness, `tests/inline-object-duplicate-field-name.test.ts`, as pins of a silent disposition. Residual 1 lists six stop-masked shapes, "Measured, all silent", and says "Pinned as group (k) of the witness". Residual 2 says `{a as "w": integer, a as "w": string}` is silent, "Pinned as d4". Residual 3 says `{"a": string, "a": integer}` is silent, "Pinned as d5". Commit `e54338a7` (fix(bug-0159), v0.93.0) re-pinned those cells. At the 0052 fix commit `f856fd33` they were `CONTROL … stays silent`. At HEAD they are `RED … is refused` / `is one key twice`. None of the pointers now resolves to what the record says it pins. 0052 has 0 mentions of 0159. It does carry two appended notes for later re-pins of this same witness: 0093 (h1/i1, :817) and 0176 (k2, :837). Bug 0159's own "Discharge notes appended" list does not include 0052.

## Evidence
**Claim side (residual 1):** docs/bugs/0052-inline-object-duplicate-field-names-silent-last-wins.md:294-305
```
  1. *A stop position masks a duplicate, and the A2 throw stays reachable
     through it.* The comparison ends at the first field-name position the
     interior cannot read as `Ident ":"`, and such a position also ends the
     comparison of every body enclosing it. Measured, all silent and all still
     minting the duplicate `required` this report owns:
     `{a: integer, : x, a: boolean}` and
     `{a as "w": integer, a: string, a: boolean}` (root `["a","a"]` /
     `["a as \"w\"","a","a"]`), `{"a": string, a: integer, a: boolean}`,
     `{p: {c: 1, : y, c: 2}, p: 3}` and `{p: {q: {c: 1, : y, c: 2}, r: 4}, p: 3}`
     (root `["p","p"]`, so `ajv.compile` throws A2's message), and
     `{a: 1 a: 2, a: 3}` (a completed field not followed by `,`). Pinned as
     group (k) of the witness, and stated in the row's *Trigger* so the boundary
```

**Claim side (residuals 2 and 3):** docs/bugs/0052-inline-object-duplicate-field-names-silent-last-wins.md:321-332
```
  2. *The `as "WireName"` rename inside an inline body is still unparsed*
     (§Non-goals). Re-derived at this HEAD: G1/G2/G4 load `[]`, and the whole
     pre-colon text becomes the property name. The settled reading for the
     rename+duplicate edge is that the rename is one of the stops, so
     `{a as "w": integer, a as "x": string}` is silent (its two property names
     differ — consistent with G1) and so is
     `{a as "w": integer, a as "w": string}`, which still lowers one last-wins
     property beside `required: ["a as \"w\"","a as \"w\""]`. Pinned as d4.
  3. *A quoted field name is not a `Field`.* `{"a": string, "a": integer}` is
     silent and lowers one property keyed `"a"` beside a two-item `required` —
     the defect's own shape at a position the row excludes, and 0045
     §Non-goals' malformed-interior family. Pinned as d5.
```

**Evidence side: the cells at HEAD**, tests/inline-object-duplicate-field-name.test.ts:
```
738:  it("RED d4 (an `as` rename inside an inline body): the key is the whole pre-colon text", () => {
783:  it('RED d5 (a quoted field name): `{"a": string, "a": integer}` is one key twice', () => {
1257:describe("bug 0052 (k) — a malformed entry contributes no key and curtails no comparison", () => {
1258:  it("RED k1 (a nameless entry): `{a: integer, : x, a: boolean}` is refused", () => {
1284:  it('RED k2 (a quoted name ahead of a repeat): `{"a": string, a: integer, a: boolean}` is refused', () => {
1314:  it('RED k3 (a rename ahead of a repeat): `{a as "w": integer, a: string, a: boolean}` is refused', () => {
1344:  it("RED k4 (a malformed entry inside a NESTED body): `{p: {c: 1, : y, c: 2}, p: 3}` is refused TWICE", () => {
1457:  it("RED k7 (depth three): `{p: {q: {c: 1, : y, c: 2}, r: 4}, p: 3}` reports the outermost and the innermost bodies", () => {
1537:  it("RED k8 (a missing field separator): `{a: 1 a: 2, a: 3}` is refused", () => {
```

**Evidence side: the flip, by commit.** I ran `git show <c>:tests/inline-object-duplicate-field-name.test.ts | grep -n -E "it\([\"'](RED|CONTROL) (d3|d4|d5|k1|k3)\b"` at each commit:
- `f856fd33` (fix(bug-0052), v0.84.0): `CONTROL d4 … all three spellings stay silent`, `CONTROL d5 … stays silent`, `CONTROL k1 … stays silent and still mints the duplicate`, `CONTROL k3 … stays silent and still mints the duplicate`.
- `e54338a7` (fix(bug-0159), v0.93.0, 2026-08-15): `RED d4 … the key is the whole pre-colon text`, `RED d5 … is one key twice`, `RED k1 … is refused`, `RED k3 … is refused`.

`git log --oneline -- tests/inline-object-duplicate-field-name.test.ts` puts `e54338a7` directly after `f31eac45` (bug 0059) and `f856fd33`.

**Evidence side: the re-pinning record.** docs/bugs/0159-inline-field-name-stop-masks-duplicate.md:3-5 says the bug is 0052's residual 1: "Residual 1 of the bug 0052 fix (0.84.0, commit `f856fd33`), recorded there as `## Fix (0.84.0)` *Residuals* item 1". :848-859 lists the re-pinned cells: "In `tests/inline-object-duplicate-field-name.test.ts`: d4 (row 1 only; rows 2 and 3 stay silent, their pre-colon texts differing), d5, k1, k2, k3, k4, k6, k7 and k8". :937-943, "**Discharge notes appended:**", names 0160, 0154 and 0161, and does not name 0052.

**Evidence side: 0052's existing notes.** docs/bugs/0052-…md:817 `## Coordination note — bug 0093 landed (0.155.0)` (h1, i1) and :837 `## Note — cell k2 of this report's witness was re-pinned by bug 0176 (0.161.0)`. Neither mentions 0159 or the silence→refusal flip.

**Searches run in this session:**
- `grep -c "0159" docs/bugs/0052-inline-object-duplicate-field-names-silent-last-wins.md` → 0.
- `grep -n "^## " docs/bugs/0052-*.md | tail -3` → `## Provenance` (:753), the 0093 note (:817), the 0176 note (:837). No other appended section exists.
- `grep -n -E "it\([\"'](RED|CONTROL) (d4|d5|k[0-9])\b" tests/inline-object-duplicate-field-name.test.ts` → 11 hits. Every cell residual 1–3 names (d4, d5, k1–k4, k6–k8) is `RED`. Only k5 and k9 are `CONTROL`, and residual 1 does not name them as its shapes.

## Why this is a problem
Residuals 1–3 each cite a witness cell as the pin of an open, silent disposition. Anyone who follows those pointers finds cells that pin the opposite disposition, with no note in 0052 saying when or why. The record's own practice shows the expected step. When 0093 and 0176 re-pinned cells of this witness (h1/i1, k2), 0052 got a dated note saying which cell moved and under what authority. The 0176 note even describes k2's current expectation ("ahead of its unchanged `duplicate-inline-field-name` line"), and that expectation exists only because of 0159's flip, yet the flip itself is never recorded. The equivalent current witness does exist: the same cells, now RED under 0159's authority, plus 0159's own witness `tests/inline-object-field-name-comparison-key.test.ts`, which the same commit added.

## Suggested direction (non-binding, optional)
Append a note to 0052 in the 0176 note's idiom, recording that bug 0159 (0.93.0, `e54338a7`) closed residual 1 and residuals 2–3's row-1/quoted shapes, and re-pinned d4 (row 1), d5 and k1–k4/k6–k8 from silence to refusal. The residual text would stay as written.

## False-positive check
- **Is this pointer decay or claim truth?** The residuals' "Measured … silent" sentences are fix-time measurements, and I am not filing them. What I am filing is the "Pinned as group (k) / d4 / d5" pointers, which no longer resolve to a silence pin.
- **Was a note appended under another heading or bug number?** `grep -c "0159"` over 0052 → 0. The two appended sections name only 0093 and 0176.
- **Other representations:** test titles were checked above (11 cell titles). Coverage matrices and AGENTS.md: `grep -c "0052" docs/reference/coverage-matrix.md docs/plan_topics/coverage-matrix.md AGENTS.md` → 0 / 0 / 0, so no row carries these residuals.
- **Other affected records in this shard:** 0159's measured blast radius is "exactly those nine cells and no file outside this witness" (0159:857-859). No other shard record cites these cells, so the cluster is 0052 alone.
- **Related, left unfiled:** `6184e7c3` (bug 0233) later flipped d3 from `CONTROL … stays silent` to `RED … now draws the raw-key refusal`. In 0052, d3 appears only in a fix-time neutralisation count (Verification (i)), not as a pin of an open residual. That is a different root cause (a different sha), so I have not added it here.
- **Already filed:** none of the listed PTQ / pending filings concerns bug record 0052's witness pointers. The ones touching this test file are D7 harness-duplication filings.

## Triage
verdict: questionable — decay verified; the record's wording is a human's to change. Every excerpt and search reproduces. 0052:294-305 and :321-332 say residuals 1-3 are silent, "Pinned as group (k)" / "d4" / "d5". At f856fd33 those cells read `CONTROL d4 … all three spellings stay silent`, `CONTROL d5 … stays silent`, `CONTROL k1/k3 … stays silent and still mints the duplicate`. At e54338a7 (fix(bug-0159), v0.93.0) they read `RED d4/d5/k1/k3`. At HEAD, d4 (:738), d5 (:783), k1-k4 and k6-k8 (:1258-1537) are RED, and only k5/k9 stay CONTROL. `grep -c 0159` over 0052 → 0. 0052's only appended sections are the 0093 note (:817) and the 0176 note (:837). 0159:848-859 lists the nine re-pinned cells, and its Discharge notes (:937-943) name 0160/0154/0161 but not 0052. No other intake file or PTQ tracks e54338a7 as a flipping sha (d10-02 cites it only as a prior state), so this is not a duplicate. Nothing was deleted: the pointers still resolve to the same cells, and those cells now pin the opposite disposition. The repair is a new dated note in 0052 recording 0159's closure, not a mechanical re-point. This matches the sibling flipped-no-note rulings (triage: claude-opus-5-5)
