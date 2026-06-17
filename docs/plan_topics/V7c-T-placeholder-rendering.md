# `V7c-T` — Placeholder rendering (tests)

**Spec.** [`../spec_topics/diagnostics/placeholder-rendering-a.md`](../spec_topics/diagnostics/placeholder-rendering-a.md), [`../spec_topics/diagnostics/placeholder-rendering-b.md`](../spec_topics/diagnostics/placeholder-rendering-b.md).

**Adds.** Failing tests for the paired `V7c` implementation leaf.

**Tests.**
- `DIAG-4`: each of the eight categories renders its normative vector byte-identically.
- The category-2 runtime-value truncation produces `77 chars + "..."` at the boundary.
- The category-8 row `loom/load/host-incompatible` (`node-floor`), with the host version mocked to `v18.19.0`, renders the implementation-defined `<observed>` segment interpolated between a byte-identical prefix and a byte-identical suffix; the test asserts via the §8 anchored partial-match pattern `^host incompatible \(node-floor\): observed (.*), required >=22\.19\.0$`, never a full-*Message*-string equality (non-conformant for category-8 rows).

**Deps.** `V7b`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
