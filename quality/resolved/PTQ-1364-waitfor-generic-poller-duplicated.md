---
id: PTQ-1364
title: quality-loop-empty-tail-return-validation.test.ts redeclares the generic waitFor<T> poller already written byte-for-byte in b0409-omitted-defaulted-binds-default.test.ts
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/quality-loop-empty-tail-return-validation.test.ts:239-251
  - tests/b0409-omitted-defaulted-binds-default.test.ts:167-179
sites: 2
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
fix_skips: 1
---

# quality-loop-empty-tail-return-validation.test.ts redeclares the generic waitFor<T> poller already written byte-for-byte in b0409-omitted-defaulted-binds-default.test.ts

## Observation
`tests/quality-loop-empty-tail-return-validation.test.ts` declares a
module-scope generic `async function waitFor<T>(fn, label, budgetMs = 5000)`
that polls `fn()` every 5ms until it returns a defined value or the budget is
exhausted, then throws naming the label.
`tests/b0409-omitted-defaulted-binds-default.test.ts` already declares a
function of the identical name, identical generic signature, identical
default budget, identical polling interval, and identical body structure —
differing only in the exact wording of the thrown message
("precondition never met" vs "harness precondition never met"). Neither file
imports the helper from the other or from a shared module; each declares its
own copy.

## Evidence

`tests/quality-loop-empty-tail-return-validation.test.ts:239-251` (re-read
immediately before filing):
```ts
/**
 * Poll until `fn` yields a value, failing loudly on the unmet precondition
 * rather than hanging (the `tests/b0409-*` idiom).
 */
async function waitFor<T>(fn: () => T | undefined, label: string, budgetMs = 5000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = fn();
    if (value !== undefined) {
      return value;
    }
    if (Date.now() - start > budgetMs) {
      throw new Error(`harness precondition never met within ${budgetMs}ms: ${label}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
