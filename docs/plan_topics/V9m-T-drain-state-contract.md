# `V9m-T` — `LoomRegistry` drain-state contract (tests)

**Spec.** [`../spec_topics/pi-integration-contract/drain-state-contract.md`](../spec_topics/pi-integration-contract/drain-state-contract.md).

**Adds.** Failing tests for the paired `V9m` implementation leaf.

**Tests.**
- [drain-state-contract.md — three-arm dispatch](../spec_topics/pi-integration-contract/drain-state-contract.md) (PIC area): the drain-state three-arm dispatch routes (dispatch / shutting-down / degraded-needs-reload); the predicate `drained === true || tag !== undefined` is idempotent.
- `loom/host/session-shutdown-runtime-degraded`: a `readDrainState` read-failure fails safe (slash → degraded arm; handler-entry → steady-state full teardown).
- [drain-state-contract.md — superseded-entry dispatch](../spec_topics/pi-integration-contract/drain-state-contract.md#superseded-entry-dispatch) (PIC area): after a `session_start` supersession pass drops a loom's `LoomRegistry` entry-table entry, a later dispatch of `/<name>` reaches steady-state arm (a), the entry-table lookup misses, and the slash handler returns the fixed `"loom /<name>: superseded; /reload to refresh"` system note rather than dispatching the dropped loom.

**Deps.** `V9b`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
