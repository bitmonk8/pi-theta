# `V13a-T` — Query render and escapes (tests)

**Spec.** [`../spec_topics/query.md`](../spec_topics/query.md), [`../spec_topics/query/query-forms.md`](../spec_topics/query/query-forms.md), [`../spec_topics/query/query-escapes-stringification.md`](../spec_topics/query/query-escapes-stringification.md).

**Adds.** Failing tests for the paired `V13a` implementation leaf.

**Tests.**
- The trim → dedent order reproduces the eight normative vectors; illegal-escape and unterminated-template diagnostics fire.
- Each loom type stringifies per the table; `interpolated-result` and `discarded-query-result` (with its runtime event) fire.
- A degenerate (empty) template emits the `empty-template` warning and short-circuits to `ValidationError{empty_template, attempts:0}` — not respond-repair.

**Deps.** `V11d`, `V2c`, `V4d`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
