---
id: PTQ-1576
title: Bug 0204's fix record names its live H8a witness by the token "CELL-B2", which commit e5d760bd never wrote into tests/live/live-production-acceptance.test.ts (the cell landed as "cell 70, cell 69")
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0204-bracket-blind-split-shreds-inline-object-in-generic.md:1093-1100
  - docs/bugs/0204-bracket-blind-split-shreds-inline-object-in-generic.md:1117-1120
  - tests/live/live-production-acceptance.test.ts:11667
  - tests/live/live-production-acceptance.test.ts:11712-11713
  - tests/live/live-production-acceptance.test.ts:11725
  - tests/live/live-production-acceptance.test.ts:11738-11739
  - tests/live/live-production-acceptance.test.ts:11610
  - CHANGELOG.md:4184-4186
sites: 2
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0204's fix record names its live H8a witness by the token "CELL-B2", which commit e5d760bd never wrote into tests/live/live-production-acceptance.test.ts (the cell landed as "cell 70, cell 69")

## Observation
Bug 0204's `## Fix (0.139.0)` names its live witness twice by the token `CELL-B2`. The first mention is in "What shipped", where it is called "token `CELL-B2`" and said to be minted as cell 69 in the lane. The second is the live gate line under "Gates", which carries the both-directions red-proof. The string `CELL-B2` does not appear anywhere under `tests/`, and `git log -S "CELL-B2"` over the live file returns no commit, so the token never resolved. The live cell the record describes is in the named file under `describe("H8a-T — bug 0204 (cell 70, cell 69): …")`. It carried that label at the fix commit `e5d760bd` itself. Its only `B2` trace is the helper name `cellB2ParamsTheta`. The fallback label "cell 69" in the record is not unique in that file: bug 0210's live cell is also labelled "cell 69" (`describe("H8a-T -- bug 0210 (cell cell 69): …")`). CHANGELOG.md's 0.139.0 entry names the same witness as "H8a cell 70".

## Evidence
Claim side, re-read just before filing.

`docs/bugs/0204-bracket-blind-split-shreds-inline-object-in-generic.md:1093-1100`:
```
  - **`tests/live/live-production-acceptance.test.ts` — one additive H8a cell,
    token `CELL-B2`** (minted as cell 69 in this lane; the parent renumbers at
    merge): a theta whose `params:` field is
    `array<{a: string, b: integer, c: boolean}>` REGISTERS and binds through the
    real discovery→registration path, with a plain control and a TRUE-refusal
    control (`array<{a: string | ??? | boolean}>`) beside it so the admission is
    not vacuous. No existing cell renumbered or modified.
```
`docs/bugs/0204-bracket-blind-split-shreds-inline-object-in-generic.md:1117-1120`:
```
  - LIVE H8a `CELL-B2`, run for real, BOTH directions: green with the fix
    (`Tests 1 passed | 68 skipped (69)`), RED under neutralisation lever 1 with
    the pre-fix signature (`did not register … Registered: ["b204livectl"]`),
    green again after restoration.
```

Evidence side (the equivalent witness, opened):

`tests/live/live-production-acceptance.test.ts:11667`:
```
// cell 70 — bug 0204 (cell 69): `lowerTypeExpr`'s generic-application arm
```
`:11712-11713`:
```
// NOTE (cell 70 / cell 69): the parent renumbers cells at merge; a
// tail-append rebase conflict at this site is expected and mechanical.
```
`:11725` (the only `B2` spelling in the cell):
```
function cellB2ParamsTheta(fieldType: string): string {
```
`:11738-11739`:
```
describe("H8a-T — bug 0204 (cell 70, cell 69): a params: field over an inline object with 3+ fields under a generic argument registers, live (Convention: live-host acceptance)", () => {
  it("registers a theta whose params: field declares array<{…}> over a THREE-field inline object, while a union arm carrying author-written junk still does not register, through the real discovery\u2192registration path", async () => {
```
The cell plants `b204livectl`, `b204liveshredded` (`array<{a: string, b: integer, c: boolean}>`) and `b204livebroken` (`array<{a: string | ??? | boolean}>`). It asserts `handle.command("b204liveshredded")` is defined with a failure message beginning "the params: field declaring `array<{a: string, b: integer, c: boolean}>` did not register". That is the observable and signature the record quotes.

`:11610` (the other "cell 69" label in the same file):
```
describe("H8a-T -- bug 0210 (cell cell 69): the spawnSubagentConversation params marshalling record-write site (a2) reaches a REAL spawned subagent child,
```
`CHANGELOG.md:4184-4186` (corroboration only):
```
  byte-intact. Three registry Trigger cells re-derived same commit. Witness:
  `tests/generic-argument-shredded-group-refusal.test.ts` (135 cells) + H8a
  cell 70 (red-proven both directions).
```

