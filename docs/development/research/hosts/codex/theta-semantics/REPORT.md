# Theta semantic obligations versus Codex hosting

> **Developer research, not end-user documentation or an accepted specification.**
> Relocated from `.pi/tmp/dual-host-research/codex/theta-semantics/REPORT.md`. Historical release/source pins and evidence limitations remain in force.
> Unless a link points to another tracked document, experiment paths and reproduction instructions refer to the original local evidence workspace, `.pi/tmp/dual-host-research/codex/theta-semantics/`; downloads, caches, scripts and raw logs remain gitignored and are not required to read this report.

## Scope and evidence boundary

Offline source inspection only; no model/provider call, credential access, installation, or source/configuration/git mutation. Only this assigned directory was written. Prior Claude reports were consulted selectively as leads, then the relevant **current Theta source** was inspected. This is not a duplicate Codex API audit.

Theta: package **0.496.0**, HEAD **a21bd1b27b09efdd7f71c7484b3f6d1fcd1dd299**. Anchors refer to the working-tree bytes inspected, not a claim that concurrent modifications equal HEAD. Codex: parent-provided source archive **`rust-v0.163.0`**, annotated tag object **129b8ec7ee6f4511557a4856279f529025c25af4** (`../api-audit/tag-ref.json`). This report does not independently peel that tag or certify runtime binary/source equivalence.

