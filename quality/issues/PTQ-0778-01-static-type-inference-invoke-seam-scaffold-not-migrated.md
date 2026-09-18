---
id: PTQ-0778
title: static-type-inference.test.ts redeclares the full invoke-seam-scaffold no-op checkpoint/mutator/span triad instead of importing it
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/static-type-inference.test.ts:52-54
  - tests/static-type-inference.test.ts:167-180
  - tests/helpers/invoke-seam-scaffold.ts:29-53
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# static-type-inference.test.ts redeclares the full invoke-seam-scaffold no-op checkpoint/mutator/span triad instead of importing it

## Observation
`tests/static-type-inference.test.ts` declares its own module-scope `span()`
function, `NOOP_CHECKPOINT` constant, and `NoopMutator` class, all three of
which are functionally identical to the exports
`tests/helpers/invoke-seam-scaffold.ts` already publishes for exactly this
purpose (`span()`, `SEAM_NOOP_CHECKPOINT`, `SEAM_NOOP_MUTATOR`). The reviewed
file drives the real `executeBody` over these inert stand-ins (its "read-only
composition" bullet) but imports none of the three from the helper.

## Evidence
`tests/static-type-inference.test.ts:52-54`:
```ts
function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}
```

`tests/static-type-inference.test.ts:167-180`:
```ts
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

/** A no-op partial-append mutator (the read-only body triggers no mutation). */
class NoopMutator implements CommittedConversationMutator {
  truncate(): void {}
  rewrite(): void {}
  replace(): void {}
  remove(): void {}
  injectCompensatingTurn(_surface: CommittedSurface): void {}
}
```

`tests/helpers/invoke-seam-scaffold.ts:29-53` (the canonical exports,
value-for-value identical to the reviewed file's own three copies above,
modulo the object-literal-vs-class spelling of the mutator):
```ts
export const SEAM_NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

/** A `ToolLoweringSink` that discards every diagnostic/system-note. */
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

Search: `grep -n "^function span\|^const NOOP_CHECKPOINT\|^class NoopMutator"
tests/static-type-inference.test.ts` returns exactly the three declarations
cited above, and none of them import from `"./helpers/invoke-seam-scaffold"`
(`grep -n "invoke-seam-scaffold" tests/static-type-inference.test.ts` — 0
hits).

## Why this is a problem
All three no-op stand-ins the file's "read-only composition" test needs
(`span()` for its hand-built AST spans, `NOOP_CHECKPOINT` for its
`ExecuteBodyDeps.checkpoint`, `NoopMutator` for its `.mutator`) are, method
body for method body, the same inert scaffolding
`tests/helpers/invoke-seam-scaffold.ts` already exports under its own
canonical name — a module whose own header states it exists precisely
because this triad recurs byte-for-byte across `executeBody`-driving test
files. The reviewed file is one more site reconstructing that same triad by
hand.

## Suggested direction (non-binding, optional)
Importing `SEAM_NOOP_CHECKPOINT`, `SEAM_NOOP_MUTATOR`, and `span()` from
`tests/helpers/invoke-seam-scaffold.ts` in place of the file's own three
local declarations is the natural fit the helper's own stated purpose points
to; this is an observation about the existing import surface, not a design
for the change.

## False-positive check
- Gate-pin carve-out: `tests/static-type-inference.test.ts` is not a
  `*gate*.test.ts` file and asserts no pinned count/inventory this finding
  touches.
- Recording-double carve-out: `NoopMutator`'s methods are all no-ops with no
  call log; it is not a MUST-NOT-called negative witness (unlike the file's
  separate `RecordingHost`-adjacent doubles in sibling files), so the
  carve-out does not apply, and this claim is not about any assertion's
  ability to fail.
- docs/bugs/ signature search: `grep -rl "static-type-inference"
  docs/bugs/*.md` — 0 hits; no bug document pins or excuses this file's local
  `span`/`NOOP_CHECKPOINT`/`NoopMutator` block.
- coverage-matrix/bug-doc citation search: `grep -n "static-type-inference"
  docs/reference/coverage-matrix.md` — hits exist naming the file as a whole
  by its own row (cka-token), never the internal `span`/`NOOP_CHECKPOINT`/
  `NoopMutator` block; this finding proposes no merge, rename, or deletion of
  the file or any test in it, only that the three no-op constructs could
  import the existing scaffold instead of redeclaring it.
- Reference/callers check: `tests/helpers/invoke-seam-scaffold.ts`'s exports
  are live (its own header names bug 0294/0295/0347/0349 as importers; this
  same wave's shards confirm further importers), not a dead-code target
  being proposed.
- Coverage-drift check: this finding is about a redeclared no-op scaffold, not
  a missing test path; the file's own per-node and read-only-composition
  tests are unaffected by this claim.

## Triage
<!-- triage appends its note here -->
verdict: questionable — observation reproduces (span()/NOOP_CHECKPOINT/NoopMutator at :52-54/:167-180 are body-for-body identical to invoke-seam-scaffold.ts:29-53, 0 helper imports, 0 coverage-matrix hits, not covered by PTQ-0244/0301/0344 which each migrated a different b-file) but the anchor is overstated: this file (57dd14ef, 2026-07-04) predates the helper (f593d10e, 2026-09-12) and was never in the helper's header roster, which scopes it to the four invoke/code-call bug-witness files around an InvokeChild double this test does not use; the identical local no-op Checkpoint appears in 84 tests/ files and the no-op mutator in 19, so whether invoke-seam-scaffold becomes the suite-wide no-op ExecuteBodyDeps home (vs this being one shard of a pervasive idiom, cf. PTQ-0278's 47-file span() note) is a human ruling, not a mechanical un-migrated residual (triage: claude-fable-5-1)
verdict: confirmed — independently re-verified: `span()` :52-54, `NOOP_CHECKPOINT` :167-171 and `NoopMutator` method bodies :175-179 each sed-extracted and diffed against tests/helpers/invoke-seam-scaffold.ts `span`/`SEAM_NOOP_CHECKPOINT`/`SEAM_NOOP_MUTATOR` → zero diff after name/export/class-vs-const normalisation; file imports nothing from invoke-seam-scaffold (0 hits; helper importers are exactly 3 files, this one absent) yet feeds them straight into the real `executeBody` deps (:218/:220) with no recording or negative-witness role; file is green (17/17), not a *gate* file, 0 docs/bugs cites of the test file (the candidate's 51 `static-type-inference` bug hits are all the src module), 0 coverage-matrix hits; not a duplicate — no issues/ or resolved/ row cites tests/static-type-inference.test.ts and same-shard d7-140-02 targets statement-executor; the prior questionable note's "predates the helper / not in its header roster" objection does not follow store precedent — PTQ-0650 (par-for-body-return-refusal, 2026-08-21) and PTQ-0705 (subagent-fn, 2026-07-21) likewise predate the 2026-09-12 helper, are absent from its roster, and were ratified confirmed as per-file not-migrated residuals, as were PTQ-0545/0594/0603/0613/0655/0720/0738 (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
