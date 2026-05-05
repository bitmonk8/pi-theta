# Cancellation

Every loom invocation runs under an `AbortSignal` provided by Pi. V1 cancellation rules:

**Signal source.** Each loom invocation owns a fresh `AbortController` (`loomAbort`) that the runtime constructs at invocation start. Its `loomAbort.signal` — never `ctx.signal` directly — is the single source of truth that every downstream component sees: the interpreter's loop, `@`-query, tool-call, and `invoke` checkpoints; the `signal` argument forwarded to `tool.execute(...)` for code-side tool calls; the synthesised `ExtensionContext.signal` for the same; the `signal` passed into `createAgentSession(...)` in subagent mode; and the parent signal handed to a child invoke. `loomAbort.signal` is always defined; tool adapters and Pi APIs that accept an `AbortSignal` receive it directly without optional-chaining.

**Forwarding into `loomAbort`** depends on the entry point:

- *Slash-command entry.* The handler subscribes for the duration of the loom run. Whenever a Pi turn is active and the per-handler `ctx.signal` is observed inside one of the runtime's own event handlers (`tool_call`, `tool_result`, `message_update`, `turn_end`, `agent_end`), an aborted `ctx.signal` triggers `loomAbort.abort()`; equivalently, an `agent_end` event reporting a user-cancelled turn aborts `loomAbort`. This is the path that makes Esc-during-`@`-query work end-to-end. The runtime MUST tolerate `ctx.signal` being `undefined` at slash-command entry — Pi documents `ctx.signal` as `undefined` in idle, non-turn contexts (which is exactly when the slash-command handler fires) — and MUST NOT depend on its truthiness for any pre-turn checkpoint.
- *Tool-exposed entry (a loom registered into another loom's `tools:`).* The `signal` parameter passed to `execute(toolCallId, params, signal, onUpdate, ctx)` is wired so that `signal.aborted` triggers `loomAbort.abort()` via a one-shot listener registered at entry. The runtime may also call `loomAbort.abort()` itself on any internal failure that should cascade.
- *`invoke(...)` entry.* The parent passes its own `loomAbort.signal` into the child's constructor; the child constructs its own `loomAbort` as a derived controller that aborts when the parent's signal aborts but not vice versa, matching the downward-only **Propagation** rule below. If the parent's signal is already aborted at child-spawn time, the child surfaces `Err(QueryError { kind: "cancelled", ... })` synchronously without spawning a session.

All forwarding listeners (Pi-side or invoke-parent-side) are removed when the loom returns or panics, in the same `finally` block that disposes any subagent `AgentSession` (see [Pi Integration Contract](./pi-integration-contract.md)); listener cleanup is mandatory to prevent `AbortController` leakage across long-running Pi sessions.

**Propagation.** Cancellation propagates *down* (parent → child invokes, parent → in-flight queries, parent → in-flight tool calls). It does *not* propagate *up*: a child loom cancelling internally surfaces as `Err(QueryError { kind: "cancelled" })` (or the appropriate sub-variant) to the parent, which may handle it (`match`) or propagate it (`?`).

**Granularity.** The interpreter checks the cancellation signal at exactly these points and no others:

- immediately before each iteration of a `for` or `while` body,
- immediately before dispatching each `@`...`` query,
- immediately before each tool call,
- immediately before each `invoke` call,
- immediately before issuing the slash-command argument binder's LLM call (and the signal is forwarded to the binder model's provider invocation, so an abort observed *during* the binder call also surfaces).

Synchronous in-process work — schema lowering at file-load time, AJV validation of already-received bytes, default-merging — is not a checkpoint; it runs to completion. These steps are millisecond-scale and off the interactive hot path. No checkpoint fires inside a primitive operation (arithmetic, comparison, field/index access). A compound expression that contains multiple checkpointed sub-expressions can therefore be cancelled between them: in `let x = f() + g()` where `f` and `g` are tool calls, an abort observed between `f()`'s return and `g()`'s pre-call checkpoint aborts the statement after `f`'s side effects have committed but before `g` is dispatched, and `x` is never bound. Partially evaluated expressions are discarded; cancellation does not unwind side effects of sub-expressions that have already completed (see [Errors and Results](./errors-and-results.md)).

