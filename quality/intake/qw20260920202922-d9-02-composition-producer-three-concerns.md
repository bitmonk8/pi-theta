---
id: pending
title: theta-composition-producer.ts bundles the conversation-binding seam-contract type family, the dispatch composition, and the runtime-defect note framing
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/theta-composition-producer.ts:1-756
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/theta-composition-producer.ts
d9_band: zone
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# theta-composition-producer.ts bundles the conversation-binding seam-contract type family, the dispatch composition, and the runtime-defect note framing

## Observation
`src/extension/theta-composition-producer.ts` is 756 LOC (zone band). Its header (lines 1-32) states the module owns one thing — "the producer seam ... `composeThetaFixture(theta, deps)`" (spec: `extension-bootstrap-and-per-theta.md` §"Per-theta registration"). The file in fact carries three declaration groups: a ~290-LOC interface family that is the seam contract, the composition function itself, and an ~85-LOC runtime-defect-to-note framing block whose spec anchor is a different document (`error-model.md` §"Runtime panics") and whose body is built almost entirely from `runtime/` panic machinery.

## Evidence
Distinct-concern inventory (line ranges and LOC from the structural map):

| concern | members | line ranges | LOC |
|---|---|---|---|
| conversation-binding seam-contract type family | ThetaCompositionInput, BinderRunInput, BinderRunResult, DrivenConversation, ConversationBindInput, ConversationBindingCommon, BodyExecutingConversationBinding, SelfDrivenConversationBinding, ConversationBinding, ThetaProducerDeps | 122-455 | ~289 |
| dispatch composition (binder → mode route → drive → surface) | paramBindingsFrom, composeThetaFixture (incl. nested `run`) | 96-113, 476-674 | ~217 |
| runtime-defect note framing (error-model.md §Runtime panics) | INTERNAL_ERROR_PREFIX, ZERO_BODY_RANGE, surfaceDispatchDefect | 71-81, 685-756 | ~85 |

Affinity of the third group: `surfaceDispatchDefect` (685-756) reads 6 foreign symbols from `../runtime/runtime-panics` and `../runtime/tool-call-off-surface` (`HostFatal`, `isThetaPanic`, `completePanicSite`, `renderPanicSuffixLines`, `surfaceUnexpectedThrow`, `ToolReturnShapeDefectError`) against 3 host members (`theta.sourcePath`, `theta.slashName`, `deps.emitPanicNote`). Excerpt (685-696):

```typescript
function surfaceDispatchDefect(
  thrown: unknown,
  theta: ThetaCompositionInput,
  deps: ThetaProducerDeps,
): void {
  if (thrown instanceof HostFatal) {
    // NOCEIL-3 (hard-ceilings): a host fatal is the ONLY thing that propagates —
    // re-raise it (fail-fast); it never reaches `emitPanicNote`.
    throw thrown;
  }
```

Structural-map importer counts: the type family is the file's dominant external surface — `ConversationBindInput` 1/49, `ThetaProducerDeps` 1/10, `BinderRunInput` 1/8, `BinderRunResult` 1/7, `ThetaCompositionInput` 6/118 — while `composeThetaFixture` itself has 1 src / 15 test importers and `surfaceDispatchDefect` is unexported (0/0).

## Why this is a problem
Zone-band file: no presumption, so the finding rests on the inventory above — three declaration groups with two distinct spec anchors (`extension-bootstrap-and-per-theta.md` for rows 1-2; `error-model.md` §"Runtime panics" plus `code-registry-runtime.md` for row 3) and disjoint external consumption (the type family is imported by 118 test sites and 6 src modules independently of the composition function). Reasons considered: closed-enumeration dispatch — defeated: the file is a contract + a composition + a framing block, not one enumeration; single algorithm with shared local state — applies inside `composeThetaFixture`'s `run` (dispositioned separately, kept whole) but not across the three groups: `surfaceDispatchDefect` shares no locals with `run` (it receives `thrown`/`theta`/`deps` by parameter at its 2 call sites); data-only module — defeated: type declarations are ~289 of 756 LOC (38%, under the 80% bar); generated code — no.

## Suggested direction (non-binding, optional)
Seam A (hypothesis, unproven): the runtime-defect note framing (`INTERNAL_ERROR_PREFIX`, `ZERO_BODY_RANGE`, `surfaceDispatchDefect`) -> `extension/dispatch-defect-surface.ts` (name hypothetical) — ~85 LOC, 0 exported symbols today (would export `surfaceDispatchDefect`), 0 external importers, cross-references back into the host: 2 call sites inside `run` plus the `ThetaCompositionInput`/`ThetaProducerDeps` parameter types. Seam B (hypothesis, unproven): the seam-contract type family -> `extension/theta-composition-contract.ts` — ~289 LOC, 10 exported types moved, external importers 6 src / 118+ tests via `ThetaCompositionInput` et al., cross-references: none back into the host (types only). None further identified.

## False-positive check
Band: zone (756 LOC, threshold 600), filed on the ≥2-concern inventory as required. Reasons-considered list recorded above with the evidence defeating each. Exemptions check: map band is "zone", no EXEMPT ruling. Generated-code check: hand-written, spec-citation header. Spec-mirror check: `surfaceDispatchDefect`'s two arms mirror the closed defect set of error-model.md — that defends the function's own length (kept whole at 72 LOC), not the file's bundling. All cited ranges (71-81, 96-113, 476-674, 685-756) re-read before filing; affinity counts taken from the import list and the function body read in full.

## Triage
verdict: questionable — accounting verified: size-scan reproduces 756 LOC/zone with no exemption; the three cited ranges match; surfaceDispatchDefect shares no locals with `run` (2 parameterised call sites), cites a different spec (error-model.md §Runtime panics) and leans on 6 runtime/ panic symbols vs 3 host members; type family is 290/756 LOC (38 %) with 6 independent src importers; no overlooked reason (no enumeration, grammar, generated code, prior split or exemption) — target shape (whether the contract types and the composition are one seam or two) needs a human ruling (triage: claude-fable-5-1)
