# Local pi-theta → Claude Code host feasibility

> **Developer research, not end-user documentation or an accepted specification.**
> Relocated from `.pi/tmp/claude-host-research/local-port-analysis.md`. Historical release/source pins and evidence limitations remain in force.
> Unless a link points to another tracked document, experiment paths and reproduction instructions refer to the original local evidence workspace, `.pi/tmp/claude-host-research/`; downloads, caches, scripts and raw logs remain gitignored and are not required to read this report.

## Conclusion

**Reuse the language engine; replace the production host composition. An external Node sidecar is the more realistic first architecture.** A bundled, pure-JS subset is plausible later, but the current parser/runtime is not a sandbox-ready package, and neither packaging option solves the missing evidence for a forced-tool model channel.

This is a source inspection, not a port or a runtime compatibility claim. No model calls or project/configuration changes were made. Source anchors below are relative to `/home/thomasa/Projects/pi-theta`; cached Claude docs are under `.pi/tmp/claude-host-research/`. The public `mods-types.txt` (2.1.277) was **not** treated as the current API. Cached docs themselves warn that build-generated declarations outrank published material (`plugins-mods-reference.md:9-11`, `plugins-mods-create.md:272-286`).

**Labels:** Verified = directly supported by inspected source/docs; inference = architectural judgment; unresolved = requires current-build declarations or an offline host probe.

## 1. Actual dependency shape

### Verified

The useful conceptual graph is:

```text
source bytes
  → lexer + encoding
  → theta document/frontmatter/body/type checks + schema lowering
  → composed per-theta input + binder argument preparation
  → statement executor / lexical values / control flow
  → EffectfulStatementHost
      → QueryModelDriver
      → code-tool resolver + dispatch
      → InvokeChild / subagent-fn child
  → production producer + production composition
      → Pi session/model/tool/event/UI/filesystem/process implementations
```

* `src/parser/theta-document.ts:26-103,149` wires lexer, parser, type layer, query-schema resolution, rendering, callable resolution, and placement checks. It even imports `inertSystemNoteChannel` from the extension layer (`:29`): directories are not strict package boundaries.
* `src/runtime/statement-executor.ts:35-100,417,811,1006` implements evaluation and execution over parser types and injected collaborators. Its imports include the parser document at runtime, so bundling the executor can pull parsing/schema dependencies too.
* The effect boundary is already useful: `QueryHostDispatch` and `EffectfulStatementHostDeps` carry query driver/config/schema decoding, tool resolution, invoke resolution, cancellation and checkpointing (`src/runtime/effectful-statement-host.ts:96-224`). The `pi-tool` discriminant is a historical host name, not proof that the underlying evaluator needs Pi.
* `RuntimeRoot` is **a seam holder**, not a ready-to-run standalone interpreter: checkpoint, schema validator, clock, filesystem, watcher, token estimator and ID source (`src/runtime-root.ts:27-73`). The real construction-input surface is much broader: `ProductionProducerInput` contains Pi API/model registry, tool executors, child launch/control plane, placement, status and other collaborators (`src/extension/production-producer-deps.ts:124-230`).
* Parser dependencies include synchronous Node SHA-256 for canonical schema hashes/slugs (`src/parser/schema-lowering.ts:28,103-115`) and Node POSIX path helpers (`src/parser/callable-set.ts:36`, `src/parser/thetalib-resolver.ts:10`). Frontmatter brings in `yaml` (`src/parser/frontmatter.ts:29-33`; import is from `yaml`). Pure evaluation is reusable, but the transitive graph is not entirely platform-neutral.
* Production validation is AJV + formats (`src/seams/ajv-schema-validator.ts:5-6`), creates two validator instances and compiles arbitrary lowered schemas (`:370-376,426-427`). Retain the `__proto__` handling and own-property semantics rather than replacing validation casually (`:17-30`).
* Binder orchestration is a separate host-heavy area: `binder-run.ts` imports Pi session context building and pi-ai compatibility `complete` (`src/extension/binder-run.ts:13-18`), while much envelope/defaulting/error/value logic is independently reusable. Type-only Pi imports in transcript/token interfaces are not runtime dependencies, but their message semantics still need translation.

### Inference

Extract/share a deliberately bounded language layer (lexer/parser/type and schema semantics, values/evaluator, query state machine, validation/defaulting/error machinery), not `src/runtime/**` wholesale and not the production default export. Preserve tests at these boundaries. The current seams make this feasible, but there is no single host-neutral composition function that can just receive `$` instead of `pi`.

