---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: runCancellableSequence's multi-statement, named-binding generality is unused by production — both call sites pass one statement bound to the constant "_effect" and read only outcome.result
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/cancellation-core.ts:344-357
  - src/runtime/cancellation-core.ts:359-373
  - src/runtime/cancellation-core.ts:388-420
  - src/runtime/statement-executor.ts:1240-1250
  - src/runtime/statement-executor.ts:1583-1593
sites: 5                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# runCancellableSequence's multi-statement, named-binding generality is unused by production — both call sites pass one statement bound to the constant "_effect" and read only outcome.result

## Observation
`runCancellableSequence` is built for sequences: it loops over
`_statements`, keys each result into a `bindings` map by the statement's
`binding` name, and returns `{ bindings, result, synthesizedTopLevelCancelled }`.
Production has exactly two call sites, both in statement-executor.ts, and both
pass a single-element array whose one statement's `binding` is the literal
`"_effect"`, then read only `outcome.result`. The `bindings` map (keyed by a
constant the caller never looks up), the per-statement loop beyond the first
element, and the `synthesizedTopLevelCancelled` flag are computed and
discarded on every production call. A statement-executor comment records this
as a settled decision: each checkpointed effect is its own single-statement
sequence.

## Evidence
src/runtime/cancellation-core.ts:344-349 and :359-373 — the generality surface
(named bindings, accumulated map, synthesis flag):
```ts
export interface CancellableStatement {
  readonly binding: string;
  readonly kind: CheckpointKind;
  readonly site: CheckpointSite;
  run(): Promise<OperationResult>;
}
```
```ts
export interface CancellableSequenceOutcome {
  readonly bindings: ReadonlyMap<string, OperationResult>;
  readonly result: OperationResult;
  readonly synthesizedTopLevelCancelled: boolean;
}
```
(field doc-comments elided; `bindings.set(statement.binding, result)` is at
:412 inside the `for (const statement of _statements)` loop, :388-420.)

src/runtime/statement-executor.ts:1240-1250 — production call site 1 (the
sole reads of the outcome are `outcome.result`):
```ts
  const statement: CancellableStatement = {
    binding: "_effect",
    kind: checkpoint.kind,
    site: checkpoint.site,
    run: () => deps.host.runEffect(expr, env, preArgs.args, deps.invokeChain),
  };
  const outcome = await runCancellableSequence(
    { checkpoint: deps.checkpoint, signal: deps.signal },
    [statement],
  );
  const result = outcome.result;
```

src/runtime/statement-executor.ts:1583-1593 — production call site 2,
byte-similar (`binding: "_effect"`, `[statement]`, `const result =
outcome.result;`).

Search accounting (exact commands, all hits):
- `grep -rn "runCancellableSequence" src/ extensions/ tools/` → definition
  (cancellation-core.ts:388) plus statement-executor.ts (import :54, calls
  :1246 and :1591, comments :8/:96/:116/:119/:181/:993/:1226). No other
  production caller.
- `grep -rn '"_effect"' src/ tests/` → exactly the two production statement
  constructions cited above (:1241, :1584).
- `grep -n "outcome\." src/runtime/statement-executor.ts` → the only member
  reads on these two outcomes are `.result` (:1250, :1593); other `outcome.`
  hits in the file belong to a different local of the par-for path.
- `grep -rn "synthesizedTopLevelCancelled" src/ tests/` → the field
  declaration (:371) and its two writers (:408, :419) in cancellation-core.ts,
  plus one reader in tests/cancellation-core.test.ts:494. Zero production
  readers.
- `outcome.bindings` readers: tests/cancellation-core.test.ts:452 and
  tests/no-rollback.test.ts:359 only. Zero production readers.

## Why this is a problem
Speculative generality with the user count on record: the sequence
abstraction's distinguishing features — N statements, author-named bindings,
the accumulated `bindings` map, the `synthesizedTopLevelCancelled` verdict —
have zero production users; both production instantiations are the degenerate
single-statement form with a constant placeholder name and consume only
`result`. No second production user is in sight, by the caller's own recorded
decision (statement-executor.ts:1228-1230: "Each checkpointed effect is its
own single-statement sequence so a preceding effect's completed `Err`
short-circuits the walk before the next effect is entered (see notes.md —
per-effect sequencing decision)."). Every production dispatch pays the map
allocation and flag bookkeeping for channels only tests read.

## Suggested direction (non-binding, optional)
The seam could shrink toward what its production callers consume — a
checkpoint-gated single-operation runner returning the operation's result —
with the CNCL-5/CNCL-6 witness assertions restated over that surface; whether
the spec-witness tests keep pinning the sequence form is the fix stage's call.

## False-positive check
- Deadness is NOT claimed: tests/cancellation-core.test.ts (CNCL-5/CNCL-6
  cells, reading `outcome.bindings` :445-452 and
  `outcome.synthesizedTopLevelCancelled` :486-494) and
  tests/no-rollback.test.ts (:346-359, a multi-statement sequence with
  `binding: "toolResult"`) exercise the general form; under this repository's
  witness-test rule those are legitimate callers, so the finding is scoped to
  the production-side unused generality, with all production call sites cited.
- Vestigial-parameter framing checked and rejected for the strict reading:
  test call sites pass varying `binding` names, so "every call site passes the
  same value" holds only across production sites (both `"_effect"`); the
  finding states the production-only quantifier explicitly.
- Dynamic access: `grep -rn "\.bindings" src/runtime/` → no read of a
  `CancellableSequenceOutcome`'s map anywhere in src; no string-keyed access
  to `"synthesizedTopLevelCancelled"` outside the module and the one test.
- Re-exports: no barrel re-exports cancellation-core symbols (`grep -rn
  "from \"./cancellation-core\"" src/` → statement-executor.ts only, plus
  producer imports of unrelated symbols from the same module).
- Spec-intent check: cancellation.md CNCL-5/CNCL-6 pin retention and
  tail-abort semantics, which the tests witness through these fields; the
  finding does not dispute the semantics, only that the production graph never
  consumes the sequence-shaped surface that carries them.
- Overlap check: qw20260907130901-d2-02-swallow-route-unread-inputs covers the
  invoke/query swallowing-handler route functions;
  qw20260907130901-d2-03-substrate-swallowing-shared-claim-stale covers
  cancellation-core:221-296 (the abandonable-substrate section). Neither cites
  the CNCL-5/CNCL-6 sequence runner (:344-420) or the statement-executor call
  sites.

## Triage
