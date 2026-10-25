# Released pi-durable API/source compatibility with Theta

> **Developer research, not end-user documentation or an accepted specification.**
> Relocated from `.pi/tmp/dual-host-research/pi-durable/api-analysis/report.md`. Historical release/source pins and evidence limitations remain in force.
> Unless a link points to another tracked document, experiment paths and reproduction instructions refer to the original local evidence workspace, `.pi/tmp/dual-host-research/pi-durable/api-analysis/`; downloads, caches, scripts and raw logs remain gitignored and are not required to read this report.

## Verdict

**`@earendil-works/pi-durable@1.4.0` is a real programmable agent harness, not a Pi coding-agent ExtensionAPI host.** Its released APIs are sufficient foundations for a new deterministic Theta host adapter, especially isolated conversations/workers and a custom frontend. They do **not** load the shipped Theta Pi extension unchanged, provide its slash-command lifecycle/UI, or automatically make the existing interpreter crash-resumable.

This is source/API research, not a runtime or live-model verification. Parent owns offline probes. No credentials were read, no live model was called, and no project/config files were modified. All artifacts here are under the assigned `api-analysis/` directory.

## 1. Release identity and reproducible evidence

Authoritative npm metadata fetched from `https://registry.npmjs.org/@earendil-works%2fpi-durable` is saved as `npm-metadata.json`; selected version is in `release.json`.

- npm `dist-tags.latest`: **1.4.0**.
- npm publication timestamp: **2026-10-21T22:44:09.320Z**.
- Repository: `https://github.com/earendil-works/pi.git`, directory `packages/durable`.
- Released artifact: `https://registry.npmjs.org/@earendil-works/pi-durable/-/pi-durable-1.4.0.tgz`, downloaded as `pi-durable-1.4.0.tgz` and extracted into `package/`.
- SHA-1: `4c41ed84c03a964e8e15645665ee26b2d96ccf74`.
- npm SHA-512 integrity **locally matched** downloaded bytes: `sha512-EtIyXH1MBSXdJSkodmy+CYXuwfve3gPrD4GNCZ0XmuRWLPupwRlNQ7fdaXjRcLoKb6SWkT/yEzK+sMmrqvYK+Q==`.
- Metadata did not expose `gitHead`. npm provenance from `https://registry.npmjs.org/-/npm/v1/attestations/@earendil-works%2fpi-durable@1.4.0` (`attestations.json`, decoded `provenance.json`) supplies **tag `v1.4.0`, source commit `4a080252f06caf63a525d7873c5d94d3c23887e0`**, workflow `.github/workflows/build-binaries.yml`, run `39686887346/attempts/1`. This is decoded published provenance, not independent Sigstore signature verification.
- `package/package.json:8-112` exports importable modules, no `bin`; `:149-159` requires Node **>=22.19.0** and pins chord/pi-ai/pi-codemode/pi-telemetry **1.4.0**, TypeBox **1.3.27**.
- README opens with **Experimental: API changes without notice between releases** (`package/README.md:3`). Pin versions, not a moving repository branch.

The package includes compiled JS, declarations and maps, not `src/`. Actual release JS source-map `sourcesContent` was extracted to `released-sources/durable/` and `released-sources/ai/`. `released-sources/durable/harness/types.ts` was fetched separately from the provenance-pinned GitHub commit because declaration maps lack source content. Released `dist/harness/types.d.ts` corroborates it. References below use local paths relative to this directory; source URLs use the same pinned commit:

`https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/durable/src/...#L...`

## 2. Framework extensions are not Pi extensions

The durable root export (`package/dist/index.d.ts:1-30`) exposes Harness, createRegistry, defineExtension, defineTool, defineTask, task-specific hooks, storage/session/document types, entries and watchEvents. Its `Extension` is a named bundle of **tools, sections, hooks, wraps, tasks**, installed through a host-owned Registry (`released-sources/durable/harness/types.ts:372` onward; declarations `package/dist/harness/types.d.ts:309-348`). It is not a function receiving `ExtensionAPI`.

