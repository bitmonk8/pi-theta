# Bug 0484 — a synthesised channel exit (heartbeat silence / socket close) settles the invocation but never kills the placed child, and the child mutes its own heartbeats on one write error and keeps working: the invoke Errs while an orphaned worker keeps editing the same tree

- **Status:** open — wrapper-side mitigation landed (fix-cluster-tree aborts
  its lane on a fixer invoke Err instead of gating/reviewing a possibly-moving
  tree); the parent/child kill semantics are the real fix, pending.
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
