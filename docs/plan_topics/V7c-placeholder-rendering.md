# `V7c` — Placeholder rendering

**Spec.** [`../spec_topics/diagnostics/placeholder-rendering-a.md`](../spec_topics/diagnostics/placeholder-rendering-a.md), [`../spec_topics/diagnostics/placeholder-rendering-b.md`](../spec_topics/diagnostics/placeholder-rendering-b.md).

**Adds.** The eight placeholder-rendering categories, each with its single byte-identical rendering rule and normative test vectors (static-type re-serialisation; runtime-value stringification with 80→77+`...` truncation; syntactic-construct verbatim span; numeric integer rule; source-derived verbatim; underlying-error first-line coercion; identifier/descriptor/closed-enum sub-rules; host-derived freeform tail).

**Tests.**
- `DIAG-4`: each of the eight categories renders its normative vector byte-identically.
- The category-2 runtime-value truncation produces `77 chars + "..."` at the boundary.
- The category-8 row `loom/load/host-incompatible` (`node-floor`), with the host version mocked to `v18.19.0`, renders the implementation-defined `<observed>` segment interpolated between a byte-identical prefix and a byte-identical suffix; the test asserts via the §8 anchored partial-match pattern `^host incompatible \(node-floor\): observed (.*), required >=22\.19\.0$`, never a full-*Message*-string equality (non-conformant for category-8 rows).

**Deps.** `V7c-T`, `V7b`

**Ships when.** `npm test` asserts the byte-identical vector for each of the eight categories.
