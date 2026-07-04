# `V20d` — Unimplemented lexer/parser diagnostics

**Convention.** [`conventions.md`](./conventions.md) (phase categories — production-wiring). Narrative spec references for the implementer: [`lexical.md`](../spec_topics/lexical.md), [`grammar.md`](../spec_topics/grammar.md), [`expressions.md`](../spec_topics/expressions.md), [`control-flow.md`](../spec_topics/control-flow.md), [`bindings.md`](../spec_topics/bindings.md). Closes no new spec REQ-ID.

**Adds.** **Bucket B (not implemented):** implements *and* wires the eight lexer/parser checks that appear nowhere in `src/**` today — two lexer checks (`unterminated-string`, `literal-newline-in-string`) and six parser checks (`comparison-chaining`, `statement-in-arm-body`, `match-guard-not-supported`, `rest-pattern-not-supported`, `mut-on-discard`, `assignment-as-expression`). It closes no new spec REQ-ID; each is an integration realisation of a registry code owned by an already-mapped code-keyed area (`cka-1` lexical on [`V1b`](./V1b-literals-and-paths.md); the parser codes on [`V3a`](./V3a-expression-evaluator.md) / [`V4a`](./V4a-match-result.md) / [`V3b`](./V3b-bindings.md)). The checks are added to the production lex/parse path with no module-level mutable state.

**Tests.**
- `loom/parse/unterminated-string`, `loom/parse/literal-newline-in-string`: the two lexer checks reject their malformed inputs in production (owned on [`V1b`](./V1b-literals-and-paths.md)).
- `loom/parse/comparison-chaining`: `a < b < c` is rejected (owned on [`V3a`](./V3a-expression-evaluator.md)).
- `loom/parse/statement-in-arm-body`, `loom/parse/match-guard-not-supported`: the two `match`-arm checks reject in production (owned on [`V4a`](./V4a-match-result.md)).
- `loom/parse/rest-pattern-not-supported`, `loom/parse/mut-on-discard`, `loom/parse/assignment-as-expression`: the three binding/assignment checks reject in production (owned on [`V3b`](./V3b-bindings.md)).
- `Convention:` (No globals, statics, singletons; Specific exception types only; Sequential by default) the new `src/**` checks pass the [`H2a`](./H2a-cross-cutting-gates.md) / [`H3a`](./H3a-di-seam-skeleton.md) gates and the `no-broad-catch` lint.

**Deps.** `V20d-T`, `V1a`, `V1b`, `V4a`, `V3b`, `V19a`

**Ships when.** `npm test` proves the eight lexer/parser checks fire in production — unterminated / newline-in string, comparison chaining, statement-in-arm, match guard, rest pattern, `mut` on discard, and assignment-as-expression — while `npm run typecheck` / `npm run lint` / the `src/**` architectural gates stay green.
