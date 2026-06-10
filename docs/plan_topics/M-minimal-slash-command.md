# `M` — Minimal end-to-end `.loom` slash command

**Spec.** [`../spec_topics/overview.md`](../spec_topics/overview.md), [`../spec_topics/slash-invocation.md`](../spec_topics/slash-invocation.md), [`../spec_topics/discovery/discovery-sources.md`](../spec_topics/discovery/discovery-sources.md), [`../spec_topics/frontmatter/frontmatter-fields-a.md`](../spec_topics/frontmatter/frontmatter-fields-a.md) — the happy-path subset only.

**Adds.** The smallest end-to-end vertical: a fixed single-source discovery, a `registerCommand` call, a `mode:`-only frontmatter read, and a body consisting of a single untyped `@`-query (of the form `` @`<literal>` ``) whose assistant response streams as one prompt-mode turn. Full discovery, frontmatter, lexing, and conversation-drive contracts are deepened by the `V*` slices; this leaf implements only the happy path.

**Tests.**
- `SLSH-2`: a real `pi /<name>` dispatch through the harness streams the untyped query's **assistant response** into the user session as one appended prompt-mode turn.

**Deps.** `M-T`, `H4a`

**Ships when.** Running `pi /<name>` on a fixture `.loom` in a harness Pi session streams the query's assistant response as one conversation turn in the Pi session.
