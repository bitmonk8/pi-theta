# `V17b-T` — Forwarding-listener throw-trap (tests)

**Spec.** [`../spec_topics/cancellation.md`](../spec_topics/cancellation.md), [`../spec_topics/pi-integration-contract/host-interfaces-core.md`](../spec_topics/pi-integration-contract/host-interfaces-core.md).

**Adds.** Failing tests for the paired `V17b` implementation leaf.

**Tests.**
- Forwarding-listener throw-trap ([cancellation.md — *Forwarding-listener throw*](../spec_topics/cancellation.md)): inject a throw from each of the three steady-state forwarding listeners' `loomAbort.abort(source.reason)` call — the slash-command `ctx.signal`-aborted trigger, the tool-exposed `signal`-aborted trigger, and the `invoke`-parent derived-controller trigger — driving the injection through the entry-point harness so the throw is raised inside the real listener boundary rather than a bespoke double, and assert two facets: (1) the defect routes through the runtime-defect surface on the `loom/runtime/internal-error` channel (and, at an `invoke` parent, surfaces via the `cause: "internal_error"` arm of `InvokeInfraError`); (2) the trap does not swallow the cancellation — `source.signal.aborted` remains `true` and the next `Checkpoint`-seam await (`V8a`) still surfaces `Err(QueryError { kind: "cancelled" })`. Edge cases: the first-source-wins one-shot guard on `loomAbort.abort()` (a throw on a re-entrant second trigger must not re-stamp the reason); the `session_shutdown` teardown-iteration path is governed by its own sub-step-2 swallow rule and is out of scope for this steady-state trap.

**Deps.** `V17a`, `H4a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
