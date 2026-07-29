# Bug 0029 — A throwing supersession detach is swallowed with zero evidence, and `detach()`'s fallible-first step order skips every containment mark: the superseded generation's watcher stays armed — the bug-0021 leak returns through the error path — while the site's drained-registry mitigation covers dispatch only

- **Status:** open
- **Kind:** defect — spec and implementation together fail to deliver
  documented behaviour on the throwing-detach path of the bug-0021
  supersession pass.
  [registration-steps.md#repeat-start-supersession](../spec_topics/pi-integration-contract/registration-steps.md#repeat-start-supersession)
  pins the outcome as a MUST: "the runtime MUST survive the repeat delivery
  with the single-armed-watcher invariant intact — the extension instance
  arms at most ONE hot-reload watcher across repeat `session_start`
  deliveries", and the supersession detach closes "that generation's watcher
  and quiescing its debouncer, **so no superseded-generation reload can
  rebuild or re-register after the supersession**". When the detach throws,
  the implementation delivers neither: `HotReloadHandle.detach()` runs its
  one fallible step FIRST (`unsub()`), so the throw skips the three
  infallible containment steps behind it (`debouncer.cancel()`,
  `tornDown = true`, `debouncer.markTornDown()`), leaving the superseded
  generation's whole hot-reload apparatus armed on a live runtime; and the
  factory swallows the throw with no diagnostic, no note, and no stderr —
  the spec's **Per-step isolation** evidence rule covers only the
  `session_shutdown` handler's sub-steps, and no spec text prescribes any
  failure handling for the supersession detach site. The reviewer-accepted
  mitigation at the site ("the outgoing registry is already drained, so the
  superseded generation fails safe at dispatch regardless",
  `factory.ts:671–679`) is true and holds empirically — but it covers
  dispatch only, not the armed watcher, its rebuild/re-register/note
  activity, or the permanent unreachability of the leaked handle.
- **Affected** (citations at HEAD `b542dafe`, 0.32.0 — `factory.ts`,
  `hot-reload.ts`, and `pi-file-watcher.ts` are byte-identical to the
  bug-0021 fix commit `7fa76517`; the 0.31.0/0.32.0 fixes touched neither):
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
    unsub there cannot resurrect a rebuild.
  - The production unsubscribe, `src/seams/pi-file-watcher.ts:46–51`:
    `active = false` is set before `watcher.close()`, so a synchronous
    `close()` throw leaves the chokidar handlers attached (events keep
    delivering) while every LATER unsub call no-ops on the `active` guard —
    the failed close is never retried.
  - The contrast surface: the `session_shutdown` teardown routes the
    IDENTICAL `handle?.detach()` call through per-step isolation
    (`src/extension/factory.ts:809–813` adapter;
    `src/extension/session-shutdown.ts:468/:530`) — a throw emits one
    `theta/host/session-shutdown-teardown-step-failed` via `console.error`
    (closed label `discoveryWatcher.close`,
    `docs/spec_topics/diagnostics/code-registry-host.md` row) — and then
    marks the debouncer torn-down through the separate quiesce adapter
    (`factory.ts:826–827` → the handle's `markTornDown`, hot-reload.ts
    :309–312), which also sets the closure `tornDown` flag: on the teardown
    path a throwing unsub yields evidence AND containment; on the
    supersession path it yields neither.
- **Observed at:** `0.32.0` (`b542dafe`). Mechanical — offline,
  deterministic scratch vitest over the shipped composition (deleted after
  observation); no live run.

## Summary

The bug-0021 fix's supersede-before-publish step deliberately runs its
infallible acts first (fold, drain) so "a throwing detach cannot strand the
fold", and isolates the fallible `detach()` so a throw cannot abort the
superseding pass's publication or escape into the host `session_start`
dispatch. Both intents hold. What the accepted design does not cover is what
the throw leaves BEHIND: `detach()` internally runs its only fallible step
first, so the throw skips the debounce-cancel and both torn-down marks, and
the swallow (`void e`) produces no evidence on any channel. The superseded
generation is then not "detached with its registry drained" but *fully
re-armed minus dispatch*: its watcher delivers, its debouncer schedules, its
reload passes rebuild, publish into the drained registry, re-register live
`pi` slash commands against it, and deliver system notes — on a live
session, where the PIC-67 stale probe passes by design. This is the bug-0021
leak, resurrected through the error path of its own fix, now with zero
stderr (pre-fix the leak at least produced one misattributed quiesced line
after invalidation).

Because the handle slot is nulled before the detach attempt and the
production unsubscribe never retries a failed close, no later path —
including the eventual `session_shutdown`, whose sub-step 4 is latest-only
per PIC-68 precisely "because … its watcher [was] already detached at
supersession time" — can ever reach the leaked watcher. The throw falsifies
the premise PIC-68's latest-only rule rests on, and nothing compensates.

## Reproduction

Offline, deterministic — scratch vitest (deleted after use) on the
`tests/double-session-start-supersession.test.ts` harness pattern: real
`createThetaExtension` + `composeExtensionInstance` over a temp workspace,
hand-rolled `pi`/`ctx` fakes recording notes and registrations, one shared
`FakeClock`, an injected `deps.emitDiagnostic` recorder, `console.error`
spied. Generation 1's watcher unsubscribe models the production shape
(`pi-file-watcher.ts:46–51`): first call sets its `active` guard then throws
(`EMFILE: synthetic chokidar close() failure`) with the handlers left
attached; later calls no-op. Generation 2's watcher is a normal counting
fake. Sequence: `session_start`; unlink `greet.theta`, plant `second.theta`;
shutdown-less `session_start` #2. Observed at HEAD:

- **The swallow.** Start #2 resolves (the isolation intent holds; generation
  2 publishes, registers `/second`, arms). Evidence of the detach failure:
  notes — only the pinned repeat-start note; `deps.emitDiagnostic` recorder
  — `[]` (nothing is even constructed — stronger than bug 0023's
  constructed-then-dropped); `console.error` — zero calls. Total silence.
