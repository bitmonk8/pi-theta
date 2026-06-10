# `V9i` — Subagent-mode session isolation and lifecycle

**Spec.** [`../spec_topics/pi-integration-contract/subagent.md`](../spec_topics/pi-integration-contract/subagent.md), [`../spec_topics/pi-integration-contract/host-interfaces-core.md`](../spec_topics/pi-integration-contract/host-interfaces-core.md), [`../spec_topics/cancellation.md`](../spec_topics/cancellation.md).

**Adds.** The subagent-mode private `AgentSession` (no shared transcript or `tools:` table), the spawn sequence (`createAgentSession`, `ResourceLoader` adapter, `SessionManager.inMemory`, abort-listener attach), the pre-spawn binder-model guard, the mandatory `dispose()` in `finally` with idempotent dispose and abort-listener detach, and — for N≥3 parallel subagent tool calls — the parallel-spawn step that dispatches `createAgentSession` for all N before any returns via `Promise.all` over the per-call spawns (allow-listed `// allow: PIC-22 — pi-integration-contract/subagent.md`), per `PIC-22`.

**Tests.**
- `PIC-9`: an `AgentSession` is owned by one invocation, `dispose()` runs in `finally` on every exit path, dispose is idempotent, and teardown never masks the original `Err`/`Ok`; `SHUTDOWN_AWAIT_CAP_MS` covers disposal.
- `PIC-22`: for N=3 subagent-mode `.loom` callables emitted as parallel tool calls in one assistant turn, against a fake `AgentSession` whose `sendUserMessage` blocks until explicitly released, all N `createAgentSession` calls have completed and each session's `sendUserMessage` has been entered before any blocked call is released.
- A subagent-mode invocation runs an isolated session with no shared transcript or tool table.
- `loom/runtime/subagent-model-unresolved` fires when the pre-spawn model guard fails; `loom/runtime/subagent-dispose-failure` is advisory on a `dispose()` throw.
- Swallowing-handler attachment at this site ([cancellation.md — *Race semantics — swallowing-handler attachment on every abandonable Promise*](../spec_topics/cancellation.md)): assert the subagent-mode `AgentSession.abort()` Promise attaches its swallowing handler at the Promise-construction site (before the first microtask boundary), and that a late settlement landed via the `Checkpoint` seam (`V8a`) after the checkpoint has surfaced `cause: "cancelled"` is suppressed along all three side channels — no Node `unhandledRejection`, no second `RuntimeEvent`, and no diagnostic of any severity — so a build that bypasses the substrate reddens this leaf's tests.

**Deps.** `V9i-T`, `V9a`, `V17a`, `V11a`, `V8a`

**Ships when.** `npm test` spawns an isolated subagent session, asserts `dispose()`-in-`finally` idempotency, and asserts the subagent `AgentSession.abort()` Promise's three-channel swallowing-handler suppression (no `unhandledRejection`, no second `RuntimeEvent`, no diagnostic) at the `Checkpoint` seam (`V8a`).