No `ExtensionAPI`, `registerCommand`, `registerTool`, or `sendUserMessage` occurs in released durable JS. This absence is corroborated by its positive, exhaustive public extension/interface definitions, not merely a text search. Package has no coding-agent dependency or CLI binary. **The exported `source` conditions point to unshipped source paths; ordinary import uses shipped dist.** Do not run the npm artifact with `--conditions=source` and assume those files exist.

Theta's current bootstrap explicitly registers discovered slash commands through `pi.registerCommand` (`/home/thomasa/Projects/pi-theta/src/extension/production-composition.ts:1-27`), imports coding-agent API/version and constructs many Pi-specific adapters (`:39-46`, `:117-147`). Its live prompt driver consumes `sendMessage`, `sendUserMessage`, active-tool/model/thinking mutation, plus command-context abort/idle/model/signal (`src/extension/live-prompt-query-driver.ts:117-164`). Durable has different objects and semantics for each. Renaming imports or claiming an MCP/skills bridge will not port it.

## 3. Capability matrix: actual APIs and limits

| Requirement | Released durable surface | Theta implication / qualification |
|---|---|---|
| Drive a conversation | `Harness.open(storage,{models,registry},context)`, `root/createConversation/conversation`; `Conversation.submit`, `Submission.wait` | Real agent-loop control, not an external text launcher. Submission status and answer entry IDs give deterministic settlement. See README `:42-80`; declarations `harness/types.d.ts:45-50,671-770`. |
| Model selection / thinking | `Conversation.configure(AgentChange)` stores provider/model ID, thinking level, extension/tool selections, instructions, cwd; `agent()` resolves against registry/settings | Per-conversation choices avoid global Pi active-tool/model mutation. Must snapshot/restore or choose per-query conversation policy to preserve Theta prompt semantics. README `:402-425`; declarations `:351-419`. |
| Transcript and context | `context(context,{at?})` returns entries, per-entry contributions and model-ready messages; `entries(query,limit,cursor,context)` is paged/fork-aware; `commit`, `submit({type:'write',entry})`, `reset`, `fork` | Strong positive read/write/history APIs. Custom entries require deliberate model contribution fields. Not a Pi SessionManager JSONL tree and not automatic Pi session attachment. declarations `:660-720`. |
| Native model tool loop | Built-in GenerationTask streams model, starts ToolTask children, waits their round, then continues | Genuine control seam. Existing Theta two-phase query protocol needs adaptation; durable native run normally consumes multiple turns before final settlement. See released source `harness/generation.ts:484,532,599,700`; JS `generation.js:108-139,395-402`. |
| Programmatic tools | `defineTool({parameters,execute(args,api,context),replay,...})`; `api.executeTool(name,args,context,{key,progress})` creates nested ToolTask | Prefer nested calls over invoking `execute` directly: validation/hooks/replay/output/cancellation ownership are part of semantics. `ToolExecutionApi` source `harness/types.ts:210-297`, `ToolRegistration:300-346`; declarations `:155-275`. Top-level Conversation and TaskRuntime do NOT expose the tool API's `executeTool`; choose a wrapper tool or implement task ownership explicitly. |
| Typed tool returns | TypeBox input validation; optional `structuredOutputSchema` validates `structuredOutput` for programmatic callers | This is **tool output schema**, not generic model `response_format` / forced final answer. Nested result has structuredOutput/details/diagnostics/isError/usage, not ordinary model output. Transcript stores output/details, not structuredOutput itself. README `:282-330`; source types `:157-200,314-318`. Map carefully to Theta value/error rules. |
| Request / tool hooks | Generation beforeRequest(messages replacement), afterResponse, onYield(continue user input), afterTools; Tool beforeTool(block/rewrite args), afterTool(replace result) | Useful deterministic instrumentation and enforcement, not equivalent to every Pi event. beforeRequest cannot return arbitrary provider options. source types `:852-895`; declarations `:783-815`. |
| Forced typed model output | Curated `ConversationStreamOptions` includes transport/timeouts/retries/headers/metadata/cache/deferred; no toolChoice or response-format parameter; generation calls Models.streamSimple | Need direct `api.models`/TaskRuntime.models request or a custom generation task/host driver for Theta forced respond. Hooks alone are not a documented force-tool-choice API. source types `:484-496`; source generation `:226` and `:484`; actual JS `:125-138,353`. |
| Cancellation | Chord Context cancels waits; `Conversation.abort`, `Harness.abortTask` cancel work; TaskRuntime.signal is abort signal | Critical semantic distinction: merely aborting wait Context can leave model/tools running. Explicit abort and join required for Theta cancellation/no-late-effects. declarations `types.d.ts:212-295`; harness declarations `:69-90,706-715,750-762`. |
| Children | Task-owned conversations, child tasks, failFast/allSettled joins, ownership-scoped abort/idle; background boundaries survive ordinary parent abort | Strong isolated-worker orchestration. Not OS child processes or Theta RFC-0006 wire protocol, depth/hash/root-placement regime, or inherited Pi extension environment. README `:627-725`; declarations ownership/task types `types.d.ts:326-378`. |
| UI/status | `viewState/watch`, committed `pi.live` partials/tools/inbox, `watchEvents` snapshot+deltas and taskGraph | Custom frontend data model, no bundled existing-session slash command/widget/dialog/editor/render registration API. A host must implement actual input/frontend and wire abort/status. README `:469-501,585-608`; harness declarations `:717-770`. |
| Files/processes | Optional ExecutionEnv; built-in read/write/edit/bash, NodeExecutionEnv; custom env can isolate directories/containers | Explicit environment required; built-ins otherwise fail. Does not inherit Pi process cwd/tool inventory magically. README `:443-467`. |
| Storage/runtime | Memory, JSONL, SQLite Node/Cloudflare, IndexedDB; durable task checkpoints, sleep/wake, recovery, hooks/registry reinstall | Real embedding runtime with host-owned storage/auth/registry/frontends. Registry implementations are not serialized; reopen must reinstall. Does not mean arbitrary JS stack/interpreter memory survives. README `:119-219,457-467,761-839`. |

