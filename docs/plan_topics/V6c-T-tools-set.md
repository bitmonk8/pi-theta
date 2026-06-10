# `V6c-T` — `tools` callable set and resolution snapshot (tests)

**Spec.** [`../spec_topics/frontmatter/frontmatter-fields-a.md`](../spec_topics/frontmatter/frontmatter-fields-a.md).

**Adds.** Failing tests for the paired `V6c` implementation leaf.

**Tests.**
- A prompt-mode `.loom` callee in `tools:` is rejected at load time.
- A `tools:` name collision fires its code; `as` rename resolves.
- The resolved callable set is frozen (no ambient inheritance); both YAML spellings parse.

**Deps.** `V6a`, `V15a`, `V9f`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
