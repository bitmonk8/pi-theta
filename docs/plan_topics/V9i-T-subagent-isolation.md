# `V9i-T` — Subagent-mode session isolation and lifecycle (tests)

**Spec.** [`../spec_topics/pi-integration-contract/subagent.md`](../spec_topics/pi-integration-contract/subagent.md), [`../spec_topics/pi-integration-contract/host-interfaces-core.md`](../spec_topics/pi-integration-contract/host-interfaces-core.md), [`../spec_topics/cancellation.md`](../spec_topics/cancellation.md), [`../spec_topics/return.md`](../spec_topics/return.md).

**Adds.** Failing tests for the paired `V9i` implementation leaf.

**Tests.**
- `PIC-9`: an `AgentSession` is owned by one invocation, `dispose()` runs in `finally` on every exit path, dispose is idempotent, and teardown never masks the original `Err`/`Ok`; `SHUTDOWN_AWAIT_CAP_MS` covers disposal.
- `PIC-22`: for N=2 subagent-mode `.loom` callables emitted as parallel tool calls in one assistant turn, against a fake `AgentSession` whose `sendUserMessage` blocks until explicitly released, all N `createAgentSession` calls have completed and each session's `sendUserMessage` has been entered before any blocked call is released.
- `PIC-23`: the spawn passes the loom-constructed `ResourceLoader` adapter and does not route the loom's `system:` through the `DefaultResourceLoader.systemPromptOverride` construction channel.
- A subagent-mode invocation runs an isolated session with no shared transcript or tool table.
- [return.md — final-value contract](../spec_topics/return.md) (RET code-keyed area), against the function-result seam `V3d` defines: the callee's produced final value propagates to the subagent caller on success and is absent on fail/cancel.
- `PIC-40`: `loom/runtime/subagent-model-unresolved` fires when the pre-spawn model guard fails (the runtime does not call `createAgentSession` when the resolved `model` is `undefined`); `loom/runtime/subagent-dispose-failure` is advisory on a `dispose()` throw.
- `PIC-41`: the spawn call to `createAgentSession` includes no `signal` field; cancellation is forwarded solely via the one-shot `loomAbort.signal` listener calling `AgentSession.abort()`.
- `PIC-42`: completion is awaited via the session-local `session.subscribe` API rather than the global `pi.on("agent_end", …)` event; the runtime unsubscribes before resolving each query and attaches a fresh subscription per query.
- `PIC-43`: an untyped subagent query extracts its `Ok(string)` from the terminal (`willRetry: false`) `agent_end` event's `messages` array — ignoring `willRetry: true` events — applying the cancellation short-circuit then the transport-failure (`stopReason: "error"`) short-circuit before the trailing-assistant-text concatenation.
- `ERR-8` (delegated live-carrier witness for `V4c`'s ERR-8/ERR-12 deferral): the live-surface confirmation that a mid-stream cancellation inside the real subagent `AgentSession` does not mutate the subagent session's committed turns is a **real-host-only behaviour** — it is not asserted under `npm test` (no offline source feeds a real `createAgentSession` session a scripted cancellable stream) but is witnessed at the manual real-host smoke gate ([`real-host-smoke-gate.md`](./real-host-smoke-gate.md) criterion (c)). This is the live-surface confirmation `V4c` defers from the `H4a` double.

**Deps.** `V9a`, `V17a`, `V11a`, `V8a`, `V3d`, `V4c`, `H4c`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
