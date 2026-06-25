# `V17c-T` — Checkpoint granularity (tests)

**Spec.** [`../spec_topics/cancellation.md`](../spec_topics/cancellation.md), [`../spec_topics/pi-integration-contract/host-interfaces-services.md`](../spec_topics/pi-integration-contract/host-interfaces-services.md).

**Adds.** Failing tests for the paired `V17c` implementation leaf.

**Tests.**
- Checkpoint granularity ([cancellation.md — *Granularity*](../spec_topics/cancellation.md), [`coverage-matrix.md`](./coverage-matrix.md) code-keyed-area token `cka-47`, `V17c` facet; testability hook: the `Checkpoint` seam, `V8a`, [`host-interfaces-services.md#checkpoint-seam`](../spec_topics/pi-integration-contract/host-interfaces-services.md#checkpoint-seam)): drive the seam to assert a checkpoint fires immediately before each of the two cycle-free sites this leaf owns — each `for`/`while` iteration (the loop site [`V3c`](./V3c-control-flow.md) introduces) and the slash-command argument binder's LLM call (the binder-inference site [`V9j`](./V9j-binder-inference-provider-mapping.md) introduces). The `@`-query-dispatch, tool-call, and `invoke` per-site checkpoint-presence arms are distributed to [`V13c`](./V13c-query-tool-loop.md), [`V14a`](./V14a-tool-calls.md), and [`V15a`](./V15a-invocation-core.md) respectively — each lands after `V17c` via the `V4f` chain and carries its own `cka-47` facet-naming checkpoint-before-site test, so this suite does not require those site constructs to exist. A best-effort negative arm also asserts the seam witnesses no checkpoint at the non-checkpoint categories the test drives — inside a primitive operation (arithmetic, comparison, field/index access) and at a straight-line statement boundary; a checkpoint emitted at a node kind outside the test corpus is not caught by this assertion.
- Loop-iteration macrotask yield (cancellation.md — *Granularity*, the seam's `loop-iter` case): a signal flipped during a synchronous compute-bound `for`/`while` body is observed before the next iteration — i.e. the loop-iteration checkpoint yields one macrotask turn before reading the signal, so a Pi-dispatched abort (a macrotask) lands without a genuine `await` in the loop body.

**Deps.** `V17a`, `V8a`, `V3c`, `V9j`, `H4a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
