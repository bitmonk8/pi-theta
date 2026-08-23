# Bug 0048 — The live bug-0021 leak witness asserts an absence with no proof that any watcher delivered an event: under chokidar's `ignoreInitial: true` a churn landing before the initial scan completes is dropped, so `tests/live/double-session-start-live.test.ts`'s zero-quiesce-line assertion is satisfied by a watcher that delivered nothing, and the same test guards its *other* zero-assertion against exactly this vacuity

- **Status:** fixed (0.229.0).
- **Kind:** defect — test infrastructure, one assertion in one live test. Not a
  runtime divergence: the supersession and teardown behaviour the witness
  observes is correct at HEAD (bugs
  [0021](./0021-double-session-start-leaks-armed-watcher.md),
  [0029](./0029-throwing-supersession-detach-swallowed-watcher-rearmed.md) and
  [0034](./0034-supersession-does-not-await-whenidle.md) all shipped). The
  defect is against the witness's documented gating role and against
  AGENTS.md §"Verify both directions when adding or strengthening an assertion"
  (`AGENTS.md:111–115`): "A live assertion that cannot red is worthless."
  The bug-0021 arm is `expect(quiesceLines).toStrictEqual([])`
  (`tests/live/double-session-start-live.test.ts:304–312`) — an absence
  assertion over a `console.error` capture. Two states satisfy it: (a) no
  superseded generation's watcher survived, the property under test; (b) no
  watcher delivered any event, so no reload pass ran and nothing could quiesce.
  Nothing in the file discriminates them. State (b) is reachable because
  `PiFileWatcher` arms chokidar with `{ ignoreInitial: true }`
  (`src/seams/pi-file-watcher.ts:31`), which drops changes to paths the initial
  scan has not yet reached, and the test schedules its churns on a wall clock
  sized for the 250 ms debounce, not for scan completion.
- **Related:**
  [0021](./0021-double-session-start-leaks-armed-watcher.md) — the report this
  file is the live witness for. Its §Verification (:128–134) names it: "double
  `bindExtensions`, real chokidar churn across the 250 ms production debounce,
  a shutdown-emitting dispose, a second churn, asserting ZERO
  `theta hot-reload quiesced:` stderr lines; green post-fix and red-proven at
  ea5de328". That red-proof is a point-in-time observation at 0021's fix
  baseline; no coded precondition in the file re-establishes it, and the file
  has since gained the bug-0024 arms that move the first churn behind a live
  model turn.
  [0030](./0030-h9a-stderr-gate-gap-and-stale-intended-red-header.md) — same
  class, fixed (0.35.0): a live witness the fix records cite as regression
  evidence that passes without witnessing. 0030 closed a *missing* stderr gate;
  this report closes an *unfalsifiable* one. 0030 §Fix also sets the two
  precedents this fix follows — select the gate form from a recorded
  measurement, and prove the red direction once at the axis the gate runs on.
  Its §Fix *Residuals* (i) records a second, untouched defect in this same file
  (the re-literalised quiesce prefix, cited there at the now-stale anchor
  `:44`; at HEAD it is `:76`).
  [0034](./0034-supersession-does-not-await-whenidle.md) — the filing origin.
  See §Provenance.
