# `V11j-T` — Binder-call cancellation forwarding (tests)

**Spec.** [`../spec_topics/cancellation.md`](../spec_topics/cancellation.md), [`../spec_topics/binder/determinism-cancellation-failure.md`](../spec_topics/binder/determinism-cancellation-failure.md).

**Adds.** Failing tests for the paired `V11j` implementation leaf.

**Tests.**
- Binder-call cancellation forwarding ([cancellation.md — *Granularity* binder-call clause](../spec_topics/cancellation.md) and [*Surfacing* cancelled-binder arm](../spec_topics/cancellation.md#surfacing); [determinism-cancellation-failure.md — *Cancellation*](../spec_topics/binder/determinism-cancellation-failure.md)): land an abort *during* the binder's in-flight provider call through the `Checkpoint` seam (available via `Deps. V17a`) — distinct from the pre-call `binder-call` checkpoint abort `V17c` owns (the `binder-call` `CheckpointKind` firing immediately before the binder's LLM call is issued, per [host-interfaces-services.md PIC-10](../spec_topics/pi-integration-contract/host-interfaces-services.md#pic-10) and the *Granularity* binder-call clause linked above) — and assert the cancelled-binder system note (`loom /<name>: argument binding cancelled`) surfaces and the loom does not run (no `Result` reaches loom code). An abort observed during a budgeted *retry* of the binder call must also surface the cancelled-binder note immediately, so the bullet is not satisfied by the initial-attempt path alone.

**Deps.** `V11f`, `V17a`, `V17c`, `H4b`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
