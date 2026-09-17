---
id: pending
title: Binder cancellation retry budgets are hardcoded beside the authoritative MAX constant
lens: D4
status: intake
verdict: pending
locations:
  - src/binder/retry-taxonomy.ts:39-44
  - src/binder/binder-cancellation.ts:93-104
sites: 2
fix_scope: module
d4_class: parallel
wave: qw20260917095931
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-17
---

# Binder cancellation retry budgets are hardcoded beside the authoritative MAX constant

## Observation
`retry-taxonomy.ts` owns the canonical binder retry budget constant
`MAX_BINDER_LLM_CALLS = 3`, documented as "1 initial attempt + at most 1
transport-class retry + at most 1 malformed-envelope-class retry". The actual
retry loop in `runBinderCallWithCancellation` re-creates that budget with two
local variables (`transportBudget = 1`, `malformedBudget = 1`) and a comment
referring to `MAX_BINDER_LLM_CALLS`, but it never imports or reads the constant.

## Evidence

### `src/binder/retry-taxonomy.ts:39-44`
```ts
/**
 * The worst-case binder LLM-call budget per slash invocation
 * (HC3-d): 1 initial attempt + at most 1 transport-class retry + at most 1
 * malformed-envelope-class retry.
 */
export const MAX_BINDER_LLM_CALLS = 3;
```

### `src/binder/binder-cancellation.ts:93-104`
```ts
  // The V11f per-class retry budget (HC3-a / HC3-b), re-driven here so the
  // cancellation checks can suppress any remaining retry between attempts.
  let transportBudget = 1;
  let malformedBudget = 1;
  let callCount = 0;

  // Bounded by the V11f budget: each retry consumes one of the two single
  // budgets, so the loop issues at most 1 initial + 1 transport + 1 malformed
  // attempt (MAX_BINDER_LLM_CALLS) before terminating.
  for (;;) {
```

## Why this is a problem
This is load-bearing parallel truth: the loop's behavior and the documented
budget constant must describe the same maximum call count. Because the loop
does not derive its budgets from `MAX_BINDER_LLM_CALLS`, they can drift:

- If the constant is raised without updating the two `= 1` budgets, the loop
  will still terminate after at most 3 calls, making the constant a lie.
- If one budget is raised without updating the constant and the other budget,
  the loop can issue more calls than the hard-ceiling spec allows, or can
  consume the wrong retry class.

The relationship is currently enforced only by comments and code review, not by
a single source of truth.

## Suggested direction (non-binding, optional)
The cancellation loop should import `MAX_BINDER_LLM_CALLS` and derive its
per-class budgets from it, or both should read from a shared retry-budget
configuration.

## False-positive check
- `clone-scan.mjs` map shows no clone groups in `binder-cancellation.ts` or
  `retry-taxonomy.ts`.
- `MAX_BINDER_LLM_CALLS` is exported and used by `tests/binder-retry-taxonomy.test.ts`,
  but `binder-cancellation.ts` does not import it.
- Both copies are live production code; not dead code, not generated, not in
  `tests/`.

## Triage
verdict: duplicate — same root cause as resolved PTQ-0290-retry-budget-reimplemented-uncoupled.md, which already cited the comment-only MAX_BINDER_LLM_CALLS reference at binder-cancellation.ts:102 and the independently hardcoded `= 1` budgets; the human ruling (fix commit 7ef57e4c) made runBinderCallWithCancellation the ONE budget implementation, kept the constant exported with tests/binder-retry-taxonomy.test.ts:153 (HC3-d, `s.calls() === MAX_BINDER_LLM_CALLS` against the production driver) as the coupling witness, and explicitly made deriving the budgets from the constant "permitted, not required" — the residual re-filed here was already before the human and ruled optional (triage: claude-fable-5-1)
