---
id: pending
title: createProductionHostLoopDispatch retains composition-lifetime synchronization and per-dispatch construction in one body
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/production-host-loop-dispatch.ts:389-643
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/production-host-loop-dispatch.ts#createProductionHostLoopDispatch
d9_band: strong
wave: qw20261028153325
reported_by: lens-d9-placement (openai/gpt-6.1-sol)
date: 2026-10-28
triaged_at: e071eada0d46fdc4e5ebc1a9f3bb2a97f028d3a5
---

# createProductionHostLoopDispatch retains composition-lifetime synchronization and per-dispatch construction in one body

## Observation
The authoritative map gives createProductionHostLoopDispatch 255 LOC, strong band (function threshold 200), exported with 1/1 src/tests importers. The header describes production PIC-64 host-loop dispatch collaborators. The factory owns a composition-lifetime event slot and serialization tail, a per-dispatch runner, and an abort-aware settle barrier. The nested runner has its own separately mapped 178-LOC host; this report concerns its embedding in the composition-lifetime factory, not the runner's internal collaborator partition.

## Evidence
Step inventory; LOC are inclusive ranges, including comments and signatures.

| phase | line ranges | LOC | locals read / written |
|---|---|---:|---|
| factory contract and barrier-slot declaration | 389-395 | 7 | reads host; writes pendingSettle |
| settled-event subscription | 396-412 | 17 | reads host; callback reads/clears pendingSettle and invokes resolver |
| queue and nonce state | 413-419 | 7 | writes tail, nonceCounter |
| per-dispatch runner definition | 420-597 | 178 | captures host, nonceCounter, awaitSettledTurn; constructs per-request provider, session-window and restore collaborators |
| abort-aware settle barrier | 598-628 | 31 | reads host, signal, send, pendingSettle; writes pendingSettle, done; manages onAbort/settle/finish |
| serialized entry point | 629-643 | 15 | reads tail, runOne, request, signal; writes tail; returns run promise |


`src/extension/production-host-loop-dispatch.ts:624-627`:
```ts
      signal.addEventListener("abort", onAbort, { once: true });
      pendingSettle = settle;
      send();
    }).then(() => confirmIdle(host, signal));
```

`src/extension/production-host-loop-dispatch.ts:630-642`:
```ts
  return (request: EncodedToolRequest, signal: AbortSignal): Promise<HostToolResult> => {
    // Chain onto the tail so dispatches serialise (shared session model switch +
    // single settle slot). A prior failure does not poison the chain.
    const run = tail.then(
      () => runOne(request, signal),
      () => runOne(request, signal),
    );
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
```

## Why this is a problem
The strong band requires a strong concrete keep-whole reason. The outer lifetime state is pendingSettle, tail and nonceCounter; it is not a six-local algorithm extending through every phase. The per-dispatch runner captures host, nonceCounter and awaitSettledTurn, not tail or pendingSettle directly. The barrier and queue are coupled by execution order, but PIC-64:202(c),(e),(f) requires arming-before-send and serial execution through restoration, not lexical nesting of the per-dispatch constructor in this factory. Moving a definition without changing when its returned work runs does not itself add an await or interleave those operations. The callback body is not an enumeration mirror or grammar production and is not data-only/generated source. No measurement, reverted split, or human ruling is evidenced that requires this whole 255-LOC lexical host.

## Suggested direction (non-binding, optional)
All hypotheses are unproven. Seam A: per-dispatch runner definition (420-597) -> createHostLoopRequestRunner helper (hypothesis) - 178 LOC, 0 exported symbols moved, external importers of moved exports: none (the map reports 1/1 only for the enclosing exported factory), cross-references back into host: host, mutable nonceCounter and awaitSettledTurn. Seam B: settled-event slot/subscription (395-412) and barrier (598-628) -> createHostLoopSettleBarrier helper (hypothesis) - 49 LOC, 0 exported symbols moved, external importers of moved exports: none, cross-references back into host: host plus confirmIdle. Human ratification is required.

## False-positive check
Band check: strong, 255 LOC. Reasons-considered: the three lifetime state cells and PIC-64:202 order requirements are explicitly accounted for above; no critical-section interleaving is inherent in an ordinary helper boundary. Spec-mirror check: the a-f contract is implemented across callbacks and queue state, not a short-arm switch. This report's lexical-lifetime host is distinct from the file-family inventory and the nested runOne collaborator inventory. Exemptions check: quality/exemptions.json has no entry for this host. Generated-code check: `rg -n '@generated|DO NOT EDIT' src/extension/production-{composition,host-loop-dispatch}.ts` returned no matches; the file header describes the shipped production adapter. History check: `git log --format='%h %s' -- src/extension/production-composition.ts src/extension/production-host-loop-dispatch.ts | grep -i revert` returned no matches. Duplicate check: no prior d9_host entry names this host in quality/issues, quality/resolved or quality/intake at review time. The human-deferred D1 snapshot/restore-versus-runtime-windows topic is not re-filed: this report alleges no failure-path defect and proposes no change to snapshot/restore semantics. Every cited range was re-read immediately before filing.

## Triage
verdict: questionable — Accounting verified: size-scan reproduces 255 LOC, strong band and 1/1 importers; the composition-scoped settle slot/queue and 178-LOC request runner are distinct state/lifetime concerns with the cited captures. PIC-64(c),(e),(f) pins arming and serialized restoration, not lexical nesting; no exemption or same-root duplicate was found, and the breakdown shape needs a human ruling. (triage: claude-opus-5-5)
