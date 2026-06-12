# `V3e-T` — Expression stdlib members (tests)

**Spec.** [`../spec_topics/expressions.md`](../spec_topics/expressions.md).

**Adds.** Failing tests for the paired `V3e` implementation leaf.

**Tests.**
- [expressions.md — `String.replace` reference vectors](../spec_topics/expressions.md#built-in-methods-and-properties) (EXPR code-keyed area): the five normative `replace` vectors reproduce exactly; `concat` returns the LUB element type.
- [expressions.md — `string` stdlib members](../spec_topics/expressions.md#built-in-methods-and-properties) (EXPR code-keyed area): each loom-1.0 `string` member reproduces its normative behaviour and return type — `length` is the UTF-16 code-unit count, `toLowerCase()`/`toUpperCase()`/`trim()` return the locale-independent transforms, `startsWith(s)`/`endsWith(s)`/`includes(s)` return `boolean`, and `split(sep)` returns `array<string>` with the empty-separator case decomposing into one string per code unit.
- [expressions.md — `array<T>` stdlib members](../spec_topics/expressions.md#built-in-methods-and-properties) (EXPR code-keyed area): each loom-1.0 `array<T>` member reproduces its normative behaviour and return type — `length` is the element count, `join(sep)` concatenates string elements and a non-string element fires `loom/parse/non-string-array-join`, `includes(x)`/`indexOf(x)` use loom structural equality with `indexOf` returning `-1` when absent, and `slice(start, end?)` applies JS semantics including negative-index-from-end and exclusive `end`.
- [expressions.md — `object` stdlib members](../spec_topics/expressions.md#built-in-methods-and-properties) (EXPR code-keyed area): each loom-1.0 `object` member reproduces its normative behaviour and return type — `keys()` returns field names in schema declaration order for named schemas and insertion order otherwise, `values()` returns field values in the same order as `keys()`, and `has(k)` returns `false` for an unknown key without panic.

**Deps.** `V3a`, `V2c`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
