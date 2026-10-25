# Theta Core: a shared semantic kernel, not a shared host imitation

> **Developer research, not end-user documentation or an accepted specification.**
> Relocated from `.pi/tmp/theta-core-research/REPORT.md`. Historical release/source pins and evidence limitations remain in force.
> Unless a link points to another tracked document, experiment paths and reproduction instructions refer to the original local evidence workspace, `.pi/tmp/theta-core-research/`; downloads, caches, scripts and raw logs remain gitignored and are not required to read this report.

**Research/design proposal — 2026-10-24. No implementation authorized or performed.**\
**Lead synthesis:** GPT Astra 6 (`openai/gpt-6-astra`). One bounded OpenAI-only delegate audited static dependencies; its result was wait-collected.\
**Theta baseline:** `@bitmonk8/pi-theta` **0.497.0**, HEAD **`28424268b24a41536975e69606bd5a848047bbc1`**.\
**Initial targets:** Pi Agent, a new Pi Durable-based application, Claude Code, Codex, OpenCode.\
**Publication revision — 2026-10-25:** Claude Code is an explicit adapter and migration target, not background context only. Its inclusion changes the design scope and validation gates, not the strength of the original provider-free evidence.

## Executive summary

**Extract a host-independent Theta semantic implementation, but redesign its execution boundary before making it a public library.** The reusable asset is larger than a parser and smaller than today's production runtime: language/types/values, loading and checking, deterministic evaluation, query and binder policy, validation/repair, invocation semantics, cancellation/finality and diagnostic construction. It is not Pi's conversation driver, provider registry, tool factory collection, UI, subprocess dialect or authenticated environment protocol.

The most consequential redesign is to **separate ownership of language execution from ownership of a native agent loop**. Today's `QueryModelDriver` appears to expose individual model rounds, but the Pi implementation runs a whole native agent loop, synthesizes exhaustion rounds afterward, and has a no-op `runToolBatch`. Copying this interface to other hosts would institutionalize a misleading abstraction. Introduce explicit **core-stepped rounds** and **host-governed whole-turn execution** as distinct execution strategies under one shared semantic query controller. A whole-turn adapter must demonstrate the required tool visibility, pre-effect budgets, settlement and context provenance; accepting a prompt is not enough.

Recommended decisions:

1. **One `theta-core` package with layered subpath exports**, not one runtime clone per host. Keep provider/tool/worker transports in companion packages. Start with the existing Node floor; make the language/kernel dependency graph portable by construction without promising browser, Bun or QuickJS conformance.
2. **Data-first effect requests and explicit operation handles**, dispatched through asynchronous ports. Retain the async tree-walking interpreter initially. Make query/binder/admission reducers explicit now; do not convert the entire interpreter to a persistent bytecode VM merely to extract it.
3. **Immutable loaded artifacts plus separately linked host bindings.** Pin declaration and callable identity, source/schema digests and adapter revisions. Do not freeze away current invocation-time root/reachability checks or silently change Pi's reload behavior.
4. **Session leases with accurately declared strength**, correlated admission and terminal settlement, immutable accepted context snapshots, downward cancellation and joined cleanup. A local mutex is not a host-wide lease. Pi's correlation workarounds stay in its adapter; Codex shared threads and OpenCode shared sessions must not be advertised as exclusively owned.
5. **Structured inference is a protocol, not “ask for JSON.”** Share validation, wire-name conversion, repair/defaulting and error policy. Keep named-response-tool, native JSON-schema final message and host schema-tool transports distinct and observable. Alternative transports require an approved compatibility contract; they are not automatically equivalent to the current normative templates and failure branches.
6. **Keep existing Pi behavior as the first consumer and regression oracle.** Do not bundle the draft installed-tool dispatch/observability changes (RFCs 0016/0017) into an “implementation-only” extraction. Current built-in precedence and fabricated-turn bridge remain Pi compatibility mechanisms until separately changed.
7. **Pi Durable is the best second architecture exercise**, because a new application can own admissions and use direct inference/tool machinery. **Claude Code is also a first-class migration target:** prototype a thin Mod with a Node engine bridge, detached command orchestration and explicit native-tool/inference authority. This restrictive-runtime boundary should exercise the shared effect protocol rather than create another interpreter. Its worker, typed-response, exact-tool-exposure and headless-lifetime gates remain unproven. Codex and OpenCode should begin with owned workers and honest, preflighted subsets. OpenCode's native TUI entry is demonstrated; Codex's shared-thread sidecar is real but weaker. None of these entries creates missing executor or round-control APIs.
8. **Design an optional durability seam, not durable Theta now.** Stable effect identities, explicit receipts and codecs are worthwhile today. Persistent continuation/journal semantics, migrations and replay authorization are a separate approval gate. Durable's safe external effect was observed executing twice after a crash; unsafe recovery correctly remained uncertain.

This proposal supports **unequal capabilities without unequal language semantics**: a profile either implements the required behavior, rejects the program/operation, or offers a separately named, explicitly selected adaptation. It does not silently weaken `max_rounds`, rename tools/models, share credentials, or replace native authorization with privileged Node operations.

**Reading guide:** §0 evidence; §1 invariants; §2 packages/dependencies; §3 API/lifecycle; §4 query/binder redesign; §5 host profiles; §6 context/tools/workers/codecs; §7 durability; §8 source/spec compatibility; §9 extraction map; §10 validation; §11 migration/alternatives; §12 decisions and falsification gates; Appendix A source anchors.

---

## 0. Evidence, scope and confidence

### 0.1 What was read and verified

All thirteen requested prior reports were read before current-source investigation:

- [Claude overview](../hosts/claude-code/REPORT.md), [local port analysis](../hosts/claude-code/local-port-analysis.md), [semantic gaps](../hosts/claude-code/semantic-gaps-analysis.md).
- [Codex overview](../hosts/codex/REPORT.md), [released API](../hosts/codex/api-audit/REPORT.md), [daemon ownership](../hosts/codex/daemon-audit/report.md), [Theta obligations](../hosts/codex/theta-semantics/REPORT.md).
- [OpenCode overview](../hosts/opencode/REPORT.md), [released API](../hosts/opencode/delegates/release-api/REPORT.md), [semantics](../hosts/opencode/delegates/semantics/REPORT.md).
- [Pi Durable overview](../hosts/pi-durable/REPORT.md), [API analysis](../hosts/pi-durable/api-analysis/report.md), [recovery analysis](../hosts/pi-durable/recovery-analysis/REPORT.md).

**Path convention:** unprefixed module paths such as `runtime/value.ts` resolve under `/home/thomasa/Projects/pi-theta/src/`. Paths starting `src/`, `docs/`, `tests/`, `.pi/`, or `package.json` are relative to the repository root. Retained host-source paths use the research roots explicitly identified in Appendix A.

Consequential claims were checked against current Theta source/spec/tests and selected retained release source, generated declarations, assertions and recovery logs. This research did **not** rerun earlier experiments, launch host binaries, install packages or call providers. The new static probe parses imports using already-installed TypeScript; it does not execute project modules. Its report is [audit/focused-audit.md](audit/focused-audit.md).

Evidence vocabulary in this document:

- **Current source:** inspected Theta working-tree code/spec/test definitions; not a claim that tests ran here.
- **Release source/artifact:** pinned retained source or published/generated declarations.
- **Prior offline execution:** real host/runtime with a canned local provider or fetch fixture; useful evidence for scheduling, serialization and native effects, **not live model compliance or account entitlement**.
- **Proposal / gate:** a recommendation or unverified requirement, not an existing API.

### 0.2 Release anchors and evidence limits

| Host | Retained pin | Strongest relevant evidence | What it does not establish |
|---|---|---|---|
| Pi Agent | Current Theta 0.497.0; manifest dev dependencies `~1.3.0`, peers `>=1.3.0`; installed Pi docs inspected at 1.4.0 | Actual production driver, resolver, governor, ownership and regression test code; installed extension/SDK contracts | Fresh test pass, a new transcript-free root tool dispatcher, or a verified dependency upgrade |
| Pi Durable | 1.4.0; `earendil-works/pi` commit `4a080252f06caf63a525d7873c5d94d3c23887e0` | Released package offline conversations/tools and real SIGKILL/reopen probes; tiny actual Theta interpreter fixture | Full Theta host, current Pi TUI attachment, persisted JS continuation, exactly-once external effects; package API explicitly experimental |
| Codex | CLI/SDK 0.163.0; commit `83086188ae0614bd882818ff1aa23f3194962012` | Released binary app-server probes, generated protocol, same-server two-client rejoin and shared approval experiment | Real TUI/daemon-manager acceptance, exclusive admission, arbitrary native tool execution, live subscription inference |
| OpenCode | 1.19.3; commit `e3c4eb242585dcd77be1a867391b7c25fd47ce52` | Real TUI command callback drove two turns in an existing conversation; request filtering, native read approvals, overlap negative probe | Complete Theta adapter, public single-step/native executor, exact binder context, live auth/schema behavior |
| Claude Code | 2.1.303 binary; older public declarations explicitly not build-matched | Mod validation and offline dispatch; release runner rejects prompt submission inside a command hook, and a deferred callback reaches a stub | Native multi-turn completion, worker execution, exact tool exposure, structured inference and headless lifetime; no live model or account verification |

The older Codex/OpenCode/Claude reports inspected Theta 0.496.0 and concurrent edits. Their local-source descriptions are leads, not this report's baseline. Installed Pi 1.4 documentation describes useful lifecycle APIs such as `agent_settled`, but that is **not** permission to remove current recovery/ownership guards without tests against the supported pins.

### 0.3 Repository and write boundary

Starting and observed HEAD agree. These pre-existing untracked files belong to concurrent work and were not read as task fixtures, modified or attributed to this research:

```text
tests/b0511-stmtblock-query-tail-unit.test.ts
tests/b0511-stmtblock-query-tail.test.ts
tests/helpers/b0511-fixtures.ts
tests/live/b0511live-stmtblock-query-refusal.test.ts
```

The supplied `initial-head.txt` / `initial-git-status.txt` were preserved. `observed-head-start.txt`, `observed-status-start.txt` and `inspected-source-sha256.json` record this investigation's baseline and selected bytes. At final verification HEAD was still unchanged, but concurrent tracked edits had appeared in parser files, grammar/query documentation and one existing test; `observed-status-final.txt` records the complete list. None was written by this task. The selected digest-manifest files remained unchanged; that manifest is not a snapshot of every transitive dependency. The static graph and source observations describe the bytes at inspection time, not an assertion that the final whole working tree equals HEAD. Rebaseline before implementation.

All authored files, custom agent definitions and static scripts are under this ignored workspace. No project/configuration/dependency/git-state mutation was authorized.

---

## 1. What “shared core” should mean

### 1.1 Goals

- One implementation of Theta evaluation and effect **semantics**, used by all adapters.
- A standalone compile/load/check API suitable for editors, linting, scripted tests and hosts without Pi.
- A host can retain its native conversation, tools, permission UX, model access and rendering where its APIs actually support the contract.
- Explicit program requirements and profile negotiation before effects; targeted runtime revalidation where host state can change.
- Reusable tests that expose semantic differences rather than hide them behind successful Promises.
- Preserve current Pi source and observable behavior through the first migration. Other hosts get explicit portability claims, not an implied promise that every Pi-authored script runs unchanged.

### 1.2 Non-goals

Not a universal agent framework, provider SDK, permission engine, filesystem sandbox, UI toolkit, session database or general workflow engine. Not model-interpreted Theta. Not a common native tool naming scheme. Not automatic OAuth/token sharing. Not transparent cross-host conversation cloning, identical model output, or automatic durable execution. Not an approved redesign of the language surface.

“Shared” should be measured by common semantic tests and shared implementations of values/control/query/binder/invoke policy—not by whether all hosts call an identically named `prompt()` function.

### 1.3 Separate four kinds of rule

| Kind | Examples | Treatment |
|---|---|---|
| **Language invariants** | Lexical scope/residence, evaluation order, branded Result/enum behavior, schema/wire translation, `?`, final value, depth/round/repair precedence, parallel indexed Results, no rollback | Core owns these; an adapter cannot reinterpret them |
| **Shipped Pi profile contracts** | Exact active-set swap/restore, current error/note templates, built-in direct dispatch, child CLI/env/envelope behavior, recovery/compaction refusal rules | Preserve in the Pi adapter; being host-specific does not make an already specified behavior disposable |
| **Optional host capabilities** | Native current-session entry, detached renderer, arbitrary native tool dispatcher, exact per-query tool exposure, isolated inference, compaction, process placement | Negotiate independently; absence is not simulated success |
| **Product decisions requiring approval** | New portable configuration syntax, schema-final adaptation, in-process substitute for process isolation, stronger shared-session arbitration, durable continuation, RFC 0016/0017 semantics | Specify/version separately; do not smuggle through a package move |

The current spec deliberately targets Node and does not define a per-theta sandbox (`docs/spec_topics/language-and-architecture.md`, `runtime-value-model.md#javascript-engine-assumptions`). A capability profile describes **what the runtime can faithfully do**, not a new claim that Theta's `tools:` list is an OS security sandbox. Native tools and extensions may themselves reach other operations; the host remains responsible for those policies.

### 1.4 Invariants that must survive extraction

