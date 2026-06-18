# `V3g` — Expression stdlib members: `array<T>`

**Spec.** [`../spec_topics/expressions.md`](../spec_topics/expressions.md).

**Adds.** The `array<T>` standard-library member surface evaluated on top of the [`V3a`](./V3a-expression-evaluator.md) expression interpreter: the `array<T>` members (`length`, `join`, `includes`/`indexOf`, `slice`).

**Tests.**
- [expressions.md — `array<T>` stdlib members](../spec_topics/expressions.md#built-in-methods-and-properties) (EXPR code-keyed area): each loom-1.0 `array<T>` member reproduces its normative behaviour and return type — `length` is the element count, `join(sep)` concatenates string elements and a non-string element fires `loom/parse/non-string-array-join`, `includes(x)`/`indexOf(x)` use loom structural equality with `indexOf` returning `-1` when absent, and `slice(start, end?)` applies JS semantics including negative-index-from-end and exclusive `end`.

**Deps.** `V3g-T`, `V3a`, `V2c`

**Ships when.** `npm test` exercises every loom-1.0 `array<T>` stdlib member against its normative behaviour and return type.
