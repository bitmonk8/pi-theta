# Bug 0018 — Watcher hot-reload runs against a stale captured `ctx` after session replacement; the failure note's own delivery then fails on the same stale surface

- **Status:** open.
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

## Expected behaviour

Per the host rule, post-replacement work must re-acquire the current session
surface (`withSession` / fresh ctx) rather than reusing a captured one; per
PIC-57 (`package-and-settings.md` §watcher teardown), a reload racing
teardown/replacement must be suppressed or quiesced, and per ERR-7 a genuine
watcher-time rebuild failure must surface on the `theta-system-note` channel
— which presupposes a live delivery surface.

## Actual behaviour / root cause (hypothesis — needs wiring investigation)

The reload wiring composed at `session_start` closes over that session's
`ctx`/`pi` (filesystem reads via `ctx.cwd`, note delivery via
`pi.sendMessage`). Session replacement invalidates those surfaces, but:

- the `tornDown` flag is only set by the explicit teardown path
  (`markTornDown()` / `detach()`); a session *replacement* that does not run
  theta's shutdown wiring leaves the watcher armed with stale captures; and
- even when the rebuild fails, the ERR-7 emit path uses the same stale
  channel, so the failure is unreportable through the designed channel.

Open questions for the fix: which replacement/reload events the extension can
observe to re-bind or quiesce the watcher; whether the note channel should
resolve the current session surface at send time instead of capture time;
and whether the H8a harness's dispose ordering (session disposed while the
watcher debounce window is open) is also reachable in a real interactive
session via `ctx.newSession()` / `ctx.reload()` (the host error text implies
it is).

## Why it matters

- After the first stale-ctx reload failure, hot reload is dead for the
  session: subsequent `.theta` edits are silently ignored (the swap is
  discarded every time).
- The designed failure surface (ERR-7 note) cannot deliver, so the operator
  gets no signal outside stderr.
- The same stale-channel failure mode swallows load diagnostics
  (`settings-unreadable` above), compounding bug 0013's territory at the
  delivery layer.

## Fix sketch

Re-acquire or re-bind the session surface for watcher-time work (move
post-replacement work into `withSession`, or subscribe to the host's
session-replacement event to re-wire/quiesce, mirroring the existing
session-shutdown teardown), and make system-note delivery resolve the
*current* surface at send time with a fail-loud-but-once fallback. Add a
regression lock that drives a reload after a session replacement and asserts
either quiescence or a delivered ERR-7 — the existing
`reload-teardown-quiesce` / `watcher-terminated-recovery` suites cover
teardown, not replacement.
