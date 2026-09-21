---
id: PTQ-1194
title: ProductionThetaProducer.#resolvePromptQuery builds eight query-dispatch collaborators in one 209-LOC method
lens: D9
status: fixed
verdict: confirmed
locations:
  - src/extension/production-theta-producer.ts:3835-4043
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/production-theta-producer.ts#ProductionThetaProducer.#resolvePromptQuery
d9_band: strong
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# ProductionThetaProducer.#resolvePromptQuery builds eight query-dispatch collaborators in one 209-LOC method

## Observation
`ProductionThetaProducer.#resolvePromptQuery` (src/extension/production-theta-producer.ts:3835-4043) is 209 LOC — strong band (threshold 200). It assembles the `QueryHostDispatch` for one `@`-query: schema lowering, respond-turn context, two text shapes, governor registration, the `LivePromptQueryModel` construction, the follow-up/validation collaborator, the loop config, and the inbound decode closure.

## Evidence
Step inventory:

| phase | lines | LOC | locals written (read later by) |
|---|---|---|---|
| deps intake + active tools + schema lowering (bug 0010) | 3853-3867 | 15 | typed, activeTools, lowered (respond, validation, decode) |
| respond-turn context build (QRY-14 step 2) | 3868-3880 | 13 | respond (model ctor, validation, return) |
| two text shapes: rendered vs typed-aware (QRY-6) | 3882-3901 | 20 | renderedText, queryText |
| governor registration + maxRounds (STAGE B / CIO-4) | 3903-3912 | 10 | maxRounds |
| LivePromptQueryModel construction (36-line options literal) | 3913-3952 | 40 | queryModelRef, queryModel, liveModel, model |
| follow-up drive + typed validation collaborator (QRY-22) | 3954-3986 | 33 | driveFollowUp, validation |
| QueryToolLoopConfig literal | 3988-4010 | 23 | config |
| inbound decode closure + returned dispatch | 4012-4043 | 32 | decodeInbound |

Excerpt (3913-3918, the model-construction boundary):
```ts
    const queryModelRef = deps.theta.frontmatter.model;
    const queryModel = this.#resolveThetaModel(queryModelRef, deps.ctx.model);
    const liveModel = new LivePromptQueryModel({
          pi: deps.pi,
          ctx: deps.ctx,
          clock: root.clock,
```

## Why this is a problem
Strong band (209 LOC ≥ 200): presumption of breakdown; a strong concrete reason is required. Reasons considered and defeated: (a) single algorithm with shared local state — concrete: lowered, respond, renderedText, queryText, maxRounds, liveModel cross phases (6 locals), but the phases form a linear producer-consumer chain (each is a `const` built from at most three predecessors), the exact shape a builder-helper split threads without a state object; (b) spec-cited critical section — the WHY-comments cite construction-order dependencies (model before validation, bug 0010 increment C) that a sequential helper chain preserves; no clause names an interleaving hazard; (c) closed enumeration — no; (d) generated / data-only — no; (e) measured cost / prior revert / human ruling — none found; no exemptions.json entry.

## Suggested direction (non-binding, optional)
All hypotheses unproven. Seam A: the 36-line `LivePromptQueryModel` options literal (3913-3952) -> `#buildLiveModelOptions(deps, queryText, activeTools, maxRounds, respond)` — ~40 LOC, no exports. Seam B: the typed-arm collaborators (validation + decodeInbound, 3954-3986 and 4012-4041) -> `#buildTypedQueryCollaborators(deps, lowered, liveModel, respond)` — ~60 LOC, both are `lowered !== undefined`-gated already so the arm is one unit. Seam C: none identified yet for the remainder.

## False-positive check
Band check: 209 LOC strong (map-quoted). Reasons-considered list above with defeating evidence. Exemptions check: no entry. Generated-code check: hand-authored. Spec-mirror check: not an enumeration host. Cited ranges re-read this session (offset 3835, 209 lines).

## Triage
verdict: questionable — accounting verified: size-scan map re-run gives #resolvePromptQuery 3835-4043 = 209 LOC, band strong (FN strong threshold 200); all eight phase ranges and the 3913-3918 excerpt match the current code; no quality/exemptions.json entry for the host; no reverted prior split in git log; the WHY-comments encode construction ordering (model before validation) not an interleaving invariant, so no strong reason applies (the ≥6-shared-locals concrete reason is real — 8 locals cross phases, and the model literal consumes 4 predecessors not ≤3 — but a concrete reason alone cannot defeat a strong-band presumption); not a duplicate of d9-01, whose host is the whole file. Target shape (seam A/B) needs a human ruling. (triage: claude-fable-5-1)
verdict: questionable — accounting verified: size-scan map re-run gives #resolvePromptQuery 3833-4041 = 209 LOC, band strong (FN strong 200; uniform −2 drift from the cited 3835-4043); all eight phase rows and the LivePromptQueryModel excerpt (now 3911-3916) match and each row builds a distinct collaborator; no D9 exemption for the host (file holds only D8:#firstAdmittingArmProperties); git -S shows no prior split/revert; the only applicable reason is the concrete ≥6-shared-locals one (my count: 11 locals cross rows, and the model literal consumes 5-6 predecessors, so the filing's "≤3 predecessors" dismissal is understated), but README.md:168 requires a STRONG reason at this band and none exists — no try/finally critical section, no spec clause pinning interleaving (the bug-0010 WHY-comments pin construction order only, unlike the cancellation.md-pinned d9-03); not a duplicate of d9-01 (d9_host = whole file, a distinct exemption key). Target shape needs a human ruling. (triage: claude-fable-5-1)
verdict: questionable — accounting verified: size-scan map re-run reproduces `#resolvePromptQuery — 3833-4041 — 209 LOC — band strong` (README.md:168, FN strong ≥ 200; uniform −2 drift from the cited 3835-4043); all eight inventory rows and the LivePromptQueryModel excerpt (now 3914-3919) match the current code, each row writing its own `const` collaborator (lowered/respond/renderedText+queryText/maxRounds/liveModel/validation/config/decodeInbound); quality/exemptions.json holds only the D8 `#firstAdmittingArmProperties` row for this file, no D9 key; git log -S shows only the introducing/renaming commits (2bc69157, 4866d4d2, 35df0ce3, 89faa7c5), no prior split or revert; reason (a) is understated in the filing — 11 locals cross rows (typed, activeTools, lowered, respond, renderedText, queryText, maxRounds, liveModel, model, validation, config) and the model literal consumes 6 predecessors — but that is the CONCRETE ≥6-shared-locals reason, and README.md:168 requires a STRONG one at this band: no try/finally or arm/disarm critical section exists in 3851-4040, the bug-0010 WHY-comments (3904-3910) pin construction order only, and no spec clause pins interleaving; not a duplicate — 202922-d9-01 keys the whole file and merely lists this member in its typed-query cluster row, 223212-d9-01/d9-03 key #driveSubagentFnEntry and LivePromptQueryModel.driveRepairAttempt, and resolved PTQ-0118 was the D2 dead-arm fix inside driveFollowUp, not a breakdown. Target shape (seam A/B) needs a human ruling. (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): accepted as confirmed - batch ruling, all D4/D9 intake items accepted.
