---
id: PTQ-1098
title: overflowStatusGateSatisfied's default arm is unreachable given its sole caller's pre-filter
lens: D2
status: open
verdict: confirmed
locations:
  - src/binder/provider-error-mapping.ts:136-155
  - src/binder/provider-error-mapping.ts:163-172
sites: 1
fix_scope: localized
wave: qw20260920183643
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-20
---

# overflowStatusGateSatisfied's default arm is unreachable given its sole caller's pre-filter

## Observation
`overflowStatusGateSatisfied` switches on `input.api` and has a `default:
return false;` arm. Its only caller, `matchOverflowSignature`, looks `input.api`
up in `OVERFLOW_SIGNATURES` first and returns early (`null`) when the key is
absent, so `overflowStatusGateSatisfied` is only ever invoked with one of the
six keys of `OVERFLOW_SIGNATURES`. The switch's five explicit `case` labels
(three of which share bodies) already cover exactly those six keys.

## Evidence
`src/binder/provider-error-mapping.ts:41-49` (the closed key set):
```ts
const OVERFLOW_SIGNATURES: Readonly<Record<string, RegExp>> = Object.freeze({
  "anthropic-messages":
    /(prompt is too long|exceeds .* context window|maximum context length)/i,
  "openai-completions": /maximum context length|context_length_exceeded/i,
  mistral: /context.*length/i,
  "mistral-conversations": /context.*length/i,
  "amazon-bedrock": /(input is too long|context window)/i,
  "bedrock-converse-stream": /(input is too long|context window)/i,
});
```

`src/binder/provider-error-mapping.ts:163-172` (the sole call site, gating on
membership in that same map before calling the gate):
```ts
function matchOverflowSignature(
  input: ProviderClassifierInput,
): ContextOverflowError | null {
  const signature = OVERFLOW_SIGNATURES[input.api];
  if (signature === undefined) return null;
  const message = input.errorMessage;
  if (message === undefined) return null;
  if (!signature.test(message)) return null;
  if (!overflowStatusGateSatisfied(input)) return null;
```

`src/binder/provider-error-mapping.ts:136-155` (the switch, exhaustive over
those same six keys):
```ts
function overflowStatusGateSatisfied(input: ProviderClassifierInput): boolean {
  switch (input.api) {
    case "anthropic-messages":
    case "mistral":
    // Alias spelling of the same adapter/formatter (see OVERFLOW_SIGNATURES).
    case "mistral-conversations":
      return input.httpStatus === 400 || input.httpStatus === null;
    case "openai-completions":
      return (
        input.httpStatus === 400 ||
        (input.httpStatus === 200 && input.stopReason === "error")
      );
    case "amazon-bedrock":
    // Alias spelling of the same adapter/formatter (see OVERFLOW_SIGNATURES).
    case "bedrock-converse-stream":
      return true;
    default:
      return false;
  }
}
```

## Why this is a problem
`overflowStatusGateSatisfied` has exactly one caller
(`grep -n "overflowStatusGateSatisfied" src` returns only the declaration at
line 136 and the one call at line 170), and that caller only reaches the call
when `input.api` is a key of `OVERFLOW_SIGNATURES`. The switch's five `case`
labels already enumerate those six keys (`mistral`/`mistral-conversations` share
a body, `amazon-bedrock`/`bedrock-converse-stream` share a body), so
`input.api` can never fall through to `default` at this call site — the
`return false;` arm is dead given the current caller graph, not a
forward-compatibility placeholder for an unlisted api (an unlisted api is
already filtered out one level up, before `overflowStatusGateSatisfied` is
ever invoked).

## Suggested direction (non-binding, optional)
The function's parameter type could be narrowed to the literal union of the
six `OVERFLOW_SIGNATURES` keys (or the switch could assert exhaustiveness with
a `never` check) so the `default` arm either compiles away or is verified
unreachable by the type checker, rather than being reachable only through the
broader `string` type of `ProviderClassifierInput.api`.

## False-positive check
- Searched every reference to `overflowStatusGateSatisfied` across `src/`
  (`grep -rn "overflowStatusGateSatisfied" src`): declaration at line 136, one
  call at line 170 inside `matchOverflowSignature`, no other production or
  test caller invokes it directly (tests reference it only in comments, e.g.
  `tests/binder-inference-provider-mapping.test.ts:851` and
  `tests/live/off-session-overflow-classification.test.ts:14`, both prose, not
  calls).
- Confirmed `matchOverflowSignature`'s early return
  (`if (signature === undefined) return null;`) executes before the
  `overflowStatusGateSatisfied` call, so `input.api` is guaranteed to be a key
  of `OVERFLOW_SIGNATURES` at the point of invocation.
- Enumerated `OVERFLOW_SIGNATURES`'s keys (six) against the switch's `case`
  labels (six, including the two alias fall-throughs) and found them
  identical, so no key can reach `default`.

## Triage
verdict: confirmed — all three excerpts byte-match at :43-51/:136-155/:163-172; my own hunt reproduces the caller graph exactly (`grep -rn overflowStatusGateSatisfied src extensions tools tests` → declaration :136, one call :170, two tests/ hits both `//` prose; module exports only `ProviderClassifierInput` and `classifyProviderResponse`, no barrel or dynamic access), a mechanical sorted-diff of `OVERFLOW_SIGNATURES` keys against the switch's `case` labels is IDENTICAL (6 == 6), and the `signature === undefined` early return at :166 precedes the gate call, so the `default: return false` arm cannot execute; git shows the arm born with the pre-filter in 3a93fd4e (V9j, 4 keys == 4 cases) and the bug-0010 alias round added keys and case labels in lockstep, so it was never live; spec provider-error-mapping.md §Overflow signatures lists exactly the four provider rows the arms mirror and its "no signature match → TransportError" rule is enforced by the caller's lookup, not this arm — in-scope D2 dead-arm-with-shadow-default on the same footing as confirmed PTQ-0177/PTQ-0180, not a duplicate (PTQ-0017 is a different root cause in the same file) (triage: claude-fable-5-1)
