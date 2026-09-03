# Bug 0414 — An abort observed inside the pre-send-gate window still issues the user-visible send: `#driveUserVisibleTurn` has no abort check between the gate and `pi.sendUserMessage`, and the bug-0319 teardown listener refuses to attach on an already-aborted signal, so the post-Esc run streams unattended while the theta settles cancelled

- **Status:** fixed (0.403.0).
- **Sev/Diff estimate:** S2/D1 — an Esc burst during a busy pre-send gate (a plausible cancel path) issues a post-cancel user-visible turn that streams untorn-down, burning provider tokens after the theta settles cancelled; fix is one abort guard before `sendUserMessage`, mirroring the existing repair-boundary check, with an offline fixture.
- **Kind:** defect — `conversation-drive.md:16` (PIC-70): "when
  `thetaAbort.signal.aborted` is already true the runtime … answers
  `Err(QueryError { kind: "cancelled" })`", and each bounded wait "MUST stop
  promptly on an observed abort"; the implementation stops the wait, then
  issues the send anyway. The resulting run is never torn down — the exact
  harm class bug 0319 fixed for aborts landing DURING the driven turn,
  reopened for aborts landing BEFORE the send.
- **Related:**
  - 0319 (fixed 0.339.0) — the bidirectional `thetaAbort` → `ctx.abort()`
    bridge. Its fix scopes the teardown listener to the in-flight window via
    an attach guard (`if (!teardownSignal.aborted)`), which is exactly the
    guard that leaves this boundary instant unbridged: an abort that precedes
    the attach skips the listener AND fails to prevent the send.
  - 0288 (fixed 0.285.0) — introduced the pre-send gate this report's window
    sits in; its `#pollWhile` abort guard is what makes the gate exit
    promptly (correct), after which control falls into the send.
- **Affected** (verified at `c2c25d81`, v0.398.0):
  - `src/extension/production-theta-producer.ts:5341–5343` — the pre-send
    gate (`#pollWhile` exits early on `thetaAbort.signal.aborted`,
    `:5605–5610`; `#recordLifecycleExpiry` deliberately no-ops when aborted,
    `:5622–5625`).
  - `:5400–5401` — the teardown-listener attach guard: an already-aborted
    signal attaches nothing, so `onThetaAbortTeardown` (`:5380–5397`) never
    runs and `ctx.abort()` is never called for the turn about to be issued.
  - `:5452` — `this.#pi.sendUserMessage(text)` with no
    `thetaAbort.signal.aborted` check anywhere between the gate exit and the
    send.
  - Contrast (the discipline exists on the sibling path):
    `:5277–5284` — `driveRepairAttempt`'s `max_rounds: 0` boundary carries an
    explicit pre-dispatch abort check ("issues NO post-abort dispatch", the
    r7 discipline); the round-0 / follow-up on-session send has no
    counterpart.
- **Observed at:** v0.398.0 (`c2c25d81`). Offline, deterministic: production
  prompt binding driven with a real `ctx.signal` `AbortController` (bind-time
  `forwardSlashCommandCancel`, `production-theta-producer.ts:1965`) against a
  session double that starts with an ambient run active and, at a chosen poll
  tick, ends the ambient run and aborts `ctx.signal` in the same tick;
  scratch probe (deleted).

## Summary

The pre-send gate polls while the session reports a run in flight. When
`thetaAbort` fires during that window, the poll exits promptly (correct). But
the exit path does not consult the abort before proceeding: if the session
reads idle at the exit re-check, `gateCleared` is `true` and the drive
continues — attach guard (skipped: already aborted), active-set gate install,
and `pi.sendUserMessage`. A brand-new user-visible turn is issued after the
theta was cancelled. Because the 0319 teardown listener was never attached
(the abort predates the attach) and `#promptCancelPropagated` is never set,
`ctx.abort()` is never invoked for this run: it streams to natural
completion in the user's transcript while the drive's remaining polls exit on
the aborted signal and the PIC-51 probe settles the query `Err(cancelled)`.
The theta ends; the SNK-f "theta /<name> cancelled" note is appended while
the orphaned run is still streaming after it.

The trigger conjunction requires an ambient-busy session: Esc during a busy
pre-send gate produces both flips in one burst — Esc ends the active ambient
run (the gate's exit condition) and aborts the per-handler `ctx.signal`,
which the PIC-18 forwarding handlers and the bind-time forward turn into
`thetaAbort`. The second real source is `session_shutdown` sub-step-2. The
common busy-gate case is the slash dispatch's own run still being active when
the theta's first query reaches the gate (the `ambientRunActive` shape
`tests/b0288-prompt-turn-completion-witness.test.ts` models from
`agent-session.js:806/:927`). On an idle session the gate never yields and
the window does not exist.

