# Independent review: Claude Code Mods semantic gaps for theta parity

> **Developer research, not end-user documentation or an accepted specification.**
> Relocated from `.pi/tmp/claude-host-research/semantic-gaps-analysis.md`. Historical release/source pins and evidence limitations remain in force.
> Unless a link points to another tracked document, experiment paths and reproduction instructions refer to the original local evidence workspace, `.pi/tmp/claude-host-research/`; downloads, caches, scripts and raw logs remain gitignored and are not required to read this report.

## Scope and confidence

Documentation review only; no models, CLI experiments, project/configuration edits, or probe-directory access. Reviewed the four requested cached guides and relevant declarations in `mods-types.txt`. Also consulted cached `headless.md` / SDK options and fetched official mods troubleshooting/admin pages via urllib. Only this report was intentionally written.

**Version warning:** `mods-types.txt:1` identifies **2.1.277**, not the downloaded **2.1.303**. The reference itself covers mixed later versions (`plugins-mods-reference.md:9-12`). Generated declarations for the installed build take precedence (`plugins-mods-create.md:262-281`). “Verified” below means explicitly documented, not demonstrated against 2.1.303. Absence from 2.1.277 declarations is not proof of absence from 2.1.303.

## Executive judgment

Mods offer substantially more than shell hooks: commands, tools, background scheduling, request interception, custom agent definitions, and correlated completion events. They are a plausible **host-adapter substrate**, but the reviewed contracts do **not establish theta parity**. The highest-risk gaps are:

1. **A slash-command hook is not a long-lived turn driver.** Submission acknowledges admission/start, not completion; waiting for completion in an ordinary hook consumes its 10-second own-time budget. Submitting from a hook that the owning turn is waiting on can reject. A detached/event-driven coordinator is necessary, and its invocation lifetime/exclusivity remains unproved.
2. **No documented Mods knob forces a schema-conforming response or replaces the main loop's tool list per turn.** Input schemas and runtime denial are different guarantees.
3. **Agent completion is usable, but spawn is start-only and resume bypasses `agent.spawn`.** Context, repeated-run identity, cancellation, and delivery behavior need an explicit adapter contract.
4. **Guards fail open by default, and mods can disappear while the session continues.** Host-enforced fail-closed theta semantics cannot simply be assumed from hook-based denials.

These are blockers to claiming a direct semantic mapping, not proof that a redesigned adapter or externally supervised SDK/child-process architecture is impossible.

## 1. Prompt submission: start versus finish, hook ownership, and lifetime

### Verified

- `$.prompt.submit` waits for idle and resolves **when the new turn starts**, not when it completes; the API explicitly says not to await it in a handler running while Claude works (`plugins-mods-api.md:217-223`).
- The older `PromptSubmitResult` describes `next(e)` settling on entry/start **or queueing behind the running turn**, never completion (`mods-types.txt:7263-7269`). This event-chain description and the newer submit-method guide are not identical promises about admission timing; neither supplies a completion future.
- Hook own-time is **10 seconds**. Time inside `next` or a Mods API call is excluded, except `$.clock.sleep` (`plugins-mods-reference.md:347-356`). Awaiting a promise of one's own counts, and timeout skips the hook (`plugins-mods-events.md:180`). Thus `await completionDeferred` inside `command.run` is not an unbounded safe wait. Conversely, it would be incorrect to say every awaited model/process API call must finish in ten seconds.
- Calls through a namespace added in `engine.create` retain the caller hook's context until **every hook on the event returns**; `$.prompt.submit` rejects while the turn is waiting on that hook (`plugins-mods-reference.md:178`). A helper/namespace wrapper does not release ownership. Older `$.command.run` also explicitly rejects inside a hook the turn waits on (`mods-types.txt:2635-2641`).
- Timers run outside an event and continue between turns; timers stop on module reload (`plugins-mods-api.md:184-223`). `next.signal` aborts when the handled event is abandoned (`plugins-mods-api.md:221-223`).
- `turn.start`/`turn.complete` expose a turn ID and final answer, including interrupted completion (`plugins-mods-events.md:242-248`; `mods-types.txt:10532-10645`). The submit result carries no new turn ID (`mods-types.txt:7263-7303`).
- Command output is visible to Claude; returning `{}` is the documented silent command form (`plugins-mods-api.md:35-37`). Registering `immediate: true` permits the command while Claude works, not a promise that nested submission is safe (`plugins-mods-api.md:37`).

