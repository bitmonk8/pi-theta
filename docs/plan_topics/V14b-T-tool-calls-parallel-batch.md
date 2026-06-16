# `V14b-T` — Model-driven parallel tool-call batch (settle-all and independent lowering) (tests)

**Spec.** [`../spec_topics/tool-calls.md`](../spec_topics/tool-calls.md).

**Adds.** Failing tests for the paired `V14b` implementation leaf.

**Tests.**
- [tool-calls.md — Concurrency](../spec_topics/tool-calls.md#concurrency) (TOOL code-keyed area): a model-driven parallel tool-call batch mixing one succeeding and one failing sibling awaits every call in the batch to settle before the runtime constructs the next user turn, and each sibling's outcome is lowered independently — the failing sibling becomes that `tool_use` block's `isError: true` tool-result fed back alongside the successful siblings' results.

**Deps.** `V14a`, `V9c`, `H4b`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
