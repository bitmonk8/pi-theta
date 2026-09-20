---
id: pending
title: ProductionThetaProducer.runBinder sequences nine bind-pipeline phases in one 251-LOC method
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/production-theta-producer.ts:1035-1285
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/production-theta-producer.ts#ProductionThetaProducer.runBinder
d9_band: strong
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# ProductionThetaProducer.runBinder sequences nine bind-pipeline phases in one 251-LOC method

## Observation
`ProductionThetaProducer.runBinder` (src/extension/production-theta-producer.ts:1035-1285) is 251 LOC — strong band (threshold 200). It runs the frontmatter binder: bypass classification, model resolution, api gate, envelope/system-prompt/dispatch assembly, the checkpointed budgeted LLM call, cancellation arms, outcome routing, defaults merge, and the success echo.

## Evidence
Step inventory:

| phase | lines | LOC | locals written (read later by) |
|---|---|---|---|
| no-params early return + overflow note (SLSH-1) | 1035-1049 | 15 | params |
| bypass classification + bypass args (§Binder bypass) | 1050-1067 | 18 | decision |
| binder model resolution + defensive guard | 1068-1101 | 34 | binderModelRef, model |
| supported-api gate (bug 0417) | 1102-1131 | 30 | preAborted |
| envelope schema + BNDR-10 session context | 1132-1146 | 15 | envelopeSchema, sessionContext |
| dispatch ingredients (slug, system prompt, seed, lazy validator) | 1147-1185 | 39 | slug, fm, systemPrompt, compiledEnvelope, dispatch |
| checkpointed budgeted binder call (CANCEL-4, HC3) | 1186-1240 | 55 | signal, binderSite, okArgs, phase |
| cancellation arms + terminal outcome routing | 1241-1262 | 22 | outcome |
| defaults merge + AJV verdict + echo note (BND-1/BND-2) | 1263-1285 | 23 | binderArgs, merged |

Excerpt (1186-1191, the call phase boundary):
```ts
    const signal = binderInput.thetaAbort?.signal ?? createThetaAbort().signal;
    const binderSite: CheckpointSite = {
      file: binderInput.theta.slashName,
      line: 1,
      column: 1,
    };
```

## Why this is a problem
Strong band (251 LOC ≥ 200): presumption of breakdown; a strong concrete reason is required. Reasons considered and defeated: (a) spec-cited ordered step sequence — the body does enforce commented orderings (pre-call abort before api refusal, CANCEL-4; merge verdict before echo, BND-1) but each ordering spans two adjacent phases, not the whole body, and helper extraction preserves adjacency — no clause states a seam would interleave observable steps; (b) single algorithm with shared local state — concrete: model, envelopeSchema, sessionContext, dispatch, okArgs, phase cross phases (6 locals), but four of the nine phases end in early returns consuming none of them, and the dispatch-ingredient phase already packages five locals into the `dispatch` object — the state object exists; (c) closed enumeration — the routing switch is 10 LOC of a 251-LOC body; (d) generated / data-only — no; (e) measured cost / prior revert / human ruling — none found; no exemptions.json entry for this host.

## Suggested direction (non-binding, optional)
All hypotheses unproven. Seam A: dispatch-ingredient assembly (1132-1185) -> `#buildBinderDispatch(binderInput, params, model, sessionContext)` returning `BinderForcedToolDispatch` plus envelopeSchema — ~54 LOC (the `BinderForcedToolDispatch` interface at 879-887 already names the product). Seam B: the checkpointed call + cancellation arms (1186-1252) -> `#runBudgetedBinderCall(dispatch, binderInput)` returning the classified outcome or a cancelled marker — ~67 LOC. Seam C: bypass handling (1035-1067) -> `#applyBinderBypasses(binderInput, params)` — ~33 LOC.

## False-positive check
Band check: 251 LOC strong (map-quoted). Reasons-considered list above with defeating evidence. Exemptions check: no entry (quality/exemptions.json has only a member-level D8 entry for this file). Generated-code check: hand-authored. Spec-mirror check: not an enumeration host (the failure-class taxonomy switch lives in `#classifyBinderAttempt`, a separate host). Cited ranges re-read this session (offset 1035, 251 lines).

## Triage
verdict: questionable — accounting verified: size-scan map reproduces `| 1035-1285 | 251 | public | runBinder |` band strong (FN strong ≥200), excerpt at 1186-1191 verbatim, all nine row boundaries land on real early-return/phase edges and sum to 251; no D9 exemption for this #host key (only D8 #firstAdmittingArmProperties), sibling d9-01 files the file-level key so not a duplicate, PTQ-0421 is an unrelated misplacement; the one applicable keep-whole reason (single algorithm, ≥6 shared locals — my re-grep counts 7: params/model/envelopeSchema/sessionContext/dispatch/okArgs/phase cross phases) was considered, not overlooked, and its rebuttal checks out mechanically (envelopeSchema/slug/systemPrompt/model die inside the 1147-1185 `dispatch` construction; phases 7-9 read only dispatch/okArgs/phase/params), though the inventory's rows 1+2 and 5+6 are each one concern by the filing's own Seams C/A so "nine" overstates — target shape (and whether the shared-locals reason still holds against the REVIEW_LOG 2026-09-13 walkSessionContext/attachChildActivityTap keep-whole precedent) needs a human ruling (triage: claude-fable-5-1)
