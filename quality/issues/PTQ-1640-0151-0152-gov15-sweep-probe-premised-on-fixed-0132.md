---
id: PTQ-1640
title: Fix records 0151 (0.163.0) and 0152 (0.187.0) discharge their GOV-15 corpus-wide claim by an uncited scratch sweep justified by bug 0132's .thetalib blindness, though 0132 was fixed at 0.95.0 and committed-fixture-parse-gate walked both extensions at both fix commits
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0151-unclosed-fn-parameter-list-accepted.md:1233-1236
  - docs/bugs/0151-unclosed-fn-parameter-list-accepted.md:938-942
  - docs/bugs/0152-modulo-zero-result-type-not-number.md:1191-1192
  - docs/bugs/0152-modulo-zero-result-type-not-number.md:990-995
  - AGENTS.md:85-87
  - tests/committed-fixture-parse-gate.test.ts:12-14
  - tests/committed-fixture-parse-gate.test.ts:165-171
  - docs/bugs/0132-committed-fixture-parse-gate-blind-to-thetalib.md:3
  - docs/bugs/0150-fn-parameter-annotation-optional-against-grammar.md:1062-1064
sites: 2
fix_scope: localized
d10_class: overstated-strength
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Fix records 0151 (0.163.0) and 0152 (0.187.0) discharge their GOV-15 corpus-wide claim by an uncited scratch sweep justified by bug 0132's .thetalib blindness, though 0132 was fixed at 0.95.0 and committed-fixture-parse-gate walked both extensions at both fix commits

## Observation
Two fix records in this shard state a corpus-wide GOV-15 claim over "all 34 committed `.theta` / `.thetalib` files".
- **0151** (`## Fix (0.163.0)`, commit c7c5d828): "0 offenders, 0 emissions of the new code". The sweep is "walked explicitly, bug 0132".
- **0152** (`## Fix (0.187.0)`, commit 35b718cc): "34 files, zero `%` operators". It follows its own §Fix instruction, which says to run "a scratch probe" because "the committed-fixture parse gate filters `.theta` only" (bug 0132).

Neither fix section cites `tests/committed-fixture-parse-gate.test.ts` as the discharge, and neither names a probe path or command output beyond the `git ls-files` spec. By both fix commits, bug 0132 had been fixed at 0.95.0 (d13320b4, 2026-08-15), six and seven days earlier. At both commits the gate walked `git ls-files '*.theta' '*.thetalib'` and asserted zero load/parse diagnostics per file. The same commit that fixed 0132 added AGENTS.md's rule that such claims are "discharged by that gate, not by a scratch probe". The two sibling records in this shard fixed in the same period, 0150 (0.177.0) and 0153 (0.194.0), do cite the gate as the discharge.

## Evidence
Claim side (each re-read before filing):

`docs/bugs/0151-unclosed-fn-parameter-list-accepted.md:1233-1236` (Verification line of `## Fix (0.163.0)`):
```
  GOV-15 sweep over all 34 committed `.theta` / `.thetalib` files (walked
  explicitly, bug 0132) — 4 `fn` declarations, 0 offenders, 0 emissions of the
  new code. `tests/fixtures/h7a/permitted-codes.json` left untouched: the code
  is not reachable from the H9a stderr EMPTY-CAPTURE gate (every
```
The premise it carries forward, `:938-942` (filing-time §Fix constraint 4):
```
   diagnostic-registry carve-out (`:25`) and the sweep must be re-run at the
   fix's HEAD. Bug [0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md)
   binds on how: the committed-fixture parse gate does not walk `.thetalib`, so
   the sweep walks it explicitly.
```
`docs/bugs/0152-modulo-zero-result-type-not-number.md:1191-1192` (Verification line of `## Fix (0.187.0)`):
```
  DIAG-2 not engaged. Corpus sweep re-measured over
  `git ls-files -- '*.theta' '*.thetalib'`: 34 files, zero `%` operators.
```
The instruction it executes, `:990-995`:
```
- Re-run the committed-corpus sweep. Measured at this HEAD: 34 tracked
  `.theta` / `.thetalib` files, **zero** containing a `%` binary operator of any
  kind (§Reproduction (g)). Re-measure rather than cite; note bug
  [0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md) — the
  committed-fixture parse gate filters `.theta` only, so the sweep is a scratch
  probe over `git ls-files -- '*.theta' '*.thetalib'`.
```

