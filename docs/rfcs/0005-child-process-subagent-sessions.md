# RFC 0005 — Child-process subagent sessions (RPC session driver)

- **Status:** draft
- **Scope:** Pi-integration contract and runtime architecture. No theta
  language-surface change: the observable subagent semantics (isolated
  conversation, private transcript discarded on return, only the return value
  propagates, no ambient tool inheritance) are preserved, with one
  spec-visible restatement of the isolation guarantee (see *Isolation and
  trust*).
- **Affects:** `pi-integration-contract/subagent.md` (near-total rewrite),
  `tool-registration-lifetime.md`, `cancellation.md`,
  `session-shutdown-semantics.md`, `capability-probe.md` /
  `sdk-inventory`, the Pi version-bump procedure checklist, the diagnostics
  registry, `frontmatter-fields-b-and-templates.md` §Resolution snapshot
  (subagent leg), `invocation.md` (depth-counter carriage), and the
  transcript-privacy mechanism cited by SLSH-2.
- **Origin:** spawned by [Bug 0001 — Extension-registered tools are
  unreachable from Theta](../bugs/0001-extension-tools-unreachable.md); this
  RFC is otherwise self-contained.
- **Relates:** [RFC 0006 — Child-process theta execution](./0006-child-process-theta-execution.md)
  (sequel; reuses this RFC's machinery); pi-config's `subagent` extension
  (`pi-config/extensions/subagent/index.ts`), the prior art for
  child-`pi`-process launching this RFC builds on.

## Summary

Replace the in-process subagent session — `createAgentSession({ customTools,
tools, model, sessionManager: SessionManager.inMemory(cwd), resourceLoader })`
with `noExtensions`-style isolation — with a spawned child process:

```
pi --mode rpc --no-session
   --system-prompt <resolved system:>
   --tools <allowlist>
   --provider <p> --model <id>
   --no-skills --no-prompt-templates --no-themes --no-context-files
   [--approve | --no-approve]
```

The theta interpreter stays in the parent. Only the `AgentSession` handle is
replaced: queries, completion events, abort, and disposal travel over Pi's
documented RPC JSONL protocol (`docs/rpc.md` in `@earendil-works/pi-coding-agent`)
instead of in-process method calls. Pi documents this exact embedding pattern
and ships a subprocess client (`src/modes/rpc/rpc-client.ts`).

The child runs Pi's full startup extension discovery, so extension-registered
tools (`finding_store`, `projection`, …) are natively registered in the child
and reachable by the subagent's **model** through the `--tools` allowlist —
today they are reachable by no path in subagent mode. It also deletes the
spec's internal contradiction (the closed seven-name `customTools`
materialisation contract vs. the registry-backed `tools:` contract).

## Motivation

Three independent reasons, in priority order:

1. **Extension-tool reach for the subagent's model.** The spec promises that
   a theta's `tools:` list resolves against Pi's tool registry, extension
   tools included; the runtime does not deliver it in subagent mode. The
   current spawn passes extension-free `customTools`, so an extension tool
   can enter the spawned session only as an executable `ToolDefinition` —
   which Pi's public extension API withholds (`getAllTools()` strips
   `execute`, deliberately; upstream exposure was requested twice and
   refused). A child process sidesteps the withholding entirely: the child's
   own startup discovery registers every installed extension's tools
   natively, and `--tools` allowlists them. No executable definition crosses
   any boundary. This is the pattern pi-config's `subagent` extension
   already ships.
