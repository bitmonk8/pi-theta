---
id: PTQ-0027
title: awaitSettledTurn takes a dispatchHost parameter although it is closure-scoped and its single call site passes the enclosing host
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/production-host-loop-dispatch.ts:509-513
  - src/extension/production-host-loop-dispatch.ts:555-583
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# awaitSettledTurn takes a dispatchHost parameter although it is closure-scoped and its single call site passes the enclosing host

## Observation
`awaitSettledTurn` is a function declared inside
`createProductionHostLoopDispatch`'s closure. It already reads the closure's
`pendingSettle` slot directly (lines 567-568, 581), yet takes the host as a
`dispatchHost` parameter, used only to forward to `confirmIdle` (line 583). Its
single call site (line 509) passes `host` — the same closure variable the
function could read the way it reads `pendingSettle`. Every call site (there is
exactly one) passes the same value.

## Evidence
src/extension/production-host-loop-dispatch.ts:509-513 (the only call site,
inside the same closure that binds `host`):

```ts
        await awaitSettledTurn(host, signal, (): void => {
          host.pi.sendUserMessage(
            marker + JSON.stringify({ tool: request.toolName, args: request.args }),
          );
        });
```

src/extension/production-host-loop-dispatch.ts:555-583 (definition; the
parameter's only use is the `confirmIdle` forward, while `pendingSettle` is
read from the closure):

```ts
  function awaitSettledTurn(
    dispatchHost: HostLoopDispatchHost,
    signal: AbortSignal,
    send: () => void,
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      ...
        if (pendingSettle === settle) {
          pendingSettle = undefined;
        }
      ...
      pendingSettle = settle;
      send();
    }).then(() => confirmIdle(dispatchHost, signal));
  }
```

(Excerpt elided with `...` for length; the full body is lines 560-584.
`pendingSettle` reads/writes at :567-568 and :581 are closure accesses.)

Search count: `awaitSettledTurn` appears exactly twice in the repository
(definition :555, call :509); it is function-scoped inside
`createProductionHostLoopDispatch`, so no external caller can exist.

## Why this is a problem
Vestigial parameter: the sole call site passes the identical enclosing-closure
value, and the function already depends on that same closure for
`pendingSettle`, so the parameter buys no decoupling — the function is not
extractable to module scope without also threading the settle slot. A parameter
that can only ever receive one value adds signature width and suggests an
injection point that does not exist ( `confirmIdle`, by contrast, is
module-scoped and legitimately takes `host` as a parameter).

## Suggested direction (non-binding, optional)
Let `awaitSettledTurn` read `host` from the enclosing closure exactly as it
reads `pendingSettle`, forwarding it to `confirmIdle` from there; or, if the
parameter is meant to signal future extraction, extract the whole helper with
its slot. The fix stage owns the choice.

## False-positive check
- Reference search `awaitSettledTurn` across src/, extensions/, tools/, tests/:
  2 hits total, both in production-host-loop-dispatch.ts (:509 call, :555
  definition). The function is nested (not exported), so no dynamic or
  string-keyed access is possible; searched anyway — no other hit.
- Tests-as-callers check: no test references `awaitSettledTurn`; tests drive
  `createProductionHostLoopDispatch`'s returned dispatch function, which is
  unaffected by the parameter's existence.
- Intent check: the adjacent comment (:552-554) explains the helper is declared
  once so serialized dispatches share one `pendingSettle` slot — an argument
  that relies on the closure, not on parameterizing the host; no recorded
  intent for the parameter itself was found.

## Triage
verdict: confirmed — reproduced independently: `awaitSettledTurn` (:555) has exactly one call site repo-wide (:509, other hits are gitignored `dist/` build output) which passes the unshadowed enclosing-closure `host` (:369, never reassigned), and `dispatchHost` is read once (:583) inside a nested non-exported helper that already reads `pendingSettle` from that same closure, so the parameter is provably constant and buys no extractability. (triage: claude-opus-5)