The pinned discharge, `AGENTS.md:85-87`:
```
`tests/committed-fixture-parse-gate.test.ts` covers every committed `.theta`
and `.thetalib` the repository ships. A fix record's corpus-wide "no shipped
source moves" claim is discharged by that gate, not by a scratch probe.
```
`git blame -L 85,87 AGENTS.md` → all three lines are d13320b4 (2026-08-15). `git show d13320b4:AGENTS.md | grep -n "not by a scratch probe"` → 1 hit (`:68`).

The gate, `tests/committed-fixture-parse-gate.test.ts:12-14`:
```
// real host. Here every `.theta` and `.thetalib` the git index tracks is run
// through the real lexer/parser (`lexTheta` -> `parseThetaDocument`) and MUST
// yield zero load/parse diagnostics. A seeded-invalid `.theta` fixture and a
```
`:165-171`:
```
  it.each(shippedFixtures)(
    "%s parses cleanly through lexTheta -> parseThetaDocument",
    (relPath) => {
      const diagnostics = loadParseDiagnostics(relPath);
      expect(diagnostics).toEqual([]);
    },
  );
```
The gate as it stood at each fix commit:
- `git show c7c5d828:tests/committed-fixture-parse-gate.test.ts | grep -n 'ls-files\|EXPECTED_SHIPPED'` shows `:76` `["ls-files", "-z", "--", "*.theta", "*.thetalib"]`, with `EXPECTED_SHIPPED_THETA = 31` and `EXPECTED_SHIPPED_THETALIB = 2`. That is 33 files: the records' 34 less the seeded-invalid fixture.
- `git show 35b718cc:…` gives identical lines.

Bug 0132's status, `docs/bugs/0132-committed-fixture-parse-gate-blind-to-thetalib.md:3`: `- **Status:** fixed (0.95.0).` (identical at c7c5d828 via `git show c7c5d828:docs/bugs/0132-….md | sed -n 3p`).
Dates (`git log -1 --format='%h %ad' --date=short`): d13320b4 2026-08-15, c7c5d828 2026-08-21, 35b718cc 2026-08-22.

In-shard contrast, `docs/bugs/0150-fn-parameter-annotation-optional-against-grammar.md:1062-1064`:
```
  (`source-language-stability.md:5`) are untouched and no carve-out is engaged;
  the corpus-wide claim is discharged by the shipped
  `tests/committed-fixture-parse-gate.test.ts`, not by the probe.
```
0153 does the same at `docs/bugs/0153-reserved-keyword-remaining-identifier-positions.md:1107-1109`.

Searches (all run this session):
- Gate citations inside the two fix sections:
  - `sed -n 1170,1300p docs/bugs/0151-unclosed-fn-parameter-list-accepted.md | grep -c "committed-fixture"` → 0.
  - `sed -n 1127,1245p docs/bugs/0152-modulo-zero-result-type-not-number.md | grep -c "committed-fixture"` → 0.
- Whole-record gate citations:
  - `grep -n "committed-fixture-parse-gate" docs/bugs/0151-…md` → 4 hits (`:321`, `:683`, `:940`, `:1153`). All four are filing-time text: §Affected, §Reproduction (h), §Fix constraint 4 and §Provenance, and three of them assert the gate's `.thetalib` blindness.
  - `grep -c "committed-fixture-parse-gate" docs/bugs/0152-…md` → 2 (`:132`, `:993`), both filing-time, both asserting the blindness.
- Discharge / coordination notes re-pointing the claim: `grep -n "^## " docs/bugs/0151-…md docs/bugs/0152-…md`. The last heading in each is its `## Fix (…)`, and both say "Discharge notes appended: none". No later note exists.
- Probe artefact: neither fix section names a probe file, command output file or session path. `git show c7c5d828 --stat` and `git show 35b718cc --stat` list no sweep file.
- CHANGELOG (corroboration only): `grep -n "0151\|0152" CHANGELOG.md` → the entries at `:3469` (0152) and `:3763` (0151). Neither names the gate as the corpus discharge.

