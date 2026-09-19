---
id: PTQ-0988
title: production-cancellation-wiring.test.ts redeclares promptTheta locally though it already imports its sibling builders from the same helper that exports it
lens: D7
status: intake
verdict: questionable
locations:
  - tests/production-cancellation-wiring.test.ts:56-64
  - tests/production-cancellation-wiring.test.ts:87-93
  - tests/helpers/tool-call-dispatch-harness.ts:289-295
sites: 1
fix_scope: localized
d4_class: clone
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
fix_skips: 2
---

# production-cancellation-wiring.test.ts redeclares promptTheta locally though it already imports its sibling builders from the same helper that exports it

## Observation
`tests/production-cancellation-wiring.test.ts` imports seven AST-node
builders (`callExpr`, `tryExpr`, `identExpr`, `objectExpr`, `strExpr as
stringExpr`, `letStmt`, `statementBody as body`) from
`./helpers/tool-call-dispatch-harness`, then a few lines later declares its
own local `promptTheta` function instead of importing the same-named,
same-signature, exported `promptTheta` from that identical helper module.
The local function's body is byte-identical to the helper's exported one.

## Evidence

`tests/production-cancellation-wiring.test.ts:56-64` (the existing import
from the helper that already exports `promptTheta`):
```ts
import {
  callExpr,
  tryExpr,
  identExpr,
  objectExpr,
  strExpr as stringExpr,
  letStmt,
  statementBody as body,
} from "./helpers/tool-call-dispatch-harness";
```

`tests/production-cancellation-wiring.test.ts:87-93` (the local
redeclaration, immediately below the import block above):
```ts
function promptTheta(thetaBody: ThetaBody, tools?: readonly string[]): ThetaCompositionInput {
  const frontmatter: ParsedFrontmatter = {
    mode: "prompt",
    ...(tools !== undefined ? { tools } : {}),
  };
  return { slashName: "demo", sourcePath: "/theta/demo.theta", frontmatter, body: thetaBody };
}
```

`tests/helpers/tool-call-dispatch-harness.ts:289-295` (the exported
function, re-read immediately before filing — identical parameter list,
identical body, only the `export` keyword and the file it lives in differ):
```ts
export function promptTheta(thetaBody: ThetaBody, tools?: readonly string[]): ThetaCompositionInput {
  const frontmatter: ParsedFrontmatter = {
    mode: "prompt",
    ...(tools !== undefined ? { tools } : {}),
  };
  return { slashName: "demo", sourcePath: "/theta/demo.theta", frontmatter, body: thetaBody };
}
```

Both of `production-cancellation-wiring.test.ts`'s sibling files that share
this exact `promptTheta(thetaBody, tools?)` signature already import it from
the helper instead of redeclaring it: `grep -n "promptTheta" tests/nested-control-in-pure-position.test.ts` shows it listed in that file's import block (line 20) and used at every call site (14 call sites, lines 131–510), and `grep -n "promptTheta" tests/production-core-exec.test.ts` shows the same (imported at line 22, used at 12 call sites). `tests/pure-async-unification.test.ts:129` still carries its own local byte-identical copy, matching the same pattern this finding cites for `production-cancellation-wiring.test.ts` but that file is outside this wave's briefed scope.

## Why this is a problem
This is the "Copy-paste fixtures/doubles" class: a fixture builder
(`promptTheta`) is re-implemented locally in a file that, in the very same
import statement block, already draws six other builders from the one
helper module that exports the identical function under the identical name
and signature. The file's own import list is the proof that nothing about
the module boundary or the dependency shape prevented importing
`promptTheta` alongside its siblings — the local copy is pure duplication of
code already reachable from an import already present.

## Suggested direction (non-binding, optional)
Adding `promptTheta` to the existing `tool-call-dispatch-harness` import in
`production-cancellation-wiring.test.ts` and dropping the local declaration
is the natural fold this file's own import list already points at, mirroring
what `nested-control-in-pure-position.test.ts` and `production-core-exec.test.ts`
already do for the identical function.

## False-positive check
- Gate-pin check: `production-cancellation-wiring.test.ts` does not match
  `*gate*.test.ts` or any named gate kin; the cited lines are a plain
  fixture-value builder, not a pinned count or inventory.
- Recording-double check: `promptTheta` builds a static
  `ThetaCompositionInput` value; it records no calls and backs no
  MUST-NOT witness — the carve-out does not apply.
