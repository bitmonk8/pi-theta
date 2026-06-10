# `V5c` — Descriptions (`///`)

**Spec.** [`../spec_topics/descriptions.md`](../spec_topics/descriptions.md).

**Adds.** `///` doc-comment attachment and lowering into `description:` (multi-line join with common-leading-whitespace strip, static text only, byte-for-byte emission); `//` is not propagated.

**Tests.**
- [descriptions.md — `///` lowering](../spec_topics/descriptions.md) (DESC code-keyed area): `///` above a schema/enum/field/variant lowers byte-for-byte into `description:`; a function `///` stays AST-only.
- `loom/parse/doc-comment-misplaced`: a `///` not above an eligible target fires.
- [descriptions.md — multi-line join](../spec_topics/descriptions.md) (DESC code-keyed area): multi-line `///` joins and strips common leading whitespace; `//` is not propagated.

**Deps.** `V5c-T`, `V5a`

**Ships when.** `npm test` asserts byte-for-byte `description:` lowering and `doc-comment-misplaced`.
