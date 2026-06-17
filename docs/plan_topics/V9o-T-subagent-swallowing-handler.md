# `V9o-T` — Subagent-mode `AgentSession.abort()` swallowing-handler per-site routing (tests)

**Spec.** [`../spec_topics/cancellation.md`](../spec_topics/cancellation.md).

**Adds.** Failing tests for the paired `V9o` implementation leaf.

**Tests.**
- Swallowing-handler attachment at this site ([cancellation.md — *Race semantics — swallowing-handler attachment on every abandonable Promise*](../spec_topics/cancellation.md)): assert the subagent-mode `AgentSession.abort()` Promise attaches its swallowing handler at the Promise-construction site (before the first microtask boundary), and that a late settlement landed via the `Checkpoint` seam (`V8a`) after the checkpoint has surfaced `cause: "cancelled"` is suppressed along all three side channels — no Node `unhandledRejection`, no second `RuntimeEvent`, and no diagnostic of any severity — so a build that bypasses the substrate reddens this leaf's tests.

**Deps.** `V9i`, `V17a`, `V8a`, `H4b`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
