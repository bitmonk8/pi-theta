---
id: PTQ-1642
title: Fix records 0081, 0083 and 0084 discharge a corpus-wide "no committed .theta/.thetalib moves" claim by a hand measure or deleted scratch probe that predates the gate's .thetalib coverage, and carry no discharge note re-pointing it at committed-fixture-parse-gate
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0084-increment-decrement-check-dead.md:171-179
  - docs/bugs/0083-let-annotation-discarded-from-recorded-binding-type.md:237-245
  - docs/bugs/0081-array-ternary-common-type-never-unions.md:492-499
  - AGENTS.md:85-87
  - tests/committed-fixture-parse-gate.test.ts:12-14
  - tests/committed-fixture-parse-gate.test.ts:70
  - tests/committed-fixture-parse-gate.test.ts:165-171
  - docs/bugs/0079-interpolated-result-unemitted-private-encoding-rendered.md:376-382
  - docs/bugs/0132-committed-fixture-parse-gate-blind-to-thetalib.md:997-1002
sites: 3
fix_scope: localized
d10_class: overstated-strength
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Fix records 0081, 0083 and 0084 discharge a corpus-wide "no committed .theta/.thetalib moves" claim by a hand measure or deleted scratch probe that predates the gate's .thetalib coverage, and carry no discharge note re-pointing it at committed-fixture-parse-gate

## Observation
Three fix records in this shard state a corpus-wide claim over every committed `.theta` and `.thetalib`: either no committed source draws the fix's code, or no committed source's disposition moves.
- 0084 (0.71.0) says outright that the `.thetalib` half came from "a scratch probe … deleted".
- 0083 (0.55.0) says the 34 files "were parsed" and names no probe and no gate.
- 0081 (0.83.0) says "Re-measured at this HEAD" and names no method.

At all three fix commits (`9fe13534`, `2eafbf10`, `5de8d78a`), `tests/committed-fixture-parse-gate.test.ts` walked `entry.name.endsWith(".theta")` only. So the `.thetalib` half of each claim had no gate witness. Bug 0132 (0.95.0, `d13320b4`) widened the gate to `git ls-files '*.theta' '*.thetalib'`. It then appended discharge notes re-pointing exactly this claim shape at the gate, but only to 0079 and 0095. None of 0081, 0083 or 0084 carries a 0132 note or cites the gate as the claim's discharge.

## Evidence
Claim side (each re-read before filing):

`docs/bugs/0084-increment-decrement-check-dead.md:171-179`:
```
  - **H9a permitted-codes: NOT reachable, `tests/fixtures/h7a/permitted-codes.json`
    byte-unchanged** — decided by the real run, mirroring 0079's method. The
    live H9a acceptance suite was run (`tests/live/acceptance/`, 11/11 green)
    and its captured stdout+stderr carries neither
    `theta/parse/increment-decrement` nor `theta/parse/unsupported-feature`; a
    scratch probe extending `tests/committed-fixture-parse-gate.test.ts`'s walk
    to `.thetalib` parsed both committed libraries free of the code and was
    deleted. H9a's stderr gate is empty-capture, so a fault-injection-only code
    must not be listed.
```
`docs/bugs/0083-let-annotation-discarded-from-recorded-binding-type.md:237-245`:
```
**No spec, registry, `docs/reference/` or `permitted-codes.json` edit.** DIAG-2
held: no new code, no new row, no widened trigger. Every code the fix newly
emits or newly suppresses is already registered at the position it fires
from — `theta/parse/integer-narrowing` at a typed-binding initialiser and
`theta/parse/non-string-array-join` at an `array<T>` receiver. All 34 committed
`.theta` / `.thetalib` files were parsed through `parseThetaDocument` with the
fix in place and with it neutralised: byte-identical diagnostic dispositions,
so no shipped example or fixture changes and the H9a empty-capture stderr gate
is unaffected.
```
`docs/bugs/0081-array-ternary-common-type-never-unions.md:492-499`:
```
  4. **GOV-15 removal direction.** Re-measured at this HEAD: 34 committed
     `.theta`/`.thetalib` files, ZERO heterogeneous array literals; the only
     multi-element bracket in the corpus is `docs/examples/ralph-inline.theta:22`
     (`tools: [read, bash]`), a frontmatter tools list, not an expression-position
     array literal. The change removes no diagnostic any committed theta draws
     and admits sources the corpus does not yet contain. Disposition: NARROWING
     an emission set onto its registered *Trigger* — the 0084/0139 posture — so
     no registry edit is engaged for facets (a)/(c).
```

The pinned discharge, `AGENTS.md:85-87`:
```
`tests/committed-fixture-parse-gate.test.ts` covers every committed `.theta`
and `.thetalib` the repository ships. A fix record's corpus-wide "no shipped
source moves" claim is discharged by that gate, not by a scratch probe.
```

