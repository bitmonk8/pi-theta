# Bug 0002 — Spawned subagent child never exits under `pi -p`; both child-spawning acceptance cases time out

- **Status:** fixed (0.12.0). Root cause confirmed by the dedicated
  investigation — [0002-investigation.md](./0002-investigation.md) — which
  upgraded the leading hypothesis below with one sharpening: the child did not
  merely fail to *exit* while its stdin pipe stayed open; it never **started**
  (pi's json/`-p` startup reads any non-TTY stdin to EOF *before* the argv
  prompt is processed, so parent-awaits-envelope ⇄ child-awaits-EOF was a
  startup deadlock).
- **Kind:** defect — a spawned subagent child does not reach its normal exit, so
  the parent never observes a `theta_result` envelope and the invocation resolves
  fail-closed instead of succeeding. The fail-closed disposition is correct; the
  child hang is the defect.
- **Affects:** the RFC 0006 child-process subagent path
  (`src/extension/production-subagent-host.ts` `createProductionSpawnFn`,
  `src/runtime/subagent-json-driver.ts`, `src/runtime/subagent-isolation.ts`,
  `src/runtime/subagent-launcher.ts`). Observed only through the opt-in H9a-T
  acceptance suite; the default, conformance, and live suites do not spawn a real
  child.
- **Platform:** observed on Windows. Whether it reproduces on Linux/macOS is
  **untested** — see *Open questions*.

## Fix (0.12.0)

Investigation Direction 1, adopted in full:

- **Primary fix** — `createProductionSpawnFn` spawns the child with stdin
  already closed (`stdio: ["ignore","pipe","pipe"]`), the same treatment the
  acceptance harness gives the outer `pi -p` process. The child starts
  immediately, emits its `theta_result` envelope, and exits 0 (~1 s wall).
