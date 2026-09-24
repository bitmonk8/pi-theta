# Bug 0490 — a completed top-level drive's run card freezes in the running form: the eviction tick requests no repaint, so an Ok prompt-mode drive that finished reads as a drive wedged at its last invoke

- **Status:** fixed (0.490.0). Filed as "a subagent invoke whose child
  settles Ok never resumes the calling drive"; reclassified on diagnosis
  (2026-09-24): run 2 of the bench-d4 drive is evidenced as COMPLETED (see
  "Evidence for completion" — no lost wakeup); run 1's completion is
  inferred from the identical signature, not observed (no frame or CPU
  sample of run 1 was captured). The original filing, bisection and
  superseded suspects are kept below as the record.
- **Sev/Diff:** S2/D1 — S2: the operator read two completed ~30-minute
  drives as hangs and interrupted/re-ran them, and a second diagnosis
  session chased a non-existent runtime wedge. D1: one sink (two repaint arms) plus one renderer guard.

## Root cause

A prompt-mode drive's final `Ok` value is not surfaced (slash-invocation.md
§prompt mode; success-side null-policy — no note), and the terminal
`theta-run-summary` is opt-in, default off (RFC 0015 decision 7 re-ruling,
0.488.8). The `theta-run` card is therefore the ONLY surface of an Ok drive's
end, and PIC-75 specifies it degrades to the static compact form once the bus
evicts the node. The degradation never reached the screen:

1. `invocationEnded` sets `endedAtMs`; the node lingers `DONE_LINGER_MS`
   (2 s) while the bus keeps ticking for the fading heat. Every repaint in
   that window renders the LIVE form — `buildCardLines` has no ended state
   for the top-level node (`⟳` header, elapsed off `nowMs`, `▶` on the MRU
   site = the final effect line, since a pure tail expression is not a
   checkpoint and publishes no trace).
2. The eviction tick finds an empty snapshot and calls the sinks' `clear()`
   (`bus.ts` `#renderTick`). The run-card sink's `clear()` was a no-op
   ("an idle bus simply stops requesting renders"), and its `render()` arm
   requested repaints only while `animationOwed` (fresh heat / running
   child) — a departure alone never repainted.
3. pi-tui repaints only on request, so the last painted frame — the live
   form of the ended drive — stayed on screen indefinitely.

## Evidence for completion (run 2, wave qbench20260924084634)

The card capture taken by the diagnosing session (session toolResult
2026-09-24T07:33:28Z, i.e. 09:33:28 local):

```
⟳ /bench-d4 · 37m52s · cp 56 · iters 5 · 0 children
… ▶ on line 110: let verdict = bench_d4_judge(bench_dir, man, timings)?
roster: ✓ bench-d4-judge   3m59s  done
```

Timeline: the drive's `ts` was 08:46:34 local, so a LIVE card at 09:33:28
would have read 46m54s. 37m52s puts the last painted frame at about
09:24:26 — the judge's end (terra lane dir mtime 09:20:23 + 3m59s;
`report.md` mtime 09:24:01) plus the linger. The header froze with the
frame; the "38 min at the checkpoint" in the original filing below is that
frozen header misread (the drive's total elapsed, not idle time — the
parent had been idle about 9 min when the capture was taken).

The decisive observable is the roster row. `HEAT_FADE_MS` (4000) exceeds
`DONE_LINGER_MS` (2000): had the parent still been running when the judge
child was evicted, the parent's fresh heat would have kept repaints going
and the next frame would have dropped the `✓ bench-d4-judge` row. The
frozen frame still shows it, so the parent node left the bus in the same
tick as the child — it ended within one 200 ms tick of the child.
`ticket.finish()` is the only `invocationEnded` call site, so the dispatch
settled; no note sits below the card, so the outcome was Ok (an Err or
cancel emits one). `▶` on line 110 is what a completed drive shows: line 112
is the block tail, evaluated without a `"stmt"` trace. The judge's herdr
tab closed cleanly (Ok self-shutdown) and no bug-0484 settlement fired
(nothing was pending).

The CPU sample (11.640625 s → 11.640625 s over 5 s) does NOT discriminate:
a not-ended node ticks every 200 ms via `#hasRunningWork` with no repaint,
and 25 repaint-free ticks fit inside one CPU-time quantum (745/64 s). The
fast-child repros "passed" because they were judged by bash resume
markers, not by the card.

The Err-path `recordInvokeHop` hardening proposed under "Prime suspect"
below is dropped: nothing in the record reaches that seam, and no defect
there is evidenced.

## Fix

Two mechanisms (spec:
[theta-run-entries.md#pic-75-eviction-repaint](../spec_topics/pi-integration-contract/theta-run-entries.md#pic-75-eviction-repaint);
RFC 0015 §Animation carries an erratum):

1. `createRunCardController`'s sink (run-card-renderer.ts) remembers the
   node ids of its previous call and requests ONE repaint when `render()`
   sees a previously-seen id gone; on EVERY `clear()` (the bus clears on an
   empty-snapshot tick, on verbosity dropping to `off`, and on dispose);
   and on the first `render()` after any `clear()` — the ids a clear drops
   are no longer comparable and nodes that start and end during `off` are
   never seen, so after an `off` window an eviction reaching the sink
   through either arm (bus empty → `clear()`; other nodes still tracked →
   `render()`) repaints. A ticking bus with no departure requests nothing.
2. The live card component (render/run-card-component.ts) draws the static
   form for its own node once `endedAtMs` is at least `DONE_LINGER_MS` old,
   even while the bus still tracks it. Inside the linger the live form
   (done-flash fade) stands.

Under `theta.progress: off` no sink is called, so nothing requests a
repaint: the static form appears at the first repaint after the linger
(operator input, a new message) — item 2 makes that repaint draw static
rather than a live card with its elapsed advancing (the bus never sweeps
under `off`) — but until then the last painted frame can be the running
form. Recorded as a scoped residual, not fixed.

Witness: `tests/b0490-completed-drive-card-freezes-live.test.ts` — a
painted-frame harness (every `requestRender` repaints the component, as
pi-tui does; `repaint()` models an incidental pi-tui pass). Eight cells:
clear arm (last drive departs → static); render arm (departure while a
second stale-heat drive keeps the bus ticking); no-departure (ticking bus,
zero extra paints — red under "repaint on every render"); single-drive
verbosity round trip (red under a seen-nodes-guarded clear); two-drive
round trip, eviction through `render()` (red without the post-clear
repaint); drive started and ended entirely during `off` (same); `off`
incidental repaint → static (red without the component guard);
inside-linger live form (red if the guard ignores the linger). Red before
the fix: the last frame read `⟳ /bench · 2s · …` 60 s after the drive
ended.

Residual (recorded, not fixed here): the live form still renders an ended
top-level node as running during the 2 s linger, and the static form carries
no outcome (`invocationEnded` has none — the PIC-75 ended-children
limitation applies to the top-level node too). A terminal header state or an
Ok completion cue is an RFC 0015 design question, not this defect. No
composition-level witness drives a real theta through the TUI composition
to eviction (`tests/execution-status-supersession.test.ts` composes
`ctx.mode: "tui"` and could host one); no live harness composes TUI mode.
`docs/how-to/watch-a-running-theta.md` still documents the sinks retired in
0.488.6 and not the run card (predates this bug).

# Original filing (superseded diagnosis — kept as the record)

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
- The parent never resumed: 38 min at the checkpoint *(reclassification
  note: misread — 37m52s was the frozen card header, the drive's total
  elapsed; see "Evidence for completion" above)*, `0 children`,
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