Searches (all run in this session):
- Test bodies and titles, token spelling: `grep -rn "CELL-B2" tests | wc -l` → **0**.
- Underscore/camel spellings: `grep -rn "CELL_B2\|cellB2" tests | wc -l` → 25. Of these, `grep -rn "cellB2" tests` → 3 hits (:11725, :11754, :11765), all the helper `cellB2ParamsTheta` inside the bug 0204 cell. The remaining 22 are `*_CELL_B2` constants, which the 0119 filing in this wave attributes to the bug 0118 nested-fn and void-return cells, not to bug 0204.
- Test titles naming the bug: `grep -rnE "(describe|it)\(.*bug 0204" tests | grep live` → 1 hit, `tests/live/live-production-acceptance.test.ts:11738` (the "cell 70, cell 69" describe).
- The fallback label: `grep -n "cell 69" tests/live/live-production-acceptance.test.ts` → 8 hits. 5 belong to bug 0210's cell (:11474, :11480, :11610, :11624, :11639) and 3 to bug 0204's (:11667, :11712, :11738).
- Test filenames: `find tests -iname "*cell-b2*" -o -iname "*cellb2*" | wc -l` → **0**.
- History: `git log --oneline -S "CELL-B2" -- tests/live/live-production-acceptance.test.ts` → **0 commits**. `git show e5d760bd:tests/live/live-production-acceptance.test.ts | grep -n "bug 0204 (cell"` → :11382 and :11453, both already reading "cell 70 / cell 69" at the fix commit. `git show e5d760bd:docs/bugs/0204-…md | grep -c "CELL-B2"` → 2. `git log --oneline -- docs/bugs/0204-…md` → `e5d760bd` and the filing commit `3ef7e086` only, so the record has not been edited since the fix.
- Bug-doc witness lines: `grep -rn "CELL-B2" tests docs/bugs AGENTS.md | wc -l` → 10. Two are this record's claim sites (:1094, :1117). The rest are in 0119, 0157, 0217 and 0220, none in `tests/`.
- Coverage matrix: `grep -c "0204\|CELL-B2" docs/plan_topics/coverage-matrix.md docs/reference/coverage-matrix.md` → **0** and **0**.
- AGENTS.md gate names: `grep -c "CELL-B2" AGENTS.md` → **0**.
- CHANGELOG (corroboration): `grep -n "0204" CHANGELOG.md` → :4042, :4043 (the later 0217 entry) and :4176 (the 0.139.0 entry, whose witness clause at :4185-4186 reads "H8a cell 70").

## Why this is a problem
The fix record's only host-level evidence has two parts: the shipped live cell and its recorded both-directions red-proof. Both point at the literal "token `CELL-B2`", which no file in the tree carries and the test file never carried. The record's fallback, "cell 69", is ambiguous in that file, because bug 0210's cell uses the same label. The number the cell landed under, and that CHANGELOG uses, is "cell 70", which the record never mentions. A reader following the pointer by token finds nothing. The witness does exist: it is the "bug 0204 (cell 70, cell 69)" describe, and it asserts the registration observable and failure text the record quotes. So the evidence is intact and only the pointer is decayed. The cell sits under `tests/live/**`, so the default preflight gate does not prove it. The record words it as a recorded live run, not as a continuous gate, so this filing makes no strength claim.

## Suggested direction (non-binding, optional)
Re-point the two `CELL-B2` mentions (:1094, :1117) at the landed label: H8a cell 70, `describe("H8a-T — bug 0204 (cell 70, cell 69): …")` in `tests/live/live-production-acceptance.test.ts`. CHANGELOG.md already uses that label.

## False-positive check
- Representations covered, one search each, stated above with hit counts: bug-doc witness lines (the record and the docs/bugs corpus), test file names (`find tests -iname`), test titles and bodies (`grep -rn` over `tests/` in hyphen, underscore and camel spellings, and a `describe|it` title search for bug 0204), coverage-matrix rows (both matrix files), AGENTS.md gate names, and CHANGELOG entries (corroboration only).
- The equivalent witness was confirmed by opening the file (:11667–:11800). The three stems, the two `params:` field types and the "did not register … Registered:" failure text match the record's description and quoted signature.
- Not a line-number drift or citation-form issue: the pointer is a cell token, not a `path:line`, and no gate reads `docs/bugs/**` witness tokens.
- The record's own "the parent renumbers at merge" caveat was weighed. It warns that the number may move, but it presents `CELL-B2` as a literal token carried by the cell, and that token never existed in any commit. The renumbered label is not recorded anywhere in 0204.
- Not already filed: the pending 0119 filing (`qw20260928081617-d10-01-78a6560c-b0119-cell-b2-live-token-never-resolved.md`) cites only bug 0119's record. It names 0204 as outside its shard and does not list it. No other pending or accepted filing cites 0204's live-cell token. The root commit here (`e5d760bd`) is different from that filing's (`78a6560c`).
- The other in-scope records were checked for the same class. 0202's live cell is cited by its `-t` title filter, which resolves at `:9813`. 0203's cell resolves by the `b203live*` stems quoted in the record (`:11422`, "cell 68"). 0206's live cell is cited by file path, which resolves. Nothing was executed.

## Triage
verdict: confirmed — decayed pointer reproduces: 0204:1093-1100 and :1117-1120 name the live witness "token `CELL-B2`", but `grep -rn CELL-B2 tests` → 0 and `git log -S CELL-B2` on the live file → 0 commits (the record is unedited since e5d760bd, which already labelled the cell "cell 70, cell 69" at :11382/:11453). The fallback "cell 69" is ambiguous because bug 0210's cell :11610 uses it too. The unambiguous equivalent exists and is verified: tests/live/live-production-acceptance.test.ts describe("H8a-T — bug 0204 (cell 70, cell 69): a params: field over an inline object with 3+ fields under a generic argument registers, live …") at :11738. It plants b204livectl/b204liveshredded/b204livebroken, asserts handle.command("b204liveshredded") with the "did not register" text, and "cell 70" is unique to it in the file. CHANGELOG :4185-4186 corroborates "H8a cell 70". The fix is a mechanical re-point of both mentions. No other intake/PTQ tracks this sha/record: the 0119 filing (78a6560c) excludes 0204, and the 76489c61 file only lists e5d760bd in a git log (triage: claude-opus-5-5)
