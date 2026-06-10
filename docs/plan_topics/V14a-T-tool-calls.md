# `V14a-T` — Tool calls (code-side) and `CodeToolError` (tests)

**Spec.** [`../spec_topics/tool-calls.md`](../spec_topics/tool-calls.md), [`../spec_topics/pi-integration-contract/conversation-drive.md`](../spec_topics/pi-integration-contract/conversation-drive.md) (the denial-surface MUST under *No additional access channels*).

**Adds.** Failing tests for the paired `V14a` implementation leaf.

**Tests.**
- `loom/parse/tool-arg-not-literal`, `tool-arg-arity`, `tool-arg-type-mismatch`: argument violations fire (arity before type).
- [tool-calls.md — `CodeToolError`](../spec_topics/tool-calls.md) (TOOL code-keyed area): the `CodeToolError` enum is closed (`validation` / `execution` / `cancelled` / `unknown_tool`) and is distinct from `ModelToolError`.
- `loom/runtime/internal-error`: the three off-surface outcomes route correctly: a non-settling promise; a pre-eval setup throw → `{isError:true}` + `internal-error`; a non-conforming return → `internal-error{tool-return-shape}`; a post-cancel result is discarded.
- [tool-calls.md — `.loom`-callable failure](../spec_topics/tool-calls.md) (TOOL code-keyed area): a `.loom`-callable failure surfaces via `Invoke*Error` (input-validation = `InvokeInfraError{validation}`).
- [conversation-drive.md — No additional access channels](../spec_topics/pi-integration-contract/conversation-drive.md#no-extra-mediation): a host-side denial (thrown or `isError: true` tool return) reaches loom code as `Err(QueryError{kind:"code_tool", cause:"execution"})` and never resolves as a silent `Ok` (silent success on denial is forbidden).

**Deps.** `V15a`, `V9f`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
