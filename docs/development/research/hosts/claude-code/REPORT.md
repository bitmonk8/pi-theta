# Could the latest released Claude Code host Theta?

> **Developer research, not end-user documentation or an accepted specification.**
> Relocated from `.pi/tmp/claude-host-research/REPORT.md`. Historical release/source pins and evidence limitations remain in force.
> Unless a link points to another tracked document, experiment paths and reproduction instructions refer to the original local evidence workspace, `.pi/tmp/claude-host-research/`; downloads, caches, scripts and raw logs remain gitignored and are not required to read this report.

**Investigation date:** 2026-10-19. **Project inspected:** `@bitmonk8/pi-theta` 0.496.0, HEAD `a21bd1b27b09efdd7f71c7484b3f6d1fcd1dd299`.

## Executive conclusion

**Yes, a Claude Code implementation of a Theta host is technically plausible with the newly released Mods system. It is not a packaging-only change, and full Pi-equivalent semantics are not yet demonstrated.**

The strongest first architecture is a **small Claude Mod + a shared Theta engine in an external Node process**, with a host adapter for conversation driving, native tools, structured replies, cancellation and isolated workers. A pure-JavaScript engine inside the Mod is another possibility after dependency extraction. Neither architecture automatically closes the semantic gaps.

Three separate goals must not be conflated:

1. **Claude Code can launch existing Pi thetas:** easy in principle by spawning Pi. This is a hybrid frontend, not a Claude-native Theta host.
2. **The Theta language can execute using Claude Code's model/tool/session facilities:** credible, but substantial new host work.
3. **Every existing theta runs unchanged with identical behavior in Pi and Claude Code:** not established and unlikely for host-specific tools, model IDs, prompts and session controls without an explicit portability contract.

My recommendation is a time-boxed capability prototype before committing to a full port. Treat isolated-worker mode as the first candidate scope; treat true current-conversation prompt mode and strict structured-response behavior as explicit acceptance gates, not assumptions.

## 1. What “latest released” meant in this investigation

Independent checks agreed:

- npm `@anthropic-ai/claude-code` **latest = 2.1.303**; **stable = 2.1.292**. These are distinct channels, not a prerelease/stable confusion.
- GitHub latest release: **v2.1.303**, published **2026-10-18T22:26:54Z**.
- A downloaded, locally scoped Linux release binary printed **`2.1.303 (Claude Code)`**.
- The changelog records **“Added Claude Mods: plugins may now modify deeper behavior” in 2.1.287**. Both currently named npm channels are newer than that release.

The important new feature is **Mods**, not just the older plugin directory format containing Markdown skills, hooks and MCP configuration. A Mod provides an executable JavaScript/TypeScript hooks module. The minimum documented version is 2.1.287.

Official web documentation can move independently of the executable. In particular, the public GitHub Mod type declaration downloaded for this investigation says **2.1.277** in its first line and has materially older signatures. It must not be mistaken for the exact 2.1.303 API. Official docs say that build-generated declarations are authoritative. Those exact generated declarations were not obtained here; real-binary offline probes were used where possible.

Sources:

- https://github.com/anthropics/claude-code/releases/tag/v2.1.303
- https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md
- https://code.claude.com/docs/en/plugins/mods/create
- https://code.claude.com/docs/en/plugins/mods/reference
- https://github.com/anthropics/claude-code/blob/main/mods/types/claude-code.d.ts

## 2. Relevant new host capabilities

The official Mods API documents:

| Theta need | Claude Code surface | Assessment |
|---|---|---|
| Discover and expose slash commands | `$.command.register`, `command.run` | Good foundation; names must not collide with built-ins. Dynamic discovery can register arbitrary theta names, with one literal, unfiltered command hook routing them. |
| Expose thetas / respond schemas as tools | `$.tool.register`, `tool.call` | Good foundation; tool names become `mcp__<plugin>__<name>`. Registration is not the same as forced selection. |
| Deterministic code-side tool calls | `$.tool.list`, `$.tool.call`, `$.tool.check` | Promising and cleaner than porting Theta's Pi synthetic-provider bridge. Arguments, errors and permission outcomes need translation. |
| Current-session agentic queries | `$.prompt.submit`, `turn.start`, `turn.step`, `turn.complete` | Available pieces, but scheduling/lifetime semantics differ significantly. |
| Inspect history and context | `$.session.messages`, `usage`, `compact` | Available, but history is a normalized projection capped at the newest 4,096 entries, not Pi's session tree. |
| Binder / small independent model request | `$.model.complete` | Tool-less one-prompt completion, using the session's credentials. Not a drop-in structured tool-call channel. |
| Read current conversation in independent completion | `$.model.fork` | Uses current conversation/system prompt; model cannot call tools. Does not replace an agentic query. |
| Isolated workers | `$.agent.register`, `spawn`, `list`, agent-qualified turn events | Promising. A worker's completion is separate from spawn admission; repeated turns/resume and Theta typed returns need a protocol. |
| Interruption | `next.signal`, `$.turn.abort`, completion/abort events | Pieces exist; invocation ownership and downward-only cancellation need implementation and proof. |
| Progress and custom UI | `$.ui`, `ui.render` | Sufficient-looking alternatives to Pi widgets/run cards; UI must be rewritten, not reused. |
| Files, network, external engine | `$.fs`, `$.process.run/spawn`, `$.http.fetch` | Enables a sidecar design; transport and process lifetime still need verification. |

