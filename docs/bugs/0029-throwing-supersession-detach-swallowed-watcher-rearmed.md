# Bug 0029 — A throwing supersession detach is swallowed with zero evidence, and `detach()`'s fallible-first step order skips every containment mark: a debounce window pending at supersession still drives one superseded-generation reload pass that publishes and re-registers, and the leaked handle is unreachable

- **Status:** fixed (0.40.0). §Fix as settled — containment-first `detach()`
  ordering for both callers, evidence at the swallow under the new
  `theta/host/session-start-supersession-detach-failed` code, spec amendment.
  See §Fix (0.40.0) below.
- **Kind:** defect **plus spec gap** — two elements at one call site.
  - *Defect* — `HotReloadHandle.detach()` runs its one fallible step FIRST
    (`unsub()`), so a throw skips the three infallible containment steps
    behind it (`debouncer.cancel()`, `tornDown = true`,
    `debouncer.markTornDown()`).
    [registration-steps.md#repeat-start-supersession](../spec_topics/pi-integration-contract/registration-steps.md#repeat-start-supersession)
    pins the outcome as a MUST with no carve-out for a throwing detach: the
    supersession detach closes "that generation's watcher and quiescing its
    debouncer, **so no superseded-generation reload can rebuild or
    re-register after the supersession**". The skipped marks are exactly the
    two guards that clause rests on — `runReload`'s `tornDown` short-circuit
    (`hot-reload.ts:184–186`) and `ReloadDebouncer.#onWindowClosed`'s
    torn-down guard (`reload-debounce.ts:167–169`) — so a debounce window
    pending at supersession time still runs a full superseded-generation
    reload pass. The fix is code-only.
  - *Spec gap* — the factory swallows the throw with no diagnostic, no note,
    and no stderr. The spec's **Per-step isolation** evidence rule covers
    only the `session_shutdown` handler's sub-steps, and its
    `(details.step, details.call)` label set is closed
    ("an implementation MUST NOT introduce a `details.call` value outside
    this enumeration"). No spec text prescribes an outcome on supersession
    detach failure, and none prescribes a diagnostic, so the failure is
    unobservable by construction. Closing it requires a
    [DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2) registry
    addition.
  - The mitigation recorded at the site — "the outgoing registry is already
    drained, so the superseded generation fails safe at dispatch regardless"
    (`factory.ts:671–679`) — holds. It covers dispatch only: not the skipped
    containment marks, not the leaked pass's rebuild / re-register / note
    activity, and not the permanent unreachability of the leaked handle.
- **Affected** (citations at HEAD `4d645f4f`, 0.32.0; `factory.ts`,
  `hot-reload.ts`, `reload-debounce.ts`, `pi-file-watcher.ts` and
  `session-shutdown.ts` are byte-identical to the bug-0021 fix commit
  `7fa76517` — the 0.31.0/0.32.0 fixes touched none of them):
  - The supersession detach swallow, `src/extension/factory.ts:667–679`:
    the handle slot is cleared BEFORE `detach()` (:668, so no later path can
    double-detach — which also makes the handle unreachable forever once the
    detach throws), and the catch arm (:671, `catch (e: unknown)` — every
    throw type, with the `allow-broad-catch` exemption marker) is `void e`
    (:678): nothing constructed, nothing emitted, nothing rethrown.
  - `HotReloadHandle.detach()` step order,
    `src/extension/hot-reload.ts:298–307`: `unsub()` (:303) precedes
    `debouncer.cancel()` (:304), `tornDown = true` (:305), and
    `debouncer.markTornDown()` (:306). The same module's
    `quiesceOnStaleCtx` (:170–172) orders the identical acts
    containment-first (`tornDown` → `markTornDown` → `unsub`), so a throwing
    unsub there cannot resurrect a rebuild. `ReloadDebouncer.markTornDown`
    (`src/extension/reload-debounce.ts:135–139`) sets the torn-down flag,
    calls `cancel()`, and clears the PIC-49 deferred re-arm, so all three
    skipped acts are recoverable from one call.
  - The production unsubscribe, `src/seams/pi-file-watcher.ts:44–51`:
    `active = false` (:49) is set before `watcher.close()` (:50), so a
    synchronous `close()` throw makes every LATER unsub call no-op on the
    `active` guard (:48) and the failed close is never retried. At the
    installed `chokidar@4.0.3` (dependency range `^4.0.1`) the throw does
    **not** leave the watcher delivering: `close()` sets `this.closed = true`
    (`node_modules/chokidar/esm/index.js:393`) and runs
    `removeAllListeners()` (:395) before any statement that can throw — the
    `_closers` invocations (:397–401), `stream.destroy()` (:402),
    `dirent.dispose()` (:406) — and `_emit` returns early on `closed`
    (:445–447). No `add`/`change`/`unlink` reaches theta's handler after the
    throw, whatever the throw site. What leaks is the un-run `_closers` (the
    OS-level fs watch handles) plus the uncleared `_watched` / `_streams` /
    `_throttled` maps (:407–411): inert, and held for the remaining lifetime
    of the process. A watcher that keeps delivering after a throwing unsub
    requires an embedder-supplied `FileWatcher`
    ([PIC-14](../spec_topics/pi-integration-contract/host-interfaces-services.md#pic-14)
    is an injectable seam) — see §Actual behaviour / root cause.
  - The contrast surface: the `session_shutdown` teardown routes the
    IDENTICAL `handle?.detach()` call through per-step isolation
    (`src/extension/factory.ts:809–813` adapter;
    `src/extension/session-shutdown.ts:468` call site, `:530`
    `runIsolatedCall`, `:63` closed label set) — a throw emits one
    `theta/host/session-shutdown-teardown-step-failed` via `console.error`
    (label `discoveryWatcher.close`,
    `docs/spec_topics/diagnostics/code-registry-host.md` row) — and then
    marks the debouncer torn-down through the separate quiesce adapter
    (`factory.ts:826–827` → the handle's `markTornDown`, hot-reload.ts
    :308–312), which also sets the closure `tornDown` flag: on the teardown
    path a throwing unsub yields evidence AND containment; on the
    supersession path it yields neither.
- **Observed at:** `0.32.0` (`4d645f4f`). Mechanical — offline,
  deterministic scratch vitest over the shipped composition (deleted after
  observation), plus a direct read of the installed `chokidar@4.0.3`
  `close()` / `_emit` bodies; no live run.
- **Blocks on:**
  [bug 0023](./0023-production-composition-omits-bootstrap-seams.md) —
  discharged: 0023's fix (0.34.0) wired `deps.emitDiagnostic` to the
  bootstrap diagnostic sink in the shipped composition, so the emission this
  fix adds delivers in production.

## Fix (0.40.0)

The settled §Fix, implemented as written. Line anchors are at the fix commit.

**Containment-first `detach()`, both callers**
(`src/extension/hot-reload.ts:301–314`). The body is now
`tornDown = true; debouncer.markTornDown(); unsub();` — the containment
marks before the one fallible step, the order `quiesceOnStaleCtx` already
used for the identical acts, and `markTornDown()` subsumes the separate
`debouncer.cancel()` call. A throwing unsub now strands only the OS-level
watcher handles: any surviving event feeds a torn-down debouncer,
`runReload`'s `tornDown` short-circuit and `#onWindowClosed`'s guard both
hold, and no superseded-generation reload can start — the spec's no-rebuild
outcome survives the throw structurally. Both callers inherit the order (one
method body); no `supersede()` member was added; the teardown's separate
quiesce adapter is now a redundancy rather than the sole backstop.

**Evidence at the swallow** (`src/extension/factory.ts:755–774`). The
`void e;` swallow is replaced by exactly one emission of the new code
`theta/host/session-start-supersession-detach-failed` (W, runtime) through
`deps.emitDiagnostic` — wired in production since bug 0023's fix to the
bootstrap diagnostic sink, whose tier-2 full chain
(`sendSystemNote` → `ctx.ui.notify` → `console.error`) applies at the
live-session emission site. The diagnostic carries the registered template
`session_start supersession detach failed at <call>: <error>` and
`details: { call, error }` with the closed one-member call-label set
`"hotReloadHandle.detach"` and the underlying-error coercion
(`renderUnderlyingError`). The emission is defended by its own inner
`try`/`catch` per Diagnostic-emission isolation, so a throwing sink cannot
abort the superseding pass or escape into the host `session_start` dispatch;
the outer catch stays broad with its `allow-broad-catch` marker, and the
drained-registry dispatch mitigation recorded at the site still holds and is
still documented there.

**Spec amendment.** One new row in
`docs/spec_topics/diagnostics/code-registry-host.md` (a DIAG-2 addition under
the GOV-15 diagnostic-registry carve-out), mirroring the sibling
`session-shutdown-teardown-step-failed` row's conventions — closed
call-label set, underlying-error coercion, exactly-once — and stating the
routing exception: this code's observation site is a live session, so it
routes through the persistent-diagnostic channel's System-notes fallback
chain rather than the teardown siblings' direct `console.error`. One
normative sentence added to `registration-steps.md#repeat-start-supersession`
prescribing catch-and-emit: a throwing detach MUST be caught, MUST leave the
containment in place (torn-down marks before the one fallible watcher-close
step), and MUST emit exactly one diagnostic under the new code. Consequent
corrections in the same change: `diagnostic-shape.md`'s channel lead now says
*most* `theta/host/*` rows are `console.error`-routed and its closed
Location-less enumeration gains the new code;
`docs/reference/diagnostics.md` mirrors the row and qualifies its two
channel claims. The slug is appended to H9a's permitted-code list
(`tests/fixtures/h7a/permitted-codes.json`, now 11 entries), coordinating
with bug 0030 — whose stderr gate does not witness this bug (a silence
defect) and stays green: the code is emitted only on a detach throw, never
in an ordinary acceptance run.

**Reproduction re-derived at the fix baseline.** Bug 0024's fix (0.36.0)
invalidated the §Reproduction's recorded cross-format-collision evidence:
the factory-scoped own-registration ledger (PIC-69) spans generations, so
the leaked pass no longer emits `theta/load/cross-format-collision` against
the live generation's command. The leaked pass's observables at the fix
baseline — pinned red-first by the regression tests — are: the superseded
generation's drained registry gains the newly-planted name, the leaked pass
re-registers names (including the live generation's own) against the
drained registry, and the structural-change watcher note fires from a dead
generation. All of them vanish under the containment-first order.

**Offline lock.** `tests/supersession-detach-throw-containment.test.ts`
(4 tests, offline, real `createThetaExtension` + `composeExtensionInstance`
over a temp workspace, FakeClock, throwing seam unsub modelled on
`pi-file-watcher.ts`): (1) a throwing seam unsub at supersession with one
debounce window pending across the boundary fires NO superseded-generation
reload — no registry growth, no re-registration, no structural note;
(2) exactly one diagnostic under the new code with the pinned severity,
message, `details.call` and `details.error`, and the superseding pass
unaffected; (3) non-throwing control — the identical pending window fires
no reload pass and no diagnostic (discriminator liveness); (4) a THROWING
`emitDiagnostic` sink does not abort the superseding pass (the defended
emission). Verified in both directions: reverting the `detach()` order reds
(1) with the leaked-pass signature; reverting the swallow reds (2) with an
empty recorder; removing the inner defended catch reds (4). Live:
`tests/live/double-session-start-live.test.ts` (the bug-0021/0024 live
double-`bindExtensions` witness, real chokidar detach through the reordered
body) green unchanged, and H9a real-binary acceptance 11/11 green with
bug 0030's empty-capture stderr gate holding on all spawns.

**Residuals.** (i) A superseded-generation rebuild already IN FLIGHT at
supersession time still publishes and re-registers — the supersession pass
never awaits `handle.whenIdle()`; filed as bug
[0034](./0034-supersession-does-not-await-whenidle.md), unchanged here.
Discharged by its fix (0.46.0): the supersession pass now marks the outgoing
generation's debouncer torn-down and bounded-awaits its already-in-flight
rebuild before any mutating step, so that rebuild settles against the
still-undrained outgoing registry and generation 2's registration lands last.
(ii) The inert fs-handle leak on a throwing chokidar `close()` (the un-run
`_closers`) is unchanged — no retry path exists and none was added; the
leak is bounded, delivery-dead, and now evidenced by the diagnostic.
(iii) The seam-level permanently-delivering shape (an embedder-supplied
`FileWatcher` whose unsubscribe throws with handlers attached) is contained
by the same reorder — events feed a torn-down debouncer — which is exactly
what regression test (1) models.

## Summary

The bug-0021 fix's supersede-before-publish step deliberately runs its
infallible acts first (fold, drain) so "a throwing detach cannot strand the
fold", and isolates the fallible `detach()` so a throw cannot abort the
superseding pass's publication or escape into the host `session_start`
dispatch. Both intents hold. What the accepted design does not cover is what
the throw leaves BEHIND: `detach()` internally runs its only fallible step
first, so the throw skips the debounce-cancel and both torn-down marks, and
the swallow (`void e`) produces no evidence on any channel.

On the shipped chokidar path that yields three outcomes:

1. **One leaked superseded-generation reload pass.** A debounce window
   already pending at supersession time survives the throw with
   `tornDown` false, so when it closes the superseded generation runs a full
   reload: rediscover, rebuild, publish into its own drained registry,
   `pi.registerCommand` against handlers bound to that drained registry, and
   `theta-system-note` delivery — on a live session, where the PIC-67 stale
   probe passes by design. Then the machinery starves: chokidar's `closed`
   gate stops event delivery, so no further window ever opens.
2. **An inert fs-handle leak.** The un-run `_closers` hold the underlying
   `fs.watch` handles open for the process's remaining lifetime. Nothing
   consumes their events.
3. **Total silence.** No diagnostic is constructed, no system note is sent,
   no stderr line is written, on any of the above.

Outcome 1 violates the pinned no-superseded-rebuild clause. The
single-armed-watcher clause survives on the shipped path (delivery has
stopped) and is violated only behind an embedder-supplied `FileWatcher`.

Because the handle slot is nulled before the detach attempt and the
production unsubscribe never retries a failed close, no later path —
including the eventual `session_shutdown`, whose sub-step 4 is latest-only
per PIC-68 precisely "because … its watcher [was] already detached at
supersession time" — can ever reach the leaked handle or the leaked fs
handles. The throw falsifies the premise PIC-68's latest-only rule rests on,
and nothing compensates.

## Reproduction

Two parts: an offline test witness for the runtime behaviour, and a direct
read for the chokidar delivery claim.

**Chokidar delivery (read, no test).** In the installed
`node_modules/chokidar/esm/index.js`: `close()` at `:389` sets
`this.closed = true` at `:393` and calls `removeAllListeners()` at `:395`,
both ahead of every statement that can throw (`:397–401` closer invocation,
`:402` `stream.destroy()`, `:406` `dirent.dispose()`); `_emit` at `:445`
short-circuits on `if (this.closed) return;` at `:446–447`. A synchronous
throw out of `close()` therefore cannot leave the watcher delivering. The
CJS build (`node_modules/chokidar/index.js:394–421`) has the identical
statement order.

**Runtime behaviour.** Offline, deterministic — scratch vitest (deleted
after use) on the `tests/double-session-start-supersession.test.ts` harness
pattern: real `createThetaExtension` + `composeExtensionInstance` over a temp
workspace, hand-rolled `pi`/`ctx` fakes recording notes and registrations,
one shared `FakeClock`, an injected `deps.emitDiagnostic` recorder,
`console.error` spied. Generation 1's watcher unsubscribe models the
production shape (`pi-file-watcher.ts:48–50`): first call sets its `active`
guard then throws (`EMFILE: synthetic chokidar close() failure`); later calls
no-op. Generation 2's watcher is a normal counting fake. Sequence:
`session_start`; unlink `greet.theta`, plant `second.theta`; shutdown-less
`session_start` #2. Observed at HEAD:

- **The swallow.** Start #2 resolves (the isolation intent holds; generation
  2 publishes, registers `/second`, arms). Evidence of the detach failure:
  `deps.emitDiagnostic` recorder — `[]` (nothing is even constructed —
  stronger than bug 0023's constructed-then-dropped); `console.error` — zero
  calls; the note channel carries only the pinned repeat-start note and the
  compose pass's own load diagnostics (two `theta/load/settings-unreadable`
  notes from the temp workspace), and no detach-failure note of any kind.
- **Post-throw state.** Generation 1: unsub called exactly once; registry
  `{ drained: true, tag: undefined }` (the factory's infallible-first
  ordering held); the handle's `tornDown` flag still `false` and the
  debouncer still not marked torn-down — all three containment acts skipped.
- **Pending-window probe (live session, the production shape).** With one
  debounce window already pending across the supersession boundary, the
  window closes and the superseded generation runs one full reload pass:
  `wirings[0].registry` gains the newly-planted name while generation 2's
  registry stays without it; `pi.registerCommand` fires with the leaked
  pass's own name set (`["greet","third"]` in the recorded run — including a
  name the superseded generation owned), handlers bound to the drained
  generation-1 registry; the live `theta-system-note` channel carries the
  superseded pass's output — a `theta/load/cross-format-collision` note
  misdescribing the live generation's own `/second` as "Pi-owned command
  'second' survives", a re-emitted settings load diagnostic, and
  `theta watcher: 2 file(s) added or removed; run /reload to refresh the
  slash command list`. Dispatch of a captured name resolves with
  `theta /<name>: extension shutting down` — fail-safe (no theta ran; the
  site's mitigation holds) but the name is captured by a dead generation on
  a live session and the note misnames the state (the bug-0024 symptom
  shape, cross-generation). **Then starvation:** a further planted file
  produces no generation-1 publish and no new registrations, because
  chokidar's `closed` gate has stopped delivery. One-shot, not permanent.
  The throwing-`debouncer.cancel()` variant (`unsub()` succeeds,
  `clock.clearTimeout` throws) reaches the identical post-state — pending
  timer alive, `tornDown` false — and the identical one-shot outcome.
- **Teardown reach.** One `session_shutdown`: generation 2 detached and
  drained; generation 1's unsub count STILL 1 and its fs handles still
  open — sub-step 4 is latest-only by design and the nulled slot left the
  leaked handle unreachable; zero `teardown-step-failed` (the teardown saw
  nothing to fail on).
- **Seam-level variant (embedder-supplied watcher).** With a `FileWatcher`
  whose unsubscribe throws while leaving its handlers attached — a
  conforming PIC-14 implementation, and the shape the fake above models
  directly — the leaked generation is re-armed rather than starved: it
  rebuilds and re-registers on EVERY churn, races generation 2 for each
  newly-appearing name, and keeps doing so after `session_shutdown`
  (`pi.registerCommand` fires with `["fourth","third"]` post-teardown — the
  PIC-57 posture violation bug 0021 was filed for). On a real host the
  post-invalidation pass would instead trip the PIC-67 entry probe and
  quiesce with one stderr line misattributed to bug 0018's bare-dispose
  path; the fake ctx carries no stale switch. The pre-shutdown live-session
  behaviour has no such backstop: the probe passes on a live runtime.

## Expected behaviour

- [registration-steps.md#repeat-start-supersession](../spec_topics/pi-integration-contract/registration-steps.md#repeat-start-supersession):
  the detach "closing that generation's watcher and quiescing its debouncer,
  so no superseded-generation reload can rebuild or re-register after the
  supersession" — the same no-rebuild posture
  [PIC-57](../spec_topics/pi-integration-contract/session-shutdown-semantics.md#pic-57)
  pins for shutdown — and the single-armed-watcher invariant "intact" across
  repeat deliveries (MUST). No carve-out exists for a throwing detach. The
  no-rebuild clause is the one the shipped chokidar path breaks; the
  single-armed-watcher clause breaks behind an embedder-supplied watcher.
- [PIC-68](../spec_topics/pi-integration-contract/session-shutdown-semantics.md#pic-68)
  premises the teardown's latest-only sub-steps 1/4 on "each superseded
  generation's registry was already drained and its watcher already
  detached at supersession time". A throwing detach falsifies "already
  detached"; the spec prescribes no compensation and no evidence.
- The spec's own risk model treats this exact call as fallible-with-evidence
  everywhere else it appears: **Per-step isolation**
  (`session-shutdown-semantics.md`) mandates catch + exactly one
  `theta/host/session-shutdown-teardown-step-failed` per failing sub-step
  call — `discoveryWatcher.close` is a closed-set label — but its scope is
  the `session_shutdown` handler. For the supersession pass, no spec text
  prescribes either an outcome on detach failure or a diagnostic, so the
  documented posture (no superseded rebuilds) is undeliverable on this path
  and its failure is unobservable. Per
  [docs/bugs/README.md](./README.md), spec and implementation together fail
  to deliver documented behaviour.

## Actual behaviour / root cause

Two separable elements compound:

1. **Fallible-first step order inside `detach()`**
   (`hot-reload.ts:298–307`). The only step that can realistically throw —
   `unsub()`, in production a `chokidar` `close()` reached through
   `pi-file-watcher.ts:50` — runs first; the three infallible containment
   steps (`debouncer.cancel()`, `tornDown = true`,
   `debouncer.markTornDown()`) run after it and are skipped by the throw.
   The factory's supersede-before-publish block applies infallible-first
   ordering to its OWN steps (fold, drain, then detach — the site comment
   says so) but the same principle stops at the `detach()` boundary. The
   module's `quiesceOnStaleCtx` (:170–172) already demonstrates the
   containment-first order for the identical acts.
2. **The swallow carries no evidence** (`factory.ts:671–679`). `void e` for
   every throw type: no diagnostic constructed (the injected recorder stays
   empty — upstream of bug 0023's unwired production sink), no system note
   (the channel is LIVE at supersession time — the pinned repeat-start note
   rode it moments earlier), no stderr line. The teardown path's identical
   call gets both a diagnostic and, via the separate quiesce adapter, the
   torn-down marks; the supersession path has no follow-up step of any kind.

**On the shipped chokidar path** the two elements together yield: one leaked
superseded-generation reload pass whenever a debounce window is pending
across the supersession boundary (PIC-67's probe passes — staleness is per
runner, not per generation — so the pass publishes, re-registers, and sends
notes against a live host), then starvation; an inert leak of the un-run
`_closers` fs handles; a leaked `HotReloadHandle` no path can ever reach
again (slot nulled pre-throw; production unsub no-ops on retry); and zero
evidence on any channel at any point. The reachability of outcome 1 is
governed by window timing, not by watcher liveness: the pending window is
the state the skipped `cancel()` fails to clear.

**Behind an embedder-supplied watcher** the same skipped marks produce a
strictly larger failure. The `FileWatcher` seam is injectable by contract
(PIC-14), and a conforming implementation whose unsubscribe throws with its
handlers still attached leaves the superseded generation fully re-armed
minus dispatch: its debouncer schedules on every churn, each pass rebuilds,
publishes, re-registers live `pi` slash commands against the drained
registry, and delivers notes — indefinitely, and after `session_shutdown`
too, since the teardown cannot reach the leaked handle. That is the bug-0021
leak resurrected through the error path of its own fix. The shipped chokidar
adapter cannot reach this shape, because `close()` sets `closed` and strips
listeners before it can throw.

## Why it matters

- **A pinned MUST is silently violated.** The step-5 supersession pin is the
  bug-0021 fix's core contract; the no-superseded-rebuild half of it fails
  on this path and nothing records that it failed. Bug 0018's "dies quietly"
  concern applies one layer further out: there the machinery died with
  stderr evidence; here a dead generation *acts once more* with no evidence
  at all.
- **The leaked pass is active work against a live host.** It runs a full
  discovery walk, parse, and AJV recompile; mutates the live host command
  surface (Pi has no unregister); captures newly-appearing names into a
  drained registry, so their dispatch answers `extension shutting down` on a
  live session until `/reload`; and emits misleading notes, including a
  cross-format collision naming the LIVE generation's own command as the
  foreign survivor. One pass is enough to leave the host in that state
  permanently, because nothing re-registers the captured names back to the
  live generation.
- **The fs-handle leak is unbounded in lifetime.** The un-run `_closers`
  hold `fs.watch` descriptors for the rest of the process; the `active`
  guard means no later unsub retries the close, and the nulled handle slot
  means no teardown path reaches them.
- **Diagnosis is near-impossible after the fact.** The observable symptoms
  (shutting-down notes on a live session, phantom structural-change notes)
  point at bugs 0021/0024 territory; the actual trigger — one swallowed
  detach throw at supersession time — leaves no trace to correlate.
- **The trigger is a conjunction.** Two independently improbable events: a
  shutdown-less repeat `session_start` (bug 0021's class (b) — not reachable
  through the shipped CLI hosts at the `~0.80.10` pin; reachable via the
  public SDK's `bindExtensions()` re-emit, which theta's own live harness
  rides) AND a synchronous throw out of the outgoing detach (production
  surfaces: a `chokidar` `close()` synchronous throw or a `clearTimeout`
  throw; embedder-supplied watchers widen both the trigger surface and the
  consequence). This is the error path of an already-exceptional path. The
  counterweights: the spec's own **Per-step isolation** judges the identical
  call worth a pinned diagnostic, and the cost of the current posture is not
  a degraded diagnostic but an unrecorded violation of the supersession
  contract itself.

## Fix

Two code changes and one spec amendment, landed together. The fix is
sequenced after
[bug 0023](./0023-production-composition-omits-bootstrap-seams.md): the new
diagnostic routes through `deps.emitDiagnostic`, which the shipped
composition does not supply, so until 0023 wires that seam the emission
reaches no sink in production. Land 0023 first.

**1. Containment-first `detach()` ordering, for both callers.** Reorder
`HotReloadHandle.detach()` (`hot-reload.ts:298–307`) to run the infallible
marks before the fallible unsub — the order `quiesceOnStaleCtx` (:170–172)
already uses for the identical acts. `ReloadDebouncer.markTornDown()`
(`reload-debounce.ts:135–139`) sets the torn-down flag, cancels the pending
timer, and clears the PIC-49 deferred re-arm, so the body collapses to
`tornDown = true; debouncer.markTornDown(); unsub();`. A throwing unsub then
strands only the OS-level watcher handles: any surviving events feed a
torn-down debouncer, `runReload`'s `tornDown` short-circuit
(`hot-reload.ts:184–186`) and `#onWindowClosed`'s guard
(`reload-debounce.ts:167–169`) both hold, no rebuild can start, and the
spec's no-rebuild-after-supersession outcome survives the throw
structurally. Both callers get the new order: the supersession site and the
teardown's sub-step-4 adapter (`factory.ts:809–813`), whose separate quiesce
adapter (`factory.ts:826–827`) becomes a redundancy rather than the sole
backstop. On the non-throwing teardown path this narrows an already-
suppressed window — a change event landing between the mark and the close
feeds a torn-down debouncer instead of arming a window sub-step 4's
`whenIdle()` would await — so PIC-57 is satisfied more tightly, not less.
The codebase ends with one containment order rather than one order plus an
outlier; no `supersede()` member is added.

**2. Evidence at the swallow site.** Replace `void e` (`factory.ts:678`)
with one emission naming the supersession detach failure, under a new
diagnostic code `theta/host/session-start-supersession-detach-failed`
(`W`, `runtime`), routed through `deps.emitDiagnostic`. The existing
`theta/host/session-shutdown-teardown-step-failed` is not reused and its
`(step, call)` label set is not extended: both the registry row and
**Per-step isolation** scope that code to the `session_shutdown` handler and
close its label enumeration, and its name would misdescribe the site. The
emission is defended by its own `try`/`catch` per
[Diagnostic-emission isolation](../spec_topics/pi-integration-contract/diagnostic-emission-isolation.md#diagnostic-emission-isolation),
so it cannot abort the superseding pass. The catch stays broad and keeps its
`allow-broad-catch` marker: a detach throw must not abort the pass's
publication or escape into the host `session_start` dispatch, and the
teardown's posture for the identical call is catch-and-diagnose.

**3. Spec amendment.** One new row in
`docs/spec_topics/diagnostics/code-registry-host.md` for the code above (a
[DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2) registry
addition, admissible within 1.x as a
[GOV-15 diagnostic-registry carve-out](../spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out)),
plus a normative sentence in
[registration-steps.md#repeat-start-supersession](../spec_topics/pi-integration-contract/registration-steps.md#repeat-start-supersession)
prescribing catch-and-emit for the supersession detach — the clause whose
absence is element 2. Add the slug to H9a's permitted-code list, coordinating
with [bug 0030](./0030-h9a-stderr-gate-gap-and-stale-intended-red-header.md);
0030's stderr gate does not witness this bug, which is a silence defect.

**Regression coverage.** A unit test suffices and is preferable: the defect
is fully observable offline through the injected `FileWatcher` / `Clock`
seams, and both witnesses red at HEAD without a provider, a real host, or
real chokidar. (1) Throwing seam unsub at supersession with one debounce
window pending → the leaked handle's debouncer is torn down anyway: the
window fires no rebuild, generation 1's registry never gains the new name,
no new `pi.registerCommand`. (2) Exactly one diagnostic with the new code
and a stable `details.call`, on the `emitDiagnostic` recorder. A live test
cannot witness element 1 — forcing a synchronous chokidar `close()` throw on
a real host is not deterministically arrangeable. Re-run
`tests/live/double-session-start-live.test.ts` unchanged after the fix as a
non-regression check on the ordering change.

**Out of scope.** A superseded-generation rebuild already IN FLIGHT at
supersession time is unaffected by any ordering change here: the
supersession pass, unlike the teardown, never awaits `handle.whenIdle()`, so
that rebuild still publishes and re-registers whether or not the detach
throws. Filed as
[bug 0034](./0034-supersession-does-not-await-whenidle.md).

## Provenance

- Origin: bug 0021 §Fix (0.30.0) residual (ii) — "a throwing supersession
  detach is swallowed without a diagnostic (documented at the site,
  `factory.ts:671–679`)" — recorded by reviewer round 1 of fix commit
  `7fa76517`, which accepted the asymmetry on the drained-registry dispatch
  ground engaged above.
- Implementation evidence: `src/extension/factory.ts` (:640–690 supersede-
  before-publish; :667–679 the swallow; :809–832 the teardown adapters),
  `src/extension/hot-reload.ts` (:170–172, :184–186, :298–312),
  `src/extension/reload-debounce.ts` (:120–125 `cancel`, :135–139
  `markTornDown`, :164–175 `#onWindowClosed`),
  `src/seams/pi-file-watcher.ts` (:44–51),
  `src/extension/session-shutdown.ts` (:63, :468, :530), all at `4d645f4f`
  (byte-identical to `7fa76517` for the cited files).
- Dependency evidence: `node_modules/chokidar/esm/index.js` (:389–416
  `close()`, :445–447 `_emit`) and `node_modules/chokidar/index.js`
  (:394–421) at `chokidar@4.0.3`.
- Spec:
  [registration-steps.md#repeat-start-supersession](../spec_topics/pi-integration-contract/registration-steps.md#repeat-start-supersession),
  [session-shutdown-semantics.md](../spec_topics/pi-integration-contract/session-shutdown-semantics.md)
  **Per-step isolation** /
  [PIC-57](../spec_topics/pi-integration-contract/session-shutdown-semantics.md#pic-57)
  /
  [PIC-67](../spec_topics/pi-integration-contract/session-shutdown-semantics.md#pic-67)
  /
  [PIC-68](../spec_topics/pi-integration-contract/session-shutdown-semantics.md#pic-68),
  [PIC-14](../spec_topics/pi-integration-contract/host-interfaces-services.md#pic-14),
  the `theta/host/session-shutdown-teardown-step-failed` row
  (`diagnostics/code-registry-host.md`),
  [DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2),
  [GOV-15 diagnostic-registry carve-out](../spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out).
- Family: joins the diagnostics-surface reports
  [0018](./0018-hot-reload-stale-ctx-after-session-replacement.md) /
  [0022](./0022-late-compose-tail-registration-on-invalidated-runtime.md) /
  [0023](./0023-production-composition-omits-bootstrap-seams.md)
  ("dies quietly").
- Interaction with
  [0024](./0024-rebind-self-collision-drops-surviving-names.md):
  amplification, not duplication. The two have different root causes and
  different files — 0024 is `excludeOwnedNames = undefined` on the
  `session_start` compose path (`production-composition.ts`) plus
  `resolveSlashNames`' drop arm; 0029 is `detach()` step order plus the
  `factory.ts:671–679` swallow. The leaked generation-1 pass carries the
  superseded registry's `excludeOwnedNames` set, so it trips 0024's
  mechanism cross-generation, emitting
  `theta/load/cross-format-collision` against generation 2's live command.
  Fixing 0024 does not fix 0029; fixing 0029 removes this amplifier but not
  0024.
- Reproduction: scratch vitest per §Reproduction, green at `4d645f4f`
  (asserting current behaviour, capturing the observations verbatim);
  scratch deleted after observation, per task.
