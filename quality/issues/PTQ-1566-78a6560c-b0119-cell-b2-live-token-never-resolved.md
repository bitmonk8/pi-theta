---
id: PTQ-1566
title: Bug 0119's fix record names its live H8a witness "CELL-B2", a label that commit 78a6560c never wrote into tests/live/live-production-acceptance.test.ts (the cell landed as "cell 66")
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0119-proto-named-field-silently-dropped.md:1020-1022
  - docs/bugs/0119-proto-named-field-silently-dropped.md:1027-1030
  - docs/bugs/0119-proto-named-field-silently-dropped.md:1042-1047
  - tests/live/live-production-acceptance.test.ts:11071-11072
  - tests/live/live-production-acceptance.test.ts:11109-11110
  - tests/live/live-production-acceptance.test.ts:11134-11135
  - tests/live/live-production-acceptance.test.ts:11165-11172
  - CHANGELOG.md:4291-4293
sites: 3
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0119's fix record names its live H8a witness "CELL-B2", a label that commit 78a6560c never wrote into tests/live/live-production-acceptance.test.ts (the cell landed as "cell 66")

## Observation
The `## Fix (0.132.0)` section of bug 0119 names its live witness three times by the label `CELL-B2`: once in the "What shipped" list, once in the H8a gate count, and once in the live red-proof under "Verification". The label `CELL-B2` does not appear anywhere in `tests/`. The live cell it describes is in the named file, but under the label "cell 66" (`describe("H8a-T — bug 0119 (cell 66): …")`), and it has had that label since the fix commit `78a6560c` itself. `git log -S "CELL-B2"` over that test file returns no commits, so the token never resolved. The file's own "NOTE (cell 66): the parent renumbers cells at merge" suggests `CELL-B2` was a lane-local placeholder that was renumbered at merge while the record kept the placeholder. CHANGELOG.md's 0.132.0 entry names the same witness correctly as "H8a cell 66".

## Evidence
Claim side, re-read just before filing.

`docs/bugs/0119-proto-named-field-silently-dropped.md:1020-1022`:
```
  - `tests/live/live-production-acceptance.test.ts` — one appended H8a cell
    (CELL-B2) driving both construction sites' `__proto__` field through the
    QRY-18 render into the outbound turn text.
```
`docs/bugs/0119-proto-named-field-silently-dropped.md:1027-1030`:
```
  (6067)`. `npm run typecheck` → clean. `npm run lint` → clean. Live H8a
  `tests/live/live-production-acceptance.test.ts` → `64 passed (64)` (baseline 63
  cells plus CELL-B2). Live H9a `tests/live/acceptance/` → `11 passed (11)` across
  two files, matching baseline.
```
`docs/bugs/0119-proto-named-field-silently-dropped.md:1042-1047`:
```
  run twice. (iii) Live coverage: CELL-B2 red-proven both directions under the live
  lock — green, then `:6195`/`:6284` neutralised gives
  `SITE1=J{"a":"x"}|SITE2=J{"a":"x"}` against the expected
  `SITE1=J{"__proto__":7,"a":"x"}|SITE2=J{"__proto__":7,"a":"x"}`, then restored
  blob-verified and green again — followed by the whole H8a file and both H9a files
  green. (iv) Typecheck and lint clean, re-run after the live cell landed.