## 4. OpenAI subscription support (source verified; not live verified)

Downloaded exact `@earendil-works/pi-ai@1.4.0` artifact into `ai/package/`. The released provider **`openai`** explicitly registers lazy OAuth named **OpenAI (ChatGPT subscription)** with `isSubscription:true`, and normal OpenAI Responses API; OAuth filters classifiers out (`ai/package/dist/providers/openai.js:7-30`). README `:1789-1795` documents Sign in with ChatGPT subscriptions, separately from legacy openai-codex.

Source `released-sources/ai/auth/oauth/openai-chatgpt.ts:1-27,162-179,209-237,300-310` shows direct API OAuth scope `chatgpt.tokens.use.direct`, issued clientId, refresh, device-ID requirement and credential-to-apiKey conversion. It sends access tokens to api.openai.com, not an inferred compatibility proxy. `ai/package/dist/api/openai-responses.js:24-31,84-85,261-262` handles ChatGPT-specific unsupported request fields. **Do not assume legacy Codex tokens can be relabeled `openai`.**

The actual shipped catalog `ai/package/dist/providers/data/openai.json:1` includes `chat:gpt-6.1-sol`, API `openai-responses`, strict-mode support and reasoning levels low/medium/high/xhigh/max. Its classifier `gpt-6-luna` is a different API and is excluded for OAuth. Therefore default programming-model host research should use **openai/gpt-6.1-sol**, not a Luna classifier or Claude.

Auth is host-owned through `createModels({credentials,authContext})` and provider registration; persistent credential store and provider login/refresh protocols are documented in `ai/package/README.md:373-481,1787-1818`. Merely installing durable does not discover the operator's Pi auth/settings. A new host must obtain authorized subscription credentials through supported APIs and isolate any host config as required. No local account, subscription entitlement or successful Sol turn was verified here; no credentials were opened or copied.

## 5. Best architecture options and hazards

### A. New durable-native Theta host, driven externally from its frontend (recommended design path)

