# Bug 0498 — five spec files and the b0416 witness describe cancellation forwarding from five persistent `pi.on` turn-lifecycle handlers that are never registered: the shipped forwarding is driver-local, and the five-handler subscription helper is production-dead code exercised only by its own unit test

- **Status:** open
- **Owning repo:** pi-theta (spec + tests + one dead runtime export; no
  behaviour change)
- **Sev/Diff estimate:** S4/D2 — S4: no runtime defect. The end-to-end
  behaviour the five-handler paragraphs promise (Esc during an `@`-query
  turn cancels the theta) is delivered by the driver-local forwarding
  below, so no user-observable path is broken. The cost is spec integrity
  at the exact seam bug 0483's fix is editing: the normative "realised by
  these persistent handlers" sentences are false, the version-bump
  checklist audits delivery into handlers that do not exist (while the
  real observation points go unaudited), presupposition (v) pins host
  behaviour nothing consumes, and the b0416 witness re-states the phantom
  architecture as its premise. Every future reader of the cancellation
  chain — including the 0483 fixer, whose deferred-recorder change
  rewrites the per-turn forward these paragraphs misdescribe — must first
  discover the spec is wrong. D2: a multi-file doc rewrite plus test
  premise updates plus a dead-export removal; no production logic change.
- **Where (stale five-handler claims):**
  - `docs/spec_topics/cancellation.md:9` — the slash-command bullet's lead
    sentences: "The handler subscribes for the duration of the theta run.
    Whenever a Pi turn is active and the per-handler `ctx.signal` is
    observed inside one of the runtime's own event handlers (`tool_call`,
    `tool_result`, `message_update`, `turn_end`, `agent_end`), an aborted
    `ctx.signal` triggers `thetaAbort.abort()`".
  - `docs/spec_topics/pi-integration-contract/conversation-drive.md:27`
    (PIC-18) — the load-bearing paragraph: "theta 1.0's
    cancellation-forwarding handlers consume exactly the five members
    above"; "the prompt-mode turn-lifecycle handlers are therefore
    process-global, registered once and persisting for the extension
    instance's lifetime"; "The per-invocation … behaviour … is realised by
    these persistent handlers forwarding the active invocation's captured
    `ctx.signal` into its `thetaAbort`"; "The five cancellation-forwarding
    handlers' sole prompt-mode role is cancellation forwarding, so
    cross-fire from an unrelated session's turn event into them is
    harmless".
  - `docs/spec_topics/pi-integration-contract/host-interfaces-core.md:122`
    (**Cancellation source**) — "the runtime forwards Pi's turn-side
    `ctx.signal` (when defined and observed inside one of the runtime's
    `tool_call` / `tool_result` / `message_update` / `turn_end` /
    `agent_end` handlers) into `thetaAbort.abort()`"; and `:124` — "how Pi
    delivers the turn-lifecycle events the cancellation-forwarding
    handlers consume".
  - `docs/spec_topics/pi-integration-contract/host-prerequisites.md:87` —
    presupposition (v) of the slash-handler promise-lifecycle posture:
    "Pi delivers each of the five turn-lifecycle events the runtime's
    cancellation-forwarding handlers subscribe to … to the subscribed
    extension during the active user turn … read from inside these
    handlers".
  - `docs/spec_topics/pi-integration-contract/version-bump-step2.md:70` —
    bump-checklist item (v) audits "the five turn-lifecycle events the
    runtime's cancellation-forwarding handlers subscribe to" and warns a
    delivery regression "would degrade the Esc-during-`@`-query
    cancellation-forwarding path to a no-op".
  - `tests/b0416-pic18-governor-event-enumeration.test.ts:1–38` — the
    witness header restates the five persistent handlers as shipped fact
    ("the handlers' sole prompt-mode role is cancellation forwarding");
    its cells (B)–(D) extract and assert against the PIC-18 paragraph
    whose five-handler frame this bug corrects.
