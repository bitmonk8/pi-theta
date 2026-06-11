# `V9b` — Registration steps and drain-state contract

**Spec.** [`../spec_topics/pi-integration-contract/registration-steps.md`](../spec_topics/pi-integration-contract/registration-steps.md), [`../spec_topics/pi-integration-contract/drain-state-contract.md`](../spec_topics/pi-integration-contract/drain-state-contract.md), [`../spec_topics/implementation-notes.md`](../spec_topics/implementation-notes.md).

**Adds.** Registration steps 1–5 (`registerFlag('loom')` → walk; pending list; `session_start` collision + `registerCommand`; `session_shutdown` subscribe; watcher + `LoomRegistry` build-aside-publish swap) and the `LoomRegistry` drain-state contract (two fields, four methods, three-arm `readDrainState`, idempotent predicate, read-failure fail-safe, superseded-entry dispatch). The **watcher-time reload failure-injection seam** is owned here — the named test interface through which a synthetic registry-swap failure (`loom/runtime/registry-swap-failed`) or `.loom`/`.warp` re-parse failure is fed to the `loom-system-note` surfacing path without standing up a live watcher; `V4e` binds it via `Deps` to exercise `ERR-7`.

**Tests.**
- [registration-steps.md — registry swap](../spec_topics/pi-integration-contract/registration-steps.md) (PIC area): looms discovered are registered; the swap is atomic (build-aside, then publish); a failed swap fires `loom/runtime/registry-swap-failed`.
- [drain-state-contract.md — three-arm dispatch](../spec_topics/pi-integration-contract/drain-state-contract.md) (PIC area): the drain-state three-arm dispatch routes (dispatch / shutting-down / degraded-needs-reload); the predicate `drained === true || tag !== undefined` is idempotent.
- `loom/host/session-shutdown-runtime-degraded`: a `readDrainState` read-failure fails safe (slash → degraded arm; handler-entry → steady-state full teardown).
- [implementation-notes.md — Static-resolution load pass](../spec_topics/implementation-notes.md) (IMPL area): the in-process re-parse path drops the per-pass cache entry for the changed file and every transitive `.warp` importer as part of the `LoomRegistry` swap.

**Deps.** `V9b-T`, `V9a`, `V10a`, `V8b`

**Ships when.** `npm test` registers looms, swaps atomically, and exercises the three drain-state arms incl. read-failure.
