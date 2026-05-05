# V14 — Tool calls and discovery

## V14a — `tools:` parsing (Pi tool names, comma form)

- **Spec.** [Parameters and Frontmatter](../spec_topics/frontmatter.md) (`tools:`).
- **Adds.** `tools: read, grep, bash` short form; resolution against Pi tool registry at load time.
- **Tests.** Each known tool resolves; unknown tool name → `loom/load/unknown-tool` error.
- **Deps.** V3a.
- **Ships when.** Pi tools listable in frontmatter.

## V14b — `tools:` YAML list form with `as` rename

- **Spec.** [Parameters and Frontmatter](../spec_topics/frontmatter.md) (`tools:`).
- **Adds.** YAML list form; `tool as alias` renames; alias must be lowercase-first identifier-shaped; collision with another entry's final name is load error.
- **Tests.** List form parses; rename works; PascalCase alias rejected; collision diagnostics name both entries.
- **Deps.** V14a.
- **Ships when.** Renaming works.

## V14c — Bare `<name>(args)` call from loom code

- **Spec.** [Tool Calls](../spec_topics/tool-calls.md), [Expression Sublanguage — Object construction](../spec_topics/expressions.md), [Grammar Appendix — Loom literal sublanguage](../spec_topics/grammar.md#loom-literal-sublanguage), [Pi Integration Contract — Tool execution from loom code](../spec_topics/pi-integration-contract.md), [Invocation — Static resolution](../spec_topics/invocation.md#static-resolution).
- **Adds.** Resolves post-rename name against `tools:` table. For registered loom callees, argument type-checking and return-type inference at the call site use the callee's parsed form from the per-load-pass static-resolution cache (populated for `tools:` entries by V15e); type mismatches surface as `loom/parse/tool-arg-type-mismatch` when statically resolvable, otherwise the runtime AJV check is the safety net. When the callee resolves to a Pi tool, the call admits a single bare-object argument written in the Loom literal sublanguage (the second documented carve-out to the bare-object-literal prohibition; same sublanguage as `params:` defaults). Multi-argument forms (`read({...}, {...})`) are `loom/parse/tool-arg-arity`; non-Pi-tool callees with bare-object arguments remain `loom/parse/bare-object-literal`. Forms outside the literal sublanguage inside the bare-object literal (operators, function calls, `let`-bound identifier references, `${...}`) are `loom/parse/tool-arg-not-literal`. Pi tool's `execute()` invoked directly with `toolCallId` prefixed `loom-direct:`. The `ctx` argument is the live `ExtensionContext` the runtime already holds, with `signal` overridden to `loomAbort.signal`, `sessionManager` overridden to the loom's current session, and `abort()` wrapped to call `loomAbort.abort()`; all other members forward unchanged.
- **Tests.** Call returns `Result<string, QueryError>`; arguments lowered to JSON with wire names; AJV validates against Pi tool's input schema; bare-object literal accepted in single-arg position for Pi-tool callees; bare-object literal in single-arg position for `let`-bound or registered-loom callees emits `loom/parse/bare-object-literal`; multi-arg form (`read({...}, {...})`) emits `loom/parse/tool-arg-arity`; each forbidden form inside the literal (operator, call, `let`-bound reference, `${...}`) emits `loom/parse/tool-arg-not-literal` naming the offending sub-expression; `ctx.signal === loomAbort.signal` (never `undefined`); `ctx.sessionManager` matches the loom's current session in both prompt mode and subagent mode; `ctx.abort()` aborts the loom's invocation and not the parent's turn; `ctx.model`, `ctx.modelRegistry`, `ctx.cwd` forward to the live host.
- **Deps.** V14a, V13c (outbound translation), V16a (literal sublanguage parser).
- **Ships when.** Loom code can call Pi tools with bare-object arguments parsed by the Loom literal sublanguage.

## V14d — Tool calls do not add a turn to conversation

- **Spec.** [Tool Calls](../spec_topics/tool-calls.md) (no conversation turn).
- **Adds.** Code-side tool call bypasses model entirely; transcript unchanged.
- **Tests.** Conversation transcript before and after `<name>()` call is identical (modulo any other queries).
- **Deps.** V14c.
- **Ships when.** Behavioural distinction from queries verified.

## V14e — Pi tool wired into `@` queries as model-callable

- **Spec.** [Parameters and Frontmatter](../spec_topics/frontmatter.md) (`tools:`), [Pi Integration Contract — Tool-registration lifetime and visibility](../spec_topics/pi-integration-contract.md), [Implementation Notes — Runtime](../spec_topics/implementation-notes.md#runtime).
- **Adds.** Same `tools:` set presented to model during query tool-call loop. Wiring is per calling-loom mode: subagent mode passes loom callees through `customTools` on `createAgentSession` plus an explicit `tools` allowlist; prompt mode registers loom callees once per unique lowered-schema hash via the registration cache and gates visibility per-query via `pi.setActiveTools` snapshot/restore in a `finally` block.
- **Tests.** Model issuing tool-use against a registered tool runs correctly; tool absent from `tools:` is unavailable to model; subagent-mode invocation triggers zero `pi.registerTool` calls and zero `pi.setActiveTools` calls on the user session; prompt-mode invocation triggers exactly one `pi.registerTool` call per unique lowered-schema hash across the extension's lifetime (second invocation with the same shape reuses the cached registration); prompt-mode active-set restoration fires on every exit path (success, `Err`, panic, cancellation); concurrent prompt-mode invocations against the same session serialise their snapshot/restore correctly (sequential per Pi's per-session turn ordering); `defineTool(...)` for a loom callee parsed from `summarise.loom` produces `label: "Summarise"`, for `code-review.loom` produces `label: "Code-Review"` — the basename rule is hyphens-preserved, leading-character-upper-cased and is independent of any `as` rename applied to `tools:` entries (the `as` rename affects the post-rename `name`, not the file-identity-tracking `label`); the constructed `ToolDefinition.parameters` is `Type.Unsafe<unknown>(loweredJsonSchema)` — a TypeBox `TSchema` whose underlying JSON Schema strict-equals the lowering output, not the raw JSON Schema object — with `Type.Unsafe` imported from the `typebox` peer dependency declared in `package.json`; `ToolDefinition.execute` AJV-validates `params` against the original lowered JSON Schema before forwarding to the subagent spawn / `invoke<T>(...)` adapter, reusing the V4a validator-cache key (lowered-schema content hash) so it does not recompile per call, and a synthesised malformed-`params` call (bypassing Pi's lowering, e.g. via a direct `customTools[i].execute(badParams, ctx)` invocation in a test) returns the spec's validation error path rather than throwing or silently forwarding.
- **Deps.** V14a, V5e.
- **Ships when.** Same set serves both code and model.

## V14r — `ModelToolError` variant: model-loop tool-call failure

- **Spec.** [Errors and Results — `ModelToolError`](../spec_topics/errors-and-results.md), [Query — Typed queries are tool-loop-shaped](../spec_topics/query.md), [Query — Non-validation failures during coercion](../spec_topics/query.md), [Pi Integration Contract — Always-log set](../spec_topics/pi-integration-contract.md).
- **Adds.** Schema name `ModelToolError`; wire `kind: "model_tool"` with fields `message`, `tool_name` (post-rename, as seen in `tools:`), `tool_call_id` (the id Pi's tool-loop machinery issued for the failing tool-use block), `raw_response: string | null` (any model-emitted text alongside the failing tool call). Detected when a tool the model invoked inside a query's tool-call loop fails — i.e. the tool's `execute()` threw or returned `isError: true`, AJV rejected the model-supplied arguments, an `AbortSignal` fired mid-call, or Pi reports a tool-host error. Applies to untyped queries (V5e tool loop), the free phase of typed queries (V6i), and the free phase of any coercion follow-up (V13g–V13j); `CodeToolError` is reserved for tools loom code invoked directly via `<name>(args)`. The variant is added to the `QueryError` runtime union declared by V5g; existing V5g variants are not touched.
- **Tests.** Schema construction round-trips through the `QueryError` union; each detection path surfaces as `ModelToolError` and not as some other variant — execute-throws, execute-returns-isError, AJV-rejects-model-args, cancellation-during-tool; `tool_name` carries the post-rename name; `tool_call_id` matches the id Pi issued for the failing tool-use block (not the loom-direct prefix that V14c uses); `raw_response` carries the model's pre-failure text when present and is `null` when none was emitted; failure during a typed query's free-phase turn surfaces as `ModelToolError` (not `CodeToolError`); failure during a coercion follow-up's own tool loop propagates as `ModelToolError`, terminates coercion, and does not consume an `attempts` slot per the spec rule.
- **Deps.** V5g, V14e, V13g.
- **Ships when.** Model-loop tool failures surface uniformly through `QueryError` with the spec's full payload shape.

## V14f — `CodeToolError` variant: `validation` cause

- **Spec.** [Tool Calls](../spec_topics/tool-calls.md) (failures).
- **Adds.** Code-side call with bad arguments → `Err(CodeToolError{cause:"validation"})` (wire `kind: "code_tool"`).
- **Tests.** Bad args rejected before tool runs; `validation_errors` populated. Cross-linked from V18q — a `code_tool` `Err` (regardless of `cause`) emits exactly one runtime event at the originating site (`display: false` when handled / discarded / `?`-propagated; `display: true` when it cascades to the slash boundary).
- **Deps.** V14c.
- **Ships when.** Bad-args case has clean error.

## V14g — `CodeToolError` variant: `execution` cause

- **Spec.** [Tool Calls](../spec_topics/tool-calls.md) (failures).
- **Adds.** Tool's `execute()` throws or returns `isError:true` → `Err(CodeToolError{cause:"execution"})` (wire `kind: "code_tool"`).
- **Tests.** Both shapes; message preserved. Cross-linked from V18q — a `code_tool` `Err` (regardless of `cause`) emits exactly one runtime event at the originating site.
- **Deps.** V14c.
- **Ships when.** Tool-execution failures surface uniformly.

## V14h — `CodeToolError` variant: `cancelled` cause

- **Spec.** [Tool Calls](../spec_topics/tool-calls.md) (failures), [Cancellation](../spec_topics/cancellation.md).
- **Adds.** AbortSignal mid-call → `Err(CodeToolError{cause:"cancelled"})` (wire `kind: "code_tool"`).
- **Tests.** Pre-flight abort and mid-flight abort both surface. Cross-linked from V18q — a `code_tool` `Err` (with `cause: "cancelled"`) emits exactly one runtime event at the originating site (the kind is `code_tool`, which is in the always-log set; this is distinct from the excluded `cancelled` kind).
- **Deps.** V14c.
- **Ships when.** Cancellation through tool calls works.

## V14i — `CodeToolError` variant: `unknown_tool` cause

- **Spec.** [Tool Calls](../spec_topics/tool-calls.md) (failures).
- **Adds.** Safety net for tools unregistered between parse and runtime (should not occur after a clean parse; production rarely hits this).
- **Tests.** Synthetic unregister between parse and runtime triggers the variant. Cross-linked from V18q — a `code_tool` `Err` (regardless of `cause`) emits exactly one runtime event at the originating site.
- **Deps.** V14c.
- **Ships when.** Safety net verified.

## V14j — `tools: []` ≡ absent `tools:`

- **Spec.** [Parameters and Frontmatter](../spec_topics/frontmatter.md) (`tools:`), [Pi Integration Contract — Tool-registration lifetime and visibility](../spec_topics/pi-integration-contract.md).
- **Adds.** Both produce empty callable set; ambient Pi tools NOT inherited. The no-inheritance invariant is enforced mechanically by the per-mode wiring rule: subagent mode passes `tools: []` as the explicit allowlist on `createAgentSession`; prompt mode's snapshot/restore swaps in `[...snapshot]` (with no loom-callable additions) for the loom's turns and restores on exit.
- **Tests.** Both shapes; model has no tools available; loom code has no `<name>(...)` callables; subagent-mode invocation with `tools: []` shows Pi's default built-in `read` / `bash` / `edit` / `write` are NOT in the spawned session's active set; prompt-mode invocation with `tools: []` shows the user session's prior active set is unchanged after restoration (snapshot equality).
- **Deps.** V14a.
- **Ships when.** Tool-inheritance footgun closed.

## V14k — Discovery: global `~/.pi/agent/looms/`

- **Spec.** [Directory Convention](../spec_topics/discovery.md).
- **Adds.** Already in M; this leaf hardens with manifest of every spec rule (non-recursive, `*.loom` only, `.warp` excluded).
- **Tests.** Recursive subdirs not discovered; non-`.loom` ignored; `.warp` not registered as command.
- **Deps.** M.
- **Ships when.** Global discovery rule-complete.

## V14l — Discovery: project `.pi/looms/`

- **Spec.** [Directory Convention](../spec_topics/discovery.md).
- **Adds.** Already in M; harden as V14k.
- **Tests.** As V14k for project root.
- **Deps.** M.
- **Ships when.** Project discovery rule-complete.

## V14m — Discovery: package `looms/` and `pi.looms`

- **Spec.** [Directory Convention](../spec_topics/discovery.md), [Discovery — Slash-name collisions at the same priority](../spec_topics/discovery.md).
- **Adds.** Walk `node_modules/*/package.json` for `pi.looms` entries; also discover `looms/` directories shipped by packages. Two packages whose `pi.looms` (or conventional `looms/` directory) derive the same final slash name are caught by the same-priority collision rule (V14q).
- **Tests.** `pi.looms` array honoured; `looms/` directory honoured; both can coexist; precedence per spec; two packages each shipping `lint.loom` → `loom/load/cross-format-collision` listing all colliding paths and neither registers; three packages each shipping the same name produces a single error listing all three paths.
- **Deps.** V14k, V14q.
- **Ships when.** Package-shipped looms discoverable and same-name package collisions are caught.

## V14n — Discovery: settings file reads (`looms` array, plus the read mechanism reused by V16e for binder model)

- **Spec.** [Directory Convention](../spec_topics/discovery.md) (Settings file reads).
- **Adds.** Settings reader for `~/.pi/agent/settings.json` and `.pi/settings.json` via the injected `FileSystem` seam (Pi exposes no settings accessor for extensions). Project-over-global precedence with deep-merge for nested objects, replace for arrays and scalars. `looms` array (`string[]` of file or directory paths, with glob patterns and `!`/`+`/`-` prefixes per Pi's resource-array convention; entries resolved relative to the settings file's base directory, `~` expanded, absolute paths supported) is the V1 consumer; the same reader is reused by V16e for `looms.binderModel`. Settings reads are cached for the extension lifetime; cache invalidation on file change is the responsibility of V18r (V14n exposes an `invalidate()` seam that V18r calls after a debounced settings-file change).
- **Tests.** File entry registers one loom; directory entry registers all `*.loom` in the directory non-recursively (subdirectories not walked, `.warp` files ignored); glob entry matches multiple files; `!pattern` excludes; `+path`/`-path` force-include/exclude an exact path; `~` expands; relative paths resolve against the settings file's base directory; non-`.loom` file entry (or non-`.loom` glob match) emits `loom/load/invalid-extension` and does not register; non-string entry emits `loom/load/settings-invalid-entry` and other entries still process; entries that resolve to the same absolute path are deduplicated silently (not flagged as collision); two settings entries that resolve to **different** absolute paths whose stems derive the same slash name → `loom/load/cross-format-collision` and neither registers (per V14q); project `looms` array fully replaces global `looms` array (replace, not concat); project values deep-merge over global values for nested objects; missing file treated as `{}` with a single load-time diagnostic; malformed JSON file treated as `{}` with a single load-time diagnostic and the other file still consulted.
- **Deps.** V14k, H2.
- **Ships when.** Settings-driven discovery works.

## V14o — Discovery: `--loom` CLI flag

- **Spec.** [Directory Convention](../spec_topics/discovery.md), [Pi Integration Contract — Extension entry point](../spec_topics/pi-integration-contract.md).
- **Adds.** Single `--loom` flag registered via `pi.registerFlag('loom', { type: 'string', description: '…' })` in the extension factory **before** subscribing to `resources_discover`; the flag's value is read with `pi.getFlag('loom')` and split on Node's `path.delimiter` (`:` POSIX, `;` Windows). Each split component is a file or directory resolved with the same rules as settings `looms` entries (V14n).
- **Tests.** `--loom a.loom` registers one loom; `--loom "a.loom:b.loom"` (POSIX) and `--loom "a.loom;b.loom"` (Windows) register two looms; CLI overrides settings; non-`.loom` component → `loom/load/invalid-extension`; missing component → `loom/load/missing-source` error (per the per-source severity table); a directory component contributes its non-recursive `*.loom` children; two components whose stems hyphen-normalise to the same slash name (e.g. `code-review.loom` and `code_review.loom`) → `loom/load/cross-format-collision` and neither registers (per V14q). The flag is registered exactly once and `pi.getFlag('loom')` returns a single string (no array surface from Pi's SDK).
- **Deps.** V14k.
- **Ships when.** CLI flag accepts multiple paths via the OS path-list separator and resolves them through the shared file-or-directory rule.

## V14p — Source priority and shadowing warning

- **Spec.** [Directory Convention — Source priority](../spec_topics/discovery.md).
- **Adds.** Five-level priority from spec; cross-priority name collision (higher priority wins) emits `loom/load/cross-source-shadow` warning and registers the higher-priority entry. Same-priority collisions are governed by V14q (uniform load-time error; neither registers).
- **Tests.** Each adjacent priority pair tested for the cross-priority shadow case; warning text matches spec.
- **Deps.** V14k–V14o.
- **Ships when.** Priority rule is uniform.

## V14q — Slash collision at the same priority (uniform across formats and sources)

- **Spec.** [Directory Convention — Slash-name collisions at the same priority](../spec_topics/discovery.md).
- **Adds.** Two or more candidates at the same priority that derive the same slash name — whether two `.loom` files (same source or same priority across sources), or a `.loom` and a Pi-owned `.md` prompt / `.md` subagent / another extension's command — produce a single `loom/load/cross-format-collision` error listing **every** colliding path; **none** of the loom candidates register. For the cross-format slice, the Pi-owned entry survives. Detection runs on the final derived name (after `pi.looms` mapping, `as` rename, basename hyphen-normalisation). Settings entries resolving to the same absolute path are deduplicated before detection (silent, not a collision). The `session_start` handler is also re-entrant: on a re-evaluation triggered by a settings reload or another extension's activation, any previously-registered loom whose slash name now collides with a higher-priority `.md` prompt, `.md` subagent, or extension command is de-registered and `loom/load/cross-format-collision` is emitted naming the surviving Pi-owned entry.
- **Tests.** Same-format: two packages each shipping `lint.loom` → single error listing both, neither registers; three packages → single error listing all three. Cross-format: `code-review.loom` + `code-review.md` (Pi prompt) → single error, the `.md` survives, the loom does not register; same for `.md` subagent and another extension's command. Hyphen-normalisation collisions: `code-review.loom` and `code_review.loom` from two `--loom` components → single error. Settings entries pointing at the same absolute path → silently deduped, no diagnostic. Re-evaluation: a loom registers cleanly on the first `session_start`; a second `session_start` fires after a fake `.md` prompt is added with the same slash name; the loom is de-registered and a single `loom/load/cross-format-collision` diagnostic is emitted naming the surviving `.md` entry. (Implementer note: this exercise depends on the de-registration mechanism Pi exposes on `session_start` re-entry; if Pi has no such mechanism, escalate to a spec amendment rather than silently dropping the test.)
- **Deps.** V14k.
- **Ships when.** Same-priority same-name collisions surface uniformly across all source and format combinations.
