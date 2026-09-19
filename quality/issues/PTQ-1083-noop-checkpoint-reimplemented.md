---
id: PTQ-1083
title: capitalised-bare-match-pattern-refusal.test.ts reimplements the canonical SEAM_NOOP_CHECKPOINT double locally
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/capitalised-bare-match-pattern-refusal.test.ts:226-230
  - tests/helpers/invoke-seam-scaffold.ts:47-52
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918220713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
fix_skips: 1
---

# capitalised-bare-match-pattern-refusal.test.ts reimplements the canonical SEAM_NOOP_CHECKPOINT double locally

## Observation
`tests/helpers/invoke-seam-scaffold.ts` exports `SEAM_NOOP_CHECKPOINT`, a `Checkpoint` whose `before()` resolves immediately, documented as the shared no-op checkpoint for callers whose driven cell does not itself exercise the checkpoint seam. `tests/capitalised-bare-match-pattern-refusal.test.ts` declares its own module-scope `const NOOP_CHECKPOINT: Checkpoint`, with a byte-identical `before()` body, and feeds it into its own local `rootDouble()` in exactly the role the canonical export already fills. The file imports neither `invoke-seam-scaffold.ts` nor any of the ten-plus helper modules (`tool-call-dispatch-harness.ts`, `prompt-value-harness.ts`, `runtime-belt-probe-harness.ts`, `par-for-harness.ts`, `thetalib-load-harness.ts`, `typed-query-harness.ts`, `scripted-typed-query-harness.ts`, `subagent-fn-child-regime.ts`) that already re-export or consume `SEAM_NOOP_CHECKPOINT` for this exact purpose.

## Evidence

`tests/capitalised-bare-match-pattern-refusal.test.ts:226-237` (re-read immediately before filing):
```ts
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
  } as unknown as RuntimeRoot;
}
```

`tests/helpers/invoke-seam-scaffold.ts:47-52` — the canonical export, byte-identical `before()` body:
```ts
/** A `Checkpoint` whose `before()` resolves immediately — the seam is not
 *  itself under test at the call sites that use this scaffold. */
export const SEAM_NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};
```

Exact search: `grep -n "SEAM_NOOP_CHECKPOINT" tests/helpers/*.ts` shows the export plus re-exports/consumers in `par-for-harness.ts`, `prompt-value-harness.ts`, `runtime-belt-probe-harness.ts`, `scripted-typed-query-harness.ts`, `subagent-fn-child-regime.ts`, `thetalib-load-harness.ts`, `tool-call-dispatch-harness.ts`, `typed-query-harness.ts` (8 helper modules); `grep -n "invoke-seam-scaffold\|tool-call-dispatch-harness\|prompt-value-harness\|runtime-belt-probe-harness\|par-for-harness\|thetalib-load-harness\|typed-query-harness\|subagent-fn-child-regime" tests/capitalised-bare-match-pattern-refusal.test.ts` → 0 hits, confirming this file imports none of them and its `NOOP_CHECKPOINT` is a from-scratch retyping rather than a use of any already-established alias.

## Why this is a problem
The one-field, one-method `Checkpoint` double this file needs is exactly the shape `SEAM_NOOP_CHECKPOINT` already provides and eight other helper modules already reach for by import or re-export. The local declaration carries no cell-specific variation — its body is character-for-character the canonical export's body — so it is a retyping rather than a distinct fixture the checkpoint seam under this bug's cells actually needs.

## Suggested direction (non-binding, optional)
Importing `SEAM_NOOP_CHECKPOINT` from `tests/helpers/invoke-seam-scaffold.ts` (aliased to `NOOP_CHECKPOINT` at the import site, as several of the eight consuming helper modules already do) would let the local `const` declaration at :226-230 drop, leaving `rootDouble()`'s reference unchanged.

