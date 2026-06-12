# `V5f-T` — Schema lowering and canonical hash (tests)

**Spec.** [`../spec_topics/schema-subset.md`](../spec_topics/schema-subset.md), [`../spec_topics/schemas.md`](../spec_topics/schemas.md).

**Adds.** Failing tests for the paired `V5f` implementation leaf.

**Tests.**
- `loom/load/schema-slug-collision`: two non-byte-identical inline schemas hashing to the same slug fire; byte-identical ones dedup silently.
- The canonical hash is SHA-256 over the keys-sorted, whitespace-free, binder-number-rendered canonical form; the slug is its first 16 hex.
- [schema-subset.md — Lowering Algorithm step 5 (per-schema sidecar)](../spec_topics/schema-subset.md#lowering-algorithm) (SUBS code-keyed area): the lowering pass captures, per `$defs` entry, a two-map sidecar — a wire-name translation map and a named-enum-position map keyed by JSON Pointer into the lowered fragment; a named-enum position is present iff its source type was a named `enum` declaration, and anonymous string-literal-union positions are absent.

**Deps.** `V5d`, `V5a`, `V5b`, `V2d`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
