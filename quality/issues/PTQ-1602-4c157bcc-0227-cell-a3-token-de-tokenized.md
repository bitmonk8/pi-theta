---
id: PTQ-1602
title: "Bug 0227's 0.183.0 fix record names its H8a live witness cell `CELL-A3` twice, but its own fix commit 4c157bcc de-tokenized the cell and the token has never existed under tests/"
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0227-non-ascii-inline-object-field-name-admitted.md:583-591
  - docs/bugs/0227-non-ascii-inline-object-field-name-admitted.md:636-640
  - tests/live/inline-object-field-name-case-live-cell.test.ts:267-268
sites: 2
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0227's 0.183.0 fix record names its H8a live witness cell `CELL-A3` twice, but its own fix commit 4c157bcc de-tokenized the cell and the token has never existed under tests/

## Observation
Bug 0227's `## Fix (0.183.0)` identifies its live evidence by a cell token, `CELL-A3`. The token appears under "What shipped" (the new H8a cell in `tests/live/inline-object-field-name-case-live-cell.test.ts`) and again under Verification Obligation 3 ("the H8a `CELL-A3` cell run for real, green, and proved red …"). The token appears nowhere under `tests/`, and no commit on any ref ever added it there. The fix commit 4c157bcc says so itself: "+ 1 live cell in the existing standalone file (was CELL-A3, de-tokenized, zero artifacts)". The file path resolves. The token the record uses to name the cell inside that file does not.

## Evidence
Claim side (re-read just before filing), `docs/bugs/0227-non-ascii-inline-object-field-name-admitted.md:583-586`:
```
  - `tests/live/inline-object-field-name-case-live-cell.test.ts` — one new H8a
    cell (`CELL-A3`) over the shipped extension: a `let` binding annotated
    `array<{ éLan: string }>` on a typed query parses with an EMPTY diagnostic
    list (offline attribution guard, token-free), REGISTERS beside a
```
`:636-638`:
```
  `git checkout` / `git restore` / `git stash` never used. Obligation 2 — full
  suite green as quoted. Obligation 3 — the H8a `CELL-A3` cell run for real,
  green, and proved red in the other direction against the neutralised fix (the
```

Evidence side: the cell the token stood for, by position (the only bug-0227 describe in the file), `tests/live/inline-object-field-name-case-live-cell.test.ts:267-268`:
```
describe("a residue field-name key under a generic argument draws the raw-key refusal alone — the case rule stays silent (bugs 0227 + 0233)", () => {
  it("refuses `let r: array<{ éLan: string }> = ...` with exactly inline-field-name-not-identifier, never binding-case-mismatch (bug 0227's subject preserved)", async () => {
```
At 4c157bcc the same describe read `"a residue field-name key under a generic argument registers and drives cleanly (bug 0227)"` (`git show 4c157bcc:tests/live/inline-object-field-name-case-live-cell.test.ts`, :311). It carried no `CELL-A3` token then either.

Searches (all run in this session):
- Test bodies and titles: `grep -rn "CELL-A3" tests | wc -l` → **0**.
- Test filenames: `find tests -iname "*cell-a3*" | wc -l` → **0**.
- History under tests/, all refs: `git log --all --format=%h -S"CELL-A3" -- tests | wc -l` → **0**.
- Fix-commit message: `git log -1 --format=%B 4c157bcc` contains "(was CELL-A3, de-tokenized, zero artifacts)".
- Bug-doc witness lines: `grep -rn "CELL-A3" docs | wc -l` → **2**, both in this record (:584, :637).
- Coverage matrix: `grep -c "0227" docs/plan_topics/coverage-matrix.md docs/reference/coverage-matrix.md` → **0** / **0**.
- AGENTS.md gate names: `grep -c "CELL-A3" AGENTS.md` → **0**.
- CHANGELOG (corroboration only): `grep -c "CELL-A3" CHANGELOG.md` → **0**. The 0227 entry (:3535-3543) says "+ one live cell" with no token.

## Why this is a problem
The record's live evidence is keyed to a name that its own fix commit removed before landing. A reader following "the H8a `CELL-A3` cell" finds no cell by that name. The file contains two describes, and only position and prose tie the bug-0227 one to the token. The cell is under `tests/live/**`, so it is not gate-proven. The record words it as one recorded live run. (What that cell asserts today was changed after the fix. That is a separate root cause, filed separately in this shard under 6184e7c3/c79568be.)

## Suggested direction (non-binding, optional)
Replace the `CELL-A3` token in both places with the cell's describe title (the bug-0227 describe at `:267`), which is how sibling records name de-tokenized live cells.

## False-positive check
- Representations covered: bug-doc witness lines (grep over docs), test filenames (`find tests -iname`), test titles and bodies (`grep -rn tests`, plus the historical blob at 4c157bcc), coverage-matrix rows (both files), AGENTS.md gate names, and CHANGELOG (corroboration). Hit counts are above.
- The token never resolved under tests/ on any ref, so the cluster key is the fix commit 4c157bcc. No other record in this shard cites `CELL-A3`.
- Not already filed: `grep -rl "CELL-A3" quality/intake` → only this file and this shard's d10-05 filing (which quotes the claim for a different root cause). The pending de-tokenized candidate (300ee733, b0150) concerns a different record and commit.

## Triage
verdict: confirmed — bug 0227 :584 and :637 name the live cell `CELL-A3`. That token resolves nowhere: grep over tests gives 0, find -iname gives 0, `git log --all -S` under tests gives 0, and fix commit 4c157bcc's message says "(was CELL-A3, de-tokenized, zero artifacts)". The equivalent is unambiguous and verified: tests/live/inline-object-field-name-case-live-cell.test.ts, describe "a residue field-name key under a generic argument draws the raw-key refusal alone — the case rule stays silent (bugs 0227 + 0233)" (:267), the file's only bug-0227 describe (the other, :122, is bug 0154). At 4c157bcc it read "…registers and drives cleanly (bug 0227)" (:311). So the fix is a mechanical re-point of both token sites to that describe title. The cell's later flip is d10-05's separate 6184e7c3 root cause. No other intake/PTQ tracks 4c157bcc. The candidate had no ## Triage heading, so triage added it (triage: claude-opus-5-5)
