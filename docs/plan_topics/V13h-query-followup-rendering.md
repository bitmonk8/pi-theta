# `V13h` — Query follow-up turn template rendering

**Spec.** [`../spec_topics/query/query-failure-and-repair.md`](../spec_topics/query/query-failure-and-repair.md), [`../spec_topics/errors-and-results/queryerror-variants.md`](../spec_topics/errors-and-results/queryerror-variants.md).

**Adds.** Byte-exact follow-up user-turn template rendering for the respond-repair loop: the `validator_error`/`schema_repeat` methodology bodies rendered verbatim, lowered-schema `<schema-json>`/`<slug>` substitution, and most-recent-attempt-only `<ajv-summary>` ordering.

**Tests.**
- [query-failure-and-repair.md — follow-up turn templates (normative)](../spec_topics/query/query-failure-and-repair.md) (QRY code-keyed area): each non-`none` methodology — `validator_error` and `schema_repeat` — renders its follow-up user turn byte-for-byte for a known input, with only the `<…>` placeholders interpolated and every other character fixed, including the literal U+0060 backticks around `` `__loom_respond_<slug>` `` and the trailing U+000A after the `<schema-json>` interpolation.
- [query-failure-and-repair.md — follow-up turn templates (normative)](../spec_topics/query/query-failure-and-repair.md) (QRY code-keyed area): `<schema-json>` is `JSON.stringify(schema, null, 2)` over the **lowered** response schema (the JSON Schema handed to AJV), not the source-Loom-type form, and `<slug>` equals the slug of that lowered schema.
- [query-failure-and-repair.md — follow-up turn templates (normative)](../spec_topics/query/query-failure-and-repair.md) (QRY code-keyed area): on a 2-attempt sequence the second follow-up's `<ajv-summary>` reflects only the most-recent failed attempt's `ValidationIssue` entries, in the canonical `validation_errors` order (`ERR-14`), never a cumulative concatenation across attempts.

**Deps.** `V13h-T`, `V13c`, `V4d`, `V9j`, `H4b`

**Ships when.** `npm test` asserts the verbatim follow-up turn templates (both methodologies' rendered bytes, the lowered-schema `<schema-json>`/`<slug>` substitution, and the most-recent-attempt-only `<ajv-summary>`).