**Race semantics.** Cancellation is observed only at checkpoints. An operation that has already returned `Ok(v)` retains that value even if the signal fires before the next checkpoint executes; the interpreter must not retroactively rewrite a completed `Ok` into `Err({kind:"cancelled"})`. The cancellation surfaces at the next checkpoint the interpreter reaches — typically the pre-evaluation check of the next statement's first cancellable sub-operation (loop iteration, `@`-query, tool call, or `invoke`). If no further checkpoint executes before the loom returns (the abort fired after the final cancellable operation), the loom's top-level result is the value it would otherwise have produced; the runtime does **not** synthesize a top-level `cancelled` in that case.

Symmetrically, an in-flight operation whose underlying provider observes the abort surfaces as `Err` per the **Surfacing** rules below; this is the only path by which an operation's own result becomes `cancelled`.

Edge cases:

- Statement boundaries are *not* themselves checkpoints; the next checkpoint is the next loop-iter boundary, `@`-query, tool call, or `invoke`. A straight-line statement sequence with no such operations runs to completion regardless of when the abort fired.
- For `invoke`, the child's own checkpoints honour the derived signal independently — the parent does not need to re-check between child completion and binding the child's result.
- The top-level "no further checkpoint" rule means a loom that ends in a pure-arithmetic tail can complete `Ok` even if the user pressed Esc during that tail. This is intentional: there is nothing left to cancel.
- The Granularity rule fixes *which* operations carry a checkpoint; the Race rule disambiguates *which* checkpoint observes a given abort. The two together imply that the smallest unit of work the runtime guarantees to either complete or skip is one checkpointed sub-expression (one loop iteration, one `@`-query, one tool call, or one `invoke`), not one statement.
- A query or tool call's pre-call checkpoint fires *before* the call is dispatched. An abort observed *during* an in-flight query, tool call, or `invoke` surfaces through the underlying provider's abort path as the corresponding `Err` variant per the **Surfacing** rules below, not through a pre-call checkpoint.
- The two race rules — no retroactive `Ok(v)` → `Err({kind:"cancelled"})` rewrite, and no top-level synthesis when no further checkpoint executes — are only deterministically testable through a runtime-internal hook that fires synchronously *before* each checkpoint's signal-check. That hook is the `Checkpoint` seam declared in [Pi Integration Contract — `Checkpoint` seam](./pi-integration-contract.md#checkpoint-seam). Production wiring is a no-op (an already-resolved promise per checkpoint); tests use it to land an abort at a chosen checkpoint boundary without depending on JS microtask scheduling. The seam is purely a test surface and imposes no observable behaviour on production code beyond the always-`await`ed no-op.

**Surfacing.**

- An in-flight query whose signal aborts returns `Err(QueryError { kind: "cancelled", message: "..." })`.
- A tool call whose signal aborts returns `Err(QueryError { kind: "code_tool", cause: "cancelled", ... })`.
- A child invoke whose signal aborts surfaces to the parent as `Err(QueryError { kind: "invoke_callee_error", inner: { kind: "cancelled", ... } })` when the abort originated inside the child, or directly as `kind: "cancelled"` when the parent's own signal fired first.
- A cancelled binder call (abort observed before or during the binder's LLM call) is runtime-internal: it never surfaces as a `Result` to loom code (the loom never starts). Instead it produces the cancelled-binder system note defined in the failure-modes table in [Slash-Command Argument Binding](./binder.md). The loom does not run.
- The loom's *top-level* cancellation surfaces to Pi as the `cancelled` row in the per-`kind` system-note table in [Invocation from Pi](./slash-invocation.md).

Per-call timeouts (a separate cancellation source independent of the user) are deferred to a later release; declaring a `timeout:` field on a query, tool call, or invoke is `loom/parse/timeout-field-rejected`. See [Future Considerations](./future-considerations.md) and [Diagnostics](./diagnostics.md).
