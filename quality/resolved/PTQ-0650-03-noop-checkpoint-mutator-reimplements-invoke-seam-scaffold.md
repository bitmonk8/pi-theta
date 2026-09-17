---
id: PTQ-0650
title: par-for-body-return-refusal.test.ts redeclares NOOP_CHECKPOINT/NoopMutator instead of importing tests/helpers/invoke-seam-scaffold.ts's SEAM_NOOP_CHECKPOINT/SEAM_NOOP_MUTATOR
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/par-for-body-return-refusal.test.ts:595-607
  - tests/helpers/invoke-seam-scaffold.ts:28-47
sites: 1
fix_scope: module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# par-for-body-return-refusal.test.ts redeclares NOOP_CHECKPOINT/NoopMutator instead of importing tests/helpers/invoke-seam-scaffold.ts's SEAM_NOOP_CHECKPOINT/SEAM_NOOP_MUTATOR

## Observation
tests/par-for-body-return-refusal.test.ts declares a local
`NOOP_CHECKPOINT: Checkpoint` (an always-resolving `before()`) and a local
`NoopMutator` class implementing `CommittedConversationMutator` with five
no-op methods, both built from the same `Checkpoint`
(src/seams/checkpoint) and `CommittedConversationMutator`/`CommittedSurface`
(src/runtime/terminal-outcomes) types tests/helpers/invoke-seam-scaffold.ts
already imports. That module already exports `SEAM_NOOP_CHECKPOINT` and
`SEAM_NOOP_MUTATOR` of the identical shape, stating in its own header comment
that the "no-op triple" it centralises was "byte-for-byte identical across
several `executeBody`-driving invoke/code-call bug-witness files".

## Evidence
tests/par-for-body-return-refusal.test.ts:595-607 (re-read immediately before filing):
```ts
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

class NoopMutator implements CommittedConversationMutator {
  truncate(): void {}
  rewrite(): void {}
  replace(): void {}
  remove(): void {}
  injectCompensatingTurn(_surface: CommittedSurface): void {}
}
```

tests/helpers/invoke-seam-scaffold.ts:28-47 — the canonical, already-exported
equivalents (a `const` object rather than a class, same method set, same
no-op bodies, same two imported types):
```ts
/** A `Checkpoint` whose `before()` resolves immediately — the seam is not
 *  itself under test at the call sites that use this scaffold. */
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
```

Search: `grep -rl "helpers/invoke-seam-scaffold" tests/*.test.ts` → 3 files
(b0295, b0347, b0349) already import this module; the reviewed file is not
among them and instead declares its own copy of two of the module's three
exported no-op seams under the same imported types
(`Checkpoint`, `CommittedConversationMutator`, `CommittedSurface`, all from
the same two source modules the scaffold file itself imports from).

## Why this is a problem
`NOOP_CHECKPOINT`'s single method body (`before(): Promise<void> { return
Promise.resolve(); }`) and `NoopMutator`'s five no-op methods
(`truncate`/`rewrite`/`replace`/`remove`/`injectCompensatingTurn`) are, method
for method, the same no-op bodies `SEAM_NOOP_CHECKPOINT`/`SEAM_NOOP_MUTATOR`
already export against the identical interface types, imported from the same
two production modules. The reviewed file constructs its own copy rather than
importing the shared scaffold three sibling files already import from.

## Suggested direction (non-binding, optional)
tests/helpers/invoke-seam-scaffold.ts's `SEAM_NOOP_CHECKPOINT` /
`SEAM_NOOP_MUTATOR` exports are the home this file's own local
`NOOP_CHECKPOINT`/`NoopMutator` already match in shape; the file's own
`execDeps`-shaped driver, which differs per bug, stays local per that
module's own stated scope.

## False-positive check
- Gate-pin: the file does not match `*gate*.test.ts` or a listed gate kin;
  the cited lines are no-op double declarations, not a pinned count or
  inventory.
- Recording-double: `NOOP_CHECKPOINT`/`NoopMutator` record no calls and back
  no "never called" witness — every method is an unconditional no-op with no
  observable side channel; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "NOOP_CHECKPOINT\|NoopMutator"
  docs/bugs/*.md` → no hits; no documented correct-reason red discusses this
  duplication for bug 0223.
- coverage-matrix/bug-doc citation search: `grep -n
  "par-for-body-return-refusal" docs/reference/coverage-matrix.md` → 0 hits.
  This finding proposes no merge, rename, or deletion of the file or any
  `it()`/`describe()` — only that the two no-op seam declarations could be
  imported rather than redeclared — so no citation is affected.
- Overlap check: the file does not appear in `locations` of any already-filed
  invoke-seam-scaffold-duplication finding this wave (checked by name against
  the supplied already-filed list, which lists several `*-invoke-seam-
  scaffold-not-migrated.md`/`*-duplicated.md` findings for other files, none
  citing this one).
- Coverage-drift check: the claim is about a repeated no-op-double
  declaration already covered by an existing exported helper, not about a
  missing test path.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently reproduced: NOOP_CHECKPOINT/NoopMutator at tests/par-for-body-return-refusal.test.ts:595-607 match the excerpt verbatim and are method-for-method identical to SEAM_NOOP_CHECKPOINT/SEAM_NOOP_MUTATOR at tests/helpers/invoke-seam-scaffold.ts:28-47 (class vs const only; same Checkpoint/CommittedConversationMutator/CommittedSurface imports from the same two src modules at :27-32), sole use is execDeps() :669/:671 as a plain checkpoint/mutator slot (no recording, no negative witness, not a gate file), scaffold importers = exactly b0295/b0347/b0349 with this file absent, docs/bugs and coverage-matrix greps both 0 hits as stated; not a duplicate — resolved PTQ-0244/0301/0344 cover b0349/b0295/b0347 only and the two shard-111 siblings target e2e-s1/registry-oracle; same per-file shape those three were ratified on (wider context: 11 tests declare both, 86 the checkpoint alone) (triage: claude-fable-5-1)