- **Where (the implementation reality):**
  - `src/runtime/conversation-drive.ts:83–98` —
    `PromptModeLifecycleEvent` / `PROMPT_MODE_LIFECYCLE_EVENTS` (the five
    names) and `:127–152` — `subscribePromptModeCancelForwarding`, the
    function that would register them. Production imports from this module
    only `extractTrailingTurnText` and `computeActiveSetInstall`
    (`src/extension/callable-lowering.ts:30`,
    `src/extension/live-prompt-query-driver.ts:11`,
    `src/runtime/prompt-transport-mapping.ts:65`); the sole callers of the
    subscription helper are its own unit cells
    (`tests/conversation-drive.test.ts:338, 355`).
  - The complete production `pi.on` registration inventory:
    `src/extension/prompt-tool-loop-governor.ts:116, 119`
    (`before_provider_request`, `tool_call` — the governor's effectful
    round-bounding/blocking handlers, not cancellation forwarding);
    `src/extension/factory.ts:576, 590, 1111` (`resources_discover`,
    `session_start`, `session_shutdown` — not turn-lifecycle);
    `src/extension/production-host-loop-dispatch.ts:408` (`agent_settled`
    — not one of the five, not forwarding). No production site registers
    `tool_result`, `message_update`, `turn_end`, or `agent_end`, and the
    only `tool_call` handler is the governor's.
  - The forwarding that actually ships is driver/dispatch-local, attached
    to signals rather than to `pi.on` events:
    `src/extension/live-prompt-query-driver.ts:861` — the per-turn
    `forwardSlashCommandCancel(this.#thetaAbort, this.#ctx.signal)` (a
    `{once: true}` listener on the per-turn transient `ctx.signal`,
    `src/runtime/cancellation-core.ts:130`) — and `:945` — the post-settle
    CNCL-4 `agent_end`-reason synthesis `abortForAgentEnd`
    (`cancellation-core.ts:164`), which fires off the settled turn's state,
    not off any `agent_end` event. The bind/dispatch-time forwards
    (`src/extension/theta-composition-producer.ts:219`,
    `src/extension/production-theta-producer.ts:817–820`) attach at idle
    entry where `ctx.signal` is `undefined`.
  - `docs/bugs/0483-host-recovery-abort-cancels-theta-instead-of-riding-the-retry.md`
    §Measured host facts already records the finding: "The only production
    sites that convert the stall abort into `thetaAbort` are driver-local
    … no persistent five-event forwarding handlers exist. The fix is
    therefore local to the driver."

## Observed (2026-09-28, release review of the 0483 fix)

The 0483 review walked the cancellation chain to place the fix's deferred
recorder and found the spec's realisation story does not exist in `src/`.
Cross-check, all on main at a79c1c1e:

- `grep -rn "pi\.on(" src/` yields exactly the six registrations listed
  under **Where**; none of them is a five-event cancellation-forwarding
  handler.
- `subscribePromptModeCancelForwarding` has zero production callers; the
  b0416 witness itself proves the shipped turn-lifecycle subscription set
  is `["before_provider_request", "tool_call"]` (its cell (A) asserts
  exactly that), which contradicts the surrounding five-handler premise
  its own header restates.
- The five-event enumeration nonetheless appears normatively in five spec
  files (the **Where** list), each presenting the persistent handlers as
  the mechanism that realises the "subscribes for the duration of the
  theta run" behaviour.

History: the five-handler design was specified and its helper authored
together (V9c, commit 68139757, wrote `subscribePromptModeCancelForwarding`
against PIC-18), but no composition root ever called it — `git log -S`
over `src/` shows the symbol has only ever lived in
`src/runtime/conversation-drive.ts`. What shipped instead is the
driver-local per-turn forward (the bug 0288 settle rework and bug 0319
one-shot guard consolidated on `forwardSlashCommandCancel`), and the
spec, the bump checklist, the presupposition, and the b0416 restatement
were never re-anchored. Bug
0416's fix widened PIC-18 to name the governor's two subscriptions but
left the five-handler frame intact around them.

## Expected

