# `V9i` — Subagent-mode session isolation and lifecycle

**Spec.** [`../spec_topics/pi-integration-contract/subagent.md`](../spec_topics/pi-integration-contract/subagent.md), [`../spec_topics/pi-integration-contract/host-interfaces-core.md`](../spec_topics/pi-integration-contract/host-interfaces-core.md).

**Adds.** The subagent-mode private `AgentSession` (no shared transcript or `tools:` table), the spawn sequence (`createAgentSession`, `ResourceLoader` adapter, `SessionManager.inMemory`, abort-listener attach), the pre-spawn binder-model guard, and the mandatory `dispose()` in `finally` with idempotent dispose and abort-listener detach.

**Tests.**
- `PIC-9`: an `AgentSession` is owned by one invocation, `dispose()` runs in `finally` on every exit path, dispose is idempotent, and teardown never masks the original `Err`/`Ok`; `SHUTDOWN_AWAIT_CAP_MS` covers disposal.
- A subagent-mode invocation runs an isolated session with no shared transcript or tool table.
- `loom/runtime/subagent-model-unresolved` fires when the pre-spawn model guard fails; `loom/runtime/subagent-dispose-failure` is advisory on a `dispose()` throw.

**Deps.** `V9i-T`, `V9a`, `V17a`, `V11a`

**Ships when.** `npm test` spawns an isolated subagent session and asserts `dispose()`-in-`finally` idempotency.
