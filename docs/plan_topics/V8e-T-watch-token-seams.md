# `V8e-T` — `FileWatcher` and `TokenEstimator` seams (tests)

**Spec.** [`../spec_topics/pi-integration-contract/host-interfaces-core.md`](../spec_topics/pi-integration-contract/host-interfaces-core.md), [`../spec_topics/pi-integration-contract/host-interfaces-services.md`](../spec_topics/pi-integration-contract/host-interfaces-services.md).

**Adds.** Failing tests for the paired `V8e` implementation leaf.

**Tests.**
- `PIC-14`: `FileWatcher.watch` returns an `Unsubscribe` and reports the three change kinds.
- `PIC-16`: `TokenEstimator.estimate` delegates to `estimateTokens` and is per-runtime.

**Deps.** `H3a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
