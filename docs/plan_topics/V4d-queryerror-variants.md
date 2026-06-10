# `V4d` — `QueryError` variant schema

**Spec.** [`../spec_topics/errors-and-results/queryerror-variants.md`](../spec_topics/errors-and-results/queryerror-variants.md), [`../spec_topics/errors-and-results/error-model.md`](../spec_topics/errors-and-results/error-model.md).

**Adds.** The nine-variant `QueryError` union (its `kind`/`cause` wire forms), the `ValidationIssue` canonical ordering, the forced-respond non-compliance synthesised issue, and the `ToolLoopExhaustedError` shape.

**Tests.**
- `ERR-14`: `validation_errors` are emitted in stable ascending order on (path, schema_keyword, message) by code point.
- `ERR-15`: `QueryError.kind` is typed `string` (open seam), not a closed enum.
- `ERR-17`: forced-respond non-compliance produces one synthesised `ValidationIssue` (path `""`, keyword `"required"`, branch-specific two-arm message).
- `ERR-19`: `ToolLoopExhaustedError` fires when the per-query tool-call round cap is reached with no terminating turn.

**Deps.** `V4d-T`, `V5d`

**Ships when.** `npm test` asserts the nine-variant shape, `kind: string`, the `ValidationIssue` ordering, and `ERR-19` at the cap.
