# `V11f` — Binder cancellation, per-class retry budget, and failure taxonomy

**Spec.** [`../spec_topics/binder/determinism-cancellation-failure.md`](../spec_topics/binder/determinism-cancellation-failure.md), [`../spec_topics/hard-ceilings/ceilings-3-and-4.md`](../spec_topics/hard-ceilings/ceilings-3-and-4.md).

**Adds.** The binder per-class retry budget (hard ceiling #3), the four-class failure taxonomy with its six verbatim failure-mode templates, the cancellation forwarding into the binder call, and the surfaced most-recent-failure note. At its ceiling-#3 first-enforcement point (slash-load) this leaf **consults** `V16a`'s cross-ceiling arbitration seam for the cross-ceiling surfacing precedence and `masked` enumeration — the seam it binds via its `Deps` on `V16a`.

**Tests.**
- `HC3-a`: at most one transport-class retry.
- `HC3-b`: at most one malformed-envelope retry.
- `HC3-c`: an AJV-on-args failure is not retried.
- `HC3-d`: at most three LLM calls per invocation (interleaving consumes class budget).
- `HC3-e`: the surfaced note is the most-recent failure row.
- The six failure templates render verbatim (`<provider>` = `Model.api`, `<ajv-summary>` = `<path> <message>` joined with `; `); ContextOverflow folds into the transport class.
- Binder-call cancellation forwarding ([cancellation.md — *Granularity* binder-call clause](../spec_topics/cancellation.md) and [*Surfacing* cancelled-binder arm](../spec_topics/cancellation.md#surfacing); [determinism-cancellation-failure.md — *Cancellation*](../spec_topics/binder/determinism-cancellation-failure.md)): land an abort *during* the binder's in-flight provider call through the `Checkpoint` seam (available via `Deps. V17a`) — distinct from the pre-binder pre-call abort `V17a` owns — and assert the cancelled-binder system note (`loom /<name>: argument binding cancelled`) surfaces and the loom does not run (no `Result` reaches loom code). An abort observed during a budgeted *retry* of the binder call must also surface the cancelled-binder note immediately, so the bullet is not satisfied by the initial-attempt path alone.

**Deps.** `V11f-T`, `V11e`, `V9j`, `V16a`, `V17a`

**Ships when.** `npm test` asserts the per-class retry caps (≤3 calls), the six verbatim templates, and that an abort during the in-flight binder call — on the initial attempt or a budgeted retry — surfaces the cancelled-binder note while the loom does not run.
