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
verdict: questionable — accounting re-verified independently: size-scan map gives `| 1033-1283 | 251 | public | runBinder |` band strong (FN strong ≥200; a 2-line drift from the filed 1035-1285 caused by commit 0fb4497e removing two lines above the method — the body itself is unchanged), the filing's internal row lines were already off by up to 8 but every row edge lands on a real early-return/comment boundary (my recount 14/18/30/30/15/36/58/20/30 = 251); no D9 exemption for this #host key, PTQ-0421 is a provider-error-mapping.ts misplacement and same-wave d9-01 is the file-level key, so not a duplicate; reason (b) was considered not overlooked — cross-row locals are 7 (params/model/envelopeSchema/sessionContext/dispatch/okArgs/phase; the filing's 6 omits params but concedes the threshold), and its rebuttal is mechanically true (after 1175 only dispatch/params/okArgs/phase are read; no try/finally, loop accumulator, or arm/disarm section spans rows — unlike the rejected d9-03 and the walkSessionContext/attachChildActivityTap keep-wholes), though rows 1+2, 5+6, 7+8 are each one concern so the honest inventory is ~6 not nine; whether linear dataflow through 7 locals defeats the shared-locals keep-whole reason, and the seam shape, need a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified a third time from a clean read: size-scan map `| 1033-1283 | 251 | public | runBinder |` band strong (FN_BANDS.strong=200; filed 1035-1285 is a 2-line drift from 0fb4497e's 9+/10- edit above the method, body text unchanged), excerpt byte-exact at 1184-1189, my row recount on the current lines 14/18/30/30/15/36/58/20/30 = 251 with every edge on a `return`/comment boundary; exemptions.json has only `D8:…#firstAdmittingArmProperties` (no D9 key for this host); not a duplicate — PTQ-0421 sits in quality/resolved/ as a provider-error-mapping.ts misplacement and same-wave d9-01 carries the file-level d9_host, which lists runBinder only as one member of an ~830-LOC cluster row; reason (b) was considered, not overlooked — I count 7 cross-row locals (params→rows 2/5/6/9, model→4/6, envelopeSchema→6, sessionContext→6, dispatch→7, okArgs→9, phase→8), the filing's 6 omits `params` but already concedes the ≥6 bar and argues a rebuttal that is mechanically true (four rows end in early returns reading none of them; rows 7-9 read only dispatch/okArgs/phase/params; no try/finally, no loop accumulator, no arm/disarm spanning rows — the d9-03 rejection and the 2026-09-13 walkSessionContext/attachChildActivityTap keep-wholes all turned on exactly those features, absent here); inventory is honestly ~6 concerns (rows 1+2 bypass, 5+6 dispatch build, 7+8 call+route) still ≥2; whether a linear seven-local dataflow defeats the shared-locals keep-whole reason, and which seam to cut, is a design decision for a human ruling (triage: claude-fable-5-1)
