---
id: PTQ-0844
title: b0316 re-declares SEAM_NOOP_SINK and a no-op SEAM_NOOP_MUTATOR locally under the misleading name RecordingMutator, despite importing a sibling export from the same helper module
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0316-match-scrutinee-inline-composite-ok-wrapped.test.ts:4
  - tests/b0316-match-scrutinee-inline-composite-ok-wrapped.test.ts:245-256
  - tests/helpers/invoke-seam-scaffold.ts:32-51
  - tests/b0307-empty-template-parity.test.ts:1
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized           # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# b0316 re-declares SEAM_NOOP_SINK and a no-op SEAM_NOOP_MUTATOR locally under the misleading name RecordingMutator, despite importing a sibling export from the same helper module

## Observation
tests/b0316-match-scrutinee-inline-composite-ok-wrapped.test.ts imports
`SEAM_NOOP_CHECKPOINT` from `tests/helpers/invoke-seam-scaffold.ts` (line 4),
proving the file already knows about and reaches into that module. In its
own "EFFECT control" section it then declares a local `NOOP_SINK` constant
body-identical to the same module's `SEAM_NOOP_SINK` export, and a local
class named `RecordingMutator` whose five methods are all empty bodies —
body-identical in behaviour to the same module's `SEAM_NOOP_MUTATOR` export
— instead of importing either. The chosen local name `RecordingMutator`
collides with the identically-named but behaviourally different export the
same helper module provides (a genuine recording double that pushes each
call onto a `.calls` array), which
tests/b0307-empty-template-parity.test.ts — another file in this same
review scope — imports and uses for that recording behaviour.

## Evidence

tests/b0316-match-scrutinee-inline-composite-ok-wrapped.test.ts:4 (the proof
of awareness):
```ts
import { SEAM_NOOP_CHECKPOINT as NOOP_CHECKPOINT } from "./helpers/invoke-seam-scaffold";
```

tests/b0316-match-scrutinee-inline-composite-ok-wrapped.test.ts:245-256
(re-read immediately before filing; the local no-op mutator misnamed
`RecordingMutator`, and the local no-op sink):
```ts
class RecordingMutator implements CommittedConversationMutator {
  truncate(): void {}
  rewrite(): void {}
  replace(): void {}
  remove(): void {}
  injectCompensatingTurn(_surface: CommittedSurface): void {}
}

const NOOP_SINK: ToolLoweringSink = {
  diagnostic(): void {},
  systemNote(): void {},
};
```

tests/helpers/invoke-seam-scaffold.ts:32-51 (the canonical exports the file
partially imports from and could have used in full):
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

