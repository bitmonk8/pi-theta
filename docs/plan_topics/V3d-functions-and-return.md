# `V3d` — Functions and return

**Spec.** [`../spec_topics/functions.md`](../spec_topics/functions.md), [`../spec_topics/return.md`](../spec_topics/return.md).

**Adds.** Top-level `fn` declarations (hoisted; no nested functions, closures, or functions-as-values), tail-expression returns, return-type inference (LUB under `⊑`, `Result`-wrap on a `?`/`Result` operand), empty-tail → `null`, `void` discard, the final-value contract, and `return expr` / bare-`return`-in-`void` / post-return unreachable-warning rules.

**Tests.**
- [return.md — return-type inference](../spec_topics/return.md) (RET code-keyed area): an inferred return type matches the LUB of the body's tail/return operands, including the `?`-induced `Result` wrap.
- [return.md — empty-tail / `void`](../spec_topics/return.md) (RET code-keyed area): an empty-tail function returns `null`; a `void` function discards its tail value.
- `loom/parse/unreachable-code` (return.md — RET code-keyed area): `return` is checked against the declared type; bare `return` is allowed only in `void`; post-`return` code warns unreachable.
- [return.md — final-value contract](../spec_topics/return.md) (RET code-keyed area): the final value propagates to an `invoke`/subagent caller on success and is absent on fail/cancel.

**Deps.** `V3d-T`, `V3a`, `V4a`

**Ships when.** `npm test` asserts return inference (including `?`-wrap), empty-tail `null`, and final-value propagation.
