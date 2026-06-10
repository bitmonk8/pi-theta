# `V4b` — Runtime panics

**Spec.** [`../spec_topics/errors-and-results.md`](../spec_topics/errors-and-results.md), [`../spec_topics/errors-and-results/error-model.md`](../spec_topics/errors-and-results/error-model.md).

**Adds.** The closed six-source runtime-panic set with its normative message templates, the `internal-error` surface for unexpected throws, and the rule that panics bypass `?`/`match`.

**Tests.**
- `loom/runtime/index-out-of-bounds`, `loom/runtime/missing-object-key`, `loom/runtime/null-index-access`, `loom/runtime/null-member-access`, `loom/runtime/match-error`, `loom/runtime/invoke-depth-exceeded`: each of the six closed panic sources emits its registered message template (sourced from the diagnostics registry) and bypasses `?`/`match`.
- An unexpected thrown value surfaces as `loom/runtime/internal-error`.
- `loom/runtime/internal-error` (NOCEIL-3 uncatchable carve-out): a host-fatal uncatchable condition emits no diagnostic.

**Deps.** `V4b-T`, `V4a`, `V7b`

**Ships when.** `npm test` asserts each panic template and that panics bypass `?`/`match`.
