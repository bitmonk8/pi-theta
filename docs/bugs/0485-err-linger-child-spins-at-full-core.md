# Bug 0485 — a visible child lingering after its DELIVERED Err envelope spins at a sustained 100% of one core instead of idling

- **Status:** closed — not reproduced on the tested current versions;
  owner-directed disposition, 2026-10-24. No fix or upstream remediation is claimed.

## Resolution — not reproduced, not fixed

The owner requested closure after the real placement-backed experiment completed
without reproducing the reported CPU spin. At pi-theta 0.497.0, checkout
`4775d5f4759af848a86c3c505aa88853f83a14e9`, Pi 1.3.0, Herdr 0.9.3 and
`@bitmonk8/pi-theta-herdr` 0.3.0, a production-dispatched visible child delivered
its intended pure `Err` and remained alive with its parent throughout the sample:

| Observable | Measurement |
| --- | --- |
| Wall time | 15.020 seconds |
| Delivered-Err child CPU | 0.19 seconds, approximately 1.27% of one core |
| Independent idle TUI control CPU | 0.22 seconds, approximately 1.46% of one core |
| Historical reported symptom | Approximately 15 CPU seconds per 15 wall seconds |

Real credentials, placement, authenticated result delivery, CPU accounting and
owned-resource cleanup succeeded. The parent later exited normally; cleanup
closed only the two experiment-owned panes and left no owned processes alive.

**Limits.** This is one bounded current-version pure-Err observation, not a
reproduction of the historical provider-failure or hours-long incidents. It does
not establish that the historical report was invalid, identify its cause, prove
that an upstream change fixed it, or independently establish the historical
runtime-exoneration claim retained below. Synthetic assertion controls reject
busy input but are not a production CPU-spin witness.

The `/fix-bug` reproduction checkpoint remains `not_reproduced`; no diagnosis,
implementation, passing reproduction gate, completion review or runtime release
is claimed. Closure is an owner-directed triage disposition, not advancement of
the incomplete fix pipeline. No production behavior, linger contract, test
oracle, dependency or package version changes accompany it.

**Reopen** on a fresh supported-version case with a real visible child, delivered
Err, living parent and sustained excessive post-settlement CPU. Retain exact
versions, trigger and lifecycle evidence, child/pane identity, raw CPU deltas and
a healthy independent idle control. A lingering pane alone is expected behavior,
not sufficient evidence of this defect.

The preserved experiment, raw samples, cleanup records, prior reports and
workflow decisions are under
`.pi/tmp/fix-bug-0485-91b61794-d8e1-4b59-9e17-f259f4c304e3/`, especially
`reproduce-attempt-5-placement/` and `reproduce.md`. These are local artifacts,
not a newly committed regression test.

## Historical report — retained, not current causal findings

The diagnosis, recommendations and proposed fix directions below record the
2026-09 investigation. They do not supersede the bounded disposition above.

- **Historical status (2026-09-20):** open — pi-theta runtime EXONERATED by the
  diagnosis below; the spin was attributed upstream (pi host TUI/pty or Herdr
  placement backend). The current experiment does not independently establish
  that attribution.
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

## Diagnosis (2026-09-20) — pi-theta runtime EXONERATED; spin is host-TUI/pty-side

Step 1 of the fix plan (locate the hot site before touching anything) was
run. Result: **the spin is not in pi-theta's runtime.** Established by
inspection AND live measurement:

- **No recurring timer in pi-theta can spin a core.** `grep` for
  `setInterval`/`setImmediate` across all of `src/` is empty. The only
  recurring timers are (a) the child-side result-channel heartbeat — a
  chained 10 s `setTimeout` (`RESULT_CHANNEL_HEARTBEAT_MS`), cleared by
  `die()`/`stop()` the moment the parent releases the socket; and (b) the
  execution-status bus render tick (`STATUS_TICK_MS = 200`). Even a bus with
  a node stuck `running` renders at most 5×/s — bounded, not a pegged core;
  a 100 %-core spin needs a delay-0 async loop or a synchronous infinite
  loop, neither of which exists in pi-theta. `#scheduleFollowUp` (bus.ts)
  arms nothing when there is no running work and no lingering ended node —
  “an idle bus stays render-free rather than paying a perpetual heartbeat.”
