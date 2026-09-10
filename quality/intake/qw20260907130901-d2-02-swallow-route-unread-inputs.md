---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: The invoke/query late-settlement routing functions read only the guard — their settlement and side-channels inputs are never read, and every production call site fabricates a no-op channels object to feed them
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/invoke-swallowing-handler.ts:141-160
  - src/runtime/invoke-swallowing-handler.ts:72-79
  - src/runtime/query-swallowing-handler.ts:143-162
  - src/runtime/query-swallowing-handler.ts:75-82
  - src/extension/production-theta-producer.ts:665-672
  - src/extension/production-theta-producer.ts:4101-4104
  - src/extension/production-theta-producer.ts:6504-6508
  - src/extension/production-theta-producer.ts:6577-6581
sites: 8                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# The invoke/query late-settlement routing functions read only the guard — their settlement and side-channels inputs are never read, and every production call site fabricates a no-op channels object to feed them

## Observation
`routeInvokeExecutionLateSettlement` and `routeQueryProviderLateSettlement`
each take three inputs (settlement, guard, channels) but read only
`guard.cancellationSurfaced`; the settlement and channels parameters are
underscore-prefixed and untouched on both branches. Neither disposition path
ever invokes a channel member, so the `InvokeExecutionSideChannels` /
`QueryProviderSideChannels` values are never read by any code. The guard
functions (`guardInvokeExecutionPromise`, `guardQueryProviderPromise`) thread a
`channels` parameter through solely to hand it to the route function, and all
three production call sites construct a fresh no-op object
(`noopSwallowChannels()`) to satisfy that parameter.

## Evidence
src/runtime/invoke-swallowing-handler.ts:141-160 (query twin is byte-similar at
query-swallowing-handler.ts:143-162; neither `_settlement` nor `_channels` is
referenced in either body):
```ts
export function routeInvokeExecutionLateSettlement(
  _settlement: InvokeExecutionSettlement,
  guard: InvokeCancellationGuard,
  _channels: InvokeExecutionSideChannels,
): InvokeLateSettlementDisposition {
  if (guard.cancellationSurfaced) {
```

src/runtime/invoke-swallowing-handler.ts:72-79 (the interface; the query twin
is at query-swallowing-handler.ts:75-82):
```ts
export interface InvokeExecutionSideChannels {
  /** Emit a second `RuntimeEvent` for this invocation (must not fire post-cancel). */
  readonly emitRuntimeEvent: (event: RuntimeEvent) => void;
  /** Emit a diagnostic for this invocation (must not fire post-cancel). */
  readonly emitDiagnostic: (diagnostic: Diagnostic) => void;
}
```

src/extension/production-theta-producer.ts:665-672 (the fabricated value):
```ts
function noopSwallowChannels(): {
  readonly emitRuntimeEvent: () => void;
  readonly emitDiagnostic: () => void;
} {
  return {
    emitRuntimeEvent: (): void => {},
    emitDiagnostic: (): void => {},
  };
}
```

All in-scope production call sites pass it: production-theta-producer.ts:4101-4104
(`guardInvokeExecutionPromise(..., signalGuard(parentSignal), noopSwallowChannels())`),
:6504-6508 and :6577-6581 (`guardQueryProviderPromise(..., signalGuard(this.#signal),
noopSwallowChannels())`). Search for `InvokeExecutionSideChannels` /
`QueryProviderSideChannels` across src/, extensions/, tools/: hits only in the
two declaring modules and the producer's structural no-op — no member of either
interface is ever invoked.

## Why this is a problem
Vestigial parameters: "the value is never read" holds for both the settlement
and the channels inputs of both route functions — mechanically provable, since
the parameters appear nowhere in either function body, and the guard functions
only forward them. The channels parameter additionally forces every production
call site to allocate a fresh two-member no-op object per guarded Promise
(three sites cited), pure feed-the-signature weight. The "keep the channels
silent" obligation the interfaces document is already structural — the route
functions have no channel to emit on with or without the parameter — so the
parameter carries no reachable behaviour, only threading.

## Suggested direction (non-binding, optional)
Narrow the route functions to the one input the decision reads (the guard) —
or at minimum drop the channels parameter from the guard/route signatures so
production stops fabricating `noopSwallowChannels()` per call; the witness
tests' "nothing emitted" assertions become type-level facts.

## False-positive check
- Reference searches: `InvokeExecutionSideChannels`, `QueryProviderSideChannels`,
  `routeInvokeExecutionLateSettlement`, `routeQueryProviderLateSettlement`,
  `guardInvokeExecutionPromise`, `guardQueryProviderPromise` grepped across
  src/, extensions/, tools/, tests/ — production callers are exactly the three
  producer sites cited; the interfaces' members are invoked nowhere.
- Test-caller check: tests/invoke-swallowing-handler.test.ts and
  tests/query-swallowing-handler.test.ts pass recording channels and assert the
  spies are NOT called (witness of the discard rule) — no test reads the
  values either; the deadness claim is about the parameter values, not about
  test-reachable branches.
- Witness-convention check: unlike no-rollback.ts's `RollbackCompensator`
  (documented as existing "only so a test can witness"), these parameters are
  threaded by production at every call site with fabricated no-ops; the
  spec-pinned obligation (cancellation.md: discard "on all three side
  channels") is enforced by the functions' bodies never referencing the
  channels, independent of the parameter's existence.
- Same-pattern sibling: tool-call-swallowing-handler.ts (V14f, outside this
  review's file scope) repeats the shape at production-theta-producer.ts:3795-3799;
  noted for completeness, not counted in `sites`.
- Spec check: cancellation.md's rule pins the DECISION ("the discriminator is
  whether cancellation has already been surfaced ... not the late-settle
  kind") — it mandates independence from the settlement kind, not that the
  routing signature carry the settlement or the channels as data.

## Triage
verdict: questionable — mechanics reproduce exactly (both params unread in both bodies; 3 production sites fabricate noopSwallowChannels; no member of either interface invoked anywhere), but git f53245b3/0d55d094 shows `channels` is the deliberate red/green observation seam for cka-33 channels 2-3, so the "pure threading" anchor is contested and a human should rule (triage: claude-opus-5)
verdict: questionable — re-verified independently at HEAD: both route bodies read only `guard.cancellationSurfaced` (`_settlement`/`_channels` appear nowhere in invoke:141-159, query:143-161, nor the V14f sibling), `InvokeExecutionSettlement`/`QueryProviderSettlement` have zero references outside their modules, no `*SideChannels` member is invoked in src/extensions/tools/tests, no string-keyed access or re-export exists, and the producer fabricates `noopSwallowChannels()` at all 3 in-scope sites plus V14f (drifted to :683/:3847/:4186/:6655/:6728, content exact) — but the vestige anchor is contested, not clean: `git show 85a046e1`/`f53245b3` prove the V15h-T/V13f-T red stubs *invoked* `channels.emitRuntimeEvent`/`emitDiagnostic` to redden cka-33 channels 2-3 and the green commits deliberately flipped `channels`→`_channels`, so the unread inputs are the designed independence/observation seam that the still-live coverage-matrix-cited tests (invoke test :150-178, query test :154-182) need in order to state "no emission" and "kind-independent" at all (the reverse of PTQ-0001's forgotten wire), while the producer's own comment at :674-682 shows it knowingly feeds no-ops; whether a falsifiability seam justifies fabricated production inputs is a human call (triage: claude-opus-5)
