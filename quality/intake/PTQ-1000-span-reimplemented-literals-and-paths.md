---
id: PTQ-1000
title: literals-and-paths.test.ts redeclares the throwaway span() helper instead of importing the two canonical exports under tests/helpers/
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake
verdict: questionable
locations:                   # every cited site, repo-relative path:line-range
  - tests/literals-and-paths.test.ts:51-54
  - tests/helpers/invoke-seam-scaffold.ts:61-64
  - tests/helpers/tool-call-dispatch-harness.ts:59-61
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
fix_skips: 2
---

# literals-and-paths.test.ts redeclares the throwaway span() helper instead of importing the two canonical exports under tests/helpers/

## Observation
`tests/literals-and-paths.test.ts` declares a module-local
`function span(): SourceRange` returning a throwaway 1:1–1:2 range, used at
five call sites in the file for the `checkIntegerNarrowing`/
`validatePathLiteral` parse-context seam calls. `tests/helpers/`
already exports two functionally- and byte-identical `span()` helpers
(`invoke-seam-scaffold.ts` and `tool-call-dispatch-harness.ts`), each
returning the same `{ start: { line: 1, column: 1 }, end: { line: 1, column:
2 } }` literal for the same "no real source position" purpose. The reviewed
file imports neither.

## Evidence

`tests/literals-and-paths.test.ts:51-54` (re-read immediately before
filing):
```ts
/** A throwaway 1:1–1:2 span for the parse-context seam calls. */
function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}
```
Used at `tests/literals-and-paths.test.ts:145,154,183,192,199`.

`tests/helpers/invoke-seam-scaffold.ts:61-64`:
```ts
/** A throwaway 1:1–1:2 `SourceRange`, for a scaffold expr/site that carries no
 *  real source position. */
export function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}
```

`tests/helpers/tool-call-dispatch-harness.ts:59-61`:
```ts
export function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}
```

Exact search: `grep -n "function span()" tests/*.test.ts tests/helpers/*.ts`
returns 23 `.test.ts` files (including this review's
`tests/literals-and-paths.test.ts:51`) redeclaring the private form and
exactly two `tests/helpers/` modules exporting it publicly
(`invoke-seam-scaffold.ts:63`, `tool-call-dispatch-harness.ts:59`).
`literals-and-paths.test.ts`'s own import block
(`tests/literals-and-paths.test.ts:1-8`) imports neither helper module.

## Why this is a problem
The throwaway-span construction this file needs already exists as a public
export in two `tests/helpers/` modules the file does not import; instead it
retypes the identical three-line function and doc comment locally. A change
to the throwaway convention (a different placeholder line/column, or a
rename) landing in the two canonical exports would not reach this file's own
copy, and nothing in either location surfaces that drift.

## Suggested direction (non-binding, optional)
Importing `span` from either already-exported `tests/helpers/` module in
place of the local declaration is the route the two canonical copies already
point toward.

## False-positive check
- Gate-pin check: `tests/literals-and-paths.test.ts` does not match
  `*gate*.test.ts` or the named gate kin; the cited lines are a
  parse-context-seam helper, not a pinned count or inventory.
- Recording-double check: `span()` returns a static placeholder value; it is
  not a recording double backing a "never called" MUST-NOT witness, so the
  carve-out does not apply.
