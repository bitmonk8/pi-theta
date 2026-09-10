# RFC 0010 — Live execution visibility for running thetas

- **Status:** accepted (all ten decisions ratified 2026-09-09)
- **Scope:** runtime/extension observability surface; no grammar change. The
  one language-adjacent addition is an ordinarily-registered extension tool
  (`theta_progress`, layer L3), governed by
  [`../spec_topics/governance/release-version-naming.md`](../spec_topics/governance/release-version-naming.md).
- **Affects:** extension composition (a per-instance status bus and sinks),
  the checkpoint seam wiring, the operator-facing note delivery channel, the
  subagent stdout wire (L3), the settings key set, SLSH-2's privacy pin, docs
- **Sibling:** [RFC 0007](./0007-print-mode-observability.md) covers the
  headless *failure* surface; this RFC covers *live progress* in the TUI.
- **Sequencing:** after the 0469/0470/0471 regression pass (bug 0471 shipped
  0.465.0; bug 0469 stays open with its principled fix carried by this RFC's
  L1) and after [RFC 0009](./0009-per-call-subagent-cwd.md) (parallel fan-out
  multiplies the invisible-children problem this RFC fixes).

## Summary

A running theta renders nothing between its binder echo and its final note —
by spec, not by accident. This RFC adds an in-extension **ExecutionStatusBus**
fed by four existing-but-unused signals (the checkpoint seam, the child
`--mode json` stdout stream, the active-invocation registry, `par for` lane
lifecycle) and rendered through best-effort sinks: a footer heartbeat
(`ctx.ui.setStatus`), a collapsible invocation-tree widget
(`ctx.ui.setWidget`), and durable LLM-context-free milestones
(`pi.appendEntry`). An author-facing `theta_progress` tool (L3) adds opted-in
narrative, including self-reports from otherwise-private subagent workers over
a second reserved stdout key. Layers L0–L2 ship as one release and are this
RFC's implementation scope; L3 is a second release behind its own hold; L4 is
deferred to a follow-up RFC. Progress never rides `pi.sendMessage` — the
incident behind bug 0469 makes that a correctness constraint, and the entry
channel this design introduces doubles as that bug's principled fix.

## Motivation

