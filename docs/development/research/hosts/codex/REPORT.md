# Latest released OpenAI Codex as a Theta host

> **Developer research, not end-user documentation or an accepted specification.**
> Relocated from `.pi/tmp/dual-host-research/codex/REPORT.md`. Historical release/source pins and evidence limitations remain in force.
> Unless a link points to another tracked document, experiment paths and reproduction instructions refer to the original local evidence workspace, `.pi/tmp/dual-host-research/codex/`; downloads, caches, scripts and raw logs remain gitignored and are not required to read this report.

**Research date:** 2026-10-19 UTC\
**Release investigated:** **Codex CLI and official TypeScript SDK 0.163.0**, released **2026-10-15T21:30:38Z**\
**Source commit:** `83086188ae0614bd882818ff1aa23f3194962012`\
**Verdict:** credible **isolated-worker/custom-frontend substrate**; a genuine but constrained **same-existing-thread sidecar** route exists. **Full Theta parity as a stock current-TUI plugin is not established.**

## 1. Executive decision

Codex 0.163.0 is substantially more capable than “a CLI plus MCP/skills.” Its released app-server provides correlated turns, schema-constrained final messages, interruption, persistent threads, experimental client-hosted tools, direct sandboxed command execution and direct MCP calls. Stock hooks are stable/default-on. The stock TUI can use a shared daemon, and another client can rejoin the same loaded conversation.

The distinctions are decisive:

1. **Native plugin/hooks in the existing stock TUI:** real deterministic hook execution and Stop-hook continuation exist, but no audited arbitrary executable slash-command registrar, exact per-query tool-set replacement, or scoped exclusive interpreter ownership. **Not a demonstrated complete Theta host.**
2. **Sidecar attached to the same app-server/thread as the TUI:** technically real, not a launcher fiction. It can submit actual turns and observe results. But it shares turn admission and approval authority with other subscribers; it does not automatically track the TUI's displayed thread. **Worth a restricted prototype, not a parity claim.**
3. **Theta driving separate Codex workers:** the strongest practical starting point. Raw app-server has considerably more control than the official npm SDK. **Feasible for a deliberately bounded host adapter**, with exact-tool, round-budget, permission and typed-result semantics still needing gates.
4. **Custom frontend/proxy:** can own command dispatch, user input and UI, addressing major concurrency problems. It does not by itself add missing app-server tool-registry/native-tool APIs. **A new frontend, not a stock-TUI extension.**
5. **Codex launches unchanged Pi Theta children:** valid hybrid deployment, but **a launcher of Pi**, not Codex-native Theta hosting.

The deterministic Theta evaluator must remain in code. Nothing here recommends having the model interpret `.theta` source or choose the interpreter's control flow.

### Strongest experimental evidence

Against the downloaded, digest-verified release binary, using **only a localhost Responses test double**:

- Dynamic tool call/result round-trip, strict output-schema forwarding, sequential turns, parallel independent threads, interruption, history, fork and cross-process resume worked.
- A read-only `command/exec` rejected a write; workspace-write allowed a write only in the disposable workspace tested. Direct MCP invocation returned `42` with code-supplied arguments; missing-tool dispatch errored.
- A fresh structured worker configured with explicit feature/MCP overrides sent **`tools: []`** and a strict JSON Schema. This materially improves binder/typed-only feasibility.
- Supplying an unsupported per-turn `dynamicTools: []` did **not** remove the thread's dynamic tool or ambient native tools from the model request.
- A second `turn/start` while a turn was active returned the **same turn ID**. A conflicting schema was rejected with `ActiveTurnOutputSchemaMismatch`.
- Two independent WebSocket-over-Unix clients of **one** stock app-server rejoined a durable thread and received the same completion. Both received the same approval request; the **second subscriber's decline** resolved the first client's turn.

**No provider-backed Codex inference or ChatGPT Pro entitlement was verified.** Native login in the isolated Codex home reported `Not logged in`. Static model listing is not subscription verification. No Pi credential transfer, token extraction or private auth-file inspection was attempted.

## 2. Release pin, provenance and scope

Authoritative checks, repeated near completion:

