---
id: PTQ-1565
title: "Bug 0104's 0.127.0 fix record says its live cell carries \"the literal token `CELL-C` in its title and header\" and cites it as `CELL-C` three more times, but 590fc43e landed tests/live/tools-field-shape-refusal-live-cell.test.ts with no `CELL-C` anywhere"
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0104-tools-field-nonscalar-value-loads-empty-callable-set.md:948-950
  - docs/bugs/0104-tools-field-nonscalar-value-loads-empty-callable-set.md:998-1003
  - docs/bugs/0104-tools-field-nonscalar-value-loads-empty-callable-set.md:1038-1039
  - tests/live/tools-field-shape-refusal-live-cell.test.ts:1-3
  - tests/live/tools-field-shape-refusal-live-cell.test.ts:55-56
  - tests/live/tools-field-zero-entry-scalar-refusal-live-cell.test.ts:21-22
sites: 4
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0104's 0.127.0 fix record says its live cell carries "the literal token `CELL-C` in its title and header" and cites it as `CELL-C` three more times, but 590fc43e landed tests/live/tools-field-shape-refusal-live-cell.test.ts with no `CELL-C` anywhere

## Observation
The `## Fix (0.127.0)` section of bug 0104 says the new live cell carries "the literal token `CELL-C` in its title and header". It then uses `CELL-C` as the cell's name in its Gates and Verification lines (four mentions across three sites after the What-shipped line). The file path it names exists. That file contains no `CELL-C` today, and it contained none at the fix commit 590fc43e, which wrote both the file and the record. The file's header calls itself "not a numbered live-production-acceptance cell", and its `describe` title is "bug 0104 live cell — …". So the "renumber at merge" the record anticipates never happened: the cell landed under a descriptive title. The project already fixed the same stale token in a sibling file: 16ed0290 rewrote a 0206-era comment's "`CELL-C`" reference to this cell "to the file path alone", calling it "its lane-era CELL-C token name". The 0104 record was not updated.

## Evidence
Claim side, `docs/bugs/0104-tools-field-nonscalar-value-loads-empty-callable-set.md:948-950` (re-read before filing):
```
  - `tests/live/tools-field-shape-refusal-live-cell.test.ts` — **new**, one
    additive H8a cell carrying the literal token `CELL-C` in its title and
    header (the parent renumbers at merge). Registration-only observable off the
```
`:998-1003` (Gates):
```
  `npm run typecheck` (`tsc -p tsconfig.json --noEmit`) → clean. Live, under the
  live-lock: the H8a `CELL-C` cell green, red under neutralisation with the
  expected signature, green again after restore; the full H8a suite 69/69 across
  six files (68 pre-existing — 60 of them in
  `tests/live/live-production-acceptance.test.ts`, which is the "60 cells"
  baseline — plus `CELL-C`); H9a **11/11** across both files after one permitted
```
`:1038-1039` (Verification):
```
  neutralise/restore cycles). The default suite is green at 326 / 5984. The H8a
  `CELL-C` cell was red-proven in both directions. H9a ran for real on both
```

Evidence side, the equivalent witness. `tests/live/tools-field-shape-refusal-live-cell.test.ts:1-3`:
```
// Bug 0104 — standalone live registration cell (the 0065/0182
// standalone-live-file precedent; not a numbered live-production-acceptance
// cell).
```
`:55-56`:
```
describe("bug 0104 live cell — a mapping-valued `tools:` field is refused at live production load, ranged, and un-registers the theta", () => {
  it("un-registers the flow-mapping `tools:` theta while a sibling admitted-spelling theta over the SAME entry registers", async () => {
```
The sibling comment 16ed0290 corrected, `tests/live/tools-field-zero-entry-scalar-refusal-live-cell.test.ts:21-22` (today):
```
// the existing "discovery → registration" H8a cells and bug 0104's sibling
// cell (`tests/live/tools-field-shape-refusal-live-cell.test.ts`)
```
`git show 16ed0290 -- tests/live/` shows the removed line `-// cell (\`tests/live/tools-field-shape-refusal-live-cell.test.ts\`, \`CELL-C\`)`. Its message reads: "The 0206 witness comment still referenced the 0104 live cell by its lane-era CELL-C token name (the token-referencing-comment class); rewritten to the file path alone."

