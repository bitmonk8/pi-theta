# `V9i-T` — Subagent-mode session isolation and lifecycle (tests)

**Spec.** [`../spec_topics/pi-integration-contract/subagent.md`](../spec_topics/pi-integration-contract/subagent.md), [`../spec_topics/pi-integration-contract/host-interfaces-core.md`](../spec_topics/pi-integration-contract/host-interfaces-core.md).

**Adds.** Failing tests for the paired `V9i` implementation leaf.

**Tests.**
- `PIC-9`: an `AgentSession` is owned by one invocation, `dispose()` runs in `finally` on every exit path, dispose is idempotent, and teardown never masks the original `Err`/`Ok`; `SHUTDOWN_AWAIT_CAP_MS` covers disposal.
- `PIC-22`: for N=3 subagent-mode `.loom` callables emitted as parallel tool calls in one assistant turn, against a fake `AgentSession` whose `sendUserMessage` blocks until explicitly released, all N `createAgentSession` calls have completed and each session's `sendUserMessage` has been entered before any blocked call is released.
- A subagent-mode invocation runs an isolated session with no shared transcript or tool table.
- `loom/runtime/subagent-model-unresolved` fires when the pre-spawn model guard fails; `loom/runtime/subagent-dispose-failure` is advisory on a `dispose()` throw.

**Deps.** `V9a`, `V17a`, `V11a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
