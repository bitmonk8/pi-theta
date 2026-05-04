# Cancellation

Every loom invocation runs under an `AbortSignal` provided by Pi. V1 cancellation rules:

**Signal sources:**

- Slash-command invocation: the loom receives `ctx.signal` from the Pi command handler. In interactive mode this signal aborts when the user presses Esc or Ctrl-C.
- Tool-driven (a loom registered into another loom's `tools:`): the signal is the `signal` argument passed to the tool's `execute(toolCallId, params, signal, ...)`.
- `invoke(...)` call: the child loom inherits a derived signal from its caller — the child aborts whenever the caller does.

**Propagation.** Cancellation propagates *down* (parent → child invokes, parent → in-flight queries, parent → in-flight tool calls). It does *not* propagate *up*: a child loom cancelling internally surfaces as `Err(QueryError { kind: "cancelled" })` (or the appropriate sub-variant) to the parent, which may handle it (`match`) or propagate it (`?`).

**Granularity.** The interpreter checks the cancellation signal at exactly these points and no others:

- immediately before each iteration of a `for` or `while` body,
- immediately before dispatching each `@`...`` query,
- immediately before each tool call,
- immediately before each `invoke` call.

No checkpoint fires inside a primitive operation (arithmetic, comparison, field/index access, AJV validation, schema lowering, binder execution). A compound expression that contains multiple checkpointed sub-expressions can therefore be cancelled between them: in `let x = f() + g()` where `f` and `g` are tool calls, an abort observed between `f()`'s return and `g()`'s pre-call checkpoint aborts the statement after `f`'s side effects have committed but before `g` is dispatched, and `x` is never bound. Partially evaluated expressions are discarded; cancellation does not unwind side effects of sub-expressions that have already completed (see [Errors and Results](./errors-and-results.md)).

**Race semantics.** Cancellation is observed only at checkpoints. An operation that has already returned `Ok(v)` retains that value even if the signal fires before the next checkpoint executes; the interpreter must not retroactively rewrite a completed `Ok` into `Err({kind:"cancelled"})`. The cancellation surfaces at the next checkpoint the interpreter reaches — typically the pre-evaluation check of the next statement's first cancellable sub-operation (loop iteration, `@`-query, tool call, or `invoke`). If no further checkpoint executes before the loom returns (the abort fired after the final cancellable operation), the loom's top-level result is the value it would otherwise have produced; the runtime does **not** synthesize a top-level `cancelled` in that case.

Symmetrically, an in-flight operation whose underlying provider observes the abort surfaces as `Err` per the **Surfacing** rules below; this is the only path by which an operation's own result becomes `cancelled`.

Edge cases:

- Statement boundaries are *not* themselves checkpoints; the next checkpoint is the next loop-iter boundary, `@`-query, tool call, or `invoke`. A straight-line statement sequence with no such operations runs to completion regardless of when the abort fired.
- For `invoke`, the child's own checkpoints honour the derived signal independently — the parent does not need to re-check between child completion and binding the child's result.
- The top-level "no further checkpoint" rule means a loom that ends in a pure-arithmetic tail can complete `Ok` even if the user pressed Esc during that tail. This is intentional: there is nothing left to cancel.
- The Granularity rule fixes *which* operations carry a checkpoint; the Race rule disambiguates *which* checkpoint observes a given abort. The two together imply that the smallest unit of work the runtime guarantees to either complete or skip is one checkpointed sub-expression (one loop iteration, one `@`-query, one tool call, or one `invoke`), not one statement.
- A query or tool call's pre-call checkpoint fires *before* the call is dispatched. An abort observed *during* an in-flight query, tool call, or `invoke` surfaces through the underlying provider's abort path as the corresponding `Err` variant per the **Surfacing** rules below, not through a pre-call checkpoint.

**Surfacing.**

- An in-flight query whose signal aborts returns `Err(QueryError { kind: "cancelled", message: "..." })`.
- A tool call whose signal aborts returns `Err(QueryError { kind: "tool_call_error", cause: "cancelled", ... })`.
- A child invoke whose signal aborts surfaces to the parent as `Err(QueryError { kind: "invoke_callee_error", inner: { kind: "cancelled", ... } })` when the abort originated inside the child, or directly as `kind: "cancelled"` when the parent's own signal fired first.
- The loom's *top-level* cancellation surfaces to Pi as the `cancelled` row in the per-`kind` system-note table in [Invocation from Pi](./slash-invocation.md).

Per-call timeouts (a separate cancellation source independent of the user) are deferred to a later release; declaring a `timeout:` field on a query, tool call, or invoke is `loom/parse/timeout-field-rejected`. See [Future Considerations](./future-considerations.md) and [Diagnostics](./diagnostics.md).
