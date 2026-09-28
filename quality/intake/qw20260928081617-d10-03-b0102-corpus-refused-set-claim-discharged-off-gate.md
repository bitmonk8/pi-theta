---
id: pending
title: Fix record 0102 discharges its corpus-wide "0 in the refused set" GOV-15 claim over 34 committed .theta/.thetalib files by an unnamed, uncommitted sweep that predates the gate's .thetalib coverage, and carries no note re-pointing it at committed-fixture-parse-gate
lens: D10
status: intake
verdict: pending
locations:
  - docs/bugs/0102-params-default-string-literal-raw-newline-admitted.md:1005-1010
  - docs/bugs/0102-params-default-string-literal-raw-newline-admitted.md:915-920
  - AGENTS.md:85-87
  - tests/committed-fixture-parse-gate.test.ts:68-72
  - tests/committed-fixture-parse-gate.test.ts:165-171
  - vitest.config.ts:6
  - vitest.config.ts:12
sites: 2
fix_scope: localized
d10_class: overstated-strength
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Fix record 0102 discharges its corpus-wide "0 in the refused set" GOV-15 claim over 34 committed .theta/.thetalib files by an unnamed, uncommitted sweep that predates the gate's .thetalib coverage, and carries no note re-pointing it at committed-fixture-parse-gate

## Observation
Bug 0102's 0.75.0 fix record discharges GOV-15 with a corpus-wide claim over every committed `.theta` and `.thetalib`: "**0** in the refused set". It says the sweep was "re-verified twice independently, the second time behaviourally against the fixed parser". It names no committed instrument, and the fix commit 196e3082 added no corpus-walking test. Residual 4 relies on the same "static sweep". At 196e3082, `tests/committed-fixture-parse-gate.test.ts` walked `.theta` files only and had no `.thetalib` mention, so the gate did not cover the `.thetalib` half of the claim. Bug 0132 (0.95.0, d13320b4) later widened the gate to the git index of both extensions. Its discharge-note sweep did not reach 0102: the record carries no 0132 note and never cites the gate.

## Evidence
Claim side, `docs/bugs/0102-params-default-string-literal-raw-newline-admitted.md:1005-1010` (§GOV-15 discharge, re-read before filing):
```
green. Corpus sweep re-verified twice independently, the second time
behaviourally against the fixed parser rather than by inspection:
`git ls-files -- '*.theta' '*.thetalib'` → **34** files, **17** declaring
`params:`, **19** fields, **1** default
(`tests/live/acceptance/fixtures/acc-params-binder.theta:6`, `count: number = 3`
— a bare integer, no string literal), **0** in the refused set.
```
`:915-920` (Residual 4):
```
  4. **`tests/fixtures/h7a/permitted-codes.json` is unchanged**, git blob hash
     `a4a8da04209f90e13d815edd92c1fc682e2a2236` before and after. Decided by the
     real H9a run, not by assumption: `grep -n "literal-newline-in-string"` over
     the captured stdout+stderr of all four live transcripts returned no match,
     the suite's own `assertCodesSubsetOfPermitted` and empty-capture
     `assertStderrClean` gates stayed green, and the static sweep found no
```

The pinned discharge, `AGENTS.md:85-87`:
```
`tests/committed-fixture-parse-gate.test.ts` covers every committed `.theta`
and `.thetalib` the repository ships. A fix record's corpus-wide "no shipped
source moves" claim is discharged by that gate, not by a scratch probe.
```

The gate today:
- `tests/committed-fixture-parse-gate.test.ts:68-72` spawns `git` with `["ls-files", "-z", "--", "*.theta", "*.thetalib"]`.
- `:165-171` is `it.each(shippedFixtures)("%s parses cleanly through lexTheta -> parseThetaDocument", …)` with `expect(diagnostics).toEqual([])`. A committed source in 0102's refused set would draw the error-severity `theta/parse/literal-newline-in-string` and red that cell. So the claim's content is gate-provable now.
- The gate is in the default suite: `vitest.config.ts:6` includes `tests/**/*.test.ts`, and `:12` excludes only `tests/live/**`. The preflight was green at this wave's head.

The gate at 0102's fix commit (run this session):
- `git show 196e3082:tests/committed-fixture-parse-gate.test.ts | grep -n 'endsWith(".theta\|ls-files'` → `55:    } else if (entry.isFile() && entry.name.endsWith(".theta")) {`
- `git show 196e3082:tests/committed-fixture-parse-gate.test.ts | grep -c "thetalib"` → 0
- `git log -1 --format=%s d13320b4` → "fix(bug-0132): gate every committed theta source of both extensions, from the git index — v0.95.0"
- `git ls-files '*.thetalib' | wc -l` → 3 (the `.thetalib` half the 0.75.0 gate did not see)