| Item | Result | Local evidence |
|---|---|---|
| GitHub latest stable | `rust-v0.163.0`, `prerelease:false`, published October 15 | `release/github-latest.json`, `github-latest-final.json` |
| Annotated tag | `129b8ec7ee6f4511557a4856279f529025c25af4` → commit above | `release/tag-ref.json`, `tag-object.json` |
| npm CLI / SDK `latest` | both `0.163.0` | `release/npm-*-latest.json` |
| Newer channel | `0.164.0-alpha.5`, October 19, explicitly prerelease | `release/github-recent.json`, `npm-dist-tags.json` |
| Actual executable | `codex-cli 0.163.0` | `logs/version.txt` |
| Native Linux artifact | official `codex-x86_64-unknown-linux-musl.tar.gz` | `release/codex-linux.tar.gz` |
| Archive integrity | GitHub SHA-256 matches computed `beb339e8ecd9ba057a6bb2dc81ad8ca474812edfbf0fc5056ca818797648dde4` | `release/binary-integrity.json` |
| Published SDK artifact | downloaded and registry SHA-512 verified by delegate | `api-audit/sdk.tgz`, `api-audit/REPORT.md` |

Links: [release](https://github.com/openai/codex/releases/tag/rust-v0.163.0), [GitHub latest API](https://api.github.com/repos/openai/codex/releases/latest), [npm CLI](https://registry.npmjs.org/@openai/codex/latest), [npm SDK](https://registry.npmjs.org/@openai/codex-sdk/latest).

All capability conclusions use this released source/binary, not alpha or main. Generated stable **and experimental** TypeScript protocol declarations came from the actual binary. The public website snapshots under `release/docs/` are supplementary, unversioned documentation—not proof of released executable behavior. The older JavaScript CLI generation, Rust CLI and npm subprocess SDK must not be conflated. The tagged SDK package manifest says `0.0.0-dev`; the published package is version 0.163.0 and pins the matching CLI.

### Research boundaries and concurrent source

Writable root was exclusively `/home/thomasa/Projects/pi-theta/.pi/tmp/dual-host-research/codex/`. Downloads, homes/configuration, temporary files, sockets, fake services, generated protocol, logs and reports stayed there. No global/package installation, project dependency update, project/configuration edit, staging, reset or commit was performed. No remote messages/services were modified. Experimental services were disposable localhost processes.

Theta HEAD was `a21bd1b27b09efdd7f71c7484b3f6d1fcd1dd299`, package 0.496.0. The working tree already had concurrent owned-turn/settlement changes, including untracked `src/extension/owned-turn.ts`; more tests appeared during research. **Theta anchors describe inspected working-tree bytes, not immutable HEAD contents.** Baseline/final status, HEAD and selected inspected-source hashes are in `logs/`. The status difference belongs to concurrent work and was not overwritten or attributed to this investigation.

Three bounded OpenAI-only full-tool delegates were launched and **all wait-collected**: Theta semantics, released API/artifacts, and same-thread daemon adversarial analysis. Their reports are included below. Previous Claude-host reports were used read-only for Theta leads, never as evidence about Codex.

## 3. Capability matrix

**B** = verified release-binary probe with canned localhost provider; **S/A** = exact released source/published artifact; **I** = architectural inference; **U** = not demonstrated. B does not imply live-model success.

| Obligation | Existing stock TUI / plugin | App-server worker or custom client | Evidence / qualification |
|---|---|---|---|
| Deterministic command registration | No general executable slash registrar found; skills are not code callbacks | Frontend can implement its own commands | S; static TUI enum / plugin manifest |
| Native hooks | Stable/default-on command and MCP handlers; prompt/agent handler kinds unsupported by loader | Hooks also apply to core lifecycle | S; meaningful callbacks, not general extensions |
| Multiple queries / settlement | Shared daemon sidecar can drive same loaded thread, but user can interfere | Own thread can serialize query admissions and await terminal IDs | B+S; start acknowledgment is not completion |
| Current interactive conversation | Conditional on same daemon/remote runtime and explicit thread identity | Separate app-server or SDK resume is not a live-TUI attachment | S; two-client same-server rejoin B; actual TUI untested |
| Typed final / binder | Schema final response exists; not current Theta's off-session forced-tool channel | Fresh zero-tool schema worker is demonstrated | B for request shape, U for live schema/model behavior |
| Forced named response tool | No audited public named-tool-choice control | Request builder uses `tool_choice: auto`; outputSchema is alternative protocol | B+S; deliberate adaptation required |
| Exact query-visible tools | No audited running-thread arbitrary tools/set | Dynamic tools thread-start-scoped; fixed empty tool profile works | B+S; per-turn `dynamicTools: []` ignored, not restriction |
| Deterministic code-side tools | Hooks can execute their own code, not arbitrary native tool API | `command/exec` and `mcpServer/tool/call` real; no universal builtin dispatcher | B+S; native approval/transcript parity differs |
| Permission handling | Native approvals visible in TUI; subscribers share ordinary requests | Frontend must handle approval RPCs and configure sandbox explicitly | B for denial / sandbox; S for shared callback ownership |
| Round/depth budgets | PreToolUse can block; no proven exact parallel-provider-round governor | Dynamic callbacks govern owned tools; native loop still needs enforcement | S+U; tokens/timeouts are not round caps |
| Independent workers / parallelism | Native agents exist, not Theta's authenticated typed child protocol | Parallel independent threads demonstrated | B+I; typed envelope/bootstrap still adapter work |
| Cancel | Hooks/interrupt native; not a lease | `turn/interrupt` → terminal `interrupted` demonstrated | B; SDK signal uses process cancellation instead |
| History / fork / resume | Same runtime rejoin preserves loaded state; current-display identity separate | Persistent read/fork/cold resume demonstrated; inject/compact APIs inspected | B+S; history ≠ post-compaction model context |
| Session transitions | No automatic sidecar tracking of TUI focus/new/fork/switch | Frontend can own lifecycle and reject stale results | S+I; upgrade/reconnect not acceptance-tested |
| UI / status | Fixed native TUI; hooks have constrained messages/status | Custom frontend/headless diagnostics are feasible | S+I; no Pi-like arbitrary renderer API found |
| ChatGPT Pro / models | Supported ChatGPT login; catalog includes `gpt-6.1-sol` | SDK/app-server use Codex-supported auth | S/A; actual entitlement and inference U |
| Runtime / packaging | Plugin distributes resources/hooks/MCP, not an arbitrary JS module in host | External Node evaluator avoids embedding restrictions | S+I; internal Rust embedding is a different project |

## 4. Actual Theta dependencies and semantic requirements

The reusable engine is not the existing Pi production extension unchanged. The useful boundary is parsing/types/schema/value evaluation → `EffectfulStatementHost` → query, tool and child/session effects. `src/runtime/effectful-statement-host.ts:96-224` injects those collaborators; `RuntimeRoot` is a seam holder, not a complete standalone runner (`src/runtime-root.ts:27-73`). YAML, Node path/hash helpers, AJV + formats, filesystem/watchers, checkpoints, process/socket infrastructure and the transitive import graph need intentional packaging. Production Pi message/model/session types need translation.

Directly inspected important dependencies:

- **Shared multi-query conversation:** `src/extension/live-prompt-query-driver.ts:140-163` drives real visible user turns and settles them before continuing. Query windows temporarily replace model/thinking/tools and restore them. `src/runtime/tool-registration.ts:84-208` installs the exact callable vector, not its union with ambient tools.
- **Ownership:** current `src/extension/owned-turn.ts:1-98` refuses ambiguous/foreign user spans and narrowly handles compaction relocation. `src/extension/turn-settlement.ts:63-165` accepts error/empty/tool-result endings as settled, but not an unanswered compaction. Codex IDs can improve correlation; they do not grant ownership.
- **Typed query/binder:** `src/runtime/query-tool-loop.ts:154-178` requires free turns, parallel-batch committed-side-effect accounting and forced final response. Typed production free work is on-session; finalization is **off-session**, with exact replay and one named response tool (`src/extension/off-session-respond-dispatch.ts:200-276`). Binder likewise has its own structured inference/default/retry/context policy (`src/binder/binder-inference.ts:384-468`, `src/extension/binder-run.ts:698-789`). A Codex schema-final thread is a plausible **intentional protocol adaptation**, not proof of the same tool-forcing/error semantics.
- **Deterministic tools:** Pi builtins are constructed/executed with Pi schemas (`src/extension/callable-pi-tool-resolver.ts:1-57,132-170`). Execute-less registry tools use a zero-token synthetic provider/native loop with verbatim code arguments (`src/extension/production-host-loop-dispatch.ts:1-37`). Do not replace that with “ask Codex to call tool X.”
- **Budgets:** `src/extension/prompt-tool-loop-governor.ts:113-222` enforces pre-side-effect depth and parallel-provider-round accounting. A parallel sibling batch spends one round. API-turn limits or reactive interruption are not equivalent.
- **Children:** launch/placement, authenticated control plane, closure hashes, cancellation and validated `theta_result` finality are substantive (`src/runtime/subagent-placement.ts:70-218`, `src/runtime/subagent-child-hash-verify.ts:124-173`, `src/runtime/subagent-launcher.ts:250-366`). A model's final JSON is not this envelope.
- **Lifecycle/UI:** invocation cancellation reaches actual model/tool/child work; session swaps invalidate old composition. Preserve observable errors, progress and system notes even in headless mode. UI cards themselves can be redesigned without changing language evaluation.

Full source-grounded analysis and further anchors: [`theta-semantics/REPORT.md`](theta-semantics/REPORT.md). Its caution that dynamic callbacks do not prove deterministic arbitrary native invocation is correct; **the separate MCP RPC is a positive exception established by the API audit and probes.**

## 5. Stock extension surface and same-existing-session route

### Hooks/plugins are genuine but constrained

Released [feature table](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/features/src/lib.rs#L1345-L1350) marks hooks stable/default-on. Events include prompt submit, session start/end, pre/post tool, permission request, pre/post compaction, subagent, Stop and interrupt. Plugin resources are [skills/MCP/apps/hooks](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/plugin/src/manifest.rs#L8-L25), not a general in-process executable module entry point. TUI slash dispatch is a Rust enum, not an inspected plugin registrar.

Do not understate Stop hooks: deterministic `{decision:"block",reason:...}` actually makes the core continue model sampling in **the same turn** ([turn.rs:718-758](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/core/src/session/turn.rs#L718-L758)). This could implement restricted iterative workflows. It does not establish separate query results/options, exact tools or Theta's entire interpreter contract. UserPromptSubmit can block/add context; it cannot register a real `/theta` action. Unknown slash dispatch may happen before ordinary prompt hooks.

PreToolUse supports denial/context and constrained updated input, not arbitrary tool-name replacement or successful tool-result fabrication. Some unsupported hook outputs fail open; a pre-tool hook must not be assumed a universal fail-closed security boundary. Hook trust, timeouts/asynchrony and event-specific output rules must be honored. External commands permit a Node evaluator without an in-process JS import sandbox, but long-running evaluation should be a managed sidecar rather than silently consuming a blocking hook's lifetime.

### Shared daemon means same-session integration is not imaginary

The TUI selects explicit remote, implicit shared daemon, or embedded runtime ([tui/lib.rs:1028-1056](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/tui/src/lib.rs#L1028-L1056)). Embedded fallback and `--no-daemon` are counterexamples to universal attachment. Local daemon lifecycle is still documented experimental despite default-on daemon auto-start.

On the same server, [running-thread resume](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/app-server/src/request_processors/thread_processor.rs#L4498-L4620) finds the existing core thread, and listener resume joins history/events atomically. It does not blindly create another worker. Existing-runtime overrides may be ignored to preserve other subscribers. A new thread without a persisted rollout could not be resumed by our observer; after one durable turn, rejoin succeeded.

**Transport correction to the delegated audit:** `codex app-server proxy --sock` is a **raw byte relay**, not a JSONL-to-WebSocket translator. The Unix app-server endpoint expects a WebSocket handshake and framing. Our first JSONL-over-proxy experiment timed out; using supported WebSocket-over-Unix framing worked. Source: `codex-rs/stdio-to-uds/src/lib.rs:12-42` and `app-server-transport/src/transport/unix_socket.rs:133-215`. This was an exploratory framing mistake, not a production failure.

No audited lease excludes human input. `turn/start` internally starts **or steers**; the wire response gives a turn ID, not an exclusive “new Theta query acquired” capability. Our active-turn probe reproduced ID reuse. Conflicting schema protection is useful but does not solve general admission. A sidecar also needs explicit thread selection: a thread ID is not “whatever TUI X currently displays.” New/fork/resume/display changes and disconnect uncertainty need reconciliation.

Ordinary approval requests have one shared callback, fan out/replay to subscribers, and the first response consumes it ([outgoing_message.rs:336-587](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/app-server/src/outgoing_message.rs#L336-L587)). Our observer's decline verified this behavior. MCP user verification has a different owner-bound ceremony; do not flatten it into ordinary approvals. A sidecar should not race the TUI's approval UX or silently auto-accept.

Detailed source evidence: [`daemon-audit/report.md`](daemon-audit/report.md). The actual TUI and managed-daemon startup/upgrade were **not** run in our probes; the binary experiment proves same-server multi-client behavior, while TUI/daemon linkage is source-backed.

## 6. SDK, structured inference, tools and security

### Official npm SDK is a subprocess worker API

The published SDK runs `codex exec --experimental-json`, adds `resume <threadId>` for follow-up calls and spawns a child ([exec.ts:94-105,173-216](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/sdk/typescript/src/exec.ts#L94-L216)). It exposes streaming items/terminal events, outputSchema and an AbortSignal—not arbitrary dynamic tool callbacks or attachment to a current TUI. Signal cancellation is process cancellation, distinct from app-server interruption. Require a terminal event/status rather than interpreting EOF or `run()` resolution as semantic success. Use raw app-server for the richer adapter.

### Binder and typed-result opportunity—and remaining gap

`outputSchema` becomes Responses `text.format={type:"json_schema",strict:true,...}`. We observed that exact wire shape. With a fresh thread and these **tested** thread-start config overrides, the request had `tools: []`:

```json
{
  "features.shell_tool": false,
  "features.view_image": false,
  "features.multi_agent": false,
  "agents.enabled": false,
  "features.goals": false,
  "tools.experimental_request_user_input.enabled": false,
  "web_search": "disabled",
  "mcp_servers.probe.enabled": false
}
```

This is a profile for the specific isolated configuration—not a universal guarantee that future/default/browser/plugin/MCP tools are absent. Production must explicitly disable every discovered ambient source and assert the final catalog/request. A fixed no-tool structured worker is promising for binder or `max_rounds:0` typed work.

It remains different from Theta's stateless named-tool-forced finalization. Public turn params lack arbitrary tool choice/messages/raw HTTP callback and the request builder uses `tool_choice:"auto"` ([client.rs:1072-1078](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/core/src/client.rs#L1072-L1078)). Context can potentially be prepared with new threads/injected items, but exact replay, custom messages, schema subset, refusals, length/error precedence, repairs and cancellation need an adapter contract. A deliberately schema-violating fake response still completed successfully: **the adapter must parse/depth-check/AJV-validate**, not trust `completed` as a typed value. This demonstrates a local boundary, not a failure of a real provider's strict schema enforcement.

### Tool exposure is not denial

Experimental [dynamicTools](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/app-server-protocol/src/protocol/v2/thread.rs#L142-L151) is declared at thread creation. Callback requests/results are real; our registered tool executed with exact canned arguments and returned results to the native loop. No inspected public tools/set operation changes an already-loaded thread per query. Unknown per-turn dynamicTools input was ignored in the probe; the next request still exposed the original tool and native tools. Always test negative configuration paths; acceptance of JSON does not prove configuration took effect.

Config feature/MCP filters can curate a **fixed worker**. Recreating/replaying a thread for every varying query could be explored, but it is not automatically the same continuous on-session conversation. Blocking unwanted calls in hooks is a separate safety obligation and cannot satisfy exact schema exposure. No proof yet of Theta's parallel-provider-round cap/depth checks before all native side effects.

### Deterministic native operations are useful, not universal parity

- **`command/exec`** is deterministic argv execution in the configured/explicit server sandbox, without a thread or turn. We verified success, read-only denial and a workspace-write success. It lacks the native model-turn approval-policy/reviewer/parent-call context; do not call it arbitrary builtin execution through the same approval UX. Supplying broader sandbox settings is an authority decision, not a compatibility trick.
- **`mcpServer/tool/call`** is a real deterministic RPC with thread/server/tool/arguments. The fixture returned `42`; an absent tool errored. Authorization, hook, transcript and denial parity with model-requested MCP execution remain to qualify for arbitrary tools. The fixture was read-only/no-side-effects.
- **Native model shell execution and approval** were separately probed using a canned provider tool call; native output was returned, and a required-escalation request could be declined. This is not proof of a client API that emits arbitrary native builtin calls.
- **`thread/shellCommand` is explicitly unsandboxed/full access** in the released generated declaration. It was **not invoked** and is not an acceptable shortcut for permission-aware Theta calls.
- **`thread/inject_items` and `turn/start.toolOutput`** are useful real context/result insertion paths, but inserted output is not proof a native tool ran. Neither was used to fabricate successful execution in this research.

Source/API details: [`api-audit/REPORT.md`](api-audit/REPORT.md), particularly the deterministic-operations and history sections.

## 7. Verified disposable experiments

Final scripts are under `probes/`; complete client-tagged RPC, HTTP request bodies, process stderr, terminal outputs and homes/configs are retained. No repository tests or live suite were run; there was no implementation change to validate.

| Experiment | Observed result | Evidence boundary |
|---|---|---|
| Version/help/schema/features | Released 0.163.0; stable/experimental schemas differ; hooks stable/on | Actual binary, no provider |
| Experimental negative gate | Stable client dynamicTools rejected with `requires experimentalApi capability` | Actual protocol validation |
| Generic tools/call | Unknown RPC rejected | Not proof every specialized dispatch is absent |
| Shell sandbox | Print works; read-only write denied; workspace-write allowed in disposable work dir | Linux local sandbox only; no attack on project paths |
| Dynamic tool loop | Server callback arguments `{n:3}`, client result, native completion | Canned provider chose call; no real model |
| Schema wire + invalid response | Strict schema forwarded; fake wrong-type JSON still `completed` | Adapter validation boundary, not provider compliance |
| Exact exposure negative | Per-turn dynamicTools empty array did not remove tool/native schemas | Request captured, not inferred from tool denial |
| Zero-tool positive | Curated fresh worker sent `tools: []` + strict schema | Specific profile only |
| Sequential/parallel/cancel | Sequential same thread; other thread completes while slow one active; interruption terminal | Test double stream, not network/provider recovery |
| History/fork/resume | Persisted thread read, fork and later process resume return real thread history | Not live-TUI attachment |
| Active admission | Same ID reused; conflicting output schema rejected | Confirms ownership hazard, not a host defect |
| Direct MCP +/- | Deterministic `17+25` → `42`; absent tool errors | Local read-only MCP fixture |
| Native shell/approval | Native tool output and user-declined escalation enter next provider request | Model call is scripted; approval denial real |
| Multi-client rejoin | Two clients receive same thread/turn completion | Same stock server, no TUI/daemon-manager lifecycle |
| Shared approvals | Same request ID on both clients; observer decline resolves initiator | Real shared callback behavior |

Final assertions: **28 passed** in `logs/protocol-assertions.txt`; **6 passed** in `logs/multiclient-assertions.txt`. These assert concrete request/status/result invariants, not model intelligence.

### Exploratory failures retained and resolved

- `protocol-v3-exploratory/`: probe incorrectly expected schema-changing start to steer an active unschematized turn. Host correctly rejected `ActiveTurnOutputSchemaMismatch`. Final probe explicitly asserts that negative path, then tests schema-compatible steering.
- `multiclient-v1-private-dir-precondition/`: socket parent inherited group-writable permissions. Host refused startup. Moving rendezvous under workspace subdirectory mode 0700 satisfied the documented security precondition.
- `multiclient-v2-framing-precondition/`: JSONL sent through raw proxy to WebSocket endpoint could not initialize. Correct WebSocket handshake/framing resolved it; no production defect alleged.
- `multiclient-v3-no-rollout-precondition/`: attempted rejoin immediately after thread creation returned `no rollout found`. Final test first creates a durable turn, asserts successful resume, then observes shared events/approvals. Do not assert all just-created/ephemeral threads are attachable.

Earlier successful iterations and raw logs were preserved, rather than rerunning an expensive/live suite through filters. Final fake provider dispatch keys off the latest user message; its canned responses are not task-quality observables. All probe server/client processes were terminated; `logs/remaining-probe-processes.txt` is empty at final check.

## 8. Authentication, models, runtime and distribution

Released [README:68-72](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/README.md#L68-L72) supports **Sign in with ChatGPT**, explicitly including **Pro**. Supported browser/device login and API-key paths exist. Official SDK/app-server operate through Codex's auth boundary; this does **not** authorize exporting subscription credentials to pi-ai or arbitrary REST clients. API billing and subscription billing are distinct.

The bundled/catalog response includes **`gpt-6.1-sol`**, along with other OpenAI models. Availability without authentication is catalog evidence only. We did not choose Claude. For the next live gate use Codex's supported login in an isolated home, then `account/read`, `model/list`, and a tiny actual `gpt-6.1-sol` turn under read-only/never-approval/no-tool configuration. Never infer entitlement from an ID or silently fall back to an unsupported model.

**Why live inference remains unverified:** there was no Codex executable on PATH initially, no OpenAI credential environment names detected, and the isolated release home was not logged in. Supported login requires an operator browser/device authorization step not completed here. Personal auth files/keyring contents were not inspected or copied. Pi's already authenticated OpenAI session is not evidence of supported Codex credential interchange. No unauthenticated model request was used as a substitute for verification.

External Node evaluator deployment can retain YAML/AJV/Node/process functionality. It has no Codex in-process JS module budget because no such general plugin runtime was found; hook subprocess timeouts/trust and protocol/process lifecycle still matter. SDK requires Node >=18 and an executable native platform binary. Avoid inherited unrelated tools/config/environment in workers. Shared daemon environment is process-wide; per-client process-environment isolation is not supplied. Match the **running daemon** version, not just a newly downloaded CLI's `--version`; upgrades may restart work.

Software is **Apache-2.0** with NOTICE obligations. Pin CLI, protocol and SDK together; retain required notices and platform binaries/dependencies. This is software licensing, not a legal grant to redistribute service access, credentials or branding. Internal Rust `app-server-client` is used by TUI/exec but is explicitly an internal embedding surface, not the official npm SDK or a promised stable public host API. A fork/vendor-based frontend is a separate maintenance/distribution commitment. No service-terms legal conclusion is asserted.

## 9. Feasible architectures and decisive next gates

### Recommended order

| Architecture | Feasibility judgment | Main tradeoff |
|---|---|---|
| External deterministic Theta + **owned app-server workers** | Best first research prototype, initially no-tools structured and fixed-tool subset | New host composition, envelope/error/security semantics; not current TUI |
| Same-daemon **explicit-thread sidecar**, hook-triggered | Credible restricted experiment; stronger than separate SDK worker | Cooperative input, shared approvals, current-display/lifecycle uncertainty; no tool-registry parity |
| Custom frontend / transport proxy from launch | Stronger ownership/UI route | New frontend; missing native APIs still require policy or upstream work |
| Official SDK-only adapter | Easy subset worker orchestration | Exec subprocess wrapper lacks richer callbacks/control; cannot claim attachment |
| Hook-only Stop state machine | Restricted iterative workflows possible | Same-turn continuations, not complete Theta query/typed/tool contract |
| Codex fork/internal Rust embedding | Potential control over missing seams | Highest maintenance/upgrade burden; not stock plugin hosting |
| Codex launcher → Pi workers | Deployable hybrid | Theta still hosted by Pi |

### Gates before any parity or implementation commitment

1. **Supported live auth/model/schema:** operator-authorize isolated Codex with ChatGPT Pro; confirm actual `gpt-6.1-sol` inference, strict schema, refusal/invalid/overflow/cancel behavior and tiny token bound. Provider-free results cannot close this gate.
2. **Choose language-compatibility scope:** define host-neutral effects and precisely specify schema-final adaptation versus forced-tool protocol. Preserve values/control flow/defaults/repair/errors. Explicitly reject unsupported model/tool references rather than silently rename them.
3. **Exact tools and budget gate:** capture every model request across two queries with differing callable sets; prove absence of ambient schemas. Prove parallel batches counted once and over-budget/deep arguments blocked before native side effects. If public APIs cannot do this, restrict scope or seek upstream/fork support—not prompt instructions.
4. **Native dispatch/approval gate:** qualify direct command/MCP paths versus real native tool permission/hooks/transcript semantics. Never use unsandboxed thread shell or unrestricted Node filesystem calls to fake parity. Preserve denial/error envelopes and cancellation.
5. **Current TUI gate:** isolated real stock TUI + shared daemon + sidecar, exact displayed thread selection, two visible queries, human-interleaving refusal, no approval race, cancel, switch/fork/reconnect and uncertain-submit recovery. Prove shared runtime identity; a saved-session resume is insufficient. This remains unrun.
6. **Structured isolation/context gate:** zero-tool binder profile under real account; controlled context projection/truncation, exact wire-name/schema handling, off-session typed finalization, no user transcript pollution, repair taxonomy and raw error mapping. Qualify `thread/inject_items` shapes rather than assume full replay compatibility.
7. **Worker/bootstrap gate:** deterministic child Theta interpreter, closure/root isolation, typed authenticated result envelope, parent/child death, no-envelope exits, completed-result finality, cancellation and bounded parallelism. Native model subagent answers do not close this gate.
8. **Packaging/trust/lifecycle gate:** plugin/hook trust without bypass flags, explicit homes/permissions, daemon version detection, process cleanup, upgrade/compaction/history/UI observability. A custom frontend must be named as such.

**Decision rule:** proceed to a tightly scoped **worker adapter proof**, not a full stock-plugin implementation promise. Investigate same-thread sidecar separately if existing-TUI UX is essential. Complete Theta semantics may require upstream APIs or a maintained frontend/fork, especially varying exact tools, round governance and deterministic builtin permission parity.

## 10. Reproducibility and artifact index

Run from `/home/thomasa/Projects/pi-theta/.pi/tmp/dual-host-research`. Scripts never invoke a real model. For repeat runs, archive the existing `codex/probes/protocol/` and `multiclient/` directories **inside this workspace** first, or use a fresh isolated copy of the probe directories; output scripts overwrite their own logs/configs. The socket directory `codex/s/` must remain mode 0700.

```bash
# Release/API provenance (read-only network requests)
curl -fsSL https://api.github.com/repos/openai/codex/releases/latest
curl -fsSL https://registry.npmjs.org/@openai/codex/latest
curl -fsSL https://registry.npmjs.org/@openai/codex-sdk/latest

# Executable pin and generated protocol; output paths must stay in this workspace
CODEX_HOME="$PWD/codex/home" HOME="$PWD/codex/home" \
  codex/release/codex-x86_64-unknown-linux-musl --version
CODEX_HOME="$PWD/codex/home" HOME="$PWD/codex/home" \
  codex/release/codex-x86_64-unknown-linux-musl app-server generate-ts \
  --experimental --out "$PWD/codex/release/protocol-experimental-ts"

# Provider-free release-binary experiments and observable assertions
python3 codex/probes/protocol_probe.py > codex/logs/protocol-probe-final-run.txt 2>&1
python3 codex/probes/check_results.py > codex/logs/protocol-assertions.txt 2>&1
python3 codex/probes/multiclient_probe.py > codex/logs/multiclient-probe-final-run.txt 2>&1
python3 codex/probes/check_multiclient.py > codex/logs/multiclient-assertions.txt 2>&1
```

| Artifact | Contents |
|---|---|
| `REPORT.md` | Consolidated verdict, evidence, qualifications and next gates |
| `api-audit/REPORT.md` | Released SDK/protocol/hooks/auth/license audit with immutable links |
| `daemon-audit/report.md` | Same-thread ownership/approval/transition adversarial source audit; proxy framing correction above takes precedence |
| `theta-semantics/REPORT.md` | Actual Theta obligations, code anchors and adapter seams |
| `release/` | Authoritative metadata, binary, digest check, release notes, generated stable/experimental schemas/types |
| `api-audit/source/`, `api-audit/sdk/` | Exact release source and published SDK extraction; tarballs retained |
| `release/docs/` | Supplementary website HTML/text snapshots, explicitly unversioned |
| `probes/*.py` | Deterministic fake-provider/MCP/protocol/multi-client scripts and assertions |
| `probes/protocol/` | Final stdio run: `rpc.jsonl`, `wire.json`, `results.json`, `assertions.json`, per-client stderr, isolated home/work/tmp |
| `probes/multiclient/` | Final shared-server run with client tags, wire/results/assertions, server logs and isolated state |
| `probes/*-v*/` | Preserved intermediate successes and exploratory negative/precondition runs |
| `logs/` | Complete command outputs, baseline/final git status/HEAD, selected Theta hashes, time/version/features/help/auth status and process cleanup check |

**Final boundary confirmation:** research only; no implementation or changes to project source/tests/docs/manifests/configuration/git state or personal Pi configuration. All authored artifacts and disposable runtime state were confined to the assigned `codex/` workspace. All delegates were collected before finalization.
