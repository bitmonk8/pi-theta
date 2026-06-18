# `V3f-T` — Expression stdlib members: `string` (tests)

**Spec.** [`../spec_topics/expressions.md`](../spec_topics/expressions.md).

**Adds.** Failing tests for the paired `V3f` implementation leaf.

**Tests.**
- [expressions.md — `String.replace` reference vectors](../spec_topics/expressions.md#built-in-methods-and-properties) (EXPR code-keyed area): the five normative `replace` vectors reproduce exactly; `concat` returns the LUB element type.
- [expressions.md — `string` stdlib members](../spec_topics/expressions.md#built-in-methods-and-properties) (EXPR code-keyed area): each loom-1.0 `string` member reproduces its normative behaviour and return type — `length` is the UTF-16 code-unit count, `toLowerCase()`/`toUpperCase()`/`trim()` return the locale-independent transforms, `startsWith(s)`/`endsWith(s)`/`includes(s)` return `boolean`, and `split(sep)` returns `array<string>` with the empty-separator case decomposing into one string per code unit.

**Deps.** `V3a`, `V2c`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