Retain deterministic Theta parsing, type checking, evaluation, query validation and invocation rules. Add a host composition layer over the runtime effect seams, not a mock implementation of the complete Pi ExtensionAPI. Key existing seams are `src/runtime/effectful-statement-host.ts:96-244`: resolveQuery returns QueryModelDriver/config/schemaValidation/decodeInbound; resolveToolCall dispatches code-side tools; resolveInvoke/resolveSubagentFnChild drive children. QueryModelDriver's bounded free-phase/forced-respond protocol is defined in `src/runtime/query-tool-loop.ts:155-174` and loops `:389-399,503-506`.

The frontend handles a Theta command outside an active model tool round, chooses the existing durable conversation for prompt mode, watches committed updates, and calls explicit work abort on cancellation. Typed queries run their forced response through Models with explicit tool choice and the existing Theta validation/repair machinery. New driver must classify durable errors/status/partial recovery rather than reusing Pi lifecycle polling. Existing `live-prompt-query-driver.ts:141-164` and `off-session-respond-dispatch.ts:173-192,244-260` show why a thin submit-and-text adapter would miss semantics.

**Hazard: same-conversation tool reentrancy.** Do not naively register `theta` as a tool and inside it `submit()` another input to the calling conversation then await it. A busy conversation queues inputs, and generation waits on the tool round; steer placement is also after that round. This produces a circular wait. The documented child-conversation subagent pattern avoids it. This is a source-supported architectural inference, not a tested deadlock probe (README `:503-520,627-669`).

### B. Isolated Theta worker as durable tool / child conversation (lower integration scope)

A registered durable tool can run the deterministic Theta interpreter in a task-owned **separate conversation**, bridge code-side calls through api.executeTool, and return typed data. This fits isolated workers and gives parent/child abort ownership plus observable child IDs. It is **not** prompt mode in the existing conversation. Theta's process-based invoke/subagent semantics still need preservation or explicitly specified replacement; durable child conversations by themselves are not RFC-0006 equivalence.

### C. Durable custom-task implementation with crash recovery (more substantial)

Represent interpreter program counter, lexical environment and pending effect receipts in serializable task/docs, commit transitions, and journal effect keys/idempotency. The stock `ProductionCheckpoint` is an event-loop/cancellation yield, **not persisted continuation** (`src/seams/production-checkpoint.ts:1-38`). Wrapping the entire existing interpreter in one durable task phase loses its in-memory continuation on crash. Declaring it replay-safe without effect journals may repeat edits or launches. Durable nested-call deduplication explicitly is not exactly-once execution (source types `:259-270`), and applies only to its own keyed calls. Start non-resumable/unsafe and fail closed, or design recovery explicitly.

### D. External Pi launcher (works only as separate product boundary)

A durable tool may launch the existing Pi binary and Theta extension in an isolated worker and return its envelope, preserving much current implementation. That is external worker orchestration, **not** native durable Theta prompt mode. It adds executable/auth/extension pinning and cancellation/result-channel obligations, and the current Pi CLI launch protocol is not supplied by pi-durable.

## 6. Remaining unknowns / nonclaims

- No import/build/runtime probe here; consult parent's offline execution report for actual compatibility. Artifact source inspection is stronger than README inference but not runtime validation.
- No existing-session Pi attachment, host command/UI, or released durable standalone frontend was verified; durable npm export surface itself is a library, not a drop-in alternate `pi` CLI.
- Theta checkout pins dev dependencies `~1.3.0` while durable pins `1.4.0` (`/home/thomasa/Projects/pi-theta/package.json:62-78`); model/API/TypeBox/Context compatibility must be audited at build boundary, not assumed from shared package names.
- Existing Theta discovery, binder, session-control runtime tools, registration collisions, child wire protocol and UI/error-note contracts are outside the small effect seam alone; bounded code reads establish refactoring seams, not a complete port estimate.
- No product-wide support promise from experimental 1.4.0; no claim every OpenAI catalog model is subscription-entitled; no recovery/exactly-once guarantee for arbitrary Theta side effects.
