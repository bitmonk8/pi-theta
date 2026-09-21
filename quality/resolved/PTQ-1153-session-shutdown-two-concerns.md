---
id: PTQ-1153
title: session-shutdown.ts bundles the five-sub-step teardown sequence with the PIC-24..28 emission-isolation machinery three other modules consume independently
lens: D9
status: fixed
verdict: confirmed
locations:
  - src/extension/session-shutdown.ts:1-727
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/extension/session-shutdown.ts
d9_band: zone
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# session-shutdown.ts bundles the five-sub-step teardown sequence with the PIC-24..28 emission-isolation machinery three other modules consume independently

## Observation
`src/extension/session-shutdown.ts` is 727 LOC (zone band). Its own header (lines 1-17) names two owned concerns: "the five-sub-step fixed teardown sequence with per-step isolation" (spec: `session-shutdown-semantics.md`) and "the teardown-time `console.error` emission isolation (the wrapped serialisation-and-emission sequence with the bare-`code` / two-token / three-token fallback forms and the construction-site self-wrap)" (spec: `diagnostic-emission-isolation.md` PIC-24/25/26/27/28). The emission half is imported by three other production modules that never run the teardown handler, and one of those imports closes a value-level module cycle.

## Evidence
Distinct-concern inventory (line ranges and LOC from the structural map):

| concern | members | line ranges | LOC |
|---|---|---|---|
| teardown sequence orchestration (session-shutdown-semantics.md five sub-steps) | SESSION_SHUTDOWN_ABORT_MESSAGE, TeardownStep, TEARDOWN_STEP_CALL_LABELS, SessionShutdownEventLike, ClosableWatcher, ForwardingSignalSource, TeardownAwareDebouncer, SessionShutdownDeps, synthesiseSessionShutdownReason, runSessionShutdown, runIsolatedCall, runBoundedDisposeAwait, quiesceDebouncer | 40, 52, 61-75, 82-89, 95-101, 126-157, 166-168, 477-727 | ~285 |
| console.error emission isolation + diagnostic construction (diagnostic-emission-isolation.md PIC-24..28) | TEARDOWN_STEP_FAILED_CODE, RELOAD_TEARDOWN_TIMEOUT_CODE, CANCELLED_BY_SESSION_SHUTDOWN_CODE, RUNTIME_DEGRADED_CODE, EmissionSink, teardownStepFailedDiagnostic, cancelledBySessionShutdownReason, cancelledBySessionShutdownDiagnostic, reloadTeardownTimeoutDiagnostic, emitTeardownDiagnostic, emitConstructionSiteFallback, NestedShapeEmission, emitNestedShapeDiagnostic, CancelledBySessionShutdownDeps, emitCancelledBySessionShutdownNote, createProductionEmissionSink | 44-49, 108-113, 176-253, 263-465 | ~212 |

The emission concern is consumed independently of the teardown concern by three production modules (grep over `src/`, 2026-09-20):

- `src/extension/session-swap-tripwire.ts:26` — `import { type EmissionSink, emitTeardownDiagnostic } from "./session-shutdown";` (the tripwire trip site, not the teardown handler)
- `src/extension/production-theta-producer.ts:125,130-131` — `EmissionSink`, `emitCancelledBySessionShutdownNote`, `createProductionEmissionSink` (per-invocation clean-cancel note at line 2085-2086)
- `src/extension/factory.ts:64,509` — `createProductionEmissionSink`

Value-level module cycle closed by the bundling:

- `src/extension/session-shutdown.ts:24`: `import { armSessionSwapTripwireForReason } from "./session-swap-tripwire";`
- `src/extension/session-swap-tripwire.ts:26`: `import { type EmissionSink, emitTeardownDiagnostic } from "./session-shutdown";`

Structural-map importer counts: `EmissionSink` 2/4, `createProductionEmissionSink` 2/0, `emitCancelledBySessionShutdownNote` 1/1, `emitTeardownDiagnostic` 1/1, `runSessionShutdown` 1/7.

## Why this is a problem
Zone-band file: no presumption, so the finding rests on the two-concern inventory above. The two concerns carry two different spec anchors (`session-shutdown-semantics.md` vs `diagnostic-emission-isolation.md` PIC-24..28), the header enumerates them as two separate ownerships, and the emission half has three production consumers (`session-swap-tripwire.ts`, `production-theta-producer.ts`, `factory.ts`) that use it outside any teardown, one of which (`session-swap-tripwire.ts`) must import back into the module that imports it — a cycle that exists only because the sink and the sequence share a file. Reasons considered: closed-enumeration dispatch — no, the file is not one dispatch; single algorithm with shared local state — applies to `runBoundedDisposeAwait` internally, not across the two concerns (the emission functions share no locals or private state with the sequence, only the `EmissionSink` interface); data-only module — no (two function families); generated code — no.

