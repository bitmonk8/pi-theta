---
id: PTQ-1577
title: "Bug 0175's 0.144.0 fix record names its live verification leg \"LIVE H8a `CELL-B3`\", but fdcb0835 landed that cell in tests/live/live-production-acceptance.test.ts as \"bug 0175 cell 73\" and no test in the tree carries `CELL-B3`"
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0175-literal-sublanguage-parser-ignores-trailing-tokens.md:1091-1100
  - tests/live/live-production-acceptance.test.ts:12199-12200
  - tests/live/live-production-acceptance.test.ts:12256
  - tests/live/live-production-acceptance.test.ts:12290
sites: 1
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0175's 0.144.0 fix record names its live verification leg "LIVE H8a `CELL-B3`", but fdcb0835 landed that cell in tests/live/live-production-acceptance.test.ts as "bug 0175 cell 73" and no test in the tree carries `CELL-B3`

## Observation
The `## Fix (0.144.0)` Gates list in bug 0175 identifies its live cell only by the token `CELL-B3`. It gives no file path or test title. The record claims that cell ran green, red-proven in both directions. No file under tests/ contains the string `CELL-B3`, and it was absent at the fix commit fdcb0835 too, which wrote both the record line and the live cell. That commit landed the cell as "cell 73" (comment banner and `describe` title). The commit's own message says "H8a cell 73 (was CELL-B3)". So the renumbering happened in the test file and the CHANGELOG, but the record kept the lane-era token.

## Evidence
Claim side, `docs/bugs/0175-literal-sublanguage-parser-ignores-trailing-tokens.md:1091-1100` (re-read before filing):
```
  - LIVE H8a `CELL-B3`, run for real, BOTH directions: green with the fix
    (`Tests 1 passed | 70 skipped (71)`); RED under the fix's neutralisation with
    the pre-fix signature (`b175liverefused` registering — the residue-carrying
    default admitted, `theta/parse/default-not-literal did not fire`); RED in the
    OVER-refusal direction too, by making `residueOf` report residue for a parse
    that consumed everything, which fails the conformant `count: number = 3`
    sibling's precondition loudly (`the conformant \`count: number = 3\` sibling
    did not register`); green again after restoration, blob
    `aaeec259c3ad35c0599fdda7325ac2f1c847bfe3`. A cell that can red in only one
    direction would hide an over-refusal inside a passing control.
