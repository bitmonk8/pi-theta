# pi-loom — Consolidated Spec Review

_Generated: 2026-05-04T14:08:47Z_
_Source: docs/reviews/spec-review/spec-20260504-144255.md_
_35 findings retained, 1 false positives dropped, 0 persistent failures_

---

## spec.md (Index Page)

---

# Preamble coins three jargon terms before defining them

**Source:** docs/reviews/spec-review/spec-20260504-144255.md
**Original heading:** Preamble — undefined and ambiguous jargon
**Kind:** clarity

## Finding

The first paragraph of `spec.md` introduces three coined phrases without inline
definitions, and at least one is genuinely ambiguous in isolation:

1. **"code/model boundary"** — undefined on first use. A reader cannot tell
   whether this names a Pi-runtime concept, an LLM API boundary, or the
   spec's own conceptual frame. The term is unpacked later in
   `spec_topics/overview.md` ("Code and Model" subsection), but the preamble
   does not signpost that.
2. **"model-side text emissions"** — actively misleading. By analogy with
   "client-side"/"server-side", the natural reading is *text emitted by the
   model*, but the intended meaning is *text emitted by the loom and
   destined for the model*. The companion phrase "code-side control flow"
   in `overview.md` only shifts the asymmetry: there "code-side" means
   *executed on the runtime side*, while "model-side" means *targeted at
   the model side*. Two different uses of `-side` in adjacent clauses.
3. **"conversational injections"** — undefined. Could plausibly mean tool
   results, transcript-history edits, prompt-fragment splicing, or new
   user/assistant turns. `overview.md` clarifies that the intended meaning
   is *new turns added to a conversation*, but again the preamble does not
   say so.

The preamble is the first prose any reader sees and the only prose a
casual visitor (or another agent skimming for a one-line description) is
likely to read. Three undefined terms in two sentences is enough friction
that the preamble fails its job as a quick orientation.

## Spec Documents

- `spec.md` — preamble paragraph (edited)
- `spec_topics/overview.md` — Overview + "Code and Model" subsection (read-only; provides the canonical definitions the preamble should align with)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

The preamble is marketing-flavoured framing prose. No plan leaf grounds
acceptance criteria in its wording, and no normative behaviour depends
on it.

## Consequence

**Severity:** cosmetic

The spec's normative content (in topic files) is unaffected, so
implementers will not produce diverging behaviour. The cost is purely
reader-experience: the index page reads as jargon-laden, and a reader
who stops at the preamble walks away with at least one wrong mental
model ("the model emits the text"). No downstream artefact breaks.

## Solution Space

**Shape:** single

### Recommendation

Rewrite the preamble paragraph in `spec.md` to either define each term
inline on first use or replace it with unambiguous phrasing. A concrete
target:

