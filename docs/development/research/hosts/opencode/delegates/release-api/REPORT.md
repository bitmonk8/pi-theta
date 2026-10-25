# OpenCode released API feasibility — release/API delegate

> **Developer research, not end-user documentation or an accepted specification.**
> Relocated from `.pi/tmp/dual-host-research/opencode/delegates/release-api/REPORT.md`. Historical release/source pins and evidence limitations remain in force.
> Unless a link points to another tracked document, experiment paths and reproduction instructions refer to the original local evidence workspace, `.pi/tmp/dual-host-research/opencode/delegates/release-api/`; downloads, caches, scripts and raw logs remain gitignored and are not required to read this report.

Research snapshot: 2026-10-19 UTC. **Provider-free static verification only**; no live model, login, host configuration changes, or remote writes. All downloaded artifacts and generated inventories are under this report's directory. No implementation attempted.

## 1. Exact released identity (authoritative)

**OpenCode, repository `anomalyco/opencode`, stable GitHub release `v1.19.3`, published `2026-10-16T12:31:52Z`.** GitHub reports `draft: false`, `prerelease: false`. npm `latest` is `1.19.3` for `opencode-ai`, `@opencode-ai/plugin`, and `@opencode-ai/sdk`. Do not confuse snapshot/beta/dev/tui-v2 dist-tags with stable. This is the current `/releases/latest` result, corroborated by the ten latest releases.

Sources / downloaded evidence:

- https://api.github.com/repos/anomalyco/opencode/releases/latest → `latest.json`; release https://github.com/anomalyco/opencode/releases/tag/v1.19.3 . Release lists CLI Linux/macOS/Windows archives plus desktop assets.
- https://api.github.com/repos/anomalyco/opencode/releases?per_page=10 → `releases-10.json`.
- https://api.github.com/repos/anomalyco/opencode/git/ref/tags/v1.19.3 → `tag.json`: actual tag commit **`e3c4eb242585dcd77be1a867391b7c25fd47ce52`**. Commit API saved as `commit.json`; message `release: v1.19.3`.
- Important identity distinction: release metadata `target_commitish` is **`60c9be092129745688bb3c3a752affc6cbd66ede`**, not the tag commit. Source references below pin the actual tag/commit, not `target_commitish`.
- Source archive https://api.github.com/repos/anomalyco/opencode/tarball/v1.19.3 → `source.tar.gz`, extracted to `source/`.
- npm metadata https://registry.npmjs.org/opencode-ai → `npm-cli.json`: `1.19.3` published `2026-10-16T12:32:00.280Z`.
- https://registry.npmjs.org/@opencode-ai/plugin → `npm-plugin.json`: published `2026-10-16T12:32:47.022Z`.
- https://registry.npmjs.org/@opencode-ai/sdk → `npm-sdk.json`: published `2026-10-16T12:32:08.438Z`.
- Exact registry tarballs: https://registry.npmjs.org/@opencode-ai/plugin/-/plugin-1.19.3.tgz and https://registry.npmjs.org/@opencode-ai/sdk/-/sdk-1.19.3.tgz saved as `plugin.tgz` / `sdk.tgz`, extracted to `plugin/package/` / `sdk/package/`. Both SHA-512 integrity values verified against npm metadata (matched). `SHA256SUMS` pins primary evidence files.

**Scope caveat:** This release really ships files and exported APIs named `v2`. Those below are from **v1.19.3 release artifacts/tag**, not a `v2` or main development branch. Excluding them merely because their package path contains `v2` would miss part of the released contract. However, an exported/generated operation is not necessarily implemented: see `wait` below.

## 2. Executive assessment

