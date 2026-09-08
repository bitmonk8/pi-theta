# Bug 0468 — the subagent child's post-envelope exit wait reuses the session-shutdown drain cap (`SUBAGENT_DISPOSE_BUDGET_MS === SHUTDOWN_AWAIT_CAP_MS === 2000` ms), every child that did real provider work outlives it, and the success path routinely ends in a process-tree kill plus an error-severity `theta/runtime/subagent-teardown-timeout` — the spec's "the child has already exited when teardown runs" premise fails at production scale

- **Status:** fixed (0.464.0).
- **Sev/Diff estimate:** S3/D2 — S3: a diagnostic that lies at scale. The
  timeout event exists to flag an abnormal child; in the seeding incident it
  fired for every child of the run (~230 of ~230, the 73 fully successful
  lens workers included), each as an error-severity event plus a forced
  process-tree kill, so the one signal that should mean "stuck child" is now
  100% routine noise and a genuinely wedged child is indistinguishable. The
  same registry row also mis-describes what IS emitted: it promises a child
  identifier in `message` and elapsed wall time in `hint`, and the
  implementation emits neither — a second face of the same row-vs-emission
  drift, covered under §Fix.
  Invocation results are unaffected (verified three ways below), so no work
  is lost — which caps this below S2. D2: the mechanical change is small but
  needs one adjudication (decouple vs. raise vs. re-grade severity), a spec
  sentence amendment, and two witness updates; no deep design.