A running theta is visually silent except at three moments: the binder echo
note at start, prompt-mode `@`-query streaming
([SLSH-2](../spec_topics/slash-invocation.md#slsh-2)), and the final
report/failure note. Everything else renders nothing — by spec:

- Code-side tool calls do **not** add a turn to the theta's conversation, do
  **not** consume model tokens, and do **not** appear in the conversation
  transcript ([Tool Calls — No conversation
  turn](../spec_topics/tool-calls.md)) — a `bash()`-heavy orchestrator is
  silent for its entire runtime.
- Subagent-mode callees run in child `pi` processes whose queries are
  "unobservable to the human operator by construction" — the second sentence of
  the subagent-mode paragraph under
  [SLSH-2](../spec_topics/slash-invocation.md#slsh-2), after the Edge-case
  bullets — so a `par for` fan-out of workers shows nothing for its whole
  duration (observed: 40 min – 2.5 h per fix cluster).
- No working indicator exists for a pending slash-command handler; pi's
  loader is tied to streaming turns.

Observed worst case (2026-09-08): a healthy `/quality-loop` run showed zero
output for 2.5 hours; distinguishing "working" from "hung" required
process-tree and file-mtime forensics.

## Incident-derived constraints (mandatory)

The overnight `/quality-loop` incident (2026-09-08 → 09) turned three design
preferences into hard requirements. Bugs
[0469](../bugs/0469-watcher-note-mid-tool-execution-breaks-tool-adjacency.md),
[0470](../bugs/0470-load-diagnostics-re-emit-without-dedup.md), and
[0471](../bugs/0471-non-theta-file-change-triggers-full-rescan.md) record the
evidence.

1. **Progress output MUST NOT be a custom *message*.** A `theta-system-note`
   emitted while a Pi tool call was in flight orphaned a `tool_result` and
   killed the run's closing report with a provider 400 (bug 0469). Pi replays
   every custom message as a `user`-role provider message
   ([Runtime event channel — custom-message
   persistence](../spec_topics/pi-integration-contract/runtime-event-channel.md#custom-message-context-entry-presupposition)),
   so any message-class emission at an uncontrolled moment can corrupt the
   session durably. Every sink in this design is therefore `pi.appendEntry`
   (durable, LLM-context-free) or a transient UI surface (`setStatus` /
   `setWidget` / `setWorkingMessage`) — **never** `pi.sendMessage`.
2. **Progress emission MUST be coalesced and rate-bounded — while the
   diagnostic channel MUST NOT be deduplicated.** 408 byte-identical warning
   notes accumulated in one session (~25k context tokens, bug 0470). The
   instinct to "dedup the notes" is spec-forbidden for *diagnostics*:
   [Diagnostics — Re-scan
   deduplication](../spec_topics/diagnostics/diagnostic-shape.md#re-scan-deduplication)
   pins "the renderer MUST NOT attempt to suppress duplicates" (why bug
   0470's dedup was reverted). Two consequences: (a) the storm is fixed at
   the *trigger* (bug 0471, shipped) and at the *channel* — moving
   operator-facing note classes to `pi.appendEntry` (§Proposal, L1) is a
   channel change, not a suppression, so it does not run afoul of the rule;
   (b) the progress surface is a *separate* channel from diagnostics, so its
   coalescing tick and emission bounds are free to collapse redundant updates
   — load-bearing there, unconstrained by the diagnostic rule.
3. **The entry channel this design needs is also bug 0469's principled fix.**
   Routing the operator-facing note classes (load diagnostics, structural,
   recovery) through `pi.appendEntry` + `pi.registerEntryRenderer` removes
   them from provider replay entirely. That machinery — plus the
   optional-capability degrade class (§Resolved questions, item 8) — is
   shared, so **L0–L2 carries the migration as its first increment** rather
   than duplicating it later.

## Raw material (verified pins)

The design is almost entirely assembly of existing, currently-unused signals.
Pins re-verified by the Phase 1 inventory; corrections from that pass are
folded in.

1. **Checkpoint seam**
   ([PIC-10](../spec_topics/pi-integration-contract/host-interfaces-services.md#pic-10)).
   `Checkpoint.before(kind, site)` is awaited before **every** effect — the
   five `CheckpointKind`s `loop-iter | query | tool-call | invoke |
   binder-call` — with the exact source site `{file, line, column}`
   (`Checkpoint`, `CheckpointKind`, `CheckpointSite`,
   `src/seams/checkpoint.ts`). The production implementation ignores the site
   (`before(kind, _site)`, `ProductionCheckpoint`,
   `src/seams/production-checkpoint.ts`). A decorator here yields per-effect
   "current line" telemetry with zero interpreter changes. Wiring nuance the
   decorator must preserve: `loop-iter` resolves on a macrotask turn, every
   other kind on the microtask queue (PIC-10's production-wiring rule).
2. **Child event stream, already delivered and dropped.** The parent's sole
   stdout consumer, `driveSubagentChild`
   (`src/runtime/subagent-json-driver.ts`), classifies each line via
   `classifyChildStdoutLine` (`src/runtime/subagent-envelope.ts`) and returns
   on `other-json`: pi's `--mode json` events — `turn_start`,
   `tool_execution_start`/`end` (tool name + args), `message_update`,
   `agent_end` (pi `docs/json.md`) — are read and deliberately ignored
   ([PIC-59](../spec_topics/pi-integration-contract/subagent.md#pic-59)
   stray-line tolerance). The line pump `makeLinePump` (`adaptChild`,
   `src/extension/production-subagent-host.ts`) already fans out to a
   listener `Set`, so a second `onStdoutLine` listener attaches with zero new
   I/O. A per-child live activity feed exists **in-process today** for
   depth-1 children (the common case).
3. **Structural state.** `ActiveInvocationRegistry`
   (`src/runtime/active-invocation-registry.ts`) holds the in-flight entries;
   the entry type is **closed** at exactly five members `{ thetaAbort,
   disposeBarrier, shutdownReason, theta, invocationId }` and doubles as the
   invoke-provenance ledger — a bus consumer observes it and MUST NOT extend
   it (Phase 1 correction: the design's "five-field entries … `thetaAbort`,
   …" elided `disposeBarrier` and `shutdownReason`, both load-bearing).
   `evalParFor`'s worker pool (`src/runtime/statement-executor.ts`; width
   clamped into `[1, PAR_FOR_THROTTLE]`) owns lane lifecycle.
4. **pi UI surfaces**, all present at the pinned SDK (v0.80.10,
   `dist/core/extensions/types.d.ts` in `@earendil-works/pi-coding-agent`):
   `ctx.ui.setStatus(key, text)`, `ctx.ui.setWorkingMessage(message?)`,
   `ctx.ui.setWidget(key, lines | component, options?)` (two overloads),
   `ctx.ui.setWorkingIndicator(options?)`, `ctx.hasUI`. The `ctx.hasUI`
   truth table is: TUI `true`, **RPC `true`**, `--mode json` `false`, `-p`
   `false` (pi `docs/extensions.md`, mode table) — RPC keeps UI surfaces;
   json and print are the no-UI regimes (Phase 1 correction to the design's
   "print/RPC degradation" pairing; §Resolved questions, item 9). The
   optional-capability class (item 8) protects against hosts older than the
   peer floor or divergent hosts, not against the pinned SDK.
5. **pi persistence duality.** `pi.sendMessage` custom messages enter LLM
   context on every later provider call (pin in constraint 1);
   `pi.appendEntry<T>(customType, data?)` +
   `pi.registerEntryRenderer(customType, renderer)` is durable TUI-only
   content — "Custom entries do not participate in LLM context" (the
   `registerEntryRenderer` doc comment; pi `docs/extensions.md`: "For durable
   TUI-only content that should not be sent to the LLM, use pi.appendEntry()
   with pi.registerEntryRenderer()."). Neither member is consumed anywhere in
   `src/` today, and no host-interfaces row documents them — the member rows
   in §Specification impact are new, not amendments. pi's docs state no
   registration-timing constraint for entry renderers (inventory gap): the
   conservative posture is factory-time registration beside the existing
   message-renderer registration.
6. **Additive wire seam.** Today the reserved-key set has exactly **one**
   member: `THETA_RESULT_KEY = "theta_result"`
   (`src/runtime/subagent-envelope.ts`); `classifyChildStdoutLine`
   distinguishes envelope vs `other-json` vs unparseable and nothing else. A
   `{"theta_progress": …}` stdout line already classifies `other-json` and is
   ignored by every shipped parent — backward-compatible by construction. The
   two-member reserved-key set is **minted by this RFC** (§Resolved
   questions, item 10), not an existing convention this RFC extends (Phase 1
   correction to the design's "reserved keys become a two-member set"
   phrasing, which read as if a slot existed).

## Proposal

One in-extension aggregator — the **ExecutionStatusBus** — with producers
feeding it and sinks rendering it. Every component is per-extension-instance:
constructed in `composeExtensionInstance` beside `activeInvocations` and the
shared `Clock`, threaded through `ExtensionInstanceWiring`
(`src/extension/production-composition.ts`), and torn down at
`session_shutdown` (repo rule: no globals/statics/singletons). Every sink is
best-effort — a UI failure must never perturb theta semantics (§Failure
containment).

```
producers                          bus                          sinks
─────────                          ───                          ─────
checkpoint decorator  ─┐                                     ┌─ footer heartbeat (setStatus)        L0
child event tap       ─┼──▶  ExecutionStatusBus  ──tick──▶   ├─ tree widget (setWidget)             L2
par-for lane hooks    ─┤     (tree of invocation             ├─ durable milestones (appendEntry)    L3
dispatch lifecycle    ─┤      nodes + lanes +                └─ headless stderr heartbeat (opt-in)  L4
progress tool (L3)    ─┤      counters)
child wire ingest     ─┘
```

### ExecutionStatusBus (L1)

- One node per active invocation: `{ invocationId, theta, startedAt, mode,
  currentEffect: {kind, site} | undefined, counters, parent?, lanes? }`.
  Children are discovered via the dispatch lifecycle (registry insert/remove)
  and invoke provenance; `par for` lanes are child slots `{ index, state:
  queued|running|done|err, startedAt }`.
- Per-child activity (from the tap): `{ turns, toolExecs, lastToolName?,
  lastEventAt }` — bounded fields only, never content (§Privacy, class 3).
- Change notification is **coalesced**: sinks re-render on a 200 ms tick
  scheduled through the injected `Clock` seam (the PIC-12 timer surface —
  never a bare global timer), drop-and-reschedule exactly as
  `ReloadDebouncer` (`src/extension/reload-debounce.ts`) already does against
  the same per-instance clock, and only when dirty.
- Memory bounded: nodes drop at invocation end (after a short linger for the
  widget's "done" flash); hard cap on tracked children per invocation.

### Checkpoint decorator (L1)

Wraps `ProductionCheckpoint`: `before(kind, site)` publishes
`(invocationId, kind, site)` to the bus synchronously, then delegates. Zero
semantic change — the seam is pinned "purely a test surface … no observable
behaviour" ([Cancellation — Race
semantics](../spec_topics/cancellation.md), final edge-case bullet);
the spec text takes the one-word widening to "test/telemetry surface"
(§Specification impact). The per-kind yield semantics (macrotask `loop-iter`,
microtask otherwise) are pinned by exact-tick tests and MUST survive the
wrapper unchanged. `loop-iter` events are throttled at the bus (they can be
hot).

### Child activity tap (L1)

A second consumer beside the envelope scan: one more `onStdoutLine` listener
on the same line pump (no new I/O). It parse-attempts each non-envelope line;
on JSON with a known `type` it updates the child's bounded counters.
Defensive posture: size-capped lines; **no per-line diagnostics** — the
emission-bound discipline established at the drive site (bug 0086 §Fix
disposition 1, cited at `driveSubagentChild`) binds the tap too; the drive
listener's lines are never consumed or detached by the tap. Depth-1 children
only until L4. At L3 the tap additionally recognises the `theta_progress`
reserved key in its **own** parse — `classifyChildStdoutLine`'s
envelope-vs-not classification is not widened (its behaviour for
`theta_result`-absent lines is test-pinned).

### Sinks (L0, L2, L3)

- **L0 footer heartbeat** — `ctx.ui.setStatus("theta", …)`:

  ```
  θ /quality-loop 14m · tool-call @ quality-loop.theta:37 (2m) · children 3▶ 2✓
  ```

  theta, elapsed, current effect kind @ theta source site + age, child lane
  summary (the parent-regime producer set is the closed checkpoint payload
  `(invocationId, kind, site)` — tool *names* enter the telemetry class only
  where a producer carries them: the child tap's `tool_execution_start` and,
  at L3, self-reports). Also
  `ctx.ui.setWorkingMessage` while a driven prompt-mode turn is streaming; no
  `setWorkingIndicator` frames (§Resolved questions, item 5).
- **L2 tree widget** — `ctx.ui.setWidget`, placement `belowEditor`, height
  budget 6 lines with overflow elision (item 2). One line per active
  invocation node plus the focused node's current source site (`file:line`):

  ```
  /quality-loop › par for [#3 ▶ lens_d2_cruft t7 bash 2m14s | #5 ▶ … | 2✓ 1…] › fix …:214
  ```

  View shape is adjusted by a registered command `/theta-status
  off|min|tree` — **live-instance only, session-scoped, never persisted**
  (item 7). This is the first non-theta-derived `pi.registerCommand` call in
  the codebase (the only existing call expression is the per-theta loop in
  `src/extension/factory.ts`); it joins the own-registration ledger, and the
  collision pass reserves the name against theta stems.
- **Settings key** — `theta.progress: "off" | "counts" | "names"` (default
  `names`, item 1) is the durable default, hand-edited like every existing
  key: it joins `ThetasSettings` / `THETAS_SCALAR_KEYS` / `isScalarKeyValid`
  (`src/discovery/settings.ts`) as the first closed-string-enum key, with
  defaulting at the read site per that module's convention. The settings key
  selects the telemetry **class** ceiling (§Privacy); `/theta-status` selects
  the **view** shape — distinct axes.
- **Degradation ladder** (item 9): per-surface presence probe at compose time
  (`typeof`), per-call try/catch, and first hard failure permanently degrades
  *that* sink for the instance (the `RendererGate` pattern,
  `src/extension/system-note-channel.ts`). `ctx.hasUI` is an advisory input
  (it is `false` in json and print, `true` in RPC), never the sole gate.
- **L3 durable milestones** — author-driven only (§Author surface), via
  `pi.appendEntry` with custom entry type `theta-progress-entry` plus a
  registered entry renderer: durable in the transcript, absent from LLM
  context by construction.

### Author surface — the `theta_progress` tool (L3)

A theta-extension-registered Pi tool named `theta_progress` (item 3):
`{ message: string, scope?: string, done?: integer, total?: integer }`.

- Tools are already an effect kind — ordering, cancellation, and checkpoints
  come free; zero grammar change. Authors add it to `tools:` like any Pi
  tool.
- Parent-regime execution: bus event (footer/widget) + `appendEntry`
  milestone.
- Child-regime execution (regime detected via `PI_THETA_SUBAGENT_ROOT`):
  emits a `theta_progress` line on the child's own stdout (§Cross-process
  wire) instead of touching UI; the parent tap ingests and attributes it.
- Deliberate consequence to document: the callable-set rule — one unified
  list serves code and model (the `tools:` field paragraph,
  [frontmatter-fields-a.md](../spec_topics/frontmatter/frontmatter-fields-a.md#tools);
  terminology pinned at [FRNT-2](../spec_topics/frontmatter/frontmatter-fields-a.md#frnt-2)) —
  means a worker's *model* may also call it. That is a feature (self-reported
  progress from inside otherwise-private workers) and is content-bearing, so
  it renders under the author-message class (§Privacy, class 2), rate- and
  length-clamped.

### Cross-process wire (L3) and relay (L4)

```json
{"theta_progress":{"v":1,"invocation_id":"…","seq":1,"event":{…}}}
```

One line, emitted on the child's stdout by the child-side extension when a
`theta_progress` call executes in the child regime. Emission bounds are
pinned normatively: minimum interval, maximum line length, maximum lines/sec.
The parent enforces the same caps defensively and treats payloads as
untrusted display data — length-clamped, ANSI/control characters stripped.
The wire pin — PIC-59's reserved-key clause becoming a two-member set — is
spec'd with L3 and **lands with L3's child-regime tool arm** (item 10); L3's
parent-regime path needs no wire at all. The upward relay (a parent that is
itself a subagent child re-emitting, bounded by
[INV-4](../spec_topics/invocation.md#inv-4)'s depth 32) and any sparse child
auto-heartbeat (item 4) are L4, deferred to the follow-up RFC.

### Headless (L4, optional)

`-p` and `--mode json` have no UI (`ctx.hasUI === false`); an opt-in settings
key would mirror the L0 heartbeat to **stderr** (stdout stays clean per
PIC-59 discipline), complementing RFC 0007's failure mirroring. Deferred to
L4: json mode is simultaneously the child wire transport and a no-UI regime
for the parent's own sinks, so the stderr mirror is the only headless
progress surface.

## Delivery layers and acceptance gates

L0–L2 ship as **one release** and are this RFC's implementation scope; each
layer keeps its own acceptance gate within that release. L3 is a **second
release** behind its own hold: human sign-off on the tool name and the
emission clamps before implementation starts. L4 is **not scheduled by this
RFC**: it requires a follow-up RFC carrying usage evidence from L0–L3.

| Layer | Ships | Acceptance gate | Spec surfaces |
| --- | --- | --- | --- |
| L0 | footer heartbeat (`setStatus` + `setWorkingMessage` during driven streaming) | offline sink tests (render strings, degraded hosts); H8a `par for` cell shows lane transitions through the injected UI double | `execution-status.md` (heartbeat, degrade ladder); host-interfaces rows (`setStatus`, `setWorkingMessage`, `hasUI`) |
| L1 | ExecutionStatusBus + checkpoint decorator + child tap + entry-channel migration of the operator-facing note classes (bug 0469's principled fix) | bus/decorator/tap unit suites green; checkpoint yield-semantics and PIC-59 stray-line regression suites green **unmodified**; the 0469 shape (note landing mid-tool-call) impossible by construction | `execution-status.md` (bus, bounds, classes); `cancellation.md` race-note widening; `runtime-event-channel.md` (`theta-progress-entry` + note-class delivery amendment); host-interfaces rows (`appendEntry`, `registerEntryRenderer`); SLSH-2 carve-out |
| L2 | tree widget + `/theta-status` + `theta.progress` settings key | widget render-string tests across widths and verbosities; settings-gating and command tests; degraded-host tests | `execution-status.md` (widget, command, settings key); reference mirrors |
| L3 | `theta_progress` tool + durable milestones + the child-regime wire arm | HOLD: human sign-off on tool name + clamps before implementation; H9a json-mode wire cells green in both directions | `tool-calls.md` + frontmatter callable-set note; `subagent.md` two-member reserved-key wire pin; `execution-status.md` author-message class |
| L4 | upward relay, child auto-heartbeat, headless stderr heartbeat, source heatmap, model-facing trace | follow-up RFC with usage evidence from L0–L3 | none amended by this RFC |

## Privacy — the SLSH-2 telemetry carve-out

[SLSH-2](../spec_topics/slash-invocation.md#slsh-2)'s "unobservable by
construction" pins transcript **content**. This RFC amends the subagent-mode
paragraph under the SLSH-2 anchor with a carve-out distinguishing three
classes:

1. **Telemetry** (default-on): event kinds, counts, timing, source sites,
   theta names, lane states, tool **names**.
2. **Author messages** (default-on): `theta_progress` payloads — the author
   opted in by writing the call; worker-model calls are clamped.
3. **Content** (never surfaced by this feature): prompt/response text, tool
   args/results, thinking. The child tap must not retain them.

Draft amendment text — lands as a new paragraph directly after the
subagent-mode paragraph under the SLSH-2 anchor (the paragraph opening "In
subagent mode, no assistant tokens…"); the operational bounds (clamps, tick,
caps) are owned by the new `execution-status.md` page and cross-linked per
[GOV-9](../spec_topics/governance/req-id-prefix-table-active-b.md#gov-9):

> *Execution-status telemetry carve-out (RFC 0010).* The unobservability this
> paragraph pins is **content** unobservability. Three classes partition what
> the execution-status feature ([Execution
> Status](./execution-status.md)) surfaces about a running subagent-mode
> callee, and this paragraph binds each:
>
> 1. **Telemetry** — event kinds, event counts, timing, source sites
>    (`file:line`), theta names, `par for` lane states, and tool **names**.
>    Surfacing telemetry to the operator's transient UI and to the
>    LLM-context-free entry channel is NOT a breach of this paragraph.
>    Default-on (`theta.progress: names`); under `theta.progress: counts`
>    tool names are additionally withheld; under `theta.progress: off` no
>    execution-status sink renders at all.
> 2. **Author messages** — the payload of a `theta_progress` tool call
>    ([Execution Status — author surface](./execution-status.md)). The theta
>    author opted into surfacing by writing the call into the callee; a call
>    issued by the callee's *model* rides the same callable-set entry
>    ([Parameters and Frontmatter —
>    FRNT-2](./frontmatter/frontmatter-fields-a.md#frnt-2)) and MUST be rate-
>    and length-clamped before rendering. Default-on; disabled by
>    `theta.progress: off`.
> 3. **Content** — prompt and response text, tool arguments, tool results,
>    thinking. The execution-status feature MUST NOT surface, retain, or
>    forward class-3 fields: the parent-side tap projects each child event to
>    bounded class-1 fields at ingest and discards the remainder.
>
> Classes 1 and 2 render on transient UI surfaces (`ctx.ui.setStatus`,
> `ctx.ui.setWidget`) and on the durable LLM-context-free entry channel
> (`pi.appendEntry`, [Runtime event channel —
> `theta-progress-entry`](./pi-integration-contract/runtime-event-channel.md));
> they MUST NOT ride `pi.sendMessage` and therefore never enter any
> conversation's LLM context. The artefact rule above is unchanged for
> conversation surfaces: the theta's return value (or an `InvokeCalleeError`
> / `InvokeInfraError`) remains the only artefact that reaches the parent
> **conversation**.

The class-1 default (`names`) is resolved at item 1 below. Class 2 becomes
reachable only at L3; the amendment defines all three classes in the L0–L2
release so the privacy contract precedes the first telemetry surface.

## Alternatives considered

- **Progress as `theta-system-note` custom messages.** Rejected — incident
  constraint 1: any message-class emission at an uncontrolled moment can
  orphan an in-flight `tool_result` and durably corrupt the session (bug
  0469), and every custom message costs context tokens on all later turns.
- **Deduplicating the diagnostic notes.** Spec-forbidden —
  [Re-scan deduplication](../spec_topics/diagnostics/diagnostic-shape.md#re-scan-deduplication)
  is a MUST NOT against suppressing duplicate diagnostic lines (bug 0470's
  dedup was reverted on exactly this rule). The entry-channel migration is a
  channel change, not a suppression.
- **Idle-gating `pi.sendMessage`** (deliver notes only between turns).
  Rejected as the primary fix: it serialises an asynchronous producer against
  the drive loop and leaves the context-token cost in place; the entry
  channel removes both failure modes at once.
- **Status quo forensics** (process tree, file mtimes, re-running under
  `--mode json`). The observed diagnosis cost is hours; that cost motivated
  this RFC.
- **Changing pi's own loader/spinner.** pi's working indicator is tied to
  streaming turns; that is pi's surface, not theta's.

## Resolved questions

Items 1–6 are the design's open questions; items 7–10 were surfaced by the
Phase 1 inventory.

1. **Default verbosity — `names` vs `counts`.** *Decision:* `names`. Tool
   names are the highest-signal class-1 field for "what is it doing now" and
   are names, not arguments; `counts` remains one setting away for
   shared-screen use.
2. **Widget placement and height.** *Decision:* `belowEditor`, height budget
   6 lines, overflow elided. Below the editor the tree reads as status
   chrome, not transcript content; 6 lines holds the common case (orchestrator
   + one `par for` + a few lanes) without dominating small terminals.
3. **Tool name — `theta_progress` vs `progress`.** *Decision:*
   `theta_progress`. A bare `progress` risks collision with user tools; the
   prefixed name matches the wire key and the entry `customType` spelling, so
   the tool, the wire line, and the entry type share one grep token. Final
   sign-off sits on L3's hold gate.
4. **Child auto-heartbeat in L3 or L4.** *Decision:* defer to L4 with the
   relay. L3's author-driven calls are the evidence-gathering instrument; an
   automatic child-side emitter multiplies wire volume before the clamps have
   field history.
5. **`setWorkingIndicator` frames during long tool calls.** *Decision:*
   footer-only. `setWorkingMessage` renders while a driven prompt-mode turn
   is streaming; the loader belongs to streaming turns, and a spinner over a
   silent tool call would suggest token flow that is not happening.
6. **Model-facing trace (`display: false` custom messages).** *Decision:* out
   of scope. `display: false` messages still enter LLM context by
   construction (the `convertToLlm` pin cited in constraint 1) — the exact
   channel class constraint 1 forbids for progress. Revisit only when a
   concrete agent-loop theta demonstrates need and a token budget.
7. **Settings persistence for `/theta-status` (scouting-surfaced).** The
   design said the command's choice is "persisted in settings"; no
   settings-write machinery exists anywhere — `src/discovery/settings.ts`
   exposes read/merge/validate only, and no command handler in the codebase
   writes a settings file (Phase 1 inventory S7). *Decision:* the
   `theta.progress` key is the durable default, hand-edited like every
   existing key; `/theta-status off|min|tree` adjusts the LIVE instance only
   — session-scoped view state, reset by `/reload` or a new session, never
   written to disk. Minting a settings-write surface for a view toggle is out
   of proportion to its value; the design's §3.4 phrasing is corrected, not
   implemented.
8. **Optional-capability class vs the capability-count co-edit gate
   (scouting-surfaced).** The design framed the newly consumed pi surfaces as
   version-bump-checklist capabilities; adding any `CAPABILITY_OBLIGATIONS`
   row trips the count-equality gate `capabilityCountCoEditFailures`
   (`src/extension/version-bump-gates.ts`), whose pinned witness
   `CAPABILITY_OBLIGATIONS.length === 7` is named by
   [GOV-31](../spec_topics/governance/req-id-prefix-table-active-b.md#gov-31)
   as the SDK-capabilities aggregator's in-code-constant carve-out.
   *Decision:* the optional class is a SEPARATE frozen structure (working
   name `OPTIONAL_UI_CAPABILITIES`, `src/extension/sdk-inventory.ts`) with
   its own semantics — presence-probe at compose time, degrade-silent per
   surface, **never refuse registration** — leaving the fail-closed seven-set
   and its Step 0 probe untouched
   ([PIC-5](../spec_topics/pi-integration-contract/capability-probe.md#pic-5)'s
   "six enumerated checks" prohibition intact; shape precedent: the PIC-64
   rung-availability "non-gating record" paragraph on the same page). Five
   new `SDK_SURFACE_INVENTORY` presence rows (`ctx.ui.setStatus`,
   `ctx.ui.setWidget`, `ctx.ui.setWorkingMessage`, `pi.appendEntry`,
   `pi.registerEntryRenderer`); `ctx.hasUI` and `pi.registerMessageRenderer`
   already have rows. Spec'd via the host-interfaces member rows plus one
   version-bump checklist item.
9. **`hasUI` truth table and the degrade ladder (scouting-surfaced).** The
   design paired "print/RPC degradation" as one bucket; ground truth is
   `ctx.hasUI` is TRUE in RPC mode and false in print AND json (pi
   `docs/extensions.md` mode table). *Decision:* the ladder probes per
   surface — presence probe, then per-call try/degrade — with `hasUI` as an
   advisory input only, never the sole gate; §Sinks and §Headless are worded
   accordingly (json mode is simultaneously the child wire transport and a
   no-UI regime for the parent's own sinks).
10. **Which layer lands the wire pin (scouting-surfaced).** Today
    [PIC-59](../spec_topics/pi-integration-contract/subagent.md#pic-59) scans
    ONE reserved key and its clause is worded in the singular ("the parent
    matches the reserved key"). *Decision:* the two-member reserved-key set
    (`theta_result`, `theta_progress`) is spec'd with L3 and LANDS with L3's
    child-regime tool arm — the arm where a `theta_progress` call executes
    inside a child `pi` process and must cross a process boundary. L3's
    parent-regime path needs no wire at all. L4's relay extends the same pin
    (upward re-emission) without minting a new key.

## New diagnostics

**None.** Every sink is best-effort/degrade-silent; wire parse failures fold
into the existing stray-line tolerance and the bug-0086 first-offender
discipline at the drive site; the runtime registry is closed
([DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2)) and no
parse-phase surface exists here.

## Specification impact

One row per touched normative surface. Anchors verified against today's tree
by the Phase 1 inventory. Rows marked **(L3)** shipped with the L3 amendment
pass on `feat/rfc-0010-visibility` (hold discharged 2026-09-09: tool name
`theta_progress` and the clamps ratified — 200-char message / 64-char scope /
200 ms acceptance interval / 4096-byte wire line): the landed anchors are
[EXST-13…EXST-15](../spec_topics/execution-status.md#exst-13) (tool contract,
parent-regime execution + clamps, child-regime wire arm),
[PIC-74](../spec_topics/pi-integration-contract/subagent.md#pic-74) (the
two-member reserved-key wire pin), the now-normative PIC-71 milestone arm, and
the tool-calls / frontmatter cross-link notes. All other rows shipped with
L0–L2.

| Surface | Anchor | Change |
|---|---|---|
| `docs/spec_topics/execution-status.md` | new page | **New topic page**: bus model, the three privacy classes' operational bounds, emission caps and coalescing tick, degradation ladder, `theta.progress` key, `/theta-status`, (L3) the `theta_progress` tool and wire bounds. |
| `docs/spec_topics/governance/req-id-prefix-table-active-b.md` | [GOV-7](../spec_topics/governance/req-id-prefix-table-active-b.md#gov-7) *Add* | One appended row binding a previously-unused prefix (e.g. `EXST`) to the new page, in the **same commit** as its first REQ-ID ([GOV-6](../spec_topics/governance/req-id-prefix-table-active-b.md#gov-6)); binding append-only per [GOV-24](../spec_topics/governance/req-id-prefix-table-active-b.md#gov-24). |
| `docs/spec_topics/slash-invocation.md` | [SLSH-2](../spec_topics/slash-invocation.md#slsh-2), the subagent-mode paragraph | The telemetry carve-out paragraph (§Privacy, drafted verbatim above) appended after the "In subagent mode, no assistant tokens…" paragraph, under the same anchor. |
| `docs/spec_topics/pi-integration-contract/host-interfaces-core.md` | the inline `ExtensionContext` TS block (the `ui:` row's comment style) for `ctx.*` members; the `ExtensionAPI` block on `extension-bootstrap-and-per-theta.md` for `pi.*` members | Six **new** member rows, all marked optional / degrade-silent: `ctx.ui.setStatus`, `ctx.ui.setWidget`, `ctx.ui.setWorkingMessage`, `ctx.hasUI` on `host-interfaces-core.md`; `pi.appendEntry`, `pi.registerEntryRenderer` beside the other `pi.*` signatures on `extension-bootstrap-and-per-theta.md` (none is documented on these pages today), plus the enumerating paragraph's member-set restatement. |
| `docs/spec_topics/pi-integration-contract/capability-probe.md` | after [PIC-5](../spec_topics/pi-integration-contract/capability-probe.md#pic-5); precedent: the PIC-64 rung-availability "non-gating record" paragraph | New normative section for the **optional-capability class**: probe, degrade-silent, never refuse registration; explicitly NOT a Step 0 check, so PIC-5's "six enumerated checks" prohibition is untouched. |
| `docs/spec_topics/pi-integration-contract/version-bump-step2.md` | items [(o)](../spec_topics/pi-integration-contract/version-bump-step2.md#bump-checklist-subagent-cli-wire-pins) / [(aj)](../spec_topics/pi-integration-contract/version-bump-step2.md#bump-checklist-no-session-ephemeral) template | One new lettered checklist item covering the six optional UI/entry surfaces — existence plus the `appendEntry` no-LLM-context behaviour — SHOULD-level with the standard escalation sentence; names the five new `SDK_SURFACE_INVENTORY` presence rows (item 8). |
| `docs/spec_topics/cancellation.md` | Race-semantics edge-case list, final bullet | "The seam is purely a test surface…" → "The seam is a test/telemetry surface and imposes no observable behaviour on production code beyond the always-`await`ed no-op." Same-edit consistency check on [PIC-10](../spec_topics/pi-integration-contract/host-interfaces-services.md#pic-10)'s "no observable production effect" sentence. |
| `docs/spec_topics/pi-integration-contract/runtime-event-channel.md` | new sibling section between the "Informational notes carry no `details`" paragraph and the always-log-set paragraph | (a) `theta-progress-entry` documented as a DISTINCT channel: `pi.appendEntry` call shape, LLM-context-free by construction, explicitly **not** a sixth `details` shape on `theta-system-note`; (b) the L1 note-class migration: load-diagnostic batches, structural and recovery notes move from `pi.sendMessage` to the entry channel (bug 0469), re-scoping the "single call shape" intro sentence and the per-variant table; `diagnostic-shape.md`'s persistent-diagnostics / [Re-scan deduplication](../spec_topics/diagnostics/diagnostic-shape.md#re-scan-deduplication) prose names the new landing surface (the no-suppression MUST unchanged). |
| `docs/spec_topics/pi-integration-contract/subagent.md` **(L3)** | [PIC-59](../spec_topics/pi-integration-contract/subagent.md#pic-59); [CLI-flag and wire pins](../spec_topics/pi-integration-contract/subagent.md#subagent-cli-wire-pins) | "the parent matches the reserved key" (singular) becomes the two-member reserved-key set `{theta_result, theta_progress}`; the consumed-stdout-wire bullet gains the `theta_progress` line, its emission bounds, and the untrusted-payload trust posture (item 10). |
| `docs/spec_topics/tool-calls.md` **(L3)** | the "No conversation turn" paragraph's neighbourhood | `theta_progress` as an ordinarily-registered extension tool; milestone rendering is entry-channel-only, so the no-conversation-turn rule holds unchanged. |
| `docs/spec_topics/frontmatter/frontmatter-fields-a.md` **(L3)** | `tools:` field / [FRNT-2](../spec_topics/frontmatter/frontmatter-fields-a.md#frnt-2) | Callable-set consequence note: the same entry serves code and model, so a worker's model may self-report; cross-link to the class-2 clamps. |
| `docs/spec_topics/discovery/package-and-settings.md` | Keys read / Scalar-key validation | Key count five→six (scalars four→five); the `theta.progress` key bullet (string, `"off"`/`"counts"`/`"names"`, default `"names"`, session-scoped `/theta-status` override cross-ref) + its acceptance-set row + the absent-behaviour enumerations extended. |
| `docs/spec_topics/diagnostics/code-registry-load.md` | `theta/load/settings-value-out-of-range` row | Trigger co-edit (DIAG-2: trigger changes land in the registry table): `progress` joins the recognised-scalar parenthetical and the per-key acceptance enumeration. No new code. |
| `docs/reference/**` | settings / commands / tools reference pages | Mirrors for `theta.progress`, `/theta-status`, and (L3) `theta_progress`; `docs/reference/coverage-matrix.md` rows only for the reference pages that change (that matrix is doc-set-keyed). |
| `docs/plan_topics/coverage-matrix.md` | code-keyed obligation areas | New `cka-<n>` rows per shipped component with "RFC 0010 (<facet>)" parentheticals (the cka-65 row-shape precedent). |
| `docs/rfcs/README.md` | index | This RFC's row. |

**Aggregator arithmetic
([GOV-30](../spec_topics/governance/req-id-prefix-table-active-b.md#gov-30) /
[GOV-31](../spec_topics/governance/req-id-prefix-table-active-b.md#gov-31)):
no counted set moves.** `CAPABILITY_OBLIGATIONS` stays at seven — the
optional class is a separate structure (item 8), so the
`capabilityCountCoEditFailures` gate and the GOV-31 in-code-constant witness
(`CAPABILITY_OBLIGATIONS.length === 7`) are untouched. No `theta 1.0 seam`
blockquote is added or consumed, so the 12-seam Scope literal is untouched.
No other GOV-30/GOV-31 source set gains or loses a member in these
amendments.

## Failure containment (normative posture)

- Every sink call is wrapped; the first hard failure of a surface degrades
  that sink permanently for the instance (`RendererGate` pattern — a fresh
  `/reload` instance starts clean). Theta semantics — results, notes, timing
  beyond the ≤200 ms coalesce tick — are unaffected by any sink outcome.
- The bus is fed synchronously (no awaits added on hot paths); rendering work
  happens on the tick, never inline in `before(...)` or the line pump.
- The factory's synchronous-arm pin holds: bus construction inside the
  factory's synchronous entry path returns no thenable
  (`tests/extension-factory-harness.test.ts` pins the arm).

## Testing strategy

Offline (default gate, provider-free):

- **Bus** (FakeClock): coalescing — one render per dirty window,
  drop-and-reschedule, asserted with the tick-boundary exactness style of
  `tests/reload-debounce.test.ts`; lane lifecycle; caps; linger;
  no-dirty-no-render. Composition risk to manage: the bus shares the
  per-instance `Clock` with `ReloadDebouncer`, so a future test driving both
  over one FakeClock must account for both consumers' timers (Phase 1 S6
  brittleness note).
- **Decorator:** publishes exactly the five kinds with sites; `loop-iter`
  throttling; delegation intact. The pinned yield-semantics suites —
  `tests/checkpoint-seam.test.ts` (macrotask/microtask exactness),
  `tests/checkpoint-granularity.test.ts` (per-site kind/count) — and the
  direct-construction suites stay green **unmodified**; the synchronous
  publish adds no observable work before delegation.
- **Tap:** synthetic child-line fixtures grown from the in-test literals that
  exist today — the `agent_end` stray-line literals in
  `tests/subagent-envelope.test.ts` and the JSONL-framing helper in
  `tests/helpers/fake-rpc-child.ts`. No `.jsonl` fixture FILES exist under
  `tests/` today (Phase 1 gap): the corpus ships as inline literals per the
  local convention, or a fixture directory is introduced deliberately — not
  assumed. Assertions: counters correct; content fields never stored (node
  snapshot assertion); oversized/garbage lines ignored **without**
  diagnostics; the drive listener's lines never stolen — the PIC-59 suite
  (`tests/subagent-json-driver.test.ts`: stray-line tolerance,
  close-not-exit terminal ordering, cancellation mapping) stays green
  unmodified.
- **Sinks:** `Component.render(width)` string assertions at several widths
  and verbosities; degraded-host tests (absent `setWidget` etc. → fewer
  sinks, no throw, factory still registers).
- **Settings and command:** `off`/`counts`/`names` gating (first
  closed-string-enum settings key); `/theta-status` registration, teardown
  via the ledger, session-scoped effect (no settings write occurs — item 7).
- **Wire (L3):** emit/ingest round-trip including clamps;
  `classifyChildStdoutLine` behaviour unchanged for `theta_result`-absent
  lines (`tests/subagent-envelope.test.ts` pins); the capability-count gate
  untouched (`tests/version-bump-gates.test.ts` reds on any
  `CAPABILITY_OBLIGATIONS` add without co-edit — this RFC adds none).
- **Par-for lane hooks:** no runtime lane-state suite exists today (Phase 1
  gap — the b0324/b0325/b0326/b0438 files pin only the max-clause clamp
  diagnostics), so the lane-hook tests are NEW coverage written red-first
  against the bus's lane-transition observable; nothing existing reds, so
  both transition directions are asserted deliberately.

Live (`npm run test:live` — this RFC touches live-exercised surfaces, so the
run is mandatory per `AGENTS.md`):

- **H8a:** `par for` fan-out fixture; assert bus-derived lane transitions via
  the injected UI double (status strings — a deterministic channel, not
  `assistantText`); child pins per
  [`AGENTS.md#subagent-child-pins`](../../AGENTS.md#subagent-child-pins).
- **H9a (json mode; ships with L3):** with progress enabled, `theta_progress`
  lines present and schema-valid on the stdout of a CHILD (not the outer
  session); disabled → absent. Both directions proven once per the
  verify-both-directions rule.
- **Negative proof for L0–L2:** once, locally disable the tap/bus wiring and
  confirm the H8a cell reds on the missing lane transitions; restore and
  confirm green.

## Compatibility and versioning

- Purely additive. Absent settings key ⇒ default `names`; `theta.progress:
  off` disables every sink (render silence; theta semantics identical).
- Older or divergent hosts (below the peer floor, or Oh-My-Pi-style): the
  optional surfaces degrade silently to fewer sinks; registration is never
  refused (item 8). All consumed surfaces exist at the pinned SDK, so the
  peer-dependency pin does not move and the version-bump gates are unaffected
  beyond the new checklist item.
- theta's own version: one middle-digit bump per release (L0–L2, then L3),
  per the repo's CHANGELOG convention.
- L3 adds one tool name to the extension's registration set; `theta_progress`
  registers like any extension tool and joins the existing collision
  handling. Authors opt in per theta via `tools:`.

## Prior art in this repository

- [RFC 0007](./0007-print-mode-observability.md) — the sibling headless
  *failure* surface; §Headless complements it and stays deferred with L4.
- [RFC 0009](./0009-per-call-subagent-cwd.md) — the worktree fan-out pattern
  whose parallel workers are this RFC's first consumer.
- RFC 0005 / RFC 0006 — the child-process architecture whose stdout wire and
  stray-line tolerance the tap and the L3 wire ride.
- Bugs [0469](../bugs/0469-watcher-note-mid-tool-execution-breaks-tool-adjacency.md) /
  [0470](../bugs/0470-load-diagnostics-re-emit-without-dedup.md) /
  [0471](../bugs/0471-non-theta-file-change-triggers-full-rescan.md) — the
  incident constraints; 0469's principled fix ships as L1's first increment.
- Bug [0086](../bugs/0086-subagent-wire-parse-failed-no-emitter.md) — the
  first-offender wire-diagnostic discipline the tap inherits.
- `RendererGate` (`src/extension/system-note-channel.ts`) — the
  permanent-degrade posture every sink adopts.
- The PIC-64 rung-availability "non-gating record"
  ([capability-probe.md](../spec_topics/pi-integration-contract/capability-probe.md#pic-5)
  neighbourhood) — the probe-but-never-refuse precedent for the
  optional-capability class.

## Erratum log

- **Erratum A — the migrated note classes fall back to the message channel,
  never to silence** (Phase 3, 2026-09-09). §Compatibility's "the optional
  surfaces degrade silently to fewer sinks" is correct for the *progress*
  sinks but must not be read over the L1 note-class migration: on a host
  where `pi.appendEntry` / `pi.registerEntryRenderer` is absent (or the
  `appendEntry` call throws), silently dropping a load-diagnostic batch, a
  structural-change note, or a binder-model recovery note would trade the
  bug-0469 adjacency hazard for a silent loss of fail-loud operator surfaces
  — the exact inversion of the repo's fail-closed posture. The landed spec
  therefore pins a two-tier delivery for exactly those three classes: entry
  channel primary, the pre-existing `pi.sendMessage` `theta-system-note`
  realization (unchanged `display`/`content`/`details`, unchanged five-shape
  partition) as the fallback
  ([runtime-event-channel.md — PIC-72](../spec_topics/pi-integration-contract/runtime-event-channel.md#pic-72)).
  Degrade-to-fewer-sinks remains the rule for every class-1/class-2 progress
  surface ([execution-status.md — EXST-8](../spec_topics/execution-status.md#exst-8)).
  Phase 3 review widened the fallback trigger to close a hole: a *present*
  entry-channel pair whose factory-time `pi.registerEntryRenderer` call throws
  would otherwise accept `appendEntry` emissions no renderer can draw — so a
  throwing renderer registration marks the entry channel absent for the
  session (PIC-71) and the message-channel fallback owns all delivery from
  registration onward.
- **Erratum B — EXST-6 tick anchoring** (Phase 4, 2026-09-09). The landed
  EXST-6 parenthetical read "the same shape as the reload debounce", but an
  event-anchored debounce restarts its window on each new event and so never
  fires under continuous dirt — starving the L0 acceptance gate's own
  heartbeat during exactly the long-running activity the surface exists for.
  EXST-6 now pins the last-render-anchored throttle (deadline kept, extra
  schedules dropped) and cites the reload debounce as the deliberate
  contrast, not the template. The normative "minimum inter-render interval"
  clause is unchanged.
- **Erratum C — footer example over-promised parent-regime tool names**
  (Phase 4, 2026-09-09). §Sinks' illustrative footer line showed `bash
  tools/…`, but the parent-regime producer set is the closed checkpoint
  payload `(invocationId, kind, site)` (EXST-3/EXST-4) — no tool name exists
  there to render. The example now shows `tool-call @ <file>:<line>`; tool
  names appear where a producer genuinely carries them (child-tap
  `tool_execution_start`; L3 self-reports). No decision line is touched:
  verbosity level `names` gates what may render, not what producers must
  carry.
- **Erratum D — wire-ingested self-reports render transiently only** (Phase
  7a, L3 landing). §Sinks' "L3 durable milestones — author-driven only" and
  §Author surface's "the parent tap ingests and attributes it" read together
  as if a subagent worker's `theta_progress` call could reach the parent's
  durable entry channel. The landed spec narrows fail-closed: milestone
  entries are appended only by the PARENT-regime tool arm
  ([execution-status.md — EXST-14](../spec_topics/execution-status.md#exst-14));
  a wire-ingested child self-report renders on the transient sinks only and
  MUST NOT become an entry
  ([EXST-15](../spec_topics/execution-status.md#exst-15), PIC-71's milestone
  arm). Reasons: the wire payload is untrusted display data and the durable
  transcript is the wrong place for it (a defective or hostile child could
  otherwise append 5 entries/sec for its whole runtime into the operator's
  persisted session); under `par for` fan-out the parent-side entry rate would
  multiply per child; and the emitting child's own entry channel writes only
  its ephemeral `--no-session` transcript, so no durable record exists to
  preserve. The transient render keeps the operator-visibility goal; durable
  worker journals are L4 territory if field evidence demands them.
- **Erratum E — L0–L3 collapsed into one release** (Phase 8). §Delivery
  layers planned L0–L2 and L3 as two releases with a human hold between; the
  2026-09-09 ratification discharged every hold (tool name, clamps, merge),
  so 0.467.0 ships L0–L3 together — each layer's own acceptance gate was
  still run and passed separately (L0–L2: the Phase 4–6 offline/live gates;
  L3: the citing gates + the H9a json-mode wire cells in both directions).
  L4 remains unscheduled, per the layer table.
- **Erratum F — a running row's age is dirt of its own** (post-0.467.0 field
  observation). EXST-6's "no render when nothing is dirty" was implemented as
  "no render without a producer publication", which freezes the surface for any
  invocation that publishes nothing for a while. Observed: the quality loop's
  `fix-cluster-tree.theta` wrapper is code-only — it drives two worker
  invocations and a bounded gate and takes no turn of its own — so its child
  produced no tap events for minutes at a time, and the footer's per-lane ages
  sat frozen at `0s` for the whole run, indistinguishable from a hung or dead
  lane. But a rendered age is a function of the CURRENT time, not of the last
  publication, so while anything is running the passage of a render interval is
  itself dirt. EXST-6 now says so, and the bus schedules the next tick after any
  render that drew a running node, lane, or child — at the same interval, with
  the drop-and-reschedule discipline unchanged. The idle direction is unchanged
  and normative: with nothing running and no linger outstanding, no tick is
  scheduled, so an idle session stays render-free rather than paying a
  perpetual heartbeat. (The L3 `theta_progress` self-reports added to that same
  wrapper are the complementary half — narration when there is news; the
  keepalive is liveness when there is none.)
