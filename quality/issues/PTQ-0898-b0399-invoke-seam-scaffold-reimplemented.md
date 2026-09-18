---
id: PTQ-0898
title: b0399's executeBody harness redeclares the invoke-seam-scaffold no-op sink/mutator/span triad instead of importing it
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0399-boundary-event-attempts-tokens-masked.test.ts:433-449
  - tests/helpers/invoke-seam-scaffold.ts:39-57
sites: 1
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918075903
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# b0399's executeBody harness redeclares the invoke-seam-scaffold no-op sink/mutator/span triad instead of importing it

## Observation
`tests/b0399-boundary-event-attempts-tokens-masked.test.ts` declares, module-scope, a `NOOP_SINK` constant (`ToolLoweringSink`), a `NoopMutator` class (`CommittedConversationMutator`), and a `span()` function, to feed its own `executeBodyHarness()` that drives the real `executeBody`. `tests/helpers/invoke-seam-scaffold.ts` already exports functionally identical pieces under the names `SEAM_NOOP_SINK`, `SEAM_NOOP_MUTATOR`, and `span()`, for exactly this "inert stand-in for a seam the driven cell does not itself exercise" purpose (the helper's own header). The reviewed file imports neither; git history shows the helper (2026-09-17) predates the reviewed file (2026-09-18) by one day.

## Evidence
`tests/b0399-boundary-event-attempts-tokens-masked.test.ts:433-449`:
```ts
const NOOP_SINK: ToolLoweringSink = {
  diagnostic(): void {},
  systemNote(): void {},
};

/** A no-op committed-conversation mutator (no rollback on the fail path). */
class NoopMutator implements CommittedConversationMutator {
  truncate(): void {}
  rewrite(): void {}
  replace(): void {}
  remove(): void {}
  injectCompensatingTurn(_surface: CommittedSurface): void {}
}

function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}
```

`tests/helpers/invoke-seam-scaffold.ts:39-57` (the canonical exports, value-for-value identical modulo the object-literal-vs-class spelling of the mutator):
```ts
export const SEAM_NOOP_SINK: ToolLoweringSink = {
  diagnostic(): void {},
  systemNote(): void {},
};

/** A `CommittedConversationMutator` whose every method is a no-op. */
export const SEAM_NOOP_MUTATOR: CommittedConversationMutator = {
  truncate(): void {},
  rewrite(): void {},
  replace(): void {},
  remove(): void {},
  injectCompensatingTurn(_surface: CommittedSurface): void {},
};

/** A throwaway 1:1–1:2 `SourceRange`, for a scaffold expr/site that carries no
 *  real source position. */
export function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}
```

Search: `grep -n "^const NOOP_SINK\|^class NoopMutator\|^function span" tests/b0399-boundary-event-attempts-tokens-masked.test.ts` returns exactly the three declarations cited above, and `grep -n "invoke-seam-scaffold" tests/b0399-boundary-event-attempts-tokens-masked.test.ts` returns 0 hits.

## Why this is a problem
Every method body of the reviewed file's `NOOP_SINK`/`NoopMutator`/`span()` triad matches, statement for statement, the exports `tests/helpers/invoke-seam-scaffold.ts` already publishes for the identical role — feeding an inert `ToolLoweringSink`/`CommittedConversationMutator`/throwaway `SourceRange` into a real `executeBody` drive where none of the three is itself under test. The helper's own header states this exact triad "is byte-for-byte identical across several `executeBody`-driving invoke/code-call bug-witness files," naming the recurrence this file adds one more instance of, one day after the helper existed to prevent it.

## Suggested direction (non-binding, optional)
Importing `SEAM_NOOP_SINK`, `SEAM_NOOP_MUTATOR`, and `span()` from `tests/helpers/invoke-seam-scaffold.ts` in place of the file's own three local declarations is the natural fit the helper's own stated purpose points to; this is an observation about the existing import surface, not a design for the change.

## False-positive check
- Gate-pin: `tests/b0399-boundary-event-attempts-tokens-masked.test.ts` is not a `*gate*.test.ts` file or named kin; it asserts no pinned count/inventory this finding touches.
- Recording-double: `NoopMutator`'s methods are all no-ops with no call log and `NOOP_SINK` discards every call; neither is a MUST-NOT-called negative witness (no test in the file asserts a call count against these), so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `docs/bugs/0399-boundary-event-omits-attempts-tokens-masked.md` exists and pins the fix contract this test's RED/GREEN assertion rows encode; it says nothing about the harness scaffolding this finding targets, and this finding does not touch any assertion row.
- coverage-matrix/bug-doc citation search: `grep -n "b0399-boundary-event-attempts-tokens-masked" docs/reference/coverage-matrix.md` → 0 hits. No merge, rename, or deletion of any file or `it()`/`describe()` is proposed — only that three local no-op declarations could be imported from the existing helper instead.
- Coverage check: the claim is about a repeated harness DEFINITION already exported elsewhere, not a missing test path; every cited piece is exercised by the tests in its own file, unchanged.

## Triage
<!-- triage appends its note here -->
verdict: confirmed — independently re-verified: both excerpts reproduce at exactly the cited lines (test :433-449, helper :39-57), the stated `^const NOOP_SINK\|^class NoopMutator\|^function span` search returns exactly the three declarations at 433/439/447 and `grep invoke-seam-scaffold` on the test → 0, `diff` of sed-extracted bodies is empty for the sink and `span()` and empty for the mutator after class→object-literal comma normalisation, all three local copies are live (`sink: NOOP_SINK` :477, `new NoopMutator()` :493, `range: span()` :452), coverage-matrix → 0 and no merge/rename/delete is proposed, both locations under tests/, D7 copy-paste-double class with no gate/recording-double/red-test carve-out; one Observation fact is inverted and immaterial — `git log` shows the test region landed in ec2a8ac2 2026-09-03 and the helper in f593d10e 2026-09-12, so this is an unmigrated PTQ-0244 residual predating the helper by nine days, not a copy made one day after it (same class as the confirmed PTQ-0778/0779/0895 "not migrated" filings); not a duplicate — no open issue cites this file for the triad, and the same-wave sibling d7-02 covers the disjoint :292-300 `NOOP_CHECKPOINT`/`liveSignal` region against scripted-typed-query-harness (a different root cause; the fixer should note the local `NOOP_CHECKPOINT` :292-296 also has a `SEAM_NOOP_CHECKPOINT` twin in this helper when reconciling the two) (triage: claude-fable-5-1)
