---
id: PTQ-0290
title: The HC3 per-class retry-budget state machine is independently re-implemented in binder-cancellation.ts with no shared constant or test tying it to retry-taxonomy.ts's driver
lens: D4                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/binder/binder-cancellation.ts:81-137
  - src/binder/retry-taxonomy.ts:270-297
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: parallel            # D4 only: clone | drift | parallel
wave: qw20260912204251
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-12
---

# The HC3 per-class retry-budget state machine is independently re-implemented in binder-cancellation.ts with no shared constant or test tying it to retry-taxonomy.ts's driver

## Observation

`retry-taxonomy.ts`'s `runBinderWithRetries` and `binder-cancellation.ts`'s
`runBinderCallWithCancellation` each independently implement the HC3
per-slash-invocation retry-budget state machine (hard-ceilings/ceilings-3-and-4.md
§HC3): a `transportBudget` of 1 and a `malformedBudget` of 1, interleaved over
successive attempts, switching on the same two `BinderAttemptOutcome.kind`
values (`"transport"`, `"malformed"`). Only `runBinderCallWithCancellation` is
imported by production (`extension/production-theta-producer.ts:219,1114`);
`runBinderWithRetries` has no production caller anywhere in `src/` — its only
callers are its own test file.

## Evidence

src/binder/retry-taxonomy.ts:270-297 — the budget driver with no caller
outside its own tests:

```ts
export async function runBinderWithRetries(
  input: BinderRetryInput,
): Promise<BinderRetryResult> {
  let transportBudget = 1;
  let malformedBudget = 1;
  let callCount = 0;

  for (;;) {
    const outcome = await input.attempt(callCount);
    callCount += 1;

    if (outcome.kind === "transport" && transportBudget > 0) {
      transportBudget -= 1;
      continue;
    }
    if (outcome.kind === "malformed" && malformedBudget > 0) {
      malformedBudget -= 1;
      continue;
    }
    return { callCount, outcome };
  }
}
```

src/binder/binder-cancellation.ts:81-137 — the production driver, re-deriving
the identical two budgets:

```ts
export async function runBinderCallWithCancellation(
  input: BinderCallInput,
): Promise<BinderCallResult> {
  const { thetaName, signal, attempt } = input;

  const cancelled = (): BinderCallResult => ({
    kind: "cancelled",
    note: renderBinderSystemNote(thetaName, { kind: "cancelled" }),
  });

  // The V11f per-class retry budget (HC3-a / HC3-b), re-driven here so the
  // cancellation checks can suppress any remaining retry between attempts.
  let transportBudget = 1;
  let malformedBudget = 1;
  let callCount = 0;

  for (;;) {
    if (signal.aborted) {
      return cancelled();
    }
    const outcome = await attempt(callCount, signal);
    callCount += 1;
    if (signal.aborted) {
      return cancelled();
    }
    if (outcome.kind === "transport" && transportBudget > 0) {
      transportBudget -= 1;
      continue;
    }
    if (outcome.kind === "malformed" && malformedBudget > 0) {
      malformedBudget -= 1;
      continue;
    }
    return { kind: "completed", outcome };
  }
}
```

