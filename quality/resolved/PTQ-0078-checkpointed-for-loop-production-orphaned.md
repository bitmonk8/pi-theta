---
id: PTQ-0078
title: checkpoint-granularity's header claims the module owns both per-site checkpoint wirings, but the interpreter fires the loop-iter checkpoint through its own private helper and runCheckpointedForLoop has no production caller
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/checkpoint-granularity.ts:3-16
  - src/runtime/checkpoint-granularity.ts:72-95
  - src/runtime/statement-executor.ts:2271-2278
sites: 3                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# checkpoint-granularity's header claims the module owns both per-site checkpoint wirings, but the interpreter fires the loop-iter checkpoint through its own private helper and runCheckpointedForLoop has no production caller

## Observation
The module header of `src/runtime/checkpoint-granularity.ts` states that the
module "owns the two cycle-free per-site checkpoint wirings" and describes
`runCheckpointedForLoop` as the `for`/`while` loop-iteration site the
interpreter awaits. In current code the production interpreter never routes a
loop through this module: `statement-executor.ts` fires the `loop-iter`
checkpoint through its own private `loopIterCheckpoint` helper, and the only
callers of `runCheckpointedForLoop` (and its `CheckpointedLoopHost` input) are
two test files. The binder half (`runCheckpointedBinderCall`) is
production-consumed (production-theta-producer.ts), so the ownership claim
holds for exactly one of the two wirings the header names.

## Evidence
src/runtime/checkpoint-granularity.ts:3-13 (present-tense ownership and
interpreter-routing claim):
```
// This module owns the two cycle-free per-site checkpoint wirings V17c is
// responsible for, both observable through the V8a `Checkpoint` seam (PIC-10)
// alone, independent of the V17a forwarding contract:
//
//   - `runCheckpointedForLoop` — the `for`/`while` loop-iteration site (the loop
//     construct V3c introduces). The interpreter awaits
//     `checkpoint.before("loop-iter", site)` immediately before each iteration
//     of the body, then reads `signal.aborted` and stops iterating once the
//     signal has fired.
```

src/runtime/statement-executor.ts:2271-2278 — the wiring the production
interpreter actually executes for `for`/`while` (its callers are
`executeWhile` / `executeFor` in the same file); it does not import anything
from checkpoint-granularity.ts:
```ts
async function loopIterCheckpoint(site: CheckpointSite, deps: ExecuteBodyDeps): Promise<boolean> {
  await deps.checkpoint.before("loop-iter", site);
  if (deps.signal.aborted) {
    handlePartialTerminalOutcome({ path: "cancelled", mode: deps.mode, committed: [] }, deps.mutator);
    return true;
  }
  return false;
}
```

Reference searches (exact commands and hit counts):
- `grep -rln "runCheckpointedForLoop" src/ extensions/ tools/ tests/` → 3
  files: src/runtime/checkpoint-granularity.ts (definition),
  tests/checkpoint-granularity.test.ts, tests/no-rollback.test.ts. Zero
  production callers.
- `grep -rln "CheckpointedLoopHost" src/ extensions/ tools/ tests/` → the
  definition plus tests/checkpoint-granularity.test.ts only.
- `grep -rn '"loop-iter"' src/` → checkpoint-granularity.ts (definition and
  comments), src/runtime/statement-executor.ts:2272 (the production fire),
  src/seams/checkpoint.ts:9 and src/seams/production-checkpoint.ts:28 (the
  seam's kind list / macrotask yield). No production path reaches the fire in
  this module.
- `grep -rln "runCheckpointedBinderCall" src/` →
  src/extension/production-theta-producer.ts (production-consumed), showing
  the asymmetry between the two halves.

## Why this is a problem
Stale narration: the header's ownership claim ("This module owns the two ...
checkpoint wirings", "The interpreter awaits ...") describes a wiring
relationship the production code does not have — the interpreter implements
the loop-iteration checkpoint privately in statement-executor.ts and consumes
only the binder half of this module. A reader tracing how a production loop
observes cancellation is pointed at `runCheckpointedForLoop`, which no
production code path executes. This is the same claim/current-code mismatch
shape as the already-filed cancellation-core substrate finding
(qw20260907130901-d2-03-substrate-swallowing-shared-claim-stale), at a module
that finding does not cover.

## Suggested direction (non-binding, optional)
Scope the header's ownership sentence to what production consumes (the binder
half), stating that the loop half is the seam's test-witnessed form while the
interpreter's loop wiring lives in statement-executor.ts — or route the
interpreter's loop path through the module so the claim becomes true again;
the fix stage owns the choice.

## False-positive check
- Deadness searches: identifier grep for `runCheckpointedForLoop` and
  `CheckpointedLoopHost` across src/, extensions/, tools/, tests/ (results
  above); string-keyed/dynamic access is not plausible for these (no string
  spelling of either name outside the module: `grep -rn
  "runCheckpointedForLoop" --include="*.ts"` shows only the import/call sites
  listed); no re-export barrel exports them (`grep -rn "checkpoint-granularity"
  src/` → no re-export file).
- Test-only callers: tests/checkpoint-granularity.test.ts and
  tests/no-rollback.test.ts DO call `runCheckpointedForLoop`, so the function
  is NOT dead under this repository's witness-test rule — this finding
  therefore claims stale ownership narration, not dead code.
- Git intent: `git log --oneline -S "runCheckpointedForLoop" -- src/` → one
  commit (`34e6f727 V17c-T — checkpoint granularity tests (paired V17c
  impl)`); no commit ever wired it into the interpreter, so the header's
  routing claim never matched a production consumer.
- Overlap check: the wave's stub-narration finding
  (qw20260907183353-d2-01-render-runtime-stub-narration-stale) cites
  checkpoint-granularity.ts:27-34/:69-70/:100-101 (the "stubs ... inertly"
  paragraphs); this finding cites :3-16 (the ownership claim) — different
  lines, different root cause (implemented-vs-stub versus who-owns-the-wiring).

## Triage
verdict: confirmed — header lines 3-16 verified verbatim (blame: 34e6f727 V17c-T, never updated) while runCheckpointedForLoop/CheckpointedLoopHost have zero production callers (only tests/checkpoint-granularity.test.ts and tests/no-rollback.test.ts, no re-export barrel) and the production loop-iter fire is statement-executor.ts:2271-2278's private loopIterCheckpoint called from executeWhile:2297/executeFor:2356 with no checkpoint-granularity import, the binder half alone being production-wired at production-theta-producer.ts:213/1074; filed as narration cruft (in D2 scope) not deadness, and distinct from d2-01's stub-narration lines 27-34/69-70/100-101 (triage: claude-opus-5)
