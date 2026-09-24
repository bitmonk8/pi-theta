# Bug 0490 — a subagent invoke whose child settles Ok never resumes the calling drive: the child is marked done in the status tree, its work product is on disk, and the parent sits idle at the invoke statement indefinitely

- **Status:** open — undiagnosed; two-for-two reproduction on the same
  drive shape, evidence below. No synthesised settlement fires and no
  system note is emitted; the wedge is silent and unbounded.
- **Sev/Diff estimate:** S2/D3 — S2: a deterministic-looking wedge of a
  whole orchestration drive after all its expensive work completed (the
  2026-09-24 benches burned ~30 min of five-model lane work per run, twice,
  then wedged at the final cheap step; the operator read both as hangs and
  interrupted). Unbounded: measured 38 min parent-idle with no timeout on
  the path. D3: the settle path is asynchronous and placement-coupled; no
  candidate is yet confirmed.
- **Where (evidence, then candidates):**

## Evidence (waves qbench20260924081428 and qbench20260924084634)

Drive shape (`.pi/theta/bench-d4.theta`, `mode: prompt`, sonnet-bound): a
`for` loop issues five sequential subagent-theta invokes (one per lane,
each `match`-settled, all five resumed correctly and their filings were
quarantined by subsequent `bash` steps), then ONE more invoke after the
loop:

```
let verdict = bench_d4_judge(bench_dir, man, timings)?
```

Both runs wedged at exactly this statement (execution-status checkpoint
`cp 56`, `▶` on the invoke line):

- The judge child completed: run 2's status tree read
  `✓ bench-d4-judge 3m59s done`, its report was fully written to
  `quality/bench/qbench20260924084634/report.md`, its herdr tab closed
  (Ok-outcome self-shutdown), and no `FAILED` retitle appeared.
- The parent never resumed: 38 min at the checkpoint, `0 children`,
  parent node process idle (11.6 s cumulative CPU, zero delta over a 5 s
  sample — a lost wakeup, not a spin).
- No bug-0484 synthesised settlement (`HEARTBEAT_SILENCE` /
  `CHANNEL_CLOSED`) fired despite the child being long gone — whatever the
  parent awaits, it is not being fed by the channel-death machinery either.
- Run 1 (qbench20260924081428) wedged identically at the same statement
  BEFORE any of the day's source edits (report.md on disk at 08:42; the
  first working-tree edit landed 08:54+), and the running parent had
  pre-edit modules in memory throughout — the working-tree session-log
  changes (bug 0489 items 1–2) are not the trigger.

## Bisection (2026-09-24, minimal repro: zero-query child, 5 in-loop + 1 post-loop sequential invokes)

Negative results — the wedge does NOT reproduce with fast children in any
of these shapes (all six invokes resumed, POST-LOOP marker written):

- headless `pipe` placement (`pi --mode json -p`)
- headless run under the herdr placement backend (HERDR env present,
  children placed as tabs)
- interactive TUI session under herdr placement (dispatched into a real
  `pi` tab)

Long-running-children variants (bash `sleep 90` per child) were attempted
in interactive tabs but are INCONCLUSIVE: the host tab's own agent went
autonomous after watchdog/abort noise in its session (twice), re-ran the
repro concurrently and contaminated the observable. Method retired — the
next repro must be the in-process live harness (deterministic, no
autonomous agent), not a driven interactive tab.

Narrowed remaining axes (vs the fast-child repro, which passes):

- child DURATION (minutes of heartbeat/silence-rearm traffic vs seconds)
- child CONTENT (typed-query respond flow; ~100 tool rounds)
- parent WALL TIME before the wedging invoke (~30 min of prior lanes)

Additional parent-side narrowing from the live evidence (run 2 status
snapshot): the drive, the bounded teardown, AND `finishInvocation` all
completed for the wedged invoke — `invocationEnded` reached the status bus
(the run-card roster rendered `✓ … done`, which renders only off
`endedAtMs`), and `finishInvocation` runs strictly AFTER
`await binding.teardown?.()` in `#driveInvokeCallee`'s `finally`
(invoke-machinery.ts). The lost wakeup therefore sits ABOVE the invoke
machinery: between the invoke expression's settled promise and the
statement executor's resumption (call-surface / executor await plumbing),
not in the launch, channel, envelope, teardown, or registry layers.

## Candidates (unconfirmed)

- The envelope-delivered settle path after several sequential invokes in
  one drive: the five in-loop invokes resumed; only the sixth wedged.
  Whether the count, the loop-exit boundary, or the post-loop statement
  position matters is undetermined.
- A parent-side resource pinned per launch and exhausted at five (a wire /
  channel / registry slot not released on settled invokes), leaving the
  sixth launch's settle listener never attached — note the child DID run
  and complete, so the launch itself succeeded.