| Requirement | Released fact / boundary |
|---|---|
| Native existing interactive TUI session discovery | **Yes.** TUI plugin gets current route/session ID, shared SDK client, event bus, and reactive session/message/part/status/permission state. This is stronger than an external launcher. |
| Native custom interactive command | **Yes.** TUI keymap registration with callbacks; legacy command API (including slash aliases) remains exported but deprecated. Server-side slash commands are prompt-template expansion, not general imperative executors. |
| Submit real native model turn in current session | **Yes.** Shared SDK `session.prompt` takes existing session ID and resolves after native loop settles; async alternative only admits and returns. Native TUI itself uses this API. |
| Own/replace existing host agent loop via plugin | **Not established.** Published server hooks mutate messages/parts/parameters and observe tool execution; no public loop takeover/replace callback or explicit ownership lock. A deterministic Theta runtime would have to be real code, not text interpreted by the model. |
| Direct deterministic invocation of arbitrary native tools, with native permissions/history | **No public generic invoke API found.** Public tool API lists IDs/schemas. Host internally constructs permission-aware native tool contexts; that executor is not exposed by `PluginInput`, `ToolContext`, or generated SDK. |
| Permission-aware custom plugin tool | **Yes.** `ToolContext.ask`, `abort`, metadata/session/message IDs; host bridges ask into native merged agent/session rules. This does not provide native `read`/`edit`/`bash` tool lookup/invoke. |
| Turn settlement | **Qualified yes for legacy `/session` native TUI path.** Synchronous prompt awaits shared loop result; not a per-submission exclusive completion barrier when concurrent submissions occur. Inspect persisted assistant errors/finish/parts, not just Promise resolution or idle. |
| Cancellation/history | **Yes for legacy TUI path:** explicit session abort, persistent message/part/history operations, status/event observation. Cancellation is session-scoped, not a private Theta-run cancellation token. |
| Released newer `/api/session/.../wait` | **NOT implemented in this release core.** Generated SDK advertises it, but core always returns `OperationUnavailableError({operation:"wait"})` after checking existence. Do not count this endpoint as a working settlement primitive. |

## 3. Citation convention

Every `source/...` path below refers to the extracted exact release archive. Permanent source URL prefix:

`https://github.com/anomalyco/opencode/blob/e3c4eb242585dcd77be1a867391b7c25fd47ce52/`

Append the cited repository-relative path and `#Lstart-Lend`. For example: https://github.com/anomalyco/opencode/blob/e3c4eb242585dcd77be1a867391b7c25fd47ce52/packages/plugin/src/tui.ts#L581-L635 . npm declaration files in `plugin/package/dist/` / `sdk/package/dist/` are independent published-artifact corroboration.

## 4. Native existing interactive integration

### TUI plugin is an actual released host extension surface

- `packages/plugin/src/tui.ts:581-635`: `TuiPluginApi` exposes `keymap`, mode, `route.current` / navigation / route registration, dialogs/UI/Prompt, `state`, **`client: OpencodeClient`**, event bus, renderer, slots and lifecycle. Plugin entry is async `(api, options, meta) => Promise<void>`; module has `tui`, with `server?: never`.
- `packages/plugin/src/tui.ts:47-62`: current route distinguishes `home`, `session` with `params.sessionID`, custom routes.
- `packages/plugin/src/tui.ts:375-399`: reactive state session lookup, messages, status, pending permissions/questions; `part(messageID)` exposes message parts.
- `packages/tui/src/plugin/adapters.tsx:98-162,185-205,300-306`: implementation reads actual `sync.data` and current route; **client is `input.sdk.client`**, not a separately spawned worker client. This directly supports an existing-session native integration inference.
- `packages/plugin/src/tui.ts:84-118`: legacy `TuiCommand` includes slash name/aliases and async `onSelect`; API is deprecated in favor of `keymap.registerLayer` / dispatch. `packages/tui/src/feature-plugins/system/plugins.tsx:238+` is a shipped keymap-registration consumer.
- `plugin/package/package.json:11-39`: stable npm package exports root, `/tool`, `/tui`, `/v2/effect`, `/v2/effect/integration`, `/v2/effect/plugin`, `/v2/promise`. Optional OpenTUI peers and Solid UI coupling mean TUI plugin is not automatically a browser/desktop plugin.

**Inference:** A native TUI command callback can run a real deterministic interpreter, capture the current session ID, and call the host SDK on that session. That is architecturally distinct from starting `opencode run` in a new process. Not live-proven here. TUI API does not automatically establish equivalent desktop/browser command registration.

### Server plugin contract differs

- `packages/plugin/src/index.ts:56-80`: plugin receives SDK client, project, directory/worktree, server URL, Bun shell and experimental workspace registration. It does **not** receive a current selected TUI session or a native tool invoker.
- `packages/plugin/src/index.ts:222-338`: returned hooks include event/config/tool/auth/provider; mutable `chat.message`, chat params/headers, command before, tool before/after; experimental chat-message/system transforms and compaction hooks. `command.execute.before` only gets command/session/arguments plus mutable parts; there is no handled/cancel/return-result field.
- `packages/opencode/src/plugin/index.ts:146-154,255-260,284-297`: host supplies SDK client, forwards matching-directory events, and sequentially invokes mutable hooks. Event hook is called with `void hook.event?.(...)`, i.e. not a settlement barrier.
- `packages/plugin/src/index.ts:261` still declares `permission.ask`; **implementation caution:** searching released `packages/opencode/src` finds native `permission.ask(...)` service calls but no plugin trigger of the string hook name. `packages/opencode/src/permission/index.ts:67-116` evaluates rules and publishes permission events directly. Do not rely on that declaration alone as working permission interception.
- Released v2 promise plugin surface `packages/plugin/src/v2/promise/context.ts:12-23` and `README.md:1-111` offers domain transforms/reloads (agent/catalog/command/integration/reference/skill) and AI SDK hooks. It does **not** expose existing-session loop ownership, a session SDK client, or a general native tool invoker in its context.

