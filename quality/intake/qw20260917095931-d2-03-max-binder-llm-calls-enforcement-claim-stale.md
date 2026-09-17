---
id: pending
title: retry-taxonomy.ts header claims MAX_BINDER_LLM_CALLS is enforced by runBinderCallWithCancellation, but that function never references the constant
lens: D2
status: intake
verdict: pending
locations:
  - src/binder/retry-taxonomy.ts:4-16
  - src/binder/retry-taxonomy.ts:38-44
  - src/binder/binder-cancellation.ts:33-36
  - src/binder/binder-cancellation.ts:94-107
sites: 1
fix_scope: localized
wave: qw20260917095931
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# retry-taxonomy.ts header claims MAX_BINDER_LLM_CALLS is enforced by runBinderCallWithCancellation, but that function never references the constant

## Observation
`retry-taxonomy.ts`'s module header states that the module "defines the `MAX_BINDER_LLM_CALLS` budget constant" and that this budget is "enforced by `runBinderCallWithCancellation`" (binder-cancellation.ts). `runBinderCallWithCancellation`, however, imports nothing from retry-taxonomy.ts except the `BinderAttemptOutcome` type and `renderBinderSystemNote`; it never imports or reads `MAX_BINDER_LLM_CALLS`. Its retry ceiling is instead built from two independently-declared local budget variables (`transportBudget = 1`, `malformedBudget = 1`) whose sum with the implicit unconditional initial attempt happens to equal the constant's value of `3`, with no code-level link between the two.

## Evidence
`src/binder/retry-taxonomy.ts:4-16` — the header's enforcement claim:
```ts
// `runBinderCallWithCancellation` (binder-cancellation.ts) is the ONE
// implementation of the HC3 per-class retry budget (PTQ-0290); this module
// defines the `MAX_BINDER_LLM_CALLS` budget constant it enforces and renders
// the six failure-mode templates through the shared V11e system-note
// discipline:
//
//   - `MAX_BINDER_LLM_CALLS` — the HC3-d hard ceiling
//     (determinism-cancellation-failure.md §"Per-invocation retry budget",
//     hard-ceilings/ceilings-3-and-4.md §HC3): at most 3 binder LLM calls per
//     slash invocation (1 initial attempt + at most 1 transport-class retry
//     (HC3-a) + at most 1 malformed-envelope-class retry (HC3-b)), enforced by
//     `runBinderCallWithCancellation`.
```

`src/binder/retry-taxonomy.ts:38-44` — the constant itself:
```ts
/**
 * The worst-case binder LLM-call budget per slash invocation
 * (HC3-d): 1 initial attempt + at most 1 transport-class retry + at most 1
 * malformed-envelope-class retry.
 */
export const MAX_BINDER_LLM_CALLS = 3;
```

`src/binder/binder-cancellation.ts:33-36` — the complete import list of the function the header names as the enforcer, containing no reference to `MAX_BINDER_LLM_CALLS`:
```ts
import type { BinderAttemptOutcome } from "./retry-taxonomy";
import { renderBinderSystemNote } from "./retry-taxonomy";
```

`src/binder/binder-cancellation.ts:94-107` — the actual budget logic, built from two local literals rather than the constant:
```ts
  // The V11f per-class retry budget (HC3-a / HC3-b), re-driven here so the
  // cancellation checks can suppress any remaining retry between attempts.
  let transportBudget = 1;
  let malformedBudget = 1;
  let callCount = 0;

  // Bounded by the V11f budget: each retry consumes one of the two single
  // budgets, so the loop issues at most 1 initial + 1 transport + 1 malformed
  // attempt (MAX_BINDER_LLM_CALLS) before terminating.
```

Search: `grep -rln "MAX_BINDER_LLM_CALLS" src/ tests/` returns exactly three files: `src/binder/retry-taxonomy.ts` (the definition), `src/binder/binder-cancellation.ts` (a comment mentioning the name, no import/reference), and `tests/binder-retry-taxonomy.test.ts` (the only file that imports and reads the constant's value).

## Why this is a problem
The header's own worded claim — that this module "defines the constant it [runBinderCallWithCancellation] enforces" — describes a code-level dependency (the enforcing function consuming the constant) that does not exist: the two files never share this value through code, only through independently-maintained literals whose sum is expected to keep matching `MAX_BINDER_LLM_CALLS` by convention. A header naming an enforcement relationship between two pieces of code that has no actual reference between them is exactly the "miscounts its call sites or collaborators" shape called out as in-scope even when the surrounding code (the retry budget itself) is deliberate.

## Suggested direction (non-binding, optional)
Either have `runBinderCallWithCancellation` derive its two per-class budgets from `MAX_BINDER_LLM_CALLS` (or a decomposition of it) so the header's claimed linkage is real, or soften the header's "enforced by" wording to describe the two budgets as independently maintained under the same documented ceiling.

## False-positive check
- `grep -n "MAX_BINDER_LLM_CALLS" src/binder/binder-cancellation.ts` — one hit, inside a comment, not an import or expression.
- `grep -n "import" src/binder/binder-cancellation.ts` (top of file) — confirms the only two imports from retry-taxonomy.ts are `BinderAttemptOutcome` (type) and `renderBinderSystemNote`.
- `grep -rln "MAX_BINDER_LLM_CALLS" src/ tests/` — confirms the constant's value is consumed by exactly one file, the test file, not by the function the header names as its enforcer.
- Checked git-blame-adjacent context (the PTQ-0290 cross-reference in the header) to confirm the header text is current prose, not leftover pre-fix narration describing a since-removed import.

## Triage
verdict: false-positive — the header's "enforced by runBinderCallWithCancellation" is a behavioural claim that is true and test-witnessed (tests/binder-retry-taxonomy.test.ts:141-155 HC3-d drives runBinderCallWithCancellation and asserts s.calls() === MAX_BINDER_LLM_CALLS), not a claim that the driver imports the constant; the header text was written in the PTQ-0290 fix commit 7ef57e4c implementing the human ruling that explicitly kept the constant exported, kept the HC3-d cell as the coupling witness, and made naming the two budget literals "permitted, not required" — the absent code-level link is the ratified design (quality/resolved/PTQ-0290), not stale narration (triage: claude-fable-5-1)
