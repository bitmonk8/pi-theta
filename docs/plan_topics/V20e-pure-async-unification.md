# `V20e` — Pure/async evaluator unification

**Convention.** [`conventions.md`](./conventions.md) (phase categories — production-wiring/assembly). Narrative spec references for the implementer: [`implementation-notes.md`](../spec_topics/implementation-notes.md) (Runtime — the tree-walking statement-execution driver), [`expressions.md`](../spec_topics/expressions.md), [`control-flow.md`](../spec_topics/control-flow.md). Closes no new spec REQ-ID.

**Adds.** **Bucket C (architectural):** routes pure-position control forms through the real [`V19c`](./V19c-statement-executor.md) statement-executor instead of the producer's partial `evaluatePureExpression` ([`production-loom-producer.ts`](../../src/extension/production-loom-producer.ts)), retiring the `match`/effect `default: return null` safety net that makes a nested `match` (or an effectful expression) in a pure sub-expression position return `null`. It closes no new spec REQ-ID; it is an integration realisation of the `cka-50` tree-walking statement-execution driver owned on [`V19c`](./V19c-statement-executor.md), making the single executor the one evaluation path. The change stays constructor-injected with no module-level mutable state.

**Tests.**
- `Convention:` (pure/async evaluator unification) a nested `match` in a `match` arm body evaluates to the arm's result through the production dispatch (not `null`).
- `Convention:` (pure/async evaluator unification) an effectful expression (user-`fn` call, `@`-query) nested in a pure sub-expression position resolves through the [`V19c`](./V19c-statement-executor.md) executor.
- `Convention:` (No globals, statics, singletons; Specific exception types only; Sequential by default) the unified `src/**` evaluation path passes the [`H2a`](./H2a-cross-cutting-gates.md) / [`H3a`](./H3a-di-seam-skeleton.md) gates and the `no-broad-catch` lint.

**Deps.** `V20e-T`, `V4a`, `V19c`, `V19d`, `H8b`

**Ships when.** `npm test` proves a nested `match` in an arm body and an effectful expression in a pure sub-expression position evaluate through the [`V19c`](./V19c-statement-executor.md) executor (never `null`), with the partial pure-evaluator `default: return null` path removed, while `npm run typecheck` / `npm run lint` / the `src/**` architectural gates stay green.
