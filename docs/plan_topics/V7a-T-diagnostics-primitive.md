# `V7a-T` — Diagnostics primitive and `loom-system-note` channel (tests)

**Spec.** [`../spec_topics/diagnostics.md`](../spec_topics/diagnostics.md), [`../spec_topics/diagnostics/diagnostic-shape.md`](../spec_topics/diagnostics/diagnostic-shape.md), [`../spec_topics/pi-integration-contract/runtime-event-channel.md`](../spec_topics/pi-integration-contract/runtime-event-channel.md), [`../spec_topics/implementation-notes.md`](../spec_topics/implementation-notes.md).

**Adds.** Failing tests for the paired `V7a` implementation leaf.

**Tests.**
- `DIAG-1`: an emitted diagnostic carries a registry code and renders in the content-line format; a location-less code renders without a span.
- Multi-error: a file with several parse errors (plus transitive `.warp` import errors) emits exactly one `sendMessage` carrying the full batch in `content` and `Diagnostic[]` in `details.diagnostics`; no fast-fail, no per-error fan-out. The `Diagnostic[]` is ordered by `(file, line, col)` across an entry `.loom` and ≥2 transitively-imported `.warp` modules (per [implementation-notes.md — Static-resolution load pass](../spec_topics/implementation-notes.md) IMPL area, which aggregates each visited file's diagnostics into the entry loom's drain in this order).
- A re-scan re-emits without dedup/supersede.
- `PIC-21`: when the `loom-system-note` renderer body throws internally, the throw does not escape the `MessageRenderer` invocation; the renderer returns a minimal `Component` rendering raw `message.content` for `display === true` and `undefined` for `display === false`, and emits no `loom/runtime/*` diagnostic.

**Deps.** `H4a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