- **Post-throw state.** Generation 1: unsub called exactly once, handler
  still attached, registry `{ drained: true, tag: undefined }` (the
  infallible-first ordering held). Two armed watchers — the pinned
  single-armed-watcher invariant is violated.
- **Churn probe (live session).** Plant `third.theta`, fire generation 1's
  watcher, cross the debounce boundary: the superseded generation rebuilds
  and PUBLISHES — `wirings[0].registry.get("third")` defined while
  generation 2's registry stays without it; `pi.registerCommand` fires with
  `["third"]` (handler bound to the drained generation-1 registry); the
  live `theta-system-note` channel carries the superseded pass's output —
  a `theta/load/cross-format-collision` note misdescribing the live
  generation's own `/second` as "Pi-owned command 'second' survives", a
  re-emitted settings load diagnostic, and
  `theta watcher: 2 file(s) added or removed; run /reload to refresh the
  slash command list`. Dispatch of `/third` resolves with
  `theta /third: extension shutting down` — fail-safe (no theta ran; the
  accepted mitigation holds) but the name is captured by a dead generation
  on a live session and the note misnames the state (the bug-0024 symptom
  shape, here for names only the leaked generation registered). In
  production both generations' chokidar watchers observe the same churn, so
  each newly-planted name races: if the leaked generation's debounce
  completes first, the name is its until `/reload`.
- **Teardown reach.** One `session_shutdown`: generation 2 detached and
  drained; generation 1's unsub count STILL 1, handler STILL attached —
  sub-step 4 is latest-only by design and the nulled slot left the leaked
  handle unreachable; zero `teardown-step-failed` (the teardown saw nothing
  to fail on). Plant `fourth.theta`, fire generation 1 again: the leaked
  generation rebuilds AFTER teardown — `fourth` published into its registry,
  `pi.registerCommand` fires with `["fourth","third"]` — the PIC-57 posture
  violation bug 0021 was filed for. (On a real host the post-invalidation
  pass would instead trip the PIC-67 entry probe and quiesce with one
  stderr line misattributed to bug 0018's bare-dispose path; the fake ctx
  carries no stale switch. The pre-shutdown live-session behaviour above
  has no such backstop in production either — the probe passes on a live
  runtime.)

The weaker variant — `unsub()` succeeds, `debouncer.cancel()`
(`clock.clearTimeout`) throws — skips both torn-down marks with the watcher
detached: one already-pending debounce window can still drive one full
superseded-generation reload pass, then the machinery starves (no further
events). One-shot rather than permanent; equally unevidenced.

