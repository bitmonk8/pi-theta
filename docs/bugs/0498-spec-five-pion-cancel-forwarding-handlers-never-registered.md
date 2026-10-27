# Bug 0498 — five spec files and the b0416 witness describe cancellation forwarding from five persistent `pi.on` turn-lifecycle handlers that are never registered: the shipped forwarding is driver-local, and the five-handler subscription helper is production-dead code exercised only by its own unit test

- **Status:** fixed (unreleased - commit/push only). No new package release is
  published; the existing published package version does not contain this fix.
  No resolving commit SHA is assigned by this record.
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

## Fix record (unreleased)

The sections above preserve the original report and its historical offsets.
At the verification base `61d4faecde2a63a0f473d08e0b7471775e3edeb4`, bug
0483 is already fixed: its deferred recorder is present. This correction
changes the architectural contract and removes unused machinery; it does
not repair a demonstrated user-visible cancellation failure or install new
handlers. The base SHA identifies the pre-fix checkout, not a resolving commit.

### Cause and actual correction

The five-event subscription helper was authored but never composed into a
production extension. Its two self-tests proved manual subscription, not
production installation. PIC-18 and four dependent documents continued to
describe that uninstalled architecture; b0416's comments repeated it even
though its real-registration assertion measured only the two governor events.

The applied patch is:

- `docs/spec_topics/pi-integration-contract/conversation-drive.md`: PIC-18
  describes dispatch/binding signal forwarding, the driver's per-attempt
  deferred recorder, re-arming across run signals, listener disposal and the
  separate post-settle aborted-signal check. PIC-78 retains classification,
  recovery rides and cancellation disposition; CNCL-4 retains reason identity
  and the exact `"theta cancelled by agent_end"` synthesis. The historical
  trigger name does not imply an `agent_end` subscription. Only the approved
  cancellation-forwarder example changes in the Hang-handling paragraph.
- `docs/spec_topics/cancellation.md` and
  `docs/spec_topics/pi-integration-contract/host-interfaces-core.md`: forwarding
  summaries delegate to PIC-18/PIC-78 instead of nonexistent callbacks.
- `docs/spec_topics/pi-integration-contract/host-prerequisites.md`:
  presupposition (v) names active-run signal identity, notification and abort
  state at the driver's actual observation points. Other presuppositions,
  the six-item count and best-effort posture remain unchanged.
- `docs/spec_topics/pi-integration-contract/version-bump-step2.md`: item (v)
  audits those signal dependencies; item (ah)'s rationale describes actual
  governor cross-fire rather than harmless phantom handlers. Stable anchors,
  joint process-global/no-origin audits and governor item (at) are retained.
  These two checklist/prerequisite files also receive the separately approved
  uniform CRLF-to-LF conversion; no additional wording changes accompany it.
- `src/runtime/conversation-drive.ts`: remove only
  `PromptModeLifecycleEvent`, `PROMPT_MODE_LIFECYCLE_EVENTS`,
  `PromptModeEventApi`, `ActiveInvocationSignals`,
  `subscribePromptModeCancelForwarding` and their exclusive scaffolding.
  Active-set computation and trailing-turn extraction are unchanged.
- `tests/conversation-drive.test.ts`: retire exactly the two authorized
  helper self-tests and exclusive scaffolding; all retained test groups are
  unchanged. `tests/b0416-pic18-governor-event-enumeration.test.ts` changes
  comments only; executable assertions, names and order remain unchanged.
- Add the frozen clause witness
  `tests/b0498-cancellation-forwarding-clauses.test.ts`, real SDK/provider
  witness `tests/live/b0498-cancellation-forwarding-contract.test.ts` and
  separate positive mechanism/audit coverage
  `tests/b0498-forwarding-mechanism-positive.test.ts`. The positive tests reject
  each omitted requirement and missing anchor independently.

The production basis is `DeferredHostAbort` and
`LivePromptQueryModel.#driveUserVisibleTurn`
(`src/extension/live-prompt-query-driver.ts`),
`forwardSlashCommandCancel` / `abortForAgentEnd`
(`src/runtime/cancellation-core.ts`), the dispatch/binding forwards in
`src/extension/theta-composition-producer.ts` and
`src/extension/production-theta-producer.ts`, and `PromptToolLoopGovernor`
(`src/extension/prompt-tool-loop-governor.ts`). Those production mechanisms
are unchanged. Installing the old immediate-abort helper would conflict
with the existing settle-classified recovery contract and is not the fix.

### Red-to-green evidence, controls and review

Durable run directory (all artifact names below are relative to it):

```text
/home/thomasa/Projects/pi-theta/.pi/tmp/fix-bug-0498-0516fbbd-16b9-461a-84d1-3bdcdf36030b
```

Exact witness commands, run from the dedicated worktree:

```bash
npx vitest run --config config/vitest/vitest.live.config.ts tests/live/b0498-cancellation-forwarding-contract.test.ts
npx vitest run tests/b0498-cancellation-forwarding-clauses.test.ts
```

- **Pre-fix live red, exit 1:**
  `reproduce-attempt-1-live-witness-corrected.log` and controller `red-0.json`
  fail on `B0498_SPEC_RUNTIME_MISMATCH`: five offending document paths,
  expected `[]`. Before that assertion, the shipped extension completes the
  real arithmetic query, yields nonempty assistant text, settles idle, emits
  no fail-closed system notes and registers exactly
  `["before_provider_request", "tool_call"]`. Both oracle controls pass.
  The earlier test-author TypeError is preserved and rejected as bug evidence.
- **Pre-fix unit red, exit 1:** `diagnose-attempt-1-unit-red.log` and
  `red-1.json` contain five named clause mismatches, including
  `B0498_PIC18_PHANTOM_FORWARDING`, with three healthy/original-clause
  rejection/missing-paragraph controls passing.
