# `V7a-T` — Diagnostics primitive (tests)

**Spec.** [`../spec_topics/diagnostics.md`](../spec_topics/diagnostics.md), [`../spec_topics/diagnostics/diagnostic-shape.md`](../spec_topics/diagnostics/diagnostic-shape.md), [`../spec_topics/implementation-notes.md`](../spec_topics/implementation-notes.md).

**Adds.** Failing tests for the paired `V7a` implementation leaf.

**Tests.**
- `DIAG-1`: an emitted diagnostic carries a registry code and renders in the content-line format; a location-less code renders without a span.
- Multi-error assembly: a file with several parse errors (plus transitive `.warp` import errors) assembles into a single `Diagnostic[]` with no fast-fail and no per-error loss. The `Diagnostic[]` is ordered by `(file, line, col)` across an entry `.loom` and ≥2 transitively-imported `.warp` modules (per [implementation-notes.md — Static-resolution load pass](../spec_topics/implementation-notes.md) IMPL area, which aggregates each visited file's diagnostics into the entry loom's drain in this order). The single-envelope batch delivery of this array is asserted by [`V7d-T`](./V7d-T-system-note-channel.md).

**Deps.** `H4a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