- **Kind:** defect — spec and implementation agree with each other and
  together fail the documented intent. subagent.md:197 pins the reuse in so
  many words ("if the child does not exit within the existing
  `SHUTDOWN_AWAIT_CAP_MS = 2000` budget, the runtime **kills** it") and
  rests it on a factual premise ("On the normal path the child has already
  exited when teardown runs — one invocation per process: the child emits its
  envelope and self-exits — so the bounded await short-circuits") that the
  incident falsifies for every real (model-turn-running) child observed. The
  implementation (`SUBAGENT_DISPOSE_BUDGET_MS = SHUTDOWN_AWAIT_CAP_MS`)
  faithfully implements the pinned value; the mis-provision is shared.
- **Related:**
  - [0464](./0464-turn-settle-bound-too-tight-for-long-tool-turns.md)
    (fixed 0.461.0) — the nearest sibling: a lifecycle constant chosen at
    test scale (60 s settle total) failing every legitimately long production
    turn; its §Symptom already names this report's mechanism as a co-symptom
    ("the child process is torn down by the 2 s teardown kill"). Same family
    (test-scale constants meeting production turns), different constant and
    different consequence (0464 failed the INVOCATION; this one only kills
    and mis-signals after the result landed).
  - [0002](./0002-subagent-child-hangs-under-acceptance-pi-p.md)
    (fixed 0.12.0) — established the envelope→self-exit teardown lineage and
    its test-scale timing ("envelope + exit in ~1-2s" for a zero-token
    child), which is the regime the 2000 ms figure fits.
- **Affected** (at c9a1a45a, v0.462.0):
  - `src/extension/capability-probe.ts:76` — `SHUTDOWN_AWAIT_CAP_MS = 2000`,
    declared for `session_shutdown` sub-step 3 drainage (doc-comment cites
    session-shutdown-semantics).
  - `src/runtime/subagent-isolation.ts:43` — `SUBAGENT_DISPOSE_BUDGET_MS =
    SHUTDOWN_AWAIT_CAP_MS`, with the doc-comment "There is no separate budget
    for disposal"; `:182` default consumption; `:239-248` the kill fallback +
    the error-severity `theta/runtime/subagent-teardown-timeout` emit.
  - `src/extension/production-theta-producer.ts:2671-2693` — teardown call
    site in the drive `finally`, AFTER the envelope is consumed (why results
    are unaffected).
  - `docs/spec_topics/pi-integration-contract/subagent.md:197` — the pinned
    reuse and the "already exited" premise; the same paragraph's last
    sentence couples the two budgets in the other direction too ("The
    `session_shutdown` handler's `SHUTDOWN_AWAIT_CAP_MS` budget covers the
    entire teardown phase, including the bounded await of child exit").
  - `docs/spec_topics/pi-integration-contract/session-shutdown-semantics.md:11-12`
    — the value (`SHUTDOWN_AWAIT_CAP_MS = 2000`), the single-shared-deadline
    rule for sub-steps 3+4, and (`:29`) PIC-57's restatement.
  - `docs/spec_topics/diagnostics/code-registry-runtime.md:35` — the
    `theta/runtime/subagent-teardown-timeout` registry row pins the value in
    prose ("within the `SHUTDOWN_AWAIT_CAP_MS (2000ms)` budget"), so the spec
    fixes the value in THREE places; any value change or decouple is a
    same-commit spec edit across all three. The same row also promises
    "`message` carries the child identifier; `hint` carries the elapsed wall
    time at kill" — the second face below.
  - Value/identity witnesses (the blast radius of any change):
    `tests/session-shutdown.test.ts:321` is the only test pinning the 2000
    literal (`expect(SHUTDOWN_AWAIT_CAP_MS).toBe(2000)`);
    `tests/subagent-isolation.test.ts:223` pins the identity
    (`expect(SUBAGENT_DISPOSE_BUDGET_MS).toBe(SHUTDOWN_AWAIT_CAP_MS)`). The
    behavioural teardown cells inject `budgetMs: 20` and are value-agnostic
    (`tests/subagent-isolation.test.ts:144`, `:174`, `:204`), so the fix's
    witness blast radius is small; `tests/subagent-drive-teardown.test.ts` is
    mechanism-neutral (drive-seam only, names the constant in a comment).
    `SUPERSESSION_QUIESCE_CAP_MS` (`capability-probe.ts:90`) shares the
    magnitude by declaration. Wider reference set a fixer must grep —
    shutdown-leg consumers, unaffected by option (A), in scope for (B):
    `src/extension/session-shutdown.ts`,
    `tests/active-invocation-binder-window.test.ts`,
    `tests/active-invocation-wiring.test.ts`,
    `tests/b0376-teardown-call-label-set-underenumerates.test.ts`,
    `tests/b0434-operator-facing-note-matrix-row-coverage.test.ts`,
    `tests/cancelled-by-session-shutdown-note.test.ts`,
    `tests/post-deadline-dual-surface.test.ts`,
    `tests/reload-teardown-quiesce.test.ts`,
    `tests/supersession-inflight-rebuild-quiesce.test.ts`.
- **Observed at:** v0.462.0 (c9a1a45a). Live: the coordinator's `/quality-loop`
  incident run (main tree, same day) — every child of ~230, successful lens
  workers included, drew `theta/runtime/subagent-teardown-timeout` and was
  process-tree killed; all 73 lens results nonetheless landed (73 candidate
  files written). Offline: my candidate-01 probe reproduced the event with
  zero tokens — the hash-refused child lingered past 2000 ms and drew
  `subagent child did not exit within 2000ms; killed`, while the trivial
  zero-token control child exited inside the budget with no event.

## Summary

PIC-65 teardown bounded-awaits child exit and kills on timeout. The bound is
not its own constant: `SUBAGENT_DISPOSE_BUDGET_MS` is declared as an alias of
the `session_shutdown` drain cap, and the spec pins that reuse. 2000 ms is
calibrated to the zero-token child the design's "normal path" describes
(envelope → immediate self-exit, the bug-0002 regime). A child that did real
work — streamed model turns, held provider connections, or (the refusal path)
proceeded past its envelope to host-process the argv as prompt text per
subagent.md:123 — takes longer than 2 s to wind down, so teardown's ABNORMAL
arm becomes the routine arm: process-tree kill (`taskkill /T` on Windows) plus
an error-severity diagnostic per invocation. The wait is not an execution
budget (execution is bounded upstream — `tool_loop.max_rounds`, the 0464
settle bound — and the envelope is already consumed when teardown starts), so
its magnitude buys only kill-avoidance; for calibration, graceful-exit grace
periods elsewhere run 10 s (Docker `stop`) to 30 s (Kubernetes
`terminationGracePeriodSeconds` default) — 5-15× this value.

## Reproduction

1. Live (incident, coordinator-verified): run `/quality-loop` (or any theta
   fanning out subagent workers that run real model turns) on Windows at
   v0.462.0. Every worker invocation ends with
   `theta/runtime/subagent-teardown-timeout: subagent child did not exit
   within 2000ms; killed` — success and failure alike (~230/230 in the
   incident session; the 73 successful lens workers' results all landed).
   Confound disclosure: the ~230/230 base rate comes from a run whose other
   children were hash-refused by candidate `subagent-callable-hash/01` and
   then lingered on the spec-sanctioned prompt continuation (subagent.md:123),
   so most of that population overran the budget for the refusal-path reason.
   The UN-CONFOUNDED evidence is the 73 successful lens children in the same
   run: real model turns whose results all landed (the loop's needs-review
   count went to 0, proving every lens shard returned Ok), each of which
   still drew the timeout and the kill. A fixer must not tune the budget off
   the confounded ~230/230 number; the 73/73 lens overruns are the number
   that stands on its own.
2. Offline (zero tokens, deterministic; the candidate-01 probe recipe): drive
   a prompt caller whose subagent callee is hash-refused (candidate 01). The
   refused child emits its load_failure envelope, then lingers (the host
   continues to process `-p "/<slug>"` as prompt text) and is killed at the
   bound: the parent surfaces the notification `subagent child did not exit
   within 2000ms; killed` while the invocation's Err result is already
   delivered. A pure zero-token callee (the control cell) exits inside 2000 ms
   and draws no event — the budget fits exactly the class of child that did
   no real work.

## Expected behaviour

- The timeout event should mean what its registry row says — a child that
  failed to exit abnormally — not fire on every routine invocation.
  subagent.md:197's own premise ("On the normal path the child has already
  exited when teardown runs … the bounded await short-circuits on the
  recorded exit") states the intended normal path; a value under which the
  premise fails universally in production defeats the paragraph's design.
- The invocation result must be (and is) unaffected: subagent.md:197 "on a
  normal-return teardown the parent still observes the theta's `Ok` final
  value". Verified three ways: (a) code order — teardown runs in the drive
  `finally` after the envelope map (`production-theta-producer.ts:2671-2693`);
  (b) the incident's 73 lens workers were all killed at the bound yet wrote
  all 73 results; (c) the offline probe's refused child delivered its Err
  before the kill notification. This report is therefore noise + forced
  kills + a masked real signal — not lost work.

## Actual behaviour / root cause

One constant serves two waits with different cost profiles:

- **`session_shutdown` drainage** (sub-step 3): a user is exiting the
  session; the cap bounds how long exit blocks. Small is a feature.
- **Per-invocation child-exit wait** (PIC-65): the result is already
  delivered; the cap only decides whether a winding-down child gets a
  graceful exit or a process-tree kill plus an error event. Small buys
  nothing except earlier `finally` completion, and costs a per-invocation
  false alarm whenever a real child's post-envelope wind-down (provider
  connection close, host cleanup; on the refusal path a spec-sanctioned
  prompt-processing continuation, subagent.md:123) exceeds 2 s.

`subagent-isolation.ts:43` aliases the two by design ("There is no separate
budget for disposal") and subagent.md:197 pins the alias, so neither side can
move without the other today.

Second face, same root (registry-row-vs-emission drift on one row): the
`theta/runtime/subagent-teardown-timeout` registry row
(`code-registry-runtime.md:35`) promises, byte-exact, "`message` carries the
child identifier; `hint` carries the elapsed wall time at kill". The
implementation (`subagent-isolation.ts:242-247`) emits, byte-exact,
`` message: `subagent child did not exit within ${budgetMs}ms; killed` ``
and `` hint: `${budgetMs}ms` `` — no child identifier anywhere in the event,
and the CONFIGURED BUDGET where the row promises measured elapsed time. (The
row's own canonical Message column, `subagent child did not exit within
<ms>ms; killed`, already matches the identifier-less emission, so the row
disagrees with itself as well as with the code.) At the incident's 100%
base rate this compounds the noise: ~230 identical events with no way to
tell which child each one killed. One root — the row and the emission were
never reconciled — so one fix commit covers both faces (§Fix).

## Why it matters

- ~230 error-severity events in one run train operators to ignore the exact
  event that would flag a genuinely wedged child; the kill fallback's
  diagnostic value is destroyed by 100% base-rate firing. (Confound, as in
  §Reproduction: most of those ~230 lingered on candidate
  `subagent-callable-hash/01`'s refusal path; the un-confounded core is the
  73 successful lens children — real work, delivered results — that still
  each drew the error event and the tree-kill. Fixing candidate 01 removes
  part of the base rate but none of the 73.) Each identical event also names
  no child and reports the budget instead of elapsed time (second face
  above), so the flood cannot even be triaged per-child.
- Every invocation on Windows ends in `taskkill /T` of a `pi` host process
  mid-wind-down. No corruption was observed (`--no-session` children persist
  nothing), but routine tree-kills of a host process that is closing provider
  connections is gratuitous risk surface, and each teardown also holds the
  per-invocation `finally` open for the full 2 s it was supposed to bound.
- The refusal-path interaction (candidate 01): a hash-refused child proceeds
  to a spurious model-turn attempt after its envelope; today the 2 s kill is
  the only thing bounding that token leak. Any fix here that raises the bound
  must note it extends that window (or close the leak at its source — the
  host continuing past the envelope is spec-sanctioned, subagent.md:123).

## Non-goals

- The 0464 settle bound (fixed) and its recorded inactivity-budget follow-up
  — different constant, different phase (pre-envelope execution vs
  post-envelope exit).
- Whether the child should exit faster (host-side wind-down cost is Pi's,
  outside the theta extension's control; the extension can only choose how
  long it waits and what it reports).
- The hash false positive that made the incident's refused children linger —
  candidate `subagent-callable-hash/01`.

## Fix

Options, no pre-decision. Shared blast radius first: the identity is
test-pinned (`tests/subagent-isolation.test.ts:223`), the literal is
test-pinned for the shutdown path (`tests/session-shutdown.test.ts:321`), the
spec pins both the value and the coupling in three places (subagent.md:197,
including the reverse coupling "the `session_shutdown` … budget covers the
entire teardown phase"; session-shutdown-semantics.md:11-12 and :29's
single-shared-deadline rule; code-registry-runtime.md:35's "within the
`SHUTDOWN_AWAIT_CAP_MS (2000ms)` budget"), and `SUPERSESSION_QUIESCE_CAP_MS`
shares the magnitude by declaration — any change must enumerate all six
surfaces, and every spec touch is a same-commit spec edit (DIAG-2 shape for
the registry row).

Both faces, one commit: whichever option below is chosen, the
`theta/runtime/subagent-teardown-timeout` emission and its registry row must
be reconciled in the same commit — either the emission gains the child
identifier in `message` and measured elapsed wall time in `hint` (the row's
current promise, and the useful choice if the event is to be triaged
per-child), or the row is re-worded to the emission; the row's prose and its
canonical Message column must agree with each other afterwards.

- **(A) Decouple:** the two consumers have different cost profiles (a
  reload/shutdown drain cap wants smallness; a child-process exit wait past a
  delivered result does not) — introduce a child-exit wait constant of its
  own (order 10-30 s: for calibration, not pre-decision, Docker `stop`'s
  grace period is 10 s and Kubernetes' `terminationGracePeriodSeconds`
  default is 30 s, so the shipped 2000 ms sits 5-15× below industry
  graceful-exit practice; even 10 s is 5× margin over the observed
  wind-downs) consumed only by `runSubagentChildTeardown`, leaving
  `SHUTDOWN_AWAIT_CAP_MS` at 2000 for shutdown drainage. Repairs the signal
  and keeps exit latency small where smallness is the point. Must adjudicate
  the reverse coupling: at `session_shutdown` the whole teardown phase is
  capped at `SHUTDOWN_AWAIT_CAP_MS`, so the longer child wait must remain
  raceable against that cap (today's code already takes an injected
  `budgetMs`, so the shutdown path can pass the smaller bound). Touches
  `subagent-isolation.ts:43/:182`, subagent.md:197 (two sentences), the
  identity witness (:223 flips to per-constant pins) and the registry row
  (`code-registry-runtime.md:35` names `SHUTDOWN_AWAIT_CAP_MS`, which a
  decouple renames for this event); session-shutdown value surfaces
  untouched.
- **(B) Raise the shared constant** (2000 → 10000): one-line + the two value
  witnesses + spec text. Rejected-by-default tradeoff to state: it stretches
  `session_shutdown` drainage, reload-teardown quiesce, and supersession
  quiesce to 10 s — user-visible exit/reload latency whenever an invocation
  genuinely hangs — for a wait whose cost profile never wanted to move.
- **(C) Keep 2000 ms, re-grade the event:** two-stage teardown — await 2 s,
  kill, but report a post-envelope kill as an informational note rather than
  an error-severity diagnostic (reserve the error for a child killed BEFORE
  its envelope, which today cannot even reach this path). Smallest semantic
  change; leaves the routine tree-kills in place, so it repairs the signal
  but not the behaviour.
- **(D) Inactivity/exit-progress-based wait** (0464's recorded follow-up
  shape): over-engineered for a process that has already delivered its
  envelope; noted for symmetry only.

Constraints any fix must satisfy: teardown stays bounded (no unbounded
await); the kill fallback remains (PIC-66 cancellation reuses the same kill
path and its bound); `theta/runtime/subagent-teardown-timeout` regains a
non-trivial meaning (fires only when its premise — an abnormal child —
holds); the shutdown path's total cap is not silently extended.

## Provenance

Bug-hunt area `subagent-callable-hash` (incident-seeded micro-wave),
candidate 2 per the coordinator's brief. Incident data (≈230/230 timeouts,
73/73 lens results intact) coordinator-verified the same day at v0.462.0;
mechanism, constants, coupling, spec premise, and result-independence
re-derived and probe-witnessed independently at c9a1a45a. The natural
post-envelope exit time of a healthy model-turn child was NOT measured (would
need a live cell); the incident's universal overrun plus the offline
zero-token/refused-child split bound the threshold from both sides.

## Fix (0.464.0)
- What shipped:
  - `src/runtime/subagent-isolation.ts` — `SUBAGENT_DISPOSE_BUDGET_MS` decoupled to its own `30000` ms literal (was aliased to `SHUTDOWN_AWAIT_CAP_MS`); the `theta/runtime/subagent-teardown-timeout` emission keeps its shipped identifier-less `message` and now carries the MEASURED elapsed wall time (`deps.clock.now()` delta) in `hint` (§Fix option A + face-(b) direction "the row is re-worded to the emission").
  - `src/extension/capability-probe.ts` — `SHUTDOWN_AWAIT_CAP_MS` unchanged at 2000; importer-list doc-comment corrected (no longer names `subagent-isolation.ts` as an importer).
  - `docs/spec_topics/diagnostics/code-registry-runtime.md` — row Trigger prose names `SUBAGENT_DISPOSE_BUDGET_MS (30000ms)` and is reworded to agree with the identifier-less emission; canonical Message column byte-UNCHANGED (per-child identifier deferred to theta 2.0 per DIAG-4).
  - `docs/spec_topics/pi-integration-contract/subagent.md` — PIC-65 decoupled-budget prose + rationale + reverse-coupling sentence; PIC-66 constant reference corrected.
  - `docs/spec_topics/pi-integration-contract/session-shutdown-semantics.md` — sub-step-3 per-invocation-teardown coupling ref renamed to `SUBAGENT_DISPOSE_BUDGET_MS`; the 2000 ms drain-cap value untouched.
  - `docs/spec_topics/pi-integration-contract/version-bump-step2.md` — checklist item (y) controlled-teardown ref renamed.
  - Chosen value + rationale (recorded per §Fix): 30000 ms (30 s). A graceful-EXIT wait past a delivered envelope, NOT an execution budget (execution is bounded upstream by `tool_loop.max_rounds` and the 0464 settle bound); 30 s = Kubernetes `terminationGracePeriodSeconds` default, the upper end of §Fix's "order 10-30 s" and the operator's "plenty of margin"; 15x the 2000 ms bound every observed real child overran. The session-shutdown drain cap `SHUTDOWN_AWAIT_CAP_MS` is deliberately kept at 2000 (NOT raised as a side effect): the two consumers are now decoupled, the `session_shutdown` sub-step-3 aggregate await is bounded independently by `SHUTDOWN_AWAIT_CAP_MS`, and sub-step-2's PIC-66 abort forwards the kill so exit is observed promptly on the shutdown path.
- Gates: witness `tests/b0468-subagent-teardown-budget-decoupled.test.ts` 4/4 + the flipped `tests/subagent-isolation.test.ts` cell 7/7 (RED pre-fix: the decoupling/value pin, the behavioural decouple, the hint-elapsed cell); full `npm test` 637 files / 10863 tests passed; `npm run typecheck` exit 0; `npm run lint` exit 0.
- Review: 2 rounds. R1 (`bug-fix-reviewer`): F1 [spec, major] the first face-(b) implementation added `pid <pid>` to the SHIPPED `subagent-teardown-timeout` Message column — a DIAG-4 theta-2.0-deferred breaking change (diagnostic-shape.md:74, on-point precedent :86; GOV-15 diagnostic-registry carve-out, source-language-stability.md:25) — pivoted to the §Fix's "reword the row to the emission" direction (Message column byte-unchanged, Trigger prose reconciled, `hint` carries elapsed); F2/F3 [spec] stale `SHUTDOWN_AWAIT_CAP_MS` coupling refs in session-shutdown-semantics.md:11 and version-bump-step2.md:76; F4 [house-rule] false comments (capability-probe importer list, test module header); F5 [prose] margin overclaim ("15x observed wind-down" — §Provenance says unmeasured). R2 (`bug-fix-reviewer-fast`): CLEAN.
- Verification (`bug-fix-verifier`): SOLID. (1) Revert->RED->restore (blob-hash equal)->GREEN for both the budget decouple and the hint-elapsed. (2) Full suite 637 files / 10863 tests. (3) Live e2e: `tests/live/acceptance/` 53/53, `tests/live/double-session-start-live.test.ts` 1/1, `tests/live/live-production-acceptance.test.ts` 89/90 (one confirmed-stochastic unrelated bug-0097 load-test timeout, green on single re-run); ZERO `theta/runtime/subagent-teardown-timeout` on any success path across ~146 live tests spawning real subagent children — the core symptom is gone. (4) lint 0 / typecheck 0.
- Residuals:
  1. The per-child identifier in the `theta/runtime/subagent-teardown-timeout` `message` is deferred to theta 2.0: adding it rewords a shipped Message-column template, forbidden in a theta 1.x minor per DIAG-4 (`diagnostic-shape.md:74`, precedent `:86`) and GOV-15's diagnostic-registry carve-out (`source-language-stability.md:25`). The `hint` now carries the measured elapsed wall time (DIAG-4-safe — `hint` is not the Message column), delivering the elapsed-time half of face (b) now; the registry Trigger prose records the deferral.
  2. The natural post-envelope exit time of a healthy model-turn child was still not directly instrumented; 30000 ms is calibrated to the industry graceful-exit norm (Docker 10 s / K8s 30 s), not to a measured wind-down. The live run confirmed zero success-path timeouts at 30 s, bounding the real wind-down comfortably below the budget.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: face-(b) direction = "reword the row to the emission" (forced by DIAG-4, not "emission gains the identifier"); session-shutdown drain cap kept at 2000 (not raised); no new diagnostic code minted (registry closed); `docs/reference/diagnostics.md` reverted byte-exact to HEAD (net-zero, not in the commit).
