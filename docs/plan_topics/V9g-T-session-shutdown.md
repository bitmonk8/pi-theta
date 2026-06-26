# `V9g-T` — Session-shutdown teardown and emission isolation (tests)

**Spec.** [`../spec_topics/pi-integration-contract/session-shutdown-semantics.md`](../spec_topics/pi-integration-contract/session-shutdown-semantics.md), [`../spec_topics/pi-integration-contract/diagnostic-emission-isolation.md`](../spec_topics/pi-integration-contract/diagnostic-emission-isolation.md), [`../spec_topics/pi-integration-contract/patch-skew-degradation.md`](../spec_topics/pi-integration-contract/patch-skew-degradation.md), [`../spec_topics/cancellation.md`](../spec_topics/cancellation.md).

**Adds.** Failing tests for the paired `V9g` implementation leaf.

**Tests.**
- `PIC-7`: one active user session per instance; the reason union is pinned to `SessionShutdownEvent['reason']`.
- `DIAG-1` (host rows): `loom/host/session-shutdown-teardown-step-failed` fires with its closed `details.call` set; each `console.error` emission is wrapped and a serialiser throw degrades to the bare-`code` form.
- [diagnostic-emission-isolation.md](../spec_topics/pi-integration-contract/diagnostic-emission-isolation.md#diagnostic-emission-isolation) (`PIC-24`, `PIC-25`, `PIC-26`, `PIC-27`, `PIC-28`): each teardown-time `console.error` is `try`/`catch`-wrapped (`PIC-24`) over the whole serialisation-and-emission sequence with the bare-`code` / two-token / three-token serialiser-throw fallback forms (`PIC-25`); the construction-site catch-arm self-wraps (`PIC-26`); a throw out of `console.error` is swallowed and does not escape the handler (`PIC-27`); and the "exactly once" / "at most once" count semantics are framed at the invocation site (`PIC-28`).
- `loom/runtime/cancelled-by-session-shutdown` is emitted per in-flight invocation; `loom/runtime/reload-teardown-timeout` fires at the cap.
- `patch-skew-degradation.md` §`session_shutdown` sub-step 3 (code-keyed-area token `cka-31`): sub-step 3 awaits every in-flight entry's `disposeBarrier` to settle via `Promise.allSettled`, bounded by `SHUTDOWN_AWAIT_CAP_MS`.
- `CNCL-4` (session-shutdown synthesised-reason facet): the `session_shutdown` handler aborts each in-flight `loomAbort` with a synthesised `Error` whose `message` is byte-exact `"loom cancelled by session shutdown"`; assert the observed `loomAbort.signal.reason` is that synthesised `Error` object itself — `signal.reason instanceof Error` with `signal.reason.message` byte-exact `"loom cancelled by session shutdown"` — per `cancellation.md` CNCL-4's `signal.reason === source.reason` contract, at a downstream checkpoint.

**Deps.** `V9e`, `V9h`, `V17a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
