# `V9d-T` — Runtime-event channel and `masked` co-fire (tests)

**Spec.** [`../spec_topics/pi-integration-contract/runtime-event-channel.md`](../spec_topics/pi-integration-contract/runtime-event-channel.md), [`../spec_topics/diagnostics.md`](../spec_topics/diagnostics.md).

**Adds.** Failing tests for the paired `V9d` implementation leaf.

**Tests.**
- `PIC-1`: `masked` carries a closed id set, is omitted (not `[]`) when empty, has the per-site reachable domain (only `["ceiling#2"]` on a typed-query response in V1), is a pure read, and is cascade-copied verbatim with non-inclusion under dedup.
- Each always-log kind emits exactly once; the success side honours the null-policy.

**Deps.** `V7a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