1. **Deterministic code owns control flow.** The model supplies query/binder outputs, not interpreter decisions.
2. **Values are not arbitrary JSON.** `Result` cannot be forged by `{ok:true}`; enums preserve declaring identity through aliases, libraries and invokes; schema brands, field ordering and wire renames remain correct. Nonfinite numbers can exist in computation but current child returns reject them; `-0` has an explicit wire preservation rule. See `runtime/value.ts:56–112,278–315,489–549`, `runtime/subagent-envelope.ts:65–155` and `runtime-value-model.md`.
3. **Boundary checking order matters.** Depth checks precede AJV; named enum/schema reconstruction follows successful inbound validation; argument evaluation remains left-to-right and occurs once. Preserve existing `QueryError`/invoke provenance and cancellation precedence.
4. **Query budgets count tool-call batches, not tools or HTTP requests.** A parallel batch consumes one free round; typed finalization is exempt; typed `max_rounds:0` issues no free call; untyped zero rounds exhausts immediately. Repair restarts the whole two-phase attempt with a fresh round budget. See `query-tool-loop.ts:88–178,345–440` and QRY-13…16.
5. **Completed effects remain final.** No implicit compensation, transcript deletion or rewritten successful binding after a later cancellation. A tool batch accounts for committed siblings even when another fails.
6. **Isolation and ownership are observable.** Foreign turns cannot supply a Theta result. A private worker's history does not become the parent's result channel. Per-chain depth and per-query budgets are not shared across sibling lanes.
7. **Cancellation is downward and checkpointed, not retroactive.** Stop real work where authorized; do not merely ignore a future. Preserve pure-tail and completed-result rules. Loop yielding exists so cancellation can arrive; it is not persistence.
8. **Diagnostics are results too.** Source residence, stable codes, sorted child diagnostics, error origin and headless failure visibility must not be lost when UI is replaced.

---

## 2. Recommended package and dependency architecture

### 2.1 Logical graph

Arrows mean “depends on”; composition supplies implementations inward. Names are **proposed package names**, not an instruction to publish them now.

```text
Pi extension   Durable app   Claude Code Mod   Codex controller   OpenCode integration
     |              |               |                 |                  |
 host-pi       host-durable     host-claude-code    host-codex        host-opencode
     |              |         thin bridge to Node     |                  |
     +--------------+---------------+-----------------+------------------+
                                    |
                  theta-core public contracts / core execution
                    /             |                \
            compiler/linker     kernel          protocols
                    \             |                /
                  language / schema descriptors / values / diagnostics

 theta-node --------> theta-core       theta-validation-ajv --> core schema contract
   fs/roots/watch/hash/worker transports        AJV + formats, pinned behavior

 theta-conformance --> core + scripted ports + adapter fixture factories
 future theta-durability-* --> core effect/codec seam + chosen persistence host
```

The graph's abbreviated `host-*` names denote the proposed `theta-host-*` adapter packages, including **`theta-host-claude-code`**. For Claude Code, the Mod is a small separately loaded entry module; the initial Node engine/bridge can consume `theta-core`, `theta-node` and AJV outside the restricted Mods runtime. Transport, supervision and authority are part of that adapter, not a universal sidecar imposed on every host. An in-Mod bundle remains a later option only after dependency and validator/runtime certification.

All host packages may use `theta-node` and the AJV implementation where their runtime permits it. A pure parser consumer need not install any host, pi-ai, TypeBox, process transport or UI. `theta-core` never imports a host package. The public facade must not eagerly re-export Node/default-adapter modules that defeat this boundary.

### 2.2 One core package, several enforced layers

Start with one package/version for the tightly coupled language/runtime, with explicit exports such as `theta-core/language`, `/compiler`, `/execution`, `/protocols`, `/contracts`. This avoids a premature fleet of independently versioned micro-packages whose AST/value versions must always agree. Enforce the internal DAG with import rules; do not use a giant barrel as the architecture.

| Layer/package | Owns | Must not own |
|---|---|---|
| **core/language** | Lexer, AST, syntax/static types, canonical schema construction, value operations, source locations, pure diagnostic builders | Host discovery, Node paths/crypto, provider types, filesystem reads, UI delivery |
| **core/compiler** | Document checks, graph checking, import/callable linking algorithms, source maps, requirements, immutable semantic artifacts | Ambient cwd/env/config; Pi registration; mutable session/tool handles |
| **core/execution** | Tree-walk evaluator, lexical activations, structured parallelism, invocation/depth/finality, checkpoint policy, effect identities | Host turn polling, provider options/auth, CLI argv, session mutation methods |
| **core/protocols** | Query/binder state and budget policy, schema validation/repair orchestration, argument/default/result conversion, result/provenance codecs | pi-ai `Model`, `Message` or `complete`; host-specific schema forcing or native tool execution |
| **theta-validation-ajv** | Current AJV/formats behavior, error normalization, own-property hardening and compile cache | Source discovery or model inference |
| **theta-node** | Node filesystem/root services, clocks/yield scheduling, SHA-256, watchers, generic local process/IPC mechanics and cleanup | Pi CLI dialect, host credential discovery, language semantics or approval policy |
| **theta-inference-pi-ai** | pi-ai request/reply translation, provider-specific named forcing, seed/temperature placement, supported schema attachment transformations | Pi coding-agent sessions, implicit auth extraction, command binding/UI |
| **host adapters** | Entry registration, catalogs, native loop/turn identity, policy/approval/auth ownership, native tools, transcript projection, worker bootstrap, diagnostics/UI transport | Private copies of interpreter, validation/repair budgets or language value rules |
| **future durability companion** | Journal/checkpoint storage, fencing/recovery policy, ABI migrations, effect reconciliation | Changing ordinary invocation semantics by its mere installation |

A “default Node runtime” factory can compose these for convenience, but it should be a companion entry point. Consumers must still select a host profile and credentials authority; defaults cannot quietly turn a Codex-native request into a direct pi-ai call.

### 2.3 What the actual dependency audit changes

The code is less Pi-runtime-coupled than a directory overview suggests, but more internally tangled than a copy operation suggests. The static graph over 315 TS files found these **unbundled local runtime closures**, including the entry itself:

| Entry | Runtime files | Runtime external imports |
|---|---:|---|
| `parser/theta-document.ts` | 97 | `node:crypto`, `node:path`, `yaml` |
| `runtime/statement-executor.ts` | 116 | same |
| `runtime/effectful-statement-host.ts` | 113 | same |
| `binder/binder-inference.ts` | 5 | `typebox` |
| `runtime-root.ts` | 1 | none |

**None of these five runtime closures imports Pi or AJV.** Pi types still leak through public declarations; production composition imports actual Pi runtime modules. Third-party internals were not recursively analyzed, and these counts are not tree-shaken bundle sizes. This corrects any inference that importing the evaluator necessarily imports the entire Pi SDK.

Concrete leaks to remove:

- `theta-document.ts:29` imports `inertSystemNoteChannel` through an extension module even though its owner already exists at `diagnostics/system-note.ts:206`.
- The executor's direct AST import is type-only. The hidden runtime path is `statement-executor.ts:81 → tool-call.ts:38 → parser/tool-call-static-checks.ts:22 → type-layer-checks.ts:86 → local-binders.ts:5 → theta-document`. Separate runtime defects from parse-check re-exports; move small AST helpers down.
- `wire-form-depth-walk.ts:42` imports pointer escaping from `schema-lowering`, incidentally loading Node crypto. Split the pointer helper from hashing/lowering.
- `query-tool-loop.ts:62 → runtime-event-channel.ts:16` pulls extension delivery into pure event arithmetic. Separate event construction from publication.
- `statement-executor-types.ts:23` imports lane hooks from extension status types; `seams/token-estimator.ts:9` exposes Pi `AgentMessage`. These are **type-only/API leaks**, not runtime Pi loading, but must disappear from public core declarations.
- `RuntimeRoot` is a seven-service holder, not an embeddable runtime factory. Expanding it into a universal host object would repeat the large `ProductionProducerInput` problem.

### 2.4 Dependency choices

**Node versus portable JS.** Keep the initial supported execution floor at Node >=22.19.0. Remove incidental Node imports from language/kernel and express host services through narrow ports. That makes later portability plausible; it does not certify OpenCode's Bun runtime, a browser, Claude's restricted Mod worker or Durable codemode's QuickJS. A Node supervisor is a valid first deployment for hosts with a different embedded runtime. In-process Bun support needs a separately approved host-floor/conformance decision.

**Hashing.** Preserve canonical bytes, SHA-256 algorithm, slug truncation and collision byte checks. Initially inject a required synchronous digest implementation into the compiler/schema-identity service, supplied by `theta-node` using existing Node crypto. Keep pure canonicalization independent. Do not replace SHA-256 with an approximate hash, or insert asynchronous Web Crypto halfway through synchronous parser routines. A future compatible synchronous JS implementation can serve the same contract; no new crypto dependency is necessary for the first Node extraction. Full program loading may be async even though canonical schema identity is synchronous. Distinguish schema hashes, source digests, callable-closure identity and protocol versions.

**Validation.** JSON Schema documents and Theta translation sidecars are the core representation, not AJV validator functions or TypeBox objects. `SchemaValidator` remains required. Ship the existing AJV implementation as the initial certified validator, preserving `allErrors`, issue ordering and the special `__proto__` handling (`seams/ajv-schema-validator.ts:342–427`). An interface is not permission for arbitrary substitute validators. AJV runtime code generation is acceptable on the initial Node target; restricted runtimes must certify an interpreter/AOT alternative or refuse schemas. Do not claim “pure JS” implies sandbox-safe `new Function` or arbitrary-schema compilation.

**TypeBox.** Move TypeBox attachment/wrapping to pi-ai/Pi/Durable adapter code. In particular, `binder-inference.ts:426–494` repairs keys dropped by `Type.Unsafe`; removing TypeBox must preserve those own keys, not delete the regression. Core schema/value records must safely support `__proto__`, `constructor` and `prototype` without prototype-chain lookup.

**pi-ai.** Use it as an optional inference implementation, not the shared host ABI or peer dependency of core. Keep provider-specific forcing, API IDs and raw response classifiers in the inference companion. Pi may initially use the current compat API while Durable uses its host-owned `Models`; pin/test each adapter version rather than force a simultaneous ~1.3→1.4 upgrade. Shared DTOs must not expose pi-ai classes or open message unions. No provider SDK is loaded by parsing Theta.

**Filesystem/discovery.** Language path rules and graph algorithms belong in compiler/loading; directory walks, realpath and source reading are injected services. Pi package settings, slash-name collision rules, `--theta` roots and watcher registration stay Pi-facing. Provide a reusable Node repository loader, not a core that reads `process.cwd()` or `~/.pi` at import time. Preserve byte-exact extension checks, canonical declaration residence, segment-boundary containment, transitive cycles and invocation-time current-root revalidation. Discovery is not a language effect, but it still needs an explicit trust/root owner.

---

## 3. Proposed public API, identities and lifecycle

**Every API sketch below is illustrative design, not approved code or a claim of an existing library.** Names, diagnostic additions and wire versions need a spec phase.

### 3.1 Compile, load, link, run—not one constructor

```ts
// Proposal: data/algorithms; no Pi or Node types in these public contracts.
const compiler = createCompiler({ digest: nodeSha256, validator: ajvValidator });
const parsed = compiler.parse({ id: sourceId, bytes, dialect: thetaLanguageVersion });
const loaded = await compiler.load(parsed, {
  sources: sourceRepository,       // explicit read/resolve/identity/root services
  catalogs: declarationCatalogs,   // schemas/identities, not execute closures
  compatibility: "pi-current",
});

const admission = await linkProgram(loaded.program, {
  profile: piProfile,
  services: hostServices,
  policyRevision,
});
if (!admission.ok) return admission.diagnostics; // no binder/model/tool execution

const run = startExecution(admission.executable, {
  args: validatedArguments,
  parent: parentInvocation,
  conversation: conversationRef,
  signal,
  observer: metadataObserver,
});
try {
  const terminal = await run.result;
  // success(value), failed(language failure), cancelled, or infrastructure failure
} finally {
  await run.dispose(); // idempotent; cancels/joins owned pending work if necessary
}
```

Stages have different guarantees:

1. **Parse:** syntax/frontmatter/type syntax and local diagnostics. No filesystem or model call. Existing parse APIs can remain compatibility facades.
2. **Load/check:** resolve imports and statically available callees, lower schemas, perform transitive structural/cycle checks, compute requirements and source identities. A missing literal-invoke callee retains current warning/runtime-fallback behavior where specified; do not turn every call into mandatory eager linking.
3. **Link/admit:** bind logical tool/model/session requirements to a specific versioned host profile and catalog revision. Check available transports and declared adaptations. Return a separate executable binding, not a mutated parsed AST.
4. **Bind invocation arguments:** explicit typed arguments bypass inference; textual command arguments use the shared binder protocol on an allowed structured-inference channel. Entry/echo/UI is host-specific. Argument binding has an invocation identity/cancellation scope even before the body starts.
5. **Execute:** fresh lexical activations and budgets per invocation; use the immutable program plus linked services. Dynamic host facts are rechecked at dispatch.
6. **Settle/dispose:** authoritative result is separate from progress streams; join owned work, release leases/listeners and return cleanup diagnostics without masking the original language outcome.

Do not expose today's optional test-double seams as a permissive public host. In particular, omission of `runSubagentFnChild` must not silently run an isolated function on the caller's session. A test host may explicitly select an in-memory simulation profile; production linking requires the advertised isolation capability.

### 3.2 Immutable program identity without changing reload semantics by stealth

Proposed `LoadedProgram` contains:

- language version; compiler/semantic ABI; root source ID and digest;
- canonical source/declaration graph and source maps;
- checked AST or internal evaluation plan; lowered schemas and translation sidecars;
- lexical callable references, native-tool requirements, literal invocation edges;
- transitive closure digests where current contracts require them;
- requirement sites and conditional runtime obligations;
- no signal, credentials, mutable environment, host session, execute closure or watcher.

Immutability is semantic: caches belong in a compiler/runtime owner keyed by artifact identity, not hidden mutable fields accessible to hosts. Separate these identities:

