# `V8d` — `Clock` and `IdSource` seams

**Spec.** [`../spec_topics/pi-integration-contract/host-interfaces-core.md`](../spec_topics/pi-integration-contract/host-interfaces-core.md), [`../spec_topics/pi-integration-contract/host-interfaces-services.md`](../spec_topics/pi-integration-contract/host-interfaces-services.md).

**Adds.** The two ambient-wrapping host seams kept together so the `PIC-12`/`PIC-20` `// allow-ambient:` allow-list contract is not split: `Clock` (`now`/`wallNow`/`setTimeout`/`clearTimeout` via the `WallClock` adapter) and `IdSource` (`newInvocationId()` UUID). The `FileSystem` seam is owned by [`V8b`](./V8b-clock-fs-id-watch-token-seams.md); the `FileWatcher`/`TokenEstimator` seams by [`V8e`](./V8e-watch-token-seams.md).

**Tests.**
- `PIC-12`: `Clock` is per-runtime; an architectural test asserts no *direct* ambient timing reference outside the `WallClock` adapter, whose `now()`→`performance.now()`, `wallNow()`→`Date.now()`, and `setTimeout`/`clearTimeout` sites each carry their own same-line `// allow-ambient: <primitive> — Clock` comment the *No globals, statics, singletons* rule ([`conventions.md`](./conventions.md)) requires (that comment is itself the allow-list entry; there is no separate registry) (the `H3a` identifier-keyed scan enforces the spec's full WallClock ban surface — `Date.now`, `performance.now`, `Date.prototype.getTime`, `setTimeout`, `clearTimeout`; indirect forms are not mechanically detected and are owned by the *Per-phase TDD ritual* self-review step in [`conventions.md`](./conventions.md)).
- `PIC-20`: `IdSource.newInvocationId()` is the only *direct* `crypto.randomUUID` reference, registered as an exempt ambient site by its same-line `// allow-ambient: crypto.randomUUID — IdSource` comment (which is itself the allow-list entry; there is no separate registry) per the *No globals, statics, singletons* rule ([`conventions.md`](./conventions.md)) (the `H3a` identifier-keyed scan); indirect forms are owned by the *Per-phase TDD ritual* self-review step in [`conventions.md`](./conventions.md).

**Deps.** `V8d-T`, `H3a`

**Ships when.** `npm test` asserts the `Clock` per-runtime contract and its ambient-timing ban, and that `IdSource.newInvocationId()` is the sole direct `crypto.randomUUID` site.
