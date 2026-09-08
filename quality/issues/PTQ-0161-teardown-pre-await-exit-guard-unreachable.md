---
id: PTQ-0161
title: runSubagentChildTeardown's pre-await `if (exited) return` branch is annotated as the production normal path, but the production child adapter replays exit on a microtask so the flag is always false at that synchronous check
lens: D2
status: open
verdict: confirmed
locations:
  - src/runtime/subagent-isolation.ts:223-227
  - src/runtime/subagent-isolation.ts:192-207
  - src/runtime/subagent-isolation.ts:244-246
  - src/extension/production-subagent-host.ts:384-401
sites: 4
fix_scope: localized
wave: qw20260908115521
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-08
---

# runSubagentChildTeardown's pre-await `if (exited) return` branch is annotated as the production normal path, but the production child adapter replays exit on a microtask so the flag is always false at that synchronous check

## Observation
`runSubagentChildTeardown` subscribes an `onExit` listener that sets a local
`exited` flag, calls `child.closeStdin()`, and then tests `if (exited)` and
returns early. The branch's comment states it handles "the normal path:
envelope → self-exit, replayed by the adapter". The only production
`SubagentChildProcess` implementation replays an already-recorded exit through
`queueMicrotask`, and its `closeStdin` is `child.stdin?.end()` on a child
spawned with stdin closed — so neither call can set `exited` synchronously, and
the flag is `false` at that check on every production path. The same function's
own doc comment describes the real mechanism correctly ("the bounded await
short-circuits on the adapter's replayed exit"), which is the fall-through
`Promise.race` plus its `if (exited || !timedOut) return;` a few lines below.

## Evidence
src/runtime/subagent-isolation.ts:223-227 — the branch and its annotation:

```ts
  if (exited) {
    // Child already exited (normal path: envelope → self-exit, replayed by the
    // adapter) — no kill, no timeout.
    return;
  }
```

src/runtime/subagent-isolation.ts:192-207 — the listener registration and the
advisory stdin release that precede it (the only two statements that could set
`exited` before the check):

```ts
  let exited = false;
  let resolveExit!: () => void;
  const exitObserved = new Promise<void>((resolve) => {
    resolveExit = resolve;
  });
  child.onExit(() => {
    if (exited) {
      return;
    }
    exited = true;
    deps.settleDisposeBarrier();
    resolveExit();
  });
```

src/extension/production-subagent-host.ts:384-401 — the sole production
`SubagentChildProcess`: `closeStdin` is a documented structural no-op, and
`onExit` defers an already-recorded exit to a microtask:

```ts
    closeStdin: (): void => {
      // Under the production spawn config (stdin "ignore", bug 0002) `child.
      // stdin` is null, so this is a structural no-op; residual teardown-path
      // callers (PIC-65) stay idempotent and throw-free by construction.
      child.stdin?.end();
    },
    onStdoutLine,
    onStderrLine,
    onExit: (listener: (info: ChildExitInfo) => void): void => {
      if (exitInfo !== undefined) {
        // Already exited — replay on the next microtask so the subscriber's own
        // synchronous setup completes first (mirrors event-emitter ordering).
        const info = exitInfo;
        queueMicrotask(() => listener(info));
        return;
      }
      exitListeners.add(listener);
    },
```

src/runtime/subagent-isolation.ts:244-246 — the post-race guard that actually
serves the production normal path (the race's `exitObserved` arm resolves on the
replay microtask, so `timedOut` is `false`):

```ts
  if (exited || !timedOut) {
    return;
  }
```

`grep -rn "closeStdin" src extensions --include=*.ts` returns three lines:
the interface declaration (`src/runtime/subagent-launcher.ts:532`), the call
site under review (`src/runtime/subagent-isolation.ts:218`), and the single
production implementation (`src/extension/production-subagent-host.ts:384`).
There is no second production `SubagentChildProcess`.

## Why this is a problem
The annotation is load-bearing narration on a control-flow branch: it tells a
reader that this early return is the path a real teardown takes, and that the
bounded await below is the exceptional case. The production adapter's
`queueMicrotask` replay (added deliberately, with its own comment: "replay on
the next microtask so the subscriber's own synchronous setup completes first")
makes the opposite true — every production teardown, normal or wedged, reaches
the `Promise.race`, and the branch's stated subject is handled 20 lines lower by
`if (exited || !timedOut)`. The same function's own doc comment already states
the correct mechanism, so the file carries two mutually inconsistent accounts of
which construct short-circuits the normal path. Separately, the branch's guard
condition is a strict subset of the post-race guard's (`exited` vs `exited ||
!timedOut`), so the annotation is the only thing distinguishing it.

## Suggested direction (non-binding, optional)
The branch's comment could be restated to name the case it actually
covers — a `SubagentChildProcess` whose `onExit` fires synchronously, which the
test doubles supply — rather than the production normal path, so the file stops
disagreeing with `runSubagentChildTeardown`'s own doc comment about which
construct short-circuits.

## False-positive check
- Reference searches for the implementations that could reach the branch:
  `grep -rn "closeStdin" src extensions --include=*.ts` (three hits, listed
  above) and `grep -rn "closeStdin\|onExit" tests/helpers/fake-json-child.ts`
  — the fake's `closeStdin` calls `#fireExit` synchronously when
  `exitOnStdinEof` is set (`tests/helpers/fake-json-child.ts:145-153`,
  `:198-202`), so the branch IS reachable from `tests/subagent-isolation.test.ts`.
  It is therefore NOT filed as dead code; the filed claim is only that its
  stated production-normal-path justification does not hold.
- Production reachability: `src/extension/production-theta-producer.ts:2687` is
  the single production call site of `runSubagentChildTeardown`
  (`grep -rn "runSubagentChildTeardown" src --include=*.ts`), and it passes the
  child produced by `createProductionSpawnFn`, i.e. the adapter cited above.
- Spawn config: `grep -n '"ignore"' src/extension/production-subagent-host.ts`
  returns `:465` (`stdio: ["ignore", "pipe", "pipe"]`) inside the production
  `SpawnFn`, matching the adapter comment's own claim that `child.stdin` is null.
- Re-export / dynamic access: `grep -rn "subagent-isolation" src tests
  --include=*.ts` shows no barrel re-export of the teardown, and no string-keyed
  access to `runSubagentChildTeardown`.
- git-history intent check: the branch comment names "replayed by the adapter",
  and the adapter's replay is microtask-deferred with its own explanatory
  comment, so the two were written against different assumptions about replay
  timing rather than the branch being a deliberate no-op placeholder.

## Triage
verdict: confirmed — reproduced independently: production `adaptChild` replays exit via `queueMicrotask` (production-subagent-host.ts:392-401) and `closeStdin` no-ops under `stdio: ["ignore",...]` (:465, reached via production-composition.ts:883 → :467), so `exited` is provably false at subagent-isolation.ts:223, and `git log -S` shows the branch's original stdin-EOF rationale was retired by bug-0002 (21937ef5) then relabelled with a production-normal-path claim the microtask replay (4866d4d2) and the function's own doc comment (:174-176) both contradict — in-scope stale narration, not a deadness filing (triage: claude-opus-5)
