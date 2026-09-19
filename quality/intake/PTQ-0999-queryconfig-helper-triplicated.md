---
id: PTQ-0999
title: queryConfig() is byte-identical across b0307-empty-template-parity.test.ts, composition-producer.test.ts and effectful-statement-host.test.ts
lens: D7
status: intake
verdict: questionable
locations:
  - tests/b0307-empty-template-parity.test.ts:110-118
  - tests/composition-producer.test.ts:118-126
  - tests/effectful-statement-host.test.ts:191-199
sites: 3
fix_scope: module
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
fix_skips: 2
---

# queryConfig() is byte-identical across b0307-empty-template-parity.test.ts, composition-producer.test.ts and effectful-statement-host.test.ts

## Observation
Three test files each declare a local `function queryConfig(): QueryToolLoopConfig`
that builds the identical five-field object literal
(`maxRounds: 3, querySite: SITE, thetaSlashName: "demo", invocationId: "inv-1",
occurredAt: 0`). A `diff` of the three function bodies (extracted to temp files)
produces no output — the three declarations are byte-for-byte identical, not merely
structurally similar. All three files already import shared scaffolding from
`tests/helpers/invoke-seam-scaffold.ts` (which exports the `SITE` constant these three
`queryConfig()` copies each reference, directly or via a locally re-declared
equivalent).

## Evidence
`tests/b0307-empty-template-parity.test.ts:110-118`:
```ts
function queryConfig(): QueryToolLoopConfig {
  return {
    maxRounds: 3,
    querySite: SITE,
    thetaSlashName: "demo",
    invocationId: "inv-1",
    occurredAt: 0,
  };
}
```

`tests/composition-producer.test.ts:118-126`:
```ts
function queryConfig(): QueryToolLoopConfig {
  return {
    maxRounds: 3,
    querySite: SITE,
    thetaSlashName: "demo",
    invocationId: "inv-1",
    occurredAt: 0,
  };
}
```

`tests/effectful-statement-host.test.ts:191-199`:
```ts
function queryConfig(): QueryToolLoopConfig {
  return {
    maxRounds: 3,
    querySite: SITE,
    thetaSlashName: "demo",
    invocationId: "inv-1",
    occurredAt: 0,
  };
}
```

`diff` of the three extracted bodies (`sed -n` ranges above) returns no lines in either
direction — confirmed identical. A fourth same-named function,
`tests/b0316-match-scrutinee-inline-composite-ok-wrapped.test.ts:258-266`, was checked
and differs in two fields (`querySite: EFFECT_SITE`, `thetaSlashName: "b0316"`), so it
is excluded from this count; `sites: 3` covers only the three verified identical
copies.

## Why this is a problem
The exact search `function queryConfig\(\): QueryToolLoopConfig` over `tests/*.test.ts`
returns four hits; three of the four resolve to a byte-identical six-line function
body with the same field values, imported alongside other names already pulled from
`tests/helpers/invoke-seam-scaffold.ts` (which already centralises the sibling `SITE`
constant one of the three copies consumes directly). Because the values themselves
carry no per-file variation, the exact-match count is not an artefact of a
type-enforced shape with differing fixture data (contrast the human-rejected
`config(maxRounds, ...)` filing, where five of six sites varied 2-5 of 5 field values)
— here every field is identical across all three sites.

## Suggested direction (non-binding, optional)
`tests/helpers/invoke-seam-scaffold.ts` already exports `SITE` for this same family of
`executeBody`-driving witness files; naming it as the module that could carry a shared
`queryConfig()` beside `SITE` is an observation about where the identical bodies
already congregate, not a design for the fix.

## False-positive check
- Gate-pin check: none of the three files match `*gate*.test.ts` or kin; not a
  census/pin gate.