- **Post-fix witnesses, exit 0:** latest controller captures `green-3-0.json`
  record all three live cells passing; `green-3-1.json` records all eight clause
  cells passing. Earlier `green-1-0.json` / `green-1-1.json` remain preserved.
  Both frozen witness sources, commands, signatures, manifest and original
  reds are preserved, not rebaselined.
- **Required gates, exit 0:** latest controller `gate-3-initial-0.json`
  records `npm run typecheck`; `gate-3-initial-1.json` records `npm test`
  (767 files / 13,176 tests); `gate-3-initial-2.json` records the exact live
  command above. `implement-attempt-4-lint.log` / `.exit` record
  `npm run lint`, exit 0. The fresh retained-root implementation full suite
  also passes in `implement-attempt-4-default.log` / `.exit`: the formerly
  timed-out workflow completes in 213,936 ms under its unchanged 240-second
  deadline. The default suite includes the committed-fixture parse gate and
  provider-free real-child tests; it excludes live tests.
- **Independent controls, exit 0:** `audit-fix-g9-controls.log` records 123
  focused tests, including the clause/positive witnesses, retained
  conversation-drive tests, b0416, b0319 reverse-bridge, b0483 recorder/recovery,
  cancellation-core, production wiring and governor controls.
  `audit-fix-g9-live.log` records five live cells: the frozen witness and both
  retry-off/on arms of `tests/live/b0483-host-recovery-live.test.ts`.
  The latter require one continuation/ride note, the first query's value 777
  and no cancelled/Err/panic ending, not merely a resolved prompt.
- **Independent verdict:** `fix-review.md` is **CLEAN — no actionable
  in-scope must-fix finding**. Its latest generation-9 checks are captured in
  `audit-fix-g9-integrity.log` and `audit-fix-g9-integrity-followup.log`:
  exact authorized document bytes, two-cell retirement, unchanged b0416
  executable text, frozen evidence and passing plain `git diff --check`.
  The follow-up resolves an overbroad reviewer whole-host-file equality
  assumption by inspecting the host differences; no source repair occurs.
  Earlier evidence-review failures remain historical; latest
  `evidence-review.md` is CLEAN and accepts subsequent retained-root results.

The first closure's nine-file focused control set passes in
`close-attempt-1-controls.log`, exit 0, 123 tests. Resumed closure refreshes this
record against the latest green gates and clean independent review; it does
not reapply the implementation. The run's `close.md` records fresh closure
checks and exact commands/exits. Independent review captures remain separate.
The run's `implement.md`, `plan.md`, `close.md` and immutable history provide
the command/exit/provenance ledger.

### Authority, preserved failures and limits

The exact normative correction and bounded helper/test retirement are recorded
in `decision-9eb3e886-7633-485e-96f8-b492c65605a5/record.json`; the subsequent
`human-record.json` records the owner-selected removal despite possible
external deep-import breakage. The two-file LF exception is separately
recorded in `decision-407fd44e-6019-490a-afa5-992f893697fc/record.json` and
retained by `decision-bea2760a-5fde-4637-aa45-5eb1de707065/record.json` after
fresh replan/review. None of these decisions grants shipment authority.

The original whitespace failure remains in `implement-attempt-1-integrity.log`
(git exit 2 / wrapper exit 1); only the authorized LF conversion resolves it.
`implement-attempt-2-default.log` preserves a complete-workflow
`spawnSync ETIMEDOUT` (exit 1) before workflow assertions, under the unchanged
240-second deadline. Its cause remains unknown. Later authorized retained-root
full-default runs and controller verification pass without timeout, assertion
or scheduling-policy changes; a copied-source diagnostic green is not used
as this run's gate. No historical failure is relabeled a pass or waived.

Live verification uses repository-pinned Pi 1.3.0 and `gpt-6.1-sol`. Independent
source comparison finds the relevant extension runner/types and run-signal
lifecycle identical in operator Pi 1.4.0; this is not a separate 1.4.0 live run.
The witness does not inject physical TUI Esc, prove spawned-child cancellation
timing, close no-signal observation gaps or establish concurrent-embedding
safety. Governor blocking/armed-window/process-global limitations,
PIC-78/PIC-79 precedence and CNCL-4 reason semantics remain intact. External
deep-import consumers of the removed exports are unmeasured, not proven absent.

Bug [0500](./0500-post-reply-threshold-compaction-misread-as-unanswered.md)
remains open; its post-reply compaction predicate is unchanged. No new residual
bug is filed from this closure: the historical timeout is unexplained, not a
newly diagnosed defect, and existing observation/embedding limitations are
preserved rather than claimed repaired.

This record marks the correction fixed **unreleased - commit/push only**.
No staging, commit, push, tag, version/dependency bump or package publication
is performed. No new package release is published, and the existing published
version is not credited with this fix. A later shipment commit must supply
its own resolving SHA.

## Provenance

- Original report: release-review observation dated 2026-09-28, preserved above;
  its older source positions and “0483 in flight” status remain historical.
- Corrected contract: PIC-18/PIC-78/PIC-79 in
  `docs/spec_topics/pi-integration-contract/conversation-drive.md`, CNCL-4 in
  `docs/spec_topics/cancellation.md`, cancellation source in
  `docs/spec_topics/pi-integration-contract/host-interfaces-core.md`,
  presupposition (v) in `host-prerequisites.md`, audit items (v)/(ah)/(at) in
  `version-bump-step2.md` in the same directory.
- Implementation, original-red/green/controls, authorization and review claims:
  the named source symbols, frozen witness files, controller records and
  captured artifacts above; full ledger and closure-only integrity results
  are in the run directory's `close.md`.
