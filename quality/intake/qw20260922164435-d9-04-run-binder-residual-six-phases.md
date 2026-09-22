---
id: pending
title: runBinder remains 187 LOC across six sequential bind phases after the PTQ-1190 extraction
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/production-theta-producer.ts:1024-1210
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/production-theta-producer.ts#ProductionThetaProducer.runBinder
d9_band: justify
wave: qw20260922164435
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-22
---

# runBinder remains 187 LOC across six sequential bind phases after the PTQ-1190 extraction

## Observation
`ProductionThetaProducer.runBinder` (src/extension/production-theta-producer.ts:1024-1210) is 187 LOC — justify band (threshold 100) after PTQ-1190's fix extracted the budgeted attempt loop into `#runBudgetedBinderCall` (1213-1286). The residual body still runs the whole frontmatter bind end-to-end: bypass classification, binder-model resolution and api gating, envelope/session-context assembly, the forced-tool dispatch construction, outcome routing, and the defaults merge + echo tail.

## Evidence
Fresh step inventory (anchors re-read at filing time):

| phase | lines | LOC | locals written (read later by) |
|---|---|---|---|
| no-params/bypass classification + early returns | 1024-1056 | 33 | params (all later phases), decision |
| binder-model resolve + defensive guard + api gate | 1074-1115 | 42 | binderModelRef, model (dispatch), preAborted |
| envelope schema + BNDR-10 session context + unsafe abort | 1116-1135 | 20 | envelopeSchema (slug, dispatch), sessionContext (systemPrompt) |
| forced-tool dispatch assembly (slug, seed, system prompt, lazy validator) | 1142-1166 | 25 | slug, fm, systemPrompt, compiledEnvelope, dispatch |
| budgeted call + terminal-outcome routing | 1167-1181 | 15 | call, outcome |
| defaults merge + post-merge AJV verdict + echo | 1182-1210 | 29 | binderArgs, merged |

Excerpt (1167-1171, the already-extracted seam boundary):
```ts
    const call = await this.#runBudgetedBinderCall(dispatch, binderInput);
    if (call === undefined) {
      return { bound: false };
    }
```

## Why this is a problem
Justify band (187 LOC ≥ 100): presumption of breakdown; not filed only on a concrete reason. Reasons considered and defeated: (a) single algorithm with shared local state — the phases are strictly sequential and each hands at most three locals forward (`params`, `model`, `envelopeSchema`/`sessionContext`, `dispatch`, `call`, `merged`); no phase pair shares 6+ locals; (b) closed-enumeration dispatch — the closed outcome routing lives in the extracted `#classifyBinderAttempt`/`#runBudgetedBinderCall`, not here; this body is a pipeline, not a switch; (c) data-only — 0% tables; (d) grammar production / generated code — not applicable (hand-authored runtime method); (e) prior split reverted — the opposite: the PTQ-1190 extraction landed and stuck; (f) exemptions — quality/exemptions.json has no row for this host key.

## Suggested direction (non-binding, optional)
All hypotheses unproven. Seam A: forced-tool dispatch assembly (1142-1166) -> `#buildBinderDispatch(model, envelopeSchema, sessionContext, binderInput)` (hypothesis) — ~25 LOC, 0 exported symbols, 0 external importers, cross-refs back: `this.#input.root.schemaValidator` for the lazy validator. Seam B: bypass classification (1029-1056) -> `#applyBinderBypassOrNull(binderInput, params)` (hypothesis) — ~28 LOC, 0 exported symbols, cross-ref back: `#emitNoParamsOverflowNote`. Seam C: defaults merge + verdict + echo tail (1182-1210) -> `#settleBinderOutcome` (hypothesis) — ~29 LOC, cross-refs back: `#mergeDeclaredDefaults`, `#emitBinderFailureNote`, `#emitBinderEchoNote`.

## False-positive check
Band check: 187 LOC justify (map-quoted). Reasons-considered list above with defeating evidence per reason. Exemptions check: no D9 row for this host in quality/exemptions.json. Generated-code check: hand-authored. Spec-mirror check: the body cites SLSH-1, BND-1/2/3, BNDR-10, CANCEL-4 across binder-model-and-context.md / binder-inference.md / defaulting-system-note-echo.md — several clauses, not one closed spec-named set with short arms. Duplicate check: PTQ-1190 (same host key) is resolved/fixed — this is the post-fix residual with a fresh six-phase inventory, per the residual-refiling pattern; no pending intake filing names this host.

## Triage
verdict: questionable — accounting verified: size-scan map reproduces `| 1024-1210 | 187 | public | runBinder |` band justify (FN justify ≥100) with `#runBudgetedBinderCall` at 1213-1286 as PTQ-1190's landed extraction, excerpt byte-exact at 1167-1171, every row edge lands on a real return/construction boundary (1056/1115/1135/1166/1181; the skipped 1057-1073 and 1136-1141 are comment preambles) though rows 3+4 are one dispatch-build concern and row 5 is 15 LOC of glue so the honest inventory is ~4 concerns, still ≥2; no D9 exemption for this #host key (only D8 #firstAdmittingArmProperties); not a duplicate — PTQ-1190 is resolved/fixed (batch-ratified 2026-09-21 with no keep-whole clause on the residual) and same-wave d9-01 carries the file-level key; reason (b) is not overlooked but the filing's per-pair framing understates it — my cross-phase count is exactly 6 locals (params/model/envelopeSchema/sessionContext/dispatch/call), meeting the ≥6 bar, with the same linear-dataflow rebuttal (four early returns reading none forward, no loop accumulator/try-finally spanning rows) that the human already accepted on this host at 7 locals; whether a second cut is worth it after the first extraction, and which of Seams A/B/C, is a design decision for a human ruling (triage: claude-fable-5-1)
