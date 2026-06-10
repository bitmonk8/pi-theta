# `V9g-T` — Session-shutdown teardown and emission isolation (tests)

**Spec.** [`../spec_topics/pi-integration-contract/session-shutdown-semantics.md`](../spec_topics/pi-integration-contract/session-shutdown-semantics.md), [`../spec_topics/pi-integration-contract/diagnostic-emission-isolation.md`](../spec_topics/pi-integration-contract/diagnostic-emission-isolation.md), [`../spec_topics/pi-integration-contract/patch-skew-degradation.md`](../spec_topics/pi-integration-contract/patch-skew-degradation.md).

**Adds.** Failing tests for the paired `V9g` implementation leaf.

**Tests.**
- `PIC-7`: one active user session per instance; the reason union is pinned to `SessionShutdownEvent['reason']`.
- `DIAG-1` (host rows): `loom/host/session-shutdown-teardown-step-failed` fires with its closed `details.call` set; each `console.error` emission is wrapped and a serialiser throw degrades to the bare-`code` form.
- `loom/runtime/cancelled-by-session-shutdown` is emitted per in-flight invocation; `loom/runtime/reload-teardown-timeout` fires at the cap.

**Deps.** `V9e`, `V9h`, `V17a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