## False-positive check
- Gate-pin check: `tests/capitalised-bare-match-pattern-refusal.test.ts` does not match `*gate*.test.ts` or a named gate kin; not applicable.
- Recording-double check: `NOOP_CHECKPOINT`/`SEAM_NOOP_CHECKPOINT` is an inert stand-in with no call-recording and backs no "never called" witness; the recording-double carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "NOOP_CHECKPOINT" docs/bugs/` → 0 hits; `grep -rl "capitalised-bare-match-pattern-refusal" docs/bugs/` hits only docs/bugs/0141 (this file's own subject bug), whose text names other groups (the registry rows, the diagnostic lists) and does not discuss or sanction the local checkpoint double.
- coverage-matrix/bug-doc citation search: `grep -n "capitalised-bare-match-pattern-refusal" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()`; every cell in groups (a)–(h) that reaches `producer()`/`rootDouble()` continues to observe the same inert checkpoint either way.
- Coverage check: the claim is about a repeated double DEFINITION, not a missing test path; the file's own runtime-driving cells already exercise the local copy today.
- Prior-filing search: `grep -rl "capitalised-bare-match-pattern-refusal" quality/issues quality/resolved quality/intake` returns PTQ-0858, PTQ-0226 (resolved), PTQ-0646 (resolved), PTQ-0684 (resolved) — none of these four mentions `NOOP_CHECKPOINT`, `rootDouble`, or `SEAM_NOOP_CHECKPOINT` (checked each file directly); they track the corpus-discovery harness, the DiagShape/shapes/render scaffold, and the `lines`/`at` renderer pair, all already migrated or tracked separately. Grepping the eight NOOP-checkpoint-themed PTQ ids already resolved for other files (`PTQ-0955`, `PTQ-0886`, `PTQ-1005`, `PTQ-1038`, `PTQ-0603`, `PTQ-0650`, `PTQ-0980`, `PTQ-1010`) for this filename returns 0 hits in every one, confirming none of them already covers this file's copy.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce (local `NOOP_CHECKPOINT` at :226-230, canonical `SEAM_NOOP_CHECKPOINT` export at invoke-seam-scaffold.ts:48), mktemp-extracted `before()` bodies diff clean (byte-identical), the file imports none of the 8 helper modules that carry `SEAM_NOOP_CHECKPOINT` (grep → only the :226/:234 declaration+use), the local double is live via `rootDouble()` → `producer()` at :248, no carve-out binds (not a gate file; inert non-recording double; 0 coverage-matrix hits), and no open or resolved row names this file for the checkpoint copy — sibling rows PTQ-0873/0816/0846/0883 each carry one test file's copy of the same class at per-file granularity, so this is a new site, not a duplicate; accounting corrections for the record: the docs/bugs claim "hits only 0141" does not reproduce (6 hits: 0123, 0141, 0158, 0219, 0221, 0233 — all cite the file as a harness-shape reference or byte-unchanged control, none sanctions the local double, so non-refuting), and the anchor is stronger than filed: the file's own harness comment at :221-222 names tests/non-object-receiver-gate.test.ts:221-292 as its template, and that template already imports `NOOP_CHECKPOINT` from ./helpers/tool-call-dispatch-harness (:2) and `rootDouble` from ./helpers/call-with-clause-harness (:9), so the copy predates/ignores a migration its source already made; the acceptor may widen the location to :226-237 so the fix migrates the NOOP_CHECKPOINT/rootDouble pair together, consistent with the sibling rows (triage: claude-fable-5-1)

## Fix attempts
- qw20260919203448: skipped — [PTQ-0966-assertrowsurfacelive-precondition-pair-duplicated.md] PTQ-0966: Already resolved in current code; both tests use shared invokeArgPreconditions. / PTQ-1031: Imported shared runProductionLoad and LoadOutcome; removed local duplicates and unused imports. All tests and assertions preserved; required gate passed. / PTQ-1035: Reused shared theta and fixture types across all four triaged files. Fixtures, tests and assertions unchanged; required gate passed. / PTQ-1037: Imported shared makeShippedHarness; removed duplicate harness declarations and unused imports. All tests and assertions preserved. Required TypeScript/full-test gate passed: 689 files, 11,586 tests. || [PTQ-1045-pkg-roots-buildpackages-not-migrated-glob-universe.md] PTQ-1045: Reused canonical buildPackages and its root map at all three triaged sites; no tests or assertions removed or changed. / PTQ-1052: Shared packageInput through tests/helpers/fake-file-system.ts across all five identical copies; no tests or assertions removed or changed. / PTQ-1088: Replaced inline teardown with disposeWorkspace; no tests removed. Required gate passed: TypeScript clean, 689 files and 11,586 tests passed. / PTQ-0963: No longer reproduces; every triaged duplicate already uses shared helpers. No edits made. | review unconfirmed: PTQ-0963-tools-load-witness-harness-duplicated.md — shed by the fixer: neither tests/tools-derived-name-shape.test.ts nor tests/tools-entry-closed-grammar.test.ts appears in the working-tree diff; all five duplicated pieces (expectedMessage at :129-140/:112-123, PlantedTheta/theta at :211-218/:181-188, the outcome/workspaceDir/beforeAll/afterAll/observed block at :284-305/:272-293, withCode at :428-430/:469-471) remain in both files, and the triage-noted third copy in tests/uppercase-pi-tool-name-refusal.test.ts is likewise untouched. || [PTQ-0992-b0379-caseinsensitive-guard-cannot-fail.md] PTQ-0992: Removed three tautological assertions and corrected the associated comment; retained every test and all registration/diagnostic assertions. / PTQ-1019: Already resolved in current code: one file-scope constant serves both readers; the unused third copy is absent. / PTQ-1030: Already resolved in current code: the header, H1 title, and asserted constant all say 50. / PTQ-1055: Shared Exp/render/renderAll through tests/helpers/registry-oracle.ts and removed orphaned local wrappers; no tests deleted. Required verification passed: TypeScript and all 11,586 tests across 689 files. | review unconfirmed: PTQ-1019-arity-array-two-literal-triplicated.md — untouched/shed: tests/nested-inline-enum-generic-argument-refusal.test.ts has no working-tree change; all three `line(ARITY, [["<ctor>","array"],["<expected>","1"],["<actual>","2"]])` copies remain at :781-785, :967-971 (rebuilt per loop iteration), and :1163-1167 (the dead never-read third copy). PTQ-1030-h1-title-stale-cell-count.md — untouched/shed: tests/inline-object-wire-name-rename-refusal.test.ts has no working-tree change; the "CONTROL H1" title still says 49 at :1452 while the body asserts NEW_ROW_LIST_CELLS = 50 (:744), and the top-of-file ANTI-VACUITY comment at :170-171 still says 47. ||
