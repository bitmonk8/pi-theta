# `V6a` — Frontmatter field contract

**Spec.** [`../spec_topics/frontmatter.md`](../spec_topics/frontmatter.md), [`../spec_topics/frontmatter/frontmatter-fields-a.md`](../spec_topics/frontmatter/frontmatter-fields-a.md), [`../spec_topics/frontmatter/frontmatter-fields-b-and-templates.md`](../spec_topics/frontmatter/frontmatter-fields-b-and-templates.md).

**Adds.** The YAML frontmatter parser with defaults, required `mode:`, model/`bind_*` resolution hooks, and unknown-key tolerance emitted as a warning (forward-compat seam).

**Tests.**
- A missing `mode:` fires its load-phase code; a valid `mode:` resolves.
- An unknown frontmatter key emits a warning and is tolerated.
- `loom/parse/timeout-field-rejected`: a per-call timeout field is rejected (NOCEIL-1 seam).

**Deps.** `V6a-T`, `V1a`, `V5a`

**Ships when.** `npm test` parses frontmatter, requires `mode:`, and tolerates unknown keys as warnings.