## 2. Production host obligations

### Verified

The shipped host explicitly inventories seven obligations: slash registration, prompt conversation drive, isolated subagent session, tool registration/gating, cancellation, custom-message rendering/channel, binder model (`src/extension/sdk-inventory.ts:176-192`). This is broader than “register a command and submit a prompt.”

Prompt-mode production uses `sendMessage`, `sendUserMessage`, active-tool get/set, model switching, thinking-level get/set; context supplies abort, idle/wait-for-idle, model and signal (`src/extension/live-prompt-query-driver.ts:144-163`). It drives native host turns and separately dispatches typed finalization (`:166-181`). Settlement/recovery logic is specific to Pi retries, compaction and session entries; production reads Pi entries/leaf/branch (`src/extension/production-theta-producer.ts:829-841`).

Claude Mods documents command and tool registration (`plugins-mods-api.md:11-98`), turn events (`plugins-mods-reference.md:138-146`), prompt submission, abort, session transcript/usage/compact, and tool calls (`:235-260`). These are promising adapter ingredients, not drop-in versions of Pi's interfaces. In particular, `$.prompt.submit` resolves **when a turn starts**, not when it finishes, and must not be awaited inside a handler that is blocking the active turn (`plugins-mods-api.md:217-219`).

Session lifetime also differs: Mods `session.start` is not redelivered after clear/resume/branch, while `session.end` covers these transitions (`plugins-mods-reference.md:154-166`). Existing factory recompose/shutdown and active invocation ownership need a fresh lifecycle design, not event-name substitutions.

### Inference

The Claude-facing component should own native registration, turn completion correlation, permission-aware tool invocation, cancellation and UI. A sidecar should receive serialized language inputs and explicit capabilities/results, not a fake Pi `ExtensionContext`.

## 3. Typed queries and binder: the critical capability gap

### Verified

`QueryModelDriver` needs three behaviors: free-phase turn, execution of a parallel tool batch with side-effect accounting, and a forced respond turn (`src/runtime/query-tool-loop.ts:154-178`). Typed queries use a free tool phase followed by a named `__theta_respond_<slug>` tool; `max_rounds: 0` skips the free phase entirely (`:11-20`). The structured result is depth-checked, schema-validated, repaired when necessary, and decoded before binding (`src/runtime/effectful-statement-host.ts:110-130`; typed loop outcome contracts at `src/runtime/query-tool-loop.ts:229-280`).

Today's production typed finalization is **off-session**, using pi-ai `complete`, the selected model, registry-derived auth, replayed messages, exactly one respond tool and provider-specific `toolChoice` (`src/extension/off-session-respond-dispatch.ts:200-276`). It forwards abort and captures raw provider response metadata. A model-level forcing rejection permits a single degraded reissue without `toolChoice`; this is a narrow fallback, not the primary protocol (`:244-268`). Binder inference uses its own structured tool call too (`src/binder/binder-inference.ts:385-438`; `src/extension/binder-run.ts:709-741`).

The typed-support gate is explicitly about pi-ai API adapters supporting named-tool forcing, **not** generic Anthropic branding (`src/runtime/typed-query-provider-gate.ts:14-46`). Claude Code being Anthropic-backed does not make that gate applicable to its Mods methods.

Current cached Mods docs describe:

* `$.model.complete`: one prompt, optional system, **no tools**.
* `$.model.fork`: current conversation/system/context, tools present but **the model cannot call them**.
* Both use Claude Code session credentials (`plugins-mods-api.md:100-116`).
* `turn.step` can change model/effort and stream or answer a step, but the reference does not establish arbitrary request tools/messages/tool-choice mutation (`plugins-mods-reference.md:138-146`; `plugins-mods-events.md:247-281`).

### Inference / unresolved

**Not established:** a Mods-native off-session equivalent of `complete(model, {messages, tools:[respond]}, {toolChoice, signal, onResponse})`. Registering a native respond tool makes it available; it does not force the next model turn to call it, isolate it from the session transcript, or produce the same error/usage surface.

Prompting for JSON and AJV-validating can support a deliberately different contract. It is not an unchanged typed-query/binder port, even if repair logic is reused. Investigate the exact current-build model/turn/agent method signatures before claiming parity. Keeping pi-ai in a Node sidecar retains its API protocol but requires independently valid provider credentials; **Claude Code session billing/auth is not automatically exported to that process**. Under this operator's policy, no Claude-backed live verification is appropriate.

