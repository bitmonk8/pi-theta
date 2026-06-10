# `V11f` — Binder cancellation, per-class retry budget, and failure taxonomy

**Spec.** [`../spec_topics/binder/determinism-cancellation-failure.md`](../spec_topics/binder/determinism-cancellation-failure.md), [`../spec_topics/hard-ceilings/ceilings-3-and-4.md`](../spec_topics/hard-ceilings/ceilings-3-and-4.md).

**Adds.** The binder per-class retry budget (hard ceiling #3), the four-class failure taxonomy with its six verbatim failure-mode templates, the cancellation forwarding into the binder call, and the surfaced most-recent-failure note.

**Tests.**
- `HC3-a`: at most one transport-class retry.
- `HC3-b`: at most one malformed-envelope retry.
- `HC3-c`: an AJV-on-args failure is not retried.
- `HC3-d`: at most three LLM calls per invocation (interleaving consumes class budget).
- `HC3-e`: the surfaced note is the most-recent failure row.
- The six failure templates render verbatim (`<provider>` = `Model.api`, `<ajv-summary>` = `<path> <message>` joined with `; `); ContextOverflow folds into the transport class.

**Deps.** `V11f-T`, `V11e`, `V9j`, `V16a`, `V17a`

**Ships when.** `npm test` asserts the per-class retry caps (≤3 calls) and the six verbatim templates.