### Inference / parity consequence

A viable main-session drive must return from the initiating command, submit from a genuinely detached context, and advance on correlated completion events. Merely using `void submit(...)` changes whether the hook awaits the result; it does not prove that a call made under an owning hook becomes permissible. Nor does submitting prove an answer was produced.

A detached state machine must distinguish theta-owned turns from user submissions, other mods, continuations, and interruptions. Without a returned turn ID, binding the next `turn.start` to a pending drive requires a proven admission/identity protocol, not simply “take the next completion.” An ordinary command hook cannot remain pending across arbitrarily many real turns to preserve a conventional slash invocation boundary.

### Unresolved, high value

- Exact 2.1.303 command-hook ownership: which idle `command.run` paths allow direct submit, and which reject? The documented owning-hook rejection should not be generalized to every command execution without evidence.
- Does a detached Mods timer/pending continuation keep a `-p` invocation alive after a command returns? Cached headless docs promise waiting for background subagents/workflows and certain wakeups, **not arbitrary mod timers** (`headless.md:70-92`). Do not infer either that all headless detachment fails or that all timers pin process lifetime.
- Can the adapter obtain exclusive main-loop scheduling and clean cancellation across user input, reload, `/clear`, `/resume`, and `/branch`? `session.start` does not rerun for those commands (`plugins-mods-reference.md:136-137`).

## 2. Agents: completion exists; resume and context are separate problems

### Verified

- `$.agent.spawn` runs a background agent and resolves once it **starts**, returning `{model, agentId}` or `{deny}`. The answer arrives in that agent's `turn.complete`; declarations explicitly describe resolving a waiter keyed by `agentId` (`mods-types.txt:214-225,313-343,2697-2710`).
- Every hook sees a subagent's `turn.complete`, including the spawning mod's; each run of its loop is one turn. The older declarations say subagent runs raise no `turn.start`, though their steps/completion carry `turnId` (`mods-types.txt:10546-10558`). Thus main-loop start-based correlation does not transfer unchanged to child runs.
- A custom registered agent can replace the system prompt, name allowed/disallowed tools, preload skills, set max turns, permission mode and model, and omit CLAUDE.md (`mods-types.txt:350-435`). A fork instead inherits parent context/model, ignoring a model override (`mods-types.txt:260-299`).
- The old spawn args expose prompt, description, type, model, name and cwd, **not a resume ID, transcript array, or arbitrary context object** (`mods-types.txt:214-225`). The current reference's agent namespace lists register/spawn/list only (`plugins-mods-reference.md:206`).
- **Resuming via SendMessage does not fire `agent.spawn` again**. The guide says guard the `SendMessage` tool to refuse resume (`plugins-mods-reference.md:145-154`). `$.session.send` queues delivery and returns delivery status, not the recipient's answer (`plugins-mods-api.md:225-233`).

### Inference / parity consequence

Fresh custom agents have promising isolation controls; it would be too pessimistic to label child orchestration unsupported. But fresh spawn, resumed agent runs, and model forks are distinct operations. A spawn-only policy cannot enforce a per-resume budget/model/context policy. A waiter keyed only by agent ID is insufficient once an agent can run again or receive multiple messages; run/turn identity and terminal reason must also matter.

There is no reviewed guarantee that `omitClaudeMd` removes every host reminder, skill listing, tool-search affordance, or managed instruction. It specifically excludes the CLAUDE.md block, not all ambient state. Nor is a copied parent fork equivalent to supplying an exact theta-selected transcript.

### Unresolved

Completion-before-waiter-registration races; guaranteed completion on pre-request failure/kill; direct Mods messaging versus tool-based resume guards; per-child cancellation (the documented `$.turn.abort` concerns a running turn, while `TaskStop` is a separate tool); resumed context retention and interruption semantics; whether auto-delivered child results start unwanted main-loop turns. These are contract questions, not conclusions from offline stubs.

