# `V8d-T` — `Clock` and `IdSource` seams (tests)

**Spec.** [`../spec_topics/pi-integration-contract/host-interfaces-core.md`](../spec_topics/pi-integration-contract/host-interfaces-core.md), [`../spec_topics/pi-integration-contract/host-interfaces-services.md`](../spec_topics/pi-integration-contract/host-interfaces-services.md).

**Adds.** Failing tests for the paired `V8d` implementation leaf.

**Tests.**
- `PIC-12`: `Clock` is per-runtime; an architectural test asserts no *direct* ambient timing reference outside the `WallClock` adapter, whose `now()`→`performance.now()`, `wallNow()`→`Date.now()`, and `setTimeout`/`clearTimeout` sites each carry their own same-line `// allow-ambient: <primitive> — Clock` comment the *No globals, statics, singletons* rule ([`conventions.md`](./conventions.md)) requires (that comment is itself the allow-list entry; there is no separate registry) (the `H3a` identifier-keyed scan enforces the spec's full WallClock ban surface — `Date.now`, `performance.now`, `Date.prototype.getTime`, `setTimeout`, `clearTimeout`; indirect forms are not mechanically detected and are owned by the *Per-phase TDD ritual* self-review step in [`conventions.md`](./conventions.md)).
- `PIC-20`: the `CryptoIdSource` adapter is the only *direct* `crypto.randomUUID` site, where both `newInvocationId()` and `newToolCallId()` delegate to it; each delegating call carries its own same-line `// allow-ambient: crypto.randomUUID — IdSource` comment (which is itself the allow-list entry; there is no separate registry) per the *No globals, statics, singletons* rule ([`conventions.md`](./conventions.md)) (the `H3a` identifier-keyed scan flags any other direct `crypto.randomUUID` reference); indirect forms are owned by the *Per-phase TDD ritual* self-review step in [`conventions.md`](./conventions.md).

**Deps.** `H3a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
