---
id: PTQ-1568
title: "Bug 0155's 0.174.0 fix record cites its live H8a witness through the filter `-t \"CELL-E\"`, but 8cf9ea7d landed the cell as \"bug 0155 … (cell 85)\" and no test name in the file contains `CELL-E`"
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0155-ternary-common-type-unenforced-trigger-conflict.md:781-792
  - docs/bugs/0155-ternary-common-type-unenforced-trigger-conflict.md:809-812
  - tests/live/live-production-acceptance.test.ts:4184-4185
  - tests/live/live-production-acceptance.test.ts:4229-4230
  - CHANGELOG.md:3668-3676
sites: 1
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0155's 0.174.0 fix record cites its live H8a witness through the filter `-t "CELL-E"`, but 8cf9ea7d landed the cell as "bug 0155 … (cell 85)" and no test name in the file contains `CELL-E`

## Observation
The `## Fix (0.174.0)` section of bug 0155 records one live gate: `npx vitest run --config config/vitest/vitest.live.config.ts tests/live/live-production-acceptance.test.ts -t "CELL-E"` → "1 passed / 84 skipped". The test-name filter `CELL-E` does not occur in `tests/live/live-production-acceptance.test.ts`. It does not occur anywhere else under `tests/` either, and it has never appeared in that file's history. The fix commit 8cf9ea7d added the cell as `describe("H8a-T — bug 0155: … (cell 85) …")`. Its commit message says "H8a cell 85 (was CELL-E, run under lock in-lane)", so the token was a lane-local placeholder that was renamed at merge while the record kept it. As written, the cited command selects no test in the named file. The witness the record describes does exist under the label "cell 85".

## Evidence
Claim side (re-read just before filing), `docs/bugs/0155-ternary-common-type-unenforced-trigger-conflict.md:781-792`:
```
  - `tests/live/live-production-acceptance.test.ts` — one additive H8a live
    cell proving the same disposition through the real production composition
    root.
- **Gates:** witness RED before (4 corpus-conformance cells: `A2` quoting
  ...
  witness's 23 cells). `npm run typecheck` clean. `npm run lint` clean. Live:
  `npx vitest run --config config/vitest/vitest.live.config.ts
  tests/live/live-production-acceptance.test.ts -t "CELL-E"` → 1 passed / 84
  skipped.
```
`:809-812`:
```
  367/7513 green. (3) Live: no pre-existing live cell drove a ternary node; one
  H8a cell was added and run for real under the live lock — the ternary
  registers, the one-token-apart array-literal twin still refuses. (4)
  typecheck and lint clean.
```

Evidence side (the equivalent witness, opened), `tests/live/live-production-acceptance.test.ts:4184-4185`:
```
// Bug 0155 (cell 85) — the ternary is adjudicated OUT of common-type rules 1
// and 3: `theta/parse/array-element-type-mismatch` and
```
`tests/live/live-production-acceptance.test.ts:4229-4230`:
```
describe("H8a-T — bug 0155: a ternary with two distinct named object-schema branches loads and registers, live, with the array-literal twin's refusal surviving as a contrast (cell 85) (Convention: live-host acceptance)", () => {
  it("registers a theta whose ternary has two distinct named object-schema branches and no sink, while the array-literal spelling of the same pair still does not register, through the real discovery->registration path (cell 85)", async () => {
```
`CHANGELOG.md:3668-3676` (corroboration only) closes the 0155 entry with "witness `tests/ternary-common-type-trigger-adjudication.test.ts` (23 cells) + H8a cell 85."