- The result-channel client's post-envelope close ordering under the herdr
  placement (`observesExit: false`): if the settle promise resolves off an
  event the closed socket never delivers on the SIXTH connection only
  (port/session reuse?), the invoke value is lost while the child-side
  outcome event (which the status tree consumed — it shows `done`) still
  went out.
- NOT the callee's shape: the judge theta parses clean (H7b gate), its
  typed `BenchVerdict` respond flow is the same QRY machinery the five
  lanes' `ReviewSummary` used, and its params (two short strings + one
  multi-line string) marshal below any file-channel threshold.

## Prime suspect (static, 2026-09-24 second pass)

The `✓ done` roster line renders off `endedAtMs` alone — `invocationEnded`
carries no outcome, so the wedged judge child may well have settled **Err**
(plausible: `tool_loop_exhausted` at its 120-round cap, or a typed-respond
failure — both AFTER report.md was already written; both bench runs fit).
That matters because the Ok and Err return paths diverge exactly at the
wedge window (`runThetaCallableCallEffect`, effectful-statement-host.ts):

- Ok — `return { ok: true, value: result }` — pure sync; the five Ok
  lanes resumed, twice.
- Err — `wrapInvokeCalleeFailure(...)` — contains the window's ONLY
  awaited seam: `await deps.recordInvokeHop?.(wrapper, …)` →
  `#recordInvokeHop` → `#ledger.attach` (invoke-provenance-ledger,
  two `realpath` canonicalisations through the `FileSystem` seam).

A lost wakeup inside that await produces the observed shape exactly:
`finishInvocation` has already run (the `finally` completes before the
returned value crosses the wrapper), no note is emitted (the Err never
reaches the top level), no cancellation fires, and the checkpoint stays
pinned at the invoke statement. Unverified: the ledger's own unit tests
pass, so the wedge — if here — is conditional (fs seam state, TUI-session
composition, or long-parent-uptime specific).

**Reconciliation against the recorded evidence (2026-09-24, review round
1):** run 2's judge tab CLOSED with no `FAILED` retitle — under the herdr
backend that is the Ok-outcome self-shutdown, so for run 2 the Err
precondition is REFUTED and this suspect cannot be the whole story (title
stands: the child settles Ok). The Err path's awaited `recordInvokeHop`
seam remains worth hardening (it IS the only awaited call in the window
and would produce this exact shape on an Err child), but the confirmed run
2 shape needs a wedge on the Ok path too — which is pure sync in
`runThetaCallableCallEffect`, pushing the lost wakeup further up into the
executor / checkpoint-advance plumbing, or into the promise-resolution
scheduling between `#driveCallee`'s settled promise and `runInvokeChild`'s
`await`. Confirming observable for the NEXT bench run stays useful in both
directions: a lingering `FAILED <label>` judge tab confirms the Err arm; a
cleanly-closed tab plus the wedge re-confirms the Ok-arm shape.

## Diagnosis steps

1. Reproduce minimally: a `mode: prompt` theta that sequentially invokes
   the SAME trivial subagent callee N times (no `for`, then with `for`) and
   asserts each resumes; bisect N.
2. Instrument the parent settle path (result-channel client → invoke
   continuation) with the execution-status trace seam; run the repro under
   herdr placement and under `pipe`.
3. If placement-coupled, capture the channel lifecycle (connect / envelope
   / close / listener attach order) for invoke #6.

### Step 1 result — minimal repro does NOT reproduce headless

A SCRATCH repro pair (not committed; removed after the bisection) —
`repro-0490.theta` (`mode: prompt`, five `for`-loop invokes of a
zero-query `noop-child.theta`, then a sixth after the loop,
each followed by a `bash` resume marker) run as
`MSYS_NO_PATHCONV=1 pi -p "/repro-0490"` (print mode, `PI_SUBAGENT_PANE`
unset — no herdr placement): exit 0 in 19 s, all six resume markers
(`LOOP-RESUMED-ok-a`…`ok-e`, `POST-LOOP-RESUMED-ok-post-loop`) written.
The invoke count and the loop-exit boundary alone do not trigger the
wedge. Remaining differentiators from the wedged benches: herdr placement
(`observesExit: false`), long-running children (minutes, not ms), a typed
`respond` callee (QRY) rather than a plain-value return, and multi-line
params. (Chronology note: the herdr-placement and interactive-TUI reruns
recorded in the Bisection section above followed this step and also
passed; the live differentiators still standing are child duration, typed
respond content, and parent wall time.)

## Relation to earlier bugs

- 0484 fixed the no-envelope shapes (kill + synthesise); this shape is
  envelope-DELIVERED (child outcome `ok` observed by the status tree) with
  no settlement — the complementary gap.
- 0485 (Err-linger core spin) is unrelated: that child idles hot AFTER
  delivering; this parent idles cold while never consuming the delivery.
