# `V8e` — `FileWatcher` and `TokenEstimator` seams

**Spec.** [`../spec_topics/pi-integration-contract/host-interfaces-core.md`](../spec_topics/pi-integration-contract/host-interfaces-core.md), [`../spec_topics/pi-integration-contract/host-interfaces-services.md`](../spec_topics/pi-integration-contract/host-interfaces-services.md).

**Adds.** The `FileWatcher` host seam (`watch(roots,handler) → Unsubscribe`, three change kinds) and the `TokenEstimator` host seam (`estimate(message)`, delegating `estimateTokens`). The `FileSystem` seam is owned by [`V8b`](./V8b-clock-fs-id-watch-token-seams.md); the `Clock`/`IdSource` seams by [`V8d`](./V8d-clock-id-seams.md).

**Tests.**
- `PIC-14`: `FileWatcher.watch` returns an `Unsubscribe` and reports the three change kinds.
- `PIC-16`: `TokenEstimator.estimate` delegates to `estimateTokens` and is per-runtime.

**Deps.** `V8e-T`, `H3a`

**Ships when.** `npm test` asserts the `FileWatcher.watch` `Unsubscribe`/three-change-kind contract and the per-runtime `TokenEstimator.estimate` delegation.
