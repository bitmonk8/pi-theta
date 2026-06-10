# `V8b-T` — `Clock`, `FileSystem`, `IdSource`, `FileWatcher`, `TokenEstimator` seams (tests)

**Spec.** [`../spec_topics/pi-integration-contract/host-interfaces-core.md`](../spec_topics/pi-integration-contract/host-interfaces-core.md), [`../spec_topics/pi-integration-contract/host-interfaces-services.md`](../spec_topics/pi-integration-contract/host-interfaces-services.md).

**Adds.** Failing tests for the paired `V8b` implementation leaf.

**Tests.**
- `PIC-12`: `Clock` is per-runtime; an architectural test asserts no ambient timing call outside the `WallClock` adapter.
- `PIC-13`: `FileSystem` maps Node `.code` values; no `src/**` module reads `process.env`/`process.cwd` directly.
- `PIC-20`: `IdSource.newInvocationId()` is the only `crypto.randomUUID` site.
- `PIC-14`: `FileWatcher.watch` returns an `Unsubscribe` and reports the three change kinds.
- `PIC-16`: `TokenEstimator.estimate` delegates to `estimateTokens` and is per-runtime.

**Deps.** `H3a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
