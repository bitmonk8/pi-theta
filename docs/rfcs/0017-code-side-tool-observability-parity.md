# RFC 0017 — Code-side tool observability without conversation-transcript rows

- **Status:** draft (feature request; current behavior is not classified as a bug).
- **Scope:** operator visibility equivalent to an identical model-issued Pi-tool
  call, including installed call/result renderers and live execution feedback,
  through a surface outside the conversation transcript.
- **Does NOT touch:** model requests, conversation turns, conversation-transcript
  content, or theta's bound tool result. Installed implementation selection is
  owned by [RFC 0016](./0016-code-side-tool-dispatch-parity.md).
- **Depends on:** RFC 0016's installed-implementation dispatch capability for
  full parity with execution-dependent renderers. Generic observation can be
  designed and implemented independently; no merge or release order is required.
  RFC 0016 does not depend on this RFC.
- **Related substrate:** RFC 0010 execution telemetry and RFC 0015 run cards.
  Neither currently supplies the content-bearing, non-transcript tool view
  requested here.

## Summary

A code-side tool call should be as observable to the operator as an identical
model-issued call in the same host session and placement, under the same
operator visibility settings. It should show the effective arguments, running
state, streamed updates, final result, failure/cancellation state, and timing
through the same applicable tool renderers.

The display is not a conversation artifact. It adds no turn, message, tool-call
card, or custom-entry row to the conversation transcript, even if that entry
would be excluded from model context. The requested distinction is between
**operator visibility** and **conversation participation**, not between visible
and hidden transcript messages.

## Motivation and current behavior

A long-running code-side bash call in `/fix-bug` can leave the operator unable
to inspect the command or its live progress. The source run card can identify a
statement, but it does not show the evaluated command or its running shell
steps. pi-config's installed bash renderer already provides those details for
model-issued calls.

There are two separable missing integrations:

1. The code-side resolver selects stock bash rather than the installed
   execution wrapper. RFC 0016 addresses that execution difference.
2. Direct dispatch produces no host tool-call row and discards the partial
   update callback. There is no call lifecycle feeding an equivalent detached
   operator view. This RFC addresses that visibility difference.

The current execution-status feature intentionally excludes arguments and
results as class-3 content (EXST-12). Its run card is an LLM-context-free entry
in transcript history (PIC-75). Neither displaying commands on the existing bus
without revising its contract nor adding more transcript entries meets this
request.

## Proposed contract

### 1. Match the information and renderers, not the transcript placement

For an observable code-side call, the operator gets the same tool-level
information and applicable rendering behavior as for an equivalent model call:

- the tool name and complete effective arguments, with the host's ordinary
  redaction and display policy;
- a running indication and elapsed time before the call finishes;
- partial results as the tool emits them, under equivalent buffering and
  truncation rules;
- the final result and structured rendering details supplied by the tool;
- success, failure, and cancellation states, with the same distinctions the
  host can show for the equivalent model call;
- expansion and inspection affordances equivalent to ordinary tool rendering.

Use the host's effective renderer resolution, including same-name overrides,
renderer-only registrations, and inherited call/result renderer slots. Do not
maintain a theta-specific imitation of bash formatting or its trace heatmap.
The target is observable information and renderer behavior, not an identical
screen position or pixel layout.

The renderer receives a stable call id, the real cwd and theme, execution state,
per-call render state, and invalidation support. An execution wrapper and its
renderer see the same call identity in the same process. This matters for
pi-config's trace-session lookup; replaying final text through a similarly
named renderer is not equivalent to showing live execution.

No author-written `theta_progress` or `theta_print` call is required to make
ordinary tool activity observable. `theta.progress: names` must not be treated
as permission to send command arguments through today's class-1 status bus.
The new view's settings and their relationship to existing visibility controls
need an explicit design, rather than an undocumented class-3 bypass.

### 2. Render outside the conversation transcript

The proposed surface is a detached, non-modal tool inspector, with a live view
while calls run and expandable session-local completed-call detail. It can use
the same renderer components as ordinary tool cards without adding those cards
to conversation history. The concrete layout and entry affordance remain design
questions; the active-call information should appear under equivalent operator
visibility settings without requiring a theta-specific source edit.

The inspector has no persisted conversation entry. In particular:

- no fabricated user or assistant message;
- no conversation tool-use or tool-result message;
- no `pi.sendMessage` status/custom-message delivery;
- no per-call `pi.appendEntry` row, including an LLM-context-free entry;
- no hidden-then-filtered entry, later transcript deletion, or resumed-session
  reconstruction that turns a code call into conversation history;