```text
DeclarationId = canonical declaring source + declaration identity
ProgramId     = source/closure digests + language/compiler version
CallableId    = declaring program + callable kind + declaration/native binding identity
BindingId     = program + host profile + catalog/config revision
InvocationId  = one admission, never reused for a fresh reissue
EffectId      = invocation + activation/lane + syntax node + occurrence
```

Line numbers are diagnostic locations, **not effect identity**. Content equality must not merge different declaring files' enums. An import alias or presented tool rename must not mint a new declaration. Cross-machine source IDs require an explicit manifest-to-canonical-residence mapping; absolute paths are not silently rewritten.

There is a real tension: current `invoke` reopens/checks files and current roots at runtime; child callable hashes detect skew. A new immutable program must not simply embed every callee forever. **Recommendation:** immutable per-load artifacts, with invocation edges carrying resolution/identity expectations and a resolver that revalidates under the current root policy. Preserve the current Pi reopen/hash dispositions initially. A fully pinned whole-run source bundle is attractive for reproducibility/durability but is a **separate semantic decision**, especially when a callee changes during a run. Never continue with a new callee's bytes under an old checked signature without the specified recheck.

### 3.3 Data-first effects, asynchronous dispatch

The public seam should carry resolved intent, not AST nodes plus a live `LexicalEnvironment` that every host must understand.

```ts
// Proposal; handles remain local opaque capabilities, not JSON-serializable authority.
type EffectRequest =
  | { kind: "query"; meta: EffectMeta; plan: QueryPlan }
  | { kind: "tool"; meta: EffectMeta; target: NativeToolBinding; args: WireValue }
  | { kind: "invoke"; meta: EffectMeta; target: InvocationTarget; args: ValuePacket }
  | { kind: "session-control"; meta: EffectMeta; operation: SessionOperation };

interface EffectMeta {
  invocation: InvocationId;
  effect: EffectId;
  parentEffect?: EffectId;
  site: SourceSite;
  lane?: LaneId;
  policyRevision: string;
}
interface EffectOperation<T> {
  admission: Promise<Admission>; // admitted | rejected | admission-uncertain
  result: Promise<T>;            // actual terminal result, never mere send acknowledgement
  cancel(reason: CancelReason): Promise<void>;
  join(): Promise<SettlementReceipt>;
}
interface EffectPort {
  dispatch(request: EffectRequest, scope: InvocationScope): EffectOperation<EffectResult>;
}
```

Core evaluates arguments/interpolation and resolves lexical intent before dispatch. Driver protocols may issue lower-level requests through additional typed ports; the public host does not receive unrestricted evaluator internals. Authority-bearing references are scoped to a host generation and cannot be deserialized from model-provided JSON.

**Why this choice:** Promise callbacks alone hide admission, ownership, duplicates and pending side effects. A universal `AsyncGenerator` with one `yield`/one response makes parallel lanes and multiple in-flight tool effects awkward; making it a concurrent mailbox merely recreates an operation scheduler. A full VM/serializable continuation solves a different, much larger problem. Use explicit data requests/receipts plus ordinary async operations now; internally make small protocol state transitions testable. A future wire bridge can serialize the data subset and maintain a local handle table. It must not serialize closures, signals, auth handles or claim a journal exists because requests have IDs.

### 3.4 Session ownership, admission and restoration

```ts
// Proposal: the strength field is a constraint, not marketing metadata.
interface ConversationLease {
  conversation: ConversationRef;
  generation: string;
  strength: "host-exclusive" | "app-exclusive" | "cooperative-observed";
  enterWindow(spec: QueryWindow): Promise<QueryWindowHandle>;
  suspendToChild(spec: AttachedChildWindow): Promise<ConversationLease>;
  release(): Promise<CleanupReport>;
}
interface QueryWindowHandle {
  submit(input: TurnIntent): EffectOperation<SettledTurn>;
  snapshot(purpose: "query-finalize" | "binder"): Promise<ContextSnapshotResult>;
  close(): Promise<CleanupReport>;
}
```

Rules:

- Acquire before reading/installing mutable model/tools/thinking/policy; subscribe before sending to avoid completion-before-waiter races.
- Distinguish request acceptance, actual newly admitted turn, steering/queueing, terminal status and quiescence. Keep native IDs plus invocation/effect correlation. Unknown admission is not automatically retried.
- A local mutex serializes **our** operations only. It cannot exclude a stock TUI, another plugin or another subscriber. A cooperative lease must detect contamination and refuse unsafe replay; it cannot promise to prevent all races.
- Hold the appropriate scope across attached nested invocations. Reentrant **interpreter** child calls use a suspended-parent lease stack, not a second competing acquisition. A Theta entered as a model tool must not await a query in the loop currently waiting for that tool: use a separate worker or reject the entry/profile combination. Durable's prior deadlock probe demonstrates this exact cycle.
- Keep accepted settlement/context immutable before restoration. A foreign turn arriving during cleanup must not replace the accepted result (`tests/b0503-owned-turn-boundaries.test.ts:140–147`).
- Prefer host-local immutable request options over session mutation. Where mutation is necessary, adapter owns complete install/restore semantics. Pi keeps its one retry, diagnostic/advisory and original-outcome preservation (`tool-registration.ts:119–208`). Do not silently replace Pi's specified cross-extension overwrite behavior with compare-and-swap.
- For a new app, use revision/fencing-aware restoration and mark a contaminated lease unusable. If the host cannot distinguish its own changes from another actor's, either own the session or refuse the supposedly safe temporary window. OpenCode's permission mutation is not a harmless tools toggle.
- Claude Code commands must return before submitting a native prompt: the 2.1.303 runner rejects `$.prompt.submit` inside `command.run`. A deferred callback reached the prompt stub, but this is not proof of correlated completion, session exclusivity or headless process lifetime. Keep the invocation coordinator outside the blocking hook; ordinary waits consume the hook's own-time budget. Sidecar IPC does not itself release the hook or grant a lease.
- Session replacement/reload/fork invalidates generation-bound handles. Reconnection requires reconciliation; it is not automatic re-admission of uncertain work. In Claude Mods, treat module reload/unload and the differing session-end/start delivery rules as generation boundaries; do not assume a stopped Mod continues supervising admitted work.

### 3.5 Cancellation, join and disposal

Separate `AbortSignal` observation, request-to-cancel, host acknowledgement and **settled resource ownership**. Cancelling a waiter is not cancelling Durable work. An interrupt RPC acknowledgement is not proof the native tools stopped. A shared-session abort can kill foreign work; the adapter must have authority to target the owned operation or report the limitation.

Core retains current cancellation checkpoints and no-retroactive-rebinding rules. The operation manager closes result arbitration once; late successes become diagnostic evidence, not a second binding. `join()` accounts for owned model/tool/child work; it does not promise rollback or reversal of an already committed external effect. When a host cannot prove cessation, surface an explicit infrastructure/cleanup uncertainty and retain a supervisor handle rather than falsely claiming clean cancellation. Map that evidence into the current Pi error surface without inventing new language variants until approved.

Observers never settle executions. Disposal is idempotent, stops timers/listeners, releases leases after owned work is reconciled, and does not destroy a user-owned session. Host shutdown may impose a bounded cleanup budget; forced process termination and uncertain external completion must remain distinguishable from clean cancellation.

## 4. Redesign query and binder protocols—not just their imports

### 4.1 The current abstraction mismatch is concrete

`QueryModelDriver` exposes `nextFreePhaseTurn`, `runToolBatch` and `forcedRespondTurn` (`runtime/query-tool-loop.ts:154–178`). A direct request driver can implement that literally. Pi's `LivePromptQueryModel` cannot:

- `nextFreePhaseTurn(0)` drives the **whole native loop**, with `PromptToolLoopGovernor` enforcing tool admission (`extension/live-prompt-query-driver.ts:310–399`).
- At exhaustion it returns repeated synthetic `tool_use` rounds until the outer loop reaches its own cap (`:401–493`).
- `runToolBatch()` returns `[]`; native Pi already executed the actual batch (`:493–498`).
- A native untyped final answer arriving after the allowed tool rounds is discarded, with an informational note, to preserve Theta's boundary result (`:379–458`).
- Typed finalization is off-session, with early captured response and foreign/recovery-window rules (`:500–555`, `off-session-respond-dispatch.ts:170–294`).

This is not evidence that the Pi implementation should be casually replaced; it is evidence that the **shared interface should describe its real responsibilities**. Otherwise every host must invent fake rounds, and core logs will imply it executed effects it did not execute.

### 4.2 Two execution strategies, one semantic controller

```ts
// Proposal: explicitly different capabilities under one query policy implementation.
type FreePhaseDriver =
  | { kind: "stepped"; next(request: ModelStep): Promise<ModelStepResult>;
      executeBatch(batch: AdmittedBatch): Promise<BatchReceipt> }
  | { kind: "native-governed";
      run(plan: GovernedTurnPlan): EffectOperation<FreePhaseReceipt> };

interface FreePhaseReceipt {
  ending: "text" | "captured-response" | "budget-boundary" | "failure" | "cancelled";
  text?: string;
  candidate?: StructuredCandidate;
  rounds: readonly RoundReceipt[];
  committed: readonly EffectReceipt[];
  context: ContextSnapshotResult;
  ownership: OwnershipEvidence;
  enforcement: EnforcementReceipt;
}
```

**Stepped strategy:** core admits a request, receives the actual batch with arguments/call IDs, checks depth and policy, dispatches siblings and joins all, accounts one round, then decides whether another request is permitted. The inference adapter does not run an unbounded hidden agent loop. This is the natural new Durable-app driver using lower-level inference and authorized ToolTasks.

**Native-governed strategy:** the host retains its native loop and native tool execution. A preinstalled adapter governor enforces the agreed admission rules and produces truthful receipts. Core uses the returned ending and actual accounting directly—no synthetic tool calls. It still owns query result selection, typed validation/repair budgets and terminal mapping. If the adapter can only observe after side effects, it cannot claim pre-effect budget enforcement. If its API cannot stop or distinguish a round before further work, it cannot claim stepped-equivalent execution.

Pi initially gets a **`pi-current` governed profile** preserving its existing post-boundary discard behavior and notes. Removing those observations or stopping extra native sampling earlier is not assumed equivalent; compare request/transcript traces and seek separate approval where behavior changes. For Claude Code/Codex/OpenCode, a whole-turn API or a stream hook alone does not qualify as `native-governed`: exact round and depth gates remain unproven. In particular, observing Claude's `turn.step` or denying `tool.call` does not prove that the adapter can install an exact model-visible set, enforce every pre-effect boundary, or remain active after a hook-worker failure.

Both strategies share:

- rendered query input and empty-template short circuit;
- exact callable requirements and schema identity;
- ceiling arithmetic, result/error precedence, repair policy;
- result validation and inbound decoding;
- committed-effect accounting and nonrollback policy;
- cancellation and context-safety requirements.

Do not standardize exact host transcript rows, provider usage availability or compaction internals. Do standardize whether a receipt is complete enough for the requested semantic operation. Missing accounting is `unknown`, not zero.

### 4.3 Structured inference is a separately negotiated channel

```ts
// Proposal: validated semantics are shared; protocol provenance is retained.
interface StructuredRequest {
  purpose: "query-finalize" | "binder";
  schema: SchemaDescriptor;
  input: StructuredInput;
  model: ModelBinding;
  protocol: "named-tool" | "native-schema-final" | "singleton-schema-tool";
  contextRequirement: "exact" | "approved-projection";
  attempt: AttemptIdentity;
}
type StructuredReply =
  | { kind: "candidate"; value: unknown; provenance: CandidateProvenance }
  | { kind: "noncompliance"; evidence: NoncomplianceEvidence }
  | { kind: "refusal"; evidence: RefusalEvidence }
  | { kind: "overflow" | "transport" | "cancelled"; evidence: FailureEvidence };
```

The shared controller, not the host SDK, decides when a candidate becomes a Theta value. It applies depth checking, canonical validation, error ordering, wire-name translation and enum/schema restoration. Host “completed” is not typed success. A candidate may coexist with a late transport ending; preserve the current extraction-before-stop-classification rule for named-tool dispatch (`off-session-respond-dispatch.ts:173–190`). Do not discard that distinction by normalizing all replies to `{text,error}`.

**Protocol implementations:**

- **Named-tool protocol:** current Pi transport. Carry exact tool name, object-root wrapper where needed, schema slug, forced choice and narrow one-shot forcing-rejection degradation. Share this through `theta-inference-pi-ai` with explicit host-provided inference authority. The finalizer is off-session; only the approved query window is replayed.
- **Codex native-schema final:** `outputSchema` constrains a final message, not a named tool call. A curated fresh worker with `tools:[]` was observed. Parse and validate its output independently; retain the actual schema-final provenance. No fabricated `wrong_tool` evidence or imaginary forced call. Exact context, refusal/error precedence, hidden retries and native instructions need qualification.
- **OpenCode singleton schema tool:** `format: json_schema` adds `StructuredOutput` with `tool_choice: required`; ordinary tools remain unless removed. Prior requests showed both mixed and singleton catalogs. A private session is off the user's transcript, but still has OpenCode context/instructions; it is not automatically a stateless exact-input completion.
- **Claude Code structured-channel candidate:** a registered respond tool is not named-tool forcing, and documented `$.model.complete` / `fork` cannot call tools. Do not route the core's named-tool protocol through them and claim parity, or infer a model request's schema/tool choice from synthetic `turn.step` response chunks. Investigate the exact build-matched API first; a separate CLI/Agent SDK structured-output worker is a different transport and ownership/auth boundary. It needs qualified context isolation, terminal/error handling and a supported authentication contract before entering a profile. Keep this capability refused if no equivalent or separately approved alternative is available.
- **Validated free text:** not the default fallback. It can be proposed as a separately named weaker protocol only if the product explicitly wants it. Parsing JSON does not create forcing or no-tool guarantees.

