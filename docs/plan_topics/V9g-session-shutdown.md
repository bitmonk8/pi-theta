# `V9g` — Session-shutdown teardown and emission isolation

**Spec.** [`../spec_topics/pi-integration-contract/session-shutdown-semantics.md`](../spec_topics/pi-integration-contract/session-shutdown-semantics.md), [`../spec_topics/pi-integration-contract/diagnostic-emission-isolation.md`](../spec_topics/pi-integration-contract/diagnostic-emission-isolation.md), [`../spec_topics/pi-integration-contract/patch-skew-degradation.md`](../spec_topics/pi-integration-contract/patch-skew-degradation.md), [`../spec_topics/cancellation.md`](../spec_topics/cancellation.md).

**Adds.** The `session_shutdown` handler: the five-sub-step fixed teardown sequence with per-step isolation, session-swap semantics for in-flight invocations (sub-step 3 aborts each in-flight `loomAbort` then awaits every in-flight entry's `disposeBarrier` to settle via `Promise.allSettled`, bounded by `SHUTDOWN_AWAIT_CAP_MS` — the `session_shutdown` sub-step-3 settle-all code-keyed obligation area in [patch-skew-degradation.md](../spec_topics/pi-integration-contract/patch-skew-degradation.md), [`coverage-matrix.md`](./coverage-matrix.md) code-keyed-area token `cka-31`, which the site's `// allow: cka-31 — patch-skew-degradation.md` exemption comment cites), the `loom/host/*` teardown diagnostics emitted via `console.error` with each emission `try`/`catch`-wrapped, and the bare / two-token / three-token fallback wire forms.

**Tests.**
- `PIC-7`: one active user session per instance; the reason union is pinned to `SessionShutdownEvent['reason']`.
- `DIAG-1` (host rows): `loom/host/session-shutdown-teardown-step-failed` fires with its closed `details.call` set; each `console.error` emission is wrapped and a serialiser throw degrades to the bare-`code` form.
- `loom/runtime/cancelled-by-session-shutdown` is emitted per in-flight invocation; `loom/runtime/reload-teardown-timeout` fires at the cap.
- `patch-skew-degradation.md` §`session_shutdown` sub-step 3 (code-keyed-area token `cka-31`): sub-step 3 awaits every in-flight entry's `disposeBarrier` to settle via `Promise.allSettled`, bounded by `SHUTDOWN_AWAIT_CAP_MS`.
- `CNCL-4` (session-shutdown synthesised-reason facet): the `session_shutdown` handler aborts each in-flight `loomAbort` with a synthesised `Error` whose `message` is byte-exact `"loom cancelled by session shutdown"`; assert the observed `loomAbort.signal.reason` is that synthesised `Error` object itself — `signal.reason instanceof Error` with `signal.reason.message` byte-exact `"loom cancelled by session shutdown"` — per `cancellation.md` CNCL-4's `signal.reason === source.reason` contract, at a downstream checkpoint.

**Deps.** `V9g-T`, `V9a`, `V9e`, `V9h`, `V17a`

**Ships when.** `npm test` drives a shutdown, asserting per-step isolation, the await cap, the wrapped host emissions, and the `CNCL-4` session-shutdown reason facet — each in-flight `loomAbort.signal.reason` is the synthesised `Error` object itself (`signal.reason instanceof Error` with `signal.reason.message` byte-exact `"loom cancelled by session shutdown"`), per `cancellation.md` CNCL-4's `signal.reason === source.reason` contract, at a downstream checkpoint.
