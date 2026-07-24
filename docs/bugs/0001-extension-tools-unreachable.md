# Bug 0001 — Extension-registered tools are unreachable from Theta

- **Status:** partially shipped — subagent-scenario code-side reach (Option F +
  E, host-loop dispatch) shipped in 0.10.0; prompt-mode code-side (Option E
  parent-side) and Option A prompt-mode model-facing remain unshipped; Option C
  pursued upstream. See *Shipped status (0.10.0)* below.
- **Kind:** defect (spec + implementation disagree, and both under-deliver the
  documented behaviour).
- **Affects:** callable-set resolution (`src/parser/callable-set.ts`), the
  composition-root Pi-tool wiring (`src/extension/production-composition.ts`),
  the query-time active set, `theta/load/unknown-tool`, and the subagent-spawn
  `customTools` channel (`src/extension/production-theta-producer.ts`).
- **Reclassified from:** RFC 0004 (draft). This is a defect against documented
  behaviour, not a feature proposal — the `tools:` contract and the glossary
  already state that extension-supplied tools resolve; the runtime does not
  deliver it. It is tracked as a bug, not an RFC.

## Status — read this first (resume point)

This document is the durable record of a defect **and** a solution-space
exploration. Read it top-to-bottom to resume; this block is the orientation.

**Problem.** Extension-registered Pi tools (`finding_store`, `projection`, …) are
unreachable from a Theta, though the spec says they should resolve. The plain Pi
agent's model *can* call them; a Theta cannot — it fails to load if `tools:` names
one, and its query-time active set is exactly the callable set (ambient not
unioned).

**Two reach needs.** *Model-facing* (Theta's model calls the tool — considered
trivial) and *code-side* (Theta code calls it, zero-token, deterministic — the
RFC-0002 channel, the **priority**).

**Established mechanics (do not re-derive):**
- Models never *execute* tools; they emit a *request*. The **host agent loop**
  (prompt mode) or **Theta's own off-session loop** (subagent) executes.
- `getAllTools()` exposes name + schema, **not** `execute`; `execute` is
  deliberately withheld from extensions (maintainer stance; not a security
  boundary). Upstream `getToolDefinition` was **requested twice (#2420, #3497) and
  refused** (§Upstream history).
- Prompt-mode Theta queries run in the **user session** via `sendUserMessage` on
  `ctx.model`; only the binder, subagent turns, and the typed forced-respond turn
  run **off-session** via `complete()`.
- Theta `mode: subagent` is **in-process** `createAgentSession(noExtensions)`,
  **not** a child process (contrast pi-config's `subagent` extension, which is a
  child `pi` process running a plain agent).

**Options (see §Fix options + §Architecture study):**
- **A** — `setActiveTools` model-facing, prompt mode. Public, ships now. *(trivial)*
- **B** — `discoverAndLoadExtensions` harvest → real `execute`. **Deprioritised**:
  re-runs every installed extension's factory (uncontainable third-party side
  effects).
- **C** — upstream `getToolDefinition` delegation. Cleanest, but **refused
  upstream**; contingent on the drafted *Upstream argument*.
- **D** — child-process `pi --tools` (pi-config subagent pattern), model-facing.
- **E** — **PS-emit / host-loop deterministic dispatch**: a Theta-controlled fake
  provider authors the `tool_use`, the host loop executes. No upstream, documented
  APIs only, deterministic code-side; **prompt mode only**; cost = transcript
  pollution + session-model thrash.
- **F** — **child-process theta** (`pi --theta -p /slug`): carries E into subagent
  scenarios by launching the callee where extensions are natively registered.
- **Rejected:** provider-seat as the *architecture* (PS-capture depends on an
  undocumented execute-leak; PS-interpose rebinds the provider process-wide).

**Current leaning (decision open, §Decision needed):** no-upstream code-side via
**A + E** (prompt mode) now, **F** for subagent scenarios; **C** pursued in
parallel; **B** last resort. Recommended next step: prototype **E** end-to-end on
the installed Pi v0.80.10.

**Shipped status (0.10.0).** The recommended next step was carried out and the
subagent branch of the plan shipped. Option **E**'s host-loop dispatch was
prototyped end-to-end against Pi v0.80.10 (the RFC-0006 acceptance criterion),
passed, and was wired child-side; combined with Option **F** (child-process
theta, RFC 0006), a `mode: subagent` theta whose *code* calls an
extension-registered Pi tool now dispatches it deterministically through the
child's host agent loop — zero model tokens, no executable definition crossing
any boundary. Implementation: `src/extension/production-host-loop-dispatch.ts`
(the three injectable collaborators against the real Pi surface),
`src/runtime/host-loop-dispatch.ts` (the leaf-tested seam), gated on the
subagent-root regime plus a `typeof` surface probe (parent/prompt contexts keep
the rung unavailable, fail-closed). Contract pinned at
`pi-integration-contract/subagent.md` PIC-61 (ladder + host-loop wiring pins).
Subagent *model-facing* reach shipped earlier (0.8.0 model-facing, 0.9.0
whole-callee child). **Still unshipped:** prompt-mode code-side dispatch (Option
E parent-side — no child, so the fail-closed refusal stands there) and Option A
prompt-mode model-facing admission. **Option C** (upstream `getToolDefinition`
on `ExtensionAPI`) remains pursued upstream via the *Upstream argument*; if it
lands it slots in as the preferred rung and retires the host-loop machinery
without changing the process architecture. The rest of this document is the
durable exploration that produced the design and is left as written.

