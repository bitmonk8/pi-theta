# `V15b` — Invoke depth bound and cycle detection

**Spec.** [`../spec_topics/invocation.md`](../spec_topics/invocation.md), [`../spec_topics/hard-ceilings/ceilings-3-and-4.md`](../spec_topics/hard-ceilings/ceilings-3-and-4.md).

**Adds.** The `invoke`-chain depth bound (hard ceiling #1, cap 32) counting direct `invoke`, `.loom`-via-`tools:`, and cross-file `.warp fn` frames, and the parse-time invocation-cycle detector over the static-resolution graph. At its ceiling-#1 first-enforcement point (`invoke` entry) this leaf **consults** `V16a`'s cross-ceiling arbitration seam for the cross-ceiling surfacing precedence and `masked` enumeration — the seam it binds via its `Deps` on `V16a`.

**Tests.**
- `INV-4` (NOCEIL-4 frame-depth seam: the 32-level `invoke`-chain bound is the only loom-level frame-depth ceiling): the per-chain depth counter (incremented before the child, crossing the subagent boundary, siblings independent) fires `loom/runtime/invoke-depth-exceeded` at 33 > 32 — surfacing in both separately-required modes: a top-level overflow as a Pi system note **and** a nested overflow surfaced to the parent as `Err(InvokeInfraError { cause: "panic", ... })` — with message `invoke chain depth exceeded: 33 > 32`. The counter is exercised across all three countable frame classes, including a cross-file `.warp fn` call chain (caller and callee in different source files, per `invocation.md` §INV-4) that reaches the 32-frame boundary and fires at 33 > 32.
- `loom/load/invocation-cycle`: a static-resolution cycle fires at parse time; an unresolvable callee is a leaf (undetected until fixed).

**Deps.** `V15b-T`, `V15a`, `V15c`, `V16a`

**Ships when.** `npm test` fires `invoke-depth-exceeded` at the 32-frame boundary in both surfacing modes — top-level overflow as a Pi system note and nested overflow surfaced to the parent as `Err(InvokeInfraError { cause: "panic", ... })` — and `invocation-cycle` on a static cycle.
