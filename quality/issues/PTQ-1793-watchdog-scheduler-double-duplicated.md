---
id: PTQ-1793
title: The watchdog unit and composition tests independently implement the same ticking scheduler double.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/subagent-parent-watchdog.test.ts:108-156
  - tests/subagent-parent-watchdog-composition.test.ts:92-134
  - tests/helpers/inert-parent-watchdog.ts:16-25
sites: 2
fix_scope: cross-module
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# The watchdog unit and composition tests independently implement the same ticking scheduler double.

## Observation
The unit suite's `makeRig` and the composition suite's `makeSchedulerRig` each implement interval registration, cleared-timer tracking, a manual tick over uncleared intervals, mutable parent liveness, and stderr/exit recording. There are two copies in these scoped files. Their differences are the timer's ID/unref-count representation and whether probed pids are recorded. A shared recording-watchdog fixture naturally belongs under `tests/helpers/`; the existing inert-watchdog helper does not implement ticking or recording.

## Evidence
Copy 1 — `tests/subagent-parent-watchdog.test.ts:108-122`:
```ts
function makeRig(): WatchdogRig {
  let nextId = 1;
  const rig: WatchdogRig = {
    intervals: [],
    cleared: [],
    probed: [],
    stderr: [],
    ended: [],
    liveness: "alive",
    tick: (): void => {
      for (const interval of rig.intervals) {
        if (!rig.cleared.includes(interval.timer)) {
          interval.callback();
        }
      }
```
`tests/subagent-parent-watchdog.test.ts:131-145`:
```ts
        setInterval: (callback: () => void, ms: number): WatchdogTimer => {
          const timer: FakeTimer = {
            id: nextId++,
            unrefCalls: 0,
            unref: (): FakeTimer => {
              timer.unrefCalls += 1;
              return timer;
            },
          };
          rig.intervals.push({ callback, ms, timer });
          return timer;
        },
        clearInterval: (timer: WatchdogTimer): void => {
          rig.cleared.push(timer as FakeTimer);
        },
```
`tests/subagent-parent-watchdog.test.ts:125-129`:
```ts
      ownPid: OWN_PID,
      probe: (pid: number): ParentLiveness => {
        rig.probed.push(pid);
        return rig.liveness;
      },
```
`tests/subagent-parent-watchdog.test.ts:147-152`:
```ts
      writeStderr: (text: string): void => {
        rig.stderr.push(text);
      },
      endProcess: (code: number): void => {
        rig.ended.push(code);
      },
```

Copy 2 — `tests/subagent-parent-watchdog-composition.test.ts:92-105`:
```ts
function makeSchedulerRig(): SchedulerRig {
  const rig: SchedulerRig = {
    intervals: [],
    unrefs: [],
    cleared: [],
    stderr: [],
    ended: [],
    liveness: "alive",
    tick: (): void => {
      for (const interval of rig.intervals) {
        if (!rig.cleared.includes(interval.timer)) {
          interval.callback();
        }
      }
```
`tests/subagent-parent-watchdog-composition.test.ts:108-122`:
```ts
      ownPid: OWN_PID,
      probe: (): "alive" | "gone" => rig.liveness,
      scheduler: {
        setInterval: (callback: () => void, ms: number): WatchdogTimer => {
          const timer: WatchdogTimer = {
            unref: (): WatchdogTimer => {
              rig.unrefs.push(timer);
              return timer;
            },
          };
          rig.intervals.push({ callback, ms, timer });
          return timer;
        },
        clearInterval: (timer: WatchdogTimer): void => {
          rig.cleared.push(timer);
```
`tests/subagent-parent-watchdog-composition.test.ts:125-130`:
```ts
      writeStderr: (text: string): void => {
        rig.stderr.push(text);
      },
      endProcess: (code: number): void => {
        rig.ended.push(code);
      },
```

Related helper, not a third counted copy — `tests/helpers/inert-parent-watchdog.ts:16-25`:
```ts
    ownPid: process.pid,
    probe: (): "alive" => "alive",
    scheduler: {
      setInterval: () => ({ unref: (): void => {} }),
      clearInterval: (): void => {},
    },
    writeStderr: (): void => {},
    endProcess: (): void => {},
  };
}
```

## Why this is a problem
This is D7 copy-paste-double duplication, not an objection to recording doubles. Both copies maintain the same scheduler state transitions and process-effect recorders, even though the tests differ in whether they enter through the watchdog API or the composition root. The identical tick/filter algorithm and registration/clear operations are harness mechanics rather than different behavioral expectations. The timer bookkeeping variations do not remove those duplicated mechanics.

## False-positive check
- Gate-pin: neither file is a census/inventory gate. Expected interval counts are behavioral assertions and are not the subject of this finding.
- Recording-double: the stderr, exit, and timer records are legitimate positive and MUST-NOT witnesses. Their repeated implementation, not those assertions' validity, is the smell.
- docs/bugs/ signature search: `rg -n 'teardownSawOpenChannel|marshals the STORED load-time closure hash|first compose dials|makeSchedulerRig|SchedulerRig|WatchdogRig' docs/bugs docs/reference/coverage-matrix.md` returned no matches. Bug 0493's witness list describes watchdog unit and composition behavior, not a documented correct-reason red requiring these duplicate fixtures.
- Coverage-matrix/bug-doc citation search: the file-family search found no coverage-matrix entry; bug 0493 names the unit suite and composition scenarios, and records their passing counts. No merge, rename, or deletion of those tests is proposed. Their different entry seams remain outside the claim.
- Helper check: `rg -n 'WatchdogRig|SchedulerRig|function (makeRig|makeSchedulerRig)' tests/helpers` returned no matches. The existing inert helper was read and is shown above: it cannot tick or record, so this is not a claim that either suite can simply substitute that helper unchanged.
- Prior-filing check: searching `makeSchedulerRig|WatchdogRig|SchedulerRig` across quality/intake, quality/issues, and quality/resolved found only the search descriptions in this shard's two earlier candidates, not a prior fixture-duplication report. File-name searches likewise found no prior watchdog-rig report.
- History check: `git log -3 --format='%h %s'` over this shard's watchdog/model/channel files included `d941f7df` (bug-0493 introduction) and `9d2592ed` (review round 1). Bug 0493's separate unit/composition witness purposes are consistent with the current files; no change to those purposes is requested.
- Coverage boundary: only existing fixture implementations are reviewed. This does not seek additional tests, combine suites, change production code, or allege a scheduler/runtime bug.

## Triage
verdict: confirmed — Both live test rigs duplicate interval registration/clear tracking, the identical uncleared-interval tick loop, mutable liveness, and stderr/exit recording; timer-bookkeeping differences do not change those mechanics, and no existing helper or resolved PTQ prescribes this duplication. (triage: claude-opus-5-5)
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