The spec already anticipates native structured output in future revisions, but also pins QRY-15 wording, error branches and repair behavior. Therefore adopting a schema-final/singleton protocol is **not automatically an implementation-only change**. First specify which behavioral invariants are preserved and which transport-specific observations change. Pi retains its exact current transport/templates. A profile that cannot satisfy the existing typed contract refuses it until an alternative is approved.

### 4.4 Binder shares validation machinery, not a generic query loop

Binder policy should be core-owned but remain a distinct protocol:

- explicit typed arguments bypass it;
- exact envelope classification, defaults, missing/invalid/refusal arms, argument echo and failure taxonomy remain;
- the current selected-context policy is closed-set, whole-turn, newest-first, capped at **20 turns / 8000 estimated tokens**, skipped for subagent mode (`binder/session-context-walk.ts:35–172`);
- model selection and support are explicit; deterministic request construction does not promise deterministic model answers;
- budgeted attempts and actual provider requests are different counters. A forcing-degradation reissue must not silently debit an extra validation attempt; host/provider automatic retries must be observable or bounded by the approved profile;
- schema attachment transformations (root wrapper, reference inlining with recursive residual definitions, own-key repair) are transport preparation, not changes to the canonical schema used for validation/hash identity (`binder/binder-inference.ts:120–215,426–494`).

Split current `binder-run.ts` into a reusable binder controller plus Pi entry/model/context/delivery adapters. Avoid importing the entire live query driver simply to reuse a stop-reason constant (`binder-run.ts:76`). No new host should copy the 8000-token walk using Pi `AgentMessage`; it should provide a certified binder projection and token estimates over that projection.

---

## 5. Host profiles: what can actually be supported

### 5.1 Capability negotiation is multidimensional

A single `supportsTheta: true` or `supportsTools: true` flag is inadequate. A profile should describe at least:

```text
entry: native command | owned frontend | worker | external launcher
conversation: current/shared | owned persistent | isolated
admission: exclusive | cooperative with provenance checks | uncertain
query execution: stepped | governed-native | native-uncontrolled
tool exposure: per-query exact | fixed exact | deny-only | unknown
tool execution: native code-origin pipeline | named specialized RPC | model-selected only
structured inference: protocol + schema dialect + context/isolation guarantees
cancellation: owned-operation | session-wide | process-only | wait-only
isolation: lexical | conversation | process (+ placement and liveness)
session services: compact / usage / name, individually supported
observability: metadata / redacted content / native renderer / durable result receipt
auth authority: host-owned inference | explicitly configured external provider
```

Capabilities are asserted by adapters and tested against release pins; they are not security proofs. Link requirements are conservative over reachable syntax/closures, not a claim that a branch will execute. A host can accept a source subset when that subset does not need a missing capability. It must not accept an unsupported effect merely because the model is unlikely to call it.

### 5.2 Cross-host comparison

**Legend:** Shipped = current Theta/Pi behavior inspected; Offline = prior real host/runtime with canned provider; Source = pinned release source; Gate = not demonstrated for complete Theta semantics.

| Profile | Entry and ownership | Query/tools | Typed/binder | Initial disposition |
|---|---|---|---|---|
| **Pi current-session native** | Shipped commands and native turn drive; serialized Theta windows plus conservative own-turn provenance, not a universal host token | Shipped exact active-set windows and pre-tool governor; current built-in direct calls and extension bridge differ | Shipped off-session pi-ai named-tool protocol with exact Pi classifications/repair | **Reference consumer**, preserve current semantics and limitations; do not label draft native-dispatch parity as shipped |
| **Durable new app, owned conversations** | Library, no Pi command loader/TUI attachment. App owns admission; submission IDs and terminal outcomes are real | Offline exact configured sets and native ToolTask execution. Stock GenerationTask owns whole loop; custom stepped driver needed for full Theta control | Lower-level pi-ai named forcing offline verified; native singleton tool alone is not forced | **Recommended second slice**: ordinary execution first; full potential through new composition, not already complete |
| **Claude Code Mods, current conversation** | Released executable command/tool registration validates. Direct prompt submission from `command.run` is rejected; deferred dispatch reached a stub, not a real completed turn. Detached coordinator needs correlation, headless lifetime and cooperative ownership proof | Native tool-call pipeline is documented and offline dispatch/guard mechanics were exercised with stubs. Denial is not exact tool exposure. No qualified full native-loop governor; hook failure/unload can remove guards | Registered responder does not force selection; `model.complete` / `fork` are tool-less. Full binder/finalizer protocol remains gated | **Explicit first-class adapter prototype**, initially a thin Mod + Node bridge. No full prompt-mode or worker claim until capability gates pass |
| **Claude Code isolated-worker/bridge profile** | Native agents and external processes are candidate execution mechanisms, not a verified Theta child bootstrap. Spawn/completion, repeated-query history and headless ownership remain unproved | A worker may offer narrower tools, but exact request catalogs, permission propagation and deterministic code calls need tests. Node sidecar effects must not bypass native permissions | A separate structured-output CLI/SDK worker may be an approved future transport; neither native Mods forcing nor subscription reuse by the sidecar was established | **Candidate subset only after evidence**. Distinguish Claude-native worker execution from a Mod that merely launches Pi; retain typed result/cancel/join requirements |
| **Codex stock TUI plugin/hooks** | Stable hooks and Stop continuation exist; no audited executable slash registrar or exclusive interpreter ownership | No running-thread arbitrary tool-set replacement or universal native executor | Schema-final facility exists elsewhere; hook continuation is not Theta's two-phase protocol | **No full native-host claim**. Optional launcher/hook entry only under an accurately named restricted profile |
| **Codex app-server owned workers/frontend** | Correlated thread/turn IDs; app can own admissions; parallel threads and interrupt offline verified | Dynamic tools at thread creation; curated fixed empty set verified. No proven varying per-query exact set or universal native round governor | Fresh no-tool `outputSchema` worker promising; alternative protocol/context gate remains | **Worker subset candidate**; full host gate stays closed until executor/round/context obligations pass |
| **Codex same-server shared-thread sidecar** | Actual rejoin of loaded thread verified. `turn/start` can steer existing turn; ordinary approvals shared among subscribers | Same fixed/dynamic catalog limitations; no lease over TUI input; displayed thread not automatically tracked | Same schema opportunity, plus contaminated context/admission risks | **Experimental cooperative profile**, not default prompt-mode parity; custom frontend/proxy is stronger but a different product |
| **OpenCode existing-session TUI command** | Offline real TUI callback drove two turns in a pre-existing session; command arguments/headless entry not fully proved. Overlapping prompts resolved to the later user's result | Exact filtering demonstrated, but `tools` mutates persistent permission rules. Native whole-loop and general deterministic executor gaps | Real schema tool; singleton achievable; no proven stateless exact-context binder | **Native entry is real, full profile is gated**. Do not dismiss it as a launcher, or certify it from basic prompting |
| **OpenCode owned workers/frontend** | Own session IDs/admission/policy; session abort can be safely owned if no foreign work | Workers reduce restore races, not missing step/executor APIs | Private singleton-schema sessions are candidates with explicit protocol adaptation | **Worker subset candidate**. Full control likely needs supported upstream seams, a qualified bridge, or pinned internal integration |

A “subset” must be a testable predicate, not a vague disclaimer. For example, pure language programs need no model host. A program with no tool-using query and explicit arguments may need only an owned no-tool text turn with correct settlement. A typed-zero-round program additionally needs an approved structured protocol. A source with a native code-side tool call must be rejected when the profile has only model-selected tools, even if its queries work. Full tool-bearing Theta on Claude Code/Codex/OpenCode remains an open gate, not the default result of adding adapter classes. Claude Code's inclusion in the migration is a commitment to investigate and design its adapter, not a declaration that its native or worker profiles already pass.

### 5.3 Consequential release facts independently checked here

**Claude Code.** The tracked [host report](../hosts/claude-code/REPORT.md) preserves the exact 2.1.303 release pin, validator result and eight passing offline probes plus an inconclusive agent probe. The runner rejected prompt submission from a command hook before the prompt stub ran; a deferred callback dispatched after return. Those are real host scheduling checks, not proof that a provider turn completes or that a timer holds a headless process alive. The public type file was 2.1.277 and must not be treated as the 2.1.303 contract. Mods restrict imports and Node access, statically analyze `$` calls, and impose a 10-second own-execution budget excluding most host API calls. Defaults can fail open; a valid `.catch` refusal improves a guard but does not prove safety after Mod unload. Exact API/version, worker lifecycle and runtime claims need new qualification before implementation.

**Codex.** Retained generated `release/protocol-experimental-ts/v2/TurnStartParams.ts` contains `outputSchema`, but no per-turn `dynamicTools`. Its comments state that turn attribution is ignored when adding input to an active turn. Release `turn_processor.rs:661–737` calls `start_or_steer_turn`, handles both Started and Steered internally, then returns an in-progress Turn without exposing that boolean. Thus a client cannot solve admission by checking a nonexistent public `started` flag; own the input path or reconcile identity/observations and refuse uncertainty. `outgoing_message.rs:567–587` checks ownership specially for verification ceremonies but consumes ordinary callbacks by request ID. Prior two-client assertions confirm same-server sharing, not actual TUI acceptance.

`command/exec` is a useful sandboxed direct operation, and `mcpServer/tool/call` a real deterministic MCP RPC. Neither establishes arbitrary builtin dispatch through the same native turn approvals/hooks/transcript. `thread/shellCommand`'s unsandboxed lane is not a parity shortcut. A direct shell compatibility tool can be offered only as its own explicit tool/policy contract.

**OpenCode.** Release `session/prompt.ts:1052–1071` converts a nonempty `tools` map to **allow/deny permission rules** and replaces session permission state. `effect/runner.ts:115–137` returns the current run's deferred when already running. `prompt.ts:1243–1317` inserts StructuredOutput, uses required choice and records structured-output errors in a normally resolved response. Prior `probes/assertions.log` verifies all three hazards, real native read approval/denial, and the actual TUI callback. New generated `/api/session/.../wait` returned 503 in the prior probe; do not use it as a settlement contract. The root SDK, `/v2` export and `client.v2.session` routes are distinct release surfaces.

**Durable.** Release `harness/types.ts:484–496` exposes curated conversation request options without named tool choice. `harness/tool.ts:130–204` commits prepared intent before execute, and safe recovery directly reruns using stored arguments. The retained safe-effect counter has separate crash/recover executions; unsafe recovery log reports `failed` and “may have partially run.” A native ToolTask receipt with zero provider calls was observed, but it was a low-level fixture with a real assistant/tool-result entry—not proof of a transcript-free code-origin API.

### 5.4 Permission, approval, auth and sandbox ownership

- **Pi:** preserve current installed host and Theta restrictions. Current code-built stock tools are not installed-override parity; the bridge has different observables. Do not claim a new security model from the core extraction.
- **Durable app:** application supplies policy, approval UX, execution environment/sandbox and supported model credentials. Durable's validation/hooks are useful machinery, not a preconfigured consent policy. Never call a raw tool implementation to bypass ToolTask admission.
- **Claude Code:** keep native tool/model work under supported host APIs and their permission paths. A Mod's own process/filesystem privileges are not the same as model tool authorization. A Node bridge must not reproduce tool names with privileged filesystem/shell operations to evade a refusal. Mods model calls may use session credentials through the supported API; the sidecar is not thereby entitled to those credentials. A separate Agent SDK application's subscription/auth terms are an independent gate. Policy or remote rollout can disable Mods; refuse/terminate owned invocations rather than silently continue without an assumed guard. Current research did not prove an enforceable end-to-end fail-closed lifecycle.
- **Codex:** keep model-native work and approvals under Codex. App-server frontend must handle required approval RPCs without racing stock TUI subscribers. Specialized direct RPCs retain their own authority contract; no automatic widening of sandbox flags.
- **OpenCode:** native permission services remain authoritative for native calls. Plugin `fs`/shell privileges and explicit-user shell are not equivalent to permission-aware tool dispatch. An adapter must not elevate a denied tool while constructing an allowlist.
- **All hosts:** model reference resolution is exact or explicitly mapped by operator configuration. Store only nonsecret authority references in program/binding artifacts. A sidecar receives an authorized inference service or uses its own supported login—not extracted subscription tokens. Host login/catalog support in earlier reports did not prove this operator's live entitlement on each host.

A fallback using independently configured pi-ai inference is legitimate only when explicitly selected and reported as **hybrid inference**. It changes model access, context and potentially billing. Launching Pi children from another host is likewise an honest hybrid, not that host's native tool/session capability.

---

## 6. Other redesigns that belong in the proposal

### 6.1 Host-independent context snapshots, not a fake universal transcript

Define a small semantic projection with stable entry/turn references and provenance, while retaining an opaque host-native snapshot handle when exact replay is required:

```ts
// Proposal.
interface ContextSnapshot {
  conversation: ConversationRef;
  generation: string;
  revision: string;
  purpose: "binder" | "query-finalize" | "inspection";
  completeness: "exact" | "projected" | "truncated";
  ownedTurns: readonly TurnRef[];
  entries: readonly ContextEntry[]; // closed roles/content, no host open union
  nativeReplay?: HostSnapshotRef;  // local, same adapter/generation only
  transformations: readonly ContextTransform[];
}
type ContextSnapshotResult =
  | { ok: true; snapshot: ContextSnapshot }
  | { ok: false; reason: "foreign-input" | "relocated" | "omitted" | "unavailable" };
```

The neutral projection supports binder rendering, text extraction and tests. It should distinguish text/tool-result/custom contributions, attachment references and omitted content without flattening everything to a string. It must not standardize hidden reasoning, provider-specific tool messages or compaction algorithms. Explicitly mark lossy/truncated projections; never infer current model context from full UI history.