The gate today: `tests/committed-fixture-parse-gate.test.ts:70` takes `["ls-files", "-z", "--", "*.theta", "*.thetalib"]`. At `:165-171`, `it.each(shippedFixtures)("%s parses cleanly through lexTheta -> parseThetaDocument", …)` asserts `expect(diagnostics).toEqual([])`. It is in the default suite: `vitest.config.ts:6` includes `tests/**/*.test.ts` and `:12` excludes only `tests/live/**`. The preflight was green at this wave's head, so the claims' "no committed source draws a diagnostic" content is gate-proven now. None of the three records says so.

Gate shape at each fix commit (run this session):
- `git show 9fe13534:tests/committed-fixture-parse-gate.test.ts | grep -n 'endsWith(".theta'` → `55:    } else if (entry.isFile() && entry.name.endsWith(".theta")) {` (0084)
- the same command at `2eafbf10` → the same line 55 (0083)
- the same command at `5de8d78a` → the same line 55 (0081)
- the same command at `d13320b4` (0132's fix) → no `endsWith(".theta")` hit. `grep -n ls-files` → `:76` `["ls-files", "-z", "--", "*.theta", "*.thetalib"]`.

The sibling that did get the re-point, `docs/bugs/0079-interpolated-result-unemitted-private-encoding-rendered.md:376-382`:
```
- **Discharge note (bug 0132, 0.95.0).** This report's §Fix record states "every
  shipped `.theta` and `.thetalib` in the tree parses free of this code", and
  its `.thetalib` half was obtained from a scratch probe that was then deleted.
  The gate that half belongs to now covers both extensions —
  `tests/committed-fixture-parse-gate.test.ts` takes its corpus from
  `git ls-files '*.theta' '*.thetalib'` — so that claim is gate-enforced and
  re-derivable by running the default suite. Status unchanged.
```
`docs/bugs/0132-committed-fixture-parse-gate-blind-to-thetalib.md:997-1002` lists that sweep's notes as 0095 and 0079 only.

Searches (run this session):
- `grep -c "committed-fixture-parse-gate" docs/bugs/<N>-*.md` → 0081: 0, 0083: 0, 0084: 1. 0084's one hit is `:176`, the scratch probe's description, not a discharge citation.
- `grep -c "bug 0132" docs/bugs/<N>-*.md` → 0081: 0, 0083: 0, 0084: 0 (0079: 1).
- `grep -rln "committed-fixture-parse-gate-blind-to-thetalib\|(bug 0132" docs/bugs` → 31 files, none of them 0081, 0083 or 0084. Of the three, only 0079 among this shard's records appears.

## Why this is a problem
AGENTS.md:85-87 fixes the discharge for a corpus-wide "no shipped source moves" claim: it is the committed-fixture parse gate, "not … a scratch probe". Each of the three records instead rests its `.thetalib` half on a measurement that was never committed:
- 0084 names a scratch probe it deleted.
- 0083 and 0081 name no instrument at all.

At the time, the gate could not see `.thetalib`. So the recorded evidence is weaker than the corpus-wide wording, which is the defect bug 0132 filed for 0079 and 0095 ("each orchestrator paid for the rest privately and then deleted the receipt", `0132…md:62-63`). Bug 0132's own remedy was a per-record note re-pointing the claim at the widened gate. These three records were left out of that sweep, so their claims still read as probe-discharged, although a current gate witness exists and proves the gate-provable part.

## Suggested direction (non-binding, optional)
Append to each of the three records the same append-only note 0132 gave 0079: the corpus-wide claim's gate-provable content (no committed `.theta`/`.thetalib` draws a diagnostic) is enforced by `tests/committed-fixture-parse-gate.test.ts` from the git index. The parts no parse gate can re-derive stay as recorded measurements: 0083's "with it neutralised" comparison and 0081's heterogeneous-literal count.

## False-positive check
- Representations searched for a gate-level or retained witness of each `.thetalib` half (all run this session):
  - (1) Bug-doc Witness/Fix and discharge lines: the two `grep -c` rows above, and `grep -rln "committed-fixture-parse-gate-blind-to-thetalib\|(bug 0132" docs/bugs | wc -l` → 31, with none of 0081/0083/0084 among them.
  - (2) Test files that walk the committed corpus: `grep -rln "ls-files" tests --include=*.test.ts` → 16 files. `tests/committed-fixture-parse-gate.test.ts` is the corpus-wide zero-diagnostic walk AGENTS.md names; its per-file cell title is `:166` `"%s parses cleanly through lexTheta -> parseThetaDocument"`. The other 15 are per-bug witnesses. `grep -l "0081\|0083\|0084"` over those 15 → 4 files (`annotation-nontype-text-refusal`, `fn-call-arity-unchecked`, `interpolation-parse-diagnostics`, `match-pattern-increment-decrement`). Only one has a corpus cell that bears on these claims: `tests/match-pattern-increment-decrement.test.ts:783` (bug 0123) `it("j1: the whole tracked \`.theta\` / \`.thetalib\` corpus draws no increment-decrement"`. That is a second current default-suite witness of 0084's code-specific claim, and 0084 does not cite it either. The other three cite 0083/0084 only in cell prose and have no corpus sweep for those codes.
  - (3) Coverage-matrix rows: `grep -c "committed-fixture\|thetalib" docs/reference/coverage-matrix.md docs/plan_topics/coverage-matrix.md` → 2 and 3. All five are feature rows (Imports `.thetalib`, `cka-44`, `cka-49`, `cka-54`), not a fix-record discharge.
  - (4) AGENTS.md gate names: `AGENTS.md:85-87`, quoted above.
  - (5) CHANGELOG, corroboration only: `grep -n "0081\|0083\|0084" CHANGELOG.md` → the entries at `:5948`, `:6548` and `:7174` (plus two cross-mentions at `:3476` and `:5096`). None of them was used as evidence.
- Honesty-marker check: 0084 does disclose "scratch probe … deleted". That disclosure is exactly what AGENTS.md:87 says does not discharge the claim, and bug 0132 treated the identical 0079 wording as needing a re-point. So this filing is about the missing gate citation, not about the marker. 0083 and 0081 carry no marker.
- Not a truth claim: I do not say any committed source draws these codes. The current gate is green, which proves the opposite for the gate-provable content. The finding is only that the records' evidence chain does not point there.
- Scope: 0079 (already noted by 0132) and 0082/0085 (fix commits after 0.95.0, when the gate already covered `.thetalib`; 0082 cites `tests/committed-fixture-parse-gate.test.ts 36/36`) are excluded. This is one root cause, 0132's discharge sweep stopping at two records, across three records, filed once.

## Triage
verdict: questionable — accounting verified: 0084:171-179 (deleted scratch probe), 0083:237-245 (unnamed parse run, fix vs neutralised) and 0081:492-499 (unnamed "re-measured") reproduce verbatim; all three fix commits 9fe13534/2eafbf10/5de8d78a have the gate at :55 `endsWith(".theta")` only, and d13320b4 (0132) has `ls-files '*.theta' '*.thetalib'` at :76; 0132:997-1002 appended discharge notes to 0095 and 0079 only; grep counts reproduce (committed-fixture-parse-gate 0/0/1, "bug 0132" 0/0/0, the 31-file sweep holds none of 0081/0083/0084); AGENTS.md:85-87 pins the gate as the discharge. Current witnesses exist (tests/committed-fixture-parse-gate.test.ts "%s parses cleanly through lexTheta -> parseThetaDocument"; tests/match-pattern-increment-decrement.test.ts:783 "j1: the whole tracked `.theta` / `.thetalib` corpus draws no increment-decrement"), but for overstated-strength, adding a discharge note to a record is a human ruling. The sibling d10 intakes cover other records (0263, 0176, b0102, 0125, 0151/0152), so this is not a duplicate (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: D10 RULED REWORD (overstated-strength). THREE appends, nothing else; every existing line stays byte-identical. The shared fact: at these fix commits the gate walked .theta only; bug 0132 (d13320b4, 0.95.0) later widened it to git ls-files *.theta *.thetalib, and AGENTS.md pins that gate as the corpus-wide discharge.

(1) APPEND at the very end of docs/bugs/0081-array-ternary-common-type-never-unions.md:

### Discharge note — 2026-09-28 (D10 wave qw20260928081617)

The corpus-wide re-measured claim above was a hand measure predating the .thetalib widening of the committed-fixture gate. The standing discharge is tests/committed-fixture-parse-gate.test.ts (default suite; corpus = git ls-files *.theta *.thetalib; cell: parses cleanly through lexTheta -> parseThetaDocument), pinned by AGENTS.md.

(2) APPEND at the very end of docs/bugs/0083-let-annotation-discarded-from-recorded-binding-type.md:

### Discharge note — 2026-09-28 (D10 wave qw20260928081617)

The corpus-wide parse-run claim above was an unnamed instrument predating the .thetalib widening of the committed-fixture gate. The standing discharge is tests/committed-fixture-parse-gate.test.ts (default suite; corpus = git ls-files *.theta *.thetalib; cell: parses cleanly through lexTheta -> parseThetaDocument), pinned by AGENTS.md.

(3) APPEND at the very end of docs/bugs/0084-increment-decrement-check-dead.md:

### Discharge note — 2026-09-28 (D10 wave qw20260928081617)

The corpus-wide claim above rested on a scratch probe deleted per scratch policy, predating the .thetalib widening of the committed-fixture gate. The standing discharges are tests/committed-fixture-parse-gate.test.ts (default suite; corpus = git ls-files *.theta *.thetalib) and the j1 cell in tests/match-pattern-increment-decrement.test.ts (the whole tracked .theta / .thetalib corpus draws no increment-decrement), pinned by AGENTS.md.