2. **The spec contradiction dissolves.** `subagent.md` rule 1 enumerates
   exactly two `customTools` entry kinds (built-ins from the closed seven-member
   `ToolName` union + `defineTool`-wrapped `.theta` callables), which
   contradicts the `tools:`/glossary/resolution-snapshot contract ("registry
   backed, extension-supplied included"). Under this RFC the enumeration is
   deleted rather than patched: built-ins and extension tools alike resolve in
   the child by name, through one mechanism.
3. **Isolation by construction.** Reaching extension tools requires running
   extension factories somewhere; running them a second time inside the
   parent process is an uncontainable third-party side-effect hazard
   (provider re-registration, watchers, spawned work). A child process
   confines those side effects: nothing the child's extensions do at startup
   can touch the parent's registries, providers, or watchers.

## Background: what the spec pins today

The mandate is layered, and the layering is favourable:

- **Semantic layer — mechanism-neutral.** `overview.md` §modes, the
  state-isolation semantics, and the frontmatter `mode:`/`system:`/`tools:`
  rules say nothing about process placement.
- **Pi-integration-contract layer — normatively in-process.**
  `pi-integration-contract/subagent.md` opens with "spawns a fresh in-process
  `AgentSession` via `createAgentSession`" and pins the mechanism exhaustively:
  the spawn-block call shape and its six rules, the `ResourceLoader` adapter
  (PIC-23), `SessionManager.inMemory`, the satellite-type pins, PIC-40/41
  (pre-spawn model guard, no-`signal`-field), PIC-42/43 (session-local
  `subscribe`, `agent_end` extraction), PIC-9 (disposal lifecycle), PIC-22
  (parallel spawn initiation), and version-bump checklist items (am), (o), (y),
  (h) that re-audit those pins per Pi minor.

The change is therefore a spec change concentrated in one contract page plus
its probe/version-bump satellites, while the language-visible behaviour
carries over unchanged.

## Proposal

### Executable resolution

The runtime resolves the child executable by re-launching the running process
from its own invocation — the mechanism proven by pi-config's `subagent`
extension (`getPiInvocation()`):

1. **Entry-script rung:** when `process.argv[1]` names an existing file,
   spawn `process.execPath` (the Node/Bun binary) with that script. The child
   is the exact same binary + entry script as the parent.
2. **Compiled-binary rung:** when `process.argv[1]` is unusable and
   `process.execPath` is not a generic runtime (`node`/`bun`), Pi itself is
   the executable — spawn `process.execPath` directly.

There is no `PATH` fallback — a deliberate divergence from the prior art. A
`PATH`-resolved `pi` may be a different version or install than the parent,
silently violating the pinned wire contract; pi-config can tolerate that risk
as a best-effort convenience tool, a spec-governed language construct cannot.
If both rungs fail, resolution fails **closed at load time**: the theta does
not register and the diagnostic names the reason. The rung-1 existence check
runs at probe time, not first spawn. Parent `execArgv` (Node flags) is not
forwarded to the child; the contract records this as accepted.

### Launch contract

One child process per subagent-mode invocation, spawned at the point
`createAgentSession` is called today (after the pre-spawn model guard). The
child inherits the parent's full environment and runs with the forwarded
`ctx.cwd` as its working directory, so parent and child read the identical
settings, profiles, and credential sources. Argv is assembled from the same
inputs the current spawn block consumes:

| Current in-process input | Child-process carrier |
|---|---|
| `resourceLoader.getSystemPrompt()` → resolved `system:` | `--system-prompt <text>` |
| `tools` explicit allowlist | `--tools <name1,name2,…>` |
| `customTools` (built-in materialisation) | dropped — the child registers built-ins natively; the allowlist selects them |
| `customTools` (`.theta` callables, typed-query one-shot tool) | child-side rediscovery + content-hash verification (below) |
| `model` (resolved handle) | `--provider <p> --model <id>` (reference, re-resolved by the child; see *Model marshalling*) |
| `SessionManager.inMemory(cwd)` | `--no-session` (ephemeral; no session file written) |
| `resourceLoader` empty members (skills, prompts, themes, agents files) | `--no-skills --no-prompt-templates --no-themes --no-context-files` |
| `noExtensions: true` | **removed** — full extension discovery is the point |
| (no counterpart) | `--approve` / `--no-approve` per the trust rule (see *Isolation and trust*) |
| forwarded `ctx.cwd` | child `cwd` |

An environment marker (e.g. `PI_THETA_SUBAGENT_CHILD=1`) identifies the child
so the theta extension loading inside it can suppress its own file watcher and
any behaviour that must not recurse.

**Empty callable set.** `tools: []` maps to `--no-tools` (the CLI's explicit
empty active set), preserving the "empty allowlist ≠ omission" invariant that
the current spec's spawn rule 2 pins for `createAgentSession`.

**`.theta` callables in `tools:` — content-hash verification.** The child
discovers the same `.theta` / `.thetalib` files from disk (the theta extension
loads in the child), so a `.theta` callable name in `--tools` resolves against
the child's own registry. A file edit between parent load and child spawn
would make the child silently run a callee the parent never validated — the
silent-divergence failure mode this design otherwise eliminates, and racy
per-invocation (parallel siblings could run different versions of the same
callee). The parent therefore records, at load, a content hash of each
`.theta` callable's transitive closure (the file plus its `.thetalib` imports
— an import edit changes behaviour as much as a root-file edit) and marshals
the hashes to the child; the child verifies after its own parse and refuses
the invocation on mismatch with a precise diagnostic (new code, fail-closed).
Full content marshalling (running the child on copies of the parent-loaded
sources) is the recorded escalation only if hashing proves insufficient; it
is rejected as the default for its disproportionate machinery
(transitive-closure copying, diagnostics pointing at copies).