- **Affected** (citations verified at HEAD `979e3fce`, 0.46.0):
  - `tests/live/double-session-start-live.test.ts` (320 lines, one `it` block
    at :150) — the whole witness.
    - **The unfalsifiable assertion:** :304–306 filters the `console.error`
      spy's calls for `STALE_QUIESCE_PREFIX`, :307–312 asserts the filtered
      list `toStrictEqual([])`. The spy is installed at :185, before the second
      bind, and restored in `afterEach` (:145–148).
    - **The churn schedule:** churn 1 at :274–280 followed by
      `await sleep(DEBOUNCE_SETTLE_MS)` (:281); shutdown-emitting dispose at
      :286; churn 2 at :295–301 followed by the same sleep (:302).
      `DEBOUNCE_SETTLE_MS = 1000` (:131). Its docstring (:125–130) states the
      budget's whole basis — "Real-time wait for the production 250 ms
      real-clock debounce to fire and any resulting reload pass to run its
      probe/rebuild. Generous 4x margin" — and names no watcher-readiness term.
      Both writes are `writeFileSync` over the pre-existing `thetaPath`
      (:172–177), so both are `change` events on a file the initial scan must
      already have attached a watcher to.
    - **The generation under test:** generation 1's watcher is armed inside
      `bootShippedExtension` (:178), whose `session.bindExtensions({})`
      (`tests/live/harness.ts:238`) fires the first `session_start`. The
      supersession is the second `bindExtensions({})` at :195. Post-fix
      generation 1 detaches there and generation 2 detaches at the dispose
      (:286), so at churn 2 no watcher exists by design — which is why the
      assertion's green carries no information unless delivery was established
      earlier.
    - **The vacuity guards the file already has, and where they stop.** :151–161
      is a `failLoudly` precondition against PIC-58 subagent-child suppression,
      with the reason stated in the comment at :151–153 ("would green this test
      vacuously — fail loudly instead of asserting against a watcher that was
      never armed"). It gates *arming*, not *delivery*. :254–268 is the
      non-vacuity guard for the file's other absence assertion: after asserting
      no `theta /greetlive: extension shutting down` note (:241–252), it
      requires `OUTBOUND_SENTINEL` in the drive's rendered `userTexts` (:239
      drives the turn), with the comment at :254–260 stating the rule verbatim
      — an empty note list "would also be produced by a drive that did
      nothing". The bug-0021 arm has no counterpart.
    - **Read helper available for the fix:** `collectSystemNotes` (:109–123)
      already reads the `theta-system-note` channel off the settled in-memory
      `SessionManager`; the bug-0024 arm uses it over a bind-scoped slice
      (:217–219).
  - `src/seams/pi-file-watcher.ts:31` — `chokidarWatch([...roots], {
    ignoreInitial: true })`. The file is 53 lines, 2379 bytes; its git blob at
    HEAD is `b03df54ae71b5c7e28e508a6bf76996eeabf469f` (recomputed over the
    working-tree bytes), which is the hash the 0034 verifier recorded after
    reverting its instrumentation, so the measurement below was taken against
    this exact source.
  - `src/seams/file-watcher.ts:39–50` — the `FileWatcher` seam. `watch()`
    returns `Unsubscribe` and takes an optional `onTerminate`; there is no
    ready/scan-complete member, so neither the runtime nor a test can await
    watcher readiness through the seam.
  - `chokidar@4.0.3` (declared `^4.0.1`, `package.json:52`) — the drop
    mechanism. `node_modules/chokidar/handler.js:396` attaches the per-path
    `fs` watcher only inside `_addToNodeFs`, and :398 suppresses the `add` that
    walk would emit while `initialAdd && options.ignoreInitial` holds.
    `node_modules/chokidar/index.js:348` passes `initialAdd = !_internal`, true
    for every user-supplied root's first walk, and :280–284 emits `ready` only
    once every queued `add()` has resolved. A write to a path the walk has not
    reached therefore produces no `change` (no watcher attached yet) and no
    `add` (suppressed on arrival).
  - `src/extension/production-composition.ts:1167–1172`, `:1186–1191` — the
    watched set is the active discovery-root union plus the two settings-file
    paths, armed through one `installHotReload` call per compose pass
    (`src/extension/hot-reload.ts:128`, watcher armed at :291–298). One
    chokidar instance and one initial scan per generation.
  - Fix records that cite this file as live regression evidence:
    [0021](./0021-double-session-start-leaks-armed-watcher.md) §Verification
    :128–134, [0023](./0023-production-composition-omits-bootstrap-seams.md)
    §Fix :250–254 ("1/1"),
    [0029](./0029-throwing-supersession-detach-swallowed-watcher-rearmed.md)
    §Fix :179–182 ("green unchanged"),
    [0034](./0034-supersession-does-not-await-whenidle.md) §Fix :245–246
    ("green"). Each reads the green as evidence about the supersession path.
- **Observed at:** `0.46.0` (`979e3fce`). The assertion shape, the churn
  schedule and the chokidar drop mechanism are reading-level, offline and
  deterministic. The first-delivery latency figure is an instrumented live
  measurement recorded during the 0034 verification (§Provenance).

## Summary

`tests/live/double-session-start-live.test.ts` is the only live test that
witnesses bug 0021's leak. Its terminal assertion is:

```ts
const quiesceLines = consoleErrorSpy.mock.calls
  .map((args) => args.map(String).join(" "))
  .filter((line) => line.includes(STALE_QUIESCE_PREFIX));
expect(quiesceLines, …).toStrictEqual([]);
```

