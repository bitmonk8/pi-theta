# `V13a` — Query render and escapes

**Spec.** [`../spec_topics/query.md`](../spec_topics/query.md), [`../spec_topics/query/query-forms.md`](../spec_topics/query/query-forms.md), [`../spec_topics/query/query-escapes-stringification.md`](../spec_topics/query/query-escapes-stringification.md).

**Adds.** The `@`-template query construct (code → model, returning `Result`; untyped → `Result<string>`), the trim → dedent rendering (the eight ordered vectors), the escape handling, and the stringify-by-loom-type table with the degenerate-template short-circuit.

**Tests.**
- The trim → dedent order reproduces the eight normative vectors; `loom/parse/illegal-template-escape` and `loom/parse/unterminated-template` diagnostics fire.
- Each loom type stringifies per the table; `loom/parse/interpolated-result` fires on a `Result`-valued `${...}` interpolation.
- A degenerate (empty) template emits the `empty-template` warning and short-circuits to `ValidationError{empty_template, attempts:0}` — not respond-repair.

**Deps.** `V13a-T`, `V11d`, `V2c`, `V2e`, `V4d`

**Ships when.** `npm test` renders the eight dedent vectors and short-circuits the empty template.
