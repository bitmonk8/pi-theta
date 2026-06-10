# `V15b-T` — Invoke depth bound and cycle detection (tests)

**Spec.** [`../spec_topics/invocation.md`](../spec_topics/invocation.md), [`../spec_topics/hard-ceilings/ceilings-3-and-4.md`](../spec_topics/hard-ceilings/ceilings-3-and-4.md).

**Adds.** Failing tests for the paired `V15b` implementation leaf.

**Tests.**
- `INV-4`: the per-chain depth counter (incremented before the child, crossing the subagent boundary, siblings independent) fires `loom/runtime/invoke-depth-exceeded` at 33 > 32 — a top-level system note vs a nested `InvokeInfraError{panic}` — with message `invoke chain depth exceeded: 33 > 32`.
- `loom/load/invocation-cycle`: a static-resolution cycle fires at parse time; an unresolvable callee is a leaf (undetected until fixed).

**Deps.** `V15a`, `V16a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