For current Pi, exact named-response replay can retain Pi-native messages inside the adapter; the core receives a safe snapshot reference and proof of the accepted window, not live Pi messages. Foreign input, unsupported context edits, compaction relocation and unhealed recovery omissions retain their current refusal rules. `OwnedTurnAttempt`'s raw object-reference/text correlation (`extension/owned-turn.ts:1–120`) stays Pi-specific. Hosts with actual message/turn IDs should use them, without mistaking correlation for exclusivity.

A snapshot does not authorize sending the context to a different provider. Cross-provider export requires an explicit disclosure/authority decision. Binder context and query-finalization context have different selection policies; do not reuse one generic “last N messages” helper for both.

### 6.2 Lexical callable identity versus native tool identity

Use a resolved callable sum type, not the public discriminant `pi-tool`:

```ts
// Proposal.
type CallableRef =
  | { kind: "function"; declaration: DeclarationId }
  | { kind: "isolated-function"; declaration: DeclarationId; isolation: IsolationContract }
  | { kind: "theta"; target: ProgramReference; presentedName: string }
  | { kind: "native-tool"; hostTool: HostToolId; presentedName: string;
      schemaDigest: string; catalogRevision: string }
  | { kind: "session-service"; service: SessionServiceId };
```

Name lookup/shadowing and argument evaluation are language responsibilities. Wire/tool naming is a host binding. A renamed `.theta` callable must retain its source identity; a native tool alias must not accidentally invoke a same-named Theta function. The installed native implementation/schema may change; define snapshot or dispatch-time revalidation explicitly. An old schema paired with a different implementation is not safe linking.

Do not change current Pi built-in-first resolution as part of introducing this type. `callable-pi-tool-resolver.ts:35–56,132–195` constructs stock built-ins, invokes them without an update callback and refuses fabricated nested execution. That behavior is intentional current code. Draft RFC 0016 requests effective installed implementation/hook parity through a supported transcript-free root dispatch capability; it is not evidence that one already exists.

### 6.3 Tool results and observability must be separate channels

A native-tool adapter should return a structured **host receipt** with final content, outcome, authorized/redacted provenance, optional details and usage—not directly choose a Theta value. The core's language adapter preserves current code-tool `Result<string, QueryError>` text filter/join semantics and failure mapping. Rich structured host output is not automatically a new language return type. Model-requested tool failures feed back to the model; they are not suddenly raised as code-side `CodeToolError` at the enclosing query.

Track at least:

```text
requested arguments → host-authorized/effective arguments → execution receipt
                    ↘ metadata observer
                     ↘ opt-in redacted content observer
final receipt → language-specific conversion → exactly one bound result
```

The host owns validation/hooks/approval ordering and result redaction; core owns Theta argument/schema/depth obligations. Neither observer can execute the tool, change a result, authorize a request or create a conversation turn. Partial updates are not partial Theta values.

**Three distinct output channels:**

1. **Semantic/control:** results, required diagnostics, failure provenance, cancellation and child terminal envelopes. Cannot be silently dropped.
2. **Metadata telemetry:** source sites, spans, lane progress, counts, names under current disclosure policy. Bounded/coalesced; dropped updates visible.
3. **Content-bearing inspection:** arguments, partial results, renderer details, with independent permission/redaction/retention settings. Optional host capability.

The existing execution-status bus explicitly excludes content-bearing class-3 data. Do not send tool arguments over it because the core now has them. `theta_print` intentionally emits conversation content; progress does not. Pi run cards and custom messages remain adapter/UI behavior, not the universal representation of a tool call.

Draft RFC 0017 requests detached native-renderer observability **without even a non-model conversation entry per call**. This is a good future adapter capability, not an extraction prerequisite or something satisfied by hiding/deleting fabricated transcript rows. Its observer-failure isolation is desirable in new APIs; retain the current internal `Trace` defect contract during migration, wrapping it at composition rather than silently changing exception behavior.

### 6.4 Invoke, isolated functions and parallel placement

Share invocation semantics and typed result validation, not an executable/argv struct as the universal child API.

```ts
// Proposal.
interface WorkerIntent {
  invocation: InvocationId;
  parent: InvocationId;
  entry: { program: ProgramReference; function?: DeclarationId };
  arguments: ValuePacket;
  sourceIdentity: SourceManifest;
  depth: number;
  contextPolicy: IsolationContract;
  environment: EnvironmentIntent; // cwd/roots/model/tool requirements, not credential blob
  placement: PlacementPreference;
}
interface WorkerSupervisor {
  launch(intent: WorkerIntent, scope: InvocationScope): EffectOperation<WorkerTerminal>;
}
```

Separate three decisions:

- **Execution semantics:** ordinary function versus attached Theta invocation versus isolated invocation; parameter/default/return/error/depth handling belongs in core.
- **Isolation substrate:** distinct interpreter activation, conversation, process, execution environment and ambient-instruction policy. These are not interchangeable levels of “subagent.”
- **Placement:** pipe, visible pane, external launcher or remote transport. Visibility is not isolation; transport is not authority.

Pi's current process bootstrap, `PI_THETA_*` scrubbing/parent-PID checks, extension pin, argv dialect, root regime, params files, nonce result channel and parent watchdog stay in the Pi/Node transport layer. `PI_SUBAGENT_CHILD` re-kick opt-out is specific inter-extension coordination (`subagent-launcher.ts:299–379`), not a core language variable. Full inherited environment is a current Pi launch mechanism, **not** a cross-host credential-sharing convention.

The reusable worker contract needs source/closure identity checks, typed terminal outcome, origin (`callee-returned` versus infrastructure-minted), `fn_tail` handling, enum carriage, no-envelope failure, liveness, downward abort and terminal arbitration. Isolated functions receive their specified arguments and declaring/module environment, not a serialized capture of arbitrary caller locals; a new worker interface must preserve that no-lexical-capture boundary. EOF or final assistant prose is not a successful child value. Preserve Pi envelope v1 and sidecars through a compatibility codec; a new host-neutral transport envelope should be separately versioned and negotiated.

Do not silently replace all current Pi subprocesses with Durable conversations or Claude Code/Codex/OpenCode native agents. Conversation separation does not give OS crash/CPU isolation, equivalent ambient instructions or identical cwd behavior. Conversely, remote placement need not share the parent's filesystem: it must receive or resolve an approved source manifest and verify identity. No process handles/auth closures are marshalled.

For `par for`, core owns one iterand evaluation, width/clamping, per-index Results, fresh lane scope, immutable per-chain depth, outer-mutation refusal, deterministic diagnostic drain and joined cancellation (`par-for-executor.ts:235–373`). A worker pool returns by **input index**, not completion order. No lane may concurrently lease the caller's shared prompt session; route it through the specified isolated path or reject. Native auto-delivery of worker answers to a parent conversation must be disabled or explicitly accounted for, not allowed to become foreign user input.

There is a specification reconciliation gate here: `invocation.md` contains a conceptual callee-mode attach matrix alongside later process-routing rules; current `extension/invoke-machinery.ts:372–409` attaches only prompt→prompt and spawns for other cells. Preserve the **actual supported Pi routing and its regression tests** first. Do not derive a new cross-host attach policy solely from the earlier conceptual table. Any simplification to “callee mode always decides everything” needs an explicit spec decision.

### 6.5 Structured values, errors and provenance codecs

Use a versioned internal value packet for host/process boundaries, distinct from JSON sent to models. It must preserve or explicitly reject:

- enum declaring identity, schema branding and nested Result tags;
- null versus absent final value, ordinary `{ok:...}` objects versus genuine Results;
- `fn_tail` versus a propagated error; callee-origin versus boundary-minted failures;
- negative zero and current nonfinite/depth refusal rules at child boundaries;
- schema/theta-side versus wire-side names;
- source locations and invocation chain provenance.

An internal packet can use tagged nodes/sidecars, but do not expose its tags in model schemas or accept a model object as a trusted packet. Decode at a trusted protocol boundary with bounded depth/size and schema/version checks. In-process values should be opaque to host consumers or accessed through core codec functions; duplicate package instances with different private symbols cannot be assumed to recognize each other's brands.

Keep language failure (`Result.Err`), cancellation, interpreter panic, host transport error, admission uncertainty and cleanup failure separate internally. Translate into today's Pi public error union/diagnostic codes at the compatibility edge. Do not make every failure a thrown JS Error or every provider refusal an empty string. Adding new author-visible error variants is a language/spec change, not an internal refactor.

## 7. Ordinary execution versus durability

### 7.1 Recommendation: effect seam now; persistent execution as a separate feature

**Do not make a persistent interpreter VM the prerequisite for theta-core. Do not label the ordinary async interpreter replay-safe.** Design explicit effect IDs/receipts, versioned values, immutable source identity and small protocol states now because they also improve ordinary testing and host isolation. Keep persistence optional and absent by default.

The first Durable adapter should offer **durable admission/observation of an ordinary, interruption-sensitive Theta invocation**, if useful, with an honest interrupted/uncertain outcome after a process dies. It must supervise or abandon persistent children according to explicit policy; it must not rerun `executeBody()` automatically because a parent task restarted. A saved job receipt is independently useful without pretending to be a continuation.

### 7.2 Four different recovery contracts

| Contract | What resumes | What does not follow |
|---|---|---|
| **Conversation resume** | Host history, model/tool tasks or a persistent thread | Theta PC, locals, budgets and joins |
| **Whole-invocation reissue** | A fresh invocation reads author-owned durable state and runs from the beginning | Same invocation identity, preserved internal progress, no repeated effects |
| **Deterministic replay** | Pinned program reruns; journaled results/delivery order suppress completed logical effects and detect divergence | JS stack serialization or automatic exactly-once unfinished external work |
| **Continuation resume** | Persisted frames/PC/environment/protocol/lane state advances from a checkpoint | Atomicity with arbitrary external tools or compatibility across code changes |

Current `ProductionCheckpoint.before()` yields a macrotask for loop iterations and a microtask elsewhere (`seams/production-checkpoint.ts:20–38`). It is a **cancellation checkpoint**, not a persistent checkpoint, rollback point or safe effect-commit boundary. RFC 0013 is a draft restart-by-reissue proposal, not implemented interpreter recovery.

### 7.3 What the Durable evidence requires us to say

The released scheduler re-enters a stored phase from its beginning after restart. Its tasks persist checkpoint data, not host JS continuations. Current Theta has async block/function stacks, lexical Maps, in-memory `par for` result arrays and worker indices. Task-per-effect is insufficient unless the parent knows which effect/continuation to attach to.

The prior actual SIGKILL/reopen evidence is unusually useful:

- A stored `{local:41}` checkpoint survived and a rerun phase returned 42; the phase itself executed again.
- A `replay:"safe"` tool incremented an external counter before dying and incremented it again on recovery.
- The unsafe equivalent executed once but recovered as **failed/interrupted**, not “definitely did not run” or “known success.”
- A completed keyed nested child was reused while its parent reran; changed arguments at the same key caused divergence failure.
- Internal commit rollback did not roll back a counter outside the transaction.
- Generation recovery retained the same submission ID but reissued a provider request, with the old partial converted to an aborted assistant. Billing/remote work can repeat.
- Commit-marker process-death probes showed internal all-or-none recovery; they did not certify power-loss durability, all storage engines or simultaneous owners.

Release `harness/tool.ts:180–204` reruns safe execution with stored final arguments and does **not** rerun the initial `beforeTool` admission hook. A newly revoked policy implemented only in that hook is therefore not automatically enforced on replay. Registry code is not stored/content-pinned by Durable; task name/version alone can accept changed implementation. Submission dedup is conversation/request-ID scoped and can return an old same-type payload despite changed content. Bind IDs to payload hashes at the Theta boundary. One process must own a store; deployment needs ownership/fencing outside the library.

### 7.4 Requirements for any future durable Theta design

A separately reviewed durable-state ABI would need at least:

1. Program/source/import/callable identities, language/compiler versions and validated policy/model/tool binding revisions.
2. Activation/loop/function continuation or a complete deterministic replay history, including argument-evaluation position and source residence.
3. Value codec preserving brands, enums, Result provenance, numeric behavior and identity.
4. Query/binder phase, accepted snapshot/candidate, remaining budgets, retry/degradation counters and error precedence.
5. Stable effect IDs based on syntax/activation/lane/occurrence plus request digests—not incidental Promise completion or global tool-call position.
6. Lane admissions/results, deterministic diagnostic order, joins and cancellation intent/finality.
7. All nondeterministic inputs: source reads/reloads, host context changes, tool/model results, clock/IDs where observable, result delivery order and external configuration.
8. Atomic parent-state/child-intent/result-delivery commits where supported; reconciliation for unfinished effects.
9. Replay-time policy decision: continuing an old authorization, requesting renewed consent, or refusing after revocation/expiry. Never assume code/policy pinning grants perpetual authorization.
10. Recovery privacy/retention, migrations, crash-loop handling, idempotency and operator UI for uncertain external work.

Exactly-once arbitrary external effects remain impossible to promise from an internal journal alone. Use target-supported idempotency keys, transactions/outbox where the target actually participates, or explicit reconciliation. Idempotent/read-only hints are not verified safety proofs. A supposedly safe effect can duplicate if its author mislabeled it, as the counter demonstrated. A newly reissued invocation can repeat even an unsafe effect; “unsafe” means no automatic replay of that interrupted task, not a global dedup guarantee.

### 7.5 Which durable architecture to investigate later

