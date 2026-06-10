# `V17a` — Cancellation core

**Spec.** [`../spec_topics/cancellation.md`](../spec_topics/cancellation.md), [`../spec_topics/pi-integration-contract/host-interfaces-core.md`](../spec_topics/pi-integration-contract/host-interfaces-core.md).

**Adds.** The `loomAbort` controller and the cancellation contract: forwarding Pi's per-handler `ctx.signal`, the tool-exposed `signal`, and parent-`invoke` signals into `loomAbort` (never `ctx.signal` directly); abort-reason propagation (synthesised for `agent_end` and `session_shutdown`); downward-only propagation; the fixed checkpoint set (including pre-binder); and the late-settlement discard rules.

**Tests.**
- `CNCL-1`: a late tool-call value does not rebind its call site.
- `CNCL-2`: no second `Err` is produced per invocation.
- `CNCL-3`: no second `RuntimeEvent` is produced per invocation.
- `loom/parse/timeout-field-rejected` (cancellation.md — CNCL area): cancellation forwards via `loomAbort` (never `ctx.signal` directly); propagates downward only; a swallowing handler suppresses the late side-channel; `loom/parse/timeout-field-rejected` fires on a timeout field.

**Deps.** `V17a-T`, `V8a`

**Ships when.** `npm test` forwards a cancel into `loomAbort`, proves downward-only propagation, and asserts CNCL-1/2/3.
