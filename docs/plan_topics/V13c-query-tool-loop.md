# `V13c` — Query tool loop and typed two-phase

**Spec.** [`../spec_topics/query/query-tool-loop.md`](../spec_topics/query/query-tool-loop.md), [`../spec_topics/hard-ceilings/ceilings-3-and-4.md`](../spec_topics/hard-ceilings/ceilings-3-and-4.md).

**Adds.** The model tool-call loop (free phase), the typed two-phase `complete()` with the `__loom_respond_<slug>` forced-respond turn (verbatim templates), the `max_rounds:0` boundary, and the ceiling-#2 evaluation at the round boundary.

**Tests.**
- `CIO-4` (query-tool-loop.md — free phase): the free phase advances rounds; a parallel batch counts as one slot; the forced-respond turn is exempt from the round count (CIO-4 final branch).
- [query-tool-loop.md — `max_rounds:0` boundary](../spec_topics/query/query-tool-loop.md) (QRY code-keyed area): `max_rounds:0` (typed) takes the forced-respond branch at the start.
- [query-tool-loop.md — exhaustion](../spec_topics/query/query-tool-loop.md) (QRY code-keyed area): an untyped exhaustion produces `ToolLoopExhaustedError`; the depth-6 co-fire vector sets `masked:["ceiling#2"]` (ceiling #2, `CIO-4`) on the typed-query response.

**Deps.** `V13c-T`, `V13b`, `V9c`, `V16a`, `V5e`

**Ships when.** `npm test` advances the tool loop, runs the forced-respond branch, and asserts the `max_rounds:0` and exhaustion paths.
