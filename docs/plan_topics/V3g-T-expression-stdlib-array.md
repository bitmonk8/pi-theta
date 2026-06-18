# `V3g-T` — Expression stdlib members: `array<T>` (tests)

**Spec.** [`../spec_topics/expressions.md`](../spec_topics/expressions.md).

**Adds.** Failing tests for the paired `V3g` implementation leaf.

**Tests.**
- [expressions.md — `array<T>` stdlib members](../spec_topics/expressions.md#built-in-methods-and-properties) (EXPR code-keyed area): each loom-1.0 `array<T>` member reproduces its normative behaviour and return type — `length` is the element count, `join(sep)` concatenates string elements and a non-string element fires `loom/parse/non-string-array-join`, `includes(x)`/`indexOf(x)` use loom structural equality with `indexOf` returning `-1` when absent, and `slice(start, end?)` applies JS semantics including negative-index-from-end and exclusive `end`.

**Deps.** `V3a`, `V2c`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