The line it looks for is written by the PIC-67 stale-ctx probe
(`src/extension/stale-ctx.ts:44`, emitted at :66) when a watcher that outlived
the runtime drives a reload. Producing it takes a chain: a filesystem write →
a chokidar event → the `ReloadDebouncer`'s 250 ms window → `runReload`'s entry
probe. The assertion scores only the chain's last link. Break any earlier link
and the assertion passes for the wrong reason.

The first link breaks by default. `PiFileWatcher` arms chokidar with
`ignoreInitial: true`, and chokidar attaches a path's `fs` watcher only when
its initial walk reaches that path, suppressing the walk's own `add`. Writes
landing before the walk reaches a path are therefore delivered as nothing at
all. The walk's completion is not observable: the `FileWatcher` seam exposes
`watch()` → `Unsubscribe` and no readiness signal. The test compensates with
`await sleep(DEBOUNCE_SETTLE_MS)`, a 1000 ms constant whose docstring derives
it entirely from the 250 ms debounce and never mentions scan latency.

Measured on this repo's in-process live harness during the 0034 verification,
the first `add` reached the handler only after about 2.5 s of settle — larger
than the whole budget the constant provides. The witness's remaining margin is
whatever wall time the bug-0024 arms happen to insert ahead of the churns: a
full compose pass at the second bind (:195) plus one live model turn (:239),
neither of which is bounded below by anything.

The same test states the governing rule for its other absence assertion. After
asserting that dispatching `/greetlive` produced no shutting-down note, it adds
a positive observable and explains why (:254–260): an empty note list "would
also be produced by a drive that did nothing". The bug-0021 arm asserts an
empty list with no such companion. The file also fails loudly when watcher
*arming* is suppressed (:151–161, PIC-58), naming vacuity as the reason —
so the class is recognised in this file and covered at one link of the chain
only.

## Reproduction

Three parts. Part A is reading-level and offline; part B is an offline scratch
measurement over the production seam, no model; part C is live and costs the
witness's own single model turn.

**A — the assertion cannot distinguish (reading level).** Enumerate every
assertion in the file: :203–208 (registration present), :227–233 (no collision
note), :244–252 (no shutting-down note), :262–268 (outbound sentinel present),
:307–312 (no quiesce line). Only :262–268 asserts the presence of something the
machinery under test must produce, and it covers the dispatch path. No
assertion, and no `failLoudly` precondition, requires that a watcher event was
ever delivered. `rg -n "add|change|unlink"
tests/live/double-session-start-live.test.ts` returns nothing at all — the file
names no watcher event kind anywhere — and the one watcher-derived observable
it could read, the structural-change note, is never looked for.

**B — measure the first-delivery latency directly.** A scratch script (deleted
after use) arms the production seam over a freshly created workspace shaped
like the test's, writes into it at `t = 0`, and records the delay to the first
handler call:

```ts
const dir = mkdtempSync(join(tmpdir(), "theta-scan-"));
mkdirSync(join(dir, ".pi", "theta"), { recursive: true });
writeFileSync(join(dir, ".pi", "theta", "greetlive.theta"), "…", "utf8");
const t0 = Date.now();
const unsub = new PiFileWatcher().watch([join(dir, ".pi", "theta")], (e) =>
  console.log(e.kind, Date.now() - t0),
);
writeFileSync(join(dir, ".pi", "theta", "greetlive.theta"), "… edited", "utf8");
```

Record the delay and compare it with `DEBOUNCE_SETTLE_MS = 1000`. The figure is
machine-dependent; the shape is not — with the write issued before the walk
reaches the path, no event is delivered for that write at all, and the next
delivery comes from a later write. Record the observed value in this document
under §Fix before landing the fix, on the 0030 §Fix "Measured baseline"
precedent.

