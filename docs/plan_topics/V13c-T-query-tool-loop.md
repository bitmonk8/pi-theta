# `V13c-T` — Query tool loop and typed two-phase (tests)

**Spec.** [`../spec_topics/query/query-tool-loop.md`](../spec_topics/query/query-tool-loop.md), [`../spec_topics/hard-ceilings/ceilings-3-and-4.md`](../spec_topics/hard-ceilings/ceilings-3-and-4.md), [`../spec_topics/cancellation.md`](../spec_topics/cancellation.md).

**Adds.** Failing tests for the paired `V13c` implementation leaf.

**Tests.**
- `CIO-4` (query-tool-loop.md — free phase): the free phase advances rounds; a parallel batch counts as one slot; the forced-respond turn is exempt from the round count (CIO-4 final branch).
- [query-tool-loop.md — `max_rounds:0` boundary](../spec_topics/query/query-tool-loop.md) (QRY code-keyed area): `max_rounds:0` (typed) takes the forced-respond branch at the start.
- [query-tool-loop.md — exhaustion](../spec_topics/query/query-tool-loop.md) (QRY code-keyed area): an untyped exhaustion produces `ToolLoopExhaustedError`; the depth-6 co-fire vector sets `masked:["ceiling#2"]` (ceiling #2, `CIO-4`) on the typed-query response.
- [tool-calls.md — Concurrency](../spec_topics/tool-calls.md#concurrency) (TOOL code-keyed area): a model-driven parallel tool-call batch mixing one succeeding and one failing sibling awaits every call in the batch to settle before the runtime constructs the next user turn, and each sibling's outcome is lowered independently — the failing sibling becomes that `tool_use` block's `isError: true` tool-result fed back alongside the successful siblings' results.
- Swallowing-handler attachment at this site ([cancellation.md — *Race semantics — swallowing-handler attachment on every abandonable Promise*](../spec_topics/cancellation.md)): assert the underlying `@`-query provider Promise attaches its swallowing handler at the Promise-construction site (before the first microtask boundary), and that a late settlement landed via the `Checkpoint` seam (`V8a`) after the checkpoint has surfaced `cause: "cancelled"` is suppressed along all three side channels — no Node `unhandledRejection`, no second `RuntimeEvent`, and no diagnostic of any severity — so a build that bypasses the substrate reddens this leaf's tests.

**Deps.** `V13b`, `V9c`, `V16a`, `V5e`, `V8a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
