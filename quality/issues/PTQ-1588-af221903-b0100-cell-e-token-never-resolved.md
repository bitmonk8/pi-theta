---
id: PTQ-1588
title: "Bug 0100's 0.134.0 fix record cites its live H8a witness as `CELL-E` four times, but af221903 landed the cell as \"bug 0100 (cell 67)\" and no test title or comment contains `CELL-E`"
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0100-production-excluded-import-export-spellings-parse-clean.md:793-797
  - docs/bugs/0100-production-excluded-import-export-spellings-parse-clean.md:808-810
  - docs/bugs/0100-production-excluded-import-export-spellings-parse-clean.md:852-853
  - docs/bugs/0100-production-excluded-import-export-spellings-parse-clean.md:915-918
  - tests/live/live-production-acceptance.test.ts:11268-11269
  - tests/live/live-production-acceptance.test.ts:11300-11334
sites: 4
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0100's 0.134.0 fix record cites its live H8a witness as `CELL-E` four times, but af221903 landed the cell as "bug 0100 (cell 67)" and no test title or comment contains `CELL-E`

## Observation
The `## Fix (0.134.0)` section of bug 0100 names its live H8a leg by the token `CELL-E` in four places: the "What shipped" entry, the live gate line ("`CELL-E` green in 425 ms"), the Verification item (3), and the "Bug 0101 rebase surface" paragraph. No test title or comment under `tests/` contains `CELL-E`, and the token has never appeared in the history of `tests/live/live-production-acceptance.test.ts`. The fix commit af221903 added the cell as `describe("H8a-T — bug 0100 (cell 67): …")`, and its commit message says "H8a cell 67". The record, written in the same commit, kept the pre-merge token, so the pointer has never resolved as written.

## Evidence
Claim side, `docs/bugs/0100-production-excluded-import-export-spellings-parse-clean.md:793-797`:
```
  - `tests/live/live-production-acceptance.test.ts` — tail-appended H8a cell
    `CELL-E`: a `.theta` whose specifier carries a dangling `as` against a
    resolvable planted `.thetalib` does not register, its `as b` sibling does, and
    the `theta-system-note` channel carries `<code>: <message>` with the message
    read from the registry. Registration-only, zero model turns. Additive only.
```
`:808-810`:
```
  - Live H8a: `npx vitest run --config config/vitest/vitest.live.config.ts
    tests/live/live-production-acceptance.test.ts` → `Test Files 1 passed (1)`,
    `Tests 67 passed (67)` (baseline 66), `CELL-E` green in 425 ms.
```
`:852-853`:
```
  `38d63bf50520b1aeef626ae456a0e27cfe72e131`). (2) Full suite green. (3) The live
  path is exercised end to end by `CELL-E` and both H9a files, run for real.
```
`:915-918`:
```
  and its `docs/reference/grammar.md` mirror; and two test surfaces — this fix's
  group (c) and `f-export-set-control` rows, which assert the well-formed
  re-export spellings carry no diagnostic of any code, and the tail-appended
  `CELL-E` in `tests/live/live-production-acceptance.test.ts`.
```

Equivalent witness, `tests/live/live-production-acceptance.test.ts:11268-11269`:
```
describe("H8a-T — bug 0100 (cell 67): a dangling-`as` import specifier is refused, live (Convention: live-host acceptance)", () => {
  it("does not register a theta whose import specifier carries a dangling `as`, while its aliased sibling registers, and the theta-system-note channel carries the refusal, through the real discovery→registration path", async () => {
```
`:11300-11334` asserts that the aliased control `b100livealiased` is defined, that `b100livedangling` is undefined and not in `registeredNames()`, and that a theta-system-note contains `malformedSpecifierListFragment()`. These match the record's description at `:793-797` (the dangling-`as` theta is refused, the `as b` sibling registers, the note carries the registry message).

Searches (run this session):
- Test titles and tokens: `grep -rn 'CELL-E' tests | wc -l` → 0.
- History: `git log --oneline -S'CELL-E' -- tests/live/live-production-acceptance.test.ts | wc -l` → 0 (the token was never in the file).
- `git log --oneline -S'bug 0100 (cell 67)' -- tests/live/live-production-acceptance.test.ts` → `af221903` (the 0.134.0 fix commit added the cell under its numbered title).
- `git show af221903 -- docs/bugs/0100-production-excluded-import-export-spellings-parse-clean.md | grep -c '^+.*CELL-E'` → 4 (all four stale tokens written in that same commit).
- Record pins: `grep -n 'CELL-' docs/bugs/0100-*.md` → 4 hits (`:794`, `:810`, `:853`, `:918`).
- Test file names: `tests/live/live-production-acceptance.test.ts` exists; the offline witness `tests/import-specifier-list-production-required.test.ts` exists (`RED (a0)` at `:336`, `f-export-set-control` at `:742`, `RED (g-IMP-5)` at `:823`). Only the live leg's pointer is affected.
- Coverage matrix / AGENTS.md gate names: `grep -n 'CELL-E' docs/plan_topics/coverage-matrix.md AGENTS.md | wc -l` → 0; not applicable.
- CHANGELOG (corroboration only): `grep -n 'CELL-E\|cell 67' CHANGELOG.md` → `:4264` "H8a cell 67 (registration denial, red-proven both directions)"; no `CELL-E` hit.

## Why this is a problem
The record's live claims ("`CELL-E` green in 425 ms", "exercised end to end by `CELL-E`") and its rebase-surface pointer name a cell that no test carries, so the chain from claim to evidence breaks at the pointer even though the equivalent cell exists. The witness is a tests/live/** cell, so it exists but the preflight gate does not prove it.

## Suggested direction (non-binding, optional)
Point the four `CELL-E` mentions at the landed title "bug 0100 (cell 67)".

## False-positive check
- Representations covered: bug-doc What-shipped/Gates/Verification/rebase-surface lines (four sites quoted); test file names (both files exist); test titles (`grep -rn 'CELL-E' tests` → 0; the numbered `describe` found at `:11268`); coverage-matrix rows and AGENTS.md gate names (0); CHANGELOG (corroboration, `:4264`).
- Not a later rename: `-S'CELL-E'` over the live file's history returns no commit, so the token never landed. af221903 wrote both the numbered cell and the token-bearing record.
- Not the same root commit as the bug 0101 `CELL-E2` pointer (2565269d). That one is filed separately because it has a different fix commit and a different record.

## Triage
verdict: confirmed — reproduced: bug 0100 record cites `CELL-E` at :794/:810/:853/:918 (4 hits, all added by af221903); `grep -rn CELL-E tests` → 0; `git log -S'CELL-E'` on the live file → 0 commits (never landed); the unambiguous equivalent is tests/live/live-production-acceptance.test.ts:11268 describe "H8a-T — bug 0100 (cell 67): a dangling-`as` import specifier is refused, live (Convention: live-host acceptance)" / it "does not register a theta whose import specifier carries a dangling `as`, while its aliased sibling registers, and the theta-system-note channel carries the refusal, through the real discovery→registration path" (the only 'bug 0100 (cell 67)' title, added by af221903, commit msg "H8a cell 67"), whose assertions (b100livealiased defined, b100livedangling undefined/unregistered, note carries malformedSpecifierListFragment()) match the record's description; fix is a mechanical re-point of the 4 tokens to "bug 0100 (cell 67)"; af221903 is not filed by any other intake/PTQ (8cf9ea7d/2565269d/515b3a3f siblings cite other records/commits) (triage: claude-opus-5-5)
