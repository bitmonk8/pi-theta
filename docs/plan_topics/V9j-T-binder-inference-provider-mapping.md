# `V9j-T` — Binder inference call and provider-error mapping (tests)

**Spec.** [`../spec_topics/pi-integration-contract/binder-inference.md`](../spec_topics/pi-integration-contract/binder-inference.md), [`../spec_topics/pi-integration-contract/provider-error-mapping.md`](../spec_topics/pi-integration-contract/provider-error-mapping.md).

**Adds.** Failing tests for the paired `V9j` implementation leaf.

**Tests.**
- The provider classifier maps each provider response to its `QueryError` variant and `retryable` flag; context-overflow is extracted to `ContextOverflowError`.
- `complete()` is issued with the forced-tool envelope, `temperature:0`, and the mapped seed field.
- `loom/load/typed-query-unsupported-provider` (W) is surfaced when the provider lacks the typed-query path.

**Deps.** `V4d`, `V11a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
