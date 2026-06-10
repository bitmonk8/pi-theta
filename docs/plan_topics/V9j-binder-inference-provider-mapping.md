# `V9j` — Binder inference call and provider-error mapping

**Spec.** [`../spec_topics/pi-integration-contract/binder-inference.md`](../spec_topics/pi-integration-contract/binder-inference.md), [`../spec_topics/pi-integration-contract/provider-error-mapping.md`](../spec_topics/pi-integration-contract/provider-error-mapping.md).

**Adds.** The pi-ai `complete()` inference call (forced-tool envelope, `temperature:0`, the seed-field mapping, `onResponse`) and the provider-error → `QueryError` classifier (status / `errorMessage` classification, `retryable`, context-overflow extraction, stop-reason, the per-provider seed-field table).

**Tests.**
- The provider classifier maps each provider response to its `QueryError` variant and `retryable` flag; context-overflow is extracted to `ContextOverflowError`.
- `complete()` is issued with the forced-tool envelope, `temperature:0`, and the mapped seed field.
- `loom/load/typed-query-unsupported-provider` (W) is surfaced when the provider lacks the typed-query path.

**Deps.** `V9j-T`, `V4d`, `V11a`

**Ships when.** `npm test` asserts the provider→`QueryError` table and the deterministic `complete()` envelope.