Searches, one per representation (run this session):
- Bug-doc discharge/Witness lines:
  - `grep -c "committed-fixture-parse-gate" docs/bugs/0102-*.md` → 0
  - `grep -c "0132" docs/bugs/0102-*.md` → 0
  - `grep -rln "committed-fixture-parse-gate-blind-to-thetalib\|(bug 0132" docs/bugs | wc -l` → 31
  - `… | grep -c 0102` → 0
- Test files and titles walking the corpus:
  - `grep -rln "ls-files" tests --include=*.test.ts | wc -l` → 16
  - of those, `xargs grep -l "0102"` → 0 files
  - of those, `xargs grep -ln "literal-newline-in-string"` → 1 file, `tests/interpolation-parse-diagnostics.test.ts`. There the code is a body `${…}` lock (`:853`) and `:1140` is a comment citing the parse gate; it is not a 0102 corpus cell. The 0102 witness `tests/params-default-string-literal-raw-newline.test.ts` has 0 hits for `ls-files\|corpus\|committed`.
- Coverage-matrix rows: `grep -n "literal-newline-in-string\|0102" docs/plan_topics/coverage-matrix.md docs/reference/coverage-matrix.md` → 0 hits
- AGENTS.md gate names: `AGENTS.md:85-87`, quoted above
- CHANGELOG, corroboration only: `grep -n "0102" CHANGELOG.md` → `:5881`, `:6369`, both cross-mentions from other bugs' entries. Not used as evidence.

## Why this is a problem
AGENTS.md:85-87 pins the discharge for a corpus-wide "no shipped source moves" claim to the committed-fixture parse gate, "not … a scratch probe". 0102's claim covers `.thetalib`, but the record rests it on a sweep it does not name as committed and that the fix commit did not add. At the time, the gate could not see `.thetalib`. So the recorded evidence is weaker than the corpus-wide wording. This is the gap bug 0132 filed and closed for other records by appending a note that re-points the claim at the widened gate. 0102 was left out of that sweep. Its claim still reads as discharged by an unretained measurement, although a current default-suite witness exists that proves it.

## Suggested direction (non-binding, optional)
Append a dated note of the shape 0132 gave its re-pointed records: the gate-provable content of the claim (no committed `.theta`/`.thetalib` draws a diagnostic, so none is in the refused set) is enforced by `tests/committed-fixture-parse-gate.test.ts` from the git index. The 17/19/1 field counts stay as recorded measurements.

## False-positive check
- Representations covered, each with a stated search above: bug-doc discharge lines, test files and titles, coverage-matrix rows, AGENTS.md gate names, and CHANGELOG (corroboration).
- Not a truth claim: I do not say any committed source is in the refused set. The green gate proves the opposite. The finding is only that the record's evidence chain does not point at it.
- Honesty-marker check: the record carries no "pending" or scratch-probe disclosure for this sweep. "Re-verified twice independently … behaviourally" is worded as a completed corpus-wide verification with no citable instrument.
- Relation to the pending `qw20260928081617-d10-02-thetalib-corpus-claims-discharged-off-gate.md`: that filing has the same root cause (0132's re-point sweep stopping short) and lists 0081, 0083 and 0084, not 0102. 0102 is in this shard and is not re-listed there. If triage merges, this record joins that list.
- Excluded siblings in this shard:
  - 0104 (0.127.0) and 0106 (0.216.0) cite the gate for their corpus claims (0104 at `:988-990`, 0106 at `:1029`, `36/36`).
  - 0103's corpus claim has its own default-suite cell (`tests/binder-prompt-description-hint-line-forgery.test.ts:358-359`, group (e)).
  - 0105 (0.217.0, after the gate's widening) is not filed; its census is counts of input shapes, not a zero-draw claim.

## Triage
verdict: questionable — accounting verified; rewording is a human ruling. 0102:1005-1010 ("re-verified twice independently … behaviourally", 34 files, **0** in the refused set) and Residual 4 :915-920 ("static sweep") reproduce verbatim and name no instrument. The only census provenance (:1125-1136) is an rg census in a scratch vitest, "then deleted per scratch policy". Fix commit 196e3082 touches no corpus-walking test. At 196e3082 the gate walks `endsWith(".theta")` at :55 and has 0 `thetalib` hits; d13320b4 (0132) widened it, and today :68-72 runs `git ls-files -z -- *.theta *.thetalib` (3 .thetalib) into the default-suite cell :165-171 "%s parses cleanly through lexTheta -> parseThetaDocument" (vitest.config.ts:6/:12). Every stated search reproduces: gate/0132 cites in 0102 are 0/0; the 0132 sweep is 31 files with no 0102; 16 ls-files tests with 0 citing 0102; the only literal-newline hit is interpolation-parse-diagnostics, the body `${…}` lock at :853; 0 coverage-matrix hits. AGENTS.md:85-87 pins the gate as the discharge. Not a duplicate: d10-02 (0081/0083/0084) was triaged as a separate record set that names b0102 as a sibling, and the D10 same-sha merge applies only to decayed-pointer (triage: claude-opus-5-5)
