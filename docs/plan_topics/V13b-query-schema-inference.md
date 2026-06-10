# `V13b` — Query schema inference

**Spec.** [`../spec_topics/query.md`](../spec_topics/query.md), [`../spec_topics/query/query-forms.md`](../spec_topics/query/query-forms.md).

**Adds.** Typed-query schema inference from the nearest (innermost) sink, the shallow-walk crossed/stopped rules, and the `@<Schema>` explicit override.

**Tests.**
- The innermost sink wins; the shallow walk's crossed/stopped behaviour matches the normative rules.
- `loom/parse/explicit-schema-mismatch`: a `@<Schema>` override whose ascription is not `⊑` the annotation fires (one-directional; skipped when unresolvable) — the four vectors.

**Deps.** `V13b-T`, `V13a`, `V2b`

**Ships when.** `npm test` infers the nearest-sink schema and fires `explicit-schema-mismatch` on the four vectors.
