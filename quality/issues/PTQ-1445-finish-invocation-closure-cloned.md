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
fix_skips: 1
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

## Fix attempts
- qw20260923072108: skipped — [PTQ-1300-post-turn-probe-cloned.md] PTQ-1300: extracted the shared post-turn probe classification as probePostTurnFailure(messages, PostTurnProbeCtx{aborted, provider, excludeCancelled}) in src/runtime/prompt-transport-mapping.ts (the copies' common dependency, 320 LOC; the named issue home live-prompt-query-driver.ts is 1048 LOC — at/above the 1000 justify band, so HOME BAND forbids it as helper home) and replaced all three driver sites (nextFreePhaseTurn/forcedRespondTurn pass excludeCancelled:true and wrap as transport; #driveRestartedRepairPhase passes false and wraps as provider_failure) — the drive/#transportFromThrow lines stay at call sites because they read private class state and differ per site; the classification rule (G034 core) now lives once. An initial ctx-named/intersection-typed parameter tripped the inventory-closure audit gate; fixed by the named PostTurnProbeCtx interface and probeCtx parameter name. PTQ-1413: reproduced (comment still says "Both" while 4 call sites exist, now spread across 4 files after the PTQ-1285 split); reworded to the countless invariant "Every lowerQueryResponseSchema call site passes …" in query-text-render.ts. PTQ-1414: code moved since filing (PTQ-1285 split) — the two byte-identical guards now live in invoke-machinery.ts (1024 LOC) and subagent-spawn-regime.ts (1700 LOC); both hosts are at/above the justify band, so the helper pushCountableFrameOrRefuse(chain, kind, calleePath) landed in src/runtime/invoke-depth-cycle.ts (354→~390 LOC; the module that already owns pushCountableFrame/surfaceDepthOverflow and that both copies already import — no new cross-directory edge; its new type-only DrivenInvokeResult and runtime makeErr imports are intra-runtime and cycle-free); both drive() closures now call it. PTQ-1415: copies moved to binder-run.ts:991 and subagent-spawn-regime.ts:1343; per the triage note the third byte-identical copy at query-text-render.ts:132 was included; helper thetaLookupEnvironment(theta) added to src/extension/callable-lowering.ts (485 LOC, the home of buildBoundEnvironment/presentedCallableNames that all three already import), all three copies replaced; the distinct paramBindings variant at production-theta-producer.ts:893 was left untouched. No tests were orphaned or deleted; no test edits were needed. Gate: npx tsc --noEmit && npm test (capped workers) green — 11780/11780. || [PTQ-1416-finishinvocation-cloned.md] PTQ-1416: the clone had moved cross-module (production-theta-producer.ts #buildPromptHostDeps and subagent-spawn-regime.ts spawnSubagentConversation), so the ruled private-method dedupe became a shared free helper: extracted makeInvocationFinisher(trackForwardingSources, forwardingSources, ticket) into session-shutdown.ts (home of ForwardingSignalSource, 402 LOC — well under the 1000-LOC band; both oversized hosts import it), replacing both 8-line copies; behaviour identical (same track-then-close ordering, idempotent guard, detach-then-finish). PTQ-1419: ratified target shape implemented — ONE shared envelope-settlement/validation helper used by both child drives: extended SubagentSpawnRegime.#emitOkEnvelopeGuarded (already serving the theta-root drive) with an optional FnTail parameter and pointed #driveSubagentFnEntry's ok arm at it; the ratified panic-cause divergence (internal_error vs panic split in the catch arms) was NOT named for unification by the ruling and is untouched. PTQ-1444: fixed by the same extraction per the PTQ-1419 ruling — the fn-entry tooDeep/nonRepresentable/serializeOkEnvelope/emitOutcome/shutdown block is now the single #emitOkEnvelopeGuarded call (identical diagnostic emitter: this.#input.emitDiagnostic ?? no-op on both paths). PTQ-1443: extracted buildPiFallbackSystemNoteChannel(sender, emitDiagnostic) into system-note-channel.ts (the issue's suggested home, 414 LOC pre-change); ProductionThetaProducer#systemNoteChannel, SubagentSpawnRegime#renderChildSystemPrompt, and LivePromptQueryDriver#resolveSystemNoteChannel now delegate to it, and the inline copy in #emitCleanCancelNote was replaced with a call to the class's own #systemNoteChannel() (its unreachable-ui.notify rationale kept as a site comment). The helper's parameter is named `sender` not `pi` because the inventory-closure audit gate pins the name `pi` to the exact ExtensionAPI annotation (first gate run flagged pi: SystemNoteSender; renamed and re-ran). No tests orphaned — nothing was deleted, only deduplicated; gate run verbatim, green (11780/11780). ||