## 5. Native prompt/commands, settlement and concurrency

### Real TUI uses legacy session endpoints

`packages/tui/src/component/prompt/index.tsx:1083-1123` calls `sdk.client.session.command({sessionID,...})` or `session.prompt({sessionID, agent, model, parts,...})`. This is decisive evidence for which API family controls the current released interactive conversation.

- API paths/operations: `packages/opencode/src/server/routes/instance/httpapi/groups/session.ts:80-100,316-368`.
- Handlers: `.../handlers/session.ts:295-348`: synchronous prompt awaits `promptSvc.prompt` and returns final JSON; async forks work and returns NoContent immediately, publishing session error on failure. Command awaits native command operation. Shell awaits shell operation and maps busy errors.
- Native prompt `packages/opencode/src/session/prompt.ts:1051-1071`: creates/persists user input, optionally adjusts deprecated tool permissions; `noReply:true` returns the user message **without** a model run, otherwise calls loop.
- Native loop `prompt.ts:1338-1347` invokes `state.ensureRunning`, returning `lastAssistant`; `run-state.ts:55-70` sets session busy/idle as runner transitions.
- **Concurrency trap:** `packages/opencode/src/effect/runner.ts:115-137` joins existing `run.done` when already running. A newly submitted prompt can join a shared in-flight loop. No public claim of exclusive submission ownership or separately correlated `awaitTurn` is justified. Adapter must track IDs and serialize its own drives / define interaction policy with simultaneous user input.
- **Cancellation is not necessarily rejected Promise:** `effect/runner.ts:59-65` maps runner cancellation to `onInterrupt`; `prompt.ts:1346` supplies `lastAssistant` as interruption result. Errors also live on persisted assistant structures. A resolved prompt is not sufficient success evidence.
- SDK generated methods default `ThrowOnError=false`; use explicit error handling or `throwOnError:true` rather than assuming HTTP failures reject.

### Server slash command != deterministic command executor

`packages/opencode/src/session/prompt.ts:1356-1480` looks up command, substitutes `$1` / `$ARGUMENTS`, executes embedded shell template expressions, chooses agent/model, constructs prompt/subtask parts, fires `command.execute.before`, then invokes **prompt** and publishes Command.Executed.

A `.theta` command cannot become deterministic simply by placing Theta source in a command template. A TUI callback or real runtime integration is required. `Command.Executed` is emitted after the prompt result, not a generic interpreter result contract. Embedded shell expansion here also is not proof of permission-aware native tool execution.

## 6. Native tools and permissions: crucial blocker/boundary

- Published custom tool contract `packages/plugin/src/tool.ts:3-26,35-58`: context has sessionID/messageID/agent, directory/worktree, AbortSignal, metadata setter and `ask({permission,patterns,always,metadata})`. Returns string or structured title/output/metadata/attachments. No `executeNativeTool`, tool registry, `callTool`, or `read/edit/bash` callable collection.
- `packages/opencode/src/tool/registry.ts:125-173`: host wraps custom plugin tools into its internal Effect executor; it converts host `ask` to Promise and supplies execution directory/worktree. Registry itself is not part of public PluginInput.
- `packages/opencode/src/session/tools.ts:59-93`: internal tool context binds real message/call IDs, abort signal and permissions merged from agent/session; ask invokes native permission service.
- `session/tools.ts:95-137`: native executor triggers before hook, executes the registry tool with that context, normalizes attachments, then after hook. This is the permission/history-aware path a Theta native-tool operation would need to call or faithfully expose. Before/after hooks are not call-by-name APIs; after is not a finally/error-settlement hook.
- Permission service `packages/opencode/src/permission/index.ts:67-116,118-150`: evaluates allow/deny/ask, publishes Asked, awaits Deferred, removes pending state on completion/interruption; reply accepts once/always/reject behavior.
- Public SDK tool endpoints are only list schemas and IDs (`packages/sdk/js/src/v2/gen/sdk.gen.ts:1518-1582`). `endpoint-inventory.txt`, mechanically extracted from release `packages/sdk/openapi.json`, contains all tool/session/permission/TUI endpoints; no generic invoke-tool endpoint appears.

