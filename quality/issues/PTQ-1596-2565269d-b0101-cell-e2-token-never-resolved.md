---
id: PTQ-1596
title: "Bug 0101's 0.141.0 fix record cites its live H8a witness as `CELL-E2` three times, but 2565269d landed the cell as \"bug 0101 (cell 71)\" and no test title or comment contains `CELL-E2`"
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0101-from-bearing-reexport-materialises-nothing.md:942-946
  - docs/bugs/0101-from-bearing-reexport-materialises-nothing.md:958-960
  - docs/bugs/0101-from-bearing-reexport-materialises-nothing.md:1011-1016
  - tests/live/live-production-acceptance.test.ts:11904-11905
  - tests/live/live-production-acceptance.test.ts:11940-11957
sites: 3
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0101's 0.141.0 fix record cites its live H8a witness as `CELL-E2` three times, but 2565269d landed the cell as "bug 0101 (cell 71)" and no test title or comment contains `CELL-E2`

## Observation
The `## Fix (0.141.0)` section of bug 0101 names its live H8a leg by the token `CELL-E2` in three places: the "What shipped" entry, the live gate line ("`CELL-E2` green"), and Verification item (3) ("`CELL-E2` red-proven both directions"). No test title or comment under `tests/` contains `CELL-E2`, and the token has never appeared in the history of `tests/live/live-production-acceptance.test.ts`. The fix commit 2565269d added the cell as `describe("H8a-T — bug 0101 (cell 71): …")`. Its commit message says "H8a cell 71 (was CELL-E2)", which records the rename the fix record did not pick up.

## Evidence
Claim side, `docs/bugs/0101-from-bearing-reexport-materialises-nothing.md:942-946`:
```
  - `tests/live/live-production-acceptance.test.ts` — tail-appended H8a cell
    `CELL-E2`: a real registered theta resolves `greet` through
    `export { greet } from` to `base.thetalib`'s declaration and renders its
    call's value on the outbound wire. Additive only; no existing cell edited
    or renumbered.
```
`:958-960`:
```
  - Live H8a: `npx vitest run --config config/vitest/vitest.live.config.ts
    tests/live/live-production-acceptance.test.ts` → `Test Files 1 passed (1)`,
    `Tests 68 passed (68)` (baseline 67), `CELL-E2` green.
```
`:1011-1016`:
```
  reds exactly a2. No cell failed to red on every arm. (2) Full suite green,
  334 / 6152. (3) `CELL-E2` red-proven both directions: green, then red under
  the degenerated `materializeChain` with the signature the bug doc predicts
  (the ordinary-call throw aborts the drive before the `@`-query renders, so the
  outbound `userTexts` is empty rather than carrying the delivered value), then
  restored byte-exact and green. Both H9a files green for real. (4) Typecheck
```

Equivalent witness, `tests/live/live-production-acceptance.test.ts:11904-11905`:
```
describe("H8a-T — bug 0101 (cell 71): a from-bearing re-export chain delivers its declaration's value, live (Convention: live-host acceptance)", () => {
  it("resolves `greet` through `export { greet } from` to `base.thetalib`'s declaration and renders its call's value on the outbound wire", async () => {
```
`:11940-11957` drives `/b101livechain` and asserts `turn.userTexts` `toEqual(["VALUE=x|END What is 617 plus 152? …"])` ("Pre-fix, this text never renders — the call throws before the `@`-query evaluates"), plus an empty fail-closed note list. This matches the red signature the record describes at `:1013-1015` (empty outbound `userTexts`).

Searches (run this session):
- Test titles and tokens: `grep -rn 'CELL-E' tests | wc -l` → 0 (which also covers `CELL-E2`).
- History: `git log --oneline -S'CELL-E2' -- tests/live/live-production-acceptance.test.ts | wc -l` → 0 (the token was never in the file).
- `git log --oneline -S'bug 0101 (cell 71)' -- tests/live/live-production-acceptance.test.ts` → `2565269d` (the 0.141.0 fix commit added the cell under its numbered title).
- `git show 2565269d -- docs/bugs/0101-from-bearing-reexport-materialises-nothing.md | grep -c '^+.*CELL-E2'` → 3 (all three stale tokens written in that same commit).
- `git show -s --format=%B 2565269d` → "Witness reexport-chain-resolution (22 cells) + H8a cell 71 (was CELL-E2) red-proven both directions".
- Record pins: `grep -n 'CELL-' docs/bugs/0101-*.md` → 3 hits (`:943`, `:960`, `:1012`).
- Test file names: `tests/live/live-production-acceptance.test.ts` exists; the offline witness `tests/reexport-chain-resolution.test.ts` exists (`RED (a2)` at `:408`, `RED (h-cut-order-independence)` at `:865`, `(j-provided-cycle-…)` at `:950`). Only the live leg's pointer is affected.
- Coverage matrix / AGENTS.md gate names: `grep -n 'CELL-E' docs/plan_topics/coverage-matrix.md AGENTS.md | wc -l` → 0; not applicable.
- CHANGELOG (corroboration only): `grep -n 'cell 71' CHANGELOG.md` → `:4152` "`tests/reexport-chain-resolution.test.ts` (22 cells) + H8a cell 71".

## Why this is a problem
The record's live-verification claims ("`CELL-E2` green", "`CELL-E2` red-proven both directions") name a cell that no test carries, so the chain from claim to evidence breaks at the pointer. The fix commit's own message records the rename. The witness is a tests/live/** cell, so it exists but the preflight gate does not prove it.

## Suggested direction (non-binding, optional)
Point the three `CELL-E2` mentions at the landed title "bug 0101 (cell 71)".

## False-positive check
- Representations covered: bug-doc What-shipped/Gates/Verification lines (three sites quoted); test file names (both files exist); test titles (`grep -rn 'CELL-E' tests` → 0; the numbered `describe` found at `:11904`); coverage-matrix rows and AGENTS.md gate names (0); CHANGELOG (corroboration, `:4152`).
- Not a later rename: `-S'CELL-E2'` over the live file's history returns no commit, and the fix commit's message itself says "(was CELL-E2)".
- Separate from the bug 0100 `CELL-E` filing: different fix commit (af221903 vs 2565269d) and different record.

## Triage
verdict: confirmed — reproduced: bug 0101 record cites `CELL-E2` at :943/:960/:1012 (3 hits, all added by 2565269d); `grep -rn CELL-E tests` → 0; `git log -S'CELL-E2'` on the live file → 0 commits (the token never landed); commit msg says "H8a cell 71 (was CELL-E2)"; no CELL-E2 in coverage-matrix/AGENTS.md; the unambiguous equivalent is tests/live/live-production-acceptance.test.ts:11904 describe "H8a-T — bug 0101 (cell 71): a from-bearing re-export chain delivers its declaration's value, live (Convention: live-host acceptance)" / it "resolves `greet` through `export { greet } from` to `base.thetalib`'s declaration and renders its call's value on the outbound wire" (the only 'bug 0101 (cell 71)' title, added by 2565269d), whose userTexts toEqual(["VALUE=x|END …"]) + empty fail-closed notes assertions match the record's description and red signature; fix is a mechanical re-point of the 3 tokens to "bug 0101 (cell 71)"; 2565269d is not filed by any other intake/PTQ (the af221903/8cf9ea7d/515b3a3f/e0873e53 siblings cite other records/commits) (triage: claude-opus-5-5)