## 3. Exact tool visibility is not runtime denial

### Verified

- `tool.call`/`tool.check` refuse execution; denial text is returned to the model (`plugins-mods-events.md:96-116,182-213`). A matcher filters **hook invocation**, not the model's available tools (`plugins-mods-events.md:73-90`).
- `tool.describe` rewrites description/deferral; it has no documented remove/hidden result. Deferral puts a tool behind ToolSearch, not out of reach (`mods-types.txt:10225-10276`; `plugins-mods-reference.md:57-62`).
- `turn.step` exposes model/effort and pinned metadata, not writable tools/messages/tool choice (`mods-types.txt:10678-10728`). A custom agent does have `tools` / `disallowedTools`; the older contract describes the allowlist as refusing other calls (`mods-types.txt:369-378`). This is positive evidence for a child-agent policy, not proof of exact request-level visibility.
- Server-side tool uses can occur without `tool.call` or `tool.check` events (`plugins-mods-events.md:270`).

### Inference / parity consequence

The reviewed Mods interface does not establish an exact per-turn main-loop tool set. “Deny every call outside X” leaves tool names/descriptions visible and lets the model attempt forbidden actions. “Defer outside X” still permits discovery. Those differ from theta query modes that require only a result tool or no tools in the request.

Custom-agent allowlists deserve separate verification at the actual request boundary, including MCP search/dynamic tools and server-side tools. No broad assertion that Claude cannot filter tools is justified; the narrow issue is **Mods' exact main-loop, per-drive capability**.

## 4. Structured responses: schema-shaped tools are not forced output

### Verified

- `$.tool.register` accepts an **input** JSON Schema (`plugins-mods-api.md:43-54`). That constrains arguments when a tool is called, not whether it is called.
- Old `ModelCompleteRequest` exposes model/prompt/system/maxTokens, and fork takes prompt (`mods-types.txt:5106-5146`). Newer guide additions include effort, timeout and cache blocks, but do not document response schema or forced tool choice (`plugins-mods-api.md:73-125,174-182`).
- `AgentSpec`, spawn args, prompt submission, and `TurnStepInput` expose no documented output-schema/tool-choice control (`mods-types.txt:214-225,350-435,7185-7192,10678-10728`). A `turn.complete` text result is display text under the answer, not schema enforcement (`plugins-mods-reference.md:126`).
- **Separate surface:** CLI `--json-schema` and SDK `outputFormat` explicitly offer schema-shaped output (`headless.md:145-169`; `agent-sdk-typescript.md:530`). Therefore “Claude Code has no structured-output support” is false.

### Inference / parity consequence

A Mods result tool plus validation/retries could approximate a typed-query protocol, but does not establish a forced-call guarantee. Natural-language JSON instructions do not close that gap. CLI/SDK schema support may offer an alternate process boundary; it is not automatically callable as a per-turn Mods option. Synthesizing `turn.step` response chunks would replace what the model produced, not demonstrate a schema-constrained real model request.

**Unresolved:** build-matched 2.1.303 declarations may add controls absent from 2.1.277. Until checked, classify this as **no documented Mods forcing mechanism found**, not confirmed impossibility.

## 5. Enablement, policy, and fail-closed boundaries

### Verified from cached sources

