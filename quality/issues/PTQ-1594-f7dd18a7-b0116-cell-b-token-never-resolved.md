---
id: PTQ-1594
title: "Bug 0116's 0.128.0 fix record cites its live witness as H8a `CELL-B` in four places, but f7dd18a7 landed the cell as \"H8a-T (cell 63) — bug 0116\" and no test title or comment contains `CELL-B`"
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0116-question-unwrapped-interpolation-renders-null.md:872-875
  - docs/bugs/0116-question-unwrapped-interpolation-renders-null.md:913-920
  - docs/bugs/0116-question-unwrapped-interpolation-renders-null.md:935-938
  - tests/live/live-production-acceptance.test.ts:10671
  - tests/live/live-production-acceptance.test.ts:10719-10790
sites: 4
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0116's 0.128.0 fix record cites its live witness as H8a `CELL-B` in four places, but f7dd18a7 landed the cell as "H8a-T (cell 63) — bug 0116" and no test title or comment contains `CELL-B`

## Observation
The `## Fix (0.128.0)` section of bug 0116 names its live H8a leg by the token `CELL-B` at four sites: the landed-files list, "What shipped", Gates, and Verification (3). No test title or comment anywhere under `tests/` contains `CELL-B` as a word, and the token has never been in `tests/live/live-production-acceptance.test.ts` in any commit. The fix commit f7dd18a7 added the cell as `describe("H8a-T (cell 63) — bug 0116: …")`. Its commit message and the CHANGELOG entry both say "H8a cell 63". The record was written in the same commit and kept the pre-merge lane token, so the pointer has never resolved as written.

## Evidence
Claim side, `docs/bugs/0116-question-unwrapped-interpolation-renders-null.md:872-875`:
```
- `tests/live/live-production-acceptance.test.ts` — one additive H8a cell
  (CELL-B) driving both directions through a real model turn, H8a 60 → 61; plus
  one comment-only citation re-derivation (`interpolationTypeOf`) this diff
  moved.
```
`:913-920` (What shipped / Gates):
```
  `tests/interpolated-result-gate.test.ts` — 33 additive cells and §Fix (e)'s two
  comment corrections; `tests/live/live-production-acceptance.test.ts` — the
  additive H8a cell (CELL-B) and one citation re-derivation.
- Gates: witness `npx vitest run tests/interpolated-result-gate.test.ts` → **82
  passed (82)**; full default suite `npm test` → **325 files / 5980 tests
  passed**; `npm run typecheck` → clean; `npm run lint` → clean. Live: H8a
  CELL-B green against a real model inside the live-lock window, both directions
  proven.
```
`:935-938` (Verification (3)):
```
  green, zero reds. (3) H8a CELL-B run for real under the live-lock, red-proven
  by the same arm deletion (`sent ["xnull"]`, expected `["x1"]`) and green after
  restoration; it asserts `userTexts` / `systemNotes` read off the settled
  `SessionManager`, never `prompt()` resolving.
```

Equivalent witness, `tests/live/live-production-acceptance.test.ts:10671`:
```
// Bug 0116 (cell 63) — the runtime query-render read path: `evaluatePureExpression`
```
`:10719-10720`:
```
describe("H8a-T (cell 63) — bug 0116: a `?`-unwrapped operand behind a `${…}` query-template interpolation (Convention: live-host acceptance)", () => {
  it("renders the unwrapped Ok payload in the real outbound query text, and aborts before dispatch on the dropped Err early-return", async () => {
```
The Ok half asserts `okTurn.userTexts` `toEqual(["x1"])` and `okTurn.systemNotes` `toEqual([])`. The Err half asserts `errTurn.userTexts` `toEqual([])` plus `expectInterpolatedResultAbortNote(errTurn.systemNotes, …)`. Those are the `userTexts` / `systemNotes` observables and the `["x1"]` expectation that Verification (3) describes.

