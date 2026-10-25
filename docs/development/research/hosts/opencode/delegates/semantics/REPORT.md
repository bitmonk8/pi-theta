# Adversarial Theta semantic portability review — OpenCode

> **Developer research, not end-user documentation or an accepted specification.**
> Relocated from `.pi/tmp/dual-host-research/opencode/delegates/semantics/REPORT.md`. Historical release/source pins and evidence limitations remain in force.
> Unless a link points to another tracked document, experiment paths and reproduction instructions refer to the original local evidence workspace, `.pi/tmp/dual-host-research/opencode/delegates/semantics/`; downloads, caches, scripts and raw logs remain gitignored and are not required to read this report.

## Verdict

**A substantial deterministic language-core port is credible. Existing-session native parity is not established by the released plugin/HTTP APIs. Isolated OpenCode workers or an owned custom frontend are more credible first architectures, but neither is already a Theta implementation.** A plugin that asks an agent to interpret Theta, a custom command template containing Theta, or an MCP launcher is not deterministic execution.

OpenCode has an important advantage over the previously researched Claude Mods surface: released source contains real schema-output orchestration, request-visible tool filtering, native child sessions, and HTTP session driving. These must not be collapsed into either “nothing is possible” or “the SDK supplies the Theta semantics.” Its schema-output channel still runs the ordinary session loop; its tool selection interacts with persistent session permissions; and concurrent prompt callers can join an already running loop.

No implementation, package installation, model request, credential read, or host execution was performed. All writes are in this report's assigned directory. Source inspection is evidence of implementation, **not live verification** or a stability guarantee.

## Evidence baseline and version discipline