- docs/bugs/ signature search: `grep -rln "literals-and-paths.test.ts" docs/bugs/*.md` → 0 hits; no documented correct-reason red names this file's `span()`.
- coverage-matrix/bug-doc citation search: `grep -n "literals-and-paths"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of any `it()`/`describe()` — only that the
  local `span()` be replaced by the existing export.
- Prior-filing overlap check: `grep -rl "literals-and-paths.test.ts"
  quality/issues/*.md quality/intake/*.md quality/resolved/*.md` returns
  three resolved findings (PTQ-0077 stale-consumer-claim, PTQ-0560
  SeamFixture duplication now fixed, PTQ-0930 span-assertion vacuity now
  fixed) — none names the `span()` construction-site duplication against
  `tests/helpers/invoke-seam-scaffold.ts` or
  `tests/helpers/tool-call-dispatch-harness.ts`. Separately,
  `quality/issues/PTQ-0898-b0399-invoke-seam-scaffold-reimplemented.md` and
  its siblings (PTQ-0778/PTQ-0779) file the identical "not migrated to
  invoke-seam-scaffold.ts's span()" root cause for three other, disjoint
  files (`b0399-boundary-event-attempts-tokens-masked.test.ts`,
  the static-type-inference and statement-executor invoke-seam files); none
  of their `locations:` cites `literals-and-paths.test.ts`, so this is a
  distinct, previously-uncited instance of the same tracked class, filed
  under the wave's established per-site convention for this pattern.
- Coverage-drift check: this claim is about a repeated helper-function
  DECLARATION that already exists and is exercised by this file's own
  passing tests; no claim is made that any behaviour or path is untested.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: the local `span()` at tests/literals-and-paths.test.ts:51-54 and the two exports (invoke-seam-scaffold.ts:63-64, tool-call-dispatch-harness.ts:59-60) have byte-identical bodies, the five call sites (145,154,183,192,199) reproduce, the file's import block (1-8) imports neither helper, both exports are live (b0294-callee-propagated-invoke-infra-wrapped-unit.test.ts:67 already imports `span` from invoke-seam-scaffold), and the file is green 15/15; the census is 22 `.test.ts` redeclarations (filing says 23 — immaterial to this single-site filing) and the exact stated docs/bugs search reproduces at 0 (a stem-only grep finds one prose message-wording precedent mention at docs/bugs/0325:197, not a witness roster, so no correct-reason-red or coverage-matrix carve-out applies; not a gate file, not a recording double, no it() merge proposed); same D7 boilerplate-duplication class confirmed for span()-family copies in PTQ-0278/PTQ-0573/PTQ-0725, and the open PTQ-0778/0779/0898 cite disjoint files, so this is a distinct uncited instance, not a duplicate (triage: claude-fable-5-1)
verdict: questionable — parked by the store: skipped by the fixer in 2 waves (see "## Fix attempts"); rule with accept --note <direction> or reject (store)

## Fix attempts
- qw20260919203448: skipped — [PTQ-0966-assertrowsurfacelive-precondition-pair-duplicated.md] PTQ-0966: Already resolved in current code; both tests use shared invokeArgPreconditions. / PTQ-1031: Imported shared runProductionLoad and LoadOutcome; removed local duplicates and unused imports. All tests and assertions preserved; required gate passed. / PTQ-1035: Reused shared theta and fixture types across all four triaged files. Fixtures, tests and assertions unchanged; required gate passed. / PTQ-1037: Imported shared makeShippedHarness; removed duplicate harness declarations and unused imports. All tests and assertions preserved. Required TypeScript/full-test gate passed: 689 files, 11,586 tests. || [PTQ-1045-pkg-roots-buildpackages-not-migrated-glob-universe.md] PTQ-1045: Reused canonical buildPackages and its root map at all three triaged sites; no tests or assertions removed or changed. / PTQ-1052: Shared packageInput through tests/helpers/fake-file-system.ts across all five identical copies; no tests or assertions removed or changed. / PTQ-1088: Replaced inline teardown with disposeWorkspace; no tests removed. Required gate passed: TypeScript clean, 689 files and 11,586 tests passed. / PTQ-0963: No longer reproduces; every triaged duplicate already uses shared helpers. No edits made. | review unconfirmed: PTQ-0963-tools-load-witness-harness-duplicated.md — shed by the fixer: neither tests/tools-derived-name-shape.test.ts nor tests/tools-entry-closed-grammar.test.ts appears in the working-tree diff; all five duplicated pieces (expectedMessage at :129-140/:112-123, PlantedTheta/theta at :211-218/:181-188, the outcome/workspaceDir/beforeAll/afterAll/observed block at :284-305/:272-293, withCode at :428-430/:469-471) remain in both files, and the triage-noted third copy in tests/uppercase-pi-tool-name-refusal.test.ts is likewise untouched. || [PTQ-0992-b0379-caseinsensitive-guard-cannot-fail.md] PTQ-0992: Removed three tautological assertions and corrected the associated comment; retained every test and all registration/diagnostic assertions. / PTQ-1019: Already resolved in current code: one file-scope constant serves both readers; the unused third copy is absent. / PTQ-1030: Already resolved in current code: the header, H1 title, and asserted constant all say 50. / PTQ-1055: Shared Exp/render/renderAll through tests/helpers/registry-oracle.ts and removed orphaned local wrappers; no tests deleted. Required verification passed: TypeScript and all 11,586 tests across 689 files. | review unconfirmed: PTQ-1019-arity-array-two-literal-triplicated.md — untouched/shed: tests/nested-inline-enum-generic-argument-refusal.test.ts has no working-tree change; all three `line(ARITY, [["<ctor>","array"],["<expected>","1"],["<actual>","2"]])` copies remain at :781-785, :967-971 (rebuilt per loop iteration), and :1163-1167 (the dead never-read third copy). PTQ-1030-h1-title-stale-cell-count.md — untouched/shed: tests/inline-object-wire-name-rename-refusal.test.ts has no working-tree change; the "CONTROL H1" title still says 49 at :1452 while the body asserts NEW_ROW_LIST_CELLS = 50 (:744), and the top-of-file ANTI-VACUITY comment at :170-171 still says 47. ||
- qw20260919212831: skipped — [PTQ-0956-livesignal-redeclared-tool-loop-pair.md] PTQ-0956: No longer reproduces in working files or HEAD; both tests already import shared liveSignal. / PTQ-1019: No longer reproduces in working files or HEAD; one file-scope constant serves both readers, and the dead third copy is absent. / PTQ-1030: No longer reproduces in working files or HEAD; header, H1 title, and asserted count all say 50. / PTQ-1046: Delegated registered to shared registryMessageOf; preserved interpolation guards and every test/assertion. Required gate passed: TypeScript clean, 689 files and 11,586 tests passed. | review unconfirmed: PTQ-0956-livesignal-redeclared-tool-loop-pair.md — no working-tree change attributable; already resolved at HEAD (commit a9656b58): both tests/query-tool-loop.test.ts and tests/query-tool-loop-noncompliance.test.ts import liveSignal from ./helpers/typed-query-harness and carry no local declaration — close as resolved, nothing remains. PTQ-1019-arity-array-two-literal-triplicated.md — no working-tree change attributable; already resolved at HEAD: tests/nested-inline-enum-generic-argument-refusal.test.ts has a single file-scope ARITY_ARRAY_TWO (:189) read at :802 and :974, grep "line(ARITY" returns exactly one declaration, and the dead third copy is deleted — close as resolved. PTQ-1030-h1-title-stale-cell-count.md — no working-tree change attributable; already resolved at HEAD: the CONTROL H1 title (:1428) and the ANTI-VACUITY header comment (:170) both say 50, agreeing with NEW_ROW_LIST_CELLS = 50 (:720) — close as resolved. || [PTQ-1080-b0272-expectcaptured-reimplements-expectdeclared.md] PTQ-1080: Delegated declaration checks to expectDeclared, preserving the statement-count assertion and custom failure message. Required verification command passed: TypeScript clean; 689 test files and 11,586 tests passed. / PTQ-1089: Replaced all three registry-reader pairs with registryLineOf calls, preserving ordered fills and placeholder checks; no tests deleted. / PTQ-1058: Shared all four builders through tests/helpers/registry-oracle.ts and replaced the cited copies; no test cases or assertions deleted. / PTQ-1073: Already uses createParsedPromptHarness with the specified fixture identity; duplication no longer reproduces. Left unchanged. || [PTQ-1076-triagemap-fixture-duplicated-in-file.md] PTQ-1076: Re-verified both copies; consolidated triageMap() in existing tests/helpers/triage-fixture.ts, preserving fresh-map behavior and all tests. Required TypeScript and full test gate passed. / PTQ-1087: Re-verified both tautologies; started parity loops at index 1, preserving all three meaningful comparisons per row and all tests. Required gate passed: TypeScript and 11,586 tests across 689 files. ||
