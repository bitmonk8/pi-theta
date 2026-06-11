# `V9b-T` — Registration steps and drain-state contract (tests)

**Spec.** [`../spec_topics/pi-integration-contract/registration-steps.md`](../spec_topics/pi-integration-contract/registration-steps.md), [`../spec_topics/pi-integration-contract/drain-state-contract.md`](../spec_topics/pi-integration-contract/drain-state-contract.md), [`../spec_topics/implementation-notes.md`](../spec_topics/implementation-notes.md).

**Adds.** Failing tests for the paired `V9b` implementation leaf.

**Tests.**
- [registration-steps.md — registry swap](../spec_topics/pi-integration-contract/registration-steps.md) (PIC area): looms discovered are registered; the swap is atomic (build-aside, then publish); a failed swap fires `loom/runtime/registry-swap-failed`.
- [drain-state-contract.md — three-arm dispatch](../spec_topics/pi-integration-contract/drain-state-contract.md) (PIC area): the drain-state three-arm dispatch routes (dispatch / shutting-down / degraded-needs-reload); the predicate `drained === true || tag !== undefined` is idempotent.
- `loom/host/session-shutdown-runtime-degraded`: a `readDrainState` read-failure fails safe (slash → degraded arm; handler-entry → steady-state full teardown).
- [implementation-notes.md — Static-resolution load pass](../spec_topics/implementation-notes.md) (IMPL area): the in-process re-parse path drops the per-pass cache entry for the changed file and every transitive `.warp` importer as part of the `LoomRegistry` swap.

**Deps.** `V9a`, `V10a`, `V8b`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
