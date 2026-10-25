# Pi Durable as a Theta host — release-pinned investigation

> **Developer research, not end-user documentation or an accepted specification.**
> Relocated from `.pi/tmp/dual-host-research/pi-durable/REPORT.md`. Historical release/source pins and evidence limitations remain in force.
> Unless a link points to another tracked document, experiment paths and reproduction instructions refer to the original local evidence workspace, `.pi/tmp/dual-host-research/pi-durable/`; downloads, caches, scripts and raw logs remain gitignored and are not required to read this report.

**Research date:** 2026-10-24 UTC\
**Package:** **`@earendil-works/pi-durable@1.4.0`**, npm `latest`, published **2026-10-21T22:44:09.320Z**\
**Released source:** `earendil-works/pi`, commit **`4a080252f06caf63a525d7873c5d94d3c23887e0`**, tag `v1.4.0`\
**Decision:** credible **new embedded/custom-frontend Theta host**, with particularly strong isolated-conversation and durable-orchestration foundations. **Not a drop-in host for the shipped Pi extension; not automatically durable Theta execution.**

## 1. Executive decision

Pi Durable is a separate, genuinely programmable harness library. Its extensions are registry bundles of tools, prompt sections, hooks, wrappers and tasks—not functions receiving Pi coding-agent `ExtensionAPI`. Sharing pi-ai does not make the interfaces compatible. There is no standalone executable or existing interactive frontend in this npm package to which the shipped Theta extension can simply attach.

The useful distinction is:

| Architecture | Verdict |
|---|---|
| Load the existing Theta Pi extension into Durable / control the operator's existing Pi TUI conversation | **No demonstrated or exported compatibility route.** New composition is necessary. Durable does not expose the Pi extension loader or automatically attach to Pi sessions. |
| Run ordinary deterministic Theta **inside a Durable-based application**, outside its active model tool round | **Feasible adapter target.** A real Theta parser/executor fixture completed two sequential Durable queries in this investigation. Full language/host parity is not yet implemented or proved. |
| Theta drives isolated Durable conversations/tasks | **Strongest initial integration.** Conversation identity, submission settlement, exact tool selection, typed nested tool results and ownership-scoped cancellation are concrete APIs. |
| Durable launches current Pi/Theta child processes | Possible hybrid, but **a Pi launcher**, not Durable-native Theta hosting or continuation recovery. |
| New frontend on Durable, with a Theta host composition | **Recommended native-to-Durable product boundary.** Own command dispatch, input admission, policy, storage, auth and progress UI explicitly. It is a new application, not a stock Pi plugin. |
| Transparently resume arbitrary current Theta execution after process restart | **Not supported automatically.** Requires a persisted interpreter state machine or deterministic interpreter replay design, beyond persisting conversation/model/tool tasks. |

### Strongest verified evidence

Against the **real released package**, entirely offline:

- Sequential turns retained history; exact `tools: []` reached the faux provider; independent conversations ran in parallel with separate histories/provider session IDs.
- Real nested ToolTasks returned structured `{value:42}`, blocked a denied call before execution, rejected invalid structured output, and rejected a missing tool. A code-authored public `ToolTask` path executed the registered implementation through native validation/hooks with **zero provider calls**.
- A small **real Theta parser, environment, interpreter and interpolation renderer** drove two untyped zero-tool Durable submissions and returned `["12","42",42]`. This was not an LLM interpreting Theta source.
- Cancelling a wait **did not cancel work**. Explicit conversation abort joined the run and settled its input `unanswered/aborted`.
- A singleton response tool was **not forced**: native generation accepted a plain-text answer as `done`. Separately, direct released pi-ai `Models.complete()` with the **OpenAI-specific** options emitted the exact named `tool_choice` and parsed a structured tool result through an in-memory fetch fixture. Thus the missing native-generation option is not an absence of all lower-level forcing capability.
- **Actual SIGKILL/reopen** recovered a generation's request checkpoint, kept the same submission ID, converted its stored partial into an aborted assistant entry, and issued the provider request again.
- Independent recovery probes killed actual processes at task/tool/commit boundaries. A committed custom checkpoint preserved `41` and returned `42`; a completed nested child was reused; commit-marker crash boundaries recovered all or none of the transaction.
- A deliberately non-idempotent tool declared `replay: "safe"` executed its external counter **twice**. The unsafe equivalent executed once and recovered **failed/interrupted**, not as a known successful effect.

**Ordinary hosting verdict:** proceed only to a bounded new host-adapter prototype. This library gives more direct code-level control than the reviewed Codex/OpenCode worker APIs, but does not supply their ready-made interactive applications.\
**Durable Theta verdict:** do **not** advertise transparent resumption or exactly-once effects. A first adapter should honestly expose interrupted invocation/reissue semantics. Durable Theta would be a separate substantial language-runtime feature.

## 2. Release pin, evidence and research boundaries

### Authoritative release identity