**Subagent-in-a-subprocess exploration (2 RFCs drafted):** the in-process
subagent design is itself under revision. The spec mandates in-process only at
the Pi-integration-contract layer (`subagent.md`'s spawn contract + its
probe/version-bump satellites); the semantic layer is mechanism-neutral. Two
sequenced RFCs record the child-process redesign:
[RFC 0005 — Child-process subagent sessions](../rfcs/0005-child-process-subagent-sessions.md)
(remote session via `pi --mode rpc`; delivers subagent *model-facing* reach —
the Option D effect — and deletes the seven-name `customTools` spec
contradiction) and
[RFC 0006 — Child-process theta execution](../rfcs/0006-child-process-theta-execution.md)
(Option F specified: whole callee in a child `pi --theta` process under a new
*subagent-root* regime; delivers subagent *code-side* reach via Option-E
dispatch child-side).

**Key source locations:** Theta `src/parser/callable-set.ts`,
`src/extension/production-composition.ts` (`resolvePiTool` / `resolvePiToolDefinition`,
seven-name switch), `src/extension/production-theta-producer.ts` (subagent spawn
`:1655/1663`, prompt-mode drive), `src/runtime/conversation-drive.ts`. Pi host
source (full history) cloned at `c:/UnitySrc/pi-agent-hist`; Theta runs against
installed `@earendil-works/pi-coding-agent` **v0.80.10** under
`node_modules/`.

## Summary

