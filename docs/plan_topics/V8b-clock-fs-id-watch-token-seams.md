# `V8b` — `Clock`, `FileSystem`, `IdSource`, `FileWatcher`, `TokenEstimator` seams

**Spec.** [`../spec_topics/pi-integration-contract/host-interfaces-core.md`](../spec_topics/pi-integration-contract/host-interfaces-core.md), [`../spec_topics/pi-integration-contract/host-interfaces-services.md`](../spec_topics/pi-integration-contract/host-interfaces-services.md).

**Adds.** The remaining host seams: `Clock` (`now`/`wallNow`/`setTimeout`/`clearTimeout`), `FileSystem` (`readText`/`writeText`/`exists`/`homedir`/`cwd`/`readdir`/`lstat`/`realpath` with Node `.code` mapping), `IdSource` (`newInvocationId()` UUID), `FileWatcher` (`watch(roots,handler) → Unsubscribe`, three kinds), and `TokenEstimator` (`estimate(message)`, delegating `estimateTokens`).

**Tests.**
- `PIC-12`: `Clock` is per-runtime; an architectural test asserts no ambient timing call outside the `WallClock` adapter.
- `PIC-13`: `FileSystem` maps Node `.code` values; no `src/**` module reads `process.env`/`process.cwd` directly.
- `PIC-20`: `IdSource.newInvocationId()` is the only `crypto.randomUUID` site.
- `PIC-14`: `FileWatcher.watch` returns an `Unsubscribe` and reports the three change kinds.
- `PIC-16`: `TokenEstimator.estimate` delegates to `estimateTokens` and is per-runtime.

**Deps.** `V8b-T`, `H3a`

**Ships when.** `npm test` asserts each seam's contract and the ambient-access ban.
