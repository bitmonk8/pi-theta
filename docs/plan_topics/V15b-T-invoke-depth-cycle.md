# `V15b-T` — Invoke depth bound and cycle detection (tests)

**Spec.** [`../spec_topics/invocation.md`](../spec_topics/invocation.md), [`../spec_topics/hard-ceilings/ceilings-3-and-4.md`](../spec_topics/hard-ceilings/ceilings-3-and-4.md).

**Adds.** Failing tests for the paired `V15b` implementation leaf.

**Tests.**
- `INV-4` (NOCEIL-4 frame-depth seam: the 32-level `invoke`-chain bound is the only loom-level frame-depth ceiling): the per-chain depth counter (incremented before the child, crossing the subagent boundary, siblings independent) fires `loom/runtime/invoke-depth-exceeded` at 33 > 32 — a top-level system note vs a nested `InvokeInfraError{panic}` — with message `invoke chain depth exceeded: 33 > 32`. The counter is exercised across all three countable frame classes, including a cross-file `.warp fn` call chain (caller and callee in different source files, per `invocation.md` §INV-4) that reaches the 32-frame boundary and fires at 33 > 32.
- `loom/load/invocation-cycle`: a static-resolution cycle fires at parse time; an unresolvable callee is a leaf (undetected until fixed).

**Deps.** `V15a`, `V15c`, `V16a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