**C — show the green survives the defect it is meant to catch.** Neutralise the
supersession pass's handling of the outgoing generation so generation 1's
watcher leaks: remove the mark-and-quiesce block
(`src/extension/factory.ts:815–816`, bug 0034's fix) and the isolated
`outgoingHandle?.detach()` (:870, bug 0021's fix; re-derived at HEAD — unrelated
factory.ts edits since this report was filed shifted both citations by two
lines). Both are required — the mark
alone stops generation 1's debouncer from starting a new rebuild, which
suppresses the quiesce line for a second reason. Then run the witness twice:

```
npx vitest run --config config/vitest/vitest.live.config.ts \
  tests/live/double-session-start-live.test.ts
```

1. **As written.** The bug-0024 arms red first (they are `expect.soft`, so the
   run continues to the quiesce arm). Whether the quiesce arm reds depends on
   whether generation 1's watcher was past its initial scan when churn 2
   landed — i.e. on how long the live model turn at :239 took. Shorten the
   pre-churn window (drive no turn; drop `DEBOUNCE_SETTLE_MS` toward the
   measured scan latency) and the quiesce arm greens with the leak present.
2. **With the §Fix warm-up churn.** The quiesce arm reds with exactly one
   captured `theta hot-reload quiesced:` line — the signature bug 0021 §Verification
   :132–134 records at `ea5de328` — and does so independently of the model
   turn's duration.

Restore `src/extension/factory.ts` and confirm green. The pair (1) green /
(2) red under the same injected defect is the demonstration.

## Expected behaviour

- **AGENTS.md §"Verify both directions when adding or strengthening an
  assertion"** (`AGENTS.md:111–115`): "A live assertion that cannot red is
  worthless. After strengthening, prove the red path once …, then restore and
  confirm green." The bug-0021 arm's ability to red is conditioned on an
  unmeasured race between the test's wall-clock schedule and chokidar's initial
  scan. Its one recorded red-proof (bug 0021 §Verification :132–134) is a
  point-in-time observation at `ea5de328`, taken before the bug-0024 arms
  restructured the file, and no precondition in the file preserves it.
- **AGENTS.md §"Assert on real observables, not on `prompt()` resolving"**
  (`AGENTS.md:93–109`): an absence is a legitimate success observable — "A
  subagent-mode drive's transcript is private, so absence of these notes IS the
  success observable" (:103–104) — for a channel that is known live. The test
  applies that qualifier to its dispatch-path absence assertion (:254–268) and
  not to its watcher-path one.
- **AGENTS.md §"No silent skipping"** (`AGENTS.md:60–64`): an unmet live
  precondition "**fails loudly** naming the unmet precondition (`failLoudly` in
  every live harness) — never an early return or skip". A watcher that never
  delivered is an unmet precondition for this witness, and it currently reports
  as a pass. The file already spends a `failLoudly` on the adjacent
  precondition (:151–161).
- **Bug 0030 §Fix** set the two procedural precedents for this class: pick the
  gate's form from a recorded measurement rather than a preference, and prove
  the red direction once at the axis the gate runs on.

## Actual behaviour / root cause

Three facts compose into the defect.

**1. The observable is absence-only.** The witness's target is a
`console.error` line the runtime writes only on the failure path. The success
path writes nothing, so the assertion has no positive form available at the
point it runs: post-fix, generation 1's watcher is detached at the supersession
(:195) and generation 2's at the dispose (:286), so at churn 2 no watcher
exists and no observable of any kind is produced. Any evidence that the
delivery chain works must therefore be gathered *earlier* in the test, while a
watcher is still attached. The test gathers none.

**2. `ignoreInitial: true` makes early writes invisible, not late.**
`PiFileWatcher.watch` passes `{ ignoreInitial: true }`
(`src/seams/pi-file-watcher.ts:31`) so the steady-state contract sees only
post-attach changes — the comment at :26–30 states that intent. chokidar
implements it per path during the recursive walk: `_addToNodeFs` attaches the
path's `fs` watcher (`handler.js:396`) and then emits `add` only when
`!(initialAdd && options.ignoreInitial)` (:398). `initialAdd` is true for the
whole first walk of a user-supplied root (`index.js:348`), and `ready` fires
only after every queued `add()` resolves (`index.js:280–284`). A write to a
path the walk has not yet reached is therefore lost twice over: there is no
watcher to raise `change`, and the walk's later `add` is suppressed. The window
is not a fixed constant — it scales with the watched set, which here is the
discovery-root union plus two settings-file paths
(`src/extension/production-composition.ts:1167–1172`) — and it reopens for each
generation, because each compose pass arms its own watcher
(`src/extension/hot-reload.ts:291–298` via `:128`).

**3. Nothing in the seam or the test observes scan completion.**
`FileWatcher.watch` returns `Unsubscribe` and nothing else
(`src/seams/file-watcher.ts:39–50`); chokidar's own `ready` event is
deliberately not wired (`src/seams/pi-file-watcher.ts:26–30`). The test
substitutes wall time: `DEBOUNCE_SETTLE_MS = 1000` (:131), derived in its
docstring (:125–130) purely from the 250 ms debounce as a "Generous 4x margin",
with no term for scan latency. The measured first-delivery latency on this
repo's in-process live harness was about 2.5 s, so the constant does not cover
the omitted term. What actually keeps the witness honest today is incidental:
the second bind's full compose pass (:195) and one live model turn (:239) sit
between generation 1's arming and churn 2. The model turn's duration is
stochastic and unbounded below.

