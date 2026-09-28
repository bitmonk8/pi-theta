# Bug 0496 — the registration-refusal outcome event fires inside pi-theta's `session_start`, before pi-theta-herdr's reporter activates: herdr drops the one-per-process event and a refused visible child's pane is never retitled `FAILED <label>`

- **Status:** open
- **Owning repo:** pi-theta-herdr (recommended fix — option (a) below);
  filed here because the emitter, the event contract, and the falsified
  0493 §Fix claim live in pi-theta.
- **Sev/Diff estimate:** S4/D1 — S4: cosmetic. The 0493 D1 (a) shutdown
  request still closes the refused child's pane ~1 s later; what is lost
  is only the `FAILED <label>` retitle and the `theta returned Err` idle
  report for the pane's final second and its history in herdr. Drive-time
  outcomes (the common case) are unaffected. D1: a single-slot latch in
  the reporter closure.
- **Where:**
  - pi-theta-herdr `src/herdr-child-reporter.ts` (0.3.0, commit
    `4eb5fa6`): `:260` — `onOutcome`'s first guard
    `if (!active || outcomeSeen || !isSubagentChildOutcomePayload(data))
    return;` drops any event received while inactive; `:207` — `active` is
    assigned ONLY in `onSessionStart` (herdr's own `session_start`
    handler); `:320` — the bus subscription itself is factory-time
    (`attach`), so the handler IS invoked for an early event — and
    discards it.
  - pi-theta `src/extension/production-composition.ts:1293–1316` — the
    bug-0493 D1 (a) refusal write: envelope →
    `emitSubagentChildOutcomeContained({ apiVersion: 1, outcome: "err",
    slug })` → `requestVisibleChildShutdown`, all executed inside the
    `session_start` compose pass (the load pass is the only writer for a
    refused marked root — the theta never enters a drive).
  - pi-config `package.json:20–24` — extension order: `./extensions`,
    `pi-theta`, `pi-theta-herdr`. pi-theta's factory (and therefore its
    `session_start` handler registration) precedes herdr's.
  - pi host (repo devDependency 0.80.10,
    `dist/core/extensions/runner.js:539–548`): `emit` awaits every handler
    SEQUENTIALLY in registration order, and `pi.events` delivery is a
    synchronous `EventEmitter.emit` (`dist/core/event-bus.js`). The drop
    is therefore deterministic ordering, not a race.
  - Payload compatibility is NOT the defect: channel
    (`pi-theta:subagent-child:outcome:v1`) and shape (`apiVersion: 1`,
    `outcome: "ok" | "err"`, non-empty `slug`) match exactly between
    pi-theta `src/runtime/subagent-placement-registry.ts:45–52` and herdr
    `src/protocol.ts:55, 75–84`.
  - The falsified claim: 0493's settled §Fix stated "pi-theta-herdr: no
    change (the 0.3.0 outcome consumer already retitles Err children it
    is told about; element (a) now tells it)". It is told — while it
    cannot listen. Recorded at fix time as 0493 Residual 2; this bug is
    that residual filed.

## Mechanism (2026-09-27, round-1 release review of the 0493 fix, commit d941f7df)

For a visible (herdr-placed) subagent child whose marked root refuses to
register:

1. The host loads extensions in pi-config order. herdr's factory
   `attach` subscribes `onOutcome` on the outcome channel — the
   subscription is live from factory time (D27).
2. The host emits `session_start` sequentially. pi-theta's handler runs
   first (registered first) and its compose pass ends the refusal with
   envelope → outcome event → shutdown request (the 0493 D1 (a) order).
3. The bus invokes herdr's `onOutcome` synchronously, mid-way through
   pi-theta's `session_start` handler. `active` is `false` — herdr's own
   `onSessionStart` has not run — so the guard returns and the event is
   discarded. `outcomeSeen` stays `false`, but the event is
   one-per-process (a refused process never enters a drive; the load pass
   is its only emitter) and is never re-emitted.
4. herdr's `onSessionStart` then sets `active = true` and reports
   working/idle as usual. No retitle, no `theta returned Err` message.
   The child's `ctx.shutdown()` closes the pane ~1 s later regardless.

Contrast: a DRIVE-time outcome (Ok or Err from `driveSubagentRootRegime`)
fires long after every extension's `session_start` has completed, so
`active === true` and the 0.3.0 behaviour (bug-0493-era retitle included)
is intact. Only the load-pass refusal emit hits the gap.

## Options

**(a) herdr latches an early outcome — RECOMMENDED (owning repo:
pi-theta-herdr).** In `onOutcome`, when the payload is valid but `active`
is `false`, store it in a single-slot latch instead of dropping; at the
end of `onSessionStart`, when the session decides child-role
(`active === true`), consume the latch through the same terminal-report
path (retitle + idle + `ERR_OUTCOME_MESSAGE`, or plain idle for `ok`),
setting `outcomeSeen` on consumption. Clear the latch on
`session_shutdown` (beside the existing subscription release) and on
consumption. One event per process makes a single slot sufficient; the
latch is order-independent (correct under any extension order and any
future early emitter), needs no pi-theta change, and degrades to today's
behaviour when never consumed.

**(b) pi-theta defers the refusal emit until every extension's
`session_start` has completed — REJECTED.** No host contract names that
point (a `setImmediate` is a guess about the host scheduler, and the
0.80.10 runner awaits handlers sequentially with no "all done" hook an
extension can observe); the spec-pinned envelope → event → shutdown order
(subagent.md `#subagent-child-outcome-event`) would be split or wholly
deferred, holding a child the load pass just declared useless open
longer; and it couples pi-theta's spec'd emission to sibling extensions'
activation internals — the next consumer with a different activation
model re-opens the gap.

Recommendation: **(a)**. Optional secondary (pi-theta, doc-only): one
consumer-expectation sentence at subagent.md
`#subagent-child-outcome-event` — the event MAY fire during
`session_start` (the load-pass refusal write), so consumers that activate
in their own `session_start` must latch rather than drop.

Residual after (a): the retitle still races the pane close (the shutdown
request lands ~1 s after the event; herdr's rename is enqueued at
activation and is advisory). Acceptable — the retitle's value is the
pane's label at close time and in herdr history, and a lost race is
exactly the status quo.

## Relation to prior bugs

- **0493 (fixed 0.493.0)** — D1 (a) created this emit (before it, the
  refusal path emitted NO event, so there was nothing to drop); its
  Residual 2 records this gap and already names the two candidate fixes.
  The §Fix's "pi-theta-herdr needs no change" is the sentence this bug
  corrects.
- **pi-theta-herdr 0.3.0** (commits `538bc10`, `4eb5fa6`) — the outcome
  consumer this event was aimed at; its D28 hold machinery and D34
  bounded hold are unaffected by the latch (the hold covers turn gaps
  while active, the latch covers the pre-activation window).

## Notes

- The pi-theta-herdr working tree carries an unrelated uncommitted change
  (`src/herdr-placement-backend.ts` `persistSession`, plus test edits) —
  out of scope here, untouched.
- Severity would rise if a future consumer keyed anything functional
  (e.g. cleanup, accounting) on the refusal outcome event: today's only
  shipped consumer is cosmetic, which is what caps this at S4.
