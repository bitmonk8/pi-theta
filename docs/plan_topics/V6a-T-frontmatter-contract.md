# `V6a-T` — Frontmatter field contract (tests)

**Spec.** [`../spec_topics/frontmatter.md`](../spec_topics/frontmatter.md), [`../spec_topics/frontmatter/frontmatter-fields-a.md`](../spec_topics/frontmatter/frontmatter-fields-a.md), [`../spec_topics/frontmatter/frontmatter-fields-b-and-templates.md`](../spec_topics/frontmatter/frontmatter-fields-b-and-templates.md).

**Adds.** Failing tests for the paired `V6a` implementation leaf.

**Tests.**
- A missing `mode:` fires its load-phase code; a valid `mode:` resolves.
- An unknown frontmatter key emits a warning and is tolerated.
- `loom/parse/timeout-field-rejected`: a per-call timeout field is rejected (NOCEIL-1 seam).

**Deps.** `V1a`, `V5a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