### Model marshalling and pre-flight

The model crosses the boundary as a reference (`--provider <p> --model <id>`),
never as a live object, and credentials are never marshalled: with full
env inheritance and a shared agent dir, parent and child read the identical
config universe, so credential skew is structurally impossible — the posture
proven by pi-config's `subagent` extension. Explicit credential marshalling
(`--api-key`, env injection) is rejected: the parent cannot extract auth from
Pi's extension API, and argv/env secrets are a security regression.

One case has no prior-art cover: a theta with `model:` absent inherits the
caller's *live session model* — state that exists only in the parent session.
For that path the runtime adds a pre-flight unique to the RPC child: before
the first query, it confirms via the child's state surface (`get_state` /
`get_available_models`) that the marshalled reference resolved to the intended
model, and fails the invocation with a precise diagnostic naming expected vs.
resolved when it did not. The pre-spawn model guard (PIC-40's successor)
therefore extends from "resolved value is not `undefined`" to include this
confirmation. Credential failures are not pre-flightable without a provider
call and surface through the transport-error mapping below.

### Isolation and trust

The in-process clean room (empty `ResourceLoader`, zero extensions) is rebuilt
from the CLI flag set in the launch contract, audited at the Pi pin to
reproduce the empty-member behaviour. Two deliberate dispositions:

- **Extension ambience is accepted and stated.** Full extension discovery in
  the child is the point of this RFC, and loaded extensions contribute more
  than tools (system-prompt appends, handlers, providers). The isolation
  guarantee is restated spec-side as: *no user/project context (files, skills,
  templates) is inherited; installed extensions' contributions are present, as
  in any Pi session* — a spec-visible weakening stated, not hidden. Curated
  loading (`--no-extensions` + explicit `-e` per the `sourceInfo` of each
  declared tool) is the recorded escalation if extension ambience proves
  contaminating. Post-spawn verification of the effective system prompt via
  the RPC state surface is worth one probe during implementation and is
  adopted only if that surface exposes it.
- **Project-local trust is inherited by necessity-inference.** The launcher
  passes `--approve` iff the callable set contains a tool whose
  `getAllTools()` `sourceInfo` is project-local — the parent could only have
  admitted that tool because the operator already trusted its extension in
  the parent session, so the child inherits a decision already made — and
  `--no-approve` otherwise (least privilege).

### Drive mapping

Verified against the installed Pi (`docs/rpc.md`, v0.80.10). The RPC surface
carries every member the current drive consumes, including the exact
`agent_end { messages, willRetry }` shape PIC-43 extracts from:

| Current `AgentSession` member | RPC equivalent |
|---|---|
| `sendUserMessage(text)` | `{"type":"prompt","message":…}` on stdin |
| `subscribe` → `agent_end` event | `agent_end` event on stdout (`messages: AgentMessage[]`, `willRetry: boolean`) |
| terminal-event selection (`willRetry === false`) | identical, on the streamed events |
| `abort()` | `{"type":"abort"}` command |
| `dispose()` | graceful shutdown (stdin close) with a bounded kill fallback |

PIC-43's extraction rule (cancellation short-circuit, transport short-circuit
on trailing `stopReason: "error"`, chronological assistant-text concatenation)
transfers unchanged onto the event payload. The framing rules in `docs/rpc.md`
(strict JSONL, LF-only splitting) become a pinned consumed surface.

Typed queries keep their current mechanics: free-phase turns drive through the
child session; the forced-respond terminator continues to run off-session in
the **parent** via pi-ai `complete()`, exactly as today — its provider errors
never cross the wire.

