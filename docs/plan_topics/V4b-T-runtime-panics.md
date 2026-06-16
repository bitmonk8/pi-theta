# `V4b-T` — Runtime panics (tests)

**Spec.** [`../spec_topics/errors-and-results.md`](../spec_topics/errors-and-results.md), [`../spec_topics/errors-and-results/error-model.md`](../spec_topics/errors-and-results/error-model.md).

**Adds.** Failing tests for the paired `V4b` implementation leaf.

**Tests.**
- `loom/runtime/index-out-of-bounds`, `loom/runtime/missing-object-key`, `loom/runtime/null-index-access`, `loom/runtime/null-member-access`, `loom/runtime/match-error`, `loom/runtime/invoke-depth-exceeded`: each of the six closed panic sources emits its registered message template (sourced from the diagnostics registry) and bypasses `?`/`match`.
- An unexpected thrown value surfaces as `loom/runtime/internal-error`.
- A host-fatal uncatchable condition (NOCEIL-3 carve-out) emits no diagnostic at all — in particular, no `loom/runtime/internal-error` is delivered.

**Deps.** `V4a`, `V7b`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
