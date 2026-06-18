# `V3f` — Expression stdlib members: `string`

**Spec.** [`../spec_topics/expressions.md`](../spec_topics/expressions.md).

**Adds.** The `string` standard-library member surface evaluated on top of the [`V3a`](./V3a-expression-evaluator.md) expression interpreter: the `String.replace` reference vectors and `concat`, plus the `string` members (`length`, `toLowerCase`/`toUpperCase`/`trim`, `startsWith`/`endsWith`/`includes`, `split`).

**Tests.**
- [expressions.md — `String.replace` reference vectors](../spec_topics/expressions.md#built-in-methods-and-properties) (EXPR code-keyed area): the five normative `replace` vectors reproduce exactly; `concat` returns the LUB element type.
- [expressions.md — `string` stdlib members](../spec_topics/expressions.md#built-in-methods-and-properties) (EXPR code-keyed area): each loom-1.0 `string` member reproduces its normative behaviour and return type — `length` is the UTF-16 code-unit count, `toLowerCase()`/`toUpperCase()`/`trim()` return the locale-independent transforms, `startsWith(s)`/`endsWith(s)`/`includes(s)` return `boolean`, and `split(sep)` returns `array<string>` with the empty-separator case decomposing into one string per code unit.

**Deps.** `V3f-T`, `V3a`, `V2c`

**Ships when.** `npm test` reproduces the five `replace` vectors and exercises every loom-1.0 `string` stdlib member against its normative behaviour and return type.
