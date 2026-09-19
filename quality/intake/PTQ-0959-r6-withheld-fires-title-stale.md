---
id: PTQ-0959
title: "r6 / r6c" it() title claims "the withheld->fires transition" while its own body comment calls that transition moot and asserts a parse-time refusal instead
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake
verdict: questionable
locations:                   # every cited site, repo-relative path:line-range
  - tests/modulo-zero-result-type-number.test.ts:1899-1934
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized           # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918131151
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
fix_skips: 2
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
verdict: questionable — parked by the store: skipped by the fixer in 2 waves (see "## Fix attempts"); rule with accept --note <direction> or reject (store)

## Fix attempts
- qw20260919193904: skipped — [PTQ-0967-fnarg-letrhs-message-builders-duplicated.md] PTQ-0967: Shared six builder pairs through registry-oracle, preserving each file's failure wording. / PTQ-0971: Reused the shared AJV fixture at seven remaining sites; five were already deduplicated. Preserved the distinct production-slug fixture. / PTQ-0972: Replaced the local registry read with readRegistry(["parse"]), retaining the error-message path. / PTQ-0973: Imported shared at/render helpers at three remaining sites. No tests or assertions changed across any issue; the required tsc and full test gate passed (689 files, 11,586 tests). || [PTQ-0975-invoke-arg-array-literal-registry-read-not-migrated.md] PTQ-0975: Replaced local registry parsing with readRegistry(["parse"]); preserved error wording and all assertions. Required TypeScript/full-test gate passed. / PTQ-0977: Replaced duplicated two-page parsing with readRegistry(["parse", "load"]); preserved shard order and all assertions. Required gate passed. / PTQ-0978: Adopted shared production-load and workspace helpers; preserved per-call isolation and cleanup. No tests deleted or weakened. Required gate passed. / PTQ-0981: Imported shared diagLines and removed its local copy and unused types; all assertions preserved. Exact required gate passed: TypeScript clean, 689 test files and 11,586 tests passed. || [PTQ-0982-hexinvocationroot-reimplements-imported-rootdouble.md] PTQ-0982: Delegated hexInvocationRoot to rootDouble with an invocation-ID override; sequence behavior preserved. / PTQ-0983: Shared invokeArgMessage across all five triaged copies, preserving registry interpolation and failure checks. / PTQ-0984: Shared loweredParams across all eight triaged copies, preserving source construction and paths; affected live cell passed. / PTQ-0986: Imported the existing noopPi and removed its local duplicate. No tests or assertions removed across these fixes; required gate passed—TypeScript clean, 689 files and 11,586 tests green. ||
- qw20260919203448: skipped — [PTQ-0966-assertrowsurfacelive-precondition-pair-duplicated.md] PTQ-0966: Already resolved in current code; both tests use shared invokeArgPreconditions. / PTQ-1031: Imported shared runProductionLoad and LoadOutcome; removed local duplicates and unused imports. All tests and assertions preserved; required gate passed. / PTQ-1035: Reused shared theta and fixture types across all four triaged files. Fixtures, tests and assertions unchanged; required gate passed. / PTQ-1037: Imported shared makeShippedHarness; removed duplicate harness declarations and unused imports. All tests and assertions preserved. Required TypeScript/full-test gate passed: 689 files, 11,586 tests. || [PTQ-1045-pkg-roots-buildpackages-not-migrated-glob-universe.md] PTQ-1045: Reused canonical buildPackages and its root map at all three triaged sites; no tests or assertions removed or changed. / PTQ-1052: Shared packageInput through tests/helpers/fake-file-system.ts across all five identical copies; no tests or assertions removed or changed. / PTQ-1088: Replaced inline teardown with disposeWorkspace; no tests removed. Required gate passed: TypeScript clean, 689 files and 11,586 tests passed. / PTQ-0963: No longer reproduces; every triaged duplicate already uses shared helpers. No edits made. | review unconfirmed: PTQ-0963-tools-load-witness-harness-duplicated.md — shed by the fixer: neither tests/tools-derived-name-shape.test.ts nor tests/tools-entry-closed-grammar.test.ts appears in the working-tree diff; all five duplicated pieces (expectedMessage at :129-140/:112-123, PlantedTheta/theta at :211-218/:181-188, the outcome/workspaceDir/beforeAll/afterAll/observed block at :284-305/:272-293, withCode at :428-430/:469-471) remain in both files, and the triage-noted third copy in tests/uppercase-pi-tool-name-refusal.test.ts is likewise untouched. || [PTQ-0992-b0379-caseinsensitive-guard-cannot-fail.md] PTQ-0992: Removed three tautological assertions and corrected the associated comment; retained every test and all registration/diagnostic assertions. / PTQ-1019: Already resolved in current code: one file-scope constant serves both readers; the unused third copy is absent. / PTQ-1030: Already resolved in current code: the header, H1 title, and asserted constant all say 50. / PTQ-1055: Shared Exp/render/renderAll through tests/helpers/registry-oracle.ts and removed orphaned local wrappers; no tests deleted. Required verification passed: TypeScript and all 11,586 tests across 689 files. | review unconfirmed: PTQ-1019-arity-array-two-literal-triplicated.md — untouched/shed: tests/nested-inline-enum-generic-argument-refusal.test.ts has no working-tree change; all three `line(ARITY, [["<ctor>","array"],["<expected>","1"],["<actual>","2"]])` copies remain at :781-785, :967-971 (rebuilt per loop iteration), and :1163-1167 (the dead never-read third copy). PTQ-1030-h1-title-stale-cell-count.md — untouched/shed: tests/inline-object-wire-name-rename-refusal.test.ts has no working-tree change; the "CONTROL H1" title still says 49 at :1452 while the body asserts NEW_ROW_LIST_CELLS = 50 (:744), and the top-of-file ANTI-VACUITY comment at :170-171 still says 47. ||
