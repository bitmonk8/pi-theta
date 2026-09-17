---
id: PTQ-0424
title: load-pre-eval.ts survives two removals as a 106-LOC module whose sole behaviour is one delegation statement to deliverOperatorNotePreferringEntry for one caller
lens: D9
status: fixed
verdict: confirmed
locations:
  - src/extension/load-pre-eval.ts:1-106
sites: 1
fix_scope: cross-module
d9_class: husk
wave: qw20260917121953
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-17
---

# load-pre-eval.ts survives two removals as a 106-LOC module whose sole behaviour is one delegation statement to deliverOperatorNotePreferringEntry for one caller

## Observation
src/extension/load-pre-eval.ts (106 LOC, header: "V4e — load-time pre-evaluation failure routing") exports a cause type, two one-member interfaces, and a factory whose returned router has exactly one method containing exactly one statement: a call to `deliverOperatorNotePreferringEntry` from `./system-note-channel` — the module's only import. Its single src caller, production-composition.ts, itself builds the very `channel` deps it hands in (`buildSystemNoteDeps` at :2027) and already imports from `./system-note-channel` directly (:97, :212).

## Evidence
Payload vs scaffolding (counted over the current file, read end to end this session):
- Executable payload: 1 statement (:105, `deliverOperatorNotePreferringEntry(note, deps.channel);`) inside the 14-LOC factory (:93-106).
- Type payload: `PreEvalFailureCause` union (:52-59, 8 LOC), `LoadPreEvalDeps` (one field, :62-70), `LoadFailurePreEvalRouter` (one method, :77-85) — 26 LOC, doc-comment dominated.
- Scaffolding: 40-LOC module header (:1-40), import block (:42-46), doc comments on every declaration — ≥ 66 of 106 LOC carry no declaration.

```typescript
export function createLoadFailurePreEvalRouter(
  deps: LoadPreEvalDeps,
): LoadFailurePreEvalRouter {
  return {
    routePreEvalFailure(note: SystemNote): void {
      // ...
      deliverOperatorNotePreferringEntry(note, deps.channel);
    },
  };
}
```

Member count before/after the moves (git log --follow): birth f419ff13/f701ba71 (2026-07-01) at 180 LOC with `routePreEvalFailure(cause, note)`, `crossRouteSlashLoadParams`, `SlashLoadParamsCrossRoute`, and imports of `arbitrate`/`depthWalk`/`renderBinderSystemNote`; commit 94e81974 (bug 0066, 2026-08-08, -80/+7) deleted `crossRouteSlashLoadParams` + `SlashLoadParamsCrossRoute`, re-homing the ERR-16 detection to `binder/defaulting.ts` (the header now says so at :29-34); commit 35df0ce3 (D2 fix PTQ-0162, 2026-09-10) removed the discarded `cause` parameter. Remaining: 4 declarations, one live statement.

Remaining callers (grep this session): 1 src file — production-composition.ts (:215-217 import, :2048 construction, :2063 the single `routePreEvalFailure` call) — plus 2 test files (tests/pre-evaluation-failures.test.ts, tests/b0435-fallback-diagnostic-reentry.test.ts). `PreEvalFailureCause`'s only src consumer is `preEvalCauseOf` in production-composition.ts:433; the router method takes no cause, so the type never flows back into this module. `LoadPreEvalDeps`/`LoadFailurePreEvalRouter`: 0/0 external importers (map).

## Why this is a problem
Alive-but-hollow survivor of a past move: the module's substantive behaviour (the ERR-16 cross-route detection/rendering and the per-cause discriminant) was moved or deleted (94e81974, 35df0ce3), leaving a payload-to-scaffolding ratio of ~1 executable statement + 26 type LOC against ≥ 66 LOC of header/doc/import scaffolding, one src caller, and a router that is a partial application of an already-exported function the caller already composes the argument for. D9's husk rule: re-home the remainder or dissolve.

## Suggested direction (non-binding, optional)
Hypothesis, unproven, human ratifies: dissolve — inline `deliverOperatorNotePreferringEntry(note, channel)` at production-composition.ts:2063 (the file already imports from `./system-note-channel`) and re-home `PreEvalFailureCause` beside its only producer/consumer `preEvalCauseOf` (production-composition.ts:433) or into system-note-channel.ts; the two one-member interfaces dissolve with the factory. Alternatively re-home the router into system-note-channel.ts as a named wrapper if the V4e seam name must survive for the two tests.

## False-positive check
Barrel/facade check: the module re-exports nothing (`grep "export .* from"` — 0 hits in the file); the header claims routing ownership, but the routing is one call into system-note-channel, so it is not a deliberate re-export facade. D2-deadness check: every remaining member has a live caller (factory :2048, method :2063, cause type :216/:433 + tests) — hollow, not dead; nothing routed to D2. Prior-filing check: PTQ-0162 (discarded cause), PTQ-0182/0184 (stale narration) are resolved D2 items about sentences and a parameter, none files the module-level husk. Git-history intent check: 94e81974's own header rewrite records the re-homing ("the cross-route has exactly one implementation" in binder/defaulting.ts), confirming the shrink was a move, not a planned facade.

## Triage
verdict: questionable — accounting verified: 106 LOC / 4 declarations (40 LOC) / 1 executable statement delegating to deliverOperatorNotePreferringEntry, 1 src caller (production-composition.ts) that already builds `channel` and imports system-note-channel, history f419ff13→94e81974(-80/+7)→35df0ce3 reproduces, not a re-export barrel and not exempted; whether to dissolve or keep the V4e seam name is a design ruling for a human (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-17): dissolve load-pre-eval.ts - inline the single deliverOperatorNotePreferringEntry call at the production-composition.ts call site (it already imports ./system-note-channel and builds the deps), re-home PreEvalFailureCause beside its only producer/consumer preEvalCauseOf in production-composition.ts, and delete the module with its two one-member interfaces. Keep the V4e spec citation as a comment at the inlined site; re-point (never weaken) the two tests that name the router.