## Reproduction

Busy-gate precondition (load-bearing): the window exists only when the
session is ambient-busy at drive entry. An abort landing BEFORE
`#driveUserVisibleTurn` is entered issues no send (the statement executor
gates upstream — 0319 witness cell (C)), and on an idle session `#pollWhile`
never yields, so there is no window. Real sources that satisfy the
conjunction: the Esc burst (ends the ambient run and aborts `ctx.signal` in
one burst) and `session_shutdown` sub-step-2
(`entry.thetaAbort.abort(abortReason)` while a run is in flight).

Offline. One-query prompt theta (`let v = @`Ping`?` … `v`). Session double:
`isIdle()` false at drive entry (ambient run active). Injected
`Clock.setTimeout` advances the double one tick per drive poll; at tick 3 the
double ends the ambient run AND calls `ctrl.abort(new Error("Esc"))` where
`ctrl.signal` was passed as `ctx.signal` (forwarded into `thetaAbort` at bind
by `forwardSlashCommandCancel`). `ctx.abort` increments a counter; a send
appends the user entry and marks a run active that nothing ends.

Observed at `c2c25d81`:

```
outcome: cancel | sends: 1 | ctx.abort calls: 0 | drive run still streaming: true
```

One user-visible send was issued after the abort was observed; the run it
started was never torn down; the theta settled cancelled around it.

Expected: `sends: 0` — the gate exit observes the abort and the query answers
`Err(cancelled)` with no on-session send (and therefore nothing to tear
down).

## Expected behaviour

- `conversation-drive.md:16` (PIC-70): "The cancellation short-circuit takes
  precedence: when `thetaAbort.signal.aborted` is already true the runtime
  MUST NOT synthesise this transport `Err` and answers `Err(QueryError {
  kind: "cancelled" })` … and each bounded wait MUST stop promptly on an
  observed abort". Stopping the wait and then issuing the send defeats the
  short-circuit's object: the pre-send gate exists so the send is issued only
  into a state the driver still wants.
- `cancellation.md:9` (Forwarding, slash-command entry): the bidirectional
  bridge exists so "a `thetaAbort` fired while a prompt-mode user turn is in
  flight" tears the run down; a design that first CREATES a new run after the
  abort and then cannot tear it down (attach guard) is outside every clause's
  intent.
- `slash-invocation.md:25` (SLSH-2, cancellation edge case): "The
  cancellation system note is appended after the partial prefix" — with the
  orphaned run still streaming, assistant tokens continue to land AFTER the
  SNK-f note, so the note is interleaved, not appended after.

## Actual behaviour / root cause

`#pollWhile` (`:5605–5610`) exits its loop when `thetaAbort.signal.aborted`
flips, returning `!condition()` — which reads the SESSION state, not the
abort. When the Esc burst both idles the session and aborts the theta,
`gateCleared` is `true`. The subsequent straight-line path
(`:5346–:5452`) contains no abort check: governor arm, install-vector
computation, attach guard (`:5400` — skips attach precisely because the
abort already happened), active-set gate, send. Nothing downstream can
compensate: `#recordLifecycleExpiry` no-ops on aborted (`:5623–5625`),
`extractPromptModeQueryResult` correctly answers `Err(cancelled)`, and the
0319 belt-and-braces settle-abort race leg (`:5528–5539`) only shortens
waits — it never calls `ctx.abort()`.

## Why it matters

Impact class 2/3. A turn the user explicitly cancelled is issued anyway:
provider tokens are spent post-Esc, a full model turn (with tool calls — the
governor IS armed, so its tool loop runs) lands in the user's transcript
after the cancellation note, and the run is orphaned — no theta-side owner,
no teardown path, the exact "live user run streaming after the theta has
already settled cancelled" state 0319 was filed for. On a session where the
next slash command dispatches promptly, the orphaned run also occupies the
session the next drive's pre-send gate must wait out.

## Non-goals

- Aborts landing DURING the driven turn — bridged by 0319's listener and the
  settle-abort race leg; correct today.
- The `#pollWhile` early-exit itself — the prompt stop is spec-mandated and
  correct; only the missing exit-disposition check is at issue.
- `driveStreamedUserTurn` (`:6979`), the degraded-arm follow-up drive, shares
  the gate shape but is unreachable from parsed source (bug 0014 rejects the
  empty annotation that selects the degraded arm); recorded here, not filed.

## Fix

After the pre-send gate (and after every `#pollWhile` return inside
`#driveUserVisibleTurn`), check `this.#thetaAbort.signal.aborted` and return
without sending — the probe's cancelled short-circuit already produces the
right `Err`. One guard immediately before `this.#pi.sendUserMessage(text)`
(`:5452`) is the minimal complete form, mirroring `driveRepairAttempt`'s
boundary abort check (`:5277–5284`). Alternative: make `#pollWhile` return a
three-state verdict (`cleared | expired | aborted`) so callers cannot conflate
abort with clearance; larger diff, same observable. Either way the fixture is
the reproduction above asserting `sends: 0`.

