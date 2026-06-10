# `V7a` — Diagnostics primitive and `loom-system-note` channel

**Spec.** [`../spec_topics/diagnostics.md`](../spec_topics/diagnostics.md), [`../spec_topics/diagnostics/diagnostic-shape.md`](../spec_topics/diagnostics/diagnostic-shape.md), [`../spec_topics/pi-integration-contract/runtime-event-channel.md`](../spec_topics/pi-integration-contract/runtime-event-channel.md).

**Adds.** The `Diagnostic` shape (severity/code/file?/range?/message/hint?/related?/masked?/details?), the serialised content-line format (`<file>:<line>:<col>: <code>: <message>` plus hint/related lines), the `loom-system-note` `sendMessage` envelope with its renderer registration, and the fallback chain (`sendSystemNote` → `ctx.ui.notify` → `console.error`). Multi-error batching (one `sendMessage` per `.loom` carrying the full batch) lands here.

**Tests.**
- `DIAG-1`: an emitted diagnostic carries a registry code and renders in the content-line format; a location-less code renders without a span.
- Multi-error: a file with several parse errors (plus transitive `.warp` import errors) emits exactly one `sendMessage` carrying the full batch in `content` and `Diagnostic[]` in `details.diagnostics`; no fast-fail, no per-error fan-out.
- A re-scan re-emits without dedup/supersede.

**Deps.** `V7a-T`, `H4a`

**Ships when.** `npm test` emits a batched diagnostic envelope through the channel and asserts the content-line format.