A Pi session exposes two kinds of tools to the model: the host built-ins
(`read`, `bash`, `grep`, `edit`, `write`, `ls`, `find`) and any tools an
installed extension registers (e.g. a project's `finding_store`, `projection`).
The spec says both kinds are reachable from a Theta by name. The runtime reaches
only the first kind. Naming an extension-registered tool in `tools:` raises
`theta/load/unknown-tool` and the whole theta fails to register. Because the
frozen callable set is the sole tool boundary for **both** code-side calls and
the query-time tool loop, an extension tool is reachable by **no** path: not
`finding_store({ ... })` in code, and not as a tool offered to the model inside
an `@` query. Under `pi -p`, an un-registered slug falls through to the ordinary
agent, which can be mistaken for a working run.

## Expected behaviour (what the spec says)

The spec states that extension-supplied Pi tools resolve, in three places:

1. **`tools:` normative owner** — `docs/spec_topics/frontmatter/frontmatter-fields-a.md`
   §`tools`: "**Pi tool names** (`read`, `bash`, `grep`, ...) resolve against
   **Pi's tool registry** at theta-load time, exactly as for Pi subagents." The
   list is an open example; resolution is against the registry, not a fixed set.
2. **Glossary** — `docs/spec_topics/glossary.md`: "A *Pi tool* is a tool
   registered against the Pi runtime **(built-in or extension-supplied)**,
   referenced in `tools:` by name."
3. **Resolution snapshot** — `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md`
   §Resolution snapshot: each Pi-tool entry "holds a strong reference to the
   resolved `ToolDefinition` object (its `execute`, `parameters`, and metadata
   **as returned by Pi's tool registry** at the moment of load)."

By these, a theta that lists `finding_store` in `tools:` should resolve it,
expose it to the model during `@` queries, and admit `finding_store({ ... })`
from theta code — as a first-class member of the callable set, like a built-in.

## Actual behaviour (what the runtime does)

The callable-set resolver (`src/parser/callable-set.ts`) is registry-agnostic:
it delegates to an injected `deps.resolvePiTool(name)` and treats `undefined` as
`theta/load/unknown-tool`. The production composition root injects a
`resolvePiTool` backed by a fixed seven-name switch
(`builtinToolDefinition`, `src/extension/production-composition.ts`):

```
switch (name) {
  case "grep": … case "read": … case "find": … case "ls":
  case "bash": … case "edit": … case "write": …
  default: return undefined;   // every extension tool name → unresolved
}
```

The same seven-name switch backs `resolvePiToolDefinition`, the subagent-spawn
`customTools` source. Any name outside the seven returns `undefined`, so the
resolver raises `theta/load/unknown-tool` and, because "the theta registers iff
no error-severity diagnostic was raised," a single `tools: [finding_store]`
entry un-registers the whole theta.

## The callable set is the only door — for code and for queries

The restriction is not confined to code-side calls. The query-time tool loop
installs exactly the theta's callable set as the model's active tools for the
query window, and the ambient session snapshot is **not** unioned in
(`docs/spec_topics/pi-integration-contract/tool-registration-lifetime.md`; the
runtime paths in `src/runtime/conversation-drive.ts` /
`src/runtime/invoke-prompt-suspend.ts`). So a theta cannot fall back to letting
the model call the extension tool during an `@` query either — if the tool
cannot enter the callable set, it is absent from the model's active set too. A
session's own extension tools are visible to the plain agent but invisible to
every theta that agent could invoke.

## The spec defect (internal contradiction)

The `tools:`/glossary/resolution-snapshot contract above says registry-backed
(extension tools included). A second part of the spec contradicts it. The
subagent integration contract,
`docs/spec_topics/pi-integration-contract/subagent.md`, describes `customTools`
as carrying only two kinds — "both Pi built-ins (each materialised … by the
corresponding per-tool factory function … the **closed seven-member `ToolName`
union (`allToolNames`)** … **kept consistent with the `tools:`-admitted name
set**) and `defineTool`-wrapped `.theta` callables." That passage:

- enumerates only two entry kinds — no extension-tool kind;
- materialises built-ins from `create<Name>ToolDefinition(cwd)` factories, with
  **no described path** for turning an extension-registered tool into a
  `ToolDefinition`;
- asserts the seven-name set is "kept consistent with the `tools:`-admitted name
  set" — i.e. treats the admitted Pi-tool names as exactly those seven.

So the production seven-name switch **conforms** to the subagent materialisation
contract while **violating** the `tools:`/glossary/resolution-snapshot contract.
Fixing the bug requires reconciling these two spec regions, not only changing
the switch. STYLE.md requires reporting a spec/implementation disagreement rather
than papering over it; this document is that report.

## Why it matters

RFC 0002 established the tool call as the language's zero-token side-effect
channel and lifted the literal-only argument rule so that channel carries
computed values. That win reaches the seven built-ins only. It does not reach
the tools that motivate most orchestration thetas: a domain pipeline's custom
tools (`finding_store`, `projection`, …). An orchestration theta that must drive
those — mint an id, write a record, render a view, run a deterministic
projection — cannot call them at all. The deterministic parts of such a
pipeline, the exact work Theta exists to move out of the model, stay unreachable.

## Reach analysis (SDK investigation)

The fix is bounded by what the pinned Pi SDK lets a theta *extension* obtain for
a tool another extension registered. There are three distinct reach paths, with
different constraints. (Package-root exports at the theta 1.0 Pi-SDK pin,
`@earendil-works/pi-coding-agent`.)

| Reach path | What theta needs | Available on the pinned **public extension API** (`pi` / `ctx`)? |
|---|---|---|
| **Prompt-mode, model-facing** (`@` query tool loop) | tool name in the active set + parameter schema (for RFC-0002's disjointness check) | **Yes.** `pi.getAllTools()` gives name + `parameters` schema; `pi.setActiveTools([…names])` activates it on the live host session, which dispatches `execute`. |
| **Subagent-mode, model-facing** | an executable `ToolDefinition` to pass as `customTools` | **No.** The spawned session is created with `noExtensions: true` (to avoid recursively re-loading the theta extension), so the extension tool is absent from its registry; it can only enter via `customTools`, which needs `execute`. |
| **Code-side dispatch** (`name({ … })` from theta code, both modes) | an executable `ToolDefinition` (`.execute`) | **No.** Theta code dispatches `execute` directly; there is no public "execute-by-name" API. |

Key SDK facts established:

- `ExtensionAPI.getAllTools(): ToolInfo[]` returns metadata only —
  `Pick<ToolDefinition, "name" | "description" | "parameters" | "promptGuidelines"> & { sourceInfo }`.
  **No `execute`.**
- The executable definition (`RegisteredTool.definition`, which has `execute`)
  is reachable through `AgentSession.getToolDefinition(name)` and
  `ExtensionRunner.getToolDefinition(name)` — both public methods — but the
  theta extension holds neither a host `AgentSession` handle nor an
  `ExtensionRunner`: `pi` / `ctx` expose only `getAllTools()` (metadata) and a
  `ReadonlySessionManager`. The host session and runner are captured in closures
  when the extension API is built (`agent-session.js`), with no property to reach
  them. **On the pinned public extension API, an extension tool's `execute` is
  unreachable from a theta.**
- **Precedent — the Pi `subagent` extension.** Pi's own subagent mechanism
  (`pi-config/extensions/subagent/index.ts`) reaches extension tools by *not*
  spawning in-process: it `spawn`s a fresh `pi` CLI child with
  `--tools name1,name2`. The child re-discovers and re-registers all installed
  extensions natively, so `--tools` allowlists them over the child's own
  registry and no executable definition crosses the boundary. This is a working,
  model-facing reach; it does not provide code-side dispatch. See Option D.
- The package root *does* export `discoverAndLoadExtensions(...)`,
  `ExtensionRunner`, and `wrapRegisteredTool(s)`. A throwaway
  `discoverAndLoadExtensions` gives `Extension[]`, each with
  `tools: Map<string, RegisteredTool>` carrying `definition.execute`. This is a
  no-upstream path to executable definitions — but it **re-runs every discovered
  extension's factory** (side effects: provider re-registration, watchers,
  spawns), depends on the ambient installed-extension set (a determinism/
  reproducibility hazard the spec's open questions already flag), and must
  exclude the theta extension itself to avoid recursion.

Net: **prompt-mode model-facing reach is fully achievable on the pinned public
API; code-side and subagent-mode reach require either an off-cost extension
re-load or an upstream Pi addition.**

## Fix options

Listed with the tradeoff that distinguishes each. Recommendation follows.

### Option A — public-API, prompt-mode model-facing reach (partial)

Wire the production `resolvePiTool` to consult `pi.getAllTools()`: admit any
registered tool name, carrying its `parameters` schema (enough for the RFC-0002
disjointness check and for the model tool spec). Prompt-mode `@` queries then
reach the extension tool via `setActiveTools`; the host session executes it.
Code-side `name({ … })` and subagent-mode uses raise a precise diagnostic
("extension tool reachable only from the model in prompt mode").

- **Pro:** ships on the pinned public API; no fragile internals; no extension
  re-load; removes the whole-theta-unregister cliff for the model-facing case.
- **Con:** partial. Does **not** deliver the RFC-0002 zero-token *code* channel
  to extension tools (the primary motivation), and bakes in a built-in/extension
  capability asymmetry that authors must learn.

### Option B — harvest executable definitions via a throwaway loader (full, no upstream)

Use the root-exported `discoverAndLoadExtensions(...)` (excluding the theta
extension) to obtain `Extension.tools[name].definition` and capture the
executable `ToolDefinition` into the resolution snapshot. All three reach paths
work; extension tools become first-class like built-ins, matching the
`tools:`/glossary/resolution-snapshot contract.

- **Pro:** full reach now, no upstream dependency; stays on root-exported SDK
  functions.
- **Con:** re-runs foreign extension factories (side-effect and determinism
  hazard — provider re-registration, watchers, duplicate work); load outcome
  depends on ambient installed extensions; must reconcile the permission/
  reproducibility open questions before it is safe. Lower quality than a clean
  registry read.

### Option D — child-process spawn with `pi -p --tools` (model-facing, process-isolated)

Follow the pattern the Pi `subagent` extension already ships
(`pi-config/extensions/subagent/index.ts`): instead of spawning the subagent
in-process, `spawn` a fresh `pi` CLI child (`--mode json -p --tools name1,name2
… "Task: …"`). The child runs its own startup discovery, natively re-registers
every installed extension's tools, and `--tools` allowlists them over the
child's own registry — so no executable `ToolDefinition` need cross the process
boundary.

- **Pro:** proven in this ecosystem; reaches extension tools with no in-process
  executable-definition access and no upstream change; full extension
  re-registration happens in an isolated process, avoiding the parent-process
  side-effect hazard of Option B.
- **Con:** model-facing only — the extension tool is called by the *child's*
  model, not from parent theta code, so it does **not** deliver the RFC-0002
  zero-token *code* channel. Forfeits typed returns unless re-parsed from
  stdout, adds a process boundary and JSON marshalling, and diverges from
  Theta's in-process `createAgentSession` subagent design (which exists for
  typed returns and isolation). Maps onto the subagent-mode model-facing path
  only; does not help prompt-mode or code-side reach.

### Option E — PS-emit / host-loop deterministic dispatch (no upstream; prompt-mode code-side)

The refined, viable form of the provider-seat *PS-emit* family (§Architecture
study). A Theta-controlled **fake provider** authors the `tool_use` itself, so it
controls the arguments (deterministic), and the **host agent loop executes** the
tool (the host holds `execute`), so Theta needs no `execute` access. Flow, per
code-side call:

1. **Once, at load:** `pi.registerProvider("theta-bridge", { api, apiKey: "x",
   streamSimple })` — a dummy literal `apiKey` makes the model selectable
   (`hasConfiguredAuth`); `streamSimple` never calls a network.
2. `pi.setActiveTools([...callable set, extTool])` (the emitted call is executed
   only if its name is active), then `await pi.setModel(bridgeModel)` on the user
   session.
3. `pi.sendUserMessage(encode({ tool, argsJson }))`; `await ctx.waitForIdle()`.
4. `streamSimple` is a two-state machine keyed on the last message: on the
   encoded request it pushes `toolcall_end({ name, arguments: argsJson })` +
   `done: toolUse` → the host loop executes the tool, appends the tool-result,
   and re-invokes the bridge → on seeing the tool-result it pushes `done: stop`
   (empty text), ending the turn.
5. Theta reads the tool-result from the session, `await pi.setModel(original)` in
   a `finally`, and returns the parsed result to code.

- **Pros:** deterministic args; **zero LLM tokens**; no `execute` access needed;
  rests **only on documented APIs** (`registerProvider`, `setModel`,
  `setActiveTools`, `sendUserMessage`/`waitForIdle`,
  `createAssistantMessageEventStream`, and the agent loop executing an emitted
  call against the active set) — unlike PS-capture it does **not** depend on the
  undocumented `context.tools` execute-leak, and unlike Option B it re-runs no
  foreign factory.
- **Cons:** **prompt mode only** (needs the user host session + agent loop + the
  tool registered + a settable session model); **per-call cost is a full host
  turn** that injects a fake user message + tool-call + tool-result cards into the
  user's visible transcript (SLSH-2 forbids suppression); `setModel` is
  **persisted** (session file + settings) and fires `model_select` on each switch
  — session-model thrash and spurious listener events, twice per call; must
  restore the model in a `finally`; the result comes back as tool-result content
  to parse, not a typed `execute()` return. Latency is negligible next to a real
  model turn. Architecturally it re-enters the loop per call (poor spec-coherence;
  a tactical workaround, not the dispatch model — see §Architecture study).

### Option F — child-process theta (no upstream; carries Option E into subagent scenarios)

Run a subagent invocation as a child `pi --theta <dir> -p "/<slug>"` process —
the pattern pi-config's `subagent` extension uses to spawn a child `pi`, but
launching a **theta** rather than a plain agent. Inside the child, full discovery
runs, so **extension tools are natively registered**, and the child theta runs in
effective **prompt mode** against a real host session — so Option A
(`setActiveTools`) works for model-facing and **Option E works for deterministic
code-side dispatch**, natively.

This exists because Theta's current `mode: subagent` is **in-process**
(`createAgentSession({ resourceLoader: noExtensions: true }, SessionManager.inMemory)`,
`production-theta-producer.ts:1655/1663`), so a subagent session has **no**
extension tools and no host loop to exploit — Option E is otherwise prompt-mode
only. Launching the callee as a child process moves its code into an
extensions-available context.

- **Pros:** carries code-side + model-facing reach into subagent scenarios with
  **no upstream** and **no foreign-factory re-run in the parent** — the child's
  re-discovery is **process-isolated**, so its side effects don't touch the parent
  (a determinism/isolation improvement over Option B).
- **Cons:** a **process boundary** — typed returns marshalled over `--mode json`
  stdout (re-parse), per-invocation process-startup latency; a real **change to
  Theta's subagent architecture** (in-process → child-process launch); applies
  only to subagent-mode invocations (prompt-mode thetas already hold the host
  session).

### Option C — upstream Pi: expose `getToolDefinition` on `ExtensionAPI` (full, clean, gated)

Pi already exposes `getToolDefinition(name): ToolDefinition | undefined` on
`AgentSession` and already delegates `getAllTools` from the session into the
extension actions (`agent-session.js`). A symmetric one-line delegation of
`getToolDefinition` onto `ExtensionAPI` would give the theta the *host* session's
executable definition directly — no factory re-run, no side effects, matching
the resolution-snapshot contract exactly. `resolvePiTool` /
`resolvePiToolDefinition` then capture the full definition and all three paths
work.

- **Pro:** highest quality; clean registry read; no re-load; the pin migrates
  the reach from "unreachable" to "public and stable."
- **Con:** blocked on an upstream Pi release and a Pi-SDK pin bump. **Requested
  upstream twice and refused** (Pi issues #2420, #3497 — see *Upstream history*
  below); a merge is unlikely without a materially new argument (drafted in
  *Upstream argument* below). Does not unblock authors today on its own.

### Upstream history — Option C was requested twice and refused

Two GitHub issues requested, in substance, exactly Option C (expose the
executable definition / allow one extension to call another's tools). Both were
closed no-fix by the maintainer (badlogic). Verbatim quotes are in the chat
thread; per-comment summaries follow.

**#2420 — "Add `pi.getToolExecutor()` so extensions can call each other's tools"**
(opened + closed 2026-03-19). <https://github.com/earendil-works/pi/issues/2420>

- **@coctostan (OP):** `getAllTools()` returns `{name, description, parameters}`
  but strips `execute`; two extensions he maintains can't call each other's
  tools; current workaround stashes executors on `globalThis` + `pi.events`
  ("passing function references through an untyped channel feels wrong"); proposes
  a one-line additive `getToolExecutor(name)` reading the internal `_toolRegistry`.
- **@sigilmakes:** +1; wants his code-mode extension to call other extensions'
  tools (incl. MCP) and "compose whacky tool outputs in code mode."
- **@coctostan:** clarifies one referenced extension is not his.
- **@badlogic (closing):** "this is only useful if you know the exact input shape
  of the other extension's tool. which in general you don't. you also don't know
  if you are messing with the internal state of the other extension. if you
  control both extensions, then `pi.event` is what you should use… you also lack
  the input shape type if you pull the tools from another extension."
- **@coctostan:** "Fair enough… I have a workaround."

**#3497 — "Programmatic tool calling"** (opened + auto-closed 2026-04-21).
<https://github.com/earendil-works/pi/issues/3497>

- **github-actions[bot]:** auto-closed (new-contributor default; maintainers
  review daily).
- **@badlogic:** "this has been discussed before and i'm afraid it's a no fix. if
  you have control over all the extensions… use the event bus. otherwise, there's
  no way for you to know the input schema of 3rd party extension tools, so this
  does not seem very useful."
- **@Karrq:** pushes back — "we are in the land of JS where everything is
  introspectable, and the tools are self-describing so that the agent may use
  them"; knowing *which* tool you want is not a reason to forbid calling it if you
  can verify it.
- **@badlogic:** "you said programmatic tool calling, which to me means you are
  writing an extension that calls into external tools. for that you, the human (or
  the agent writing the extension) needs to know the shape of the tool input.
  that will work for tools you know about, but not generally… i have no plans of
  implementing it."
- **@Karrq:** if the schema is introspectable at runtime and you can invoke the
  closure, that is enough; enables ad-hoc integrations; cites an "alias
  slash-command" extension he could not build; notes people currently
  vendor/fork/import source instead; prefers an event-bridge API but "most
  extensions don't expose one."

**Takeaways.** (1) The refusal is a considered design stance, not a stale
artefact — the `parameters` schema was already exposed when both comments were
made (issue #2420's own body states `getAllTools()` returns `parameters`). (2)
"Know the exact input shape" means the *authoring* side statically understanding a
specific tool's contract, **not** runtime schema availability. (3) The blessed
cross-extension channel is the **`pi.events`** event bus — but only for
cooperating, commonly-owned extensions. Neither refusal considered a *language
runtime* whose end user declares the exact tool; that is the gap the argument
below targets.

### Upstream argument (a fresh case the two refusals did not consider)

**Ask:** delegate the existing `getToolDefinition(name)` (already on
`AgentSession`/`ExtensionRunner`) onto `ExtensionAPI`, symmetric to the existing
`getAllTools` delegation. Additive, one line, nothing breaks.

**Both refusals answered a different question** — "an extension hard-coding a call
into an unknown third-party tool." Theta is a *language runtime*: the **end user**
names the exact tool in a program's `tools:` list. The coupling you object to is
explicit and user-authored — identical to how built-in tools already appear there.

- **"You don't know the input shape" — not for this caller.** `getAllTools()`
  already publishes `parameters`; Theta resolves that schema at load to type-check
  the call and to offer the tool to the model. The author writes args against the
  tool's own published schema — the same schema the model uses. This is the "tool
  you know about" case you grant works, not the "arbitrary tools" case you reject.
- **"You might touch internal state" — no new exposure.** The `execute` requested
  is the exact closure the host already runs when the *model* calls the tool, with
  the same bound `ctx`. The model can already invoke it in any session; Theta asks
  only to run that same dispatch from code — zero-token and deterministically.
- **The event bus doesn't cover it.** `pi.events` needs the tool-*provider* to
  cooperate and be commonly owned; a runtime must reach a user's declared tools
  without their authors opting in. `getAllTools` already exposes every tool
  cross-extension *without* cooperation — the ask is only to stop stripping
  `execute` from that same view.
- **Why it's worth it.** It is the only clean way to give a language runtime's
  zero-token tool channel parity between built-in and extension tools. The
  no-upstream alternatives — re-running every installed extension's factory to
  harvest executors, or spawning child `pi` processes — are strictly worse on
  determinism, side effects, and cost.

### Recommendation

Option C is the cleanest *technical* end state but is **not a dependable plan** —
the identical ask was refused upstream twice (§Upstream history), so treat it as
contingent on the *Upstream argument*, pursued in parallel. Given the maintainer
priorities recorded here (code-side determinism first, low output-token cost,
avoid upstream, avoid Option B's foreign-factory side effects), the no-upstream
plan is:

- **Ship Option A** — model-facing reach in prompt mode, on already-public
  surfaces; removes the whole-theta-unregister cliff. *(Considered trivial.)*
- **Use Option E for prompt-mode code-side** deterministic, zero-token calls — a
  Theta-controlled fake provider authors the `tool_use`; the host loop executes.
  Documented APIs only; no execute-leak, no factory re-run. Cost: per-call
  transcript pollution + session-model thrash (latency negligible).
- **Use Option F for subagent scenarios** — launch the callee as a child
  `pi --theta` process so extension tools are natively registered and Option E's
  dispatch works there; process-isolated, at the cost of a child-process boundary
  and a change to Theta's subagent design.
- **Deprioritise Option B** — its foreign-factory re-run is an uncontainable
  third-party side-effect risk; last resort only.
- **Pursue Option C in parallel** via the *Upstream argument*; if it lands, retire
  E/F's machinery for a clean registry read.
- **`pi.events`** does not fit: it needs the tool-*providing* extension to
  cooperate and be commonly owned.

Whichever is chosen, the spec fix is the same shape: split the `tools:` contract
so "Pi tool (built-in)" and "Pi tool (extension-supplied)" state their reach
explicitly, and repair the `subagent.md` / glossary contradiction so the
customTools materialisation admits extension-supplied definitions.

## Architecture study: "Theta as a provider"

A separate investigation asked whether Theta should reach extension tools by
occupying Pi's **provider seat** during execution — registering a Pi provider
(`pi.registerProvider`, whose `streamSimple` hook *is* the stream function the
agent loop consumes) so Theta can either emit tool calls the host executes, or
capture the live executables the host passes to the provider. Three provider-seat
variants were studied (brainstorm + feasibility, orchestrated across worker
subagents against the installed v0.80.10 dist and the Pi source):

- **PS-capture** — a bridge provider used *only* to harvest the live
  `context.tools[i].execute` during a one-shot turn, then dispatch those captured
  closures directly from Theta code (and pass them to subagent `customTools`).
- **PS-emit** — occupy the provider seat per call and push a scripted `tool_use`
  (`toolcall_end` + `done: toolUse`) so the host loop executes the named tool.
- **PS-interpose** — a provider that wraps the real model, forwarding each turn
  while sitting in the path to capture/inject.

### Decisive mechanical finding

Theta's turns split into two dispatch paths, and **neither puts the provider seat
on the code-side channel**:

- **Session-driven (prompt mode).** A prompt-mode untyped query, and the *free
  phase* of a typed query, are issued via `pi.sendUserMessage(text)` and run as a
  real turn **on the user session**, using the **user session's** model
  (`ctx.model`) — *not* the theta's `model:` (spec `conversation-drive.md`:
  "the driven turn runs on the user session regardless of the theta's `model:`";
  runtime `src/runtime/conversation-drive.ts`). The theta's callable set is
  installed for the query window via `pi.setActiveTools` snapshot/restore. This
  path *does* go through the session's provider, but on the *user's* model.
- **Off-session.** The binder, all subagent-mode turns, and the typed query's
  *forced-respond terminator* + respond-repair follow-ups are dispatched via
  `complete()` from `@earendil-works/pi-ai/compat`
  (`src/extension/production-theta-producer.ts:63`; binder `:756`, subagent
  free-phase `:1630`, forced-respond/respond-repair `:3556`), resolved by pi-ai's
  own api-registry keyed on `model.api` (`pi-ai/dist/compat.js:169/184`). That
  path **never consults** the coding-agent `ModelRuntime.extensionProviders`
  where `pi.registerProvider` lands (`model-runtime.js:376`), and `complete()` is
  a **single provider round-trip with no tool-execution loop** — in Theta's
  off-session query loop, *Theta itself* executes any returned tool call against
  its callable set (so it still needs `execute`).

Consequences (all verified against v0.80.10):

- **PS-emit is BLOCKED off-session and reduces to a host-turn hijack in prompt
  mode.** Off-session, `complete()` runs no loop, so an emitted tool call is
  never host-executed — Theta is the executor and lacks `execute`; and
  `complete()` cannot even see a `pi.registerProvider` provider. In prompt mode
  the seat *is* on the free-phase path, but only the *user session's* model runs
  it, so reaching the seat means `pi.setModel`-ing the user session onto the
  bridge (global, persisted, `model_select`-firing) per call — heavy, pollutes
  the transcript, yields no typed code-side return, and works in prompt mode only.
  Either way it collapses into PS-capture / Option B.
- **PS-interpose** would require registering into pi-ai's api-registry
  (`registerApiProvider`) under a synthetic `api`, globally rebinding that api for
  the whole process (host included) — a broad, order-sensitive side effect — and
  buys nothing PS-capture does not.
- **PS-capture's primitives all PASS** (registerProvider queued at load /
  immediate after; the `streamSimple` event stream; `setModel` selectable with a
  dummy literal `apiKey`; `context.tools` carries a ctx-pre-bound, standalone
  4-arg `execute` on a *host* turn — `agent-session.js:270`,
  `tool-definition-wrapper.js`), but capture can happen only on a **host-session
  turn**, so it must hijack a host turn (transcript + shared-state mutation) and
  its end-to-end orchestration is unproven without a live spike.

Event hooks cannot substitute: no hook (`tool_call`, `tool_result`,
`before_provider_request`, `tool_execution_*`) can **originate or fulfil** a tool
call — they only block, mutate args, or edit an already-dispatched result
(`agent-loop.js:394/411`).

### Architectural verdict: the provider seat is the wrong layer

Even where mechanically possible (PS-capture), the provider-seat families are
incoherent with theta 1.0 as specified:

- **Frozen resolution snapshot.** The `tools:` contract resolves each callable at
  *load* to a strong `execute` reference and "never re-queries Pi's tool registry
  by name during execution" (`frontmatter-fields-b-and-templates.md` §Resolution
  snapshot). PS-emit/PS-interpose never capture an `execute` — they re-enter the
  model loop per call, making `unknown_tool` reachable per call, a semantics the
  spec does not define. PS-capture can deposit an `execute`, but only by running a
  turn *before* the snapshot is meaningful, breaking the "resolved at load" clause.
- **Determinism.** A seat sees whatever `context.tools` the host assembled at that
  instant — the reachable set becomes a function of ambient session state, the
  exact hazard the open questions flag; `runtime-value-model.md` §Effects fixes
  the effect surface at three named channels bounded by `tools:`.
- **Subagent isolation.** PIC-17 requires only the theta's *declared* names ever
  be active, ambient snapshot never unioned in. A seat observing the whole live
  `context.tools` is ambient by construction; PS-interpose (session-wide) is worst.
- **Prompt-mode pollution.** PS-emit injects a fabricated assistant `tool_use`
  into the user's transcript per code-side call; PS-interpose perturbs every user
  turn. Both breach the "code-side calls are side-effects, not visible model
  turns" expectation and collide with PIC-17 snapshot/restore.
- **Unprobeable fragility.** PS families depend on behavioural internals of
  `agent-loop.ts` / the stream-fn pipeline (that `context.tools` carries live
  `execute`; that a fabricated `toolCall` is executed) — none `typeof`-probable,
  so the capability-probe + version-bump audit cannot catch a Pi refactor that
  breaks them silently. The opposite of the `setActiveTools` / `getToolDefinition`
  surfaces the probe already asserts.

Net: occupying the provider seat trades a bounded, probe-guarded, load-time,
ambient-free tool model for an unbounded, unprobeable, invocation-time,
ambient-derived one. **The provider-seat families (PS-capture/emit/interpose) are
rejected as the architecture.** *As the resolution architecture* — every call
re-entering the loop, the frozen snapshot violated. The refined **PS-emit** form
is nonetheless retained as a *tactical workaround* (**Option E**): a fake provider
that authors the `tool_use` gives deterministic args and the host loop executes
it, usable for prompt-mode code-side dispatch when Options B/C are unavailable — a
per-call escape hatch, not the dispatch model. **Option F** carries it into
subagent scenarios via a child-process theta. PS-capture (execute-leak) and
PS-interpose (process-wide provider rebind) are not adopted.

### Where this leaves the fix

The study reconfirms the options above and sharpens their ranking:

- **Highest quality — Option C (upstream `getToolDefinition` on `ExtensionAPI`).**
  The exact read the resolution-snapshot contract wants; a symmetric one-line
  delegation (Pi already delegates `getAllTools`) gives first-class reach
  (code-side + model-facing, both modes) fully covered by the existing
  capability-probe + version-bump machinery. Scores well on every axis except
  upstream-freedom.
- **Interim — Option A (`setActiveTools`-only, prompt-mode model-facing).** Ships
  today on already-probed surfaces; removes the whole-theta-unregister cliff for
  the model-facing prompt case; introduces only a documented reach asymmetry (no
  code-side, no subagent).
- **No-upstream code-side, prompt mode — Option E (PS-emit / host-loop dispatch).**
  A Theta-controlled fake provider authors the `tool_use` (deterministic args) and
  the host loop executes it; documented APIs only — no `context.tools` execute-leak,
  no factory re-run. Cost: per-call transcript pollution + session-model thrash.
- **No-upstream code-side, subagent scenarios — Option F (child-process theta).**
  Launch the callee as a child `pi --theta` process where extension tools are
  natively registered, so Option E's dispatch works there; process-isolated (no
  parent side effects, unlike B), at the cost of a process boundary.