The spec describes the forwarding that ships. One mechanism paragraph
(natural home: PIC-18, with `cancellation.md` and **Cancellation source**
deferring to it) that says: prompt-mode cancellation forwarding is
driver-local — a per-turn one-shot listener on the turn's transient
`ctx.signal` attached inside `#driveUserVisibleTurn` (which the 0483 fix
turns into a deferred recorder that records the abort and lets the
settle-classification decide between ride and cancel), plus the
post-settle CNCL-4 `agent_end`-reason synthesis, plus the bind-time
forwards at dispatch — and that the ONLY turn-lifecycle `pi.on` consumers
are the governor's two effectful handlers. Presupposition (v) and bump
item (v) pin what the real observation points consume: per-turn
`ctx.signal` identity/freshness across the driven turn's polls, not event
delivery into five handlers.

## Actual

Five spec files, the b0416 witness's premise, and a production-dead
runtime export all describe a persistent five-handler `pi.on` forwarding
architecture that no production code registers.

## Fix direction

Doc-and-test-only, coordinated with the 0483 fix (its deferred recorder
rewrites the very sentence PIC-18 should now describe; land this
correction with or after it, against the recorder wording):

1. **PIC-18 rewrite** (`conversation-drive.md:27`): scope the paragraph to
   what `pi.on` is actually used for — the governor's
   `before_provider_request` + blocking `tool_call` (keeping the b0416
   armed-window and process-global/no-origin-marker material, which is
   correct and load-bearing) — and replace the five-handler realisation
   sentences with the driver-local mechanism: per-turn deferred
   recorder on `ctx.signal` (0483), post-settle `abortForAgentEnd`
   synthesis, bind-time forwards. Keep the rule "`pi.on` events MUST NOT
   resolve query completion".
2. **`cancellation.md:9`**: reword the slash-command bullet's lead to name
   the driver's observation points (per-turn signal listener re-checked
   across the send/start/settle polls; post-settle synthesis) instead of
   "inside one of the runtime's own event handlers (`tool_call`, …)".
   CNCL-4's reason-propagation rules are unaffected (the synthesised
   `"theta cancelled by agent_end"` reason is already produced by
   `abortForAgentEnd` without any event handler).
3. **`host-interfaces-core.md:122/:124`, `host-prerequisites.md:87` (v),
   `version-bump-step2.md:70` item (v)**: re-anchor to the real
   consumption — Pi keeps the per-turn `ctx.signal` live and its
   `aborted`/`reason` fresh while the driven run is active (what the
   driver's polls and the deferred recorder read), dropping the
   five-event delivery claims. Bump item (v) then audits `ctx.signal`
   freshness plus the governor's two events (the latter already covered
   by the b0416-added item).
4. **Code/test hygiene**: delete `PromptModeLifecycleEvent`,
   `PROMPT_MODE_LIFECYCLE_EVENTS`, `PromptModeEventApi`, and
   `subscribePromptModeCancelForwarding`
   (`src/runtime/conversation-drive.ts:83–152`) and their cells in
   `tests/conversation-drive.test.ts`; update the
   b0416 witness header/premise comments to the corrected PIC-18 frame
   (its assertion cells keep passing — they pin text the rewrite keeps).
   Wiring the dead subscription up instead is rejected: a persistent
   global forward would fight the 0483 deferral design (an instant
   `thetaAbort` abort is exactly what the ride must NOT do), and the
   driver-local forward already delivers the behaviour.

## Relation to prior bugs

- **0483 (open, fix in flight)** — its §Measured host facts first
  recorded that the handlers do not exist; its fix converts the per-turn
  forward into the deferred recorder this correction must describe. This
  bug is that record filed as the spec defect.
- **0416 (fixed)** — widened PIC-18 for the governor's sixth event and
  blocking role but kept the five-handler frame; its witness's premise
  comments are updated here.
- **0319 / 0288 (fixed)** — the one-shot `forwardSlashCommandCancel`
  consolidation and the settle-poll rework that made the driver-local
  forward the real mechanism.
