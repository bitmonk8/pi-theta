# `V9i-T` — Subagent-mode session isolation and lifecycle (tests)

**Spec.** [`../spec_topics/pi-integration-contract/subagent.md`](../spec_topics/pi-integration-contract/subagent.md), [`../spec_topics/pi-integration-contract/host-interfaces-core.md`](../spec_topics/pi-integration-contract/host-interfaces-core.md).

**Adds.** Failing tests for the paired `V9i` implementation leaf.

**Tests.**
- `PIC-9`: an `AgentSession` is owned by one invocation, `dispose()` runs in `finally` on every exit path, dispose is idempotent, and teardown never masks the original `Err`/`Ok`; `SHUTDOWN_AWAIT_CAP_MS` covers disposal.
- A subagent-mode invocation runs an isolated session with no shared transcript or tool table.
- `loom/runtime/subagent-model-unresolved` fires when the pre-spawn model guard fails; `loom/runtime/subagent-dispose-failure` is advisory on a `dispose()` throw.

**Deps.** `V9a`, `V17a`, `V11a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
