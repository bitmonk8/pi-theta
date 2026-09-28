---
id: PTQ-1550
title: cancellation-core forwardSignalReason calls thetaAbort.abort(source.reason) with no listener-boundary trap, while forwarding-listener-trap's forwardWithTrap routes the same throw to theta/runtime/internal-error
lens: D6
status: open
verdict: confirmed
locations:
  - src/runtime/cancellation-core.ts:61-75
  - src/runtime/cancellation-core.ts:130-142
  - src/runtime/cancellation-core.ts:176-189
  - src/runtime/forwarding-listener-trap.ts:157-184
sites: 2
fix_scope: cross-module
d6_class: posture-divergence
d6_anchor: "cancellation.md §\"Forwarding-listener throw\" (docs/spec_topics/cancellation.md:15); allow-broad-catch: theta/runtime/internal-error — cancellation.md (src/runtime/forwarding-listener-trap.ts:169)"
wave: qw20260928060032
reported_by: lens-d6-errorposture (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# cancellation-core forwardSignalReason calls thetaAbort.abort(source.reason) with no listener-boundary trap, while forwarding-listener-trap's forwardWithTrap routes the same throw to theta/runtime/internal-error

## Observation

The src tree has two implementations of the steady-state forwarding listener, the `abort` listener that runs `thetaAbort.abort(source.reason)` when a source signal fires. `forwardWithTrap` in `src/runtime/forwarding-listener-trap.ts` wraps that call in a `try`/`catch` annotated `allow-broad-catch: theta/runtime/internal-error — cancellation.md`, and routes any throw through `routeForwardingDefect` to the runtime-defect surface. `forwardSignalReason` in `src/runtime/cancellation-core.ts` makes the same call, both synchronously on an already-aborted source and inside the listener, with no trap. Every production forwarder goes through `forwardSignalReason`: `forwardSlashCommandCancel` has three production call sites and `deriveChildThetaAbort` has one. `forwarding-listener-trap.ts` is imported only by one test file.

## Evidence

**Divergent side: production forwarder, untrapped.** `src/runtime/cancellation-core.ts:61-75`:
```ts
function forwardSignalReason(
  thetaAbort: AbortController,
  source: AbortSignal,
): () => void {
  if (source.aborted) {
    thetaAbort.abort(source.reason);
    return (): void => {};
  }
  // Named so the detach closure can remove exactly this listener.
  const abortListener = (): void => {
    thetaAbort.abort(source.reason);
  };
  source.addEventListener("abort", abortListener, { once: true });
  return (): void => source.removeEventListener("abort", abortListener);
}
```
The slash-command entry and the invoke-parent entry both delegate to it. `src/runtime/cancellation-core.ts:130-142` (`forwardSlashCommandCancel`, `... return forwardSignalReason(_thetaAbort, _ctxSignal);`) and `src/runtime/cancellation-core.ts:176-189` (`deriveChildThetaAbort`):
```ts
export function deriveChildThetaAbort(_parentSignal: AbortSignal): {
  readonly controller: AbortController;
  readonly detach: () => void;
} {
  const child = new AbortController();
  ...
  const detach = forwardSignalReason(child, _parentSignal);
  return { controller: child, detach };
}
```

**Anchored side: the sibling trap.** `src/runtime/forwarding-listener-trap.ts:157-177`:
```ts
function forwardWithTrap(
  thetaAbort: ThetaAbortLike,
  source: AbortSignal,
  sink: ForwardingDefectSink | InvokeForwardingDefectSink,
  site: ForwardingListenerSite,
  calleePath?: string,
): void {
  const forward = (): void => {
    try {
      // Issue the abort first: the cancellation takes effect on the underlying
      // signal before any throw, so the trap below never swallows it.
      thetaAbort.abort(source.reason);
    } catch (thrown: unknown) { // allow-broad-catch: theta/runtime/internal-error — cancellation.md
      // cancellation.md §"Forwarding-listener throw" mandates trapping any throw
      // ...
      routeForwardingDefect(thrown, sink, site, calleePath);
    }
  };
```
Lines 179-184 apply the same trapped `forward()` on both the already-aborted path and the listener path, which is the same two-path shape `forwardSignalReason` has.

**Why these are the same failure class.** Both functions handle a throw from the same expression, `thetaAbort.abort(source.reason)`, run from an `abort` listener on the same three kinds of source: the slash-command `ctx.signal`, the tool-exposed `signal`, and the invoke-parent signal (`trapForwardSlashCommandCancel` / `trapForwardToolExposedCancel` / `trapDeriveChildThetaAbort` mirror `forwardSlashCommandCancel` / `forwardToolExposedCancel` / `deriveChildThetaAbort` one to one). Their control flow is also the same: a synchronous forward when the source is already aborted, otherwise a one-shot listener. One routes the throw to `theta/runtime/internal-error`. The other lets it escape the listener boundary.

**Anchor, quoted verbatim.** `docs/spec_topics/cancellation.md:15`:
> **Forwarding-listener throw.** A throw from a steady-state forwarding listener's `thetaAbort.abort(source.reason)` call — the slash-command `ctx.signal`-aborted trigger, the tool-exposed `signal`-aborted trigger, or the `invoke`-parent derived-controller trigger — is trapped at the listener boundary and routed through the **runtime-defect surface** defined in [Errors and Results — Runtime panics](./errors-and-results/error-model.md#runtime-panics) on the `theta/runtime/internal-error` channel, with the `cause: "internal_error"` arm of [`InvokeInfraError`](./errors-and-results/queryerror-variants.md#invoke-variants) at an `invoke` parent.

**Searches run this session.**
- `grep -rn 'forwarding-listener-trap"' src tests extensions tools` → 1 hit, `tests/forwarding-listener-throw-trap.test.ts:49`. No src importer.
- `grep -rn "forwardSlashCommandCancel(\|deriveChildThetaAbort(" src | grep -v "^src/runtime/cancellation-core.ts"` → 4 hits: `src/extension/live-prompt-query-driver.ts:861`, `src/extension/production-theta-producer.ts:675`, `src/extension/production-theta-producer.ts:804`, `src/extension/theta-composition-producer.ts:219`.
- `grep -n "thetaAbort.abort(source.reason)" src/runtime/cancellation-core.ts` → 2 hits (lines 66 and 71, both untrapped).

## Why this is a problem

The repository's fail-closed posture for this failure class is written in cancellation.md §"Forwarding-listener throw", and the trap's own `allow-broad-catch: theta/runtime/internal-error — cancellation.md` token names it. Only the sibling that no production module imports implements that posture. The forwarders the runtime actually installs (slash entry, both producers, invoke-parent derivation) let the same throw leave the listener boundary. On the listener path, `forwarding-listener-trap.ts:16-21` states that such a throw is "reported out-of-band ... (Node raises it as an asynchronous `uncaughtException`)", which is the outcome the clause exists to prevent. On the synchronous already-aborted path, the throw goes straight into the caller's bind setup.

A note on reachability. With a native `AbortController`, a throw from a listener on `thetaAbort.signal` is itself reported out-of-band and does not reach the `abort()` caller, so the defect set is narrow. This filing does not claim a current runtime failure. It claims the posture divergence: the code has two answers to one spec-pinned class, and the production answer is the one the clause does not pin.

## Suggested direction (non-binding, optional)

Give the production forwarders a single posture for this class. Either route the four production forwards through the trap entry points, which needs a defect sink and a site at each caller, or apply the trap inside `forwardSignalReason` itself. Then `forwarding-listener-trap.ts` and `cancellation-core.ts` no longer hold opposite answers for one clause.

## False-positive check

- **EXST-9 / PIC-73 class check:** neither site is an execution-status sink or producer hook (no bus boundary is involved), and neither is a degrade-silent optional capability. Both are cancellation forwarders under cancellation.md, so neither pre-exempted class applies.
- **allow-broad-catch token check:** the only catch cited is `forwarding-listener-trap.ts:169`, token `theta/runtime/internal-error — cancellation.md`. It names the clause quoted above, and its handling (`routeForwardingDefect`) matches that clause. `forwardSignalReason` has no catch at all. The other annotated swallow in `cancellation-core.ts` (`abortInvocationsOnResultChannelDeath`, line 112) belongs to the teardown-iteration class, which the clause explicitly leaves under "the `session_shutdown` sub-step 2 swallow rule". That swallow is not cited and not claimed divergent.
- **Stated-rationale check:** the `cancellation-core.ts` header and the doc comments on `forwardSignalReason`, `forwardSlashCommandCancel` and `deriveChildThetaAbort` give no reason for leaving out the trap. `docs/bugs/0319-prompt-mode-bidirectional-ctx-abort-unwired.md` (around line 305) records the fact without ruling on it: "the live-driver's existing forwards (`forwardSignalReason`) do not route either, `forwarding-listener-trap.ts` is not wired into this driver". That text rules on 0319's own reverse listener and scopes out new plumbing for that fix. It does not state that the forward-direction forwarders are exempt from the clause, and it notes that the clause "enumerates only the three forward-direction forwarders", which are these ones.
- **Sibling-reality check:** `forwardWithTrap` is live src code with its own test suite (`tests/forwarding-listener-throw-trap.test.ts`). Its three entry points map one to one onto cancellation-core's three forward entry points, with the same already-aborted and listener branching, so the two are real siblings for one class and not just similar-looking code.
- **Routing note:** that `forwarding-listener-trap.ts` has no src importer is a D2 or D10 observation in its own right (earlier waves recorded it as test-only-reachable and protected). It is cited here only as evidence of which posture production runs, not filed as dead code.
- **Already-filed check:** no PTQ or pending intake topic in the brief's list covers forwarding-listener trapping. The closest is PTQ-1109, a D10 header-disclosure item for cancellation-core, which is a different root cause.

## Triage
verdict: confirmed — re-verified: forwardSignalReason (cancellation-core.ts:61-75) calls thetaAbort.abort(source.reason) untrapped on both the already-aborted path and the listener path (lines 66/71), and forwardSlashCommandCancel (:130-142) and deriveChildThetaAbort (:176-189) delegate to it. forwardWithTrap (forwarding-listener-trap.ts:157-184) wraps the same call in a try/catch tagged `allow-broad-catch: theta/runtime/internal-error — cancellation.md` and sends throws to routeForwardingDefect. All three stated searches reproduce: 1 importer, tests/forwarding-listener-throw-trap.test.ts:49; 4 production call sites, live-prompt-query-driver:861, production-theta-producer:675/804, theta-composition-producer:219; 2 untrapped hits. The anchor, cancellation.md:15 §"Forwarding-listener throw", is verbatim and pins the trapped posture for exactly these three forwarders. No stated rationale exempts the forward direction: bug 0319:306-311 only scopes its own reverse listener, and the V17b plan leaf is retired. Not EXST-9/PIC-73. No PTQ or intake file tracks this; PTQ-1109 is a header-disclosure item. The fix aligns the production forwarders to the anchored trap posture and needs a defect sink at each caller (triage: claude-opus-5-5)
