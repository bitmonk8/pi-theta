---
id: pending
title: Fix record 0176 discharges its "no committed source moves" GOV-15 claim with a working-tree PCRE2 census, not committed-fixture-parse-gate, although AGENTS.md already pinned that gate as the discharge when the fix landed
lens: D10
status: intake
verdict: pending
locations:
  - docs/bugs/0176-quoted-inline-field-key-admitted-and-lowered-verbatim.md:1025-1030
  - docs/bugs/0176-quoted-inline-field-key-admitted-and-lowered-verbatim.md:654-658
  - docs/bugs/0176-quoted-inline-field-key-admitted-and-lowered-verbatim.md:522-531
  - AGENTS.md:85-87
  - tests/committed-fixture-parse-gate.test.ts:66-72
  - tests/committed-fixture-parse-gate.test.ts:96-105
  - tests/committed-fixture-parse-gate.test.ts:165-171
  - tests/generic-argument-inline-field-key-rules.test.ts:139-145
  - tests/inline-object-empty-entry-slot-refusal.test.ts:160-166
sites: 2
fix_scope: localized
d10_class: overstated-strength
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Fix record 0176 discharges its "no committed source moves" GOV-15 claim with a working-tree PCRE2 census, not committed-fixture-parse-gate, although AGENTS.md already pinned that gate as the discharge when the fix landed

## Observation
Bug 0176's `## Fix (0.161.0)` Residual 2 states the GOV-15 disposition as "no committed source moves". It discharges that with a re-run of §Reproduction (j)'s census: an `rg --files` count of 34 working-tree files, plus one PCRE2 pattern with 0 matches. No instrument is committed, and the record never names `tests/committed-fixture-parse-gate.test.ts`. §Why it matters uses the same census for the same "No committed source moves" bullet. AGENTS.md:85-87 pins that gate as the discharge for exactly this class of claim, "not … a scratch probe". The rule entered AGENTS.md at d13320b4 (bug 0132, 2026-08-15). The 0176 fix landed at 82052a9d (2026-08-21), and at that commit the gate already walked the git index for both `.theta` and `.thetalib`. Later fix records for sibling raw-key rules (0233, 0257) name the gate as their discharge; 0176 does not.

