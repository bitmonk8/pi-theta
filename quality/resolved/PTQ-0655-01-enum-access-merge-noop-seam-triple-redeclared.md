---
id: PTQ-0655
title: params-default-enum-access-merge.test.ts redeclares the invoke-seam-scaffold NOOP_CHECKPOINT/NOOP_SINK/InertMutator triple instead of importing it
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/params-default-enum-access-merge.test.ts:420-437
  - tests/helpers/invoke-seam-scaffold.ts:29-46
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# params-default-enum-access-merge.test.ts redeclares the invoke-seam-scaffold NOOP_CHECKPOINT/NOOP_SINK/InertMutator triple instead of importing it

## Observation
tests/params-default-enum-access-merge.test.ts declares a module-scope
`NOOP_CHECKPOINT` (a `Checkpoint` whose `before()` resolves immediately), a
`NOOP_SINK` (a `ToolLoweringSink` whose two methods are no-ops), and a class
`InertMutator implements CommittedConversationMutator` whose five methods are
all no-ops, then wires all three into its own `inertExecuteDeps` builder.
tests/helpers/invoke-seam-scaffold.ts already exports the identical triple as
`SEAM_NOOP_CHECKPOINT`, `SEAM_NOOP_SINK` and `SEAM_NOOP_MUTATOR` — same field
shapes, same no-op bodies (a `const` object literal rather than a `class` for
the mutator, functionally identical). The helper module's own header states
this exact triple is "byte-for-byte identical across several
`executeBody`-driving invoke/code-call bug-witness files" and names its known
importers; this file is not among them.

## Evidence

tests/params-default-enum-access-merge.test.ts:420-437 (re-read immediately before filing):
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

The in-scope file's own `inertExecuteDeps` (lines 445-472) assembles
`checkpoint`, `sink` and `mutator` from exactly these three locally-declared
stand-ins, driving the same real `executeBody` /
`createEffectfulStatementHost` seam the helper's header describes as its
intended use.

## Why this is a problem
The three inert stand-ins the helper module centralises — a checkpoint whose
`before()` immediately resolves, a sink that discards diagnostics/system
notes, and a mutator whose five methods are all no-ops — are retyped locally
in this file rather than imported, with identical field names and identical
no-op bodies. This is duplication with the copy cited above against the
canonical source cited above; the helper's own header already documents the
class of files it consolidated this scaffolding from, and this file drives
the identical seam without joining that consolidation.

## Suggested direction (non-binding, optional)
Importing `SEAM_NOOP_CHECKPOINT`, `SEAM_NOOP_SINK` and `SEAM_NOOP_MUTATOR`
from tests/helpers/invoke-seam-scaffold.ts in place of the three local
declarations is the home the helper's own header, and its other named
importers, already point toward.

## False-positive check
- Gate-pin: tests/params-default-enum-access-merge.test.ts does not match
  `*gate*.test.ts` or a listed gate kin; the cited lines are inert seam
  stand-ins, not a pinned count or inventory.
- Recording-double: `NOOP_CHECKPOINT`/`NOOP_SINK`/`InertMutator` are inert
  no-op stand-ins for seams not under test at this file's call sites — the
  file's own comment states "every effect resolver throws rather than
  returning a double: a fixture that grew a tail would fail loudly here
  instead of quietly binding against a stub" — they record no calls and back
  no MUST-NOT-called witness, so the recording-double carve-out does not
  apply.
- docs/bugs/ signature search: `grep -rln "NOOP_CHECKPOINT\|InertMutator"
  docs/bugs/*.md` → no hits; no documented correct-reason red discusses this
  scaffolding duplication.
- coverage-matrix/bug-doc citation search: `grep -n
  "params-default-enum-access-merge" docs/reference/coverage-matrix.md
  docs/bugs/*.md` → the bug 0181 doc cites the file's role in reproducing the
  bug's cells, never the NOOP_CHECKPOINT/NOOP_SINK/InertMutator names. This
  finding proposes no merge, rename or deletion of any `it()`/`describe()` —
  only that three inert stand-ins could be imported rather than redeclared —
  so no citation is disturbed.
- Overlap check: `grep -rl "params-default-enum-access-merge"
  quality/intake/*.md quality/resolved/*.md` (run before writing this file)
  returned no hits; the sibling finding
  `qw20260917154546-d7-04-binder-args-invoke-seam-scaffold-not-migrated.md`
  names the identical triple in a different file
  (tests/inbound-boundary-binder-args.test.ts) only, so this is a new site of
  the same recurring class, not a re-filing.

## Triage
verdict: confirmed — independently reproduced: tests/params-default-enum-access-merge.test.ts:420-437 declares NOOP_CHECKPOINT/NOOP_SINK/InertMutator byte-identical (modulo `class`→`const`) to SEAM_NOOP_CHECKPOINT/SINK/MUTATOR exported at tests/helpers/invoke-seam-scaffold.ts:31-50 (2-line drift from cited 29-46), the file imports nothing from tests/helpers/ (helper's only importers are b0295/b0347/b0349), InertMutator is consumed solely as `new InertMutator()` at :469 (no subclass/instanceof making the class form load-bearing), and inertExecuteDeps() (:445-472) feeds the real createEffectfulStatementHost/ExecuteBodyDeps seam the helper header says it scaffolds — D7 copy-paste fixture/double, same per-file shape ratified in PTQ-0244 (b0349), PTQ-0301 (b0295), PTQ-0344 (b0347) and sibling d7-04 (binder-args), each a different file so not a duplicate; not a gate file, not a recording double, no it()/describe() merged/renamed/deleted so the many docs/bugs citations of the file (0181/0185/0186/0197 etc., none naming the triple) are undisturbed; docs/bugs grep for NOOP_CHECKPOINT|InertMutator → 0 hits confirmed (triage: claude-fable-5-1)
