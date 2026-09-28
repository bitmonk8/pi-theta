---
id: PTQ-1564
title: "Bug 0226's 0.176.0 fix record names its live H8a witness as tests/live/object-pattern-head-field-set-live-cell-CELL-B.test.ts, but 4d4cbee6 added the file without the -CELL-B suffix and that path has never existed"
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0226-declared-object-pattern-head-field-set-unchecked.md:683-687
  - tests/live/object-pattern-head-field-set-live-cell.test.ts:1-10
  - tests/live/object-pattern-head-field-set-live-cell.test.ts:122-123
  - tests/object-pattern-head-field-set-refusal.test.ts:150
sites: 1
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0226's 0.176.0 fix record names its live H8a witness as tests/live/object-pattern-head-field-set-live-cell-CELL-B.test.ts, but 4d4cbee6 added the file without the -CELL-B suffix and that path has never existed

## Observation
The `## Fix (0.176.0)` *Gates* bullet of bug 0226 names its live H8a witness by path: `tests/live/object-pattern-head-field-set-live-cell-CELL-B.test.ts`, "→ `Tests 1 passed (1)`". No file exists at that path, and no commit on any ref ever added one. The fix commit 4d4cbee6 added `tests/live/object-pattern-head-field-set-live-cell.test.ts`, which is the same path without the lane token. Its commit message says "standalone live cell (was CELL-B, de-tokenized …)". The repository later repaired the same stale lane-token filename in a test comment (f5cbee00, `tests/object-pattern-head-field-set-refusal.test.ts:150`), but the record still carries the tokened path.

## Evidence
Claim side (re-read just before filing), `docs/bugs/0226-declared-object-pattern-head-field-set-unchecked.md:683-687`:
```
  (baseline at HEAD: 366 / 7490). `npm run typecheck` → clean. `npm run lint` →
  clean. Live H8a
  `tests/live/object-pattern-head-field-set-live-cell-CELL-B.test.ts` →
  `Tests 1 passed (1)`; bug 0221's and bug 0219's live cells re-run green
  alongside it.
```

Evidence side, the equivalent witness (opened), `tests/live/object-pattern-head-field-set-live-cell.test.ts:1-2` and `:122-123`:
```
// Bug 0226 — a RESOLVED `match` object-pattern head is admitted with any field
// list at all; standalone live registration cell. This lane's parent renumbers
...
describe("bug 0226 — a resolved object-pattern head with an undeclared listed field is refused at live production load and un-registers the theta", () => {
  it("un-registers the extra-field theta while the declared-field sibling over the SAME match shape registers and drives —", async () => {
```
The sibling test comment that was already re-pointed, `tests/object-pattern-head-field-set-refusal.test.ts:150`:
```
// precedent, by tests/live/object-pattern-head-field-set-live-cell.test.ts.
```
(`git show f5cbee00` shows that line changed from `…-live-cell-CELL-B.test.ts.` to `…-live-cell.test.ts.`; commit message: "The 0221 witness cited its live cell by the lane-era tokened FILENAME (renamed at its merge)".)

Searches (all run in this session):
- Path existence: `find tests -name "object-pattern-head-field-set-live-cell-CELL-B.test.ts" | wc -l` → **0**. The unsuffixed file is present (205 lines).
- History, all refs: `git log --all --oneline -- tests/live/object-pattern-head-field-set-live-cell-CELL-B.test.ts` → **0** commits. `git show --name-status --format= 4d4cbee6 | grep live` → `A	tests/live/object-pattern-head-field-set-live-cell.test.ts`.
- Fix-commit message: `git log -1 --format=%B 4d4cbee6` contains "standalone live cell (was CELL-B, de-tokenized: 1 parenthesized + 1 bare token, zero artifacts)".
- Test filenames and bodies: `grep -rn -- "live-cell-CELL-B" tests | wc -l` → **0**.
- Bug-doc witness lines: `grep -rn -- "live-cell-CELL-B" docs | wc -l` → **3**, i.e. this record's :685 plus bug 0157's two `-CELL-B2` mentions (a different record, already filed as the 28c5c72b candidate). `grep -rn "object-pattern-head-field-set-live-cell" docs tests` finds the unsuffixed path in docs/bugs/0243 (:130, :457) and in two tests.
- Coverage matrix: `grep -c "0226" docs/plan_topics/coverage-matrix.md docs/reference/coverage-matrix.md` → **0** / **0**.
- AGENTS.md gate names: `grep -c -- "live-cell-CELL-B" AGENTS.md` → **0**.
- CHANGELOG (corroboration only): `grep -c -- "live-cell-CELL-B" CHANGELOG.md` → **0**. The 0226 entry at :3636 does not use the tokened path.

## Why this is a problem
The only place the record names its live evidence points at a path that has never existed, so the record's "`Tests 1 passed (1)`" cannot be traced back from its own pointer. The witness exists one de-tokenization away and asserts the record's observable (the extra-field theta un-registers while the declared-field sibling registers and drives). It sits under `tests/live/**`, so it is not gate-proven. The record words it as a recorded live run, not as continuous verification. The same stale token was already corrected in a test comment by f5cbee00, which shows the path is known to be decayed.

## Suggested direction (non-binding, optional)
Re-point the mention to `tests/live/object-pattern-head-field-set-live-cell.test.ts`, the path 4d4cbee6 actually added.

## False-positive check
- Representations covered: bug-doc witness lines (grep over docs), test filenames (`find tests -name`, `git log --all -- <path>`), test titles and bodies (`grep -rn tests`), coverage-matrix rows (both matrix files), AGENTS.md gate names, and CHANGELOG (corroboration). Each is stated above with its hit count.
- The equivalent witness was opened. Its header and describe/it titles name bug 0226 and assert the record's observable.
- The pointer never resolved. The tokened path was never added on any ref, so the cluster key is the fix commit 4d4cbee6, not a deleting commit. No other record in this shard cites this path.
- Not already filed: the pending 4d4cbee6 candidate (0219 v6 / 0221 a1 flips) is about sibling records' cell pins, not about this path. `grep -rl -- "object-pattern-head-field-set-live-cell-CELL-B" quality/intake` → 0 files other than this one.
- Not citation form: this is a file path that does not resolve, not a `path:line` form issue.

## Triage
verdict: confirmed — decayed-pointer reproduces. docs/bugs/0226:685 names tests/live/object-pattern-head-field-set-live-cell-CELL-B.test.ts, and `git log --all` on that path returns 0 commits. 4d4cbee6 added (A) tests/live/object-pattern-head-field-set-live-cell.test.ts (205 lines), and its commit message says "was CELL-B, de-tokenized". That file is the one unambiguous equivalent: describe "bug 0226 — a resolved object-pattern head with an undeclared listed field is refused at live production load and un-registers the theta" / it "un-registers the extra-field theta while the declared-field sibling over the SAME match shape registers and drives —". f5cbee00 already made the same re-point at tests/object-pattern-head-field-set-refusal.test.ts:150. Every stated grep count reproduces (tests 0, docs 3, both matrices 0). The fix is a mechanical re-point with the wording untouched. Not a duplicate: no sha was deleted, and the other 4d4cbee6 intake file (d10-04, the 0219 v6 / 0221 a1 pins) has a different root cause and sorts after this one anyway (triage: claude-opus-5-5)