`$.model.complete` and `fork` use the session's credentials and bill to its plan/key/cloud provider according to the official Mods API. This does **not** mean an external sidecar automatically receives usable credentials. Do not extract credentials or assume a third-party Agent SDK application can reuse subscription login: the SDK authentication page states a separate restriction on third-party products offering claude.ai login/rate limits.

Sources:

- https://code.claude.com/docs/en/plugins/mods/api
- https://code.claude.com/docs/en/plugins/mods/events
- https://code.claude.com/docs/en/agent-sdk/authentication

## 3. Concrete findings from the released binary

All experiments were local and provider-free. No Claude model turn was run. Test stubs are identified below and are not evidence of real inference/tool execution.

### A. Real Theta language code executes outside Pi

`core-entry.ts` re-exports the project's actual parser, lexical environment and interpreter; it does not reimplement Theta. A Node-targeted bundle with package dependencies externalized executed this source:

```theta
let mut total = 0
for x in [1, 2, 3, 4] {
  total += x
}
if total == 10 {
  total += 7
}
total
```

It returned:

```json
{"outcome":"success","result":{"present":true,"value":17}}
```

This proves useful engine reuse outside Pi, **not** discovery, queries, tools, schema replies, imports, subagents or full host conformance.

Artifacts: `core-entry.ts`, `run-core.mjs`, `core-node-run.log`.

A naive fully bundled Node ESM attempt hit a YAML CommonJS `require("process")` packaging issue. Externalizing packages resolved it. A browser/sandbox-targeted bundle of the same entry point failed on `node:path` and `node:crypto`. These are finite dependency issues, not evidence that a sandbox port is impossible.

Artifacts: `core-browser-build.log`, `core-node-build.log`.

### B. The released Mod validator accepts the relevant integration shape

A scratch plugin registers commands, a JSON-schema respond tool and an agent type; implements code-side tool calls and turn observation; and installs a fail-closed error handler on its tool guard. **`claude plugin validate` passed** on 2.1.303.

Artifact: `probe-validate-final.json`.

### C. Direct prompt submission from a command handler is rejected

The release binary's own offline Mod test environment rejected `$.prompt.submit` from inside `command.run`, before the downstream prompt stub ran:

> `prompt.submit: called from a command.run hook, it would wait on the turn this hook is holding; submit from a later event (turn.complete) (host check)`

This is more specific than “don't await it if already busy”: **the obvious Theta slash-handler port does not work.**

A separate test scheduled submission with `$.clock.after(0, ...)`, returned from the command handler, and advanced the mock clock. The deferred callback reached the prompt stub successfully. That establishes a viable scheduling primitive, not yet a complete multi-turn or headless-lifetime solution.

### D. Useful API mechanics work in the real offline test runner

The final exploratory suite recorded **8 passing probes and 1 inconclusive agent-spawn probe**:

- native inventory-method dispatch to stubs;
- deterministic tool dispatch and text propagation;
- undeclared-tool guard stops downstream stub execution;
- structured respond-tool handler captures a boolean;
- model-completion handler consumes the documented answered-record shape from a stub;
- command-handler prompt submission is rejected;
- deferred callback can submit after command return;
- session-start hook emits dynamic command/tool/restricted-agent registration calls.

The remaining spawn probe did **not** establish worker spawning or completion: stubbing `agent.spawn` directly yielded only a model record in one attempt; stubbing the Agent tool in another left `agent.spawn` without an implementation in the test kit. This is a harness/contract investigation left open, **not a finding that production native agents are broken**. Raw failures were retained rather than disguised as a successful live test.

Artifacts: `probe/`, `probe-test-final.log`, earlier `probe-test*.log`.

Important limits: registrations and external operations in these tests have stubbed host answers. The tests establish source validation, dispatch, guard, serialization and host scheduling checks, not real provider-backed execution or complete policy behavior.

## 4. What can be shared from this project?

There is substantial reusable language machinery, but no ready-made host-neutral production composition root.

