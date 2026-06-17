# `V14c` — Code-side tool-call off-surface outcome routing

**Spec.** [`../spec_topics/tool-calls.md`](../spec_topics/tool-calls.md), [`../spec_topics/cancellation.md`](../spec_topics/cancellation.md).

**Adds.** The routing of the four off-surface code-tool execution outcomes — a pre-eval setup throw, a non-conforming return shape, a non-settling promise, and a post-cancel late settlement — each onto its own channel rather than all onto `loom/runtime/internal-error`, building on the [`V14a`](./V14a-tool-calls.md) code-side `execute()` machinery and `CodeToolError`.

**Tests.**
- Off-surface outcome routing — the four off-surface outcomes each surface on their own channel, not all on `loom/runtime/internal-error`: a pre-eval setup throw → `{isError:true}` + one `loom/runtime/internal-error` diagnostic; a non-conforming return shape → `loom/runtime/internal-error{tool-return-shape}`; a non-settling promise → blocks at its `await` until `loomAbort.signal` fires and surfaces via the `cause:"cancelled"` path (no `internal-error`); a post-cancel late settlement → discarded per CNCL-1/CNCL-2/CNCL-3 (no `internal-error`).

**Deps.** `V14c-T`, `V14a`, `V8a`, `V4d`

**Ships when.** `npm test` asserts each of the four off-surface code-tool outcomes surfaces on its own channel — a pre-eval setup throw → `{isError:true}` + one `loom/runtime/internal-error` diagnostic; a non-conforming return shape → `loom/runtime/internal-error{tool-return-shape}`; a non-settling promise → blocks at its `await` until `loomAbort.signal` fires and surfaces via the `cause:"cancelled"` path (no `internal-error`); a post-cancel late settlement → discarded per CNCL-1/CNCL-2/CNCL-3 (no `internal-error`).