Searches (all run in this session):
- Test titles and bodies: `grep -rn "CELL-E" tests | wc -l` → **0**. Case-insensitive, in the named file: `grep -ni "cell-e" tests/live/live-production-acceptance.test.ts | wc -l` → **0**, so the filter matches no describe/it title there in either case.
- Underscore/camel spellings: `grep -rn "CELL_E2\|cellE2\|CELL_E\b\|cellE\b" tests | wc -l` → **0**.
- Test filenames: `find tests -iname "*cell-e*"` → 1 hit, `tests/invoke-prompt-cell-enum-return.test.ts`, which is unrelated (an "enum" cell, not bug 0155).
- History: `git log --oneline -S"CELL-E" -- tests/live/live-production-acceptance.test.ts` → **0 commits**. `git show 8cf9ea7d:tests/live/live-production-acceptance.test.ts | grep -c "CELL-E"` → **0**. `git show 8cf9ea7d:tests/live/live-production-acceptance.test.ts | grep -n "cell 85"` → hits at :4100, :4127, :4145, :4146, :4176, so the cell carried "cell 85" at the fix commit. `git show 8cf9ea7d:docs/bugs/0155-ternary-common-type-unenforced-trigger-conflict.md | grep -c 'CELL-E'` → 1.
- Fix-commit message: `git log -1 --format=%B 8cf9ea7d` contains "H8a cell 85 (was CELL-E, run under lock in-lane)".
- Bug-doc witness lines: `grep -n "CELL-E" docs/bugs/0155-*.md` → 1 hit (:791), the gate line above.
- Coverage matrix: `grep -n "0155\|0157\|0158" docs/plan_topics/coverage-matrix.md docs/reference/coverage-matrix.md | wc -l` → **0**.
- AGENTS.md gate names: `grep -c "CELL-E\|CELL-B2" AGENTS.md` → **0**.
- CHANGELOG (corroboration): `grep -n "cell 85\|cell 86\|CELL-E\|CELL-B2\|alias-sink-array-element-check-live-cell" CHANGELOG.md` → 2 hits (:3569 "H8a cell 86", :3676 "cell 85"), and no `CELL-E`.

## Why this is a problem
The record's only live-evidence gate is a command whose test-name filter names a label that the witness file has never carried. Re-running it verbatim, the way triage or a later verifier would, selects no bug 0155 cell. The record's "1 passed / 84 skipped" therefore cannot be reproduced from the pointer as written. The evidence itself exists as "cell 85" and asserts the observable the record describes (the ternary registers, the array-literal twin refuses), so this is a decayed pointer and not a missing witness. The cell is under `tests/live/**`, so it is not gate-proven. The record words it as a recorded live run ("run for real under the live lock"), not as continuous verification, and that wording is correct.

## Suggested direction (non-binding, optional)
Re-point the gate's filter to the landed label, "cell 85" (`describe("H8a-T — bug 0155: … (cell 85) …")`), which CHANGELOG.md and the fix commit message already use.

## False-positive check
- Representations covered: bug-doc witness lines (grep over the record), test titles and bodies (`grep -rn` over `tests/` in hyphen, underscore and camel spellings, plus a case-insensitive grep over the named file), test filenames (`find tests -iname`), coverage-matrix rows (both matrix files), AGENTS.md gate names, and CHANGELOG entries (corroboration only). Each search is stated above with its hit count.
- The equivalent witness was opened. Its describe/it titles name bug 0155 and "cell 85", and the body plants `b155liveternary` beside a control, which is bug 0155's disposition.
- Not a line drift and not citation form. The pointer is a test-name filter inside a cited command, and no citation gate reads `docs/bugs/**`.
- Not already filed: the pending same-pattern filings in this wave (b0100 `CELL-E` at af221903, b0101 `CELL-E2` at 2565269d, b0119 `CELL-B2` at 78a6560c) cite other records and other commits. None lists bug 0155. `grep -rl "CELL-B2\|CELL-E2\|\"CELL-E\"" quality/` shows no filing naming 0155.
- The placeholder was introduced by a rename at merge, not by a deleting commit, so the cluster key is the fix commit 8cf9ea7d. No other record in this shard is affected by it.

## Triage
verdict: confirmed — decayed pointer verified and the equivalent is unambiguous. docs/bugs/0155…:791 gates on `-t "CELL-E"`, but CELL-E has 0 hits in tests/ (any case, underscore/camel spellings too), 0 in the file's history (`git log -S` → 0), and 0 in 8cf9ea7d's copy of the test file. The fix commit message says "H8a cell 85 (was CELL-E, run under lock in-lane)". The only equivalent is tests/live/live-production-acceptance.test.ts:4229-4230, describe "H8a-T — bug 0155: a ternary with two distinct named object-schema branches loads and registers, live, with the array-literal twin's refusal surviving as a contrast (cell 85) …" and its it "registers a theta whose ternary … (cell 85)"; all 5 "cell 85" hits in tests/ are in that block, and CHANGELOG:3676 agrees. Every stated search reproduced. No other intake or PTQ carries 8cf9ea7d/0155. The fix is a mechanical re-point of the filter to "cell 85", with no rewording (triage: claude-opus-5-5)
