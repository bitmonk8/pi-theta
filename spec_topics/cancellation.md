# Cancellation

Every loom invocation runs under an `AbortSignal` provided by Pi. V1 cancellation rules:

**Signal sources:**

- Slash-command invocation: the loom receives `ctx.signal` from the Pi command handler. In interactive mode this signal aborts when the user presses Esc or Ctrl-C.
- Tool-driven (a loom registered into another loom's `tools:`): the signal is the `signal` argument passed to the tool's `execute(toolCallId, params, signal, ...)`.
- `invoke(...)` call: the child loom inherits a derived signal from its caller — the child aborts whenever the caller does.

**Propagation.** Cancellation propagates *down* (parent → child invokes, parent → in-flight queries, parent → in-flight tool calls). It does *not* propagate *up*: a child loom cancelling internally surfaces as `Err(QueryError { kind: "cancelled" })` (or the appropriate sub-variant) to the parent, which may handle it (`match`) or propagate it (`?`).

**Granularity.** The interpreter checks the signal at every loop iteration boundary, before every `@`...`` query, and before every tool / `invoke` call. There is no mid-expression cancellation — the smallest cancellation unit is one statement or one query.

**Surfacing.**

- An in-flight query whose signal aborts returns `Err(QueryError { kind: "cancelled", message: "..." })`.
- A tool call whose signal aborts returns `Err(QueryError { kind: "tool_call_error", cause: "cancelled", ... })`.
- A child invoke whose signal aborts surfaces to the parent as `Err(QueryError { kind: "invoke_callee_error", inner: { kind: "cancelled", ... } })` when the abort originated inside the child, or directly as `kind: "cancelled"` when the parent's own signal fired first.
- The loom's *top-level* cancellation surfaces to Pi as the `cancelled` row in the per-`kind` system-note table in [Invocation from Pi](./slash-invocation.md).

Per-call timeouts (a separate cancellation source independent of the user) are deferred to a later release; declaring a `timeout:` field on a query, tool call, or invoke is `loom/parse/timeout-field-rejected`. See [Future Considerations](./future-considerations.md) and [Diagnostics](./diagnostics.md).
