# `V5d` — Schema-subset gate, lowering, and canonical hash

**Spec.** [`../spec_topics/schema-subset.md`](../spec_topics/schema-subset.md), [`../spec_topics/schemas.md`](../spec_topics/schemas.md).

**Adds.** The JSON-Schema-subset reject gate (Draft 2020-12; `anyOf` only; objects all-required + `additionalProperties:false`; single `items`; null via union; reject pattern/format/min*/max*), the lowering pass (`__inline_<slug>` hoist, auto `$defs`/`$ref`, wire-name and named-enum-position sidecars, per-query `$defs` pruning), and the canonical-hash → 16-hex-slug recipe with the slug-collision byte-verify posture.

**Tests.**
- The reject gate fires the subset-violation codes for each rejected keyword and accepts the permitted subset.
- `loom/load/schema-slug-collision`: two non-byte-identical inline schemas hashing to the same slug fire; byte-identical ones dedup silently.
- The canonical hash is SHA-256 over the keys-sorted, whitespace-free, binder-number-rendered canonical form; the slug is its first 16 hex.
- `Result` in schema position is rejected; array element order is preserved.

**Deps.** `V5d-T`, `V5a`, `V5b`, `V2d`

**Ships when.** `npm test` asserts the reject gate, the canonical-hash recipe, and slug-collision detection.
