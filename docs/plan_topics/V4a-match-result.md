# `V4a` — `match`, `?`, and `Result`

**Spec.** [`../spec_topics/errors-and-results.md`](../spec_topics/errors-and-results.md), [`../spec_topics/errors-and-results/error-model.md`](../spec_topics/errors-and-results/error-model.md).

**Adds.** The `match` statement (exhaustive destructuring over the six pattern forms, per-arm LUB, `MatchError`), the `Result`/`Ok`/`Err` type, and the `?` operator (Ok-unwrap / Err early-return desugaring to `return Err(e)`) with its static preconditions.

**Tests.**
- `ERR-18`: a `?` whose operand is not statically `Result<_, QueryError>` fires `question-on-non-result` (type phase).
- A `?` outside a `Result`-compatible scope fires `question-outside-result-fn`.
- `match` exhaustiveness over the six patterns; a non-matching value raises `MatchError`; arm result type is the LUB of arms.

**Deps.** `V4a-T`, `V2b`, `V3a`

**Ships when.** `npm test` proves `?` desugaring, `question-on-non-result`, and `match` exhaustiveness.
