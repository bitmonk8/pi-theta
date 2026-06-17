# `V14a` — Tool calls (code-side) and `CodeToolError`

**Spec.** [`../spec_topics/tool-calls.md`](../spec_topics/tool-calls.md).

**Adds.** The code-side `<name>(args)` tool call over the callable set (single bare-object arg, no conversation turn), the parse-time argument checks, the return-type table, the closed `CodeToolError` enum, and the `.loom`-callable failure surface.

**Tests.**
- `loom/parse/tool-arg-not-literal`, `tool-arg-arity`, `tool-arg-type-mismatch`: argument violations fire (arity before type).
- [tool-calls.md — `CodeToolError`](../spec_topics/tool-calls.md) (TOOL code-keyed area): the `CodeToolError` enum is closed (`validation` / `execution` / `cancelled` / `unknown_tool`) and is distinct from `ModelToolError`.
- [tool-calls.md — *Return type*](../spec_topics/tool-calls.md) (TOOL code-keyed area): both return-type rows lower on the *accepted* path — a conforming **Pi tool** return lowers to a `Result<string, QueryError>` `Ok` carrying the tool's final output as a single `string`; a conforming **registered subagent-mode `.loom` callable** return lowers to a `Result<T, QueryError>` `Ok` whose payload is the callee's inferred return type `T` (statically resolved per `invoke<T>(...)`, runtime AJV-enforced when not statically resolvable).
- [tool-calls.md — `.loom`-callable failure](../spec_topics/tool-calls.md) (TOOL code-keyed area): a `.loom`-callable failure surfaces via `Invoke*Error` (input-validation = `InvokeInfraError{validation}`).

The code-tool off-surface outcome routing is owned by [`V14c`](./V14c-tool-calls-off-surface-routing.md); the host-denial surface by [`V14d`](./V14d-tool-calls-host-denial.md); the ceiling-#4 depth-6 code-driven-tool-args live-carrier routing by [`V14e`](./V14e-tool-calls-depth-ceiling.md); and the code-side `execute()` swallowing-handler per-site routing by [`V14f`](./V14f-tool-calls-swallowing-handler.md).

**Deps.** `V14a-T`, `V15a`, `V9f`, `V8a`, `V5e`, `V4d`

**Ships when.** `npm test` fires the argument codes, asserts the closed `CodeToolError` enum is distinct from `ModelToolError`, asserts both return-type rows lower on the accepted path (Pi tool → `Ok(string)`, subagent-mode `.loom` → `Ok(T)`), and asserts the `.loom`-callable failure surfaces via `Invoke*Error` (input-validation = `InvokeInfraError{validation}`).