tests/b0307-empty-template-parity.test.ts:1 (the same identifier,
`RecordingMutator`, imported from the same helper module as a genuine
recording double in another file inside this review's scope):
```ts
import { RecordingMutator } from "./helpers/invoke-seam-scaffold";
```
That module's own `RecordingMutator` export (`tests/helpers/invoke-seam-scaffold.ts:83-100`)
pushes each call onto a `readonly calls: string[]` array — the opposite of
b0316's five empty method bodies.

## Why this is a problem
b0316's own import line (4) shows the file already resolves and pulls a
named export from `tests/helpers/invoke-seam-scaffold.ts`; the module's two
remaining no-op exports needed for the same `ExecuteBodyDeps` bundle
(`SEAM_NOOP_SINK`, `SEAM_NOOP_MUTATOR`) are re-typed locally instead of
imported alongside it — this is the "copy-paste fixtures/doubles" class:
a fake re-implemented where the canonical helper is not merely available
but demonstrably already in use one import statement above. The local
re-implementation compounds this by naming its no-op mutator
`RecordingMutator`, the exact identifier the same helper module exports for
a genuinely different, call-recording double — a double that
tests/b0307-empty-template-parity.test.ts (this same review's own sibling
file) imports and uses for that recording behaviour. A reader moving
between the two files who has seen the canonical `RecordingMutator`'s
`.calls` array would read b0316's `mutator: new RecordingMutator()` at line
311 as recording mutation calls; it silently discards every call instead.

## Suggested direction (non-binding, optional)
`tests/helpers/invoke-seam-scaffold.ts` already exports `SEAM_NOOP_SINK` and
`SEAM_NOOP_MUTATOR` under those names, alongside the `SEAM_NOOP_CHECKPOINT`
this file already imports; importing all three under one import statement
removes both the duplicated bodies and the colliding local name.

## False-positive check
- Gate-pin check: not a `*gate*.test.ts` file; the cited lines are inert
  seam scaffolding, not a pinned count or inventory.
- Recording-double check: the finding does not claim b0316's local
  `RecordingMutator` is a legitimate MUST-NOT-call witness being
  misjudged — it claims the opposite, that the class records nothing despite
  its name, and is never read (`mutator.calls` does not appear anywhere in
  the file; `grep -n "RecordingMutator\|mutator\." tests/b0316-match-scrutinee-inline-composite-ok-wrapped.test.ts`
  → only the declaration at line 245 and the one construction at line 311).
  The canonical helper module's own `RecordingMutator` IS a legitimate
  recording double and is not the subject of this claim.
- docs/bugs/ signature search: `grep -rl "RecordingMutator\|SEAM_NOOP_MUTATOR" docs/bugs/`
  → 0 hits; docs/bugs/0316-match-scrutinee-inline-composite-ok-wrapped.md
  does not name this scaffolding — not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0316-match-scrutinee-inline-composite-ok-wrapped" docs/reference/coverage-matrix.md`
  → 0 hits. This finding proposes no merge, rename, or deletion of the file
  or any `it()`/`describe()` block — only that two local scaffold
  declarations could be replaced by an existing import — so no citation is
  affected.
- Overlap check against already-filed/resolved topics: quality/resolved/PTQ-0594
  covers the identical shape (`span()`/`NOOP_CHECKPOINT`/`NOOP_SINK`
  redeclared instead of imported) for a different file,
  tests/effectful-statement-host.test.ts, and its own locations list does
  not cite tests/b0316-match-scrutinee-inline-composite-ok-wrapped.test.ts.
  quality/resolved/PTQ-0436 (b0316/b0317/b0318 parse-run-harness duplicated)
  covers this file's `runValue`/parse-harness usage, a disjoint scaffold from
  the sink/mutator pair claimed here — confirmed by re-reading its own
  Evidence section, which cites only `runPromptValue`/`parseTheta` call
  sites, not `NOOP_SINK`/`RecordingMutator`.
- Coverage check: the claim is about repeated/misnamed scaffold
  DEFINITIONS, not a missing test path; every cited symbol is exercised by
  this file's own currently-passing "EFFECT control" test.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all four excerpts reproduce verbatim (b0316:4 imports SEAM_NOOP_CHECKPOINT from invoke-seam-scaffold; b0316:245-251 `class RecordingMutator` with five empty bodies and :253-256 `NOOP_SINK`; scaffold :39-51 exports SEAM_NOOP_SINK/SEAM_NOOP_MUTATOR; b0307-empty-template-parity:1 imports the helper's genuine `.calls`-recording RecordingMutator), sed-extracted bodies diff against the scaffold exports as identical bar class-method vs object-literal trailing commas, both locals are live (`sink: NOOP_SINK` :278, `mutator: new RecordingMutator()` :311) and `.calls` is never read so the name asserts recording that does not happen (D7 copy-paste double + misleading name, same site, one fix: import); stated searches reproduce (grep RecordingMutator|mutator. → :245/:311 only; docs/bugs RecordingMutator|SEAM_NOOP_MUTATOR → 0; coverage-matrix → 0; not a *gate* file; no merge/rename/delete proposed); `grep -rln "class RecordingMutator" tests/*.test.ts` → b0316 is now the ONLY remaining local declaration after PTQ-0701/PTQ-0545 migrated every other copy. Not a duplicate: PTQ-0436 covers this file's parse/run harness only; PTQ-0594/0650/0655/0705/0720/0545 are the same not-migrated shape each confirmed per-file on disjoint files and none cites b0316; PTQ-0701's triage aside that this no-op class was "covered by the composition-producer filing" is inaccurate — PTQ-0545's locations list only tests/composition-producer.test.ts, so this site is untracked (triage: claude-fable-5-1)
