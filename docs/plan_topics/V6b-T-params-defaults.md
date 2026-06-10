# `V6b-T` — `params` and defaults (tests)

**Spec.** [`../spec_topics/frontmatter/frontmatter-fields-a.md`](../spec_topics/frontmatter/frontmatter-fields-a.md).

**Adds.** Failing tests for the paired `V6b` implementation leaf.

**Tests.**
- A non-defaulted param after a defaulted one fires its parse code.
- A default that is not a loom literal fires `default-not-literal`.
- `params` are validated through AJV against their lowered schema.

**Deps.** `V6a`, `V5d`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
