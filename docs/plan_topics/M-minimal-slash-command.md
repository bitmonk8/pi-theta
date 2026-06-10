# `M` — Minimal end-to-end `.loom` slash command

**Spec.** [`../spec_topics/overview.md`](../spec_topics/overview.md), [`../spec_topics/slash-invocation.md`](../spec_topics/slash-invocation.md), [`../spec_topics/discovery/discovery-sources.md`](../spec_topics/discovery/discovery-sources.md), [`../spec_topics/frontmatter/frontmatter-fields-a.md`](../spec_topics/frontmatter/frontmatter-fields-a.md) — the happy-path subset only.

**Adds.** The smallest end-to-end vertical: a fixed single-source discovery, a `registerCommand` call, a `mode:`-only frontmatter read, and a body consisting of a single untyped `@`-query (of the form `` @`<literal>` ``) whose assistant response streams as one prompt-mode turn. The fixture `.loom` this single-source discovery reads is supplied **in-memory by the `H4a` harness** (the harness's in-memory fixture-supply mechanism — see [`H4a`](./H4a-factory-shell-and-harness.md)); this harness-supplied source is the **only** source `M`'s discovery reads — there is no ambient `src/**` filesystem read and no filesystem fallback, so `M` needs no `FileSystem` seam (`V8b`) dependency and the `H3a` ambient-access scan stays clean. This harness-supplied discovery path diverges from the production filesystem-backed discovery walk deepened by [`V10a`](./V10a-discovery-walk.md). Full discovery, frontmatter, lexing, and conversation-drive contracts are deepened by the `V*` slices; this leaf implements only the happy path.

**Tests.**
- `SLSH-2`: a real `pi /<name>` dispatch through the harness streams the untyped query's **assistant response** into the user session as one appended prompt-mode turn.

**Deps.** `M-T`, `H4a`

**Ships when.** Running `pi /<name>` on a fixture `.loom` in a harness Pi session streams the query's assistant response as one conversation turn in the Pi session.
