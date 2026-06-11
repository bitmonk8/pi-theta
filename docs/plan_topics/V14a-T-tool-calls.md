# `V14a-T` — Tool calls (code-side) and `CodeToolError` (tests)

**Spec.** [`../spec_topics/tool-calls.md`](../spec_topics/tool-calls.md), [`../spec_topics/pi-integration-contract/conversation-drive.md`](../spec_topics/pi-integration-contract/conversation-drive.md) (the denial-surface MUST under *No additional access channels*), [`../spec_topics/cancellation.md`](../spec_topics/cancellation.md).

**Adds.** Failing tests for the paired `V14a` implementation leaf.

**Tests.**
- `loom/parse/tool-arg-not-literal`, `tool-arg-arity`, `tool-arg-type-mismatch`: argument violations fire (arity before type).
- [tool-calls.md — `CodeToolError`](../spec_topics/tool-calls.md) (TOOL code-keyed area): the `CodeToolError` enum is closed (`validation` / `execution` / `cancelled` / `unknown_tool`) and is distinct from `ModelToolError`.
- `loom/runtime/internal-error`: the three off-surface outcomes route correctly: a non-settling promise; a pre-eval setup throw → `{isError:true}` + `internal-error`; a non-conforming return → `internal-error{tool-return-shape}`; a post-cancel result is discarded.
- [tool-calls.md — *Return type*](../spec_topics/tool-calls.md) (TOOL code-keyed area): both return-type rows lower on the *accepted* path — a conforming **Pi tool** return lowers to a `Result<string, QueryError>` `Ok` carrying the tool's final output as a single `string`; a conforming **registered subagent-mode `.loom` callable** return lowers to a `Result<T, QueryError>` `Ok` whose payload is the callee's inferred return type `T` (statically resolved per `invoke<T>(...)`, runtime AJV-enforced when not statically resolvable).
- [tool-calls.md — `.loom`-callable failure](../spec_topics/tool-calls.md) (TOOL code-keyed area): a `.loom`-callable failure surfaces via `Invoke*Error` (input-validation = `InvokeInfraError{validation}`).
- [conversation-drive.md — No additional access channels](../spec_topics/pi-integration-contract/conversation-drive.md#no-extra-mediation): a host-side denial (thrown or `isError: true` tool return) reaches loom code as `Err(QueryError{kind:"code_tool", cause:"execution"})` and never resolves as a silent `Ok` (silent success on denial is forbidden).
- Swallowing-handler attachment at this site ([cancellation.md — *Race semantics — swallowing-handler attachment on every abandonable Promise*](../spec_topics/cancellation.md)): assert the code-side `execute()` Promise attaches its swallowing handler at the Promise-construction site (before the first microtask boundary), and that a late settlement landed via the `Checkpoint` seam (`V8a`) after the checkpoint has surfaced `cause: "cancelled"` is suppressed along all three side channels — no Node `unhandledRejection`, no second `RuntimeEvent`, and no diagnostic of any severity — so a build that bypasses the substrate reddens this leaf's tests.

**Deps.** `V15a`, `V9f`, `V8a`, `V4d`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
