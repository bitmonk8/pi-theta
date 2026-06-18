# `V3h` — Expression stdlib members: `object`

**Spec.** [`../spec_topics/expressions.md`](../spec_topics/expressions.md).

**Adds.** The `object` standard-library member surface evaluated on top of the [`V3a`](./V3a-expression-evaluator.md) expression interpreter: the `object` members (`keys`, `values`, `has`).

**Tests.**
- [expressions.md — `object` stdlib members](../spec_topics/expressions.md#built-in-methods-and-properties) (EXPR code-keyed area): each loom-1.0 `object` member reproduces its normative behaviour and return type — `keys()` returns field names in schema declaration order for named schemas and insertion order otherwise, `values()` returns field values in the same order as `keys()`, and `has(k)` returns `false` for an unknown key without panic.

**Deps.** `V3h-T`, `V3a`, `V2c`

**Ships when.** `npm test` exercises every loom-1.0 `object` stdlib member against its normative behaviour and return type.
