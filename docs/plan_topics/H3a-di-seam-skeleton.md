# `H3a` — Dependency-injection seam skeleton

**Convention.** [`conventions.md`](./conventions.md) — *No globals, statics, singletons*.

**Adds.** The constructor-injection runtime root: a per-runtime object graph that threads the host seams (`Checkpoint`, `SchemaValidator`, `Clock`, `FileSystem`, `FileWatcher`, `TokenEstimator`, `IdSource`) as injected interfaces, with one instance per runtime and no ambient access. Seam *interfaces* only; their normative behaviour is implemented by the `V8*` leaves.

**Tests.**
- `Convention:` (*No globals, statics, singletons*) constructing two runtime roots yields two isolated seam graphs sharing no mutable state.
- `Convention:` (*No globals, statics, singletons*) an architectural test asserts no `src/**` module reads `process.env`, `process.cwd`, `crypto.randomUUID`, `Date.now`, or `setTimeout` outside its declared seam adapter.

**Deps.** `H2a`

**Ships when.** `npm test` constructs two independent runtime roots and asserts seam isolation and the ambient-access ban.
