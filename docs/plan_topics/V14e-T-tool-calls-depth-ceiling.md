# `V14e-T` — Ceiling-#4 depth-6 code-driven-tool-args routing (live carrier) (tests)

**Spec.** [`../spec_topics/hard-ceilings/ceilings-3-and-4.md`](../spec_topics/hard-ceilings/ceilings-3-and-4.md) (the code-driven-tool-args row of the ceiling-#4 per-boundary table), [`../spec_topics/tool-calls.md`](../spec_topics/tool-calls.md).

**Adds.** Failing tests for the paired `V14e` implementation leaf.

**Tests.**
- [ceilings-3-and-4.md — Per-boundary destination/surface table (ceiling #4)](../spec_topics/hard-ceilings/ceilings-3-and-4.md#ceiling-4-table) (delegated live-carrier witness for `V5e`'s code-driven-tool-args routing row): a depth-6 code-driven `<name>(args)` tool-call argument trips the loom-owned depth walk (`V5e`) before AJV and surfaces wrapped as `Err(CodeToolError { cause: "validation" })` carrying `schema_keyword: "maxDepth"` (message `"JSON document depth exceeds 5"`).

**Deps.** `V14a`, `V5e`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
