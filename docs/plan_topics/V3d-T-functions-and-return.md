# `V3d-T` — Functions and return (tests)

**Spec.** [`../spec_topics/functions.md`](../spec_topics/functions.md), [`../spec_topics/return.md`](../spec_topics/return.md).

**Adds.** Failing tests for the paired `V3d` implementation leaf.

**Tests.**
- `FN-1` ([functions.md — Placement](../spec_topics/functions.md#fn-1)): `fn` declarations are top-level only — a nested `fn` surfaces `loom/parse/nested-fn` and a function name used as a value surfaces `loom/parse/function-as-value`; hoisted mutual recursion between top-level `fn`s is allowed.
- `FN-2` ([functions.md — Documentation](../spec_topics/functions.md#fn-2)): a `fn`'s leading `///` doc comment is preserved on the AST as documentation only and does not lower into provider payloads.
- `FN-3`, `RET-1` ([return.md — return-type inference](../spec_topics/return.md#ret-1), [functions.md — Loom return type](../spec_topics/functions.md#loom-return-type)): an inferred return type matches the LUB of the body's tail/`return` operands, including the `?`-induced `Result` wrap; an explicit return annotation type-checks the tail and every `return` operand instead of inferring.
- `FN-4` ([functions.md — Empty-tail body](../spec_topics/functions.md#empty-tail-body)): an empty-tail function returns `null`; a `void` function discards its tail value; a `?`-bearing empty-tail body infers `Result<null, QueryError>`.
- `RET-2`, `RET-3` (`loom/parse/unreachable-code`, [return.md](../spec_topics/return.md#ret-2)): bare `return` is allowed only in a `void` function (`loom/parse/bare-return-in-non-void` elsewhere, including top-level); post-`return` code warns unreachable.
- `FN-5` ([functions.md — Final value](../spec_topics/functions.md#final-value-language-definition)): the function body's produced value is its final value at the function-result seam on success and is absent on fail/cancel.

**Deps.** `V3a`, `V4a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
