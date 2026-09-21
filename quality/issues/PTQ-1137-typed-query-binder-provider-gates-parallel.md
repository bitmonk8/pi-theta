---
id: PTQ-1137
title: Typed-query respond gate and binder forced-tool gate enumerate the same provider set independently
lens: D4
status: open
verdict: confirmed
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
verdict: questionable — independently re-verified: excerpts byte-exact at gate.ts:36-44 / forced-tool-choice.ts:113-121, membership 7/7 identical, both live (producer.ts:1113 binderSupportsApi, :4101 TYPED_QUERY set, gate.ts:87), BINDER_SUPPORTED_APIS unexported and no test pins cross-gate agreement (typed-query-provider-gate.test.ts names FORCED_TOOL_CHOICE_BY_API only in comments), bug 0480 is the mechanical anchor (these two sets shipped 6-vs-7); not a duplicate (PTQ-0421 is D9 placement of the gate cluster, qw20260917095931-d4-01 was the temperature table, the 2026-09-12 shard routed the pair INCIDENTAL unfiled while overlap was partial); but the filing's "binder set not spec-anchored" claim is refuted — conversation-drive.md:35 pins the binder bound by its own criterion ("the six measured rows' apis plus openai-responses") and bug 0417 admitted an api to the binder bound only, so whether one shared constant honours the per-path measurement law is a human ruling (D4 parallel never confirmed) (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified: excerpts byte-exact at gate.ts:36-44 / forced-tool-choice.ts:113-121, membership 7/7 identical, both copies live (producer.ts:1113 binderSupportsApi, :4101 TYPED_QUERY_SUPPORTED_PROVIDER_APIS, gate.ts:87), BINDER_SUPPORTED_APIS unexported with no test asserting cross-gate equality (typed-query-provider-gate.test.ts:489-536 pins only the typed-query constant; b0417/version-bump-gates pin the spelling table and unmeasured list), docs/bugs/0480 is the mechanical anchor (the pair shipped 6-vs-7); not a duplicate (PTQ-0421 resolved D9 placement, no open row on this pair); but the FP-check claim that the binder set is not spec-anchored is refuted — conversation-drive.md:35 pins the binder bound by its own criterion ("the six measured rows' apis plus openai-responses") and records bug 0417 admitting an api to the binder bound only, so the spec contemplates legitimate per-path divergence and whether a single shared constant honours the measurement law is a design ruling for a human (D4 parallel never confirmed) (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): accepted as confirmed - batch ruling, all D4/D9 intake items accepted.
