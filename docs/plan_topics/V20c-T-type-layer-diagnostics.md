# `V20c-T` — Type-layer diagnostics wiring and runtime string-index correction (tests)

**Convention.** [`conventions.md`](./conventions.md) (phase categories — production-wiring). Narrative spec references for the implementer: [`expressions.md`](../spec_topics/expressions.md) (Truthiness, indexing, stdlib), [`control-flow.md`](../spec_topics/control-flow.md) (`for`/`in`), [`functions.md`](../spec_topics/functions.md) (return LUB), [`type-system.md`](../spec_topics/type-system.md), [`runtime-value-model.md`](../spec_topics/runtime-value-model.md). Closes no new spec REQ-ID.

**Adds.** Failing tests for the paired [`V20c`](./V20c-type-layer-diagnostics.md) implementation leaf. **Bucket A (checkers now feedable)** plus **Bucket C (implemented wrongly):** the type-phase checkers exist but never ran in production for lack of a static type per expression (now supplied by [`V20b`](./V20b-static-type-inference.md)), and [`evaluateIndexAccess`](../../src/runtime/runtime-panics.ts) returns a character for `s[0]` instead of the spec's not-indexable error. These tests drive the production dispatch and red today because the checkers are unfed and the runtime string-index is wrong.

**Tests.**
- `loom/parse/non-boolean-condition`: `if 1` / `while 1` / a non-`boolean` ternary condition or `&&`/`||` operand fires the type-phase reject in production (integration witness of `cka-4` owned on [`V3a`](./V3a-expression-evaluator.md); reds today — `if 1` silently takes else).
- `loom/parse/non-array-iterand`: `for x in <non-array>` fires in production (owned on [`V3c`](./V3c-control-flow.md); reds today).
- `loom/parse/question-on-non-result`: `?` applied to a non-`Result` static type fires (owned on [`V4a`](./V4a-match-result.md); reds today).
- `loom/parse/question-outside-result-fn`: `?` outside a `Result`-returning function body fires (owned on [`V4a`](./V4a-match-result.md); reds today).
- `loom/parse/array-no-common-type`: an array literal whose elements share no common type fires (owned on [`V3a`](./V3a-expression-evaluator.md); reds today).
- `loom/parse/return-no-common-type`: a function whose `return` sites share no common type fires (owned on [`V3d`](./V3d-functions-and-return.md); reds today).
- `loom/parse/integer-narrowing`: a narrowing integer assignment/coercion fires (owned on [`V2b`](./V2b-type-compat-engine.md); reds today).
- `loom/parse/match-arm-type-mismatch`: `match` arms whose bodies share no common type fire (owned on [`V4a`](./V4a-match-result.md); reds today).
- `loom/parse/non-indexable-receiver`: indexing a non-indexable static type — including a `string` — fires (owned on [`V3a`](./V3a-expression-evaluator.md); reds today, string indexing is wrongly accepted).
- `loom/parse/non-string-object-index`: a non-`string` object index fires (owned on [`V3h`](./V3h-expression-stdlib-object.md); reds today).
- `loom/parse/non-string-array-join`: `array.join(<non-string>)` fires (owned on [`V3g`](./V3g-expression-stdlib-array.md); reds today).
- `Convention:` (runtime string-index correction — Bucket C) at runtime `s[0]` surfaces the not-indexable error rather than returning a character (owned on [`V4b`](./V4b-runtime-panics.md); reds today — a char is returned).

**Deps.** `V20b`, `V3a`, `V3c`, `V3f`, `V3g`, `V3h`, `V4a`, `V4b`, `V13b`, `V19c`

**Ships when.** The tests above exist, compile, and fail red for the intended reason (the type-phase checkers are not fed a per-expression static type in production, and the runtime string-index returns a character).
