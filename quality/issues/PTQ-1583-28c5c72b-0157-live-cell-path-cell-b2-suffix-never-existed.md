---
id: PTQ-1583
title: "Bug 0157's 0.180.0 fix record names its live H8a witness as tests/live/alias-sink-array-element-check-live-cell-CELL-B2.test.ts, but 28c5c72b added the file without the -CELL-B2 suffix and that path has never existed"
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0157-alias-vs-concrete-sink-spelling-code-divergence.md:853-857
  - docs/bugs/0157-alias-vs-concrete-sink-spelling-code-divergence.md:910-916
  - tests/live/alias-sink-array-element-check-live-cell.test.ts:1-4
  - tests/live/alias-sink-array-element-check-live-cell.test.ts:128-129
  - docs/bugs/0156-fn-parameter-sink-not-consulted-for-rule3-unions.md:853-854
sites: 2
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0157's 0.180.0 fix record names its live H8a witness as tests/live/alias-sink-array-element-check-live-cell-CELL-B2.test.ts, but 28c5c72b added the file without the -CELL-B2 suffix and that path has never existed

## Observation
The `## Fix (0.180.0)` section of bug 0157 names its standalone H8a live cell by path twice: once in "What shipped" and once in the verbatim live gate command. Both times the path is `tests/live/alias-sink-array-element-check-live-cell-CELL-B2.test.ts`. No file at that path exists in the tree, and no commit on any ref ever added one. The fix commit 28c5c72b added `tests/live/alias-sink-array-element-check-live-cell.test.ts`, the same path without the suffix, and its commit message says "standalone live cell (token was in filename only — renamed)". The record kept the pre-rename lane filename. The live file exists and is the witness the record describes. Bug 0156's record and two tests already cite it by its real path.

## Evidence
Claim side (re-read just before filing), `docs/bugs/0157-alias-vs-concrete-sink-spelling-code-divergence.md:853-857`:
```
  - `tests/live/alias-sink-array-element-check-live-cell-CELL-B2.test.ts` —
    the standalone H8a live cell: the alias-spelled refusal reaches the
    `theta-system-note` channel off a settled `SessionManager` carrying the
    element diagnostic and its index, and the alias-union theta the defect
    refused now registers and drives one real turn to a pinned sentinel.
```
`:910-916`:
```
- Gates (verbatim): witness
  `npx vitest run tests/alias-sink-array-element-check.test.ts` → 28 passed;
  re-pinned `npx vitest run tests/index-element-alias-unfolded.test.ts` → 54
  passed; full offline suite `npm test` → 370 files / 7587 tests passed;
  `npx tsc --noEmit -p tsconfig.json` → clean; `npm run lint` → clean; live
  `npx vitest run --config config/vitest/vitest.live.config.ts tests/live/alias-sink-array-element-check-live-cell-CELL-B2.test.ts`
  → 1 passed, run for real under the live lock, green on the first attempt.
```

