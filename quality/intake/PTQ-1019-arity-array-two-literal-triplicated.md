---
id: PTQ-1019
title: the `array` arity-1-over-2 registry line is built from the same literal three times inside nested-inline-enum-generic-argument-refusal.test.ts
lens: D7
status: intake
verdict: questionable
locations:                   # every cited site, repo-relative path:line-range
  - tests/nested-inline-enum-generic-argument-refusal.test.ts:781-785
  - tests/nested-inline-enum-generic-argument-refusal.test.ts:967-971
  - tests/nested-inline-enum-generic-argument-refusal.test.ts:1163-1167
sites: 3                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
fix_skips: 2
---

# the `array` arity-1-over-2 registry line is built from the same literal three times inside nested-inline-enum-generic-argument-refusal.test.ts

## Observation
`tests/nested-inline-enum-generic-argument-refusal.test.ts` renders the same
registered `theta/parse/generic-arity-mismatch` line — `array`, expected `1`,
actual `2` — through three independent calls to `line(ARITY, [...])` with the
identical three-entry substitution array, once as a module-scope `const`
inside the `(c)` describe block, once recomputed inside a `for`-loop body
inside the `(d)` describe block, and once again as a module-scope `const`
inside the `(f)` describe block. No shared constant or helper backs any of
the three.

## Evidence
`tests/nested-inline-enum-generic-argument-refusal.test.ts:781-785` (inside `describe("bug 0217 (c) …")`):
```ts
  const ARITY_ARRAY_TWO = line(ARITY, [
    ["<ctor>", "array"],
    ["<expected>", "1"],
    ["<actual>", "2"],
  ]);
```

`tests/nested-inline-enum-generic-argument-refusal.test.ts:967-971` (inside `describe("bug 0217 (d) …")`, re-declared inside the body of a `for (const position of SINK_POSITIONS)` loop, so it is re-evaluated once per iteration):
```ts
      const arityArrayTwo = line(ARITY, [
        ["<ctor>", "array"],
        ["<expected>", "1"],
        ["<actual>", "2"],
      ]);
```

`tests/nested-inline-enum-generic-argument-refusal.test.ts:1163-1167` (inside `describe("bug 0217 (f) …")`):
```ts
  const arityArrayTwo = line(ARITY, [
    ["<ctor>", "array"],
    ["<expected>", "1"],
    ["<actual>", "2"],
  ]);
```

Exact search: `grep -n "line(ARITY" tests/nested-inline-enum-generic-argument-refusal.test.ts` returns exactly these three hits, no others. `grep -rn "generic-arity-mismatch\|GENERIC_ARITY\|arityMessage\|arityLine" tests/helpers/*.ts` returns no hit — no `tests/helpers/` module exports a builder for this registry line.

## Why this is a problem
The same four-line substitution literal for the one registered arity message this file exercises (`array` over-applied to 2 arguments against arity 1) is retyped three times in one file rather than declared once. The middle copy (:967-971) is additionally declared inside the loop body it is used in, so it is rebuilt on every one of the loop's iterations rather than being hoisted once like the other two copies in the same file. A change to the placeholder set this registry row carries would need the identical hand-edit applied in three places within this one file to stay in sync, with nothing surfacing a copy left behind.

## Suggested direction (non-binding, optional)
The two module-scope copies (:781-785, :1163-1167) already show the shape a single file-scope constant would take; the loop-body copy (:967-971) already sits beside a `for` loop that could read the same constant instead of rebuilding it once per iteration.

