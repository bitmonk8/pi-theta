# `V7a` — Diagnostics primitive

**Spec.** [`../spec_topics/diagnostics.md`](../spec_topics/diagnostics.md), [`../spec_topics/diagnostics/diagnostic-shape.md`](../spec_topics/diagnostics/diagnostic-shape.md), [`../spec_topics/implementation-notes.md`](../spec_topics/implementation-notes.md).

**Adds.** The `Diagnostic` shape (severity/code/file?/range?/message/hint?/related?/masked?/details?), the serialised content-line format (`<file>:<line>:<col>: <code>: <message>` plus hint/related lines), and the multi-error `Diagnostic[]` assembly with its `(file, line, col)` ordering across an entry `.loom` and its transitively-imported `.warp` modules (no fast-fail — every error in a scan is collected). The `loom-system-note` delivery channel that carries this `Diagnostic[]` to the Pi host — its `sendMessage` envelope, batching, renderer registration, fallback chain, and the producer-facing diagnostic-emission seam — is owned by [`V7d`](./V7d-system-note-channel.md).

**Tests.**
- `DIAG-1`: an emitted diagnostic carries a registry code and renders in the content-line format; a location-less code renders without a span.
- Multi-error assembly: a file with several parse errors (plus transitive `.warp` import errors) assembles into a single `Diagnostic[]` with no fast-fail and no per-error loss. The `Diagnostic[]` is ordered by `(file, line, col)` across an entry `.loom` and ≥2 transitively-imported `.warp` modules (per [implementation-notes.md — Static-resolution load pass](../spec_topics/implementation-notes.md) IMPL area, which aggregates each visited file's diagnostics into the entry loom's drain in this order). The single-envelope batch delivery of this array is asserted by [`V7d`](./V7d-system-note-channel.md).

**Deps.** `V7a-T`, `H4a`

**Ships when.** `npm test` asserts the content-line format and the `(file, line, col)` ordering of the assembled `Diagnostic[]`.
