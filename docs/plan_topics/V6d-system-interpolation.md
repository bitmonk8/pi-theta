# `V6d` — `system` template interpolation

**Spec.** [`../spec_topics/frontmatter/frontmatter-fields-b-and-templates.md`](../spec_topics/frontmatter/frontmatter-fields-b-and-templates.md), [`../spec_topics/expressions.md`](../spec_topics/expressions.md).

**Adds.** The subagent-only `system:` field with Path-only `${…}` interpolation (reusing the expression sublanguage entry, filtered), the `\${` escape, and the stringification table.

**Tests.**
- The four `loom/parse/system-interp-*` codes fire on their respective interpolation violations.
- `\${` escapes interpolation; a Path-only `${…}` resolves and stringifies per the table.
- `system:` on a prompt-mode loom is rejected.

**Deps.** `V6d-T`, `V6a`, `V3a`, `V13a`

**Ships when.** `npm test` interpolates `system:`, fires the four `system-interp-*` codes, and honours `\${`.