- Theta working tree: `/home/thomasa/Projects/pi-theta`, HEAD `a21bd1b27b09efdd7f71c7484b3f6d1fcd1dd299`, package `0.496.0`. Read the current dirty files too: `src/extension/live-prompt-query-driver.ts`, `turn-settlement.ts`, `src/runtime/prompt-transport-mapping.ts`, and new untracked `src/extension/owned-turn.ts`. These changes are **not represented by HEAD**. Line references below describe the inspected working tree; concurrent edits can move them.
- Read both prior reports completely: `.pi/tmp/claude-host-research/local-port-analysis.md` and `semantic-gaps-analysis.md`. Their host-independent obligations remain useful, but their Claude-specific limits do not transfer to OpenCode.
- OpenCode released version **1.19.3**, local source `/home/thomasa/Projects/pi-theta/.pi/tmp/dual-host-research/opencode/source/anomalyco-opencode-e3c4eb2`. In the rest of this report `OC/` means this directory. Package versions agree in `packages/opencode/package.json:3`, `packages/plugin/package.json:4`, `packages/sdk/js/package.json:4`.
- Independently fetched release tag reference into `release-tag.json` beside this report: [GitHub ref v1.19.3](https://api.github.com/repos/anomalyco/opencode/git/ref/tags/v1.19.3) identifies commit **e3c4eb242585dcd77be1a867391b7c25fd47ce52**. Use source permalinks under `https://github.com/anomalyco/opencode/blob/e3c4eb242585dcd77be1a867391b7c25fd47ce52/`. The release object's `target_commitish` cached by the parent is different; it is not a replacement for resolving the tag.
- **SDK v2 is an export family, not OpenCode release 2.** Version 1.19.3 exports both default SDK and `@opencode-ai/sdk/v2` (`OC/packages/sdk/js/package.json:12-21`). Plugin input uses default SDK types/client, while provider hooks explicitly use v2 model/auth types (`OC/packages/plugin/src/index.ts:1-13,55-65,204-207`). Do not silently mix their generated signatures or assume `sdk-next` means stable v2 APIs.

## 1. What is reusable versus what is host integration

**Verified Theta boundaries:**

- `src/parser/theta-document.ts:26-103,149`: parser/document/type/schema/render/callable pipeline; this imports an extension-layer inert note channel, so directory boundaries alone do not define a standalone package.
- `src/runtime/statement-executor.ts` and `src/runtime/expression-evaluator.ts`: deterministic execution and values, not an agent prompt.
- `src/runtime/effectful-statement-host.ts:96-224`: query dispatch, decoding/validation, tools, child invocation, cancellation and checkpoints. This is the most useful execution adapter boundary.
- `src/runtime/query-tool-loop.ts:154-178`: explicit free turn, parallel tool batch and forced-response responsibilities.
- `src/runtime-root.ts:27-65`: checkpoint/schema/clock/filesystem/watcher/token-estimator/ID seams. **Not** the complete production constructor. `src/extension/production-producer-deps.ts:124-230` additionally requires host API/model registry, tool dispatch, child executable/env/result/session/placement and status collaborators.
- `src/parser/schema-lowering.ts:28,103-115` uses synchronous Node SHA-256; parser callable/import resolution uses Node path; frontmatter uses YAML; `src/seams/ajv-schema-validator.ts` uses AJV plus formats. Node/Bun hosting is plausible, but import compatibility and bundling are not proved merely by TypeScript support.

**Inference:** reuse parser/type/schema/evaluator, typed validation/repair, errors, wire/envelope, ceiling and cancellation machinery. Replace production composition, command registration, conversation/message adaptation, model channel, native tools, lifecycle, child bootstrap, and UI. OpenCode's server plugins are not the restrictive Claude Mods sandbox; there is no basis here for importing Mods' static `$` restrictions or ten-second hook budget. Conversely, no runtime compatibility probe has shown all transitive imports execute inside the release's plugin runtime.

## 2. Owned turns and settlement — most dangerous existing-session trap

### Theta contract

Current source is stricter than the old portability report:

- `src/extension/owned-turn.ts:22-99` pins the first matching newly enacted user entry, never retargets a later user, treats equal-text duplicates as ambiguous, and bounds the accepted message slice before foreign users. It rejects context-edited/projected spans when provenance cannot be maintained. The header explicitly says text is correlation, **not authentication**.
- `live-prompt-query-driver.ts:819-867,969-1186,1292-1301` gates admission, records per-send boundaries, tracks owned users across the query, detects interleaving, waits through start/end/idle/settlement separately, and refuses contaminated forced-response replay. A global idle flag is not a completion witness.
- `turn-settlement.ts:61-169` handles errors/aborts, tool-result terminal cases, and unanswered trailing compaction. `live-prompt-query-driver.ts:53-110,1050-1087` follows changing run signals across retries/compaction and defers cancellation classification until the owned attempt settles.

### OpenCode facts

- `OC/packages/opencode/src/session/prompt.ts:635-688` accepts caller-supplied message IDs and records assistant `parentID` at `:1181-1197`. This offers better correlation ingredients than matching text.
- HTTP `session.prompt`, `prompt_async`, `abort`, `messages`, `message`, `fork` exist in `OC/packages/opencode/src/server/routes/instance/httpapi/groups/session.ts:186-337`.
- **But** `prompt.ts:1343-1347` calls `state.ensureRunning`; `session/run-state.ts:88-94` delegates to a shared runner. `effect/runner.ts:115-135` returns the existing run's deferred result when already running. A prompt HTTP future is not automatically exclusive ownership of a newly started isolated turn.
- `prompt.ts:1356-1474` implements commands as template/shell expansion, a `command.execute.before` hook, then normal `prompt`. Hook output is only `{parts}` (`packages/plugin/src/index.ts:262-265`); there is no declared “handled, do not send normal prompt” return.

**Parity obligation / inference:** correlate with explicit user/message/assistant parent IDs, own admissions and retries, and classify any competing user/plugin/subtask injection. Prove no overlap before treating a synchronous HTTP prompt result as this Theta attempt's answer. An async API acknowledgement or `session.status=idle` alone is insufficient. A before-command hook executing an arbitrarily long interpreter then returning normally still allows the command's normal model turn; throwing to suppress it is not a documented clean command-handler API.

**Unresolved:** supported native interception that replaces a command with deterministic execution without an unwanted model turn; per-invocation exclusive session lease; race-free own-result selection after compaction/revert/removal. A TUI plugin command may provide another entry, but that must be assessed separately from server plugins and headless HTTP invocation.

## 3. Typed queries AND binder: genuine support, non-equivalent protocol

### Theta facts

- `query-tool-loop.ts:1-35,154-178,345-388`: free-phase tool rounds, each parallel batch counting once, followed by a forced named `__theta_respond_<slug>` tool. Forced response is exempt from `max_rounds`; typed `max_rounds:0` performs **no free-phase model call**. Committed effects are not rolled back.
- `src/extension/off-session-respond-dispatch.ts:173-276`: off-session full-message replay, exactly one tool, API-specific named `toolChoice`, signal and raw response/error handling, with one narrow degraded reissue when forcing is rejected. It does not write an extra conversation turn.
- `src/binder/binder-inference.ts:384-468` constructs another one-tool forced completion; `src/extension/binder-run.ts:698-741` resolves registry auth and calls `pi-ai/compat` complete. Binder is a separate structured model operation, not something solved by parsing slash arguments or enabling query output schemas.
- Theta still performs its own JSON-depth, schema, defaulting, decoding and repair/error classification at the boundary. Host schema validation is not a replacement for those semantics.

### OpenCode facts

- `OC/packages/opencode/src/session/prompt.ts:1243-1317`: `format.type=json_schema` injects `StructuredOutput`, requires a tool call, captures `message.structured`, breaks on capture and records a structured-output failure for normal completion without capture.
- `:1565-1594`: the capture tool uses AI SDK `jsonSchema`; validation precedes `execute`. This is real structured tool execution, not an LLM interpreting text as code.
- However ordinary resolved tools remain alongside `StructuredOutput` (`:1224-1251`) and `toolChoice` is **required**, not named-tool forcing (`:1285`). Disabling all other tools can narrow the effective choice, but is a separate necessary action.
- Plugin `chat.params` exposes sampling/output tokens/provider options, not arbitrary top-level tool choice, messages and tool-set replacement (`packages/plugin/src/index.ts:247-260`). No reviewed public stateless completion API matches Theta's off-session `complete(messages, tools:[respond], named choice)`.
- `session/llm/request.ts:149-161` deliberately sets function tools `strict:false` on OpenAI-family adapters. Local input validation and structured capture are real, but not evidence of provider strict structured-output enforcement.

**Inference:** fresh worker sessions with all effect tools disabled plus `format` can support a new structured model adapter. It still needs exact selected context/system replay, zero unwanted rounds, cancellation, schema compatibility, typed repair accounting and no unwanted user-session entries. A separate session is **off the user's session**, but is not the same stateless model request as today's responder/binder. Avoid advertising protocol parity solely because both produce JSON.

Keeping pi-ai as an external model channel is technically a hybrid option; it must use independently supported OpenAI subscription auth. Do not extract host credentials or imply the SDK client automatically confers authentication on arbitrary pi-ai calls.

## 4. Exact catalog visibility and native permission-aware code calls

### Theta facts

`live-prompt-query-driver.ts:855-867` installs exactly the pinned callable tool set (plus response tool where appropriate), never the ambient set, and restores it afterward. The callable snapshot includes schema information for load/admission checks (`src/extension/callable-pi-tool-resolver.ts:61-118`). Built-ins are actual Pi factories with Pi names/arguments/results (`:3-57,132-170`); extension tools without execute handles use a host-loop bridge (`src/extension/production-host-loop-dispatch.ts:14-52`). Current direct built-in context explicitly rejects fabricated nested execution (`callable-pi-tool-resolver.ts:149-164`).

### OpenCode facts

- Unlike the reviewed Mods API, OpenCode **does remove request tools**: `OC/packages/opencode/src/session/llm/request.ts:210-215` filters by explicit false entries and disabled permissions, and `session/llm.ts:317-319` passes resulting activeTools/tool map to the model.
- But omitted keys are not a closed allowlist. Enumerate/deny the complement, including dynamically registered/MCP tools; check wildcard permission semantics and registration races. `prompt.ts:1060-1066` converts input `tools` into **persistent session permissions**, overwriting them when nonempty. Do not treat this as an automatically scoped temporary tool vector.
- Experimental `tool.ids` and model/provider-specific schema `tool.list` are declared in `server/routes/instance/httpapi/groups/experimental.ts:151-175`. These are catalog APIs, not direct execution APIs.
- Native execution builds a tool context and invokes hooks/permission machinery (`session/tools.ts:53-123`; MCP wrappers `:392-423`). Plugin tools receive `sessionID`, abort and `ask` (`packages/plugin/src/tool.ts:1-48`). The reviewed HTTP surface exposes shell/command/prompt, **not a general native call-by-name endpoint for every catalog tool**.

**Obligation:** translate names, arguments, output content/image metadata and denials explicitly; freezing names alone is not tool portability. Do not bypass OpenCode approvals by importing a builtin implementation or running plugin `$` shell/fs code to imitate Pi calls. A custom Theta tool can govern its own operations via `context.ask`, but this is not proof it can invoke any native or MCP tool with identical hooks, policy and accounting. Tool schemas plus MCP support do not imply a direct execution handle.

**Inference:** exact visibility is achievable in principle with worker-owned session policy and frozen catalog, stronger evidence than for Claude Mods. Native existing-session install/restore races and deterministic native code-call dispatch remain unproved. A synthetic “make the model call the tool” prompt would be stochastic and is not an acceptable substitute; Theta's existing Pi bridge is a deterministic synthetic provider, not such prompting.

## 5. Child workers and typed returns

Theta children own their interpreters; the parent consumes a versioned `theta_result`, including typed wire data/enum metadata and error provenance, and fails closed on exit without an envelope (`src/runtime/subagent-json-driver.ts:1-23,58-102`; `subagent-envelope.ts`; `subagent-result-frames.ts`). Cancellation kills children; placement is separate from execution (`subagent-placement.ts:70-170`). Launch args carry host dialect/root/isolation/tool/model/thinking intent (`subagent-argv.ts:11-107,277-365`), authenticated parent environment, private launch/result channels and closure/hash validation (`subagent-child-hash-verify.ts`, `subagent-callable-hash.ts`).

OpenCode native `task` is a real child-session facility, not just prose: `OC/packages/opencode/src/tool/task.ts:136-159,197-224` creates/resumes a child, calls prompt and returns last text. Background completion can inject a new parent prompt (`:230-261`). **That native text return is not a Theta typed result envelope**, and automatic parent injection can violate Theta-owned turn windows.

**Inference:** implement deterministic child bootstrap around fresh OpenCode sessions/processes, explicit return serialization and independently correlated completion. Process workers simplify host liveness/finality/isolation; in-server sessions may work but require guaranteed abort/failure delivery and no unwanted parent turns. Mapping Pi argv to `opencode run` does not install a Theta parser/driver or enforce root/hash policies. Keeping existing Pi children unchanged is “OpenCode frontend with Pi workers,” not OpenCode-native execution. Project instruction trust and tool approval are distinct; never map trust suppression to blanket approval bypass.

## 6. Cancellation, transitions, compaction, budgets and observability

- Theta cancellation is invocation-scoped and propagates through query, binder, parallel batches, child process and parent teardown (`src/runtime/cancellation-core.ts`, `invoke-cancellation.ts`, `src/extension/extension-instance-shutdown.ts`). OpenCode abort is session-scoped and also cancels related background jobs (`OC/session/run-state.ts:73-85,112-145`). It needs an ownership guard before use in a shared existing session; aborting a foreign user turn to stop Theta is not parity.
- Theta knows host retries versus true cancellation and pending compaction; the new owned-turn code explicitly narrows safe relocation. OpenCode `prompt.ts:1150-1169,1321-1329` continues through compaction. Its plugin has compacting/autocontinue hooks (`packages/plugin/src/index.ts:301-340`), not Pi branch entries. Translate semantic states, not event names, and prove capture after compaction belongs to the intended query.
- Theta startup/shutdown/reload generation handling is extensive (`src/extension/factory.ts:297-435,608-669`; `session-swap-tripwire.ts:36-148`, `stale-ctx.ts:1-20`). An OpenCode server plugin can span multiple sessions and exposes event/dispose (`packages/plugin/src/index.ts:211-215`). Maintain per-session/per-invocation maps, listener teardown, stale-generation rejection, result-channel death and reconnect policy. Revert/fork/delete are not Pi session-shutdown events.
- Preserve deterministic ceiling order: invoke depth, round boundary, binder class retry, JSON depth; `src/runtime/ceiling-arbitration.ts:21-54,93-105`. OpenCode agent `steps` (`prompt.ts:1176-1177,1279-1285`) is not Theta max_rounds: it governs a whole native loop and adds a final-step prompt. Admission of a parallel batch must count once and finish accounting all committed sibling effects. Token estimates, binder usage and checkpoint timing need host adapters, not substitutions with a generic model maxTokens value.
- Imports need byte/path identity, realpath/symlink policy, cycle/memoization, closure binding, watchers and hot reload, not just JS module import. See `src/extension/import-resolution-kit.ts:61-149,182-230`, `parser/thetalib-resolver.ts`, `reload-wiring.ts`, `pass-parse-cache.ts`. This part is mostly reusable Node-side logic but still requires explicit roots/filesystem seams and independent deployment from pi-config.
- Theta notes, `theta_print`, progress/status/run cards and private child transcripts are observable behavior, not optional assistant prose (`src/extension/system-note-channel.ts`, `execution-status/*`, `print-tool.ts`). OpenCode server plugin declaration explicitly excludes a TUI entry on its server module (`packages/plugin/src/index.ts:73-77`); released source also contains a **separate TUI plugin runtime** (`packages/tui/src/plugin/runtime.tsx:12-59`, `api.ts:1-35`). Do not claim “no UI support,” but do not equate server events/toasts with registered Theta renderers or headless durable results. A separate TUI integration and a durable machine-readable result transport are different adapters.

## 7. Architecture classification

| Candidate | Classification | Evidence-based assessment |
|---|---|---|
| Server plugin command hook + HTTP driving user's current session | Native existing-session candidate | Real session APIs and filtering; clean deterministic command replacement, exclusive owned turns, scoped catalog restoration, exact off-session model channel and native code-tool dispatch not established. Highest semantic risk. |
| TUI command entry + server plugin/runtime | Native UI integration candidate | Could avoid command-template entry limitations. Requires separate released TUI API contract/probe, server coordination and headless alternative; does not by itself solve query/tool/model semantics. |
| Deterministic Theta runtime supervising fresh OpenCode sessions/processes | Isolated worker orchestration | Most plausible bounded first port. Own session policy, message IDs, cancellation and cleanup; must adapt typed capture/context/tool dispatch and child envelopes. Not integration into an existing native conversation. |
| Theta runtime plus custom client/frontend controlling OpenCode server | Custom frontend/embedding | Can serialize admission and retain authoritative invocation state; still uses released HTTP capabilities, not automatically internal loop ownership. Internal source imports or server patches would materially raise maintenance scope. |
| OpenCode command/skill/MCP tool launches existing Pi Theta | External launcher / hybrid | Potentially useful, but proves Pi runtime reuse, not OpenCode semantic portability. |

## 8. Portability is not unchanged authored-source compatibility

Pure computation, most type/schema/import language, deterministic control flow and error machinery can remain the same. Existing authored sources can still be nonportable because they name Pi built-ins and schemas, extension namespaces, OpenAI provider IDs/model APIs, `bind_model`, thinking values, session-control operations, placement/root settings or Pi-shaped result fields. A compatibility layer must map each or reject with a clear diagnostic. Do not silently reinterpret a model or grant broader native privileges to keep source apparently unchanged.

Subscription-specific warning: released `OC/packages/opencode/src/plugin/openai/codex.ts:12-15,441-493` implements ChatGPT backend routing and browser/headless Pro/Plus OAuth. Its static allowed-model set includes `gpt-6-sol` and `gpt-6-luna`, **not `gpt-6.1-sol`**. That is evidence of supported subscription-auth machinery, not proof of availability of the requested model or of arbitrary off-session adapters. No live model/auth verification was done. Do not select Claude as fallback or silently alias the requested model.

## Acceptance evidence required before a parity claim

1. Real native entry runs the interpreter without a model parsing Theta or an extra command-template turn; separately prove headless behavior.
2. Correlate explicit message IDs and parent IDs under simultaneous foreign prompts, equal text, queued input, compaction, interruption and retry; refuse ambiguity without cancelling foreign work.
3. Observe actual request tool catalogs for empty/closed allowlists, dynamically added/MCP tools and single structured responder; verify permissions are restored or worker-isolated.
4. Binder and typed `max_rounds:0` each perform only the intended model operation; prove context/privacy, structured validation, repair budgets, failure reasons and cancellation precedence.
5. Native code-side built-in and MCP calls traverse the intended approvals/hooks; prove denials cannot be bypassed through plugin execution.
6. Child return is validated typed wire data from a deterministic child interpreter; failures/kills/missing envelopes fail closed, background completion does not introduce a foreign parent turn.
7. Validate import/root/hash closure, runtime ceilings, session transition/reload cleanup and durable UI/headless observables.

**Bottom line:** OpenCode 1.19.3 offers useful released building blocks, including capabilities absent from the earlier Claude review. The adversarial conclusion is nevertheless a new host adapter with explicit parity tests—not an unchanged production composition, not a mere SDK import, and not yet proof of stable authored Theta source across hosts.