Diff verdict: **renamed/reshaped, not literal clone** — the budget
declarations and the two `if (outcome.kind === ... && ...Budget > 0)` arms are
identical in shape and value; the surrounding cancellation checks and the
return-value shape differ enough that a token-window clone scanner does not
flag it (the shard's clone map reports "no clone groups" for both files). This
is the "mirrored logic below the scanner's token-window floor" case named in
the brief, not a literal clone.

No shared source of truth: `MAX_BINDER_LLM_CALLS` (the named, exported
constant for the 3-call ceiling, `retry-taxonomy.ts:46`) is referenced only
inside a *comment* in `binder-cancellation.ts:102`, never imported — `grep -n
"MAX_BINDER_LLM_CALLS" src/binder/binder-cancellation.ts` matches only that
comment. The two budget values (`1`, `1`) are separately hardcoded literals in
both files.

Split test coverage: `tests/binder-retry-taxonomy.test.ts` pins the full
HC3-a/b/d/e interleaving behavior (all-transport exhausts at 2 calls,
all-malformed at 2 calls, an interleaved transport→malformed→transport chain
at exactly 3 calls, most-recent-failure-wins) against `runBinderWithRetries`
— the copy with no production caller. `tests/binder-call-cancellation.test.ts`
— the test file for the copy production actually calls — contains exactly 3
tests, all built around a mid-flight abort; none exercises the no-abort
budget-interleaving arms (an all-transport or interleaved chain with no
cancellation) against `runBinderCallWithCancellation`. `grep -n
"transport\|malformed\|budget"` over `tests/production-cancellation-wiring.test.ts`
(the other file importing production's binder-call path) returns zero hits.

## Why this is a problem

This is load-bearing, not incidental: HC3's budget numbers are a hard ceiling
(hard-ceilings/ceilings-3-and-4.md §HC3, "the runtime MUST issue at most 3
binder LLM calls per slash invocation"), and both copies must independently
enforce the identical 1-transport/1-malformed interleave for that MUST to
hold on the path production actually runs. Counted: `runBinderCallWithCancellation`
today covers 2 of the 2 retry-eligible `BinderAttemptOutcome` kinds
(`transport`, `malformed`) at the same budget-of-1 as `runBinderWithRetries` —
full parity, verified by re-reading both bodies above — but nothing enforces
that parity going forward. If a future spec revision changes either budget
(e.g. HC3-a's single retry widened to two), a fix applied only to
`runBinderWithRetries` — the function retry-taxonomy.ts's own module header
still calls "the per-class retry budget driver" and the one
`tests/binder-retry-taxonomy.test.ts` exhaustively re-pins — would leave
`runBinderCallWithCancellation`, the actual production driver, silently on
the old budget, and the full, green HC3-a/b/d/e test suite would keep passing
throughout because it drives the copy nobody calls.

## Suggested direction (non-binding, optional)

A single shared source of truth for the budget state machine (hypothesis) —
e.g. `runBinderCallWithCancellation` driving its loop through
`runBinderWithRetries`'s own budget bookkeeping (or a shared helper both call)
rather than re-declaring `transportBudget`/`malformedBudget` — would let one
test suite cover both the interleaving rule and its interaction with
cancellation.

## False-positive check

- Both-copies-live check: `runBinderCallWithCancellation` is imported at
  `extension/production-theta-producer.ts:219` and called at `:1114`.
  `runBinderWithRetries` has no `src/`/`extensions/`/`tools/` importer (`grep
  -rn "runBinderWithRetries" src extensions tools` returns only its own
  declaration and doc-comment in `retry-taxonomy.ts`), but it is directly
  imported and exercised by `tests/binder-retry-taxonomy.test.ts` (5 assertions
  against `result.callCount`/`result.outcome`), so it is a witness-tested
  reference implementation, not a dead copy (D2's carve-out for
  tests-are-callers applies; this is not routed to D2).
- Constant-sharing check: `grep -n "MAX_BINDER_LLM_CALLS"
  src/binder/binder-cancellation.ts` — one hit, inside a comment, not an
  import; the two `let ...Budget = 1` pairs are independently spelled literals
  in both files (line-cited above).
- Prior-discussion check: `docs/bugs/0066-ajv-verdict-discarded-unreachable-enforcement.md`'s
  §Non-goals lists "`runBinderWithRetries`'s absent caller" and states "the
  budget it implements is re-driven by `runBinderCallWithCancellation`;
  nothing is lost. Deleting or re-pointing it is cleanup, not a defect fix" —
  that discussion is about whether keeping the uncalled function is itself a
  defect (a D2-shaped question, answered "no, cleanup"); it does not address
  the distinct D4 concern raised here, that the two copies' *budget values and
  interleaving logic* have no shared identifier or cross-checking test tying
  them together going forward. `PTQ-0115-binder-call-result-callcount-unread.md`
  (resolved) is a different field-level dead-code finding on the same
  function pair, not this parallel-implementation concern.
- Clone-map re-check: both files report "(no clone groups)" in this shard's
  map; re-read at the cited spans immediately before filing confirms the
  shape match the map's token window did not surface.

## Triage
verdict: questionable — reality reproduces exactly (excerpts match at cited lines, clone-scan map genuinely shows "(no clone groups)" for both files, MAX_BINDER_LLM_CALLS greps to one comment hit, production-cancellation-wiring.test.ts greps to zero transport/malformed/budget hits, and the counted parity claim — runBinderCallWithCancellation covers 2 of 2 retry-eligible kinds at budget-of-1, matching runBinderWithRetries — holds); d4_class: parallel is capped at questionable by design (a shared source of truth is a human ruling, never confirmed) (triage: claude-opus-5)
verdict: questionable — independently re-verified from scratch: both excerpts match at the cited ranges, runBinderWithRetries has zero callers in src/extensions/tools (only tests/binder-retry-taxonomy.test.ts imports it, and its 5 tests pin HC3-a/b/d/e exactly as described), MAX_BINDER_LLM_CALLS greps to one comment-only hit in binder-cancellation.ts, both files' clone-scan maps report only "(no clone groups)" throughout, binder-call-cancellation.test.ts is exactly 3 abort-only tests and production-cancellation-wiring.test.ts greps to zero transport/malformed/budget hits, and BinderAttemptOutcome's 6 kinds confirm the counted parity (both drivers cover the same 2 of 2 retry-eligible kinds at budget-of-1); d4_class: parallel correctly caps this at questionable since a shared source of truth is a human design ruling, never a triage confirmation (triage: claude-opus-5)
verdict: confirmed — RATIFIED (human, 2026-09-13): the production driver runBinderCallWithCancellation (src/binder/binder-cancellation.ts) is the ONE implementation of the HC3 per-class retry budget. Delete runBinderWithRetries from src/binder/retry-taxonomy.ts (and BinderRetryInput / BinderRetryResult if nothing else consumes them); re-point the five HC3-a..e witnesses in tests/binder-retry-taxonomy.test.ts to runBinderCallWithCancellation with a never-aborting signal (new AbortController().signal, any thetaName), asserting the scenario's own s.calls() count, result.kind === "completed" and result.outcome.kind (BinderCallResult carries no callCount); update retry-taxonomy.ts's module header export list; MAX_BINDER_LLM_CALLS stays exported and the HC3-d cell keeps asserting s.calls() === MAX_BINDER_LLM_CALLS. Naming the two budget literals as constants beside MAX_BINDER_LLM_CALLS is permitted, not required. No other behaviour change.
