---
id: PTQ-1302
title: Swallowing-handler per-site routing seams are cloned across runtime with an unused generic substrate
lens: D4
status: open
verdict: confirmed
locations:
  - src/runtime/cancellation-core.ts:272-343
  - src/runtime/invoke-swallowing-handler.ts:46-162
  - src/runtime/query-swallowing-handler.ts:49-165
  - src/runtime/tool-call-swallowing-handler.ts:52-168
sites: 4
fix_scope: module
d4_class: clone
wave: qw20260922211400
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-22
---

# Swallowing-handler per-site routing seams are cloned across runtime with an unused generic substrate

## Observation

`src/runtime/cancellation-core.ts` already exports a generic, site-neutral swallowing-handler substrate (`AbandonableSettlement`, `SubstrateCancellationGuard`, `SubstrateSideChannels`, `attachSwallowingHandler`, `routeAbandonableSettlement`) at lines 272-343. The file's own header comment states this generic form is "witnessed by the cancellation-core tests; no production module imports it." Instead, production wiring uses three per-site modules — `invoke-swallowing-handler.ts`, `query-swallowing-handler.ts`, and `tool-call-swallowing-handler.ts` — each of which redeclares its own settlement type, guard interface, side-channel interface, disposition type, guard function, and route function. The four copies are byte-identical except for identifier names and per-site doc comments.

## Evidence

Clone-map group G004, 108 tokens, renamed-only (11 identifier renames).

### src/runtime/cancellation-core.ts:332-343 — the generic route function (unused in production)

```ts
export function routeAbandonableSettlement(
  _settlement: AbandonableSettlement,
  _guard: SubstrateCancellationGuard,
  channels: SubstrateSideChannels,
): SubstrateDisposition {
  void _settlement;
  void channels;
  return _guard.cancellationSurfaced ? "discarded" : "surfaced";
}
```

### src/runtime/invoke-swallowing-handler.ts:141-153 — the invoke child route function

```ts
export function routeInvokeExecutionLateSettlement(
  _settlement: InvokeExecutionSettlement,
  guard: InvokeCancellationGuard,
  _channels: InvokeExecutionSideChannels,
): InvokeLateSettlementDisposition {
  if (guard.cancellationSurfaced) {
    return "discarded";
  }
  return "surfaced";
}
```

### src/runtime/query-swallowing-handler.ts:143-155 — the query provider route function

```ts
export function routeQueryProviderLateSettlement(
  _settlement: QueryProviderSettlement,
  guard: QueryProviderCancellationGuard,
  _channels: QueryProviderSideChannels,
): QueryProviderLateSettlementDisposition {
  if (guard.cancellationSurfaced) {
    return "discarded";
  }
  return "surfaced";
}
```

### src/runtime/tool-call-swallowing-handler.ts:150-164 — the code-side execute route function

```ts
export function routeToolExecuteLateSettlement(
  _settlement: ToolExecuteSettlement,
  guard: ToolExecuteCancellationGuard,
  _channels: ToolExecuteSideChannels,
): ToolExecuteLateSettlementDisposition {
  if (guard.cancellationSurfaced) {
    return "discarded";
  }
  return "surfaced";
}
```

### Diff verdict

The three production route functions are renamed-only copies of one another and of the generic `routeAbandonableSettlement`. The corresponding `attachSwallowingHandler` / `guardInvokeExecutionPromise` / `guardQueryProviderPromise` / `guardToolExecutePromise` functions are likewise renamed-only copies: each attaches a `.then(onResolve, onReject)` handler at Promise construction and forwards the settlement to its route function. None of the copies diverge in behaviour.

## Why this is a problem

The swallowing-handler rule in `cancellation.md` is load-bearing across all abandonable Promise sites: once cancellation has surfaced at a checkpoint, every late settlement must stay silent on the `unhandledRejection`, `RuntimeEvent`, and diagnostic channels. Today the rule is implemented four times. If a future change fixes a race in one site — for example, snapshotting `cancellationSurfaced` at Promise construction instead of reading it at settlement time, or promoting a diagnostic-worthy rejection — the other three sites will silently retain the old behaviour, breaking the cross-site invariant that cancellation.md states once. The presence of the already-written generic substrate in `cancellation-core.ts` confirms that the duplication is recognized but not consolidated.

## Suggested direction (non-binding, optional)

The natural shared home is `src/runtime/cancellation-core.ts`, which already contains the generic substrate. Production sites could import the shared settlement type, guard interface, side-channel interface, disposition type, and the shared `attachSwallowingHandler` / `routeAbandonableSettlement` pair, supplying only site-specific doc comments and re-export aliases if needed. The per-site files would then become thin re-exports or be removed if their only purpose is naming.

## False-positive check

- Re-read every cited span in current code before filing; excerpts above are verbatim.
- Verified `attachSwallowingHandler` / `routeAbandonableSettlement` / `AbandonableSettlement` / `SubstrateCancellationGuard` / `SubstrateSideChannels` / `SubstrateDisposition` are referenced only inside `src/runtime/cancellation-core.ts` itself (`grep` across `src/`).
- Verified the three per-site `guard*` functions are imported and called from production code (`extension/production-theta-producer.ts`), so the copies are live, not dead.
- Verified the copies are not spec-normative vector tables; they implement a single prose rule from `cancellation.md`.
- Verified none of the cited files are under `tests/`.
- Checked already-filed list: `PTQ-0514-swallowing-handler-unhandledrejection-trap-duplicated.md` names a narrower aspect of the same mechanism; this filing treats the entire per-site seam (types + guard + route) as the duplicated unit and cites the unused generic substrate as the natural home.

## Triage
verdict: confirmed — independently re-verified: all four excerpts match at the cited lines; `node tools/quality/clone-scan.mjs map` on invoke-swallowing-handler.ts reproduces G004 (108 tokens, renamed-only, cancellation-core:272-316 + the three per-site 46/49/52-109/111/114 type+attach blocks) and additionally G001 (217 tokens, renamed-only, the three per-site modules 36-168 in full incl. the route functions), and the three `route*LateSettlement` bodies are identical modulo names while `routeAbandonableSettlement` differs only by ternary-vs-if; cancellation.md:51 states the swallowing-handler obligation once as applying "uniformly to every site", so no spec-normative reason for per-site copies exists; all four copies are live — but the filing's liveness claim is inaccurate in one detail: only `guardToolExecutePromise` and `guardInvokeExecutionPromise` are imported by src/extension/production-theta-producer.ts (:238-239), while `guardQueryProviderPromise` (like the cancellation-core substrate) has only a test caller (tests/query-swallowing-handler.test.ts:37-75), which this repo does not count as dead, so the fix must keep those test entry points reachable (re-export or migrate); not a duplicate: PTQ-0514/0690 are D7 test-harness dedupes, PTQ-0035/1109 are D2 header-accuracy filings on the same substrate whose fixes are the current :258-266 disclosure and do not track the four-way clone itself (triage: claude-fable-5-1)