- **On `Err` the child's drive simply RETURNS.** `driveSubagentRootRegime`
  (`production-theta-producer.ts`) calls `emitErr(...)` and does NOT call
  `#requestVisibleChildShutdown` — that is the `Ok`-only path. After the Err
  envelope the child is an ORDINARY idle host TUI session, no pi-theta
  runtime work outstanding.
- **An ordinary idle pi TUI does not spin.** Measured three idle shapes in
  unfocused herdr panes, each CPU-sampled over 15 s (the bug's own witness
  window): a fresh prompt (0 s), a session that completed one real model
  turn then idled (0 s), and a session launched with stdin at EOF
  (`pi < /dev/null`, ~0 s). None reproduced the 15 s/15 s spin. So neither
  “unattended pane” nor “stdin-EOF” nor “post-turn residue” is sufficient on
  its own — candidate (a) in its simple form and candidate (b) are both
  refuted.
- **The result-channel client is confirmed NOT the site**, as the original
  “by construction” note claimed: heartbeats stop on the parent's
  post-settlement socket release, `onDead` fires at most once, later writes
  are no-ops, and the already-settled invocation has nothing to abort.

**What remains — the one variable this investigation could NOT reproduce:**
the real spinners were **placement-backed VISIBLE children** launched through
the herdr placement backend (the `herdr-agent-state` integration), whose pty
and launch disposition differ from a plain `herdr tab`/`herdr pane run` pi.
Reproducing that needs the quality-loop's placement harness (a real
parent→visible-child launch), not a hand-run pane. The spin therefore lives
either in **(a) the pi HOST's TUI render/input loop** against the
placement-backed pty, or **(c) the pi host reacting to the released channel
socket** — both **upstream of pi-theta** (pi host `v0.85.1` / herdr
placement), not this codebase.

## Recommendation

This is an upstream pi-host / herdr-placement bug, per the bug doc's own
decision tree (branch 2: TUI-vs-pty ⇒ file/pin upstream). pi-theta owns no
spin site to fix. Two levers ARE in pi-theta's / the operator's control:

1. **File/pin upstream** against the pi host + herdr placement backend with
   this diagnosis and the placement-harness repro recipe (a `mode: subagent`
   theta returning `Err` under the herdr visible backend, CPU-sampled
   post-linger).
2. **Reconsider whether the fixer lanes want the visible `Err` linger at
   all.** The linger exists so a HUMAN can read/continue the session
   (subagent.md §"Visible presentation") — but an unattended automation lane
   has no such human mid-run, and the transcript's post-mortem value is
   better served by a persisted session file (RFC 0014) than by a live
   process pegging a core. Options, operator-side, no runtime change:
   run fixer lanes under `pipe` placement (headless — no visible child, no
   linger, no spin), or keep visible placement and rely on the existing
   post-wave sweep mitigation until the upstream fix lands.

## Fix directions (spec-before-code, next cycle)

1. Diagnose the hot site with the minimal repro above (focused vs unattended
   pane; strip the theta extension vs keep it) before touching anything.
2. If (a) TUI-vs-pty: likely a pi-host or herdr issue — file/pin upstream,
   and consider whether quality-loop's fixer lanes even want the Err linger
   (the transcript is the post-mortem value; a session file per RFC 0014
   would preserve that without a live process).
3. If (b) child-side service: bound it to the drive's lifetime — the §8
   linger keeps the SESSION alive, not the theta runtime's timers.
4. Witness: an Err-linger child's CPU delta over a fixed window is ~0.

## Related

- Bug 0484 (fixed, 0.482.0) — the no-envelope abandonment family; this is
  the delivered-envelope sibling.
- subagent.md §"Visible presentation" (the linger contract this bug reads an
  implicit idleness obligation into — the fix should make that explicit).
- RFC 0014 (persisted child sessions) — would let automation lanes skip the
  live linger entirely.

## Provenance

- Owner disposition (2026-10-24): close as non-reproducible, release the bug-fix
  token, and commit/push; no runtime-fix claim or reproduction-gate waiver.
- The run's `reproduce.md`, `reproduce-attempt-5-placement/measurements.json`,
  `settled.json`, `events.jsonl`, `cpu-samples.jsonl`, `run.log` and `cleanup.json`
  supply the current observation, intended error delivery, liveness and cleanup
  evidence. Earlier dated sections retain the historical incident report.
- [Subagent — Visible presentation](../spec_topics/pi-integration-contract/subagent.md)
  supplies the delivered-Err linger contract; closure does not change it.
