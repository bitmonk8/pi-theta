# `V6c` — `tools` callable set and resolution snapshot

**Spec.** [`../spec_topics/frontmatter/frontmatter-fields-a.md`](../spec_topics/frontmatter/frontmatter-fields-a.md).

**Adds.** The `tools:` callable set: Pi-tool and `.loom` entries, `as` rename, name-collision detection, the frozen resolution snapshot, the two YAML spellings, and the default for absent/empty `tools:`. Load-time rejection of prompt-mode `.loom` callees lands here.

**Tests.**
- A prompt-mode `.loom` callee in `tools:` is rejected at load time.
- A `tools:` name collision fires its code; `as` rename resolves.
- The resolved callable set is frozen (no ambient inheritance); both YAML spellings parse.

**Deps.** `V6c-T`, `V6a`, `V15a`, `V9f`

**Ships when.** `npm test` resolves `tools:`, rejects a prompt-mode callee, and freezes the snapshot.
