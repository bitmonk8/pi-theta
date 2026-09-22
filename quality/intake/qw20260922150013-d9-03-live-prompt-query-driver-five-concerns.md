---
id: pending
title: live-prompt-query-driver.ts bundles the on-session turn driver, the turn-settlement predicate family, the respond-capture contract, repair-outcome mapping, and the off-session forced respond dispatch in one 1685-LOC module
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/live-prompt-query-driver.ts:1-1685
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/extension/live-prompt-query-driver.ts
d9_band: justify
wave: qw20260922150013
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-22
---

# live-prompt-query-driver.ts bundles the on-session turn driver, the turn-settlement predicate family, the respond-capture contract, repair-outcome mapping, and the off-session forced respond dispatch in one 1685-LOC module

## Observation

src/extension/live-prompt-query-driver.ts is 1685 LOC (justify band). Its own header states three jobs: "Live prompt-query turns, turn settlement, and off-session forced respond dispatch." (line 1). The module was created by the ratified fix of PTQ-1150 (Seam B moved LivePromptQueryModel plus its satellites out of production-theta-producer.ts wholesale); the bundle itself was never re-examined. Sole src importer: production-theta-producer.ts (imports at line 36, `export * from "./live-prompt-query-driver"` at line 37).

## Evidence

Distinct-concern inventory (declarations and LOC from the wave's structural map):

| concern | members | line ranges | LOC |
|---|---|---|---|
| respond-capture contract (tool identity, one-shot slot, execute result) | RESPOND_TOOL_DESCRIPTION, RESPOND_CAPTURED_TEXT, RESPOND_REPEAT_TEXT, ActiveRespondCapture, RespondCaptureHost, RespondTurnContext, RespondToolExecuteResult, respondToolExecuteResult, respondToolEntry | 26-114, 1462-1468 | ~70 |
| live on-session turn driver | LivePromptQueryPi, LivePromptQueryCtx, LivePromptQueryModel (37 members) | 125-1082 | ~940 |
| turn-settlement polling model (bounds + settled-turn predicates) | POLL_INTERVAL_MS, PRE_SEND_GATE_POLL_BOUND, TURN_START_POLL_BOUND, TURN_END_POLL_BOUND, TURN_END_SETTLE_BOUND_MS, WAIT_FOR_IDLE_BOUND_MS, TURN_SETTLE_POLL_BOUND, macrotask, isSettledTurnEnding, turnSliceSince, thisTurnSettled, trailingCompactionUnanswered | 1085-1240 | ~55 |
| repair-outcome mapping | mapForcedTurnToRepairOutcome | 1267-1295 | 29 |
| off-session forced respond dispatch (auth, reply classification, complete() dispatch) | OffSessionRequestAuth, resolveRegistryAuth, assistantText, OffSessionCompletion, OFF_SESSION_NORMAL_STOP_REASONS, classifyOffSessionReply, dispatchForcedRespondTurn | 1298-1682 | ~290 |

The off-session family is a module-private pipeline dispatching through pi-ai `complete()` off-session ("dispatch ONE typed-query forced respond turn OFF-SESSION through pi-ai's `complete()` free function", doc at 1471-1475); the class reaches it through exactly two call sites (`#dispatchRespondOverWindow` line 699, `forcedRespondTurn` line 528). The settlement predicates are pure functions over `Message[]`/`SessionEntry[]` with no class state, consumed by the class at three sites (`thisTurnSettled` at 901, 997; `#pollWhile` bounds).

## Why this is a problem

Justify band: presumption of breakdown unless a concrete keep-whole reason is found. Reasons considered: (a) single algorithm with shared local state — fails: the five clusters share no locals; the class talks to the off-session dispatcher through one function call carrying a `RespondTurnContext` value, and the predicates take plain message arrays; (b) closed-enumeration dispatch — fails: no spec-named arm table spans the module; (c) data-only module — fails: <10% of LOC are declarations/tables; (d) generated code — no generator; (e) human ruling — quality/exemptions.json carries no entry for this path (checked; only 4 entries, none matching). The PTQ-1150 seam that minted this module was recorded there as a hypothesis ("All hypotheses unproven"), not a ruling on this module's internal shape.

## Suggested direction (non-binding, optional)

All hypotheses unproven. Seam A: off-session forced respond dispatch (1298-1682) -> `extension/off-session-respond-dispatch` (hypothesis) — ~385 lines, exported symbols moved: resolveRegistryAuth, OFF_SESSION_NORMAL_STOP_REASONS, dispatchForcedRespondTurn (external importers today: 0 src direct; production-theta-producer re-exports `*`), cross-references back into the host: RespondTurnContext, respondToolEntry, RESPOND_TOOL_DESCRIPTION. Seam B: turn-settlement bounds + predicates (1085-1240) -> `runtime/turn-settlement` or `extension/turn-settlement` (hypothesis) — ~155 lines, exported symbol moved: TURN_END_SETTLE_BOUND_MS (1/0 importers per map), cross-references back: none (pure functions). Seam C: respond-capture contract types (26-136, 1462-1468) -> `extension/respond-capture` (hypothesis) — ~120 lines, exported symbols moved: RESPOND_CAPTURED_TEXT, RESPOND_REPEAT_TEXT, respondToolExecuteResult (0 direct src importers), cross-references back: none.

## False-positive check

Band check: 1685 LOC, justify per the wave map (never recounted by hand). Reasons-considered list recorded above with what defeated each. Exemptions check: quality/exemptions.json holds no D9 entry for this path. Generated-code check: hand-written (bug-numbered prose comments throughout, no generator banner). Spec-mirror check: no docs/spec_topics enumeration is mirrored by the module's top-level structure. Duplicate check: searched quality/{issues,intake,resolved} for "live-prompt-query-driver" — only PTQ-1150 (fixed, different host: production-theta-producer.ts) and this wave's D2 filing name it; no prior breakdown finding against this host. Note: the in-file D4-adjudication comment at 1148-1156 (settled-turn predicate deliberately NOT shared with tests/live/harness.ts) constrains Seam B's target surface, not its extraction.

## Triage
verdict: questionable — accounting verified: size-scan map reproduces 1685 LOC / band justify for src/extension/live-prompt-query-driver.ts; all 32 top-level declarations match the five inventory rows' names and line ranges exactly (respond-capture 26-114 + 1462-1468, LivePromptQueryModel 152-1082, settlement bounds/predicates 1085-1240, mapForcedTurnToRepairOutcome 1267-1295, off-session family 1298-1682); the module-level families contain zero `this.` accesses and the class reaches them only through calls at 527/613/699 (dispatchForcedRespondTurn — three sites, not the filed two; immaterial) and 902/997 (thisTurnSettled) carrying a RespondTurnContext value or plain Message[]/SessionEntry[], so the clusters share no fields or locals; no overlooked reason (header line 1 names three jobs, not one spec invariant; type/const LOC ≈ 204 ≈ 12 % not ≥ 80 %; no generator banner; quality/exemptions.json's four keys carry no entry for this path; 4-commit git log shows no reverted split — the file was minted by PTQ-1150's Seam B whose triage notes rule only on the parent host); minor filing drift: dispatchForcedRespondTurn is NOT exported (line 1684 exports only OFF_SESSION_NORMAL_STOP_REASONS/resolveRegistryAuth from that family) — immaterial to the inventory; not a duplicate — PTQ-1150 is resolved against production-theta-producer.ts and same-wave d9-04 targets the member-level host #driveUserVisibleTurn; which seams and homes to cut is a design decision requiring a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified (re-triage): size-scan map reproduces 1685 LOC / band justify; all 32 top-level declarations land in the five inventory rows at the cited ranges (26-114 + 1462-1468 respond-capture, 125-1082 driver class, 1085-1240 settlement bounds/predicates, 1267-1295 mapForcedTurnToRepairOutcome, 1298-1682 off-session family); the only `this.` outside 152-1082 is in a doc comment at line 120, so the module-level families hold no class state and the class reaches them solely by value-passing calls at 527/612-613/679/699 (dispatchForcedRespondTurn/mapForcedTurnToRepairOutcome) and 902/997 (thisTurnSettled over readMessages()/readContextPath()) — rows are distinct concerns, not adjectives; no overlooked keep-whole reason (header line 1 names three jobs; no spec-arm table; type/const LOC far below 80 %; hand-written; quality/exemptions.json's four keys carry no D9 entry for this path; git log = 4 quality commits since PTQ-1150 minted the file, no reverted split); sole importer production-theta-producer.ts:36-37 re-exports `*`, but the module is a 1685-LOC implementation, not a barrel; filing drift (dispatchForcedRespondTurn not exported; two vs three dispatch call sites) is immaterial; not a duplicate — PTQ-1150 is resolved against the parent host and same-wave d9-04 targets #driveUserVisibleTurn; which seams/homes to cut needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified (third independent pass): size-scan map reproduces 1685 LOC / band justify with 32 top-level declarations that land exactly in the five inventory rows (26-114 + 1462-1468 respond-capture, 125-1082 driver, 1085-1240 settlement bounds/predicates, 1267-1295 mapForcedTurnToRepairOutcome, 1298-1682 off-session family); the only `this.` outside 152-1082 is the doc comment at line 120, and the class reaches the module-level families solely through value-passing calls at 527/613/699 (dispatchForcedRespondTurn — three sites, not two; immaterial), 612/679 (mapForcedTurnToRepairOutcome) and 902/997 (thisTurnSettled over readMessages()/readContextPath()), so no row shares fields or locals; no overlooked keep-whole reason (header line 1 names three jobs, no spec-arm table, type/const LOC far below 80 %, hand-written, quality/exemptions.json has no D9 row for this path, 4-commit git log shows no reverted split, PTQ-1150 triage notes rule only on the parent host); sole importer production-theta-producer.ts:35-36 re-exports `*` but the module is a 1685-LOC implementation, not a barrel; not a duplicate — PTQ-1150 is resolved against production-theta-producer.ts and qw20260922164435-d9-01 targets that residual host; which seams/homes to cut is a design decision requiring a human ruling (triage: claude-fable-5-1)
