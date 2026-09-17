---
id: pending
title: Child-activity tap emits six event kinds but the bus fold switch explicitly handles three
lens: D4
status: intake
verdict: pending
locations:
  - src/extension/execution-status/child-tap.ts:43-60
  - src/extension/execution-status/child-tap.ts:86-96
  - src/extension/execution-status/child-tap.ts:138-167
  - src/extension/execution-status/bus.ts:283-310
sites: 2
fix_scope: module
d4_class: parallel
wave: qw20260917121953
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-17
---

# Child-activity tap emits six event kinds but the bus fold switch explicitly handles three

## Observation
`src/extension/execution-status/child-tap.ts` is the decoder/producer for child-activity events; it emits a closed union of six `ChildTapEvent` kinds. `src/extension/execution-status/bus.ts` is the consumer: its `childEvent` switch explicitly folds per-type state for three of those kinds (`turn_start`, `tool_execution_start`, `theta_progress`) and leaves the other three (`tool_execution_end`, `agent_end`, `heartbeat`) to a common post-switch path that only records liveness (`childSeen`, `childLastEventAtMs`).

## Evidence
`src/extension/execution-status/child-tap.ts:43-60` — the six-case `ChildTapEvent` union:

```typescript
export type ChildTapEvent =
  | { readonly type: "turn_start" }
  | { readonly type: "tool_execution_start"; readonly toolName: string }
  | { readonly type: "tool_execution_end" }
  | { readonly type: "agent_end" }
  // L3 (EXST-5/EXST-15; PIC-74) — the reserved-key `theta_progress` wire line,
  // recognised in the tap's OWN parse (EXST-5).
  | { readonly type: "theta_progress"; readonly payload: ProgressAuthorMessage }
  // RFC 0012 §7: a result-channel `heartbeat` frame — liveness only. Under a
  // visible placement the child's `--mode json` stream is a TTY, so the four
  // event kinds above never arrive; the heartbeat is what keeps the node's
  // `lastEventAtMs` moving.
  | { readonly type: "heartbeat" };
```

`src/extension/execution-status/child-tap.ts:86-96` — the `heartbeat` producer, emitted outside the stdout-line switch via `child.onHeartbeat`:

```typescript
  const detachHeartbeat = child.onHeartbeat?.((): void => {
    publish({ type: "heartbeat" });
  });
```

`src/extension/execution-status/child-tap.ts:138-167` — the stdout-line switch producing the remaining four kinds (note `theta_progress` is produced just above this switch via `decodeProgressEnvelope`, not inside the switch):

```typescript
    switch (record.type) {
      case "turn_start":
        publish({ type: "turn_start" });
        return;
      case "tool_execution_start": {
        const toolName = record.toolName;
        if (typeof toolName !== "string") {
          return;
        }
        publish({ type: "tool_execution_start", toolName });
        return;
      }
      case "tool_execution_end":
        publish({ type: "tool_execution_end" });
        return;
      case "agent_end":
        publish({ type: "agent_end" });
        return;
      default:
        return;
    }
```

`src/extension/execution-status/bus.ts:283-310` — the consumer switch that folds per-type state for three of the six kinds:

```typescript
  childEvent(invocationId: string, event: ChildTapEvent): void {
    try {
      const node = this.#nodes.get(invocationId);
      if (this.#disposed || node === undefined || node.endedAtMs !== undefined) {
        return;
      }
      // EXST-5 / EXST-12: only the bounded class-1 projection is folded — the
      // tap hands nothing else across the boundary.
      switch (event.type) {
        case "turn_start":
          node.childTurns += 1;
          break;
        case "tool_execution_start":
          node.childToolExecs += 1;
          node.childLastToolName = clampName(event.toolName);
          break;
        case "theta_progress":
          node.authorMessage = clampFoldedAuthorMessage(event.payload);
          break;
        default:
          break;
      }
      node.childSeen = true;
      node.childLastEventAtMs = this.#clock.now();
      this.#markDirty();
```

Diff verdict: parallel (no token-level clone). The producer enumerates six event kinds across two mechanisms; the consumer switch explicitly names three of them and drops the rest into a shared liveness path.

## Why this is a problem
Load-bearing parallel truth. The tap and the bus are two passes over the same discriminant set (`ChildTapEvent.type`). When the set gains a case that needs per-type state — a counter, a name field, or a payload slot — the bus's `default` arm will silently absorb it. Today the explicit switch covers 3 of the 6 kinds; the other 3 are intentionally liveness-only under EXST-5/EXST-12, but that intent is embedded only in the consumer switch, not in a shared source of truth that the producer or the type system can check against.

## Suggested direction (non-binding, optional)
A neutral classifier in `src/extension/execution-status/` (for example, a predicate or map naming which `ChildTapEvent` kinds carry class-1 fold state) that both the producer and the bus consult, so a new kind must be classified once rather than remembered in both the decoder and the fold switch.

## False-positive check
- Reference search for `ChildTapEvent` across `src/` found only the definition in `child-tap.ts` and the consumer switch in `bus.ts`; no other switches over this discriminant.
- Re-verified the clone map for this shard lists no groups for either file.
- The `default` arm is intentional for liveness-only events, per the EXST-5/EXST-12 comment, so the current omission is not a present bug; the filing is about the parallel-coverage risk.
- No existing intake issue tracks this producer/consumer pair.

## Triage
verdict: questionable — accounting verified: ChildTapEvent union has 6 kinds (child-tap.ts:43-55), bus.ts childEvent switch (283-315) names 3 and defaults 3 to the liveness path; sole consumer switch (grep src/tools/tests), no clone group; note EXST-5 pins heartbeat as liveness-only and two prior D4 shards (REVIEW_LOG L74/L84) ruled this pair incidental — a shared classifier is a design decision for a human ruling (triage: claude-fable-5-1)