- no provider request or session-model/thinking-level switch to create a view.

Reusing a renderer component does not require using Pi's ordinary transcript
container. If Pi does not expose renderer resolution/component creation for a
detached view, that is a host integration requirement, not permission to
fabricate a conversation call.

Existing drive-level run cards and notes remain unchanged. This proposal adds
no tool-call content to those existing rows and does not retrospectively move
ordinary model-issued tool cards out of their transcripts.

### 3. Keep execution and observation separate

A transcript-free execution lifecycle feeds the inspector: start, partial
update, and one terminal outcome, with code-origin provenance and invocation
attribution. These are execution notifications, not synthesized assistant or
message-lifecycle events. Integration must route them so Pi's ordinary event
subscriber does not accidentally create a conversation-transcript row.

Execution owns the result. The observer receives the effective, host-redacted
arguments and result/detail snapshots needed for rendering; it cannot mutate
arguments, replace a result, request an extra model turn, or re-execute a call.
A display-only failure cannot turn tool success into a failure. Validation,
permission and execution-hook failures are not display-only and retain their
execution semantics under RFC 0016.

Partial updates do not become theta values. The final bound string remains the
approved rendered-text adaptation, without placeholder normalization or raw
output extraction. Displaying structured `details` does not expose them as new
theta language values.

Per-call render state, retained results, concurrent-call counts, and completed
history are bounded. Any reduced detail, truncation, dropped update count, or
history eviction is visible rather than silently reported as complete. Timers,
subscriptions, and components stop on completion, cancellation, shutdown, or
view disposal; a finished call does not leave an animation loop running.
An absent/failing UI may degrade display, not execution. UI invalidation and
stream delivery must not introduce an unbounded queue or backpressure that
blocks the tool.

### 4. Respect host mode and process boundaries

- **Prompt-mode TUI:** show the code-side call in the local detached inspector,
  not in the user's conversation transcript.
- **Visible child TUI:** use that child's own implementation, renderer state,
  and detached inspector. A renderer closure or local trace session is not
  transported to its parent.
- **Headless/RPC/JSON:** expose an explicitly code-origin execution lifecycle
  where the equivalent model-call transport exposes tool activity, without
  inventing conversation messages. Transport must be framed and must not write
  raw command/output text onto stdout protocol streams. Exact payloads and
  capability negotiation need a host-level design.
- **Plain text print mode:** no TUI inspector and no new unsolicited command or
  output dump. Existing result, diagnostic, and exit-status surfaces remain
  unchanged; a separate operator subscriber can provide inspection if supported.

Parity is relative to the equivalent model call's session and placement. It
does not imply forwarding child content into an ancestor conversation. Parent
aggregation of headless-child content, if requested later, needs an explicit
bounded operator channel and privacy/trust design; it is not an implied widening
of EXST-5's content-free child tap or the PIC-59 result envelope.

Arguments and results can contain credentials or source text. The view follows
the host's redaction/access policy, does not expose a raw pre-hook copy, and does
not persist content by default. A durable operator trace outside conversation
storage is a separate decision, not a fallback transcript entry.

## Relationship to RFC 0016

The RFCs have distinct acceptance obligations:

- RFC 0016 selects and executes the effective installed implementation with
  host behavior parity, regardless of whether any display is attached.
- This RFC observes that one execution and uses the effective renderers outside
  the conversation transcript.

A detached renderer alone cannot restore pi-config's heatmap if the execution
wrapper that creates its trace never ran. Full parity for that extension
therefore requires both features. Basic lifecycle observation can be developed
against the current stock path independently, but it must not be called full
override parity. The live bash-heatmap acceptance criterion below cannot pass
against unchanged stock dispatch: invoking the renderer without its execution
wrapper does not create the trace it needs. An independently delivered generic
inspector is therefore incremental delivery, not completion of this RFC.
A shared host dispatch/observation capability can support both without
collapsing them into one feature or requiring transcript pollution.

## Acceptance criteria

1. Run a delayed bash command under the installed pi-config override. Compare
   model and code callers with equivalent settings: command decomposition,
   active-step heat, elapsed time, live output and terminal rendering use the
   installed renderers. Capture a running frame, not only the final result.
2. Instrument a custom tool and renderers. Verify matching call identity,
   arguments, detail/update delivery, renderer inheritance, expansion, resize,
   theme invalidation, success, failure, and cancellation. Execution occurs
   once even when the component renders many times.