- **Spec re-based on reality** — PIC-63 (stdin-close "grace signal") and
  PIC-9 (stdin-EOF-exit orphan premise) retired per GOV-8 and re-coined as
  PIC-66 (cancellation = abort → child kill — process-tree on Windows, direct
  SIGKILL elsewhere; the abort listener now kills) and PIC-65 (teardown =
  bounded await → kill; class-2 orphan
  prevention recorded honestly as unimplemented — the child-side parent-PID
  watchdog stays a recorded, unimplemented fallback with its env carriage in
  place). The `#subagent-cli-wire-pins` / version-bump audit items now pin the
  true behaviour: stdin-EOF = input-complete/**start**, never exit.
- **Defect 2 (child extension identity unpinned)** — the launcher honours an
  opt-in env knob (`PI_THETA_SUBAGENT_EXTENSION_PIN`, spec
  `#subagent-extension-pin`) that prefixes `-ne -e <dir>` onto the child argv;
  the acceptance harness sets it so the inner child binds the working tree's
  extension instead of a stale ambient build. Production default (ambient
  discovery) unchanged.
- **Regression guard in the default suite** —
  `tests/subagent-child-real-spawn.test.ts` spawns a REAL child through the
  production spawn path against a provider-free `mode: subagent` theta (pure
  tail expression, zero tokens) and asserts envelope + exit 0 within a bounded
  time, closing the fakes-only detection gap this report names.
- **Acceptance suite not re-run in this change** — the H9a-T suite is
  credentialed and token-burning, and post-fix verification of cases (e)/(g)
  against a live provider is a later phase. The default-suite real-spawn test
  above validates the spawn/envelope/exit mechanism provider-free; the 10/10
  figure under *Reproduction* below is the recorded expectation, not a
  recorded run.

## Summary

`npm run test:acceptance` (the H9a-T non-interactive `pi -p` real-host suite)
fails 2 of 10 cases. Both failures are the **only two cases in the suite that
spawn a subagent child process**; the other eight pass. Each fails by exhausting
the suite's 180 s `testTimeout` rather than by an assertion.

- **(e) `H9a-T (e) subagent spawn drives to a success terminal`** —
  `tests/acceptance/noninteractive-acceptance.test.ts` (fixture
  `tests/acceptance/fixtures/acc-subagent-success.theta`, `mode: subagent`, so
  the top-level invocation itself spawns a child).
- **(g) `H9a-T (g) imports / invoke across thetas`** — fixture
  `tests/acceptance/fixtures/acc-imports-invoke.theta` (`mode: prompt`) whose
  `invoke("./acc-child.theta")` targets a `mode: subagent` callee
  (`acc-child.theta`), spawning a child.

The correlation is exact: spawn a child → hang; do not spawn a child → pass.

## Expected behaviour

Per [PIC-58 / PIC-59](../spec_topics/pi-integration-contract/subagent.md), a
subagent-mode invocation spawns `pi --theta <dirs> --mode json -p "/<slug>"
--no-session`, the child runs the whole callee theta, writes a one-line
`theta_result` envelope to file descriptor 1, and **exits**. The parent reads the
envelope off the child's stdout and lowers it to the invocation result. Both
acceptance cases should then reach a no-error exit emitting only permitted
diagnostic codes.

## Actual behaviour

The child does not reach a normal exit. The parent's wait for the envelope never
resolves, the whole `pi -p` run stalls, and vitest kills the case at 180 s.

Observed by the reviewer who found this, reproducing outside vitest:

- the spawned child exits **143** (`128 + SIGTERM`) — i.e. it was killed, not
  self-terminated;
- **no `theta_result` envelope** reached the parent;
- the parent emitted `theta/runtime/subagent-child-crashed` and
  `theta/runtime/subagent-exit-without-envelope`;
- the theta correctly surfaced
  `Err(InvokeInfraError { cause: "internal_error", … })` — fail-closed, no
  fabricated value, exactly as
  [PIC-59](../spec_topics/pi-integration-contract/subagent.md#pic-59) requires;
- the outer `pi -p` process then **never exited** on its own.

Exit 143 is consistent with the parent's own teardown firing: PIC-63 cancellation
/ teardown is stdin-pipe close, then a bounded grace, then a process-tree kill
(`src/runtime/subagent-isolation.ts:196-215`). On that reading the child is a
victim of the kill, not the origin of the failure — it was still alive and
waiting when teardown ran.

## Not a regression of the 0.11.0 change

Reproduced **byte-identically from a pristine `HEAD` checkout** (`git archive
HEAD` into a temporary directory with a `node_modules` junction, same command,
same diagnostics, same hang) at the commit *before* the bug-0001 /
v0.11.0 work. The defect predates that change and is unrelated to it.

Note also that this is not the defect fixed in 0.10.0. That fix (envelope writes
routed to `fs.writeSync(1, …)` because Pi's non-interactive output guard
reassigns `process.stdout.write` to stderr under `--mode json`) was validated by
a targeted prototype, not by this acceptance suite — so it closed a real hole
without exercising the path this bug reports.

## Leading hypothesis (UNCONFIRMED)

**The child is a `-p` process holding an open stdin pipe, so it blocks waiting
for EOF and never terminates.**

Two facts line up:

1. The production spawn gives the child an open stdin pipe —
   `src/extension/production-subagent-host.ts:298-306`:

   ```
   stdio: ["pipe", "pipe", "pipe"],
   ```

2. The acceptance harness discovered and documented exactly this failure mode for
   the **outer** `pi -p` process it spawns, and worked around it —
   `tests/acceptance/harness.ts:414-419`:

   > Close the child's stdin: `pi -p` in non-interactive print mode reads its
   > prompt from argv, but an OPEN inherited stdin pipe leaves it waiting for EOF
   > and the process-and-exit run never terminates. `"ignore"` gives the child an
   > already-closed stdin so it exits after emitting its output.

The inner subagent child is also a `pi … -p` process, and it is **not** given
that treatment.

Reinforcing this: nothing closes the child's stdin on the **normal** path.
`closeStdin()` is reachable from only two sites, both after the fact:

- `src/runtime/subagent-json-driver.ts:210-246` — bound to the `thetaAbort`
  signal, i.e. the **cancellation** path only;
- `src/runtime/subagent-isolation.ts:196-200` — the **teardown** path, which runs
  after the invocation has already settled or been disposed.

So on an uncancelled run the sequence is plausibly: spawn with open stdin →
parent awaits the envelope → child waits on stdin EOF → deadlock → teardown
eventually closes stdin and process-tree kills → exit 143, no envelope →
fail-closed `Err`.

Tension to resolve before acting on this: PIC-63 makes the parent-held stdin pipe
the *graceful shutdown channel*, so the pipe existing is deliberate. If the
hypothesis holds, the fix is about **when** it is closed (immediately after
spawn, since the child needs no stdin input) rather than **whether** it exists —
but that must be checked against PIC-63's cancellation contract, because closing
stdin at spawn time would remove the signal PIC-63 later relies on.

## Open questions for the investigator

1. **Does the child block before or after writing its envelope?** "Exits 143
   without an envelope" suggests before, but the alternative — the envelope is
   written and the parent's stdout scan misses it — is a different defect with a
   different fix. Instrument the child, or run the exact child argv by hand and
   watch fd 1.
2. **Is the stdin hypothesis actually correct?** Confirm directly: run the
   assembled child argv (`src/runtime/subagent-launcher.ts:206-232`) manually
   with stdin open vs. closed and compare.
3. **If stdin is the cause, how is it reconciled with PIC-63?** Closing at spawn
   removes the graceful-shutdown signal. Options to weigh: close immediately and
   re-base cancellation on the process-tree kill alone; keep the pipe but have
   the child not read stdin; or have the child exit on its own after emitting the
   envelope regardless of stdin.
4. **Why does the outer `pi -p` never exit either?** Is it blocked on the child,
   or is this a second independent hang? The harness already closes the outer
   process's stdin, so the same explanation cannot apply unchanged.
5. **Is it platform-specific?** Only Windows has been tested. Determine whether
   Linux/macOS reproduce; that decides whether this is a portability bug or a
   universal one.
6. **Why did no in-repo test catch it?** The default suite's child-process
   coverage is over fakes (`tests/production-host-loop-dispatch.test.ts`,
   `tests/subagent-root-drive-wiring.test.ts`, `tests/subagent-child-launch.test.ts`),
   which cannot observe a real child's exit behaviour. Consider whether a cheap
   real-spawn test (no provider, no tokens — e.g. a child whose theta emits an
   envelope with no query) belongs in the default suite as a regression guard.

## Reproduction

```
npm run test:acceptance
```

Requires a live provider and credentials (the suite spawns real `pi -p` runs and
burns tokens). Pre-fix (0.9.0–0.11.0, the observation this report records):
expect 8 passed, 2 failed — cases (e) and (g) — each at the 180 s timeout.
Post-fix (0.12.0): expect 10 passed — an expectation, not a recorded result
(see the *Fix* section's not-re-run note). Config:
`config/vitest/vitest.acceptance.config.ts`.

The suite is deliberately excluded from `npm test`, `npm run test:conformance`,
and `npm run test:live`, so this defect does not gate ordinary development.

## Why it matters

Subagent mode is the documented way to reach an isolated session with its own
callable set, and RFC 0006 makes the child process the sole execution path for
it. If a real spawned child cannot complete under `pi -p`, then every
subagent-mode invocation and every `invoke` of a subagent-mode callee fails
fail-closed on a real non-interactive host — while the entire default test suite
stays green, because it exercises that path only over fakes. The blast radius is
the whole subagent feature on the `-p` surface; the detection gap is the reason it
went unnoticed.

## Non-goals

- Not a request to change the fail-closed disposition. Mapping a missing envelope
  to `Err(InvokeInfraError { cause: "internal_error" })` with the exit detail is
  correct per PIC-59 and must stay.
- Not a request to weaken or skip the acceptance cases. They are reporting a real
  failure.
- Not about the 0.10.0 fd-1 envelope fix, which addressed a different hole on the
  same path.

## Prior art in this repository

- Child-process subagent design: [RFC 0005](../rfcs/0005-child-process-subagent-sessions.md),
  [RFC 0006](../rfcs/0006-child-process-theta-execution.md).
- Normative contract: `docs/spec_topics/pi-integration-contract/subagent.md`
  (PIC-58 subagent-root regime, PIC-59 return envelope, PIC-63 cancellation via
  stdin close + bounded grace + process-tree kill).
- Failure-class diagnostics: `docs/spec_topics/diagnostics/code-registry-runtime.md`
  (`theta/runtime/subagent-child-crashed`,
  `theta/runtime/subagent-exit-without-envelope`).
- Launch argv assembly: `src/runtime/subagent-launcher.ts:206-232`.
- Spawn + child adapter: `src/extension/production-subagent-host.ts`
  (`createProductionSpawnFn`, `adaptChild`, the fd-1 envelope writer at
  `:117-137`).
- Teardown / kill ladder: `src/runtime/subagent-isolation.ts:188-215`.
- The same stdin-EOF failure mode, already diagnosed and worked around one level
  up: `tests/acceptance/harness.ts:414-419`.

## Provenance

- Found during the bug-0001 / v0.11.0 implementation review, as an incidental
  pre-existing failure outside that change's scope.
- Reproduced from a pristine `HEAD` checkout (commit `3a84424e`) to establish it
  is not a regression of that work.
- Evidence in this report is the reviewer's measurement plus a static read of the
  spawn, driver, and teardown paths. **No dedicated investigation has been run.**
