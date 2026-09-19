---
id: PTQ-0955
title: b0308's InertCheckpoint class re-implements the canonical SEAM_NOOP_CHECKPOINT constant
lens: D7
status: intake
verdict: questionable
locations:
  - tests/b0308-snk-h-null-last-tool.test.ts:136-141
  - tests/helpers/invoke-seam-scaffold.ts:36-42
sites: 1
fix_scope: localized
wave: qw20260918131151
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
fix_skips: 2
---

# b0308's InertCheckpoint class re-implements the canonical SEAM_NOOP_CHECKPOINT constant

## Observation
`tests/b0308-snk-h-null-last-tool.test.ts` declares a local `InertCheckpoint` class implementing the `Checkpoint` seam interface with a `before()` method that immediately resolves. `tests/helpers/invoke-seam-scaffold.ts` already exports `SEAM_NOOP_CHECKPOINT`, a `Checkpoint`-typed constant whose `before()` method does exactly the same thing (immediately resolves, ignoring its arguments). The scaffold file's own header states its purpose is to centralise this exact no-op triple because it was found byte-for-byte identical across several `executeBody`-driving bug-witness files. `SEAM_NOOP_CHECKPOINT` is already imported and used by 31 call sites across `tests/*.ts`, including `tests/helpers/par-for-harness.ts`, which is itself imported by three of the other files in this same review scope (b0324, b0325, b0326).

## Evidence
`tests/b0308-snk-h-null-last-tool.test.ts:136-141`:
```ts
/** A no-op `Checkpoint` — cell (C) does not assert on the checkpoint stream. */
class InertCheckpoint implements Checkpoint {
  before(_kind: CheckpointKind, _site: CheckpointSite): Promise<void> {
    return Promise.resolve();
  }
}
```

`tests/helpers/invoke-seam-scaffold.ts:36-42`:
```ts
/** A `Checkpoint` whose `before()` resolves immediately — the seam is not
 *  itself under test at the call sites that use this scaffold. */
export const SEAM_NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};
```

Both implement the identical `Checkpoint` interface (`src/seams/checkpoint.ts:21-24`, `before(kind: CheckpointKind, site: CheckpointSite): Promise<void>`) with the identical behaviour: ignore both arguments, return an immediately-resolved promise. `grep -rn "SEAM_NOOP_CHECKPOINT" tests/*.ts` returns 31 hits across the test suite; `grep -rn "InertCheckpoint" tests/*.ts` returns hits only inside this one file (its declaration and its single use at `:150`, `new InertCheckpoint()`, in cell (C)'s `runUntypedQueryLoop` call).

## Why this is a problem
The scaffold module's own stated purpose (`tests/helpers/invoke-seam-scaffold.ts:5-13`) is to hold exactly this no-op seam shape so that "a file that needs them can import rather than retype them." `InertCheckpoint` is a second, locally-typed re-implementation of the same no-op `Checkpoint` the scaffold already exports and that the review-scope siblings (via `par-for-harness.ts`) already import.

## Suggested direction (non-binding, optional)
`tests/b0308-snk-h-null-last-tool.test.ts` could import `SEAM_NOOP_CHECKPOINT` from `tests/helpers/invoke-seam-scaffold.ts` in place of declaring and instantiating `InertCheckpoint`.

## False-positive check
- Recording-double carve-out: `InertCheckpoint` records nothing and is never asserted against — it is a pure no-op stand-in, not a MUST-NOT witness. Carve-out does not apply.
- Gate-pin carve-out: file name does not match `*gate*.test.ts` or any named gate kin; not applicable.
- docs/bugs/ signature search: `grep -n "InertCheckpoint" docs/bugs/0308-snk-h-fabricates-last-tool-respond-on-reachable-null.md` — 0 hits; the class is not cited as a documented correct-reason-red witness shape.
- coverage-matrix/bug-doc citation search: `grep -n "InertCheckpoint" docs/reference/coverage-matrix.md` — 0 hits. This finding does not propose renaming, merging, or deleting a cited test — it proposes replacing a local double with an import, leaving the test's behaviour and name unchanged.
- Coverage drift check: this finding does not claim any path is untested; it is about an existing double's re-implementation, not about missing coverage.

## Triage
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/b0308-snk-h-null-last-tool.test.ts:136-141 and tests/helpers/invoke-seam-scaffold.ts:36-42, both satisfy the same `Checkpoint.before(kind, site): Promise<void>` contract (src/seams/checkpoint.ts:21-24) with byte-equivalent behaviour (ignore args, `Promise.resolve()`); `grep -rn SEAM_NOOP_CHECKPOINT tests/*.ts` = 31 hits reproduces and `InertCheckpoint` appears nowhere in src/, extensions/, tools/ or any other test — only its declaration at :137 and its single use (at :175, not the :150 the filing states — non-refuting drift, content matches) as the `checkpoint` argument to `runUntypedQueryLoop(checkpoint: Checkpoint, …)`, so the swap is a mechanical import with no behaviour change; the scaffold constant is already consumed outside `executeBody` drivers (tests/helpers/par-for-harness.ts:16,106, imported by in-scope b0324/b0325/b0326), so the header's stated purpose covers this use; docs/bugs/0308 cites the file by cell letters only and coverage-matrix → 0 hits for `InertCheckpoint`, no gate/recording-double/failLoudly carve-out touched, file passes at HEAD (4/4); dedupe: the only store entries touching this file are PTQ-0775 (tests/live b0308 sibling, `driveOnce`) and resolved PTQ-0714 (this file's `FakePi`), and none of the 11 open SEAM_NOOP_CHECKPOINT issues cite b0308 — D7 copy-paste-double in tests/ only (triage: claude-fable-5-1)
verdict: questionable — parked by the store: skipped by the fixer in 2 waves (see "## Fix attempts"); rule with accept --note <direction> or reject (store)