The result is a test whose green is consistent with the defect it exists to
catch. The 0034 verification exhibited the identical failure directly: its
scratch live probe on this same supersession path greened without witnessing
anything until a warm-up churn — churn, then await the resulting delivered
note, before the supersession — was added as a precondition.

## Why it matters

- Four shipped fix records read this file's green as evidence about the
  supersession path: 0021 §Verification :128–134 (as the live regression
  witness for the leak), 0023 §Fix :250–254, 0029 §Fix :179–182, 0034 §Fix
  :245–246. A regression that re-leaks a superseded generation's watcher can
  land under an unchanged green here, because a dropped churn and an absent
  leak are the same observation.
- The witness is the only live coverage of the property. The offline zero-quiesce
  assertions run inside a synthetic harness
  (`tests/hot-reload-stale-ctx-replacement.test.ts`), and bug 0030's H9a
  empty-capture stderr gate reds on a quiesce line only when one is actually
  emitted — the same dependency on delivery, in a suite that performs no churn
  at all.
- The run is not free. It boots a real session and drives one live model turn
  (the file header records the cost at :46–52), so a green that establishes
  nothing about the watcher path spends tokens for no gate.
- The failure mode is silent and drifts in one direction. Every change that
  makes the machinery faster (a shorter compose, a smaller planted workspace)
  or the model turn quicker narrows the incidental margin, and none of them
  produces a signal.

## Non-goals

- **The runtime.** `ignoreInitial: true` is the specified steady-state delivery
  contract (PIC-14; `src/seams/pi-file-watcher.ts:26–30`). This report does not
  propose changing it, adding a `ready` member to the `FileWatcher` seam, or
  altering the debounce.
- **The bug-0024 arms** (:210–268). They carry their own non-vacuity guard and
  are unaffected except for the extra registered name the warm-up plants.
- **The re-literalised quiesce prefix** at :76. Bug 0030 §Fix *Residuals* (i)
  records it as a candidate follow-up filing, against the stale anchor `:44`;
  it stays a separate filing.
- **Extending the witness's coverage.** This report makes the existing bug-0021
  assertion falsifiable. It does not make the file witness bug 0029's or bug
  0034's classes, which are silence and ordering defects a stderr-line
  assertion cannot red on.

## Fix

One test-file change, no source change: establish watcher delivery as a proven
precondition before the supersession, on the pattern the 0034 scratch live
probe needed to stop greening vacuously.

**Warm-up churn, awaited via its delivered note.** Between
`bootShippedExtension` (:178) and the second `bindExtensions({})` (:195):

1. Write a second `.theta` into the watched project directory
   (`<workspace.cwd>/.pi/theta/`) under a stem distinct from
   `SURVIVING_SLASH_NAME` (:79), so it cannot satisfy or defeat the bug-0024
   filters at :220–222 and :241–243, both of which cut on that name (:221
   directly, :242 through `SHUTTING_DOWN_NOTE`, :87).
2. Poll `handle.sessionManager.getEntries()` through the existing
   `collectSystemNotes` reader (:109–123) for the structural-change note
   `theta watcher: 1 file(s) added or removed; run /reload to refresh the slash
   command list` (`src/extension/reload-wiring.ts:470`, emitted at
   `src/extension/hot-reload.ts:271–273`).
3. Re-write the warm-up file on a fixed interval while polling, so a write that
   lands inside the initial scan is retried instead of lost.
4. On cap expiry call `failLoudly` (`tests/live/harness.ts:70`) naming the
   unmet precondition — the watcher armed by this generation delivered no event
   within the cap, so the witness below would be vacuous. This mirrors the
   PIC-58 guard at :151–161 and satisfies AGENTS.md §"No silent skipping".

The churn must be **structural**, not a body rewrite: `structuralChangeNote`
returns `undefined` when nothing was added or removed
(`src/extension/reload-wiring.ts:460–464`), so a content-only edit delivers no
note and cannot be awaited. Planting a new file also exercises the `add` path,
which is the kind the measurement found suppressed.

The precondition is established by awaiting a delivered observable, not by
enlarging `DEBOUNCE_SETTLE_MS`: a larger wall-clock budget restates the same
unpinned assumption at a different magnitude and still fails silently. Keep
`DEBOUNCE_SETTLE_MS = 1000` for churns 1 and 2 — after the warm-up it covers
what its docstring claims it covers, the debounce plus the reload pass.

