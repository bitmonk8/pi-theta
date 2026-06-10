# `V4a` — `match`, `?`, and `Result`

**Spec.** [`../spec_topics/errors-and-results.md`](../spec_topics/errors-and-results.md), [`../spec_topics/errors-and-results/error-model.md`](../spec_topics/errors-and-results/error-model.md).

**Adds.** The `match` statement (exhaustive destructuring over the six pattern forms, per-arm LUB, `MatchError`), the `Result`/`Ok`/`Err` type, and the `?` operator (Ok-unwrap / Err early-return desugaring to `return Err(e)`) with its static preconditions.

**Tests.**
- `ERR-18`: a `?` whose operand is not statically `Result<_, QueryError>` fires `question-on-non-result` (type phase).
- A `?` outside a `Result`-compatible scope fires `question-outside-result-fn`.
- `loom/parse/match-arm-type-mismatch`: a `match` whose arm bodies share no common upper bound under [Type System — Type compatibility](../spec_topics/type-system.md#type-compatibility) fires `loom/parse/match-arm-type-mismatch` (type phase); a well-typed `match` resolves to the LUB of its arms.
- `loom/runtime/match-error`: a value matching none of the six pattern forms raises the runtime `loom/runtime/match-error` panic (`MatchError`; loom 1.0 does not statically check exhaustiveness), while a value matching one of the six pattern forms — wildcard / identifier / literal / constructor / object-schema / array — binds and evaluates the selected arm. `V4b` also closes `loom/runtime/match-error`; co-asserted here.

**Deps.** `V4a-T`, `V2b`, `V3a`

**Ships when.** `npm test` proves `?` desugaring, `question-on-non-result`, and `match` exhaustiveness.
