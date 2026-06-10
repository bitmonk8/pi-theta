# `V6b-T` — `params` and defaults (tests)

**Spec.** [`../spec_topics/frontmatter/frontmatter-fields-a.md`](../spec_topics/frontmatter/frontmatter-fields-a.md).

**Adds.** Failing tests for the paired `V6b` implementation leaf.

**Tests.**
- A non-defaulted param after a defaulted one fires `loom/parse/non-trailing-default`.
- A default that is not a loom literal fires `loom/parse/default-not-literal`.
- `params` are validated through AJV against their lowered schema.

**Deps.** `V6a`, `V5d`, `V8a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
