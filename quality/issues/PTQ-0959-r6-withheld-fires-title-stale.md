---
id: PTQ-0959
title: "r6 / r6c" it() title claims "the withheld->fires transition" while its own body comment calls that transition moot and asserts a parse-time refusal instead
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/modulo-zero-result-type-number.test.ts:1899-1934
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized           # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918131151
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# "r6 / r6c" it() title claims "the withheld->fires transition" while its own body comment calls that transition moot and asserts a parse-time refusal instead

## Observation
`tests/modulo-zero-result-type-number.test.ts:1899` names its cell
`"r6 / r6c: a non-numeric LEFT operand at the invoke sink — the
withheld->fires transition"`. Cells r1–r5, immediately above this one, test
exactly that transition: whether `linesForCode(stem, INVOKE_ARG_CODE)`
renders `<actual>` as `integer` (withheld) or `number` (fires) at the
`collectProvableArgTypes` mirror. This cell's own first line of body comment
states the opposite of its title: bug 0332 "SUPERSEDES this class at both
cells… the withheld → fires transition for `%`… become[s] moot", and the
cell's assertions verify a completely different subject — that the caller
now refuses at PARSE (`ARITHMETIC_CODE`) before ever reaching the invoke-arg
sink, and that `INVOKE_ARG_CODE` never fires for `modleftstr` at all.

## Evidence
`tests/modulo-zero-result-type-number.test.ts:1899-1919` (title, the body's
own disclaimer, and the assertions that follow it):
```ts
  it("r6 / r6c: a non-numeric LEFT operand at the invoke sink — the withheld->fires transition", () => {
    // Bug 0332 SUPERSEDES this class at both cells: `"a" % 0` and `"a" - 0`
    // now refuse at PARSE (`theta/parse/non-numeric-arithmetic-operands`)
    // before either planted caller ever reaches `collectProvableArgTypes` and
    // the §Fix (c) mirror this class measures — the withheld → fires
    // transition for `%` and the stays-withheld control for `-` both become
    // moot once neither operand pair survives to that sink. The subject each
    // cell probes ('what does the invoke-arg mirror do with this argument') is
    // superseded by 'does this caller load at all', which is what these two
    // cells now pin: both callers flip from loading clean to a LOAD refusal
    // carrying the new code, and neither registers.
    expect(
      linesForCode("modleftstr", ARITHMETIC_CODE).some((line) =>
        line.includes(arithmeticMessage("%", "string", "integer")),
      ),
      `bug 0332's gate must refuse this caller's \`"a" % 0\` argument at parse, before the invoke-arg mirror this class used to measure is ever reached. Lines for this caller: ${JSON.stringify(linesFor("modleftstr"))}`,
    ).toBe(true);
    expect(
      linesForCode("modleftstr", INVOKE_ARG_CODE),
      `a caller refused at parse must not also reach the invoke-arg sink this class measures. Lines for this caller: ${JSON.stringify(linesFor("modleftstr"))}`,
    ).toEqual([]);