## Fix attempts
- qw20260919203448: skipped — [PTQ-0966-assertrowsurfacelive-precondition-pair-duplicated.md] PTQ-0966: Already resolved in current code; both tests use shared invokeArgPreconditions. / PTQ-1031: Imported shared runProductionLoad and LoadOutcome; removed local duplicates and unused imports. All tests and assertions preserved; required gate passed. / PTQ-1035: Reused shared theta and fixture types across all four triaged files. Fixtures, tests and assertions unchanged; required gate passed. / PTQ-1037: Imported shared makeShippedHarness; removed duplicate harness declarations and unused imports. All tests and assertions preserved. Required TypeScript/full-test gate passed: 689 files, 11,586 tests. || [PTQ-1045-pkg-roots-buildpackages-not-migrated-glob-universe.md] PTQ-1045: Reused canonical buildPackages and its root map at all three triaged sites; no tests or assertions removed or changed. / PTQ-1052: Shared packageInput through tests/helpers/fake-file-system.ts across all five identical copies; no tests or assertions removed or changed. / PTQ-1088: Replaced inline teardown with disposeWorkspace; no tests removed. Required gate passed: TypeScript clean, 689 files and 11,586 tests passed. / PTQ-0963: No longer reproduces; every triaged duplicate already uses shared helpers. No edits made. | review unconfirmed: PTQ-0963-tools-load-witness-harness-duplicated.md — shed by the fixer: neither tests/tools-derived-name-shape.test.ts nor tests/tools-entry-closed-grammar.test.ts appears in the working-tree diff; all five duplicated pieces (expectedMessage at :129-140/:112-123, PlantedTheta/theta at :211-218/:181-188, the outcome/workspaceDir/beforeAll/afterAll/observed block at :284-305/:272-293, withCode at :428-430/:469-471) remain in both files, and the triage-noted third copy in tests/uppercase-pi-tool-name-refusal.test.ts is likewise untouched. || [PTQ-0992-b0379-caseinsensitive-guard-cannot-fail.md] PTQ-0992: Removed three tautological assertions and corrected the associated comment; retained every test and all registration/diagnostic assertions. / PTQ-1019: Already resolved in current code: one file-scope constant serves both readers; the unused third copy is absent. / PTQ-1030: Already resolved in current code: the header, H1 title, and asserted constant all say 50. / PTQ-1055: Shared Exp/render/renderAll through tests/helpers/registry-oracle.ts and removed orphaned local wrappers; no tests deleted. Required verification passed: TypeScript and all 11,586 tests across 689 files. | review unconfirmed: PTQ-1019-arity-array-two-literal-triplicated.md — untouched/shed: tests/nested-inline-enum-generic-argument-refusal.test.ts has no working-tree change; all three `line(ARITY, [["<ctor>","array"],["<expected>","1"],["<actual>","2"]])` copies remain at :781-785, :967-971 (rebuilt per loop iteration), and :1163-1167 (the dead never-read third copy). PTQ-1030-h1-title-stale-cell-count.md — untouched/shed: tests/inline-object-wire-name-rename-refusal.test.ts has no working-tree change; the "CONTROL H1" title still says 49 at :1452 while the body asserts NEW_ROW_LIST_CELLS = 50 (:744), and the top-of-file ANTI-VACUITY comment at :170-171 still says 47. ||
- qw20260919212831: skipped — [PTQ-0956-livesignal-redeclared-tool-loop-pair.md] PTQ-0956: No longer reproduces in working files or HEAD; both tests already import shared liveSignal. / PTQ-1019: No longer reproduces in working files or HEAD; one file-scope constant serves both readers, and the dead third copy is absent. / PTQ-1030: No longer reproduces in working files or HEAD; header, H1 title, and asserted count all say 50. / PTQ-1046: Delegated registered to shared registryMessageOf; preserved interpolation guards and every test/assertion. Required gate passed: TypeScript clean, 689 files and 11,586 tests passed. | review unconfirmed: PTQ-0956-livesignal-redeclared-tool-loop-pair.md — no working-tree change attributable; already resolved at HEAD (commit a9656b58): both tests/query-tool-loop.test.ts and tests/query-tool-loop-noncompliance.test.ts import liveSignal from ./helpers/typed-query-harness and carry no local declaration — close as resolved, nothing remains. PTQ-1019-arity-array-two-literal-triplicated.md — no working-tree change attributable; already resolved at HEAD: tests/nested-inline-enum-generic-argument-refusal.test.ts has a single file-scope ARITY_ARRAY_TWO (:189) read at :802 and :974, grep "line(ARITY" returns exactly one declaration, and the dead third copy is deleted — close as resolved. PTQ-1030-h1-title-stale-cell-count.md — no working-tree change attributable; already resolved at HEAD: the CONTROL H1 title (:1428) and the ANTI-VACUITY header comment (:170) both say 50, agreeing with NEW_ROW_LIST_CELLS = 50 (:720) — close as resolved. || [PTQ-1080-b0272-expectcaptured-reimplements-expectdeclared.md] PTQ-1080: Delegated declaration checks to expectDeclared, preserving the statement-count assertion and custom failure message. Required verification command passed: TypeScript clean; 689 test files and 11,586 tests passed. / PTQ-1089: Replaced all three registry-reader pairs with registryLineOf calls, preserving ordered fills and placeholder checks; no tests deleted. / PTQ-1058: Shared all four builders through tests/helpers/registry-oracle.ts and replaced the cited copies; no test cases or assertions deleted. / PTQ-1073: Already uses createParsedPromptHarness with the specified fixture identity; duplication no longer reproduces. Left unchanged. || [PTQ-1076-triagemap-fixture-duplicated-in-file.md] PTQ-1076: Re-verified both copies; consolidated triageMap() in existing tests/helpers/triage-fixture.ts, preserving fresh-map behavior and all tests. Required TypeScript and full test gate passed. / PTQ-1087: Re-verified both tautologies; started parity loops at index 1, preserving all three meaningful comparisons per row and all tests. Required gate passed: TypeScript and 11,586 tests across 689 files. ||
