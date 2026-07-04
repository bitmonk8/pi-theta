# `V20b-T` — Static type-inference substrate (tests)

**Convention.** [`conventions.md`](./conventions.md) (phase categories — assembly/production-wiring). Narrative spec references for the implementer: [`type-system.md`](../spec_topics/type-system.md), [`expressions.md`](../spec_topics/expressions.md), [`control-flow.md`](../spec_topics/control-flow.md), [`functions.md`](../spec_topics/functions.md). Closes no new spec REQ-ID.

**Adds.** Failing tests for the paired [`V20b`](./V20b-static-type-inference.md) implementation leaf. **Bucket B (engine absent):** there is a type-compatibility engine ([`V2b`](./V2b-type-compat-engine.md)'s `⊑`) but no whole-program pass that assigns a static type to every expression node, so the type-phase checkers ([`V20c`](./V20c-type-layer-diagnostics.md)) have nothing to run against in production. These tests exercise the new static-type-assignment pass over a parsed [`V19a`](./V19a-whole-program-parser.md) program (literal/identifier/binary/ternary/member/index/call/`match`/enum node kinds resolve to a static type; the pass surfaces an inferred-type map the checkers consume) and red today because the pass does not exist.

**Tests.**
- `Convention:` (static type-inference substrate — assembly seam) a whole-program pass over a parsed loom body assigns a static type to every expression node using the [`V2b`](./V2b-type-compat-engine.md) `⊑` engine, exposing an inferred-type lookup keyed by node; asserted over each expression node kind. Reds today — no such pass exists.
- `Convention:` (static type-inference substrate — assembly seam) the pass composes with the [`V19c`](./V19c-statement-executor.md) statement walk without altering runtime results (type-assignment is a read-only static pass). Reds today.

**Deps.** `V2b`, `V3a`, `V19a`, `V19c`

**Ships when.** The tests above exist, compile, and fail red for the intended reason (the whole-program static-type-assignment pass does not exist, so the inferred-type lookup is absent).