## 4. Model and tool source portability

### Verified

Model reference matching itself is generic: exact `provider/modelId` or bare ID over an injected available-model list, with ambiguity detection (`src/parser/model-reference-matcher.ts:22-91`). Production supplies `ctx.modelRegistry.getAvailable()` and probes concrete model capabilities (`src/extension/production-composition.ts:878-906`); binder strict capability is a distinct check (`src/binder/binder-model.ts:102-139`).

Tool loading has two sources:

1. Pi built-ins `grep/read/find/ls/bash/edit/write`, constructed using Pi SDK factories (`src/extension/callable-pi-tool-resolver.ts:3-11,35-57`). Code calls execute these directly with Pi-shaped parameters/results/context (`:132-170`).
2. Extension tools resolved from a normalized registry snapshot, pinned with name and optional schema, **without an execute handle** (`:61-118,173-195`).

The existing workaround for execute-less tools is highly Pi-specific: register a synthetic provider that emits a tool-use block, temporarily switch the native model/active set, run a fabricated zero-token host turn, capture the tool result, restore (`src/extension/production-host-loop-dispatch.ts:14-37,44-52`). This is not a portable tool execution API.

Mods exposes `$.tool.list/call/check/register` (`plugins-mods-reference.md:242-243`), likely a better native execution route than porting the synthetic provider bridge. Registered Mods tools have `mcp__<plugin>__<name>` names (`plugins-mods-api.md:52-54`). Tool call arguments/results are host-specific; the events guide explicitly requires built-in result shapes from current-build types (`plugins-mods-events.md:136-140`).

### Inference / unresolved

* Reuse callable closure/resolution semantics and schema admission, but provide a Claude tool catalog and call adapter. A lowercase Pi `read({path,...})` is not automatically Claude `Read({file_path,...})`; names, schemas, results, and permission denials require deliberate mappings or explicit non-portable source errors.
* Never replace permission-aware native tool calls with sidecar filesystem/shell execution merely to preserve an old tool signature. That changes the security boundary.
* The cached namespace table does not prove a Pi-equivalent provider/model catalog with API IDs, context sizes, strict-capability metadata and auth provenance. Model selection, `bind_model`, `thinking`, provider errors and token accounting need host-specific capability policy. Do not silently reinterpret authored OpenAI references as Claude aliases.

## 5. Subagents and placement

### Verified

Current subagents are **fresh host processes**, not simply native agent tool calls. The producer inputs include executable resolution, parent environment/PID, launch file/result channel, child session log, root regime and placement (`src/extension/production-producer-deps.ts:157-230`). `subagent fn` also goes through this child/invoke boundary (`src/runtime/effectful-statement-host.ts:212-224`).

The launch contract contains host CLI intents and explicit Pi/Oh-My-Pi dialects (`src/runtime/subagent-argv.ts:11-107`). It still assembles a Pi-family invocation: theta slash entry, extension pin, discovery roots, system prompt, host-tool allowlist, provider/model, thinking and project-file trust (`:141-220`). It is not a generic Claude CLI dialect merely waiting for one more constant.

Placement is a valuable reusable seam: prepared executable/argv/cwd/env plus label, presentation, launch file and context (`src/runtime/subagent-placement.ts:70-99`); backend capabilities distinguish exit observation, environment inheritance and visibility (`:101-125`); backend returns a killable handle (`:128-170`). Pipe placement carries results on stdout and control plane in env with ppid authentication (`:184-218`). Other placements use a separate channel. Node implementations use `child_process` (`src/extension/production-subagent-host.ts:15`) and TCP sockets/random bytes (`src/extension/production-result-channel.ts:13-14`). The parent recognizes a versioned `theta_result` envelope, not arbitrary child assistant prose (`src/runtime/subagent-envelope.ts:63,136,250,293-295`; `src/runtime/subagent-json-driver.ts:137-177`).

Mods offers native agent register/spawn/list and agent spawn hooks (`plugins-mods-reference.md:168-180,244`). The cached docs do not establish theta's typed return/control-plane/closure-hash/root-isolation/session-log guarantees for those agents.

### Inference

