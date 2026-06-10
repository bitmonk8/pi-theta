# `V17a-T` — Cancellation core (tests)

**Spec.** [`../spec_topics/cancellation.md`](../spec_topics/cancellation.md), [`../spec_topics/pi-integration-contract/host-interfaces-core.md`](../spec_topics/pi-integration-contract/host-interfaces-core.md).

**Adds.** Failing tests for the paired `V17a` implementation leaf.

**Tests.**
- `CNCL-1`: a late tool-call value does not rebind its call site.
- `CNCL-2`: no second `Err` is produced per invocation.
- `CNCL-3`: no second `RuntimeEvent` is produced per invocation.
- `CNCL-4`: abort-reason propagation — after each of the three forwarding paths fires, land an abort via the `Checkpoint` seam (`V8a`) and assert `loomAbort.signal.reason === source.reason` at the downstream checkpoint (reason identity, not merely `aborted`); the first source's reason wins under the one-shot guard. For the reason-less `agent_end` slash-command trigger, assert the synthesised `Error.message` is byte-exact `"loom cancelled by agent_end"`. (The `"loom cancelled by session shutdown"` synthesised-reason facet is asserted in `V9g`, whose handler produces it.)
- `CNCL-5`: no retroactive rewrite of a completed `Ok` — land an abort via the `Checkpoint` seam after an operation returns `Ok(v)` but before the next checkpoint; assert the value is retained and not rewritten to `Err({kind:"cancelled"})`.
- `CNCL-6`: no top-level synthesis on tail abort — land an abort in a pure tail after the final cancellable operation, so no further checkpoint executes; assert the top-level result is the produced value and no synthesised top-level `cancelled` appears.
- `loom/parse/timeout-field-rejected` (cancellation.md — CNCL area): cancellation forwards via `loomAbort` (never `ctx.signal` directly); propagates downward only; a swallowing handler suppresses the late side-channel; `loom/parse/timeout-field-rejected` fires on a timeout field.
- Checkpoint granularity ([cancellation.md — *Granularity*](../spec_topics/cancellation.md); testability hook: the `Checkpoint` seam, `V8a`, [`host-interfaces-services.md#checkpoint-seam`](../spec_topics/pi-integration-contract/host-interfaces-services.md#checkpoint-seam)): drive the seam to assert a checkpoint fires immediately before each of the five sites — each `for`/`while` iteration, each `@`-query dispatch, each tool call, each `invoke`, and the slash-command argument binder's LLM call — and at no other site. The exhaustivity arm asserts *absence*: the seam witnesses no checkpoint inside a primitive operation (arithmetic, comparison, field/index access) and none at a straight-line statement boundary, not merely presence at the five.
- Loop-iteration macrotask yield (cancellation.md — *Granularity*, the seam's `loop-iter` case): a signal flipped during a synchronous compute-bound `for`/`while` body is observed before the next iteration — i.e. the loop-iteration checkpoint yields one macrotask turn before reading the signal, so a Pi-dispatched abort (a macrotask) lands without a genuine `await` in the loop body.

**Deps.** `V8a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