Evidence side (the equivalent witness, opened), `tests/live/alias-sink-array-element-check-live-cell.test.ts:1-4`:
```
// H8a live witness — bug 0157: the three array-literal sink dispatches unfold
// the sink before classifying it, so an alias-spelled `array<T>` annotation
// supplies the element sink through the real discovery→registration path. Two
// consequences are observable there and nowhere in the offline witness:
```
`:128-129`:
```
describe("bug 0157 live: an alias-spelled array sink refuses with the element diagnostic, and the alias-union sink registers and drives", () => {
  it("does not register `schema U = array<string>` + `let xs: U = [\"a\", 1]` and carries the element diagnostic with its index on the theta-system-note channel, while `schema U = array<A | B>` over one A and one B registers and drives to the live sentinel", async () => {
```
`docs/bugs/0156-fn-parameter-sink-not-consulted-for-rule3-unions.md:853-854` cites the same witness by its real path:
```
  and bug 0157's neighbouring live cell
  `tests/live/alias-sink-array-element-check-live-cell.test.ts` → 1 passed.
```

Searches (all run in this session):
- Path existence: `test -e tests/live/alias-sink-array-element-check-live-cell-CELL-B2.test.ts` → absent. `test -e tests/live/alias-sink-array-element-check-live-cell.test.ts` → present (250 lines).
- Test filenames: `find tests -iname "*cell-b2*" | wc -l` → **0**.
- History, all refs: `git log --all --format=%h --diff-filter=A -- "tests/live/*CELL-B2*" | wc -l` → **0**. `git show --name-status --format= 28c5c72b` → `A	tests/live/alias-sink-array-element-check-live-cell.test.ts` (plus `A	tests/alias-sink-array-element-check.test.ts`).
- The record's path string entered with the fix: `git log --oneline -S"alias-sink-array-element-check-live-cell-CELL-B2" -- docs/bugs/0157-alias-vs-concrete-sink-spelling-code-divergence.md` → 1 commit, 28c5c72b.
- Fix-commit message: `git log -1 --format=%B 28c5c72b` contains "standalone live cell (token was in filename only — renamed)".
- Test titles and bodies: `grep -rn "CELL-B2" tests | wc -l` → **0**. `grep -rn "CELL-B2" tests/live/alias-sink-array-element-check-live-cell.test.ts | wc -l` → **0**.
- Bug-doc witness lines: `grep -n "CELL-B2" docs/bugs/0157-*.md` → 2 hits (:853, :915), the claim sites above. `grep -rn "alias-sink-array-element-check-live-cell" docs tests --include=*.md --include=*.ts | grep -v "^docs/bugs/0157"` → 6 hits, all using the unsuffixed path (docs/bugs 0156:854, 0241:415, 0243:108, 0243:444; tests/alias-sink-array-element-check.test.ts:98; tests/live/fn-param-sink-array-literal-live-cell.test.ts:33).
- Coverage matrix: `grep -n "0155\|0157\|0158" docs/plan_topics/coverage-matrix.md docs/reference/coverage-matrix.md | wc -l` → **0**.
- AGENTS.md gate names: `grep -c "CELL-E\|CELL-B2" AGENTS.md` → **0**.
- CHANGELOG (corroboration): `grep -n "alias-sink\|0157" CHANGELOG.md` → the 0.180.0 entry at :3575, whose witness line :3582 reads "`tests/alias-sink-array-element-check.test.ts` (28 cells) + a standalone" live cell, with no `-CELL-B2` path.

## Why this is a problem
Both places the record names its live evidence point at a path that has never existed. The verbatim gate command at :915 cannot be run as written. The record's "1 passed, run for real under the live lock" is therefore unreproducible from its own pointer, even though the witness exists one rename away and asserts exactly what the record describes (refusal on the `theta-system-note` channel with the element diagnostic, then the alias-union theta registering and driving to a sentinel). The witness is under `tests/live/**`, so it is not gate-proven. The record words it as a recorded live run, not as continuous verification.

## Suggested direction (non-binding, optional)
Re-point both mentions to `tests/live/alias-sink-array-element-check-live-cell.test.ts`, the path 28c5c72b actually added and that bug 0156's record already uses.

## False-positive check
- Representations covered: bug-doc witness lines (grep over the record and over docs/tests for the path stem), test filenames (`find tests -iname`, `test -e`, `git log --all --diff-filter=A`), test titles and bodies (`grep -rn "CELL-B2" tests`), coverage-matrix rows (both matrix files), AGENTS.md gate names, and CHANGELOG entries (corroboration only). Each is stated above with its hit count.
- The equivalent witness was opened. Its header and describe/it titles name bug 0157 and assert the record's two observables.
- No rename after the fact: the unsuffixed file was added in 28c5c72b and the suffixed path was never added on any ref, so the pointer never resolved. The cluster key is therefore the fix commit 28c5c72b, not a deleting commit. No other record in this shard cites the suffixed path. 0156 cites the correct one.
- Not already filed: bug 0119's `CELL-B2` filing (78a6560c) concerns a different record, commit and token placement (a cell label in `live-production-acceptance.test.ts`). Its false-positive check names 0157 only as outside its shard. `grep -rl "CELL-B2" quality/` shows no filing that cites 0157.
- Not citation form: this is a file path that does not resolve, not a `path:line` form issue, and no citation gate reads `docs/bugs/**`.

## Triage
verdict: confirmed — decayed pointer reproduced: 0157's Fix record cites `tests/live/alias-sink-array-element-check-live-cell-CELL-B2.test.ts` at :853 and :915, a path that has never existed (test -e absent; find *cell-b2* → 0; git log --all --diff-filter=A on tests/live/*CELL-B2* → 0; the -S pickaxe puts the string's entry in 28c5c72b, whose message says "token was in filename only — renamed" and which added the unsuffixed file). The unambiguous equivalent is verified: `tests/live/alias-sink-array-element-check-live-cell.test.ts` (250 lines), describe "bug 0157 live: an alias-spelled array sink refuses with the element diagnostic, and the alias-union sink registers and drives", and it asserts both observables the record names. 0156:854, 0241:415, 0243:108/444 and two tests already cite that path. The fix is a mechanical re-point of both mentions with the wording untouched. Every stated search reproduces. No other intake/issue tracks sha 28c5c72b for this record (0226/0125/0220 candidates mention it only in passing). Note: the candidate had no `## Triage` heading, so triage appended one (triage: claude-opus-5-5)
