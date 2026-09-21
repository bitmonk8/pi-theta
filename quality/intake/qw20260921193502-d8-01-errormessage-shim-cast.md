---
id: pending
title: AssistantMessage.errorMessage read through a hand-spelled structural cast at three sites although pi-ai's own type already declares the field identically
lens: D8
status: intake
verdict: pending
locations:
  - src/extension/live-prompt-query-driver.ts:1412
  - src/extension/live-prompt-query-driver.ts:1661
  - src/extension/production-theta-producer.ts:1452
sites: 3
fix_scope: module
d8_class: against-grain
d8_host: src/extension/live-prompt-query-driver.ts
wave: qw20260921193502
reported_by: lens-d8-simplification (anthropic/claude-fable-5)
date: 2026-09-21
---

# AssistantMessage.errorMessage read through a hand-spelled structural cast at three sites although pi-ai's own type already declares the field identically

## Observation
Three off-session provider-reply classification sites read a resolved
`AssistantMessage`'s `errorMessage` field through an inline structural cast,
`(reply as { readonly errorMessage?: string }).errorMessage`. At all three
sites `reply` is statically typed `AssistantMessage` (imported from
`@earendil-works/pi-ai`), and that package's declaration file already declares
the field with the exact same type, so a plain `reply.errorMessage` property
read compiles to the identical `string | undefined`. The cast changes nothing
and carries no comment; the adjacent `stopReason` casts DO carry a stated
rationale (widening a required closed-union field to `string | undefined` for
fabricated harness doubles and spec-spelled wire values), which does not apply
to `errorMessage` — it is already optional and already `string`.

## Evidence
Documented use — the package's own declaration
(node_modules/@earendil-works/pi-ai/dist/types.d.ts:283-292):

```ts
    provider: ProviderId;
    model: string;
    responseModel?: string;
    responseId?: string;
    diagnostics?: AssistantMessageDiagnostic[];
    usage: Usage;
    stopReason: StopReason;
    errorMessage?: string;
    timestamp: number;
}
```

Fighting use 1 — src/extension/live-prompt-query-driver.ts:1412 (inside
`classifyOffSessionReply(model, reply: AssistantMessage, captured)`):

```ts
  const errorMessage = (reply as { readonly errorMessage?: string }).errorMessage;
```

Fighting use 2 — src/extension/live-prompt-query-driver.ts:1659-1662 (inside
`dispatchForcedRespondTurn`, where `reply` is `let reply: AssistantMessage`
resolved from `complete()`):

```ts
    if (
      !degraded &&
      isForcedToolChoiceRejection((reply as { readonly errorMessage?: string }).errorMessage)
    ) {
```

Fighting use 3 — src/extension/production-theta-producer.ts:1451-1452 (inside
`ProductionThetaProducer.#classifyBinderAttempt`, `reply` is
`let reply: AssistantMessage`):

```ts
    const stopReason = (reply as { readonly stopReason?: string }).stopReason;
    const errorMessage = (reply as { readonly errorMessage?: string }).errorMessage;
```

Exhaustive search: `grep -E 'as \{ readonly (stopReason|errorMessage)\?: string \}' src/` — 7 hits;
the 3 `errorMessage` hits are the sites above, the 4 `stopReason` hits (plus
runtime/prompt-transport-mapping.ts:232) are NOT claimed here: `stopReason` is
declared as the required closed union `StopReason = "stop" | "length" |
"toolUse" | "error" | "aborted"` (types.d.ts:273), and the code compares it
against spec spellings outside that union (`"end_turn"`, `"tool_use"`,
`"content_filter"` — live-prompt-query-driver.ts:1372-1377) and documents the
optional-for-fixture-doubles widening in place (live-prompt-query-driver.ts:
"pi-ai always sets the field on a resolved reply, so only a fabricated double
reaches here without one"). No such rationale exists or applies for
`errorMessage`: the cast's target type is character-for-character the declared
field type.

## Why this is a problem
The cast asserts that the SDK does not type the field when it does — a reader
(or reviewer) is told `errorMessage` is off-type and must be reached past the
type system, when `reply.errorMessage` is the documented, fully-typed access.
The idiom also invites copy-paste propagation: the shim was evidently cloned
alongside the `stopReason` shim (producer:1451-1452 spells them as a pair)
where only the `stopReason` half has a job. API use against the grain of the
dependency's own declaration, with zero behavioural or type-level effect at
all three sites.

## Suggested direction (non-binding, optional)
Unproven hypothesis: replace each cast with the plain property read
`reply.errorMessage`; the surrounding `typeof errorMessage === "string"`
runtime guards are unaffected. The `stopReason` shims stay as-is (documented
double-tolerance plus out-of-union spec spellings).

## False-positive check
- Verified `reply` is statically `AssistantMessage` at all three sites (param
  annotation at driver:1394; `let reply: AssistantMessage` at driver:~1560 and
  producer:1390).
- Verified the imported type declares `errorMessage?: string`
  (types.d.ts:290) — the cast target is byte-identical, so no widening,
  narrowing, or optionality change occurs.
- Checked for a stated rationale: the `stopReason` casts carry doc-comments
  (fixture doubles, spec spellings); the `errorMessage` casts carry none at
  any of the three sites — the D2 documented-knob precedent does not shield
  them.
- Exemption check: no D8 exemption covers this claim
  (`firstAdmittingArmProperties` heavier-than-scale is a different host
  member and class).
- Duplicate check: no intake/issue file names the errorMessage shim; the
  filed-issue list was searched for "errorMessage", "cast", "shim",
  "stopReason" topics — the nearest (PTQ-1117 respond-repair-switch,
  PTQ-1137 provider gates) concern different mechanisms.
- Spec check: no docs/spec_topics/ clause requires reading `errorMessage`
  through a structural cast; provider-error-mapping.md constrains the
  classifier inputs, not the access idiom.

## Triage
verdict: questionable — accounting verified: grep reproduces 7 hits with the 3 errorMessage casts at driver:1412/1661 and producer:1452; `reply` is statically `AssistantMessage` at all three (driver:1397 param, driver:1574 and producer:1390 `let reply: AssistantMessage`); pi-ai types.d.ts:290 declares `errorMessage?: string`, byte-identical to the cast target so the cast is a type-level no-op; the adjacent stopReason casts carry an in-place rationale (fixture doubles / out-of-union spec spellings) that the errorMessage casts lack; the only D8 exemption on the producer host is #firstAdmittingArmProperties (different member/class); no duplicate in intake/issues; the simpler shape (plain `reply.errorMessage`) is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified independently: grep over src/ extensions/ tools/ tests/ reproduces exactly 7 hits, the 3 errorMessage casts at driver:1412/1661 and producer:1452; `reply` is statically `AssistantMessage` (imported from @earendil-works/pi-ai) at all three (driver:1397 param, driver:1574 and producer:1390 `let reply: AssistantMessage`); types.d.ts:290 declares `errorMessage?: string` inside `AssistantMessage`, so the cast target is identical to the declared field and the cast has no type-level or runtime effect; the neighbouring stopReason casts carry an in-place rationale (driver:1402-1405, producer:1445-1450 fixture-double widening; out-of-union spec spellings) that none of the errorMessage sites carry; only D8 exemption on either host is production-theta-producer.ts#firstAdmittingArmProperties (different member and class); no intake/issue file tracks this shim; no spec clause constrains the access idiom; the plain-read shape is a design decision for a human ruling (triage: claude-fable-5-1)