- Official package: [`@earendil-works/pi-durable`](https://registry.npmjs.org/@earendil-works%2fpi-durable); the unrelated/unavailable unscoped `pi-durable` is not the product.
- Repository metadata identifies [`earendil-works/pi`, `packages/durable`](https://github.com/earendil-works/pi/tree/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/durable).
- Registry `dist-tags` contained only **`latest: 1.4.0`**. The final latest-version recheck agreed. No prerelease/development branch was substituted for the published release.
- GitHub latest release is [`v1.4.0`](https://github.com/earendil-works/pi/releases/tag/v1.4.0), `prerelease:false`, published **2026-10-21T22:49:48Z**.
- Downloaded [exact npm tarball](https://registry.npmjs.org/@earendil-works/pi-durable/-/pi-durable-1.4.0.tgz); its registry SHA-512 integrity matched. SHA-256: `6d4dedd7a342151bca8b962f35a6231312cb10e5226796734e6644ad02f48224`.
- npm metadata lacked `gitHead`. Published [provenance](https://registry.npmjs.org/-/npm/v1/attestations/@earendil-works%2fpi-durable@1.4.0) identifies `refs/tags/v1.4.0`, commit above and `.github/workflows/build-binaries.yml`. Tag API independently resolved that commit. Attestations were decoded; this investigation did **not** independently verify Sigstore signatures.
- All **84** embedded Durable JS source-map sources matched the downloaded provenance-commit source archive byte-for-byte. Capability evidence uses the released JS/declarations and this matching source—not public `main` docs.
- The npm artifact ships `dist`, README and changelog. Its `source` export conditions point to **unshipped** source; use ordinary imports for the npm artifact, not `--conditions=source`. Tagged-source examples use that condition in the repository and are a different execution context.

Despite a non-prerelease `latest` tag, the **released README explicitly labels the framework Experimental: APIs may change without notice between releases**. Pinning matters. Package requires **Node >=22.19.0**, has no `bin`, and pins chord/pi-ai/pi-codemode/pi-telemetry **1.4.0** and TypeBox **1.3.27**. Probes used Node **v22.23.3**. See `release/VERIFIED.json`, `package-metadata.json`, `registry.json`, GitHub metadata, provenance and source-map comparison.

### Theta baseline and ownership

Theta checkout: **0.497.0**, HEAD **`28424268b24a41536975e69606bd5a848047bbc1`**. Supplied initial status and early observed status were clean; final HEAD is unchanged. The final status acquired one untracked file, `tests/helpers/b0511-fixtures.ts`, during concurrent work; this investigation did not create, edit or remove it. This is a newer baseline than the previous reports' 0.496.0/dirty working tree. Their conclusions were reused as research leads, **not as proof about these current bytes or Durable**. Inspected-source hashes and initial/observed/final status artifacts are in `logs/`; no concurrent work was overwritten.

All intentional writes—including downloads, npm CLI/dependencies/cache, temporary files, storage, counters, scripts, logs and delegated artifacts—are beneath:

`/home/thomasa/Projects/pi-theta/.pi/tmp/dual-host-research/pi-durable/`

No project source/tests/docs/manifests/lockfiles/configuration, personal Pi config, git index/commits, or remote services were modified. No credentials were extracted, opened, copied or logged. No provider-backed Durable inference probe was made. Two independent OpenAI-only `theta-host-research-delegate` workstreams were launched with disjoint private directories and **both wait-collected**: API/source compatibility and recovery/replay analysis.

### Evidence labels

- **X:** executed released package, native scheduler/storage/tools real, model/fetch fixtures explicitly stubbed.
- **A/S:** published artifact and matching release-source inspection; Theta source at the recorded baseline.
- **I:** architecture/design inference.
- **U:** unverified, particularly live auth/provider behavior and full Theta parity.

A stubbed provider proves control and serialization mechanics, not intelligence, entitlement, real retries/billing or server-side schema compliance. Faux usage numbers are fixture estimates, not measured provider usage.

## 3. Compatibility matrix

| Theta obligation | Released Durable capability | Assessment and evidence |
|---|---|---|
| Pi extension loading, discovered slash commands | Host-owned `createRegistry`, `defineExtension`, `defineTool`, `defineTask`; no Pi command/extension loader | **Different API (A/S).** New app dispatch/discovery composition required; not unchanged `extensions/index.ts`. |
| Deterministic language execution | Trusted in-process JS/TS host code can call the real parser/executor | **Small real fixture X.** Not a complete production composition, import/binder/child acceptance test. |
| Multiple queries in one conversation | `submit` → `Submission.wait` with submission/answer IDs; context/history reads | **X.** Serialize admissions under app ownership; handle all terminal reasons, not just `done`. |
| Reliable settlement | Durable task outcomes, submission state, `waitForIdle`, owned-work joins | **X+A/S.** Acknowledged admission and `done` are not the same event. Cancelled waits are not cancellation. |
| Exact model-visible tools | Per-conversation `tools`, `modelTools`, `callers`, system tool deltas | **X:** empty set and singleton driver; hidden callable tool stayed off the request. Configuration is conversation-scoped, not a query lease. |
| Denial / permissions | ToolTask validation and `beforeTool` block/rewrite; execution environment | **X** for native custom guard. No built-in operator approval workflow, sandbox policy or Pi permission inheritance established. The new app must own those. |
| Deterministic code-side tools | `ToolExecutionApi.executeTool` for nested calls; public ToolTask + committed intent | **X:** registered code ran with supplied args, hooks/schema, no model selection. No top-level `Conversation.executeTool` convenience; transcript/ownership placement remains adapter design. |
| Typed query / binder | TypeBox input/output validation for tools; direct pi-ai provider-specific completion | **Partial X+A/S.** Tool `structuredOutputSchema` is not model final-response schema. Native generation exposes no documented named tool-choice option. Direct named OpenAI request shape/parsing tested offline. |
| Exact free-phase/forced-response loop | Native GenerationTask owns the whole run; hooks before/after request/tools/yield | **Gap in unchanged native run (A/S).** New QueryModelDriver/custom task or lower-level request driver must preserve Theta round/repair/depth rules. |
| Model/auth/thinking/history | Host-owned pi-ai `Models`; agent config; context snapshots, provider identity | **A/S; history X.** Supports OpenAI subscription in source; does not automatically load Pi auth/config. |
| Isolated nested conversations | `createConversation`, task ownership, fork, copied agent, child task joins | **Parallel independent conversations X; ownership A/S.** Not current Theta child-process placement/wire parity. |
| Parallel typed returns | Child task outcomes plus nested structured results; allSettled/failFast | **Building blocks X+A/S.** Theta per-index Results, diagnostic ordering and lane cancellation need adaptation. |
| Cancellation | Wait Context versus explicit `abort/abortTask`; ownership/background scopes | **X.** Must abort real work and join, avoid cancelling foreign tasks; cooperative code may delay close. |
| Compaction / transitions | Real compaction tasks; reset/handoff, fork, context cutoff, history retained | **A/S, not full acceptance-tested.** App must integrate Theta context/runtime APIs and prevent stale results. |
| Context/runtime tools, diagnostics, progress | Context/document access, `viewState/watch/watchEvents`, taskGraph | **A/S.** Data model for new UI, not Pi widgets/editor/dialogs/run-card rendering. Runtime functions must map deliberately. |
| Persist conversation/model/tool work | JSONL/SQLite/IndexedDB/Cloudflare storage and task state machine | **X for JSONL and real process kills.** Not arbitrary JS continuation persistence. |
| Persist Theta PC/locals/frames/joins/budgets | No automatic serialization of the existing interpreter | **Not supplied (S).** Explicit interpreter state or deterministic replay is required. |
| Runtime/import/budget limits | Node embedding; portable core/env/storage options; custom tasks and restart limit | **A/S.** Native trusted callbacks have no automatic Theta memory/CPU/query-depth ceilings; worker deployment is separate. |
| Packaging/distribution | npm library/modules and examples, experimental ABI | **A/S.** Ship a new host/adapter/frontend, pinned dependencies and migrations, not merely a Pi extension manifest. |

## 4. Actual Theta seams and what must remain deterministic

These are code dependencies, not the old README's implementation-status claims. Local paths are under `/home/thomasa/Projects/pi-theta`; immutable source-link base is [Theta baseline](https://github.com/bitmonk8/pi-theta/tree/28424268b24a41536975e69606bd5a848047bbc1).

### Reusable language boundary

- `src/parser/theta-document.ts:149` composes source/frontmatter/body/type/schema checks. It still depends on note/model-resolution seams; directory names alone do not define a standalone package.
- `src/runtime/statement-executor.ts:423,818,1012` evaluates expressions, blocks and complete bodies; `lexical-environment.ts:297-347,829` carries lexical scopes/declarations. `pure-expression-evaluator.ts` and `query-interpolation.ts:45` implement deterministic computation/rendering.
- `src/runtime/statement-executor-types.ts:68-141,175-257` defines `StatementEvalHost` and `ExecuteBodyDeps`: pure evaluation, effect classification/dispatch, checkpoints, invoke chains, child requests, diagnostics and lane hooks. `runtime/effectful-statement-host.ts:96-244` is a practical query/tool/invoke composition boundary.
- `src/runtime-root.ts:28-73` is a seam carrier, **not** a ready-made independent host. Production producer/composition also require Pi model registry, callbacks, filesystem discovery, tools, child launch/result channels, cancellation and UI.

The probe reused these real language pieces without modifying them. It supplied a tiny host only for **two untyped, tool-free queries**. That establishes a concrete embedding seam, not a complete port or a durable evaluator.

### Query driver and typed binder semantics

`src/runtime/query-tool-loop.ts:88-178` requires three operations: next free-phase turn, run its parallel tool batch, and forced responder turn. A parallel batch counts as **one round**. The forced turn is exempt; typed `max_rounds:0` issues no free-phase request. Validation/depth precedence, transport errors, repair attempts and no-rollback committed-effect accounting remain Theta-owned.

Production `extension/off-session-respond-dispatch.ts` uses an exact selected replay context and one synthesized named responder tool; binder has its own inference/default/repair path (`src/binder/binder-inference.ts`, `extension/binder-run.ts`). Neither can be replaced by “submit an input and take whatever final text appears.” Durable tool output schemas do not implement these model protocols.

**Practical route:** use released pi-ai `Models` with provider-specific options for the forced/binder calls, plus Theta validation/repair, and a deliberate custom request/tool-loop driver for the free phase. Durable built-in generation is useful for ordinary runs, but `ConversationStreamOptions` is curated and `beforeRequest` replaces messages only. It does not expose a named-tool forcing or general loop takeover contract ([D-types], [D-generation]). Unsupported options smuggled through JS objects are not a supported API design.

### Tools and permissions

Current Theta resolves stock Pi tools and execute-less installed tools through different production paths (`extension/callable-pi-tool-resolver.ts`, `production-host-loop-dispatch.ts:1-37`). The latter can author a zero-token synthetic native turn, with transcript/model-switch costs; it is not asking an LLM to choose the requested call.

Durable has more direct tool machinery: nested `api.executeTool` performs validation, hooks, output policy, ownership and replay; our low-level public ToolTask probe ran the registered implementation deterministically without provider calls. **Do not call a tool's raw `execute()` to bypass these mechanisms.** However, the public nested helper is on a tool invocation, not the top-level Conversation/TaskRuntime; a new composition must choose a supported wrapper/task/receipt arrangement. Our direct model-issued ToolTask fixture deliberately wrote an assistant/tool-result entry. It does not establish transcript-free code-origin tool observation or complete Pi installed-renderer parity. Draft RFCs 0016/0017 are future proposed contracts, not already-implemented requirements to silently attribute to current code.

Native `beforeTool` denial was tested; no interactive approvals or filesystem sandbox were installed. Durable's `NodeExecutionEnv` is execution access, not evidence of a ready-made consent/sandbox regime. The app must authorize and isolate native operations explicitly. A sidecar with unrestricted fs/shell is not permission-aware native parity.

### Children, process placement and result envelopes

Current `subagent fn` production uses `runSubagentFnChild`, explicitly **not** the in-memory session-switch test hooks (`statement-executor-types.ts:111-139`). Existing source also enforces child bootstrap/authenticated control plane, callable closure hashes, cwd/root placement, invoke provenance/depth, kill/liveness and typed `theta_result`/`fn_tail` envelopes (`runtime/subagent-*`, `extension/production-subagent-host.ts`, `production-result-channel.ts`).

Durable task-owned conversations/children are excellent alternative primitives, but replacing separate Pi processes with in-process conversations changes isolation and placement semantics. Either preserve a process worker backend, or specify and test the new host's isolation contract. A final assistant JSON blob is not automatically a validated Theta child envelope. Likewise, `par for` must preserve indexed typed Results and deterministic diagnostic draining, not just Promise.all text answers.

### Source stability versus host portability

Pure Theta computation/type/schema semantics can remain stable. Sources naming Pi tools, argument/result fields, extension namespaces, runtime session tools, specific models/providers/thinking levels, bind models, or placement/root settings may not. Durable ships four coding tools (`read/write/edit/bash`), not a proof of the same installed Pi inventory or override behavior. Map deliberately or fail with explicit incompatibility diagnostics; never silently broaden tool access or substitute a different model to manufacture compatibility.

## 5. Executed experiments and negative paths

All scripts/logs referenced here are retained. No tests exercised project-writing tools; counters/stores live only in this workspace.

### A. Native conversations, exact tools, typed nested results, cancellation

`probes/conversations.mjs` → `logs/conversations-final.log` (final verification; earlier successful and failed logs also retained).

1. Two inputs retained both user messages and the same provider identity. Retrying request ID `stable-1` returned the original submission ID without another provider call—even with a changed payload.
2. Reconfigure `tools: []`: faux provider's replayed current tools were exactly empty, not just denied executors. Reconfigure modelTools to one `driver`: model saw only that tool, while the driver's nested call could still use a tool with `callers:["tools"]`.
3. Nested calls yielded `{value:42}`, `blocked`, `invalid_structured_output`, and `tool_unavailable` as appropriate. Only the allowed implementation incremented the execution counter.
4. A public committed assistant entry + `tx.createTask(ToolTask, ...)` invoked `count({n:9})` and settled the real ToolTask with **zero provider requests**. This is intentionally a low-level fixture, not an undocumented top-level tool API.
5. Singleton `__theta_respond_probe` exposure worked, but emitted `toolChoice:null`. A subsequent plain-text noncompliant answer was still a native `done`. **Native settlement does not establish successful Theta typed response.**
6. Parallel independent conversations each saw only their own user input and had different provider UUIDs.
7. Cancelling `Submission.wait`'s Context rejected that waiter, leaving the input **placed/running**. `Conversation.abort` then settled it `unanswered`, reason `aborted`, and idle join completed.

### B. Exact named response at the lower model layer

`probes/named-response.mjs` → `logs/named-response-final.log`.

Real released `Models.complete`, OpenAI Responses request builder and SSE parser were used, with a **fully in-memory fetch replacement** and a noncredential fixture key. The serialized request had exactly one response tool and:

```json
{"tool_choice":{"type":"function","name":"__theta_respond_probe"}}
```

The parsed result was `stopReason:"toolUse"`, arguments `{payload:{n:42}}`. This is a useful **positive escape hatch for a new custom driver**, not proof of Durable native-generation forcing, actual ChatGPT auth, remote strict-schema support, binder repair, or provider noncompliance behavior.

### C. Tiny real Theta parser/interpreter through Durable

`probes/theta-seam.ts` → `logs/theta-seam-final.log`.

Fixture includes an ordinary `fn double(n)`, two `@` queries with `?`, and interpolation of a prior query result. Real production parser, environment, statement executor, pure evaluator and query renderer produced:

```text
query 1: Compute the value of 12
query 2: Use the previous answer 12 in the next calculation
outcome: success; result: ["12", "42", 42]
```

There were exactly two provider-fixture calls and two real query checkpoint notifications. Scope excludes typed queries/binder, query tool rounds, imports, invoke/subagent, runtime/context APIs, full production composition and restart. No changed source or generated project build was required; local tsx loaded source read-only.

### D. Same-conversation tool reentry creates a circular wait

`probes/reentrant.mjs` → `logs/reentrant-final.log`.

A `theta` tool submitted another input to its own busy conversation then awaited it. After a bounded observation window: outer input was `placed`; inner input was `queued`; generation was `waiting` on the tool; tool was running; **only one provider call** had occurred. Explicit abort settled/joined both.

This is expected ownership/queue behavior, not a host defect. **A Theta command must run outside the current tool round, or drive a separate child conversation.** A steer is placed after the current tool round too, so it does not inherently solve that cycle.

### E. Model boundary: actual SIGKILL, storage reopen, partial recovery

`probes/run-generation-crash.sh`, `probes/generation-crash.mjs` → `logs/generation-crash-run.log`, `probes/generation-results/`.

- Opened real JSONL storage with `fsync:true`; submitted request ID `generation-crash-1`.
- Waited until a partial assistant message was **committed**, then sent SIGKILL; `wait` recorded exit **137**.
- New process opened the same store: generation was pending at its **request** checkpoint with `restarts:1`, input still placed, submission ID **8**.
- Resubmission with the same ID reused submission 8. Recovery retained the partial as an **aborted** assistant entry and produced the new final answer.
- External provider-fixture counter had **two calls**, one in each process. This is request reissue, **not continuation of the original stream or exactly-once model billing**.

### F. Independent adversarial recovery/storage probes

See `recovery-analysis/REPORT.md`, scripts and full results. All counted kill cases exited **137**, then recovery exited 0.

| Boundary | Verified observable |
|---|---|
| Custom task after committed next-phase checkpoint `{local:41}` | Initial phase once; second phase twice; preserved checkpoint; terminal result **42**. JS second-phase locals did not survive: its handler reran. |
| Safe tool after external counter but before result commit | Counter **2**; same task recovered successfully by executing again. |
| Unsafe tool at same boundary | Counter **1**; task failed with **interrupted**, warning it may have partially run. |
| Safe parent after completed nested child | Parent counter **2**, child counter **1**; same nested task/result reused. |
| Same nested key with changed arguments after restart | No repeated child effect; explicit mismatch error, not silent stale-result success. |
| Commit callback writes internal entry, performs external effect, then throws | Internal entry absent; external counter remains. **Internal rollback is not external rollback.** |
| Submission reopen and dedup | Same request ID returns old submission/data; changed same-type payload ignored; cross-type reuse rejected. |
| Same request ID in a fork | New admission; dedup is scoped to conversation, not global semantic work. |
| SIGKILL after successful sidecar append, before main commit marker | Neither entry recovered. |
| SIGKILL after marker append, before acknowledgement to caller | Both entries recovered. |

Commit-window probes wrapped the released filesystem adapter only to pause after a real append at the selected boundary. Encoding, commits, recovery and storage were the released implementation—not reimplemented stubs. They test process death, not power loss, corrupt disks, competing owners, SQLite or every I/O boundary.

### Failed exploratory assumptions retained honestly

- Conversation script initially used faux `stopReason:"stop"` for a tool-call message, so native generation legitimately did not run the tool. Fixed fixture to `toolUse`; initial log retained. Not a tool-dispatch defect.
- First Theta fixture used a bare object literal in a forbidden tail position. Real parser rejected it; changed to an array and obtained a diagnostic-free successful parse. No parser weakening.
- Named-response fixture first had a JS delimiter error, corrected before its successful run.
- Reentry cleanup initially reused an invocation-bound inner Submission after its owning tool ended; it correctly rejected. Reacquired through `harness.submission(id)` for final assertions.
- Delegate preserved its TypeBox import, stored-name/object agent-option, numeric-ID, fork ownership and commit-filename mistakes. Early fixtures with only an unresolved Promise exited **13**, not SIGKILL; those are explicitly **excluded** from kill evidence. Adding a keepalive and rerunning fresh yielded 137.

## 6. What “durable” would mean for Theta

### Durable conversation work is real; a durable interpreter is separate

A Durable task stores kind/version/input/ownership/state/checkpoint. Reopening converts surviving running tasks to pending with their stored checkpoint. The scheduler invokes that phase **from its top** ([D-scheduler], [D-tasks]). A saved model/tool task is not the suspended JavaScript stack of `executeBody()`.

Theta's similarly named `ProductionCheckpoint.before()` (`src/seams/production-checkpoint.ts:20-38`) yields a macrotask for loop iterations and a microtask elsewhere. It supports cancellation observation. It **does not write disk, save locals or serialize a continuation**.

| Theta state to preserve for genuine resume | Present current representation / required new durable representation |
|---|---|
| AST/program counter and nested expression evaluation | Async tree walk and block indices; persist a continuation/activation stack or deterministically replay the walk against a complete journal. |
| Lexical environment/locals/parameters/module scopes | Runtime Maps/scopes; encode values, declaration residence and identity. Plain JSON may lose interpreter-private enum/schema/Result branding and identity. |
| Loops / ordinary fn stack | Iterands, loop index, return/break/continue state, argument evaluation progress and frames must be represented, not guessed from transcript text. |
| Query results and forced responder/binder state | Persist return values, schema/repair phase, accepted response, context cutoff, attempt counts and terminal-error provenance before exposing them to resumed computation. |
| Parallel join state | `par-for-executor.ts:261-336` currently has arrays, `nextIndex` and Promise workers. Persist lane identity/admission/outcomes/join/cancellation and deterministic diagnostic order. |
| Invoke/subagent provenance and budgets | Preserve per-chain depth, round/repair ceilings, source/closure hashes, placement/roots, child IDs, envelope validation and whether an effect was admitted/completed. |
| Cancellation/failure/finality | Persist abort intent and terminal outcomes; avoid resurrecting cancelled lanes or changing a completed result after restart. Existing no-rollback semantics must remain. |
| External inputs/nondeterminism | Snapshot source/imports/config/tool/model policy, external reads/time/randomness and replay order, or journal their results. |

A task-per-effect ledger helps only if the **parent's continuation and effect identities** survive, or the parent can replay deterministically and reattach. Task-per-effect alone does not tell a restarted interpreter which `let`, loop iteration or function frame comes next.

### Exactly-once limitations and crash windows

ToolTask stores final validated arguments and replay policy **before execute**. On recovery it reruns only when both stored and current tool say `replay:"safe"`; otherwise it writes interrupted failure ([D-tool] lines 130-204). The actual option is `replay`, not an inferred `replaySafe` flag.

The unavoidable windows are:

1. Intent committed, execution not yet begun: unsafe recovery may report interrupted even though no external effect happened.
2. External effect committed elsewhere, local result not yet committed: safe recovery can duplicate it; unsafe recovery cannot know whether it completed.
3. Local terminal result committed, client acknowledgement lost: reacquire/dedup retrieves the stored result.

Internal document/transcript/task writes can be atomic together. An arbitrary file/network action and Durable's storage are **not one transaction**. Exactly-once external behavior needs target-supported idempotency keys, an atomic outbox/transaction within the same system where applicable, or reconciliation. `api.memo`, nested keys, provider session UUIDs and submission request IDs do not close an external effect/commit window. The counter probes demonstrate the difference.

Nested keyed calls enforce same tool/arguments and reuse task/results, but those result documents retire with the parent. They are not a permanent cross-invocation business-action ledger. Positional keys are fragile if parallel completion or changed code affects call order; use stable language-level effect identities, then still enforce target idempotency.

Unsafe means **no automatic replay of that interrupted call**, not “effect definitely did not happen.” A model/user can issue a new equivalent call/task later and repeat the effect. An interrupted invocation's recovery policy must surface uncertainty rather than auto-reissue dangerous operations.

### Queues, retries, code changes and policy changes

- Submission dedup is **conversation + request ID**. Reusing an ID with changed same-type content silently returns the original input; bind your adapter's stable IDs to payload/source hashes if equality matters ([D-submissions] lines 201-225).
- Model requests may be repeated after a crash. Retries have persisted backoff; native provider/SDK retry and Durable generation retry are different layers. Deferred handles/polling have separate phases. Neither the recovery tests nor cached model IDs prove live retry/idempotency behavior.
- Registry code is not stored. Reinstall extensions on reopen. A running phase retains its resolved code; subsequent phases resolve current registry/agent/env. A request's model/options/cutoff are checkpointed, but initial preparation/rendering and hooks have their own replay windows.
- Ordinary tasks resolve by **name/version/migration**, not automatic content hash. Same-version changed implementation is accepted. Tool definitions/hooks are not automatically content-pinned. Theta source/closure hashes and adapter ABI/policy versions therefore need explicit durable identity.
- **Permission nuance:** safe ToolTask recovery uses stored final arguments and does not rerun initial `beforeTool` admission hooks. A newly revoked policy implemented only in that hook is not automatically reauthorized on replay. Decide whether approvals authorize an admitted operation across restart, and validate revocation/expiry in the replay execution policy where needed. Do not claim fresh consent on each recovery.
- Missing/outdated/unmigratable definitions block; repeated crash cutoff can park after default **5** restarts. `retryTask` is explicit. This is useful crash-loop protection, not Theta's query/invoke budget accounting.
- Child creation and parent waiting state can be committed atomically. allSettled/failFast, completing joins and bottom-up abort are real features. Background tasks intentionally escape ordinary parent abort/idle; do not accidentally use them for Theta work that must be joined.
- Unsafe tool children default to abandonment on restart; safe parents can reattach. An in-memory await without a recovery owner is not enough to supervise persistent work.

### No rollback and the existing restart-by-reissue proposal

Theta's `src/runtime/no-rollback.ts` and `terminal-outcomes.ts:45-100` preserve completed effects and committed partial surfaces through cancellation, `?` and panic. Durable abort handlers permit application cleanup; they must not silently introduce compensating edits/turns contrary to Theta semantics. A stored abort should remain an abort, not a new attempt after reopening.

[Theta RFC 0013](https://github.com/bitmonk8/pi-theta/blob/28424268b24a41536975e69606bd5a848047bbc1/docs/rfcs/0013-long-running-theta-restart-contract.md) is explicitly **draft/no code yet**. It distinguishes transcript resume from **reissuing a command against an author-owned durable store**, with survey/confirmation rather than autonomous restart by default. Durable conversation resume, whole-Theta reissue, deterministic effect replay and actual interpreter continuation are four different contracts. A first Durable host can preserve the honest reissue model; it must not relabel it transparent resumption.

### Important positive precedent: released durable codemode

Do not overlook a capability the release actually has: `@earendil-works/pi-durable/codemode` implements **deterministic QuickJS replay**. It stores start data, seed/virtual clock, VM fingerprint/module version and a result-delivery journal **before delivery**; reruns script execution from the beginning, reattaches keyed nested calls, and refuses divergence/version/fingerprint/deadline mismatches ([D-codemode] lines 1-35, 84-105, 407-452, 615-640).

This is genuine code execution/replay, not a model interpreting a script. It is **not** host JS heap serialization, a Theta VM loader, or proof that the current Node interpreter/import graph fits QuickJS. It was source-inspected, **not kill-tested here**. A future Theta journal could use the same architectural discipline without translating deterministic Theta control flow into model instructions. That remains a runtime design with value identity, scheduling and failure proofs—not a configuration switch.

## 7. Feasible architectures and tradeoffs

### 1. In-process Node shared-core host — recommended ordinary-hosting prototype

```text
new frontend/command dispatcher
  → source discovery, binder, invocation ownership/policy
  → existing deterministic Theta parser/evaluator
  → new effect host
       query: explicit pi-ai request / bounded tool-loop driver
       tool: native Durable validation/policy/owned task path
       invoke: isolated conversation and/or process worker + typed result validation
  → Durable storage, views, task ownership and diagnostics
```

Advantages: direct single-request provider APIs, exact callable/model-visible sets, trusted Node imports, native structured nested returns, committed state/UI observation, clear ownership and storage boundaries. Avoids the reviewed Codex/OpenCode public API gaps around arbitrary native executor access and some raw request options.

Costs: new app composition and frontend, permission/auth/discovery/runtime mappings, current Pi integration replaced rather than reused; native whole-run generation is not Theta's exact QueryModelDriver. Keep the main interactive conversation drive **outside an active model tool round**. The small fixture proves this language boundary, not the rest of the architecture.

### 2. Durable whole-invocation task/tool, ordinary interpreter inside

Start invocation durably with source/args/identity and produce a typed receipt. Run the interpreter with a separate owned child conversation if entered as a model tool. Initially treat interruption as unsafe/unknown; abort/join owned work and surface an honest interrupted result.

Benefits: durable job admission, task graph, child cancellation and progress, without pretending to serialize language control. Costs: loses in-flight interpreter progress; orphaned persistent children need explicit abandonment; reissue must be operator/author policy. Marking the whole body replay-safe because some nested calls are safe is unsound.

### 3. Task per invocation/effect with **explicit interpreter continuation**

Persist activation frames, PC, scopes, budgets, lanes and pending effect receipts as task checkpoints/docs. Commit next-state + child admission/wait atomically; preserve typed results before advancing. This can support genuine continuation-level Theta durability and reuse Durable's scheduler.

Costs: invasive new runtime representation/migrations, value codec, source/hash/policy identity, parallel/cancel/error semantics and storage overhead. Effects still need idempotency. This is a separate feature project, not an adapter-only change.

### 4. Deterministic interpreter replay with an effect/result journal

Restart `executeBody` from the beginning against pinned code/config and recorded effect returns, releasing only new effects after replay validation. May share more of the current interpreter than explicit PC serialization. Durable codemode is a useful precedent.

Costs: every nondeterministic input and delivery order must be controlled; indexed effect identity cannot depend on accidental scheduling; branded values/enum identity, budgets, cancellation, source residence and typed failures must be rehydrated exactly. Replaying just tool names/results without checking arguments/control history is insufficient. Unfinished external effects retain safe/unsafe ambiguity. Requires divergence refusal and adversarial crash tests before any durability claim.

### 5. External process / sidecar

A Node Theta engine can own a Durable host over a purpose-built protocol; worker process boundaries can preserve stronger CPU/crash isolation and existing placement. One process must own each store; use IPC/RPC, not concurrent database opens. The protocol must carry stable invocation/effect identity, typed outcomes, cancellation/join and replay uncertainty. No such turnkey Durable daemon/protocol is exported by this package.

Alternatively spawn unchanged Pi Theta and return its authenticated envelope. That preserves more current code but Durable only owns a **job receipt**, not Pi's interpreter continuation. PID/session transcript persistence is not durable execution. Do not transfer native tools to a privileged sidecar to evade the host's policy.

### Relative to current Pi, Codex and OpenCode

- **Current Pi host:** keeps existing interactive extension commands, tool inventory, auth, renderers and child placement; Theta interpreter still is not restart-persisted. Durable offers stronger explicit storage/task orchestration but replacing Pi loses a ready-made application and its integrations.
- **Codex investigation:** strong owned workers and app-server, constrained stock TUI plugin path and shared-thread sidecar authority. Durable is a library with direct source-level composition, so that RPC boundary is avoidable—but there is no Codex-like ready CLI/frontend to retain.
- **OpenCode investigation:** demonstrated real native TUI commands and existing-session drive, but native executor/loop control and overlapping settlement gaps. Durable has explicit task/submission identities and programmable tool machinery, reducing some uncertainties in an app we own. It does **not** provide an equivalent existing OpenCode/Pi TUI attachment.

None of these comparisons proves full host parity, live provider compliance, or unchanged portability of host-specific Theta source.

## 8. Authentication, runtimes, UI and distribution caveats

### OpenAI and supported authentication

Released pi-ai 1.4.0 `openaiProvider()` explicitly supports **OpenAI (ChatGPT subscription)** OAuth (`isSubscription:true`) as well as API keys; its provider is `openai`, API `openai-responses` ([AI-OpenAI]). The shipped artifact catalog includes **`gpt-6.1-sol`** and reasoning levels. It distinguishes chat inference from the Luna classifier API, which OAuth filters out. Old `openai-codex` credentials are not interchangeable by relabeling provider IDs.

A Durable app receives a host-owned `Models`; `createModels({credentials,authContext,...})` and provider login/refresh/store interfaces are the supported path. Installing Durable does not discover the current Pi credential store, login or model configuration. Existing configured authentication should only be reused through an authorized supported host API; otherwise use the provider's supported login into an app-owned store. No credential extraction/copying is warranted.

**Source support is verified; this operator's current entitlement and a successful live `openai/gpt-6.1-sol` request are U.** No live test was necessary to establish the offline control/recovery claims, and none was run. A later live gate should be tiny, OpenAI-only, read-only/zero-tool, and use supported subscription auth.

### Node versus portable runtimes

Node is the least disruptive first host: current Theta uses Node crypto/path/filesystem/process/socket helpers, YAML/AJV/formats and watchers. Its development Pi dependencies target `~1.3.0`, while Durable pins **1.4.0**. A successful tsx source import is not a full build/type compatibility or dependency-extraction proof; audit the complete runtime graph and prevent accidental loading of the Pi production composition.

Durable has portable storage/env abstractions, browser IndexedDB and Cloudflare Durable Object SQLite support. That does not make current Theta Node code portable. Workers need alternate filesystem/process execution and wake/alarm ownership; visible/herdr child placement and local Pi tools are not present there. Codemode's QuickJS/remote sandbox is a different runtime. No Cloudflare/browser/Bun deployment was executed.

Trusted host task/tool callbacks are not automatically sandboxed. Model stream timeout, task restart limit and codemode sandbox quotas are not substitutes for Theta's per-query rounds, invoke depth, imports, runtime access policy or whole-invocation CPU/memory constraints. Noncooperative code can delay close/abort; process isolation remains useful.

### Storage and distribution

- One process owns a storage; **no cross-process locking**. Production needs host-level ownership/fencing/coordination, not multiple workers sharing a raw store.
- JSONL `fsync` defaults false and retains history in memory; SQLite defaults WAL + synchronous NORMAL. Our process-kill/fsync probe does not certify power-loss retention. Select an explicit durability/backup/privacy policy.
- Registry definitions are process code, not stored. Distribution must reinstall matching definitions and include migrations/source identities. Experimental ABI upgrades require restart compatibility tests.
- Transcript, tool args/results, documents and journals may contain sensitive project content. No encryption-at-rest/security property was tested; durable storage is a new privacy/retention responsibility.
- `viewState`, `watchEvents` and taskGraph support a frontend, not ready commands/dialogs/tool renderers. Slow watchers can receive a fresh snapshot rather than every intermediate event. Preserve operator diagnostics/progress and typed outcomes independently of transient UI delivery.

## 9. Decisive next gates — before implementation/parity commitments

1. **Define the product boundary:** ordinary Durable-native host, isolated-worker adapter, or genuine durable interpreter. Publish different contracts and names; do not let an admission receipt imply continuation recovery.
2. **Extract/build the shared core without Pi bootstrap:** real parser/types/AJV/import/function/Result/enum corpus under pinned dependencies. Verify current `~1.3` assumptions against 1.4 APIs; preserve all project sources read-only until separate implementation authorization.
3. **Complete query/binder protocol prototype:** exact free turns and parallel round admission, `max_rounds:0`, named responder, wrong-tool/text/missing/invalid/depth/transport outcomes, repair budgets and error precedence. Use actual Theta validator/decoder, not a JSON-only success fixture. Then one tiny supported-auth OpenAI Sol test.
4. **Native tool policy/observability gate:** deterministic installed implementation selection, exact tool exposure separately from denial, schemas/results, async approvals, cancellation, effective cwd/env, replay-time revocation, code-origin transcript/UI placement. Never bypass native policy by invoking raw implementations from a sidecar.
5. **Ownership/transition gate:** overlapping user/background inputs, source command while busy, cancel wait versus abort, reset/fork/compaction, stale result rejection, multiple query model/tool overrides and restoration. Avoid the reproduced same-conversation tool reentry cycle.
6. **Children/parallel gate:** map process placement versus in-process conversations explicitly; preserve callable/source hashes, depth/provenance, typed envelopes/fn tails, parent death, per-index Result/diagnostic ordering and all cancellation joins. No implicit background escape.
7. **If durability is desired, design it first:** versioned continuation/value codec or deterministic journal, payload-bound IDs, code/config/policy identity, stable effect/lane keys, idempotency/reconciliation and cancellation finality. Kill at each admission/effect/commit/join/typed-return boundary; include upgrades, divergent replay, missing definitions, budget exhaustion and partially completed external effects. Prove no rerun of completed effects beyond the declared target-idempotency contract.
8. **Operational gate:** single-store owner/fencing, durability/backup policy, privacy/retention, restart-limit UI, failed-run queue policy, supported auth stores and packaged frontend/worker lifecycle. Test power-loss requirements separately from SIGKILL.

**Recommendation:** authorize, if desired, only a small **ordinary Node shared-core/owned-conversation prototype** first. Do not promise transparent durable Theta until gate 7 has a separately reviewed contract and evidence.

## 10. Source anchors, reproduction and artifact index

### Immutable host sources

Reference definitions used throughout:

[D-types]: https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/durable/src/harness/types.ts#L210-L346
[D-generation]: https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/durable/src/harness/generation.ts#L195-L234
[D-tool]: https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/durable/src/harness/tool.ts#L130-L204
[D-scheduler]: https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/durable/src/harness/scheduler.ts#L370-L411
[D-tasks]: https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/durable/src/types.ts#L214-L354
[D-submissions]: https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/durable/src/harness/submissions.ts#L201-L225
[D-codemode]: https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/durable/src/codemode/codemode.ts#L1-L105
[AI-OpenAI]: https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/ai/src/providers/openai.ts#L9-L35

Additional anchors:

- [Agent/tool selection](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/durable/src/harness/agent.ts), [curated stream options](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/durable/src/harness/types.ts#L484-L496), [generation hooks](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/durable/src/harness/types.ts#L852-L895).
- [Nested key reuse/argument checks](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/durable/src/harness/tool.ts#L733-L790), [task definition/version fit](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/durable/src/harness/scheduler.ts#L1590-L1618).
- [Internal commit-before-publish](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/durable/src/session/session.ts#L724-L766), [JSONL append/marker](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/durable/src/storage/jsonl/storage.ts#L278-L307).
- [Direct OpenAI-specific tool choice and request building](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/ai/src/api/openai-responses.ts#L143-L151), [serialized tool_choice](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/ai/src/api/openai-responses.ts#L398-L400).
- [Released README](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/durable/README.md), also preserved verbatim in `release/package/README.md`.
- [Theta effect host contract](https://github.com/bitmonk8/pi-theta/blob/28424268b24a41536975e69606bd5a848047bbc1/src/runtime/statement-executor-types.ts#L68-L175), [query driver](https://github.com/bitmonk8/pi-theta/blob/28424268b24a41536975e69606bd5a848047bbc1/src/runtime/query-tool-loop.ts#L88-L178), [cancellation-only checkpoint](https://github.com/bitmonk8/pi-theta/blob/28424268b24a41536975e69606bd5a848047bbc1/src/seams/production-checkpoint.ts#L20-L38), [parallel in-memory state](https://github.com/bitmonk8/pi-theta/blob/28424268b24a41536975e69606bd5a848047bbc1/src/runtime/par-for-executor.ts#L261-L336).

### Reproduce main provider-free probes

Run from this report directory. Install/cache/temp outputs must remain here. `npm` was absent from the initial shell PATH; a public npm CLI artifact was downloaded locally instead of globally installed. Its exact version is in `release/npm-cli-metadata.json`.

```sh
cd /home/thomasa/Projects/pi-theta/.pi/tmp/dual-host-research/pi-durable
node --version                       # v22.23.3 in this investigation
node release/npm-cli/package/bin/npm-cli.js ci \
  --prefix "$PWD/probes" --cache "$PWD/npm-cache" \
  --ignore-scripts --no-audit --no-fund > logs/reinstall.log 2>&1

node probes/conversations.mjs > logs/conversations-rerun.log 2>&1
node probes/named-response.mjs > logs/named-response-rerun.log 2>&1
node probes/reentrant.mjs > logs/reentrant-rerun.log 2>&1
TMPDIR="$PWD/probes/tmp" TSX_DISABLE_CACHE=1 \
  node probes/node_modules/tsx/dist/cli.mjs probes/theta-seam.ts \
  > logs/theta-seam-rerun.log 2>&1

# MUST use a fresh output dir; runner rejects an existing provider counter.
bash probes/run-generation-crash.sh "$PWD/probes/generation-rerun-$(date +%s)" \
  > logs/generation-rerun.log 2>&1
```

Recovery delegate reproduction and fixture qualifications are in `recovery-analysis/REPORT.md`. Its runners use fixed `results/` and `commit-results/`; **do not rerun against existing evidence stores/readiness files**. Make a fresh copy beneath this same writable workspace, excluding result directories, and run there. Its raw logs/counters, not shell exit codes alone, establish the outcomes above.

### Artifact index

| Path | Contents |
|---|---|
| `initial-*`, `investigation-started.txt` | Supplied initial package/date/HEAD/status artifacts; unmodified. |
| `release/VERIFIED.json`, metadata/tag/provenance files | Authoritative version/date/channel, digests, source pin, final latest recheck. |
| `release/pi-durable-1.4.0.tgz`, `package/`, `source.tgz`, `source/` | Exact published package and matching commit source archive. |
| `release/source-map-comparison.json` | 84 embedded sources versus provenance commit, all matching. |
| `probes/package.json`, `package-lock.json`, `node_modules/` | Isolated exact host dependency installation and tsx tooling; no project dependency changes. |
| `probes/*.mjs`, `theta-seam.ts`, `run-generation-crash.sh` | Complete main scripts, including negative paths. |
| `logs/*`, `probes/generation-results/` | Complete main logs, generation storage/counter and actual kill/reopen evidence. |
| `logs/theta-*` | Baseline/observed/final HEAD/status and inspected Theta source hashes. |
| `api-analysis/report.md` | Independent release/API/Theta compatibility research, raw artifacts and source-map extracts. |
| `recovery-analysis/REPORT.md` | Independent adversarial recovery analysis and all scripts/results/failure logs. |
| `ARTIFACT-SHA256.txt` | Selected reproducibility/evidence artifact checksums; excludes caches, installed dependencies and itself. |

**Final scope statement:** research only. The native-versus-worker distinction, ordinary-versus-durable execution distinction, external-effect uncertainty and live-provider unknowns remain explicit. No production port or project modification was performed.
