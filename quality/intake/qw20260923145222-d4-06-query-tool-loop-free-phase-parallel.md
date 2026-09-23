---
id: pending
title: Query tool loop free-phase turn handling is parallel in typed and untyped drivers
lens: D4
status: intake
verdict: pending
locations:
  - src/runtime/query-tool-loop.ts:353-448
  - src/runtime/query-tool-loop.ts:468-535
sites: 2
fix_scope: module
d4_class: parallel
wave: qw20260923145222
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-23
---

# Query tool loop free-phase turn handling is parallel in typed and untyped drivers

## Observation
`src/runtime/query-tool-loop.ts` contains two query drivers: `runUntypedQueryLoop` for `@`-queries and `runTypedQueryLoop` for `@<T>`-queries. The typed driver documents that its free phase "advances exactly as for an untyped query" before it dispatches the exempt forced-respond turn. Both functions contain a `for (;;)` loop that calls `model.nextFreePhaseTurn(round)` and then switches over the same `FreePhaseTurn` discriminant (`transport`, `text`, default/`tool_use`). Both loops must enforce the same CIO-4 slot accounting (one slot per `tool_use` round), the same cancellation surfacing rules for in-flight transport failures, and the same terminating-text boundary. The loops are not byte-identical because their outcomes carry different record shapes, but the turn-kind dispatch is a parallel implementation of the same protocol.

## Evidence

**Pass 1 — untyped free phase**
`src/runtime/query-tool-loop.ts:353-448`
```typescript
    const turn = await model.nextFreePhaseTurn(round);
    if (turn.kind === "transport") {
      if (signal.aborted) {
        return { kind: "cancelled", committed };
      }
      return { kind: "transport", error: turn.error, rounds, committed };
    }
    if (turn.kind === "text") {
      if (signal.aborted) {
        return { kind: "cancelled", committed };
      }
      return { kind: "text", text: turn.text, rounds, committed };
    }

    const effects = await model.runToolBatch(turn.batch, round);
    committed.push(...effects);
    slotCount += 1;
```

**Pass 2 — typed free phase**
`src/runtime/query-tool-loop.ts:468-535`
```typescript
    const turn = await model.nextFreePhaseTurn(round);
    if (turn.kind === "transport") {
      if (signal.aborted) {
        return { kind: "cancelled", committed };
      }
      return {
        kind: "transport",
        error: turn.error,
        rounds,
        forcedRespond: { dispatched: false, countedAgainstMaxRounds: false, slotCountAtDispatch: slotCount },
        committed,
      };
    }
    if (turn.kind === "text") {
      break;
    }

    const effects = await model.runToolBatch(turn.batch, round);
    committed.push(...effects);
    slotCount += 1;
```

**Parallel coverage claim:** both loops switch over the same three `FreePhaseTurn` arms (`transport`, `text`, implicit `tool_use`). They agree on cancellation surfacing for `transport` (theta-signal-aborted → cancelled, otherwise transport error), on treating `text` as a terminating boundary, and on incrementing `slotCount` by one per `tool_use` round. They differ only in the outcome payload shapes, because the typed loop must later dispatch the forced-respond turn.

## Why this is a problem
This is the parallel class: two passes over the same `FreePhaseTurn` discriminant that must stay in step. CIO-4 slot accounting, PIC-50/51 transport classification, and cancellation surfacing (bug 0010/0012) are load-bearing invariants. If the untyped loop changes how it counts a parallel `tool_use` batch or how it maps an aborted-signal transport turn, but the typed loop is not updated, the two query modes will diverge on the same provider transcript. The comments in both functions explicitly note they are mirroring each other, which confirms the parallel relationship.

## Suggested direction (non-binding, optional)
The shared source of truth is the `FreePhaseTurn` protocol and CIO-4 free-phase rules in `query/query-tool-loop.md`. The fix stage could consider extracting a shared free-phase driver that returns either a terminating outcome or the accumulated rounds/committed state plus the final turn, leaving the typed loop to dispatch the forced-respond turn separately.

