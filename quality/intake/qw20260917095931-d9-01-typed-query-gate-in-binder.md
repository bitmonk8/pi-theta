---
id: pending
title: The typed-query provider-support gate (six declarations) lives in src/binder/provider-error-mapping.ts with zero binder-side consumers
lens: D9
status: intake
verdict: pending
locations:
  - src/binder/provider-error-mapping.ts:62-147
sites: 6
fix_scope: cross-module
d9_class: misplacement
wave: qw20260917095931
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-17
---

# The typed-query provider-support gate (six declarations) lives in src/binder/provider-error-mapping.ts with zero binder-side consumers

## Observation
src/binder/provider-error-mapping.ts (391 LOC) hosts two halves its own header
names as separate ownerships: the binder provider-response classifier
(lines 169-391, spec pi-integration-contract/provider-error-mapping.md) and
the typed-query provider-compatibility gate (lines 62-147, spec
pi-integration-contract/conversation-drive.md §"Provider compatibility for
typed queries"). The typed-query half is six declarations:
`TYPED_QUERY_SUPPORTED_PROVIDER_APIS` (62-70), `TYPED_QUERY_UNSUPPORTED_PROVIDER_CODE`
(73-74), `typedQueryUnsupportedProviderMessage` (83-88), `TypedQueryProviderCheckInput`
(91-100), `checkTypedQueryProviderSupport` (108-126), and
`synthesizeUnsupportedProviderTransportError` (137-147) — 57 declaration LOC per
the structural map. Typed queries are theta-body respond-turn machinery, not the
binder; the binder path has its own separate supported-api gate.

## Evidence
Affinity counted both ways for the six-declaration cluster:

- Touches 2 members of foreign hosts — `Diagnostic` (src/diagnostics/diagnostic)
  and `TransportError` (src/runtime/query-error) — and 0 members of its own file
  outside the cluster, 0 members of any other src/binder/ module. In-file grep:
  `TYPED_QUERY_SUPPORTED_PROVIDER_APIS` appears only at its declaration (62) and
  inside the cluster's own check (113); `synthesizeUnsupportedProviderTransportError`
  only at its declaration (137). The `Diagnostic` import serves only this cluster
  (the classifier half returns `QueryError`, not `Diagnostic`).
- The classifier half (lines 169-391) references 0 of the cluster's 6 members.
- Zero binder/ consumers: grep of `from "./` and `from "../binder/` across
  src/binder/ shows no binder module imports ./provider-error-mapping at all.
  The module's only src importers are extension/production-theta-producer.ts
  and extension/production-composition.ts (structural-map importer counts:
  `checkTypedQueryProviderSupport` 1/3, `synthesizeUnsupportedProviderTransportError`
  1/1, `TYPED_QUERY_SUPPORTED_PROVIDER_APIS` 1/2 src/tests).
- The cluster's runtime consumer is the typed-query respond-turn gate, not the
  binder — src/extension/production-theta-producer.ts:4056-4059:

```ts
      !(TYPED_QUERY_SUPPORTED_PROVIDER_APIS as readonly string[]).includes(
        String(respondModel.api),
      )
        ? synthesizeUnsupportedProviderTransportError(String(respondModel.api))
        : undefined;
```

- The binder call path has a distinct gate and does not use this cluster: the
  producer's comment at src/extension/production-theta-producer.ts:1095-1101
  ("the binder's supported-api gate ... Mirror the typed-query respond path's
  gate") routes through `binderSupportsApi`/`binderUnsupportedApiMessage` from
  src/binder/forced-tool-choice.ts.
- Sibling pattern: the tables that ARE shared between the binder and the
  typed-query path and live in src/binder/ each state a housing rationale —
  src/binder/forced-tool-choice.ts:4-6 ("Housed under `src/binder/` because
  `binder-inference.ts` must consume the same table and the producer already
  imports `binder-inference` — a producer export would be circular"), repeated
  at src/binder/binder-temperature.ts:3-6. The typed-query cluster has no such
  rationale (no binder module consumes it, so no cycle pins it here) and its
  host header (lines 1-30) states none.

## Why this is a problem
Correct code in the wrong module: the cluster's spec anchor is the typed-query
clause of conversation-drive.md, not a binder/*.md spec; it touches 2 members
of foreign hosts and 0 of its own directory; nothing under src/binder/ imports
it (or its host module) at all; and the directory's own sibling convention
(forced-tool-choice.ts, binder-temperature.ts) is that non-binder-named tables
live under src/binder/ only when a binder module must consume them — a
condition this cluster fails. A reader looking for the typed-query provider
gate under runtime/ or extension/ (where all its consumers and its
`TransportError` shape live) will not find it in binder/.

## Suggested direction (non-binding, optional)
Hypotheses, unproven — the human ratifies one. Home A: move the six
declarations -> src/runtime/typed-query-provider-gate.ts (hypothesis) — 57 LOC,
exported symbols moved: TYPED_QUERY_SUPPORTED_PROVIDER_APIS,
TYPED_QUERY_UNSUPPORTED_PROVIDER_CODE, typedQueryUnsupportedProviderMessage,
TypedQueryProviderCheckInput, checkTypedQueryProviderSupport,
synthesizeUnsupportedProviderTransportError; external importers of those
symbols (src/tests): 1/2, 0/2, 0/1, 0/0, 1/3, 1/1; cross-references back into
the host: 0. Home B: fold into src/runtime/prompt-transport-mapping.ts
(hypothesis; it already cites `classifyProviderResponse` at line 242) — same
symbol set, same zero back-references.

## False-positive check
- Affinity counted both ways: cluster -> rest of file/directory = 0 member
  touches; rest of file -> cluster = 0 member touches (in-file grep of all six
  names, hits quoted above).
- Barrel/facade check: the host is not a re-export module; the cluster is
  definition code, so no facade exception applies.
- Binder-consumer check: grepped all src/binder/ imports — no binder module
  imports ./provider-error-mapping; the binder's own api gate is
  `binderSupportsApi` in forced-tool-choice.ts (producer lines 1095-1101).
- Sibling-pattern citation: forced-tool-choice.ts:4-6 and
  binder-temperature.ts:3-6 state the cycle-avoidance housing rationale for
  shared tables in binder/; this cluster has no binder consumer, so the
  rationale does not extend to it.
- Prior-filing check: scanned the PTQ-0001..PTQ-0398 roster — no existing
  finding addresses this module's placement (PTQ-0290 cites this file's HC3
  budget note only; PTQ-0116/PTQ-0160 are unrelated rosters).
- Deadness check: all six members have live src callers (production-composition
  1585, production-theta-producer 4056-4059), so this is placement, not D2.

## Triage
verdict: questionable — accounting verified: six-declaration cluster at 62-147 touches only Diagnostic + TransportError (foreign) and 0 members of the classifier half or any src/binder/ module, no binder module imports the host (only extension/production-composition.ts:164 and production-theta-producer.ts:373 do), sibling rationale at forced-tool-choice.ts:4-6 / binder-temperature.ts:3-6 reproduces and the host header states none; all six live; target home (runtime/ new module vs. fold into prompt-transport-mapping, and whether the co-located classifier half moves too since it also has no binder consumer) needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified independently: size-scan map confirms host 391 LOC / exempt band (placement review applies) with the six rows at 62-147 summing to 57 LOC and importer counts 1/2, 0/2, 0/1, 0/0, 1/3, 1/1 as filed; cluster leans on 2 foreign members (Diagnostic, TransportError) and 0 own-host members outside itself, classifier half (169-391) references none of the six, no src/binder/*.ts imports ./provider-error-mapping (only .md spec cites), sole src importers are production-composition.ts:164 and production-theta-producer.ts:374 (call site drifted 4056→4089-4092), sibling rationale reproduces verbatim at forced-tool-choice.ts:4-6 / binder-temperature.ts:3-6 and the host header states none; all six live; same-wave D4 sibling cites 62-70 for a different root cause (parallel tables) so not a duplicate; target home is a design decision for a human ruling (triage: claude-fable-5-1)
