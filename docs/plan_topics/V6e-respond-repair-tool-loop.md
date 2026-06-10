# `V6e` — `respond_repair` and `tool_loop`

**Spec.** [`../spec_topics/frontmatter/frontmatter-fields-b-and-templates.md`](../spec_topics/frontmatter/frontmatter-fields-b-and-templates.md).

**Adds.** The `respond_repair` (attempts + methodology) and `tool_loop.max_rounds` frontmatter fields with range validation and defaults (`{3, validator_error}` / `{25}`).

**Tests.**
- `FRNT-1`: `tool_loop.max_rounds` is a non-negative integer bounding free-phase rounds only (forced respond exempt), per-query and per-callee; `0` disables model tool calls; exhaustion produces `QueryError{tool_loop_exhausted}`.
- `loom/parse/frontmatter-value-out-of-range`: out-of-range `max_rounds` or `respond_repair.attempts` fires.

**Deps.** `V6e-T`, `V6a`, `V13c`, `V13d`

**Ships when.** `npm test` asserts `FRNT-1` bounds, the disable-at-`0` boundary, and the range code.
