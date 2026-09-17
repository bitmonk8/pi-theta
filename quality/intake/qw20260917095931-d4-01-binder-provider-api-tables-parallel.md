---
id: pending
title: Binder per-provider API dispatch truth is spread across four independent tables
lens: D4
status: intake
verdict: pending
locations:
  - src/binder/binder-inference.ts:70-77
  - src/binder/binder-temperature.ts:97-115
  - src/binder/forced-tool-choice.ts:60-77
  - src/binder/forced-tool-choice.ts:89-94
  - src/binder/forced-tool-choice.ts:113-122
  - src/binder/provider-error-mapping.ts:62-70
sites: 6
fix_scope: module
d4_class: parallel
wave: qw20260917095931
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-17
---

# Binder per-provider API dispatch truth is spread across four independent tables

## Observation
The binder path keeps five separate per-provider API enumerations in
`src/binder/`, none derived from a shared source:

- `binder-inference.ts` maps API to seed field (`BINDER_SEED_FIELD_BY_API`).
- `binder-temperature.ts` maps API (and per-model exceptions) to temperature
  placement (`BINDER_TEMPERATURE_TABLE`).
- `forced-tool-choice.ts` maps API to forced-tool spelling
  (`FORCED_TOOL_CHOICE_BY_API`) and separately lists the supported-api gate
  (`BINDER_SUPPORTED_APIS`) plus the deliberately-outside apis
  (`FORCED_TOOL_CHOICE_UNMEASURED_APIS`).
- `provider-error-mapping.ts` lists the typed-query-supported API set
  (`TYPED_QUERY_SUPPORTED_PROVIDER_APIS`).

The module headers explicitly note the mirroring: `binder-temperature.ts` says
it "mirror[s] `forced-tool-choice.ts`'s per-api spelling table and
`binder-inference.ts`'s per-api seed-field table"; `provider-error-mapping.ts`
says the typed-query gate and binder gate must "agree". Despite that, the
row key sets differ today (10 temperature rows, 8 forced-tool rows, 7
binder-gate members, 7 typed-query members, 4 seed-field rows).

## Evidence

### `src/binder/binder-inference.ts:70-77`
```ts
const BINDER_SEED_FIELD_BY_API: Readonly<Record<string, string | undefined>> =
  Object.freeze({
    "openai-completions": "seed",
    mistral: "random_seed",
    "anthropic-messages": undefined,
    "amazon-bedrock": undefined,
  });
```

### `src/binder/binder-temperature.ts:97-115`
```ts
export const BINDER_TEMPERATURE_TABLE: Readonly<Record<string, BinderTemperatureRow>> =
  Object.freeze(
    Object.assign(Object.create(null) as Record<string, BinderTemperatureRow>, {
      "openai-completions": row("sent", []),
      mistral: row("sent", []),
      "anthropic-messages": row("sent", ["claude-fable-5", "claude-sonnet-5"]),
      "amazon-bedrock": row("sent", []),
      "mistral-conversations": row("sent", []),
      "bedrock-converse-stream": row("sent", []),
      "openai-responses": row("sent", []),
      "azure-openai-responses": row("omitted", []),
      "openai-codex-responses": row("omitted", []),
      "google-generative-ai": row("omitted", []),
      "google-vertex": row("omitted", []),
      "pi-messages": row("omitted", []),
```

### `src/binder/forced-tool-choice.ts:60-77`
```ts
const FORCED_TOOL_CHOICE_BY_API: Readonly<
  Record<string, "tool" | "function" | "responses-function">
> = Object.freeze({
  "anthropic-messages": "tool",
  "bedrock-converse-stream": "tool",
  "amazon-bedrock": "tool",
  "openai-completions": "function",
  "mistral-conversations": "function",
  "mistral": "function",
  "openai-responses": "responses-function",
  "openai-codex-responses": "responses-function",
});
```

### `src/binder/forced-tool-choice.ts:89-94`
```ts
export const FORCED_TOOL_CHOICE_UNMEASURED_APIS: readonly string[] = Object.freeze([
  "azure-openai-responses",
  "google-generative-ai",
  "google-vertex",
  "pi-messages",
]);
```

### `src/binder/forced-tool-choice.ts:113-122`
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

### `src/binder/provider-error-mapping.ts:62-70`
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

## Why this is a problem
This is load-bearing parallel truth over the same provider-api discriminant.
When a provider API is admitted to binder dispatch (or a new `KnownApi` alias
appears), every table/gate must be updated together:

- A binder-supported API with no temperature row defaults to the table's
  "outside the table" behavior, which may send `temperature: 0` to a provider
  that refuses it.
- A binder-supported API with no forced-tool row falls through to the normalized
  `{type:"tool",name}` shape, which the code comments identify as 400-prone for
  several adapters.
- A provider admitted to the binder gate but omitted from the typed-query set
  will bind arguments but then warn/fail on typed-query turns, or vice versa.
- A provider with a seed-field expectation but no seed row will not receive the
  deterministic seed.

Today the largest enumeration (`BINDER_TEMPERATURE_TABLE`) covers 10 api keys,
the smallest (`BINDER_SEED_FIELD_BY_API`) covers 4, and no file imports another's
table; the only coupling is developer discipline and the comments calling out
that they should stay aligned.

## Suggested direction (non-binding, optional)
A shared source of truth (for example a single `binder/provider-api-profile.ts`
record per admitted API holding seed field, temperature placement, forced-tool
spelling, and gate membership) could be sliced by the existing modules, so an
admitted API is widened in one place.

## False-positive check
- Re-verified `clone-scan.mjs` map: no clone groups in any of these files.
- Each table is live: consumed by `buildBinderCompleteCall`,
  `binderSendsTemperature`, `forcedToolChoiceForApi`, `binderSupportsApi`, and
  `checkTypedQueryProviderSupport`.
- These are not spec-normative reference vectors repeated by the spec; each
  table records live-measured provider behavior and cites a distinct spec clause.
- Not generated code and not in `tests/`.

## Triage
verdict: false-positive — accounting inaccurate: BINDER_TEMPERATURE_TABLE has 12 row keys (10 KnownApi + legacy mistral/amazon-bedrock), not 10 as counted twice; and the "only coupling is developer discipline" anchor is refuted — tests/version-bump-gates.test.ts step 6 mechanically asserts the 10-member api-coverage snapshot (sdk-inventory.ts:428-439) against BINDER_TEMPERATURE_TABLE keys and against FORCED_TOOL_CHOICE_API_KEYS ∪ FORCED_TOOL_CHOICE_UNMEASURED_APIS (disjoint), and typed-query-provider-gate.test.ts:839-886 pins TYPED_QUERY_SUPPORTED_PROVIDER_APIS, so a new KnownApi absent from those tables reds the suite rather than silently falling through (triage: claude-fable-5-1)
