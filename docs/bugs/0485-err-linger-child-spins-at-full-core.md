# Bug 0485 — a visible child lingering after its DELIVERED Err envelope spins at a sustained 100% of one core instead of idling

- **Status:** open.
- **Sev/Diff estimate:** S2/D3 — S2: six-for-six reproduction in one night
  (quality-loop waves qw20260918155535/202006/220713): every `fix-cluster`
  child whose invoke settled `invoke_callee` (Err envelope DELIVERED, so the
  §8 linger correctly kept it alive) sat in its herdr pane burning a full
  core — measured 15.0–15.1 s CPU per 15 s wall on all six simultaneously,
  ~9 h × 6 cores wasted by morning. D3: the spin site is not yet located.
- **Where (candidates, not yet diagnosed):** the child is an interactive
  (visible) pi process whose drive ENDED — after the Err envelope it should
  be an idle TUI session. Candidate hot paths: (a) the TUI render/input loop
  against an unattended herdr pty (tab never focused; pty half-drained);
  (b) a child-side timer/service that outlives the drive (execution-status
  bus repaint, watcher debounce, heartbeat remnants) — note the result-
  channel client is NOT the site by construction (heartbeats stop on the
  parent's post-settlement socket release, bug 0484's `onDead` fires, and
  the sweep no-ops on the completed registry); (c) a pi-host loop reacting
  to the closed channel socket. Distinguish (a) from (b)/(c) first: reproduce
  with a trivial `mode: subagent` theta returning `Err` under a herdr
  visible launch and sample CPU with the pane focused vs never-attached.
- **Relation to bug 0484:** NOT the same defect. 0484's third sighting
  (100%-core orphan) was attributed to the post-channel-death headless
  drive; its fix (child aborts on channel death; parent kills on synthesised
  no-envelope settlement) shipped in 0.482.0 and was validated live (wave
  qw20260918131151: a lane abort left zero orphans). THIS shape survives the
  fix because the envelope WAS delivered — the linger is sanctioned
  (subagent.md §"Visible presentation", the carve-out bug 0484 deliberately
  left untouched) — but the linger contract implies IDLE: a pane held open
  for a human to read must not cost a core.
- **Observed evidence (2026-09-19 morning):** pids 50804, 38928, 22752,
  92556, 39624, 44880 — `pi ... --model gpt-6-astra ... /fix-cluster`
  visible children created 22:08–23:59 the previous night, each with
  29 000–35 500 s cumulative CPU and a measured 15 s/15 s delta; all six
  tree-killed by hand after measurement. The panes' lanes had long since
  aborted (fixer invoke_callee failures; the wrapper's honest lane abort).
- **Operational cost while open:** each provider-error lane leaves one
  spinning core until someone notices; a bad-provider night (astra flaked
  repeatedly) multiplies it. Mitigation until fixed: sweep herdr tabs /
  `fix-cluster` processes after a wave with lane aborts (delta-check first:
  a 0-delta linger is the sanctioned idle shape and safe to leave).

**Second sighting (2026-09-19 11:03):** a VPN drop made every fixer child's
first provider call fail instantly - 8 more Err-linger spinners accumulated
in ~80 s (two per wave across 4 zero-progress cycles), each pinning a core
for ~25 min until killed by hand. Provider-outage waves are a spin
MULTIPLIER; the quality-loop provider circuit breaker (halt when a whole
wave's lanes abort infra-shaped) now bounds the accumulation per run.

## Fix directions (spec-before-code, next cycle)

1. Diagnose the hot site with the minimal repro above (focused vs unattended
   pane; strip the theta extension vs keep it) before touching anything.
2. If (a) TUI-vs-pty: likely a pi-host or herdr issue — file/pin upstream,
   and consider whether quality-loop's fixer lanes even want the Err linger
   (the transcript is the post-mortem value; a session file per RFC 0013
   would preserve that without a live process).
3. If (b) child-side service: bound it to the drive's lifetime — the §8
   linger keeps the SESSION alive, not the theta runtime's timers.
4. Witness: an Err-linger child's CPU delta over a fixed window is ~0.

## Related

- Bug 0484 (fixed, 0.482.0) — the no-envelope abandonment family; this is
  the delivered-envelope sibling.
- subagent.md §"Visible presentation" (the linger contract this bug reads an
  implicit idleness obligation into — the fix should make that explicit).
- RFC 0013 (persisted child sessions) — would let automation lanes skip the
  live linger entirely.
