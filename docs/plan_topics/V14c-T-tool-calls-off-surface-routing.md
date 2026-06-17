# `V14c-T` — Code-side tool-call off-surface outcome routing (tests)

**Spec.** [`../spec_topics/tool-calls.md`](../spec_topics/tool-calls.md), [`../spec_topics/cancellation.md`](../spec_topics/cancellation.md).

**Adds.** Failing tests for the paired `V14c` implementation leaf.

**Tests.**
- Off-surface outcome routing — the four off-surface outcomes each surface on their own channel, not all on `loom/runtime/internal-error`: a pre-eval setup throw → `{isError:true}` + one `loom/runtime/internal-error` diagnostic; a non-conforming return shape → `loom/runtime/internal-error{tool-return-shape}`; a non-settling promise → blocks at its `await` until `loomAbort.signal` fires and surfaces via the `cause:"cancelled"` path (no `internal-error`); a post-cancel late settlement → discarded per CNCL-1/CNCL-2/CNCL-3 (no `internal-error`).

**Deps.** `V14a`, `V8a`, `V4d`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
