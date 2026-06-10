# `V4d-T` — `QueryError` variant schema (tests)

**Spec.** [`../spec_topics/errors-and-results/queryerror-variants.md`](../spec_topics/errors-and-results/queryerror-variants.md), [`../spec_topics/errors-and-results/error-model.md`](../spec_topics/errors-and-results/error-model.md).

**Adds.** Failing tests for the paired `V4d` implementation leaf.

**Tests.**
- `ERR-14`: `validation_errors` are emitted in stable ascending order on (path, schema_keyword, message) by code point.
- `ERR-15`: `QueryError.kind` is typed `string` (open seam), not a closed enum.
- `ERR-17`: forced-respond non-compliance injects one synthesised `ValidationIssue` (path `""`, keyword `"required"`, branch-specific message) into respond-repair.
- `ERR-19`: `ToolLoopExhaustedError` fires when the per-query tool-call round cap is reached with no terminating turn.

**Deps.** `V5d`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
