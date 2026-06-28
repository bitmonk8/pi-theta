# `V9q-T` — Watcher post-error terminal recovery posture (tests)

**Spec.** [`../spec_topics/pi-integration-contract/registration-steps.md`](../spec_topics/pi-integration-contract/registration-steps.md), [`../spec_topics/pi-integration-contract/host-interfaces-services.md`](../spec_topics/pi-integration-contract/host-interfaces-services.md), [`../spec_topics/diagnostics.md`](../spec_topics/diagnostics.md), [`../spec_topics/diagnostics/code-registry-runtime.md`](../spec_topics/diagnostics/code-registry-runtime.md).

**Adds.** Failing tests for the paired `V9q` implementation leaf.

**Tests.**
- `PIC-55`: when the chokidar `error` route fires or the watcher throws such that one or more watched roots stop delivering events (the **stopped-delivering — terminal** case), driven deterministically through the `FakeFileWatcher` terminal-signal injection point ([`V8e`](./V8e-watch-token-seams.md)) that mirrors the production adapter→runtime channel, the adapter leaves the watcher torn down rather than re-armed, the runtime emits exactly **one** persistent `loom/runtime/watcher-terminated` `loom-system-note` prompting `/reload` (never via `ctx.ui.notify`), the `LoomRegistry` stays live and dispatchable through arm (a) of `readDrainState` against the last-published snapshot, and **no** `LoomRegistry` drain-state tag is written. (The continues-delivering transient-toast arm is asserted on the transient-toasts surface, not here.)
- `loom/runtime/watcher-terminated`: the emitted note's rendered message is sourced from the *Message* column of the [runtime diagnostics registry](../spec_topics/diagnostics/code-registry-runtime.md) for `loom/runtime/watcher-terminated` and routes through the persistent `loom-system-note` channel as its primary sink.

**Deps.** `V8e`, `V7b`, `V7d`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
