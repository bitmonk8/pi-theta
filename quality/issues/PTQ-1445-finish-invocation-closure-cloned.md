---
id: PTQ-1445
title: invocation finish closure duplicated in prompt and subagent binds
lens: D4
status: open
verdict: confirmed
locations:
  - src/extension/production-theta-producer.ts:937-942
  - src/extension/subagent-spawn-regime.ts:297-302
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260923035927
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-23
---

# invocation finish closure duplicated in prompt and subagent binds

## Observation
Both prompt-mode binding (`ProductionThetaProducer.bindPromptConversation`) and subagent-mode binding (`SubagentSpawnRegime.spawnSubagentConversation`) construct an idempotent `finishInvocation` closure that detaches invocation-scoped forwarding sources and then finishes the active-invocation ticket. The closures are byte-identical except for how the `detachForwarding` function is obtained (local `#trackForwardingSources` vs delegated `#deps.trackForwardingSources`).

## Evidence

`src/extension/production-theta-producer.ts:937-942`:

```typescript
    const finishInvocation = (): void => {
      if (finished) return;
      finished = true;
      detachForwarding();
      ticket.finish();
    };
```

`src/extension/subagent-spawn-regime.ts:297-302`:

```typescript
    const finishInvocation = (): void => {
      if (finished) return;
      finished = true;
      detachForwarding();
      ticket.finish();
    };
```

Diff verdict: **identical**. The closure bodies match exactly. The surrounding setup differs only in the source of `detachForwarding` (`this.#trackForwardingSources(forwardingSources)` in production-theta-producer.ts vs `this.#deps.trackForwardingSources(forwardingSources)` in subagent-spawn-regime.ts). No clone-map group exists for this shard.

## Why this is a problem
The teardown sequence is load-bearing: the active-invocation registry contract (active-invocation-registry.md) requires that forwarding listeners are detached and the ticket is finished exactly once on a normal settle, so a still-in-flight-at-shutdown invocation can be cleaned up in session-shutdown sub-step 5. If the sequence drifts between prompt and subagent modes - for example by finishing the ticket before detaching forwarding sources, by adding a status-bus notification, or by changing the idempotency guard - one mode would leak listeners or double-finish while the other would not. `ProductionThetaProducer.bindPromptConversation` is the authoritative right copy: it is the original binding site and the one that defines the local `#trackForwardingSources` helper that `SubagentSpawnRegime` reaches through its deps interface.

## Suggested direction (non-binding, optional)
The natural shared home is near the active-invocation registry abstractions in `src/runtime/active-invocation-registry.ts` or a small helper in `src/extension/production-producer-deps.ts`, accepting `detachForwarding` and `ticket` and returning the idempotent closure.

## False-positive check
- Re-verified both cited spans in current code; the closure bodies are byte-identical.
- Both sites are live: `bindPromptConversation` is the prompt-mode bind entry; `spawnSubagentConversation` is the subagent-mode bind entry.
- `grep -n "detachForwarding();"` across `src/extension` found only these two occurrences.
- Not a spec-normative vector table.
- Not tests/.
- No prior filing matches this two-site clone.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
triage worker failed (verdict not applied; re-triaged next wave) (loop, 2026-09-23)
verdict: confirmed — RATIFIED (human, 2026-09-23): confirmed - batch ruling; triage verification trusted.