Good candidates:

- lexer/parser, AST, static checks and type/schema semantics;
- values, lexical environment, functions, ordinary control flow and parallel execution semantics;
- query phase/state machine, validation/repair, result/error propagation and cancellation rules;
- parameter defaulting and binder envelope classification;
- invocation/result serialization contracts where host-independent.

Useful seams already exist:

- `src/runtime/statement-executor-types.ts`: `StatementEvalHost`, `ExecuteBodyDeps`;
- `src/runtime/query-tool-loop.ts`: `QueryModelDriver`;
- `src/runtime/effectful-statement-host.ts`: effect/query/tool/invoke boundary;
- `src/runtime-root.ts`: injected service seams;
- `src/runtime/subagent-placement.ts`: process placement abstraction.

Production-specific code must not simply be loaded into a Mod:

- `src/extension/production-composition.ts` and producer construction;
- `src/extension/live-prompt-query-driver.ts`: Pi turn drive, state snapshots/restoration and settlement;
- `src/extension/off-session-respond-dispatch.ts`: structured response through pi-ai;
- `src/extension/binder-run.ts`: Pi history/model/auth inputs;
- `src/extension/callable-pi-tool-resolver.ts`: Pi built-in schemas and execution;
- `src/extension/production-host-loop-dispatch.ts`: synthetic Pi provider/turn bridge;
- child launcher, CLI dialect, authenticated environment/control plane and result channel;
- UI and session lifecycle integration.

The seven capability obligations inventoried in `src/extension/sdk-inventory.ts` are a useful starting conformance checklist: commands, prompt drive, isolated workers, tools/gating, cancellation, messages/rendering and binder model.

Detailed local-source evidence: `local-port-analysis.md`.

## 5. The semantic risks that determine full feasibility

### 5.1 Current-conversation prompt mode

Theta owns a sequential program whose `@` operations may start several native turns and consume their results. Mods prompt submission resolves at turn start rather than completion, and direct submission from a command handler is rejected.

A host adapter therefore needs detached orchestration, correlation of each request with the right turn, settled-result/error extraction, and rules for user input arriving mid-run. It must not hold a hook open waiting on an ordinary Promise indefinitely: hooks have a 10-second own-execution budget, excluding most host API calls but not arbitrary waits. Clear/resume/branch and host exit need explicit ownership/cleanup behavior.

A pure skill that asks Claude to interpret the Theta file is not equivalent: the host program, not the model, must own control flow and stop conditions.

### 5.2 Typed queries and argument binding

The current implementation does not just ask for JSON. It runs free tool work, then an off-session structured response using a named respond tool, schema/depth validation and repair. The binder also uses a structured tool-call channel.

Mods documents no equivalent request surface for arbitrary messages plus exactly one tool plus forced tool choice. `model.complete` and `fork` cannot call tools. Registering a respond tool does not force it to run. `turn.step` is powerful, but the documented controls do not establish arbitrary rewriting of request tools/tool choice.

Possible alternatives:

- establish an equivalent current-build Mods API if one exists;
- use a separate Claude CLI/Agent SDK worker with documented structured output, under an appropriate authentication model;
- use another explicitly configured provider through the Node engine;
- define a different validated-text response protocol and demonstrate that the required language-visible success/error behavior still holds.

None should be presented as already proven equivalent. Prompting for JSON alone is not proof.

### 5.3 Tool-set semantics and source portability

Theta's declared callable set controls what its query is offered, not only whether calls are denied. A `tool.call` guard can refuse execution but does not prove that all ambient tools were removed from model context. That affects behavior even when capabilities are not treated as a sandbox.

Registered native agents have tools/disallowed-tools configuration; the main loop has no documented Mod equivalent to Pi's per-query active-tool swap. This favors worker-first prototyping, but workers still need verification.

Existing sources can also name Pi-specific tools and schemas: `read({ path: ... })` is not automatically Claude `Read({ file_path: ... })`. `find`, `ls`, extension tools, MCP names and result formatting have further differences. Options are a deliberate compatibility layer or an explicit portable subset with clear host-specific diagnostics.

Hard-coded provider/model IDs, `bind_model`, thinking settings and system prompts are not automatically portable. Claude Code's native session is not a way to use a ChatGPT Pro subscription. The operator's current OpenAI model choices should not be silently mapped to Claude aliases.

### 5.4 Subagent isolation and return values

Theta currently runs the entire child interpreter in a fresh Pi-family process with root/params/control-plane rules and a validated `theta_result` envelope. Claude's native agent spawn alone does not execute a Theta body.