- **Option B (re-load harvest) — deprioritised.** It deposits a real `execute` but
  re-runs every installed extension's factory; an extension that is not idempotent
  on init (re-registers a provider, starts a watcher) misbehaves when loaded
  twice — an uncontainable third-party risk. Last resort only, behind
  self-exclusion + declared-name filter + side-effect containment.
- **PS-capture / PS-interpose — not adopted:** PS-capture depends on the
  undocumented `context.tools` execute-leak; PS-interpose rebinds the provider
  process-wide.

### Fail-closed guard (any option)

Reach must be a **hard, probe-asserted gate that refuses registration with a
precise diagnostic** rather than silently degrading — under `pi -p` an
un-registered slug currently falls through to the ordinary agent and *looks* like
it worked; the guard must not preserve that lie.

1. Capability assertion in the Step-0 probe / SDK inventory
   (`capability-probe.ts`, `sdk-inventory.ts`): C ⇒ assert
   `typeof pi.getToolDefinition === "function"`; A ⇒ `pi.getAllTools` /
   `pi.setActiveTools` (already asserted); B ⇒
   `typeof discoverAndLoadExtensions === "function"`.
2. Fallback ladder, no silent fallthrough: `getToolDefinition` (C: first-class,
   both modes) → else `getAllTools`+`setActiveTools` (A: model-facing prompt-mode)
   → else **refuse to register** with a precise load-time diagnostic (extend
   `theta/load/unknown-tool` or add `theta/load/extension-tool-unreachable`)
   naming the tool and the reason. A code-side call that resolved only at the A
   rung raises a precise `CodeToolError`, never a fabricated value.