| Option | Benefit | Cost / failure mode | Recommendation |
|---|---|---|---|
| Wrap async interpreter in one safe task | Small apparent change | Reexecutes unknown effects and loses continuation state | **Reject** |
| Ordinary invocation in unsafe/interrupted task | Durable admission/status; explicit interruption | Loses internal progress; owned child cleanup still required | **Acceptable first Durable profile** |
| Deterministic interpreter replay journal | Reuses more evaluator; aligns with explicit effects | Must capture every input/delivery order and detect divergence; unfinished effects remain uncertain | **First later falsification experiment**, not a current promise |
| Explicit continuation/bytecode VM | Clear serializable state and task transitions | Largest evaluator rewrite and durable ABI/migration burden | Reconsider if replay is insufficient or product requires precise persistent suspension |
| Run Theta inside Durable codemode QuickJS | Existing deterministic code journal precedent | Current Node interpreter/import graph is not its VM; different embedding/value/runtime constraints | Contextual precedent only, not a shortcut |

Durable codemode really does source-backed seeded/virtual-clock journal replay with code/VM checks; it was not crash-tested in the prior research and is not host-JS heap persistence. If durability later becomes central, prototype replay of a tiny Theta program with nested calls and two parallel lanes, kill between effect completion and result commit, change code/policy on reopen, and require refusal or reconciliation. That experiment should determine whether a full continuation IR is justified.

**Versioning distinction:** Theta source compatibility, core TypeScript API compatibility, adapter wire compatibility and durable-state ABI compatibility are four separate promises. A semver-compatible source/runtime update is not automatically safe to resume old persisted frames or replay a journal. Initial core releases should explicitly make **no durable-state ABI promise**.

---

## 8. Source compatibility and specification boundaries

### 8.1 Portable source versus portable deployment

Pure computation, schemas, functions, most imports and Result/control-flow behavior can remain identical. Effectful portability depends on declarations and the selected profile:

| Source/deployment element | Shared meaning | Host-specific binding or gate |
|---|---|---|
| Types, `let`, control flow, ordinary fn, schema/wire renames | Same language | No host remapping |
| `tools:` lexical allowlist and aliases | Reachability and call typing | Native name/schema/result/implementation identity; model-visible set support |
| `model`, `bind_model`, thinking | Authored exact preference/requirement | Catalog, API, effort mapping and supported authentication; fail rather than guess |
| `mode: prompt` | Requires the profile's specified attached conversation behavior | Current-session admission, visibility and nested-invoke routing must be supported |
| Subagent/isolated fn | Isolated execution/value-return obligation | Conversation/process/ambient instruction/placement guarantee; no silent in-process fallback |
| Imports/invoke paths | Declaring residence, cycles, roots and validation | Explicit source repository/realpath roots and runtime rechecks |
| `cwd`, system/context declarations | Explicit authored environment intent | Effective execution environment; cannot weaken sandbox or suppress managed instructions implicitly |
| Session tools | Declared runtime operation with typed results/errors | Compaction/usage/name individually supported; unknown values not fabricated |
| Command/binder UX | Shared binder/default/validation policy | Slash syntax, entry registration, command argument acquisition, echo/display |

Tool compatibility mappings must name **both** schema and result adaptation and permission path. A Pi `read({path})` mapping to a host `Read({file_path})` is not a case-fold operation. Even equal names can have different result formatting, limits and error behavior. Prefer separate explicitly installed compatibility catalogs with versioned contracts over a core table of heuristic aliases. Preserve current rendered-text tool results; do not parse bash trailers or normalize placeholders to simulate raw stdout (`tests/b0520-rendered-bash-output.test.ts`).

### 8.2 Configuration recommendation

Initially keep authored Theta frontmatter unchanged and move **deployment selection** into an external host-owned binding manifest/configuration: profile, source roots, model bindings, tool compatibility catalogs, inference authority, worker placement and optional UI. Core takes an already resolved configuration record with provenance; it does not discover settings itself.

Do not add an unrestricted `hostOptions` bag to every AST node or silently reinterpret unknown frontmatter. A future namespaced host configuration or portable model/tool alias declaration needs schema/versioning and diagnostics. For example, an operator can explicitly bind a logical deployment model slot to an available host model, but an existing literal `openai/gpt-6.1-sol` must not be rewritten to a different provider merely because an adapter cannot honor it.

Profile negotiation should report the source site, requested guarantee, observed capability, host/release/profile, and valid options. Illustrative diagnostic:

```text
Cannot link code-side tool `read` at audit.theta:18:9.
Profile opencode-1.19.3/owned-worker exposes native read to model turns,
but has no qualified deterministic native-tool dispatch capability.
Use an explicitly configured compatibility tool, select another profile,
or obtain a supported executor adapter. No tool or model call was made.
```

This wording/code is proposed. The current Pi diagnostic registry is closed: allocate any new host-capability codes through the spec process, or use a separate library-link diagnostic namespace until integrated. Runtime capability loss gets an explicit refusal before further effects and preserves already committed work. It is not permission to silently fall back.

### 8.3 Implementation-only changes versus approved behavior changes

**Can be implementation-only, with equivalence tests:** import direction fixes; package exports; AST/helper splits; separating diagnostic construction/delivery; opaque program/host binding internals; provider-free core DTOs behind Pi translations; query receipt refactor preserving all current Pi outputs; new optional metadata observer; Node companion services.

**Require a specification/product decision:**

- Certifying non-Node execution, multiple concurrently active host sessions, or stronger admission behavior beyond current Pi guarantees.
- Replacing named-tool templates/branches with native-schema final output, altering binder context/retries or permitting weaker text fallback.
- Changing current Pi native-tool implementation selection, hooks, code-origin transcript effects or rich return types (RFCs 0016/0017).
- Substituting in-process conversations for specified child processes, changing cross-mode attach routing, cwd semantics, ambient instruction isolation or persistence/log policy.
- Pinning all callee bytes for a whole invocation instead of current reopen/recheck behavior; changing source identity across machines.
- New frontmatter/tool/model portability syntax, new language error variants or reduced hard ceilings.
- Automatic reissue, deterministic replay, persistent checkpoints or durable-state migration.

There is **no necessary grammar change for the initial extraction**. There is necessary specification work to describe new hosts honestly, because the current spec mixes language and Pi integration obligations. Split normative ownership into a language/effect contract and versioned host profiles without retroactively weakening Pi.

### 8.4 RFC status is not an implementation inventory

RFCs 0013, 0016 and 0017 remain proposals; current source confirms that their requested recovery/dispatch/observability contracts are not already provided. Conversely, RFC 0006 remains labeled draft in the index while its child-envelope architecture is clearly implemented and normatively described in PIC-58/59. RFC 0015's header says “draft/no code” while current source carries run-card/trace machinery. Therefore classify behavior from **current normative topic + code + tests**, not an RFC status line or stale README. This report preserves existing behavior even when its historical RFC bookkeeping is stale; it does not authorize cleanup of those documents.

---

## 9. Concrete extraction/refactor map

Module paths below are relative to `/home/thomasa/Projects/pi-theta/src/`; `docs/` and `tests/` paths are repository-relative. “Reuse unchanged” means preserve algorithms/behavior; import path changes may still be necessary. No listed move has been performed.

| Current files / anchors | Disposition | Proposed owner and required work |
|---|---|---|
| `lexer/lexer.ts`, `lexer/encoding.ts`, `parser/theta-ast.ts`, diagnostic shapes | **Reuse mostly unchanged** | core/language; remove upward note-channel types, preserve source ranges/UTF-8/newline behavior |
| `parser/theta-document.ts:26–103,149`, `type-layer-checks.ts`, `local-binders.ts`, `lexical-call-sites.ts` | **Internal refactor** | compiler; separate syntax/local checks from graph/host declaration inputs; factor AST helpers to prevent evaluator→parser barrels |
| `parser/schema-lowering.ts:28,103–115`, schema subset and translation maps | **Split** | pure lowering/canonical form in language; explicit digest service for identity; byte-identical hashes/slugs |
| `runtime/value.ts`, `pure-expression-evaluator.ts`, `lexical-environment.ts` | **Reuse semantics; narrow interfaces** | language/kernel; declaration identity and per-run activations, no live host objects in loaded artifacts |
| `runtime/statement-executor.ts`, `statement-executor-types.ts:68–257`, `par-for-executor.ts` | **Internal refactor, not rewrite** | kernel; data-first resolved effects, explicit lane hooks below extension layer, preserve current flow/failure/cancel rules |
| `runtime/effectful-statement-host.ts:96–244` | **Replace public boundary incrementally** | internal compatibility facade over core protocols/ports; stop exposing AST+environment as host API |
| `runtime/query-tool-loop.ts`, `query-respond-repair.ts`, `typed-query-validation.ts` | **Shared protocol refactor** | core query controller; separate native-governed receipt path from true stepped rounds; retain all ceiling/repair outcomes |
| `extension/live-prompt-query-driver.ts`, `owned-turn.ts`, `turn-settlement.ts`, `host-recovery-omission.ts`, `prompt-tool-loop-governor.ts` | **Behind Pi adapter** | preserve native lifecycle, provenance, recovery/refusal and governor; no cloned versions in every host |
| `runtime/tool-registration.ts`, `invoke-prompt-suspend.ts`, `prompt-transport-mapping.ts` | **Mostly Pi profile despite runtime directory** | active-set/model/thinking restoration and Pi failure classification remain Pi-owned; extract only genuinely generic receipt types |
| `binder/binder-envelope.ts`, `defaulting.ts`, retry policy, rendering/validation logic | **Reuse/split** | core binder protocol; preserve defaulting, refusal, echo and budgets |
| `binder/binder-inference.ts:46–56,426–549`, `forced-tool-choice.ts`, provider mapping | **Split protocol from transport** | core canonical envelope/extraction policy; pi-ai companion owns concrete request options/TypeBox and native reply translation |
| `extension/binder-run.ts:13–78,698–789`, `off-session-respond-dispatch.ts` | **Behind adapter plus shared inference module** | Pi context/auth/delivery stay Pi; named response protocol implementation reusable through explicit inference authority |
| `extension/import-resolution-kit.ts:61–149,182–230`, `pass-parse-cache.ts`, `pass-verdict-memo.ts`, import/invoke checks | **Promote with refactor** | compiler/load service; filesystem supplied by repository port; keep branch-dependent cache validity and declaring-scope logic |
| `discovery/*`, `extension/hot-reload.ts`, `reload-wiring.ts` | **Split policy/mechanics** | reusable Node watch/read utilities; Pi package/settings/collision/re-registration policy stays Pi; publish new immutable program generations |
| `extension/production-composition.ts`, `production-theta-producer.ts`, `production-producer-deps.ts` | **Dismantle responsibilities gradually** | Pi composition becomes first consumer of compiler/linker/execution plus Pi services; do not move the giant constructor into core |
| `extension/callable-pi-tool-resolver.ts:35–195`, `production-host-loop-dispatch.ts` | **Pi-only compatibility** | preserve stock built-in path and synthetic-provider bridge; future installed-dispatch capability separately approved |
| `runtime/tool-call-execute.ts`, `tool-call.ts` | **Split** | core argument/result/error semantics; Pi-shaped native result translation at adapter; separate parse re-exports from runtime defects |
| `runtime/invoke-cancellation.ts`, `invoke-depth-cycle.ts`, `invoke-provenance.ts`, `extension/invoke-return-validation.ts` | **Share with source/storage seams** | core invocation semantics, value validation and provenance; host-native delivery/persistence outside |
| `runtime/subagent-envelope.ts`, `enum-tag-carriage.ts`, `subagent-wire-form.ts` | **Reuse codec rules, version boundaries** | core codec plus explicit Pi envelope-v1 compatibility facade; not plain `JSON.stringify` replacement |
| `runtime/subagent-argv.ts`, `subagent-launcher.ts`, `subagent-root-regime.ts`; `extension/production-subagent-host.ts`, `production-result-channel.ts` | **Behind Pi/Node transport** | generic process/channel cleanup in Node; Pi dialect/env/bootstrap/root/watchdog and extension interoperability in Pi adapter |
| `runtime/subagent-placement.ts:70–170` | **Split public concepts** | generic placement backend mechanics in Node companion; semantic WorkerIntent above it; keep existing published placement ABI compatible |
| `runtime/runtime-event-channel.ts:16,307–331`, `extension/system-note-channel.ts` | **Split construction/delivery** | core event arithmetic and diagnostics; Pi note delivery/stale-context handling outside |
| `extension/execution-status/*`, run cards, renderers, print/progress tools | **Split metadata contract from UI** | minimal core observer/lane/spans; host-specific UI and current disclosure/print behavior in Pi adapter |
| `seams/ajv-schema-validator.ts:342–427`, `runtime-root.ts:28–73`, Node/Pi seam implementations | **Companions / replace aggregate facade** | certified validator companion, service-specific injection; root remains compatibility facade until consumers migrate |
| `runtime/terminal-outcomes.ts:45–100` | **Intentionally retire needless authority from new API** | preserve no-rollback tests but do not give new core a `CommittedConversationMutator` whose only compliant use is never calling it; adapters expose receipts/append operations only as needed |
| Draft native dispatch/renderer integration; persistent evaluator state; non-Node validator | **Unresolved / not extracted** | explicit capability and product gates, not placeholder success implementations |

A particularly useful early cleanup is importing the existing inert note factory directly from diagnostics. A particularly **insufficient** cleanup is moving only the union splitter into `annotation-compat`: that module imports `PRIMITIVE_NAMES` back from the broad type layer. Use the measured graph rather than a directory aesthetic.

### 9.1 Minimal vertical slice and dependency order

The smallest meaningful architecture proof is more than the existing pure arithmetic fixture:

