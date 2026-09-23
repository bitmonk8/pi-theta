---
id: pending
title: binder-run.ts carries the whole extracted binder pipeline — six member clusters (bypass, model gate, dispatch assembly, budgeted call/classification, note emission, defaults merge/recovery) in one 1068-LOC file
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/binder-run.ts:1-1068
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/extension/binder-run.ts
d9_band: justify
wave: qw20260923145222
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-23
---

# binder-run.ts carries the whole extracted binder pipeline — six member clusters (bypass, model gate, dispatch assembly, budgeted call/classification, note emission, defaults merge/recovery) in one 1068-LOC file

## Observation
src/extension/binder-run.ts is 1068 LOC — justify band (FILE_BANDS justify >= 1000) per the authoritative map. Its header (lines 1-11) states the role: "The V11a frontmatter binder run for the production producer … classify the load-time bypass, resolve the binder model, drive the budgeted OFF-session forced-tool binder call, merge declared defaults behind the post-merge AJV boundary, and emit the binder system notes … — extracted verbatim from `ProductionThetaProducer`". The file is one class, `BinderRunner` (173-1068, 896 LOC), plus the deps interface and one module-level helper. The PTQ-1290 fix (commit f1b77776) created this file by moving the runBinder body out of production-theta-producer.ts; the new file-level host has never been dispositioned.

