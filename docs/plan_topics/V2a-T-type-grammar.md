# `V2a-T` — Type grammar and loom literal sublanguage (tests)

**Spec.** [`../spec_topics/grammar.md`](../spec_topics/grammar.md), [`../spec_topics/type-system.md`](../spec_topics/type-system.md).

**Adds.** Failing tests for the paired `V2a` implementation leaf.

**Tests.**
- `loom/parse/generic-arity-mismatch`, `loom/parse/void-in-non-return-position`, `loom/parse/result-in-schema-position`: type-grammar violations fire.
- `loom/parse/default-not-literal`, `loom/parse/tool-arg-not-literal`, `loom/parse/missing-object-field`: literal-sublanguage violations fire.
- `loom/parse/array-no-common-type`: an `[]` with no resolving sink fires (a `for` iterand is not a sink).

**Deps.** `V1a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
