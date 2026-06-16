# `V3a` — Expression evaluator

**Spec.** [`../spec_topics/expressions.md`](../spec_topics/expressions.md).

**Adds.** The expression interpreter: literals, identifier resolution (local > fn > import > callable), operators with precedence/associativity, boolean-only truthiness, left-to-right short-circuit with skipped-operand observability, arithmetic widening (`integer ⊑ number`), div/mod-by-zero → `Inf`/`NaN` with no integer-overflow panic, ordering (NaN unordered → false), and object/array construction. The `string`/`array<T>`/`object` stdlib members build on this interpreter in [`V3e`](./V3e-expression-stdlib.md).

**Tests.**
- [expressions.md — Operator precedence](../spec_topics/expressions.md#operator-precedence) (EXPR code-keyed area): operator precedence and associativity match the spec table.
- [expressions.md — Evaluation order and short-circuiting](../spec_topics/expressions.md#evaluation-order-and-short-circuiting) (EXPR code-keyed area): a short-circuited right operand's observable effect does not run.
- [expressions.md — Equality / Ordering / Other arithmetic](../spec_topics/expressions.md#other-arithmetic) (EXPR code-keyed area): cross-type `==` is `false`; `integer ⊑ number` widening and div/mod-by-zero produce `Inf`/`NaN` without panic.

**Deps.** `V3a-T`, `V2b`, `V2c`

**Ships when.** `npm test` evaluates the expression fixtures, proves short-circuit observability, and asserts the precedence/associativity table and the equality/ordering/arithmetic-widening behaviour against the spec.