## Evidence
Claim side, `docs/bugs/0176-quoted-inline-field-key-admitted-and-lowered-verbatim.md:1025-1030` (Residual 2, re-read before filing):
```
  2. **§Reproduction (j)'s census re-run at the fix HEAD**: 34
     `.theta`/`.thetalib` in the working tree, **0** PCRE2 matches for
     `[{,]\s*(["'])[^"']*\1\s*:` — no committed source moves, so the GOV-15
     disposition is the addition arm of the diagnostic-registry carve-out
     (`source-language-stability.md:25`) over an in-repo input set that is
     empty.
```
`:654-658` (§Why it matters):
```
- **No committed source moves.** §Reproduction (j) measures zero occurrences
  across all 34 `.theta`/`.thetalib` in the working tree, so the GOV-15
  disposition of a refusal is the addition arm of the diagnostic-registry
  carve-out (`source-language-stability.md:25`) over an input set that is
  presently empty in-repo.
```
`:524-526` (§Reproduction (j), the instrument):
```
`rg --files -g '*.theta' -g '*.thetalib'` over the working tree is **34** files.
A PCRE2 sweep for a quoted token at a field-name position
(`[{,]\s*(["'])[^"']*\1\s*:`) over all 34 matches **zero** lines. The only
```

The pinned discharge, `AGENTS.md:85-87`:
```
`tests/committed-fixture-parse-gate.test.ts` covers every committed `.theta`
and `.thetalib` the repository ships. A fix record's corpus-wide "no shipped
source moves" claim is discharged by that gate, not by a scratch probe.
```

The gate, which is default-suite (`vitest.config.ts:6` includes `tests/**/*.test.ts`; `:12` excludes only `tests/live/**`):
- `tests/committed-fixture-parse-gate.test.ts:66-72` spawns `git` with `["ls-files", "-z", "--", "*.theta", "*.thetalib"]`.
- `:96-105` collects every `theta/load/` and `theta/parse/` diagnostic.
- `:165-171` runs `it.each(shippedFixtures)("%s parses cleanly …", …)` with `expect(diagnostics).toEqual([])`.
- The new code `theta/parse/quoted-inline-field-name` is severity E, parse (`docs/spec_topics/diagnostics/code-registry-parse.md:106`). A committed source carrying a single quoted inline key would therefore red a gate cell. The claim's content is gate-provable.

Timing checks (run this session):
- `git log -S"not by a scratch probe" --format="%h %ad %s" --date=short -- AGENTS.md` → `d13320b4 2026-08-15 fix(bug-0132): …`
- `git log --format="%h %ad %s" --date=short --grep="bug-0176"` → `82052a9d 2026-08-21 fix(bug-0176): a quoted inline field key refuses at parse — v0.161.0`
- `git show 82052a9d:tests/committed-fixture-parse-gate.test.ts | grep -n "ls-files\", \"-z\"\|it.each"` → `76` (`ls-files … *.theta *.thetalib`) and `172` (`it.each`). The gate covered both extensions at the fix commit.

Sibling records name the gate for the same claim class:
- `tests/generic-argument-inline-field-key-rules.test.ts:139-145` (bug 0233): "That claim's discharge in this repository is `tests/committed-fixture-parse-gate.test.ts` … NOT a shell-out from here".
- `tests/inline-object-empty-entry-slot-refusal.test.ts:160-166` (bug 0257): "that claim is discharged corpus-wide by `tests/committed-fixture-parse-gate.test.ts` … Re-walking `git ls-files` from here would duplicate that gate with a weaker scratch-probe version of it."

Searches, one per representation (run this session):
- Bug-doc discharge lines:
  - `grep -c "committed-fixture-parse-gate" docs/bugs/0176-*.md` → 0
  - `grep -c "0132" docs/bugs/0176-*.md` → 0
- Test files and titles walking the corpus:
  - `grep -rln "ls-files" tests --include=*.test.ts | wc -l` → 16
  - of those, `xargs grep -ln "quoted-inline-field-name"` → 2 files (the 0233 and 0257 files quoted above). Neither holds a 0176 corpus cell; both defer to the gate.
  - `grep -n -iE "corpus|ls-files|committed" tests/inline-object-quoted-field-name-refusal.test.ts` → 0 hits in 0176's own witness.
- Coverage-matrix rows: `grep -n "0176\|quoted-inline-field-name" docs/plan_topics/coverage-matrix.md docs/reference/coverage-matrix.md | wc -l` → 0
- AGENTS.md gate names: `AGENTS.md:85-87`, quoted above
- CHANGELOG, corroboration only: `grep -n "0176" CHANGELOG.md` → `:3854` (the 0176 entry) and `:1822` (a 0292 cross-mention). Not used as evidence.

## Why this is a problem
AGENTS.md:85-87 names the evidence that discharges a corpus-wide "no shipped source moves" claim: the committed-fixture parse gate, not a scratch probe. 0176 was written after that rule existed and rests the claim on a working-tree `rg`/PCRE2 sweep. The sweep has no committed instrument, and its scope ("in the working tree", via `rg --files`) is not the git index the gate scores. The recorded evidence is therefore weaker than the corpus-wide wording. A current default-suite witness that proves the claim exists, but the record does not point at it.

## Suggested direction (non-binding, optional)
Append a note re-pointing Residual 2's "no committed source moves" at `tests/committed-fixture-parse-gate.test.ts`, the form 0233's and 0257's witnesses use. Keep the PCRE2 census as a recorded measurement, not the discharge.

## False-positive check
- Representations covered, each with a stated search above: bug-doc discharge lines, test files and titles, coverage-matrix rows, AGENTS.md gate names, and CHANGELOG (corroboration).
- Not a truth claim: I do not say any committed source carries a quoted inline key. The green gate proves the opposite. The finding is only that the record's evidence chain does not cite it.
- Honesty-marker check: the record carries no "scratch" or "pending" disclosure for this census. It is worded as the discharge ("— no committed source moves, so the GOV-15 disposition is …").
- Not the same as the pending `…-d10-02-thetalib-corpus-claims-discharged-off-gate.md` / `…-d10-03-b0102-…` filings: those are records that predate the gate's `.thetalib` widening at 0.95.0 (0132's re-point sweep). 0176 is 0.161.0 and postdates both the rule and the widening, so this is a separate root cause, not a missed 0132 re-point. The other records in this shard were checked:
  - 0177, 0178 and 0180 carry censuses of runtime reach (`Err(` use, `params:` shapes, division operators), which a parse gate does not discharge.
  - 0179 makes no committed-source claim.

## Triage
verdict: questionable — accounting verified; rewording a record is a human ruling: 0176 :522-531/:654-658/:1025-1030 discharge "no committed source moves" with a working-tree `rg --files` + PCRE2 census (no committed instrument, 0 mentions of committed-fixture-parse-gate or 0132 in the record), while AGENTS.md:85-87 (added d13320b4, 2026-08-15, before fix 82052a9d, 2026-08-21, whose gate already did `git ls-files -z -- *.theta *.thetalib` at :76 + it.each at :172) pins tests/committed-fixture-parse-gate.test.ts "parses cleanly through lexTheta -> parseThetaDocument" (default suite; theta/parse/quoted-inline-field-name is E/parse, code-registry-parse.md:106) as the discharge; the 0233/0257 sibling witnesses defer to that gate; all stated searches reproduce (0/0/16/2/0/0); no intake or PTQ filing names 0176 for this root cause (triage: claude-opus-5-5)
