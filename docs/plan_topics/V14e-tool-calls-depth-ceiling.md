# `V14e` — Ceiling-#4 depth-6 code-driven-tool-args routing (live carrier)

**Spec.** [`../spec_topics/hard-ceilings/ceilings-3-and-4.md`](../spec_topics/hard-ceilings/ceilings-3-and-4.md) (the code-driven-tool-args row of the ceiling-#4 per-boundary table), [`../spec_topics/tool-calls.md`](../spec_topics/tool-calls.md).

**Adds.** The live-carrier witness for [`V5e`](./V5e-depth-enforcement.md)'s code-driven-tool-args ceiling-#4 routing row — a depth-6 code-driven `<name>(args)` argument tripping the loom-owned depth walk before AJV and surfacing wrapped as `Err(CodeToolError { cause: "validation" })`, building on the [`V14a`](./V14a-tool-calls.md) `CodeToolError` carrier.

**Tests.**
- [ceilings-3-and-4.md — Per-boundary destination/surface table (ceiling #4)](../spec_topics/hard-ceilings/ceilings-3-and-4.md#ceiling-4-table) (delegated live-carrier witness for `V5e`'s code-driven-tool-args routing row): a depth-6 code-driven `<name>(args)` tool-call argument trips the loom-owned depth walk (`V5e`) before AJV and surfaces wrapped as `Err(CodeToolError { cause: "validation" })` carrying `schema_keyword: "maxDepth"` (message `"JSON document depth exceeds 5"`).

**Deps.** `V14e-T`, `V14a`, `V5e`

**Ships when.** `npm test` asserts a depth-6 code-driven tool-call argument trips the loom-owned depth walk (`V5e`) before AJV and surfaces as `Err(CodeToolError { cause: "validation" })` carrying `schema_keyword:"maxDepth"` (message `"JSON document depth exceeds 5"`).
