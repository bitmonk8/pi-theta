# `V8e` — `FileWatcher` and `TokenEstimator` seams

**Spec.** [`../spec_topics/pi-integration-contract/host-interfaces-core.md`](../spec_topics/pi-integration-contract/host-interfaces-core.md), [`../spec_topics/pi-integration-contract/host-interfaces-services.md`](../spec_topics/pi-integration-contract/host-interfaces-services.md).

**Adds.** The `FileWatcher` host seam (`watch(roots,handler) → Unsubscribe`; three change kinds for the steady-state **delivery** contract, plus an enumerated **terminal-signal channel** by which the chokidar adapter conveys a post-`error`/post-throw *stopped-delivering* observation to the runtime — a `GOV-18` arm (a)-permitted member that mirrors the production path and does not redefine the three-change-kind delivery contract; the matching `FakeFileWatcher` test double exposes the injection point that drives this channel deterministically) and the `TokenEstimator` host seam (`estimate(message)`, delegating `estimateTokens`). The `FileSystem` seam is owned by [`V8b`](./V8b-filesystem-seam.md); the `Clock`/`IdSource` seams by [`V8d`](./V8d-clock-id-seams.md).

**Tests.**
- `PIC-14`: `FileWatcher.watch` returns an `Unsubscribe` and reports the three change kinds (the delivery contract); the seam also exposes the enumerated terminal-signal channel and a `FakeFileWatcher` injection point that conveys a stopped-delivering observation distinct from the three change kinds (driven against `PIC-55` by [`V9q-T`](./V9q-T-watcher-terminated-recovery.md)).
- `PIC-16`: `TokenEstimator.estimate` delegates to `estimateTokens` and is per-runtime.

**Deps.** `V8e-T`, `H3a`

**Ships when.** `npm test` asserts the `FileWatcher.watch` `Unsubscribe`/three-change-kind delivery contract, the presence of the terminal-signal channel and its `FakeFileWatcher` injection point, and the per-runtime `TokenEstimator.estimate` delegation.