- Recording-double check: `queryConfig()` returns a plain data literal, not a double
  that records calls; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rn "queryConfig" docs/bugs/` → 0 hits; no
  documented correct-reason red cites this helper by name.
- coverage-matrix/bug-doc citation search: `grep -n "queryConfig"
  docs/reference/coverage-matrix.md` → 0 hits. `grep -n
  "tests/b0307-empty-template-parity.test.ts" docs/bugs/0307-*.md` → 2 hits (witness
  list), but this finding proposes no merge, rename or deletion of any of the three
  test files — only a possible shared home for one repeated internal helper — so the
  citation does not bar it.
- Prior-rejection check: the wave's human-reject log rejects a filing about
  `config(maxRounds: number)` (a different, parameterised function name) on the
  grounds that its six sites vary 2-5 of 5 field values; verified here that the
  present three `queryConfig()` sites vary 0 of 5 field values, so that rejection's
  reasoning does not transfer.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — all three excerpts reproduce verbatim at the cited lines and a mktemp `diff` of the three `sed` ranges is empty both ways (rc=0); `grep -rn "function queryConfig" tests/ src/ extensions/ tools/` → exactly 4 hits with the b0316 copy correctly excluded (differs in `querySite: EFFECT_SITE` / `thetaSlashName: "b0316"`); every copy is live with one `config: queryConfig()` caller (:149 / :235 / :232) and 0 of 5 fields vary across the three, so unlike the false-positive `config(maxRounds)` precedent (2–5/5 varied) this is a byte-identical copy-paste fixture with a mechanical dedupe (the two local `SITE` redeclarations are also value-identical to `invoke-seam-scaffold.ts:202`'s export); docs/bugs + coverage-matrix `queryConfig` → 0 reproduce, no gate/recording-double/witness-list carve-out applies, all 3 files green (18/18); distinct from resolved PTQ-0529/0545/0594 (AST harness, no-op checkpoint/sink/mutator in these same files — none names `queryConfig`) and from sibling intake d7-01 (`NOOP_SINK`); minor: the candidate calls the `config()` precedent "human-rejected" but it was a triage false-positive (triage: claude-fable-5-1)
verdict: questionable — parked by the store: skipped by the fixer in 2 waves (see "## Fix attempts"); rule with accept --note <direction> or reject (store)

## Fix attempts
- qw20260919203448: skipped — [PTQ-0966-assertrowsurfacelive-precondition-pair-duplicated.md] PTQ-0966: Already resolved in current code; both tests use shared invokeArgPreconditions. / PTQ-1031: Imported shared runProductionLoad and LoadOutcome; removed local duplicates and unused imports. All tests and assertions preserved; required gate passed. / PTQ-1035: Reused shared theta and fixture types across all four triaged files. Fixtures, tests and assertions unchanged; required gate passed. / PTQ-1037: Imported shared makeShippedHarness; removed duplicate harness declarations and unused imports. All tests and assertions preserved. Required TypeScript/full-test gate passed: 689 files, 11,586 tests. || [PTQ-1045-pkg-roots-buildpackages-not-migrated-glob-universe.md] PTQ-1045: Reused canonical buildPackages and its root map at all three triaged sites; no tests or assertions removed or changed. / PTQ-1052: Shared packageInput through tests/helpers/fake-file-system.ts across all five identical copies; no tests or assertions removed or changed. / PTQ-1088: Replaced inline teardown with disposeWorkspace; no tests removed. Required gate passed: TypeScript clean, 689 files and 11,586 tests passed. / PTQ-0963: No longer reproduces; every triaged duplicate already uses shared helpers. No edits made. | review unconfirmed: PTQ-0963-tools-load-witness-harness-duplicated.md — shed by the fixer: neither tests/tools-derived-name-shape.test.ts nor tests/tools-entry-closed-grammar.test.ts appears in the working-tree diff; all five duplicated pieces (expectedMessage at :129-140/:112-123, PlantedTheta/theta at :211-218/:181-188, the outcome/workspaceDir/beforeAll/afterAll/observed block at :284-305/:272-293, withCode at :428-430/:469-471) remain in both files, and the triage-noted third copy in tests/uppercase-pi-tool-name-refusal.test.ts is likewise untouched. || [PTQ-0992-b0379-caseinsensitive-guard-cannot-fail.md] PTQ-0992: Removed three tautological assertions and corrected the associated comment; retained every test and all registration/diagnostic assertions. / PTQ-1019: Already resolved in current code: one file-scope constant serves both readers; the unused third copy is absent. / PTQ-1030: Already resolved in current code: the header, H1 title, and asserted constant all say 50. / PTQ-1055: Shared Exp/render/renderAll through tests/helpers/registry-oracle.ts and removed orphaned local wrappers; no tests deleted. Required verification passed: TypeScript and all 11,586 tests across 689 files. | review unconfirmed: PTQ-1019-arity-array-two-literal-triplicated.md — untouched/shed: tests/nested-inline-enum-generic-argument-refusal.test.ts has no working-tree change; all three `line(ARITY, [["<ctor>","array"],["<expected>","1"],["<actual>","2"]])` copies remain at :781-785, :967-971 (rebuilt per loop iteration), and :1163-1167 (the dead never-read third copy). PTQ-1030-h1-title-stale-cell-count.md — untouched/shed: tests/inline-object-wire-name-rename-refusal.test.ts has no working-tree change; the "CONTROL H1" title still says 49 at :1452 while the body asserts NEW_ROW_LIST_CELLS = 50 (:744), and the top-of-file ANTI-VACUITY comment at :170-171 still says 47. ||
- qw20260919212831: skipped — [PTQ-0956-livesignal-redeclared-tool-loop-pair.md] PTQ-0956: No longer reproduces in working files or HEAD; both tests already import shared liveSignal. / PTQ-1019: No longer reproduces in working files or HEAD; one file-scope constant serves both readers, and the dead third copy is absent. / PTQ-1030: No longer reproduces in working files or HEAD; header, H1 title, and asserted count all say 50. / PTQ-1046: Delegated registered to shared registryMessageOf; preserved interpolation guards and every test/assertion. Required gate passed: TypeScript clean, 689 files and 11,586 tests passed. | review unconfirmed: PTQ-0956-livesignal-redeclared-tool-loop-pair.md — no working-tree change attributable; already resolved at HEAD (commit a9656b58): both tests/query-tool-loop.test.ts and tests/query-tool-loop-noncompliance.test.ts import liveSignal from ./helpers/typed-query-harness and carry no local declaration — close as resolved, nothing remains. PTQ-1019-arity-array-two-literal-triplicated.md — no working-tree change attributable; already resolved at HEAD: tests/nested-inline-enum-generic-argument-refusal.test.ts has a single file-scope ARITY_ARRAY_TWO (:189) read at :802 and :974, grep "line(ARITY" returns exactly one declaration, and the dead third copy is deleted — close as resolved. PTQ-1030-h1-title-stale-cell-count.md — no working-tree change attributable; already resolved at HEAD: the CONTROL H1 title (:1428) and the ANTI-VACUITY header comment (:170) both say 50, agreeing with NEW_ROW_LIST_CELLS = 50 (:720) — close as resolved. || [PTQ-1080-b0272-expectcaptured-reimplements-expectdeclared.md] PTQ-1080: Delegated declaration checks to expectDeclared, preserving the statement-count assertion and custom failure message. Required verification command passed: TypeScript clean; 689 test files and 11,586 tests passed. / PTQ-1089: Replaced all three registry-reader pairs with registryLineOf calls, preserving ordered fills and placeholder checks; no tests deleted. / PTQ-1058: Shared all four builders through tests/helpers/registry-oracle.ts and replaced the cited copies; no test cases or assertions deleted. / PTQ-1073: Already uses createParsedPromptHarness with the specified fixture identity; duplication no longer reproduces. Left unchanged. || [PTQ-1076-triagemap-fixture-duplicated-in-file.md] PTQ-1076: Re-verified both copies; consolidated triageMap() in existing tests/helpers/triage-fixture.ts, preserving fresh-map behavior and all tests. Required TypeScript and full test gate passed. / PTQ-1087: Re-verified both tautologies; started parity loops at index 1, preserving all three meaningful comparisons per row and all tests. Required gate passed: TypeScript and 11,586 tests across 689 files. ||
