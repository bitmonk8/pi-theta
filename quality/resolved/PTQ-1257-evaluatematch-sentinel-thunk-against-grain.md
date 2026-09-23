---
id: PTQ-1257
title: evalMatch drives evaluateMatch with sentinel arm bodies that record a side-channel selection and discard the documented return value, then recovers the selection through an unchecked cast
lens: D8
status: fixed
verdict: confirmed
locations:
  - src/runtime/statement-executor.ts:1472-1495
  - src/runtime/match-result.ts:121-145
sites: 2
fix_scope: module
d8_class: against-grain
d8_host: src/runtime/statement-executor.ts#evalMatch
wave: qw20260922150013
reported_by: lens-d8-simplification (anthropic/claude-fable-5)
date: 2026-09-22
---

# evalMatch drives evaluateMatch with sentinel arm bodies that record a side-channel selection and discard the documented return value, then recovers the selection through an unchecked cast

## Observation
`evaluateMatch` (src/runtime/match-result.ts) is documented as evaluating the selected arm's `body` thunk with the pattern's bindings and returning that body's value. Its ONLY production caller, `evalMatch` (statement-executor.ts:1451-1504), does not use it that way: it constructs arms whose `body` thunks write `{ index, bindings }` into a closure variable and return a `null` sentinel, calls `evaluateMatch` for its side effect, discards the return value, and then recovers the selection via `selection as { readonly index: number; readonly bindings: Bindings }` — an unchecked cast justified only by a comment. The real arm body is evaluated separately through `evalExpr`.

## Evidence
Documented intent — src/runtime/match-result.ts:121-126 and 128-134 (verbatim):
```ts
 * evaluated (expressions.md §`match` expression — arms evaluate to a value).
 */
export interface MatchArm {
  readonly pattern: Pattern;
  readonly body: (bindings: Bindings) => ThetaValue;
}
```
```ts
/**
 * Evaluate a `match` expression: dispatch `scrutinee` against `arms` in order,
 * first matching arm wins, and evaluate the selected arm's `body` with the
 * bindings its pattern introduces. When `scrutinee` matches none of the arms,
 * raise `MatchError` (`theta/runtime/match-error`) — ...
```

Fighting use — src/runtime/statement-executor.ts:1472-1481 and 1493-1495 (verbatim):
```ts
  let selection: { readonly index: number; readonly bindings: Bindings } | undefined;
  const arms: MatchArm[] = expr.arms.map((arm, index) => ({
    pattern: toRuntimePattern(arm.pattern),
    body: (bindings) => {
      selection = { index, bindings };
      // A sentinel: the real arm body runs asynchronously through `evalExpr`
      // below; `evaluateMatch`'s returned value is discarded.
      return null;
    },
  }));
```
```ts
  // `evaluateMatch` returned normally, so a matching arm's thunk ran and set
  // `selection` (a non-exhaustive scrutinee would have thrown `MatchError`).
  const chosen = selection as { readonly index: number; readonly bindings: Bindings };
```

Caller census: `grep -rn "evaluateMatch(" src/` → definition (match-result.ts:136) plus exactly one call site (statement-executor.ts:1486). The value-returning, body-evaluating contract the API documents therefore has ZERO production consumers using it as documented; the pattern-dispatch primitive the sole caller actually needs (`matchPattern`, match-result.ts:161) is module-private, which is what forces the sentinel construction.

## Why this is a problem
API use fighting the documented intent: the facility's contract is "evaluate the selected arm's body ... and return its value", and the only live caller inverts it into a selection oracle — synthetic thunks, a mutable closure side channel, a deliberately discarded return value, and an `as` cast that removes `undefined` from the type on the strength of a comment rather than the type system. The stated rationale (V20e: keep the V4a pattern dispatch and the `MatchError` raise single-sourced while evaluating arm bodies through the async executor) is real, but it justifies reusing the dispatch/raise, not this shape: the reuse requirement would be equally satisfied by a selection-returning entry point, without the sentinel machinery or the cast. As written, `MatchArm.body`'s documented meaning and its sole production use disagree, and a future reader of match-result.ts is told a contract no production code exercises.

## Suggested direction (non-binding, optional)
Unproven hypothesis: exporting the arm-selection step from match-result.ts (dispatch `scrutinee` against patterns, return `{ index, bindings }` or raise `MatchError`) and expressing `evaluateMatch` as selection-plus-body-call would let `evalMatch` consume the selection directly — no sentinel thunks, no side channel, no cast — while the pattern dispatch and the `MatchError` raise stay single-sourced. Not verified against test consumers' expectations.