**Error fidelity.** Typed error values (`QueryError`) are reconstructed from
child stdout instead of live in-process objects, with expected fidelity loss
of zero on the query path: the in-process subagent contract is *already*
payload-derived (PIC-43 reads the trailing assistant message's `stopReason` /
`errorMessage` and fixes `http_status: null`, `retryable: false`), and the
RPC `agent_end` event carries the same `messages` array. The spec work is an
audit, not a design fork: table every `QueryError` variant reachable on the
subagent path, verify each against the pinned event schema, and pin the two
genuinely new rows — child crash / nonzero exit mid-query and unparseable
wire output — both mapping to the `transport`-kind error with exit detail
plus diagnostics per *Lifecycle and teardown* below. Extending the wire
(richer RPC state queries) is held in reserve only if the audit exposes a
gap; degraded fidelity without the audit is rejected.

### Lifecycle and teardown

- **Spawn failure** (ENOENT, EPERM, immediate exit) routes as an unanticipated
  SDK reject does today: `theta/runtime/internal-error`, no session to dispose.
- **Disposal** (PIC-9 successor): the per-invocation `finally` closes stdin and
  awaits child exit; if the child does not exit within the existing
  `SHUTDOWN_AWAIT_CAP_MS` budget, the runtime kills it (process-tree kill on
  Windows). `disposeBarrier` settles on observed child exit.
- **Cancellation**: the one-shot `thetaAbort.signal` listener sends the RPC
  `abort` command (replacing `AgentSession.abort()`); teardown then proceeds as
  above. The spawn-then-immediate-cancel ordering rule of PIC-41 carries over.
- **Orphan prevention** — a layered guarantee for a hazard with no in-process
  counterpart (a child outliving a dead parent is an unattended agent with
  tool access):
  1. *Controlled parent paths* (normal return, errors, `/reload`, session
     shutdown, catchable process exit): the runtime kills the child. Hard
     obligation.
  2. *Uncontrolled parent death* (hard kill, OOM): the child's stdin is a
     pipe from the parent; the OS closes it on parent death regardless of how
     the parent died. Pi's RPC mode exiting on stdin EOF is the class-3
     mechanism — a behavioural presupposition verified at the Pi pin and
     re-audited per version bump (it is not `typeof`-probable). If
     verification at the pin fails, the recorded fallback is a child-side
     parent-PID watchdog: the theta extension already loads inside the child
     and is already env-marked, so the marker carries the parent PID and the
     extension exits the child when the parent vanishes.
  3. *Residual exposure*, documented: between parent death and child exit, an
     in-flight provider call may run for seconds; that window is irreducible
     without OS-level tethering (Job Objects / `PR_SET_PDEATHSIG`), which is
     rejected — platform-specific native dependencies contradict the
     codebase's dependency posture.
- **Child crash / nonzero exit mid-query** is a new failure class: the pending
  query resolves to `Err(QueryError { kind: "transport", … })` with the exit
  detail in `message`, and a diagnostic is emitted.

### Capability probing

The three in-process pins (`createAgentSession`, `ResourceLoader`,
`SessionManager.inMemory`) leave the Step-0 probe. Their replacements are not
`typeof`-probable: the probe runs the *Executable resolution* ladder above and
asserts a runnable entry point, failing theta registration with a precise
diagnostic when absent — the design's uniform fail-closed posture: a
capability that cannot be verified refuses registration loudly rather than
degrading silently.
The RPC wire protocol, the consumed CLI flags, and the stdin-EOF exit
behaviour become editorial-review checklist items on the version-bump
procedure, replacing items (am), (o), (y) in their current form.

### Performance disposition

Per-invocation process start (Node boot + extension discovery) replaces a
cheap in-process construction, multiplied under `par for` fan-out and nested
subagents. Bounding context: every subagent invocation also makes at least
one LLM call, so the overhead is a fraction of typical wall time — but pure
overhead. Disposition: ship as-is; benchmark spawn-to-first-prompt at the Pi
pin and record the figure in the contract as an expected-overhead note, not a
guarantee. **Process pooling is rejected**, and the rejection is recorded
deliberately: a reused child carries state across invocations (extension
module state, temp files, per-theta `--system-prompt`), trading the
per-invocation isolation invariant — the property this design exists to
guarantee — for latency. Startup-cost mitigation (e.g. trimming child startup
work) is strictly out of scope for this RFC; if measurement ever shows the
overhead to be a binding constraint, a mitigation is designed then, on its
own record. PIC-22's successor (all N parallel spawns initiated before any
returns) survives unchanged; its conformance test must tolerate real spawn
times, and simultaneous cold-boot resource contention falls under the
existing "resources are owned by the OS layer" disposition.

