# `V3h-T` — Expression stdlib members: `object` (tests)

**Spec.** [`../spec_topics/expressions.md`](../spec_topics/expressions.md).

**Adds.** Failing tests for the paired `V3h` implementation leaf.

**Tests.**
- [expressions.md — `object` stdlib members](../spec_topics/expressions.md#built-in-methods-and-properties) (EXPR code-keyed area): each loom-1.0 `object` member reproduces its normative behaviour and return type — `keys()` returns field names in schema declaration order for named schemas and insertion order otherwise, `values()` returns field values in the same order as `keys()`, and `has(k)` returns `false` for an unknown key without panic.

**Deps.** `V3a`, `V2c`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