3. If no rung is available the theta does not register and the operator sees why.

### Study provenance

Orchestrated across worker subagents: four brainstorm workers (one per approach
family) and two feasibility workers (SDK mechanics against v0.80.10; architectural
coherence + risk). Mechanics verdicts cite the installed
`@earendil-works/pi-coding-agent` v0.80.10 dist; architecture analysis cites the
theta spec (`frontmatter-fields-b` §Resolution snapshot, `tool-registration-
lifetime.md` PIC-17, `subagent.md`, `runtime-value-model.md` §Effects) and Theta
source (`production-theta-producer.ts`, `callable-set.ts`,
`production-composition.ts`).

## Decision needed

Resolved by this exploration: the provider seat is **rejected as the resolution
architecture** (§Architecture study); Option C is **refused upstream** and
contingent on the *Upstream argument*; Option B is **deprioritised** (uncontainable
foreign-factory side effects). Recorded maintainer priorities: code-side
determinism, low output-token cost, no upstream dependency, no Option-B side
effects.

The open decision is the no-upstream code-side path:

- **Option E (prompt mode)** — PS-emit / host-loop deterministic dispatch. Ready
  to prototype on v0.80.10; documented APIs only. Accept per-call transcript
  pollution + session-model thrash?
- **Option F (subagent scenarios)** — child-process `pi --theta`. Bigger change
  (subagent mode from in-process `createAgentSession` to child process) but clean
  isolation; needed only if subagent-mode thetas must make code-side extension
  calls.
