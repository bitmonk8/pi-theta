# `V9h` — Session-only degraded state and unknown-reason rule

**Spec.** [`../spec_topics/pi-integration-contract/session-only-degraded-state.md`](../spec_topics/pi-integration-contract/session-only-degraded-state.md), [`../spec_topics/pi-integration-contract/unknown-reason-rule.md`](../spec_topics/pi-integration-contract/unknown-reason-rule.md).

**Adds.** The unknown-reason partition (closed-set validation; read order snapshot → `event.reason`; the four-arm routing) and the session-only degraded state for `new`/`resume`/`fork` (tag write via `markRuntimeDegraded`, recovery prohibitions until `/reload`, the tag-transition vs diagnostic-emission predicate split).

**Tests.**
- A reason outside the closed set (or one whose property access throws) routes through full teardown and emits `loom/host/session-shutdown-reason-unknown` (W).
- A snapshot read failure emits `loom/host/session-shutdown-pinned-constant-unreadable` with its four discriminators.
- On `new`/`resume`/`fork` with a successful snapshot read, the runtime emits `loom/host/session-shutdown-runtime-degraded` and fronts later slash invocations with the degraded note until `/reload`.

**Deps.** `V9h-T`, `V9b`, `V18c`

**Ships when.** `npm test` exercises the closed-set, unknown, snapshot-failure, and degraded paths with their codes.
