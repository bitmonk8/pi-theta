---
id: PTQ-0985
title: b0307-empty-template-parity.test.ts reimplements SEAM_NOOP_SINK as a local NOOP_SINK instead of importing it
lens: D7
status: intake
verdict: questionable
locations:
  - tests/b0307-empty-template-parity.test.ts:2-12
  - tests/b0307-empty-template-parity.test.ts:105-108
  - tests/helpers/invoke-seam-scaffold.ts:46-49
sites: 1
fix_scope: localized
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
fix_skips: 2
---

# b0307-empty-template-parity.test.ts reimplements SEAM_NOOP_SINK as a local NOOP_SINK instead of importing it

## Observation
`tests/b0307-empty-template-parity.test.ts` imports `SEAM_NOOP_CHECKPOINT` (aliased
`NOOP_CHECKPOINT`), `SITE`, `body`, `identExpr`, `letStmt`, `matchExpr`, `queryExpr` and
`realEnv` from `./helpers/invoke-seam-scaffold` (lines 2-12), but does not import that
same module's `SEAM_NOOP_SINK`. Instead it declares a local `const NOOP_SINK` (lines
105-108) whose object literal is byte-identical to the helper's exported
`SEAM_NOOP_SINK` (`tests/helpers/invoke-seam-scaffold.ts:47-49`).

## Evidence
`tests/b0307-empty-template-parity.test.ts:2-12` (the import already reaching into the
module that also exports `SEAM_NOOP_SINK`):
```ts
import {
  RecordingMutator,
  SEAM_NOOP_CHECKPOINT as NOOP_CHECKPOINT,
  SITE,
  body,
  identExpr,
  letStmt,
  matchExpr,
  queryExpr,
  realEnv,
} from "./helpers/invoke-seam-scaffold";
```

`tests/b0307-empty-template-parity.test.ts:105-108` (the locally reimplemented fixture):
```ts
const NOOP_SINK: ToolLoweringSink = {
  diagnostic(): void {},
  systemNote(): void {},
};
```

`tests/helpers/invoke-seam-scaffold.ts:46-49` (the canonical export, same shape, same
two no-op methods):
```ts
/** A `ToolLoweringSink` that discards every diagnostic/system-note. */
export const SEAM_NOOP_SINK: ToolLoweringSink = {
  diagnostic(): void {},
  systemNote(): void {},
};
```

Other files that import `SEAM_NOOP_SINK` directly from the same module rather than
retyping it (confirmed by `grep -rn "SEAM_NOOP_SINK" tests/`, 12 hits total):
`tests/b0294-callee-propagated-invoke-infra-wrapped-unit.test.ts:67`,
`tests/b0295-child-internal-cancel-wrap-arm.test.ts:103`,
`tests/b0347-subagent-leg-propagated-mintable-wrapped-unit.test.ts:98`,
`tests/b0349-codecall-child-internal-cancel-wrap-arm.test.ts:118`,
`tests/composition-producer.test.ts:4`, `tests/effectful-statement-host.test.ts:4`,
`tests/inbound-boundary-binder-args.test.ts:4`,
`tests/params-default-enum-access-merge.test.ts:3`.

## Why this is a problem
`tests/helpers/invoke-seam-scaffold.ts`'s own header states its purpose: centralising
seam scaffolding — including this exact `ToolLoweringSink` no-op — that would otherwise
be "byte-for-byte identical across several `executeBody`-driving invoke/code-call
bug-witness files." `b0307-empty-template-parity.test.ts` already imports a sibling
constant (`SEAM_NOOP_CHECKPOINT`) from that same module in the same import statement,
so the module is already open in this file; the `ToolLoweringSink` no-op is retyped
beside it rather than imported, reproducing exactly the byte-for-byte duplication the
helper module exists to prevent.

## Suggested direction (non-binding, optional)
Importing `SEAM_NOOP_SINK` alongside the other names already pulled from
`./helpers/invoke-seam-scaffold` removes the local retyping; this is an observation
about the helper already present in the same import line, not a design for the fix.

## False-positive check
- Gate-pin check: file name does not match `*gate*.test.ts` or kin; not a census/pin
  gate, does not apply.
- Recording-double check: `NOOP_SINK` records nothing (both methods discard their
  argument); it is not a negative witness, so the recording-double carve-out does not
  apply.
