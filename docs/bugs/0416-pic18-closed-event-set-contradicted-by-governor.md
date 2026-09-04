# Bug 0416 — PIC-18's closed event-consumption claim is false at HEAD: the governor consumes a sixth `pi.on` event (`before_provider_request`) in a load-bearing role, and its `tool_call` handler BLOCKS calls — contradicting PIC-18's "sole prompt-mode role is cancellation forwarding, so cross-fire … is harmless" — while the version-bump audit that protects the five pinned events never covers the sixth

- **Status:** fixed (0.408.0).
- **Sev/Diff estimate:** S4/D2 — the present-tense defect is a false closed enumeration plus an audit fence excluding the governor's load-bearing sixth event (both runtime consequences are latent at HEAD per the verified reachability analysis); fix is spec-side across PIC-18, the bump checklist, and the cross-fire scoping caveat, no code change.
- **Kind:** spec gap / doc-registry inconsistency — spec and implementation
  together fail to deliver the documented property: the spec's closed
  enumeration and its harmless-cross-fire rationale are contradicted by
  shipped subscriptions the spec never acknowledges, and the spec's own
  audit machinery (bump checklist item (v)) consequently leaves the
  ceiling-#2 mechanism's event dependency un-audited.
- **Related:**
  - [0323](./0323-probe-failed-step-set-registry-contradiction.md) (fixed
    0.342.0), [0356](./0356-codetoolerror-validation-errors-field-contradiction.md)
    (fixed 0.371.0),
    [0376](./0376-teardown-call-label-set-underenumerates.md) (fixed
    0.372.0) — same class: a normative closed set contradicted by the
    shipped surface (probe `details.step`, `CodeToolError.validation_errors[]`,
    `TEARDOWN_STEP_CALL_LABELS[4]`; here: a closed event set).
  - Report 03 in this area — the governor's boundary-case behaviour; this
    report is about the spec's account of the governor's *mechanism*, not its
    accounting.
- **Affected** (verified at `c2c25d81`, v0.398.0):
  - `docs/spec_topics/pi-integration-contract/conversation-drive.md:27`
    (PIC-18): "The prompt-mode driver observes Pi's turn-lifecycle events —
    `tool_call`, `tool_result`, `message_update`, `turn_end`, and `agent_end`
    …"; "it is overloaded on a closed event-name union, of which theta 1.0
    consumes exactly the five members above"; "their sole prompt-mode role is
    cancellation forwarding, so cross-fire from an unrelated session's turn
    event is harmless — it triggers only a re-check of a non-aborted captured
    signal."
  - `src/extension/prompt-tool-loop-governor.ts:103–120` —
    `ensureRegistered` subscribes `pi.on("before_provider_request", …)` (a
    sixth consumed member) and `pi.on("tool_call", …)`; `:186–199` — the
    `tool_call` handler returns `{ block: true, reason }` (round-cap
    exhaustion and the CIO-3 model-arg depth block) — an effectful role well
    beyond "re-check of a non-aborted captured signal".
  - `src/extension/production-theta-producer.ts:3077` — production
    registration (`ensureRegistered(deps.pi)` on the first user-visible
    query), so both subscriptions are shipped behaviour, process-global,
    never unregistered.
  - `docs/spec_topics/pi-integration-contract/version-bump-step2.md:70`
    (bump-checklist item (v)) — audits delivery of "each of the five
    turn-lifecycle events the runtime's cancellation-forwarding handlers
    subscribe to"; `before_provider_request` — on which the whole prompt-mode
    ceiling-#2 bound depends for round-boundary detection — appears in no
    checklist item. `docs/spec_topics/implementation-notes.md:22` disclaims
    only a `before_provider_request` *payload-rewrite* hook ("The runtime
    does **not** install a `before_provider_request` payload-rewrite hook in
    theta 1.0"), which does not describe or license the governor's
    round-boundary listener.
- **Observed at:** v0.398.0 (`c2c25d81`). Offline: code/spec reading; the
  governor's block behaviour and armed-window statefulness confirmed by unit
  probe (scratch, deleted — same rig as report 03).

## Summary

PIC-18 pins a closed consumption set (five events) and rests a normative
conclusion on the handlers' passivity: because their "sole prompt-mode role
is cancellation forwarding", cross-fire from an unrelated session's events
"is harmless". At HEAD the shipped extension also consumes
`before_provider_request`, and its `tool_call` subscription is not passive:
while a drive is armed (`begin(maxRounds)` → turn settles → `end()`), the
handler counts rounds and BLOCKS tool calls (`{ block: true }`) — the
prompt-mode enforcement point for ceiling #2 and ceiling #4's model-driven
row.

The present-tense, verified defect is the doc/audit contradiction: a sixth
subscription the closed enumeration denies, an effectful `tool_call` handler
the harmless-cross-fire rationale does not describe, and
`before_provider_request` outside the bump audit. Both derived consequences
below are LATENT at HEAD — neither is reachable in a shipped
single-session host at v0.398.0:

1. **The harmless-cross-fire rationale does not cover the shipped handlers
   (latent).**
   `pi.on` events are process-global with no per-session origin marker (the
   property PIC-18 itself pins, re-audited per bump item (ah)). During an
   armed window, a `tool_call` from any other `AgentSession` in the parent
   process — PIC-18's own text names "the user shell session and any
   concurrent prompt-mode thetas" as live sources of such cross-fire —
   debits the driven theta's round budget (`before_provider_request`
   cross-fire additionally splits a parallel round via `roundBoundary`), and
   past the cap is blocked with reason `tool_loop_exhausted`, suppressing an
   unrelated session's tool execution. The spec asserts this class of
   interference cannot happen ("harmless"); the implementation gives it a
   blocking lever. (Reachability requires a second in-process session with a
   concurrent tool-calling turn during the armed window; theta 1.0's own
   PIC-2 serialisation is per-session and does not close it. Not
   live-reproduced; the interference mechanics are confirmed at the unit
   level — the governor keys on nothing session-scoped. Subagents run in
   child processes (RFC-0006) and the TUI drives one session, so the
   reachable hosts are SDK embeddings and the live harnesses.)
