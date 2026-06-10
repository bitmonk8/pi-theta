# `V5b-T` — Discriminated unions, recursion, and cycle detection (tests)

**Spec.** [`../spec_topics/schemas.md`](../spec_topics/schemas.md).

**Adds.** Failing tests for the paired `V5b` implementation leaf.

**Tests.**
- `loom/parse/non-string-discriminator`, `loom/parse/ambiguous-discriminator`, `loom/parse/missing-discriminator`, `loom/parse/duplicate-discriminator`, `loom/parse/nested-discriminator`: discriminator violations fire.
- `loom/parse/by-on-object-schema`: `by` on an object schema fires.
- `loom/parse/type-alias-cycle`: a non-object alias cycle fires; an object-hop cycle is accepted.

**Deps.** `V5a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
