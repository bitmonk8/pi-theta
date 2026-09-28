---
id: pending
title: Fix record 0263 rests its corpus-wide claim that "nothing in the shipped fixture corpus spells a frontmatter block the YAML parser rejects" on one live H9a run that never loads docs/examples, and never cites committed-fixture-parse-gate
lens: D10
status: intake
verdict: pending
locations:
  - docs/bugs/0263-params-type-bare-double-quote-breaks-frontmatter-misattributed.md:350-354
  - docs/bugs/0263-params-type-bare-double-quote-breaks-frontmatter-misattributed.md:310-336
  - AGENTS.md:85-87
  - tests/committed-fixture-parse-gate.test.ts:70
  - tests/committed-fixture-parse-gate.test.ts:96-104
  - tests/committed-fixture-parse-gate.test.ts:165-171
  - vitest.config.ts:6
  - vitest.config.ts:12
sites: 1
fix_scope: localized
d10_class: overstated-strength
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Fix record 0263 rests its corpus-wide claim that "nothing in the shipped fixture corpus spells a frontmatter block the YAML parser rejects" on one live H9a run that never loads docs/examples, and never cites committed-fixture-parse-gate

## Observation
Bug 0263's `## Fix (0.262.0)` ends with a corpus-wide claim: "nothing in the shipped fixture corpus spells a frontmatter block the YAML parser rejects". From that it concludes the new code `theta/load/malformed-frontmatter-yaml` is "reachable only from an authored mistake or fault injection". The only evidence given is one real H9a acceptance run ("15 files, 25 cells, all green"). That is a `tests/live/**` run: it is not gate-proven, and the record gives no command or log path for it. At the fix commit 2daf3c91, the H9a suite loads fixtures from `tests/live/acceptance/fixtures/` and never references `docs/examples`. `docs/examples` held 21 of the 34 committed `.theta`/`.thetalib` files at that commit. AGENTS.md names `tests/committed-fixture-parse-gate.test.ts` as the discharge for this kind of claim, and the record never cites it. The record also has no Gates bullet: it records no witness run, default-suite run, typecheck or lint.

## Evidence
Claim side, `docs/bugs/0263-params-type-bare-double-quote-breaks-frontmatter-misattributed.md:350-354` (re-read before filing):
```
- **Not H9a-reachable.** A real H9a acceptance run (15 files, 25 cells, all
  green) captured no emission of the new code: nothing in the shipped fixture
  corpus spells a frontmatter block the YAML parser rejects, so the code is
  reachable only from an authored mistake or fault injection.
  `tests/fixtures/h7a/permitted-codes.json` is therefore byte-unchanged.
```
The record's evidence list, `:310-336`, names the offline witness `tests/frontmatter-yaml-parse-failure-diagnostic.test.ts`, the live cell `tests/live/b0263live-frontmatter-yaml-parse-failure-live-cell.test.ts`, and four flipped cells. It records no run of any of them. The `## Fix (0.262.0)` section (`:245-354`) has no Gates bullet.

The pinned discharge, `AGENTS.md:85-87`:
```
`tests/committed-fixture-parse-gate.test.ts` covers every committed `.theta`
and `.thetalib` the repository ships. A fix record's corpus-wide "no shipped
source moves" claim is discharged by that gate, not by a scratch probe.
```

The gate would prove this claim:
- `tests/committed-fixture-parse-gate.test.ts:70` spawns `git` with `["ls-files", "-z", "--", "*.theta", "*.thetalib"]`.
- `:96-104` (`loadParseDiagnosticsOf`) runs `lexTheta` and `parseThetaDocument` and keeps codes starting with `theta/load/` or `theta/parse/`. That includes `theta/load/malformed-frontmatter-yaml`.
- `:165-171`: `it.each(shippedFixtures)("%s parses cleanly through lexTheta -> parseThetaDocument", …)` with `expect(diagnostics).toEqual([])`.
- The gate runs in the default suite: `vitest.config.ts:6` includes `tests/**/*.test.ts`, and `:12` excludes only `tests/live/**`.

What the cited H9a run covers, measured at the fix commit 2daf3c91 (run this session):
- `git ls-tree -r --name-only 2daf3c91 | grep -E '\.theta(lib)?$' | sed 's#/[^/]*$##' | sort | uniq -c` gives 21 `docs/examples`, 1 `tests/fixtures/h7a`, 1 `tests/fixtures/h7b-invalid` and 11 `tests/live/acceptance/fixtures`, so 34 in all.
- `git ls-tree -r --name-only 2daf3c91 | grep -E '^tests/live/acceptance/[^/]*\.test\.ts$' | wc -l` → 15. This matches "15 files" in the claim: it counts test files, not fixtures.
- `git grep -c 'docs/examples' 2daf3c91 -- tests/live/acceptance` → no match (rc=1).
- `git grep -n 'tests/live/acceptance/fixtures' 2daf3c91 -- tests/live/acceptance | wc -l` → 1 (`noninteractive-acceptance.test.ts:24`).
- `git show 2daf3c91:tests/committed-fixture-parse-gate.test.ts` already walks `git ls-files -- '*.theta' '*.thetalib'` (`:76`), excludes only `tests/fixtures/h7b-invalid/` (`:50`), and asserts `toEqual([])` (`:176`). So the gate could have discharged the claim at the fix commit too.
- The commit message of 2daf3c91 says the same thing: "Real H9a run captured no emission: permitted-codes byte-unchanged (a4a8da04)". It names no gate either.