```

`tests/b0409-omitted-defaulted-binds-default.test.ts:167-179` (re-read
immediately before filing):
```ts
/** Poll until `fn` yields a defined value; throw LOUDLY on budget exhaustion. */
async function waitFor<T>(fn: () => T | undefined, label: string, budgetMs = 5000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = fn();
    if (value !== undefined) {
      return value;
    }
    if (Date.now() - start > budgetMs) {
      throw new Error(`precondition never met within ${budgetMs}ms: ${label}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
```

The in-scope file's own doc comment ("the `tests/b0409-*` idiom") names the
other file as the source of the shape it copies, rather than naming an import.

Exact search, repo-wide: `grep -rn "function waitFor<T>" tests/*.ts` → 2 hits,
exactly the two files above.

## Why this is a problem
The two functions are the same polling idiom (5ms interval, 5000ms default
budget, defined-value termination, budget-exhaustion throw) declared twice at
module scope in two different test files, with the in-scope file's own
comment acknowledging the other file as the idiom's origin. A change to the
poll interval or the termination condition has to be made in both places
independently, with nothing tying the two together once they diverge; the
resolved finding PTQ-0964 already noted this exact pair as an unmigrated
generic variant distinct from the byte-identical non-generic `waitFor` group
it filed.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` export of this generic poller is the natural home
the two files' own naming and doc-comment cross-reference already point at.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or a named kin; both
  cited spans are a bounded-poll utility, not a pinned count or inventory
  assertion.
- Recording-double check: `waitFor<T>` polls a caller-supplied value-returning
  callback; it is not a call-recording double and backs no "never called"
  witness.
- docs/bugs/ signature search: `grep -rl "quality-loop-empty-tail-return-validation\|b0409-omitted-defaulted" docs/bugs/*.md` → 0 hits for the file names; no documented correct-reason-red cites either file's `waitFor`.
- coverage-matrix/bug-doc citation search: `grep -n "quality-loop-empty-tail-return-validation" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of either file or any `describe()`/`it()` — only that the duplicated declaration could be shared.
- Prior-finding overlap check: `quality/resolved/PTQ-0964-waitfor-poll-helper-reimplemented.md` explicitly names this exact file's `waitFor<T>` (there at line 235, now 239-251) as "a generic `<T>`, a `budgetMs` parameter... not part of this byte-identical group" and files against a *different*, non-generic `waitFor` pair instead — so this generic pair is a distinct, not-yet-filed site for the same root cause (duplicated poll-helper declaration), not a re-file of PTQ-0964.
- Coverage-drift check: the claim is about a repeated function DEFINITION each file's own `it()` bodies call directly; no claim that any invoke/return path is untested.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: both excerpts reproduce (quality-loop-empty-tail-return-validation:239-255 doc comment + fn at :243, b0409-omitted-defaulted-binds-default:167-180) and a mktemp `diff` of the two bodies is empty once the single word "harness " is stripped from the throw message; both copies are live (called at :362/:363 and :258/:262 respectively); `grep -rn "function waitFor" tests/ src/ extensions/ tools/` → 4 declarations, exactly these two generic `<T>`/budgetMs copies plus the non-generic boolean pair (helpers/fake-file-watcher.ts:108 export, statement-trace-seam:434) which have a different signature and no shared home for the generic shape exists in tests/helpers/; git shows b0409 (a52d7979, 2026-09-04) predates the copy (c83b5c9e, 2026-09-10) whose own doc comment names it as source; not a duplicate — PTQ-0964 (fixed) covers the byte-identical non-generic group and its Evidence explicitly excludes this generic variant, and no other quality/ row cites `waitFor<T>`; one stated FP-check search does not reproduce (`grep -rl` over docs/bugs hits 0409 and 0473 as witness citations, not 0) but the filing proposes no merge/rename/delete so no carve-out applies; D7 boilerplate-duplication inside tests/, not a gate file or recording double (triage: claude-fable-5-1)

## Fix attempts
- qw20260923093622: skipped — [PTQ-1332-parsedtheta-fixture-builder-duplicated.md] PTQ-1332: removed all 6 local NOOP_RUN/theta ParsedTheta builders across the 5 files and switched every call site to the canonical makeTheta from tests/helpers/watch-arming-harness; in registration-reload-wiring and watcher-terminated-recovery the toEqual(theta(...)) comparisons were rewritten to compare against a single hoisted makeTheta(...) instance (makeTheta's default run mints a fresh function per call, and toEqual treats distinct function refs as unequal — confirmed by an initial red run, then fixed); unused ParsedTheta type imports pruned where the builder was the only user. PTQ-1353: added stderrLinesWithPrefix(calls, prefix) to tests/helpers/compose-workspace-harness.ts (the existing console.error-capture helper home; prefix is a caller argument per the triage's RED-at-HEAD literal-prefix carve-out) and replaced all three cited partitions plus the triage-named fourth partial copy in tests/system-note-channel.test.ts (its spy now records full arg arrays instead of args[0] so the shared projection applies; assertion counts unchanged). PTQ-1338: moved RecordingQueryModel (with the log array as the superset shape) into tests/helpers/scripted-typed-query-harness.ts beside the existing QueryModelDriver doubles; both test files now import it; the b0316 copy gains inert log pushes it never reads; newly-unused type imports pruned. PTQ-1344: added RespondFixture/respondFixtureFor(thetaSource) (memoised per source string) and qry15Body to tests/helpers/scripted-live-session-harness.ts (the home the issue names; carrying the bug-0010/0099 slug-recipe and QRY-15 doc comments); typed-repair-two-phase and typed-two-phase-live keep a one-line respondFixture wrapper over their own theta constant so their 17 call sites are untouched; per the triage correction the drifted third copy in typed-query-provider-gate.test.ts was folded in too, replacing its hand-rolled sha256(JSON.stringify) slug with the canonical respondSchemaSlug path (the fixture is only self-consistent fallback-tool-name plumbing; gate suite passes); dead createHash/lowerQueryResponseSchema/respondSchemaSlug/LoweredSchema/SchemaDecl imports pruned. Verification: the verbatim unset+tsc+npm test gate ran green (705 files, 11780 tests). ||
