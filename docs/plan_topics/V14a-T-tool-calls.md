# `V14a-T` — Tool calls (code-side) and `CodeToolError` (tests)

**Spec.** [`../spec_topics/tool-calls.md`](../spec_topics/tool-calls.md).

**Adds.** Failing tests for the paired `V14a` implementation leaf.

**Tests.**
- `loom/parse/tool-arg-not-literal`, `tool-arg-arity`, `tool-arg-type-mismatch`: argument violations fire (arity before type).
- [tool-calls.md — `CodeToolError`](../spec_topics/tool-calls.md) (TOOL code-keyed area): the `CodeToolError` enum is closed (`validation` / `execution` / `cancelled` / `unknown_tool`) and is distinct from `ModelToolError`.
- [tool-calls.md — *Return type*](../spec_topics/tool-calls.md) (TOOL code-keyed area): both return-type rows lower on the *accepted* path — a conforming **Pi tool** return lowers to a `Result<string, QueryError>` `Ok` carrying the tool's final output as a single `string`; a conforming **registered subagent-mode `.loom` callable** return lowers to a `Result<T, QueryError>` `Ok` whose payload is the callee's inferred return type `T` (statically resolved per `invoke<T>(...)`, runtime AJV-enforced when not statically resolvable).
- [tool-calls.md — `.loom`-callable failure](../spec_topics/tool-calls.md) (TOOL code-keyed area): a `.loom`-callable failure surfaces via `Invoke*Error` (input-validation = `InvokeInfraError{validation}`).

**Deps.** `V15a`, `V9f`, `V8a`, `V5e`, `V4d`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
