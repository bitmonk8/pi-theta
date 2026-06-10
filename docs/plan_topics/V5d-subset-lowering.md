# `V5d` — Schema-subset gate, lowering, and canonical hash

**Spec.** [`../spec_topics/schema-subset.md`](../spec_topics/schema-subset.md), [`../spec_topics/schemas.md`](../spec_topics/schemas.md).

**Adds.** The JSON-Schema-subset reject gate (Draft 2020-12; `anyOf` only; objects all-required + `additionalProperties:false`; single `items`; null via union; reject pattern/format/min*/max*), the lowering pass (`__inline_<slug>` hoist, auto `$defs`/`$ref`, wire-name and named-enum-position sidecars, per-query `$defs` pruning), and the canonical-hash → 16-hex-slug recipe with the slug-collision byte-verify posture.

**Tests.**
- The reject gate fires `loom/parse/unsupported-feature` for each rejected JSON-Schema keyword and `loom/parse/result-in-schema-position` for a `Result` in a schema-feeding position, and accepts the permitted subset.
- `loom/load/schema-slug-collision`: two non-byte-identical inline schemas hashing to the same slug fire; byte-identical ones dedup silently.
- The canonical hash is SHA-256 over the keys-sorted, whitespace-free, binder-number-rendered canonical form; the slug is its first 16 hex.
- `Result` in schema position is rejected; array element order is preserved.
- [schema-subset.md — Lowering Algorithm step 5 (per-schema sidecar)](../spec_topics/schema-subset.md#lowering-algorithm) (SUBS code-keyed area): the lowering pass captures, per `$defs` entry, a two-map sidecar — a wire-name translation map and a named-enum-position map keyed by JSON Pointer into the lowered fragment; a named-enum position is present iff its source type was a named `enum` declaration, and anonymous string-literal-union positions are absent.

**Deps.** `V5d-T`, `V5a`, `V5b`, `V2d`

**Ships when.** `npm test` asserts the reject gate, the canonical-hash recipe, slug-collision detection, and the per-schema sidecar two-map shape.
