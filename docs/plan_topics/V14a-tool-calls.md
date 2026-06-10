# `V14a` — Tool calls (code-side) and `CodeToolError`

**Spec.** [`../spec_topics/tool-calls.md`](../spec_topics/tool-calls.md), [`../spec_topics/pi-integration-contract/conversation-drive.md`](../spec_topics/pi-integration-contract/conversation-drive.md) (the denial-surface MUST under *No additional access channels*).

**Adds.** The code-side `<name>(args)` tool call over the callable set (single bare-object arg, no conversation turn), the parse-time argument checks, the return-type table, the closed `CodeToolError` enum, and the three off-surface outcome handlings.

**Tests.**
- `loom/parse/tool-arg-not-literal`, `tool-arg-arity`, `tool-arg-type-mismatch`: argument violations fire (arity before type).
- [tool-calls.md — `CodeToolError`](../spec_topics/tool-calls.md) (TOOL code-keyed area): the `CodeToolError` enum is closed (`validation` / `execution` / `cancelled` / `unknown_tool`) and is distinct from `ModelToolError`.
- `loom/runtime/internal-error`: the three off-surface outcomes route correctly: a non-settling promise; a pre-eval setup throw → `{isError:true}` + `internal-error`; a non-conforming return → `internal-error{tool-return-shape}`; a post-cancel result is discarded.
- [tool-calls.md — `.loom`-callable failure](../spec_topics/tool-calls.md) (TOOL code-keyed area): a `.loom`-callable failure surfaces via `Invoke*Error` (input-validation = `InvokeInfraError{validation}`).
- [conversation-drive.md — No additional access channels](../spec_topics/pi-integration-contract/conversation-drive.md#no-extra-mediation): a host-side denial (thrown or `isError: true` tool return) reaches loom code as `Err(QueryError{kind:"code_tool", cause:"execution"})` and never resolves as a silent `Ok` (silent success on denial is forbidden).

**Deps.** `V14a-T`, `V15a`, `V9f`

**Ships when.** `npm test` fires the argument codes, asserts the closed `CodeToolError` enum and off-surface outcomes, and asserts the host-denial → `Err{code_tool,execution}` mapping (never silent `Ok`).