- docs/bugs/ signature search: `grep -rln "production-cancellation-wiring"
  docs/bugs/*.md` hits `docs/bugs/0012-...md` and
  `docs/bugs/0319-...md`; both cite the file by name as their own witness
  for CANCEL-2/CANCEL-3/CANCEL-4 wiring, neither documents this
  `promptTheta` duplication as a correct-reason red, and this finding
  proposes no merge, rename, or deletion of the file or any of its `it()`
  blocks.
- coverage-matrix citation search: `grep -n "production-cancellation-wiring"
  docs/reference/coverage-matrix.md` returns no hits.
- Duplicate/overlap check: searched `quality/resolved/` and
  `quality/intake/` for prior filings naming `promptTheta` —
  `PTQ-0403-active-invocation-dispatch-scaffolding-duplicated.md` covers a
  *different*, zero-argument `promptTheta()` shared between
  `active-invocation-binder-window.test.ts` and
  `active-invocation-wiring.test.ts` (its own triage note flags a fourth
  `rootWith` copy in `production-cancellation-wiring.test.ts`, but not this
  file's `promptTheta`); `PTQ-0639-03-nested-control-pure-position-harness-duplicated.md`
  covers the `(thetaBody, tools?)`-signature `promptTheta` shared between
  `nested-control-in-pure-position.test.ts` and
  `production-core-exec.test.ts` and is resolved — both of those files now
  import `promptTheta` rather than declaring it, confirming the fix landed
  there and did not touch `production-cancellation-wiring.test.ts`. No prior
  filing names `production-cancellation-wiring.test.ts`'s own `promptTheta`
  copy.
- Coverage-drift check: this finding is about a duplicated fixture-builder
  declaration that exists today alongside a live import of its own sibling
  functions; it makes no claim about any untested path.

## Triage
<!-- appended by triage -->
verdict: confirmed — all three excerpts reproduce verbatim at the cited lines (cancellation-wiring:56-64 import block, :87-93 local decl; tool-call-dispatch-harness.ts:289-295 export) and a mktemp sed-extract + diff shows the two bodies byte-identical modulo `export`; the local copy is live (3 call sites at :107/:135/:271) and the file is 4/4 green; the sibling claim reproduces — nested-control-in-pure-position.test.ts:20 and production-core-exec.test.ts:22 both import `promptTheta` from the same harness, and `grep -rn "function promptTheta" tests/` confirms only pure-async-unification.test.ts:129 carries another `(thetaBody, tools?)` copy (acknowledged in-body; the ~20 other hits are unrelated string-returning live-cell/minimal-slash builders); location in tests/, not a gate test, a plain value builder not a recording double, docs/bugs 0012/0319 name the file only as CANCEL witness with no merge/rename/delete proposed, coverage-matrix 0 hits; not a duplicate — resolved PTQ-0670 covered this file's eight AST builders (now imported; `promptTheta` was outside its inventory), resolved PTQ-0639 covered the nested-control↔core-exec pair whose fix left this file untouched, PTQ-0403 is the zero-arg fixture-dispatch-harness variant and PTQ-0615 the live-cell string variant; fix is a mechanical one-name import addition (triage: claude-fable-5-1)
verdict: questionable — parked by the store: skipped by the fixer in 2 waves (see "## Fix attempts"); rule with accept --note <direction> or reject (store)

## Fix attempts
- qw20260919203448: skipped — [PTQ-0966-assertrowsurfacelive-precondition-pair-duplicated.md] PTQ-0966: Already resolved in current code; both tests use shared invokeArgPreconditions. / PTQ-1031: Imported shared runProductionLoad and LoadOutcome; removed local duplicates and unused imports. All tests and assertions preserved; required gate passed. / PTQ-1035: Reused shared theta and fixture types across all four triaged files. Fixtures, tests and assertions unchanged; required gate passed. / PTQ-1037: Imported shared makeShippedHarness; removed duplicate harness declarations and unused imports. All tests and assertions preserved. Required TypeScript/full-test gate passed: 689 files, 11,586 tests. || [PTQ-1045-pkg-roots-buildpackages-not-migrated-glob-universe.md] PTQ-1045: Reused canonical buildPackages and its root map at all three triaged sites; no tests or assertions removed or changed. / PTQ-1052: Shared packageInput through tests/helpers/fake-file-system.ts across all five identical copies; no tests or assertions removed or changed. / PTQ-1088: Replaced inline teardown with disposeWorkspace; no tests removed. Required gate passed: TypeScript clean, 689 files and 11,586 tests passed. / PTQ-0963: No longer reproduces; every triaged duplicate already uses shared helpers. No edits made. | review unconfirmed: PTQ-0963-tools-load-witness-harness-duplicated.md — shed by the fixer: neither tests/tools-derived-name-shape.test.ts nor tests/tools-entry-closed-grammar.test.ts appears in the working-tree diff; all five duplicated pieces (expectedMessage at :129-140/:112-123, PlantedTheta/theta at :211-218/:181-188, the outcome/workspaceDir/beforeAll/afterAll/observed block at :284-305/:272-293, withCode at :428-430/:469-471) remain in both files, and the triage-noted third copy in tests/uppercase-pi-tool-name-refusal.test.ts is likewise untouched. || [PTQ-0992-b0379-caseinsensitive-guard-cannot-fail.md] PTQ-0992: Removed three tautological assertions and corrected the associated comment; retained every test and all registration/diagnostic assertions. / PTQ-1019: Already resolved in current code: one file-scope constant serves both readers; the unused third copy is absent. / PTQ-1030: Already resolved in current code: the header, H1 title, and asserted constant all say 50. / PTQ-1055: Shared Exp/render/renderAll through tests/helpers/registry-oracle.ts and removed orphaned local wrappers; no tests deleted. Required verification passed: TypeScript and all 11,586 tests across 689 files. | review unconfirmed: PTQ-1019-arity-array-two-literal-triplicated.md — untouched/shed: tests/nested-inline-enum-generic-argument-refusal.test.ts has no working-tree change; all three `line(ARITY, [["<ctor>","array"],["<expected>","1"],["<actual>","2"]])` copies remain at :781-785, :967-971 (rebuilt per loop iteration), and :1163-1167 (the dead never-read third copy). PTQ-1030-h1-title-stale-cell-count.md — untouched/shed: tests/inline-object-wire-name-rename-refusal.test.ts has no working-tree change; the "CONTROL H1" title still says 49 at :1452 while the body asserts NEW_ROW_LIST_CELLS = 50 (:744), and the top-of-file ANTI-VACUITY comment at :170-171 still says 47. ||
- qw20260919212831: skipped — [PTQ-0956-livesignal-redeclared-tool-loop-pair.md] PTQ-0956: No longer reproduces in working files or HEAD; both tests already import shared liveSignal. / PTQ-1019: No longer reproduces in working files or HEAD; one file-scope constant serves both readers, and the dead third copy is absent. / PTQ-1030: No longer reproduces in working files or HEAD; header, H1 title, and asserted count all say 50. / PTQ-1046: Delegated registered to shared registryMessageOf; preserved interpolation guards and every test/assertion. Required gate passed: TypeScript clean, 689 files and 11,586 tests passed. | review unconfirmed: PTQ-0956-livesignal-redeclared-tool-loop-pair.md — no working-tree change attributable; already resolved at HEAD (commit a9656b58): both tests/query-tool-loop.test.ts and tests/query-tool-loop-noncompliance.test.ts import liveSignal from ./helpers/typed-query-harness and carry no local declaration — close as resolved, nothing remains. PTQ-1019-arity-array-two-literal-triplicated.md — no working-tree change attributable; already resolved at HEAD: tests/nested-inline-enum-generic-argument-refusal.test.ts has a single file-scope ARITY_ARRAY_TWO (:189) read at :802 and :974, grep "line(ARITY" returns exactly one declaration, and the dead third copy is deleted — close as resolved. PTQ-1030-h1-title-stale-cell-count.md — no working-tree change attributable; already resolved at HEAD: the CONTROL H1 title (:1428) and the ANTI-VACUITY header comment (:170) both say 50, agreeing with NEW_ROW_LIST_CELLS = 50 (:720) — close as resolved. || [PTQ-1080-b0272-expectcaptured-reimplements-expectdeclared.md] PTQ-1080: Delegated declaration checks to expectDeclared, preserving the statement-count assertion and custom failure message. Required verification command passed: TypeScript clean; 689 test files and 11,586 tests passed. / PTQ-1089: Replaced all three registry-reader pairs with registryLineOf calls, preserving ordered fills and placeholder checks; no tests deleted. / PTQ-1058: Shared all four builders through tests/helpers/registry-oracle.ts and replaced the cited copies; no test cases or assertions deleted. / PTQ-1073: Already uses createParsedPromptHarness with the specified fixture identity; duplication no longer reproduces. Left unchanged. || [PTQ-1076-triagemap-fixture-duplicated-in-file.md] PTQ-1076: Re-verified both copies; consolidated triageMap() in existing tests/helpers/triage-fixture.ts, preserving fresh-map behavior and all tests. Required TypeScript and full test gate passed. / PTQ-1087: Re-verified both tautologies; started parity loops at index 1, preserving all three meaningful comparisons per row and all tests. Required gate passed: TypeScript and 11,586 tests across 689 files. ||