- **Option A** ships regardless for the model-facing case.
- **Option C** pursued in parallel; would supersede E/F if merged.

Recommended next step: prototype **Option E** end-to-end against v0.80.10
(register the fake provider, dispatch one extension-tool call from theta code,
confirm host execution + result read-back + model restore), then decide E-only
(prompt) vs E+F (prompt+subagent) on whether subagent-mode code-side reach is
required.

Left open for the maintainer.

## Non-goals

- **The tool-name literal rule.** RFC 0002 kept tool *names* literal to preserve
  load-time callable-set resolution and the arity check. This does not change;
  an extension tool is still named by a literal in `tools:` / at the call site.
- **`.theta` callees.** These already resolve and are unaffected.
- **New tool capabilities.** The ask is to reach tools the host already
  registers, not to invent a new effect surface.

## Open questions (carried from the investigation)

- **Resolution time vs. availability time.** Resolve against the registry at
  load (and pin the `ToolDefinition`), or check at invocation? Behaviour when a
  tool present at load is absent at invocation (and vice versa)?
- **Permission / safety.** Code-driven, zero-token dispatch of arbitrary
  extension tools (which may write files, spawn processes) removes the model-turn
  checkpoint. Is a capability gate required, and at which layer?
- **Determinism.** A registry that varies by installed extensions makes a
  theta's load outcome depend on ambient state — sharpest for Option B.