"Shipped fixture" is the house term for the committed corpus. For example, `docs/bugs/0132-committed-fixture-parse-gate-blind-to-thetalib.md:387` says "artefact under any non-skipped directory is scored as a shipped fixture". `grep -rn -c "shipped fixture" docs/bugs | grep -v ':0' | wc -l` → 21 records use the phrase.

Searches, one per representation (run this session):
- Bug-doc witness/discharge lines in the record:
  - `grep -c 'committed-fixture-parse-gate' docs/bugs/0263-*.md` → 0
  - `grep -c -E 'npm test|default suite|Test Files|typecheck|npm run lint' docs/bugs/0263-*.md` → 0
  - `grep -n -i 'gate' docs/bugs/0263-*.md` → 1 hit, `:304` ("the required-`mode:` arm gates on the rejection"), not a test gate.
- Later notes that could re-point the claim: `grep -rl '0263' docs/bugs | xargs grep -l 'committed-fixture-parse-gate'` → 0056, 0284, 0285, 0410, README. 0056's 0263 note (`:1109` onward) is about the §Reproduction collapse; its gate mentions (`:583`, `:829`, `:994`) are about 0056's own subject and sit above the note. None of these re-point 0263's corpus claim.
- Test files and titles: `grep -rln 'ls-files' tests --include=*.test.ts | xargs grep -l 'malformed-frontmatter-yaml'` → 0 files. No corpus walker is keyed to the code; the generic gate above is the only corpus instrument.
- Coverage-matrix rows: `grep -rn "0263\|malformed-frontmatter-yaml" docs/plan_topics/coverage-matrix.md docs/reference/coverage-matrix.md | wc -l` → 0
- AGENTS.md gate names: `AGENTS.md:85-87`, quoted above.
- CHANGELOG, corroboration only: `grep -n '0263' CHANGELOG.md` → `:1359` (a bug 0410 entry citing the b0263 live cell), `:2422`, `:2429`. Not used as evidence.

## Why this is a problem
The claim covers the whole committed corpus: no shipped `.theta`/`.thetalib` draws the new code. The evidence is a live-only run whose only committed-fixture reference is `tests/live/acceptance/fixtures/` (11 files at 2daf3c91), and it never references the 21 `docs/examples` files. So the wording is stronger than its evidence, in the exact shape AGENTS.md:85-87 rules out: a corpus-wide "no shipped source moves" claim must be discharged by `committed-fixture-parse-gate`. The gate existed at the fix commit and asserts exactly this observable, but the record neither cites it nor records a default-suite run that would have exercised it. Anyone checking the "reachable only from an authored mistake" premise from the record finds only an H9a run that could not have seen most of the corpus.

## Suggested direction (non-binding, optional)
A dated note on 0263 could re-point the corpus clause at `tests/committed-fixture-parse-gate.test.ts` (`it.each(shippedFixtures)` … `toEqual([])`), which is in the default suite and green. The H9a run would then remain the evidence for the `permitted-codes.json` sentence only.

## False-positive check
- Claim re-read verbatim at `:350-354` immediately before filing. The whole `## Fix (0.262.0)` section (`:245-354`) was read: no Gates bullet, and no npm test, typecheck or lint record.
- The gate's current coverage was confirmed (`:70`, `:96-104`, `:165-171`), including the `theta/load/` code filter that would catch the new code. Its coverage at the fix commit was confirmed via `git show 2daf3c91:…` (`:50`, `:76`, `:176`).
- H9a's fixture reach at 2daf3c91 was confirmed: 0 `docs/examples` references, 1 `tests/live/acceptance/fixtures` reference, and 15 test files, which matches the record's "15 files".
- Representations covered: bug-doc witness/discharge lines (the record plus later notes in other records), test filenames and titles (corpus walkers keyed to the code), coverage-matrix rows, AGENTS.md gate names, and CHANGELOG (corroboration only).
- Not a duplicate: the pending 0102, 0176 and thetalib-corpus filings are about other records, and no pending candidate cites 0263.
- This does not dispute the claim's truth. The gate is green at this wave's head, so the claim is very likely true. The finding is only that the record's evidence chain does not reach its wording.

## Triage
verdict: questionable — accounting verified; rewording a record is a human ruling. 0263:350-354 does rest the corpus-wide "nothing in the shipped fixture corpus" clause only on a live H9a run (15 test files at 2daf3c91). The H9a harness at 2daf3c91 loads only `./fixtures` (harness.ts:110/:327; 11 files), while docs/examples held 21 of the 34 committed .theta/.thetalib files and has no reference from the H9a suite (git grep rc=1). AGENTS.md:85-87 names committed-fixture-parse-gate as the discharge. That gate existed at the fix commit (ls-files walk, toEqual([])), runs in the default suite (vitest.config.ts excludes only tests/live/**), and filters theta/load/ codes. The record cites the gate 0 times and has no Gates/npm-test line. None of the 0056/0284/0285/0410 notes re-points the claim, and no other intake or PTQ cites 0263 (triage: claude-opus-5-5)
