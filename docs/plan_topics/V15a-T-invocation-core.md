# `V15a-T` — Invocation core (tests)

**Spec.** [`../spec_topics/invocation.md`](../spec_topics/invocation.md), [`../spec_topics/discovery/discovery-sources.md`](../spec_topics/discovery/discovery-sources.md), [`../spec_topics/cancellation.md`](../spec_topics/cancellation.md).

**Adds.** Failing tests for the paired `V15a` implementation leaf.

**Tests.**
- `INV-1`: load-time and invocation-time re-checks use identical `realpath` + segment-boundary containment; an escape surfaces on both channels (diagnostic + `InvokeInfraError{load_failure}`).
- `INV-2`: the AST arg list carries `style:"positional"|"named"`; only positional is defined in 1.0.
- `INV-3`: the invoke-options record is an open struct (additive per-call-timeout seam).
- [invocation.md — cross-mode matrix](../spec_topics/invocation.md) (INV area): the cross-mode matrix selects fresh-vs-attach by callee mode; a child uses its own model/tools/system; prompt→prompt suspends the parent.
- Swallowing-handler attachment at this site ([cancellation.md — *Race semantics — swallowing-handler attachment on every abandonable Promise*](../spec_topics/cancellation.md)): assert the `invoke` child's top-level execution Promise attaches its swallowing handler at the Promise-construction site (before the first microtask boundary), and that a late settlement landed via the `Checkpoint` seam (`V8a`) after the checkpoint has surfaced `cause: "cancelled"` is suppressed along all three side channels — no Node `unhandledRejection`, no second `RuntimeEvent`, and no diagnostic of any severity — so a build that bypasses the substrate reddens this leaf's tests.

**Deps.** `V10a`, `V2b`, `V3d`, `V8a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
