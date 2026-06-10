# `V9g` — Session-shutdown teardown and emission isolation

**Spec.** [`../spec_topics/pi-integration-contract/session-shutdown-semantics.md`](../spec_topics/pi-integration-contract/session-shutdown-semantics.md), [`../spec_topics/pi-integration-contract/diagnostic-emission-isolation.md`](../spec_topics/pi-integration-contract/diagnostic-emission-isolation.md), [`../spec_topics/pi-integration-contract/patch-skew-degradation.md`](../spec_topics/pi-integration-contract/patch-skew-degradation.md).

**Adds.** The `session_shutdown` handler: the five-sub-step fixed teardown sequence with per-step isolation, session-swap semantics for in-flight invocations (abort-and-await within `SHUTDOWN_AWAIT_CAP_MS`), the `loom/host/*` teardown diagnostics emitted via `console.error` with each emission `try`/`catch`-wrapped, and the bare / two-token / three-token fallback wire forms.

**Tests.**
- `PIC-7`: one active user session per instance; the reason union is pinned to `SessionShutdownEvent['reason']`.
- `DIAG-1` (host rows): `loom/host/session-shutdown-teardown-step-failed` fires with its closed `details.call` set; each `console.error` emission is wrapped and a serialiser throw degrades to the bare-`code` form.
- `loom/runtime/cancelled-by-session-shutdown` is emitted per in-flight invocation; `loom/runtime/reload-teardown-timeout` fires at the cap.

**Deps.** `V9g-T`, `V9e`, `V9h`, `V17a`

**Ships when.** `npm test` drives a shutdown, asserting per-step isolation, the await cap, and the wrapped host emissions.
