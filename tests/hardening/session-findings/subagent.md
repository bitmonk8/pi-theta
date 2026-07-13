# Session-semantics hardening — lens: SUBAGENT MODE end-to-end

Probe file: `tests/hardening/session-subagent.test.ts` (6 probes, all green; 3
live model turns, 3 zero-token). Live model: the harness-resolved provider model.
Each live drive retries once on a transport/429 (not counted as a finding).

Scope: a `mode: subagent` loom's runtime behaviour on the **direct slash-dispatch**
surface (no invoke parent) — the surface the sibling `session-crossmode` file does
NOT cover (it drives subagent looms only through `invoke(...)`). Note: the shipped
runtime routes BOTH a direct slash dispatch and an `invoke(...)`-reached subagent
callee through the same `spawnSubagentConversation` method
(`src/extension/production-loom-producer.ts:560`), so the two spawn-time findings
below (SUBAG-1, SUBAG-2) reproduce identically on either entry point; the
invoke-wrapper repro is used only because a direct slash dispatch does not surface
the subagent's return value (SLSH-1/null-policy, itself confirmed conformant).

Dedupe: not in `tests/hardening/SUMMARY.md`, `tests/hardening/cli-findings/SUMMARY.md`,
or the per-lens `findings/` docs. INV-9 (prompt→prompt attachment) and the
prompt-mode tool findings QTL-2/QTL-4 are distinct code paths; the subagent
`spawnSubagentConversation` spawn is untouched by those and is the subject here.

## Summary

| id | verdict | one-line |
|---|---|---|
| SUBAG-1 | bug (FIXED) | `system:` frontmatter is never injected into the spawned subagent conversation — the model does not receive it |
| SUBAG-2 | bug (FIXED) | a subagent's `tools:` callable set is never installed — `customTools: []` is hardcoded, so the subagent model has no tools |
| SUBAG-3 | bug (FIXED) | a top-level `Err` at the slash-dispatch boundary (SLSH-3) emits NO system note — a directly-slash-invoked subagent (or prompt) loom fails silently |

Bug-verdict count: **3** (all FIXED).

---

## SUBAG-1 — FIXED — `system:` frontmatter is not injected into the spawned subagent conversation

> **STATUS: FIXED.**
> - **Before:** `/sysparent` (prompt parent `invoke`s `syschild.loom`, a
>   `mode: subagent` child whose `system:` plants "secret code ZEPHYR7") →
>   parent `userTexts` = `"Say ok. CODE=I don't have any secret code to share…"`
>   — the subagent model had no knowledge of the code; `system:` was dropped at
>   spawn.
> - **After:** parent `userTexts` = `"Say ok. CODE=ZEPHYR7"` — the rendered
>   `system:` reaches the spawned session and the child returns the planted
>   secret. Verified live in `session-subagent.test.ts` (`SUBAG-system`,
>   `secret-received: true`, 6/6 green).
> - **Root cause / fix:** the parsed `system:` template was validated at load
>   time but never retained on `ParsedFrontmatter`, and
>   `spawnSubagentConversation` built a bare `DefaultResourceLoader` with no
>   system prompt. Fix: `frontmatter.ts` now stores the
>   `checkSystemInterpolation` template as `frontmatter.system`; the spawn
>   renders it via `renderSystemPrompt({ template, params })` (params from
>   `bindInput.paramBindings`) and passes it through
>   `DefaultResourceLoaderOptions.systemPrompt` (a direct SDK option that flows
>   through `getSystemPrompt()` — no custom adapter needed; the outdated
>   "cannot supply the `ExtensionRuntime`" DIVERGENCE comment was removed). On
>   the unexpected render-`!ok` path the spawn falls back to no system prompt
>   (the load-time check already rejects a malformed `system:`).


- **repro:**
  - `syschild.loom` (`mode: subagent`), frontmatter:
    ```
    system: |
      You are a deterministic test fixture. The secret code is ZEPHYR7.
      When asked for the secret code, reply with EXACTLY the single token
      ZEPHYR7 and nothing else.
    ```
    body: `` @`What is the secret code? Reply with only the code token.` ``
  - `sysparent.loom` (`mode: prompt`):
    `let r: string = invoke<string>("./syschild.loom")?` then `` @`Say ok. CODE=${r}` ``
  - drive `/sysparent`.