```
The second `expect` (`:1916-1919`) asserts `linesForCode("modleftstr",
INVOKE_ARG_CODE)` — the exact channel r1–r5 read to detect "fires" — equals
`[]`: the invoke-arg sink never fires for this caller. No assertion in this
cell reads `INVOKE_ARG_CODE` for `subleftstr` (`r6c`) at all; both cells'
assertions are built entirely from `ARITHMETIC_CODE` lines and
`outcome.registered`.

Compare cell r1, immediately above, which the title `"the withheld->fires
transition"` describes accurately (`tests/modulo-zero-result-type-number.test.ts:1783-1793`):
```ts
  it("r1: `invoke(\"./cstr.theta\", 1 % 0)` renders `<actual>` = number", () => {
    assertRowSurfaceLive();
    expect(
      linesForCode("modzero", INVOKE_ARG_CODE).some((line) =>
        line.includes(invokeArgMessage(0, "x", "string", "number")),
      ),
```
r1 reads `INVOKE_ARG_CODE` lines and checks the rendered `<actual>` token —
the actual withheld→fires observable. r6/r6c's own comment says this same
observable "become[s] moot" for its two callers, and its assertions read
`ARITHMETIC_CODE` and registration instead.

## Why this is a problem
A reader who trusts the `it()` name and skips the block comment — the normal
way a test suite is skimmed for what it covers — would conclude this cell
measures the invoke-arg mirror's `<actual>` rendering flipping from
`integer` (withheld) to `number` (fires), the same class r1–r5 measure. The
cell's own comment states plainly that this is no longer true ("become[s]
moot") and that the two assertions instead measure whether the caller loads
at all. The mismatch is not a matter of interpretation: the second assertion
in the cell (`:1916-1919`) pins `linesForCode("modleftstr", INVOKE_ARG_CODE)`
to `[]` — the withheld→fires channel produces NOTHING for this caller,
which is the opposite of what "the withheld->fires transition" says the
cell is about. The title is the pre-bug-0332 description of what this cell
used to test, left in place after the cell's own body was rewritten (per its
first comment line) to test bug 0332's supersession instead.

## Suggested direction (non-binding, optional)
The cell's own first comment line ("the subject each cell probes… is
superseded by 'does this caller load at all'") already states the accurate
description; renaming the `it()` title to describe the parse-time-refusal
subject the assertions actually check would put the title and the comment
back in agreement.

## False-positive check
- Gate-pin check: `tests/modulo-zero-result-type-number.test.ts` does not
  match `*gate*.test.ts` or the named gate kin; nothing cited is a pinned
  count or inventory assertion.
- Recording-double check: `linesForCode`/`outcome.registered` read a real
  `discoverAndComposeFixtures` load's diagnostic-line and registration
  output, not a recording double's captured call log backing a MUST-NOT
  witness.
- docs/bugs/ signature search: `grep -n "withheld->fires\|r6 / r6c\|r6c"
  docs/bugs/0152-modulo-zero-result-type-not-number.md` → one hit, line
  1211, which is bug 0152's own §Residuals prose written before bug 0332
  landed ("at the invoke sink the class flips the other way, from withheld
  to firing (r6 / r6c)") — the document that motivated the original title,
  not a defence of keeping it after the cell's own later comment says the
  transition it names is moot. `grep -n "0332" docs/bugs/0152-modulo-zero-result-type-not-number.md`
  → 0 hits: bug 0152's own document does not mention bug 0332 at all, so it
  supplies no rationale for the title surviving that later change.
  `npx vitest run tests/modulo-zero-result-type-number.test.ts` passes in
  full at HEAD — not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "modulo-zero-result-type-number" docs/reference/coverage-matrix.md` → 0
  hits. This finding proposes no merge, rename, or deletion of the cell —
  only that its `it()` title text mismatches what its own body already says
  it now tests.
- Coverage check: the claim is about the wording of an existing, passing
  cell's name against its own body and comment; it does not allege a
  missing test path.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: the `it()` title at tests/modulo-zero-result-type-number.test.ts:1899 reproduces verbatim and its body (:1900-1934) asserts only `ARITHMETIC_CODE` hits for modleftstr/subleftstr, `linesForCode("modleftstr", INVOKE_ARG_CODE)` → `[]` and non-registration, i.e. the parse-time refusal its own "Bug 0332 SUPERSEDES this class" comment describes, never the `<actual>` integer→number rendering that r1–r5 (:1783-1797) measure under that title; `git log -S` shows the title was authored in 35b718cc (bug 0152) and the SUPERSEDES body added in 6ed73f9b (bug 0332) without touching the title — the same commit and pattern human-ruled confirmed in PTQ-0266/PTQ-0280 (sibling division-result-type-number*.test.ts cells; this file is not cited by either, so not a duplicate), and the fixture header comment at :1736-1742 ("withheld->fires class", "it stays withheld") carries the same stale claim and belongs in the same fix; stated searches reproduce (docs/bugs/0152 → 1 hit at :1211 pre-0332 prose, `0332` → 0 hits there; bug 0332 doc :208/:295 cites this file by path and fixture lines only; coverage-matrix → 0; 42/42 green so not a documented red); D7 misleading-name class under tests/, not a gate file, no recording double (triage: claude-fable-5-1)
