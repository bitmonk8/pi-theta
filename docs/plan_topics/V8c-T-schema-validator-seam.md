# `V8c-T` — `SchemaValidator` seam (tests)

**Spec.** [`../spec_topics/pi-integration-contract/host-interfaces-core.md`](../spec_topics/pi-integration-contract/host-interfaces-core.md), [`../spec_topics/implementation-notes.md`](../spec_topics/implementation-notes.md).

**Adds.** Failing tests for the paired `V8c` implementation leaf.

**Tests.**
- `PIC-11`: validation returns all errors in one pass, performs no coercion/defaulting, and on a slug-cache byte mismatch fires `validator-cache-collision`.

**Deps.** `H3a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
