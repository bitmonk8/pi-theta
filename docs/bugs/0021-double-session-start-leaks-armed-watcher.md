# Bug 0021 — A second `session_start` at one extension instance overwrites the single-slot hot-reload handle: the superseded generation's watcher stays armed (leaked) and keeps publishing, and `session_shutdown` tears down only the latest generation

- **Status:** open
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
- **Affected:** `src/extension/factory.ts` at HEAD (28ce714d) —
  `hotReloadHandle` single slot (:253, overwritten at :537 with no detach of
  the prior handle); the four live-teardown slots `liveRegistry` /
  `liveClock` / `liveActiveInvocations` / `liveForwardingSignals`
  (:262–273, overwritten at :507–516), which the `session_shutdown` handler
  reads lazily (:570 ff.) so one teardown reaches only the latest generation;
  the PIC-67 arm guard (:497/:533) which counts only `session_shutdown`
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

The PIC-67 `shutdownEventsObserved` guard added by the bug-0018 fix closes
only the arm-after-teardown race (a `session_shutdown` consumed while a
compose is in flight). It counts shutdowns, not compose generations, so it
passes for both composes here and both watchers arm.

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
the four factory-scoped mutables (:507–516) and assigning
`hotReloadHandle = wiring.installHotReload(…)` (:537). Nothing at either site
detaches, drains, or otherwise supersedes the values being replaced, so the
first generation's handle becomes unreachable the moment the second compose
completes. The `session_shutdown` handler reads the slots lazily (:570 ff.)
— by design, because the subscription is installed before compose runs
(Factory-ordering pin) — so it can only ever tear down the one generation the
slots name at teardown time.

The bug-0018 guard (:497/:533) compares `shutdownEventsObserved` before and
after the compose flight; a second `session_start` increments nothing, so
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
  reads (`factory.ts:596/:639`), sub-steps 2/3/5 operate on the latest
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
- Implementation evidence: `src/extension/factory.ts` (:253, :262–273, :285,
  :497, :507–516, :533, :537, :565, :570, :612),
  `src/extension/production-composition.ts` (:312, :955–1012, :1137–1176),
  `src/extension/hot-reload.ts` (`installHotReload`, `detach`,
  `quiesceOnStaleCtx`), all at HEAD 28ce714d.
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
