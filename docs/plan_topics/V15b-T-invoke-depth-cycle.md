# `V15b-T` — Invoke depth bound and cycle detection (tests)

**Spec.** [`../spec_topics/invocation.md`](../spec_topics/invocation.md), [`../spec_topics/hard-ceilings/ceilings-3-and-4.md`](../spec_topics/hard-ceilings/ceilings-3-and-4.md).

**Adds.** Failing tests for the paired `V15b` implementation leaf.

**Tests.**
- `INV-4` (NOCEIL-4 frame-depth seam: the 32-level `invoke`-chain bound is the only loom-level frame-depth ceiling): the per-chain depth counter (incremented before the child, crossing the subagent boundary, siblings independent) fires `loom/runtime/invoke-depth-exceeded` at 33 > 32 — surfacing in both separately-required modes: a top-level overflow as a Pi system note **and** a nested overflow surfaced to the parent as `Err(InvokeInfraError { cause: "panic", ... })` — with message `invoke chain depth exceeded: 33 > 32`. The single boundary chain that trips the cap mixes all three countable frame classes within one chain — at least one direct `invoke(...)` frame, one `.loom`-via-`tools:` frame, and one cross-file `.warp fn` frame (caller and callee in different source files, per `invocation.md` §INV-4) — so each frame kind's contribution to the single shared per-chain counter is observed at the 32-frame boundary as that chain reaches 33 > 32.
- `loom/load/invocation-cycle`: a static-resolution cycle fires at parse time; an unresolvable callee is a leaf (undetected until fixed).

**Deps.** `V15a`, `V15c`, `V16a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