Searches (run this session):
- Test titles / tokens: `grep -rnw "CELL-B" tests/ | wc -l` → 0. (The non-word `grep -rn "CELL-B" tests/` returns 1 hit, `tests/array-ternary-common-type-union.test.ts:61` "THE CELL-BY-CELL CONTRACT.", which is unrelated.)
- History: `git log --oneline -S'CELL-B' -- tests/live/ | wc -l` → 0. The token was never in any live file.
- Landing: `git log --oneline -S "cell 63" -- tests/live/live-production-acceptance.test.ts` → f7dd18a7, the 0.128.0 fix commit. `git show f7dd18a7 -- tests/live/live-production-acceptance.test.ts | grep -n "CELL-B\|cell 6[0-9]"` shows only `cell 63` lines added.
- Same-commit origin: `git show f7dd18a7 -- docs/bugs/0116-question-unwrapped-interpolation-renders-null.md | grep -c "^+.*CELL-B"` → 4.
- Numbered title: `grep -n 'describe("H8a-T (cell 63)' tests/live/live-production-acceptance.test.ts | wc -l` → 1 (`:10719`).
- Test file names: the offline witness `tests/interpolated-result-gate.test.ts` exists (`ls`), so only the live leg's pointer is affected.
- Coverage matrix / AGENTS.md gate names: `grep -nw "CELL-D\|CELL-B" docs/reference/coverage-matrix.md AGENTS.md | wc -l` → 0.
- CHANGELOG (corroboration only): `grep -nw "CELL-D\|CELL-B" CHANGELOG.md | wc -l` → 0. `:4360-4362` reads "H8a cell 63 (Ok and Err halves through a real dispatched turn, red-proven both directions)".

## Why this is a problem
The record's live-verification claims ("H8a CELL-B green against a real model…, both directions proven" and "H8a CELL-B run for real under the live-lock, red-proven…") point at a name no test carries. The live file holds dozens of numbered H8a cells, so following the pointer finds nothing. The claim→evidence chain breaks at the pointer even though an equivalent cell exists. The witness is a tests/live/** cell, so it exists but the preflight gate does not prove it.

## Suggested direction (non-binding, optional)
Point the four `CELL-B` mentions at the landed title "H8a-T (cell 63) — bug 0116".

## False-positive check
- Representations covered: bug-doc landed-files/What-shipped/Gates/Verification lines (four sites quoted); test file names (the offline and live files exist); test titles and tokens (word-bounded grep → 0, numbered `describe` found at `:10719`); coverage-matrix rows and AGENTS.md gate names (0 hits); CHANGELOG (corroboration, `:4360-4362`).
- Not a later rename: `-S'CELL-B'` over `tests/live/` history returns no commit. f7dd18a7 wrote both the numbered cell and the token-bearing record.
- Different root commit from the bug 0113 `CELL-D` filing (36b6d6c4), so it is filed separately.
- No pending candidate in the list cites bug 0116.

## Triage
verdict: confirmed — the decayed pointer reproduces. docs/bugs/0116-question-unwrapped-interpolation-renders-null.md:873, :915, :919 and :935 name H8a `CELL-B`, but nothing in tests/ carries that token: `grep -rnw CELL-B tests/` gives 0, the only non-word hit is the unrelated "CELL-BY-CELL" at array-ternary-common-type-union.test.ts:61, and `git log -S'CELL-B' -- tests/live/` gives 0 commits. f7dd18a7 wrote all 4 `+…CELL-B` record lines together with the cell, and its commit message and CHANGELOG.md:4360-4362 both say "H8a cell 63". The one unambiguous equivalent is verified: tests/live/live-production-acceptance.test.ts:10719, describe "H8a-T (cell 63) — bug 0116: a `?`-unwrapped operand behind a `${…}` query-template interpolation (Convention: live-host acceptance)", with the `it` "renders the unwrapped Ok payload in the real outbound query text, and aborts before dispatch on the dropped Err early-return". It asserts okTurn.userTexts toEqual ["x1"] and okTurn.systemNotes toEqual [], then errTurn.userTexts toEqual [] plus expectInterpolatedResultAbortNote(errTurn.systemNotes, …), which matches Verification (3). The fix is a mechanical re-point of the four mentions to "cell 63" with the wording otherwise untouched. It is live-only (tests/live/**). No other intake file or PTQ tracks f7dd18a7; the 0113 CELL-D filing is sha 36b6d6c4. Form note: the candidate had no ## Triage heading, so one was added here (triage: claude-opus-5-5)
