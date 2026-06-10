# `V5d-T` — Schema-subset gate, lowering, and canonical hash (tests)

**Spec.** [`../spec_topics/schema-subset.md`](../spec_topics/schema-subset.md), [`../spec_topics/schemas.md`](../spec_topics/schemas.md).

**Adds.** Failing tests for the paired `V5d` implementation leaf.

**Tests.**
- The reject gate fires the subset-violation codes for each rejected keyword and accepts the permitted subset.
- `loom/load/schema-slug-collision`: two non-byte-identical inline schemas hashing to the same slug fire; byte-identical ones dedup silently.
- The canonical hash is SHA-256 over the keys-sorted, whitespace-free, binder-number-rendered canonical form; the slug is its first 16 hex.
- `Result` in schema position is rejected; array element order is preserved.

**Deps.** `V5a`, `V5b`, `V2d`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
