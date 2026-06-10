# `V7b-T` — Diagnostic code registry and closing gate (tests)

**Spec.** [`../spec_topics/diagnostics.md`](../spec_topics/diagnostics.md), [`../spec_topics/diagnostics/code-registry-parse.md`](../spec_topics/diagnostics/code-registry-parse.md), [`../spec_topics/diagnostics/code-registry-load.md`](../spec_topics/diagnostics/code-registry-load.md), [`../spec_topics/diagnostics/code-registry-runtime.md`](../spec_topics/diagnostics/code-registry-runtime.md), [`../spec_topics/diagnostics/code-registry-host.md`](../spec_topics/diagnostics/code-registry-host.md).

**Adds.** Failing tests for the paired `V7b` implementation leaf.

**Tests.**
- `DIAG-2`: the registry is closed — a code emitted by `src/**` with no registry row fails the gate.
- `DIAG-3`: codes are stable identifiers — a renamed code fails the gate (renames deferred to loom 2.0).
- `DIAG-4`: the Message column is normative — every asserting test sources its expected string from the registry, not prose.

**Deps.** `V7a`, `H5a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