**Placement is load-bearing.** The leaked watcher the assertion is about is
generation 1's, armed inside `bootShippedExtension` (`tests/live/harness.ts:238`).
The warm-up must run before the second bind, because after the supersession
that watcher is correctly gone and its delivery can no longer be demonstrated.
Pre-fix — and under the §Reproduction C injection — the same chokidar instance
survives the supersession and the dispose, so churn 2 (:295) then reaches a
watcher already proven past its initial scan, and the quiesce arm's green
becomes evidence about the leak rather than about scan timing.

**Cap magnitude.** Size it at least an order above the §Reproduction B measured
latency (about 2.5 s recorded during the 0034 verification). The cap bounds a
loud failure, not a settle budget, so over-sizing costs wall time only when the
precondition is genuinely unmet. Record the measured latency and the chosen cap
in this section when the fix lands, on the bug 0030 §Fix "Measured baseline"
precedent.

**Red-direction proof (required before the fix is considered done).** Per
AGENTS.md §"Verify both directions", run §Reproduction C: with
`src/extension/factory.ts:815–816` and :870 neutralised (re-derived at HEAD;
see §Reproduction C), the witness must red with
exactly one captured `theta hot-reload quiesced:` line — the signature bug 0021
§Verification :132–134 records — and must do so with the model turn's duration
made irrelevant. Restore the source, confirm green, and confirm
`git diff -- src/` is empty. The offline suite is untouched by this change and
must stay green.

**Comment reconciliation.** The comment at :270–273 claims churn 1 exercises
"post-fix only generation 2's watcher fires (a normal live reload)". Churn 1
carries no assertion and generation 2's watcher has its own unproven initial
scan, so state what the churn does — advance the session past one debounce
window before the shutdown — instead of a delivery the test does not verify.

**Residuals.**
(i) The warm-up proves generation 1's watcher delivers. It does not prove
generation 2's watcher (armed at :195) is past its own scan when churn 1 lands
at :274; nothing is asserted on churn 1, so nothing is gated on it.
(ii) The warm-up leaves a second discovered `.theta` in the workspace for the
remainder of the test, so generation 2 registers two slash names and its
structural-change baseline includes both. The bug-0024 arms filter on
`SURVIVING_SLASH_NAME` (:221, and :242 through `SHUTTING_DOWN_NOTE` at :87) and
are unaffected.
(iii) The witness still covers only the 0021 leak class; see §Non-goals.

**Ordering.** Independent of every open bug. It touches one live test file and
no source, so it can land in any order.

## Provenance

- Origin: residual R2 of the
  [bug 0034](./0034-supersession-does-not-await-whenidle.md) fix, recorded by
  that fix's verifier and not in the report itself; this filing is its durable
  record, on the same footing as bug 0030's origin. 0034 §Fix (0.46.0) "Live."
  (:245–256) is the filing anchor: it records this file green on the
  supersession path and records the scratch live probe that supplied the
  in-flight-rebuild coverage. The verifier's two additional observations — that
  the probe greened vacuously until a warm-up churn awaited via its delivered
  note was added before the supersession, and that instrumenting
  `src/seams/pi-file-watcher.ts` measured about 2.5 s of settle before the
  first `add` reached the handler in the shipped in-process harness — are
  reproduced here. The instrumentation was reverted byte-exact: the file's git
  blob at HEAD is `b03df54ae71b5c7e28e508a6bf76996eeabf469f` over 2379 bytes,
  recomputed from the working-tree bytes for this report.
