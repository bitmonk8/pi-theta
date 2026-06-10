# `V3d-T` — Functions and return (tests)

**Spec.** [`../spec_topics/functions.md`](../spec_topics/functions.md), [`../spec_topics/return.md`](../spec_topics/return.md).

**Adds.** Failing tests for the paired `V3d` implementation leaf.

**Tests.**
- [return.md — return-type inference](../spec_topics/return.md) (RET code-keyed area): an inferred return type matches the LUB of the body's tail/return operands, including the `?`-induced `Result` wrap.
- [return.md — empty-tail / `void`](../spec_topics/return.md) (RET code-keyed area): an empty-tail function returns `null`; a `void` function discards its tail value.
- `loom/parse/unreachable-code` (return.md — RET code-keyed area): `return` is checked against the declared type; bare `return` is allowed only in `void`; post-`return` code warns unreachable.
- [return.md — final-value contract](../spec_topics/return.md) (RET code-keyed area): the final value propagates to an `invoke`/subagent caller on success and is absent on fail/cancel.

**Deps.** `V3a`, `V4a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
