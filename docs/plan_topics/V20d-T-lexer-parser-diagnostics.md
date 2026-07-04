# `V20d-T` — Unimplemented lexer/parser diagnostics (tests)

**Convention.** [`conventions.md`](./conventions.md) (phase categories — production-wiring). Narrative spec references for the implementer: [`lexical.md`](../spec_topics/lexical.md), [`grammar.md`](../spec_topics/grammar.md), [`expressions.md`](../spec_topics/expressions.md), [`control-flow.md`](../spec_topics/control-flow.md), [`bindings.md`](../spec_topics/bindings.md). Closes no new spec REQ-ID.

**Adds.** Failing tests for the paired [`V20d`](./V20d-lexer-parser-diagnostics.md) implementation leaf. **Bucket B (not implemented):** these registry codes appear nowhere in `src/**` — they are neither implemented nor wired — so malformed source is silently accepted. These tests drive the production lex/parse path and red today because the checks are absent.

**Tests.**
- `loom/parse/unterminated-string`: an unterminated string literal is rejected (lexer; owned on `cka-1` at [`V1b`](./V1b-literals-and-paths.md); reds today — absent).
- `loom/parse/literal-newline-in-string`: a literal newline inside a string literal is rejected (lexer; owned on [`V1b`](./V1b-literals-and-paths.md); reds today).
- `loom/parse/comparison-chaining`: a chained comparison `a < b < c` is rejected (parser; owned on [`V3a`](./V3a-expression-evaluator.md); reds today).
- `loom/parse/statement-in-arm-body`: a statement in a `match` arm body is rejected (parser; owned on [`V4a`](./V4a-match-result.md); reds today).
- `loom/parse/match-guard-not-supported`: a `match` arm guard is rejected (parser; owned on [`V4a`](./V4a-match-result.md); reds today).
- `loom/parse/rest-pattern-not-supported`: a rest pattern in a binding/destructure is rejected (parser; owned on [`V3b`](./V3b-bindings.md); reds today).
- `loom/parse/mut-on-discard`: `let mut _` is rejected (parser; owned on [`V3b`](./V3b-bindings.md); reds today).
- `loom/parse/assignment-as-expression`: an assignment used as an expression is rejected (parser; owned on [`V3b`](./V3b-bindings.md); reds today).

**Deps.** `V1a`, `V1b`, `V4a`, `V3b`, `V19a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason (the eight lexer/parser checks are absent from `src/**`, so the malformed source is silently accepted).