- Mods load through a plugin manifest and `hooks/hooks.json` module entry (`plugins-mods-reference.md:16-27`). Explicitly supplied mods work in documented print-mode examples (`plugins-mods-create.md:207-216`); inability to approve a newly model-authored mod in `-p` is a different limitation (`plugins-mods-create.md:60-68`).
- `CLAUDE_CODE_PLUGIN_DIRS` supplies plugin directories; `CLAUDE_CODE_PLUGIN_DIR_WATCH=1` enables noninteractive directory reload (`plugins-mods-reference.md:376-390`). Managed controls include `allowManagedModsOnly` (a built-in guard option), `allowManagedHooksOnly`, `disableAllHooks`, and `disableSideloadFlags`. The guard can protect managed prompt/tool material and deny rules; ordinary mods do not have unconditional authority.
- A failing hook is skipped by default. `.catch` can deny on failure, but its one-second handler can also fail and then the hook is skipped (`plugins-mods-events.md:317-350`; `plugins-mods-reference.md:353-355`). Returning deny **after** execution only withholds results, undoing no side effects (`plugins-mods-events.md:136-141`).
- Source restrictions are architectural, not merely packaging: no Node APIs, only plugin-relative static imports; `$` cannot be aliased or passed to imported helpers (`plugins-mods-api.md:265-270`; `plugins-mods-create.md:309-316`). A general runtime must adapt this boundary or run outside the worker.

### Verified from fetched official sources (not additional cached files)

Precise official section anchors are given because no extra artifact was saved:

- [Admin — stop user-installed mods](https://code.claude.com/docs/en/plugins/mods/admin#stop-user-installed-mods-from-loading): mods on by default since 2.1.286; **`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` is ignored at every value from 2.1.287 onward** (fetched Markdown lines 11, 51). Do not recommend that historical flag as the 2.1.303 enablement mechanism.
- [Troubleshooting — check whether mods can load](https://code.claude.com/docs/en/plugins/mods/troubleshoot#check-whether-mods-can-load): remote rollout switch or saved-off rollout state can disable installed mods (fetched lines 21-32). Default-on is not guaranteed-on.
- [Admin — know what happens by default](https://code.claude.com/docs/en/plugins/mods/admin#know-what-happens-by-default): guard loads on managed machines or Team/Enterprise sign-in; protects managed system/context/tool material. Model tool deny rules do **not** sandbox a mod's own `$.fs`/`$.process` access (fetched lines 55-67).
- [Admin — enforce policy](https://code.claude.com/docs/en/plugins/mods/admin#enforce-a-policy-with-a-mod-of-your-own): after three unattributed worker crashes, all nonbuiltin mods, including organization mods, are unloaded until reload/restart; `--safe-mode` also omits them (fetched line 370). [Troubleshooting — worker disabled](https://code.claude.com/docs/en/plugins/mods/troubleshoot#mods-that-run-in-the-hooks-worker-are-off-for-this-session), fetched lines 160-164, confirms the session can continue without them.

### Inference / parity consequence

A tool gate implemented only by a mod is not an unconditional security/language boundary: a timeout, failed catch, reload, worker disablement, earlier mod, or policy can remove or bypass its behavior. A parity claim needs either a host-level fail-closed envelope or an explicit reduced guarantee. This is distinct from forbidding use under intentional administrative disablement.

`--bare` is not a generic reproducibility solution for a Mods port: the docs say it blocks ordinary installed mod hooks and background work (`plugins-mods-create.md:68`; `headless.md:61-67`). That bare mode may accept plugin flags for other plugin components does not prove their hooks modules run.

## Highest-value remaining evidence (without duplicating probes)

1. Inspect **build-matched declarations** for submit, command lifecycle, tool-list control, response schema/tool choice, child stop/resume/context. Current prose already documents features newer than the public types.
2. Require evidence for the **complete deferred-command lifecycle**, particularly print-mode process retention, turn ownership/correlation, interruption, reload, and competing input—not just successful submit or mocked completion.
3. Distinguish request-visible **exact tools** from denied execution, and distinguish accepted result-tool input from **forced structured response**.
4. Require a child protocol that handles **multiple runs of one agent**, failed/killed starts, withheld results, and ambient context. Fresh spawn success alone is insufficient.
5. Define what happens when the mod/worker disappears. Passing offline `plugin validate` / stubbed `plugin test` establishes syntax and hook behavior, not real host scheduling, provider schema enforcement, or continuation lifetime (`plugins-mods-create.md:285-306,318-356`).

**Bottom line:** continue feasibility research, but describe the candidate as an event-driven host adapter with unresolved semantic contracts. Do not call it a drop-in theta host, and do not mistake the 10-second hook budget for a universal API-call timeout or the old public type file for the 2.1.303 contract.
