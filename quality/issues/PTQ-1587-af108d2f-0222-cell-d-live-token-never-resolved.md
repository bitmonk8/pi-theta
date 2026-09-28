---
id: PTQ-1587
title: "Bug 0222's 0.166.0 fix record names its live cell as `CELL-D` and gives the gate as `-t \"CELL-D\"`, but af108d2f landed the cell titled \"(cell 83)\" and no test title contains `CELL-D`"
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0222-qry4-let-mismatch-reads-refused-annotation.md:532-535
  - docs/bugs/0222-qry4-let-mismatch-reads-refused-annotation.md:572-575
  - docs/bugs/0222-qry4-let-mismatch-reads-refused-annotation.md:607-609
  - tests/live/live-production-acceptance.test.ts:13725-13726
sites: 3
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0222's 0.166.0 fix record names its live cell as `CELL-D` and gives the gate as `-t "CELL-D"`, but af108d2f landed the cell titled "(cell 83)" and no test title contains `CELL-D`

## Observation
The `## Fix (0.166.0)` section of bug 0222 names its live H8a cell with the lane token `CELL-D` three times: in What shipped, in the Gates live command, and in Verification. The Gates command is `npx vitest run … tests/live/live-production-acceptance.test.ts -t "CELL-D"`. `-t` filters on test names. No `describe`/`it` title in that file contains `CELL-D`, and neither does any test under `tests/`, so the command as written selects no cell. The fix commit af108d2f landed the cell as `describe("H8a-T — bug 0222: …")` with the `it` title ending "(cell 83)". Only file-local constant names (`CELL_D_REFUSAL_CODE`, `CELL_D_MISMATCH_CODE`, `CELL_D_REGISTRY`) keep the lane letter, and they are not test names. The record has not been edited since af108d2f.

## Evidence
Claim side, `docs/bugs/0222-qry4-let-mismatch-reads-refused-annotation.md:532-535` (What shipped; re-read before filing):
```
  - `tests/live/live-production-acceptance.test.ts` — additive-only: one H8a
    cell appended at the end of the file, tagged `CELL-D`, asserting the
    subject's `theta-system-note` notes carry the refusal fragment and NOT the
    mismatch fragment, with a well-formed-mismatch liveness control asserted
```
`:572-575` (Gates):
```
  - Live: `npx vitest run --config config/vitest/vitest.live.config.ts
    tests/live/live-production-acceptance.test.ts -t "CELL-D"` →
    `Tests 1 passed | 81 skipped (82)` (the 81 are the `-t` filter's, not
    skips in the cell).
```
`:607-609` (Verification):
```
  - Live: round 1 ran the new `CELL-D` cell green but did not prove it can
    red, and the subject theta does not register — so the decisive
    "no mismatch note" assertion was suspected vacuous. Round 2 settled it by
```

Equivalent witness, `tests/live/live-production-acceptance.test.ts:13725-13726`:
```
describe("H8a-T — bug 0222: the QRY-4 explicit-schema check withholds a refused `let` annotation, live (Convention: live-host acceptance)", () => {
  it("a `let` annotation array<integer--> refused by the parser draws the refusal alone on the theta-system-note channel, with no explicit-schema-mismatch warning beside it (cell 83)", async () => {
```
A sibling live file refers to this cell by number: `tests/live/par-for-body-qry4-mismatch-live-cell.test.ts:40` ("the liveness control of bug 0222's cell 83") and `:48` ("bug 0222 cell 83's scoping").

Searches (run this session):
- Test titles / tokens: `grep -rnw 'CELL-D' tests/ | wc -l` → 0.
- Live file history: `git log --oneline -S'CELL-D' -- tests/live/live-production-acceptance.test.ts | wc -l` → 0.
- Landing: `git show af108d2f -- tests/live/live-production-acceptance.test.ts | grep -n "^+describe\|^+  it("` → the two lines quoted above, the `it` ending "(cell 83)". `grep -c '(cell 83)' tests/live/live-production-acceptance.test.ts` → 1.
- Same-commit origin: `git show af108d2f -- docs/bugs/0222-qry4-let-mismatch-reads-refused-annotation.md | grep -c '^+.*CELL-D'` → 3. Unrepaired since: `git log --oneline af108d2f..HEAD -- docs/bugs/0222-…md | wc -l` → 0.
- Test file names: `grep -rln '0222' tests/live/` → 2 files: the acceptance file above and `par-for-body-qry4-mismatch-live-cell.test.ts`, whose comments cite "cell 83".
- Coverage matrix / AGENTS.md gate names: `grep -nw 'CELL-D\|CELL-B2' docs/reference/coverage-matrix.md AGENTS.md | wc -l` → 0.
- CHANGELOG (corroboration only): `grep -nw 'CELL-D\|CELL-B2' CHANGELOG.md | wc -l` → 0.

