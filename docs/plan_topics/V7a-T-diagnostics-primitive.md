# `V7a-T` — Diagnostics primitive and `loom-system-note` channel (tests)

**Spec.** [`../spec_topics/diagnostics.md`](../spec_topics/diagnostics.md), [`../spec_topics/diagnostics/diagnostic-shape.md`](../spec_topics/diagnostics/diagnostic-shape.md), [`../spec_topics/pi-integration-contract/runtime-event-channel.md`](../spec_topics/pi-integration-contract/runtime-event-channel.md).

**Adds.** Failing tests for the paired `V7a` implementation leaf.

**Tests.**
- `DIAG-1`: an emitted diagnostic carries a registry code and renders in the content-line format; a location-less code renders without a span.
- Multi-error: a file with several parse errors (plus transitive `.warp` import errors) emits exactly one `sendMessage` carrying the full batch in `content` and `Diagnostic[]` in `details.diagnostics`; no fast-fail, no per-error fan-out.
- A re-scan re-emits without dedup/supersede.

**Deps.** `H4a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