## Spec changes (enumeration)

1. `pi-integration-contract/subagent.md`: spawn block and rules 1–6 replaced by
   the launch contract (executable-resolution ladder, argv table, env
   inheritance, trust rule); PIC-9 → process-termination lifecycle including
   the orphan-prevention layers; PIC-40 → marshalled-reference guard + model
   pre-flight; PIC-41 → abort-command + kill semantics; PIC-42/43 re-based on
   the RPC event stream; PIC-22's conformance test re-based on a fake process
   launcher; PIC-23 deleted; satellite-type pins replaced by CLI-flag and
   wire-protocol pins.
2. `tool-registration-lifetime.md`: the subagent-mode paragraph (customTools,
   dies with `dispose()`) rewritten for the child registry + allowlist.
3. Diagnostics registry: new codes for spawn failure, executable-resolution
   failure (load-time), child crash, wire-protocol parse failure,
   child-teardown timeout, `.theta` content-hash mismatch, and model
   pre-flight mismatch; `subagent-dispose-failure` re-scoped.
4. `cancellation.md`: subagent forwarding row re-targeted at the RPC abort
   command; bounded-kill added to the teardown budget prose.
5. `session-shutdown-semantics.md` / drain contract: `disposeBarrier` settles on
   child exit; `/reload` mid-turn kills children.
6. State-isolation matrix: the "forwarded from `ExtensionCommandContext`"
   column shrinks — `ctx.modelRegistry` and `ctx.getContextUsage` do not cross
   a process boundary; the model row becomes a marshalled reference re-resolved
   child-side and pre-flight-confirmed. The isolation guarantee is restated:
   no user/project context is inherited; installed extensions' contributions
   are present, as in any Pi session.
7. §Resolution snapshot: the subagent leg changes from "strong reference to the
   resolved `ToolDefinition` at load" to "name allowlist + content hashes
   marshalled at spawn, resolved and verified by the child at child startup".
   The name-resolves-at-parent-load-but-not-in-child case (and its converse)
   is covered by the pre-flight and hash-verification diagnostics.
8. `invocation.md`: the invoke depth counter — today "a runtime-side invariant
   … not part of the wire-level data" — becomes wire-level (environment
   variable) for subagent children. Explicit reversal of the current sentence.
9. SLSH-2 / capability item 3: transcript-privacy mechanism restated from
   "in-memory `SessionManager` by construction" to "`--no-session` ephemeral
   per the pinned CLI contract".
10. Provider-error mapping: the `QueryError` audit table (see *Error
    fidelity*) is pinned; the table gains the child-exit and wire-parse rows.
11. Version-bump procedure: in-process presupposition items replaced by CLI /
    RPC-protocol audit items — flag semantics of `--tools` / `--no-tools` /
    `--no-session` / `--system-prompt` / `--approve`, JSONL framing,
    `agent_end` payload shape, and the stdin-EOF exit behaviour underpinning
    orphan prevention.
12. Glossary: "spawns a fresh, isolated `AgentSession`" reworded
    mechanism-neutrally ("a fresh, isolated agent conversation").

## Implementation changes

- New launcher module: the executable-resolution ladder, argv assembly, env
  marker, and spawn — behind the existing drive seam
  (`src/runtime/conversation-drive.ts`), so the interpreter and typed-query
  machinery are untouched.
- `src/extension/production-theta-producer.ts` (spawn at ~`:1655/1663`, subagent
  drive): the in-process drive replaced by a child-process driver speaking
  RPC JSONL, including the model pre-flight before the first query.
- `src/extension/production-composition.ts`: `resolvePiToolDefinition` (the
  seven-name switch feeding `customTools`) retires for subagent mode;
  `resolvePiTool` for subagent-mode load-time admission widens to
  `pi.getAllTools()` names (schema available for the RFC-0002 disjointness
  check, `sourceInfo` consulted for the trust rule) — the same widening the
  prompt-mode model-facing fix requires, so the work is shared.
- Load-time additions: transitive-closure content hashing of `.theta`
  callables; child-side (env-marked theta extension) hash verification.
- `src/runtime/subagent-isolation.ts`, `src/runtime/active-invocation-registry.ts`:
  disposal/barrier semantics rewritten for process lifecycle, including the
  bounded-kill path.