## Provenance

- Spec measured against: `docs/spec_topics/pi-integration-contract/
  conversation-drive.md:16` (PIC-70 cancellation short-circuit, Hang
  handling), `docs/spec_topics/cancellation.md:9` (bidirectional prompt-mode
  forwarding), `docs/spec_topics/slash-invocation.md:25` (SLSH-2 cancellation
  note ordering).
- Implementation: `src/extension/production-theta-producer.ts:5341–5343,
  5380–5401, 5452, 5605–5610, 5622–5625, 5277–5284, 1965`.
- Found by: prompt-drive-lifecycle bug-hunt (seed 5, ctx-abort boundary
  instants around the 0319 bridge); offline probe over the b0288 harness
  shape confirmed post-abort send + zero teardown.

## Fix (0.403.0)
- What shipped:
  - `src/extension/production-theta-producer.ts` — one abort guard in `#driveUserVisibleTurn`, immediately before `this.#pi.sendUserMessage(text)` (inside the `withActiveSetGate` callback, mirroring the adjacent PIC-50 sync-throw early return): `if (this.#thetaAbort.signal.aborted) { return; }`. An Esc burst that both idles the ambient run and aborts `thetaAbort` clears the pre-send gate (`#pollWhile` returns the SESSION idle-state, not the abort disposition); the guard now short-circuits the send. It sets nothing (NOT `#transportFromThrow`), so the PIC-51 probe's cancellation short-circuit answers `Err(cancelled)` downstream and the theta settles the `cancel` terminal outcome with NO on-session send and nothing to tear down. The settled minimal-complete form (conversation-drive.md:16 PIC-70); the three-state `#pollWhile` alternative was deliberately NOT taken.
- Gates: witness `tests/b0414-preabort-send-issued-witness.test.ts` 2/2 green (cell (a) load-bearing `sends === 0`; cell (b) benign busy-gate control still sends); full default suite 572 files / 10443 tests green (one parallel-load flake `tests/production-tools-load-resolution.test.ts`, green isolated 50/50, unrelated — recorded as load noise per the isolated-re-run law); `tsc -p tsconfig.json --noEmit` clean; `eslint "src/**/*.ts"` clean.
- Review: 1 round — `bug-fix-reviewer` CLEAN; no correctness/fidelity/spec findings; two non-blocking `prose` residuals (R1, R2 below).
- Verification: SOLID. (A) revert-witness red-proof: deleting the guard reds cell (a) (`sends === 0` → got 1, `["Ping"]`), control (b) stays green; re-insert byte-exact (`git hash-object` == pre-revert `e61da8dc`) → 2/2 green; the sibling 0413 witness re-run 10/10 green (temporary revert did not disturb 0413). Both directions. (B) full suite 572/572 green (isolated re-run of the one load flake 50/50). (C) tsc + lint clean. (D) diff confined: the 0414 change is exactly one guard in production-theta-producer.ts alongside the two sanctioned 0413 hunks; no stray files. Live: adjacent H9a cell `tests/live/acceptance/b0351live-value-position-query-success-binds.test.ts` green through real `pi -p` (decidable answer 142, 6.79s) over the combined 0413+0414 tree — the non-aborted over-fire guard proving the guard does not suppress a wanted send on a normal drive. A NEW red-at-fork live cell is not constructible for 0414: the defect requires an Esc landing precisely inside the pre-send-gate window on an ambient-busy session, a cancellation-timing race not deterministically reproducible against a live host — discharged by the revert-proven offline witness.
- Residuals:
  1. R1 (prose): the witness header cites fork/post-0413 line coordinates (send `:5456`, `#pollWhile` `:5609/:5610`) that the guard shifts (+12); left as-is — comment prose describing the fork defect, no assertion depends on it, production-theta-producer.ts is not on the citation-symbol ratchet, and the merge will re-shift these lines across the parallel lanes regardless.
  2. R2 (prose): the banned word "just" appears in one witness comment; house-accepted register (STYLE.md binds user-facing docs, not test comments; the sibling b0288 witness uses it too). Non-blocking.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: aborts landing DURING the driven turn (bug 0319's teardown listener + settle-abort race leg) unchanged; the `#pollWhile` early-exit itself unchanged (only the missing exit-disposition check added); `driveStreamedUserTurn` (the degraded-arm follow-up, unreachable from parsed source per bug 0014) not touched; no new diagnostic code (DIAG-2 — the fix emits nothing, the cancellation surfaces through the existing probe).
