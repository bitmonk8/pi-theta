---
id: PTQ-1455
title: Run-card end event is emitted by renamed-only blocks in child-regime and top-level paths
lens: D4
status: fixed
verdict: confirmed
locations:
  - src/extension/theta-composition-producer.ts:238-241
  - src/extension/theta-composition-producer.ts:387-394
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260923145222
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-23
---

# Run-card end event is emitted by renamed-only blocks in child-regime and top-level paths

## Observation
`composeThetaFixture.run` in `src/extension/theta-composition-producer.ts` closes the run card in two independent top-level drive paths. The child-side subagent-root regime branch finishes the invocation ticket and then calls `deps.runCard?.driveEnded(..., regimeOutcome)`; the ordinary slash-dispatch branch finishes the same ticket and calls `deps.runCard?.driveEnded(..., runOutcome)`. Apart from the outcome variable name, the two blocks are identical. The clone-scan map does not list a group for this pair.

## Evidence

```typescript
// src/extension/theta-composition-producer.ts:238-241
invocationTicket?.finish();
if (invocationTicket !== undefined) {
  deps.runCard?.driveEnded(invocationTicket.invocationId, regimeOutcome);
}
```

```typescript
// src/extension/theta-composition-producer.ts:387-394
invocationTicket?.finish();
if (invocationTicket !== undefined) {
  deps.runCard?.driveEnded(invocationTicket.invocationId, runOutcome);
}
```

Diff verdict: **renamed-only** (type-2 clone); the only differing token is the outcome variable (`regimeOutcome` vs `runOutcome`). No clone-map group id exists for this pair.

## Why this is a problem
The run-card end event tells the execution-status bus that an invocation has settled and supplies the coarse outcome (`ok` / `err` / `cancelled`) used for the final heat profile and summary (RFC 0015, EXST-3). Both cited paths are top-level drives, so the event must be emitted with the same shape and the same ordering (`finish()` before `driveEnded()`). If one copy is edited independently — for example, by adding extra metadata, reordering the calls, or changing the undefined-ticket guard — the other path will produce a divergent run-card lifecycle, which can leave stale nodes or inconsistent summaries depending on whether the theta ran through the subagent-root regime or the direct dispatch path. The duplication is load-bearing.

## Suggested direction (non-binding, optional)
The natural shared home is a helper inside `src/extension/theta-composition-producer.ts` (or on the `RunCardPublisher` interface in `src/extension/execution-status/run-card.ts`) that takes an `invocationTicket` and a `ThetaRunOutcome` and performs the idempotent `finish()` + `driveEnded()` sequence once. Both branches already hold those two values.

## False-positive check
- Re-read both cited ranges in the current file; both are live production code paths.
- The regime branch returns early, so the two `driveEnded` calls cannot execute for the same invocation.
- `grep -R "driveEnded" quality/intake quality/issues` found no existing finding for this pair.
- No tests are involved; both sites are in `src/` production code.
- The code is hand-authored, not generated.

## Triage
verdict: confirmed — both excerpts reproduce (theta-composition-producer.ts:238-240 regime `finally`, :387-393 top-level `finally`; sole differing token `regimeOutcome`/`runOutcome`), both copies live; clone-scan map lists only G054 (the driveStarted pair 208-220/252-282), nothing for this pair, so the hand-diff stands; not incidental — the regime-side comment at :229-231 states "Same ordering contract as the top-level path's `finally` below: `finish()` first … THEN `driveEnded`", i.e. the RFC 0015 finish→driveEnded ordering is carried by cross-reference in two copies; no driveEnded finding in quality/issues (sibling intake d4-01 covers the distinct driveStarted block); fix is a mechanical dedupe into one finish+driveEnded helper (triage: claude-fable-5-1)
