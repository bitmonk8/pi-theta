# `V7c-T` — Placeholder rendering (tests)

**Spec.** [`../spec_topics/diagnostics/placeholder-rendering-a.md`](../spec_topics/diagnostics/placeholder-rendering-a.md), [`../spec_topics/diagnostics/placeholder-rendering-b.md`](../spec_topics/diagnostics/placeholder-rendering-b.md).

**Adds.** Failing tests for the paired `V7c` implementation leaf.

**Tests.**
- `DIAG-4`: each of the eight categories renders its normative vector byte-identically.
- The category-2 runtime-value truncation produces `77 chars + "..."` at the boundary.
- The category-8 host-derived tail keeps prefix/suffix byte-identical with an implementation-defined tail.

**Deps.** `V7b`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
