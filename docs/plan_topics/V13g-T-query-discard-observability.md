# `V13g-T` — Discarded-query result discipline and discard observability (tests)

**Spec.** [`../spec_topics/query.md`](../spec_topics/query.md), [`../spec_topics/query/query-escapes-stringification.md`](../spec_topics/query/query-escapes-stringification.md), [`../spec_topics/pi-integration-contract/runtime-event-channel.md`](../spec_topics/pi-integration-contract/runtime-event-channel.md).

**Adds.** Failing tests for the paired `V13g` implementation leaf.

**Tests.**
- `loom/parse/discarded-query-result` fires on a bare `@`...`` expression-statement; separately, the runtime discard-observability event fires on an explicit `Err` discard (`let _ = @`...`` or the `void`-tail form).

**Deps.** `V13a`, `V9d`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
