# `V13f` — `@`-query provider swallowing-handler per-site routing

**Spec.** [`../spec_topics/cancellation.md`](../spec_topics/cancellation.md).

**Adds.** The `@`-query provider abandonable-Promise site's routing through the `Checkpoint`-seam swallowing-handler substrate — the per-site witness that the `@`-query dispatch Promise attaches its swallowing handler at the construction site and suppresses a late settlement along all three side channels. This is the `@`-query entry in the four-site routing set [`V17a`](./V17a-cancellation-core.md) delegates to its owning leaves (`V14f`, `V13f`, `V15h`, `V9i`).

**Tests.**
- Swallowing-handler attachment at this site ([cancellation.md — *Race semantics — swallowing-handler attachment on every abandonable Promise*](../spec_topics/cancellation.md)): assert the underlying `@`-query provider Promise attaches its swallowing handler at the Promise-construction site (before the first microtask boundary), and that a late settlement landed via the `Checkpoint` seam (`V8a`) after the checkpoint has surfaced `cause: "cancelled"` is suppressed along all three side channels — no Node `unhandledRejection`, no second `RuntimeEvent`, and no diagnostic of any severity — so a build that bypasses the substrate reddens this leaf's tests.

**Deps.** `V13f-T`, `V9n`, `V8a`, `H4b`

**Ships when.** `npm test` lands a late settlement on the `@`-query provider Promise via the `Checkpoint` seam (`V8a`) after the checkpoint has surfaced `cause: "cancelled"`, and asserts the Promise's three-channel swallowing-handler suppression (no `unhandledRejection`, no second `RuntimeEvent`, no diagnostic) — a build that bypasses the substrate reddens this leaf's tests.