## Evidence
Distinct-concern inventory (all ranges read this session; LOC from the map's member table):

| concern | members | line ranges | LOC |
|---|---|---|---|
| bypass classification + SLSH-1 overflow note | #applyBinderBypassOrNull, #emitNoParamsOverflowNote | 258-277, 1057-1067 | 31 |
| binder-model resolution + bug-0417 supported-api gate | #resolveBinderModelOrRefuse | 303-348 | 46 |
| forced-tool dispatch + BNDR-10 session-context assembly | binderPromptParamField, #buildBinderDispatch, #buildBinderSessionContext | 155-164, 363-395, 806-838 | 76 |
| budgeted call drive + per-attempt classification + provider completion | #runBudgetedBinderCall, #classifyBinderAttempt, #completeBinderReply | 438-511, 619-742, 756-789 | 232 |
| system-note emission (BND-1 echo, BNDR-9 unsafe, bug-0397 failure, channel seams) | #systemNoteChannel, #buildGroupAEventOrFallback, #emitBinderEchoNote, #emitCustomTypeUnsafeNote, #emitBinderFailureNote | 183-194, 535-588, 849-858, 874-903 | 104 |
| defaults merge + recovery + outcome settle | MergedDeclaredDefaults, #settleBinderOutcome, #mergeDeclaredDefaults, recoverDeclaredDefaults | 116-120, 413-435, 936-966, 984-1040 | 116 |

`runBinder` (196-249, 54 LOC) is the orchestrator handing each cluster's result to the next. The clusters share only the two class fields `#input`/`#deps` (174-175); every other datum crosses cluster boundaries as an explicit parameter (`params`, `model`, `envelopeSchema`, `sessionContext`, `dispatch`, `call` in runBinder, 196-249). The defaults-recovery cluster is separately reachable from outside the run: `recoverDeclaredDefaults` is public and consumed by the invoke machinery via production-theta-producer.ts:286-287 → invoke-machinery.ts:677, independent of any binder call.

Excerpt (header, 1-7):
```ts
// The `V11a` frontmatter binder run for the production producer
// (production-theta-producer.ts): classify the load-time bypass, resolve the
// binder model, drive the budgeted OFF-session forced-tool binder call,
// merge declared defaults behind the post-merge AJV boundary, and emit the
// binder system notes (BND-1 echo, SLSH-1 overflow, failure modes) — extracted
// verbatim from `ProductionThetaProducer`, which delegates `runBinder` here
```

## Why this is a problem
Justify band (1068 >= 1000): presumption of breakdown, not filed only on a concrete recorded reason. Reasons considered and defeated: (a) single algorithm with shared local state — the class's only shared fields are `#input` and `#deps`; the six clusters communicate by explicit parameters (at most six locals in the runBinder pipeline, each handed forward once, strictly linear), and the note-emission and defaults-recovery clusters are invoked from outside the pipeline too; (b) closed-enumeration dispatch — no file-wide switch mirrors a spec table (the closed outcome routing is internal to #classifyBinderAttempt, one member); (c) data-only — 0% tables/type-family; (d) grammar production — not a parser; (e) generated — hand-written ("extracted verbatim" names a manual quality-fix move, commit f1b77776, not a generator). quality/exemptions.json has no key for this file.

## Suggested direction (non-binding, optional)
All hypotheses unproven. Seam A: system-note emitters (#emitBinderEchoNote, #emitCustomTypeUnsafeNote, #emitBinderFailureNote, #emitNoParamsOverflowNote) -> binder-run-notes.ts (hypothesis) — ~104 LOC, 0 exported symbols today, 0 external importers, cross-refs back: the channel/group-A seams (`#deps.systemNoteChannel`, `#deps.buildGroupAEventOrFallback`) and `#input.root.clock`. Seam B: defaults merge + recovery (#mergeDeclaredDefaults, recoverDeclaredDefaults, #settleBinderOutcome) -> binder-defaults-recovery.ts (hypothesis) — ~116 LOC, `recoverDeclaredDefaults` moves as the exported symbol (external consumers: production-theta-producer.ts:286, invoke-machinery.ts:677 via the deps record — 1 src importer of the class today), cross-refs back: `#input.root.schemaValidator`, the failure/echo emitters. Seam C: attempt classification (#classifyBinderAttempt, #completeBinderReply) -> binder-attempt-classify.ts (hypothesis) — ~160 LOC, 0 exported symbols today, cross-refs back: the `BinderForcedToolDispatch` record and OFF_SESSION_NORMAL_STOP_REASONS.

## False-positive check
Band: 1068 LOC / justify quoted from the shard's authoritative map. Reasons considered: all five concrete classes enumerated with defeating evidence above. Exemptions check: quality/exemptions.json has 4 entries, none keyed to this file. Generated-code check: hand-written (bug-numbered rationale comments; created by quality-fix commit f1b77776). Spec-mirror check: the header cites five spec narratives (binder-model-and-context.md, binder-inference.md, binder-bypass-and-envelope.md, defaulting-system-note-echo.md, slash-invocation.md) — several documents, not one closed spec-named set. Dedupe: PTQ-1190 and PTQ-1290 (both resolved/fixed) were keyed to src/extension/production-theta-producer.ts#ProductionThetaProducer.runBinder — the function host whose fix CREATED this file; no PTQ or intake filing carries src/extension/binder-run.ts as its host. Function-level dispositions recorded separately in this wave's notes (#classifyBinderAttempt and #runBudgetedBinderCall kept whole on their own evidence — this filing is the file-level host only).

## Triage
verdict: questionable — accounting verified: size-scan map reproduces 1068 LOC / band justify (FILE_BANDS justify=1000) with `BinderRunner` 173-1068 / 896 LOC plus the three interfaces and `binderPromptParamField`; all six inventory rows reproduce member-for-member at the cited lines and their LOC sums match the map's member table (31/46/76/232/104/116 = 605, remainder is `runBinder` 54 + ctor/fields/interfaces/imports), header excerpt byte-exact at 1-7; the class carries exactly two fields (`#input`, `#deps`, lines 174-175 — `#systemNoteChannel`/`#buildGroupAEventOrFallback` are 3/7-LOC delegating accessors), so no ≥6-shared-locals reason applies at file level (the 6-local linear pipeline is internal to the 54-LOC `runBinder` and the human already accepted that rebuttal on PTQ-1190/1290); `recoverDeclaredDefaults` is live outside the run (production-theta-producer.ts:286-287 → invoke-machinery.ts:677) as claimed; no D9 exemption for this file in quality/exemptions.json (4 rows, none keyed here), no keep-whole ruling on binder-run.ts in TRIAGE_LOG/REVIEW_LOG (REVIEW_LOG:888 records only the member-level keep-wholes for #classifyBinderAttempt/#runBudgetedBinderCall), git history is two commits with no reverted split; not a duplicate — PTQ-1190/PTQ-1290 (resolved/fixed) are keyed to `production-theta-producer.ts#ProductionThetaProducer.runBinder` and same-wave d9-02 carries `production-theta-producer.ts`; provenance nit only: f1b77776 is the PTQ-1285 file-level fix (Seam C "frontmatter binder run -> extension/binder-run"), not PTQ-1290's, which changes nothing about the untouched file-level host; which of Seams A/B/C and the target homes is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified: I re-ran size-scan map and got 1068 LOC / justify (FILE_BANDS justify=1000), with BinderRunner at 173-1068 (896 LOC) holding only the fields #input/#deps; all six inventory rows match the member table line-for-line, and the LOC adds up (20+11, 46, 10+33+33, 74+124+34, 3+7+54+10+30, 5+23+31+57 = 31/46/76/232/104/116); the header excerpt at 1-7 is exact; recoverDeclaredDefaults is reached from outside the class (production-theta-producer.ts:286-287 → invoke-machinery.ts:677). One small overstatement: the note emitters are private and only called inside the class (lines 207-507), so only the defaults-recovery cluster has an outside entry point, but the ≥2-concern inventory still holds. No reason to keep it whole was overlooked: no binder-run key in quality/exemptions.json, REVIEW_LOG:888 keeps only #classifyBinderAttempt/#runBudgetedBinderCall whole, the git history has two commits (f1b77776, 48b6a1b7) with no reverted split, and the header cites several spec topics rather than one closed table. Not a duplicate: PTQ-1190/1290 are keyed to production-theta-producer.ts#runBinder, and d9-02 covers production-theta-producer.ts. Which seam (A/B/C) and target home to use needs a human ruling (triage: claude-opus-5-5)
