# `V13b-T` — Query schema inference (tests)

**Spec.** [`../spec_topics/query.md`](../spec_topics/query.md), [`../spec_topics/query/query-forms.md`](../spec_topics/query/query-forms.md).

**Adds.** Failing tests for the paired `V13b` implementation leaf.

**Tests.**
- The innermost sink wins; the shallow walk's crossed/stopped behaviour matches the normative rules.
- `loom/parse/explicit-schema-mismatch`: a `@<Schema>` override whose ascription is not `⊑` the annotation fires (one-directional; skipped when unresolvable) — the four vectors.

**Deps.** `V13a`, `V2b`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
