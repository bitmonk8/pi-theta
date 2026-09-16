# RFC 0011 — Session-control tools: `compact`, `context_usage`, `session_name`

- **Status:** accepted (implemented 2026-09-16, shipped in 0.476.0; see
  §Implementation record)
- **Scope:** theta 1.x language surface (governed by
  [`../spec_topics/governance/release-version-naming.md`](../spec_topics/governance/release-version-naming.md));
  callable-set surface only — no grammar change, no new reserved keyword
- **Affects:** callable-set resolution (a third entry kind), tool-call return
  typing, prompt- and subagent-mode tool visibility, the `ExtensionContext`
  touched-member inventory, load/parse diagnostics (two new codes), the
  post-compaction transcript readers, docs
- **Depends on:** [RFC 0012](./0012-configurable-subagent-placement.md),
  which landed first (Decision log, D2; accepted, `0.475.0`). After it every
  subagent body — a `.theta` callee *and* an inline `subagent fn` body —
  runs as the root invocation of its own child process with its own session,
  which is what lets the tools be admitted inside `subagent fn` bodies (§6).
  The precondition is discharged: `driveSubagentRootRegime`'s fn entry
  (`#driveSubagentFnEntry`, `src/extension/production-theta-producer.ts`)
  binds the body's own session, so the isolated-body rejection this RFC mints
  covers `par for` bodies only.

## Summary

Add three **runtime-owned, code-only tools** to the callable-set vocabulary:

| Tool | Signature (as a `.theta` callee would declare it) | Host twin |
|---|---|---|
| `compact` | `(instructions: string = "") -> Result<{ summary: string, tokens_before: integer, tokens_after: integer }, QueryError>` | `/compact [instructions]` — `ctx.compact(...)` |
| `context_usage` | `() -> Result<{ tokens: integer, context_window: integer, percent: number }, QueryError>` | the footer's context gauge — `ctx.getContextUsage()` |
| `session_name` | `(name: string) -> Result<string, QueryError>` | `/name <name>` — `pi.setSessionName(...)` |

A theta opts in per tool through the existing `tools:` field and calls each
with the `.theta`-callable calling convention (positional typed arguments,
typed `Result` return). The tools are **never model-facing**: they are not Pi
tools, they enter no `pi.setActiveTools` install vector and no child `--tools`
allowlist, and no model in any `@`-query tool loop can call them. They act on
the **invocation's own conversation** — the driven user session in prompt
mode, the child's private session in a subagent-root child — through the Pi
host members the runtime already holds.

```yaml
---
description: Apply a fix plan wave by wave, compacting between waves
mode: prompt
params:
  plan_path: string
tools: read, compact, context_usage, session_name, theta_progress
---
```

```theta
session_name("fix-loop " + plan_path)
let plan = read({ path: plan_path })?
let waves: array<string> = plan.split("\n")
for wave in waves {
  @`Apply this step of the plan and report what changed: ${wave}`?
  let usage = context_usage()?
  if usage.percent > 60 {
    match compact("Keep the per-wave change list and any failing test names.") {
      Ok(c)  => theta_progress({ message: "compacted (tokens after / before)", done: c.tokens_after, total: c.tokens_before }),
      Err(_) => theta_progress({ message: "no compaction this wave" }),
    }
  }
}
```