## Why this is a problem
The record's live claims ("tagged `CELL-D`", the `-t "CELL-D"` gate with its "Tests 1 passed" result, and "the new `CELL-D` cell green … Round 2 settled it") rest on a pointer no test carries. As written, the recorded gate command cannot select the cell it reports as passing, so a re-run following the record verifies nothing. An equivalent cell exists, so the chain breaks at the pointer. That cell is under `tests/live/**`: it exists, but the preflight gate does not prove it.

## Suggested direction (non-binding, optional)
Re-point the three mentions, including the `-t` filter, at "cell 83" / the bug 0222 H8a-T describe in `tests/live/live-production-acceptance.test.ts`.

## False-positive check
- Representations covered: bug-doc What shipped / Gates / Verification lines (all three sites quoted); test file names (two live files mention 0222, and both identify the cell as "cell 83"); test titles and tokens (`CELL-D` → 0 in `tests/`; the `CELL_D_*` identifiers are constants, not titles `-t` can match); coverage-matrix rows and AGENTS.md gate names (0 hits); CHANGELOG (0 hits for the token).
- Not a later rename: the token was never in the live file's history, and af108d2f wrote both the numbered cell and the token-bearing record.
- The other witness pins in the record resolve: `tests/qry4-refused-annotation-withhold.test.ts` exists with 14 `it(` cells, and `tests/annotation-nontype-text-refusal.test.ts` carries `WITHHELD (o1)`/`WITHHELD (o2)` and the `WITHHOLD_OWNER` constant (`:1891`, `:1899`, `:1921`).
- Existing same-sha candidate: `qw20260928081617-d10-02-af108d2f-0124-group-o-residual-pin-flipped-no-note.md` also names af108d2f, but it covers a different defect: bug 0124's flipped group (o) pin. It cites 0222 only at `:642-644` as the re-pinning record and never mentions the `CELL-D` live pointer (`grep -n 'CELL-D'` over it → 0 lines). No record is double-listed.

## Triage
verdict: confirmed — the pointer does not resolve: docs/bugs/0222-qry4-let-mismatch-reads-refused-annotation.md:533 ("tagged `CELL-D`"), :573 (Gates `-t "CELL-D"` → "Tests 1 passed") and :607 ("the new `CELL-D` cell green") are the record's only CELL-D uses. `grep -rnw CELL-D tests/` gives 0, `git log -S'CELL-D'` on the live file gives 0 commits, and the coverage matrix, AGENTS.md and CHANGELOG give 0. Only the constants CELL_D_REFUSAL_CODE/CELL_D_MISMATCH_CODE/CELL_D_REGISTRY (:13677-13681) carry the letter, and `-t` cannot match them. af108d2f wrote all 3 `+…CELL-D` record lines (commit message: "H8a tail cell"), and no commit has touched the record since. There is one unambiguous equivalent, verified: tests/live/live-production-acceptance.test.ts:13725-13726, describe "H8a-T — bug 0222: the QRY-4 explicit-schema check withholds a refused `let` annotation, live (Convention: live-host acceptance)" / it "a `let` annotation array<integer--> refused by the parser draws the refusal alone on the theta-system-note channel, with no explicit-schema-mismatch warning beside it (cell 83)". It is the only live describe/it that cites 0222, `(cell 83)` occurs once, and par-for-body-qry4-mismatch-live-cell.test.ts:40/:48 cite "bug 0222's cell 83". The re-point is mechanical, the same as the confirmed 0217/0113 CELL-D siblings. Not a duplicate of the lexicographically-earlier af108d2f-0124 filing: af108d2f deleted nothing in either case, so this is not a same-deleting-sha cluster, and 0124 covers a different defect in a different record (the missing discharge note after the o1/o2 re-pin). (triage: claude-opus-5-5)
