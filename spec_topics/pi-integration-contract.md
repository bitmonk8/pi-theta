# Pi Integration Contract

The runtime depends on a small, named surface from `@mariozechner/pi-coding-agent`. Each item below is the V1 contract; behaviour outside this surface is non-load-bearing and may be revised without spec changes. The V1 contract is anchored to `@mariozechner/pi-coding-agent ^0.72.1` (and the matching `pi-agent-core`/`pi-ai`/`pi-tui` minor); a Pi minor bump requires re-validating this contract before the loom `peerDependencies` range is widened.

**Extension entry point.** A single Pi extension module (`pi-loom/index.ts`) exporting the standard `default function (pi: ExtensionAPI)` factory. The factory:

1. Walks the five discovery sources defined in [Directory Convention](./discovery.md) directly: the global directory `~/.pi/agent/looms/`, the project directory `.pi/looms/`, every installed package's `pi.looms` entry or conventional `looms/` directory (per [Package discovery](./discovery.md#package-discovery)), the `looms` settings array (per [Settings file reads](./discovery.md#settings-file-reads)), and the `--loom` CLI flag. Pi's `resources_discover` event is **not** used — it has no `loomPaths` slot — and the `pi` manifest namespace does not enumerate `pi.looms`; the loom extension owns the walk for all five sources.
2. Parses and registers each `.loom` file via `pi.registerCommand(name, { description, getArgumentCompletions, handler })` — one slash command per loom.
3. Optionally registers a file watcher (chokidar) over the discovered roots; on change, calls `ctx.reload()` from a `_loom-reload` command to re-discover and re-register.

**Per-loom registration.** For each `.loom` file:

- The slash-command `handler` runs the binder (when applicable) and then the loom interpreter against the appropriate conversation.
- If the loom is referenced by another loom's `tools:` (i.e., it is exposed as a tool to a model), the runtime *also* registers it via `pi.registerTool({ name, description, parameters: <params-schema-as-typebox>, execute })`. The `execute` adapter spawns the loom as a subagent invocation (equivalent to `invoke<T>(path, ...)`) and returns its result envelope. The adapter is **re-entrant**: when the model emits parallel tool calls (Pi's parallel-tool-mode behaviour, see [Tool Calls — Concurrency](./tool-calls.md)) targeting the same registered loom, two concurrent calls into the same `execute` adapter spawn two independent subagent invocations on the event loop. Adapter implementations MUST NOT serialise calls on shared closure state.

**Conversation drive — prompt mode.** The loom interpreter drives the user's session by:

