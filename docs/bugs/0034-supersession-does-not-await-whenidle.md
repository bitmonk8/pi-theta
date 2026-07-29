# Bug 0034 — The supersession pass never awaits `handle.whenIdle()`: a superseded-generation rebuild already in flight publishes into the drained registry and re-registers its slash names after the superseding generation has registered, so those names dispatch to a dead generation until `/reload`

- **Status:** open
- **Kind:** defect **plus spec gap** — one call site, one clause.
  - *Defect* — the supersession pass supersedes the outgoing generation with
    two synchronous acts (drain, `detach()`) and publishes immediately
    (`factory.ts:666–691`). Neither act stops a rebuild that has already
    entered `runReload`: the torn-down flag is read once at pass entry
    (`hot-reload.ts:184–186`) and `ReloadDebouncer.markTornDown()` clears the
    pending timer and the PIC-49 deferred re-arm but does not touch
    `#inFlight` (`reload-debounce.ts:135–139`). The in-flight pass therefore
    resumes and completes its `reRegister` (`hot-reload.ts:248`), its publish
    (`reload-wiring.ts:323`), and its structural-change note
    (`hot-reload.ts:268–271`) after the supersession.
    [registration-steps.md#repeat-start-supersession](../spec_topics/pi-integration-contract/registration-steps.md#repeat-start-supersession)
    pins the outcome as a MUST with no carve-out: the detach closes "that
    generation's watcher and quiescing its debouncer, **so no
    superseded-generation reload can rebuild or re-register after the
    supersession**". The fix is code-only.
  - *Spec gap* — the mechanism that clause names cannot deliver the outcome it
    states. `#repeat-start-supersession` prescribes exactly two acts (close the
    watcher, quiesce the debouncer), and
    [PIC-57](../spec_topics/pi-integration-contract/session-shutdown-semantics.md#pic-57)
    — the clause `#repeat-start-supersession` cross-references for the
    no-rebuild posture — states that those acts govern only *new* rebuilds and
    that an "already-in-flight rebuild … MUST be awaited", scoping that await
    to the `session_shutdown` handler and to its sub-step 4 (b) bounded
    `debouncer.whenIdle(...)` mechanism against the shared
    `SHUTDOWN_AWAIT_CAP_MS` deadline. No spec text prescribes an await, a
    bound, or a failure outcome on the supersession path, and no deadline
    exists there to reuse. Per
    [docs/bugs/README.md](./README.md), spec and implementation together fail
    to deliver documented behaviour.
- **Affected** (citations at HEAD `4d645f4f`, 0.32.0; every cited `src/` file
  is byte-identical to the bug-0021 fix commit `7fa76517`, 0.30.0 — the
  0.31.0/0.32.0 fixes touched none of them):
  - The supersession pass, `src/extension/factory.ts:666–691`: `drain()`
    (:666), handle read and slot clear (:667–668), isolated `detach()`
    (:669–679), then the live-resource publish (:681–690) and generation 2's
    `registerFixtures` (:691). No `whenIdle()` call and no `await` anywhere in
    it. The whole tail from the staleness check (:637–639) to the handler's
    return (:711) is await-free, which the site comment records as
    load-bearing: "the tail is await-free after it … so no shutdown and no
    newer start can interleave past the check" (:618–620). Because it is
    await-free, generation 2's `pi.registerCommand` pass (:691) always
    completes before the superseded generation's in-flight rebuild can resume.
  - `HotReloadHandle`, `src/extension/hot-reload.ts:297–317`: `detach()`
    (:298–307) performs `unsub()`, `debouncer.cancel()`, `tornDown = true`,
    `debouncer.markTornDown()`. `whenIdle()` (:313–316) exists and is wired.
    Two quiescing sites never call it: the supersession pass and
    `quiesceOnStaleCtx` (:169–178), the PIC-67 stale path — and on the latter
    the runtime is already invalidated, so no await could settle against a
    live `ctx`. The supersession pass is the only one that runs against a live
    runtime. `runReload`'s `tornDown` short-circuit (:184–186) is an entry
    guard: a pass past it runs to completion, including `deps.reRegister(staged)`
    (:248) inside the staged build and the structural-change note (:268–271).
  - `ReloadDebouncer`, `src/extension/reload-debounce.ts`: `markTornDown()`
    (:135–139) sets `#tornDown`, cancels the pending timer, and drops the
    deferred re-arm — `#inFlight` (:77) is untouched, as its own docstring
    states ("An already-in-flight rebuild is NOT interrupted — `whenIdle()`
    lets it quiesce", :132–133). `whenIdle()` (:147–154) resolves immediately
    when nothing is in flight and otherwise parks a waiter released by
    `#onRebuildSettled` (:216–223).
  - The re-registration bridge, `src/extension/factory.ts:702–705`: the
    superseded generation's handle was armed with
    `(thetas) => registerFixtures(thetas, wiring!.registry)` closing over
    **that** generation's wiring, so its `reRegister` re-binds every surviving
    slash name to the generation-1 registry the supersession drained
    (`drainGatedHandler`, `factory.ts:483–493`) — arm (b) of the
    [`ThetaRegistry` drain-state contract](../spec_topics/pi-integration-contract/drain-state-contract.md#theta-registry-drain-state-contract),
    the `"theta /<name>: extension shutting down"` note.
  - Pi's registration is last-writer within one extension instance:
    `registerCommand` is `extension.commands.set(name, {…})`
    (`node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js:198–205`)
    and the `:N` invocation-name suffix applies only when a name occurs in more
    than one extension (`dist/core/extensions/runner.js:371–398`), so the
    leaked pass's later registration replaces generation 2's for every name it
    re-registers. Pi exposes no `pi.unregisterCommand`
    ([registration-steps.md, *Structural changes*](../spec_topics/pi-integration-contract/registration-steps.md#structural-changes-no-unregister)).
  - The contrast surface: the `session_shutdown` teardown does await.
    `src/extension/session-shutdown.ts:480–505` runs sub-step 4 (a)
    `markTornDown()` (:495) then (b) the bounded quiesce (:496–498), and
    `quiesceDebouncer` (:655–671) races `debouncer.whenIdle()` against the
    shared deadline (:667). The factory supplies both members through the same
    handle the supersession pass holds (`factory.ts:823–832`;
    `whenIdle: (): Promise<void> => handle.whenIdle?.() ?? Promise.resolve()`
    at :829–830),
    so the capability is present on the supersession path and unused.
  - The cross-generation collision path: the superseded generation's
    `rediscover` closure carries **its own** registry key set as
    `excludeOwnedNames` (`src/extension/production-composition.ts:1144–1156`,
    exclusion `new Set(registry.snapshot().keys())` at :1153). A pass suspended
    at or before `await loadSettings(fileSystem)` (:401) reads
    `pi.getCommands()` (:408) after generation 2 registered, so generation 2's
    live `source: "extension"` entries fall outside that set
    (`readPiOwnedCommands` filter, :1972–1993, exclusion test :1981) and
    `resolveSlashNames` drops the leaked pass's own candidate with an
    error-severity `theta/load/cross-format-collision`
    (`src/discovery/discovery-walk.ts:922–931`, message :926–928). A pass
    suspended after :408 carries the pre-supersession snapshot and emits no
    collision. Both interleavings are reachable.
- **Observed at:** `0.32.0` (`4d645f4f`). Offline, deterministic — a scratch
  vitest over the real `installHotReload` wiring with the injected
  `FileWatcher` / `Clock` seams (deleted after observation), plus a direct read
  of the `factory.ts` / `session-shutdown.ts` ordering and of the installed
  `@earendil-works/pi-coding-agent@0.80.10` `registerCommand` body. No live
  run.
- **Sequenced after:** [bug 0029](./0029-throwing-supersession-detach-swallowed-watcher-rearmed.md).
  The two fixes edit the same block (`factory.ts:666–679`) and the same
  `detach()` body, and they close complementary halves of one clause: 0029
  covers the rebuild that has **not yet started** (a pending debounce window
  surviving a throwing detach), this report the rebuild **already in flight**.
  0029 is itself sequenced after
  [bug 0023](./0023-production-composition-omits-bootstrap-seams.md).

## Summary

`session_shutdown` sub-step 4 quiesces the hot-reload debouncer in two acts:
mark torn-down so no new rebuild starts, then bounded-await
`debouncer.whenIdle()` so a rebuild already running settles against the
still-live `ctx`. The supersession pass performs only the first act, inside
`detach()`, and never the second.

An in-flight rebuild is therefore unaffected by the supersession. It resumes
after the superseding pass has published its live resources and registered its
own slash names, and then:

1. **Re-registers its own name set with Pi**, binding each name to the
   superseded generation's drained registry. Its registration lands last, so it
   replaces generation 2's binding for every name it carries. Dispatch of those
   names answers `theta /<name>: extension shutting down` on a live session
   until the operator runs `/reload`.
2. **Publishes into the drained registry**, a snapshot no dispatch reads and no
   teardown or supersession will visit again.
3. **Delivers the superseded generation's notes** on the live
   `theta-system-note` channel — the structural-change `/reload` prompt, its
   re-emitted load diagnostics, and, when its `pi.getCommands()` read lands
   after generation 2's registration pass, a
   `theta/load/cross-format-collision` naming the live generation's own command
   as the foreign survivor.

The trigger is overlap, not an error path. The superseding `session_start`
handler awaits a full compose pass (`factory.ts:628`) before it supersedes
anything, and a watcher-driven rebuild runs the same `runComposePass`
(`production-composition.ts:1107` for the compose, `:1146` for the rebuild), so
any rebuild whose debounce window closes during generation 2's compose is in
flight at the supersession instant. No throw is required anywhere.

## Non-goals

The rebuild that has not yet started at supersession time — a pending debounce
window — is bug 0029's subject, closed there by ordering `detach()`'s
containment marks ahead of its fallible unsub. That ordering has no effect on a
pass already past `runReload`'s entry guard, which is this report's subject.

## Reproduction

Offline, deterministic — scratch vitest (deleted after use) over the real
`installHotReload` wiring, modelled on
`tests/hot-reload-stale-quiesce-arms.test.ts`: `FakeClock`, `FakeFileWatcher`,
a real `ThetaRegistry` seeded with one entry (`greet`), a recording
`theta-system-note` channel, a `reRegister` recorder, and a `rediscover` that
parks on a deferred promise and then resolves to `[greet, third]`. Sequence:

1. `watcher.emit({ kind: "change", … })`, then
   `clock.advance(RELOAD_DEBOUNCE_WINDOW_MS)` — the window closes and the
   rebuild starts, parking inside `rediscover`.
2. Model the supersession act at its strongest: `registry.drain()`,
   `handle.markTornDown()`, `handle.detach()`. Calling `markTornDown()` before
   `detach()` is a strict superset of both the current step order
   (`hot-reload.ts:303–306`) and bug 0029's containment-first order, so the
   observation below is independent of that fix.
3. Release the parked `rediscover`; flush.

Observed at HEAD:

- **A rebuild is in flight at the supersession instant.** `whenIdle()` called
  at step 2 has not resolved; it resolves only after the pass settles in
  step 3.
- **Immediately after `detach()`**: registry drain state `{ drained: true }`,
  `reRegister` never called, the registry without `third`.
- **After the pass resumes**: `reRegister` called once with
  `["greet", "third"]`; the drained registry's keys are `["greet", "third"]`;
  the channel carries the structural-change note

  ```
  theta watcher: 1 file(s) added or removed; run /reload to refresh the slash command list
  ```
- **Control — a rebuild that has not yet started.** Same harness, but the
  watcher event is emitted with the window still open at supersession time and
  the clock advanced only afterwards: `reRegister` is never called, the
  registry never gains `third`, and no note is sent. This is the boundary
  between bug 0029 and this report — the containment marks close the control
  case and leave the in-flight case untouched.

**Ordering (read, no test).** `factory.ts:637–711` contains no `await`, so the
superseding pass runs `drain()` (:666), `detach()` (:670), the live-resource
publish (:681–690), and `registerFixtures` (:691) in one synchronous
run-to-completion. A suspended rebuild's continuation cannot run during that
run-to-completion, so its `pi.registerCommand` calls always follow generation
2's.

**Last-writer (read, no test).** `dist/core/extensions/loader.js:198–205` in the
installed `@earendil-works/pi-coding-agent@0.80.10` stores commands in a
per-extension `Map` keyed by name; `dist/core/extensions/runner.js:371–398`
suffixes an invocation name only when the name occurs in more than one
extension. A second `registerCommand` for the same name from the same extension
instance replaces the first.

## Expected behaviour

- [registration-steps.md#repeat-start-supersession](../spec_topics/pi-integration-contract/registration-steps.md#repeat-start-supersession):
  a completing supersession pass MUST detach the prior generation's teardown
  handle before publishing its own live resources, "closing that generation's
  watcher and quiescing its debouncer, so no superseded-generation reload can
  rebuild or re-register after the supersession (the same
  no-rebuild-after-teardown posture
  [PIC-57](../spec_topics/pi-integration-contract/session-shutdown-semantics.md#pic-57)
  pins for shutdown)". The clause states an unqualified outcome over the
  superseded generation's reloads; an in-flight rebuild rebuilds and
  re-registers after the supersession.
- [PIC-57](../spec_topics/pi-integration-contract/session-shutdown-semantics.md#pic-57)
  splits the same posture into the two obligations the clause above compresses
  into one: the torn-down flag "suppresses any fresh rebuild and clears any
  rebuild deferred under the
  [PIC-49](../spec_topics/pi-integration-contract/registration-steps.md#pic-49)
  cross-window serialization rule", while "any *already-in-flight* rebuild — one
  that entered its asynchronous re-parse / AJV-recompile / `pi.registerTool`
  steps before teardown — MUST be awaited … so that it either completes its
  single synchronous publish per
  [PIC-36](../spec_topics/pi-integration-contract/registration-steps.md#pic-36)
  or is a no-op". PIC-57 scopes that await to the `session_shutdown` handler
  and to sub-step 4 (b)'s bounded `debouncer.whenIdle(...)` against the shared
  `SHUTDOWN_AWAIT_CAP_MS` deadline. The supersession pass has neither the
  prescribed await nor a deadline to bound it with, so the outcome
  `#repeat-start-supersession` pins is undeliverable by the mechanism that
  clause names.
- [PIC-68](../spec_topics/pi-integration-contract/session-shutdown-semantics.md#pic-68)
  makes the teardown's sub-steps 1 and 4 latest-generation-only "because each
  superseded generation's registry was already drained and its watcher already
  detached at supersession time". A superseded generation whose rebuild
  publishes after that point leaves a populated registry snapshot and a
  re-registered name set that no later teardown revisits.
- The registry the leaked pass re-binds its names to is drained, so their
  dispatch takes arm (b) of the
  [`ThetaRegistry` drain-state contract](../spec_topics/pi-integration-contract/drain-state-contract.md#theta-registry-drain-state-contract)
  and answers `"theta /<name>: extension shutting down"` — the fail-safe the
  supersession drain is specified to produce for handlers *left behind* by a
  supersession, applied here to names the live generation had already
  reclaimed.

## Actual behaviour / root cause

The supersession pass models quiescence with one act where the teardown uses
two.

`detach()` (`hot-reload.ts:298–307`) sets the closure `tornDown` flag and calls
`ReloadDebouncer.markTornDown()`, which sets `#tornDown`, cancels the pending
timer, and drops the deferred re-arm (`reload-debounce.ts:135–139`). Every one
of those acts governs a rebuild that has not started. The single guard a
running pass consults is `runReload`'s entry check (`hot-reload.ts:184–186`),
already passed. `#inFlight` is not cleared, the running promise is not
cancelled, and `whenIdle()` — the member that exists precisely to observe that
promise (`hot-reload.ts:313–316`, `reload-debounce.ts:147–154`) — is never
called by the supersession pass.

The resumed pass then executes its remaining steps against the live host:

- `deps.reRegister(staged)` (`hot-reload.ts:248`) → `factory.ts:702–705` →
  `registerFixtures(thetas, wiring.registry)` for the **superseded** wiring, so
  each name is re-registered with a `drainGatedHandler` bound to the drained
  generation-1 registry. Pi's per-extension name map makes this the last write
  (`loader.js:198–205`), and there is no `pi.unregisterCommand` to undo it. The
  live generation keeps the name in its own registry and never re-registers it,
  so the binding persists until the operator runs `/reload`.
- `rebuildAndSwap` publishes the staged map into the drained registry
  (`reload-wiring.ts:323`).
- The structural-change note is delivered on the live channel
  (`hot-reload.ts:268–271`), and any load diagnostics the re-compose produced
  were already routed onto the same channel by the pass's own ERR-7 sink.

The `theta/load/cross-format-collision` arm is reached when the leaked pass's
`pi.getCommands()` read (`production-composition.ts:408`) lands after
generation 2's registration pass. Its `excludeOwnedNames` set is the superseded
registry's key set (`:1153`), so generation 2's freshly-registered
`source: "extension"` entries are outside it, survive the `readPiOwnedCommands`
filter (`:1981`), and cause `resolveSlashNames` to drop the leaked pass's own
candidate for that name and emit `slash name '<name>' collides at the same
priority: … (Pi-owned command '<name>' survives)`
(`discovery-walk.ts:922–931`). This is bug 0024's mechanism — an own
registration read as foreign — reached across generations: the reading pass and
the registering pass belong to different generations of one extension instance.

Nothing in the sequence depends on an error. The `composeTailSuperseded()`
check (`factory.ts:623–625`) is touch-free evidence about *compose* passes and
says nothing about a rebuild; PIC-67's entry probe passes because the runtime
is live; the drain makes dispatch fail safe but does not prevent publication or
registration.

## Why it matters

- **A pinned MUST is violated with no error anywhere in the path.** Bug 0029's
  violation of the same clause needs a throw out of `detach()`; this one needs
  only a watcher event whose debounce window closes while the superseding
  compose runs. Both passes call the same `runComposePass`, so the window in
  which a rebuild is in flight is the duration of a full discovery + parse +
  AJV pass.
- **The live command surface ends up owned by a dead generation.** Because the
  leaked pass registers last and Pi has no unregister, every name it carries
  dispatches to the shutting-down note on a live session. The operator's
  observable is a working session whose theta commands answer "extension
  shutting down"; the recovery is `/reload`, which the structural-change note
  the same pass emitted happens to prompt for a different reason.
- **The notes misdescribe the state they report.** The collision note names the
  live generation's own command as a foreign Pi-owned survivor, and the
  structural-change note reports a set difference computed against the
  superseded generation's baseline (`currentNames`, `hot-reload.ts:266–267`).
- **The teardown cannot compensate.** PIC-68 makes sub-steps 1 and 4
  latest-only on the premise that superseded generations were already drained
  and detached. Both were, before the leaked pass ran; the pass's publish and
  registrations land after, and no teardown visits that generation's registry
  again.
- **The capability to fix it is already wired and unused.** `whenIdle()` is
  implemented, exposed on `HotReloadHandle`, and consumed by the teardown
  adapter (`factory.ts:829–830`). The supersession pass holds the same handle.

## Fix

One code change and one spec amendment, landed together, after
[bug 0029](./0029-throwing-supersession-detach-swallowed-watcher-rearmed.md)
(same block, same `detach()` body; 0029 closes the not-yet-started half of the
clause).

**This is a contract change.** Awaiting a superseded generation's rebuild puts
prior-generation work on the host's `session_start` dispatch path. The handler
already awaits its own compose (`factory.ts:628`, whose returned promise the
host runner awaits — `factory.ts:398–404`), but never another generation's
work, and it currently completes its supersession-and-publish tail
synchronously. After the change a repeat `session_start` is bounded-blocking on
a rebuild it did not start, and needs its own deadline: the teardown's shared
`deadline = Clock.now() + SHUTDOWN_AWAIT_CAP_MS` (`capability-probe.ts:74`,
2000 ms) is captured at `session_shutdown` handler entry and does not exist on
this path. No spec text prescribes the await, so the change carries a spec
amendment rather than resting on an existing MUST.

**1. Bounded quiesce before the supersession's mutating steps.** Restructure
`factory.ts:660–691` so the outgoing handle is read, marked torn-down, and
awaited before anything is mutated or published:

1. read `hotReloadHandle` into a local (no mutation);
2. `outgoingHandle?.markTornDown()`, guarded by the catch-and-emit arm bug 0029
   installs at this site — this is the await's termination precondition: with
   the timer cleared and the PIC-49 deferred re-arm dropped, at most the one
   in-flight rebuild remains, and `#onRebuildSettled` cannot start another
   (`reload-debounce.ts:224–228`);
3. `await` a race between `outgoingHandle?.whenIdle?.() ?? Promise.resolve()`
   (`whenIdle` is optional on `HotReloadHandle`, `hot-reload.ts:111–115`, so a
   `detach()`-only handle degrades to an immediate resolve) and a cap timer on
   `liveClock` — the outgoing generation's `Clock`, which `factory.ts:682`
   overwrites only after this block — mirroring `quiesceDebouncer`
   (`session-shutdown.ts:655–671`). Cap expiry proceeds without a new
   diagnostic code, matching PIC-57's rule that a rebuild still in flight at
   the deadline "is abandoned safely under the torn-down flag and emits **no**
   new diagnostic code";
4. re-evaluate `composeTailSuperseded()` and take the zero-touch return when it
   now holds;
5. fold, `liveRegistry?.drain()`, clear the handle slot, `detach()` under bug
   0029's isolation and containment-first order, then publish and register.

Step 4 is required, not defensive: the site comment at `factory.ts:618–620`
records that the tail is await-free "so no shutdown and no newer start can
interleave past the check", and step 3 introduces exactly such an interleave
point. Update that comment to state the new invariant — one re-check after the
only await, with every mutating supersession step still inside one
run-to-completion after it. Step 2 is the sole act that survives a zero-touch
return; marking a generation torn-down that a newer pass is about to supersede
anyway is the posture PIC-57 already pins for it.

Placing the await before generation 2's `registerFixtures` (`:691`) is what
removes the harm: the settling pass re-registers against a still-undrained
generation-1 registry, and generation 2's registration then lands last and owns
every surviving name. The cross-generation
`theta/load/cross-format-collision` window closes for the same reason — the
leaked pass's `pi.getCommands()` read (`production-composition.ts:408`)
completes before generation 2 registers. **Residual:** a rebuild still running
at the cap is abandoned, resumes after the publish, and reproduces the current
behaviour unevidenced. The cap value bounds how much of the defect survives the
fix; the abandonment itself is the same posture the teardown takes at its own
deadline.

**2. Spec amendment.** Add to
[registration-steps.md#repeat-start-supersession](../spec_topics/pi-integration-contract/registration-steps.md#repeat-start-supersession)
a normative sentence pinning the second obligation the clause's stated outcome
requires: the supersession pass MUST, before publishing its own live resources,
mark the outgoing generation's debouncer torn-down and then bounded-await any
already-in-flight superseded-generation rebuild — the same two acts PIC-57
pins for `session_shutdown` sub-step 4, against a cap owned by the supersession
path rather than the teardown deadline. Contract the existence of the bound,
not its value, on the same footing as the 250 ms debounce window
(`registration-steps.md:22`: "The specific `250 ms` figure is an implementer
tuning choice, not part of theta's observable contract"). Pin cap expiry as
safe abandonment under the torn-down flag with no new diagnostic code, so the
[DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2) registry is
unchanged. Add a cross-reference from PIC-57 recording that its
in-flight-rebuild await now has two prescribed sites. Record in
`#repeat-start-supersession` that a repeat `session_start` delivery is
bounded-blocking on the superseded generation's rebuild.

**Regression coverage.** A unit test suffices and reds at HEAD. (1) Over the
`installHotReload` harness of §Reproduction: with a rebuild parked in
`rediscover`, the supersession acts must not let it re-register or publish —
post-fix the caller's await means `reRegister` has already run and settled
before the supersession's drain, so the drained registry never gains a
post-drain entry and no `reRegister` follows the drain. (2) Over the factory
harness of `tests/double-session-start-supersession.test.ts`: with a
generation-1 rebuild in flight across the supersession boundary, the last
`pi.registerCommand` for each surviving name is generation 2's, and dispatch of
that name runs the theta rather than answering the arm-(b) shutting-down note.
Keep the §Reproduction control (a not-yet-started window) green as the
discriminator against bug 0029's fix. Re-run
`tests/reload-teardown-quiesce.test.ts` and
`tests/live/double-session-start-live.test.ts` unchanged: the first pins
sub-step 4's mark-then-await ordering the new site mirrors, the second is the
live non-regression check on the supersession path.

## Provenance

- Origin: bug 0029 triage, decision D3 — the in-flight-rebuild gap the 0029
  report declared out of scope ("the supersession pass, unlike the teardown,
  never awaits `handle.whenIdle()`"), filed separately because closing it
  changes the `session_start` contract rather than the detach step order. See
  [bug 0029](./0029-throwing-supersession-detach-swallowed-watcher-rearmed.md)
  §Fix, "Out of scope".
- Implementation evidence: `src/extension/factory.ts` (:398–404 the awaited
  handler return; :483–493 `drainGatedHandler`; :618–625 the await-free-tail
  comment and the staleness predicate; :628 the compose await; :660–691 the
  supersession pass; :702–705 the re-registration bridge; :809–832 the
  teardown adapters),
  `src/extension/hot-reload.ts` (:180–186 the entry guard; :248 `reRegister`;
  :266–271 the structural note; :297–317 the handle),
  `src/extension/reload-debounce.ts` (:77 `#inFlight`; :120–125 `cancel`;
  :127–139 `markTornDown`; :147–154 `whenIdle`; :183–190 `#startRebuild`;
  :216–232 `#onRebuildSettled`), `src/extension/reload-wiring.ts` (:172–175
  `publish`; :304–325 `rebuildAndSwap`),
  `src/extension/session-shutdown.ts` (:480–505 sub-step 4; :655–671
  `quiesceDebouncer`), `src/extension/capability-probe.ts` (:74
  `SHUTDOWN_AWAIT_CAP_MS`), `src/extension/production-composition.ts` (:401,
  :408 the settings await and the `pi.getCommands()` read; :1144–1156 the
  `rediscover` closure; :1972–1993 `readPiOwnedCommands`),
  `src/discovery/discovery-walk.ts` (:903 `resolveSlashNames`; :922–931 the
  theta-vs-Pi-owned drop arm), all at `4d645f4f` and byte-identical to
  `7fa76517`.
- Host evidence: `@earendil-works/pi-coding-agent@0.80.10`
  (`dist/core/extensions/loader.js:198–205`,
  `dist/core/extensions/runner.js:371–398`) at the
  [theta 1.0 Pi-SDK pin](../spec_topics/pi-integration-contract/host-prerequisites.md#pi-sdk-pin).
- Spec:
  [registration-steps.md#repeat-start-supersession](../spec_topics/pi-integration-contract/registration-steps.md#repeat-start-supersession),
  [PIC-57](../spec_topics/pi-integration-contract/session-shutdown-semantics.md#pic-57)
  /
  [PIC-67](../spec_topics/pi-integration-contract/session-shutdown-semantics.md#pic-67)
  /
  [PIC-68](../spec_topics/pi-integration-contract/session-shutdown-semantics.md#pic-68),
  [PIC-49](../spec_topics/pi-integration-contract/registration-steps.md#pic-49)
  /
  [PIC-36](../spec_topics/pi-integration-contract/registration-steps.md#pic-36),
  [*Structural changes*](../spec_topics/pi-integration-contract/registration-steps.md#structural-changes-no-unregister),
  [`ThetaRegistry` drain-state contract](../spec_topics/pi-integration-contract/drain-state-contract.md#theta-registry-drain-state-contract),
  [DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2).
- Relationship to
  [bug 0029](./0029-throwing-supersession-detach-swallowed-watcher-rearmed.md):
  complementary halves of one clause, disjoint triggers. 0029's leaked pass is
  a debounce window that had not yet opened its rebuild and survives because a
  throwing `detach()` skipped the containment marks; this report's leaked pass
  is past those marks by construction and survives any step order. 0029's fix
  does not narrow this one; this fix does not remove 0029's throw or its
  silence.
- Relationship to
  [bug 0024](./0024-rebind-self-collision-drops-surviving-names.md):
  amplification, not duplication. 0024 is `excludeOwnedNames = undefined` on
  the `session_start` compose path (`production-composition.ts:1114`) plus
  `resolveSlashNames`' drop arm; this report is a missing await in the
  supersession pass. The leaked rebuild carries the *superseded* generation's
  own-name set, so it reads generation 2's live registrations as foreign and
  trips 0024's mechanism cross-generation, emitting
  `theta/load/cross-format-collision` against a command the same extension
  instance registered moments earlier. Fixing 0024 leaves that emission in
  place, because the two generations' own-name sets differ; fixing this report
  removes the leaked pass that produces it.
- Family: joins the supersession-lifecycle reports
  [0021](./0021-double-session-start-leaks-armed-watcher.md) (fixed, 0.30.0 —
  the fix this report finds incomplete),
  [0022](./0022-late-compose-tail-registration-on-invalidated-runtime.md)
  (fixed, 0.29.0), 0024 and 0029.
- Reproduction: scratch vitest per §Reproduction, green at `4d645f4f`
  (asserting current behaviour, capturing the observations verbatim); scratch
  deleted after observation.