1. Load a root plus a `.thetalib` with an alias and enum/schema identity; compile with existing canonical validation.
2. Run ordinary control flow through the unchanged evaluator and a scripted effect port.
3. Execute two sequential queries where the second depends on the first; include a typed zero-round response and one malformed response/repair.
4. Execute one deterministic code-side fixture tool with exact supplied args, a denial and cancellation—no model choosing the tool.
5. Invoke one child fixture returning a branded/typed value and run two lanes with reversed completion order; verify indexed Results, diagnostics and joined cleanup.
6. Route the same slice through **Pi compatibility services**, checking unchanged result/notes/transcript/tool/model restoration.

Recommended dependency order: value/diagnostic/AST leaves → schema/hash/validation contracts → source repository and checked immutable artifacts → execution/effect DTO seam → query/binder controllers → Pi lifecycle/tool/invoke adapters → second host. Tests may use synchronous/small in-memory services, but production linking never falls back to them silently.

The standalone compile/check slice is independently useful even if Claude Code/Codex/OpenCode capability gates remain closed. The stepped driver is independently useful for a Durable app even if current-session Claude Code and OpenCode integrations remain experimental. A Claude thin-bridge prototype should reuse those same exports; it must not become a separate semantic runtime just because the Mod cannot import Node modules.

---

## 10. Validation architecture

### 10.1 Test layers and concrete observables

| Layer | Required witnesses | Primary observables |
|---|---|---|
| **Language/schema/value** | Parse/type corpus; alias/re-export identity; schema lowering/hash; brands/Results; own-key edge cases; wire renames; depth and numeric behavior | Diagnostics, canonical bytes, typed values/brands, codec round trips |
| **Kernel/protocol** | Argument order, flow/terminal consumption, no rollback, query budgets/repair, binder attempts/defaults, cancellation, parallel joins | Effect trace, exact request counts/order, terminal value/error/provenance, committed receipts |
| **Provider-free scripted host** | Admission/settlement races, events before acknowledgement, foreign turn, duplicate delivery, restore failure, capability loss | Correlated IDs, absence of forbidden effects, lease state, accepted snapshots, joined ownership |
| **Shared host conformance** | Each declared capability and each refusal/subset boundary | Adapter-native request/tool/permission/history evidence, not a generic success boolean |
| **Real host + canned provider** | Actual native filtering/approval/governor/reentry/exit behavior under pinned binaries | Wire request tool catalogs, native terminal records, denial before side effects, child liveness |
| **Small live integration, later authorized** | Real provider/auth/schema/tool/overflow/refusal/cancel behavior | Actual model/provider terminal status and task-framed discriminators; no credential extraction |
| **Optional durability** | Kill/admission/effect/commit/return/join windows; code/policy change; replay divergence | External counters plus internal receipts, terminal uncertainty, no unapproved reissue |

Keep evidence categories separate in CI/reports. A fake provider that returns an invalid strict-schema response proves local validation/refusal; it says nothing about real provider schema enforcement. A type declaration for an endpoint does not prove it works; OpenCode wait is the counterexample. A tool denied after its effect is not a pre-effect denial.

### 10.2 Existing Pi regression protection

Retain the current suite and use existing tests as anchors, without rewriting them to agree with the new API prematurely:

- `tests/b0503-owned-turn-boundaries.test.ts`, `b0503-owned-turn-settlement.test.ts`, `live/b0503-foreign-turn-live.test.ts`: foreign/duplicate text, projected omissions, accepted own snapshot, typed replay refusal, cancellation priority.
- `tests/b0372-active-set-restore-protocol.test.ts`: restore retry/advisory and original outcome preservation.
- `tests/b0415-governor-max-rounds-final-boundary.test.ts`, `b0483-host-recovery-ride.test.ts`, `b0501-no-abort-owned-relocation.test.ts`: native-loop boundary/recovery facts that a new receipt API must preserve, not abstract away.
- `tests/query-tool-loop-noncompliance.test.ts`, `typed-query-schema-integration.test.ts`, `binder-forced-tool-dispatch.test.ts`, `binder-call-cancellation.test.ts`, `inbound-boundary-binder-args.test.ts`: structured protocols and conversion.
- `tests/proto-named-schema-validator-enforcement.test.ts`, `proto-named-binder-write-sites.test.ts`, `result-value-privacy.test.ts`, `runtime-value-model.test.ts`, `schema-lowering-hash.test.ts`: value/schema/import extraction safety.
- `tests/b0303-imported-fn-body-declaring-scope.test.ts`, `b0504-thetalib-invoke-resolves-lib-relative.test.ts`, `b0506-lib-invoke-schema-production-composition.test.ts`: module residence and load/runtime validation boundaries.
- `tests/tool-calls-parallel-batch.test.ts`, `cancellation-core.test.ts`, `checkpoint-granularity.test.ts`, `invoke-cancellation-facets.test.ts`, `no-rollback.test.ts`: ordering, checkpoint/finality and batch behavior.
- `tests/subagent-child-hash-verify.test.ts`, `subagent-child-hash-refusal-e2e.test.ts`, `subagent-fn-child-launch.test.ts`, `subagent-envelope-nonfinite-ok-refusal.test.ts`, `subagent-parent-watchdog-real-process.test.ts`: process identity, values and liveness.
- `tests/b0520-rendered-bash-output.test.ts` and its real-host acceptance counterpart: preserve text adaptation rather than replacing it with imagined raw output.

These are inspected/discovered test anchors, **not a claim that this research ran them or that they are all currently green**. Before implementation, capture an authorized baseline once and preserve complete logs. Existing known-red tests and concurrent work need independent triage, not attribution to extraction.

### 10.3 Shared conformance contract

Provide a factory-based adapter test kit. A host declares a profile and supplies fixture operations/evidence readers. The test kit then checks required capabilities **and negative gates**:

- Exact model-visible set: capture request schemas, including MCP/plugin additions. Denial alone cannot pass.
- Round budget: one parallel batch counts once, over-budget work has no tool side effect, forced response is exempt, zero-round typed work issues no free request.
- Native tool path: exact authored args, implementation identity, validation/hook transforms, ask/deny, result redaction, partial updates and cancellation. Separate current Pi compatibility from future installed-parity tests.
- Session ownership: two queries, foreign user before/after admission, same text, completion-before-registration, reconnect with unknown submit, session replacement, nested lease restoration and reentry from a model tool.
- Structured results: root scalar/array/union/ref wrappers, malformed/missing/wrong tool, refusal, candidate plus late error, depth-before-validation, enum/wire decoding, repair reset and transport/degradation counts.
- Claude Mod lifecycle: prove direct-hook submission rejection and deferred admission separately; correlate two actual native turns; distinguish a timer dispatch from a headless-liveness guarantee; check abandoned hooks, Mod reload/unload/worker failure, guard `.catch` failure and permission refusal. Verify build-matched contracts and actual worker settlement rather than stubbing away the missing capability.
- Isolation: two concurrent workers with distinct histories/IDs/cwd/tool catalogs; no auto-injected parent answer; no shared budget; child terminal envelope before/after process exit and missing/duplicate/skew envelopes.
- Cancellation: already aborted, during binder/model/tool/batch, child-only versus parent cancellation, wait-only cancellation, pure loop event-loop fairness, terminal value already bound and noncooperative effect cleanup uncertainty.

Do not require a host to fake unsupported features to run the suite. A subset profile passes by **refusing a program requiring them before effects**; the report must list those refusals. The advertised full profile cannot pass by skipping those cells. Every guard should have a rejecting control proving the test can fail for the intended reason.

### 10.4 Property, golden and differential testing

- Generate bounded expressions/control structures and compare old/new evaluators with the same scripted effects; compare observable values/brands/errors, not internal object layout.
- Metamorphic tests: import alias/re-export preserves declaration identity; key order canonicalizes identically; different declaring files do not collapse; changing irrelevant observer/UI availability does not change semantics.
- Randomized scheduler tests: permute lane completion/event ordering while preserving per-lane causality; results/diagnostic order remain deterministic and effect identity does not depend on completion order.
- Golden protocol traces: exact binder/responder attachment shapes, depth issues, degradation/retry counts and Pi notes; normalize only incidental IDs/timestamps, not semantic ordering or source identity.
- Codec fuzzing: forged Result-shaped objects, malicious sidecars, duplicate keys/unsupported nodes, deep/nonnumeric values, schema version mismatch, ordinary `__proto__` fields and negative zero.

### 10.5 Import, package and API leak gates

Extend the audit into enforceable gates in a later implementation:

- No runtime or type imports from Pi/host adapters in core public exports; no Node imports in language/kernel; no extension/UI direction upward.
- Check transitive emitted JS **and `.d.ts`**, not only direct imports. Include package peers/exports, dynamic imports and barrel side effects.
- Install/resolve the packed core in an empty temporary consumer without Pi packages; parse/load/evaluate through explicit test services. No host boot, credential/config reads, watcher, timer, socket or process at import time.
- Compile external consumer fixtures under supported TS/module settings; no `unknown as PiContext` escape hatch in examples.
- Retain exact hash/slug/validator corpus tests and dependency-lock provenance. A validator/library upgrade is a separately reviewed compatibility event.

Future live tests must use supported per-host login and the operator-approved OpenAI model, never credential copying or silent provider fallback. If a Claude Code capability requires a Claude-backed turn that cannot honor that model policy, record it as unverified and obtain separate explicit operator approval before any such test; do not relabel a different provider as an equivalent test. Assert concrete system notes/terminal records/tool effects and task-framed outputs; `prompt()` resolving is explicitly insufficient, as both current Theta failure surfacing and the retained host probes demonstrate.

---

## 11. Phased migration and reversibility

This is a proposed sequencing strategy for a subsequent authorized effort, **not an approved implementation plan or calendar estimate**. Relative scope/risk assumes current tests are retained.

| Phase | Independently useful deliverable | Relative scope / risk | Gate and reversible posture |
|---|---|---|---|
| **0 — Contract inventory** | Language/profile ownership table, exact supported pins, dependency gate, baseline traces | Small–medium / low runtime risk | Resolve current spec/code tensions; no semantic changes. Existing extension unchanged |
| **1 — Standalone language/load slice** | Parser/checker/value/schema package entry and explicit source repository | Medium / medium due to transitive cycles and declaration identity | Corpus/hash/diagnostic equivalence; old module paths forward to extracted internals; Pi still composes current runtime |
| **2 — Pi-backed execution seam** | Data-first effects, immutable artifacts/linked bindings, operation ownership facade | Large / high around return/cancel/invoke | Differential scripted and Pi regression traces. Switch per invocation before any effect, never dual-execute real effects |
| **3 — Query/binder redesign under Pi compatibility** | Real native-governed receipts plus shared stepped controller and structured protocol contracts | Large / highest semantic risk | Round/capture/repair/recovery/foreign-turn parity, exact notes and request behavior. Keep old Pi driver selectable at invocation start until qualified |
| **4 — Ordinary Durable owned-app slice** | Real second consumer with explicit inference/tool policy and private workers | Medium–large / high integration risk, lower ownership ambiguity | No same-conversation tool reentry; native ToolTask/stepped-query tests; interruption explicitly nonresumable. Can ship headless without a new full TUI |
| **5a — Claude Code Mod/bridge capability slice** | A thin `theta-host-claude-code` Mod plus supervised Node engine bridge; detached entry, native tool-policy dispatch, correlated completion and truthful unsupported-capability reports | Medium–large for the bridge; high/unknown for full native/worker parity | Prove build-matched APIs, ordinary multi-turn and headless lifetime, cancel/join/reload ownership, exact tools/round governance and a qualified structured channel. A launcher or stubbed worker is not a passing Theta host |
| **5b — Codex/OpenCode adapter slices** | Separate owned-worker profiles and negative capability reports; OpenCode TUI entry as optional control surface | Medium for narrow subsets; very large/high for full native parity | Stop at missing executor/governor/context capability. Prefer upstream supported seams over silently maintained host forks |
| **6 — Stronger tools/UI or durability** | Approved installed dispatch/inspection capability; separately versioned durable execution research | Independent, high/very high | RFC 0016/0017 or durable ABI decisions; no effect on existing profiles merely by installing package |

Practical reversibility rules:

- Recommended order remains Pi compatibility → ordinary owned-conversation Durable → bounded external-host capability slices. Claude Code's Mod/Node bridge is an explicit slice alongside the Codex/OpenCode worker work; it tests a restrictive runtime and a native extension entry that the other hosts do not replicate. Do not delay it until a hypothetical completed four-host migration, or count it as a working host before its gates pass.
- Maintain the current Pi extension package, command names, configuration and result-channel contract as the first distribution. `theta-core` is a dependency, not a requirement that users migrate hosts.
- A compatibility facade can preserve old internal imports during migration, but public core exports must not retain them indefinitely. Remove facades only after tests/consumers move.
- Select old/new execution at **invocation admission**, never switch in the middle of effectful work. Shadow-compare only parsing/pure checking or replay against recorded scripted receipts; running both native paths would duplicate side effects.
- Keep adapter releases and evidence pins explicit. Do not combine extraction with a Pi dependency upgrade, new tool resolution policy, new source syntax and durable-state migration in one release.
- Hot reload creates a new linked generation for new work. Existing work either retains its allowed immutable artifacts and dispatch-time checks or is cancelled according to the current profile; it is not silently rebound to new host closures.
- Rollback of ordinary code/package versions is possible while old wire formats are retained. Persisted durable state requires its own downgrade/migration strategy and cannot be promised reversible by npm version pin alone.

### 11.1 Why not the main alternatives?

