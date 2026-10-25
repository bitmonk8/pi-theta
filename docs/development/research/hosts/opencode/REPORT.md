# OpenCode as a Theta host — released-product investigation

> **Developer research, not end-user documentation or an accepted specification.**
> Relocated from `.pi/tmp/dual-host-research/opencode/REPORT.md`. Historical release/source pins and evidence limitations remain in force.
> Unless a link points to another tracked document, experiment paths and reproduction instructions refer to the original local evidence workspace, `.pi/tmp/dual-host-research/opencode/`; downloads, caches, scripts and raw logs remain gitignored and are not required to read this report.

**Research date:** 2026-10-19 UTC\
**Host:** OpenCode **1.19.3**, stable/latest, released 2026-10-16\
**Scope:** research and disposable probes only; no Theta implementation or project/configuration changes.

## Executive verdict

**OpenCode is a credible host-adapter target, and native integration into its existing interactive TUI conversation is genuinely possible. Full Theta semantic parity through the public released interfaces is not established.** This is not a case where the only integration is an external launcher:

- In the actual released executable, a JavaScript **TUI plugin registered a deterministic command callback**, attached to a session with a completed conversation turn already present before the TUI started, read that selected session's ID, and drove **two successive native model turns in that same session** using its supplied SDK client. Six messages persisted (the original pair plus two new pairs); both new requests retained the original context, with no command-template fallthrough turn. The model endpoint was a loopback stub, not OpenAI.
- Executable probes also verified server-plugin loading, a custom JS tool, native structured-output capture, actual removal of tools from model requests, native read permission approval/rejection, asynchronous admission, cancellation, and disposal.
- A critical negative probe reproduced shared-session settlement: **two overlapping prompt calls both resolved to the later user's assistant result**. A resolved `session.prompt()` is not proof of ownership of that result.
- The newer generated `client.v2.session.wait()` operation really returned **HTTP 503, “Session wait is not available yet.”** Its existence in the released SDK is not evidence of a working completion barrier.

**The largest remaining parity blockers are:**

1. No public general **deterministic, permission-aware native tool invocation** API was found. Listing schemas, custom tools' `context.ask`, explicit-user `session.shell`, and native LLM-selected tool execution are different capabilities. Substituting plugin filesystem/shell access would bypass the intended native security boundary.
2. The public prompt API owns a **whole native agent loop**, whereas Theta controls free-phase round admission, parallel-batch accounting, and a separate forced-response phase. No released public single-step/loop-takeover contract matching that boundary was found.
3. Structured output is real but is a **session-loop `StructuredOutput` tool with `tool_choice: required`**, not Theta's stateless, named-tool, exact-context responder/binder protocol. Singleton exposure can be achieved, but isolation, replay, error/repair budgets and privacy require an adapter and proofs.
4. Shared-session admission, persistent permission mutations, session-wide abort, compaction and concurrent user/background input need an ownership design. Existing-session multi-turn drive is demonstrated; safe equivalence to Theta's owned-turn semantics is not.

**Recommendation:** first investigate a bounded **Theta runtime supervising fresh OpenCode worker sessions/processes**, optionally with a native TUI control surface. Worker ownership simplifies concurrency and temporary policy, but **does not itself fix** native code-tool invocation or exact query-loop control. An owned custom frontend can enforce admissions more strongly. Full native parity likely needs a supported executor/step API, a carefully proved deterministic native-loop bridge, or host cooperation/fork. Do not promise an unchanged production composition or unchanged tool/model-specific Theta sources.

## 1. Release pin, product identity, and generation discipline

### Authoritative release facts