- **Subagent isolation.** How does the chosen mechanism interact with
  `subagent fn … with { tools }` and the frozen no-ambient-inheritance rule?

## Prior art in this repository

- Registry-agnostic resolver contract: `src/parser/callable-set.ts`
  (`CallableSetDeps.resolvePiTool` — "resolve … against the host tool registry";
  `theta/load/unknown-tool`).
- The production wiring that narrows it: `src/extension/production-composition.ts`
  (`builtinToolDefinition`, `resolvePiTool`, `resolvePiToolDefinition`).
- The subagent-spawn `customTools`/`tools` assembly and `noExtensions: true`
  spawn: `src/extension/production-theta-producer.ts`.
- Callable set as the query-time active set:
  `src/runtime/conversation-drive.ts`, `src/runtime/invoke-prompt-suspend.ts`.
- Documented resolution surface: [Frontmatter — `tools`](../reference/frontmatter.md).
- The zero-token channel this gap bounds: [RFC 0002 — Computed field values in
  Pi-tool arguments](../rfcs/0002-computed-tool-arguments.md).
- SDK capability gating for any new dependency: `src/extension/capability-probe.ts`,
  `src/extension/sdk-inventory.ts` (the named-capabilities presence check and
  the Pi version-bump audit).

## Provenance

- Spec pages measured against: `docs/spec_topics/frontmatter/frontmatter-fields-a.md`
  (§`tools`), `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md`
  (§Resolution snapshot), `docs/spec_topics/glossary.md` (Pi tool),
  `docs/spec_topics/pi-integration-contract/subagent.md` (customTools
  materialisation), `docs/spec_topics/pi-integration-contract/tool-registration-lifetime.md`
  (active-set install).
- SDK surface inspected at the pin: `@earendil-works/pi-coding-agent`
  `dist/core/extensions/types.d.ts` (`ExtensionAPI.getAllTools`, `ToolInfo`,
  `RegisteredTool`, `Extension.tools`), `dist/core/extensions/runner.d.ts`
  (`getToolDefinition`, `getAllRegisteredTools`), `dist/core/agent-session.d.ts`
  (`getToolDefinition`), `dist/core/sdk.d.ts` (`createAgentSession` `tools` /
  `customTools`), `dist/core/extensions/loader.d.ts` (`discoverAndLoadExtensions`),
  `dist/index.d.ts` (root exports).
- Implementation inspected: `src/parser/callable-set.ts`,
  `src/extension/production-composition.ts` (lines ~1058-1110),
  `src/extension/production-theta-producer.ts` (spawn, ~1663).
