# `V15b` — Invoke depth bound and cycle detection

**Spec.** [`../spec_topics/invocation.md`](../spec_topics/invocation.md), [`../spec_topics/hard-ceilings/ceilings-3-and-4.md`](../spec_topics/hard-ceilings/ceilings-3-and-4.md).

**Adds.** The `invoke`-chain depth bound (hard ceiling #1, cap 32) counting direct `invoke`, `.loom`-via-`tools:`, and cross-file `.warp fn` frames, and the parse-time invocation-cycle detector over the static-resolution graph. This leaf instruments the `.warp fn` call site to increment the shared per-chain counter and classifies a fn's residence by its declaration `.warp` file (cross-file vs intra-file) per [`invocation.md`](../spec_topics/invocation.md) §INV-4, resolving residence through `V15c`/`V15i` re-exports and aliased imports. At its ceiling-#1 first-enforcement point (`invoke` entry) this leaf **consults** `V16a`'s cross-ceiling arbitration seam for the cross-ceiling surfacing precedence and `masked` enumeration — the seam it binds via its `Deps` on `V16a`.

**Tests.**
- `INV-4` (NOCEIL-4 frame-depth seam: the 32-level `invoke`-chain bound is the only loom-level frame-depth ceiling): the per-chain depth counter (incremented before the child, crossing the subagent boundary, siblings independent) fires `loom/runtime/invoke-depth-exceeded` at 33 > 32 — surfacing in both separately-required modes: a top-level overflow as a Pi system note **and** a nested overflow surfaced to the parent as `Err(InvokeInfraError { cause: "panic", ... })` — with message `invoke chain depth exceeded: 33 > 32`. The single boundary chain that trips the cap mixes all three countable frame classes within one chain — at least one direct `invoke(...)` frame, one `.loom`-via-`tools:` frame, and one cross-file `.warp fn` frame (caller and callee in different source files, per `invocation.md` §INV-4) — so each frame kind's contribution to the single shared per-chain counter is observed at the 32-frame boundary as that chain reaches 33 > 32.
- `loom/load/invocation-cycle`: a static-resolution cycle fires at parse time; an unresolvable callee is a leaf (undetected until fixed).

**Deps.** `V15b-T`, `V3a`, `V3d`, `V15a`, `V15c`, `V15i`, `V16a`

**Ships when.** `npm test` fires `invoke-depth-exceeded` at the 32-frame boundary in both surfacing modes — top-level overflow as a Pi system note and nested overflow surfaced to the parent as `Err(InvokeInfraError { cause: "panic", ... })` — and `invocation-cycle` on a static cycle.