| Item | Pinned observation |
|---|---|
| Product/repository | OpenCode, [`anomalyco/opencode`](https://github.com/anomalyco/opencode), not the unrelated older Go project or a similarly named package |
| Stable release | [`v1.19.3`](https://github.com/anomalyco/opencode/releases/tag/v1.19.3), GitHub `draft:false`, `prerelease:false` |
| GitHub publication | `2026-10-16T12:31:52Z` |
| Actual tag commit | **`e3c4eb242585dcd77be1a867391b7c25fd47ce52`** |
| Release metadata trap | `target_commitish` is `60c9be092129745688bb3c3a752affc6cbd66ede`, **not** the resolved tag commit |
| npm CLI | `opencode-ai@1.19.3`, npm `latest`; published `2026-10-16T12:32:00.280Z` |
| npm SDK/plugin | `@opencode-ai/sdk@1.19.3`, `@opencode-ai/plugin@1.19.3`; both npm `latest`; published at `12:32:08.438Z` / `12:32:47.022Z` |
| Executable tested | Official `opencode-linux-x64.tar.gz` release artifact; `opencode --version` and `/global/health` both returned **1.19.3** |
| Platform/runtime | Linux x64 executable, bundled runtime; Node v22.23.3 used for published SDK client probe; source root pins `bun@1.3.14` |

Raw release/repository/tag/npm metadata, release binary, source archive, exact SDK/plugin tarballs and checksums are retained. npm SDK/plugin **SHA-512 integrity matched** registry metadata. Release asset/source SHA-256s are recorded for reproducibility, not represented as an independent publisher signature. The repository default branch was `dev`; it was **not** used as release evidence. npm `next`, `beta`, `dev`, `tui-v2` and snapshot tags are not stable release pins.

Authoritative API inputs: [latest release](https://api.github.com/repos/anomalyco/opencode/releases/latest), [tag ref](https://api.github.com/repos/anomalyco/opencode/git/ref/tags/v1.19.3), [CLI registry](https://registry.npmjs.org/opencode-ai), [SDK registry](https://registry.npmjs.org/@opencode-ai%2fsdk), [plugin registry](https://registry.npmjs.org/@opencode-ai%2fplugin).

### Four different meanings of “v2” must not be conflated

1. **Product release is 1.19.3.** Files named `v2` really are shipped inside this release; excluding them indiscriminately would also be wrong.
2. The published SDK has **root** and **`/v2`** exports. Their generated parameter shapes differ. The TUI consumes `@opencode-ai/sdk/v2`, whose ordinary `client.session.prompt` still calls the established **`/session/...`** routes. Server plugin input uses the root SDK client. Our executable TUI probe used the flat `/v2` client signatures; the server plugin used its supplied root client.
3. The expanded client also has **`client.v2.session`** methods targeting newer **`/api/session/...`** routes. Those are a separate execution/domain API. At least `wait` and `compact` are explicitly unavailable in the release implementation. The wait failure was reproduced through HTTP and the exact published SDK.
4. Plugin package exports root v1-style server hooks, **`/tui`**, and **`/v2/promise` / `/v2/effect`** domain-transform APIs. The latter expose catalog/agent/command/integration/reference/skill/AI-SDK hooks, not a current-session loop/executor API. They must not be treated as synonyms for the TUI plugin or the legacy prompt lane. `sdk-next` source presence is not certification of a working embedding API.

Even documentation within the tag is not a substitute for artifact declarations and execution: cached `docs/sdk.mdx` describes an `outputFormat` option in places, while the exercised released prompt route/declarations use **`format`**. Source implementation and exact `.d.ts` files controlled the probes.

## 2. Baseline, boundaries, and evidence strength

Theta working tree was read-only at HEAD **`a21bd1b27b09efdd7f71c7484b3f6d1fcd1dd299`**, package **0.496.0**. It was already dirty. Baseline included edits to `live-prompt-query-driver.ts`, `turn-settlement.ts`, `prompt-transport-mapping.ts`, relevant docs, and untracked `owned-turn.ts` / b0503 tests. These are concurrent work, **not this investigation**. Further untracked b0503 test files appeared during research. See `baseline/git-status-start.txt`, `git-status-end.txt`, `status-delta.diff`, `head.txt`, and selected end-of-research source hashes. Local Theta line citations describe the inspected working tree, not necessarily pristine HEAD or future concurrent revisions.

Two independent full-tool `theta-host-research-delegate` workstreams were launched from `dual-host-research`, assigned disjoint subdirectories, and **both wait-collected**. Their reports are under `delegates/release-api/` and `delegates/semantics/`. Their static-only uncertainties are updated by the executable evidence here; in particular, TUI command/multi-turn drive is now probed, and model-filter logic is more permissive than a static allow-set alone suggests.

Evidence labels used below:

- **X:** actual 1.19.3 executable / published SDK exercised, provider-free loopback model.
- **A:** exact published artifact metadata/declarations.
- **S:** release-tagged implementation or actual Theta working-tree source.
- **I:** inference/design judgment.
- **U:** unverified, especially provider-backed behavior.

No probe used a live provider. The 20 final model requests went to a local OpenAI-compatible stub. Native tool execution, persistence, plugin loading, UI callback execution and permissions were **real**; model intelligence, OpenAI auth, backend schema support, token usage and real transport failures were **not** tested. Stub usage numbers are fabricated fixture values.

## 3. Capability matrix

| Theta requirement | Released OpenCode capability | Assessment / strength |
|---|---|---|
| Execute deterministic JS/TS extension code | Server plugins, custom tools, separate TUI plugin runtime; real `.mjs` imports of `node:fs` worked | **Yes (X/A/S)**. TypeScript paths supported by loader/source; this probe did not load Theta or test the complete TS dependency graph. |
| Native current-session command entry | TUI keymap callback, selected route/session, shared SDK client | **Yes (X)**. Tested command dispatch, not typing `/theta args` or binder UX. |
| Headless executable custom slash entry | Server commands are templates; before hook modifies parts then ordinary prompt runs | **Not equivalent (S)**. No clean handled/result field found. |
| Multiple queries in existing conversation | Two sequential native prompts from one TUI callback, same selected session | **Yes for basic drive (X)**; no ownership/exclusivity guarantee. |
| Reliable per-query completion | Synchronous legacy prompt settles shared loop, messages have IDs/parentIDs/errors | **Qualified (X/S)**. Concurrent futures returned the same later answer; newer wait returned 503. |
| Exact free-phase step/batch control | Native loop processes tools and continues internally | **Gap (S/U)**. No public Theta-equivalent next-step/run-batch boundary found. |
| Typed query result | JSON-schema format injects native `StructuredOutput`; `message.structured` | **Real (X/S)**, but requires protocol adaptation. |
| Binder / stateless named forced response | No reviewed public exact-context stateless completion API matching Theta | **Gap (S/U)**. Fresh structured sessions are a candidate, not parity proof. |
| Exact request tool exposure | False entries and disabled permissions remove tool definitions | **Yes (X/S)**, not just blocking execution. Complement enumeration and policy scoping remain necessary. |
| Per-query temporary tools | Deprecated prompt `tools` converts to session permissions | **Dangerous mismatch (X/S)**. Policy persisted across subsequent prompts; no automatic save/restore scope. |
| Deterministic native code-tool calls | Public catalog list; internal native executor; no generic public invocation handle | **Main gap (A/S)**. Native model-driven read approvals/rejections verified (X), not arbitrary code invocation. |
| Custom tools/permissions | Tool context includes abort/metadata/ask; definition and execution hooks | **Yes (X/A/S)**. Own tool permission requests do not confer arbitrary native tool invocation. |
| Child isolation / parallel typed returns | Fresh sessions, parent IDs, native task/background jobs; text returns | **Building blocks (S)**. Theta child interpreter/envelope/liveness/parallel accounting absent. |
| Cancellation | Legacy session abort and cooperative tool signals | **Yes (X/S)**; session-wide, may affect foreign/background work. |
| History, transitions, compaction | Durable messages/parts; fork/revert/delete; compacting/autocontinue hooks | **Available ingredients (S)**. Provenance, retry, relocation and cancellation parity untested. |
| Model/provider IDs and OpenAI subscription | `provider/model`, built-in browser/headless ChatGPT Pro/Plus OAuth | **Documented and implemented (S)**; preferred model catalog present, actual entitlement/login/live turn **U**. |
| Runtime/import/budgets | Trusted runtime plugins, dynamic import, Node-compatible APIs; package install/cache | **Promising (X/S)**, not a sandbox or a proven complete Theta composition. |
| UI / packaging | TUI lifecycle/state/slots/dialogs/commands; native CLI and desktop distributions; SDK server launcher | **TUI verified (X)**; browser/desktop extension parity and redistribution portability **U**. |

## 4. What actual Theta source requires

The old README status was not used as the semantic contract. Prior Claude reports were read as grounding only; Claude-specific sandbox/model limitations were not transferred to OpenCode.

### Reusable language and engine seams

The useful graph is parser/document/type/schema/import preparation → deterministic statements/values → effectful host → model/tools/children. In this tree:

- `src/parser/theta-document.ts:26-103,149` composes parsing, frontmatter, types, schema and callable checks. It imports an extension note channel: directory boundaries alone do not define a standalone package.
- `src/runtime/statement-executor.ts`, `expression-evaluator.ts` implement computation. `effectful-statement-host.ts:96-224` is a useful injected model/tool/child/cancellation boundary.
- `src/runtime-root.ts:27-73` holds seams, but **is not** a complete ready-to-embed runtime. `src/extension/production-producer-deps.ts:124-230` also requires Pi APIs/model registry, tool executors, placement, child launch/environment/result channels and UI/status collaborators.
- Node synchronous SHA-256/path operations, YAML frontmatter and AJV/formats are actual dependencies (`parser/schema-lowering.ts:28,103-115`, parser callable/import resolvers, `seams/ajv-schema-validator.ts`). OpenCode's trusted Node/Bun-compatible plugin environment is promising for these; no complete bundle/import of Theta was attempted.
- Production binder directly imports Pi session-context/model completion facilities (`extension/binder-run.ts:13-18,698-741`). The Pi tool resolver imports SDK built-in factories. These are real adapter work, not type aliases that disappear at runtime.

### Query semantics are finer-grained than “ask the agent”

`src/runtime/query-tool-loop.ts:1-35,154-178` requires three operations: next free-phase turn, run its parallel batch with committed side effects, and forced response. A **parallel batch counts as one round**. The forced response is exempt. A typed query with **`max_rounds:0` issues no free-phase provider call**. Ceiling/depth/validation/repair/error precedence and no-rollback accounting are Theta-owned.

Current `off-session-respond-dispatch.ts:170-295` replays selected messages to Pi AI `complete` with **exactly one named responder tool**, provider-specific forcing, abort/auth, and raw response classification. A narrow model-level forcing rejection permits one degraded reissue. Binder has a separate one-tool inference protocol (`binder/binder-inference.ts:384-468`). OpenCode schema capture cannot simply replace these and discard depth/defaulting/repair/cancellation semantics.

The current dirty `extension/owned-turn.ts:22-99` and `live-prompt-query-driver.ts:819-867,969-1186,1292-1301` also strengthen provenance: pin the enacted user, refuse foreign/equal-text ambiguity, bound replay before foreign input, distinguish idle from settled, and handle retry/compaction. `turn-settlement.ts:61-169` handles abort/error/tool-terminal/trailing-compaction cases. The concurrency probe demonstrates why an OpenCode adapter must preserve these obligations, preferably using explicit message IDs rather than text matching.

### Source stability is not host tool/model portability

Pure computation and most type/schema/import semantics can remain unchanged. Existing sources naming Pi `read/grep/find/ls/bash/edit/write`, extension namespaces, Pi argument/result shapes, provider API IDs, `bind_model`, thinking levels, session operations or placement/root policies cannot automatically remain portable.

`extension/callable-pi-tool-resolver.ts:3-57,61-118,132-195` is concrete Pi implementation, not a universal tool ABI. Execute-less extension tools currently use a deterministic synthetic-provider/native-loop bridge (`production-host-loop-dispatch.ts:14-52`). A new host needs deliberate schema/result/permission mapping or explicit nonportable-source diagnostics. Never silently alias a model, reinterpret a thinking level, or grant broader tool privileges to make old source appear compatible.

## 5. Native extension and session orchestration

### Native TUI entry is demonstrated, not conjectural

The released TUI plugin contract exposes current route, shared client, session/message/part/status/permission state, keymaps, dialogs, slots, renderer and disposal. The implementation uses the actual UI `sdk.client`, not a newly launched engine. Our real executable attached to a server session containing a completed baseline conversation turn, loaded `tui-plugin.mjs`, registered `theta.research.probe`, dispatched it, and the callback awaited two successive `client.session.prompt` calls in that session. Both requests preserved the baseline context.

**Boundaries:** command dispatch was programmatic through the real keymap. We did not type a slash command with arguments or verify binder prompting; TUI command callbacks do not by themselves demonstrate a Pi-equivalent slash-argument ABI. The test used the native TUI, not browser/desktop plugins. It was not an actual Theta runtime, and the model was a stub. These qualifications do not negate the verified native-existing-session integration.

### Server command templates are a different entry

Server `command.execute.before` has `{command,sessionID,arguments}` and mutable `{parts}`, not `{handled,result}`. Implementation expands templates and embedded shell expressions, calls that hook, then invokes ordinary prompt. A long interpreter in the hook followed by normal return adds the default agent turn. Throwing to suppress it is not a documented clean command-result protocol. Our server command probe confirmed hook execution and ordinary model fallthrough.

TUI callbacks can avoid this entry limitation. Headless invocation still needs a distinct supported runtime entry/protocol; do not equate the two registrations.

### Settlement and concurrency

Legacy `POST /session/{id}/message` persists the user then joins/starts a session loop. Assistant records have `parentID`, finish/error fields and parts. `noReply:true` stored a user without issuing a standalone model request. `prompt_async` returned 204 before the slow stub settled.

The shared runner returns the running deferred when already active. Experimentally, the slow submission and a foreign submission 0.5 seconds later both returned **the same assistant ID, parented to the foreign user**. Both complete turns existed in history. This is a session-drain behavior, not automatically a bug, but invalidates “await prompt means my answer.” The adapter must serialize its own sends, pin explicit message IDs, inspect durable history/errors, and define a policy for simultaneous humans, plugins and background jobs.

The newer wait route returned 503 through raw HTTP and the published SDK. SDK default error handling returned an error value; `throwOnError:true` threw. Cancellation can also resolve a prompt using a last-assistant fallback in source. Neither resolved Promises nor global idle events prove successful owned completion.

### Exact query-loop control is still unproven

The native loop resolves tools, executes them and continues until native termination/compaction. `agent.steps` is not Theta's hard batch-round ceiling: release source uses it to inject `MAX_STEPS_PROMPT`, with ordinary tools still supplied. Plugin `chat.params` exposes sampling/output tokens/provider options, not a public “return this one model step and leave batch dispatch to Theta” operation.

Counting tool hooks alone does not reproduce one-round-per-parallel-batch admission, final responder exemption, fail-closed exhaustion, or committed-sibling accounting. This is a parity gate for **workers too**, not just interactive sharing.

## 6. Structured output, binder, and exact tool catalogs

### What the executable actually did

With `format:{type:"json_schema",schema,...}`, the native loop added `StructuredOutput` and sent `tool_choice:"required"`. A schema-conforming stub tool call produced `info.structured:{answer:42}` and a completed native tool part.

- With an ordinary tool enabled, request tools were **`[probe_echo, StructuredOutput]`**. “Required” can select either; it is not named forcing.
- With other tools removed, request tools were **exactly `[StructuredOutput]`**, still `required`, and capture succeeded. This is a useful real building block for an isolated responder/binder adapter.
- A stub that deliberately ignored the required schema tool produced **HTTP 200 with `StructuredOutputError` in the assistant record**, not a rejected request. Despite `retryCount:1`, this plain-text ending surfaced `retries:0`; the inspected path records failure directly. Do not count that option as Theta's repair protocol.
- Blanket denied permissions also filtered out `StructuredOutput` in the initial exploratory probe. Explicit permission for the synthetic tool fixed the setup. That first failure was our configuration, **not** evidence that OpenCode schema capture is broken.

This API performs a normal native session operation, writes history and adds OpenCode system/environment/instruction context. A fresh session is outside the user's transcript, but is not automatically a stateless exact replay of Theta's context. OpenAI-family request preparation also sets function `strict:false`; local schema tool validation is not evidence of backend strict-schema enforcement. Arbitrary schema/depth/defaulting, invalid tool arguments, refusals, overflow, repair accounting and provider forcing rejection remain unverified.

### Exposure versus denial

The final request log proves denied/false tools were **absent from request definitions**, not merely advertised then refused. A false `probe_echo` entry produced an empty tool request. However the prompt implementation converts any nonempty `tools` map into **persistent session permission rules**, replacing the session rules. The next prompt, with no `tools` override, still had no tool; a later true restored it.

Omitted keys are not a closed allowlist. A Theta adapter must enumerate/freeze the full model-specific native/plugin/MCP catalog and deny the complement, account for dynamically added tools, and avoid overwriting independent user rules. **Do not use `tools:{x:true}` as an innocuous exposure switch**: it creates an allow rule and can change policy. Save/restore in a shared session is race-prone; worker-owned policy is safer. The synthetic structured tool needs explicit consideration in that closed set.

Server tools are collected into instance state from tool files and plugin hook objects. No public arbitrary live register/unregister API was identified. TUI command keymap layers can be registered/unregistered dynamically. `tool.definition` can mutate definitions, but is not a demonstrated dynamic registry/step-control API. A hot-reloaded Theta command/tool discovery design requires more than startup configuration.

## 7. Native tool execution and permission boundary

Release internals construct native tool contexts with message/call IDs, signal and merged agent/session permissions, invoke hooks, execute, normalize attachments and record results. Custom plugin tools receive `ask`/abort and can use native permissions for **their own** operations. The public experimental tools API lists IDs and schemas. No reviewed public plugin input/tool context/SDK method exposes arbitrary `callNativeTool(name,args)`.

We verified the real native path independently of this absence: a local stub requested **native `read`** of `probes/work/sentinel.txt`; OpenCode published a pending permission. Reply `once` allowed the read and returned the sentinel through native tool history. In a separate session, reply `reject` produced a native error part, **“The user rejected permission to use this specific tool call.”** The prompt still resolved HTTP 200. This proves native approvals/rejections work for model-driven calls; it does **not** prove deterministic code-side dispatch of an arbitrary tool.

**Unsafe non-solutions:**

- `PluginInput.$` or Node `fs` can perform operations but are trusted plugin privileges, not the native tool's policy/accounting.
- `session.shell` is an explicit-user shell path that spawns a process and records parts; its implementation does not call native `Permission.ask`. It is not a drop-in permission-aware `bash` invocation.
- Asking a model to call a tool by name is stochastic and is not deterministic Theta code execution.
- Importing internal executors is outside the published plugin/SDK contract and requires version coupling and the real host context; it is not permission parity by name alone.

A **deterministic synthetic provider/native-loop bridge** analogous to Theta's Pi bridge could be investigated, because configurable provider packages exist and native execution would retain its approvals. This is an architecture hypothesis, not a demonstrated public invocation API: prove request/response correlation, no unintended extra tools/turns, metadata, abort, history/model restoration and denial before relying on it. It must not become a permission-bypassing sidecar.

A further declaration trap: root plugin types advertise `permission.ask`, but the release investigation found no corresponding plugin trigger in the native permission implementation. Use observed permission events and supported reply APIs; do not assume the hook is wired merely because it type-checks.

## 8. Independent workers, typed returns, transitions, and budgets

### Workers and parallelism

Fresh OpenCode sessions with separate IDs/parent links are useful, and the native task tool creates/resumes child sessions. That task path returns final **text**, not Theta's validated return envelope. Background completion can introduce parent prompts, which can contaminate an owned turn.

Theta's child boundary includes deterministic child interpreter/bootstrap, root/hash/callable closure validation, authenticated parent environment, liveness/kill handling, typed `theta_result` serialization, return provenance and fail-closed missing-envelope behavior (`subagent-json-driver.ts:1-23,58-177`, `subagent-envelope.ts`, `subagent-argv.ts`, `subagent-placement.ts:70-218`). Native agent text returns are not that contract.

Supervising fresh worker sessions/processes can provide parallelism and isolate transcript/policy, but a real Theta child bootstrap and typed channel must still be built. We did not test parallel worker scheduling or typed child returns. Existing Pi workers launched from an OpenCode command would be a useful **hybrid launcher**, not OpenCode-native Theta execution.

### Cancellation, compaction, lifecycle

Our `prompt_async`/abort test stored a completed assistant with `MessageAbortedError`. Source cancels the session runner and related background descendants. Theta cancellation is invocation-scoped and propagates through binder/query/tool batches/children; an adapter must not abort a foreign human turn merely because a Theta was cancelled.

Legacy compaction is integrated into the native loop and has plugin compacting/autocontinue hooks. Durable messages, parts, fork/revert/unrevert/delete/edit operations exist. None has been proved equivalent to Pi chronological/branch entries, owned replay, unanswered compaction, context-edit provenance or retry/cancellation classification. The **new** `/api/session` `compact` operation is separately unavailable in source; do not confuse that with legacy compaction support.

A server plugin can serve multiple sessions; keep per-invocation state and generations. Session switching/revert/fork/delete are not automatically Pi teardown events. Real TUI disposal was observed. Source invokes event hooks without awaiting their returned Promises, so event callback completion is not a host settlement barrier. Listener cleanup, stale contexts, reconnects, worker death and run finality need explicit designs.

### Runtime, imports, budgets, and UI

The executable loaded executable JS plugins with `node:fs`, timers and ordinary async functions; it is not the restrictive Claude Mods sandbox. Loader uses dynamic imports, distinguishes server/TUI entrypoints, and applies npm plugin compatibility checks; local file plugins bypass that version gate. A module cannot default-export both `server()` and `tui()` in the v1 object format: use separate entries/package exports.

No comparable ten-second sandbox hook budget was found in the reviewed OpenCode contract; that is **not** a guarantee of unlimited safe execution. Trusted in-process plugins can block the host, retain memory, or ignore cancellation. Long work needs lifecycle cleanup and cooperative cancellation. Plugin timeouts are not Theta language ceilings. Preserve depth, round, binder retry, JSON depth, cancellation precedence, token/accounting and no-rollback semantics rather than substituting `maxOutputTokens` or native agent steps.

Theta imports also require source identity, realpath/root/symlink/cycle rules, closure binding, memoization and reload/watch semantics (`import-resolution-kit.ts:61-149,182-230`, `thetalib-resolver.ts`, `reload-wiring.ts`). JS import support does not implement these language rules.

TUI slots/dialogs/keymaps/status state offer a plausible home for Theta notes, print/progress and run cards. They do not automatically provide Pi custom-message rendering or durable headless result channels. Desktop/browser UI integration and packaged plugin loading were not tested; native desktop distributions do not imply TUI plugin compatibility in those UIs.

## 9. OpenAI model references, subscription authentication, and distribution

Released docs recommend ChatGPT Plus/Pro for OpenAI. The built-in Codex auth plugin implements both **browser** and **headless device** OAuth, refresh through supported host auth storage, ChatGPT account headers, and routing to the ChatGPT Codex responses endpoint. Release WebSocket transport is opt-in on stable; pre-release defaults differ. Do not infer subscription behavior from an API-key-only OpenAI adapter or from development transport defaults.

The allowed-model set explicitly includes `gpt-6-sol` / `gpt-6-luna`, but that is **not the whole policy**: `codex.ts:289-324` also admits model IDs matching GPT major > 5 (subject to exclusions/pro reasoning mode). Thus **`gpt-6.1-sol` is admitted by that release filtering logic if cataloged**. A separately fetched public `https://models.opencode.ai/api.json` includes **`openai/gpt-6.1-sol`**, tool calling and structured output. This current catalog is network-updated data, not an immutable release promise or subscription entitlement proof. It corrects any inference that absence from the short static allow-set means the preferred model is categorically unsupported.

**Live status:** no supported OpenCode login was configured in the isolated fresh HOME. No personal auth files were read/copied, no Pi/Codex tokens extracted, and no OAuth login or remote model request was attempted. We therefore verify supported **host auth machinery + model selection/filtering**, not the operator's actual entitlement or a provider-backed turn. A future bounded test must use OpenCode's own supported login under this isolated workspace, the exact preferred OpenAI model, and a deny-all tool policy; it must never fall back to Claude. SDK access to the server does not grant an arbitrary sidecar the server's provider credentials.

Distribution observations:

- Official release artifacts avoid global installation and include platform-specific CLI binaries. The npm `opencode-ai` package is a wrapper/distribution route, not the JS interpreter to import for embedding.
- `createOpencode()` / `createOpencodeServer()` in the published SDK **launch an `opencode serve` executable** via `cross-spawn`; `createOpencodeClient()` connects by HTTP. This is process orchestration/client-server embedding, not a documented in-process agent engine constructor. The launcher defaults, PATH, cwd/environment and process shutdown must be controlled. We exercised the exact published client, not the launcher.
- Plugin/config loading can install dependencies. Even our local plugin probe created an isolated config `package.json` pinning `@opencode-ai/plugin:1.19.3`, a lockfile and `node_modules`. This happened **under `probes/config/opencode/`**, not the project. Reproducibility needs pinned dependency/peer versions and cache/network policy, not just one plugin source file.
- Package `@opencode-ai/plugin@1.19.3` depends on SDK 1.19.3, Zod 4.1.8, Effect `4.0.0-beta.83`, AI SDK provider 3.0.8; SDK has `cross-spawn` 7.0.6. TUI plugins also couple to optional OpenTUI/Solid peers. Test version compatibility, package exports, platform artifacts and upgrade policy deliberately.
- The disposable server bound only loopback and warned that its HTTP server had no password. A deployed authenticated/local server boundary is separate from model-provider OAuth; do not expose an unprotected control API on a network interface.

## 10. Verified experiments and honest negative paths

Run scripts, complete latest logs, request bodies and assertions are retained in `probes/`. **28 assertions passed**, with **20 loopback model requests** in the final run.

| Probe | Real boundary exercised | Result / limitation |
|---|---|---|
| Official binary version/health | Release CLI/server | Both 1.19.3 |
| Executable server plugin + tool | Dynamic import, plugin hook/tool registry/native loop | JS plugin loaded, Node import worked, tool executed and continuation received its result |
| Context-only prompt | `noReply` persistence | User stored, no standalone model call |
| Schema mixed catalog | Native format/schema tool | Structured payload captured; tool request still included ordinary tool |
| Schema singleton catalog | Filtering + required capture tool | Exactly `StructuredOutput` in actual request, payload captured |
| Schema noncompliance | Stub ignores required tool | HTTP 200; durable `StructuredOutputError`, retries 0 |
| Closed visibility / restoration | Actual request JSON + session read | Empty request tools after false; denial persisted next turn; explicit true restored |
| Concurrent same-session submissions | Real native runner and persistence | Both futures resolved the same later assistant; explicit foreign parent ID |
| New API wait | Raw HTTP + published SDK `/v2` client | 503 unavailable; default SDK returned error value, opt-in throwing path threw |
| Async/abort | Real session runner | Async accepted 204; abort stored `MessageAbortedError` |
| Native read allow/deny | Real native permission queue/reply/read tool | Once read own sentinel; reject recorded explicit native tool error |
| Real attached TUI plugin | Actual terminal frontend, shared client, keymap callback, lifecycle | Two sequential turns in selected preexisting conversation; six persisted messages including baseline, original context retained, disposal observed |

The model stub determines text/tool calls; it does not prove real OpenAI streaming, tool choice compliance, schema behavior, billing or subscription auth. The native read test is model-driven execution, **not** code-side invocation. No Theta source was parsed/executed by OpenCode in these experiments.

Initial exploratory logs are separately preserved in `probes/exploratory/`. Two mistakes were investigated rather than attributed to production: blanket deny also hid the synthetic schema tool; and POSTing a guessed `/tool/execute` route timed out in fallback handling. The latter is not evidence about an actual invocation endpoint. The bounded absence claim comes instead from published SDK/OpenAPI inventories and implementation. Final probes inspect the real tool routes and do not use that guessed route.

## 11. Feasible architectures and decisive next gates

| Architecture | Classification | Tradeoff/verdict |
|---|---|---|
| Native TUI plugin + Theta engine + current-session SDK | **Native existing conversation** | Entry and basic multi-query drive verified. Best native UX; hardest ownership, policy restore, tool dispatch, step control and compaction parity. Not currently certified. |
| Deterministic Theta supervisor + fresh OpenCode sessions/processes | **Harness workers** | Most credible first bounded host adapter. Own admissions, history and cancellation/policy. Still needs model-phase/tool-executor adapters and real typed child protocol. |
| Theta-owned frontend/runtime + OpenCode server | **Custom frontend / client-server embedding** | Can prohibit conflicting admissions, retain invocation state and provide UI/result channels. Public API gaps remain; not an extension controlling the ordinary interactive UI. |
| Version-pinned internal executor adapter / host patch | **Internal integration or fork** | Can plausibly expose exact permission-aware executor/step seam. Higher maintenance and explicit version coupling; not a public-plugin parity claim. |
| OpenCode tool/command launches existing Pi Theta | **Launcher/hybrid** | Useful orchestration, but leaves semantics/auth/tools in Pi; does not demonstrate OpenCode-native Theta. |

Prioritized acceptance gates, before implementation commitment or a portability claim:

1. **Native deterministic code-tool invocation:** one builtin and one plugin/MCP tool, with exact arguments/results, native allow/ask/deny/hooks/history and cancellation. Either obtain a supported executor API or prove a deterministic native-loop bridge. Never replace this with plugin shell/fs bypass.
2. **Model-phase control:** typed `max_rounds:0`, one free-phase parallel batch, hard exhaustion, exempt forced response and all committed sibling results. Prove no hidden native turns and no model-interpreted Theta.
3. **Responder AND binder:** singleton exposure, selected context/system replay/privacy, no extra user-session entries, schema depth/defaulting/repair accounting, refusal/overflow/forcing-rejection/abort. Fresh structured sessions are a candidate test, not assumed parity.
4. **Owned existing-session turns:** explicit message/parent IDs under simultaneous humans, queued/equal text, background injection, compaction/revert and cancellation; refuse ambiguity without aborting foreign work. The reproduced drain behavior is the starting adversarial fixture.
5. **Policy isolation/restoration:** empty catalog, closed complement, dynamically appearing MCP/plugin tools, synthetic responder permission, and no elevation of user-denied tools. Prefer worker ownership until shared restore races are solved.
6. **Children/parallelism:** actual deterministic child interpreter, typed `theta_result`, closure/root/hash validation, fail-closed missing/duplicate envelope, process death/kill and parallel finality. Native task prose alone fails this gate.
7. **Real subscription turn:** supported isolated OpenCode login; exact `openai/gpt-6.1-sol`; deny-all effect tools; small token/time bounds; one simple native turn and one singleton schema operation; observable red path as well as green. No credentials copied from other hosts and no Claude fallback.
8. **Deployment/runtime:** import a deliberately bounded real Theta engine graph into the released runtime; dependency/peer locking, reload/disposal, session transitions, budget ceilings, durable headless result transport and TUI command arguments. Test browser/desktop separately if desired.

**Final distinction:** native session access is **verified**; unchanged/full native Theta semantics are **not**. Worker ownership reduces several serious risks, but it is not evidence that the remaining semantic gaps vanish.

## 12. Source anchors and reproducibility

### OpenCode immutable source links

All code evidence is pinned to tag commit `e3c4eb242585dcd77be1a867391b7c25fd47ce52`; local root is `source/anomalyco-opencode-e3c4eb2/`.

- [SDK export families](https://github.com/anomalyco/opencode/blob/e3c4eb242585dcd77be1a867391b7c25fd47ce52/packages/sdk/js/package.json#L1-L34); [SDK server process launcher](https://github.com/anomalyco/opencode/blob/e3c4eb242585dcd77be1a867391b7c25fd47ce52/packages/sdk/js/src/server.ts).
- [Server plugin inputs/hooks](https://github.com/anomalyco/opencode/blob/e3c4eb242585dcd77be1a867391b7c25fd47ce52/packages/plugin/src/index.ts#L55-L350); [custom tool context](https://github.com/anomalyco/opencode/blob/e3c4eb242585dcd77be1a867391b7c25fd47ce52/packages/plugin/src/tool.ts#L1-L58).
- [TUI plugin API](https://github.com/anomalyco/opencode/blob/e3c4eb242585dcd77be1a867391b7c25fd47ce52/packages/plugin/src/tui.ts#L581-L635); [actual state/client adapters](https://github.com/anomalyco/opencode/blob/e3c4eb242585dcd77be1a867391b7c25fd47ce52/packages/tui/src/plugin/adapters.tsx#L98-L205); [TUI native prompt calls](https://github.com/anomalyco/opencode/blob/e3c4eb242585dcd77be1a867391b7c25fd47ce52/packages/tui/src/component/prompt/index.tsx#L1083-L1123).
- [Prompt persistence/permission mutation](https://github.com/anomalyco/opencode/blob/e3c4eb242585dcd77be1a867391b7c25fd47ce52/packages/opencode/src/session/prompt.ts#L1052-L1071); [native loop/schema/steps](https://github.com/anomalyco/opencode/blob/e3c4eb242585dcd77be1a867391b7c25fd47ce52/packages/opencode/src/session/prompt.ts#L1170-L1347); [commands](https://github.com/anomalyco/opencode/blob/e3c4eb242585dcd77be1a867391b7c25fd47ce52/packages/opencode/src/session/prompt.ts#L1356-L1480); [schema tool](https://github.com/anomalyco/opencode/blob/e3c4eb242585dcd77be1a867391b7c25fd47ce52/packages/opencode/src/session/prompt.ts#L1565-L1594).
- [Shared runner/cancellation](https://github.com/anomalyco/opencode/blob/e3c4eb242585dcd77be1a867391b7c25fd47ce52/packages/opencode/src/effect/runner.ts#L59-L202); [session run state](https://github.com/anomalyco/opencode/blob/e3c4eb242585dcd77be1a867391b7c25fd47ce52/packages/opencode/src/session/run-state.ts#L55-L146).
- [Request-visible tool filtering](https://github.com/anomalyco/opencode/blob/e3c4eb242585dcd77be1a867391b7c25fd47ce52/packages/opencode/src/session/llm/request.ts#L149-L215); [native tool context/executor](https://github.com/anomalyco/opencode/blob/e3c4eb242585dcd77be1a867391b7c25fd47ce52/packages/opencode/src/session/tools.ts#L53-L137); [permission service](https://github.com/anomalyco/opencode/blob/e3c4eb242585dcd77be1a867391b7c25fd47ce52/packages/opencode/src/permission/index.ts#L67-L150).
- [Explicit-user shell lane](https://github.com/anomalyco/opencode/blob/e3c4eb242585dcd77be1a867391b7c25fd47ce52/packages/opencode/src/session/prompt.ts#L451-L593); [tool registry](https://github.com/anomalyco/opencode/blob/e3c4eb242585dcd77be1a867391b7c25fd47ce52/packages/opencode/src/tool/registry.ts#L120-L210); [native tasks](https://github.com/anomalyco/opencode/blob/e3c4eb242585dcd77be1a867391b7c25fd47ce52/packages/opencode/src/tool/task.ts#L136-L261).
- [Unavailable new compact/wait](https://github.com/anomalyco/opencode/blob/e3c4eb242585dcd77be1a867391b7c25fd47ce52/packages/core/src/session.ts#L417-L432); [new HTTP wait mapping](https://github.com/anomalyco/opencode/blob/e3c4eb242585dcd77be1a867391b7c25fd47ce52/packages/server/src/handlers/session.ts#L197-L210).
- [Codex/OpenAI OAuth/model filter](https://github.com/anomalyco/opencode/blob/e3c4eb242585dcd77be1a867391b7c25fd47ce52/packages/opencode/src/plugin/openai/codex.ts#L270-L493); [release-tagged OpenAI subscription docs](https://github.com/anomalyco/opencode/blob/e3c4eb242585dcd77be1a867391b7c25fd47ce52/packages/web/src/content/docs/providers.mdx#L1773-L1802).
- [Plugin loader](https://github.com/anomalyco/opencode/blob/e3c4eb242585dcd77be1a867391b7c25fd47ce52/packages/opencode/src/plugin/loader.ts#L82-L145); [plugin module entry rules](https://github.com/anomalyco/opencode/blob/e3c4eb242585dcd77be1a867391b7c25fd47ce52/packages/opencode/src/plugin/shared.ts#L272-L320).

Detailed local Theta anchors and additional release links are in both delegated reports; the critical actual source dependencies are enumerated in §4, §8, and `baseline/theta-source-hashes-end.txt`.

### Re-run the provider-free executable tests

From `/home/thomasa/Projects/pi-theta/.pi/tmp/dual-host-research`:

```sh
# Official pinned downloads, if reconstructing artifacts:
curl -fL https://github.com/anomalyco/opencode/releases/download/v1.19.3/opencode-linux-x64.tar.gz \
  -o opencode/releases/opencode-linux-x64.tar.gz
tar -xzf opencode/releases/opencode-linux-x64.tar.gz -C opencode/releases
curl -fsSL https://registry.npmjs.org/@opencode-ai/sdk/-/sdk-1.19.3.tgz \
  -o opencode/releases/sdk-1.19.3.tgz
mkdir -p opencode/releases/sdk
tar -xzf opencode/releases/sdk-1.19.3.tgz -C opencode/releases/sdk

# Keep all automatic config/dependency/cache/temp/database writes isolated.
mkdir -p opencode/probes/{home,config,data,cache,state,work,tmp}
python3 opencode/probes/run-probe.py
python3 opencode/probes/assert-results.py > opencode/probes/assertions.log 2>&1
```

The script constructs a minimal child environment (no inherited provider credentials), sets all HOME/XDG/TMP directories beneath its own workspace, disables default auth plugins, auto-update, project config, external skills/model fetching and snapshots for the final probe, sets model/small-model to the loopback provider, denies effect tools except its harmless echo, and grants read `ask` only in the two dedicated sentinel sessions. It starts/stops its loopback model server, OpenCode server and attached PTY TUI. Package installation may fetch public dependencies; model requests remain loopback. Do not run the binary with an unisolated personal HOME to reproduce these tests.

### Artifact index

| Path beneath this report | Contents |
|---|---|
| `baseline/` | Initial/final git state, HEAD, status delta, source hashes, timestamps |
| `releases/github-latest.json`, `repository.json`, `tag-ref.json`, `npm-*.json` | Authoritative identity/version/date/channel metadata |
| `releases/opencode*`, `sdk-1.19.3.tgz`, `plugin-1.19.3.tgz`, `sdk/`, `plugin/` | Official executable/archive and exact published packages/declarations |
| `releases/sha256.txt`, `integrity-verification.txt` | Reproduction hashes and matched npm integrity |
| `releases/models-public-api.json` | Current public catalog observation, **not** release entitlement evidence |
| `source/v1.19.3.tar.gz`, `source/anomalyco-opencode-e3c4eb2/` | Full release-tag source archive and extraction |
| `docs/*.mdx` | Raw release-tagged plugins/SDK/providers/tools/commands/permissions/server docs |
| `probes/run-probe.py`, `plugin.mjs`, `tui-plugin.mjs`, `sdk-probe.mjs` | Complete disposable experiment sources |
| `probes/probe.log`, `server.log`, `model-requests.jsonl`, `plugin-events.jsonl`, `tui-events.jsonl`, `tui-terminal.raw`, `sdk-probe.log` | Complete latest protocol/results/plugin/UI logs; no real credentials |
| `probes/openapi.json`, `effective-config.json`, `tui-config.json` | Executable route inventory and synthetic loopback configuration |
| `probes/assert-results.py`, `assertions.log` | 28 passing positive/negative assertions |
| `probes/exploratory/` | Initial failed setup/logs and original probe script, retained with diagnosis |
| `probes/{home,config,data,cache,state,tmp,work}/` | Isolated generated dependency/config/database/runtime files and sentinel |
| `delegates/release-api/REPORT.md` and sibling raw evidence | Independent release/plugin/SDK/API workstream, including endpoint inventory |
| `delegates/semantics/REPORT.md` and tag metadata | Independent adversarial actual-Theta semantic analysis |

**Write-boundary confirmation:** all investigation/delegate/download/probe writes were beneath `/home/thomasa/Projects/pi-theta/.pi/tmp/dual-host-research/opencode/`. No project source/tests/docs/manifests/locks/config, project git state, personal Pi configuration or real credentials were modified. Existing/concurrent project edits were neither reset nor staged. No remote messages/services were modified; no live model/auth requests were made by the host experiments.
