# `V7c` — Placeholder rendering

**Spec.** [`../spec_topics/diagnostics/placeholder-rendering-a.md`](../spec_topics/diagnostics/placeholder-rendering-a.md), [`../spec_topics/diagnostics/placeholder-rendering-b.md`](../spec_topics/diagnostics/placeholder-rendering-b.md).

**Adds.** The eight placeholder-rendering categories, each with its single byte-identical rendering rule and normative test vectors (static-type re-serialisation; runtime-value stringification with 80→77+`...` truncation; syntactic-construct verbatim span; numeric integer rule; source-derived verbatim; underlying-error first-line coercion; identifier/descriptor/closed-enum sub-rules; host-derived freeform tail).

**Tests.**
- `DIAG-4`: each of the eight categories renders its normative vector byte-identically.
- The category-2 runtime-value truncation produces `77 chars + "..."` at the boundary.
- The category-8 host-derived tail keeps prefix/suffix byte-identical with an implementation-defined tail.

**Deps.** `V7c-T`, `V7b`

**Ships when.** `npm test` asserts the byte-identical vector for each of the eight categories.
