# `V20e-T` — Pure/async evaluator unification (tests)

**Convention.** [`conventions.md`](./conventions.md) (phase categories — production-wiring/assembly). Narrative spec references for the implementer: [`implementation-notes.md`](../spec_topics/implementation-notes.md) (Runtime — the tree-walking statement-execution driver), [`expressions.md`](../spec_topics/expressions.md), [`control-flow.md`](../spec_topics/control-flow.md). Closes no new spec REQ-ID.

**Adds.** Failing tests for the paired [`V20e`](./V20e-pure-async-unification.md) implementation leaf. **Bucket C (architectural):** the producer's `evaluatePureExpression` ([`production-loom-producer.ts`](../../src/extension/production-loom-producer.ts)) is a partial evaluator parallel to the [`V19c`](./V19c-statement-executor.md) statement-executor; its `match`/effect cases fall to a `default: return null`, so a control form (e.g. a nested `match`) in a pure sub-expression position — such as a `match` arm body — returns `null`. These tests drive the production dispatch and red today because pure-position control forms are not routed through the real executor.

**Tests.**
- `Convention:` (pure/async evaluator unification) a nested `match` in a `match` arm body evaluates to the arm's result through the production dispatch, not `null`. Reds today — the partial pure evaluator returns `null`.
- `Convention:` (pure/async evaluator unification) an effectful expression (user-`fn` call, `@`-query) nested in a pure sub-expression position resolves through the [`V19c`](./V19c-statement-executor.md) executor rather than the partial evaluator's `null` safety net. Reds today.

**Deps.** `V4a`, `V19c`, `V19d`, `H8b`

**Ships when.** The tests above exist, compile, and fail red for the intended reason (pure-position control/effect forms hit the partial evaluator's `default: return null` instead of the real statement-executor).