| Alternative | Why it is attractive | Why it is not the recommendation |
|---|---|---|
| Copy `src/runtime` to a package | Fast apparent extraction | Misses compiler/loader code in extension, includes Pi windows/argv, retains wrong round abstraction and upward imports |
| Emulate Pi `ExtensionAPI` on every host | Reuses production composition | Makes other hosts imitate Pi session trees/tools/auth/UI; hides missing capabilities and creates a lowest-common-denominator or fake implementation |
| One `prompt/tools/spawn` wrapper | Small API | Cannot state admission versus completion, exact catalogs, round gates, typed protocol, uncertainty or isolation |
| Separate interpreter per host | Local freedom | Semantic fixes and regression knowledge fork; code/value/error behavior inevitably drifts |
| Force every host to core-owned raw model loops | Clean deterministic control | Loses native conversation/tool permissions and may require unsupported auth. Good **optional app-owned strategy**, not universal native hosting |
| Force every host to whole native turns | Retains native UX | Public APIs do not uniformly expose round/batch/exact-context controls; weakens Theta silently |
| Universal sidecar/protocol for all hosts | One deployment/runtime | Transport adds lifecycle/authority problems; it cannot manufacture missing native APIs. Use where process/runtime boundaries justify it |
| Persistent VM from day one | Strong future durability story | Largest semantic rewrite before ordinary portability is proven; external exactly-once remains unsolved |

---

## 12. Decision table and falsification gates

### 12.1 Recommended decisions versus approvals still needed

| Decision | Recommendation | Approval/gate |
|---|---|---|
| Shared unit | One core language/kernel/protocol implementation; host adapters are distinct products | Approve package ownership/DAG, not final API names |
| Host execution boundary | Explicit effects and admission/result/join handles; stepped and native-governed strategies | Prototype Pi equivalence before publishing API |
| Initial runtime | Node floor unchanged; no Node/Pi leaks in pure/kernel exports | Non-Node support separately certified |
| Initial validator/hash | Existing AJV semantics and SHA-256 bytes through companions/seams | Replacement algorithms/engines require full corpus parity |
| Pi compatibility | Preserve shipped behavior, including limitations | RFC 0016/0017 and stronger ownership not bundled |
| Second consumer | New ordinary Durable application/owned workers | Product owner must accept a new app/entry surface, not Pi TUI attachment |
| Claude Code scope | First-class thin Mod + Node bridge prototype; detached current-session entry and isolated-worker profiles are distinct, gated products | Confirm supported transport/auth, headless/worker ownership, exact tool/governor and structured-response semantics; no inference from registration/stub success |
| Codex/OpenCode scope | Owned workers and explicit supported subsets first | Decide whether subsets have product value; full native parity gated |
| Typed protocol alternatives | Capability-selected, provenance-preserving, explicitly approved | Specify native-schema context/error/template differences before portability claim |
| Process versus conversation isolation | Model both; retain Pi process contract | Approve any alternate isolation profile and affected `cwd`/ambient-policy behavior |
| Durable execution | Optional future seam; ordinary runs nonresumable by default | Separate replay/continuation/state-ABI design authorization |
| Source bundle pinning | Immutable artifacts but retain current Pi runtime rechecks | Whole-invocation source pinning is a separate behavior decision |
| Tool result evolution | Preserve current strings and Result errors | Rich typed native-tool returns require language design |

### 12.2 Highest-value experiments after authorization

These are **targeted prototypes that could falsify the architecture**, not work performed here:

1. **Pi receipt equivalence.** Replace only the synthetic-round adapter facade with a native-governed receipt. Feed current cap/recovery/foreign/early-capture fixtures through both. If exact errors, transcript notes, request counts and cancellation precedence cannot be preserved without leaking Pi internals into core, revise the receipt contract before extracting more code.
2. **True package isolation.** Pack language/kernel entry points and load from a consumer with no Pi packages. Include a library enum alias, typed query lowering and proto-named fields. Failure exposes remaining import/API leaks; the tiny arithmetic experiment is not sufficient.
3. **Durable stepped vertical slice.** Two real Theta queries, one parallel tool batch, zero-round typed finalizer, binder, native ToolTask denial and explicit abort/join. If authorized native tool dispatch requires fabricating model history or cannot supply code-origin policy/receipts, either disclose the profile or obtain a better supported tool-root seam.
4. **Codex varying tool sets and admission.** On a pinned owned worker, prove actual request tool sets across two differing queries and a hard pre-effect round cap. In a separate shared-thread test, race a human/client start with Theta admission and approval. If public interfaces cannot enforce/detect the required conditions, keep the full/shared profile refused; a newer SDK method name is not evidence.
5. **OpenCode native executor and governor.** Demonstrate one deterministic builtin and one plugin/MCP call through native permission/hook paths, then a parallel batch at the cap with no extra side effect. If only internal imports or synthetic-provider bridging can achieve it, make the maintenance/policy cost explicit and seek operator approval before proceeding.
6. **Structured protocol conformance.** Same schema/default/enum/repair corpus through Pi named tool, Codex schema-final and OpenCode singleton tool. Include noncompliance and candidate-plus-error endings. If context/privacy/error behavior cannot fit a truthful common semantic contract, keep separate named profiles rather than flatten the difference.
7. **Claude Code detached bridge and lifecycle.** On the pinned release or a deliberately requalified newer release, obtain build-matched declarations, return from a real command handler, then drive two correlated native turns without a hook-owned completion wait. Check headless lifetime, interrupt, Mod reload/unload and child failure; distinguish admission from terminal success. Demonstrate permission-aware deterministic tools, actual exact request catalogs and pre-effect round gates before accepting tool-bearing source. Qualify native/worker structured inference and supported auth separately; the prior agent probe was inconclusive. If these cannot pass, retain a named subset/refusal instead of making the sidecar a privileged replacement host.
8. **Future durability falsifier.** Tiny pinned interpreter journal, two parallel lanes, kill after external effect but before local result, then change args/code/policy. Demonstrate duplicate/uncertain behavior honestly, divergence refusal and replay reauthorization. Failure is a reason to redesign or defer durability, not mark the task replay-safe.

### 12.3 Major uncertainties

- Whether Claude Code Mods can sustain detached multi-turn orchestration, native worker/typed returns and fail-closed cleanup across hook budgets, headless exit, reload and worker unload; exact tool exposure and structured inference remain unqualified.
- Whether Claude Code/Codex/OpenCode expose enough **supported** pre-effect loop/native execution control for full Theta, without a fork or maintained internal adapter.
- Whether native schema-final channels can satisfy an approved context/error/repair contract without host-injected instructions changing the intended semantics.
- Whether Pi's current supported versions can gain stronger admission/direct dispatch without upstream changes; installed docs alone do not answer this.
- Which current cross-mode/process rules the operator wants generalized versus retained only as Pi profile behavior.
- How much loaded-program pinning is desired in ordinary long runs; current dynamic root/callee rechecks must remain intact until decided.
- Whether operator demand is for native current-conversation UX, useful worker subsets, or a new owned frontend; these lead to materially different products.
- Whether durable Theta is worth the value/state/journal ABI burden. Durable orchestration alone may meet the actual need.

**Recommended next approval:** a design/spec phase for core boundaries, Pi compatibility and the ordinary Durable slice, followed by bounded Claude Code Mod/Node-bridge and Codex/OpenCode worker capability prototypes. Include all five targets—Pi Agent, Pi Durable, Claude Code, Codex and OpenCode—in the adapter contract and conformance design now. Do not approve a blanket “five full hosts plus durable execution” implementation on the basis of the existing evidence.

---

## Appendix A. Traceable evidence index

### A.1 Current Theta source/spec anchors

The selected-source digest manifest in this workspace pins inspected bytes; paths below are source anchors, not claims of tests run in this investigation.

| Claim | Source anchors |
|---|---|
| Current package/runtime/peer coupling | `package.json:1–80`; `runtime-root.ts:17–73`; audit report and graph |
| Interpreter/effect seams and test-only isolation fallbacks | `runtime/statement-executor-types.ts:68–257`; `runtime/effectful-statement-host.ts:96–244` |
| Native whole-loop masquerading as model rounds | `extension/live-prompt-query-driver.ts:310–555`; `runtime/query-tool-loop.ts:154–178` |
| Exact active-set and restore semantics | `runtime/tool-registration.ts:84–208`; `runtime/invoke-prompt-suspend.ts:100–131` |
| Own-turn provenance, compaction/interleaving refusal | `extension/owned-turn.ts:1–120`; `tests/b0503-owned-turn-boundaries.test.ts:104–230`; `docs/spec_topics/query/query-tool-loop.md` |
| Named finalizer extraction, auth/forcing boundary | `extension/off-session-respond-dispatch.ts:170–294`; `extension/binder-run.ts:13–78,698–789` |
| TypeBox binder attachment and own-key repair | `binder/binder-inference.ts:46–56,120–215,426–494` |
| Binder context selection | `binder/session-context-walk.ts:35–172` |
| Current built-in selection/direct dispatch | `extension/callable-pi-tool-resolver.ts:35–195` |
| Source repository/materialized declaration residence | `extension/import-resolution-kit.ts:61–149,182–230`; `docs/spec_topics/invocation.md#static-resolution` |
| Current attach/spawn policy | `extension/invoke-machinery.ts:372–489`; `docs/spec_topics/invocation.md` |
| Private value brands and child codecs | `runtime/value.ts:56–112,278–315,489–549`; `runtime/subagent-envelope.ts:65–155`; `docs/spec_topics/runtime-value-model.md` |
| Parallel in-memory state and diagnostic ordering | `runtime/par-for-executor.ts:235–373` |
| Child control plane and Pi-only re-kick marker | `runtime/subagent-launcher.ts:250–379`; `runtime/subagent-placement.ts:70–170` |
| Cancellation checkpoint is not persistence | `seams/production-checkpoint.ts:20–38`; `runtime/terminal-outcomes.ts:45–100` |
| Draft new behavior versus shipped code | `docs/rfcs/0013-long-running-theta-restart-contract.md`; `0016-code-side-tool-dispatch-parity.md`; `0017-code-side-tool-observability-parity.md`; `extension/execution-status/types.ts` |

### A.2 Retained release/probe anchors rechecked

All paths below are under `.pi/tmp/dual-host-research/`; the linked overview reports supply release provenance, immutable upstream links and full reproduction instructions. No retained artifact was modified or rerun.

- **Claude Code:** the tracked [host overview](../hosts/claude-code/REPORT.md), [local-port analysis](../hosts/claude-code/local-port-analysis.md) and [semantic-gap analysis](../hosts/claude-code/semantic-gaps-analysis.md) preserve the release and evidence boundaries. Local raw artifacts remain under `.pi/tmp/claude-host-research/`: `probe-validate-final.json`, `probe-test-final.log`, the Mod/test source under `probe/`, and `core-browser-build.log`. They were not rerun for the publication revision. There is no build-matched declaration or live model/worker success claim.
- **Codex:** `release/protocol-experimental-ts/v2/TurnStartParams.ts`; `api-audit/source/codex-rust-v0.163.0/codex-rs/app-server/src/request_processors/turn_processor.rs:645–737`; `.../outgoing_message.rs:560–598`; `probes/protocol/assertions.json` (28 assertions, 13 wire requests, localhost test double); `probes/multiclient/assertions.json` (6 assertions, two clients/one server, not TUI lifecycle).
- **OpenCode:** `source/anomalyco-opencode-e3c4eb2/packages/opencode/src/session/prompt.ts:1052–1071,1243–1317`; `.../effect/runner.ts:115–137`; `probes/assertions.log` (28 positive/negative assertions, including real TUI entry, persistent permission changes and overlap). No real model/auth test.
- **Durable:** `release/source/packages/durable/src/harness/types.ts:484–496`; `.../harness/tool.ts:125–204`; `logs/conversations-final.log` (zero-provider-call native ToolTask and singleton-not-forced results); `recovery-analysis/results/safe/effects.jsonl` (two executions); `.../unsafe/recover.log` (interrupted uncertain result). Other crash/commit observations are attributed to the read prior recovery report, not re-executed here.
- **Pi installed reference:** `/home/thomasa/.pi/agent/install/releases/1.4.0/node_modules/@earendil-works/pi-coding-agent/docs/sdk.md`, `docs/extensions.md`, and `examples/extensions/dynamic-tools.ts` were read. They are 1.4 documentation/examples, not proof of unchanged behavior on every Theta-supported Pi version or of a new root code-dispatch API.

### A.3 Research artifacts and final boundary

- `REPORT.md`: this synthesis.
- `audit/focused-audit.md`, `audit/import-graph.cjs`, `audit/import-graph.json`: focused static dependency evidence, runtime versus type-only edges.
- `capture-evidence.py`, `inspected-source-sha256.json`: selected current-source identity capture.
- `source-symbols.txt`: local static symbol/import index used during reading.
- Supplied `initial-*` plus observed start/final HEAD/status files and `final-verification.json`: repository ownership evidence. Final verification found unchanged HEAD and selected source digests, no missing local report links, and concurrent tracked changes in the broader working tree.

No production code, project tests/docs/manifests/locks/configuration, personal Pi configuration, dependency installation or git index/history was changed during the original research run. No credentials were extracted/logged, no remote service was modified and no live provider turn was run. All original research writes remained beneath **`/home/thomasa/Projects/pi-theta/.pi/tmp/theta-core-research/`**. The focused child audit was collected before finalization.

## Provenance — publication revision

On 2026-10-25, the user authorized moving the authored research documents into version-controlled developer documentation and including Claude Code in this migration proposal. The [development index](../../README.md) records the relocation/evidence policy and links every tracked report. Local report-to-report links were updated; raw experiment artifacts remain in their original ignored workspaces.

Claude Code's package/bridge design, detached ownership requirements, structured-channel uncertainty, capability profiles, migration slice and falsification gate are synthesized from the tracked [feasibility report](../hosts/claude-code/REPORT.md), [local dependency analysis](../hosts/claude-code/local-port-analysis.md) and [semantic-gap analysis](../hosts/claude-code/semantic-gaps-analysis.md). This revision did not rerun host probes, obtain newer release declarations or verify model/account access. It is a research/design revision, not an accepted specification or implementation authorization.
