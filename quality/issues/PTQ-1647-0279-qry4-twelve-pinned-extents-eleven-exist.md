---
id: PTQ-1647
title: Bug 0279's record says 12 cells of tests/qry4-refused-annotation-withhold.test.ts pin the annotation-type-not-expression extent, but the file has 11 such assertions, and the record's own list of line anchors has 11 entries
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0279-same-construct-suppression-swallows-genuine-sibling-mistakes.md:213-217
  - docs/bugs/0279-same-construct-suppression-swallows-genuine-sibling-mistakes.md:352-354
  - docs/bugs/0279-same-construct-suppression-swallows-genuine-sibling-mistakes.md:413-417
  - tests/qry4-refused-annotation-withhold.test.ts:148-154
  - tests/qry4-refused-annotation-withhold.test.ts:278-479
sites: 3
fix_scope: localized
d10_class: overstated-strength
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0279's record says 12 cells of tests/qry4-refused-annotation-withhold.test.ts pin the annotation-type-not-expression extent, but the file has 11 such assertions, and the record's own list of line anchors has 11 entries

## Observation
Bug 0279's record counts the extent pins held by `tests/qry4-refused-annotation-withhold.test.ts` three times. Its Affected list says "12 cells", its §Fix Locks list says "12 pinned extents", and its shipped `## Fix (0.278.0)` route rationale says "the 12 pinned extents". It uses that count as lock evidence that route (2b) leaves every minted range byte-green. Each of the first two places lists the line anchors it counts, and each list has 11 entries. The file had exactly 11 extent assertions for this code at the record's filing HEAD, spread over 11 of its 14 `it()` cells. It still has 11 in the current tree. The record therefore claims one more extent lock than exists.

## Evidence
Claim side (re-read immediately before filing).

`docs/bugs/0279-same-construct-suppression-swallows-genuine-sibling-mistakes.md:213-217` (§Affected):
```
- Witnesses that pin the extent, three files:
  `tests/qry4-refused-annotation-withhold.test.ts` (12 cells assert this code's
  extent explicitly, `:319`, `:341`, `:363`, `:408`, `:429`, `:437`, `:445`,
  `:453`, `:477`, `:511`, `:520`, and the file's header states "RANGES ARE PART
  OF EVERY EXPECTATION", `:62`–`:65`);
```
`:352-354` (§Fix, Locks):
```
- `tests/qry4-refused-annotation-withhold.test.ts` — 12 pinned extents (`:319`,
  `:341`, `:363`, `:408`, `:429`, `:437`, `:445`, `:453`, `:477`, `:511`,
  `:520`). Re-pinned under (2a); untouched under (2b).
```
`:413-417` (`## Fix (0.278.0)`, route rationale):
```
and it leaves every minted range where bug 0124 put it — so
`src/diagnostics/diagnostic.ts`'s rendered column, the 12 pinned extents of
`tests/qry4-refused-annotation-withhold.test.ts`, the two of
`tests/fn-param-list-unclosed.test.ts` and bug 0272's remaining extent pins are
byte-green rather than re-pinned.
```
Both anchor lists contain 11 entries: 319, 341, 363, 408, 429, 437, 445, 453, 477, 511, 520.

Evidence side, current tree. `tests/qry4-refused-annotation-withhold.test.ts:148-154`: every extent assertion for `theta/parse/annotation-type-not-expression` goes through one builder:
```
function refusal(name: string, range: string): string {
  return line("error", REFUSAL_CODE, [["<name>", name]], range);
```
- `grep -c 'refusal("' tests/qry4-refused-annotation-withhold.test.ts` → **11**. The hits are at :278, :300, :322, :367, :388, :396, :404, :412, :436, :470 and :479.
- `grep -n 'REFUSAL_CODE' tests/qry4-refused-annotation-withhold.test.ts` → 2 hits: the declaration at :93 and the use inside `refusal` at :153. No assertion reaches the code any other way.
- Mapping each hit to its enclosing `it()` with `awk '/^\s*it\(/{it=NR} /refusal\("/{print NR" <- "it}'` gives 11 distinct cells, one extent each: A1, A2, A3, A6, B1, B2, B3, B4, C1, D1, D2.

