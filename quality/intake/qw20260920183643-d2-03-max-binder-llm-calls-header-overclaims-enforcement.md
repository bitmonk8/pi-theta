---
id: pending
title: retry-taxonomy.ts header claims runBinderCallWithCancellation enforces MAX_BINDER_LLM_CALLS, but that function never reads the constant
lens: D2
status: intake
verdict: pending
locations:
  - src/binder/retry-taxonomy.ts:4-18
  - src/binder/binder-cancellation.ts:94-103
sites: 1
fix_scope: cross-module
wave: qw20260920183643
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-20
---

# retry-taxonomy.ts header claims runBinderCallWithCancellation enforces MAX_BINDER_LLM_CALLS, but that function never reads the constant

## Observation
`retry-taxonomy.ts`'s module header states that `runBinderCallWithCancellation`
(in `binder-cancellation.ts`) "is the ONE implementation of the HC3 per-class
retry budget" and that this module "defines the `MAX_BINDER_LLM_CALLS` budget
constant it enforces". `binder-cancellation.ts` does not import
`MAX_BINDER_LLM_CALLS` at all; it hardcodes two separate local budget counters
(`transportBudget = 1`, `malformedBudget = 1`) whose sum coincides with the
constant's value (`3`) only because both were authored to agree, not because
either reads the other.

## Evidence
`src/binder/retry-taxonomy.ts:4-18`:
```ts
// `runBinderCallWithCancellation` (binder-cancellation.ts) is the ONE
// implementation of the HC3 per-class retry budget (PTQ-0290); this module
// defines the `MAX_BINDER_LLM_CALLS` budget constant it enforces and renders
// the six failure-mode templates through the shared V11e system-note
// discipline:
//
//   - `MAX_BINDER_LLM_CALLS` — the HC3-d hard ceiling
//     (determinism-cancellation-failure.md §"Per-invocation retry budget",
//     hard-ceilings/ceilings-3-and-4.md §HC3): at most 3 budgeted binder
//     ATTEMPTS per slash invocation (1 initial + at most 1 transport-class
//     retry (HC3-a) + at most 1 malformed-envelope-class retry (HC3-b)),
//     enforced by `runBinderCallWithCancellation`. Each attempt issues at
```

`src/binder/retry-taxonomy.ts:51`:
```ts
export const MAX_BINDER_LLM_CALLS = 3;
```

`src/binder/binder-cancellation.ts:33-36` (the only imports from
`retry-taxonomy.ts`):
```ts
import type { BinderAttemptOutcome } from "./retry-taxonomy";
import { renderBinderSystemNote } from "./retry-taxonomy";
```

`src/binder/binder-cancellation.ts:94-103` (the budget itself, hardcoded, with
the constant named only in a comment):
```ts
  let transportBudget = 1;
  let malformedBudget = 1;
  let callCount = 0;

  // Bounded by the V11f budget: each retry consumes one of the two single
  // budgets, so the loop issues at most 1 initial + 1 transport + 1 malformed
  // attempt (MAX_BINDER_LLM_CALLS) before terminating.
  for (;;) {
```

## Why this is a problem
The header names a specific collaborator relationship — "this module defines
the `MAX_BINDER_LLM_CALLS` budget constant it [`runBinderCallWithCancellation`]
enforces" — that does not hold in code: `binder-cancellation.ts` imports only
`BinderAttemptOutcome` and `renderBinderSystemNote` from `retry-taxonomy.ts`
(confirmed by its two-line import block), never `MAX_BINDER_LLM_CALLS`. The
actual budget is two independently hardcoded literals (`1` and `1`) whose sum
happens to equal the constant. A change to `MAX_BINDER_LLM_CALLS` would not
propagate to `runBinderCallWithCancellation`'s behaviour, contradicting the
header's "enforces" claim and the constant's own doc comment ("every consumer
counts attempts through it", `retry-taxonomy.ts:55-56`).

## Suggested direction (non-binding, optional)
Either have `binder-cancellation.ts` derive its per-class budgets from
`MAX_BINDER_LLM_CALLS` (so the constant is genuinely the single source of
truth the header describes), or narrow the header's claim to describe the
current numeric coincidence rather than an enforced import relationship.

## False-positive check
- `grep -rn "MAX_BINDER_LLM_CALLS" src`: the declaration
  (`retry-taxonomy.ts:51`), its own doc comments, and one prose-only comment
  reference inside `binder-cancellation.ts:102` — no import, no runtime read.
- `grep -rn "MAX_BINDER_LLM_CALLS" tests`: only
  `tests/binder-retry-taxonomy.test.ts`, which imports the constant to assert
  the *observed* call count equals it (`expect(s.calls()).toBe(MAX_BINDER_LLM_CALLS)`),
  not to verify that `binder-cancellation.ts` reads it — the test would pass
  identically if the constant's value and the hardcoded budgets drifted apart
  only in one direction (adding a third retry-eligible class would not be
  caught by this constant since `binder-cancellation.ts` never references it).
- Read `binder-cancellation.ts` in full: confirmed its only two module-level
  imports from `retry-taxonomy.ts` are `BinderAttemptOutcome` (type) and
  `renderBinderSystemNote`.

## Triage
