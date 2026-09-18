# Bug 0484 — a synthesised channel exit (heartbeat silence / socket close) settles the invocation but never kills the placed child, and the child mutes its own heartbeats on one write error and keeps working: the invoke Errs while an orphaned worker keeps editing the same tree

- **Status:** fixed in 0.482.0 — (1) parent: `adaptChannelToChildProcess`
  kills the placed child through the backend handle atomically with any
  settlement synthesised without an envelope (`HEARTBEAT_SILENCE` /
  `CHANNEL_CLOSED` pseudo-signals; the envelope path — Ok AND Err, the §8
  linger — never kills, nor do the adapter's own `kill()` or a real observed
  exit); (2) child: `connectResultChannel` gained `onDead` (fires at most
  once, never on the client's own deliberate post-envelope `close()`), wired
  in production-composition to `abortInvocationsOnResultChannelDeath` —
  every active invocation aborts with the synthesised CNCL-4 reason
  `"theta cancelled by result-channel death"` (no `shutdownReason` stamp;
  that field routes the session-shutdown clean-cancel note), which also
  removes the whole post-death execution window behind the observed hot spin
  (no dedicated poll/backoff loop exists in the client — the spin was the
  headless drive itself); (3) budget: the silence budget decoupled from
  `SUBAGENT_DISPOSE_BUDGET_MS` into `RESULT_CHANNEL_SILENCE_BUDGET_MS =
  120000` (12 missed 10 s beats; the dispose budget stays 30 s — its
  post-envelope graceful-exit job is unrelated to bounding a working child).
  Spec: subagent.md §"Launch file and result channel" / §Teardown / layer-3
  residual exposure, cancellation.md CNCL-4 third trigger, RFC 0012 §3.
  Witnesses: tests/b0484-synthesised-exit-kills-and-child-aborts.test.ts
  (17 cells; red pre-fix — the file fails wholesale on the then-missing symbols, 11 assertion-level failures), the 120 s default-budget cell in
  tests/production-result-channel.test.ts. A real-child channel-death
  integration cell was NOT added — it needs a placement-backend + live-TCP
  harness that does not exist; the live validation wave (orphan sweep during
  the fix phase) is the end-to-end witness. The wrapper-side mitigation
  (fix-cluster-tree lane abort on fixer invoke Err) stays — the Err
  vocabulary is unchanged.
- **Sev/Diff estimate:** S2/D2 — S2: observed live twice in one wave
  (2026-09-17, the D7 cold pass): (a) an orphaned `fix-cluster` child ground
  ~40 min of CPU in a lane that had long since concluded (token burn against a
  discarded tree); (b) a second lane's fixer invoke settled Err at ~13 min,
  the wrapper ran the GATE over the still-being-edited tree and dispatched
  `review-fix`, whose transcript read "The working tree is still being
  actively modified by the fixer (hash changed again …). I'll poll until it
  quiesces." — a review over a moving target, and a commit race had the
  review confirmed. D2: two well-localised fixes (parent settle-path kill;
  child channel-death abort) plus budget tuning, each with clear witnesses.
- **Where:**
  - Parent: `src/runtime/subagent-result-channel.ts` `openResultChannel` —
    the silence timer's expiry and the socket-close path call `settle(...)`
    which only releases the listener; nothing kills the placed child. The
    envelope path's comment is explicit that ITS no-kill is the deliberate §8
    linger carve-out (an IDLE child whose drive ended); the synthesised paths
    inherited the no-kill without the justification — an abandoned child
    there is a RUNNING worker.
  - Child: `connectResultChannel` — on a socket write error the client
    "stop[s] heartbeating; later writes are no-ops" and the child keeps
    driving its theta headless: the parent can never hear from it again
    (silence synthesis fires ≤30 s later by construction), its envelope has
    nowhere to go, and every subsequent side effect is unsupervised.
  - Budget: `SUBAGENT_DISPOSE_BUDGET_MS = 30000` with a 10 s child heartbeat
    — three missed beats. During a fix-phase gate storm (parallel lanes ×
    vitest workers) a loaded box can plausibly stall a child's event loop
    past 30 s, making FALSE abandonment of healthy children a load artifact.
- **Observed evidence (wave qw20260917..., D7 cold pass):** process table at
  23:13 — `fix-cluster#8bb669c8` created 22:06, 2397 s CPU, no matching
  wrapper alive; lane `fix-cluster-tree#1d1c81f8` (22:53) with BOTH
  `fix-cluster#a8fd4d6a` (22:53, alive) and `review-fix#b02ad2ce` (23:06,
  alive) — the reviewer running while the settled-away fixer edited. Both
  orphans killed by hand.

**Third live sighting (2026-09-18, D7 fix-drain wave):** `fix-cluster#548af516`
outlived its lane's wrapper and sat at a SUSTAINED 100% of one core (CPU
delta 20 s per 20 s wall; 91 s total by kill time) — not idle linger, not
model-paced work: an abandoned child can also degenerate into a hot spin
(candidate site: a poll/backoff path after the channel died). The
child-side channel-death abort (fix 2) must also cover this shape; the
orphan was killed by hand and the lane had already aborted honestly per the
wrapper mitigation.

## Fix directions (spec-before-code, next cycle)

1. **Parent:** a synthesised exit (HEARTBEAT_SILENCE, socket close before an
   envelope, and any settle without an envelope) MUST kill the placed child
   through the backend handle before/with settling the invocation. The §8
   envelope-Err linger stays exactly as specified (that child's drive is
   DONE). Spec: subagent.md §Placement/§Result channel + RFC 0012 §7; the
   drive's `mapExitWithoutEnvelope` sites.
2. **Child:** a channel write failure or observed socket close is FATAL to
   the child's invocation — abort the drive (the fail-closed posture:
   supervisor lost, side effects must stop), not mute-and-continue. The §8
   linger applies only after a DELIVERED Err envelope.
3. **Budget:** revisit 30 s under load (e.g. 90–120 s, or a load-aware
   grace); with (1) in place a false abandonment at least kills cleanly and
   the lane sheds honestly.

## Witnesses to write

- Channel unit: silence expiry and pre-envelope socket close each invoke the
  backend kill exactly once; the envelope path never does.
- Child unit: a write error aborts the invocation (no further tool
  executions), instead of the current mute-and-continue.
- Wrapper (landed with the mitigation): a fixer invoke Err yields
  `ok: false` with no gate run and no review dispatch — covered by the lane
  abort note in `fix-cluster-tree.theta` (theta-level; exercised by the next
  wave's report shape).

## Related

- Bug 0483 (the other settled-while-alive family member: host-recovery abort
  vs the parent's cancellation forwarding).
- RFC 0012 §7 (visible-child lifecycle; the linger carve-out this bug must
  not widen).
- `quality/README.md` fix-phase lane semantics (shed, don't sink).
