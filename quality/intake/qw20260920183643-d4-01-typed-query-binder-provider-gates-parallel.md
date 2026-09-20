---
id: pending
title: Typed-query respond gate and binder forced-tool gate enumerate the same provider set independently
lens: D4
status: intake
verdict: pending
locations:
  - src/runtime/typed-query-provider-gate.ts:36-44
  - src/binder/forced-tool-choice.ts:113-121
sites: 2
fix_scope: cross-module
d4_class: parallel
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# Typed-query respond gate and binder forced-tool gate enumerate the same provider set independently

## Observation
The theta 1.0 typed-query supported-provider set is declared in `src/runtime/typed-query-provider-gate.ts` as `TYPED_QUERY_SUPPORTED_PROVIDER_APIS`, used both for the load-time warning (`checkTypedQueryProviderSupport`) and for the runtime `TransportError` refusal in `src/extension/production-theta-producer.ts`. The binder's forced-tool-choice dispatch gate in `src/binder/forced-tool-choice.ts` maintains its own `BINDER_SUPPORTED_APIS` set that must admit exactly the same apis. Both gates currently contain the same seven members and both deliberately exclude `openai-codex-responses` pending live measurement.

## Evidence
`src/runtime/typed-query-provider-gate.ts:36-44`:
```ts
export const TYPED_QUERY_SUPPORTED_PROVIDER_APIS = [
  "anthropic-messages",
  "openai-completions",
  "mistral",
  "amazon-bedrock",
  "mistral-conversations",
  "bedrock-converse-stream",
  "openai-responses",
] as const;
```

`src/binder/forced-tool-choice.ts:113-121`:
```ts
const BINDER_SUPPORTED_APIS: ReadonlySet<string> = new Set([
  "anthropic-messages",
  "bedrock-converse-stream",
  "amazon-bedrock",
  "openai-completions",
  "mistral-conversations",
  "mistral",
  "openai-responses",
]);
```

Diff verdict: identical membership (seven apis), different declaration order and container (`as const` array vs `ReadonlySet`).

## Why this is a problem
The two gates are load-bearing parallel truth over the same provider-admission table. The load-time warning tells the author that typed queries will fail at runtime; the runtime refusal and the binder pre-dispatch refusal actually enforce that failure. If one gate is widened (for example, `openai-codex-responses` after live measurement, which both files already anticipate) and the other is not, the load-time warning and the runtime/binder refusal will disagree: a theta could warn that typed queries are unsupported while the binder dispatches, or warn support while the runtime refuses. Today the two sets cover 7 of 7 members, but they are maintained as independent constants with no shared source of truth.

## Suggested direction (non-binding, optional)
The typed-query gate already exports `TYPED_QUERY_SUPPORTED_PROVIDER_APIS` as "one source of truth to widen". A natural shared home is that exported constant, consumed by the binder gate, or a small shared provider-admission module imported by both runtime and binder.

## False-positive check
- Re-read both cited spans; membership verified identical (seven apis, same strings).
- `openai-codex-responses` is deliberately excluded in both files, documented as pending live measurement.
- The typed-query set is anchored to `conversation-drive.md §"Provider compatibility for typed queries"`; the binder set is not independently spec-anchored—it is code-anchored to the typed-query gate by comments in both files.
- Searched `quality/intake/` for existing filings covering this coupling; none found.
- Both copies are live production code (not dead, not tests).

## Triage
verdict: questionable — accounting verified: both excerpts match at the cited lines, membership is 7/7 identical, both copies are live (producer.ts:1115 / :4103, gate.ts:87), no test pins cross-gate agreement (BINDER_SUPPORTED_APIS is unexported), and bug 0480 records these two sets actually diverging 6-vs-7 as a shipped bug; but the candidate's claim that the binder set is not spec-anchored is wrong — conversation-drive.md §complete-forced-tool-presupposition (bug-0417 pin) defines the binder bound by a distinct criterion ("the six measured rows' apis plus openai-responses") and the spec once deliberately admitted an api to the binder gate only, so whether one shared constant is compatible with the per-path measurement law is a design ruling for a human (D4 parallel is never confirmed) (triage: claude-fable-5-1)
