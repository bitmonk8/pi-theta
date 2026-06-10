# `V6b` — `params` and defaults

**Spec.** [`../spec_topics/frontmatter/frontmatter-fields-a.md`](../spec_topics/frontmatter/frontmatter-fields-a.md).

**Adds.** The `params:` contract: AJV validation, type-expression RHS (forward references), literal-sublanguage defaults, and the no-non-defaulted-after-defaulted ordering rule.

**Tests.**
- A non-defaulted param after a defaulted one fires its parse code.
- A default that is not a loom literal fires `default-not-literal`.
- `params` are validated through AJV against their lowered schema.

**Deps.** `V6b-T`, `V6a`, `V5d`

**Ships when.** `npm test` validates `params`, enforces default ordering, and rejects non-literal defaults.
