---
id: PTQ-1451
title: Run-card start event is emitted by identical blocks in child-regime and top-level paths
lens: D4
status: fixed
verdict: confirmed
locations:
  - src/extension/theta-composition-producer.ts:208-215
  - src/extension/theta-composition-producer.ts:252-259
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260923145222
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-23
---

# Run-card start event is emitted by identical blocks in child-regime and top-level paths

## Observation
`composeThetaFixture.run` in `src/extension/theta-composition-producer.ts` has two independent top-level drive paths that each publish a run-card start event by calling `deps.runCard?.driveStarted(...)`. The first copy lives inside the child-side subagent-root regime branch (entered when `deps.driveSubagentRootRegime` is wired and `isSubagentRootFor(theta)` is true); the second copy lives on the ordinary slash-dispatch path immediately after the regime branch returns. The two call sites are byte-identical.

## Evidence
Clone-map group G054 cites `src/extension/theta-composition-producer.ts:208-220` and `:252-282`; the identical code inside those windows is:

```typescript
// src/extension/theta-composition-producer.ts:208-215
if (invocationTicket !== undefined) {
  deps.runCard?.driveStarted({
    invocationId: invocationTicket.invocationId,
    theta: invocationTicket.theta,
    args,
    ...(theta.sourcePath !== undefined ? { sourcePath: theta.sourcePath } : {}),
  });
}
```

```typescript
// src/extension/theta-composition-producer.ts:252-259
if (invocationTicket !== undefined) {
  deps.runCard?.driveStarted({
    invocationId: invocationTicket.invocationId,
    theta: invocationTicket.theta,
    args,
    ...(theta.sourcePath !== undefined ? { sourcePath: theta.sourcePath } : {}),
  });
}
```

Diff verdict: **identical** (type-1 exact clone). Clone-map group id: **G054**.

## Why this is a problem
The run-card publisher is the single source of truth for execution-status events consumed by the TUI (RFC 0015, EXST-3). Both cited paths are top-level drives (the regime path is a visible child process root; the other is a direct slash dispatch), so the run-card start payload must have the same shape on both paths. If the copies drift — for example, one adds a field and the other does not — the execution-status bus receives inconsistent `driveStarted` payloads depending on which path a theta took, breaking downstream rendering/heat attribution. The duplication is therefore load-bearing, not incidental boilerplate.

## Suggested direction (non-binding, optional)
The natural shared home is a helper inside `src/extension/theta-composition-producer.ts` (or on the `RunCardPublisher` interface in `src/extension/execution-status/run-card.ts`) that emits the start event from one place, called by both the regime branch and the top-level branch. Both branches already hold `invocationTicket`, `args`, and `theta`.

## False-positive check
- Re-read both cited ranges in the current file; both are live production code paths.
- The regime branch returns early, so the two `driveStarted` calls cannot execute for the same invocation.
- `grep -R "driveStarted" quality/intake quality/issues` found no existing finding for this pair.
- No tests are involved; both sites are in `src/` production code.
- The code is hand-authored, not generated.

## Triage
verdict: confirmed — both excerpts reproduce byte-identical at theta-composition-producer.ts:208-215 (child-regime branch) and :252-259 (top-level path); `clone-scan map` on the file lists G054 over :208-220 / :252-282 (renamed-only for the wider window, exact for the `driveStarted` block); `grep -rn driveStarted src/` shows exactly these two publisher call sites plus the run-card.ts interface/impl, both on live production dispatch paths (regime returns early, top-level path follows); no quality/issues row tracks the start-event clone (the same-wave d4-02 `driveEnded` filing is a distinct root cause); fix is a mechanical dedupe into one emitter helper (triage: claude-fable-5-1)