## Expected behaviour

- [registration-steps.md#repeat-start-supersession](../spec_topics/pi-integration-contract/registration-steps.md#repeat-start-supersession):
  the single-armed-watcher invariant "intact" across repeat deliveries
  (MUST), and the detach "closing that generation's watcher and quiescing
  its debouncer, so no superseded-generation reload can rebuild or
  re-register after the supersession" — the same no-rebuild posture
  [PIC-57](../spec_topics/pi-integration-contract/session-shutdown-semantics.md#pic-57)
  pins for shutdown. No carve-out exists for a throwing detach.
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
  documented posture (invariant intact, no superseded rebuilds) is
  undeliverable on this path and its failure is unobservable. Per
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
   empty — this is upstream of bug 0023's unwired production sink), no
   system note (the channel is LIVE at supersession time — the pinned
   repeat-start note delivered on it moments earlier), no stderr line. The
   teardown path's identical call gets both a diagnostic and, via the
   separate quiesce adapter, the torn-down marks; the supersession path has
   no follow-up step of any kind.

Given both, a throwing supersession detach yields: two armed watchers on a
live runtime (PIC-67's probe passes — staleness is per runner, not per
generation), superseded-generation rebuilds that publish, re-register, and
send notes, name capture with the misnaming shutting-down note, a leaked
handle no path can ever reach again (slot nulled pre-throw; production
unsub no-ops on retry), and post-teardown rebuilds — all with zero evidence
on any channel at any point.

## Why it matters

- **A pinned MUST is silently violated.** The step-5 supersession pin is the
  bug-0021 fix's core contract; on this path it fails wholesale and nothing
  records that it failed. Bug 0018's "dies quietly" concern applies one
  layer further out: there the machinery died with stderr evidence; here
  the machinery *lives on* wrongly with no evidence at all.
- **The failure is active, not just a leak.** Unlike a stranded-but-inert
  resource, the re-armed generation does work on every churn (discovery
  walk, parse, AJV), mutates the live host command surface (Pi has no
  unregister), captures newly-appearing names into a drained registry
  (dispatch: `extension shutting down` on a live session, until `/reload`),
  and emits misleading notes (a cross-format collision naming the LIVE
  generation's command as the foreign survivor).
- **Diagnosis is near-impossible after the fact.** The observable symptoms
  (shutting-down notes on a live session, phantom structural-change notes)
  point at bugs 0021/0024 territory; the actual trigger — one swallowed
  detach throw at supersession time — left no trace to correlate.
- **Honest severity.** The trigger is a conjunction of two independently
  improbable events: a shutdown-less repeat `session_start` (bug 0021's
  class (b) — not reachable through the shipped CLI hosts at the `~0.80.10`
  pin; reachable via the public SDK's `bindExtensions()` re-emit, which
  theta's own live harness rides) AND a synchronous throw out of the
  outgoing detach (production surfaces: a `chokidar` `close()` synchronous
  throw or a `clearTimeout` throw — both rare; the seam is injectable, so
  embedder-supplied watchers widen the surface). This is the error path of
  an already-exceptional path. The counterweights: the spec's own Per-step
  isolation judges the identical call worth a pinned diagnostic, and the
  cost of the current posture is not a degraded diagnostic but a silent
  violation of the supersession contract itself.

## Fix options and recommendation

1. **Containment-first `detach()` ordering (recommended, pair with 2).**
   Reorder `HotReloadHandle.detach()` to run the infallible marks before
   the fallible unsub: `tornDown = true; debouncer.markTornDown()` (which
   also cancels the pending timer and clears the PIC-49 deferred re-arm),
   THEN `unsub()` — the order `quiesceOnStaleCtx` already uses. A throwing
   unsub then strands only the OS-level watcher handles: events feed a
   torn-down debouncer, no rebuild can ever start, and the spec's
   no-rebuild-after-supersession outcome survives the throw structurally —
   for both callers (supersession and teardown sub-step 4, whose separate
   quiesce adapter becomes a redundancy rather than the sole backstop).
   Cheap, no new diagnostic surface, no observable change on the
   non-throwing path. Does not restore evidence: the handle leak stays
   silent. (Boundary note: a superseded-generation rebuild already in
   flight at supersession time is unaffected by any ordering — the
   supersession pass, unlike the teardown, never awaits
   `handle.whenIdle()`; adjacent, unfiled, out of scope here.)
2. **Evidence at the swallow site.** Emit one diagnostic naming the
   supersession detach failure. Channel: the `theta-system-note` channel is
   live at supersession time (the repeat-start note just rode it) and is
   the routing extension-bootstrap failures already prescribe; the emission
   must carry the bug-0018 stale-dead posture (a stale send marks the
   channel dead and rethrows) and be defended so it cannot itself abort the
   pass. Registry cost: `theta/host/session-shutdown-teardown-step-failed`
   is scoped by its registry row and by **Per-step isolation** to the
   `session_shutdown` handler with a closed `(step, call)` label set
   ("an implementation MUST NOT introduce a `details.call` value outside
   this enumeration"), so an honest label is a
   [DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2) registry
   amendment — a new code or a supersession-scoped row — the same shape as
   bug 0023's defect 2. Routing via `deps.emitDiagnostic` instead is dead
   in production until
   [bug 0023](./0023-production-bootstrap-diagnostics-dropped-and-mislabelled.md)
   wires it (dependency, not duplicated here).
3. **Narrow the catch / let it crash** (house style: catch specific or let
   crash). Rejected as primary: the isolation intent is sound — a detach
   throw must not abort the superseding pass's publication or escape into
   the host `session_start` dispatch, and the teardown's posture for the
   identical call is catch-and-diagnose, not crash. The catch carries the
   `allow-broad-catch` exemption marker; the defect is the silence and the
   skipped containment, not the breadth as such.

Option 1 restores the pinned invariant on the throwing path; option 2
restores the failure's observability. Either alone leaves half the gap:
1-only leaks handles silently, 2-only evidences a failure it does not
contain.

## Provenance

- Origin: bug 0021 §Fix (0.30.0) residual (ii) — "a throwing supersession
  detach is swallowed without a diagnostic (documented at the site,
  `factory.ts:671–679`)" — recorded by reviewer round 1 of fix commit
  `7fa76517`, which accepted the asymmetry on the drained-registry dispatch
  ground engaged above.
- Implementation evidence: `src/extension/factory.ts` (:660–690 supersede-
  before-publish; :667–679 the swallow; :809–833 the teardown adapters),
  `src/extension/hot-reload.ts` (:170–172, :298–312),
  `src/extension/reload-debounce.ts` (`cancel` / `markTornDown`),
  `src/seams/pi-file-watcher.ts` (:46–51),
  `src/extension/session-shutdown.ts` (:63, :468, :530), all at `b542dafe`
  (byte-identical to `7fa76517` for the cited files).
- Spec:
  [registration-steps.md#repeat-start-supersession](../spec_topics/pi-integration-contract/registration-steps.md#repeat-start-supersession),
  [session-shutdown-semantics.md](../spec_topics/pi-integration-contract/session-shutdown-semantics.md)
  **Per-step isolation** /
  [PIC-57](../spec_topics/pi-integration-contract/session-shutdown-semantics.md#pic-57)
  /
  [PIC-67](../spec_topics/pi-integration-contract/session-shutdown-semantics.md#pic-67)
  /
  [PIC-68](../spec_topics/pi-integration-contract/session-shutdown-semantics.md#pic-68),
  the `theta/host/session-shutdown-teardown-step-failed` row
  (`diagnostics/code-registry-host.md`),
  [DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2).
- Family: joins the diagnostics-surface reports
  [0018](./0018-hot-reload-stale-ctx-after-session-replacement.md) /
  [0022](./0022-late-compose-tail-registration-on-invalidated-runtime.md) /
  [0023](./0023-production-bootstrap-diagnostics-dropped-and-mislabelled.md)
  ("dies quietly"); symptom overlap with
  [0024](./0024-rebind-self-collision-drops-surviving-names.md)
  (stale-bound names yielding the shutting-down note on a live session).
- Reproduction: scratch vitest per §Reproduction, green at `b542dafe`
  (asserting current behaviour, capturing the observations verbatim);
  scratch deleted after observation, per task.