## False-positive check
- Re-read both cited spans at HEAD; both functions are live and are the main query-loop entry points.
- Verified `FreePhaseTurn` is a single three-arm union (`tool_use`, `text`, `transport`) used by both loops.
- Checked `quality/issues/` for existing filings mentioning `runUntypedQueryLoop`, `runTypedQueryLoop`, or query-tool-loop parallelism; none found.
- The similarity is not incidental: the typed loop's own comment says it advances "exactly as for an untyped query," and the untyped loop's comment says it mirrors the typed loop's F1 guard.

## Triage
verdict: questionable — accounting verified: `FreePhaseTurn` is a 3-arm union (query-tool-loop.ts:98-118: tool_use/text/transport) and both live drivers (callers effectful-statement-host.ts:283/319) dispatch over all three arms inside the cited spans (untyped 399-431, typed 506-529): identical transport arm (signal.aborted→cancelled else transport), text arm terminates (untyped returns text after an aborted re-check; typed breaks to the boundary re-check at 540 — same surfacing), tool_use arm `runToolBatch` + `slotCount += 1` + rounds.push in both; clone-scan map lists no group for the file (diverged payloads: untyped also threads lastToolName/lastTurnText for ERR-19 exhaustion), so this is a hand-verified parallel, not a mechanical dedupe; not a duplicate — PTQ-1185 (resolved D9 breakdown of runTypedQueryLoop) named the free phase only as a seam inside one function and the loop is still inline at HEAD, and REVIEW_LOG:666 left this pair deliberately unfiled without a human ruling; whether a shared free-phase driver is the right source of truth is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified: `FreePhaseTurn` is a 3-arm union (query-tool-loop.ts:98-118), and both live drivers (called at effectful-statement-host.ts:283/319) handle all three arms. Untyped is at 399-431 and typed at 506-529. The transport arm is the same in both (aborted signal → cancelled, otherwise transport). The text arm terminates in both, with the same cancel surfacing: untyped re-checks inline, typed re-checks at the boundary at 540. The tool_use arm is `runToolBatch` + `slotCount += 1` + rounds.push in both. clone-scan map reports no groups for the file. The copies diverge in two ways the filing does not list: untyped also threads lastToolName/lastTurnText, and the max_rounds branch returns exhausted in untyped but breaks to the forced respond in typed. So this is a genuine parallel, not a mechanical dedupe. Not a duplicate: resolved PTQ-1185 (D9) named the free phase only as a seam inside runTypedQueryLoop and the loop is still inline, and REVIEW_LOG:666 left the pair unfiled without a human ruling. A shared free-phase driver as the source of truth is a design decision for a human ruling (triage: claude-opus-5-5)
verdict: questionable — accounting verified: `FreePhaseTurn` is a 3-arm union (tool_use/text/transport, query-tool-loop.ts:98-118). Both live drivers (called at effectful-statement-host.ts:283 and :319) handle all three arms at HEAD. Untyped is at 399-431 and typed at 506-529. The transport arm is the same in both: aborted signal → cancelled, otherwise transport. The text arm ends the free phase in both: untyped re-checks the abort inline, typed re-checks at the boundary (540). The tool_use arm is runToolBatch + `slotCount += 1` + rounds.push in both. clone-scan map reports no groups for the file, so this is a hand-verified parallel. It is not a mechanical dedupe, because the copies differ in ways the filing does not list: the untyped excerpt drops interleaved lastToolName/lastTurnText tracking, and at max_rounds untyped returns exhausted while typed breaks to the forced respond. Not a duplicate: PTQ-1185 (D9) only treated the free phase as a seam inside runTypedQueryLoop. Whether a shared free-phase driver should be the source of truth is a design decision for a human ruling (triage: claude-opus-5-5)
