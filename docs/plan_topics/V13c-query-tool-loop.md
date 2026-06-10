# `V13c` — Query tool loop and typed two-phase

**Spec.** [`../spec_topics/query/query-tool-loop.md`](../spec_topics/query/query-tool-loop.md), [`../spec_topics/hard-ceilings/ceilings-3-and-4.md`](../spec_topics/hard-ceilings/ceilings-3-and-4.md).

**Adds.** The model tool-call loop (free phase), the typed two-phase `complete()` with the `__loom_respond_<slug>` forced-respond turn (verbatim templates), the `max_rounds:0` boundary, and the ceiling-#2 evaluation at the round boundary. At its ceiling-#2 first-enforcement point (the round boundary) this leaf **consults** `V16a`'s cross-ceiling arbitration seam for the cross-ceiling surfacing precedence and `masked` enumeration — the seam it binds via its `Deps` on `V16a`.

**Tests.**
- `CIO-4` (query-tool-loop.md — free phase): the free phase advances rounds; a parallel batch counts as one slot; the forced-respond turn is exempt from the round count (CIO-4 final branch).
- [query-tool-loop.md — `max_rounds:0` boundary](../spec_topics/query/query-tool-loop.md) (QRY code-keyed area): `max_rounds:0` (typed) takes the forced-respond branch at the start.
- [query-tool-loop.md — exhaustion](../spec_topics/query/query-tool-loop.md) (QRY code-keyed area): an untyped exhaustion produces `ToolLoopExhaustedError`; the depth-6 co-fire vector sets `masked:["ceiling#2"]` (ceiling #2, `CIO-4`) on the typed-query response.
- [tool-calls.md — Concurrency](../spec_topics/tool-calls.md#concurrency) (TOOL code-keyed area): a model-driven parallel tool-call batch mixing one succeeding and one failing sibling awaits every call in the batch to settle before the runtime constructs the next user turn, and each sibling's outcome is lowered independently — the failing sibling becomes that `tool_use` block's `isError: true` tool-result fed back alongside the successful siblings' results.

**Deps.** `V13c-T`, `V13b`, `V9c`, `V16a`, `V5e`

**Ships when.** `npm test` advances the tool loop, runs the forced-respond branch, and asserts the `max_rounds:0` and exhaustion paths.
