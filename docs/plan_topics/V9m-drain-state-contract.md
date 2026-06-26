# `V9m` — `LoomRegistry` drain-state contract

**Spec.** [`../spec_topics/pi-integration-contract/drain-state-contract.md`](../spec_topics/pi-integration-contract/drain-state-contract.md).

**Adds.** The `LoomRegistry` drain-state contract (two fields, four methods, three-arm `readDrainState`, idempotent predicate, read-failure fail-safe, superseded-entry dispatch) over the registry [`V9b`](./V9b-registration-reload-wiring.md) builds and swaps. The closed three-arm dispatch (dispatch / shutting-down note / degraded-needs-reload note), the no-fourth-arm / no-alternative-gating-field prohibition, and the `readDrainState` read-failure fail-safe MUSTs are owned here.

**Tests.**
- [drain-state-contract.md — three-arm dispatch](../spec_topics/pi-integration-contract/drain-state-contract.md#pic-29) (`PIC-29`, `PIC-30`, `PIC-32`): the drain-state three-arm dispatch routes (dispatch / shutting-down / degraded-needs-reload), and the three arms are mutually exclusive and exhaust the field-tuple state space (`PIC-29`); the runtime introduces no third boolean drain-state field, no arm-specific post-failed-handler gate, and no fourth arm (`PIC-30`); `LoomRegistry.drain()` sets `drained = true` (`PIC-32`); the predicate `drained === true || tag !== undefined` is idempotent.
- `loom/host/session-shutdown-runtime-degraded` ([drain-state-contract.md#pic-31](../spec_topics/pi-integration-contract/drain-state-contract.md#pic-31), `PIC-31`): the `readDrainState` call is `try`/`catch`-wrapped at both call sites and a read-failure fails safe (slash → degraded arm; handler-entry → steady-state full teardown).
- [registration-steps.md — superseded-entry dispatch](../spec_topics/pi-integration-contract/registration-steps.md#superseded-entry-dispatch) (PIC area): after a `session_start` supersession pass drops a loom's `LoomRegistry` entry-table entry, a later dispatch of `/<name>` reaches steady-state arm (a), the entry-table lookup misses, and the slash handler returns the fixed `"loom /<name>: superseded; /reload to refresh"` system note rather than dispatching the dropped loom.

**Deps.** `V9m-T`, `V9b`

**Ships when.** `npm test` exercises the three drain-state arms (incl. the `readDrainState` read-failure fail-safe) and the superseded-entry dispatch returning the fixed system note.
