# `V11j` — Binder-call cancellation forwarding

**Spec.** [`../spec_topics/cancellation.md`](../spec_topics/cancellation.md), [`../spec_topics/binder/determinism-cancellation-failure.md`](../spec_topics/binder/determinism-cancellation-failure.md).

**Adds.** In-flight binder-call cancellation forwarding: `ctx.signal` forwarded into the binder's provider invocation as `options.signal` on the initial attempt and every budgeted retry, and the cancelled-binder system note that surfaces when an abort lands before or during the binder call. Built on `V11f`'s per-class retry machinery (the baseline for the budgeted-retry abort case) and `V17a`'s `Checkpoint` seam (both listed in `Deps`).

**Tests.**
- Binder-call cancellation forwarding ([cancellation.md — *Granularity* binder-call clause](../spec_topics/cancellation.md) and [*Surfacing* cancelled-binder arm](../spec_topics/cancellation.md#surfacing); [determinism-cancellation-failure.md — *Cancellation*](../spec_topics/binder/determinism-cancellation-failure.md)): land an abort *during* the binder's in-flight provider call through the `Checkpoint` seam (available via `Deps. V17a`) — distinct from the pre-call `binder-call` checkpoint abort `V17c` owns (the `binder-call` `CheckpointKind` firing immediately before the binder's LLM call is issued, per [host-interfaces-services.md PIC-10](../spec_topics/pi-integration-contract/host-interfaces-services.md#pic-10) and the *Granularity* binder-call clause linked above) — and assert the cancelled-binder system note (`loom /<name>: argument binding cancelled`) surfaces and the loom does not run (no `Result` reaches loom code). An abort observed during a budgeted *retry* of the binder call must also surface the cancelled-binder note immediately, so the bullet is not satisfied by the initial-attempt path alone.

**Deps.** `V11j-T`, `V11f`, `V17a`, `V17c`

**Ships when.** `npm test` asserts that an abort during the in-flight binder call — on the initial attempt or a budgeted retry — surfaces the cancelled-binder note (`loom /<name>: argument binding cancelled`) while the loom does not run (no `Result` reaches loom code).
