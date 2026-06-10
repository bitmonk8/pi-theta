# `V17a-T` — Cancellation core (tests)

**Spec.** [`../spec_topics/cancellation.md`](../spec_topics/cancellation.md), [`../spec_topics/pi-integration-contract/host-interfaces-core.md`](../spec_topics/pi-integration-contract/host-interfaces-core.md).

**Adds.** Failing tests for the paired `V17a` implementation leaf.

**Tests.**
- `CNCL-1`: a late tool-call value does not rebind its call site.
- `CNCL-2`: no second `Err` is produced per invocation.
- `CNCL-3`: no second `RuntimeEvent` is produced per invocation.
- `loom/parse/timeout-field-rejected` (cancellation.md — CNCL area): cancellation forwards via `loomAbort` (never `ctx.signal` directly); propagates downward only; a swallowing handler suppresses the late side-channel; `loom/parse/timeout-field-rejected` fires on a timeout field.

**Deps.** `V8a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
