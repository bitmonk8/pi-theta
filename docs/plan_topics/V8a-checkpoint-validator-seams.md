# `V8a` — `Checkpoint` seam

**Spec.** [`../spec_topics/pi-integration-contract/host-interfaces-core.md`](../spec_topics/pi-integration-contract/host-interfaces-core.md), [`../spec_topics/implementation-notes.md`](../spec_topics/implementation-notes.md).

**Adds.** The `Checkpoint` seam (await before each cancel checkpoint; macrotask yield for `loop-iter`, microtask otherwise; per-invocation; no extra sites). The `SchemaValidator` seam is owned by [`V8c`](./V8c-schema-validator-seam.md).

**Tests.**
- `PIC-10`: a checkpoint awaits at each defined cancel site with the correct yield kind and adds no extra sites.

**Deps.** `V8a-T`, `H3a`, `V8d`

**Ships when.** `npm test` asserts the checkpoint yield semantics (macrotask yield for `loop-iter`, microtask otherwise, no extra sites).