- Test evidence, all at HEAD `979e3fce`:
  `tests/live/double-session-start-live.test.ts` :76 (the re-literalised
  prefix), :109–123 (`collectSystemNotes`), :125–131 (`DEBOUNCE_SETTLE_MS` and
  its docstring), :150 (the single `it`), :151–161 (the PIC-58 `failLoudly`
  precondition), :178 (generation 1 boot), :185 (the `console.error` spy), :195
  (the supersession), :203–208 (the registration sanity check), :210–233
  (bug-0024 collision arm), :235–252 (bug-0024 dispatch arm), :254–268 (that
  arm's non-vacuity guard), :270–281 (churn 1),
  :286 (shutdown-emitting dispose), :289–302 (churn 2), :304–312 (the bug-0021
  assertion); `tests/live/harness.ts` :70 (`failLoudly`), :147–171
  (`plantThetaWorkspace`), :196–262 (`bootShippedExtension`, first
  `bindExtensions` at :238).
- Implementation evidence: `src/seams/pi-file-watcher.ts` :26–30 (the
  `ignoreInitial` rationale), :31 (the chokidar construction);
  `src/seams/file-watcher.ts:39–50` (no readiness member);
  `src/extension/stale-ctx.ts:44`/:66 (the prefix and its emit site);
  `src/extension/hot-reload.ts:128` (`installHotReload`), :271–273 (the
  structural-note send), :291–298 (the watcher arming);
  `src/extension/reload-wiring.ts:456–474` (`structuralChangeNote`, the empty
  suppression at :460–464 and the template at :470);
  `src/extension/production-composition.ts:1167–1172`, :1186–1191 (the watched
  set and the per-pass arming).
- Host evidence: `chokidar@4.0.3` (`package.json:52` declares `^4.0.1`) —
  `node_modules/chokidar/handler.js:396`, :398;
  `node_modules/chokidar/index.js:280–284`, :348.
- Convention evidence: `AGENTS.md` §"No silent skipping" (:60–64), §"Assert on
  real observables, not on `prompt()` resolving" (:93–109, with the
  absence-as-observable rule at :103–104), §"Verify both directions when adding
  or strengthening an assertion" (:111–115).
- Cited fix records: bug 0021 §Verification :128–134 (the witness's role and
  its one recorded red-proof at `ea5de328`); bug 0023 §Fix :250–254; bug 0029
  §Fix :179–182; bug 0030 §Fix "Measured baseline" and *Residuals* (i)
  (:200–204); bug 0034 §Fix "Live." :245–256.

## Fix (0.229.0)

- **What shipped:** `tests/live/double-session-start-live.test.ts` (325 → 448
  lines, the only file changed; `git diff -- src/` empty) — a watcher-delivery
  precondition for the bug-0021 arm, per §Fix. Between `bootShippedExtension`
  and the second `bindExtensions({})`, and ahead of both the `console.error`
  spy install and the `entriesBeforeSecondBind` sample: a **structural** churn
  plants `b0048warmup.theta` in `<workspace.cwd>/.pi/theta/`
  (`WARMUP_SLASH_NAME`, a stem neither bug-0024 filter cuts on), re-issued on a
  fixed cadence while polling the settled in-memory `SessionManager` through
  the existing `collectSystemNotes` reader for the delivered structural-change
  note (`src/extension/reload-wiring.ts:477`, sent at
  `src/extension/hot-reload.ts:271–273`); on cap expiry `failLoudly` names the
  unmet precondition — the watcher armed by this generation delivered no event,
  so the witness below would be vacuous. `DEBOUNCE_SETTLE_MS = 1000` unchanged;
  no model turn added (cost stays ONE turn); the churn-1 comment now states
  what churn 1 does (advance the session past one debounce window before the
  shutdown, nothing asserted) instead of claiming an unverified delivery.
  Citation-only: §Reproduction C and §Fix's neutralisation anchors re-derived
  at HEAD (`factory.ts:813–814`/:868 → `:815–816`/:870).
- **Measured baseline** (bug 0030 §Fix precedent). Bare production seam,
  chokidar@4.0.3, one watched root over a freshly planted `.pi/theta`: a single
  write issued at `t = 0` immediately after `PiFileWatcher.watch()` delivered
  **nothing at all** by `t = 4000 ms`; a later write at `t = 4000 ms` delivered
  `change +4021 ms`. With the same write **retried every 250 ms**, first
  delivery was `add +272 ms` after two retried writes. In this repo's
  in-process live harness the 0034 verification measured about 2.5 s of settle
  before the first `add` reached the handler. An un-retried early write is lost
  outright, so the retry loop is load-bearing rather than defensive, and
  `DEBOUNCE_SETTLE_MS = 1000` does not cover the omitted scan term. Chosen cap:
  `WARMUP_DELIVERY_CAP_MS = 30_000` (an order above the 2.5 s in-harness
  figure); it bounds a loud failure, not a settle budget, and the loop exits at
  first delivery. Retry cadence `WARMUP_POLL_INTERVAL_MS (250) ×
  WARMUP_POLLS_PER_WRITE (2) = 500 ms`, i.e. twice the production debounce
  window: `ReloadDebouncer.onWatcherEvent` is unconditional
  drop-and-reschedule, so a retry cadence equal to the window can re-arm the
  timer indefinitely and starve the reload pass whose note is the awaited
  observable.
