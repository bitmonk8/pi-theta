# `V9i` — Subagent-mode session isolation and lifecycle

**Spec.** [`../spec_topics/pi-integration-contract/subagent.md`](../spec_topics/pi-integration-contract/subagent.md), [`../spec_topics/pi-integration-contract/host-interfaces-core.md`](../spec_topics/pi-integration-contract/host-interfaces-core.md), [`../spec_topics/cancellation.md`](../spec_topics/cancellation.md), [`../spec_topics/return.md`](../spec_topics/return.md).

**Adds.** The subagent-mode private `AgentSession` (no shared transcript or `tools:` table), the spawn sequence (`createAgentSession`, `ResourceLoader` adapter, `SessionManager.inMemory`, abort-listener attach), the pre-spawn binder-model guard, the mandatory `dispose()` in `finally` with idempotent dispose and abort-listener detach, and — for N≥3 parallel subagent tool calls — the parallel-spawn step that dispatches `createAgentSession` for all N before any returns via `Promise.all` over the per-call spawns (allow-listed `// allow: PIC-22 — pi-integration-contract/subagent.md`), per `PIC-22`.

**Tests.**
- `PIC-9`: an `AgentSession` is owned by one invocation, `dispose()` runs in `finally` on every exit path, dispose is idempotent, and teardown never masks the original `Err`/`Ok`; `SHUTDOWN_AWAIT_CAP_MS` covers disposal.
- `PIC-22`: for N=3 subagent-mode `.loom` callables emitted as parallel tool calls in one assistant turn, against a fake `AgentSession` whose `sendUserMessage` blocks until explicitly released, all N `createAgentSession` calls have completed and each session's `sendUserMessage` has been entered before any blocked call is released.
- A subagent-mode invocation runs an isolated session with no shared transcript or tool table.
- [return.md — final-value contract](../spec_topics/return.md) (RET code-keyed area), against the function-result seam `V3d` defines: the callee's produced final value propagates to the subagent caller on success and is absent on fail/cancel.
- `loom/runtime/subagent-model-unresolved` fires when the pre-spawn model guard fails; `loom/runtime/subagent-dispose-failure` is advisory on a `dispose()` throw.

**Deps.** `V9i-T`, `V9a`, `V17a`, `V11a`, `V8a`, `V3d`, `H4b`

**Ships when.** `npm test` spawns an isolated subagent session and asserts `dispose()`-in-`finally` idempotency.
