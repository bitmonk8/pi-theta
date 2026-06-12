# `V5d` — Schema-subset reject gate

**Spec.** [`../spec_topics/schema-subset.md`](../spec_topics/schema-subset.md), [`../spec_topics/schemas.md`](../spec_topics/schemas.md).

**Adds.** The JSON-Schema-subset reject gate (Draft 2020-12; `anyOf` only; objects all-required + `additionalProperties:false`; single `items`; null via union; reject pattern/format/min*/max*) that accepts the permitted subset and rejects everything else. The lowering pass and the canonical-hash recipe that operate on the accepted subset are owned by [`V5f`](./V5f-subset-lowering-hash.md).

**Tests.**
- The reject gate fires `loom/parse/unsupported-feature` for each rejected JSON-Schema keyword and `loom/parse/result-in-schema-position` for a `Result` in a schema-feeding position, and accepts the permitted subset.
- `Result` in schema position is rejected; array element order is preserved.

**Deps.** `V5d-T`, `V5a`, `V5b`, `V2d`

**Ships when.** `npm test` asserts the reject gate fires `loom/parse/unsupported-feature` / `loom/parse/result-in-schema-position` for each rejected keyword and `Result`-in-schema-position, and accepts the permitted subset.