- docs/bugs/ signature search: `grep -rn "NOOP_SINK" docs/bugs/` → 0 hits; no documented
  correct-reason red cites this symbol.
- coverage-matrix/bug-doc citation search: `grep -n "b0307-empty-template-parity"
  docs/reference/coverage-matrix.md` → 0 hits. `grep -n
  "tests/b0307-empty-template-parity.test.ts" docs/bugs/0307-*.md` → 2 hits (the file is
  named in the bug's witness list), but this finding does not propose merging, renaming
  or deleting the test — only importing one already-open helper export in place of a
  retyped local constant — so the citation does not bar it.
- Coverage drift check: this finding does not claim any behaviour is untested; it is
  about a duplicated fixture literal inside an existing test.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all three excerpts reproduce verbatim at the cited lines (b0307:2-12 imports SEAM_NOOP_CHECKPOINT/RecordingMutator/SITE/… from invoke-seam-scaffold; b0307:105-108 `const NOOP_SINK: ToolLoweringSink`; scaffold :46-49 `export const SEAM_NOOP_SINK`), a mktemp sed-extract diff of the two method bodies is empty, the local is live (`sink: NOOP_SINK` :131) and the file is green (2/2); stated searches reproduce (docs/bugs NOOP_SINK → 0; coverage-matrix → 0; bug 0307 doc cites the file at :186/:197 but no merge/rename/delete is proposed; `SEAM_NOOP_SINK` in tests/ has grown to 18 hits / 10 files, drift upward only); not a *gate* file, no recording behaviour, D7 copy-paste-fixture class under tests/ with the helper module already open in the same import statement. Not a duplicate: PTQ-0529 (resolved) inventoried nine b0307 helpers and never named a sink (grep -i sink → 0); PTQ-0844 lists b0307:1 only as the RecordingMutator contrast example and targets b0316's copies; PTQ-0822/0895/0898/0937 track the same shape on disjoint files (tool-calls-off-surface-live-wiring, params-default-unresolvable-enum-variant, b0399, inbound-union-arm-dispatch); same-wave sibling d7-02-queryconfig covers `queryConfig()` not the sink. Fix is a mechanical one-name import (triage: claude-fable-5-1)
verdict: questionable — parked by the store: skipped by the fixer in 2 waves (see "## Fix attempts"); rule with accept --note <direction> or reject (store)

## Fix attempts
- qw20260919203448: skipped — [PTQ-0966-assertrowsurfacelive-precondition-pair-duplicated.md] PTQ-0966: Already resolved in current code; both tests use shared invokeArgPreconditions. / PTQ-1031: Imported shared runProductionLoad and LoadOutcome; removed local duplicates and unused imports. All tests and assertions preserved; required gate passed. / PTQ-1035: Reused shared theta and fixture types across all four triaged files. Fixtures, tests and assertions unchanged; required gate passed. / PTQ-1037: Imported shared makeShippedHarness; removed duplicate harness declarations and unused imports. All tests and assertions preserved. Required TypeScript/full-test gate passed: 689 files, 11,586 tests. || [PTQ-1045-pkg-roots-buildpackages-not-migrated-glob-universe.md] PTQ-1045: Reused canonical buildPackages and its root map at all three triaged sites; no tests or assertions removed or changed. / PTQ-1052: Shared packageInput through tests/helpers/fake-file-system.ts across all five identical copies; no tests or assertions removed or changed. / PTQ-1088: Replaced inline teardown with disposeWorkspace; no tests removed. Required gate passed: TypeScript clean, 689 files and 11,586 tests passed. / PTQ-0963: No longer reproduces; every triaged duplicate already uses shared helpers. No edits made. | review unconfirmed: PTQ-0963-tools-load-witness-harness-duplicated.md — shed by the fixer: neither tests/tools-derived-name-shape.test.ts nor tests/tools-entry-closed-grammar.test.ts appears in the working-tree diff; all five duplicated pieces (expectedMessage at :129-140/:112-123, PlantedTheta/theta at :211-218/:181-188, the outcome/workspaceDir/beforeAll/afterAll/observed block at :284-305/:272-293, withCode at :428-430/:469-471) remain in both files, and the triage-noted third copy in tests/uppercase-pi-tool-name-refusal.test.ts is likewise untouched. || [PTQ-0992-b0379-caseinsensitive-guard-cannot-fail.md] PTQ-0992: Removed three tautological assertions and corrected the associated comment; retained every test and all registration/diagnostic assertions. / PTQ-1019: Already resolved in current code: one file-scope constant serves both readers; the unused third copy is absent. / PTQ-1030: Already resolved in current code: the header, H1 title, and asserted constant all say 50. / PTQ-1055: Shared Exp/render/renderAll through tests/helpers/registry-oracle.ts and removed orphaned local wrappers; no tests deleted. Required verification passed: TypeScript and all 11,586 tests across 689 files. | review unconfirmed: PTQ-1019-arity-array-two-literal-triplicated.md — untouched/shed: tests/nested-inline-enum-generic-argument-refusal.test.ts has no working-tree change; all three `line(ARITY, [["<ctor>","array"],["<expected>","1"],["<actual>","2"]])` copies remain at :781-785, :967-971 (rebuilt per loop iteration), and :1163-1167 (the dead never-read third copy). PTQ-1030-h1-title-stale-cell-count.md — untouched/shed: tests/inline-object-wire-name-rename-refusal.test.ts has no working-tree change; the "CONTROL H1" title still says 49 at :1452 while the body asserts NEW_ROW_LIST_CELLS = 50 (:744), and the top-of-file ANTI-VACUITY comment at :170-171 still says 47. ||
- qw20260919212831: skipped — [PTQ-0956-livesignal-redeclared-tool-loop-pair.md] PTQ-0956: No longer reproduces in working files or HEAD; both tests already import shared liveSignal. / PTQ-1019: No longer reproduces in working files or HEAD; one file-scope constant serves both readers, and the dead third copy is absent. / PTQ-1030: No longer reproduces in working files or HEAD; header, H1 title, and asserted count all say 50. / PTQ-1046: Delegated registered to shared registryMessageOf; preserved interpolation guards and every test/assertion. Required gate passed: TypeScript clean, 689 files and 11,586 tests passed. | review unconfirmed: PTQ-0956-livesignal-redeclared-tool-loop-pair.md — no working-tree change attributable; already resolved at HEAD (commit a9656b58): both tests/query-tool-loop.test.ts and tests/query-tool-loop-noncompliance.test.ts import liveSignal from ./helpers/typed-query-harness and carry no local declaration — close as resolved, nothing remains. PTQ-1019-arity-array-two-literal-triplicated.md — no working-tree change attributable; already resolved at HEAD: tests/nested-inline-enum-generic-argument-refusal.test.ts has a single file-scope ARITY_ARRAY_TWO (:189) read at :802 and :974, grep "line(ARITY" returns exactly one declaration, and the dead third copy is deleted — close as resolved. PTQ-1030-h1-title-stale-cell-count.md — no working-tree change attributable; already resolved at HEAD: the CONTROL H1 title (:1428) and the ANTI-VACUITY header comment (:170) both say 50, agreeing with NEW_ROW_LIST_CELLS = 50 (:720) — close as resolved. || [PTQ-1080-b0272-expectcaptured-reimplements-expectdeclared.md] PTQ-1080: Delegated declaration checks to expectDeclared, preserving the statement-count assertion and custom failure message. Required verification command passed: TypeScript clean; 689 test files and 11,586 tests passed. / PTQ-1089: Replaced all three registry-reader pairs with registryLineOf calls, preserving ordered fills and placeholder checks; no tests deleted. / PTQ-1058: Shared all four builders through tests/helpers/registry-oracle.ts and replaced the cited copies; no test cases or assertions deleted. / PTQ-1073: Already uses createParsedPromptHarness with the specified fixture identity; duplication no longer reproduces. Left unchanged. || [PTQ-1076-triagemap-fixture-duplicated-in-file.md] PTQ-1076: Re-verified both copies; consolidated triageMap() in existing tests/helpers/triage-fixture.ts, preserving fresh-map behavior and all tests. Required TypeScript and full test gate passed. / PTQ-1087: Re-verified both tautologies; started parity loops at index 1, preserving all three meaningful comparisons per row and all tests. Required gate passed: TypeScript and 11,586 tests across 689 files. ||