3. Exercise simultaneous calls and repeated invocations. State and updates do
   not cross between calls or child sessions. Completion, cancellation, renderer
   failure, and session teardown release timers and subscriptions.
4. A result-redaction hook removes a distinctive sensitive marker. The marker
   appears in neither the inspector nor its operator transport. Renderer
   exceptions and an absent UI leave the returned theta result unchanged.
5. Inspect complete session entries, reconstructed model context, normal
   conversation-transcript render input, exported/resumed conversation history,
   and subsequent provider input. The code-side call adds no message, turn,
   custom entry, transcript card, or hidden residue. A context-free custom-entry
   implementation fails this witness even if it consumes zero model tokens.
6. A real-host TUI witness proves actual detached rendering. Separate headless
   witnesses prove framed lifecycle delivery where supported, clean stdout
   protocols, no ancestor conversation leakage, and unchanged failure surfaces.
7. Reject a final-result-only implementation, a fake ordinary tool card, and a
   renderer that ignores installed overrides. Verify bounded-update and
   completed-history behavior under a slow renderer and large output.

## Alternatives considered

- **Ordinary tool cards in the transcript.** Violates the explicit placement
  constraint even when no extra model request is made.
- **More custom entries beside the run card.** Excluded from model context but
  still appear in transcript history; that is not the requested separation.
- **Commands/results on the current progress bus.** Violates EXST-12 and lacks
  tool-renderer behavior. A new content channel needs its own explicit contract.
- **Author-authored progress messages.** Useful milestones, not a substitute for
  generic command inspection or installed renderer parity.
- **Raw stdout mirroring or a final log link.** Does not provide equivalent live
  rendering and can corrupt machine-mode protocols or expose unredacted data.

## Specification and compatibility impact

Acceptance requires an explicit operator-only tool-observation surface beside
the existing content-free execution-status feature. Update the direct-call
`onUpdate` description to distinguish theta value delivery from operator
observation; document detached renderer resolution, lifecycle provenance,
visibility settings, resource bounds, and mode-specific capabilities.

Retain the no-turn/no-conversation-transcript rule and ancestor conversation
confinement. Do not weaken EXST-12 globally or route content through the existing
child tap. Any required change to PIC-77's retired transient-surface policy must
name this new inspector rather than silently reviving the old status widget.
No normative spec edit or implementation is authorized by this draft.

## Open questions

- Which supported host API resolves the effective renderers and hosts their
  components outside the conversation transcript?
- What automatic active-call presentation, expansion/navigation affordances,
  and visibility settings match ordinary tool-call inspection without blocking
  input or competing with the existing run card?
- What bounded retention policy preserves useful completed-call inspection, and
  is a separate opt-in durable operator trace needed?
- What code-origin lifecycle transport can RPC/JSON consumers subscribe to
  without creating ordinary transcript cards or messages?

## Provenance

- Owner request in this conversation: a separate observability RFC, equivalent
  to identical model tool calls, with neither conversation turns nor appearance
  in the conversation transcript. The detached view is a proposed mechanism,
  not an operator-approved layout.
- `resolvePiTool` (`src/extension/callable-pi-tool-resolver.ts`): current direct
  built-in execution supplies no partial-update callback.
- `bashRender` (`pi-config/extensions/bash-render/index.ts`, external canonical
  pi-config checkout): installed call renderer, delegated execution wrapper,
  shared trace identity, and inherited result renderer.
- Pi 1.4.0 `docs/extensions.md` / `docs/tui.md` and the interactive host's
  `tool_execution_start` handling: renderer selection and component lifecycle;
  ordinary tool events currently feed transcript rows, so detached routing is
  a design requirement, not an existing API claim.
- EXST-1/5/8/12 (`../spec_topics/execution-status.md`): current channel, bounded
  child projection, sink set, and class-3 content exclusion.
- SLSH-2 (`../spec_topics/slash-invocation.md`): ordinary prompt-mode model-tool
  visibility and ancestor conversation confinement.
- PIC-75/77 (`../spec_topics/pi-integration-contract/theta-run-entries.md`) and
  RFCs 0010/0015: current LLM-context-free in-transcript run-card surface and
  retired footer/widget sinks; context exclusion alone does not meet this RFC.
- Bug 0520 (`../bugs/0520-code-side-bash-empty-output-binds-host-placeholder.md`):
  the bound string remains rendered-text pass-through, not raw output capture.