- `src/extension/capability-probe.ts` / `sdk-inventory.ts`: drop capability 3
  (`createAgentSession`) and the satellite pins; add the executable-resolution
  probe.
- Tests: suites built on fake in-process `AgentSession`
  (`subagent-isolation.test.ts`, PIC-22 conformance,
  `subagent-drive-teardown.test.ts`, live harnesses) re-based on a fake
  process/RPC harness; new coverage for hash-mismatch refusal, model
  pre-flight mismatch, child crash mid-query, and stdin-EOF child exit; live
  tests gain real child spawns (slower).
- Windows: spawn quoting, process-tree kill, no POSIX signals.

## What this RFC does not deliver

- **Code-side extension-tool dispatch in subagent mode.** The parent still
  holds no `execute` for extension tools, and the RPC protocol exposes no
  execute-tool-by-name command. A subagent theta's *model* can call
  `finding_store`; its *code* cannot. That is RFC 0006's job. The interim
  asymmetry is stated in the contract, and a code-side call to an extension
  tool fails with a precise diagnostic — never a silent fallthrough.
- **Prompt mode.** Untouched. Extension-tool reach for prompt-mode thetas
  (model-facing and code-side) is addressed separately and proceeds
  independently.

## Alternatives considered

- **Stay in-process, enable extensions on `createAgentSession`.** Would re-run
  every installed extension's factory inside the parent process — an
  uncontainable third-party side-effect hazard (an extension that is not
  idempotent on init misbehaves when loaded twice) — plus a recursion guard
  for the theta extension itself. Rejected.
- **Upstream Pi change: expose `getToolDefinition` on the extension API.**
  Cleanest — a one-line delegation Pi already performs for `getAllTools` —
  but requested upstream twice and refused. Pursued in parallel; if it lands,
  the in-process design could have been retained, but it is not a plan.
- **One-shot `pi -p --mode json` per query.** No multi-turn session: a theta
  issues multiple queries against one conversation, and `-p` gives one turn per
  process. RPC mode is the documented multi-turn embedding surface. Rejected.
- **`--mode json` with stdin steering instead of `--mode rpc`.** RPC is the
  protocol Pi documents for exactly this use, with request/response
  correlation and an `abort` command. Rejected.
- **`PATH`-resolved child executable.** pi-config's third resolution rung.
  Rejected: version-identity with the parent is a wire-contract requirement
  here, not a convenience (see *Executable resolution*).
- **Process pooling.** Rejected; rationale recorded in *Performance
  disposition*.

## Provenance

- Origin: `docs/bugs/0001-extension-tools-unreachable.md` — the defect record
  whose investigation produced this design.
- Prior art: pi-config's `subagent` extension
  (`pi-config/extensions/subagent/index.ts`) — `getPiInvocation()`
  argv-ladder executable resolution; full-env-inheritance spawn with concrete
  `--provider`/`--model` and no credential marshalling; parent-side
  pre-spawn model-alias resolution against shared config.
- Spec pages measured: `docs/spec_topics/pi-integration-contract/subagent.md`
  (in-process mandate, spawn rules, PIC-9/22/23/40/41/42/43),
  `tool-registration-lifetime.md`, `cancellation.md`,
  `session-shutdown-semantics.md`, `capability-probe.md`,
  `frontmatter/frontmatter-fields-b-and-templates.md` §Resolution snapshot,
  `invocation.md` (depth counter), `overview.md` §modes, `glossary.md`.
- Pi surfaces verified on the installed `@earendil-works/pi-coding-agent`
  v0.80.10: `pi --help` (flags `--mode rpc`, `--no-session`,
  `--system-prompt`, `--tools`, `--no-tools`, `--no-skills`,
  `--no-prompt-templates`, `--no-themes`, `--no-context-files`,
  `--approve`, `--no-approve`), `docs/rpc.md` (JSONL framing,
  `prompt`/`abort` commands, `get_state` / `get_available_models`,
  `agent_end { messages, willRetry }` event, subprocess-client reference).
- Implementation sites: `src/extension/production-theta-producer.ts`
  (`:1655/1663`), `src/extension/production-composition.ts`,
  `src/runtime/conversation-drive.ts`, `src/runtime/subagent-isolation.ts`,
  `src/extension/capability-probe.ts`, `src/extension/sdk-inventory.ts`.