2. **The sixth event is un-audited (latent hazard, present audit gap).**
   Bump-checklist item (v) exists because
   a silent rename/removal/gating of a subscribed event "would degrade the …
   path to a no-op with no build-time SDK surface-inventory signal" — and it
   enumerates only the five. A Pi minor that renames or stops delivering
   `before_provider_request` silently degrades the governor: `roundBoundary`
   is set once by `begin()` and never again, so the first tool round consumes
   the only counted slot and every subsequent native round shares it —
   `tool_loop.max_rounds` becomes unbounded ABOVE 1 with zero diagnostics.
   The spec's audit machinery cannot see this because PIC-18 says the event
   is not consumed.

## Reproduction

Spec/implementation cross-reading (citations above), plus the unit probe of
report 03 demonstrating the armed-window block behaviour
(`{ block: true, reason: "tool_loop_exhausted" }`) that the "harmless"
sentence precludes. For consequence 2, the degradation shape is mechanically
forced: without `before_provider_request`, `#onProviderRequest` never runs,
`roundBoundary` stays false after the first round
(`prompt-tool-loop-governor.ts:175`), and `roundsAllowed` can never advance
past 1.

## Expected behaviour

Either the spec's account is complete — PIC-18 (or a sibling PIC) names every
`pi.on` member theta consumes, states the governor's blocking role, scopes
the harmless-cross-fire claim to the cancellation-forwarding handlers only,
and the bump checklist audits `before_provider_request` delivery and
`ToolCallEventResult.block` semantics alongside the five — or the
implementation confines itself to the pinned five events.

## Actual behaviour / root cause

The governor (Phase 4 STAGE B) was added to bound pi's native prompt-mode
tool loop after PIC-18 was written; the PIC was never widened. The
implementation-notes sentence about `before_provider_request` addresses a
different (rejected) mechanism — the payload-rewrite hook — and reads, at
HEAD, as if theta does not touch the event at all.

## Why it matters

What is true at HEAD is the contradiction itself: the spec's closed
enumeration and passivity rationale are false against the shipped surface,
and the audit fence excludes the governor's event dependency. Both runtime
consequences are latent: consequence 1 requires a second concurrent
in-process `AgentSession` (subagents are child processes; no shipped host
runs two), and consequence 2 requires a future Pi minor renaming or gating
`before_provider_request` — nothing is un-bounded at v0.398.0. The severity
case rests on audit coverage: the PIC is the contract page a Pi version bump
is audited against, item (v) protects exactly the enumerated set, and the
event whose silent loss WOULD un-bound ceiling #2 (mechanically forced, see
§Reproduction) sits outside the fence the spec built for precisely that
failure mode. The harmless-cross-fire sentence is also the kind of claim a
future maintainer will rely on when reasoning about multi-session hosts.

## Non-goals

- The governor's boundary-case accounting (report 03).
- The five cancellation-forwarding subscriptions and their conformance
  (`subscribePromptModeCancelForwarding`, `conversation-drive.ts:118–147`) —
  they match PIC-18 as written.
- Any claim that concurrent in-process sessions are common at theta 1.0 —
  reachability of consequence 1 is stated with its precondition; consequence
  2 (the audit hole) needs no concurrency at all.

