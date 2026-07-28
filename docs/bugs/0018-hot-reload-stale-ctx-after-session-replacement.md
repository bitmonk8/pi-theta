# Bug 0018 — Watcher hot-reload runs against a stale captured `ctx` after session replacement; the failure note's own delivery then fails on the same stale surface

- **Status:** fixed (0.28.0). The reload pass performs one deliberate
  `ctx.cwd` stale probe at entry and quiesces permanently on the host's
  stale-ctx error — torn-down debouncer, detached watcher, one latched
  `theta hot-reload quiesced:` stderr line per extension instance; the
  system-note channel marks itself permanently dead on a stale send and
  rethrows instead of cascading through the equally stale fallback arms; the
  arm-after-teardown race is closed zero-touch. The posture is pinned as
  PIC-67 (`session-shutdown-semantics.md#pic-67`).
- **Kind:** defect — the hot-reload path violates the host's ctx-lifetime rule.
  Pi invalidates a captured `ExtensionContext` / `pi` surface on session
  replacement or reload ("Do not use a captured pi or command ctx after
  ctx.newSession(), ctx.fork(), ctx.switchSession(), or ctx.reload()").
  The theta watcher's debounced reload closes over the `session_start`-era
  surfaces and uses them when the watcher fires after a replacement: the
  rediscover/compose pass reads through the stale ctx and throws, and the
  ERR-7 failure note (`theta/runtime/registry-swap-failed`) then attempts
  delivery through the same stale channel and fails too — so the defect is
  observable only on stderr, not on the `theta-system-note` channel.
- **Affected:** `installHotReload` / `ReloadDebouncer.runReload`
  (`src/extension/hot-reload.ts` — rediscover call :144, `emitErr7` :117),
  `rebuildAndSwap` / `emitRegistrySwapFailed`
  (`src/extension/reload-wiring.ts:319/:337`), the rediscover closure
  (`src/extension/production-composition.ts:1145` → `runComposePass` :401),
  and the load-diagnostic delivery path (observed as
  `system-note delivery failed: … theta/load/settings-unreadable …`).
  The PIC-57 `tornDown` guard exists in `runReload` but did not cover the
  observed window.
- **Observed at:** `0.26.0`, host Pi pins `~0.80.10`, during
  `npm run test:live` — stderr of the H8a typed-query test
  (`tests/live/live-production-acceptance.test.ts`), where the programmatic
  harness boots and disposes a real `AgentSession` per test and the planted
  workspace's file churn arms the real watcher.

## Fix (0.28.0)

The report's fix sketch proposed re-binding to the current session surface or
send-time re-resolution; neither is possible — the host fires no event on the
invalidating path and exposes no non-throwing staleness probe, and every
fallback arm rides the same invalidated runtime — so the adopted posture is
reactive detection and permanent quiescence, pinned as the new PIC-67 clause
(`docs/spec_topics/pi-integration-contract/session-shutdown-semantics.md`,
anchor `#pic-67`).

**Detection (`src/extension/stale-ctx.ts`, new).** `isStaleCtxError`
recognises the host's stale-ctx invalidation error by its stable message
prefix (`This extension ctx is stale after session replacement or reload` —
byte-identical across every host `invalidate(...)` call site at the pin;
prefix-only, so a guidance-tail wording tweak does not break detection);
`STALE_QUIESCE_STDERR_PREFIX` (`theta hot-reload quiesced:`) and
`StaleQuiesceLog`, a fail-loud-once stderr latch whose `console.error` sink is
defended (a sink throw is swallowed and, the latch being set first, never
retried).

**Reload pass (`src/extension/hot-reload.ts` `runReload`).** Entry probe: one
deliberate side-effect-free guarded touch (`void ctx.cwd`, injected as
`probeRuntime`) before any other surface is reached; the recognised stale
throw routes to `quiesceOnStaleCtx` — permanent `tornDown`,
`debouncer.markTornDown()`, watcher unsub, one latched stderr line. A
belt-and-braces arm catches a stale error escaping the rediscover/rebuild
mid-flight (invalidation landing after the probe passed) and quiesces the
same way. An unrecognised error rethrows — the posture narrows no other
failure handling. ERR-7 is never attempted through a stale channel.

**Note channel (`src/extension/system-note-channel.ts`).**
`SystemNoteChannelHealth`: a stale `pi.sendMessage` throw marks the channel
permanently dead and rethrows — the `ctx.ui.notify` fallback arm rides the
same invalidated runtime and is never re-entered, and no
`system-note delivery failed:` line is produced for the stale case; a dead
channel rethrows the recorded error without touching any host surface; the
non-stale terminal `console.error` is once-bounded per channel instance.

**Arm-after-teardown race (`src/extension/factory.ts`).**
`shutdownEventsObserved` is snapshotted before the async `session_start`
compose; arming the step-5 watcher is suppressed when a `session_shutdown`
was consumed mid-flight — zero probe touches, no stderr line (not arming is
already the PIC-57-correct posture there).

**Terminal-signal arm (`src/extension/watcher-recovery.ts`).** A stale throw
from the PIC-55 `watcher-terminated` note delivery is swallowed (the watcher
is already torn down on that path) and emits one latched quiesce line through
the shared `StaleQuiesceLog` — at most one line per install across both arms.

**Debouncer (`src/extension/reload-debounce.ts`).** The rebuild-rejection arm
logs `theta hot-reload rebuild rejected:` through a defended sink and
releases the PIC-49 guard in a `finally`, so `whenIdle()` waiters never hang
on a rethrown unrecognised error.

**Live harness (`tests/live/harness.ts`).** `dispose` now emits
`session_shutdown` (reason `"quit"`, `hasHandlers`-guarded) before
`session.dispose()`, mirroring the host's own graceful
`AgentSessionRuntime.dispose()` ordering.

**Spec.** The PIC-67 clause pins the shutdown-less-invalidation posture: one
probe touch per reload pass, permanent quiesce, exactly one wrapped stderr
line per extension instance across all three evidence sites, no delivery
attempt through an invalidated runtime, zero-touch arm-after-teardown
suppression. `registration-steps.md` scopes the step-4 "Pi fires
`session_shutdown` before `invalidate(...)`" presupposition to the
replacement/quit paths and cross-refs PIC-67 from PIC-55;
`runtime-event-channel.md` scopes the fallback chain's "never aborts" to a
live runtime and pins the terminal line once-bounded; `diagnostic-shape.md`
gains the live-runtime qualifier; `coverage-matrix.md` gains the PIC-67 row.

**Verification.** Full default suite 218 files / 2535 tests green; typecheck
and lint clean; three review rounds. Bidirectionality: the six-test lock is
red-at-HEAD-proven (§Reproduction). Live e2e:
`tests/live/live-production-acceptance.test.ts` 5/5 green (~21 s) with a
0-byte stderr capture — zero `system-note delivery failed:`, zero
`registry swap failed` — and the collateral hardening probe file equally
green and cascade-free.

Adjacent pre-existing issues identified during review, out of scope: (i) a
second `session_start` overwrites the single-slot hot-reload handle and
leaks the superseded generation's armed watcher — filed as
[bug 0021](./0021-double-session-start-leaks-armed-watcher.md); (ii) the
late-completing compose tail still performs registration work against the
invalidated runtime (PIC-67 suppresses only the watcher arming; the
regression suite's Case C baselines this arm out) — filed as
[bug 0022](./0022-late-compose-tail-registration-on-invalidated-runtime.md).

## Summary

During a live run, a watcher-debounced reload fired in a window where the
extension's captured session surfaces were already invalidated (the harness
had replaced/disposed the session). Three consecutive failures surfaced on
stderr, all rooted in the same stale capture:

1. `runComposePass` (via the `rediscover` closure) threw the host's
   stale-ctx error while re-running discovery/compose.
2. `rebuildAndSwap` correctly discarded the swap and routed ERR-7
   (`theta/runtime/registry-swap-failed: … theta watcher`), but
3. the note's delivery *itself* failed
   (`system-note delivery failed: …`) because `emitErr7` sends through the
   same captured channel — as did an earlier
   `theta/load/settings-unreadable` load-diagnostic delivery.

Observed stderr (elided):

```
system-note delivery failed: …/.pi/settings.json: theta/load/settings-unreadable: …
  Error: This extension ctx is stale after session replacement or reload. …
    at runComposePass (src/extension/production-composition.ts:401)
    at Object.rediscover (src/extension/production-composition.ts:1145)
    at ReloadDebouncer.runReload (src/extension/hot-reload.ts:144)
system-note delivery failed: theta/runtime/registry-swap-failed: registry swap failed: theta watcher
  hint: This extension ctx is stale after session replacement or reload. …
    at Object.emitErr7 [as emitDiagnostic] (src/extension/hot-reload.ts:117)
```

The enclosing test failed for an unrelated reason (bug 0017); these errors
did not fail any test — which is exactly the problem: the reload machinery
dies quietly, the registry stays permanently stale for the remainder of the
session, and the operator-facing failure note never arrives.

## Reproduction

Offline, deterministic — `tests/hot-reload-stale-ctx-replacement.test.ts`,
written first: 5 red / 1 green at fa58456b with the exact stderr cascade
signatures. The harness mirrors the watcher-hot-reload integration suite
(real `createThetaExtension` + `composeExtensionInstance`, `FakeFileWatcher`
+ `FakeClock`), but the hand-rolled `pi` / `ctx` fakes carry a host-faithful
stale switch: `invalidate()` arms an `assertActive()` in every guarded `pi.*`
member and `ctx.*` getter that records the touch and throws the byte-exact
host message. Six tests: the exact `["ctx.cwd"]` single-probe detection set
plus second-boundary permanence and the fail-loud-once stderr latch; zero
`settings-unreadable` cascade; zero ERR-7 cascade; the quiesce-or-deliver
disjunction; Case C — the arm-after-teardown race through a deferred-compose
seam, locked zero-touch; and Control B — shutdown-then-invalidate, the
ordinary teardown path, green pre-fix. Supporting witnesses:
`tests/hot-reload-stale-quiesce-arms.test.ts` (mid-flight belt-and-braces),
`tests/system-note-channel.test.ts` (stale-dead channel arms),
`tests/watcher-terminated-recovery.test.ts` (stale terminal arm, shared
latch, defended sink), `tests/reload-debounce.test.ts` (rejection log and
guard release). Live witness: the H8a file per §Fix, 0-byte stderr capture.

## Expected behaviour

Per the host rule, post-replacement work must re-acquire the current session
surface (`withSession` / fresh ctx) rather than reusing a captured one; per
PIC-57 (`pi-integration-contract/session-shutdown-semantics.md`, anchor
`#pic-57`), a reload racing
teardown/replacement must be suppressed or quiesced, and per ERR-7 a genuine
watcher-time rebuild failure must surface on the `theta-system-note` channel
— which presupposes a live delivery surface.

## Actual behaviour / root cause

The invalidation that leaves the watcher armed is *shutdown-less*: a bare
`AgentSession.dispose()` — a public host SDK API — calls
`_extensionRunner.invalidate(...)` WITHOUT emitting `session_shutdown` first
(`dist/core/agent-session.js:573` at the `~0.80.10` pin), unlike every host
replacement path (`newSession` / `switchSession` / `fork` / `reload` / quit),
all of which emit `session_shutdown` before invalidating. The H8a harness's
per-test `session.dispose()` is exactly that path. The reload wiring composed
at `session_start` closes over that session's `ctx`/`pi`; the guarded
surfaces the compose pass reads through are `pi.getFlag`, `pi.getCommands`,
`ctx.modelRegistry`, `pi.sendMessage`, and `ctx.ui` — not the filesystem
(`PiFileSystem` captures `cwd` as a string at construction,
`src/seams/pi-file-system.ts:31–34`, so fs reads never throw stale). After
the bare dispose:

- the `tornDown` flag was only ever set by the `session_shutdown` teardown
  (`markTornDown()` / `detach()`), which never ran, so the watcher stayed
  armed over stale captures; the debounced reload then drove `runComposePass`
  against them and every guarded touch threw the host stale-ctx error; and
- the ERR-7 emit path (and the earlier load-diagnostic emission) used the
  same invalidated channel, so both delivery attempts died on the same dead
  surface — the two `system-note delivery failed:` cascades — and the
  registry stayed permanently stale.

The questions the report left open are answered. The host fires no event on
the bare dispose and exposes no non-throwing staleness probe (`staleMessage`
is private; there is no `isStale` / `isActive` / `isDisposed` member), so the
extension cannot re-bind: a deliberate guarded touch that recognises the
thrown error is the only detection, and quiescence the only posture —
resolving the current session surface at send time is not possible because
every fallback arm rides the same invalidated runtime. The interactive
`ctx.newSession()` / `ctx.reload()` paths DO emit `session_shutdown` first;
the shutdown-less ordering is nevertheless reachable in-product via any SDK
embedder's bare `dispose()`, and — same defect class — via the
arm-after-teardown race, where a `session_shutdown` consumed while the async
`session_start` compose is in flight tears down before the compose completes
and arms a watcher nothing will ever detach.

## Why it matters

- After the first stale-ctx reload failure, hot reload is dead for the
  session: subsequent `.theta` edits are silently ignored (the swap is
  discarded every time).
- The designed failure surface (ERR-7 note) cannot deliver, so the operator
  gets no signal outside stderr.
- The same stale-channel failure mode swallows load diagnostics
  (`settings-unreadable` above), compounding bug 0013's territory at the
  delivery layer.

