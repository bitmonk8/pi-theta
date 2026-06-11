# `V13d` — Query failure and respond-repair

**Spec.** [`../spec_topics/query/query-failure-and-repair.md`](../spec_topics/query/query-failure-and-repair.md), [`../spec_topics/errors-and-results/queryerror-variants.md`](../spec_topics/errors-and-results/queryerror-variants.md).

**Adds.** The respond-repair loop: a new user turn appended per attempt (never re-issued), bounded by `respond_repair.attempts`, with the `validator_error`/`schema_repeat` templates, non-validation-failure proximate propagation (no attempt consumed), the context-overflow permanent short-circuit, and the forced-respond non-compliance handling.

**Tests.**
- [query-failure-and-repair.md — respond-repair loop](../spec_topics/query/query-failure-and-repair.md) (QRY code-keyed area): a schema-validation failure appends a new user turn per attempt and terminates as `ValidationError{schema_validation}` at the bound; `none`/`0` means no follow-up.
- [query-failure-and-repair.md — proximate propagation](../spec_topics/query/query-failure-and-repair.md) (QRY code-keyed area): a non-validation failure propagates the proximate variant and consumes no attempt; `ContextOverflowError` permanently short-circuits.
- [query-failure-and-repair.md — per-attempt budget](../spec_topics/query/query-failure-and-repair.md) (QRY code-keyed area): each repair turn gets a fresh `tool_loop` budget.
- [query-failure-and-repair.md — follow-up turn templates (normative)](../spec_topics/query/query-failure-and-repair.md) (QRY code-keyed area): each non-`none` methodology — `validator_error` and `schema_repeat` — renders its follow-up user turn byte-for-byte for a known input, with only the `<…>` placeholders interpolated and every other character fixed, including the literal U+0060 backticks around `` `__loom_respond_<slug>` `` and the trailing U+000A after the `<schema-json>` interpolation.
- [query-failure-and-repair.md — follow-up turn templates (normative)](../spec_topics/query/query-failure-and-repair.md) (QRY code-keyed area): `<schema-json>` is `JSON.stringify(schema, null, 2)` over the **lowered** response schema (the JSON Schema handed to AJV), not the source-Loom-type form, and `<slug>` equals the slug of that lowered schema.
- [query-failure-and-repair.md — follow-up turn templates (normative)](../spec_topics/query/query-failure-and-repair.md) (QRY code-keyed area): on a 2-attempt sequence the second follow-up's `<ajv-summary>` reflects only the most-recent failed attempt's `ValidationIssue` entries, in the canonical `validation_errors` order (`ERR-14`), never a cumulative concatenation across attempts.
- `ERR-17`: forced-respond non-compliance injects the synthesised `ValidationIssue` (path `""`, keyword `"required"`, branch-specific message) into the respond-repair loop.

**Deps.** `V13d-T`, `V13c`, `V4d`, `V9j`

**Ships when.** `npm test` asserts attempt accounting, the context-overflow short-circuit, the proximate-variant propagation, and the verbatim follow-up turn templates (both methodologies' rendered bytes, the lowered-schema `<schema-json>`/`<slug>` substitution, and the most-recent-attempt-only `<ajv-summary>`).
