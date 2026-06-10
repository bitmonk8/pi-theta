# `V4a-T` — `match`, `?`, and `Result` (tests)

**Spec.** [`../spec_topics/errors-and-results.md`](../spec_topics/errors-and-results.md), [`../spec_topics/errors-and-results/error-model.md`](../spec_topics/errors-and-results/error-model.md).

**Adds.** Failing tests for the paired `V4a` implementation leaf.

**Tests.**
- `ERR-18`: a `?` whose operand is not statically `Result<_, QueryError>` fires `question-on-non-result` (type phase).
- A `?` outside a `Result`-compatible scope fires `question-outside-result-fn`.
- `match` exhaustiveness over the six patterns; a non-matching value raises `MatchError`; arm result type is the LUB of arms.

**Deps.** `V2b`, `V3a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
