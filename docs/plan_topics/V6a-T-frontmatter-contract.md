# `V6a-T` — Frontmatter field contract (tests)

**Spec.** [`../spec_topics/frontmatter.md`](../spec_topics/frontmatter.md), [`../spec_topics/frontmatter/frontmatter-fields-a.md`](../spec_topics/frontmatter/frontmatter-fields-a.md), [`../spec_topics/frontmatter/frontmatter-fields-b-and-templates.md`](../spec_topics/frontmatter/frontmatter-fields-b-and-templates.md).

**Adds.** Failing tests for the paired `V6a` implementation leaf.

**Tests.**
- A missing `mode:` fires `loom/load/missing-mode`; a valid `mode:` resolves.
- An unknown frontmatter key fires `loom/load/unknown-frontmatter-field` (severity `W`) and is tolerated.
- `loom/parse/timeout-field-rejected`: a per-call timeout field is rejected (NOCEIL-1 seam).
- `loom/load/model-unresolved`: a present `model:` value resolving to no available model (a non-string scalar, a malformed reference, a reference matching no available model, or a bare `modelId` ambiguous across providers) fails the load and the loom is not registered; the test drives the parser's model-resolution hook through the model-reference-matcher injection seam `V6a` defines (the concrete matcher binds `V11a`'s shared resolution contract — loom's own exact-match resolver over `ctx.modelRegistry.getAvailable()` — see `V6a` Adds) ([frontmatter-fields-a.md `model` row](../spec_topics/frontmatter/frontmatter-fields-a.md)).

**Deps.** `V1a`, `V5a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