> `pi-loom` is a [Pi Coding Agent](https://pi.dev) extension that
> introduces a purpose-built scripting language for authoring
> parameterised, programmatic templates that drive an LLM conversation.
> A `.loom` file interleaves ordinary code (variables, loops,
> conditionals, functions) with literal text destined for the model;
> evaluating a loom does not return a value or write a file — it appends
> turns to a conversation (the *caller's* current conversation in
> `prompt` mode, or a *fresh isolated* conversation in `subagent` mode).
> See [Overview](./spec_topics/overview.md) for the full conceptual model.

Edge cases for the implementer:

- Keep the link to `overview.md` so readers who want the full model know
  where to go.
- Do not introduce new normative claims here that the topic pages do
  not already make. The preamble must remain summary-only; behavioural
  rules belong in topic files.
- Mention both modes (`prompt` / `subagent`) by name in the preamble so
  the "appends turns to *which* conversation" question is answered at
  the index level, not deferred.
- Avoid reintroducing "model-side" and "code-side" as paired adjectives
  unless both are given the same `-side` semantics. Replacing them with
  "ordinary code" + "literal text destined for the model" sidesteps the
  problem.

## Related Findings

- "Preamble — `.loom` and `.warp` relationship unclear" — co-resolve (same paragraph; one preamble rewrite can fix both)
- "Preamble — reading-guidance modal vague" — same-cluster (different paragraph in the same preamble; can be resolved in the same edit pass but the wording change is independent)

---

# Preamble does not establish the `.loom` / `.warp` relationship

**Source:** docs/reviews/spec-review/spec-20260504-144255.md
**Original heading:** Preamble — `.loom` and `.warp` relationship unclear
**Kind:** clarity

## Finding

`spec.md` introduces the project entirely in terms of `.loom` files: the preamble names only `.loom`, and the orientation bullets describe loom semantics without mentioning `.warp`. Several lines later the **Language** section header reads "Surface and semantics of the `.loom` / `.warp` languages" — a plural that strongly implies two distinct languages share this section. The next time `.warp` appears is on the **Imports** bullet, well below the fold, with no orienting sentence.

A reader of the index page therefore has no way to tell whether `.warp` is (a) a sibling language with its own grammar, (b) a dialect/profile of `.loom`, or (c) the same language under a different file extension. The actual answer — established only inside `spec_topics/imports.md` — is the third: `.warp` files share Loom's grammar and type system but are restricted to top-level `import`/`export`/`schema`/`fn` declarations and are never slash-discovered. That single fact is load-bearing for understanding why the spec keeps cross-referencing both extensions, and it belongs on the index, not buried three clicks deep.

## Spec Documents

- `spec.md` — Preamble and Language section header (edited)
- `spec_topics/imports.md` — `.warp` file rules (read-only, source of truth being summarised)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

## Consequence

**Severity:** cosmetic

A reader of the index forms either no model or a wrong model of `.warp` until they reach `imports.md`. No implementer is blocked and no behaviour diverges, but the index fails its stated job of orienting a fresh reader before they pick a topic.

## Solution Space

**Shape:** single

### Recommendation

Add one sentence to the preamble immediately after the existing first paragraph, and tighten the Language section header.

Preamble addition (new second paragraph, before the "split into focused topic pages" sentence):

> Loom code lives in two file extensions that share a single grammar and type system: `.loom` files are invocable as slash commands; `.warp` files are library modules — restricted to top-level `import`, `export`, `schema`, and `fn` declarations — that `.loom` files import via `import { … } from "./x.warp"`. `.warp` files are never directly invoked. See [Imports](./spec_topics/imports.md) for the full rules.

Language section header change:

> ## Language
>
> Surface and semantics of the Loom language (shared by `.loom` and `.warp` files).

This removes the misleading plural "languages" without losing the signal that both extensions are covered by the section. Edge case for the implementer: keep the wording aligned with `imports.md` — do not introduce a third synonym ("module", "package") that is not already used there.

## Related Findings

- "Preamble — undefined and ambiguous jargon" — same-cluster (same paragraph, independent fix)
- "Preamble — reading-guidance modal vague" — same-cluster (same preamble block, independent fix)
- "'Woven artifact' — undefined term, used once and abandoned" — same-cluster (another index-level vocabulary gap, independent fix)

---

# Preamble's reading-guidance sentence lacks normative force

**Source:** docs/reviews/spec-review/spec-20260504-144255.md
**Original heading:** Preamble — reading-guidance modal vague
**Kind:** clarity

## Finding

The third sentence of `spec.md` reads: "Each page stands alone — an implementer of a single feature only needs to read the topics referenced by their plan task." The sentence carries the entire reading-discipline contract for the spec — it tells implementers (human and agent) that they may scope their reading to a plan leaf's `Spec` field — but it is phrased descriptively, not normatively. Two readings are equally available:

1. **Prescriptive guarantee:** topic pages are authored to be self-contained, so unreferenced topics are safe to skip.
2. **Bare sufficiency claim:** in some unspecified sense the referenced topics "are enough," with no commitment from authors to keep them self-contained going forward.

Reading (1) shapes how an implementing agent allocates its context window; reading (2) leaves the agent unable to decide whether skipping is correct or merely tolerated. The same ambiguity propagates to `plan.md:3`, which mirrors the wording. Without a normative anchor, future spec edits have no rule to enforce — a topic that quietly grows a load-bearing reference into another topic violates nothing.

## Spec Documents

- `spec.md` — Preamble (paragraph 2) (edited)
- `plan.md` — opening paragraph (read-only; mirrors the spec wording but not edited as part of this finding)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

The sentence governs reader behaviour, not implementation behaviour. No leaf's acceptance criteria depend on it.

## Consequence

**Severity:** advisory

Implementing agents cannot tell whether topic pages are guaranteed self-contained or merely usually-sufficient, so they either over-read (defensive context bloat) or under-read (silent miss of a load-bearing cross-reference). Future spec authors have no normative rule to point at when reviewing PRs that add hidden cross-topic dependencies.

## Solution Space

**Shape:** single

### Recommendation

Replace the second paragraph's second sentence with two sentences that separate the authoring contract from the reader's permission:

> Each topic page is authored to be self-contained: any rule it depends on from another topic must be either stated locally or explicitly cross-linked. An implementer MAY therefore restrict their reading to the topics listed under their plan leaf's **Spec** field.

Edge cases for the implementer of this fix:

- Use RFC 2119 `MAY` (lowercased "may" is acceptable; the spec does not yet declare an RFC 2119 convention, so either is fine, but be consistent with whatever the rest of the spec uses).
- Apply the same rewording to `plan.md`'s opening paragraph so the two documents stay aligned; this is a follow-up edit, not part of this finding's surface.
- Do not promise that topics are short or non-overlapping — only that cross-topic dependencies are surfaced.

## Related Findings

- "Preamble — undefined and ambiguous jargon" — co-resolve (same paragraph; one editing pass on the preamble fixes both)
- "Preamble — `.loom` and `.warp` relationship unclear" — same-cluster (adjacent preamble prose; resolves independently but in the same edit window)

---

## spec_topics/pi-integration-contract.md

---

# `resources_discover` is a contribution event, not an inbound path feed

**Source:** docs/reviews/spec-review/spec-20260504-144255.md
**Original heading:** `resources_discover` misused as inbound discovery source
**Kind:** codebase-grounding-broad, doc-alignment-broad, assumptions

## Finding

`spec_topics/pi-integration-contract.md` step 1 says the extension "subscribes to `resources_discover` to collect `.loom` and `.warp` paths from every Pi discovery source," and the later "Discovery API" paragraph repeats that the extension "uses Pi's standard `resources_discover` event to enumerate sources, mirroring the prompt-template discovery pattern." Both readings invert how the event actually works.

In `@mariozechner/pi-coding-agent`, `resources_discover` is a **contribution** event. The handler receives `ResourcesDiscoverEvent = { type: "resources_discover", cwd, reason }` and returns `ResourcesDiscoverResult` whose only fields are `skillPaths?`, `promptPaths?`, `themePaths?` — paths the extension hands **to** Pi. Pi never pushes a list of conventional roots back to the extension through this event. There is no `loomPaths` field, so even the contribution direction is closed for looms specifically: Pi cannot load `.loom` files for the extension regardless of which side initiates.

The consequence for the spec's discovery story is concrete. The five sources in `discovery.md` (CLI flag, settings array, project `.pi/looms/`, packages, global `~/.pi/agent/looms/`) must all be walked by the extension itself: there is no Pi-supplied enumeration to consume. The `resources_discover` event remains useful, but only as a **re-discovery trigger**: Pi fires it at startup with `reason: "startup"` and after `/reload` with `reason: "reload"`, and the handler uses `event.cwd` to scope the project-local source. The contract section needs to describe that flow rather than the imaginary one it currently describes.

## Spec Documents

- `spec_topics/pi-integration-contract.md` — "Extension entry point" step 1 and "Discovery API" paragraph (edited)
- `spec_topics/discovery.md` — read-only; its source list is correct and unaffected (read-only)
- `spec_topics/pi-integration.md` — read-only; high-level summary stays accurate (read-only)

## Plan Impact

**Phases:** Horizontal, MVP, Vertical V14, Vertical V18

**Leaves (implementation order):**

- H4 — Pi extension shell — (modified)
- M — Minimal end-to-end loom — (modified)
- V14k — Discovery: global `~/.pi/agent/looms/` — (modified)
- V14l — Discovery: project `.pi/looms/` — (modified)
- V14m — Discovery: package `looms/` and `pi.looms` — (modified)
- V14n — Discovery: settings `looms` array — (modified)
- V14o — Discovery: `--loom` CLI flag — (modified)
- V14p — Source priority and shadowing warning — (modified)
- V14q — Cross-format slash collision — (modified)
- V18f — File watcher (chokidar) over discovery roots — (modified)

## Consequence

**Severity:** correctness

An implementer following the spec literally would wire a `pi.on("resources_discover", …)` handler expecting a list of paths in the event payload, find none, and either (a) ship a broken extension that registers zero looms, or (b) reverse-engineer the actual mechanism and produce an ad-hoc enumerator that diverges from a sibling implementation doing the same. The discovery rules in `discovery.md` are correct but unreachable until the contract describes the right plumbing.

## Solution Space

**Shape:** single

### Recommendation

Rewrite the two affected passages in `pi-integration-contract.md` so the extension owns enumeration and the event is only a re-trigger. Concretely:

1. Replace step 1 of "Extension entry point" with: "Walks the conventional loom sources (CLI flag, settings, project `.pi/looms/`, packages, global `~/.pi/agent/looms/`) on startup and on every `resources_discover` event. The event payload (`{ cwd, reason }`) supplies the project root for the project-local source and distinguishes initial scan (`reason: "startup"`) from reload (`reason: "reload"`); the event delivers no paths from Pi."

2. Replace the "Discovery API" paragraph with a one-sentence statement that the extension subscribes to `resources_discover` solely as a re-discovery trigger, returning the empty result `{}` (since `ResourcesDiscoverResult` has no `loomPaths` field — looms are exposed through `pi.registerCommand`, not as a Pi-managed resource type).

3. Cross-link `discovery.md` for the source list and priority rules; do not duplicate them in the contract.

Implementer edge cases to flag:
- The event's `cwd` should be preferred over a captured-at-startup `cwd` so that a future per-session cwd change is honoured on reload.
- `reason: "reload"` is also fired after `ctx.reload()` from the `_loom-reload` watcher command (V18f), so the same handler covers both Pi-initiated and watcher-initiated rediscovery; do not register a second listener.
- The handler must still return a result object (even if empty) to satisfy the typed return; returning `undefined` is allowed but `{}` is clearer.

## Related Findings

- "Discovery source failure modes partly unspecified" — co-resolve (the rewritten enumeration step is the natural place to specify per-source failure handling)
- "Extension entry point path is wrong" — same-cluster (another factual error in the same `pi-integration-contract.md` factory description)
- "Hot-reload via `ctx.reload()` causes full extension teardown" — decision-dependency (the rediscovery-on-reload story in this finding constrains how the watcher's reload path is described)
- "Discovery directory tree example contradicts documented path" — same-cluster (separate discovery-surface error, resolves independently)
- "`pi.looms` package.json key is not Pi-recognized" — same-cluster (also a discovery-surface grounding issue, resolves independently)

---

# Typed-query one-shot tools cannot be unregistered — Pi has no `unregisterTool` API

**Source:** docs/reviews/spec-review/spec-20260504-144255.md
**Original heading:** No `pi.unregisterTool()` API — one-shot tools accumulate
**Kind:** doc-alignment-broad

## Finding

`spec_topics/pi-integration-contract.md` (Conversation drive — prompt mode) prescribes that every typed query "register a synthesised one-shot tool (`__loom_respond_<schema-hash>`) … just before the query and unregistered immediately after." The same mechanism is reused on the spawned `AgentSession` in subagent mode.

The Pi `ExtensionAPI` exposes `registerTool`, `getActiveTools`, `getAllTools`, `setActiveTools`, and `unregisterProvider` — but no `unregisterTool`. There is no public method, undocumented sibling, or registry-mutation hook that removes a tool definition once it has been registered. The "unregister immediately after" clause is therefore unimplementable as written.

The consequences compound across a session: every distinct query schema would permanently add an entry to Pi's global tool registry (visible in `pi.getAllTools()`, in `/tools` listings, and in any UI surface that enumerates tools). In prompt mode the leakage is process-global because Pi's tool registry is shared across all extensions. The synthesised tool also remains callable by the model on subsequent turns of the user's session unless something separately removes it from the active set.

## Spec Documents

- `spec_topics/pi-integration-contract.md` — Conversation drive — prompt mode (edited)
- `spec_topics/pi-integration-contract.md` — Conversation drive — subagent mode (edited)
- `spec_topics/query.md` — typed-form mechanics (read-only)
- `spec_topics/implementation-notes.md` — runtime notes on AJV / schema cache (option-dependent; only edited if cleanup hooks land here)

## Plan Impact

**Phases:** MVP, Vertical V6, Vertical V12, Vertical V18

**Leaves (implementation order):**

- M — Minimal end-to-end loom — (read-only context; only untyped queries land here, but the prompt-mode driver scaffold introduced here will host the registration helpers later)
- V6i — AJV validation of typed query results — (modified; this is the leaf that first registers `__loom_respond_<hash>` and forces tool-use)
- V12a — `mode: subagent` accepted; AgentSession spawn — (modified; subagent typed queries reuse the same one-shot mechanism, but on the spawned session may use `customTools` instead of `pi.registerTool`)
- V18f — File watcher (chokidar) over discovery roots — (modified; reload path must clear or tolerate accumulated registrations)
- V18h — Custom Pi message type `loom-system-note` and renderer — (read-only; cleanup-on-shutdown notes may use this channel)

## Consequence

**Severity:** correctness

Two implementers will diverge: one will register a fresh tool per query (registry grows unboundedly, model can spuriously call stale `__loom_respond_*` tools on later turns), another will skip registration and rely solely on `tool_choice` injection (works on Anthropic/OpenAI but the result-handling path differs). Either way the spec text cannot be implemented literally, and the gap will surface only when developers test long-running sessions and notice `/tools` filling up with `__loom_respond_<hash>` entries.

## Solution Space

**Shape:** multiple

### Option A — Hash-keyed dedup + active-set toggling (prompt mode)

- **Approach.** Treat `__loom_respond_<schema-hash>` as content-addressed: maintain a per-extension `Map<hash, registered>`; on first encounter call `pi.registerTool` once; on every subsequent typed query with the same schema, reuse the existing registration. Around each query, snapshot `pi.getActiveTools()`, call `pi.setActiveTools([...snapshot, respondToolName])`, force `tool_choice` via `before_provider_request`, run the query, then restore the snapshot via `pi.setActiveTools(snapshot)`. Subscribe to `session_shutdown` and `resources_discover` (`reason: "reload"`) to drop the cache; the registry entries themselves stay until process exit but stop being exposed once deactivated.
- **Spec edits.** Replace "registered just before the query and unregistered immediately after" in `pi-integration-contract.md` with a description of the registration cache, the active-set save/restore protocol, and the explicit acknowledgement that Pi's tool registry has no removal API in V1. Document that schema-hash collisions are intended to share one registration.
- **Pros.** Implementable today; bounded growth (one registration per distinct lowered schema, typically a small number per extension lifetime); model never sees stale `__loom_respond_*` tools on free-generation turns.
- **Cons.** `pi.getAllTools()` still shows accumulated entries (cosmetic for `/tools` listings); requires careful save/restore to interoperate with other extensions that may be mutating the active set concurrently.
- **Risks.** Race between `setActiveTools` and an in-flight turn from another extension; need to confine the toggle to the loom's own forced-tool turn and accept that interleaving is impossible because Pi runs turns sequentially per session.

### Option B — Subagent-mode `customTools` only (no global registration)

- **Approach.** In subagent mode, pass the synthesised tool through `createAgentSession({ customTools: [respondTool], ... })`. The tool exists only in the spawned session and dies with it — no global registry mutation needed. In prompt mode this option does not apply; prompt-mode typed queries still need Option A.
- **Spec edits.** Split the contract into prompt-mode and subagent-mode variants. Subagent mode: register via `customTools`. Prompt mode: register globally per Option A.
- **Pros.** Subagent path is clean and per-invocation isolated; matches the rest of the subagent isolation story (private session, in-memory transcript).
- **Cons.** Asymmetric implementation between modes; doesn't solve prompt mode at all (which is where the user actually sees `/tools` accumulation).
- **Risks.** Spec readers must internalise the asymmetry; missing `customTools` support for tool-call-loop coordination needs verification against the Pi SDK semantics for `customTools` + `tool_choice`.

### Option C — Petition Pi for `unregisterTool`

- **Approach.** File a feature request against `@mariozechner/pi-coding-agent` to add `pi.unregisterTool(name)` symmetric with `pi.unregisterProvider(name)`. Block the typed-query implementation on it.
- **Spec edits.** Keep current wording, but add a "Pi SDK dependency" note recording the required minimum version once the upstream API ships.
- **Pros.** Cleanest long-term; mirrors the existing `unregisterProvider` shape.
- **Cons.** External dependency; ships on Pi's timeline, not the loom's; until then V6i is blocked.
- **Risks.** Pi may decline (registry mutation has invariants we don't see); even if accepted, spec must still describe Option A as the V1 fallback.

### Recommendation

Take **Option A** for prompt mode and **Option B** for subagent mode (i.e., apply both, scoped to the mode where each is cleanest). Concretely, rewrite the `pi-integration-contract.md` typed-query paragraphs to:

1. Define `respondToolName = `__loom_respond_${sha256(loweredSchema).slice(0,12)}`` and a per-extension `Map<string, registered>` cache.
2. Prompt mode: lazily `pi.registerTool` on first use of each unique hash; toggle the active set via snapshot/restore around the forced-tool turn; never call any non-existent `unregisterTool`.
3. Subagent mode: pass the same synthesised tool definition through `createAgentSession({ customTools: [...] })`; do not touch the global registry.
4. Subscribe to `session_shutdown` (and the file watcher's reload path) to clear the hash cache, so a fresh extension instance starts with an empty cache. Acknowledge that Pi-registered entries remain visible in `pi.getAllTools()` until process exit and that this is intentional in V1.

Edge cases the implementer must watch:

- **Active-set restoration on cancellation.** The `setActiveTools(snapshot)` call must run in a `finally`, not after `await query`, so an aborted query still restores the active set.
- **Concurrent looms in the same extension.** Two slash-command invocations of typed-query looms may overlap in time. Either serialise the active-set toggle behind an internal mutex, or compose: the snapshot must include any other loom's currently-active respond tool.
- **Hash stability.** The hash must be over the lowered (post `schema-subset.md` lowering) schema, not the source schema, so semantically equivalent schemas in different looms collapse to one registration.
- **`getActiveTools()` snapshot is a name list, not a set.** Restoring with `setActiveTools(snapshot)` preserves order but trusts that no other extension mutated the registry between snapshot and restore; document this explicitly.

## Related Findings

- "`tools` vs `customTools` in `createAgentSession`" — co-resolve (Option B above relies on `customTools` being the correct field; the same edit can correct both findings)
- "`before_provider_request` cannot scope to a single turn" — decision-dependency (whichever scoping mechanism is adopted there determines how the forced-`tool_choice` injection in this finding identifies its own turn)
- "Typed query mechanism contradicts `query.md` tool-loop semantics" — same-cluster (both touch the typed-query mechanism but resolve independently; that finding is about whether tool loops are allowed during typed queries, this one is about lifecycle of the respond tool)
- "`tools:` registration scope: global vs per-loom" — same-cluster (both expose ambiguity about Pi's global tool registry as a shared mutable surface)
- "Hot-reload via `ctx.reload()` causes full extension teardown" — decision-dependency (the cleanup-on-reload prescription in Option A only works if the reload path is well-defined)
- "Forced tool-use unsupported on non-Anthropic/OpenAI providers" — same-cluster (the synthesised respond tool only matters because it is force-selected; provider coverage is orthogonal but co-affected)

---

# `argument-hint` has no surface on extension-registered slash commands

**Source:** docs/reviews/spec-review/spec-20260504-144255.md
**Original heading:** `argument-hint` is not a field on `pi.registerCommand`
**Kind:** codebase-grounding-broad, assumptions

## Finding

Three spec sections describe `argument-hint` as the field that "drives the slash-command autocomplete dropdown" or "populate[s] the autocomplete entry" for a registered loom. That behaviour is real for Pi's built-in `.md` prompt templates — `PromptTemplate` carries an `argumentHint?: string` and `interactive-mode.js` forwards it to the autocomplete `SlashCommand` — but it is **not** real for commands registered via `pi.registerCommand`, which is the API the Pi-loom contract names.

The `RegisteredCommand` interface in the Pi SDK exposes `name`, `sourceInfo`, `description?`, `getArgumentCompletions?`, and `handler` — and nothing else. The autocomplete bridge for extension commands maps only `{ name, description, getArgumentCompletions }` onto the `SlashCommand` consumed by `CombinedAutocompleteProvider`; the `SlashCommand.argumentHint` slot is never populated for extension-registered commands. There is no documented or undocumented field on `RegisteredCommand` that reaches it.

The consequence for the spec is that one of the two documented effects of `argument-hint` (autocomplete display) cannot be delivered by the V1 contract as written, while the other (binder grounding, used internally by the loom runtime) works fine. The spec must either pick a workaround that reaches the autocomplete UI, or scope `argument-hint` down to its binder role and acknowledge the Pi gap.

## Spec Documents

- `spec_topics/pi-integration.md` — slash-command discovery bullet (edited)
- `spec_topics/slash-invocation.md` — paragraph on `argument-hint` driving autocomplete (edited)
- `spec_topics/pi-integration-contract.md` — extension entry point step 2, `pi.registerCommand` registration shape (option-dependent)
- `spec_topics/frontmatter.md` — frontmatter field declaration and "mirrors Pi's prompt-template frontmatter" claim (option-dependent)
- `spec_topics/binder.md` — argument-hint as binder grounding (read-only)

## Plan Impact

**Phases:** MVP, Horizontal, Vertical V3, Vertical V16

**Leaves (implementation order):**

- H4 — Pi extension shell — (read-only) — names `pi.registerCommand` as the registration API
- M — Minimal end-to-end loom — (modified) — first real `pi.registerCommand` for a `.loom`; needs to know whether/how to surface `argument-hint`
- V3a — Frontmatter parsing — (modified) — `argument-hint` is recognised here; the leaf must encode the chosen surfacing rule (and any associated warning)
- V16f — `bind_context: none` — (read-only) — binder consumes `argument-hint` as grounding; behaviour unchanged

## Consequence

**Severity:** correctness

Two reasonable implementers will diverge: one writes `pi.registerCommand(name, { argumentHint, description, ... })` (TypeScript error, or — if it slips past — a silently-dropped field), another folds `argument-hint` into `description`, a third silently ignores it. The user-visible autocomplete behaviour described in the spec is unreachable via the named Pi API, so any implementation will either disappoint the spec or quietly redefine its semantics.

## Solution Space

**Shape:** multiple

### Option A — Fold `argument-hint` into `description` at registration

- **Approach.** When constructing the `RegisteredCommand` object passed to `pi.registerCommand`, build the `description` string as `${frontmatter.description} — ${frontmatter['argument-hint']}` (or a similar one-line concatenation), with a documented separator. The composite string is what the autocomplete dropdown shows.
- **Spec edits.** `pi-integration.md` and `slash-invocation.md` rewrite the autocomplete claim to: "the runtime concatenates `description` and `argument-hint` into the single `description` field accepted by `pi.registerCommand`; both are visible in the autocomplete entry." `pi-integration-contract.md` step 2 documents the concatenation explicitly. `frontmatter.md` notes the merge.
- **Pros.** Hint text reaches the user with no Pi changes. Single field semantics still distinguishable in source.
- **Cons.** Loses the structural separation Pi maintains for `.md` prompts (where description and hint are distinct columns/styles in the dropdown). Authors writing both fields get one visual blob.
- **Risks.** If Pi later adds an `argumentHint` field to `RegisteredCommand`, the merged string becomes a downgrade and a migration trap.

### Option B — Scope `argument-hint` to binder grounding only; document the Pi gap

- **Approach.** Declare in V1 that `argument-hint` is a **binder-grounding** field — it is fed to the LLM binder as additional context for argument extraction (the role described in `binder.md`) and nothing else. The spec explicitly notes that Pi's extension-registered slash commands do not currently expose an `argumentHint` autocomplete surface, list it under [Future Considerations](spec_topics/future-considerations.md), and do not surface the field through `pi.registerCommand` at all.
- **Spec edits.** `pi-integration.md` drops the autocomplete claim. `slash-invocation.md` rewrites the paragraph to describe binder grounding only and adds one sentence noting the Pi extension-API gap. `pi-integration-contract.md` step 2 keeps the registration shape unchanged. `frontmatter.md` softens "mirrors Pi's prompt-template frontmatter" with a note that `argument-hint` is currently used internally only.
- **Pros.** Preserves clean field semantics: `description` is for the dropdown, `argument-hint` is for the binder. No information loss when Pi later closes the gap. No risk of the description becoming a stylistic mess.
- **Cons.** Authors lose the autocomplete affordance they likely expect from Pi-prompt parity. Subtle: the same `.loom` file authored as a `.md` prompt would have a richer dropdown.
- **Risks.** Spec readers familiar with Pi prompts may misread the field as unused; the gap note must be prominent.

### Option C — Synthesise a hint entry via `getArgumentCompletions`

- **Approach.** Implement `getArgumentCompletions(prefix)` on every registered loom command so that, for the empty / very-short prefix, it returns a single non-applicable item whose `label` is the hint text (e.g. `{ value: '', label: '<language> <focus_areas...>', description: 'argument hint' }`).
- **Spec edits.** `pi-integration-contract.md` step 2 adds a `getArgumentCompletions` synthesis rule. `slash-invocation.md` describes the synthesis. `frontmatter.md` unchanged.
- **Pros.** The hint is visible in the autocomplete UI without depending on a Pi API change.
- **Cons.** `getArgumentCompletions` is meant for actual completions; a non-selectable hint pollutes the same surface used by future real completions, and selection behaviour is undefined. UX is fragile across Pi UI changes.
- **Risks.** Forward-incompatible with any future Pi behaviour that auto-applies the first completion item; risk of accidentally inserting the literal hint string as the user's argument.

### Recommendation

Option B. `argument-hint`'s binder role is the load-bearing one in V1 — it materially improves bind quality — and the autocomplete role is cosmetic. Trying to deliver the cosmetic via the only available knobs (Option A merges semantics, Option C abuses the completion API) costs more clarity than it returns. State the Pi extension-API gap explicitly so a future contributor can either upstream `argumentHint` to `RegisteredCommand` or revisit the decision once Pi exposes the field. The implementer must (a) ensure the registered `description` is **only** `frontmatter.description`, (b) wire `argument-hint` into the binder grounding payload, and (c) emit a `loom/load/argument-hint-not-displayed` advisory diagnostic when a loom declares `argument-hint` but no `description`, so authors are not surprised by an empty-looking dropdown entry.

## Related Findings

- "`mode:` default and required-vs-optional fields unspecified" — same-cluster (frontmatter-field semantics; that finding's table-of-fields fix should record `argument-hint`'s required/optional status and its V1 surface alongside the rule chosen here)
- "`pi.looms` package.json key is not Pi-recognized" — same-cluster (another instance of the spec naming a Pi extension-API affordance that does not exist; both findings expose the same grounding gap pattern)
- "Cross-format collision: \"neither is registered\" is unimplementable for `.md` prompts" — decision-dependency (both touch the `.loom` vs Pi-prompt-template parity claim; the wording chosen here for "mirrors Pi's prompt-template frontmatter" must be consistent with the wording chosen there)

---

# Synthesised `ExtensionContext` for code-side tool calls is under-specified

**Source:** docs/reviews/spec-review/spec-20260504-144255.md
**Original heading:** Synthesized `ExtensionContext` is incomplete against the full interface
**Kind:** codebase-grounding-broad, assumptions

## Finding

`pi-integration-contract.md` (Tool execution from loom code) says the runtime invokes a Pi tool's `execute(toolCallId, params, signal, onUpdate, ctx)` with "a synthesised `ExtensionContext` with `cwd`, `signal`, `sessionManager` … and a no-op `ui`." Pi's `ExtensionContext` interface (`dist/core/extensions/types.d.ts:207`) has eleven additional required members that the spec ignores: `hasUI: boolean`, `modelRegistry: ModelRegistry`, `model: Model<any> | undefined`, `isIdle()`, `abort()`, `hasPendingMessages()`, `shutdown()`, `getContextUsage()`, `compact()`, and `getSystemPrompt()`. A literal three-field stub does not satisfy the interface and will not compile under TypeScript.

The under-specification also obscures a real design choice. In prompt mode the runtime already holds an `ExtensionCommandContext` (which `extends ExtensionContext`) from the slash-command handler, so the natural answer is to reuse that live `ctx` and override the per-call fields (`signal`, `sessionManager` once it diverges). In subagent mode there is no surrounding command context for the spawned `AgentSession`'s tool calls, so the runtime *must* fabricate an `ExtensionContext`-shaped object — and the spec needs to enumerate every field's value (notably what `model`/`modelRegistry` resolve to, and whether `abort()`/`compact()`/`shutdown()` are no-ops or throw).

Tool authors that read these fields (e.g. a tool that consults `ctx.model` to choose token budgets, or `ctx.getContextUsage()` to size output) will see different behaviour between code-side and model-driven invocations unless the contract pins the values down.

## Spec Documents

- `spec_topics/pi-integration-contract.md` — "Tool execution from loom code" bullet (edited)
- `spec_topics/pi-integration-contract.md` — "Conversation drive — subagent mode" (read-only; defines what a subagent session has access to)
- `spec_topics/pi-integration.md` — read-only

## Plan Impact

**Phases:** Horizontal, Vertical V14

**Leaves (implementation order):**

- H4 — Pi extension shell — `PiToolHost` adapter shim is the home for the `ExtensionContext` synthesis (modified)
- V14c — Pi tool's `execute()` invoked directly with `loom-direct:` prefix — directly constructs and passes the synthesised `ctx` (modified)

## Consequence

**Severity:** correctness

A spec-following implementation produces code that does not type-check; the obvious "fill in the blanks with no-ops" workaround silently diverges from the model-driven path (different `model`, `getContextUsage()`, `getSystemPrompt()` behaviour) and any third-party Pi tool that touches those members will misbehave when invoked from loom code. Two implementers will pick different no-op semantics (throw vs return `undefined` vs return a frozen empty value) and produce observably different runtimes.

## Solution Space

**Shape:** multiple

### Option A — Reuse the live command-handler `ctx`, override only what differs

**Approach.** In prompt mode the runtime already holds the `ExtensionCommandContext` passed to the slash-command handler (which `extends ExtensionContext`). The `PiToolHost` retains that reference and, for each code-side `<name>(args)` call, builds a shallow override `{ ...ctx, signal: loomController.signal }` (and, in subagent contexts, swaps `sessionManager` for the spawned session's `ReadonlySessionManager`). All other members forward to the live host.

**Spec edits.** Replace the "synthesised `ExtensionContext`" sentence with: "the runtime forwards the live command-handler `ExtensionContext`, with `signal` overridden to the loom's `AbortController.signal` and `sessionManager` overridden to the active session (the user session in prompt mode, the spawned subagent session in subagent mode)." Note that subagent mode reuses the parent command-handler ctx for the non-session fields (`modelRegistry`, `getContextUsage`, etc.) since no separate `ExtensionContext` is associated with the spawned `AgentSession`.

**Pros.** Type-safe by construction; tools see authentic `model`, `modelRegistry`, `cwd`, `getContextUsage`; no enumeration to maintain when Pi adds members; matches how Pi's own command-driven tool calls already work.

**Cons.** Couples `PiToolHost` to the command-handler lifetime; if a code-side tool call somehow outlives its handler (it should not, given cancellation rules), the forwarded `ctx` may reference a torn-down session. Subagent-side tool calls expose the *parent's* `model`/`getContextUsage` — usually benign but not the spawned session's view.

**Risks.** Implementers may forget to override `signal` and accidentally inherit the parent's signal, defeating loom-level cancellation.

### Option B — Synthesise a full `ExtensionContext` with declared no-op semantics

**Approach.** Spec enumerates every required field and pins its synthesised value: `ui` = no-op object; `hasUI = false`; `cwd` = process cwd; `signal` = loom controller; `sessionManager` = active session; `modelRegistry` = the runtime's `ModelRegistry` instance (already needed for binder); `model` = `undefined`; `isIdle()` = `true`; `abort()` = `loomController.abort()`; `hasPendingMessages()` = `false`; `shutdown()` = no-op; `getContextUsage()` = `undefined`; `compact()` = no-op; `getSystemPrompt()` = `""`.

**Spec edits.** Replace the sentence with a bullet list giving the value of each `ExtensionContext` member, plus a one-line rule: "tools that depend on `model`, `getContextUsage`, or `getSystemPrompt` may receive degenerate values during code-side invocation; tool authors must tolerate this or be invoked only via the model-driven path."

**Pros.** Self-contained — no dependency on a parent command context; uniform across prompt and subagent modes; explicit about which members are degenerate.

**Cons.** Brittle — every Pi version that adds a member to `ExtensionContext` requires a spec update or breaks compilation; tools that genuinely consult `model`/`getContextUsage` see false readings; spec text grows.

**Risks.** Drift between Pi's interface and pi-loom's stub; silent breakage when Pi adds a non-optional member.

### Recommendation

Adopt **Option A** for prompt mode and a *narrower* Option B for subagent mode. The contract should read:

> The runtime constructs the `ctx` argument as follows. **Prompt mode:** forward the live `ExtensionCommandContext` from the slash-command handler, with `signal` overridden to the loom's `AbortController.signal`. **Subagent mode:** forward the same parent `ExtensionCommandContext` with `signal` overridden to the loom's signal and `sessionManager` overridden to the spawned subagent's `ReadonlySessionManager`; all other members (`cwd`, `modelRegistry`, `model`, `getContextUsage`, `getSystemPrompt`, `ui`, `hasUI`, `isIdle`, `abort`, `hasPendingMessages`, `shutdown`, `compact`) are forwarded unchanged from the parent command context.

Edge cases the implementer must watch:
- The override is a shallow object spread; methods that close over `this` (none in the current `ExtensionContext` interface, but verify) must be `.bind(ctx)`-ed.
- `abort()` on the synthesised ctx must abort the *loom's* controller, not the parent's — otherwise a tool that calls `ctx.abort()` will tear down the user's whole turn. If reuse is total, this requires a wrapper rather than a spread.
- `PiToolHost` must therefore retain a reference to the latest command-handler ctx; `H4` should add this to its constructor parameters and `V14c` should consume it.
- The contract must say what happens when a code-side tool call occurs *before* the first command-handler ctx exists (e.g. during binder execution prior to handler entry). The likely answer is "binder uses a separately-injected minimal ctx; record this as an explicit case."

## Related Findings

- "`ctx.sendUserMessage()` does not exist on command-handler context" — same-cluster (also stems from imprecise modelling of `ExtensionContext` / `ExtensionCommandContext` / `ExtensionAPI` surfaces; resolving requires the same audit pass)
- "`ctx.signal` is `undefined` in command-handler contexts" — decision-dependency (Option A's "override `signal`" prescription depends on the loom-owned `AbortController` design that finding mandates)
- "Session-context token counting API unspecified" — same-cluster (touches `ctx.getContextUsage()` semantics; both Option A and Option B must answer what code-side tools see)
- "Hot-reload via `ctx.reload()` causes full extension teardown" — same-cluster (another `ExtensionCommandContext` member misuse from the same audit gap)

---

# Hot-reload via `ctx.reload()` reloads every Pi extension and races concurrent edits

**Source:** docs/reviews/spec-review/spec-20260504-144255.md
**Original heading:** Hot-reload via `ctx.reload()` causes full extension teardown
**Kind:** codebase-grounding-broad, assumptions

## Finding

`pi-integration-contract.md` step 3 says the extension "optionally registers a file watcher (chokidar) over the discovered roots; on change, calls `ctx.reload()` from a `_loom-reload` command". Three properties of `ctx.reload()` (documented at `pi-coding-agent/docs/extensions.md:1155–1179`) make this prescription incompatible with what the spec is trying to achieve:

1. **Blast radius.** `ctx.reload()` is the same operation invoked by the user's `/reload` slash command: it tears down and re-loads *all* extensions, skills, prompts, and themes — not just `pi-loom`. Saving any `.loom`/`.warp` file therefore restarts every other extension in the user's session and emits `session_shutdown` / `session_start` events that the rest of the runtime is not expecting on a per-keystroke basis.
2. **Stale code after `await`.** Pi documents that "code after `await ctx.reload()` still runs from the pre-reload version" and recommends treating the call as terminal for the handler. A debounced watcher that calls `ctx.reload()` and then continues post-await (to log, drain a queue, etc.) is operating on a torn-down runtime.
3. **Context unavailability.** `reload()` exists only on `ExtensionCommandContext`, the variant passed to slash-command handlers. Chokidar callbacks fire from a Node timer / fs event and have no command context to call. The spec hand-waves this with "from a `_loom-reload` command", but the watcher must then queue a synthetic user message (`pi.sendUserMessage("/_loom-reload", { deliverAs: "followUp" })`), making every save trigger a visible synthetic user turn that waits for the agent to be idle. Multiple concurrent saves either coalesce silently or pile up — the spec specifies neither.

Separately, `chokidar` is named in the contract but is not declared in `package.json` `dependencies` or `peerDependencies`.

## Spec Documents

- `spec_topics/pi-integration-contract.md` — "Extension entry point" item 3 (edited)
- `spec_topics/pi-integration.md` — "file watcher (optional)" bullet (edited)
- `spec_topics/implementation-notes.md` — "the file watcher invalidates the cache on change" sentence in the AJV configuration note (option-dependent)
- `spec_topics/schema-subset.md` — "the file watcher invalidates the cache on change" sentence (option-dependent)
- `package.json` — add `chokidar` to `dependencies` (edited)
- `pi-coding-agent/docs/extensions.md` (`ctx.reload()` semantics, §1155–1204) (read-only)

## Plan Impact

**Phases:** Vertical V18

**Leaves (implementation order):**

- V18f — File watcher (chokidar) over discovery roots — (modified)
- V18g — AJV cache invalidation on file change — (modified)

## Consequence

**Severity:** correctness

A literal reading of the contract produces a watcher that kicks every Pi extension back to startup on every save, races on burst edits, and runs post-await logic against a dead runtime. Two implementers will diverge: a careful one will silently invent a per-loom re-parse path; a literal one will ship the user-hostile behaviour above. The cache-invalidation rule in `implementation-notes.md`/`schema-subset.md` ("the file watcher invalidates the cache on change") is also under-specified — it does not say whether invalidation is per-file or global, which matters once the watcher path is concrete.

## Solution Space

**Shape:** multiple

### Option A — In-process re-parse with a stable command shim

**Approach.** Each `.loom` file is registered exactly once at extension load via `pi.registerCommand(<name>, { handler: (args, ctx) => registry.dispatch(<name>, args, ctx), ... })`. The `handler` closes over an internal mutable `LoomRegistry` keyed by slash name. On a chokidar event the watcher re-parses just the changed file (plus any `.warp` importers, tracked via the import graph) inside the extension process, then *swaps the registry entry* — no `pi.registerCommand` re-call, no `ctx.reload()`. Tools exposed to LLMs are re-registered via `pi.registerTool` (documented as supported after startup, `extensions.md:1221`). Compiled AJV validators are dropped from the per-loom cache as part of the swap.

**Spec edits.**
- `pi-integration-contract.md` step 3: replace with "the runtime maintains an internal `LoomRegistry`; chokidar events trigger an in-process re-parse and table swap. `ctx.reload()` is **not** called for content edits."
- Add a note: "addition or removal of a `.loom` file (as opposed to edits to an existing one) cannot register / unregister a slash command after extension load. Such structural changes require the user to invoke `/reload` (or `/_loom-reload` which calls `ctx.reload()`); the watcher surfaces a one-line system note prompting them."
- `pi-integration.md` file-watcher bullet: tighten to "edits to existing `.loom` and `.warp` files take effect without a session restart; addition or removal of a file requires `/reload`."
- `implementation-notes.md` and `schema-subset.md`: replace "the file watcher invalidates the cache on change" with "the in-process re-parse path drops the AJV validator entry for the changed file and every transitive importer."

**Pros.**
- Zero blast radius for the common case (editing the body of an existing loom).
- No synthetic user turns; no race with in-flight loom invocations of *other* looms.
- AJV cache invalidation is naturally per-file.

**Cons.**
- Two distinct reload paths (content edit vs. structural change) increase implementation surface.
- An in-flight invocation of the just-edited loom keeps running its pre-edit AST — needs a documented rule (recommend: "in-flight invocations complete against the pre-swap snapshot; the next invocation sees the new version").

**Risks.**
- `pi.registerCommand` post-startup behaviour is undocumented; this option deliberately avoids depending on it. If a future Pi version adds it, the structural-change path can be tightened.

### Option B — Watcher opt-in, debounced, calls `ctx.reload()` via synthetic command

**Approach.** Watcher is gated behind a frontmatter / settings opt-in (default: off). Chokidar events are debounced (250ms window) and coalesced into a single `pi.sendUserMessage("/_loom-reload", { deliverAs: "followUp" })`. The `/_loom-reload` command handler is `async (args, ctx) => { await ctx.reload(); }` and returns immediately after the await (no post-await logic). The contract documents the blast radius explicitly.

**Spec edits.**
- `pi-integration-contract.md` step 3: keep the `ctx.reload()` mechanism but add: "the watcher is opt-in (default: off). On change, events are debounced with a 250 ms window and dispatched as a single `pi.sendUserMessage('/_loom-reload', { deliverAs: 'followUp' })`. `ctx.reload()` reloads every extension, skill, prompt, and theme — not only looms; users who do not want this behaviour should leave the watcher off and use `/reload` manually."
- Add: "the `/_loom-reload` handler must return immediately after `await ctx.reload()`; no post-await logic runs in the original extension instance."

**Pros.**
- One reload path; no in-process AST surgery.
- Trivially correct under structural changes (file add/remove).

**Cons.**
- Every save tears down every extension in the session.
- Saves while the agent is mid-stream queue behind the current turn (followUp delivery), so the reload is not actually immediate.
- A burst of saves at the boundary of the debounce window can still produce two reloads.

**Risks.**
- Other extensions that hold expensive startup state (skills indexes, theme parsing) pay that cost on every save.

### Option C — Manual reload only

**Approach.** Drop the watcher from V1. The user runs `/reload` (or a thin `/_loom-reload` alias) when they want changes picked up.

**Spec edits.**
- `pi-integration-contract.md` step 3: replace with "`pi-loom` does not register a file watcher in V1. Edits take effect on the next `/reload`."
- `pi-integration.md`: remove the file-watcher bullet.
- Move the file-watcher concept to `future-considerations.md`.
- Plan: V18f becomes a no-op confirmation leaf (assert no chokidar dependency); V18g's mechanism becomes "AJV cache lifetime is bounded by the extension instance; `/reload` is the cache-invalidation event."

**Pros.**
- Smallest surface; nothing to specify about debouncing, races, or registration scope.
- No `chokidar` dependency.

**Cons.**
- Authors lose the iterative edit-save-rerun loop the spec advertises as a V1 feature.

**Risks.**
- None technical; pure scope reduction.

### Recommendation

Adopt **Option A** for V1, with the structural-change escape hatch (file added/removed → system note prompting `/reload`).

- The common authoring loop — edit an existing loom, re-run it — is the value the watcher exists to deliver, and Option A delivers it without disturbing other extensions.
- Treat the in-flight-invocation case explicitly: `LoomRegistry.dispatch` reads the entry once at handler entry, so a swap mid-execution does not affect the running invocation.
- Debounce chokidar at 250 ms regardless, to coalesce editor-save bursts (many editors emit `change` + `rename`).
- Track `.warp` → `.loom` importers in an in-memory graph so a `.warp` edit invalidates all dependents.
- Declare `chokidar` in `dependencies` with a concrete version range (this is co-resolved with the `peerDependencies use *` finding).
- AJV cache invalidation collapses into the same swap, so V18g becomes "the LoomRegistry swap drops the AJV validator entry" rather than a separate watcher-driven path.

## Related Findings

- "`peerDependencies` use `*` ranges; `ajv`, `ajv-formats`, `chokidar` undeclared" — co-resolve (the chokidar dependency declaration is part of this fix)
- "Synthesized `ExtensionContext` is incomplete against the full interface" — same-cluster (both touch how the runtime interacts with `ExtensionContext` / `ExtensionCommandContext`; resolving them independently is fine)
- "`agent_end` fires globally, not per-session" — same-cluster (another instance of the contract under-specifying Pi runtime semantics; resolved independently)

---

# Typed-query forced-tool mechanism conflicts with `query.md`'s tool-loop semantics

**Source:** docs/reviews/spec-review/spec-20260504-144255.md
**Original heading:** Typed query mechanism contradicts `query.md` tool-loop semantics
**Kind:** cross-spec-consistency-broad, implementability, assumptions, scope

## Finding

`query.md` describes typed queries as ordinary tool-loop conversations whose final assistant message must satisfy a response schema:

> If the model responds with tool-use, the runtime executes the requested tool against the loom's frontmatter `tools` set, feeds the result back to the model, and loops until the model produces a final (non-tool-call) response. … A response schema, if given, is enforced against the final response only — not against intermediate tool-call payloads.

The "Schema-validation coercion" section reinforces this: "A coercion follow-up may itself trigger tool calls; the runtime services those the same way as in the original query, then validates the resulting response." `frontmatter.md` is also unambiguous — `tools:` are "available to the model during query-time tool loops," and `tool-calls.md` defines `ToolFailureError` for tool failures inside the model's tool-call loop "during a `@`...`` query" with no carve-out for typed queries.

`pi-integration-contract.md`, however, implements typed queries by registering a synthesised `__loom_respond_<schema-hash>` tool just before the query, forcing `tool_choice` to that single tool via `before_provider_request`, and unregistering it immediately after. With `tool_choice` pinned to one tool, the model cannot invoke any frontmatter `tools:` entry — so the spec's "loops until the model produces a final response" is unreachable on every typed query. Worse, every site that promises tool-use during typed queries (the coercion-follow-up clause, `ToolFailureError`'s applicability, `frontmatter.md`'s `tools:` description, V14e's "same `tools:` set serves both code and model") becomes inert for the typed half of the surface. Two implementers reading these files in isolation would build incompatible runtimes.

## Spec Documents

- `spec_topics/pi-integration-contract.md` — "Conversation drive — prompt mode" (typed-query bullet) (edited)
- `spec_topics/pi-integration-contract.md` — "Conversation drive — subagent mode" (subagent typed-query bullet) (edited)
- `spec_topics/query.md` — "Tool calls during a query" paragraph (edited)
- `spec_topics/query.md` — "Schema-validation coercion" paragraph (edited)
- `spec_topics/frontmatter.md` — `tools:` description (read-only)
- `spec_topics/tool-calls.md` — `ToolFailureError` context paragraph (read-only)
- `spec_topics/implementation-notes.md` — runtime tool-loop description (read-only)

## Plan Impact

**Phases:** Vertical V6, Vertical V12, Vertical V13, Vertical V14

**Leaves (implementation order):**

- V6i — AJV validation of typed query results — (modified)
- V12a — `mode: subagent` accepted; AgentSession spawn — (modified)
- V13g — Coercion methodology: `validator_error` — (modified)
- V13h — Coercion methodology: `schema_repeat` — (modified)
- V13j — Coercion preserves tool-call side effects — (modified)
- V14e — Pi tool wired into `@` queries as model-callable — (modified)

## Consequence

**Severity:** correctness

An implementer who builds the typed-query mechanism per the integration contract produces a runtime in which typed queries cannot read files, search code, or invoke any other loom — directly contradicting the very prompts authors are expected to write (`let plan: Plan = @\`...read the repo and...\`?`). An implementer who builds it per `query.md` either skips forced tool-use entirely (and ships unreliable schema validation) or invents an unspecified mechanism. Coercion follow-ups, `ToolFailureError`, and the V14e "same set serves both code and model" guarantee also silently break for typed queries.

## Solution Space

**Shape:** multiple

### Option A — Two-phase tool loop ending in a forced respond turn

**Approach.** Pre-register `__loom_respond_<schema-hash>` alongside the loom's `tools:` set. For each turn in the loop, leave `tool_choice` unconstrained: if the model issues a regular tool-use, the runtime services it against the frontmatter `tools:` set and continues the loop; if the model emits a plain text turn, the runtime issues one additional follow-up user turn ("Return your final answer using the `__loom_respond_<…>` tool with this schema:") with `tool_choice` forced to the respond tool. The respond tool's `execute` validates and resolves the query promise. Coercion-follow-up turns reuse the same loop machinery — `retry.attempts` counts whole follow-ups, not per-turn iterations.

**Spec edits.** Rewrite the typed-query bullet in `pi-integration-contract.md` "prompt mode" to describe the two-phase pattern; mirror the change in the subagent bullet. Leave `query.md`'s tool-loop and coercion paragraphs unchanged. Add a sentence to `query.md` clarifying that the runtime may insert one final forced respond turn after the model's natural text response, and that this respond turn is invisible to authors but visible in transcripts. Cross-link from `frontmatter.md`'s `tools:` description.

**Pros.**
- Honours `query.md` literally: tool loops, coercion-with-tools, and `ToolFailureError` all stay live for typed queries.
- Preserves prompt-mode's "every turn is user-visible" philosophy — the model still produces natural prose before the structured response.
- V14e's "same `tools:` set serves both code and model" remains a clean invariant.
- Composes cleanly with V13g/h/j coercion: a coercion turn is just another natural turn followed by a respond turn.

**Cons.**
- One extra round-trip per typed query (the forced respond turn after the natural turn).
- The respond turn carries no model thought beyond schema-shaped data, doubling token cost on the final hop.
- Distinguishing "model finished thinking" from "model paused before another tool call" relies on the provider's stop-reason field; some providers conflate these.

**Risks.**
- A model that always calls a tool and never emits a text turn (some long agentic patterns) needs a turn budget or it will loop indefinitely — must reuse V14e's existing tool-loop bound (see related finding "Tool-call loop is unbounded").
- The forced respond turn must be marked synthetic so transcript renderers can dim it; otherwise users see a redundant assistant turn.

### Option B — Combined-choice respond-or-tool turn

**Approach.** Pre-register `__loom_respond_<schema-hash>` alongside the frontmatter `tools:` set. On every turn of the typed-query loop, set provider tool_choice to "must call some tool" (Anthropic `tool_choice: { type: "any" }`, OpenAI `tool_choice: "required"`). The model picks: a regular tool → service and loop; the respond tool → validate and finish. No separate forced-respond turn; the respond tool simply lives as one option among many on every turn until the model picks it.

**Spec edits.** Rewrite `pi-integration-contract.md`'s typed-query bullet to describe the combined-choice mechanism and the per-provider `tool_choice` mapping. `query.md` requires a small clarification: typed queries terminate when the model invokes the respond tool, not on a "final non-tool-call response."

**Pros.**
- One round-trip fewer than Option A — no synthetic terminating turn.
- Symmetric across loop iterations; the loop has one termination rule, not two.
- No reliance on stop-reason heuristics.

**Cons.**
- The model never produces user-visible prose; this conflicts with prompt-mode's "every turn is user-visible" philosophy noted in `pi-integration-contract.md`. Users see only tool-call envelopes.
- Provider mapping diverges (`any` vs `required` vs unsupported on Gemini/Ollama/local), which couples this option tightly to the related finding "Forced tool-use unsupported on non-Anthropic/OpenAI providers."
- Slight risk that some models, when `tool_choice` is `required`, immediately pick the respond tool with empty/garbage args rather than reasoning through the available tools.

**Risks.**
- Authors who expect the typed-query final response to contain natural prose (common when `let summary: Summary = @\`...\`?` and `Summary.body: string`) will find the body field thin — the model never had a "free" turn to write at length.
- Same provider-coverage risk as the existing forced-tool design.

### Recommendation

Adopt **Option A**. It is the smaller delta against `query.md` (no semantic changes, only an implementation-disclosed final hop), keeps `frontmatter.md`'s "available to the model during query-time tool loops" promise live for typed queries, and preserves the user-visible prose turn that prompt-mode's philosophy depends on.

Implementer must watch:

1. The forced respond turn needs its own loop-iteration budget — reuse whatever bound the related "Tool-call loop is unbounded" finding settles on, and count the respond turn against it (one slot, not zero).
2. The respond tool's `parameters` is the lowered query schema; the same schema must also be inlined verbatim in the forced-respond user-turn body so the model sees the shape it is being asked to fill (some providers do not surface tool input-schemas to the model with high fidelity).
3. Coercion follow-ups must restart the two-phase loop, not just the respond turn — the model may need to retool (re-read a file, etc.) before it can answer the coercion request. V13g/h/j tests need a case where coercion triggers an intermediate tool call.
4. Provider stop-reason interpretation: treat `end_turn` / `stop` as "ready for forced respond"; treat `tool_use` as "service and loop"; treat any other stop-reason (filter, length) as a `transport` or `context_overflow` error per existing classification.

## Related Findings

- "Forced tool-use unsupported on non-Anthropic/OpenAI providers" — co-resolve (the chosen mechanism dictates the provider compatibility surface; both options force tool-use on the final hop)
- "`before_provider_request` cannot scope to a single turn" — co-resolve (Option A still uses `before_provider_request` for the final hop only; payload fingerprinting is required for either option)
- "No `pi.unregisterTool()` API — one-shot tools accumulate" — decision-dependency (the respond-tool lifetime is the same in both options; whichever option lands must address registration scope)
- "Tool-call loop is unbounded" — co-resolve (Option A's loop-budget concern is the same loop)
- "Coercion follow-up may re-trigger tool side effects" — same-cluster (touches the typed-query loop but resolves on its own)
- "`tools:` registration scope: global vs per-loom" — same-cluster (both findings concern how query-time tools are exposed but resolve independently)

---

# Loom-as-tool registration: scope and lifetime are unspecified and conflict with the per-loom callable-set rule

**Source:** docs/reviews/spec-review/spec-20260504-144255.md
**Original heading:** `tools:` registration scope: global vs per-loom
**Kind:** cross-spec-consistency-broad, implementability, completeness

## Finding

`pi-integration-contract.md` says that whenever loom B appears in another loom's `tools:` list, the runtime "*also* registers it via `pi.registerTool({ name, description, parameters, execute })`." `pi.registerTool` puts a tool in Pi's process-wide tool registry: once registered, the tool is selectable in every Pi session via `pi.setActiveTools(...)` and is, by default, in the active set of any session whose configuration does not exclude it. The contract gives no scope qualifier and no lifetime — there is no statement that the registration is per-loom-invocation, no `pi.unregisterTool` call (no such API exists; see related finding), and no rule about which sessions get to see the tool.

This collides with `frontmatter.md`, which specifies that each loom's `tools:` is a closed callable set: "The Pi session's ambient tools are deliberately *not* inherited — tools have side effects, and silent inheritance produces 'why did my loom touch the filesystem?' surprises. To opt in, list each callable explicitly." If loom A lists `./b.loom`, then under the literal reading of the contract, B becomes a globally-registered Pi tool that any *other* loom's session — and the user's bare Pi session — can call without listing it. That is exactly the silent-inheritance footgun frontmatter.md says it has closed.

The contract is also redundant for subagent mode. `createAgentSession` accepts `customTools` (the tool definitions) and `tools` (the active-name allowlist) directly, so the loom's callable set can be wired into the spawned session without touching Pi's global registry at all. The global-registration step makes operational sense only for the prompt-mode case, where the loom drives the user's existing Pi session and that session's active-tool list is the only handle the model has on what tools exist — and even there, it should be paired with a `setActiveTools` swap so the registration's visibility tracks the loom's invocation, not the process lifetime.

## Spec Documents

- `spec_topics/pi-integration-contract.md` — "Per-loom registration" bullet (edited)
- `spec_topics/pi-integration-contract.md` — "Conversation drive — subagent mode" bullet (option-dependent)
- `spec_topics/frontmatter.md` — `tools:` section, "ambient tools are deliberately not inherited" paragraph (read-only)
- `spec_topics/tool-calls.md` — "No conversation turn" and "Concurrency" paragraphs (read-only)
- `spec_topics/slash-invocation.md` — prompt vs subagent mode driver behaviour (read-only)

## Plan Impact

**Phases:** Vertical V12, Vertical V14, Vertical V15

**Leaves (implementation order):**

- V12a — `mode: subagent` accepted; AgentSession spawn — (modified)
- V14e — Pi tool wired into `@` queries as model-callable — (modified)
- V14j — `tools: []` ≡ absent `tools:` — (modified)
- V15e — `.loom` paths in `tools:` (default basename naming) — (both)
- V15f — `.loom` path with `as` rename — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers will diverge: one will take the contract literally and call `pi.registerTool` for every loom referenced anywhere in any frontmatter, leaking subagent-mode looms into the user's Pi session and into other looms; another will read frontmatter.md's no-inheritance rule and scope registration to the invoking session only. The first design also breaks `V14j` (ambient tools not inherited) the moment any loom in the registry lists another loom. The second is correct but is not what the contract says.

## Solution Space

**Shape:** multiple

### Option A — Per-mode wiring; never use global `pi.registerTool` for loom callees

**Approach.** Drop the "*also* registers via `pi.registerTool`" rule. Instead:

- **Subagent mode.** Pass loom callees as `customTools` on `createAgentSession({ customTools, tools, ... })`, with `tools` listing the post-rename names of every entry in the loom's `tools:` (Pi tools and loom callees alike). The spawned session's active set is exactly the loom's callable set; nothing leaks because the session is private to the invocation.
- **Prompt mode.** Snapshot the user session's existing active-tool set on entry. Synthesise a one-shot `defineTool` per loom callee, register them via `pi.registerTool` with names namespaced (e.g. `__loom_callee_<sha>__<name>`), then call `pi.setActiveTools([...loomCallableSet, ...synthesisedNames])` for the duration of each query. On query exit, restore the snapshot. The synthesised registrations stay in the global registry for the process lifetime (no `pi.unregisterTool` exists) but are unreachable except via `setActiveTools`, and their hashed names guarantee no collision.

**Spec edits.** `pi-integration-contract.md` "Per-loom registration" replaced by two sub-bullets, one per mode. The subagent bullet is the dominant path; the prompt-mode bullet describes the snapshot-and-restore protocol explicitly. `frontmatter.md`'s no-inheritance paragraph is cross-referenced from the new prompt-mode bullet.

**Pros.**
- Subagent mode is exactly the SDK's intended shape (`customTools` + `tools` allowlist).
- No leakage between unrelated sessions; `V14j` holds by construction.
- Lifetime story is precise: per-invocation, scoped via `setActiveTools`.

**Cons.**
- Prompt-mode synthesised names persist in the global registry (unbounded growth across hot-reloads); must be paired with the existing finding on missing `pi.unregisterTool`.
- The two modes use different mechanisms; readers must hold both in their head.

**Risks.**
- `setActiveTools` snapshot/restore must be transactional across overlapping queries (e.g. if a tool call from one loom synchronously triggers another loom). The spec must say the prompt-mode driver serialises `setActiveTools` swaps around each query and that nested loom invocations are subagent-only (already true: `V15g` rejects prompt-mode callees in `tools:`).

### Option B — Global registration, but explicit lifetime and per-session activation

**Approach.** Keep `pi.registerTool` at loom-load time for any loom referenced in another loom's `tools:`, but state the lifetime as "process lifetime, registered once at loom-load." Make activation per-session: the loom interpreter calls `pi.setActiveTools(loomCallableSet)` before every query (prompt mode) and `createAgentSession({ tools, ... })` is the active set (subagent mode). State that the bare user session's active set is unaffected because Pi never auto-activates loom-synthesised tools.

**Spec edits.** `pi-integration-contract.md` "Per-loom registration" amended with a "Lifetime: process; activation: per-invocation via `pi.setActiveTools`" sentence and a sentence stating the registry leak is intentional and bounded by the active-tool gate.

**Pros.**
- Single registration site; same mechanism in both modes.
- Matches Pi's existing extension pattern (`registerTool` at startup, `setActiveTools` at runtime).

**Cons.**
- The "global registry but inactive by default" claim depends on Pi's session machinery never auto-activating extension-registered tools — needs verification against Pi source, not just stated.
- Hot-reload causes registry growth: every reload re-registers under the same name, which Pi may reject or may silently overwrite — behaviour unspecified by the SDK.
- Authors inspecting `pi.getAllTools()` see a long list of `__loom_callee_*` entries that are not user-callable, which is noise.

**Risks.**
- If Pi's default-active policy ever changes, this design silently regresses to the leak the finding describes.

### Recommendation

Take **Option A**. The subagent half is what the SDK's `customTools` field exists for, and the prompt-mode half makes the lifetime question answerable: "active for the duration of a query, then restored." Option B leans on a property of Pi (extension-registered tools are inactive by default in user sessions) that the contract would have to assert without controlling. The implementer must:

- Pair this with the related fix for "No `pi.unregisterTool()` API" — the prompt-mode synthesised names are subject to the same accumulation pattern as `__loom_respond_<hash>` typed-query tools, and both want a single cleanup story (e.g. content-hashed names so re-registration is idempotent).
- Confirm `pi.setActiveTools` is callable from inside a command handler (not only from `session_start`), and that snapshot/restore around a query is race-free under cancellation. If `setActiveTools` is session-scoped and the prompt-mode driver runs on the user's session, the snapshot must be taken from `pi.getActiveTools()` immediately before the swap and restored in a `try { ... } finally { ... }` around the `agent_end` await.

## Related Findings

- "No `pi.unregisterTool()` API — one-shot tools accumulate" — co-resolve (the prompt-mode synthesised loom-callee tools have the same lifetime problem as typed-query `__loom_respond_<hash>` tools; one cleanup mechanism serves both)
- "`tools` vs `customTools` in `createAgentSession`" — decision-dependency (Option A's subagent leg requires the corrected `customTools` shape that finding mandates; resolving that finding is a prerequisite)
- "Tool registry change mid-loom; concurrent model-driven tool execution" — same-cluster (touches snapshot-at-load-vs-per-call semantics for the Pi tool registry; same surface, independent fix)
- "`tools: []` ≡ absent `tools:`" is enforced by leaf V14j, which the chosen design must not regress — same-cluster (tracked via the Plan Impact list above, not a separate finding)

---

# Forced tool-use behaviour beyond Anthropic and OpenAI is unspecified

**Source:** docs/reviews/spec-review/spec-20260504-144255.md
**Original heading:** Forced tool-use unsupported on non-Anthropic/OpenAI providers
**Kind:** completeness, assumptions, implementability

## Finding

`pi-integration-contract.md` describes the typed-query mechanism as registering a one-shot `__loom_respond_<schema-hash>` tool and forcing the model to call it for that turn. The contract spells out the payload shape for two providers — Anthropic (`tool_choice: { type: "tool", name }`) and OpenAI Chat Completions (`tool_choice: { type: "function", function: { name } }`) — and then asserts that "the forced-tool-use approach is universal across providers." The asserted universality is not supported by the surrounding ecosystem.

Pi accepts any model whose provider routes through one of pi-ai's `api` types: `anthropic-messages`, `openai-completions`, `openai-responses`, `google-generative-ai`, `google-vertex`, `mistral`, `amazon-bedrock`, `cloudflare`, plus arbitrary OpenAI-compatible local servers (Ollama, vLLM, LM Studio, OpenRouter routes, custom proxies — see `pi-coding-agent/docs/models.md`). The capability matrix is non-uniform: pi-ai's Google adapter only exposes `toolChoice: "auto" | "none" | "any"` (no named-tool forcing); the OpenAI Responses / Codex adapter hard-codes `tool_choice: "auto"`; OpenAI-compatible local backends accept the `tool_choice` field but enforcement quality varies per model (small open-weights models routinely ignore it). Anthropic, OpenAI Completions, Bedrock, and Mistral do support named-tool forcing.

Three holes follow. (1) Whether the runtime should rewrite payloads via `before_provider_request` per provider, or instead route through pi-ai's existing `options.toolChoice` abstraction, is not stated — and these two paths require different code in the extension. (2) For providers that cannot force a specific tool by name (Gemini family, Codex Responses), the spec says nothing about whether typed queries are rejected at load time, downgraded to a different mechanism, or attempted-and-failed at runtime. (3) When forced tool-use silently fails — the model emits text instead of calling the synthesised tool — the spec does not say which `QueryError.kind` surfaces, nor whether the runtime distinguishes "provider does not enforce" from "model declined a single time."

## Spec Documents

- `spec_topics/pi-integration-contract.md` — "Conversation drive — prompt mode" bullet describing forced tool-use (edited)
- `spec_topics/pi-integration-contract.md` — "Conversation drive — subagent mode" bullet (subagent typed queries inherit the same mechanism) (edited)
- `spec_topics/query.md` — "Typed form" and "Failure modes" (option-dependent — only edited if a new `QueryError` sub-cause or a new failure mode is introduced)
- `spec_topics/frontmatter.md` — `model:` field semantics (option-dependent — only edited if load-time provider validation is added)
- `spec_topics/future-considerations.md` — JSON-mode fallback for non-forcing providers (option-dependent)

## Plan Impact

**Phases:** MVP, Vertical V3, Vertical V6, Vertical V12

**Leaves (implementation order):**

- M — Minimal end-to-end loom — (modified) — adds the first provider-touching code path; no typed queries yet, so unaffected unless a load-time provider check lands earlier
- V3a — Frontmatter parsing — (modified) — only if load-time validation of `model:` against a typed-query-capable provider list is added
- V6i — AJV validation of typed query results — (modified) — this leaf is where "schema lowered + handed to provider" is implemented; the synthesised one-shot tool, the `toolChoice` mechanism, and the unsupported-provider behaviour all land here
- V12a — `mode: subagent` accepted; AgentSession spawn — (modified) — subagent mode reuses the typed-query mechanism inside the spawned session and inherits the same provider-capability constraint

## Consequence

**Severity:** correctness

Two reasonable implementers will diverge: one uses pi-ai's `options.toolChoice` abstraction, another writes a `before_provider_request` payload-rewrite per provider. Looms authored against a Gemini, Codex, or weakly-compliant local model will either silently produce malformed output (model emits text, AJV-validation surfaces a `validation` error with no hint that the underlying cause is a provider that cannot enforce tool choice) or fail at registration time depending on which path the implementer chose. Authors will have no way to know which model selections are safe.

## Solution Space

**Shape:** multiple

### Option A — Route through pi-ai's `toolChoice` abstraction; narrow V1 to providers that support named-tool forcing

Approach. Stop describing provider-specific payload shapes in the spec. Use pi-ai's `options.toolChoice` (the abstraction already present in `anthropic.js`, `openai-completions.js`, `mistral.js`, `amazon-bedrock.js`) and let pi-ai's per-provider mapping carry the load. Define a V1-supported provider set: `anthropic-messages`, `openai-completions`, `mistral`, `amazon-bedrock` (the four where pi-ai exposes named-tool forcing). At loom load time, if the resolved model's provider is not in the set and the loom contains any typed-query site, emit a `loom/load/typed-query-unsupported-provider` warning naming the model and the offending query positions; the loom still loads, and at runtime the typed query returns `Err(QueryError { kind: "transport", message: "<provider> does not support forced tool-use; typed queries unavailable", retryable: false })`.

Spec edits.
- Replace the provider-specific `tool_choice` payload examples in `pi-integration-contract.md` with: "the runtime sets `options.toolChoice` to `{ type: "tool", name: "__loom_respond_<schema-hash>" }` when issuing the typed-query turn; pi-ai maps this to the appropriate provider payload."
- Add a one-paragraph "Provider capability matrix" subsection enumerating the V1-supported set and the load-time diagnostic.
- Add the `transport` sub-message above to `query.md`'s failure-modes section.

Pros. Smallest code surface in the extension. Inherits future provider additions to pi-ai for free. Honest about the V1 boundary. Diagnostic is observable at load time, not at first failed query.

Cons. Excludes Gemini and Codex from V1 typed-query use even though authors may want them. Authors who pick a local OpenAI-compatible model with weak `tool_choice` enforcement get no warning (the provider type is `openai-completions`; pi cannot tell that the *model* doesn't honor it).

Risks. Allowlist drift if pi-ai adds named-tool forcing to Google later — the spec needs to be re-checked rather than self-updating.

### Option B — Per-provider `before_provider_request` payload rewrites; reject unsupported providers at load time

Approach. Keep the spec's current "rewrite via `before_provider_request`" model but expand it to a full table covering every Pi-supported `api` type with its provider-native payload shape. Providers without named-tool-forcing support (Google, OpenAI Responses) cause a hard load-time error rather than a warning.

Spec edits. Add a normative table in `pi-integration-contract.md` mapping each pi-ai `api` value to its forcing payload, plus an explicit "unsupported" row listing `google-generative-ai`, `google-vertex`, `openai-responses`, `cloudflare`. Move the table out of the prose bullet into its own subsection so it is greppable.

Pros. Most explicit; implementer can match the spec line-for-line. No reliance on pi-ai abstraction stability.

Cons. Duplicates per-provider knowledge that already exists in pi-ai. Requires spec edits every time pi-ai adds a provider. Hard rejection at load time prevents authoring untyped-only looms against Gemini.

Risks. The spec's payload shapes can drift from pi-ai's actual SDK as upstream APIs change.

### Option C — Schema-restated-prompt + JSON-mode fallback for providers without forced tool-use

Approach. For providers in the V1-supported set (per Option A), use forced tool-use. For others, fall back: encode the lowered schema in a system-prompt addendum, request JSON output (using each provider's "JSON mode" where available, or no mode at all), parse the response, and feed the existing AJV pipeline (including coercion follow-ups). Both paths share the validate-then-coerce machinery already specified.

Spec edits. Add a "Fallback for providers without forced tool-use" subsection to `pi-integration-contract.md` covering the prompt template, the JSON-mode flag selection per provider, and the diagnostic surfaced when neither mechanism is available. Add a note to `query.md` that fallback paths consume `retry.attempts` the same way as forced-tool-use paths.

Pros. Maximum portability — every provider is usable. Existing coercion path absorbs malformed responses cleanly.

Cons. Loses grammar-constrained decoding; quality drops for typed queries on fallback providers. Doubles the V1 implementation surface (two query mechanisms). Authors get inconsistent reliability across models with no clear signal which path their loom is on.

Risks. The fallback path becomes a permanent second-class citizen; bugs accumulate there because nobody dogfoods it.

### Recommendation

Option A. Cost is bounded (load-time check + one new `transport` failure path), and pi-ai already does the per-provider work — the spec should not duplicate it. Option C is worth listing in `future-considerations.md` as the path forward when V1's narrow provider set proves restrictive in practice. The implementer should:

- Make the typed-query-capable provider set a single named constant in the runtime so V6i and V12a reference one source of truth.
- Surface the load-time warning through the existing `H3 — Diagnostics` channel with a stable code (`loom/load/typed-query-unsupported-provider`).
- For the local-OpenAI-compatible blind spot (provider type is supported but the specific model ignores `tool_choice`), document that a `validation` error with `attempts` exhausted on a model known to be weakly-compliant is the most likely symptom and is not separately diagnosable in V1.

## Related Findings

- "Typed query mechanism contradicts `query.md` tool-loop semantics" — same-cluster (both target the typed-query mechanism's specification; resolve independently)
- "`before_provider_request` cannot scope to a single turn" — decision-dependency (Option A makes this finding moot by routing through `options.toolChoice` instead of payload mutation; Option B leaves it live)
- "No `pi.unregisterTool()` API — one-shot tools accumulate" — same-cluster (both arise from the synthesised one-shot tool design; resolve independently)
- "`tools` vs `customTools` in `createAgentSession`" — same-cluster (touches subagent-mode tool registration, which V12a shares with the typed-query mechanism)

---

## spec_topics/query.md

---

# Model tool-call loop has no iteration cap

**Source:** docs/reviews/spec-review/spec-20260504-144255.md
**Original heading:** Tool-call loop is unbounded
**Kind:** error-model, completeness

## Finding

`spec_topics/query.md` defines the per-query tool-call loop in one sentence: *"the runtime executes the requested tool against the loom's frontmatter `tools` set, feeds the result back to the model, and loops until the model produces a final (non-tool-call) response."* No iteration cap, no token budget, no wall-clock budget, and no `QueryError` variant for "the model never stopped calling tools" are specified. The only documented exit besides a clean final response is cancellation via `AbortSignal` (`spec_topics/cancellation.md`) — i.e. an out-of-band signal from the user or a parent loom.

The neighbouring `retry.attempts` knob in `spec_topics/frontmatter.md` bounds *coercion follow-ups* on schema-validation failure, and the closing sentence of `query.md`'s coercion section explicitly says *"Each follow-up counts as one against `retry.attempts` regardless of how many tool-call iterations it contains"* — i.e. the spec authors considered tool-call iteration count and chose to leave it unbounded. That choice is unstated and undefended.

In practice this means a model that ping-pongs `bash` → `read` → `bash` indefinitely (a known failure mode of weaker tool-using models, and a known prompt-injection vector when one of the tools surfaces attacker-controlled text) consumes provider tokens, performs side effects, and holds the loom invocation open until the user notices and cancels. There is no per-loom, per-query, or runtime-default ceiling that would let a Pi extension implementer write a non-pathological tool-loop driver.

## Spec Documents

- `spec_topics/query.md` — "Tool calls during a query" paragraph; `QueryError` failure-modes table (edited)
- `spec_topics/frontmatter.md` — `retry:` block; possibly a sibling `tool_loop:` / `max_tool_iterations:` field (edited)
- `spec_topics/tool-calls.md` — `ToolFailureError` definition and its distinction from `ToolCallError` (option-dependent)
- `spec_topics/cancellation.md` — granularity statement, to cross-reference the new bound (read-only)
- `spec_topics/implementation-notes.md` — runtime tool-loop description (read-only)

## Plan Impact

**Phases:** Vertical V3, Vertical V5, Vertical V6, Vertical V12, Vertical V14

**Leaves (implementation order):**

- V3a — Frontmatter parsing — (modified — must recognise the new field)
- V5e — Prompt-mode conversation driver — (modified — driver enforces the cap)
- V5g — `QueryError` union — initial variants — (modified — add `tool_loop_exhausted` variant or extend `tool_failure` with a `cause` field; either way the union shape changes here)
- V6i — AJV validation of typed query results — (modified — typed-query path shares the same loop and must surface the new variant)
- V12a — `mode: subagent` accepted; AgentSession spawn — (modified — subagent driver enforces the same cap)
- V14e — Pi tool wired into `@` queries as model-callable — (modified — this is where the loop is exercised end-to-end and where the cap test naturally lives)

## Consequence

**Severity:** correctness

Two reasonable implementers will diverge: one will hard-code an arbitrary cap (25? 100?), one will leave it uncapped and rely on Pi's user-cancellation, one will route through the underlying provider SDK's own ceiling (which differs across Anthropic / OpenAI / Gemini / Ollama). User-visible behaviour — and the `QueryError` shape returned on exhaustion — therefore varies by implementation. Side-effecting tool loops that should fail closed will fail open or fail differently across providers.

## Solution Space

**Shape:** multiple

The cap itself is straightforward; the trade-offs are *where the knob lives* and *how exhaustion surfaces in `QueryError`*.

### Option A — New `tool_loop:` frontmatter block, dedicated `tool_loop_exhausted` variant

**Approach.** Add a sibling to `retry:` in `frontmatter.md`:

```yaml
tool_loop:
  max_iterations: 25   # default; 0 disables tool calls entirely
```

Add a new `QueryError` variant:

```loom
schema ToolLoopExhaustedError {
  kind: "tool_loop_exhausted",
  message: string,
  iterations: number,                  // == max_iterations on exhaustion
  last_tool_name: string | null,       // most recent tool the model called
  raw_response: string | null          // any text the model emitted alongside the final tool call
}
```

Extend the `QueryError` union with `| ToolLoopExhaustedError`.

**Spec edits.** `frontmatter.md`: new `tool_loop:` block, mirroring the `retry:` block's shape and "When to use which" tone. `query.md`: replace the "loops until ... final response" sentence with a bounded version that names the field and the resulting variant; extend the `QueryError` schema list. `tool-calls.md`: add a one-line cross-reference clarifying that loop exhaustion is distinct from `ToolFailureError` (which fires per-call).

**Pros.** Loop budget and validation budget are visibly separate (they protect different failure modes); the new variant carries fields that are useless on `tool_failure` (`iterations`, `last_tool_name`); authors `match`-ing on `kind` get a precise discriminator without a sub-`cause` dance.

**Cons.** Adds a new top-level frontmatter field for a single integer; widens the `QueryError` union by one variant.

**Risks.** Default of 25 may be too low for legitimate agentic workflows (Claude's own native agent tool-loop runs for tens of iterations on big tasks). Default needs an explicit rationale or a documented escape hatch (`max_iterations: 0` to disable, or a large explicit value).

### Option B — Co-locate under `retry:` as `retry.tool_iterations`, sub-cause on `tool_failure`

**Approach.** Extend the existing `retry:` block:

```yaml
retry:
  attempts: 3
  methodology: validator_error
  tool_iterations: 25   # new
```

Extend `ToolFailureError` with a sub-discriminator:

```loom
schema ToolFailureError {
  kind: "tool_failure",
  cause: "tool_error" | "loop_exhausted",   // new
  message: string,
  tool_name: string,
  tool_call_id: string | null,              // null on loop_exhausted
  iterations: number | null,                // populated on loop_exhausted
  raw_response: string | null
}
```

**Spec edits.** `frontmatter.md`: add `tool_iterations` row to the `retry:` block; `query.md`: revise the loop sentence to name the bound; widen `ToolFailureError` and document the `cause` discriminator.

**Pros.** No new top-level frontmatter field; no new `QueryError` variant; adjacent to the only other "how many turns before we give up" knob the spec exposes.

**Cons.** Conflates two semantically-distinct budgets (validation-coercion follow-ups vs. tool-call iterations) under one block; adds null-padded sentinel fields to `ToolFailureError` (`tool_call_id`, `iterations`) — exactly the pattern the `query.md` design notes call out as deliberately avoided ("there are no null-padded sentinel fields shared across variants"); makes `match QueryError { kind: "tool_failure", ... }` insufficient — authors must also check `cause`.

**Risks.** The "design notes" violation is the real cost. Future tool-related failure modes will accrete more sub-causes here.

### Option C — Runtime-default cap with no spec field

**Approach.** Pick a runtime default (e.g. 50), document it in `implementation-notes.md` only, surface exhaustion as `tool_failure` with `tool_name: "<loop>"`. No frontmatter knob.

**Spec edits.** `query.md`: one sentence noting "the runtime imposes an implementation-defined upper bound on tool-call iterations; on exhaustion, returns `Err(QueryError { kind: "tool_failure", ... })`."

**Pros.** Smallest spec change.

**Cons.** Authors of side-effect-heavy looms cannot tune the bound; the bound is opaque; `tool_failure` becomes a catch-all whose fields are populated inconsistently depending on whether the failure was per-call or loop-level.

**Risks.** Re-creates the implementer-divergence problem at the *value* of the default (and at the choice of variant fields), even if the *existence* of a default is now spec-mandated.

### Recommendation

**Option A.** A dedicated `tool_loop:` block and a dedicated `tool_loop_exhausted` variant cleanly separate two semantically-distinct budgets, preserve `query.md`'s explicit no-null-padding design rule, and give authors a precise `match` arm that carries fields meaningful only to that case (`iterations`, `last_tool_name`). Default `max_iterations: 25` with `0` documented as "disable model tool calls entirely" (equivalent to `tools: []` for the model side, while leaving code-side `<name>(...)` calls intact). Implementer must also decide:

- The cap counts *tool-call rounds* (one round = the model emitting ≥1 tool-use blocks, the runtime executing all of them, and feeding results back), not individual tool calls. Otherwise a parallel-tool-call model gets an arbitrary advantage.
- Cancellation via `AbortSignal` still pre-empts the loop at any iteration boundary; the cap is a ceiling, not a floor.
- During a coercion follow-up (`retry.attempts`), each follow-up gets a *fresh* `tool_loop` budget — the existing rule that "each follow-up counts as one against `retry.attempts` regardless of how many tool-call iterations it contains" already implies this and should be made explicit.
- `tool_loop_exhausted` is distinct from `cancelled`: the former is the runtime giving up on the model, the latter is the user / parent giving up on the runtime.

## Related Findings

- "Coercion follow-up failure modes unspecified" — same-cluster (both concern budget-exhaustion semantics inside the query loop; resolutions are independent but the same author should land them together for a coherent failure-mode story)
- "Typed query mechanism contradicts `query.md` tool-loop semantics" — decision-dependency (if that finding's resolution scopes the tool-call loop to *untyped* queries only, this finding's frontmatter field still applies but only to untyped queries; if it lands the two-phase pattern, the cap applies to the free-generation phase)
- "Forced tool-use unsupported on non-Anthropic/OpenAI providers" — same-cluster (both expose under-specification of the per-query model interaction loop; resolve independently)

---

# `ContextOverflowError` detection, field population, and coercion interaction unspecified

**Source:** docs/reviews/spec-review/spec-20260504-144255.md
**Original heading:** `ContextOverflowError` detection and field population unspecified
**Kind:** error-model, completeness, assumptions

## Finding

`spec_topics/query.md` defines the `ContextOverflowError` schema (`kind: "context_overflow"`, `message`, `tokens_used: number | null`, `tokens_limit: number | null`) and lists `context_overflow` in the `QueryError` union, but says nothing about how the runtime arrives at it. Three independent gaps remain:

1. **Detection source.** The runtime can plausibly classify a request as a context overflow at three distinct points: pre-flight via a token estimate against the model's window; reactively via a provider 4xx (e.g. OpenAI's `context_length_exceeded` error code, Anthropic's analogous response); or after the fact when a streamed response is truncated mid-emission. The spec picks none of these, and the choice is observable: pre-flight detection avoids a wasted provider call, while reactive detection is the only path that gives accurate populated values for `tokens_used` / `tokens_limit`.
2. **Field population rule.** `tokens_used` and `tokens_limit` are nullable but the spec never connects `null` to a concrete condition. Two implementers reading only the schema would diverge on whether `null` means "provider did not supply" or "we elected not to estimate".
3. **Coercion interaction.** A coercion follow-up turn (V13g–j) can itself overflow the context — the malformed response, the validator-error follow-up, and the corrected response all live in the same growing transcript. The spec does not say whether such an overflow surfaces as `context_overflow` (short-circuiting coercion) or is hidden inside a final `validation` error after `attempts` exhaustion. Both interpretations are consistent with the current text; they produce materially different `QueryError` shapes for the same underlying cause.

The companion finding **"Session-context token counting API unspecified"** observes that Pi exposes only `ctx.getContextUsage()` (whole-session total, no per-turn or per-rendered-template breakdown). That constraint sharply limits the feasibility of accurate pre-flight checks in V1.

## Spec Documents

- `spec_topics/query.md` — `QueryError` failure modes, `ContextOverflowError` schema, coercion section (edited)
- `spec_topics/pi-integration-contract.md` — prompt-mode drive, transport-error mapping (edited)
- `spec_topics/pi-integration.md` — provider-error surface available to the driver (read-only)
- `spec_topics/binder.md` — only existing reference to `ctx.getContextUsage()` (read-only)
- `spec_topics/slash-invocation.md` — `context_overflow` system-note row (option-dependent)

## Plan Impact

**Phases:** Vertical V5, Vertical V13

**Leaves (implementation order):**

- V5e — Prompt-mode conversation driver — (modified)
- V5g — `QueryError` union — initial variants — (modified)
- V13g — Coercion methodology: `validator_error` — (modified)
- V13h — Coercion methodology: `schema_repeat` — (modified)
- V13j — Coercion preserves tool-call side effects — (modified)

## Consequence

**Severity:** correctness

Two implementers will produce divergent `QueryError` shapes for the same overflow situation: one returns `{ kind: "context_overflow", tokens_used: null, tokens_limit: null }` immediately on a provider error, another exhausts `retry.attempts` and returns `{ kind: "validation", attempts: 3, ... }` whose root cause is hidden. Loom authors writing `match` arms against `kind: "context_overflow"` will silently miss the reclassified case; cost-control logic that relies on `tokens_used` will see `null` from one implementation and a number from another.

## Solution Space

**Shape:** multiple

### Option A — Reactive-only mapping (defer pre-flight to post-V1)

**Approach.** The driver issues every request as written. Provider error responses with a recognised "context exceeded" signature (OpenAI `context_length_exceeded` / `error.code`, Anthropic equivalent, generic 4xx with matching message) are mapped to `ContextOverflowError`. Other 4xx/5xx and network failures map to `TransportError` as today.

**Spec edits.** In `query.md`'s `ContextOverflowError` schema notes: "Detection: the runtime maps recognised provider 'context window exceeded' error responses to this variant. `tokens_used` and `tokens_limit` are populated when the provider supplies them in the error payload, and `null` otherwise. Pre-flight token estimation is out of V1 scope." In the coercion section: "If a coercion follow-up itself overflows the context, the runtime returns `Err(QueryError { kind: 'context_overflow', ... })` immediately. The follow-up does not count against `retry.attempts`, and the failure is not reclassified as `validation`."

**Pros.**
- No tokenizer dependency; no per-provider estimation table.
- Accurate by construction — the provider knows its own limit.
- Sidesteps the unresolved per-turn token API hole flagged in the sibling finding.
- Implementation lives entirely inside the Pi driver shim; no new runtime subsystem.

**Cons.**
- Every overflow costs one wasted provider request.
- Field population is best-effort: providers without structured overflow payloads yield `null`/`null`.
- For very large templates the wasted request may itself be slow (multi-second prompt-eval before rejection).

**Risks.**
- Provider error codes drift; the recognition set needs revisiting per provider release. Mitigate by documenting the matching rule in `pi-integration-contract.md` and treating unrecognised payloads as `TransportError` with `retryable: false`.

### Option B — Pre-flight estimation + reactive fallback

**Approach.** Before sending a query, estimate token count for the rendered template plus current conversation total (via `ctx.getContextUsage()` for the existing turns plus a chars-per-token heuristic for the new template). If the estimate exceeds a configured fraction of the model's window (e.g. 95%), short-circuit with `ContextOverflowError` populated from the estimate. Otherwise send; map provider overflow errors as in Option A.

**Spec edits.** Same as Option A, plus a normative section defining the estimation heuristic (chars-per-token by model, threshold fraction, treatment of tool-call payloads), and a statement that `tokens_used` reflects the estimate when pre-flight triggers and the provider's reported value when reactive triggers.

**Pros.**
- Avoids wasted provider requests for obviously oversized templates.
- Always produces non-null `tokens_used` / `tokens_limit`.

**Cons.**
- Requires a model→tokenizer (or chars-per-token) table; estimation drift means false positives (rejecting a request the provider would have accepted) and false negatives.
- Couples the runtime to model-specific knowledge already noted as missing (sibling finding "Session-context token counting API unspecified").
- More moving parts to test; threshold becomes a configuration question.

**Risks.**
- A too-conservative threshold blocks legitimate large queries; a too-loose one costs the wasted request anyway. Either failure mode is silent from the loom author's perspective.

### Option C — Hybrid with whole-session pre-flight only

**Approach.** Use `ctx.getContextUsage()` (already available, no heuristic) to gate: if the session is already above e.g. 90% of its limit before the new turn, return `ContextOverflowError` populated from that reading. Do not estimate the new template's contribution. Reactive mapping handles all other overflows.

**Spec edits.** As Option A plus: "If `ctx.getContextUsage()` reports the current session is already within 10% of the model's reported context limit, the runtime short-circuits the request with `ContextOverflowError`, populating `tokens_used` and `tokens_limit` from the API. Otherwise the request is dispatched and provider overflow errors are mapped reactively."

**Pros.**
- Uses only APIs that exist; no tokenizer.
- Catches the most common overflow case (long-running conversation pushing past the limit on a small new turn) without estimation.
- Populates fields whenever the pre-flight branch fires.

**Cons.**
- Misses the "single oversized template into a fresh session" case; that still pays for a wasted request.
- Threshold (10%) is arbitrary and unsupported by data.

**Risks.**
- Same threshold-tuning concern as Option B but with a smaller blast radius.

### Recommendation

**Adopt Option A for V1.** It produces a fully specified, deterministic detection rule that does not depend on token APIs Pi has not yet committed to expose, and it composes cleanly with the parallel finding's recommendation that non-validation failures during coercion short-circuit and do not consume `attempts`. Specifically, the spec should add:

- A normative "Detection" paragraph under `ContextOverflowError` in `query.md`: provider error payloads with a recognised "context exceeded" signature map to this variant; all other 4xx/5xx map to `TransportError`.
- A normative population rule: `tokens_used` and `tokens_limit` are populated iff the provider supplies them in the error payload; otherwise `null`. The matching/extraction rules per provider live in `pi-integration-contract.md`, not in the spec.
- A normative coercion clause in `query.md`'s coercion section: an overflow during a coercion follow-up returns the `ContextOverflowError` directly, does not consume an `attempts` slot, and is never reclassified as `validation`.
- A note in `future-considerations.md` that pre-flight estimation may be added when Pi exposes a per-turn or per-string tokenization API.

Edge cases the implementer must watch:

- Streamed responses truncated mid-emission because the *output* hit the context boundary: classify as `context_overflow` (not `validation`), with `raw_response` set to the partial text. The current spec already permits `raw_response` on this variant via the design note.
- A provider that returns the overflow as an HTTP 200 with an error envelope (some do): the driver must inspect the body, not only the status, before falling through to `TransportError`.
- Recognised-overflow payloads with no token-count fields: emit `tokens_used: null, tokens_limit: null` — this is the documented `null` condition, not a bug.

## Related Findings

- "Coercion follow-up failure modes unspecified" — co-resolve (the same coercion clause closes both)
- "Empty / very large rendered templates unspecified" — same-cluster (also asks for an oversized-template policy; resolved here as "reactive only in V1")
- "Session-context token counting API unspecified" — decision-dependency (rules out Option B until Pi exposes a per-turn tokenizer)
- "Per-`kind` system-note table covers only 5 of 8 `QueryError` variants" — same-cluster (the `context_overflow` system-note row already exists in `slash-invocation.md`; no new copy needed here)
- "`QueryError` variants split across three files with no consolidated reference" — same-cluster (any consolidation effort should pull the new detection paragraph along)

---

# `let _ = @\`…\`` has no observability contract

**Source:** docs/reviews/spec-review/spec-20260504-144255.md
**Original heading:** Discarded `Result` is a silent observability black hole
**Kind:** error-model

## Finding

The spec promotes `let _ = @\`…\`` as the sanctioned way to discard a query `Result` (`spec_topics/query.md` line 87) and twice gestures at "silent-drop semantics" — once in `errors-and-results.md` (line 48) and once in `functions.md` (line 16, the `void` return type) — but never says what "silent" is contracted to mean. Three concrete questions are left open:

1. **Where does a discarded `Err` go?** Nothing in the spec says whether it is logged to Pi's diagnostics channel, surfaced as a `loom-system-note`, written to a debug sink, counted, or simply dropped on the floor. Two implementers will reasonably choose differently — one will treat the discard as the author's promise that the failure is uninteresting and emit nothing; the other will route every `Err` to a `loom/runtime/*` diagnostic on the grounds that swallowing transport / cancellation / context-overflow without a trace is hostile to operators. Both are defensible; the spec picks neither.

2. **Does the discard cover the `void`-function tail-expression case?** `query.md` (line 93) explicitly carves out tail-expression `@\`…\`` in a `void` function ("not a discard: the `Result` is the function's return value"), yet `functions.md` (line 16) describes the `void` return type as discarding "with the same silent-drop caveat as expression-statement queries". `void` functions have no caller to receive the `Result`, so the carve-out is incoherent with itself. Whichever way it resolves, the observability contract for the value that is in fact dropped is the same gap as (1).

3. **Are panics elided by `let _ =`?** The spec lists three panic sources in `errors-and-results.md` (non-exhaustive `match`, OOB, null/missing-key access), and a query template's `${expr}` interpolation can trip any of them. Panics are defined to bypass `?` and `match`, but `let _ = …` is not mentioned. A naive reader could assume the bare-`@`-statement diagnostic is *only* about acknowledging the `Result`, and that wrapping in `let _ =` therefore contains everything the RHS produces — including a panic during interpolation. The spec needs to state that panics arise during evaluation of the RHS and propagate before the binding completes; `let _ =` is not a `try`/`catch`.

The first gap is the substantive one: the spec ships a `#[must_use]`-style enforcement (the bare-`@` parse error) and then provides an escape hatch with no defined runtime behaviour, defeating the diagnostic value of the rule it just enforced.

## Spec Documents

- `spec_topics/query.md` — "Discarded query results are a parse error" (edited)
- `spec_topics/errors-and-results.md` — `?`-operator paragraph mentioning "silent-drop semantics" (edited)
- `spec_topics/functions.md` — `void` return type paragraph (edited)
- `spec_topics/diagnostics.md` — code namespaces table (option-dependent; needed if a `loom/runtime/discarded-error` code is added)
- `spec_topics/pi-integration-contract.md` — System notes paragraph (option-dependent; needed if discards route through `loom-system-note`)
- `spec_topics/slash-invocation.md` — per-`kind` Err table (option-dependent; needed if prompt-mode discards surface to the user)
- `spec_topics/bindings.md` — `_` discard form (read-only; the discard rule lives here but does not change)

## Plan Impact

**Phases:** Vertical V5, Vertical V9, Vertical V18

**Leaves (implementation order):**

- V5f — Bare expression-statement query is parse error — (modified)
- V9e — `void` return type — (modified)
- V18h — Custom Pi message type `loom-system-note` and renderer — (option-dependent; modified only under Option B)
- V18m — Panic routing: slash-command surface — (modified; adds the `let _ =`-does-not-elide-panics assertion to the test list)

## Consequence

**Severity:** correctness

A loom that sets up retry-on-failure with `let _ = @\`probe\``-style probes can fail in production with no trace anywhere — no diagnostic, no system note, no log line — because the implementer who built the runtime read the spec as "silent means silent". An equally-honest implementer who reads "silent" as "not user-visible, but logged for operators" produces a runtime where the same probe writes a line per attempt to Pi diagnostics. Both ship; both pass the V5f acceptance test as currently written; the second is debuggable and the first is not.

## Solution Space

**Shape:** multiple

### Option A — Honour the discard; debug-channel log only

**Approach.** Define `let _ = expr` as a true discard at the loom-author surface: no `loom-system-note`, no `Result<_, QueryError>` propagation. The runtime emits a single structured entry on Pi's diagnostics channel under a new code `loom/runtime/discarded-error`, carrying `{ file, line, kind, message }` — visible to operators via Pi's diagnostics output but never injected into the user's transcript. Add an explicit sentence in `query.md` and `errors-and-results.md` that panics arising during evaluation of the RHS propagate before the binding completes and are unaffected by `let _ =`. Resolve the `void`-function inconsistency in favour of `functions.md`: a `void` tail-expression is also a discard, with the same debug-log contract.

**Spec edits.** `query.md` discarded-results section: add an "Observability" paragraph naming the diagnostic code, payload shape, and one-emit-per-discard cardinality; add the panics-pass-through sentence. `errors-and-results.md`: replace the bare phrase "silent-drop semantics" with "debug-logged-but-not-user-surfaced semantics" and link to the new paragraph. `functions.md`: same. `diagnostics.md` code-namespaces table: add `loom/runtime/discarded-error`.

**Pros.** Preserves the author's explicit-discard intent in user-facing surfaces. Operators retain a forensic trail. No load on the system-note channel, which already carries user-visible signal. Panic clarification is a one-sentence edit.

**Cons.** Adds a new responsibility to Pi's diagnostics channel that the spec previously left unused at runtime. Operators have to know to look at the channel.

**Risks.** If Pi's diagnostics channel does not currently support runtime emission with structured payloads (only load-time `LoadExtensionsResult.errors`), this either requires Pi-side work or quietly degrades to console output.

### Option B — Surface every discarded `Err` as a `loom-system-note`

**Approach.** Every `Err` flowing into `let _ = …` produces a one-line `loom-system-note` formatted from the `QueryError` per the `slash-invocation.md` per-`kind` table. Same channel as a top-level prompt-mode `Err`. Subagent mode (no user-visible transcript) downgrades to debug-log per Option A. Same panic clarification as Option A.

**Spec edits.** Same as Option A, plus an additional row or footnote in `slash-invocation.md`'s per-`kind` table noting that discarded `Err` re-uses the same formatter prefixed with `"discarded: "`.

**Pros.** Authors who write `let _ = @\`…\`` and then wonder why nothing happens see the failure immediately in the transcript. Symmetric with prompt-mode top-level `Err` surfacing — no surprise about where errors go.

**Cons.** Defeats the explicit-discard intent: the parse-error rule exists to make the author *acknowledge* the `Result` once, not to *suppress* its observability. A transient-transport-failure probe inside a hot loop produces transcript spam. Authors will reach for ways to silence the note, recreating the original silent-discard pattern at a higher cost.

**Risks.** Spam in retry loops degrades the prompt-mode UX. The `loom-system-note` channel becomes harder to scan for genuinely user-relevant notes.

### Recommendation

Option A. The discard form is a contract between the author and the runtime ("I have considered this `Result` and intend to drop it"); the operator-facing diagnostic channel is the right place to preserve forensic visibility without re-injecting the dropped signal into the user's transcript. Implementer edge cases to nail down: (1) the diagnostic must fire exactly once per discard event, even when the discarded value carries a chained `invoke_callee_error`; (2) panics during `${expr}` interpolation propagate as panics — `let _ =` does not catch them, and V18m's tests must assert this; (3) reconcile `query.md` line 93 and `functions.md` line 16 by treating the `void`-function tail-expression `Result` as a discard with the same diagnostic, removing the "function's return value" carve-out (a `void` function has no caller to hand a `Result` to).

## Related Findings

- "Logging, metrics, and cost/token accounting missing entirely" — same-cluster (both demand a runtime observability story; this finding is the narrowest concrete instance)
- "`pi.sendMessage` failure has no fallback" — decision-dependency (if Option B is chosen, the discard-note inherits that finding's fallback question)
- "Panic message content per source unspecified" — same-cluster (the `let _ =`-does-not-elide-panics clarification names the same panic sources)

---

# Empty and oversized rendered query templates have no specified behaviour

**Source:** docs/reviews/spec-review/spec-20260504-144255.md
**Original heading:** Empty / very large rendered templates unspecified
**Kind:** completeness

## Finding

`spec_topics/query.md` defines the `@`...`` template surface, the dedent and newline-trim normalisations, and the `QueryError` union — but never says what happens when the rendered text the runtime is about to send to the provider is *degenerate*. Two concrete cases fall through:

1. **Empty / whitespace-only after rendering.** A literal `` @`` ``, a single-line `` @`${x}` `` where `x` interpolates to `""`, or a multi-line block whose entire body is stripped by newline-trim + dedent. Several providers reject empty-content user turns at the API layer (Anthropic returns 400 on empty `content`; OpenAI returns 400 on empty `messages[*].content`). Today the spec offers no diagnostic, no parse warning, and no runtime contract — the loom either silently sends an empty turn (and surfaces whatever the provider returns as `transport`) or silently sends a whitespace blob, neither of which is useful.

2. **Oversized template.** No statement on whether the runtime performs a pre-flight token count against the model's context window or relies on the provider to reject the request. The `ContextOverflowError` variant is defined but its *trigger* is undefined: pre-flight check, provider 4xx, or truncated response are all live possibilities. This couples to the related `ContextOverflowError` detection gap below.

The result is undefined behaviour at the most common point of author error (an unintentionally-empty interpolation) and ambiguity at the most operationally-painful one (a prompt that grows beyond the model's window).

## Spec Documents

- `spec_topics/query.md` — Multi-line templates / Failure modes (edited)
- `spec_topics/query.md` — `ContextOverflowError` schema and detection rule (edited)
- `spec_topics/pi-integration-contract.md` — Prompt-mode driver / `sendUserMessage` contract (read-only — confirms there is no Pi-level pre-flight)

## Plan Impact

**Phases:** MVP, Vertical V5, Vertical V6, Vertical V13

**Leaves (implementation order):**

- M — Minimal end-to-end loom — (modified — must not crash on a `${x}` that renders empty during the smoke loom)
- V5c — Multi-line templates: newline-trim and dedent — (modified — add a parse-time warning when the *static* template body is empty or whitespace-only after dedent)
- V5e — Prompt-mode conversation driver — (modified — runtime check before `ctx.sendUserMessage`; synthesise the empty-template error without calling the provider)
- V5g — `QueryError` union — initial variants — (modified — pin down `ContextOverflowError` detection source as part of declaring the variant)
- V6i — typed-query validation surfacing — (modified — clarify that empty-rendered-template short-circuits typed queries the same way as untyped, before any schema enforcement)
- V13g — coercion follow-up loop — (modified — overflow detection rule must apply to coercion turns too; see related "Coercion follow-up failure modes" finding)

## Consequence

**Severity:** correctness

Two reasonable implementers will diverge: one will pre-validate and reject empty rendered templates with a Loom-defined error, another will pass them through and surface whatever the provider returns (a `transport` error from a 400, an empty `Ok("")`, or worse an `Ok` containing the model's "I don't understand" response). For overflow, one implementer will pre-flight token-count and another will rely on the provider 4xx — meaning the same loom under the same input produces different `QueryError` variants depending on runtime. Both gaps are observable from author-written tests and would block a stable conformance suite.

## Solution Space

**Shape:** multiple

### Option A — Reject empty at runtime; defer overflow detection to provider (V1)

**Approach.** Two-layer empty-template defence:

- **Parse-time warning** (V5c): if a template's *static* body — every literal segment between interpolations — is empty or whitespace-only after dedent, emit a non-fatal `empty-template` parse warning. Authors who genuinely want a whitespace prompt can suppress with `\n` or similar literal escapes.
- **Runtime error** (V5e): immediately before `ctx.sendUserMessage`, if the *fully-rendered* text (post-interpolation, post-dedent, post-trim) has length 0 or matches `/^\s*$/`, the query short-circuits to `Err(QueryError { kind: "validation", message: "rendered query template is empty" })` without consuming a network round-trip. (Reuse `validation` rather than coining an eighth variant — it's the closest semantic match for "input the runtime refused before sending".)

For overflow, V1 ships **post-hoc detection only**: the runtime maps a provider's overflow signal (Anthropic `400 invalid_request_error` with the documented overflow message; OpenAI `context_length_exceeded`) to `ContextOverflowError`. `tokens_used` and `tokens_limit` are populated when the provider's error payload supplies them, `null` otherwise. No pre-flight tokeniser, no heuristic. Pre-flight is listed in `future-considerations.md` as deferred pending a Pi-level token-count API.

**Spec edits.**

- `spec_topics/query.md` — add a "Degenerate rendered templates" subsection under "Multi-line templates" with the two-layer rule. Update the `ContextOverflowError` schema commentary to state the post-hoc detection source and the population rule for `tokens_used` / `tokens_limit`.
- `spec_topics/future-considerations.md` — add a one-line entry: "Pre-flight token-count check before `sendUserMessage` (currently overflow surfaces only after provider rejection)."

**Pros.**

- No tokeniser dependency; nothing to mis-estimate.
- Empty-template rule is a single, mechanical predicate — trivial to test and conform to.
- Surfaces the empty case *before* the network, eliminating an entire class of mysterious provider 400s.

**Cons.**

- Authors only learn about overflow after a wasted provider round-trip (cost + latency).
- Overflow detection depends on provider error-message stability, which has historically drifted.

**Risks.**

- Provider error-message format changes silently. Mitigated by a versioned mapping table inside the prompt-mode driver and a fallback "if the provider rejected and we can't classify, surface as `transport`".

### Option B — Reject empty at runtime; chars-per-token heuristic for pre-flight overflow

**Approach.** Same empty-template handling as Option A. For overflow, additionally: before `ctx.sendUserMessage`, estimate token count as `ceil(rendered.length / 4)` (or model-specific ratio if the model registry exposes one) and compare against the model's context window minus a 25 % safety margin. If the estimate exceeds, short-circuit to `ContextOverflowError` with `tokens_used` set to the estimate and `tokens_limit` set to the configured window. Provider-side overflow continues to map to `ContextOverflowError` as a backstop.

**Spec edits.** Same as Option A, plus a normative paragraph specifying the heuristic, the safety margin, and the model-window source.

**Pros.**

- Catches obviously oversized prompts (e.g. a template that interpolates a 200 KB file) without burning a request.
- Gives authors a deterministic local check.

**Cons.**

- Introduces a heuristic the spec elsewhere works hard to avoid.
- Requires a model-window registry that doesn't currently exist in Loom's surface; couples to "Session-context token counting API unspecified" — a decision Loom can't make alone.
- 4-chars-per-token is wrong by ±50 % for non-English text; the safety margin is a magic number.

**Risks.**

- A correct prompt is rejected pre-flight because the heuristic over-counts; debugging the false positive is hard because the loom never reached the provider.
- Spec accumulates a heuristic that is hard to remove once authors depend on it.

### Recommendation

Take **Option A**. The empty-template rule is unambiguous and cheap; the post-hoc-only overflow rule is honest about what V1 can do without inventing a tokeniser surface that the related `getContextUsage` finding shows Pi does not currently provide. Pre-flight overflow is worth deferring to a future considerations entry where it can land alongside a real token-count API rather than a magic-number heuristic.

Edge cases the implementer must watch:

- An interpolated `${expr}` whose value renders as `""` — must trigger the runtime check, not just the static parse warning.
- A template that is non-empty before dedent but empty after (entire body was common-leading whitespace) — the runtime check fires; the parse warning fires too because static analysis sees the same outcome.
- During coercion follow-up turns: if the *follow-up* prompt assembled by the runtime renders empty (should be impossible but worth a defensive check), short-circuit the same way — and do **not** consume an `attempts` slot. Cross-reference the related coercion-failure finding.
- Provider-overflow detection must run after streaming completes; mid-stream errors are still classified at end-of-stream.

## Related Findings

- "`ContextOverflowError` detection and field population unspecified" — co-resolve (Option A's overflow paragraph is the same edit that closes that finding)
- "Session-context token counting API unspecified" — decision-dependency (Option B is only viable if Pi gains a per-turn token-count API; choosing Option A side-steps the dependency)
- "Coercion follow-up failure modes unspecified" — same-cluster (overflow during coercion needs the same post-hoc detection rule and must not consume an `attempts` slot)
- "Interpolation of non-string values unspecified" — same-cluster (both touch what `${expr}` renders to; an `${x}` where `x` is `null` or an empty array is the most likely real-world source of an empty rendered template)

---

## spec_topics/binder.md

---

# Two-arm `needs_info` / `ambiguous` envelope buys little for V1

**Source:** docs/reviews/spec-review/spec-20260504-144255.md
**Original heading:** `needs_info` / `ambiguous` distinction is V1 scope creep
**Kind:** scope

## Finding

The binder envelope defines three arms: `ok`, `needs_info`, and `ambiguous`. The two failure arms differ in their schema (only `ambiguous` carries `candidates: array<string> | null`) and in the system-note prefix that gets rendered (`loom /<name>: <msg>` vs. `loom /<name>: ambiguous arguments — <msg>`). Beyond that, V1 behaviour is identical: emit a one-line system note in the caller's session, do not start the loom.

That is thin justification for the structural cost. The prefix difference is purely cosmetic — the model already writes the message, and a model that determined the input was ambiguous can say so in prose. The `candidates` field is even weaker: the V1 spec accepts it in the schema and the failure-modes table renders only `<model's message>`, with no mention of enumerating candidates. Plan leaf V16m says the system note has "candidates enumeration", but that contradicts the spec example (`loom /code-review: ambiguous arguments — "focusing on Ada" could mean focus_areas or author. Be more explicit.`), which inlines the candidate list into the prose message and never references the structured field. So in V1 the `candidates` array is data the binder is asked to produce that is then discarded.

The real motivation is forward compatibility: `future-considerations.md` lists "Binder refinement loop: multi-turn `needs_info` negotiation" as deferred, and that future feature genuinely needs the two arms separated (only `needs_info` reopens; `ambiguous` would still terminate). That motivation should be either acted on (collapse now, split when the refinement loop lands) or stated explicitly in the spec, not left implicit so that an implementer reading just `binder.md` sees two arms doing the same thing and either over-implements (V16m's phantom enumeration) or wonders whether they're missing a requirement.

## Spec Documents

- `spec_topics/binder.md` — Binder envelope, Failure modes, Echo policy (edited)
- `spec_topics/future-considerations.md` — Binder refinement loop bullet (read-only)

## Plan Impact

**Phases:** Vertical V16

**Leaves (implementation order):**

- V16c — Binder envelope schema construction — (modified)
- V16l — `needs_info` envelope handling — (modified)
- V16m — `ambiguous` envelope handling — (modified)

## Consequence

**Severity:** advisory

The two-arm design is implementable as written, so nothing is broken. The cost shows up as wasted implementation effort (V16m's `candidates` rendering that the spec example does not actually require), reviewer confusion ("why two arms that look identical?"), and a quiet contradiction between `binder.md`'s failure-modes table and `plan_topics/v16-binder.md`'s V16m description.

## Solution Space

**Shape:** multiple

### Option A — Collapse to a single failure arm in V1

**Approach.** Replace `needs_info` and `ambiguous` with one `kind: "failure"` arm carrying just `message: string`. Update the envelope schema, the system prompt template, and the failure-modes table accordingly. When the deferred binder refinement loop is specified, that future revision splits the arm again — but along whatever axis the refinement loop actually needs, which may not be the current `needs_info` / `ambiguous` cut.

**Spec edits.**
- `binder.md` Binder envelope: drop the third bullet; rewrite the second as `{ kind: "failure", message: string }`.
- `binder.md` envelope JSON schema: drop the `ambiguous` `anyOf` arm; rename `needs_info` → `failure`.
- `binder.md` system prompt template: collapse the two failure bullets into one.
- `binder.md` failure modes table: merge rows 1 and 2 into a single `failure` row.
- `binder.md` echo channel example: keep one example, drop the "ambiguous arguments —" prefix variant.

**Pros.**
- Smallest V1 schema and smallest system prompt.
- Removes the V16m / spec-table contradiction.
- Removes a `candidates` field that V1 produces and discards.

**Cons.**
- When the refinement loop lands, the schema changes shape, breaking any external observer of binder envelopes (there is currently none — the envelope is runtime-internal — but stack-trace logs may reference it).
- Slightly weaker model signal: `temperature: 0` tier-2 models sometimes do better when the schema separates "I cannot determine X" from "I have multiple candidates for X".

**Risks.** Low. The envelope is runtime-internal per the spec ("never a Loom-visible type"), so collapsing doesn't break a public contract.

### Option B — Keep two arms, give `candidates` real V1 work

**Approach.** Leave the schema as written, but commit V1 to actually rendering `candidates` distinctly from `message` in the `ambiguous` system note (matching V16m's intent). Update `binder.md`'s failure-modes table and the echo example to show structured rendering, e.g.:

> loom `/code-review`: ambiguous arguments — "focusing on Ada"; candidates: focus_areas, author. Be more explicit.

**Spec edits.**
- `binder.md` failure modes table row 2: change to `loom /<name>: ambiguous arguments — <msg>; candidates: <c1, c2, …>` (with a rule for `null` / empty).
- `binder.md` echo channel: replace the `ambiguous` example with one that shows the candidate list rendered.
- `binder.md` Binder envelope: add one sentence stating `candidates` is rendered by the runtime when non-null/non-empty.

**Pros.**
- Two arms now have observable V1 difference, justifying the schema cost.
- Aligns spec with plan leaf V16m as currently written.

**Cons.**
- Adds rendering rules (null vs empty vs non-empty, separator, truncation) that interact with the 120-char echo cap.
- Doesn't address the "why ask the model to distinguish these two cases at all in V1" question — it just makes the answer "because we render them differently."

**Risks.** New rendering rules add surface area that the schema-subset / echo-formatter sections must stay in sync with.

### Option C — Keep two arms, document the forward-compat rationale

**Approach.** Leave schema, prompt, and failure-modes table as written. Add one paragraph to `binder.md` immediately after the envelope description stating: "The two failure arms produce indistinguishable V1 user-facing behaviour beyond the system-note prefix; the structural distinction exists for the deferred binder refinement loop (cf. `future-considerations.md`), where only `needs_info` reopens for a clarifying turn." Also fix V16m: drop the "candidates enumeration" claim and align it with the spec table (render only `<message>`).

**Spec edits.**
- `binder.md` Binder envelope: add a one-paragraph rationale note as described.
- `plan_topics/v16-binder.md` V16m Adds: change "with `candidates` enumeration" to "matching the failure-modes table"; tests no longer require enumeration rendering.

**Pros.**
- Smallest spec churn.
- Preserves the schema shape that a future refinement loop will want.
- Removes the V16m contradiction by aligning plan to spec rather than spec to plan.

**Cons.**
- V1 still asks the model to populate `candidates` even though V1 discards it. Wasted output tokens on every `ambiguous` envelope.
- Rationale-only fix; the underlying "two arms doing the same thing" smell remains, just labelled.

**Risks.** None material.

### Recommendation

Take **Option C**. The envelope is runtime-internal so the cost of carrying `candidates` is ~30 output tokens on the rare `ambiguous` path, and the forward-compat motivation is genuine — the deferred refinement loop has been called out in `future-considerations.md` for exactly this reason. Document the rationale in `binder.md`, fix the V16m / spec-table contradiction by aligning the plan leaf to the spec (drop "candidates enumeration"), and revisit when the refinement loop is specified.

Edge case the implementer must watch: the `candidates` field stays in the schema (binder may emit it; AJV accepts `null`), but the runtime must not surface it in V1. A test asserting that the `ambiguous` system note text does not contain candidate values keeps V16m honest.

## Related Findings

- "Binder echo text is attacker-controlled without sanitisation" — same-cluster (touches the same `message` field; sanitisation applies regardless of how many failure arms exist)
- "Binder envelope schema violates schema-subset rules without declaring an exception" — same-cluster (collapsing arms under Option A would not remove the `anyOf` / discriminator issue; resolves independently)
- "Non-normative content mixed into binder spec" — same-cluster (Option C adds rationale prose, which that finding would want labelled non-normative)

---

# Binder model resolution: missing default and missing capability contract

**Source:** docs/reviews/spec-review/spec-20260504-144255.md
**Original heading:** Binder model resolution unspecified when no model is configured
**Kind:** assumptions, completeness

## Finding

`spec_topics/binder.md` describes the binder-model resolution chain as
"`binder_model:` frontmatter → Pi setting `looms.binderModel` → default: a
cheap tier-2 model such as Claude Haiku, GPT-4o-mini, or Gemini Flash."
Two normative gaps follow from that wording:

1. **The "default" is not a default.** "A cheap tier-2 model such as …" is
   a recommendation, not a value. There is no defined identifier the
   runtime can fall back to when both the frontmatter field and the Pi
   setting are absent. "Tier-2" is also undefined elsewhere in the spec —
   no model registry, no capability tag, no provider table — so an
   implementer cannot derive a concrete fallback algorithmically either.
   `plan_topics/v16-binder.md` V16e ("Ships when: binder model resolves
   predictably") therefore has no acceptance criterion: "predictably"
   resolves to whatever the implementer guesses.

2. **Strict-mode capability is assumed silently.** The binder envelope is
   handed to the provider as a strict structured-output / strict
   tool-input schema (see `implementation-notes.md` line 23 and the
   envelope shape in `binder.md`). Models without that capability — older
   OpenAI models, most local models, several Anthropic legacy models —
   will return free-form JSON the runtime cannot rely on. The spec does
   not say what the runtime does when the resolved binder model lacks
   strict-mode support: reject at load time, fail at first invocation,
   degrade to a coercion loop, or assume Pi only registers
   strict-capable models.

Both gaps are independent: even after a concrete default is named, the
capability question still has to be answered.

## Spec Documents

- `spec_topics/binder.md` — "Binder model" paragraph (edited)
- `spec_topics/frontmatter.md` — `binder_model` row in the example block and the field's bullet on line 31 (edited)
- `spec_topics/implementation-notes.md` — binder-call bullet (line 23) (edited)
- `spec_topics/schema-subset.md` — strict-mode preamble (read-only; reference for the capability requirement)
- `spec_topics/pi-integration-contract.md` — provider-specific tool-choice handling (read-only; clarifies which providers' strict mode the runtime relies on)

## Plan Impact

**Phases:** Vertical V3, Vertical V16

**Leaves (implementation order):**

- V3a — Frontmatter parsing — (modified)
- V16e — `binder_model` resolution chain — (modified)
- V16f — `bind_context: none` — (blocked)
- V16g — `bind_context: session` truncation — (blocked)
- V16h — Binder determinism settings — (blocked)
- V16n — Binder transport failure single retry — (blocked)

## Consequence

**Severity:** correctness

Two reasonable implementers will diverge: one will hard-code a Haiku
identifier and silently break for users on OpenAI-only or local-only Pi
installs; another will treat the absent Pi setting as a load-time error;
a third will pass `undefined` and let Pi's session default flow through,
which on a Sonnet-configured session defeats the binder's whole cost
story. The capability gap turns binder reliability into a function of
deployment configuration that the spec never mentions.

## Solution Space

**Shape:** multiple

### Option A — Inherit the loom's `model` when binder model is unresolved

**Approach.** Extend the chain to four steps: frontmatter `bind_model:` →
Pi setting `looms.binderModel` → loom's own `model:` → Pi session
default. No new configuration surface; reuses the precedent already set
by `model:` in `frontmatter.md` line 41 ("if frontmatter omits `model`,
the loom inherits Pi's session default").

**Spec edits.** Replace the parenthetical in `binder.md` with the
four-step chain. Add a normative paragraph: "The resolved model must
support strict structured-output / strict tool-input. The runtime checks
this at loom-load time by querying Pi's model registry; absence of
strict capability is a load-time error with code
`loom/load/binder-model-not-strict-capable`."

**Pros.** Zero new Pi-side surface. Works out of the box on any Pi
install that has at least one model configured. Frontmatter-only authors
need no additional setup.

**Cons.** A loom whose main `model:` is Sonnet pays Sonnet rates for
every binder call — silently negates the "cheap tier-2" cost premise.
Authors who do not know about `bind_model:` get an expensive default.

**Risks.** The cost regression is invisible until a billing surprise.

### Option B — Require `looms.binderModel`, fail-fast at load

**Approach.** Make `looms.binderModel` a required Pi-extension setting
once at least one slash-invokable, non-bypass loom is loaded. If
unresolved (no frontmatter `bind_model:`, no Pi setting), the loom load
fails with `loom/load/binder-model-unresolved` and the slash command is
not registered. Strict-mode capability is checked at the same point.

**Spec edits.** Drop the "default: a cheap tier-2 model such as …"
clause from `binder.md`. Add: "If neither `bind_model:` nor
`looms.binderModel` resolves, the loom fails to load with
`loom/load/binder-model-unresolved`; the loom is reported in
`LoadExtensionsResult.errors` and its slash command is not registered.
The resolved model must support strict structured-output / strict
tool-input; otherwise the loom fails to load with
`loom/load/binder-model-not-strict-capable`." Update
`implementation-notes.md` line 23 to match. Update the
`looms.binderModel` description in `frontmatter.md` to "required when
any non-bypass loom is in scope."

**Pros.** No silent cost regression. Clear single owner of the choice
(the Pi-extension installer). Capability check catches misconfigurations
at load, not on first user `/command`. Spec stays free of model
identifiers that age out.

**Cons.** A bare `pi install pi-loom` with no further configuration
cannot run a non-bypass loom — first-run friction. Requires a documented
"set this Pi setting" install step.

**Risks.** Friction may push users toward bypass-only loom designs, or
toward a config copy-paste from docs that drifts.

### Option C — Hard-code a concrete default identifier per provider

**Approach.** The spec names a specific model per registered provider
(e.g., `claude-haiku-4-5` for Anthropic, `gpt-4o-mini` for OpenAI,
`gemini-2.0-flash` for Google) and the runtime picks the one matching
the Pi session's default-provider configuration.

**Spec edits.** Replace "such as" with a concrete table mapping provider
→ default binder model. Add a normative paragraph requiring the runtime
to error if the session's default provider has no entry in the table.

**Pros.** Zero-config first-run experience.

**Cons.** Couples the spec to model identifiers that age out on a
quarterly cadence. Forces a spec edit every time a provider deprecates a
model. Provides no answer when the user runs Pi against a local-only
provider or a custom-registered provider.

**Risks.** Spec drift; per-provider table will not stay current; edge
providers permanently broken.

### Recommendation

**Option B.** The binder model is a deployment concern, not a language
concern; pushing the choice to `looms.binderModel` keeps the spec free
of model identifiers and keeps cost surprises out of the default path.
The capability check belongs in the same load-time pass.

Edge cases the implementer must handle:

- The capability probe should query Pi's registered model metadata
  (whatever surface Pi exposes). If Pi does not expose a strict-capable
  flag, the spec's load-time check degrades to "best-effort"; the
  fallback is a runtime envelope-malformed failure already covered by
  V16o, so the user-facing damage is bounded but the error code is
  `loom/runtime/binder-malformed-envelope` rather than
  `loom/load/binder-model-not-strict-capable`. Document the fallback
  explicitly.
- Bypass-eligible looms (V3c) must skip both checks — they never call
  the binder.
- The `loom/load/binder-model-unresolved` error must surface through
  `LoadExtensionsResult.errors` (see the related finding on that
  channel) so users see it at extension-load time, not at first slash
  invocation.
- Hot-reload of Pi settings (`looms.binderModel` changed at runtime)
  should re-resolve on the next loom load, not retroactively fix
  already-failed loads.

## Related Findings

- "`binder_model` prefix inconsistent with `bind_context` / `bind_echo`" — co-resolve (the rename to `bind_model` lands in the same edit to `frontmatter.md` and `binder.md` and is referenced in Option B's spec edits)
- "Non-normative content mixed into binder spec" — same-cluster (touches the same "Binder model" and "Cost and latency" paragraphs; resolving this finding rewrites the paragraph that the cruft-removal finding wants to prune)
- "`LoadExtensionsResult.errors` is not a runtime-callable diagnostics channel" — decision-dependency (Option B routes a new load-time error code through that channel; the channel's resolution shape constrains how `loom/load/binder-model-unresolved` is surfaced)
- "`settings.json` `looms` array shape unspecified" — decision-dependency (Option B adds `looms.binderModel` as a required field; the settings-shape finding must accommodate it)
- "No diagnostic codes assigned to named parse errors" — same-cluster (Option B introduces two new diagnostic codes that the codes-assignment finding's resolution must enumerate)

---

## spec_topics/frontmatter.md

---

# Absent / empty `params:` and slash-argument overflow behaviour undefined

**Source:** docs/reviews/spec-review/spec-20260504-144255.md
**Original heading:** `params:` absent/empty and slash-argument excess behaviour unspecified
**Kind:** completeness

## Finding

The spec is silent on two related questions about argument-less looms:

1. **What does an absent or empty `params:` block mean?** `frontmatter.md` lists `params:` among the recognised fields and documents its grammar, but never states whether the field is required, whether `params:` may be present-and-empty (`params: {}`), and whether the two forms are equivalent. The MVP loom in `plan_topics/m-mvp.md` (`hello.loom`) deliberately omits `params:`, so this is not a hypothetical.
2. **What happens when the user supplies extra slash text to such a loom?** For `/hello some extra words`, the spec does not say whether the runtime errors out, silently discards the trailing text, surfaces a system note, or attempts to invoke the binder against an empty parameter set. `binder.md` describes when the binder runs (whenever `params:` exists and the bypass does not apply) but never the inverse — what to do when there is nothing to bind.

These two gaps interact: the answer to (1) determines whether the binder is even on the table for (2), and the answer to (2) determines what the MVP slash-handler must do when V3a parses an empty frontmatter. Without a normative answer, two implementers will diverge on both the user-facing message and on whether a `customType: "loom-system-note"` message is emitted.

## Spec Documents

- `spec_topics/frontmatter.md` — top-level `params:` description and field table (edited)
- `spec_topics/binder.md` — "Binder bypass" / preconditions for invoking the binder (edited)
- `spec_topics/slash-invocation.md` — invocation flow from Pi (edited)
- `spec_topics/diagnostics.md` — system-note copy strings if the chosen option emits one (option-dependent)

## Plan Impact

**Phases:** MVP, Vertical V3, Vertical V16

**Leaves (implementation order):**

- M — Minimal end-to-end loom — (modified)
- V3a — Frontmatter parsing — (modified)
- V3b — `params` typed declaration — (modified)
- V3c — Bypass binder for single-string param — (modified)
- V16f — Default `bind_context: none` binder path — (modified)

## Consequence

**Severity:** correctness

The `/hello extra text` case is reachable on day one of the MVP, and there is no spec sentence that decides between rejecting, ignoring, echoing, or binder-invoking on the trailing text. Two implementers will produce visibly different behaviour for the same loom and the same slash text, and the MVP test ("Run produces exactly one `send` call with the literal text") cannot be expressed unambiguously without first picking an answer.

## Solution Space

**Shape:** multiple

### Option A — Silent acceptance, no diagnostic

`Approach`
- Absent `params:` and `params: {}` are equivalent and mean "loom takes no parameters."
- The binder never runs for a no-param loom (no envelope to construct, no fields to extract).
- Extra slash text after the command name is discarded silently. The loom runs as if invoked with no arguments. `bind_echo` has no effect (nothing to echo).

`Spec edits`
- `frontmatter.md`: state that `params:` is optional; absent and `{}` are equivalent; defines the no-param loom as "binder skipped, slash arguments after the command name are discarded."
- `binder.md` "Binder bypass" paragraph: extend the bypass enumeration with a "no-params" case that precedes the single-string bypass.
- `slash-invocation.md`: one sentence under the binder paragraph clarifying the no-params case.

`Pros`
- Maximally permissive; matches user intuition that `/hello whatever` should still print "hello."
- Zero new diagnostic surface area.

`Cons`
- Hides typos: a user typing `/hello-with-args foo` against `/hello-no-args` (autocomplete miss) gets no signal.
- Trailing text is observably discarded with no record in the transcript.

`Risks`
- Authors who later add `params:` to an existing no-param loom will see previously-silent invocations start either binding or failing, with no migration warning.

### Option B — Silent acceptance with one-line system note

`Approach`
- Same as Option A for binder skip and successful execution.
- When the trimmed remainder of the slash text is non-empty, emit a single `customType: "loom-system-note"` message before the loom runs: `loom /<name>: ignoring extra arguments — this loom takes no parameters`.
- The note is informational, never blocks execution.

`Spec edits`
- All edits from Option A, plus:
- `slash-invocation.md` and/or `diagnostics.md`: add the note copy to the per-`kind` table (or to a separate "binder-side notes" table).

`Pros`
- Surfaces the autocomplete-miss case without aborting.
- Consistent with the existing system-note discipline (custom-typed message, persists in transcript).

`Cons`
- Adds one more copy string that the prescription-level finding (`### System-note copy strings: prescription level unresolved`) must cover.
- Slightly more implementation work in the MVP slash-handler (must trim and length-check the remainder).

`Risks`
- If `bind_echo: true` is allowed on a no-param loom, authors may be confused by the absence of an echo line; the spec must rule that `bind_echo` is meaningless (parse warning, or silently ignored) when `params:` is absent.

### Recommendation

Adopt **Option B**. The MVP must answer this question to write its own ships-when test, and a one-line note costs almost nothing while protecting the autocomplete-miss case that Option A leaves silent. Concretely:

- Treat absent `params:` and `params: {}` as a single state ("no-params loom"); reject the redundant `params: null`.
- Skip the binder entirely for no-params looms; do not construct an envelope schema.
- After trimming, if the remainder of the slash text is non-empty, emit `loom /<name>: ignoring extra arguments — this loom takes no parameters` as a `customType: "loom-system-note"` (same channel as the prompt-mode failure notes in `slash-invocation.md`), then run the loom.
- `bind_echo` on a no-params loom is a parse warning (`loom/load/bind-echo-without-params`) and produces no echo line either way.
- `bind_context` and `binder_model` on a no-params loom: silently ignored (they affect a binder that never runs); no warning, since they may be inherited from project-wide settings.

Edge cases the implementer must watch:
- Whitespace-only remainders (`/hello   `) trim to empty and emit no note.
- The note must not fire when the loom is invoked via `invoke(...)` or as a registered tool — both paths skip the slash parser entirely and have no notion of "extra text."
- V3c's bypass detection must run **after** the new no-params check, so a `params: {}` loom does not accidentally fall into the single-string bypass branch.

## Related Findings

- "`mode:` default and required-vs-optional fields unspecified" — co-resolve (the same frontmatter-field table proposed there should carry the absent/empty `params:` row)
- "`params:` default expression grammar boundary cases" — same-cluster (touches `params:` semantics but resolves independently)
- "`bind_echo` / binder-bypass echo suppression not cross-referenced" — decision-dependency (the no-params echo-suppression rule above must align with whatever cross-reference that finding lands)
- "System-note copy strings: prescription level unresolved" — decision-dependency (Option B adds one more copy string subject to whatever prescription policy is chosen)
- "`needs_info` / `ambiguous` distinction is V1 scope creep" — same-cluster (both touch binder envelope surface area but resolve independently)

---

# `params:` default-value literal grammar is undefined

**Source:** docs/reviews/spec-review/spec-20260504-144255.md
**Original heading:** `params:` default expression grammar boundary cases
**Kind:** completeness, implementability, prescription

## Finding

`spec_topics/frontmatter.md` allows `params:` declarations to carry a default — `field: type = literal` — and constrains the RHS to "string, number, boolean, `null`, or a JSON-shaped object/array literal." The phrase **"JSON-shaped"** is never defined anywhere in the spec, and the worked example contradicts strict JSON:

```yaml
author: Author = { name: "anon", role: "developer", experience_years: 0 }
```

This object uses bare identifier keys, which `JSON.parse` would reject. So either the example is wrong or "JSON-shaped" is a relaxed dialect that nobody has named.

`spec_topics/expressions.md` cross-references the same hole: "Bare object literals … are not legal in expression position … The frontmatter `params:` defaults are the one exception: the param's declared type supplies the schema name, so the literal is bare (and is parsed as JSON-shaped, not as a Loom expression)." This says where the rule lives but still does not define the surface.

Three concrete questions an implementer cannot answer from the current text:

1. **Object key syntax.** Bare identifiers, JSON-strict double-quoted strings, both, or YAML-style? Are trailing commas allowed? Single-quoted strings? Embedded comments?
2. **Enum defaults.** For `severity: Severity = ???`, must the author write the loom-side variant access (`Severity.High`) or the wire string (`"high"`)? `expressions.md` and `schemas.md` recommend `Enum.Variant` "whenever the value is named in code," but that is a Loom expression, not a literal — and the rule says no expressions. If wire strings are required, defaulted enum values arrive at runtime as plain strings with no `__loomEnum` brand, breaking the cross-enum equality contract in `runtime-value-model.md`.
3. **Discriminated-union defaults.** `expressions.md` requires variants to be constructed via the variant schema name (`Cat { ... }`, not `Animal { species: "cat", ... }`). A literal default cannot use that form. Are discriminated-union-typed defaults outright forbidden, or accepted in their lowered wire shape (`{ species: "cat", name: "Whiskers" }`) with the runtime relying on discriminator detection at AJV time?

Each question has at least two reasonable answers, and the spec endorses none. Two implementers reading this section in good faith will produce incompatible loaders.

## Spec Documents

- `spec_topics/frontmatter.md` — params defaults paragraph (edited)
- `spec_topics/expressions.md` — object construction paragraph cross-reference (edited)
- `spec_topics/schemas.md` — enum variant access rules (read-only)
- `spec_topics/runtime-value-model.md` — enum brand contract (read-only, option-dependent)
- `spec_topics/schema-subset.md` — enum lowering (read-only)

## Plan Impact

**Phases:** Vertical V3, Vertical V16

**Leaves (implementation order):**

- V3c — Bypass binder for single-string param — (modified)
- V16a — Param defaults — (modified)
- V16b — Default merging after binder — (modified)
- V16d — Defaulted-fields-relaxed in envelope's `args` arm — (modified)

V3c only needs a wording tweak ("no default" must be defined precisely once defaults' grammar is). V16a is the load-of-the-fix: its **Adds**/**Tests** lines currently quote the same undefined "JSON-shaped" phrase and need expansion to cover enums, discriminated unions, and brand restoration. V16b/V16d inherit the merged-shape contract.

## Consequence

**Severity:** correctness

A V1 author writes `severity: Severity = "high"`; another writes `severity: Severity = Severity.High`. One implementation accepts the first and rejects the second; the other does the reverse. The runtime-value brand on defaulted enums is the worst case: silent misbehaviour where `==` against `Severity.High` returns `false` for defaulted values because the brand is absent.

## Solution Space

**Shape:** multiple

### Option A — Strict JSON, wire-form for named values

**Approach.** The default RHS is parsed by `JSON.parse`. All object keys must be double-quoted; no trailing commas; no comments. Enum defaults must be the wire string (`"high"`). Discriminated-union defaults must be the lowered wire object including the discriminator field. After AJV validates the merged args, the runtime walks the typed shape and re-applies enum brands and any other runtime-value invariants.

**Spec edits.**
- `frontmatter.md`: replace "JSON-shaped object/array literal" with "JSON literal as accepted by `JSON.parse`". Update the `Author` example to use double-quoted keys.
- `frontmatter.md`: add a paragraph: "Enum defaults are written as the wire-form string. Discriminated-union defaults are written in lowered wire form. The runtime restores enum brands and any other runtime-only invariants after AJV validation but before the loom body executes."
- `expressions.md`: amend the cross-reference to say "parsed as a JSON literal."
- `runtime-value-model.md`: add a one-line note that defaulted enum values have brands restored post-AJV.

**Pros.** Implementation reuses `JSON.parse`. The grammar is one well-known sentence. AJV validation against the lowered schema is straightforward — defaults are already in wire shape.

**Cons.** The current example breaks. Authors must write defaults differently from constructions in body code (`"high"` vs `Severity.High`, `{ "species": "cat", "name": "x" }` vs `Cat { name: "x" }`), violating the "one way to write a value" principle the rest of the spec tries to maintain. Brand restoration is an extra runtime pass, not free.

**Risks.** Authors will instinctively write `Severity.High` and get a parse error; the diagnostic must explicitly suggest the wire form. Forgotten brand restoration manifests as flaky equality bugs that pass unit tests for non-defaulted code paths.

### Option B — Loom literal sublanguage, named values allowed

**Approach.** Define a "literal" sublanguage that is a strict subset of Loom expression syntax: primitive literals, `null`, bare-key object literals (schema name supplied by the LHS type), array literals, `Enum.Variant` access, and variant-schema construction (`Cat { ... }`). No identifiers other than enum/variant names, no operators, no calls, no interpolation. Parsed by the existing Loom expression parser with a post-parse "is-literal" check. Lowered to runtime values directly — no brand restoration needed because `Enum.Variant` already constructs the branded value.

**Spec edits.**
- `frontmatter.md`: replace "JSON-shaped object/array literal" with a definition of the literal sublanguage. Worked examples for each shape: primitive, array, schema, enum, discriminated-union variant.
- `expressions.md`: amend the cross-reference: "parsed as a Loom literal — a closed subset of expression syntax (string/number/boolean/null literals, array literals, bare-key object literals against the LHS schema, `Enum.Variant`, and variant-schema construction)."
- `frontmatter.md`: list the rejection set: any operator, any call, any interpolation, any non-enum identifier reference is `loom/parse/default-not-literal`.

**Pros.** Existing example is already conforming. One way to write each value across body and frontmatter. Enum brand contract holds for free. Discriminated-union defaults have a natural surface (`Cat { name: "Whiskers" }`).

**Cons.** Slightly more parser surface than `JSON.parse`. The "is-literal" check must enumerate exactly what counts; missing a case (e.g., negation `-1` for negative-number literals) is easy.

**Risks.** Authors will try expressions that "look literal" — `[1, 2] + [3]`, `Severity.High.toLowerCase()` — and the diagnostic must distinguish "not a literal" from "syntax error." Negative numbers need an explicit carve-out (`-1` is a unary-minus expression in pure Loom grammar; defaults must accept it as a numeric literal).

### Recommendation

Option B. The defaults section is the only place in the language where a value is written without expression context, and aligning it to the rest of Loom — `Enum.Variant`, `Cat { ... }` — keeps authors from learning a parallel JSON dialect. The brand-restoration concern in Option A is a real bug surface that vanishes under B.

Edge cases the implementer must nail in `spec_topics/frontmatter.md`:

- Negative numeric literals (`-1`, `-3.14`) are accepted; treat unary `-` on a numeric literal as a literal.
- Object-literal field order must match the schema's declared order, or be free? Pick free, matching `Schema { ... }` constructors elsewhere.
- Every declared field of the LHS schema must be present (no partial defaults), matching the constructor rule in `expressions.md`.
- Discriminator fields in union-variant defaults are implicit (the variant schema supplies them), matching `Cat { name: "x" }` in body code.
- The "is-literal" check runs at parse time against the Loom AST; the rejection diagnostic is `loom/parse/default-not-literal` and names the offending sub-expression.

## Related Findings

- "`mode:` default and required-vs-optional fields unspecified" — same-cluster (both want a complete defaults story for frontmatter; resolve independently)
- "`params:` absent/empty and slash-argument excess behaviour unspecified" — same-cluster (both touch `params:` semantics gaps)
- "`system:` interpolation grammar and edge cases unspecified" — same-cluster (both define a frontmatter sublanguage; the precedent set here for "literal subset of Loom" can inform the system-interp grammar shape)

---

# `retry` vs "coercion" — one mechanism, two names, never equated

**Source:** docs/reviews/spec-review/spec-20260504-144255.md
**Original heading:** `retry` vs "coercion" — same concept, two names never equated
**Kind:** naming, consistency

## Finding

The schema-validation recovery mechanism is named twice. `frontmatter.md` introduces it as `retry:` (with `retry.attempts` and `retry.methodology`); `query.md` describes the same machinery throughout as **coercion** ("Schema-validation coercion", "coercion follow-ups", "coercion via follow-up turns"). The two names are never explicitly equated in a normative sentence — the closest is an inline phrase in `frontmatter.md` ("max coercion follow-ups per typed query") and the bullet at line 75 ("`attempts` bounds the number of follow-up coercion turns"), which require the reader to notice that the `retry:` block configures something the next file calls coercion.

The split has knock-on effects. The `QueryError` `ValidationError` variant has an `attempts` field — described in `query.md` as "coercion follow-ups made before giving up" but configured by `retry.attempts`. The plan's V13 page is already titled "Wire names, descriptions, retry/coercion", showing implementers have noticed the gap. The word "retry" is also used elsewhere in the spec for unrelated mechanisms (`TransportError.retryable`, the binder's single-shot transport retry in V16n, "this retry vs. coercion" debates), making the overload more than cosmetic — it loads a verb that already means something else onto a specifically chosen technique.

`coercion` is the more precise term. The mechanism does not re-issue the original turn (which is what "retry" implies and what `transport.retryable` actually means); it appends a *new* user turn that coerces the model toward the schema. The `query.md` text itself calls this out as a deliberate distinction.

## Spec Documents

- `spec.md` — Topic index (lines 28–29) (edited)
- `spec_topics/frontmatter.md` — `retry:` block in the example (lines 18–20), bullet explaining `retry` (lines 75–86), "When to use which" subsection (option-dependent — also covered by a sibling finding)
- `spec_topics/query.md` — "Schema-validation coercion" section (lines 165–168), `ValidationError.attempts` field comment (line 111) (edited)
- `spec_topics/implementation-notes.md` — AJV bullet (line 24): "Coercion and default-filling are disabled" refers to AJV's *built-in* string→number coercion, not the loom mechanism; needs a clarifying parenthetical so a reader doesn't think the loom-level coercion has been turned off (option-dependent)
- `plan_topics/v13-wire-names.md` — V13 page title and V13f–V13j leaf names/bodies (option-dependent — only edited under Option A)
- `plan_topics/coverage-matrix.md` — rows at lines 27 and 31 (option-dependent)

## Plan Impact

**Phases:** Vertical V13

**Leaves (implementation order):**

- V13f — `retry:` frontmatter parsing — (modified)
- V13g — Coercion methodology: `validator_error` — (modified)
- V13h — Coercion methodology: `schema_repeat` — (modified)
- V13i — Coercion methodology: `none` — (modified)
- V13j — Coercion preserves tool-call side effects — (modified)

(Modification under Option A is a pure rename of the frontmatter key from `retry` to `coercion`; under Option B the leaves are untouched and only spec wording moves.)

## Consequence

**Severity:** advisory

Loom authors will read either `frontmatter.md` or `query.md` first and form a mental model under one name; switching files forces them to re-derive the equivalence. The overload of "retry" with `transport.retryable` and the binder's single-retry behaviour compounds the friction. The mechanism itself is unambiguously specified, so implementers will not diverge on behaviour — but a future docstring writer, error-message author, or library author exporting helpers around the field is likely to perpetuate the inconsistency.

## Solution Space

**Shape:** multiple

### Option A — Rename `retry:` → `coercion:`

**Approach.** Make `coercion` the sole name everywhere. The frontmatter block becomes `coercion:` with `coercion.attempts` and `coercion.methodology`. `query.md` keeps its current vocabulary; `frontmatter.md` switches.

**Spec edits.**
- `spec_topics/frontmatter.md`: example block `retry:` → `coercion:`; bullet at line 75 rewritten with the new key; "When to use which" stays under coercion (or is deleted per the sibling finding).
- `spec_topics/query.md`: replace `retry.attempts` / `retry.methodology` with `coercion.attempts` / `coercion.methodology` at lines 165–168.
- `spec.md` line 28: replace ", `retry`," with ", `coercion`,".
- `spec_topics/implementation-notes.md` line 24: clarify the existing sentence as "AJV's built-in string-to-primitive coercion is disabled" to avoid colliding with the loom-level term.
- `plan_topics/v13-wire-names.md`: V13 title stays ("retry/coercion" → "coercion" optional); V13f title and body switch to `coercion:`; V13g–V13j bodies switch `retry.attempts` → `coercion.attempts`.
- `plan_topics/coverage-matrix.md` line 27: row label updated.
- `plan_topics/v3-frontmatter.md` line 6: `retry` → `coercion` in the recognised-fields list.

**Pros.** Eliminates the split at the source. "coercion" matches the mechanism's actual semantics (append a new turn, not re-issue). Frees the verb "retry" for `transport.retryable` and the binder's actual retry behaviour.

**Cons.** Loom authors arriving from generic LLM-tooling background will look for `retry:` first; `coercion:` is jargonish. Slightly higher plan churn — five leaves and the coverage matrix touched.

**Risks.** None substantive; V13 is not yet implemented so no installed-loom backwards-compat concern.

### Option B — Keep `retry:`, add normative equivalence

**Approach.** Keep the YAML key as `retry:` (matching author intuition for an LLM tool) and add one explicit equivalence sentence in each affected file so the reader is never left to infer it.

**Spec edits.**
- `spec_topics/frontmatter.md`: replace the bullet at line 75 with: "`retry` controls schema-validation **coercion** — the recovery mechanism the [Query](./query.md) section specifies in full. `retry.attempts` bounds the number of coercion follow-ups; `retry.methodology` selects the phrasing strategy. (The `retry:` block is the only configuration surface for coercion; the two terms refer to the same mechanism throughout this spec.)"
- `spec_topics/query.md`: prepend to "Schema-validation coercion." paragraph at line 165: "Coercion is the mechanism configured by the loom's `retry:` frontmatter block (see [Parameters and Frontmatter](./frontmatter.md))."
- `spec.md` line 29: change "coercion" to "coercion (`retry:`)" so the index makes the link visible.
- `spec_topics/implementation-notes.md` line 24: same clarifying parenthetical as Option A.
- Plan files unchanged.

**Pros.** Zero plan churn; preserves author-facing key name; least invasive. Honours the principle that the configuration block name and the mechanism name can legitimately differ as long as the mapping is stated once.

**Cons.** Does not address the "retry" overload with `transport.retryable` and the binder's transport retry. Two names continue to coexist; future drift is more likely than under Option A.

**Risks.** A future contributor adds a third name (e.g. "repair", "fixup") in a related context, having seen that synonyms are tolerated.

### Recommendation

**Option A — rename to `coercion:`.** V13 has not shipped, so the rename costs five small leaf edits and zero installed-loom impact. The result is one name, no equivalence footnote needed, and the verb "retry" is left available for the genuinely retry-shaped behaviour in the binder and transport layers.

Edge cases the implementer must watch:

- `ValidationError.attempts` field semantics are unchanged; the field name does not become `coercion_attempts`. Only the frontmatter key and dotted accessors rename.
- `frontmatter.md`'s "When to use which" subsection is the subject of a separate finding recommending deletion — coordinate the rename so it does not re-introduce the deleted text.
- The `pi.recognised-frontmatter-field` warning code in V3a (and any test fixtures asserting recognised fields) needs the new key.
- `implementation-notes.md` line 24 must be touched to disambiguate AJV's built-in coercion from loom's coercion regardless of which option ships — both meanings would otherwise collide.

## Related Findings

- "`retry` methodology \"when to use which\" is authoring advice in a spec" — co-resolve (touches the same `frontmatter.md` `retry:` bullet block; rename and deletion should land together)
- "Coercion follow-up failure modes unspecified" — same-cluster (same mechanism; resolves independently but should adopt whatever name this finding settles on)
- "Coercion follow-up may re-trigger tool side effects" — same-cluster (same mechanism; same name-adoption point)
- "Binder failure retry counts inconsistent" — decision-dependency (uses "retry" for the binder's transport-level retry; renaming the loom mechanism to `coercion:` reduces overload pressure on this finding)
- "Terminology drift: \"callable set\" / \"tool set\" / \"tools\" for the same concept" — same-cluster (same shape: one mechanism, multiple names; consistent resolution policy desirable)

---

## spec_topics/discovery.md

---

# `--loom` CLI flag is extension-registered and cannot be repeatable as specified

**Source:** docs/reviews/spec-review/spec-20260504-144255.md
**Original heading:** `--loom` CLI flag is not a Pi built-in; repeatable string flag type undocumented
**Kind:** codebase-grounding-broad, assumptions, prescription, completeness

## Finding

`spec_topics/discovery.md` lists `--loom <path>` as a CLI discovery source and labels it "(repeatable, optional)", and `spec_topics/pi-integration-contract.md` describes the extension entry point without mentioning that this flag has to be set up by the extension itself. Two things are wrong with that picture.

First, `--loom` is not a Pi built-in. The Pi SDK exposes flags only via `pi.registerFlag(name, options)` (see `extensions.md` §`pi.registerFlag` and `dist/core/extensions/types.d.ts` line 823). The loom extension must register `--loom` itself in its factory; the spec never says so, leaving the most natural reading — that Pi parses `--loom` for us — wrong.

Second, the SDK signature is concretely:

```ts
registerFlag(name: string, options: {
  description?: string;
  type: "boolean" | "string";
  default?: boolean | string;
}): void;
getFlag(name: string): boolean | string | undefined;
```

Only `boolean` and `string` are accepted, `default` is a single scalar, and `getFlag` returns a single scalar. There is no array type and no documented repetition semantics — passing `--loom a.loom --loom b.loom` will, at best, leave only the last value visible to `getFlag("loom")`. The spec's "repeatable" qualifier therefore describes behaviour Pi does not provide.

## Spec Documents

- `spec_topics/discovery.md` — Source list (sources, priority) (edited)
- `spec_topics/pi-integration-contract.md` — Extension entry point (edited)
- `C:\Users\thomasa\AppData\Roaming\npm\node_modules\@mariozechner\pi-coding-agent\docs\extensions.md` — `pi.registerFlag` reference (read-only)
- `C:\Users\thomasa\AppData\Roaming\npm\node_modules\@mariozechner\pi-coding-agent\dist\core\extensions\types.d.ts` — `ExtensionAPI.registerFlag`, `getFlag` signatures (read-only)

## Plan Impact

**Phases:** Vertical V14

**Leaves (implementation order):**

- V14o — Discovery: `--loom` CLI flag — (both)
- V14p — Source priority and shadowing warning — (option-dependent: modified if the CLI level is dropped or relabelled)

## Consequence

**Severity:** correctness

Two implementers will diverge: one will register a single-valued `--loom` and silently drop all but the last occurrence; another will invent a parser for repetition or a list separator. End users on Windows (`;` vs `:` for path lists) get inconsistent behaviour, and V14o's stated test ("multiple flags") cannot be implemented against the SDK as written.

## Solution Space

**Shape:** multiple

### Option A — Single string flag, path-list separator

**Approach.** Register `--loom` once with `type: "string"`. The extension splits the value on the OS path-list separator (`:` on POSIX, `;` on Windows, matching `PATH`/`NODE_PATH`). Each entry is a file or directory, resolved with the same rules as the `looms` settings array.

**Spec edits.**
- `discovery.md`: change `CLI: --loom <path> (repeatable, optional)` to `CLI: --loom <paths> (single flag; multiple paths joined with the OS path-list separator — ':' POSIX, ';' Windows)`.
- `discovery.md`: cross-reference the settings-array entry shape so file/directory semantics are shared.
- `pi-integration-contract.md`: add to the entry-point bullet list: "Registers a CLI flag via `pi.registerFlag('loom', { type: 'string', description: '…' })` and reads it with `pi.getFlag('loom')` during `resources_discover`."

**Pros.** One registration call; matches Pi's SDK exactly; familiar separator convention; no schema invention.
**Cons.** Path-list separators are a known Windows footgun (paths containing `;` or drive letters with `:`).
**Risks.** Drive-letter colons on Windows (`C:\foo`) collide with the POSIX separator — but the chosen separator is `;` on Windows precisely to dodge this, so it is benign in practice.

### Option B — Single string flag, comma-separated

**Approach.** Same as A, but the separator is `,` on every platform.

**Spec edits.** As Option A, with the separator changed.

**Pros.** Cross-platform identical syntax; simple to document.
**Cons.** Commas are legal in filenames on every supported OS; an author with `weird,name.loom` cannot use the CLI source.
**Risks.** Filename collisions are rare but silent — the path simply fails to resolve.

### Option C — Single path only

**Approach.** Register `--loom` as `type: "string"`. Exactly one path. Multiple paths are explicitly out of scope; users wanting more must use the settings `looms` array or drop files into `.pi/looms/`.

**Spec edits.**
- `discovery.md`: drop "(repeatable, optional)"; add "Exactly one path. For multiple paths, use the `looms` settings array."
- `pi-integration-contract.md`: as Option A.
- `plan_topics/v14-tool-calls.md` V14o: drop the "multiple flags" test.

**Pros.** Maximally honest about the SDK; smallest implementation surface; no separator question.
**Cons.** Loses ergonomics for one-shot multi-loom invocations (`pi --loom a.loom --loom b.loom`).
**Risks.** None.

### Option D — Drop the CLI source entirely

**Approach.** Remove `--loom` as a discovery source. Rely on global, project, package, and settings sources only. CLI override is deferred to future considerations.

**Spec edits.**
- `discovery.md`: remove the CLI bullet from the source list and from the priority list (now four levels).
- `pi-integration-contract.md`: no `registerFlag` call.
- `plan_topics/v14-tool-calls.md`: delete V14o; renumber or compress V14p priority tests.
- `spec_topics/future-considerations.md`: add an entry for CLI-supplied looms.

**Pros.** Removes the entire correctness question; one fewer entry point to test.
**Cons.** Loses a documented capability that has clear ad-hoc usefulness (running an experimental loom without editing settings).
**Risks.** None.

### Recommendation

Option A. The path-list-separator convention is the standard Pi SDK-compatible way to carry multiple paths through a single `string` flag, and it preserves the spec's declared intent ("repeatable, optional") with only a syntactic relabel. Implementer must:

- Use Node's `path.delimiter` rather than hard-coded `:` / `;`.
- Apply the same file-or-directory resolution rules as the settings `looms` array (a separate finding nails that schema down — both fixes should land together).
- Document the Windows behaviour (`;`) prominently in `discovery.md` to pre-empt confusion.
- Register the flag in the extension factory before subscribing to `resources_discover`, since `getFlag` is read inside the discovery handler.

## Related Findings

- "`settings.json` `looms` array shape unspecified" — co-resolve (the per-entry "file or directory" semantics chosen for settings should be reused for the CLI flag's split values)
- "`pi.looms` package.json key is not Pi-recognized" — same-cluster (both findings clarify that the loom extension owns its discovery surface; Pi does not enumerate sources for it)
- "Discovery source failure modes partly unspecified" — co-resolve (a CLI-supplied missing path is one of the cases that finding tabulates; the failure-mode entry for `--loom` cannot be written until this finding picks an option)
- "Discovery directory tree example contradicts documented path" — same-cluster (touches the same `discovery.md` source list section but resolves independently)

---

# Same-source `.loom` filename collisions are unspecified

**Source:** docs/reviews/spec-review/spec-20260504-144255.md
**Original heading:** Same-priority `.loom` filename collisions undefined
**Kind:** error-model

## Finding

`spec_topics/discovery.md` covers two collision scenarios — *cross-priority* (higher source wins, warning names both paths) and *cross-format* (loom vs. `.md` prompt or subagent at the same effective name → load-time error, neither registers). It is silent on the third case: two `.loom` files at the **same priority level** that resolve to the same slash name.

This case is reachable from three of the five discovery sources:

- **Packages** — two `node_modules/*` packages each shipping `looms/code-review.loom`, or each declaring `pi.looms` entries that derive the same basename.
- **Settings `looms` array** — two file entries, or two directory entries each containing `code-review.loom`.
- **CLI `--loom`** — repeatable flag passed twice with the same basename.

(Global and project sources are single directories per priority level, so a same-source collision there reduces to "two files with the same name in one directory", which is impossible on a filesystem.)

Without a rule, implementers will diverge: one will silently let the last-loaded file win, another will fail at load time, a third will pick lexicographically. Because slash names are user-facing dispatch keys, silent shadowing is the worst of these — invoking `/code-review` may run a different package's loom from one machine to the next, with no diagnostic.

## Spec Documents

- `spec_topics/discovery.md` — Source priority section / Slash-name collisions across formats (edited)

## Plan Impact

**Phases:** Vertical V14

**Leaves (implementation order):**

- V14m — Discovery: package `looms/` and `pi.looms` — (modified)
- V14n — Discovery: settings `looms` array — (modified)
- V14o — Discovery: `--loom` CLI flag — (modified)
- V14p — Source priority and shadowing warning — (modified)
- V14q — Cross-format slash collision — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementations will diverge on which `.loom` wins when packages collide; with no diagnostic required, end users may invoke `/code-review` and silently run different code on different machines. The bug surfaces only as wrong-output complaints, with no log line tying them to the duplicate. Cross-format collisions are already errors, so the existing rule set creates the surprising asymmetry that two `.loom`s collide silently while a `.loom` + `.md` collision is fatal.

## Solution Space

**Shape:** multiple

### Option A — Uniform load-time error (symmetric with cross-format)

- **Approach.** Two `.loom` files at the same priority that derive the same slash name → load-time error reported through Pi diagnostics; neither registers. Identical wording and code path to the cross-format collision rule.
- **Spec edits.** Extend the "Slash-name collisions across formats" paragraph in `spec_topics/discovery.md` to "Slash-name collisions at the same priority", covering both same-format (`.loom` vs. `.loom`) and cross-format cases. State that the rule is symmetric across all source types and across all file formats.
- **Pros.** One rule covers both collision shapes. Fail-fast: users learn about the conflict immediately, not via mysterious dispatch. Mirrors the existing convention; nothing new to learn.
- **Cons.** Package-source collisions are between independent third-party authors; the user may not be able to "rename one" without forking a dependency. Disabling both commands punishes the user for an upstream conflict.
- **Risks.** A single misbehaving package can knock out a slash command shipped by another package. Mitigation is a settings escape hatch (out of scope here).

### Option B — Deterministic tiebreaker with warning (symmetric with cross-priority)

- **Approach.** Same-priority same-format collisions resolve to the lexicographically-first source path; a load-time *warning* names all conflicting paths and identifies the winner. Mirrors the cross-priority shadowing rule.
- **Spec edits.** Add a paragraph after the existing source-priority list: "When two `.loom` files at the same priority derive the same slash name, the file whose source path sorts first lexicographically wins; a warning is emitted naming all paths and the winner." Define "source path" precisely (resolved absolute path, post-symlink, NFC-normalised).
- **Pros.** Always produces a working command. Forgiving in the package case where the user has no recourse. Decision is reproducible across machines as long as the source set is identical.
- **Cons.** Asymmetric with the cross-format rule, which fails closed. Lexicographic order across `node_modules` paths is not stable across package managers (pnpm vs. npm hoisting layouts) — same dependency tree, different winner. Silent enough that users will miss the warning the first dozen times.
- **Risks.** "Reproducible across machines" weakens to "reproducible per package manager"; CI vs. local can disagree.

### Recommendation

Option A. Symmetry with the cross-format rule is high value: one rule, one diagnostic, one mental model for "the same name resolved twice at the same level". The package-collision pain is real but rare, and the right mitigation is a future settings-level disable list, not silent shadowing of dispatch keys.

Edge cases the implementer must watch:

- Packages that derive their slash name via `pi.looms` mapping rather than basename — collision detection runs on the *final derived name*, not the source filename.
- CLI `--loom` repeated with two paths whose basenames hyphen-normalise to the same wire name (`code-review.loom` and `code_review.loom`) — same name, two files, error.
- Settings array entries that resolve to the same absolute path post-tilde-expansion are deduplicated, not flagged.
- Diagnostic must list every conflicting path, not just two — three packages each shipping `lint.loom` is a single error, not two.

## Related Findings

- "Discovery source failure modes partly unspecified" — same-cluster (both fill gaps in `discovery.md`'s error model; resolve independently).
- "settings.json `looms` array shape unspecified" — decision-dependency (whether settings entries can shadow each other depends on whether duplicates within the array are even legal; settle the array shape first, then this rule applies on top).
- "Slash-name validity from filename unspecified" — same-cluster (both are load-time validation rules over discovered `.loom` files; share the diagnostic surface but resolve independently).
- "Discovery directory tree example contradicts documented path" — same-cluster (both edit `discovery.md` but on unrelated paragraphs).

---

## spec_topics/slash-invocation.md

---

# Per-`kind` system-note table omits three `QueryError` variants

**Source:** docs/reviews/spec-review/spec-20260504-144255.md
**Original heading:** Per-`kind` system-note table covers only 5 of 8 `QueryError` variants
**Kind:** consistency, cross-spec-consistency-broad, error-model, completeness, testability

## Finding

`spec_topics/slash-invocation.md` defines the prompt-mode top-level-`Err` system-note format as a `QueryError.kind` → string table, and the surrounding prose explicitly forbids the fallback of dumping the JSON ("the note never dumps the full `QueryError` JSON"). The table has rows for five kinds: `validation`, `transport`, `tool_failure`, `context_overflow`, `cancelled`.

The canonical `QueryError` union in `spec_topics/query.md` has eight variants. The three missing from the table are all reachable as a top-level `Err` returned by a prompt-mode loom:

- `tool_call` — `ToolCallError` from a code-side `<tool>(...)` call (`spec_topics/tool-calls.md`).
- `invoke_failure` — `InvokeFailure` from `invoke<T>(...)` infrastructure failure (`spec_topics/invocation.md`).
- `invoke_callee_error` — `InvokeCalleeError` wrapping a child loom's `Err` (`spec_topics/invocation.md`).

Because no row covers them and the JSON-dump escape is explicitly closed off, the spec gives the renderer no legal output for these cases. Two implementers will diverge: one will invent ad-hoc strings, another will fall back to dumping JSON in violation of the prose rule, a third will treat the `Err` as silent. The chain-attribution suffix (`"... from child.loom invoked at parent.loom:42"`) defined immediately below the table is also undefined for these three kinds, even though `invoke_callee_error` is the variant most likely to *carry* a chain.

## Spec Documents

- `spec_topics/slash-invocation.md` — "Top-level `Err` in prompt mode" table (edited)
- `spec_topics/query.md` — `QueryError` union definition (read-only)
- `spec_topics/tool-calls.md` — `ToolCallError` shape (read-only)
- `spec_topics/invocation.md` — `InvokeFailure`, `InvokeCalleeError` shapes (read-only)

## Plan Impact

**Phases:** Vertical V18

**Leaves (implementation order):**

- V18i — Per-`kind` formatting for prompt-mode top-level `Err` — (modified)

## Consequence

**Severity:** correctness

The renderer for the V18i leaf cannot be implemented as written: three of the eight `QueryError` variants have no specified output and no specified fallback. Different implementers will produce different user-visible strings (or no string) for the same failure, defeating the stable-channel guarantee that motivated locking down the other five rows in the first place. The associated tests in V18i ("each `kind` row produces the spec's exact text") cannot be authored for the missing kinds.

## Solution Space

**Shape:** multiple

### Option A — Add three explicit rows, no catch-all

**Approach.** Extend the table with one row per missing `kind`, naming the most-relevant field for each. Leave the spec closed: any future `QueryError` variant must come with a table row in the same edit.

**Spec edits.** In `spec_topics/slash-invocation.md`, add three rows to the table:

| `tool_call` | "loom `/<name>` returned `Err`: tool `<tool_name>` failed (`<cause>`) — `<message>`" |
| `invoke_failure` | "loom `/<name>` returned `Err`: invoke of `<callee_path>` failed (`<reason>`) — `<message>`" |
| `invoke_callee_error` | "loom `/<name>` returned `Err`: child `<callee_path>` returned `Err` — `<inner.kind>`: `<inner.message>`" |

Clarify that the chain-attribution suffix applies to `invoke_callee_error` and recurses into `inner` to find the leaf kind.

**Pros.** Symmetric with existing rows; every variant has an exact, testable string; no implementer discretion.

**Cons.** Future `QueryError` variants silently re-open the gap — every union extension is a coordinated edit across `query.md` and `slash-invocation.md`.

**Risks.** Forgetting the cross-edit when adding a variant reproduces this finding.

### Option B — Three explicit rows plus a catch-all

**Approach.** Same as Option A, then add one final row covering "any unlisted `kind`".

**Spec edits.** Option A's three rows, plus a final row:

| _any unlisted `kind`_ | "loom `/<name>` returned `Err`: `<kind>` — `<message>`" |

State that adding a `QueryError` variant SHOULD be accompanied by a dedicated row but the catch-all is a normative fallback so the renderer always has a defined output.

**Pros.** Forward-compatible with future variants; renderer's contract is total over the union; chain attribution can attach to the catch-all row.

**Cons.** Slightly weaker per-variant prescription — adds a "lazy" path future authors might rely on instead of writing a proper row.

**Risks.** Renderers diverge between catch-all and explicit row if a future row arrives mid-version; mitigated by versioning the table.

### Option C — Catch-all only, retire the per-kind table

**Approach.** Replace the prescriptive five-row table with a single behavioural rule and a recommended template; soften the JSON-dump prohibition to "the note SHOULD summarise rather than dump".

**Spec edits.** Remove the table; specify the required fields per note (loom name, kind, message, plus kind-specific fields named in the variant schemas) and an example string.

**Pros.** No future maintenance cost; renderers free to evolve copy.

**Cons.** Abandons the stable-string contract that lets transcript renderers, log scrapers, and tests pin behaviour; conflicts with the "System-note copy strings: prescription level unresolved" finding's plausible resolution toward a normative contract.

**Risks.** Downstream consumers (log scrapers, transcript diff tools) lose a stable surface.

### Recommendation

Take Option B. Add the three missing rows so V18i has exact testable strings for every currently-defined variant, and add the catch-all so the renderer's contract is total against any future `QueryError` extension. Edge cases the implementer must watch:

- For `invoke_callee_error`, recurse into `inner` when computing the chain-attribution suffix so the leaf `kind` (not `invoke_callee_error`) drives the descriptive text.
- For `tool_call`, the `cause` enum (`validation` / `execution` / `cancelled` / `unknown_tool`) is short enough to surface inline; pick one parenthesised form and use it consistently.
- The catch-all must not paper over the chain suffix — it still applies whenever the failure cascaded from an invoked child.

## Related Findings

- "System-note copy strings: prescription level unresolved" — decision-dependency (the table's normative-vs-advisory status determines whether explicit rows or a behavioural rule is the right shape; resolve that first or jointly)
- "`QueryError` example missing `ToolCallError`" — same-cluster (both reflect a missing-variant pattern across spec files; same edit does not fix both)
- "`QueryError` union has three conflicting authoritative definitions" — same-cluster (a consolidated `QueryError` reference would make the table's enumeration mechanically derivable)
- "`QueryError` variants split across three files with no consolidated reference" — same-cluster (root cause of the omission; consolidating would prevent recurrence)
- "Cancellation surfacing: `InvokeFailure` vs `InvokeCalleeError` — irreconcilable" — decision-dependency (resolution affects which kind the `cancelled` row vs the new `invoke_*` rows actually fire on)

---

# System-note copy strings: prescription level unresolved

**Source:** docs/reviews/spec-review/spec-20260504-144255.md
**Original heading:** System-note copy strings: prescription level unresolved
**Kind:** prescription

## Finding

The spec specifies exact English copy for every user-facing system note — the per-`kind` `Err`-in-prompt-mode table in `slash-invocation.md`, the five binder failure-mode rows and the echo example in `binder.md`, and the `"loom /<name> aborted: <message>"` panic note in `errors-and-results.md` — without ever stating whether those strings are normative (renderers must emit them verbatim) or advisory (illustrative wording, implementer may rephrase). Nothing in the spec calls out a stability promise, a version anchor, or a permission to vary.

This ambiguity is not academic. The plan already commits to the strict reading: V18i's tests assert that "each `kind` row produces the spec's exact text", and V16o/V16p hard-code substrings (`"argument binding failed — could not parse arguments"`, `"argument binding produced invalid args — <ajv-summary>"`) into acceptance criteria. If the strings are normative, the spec should say so and pin a version, the wording should be cleaned of mixed-template/example prose (e.g. interpolating `<message>` from a non-deterministic binder model output cannot itself be normative), and the panic-note string in `errors-and-results.md` should be reconciled into the same table. If the strings are advisory, the plan tests are over-specified and an implementer changing wording without changing behaviour would falsely fail acceptance.

The notes also span at least three surfaces — Pi `loom-system-note` channel, registered renderer styling, and the underlying string content — and the prescription decision applies independently to each. Locking copy without locking the channel (or vice versa) leaves equivalent ambiguity.

## Spec Documents

- `spec_topics/slash-invocation.md` — Top-level `Err` in prompt mode (per-`kind` table) (edited)
- `spec_topics/binder.md` — Echo policy + Failure modes table (edited)
- `spec_topics/errors-and-results.md` — Panic surfacing (slash-command/prompt-mode bullet) (edited)
- `spec_topics/cancellation.md` — Cross-reference to per-`kind` table (read-only)
- `spec_topics/pi-integration-contract.md` — `loom-system-note` channel definition (read-only)

## Plan Impact

**Phases:** Vertical V16, Vertical V18

**Leaves (implementation order):**

- V16i — `bind_echo` formatter — (modified)
- V16l — `needs_info` system note — (modified)
- V16m — `ambiguous` system note — (modified)
- V16n — Binder transport-failure system note — (modified)
- V16o — Malformed-envelope system note — (modified)
- V16p — AJV-failure system note — (modified)
- V18h — Custom Pi message type `loom-system-note` and renderer — (modified)
- V18i — Per-`kind` formatting for prompt-mode top-level `Err` — (modified)
- V18m — Panic routing: slash-command surface — (modified)

## Consequence

**Severity:** correctness

Two implementers will diverge on whether to treat the table strings as test fixtures or as illustrative wording, producing different acceptance-test suites and incompatible third-party renderer/parser tooling. Because the plan already pins exact strings in V16o/V16p/V18i tests, the divergence will surface as test failures whenever a future spec edit touches wording, with no rule to adjudicate.

## Solution Space

**Shape:** multiple

### Option A — Normative copy, pinned to spec version

**Approach.** Declare the system-note strings as canonical contract. Add a one-paragraph header above the per-`kind` table in `slash-invocation.md` (and mirror it above the binder failure-mode table) stating: "The system-note strings in the tables below are normative. Renderers MUST emit them verbatim, with substitutions performed only on the `<...>` placeholders. Wording changes are spec-versioned breaking changes." Reframe each row as a template with explicit placeholder grammar (`<name>`, `<n>`, `<tool_name>`, `<message>`, `<ajv-summary>`, `<provider>`). Move the `"loom /<name> aborted: <message>"` panic string out of `errors-and-results.md` prose into the same table as a sixth row (or a sibling "Panic" table), so all user-facing notes share one normative source. Carve out the explicitly non-deterministic substitutions: the binder model's free-text `<message>` inside `needs_info`/`ambiguous` is not normative content, only the surrounding template is.

**Spec edits.**
- `slash-invocation.md`: add normativity preamble; restate table rows as templates; add a `Panic` row (or a second small table) covering the panic surface.
- `binder.md`: add normativity preamble for the failure-mode table; mark the echo example as a worked illustration of the format rules (the rules are normative, the example is not).
- `errors-and-results.md`: replace inline panic-note string with a cross-reference to the consolidated table.
- `pi-integration-contract.md`: cross-reference the consolidated table from the `loom-system-note` section.

**Pros.** Matches the plan's existing test commitments (V18i, V16o, V16p); gives extension/renderer authors a stable contract to parse against; consolidates a fragmented surface; cheap to enforce.

**Cons.** Locks the project into wording it has not battle-tested; future copy improvements become spec-versioned changes; non-English locales (out of V1 scope but plausible later) will need an explicit override mechanism.

**Risks.** None significant; the strings are simple enough that early refinement before V1 ship is the main mitigation.

### Option B — Behavioural spec, copy advisory

**Approach.** Replace each table cell with a behavioural requirement listing the fields the note MUST contain (loom name, error kind, key detail per kind) and constraints (single line, no JSON dump, terminal-safe characters). Tag the existing strings as "non-normative example wording". Drop the V18i/V16o/V16p exact-string assertions from the plan and replace them with structural assertions (note contains loom name; note contains tool name when `kind=tool_failure`; note is single-line; etc.).

**Spec edits.**
- `slash-invocation.md`: replace per-`kind` table with a "required fields per kind" table; relegate current strings to an "Example wording (non-normative)" appendix.
- `binder.md`: same treatment for the failure-mode table.
- `errors-and-results.md`: same treatment for the panic-note string.

**Pros.** Implementers free to refine copy without spec churn; easier i18n later; avoids over-specifying surface details.

**Cons.** Requires rewriting plan acceptance criteria (V16o/V16p hard-code substrings; V18i tests "the spec's exact text") — an in-flight plan change with no clear payoff; renderer/parser authors lose the stable contract; defers a wording decision that the spec author has already made and that costs nothing to keep.

**Risks.** Behavioural assertions are more verbose to write and easier to game; reviews of "is this note compliant" become subjective.

### Recommendation

Take Option A. The spec author has already written canonical strings, the plan already tests for them, and the consolidation work (one preamble per table, one rewrite of the panic-note bullet to cross-reference the table) is a cheap, mechanical edit that makes the existing intent explicit. Edge cases the implementer must watch:

- `<message>` substitutions sourced from binder model output are model-determined; only the *surrounding template* is normative.
- `<ajv-summary>` needs its own format pinned (suggest: AJV's `errorsText(errors, { separator: '; ' })` with the data-path prefix retained); without that, "verbatim" still admits variance.
- The chain-attribution suffix in `slash-invocation.md` (`"... from child.loom invoked at parent.loom:42"`) must be added to the table as a normative trailer rule, not left as prose.
- `bind_echo` example wording in `binder.md` should be explicitly marked illustrative, since the format rules (declaration order, quoting policy, 120-char cap, `(default)` tag) are normative but no single example string can be — the formatter is data-driven.

## Related Findings

- "Per-`kind` system-note table covers only 5 of 8 `QueryError` variants" — co-resolve (the same table edit that pins normativity should add the missing `tool_call`, `invoke_failure`, `invoke_callee_error` rows)
- "`bind_echo` / binder-bypass echo suppression not cross-referenced" — same-cluster (touches the same surface; resolves independently with a one-sentence cross-reference)
- "Binder echo formatting micro-rules over-prescribed and misplaced" — decision-dependency (Option A here keeps the format rules normative and demotes the example; Option B aligns with that finding's preferred direction)
- "Non-normative content mixed into binder spec" — same-cluster (both findings ask the spec to mark normative vs advisory content explicitly; same editorial pass)

---

## spec_topics/tool-calls.md

---

# Tool-call argument syntax conflicts with the bare-object-literal prohibition

**Source:** docs/reviews/spec-review/spec-20260504-144255.md
**Original heading:** Bare object literals in tool-call examples contradict `expressions.md`
**Kind:** consistency, prescription

## Finding

`spec_topics/expressions.md` — Object construction section — states: "Bare object literals (`{ field: expr }` with no leading schema name) are not legal in expression position — every constructed object must name its schema, so the type is unambiguous from the syntax alone." The single declared exception is the frontmatter `params:` defaults position.

`spec_topics/tool-calls.md` — opening example — uses bare object literals in call-argument position:

```loom
let contents = read({ path: "src/main.ts" })?
let matches  = grep({ pattern: "TODO", path: "src" })?
```

These are bare object literals (no leading schema name) appearing inside a function call's argument list — i.e., expression position. By the rule in `expressions.md`, those examples are parse errors. A V14c implementer who follows `expressions.md` literally will reject the canonical tool-call examples; one who follows `tool-calls.md` literally will accept bare object literals everywhere a Pi-tool call appears, with no rule telling them where the exception ends.

The disagreement is not cosmetic: Pi tool input schemas are TypeBox/JSON Schema shapes registered by extension code (see `spec_topics/pi-integration-contract.md`). They have no canonical name in the loom schema namespace, so the natural reading — "use the schema name" — has no schema name to use. Either the prohibition needs a second carved-out case, or the examples need a different syntactic shape and a rule that produces the necessary names.

Note that the conflict is scoped to **Pi tool calls only**. `tool-calls.md` is explicit that registered loom callees take their `params:` positionally, so subagent-loom calls do not construct an object at the call site and are not affected.

## Spec Documents

- `spec_topics/expressions.md` — Object construction, array construction, and operator rules (option-dependent)
- `spec_topics/tool-calls.md` — Argument shape; opening examples (edited)
- `spec_topics/frontmatter.md` — `tools:` set definition (read-only)
- `spec_topics/pi-integration-contract.md` — Pi tool input-schema source (read-only)
- `spec_topics/schema-subset.md` — schema lowering pipeline (option-dependent)

## Plan Impact

**Phases:** Vertical V14

**Leaves (implementation order):**

- V14b — `tools:` YAML list form with `as` rename — (option-dependent)
- V14c — Bare `<name>(args)` call from loom code — (modified)
- V14f — `ToolCallError` variant: `validation` cause — (modified)

(V14b is option-dependent because option B would require deciding how a renamed tool's input-schema identifier surfaces.)

## Consequence

**Severity:** correctness

Two reasonable parser implementations will diverge: one that takes `expressions.md` as the binding rule will reject every example in `tool-calls.md` as a bare-object-literal parse error; one that takes the examples as binding will admit bare object literals in call-argument position generally, with no defined boundary against `f({ ... })` for non-tool callees. The first ships a runtime where the canonical examples don't compile; the second ships a runtime that silently widens the expression sublanguage.

## Solution Space

**Shape:** multiple

### Option A — Document a Pi-tool-call argument-position exception in `expressions.md`

**Approach.** Add a second item to the existing exception list in `expressions.md` § Object construction: a bare object literal is legal as the **single argument** of a call whose callee resolves (via the `tools:` table) to a Pi tool. The Pi tool's registered input schema (TypeBox / JSON Schema) supplies the type. The literal is parsed as JSON-shaped (same as the `params:` defaults exception), validated against the input schema by AJV at runtime per V14c.

**Spec edits.**
- `expressions.md` § Object construction: extend the exception sentence to read "The frontmatter `params:` defaults *and* the single-argument position of a call whose callee resolves to a Pi tool are the two exceptions: in both, an external schema (the param's declared type or the Pi tool's input schema) supplies the shape, and the literal is parsed as JSON-shaped, not as a Loom expression." Cross-reference `tool-calls.md`.
- `tool-calls.md` § Argument shape: add a sentence noting that the bare-object form is the documented exception per `expressions.md`, and that the literal is JSON-shaped — `${...}` interpolation and other expression-sublanguage forms are not available inside it. (Or, if expressions *are* allowed inside the literal, state that explicitly and update `expressions.md` accordingly — this is a separate decision the spec must pin down.)

**Pros.** No invented machinery. Matches the `params:` precedent exactly. Examples stay readable. Pi tools' anonymous TypeBox shapes need no loom-side name.

**Cons.** Adds a second exception to a rule the spec advertises as having one. The "JSON-shaped vs expression-shaped" distinction inside the literal needs a one-line answer.

**Risks.** If interpolation inside the literal is later wanted, the JSON-shaped framing is hard to relax non-breakingly. Decide up front.

### Option B — Surface Pi tool input schemas as named loom schemas; require schema-named constructors

**Approach.** Define a deterministic name for each Pi tool's input schema (e.g., the tool's post-rename name in PascalCase plus `Args` — `read` → `ReadArgs`, `grep` → `GrepArgs`). Make those names visible in the loom's schema namespace at load time. Rewrite the call-site examples as `read(ReadArgs { path: "src/main.ts" })?`. The `expressions.md` rule then needs no new exception.

**Spec edits.**
- `tool-calls.md`: rewrite the example block; add a "Pi tool input schemas" subsection defining the naming rule and stating that the rule applies to the post-rename name (interacting with V14b's `as`).
- `frontmatter.md`: note that registering a Pi tool also registers its input schema name into the loom's schema namespace; declare collision behaviour against schemas declared in the same loom.
- `schema-subset.md`: confirm that synthesised Pi-tool-input schemas are not subject to subset constraints (they originate from extension code, not loom source).

**Pros.** Preserves the one-exception story in `expressions.md`. Makes the Pi tool's input shape addressable from loom code (e.g., as a function parameter type).

**Cons.** Invents a naming convention with no precedent in Pi. Couples the schema namespace to the tool namespace, creating a new collision surface (a loom that declares `schema ReadArgs { ... }` and lists `read` in `tools:`). Verbose at the call site.

**Risks.** Pi tool input schemas can be arbitrary JSON Schema and may use constructs the schema-subset rejects (`oneOf`, `format`, `pattern`). Surfacing them as named loom schemas tries to push them through the type system; either the type-system has to accept them (carve-out) or registration fails for valid Pi tools.

### Recommendation

Adopt **Option A**. Pi tool input schemas are owned by extension code and have no business carrying loom-side names; the `params:` exception already establishes the "external schema supplies the shape, literal is JSON-shaped" pattern, and the call-argument case is structurally identical. Fix the wording in `expressions.md` so the exception list explicitly enumerates both cases, and add a one-sentence forward reference in `tool-calls.md`.

Edge cases the implementer must pin down at V14c:

- Whether `${...}` interpolation is permitted **inside** the JSON-shaped literal. The `params:` precedent says no (parsed as JSON, not Loom). Default to the same answer; if you need expressions inside, pass them through a `let` first or use `invoke(...)` with a typed param.
- The exception applies **only** when the callee resolves to a Pi tool. A bare `f({ ... })` where `f` is a `let`-bound function or a registered loom callee remains a parse error.
- The exception applies to the **single positional** argument. Pi tools take exactly one input object; a multi-arg form (`read({...}, {...})`) is a parse error regardless.
- Interaction with grammar-disambiguation rule for struct-expressions in scrutinee position: `if (read({ path: p }))` is unambiguous because the outer `(...)` already disambiguates; no new rule needed.

## Related Findings

- "Binder envelope schema violates schema-subset rules without declaring an exception" — same-cluster (same pattern: a strict spec rule has a real-world violation that needs an explicit carve-out rather than a silent contradiction)
- "`as` keyword claim contradicted by example" — same-cluster (also touches `tools:` rename surface; under Option B the rename would propagate into the input-schema name and the conflicts compound)
- "`tools:` registration scope: global vs per-loom" — decision-dependency (Option B requires a stable schema namespace per loom; settling that is a prerequisite)

---

# Tool result handling: non-text blocks, empty content, and `isError` message lowering

**Source:** docs/reviews/spec-review/spec-20260504-144255.md
**Original heading:** Tool result non-text blocks silently lost
**Kind:** error-model, completeness, prescription

## Finding

`pi-integration-contract.md` reduces a Pi tool's `{ content, isError }` envelope to a V1 string return value with a single sentence:

> The tool's returned `{ content, isError }` becomes the V1 string return value: the concatenated text content blocks, returned as `Ok(string)` if `!isError` and `Err(QueryError { kind: "tool_call", cause: "execution", ... })` otherwise.

That sentence under-specifies three observable behaviours of the code-side tool-call path:

1. **Non-text content blocks.** Pi tools return content arrays whose entries can be text, images, or resource references. The spec only addresses text. Implementations are free to silently drop non-text blocks, throw, prepend a placeholder, or fail the call — each choice is defensible and each produces a different `Ok(string)` payload (or different error) from the same tool.
2. **Empty content arrays.** If `isError` is `false` and `content` is `[]` (or contains only non-text blocks under a "drop silently" reading), the result is `Ok("")`. The spec does not say whether empty success is legal or should be promoted to a failure, and authors writing `let s = read(...)?` cannot tell whether to expect `""` or an `Err`.
3. **`ToolCallError.message` on `isError: true`.** `tool-calls.md` declares `message: string` as a `QueryError` field but never says what to put in it when the failure originates in `isError: true`. Reasonable choices include "concatenated text of error content blocks", "first error content block only", "fixed string + tool name", or "JSON-serialised content array". `cause: "execution"` for an `execute()` throw vs. an `isError: true` return are also currently indistinguishable from the variant alone.

The same sentence is also the subject of a sibling finding about the concatenation separator (`""` vs `"\n"` vs `"\n\n"`), which interacts with item 1 — once non-text handling is decided, the separator must apply consistently to whatever string fragments survive the lowering.

## Spec Documents

- `spec_topics/pi-integration-contract.md` — "Tool execution from loom code" paragraph (edited)
- `spec_topics/tool-calls.md` — `ToolCallError` schema and "Failures" paragraph (edited)
- `spec_topics/query.md` — `ToolCallError` cross-reference, in case `cause` enum widens (option-dependent)

## Plan Impact

**Phases:** Vertical V14

**Leaves (implementation order):**

- V14c — Bare `<name>(args)` call from loom code — modified (return-value lowering needs a defined algorithm for non-text and empty content)
- V14g — `ToolCallError` variant: `execution` cause — modified (must specify how `message` is populated when `isError: true`, and whether `execute()`-throw vs `isError`-true are distinguishable)

## Consequence

**Severity:** correctness

Two reasonable implementers will produce divergent `Ok` payloads (different concatenations, different placeholder strings, different empty-array handling) and divergent `Err` shapes for the same Pi tool returning the same envelope. Loom authors writing `read({...})?` against a tool whose result includes an inline image, or against any tool that ever returns `isError: true`, will see implementation-defined behaviour where the spec promises a contract.

## Solution Space

**Shape:** multiple

### Option A — Drop non-text blocks silently; empty payload allowed

**Approach.** Define the lowering as: filter `content` to entries with `type === "text"`, join their `.text` values with `"\n"` (per the sibling separator finding), and return that string. `Ok("")` is a legal success when no text blocks survive. On `isError: true`, apply the same filter-and-join to produce `ToolCallError.message`, truncated to 4 KiB; if no text survives, use the fixed string `"tool reported an error with no text content"`.

**Spec edits.**
- Replace the `pi-integration-contract.md` sentence with: "Lowering filters `content` to `type === "text"` entries and joins their `.text` with `"\n"`. Non-text blocks (images, resource references) are discarded. An empty result string is a legal `Ok` value."
- Add to `tool-calls.md` failures: "When `cause: "execution"` originates from `isError: true`, `message` is the same filtered/joined text truncated to 4096 bytes (UTF-8); when no text survives the filter, `message` is `"tool reported an error with no text content"`. When `cause: "execution"` originates from an `execute()` throw, `message` is the thrown error's `.message` truncated to 4096 bytes."

**Pros.** Smallest spec surface; matches the existing "V1 returns the tool's final output as a single string" framing in `tool-calls.md`; predictable behaviour for the common case (text-only tools).
**Cons.** Silent data loss for image-returning tools is a footgun the author cannot detect from the return type. `Ok("")` collapses two different success cases (genuinely empty vs. all-non-text) into one observation.
**Risks.** Image-using authors may build prompts whose payload silently disappears; the bug will only surface in late-stage manual review.

### Option B — Drop non-text blocks but include a placeholder; empty payload becomes execution error

**Approach.** Same filter-and-join as Option A, but each discarded non-text block contributes a placeholder to the joined output: `[image omitted]`, `[resource omitted: <uri>]`, etc. If the resulting string is empty (i.e. `content` itself was empty), surface `Err(ToolCallError { cause: "execution", message: "tool returned no content" })`.

**Spec edits.** As Option A, but with the placeholder rule and the empty-array-promotes-to-Err rule replacing the "Ok(\"\") is legal" clause.

**Pros.** Discarded payload is at least visible to the author and to downstream prompts; empty-success ambiguity disappears.
**Cons.** Placeholder strings are now part of the prompt-text contract — they can leak into model conversations and must be locked down as canonical (renderers/parsers may depend on them). Adds a third spec-mandated user-facing string set on top of system-note copy.
**Risks.** Authors may grep for or pattern-match on the placeholder text, freezing it.

### Option C — Reject non-text blocks as `cause: "execution"`

**Approach.** Lowering succeeds only when every content block is text. If any non-text block is present, surface `Err(ToolCallError { cause: "execution", message: "tool returned non-text content blocks (V1 supports text only)", tool_name })`. Empty content arrays with `isError: false` likewise become `Err`.

**Spec edits.** As Option A for the text-only success path; replace the silent-drop clause with the rejection rule above.

**Pros.** No silent data loss; the author always sees a deterministic error and can decide whether to migrate; forward-compatible with V2 widening (today's `Err` becomes tomorrow's structured `Ok`).
**Cons.** Tools that opportunistically include thumbnails or diagnostic images alongside their primary text payload become unusable from loom code without wrapper tools, even when the text alone would have sufficed.
**Risks.** Author friction for any tool whose maintainer adds non-text content later — the loom call breaks without the tool's text contract changing.

### Recommendation

**Option A.** It matches the spec's existing "V1 keeps the surface minimal; future widening is additive" stance for both untyped queries (`query.md` ¶ "Untyped return type (V1)") and Pi tool results (`tool-calls.md` return-type table). Implementer guidance to add to the spec edit:

- The `"\n"` separator is the same one chosen for the sibling separator finding — keep them resolved together.
- The 4 KiB truncation applies to UTF-8 byte length, not character count, and truncation is at a code-point boundary (no split surrogates / multi-byte sequences). Add `message_truncated: boolean` if the implementer wants observability, but this is optional in V1.
- Distinguish `execute()`-throw from `isError: true` via the `message` source, not via a new `cause`. If a future version needs the distinction, widen `cause` additively.
- The `"tool reported an error with no text content"` fallback string is normative — do not localise it in V1; it is a stable identifier, not user copy.

## Related Findings

- "Multi-block content concatenation separator unspecified" — co-resolve (same sentence in `pi-integration-contract.md`; Option A above bakes in `"\n"`)
- "`QueryError` example missing `ToolCallError`" — same-cluster (both touch `ToolCallError`'s definitional surface, but the missing-variant fix is purely editorial)
- "Tool registry change mid-loom; concurrent model-driven tool execution" — same-cluster (also revises `tool-calls.md`'s failures area; resolve independently)

---

# Multi-block tool-result text concatenation separator unspecified

**Source:** docs/reviews/spec-review/spec-20260504-144255.md
**Original heading:** Multi-block content concatenation separator unspecified
**Kind:** completeness, prescription

## Finding

`spec_topics/pi-integration-contract.md` (Tool execution from loom code) states that a Pi tool's returned `{ content, isError }` becomes the V1 string return value as "the concatenated text content blocks, returned as `Ok(string)` if `!isError`." Pi tool results are an *array* of content blocks (`TextBlock | ImageBlock | ResourceBlock | ...`), and a single execution often produces multiple text blocks (e.g. tools that emit a header line, a body, and a trailing summary as separate blocks). The spec never names the separator interposed between adjacent text blocks during this concatenation.

Three reasonable choices — `""`, `"\n"`, `"\n\n"` — produce materially different strings. The same string is then bound into loom variables and frequently interpolated into `@`...`` query templates downstream, where the choice changes which lines collapse, which paragraphs split, and how regex/`split('\n')`-based parsing in subsequent loom code behaves. Two conforming implementers will diverge here, and a single tool that authored its blocks assuming one separator will produce subtly broken output under the other.

The same wording also appears in pi-integration-contract.md's prompt-mode bullet ("the accumulated assistant text from the final turn is the `Ok(string)` value"). That sentence has the same defect — assistant turns can carry multiple text blocks — and the spec should resolve both occurrences with the same rule.

## Spec Documents

- `spec_topics/pi-integration-contract.md` — "Tool execution from loom code" final paragraph (edited)
- `spec_topics/pi-integration-contract.md` — "Conversation drive — prompt mode" first bullet (edited, same rule)
- `spec_topics/tool-calls.md` — "Return type" table (edited; cross-reference the separator rule from the Pi-tool row)
- `spec_topics/query.md` — "Untyped return type (V1)" paragraph (read-only; check that "the assistant's final text" wording does not need parallel treatment)

## Plan Impact

**Phases:** Vertical V5, Vertical V14

**Leaves (implementation order):**

- V5b — Untyped query — `Ok(string)` from prompt-mode session — (modified, if the prompt-mode bullet is also resolved here)
- V14c — Bare `<name>(args)` call from loom code — (modified)
- V14g — `ToolCallError` variant: `execution` cause — (modified; `isError:true` path also concatenates `content` text blocks for the error message)

## Consequence

**Severity:** correctness

Two conforming implementations will return different strings for the same multi-block tool result, and any loom that does string-shape parsing on a tool result (line-splitting, prefix matching, paragraph counting) will silently behave differently across them. Because the value flows directly into prompt templates, the divergence is also observable to the model.

## Solution Space

**Shape:** multiple

### Option A — Join with `"\n"`

- **Approach.** "Adjacent text blocks are concatenated with a single `\n` separator. No separator is added before the first block or after the last." Apply identically to tool-result text concatenation and to prompt-mode "accumulated assistant text from the final turn."
- **Spec edits.** Replace "the concatenated text content blocks" with "the text content blocks joined by `\n`" in `pi-integration-contract.md`; add a one-line note to the Pi-tool row in `tool-calls.md` Return-type table cross-referencing the rule.
- **Pros.** Each block keeps its own line(s); successive blocks never visually merge; downstream `split('\n')` produces a predictable line stream.
- **Cons.** A block that already ends with `\n` produces a blank line at the join, which a paragraph-counting consumer may misread.
- **Risks.** Low. Trim-trailing-newline-before-join would solve the cosmetic issue but adds a special case the spec must also pin down.

### Option B — Join with `"\n\n"`

- **Approach.** Same as A but use `"\n\n"`.
- **Spec edits.** Same shape as A.
- **Pros.** Paragraph-style separation matches how multi-block tool output is typically rendered for humans; markdown-aware consumers see clean paragraph boundaries.
- **Cons.** Inflates output size; introduces blank lines that loom code doing line-shape parsing must filter; if a block already ends with `\n`, produces a triple-newline run.
- **Risks.** Higher chance of altering downstream prompt rendering in ways the tool author did not anticipate.

### Option C — Join with `""` (raw concatenation)

- **Approach.** Concatenate verbatim, no separator inserted.
- **Spec edits.** Replace "the concatenated text content blocks" with "the text content blocks concatenated verbatim, with no separator inserted by the runtime."
- **Pros.** Lossless and faithful to the literal word "concatenation"; the tool author retains full control of inter-block whitespace by choosing how to terminate each block.
- **Cons.** A tool that emits two blocks `"foo"` and `"bar"` produces `"foobar"`, which is almost never what the tool author meant; surprises authors used to other agent harnesses (Anthropic's reference implementations join tool-result blocks with `\n`).
- **Risks.** Quietly breaks tools authored against the convention used by Pi's existing built-in tools (which today happens to be `"\n"` in the Pi codebase).

### Recommendation

Option A. Specify a single `\n` separator, applied uniformly to tool-result text concatenation in `pi-integration-contract.md` "Tool execution from loom code", to the prompt-mode "accumulated assistant text" bullet, and to the `isError:true` path that builds `ToolCallError.message` from error content blocks. Implementer edge cases:

- Non-text blocks (images, resource references) are excluded *before* joining; they do not contribute an empty slot to the separator pattern. (The sibling finding "Tool result non-text blocks silently lost" pins down the drop-or-error decision.)
- A `content` array with zero text blocks yields `""`.
- The runtime must not trim leading/trailing whitespace of individual blocks; only the inter-block `\n` is added.

## Related Findings

- "Tool result non-text blocks silently lost" — co-resolve (same paragraph in `pi-integration-contract.md`; the rule that drops non-text blocks must be stated alongside the join-separator rule, otherwise the two rules can be read inconsistently)
- "Streaming partial responses to user unspecified" — same-cluster (touches the same Pi-integration surface but resolves independently)
- "Per-`kind` system-note table covers only 5 of 8 `QueryError` variants" — same-cluster (the `ToolCallError.message` content shape that this finding pins down feeds into how the system note is rendered)

---

## spec_topics/invocation.md

---

# "Statically resolvable" callee: resolution algorithm undefined

**Source:** docs/reviews/spec-review/spec-20260504-144255.md
**Original heading:** "Statically resolvable" callee never defined
**Kind:** implementability, completeness

## Finding

Three spec topics — `invocation.md` (argument binding, cycle detection), `tool-calls.md` (argument shape, registered-loom return type), and `functions.md` (loom return-type inference) — gate parse-time type checking on whether the callee's frontmatter or body is "statically resolvable", then immediately defer to "the runtime AJV check" otherwise. The phrase is never defined. The spec does not say what conditions make a callee resolvable, what file-system or parse-pipeline state must hold at the moment the parent is parsed, or what the parent emits when an attempted resolution fails.

Concretely, none of the following questions has an answer in the current text:

1. **Reachability.** When the parent loads, is the callee at `./plan.loom` opened, parsed, and lowered eagerly, or only opportunistically? `discovery.md` enumerates *root* directories that are scanned for slash commands, but `invoke("./plan.loom", ...)` and `tools: [./plan.loom]` resolve relative to the calling loom and may point outside any discovery root. Is reaching such a path the same operation, or a separate one?
2. **Parse-failure propagation.** A callee file exists but fails to parse. Does the parent emit `loom/load/parse_failure` referencing the callee site, succeed (silently downgrading argument-binding type checks to runtime), or refuse to register? `diagnostics.md` lists `loom/load/*` for "unresolvable `tools:` entry" but says nothing about `invoke(...)` callees, and the multi-error rollup rule (`diagnostics.md`, V18j) covers "transitive `.warp` imports" only — `.loom` callees are not named.
3. **Cycle detection coverage.** `invocation.md` says cycle detection "walks statically resolvable `invoke` paths". If a node in the cycle fails to parse, the walk stops — and a real cycle through a fixable typo is silently uncaught. The spec does not say whether unparseable nodes are conservatively treated as cyclic, conservatively assumed acyclic, or fatal.
4. **Cross-loom return-type inference.** `tool-calls.md` and `functions.md` flow the callee's tail-expression type into `invoke<T>` / registered-tool call sites "when the callee's source is statically resolvable". This is a transitive operation — the callee's tail type may itself depend on *its* callees' inferred return types. The spec gives no termination rule, no caching contract, and no behaviour for the case where one node in the chain fails to parse.
5. **Tools-table membership.** `frontmatter.md` says `.loom` paths in `tools:` are validated at "loom-load time" (subagent-mode check, name collisions). That validation already requires opening the callee. Is the same loaded form available to the type checker, or is `tools:` validation a strictly separate pass that does not memoise?

Two reasonable implementers will resolve these differently and produce divergent behaviour: one will eagerly load the entire reachable graph and surface every callee parse error in the parent's diagnostics; another will lazily probe and treat any unparseable callee as "not statically resolvable", deferring everything to runtime AJV. The first catches more bugs at parse time but couples loom registration to the health of distant files; the second is more permissive but lets cycles and type mismatches slip through.

## Spec Documents

- `spec_topics/invocation.md` — Resolution; Argument binding; Cycle detection (edited)
- `spec_topics/tool-calls.md` — Argument shape; Return type table (registered loom row) (edited)
- `spec_topics/functions.md` — Loom return type (edited)
- `spec_topics/diagnostics.md` — `loom/load/*` namespace (edited — new code(s))
- `spec_topics/implementation-notes.md` — Runtime / Parser sections (edited — load-pass description)
- `spec_topics/frontmatter.md` — `tools:` `.loom`-path validation (read-only — confirms callee already opened at load time)
- `spec_topics/imports.md` — Cycle detection in `.warp` imports (read-only — analogous algorithm to mirror)
- `spec_topics/discovery.md` — Discovery root scope (read-only — clarifies that invoke targets need not lie under a discovery root)
- `spec_topics/pi-integration-contract.md` — Per-loom registration (read-only — fixes the moment "load time" refers to)

## Plan Impact

**Phases:** Vertical V14, Vertical V15, Vertical V18

**Leaves (implementation order):**

- V14c — Bare `<name>(args)` call from loom code — (modified — argument type-check criterion needs the resolution rule)
- V15a — `invoke("./path.loom", ...)` parsing and resolution — (modified — must specify when callee is opened/parsed)
- V15c — Typed `invoke<Schema>` with AJV validation — (modified — interaction between caller `<Schema>` and callee inferred return)
- V15d — Positional argument binding for `invoke` — (modified — current Tests row hinges on the undefined "statically resolvable" predicate)
- V15e — `.loom` paths in `tools:` (default basename naming) — (modified — must say whether callee load is shared with `invoke` resolution)
- V15l — `InvokeFailure` variant — (modified — `parse_failure` reason needs to specify whether it can also fire at parent load time)
- V15n — Parse-time cycle detection — (modified — must say what the walker does when a node fails to parse)
- V18j — Multi-error rollup across file + transitive `.warp` imports — (modified — extend rollup to include reachable `.loom` callees, or explicitly exclude them)

## Consequence

**Severity:** correctness

Two reasonable implementers will produce materially different behaviour: argument-type mismatches, return-type incompatibilities, and invocation cycles may all be caught at parse time under one implementation and only at runtime (or never) under another. Cycle detection is the worst case — a typo in one file can silently mask a real cycle in the rest of the graph. Plan leaves V15a, V15d, V15e, V15n, V18j cannot be testably defined without resolving this.

## Solution Space

**Shape:** multiple

### Option A — Eager transitive load, callee parse failures propagate

**Approach.** When parsing a parent loom, every callee referenced by a literal `invoke("./...")` path or a `.loom` entry in `tools:` is opened, parsed, lowered, and added to a per-load-pass cache. Resolution is transitive: callees reachable through `tools:` and through other callees' `invoke` literals are all loaded. A callee that is unreadable, fails to parse, or fails its own structural checks causes the parent's diagnostics drain to include the callee's errors (sorted by `(file, line, col)`, per V18j) plus a parent-site `loom/load/callee-unresolvable` pointer. The parent does not register.

**Spec edits.**

- `invocation.md` — Add a "Static resolution" paragraph after **Resolution**: "A callee is *statically resolvable* if its `path` opens, parses, and lowers without errors during the same load pass that parses the calling loom. Static resolution is transitive: callees reach further callees via their own `invoke` literals and `tools:` `.loom` entries. A callee parse failure is reported as a normal diagnostic in the parent's drain plus a `loom/load/callee-unresolvable` pointer at the parent's `invoke` site; the parent does not register."
- `invocation.md` — Cycle detection: add "Cycle detection walks the same transitive graph used for static resolution; nodes that fail to parse abort their own walk, but the parent has already failed to register, so the question is moot."
- `tool-calls.md`, `functions.md` — Replace "statically resolvable" with a one-line cross-reference to the new paragraph.
- `diagnostics.md` — Add `loom/load/callee-unresolvable` (related sites point at the failed callee).
- `frontmatter.md` — Note that `tools:` `.loom` validation is the same load pass.
- `implementation-notes.md` — Document the load pass: per-pass callee cache; one diagnostics drain for the whole reachable graph.
- V18j (plan) — Extend the rollup rule to "transitive `.warp` imports plus transitive `.loom` callees".

**Pros.** Maximum static catches: argument mismatches, return-type incompatibilities, cycles all caught at parent load. Single uniform answer to all five sub-questions. Cycle detection is sound on the full reachable graph.
**Cons.** Couples parent registration to the health of every reachable callee — a typo in `./logger.loom` blocks `/main`. Load pass becomes I/O-heavy; large graphs traverse many files. Hot-reload (V18g) must invalidate parents transitively whenever a callee changes.
**Risks.** A circular dependency between two slash commands becomes a "neither registers" footgun. Errors from distant callees may be confusing when reported through a slash command the user did not ask about.

### Option B — Best-effort opportunistic load, parse failures are non-fatal

**Approach.** During parent load, the runtime *attempts* to open and parse each callee whose path is a literal. If the callee opens, parses, and lowers cleanly, its `params:` and inferred return type flow into the parent's static checks (argument types, `invoke<Schema>` compatibility, return-type inference, cycle walk). If the attempt fails for any reason (file missing, parse error, structural error), the callee is treated as **not statically resolvable**: the parent registers normally, the corresponding static checks are skipped, and the runtime AJV check is the only safety net. A `loom/load/callee-unparseable` *warning* (not error) is emitted at the parent's `invoke` site naming the callee and the underlying reason. Cycle detection skips unparseable nodes and emits the same warning.

**Spec edits.** Same set of files as Option A, but the new `invocation.md` paragraph reads: "A callee is *statically resolvable* if the runtime can open and parse the file at `path` during the calling loom's load pass without errors. Failed attempts emit a `loom/load/callee-unparseable` warning at the `invoke` site; static checks against that callee are skipped and the runtime AJV check is the safety net. Cycle detection skips unparseable nodes."

**Pros.** Parent registration is independent of callee health — `/main` works even if `./logger.loom` has a typo. Matches the "AJV check is the safety net" framing already in the spec. Lowest blast radius for typos in distant files.
**Cons.** Cycle detection is *unsound* — a typo can mask a real cycle. Type mismatches at the boundary of a half-broken callee are caught only at runtime. Parent diagnostic does not list callee parse errors, so the author must navigate to the callee separately. Two parents referencing the same broken callee both emit the warning.
**Risks.** "Warning fatigue" if callees are frequently in mid-edit. Behaviour depends on file-system race conditions during hot reload (callee being written when parent loads).

### Option C — Eager load, callee errors reported as parent warnings (hybrid)

**Approach.** Same eager transitive load as Option A, but callee parse errors are surfaced as **warnings** in the parent's drain (with a parent-site `loom/load/callee-has-errors` pointer) rather than errors. The parent registers; static checks involving the broken callee are skipped (Option B's runtime-AJV fallback applies). Cycle detection treats the unparseable node as a leaf (does not extend the walk) but emits a warning naming it. The callee itself, when later loaded as a slash command in its own right, fails to register on its own merits.

**Spec edits.** Same files as Option A. The `invocation.md` paragraph distinguishes: "A callee is *statically resolvable* if it opens and parses during the parent's load pass. Unresolvable callees produce a `loom/load/callee-has-errors` warning at the parent's `invoke` site, listing the underlying diagnostic codes; static checks against that callee are skipped and the runtime AJV check is the safety net. Cycle detection treats unresolvable nodes as walk leaves and emits the same warning."

**Pros.** Best of both: authors see distant callee problems through the parent's diagnostics (no need to know which callee is broken), but a broken `./logger.loom` does not block `/main`. Cycle detection is partial but visibly so (warning lists which nodes were skipped). Load pass is uniform with Option A's caching benefits.
**Cons.** Two-tier diagnostic severity (errors that prevent registration vs warnings that don't) requires authors to understand the distinction. Slightly more complex implementation: the load pass must distinguish "callee for the purpose of being a slash command" (its own errors are fatal to itself) from "callee for the purpose of static resolution from a parent" (its errors are warnings to the parent).

### Recommendation

**Option C.** Eager transitive load with callee errors surfaced as parent-site warnings. This gives implementers an unambiguous algorithm (one load pass, one cache, one diagnostics drain), aligns cycle detection with what authors actually expect (the walker visits every node that exists, and skipped nodes are visibly named), and preserves the spec's existing "AJV check is the safety net" framing for the cases where a callee genuinely is not parseable.

Edge cases the implementer must handle:

- **Hot reload.** When a callee file changes, every parent that has it in its reachable graph must be re-validated. The compile cache (V18h equivalent) is keyed on `(parent_path, callee_path)` pairs.
- **Self-cycle through unresolvable nodes.** `A` invokes `B`; `B` is unparseable. `A` registers with a warning. Later `B` is fixed and would have closed a cycle with `A`. The hot-reload of `B` must re-walk from `A`; cycle is caught then.
- **Mutual unresolvability.** `A` invokes `B`, both fail to parse. Each registers nothing on its own (its own parse errors are fatal to itself); the warning-vs-error distinction only matters for the cross-reference.
- **Path escape.** A callee path resolving outside the project tree is a separate concern (see "Missing completeness cases in invocation" item 5) but the load pass should refuse to open such paths *before* the parse attempt — they fail with `loom/load/callee-out-of-tree` (error, not warning) so authors do not get a misleading parse-error warning.
- **Depth bound on transitive load.** The load walk needs the same depth bound as runtime invocation depth (see "Missing completeness cases in invocation" item 1) to prevent unbounded I/O on a maliciously deep graph.
- **`tools:` Pi-tool entries.** Unaffected — Pi tools resolve against Pi's tool registry, not the file system; their availability is already handled by `loom/load/unknown-tool`.

## Related Findings

- "Missing completeness cases in invocation" — decision-dependency (item (2) "static check when resolvable, else runtime" presupposes the resolution algorithm; items (1) depth limit and (5) path escape feed back into the load-pass design)
- "\"Schema validation at parse time\" is imprecise" — same-cluster (the fix to `pi-integration.md` should reuse the precise terminology this finding establishes for parse-time-vs-runtime)
- "No diagnostic codes assigned to named parse errors" — same-cluster (the new `loom/load/callee-has-errors` / `loom/load/callee-out-of-tree` codes are part of the same code-assignment exercise)
- "Tool registry change mid-loom; concurrent model-driven tool execution" — same-cluster (touches the same load-time / runtime registration boundary but resolves independently)

---

# Five unspecified `invoke` edge cases

**Source:** docs/reviews/spec-review/spec-20260504-144255.md
**Original heading:** Missing completeness cases in invocation
**Kind:** completeness, error-model

## Finding

`spec_topics/invocation.md` defines the happy path and the well-known failure variants but is silent on five behaviours an implementer must commit to before V1 can ship. Two implementers reading the current text would diverge on every one of them, and most of the divergences are observable to authors writing `match` arms or to operators debugging crashes.

The five gaps:

1. **No invocation depth bound.** Recursion through `invoke(...)` is allowed, and the spec only requires that "prompt-mode looms… must terminate via control flow." There is no host-protection cap, so a buggy or adversarial loom that recurses without termination crashes the host with a JavaScript stack overflow rather than producing a typed error.
2. **`invoke<Schema>` annotation vs callee return-type incompatibility.** The spec says the runtime AJV-validates the child's return value against the annotated `Schema`, and that static checks at the call site use the callee's inferred return type "when the callee is statically resolvable." It never says what happens when the annotated `Schema` is *itself* incompatible with the callee's inferred return type (e.g. annotated `Plan` but callee returns `Critique`). At present this surfaces only as a per-invocation runtime AJV failure, with no static rejection at parse time even when both ends are resolvable.
3. **Callee `tools:` lifetime in a `prompt → prompt` invoke.** A subagent-mode callee gets a fresh `AgentSession` whose tools are scoped to that session and torn down with it. A prompt-mode callee invoked from a prompt-mode parent attaches to the parent's existing conversation (per the cross-mode matrix) but still uses *its own* `tools:` set. Where those tools live for the duration of the child's body, whether the model sees the union or only the child's set during child-issued queries, and whether they are cleanly removed when the child returns are all unspecified.
4. **Argument arity mismatch.** `invoke(...)` and registered-loom calls bind arguments positionally to the callee's `params:`. The spec gives type-checking rules but never says what happens when the call passes too few non-defaulted arguments or more arguments than the callee declares.
5. **`invoke` paths that escape the calling loom's tree.** Paths are resolved relative to the calling loom's directory and must end in `.loom`, but there is no constraint that the resolved path stay inside any discovery root. `invoke("../../../etc/loom_payload.loom", ...)` is currently a legal expression as long as the file exists and parses.

## Spec Documents

- `spec_topics/invocation.md` — primary; gains depth cap, arity rules, path-restriction rule, schema-vs-return static check, and tools-lifetime rule (edited)
- `spec_topics/tool-calls.md` — argument-binding paragraph cross-references new arity rules; registered-loom-callee section needs the same tools-lifetime statement (edited)
- `spec_topics/frontmatter.md` — `params:` defaults section already names the "non-defaulted" concept; cross-link the new arity rule (edited)
- `spec_topics/discovery.md` — referenced to define "discovery roots" used by the path-restriction rule (read-only)
- `spec_topics/cancellation.md` — referenced for the existing "cancellation propagates down" wording, so the depth-cap surface composes correctly (read-only)
- `spec_topics/errors-and-results.md` — referenced for panic-routing precedent if depth-cap surfaces as a panic (read-only)

## Plan Impact

**Phases:** Vertical V15, Vertical V18

**Leaves (implementation order):**

- V15a — `invoke("./path.loom", ...)` parsing and resolution — (modified) — adds path-escape check at resolution time
- V15c — Typed `invoke<Schema>` with AJV validation — (modified) — gains static `Schema`-vs-callee-return compatibility check when both are statically resolvable
- V15d — Positional argument binding for `invoke` — (modified) — adds arity rules (too-few non-defaulted = error; too-many = error)
- V15e — `.loom` paths in `tools:` (default basename naming) — (modified) — same arity and path-escape rules apply to registered-loom calls
- V15h — Cross-mode cell: prompt → prompt — (modified) — must specify child `tools:` registration lifetime against parent session
- V15l — `InvokeFailure` variant — (modified) — `reason` enum gains a depth-exceeded value if option B in §Solution Space is adopted; otherwise unchanged
- V18n — Panic routing: `invoke` parent surface — (modified) — depth overflow as panic source if option A is adopted

## Consequence

**Severity:** correctness

Without these answers: (1) a recursive loom crashes the host process instead of returning a typed error; (2) a mistyped `invoke<Schema>` annotation only fails on every call rather than at parse time, defeating the static-resolution promise; (3) two implementers disagree on whether prompt-mode child tools leak into the parent's session after return; (4) call-site arity bugs surface as obscure AJV failures or silent argument truncation rather than parse errors; (5) a loom can read or execute arbitrary files outside its tree, which is a real concern for shared `~/.pi/agent/looms/` installs.

## Solution Space

**Shape:** multiple

The five cases are independent; option-space exists only for cases (1) and (5). Cases (2), (3), (4) admit a single conservative fix each.

### Option A — Depth overflow surfaces as a runtime panic (case 1)

**Approach.** Cap stack depth of nested `invoke` chains (including invokes from `.warp` `fn`s) at a fixed integer, default 32. Exceeding the cap raises a runtime panic with a dedicated source identifier (e.g. `loom/runtime/invoke-depth`). Panic routing is already specified: top-level surfaces as a Pi system note; `invoke` parents see `Err({kind:"invoke_failure", reason:"panic", ...})` per V18n.

**Spec edits.** Add to `invocation.md` after the "Cycle detection" paragraph: "The interpreter caps the nesting depth of an `invoke` chain (counting both direct `invoke(...)` and registered-loom calls, and counting through `.warp` `fn` invokes) at 32. Exceeding the cap raises a runtime panic; see [Errors and Results](./errors-and-results.md) (panic sources)." Add the source to the panic-sources list in `errors-and-results.md`.

**Pros.** Reuses the existing panic infrastructure (V18m, V18n) — no new `QueryError` reason. Behaves like a stack overflow conceptually but is typed and localised.

**Cons.** Authors cannot recover via `match` (panics bypass the result type). Any legitimate use case past depth 32 (an unusual but legal recursive divide-and-conquer) becomes unreachable.

**Risks.** The cap interacts with V17j (warp `fn` invokes) — counting must include those. If V18n lands first, the panic-routing tests must be extended to cover the new source.

### Option B — Depth overflow surfaces as `InvokeFailure { reason: "depth_exceeded" }` (case 1)

**Approach.** Same fixed cap, but surface the failure as a recoverable `Err` rather than a panic. Add `depth_exceeded` to the `InvokeFailure.reason` enum.

**Spec edits.** Same paragraph in `invocation.md`, but worded as a `Result`-typed failure. Extend `InvokeFailure.reason` enum and the V15l test matrix.

**Pros.** Recoverable — a parent can `match` and degrade gracefully. Symmetric with the rest of the `InvokeFailure` family.

**Cons.** A loom crashing the host with deep recursion is, by analogy with cycle detection (parse-time error) and panic-on-MatchError (unconditional abort), more naturally a "the implementation refuses to continue" event than a recoverable error. Surfacing as `Err` invites authors to "handle and retry," which deepens the stack further.

**Risks.** None new beyond V15l.

### Option C — Path restriction: confine `invoke` to the calling loom's discovery root (case 5)

**Approach.** At resolution time, compute the discovery root that owns the calling loom (one of the entries in [Directory Convention](./discovery.md)) and reject any resolved path that escapes it. Errors are `loom/load/invoke-path-escape`. Per-package looms are confined to their package's `looms/` directory; project looms to `.pi/looms/`; global looms to `~/.pi/agent/looms/`; CLI- and settings-supplied looms to the directory containing the file.

**Spec edits.** In `invocation.md` "Resolution" paragraph: "The resolved path must lie within the calling loom's discovery root (see [Directory Convention](./discovery.md)). Paths that escape the root are a parse error (`loom/load/invoke-path-escape`)."

**Pros.** Closes the path-traversal hole. Aligns with the discovery model — looms are already organised into roots.

**Cons.** Forbids legitimate cross-root composition (a project loom invoking a global utility) without a sanctioned mechanism. Authors who today ship a `looms/` package and want to compose multiple subpaths via relative paths break.

**Risks.** Resolution must be done after symlink-realpath normalisation; otherwise a symlink defeats the check. Defining "discovery root" cleanly requires a small addition in `discovery.md`.

### Option D — Path restriction: confine to *any* discovery root (case 5)

**Approach.** Same as C, but the resolved path must lie within the union of all discovery roots active for the current Pi session (project + global + each package's `looms/` + each settings/CLI-supplied entry). Cross-root composition stays possible; `../../etc/loom_payload.loom` is still rejected.

**Spec edits.** Same paragraph, but "must lie within one of the active discovery roots."

**Pros.** Permits the realistic case of a project loom invoking a global utility, while still excluding arbitrary filesystem paths.

**Cons.** Less restrictive than C; an attacker who can plant a `.loom` anywhere a discovery root reaches still wins (but they already do, because that file would be auto-registered as a slash command).

**Risks.** Same as C.

### Recommendation

Apply all five fixes in the V15 round. Specifically:

- **(1) Depth cap — Option A (panic).** Add a fixed cap of 32 to `invocation.md` with overflow as a runtime panic, source `loom/runtime/invoke-depth`. Counting includes direct `invoke`, registered-loom calls, and warp `fn` invokes. Recovery via `Err` (Option B) is rejected because the analogous bound — invocation cycles — is already a parse error, not a recoverable failure, and "handle and retry" semantics around stack depth invite further stack growth.
- **(2) `invoke<Schema>` vs callee return-type compatibility.** When both the annotation and the callee are statically resolvable, the parser checks structural compatibility between the annotated `Schema` and the callee's inferred return type using the existing schema-compatibility rules. Mismatch is a parse error (`loom/parse/invoke-return-type-mismatch`). Otherwise the runtime AJV check remains the safety net (existing wording stands). Edit the "Typed return" paragraph in `invocation.md` to state this explicitly.
- **(3) Prompt → prompt callee `tools:` lifetime.** State in `invocation.md` (cross-mode "Tools and model" paragraph): "When a prompt-mode child attaches to the caller's conversation, the child's `tools:` set is registered against that conversation for the duration of the child's body and unregistered when the child returns (or aborts/cancels/panics). The model sees the child's tools — not the parent's — during any query the child issues; on child return, the parent's `tools:` set is restored." This generalises the one-shot-tool pattern already used for typed queries (see `pi-integration-contract.md`). The same statement covers the dual case in `tool-calls.md`'s registered-loom-callee paragraph.
- **(4) Argument arity.** State in `invocation.md` "Argument binding" paragraph: "Too few arguments — fewer than the count of non-defaulted `params:` — is a parse error when the callee is statically resolvable (`loom/parse/invoke-arity-too-few`); otherwise a runtime `InvokeFailure { reason: 'validation' }`. Too many arguments — more than the total `params:` count — is always a parse error (`loom/parse/invoke-arity-too-many`); since extra positional arguments cannot be matched to any param, no runtime safety net applies." `tool-calls.md` cross-references this rule for registered-loom calls. Pi tool calls (single object argument) are unaffected.
- **(5) Path restriction — Option D (any discovery root).** Reject `invoke` paths that resolve outside the union of active discovery roots. This preserves cross-root composition while closing the traversal hole. Realpath the resolved path before checking. Edit `discovery.md` to give the term "discovery root" a definition the new `invocation.md` paragraph can link to.

Edge cases the implementer must cover:

- The depth cap's counter must be per-chain, not per-process (sibling invokes do not share the budget).
- The static `Schema`-vs-return check (case 2) must use the same compatibility relation that `let x: T = expr` uses, not a stricter equality — otherwise upcasting a callee's narrower return to a wider annotated type is a regression.
- The `tools:` swap (case 3) must be idempotent under nested prompt → prompt → prompt chains; on return, the immediately-prior set is restored, not the root.
- The arity check (case 4) must run *before* type checking each argument, so an arity error is reported as such rather than as a confusing per-argument type error on the first extra slot.
- The path-restriction check (case 5) operates on the post-realpath form; a symlink farm inside a discovery root resolving outside it must still be rejected.

## Related Findings

- "`tools:` registration scope: global vs per-loom" — co-resolve (case 3 here is the cross-mode prompt-mode form of the same registration-lifetime question; the fix paragraph in `invocation.md` should reference the broader registration model the other finding nails down)
- "Cancellation surfacing: `InvokeFailure` vs `InvokeCalleeError` — irreconcilable" — same-cluster (both touch `InvokeFailure.reason`; whichever lands first should leave the enum in a state the other can extend)
- "`InvokeFailure` breaks the `*Error` suffix pattern" — decision-dependency (if `InvokeFailure` is renamed, the `reason: "depth_exceeded"` addition from Option B — and the panic-source naming in Option A — must use the new name)
- "\"Statically resolvable\" callee never defined" — decision-dependency (case 2 here piggybacks on whatever resolvability algorithm that finding settles)
- "`params:` absent/empty and slash-argument excess behaviour unspecified" — same-cluster (case 4 here is the code-side analogue of that finding's slash-side question; both should land matching arity rules)
- "Discovery source failure modes partly unspecified" — same-cluster (case 5 here depends on a clean definition of "discovery root" that finding can help shape)

---

# `InvokeFailure` is the lone schema in `QueryError` without an `*Error` suffix

**Source:** docs/reviews/spec-review/spec-20260504-144255.md
**Original heading:** `InvokeFailure` breaks the `*Error` suffix pattern
**Kind:** naming

## Finding

`QueryError` is declared as a discriminated union of seven schemas. Six of them
end in `Error` — `ValidationError`, `TransportError`, `ToolFailureError`,
`ToolCallError`, `ContextOverflowError`, `CancelledError`, `InvokeCalleeError`.
The seventh, `InvokeFailure`, alone uses `Failure`. The naming pattern for
schema-level identifiers in this union is otherwise uniform.

The wire-level `kind` discriminator strings (`"validation"`, `"transport"`,
`"invoke_failure"`, `"invoke_callee_error"`, …) are snake_case nouns and do not
themselves follow an `_error` suffix convention, so the inconsistency is
confined to the schema identifier authors see when they `match` on the
union or when they read the union declaration in `query.md`. It is a small
papercut, but `query.md` and `descriptions.md` both reproduce the union
verbatim, and any reader scanning the list spots the odd one immediately.

The likely reason `Failure` was chosen is to mark a contrast with
`InvokeCalleeError` — the former covers infrastructure failure (load, parse,
validation, cancellation, panic) before or around the callee body, while the
latter wraps an `Err` the callee actually returned. That contrast is real and
worth preserving in the *name*, but it does not require breaking the suffix
pattern.

## Spec Documents

- `spec_topics/invocation.md` — `InvokeFailure` schema declaration, "Failures" section (edited)
- `spec_topics/query.md` — `QueryError` union declaration and surrounding prose (edited)
- `spec_topics/descriptions.md` — `QueryError` union restatement (edited)
- `spec_topics/errors-and-results.md` — panic-routing bullet referencing `kind: "invoke_failure"` (read-only; wire kind unchanged)
- `spec_topics/cancellation.md` — referenced for the parallel naming question for `cancelled` placement (read-only)

## Plan Impact

**Phases:** Vertical V15, Vertical V18

**Leaves (implementation order):**

- V15l — `InvokeFailure` variant — (modified)
- V15m — `InvokeCalleeError` variant with recursive `inner` — (modified)
- V18o — Panic in invoked child surfaces as `invoke_failure` — (modified)

The V15l leaf header itself names the schema; renaming the schema means
renaming the leaf header and any test labels that mention `InvokeFailure` by
name. The wire `kind: "invoke_failure"` discriminant string in the V15l body
and V18o "Adds" line is unaffected and stays as-is.

## Consequence

**Severity:** cosmetic

No observer behaviour changes; the union's runtime contract and wire format
are unaffected. The cost of leaving it is a permanent visual irregularity in
every place the variant set is enumerated and a small recurring "why is this
one different?" moment for anyone learning the type. The cost of fixing it is
a one-pass rename across three spec files and one plan leaf header.

## Solution Space

**Shape:** multiple

### Option A — `InvokeError`

- **Approach.** Rename the schema `InvokeFailure` → `InvokeError`. Wire
  `kind: "invoke_failure"` stays.
- **Spec edits.** `invocation.md` schema block; `query.md` union and prose;
  `descriptions.md` union; V15l leaf header in `plan_topics/v15-invoke.md`.
- **Pros.** Shortest name; matches the suffix pattern with zero
  qualification. Symmetric with `InvokeCalleeError` (both start with
  `Invoke`, both end with `Error`).
- **Cons.** `InvokeError` and `InvokeCalleeError` are now distinguished only
  by the word `Callee` in the middle. Readers skimming a `match` arm list
  may conflate the two; the names no longer foreground the
  infra-vs-callee axis.
- **Risks.** Small risk of authors reaching for `InvokeError` when they want
  the callee-returned variant.

### Option B — `InvokeInfraError`

- **Approach.** Rename `InvokeFailure` → `InvokeInfraError`. Wire kind
  unchanged.
- **Spec edits.** Same files as Option A.
- **Pros.** Name explicitly states the contrast with `InvokeCalleeError`
  (infra-side vs callee-side). Reads naturally in prose: "the loom
  infrastructure raised an `InvokeInfraError`."
- **Cons.** Coins a new domain term (`Infra`) that does not appear elsewhere
  in the spec; one-off jargon. Slightly verbose. The existing prose
  ("invoke-specific failures") never uses the word "infra".
- **Risks.** If later additions split errors along a different axis
  (e.g. `InvokeTimeoutError`), the `Infra` qualifier ages awkwardly.

### Option C — `CalleeLoadError` (or similar reason-led name)

- **Approach.** Discard the `Invoke*` prefix and name the variant after what
  it carries. Since the schema's `reason` enum is
  `load_failure | parse_failure | validation | cancelled | panic`, the
  variant is really "the callee never produced a value to wrap." A name
  like `CalleeLoadError` (focused on the dominant case) or
  `CalleeAbsentError` could work.
- **Spec edits.** Same files; also any prose referring to the variant by
  semantic role.
- **Pros.** Decouples the two `Invoke*` names so they are not lexically
  similar.
- **Cons.** The schema covers more than load — `validation`, `cancelled`,
  and `panic` are not "load" failures. Any reason-led name either
  understates (`CalleeLoadError`) or overstates (`CalleeAbsentError`)
  the coverage. Loses the symmetry with `InvokeCalleeError`.
- **Risks.** Bikeshed-prone; no obvious winner.

### Recommendation

Adopt **Option B — `InvokeInfraError`**. The `Invoke*` prefix is worth
keeping because `match` arms typically list both invoke-side variants
adjacently and the shared prefix groups them visually; the `Infra`
qualifier then carries the infra-vs-callee distinction in the name itself,
which is the property authors actually need to recall when writing the
arms. Wire `kind` stays `"invoke_failure"` (snake_case discriminants do not
follow the suffix rule and changing them is an unrelated, larger churn).
The fixer should also add a one-line note in the `invocation.md` "Failures"
paragraph clarifying the infra-vs-callee split, since the new name now
implies it.

Edge cases the implementer must watch:

- `errors-and-results.md` line referencing
  `Err(QueryError { kind: "invoke_failure", reason: "panic", ... })` —
  wire kind is unchanged, so this stays.
- The plan leaf V15l header reads ``## V15l — `InvokeFailure` variant``;
  rename to ``## V15l — `InvokeInfraError` variant``. Tests phrased as
  "Each reason synthesised and surfaces correctly" need no change.
- Search for any prose using the bare word "InvokeFailure" outside the
  schema block (e.g. cross-references in `tool-calls.md` line 41).

## Related Findings

- "Cancellation surfacing: `InvokeFailure` vs `InvokeCalleeError` — irreconcilable" — decision-dependency (resolving the `cancelled`-placement question may add or remove a `reason` from this schema, but its *name* is settled by this finding's fix and either resolution must use the new name)
- "`QueryError` union has three conflicting authoritative definitions" — co-resolve (the rename must land simultaneously in `query.md`, `descriptions.md`, and `invocation.md`; doing it as part of consolidating the union is cheaper than two separate passes)
- "`QueryError` variants split across three files with no consolidated reference" — co-resolve (if the consolidation lands first, the rename is a one-file edit instead of a three-file edit)
- "`ToolCallError` / `ToolFailureError` names do not signal their contexts" — same-cluster (parallel naming concern within the same union; both findings argue the names should make the contextual distinction explicit)
- "`ValidationFailure` / `ValidationError` — \"failure\" and \"error\" at wrong nesting levels" — same-cluster (same `Failure` vs `Error` axis, but at the inner-element level rather than the union-variant level; resolutions can be coordinated for vocabulary consistency)
- "Per-`kind` system-note table covers only 5 of 8 `QueryError` variants" — same-cluster (the table will need to use the new schema name when it grows to cover the missing variants)

---

## spec_topics/diagnostics.md

---

# Observability surface (logging, metrics, token accounting) is unspecified

**Source:** docs/reviews/spec-review/spec-20260504-144255.md
**Original heading:** Logging, metrics, and cost/token accounting missing entirely
**Kind:** completeness, error-model

## Finding

The spec defines two observer surfaces — user-visible (system notes via `loom-system-note`) and author-visible (`Result<_, QueryError>`) — and a load-time diagnostics channel (`loom/parse/*`, `loom/load/*`, etc.). Beyond those, it is silent: there is no statement about durable runtime logs, structured telemetry, per-loom or per-query token accounting, or an event sink that captures failures the author chose to discard. `spec_topics/diagnostics.md` only defines the *parse / load / type / runtime-panic* shape; nothing covers in-flight runtime events such as transport failures inside a query, tool-call failures, binder failures, panics, coercion-attempt counts, or token consumption per query.

This matters in two ways. First, an operator or loom author cannot answer routine production questions ("how many tokens did `/code-review` burn last week?", "why did this query fail an hour ago?", "how often does binder coercion succeed?") without each implementer inventing their own telemetry surface. Second, and more concretely, an `Err` that the author discards (`let _ = @\`...\``) currently has *no defined trace at all* — that is the same gap covered by the "Discarded `Result` is a silent observability black hole" finding, but it generalises: all error variants suffer the same ambiguity about whether they leave a durable trace independent of author handling.

The contract `pi-loom` exposes to its host extension API already includes `pi.sendMessage({ customType, ... details })` and Pi presumably has its own diagnostics/log channel; the spec just never says which loom-runtime events flow there, which are author-only, and which are silent. Two reasonable implementers will diverge.

## Spec Documents

- `spec_topics/diagnostics.md` — whole file (edited)
- `spec_topics/pi-integration-contract.md` — system notes / contract surface (edited)
- `spec_topics/errors-and-results.md` — discarded-`Err` semantics, panic emission (edited)
- `spec_topics/query.md` — `QueryError` variants (read-only; cross-reference target)
- `spec_topics/tool-calls.md` — `ToolCallError` cause taxonomy (read-only)
- `spec_topics/invocation.md` — `InvokeFailure` / `InvokeCalleeError` (read-only)
- `spec_topics/binder.md` — binder failure paths (read-only)
- `spec_topics/future-considerations.md` — explicit deferrals for telemetry beyond the V1 baseline (edited)

## Plan Impact

**Phases:** Horizontal, Vertical V14, Vertical V15, Vertical V16, Vertical V18

**Leaves (implementation order):**

- H3 — Diagnostics primitive and multi-error accumulator — (modified — `DiagnosticsSink` gains a runtime-event emission path distinct from the load-time accumulator, or a sibling sink is introduced)
- V14 — Tool calls and discovery (V14c specifically — direct tool-call failure emission) — (modified)
- V15 — `invoke`, registered loom callees, cross-mode (V15l — invoke-failure surfacing) — (modified)
- V16 — Slash-command argument binder (V16's binder-failure leaf) — (modified)
- V18h — Custom Pi message type `loom-system-note` and renderer — (modified — `details` payload schema becomes load-bearing for telemetry consumers)
- V18i — Per-`kind` formatting for prompt-mode top-level `Err` — (modified — same event also flows to observability sink)
- V18m — Panic routing: slash-command surface — (modified)
- V18n — Panic routing: `invoke` parent surface — (modified)

A new leaf in V18 covering the observability sink itself (event shape, the always-log set, the rate-limit rule) is the natural home; without it the modifications above have no shared contract to target.

## Consequence

**Severity:** advisory

A V1 that ships without this section is functionally compliant — every spec-defined observer surface still works. But operators cannot diagnose production loom behaviour beyond what the user sees in-transcript, the "Discarded `Result`" hole stays open, and any future telemetry consumer (dashboard, cost report, replay tool) has to retrofit the event shape after implementations have already diverged. Two implementers will pick incompatible telemetry surfaces.

## Solution Space

**Shape:** multiple

### Option A — Defer entirely to a future "Observability" topic

Add a one-line entry to `spec_topics/future-considerations.md` ("Structured telemetry: per-loom token accounting, durable failure logs, cost reporting") and explicitly state in `diagnostics.md` that V1's only observer surfaces are the load-time diagnostics channel, the in-transcript system notes, and the author-visible `Result`. Discarded `Err` values produce no other trace.

**Spec edits:** one bullet in `future-considerations.md`; one short paragraph in `diagnostics.md` closing the door.
**Pros:** smallest V1 surface; no plan churn; consistent with the spec's general "defer until usage demands it" stance.
**Cons:** cements the discarded-`Err` black hole; implementers who *do* want telemetry have no shared shape, so an LSP/replay/cost-report tool added in V2 has to scrape user-visible notes.
**Risks:** future telemetry retrofit becomes a breaking change across implementations.

### Option B — Add a minimal "Observability" section with a baseline always-log set

Add an `Observability` section to `spec_topics/diagnostics.md` (or a new `spec_topics/observability.md`) that:
1. Defines a runtime-event channel — concretely, the `details` payload of every `loom-system-note` is normative and consumable, plus an internal `pi-loom`-owned debug-log entry per event for the cases the author suppressed.
2. Names an always-emitted-once-per-event set: `transport` failures, `tool_failure`, `tool_call` failures, `panic` (every source), `binder` failures, `invoke_failure`. These emit regardless of whether the author matched, `?`-propagated, or discarded the `Err`.
3. Specifies the structured payload shape: `{ loom, query_site, kind, code, message, attempts, tokens_used? }` — minimal, and reuses fields already on `QueryError` variants.
4. Defines deduplication: each runtime event emits once per occurrence; a downstream `?` propagation does *not* re-emit.
5. Defers per-loom token aggregation, latency histograms, and cost reporting to a `Future Considerations` bullet.

**Spec edits:** ~one page in `diagnostics.md` (or new `observability.md`), cross-references from `errors-and-results.md` (discarded-`Err` clause) and each `QueryError` variant doc, one bullet in `future-considerations.md` for the deferred richer surface.
**Pros:** closes the discarded-`Err` hole with a single normative rule; gives a stable shape for future telemetry; small enough to land in V18 without restructuring.
**Cons:** adds spec surface; commits to a payload shape this early.
**Risks:** the chosen payload shape may need extension (additive only) when richer telemetry lands.

### Option C — Full telemetry surface in V1

Specify a structured event log (start / end / token-usage / latency per query, per tool call, per invoke), per-loom aggregates, per-coercion-attempt records, and a normative consumer API for reading them.

**Spec edits:** new `spec_topics/observability.md`, plumbing references in every runtime-execution topic, new leaves under V18 for emission and aggregation.
**Pros:** complete; no retrofit risk.
**Cons:** large V1 surface; couples loom to a telemetry contract before usage data exists; pulls in product decisions (where do aggregates live? how long retained? exposed to authors?).
**Risks:** scope creep; slips V1.

### Recommendation

Take Option B. The minimum that resolves real divergence between implementers is the *always-log set* and the *normative `details` payload shape* — those two clauses also retire the "Discarded `Result` is a silent observability black hole" finding as a co-resolve. Defer aggregation, cost reporting, and a consumer-facing API to a single `future-considerations.md` bullet so the door is explicitly open.

Edge cases the implementer must watch:
- A `?`-propagation chain must emit exactly once at the originating site, not at each rethrow.
- Coercion attempts on a typed query that ultimately succeeds should not emit a `validation` runtime event for each failed attempt — those are internal to the query primitive; only the *final* outcome is an observable event. (Or specify the opposite — but pick one.)
- Panics emit before the panic system note, not after, so a crash during note rendering still produces the observability record.
- The runtime event for a `tool_call` failure must not duplicate the system note already emitted by the tool host; the spec needs to say which side owns the emission.

## Related Findings

- "Discarded `Result` is a silent observability black hole" — co-resolve (Option B's "always-log set" rule subsumes this finding entirely)
- "No diagnostic codes assigned to named parse errors" — same-cluster (also a traceability/observability gap, but on the load-time side; resolves independently via a code table)
- "`pi.sendMessage` failure has no fallback" — decision-dependency (if `loom-system-note` becomes the normative telemetry channel under Option B, the fallback story for `sendMessage` failures becomes more load-bearing)
- "Per-`kind` system-note table covers only 5 of 8 `QueryError` variants" — same-cluster (the missing rows are exactly the variants that would also need always-log entries; one editing pass can close both)
- "Coercion follow-up failure modes unspecified" — decision-dependency (the coercion-attempt edge case in the recommendation depends on what that finding settles)

---

## Cross-Cutting / Whole Spec

---

# `QueryError` variant schemas have no single home

**Source:** docs/reviews/spec-review/spec-20260504-144255.md
**Original heading:** `QueryError` variants split across three files with no consolidated reference
**Kind:** placement

## Finding

The eight variants of `QueryError` — Loom's only user-visible error type, the carrier of every `?` and every `match` arm — are defined in three different topic files. `query.md` declares the union itself and the five "query-time" variants (`ValidationError`, `TransportError`, `ToolFailureError`, `ContextOverflowError`, `CancelledError`); `tool-calls.md` adds `ToolCallError`; `invocation.md` adds `InvokeFailure` and `InvokeCalleeError`. `query.md` lists all eight names in the union but only defines five of them, and a parenthetical points readers off-page for the rest.

The result is that no single page answers "what fields can I see in the `Err` arm of a Loom function?". Implementers, authors writing exhaustive `match` blocks, and the binder/diagnostics machinery that needs to format these variants must triangulate across three files. The split also creates the conditions for the drift documented in adjacent findings: `descriptions.md` shows a 7-variant illustrative declaration, `slash-invocation.md`'s system-note table covers 5, and the canonical union has 8.

`errors-and-results.md` already owns the surrounding machinery — `Result<T, E>`, `?`, `match`, the pattern grammar, and panic vs. `Err` routing — but stops short of defining the variants themselves. That gap is exactly where the consolidated reference belongs.

## Spec Documents

- `spec_topics/errors-and-results.md` — new "QueryError variants" section (edited)
- `spec_topics/query.md` — failure-modes section (edited: drop the `schema` blocks, keep narrative + cross-link)
- `spec_topics/tool-calls.md` — failures section (edited: drop the `ToolCallError` `schema` block, keep narrative + cross-link)
- `spec_topics/invocation.md` — failures section (edited: drop the `InvokeFailure`/`InvokeCalleeError` `schema` blocks, keep narrative + cross-link)
- `spec_topics/descriptions.md` — illustrative `QueryError` example (edited: replace with a cross-link to the canonical definition, or update to mirror it exactly)
- `spec_topics/slash-invocation.md` — per-`kind` system-note table (read-only here; reconciled by a separate finding)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

(No leaf's `Tests` / `Ships when` clauses change. Several leaves' `**Spec.**` link targets — `V5g`, `V6i`, `V6j`, `V14f`–`V14i`, `V15l`, `V15m` — should be repointed to the consolidated section as a mechanical follow-up, but that is documentation hygiene, not an acceptance-criteria change, and does not block or re-order any leaf.)

## Consequence

**Severity:** advisory

Implementation can proceed unchanged — the union is unambiguous once you've read all three pages. The cost is paid by every reader who needs the full picture (authors writing `match` arms, the diagnostics implementer formatting `Err` values, future spec editors who must remember to update three places at once). The drift visible in `descriptions.md` and `slash-invocation.md` is the predictable downstream symptom.

## Solution Space

**Shape:** multiple

### Option A — Add a "QueryError variants" section to `errors-and-results.md`

**Approach.** Extend the existing errors page with a normative section that declares the `QueryError` union and the full body of every variant `schema { ... }`. Keep the surrounding pages narrative-only: `query.md`'s "Failure modes" paragraph keeps its prose explaining when each query-time variant fires and links to the canonical definition; `tool-calls.md` and `invocation.md` do the same for their context-specific variants.

**Spec edits.**
- `errors-and-results.md`: add `## QueryError variants` after the panics section, containing the union declaration and all eight `schema` blocks in a fixed order (query-time first, then tool-call, then invoke). Each variant gets a one-line "fires when" lead-in.
- `query.md`: replace the eight `schema` blocks with a single sentence pointing to `errors-and-results.md#queryerror-variants`; keep the prose explaining which variants are query-time and the design notes about `validation_errors` shape and discriminator field.
- `tool-calls.md`, `invocation.md`: same treatment for their respective variants.
- `descriptions.md`: replace the seven-variant illustrative declaration with a cross-link, or update it to mirror the canonical eight verbatim.

**Pros.**
- No new file.
- Co-locates the variant schemas with the `match`/`?`/`Result` machinery that consumes them — a reader on `errors-and-results.md` already has all the context needed to read the variants.
- Requires the smallest set of cross-references in the existing pages.

**Cons.**
- `errors-and-results.md` grows from a short conceptual page to a longer reference-style page mixing two registers (concept + variant catalogue).
- `query.md`'s failure-modes section is no longer self-contained for someone reading just that page.

**Risks.** Low. The variant definitions are stable; collocating them with the consuming machinery is unlikely to cause edit churn.

### Option B — New file `error-types.md` dedicated to the variants

**Approach.** Create `spec_topics/error-types.md` containing only the `QueryError` union and variant schemas. `errors-and-results.md` stays focused on `Result`/`?`/`match`/panics; the three feature pages keep narrative only and link to the new page.

**Spec edits.**
- New `spec_topics/error-types.md` with the union and all eight schemas.
- `query.md`, `tool-calls.md`, `invocation.md`: replace `schema` blocks with cross-links.
- `errors-and-results.md`: link to `error-types.md` from the introduction.
- `descriptions.md`: replace illustrative declaration with a cross-link.
- `coverage-matrix.md`: add a row for the new page.

**Pros.**
- Cleanest separation of concerns: concept page vs. variant catalogue.
- The new page is naturally where any future user-defined error-type story would live (currently out of scope).

**Cons.**
- Adds a new spec page, increasing the table-of-contents weight for what is essentially a reference appendix.
- A reader of `errors-and-results.md` now needs one more click to see the variants their `match` arms must cover.
- Forces an update to the coverage matrix.

**Risks.** Low.

### Option C — Reference appendix at the end of `query.md`

**Approach.** Keep all three pages as-is, but add a final "Appendix: full `QueryError` shape" section to `query.md` that re-states all eight variants in one place, with each block annotated to indicate it is a copy of the authoritative definition elsewhere.

**Spec edits.** Append to `query.md` only.

**Pros.**
- Smallest edit; preserves the per-page narrative.

**Cons.**
- Creates a deliberate duplication, which is precisely the failure mode the finding describes — `descriptions.md` is already a copy that drifted.
- Picks `query.md` as the host arbitrarily; an `invoke`-only loom that never queries still has to read `query.md` to find its error types.

**Risks.** Medium. Two normative copies of the same `schema` block invite divergence the next time a variant gains a field.

### Recommendation

Take **Option A**. Adding a `## QueryError variants` section to `errors-and-results.md` puts the variant definitions next to the constructs (`Result`, `match`, `?`) that consume them, and avoids both a new file and the deliberate duplication of Option C. The three feature pages keep their context-specific narrative ("when does this variant fire, and why does it carry these fields rather than those?") and lose only the `schema` blocks themselves.

Edge cases the implementer must watch:

- The variant ordering in the consolidated section should match the ordering in the union declaration so a reader can scan top-to-bottom.
- The `descriptions.md` illustrative declaration should be replaced with a cross-link rather than re-mirrored — every mirrored copy is a future drift hazard.
- `slash-invocation.md`'s per-`kind` table is governed by a separate finding; the consolidation should expose all eight `kind` discriminators in one place so that table can be made exhaustive without further triangulation.
- The recursive `inner: QueryError` field on `InvokeCalleeError` becomes self-referential within a single section, which is clearer than the current cross-file recursion.

## Related Findings

- "`QueryError` union has three conflicting authoritative definitions" — co-resolve (consolidating into one location is the natural fix for the conflicting-definitions finding too).
- "`QueryError` example missing `ToolCallError`" — co-resolve (a single canonical declaration in `errors-and-results.md` removes the surface on which `descriptions.md` can drift).
- "Per-`kind` system-note table covers only 5 of 8 `QueryError` variants" — same-cluster (a consolidated variant list makes the table's incompleteness obvious and easy to fix; same root cause but resolves independently).
- "`ToolCallError` / `ToolFailureError` names do not signal their contexts" — same-cluster (renaming the variants is independent of where they live, but easier to do once they share a page).
- "`ValidationFailure` / `ValidationError` — \"failure\" and \"error\" at wrong nesting levels" — same-cluster (same surface, independent rename decision).

---

# `ToolCallError` and `ToolFailureError` names hide their execution-path contexts

**Source:** docs/reviews/spec-review/spec-20260504-144255.md
**Original heading:** `ToolCallError` / `ToolFailureError` names do not signal their contexts
**Kind:** naming

## Finding

Loom defines two `QueryError` variants for tool failures, partitioned by *who invoked the tool*: `ToolCallError` covers a tool that loom code invoked directly via `<name>(args)`, and `ToolFailureError` covers a tool that the model invoked inside a query's tool-call loop. The names do not encode that partition. `ToolCallError` reads as the more general of the two — every model-loop tool failure is also "a tool call that errored" — yet it is the narrower, code-side variant. `ToolFailureError`, by carrying the word "failure," reads as the more emphatic of the two, yet it is the routine model-loop case that any non-trivial typed query will hit.

The spec compensates for the naming with a paragraph in `query.md` and another in `tool-calls.md` explaining which is which. That prose works for someone reading sequentially, but the names appear bare in `match` arms, in error-path documentation, in IDE autocomplete, and in user-written `match QueryError { kind: "tool_call" => ... ; kind: "tool_failure" => ... }` patterns. At each appearance the reader has to recall — or look up — which case is the code-side path and which is the model-loop path. Two reasonable authors will write `match` arms for the wrong case.

The mismatch is reinforced by the discriminator strings: `kind: "tool_call"` (an action noun, not a failure noun) on the code-side variant, and `kind: "tool_failure"` (a failure noun) on the model-side variant. The two halves of the API name the same partition with different vocabularies, neither of which is "code-side vs model-side."

## Spec Documents

- `spec_topics/query.md` — `QueryError` definition, union listing, separation paragraph (edited)
- `spec_topics/tool-calls.md` — `ToolCallError` schema and the "distinct from `ToolFailureError`" paragraph (edited)
- `spec_topics/descriptions.md` — illustrative `QueryError` declaration (edited)
- `spec_topics/cancellation.md` — `kind: "tool_call"` example in the abort-result bullet (edited)
- `spec_topics/slash-invocation.md` — per-`kind` formatting table (`tool_failure` row) (edited)
- `spec_topics/pi-integration-contract.md` — `kind: "tool_call", cause: "execution"` example (edited)
- `spec_topics/errors-and-results.md` — pattern grammar; check for variant-name examples (read-only)
- `spec.md` — TOC entry mentions `ToolCallError` (edited)

## Plan Impact

**Phases:** Vertical V5, Vertical V14, Vertical V18

**Leaves (implementation order):**

- V5g — `QueryError` union — initial variants — modified
- V14c — Bare `<name>(args)` call from loom code — modified
- V14f — `ToolCallError` variant: `validation` cause — modified
- V14g — `ToolCallError` variant: `execution` cause — modified
- V14h — `ToolCallError` variant: `cancelled` cause — modified
- V14i — `ToolCallError` variant: `unknown_tool` cause — modified
- V18c — `AbortSignal` before every tool call — modified

## Consequence

**Severity:** advisory

Implementations will be correct because the prose explains the partition, but every author and every implementer pays an ongoing recall cost at each `match` site. Misrouted error handling (catching `ToolFailureError` while meaning to catch the code-side case, or vice versa) will be a recurring footgun in user looms and in implementation code. The cost compounds in tooling: docstrings, autocomplete, and error messages all surface the unclear name without the explanatory paragraph.

## Solution Space

**Shape:** multiple

### Option A — Rename around the call site (`CodeToolError` / `ModelToolError`)

- **Approach.** Rename `ToolCallError` → `CodeToolError`; rename `ToolFailureError` → `ModelToolError`. Discriminator strings become `kind: "code_tool"` and `kind: "model_tool"`.
- **Spec edits.** Replace the type names everywhere they appear (see Spec Documents). Rewrite the "deliberately separate variants" paragraph in `query.md` to be one sentence: the names already carry the distinction. Update `tool-calls.md`, `descriptions.md`, `slash-invocation.md`, `pi-integration-contract.md`, `cancellation.md`, and the spec.md TOC.
- **Pros.** The two names form a tight symmetric pair; either name immediately tells the reader which execution path it belongs to. Same length, same shape, both end in `ToolError`. Eliminates the "tool_call as action noun" inconsistency.
- **Cons.** "Code" is slightly imprecise — both kinds of failure surface in loom code; the distinction is *who initiated the call*. Two-letter delta from each existing name (`ToolCall` → `CodeTool`, `ToolFailure` → `ModelTool`) is still a wide rename.
- **Risks.** Low. Internal-only API at this stage; no external compatibility surface yet.

### Option B — Rename around the invocation mechanism (`DirectToolError` / `LoopToolError`)

- **Approach.** Rename `ToolCallError` → `DirectToolError`; rename `ToolFailureError` → `LoopToolError`. Discriminator strings become `kind: "direct_tool"` and `kind: "loop_tool"`.
- **Spec edits.** As Option A, with different names.
- **Pros.** "Direct" / "Loop" maps cleanly onto the spec's existing language (`<name>(args)` is the "direct" path; the model's "tool-call loop" is the loop path). The mechanism distinction is more accurate than "code vs model" — the model-loop case is also driven by loom code, just indirectly.
- **Cons.** "Loop" is jargon; readers unfamiliar with the agentic-tool-loop pattern will not infer meaning from the bare name. "Direct" is meaningful only by contrast — alone, it raises "direct as opposed to what?".
- **Risks.** Low.

### Option C — Keep `ToolFailureError`; rename only `ToolCallError` → `DirectToolCallError`

- **Approach.** Minimal-edit version. `ToolFailureError` and `kind: "tool_failure"` stay; `ToolCallError` becomes `DirectToolCallError` with `kind: "direct_tool_call"`. The "more emphatic" name keeps the more emphatic case (model-loop) and the qualifier disambiguates the code-side variant.
- **Spec edits.** Smaller blast radius — only the code-side variant's name and its `kind` discriminator move; the model-side stays.
- **Pros.** Smallest churn. Preserves the existing `tool_failure` discriminator, which is already cited from many leaves and from the slash-invocation formatting table.
- **Cons.** Asymmetric pair — one name carries an explicit qualifier, the other does not. The narrower variant has the longer name, which is unusual and slightly awkward in `match` arms. Does not address the underlying noun mismatch (`call` vs `failure`) on the model-side variant.
- **Risks.** Low.

### Recommendation

Adopt **Option A** (`CodeToolError` / `ModelToolError`, with `kind: "code_tool"` / `kind: "model_tool"`). The symmetric pair carries the partition in the name itself, eliminating the recurring lookup cost at every `match` site and removing the noun-class inconsistency between the two discriminators. "Code vs model" is also the partition users already think in — it matches how the spec introduces the two paths (the `<name>(args)` chapter vs the `@`-query chapter).

Watch for: the slash-invocation per-`kind` table currently lists `tool_failure` (`slash-invocation.md:24`); if Option A lands, that row's discriminator string changes too, and the message template ("loom `/<name>` returned `Err`: tool `<tool_name>` failed — `<message>`") should keep the human-facing word "failed" even though the type name no longer contains it. Coordinate this rename with the sibling finding that proposes `kind: "tool_call"` → `"tool_call_error"`; both touch the same discriminators and a single co-resolved edit is cleaner than two passes.

## Related Findings

- "`QueryError` union has three conflicting authoritative definitions" — co-resolve (the rename pass and the discriminator rename should land together; one edit hits the same lines)
- "`QueryError` example missing `ToolCallError`" — co-resolve (the `descriptions.md` example is rewritten in the same pass)
- "`QueryError` variants split across three files with no consolidated reference" — same-cluster (consolidation, if pursued, should use post-rename names)
- "`ValidationFailure` / `ValidationError` — \"failure\" and \"error\" at wrong nesting levels" — same-cluster (sibling naming finding in the same `QueryError` family; resolve in one naming pass for vocabulary consistency)
- "Terminology drift: \"callable set\" / \"tool set\" / \"tools\" for the same concept" — same-cluster (broader naming pass on tool-related vocabulary)

---

# No per-rule identifiers; spec rules are not individually addressable

**Source:** docs/reviews/spec-review/spec-20260504-144255.md
**Original heading:** No requirement identifiers anywhere in the spec; no acceptance criteria
**Kind:** traceability

## Finding

The spec carries no stable identifier on any of its obligations. Every "must"-style rule lives as prose, a bullet, or a bold-prefixed paragraph; nothing in `spec.md` or under `spec_topics/` ever names a rule (no `REQ-N`, `RULE-N`, `BIND-N`, `QRY-N`, etc.). A grep for `REQ-`, `RULE-`, `AC-` across the spec returns zero hits.

Compounding this, large portions of the spec use bold-prefixed paragraphs (`**Binder model.**`, `**Binder context.**`, `**Defaults.**`, `**Interpolation.**`, ...) where a `##`/`###` heading would be expected. `binder.md`, `query.md`, `schemas.md`, and `expressions.md` contain 12, 12, 8, and 10 such bold-prefix paragraphs respectively, and have either zero or one true sub-heading. GitHub renders bold paragraphs without anchors, so even file-internal cross-references (and the `coverage-matrix.md` `#fragment` links) cannot point below file granularity.

The downstream effect is concentrated at two seams. First, every leaf in `plan.md` carries a `Tests.` bullet defined in `plan_topics/conventions.md` as "one bullet per spec rule" — without rule IDs there is no mechanical way to confirm a leaf's tests exhaust the rules it claims to implement. Second, `plan_topics/coverage-matrix.md` maps spec sections (not rules) to closing leaves, and `V18o` is the gate that "asserts every executable spec rule has a closing leaf." With section-level mapping over multi-rule sections (binder.md alone has ~10 rules in one section), the V18o gate is a sincerity check, not an audit.

## Spec Documents

- `spec.md` — Appendix list (edited)
- `spec_topics/binder.md` — entire page; bold-paragraph promotion + per-rule IDs (edited)
- `spec_topics/query.md` — entire page; bold-paragraph promotion + per-rule IDs (edited)
- `spec_topics/schemas.md` — entire page; bold-paragraph promotion + per-rule IDs (edited)
- `spec_topics/expressions.md` — bold-paragraph promotion + per-rule IDs (edited)
- `spec_topics/frontmatter.md` — bold-paragraph promotion + per-rule IDs (edited)
- `spec_topics/lexical.md` — per-rule IDs (edited)
- `spec_topics/type-system.md` — per-rule IDs (edited)
- `spec_topics/schema-subset.md` — per-rule IDs (edited)
- `spec_topics/bindings.md` — per-rule IDs (edited)
- `spec_topics/control-flow.md` — per-rule IDs (edited)
- `spec_topics/errors-and-results.md` — per-rule IDs (edited)
- `spec_topics/return.md` — per-rule IDs (edited)
- `spec_topics/functions.md` — per-rule IDs (edited)
- `spec_topics/tool-calls.md` — per-rule IDs (edited)
- `spec_topics/invocation.md` — per-rule IDs (edited)
- `spec_topics/imports.md` — per-rule IDs (edited)
- `spec_topics/discovery.md` — per-rule IDs (edited)
- `spec_topics/slash-invocation.md` — per-rule IDs (edited)
- `spec_topics/cancellation.md` — per-rule IDs (edited)
- `spec_topics/diagnostics.md` — per-rule IDs (edited)
- `spec_topics/runtime-value-model.md` — per-rule IDs (edited)
- `spec_topics/pi-integration-contract.md` — per-rule IDs (edited)
- `spec_topics/implementation-notes.md` — per-rule IDs (edited)
- `spec_topics/descriptions.md` — per-rule IDs (edited)
- `spec_topics/overview.md` — read-only (anchor source for matrix)
- `spec_topics/influences.md` — read-only
- `spec_topics/comparison.md` — read-only
- `spec_topics/related-work.md` — read-only
- `spec_topics/future-considerations.md` — read-only
- `spec_topics/pi-integration.md` — read-only

## Plan Impact

**Phases:** Vertical V18

**Leaves (implementation order):**

- V18o — Per-call timeout marker / coverage-matrix closing gate — modified (acceptance criterion shifts from "every executable spec section is mapped" to "every REQ-ID is mapped")

Note: `plan_topics/conventions.md` ("Tests. — one bullet per spec rule") and `plan_topics/coverage-matrix.md` are also edited as plan-infrastructure files; neither is a leaf. Every leaf's `Tests.` bullets gain optional REQ-ID citations, but no leaf's behaviour or dependencies change — that is a mechanical pass, not a re-plan.

## Consequence

**Severity:** advisory

Implementation can proceed without IDs — the spec text is unambiguous enough that a careful implementer can hand-enumerate rules per leaf. What degrades is review and audit: the V18o coverage gate cannot be enforced mechanically, leaf reviewers cannot confirm "Tests cover every rule" by ID-diff, and any later spec amendment that adds or splits a rule has no stable handle for tracking which leaves must be revisited.

## Solution Space

**Shape:** multiple

### Option A — Heading promotion only

**Approach.** Promote every bold-prefixed paragraph in `binder.md`, `query.md`, `schemas.md`, `frontmatter.md`, and `expressions.md` (and similar pages) to a `##` or `###` sub-heading. Update `plan_topics/coverage-matrix.md` to use `#fragment` links pointing at the new sub-headings instead of file roots.
**Spec edits.** Mechanical structural rewrite of ~5–8 spec pages. No new prose. No identifier scheme.
**Pros.** Cheap. Restores GitHub anchor links. Improves navigability for human readers immediately.
**Cons.** Does not give rules individual handles — sub-headings still group multiple rules (e.g. the "Binder envelope" sub-heading still contains three envelope shapes). V18o gate remains a sincerity check.
**Risks.** None material. Anchor-link drift if heading text is later edited.

### Option B — Heading promotion + per-page REQ-ID prefixes

**Approach.** Do Option A, then assign each atomic obligation in each spec page a per-page identifier — `BIND-1`, `BIND-2`, ..., `QRY-1`, ..., `SCHM-1`, ... using the spec page's stem as the prefix. Inline IDs as `**BIND-7.**` at the start of the rule paragraph or as `<a id="bind-7"></a>` anchors. Rewrite `plan_topics/coverage-matrix.md` to map `REQ-ID → leaf`. Update `plan_topics/conventions.md`'s `Tests.` definition to "one bullet per REQ-ID; cite the ID." Each existing leaf's `Tests.` bullets gain REQ-ID citations as a single mechanical pass.
**Spec edits.** Option A's edits, plus an `<id>` annotation on every rule across all `spec_topics/` pages, plus rewrites of `coverage-matrix.md` and `conventions.md`, plus a one-pass annotation of every leaf's `Tests.` bullets.
**Pros.** V18o gate becomes mechanical: `comm -23 <(grep -roh 'BIND-[0-9]\+\|QRY-[0-9]\+\|...' spec_topics/) <(grep -roh 'BIND-[0-9]\+\|...' plan_topics/coverage-matrix.md)` is the gate, run in CI. Spec amendments get stable handles. Findings (including those in this very review file, e.g. "missing completeness cases in invocation") become citable.
**Cons.** Substantial one-time labour across ~20 spec pages plus every leaf in `plan_topics/`. Adds visual noise to the spec's reading flow. Rule-numbering becomes a maintenance concern — splitting `BIND-7` into `BIND-7a`/`BIND-7b` later is a churn source.
**Risks.** ID drift if the spec is edited without renumbering discipline; mitigated by treating IDs as immutable once assigned (split → new ID, never renumber). Initial enumeration pass requires editorial judgement on what counts as one rule vs. several.

### Option C — Option B + acceptance criteria per rule

**Approach.** Option B, then append a `**Verifiable by:** <test sketch>` line to each REQ-ID, naming the observable predicate that proves the rule.
**Spec edits.** Option B's edits, plus a `Verifiable by:` line on every rule.
**Pros.** Spec→test mapping is closed-form; reviewers can read a rule and the gate predicate side by side.
**Cons.** Couples the spec to test phrasing. Many `Verifiable by:` lines will end up paraphrasing the rule itself, producing make-work. Pushes the spec toward IEEE-830 ceremony out of proportion to a single-extension scope.
**Risks.** Verifiable-by lines and rule prose drift apart over time, becoming a second source of truth that contradicts the first.

### Recommendation

**Option B.** Per-rule IDs are the minimum that turns the V18o coverage gate from inspection into mechanical verification, and the same mechanism gives every other finding in this review a stable citation handle going forward. Pure heading promotion (Option A) leaves the gate sincere-but-unverifiable, and the cost gap to Option B is mostly one-time editorial labour rather than ongoing burden. Option C's per-rule acceptance criteria add ceremony without unlocking anything Option B doesn't already give: leaf `Tests.` bullets and the leaf's spec text are already close enough that a third surface adds drift risk, not clarity.

Edge cases for the implementer:

- Treat IDs as immutable. When a rule is split, the original ID retires and two new IDs appear; never renumber to fill holes.
- Pick the prefix from the spec page's filename stem at the moment of first numbering and freeze it (`binder.md` → `BIND`; `errors-and-results.md` → either `ERR` or `RES`, pick once and document in `spec.md`).
- Pages of pure narrative (`overview.md`, `influences.md`, `comparison.md`, `related-work.md`, `future-considerations.md`) carry no IDs — they have no obligations to track.
- The annotation pass on `plan_topics/*.md` leaves is editorial, not behaviour-changing; it does not require a new leaf and should ride in the same commit as the spec edits to avoid an interim period where rule IDs exist in the spec but not in the matrix.

## Related Findings

- "No diagnostic codes assigned to named parse errors" — same-cluster (a sibling traceability gap; both want stable, citable handles on spec-defined obligations, but diagnostic codes are surfaced at runtime while REQ-IDs are documentation-only — they resolve independently with parallel schemes)
- "No central glossary" — same-cluster (both are structural-hygiene gaps in spec organisation; resolved by separate edits)
- "Missing normative grammar appendix" — same-cluster (structural-hygiene; the grammar appendix would itself benefit from REQ-IDs but is otherwise independent)
- "Per-`kind` system-note table covers only 5 of 8 `QueryError` variants" — co-resolve (a concrete coverage gap that REQ-IDs would surface mechanically; once IDs exist, the missing three variants become discoverable as unmapped REQ-IDs in the matrix)
- "`QueryError` variants split across three files with no consolidated reference" — same-cluster (cross-file traceability gap; resolved by a consolidated reference, not by REQ-IDs, but the two together would close the audit loop on `QueryError`)

---

# Missing normative grammar appendix

**Source:** docs/reviews/spec-review/spec-20260504-144255.md
**Original heading:** Missing normative grammar appendix
**Kind:** implementability

## Finding

The spec describes the loom surface in prose, sample snippets, and per-page rule lists, but never commits to a normative grammar (BNF / EBNF / PEG). For most surfaces the prose is sufficient because each page enumerates the legal forms exhaustively. However, several specific productions fall through the cracks because no single page owns them, and the absence of a grammar means there is no fallback authority. Concretely:

- **Uninitialised `let`.** `bindings.md` and the V2a plan leaf both describe `let x = expr` "with optional `: T` annotation," but neither says whether `let x: T` (annotation, no initialiser) is legal. Rust permits it; TypeScript permits it; both spec pages are silent.
- **`schema X by <field>` for object schemas.** `schemas.md` introduces the explicit-discriminator form only against the `=` union shape (`schema Animal by species = Cat | Dog | Lizard`). It is unstated whether `schema X by f { ... }` parses, and if so, what it means.
- **`///` placement on `fn` and on alias schemas.** `descriptions.md` lists "above a `schema` declaration, an `enum` declaration, a field within a schema, or a variant within an `enum`." `fn` declarations are absent from that list. `schema X = T | U` aliases are also absent — the listed "schema declaration" arguably covers them, but the worked examples only show `///` above object schemas.
- **`for x in []`.** `control-flow.md` requires the iterand to have type `array<T>`. The expressions page says `[]` is the empty array whose element type is "inferred from context (binding annotation, parameter type, or surrounding constructor field)." A `for`-iterand is none of those — there is no documented sink that gives `T` a value, so the program is either rejected or accepted with an arbitrary `T`, and the spec does not say which.
- **`if` / `for` / `while` inside a `match`-arm body.** Arm bodies are "a single expression," with the explicit escape hatch of `{ ... }` block expressions for multiple statements. `if`/`for`/`while` are statements, not expressions (only the ternary is the expression form). It is therefore implied that they are illegal in an arm body unless wrapped in a block, but this is never stated; an implementer reading the arm-body rule alone could plausibly accept or reject either way.
- **Continuation across blank lines.** Lexical and grammar-disambiguation pages cover trailing/leading operators, open brackets, and trailing commas as continuation triggers. They do not say what happens when a continuation marker is followed by a blank line: does `let x =\n\n  foo` continue, or is the blank line a hard separator? Most languages diverge here; loom has no answer.

Each gap is small in isolation; together they are exactly the class of question implementers would resolve from a grammar appendix in any other language spec, and resolve inconsistently in its absence.

## Spec Documents

- `spec.md` — Appendix section (edited; new appendix entry added)
- `spec_topics/lexical.md` — Statement terminators (option-dependent; affected under Option B/C)
- `spec_topics/expressions.md` — Grammar disambiguation, Operator precedence (option-dependent)
- `spec_topics/bindings.md` — `let` form (option-dependent; affected under Option B/C)
- `spec_topics/control-flow.md` — `for ... in` (option-dependent)
- `spec_topics/errors-and-results.md` — Arm syntax (option-dependent)
- `spec_topics/schemas.md` — Discriminated unions, type-alias form (option-dependent)
- `spec_topics/descriptions.md` — Placement (option-dependent)
- `spec_topics/functions.md` — `fn` placement (option-dependent)

## Plan Impact

**Phases:** Horizontal, MVP, Vertical V1, Vertical V2, Vertical V4, Vertical V7, Vertical V8, Vertical V9, Vertical V11, Vertical V13

**Leaves (implementation order):**

- M — MVP body parser (modified — uninitialised `let` and continuation-across-blank-lines decisions feed back into the toolkit's grammar)
- V1e — Statement separators and newline continuation (modified — must enumerate blank-line behaviour after a continuation marker)
- V2a — `let` immutable bindings (modified — must specify whether `let x: T` without initialiser is legal, and what its initial state is if so)
- V4b — Object schema declaration and lowering (modified — `schema X by f { ... }` shape decision)
- V7a — `match` expression structure (modified — must explicitly state that arm bodies accept block expressions but not bare `if`/`for`/`while`)
- V8b — `for ... in` over arrays (modified — must specify behaviour when the iterand is `[]` with no type sink)
- V9a — Top-level `fn` declaration (modified — `///` admissibility on `fn`)
- V11d — Explicit `by <field>` form (modified — clarify whether the form applies only to `=` unions or also to object schemas)
- V13e — `///` doc comments on schema declarations and fields (modified — extend or restrict to cover alias schemas and `fn`)

## Consequence

**Severity:** correctness

Two reasonable implementers will diverge on every one of the listed forms — one will accept `let x: T` and produce a binding to a sentinel "unset" value, the other will reject it as a parse error; one will accept `///` on `fn` as documentation that lowers nowhere, the other will reject it; `for x in []` will compile to a no-op for one implementation and a parse error for the other. Authored looms that work on one implementation will fail on the other. Because the gaps are all in surface syntax, divergence shows up at parse time on the very first run.

## Solution Space

**Shape:** multiple

### Option A — Full normative grammar appendix

**Approach.** Add `spec_topics/grammar.md` containing the complete EBNF (or PEG) for `.loom` and `.warp` files, listed under the spec's Appendix section. The grammar is normative; per-topic-page prose remains as the user-facing description and cross-links into the grammar for the production it describes.

**Spec edits.** New `spec_topics/grammar.md`; new bullet under `spec.md` Appendix; cross-reference links from each topic page's syntax-introducing section back to the relevant production. No deletion of existing prose.

**Pros.**
- One canonical source for every production; no per-page silence on edge cases.
- Implementers writing a parser have a check-against artefact.
- Future surface additions (per-parameter `mut`, value-carrying `break`, guards, rest patterns) get a single place to land.

**Cons.**
- Largest authoring cost; ~200–400 lines of grammar plus the edits to keep prose aligned.
- Two sources of truth — prose and grammar — which must be kept in sync as the spec evolves.

**Risks.**
- Grammar drift over time if maintainers update prose without touching the appendix.

### Option B — Targeted grammar appendix

**Approach.** Add `spec_topics/grammar.md` covering only the disambiguation-critical productions: `let` (with and without initialiser, with and without annotation), the type grammar (since it is referenced by every annotation site), `match` arm bodies (showing the block-expression escape hatch), `schema X by <field>` (explicitly listing which schema shapes admit `by`), `///` placement (with the full list of legal anchor productions including `fn` if that is the resolution), and the newline-continuation table (with the blank-line case explicit). Other surfaces stay prose-only.

**Spec edits.** New `spec_topics/grammar.md` with ~6 production groups; new bullet under `spec.md` Appendix; minor wording adjustments in `bindings.md`, `control-flow.md`, `errors-and-results.md`, `schemas.md`, `descriptions.md`, and `functions.md` to link to the appropriate grammar entry rather than restate it.

**Pros.**
- Closes every named gap in this finding.
- Smaller authoring surface; lower drift risk than Option A.
- Establishes a place to add future productions when ambiguities surface.

**Cons.**
- Mixes prose and grammar as authority depending on the topic — readers must know which is which.
- Future ambiguities outside the listed productions still have nowhere to land except a new prose edit.

**Risks.**
- Choosing what counts as "disambiguation-critical" is itself a judgement call; the next reviewer may find more.

### Option C — Resolve each ambiguity inline; no appendix

**Approach.** Add explicit rules to the existing topic pages: `bindings.md` states whether `let x: T` is legal and what it means; `control-flow.md` states the `for x in []` rule; `errors-and-results.md` states that arm bodies are expressions only and links to block expressions; `schemas.md` states whether `by` applies to object schemas; `descriptions.md` extends or restricts its placement list; `lexical.md` adds the blank-line continuation rule.

**Spec edits.** ~1–3 sentences added to each of `bindings.md`, `control-flow.md`, `errors-and-results.md`, `schemas.md`, `descriptions.md`, `lexical.md`, and `functions.md`. No new file.

**Pros.**
- Smallest diff; zero new files.
- Each rule lives next to the prose that introduces the surface — readers of one topic see the answer without cross-referencing.
- No prose-vs-grammar dual authority.

**Cons.**
- No structural defence against the next set of ambiguities; each new gap requires a fresh per-page edit.
- Implementers building a parser still have no consolidated artefact to validate against.

**Risks.**
- The same kind of gap recurs the next time a new surface is added, because nothing in the process forces a grammar-level review.

### Recommendation

**Option B.** A targeted appendix closes every named gap with bounded authoring cost, and gives future ambiguities a natural home without requiring the full-language EBNF that Option A entails. Option C resolves the listed cases but leaves the underlying structural problem (no place for grammar-level rules to live) intact, and given the spec's current rate of evolution, more such cases will arise.

Edge cases the implementer must watch when writing the appendix:

- For `let x: T`: pick one of (a) reject as parse error, (b) accept as forward declaration with no value (illegal to read until assigned), (c) accept as a `let mut`-equivalent initialised to a type-specific default. Loom has no `undefined` value, so (b) requires a definite-assignment analysis the spec does not currently mandate; (a) is the lowest-cost choice consistent with the rest of the language.
- For `for x in []`: the iterand-with-no-type-sink case is not unique to `for` — it is the same hole as `let xs = []` without annotation. Whichever rule is picked should apply uniformly; resist the temptation to special-case `for`.
- For `///` on `fn`: if accepted, decide whether the description is purely human-facing or whether it lowers anywhere (it cannot lower into a JSON Schema, since `fn` has none). Purely human-facing is the simpler answer.
- For `schema X by f { ... }`: object schemas have only one variant by definition, so `by` is meaningless on them. Reject as parse error with the message "the `by` clause applies only to discriminated-union schemas (`schema X by f = A | B | …`)".
- For blank-line continuation: align with the existing rule's spirit — the parser continues across newlines only when it cannot otherwise close the statement. A blank line does not change that; if the previous line ended in a continuation marker, the statement continues regardless of how many blank lines intervene. State this explicitly.

## Related Findings

- "No requirement identifiers anywhere in the spec; no acceptance criteria" — same-cluster (both target the spec's lack of formal-document scaffolding; resolve independently)
- "No central glossary" — same-cluster (both add Appendix entries; same edit point in `spec.md` but independent content)
- "File encoding, newline normalisation, and path resolution unspecified" — same-cluster (another implementability gap that a grammar appendix would not cover; both speak to spec completeness rather than grammar per se)
- "Bare object literals in tool-call examples contradict `expressions.md`" — decision-dependency (a normative grammar would force the tool-call examples to align with the documented expression grammar, surfacing this contradiction automatically)
- "`params:` default expression grammar boundary cases" — same-cluster (another grammar-edge-case finding; would be partially absorbed by Option A but not by Option B)

