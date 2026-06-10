# `V6d-T` — `system` template interpolation (tests)

**Spec.** [`../spec_topics/frontmatter/frontmatter-fields-b-and-templates.md`](../spec_topics/frontmatter/frontmatter-fields-b-and-templates.md), [`../spec_topics/expressions.md`](../spec_topics/expressions.md).

**Adds.** Failing tests for the paired `V6d` implementation leaf.

**Tests.**
- The four `loom/parse/system-interp-*` codes fire on their respective interpolation violations.
- `\${` escapes interpolation; a Path-only `${…}` resolves and stringifies per the table.
- `system:` on a prompt-mode loom is rejected.

**Deps.** `V6a`, `V3a`, `V13a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
