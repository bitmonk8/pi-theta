# `M-T` — Minimal end-to-end `.loom` slash command (tests)

**Spec.** [`../spec_topics/overview.md`](../spec_topics/overview.md), [`../spec_topics/slash-invocation.md`](../spec_topics/slash-invocation.md), [`../spec_topics/discovery/discovery-sources.md`](../spec_topics/discovery/discovery-sources.md), [`../spec_topics/frontmatter/frontmatter-fields-a.md`](../spec_topics/frontmatter/frontmatter-fields-a.md) — the happy-path subset only.

**Adds.** The failing tests for the narrowest end-to-end pipeline: discover one `.loom` file from a single source — the fixture `.loom` supplied **in-memory by the `H4a` harness**, with no ambient `src/**` filesystem read — register it as a slash command, dispatch it, parse its `mode:` frontmatter, and issue a single untyped `@`-query whose assistant response appends as one prompt-mode turn to the caller's conversation.

**Tests.**
- `SLSH-2`: a dispatched prompt-mode loom issues one untyped `@`-query and streams its **assistant response** into the user session as one appended turn.
- `Convention:` (*Doc updates*) running the fixture loom through the harness produces exactly one appended turn and no diagnostic.

**Deps.** `H4a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
