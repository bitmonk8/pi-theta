# `V8a` — `Checkpoint` and `SchemaValidator` seams

**Spec.** [`../spec_topics/pi-integration-contract/host-interfaces-core.md`](../spec_topics/pi-integration-contract/host-interfaces-core.md), [`../spec_topics/implementation-notes.md`](../spec_topics/implementation-notes.md).

**Adds.** The `Checkpoint` seam (await before each cancel checkpoint; macrotask yield for `loop-iter`, microtask otherwise; per-invocation; no extra sites) and the `SchemaValidator` seam (one-pass multi-error AJV wrapper, no convert/defaults, in-doc `$ref`, silent unknown `format`, deterministic, per-runtime, slug-cache byte-verify).

**Tests.**
- `PIC-10`: a checkpoint awaits at each defined cancel site with the correct yield kind and adds no extra sites.
- `PIC-11`: validation returns all errors in one pass, performs no coercion/defaulting, and on a slug-cache byte mismatch fires `validator-cache-collision`.

**Deps.** `V8a-T`, `H3a`

**Ships when.** `npm test` asserts the checkpoint yield semantics and the one-pass validator contract.
