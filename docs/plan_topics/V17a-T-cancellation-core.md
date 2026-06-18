# `V17a-T` — Cancellation core (tests)

**Spec.** [`../spec_topics/cancellation.md`](../spec_topics/cancellation.md), [`../spec_topics/pi-integration-contract/host-interfaces-core.md`](../spec_topics/pi-integration-contract/host-interfaces-core.md).

**Adds.** Failing tests for the paired `V17a` implementation leaf.

**Tests.**
- `CNCL-1`: a late tool-call value does not rebind its call site.
- `CNCL-2`: no second `Err` is produced per invocation.
- `CNCL-3`: no second `RuntimeEvent` is produced per invocation.
- `CNCL-4`: abort-reason propagation — after each of the three forwarding paths fires, land an abort via the `Checkpoint` seam (`V8a`) and assert `loomAbort.signal.reason === source.reason` at the downstream checkpoint (reason identity, not merely `aborted`); the first source's reason wins under the one-shot guard. For the reason-less `agent_end` slash-command trigger, assert the synthesised `Error.message` is byte-exact `"loom cancelled by agent_end"`. (The `"loom cancelled by session shutdown"` synthesised-reason facet is asserted in `V9g`, whose handler produces it.)
- `CNCL-5`: no retroactive rewrite of a completed `Ok` — land an abort via the `Checkpoint` seam after an operation returns `Ok(v)` but before the next checkpoint; assert the value is retained and not rewritten to `Err({kind:"cancelled"})`.
- `CNCL-6`: no top-level synthesis on tail abort — land an abort in a pure tail after the final cancellable operation, so no further checkpoint executes; assert the top-level result is the produced value and no synthesised top-level `cancelled` appears.
- Forwarding into `loomAbort` ([cancellation.md — *Signal source* / *Forwarding into `loomAbort`*](../spec_topics/cancellation.md)): assert cancellation forwards through `loomAbort.signal` and never through `ctx.signal` directly, across the slash-command, tool-exposed, and `invoke`-parent entry points.
- Downward-only propagation ([cancellation.md — *Propagation*](../spec_topics/cancellation.md)): assert cancellation propagates parent → child invoke / in-flight query / in-flight tool call, and never child → parent (a child cancelling internally surfaces as `Err(QueryError { kind: "cancelled" })` to the parent).
- Swallowing-handler side-channel suppression ([cancellation.md — *Race semantics — swallowing-handler attachment on every abandonable Promise*](../spec_topics/cancellation.md)): land a late settlement on an abandonable Promise at the `Checkpoint` seam (`V8a`) after the checkpoint has surfaced `cause: "cancelled"`, and assert total suppression along all three side channels — no Node `unhandledRejection`, no second `RuntimeEvent`, and no diagnostic of any severity. This assertion verifies suppression *at the `Checkpoint`-seam substrate*. It does not by itself prove that each of the four abandonable-Promise sites (code-side `execute()`, `@`-query provider, `invoke` child top-level, subagent `AgentSession.abort()`) routes its Promise through that substrate; that per-site routing property is asserted by each owning leaf (`V14f`, `V13f`, `V15h`, `V9o` respectively), each of which attaches its own swallowing handler and exercises it against the same `Checkpoint` seam.

_(The checkpoint-granularity surface is owned by `V17c`; the forwarding-listener throw-trap is owned by `V17b`.)_

**Deps.** `V8a`, `V4d`, `H4a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