## False-positive check
- Gate-pin check: `tests/nested-inline-enum-generic-argument-refusal.test.ts` does not match `*gate*.test.ts` or the named gate kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate, registry-closed-set-corpus-gate); nothing cited here is a pinned count or corpus inventory.
- Recording-double check: `line(ARITY, [...])` builds an expected message string for a positive `toEqual` assertion; it is not a recording double backing a "never called" MUST-NOT witness, so the carve-out does not apply.
- docs/bugs/ signature search: `grep -n "ARITY_ARRAY_TWO\|arityArrayTwo" docs/bugs/*.md` returns 0 hits; no documented correct-reason red names this literal.
- coverage-matrix/bug-doc citation search: `grep -n "nested-inline-enum-generic-argument-refusal" docs/reference/coverage-matrix.md` returns 0 hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()` cell — only that the three identical literal declarations could be one.
- Prior-filing search: `grep -rl "ARITY_ARRAY_TWO\|arityArrayTwo" quality/issues quality/intake quality/resolved` returns no hit before this filing.
- Coverage-drift check: this claim is about a repeated literal-construction expression that exists three times today; every cited copy is already exercised by its own file's passing tests, and no claim is made that any behaviour or path is untested.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: all three excerpts reproduce verbatim at tests/nested-inline-enum-generic-argument-refusal.test.ts:781-785 / :967-971 (inside the `for (const position of SINK_POSITIONS)` body) / :1163-1167; `grep -n "line(ARITY"` returns exactly those three hits; `line` is the imported `registryErrorLine` from tests/helpers/registry-oracle.ts, whose exports (`arrayElementMessage`, `letRhsMessage`, `fnArgMessage`, …) include no pre-bound `generic-arity-mismatch` builder; file is not a gate kin, uncited by docs/reference/coverage-matrix.md or docs/bugs/, and no `it()` is merged/renamed; not a duplicate — PTQ-0638 (fixed)/0861/0880/0951 cite this file only for the `registryMessageOf`/`line` reader and sink harness, none for this literal. One correction to the filing's coverage-drift check: the :1163 `arityArrayTwo` has ZERO readers (`awk 'NR>1167 && /arityArrayTwo/'` is empty — the (f) loop asserts `r.codes` against `[ARITY, LET_MISMATCH]`/`[ARITY]`, and eslint ignores tests/), so that copy is a pasted-and-never-wired redeclaration, which strengthens rather than refutes the triplication; fix is one hoisted file-scope constant read at :802 and :979 and deletion of the dead third copy (triage: claude-fable-5-1)
verdict: questionable — parked by the store: skipped by the fixer in 2 waves (see "## Fix attempts"); rule with accept --note <direction> or reject (store)

## Fix attempts
- qw20260919203448: skipped — [PTQ-0966-assertrowsurfacelive-precondition-pair-duplicated.md] PTQ-0966: Already resolved in current code; both tests use shared invokeArgPreconditions. / PTQ-1031: Imported shared runProductionLoad and LoadOutcome; removed local duplicates and unused imports. All tests and assertions preserved; required gate passed. / PTQ-1035: Reused shared theta and fixture types across all four triaged files. Fixtures, tests and assertions unchanged; required gate passed. / PTQ-1037: Imported shared makeShippedHarness; removed duplicate harness declarations and unused imports. All tests and assertions preserved. Required TypeScript/full-test gate passed: 689 files, 11,586 tests. || [PTQ-1045-pkg-roots-buildpackages-not-migrated-glob-universe.md] PTQ-1045: Reused canonical buildPackages and its root map at all three triaged sites; no tests or assertions removed or changed. / PTQ-1052: Shared packageInput through tests/helpers/fake-file-system.ts across all five identical copies; no tests or assertions removed or changed. / PTQ-1088: Replaced inline teardown with disposeWorkspace; no tests removed. Required gate passed: TypeScript clean, 689 files and 11,586 tests passed. / PTQ-0963: No longer reproduces; every triaged duplicate already uses shared helpers. No edits made. | review unconfirmed: PTQ-0963-tools-load-witness-harness-duplicated.md — shed by the fixer: neither tests/tools-derived-name-shape.test.ts nor tests/tools-entry-closed-grammar.test.ts appears in the working-tree diff; all five duplicated pieces (expectedMessage at :129-140/:112-123, PlantedTheta/theta at :211-218/:181-188, the outcome/workspaceDir/beforeAll/afterAll/observed block at :284-305/:272-293, withCode at :428-430/:469-471) remain in both files, and the triage-noted third copy in tests/uppercase-pi-tool-name-refusal.test.ts is likewise untouched. || [PTQ-0992-b0379-caseinsensitive-guard-cannot-fail.md] PTQ-0992: Removed three tautological assertions and corrected the associated comment; retained every test and all registration/diagnostic assertions. / PTQ-1019: Already resolved in current code: one file-scope constant serves both readers; the unused third copy is absent. / PTQ-1030: Already resolved in current code: the header, H1 title, and asserted constant all say 50. / PTQ-1055: Shared Exp/render/renderAll through tests/helpers/registry-oracle.ts and removed orphaned local wrappers; no tests deleted. Required verification passed: TypeScript and all 11,586 tests across 689 files. | review unconfirmed: PTQ-1019-arity-array-two-literal-triplicated.md — untouched/shed: tests/nested-inline-enum-generic-argument-refusal.test.ts has no working-tree change; all three `line(ARITY, [["<ctor>","array"],["<expected>","1"],["<actual>","2"]])` copies remain at :781-785, :967-971 (rebuilt per loop iteration), and :1163-1167 (the dead never-read third copy). PTQ-1030-h1-title-stale-cell-count.md — untouched/shed: tests/inline-object-wire-name-rename-refusal.test.ts has no working-tree change; the "CONTROL H1" title still says 49 at :1452 while the body asserts NEW_ROW_LIST_CELLS = 50 (:744), and the top-of-file ANTI-VACUITY comment at :170-171 still says 47. ||
- qw20260919212831: skipped — [PTQ-0956-livesignal-redeclared-tool-loop-pair.md] PTQ-0956: No longer reproduces in working files or HEAD; both tests already import shared liveSignal. / PTQ-1019: No longer reproduces in working files or HEAD; one file-scope constant serves both readers, and the dead third copy is absent. / PTQ-1030: No longer reproduces in working files or HEAD; header, H1 title, and asserted count all say 50. / PTQ-1046: Delegated registered to shared registryMessageOf; preserved interpolation guards and every test/assertion. Required gate passed: TypeScript clean, 689 files and 11,586 tests passed. | review unconfirmed: PTQ-0956-livesignal-redeclared-tool-loop-pair.md — no working-tree change attributable; already resolved at HEAD (commit a9656b58): both tests/query-tool-loop.test.ts and tests/query-tool-loop-noncompliance.test.ts import liveSignal from ./helpers/typed-query-harness and carry no local declaration — close as resolved, nothing remains. PTQ-1019-arity-array-two-literal-triplicated.md — no working-tree change attributable; already resolved at HEAD: tests/nested-inline-enum-generic-argument-refusal.test.ts has a single file-scope ARITY_ARRAY_TWO (:189) read at :802 and :974, grep "line(ARITY" returns exactly one declaration, and the dead third copy is deleted — close as resolved. PTQ-1030-h1-title-stale-cell-count.md — no working-tree change attributable; already resolved at HEAD: the CONTROL H1 title (:1428) and the ANTI-VACUITY header comment (:170) both say 50, agreeing with NEW_ROW_LIST_CELLS = 50 (:720) — close as resolved. || [PTQ-1080-b0272-expectcaptured-reimplements-expectdeclared.md] PTQ-1080: Delegated declaration checks to expectDeclared, preserving the statement-count assertion and custom failure message. Required verification command passed: TypeScript clean; 689 test files and 11,586 tests passed. / PTQ-1089: Replaced all three registry-reader pairs with registryLineOf calls, preserving ordered fills and placeholder checks; no tests deleted. / PTQ-1058: Shared all four builders through tests/helpers/registry-oracle.ts and replaced the cited copies; no test cases or assertions deleted. / PTQ-1073: Already uses createParsedPromptHarness with the specified fixture identity; duplication no longer reproduces. Left unchanged. || [PTQ-1076-triagemap-fixture-duplicated-in-file.md] PTQ-1076: Re-verified both copies; consolidated triageMap() in existing tests/helpers/triage-fixture.ts, preserving fresh-map behavior and all tests. Required TypeScript and full test gate passed. / PTQ-1087: Re-verified both tautologies; started parity loops at index 1, preserving all three meaningful comparisons per row and all tests. Required gate passed: TypeScript and 11,586 tests across 689 files. ||
