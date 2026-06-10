# `V6b` — `params` and defaults

**Spec.** [`../spec_topics/frontmatter/frontmatter-fields-a.md`](../spec_topics/frontmatter/frontmatter-fields-a.md).

**Adds.** The `params:` contract: AJV validation, type-expression RHS (forward references), literal-sublanguage defaults, and the no-non-defaulted-after-defaulted ordering rule.

**Tests.**
- A non-defaulted param after a defaulted one fires `loom/parse/non-trailing-default`.
- A default that is not a loom literal fires `loom/parse/default-not-literal`.
- `params` are validated through AJV against their lowered schema.

**Deps.** `V6b-T`, `V6a`, `V5d`, `V8a`

**Ships when.** `npm test` validates `params`, enforces default ordering, and rejects non-literal defaults.
