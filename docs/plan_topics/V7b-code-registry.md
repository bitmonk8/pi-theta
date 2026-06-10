# `V7b` — Diagnostic code registry and closing gate

**Spec.** [`../spec_topics/diagnostics.md`](../spec_topics/diagnostics.md), [`../spec_topics/diagnostics/code-registry-parse.md`](../spec_topics/diagnostics/code-registry-parse.md), [`../spec_topics/diagnostics/code-registry-load.md`](../spec_topics/diagnostics/code-registry-load.md), [`../spec_topics/diagnostics/code-registry-runtime.md`](../spec_topics/diagnostics/code-registry-runtime.md), [`../spec_topics/diagnostics/code-registry-host.md`](../spec_topics/diagnostics/code-registry-host.md).

**Adds.** The machine-checkable diagnostic registry (namespace/severity/phase/trigger/message for every code across the parse/load/runtime/host families) and the closed-set + stable-id enforcement that the `H5a` gate consumes.

**Tests.**
- `DIAG-2`: the registry is closed — a code emitted by `src/**` with no registry row fails the gate.
- `DIAG-3`: codes are stable identifiers — a renamed code fails the gate (renames deferred to loom 2.0).
- `DIAG-4`: the Message column is normative — every asserting test sources its expected string from the registry, not prose.

**Deps.** `V7b-T`, `V7a`, `H5a`

**Ships when.** `npm test` reconciles emitted codes against the registry and fails on a missing/renamed code.