```

Evidence side (the equivalent witness, opened):

`tests/live/live-production-acceptance.test.ts:11071-11072`:
```
// Bug 0119 (cell 66) — a schema field literally named `__proto__` was
// silently dropped at construction: `obj[field.name] = value` (both
```
`tests/live/live-production-acceptance.test.ts:11109-11110`:
```
// NOTE (cell 66): the parent renumbers cells at merge; a tail-append rebase
// conflict at this site is expected and mechanical.
```
`tests/live/live-production-acceptance.test.ts:11134-11135`:
```
describe("H8a-T — bug 0119 (cell 66): a schema field named `__proto__` survives construction and renders on the wire, live (Convention: live-host acceptance)", () => {
  it("renders both construction sites' `__proto__` field in the outbound query text instead of dropping it", async () => {
```
`tests/live/live-production-acceptance.test.ts:11165-11172` asserts exactly the expected bytes the record quotes:
```
      expect(
        turn.userTexts,
        ...
      ).toEqual([
        'SITE1=J{"__proto__":7,"a":"x"}|SITE2=J{"__proto__":7,"a":"x"}|END What is 553 plus 241? Answer with the number only.',
      ]);
```
`CHANGELOG.md:4291-4293` (corroboration only):
```
  coercion). Witness: `tests/ctor-proto-named-field.test.ts` (26 cells) +
  cell F of `ctor-declaration-order` re-pinned under its own named authority
  + H8a cell 66 (red-proven both directions).
```

Searches (all run in this session):
- Test titles and test bodies: `grep -rn "CELL-B2" tests | wc -l` → **0**.
- Underscore/camel spellings: `grep -rn "CELL_B2\|cellB2" tests | wc -l` → 25 hits, all in `tests/live/live-production-acceptance.test.ts`. Every one belongs to a different cell: `cellB2ParamsTheta` (:11725, :11754, :11765), the bug 0118 nested-fn constants `NESTED_FN_*_CELL_B2` (:13356–:13460) and the void-return constants `VOID_*_CELL_B2` (:13842–:13959). None is in the bug 0119 cell (:11071–:11180).
- Test filenames: `find tests -iname "*cell-b2*" -o -iname "*cellb2*" | wc -l` → **0**.
- History: `git log --oneline -S "CELL-B2" -- tests/live/live-production-acceptance.test.ts` → **0 commits**. `git show 78a6560c:tests/live/live-production-acceptance.test.ts | grep -n "bug 0119 (cell 66)\|Bug 0119 (cell 66)"` → 2 hits (:10756, :10819), so the cell carried "cell 66" at the fix commit. `git show 78a6560c:docs/bugs/0119-proto-named-field-silently-dropped.md | grep -c "CELL-B2"` → 3.
- Bug-doc witness lines: `grep -n "CELL-B2" docs/bugs/0119-proto-named-field-silently-dropped.md` → 3 hits (:1021, :1029, :1042), the three claim sites above. `grep -rln "CELL-B2" tests docs` → docs/bugs 0119, 0157, 0204, 0217, 0220 (the last four are outside this shard; see False-positive check).
- Coverage matrix: `grep -n "0119\|CELL-B2\|proto-named\|__proto__" docs/plan_topics/coverage-matrix.md docs/reference/coverage-matrix.md` → **0**.
- AGENTS.md gate names: `grep -c "CELL-B2" AGENTS.md` → **0**.
- CHANGELOG (corroboration): `grep -n "0119" CHANGELOG.md` → 3 hits. :4284 is the 0.132.0 entry, whose witness clause (:4293) reads "H8a cell 66".

## Why this is a problem
All three live-evidence claims in the fix record (the shipped cell, the 64/64 H8a count, and the both-direction live red-proof) point at a cell by a label that no file in the tree carries and that the test file never carried. A reader following the pointer finds nothing under `CELL-B2`, and the one `CELL_B2`-spelled cluster in the same file belongs to bug 0118's nested-fn cell, which misdirects the search. The witness does exist as "cell 66" and asserts the exact bytes the record quotes, so the pointer is decayed, not the evidence. The cell is under `tests/live/**`, so it is not gate-proven, and the record correctly words it as a recorded live run rather than a continuous gate.

## Suggested direction (non-binding, optional)
Re-point the three `CELL-B2` mentions to the landed label, "H8a cell 66" (`describe("H8a-T — bug 0119 (cell 66): …")` in `tests/live/live-production-acceptance.test.ts`), which CHANGELOG.md already uses.

## False-positive check
- Representations covered: bug-doc witness lines (grep over the record and over docs/bugs), test titles and bodies (`grep -rn` over `tests/` in the hyphen, underscore and camel spellings), test filenames (`find tests -iname`), coverage-matrix rows (both matrix files), AGENTS.md gate names, and CHANGELOG entries (corroboration only). Each search is stated above with its hit count.
- The equivalent witness was confirmed by opening the file. The "cell 66" describe/it and the byte-exact `SITE1=…|SITE2=…` assertion match the record's red-proof bytes. Its setup (`b119liveproto`, schema `Q { __proto__: integer, a: string }`) is bug 0119's fixture, not another bug's.
- No `CELL_B2` hit belongs to bug 0119. Each of the 25 was checked against its surrounding cell: bug 0118 nested-fn, the void-return cell, and `cellB2ParamsTheta`.
- Not a line-number drift and not citation form: the pointer is a cell label, not a `path:line`, and no citation gate reads `docs/bugs/**` (`tests/citation-symbol-form-gate.test.ts` header: "`docs/bugs/**` is out of scope in both directions").
- Not already filed: no pending or accepted filing in the brief's list names bug 0119's live-cell label (PTQ-0797 concerns the ctor-proto-named-field LiveSessionDouble harness, which is a D7 subject).
- The other records carrying `CELL-B2` (0157, 0204, 0217, 0220) are outside this shard and were not audited. They may share the lane-placeholder pattern but come from different commits.

## Triage
verdict: confirmed — decayed pointer reproduced: bug 0119's record names its live witness `CELL-B2` at :1021, :1029 and :1042. `grep -rn "CELL-B2" tests` finds 0 hits. The 25 `CELL_B2`/`cellB2` hits all sit in other cells (:11725-11765, :13356-13460, :13842-13959). `git log -S "CELL-B2"` on the test file finds 0 commits, and `git show 78a6560c:` of the test file already shows "bug 0119 (cell 66)" (:10756, :10819) while the same commit's record has 3 CELL-B2. There is exactly one equivalent, verified by reading it: tests/live/live-production-acceptance.test.ts describe("H8a-T — bug 0119 (cell 66): a schema field named `__proto__` survives construction and renders on the wire, live …") / it("renders both construction sites' `__proto__` field in the outbound query text instead of dropping it"). It asserts the record's exact `SITE1=J{"__proto__":7,"a":"x"}|SITE2=…` bytes. The 78a6560c commit message and CHANGELOG :4293 also call it "H8a cell 66". No deletion is involved: the token never existed in tests. No other intake/PTQ tracks 78a6560c or bug 0119, so the fix is a mechanical re-point of the three mentions. The candidate file had no `## Triage` heading, so triage added it (triage: claude-opus-5-5)
