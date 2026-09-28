---
id: PTQ-1580
title: "Bug 0103's 0.131.0 fix record names its H8a cell by the title token `CELL-C2` and records `CELL-C2` 1 passed | 62 skipped, but 03c05b85 landed the cell as \"cell 65 (bug 0103)\" and no test title contains `CELL-C2`"
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0103-binder-description-argument-hint-lines-forgeable-by-newline.md:951-954
  - docs/bugs/0103-binder-description-argument-hint-lines-forgeable-by-newline.md:1024-1028
  - tests/live/live-production-acceptance.test.ts:10947-10948
  - tests/live/live-production-acceptance.test.ts:10980-10981
  - tests/live/live-production-acceptance.test.ts:13214-13218
sites: 2
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0103's 0.131.0 fix record names its H8a cell by the title token `CELL-C2` and records `CELL-C2` 1 passed | 62 skipped, but 03c05b85 landed the cell as "cell 65 (bug 0103)" and no test title contains `CELL-C2`

## Observation
The `## Fix (0.131.0)` section of bug 0103 identifies its live H8a cell in two places by "title token `CELL-C2`". The first is the What-shipped line. The second is the Gates line, which records a filtered run as "`CELL-C2` 1 passed | 62 skipped (63)". The fix commit 03c05b85 wrote both the record and the cell. It gave the cell the title "H8a-T — cell 65 (bug 0103): …", and its commit message says "H8a cell 65". No test title under `tests/` contains `CELL-C2`, and the token was never in the tree. The record says "the parent renumbers at merge", but it never records the name the cell was renumbered to. The only `CELL_C2` strings in the file are two identifier prefixes. One is this cell's `CELL_C2_SENTINEL`. The other is `CELL_C2_PARSE_REGISTRY` / `CELL_C2_LET_RHS_CODE`, which belong to a bug 0130 cell. So the token cannot identify this cell.

## Evidence
Claim side, `docs/bugs/0103-binder-description-argument-hint-lines-forgeable-by-newline.md:951-954` (re-read before filing):
```
  - `tests/live/live-production-acceptance.test.ts` — one additive H8a cell
    (title token `CELL-C2`; the parent renumbers at merge) driving a real binder
    pass over a theta whose `description: |` carries the forged `Theta: /evil`
    line.
```
`:1024-1028`:
```
- Gates: witness `npx vitest run
  tests/binder-prompt-description-hint-line-forgery.test.ts` → 10 failed | 5
  passed (15) before the fix, 15 passed (15) after; `npm test` → 329 files /
  6023 tests passed; `npm run typecheck` clean; `npm run lint` clean; H8a
  `CELL-C2` 1 passed | 62 skipped (63); H9a both files 11 passed (2 files).
```

Equivalent witness, `tests/live/live-production-acceptance.test.ts:10980-10981`:
```
describe("H8a-T — cell 65 (bug 0103): a forged structural line inside a multi-line description: does not corrupt a real binder pass (Convention: live-host acceptance)", () => {
  it("registers cleanly, binds the caller's actual argument (not the forged line's text), and echoes it on the theta-system-note channel with no fail-closed note", async () => {
```
The only near-matches in the file, `:10947-10948`:
```
/** The committed body sentinel for cell 65 — present in `userTexts` iff the body ran. */
const CELL_C2_SENTINEL = "SENTINEL-cell 65";
```
and `:13214-13218`, a different bug's cell reusing the same prefix:
```
/** `theta/parse/let-rhs-type-mismatch`'s registry page — DIAG-4, read not copied. */
const CELL_C2_PARSE_REGISTRY = readRegistry(["parse"]);

/** The row bug 0130 owns (`docs/spec_topics/diagnostics/code-registry-parse.md:57`). */
const CELL_C2_LET_RHS_CODE = "theta/parse/let-rhs-type-mismatch";
```

