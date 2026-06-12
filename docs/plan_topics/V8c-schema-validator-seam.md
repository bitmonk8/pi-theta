# `V8c` — `SchemaValidator` seam

**Spec.** [`../spec_topics/pi-integration-contract/host-interfaces-core.md`](../spec_topics/pi-integration-contract/host-interfaces-core.md), [`../spec_topics/implementation-notes.md`](../spec_topics/implementation-notes.md).

**Adds.** The `SchemaValidator` seam (one-pass multi-error AJV wrapper, no convert/defaults, in-doc `$ref`, silent unknown `format`, deterministic, per-runtime, slug-cache byte-verify).

**Tests.**
- `PIC-11`: validation returns all errors in one pass, performs no coercion/defaulting, and on a slug-cache byte mismatch fires `validator-cache-collision`.

**Deps.** `V8c-T`, `H3a`

**Ships when.** `npm test` asserts the one-pass multi-error validator contract — no coercion/defaulting and a `validator-cache-collision` on a slug-cache byte mismatch.
