# `V5d-T` — Schema-subset gate, lowering, and canonical hash (tests)

**Spec.** [`../spec_topics/schema-subset.md`](../spec_topics/schema-subset.md), [`../spec_topics/schemas.md`](../spec_topics/schemas.md).

**Adds.** Failing tests for the paired `V5d` implementation leaf.

**Tests.**
- The reject gate fires `loom/parse/unsupported-feature` for each rejected JSON-Schema keyword and `loom/parse/result-in-schema-position` for a `Result` in a schema-feeding position, and accepts the permitted subset.
- `loom/load/schema-slug-collision`: two non-byte-identical inline schemas hashing to the same slug fire; byte-identical ones dedup silently.
- The canonical hash is SHA-256 over the keys-sorted, whitespace-free, binder-number-rendered canonical form; the slug is its first 16 hex.
- `Result` in schema position is rejected; array element order is preserved.
- [schema-subset.md — Lowering Algorithm step 5 (per-schema sidecar)](../spec_topics/schema-subset.md#lowering-algorithm) (SUBS code-keyed area): the lowering pass captures, per `$defs` entry, a two-map sidecar — a wire-name translation map and a named-enum-position map keyed by JSON Pointer into the lowered fragment; a named-enum position is present iff its source type was a named `enum` declaration, and anonymous string-literal-union positions are absent.

**Deps.** `V5a`, `V5b`, `V2d`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