```
This is the only `CELL-B3` mention in the record (`grep -n "CELL-B3" docs/bugs/0175-literal-sublanguage-parser-ignores-trailing-tokens.md` → 1 hit, line 1091). The record never names the cell's file path or "cell 73".

Evidence side, the equivalent witness, `tests/live/live-production-acceptance.test.ts:12199-12200`:
```
// cell 73 — bug 0175: a `params:` default whose parse leaves tokens
// unconsumed does not register, live (Convention: live-host acceptance).
```
`:12290`:
```
describe("H8a-T — bug 0175 cell 73: a params: default whose parse leaves a second literal unconsumed does not register, live (Convention: live-host acceptance)", () => {
```
`:12256` (the only surviving trace of the lane-era name, a helper-function identifier, not a test name):
```
function cellB3ResidueDefaultTheta(): string {
```
This cell does contain the `b175liverefused` stem the record quotes (`:12301`, `:12337`, `:12346`), so it is the cell the record means.

Searches (run this session):
- Test titles / tokens: `grep -rn "CELL-B3" tests/ | wc -l` → 0. So `vitest -t "CELL-B3"` selects nothing.
- Case-insensitive variants: `grep -rni "cell-b3\|cell b3" tests/ | wc -l` → 17. All 17 are unrelated "cell B3"/"cell b3" cells of other bugs, in `tests/b0405-grammar-cite-sweep-gate.test.ts`, `tests/imported-thetalib-fn-call-args-checked.test.ts`, `tests/invoke-arg-type-mismatch-wired.test.ts`, `tests/params-default-unary-minus-non-numeric-refusal.test.ts`, `tests/proto-named-record-write-sites.test.ts` and `tests/proto-named-schema-validator-enforcement.test.ts`. None is under tests/live/.
- Helper identifiers: `grep -rn "cellB3" tests/ | wc -l` → 4, all in `tests/live/live-production-acceptance.test.ts` (`:12256`, `:12277`, `:12301`, `:12304`). These are function names, not a cell name or test title.
- At the fix commit: `git show fdcb0835:tests/live/live-production-acceptance.test.ts | grep -c "CELL-B3"` → 0. The token was never in the file.
- History: `git log --oneline -S'CELL-B3' --all` → 1 commit, fdcb0835 (the record's own authoring commit). No commit ever added the token to tests/.
- Same-commit authorship: `git show fdcb0835 -- docs/bugs/0175-literal-sublanguage-parser-ignores-trailing-tokens.md | grep -c "^+.*CELL-B3"` → 1. `git log -1 --format=%B fdcb0835` contains "H8a cell 73 (was CELL-B3)".
- Test filenames: `ls tests/live | grep -i -E "0175|residue|b175" | wc -l` → 0. The live leg lives only inside the shared H8a file. The offline witness `tests/params-default-trailing-residue-refusal.test.ts` exists, and the cells d7/d8 the record cites exist at `:701` and `:725`, so only the live-leg pointer is affected.
- Coverage matrix / AGENTS.md gate names: `grep -n -i "cell-b3\|cell 73" AGENTS.md docs/*.md | wc -l` → 0. The record's live leg cites neither, so they do not apply.
- CHANGELOG (corroboration only): the 0.144.0 entry (`CHANGELOG.md:4093`ff.) names the live leg "H8a cell 73 (red-proven both directions)". `grep -n "CELL-B3" CHANGELOG.md` → 0.

## Why this is a problem
The record's live-verification claim ("run for real, BOTH directions", green / red / red / green) hangs on a cell identifier that has never resolved in the tree. A reader or triager following "H8a `CELL-B3`" finds no such cell. The cell exists under another name ("cell 73"), which the same commit's message and the CHANGELOG use, so the pointer decayed at landing rather than through a later deletion. The cell is a tests/live/** witness: it exists, but the preflight gate does not prove it, so the both-directions claim rests on the record's own account of a run.

## Suggested direction (non-binding, optional)
Append a dated note that re-points the record's `CELL-B3` at "bug 0175 cell 73" in `tests/live/live-production-acceptance.test.ts` (the `describe` at `:12290`), the name the commit message and the CHANGELOG already use.

## False-positive check
- Checked that the cited cell exists under another name. The `b175liverefused` / `b175livegood` stems and the `count: number = 3` control the record describes are in the cell-73 block (`:12298-12346`), so this is a pointer decay, not a missing witness.
- Checked that the token is not resolvable some other way: 0 exact hits in tests/. The 17 case-insensitive "cell b3" hits are other bugs' cells outside tests/live/. The `cellB3…` hits are helper identifiers, disclosed above.
- Representations covered: bug-doc Witness/Gates lines (the record, read in full at `## Fix (0.144.0)`), test file names (tests/live listing), test titles and it()/describe() strings (the grep over tests/), coverage matrix and AGENTS.md gate names (0 hits), CHANGELOG (corroboration, "cell 73").
- Checked the pending candidates for duplicates: no pending or filed candidate cites bug 0175 or fdcb0835. The sibling filings are the same class for other records (e.g. `qw20260928081617-d10-01-590fc43e-b0104-cell-c-token-never-in-tree.md`).
- Citation form is not the subject: no gate checks a bug record's live-cell token. This is pointer resolution, not cite syntax.

## Triage
verdict: confirmed — decayed-pointer reproduces: bug 0175's record:1091 is its only `CELL-B3` cite, and `CELL-B3` has 0 hits in tests/, both now and at fdcb0835. `git log -S'CELL-B3'` shows only fdcb0835, whose message says "H8a cell 73 (was CELL-B3)". The one unambiguous equivalent exists and is verified: tests/live/live-production-acceptance.test.ts describe "H8a-T — bug 0175 cell 73: a params: default whose parse leaves a second literal unconsumed does not register, live (Convention: live-host acceptance)" (:12290). Its banner is at :12199, and it holds the b175liverefused/b175livegood stems and the `count: number = 3` precondition message the record quotes. CHANGELOG:4102 names it "H8a cell 73". The 17 case-insensitive "cell b3" hits are other bugs' cells outside tests/live. No deleting sha is involved and no other candidate tracks fdcb0835 or bug 0175. The fix is a mechanical re-point. The file lacked its `## Triage` heading; triage added it (triage: claude-opus-5-5)