**Do not substitute `session.shell` for permission-aware bash:** `packages/opencode/src/session/prompt.ts:451-593` manually records user/assistant/tool parts and spawns a shell process. It never calls native `Permission.ask` in that path. This is the explicit-user shell lane, not the LLM-selected bash tool's merged-policy executor. It records output and cancellation metadata, but is not permission-equivalent. Likewise `PluginInput.$` is shell access, not native tool permission delegation.

**Conclusion (bounded negative):** No **public released plugin/SDK** arbitrary-native-tool invoke contract was found. Internal modules demonstrate feasibility with host cooperation/fork/internal imports, but do not establish a supported public integration. A custom plugin tool may ask native permission for its own actions; it cannot safely claim arbitrary native `read/edit/bash` invocation with host accounting simply from that fact.

## 7. Cancellation and persistent history

- Legacy HTTP abort handler `packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts:232-235` calls prompt cancel. `session/run-state.ts:79-89` cancels related background jobs and current runner; idle is set even without a runner.
- `session/run-state.ts:116-146`: descendant background jobs matched by session/parentSession metadata are recursively cancelled.
- `effect/runner.ts:171-202`: cancellation interrupts owned fibers and settles pending deferreds; this is session-level cancellation. A Theta adapter must decide whether cancelling a Theta should abort concurrent human/native work in that session.
- Custom tools receive native AbortSignal (`plugin/src/tool.ts:18`); they must cooperate. Native shell spawn is scoped and force-killed after 3 seconds (`session/prompt.ts:551-563`), and shell cancellation appends user-aborted metadata (`:526-531,580-582`).
- Legacy messages/message/part/history operations: `server/routes/instance/httpapi/groups/session.ts:179-195,369-420`, corresponding SDK methods at `packages/sdk/js/src/v2/gen/sdk.gen.ts:3706+,4261+`. Fork/revert/unrevert and message/part deletion/editing exist; they are persistence/edit controls, not permission-aware tool invocation.
- Reactive TUI state is useful for UI, but durable final message/part reads are safer settlement evidence than a transient status/event alone.

## 8. Released newer `/api/session` API: do not overclaim

The release also ships generated `client.v2.session` methods (`packages/sdk/js/src/v2/gen/sdk.gen.ts:5426-5810,6990+`) with durable prompt admission (`delivery:steer|queue`, resume flag), history/event replay, interrupt, context, and wait.

- `sdk.gen.ts:5616-5660`: `/api/session/{id}/prompt` documents **durably admit and schedule**, not await settlement.
- `:5677-5695`: generated wait says become idle.
- **Actual release implementation:** `packages/core/src/session.ts:421-424`: checks session exists, then always returns **`OperationUnavailableError({operation:"wait"})`**. `compact` immediately above is similarly unavailable. This is decisive implementation evidence overriding generated documentation.
- `packages/server/src/handlers/session.ts:197-210` handles wait and maps unavailable to service-unavailable; `:333-380` implements durable history / interrupt service calls.
- `packages/core/src/session.ts:350-383,425-432`: prompt admits then wakes execution; interrupt affects process-owned execution. `packages/core/src/session/execution/local.ts:16-35` uses its own run coordinator.
- Legacy TUI submits to `client.session.prompt`, not `client.v2.session.prompt`. Though V1 events project into shared session tables (`packages/core/src/session/projector.ts:214-310`), that alone does not prove new execution/wait semantics control the existing legacy TUI runner. Do not mix these cancellation/settlement families without an explicit provider-free integration probe.
- `endpoint-inventory.txt` records both families so future probes can choose deliberately.

## 9. What is established vs not tested

**Established by release source + published artifact:** exact stable identity; native TUI plugin route/client/state access; native current-session prompt lane; lifecycle/tool/context shapes; internal permission-aware executor; no public generic invocation endpoint; actual unavailable new wait method; session-level abort/history capabilities.

**Reasonable inference:** deterministic runtime in a TUI command callback could orchestrate model turns in an existing session using legacy session API, with careful ownership/error/cancel handling. Native permission-aware tool-call surface is the major missing public primitive for full Theta semantics.

**Unknown / not verified:** actual plugin load and command execution under isolated released binary; desktop/browser support; OpenAI ChatGPT subscription compatibility of this release; live model settlement and tool denial/cancellation; robust coordination with simultaneous human prompts; public compatibility guarantees for internal imports. No credentials accessed and no live provider selected.

This research is not an implementation or compatibility certification. MCP/skills availability was deliberately not used as evidence of agent-loop control.
