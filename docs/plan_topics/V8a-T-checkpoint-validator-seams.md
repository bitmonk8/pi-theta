# `V8a-T` — `Checkpoint` and `SchemaValidator` seams (tests)

**Spec.** [`../spec_topics/pi-integration-contract/host-interfaces-core.md`](../spec_topics/pi-integration-contract/host-interfaces-core.md), [`../spec_topics/implementation-notes.md`](../spec_topics/implementation-notes.md).

**Adds.** Failing tests for the paired `V8a` implementation leaf.

**Tests.**
- `PIC-10`: a checkpoint awaits at each defined cancel site with the correct yield kind and adds no extra sites.
- `PIC-11`: validation returns all errors in one pass, performs no coercion/defaulting, and on a slug-cache byte mismatch fires `validator-cache-collision`.

**Deps.** `H3a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
