# `V6e-T` — `respond_repair` and `tool_loop` (tests)

**Spec.** [`../spec_topics/frontmatter/frontmatter-fields-b-and-templates.md`](../spec_topics/frontmatter/frontmatter-fields-b-and-templates.md).

**Adds.** Failing tests for the paired `V6e` implementation leaf.

**Tests.**
- `FRNT-1`: `tool_loop.max_rounds` is a non-negative integer bounding free-phase rounds only (forced respond exempt), per-query and per-callee; `0` disables model tool calls; exhaustion produces `QueryError{tool_loop_exhausted}`.
- `loom/parse/frontmatter-value-out-of-range`: out-of-range `max_rounds` or `respond_repair.attempts` fires.

**Deps.** `V6a`, `V13c`, `V13d`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