## Suggested direction (non-binding, optional)
Seam A (hypothesis, unproven): the emission-isolation family (EmissionSink, emitTeardownDiagnostic, emitConstructionSiteFallback, NestedShapeEmission, emitNestedShapeDiagnostic, CancelledBySessionShutdownDeps, emitCancelledBySessionShutdownNote, createProductionEmissionSink + the four code constants and three diagnostic builders) -> `extension/teardown-emission.ts` (name hypothetical) — ~212 LOC, 16 symbols moved, external importers session-swap-tripwire.ts / production-theta-producer.ts / factory.ts (src) + 4 test files; cross-references back into the host: `SessionShutdownDeps.sink`, `runSessionShutdown`/`runIsolatedCall`/`runBoundedDisposeAwait` call `emitTeardownDiagnostic` — one-directional, and the session-shutdown ↔ session-swap-tripwire cycle dissolves. No other seam identified.

## False-positive check
Band: zone (727 LOC, threshold 600), filed on the ≥2-concern inventory as required. Reasons-considered list recorded above with defeating evidence. Exemptions check: `quality/exemptions.json` consulted via the map — no EXEMPT annotation on this file (band says "zone", not exempt). Generated-code check: hand-written module with spec-citation header, no generator marker. Spec-mirror check: TEARDOWN_STEP_CALL_LABELS mirrors the spec's closed label set but is 15 LOC — it does not account for the file's size. Cycle claim re-verified by grep immediately before filing (both import lines quoted). Function-level hosts inside this file were dispositioned separately (kept whole; see triage notes).

## Triage
verdict: questionable — accounting verified: size-scan map reproduces 727 LOC / zone band with no exemptions.json row; every inventory line range and the ~285/~212 LOC sums match the map; importer counts (EmissionSink 2/4, createProductionEmissionSink 2/0, emitCancelledBySessionShutdownNote 1/1, emitTeardownDiagnostic 1/1, runSessionShutdown 1/7) match; the three external emission consumers (session-swap-tripwire.ts:26, production-theta-producer.ts:125-132/2085-2086, factory.ts:64/509) and the session-shutdown.ts:24 ↔ session-swap-tripwire.ts:26 value cycle re-grep true; the emission family shares no locals/private state with the sequence (one-directional via EmissionSink + builders) so the two rows are distinct concerns, and no concrete/strong reason was overlooked (no spec cites the module file, not dispatch/data/generated); only quibble is teardownStepFailedDiagnostic/reloadTeardownTimeoutDiagnostic (0 src importers, sequence-only callers) rowed under emission — re-rowing them leaves the emission row ~160 LOC, still ≥2 concerns; not a duplicate of PTQ-0306 (factory.ts#createThetaExtension callback); target shape needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified independently: size-scan map (manifest run) gives 727 LOC / zone, no exemptions.json row; all 29 declaration ranges and the ~285/~212 row sums recompute from the map; the rows share no module-private state (only exported constants; emission→sequence leans solely on the `TeardownStep` type, sequence→emission one-directional through `emitTeardownDiagnostic` + builders); external consumers re-grep true (session-swap-tripwire.ts:26/139, production-theta-producer.ts:124-131/2083-2084, factory.ts:65/510 — 1-2 line drift) and the session-shutdown.ts:24 ↔ session-swap-tripwire.ts:26 value cycle is real; no spec cites the module file, module born combined at V9g (2f4ae337) so no reverted split; sole in-scope sibling (qw20260920183643-d4-01 call-labels) is a D4 on a different root; target seam is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified a third time from scratch: size-scan map (mktemp manifest) reproduces 727 LOC / zone with all 29 declaration ranges matching the two inventory rows (~285 sequence / ~212 emission) and no `src/extension/session-shutdown` key in quality/exemptions.json; opened 176-465 and 477-727 — the emission family takes `sink`/`entry`/`diagnostic` as parameters and shares no module-private state with the sequence (only the exported `TeardownStep` type and the exported code constants), the sequence leans one-directionally on `emitTeardownDiagnostic` + the three builders, so the rows are real distinct concerns; external emission consumers re-grep true (session-swap-tripwire.ts:26/83/139, production-theta-producer.ts:124-131/701/2083-2084, factory.ts:65/510) and the value cycle session-shutdown.ts:24 → session-swap-tripwire.ts → :26 back is real; no overlooked reason — docs/spec_topics never cites the module file, no D9 exemption row, not dispatch/data/generated, no ≥6-shared-locals algorithm spans the two rows (runBoundedDisposeAwait's locals are internal to it), git shows the module born combined (643fe3b4 V9g-T) with no deleted emission/teardown-* sibling so no reverted split; not a duplicate — PTQ-0306 (resolved) is factory.ts#createThetaExtension's callback and PTQ-0156/0139 are D2 on single exports, no tracked D9 on this host; only quibble is teardownStepFailedDiagnostic/reloadTeardownTimeoutDiagnostic/cancelledBySessionShutdownReason being sequence-only or 0/0 importers yet rowed under emission, which does not defeat the ≥2-concern inventory; the seam/home is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): accepted as confirmed - batch ruling, all D4/D9 intake items accepted.