(`theta_progress` is RFC 0010's progress tool, declared in `tools:` above like
any other entry; it appears only to make the outcome observable. The gauge is
read after each wave's query, never immediately after `compact` — see §3.)

## Motivation

1. **Deterministic placement of compaction.** Pi compacts a conversation when
   `contextTokens > contextWindow - reserveTokens`, mid-run and before a new
   prompt (`AgentSession._checkCompaction`, `dist/core/agent-session.js`). A
   theta running a long single-conversation loop cannot choose *where* that
   happens. The script knows its phase boundaries — the point at which the
   preceding wave's transcript is disposable — and today has no way to say so.
   The existing deterministic context tool, a fresh session per `invoke(...)`
   / `.theta` callable / `subagent fn`, is the right answer when phases are
   independent; it is the wrong answer when later phases must keep a compacted
   memory of earlier ones in the *same* conversation.
2. **Conditional compaction needs the gauge.** `trigger-compact.ts` in Pi's
   examples compacts when `ctx.getContextUsage()` crosses a threshold. Theta
   code cannot read the gauge, so it cannot write that loop. `context_usage`
   exposes the read; `compact` exposes the act.
3. **No author-side recovery from `context_overflow`.**
   [Query — Failure and repair](../spec_topics/query/query-failure-and-repair.md)
   short-circuits respond-repair on `context_overflow` "because the
   conversation only grows and subsequent attempts cannot succeed". With
   `compact` the premise no longer holds unconditionally: an author can
   compact and retry.
4. **The host surface already exists and is already inventoried.**
   [Host interfaces core — `ExtensionContext`](../spec_topics/pi-integration-contract/host-interfaces-core.md#extensioncontext-interface)
   lists `compact(options?)` as "forwarded unchanged in both modes … not
   invoked by theta in theta 1.0", and `getContextUsage()` as "reserved for
   compaction triggers and footer rendering". This RFC consumes both for the
   purposes the inventory reserved them for.
5. **Models must not get it.** The operator's requirement that drove this RFC:
   `/compact` is a session-control act for the deterministic layer, not a
   capability the model chooses to exercise mid-query. Every design below is
   judged against that first.

## Raw material (verified pins)

Drafted against the installed `@earendil-works/pi-coding-agent` 0.85.1;
re-verified against the build pin `~0.80.10` during Phase 2A, with the
corrections folded in below and recorded in §Implementation record. The theta
build pin is `~0.80.10`
([Host prerequisites — Pi SDK pin](../spec_topics/pi-integration-contract/host-prerequisites.md#pi-sdk-pin)).

- **`/compact` and `ctx.compact` are one method.** The TUI's `/compact`
  handler (`handleCompactCommand`, `dist/modes/interactive/interactive-mode.js`)
  is `await this.session.compact(customInstructions)`. The extension context's
  `compact` action is bound in `AgentSession._bindExtensionCore`
  (`dist/core/agent-session.js`) to the same `AgentSession.compact`, wrapped
  fire-and-forget with `onComplete` / `onError` callbacks. The binding is at
  the `AgentSession` level, so it is identical in TUI, RPC, `--mode json` and
  `-p` — the subagent child's mode. Print mode's `rebindSession`
  (`dist/modes/print-mode.js`) overrides no compaction action.
- **No generic built-in dispatch exists.** Built-in slash commands are
  hard-coded string matches in `interactive-mode.js`; `ExtensionAPI` has no
  `runCommand`. `pi.sendUserMessage("/compact")` is a trap: `AgentSession.prompt`
  dispatches only *extension* commands for `/`-text and then sends the literal
  string to the model as a user prompt.
- **`AgentSession.compact` semantics.** (a) It begins with
  `await this.abort()` — a no-op when idle, a kill of any in-flight run
  otherwise. (b) At the build pin `prompt()` gates on `isStreaming`, not on compaction
  (the literal `Cannot submit a prompt while compaction is in progress` does
  not exist at `~0.80.10`), and `isIdle` stays TRUE during a manual
  compaction — compaction is not an agent run; AUTO-compaction runs inside
  the agent run (`_checkCompaction` before `_emitAgentSettled`), so the
  settle phase's `isIdle` wait covers it. (c) It throws
  `Nothing to compact (session too small)` when the whole branch fits inside
  `keepRecentTokens` (default 20 000) and `Already compacted` when the last
  entry is a compaction (`prepareCompaction`, `dist/core/compaction/compaction.js`), and
  `Compaction cancelled` on an extension's `session_before_compact` cancel and
  on the post-summary abort check — arms reachable only on paths that abort
  the compaction (the user's Escape, an extension cancel), never from a theta
  abort (§7, Decision log D3).
  (d) It needs a selected model with auth. (e) It runs other extensions'
  `session_before_compact` handlers. (f) Its only per-call knob is
  `customInstructions`. (g) It is **not a reset**: it summarises everything
  older than the most recent `keepRecentTokens` window.
- **`AgentSession.getContextUsage`.** Returns `undefined` when no model is
  selected or the model's `contextWindow` is unknown; returns
  `{ tokens: null, contextWindow, percent: null }` after a compaction until an
  assistant response with usage lands; otherwise a usage-backed estimate.
- **`AgentSession.setSessionName`.** Appends a session-info entry and emits
  `session_info_changed`; `getSessionName()` reads it back. Under
  `--no-session` (the subagent child) the session manager is constructed with
  `persist = false`, so the name lives in memory only.
- **Availability.** `ctx.compact()` and `ctx.getContextUsage()` entered the
  extension API in Pi 0.49.0; `pi.setSessionName` / `pi.getSessionName`
  predate it. All are below theta's `>=0.80.8` floor — no SDK pin movement.
- **Code-side dispatch today.** Host built-ins (`read`, `bash`, …) resolve to
  a direct `execute` (`builtinToolDefinition`,
  `src/extension/production-composition.ts`). Every other `pi.getAllTools()`
  name — theta's own `theta_progress` included — is execute-less and routes
  through PIC-64 rung-2 **host-loop dispatch**: a fabricated agent turn under a
  bridge provider (`#dispatchExtensionToolViaLadder`,
  `src/extension/production-theta-producer.ts`). A `ctx.compact()` issued
  from inside that fabricated turn would `await this.abort()` the run that is
  executing it.
- **Model-facing vectors.** Prompt mode installs
  `computeActiveSetInstall(...)` (`src/runtime/conversation-drive.ts`) —
  every callable-set name plus the respond tool — inside `withActiveSetGate`
  (`src/runtime/tool-registration.ts`). Subagent mode passes
  `callableSetPiToolNames(theta)` (`production-theta-producer.ts`) as the
  child's `--tools` allowlist through `launchSubagentChild`
  (`src/runtime/subagent-launcher.ts`); `.theta` names never enter it
  (bug 0218).
- **The retained host handles.** The prompt-mode driver holds the
  slash-handler `ExtensionCommandContext` for the invocation's lifetime and
  the factory-captured `pi: ExtensionAPI`
  ([Conversation drive](../spec_topics/pi-integration-contract/conversation-drive.md)).
  `thetaAbort.abort()` already invokes the raw handler `ctx.abort()`, and
  `AgentSession.abort` calls `abortCompaction()`.
- **Post-compaction transcript shape.** `buildSessionContext(...).messages`
  begins with a `role: "compactionSummary"` `AgentMessage`
  (`createCompactionSummaryMessage`, `dist/core/messages.js`), which
  `convertToLlm` presents to the model as a `user` message. Theta's turn
  grouping presupposes a leading `user` message
  ([Host prerequisites — leading-`user`-message guarantee](../spec_topics/pi-integration-contract/host-prerequisites.md#messages-leading-user-message-presupposition)),
  and the binder's `renderMessage` (`src/binder/compact-transcript.ts`) sends
  the arm to its `custom` fallthrough, rendering `[custom:undefined]`. This is
  reachable today through auto-compaction; this RFC makes it a first-class
  path.
- **Governance.** GOV-15
  ([Source-language stability](../spec_topics/governance/source-language-stability.md#gov-15))
  requires a file that loads cleanly under theta 1.0.0 to load with identical
  results under every 1.x release. The reserved-keyword set is closed
  ([Lexical — Reserved keywords](../spec_topics/lexical.md)); `invoke` is the
  one reserved intrinsic. FRNT-2
  ([Parameters and Frontmatter — `tools`](../spec_topics/frontmatter/frontmatter-fields-a.md#frnt-2))
  pins that a `tools:` entry is "one unified declaration serving theta code
  and the model alike".
- **Corpus scan.** 43 `.theta` + 3 `.thetalib` in this repository (tree-wide;
  the committed-fixture gate's SHIPPED subset — git-indexed, less the
  seeded-invalid directory — is `EXPECTED_SHIPPED_THETA = 41` at the same
  commit, a different scope, not a contradiction) and 26 in the operator's
  pi-config contain no identifier `compact`, `context_usage`, or
  `session_name` (two hits, both inside comments).

## Proposal

### 1. Surface — a third callable-set entry kind

`tools:` gains three **runtime-tool names**. Each is admitted like a host
built-in name (`resolvePiTool`'s built-in arm, ahead of the
`pi.getAllTools()` registry snapshot) and freezes into the callable-set
snapshot as a new `ResolvedCallable` kind:

```ts
// src/parser/callable-set.ts (sketch)
interface ResolvedRuntimeTool {
  readonly kind: "runtime-tool";
  readonly name: "compact" | "context_usage" | "session_name";
}
```

Everything the `tools:` grammar already offers applies unchanged: the
comma-separated and YAML-sequence spellings, `as <name>` renames
(`compact as compact_session`), `theta/load/tool-name-collision` against a
same-file `fn` or import, and the lowercase-first presented-name rule. A theta
that does not declare a runtime tool cannot call it — the same
"ambient tools are deliberately *not* inherited" rule as every other entry,
and the property that keeps GOV-15 intact (§Compatibility).

**Precedence.** A runtime-tool name resolves before the registry snapshot,
exactly as a host built-in name does today (`resolvePiTool` consults
`builtinToolDefinition` first). An extension tool registered under one of the
three names is therefore unreachable from `tools:` under that spelling — the
disposition host built-ins already have, not a new rule.

### 2. Call form — the `.theta`-callable convention with a fixed signature

A runtime tool is called as a bare-identifier call, `<name>(args)`, and binds
its arguments **positionally against a fixed `params:`-shaped signature**,
exactly as a statically resolvable `.theta` callee does
([Tool Calls](../spec_topics/tool-calls.md), *`.theta` callables take their
callee `params:` as already-typed values, positionally*). The bare-object-literal
Pi-tool argument shape does **not** apply: `compact({ instructions: "…" })` is
a type mismatch, not an admitted spelling. Consequences that fall out of the
existing rules with no new machinery:

- `context_usage()` — zero parameters, zero arguments.
- `compact()` and `compact("…")` — the `instructions` parameter carries the
  default `""`, so both arities are admitted; the default-vs-non-default
  partition is the one `invoke(...)` already uses for arity.
- Arity and type errors are **parse-time**: the signature is fixed and known
  to the parser, so the callee is statically resolvable by construction —
  `theta/parse/invoke-arity-too-few` / `theta/parse/invoke-arity-too-many`
  and `theta/parse/tool-arg-type-mismatch`
  (`checkInvokeArgTypes`, `src/parser/invoke-diagnostics.ts`), the same
  rows a statically resolvable `.theta` callee draws.
- The **return type flows into the call site** statically, the way an
  inferred `.theta`-callee return type does; `let usage = context_usage()?`
  types `usage` as the inline object type in the Summary table, and
  `usage.percent` is `number`. Realised as a structural flow through the
  `try` arm (`StaticTypeInferenceDeps.runtimeToolSuccessTypes`,
  `src/parser/static-type-inference.ts`): `let x = <tool>()?` types `x` as the
  fixed success payload with structural member access; the bare un-`?`'d call
  is the nominal `Result<T, QueryError>` and defers direct member access; and
  `match`-arm bindings stay withheld while [RFC 0008](./0008-match-binding-type-inference.md)
  is draft.
- A call-site `with { cwd: … }` clause on a runtime tool is rejected by RFC
  0009's default-reject classification with
  `theta/parse/with-clause-in-process-callee` — the tool runs in-process and
  spawns nothing. No new code.

The return-type table in [Tool Calls](../spec_topics/tool-calls.md) gains a
third row:

| Callee kind | Return type |
|---|---|
| Runtime tool | `Result<T, QueryError>`, `T` the tool's fixed declared return type (an inline object type or `string`; see the Summary table) |

### 3. The three tools

**`compact(instructions: string = "")`.** Triggers manual compaction of the
invocation's conversation through the host's `ctx.compact({ customInstructions,
onComplete, onError })`, wrapped in a Promise and **awaited until `onComplete`
or `onError` fires** — the call is synchronous-looking like every other effect,
and the theta does not resume until the session is idle again. An empty or
whitespace-only `instructions` value maps to an absent `customInstructions`
(the TUI passes `undefined` for a bare `/compact`; this is the same mapping,
stated). `Ok` carries `{ summary, tokens_before, tokens_after }` from Pi's
`CompactionResult` (`summary`, `tokensBefore`, `estimatedTokensAfter`).
`estimatedTokensAfter` is optional at the type level; a completed compaction
whose result carries no estimate is `Err(CodeToolError { cause: "execution",
tool_name: "compact", message: "compaction completed but the host reported no
token estimate" })` — the `Ok` record never fabricates a field (unreachable
live at the build pin, whose manual path always computes the estimate; the
offline adapter cell drives it with a fake host). Every
host rejection — `Nothing to compact (session too small)`, `Already compacted`,
no model, an extension's `session_before_compact` cancel, a provider failure of
the summary call — is `Err(CodeToolError { cause: "execution", tool_name:
"compact", message: <host message> })`, the message coerced and truncated per
the existing execute-throw lowering
([Host interfaces core — Tool execution from theta code](../spec_topics/pi-integration-contract/host-interfaces-core.md#tool-execution-from-theta-code)).
The two benign refusals are **not** errors in the author's sense — the
postcondition ("the context is small") already holds — but they are surfaced
as `Err` rather than classified, because Pi throws them as unstructured
`Error` messages and a runtime that string-matched them would misclassify on
the first upstream rewording (§Open questions, item 1).

**`context_usage()`.** Reads `ctx.getContextUsage()`. A host value with a
known token count maps field-for-field (`tokens`, `contextWindow` →
`context_window`, `percent`), all three non-null. The host's two *unavailable*
arms are the `Err` arm, not `null` fields: a host `undefined` (no model
selected, or a model with no known context window) is
`Err(CodeToolError { cause: "execution", tool_name: "context_usage", message:
"context usage unavailable: no model selected or unknown context window" })`,
and the post-compaction `{ tokens: null, percent: null }` — the gauge is
unknown until the next assistant response carries usage — is
`Err(CodeToolError { cause: "execution", tool_name: "context_usage", message:
"context usage unknown until the next assistant response" })`. Neither arm
fabricates a zero. The consequence for authors is a discipline, stated in the
how-to: read the gauge after a query, not immediately after `compact`. A
loop that reads the gauge and compacts while it is over a threshold cannot
spin: its second iteration's `context_usage()?` exits through the `Err`
(§Resolved questions, item 5).

**`session_name(name: string)`.** Calls `pi.setSessionName(name)` on the
factory-captured `ExtensionAPI`, then returns `Ok(pi.getSessionName() ?? name)`
— the name as the host now reports it. An empty or whitespace-only `name` is
`Err(CodeToolError { cause: "validation", tool_name: "session_name", … })`,
mirroring RFC 0009's empty-`cwd` disposition: an author who wants a blank name
has written a mistake, not a request. In a `--no-session` child the effect is
in-memory only and the call still succeeds; the tool carries no mode gate.

### 4. Code-only: never model-facing

The tools are declared alongside model-facing tools but are excluded from
every model-facing vector, in both modes:

- **Prompt mode.** `computeActiveSetInstall(...)`'s `thetaCallableSetNames`
  excludes `runtime-tool` entries; the step-2 `pi.setActiveTools([...])`
  install vector inside `withActiveSetGate` never carries the name. The tools
  are not registered with `pi.registerTool`, so the name would be meaningless
  to Pi in any case; the exclusion is what keeps the install vector honest.
- **Subagent mode.** `callableSetPiToolNames(theta)` excludes `runtime-tool`
  entries, so the child's `--tools` allowlist never carries the name — the
  same filter `.theta` names already receive (bug 0218). A callable set whose
  only entries are runtime tools maps to `--no-tools`, as an all-`.theta` set
  does today.
- **Typed-query respond turn and repair follow-ups.** Same install vector;
  nothing to add.
- **`inferChildTrust`** (`src/runtime/subagent-launcher.ts`) reads the
  host-tool half only; runtime tools contribute nothing to the child's trust
  inference.

This is a **carve-out to FRNT-2**, stated in FRNT-2's own text: a runtime tool
is a unified *declaration* in the sense that one `tools:` entry governs it,
but its reach is code-only by definition. It is the mirror image of RFC 0010's
`theta_progress`, whose model-side reach is a documented feature; the two
paragraphs sit next to each other so the asymmetry is visible.

### 5. Dispatch — direct `execute` against the retained host handles

A runtime tool dispatches through a direct `execute`, the host-built-in arm of
code-side dispatch, never through PIC-64 host-loop dispatch:

- `#classifyCall` (`src/extension/production-theta-producer.ts`) gains a
  third verdict, `"runtime-tool"`, routing to a runtime-owned `execute` table
  keyed by the three names.
- The adapters bind the **composition-scope** `ExtensionContext` and the
  **factory-captured** `ExtensionAPI` on `Pick`-narrowed structural carriers
  (`SessionControlCtx` / `SessionControlPi`,
  `src/runtime/session-control-tools.ts`), threaded as producer input from the
  composition root (`createProductionProducerDeps`,
  `src/extension/production-composition.ts`) — the same capture discipline the
  built-in arm (`resolvePiTool`) and `createProductionHostLoopDispatch` already
  use, and never a stored bare `ExtensionAPI` non-parameter carrier. No
  per-mode override object exists in the runtime; the spec's override table is
  member-forwarding prose, and cancellation rides the dispatch race against
  `thetaAbort.signal`, not a substituted `ctx.signal`. `session_name` reads the
  `pi` carrier for `setSessionName` / `getSessionName`.
- **Both modes, one path.** In prompt mode the retained handle is the user
  session's slash-handler context, so the tools address the user's live
  conversation — which *is* the theta's conversation in prompt mode. In a
  subagent-root child the child dispatched the root theta by slash too, so the
  retained handle is the child's own, and the tools address the child's
  private `--no-session` session. The parent's stdout envelope scan ignores
  the child's extra `compaction_start` / `compaction_end` JSON events
  ([Subagent — PIC-59](../spec_topics/pi-integration-contract/subagent.md#pic-59)
  ignores every non-reserved-key line).
- The existing per-call machinery applies unchanged: the swallowing handler
  attached at construction (`guardToolExecutePromise`,
  `src/runtime/tool-call-swallowing-handler.ts`) and the late-settlement
  discard rules
  ([Cancellation — CNCL-1..3](../spec_topics/cancellation.md#cncl-1)). No
  `theta-direct:` tool-call id is minted: the host members take none
  (Implementation record).

**Load-time host check.** At theta load, a declared runtime tool whose host
member is absent — `typeof ctx.compact !== "function"`,
`typeof ctx.getContextUsage !== "function"`, or `pi.setSessionName` /
`pi.getSessionName` missing — refuses the theta with
`theta/load/session-tool-unavailable` (§New diagnostics). This is the
runtime-tool analogue of PIC-64 rung 3 for extension tools: a precise refusal,
never a silent no-op, on a host that lacks the surface (an Oh-My-Pi-style
host). On Pi at or above the floor the members are present and the check is
inert.

### 6. Isolated bodies — `par for` rejected, `subagent fn` admitted

A runtime tool addresses the **conversation the calling code owns**. Two body
kinds needed a ruling:

- a `par for` body severs its link to the enclosing conversation by design
  (`theta/parse/par-query-in-body`: "a conversation is a linear transcript;
  concurrent `@` queries against it have no defined interleaving"). A
  `compact()` racing a sibling iteration's work — or a second `compact()`
  whose `await this.abort()` cancels the first — is the same class of
  undefined interleaving. **Rejected.**
- a `subagent fn` body, after RFC 0012 §10, is the root invocation of its
  **own child process** with its own host session
  ([Functions — FN-6](../spec_topics/functions.md#fn-6) as amended there).
  Inside it the three tools address that session — `compact()` compacts the
  body's conversation, exactly as it does for a `.theta` callee. **Admitted.**
  (Before RFC 0012 the body ran in-process against a private `complete()`
  conversation with no session to compact, and acting on "the session" would
  have hit the enclosing theta's — the reason this RFC is sequenced after
  0012; Decision log, D2.)

Rule: a code-side call to a runtime tool anywhere inside a `par for` body is
the parse error `theta/parse/session-tool-in-isolated-body`, judged at parse by the
shadowing-aware lexical call-site walk (`checkLexicalCallSites`,
`src/parser/theta-document.ts`) against the frontmatter-derived runtime-tool
map — extensionally identical to the frozen callable set's `runtime-tool`
entries for every registered theta — so a renamed entry (`compact as c`) is
caught by resolution, not by spelling, and the committed-fixture parse gate
exercises the check. (The RFC 0009 `with`-clause pass iterates a flat
pre-collected call list that carries no `par for` context and descends into
`fn` bodies, so it can host neither the body scoping nor the plain-`fn`
exemption.) All three tools are covered —
`context_usage` and `session_name` have no interleaving hazard, but "a `par
for` body has no enclosing conversation to address" is one rule, and admitting
the read alone would make the body's semantics differ from the enclosing
theta's for the same spelling. A plain `fn` body is not isolated (it runs in
the enclosing process against the enclosing session) and is admitted, as is a
`subagent fn` body. The runtime keeps a fail-closed backstop for the path the
static walk cannot see — a plain `fn` that calls a runtime tool and is itself
called from a `par for` body: the dispatch refuses with
`Err(CodeToolError { cause: "execution", message: "session-control tool
'<name>' is not available inside a par for body" })`, mirroring
`checkExtensionToolReachability`'s static-check-plus-runtime-floor pattern.
Inside a `subagent fn` body the calls run in the body's child process, where
no `par for` context of the *parent* is visible; a `par for` written inside
the body is judged by the same rule within that child.

### 7. Cancellation and concurrency

- **Cancellation (Operator decision 2026-09-16 — Decision log, D3).** A theta
  abort mid-`compact()` surfaces `Err(CodeToolError { cause: "cancelled" })`
  at the tool-call checkpoint at once — the dispatch races the adapter
  Promise against `thetaAbort.signal` — and invokes NO host abort: at the
  build pin no extension-API path aborts a manual compaction
  (`AgentSession.abort()` does not call `abortCompaction()`;
  `abortCompaction` is not an `ExtensionContext` member; `CompactOptions`
  carries no signal), and theta's raw `ctx.abort()` teardown listener is
  attached only during a driven query turn, which `compact()` never
  overlaps. The host compaction is NOT torn down: it completes
  (`onComplete`) or fails (`onError`) in the background, and that late
  settlement — of either kind — is discarded (CNCL-1..3). A compaction
  entry MAY therefore land on the driven session after the theta reported
  cancelled: a documented cancellation cost, user-visible in the TUI, where
  the user's Escape still aborts the running compaction. In a subagent-root
  child the parent's cancellation kills the child process
  ([Subagent — PIC-66](../spec_topics/pi-integration-contract/subagent.md#pic-66));
  the compaction dies with it. (§Upstream asks item 4 records the missing
  host surface.)
- **Concurrency.** With isolated bodies rejected (§6), the remaining in-process
  concurrency sources cannot reach a runtime tool: prompt-mode bodies are
  sequential ([Conversation drive — PIC-2](../spec_topics/pi-integration-contract/conversation-drive.md#pic-2)),
  and model-driven parallel tool calls never see the tool (§4). No new mutex.
- **Auto-compaction stays enabled.** Pi's threshold compaction still runs. Its
  timing relative to a theta's `compact()` is deterministic from the theta's
  view: the prompt-mode driver's settle phase waits for `isIdle`, which is
  false while auto-compaction runs, so a `compact()` issued after a query
  either compacts or observes `Already compacted`. Disabling auto-compaction
  for a phase is not available on the extension API (§Upstream asks).

### 8. Co-change discharged by exclusion (bug 0478)

Shipping `compact` makes the compacted-session message shape routine, and the
`AgentMessage[]` consumers are already total over it: the binder's closed-set
exclusion (bug 0478, fixed 0.474.0, human-ruled EXCLUDE) drops
`compactionSummary` / `branchSummary` / `bashExecution` before the truncation
walk with the closed role-tag set and every BNDR-7 rendering byte unchanged
(`isTranscriptMessage`, `src/binder/compact-transcript.ts`, applied pre-grouping
by `src/binder/session-context-walk.ts`); the prompt-mode trailing-turn
extraction (`extractTrailingTurnText`, `src/runtime/conversation-drive.ts`)
anchors on the last `user` message and is total over a summary-led list; the
per-turn settle probe (`turnSliceSince`,
`src/extension/production-theta-producer.ts`) reads a `turnStart` index left
above the list length by a mid-flight compaction as un-opened, expiring loudly
per PIC-70; and the leading-`user`-message presupposition text
([Host prerequisites](../spec_topics/pi-integration-contract/host-prerequisites.md#messages-leading-user-message-presupposition))
already records the compacted shape and why the exclusion preserves the
biconditional. Rendering the summaries in the compact transcript stays the
deferred upgrade recorded at Future Considerations — Surface extensions. This
RFC adds witnesses, not arms: exclusion-is-total cells over a compaction-led
message list (binder walk, trailing-turn extraction, per-turn settle probe),
plus one recorded-audit sentence on host-prerequisites.md and one
handled-by-exclusion sentence on binder-model-and-context.md — no normative
change on either page.

## Alternatives considered

- **Bare intrinsics, always in scope (`compact()` with no `tools:` entry).**
  Rejected on GOV-15. Reserving the three names as keywords breaks every
  1.0.0-clean file that uses them as identifiers; leaving them unreserved
  forces either silent shadowing by a same-named `fn` / `let` / import
  (contrary to the corpus's collision-refusal posture,
  `theta/load/tool-name-collision`) or a collision error that is itself a
  GOV-15 break. Declaration through `tools:` costs one frontmatter token per
  tool and makes the theta's session-side effects operator-readable — the
  same argument PIC-64 makes for its permission model ("a theta calls only
  what its frontmatter declares").
- **`pi.registerTool` extension tools (the `theta_progress` pattern).**
  Rejected. A registered tool is globally model-visible (it appears in every
  session's tool list, as `theta_progress` does) and would need active-set
  suppression that fights the user's `/tools` state; and its code-side
  dispatch is PIC-64 host-loop dispatch, inside which `ctx.compact()`'s
  `await this.abort()` aborts the fabricated turn that is executing the tool.
- **`pi.sendUserMessage("/compact")`.** Not a mechanism: the text reaches the
  model as a prompt (§Raw material).
- **Prefixed canonical names (`theta_compact`, …).** Consistent with
  `theta_progress` and collision-proof against extension registries; set aside
  because the collision disposition already exists for host built-ins
  (precedence, §1) and the unprefixed names read as the built-ins they are.
  Authors who want the prefix write `compact as theta_compact`. Closed by
  Decision log D1 (bare names).
- **String returns for all three (the Pi-tool `Result<string, …>` shape).**
  Rejected for `context_usage`: theta has no JSON parsing, so a stringified
  gauge is unusable in a condition. Given one typed return, all three take
  the `.theta`-callable convention for consistency.
- **Bare-object-literal arguments (`compact({ instructions: "…" })`).** The
  Pi-tool argument shape exists because a Pi tool's input schema supplies the
  field names. A runtime tool's signature is theta-owned, so the
  `.theta`-callable convention — positional, typed, defaults admitted — is the
  one that already covers zero-argument calls.
- **Script-authored compaction (a one-shot `session_before_compact` handler
  returning the theta's own summary and cut point).** Deferred, not rejected:
  it needs this RFC's plumbing first and is the more theta-flavoured feature
  (zero model tokens, deterministic summary). Listed under §Open questions as
  the natural follow-on.

## Resolved questions

1. **Declared or implicit?** *Decision:* declared through `tools:`. GOV-15
   (§Alternatives, first bullet) and operator readability decide it; the call
   sites read identically either way.
2. **Awaited or fire-and-forget?** *Decision:* awaited to `onComplete` /
   `onError`. At the build pin `prompt()` does not gate on compaction (it gates
   on `isStreaming`), so the decision stands on the message-list-index reason
   alone: the prompt-mode driver records the turn-start index immediately
   before each send and requires the turn's own `user` entry at or after it
   ([Conversation drive — PIC-70](../spec_topics/pi-integration-contract/conversation-drive.md#pic-70));
   a compaction landing between record and settle shrinks the list below that
   index and the settle phase expires loudly. Awaiting `compact()` to
   completion is what keeps a theta-triggered compaction strictly between
   turns — and makes the tool's outcome a value the author can branch on.
3. **Mode gate on `compact`?** *Decision:* none. In prompt mode the driven
   user session is the theta's conversation; the TUI renders the compaction
   (status indicator, rebuilt transcript with the summary block) exactly as
   for a hand-typed `/compact`. SLSH-2's no-suppression stance and PIC-64's
   *Accepted cost* posture already cover user-visible artefacts of a
   prompt-mode theta's actions.
4. **Failure surface for the benign refusals.** *Decision for the draft:*
   `Err(CodeToolError { cause: "execution" })` carrying the host message
   verbatim. Widening `CodeToolError.cause` with a fifth member is a
   discriminator change: exhaustiveness is not statically checked, so a
   1.0.0-clean `match` that covers the four members without a wildcard would
   change from total to a runtime no-arm failure on the new value; classifying
   Pi's unstructured messages would tie theta to Pi's wording. Revisit if Pi exposes a structured "can compact" probe or a typed
   error (§Upstream asks).
5. **`context_usage` unavailability — `Err` or nullable fields?**
   *Decision:* `Err` for both host arms (`undefined`, and the post-compaction
   `tokens: null`); the `Ok` record has no nullable field. Two reasons. A
   fabricated zero would drive a fabricated compaction decision. And a
   nullable `percent` is unusable for the tool's primary purpose in today's
   language: ordering comparisons reject a union operand
   ([Expressions — Ordering comparisons](../spec_topics/expressions.md#ordering-comparisons),
   `theta/parse/non-orderable-operands`), optional chaining and `??` are
   unsupported, and `match`-binding types are not yet inferred from the
   scrutinee ([RFC 0008](./0008-match-binding-type-inference.md), draft) —
   so `if usage.percent > 60` would be unwritable without a typed helper
   `fn`. Modelling unavailability as the `Result` arm uses the one
   absence channel every theta already handles.
6. **`session_name` in a `--no-session` child.** *Decision:* admitted, in-memory
   effect. A mode gate would make the same spelling load in one mode and not
   the other for no safety gain.
7. **All three tools rejected in `par for` bodies, or only `compact`?**
   *Decision:* all three (§6). One rule; the read-only tools lose nothing a
   `par for` body could legitimately want, because the body has no enclosing
   conversation of its own to read.
8. **Bare or prefixed names?** *Decision (D1):* bare — `compact`,
   `context_usage`, `session_name` — with the host-built-in precedence rule
   over the registry snapshot (§1). The prefixed alternative and the
   loud-collision alternative are recorded under §Alternatives.
9. **`subagent fn` bodies.** *Decision (D2):* admitted, because this RFC is
   sequenced after RFC 0012, whose §10 gives every `subagent fn` body its own
   child session. `context_usage()` inside a body reads that session.

## Open questions

1. **Benign-refusal discriminability.** Should the draft's
   `cause: "execution"` for `Nothing to compact` / `Already compacted` become
   `Ok({ compacted: false, … })`? It would need either a structured signal
   from Pi or a pre-check the extension API does not offer
   (`prepareCompaction` is not exported from the package root and depends on
   the settings manager's `keepRecentTokens`). Decide after §Upstream asks are
   answered or refused.
2. **Script-authored compaction.** A `compact_with(summary: string)` variant
   that registers a one-shot `session_before_compact` handler returning
   `{ summary, firstKeptEntryId: preparation.firstKeptEntryId, tokensBefore }`
   — zero model tokens, deterministic. Also whether to expose the cut point
   (`firstKeptEntryId` = latest entry → a clean-slate compaction). Same
   plumbing as this RFC; separate RFC recommended.
3. **A `session_name()` getter.** Not proposed; `ctx.sessionManager.getSessionName()`
   is available to the runtime but no author use case has surfaced. Arity
   overloading is not a theta convention, so a getter would be a separate
   name.

## Decision log

Operator decisions on the questions this draft and its review left open
(D1, D2: 2026-09-15; D3: 2026-09-16, at the Phase 2A review gate); each is
folded into the section it names.

- **D1 — Names: bare.** `compact`, `context_usage`, `session_name`; host
  built-in precedence over the registry snapshot. (Resolved question 8; the
  former Open question 2.)
- **D2 — Sequencing: RFC 0012 first; `subagent fn` bodies admitted.** The
  isolated-body rule covers `par for` bodies only (§6, §New diagnostics,
  §Testing). (Resolved question 9; the former Open question 4 is closed by
  the same decision.)
- **D3 — Compaction cancellation: prompt cancel; the host compaction
  completes in the background (2026-09-16).** A theta abort mid-`compact()`
  reports `cause: "cancelled"` at the tool-call checkpoint immediately and
  aborts nothing host-side; the background settlement of either kind is
  discarded per CNCL-1..3, and a compaction entry may land on the driven
  session after the cancelled report (§7). Chosen over tearing the
  compaction down, which no extension-API path can do at the build pin:
  `AgentSession.abort()` does not call `abortCompaction()`, `abortCompaction`
  is not an `ExtensionContext` member, and `CompactOptions` carries no
  signal (§Upstream asks item 4).

## New diagnostics

Two new codes, drafted in the registry's column format
([`code-registry-load.md`](../spec_topics/diagnostics/code-registry-load.md),
[`code-registry-parse.md`](../spec_topics/diagnostics/code-registry-parse.md)).
Phase cells and Message templates become normative when the rows land
(DIAG-4); these are drafts.

| Code | Sev | Phase | Trigger | Spec rule | Hint | Message |
|---|---|---|---|---|---|---|
| `theta/load/session-tool-unavailable` | E | load | A `tools:` entry names a runtime tool (`compact`, `context_usage`, `session_name`, before any `as` rename) whose host member is absent on this host: `ctx.compact`, `ctx.getContextUsage`, or `pi.setSessionName` / `pi.getSessionName` is not a function. Present on Pi at or above the SDK floor; fires on hosts that lack the member. The theta does not register. | [Parameters and Frontmatter — `tools`](../spec_topics/frontmatter/frontmatter-fields-a.md#tools); [Host interfaces core — `ExtensionContext`](../spec_topics/pi-integration-contract/host-interfaces-core.md#extensioncontext-interface) | Remove the entry, or run under a Pi host that exposes the member. | `runtime tool '<name>' is unavailable on this host: '<member>' is not a function` |
| `theta/parse/session-tool-in-isolated-body` | E | parse | A bare-identifier call whose callee the frozen callable set classifies as a runtime tool (post-`as` name resolved to `compact` / `context_usage` / `session_name`) written anywhere inside a `par for` body, directly or in a nested block. A plain `fn` body and a `subagent fn` body are not isolated in this sense (the former runs against the enclosing session, the latter against its own child session after RFC 0012) and are admitted. A callee resolving to no binding keeps `theta/parse/unknown-identifier` alone. | [Tool Calls](../spec_topics/tool-calls.md) (runtime-tool paragraph); [Control flow — `par for`](../spec_topics/control-flow.md) | Move the call to the enclosing theta body, after the fan-out joins. | `'<name>' addresses the enclosing conversation and is not available inside a par for body` |

Reused, not minted: `theta/parse/invoke-arity-too-few` /
`theta/parse/invoke-arity-too-many` and `theta/parse/tool-arg-type-mismatch`
(fixed-signature arity and typing), `theta/parse/with-clause-in-process-callee`
(a call-site `with` clause), `theta/load/tool-name-collision` (an `as` target
or presented name colliding with a `fn` / import), `theta/load/unknown-tool`
(unchanged for names that are none of built-in, runtime tool, registry, or
`.theta`). Runtime registry: **zero new codes**
([DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2)); every
runtime failure is an existing `CodeToolError` arm.

## Specification impact

| Surface | Anchor | Change |
|---|---|---|
| `docs/spec_topics/frontmatter/frontmatter-fields-a.md` | [`#tools`](../spec_topics/frontmatter/frontmatter-fields-a.md#tools); [FRNT-2](../spec_topics/frontmatter/frontmatter-fields-a.md#frnt-2) | Third admitted entry kind (runtime-tool names); precedence sentence beside the host-built-in one; FRNT-2 carve-out paragraph placed next to the `theta_progress` self-report paragraph. |
| `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md` | Resolution snapshot | `ResolvedRuntimeTool` as a snapshot entry kind; dispatch through the runtime-owned `execute` table. |
| `docs/spec_topics/tool-calls.md` | TOOL-1 neighbourhood; return-type table; Failures | Runtime-tool paragraph (calling convention, fixed signatures, isolated-body rule); third return-type row; `CodeToolError` arms per tool. |
| `docs/spec_topics/pi-integration-contract/host-interfaces-core.md` | [`#extensioncontext-interface`](../spec_topics/pi-integration-contract/host-interfaces-core.md#extensioncontext-interface) | `compact` and `getContextUsage` rows flip from "not invoked by theta" to consumed, with the `onComplete` / `onError` Promise wrap pinned; `pi.setSessionName` / `pi.getSessionName` join the touched `ExtensionAPI` surface. The subagent-mode column's `getContextUsage` wording is corrected: the child reads its own handler context. |
| `docs/spec_topics/pi-integration-contract/tool-registration-lifetime.md` | step 2 install vector; [PIC-17](../spec_topics/pi-integration-contract/tool-registration-lifetime.md#pic-17) | `thetaCallableSetNames` excludes runtime-tool entries; fixture obligation asserts the exclusion. |
| `docs/spec_topics/pi-integration-contract/subagent.md` | `--tools` allowlist paragraph; [PIC-64](../spec_topics/pi-integration-contract/subagent.md#pic-64) resolution list | Runtime-tool names never enter `--tools` (beside the `.theta`-names rule); PIC-64's resolution list gains a "runtime tools — direct `execute`, never host-loop" bullet. |
| `docs/spec_topics/pi-integration-contract/host-prerequisites.md` | [leading-`user`-message guarantee](../spec_topics/pi-integration-contract/host-prerequisites.md#messages-leading-user-message-presupposition) | NOT widened (§8): the presupposition text already records the compacted-session shape. One recorded-audit sentence added — the exclusion runs before the walk, and `extractTrailingTurnText` / `turnSliceSince` are total over a summary-led list. |
| `docs/spec_topics/pi-integration-contract/capability-probe.md`, `capability-inventory-items.md` | Step 0; optional-capability class | The three host members join the inventory as load-time-probed, per-declaring-theta capabilities (not Step 0 gating): absence refuses only thetas that declare the tool. |
| `docs/spec_topics/binder/binder-model-and-context.md` | [Compact-transcript format](../spec_topics/binder/binder-model-and-context.md#compact-transcript-format-normative) | Witness-only (§8 discharged by exclusion): one sentence recording that a compaction-led list is handled by the bug 0478 pre-walk exclusion. No arm change; no BNDR-7 rendering byte and no closed role-tag set member moves. |
| `docs/spec_topics/control-flow.md` | `par for` body rules | Cross-reference the isolated-body rejection. |
| `docs/spec_topics/functions.md` | FN-6 (as amended by RFC 0012) | One sentence: the runtime tools inside a `subagent fn` body address the body's own child session; no rejection. |
| `docs/spec_topics/query/query-failure-and-repair.md` | `context_overflow` short-circuit rationale | The "conversation only grows" premise gains "unless the theta compacts" — the short-circuit itself is unchanged. |
| `docs/spec_topics/diagnostics/code-registry-load.md`, `code-registry-parse.md` | tables | Two new rows (§New diagnostics). |
| `docs/spec_topics/future-considerations/surface-extensions.md` | seam list | New deferred item: script-authored compaction (§Open questions 3). [GOV-31](../spec_topics/governance/req-id-prefix-table-active-b.md#gov-31): the seam count moves by one, so the aggregator literal on spec.md moves in the same edit. |
| `docs/reference/frontmatter.md`, `docs/reference/errors-and-results.md`, `docs/reference/type-system.md` | `tools`; `CodeToolError`; return types | Mirror the entry kind, the arms, and the fixed return types. |
| `docs/reference/coverage-matrix.md`, `docs/plan_topics/coverage-matrix.md` | reference-coverage table; code-keyed rows | Updated Spec-sources cells; one new `cka-<n>` row naming the two codes, the install-vector exclusions, and the isolated-body backstop. |
| `docs/how-to/compact-a-long-running-theta.md` (+ `docs/how-to/README.md`) | new page | The Summary example, worked; the `null`-gauge idiom; when to prefer a fresh session instead. |
| `docs/rfcs/0010-live-execution-visibility.md` | — | Cross-note: `theta_progress` is the model-facing-by-design counterpart of this RFC's code-only tools. Not a rewrite. |

## Implementation record

- C1 — §5's "synthesised `ExtensionContext` / per-mode override table" wording
  corrected: the adapters bind composition-scope handles on `Pick`-narrowed
  carriers (`SessionControlCtx` / `SessionControlPi`,
  `src/runtime/session-control-tools.ts`), threaded through
  `createProductionProducerDeps` (`src/extension/production-composition.ts`);
  no override object exists.
- C2 — §Raw material re-pinned to the build pin `~0.80.10`: `prompt()` gates on
  `isStreaming` (no compaction gate); `isIdle` TRUE during manual compaction,
  auto-compaction in-run; `CompactionResult.estimatedTokensAfter` optional →
  the pinned absent-estimate execution-`Err`; the host's `Compaction
  cancelled` throw arms are reachable only on paths that abort the compaction
  (the user's Escape, an extension `session_before_compact` cancel) — never
  from a theta abort (Option A, D3).
- C3 — corpus counts reconciled: RFC's 43 is tree-wide; the shipped gate
  constant `EXPECTED_SHIPPED_THETA` moves 41 → 42 with
  `docs/examples/compact-loop.theta`.
- C4 — the isolated-body check lives in `checkLexicalCallSites`
  (`src/parser/theta-document.ts`), not the RFC 0009 `with`-clause pass;
  renamed entries judged by resolution; plain-`fn` exemption is parse-error
  tolerance (nested `fn` is `theta/parse/nested-fn`); runtime backstop at the
  `par for` iteration host wrapper (`runParForIteration`,
  `src/runtime/statement-executor.ts`).
- C5 — live cells land in `tests/live/live-session-control.test.ts` (new H8a
  file); `tests/live/hardening/recent-rfc-live-drives.test.ts` untouched.
- C6 — return-type flow realised structurally through the `try` arm
  (`StaticTypeInferenceDeps.runtimeToolSuccessTypes`,
  `src/parser/static-type-inference.ts`; success types minted once through
  `letAnnotationToCompatType`, its second sanctioned TYPE-8 object-arm site);
  the bare call stays a nominal `Result<T, QueryError>`.
- D3 (Option A, operator decision 2026-09-16) — the §7 cancellation contract
  corrected from teardown to prompt-cancel: a theta abort mid-`compact()`
  invokes no host abort (no extension-API path aborts a manual compaction at
  the build pin), the background compaction's late settlement of either kind
  is discarded per CNCL-1..3, and a compaction entry may land after the
  cancelled report; tool-calls.md §Failures and the errors-and-results.md
  mirror carry the same correction; §Upstream asks item 4 filed
  (`abortCompaction` on `ExtensionContext` / `AbortSignal` on
  `CompactOptions`).
- L1 re-sequenced (review finding 2): the second `compact("")` follows the
  first with no intervening query — `Already compacted` fires only when the
  branch's LAST entry is a compaction (`prepareCompaction`,
  `dist/core/compaction/compaction.js`).
- L1 discriminator corrected (review finding 3): the stochastic shrink
  inequality `tokens_after < tokens_before` dropped from the live cell;
  deterministic observables only — the compaction entry, the theta-side
  positive-integer check interpolated as a `true` marker, the gauge
  `Err`/`Ok` arms, and `Already compacted`.
- §8 — discharged by exclusion (bug 0478, human-ruled EXCLUDE): no
  `[compaction]` / `[branch-summary]` arms, no BNDR-7 byte moves, no
  host-prerequisites widening; witnesses in
  `tests/session-control-transcript-readers.test.ts`, an audit sentence on
  host-prerequisites.md, a handled-by-exclusion sentence on
  binder-model-and-context.md.
- Spec amendments (slice 1) landed on: frontmatter-fields-a.md (third entry
  kind, precedence, probe, FRNT-2 code-only carve-out),
  frontmatter-fields-b-and-templates.md (runtime-tool snapshot entry),
  tool-calls.md (session-control section, return-type row, failure arms,
  script-authored-compaction seam blockquote), host-interfaces-core.md
  (consumed `compact` / `getContextUsage` rows, session-control carriers,
  subagent-mode `getContextUsage` correction), tool-registration-lifetime.md
  (PIC-17 step-2 exclusion + fixture obligation (c)), subagent.md (`--tools`
  runtime-tool exclusion, PIC-64 runtime-tools bullet),
  host-prerequisites.md (audit sentence), capability-probe.md +
  capability-inventory-items.md (session-control load-time probe class;
  `FACTORY_PROBED_SDK_MEMBERS` and `OPTIONAL_UI_CAPABILITIES` unchanged),
  control-flow.md (CTRL-4 cross-reference), functions.md (FN-6 admission
  sentence), query-failure-and-repair.md (premise qualification),
  binder-model-and-context.md (exclusion sentence), surface-extensions.md
  (script-authored-compaction item) + the GOV-31 seam literal 12 → 13
  (overview-and-orientation.md, GOV-31's own enumeration, the
  surface-extensions mirrors), reference mirrors (frontmatter.md,
  errors-and-results.md, type-system.md, coverage-matrix.md), plan
  coverage-matrix `cka-66` → `V24a`, RFC 0010 cross-note.
- Registry rows for `theta/load/session-tool-unavailable` and
  `theta/parse/session-tool-in-isolated-body` (+ reference/diagnostics.md
  mirrors) landed in the same commits as the tests asserting the codes
  and the implementation emitting them — the DIAG-2 corpus gate
  (`tests/registry-closed-set-corpus-gate.test.ts`) reconciles both
  directions, so neither could land alone.
- Fixed signatures ship as frozen data: every signature record and params
  list is `Object.freeze`d and `RUNTIME_TOOL_SIGNATURES` is a `ReadonlyMap`
  (`src/parser/runtime-tools.ts`) — the H2a module-level-mutable
  architectural gate (`tests/cross-cutting-gates.test.ts`) admits no mutable
  module-level binding; `isBareIdentifier` is exported from
  `src/parser/callable-set.ts` for reuse.
- Runtime-tool resolution lives inside `resolveEntry`
  (`src/parser/callable-set.ts`), ahead of `deps.resolvePiTool` — precedence
  by arm order, not a separate resolver; the load probe is
  `checkSessionToolAvailability` (`src/extension/production-composition.ts`)
  with `continue`-based un-registration; `callableSetPiToolNames` and
  `computeActiveSetInstall` needed no change — their guards are
  `kind === "pi-tool"`, so the §4 exclusions hold by construction, witnessed
  by cells X1–X4 (`tests/session-control-callable-set.test.ts`).
- Seam sheet §5.1 ("lexical layer unchanged") was wrong: `checkLexicalCallSites`
  (`src/parser/theta-document.ts`) now exempts resolved runtime tools from
  the Pi-tool bare-object-literal shape check — positional arguments are the
  admitted spelling — and the isolated-body check rides the same walk on an
  `insideParFor` flag that an `fn` body resets.
- `ToolCallCalleeKind` widened with `"runtime-tool"`
  (`src/runtime/tool-call.ts`): `checkToolCallArguments` step 3 fires for it,
  steps 2/4 stay pi-tool-scoped; the compose-pass checks are
  `checkRuntimeToolCallSurface` (`src/extension/invoke-static-checks.ts`);
  `#memberType` (`src/parser/static-type-inference.ts`) gained an
  object-receiver arm so `usage.percent` resolves after the try-arm unwrap.
- Dispatch: `sessionControlHosts { ctx, piHandle }` rides
  `ProductionProducerInput` (`src/extension/production-theta-producer.ts`),
  threaded from `createProductionProducerDeps`
  (`src/extension/production-composition.ts`); `#resolveRuntimeToolCall`
  evaluates arguments positionally, binds the `instructions` default, applies
  the runtime argument net (`Err(cause: "validation")`, message
  `argument '<param>' must be a string`), and dispatches the adapters under
  `guardToolExecutePromise` — without a `theta-direct:` tool-call id, which
  the draft's §5 listed and which nothing consumes (the host members take
  none; review round 3 removed the dead mints); the executor arm
  (`src/runtime/effectful-statement-host.ts`) races the adapter Promise with
  `awaitToolSettlementOrAbort` on the theta abort signal (Option A — no host
  abort), and `awaitToolSettlementOrAbort`
  (`src/runtime/tool-call-off-surface.ts`) is generalised over its settlement
  type; `resolveRuntimeToolCall` is conditionally wired — absent hosts fall
  through to the fail-closed `unknown_tool` carrier (cell D15); the par-for
  backstop lives in `runParForIteration`'s iteration-host `runEffect` wrapper
  (`src/runtime/statement-executor.ts`) and yields a flat `Err` element; the
  adapter parameter is named `piHandle`, because a bare `pi` parameter not
  typed `ExtensionAPI` is an `off-canonical-annotation-pi` shape under the
  inventory-closure audit (`src/extension/inventory-closure-audit.ts`).
- The draft Summary example iterated `plan.split("\n")` directly, which does
  not parse: the static pass's `method-call` arm
  (`src/parser/static-type-inference.ts`) mints an unresolvable nominal (no
  stdlib method return-type table exists), so `checkForIterand`
  (`src/parser/control-flow.ts`) emits `theta/parse/non-array-iterand`. The
  example above now binds `let waves: array<string> = plan.split("\n")` and
  iterates `waves`, matching the shipped `docs/examples/compact-loop.theta`;
  a stdlib method return-type table is a pre-existing static-layer gap, out
  of scope here.
- Cell fixtures corrected during implementation: parse cell I3 uses a
  `let`-initialiser block site because a bare `{ … }` in statement position
  is an object literal (bug 0082; `tests/session-control-parse.test.ts`);
  dispatch cell D14 supplies fake `sessionControlHosts` per the sheet
  (`tests/session-control-dispatch.test.ts`).
- Committed-corpus census pins moved with the new example:
  `EXPECTED_SHIPPED_THETA` 41 → 42
  (`tests/committed-fixture-parse-gate.test.ts`), and the bug 0122 / 0124 /
  0158 / 0195 census literals re-derived over the 46-file corpus — the
  fixture draws none of the gated codes.
- `package-lock.json` carries a stale `0.461.0` version literal predating
  this RFC; untouched.
- The live harness (`tests/live/harness.ts`) gained an additive
  `settingsManager` option (L1 boots `SettingsManager.inMemory` with a low
  `keepRecentTokens`); the live cells are L1–L3 in
  `tests/live/live-session-control.test.ts` (C5).
- The first live run of L1/L3 surfaced a runtime gap no offline cell had
  reached: `preEvaluateToolArgs` (`src/runtime/statement-executor.ts`)
  skipped the Pi-tool object-literal shape gate only for a
  `"theta-callable"` verdict, so `compact("…")` / `session_name("…")` —
  the positional spelling §2 pins — threw `PiToolArgShapeDefectError`
  (`src/runtime/tool-call.ts`) and the theta aborted; a zero-argument
  `compact()` (L2) never reached the gate. Fixed by widening the skip to the
  `"runtime-tool"` verdict, whose dispatch arm evaluates its own positional
  arguments; L1/L3 keep the positional spelling as the standing witness.
- Cell D11 (runtime argument net) launders the non-string value through the
  §2 object-literal spelling `compact({ instructions: "x" })` — the static
  pass withholds a type for an object literal (`collectProvableArgTypes`,
  `src/extension/invoke-static-checks.ts`), so the bound value reaches
  `#resolveRuntimeToolCall` and draws `Err(cause: "validation",
  "argument 'instructions' must be a string")` without the host being
  called.
- Live verification (claude-sonnet-5): L1 (compaction entry lands;
  immediate second `compact("")` → `Already compacted`; `context_usage()`
  `Err` until the next assistant response, then `Ok`), L2 (`Nothing to
  compact (session too small)` round-trips a spawned child's envelope), L3
  (`session_name` on the settled `SessionManager`) green; red-direction
  proofs: a no-op host call reds L1's compaction-entry assertion, a disabled
  isolated-body emission reds parse cells I1–I4.
- Review round 3 caught a GOV-15 break in the first realisation of the
  return-type flow: `#memberType`'s object-receiver arm
  (`src/parser/static-type-inference.ts`) resolved members on ANY structural
  object type — including the one `letAnnotationToCompatType` mints for an
  annotated inline-object `let` in a file declaring no runtime tool — so
  `let x: { a: integer } = f()` followed by `x.a > "s"` gained a new
  `theta/parse/non-orderable-operands`. The arm is now gated on a non-empty
  runtime-tool success-type map (an identity set against the map's values
  was infeasible: the type-layer `let` arm copies the inferred type), and
  two cells in `tests/session-control-static-checks.test.ts` pin the
  runtime-tool-free fixture as diagnostic-stable and the declaring twin as
  drawing the diagnostic. Residual, accepted: in a file that DOES declare a
  runtime tool, an unrelated annotated inline-object `let` also resolves its
  members structurally and can draw the same truthful diagnostics — such a
  file is outside GOV-15's input set, and the resolution follows the
  member-access rule of [Expressions](../spec_topics/expressions.md).
- Round 3 also removed the unconsumed `theta-direct:` id mints from
  `#resolveRuntimeToolCall`, replaced its silent `compact` default with the
  fail-closed `unknown_tool` carrier, made `executeCompactTool` forward
  non-blank `instructions` verbatim (only blank / whitespace maps to an
  absent `customInstructions`; cell D1b), and added the sheet's V6 witness:
  a `subagent fn … with { tools: "compact" }` override launches its child
  with `--no-tools`.
- Final gates on the shipped tree (`c4fa4369`): tsc and lint clean; offline
  680 files / 11471 tests green; full live suite (claude-sonnet-5) 152 files
  / 279 tests, 275 green — the three reds in
  `tests/live/live-production-acceptance.test.ts` (bug 0079(b) / 0114 / 0116
  cells) predate this RFC (their fixtures expect the pre-bug-0476 bare
  `theta/parse/interpolated-result` framing) and one H9a `pi -p` spawn
  timed out under full-suite load and passed in isolation.

## Testing strategy

Offline (default gate, provider-free):

- **Callable-set resolution** (`tests/session-control-callable-set.test.ts`):
  each name resolves to `kind: "runtime-tool"`; `as` renames apply;
  a same-name `fn` / import draws `theta/load/tool-name-collision`; a registry
  tool registered under `compact` is shadowed (precedence); the host-member
  probe absent → `theta/load/session-tool-unavailable` and the theta does not
  register; a theta that declares none of the three is byte-identical in
  diagnostics and snapshot to today.
- **Vectors** (cells X1–X4, `tests/session-control-callable-set.test.ts`):
  `computeActiveSetInstall` output and `callableSetPiToolNames` output
  exclude runtime-tool entries; an all-runtime-tool callable set maps
  to `--no-tools` in the launcher argv (`tests/subagent-child-launch.test.ts`
  fake-launcher pattern); `inferChildTrust` input unchanged.
- **SDK inventory** (`tests/session-control-sdk-inventory.test.ts`): the four
  new `SDK_SURFACE_INVENTORY` rows (`ctx.compact`, `ctx.getContextUsage`,
  `pi.setSessionName`, `pi.getSessionName`); `FACTORY_PROBED_SDK_MEMBERS` and
  the capability-count pins unchanged.
- **Parser / checker** (`tests/session-control-parse.test.ts`,
  `tests/session-control-static-checks.test.ts`): arity and type cells for
  each signature
  (`compact()`, `compact("x")`, `compact(1)`, `compact("a", "b")`,
  `context_usage("x")`, `session_name()`), return-type flow into `let` and
  member access (`usage.percent` typed `number`), the isolated-body
  rejection for `par for` bodies including a renamed entry and a nested
  block, a plain `fn` body and a `subagent fn` body admitted, a call-site
  `with` clause → `theta/parse/with-clause-in-process-callee`.
- **Execute adapters** (`tests/session-control-adapters.test.ts`; dispatch
  cells in `tests/session-control-dispatch.test.ts`) with a fake `ctx` /
  `pi`: `compact` → `onComplete`
  maps to the `Ok` record; `onError` maps to `Err(cause: "execution")`
  carrying the message; abort mid-flight → `Err(cause: "cancelled")` and a
  late `onComplete` discarded without an `unhandledRejection`; whitespace
  instructions → `customInstructions: undefined`. `context_usage` →
  `undefined` → `Err` (no-model message); `{ tokens: null, percent: null }`
  → `Err` (post-compaction message); a defined gauge → `Ok` with the field
  renames and all three fields non-null. `session_name` → `setSessionName` called once, `Ok` is the
  read-back, `""` → `Err(cause: "validation")`. Runtime isolated-body
  backstop → `Err(cause: "execution")` with the pinned message.
- **Transcript readers (§8, witnesses):** exclusion-is-total cells over a
  compaction-led message list (`tests/session-control-transcript-readers.test.ts`,
  green at birth, stated in its header): `extractTrailingTurnText` anchors on
  the last `user` message and yields `""` on a summary-only list;
  `turnSliceSince` reads a list shorter than its `fromIndex` as un-opened (the
  PIC-70 loud-expiry input); the binder walk plus `renderCompactTranscript`
  are byte-identical with and without the leading summary (the bug 0478 cells
  re-pinned, cited not duplicated).
- **Committed-fixture gate:** the how-to example ships as a committed
  `.theta` (`docs/examples/compact-loop.theta`); `EXPECTED_SHIPPED_THETA` in
  `tests/committed-fixture-parse-gate.test.ts` moves 41 → 42 in the same
  commit, and the gate is parse-only, so the example must be clean under the
  new parse checks too.
- **GOV-15 witness:** every committed `.theta` / `.thetalib` parses to the
  same diagnostic sequence before and after (the corpus declares none of the
  three).

Live (`npm run test:live` — the tools touch live-exercised surfaces, so the
run is mandatory per `AGENTS.md`):

- **H8a, prompt mode:** a theta issues fixed-pair arithmetic queries under a
  harness-lowered `keepRecentTokens`, then `compact(...)`, then a second
  `compact("")` immediately after — no intervening query, so the branch's
  last entry is still the compaction entry and the host refuses
  `Already compacted` (`prepareCompaction` keys the refusal on the last
  entry alone) — then reads `context_usage()` (the post-compaction `Err`),
  then one marker query, then `context_usage()` again (`Ok`). Observables,
  all deterministic: a `compaction` entry exists on the settled in-memory
  `SessionManager`; `tokens_before` and `tokens_after` are positive
  integers, checked theta-side and interpolated into the marker query text
  as a `true` marker (the shrink inequality `tokens_after < tokens_before`
  is NOT asserted — with a tiny `keepRecentTokens` the summary routinely
  outweighs the dropped turns, so shrink is stochastic); the
  `Already compacted` message and both gauge arms ride the same
  interpolated markers; no `theta-system-note` err framing; no
  verbatim-echo demands (task-framed arithmetic only).
- **H8a, subagent mode:** a short subagent child calls `compact()` and
  returns the `Err` message through the typed envelope; assert the
  `Nothing to compact (session too small)` text round-trips and the child
  exits cleanly (the compaction events on its JSON stream are ignored by the
  envelope scan). The harness carries the child pins
  ([`AGENTS.md#subagent-child-pins`](../../AGENTS.md#subagent-child-pins)).
- **`session_name`:** prompt-mode drive sets a name; assert
  `sessionManager.getSessionName()` on the settled session.
- **Negative proof (both directions):** once, locally route `compact` through
  a no-op `execute`; confirm the compaction-entry assertion reds with the
  expected signature; restore and confirm green.

## Compatibility and versioning

- **Sequenced after RFC 0012** (D2). Implemented earlier, `compact()` inside
  a `subagent fn` body would compact the enclosing session; the admission in
  §6 is correct only once fn bodies own a child session.
- **Additive under GOV-15.** A file that loads cleanly under theta 1.0.0
  declares none of the three names in `tools:` (each would have been
  `theta/load/unknown-tool`, severity E) and is therefore outside the change's
  input set; its identifiers named `compact` / `context_usage` /
  `session_name` stay ordinary identifiers. The one theoretical exposure — a
  1.0.0-clean theta declaring an *extension* tool registered under one of the
  three names, now shadowed by precedence — is the disposition host built-ins
  already carry and is recorded under the diagnostic-registry carve-out's
  post-hoc input set.
- **No grammar or lexical change.** Bare-identifier calls, positional
  arguments, defaults and `Result` returns are existing productions; the
  reserved-keyword set is untouched.
- Older extension versions reject the declaration with
  `theta/load/unknown-tool` — the correct fail-closed posture; the CHANGELOG
  entry names the minimum version.
- **Pi SDK pin unchanged.** All four host members predate the `>=0.80.8`
  floor; the SDK surface inventory (`SDK_SURFACE_INVENTORY`,
  `src/extension/sdk-inventory.ts`) gains `ctx.compact`,
  `ctx.getContextUsage`, `pi.setSessionName`, `pi.getSessionName` rows so a
  future Pi minor that removes one surfaces at the build, and
  `FACTORY_PROBED_SDK_MEMBERS` (`src/extension/capability-probe.ts`) is
  **not** widened — the members gate declaring thetas, not the factory.
- theta's own bump: `package.json` version + a `CHANGELOG.md` section, per the
  repo's middle-digit convention. Version literals in amended spec prose
  follow GOV-19: a theta 1.x design-scope addition.

## Upstream asks (non-blocking)

Filed as suggestions against `pi-mono`; none blocks this RFC.

1. A structured pre-check or typed error for manual compaction (a
   `canCompact()` probe, or `AgentSession.compact` throwing a named error
   class for `Nothing to compact` / `Already compacted`), so the benign
   refusals can become `Ok({ compacted: false })` without message matching
   (§Open questions 1).
2. `set_auto_compaction` on the extension API (today RPC-only), so a theta can
   suspend threshold compaction during a phase and compact deterministically
   at its boundary.
3. `pi.getToolDefinition` — PIC-64 rung 1 — is unaffected by this RFC but
   remains the request that would retire host-loop dispatch for extension
   tools generally.
4. `abortCompaction` on `ExtensionContext`, or an `AbortSignal` on
   `CompactOptions`, so an extension can end a manual compaction it started.
   Today only `AgentSession.dispose()` and the interactive TUI's Escape
   handler reach `abortCompaction()`, so a theta abort mid-`compact()`
   cannot tear the host compaction down and instead discards its late
   settlement (§7, Decision log D3).

## Prior art in this repository

- RFC 0010 — `theta_progress`, the extension-registered, model-facing-by-design
  author tool; this RFC's tools are its code-only counterpart and reuse its
  factory-ordering and clamp discipline where they render anything (they do
  not).
- RFC 0009 — the fail-closed default-reject classification at the static
  callee pass, reused for the isolated-body rule; the empty-string
  `validation` disposition, reused for `session_name("")`.
- RFC 0003 — `par for`'s isolation-only body and `theta/parse/par-query-in-body`,
  the sibling of `theta/parse/session-tool-in-isolated-body`.
- RFC 0001 — `subagent fn` (FN-6), whose bodies own a child session once RFC
  0012 lands and therefore admit the tools (§6).
- Bug 0001 / PIC-64 — the code-side dispatch ladder and its permission model,
  whose "declared in frontmatter, readable by any operator" rationale this
  RFC adopts for opting in.
- Bug 0218 — `.theta` names filtered from the child `--tools` allowlist; the
  runtime-tool filter sits beside it.
- [Host interfaces core — `ExtensionContext`](../spec_topics/pi-integration-contract/host-interfaces-core.md#extensioncontext-interface)
  — the inventory rows this RFC activates.
