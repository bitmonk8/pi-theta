# `V15b` — Invoke depth bound and cycle detection

**Spec.** [`../spec_topics/invocation.md`](../spec_topics/invocation.md), [`../spec_topics/hard-ceilings/ceilings-3-and-4.md`](../spec_topics/hard-ceilings/ceilings-3-and-4.md).

**Adds.** The `invoke`-chain depth bound (hard ceiling #1, cap 32) counting direct `invoke`, `.loom`-via-`tools:`, and cross-file `.warp fn` frames, and the parse-time invocation-cycle detector over the static-resolution graph. At its ceiling-#1 first-enforcement point (`invoke` entry) this leaf **consults** `V16a`'s cross-ceiling arbitration seam for the cross-ceiling surfacing precedence and `masked` enumeration — the seam it binds via its `Deps` on `V16a`.

**Tests.**
- `INV-4`: the per-chain depth counter (incremented before the child, crossing the subagent boundary, siblings independent) fires `loom/runtime/invoke-depth-exceeded` at 33 > 32 — a top-level system note vs a nested `InvokeInfraError{panic}` — with message `invoke chain depth exceeded: 33 > 32`.
- `loom/load/invocation-cycle`: a static-resolution cycle fires at parse time; an unresolvable callee is a leaf (undetected until fixed).

**Deps.** `V15b-T`, `V15a`, `V16a`

**Ships when.** `npm test` fires `invoke-depth-exceeded` at the 32-frame boundary and `invocation-cycle` on a static cycle.