Paths beginning `src/` are relative to `/home/thomasa/Projects/pi-theta`. Below, **C/** means `.pi/tmp/dual-host-research/codex/api-audit/source/codex-rust-v0.163.0/`. Codex source URL root: https://github.com/openai/codex/tree/rust-v0.163.0/ . Facts are source-supported; architecture recommendations are explicitly inferences; unavailable contracts remain unknown.

## Executive judgment

**Reuse a deterministic Theta interpreter; do not ask Codex to interpret Theta text.** A Codex app-server client is a plausible **isolated worker/custom frontend substrate**, but that does not demonstrate a native extension controlling the user's already-running Codex TUI session. A command/skill/MCP tool launching such a worker is an external launcher unless it also provides the native conversation semantics below.

The hardest obligations are not parsing or launching a process. They are:

1. Correlated, fully settled **multiple agentic queries**, with recovery/interleaving and session ownership.
2. Independent binder/typed-result inference with precise context, schema, tools, error and cancellation contracts.
3. **Exact request-visible tools**, per-provider-round budgets, and deterministic code-side calls through host permission enforcement.
4. Child runtime bootstrap, authenticated typed return/finality, cancellation and instruction/tool isolation.

App-server has useful positive evidence: turn IDs, completion notifications, interruption, schema-constrained final messages, thread creation, experimental dynamic tools and explicit sandbox/approval policy. Those are promising seams, not complete semantic parity.

## 1. Deterministic engine and actual effect boundary

**Fact.** `EffectfulStatementHostDeps` already separates pure evaluation from `resolveQuery`, `resolveToolCall`, `resolveInvoke` and runtime/session-control calls (`src/runtime/effectful-statement-host.ts:96-224`). Query dispatch carries rendered text, a `QueryModelDriver`, loop configuration, schema validation and a post-validation inbound wire-name decoder. A `.theta` callable is not a model instruction: it resolves to an invoke child and returns a typed `Result`. Production `subagent fn` likewise resolves to a real child boundary; the same-host test-double behavior is explicitly not production (`:212-224`).

**Required adapter seam (inference).** Share parser/type/schema/value/evaluator and effect orchestration; replace the production composition. Introduce host-neutral interfaces for conversation snapshots, turn driver, structured inference, tool catalog/dispatch, child launch/result, session controls and lifecycle/status. Do not merely wrap Pi `ExtensionContext` with similarly named Codex methods. In particular, existing schemas, tool-result decoding and foreign-turn detection are substantive semantics, not type-level compatibility.

## 2. Multi-query settlement and owned turns

**Facts from current production.** Prompt-mode `@` drives **user-visible turns in the shared session**, waits for full settlement, and only then resumes interpretation (`src/extension/live-prompt-query-driver.ts:140-163,804-828`). Each later query can therefore observe earlier committed history. A `send` return is not a result.

`OwnedTurnAttempt` snapshots raw entry IDs and message position before sending, pins the first matching enacted user entry, refuses duplicate-text ambiguity, excludes later users, and verifies raw object provenance in a foreign window (`src/extension/owned-turn.ts:1-98`). Its header explicitly says text correlation is **not authentication**. It supports a narrow compaction-relocation fallback only without foreign input and after a new compaction (`:76-95`). Port the ownership invariant, not the fragile Pi-specific textual correlation mechanism if Codex offers stronger IDs.

The settlement predicate accepts an assistant ending including empty text/error endings, or a tool-result-only ending; it does not confuse semantic failure with unfinished transport (`src/extension/turn-settlement.ts:63-101`). It bounds its own user slice before the next user (`:104-141`). A trailing unanswered compaction is still in flight (`:143-165`). Production separately stages pre-send, start, streaming-end, wait-for-idle and final-settle gates. The current streaming-end ceiling is **30 minutes**, with a documented future inactivity-reset alternative; this is a host lifecycle backstop, not Theta's tool-round budget (`:10-53`).

Model, tools and thinking are scoped query windows: the exact tool vector replaces ambient tools and restores in `finally`; restoration gets one retry then an operator-visible diagnostic without masking the original outcome (`src/runtime/tool-registration.ts:84-208`). Model/thinking have parallel restoration protocols (`:219-455`).

**Codex positive evidence.** `TurnStartParams` carries `thread_id`, optional `client_user_message_id`, parent/root turn IDs and returns a `Turn` (`C/codex-rs/app-server-protocol/src/protocol/v2/turn.rs:170-197,303-307`). Completion is a distinct notification (`:567`); interruption takes turn identity (`:345-353`). This is stronger correlation material than matching text. But comments explicitly acknowledge that a start request may **steer an active turn** and ignore trigger/parent/root attribution (`:178-197`). Never equate every successful `turn/start` with a fresh Theta-owned query.

**Required seam / acceptance gate.** Serialize/admit a new owned turn, correlate `(threadId, turnId, clientMessageId)`, wait for terminal completion and collect only its items, preserve error/overflow/empty-tool-only outcomes, and handle compaction, concurrent users, disconnect/reconnect, cancellation and history projection. The live-query driver has substantial retry/recovery/accepted-snapshot logic (`src/extension/live-prompt-query-driver.ts:976-1253`); a single `await run()` is not an adequate replacement.

**Unknown.** No inspected evidence establishes a plugin API owning this lifecycle **inside an already-running stock TUI**. App-server orchestration over a thread the adapter owns is a different, more tractable architecture. Persisted-thread resume is not proof of simultaneous control of the existing TUI's live agent loop.

## 3. Binder and typed queries are separate inference channels

**Facts.** Binder constructs an off-session call with its own system prompt, fixed user message, exactly one `__theta_bind_<slug>` schema-bearing tool, named-tool forcing, provider-dependent temperature/seed placement, abort forwarding and response capture (`src/binder/binder-inference.ts:384-468`; production dispatch `src/extension/binder-run.ts:698-741`). Binder is not a conversational free-agent task. Its session-context option projects selected message arms, refuses unsafe custom message types, and truncates newest-first to **20 turns / 8000 tokens**; it is off for worker mode or `bind_context: none` (`src/extension/binder-run.ts:745-789`). Preserve closed transcript semantics rather than dumping an entire Codex rollout into a prompt.

Typed `@<T>` has a two-phase protocol: free agentic work, then a forced respond result. `QueryModelDriver` exposes free turns, parallel batches with **committed-side-effect accounting**, and forced response (`src/runtime/query-tool-loop.ts:87-178`). Forced response is exempt from the free-round budget (`:208-220`). Typed outcomes distinguish value, validation, propagated query failure, transport and cancellation (`:248-280`). Validated values still require inbound Theta wire-name translation before binding (`src/runtime/effectful-statement-host.ts:110-136`).

Current prompt production runs the free phase on-session but typed finalization **off-session**, without attaching another native session turn (`src/extension/live-prompt-query-driver.ts:150-163`). The final call passes exact replayed messages and **only the respond tool**, named-tool choice, abort signal and raw provider-response capture (`src/extension/off-session-respond-dispatch.ts:200-276`). A model-level forcing rejection allows one explicitly classified degraded reissue with tool choice omitted; it does not justify generic JSON prompting. Abort is checked before dispatch (`:204-224`). Malformed/noncompliant results flow through validation/repair, not unconditional success.

**Codex positive evidence.** `turn/start.output_schema` constrains the **final assistant message** (`C/.../protocol/v2/turn.rs:272-276`). This is a real structured-output facility and must not be dismissed because it is not tool forcing. However the inspected full `TurnStartParams` (`:170-298`) does not expose an exact arbitrary messages array, per-call tools, named-tool choice, seed, temperature or raw provider HTTP response callback. `ThreadStartParams` can set base/developer instructions, ephemeral behavior and experimental dynamic tools (`C/.../protocol/v2/thread.rs:62-164`). A fresh structured thread is a plausible replacement channel, not proven equivalent to the current stateless `complete()` call.

**Required seam.** Design a structured inference operation with explicit input context, schema dialect, result/refusal/length/transport classifications, isolation from user history, abort and retry accounting. If Codex final-message schema replaces the forced-tool protocol, document and test that **intentional protocol adaptation**; retain Theta validation/depth/repair/defaulting semantics. Do not pretend the Codex output was a `__theta_respond` call. Verify supported schema subset, root wrappers, enums/wire names and malformed/refusal behavior.

**Unknown.** Subscription-authenticated availability of that replacement for selected `openai/gpt-6.1-sol` was not live-tested here. No direct-provider workaround should extract host credentials or assume an API key is interchangeable with subscription auth.

## 4. Exact tools versus denial; deterministic calls versus model requests

**Fact.** The active-set contract is `[...thetaCallableSetNames, respondToolName?]`, **not unioned with ambient tools** (`src/runtime/tool-registration.ts:103-168`). Blocking disallowed calls is not equivalent to removing their schemas from the request.

There is nevertheless a separate legitimate **denial** obligation: the native prompt governor intercepts every model-driven tool call pre-execution, depth-checks its arguments, and counts provider **rounds**, not individual parallel calls (`src/extension/prompt-tool-loop-governor.ts:1-40,113-222`). Calls beyond the budget are blocked before side effects. One round containing ten siblings spends one slot; it is not ten turns or ten approvals. A host `max_turns`, wall timeout or token limit is not automatically equivalent.

Code-side `read(...)`, extension tools and `.theta` callables are deterministic dispatch paths. Pi's extension-tool workaround fabricates zero-token `tool_use` through the host loop with **verbatim code-supplied arguments**, then reads the result and restores the model. If neither executable registry access nor host-loop dispatch exists, load refuses fail-closed (`src/runtime/host-loop-dispatch.ts:1-24,39-96,137-159`). An LLM asked to call a tool is not this seam. Code execution also has explicit lowering of throws, error envelopes and host denial (`src/runtime/tool-call-execute.ts:255-314,396-467`; `src/runtime/tool-call-host-denial.ts:78-142`).

**Codex adversarial distinction.** Experimental `thread/start.dynamic_tools` adds tools (`C/.../protocol/v2/thread.rs:142-151`). `item/tool/call` is a **server request to the client** (`C/.../protocol/common.rs:1828-1830`), with dynamic-call parameters/result content (`C/.../protocol/v2/item.rs:1663-1681`). This lets a client execute *model-requested client-owned tools*. It is **not evidence of a client RPC that deterministically invokes any Codex builtin/MCP tool with authored arguments**. Likewise the inspected turn-start fields do not establish a per-query replacement tool vector or pre-every-builtin interception.

**Required seam.** An explicit host tool catalog and deterministic, permission-aware dispatcher, or an explicitly restricted portable callable subset. Prove builtin/MCP execution and authorization individually; do not replace Codex-authorized filesystem/shell tools with unrestricted sidecar Node execution to make signatures match. If an adapter supplies all tools itself, it must own a sandbox/approval policy of comparable authority and disclose that security architecture. Exact visibility and pre-execution depth/round enforcement must be verified at request/dispatch boundaries, not inferred from an MCP registration or approval denial.

## 5. Child workers and parallel execution

**Facts.** Production child execution is fresh-host bootstrap, not just prose delegation. Placement takes prepared executable/argv/cwd/env and a control-plane launch file, declares exit/environment/visibility capabilities, and returns a killable handle (`src/runtime/subagent-placement.ts:70-170`). Pipe results travel on stdout with authenticated parent control plane; nonpipe placement uses a separate result channel (`:184-218`). Child session persistence is operator observability; **the parent does not read the child's session** (`:116-125`).

Callables carry parent-recorded transitive closure hashes and child re-discovery verifies them fail-closed (`src/runtime/subagent-child-hash-verify.ts:1-30,124-173`). The launch environment scrubs foreign invocation state before authenticating the new control plane (`src/runtime/subagent-launcher.ts:250-366`). `subagent fn` must also marshal values and return a typed envelope, not merely receive an agent answer (`src/runtime/effectful-statement-host.ts:212-224`). `par for` has runtime-controlled scheduling and independent per-child invoke depth (`src/runtime/par-for-executor.ts:145-151`); a native agent feature is not proof of those rules.

**Required seam (inference).** Codex-owned worker threads/processes can replace Pi children if each boots a deterministic Theta runner, receives only the authored context/model/callables, has explicit permission policy, and returns a versioned validated Theta envelope with exactly-once terminal arbitration. Preserve no-envelope exit, crash, malformed output, cancellation, parent death, liveness and completed-result finality. Implement a new host launcher/bootstrap rather than changing only a Pi CLI command string. Native Codex subagents may be an alternative, but their lifecycle/context contract must be proven separately. Keeping Pi workers is a valid hybrid launcher, not Codex-native runtime hosting.

## 6. Cancellation, history, ceilings, UI and shutdown

**Cancellation facts.** One invocation-owned controller forwards source reasons downward, including already-aborted signals; cancellation does not rewrite already-completed bindings or a pure tail with no later checkpoint (`src/runtime/cancellation-core.ts:38-74,169-174,349-458`). Loop checkpoints yield a macrotask so external aborts can land even during pure computation (`src/seams/production-checkpoint.ts:1-37`). Native query abort must also stop the actual host turn, not merely discard the eventual reply (`src/extension/live-prompt-query-driver.ts:875-887`). Codex `turn/interrupt` is useful but only one part of this graph. Parent cancellation must reach outstanding model calls, tools and child handles; child cancellation must not arbitrarily cancel siblings or the parent.

**Budget facts.** Preserve distinct check sites and precedence: invoke depth, tool-round boundary, binder retry budget, and document-depth-before-AJV (`src/runtime/ceiling-arbitration.ts:21-52`). Binder permits at most three **budgeted attempts**, and an attempt can have two provider calls due to the forcing-degradation protocol (`src/binder/retry-taxonomy.ts:1-14,43-45`); avoid reporting three attempts as necessarily three requests. No host timeout substitutes for this taxonomy.

**History/session facts.** Runtime tools include `compact`, `context_usage`, `session_name`. Compaction must report summary and real before/after token estimates; missing estimates produce an error, never fabricated values. Usage distinguishes unavailable from unknown before an assistant response; naming validates then sets/reads (`src/runtime/session-control-tools.ts:20-163`). Session swaps and teardown invalidate the old composition; the current Pi tripwire refuses dispatch if a supposedly replaced instance survives (`src/extension/session-swap-tripwire.ts:1-18,94-141`). A Codex adapter should implement its own session ownership/rebind lifecycle rather than copy the Pi assumption literally.

**UI facts.** Display is not inherently required for interpretation. Production diagnoses headless mode explicitly and mirrors diagnostic output rather than relying solely on transient UI (`src/extension/production-composition.ts:371-426`). Run cards/widgets use Pi-specific rendering (`:2890-2902`) and need replacement. Preserve operator-facing errors, progress, cancellation and system notes separately from model-visible conversation content. A CLI JSON stream or custom frontend can be sufficient for an explicitly headless scope; losing native TUI cards alone is not a semantic blocker.

## 7. Architecture classification and minimum proof matrix

| Candidate | Honest classification | Principal unresolved gate |
|---|---|---|
| Skill/MCP starts an existing Pi Theta | External/hybrid launcher | Not Codex-native execution or shared conversation |
| Theta sidecar creates Codex worker threads and drives app-server | Isolated worker orchestration | Deterministic authorized tools, exact tool set, round governor, typed/binder channel |
| Theta frontend owns Codex app-server and displays its turns | Custom frontend/embedding | Same adapter gates plus history/UI/session ownership; not stock-TUI extension |
| Extension controls user's already-running Codex TUI | Existing-session native integration | Public admission/ownership/hooks/tool dispatch/lifecycle surfaces not established in this inspection |
| New Codex source integration | Host modification | Technically broader control, but a maintained fork/integration, not current plugin feasibility |

Before claiming parity, require offline/mock-provider witnesses for: two sequential queries; inert/steered/foreign/duplicate-text admission; completion-before-waiter race; tool-only/empty/error/length outcomes; compaction continuation; no ambient tool schema; parallel batch counts as one round; blocked over-budget side effects; deterministic code args without model inference; denied approval; depth-before-tool and depth-before-AJV; binder isolation/truncation/attempt classes; schema result repair; already-aborted/in-flight/pure-tail cancellation; parent/child death; envelope-before-exit and no-envelope exit; session switch and restoration failure; and headless diagnostics. Then use a tiny OpenAI-only subscription-authenticated live probe for the real model/tool/schema boundary. Offline event stubs alone do not prove provider behavior.

**Bottom line:** Codex's app-server provides a credible orchestration foundation, especially for an adapter-owned worker/custom frontend. The actual Theta obligations expose major adapter work and several current-public-surface unknowns. Neither MCP/skills nor structured final JSON establishes deterministic tool invocation, exact tools, native current-session control, or complete Theta hosting.
