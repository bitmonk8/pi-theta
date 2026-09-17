---
id: pending
title: walkSessionContext's `applies`/`includedTurnCount`/`includedTokenTotal` fields are never read by the sole production caller
lens: D2
status: intake
verdict: pending
locations:
  - src/binder/session-context-walk.ts:77-82
  - src/binder/session-context-walk.ts:99-108
  - src/binder/session-context-walk.ts:165-171
  - src/extension/production-theta-producer.ts:1544-1571
sites: 1
fix_scope: localized
wave: qw20260917095931
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# walkSessionContext's `applies`/`includedTurnCount`/`includedTokenTotal` fields are never read by the sole production caller

## Observation
`walkSessionContext` (src/binder/session-context-walk.ts) returns a `SessionContextWalkResult` with four fields: `applies`, `includedMessages`, `includedTurnCount`, and `includedTokenTotal`. The one production call site, `production-theta-producer.ts#buildBinderSessionContext`, reads only `walk.includedMessages` (to check its length and to hand it to `renderCompactTranscript`); it never reads `walk.applies`, `walk.includedTurnCount`, or `walk.includedTokenTotal`.

## Evidence
`src/binder/session-context-walk.ts:77-82` — the four-field result type:
```ts
export interface SessionContextWalkResult {
  readonly applies: boolean;
  readonly includedMessages: readonly TranscriptMessage[];
  readonly includedTurnCount: number;
  readonly includedTokenTotal: number;
}
```

`src/binder/session-context-walk.ts:99-108` and `:165-171` — both return paths populate all four fields:
```ts
  const applies = input.bindContext === "session" && input.mode === "prompt";
  if (!applies) {
    return {
      applies: false,
      includedMessages: [],
      includedTurnCount: 0,
      includedTokenTotal: 0,
    };
  }
```
```ts
  return {
    applies: true,
    includedMessages,
    includedTurnCount: runningTurns,
    includedTokenTotal: runningTokens,
  };
```

`src/extension/production-theta-producer.ts:1544-1571` — the sole production caller, which reads only `walk.includedMessages`:
```ts
    const walk = walkSessionContext({
      messages,
      estimator: this.#input.root.tokenEstimator,
      mode: fm.mode,
      bindContext: "session",
    });
    // The early return above is the BNDR-10 fence, so `walk.applies` is already
    // true here (`walkSessionContext` computes it from the same two conditions,
    // and `bindContext` is passed as the literal `"session"`); the residual case
    // is BNDR-7i void truncation.
    if (walk.includedMessages.length === 0) {
      return { kind: "none" };
    }
    const rendered = renderCompactTranscript(walk.includedMessages);
```
The comment at 1562-1565 explicitly states the caller reasons about `walk.applies`'s value without reading the field — it relies on its own upstream `fm.bindContext !== "session" || fm.mode !== "prompt"` early-return gate instead.

Search: `grep -rn "walkSessionContext(" src/` returns exactly one production call site (production-theta-producer.ts:1556) plus the definition; `grep -rn "\.applies\b" src/` (excluding session-context-walk.ts itself) and `grep -rn "includedTurnCount\|includedTokenTotal" src/` (same exclusion) return no production reads — all reads of these three fields are in `tests/b0478-augmented-agentmessage-variants-excluded-before-walk.test.ts` and `tests/session-context-truncation.test.ts`.

## Why this is a problem
`applies`, `includedTurnCount`, and `includedTokenTotal` are computed on every call (real accumulation over the walked turns, or the zeroed early-return values) and are part of the function's documented public contract, but the one production consumer never reads any of the three — it re-derives the equivalent of `applies` from its own separate gate instead of trusting the field, and never consults the turn/token counts the walk already computed.

## Suggested direction (non-binding, optional)
Confirm whether any planned production consumer (e.g. a future informational note reporting how many turns/tokens were included) needs these three fields before deciding whether the production-facing result surface should be narrowed.

## False-positive check
- `grep -rn "walkSessionContext(" src/ tests/` — one production caller (production-theta-producer.ts:1556); all other source hits are the definition/import line.
- `grep -rn "\.applies\b" src/ tests/` and `grep -rn "includedTurnCount\|includedTokenTotal" src/ tests/` — every read of these three identifiers outside session-context-walk.ts itself is in a `tests/*.test.ts` file.
- Not a MUST-NOT witness pattern: the tests assert concrete numeric/boolean values (`expect(result.includedTurnCount).toBe(3)`, `expect(subagent.applies).toBe(false)`), not "was not called."
- Confirmed the caller's own comment (lines 1562-1565) explicitly reasons about `walk.applies`'s value from an independent gate rather than reading the field, corroborating that the field itself is not consulted.

## Triage
verdict: false-positive — all three fields have live readers asserting concrete values in the spec witness tests (tests/session-context-truncation.test.ts:108-109,113,135-138,156-157,174,179,203-204,239-240,249-250 pin the inclusive 8000-token/20-turn cap boundaries and the BNDR-10 skip; tests/b0478-…-before-walk.test.ts:276-279,317-318,335-336,350-351 compare walked vs control accounting), and the D2 rule holds that test-only callers are NOT dead — every confirmed "result field unread" peer (PTQ-0006/0008/0115/0143) was confirmed only after establishing no test reader existed, which the candidate's own FP-check concedes is not the case here (triage: claude-fable-5-1)
