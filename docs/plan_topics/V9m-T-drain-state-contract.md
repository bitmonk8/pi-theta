# `V9m-T` — `LoomRegistry` drain-state contract (tests)

**Spec.** [`../spec_topics/pi-integration-contract/drain-state-contract.md`](../spec_topics/pi-integration-contract/drain-state-contract.md).

**Adds.** Failing tests for the paired `V9m` implementation leaf.

**Tests.**
- [drain-state-contract.md — two-arm dispatch](../spec_topics/pi-integration-contract/drain-state-contract.md#pic-29) (`PIC-29`, `PIC-30`, `PIC-32`): the drain-state two-arm dispatch routes (dispatch / shutting-down), and the two arms are mutually exclusive and exhaust the field-tuple state space (`PIC-29`); the runtime introduces no third boolean drain-state field, no arm-specific post-failed-handler gate, and no third arm (`PIC-30`); `LoomRegistry.drain()` sets `drained = true` (`PIC-32`); the predicate `drained === true || tag !== undefined` is idempotent.
- Read-failure fail-safe ([drain-state-contract.md#pic-31](../spec_topics/pi-integration-contract/drain-state-contract.md#pic-31), `PIC-31`): the `readDrainState` call is `try`/`catch`-wrapped at both call sites and a read-failure fails safe (slash → shutting-down arm; handler-entry → steady-state full teardown).
- [registration-steps.md — superseded-entry dispatch](../spec_topics/pi-integration-contract/registration-steps.md#superseded-entry-dispatch) (PIC area): after a `session_start` supersession pass drops a loom's `LoomRegistry` entry-table entry, a later dispatch of `/<name>` reaches steady-state arm (a), the entry-table lookup misses, and the slash handler returns the fixed `"loom /<name>: superseded; /reload to refresh"` system note rather than dispatching the dropped loom.

**Deps.** `V9b`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
