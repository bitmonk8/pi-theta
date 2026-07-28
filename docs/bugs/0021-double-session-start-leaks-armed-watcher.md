# Bug 0021 — A second `session_start` at one extension instance overwrites the single-slot hot-reload handle: the superseded generation's watcher stays armed (leaked) and keeps publishing, and `session_shutdown` tears down only the latest generation

- **Status:** fixed (0.30.0). A shutdown-less repeat `session_start` is now a
  supersession pass: the completing compose detaches the prior generation's
  watcher and drains its registry BEFORE overwriting the live-resource slots,
  folds that generation's in-flight invocation registry and forwarding-signal
  list into a factory-scoped supersession list so one `session_shutdown`'s
  sub-steps 2/3/5 reach every published generation, goes zero-touch when a
  newer compose started during its own flight (closing the overlap
  inversion), and emits one repeat-start system note per shutdown-less repeat
  delivery. Pinned as
  `registration-steps.md#repeat-start-supersession` and PIC-68
  (`session-shutdown-semantics.md#pic-68`).
- **Kind:** defect — the factory violates its own "arms ONE hot-reload watcher
  … the `session_shutdown` handler detaches it" wiring contract
  (`registration-steps.md` [step 5](../spec_topics/pi-integration-contract/registration-steps.md#watcher-hot-reload-registration),
  restated in the `composeInstance` dep docstring, `src/extension/factory.ts:218`)
  and defeats the reach of the step-4 teardown
  ([PIC-57](../spec_topics/pi-integration-contract/session-shutdown-semantics.md#pic-57))
  whenever one extension instance receives `session_start` twice without an
  intervening `session_shutdown`. Reachability is class (b): **not** reachable
  through the shipped CLI hosts at the host pin (`~0.80.10` — every
  replacement/reload path emits `session_shutdown` to the outgoing instance and
  then re-runs the extension factory, so a fresh closure sees each
  `session_start`), but reachable in-product through the public host SDK —
  `AgentSession.bindExtensions()` carries no once-guard and every call re-emits
  the stored `_sessionStartEvent` to the SAME `ExtensionRunner` and the same
  factory closure (`dist/core/agent-session.js:1764`), and a direct
  `extensionRunner.emit({ type: "session_start", … })` does the same; theta's
  own live harness rides exactly this API (`tests/live/harness.ts:239`).
  Theta's spec does not pin a single-start assumption either: step 3 speaks of
  the "first `session_start` collision pass" and of a later "`session_start`
  supersession pass" ([superseded-entry dispatch](../spec_topics/pi-integration-contract/registration-steps.md#superseded-entry-dispatch)),
  so a repeat delivery is a contemplated input the runtime must survive, not a
  contract violation by the host.
- **Affected:** `src/extension/factory.ts` at ea5de328 (line citations
  re-resolved against the ea5de328 tree — the bug-0022 fix rewrote the same
  region after the 28ce714d observation) — `hotReloadHandle` single slot
  (:253, overwritten at :561 with no detach of the prior handle); the four
  live-teardown slots `liveRegistry` / `liveClock` / `liveActiveInvocations` /
  `liveForwardingSignals` (:262–273, overwritten at :540–549), which the
  `session_shutdown` handler reads lazily (:596 ff.) so one teardown reaches
  only the latest generation; the PIC-67 compose-settle guard (:499,
  :523–536 — the bug-0022 fix subsumed the earlier arming-only check into
  this whole-tail zero-touch gate) which still counts only `session_shutdown`
  deliveries and passes on a shutdown-less second start. Per-compose resource
  construction: `composeExtensionInstance`
  (`src/extension/production-composition.ts:1012` — one `PiFileWatcher`
  (:312 default), one `ThetaRegistry`, one `ActiveInvocationRegistry`, one
  forwarding-signal sink per call) and `installHotReload`
  (`src/extension/hot-reload.ts:125` — one armed watcher + one
  `ReloadDebouncer` per call).
- **Observed at:** `0.28.0` (28ce714d), host Pi pin `~0.80.10`. Mechanical
  reproduction (offline scratch vitest over the shipped composition); no live
  observation. Origin: residual recorded by the bug-0018 fix reviewers.

## Fix (0.30.0)

Bug doc Option 1 (supersede-before-publish plus the compose-generation
capture-compare) with Option 3's one-note diagnostic folded in, all in
`src/extension/factory.ts` (line anchors at the fix commit).

**Supersede-before-publish (`factory.ts:660–679`).** A completing compose
pass, before overwriting the live-resource slots (:681–690), supersedes the
current occupants against the still-live runtime: it folds the outgoing
generation's in-flight `ActiveInvocationRegistry` and forwarding-signal list
into the factory-scoped `supersededGenerations` list (declared :337, fold
:660–665), drains the outgoing registry (:666) so every pi-registered handler
still bound to it fails safe at dispatch with the drain-state arm-(b)
shutting-down note (Pi has no unregister), and detaches the outgoing watcher
with the handle slot cleared before `detach()` (:667–670) so no later path can
double-detach the same handle. The infallible steps (fold, drain) run before
the fallible detach, so a throwing detach cannot strand the fold; on a first
start and on a start-after-shutdown rebind the whole step is a structural
no-op.

**Compose-generation zero-touch guard (`factory.ts:317, :564–565,
:623–637`).** `composeStartsObserved` (:317) joins `shutdownEventsObserved` as
a second kind of touch-free staleness evidence: each pass stamps its own
generation before the async compose (:564–565), and the bug-0022
compose-settle predicate widens to `composeTailSuperseded` (:623–625),
evaluated on both arms (catch :630, success :637) — a compose that observes a
newer compose started during its own flight publishes, registers, and arms
nothing. This closes the overlap variant's last-completer-wins inversion: only
the newest-started compose owns publication, and it supersedes the then-live
generation itself.

**Teardown reach across generations (`factory.ts:766–860`).** The
`session_shutdown` handler captures the teardown handle at the lazy-read point
(:766) and builds merged teardown inputs — one handler-local
`ActiveInvocationRegistry` and one concatenated forwarding-signal list
spanning the superseded generations in supersession order, then the latest
(:776–787) — so one shutdown's sub-steps 2/3 (reason-stamp + cancel, bounded
dispose-await) and 5 (forwarding-listener detach) reach every generation the
instance ever published. Sub-steps 1/4 stay latest-only: each superseded
generation's registry was already drained and its watcher already detached at
supersession time. The handler then consumes the supersession state
synchronously (:857–860), making a later start-after-shutdown supersession a
structural no-op; `liveRegistry`/`liveClock` are kept so the
host-prerequisites clause-(b) re-delivery short-circuit still routes through
the drain-state read.

**Repeat-start diagnostic (`factory.ts:327, :558–593`).** One system note per
shutdown-less repeat delivery — content byte-exact `theta: repeat
session_start without session_shutdown; superseding prior hot-reload
generation` (`display: true`, `triggerTurn: false`) — emitted at delivery
time, before the compose runs, so the overlap case still yields exactly one.
The predicate keys on the shutdown count as of the LAST compose start
(`shutdownsAtLastComposeStart`, :327): zero shutdowns consumed since the
previous start, never a cumulative starts-vs-shutdowns imbalance — so a
start-after-shutdown rebind emits none.

**Spec.** `registration-steps.md` step 5 gains the
`#repeat-start-supersession` pin: a shutdown-less repeat `session_start` is a
supersession pass; at most ONE armed watcher across repeat deliveries; detach
+ drain before publish (a surviving stale-bound name fails safe on arm (b));
zero-touch for a superseded-in-flight compose; the pinned one-note diagnostic.
`session-shutdown-semantics.md` gains PIC-68: the compose-generation evidence
joins PIC-67's compose-settle continuation suppression as a second disjunct at
the same boundary; the supersession fold; one-shutdown teardown reach with
sub-steps 1/4 latest-only. `coverage-matrix.md` gains the PIC-68 row.

**Verification.** Full default suite 219 files / 2545 tests green; typecheck
and lint clean. Offline lock: four tests in
`tests/double-session-start-supersession.test.ts` (single-start control;
sequential double start; overlap; start-after-shutdown rebind control) —
tests 2 and 3 red at ea5de328 with 14 signature failures, green post-fix, red
direction re-proven by the verifier via base revert. Live witness (H8a):
`tests/live/double-session-start-live.test.ts` — double `bindExtensions`,
real chokidar churn across the 250 ms production debounce, a
shutdown-emitting dispose, a second churn, asserting ZERO
`theta hot-reload quiesced:` stderr lines; green post-fix and red-proven at
ea5de328, where exactly one quiesced line is captured (misattributed to bug
0018's bare-dispose path). Live regression witness:
`tests/live/live-production-acceptance.test.ts` 5/5.

**Residuals.** (i) After ANY re-bind of the same extension instance
(shutdown-less supersession or start-after-shutdown rebind), a slash name
that survives into the new generation's discovery is collision-dropped
against the instance's own prior `pi.registerCommand` registration: the
`session_start` compose pass reads `pi.getCommands()` with no own-name
exclusion (unlike the hot-reload pass), and Pi has no unregister, so the
name's handler stays bound to the superseded, drained registry and dispatch
yields the arm-(b) `theta /<name>: extension shutting down` note until the
operator runs `/reload`. Fail-safe, contemplated by the step-5 pin, and
materially better than the pre-fix silent dispatch against a stale stranded
registry — but the supersession pass does not re-own surviving names, and
the note misnames the state on a live session. Filed as
[bug 0024](./0024-rebind-self-collision-drops-surviving-names.md). (ii)
Accepted asymmetry (reviewer round 1): a throwing supersession detach is
swallowed without a diagnostic (documented at the site, `factory.ts:671–679`)
— the outgoing registry is already drained, so the superseded generation
fails safe at dispatch regardless.

## Summary

The factory closure keeps exactly one slot per live resource: the step-5
teardown handle (`hotReloadHandle`) and the four lazily-read teardown inputs
(`liveRegistry`, `liveClock`, `liveActiveInvocations`,
`liveForwardingSignals`). Each completing `session_start` compose pass
assigns all five unconditionally. On a second `session_start` with no
intervening `session_shutdown`, the second compose overwrites the slots
without detaching the first generation's handle, so:

- generation 1's watcher (real chokidar in production) and its
  `ReloadDebouncer` stay armed with no reachable teardown — leaked for the
  process lifetime unless a later watcher event trips the PIC-67 stale probe;
- generation 1's reloads keep running and keep **publishing**: both
  generations share the one live extension runtime (staleness is per
  `ExtensionRunner`, not per compose generation), so the bug-0018 stale probe
  passes and does not quiesce the superseded generation while the session is
  live — its rebuilds swap the superseded generation-1 registry and
  re-register the live `pi` slash commands with handlers bound to that
  superseded registry;
- one `session_shutdown` then tears down only the generation the slots
  currently name: one watcher detached, one registry drained, one
  invocation-registry cancelled — every other generation's watcher, registry,
  in-flight invocations, and forwarding listeners are missed.

The PIC-67 `shutdownEventsObserved` guard added by the bug-0018 fix — widened
at ea5de328 by the bug-0022 fix into the compose-settle whole-tail zero-touch
gate (`composeOutlivedSession`, factory.ts:523–536) — closes only the
arm-after-teardown race (a `session_shutdown` consumed while a compose is in
flight). It counts shutdowns, not compose generations, so it passes for both
composes here and both watchers arm.

## Reproduction

Offline, deterministic — scratch vitest (deleted after use) in the pattern of
`tests/watcher-hot-reload-integration.test.ts` /
`tests/hot-reload-stale-ctx-replacement.test.ts`: the real
`createThetaExtension` + `composeExtensionInstance` over a temp-dir workspace,
a counting `FakeFileWatcher` subclass **per compose call** and one shared
`FakeClock` injected through the compose seam overrides, hand-rolled
`pi`/`ctx` fakes recording `registerCommand` and `sendMessage`, and
`fireSessionStart`/`fireSessionShutdown` helpers dispatching the subscribed
handlers. Three tests, all green at 28ce714d:

1. **Control (single start).** `session_start` once, `session_shutdown` once:
   the one watcher is detached, and a post-shutdown dispatch of the registered
   `/greet` short-circuits with the sub-step-1 note
   `theta /greet: extension shutting down`. The discriminators used below are
   live.
2. **Sequential double start.** `session_start` twice (each awaited), no
   shutdown between. Observed:
   - two compose passes, two distinct wirings/registries, `watch` called once
     on each of the two fake watchers, both attached — two armed watchers, one
     reachable handle;
   - plant `second.theta`, fire a change on **watcher 1** (the superseded
     generation), cross the debounce boundary: the generation-1 reload runs to
     publish — `wirings[0].registry.get("second")` becomes defined while
     `wirings[1].registry.get("second")` stays `undefined` (registry
     divergence), and `pi.registerCommand("second", …)` fires with a
     drain-gated handler closed over the **generation-1** registry (the
     superseded generation mutates the live host command surface). The stale
     probe did not quiesce it: the shared ctx is live for both generations;
   - one `session_shutdown`: watcher 2 detached, **watcher 1 still attached**;
     `wirings[1].registry.readDrainState().drained === true`,
     `wirings[0]` **not** drained;
   - post-shutdown dispatch of `/second` **dispatches** (resolves, no
     `shutting down` note recorded) — the drain gate read the undrained
     generation-1 registry, so the shutdown fail-safe is bypassed for every
     name last re-registered by a superseded-generation reload;
   - plant `third.theta`, fire watcher 1 again, cross the boundary:
     the leaked generation still rebuilds **after teardown** —
     `wirings[0].registry.get("third")` defined and `third` registered with
     `pi`.
3. **Overlap variant.** Gate the compose supplier; fire `session_start` #2
   while compose #1 is in flight; release so compose #2 completes first and
   compose #1 last. Both watchers arm (the PIC-67 guard fires for neither —
   no shutdown was consumed). The **last completer** owns the slots regardless
   of start order: `session_shutdown` detaches compose #1's watcher and drains
   compose #1's registry; compose #2's watcher — the newer generation — leaks
   armed with its registry undrained.

## Expected behaviour

Per [registration-steps.md step 5](../spec_topics/pi-integration-contract/registration-steps.md#watcher-hot-reload-registration)
and the factory's `composeInstance` contract, the extension instance arms
**one** hot-reload watcher whose teardown handle the `session_shutdown`
handler detaches; per the step-4 teardown
([session-shutdown-semantics.md](../spec_topics/pi-integration-contract/session-shutdown-semantics.md),
sub-steps 1–5) a shutdown drains the registry, cancels and awaits the
in-flight invocations, closes the watchers, and detaches the forwarding
listeners **that the instance holds** — all of them, not the latest
generation's; and per
[PIC-57](../spec_topics/pi-integration-contract/session-shutdown-semantics.md#pic-57)
no watcher-driven rebuild may survive teardown into the invalidated runtime.
A repeat `session_start` is a contemplated re-registration pass
(step 3's supersession language): it must supersede the prior generation's
live resources, not strand them.

## Actual behaviour / root cause

Single-slot overwrite. `runComposeInstanceRegistration` completes by
publishing `wiring.registry/clock/activeInvocations/forwardingSignals` into
the four factory-scoped mutables (:540–549) and assigning
`hotReloadHandle = wiring.installHotReload(…)` (:561). Nothing at either site
detaches, drains, or otherwise supersedes the values being replaced, so the
first generation's handle becomes unreachable the moment the second compose
completes. The `session_shutdown` handler reads the slots lazily (:596 ff.)
— by design, because the subscription is installed before compose runs
(Factory-ordering pin) — so it can only ever tear down the one generation the
slots name at teardown time.

The bug-0018 guard — at ea5de328 the bug-0022 fix's compose-settle
`composeOutlivedSession` gate (:499, :523–536), which subsumed the original
arming-only check — compares `shutdownEventsObserved` before and after the
compose flight; a second `session_start` increments nothing, so
both composes arm. In the overlap variant the slot additionally ends on the
**last completer**, which may be the older start — the teardown then detaches
the older generation and leaks the newer one.

The post-0018 stale probe does not contain the damage while the session
lives: both generations close over the same `ExtensionRunner` runtime, whose
`assertActive()` state is per-runner (`dist/core/extensions/runner.js`
`createContext`), not per-generation. The superseded generation's `ctx.cwd`
probe therefore passes and its reloads publish — scratch-verified above.
After a genuine shutdown + invalidation, the leaked watcher's next event does
trip the probe and quiesces it (one misattributed
`theta hot-reload quiesced:` stderr line naming bug 0018's bare-dispose
path); until such an event fires, the chokidar handles and debouncer remain
held for the process lifetime.

## Why it matters

- **Resource leak per extra start.** One real chokidar watcher over the
  discovery-root union + settings paths, plus one `ReloadDebouncer` (live
  timer source), per superseded generation — undetachable by any teardown
  path; post-invalidation cleanup happens only if the filesystem happens to
  emit another event under the watched roots.
- **Superseded-registry rebuilds (demonstrated).** While the session lives,
  a superseded generation's watcher event re-runs discovery/compose and
  re-registers the live slash commands against the superseded registry. From
  then on, dispatch for the affected names reads generation-1 state: edits
  hot-reloaded by the current generation update the current registry only and
  are silently ignored at dispatch — the same
  hot-reload-divergence symptom class as bug 0018, on a live runtime, with no
  stderr evidence at all.
- **Teardown tears down only the latest generation.** One shutdown drains
  one registry and its drain gate only — scratch-verified: the superseded
  generation's registry stays undrained and a post-shutdown dispatch of a
  superseded-generation-bound name **runs** instead of returning the
  shutting-down note, bypassing the sub-step-1 fail-safe. By the same slot
  reads (`factory.ts:622/:665`), sub-steps 2/3/5 operate on the latest
  generation's `ActiveInvocationRegistry` and forwarding-signal list, so a
  superseded generation's in-flight invocations are neither reason-stamped
  nor aborted and its forwarding listeners are never detached.

## Fix options and recommendation

1. **Supersede-before-publish (recommended).** At the compose-completion
   publish site, treat the slot contents as a superseded generation before
   overwriting: `hotReloadHandle?.detach()` (closes the watcher and cancels /
   marks-torn-down the debouncer — the existing step-4 adapter semantics),
   and drain the outgoing `liveRegistry` so any name that stays bound to it
   fails safe at dispatch. Fold the outgoing `liveActiveInvocations` /
   `liveForwardingSignals` into a factory-scoped supersession list the
   `session_shutdown` handler also drains, so one shutdown still cancels
   in-flight invocations started under any generation. Pair with a
   generation counter mirroring `shutdownsAtComposeStart`: a compose that
   observes a newer compose started during its flight publishes and arms
   nothing (it is already superseded) — this closes the overlap variant's
   last-completer-wins inversion with the same capture-compare shape the
   PIC-67 guard already uses.
2. **Per-generation teardown list only.** Keep arming per start but append
   every generation's handle + wiring to a list the shutdown handler tears
   down in full. Fixes the leak and the teardown reach, and is the smallest
   structural change — but leaves N watchers concurrently publishing between
   the starts, so the superseded-registry dispatch divergence persists until
   shutdown. Insufficient alone.
3. **Idempotence/assert.** Ignore a repeat `session_start` (first compose
   wins) and emit one diagnostic. Cheapest, but contradicts the step-3
   supersession-pass expectation and the host's `bindExtensions` semantics
   (a re-bind re-delivers `session_start` precisely so registration state can
   be re-established), and silently pins stale discovery results for the rest
   of the session. Rejected as primary; the diagnostic (one note naming the
   repeat start) is worth adding to whichever option lands.

Option 1 restores the single-armed-watcher invariant on every path a repeat
start can take, keeps teardown-reach complete via the supersession list, and
reuses existing machinery (`detach()`, drain, capture-compare guard) without
new host surfaces.

## Provenance

- Origin: residual recorded by the bug-0018 fix reviewers (fix commit
  28ce714d, reviewers R1–R3): "double-arm/leak hazard on two rapid
  session_starts (single-slot handle, pre-existing)".
- Implementation evidence: `src/extension/factory.ts` (:253, :262–273, :287,
  :499, :523–536, :540–549, :561, :591, :596, :638),
  `src/extension/production-composition.ts` (:312, :955–1012, :1137–1176),
  `src/extension/hot-reload.ts` (`installHotReload`, `detach`,
  `quiesceOnStaleCtx`), all at ea5de328 (the factory.ts citations re-resolved
  after the bug-0022 fix; production-composition.ts and hot-reload.ts are
  byte-identical between 28ce714d and ea5de328).
- Host evidence at the `~0.80.10` pin:
  `dist/core/agent-session-runtime.js` (`teardownCurrent` — every replacement
  path emits `session_shutdown` then disposes; `createRuntime` builds fresh
  services), `dist/main.js:487` (`createRuntime` → fresh
  `DefaultResourceLoader.reload()` → factories re-invoked per replacement),
  `dist/core/extensions/loader.js` (`loadExtension` re-invokes the factory on
  a fresh `Extension` per load; the cache holds the module, not the
  instance), `dist/core/agent-session.js:1744/:1764` (`bindExtensions`
  unguarded; emits `_sessionStartEvent` per call), `:2052/:2068`
  (`reload()` — shutdown to the old runner, fresh extensions, start to the
  new), `dist/core/extensions/runner.js` (`emit` — no dedup; `createContext`
  guards on per-runner staleness state), `docs/extensions.md` (session
  lifecycle: "pi emits `session_shutdown` for the old extension instance,
  reloads and rebinds extensions for the new session, then emits
  `session_start`").
- Spec: [registration-steps.md step 5](../spec_topics/pi-integration-contract/registration-steps.md#watcher-hot-reload-registration),
  step 3 supersession-pass language,
  [session-shutdown-semantics.md](../spec_topics/pi-integration-contract/session-shutdown-semantics.md)
  sub-steps 1–5, Factory-ordering pin,
  [PIC-57](../spec_topics/pi-integration-contract/session-shutdown-semantics.md#pic-57),
  [PIC-67](../spec_topics/pi-integration-contract/session-shutdown-semantics.md#pic-67),
  [PIC-7](../spec_topics/pi-integration-contract/host-prerequisites.md#pic-7).
- Reproduction: scratch vitest per §Reproduction (three tests green at HEAD;
  scratch deleted after observation, per task).