Evidence side, at the record's filing HEAD. The record was filed in `d2d3d02f`. Per `git log -- tests/qry4-refused-annotation-withhold.test.ts`, the file's last change before that was `af108d2f`, so that blob is the one the record measured.
- `git show af108d2f:tests/qry4-refused-annotation-withhold.test.ts | grep -n 'refusal("'` → **11** hits at exactly :319, :341, :363, :408, :429, :437, :445, :453, :477, :511, :520. These are the record's own 11 anchors.
- The same awk over that blob gives `its=14 refusals=11`. So "12" is neither the count of extent cells (11) nor the file's total cell count (14).
- `git show af108d2f:… | grep -n 'line("error"\|annotation-type-not-expression\|4:1-'` finds no extent assertion outside those 11 `refusal(...)` calls. The `annotation-type-not-expression` hits at :2, :27 and :497 are comments.

The companion count in the same sentences does check out: `tests/fn-param-list-unclosed.test.ts` "two pinned extents" matches `git show d2d3d02f:tests/fn-param-list-unclosed.test.ts` :885-886 and :946-948, two `e(ANNOT_NOT_TYPE, …)` extents.

## Why this is a problem
The shipped fix record uses the number of extent pins as evidence that route (2b) moves no minted range: "the 12 pinned extents … are byte-green rather than re-pinned". The evidence behind that sentence is 11 pins, and the record's own anchor list has 11. A reader checking the lock, or a later fix counting what it must re-pin under a route-(2a)-style change, will look for a twelfth extent pin that does not exist. The wording claims more locking than the recorded evidence supports.

## Suggested direction (non-binding, optional)
A dated erratum note appended to 0279 could say that the qry4 extent lock is 11 cells (A1, A2, A3, A6, B1–B4, C1, D1, D2). That corrects all three occurrences without rewriting the dated text.

## False-positive check
- Other ways the extent could be asserted: I searched both the current file and the `af108d2f` blob for `REFUSAL_CODE`, `line("error"`, the literal code string and bare `4:1-` range literals. Every extent assertion is one of the 11 `refusal(...)` calls, so there is no twelfth pin in another form.
- Header counted as a cell: the §Affected sentence lists the header (`:62`–`:65`) separately with "and", after the 11 anchors. The header asserts nothing, and the Locks list and the Fix (0.278.0) sentence give "12" with no header in them.
- File changes after filing: `git log -- tests/qry4-refused-annotation-withhold.test.ts` shows `f0333c15`, `cc0a8fe7` and `d766b7a0`, all September 2026 quality-loop commits. The current count (11) equals the filing-HEAD count (11), so decay does not explain the gap. The miscount was there when the record was written.
- Existing filings: no pending or filed candidate in the lists above names bug 0279 or the qry4 extent count.
- Tests were not run. Counts were read from the default-suite file, which the green preflight makes current, and from the `git show` blob at the filing HEAD.

## Triage
verdict: questionable — accounting verified; rewording a record is a human ruling. Bug 0279 says "12" at :214, :352 and :414, and both of its anchor lists have 11 entries. `grep -c 'refusal("'` gives 11 in the current qry4 file (:278…:479; REFUSAL_CODE appears only at :93 and in the builder at :153; 14 it() cells). At filing, blob af108d2f (last change before d2d3d02f) had 11 hits at exactly :319…:520, with no extent pin in any other form. No erratum exists and nothing else tracks this. (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: D10 RULED REWORD (overstated-strength). APPEND EXACTLY the following block at the very end of docs/bugs/0279-same-construct-suppression-swallows-genuine-sibling-mistakes.md, nothing else; every existing line stays byte-identical:

### Correction note — 2026-09-28 (D10 wave qw20260928081617)

The three sites above that say 12 cells of tests/qry4-refused-annotation-withhold.test.ts pin the annotation-type-not-expression extent overcount by one: the witness has held 11 such refusal assertions since the cited commit (both anchor lists in this record also enumerate 11). Read 12 as 11; no cell is missing, the count was wrong.
