# `V5c-T` — Descriptions (`///`) (tests)

**Spec.** [`../spec_topics/descriptions.md`](../spec_topics/descriptions.md).

**Adds.** Failing tests for the paired `V5c` implementation leaf.

**Tests.**
- [descriptions.md — `///` lowering](../spec_topics/descriptions.md) (DESC code-keyed area): `///` above a schema/enum/field/variant lowers byte-for-byte into `description:`; a function `///` stays AST-only.
- `loom/parse/doc-comment-misplaced`: a `///` not above an eligible target fires.
- [descriptions.md — multi-line join](../spec_topics/descriptions.md) (DESC code-keyed area): multi-line `///` joins and strips common leading whitespace; `//` is not propagated.

**Deps.** `V5a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
