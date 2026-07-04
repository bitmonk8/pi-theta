# `V20b` — Static type-inference substrate

**Convention.** [`conventions.md`](./conventions.md) (phase categories — assembly/production-wiring). Narrative spec references for the implementer: [`type-system.md`](../spec_topics/type-system.md), [`expressions.md`](../spec_topics/expressions.md), [`control-flow.md`](../spec_topics/control-flow.md), [`functions.md`](../spec_topics/functions.md). Closes no new spec REQ-ID.

**Adds.** **Bucket B (engine absent):** the whole-program static-type pass missing between [`V2b`](./V2b-type-compat-engine.md)'s type-compatibility engine and the type-phase checkers — a read-only walk over a parsed [`V19a`](./V19a-whole-program-parser.md) program that assigns a static type to every expression node (literal, identifier, binary, ternary, member, index, call, `match`, enum, `Ok`/`Err`) and publishes an inferred-type lookup the type-layer checkers ([`V20c`](./V20c-type-layer-diagnostics.md)) consume. It closes no new spec REQ-ID; it is the substrate that makes the existing type-phase diagnostics runnable in production. The pass is constructor-injected over the [`V2b`](./V2b-type-compat-engine.md) engine with no module-level mutable state; it is the seam [`V20c`](./V20c-type-layer-diagnostics.md) binds against.

**Tests.**
- `Convention:` (static type-inference substrate) the pass assigns a static type to every expression node kind over a parsed loom body via the [`V2b`](./V2b-type-compat-engine.md) `⊑` engine and exposes a per-node inferred-type lookup.
- `Convention:` (static type-inference substrate) the pass is read-only — running it before the [`V19c`](./V19c-statement-executor.md) statement walk does not alter any runtime result.
- `Convention:` (No globals, statics, singletons; Specific exception types only; Sequential by default) the new `src/**` pass passes the [`H2a`](./H2a-cross-cutting-gates.md) / [`H3a`](./H3a-di-seam-skeleton.md) gates and the `no-broad-catch` lint.

**Deps.** `V20b-T`, `V2b`, `V3a`, `V19a`, `V19c`

**Ships when.** `npm test` proves a whole-program pass assigns a static type to every expression node of a parsed loom body and publishes the inferred-type lookup the type-layer checkers consume, while `npm run typecheck` / `npm run lint` / the `src/**` architectural gates stay green.