- **Assertions touched.** None changed in form or semantics. The bug-0021 arm
  `expect(quiesceLines, …).toStrictEqual([])` is byte-unchanged — the fix makes
  it falsifiable, not different. The registration sanity read and the three
  bug-0024 `expect.soft` arms (collision notes, shutting-down notes, outbound
  sentinel) are byte-unchanged. One non-`expect` precondition was **added**:
  the warm-up `failLoudly`, mirroring the PIC-58 guard.
- **Gates.** `npm test` → `Test Files 409 passed (409)` / `Tests 8605 passed
  (8605)`; `npm run typecheck` (`tsc -p tsconfig.json --noEmit`) clean;
  `npm run lint` (`eslint … "src/**/*.ts"`) clean. Live witness, one lock hold:
  RED under the §Reproduction C injection then GREEN restored (below).
- **Red-direction proof** (AGENTS.md §"Verify both directions"). With
  `src/extension/factory.ts:815–816` (`markTornDown` + `quiesceOutgoingRebuild`)
  and :870 (`outgoingHandle?.detach()`) commented out, the hardened witness
  failed on the quiesce arm with **exactly one** captured line — `theta
  hot-reload quiesced: extension runtime invalidated without session_shutdown
  (bare AgentSession.dispose()); watcher detached, hot reload halted for this
  extension instance (bug 0018, PIC-67)` — the signature bug 0021
  §Verification :132–134 records, with no `failLoudly` precondition message in
  the output (so the red is the leak, not a broken warm-up). The source was
  restored by writing the original bytes back (no `git checkout`/`restore`/
  `stash`): `git hash-object src/extension/factory.ts` ==
  `git rev-parse HEAD:src/extension/factory.ts` ==
  `10be4af95f266df96510f159b4c2c295a1d46c39`, and `git diff -- src/` empty.
  The restored tree then ran GREEN (`Test Files 1 passed (1)`, 6.1 s). The pair
  was produced twice independently — once at implementation, once at
  verification.
- **Review.** Two rounds. Round 1 (deep): one fidelity finding — the §Fix
  "Cap magnitude" measured-baseline record was still unwritten (discharged by
  the *Measured baseline* bullet above) — plus one prose residual on the
  `WARMUP_POLL_INTERVAL_MS` docstring, which claimed "sub-debounce" for a value
  equal to the debounce. Round 2 (polish, comment-only): docstring corrected;
  verified by gate diff, confirmation round skipped because no executable line
  was touched.
- **Verification.** PASS. Red-then-green pair under the injection with a
  byte-exact restore (quoted above); default suite 409/8605 green; live
  coverage is this cell itself — the doc's own witness on the lifecycle surface
  — run under the live lock; H9a not owed (the diff touches no acceptance
  surface); typecheck and lint clean; no silent skip, no added model turn, no
  racy event subscription, no surviving scratch artifact.
- **Residuals.**
  1. As §Fix records: the warm-up proves generation 1's watcher delivers, not
     generation 2's (armed at the second bind) when churn 1 lands. Nothing is
     asserted on churn 1, and the reconciled comment says so.
  2. The warm-up leaves `b0048warmup.theta` in the workspace, so generation 2
     registers two slash names and its structural baseline covers both. The
     bug-0024 arms cut on `SURVIVING_SLASH_NAME` and were green in every live
     run.
  3. The witness still covers only the 0021 leak class (§Non-goals).
  4. The test file grew 325 → 448 lines, so line citations into it from other
     documents (this report's §Affected and §Provenance, bug 0030 §Fix
     *Residuals* (i), bug 0243's record) are stale below the warm-up block.
     Those anchors are pinned to the HEADs their own reports name and were not
     rewritten here.
  5. Pre-existing citation drift left untouched: this report's `tests/live/harness.ts`
     anchors (`:70` `failLoudly` → `:80`; `:238` first `bindExtensions` →
     `:260`; `:147–171` `plantThetaWorkspace` → from `:157`) predate this fix —
     `harness.ts` was not touched.
- **Discharge notes appended:** none.
- **Pinned dispositions / non-goals.** The runtime is untouched:
  `ignoreInitial: true`, the `FileWatcher` seam's missing readiness member and
  the 250 ms debounce all stand (§Non-goals). The re-literalised quiesce prefix
  stays a separate filing. A larger `DEBOUNCE_SETTLE_MS` was rejected by §Fix
  and not taken: it restates the same unpinned assumption at another magnitude.