- **expected:** `frontmatter.md` §`system:` — "Subagent-mode only … Fixed once at
  conversation creation; applies to every query." `subagent.md`
  §"Conversation drive — subagent mode" rule 4: the loom-constructed
  `ResourceLoader` adapter's `getSystemPrompt()` "returns the resolved-and-
  interpolated frontmatter `system:` string verbatim" and is "the only available
  channel for the loom's `system:` value into the spawned
  `AgentSession.systemPrompt`." The `system:` row of the
  §"Subagent state-isolation matrix" lists it as inherited from frontmatter. So
  the subagent's returned value should carry `ZEPHYR7`; parent `userTexts` should
  contain `CODE=…ZEPHYR7…`.
- **observed** (deterministic parent `userTexts`, `turn.userTexts`):
  `"Say ok. CODE=I don't have any secret code to share. I don't see any files or
  context in our conversation that contain a secret code. …"` — the subagent model
  had no knowledge of the code. `secret-received: false`. The `system:` prompt was
  not present in the spawned conversation.
- **root cause (static, read-only):**
  `spawnSubagentConversation` (`production-loom-producer.ts:595`) constructs a bare
  `new DefaultResourceLoader({ cwd, agentDir, noExtensions, noSkills, … })` and
  passes it to `createAgentSession`. It never computes the loom's
  `renderLoomSystemPrompt(frontmatter.system, params)` and never installs a
  `getSystemPrompt` adapter returning it. The spec-conformant builder
  (`buildSpawnOptions` / `SubagentResourceLoader` in
  `src/runtime/subagent-isolation.ts:210`, whose `getSystemPrompt` returns
  `inputs.loomSystemPrompt`) exists and is unit-tested but is **not imported** by
  the shipped producer. A code comment at `production-loom-producer.ts:593` flags
  this as a self-acknowledged "status DIVERGENCE" ("the hand-built adapter the spec
  sketches cannot supply the `ExtensionRuntime` that `LoadExtensionsResult.runtime`
  requires").
- **verdict: bug.** The spec makes `system:` a normative, load-bearing subagent
  feature (the ONLY delivery channel for the subagent's system prompt); the shipped
  spawn silently drops it. A user authoring a subagent loom with `system:` gets a
  conversation running under the model's training defaults instead. The
  DIVERGENCE comment documents *that* the shipped composition is reduced, but the
  spec/docs mandate the opposite behaviour and no user-facing doc calls this
  omission intended — the dominant "implemented-in-an-isolated-module,
  never-wired-into-the-shipped-composition" defect class.

## SUBAG-2 — FIXED — a subagent's `tools:` callable set is not installed (`customTools: []` hardcoded)

> **STATUS: FIXED.**
> - **Before:** `/toolsparent` (prompt parent `invoke`s `toolschild.loom`, a
>   `mode: subagent` child declaring `tools: read` asked to read
>   `secret-doc.txt`) → parent `userTexts` = `"Say ok. DOC=I don't have
>   file-reading tools available…"` — the subagent model was offered no tools.
> - **After:** parent `userTexts` = `"Say ok. DOC=\nTOOLMARKER931"` — the
>   subagent reads the planted file via its own `read` tool and returns the
>   marker. Verified live in `session-subagent.test.ts` (`SUBAG-tools`,
>   `marker-present: true`, 6/6 green).
> - **Root cause / fix:** the spawn passed literal `tools: []` /
>   `customTools: []` to `createAgentSession`. Fix: for each underlying Pi-tool
>   name in the loom's callable set (`callableSetPiToolNames(loom)`) the spawn
>   lowers the name to its full pi `ToolDefinition` via a new DI hook
>   `resolvePiToolDefinition(name, cwd)` on `ProductionProducerInput` (wired at
>   the composition root from `builtinToolDefinition`), and passes
>   `customTools: [those definitions]` + `tools: [those names]` (subagent.md
>   rules 1–3). Scope: Pi-tool callable-set entries (the common
>   `tools: read, grep` case) are installed. A `.loom`-callable entry in a
>   subagent's callable set (model-callable `.loom`) is now ALSO WIRED: the
>   spawn resolves each `.loom` callee (the same `parseCallee` seam `#driveCallee`
>   uses), presents it in BOTH the loom-owned `complete()` loop tool schemas AND
>   as a `defineTool` `customTool` (+ `tools` allowlist) on `createAgentSession`,
>   and `executeSubagentTool` → `lowerModelDrivenLoomCall` maps the model's
>   object args → positional `argValues` in `params:` declaration order and
>   drives the callee through the SAME `#driveCallee` a code-driven `invoke(...)`
>   uses (inheriting depth ceiling #1, containment re-check, ceiling-#4 depth,
>   CANCEL, the B1 registry entry, PIC-9 teardown, FN-5). A pre-eval setup-throw
>   → clean `isError` tool-result + one `loom/runtime/internal-error` diagnostic
>   + one `loom-system-note` (tool-calls.md:30). Verified by
>   `tests/subagent-model-loom-tool.test.ts` (seam) +
>   `tests/hardening/session-subagent-loom-tool.test.ts` (live probe — the live
>   model emits the `tool_use` and the child sentinel surfaces end-to-end).


- **repro:**
  - planted file `secret-doc.txt` (rel to cwd): `The document marker is TOOLMARKER931.`
  - `toolschild.loom` (`mode: subagent`, `tools: read`):
    `` @`Read the file secret-doc.txt and reply with EXACTLY the marker token it contains and nothing else.` ``
  - `toolsparent.loom` (`mode: prompt`, no `tools:`):
    `let r: string = invoke<string>("./toolschild.loom")?` then `` @`Say ok. DOC=${r}` ``
  - drive `/toolsparent`.
- **expected:** `subagent.md` §"Conversation drive — subagent mode" rule 1:
  `customTools` "carries every `ToolDefinition` the subagent may use — both Pi
  built-ins … and `defineTool`-wrapped `.loom` callables"; rule 2: `tools` is the
  explicit allowlist of those same names. §"Subagent state-isolation matrix" lists
  the "lowered `customTools` set (the loom's *callable set*)" as inherited from
  frontmatter. `invocation.md` §"Tools and model": "The child uses *its own*
  frontmatter `model`, `tools`, and `system`." So the subagent should be able to
  call `read`; its returned value should contain `TOOLMARKER931`.
- **observed** (parent `userTexts`): `"Say ok. DOC=I don't have file-reading tools
  available in this session, so I can't open secret-doc.txt. …"` —
  `marker-present: false`, reproduced on two independent runs. The subagent model
  was offered no tools despite `tools: read`.
- **root cause (static):** `spawnSubagentConversation`
  (`production-loom-producer.ts:611–614`) passes literal `tools: []` and
  `customTools: []` to `createAgentSession`, with the comment "the test loom
  carries no callables." The loom's resolved callable set (the load-time
  §"Resolution snapshot") is never lowered into `customTools`. Same unwired-builder
  root cause as SUBAG-1 (`buildSpawnOptions.customTools` is the correct channel and
  is unused).
- **verdict: bug.** Distinct from the prompt-mode tool findings QTL-2/QTL-4 (which
  concern `pi.setActiveTools` on the user session) — this is the subagent
  `createAgentSession` `customTools` path. A subagent loom's declared `tools:` are
  a no-op; the model can never make a tool call. Not called out as intended in any
  user-facing doc.

## SUBAG-3 — FIXED — top-level `Err` at the slash-dispatch boundary (SLSH-3) emits no system note

> **STATUS: FIXED.**
> - **Before:** `/errsub` (direct `mode: subagent`, empty-template `?`) →
>   `turn.systemNotes === []`, `turn.error === undefined` — the subagent failed
>   silently; the boundary note (the only user-facing surface) was absent.
> - **After:** the user session's `loom-system-note` channel carries exactly
>   `loom /errsub returned Err: rendered query template was empty — no provider
>   turn was issued` (em-dash U+2014). Verified live in
>   `session-subagent.test.ts` (`SUBAG-slsh3`, 6/6 green).
> - **Root cause / fix:** shared with SNOTE-1 (`session-findings/systemnotes.md`).
>   The prompt/subagent `surface` now returns the real terminal `Err`, and
>   `composeLoomFixture.run` routes an unhandled top-level `Err` to the new
>   `emitTopLevelErrNote` hook (renders `renderTopLevelErrNote` via
>   `pi.sendMessage`). SLSH-5 chain suffix deferred (`chain: []`).

- **repro:** `errsub.loom` (`mode: subagent`), body: `` @` `? `` (a whitespace-only
  template propagated with `?` — the empty-template short-circuit yields
  `Err(validation, cause="empty_template")` with **zero** provider turns). Drive
  `/errsub` directly.
- **expected:** `slash-invocation.md` SLSH-3: "When a loom dispatched directly by a
  slash command — one with a slash caller and no invoke parent — terminates by
  returning `Err(QueryError)` to that boundary, Pi appends a one-line system note
  to the user's session formatted from the error, regardless of whether the loom
  ran in prompt or subagent mode." "For a directly-slash-invoked subagent-mode loom
  this note is the only user-facing surface for the failure." The SNK-b row
  (`validation`/`empty_template`) is the normative template:
  `loom /errsub returned Err: rendered query template was empty — no provider turn
  was issued` (SLSH-4: renderers MUST emit the template verbatim). So the parent
  session's `loom-system-note` channel should carry that exact line.
- **observed** (`turn.systemNotes`, read off the user/parent SessionManager — the
  same channel that surfaces the SLSH-1 overflow note): `[]` — empty. No boundary
  note of any kind. `expected-note … present: false`. `turn.error: undefined`
  (the drive did not throw; the loom simply returned `Err` and the boundary
  swallowed it).
- **root cause (static):** the SLSH-3/SLSH-4/SLSH-5 renderer
  `renderTopLevelErrNote` (`src/runtime/err-note-render.ts:175`) and the
  `topLevelCascade: true` branch of `emitRuntimeEvent`
  (`src/runtime/runtime-event-channel.ts`) exist and are unit-tested, but neither
  is called from the shipped dispatch path. The composed `run`
  (`src/extension/loom-composition-producer.ts:196–216`) computes the terminal
  `ResultValue` via `binding.surface(execution)` and then **discards** it — there
  is no consumer that inspects the top-level `Err` and emits the boundary note.
  A repo-wide grep confirms `renderTopLevelErrNote` has no caller outside its own
  test, and the only `emitRuntimeEvent` callers pass `topLevelCascade: false`
  (`query-discard.ts`, `display: false`).
- **verdict: bug.** A user who directly slash-invokes a subagent (or prompt) loom
  that fails at the top level sees nothing at all — no error text, no note — an
  entirely silent failure. The empty-template repro is deterministic and
  zero-token; the same unwired path governs every SNK-a…SNK-k kind. Not documented
  as intended; the spec makes the note mandatory ("this note is the only
  user-facing surface for the failure").

---

## Verified-conformant (bounds the search)

- **`system:` load-time diagnostics work.** `system:` on a `mode: prompt` loom →
  `'system:' is not permitted on a mode: prompt loom` (error), loom not registered;
  `system:` interpolating an unknown param → `'system:' interpolation references
  unknown param 'nope'` (error), loom not registered; a valid subagent `system:`
  with `${param}` interpolation registers. (`SUBAG-reg`, `diagnostics` +
  `registeredNames`, 0 tokens.) Only the *runtime injection* of a validly-parsed
  `system:` is broken (SUBAG-1).
- **Success-side null-policy holds (SLSH-1 / runtime-event-channel).** A
  directly-slash-invoked subagent loom terminating with `Ok("SUBAGENT-RETURN-
  VALUE-42")` emits NO `loom-system-note` keyed on the outcome, and the value
  reaches neither the parent `userTexts`, the parent `assistantText`, nor the
  systemNotes channel. (`SUBAG-ok`, all three channels empty, 0 tokens.)
- **SLSH-2 subagent isolation holds.** A directly-slash-invoked subagent loom
  running a real query (`Reply with exactly: LEAKSENTINEL777`) leaks nothing to the
  ancestor transcript: the parent session's `userTexts` and `assistantText` are
  both empty and contain no trace of the sentinel — the subagent's turn drives the
  private in-memory session only. (`SUBAG-slsh2`, 1 live turn.)
- **Subagent registration + spawn + value propagation.** Subagent looms register
  and spawn without diagnostics; the invoke-wrapper drives confirm the subagent
  body runs and its final value crosses the boundary as the `Ok` payload (the
  parent's `CODE=…`/`DOC=…` query interpolates whatever the subagent returned) —
  the propagation surface itself works; only `system:`/`tools:` content is dropped.
