# `V14b` — Model-driven parallel tool-call batch (settle-all and independent lowering)

**Spec.** [`../spec_topics/tool-calls.md`](../spec_topics/tool-calls.md).

**Adds.** The model-driven parallel tool-call batch handling — the loom runtime awaits every sibling call in a model-issued batch to settle via `Promise.allSettled` ([tool-calls.md — Concurrency](../spec_topics/tool-calls.md#concurrency); [`coverage-matrix.md`](./coverage-matrix.md) code-keyed-area token `cka-13`, which the site's `// allow: cka-13 — tool-calls.md` exemption comment cites) before it constructs the next user turn, and lowers each sibling's outcome independently into its own `tool_use` result block.

**Tests.**
- [tool-calls.md — Concurrency](../spec_topics/tool-calls.md#concurrency) (code-keyed-area token `cka-13`): a model-driven parallel tool-call batch mixing one succeeding and one failing sibling awaits every call in the batch to settle before the runtime constructs the next user turn, and each sibling's outcome is lowered independently — the failing sibling becomes that `tool_use` block's `isError: true` tool-result fed back alongside the successful siblings' results.

**Deps.** `V14b-T`, `V14a`, `V9c`, `H4b`

**Ships when.** `npm test` drives a model-issued parallel tool-call batch mixing a succeeding and a failing sibling through the in-process session double, and asserts the runtime waits for every sibling to settle before constructing the next user turn and lowers each sibling independently (the failing sibling fed back as an `isError: true` tool-result alongside the successful siblings' results).