Searches (run this session):
- Test titles and tokens: `grep -rn "CELL-C2" tests/ | wc -l` → 0. So a `-t "CELL-C2"` filter selects nothing.
- File history: `git log --oneline -S'CELL-C2' -- tests/ | wc -l` → 0. The token never landed anywhere under `tests/`.
- At the fix commit: `git show 03c05b85:tests/live/live-production-acceptance.test.ts | grep -c 'CELL-C2'` → 0. In the same tree, `grep -n 'describe("H8a-T — cell 65'` → 1 hit, `:10665`, so the cell landed numbered.
- Same-commit authorship: `git show 03c05b85 -- docs/bugs/0103-…md | grep -c "^+.*CELL-C2"` → 2. Also, `git log --oneline -S"cell 65 (bug 0103)" -- tests/live/live-production-acceptance.test.ts` → 03c05b85.
- Docs: `grep -rn "CELL-C2" docs/` → 2 hits, both in this record (`:952`, `:1028`). No later note re-points them.
- Test filenames: the offline witness `tests/binder-prompt-description-hint-line-forgery.test.ts` exists. It has 15 `it(` cells at `:158`–`:359`, matching the record's "15 tests". So only the live leg's token pointer is affected.
- Coverage matrix / AGENTS.md gate names: the live leg cites neither, so they do not apply.
- CHANGELOG (corroboration only): `grep -n "cell 65" CHANGELOG.md` → `:4309` "H8a cell 65 (fixed-path coverage …)". `CHANGELOG.md` has no `CELL-C2` hit.

## Why this is a problem
The record's recorded live gate, "`CELL-C2` 1 passed | 62 skipped (63)", names a title token that no test has ever carried. As written, the command selects zero tests, and the What-shipped pointer cannot be followed to the cell. The token is also ambiguous, because a bug 0130 cell uses the same `CELL_C2_` identifier prefix. The pointer breaks even though an equivalent cell exists at `:10980`. That cell is a tests/live/** cell, so it exists but the preflight gate does not prove it. The record itself says it is coverage, not a witness (Residual 1).

## Suggested direction (non-binding, optional)
Append a dated note that re-points the two `CELL-C2` mentions at the landed title "cell 65 (bug 0103)".

## False-positive check
- Representations covered:
  - bug-doc What-shipped/Gates lines (both quoted);
  - test file names (the offline and live files exist);
  - test titles and tokens (`grep -rn "CELL-C2" tests/` → 0; the numbered `describe` at `:10980`);
  - coverage-matrix rows (none cited);
  - AGENTS.md gate names (this is not a gate claim);
  - CHANGELOG (`:4309`, corroboration only).
- Honesty-marker check: "the parent renumbers at merge" says the token is provisional, but the record never records the landed name. The Gates line then uses the provisional token as a runnable filter with a pass count, which is stronger than the hedge. The renumbering happened inside the same fix commit, and the record was written in that commit without the new name.
- Same class, other record: the pending `qw20260928081617-d10-02-d62be25e-b0074-cell-a-token-never-resolved.md` is bug 0074 / d62be25e, a different sha and a different record. This filing does not re-list 0074.
- Not a form-gate matter: the citation-symbol-form gate does not score test-title tokens.
verdict: confirmed — decayed pointer reproduces: bug 0103 :952 and :1028 cite title token `CELL-C2`, which resolves nowhere (grep -rn "CELL-C2" tests/ → 0; git log -S'CELL-C2' -- tests/ → 0; 03c05b85's tree → 0 hits). 03c05b85 wrote both record lines (2 added `CELL-C2` lines) and landed the cell numbered (its tree :10665). The one unambiguous equivalent is verified: tests/live/live-production-acceptance.test.ts:10980, describe "H8a-T — cell 65 (bug 0103): a forged structural line inside a multi-line description: does not corrupt a real binder pass (Convention: live-host acceptance)", and it is the only describe/it matching "cell 65". The CELL_C2_* identifiers at :10948 and :13215-13218 are not titles. The fix is a mechanical re-point of both mentions to that title. "The parent renumbers at merge" is not a pending/open/wontfix honesty marker. No other intake/PTQ tracks 03c05b85 or bug 0103 (triage: claude-opus-5-5)