Preserve launch intent, envelope validation, cancellation/finality and placement policy where useful, but replace the host process launcher and child bootstrap. A backend that merely launches `claude` cannot make Claude understand theta slash commands, its root regime, fn entry, or result envelope. Keeping Pi children unchanged is a hybrid “Claude front end controlling Pi workers,” **not** a Claude-native theta execution port.

Native Claude agents could be an alternative implementation of child isolation, but process-level cancellation/liveness, ambient instruction suppression, exact tools/model selection, return serialization and parallel ownership must be proven separately. Do not equate project-file trust with tool-approval bypass flags; the existing dialect explicitly rejects this conflation (`src/runtime/subagent-argv.ts:34-46`).

## 6. Packaging decision

| Option | What it buys | What it does not solve |
|---|---|---|
| **Thin Mods adapter + external Node sidecar** | Keeps Node path/hash, YAML, AJV, filesystem/watchers, process/socket infrastructure; allows strongest reuse of current language code and offline tests. | Native turn orchestration, permissions/tool schemas, Claude credential use, forced-tool model channel, child bootstrap and lifecycle still need a new adapter. Adds deployment/protocol/cleanup concerns. |
| **Bundled pure-JS core inside Mods** | No separately installed Node process; natural native API ownership. Suitable for a deliberately small engine subset. | Requires bundle/import cleanup, synchronous hash/path replacement, host seams, validator compatibility, static-analysis-safe callbacks, budgets and resource limits. Does not create missing model capabilities. |

### Verified constraints on the bundle

Mods has no Node APIs, own filesystem/network access, or timer globals; standard JS/web APIs including `crypto.subtle` exist (`plugins-mods-api.md:264-278`). Imports must be plugin-relative ESM except `claude-code`, with no dynamic import (`plugins-mods-create.md:309-316`). Thus vendoring/bundling dependencies is necessary, not sufficient.

The analyzer also constrains API binding: `$` calls must be fully spelled; passing `$` to methods/imported functions, destructuring namespaces, computed member selection and dynamic event names fail validation (`plugins-mods-create.md:309-313`). Ordinary dependency injection of plain data/functions remains conceptually possible; passing the host API object through today's class graph is not.

The hook's own execution budget is 10 seconds, excluding most Mods API calls; awaiting an ordinary promise counts. Session-end cleanup has a much shorter shared budget. File calls are bounded at 4 MiB and transcript access at 4,096 recent entries (`plugins-mods-reference.md:345-369`). A long-running interpreter in a command hook must account for these, even if every individual model/tool call is fast. Hook failure is normally fail-open unless a valid catch refuses it, and even catch failure falls through (`plugins-mods-events.md:318-350`).

### Inference

The sidecar reduces **environmental** porting, not **semantic** porting. Prefer a narrow serialized capability protocol and a thin statically analyzable Mods file. Native model/tool work should return through the host adapter; the sidecar should not acquire hidden privileges or pretend to share Claude credentials. A bundled core is a later optimization once the smallest necessary shared graph and host parity are known. Web Crypto's asynchronous interface cannot directly substitute for the current synchronous schema-slug functions without a compatible synchronous hash implementation or a broader refactor.

### Unresolved before choosing parity scope

1. Current-build tools/model/agent/turn declarations: named tool forcing, full message replay, cancellation, completion/usage/error observables, tool catalog schemas and agent typed returns.
2. Can prompt-mode commands coordinate multiple native turns without waiting on the hook that blocks those turns? Need lifecycle/correlation proof, not only API name matching.
3. Does the Mods sandbox accept the chosen validator implementation/code generation? Current AJV compilation is verified; sandbox compatibility is not. Likewise validate the final bundle against the current analyzer and 2,000 nested-scope limit (`plugins-mods-reference.md:375`).
4. Sidecar process transport: streaming, input/control messages, interruption, shutdown cleanup and permission propagation. `$.process.spawn` exists, but its precise current-build signature must be checked; `$.process.run` is bounded and resolves only at process exit (`plugins-mods-api.md:264-295`; `plugins-mods-reference.md:353-356`).
5. Whether native agents or independently launched Claude hosts can reproduce the required ambient isolation and theta result channel without policy weakening.

**Bottom line:** substantial language-engine reuse is supported by actual source. Unchanged production behavior is not. The two biggest semantic blockers are the off-session structured tool-call channel (typed queries **and binder**) and the Pi-host child/bootstrap/tool execution contracts; these remain blockers with either packaging choice.
