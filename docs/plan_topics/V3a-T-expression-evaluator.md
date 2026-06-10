# `V3a-T` — Expression evaluator and stdlib (tests)

**Spec.** [`../spec_topics/expressions.md`](../spec_topics/expressions.md).

**Adds.** Failing tests for the paired `V3a` implementation leaf.

**Tests.**
- [expressions.md — Operator precedence](../spec_topics/expressions.md#operator-precedence) (EXPR code-keyed area): operator precedence and associativity match the spec table.
- [expressions.md — Evaluation order and short-circuiting](../spec_topics/expressions.md#evaluation-order-and-short-circuiting) (EXPR code-keyed area): a short-circuited right operand's observable effect does not run.
- [expressions.md — `String.replace` reference vectors](../spec_topics/expressions.md#built-in-methods-and-properties) (EXPR code-keyed area): the five normative `replace` vectors reproduce exactly; `concat` returns the LUB element type.
- [expressions.md — Equality / Ordering / Other arithmetic](../spec_topics/expressions.md#other-arithmetic) (EXPR code-keyed area): cross-type `==` is `false`; `integer ⊑ number` widening and div/mod-by-zero produce `Inf`/`NaN` without panic.

**Deps.** `V2b`, `V2c`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
