# `V7d-T` — `loom-system-note` delivery channel (tests)

**Spec.** [`../spec_topics/diagnostics.md`](../spec_topics/diagnostics.md), [`../spec_topics/pi-integration-contract/runtime-event-channel.md`](../spec_topics/pi-integration-contract/runtime-event-channel.md), [`../spec_topics/pi-integration-contract/diagnostic-emission-isolation.md`](../spec_topics/pi-integration-contract/diagnostic-emission-isolation.md), [`../spec_topics/implementation-notes.md`](../spec_topics/implementation-notes.md).

**Adds.** Failing tests for the paired `V7d` implementation leaf.

**Tests.**
- Multi-error batch delivery: the `Diagnostic[]` assembled by [`V7a`](./V7a-diagnostics-primitive.md) is delivered as exactly one `sendMessage` per `.loom` carrying the full batch in `content` and `Diagnostic[]` in `details.diagnostics`; no per-error fan-out across the batch.
- A re-scan re-emits without dedup/supersede.
- `PIC-21`: when the `loom-system-note` renderer body throws internally, the throw does not escape the `MessageRenderer` invocation; the renderer returns a minimal `Component` rendering raw `message.content` for `display === true` and `undefined` for `display === false`, and emits no `loom/runtime/*` diagnostic.
- `loom/runtime/system-note-delivery-failed`: when `pi.sendMessage` throws on a `loom-system-note` emission, the runtime falls back in order — `ctx.ui.notify(content, "error")`, then a `loom/runtime/system-note-delivery-failed` diagnostic (`message` = the original note's `content`, `hint` = the underlying throw's message), then a terminal `console.error` — skips `ctx.ui.notify` when `display: false` or `content: ""`, catches a throwing `ctx.ui.notify` and proceeds to the diagnostic step, and continues without aborting the slash-command handler or spawned subagent session (per [runtime-event-channel.md — System notes](../spec_topics/pi-integration-contract/runtime-event-channel.md)). Separate from the `PIC-21` renderer-throw mode above.

**Deps.** `V7a`, `H4a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
