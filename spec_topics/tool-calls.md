# Tool Calls

Loom code calls a Pi tool or a registered subagent loom directly via the bare-identifier form `<name>(args)`, where `<name>` is an entry in the loom's frontmatter `tools:` set (after any `as` rename and the default hyphen→underscore loom-basename rewrite; see [Parameters and Frontmatter](./frontmatter.md)). The same set is what the model sees as available tools during a `@`...`` query — the declaration is shared between the model-driven and code-driven call paths.

```loom
let contents = read({ path: "src/main.ts" })?
let matches  = grep({ pattern: "TODO", path: "src" })?
let summary  = summarise(contents)?
let label    = triage(summary)?
```

**No conversation turn.** A tool call is a direct call against Pi's tool runtime (or, for a registered loom, a fresh subagent invocation; see below). It does **not** add a turn to the loom's conversation, does **not** consume model tokens, and does **not** appear in the conversation transcript. This is the deliberate distinction from `@`...`` queries: queries cross code → model in the current conversation; tool calls cross code → side-effect (or code → child conversation, for a registered loom) without disturbing the current one.

**Argument shape.** Pi tools take a single object argument matching the tool's input schema (TypeBox / JSON Schema, exposed by Pi at registration). Registered loom callees take their callee `params:` as already-typed values, positionally in declaration order — the same argument-binding rules `invoke(...)` uses. Type mismatches surface as `loom/parse/tool-arg-type-mismatch` when the callee's schema is statically resolvable; otherwise the runtime AJV check is the safety net. Slash-command argument binding (LLM-driven; see [Slash-Command Argument Binding](./binder.md)) does not apply here — code-side callers pass typed values directly.

**Return type.** The result type depends on the callee kind:

| Callee kind | Return type | Notes |
|---|---|---|
| Pi tool | `Result<string, QueryError>` | V1 returns the tool's final output as a single `string` (mirroring untyped queries). Pi tool definitions ship an input schema but no output schema; provider tool-use conventions treat outputs as freeform text the model interprets. |
| Registered loom (subagent-mode) | `Result<T, QueryError>` where `T` is the callee's inferred return type | Same inference rule as `invoke<T>(...)`: when the callee `.loom` is statically resolvable, its tail-expression type flows into the call site. Otherwise the runtime AJV check enforces it. |

As with queries and `invoke`, the call returns a `Result`; use `?` to propagate failure or `match` to handle.

**Failures.** Tool-call failures surface as a new `QueryError` variant:

```loom
schema ToolCallError {
  kind: "tool_call_error",
  message: string,
  tool_name: string,                  // post-rename name as seen in `tools:`
  cause: "validation"                 // arguments failed input-schema validation
       | "execution"                  // tool's `execute()` threw or returned `isError: true`
       | "cancelled"                  // AbortSignal fired (e.g., user cancelled the loom)
       | "unknown_tool"               // callable was unregistered between parse and runtime; should not occur after a clean parse
}
```

`ToolCallError` is distinct from `ToolFailureError` (which covers tool failures *inside* the model's tool-call loop during a `@`...`` query). The variants carry different fields because the contexts differ — a code-side tool call has no `tool_call_id` issued by Pi's tool-loop machinery and no `raw_response` from the model; a model-loop failure has both. Authors who want to handle every tool failure uniformly write two `match` arms or a final `_ => ...` catch-all.

For a registered loom callee, failures the callee returned cascade through the standard `InvokeCalleeError` variant (the call is, semantically, an `invoke`); failures from the loom infrastructure itself (callee unloadable, validation mismatch on the return value) cascade through `InvokeFailure`. The only situation where `ToolCallError` arises for a loom callee is V1's `"unknown_tool"` safety net.

**Concurrency.** V1 tool calls are sequential and synchronous-looking from loom code: the runtime awaits each call's underlying Promise before evaluating the next expression, so the loom interpreter yields to Pi's event loop during the wait (the TUI render loop, keypress handlers, signals, and other Pi machinery continue to run — the call is non-blocking at the runtime level even though it appears synchronous to the author). Streaming partial results (Pi's `onUpdate` callback) are not surfaced to loom code. Concurrent tool execution exists in Pi's model-driven "parallel tool mode" inside `@`...`` queries — when the model issues multiple tool calls in one assistant message, Pi runs them concurrently — but no loom-level concurrency primitive (e.g. a `parallel { ... }` block) is exposed in V1; see [Future Considerations](./future-considerations.md).

**Relationship with `invoke`.** `invoke("./path.loom", ...)` and a registered-loom call (`my_summariser(...)` after listing `./summariser.loom` in `tools:`) are operationally equivalent for subagent-mode callees — both spawn a fresh isolated conversation, both validate the return value against the callee's inferred or annotated schema, both surface failures through the same `QueryError` variants. The recommendation is:

- **Register in `tools:`** when the callee is referenced repeatedly, when the model should also be able to call it, or when a stable name in code is preferred over a path literal.
- **Use `invoke(...)`** for ad-hoc, one-off calls and for callees whose path is computed from configuration that the author wants to keep out of frontmatter. `invoke(...)` is also the only way to call a **prompt-mode** loom from loom code, since prompt-mode callees cannot appear in `tools:`.

The two surfaces share a single error model and a single schema-lowering pipeline; the choice is purely about declaration site.