Searches (run this session):
- Test titles and tokens: `grep -rn "CELL-C" tests/ | wc -l` → 0. This includes any `CELL-C2`-style superstring. So `-t "CELL-C"` selects nothing.
- File history: `git log --oneline -S'CELL-C' -- tests/live/tools-field-shape-refusal-live-cell.test.ts | wc -l` → 0. The token was never in the file.
- At the fix commit: `git show 590fc43e:tests/live/tools-field-shape-refusal-live-cell.test.ts | grep -c 'CELL-C'` → 0.
- Same-commit authorship: `git show 590fc43e -- docs/bugs/0104-tools-field-nonscalar-value-loads-empty-callable-set.md | grep -c "^+.*CELL-C"` → 4 (the record's mentions were written in the fix commit).
- Test filenames: the cited path exists (`ls tests/live/ | grep tools-field` → `tools-field-shape-refusal-live-cell.test.ts`, `tools-field-zero-entry-scalar-refusal-live-cell.test.ts`). The offline witness `tests/tools-field-shape-refusal.test.ts` exists, with groups (D1)–(D7) at `:225`–`:790`. So only the live cell's token pointer is affected.
- Coverage matrix / AGENTS.md gate names: the record's live leg cites neither, so they do not apply.
- CHANGELOG (corroboration only): `grep -n "0104" CHANGELOG.md` → the entry at `:4368`. The 590fc43e commit message calls the cell a "standalone live registration cell", not `CELL-C`.

## Why this is a problem
The record identifies its live-verification leg by a token and asserts as fact that the token is "in its title and header". That identifying pointer has never resolved. "The H8a `CELL-C` cell green", "red-proven in both directions" and "69/69 … plus `CELL-C`" point at a name no test carries. The same stale token was already judged a defect and removed from a test comment in 16ed0290, but the record kept it. The cell is a tests/live/** witness: it exists, but the preflight gate does not prove it.

## Suggested direction (non-binding, optional)
Append a dated note that re-points the four `CELL-C` mentions at the landed title "bug 0104 live cell — …" in `tests/live/tools-field-shape-refusal-live-cell.test.ts`, and that records that no renumbering happened.

## False-positive check
- Representations covered:
  - bug-doc What-shipped/Gates/Verification lines (three sites quoted);
  - test file names (both the live and offline files exist);
  - test titles and tokens (`grep -rn "CELL-C" tests/` → 0; the `describe` at `:55`);
  - coverage-matrix rows (none cited);
  - AGENTS.md gate names (this is not a gate claim);
  - CHANGELOG (`:4368`, corroboration only).
- Honesty-marker check: "(the parent renumbers at merge)" warns that the token is provisional. It does not cover this case. No renumbering occurred, the header says the cell is deliberately unnumbered, and the record's own sentence says the token IS in the title and header. So the claim is contradicted by the landed file, not hedged.
- Not a later rename: history `-S` shows the token was never added to the file. 590fc43e wrote the file without it and wrote the record with it.
- Not a form-gate matter: the citation-symbol-form gate scores `path:line` / symbol citation form, not the resolution of a test-title token.

## Triage
verdict: confirmed — decayed pointer reproduces. The 0104 record has `CELL-C` at :949, :999, :1003 and :1039, and 590fc43e added all 4. `grep -rn CELL-C tests/` → 0, `git show 590fc43e:<cell> | grep -c CELL-C` → 0, and `-S` history → 0. 16ed0290 removed the same lane token from the 0206 comment. The equivalent is unambiguous: tests/live/tools-field-shape-refusal-live-cell.test.ts exists and was never deleted (--diff-filter=D → none). It holds a single describe, "bug 0104 live cell — a mapping-valued `tools:` field is refused at live production load, ranged, and un-registers the theta" (:55), with a single it, "un-registers the flow-mapping `tools:` theta while a sibling admitted-spelling theta over the SAME entry registers" (:56). The fix is a mechanical re-point by an appended note. No other intake file or PTQ tracks 590fc43e or 0104's CELL-C (triage: claude-opus-5-5)
