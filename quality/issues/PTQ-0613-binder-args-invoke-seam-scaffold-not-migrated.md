---
id: PTQ-0613
title: inbound-boundary-binder-args.test.ts redeclares the invoke-seam-scaffold NOOP_CHECKPOINT/NOOP_SINK/mutator triple instead of importing it
lens: D7
status: open
verdict: confirmed
locations:
  - tests/inbound-boundary-binder-args.test.ts:196-212
  - tests/helpers/invoke-seam-scaffold.ts:29-46
sites: 1
fix_scope: module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# inbound-boundary-binder-args.test.ts redeclares the invoke-seam-scaffold NOOP_CHECKPOINT/NOOP_SINK/mutator triple instead of importing it

## Observation
tests/inbound-boundary-binder-args.test.ts declares a module-scope
`NOOP_CHECKPOINT` (a `Checkpoint` whose `before()` resolves immediately), a
`NOOP_SINK` (a `ToolLoweringSink` whose two methods are no-ops), and a class
`InertMutator implements CommittedConversationMutator` whose five methods are
all no-ops. tests/helpers/invoke-seam-scaffold.ts already exports the
identical three stand-ins as `SEAM_NOOP_CHECKPOINT`, `SEAM_NOOP_SINK` and
`SEAM_NOOP_MUTATOR`, with the same field/method shapes and the same
no-op bodies (a `const` object literal rather than a `class`, functionally
identical). The helper module's own header states this exact triple is
"byte-for-byte identical across several `executeBody`-driving invoke/code-call
bug-witness files" and names its known importers; this file is not among
them.

## Evidence

tests/inbound-boundary-binder-args.test.ts:196-212 (re-read immediately before filing):
```ts
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

const NOOP_SINK: ToolLoweringSink = {
  diagnostic(): void {},
  systemNote(): void {},
};

class InertMutator implements CommittedConversationMutator {
  truncate(): void {}
  rewrite(): void {}
  replace(): void {}
  remove(): void {}
  injectCompensatingTurn(_surface: CommittedSurface): void {}
}
```

tests/helpers/invoke-seam-scaffold.ts:29-46 (the canonical exports):
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
```

## Why this is a problem
The file's own `inertExecuteDeps()` (the `ExecuteBodyDeps` builder driving the
real `executeBody`/`createEffectfulStatementHost` seam) assembles
`checkpoint`, one `sink`-shaped host dep, and `mutator` from these three
locally-declared stand-ins — the exact three pieces
tests/helpers/invoke-seam-scaffold.ts's own header states it exists to hold
once for this lineage of `executeBody`-driving files, having already migrated
bug 0294/0295/0347/0349's witnesses onto it. This file drives the identical
seam and needs the identical inert stand-ins, but retypes them locally
instead.

## Suggested direction (non-binding, optional)
Importing `SEAM_NOOP_CHECKPOINT`, `SEAM_NOOP_SINK` and `SEAM_NOOP_MUTATOR`
from tests/helpers/invoke-seam-scaffold.ts in place of the three local
declarations is the home the helper's own header, and its four other named
importers, already point toward.

## False-positive check
- Gate-pin: tests/inbound-boundary-binder-args.test.ts does not match
  `*gate*.test.ts` or a listed gate kin; the cited lines are inert seam
  stand-ins, not a pinned count or inventory.
- Recording-double: `NOOP_CHECKPOINT`/`NOOP_SINK`/`InertMutator` are inert
  no-op stand-ins for seams not under test at this file's call sites, not
  recording doubles witnessing a MUST-NOT-call; the carve-out does not apply.
- docs/bugs/ signature search: `grep -rln "NOOP_CHECKPOINT\|InertMutator"
  docs/bugs/` → no hits; no documented correct-reason red discusses this
  scaffolding duplication.
- coverage-matrix/bug-doc citation search: `grep -n
  "inbound-boundary-binder-args" docs/reference/coverage-matrix.md docs/bugs/*.md`
  → 0 hits. This finding proposes no merge, rename or deletion of any file or
  `it()`/`describe()` — only that the three inert stand-ins could be imported
  rather than redeclared — so no citation is affected.
- Overlap check: `grep -rl "inbound-boundary-binder-args"
  quality/intake/*.md quality/resolved/*.md` (excluding this file, before
  writing it) found only this wave's own already-filed `realAjv`/`makeDeps`
  findings for the same file (different root cause, filed separately); no
  prior finding names this NOOP_CHECKPOINT/NOOP_SINK/InertMutator
  redeclaration.
- Coverage-drift check: the claim is about a repeated scaffolding DEFINITION
  already covered by an existing exported helper, not about a missing test
  path.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently reproduced: tests/inbound-boundary-binder-args.test.ts:196-212 declares NOOP_CHECKPOINT/NOOP_SINK/InertMutator byte-identical (modulo `class`→`const`) to SEAM_NOOP_CHECKPOINT/SINK/MUTATOR exported at tests/helpers/invoke-seam-scaffold.ts:31-48 (2-line drift from the cited 29-46), the file imports nothing from tests/helpers/, InertMutator is consumed only as `new InertMutator()` at :240 (no subclass/instanceof making the class form load-bearing), and inertExecuteDeps() feeds the real createEffectfulStatementHost/ExecuteBodyDeps seam the helper's header says it exists to scaffold — the same per-file shape ratified in PTQ-0244 (b0349), PTQ-0301 (b0295) and PTQ-0344 (b0347); not a duplicate (sibling intake d7-115-01 targets params-default-enum-access-merge.test.ts and names this file only as context); one FP-check claim misreports — docs/bugs/*.md has 17 hits for this file (0172/0178/0186 cite :78, :81-83, :274-287), not 0 — but none touch :196-212 and no it()/describe() is merged/renamed/deleted, so the witness-list carve-out does not apply; coverage-matrix 0 hits confirmed (triage: claude-fable-5-1)