The Claude implementation needs either a fresh Claude host with a Theta bootstrap, or native agent sessions driven by the external interpreter. It must preserve the requested isolation, repeated-query context, typed values, cancellation/finality and parallel ownership. Returning the agent's last prose answer is not automatically a Theta final value. Keeping Pi children unchanged is a useful hybrid, not proof of a Claude-native host.

### 5.5 Runtime failure and enablement

A Mod runs in a restricted JavaScript environment: no Node APIs, arbitrary npm imports, dynamic imports, timer globals or direct filesystem/network access. `$` calls are statically analyzed and must be spelled explicitly; simply threading `$` through the existing class graph is not allowed. A bundled core would also need to validate AJV/code-generation compatibility rather than assume it.

Hooks fail open by default; a guard requires a valid `.catch` response, and even that cannot guarantee enforcement if the host unloads a Mod or disables hooks. Fail-closed semantics need explicit design.

Mods can be blocked by managed policy, settings, safe/bare modes or a remote rollout switch. Shipping in a release is not a guarantee that every user's installation permits them.

Detailed independent semantic review: `semantic-gaps-analysis.md`.

## 6. Recommended architecture and decision gate

```text
unchanged Theta source where portable
               |
       shared Theta engine (Node initially)
       parser / checks / evaluator / state machines
               |
       explicit host-capability protocol
          /                         \
   existing Pi host          new Claude Mod adapter
                             commands, native tools,
                             turn events, UI, cancellation
```

The Node engine must not bypass Claude permissions by directly executing filesystem/shell effects in place of native tools. Native model/tool work should stay in the Claude adapter unless a workflow explicitly chooses a different provider/host. A sidecar buys compatibility with Node dependencies; it does not solve scheduling, authentication or missing model controls.

Use a small, statically analyzable Mod and a narrow serialized capability interface. HTTP over a local authenticated bridge is one candidate transport; process streaming is another. Neither was implemented/proven here. Process lifetime, cleanup and interruption are part of the feasibility gate.

Before a production plan, prove these in a disposable host prototype:

1. One theta issues **two correlated agentic queries in the current Claude conversation**, consumes the first result and branches before the second; no unintended extra Claude turn.
2. A typed query plus binder succeeds, validates and repairs a malformed result with deterministic error behavior, using an explicit supported inference/auth channel.
3. A code-side tool call runs through Claude's permissions; an out-of-set tool is not offered where exact filtering is required and cannot execute.
4. Two isolated worker thetas run in parallel, preserve private multi-query context and return distinct typed final values.
5. Interrupt, clear/resume, Mod reload/worker failure, child failure and headless exit cancel/refuse work without orphans, duplicate effects or accepting a foreign turn.

If these pass, a dual-host Theta is a reasonable engineering project. If only the worker path passes, ship it honestly as worker-mode support rather than relabeling isolated workers as prompt mode. If structured response or tool filtering cannot be expressed, decide whether a documented reduced profile is worthwhile before changing the language contract.

## 7. Scope and reproducibility

Everything written for this investigation is under **`.pi/tmp/claude-host-research/`**, verified gitignored. Project source, documentation, configuration and dependencies were not edited or installed into the project. Downloaded npm archives/binaries were extracted locally; no global Claude installation was changed. Offline plugin probes used a separate `CLAUDE_CONFIG_DIR` under this directory and disabled telemetry.

Starting git status contained two pre-existing untracked tests:

- `tests/b0503-foreign-turn-production-composition.test.ts`
- `tests/live/b0503-foreign-turn-live.test.ts`

They were not touched. At the final check, a third untracked test, `tests/b0503-owned-turn-settlement.test.ts`, had appeared concurrently; this investigation did not create or touch it either. `git diff --stat` remained empty.

Reproduce core experiment from project root:

```bash
node_modules/.bin/esbuild .pi/tmp/claude-host-research/core-entry.ts \
  --bundle --packages=external --format=esm --platform=node \
  --outfile=.pi/tmp/claude-host-research/core-node.js
node .pi/tmp/claude-host-research/run-core.mjs
```

Reproduce Mod checks:

```bash
export CLAUDE_CONFIG_DIR="$PWD/.pi/tmp/claude-host-research/isolated-config"
export DISABLE_TELEMETRY=1
.pi/tmp/claude-host-research/claude-native/package/claude plugin validate \
  .pi/tmp/claude-host-research/probe --json
.pi/tmp/claude-host-research/claude-native/package/claude plugin test \
  .pi/tmp/claude-host-research/probe
```

The exploratory test command intentionally retains the unresolved native-agent test; expect the recorded partial result, not a clean production conformance gate. No project test suite was needed because no project code was changed. No live Claude/provider test was attempted, so real inference, subscription billing, native worker behavior and complete host parity remain unverified.
