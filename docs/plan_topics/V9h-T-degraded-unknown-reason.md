# `V9h-T` — Session-only degraded state and unknown-reason rule (tests)

**Spec.** [`../spec_topics/pi-integration-contract/session-only-degraded-state.md`](../spec_topics/pi-integration-contract/session-only-degraded-state.md), [`../spec_topics/pi-integration-contract/unknown-reason-rule.md`](../spec_topics/pi-integration-contract/unknown-reason-rule.md).

**Adds.** Failing tests for the paired `V9h` implementation leaf.

**Tests.**
- A reason outside the closed set (or one whose property access throws) routes through full teardown and emits `loom/host/session-shutdown-reason-unknown` (W).
- A snapshot read failure emits `loom/host/session-shutdown-pinned-constant-unreadable` with its four discriminators.
- On `new`/`resume`/`fork` with a successful snapshot read, the runtime emits `loom/host/session-shutdown-runtime-degraded` and fronts later slash invocations with the degraded note until `/reload`.

**Deps.** `V9b`, `V18c`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
