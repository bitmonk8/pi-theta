---
id: PTQ-1542
title: adaptChannelToChildProcess drops a backend kill() throw on the abandonment-settlement kill with no diagnostic, while the cancellation-kill and teardown-kill sites route the same throw to a diagnostic
lens: D6
status: open
verdict: confirmed
locations:
  - src/runtime/subagent-result-channel.ts:320-329
  - src/runtime/subagent-json-driver.ts:375-393
  - src/runtime/subagent-isolation.ts:247-254
sites: 3
fix_scope: cross-module
d6_class: swallowed
d6_anchor: "pi-integration-contract/subagent.md#pic-66 — \"If initiating the kill throws, the runtime traps the error and routes it through `theta/runtime/internal-error` (see [Diagnostics](../diagnostics.md)) but does not alter the invocation result — mirroring the teardown-throws rule.\""
wave: qw20260928060032
reported_by: lens-d6-errorposture (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# adaptChannelToChildProcess drops a backend kill() throw on the abandonment-settlement kill with no diagnostic, while the cancellation-kill and teardown-kill sites route the same throw to a diagnostic

## Observation
`adaptChannelToChildProcess` (bug 0484) kills the placed child through the backend's `kill()` when the result channel settles without an envelope (heartbeat silence or socket close). If that `kill()` throws, the catch discards the error with `void killError`: no diagnostic, no note, no propagation. The function receives only `(placed, channel)` and has no diagnostic sink. The repository's other two catches around a child `kill()` throw handle the same throw differently. The PIC-66 cancellation kill (`attachSubagentCancellation`) emits `theta/runtime/internal-error`. The PIC-65 teardown kill (`killChild` in subagent-isolation.ts) emits `theta/runtime/subagent-dispose-failure`. All three leave the invocation result unchanged. Only the channel-abandonment site stays silent.

## Evidence
Divergent side: src/runtime/subagent-result-channel.ts:320-329
```ts
  channel.onSettled((info) => {
    if (info.signal !== HEARTBEAT_SILENCE_SIGNAL && info.signal !== CHANNEL_CLOSED_SIGNAL) {
      return;
    }
    try {
      placed.kill();
    } catch (killError: unknown) { // allow-broad-catch: PIC-66 kill-throw rule — the settlement (and its crash-shaped Err) must reach the drive even when the backend kill throws; pi-integration-contract/subagent.md
      void killError;
    }
  });
```

Sibling 1 (PIC-66 cancellation kill): src/runtime/subagent-json-driver.ts:375-393
```ts
  // PIC-66: the kill is the cancellation forward to a `-p` child.
  // A synchronous kill-throw is trapped and routed through
  // `theta/runtime/internal-error` without altering the invocation result.
  const killChild = (): void => {
    try {
      child.kill();
    } catch (killError: unknown) { // allow-broad-catch: PIC-66 theta/runtime/internal-error — pi-integration-contract/subagent.md
      const message = killError instanceof Error ? killError.message : String(killError);
      ...
      deps.emitDiagnostic({
        severity: "error",
        code: SUBAGENT_CANCEL_KILL_INTERNAL_ERROR_CODE,
        message: `internal error: ${message}`,
        hint: stack,
      });
```

Sibling 2 (PIC-65 teardown kill): src/runtime/subagent-isolation.ts:247-254
```ts
/** Kill the child (process-tree on Windows); a kill throw is an advisory teardown-step failure. */
function killChild(child: SubagentChildProcess, deps: SubagentChildTeardownDeps): void {
  try {
    child.kill();
  } catch (killError: unknown) { // allow-broad-catch: theta/runtime/subagent-dispose-failure — pi-integration-contract/subagent.md
    emitTeardownStepFailure(deps, killError);
  }
}
```

Why these are the same failure class, mechanically: in all three sites the runtime itself starts a kill of a subagent child it owns, and the kill call throws synchronously. At the channel site `placed.kill()` is the backend's `kill()`. At the other two sites `child.kill()` is `SubagentChildProcess.kill`, and for a channel-placed child that is `adaptChannelToChildProcess`'s own `kill()` (subagent-result-channel.ts:356-362), which calls the same `placed.kill()` inside `try … finally` and lets the throw reach those two catches. So the same backend `kill()` throw gets a diagnostic when it comes through cancellation or teardown, and is dropped when it comes through the abandonment settlement.

Anchor (docs/spec_topics/pi-integration-contract/subagent.md, PIC-66, line 277, verbatim): "If initiating the kill throws, the runtime traps the error and routes it through `theta/runtime/internal-error` (see [Diagnostics](../diagnostics.md)) but does not alter the invocation result — mirroring the teardown-throws rule." The teardown rule it mirrors (same file, line 259, verbatim): "If a teardown step itself throws (the stdin release or the kill call), the runtime logs it via `theta/runtime/subagent-dispose-failure` … but does not alter the invocation result — the diagnostic is advisory only." Line 259 also puts the abandonment kill under teardown: "A settlement synthesised without an envelope kills the placed child through that `kill()` as it settles (an invocation that settles without an envelope leaves no live child; bug 0484)".

Searches (run this session):
- `grep -rn "allow-broad-catch: PIC-66" src` → 2 hits: subagent-json-driver.ts:381 (emits a diagnostic) and subagent-result-channel.ts:326 (drops the error). Two catches carry the same PIC-66 token and handle it differently.
- `grep -rn "catch (killError" src --include=*.ts` → 4 hits: the three cited above plus src/extension/production-subagent-host.ts:464. That fourth one is the taskkill-spawn fallback, which acts on the failure by falling through to `child.kill("SIGKILL")`. It is a different class (fallback, not a trap).
- `grep -rn "adaptChannelToChildProcess(" src --include=*.ts` → 2 hits: the definition and its one production caller src/extension/production-result-channel.ts:213.

## Why this is a problem
The catch's own token names PIC-66's kill-throw rule. That rule has two parts: trap the throw (so the result is unchanged) and route it to `theta/runtime/internal-error`. The channel site does only the first part. Its token rationale ("the settlement … must reach the drive even when the backend kill throws") explains why the throw is not propagated. It does not explain dropping the operator-visible routing, and both siblings keep the result unchanged and still emit. Under bug 0484 this is the path meant to guarantee "no live child" after an abandonment. When the backend kill fails there, the orphan the bug describes (a still-running worker) can outlive the invocation with nothing in the diagnostics stream, where a cancellation or teardown kill failure of the same backend would have logged.

## Suggested direction (non-binding, optional)
Give the abandonment-settlement kill the same diagnostic routing its siblings use: thread a diagnostic sink into `adaptChannelToChildProcess` from `production-result-channel.ts` and route the trapped throw to the code PIC-66 or PIC-65 names. Keep the settlement unconditional, as it is now.

## False-positive check
- EXST-9 / PIC-73 class: not a sink or producer-hook throw at the execution-status bus boundary, and `placed.kill()` is not an optional presence-probed capability (it is a required `PlacedChild` member, subagent-placement.ts). Neither exemption applies.
- allow-broad-catch token at each cited catch: divergent site `PIC-66 kill-throw rule`; sibling 1 `PIC-66 theta/runtime/internal-error`; sibling 2 `theta/runtime/subagent-dispose-failure`. The PIC-66 clause the divergent token names requires routing to `theta/runtime/internal-error` (quoted above), so the token supports the siblings' posture, not the silence.
- Stated-rationale check: the inline token rationale covers not propagating, not not reporting. The function's doc comment (subagent-result-channel.ts:291-315) discusses when to kill and never says the throw is dropped on purpose. docs/bugs/0484-synthesised-exit-abandons-live-child-without-kill.md has no ruling on kill-throw reporting: `grep -n -i "throw" docs/bugs/0484-*.md` → 0 hits. The only test for this catch, tests/b0484-synthesised-exit-kills-and-child-aborts.test.ts:175-191, asserts that `clock.advance` does not throw and that the settlement arrives. It does not assert that no diagnostic is emitted, so the silence is not pinned.
- Sibling-reality check: both sibling catches are on live production paths (`attachSubagentCancellation` for PIC-66 forwarding, `killChild` in the PIC-65 bounded teardown), and the divergent site is reached from production through production-result-channel.ts:213.

## Triage
verdict: confirmed — re-verified: subagent-result-channel.ts:320-329 traps the backend `placed.kill()` throw on the heartbeat-silence/channel-closed settlement with `void killError` (no sink, no diagnostic), while subagent-json-driver.ts:378-393 (PIC-66 cancel kill → internal-error) and subagent-isolation.ts:248-254 (PIC-65 teardown kill → subagent-dispose-failure) emit for the same throw, which reaches them through the adapter's own kill() try/finally at :356-362. All three stated searches reproduce (2, 4, 2 hits; 0484 doc has 0 "throw" hits), and the b0484 test at :175-191 does not pin the silence. The anchor holds: the site's own token cites the PIC-66 kill-throw rule, and subagent.md:277 requires routing through `theta/runtime/internal-error`. The PIC-65 teardown paragraph (subagent.md:259), which places the abandonment kill under teardown, also requires logging a kill-call throw. The token's rationale covers only non-propagation. The fix aligns the site to the anchored internal-error routing and keeps the settlement unconditional (triage: claude-opus-5-5)