## Why this is a problem
AGENTS.md:85-87, in force at both fix commits, pins the corpus-wide claim's discharge to the gate "not … a scratch probe". Both records instead discharge it with an unnamed, uncommitted sweep. They justify it by a gate defect (bug 0132) that had been fixed six and seven days earlier. So the stated evidence (a probe nobody can re-run as written) is weaker than the continuously gated evidence that actually existed, and the premise given for choosing the probe is false at the fix's own HEAD. The in-shard siblings 0150 and 0153 show the house discharge shape.

## Suggested direction (non-binding, optional)
Append a dated note to each record re-pointing the GOV-15 corpus discharge at `tests/committed-fixture-parse-gate.test.ts`. The note should also record that bug 0132 was already fixed (0.95.0) when each fix landed. 0152's operator-count observation stays a measurement, and the no-source-moves half rests on the gate.

## False-positive check
- Representations covered:
  - bug-doc Fix/Verification lines (both quoted);
  - AGENTS.md gate names (`:85-87`, blame to d13320b4);
  - test file names and titles (the gate's `it.each` "%s parses cleanly …" at `:165-171`, and its discovery at c7c5d828/35b718cc);
  - coverage matrix (none cited by either record);
  - CHANGELOG (corroboration, no gate named).
- Honesty-marker check: neither record marks the sweep as provisional. 0151 labels it "SOLID" verification.
- Not the claim's truth: the gate being green at both fix commits (full default suites green per each record) is consistent with the claims. This filing is about which evidence the records name, not about whether the claim holds.
- Not a duplicate:
  - `qw20260928081617-d10-02-thetalib-corpus-claims-discharged-off-gate.md` covers 0081/0083/0084, whose fixes predate 0132's fix.
  - `…-d10-03-b0102-…` and `…-d10-05-0125-…` cover other records.
  - No pending candidate lists 0151 or 0152.
- Not a form-gate matter: no gate scores which evidence a fix record names for a corpus claim.

## Triage
verdict: questionable — accounting verified; rewording a record is a human ruling. The 0151 fix (0.163.0, :1233-1236, "walked explicitly, bug 0132") and the 0152 fix (0.187.0, :1191-1192, following the §Fix :990-995 instruction to use a "scratch probe" because the gate "filters `.theta` only") both discharge the corpus-wide GOV-15 claim with an unnamed scratch sweep. But 0132 was fixed at d13320b4 (0.95.0, 2026-08-15), before c7c5d828 (2026-08-21) and 35b718cc (2026-08-22). At both commits the gate walked `ls-files -- *.theta *.thetalib` (31+2). AGENTS.md:85-87 was blamed to d13320b4. Neither fix section mentions committed-fixture (0/0 hits). Both records were filed 2026-08-06, before 0132 was fixed. Siblings 0150:1062-1064 and 0153:1107-1109 cite the gate. No other candidate or PTQ tracks this (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: D10 RULED REWORD (overstated-strength). Two appends, nothing else; every existing line stays byte-identical. (1) APPEND at the very end of docs/bugs/0151-unclosed-fn-parameter-list-accepted.md:

### Discharge note — 2026-09-28 (D10 wave qw20260928081617)

The corpus-wide GOV-15 claim above was discharged by an uncited scratch sweep justified by the bug 0132 gate blindness, but 0132 was already fixed (d13320b4, 0.95.0) before this fix landed: the gate walked git ls-files *.theta *.thetalib at the fix commit. The standing discharge is tests/committed-fixture-parse-gate.test.ts (default suite; cell: parses cleanly through lexTheta -> parseThetaDocument), pinned by AGENTS.md.

(2) APPEND at the very end of docs/bugs/0152-modulo-zero-result-type-not-number.md:

### Discharge note — 2026-09-28 (D10 wave qw20260928081617)

The corpus-wide GOV-15 claim above followed the §Fix instruction to use a scratch probe because the gate filters .theta only, but that premise was stale: bug 0132 (d13320b4, 0.95.0) had already widened the gate to git ls-files *.theta *.thetalib before this fix landed. The standing discharge is tests/committed-fixture-parse-gate.test.ts (default suite; cell: parses cleanly through lexTheta -> parseThetaDocument), pinned by AGENTS.md.