- Issuing untyped queries via `ctx.sendUserMessage(text)` (or `{ deliverAs: "steer" }` if the agent is mid-stream) and awaiting completion by subscribing to `agent_end`. The accumulated assistant text from the final turn is the `Ok(string)` value.
- Issuing typed queries that enforce the inferred or ascribed schema against the model's final assistant response for that turn. The runtime MUST present the loom's frontmatter `tools` to the model during the turn (matching untyped-query semantics from [Query](./query.md)), MUST surface the validated payload exactly once, and MUST NOT add additional user-visible turns to the conversation beyond the single typed-query turn. The technique used to obtain a schema-conformant response (synthesised one-shot tool, provider JSON-mode, native structured-output API, grammar-constrained decoding, etc.) is provider-specific and is described in [Implementation Notes — Runtime](./implementation-notes.md#runtime).

**User-visible streaming — prompt mode.** Assistant tokens for both untyped and typed queries stream into the user's transcript in real time as Pi's TUI receives them; `pi-loom` does not buffer, suppress, or re-style the stream. The loom interpreter resumes execution only after `agent_end`, but the stream's appearance in the transcript is independent of the loom's resumption — the user sees the response unfold while the loom is still mid-query. For typed queries that obtain their schema-conformant response via a synthesised one-shot tool, the tool's invocation appears as a normal Pi tool-call card; the lowered tool arguments are the structured value the loom receives, and Pi's standard tool-call rendering applies (no special loom-side formatting). When a typed query's underlying turn includes intermediate tool-use loops before the final structured-output sink fires, each intermediate tool call renders normally in the prompt-mode transcript; only the final response (synthesised-tool call or equivalent provider mechanism) is the structured-value sink. Edge cases:

- An `Err` propagated by `?` after the user has already seen partial assistant text: the streamed prefix stays in the transcript (Pi's behaviour) and the `loom-system-note` describing the failure is appended after, not interleaved.
- Cancellation mid-stream (see [Cancellation](./cancellation.md)): whatever partial text Pi has already rendered remains visible; partial output is not rolled back. The cancellation system note is appended after the partial prefix.

**Conversation drive — subagent mode.** The loom interpreter spawns a fresh in-process `AgentSession` via `createAgentSession({ tools, model, sessionManager: SessionManager.inMemory(), resourceLoader, ... })`. The session inherits the loom's `system:` prompt (from frontmatter, with `${param}` interpolation resolved at conversation-creation time), the loom's `tools:` set (lowered to Pi tool definitions; registered loom callees are themselves wrapped via `defineTool`), and the loom's `model`. Queries against the spawned session use the same `prompt(text)` + `agent_end` listener pattern as prompt mode; typed queries against the spawned session honour the same behavioural contract as prompt-mode typed queries above and use the same mechanism described in [Implementation Notes — Runtime](./implementation-notes.md#runtime). The session is in-memory only — the spec mandates the transcript stays private to the loom and is discarded when the loom returns. Each subagent-mode invocation gets its own `AgentSession`, its own captured `tools:` table (the load-time resolution snapshot from [Parameters and Frontmatter](./frontmatter.md)), and its own derived `AbortSignal`; sibling invocations triggered by parallel tool calls do not share mutable session state.

**Subagent session lifecycle.** The runtime owns the spawned `AgentSession` for exactly the duration of one subagent-mode loom invocation. Disposal is mandatory and runs in a `finally` block that wraps the entire interpreter execution against that session, so it fires on:

- normal return (the loom's tail expression resolves);
- any `Err` returned to the parent (query failure, tool failure, child invoke failure, validation failure, cancellation);
- any panic raised inside the subagent (`MatchError`, index out of bounds, null access — see [Errors and Results](./errors-and-results.md));
- any unexpected exception thrown by the interpreter or the Pi SDK.

Disposal calls `AgentSession.dispose()`, which removes all event listeners (including the `agent_end` listener the runtime attached for query completion) and disconnects from the underlying agent. `dispose()` is invoked at most once per session and treated as idempotent at the call site: a second call (e.g. defensive cleanup in an outer scope) is a no-op. If `dispose()` itself throws, the runtime logs the disposal error via the `loom/runtime/subagent-dispose-failure` diagnostic (see [Diagnostics](./diagnostics.md)) but does not mask the original error that triggered teardown — the parent still observes the original `Err` or panic.

The same lifetime rule applies to any tool registration the runtime installed for this invocation (including the typed-query one-shot `__loom_respond_<hash>` tool and any per-call loom-callee tools); their unregister calls run in the same `finally` block, before `dispose()`.

Edge cases:

- The `finally` block must run even when the parent's `AbortSignal` (see [Cancellation](./cancellation.md)) fires before the subagent's first turn — i.e. spawn-then-immediate-cancel still requires disposal.
- For nested subagent invocations (a subagent that itself invokes a subagent-mode child), each level owns its own session and runs its own `finally`. Disposal order is deepest-first, naturally produced by the call stack's `finally` unwinding.
- Disposal must precede the parent observing the result — the parent's `match`/`?` arm runs after the child's session is gone, so the child's listeners cannot leak into work the parent does next.

**User-visible streaming — subagent mode.** No assistant tokens, tool-call cards, or system notes from a subagent's queries surface to any ancestor transcript. The subagent's `AgentSession` uses an in-memory `SessionManager`; nothing it produces flows to Pi's user-facing UI. This is the deliberate counterpart to prompt-mode streaming: subagent queries are unobservable to the human operator by construction, and the only artefact that crosses back into the parent context is the loom's return value (or an `InvokeCalleeError` / `InvokeFailure`, per [Invocation](./invocation.md)).

**System notes.** Echoes (binder result), `Err`-in-prompt-mode notes, and binder failure messages are emitted via `pi.sendMessage({ customType: "loom-system-note", content, display: true, details: { ... } }, { triggerTurn: false })`. A `pi.registerMessageRenderer("loom-system-note", ...)` formats them as one-line, dim-styled notes in the transcript. The custom-type approach (rather than `ctx.ui.notify(...)`) is chosen because notes need to persist in the session transcript for replay and `/tree` navigation, not just appear transiently.

The `pi.sendMessage` call for `loom-system-note` is treated as best-effort. If it throws or rejects, the runtime falls back in this order:

1. `ctx.ui.notify(content, "error")` — a transient surface so the user still sees the message in the current session, even if it does not persist in the transcript.
2. A `loom/runtime/system-note-delivery-failed` diagnostic emitted through the standard diagnostics channel (see [Diagnostics](./diagnostics.md)), with `message` set to the original note's `content` and `hint` set to the underlying `sendMessage` error's message. This diagnostic is itself best-effort: if both channels fail, the failure is logged to `console.error` and execution continues.

The fallback path is taken on any thrown or rejected value from `sendMessage`; it does not retry the original call. The fallback never aborts the slash-command handler or the spawned subagent session. Implementers must guard against re-entry: if a future `loom/runtime/*` handler ever routes diagnostics back through `loom-system-note`, the diagnostic step in this fallback MUST NOT re-invoke `pi.sendMessage`. `ctx.ui.notify` itself can throw (e.g. in print mode where Pi's UI is not attached); wrap it in the same try/catch and proceed to the diagnostic step. For panic-routed notes, the original panic message MUST be included in the final-resort `console.error` log so post-mortem debugging retains the stack.

**Tool execution from loom code.** Code-side `<name>(args)` calls invoke the Pi tool's `execute(toolCallId, params, signal, onUpdate, ctx)` directly:

- `toolCallId` is a synthesised UUID prefixed `loom-direct:`.
- `params` is the loom value lowered to JSON (wire names applied).
- `signal` is the loom's current `AbortSignal`.
- `onUpdate` is a no-op (V1 does not surface streaming partial results to loom code).
- `ctx` is a synthesised `ExtensionContext` with `cwd`, `signal`, `sessionManager` (the loom's current session — Pi's user session in prompt mode, the spawned subagent session in subagent mode), and a no-op `ui`.

The tool's returned `{ content, isError }` becomes the V1 string return value: the concatenated text content blocks, returned as `Ok(string)` if `!isError` and `Err(QueryError { kind: "tool_call_error", cause: "execution", ... })` otherwise.

**Cancellation source.** As described in [Cancellation](./cancellation.md), the loom's `AbortSignal` is `ctx.signal` from the slash-command handler (or the `signal` parameter to a tool-exposed loom's `execute`). All downstream queries, tool calls, and child invokes derive from this signal.

**Discovery API.** The loom extension does its own discovery walk; it does not use Pi's `resources_discover` event (which has no `loomPaths` slot) and does not rely on Pi to enumerate `pi.looms` (which is not a Pi-recognised manifest key). The five sources, their priority order, the package-root walk, and the failure-mode table are all in [Directory Convention](./discovery.md).