## False-positive check
- Caller search: `grep -rn "evaluateMatch(" src/ tests/` — one production call (the fighting one); tests/match-result.test.ts and tests/runtime-panics.test.ts use the documented value-returning contract, so the facility is not dead (not a D2 matter) — the documented shape is exercised only by its own unit tests.
- Rationale check (D2 precedent: stated design decisions stand): the V20e comment at statement-executor.ts:1461-1471 states why arm bodies must run through `evalExpr`; it does not state a reason the selection must ride a sentinel side channel rather than a returned value, so the precedent's "rationale demonstrably covers the shape" condition is not met.
- Spec check: expressions.md §`match` pins first-match-wins, bindings, and `MatchError` — all preserved under the hypothesis; no clause pins `evaluateMatch`'s signature.
- Duplicate check: no existing PTQ names evalMatch or evaluateMatch (searched the issue list for "match"); PTQ-1154/PTQ-1163 are D9 size claims on the host, distinct class.
- Exemption check: no D8 exemption exists for src/runtime/statement-executor.ts#evalMatch.

## Triage
verdict: questionable — accounting verified: excerpts reproduce at match-result.ts:121-145 and statement-executor.ts:1472-1495; `grep -rn evaluateMatch src/ extensions/ tools/ tests/` confirms exactly one production call (statement-executor.ts:1486, return value discarded, `selection` recovered via `as` cast) with tests/match-result.test.ts and tests/runtime-panics.test.ts as the only consumers of the documented value-returning contract; `matchPattern` is module-private (exports: MATCH_ERROR_CODE, MatchError, Pattern, Bindings, MatchArm, evaluateMatch); the V20e comment at 1461-1471 justifies evaluating the body through `evalExpr`, not the sentinel side channel, so the rationale-stated precedent does not cover the shape; expressions.md §Exhaustiveness pins first-match-wins/bindings/MatchError, all preserved by a selection-returning entry point; no D8 exemption on the host and no existing PTQ names evalMatch/evaluateMatch (PTQ-0072 resolved stale narration, PTQ-1154 D9 size) — the simpler shape is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — re-verified independently: excerpts reproduce byte-for-byte at match-result.ts:118-145 and statement-executor.ts:1472-1495; `grep -rn evaluateMatch src/ extensions/ tools/ tests/` yields exactly one production call (statement-executor.ts:1486, return discarded, `selection` recovered via `as` cast at 1495) plus tests/match-result.test.ts and tests/runtime-panics.test.ts as the only consumers of the documented value-returning contract; `matchPattern` is unexported (exports: MATCH_ERROR_CODE, MatchError, Pattern, Bindings, MatchArm, evaluateMatch), so the sentinel construction is forced by the module surface; the V20e comment at 1461-1471 justifies running the body through `evalExpr`, not the side-channel shape; expressions.md:180 §Exhaustiveness pins first-match-wins/MatchError only, no clause pins evaluateMatch's signature; quality/exemptions.json has no D8 row for statement-executor.ts; no open/intake PTQ names evalMatch/evaluateMatch (PTQ-0072, PTQ-1154 resolved and distinct class) — anchor is against-grain API use, but the selection-returning entry point is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified against current code: MatchArm/evaluateMatch doc excerpts reproduce at match-result.ts:118-145 and the sentinel thunk / discarded call / `as` cast reproduce at statement-executor.ts:1472-1495; `grep -rn "evaluateMatch\|matchPattern" src/ extensions/ tools/ tests/` shows exactly one production call (statement-executor.ts:1486, imported at :93) with tests/match-result.test.ts and tests/runtime-panics.test.ts the only consumers of the documented value-returning contract; match-result.ts exports only MATCH_ERROR_CODE, MatchError, Pattern, Bindings, MatchArm, evaluateMatch (matchPattern unexported, so the side channel is forced by the module surface); the V20e comment at 1461-1471 justifies running the body via `evalExpr`, not the sentinel/cast shape; expressions.md:152/180 pin first-match-wins and MatchError only, both preserved by a selection-returning entry point; quality/exemptions.json has no statement-executor/match-result row; only other intake hit (qw20260922150013-d9-01 runtime-panics) is a distinct D9 size class — against-grain anchor is real, but the simpler shape is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-22): confirmed - batch ruling over the RFC-0015-era review wave; triage verification trusted.
