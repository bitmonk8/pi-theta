# `V17c-T` — Checkpoint granularity (tests)

**Spec.** [`../spec_topics/cancellation.md`](../spec_topics/cancellation.md), [`../spec_topics/pi-integration-contract/host-interfaces-services.md`](../spec_topics/pi-integration-contract/host-interfaces-services.md).

**Adds.** Failing tests for the paired `V17c` implementation leaf.

**Tests.**
- Checkpoint granularity ([cancellation.md — *Granularity*](../spec_topics/cancellation.md); testability hook: the `Checkpoint` seam, `V8a`, [`host-interfaces-services.md#checkpoint-seam`](../spec_topics/pi-integration-contract/host-interfaces-services.md#checkpoint-seam)): drive the seam to assert a checkpoint fires immediately before each of the five sites — each `for`/`while` iteration, each `@`-query dispatch, each tool call, each `invoke`, and the slash-command argument binder's LLM call. A best-effort negative arm also asserts the seam witnesses no checkpoint at the non-checkpoint categories the test drives — inside a primitive operation (arithmetic, comparison, field/index access) and at a straight-line statement boundary; a checkpoint emitted at a node kind outside the test corpus is not caught by this assertion.
- Loop-iteration macrotask yield (cancellation.md — *Granularity*, the seam's `loop-iter` case): a signal flipped during a synchronous compute-bound `for`/`while` body is observed before the next iteration — i.e. the loop-iteration checkpoint yields one macrotask turn before reading the signal, so a Pi-dispatched abort (a macrotask) lands without a genuine `await` in the loop body.

**Deps.** `V17a`, `V8a`, `H4a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