## Fix (0.408.0)

- What shipped (spec-side, doc-only — the recommended §Fix; no code change):
  - `docs/spec_topics/pi-integration-contract/conversation-drive.md` (PIC-18) —
    the closed "exactly the five members" claim is scoped to the
    cancellation-forwarding handlers, and PIC-18 now enumerates the
    `PromptToolLoopGovernor`'s two subscriptions and their roles:
    `before_provider_request` (round-boundary detection) and the `tool_call`
    handler returning a `ToolCallEventResult` that can `block` a call (the
    prompt-mode enforcement point for ceiling #2 exhaustion and ceiling #4's
    model-driven depth row). The harmless-cross-fire sentence is scoped to the
    five cancellation-forwarding handlers, and an *armed*-window caveat is added:
    while a drive is armed (`begin` → settle → `end`) a concurrent in-process
    `AgentSession`'s tool calls may be debited against / blocked by the driven
    theta's budget; theta 1.0 accepts this (subagents are child processes,
    the TUI drives one session, so the reachable hosts are SDK embeddings /
    live harnesses), and session-scoping the governor's handlers is unavailable
    at the pin because the events carry no per-session origin marker.
  - `docs/spec_topics/pi-integration-contract/version-bump-step2.md` — a new
    bump-checklist item (at) audits `before_provider_request` delivery and the
    host honouring a `tool_call` handler's `block`; item (ah)'s harmless-cross-
    fire clause is scoped to the five cancellation-forwarding handlers with the
    governor's armed-window exception cross-linked to PIC-18.
- Gates: witness `tests/b0416-pic18-governor-event-enumeration.test.ts` 5/5 —
  (A) shipped-surface control (the governor subscribes `before_provider_request`
  + `tool_call` and the `tool_call` handler blocks) green both directions;
  (B) PIC-18 enumerates every subscribed event, (C) PIC-18 describes the
  `tool_call` blocking role, (D) PIC-18 carries the armed-window caveat,
  (E) the bump checklist audits `before_provider_request` — all RED at fork,
  green after. Full default suite 572 files / 10441 tests green; `tsc
  -p tsconfig.json --noEmit` exit 0; `eslint src/**/*.ts` clean; the citation
  gate (bug 0134) green (the witness header uses symbol form, no bare
  `path:line` continuations).
- Review: 2 rounds. R1 (`bug-fix-reviewer`, deep) — F1 `spec` (the unscoped
  harmless-cross-fire claim survived in bump item (ah); scoped it in the same
  edit) plus two prose residuals (drop the undefined "STAGE-B" codename; add the
  `#ceiling-4-table` cross-ref) — all applied. R2 (`bug-fix-reviewer-fast`) — CLEAN.
- Verification: VERIFIED. (1) revert-witness — reverting the PIC-18 widening +
  the bump item reds (B)/(C)/(D)/(E) (the spec text lacks the enumeration / role
  / caveat / audit) with (A) green, restored byte-exact and EOL-preserved,
  green; (2) full suite 10441/10441 green; (3) no live (doc-only, no drive-
  outcome change); (4) tsc exit 0, lint clean; a corpus sweep confirms no
  unscoped harmless-cross-fire claim remains and the new anchors resolve.
- Residuals: none.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: the five cancellation-forwarding
  subscriptions (`subscribePromptModeCancelForwarding`) and their conformance
  test (`conversation-drive.test.ts` V9c-T) are UNTOUCHED (§Non-goal — they
  match PIC-18 as written); bump item (ah)'s process-global / no-origin-marker
  audit is unchanged apart from scoping its harmless clause. Both derived
  runtime consequences remain latent at v0.398.0 (a second in-process session
  is not run by any shipped host; `before_provider_request` is still delivered)
  — this fix closes the spec/audit contradiction, not a live regression. The
  implementation-side alternative (session-scoping the governor's handlers) is
  not available at the pin. Version placeholder `0.408.0` per the parallel-lane
  brief; package.json / CHANGELOG / README untouched, not committed in this lane.

## Provenance

- Spec measured against: `docs/spec_topics/pi-integration-contract/
  conversation-drive.md:27` (PIC-18), `docs/spec_topics/pi-integration-
  contract/version-bump-step2.md:70` (item (v)),
  `docs/spec_topics/implementation-notes.md:22`.
- Implementation: `src/extension/prompt-tool-loop-governor.ts:103–200`,
  `src/extension/production-theta-producer.ts:3077`,
  `src/runtime/conversation-drive.ts:76–147`.
- Found by: prompt-drive-lifecycle bug-hunt (seed 2/6 cross-check of the
  governor's event surface against PIC-18's enumeration).
