---
id: PTQ-1549
title: createProductionSpawnFn attaches no `error` listener to the spawned child pi process, while both sibling nodeSpawn sites in production-subagent-host.ts handle the async spawn `error` event
lens: D6
status: open
verdict: confirmed
locations:
  - src/extension/production-subagent-host.ts:598-608
  - src/extension/production-subagent-host.ts:382-400
  - src/extension/production-subagent-host.ts:545-575
  - src/extension/production-subagent-host.ts:450-466
  - src/runtime/subagent-launcher.ts:556-566
sites: 5
fix_scope: cross-module
d6_class: posture-divergence
d6_anchor: "docs/spec_topics/pi-integration-contract/subagent.md:267 — \"**Spawn failure** (ENOENT, EPERM, immediate exit) routes as an unanticipated SDK reject does: `theta/runtime/internal-error`, no child to tear down, plus a dedicated `theta/runtime/subagent-spawn-failed` for operator triage.\""
wave: qw20260928060032
reported_by: lens-d6-errorposture (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# createProductionSpawnFn attaches no `error` listener to the spawned child pi process, while both sibling nodeSpawn sites in production-subagent-host.ts handle the async spawn `error` event

## Observation
`src/extension/production-subagent-host.ts` calls `node:child_process` `spawn` (imported as `nodeSpawn`) at three sites. Two of them attach a listener for the child's `error` event: the `exec` placement command runner rejects its promise with the error, and the Windows `taskkill` spawn swallows it with a comment explaining why the listener is needed. The third site, `createProductionSpawnFn` (the `pipe` placement's spawn of the child `pi` process), attaches no `error` listener. `adaptChild` subscribes only to `close`, and the `NodeChildLike` surface it adapts declares no `error` event at all. The runtime caller (`launchSubagentChild`) routes spawn failure to `theta/runtime/subagent-spawn-failed` only when `place()`/`spawn` *throws* synchronously. Node reports ENOENT/EACCES spawn failures asynchronously on the `error` event, not as a synchronous throw, so on the pipe path they never reach that catch.

## Evidence
**Divergent side: pipe spawn, no `error` listener.** `src/extension/production-subagent-host.ts:598-608`
```ts
export function createProductionSpawnFn(): SpawnFn {
  return (execPath, args, options) => {
    const child = nodeSpawn(execPath, [...args], {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return adaptChild(child as unknown as NodeChildLike);
  };
}
```
The adapted surface has no `error` member, so `adaptChild` has nothing to subscribe to. `src/extension/production-subagent-host.ts:382-400` (excerpt):
```ts
interface NodeChildLike {
  readonly pid?: number;
  readonly stdin: { end(): void; destroy?(): void } | null;
  ...
  on(event: "close", listener: (code: number | null, signal: string | null) => void): void;
  kill(signal?: string): void;
}
```

**Sibling 1: `exec` placement command runner, `error` → reject.** `src/extension/production-subagent-host.ts:545-575` (excerpt):
```ts
        const child = nodeSpawn(command, args, {
          cwd: options.cwd,
          env: { ...options.env },
          shell: false,
          stdio: ["ignore", "pipe", "pipe"],
        });
        ...
        child.on("error", (error: Error) => {
          options.signal.removeEventListener("abort", onAbort);
          reject(error);
        });
```
The rejection reaches `placeSubagentChild`'s `// allow-broad-catch: theta/runtime/subagent-spawn-failed` catch (src/runtime/subagent-place.ts:119-123), which emits `spawnFailedDiagnostic` and returns `reason: "spawn-failed"`.

**Sibling 2: `taskkill` spawn, `error` listener with the stated reason.** `src/extension/production-subagent-host.ts:450-466` (excerpt):
```ts
      const killer = nodeSpawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
        shell: false,
      });
      // An ASYNC spawn error (e.g. taskkill missing / EPERM) is emitted on
      // the child process's `error` event AFTER `spawn` returns; without a
      // handler Node re-raises it as an unhandled exception. Attach a
      // swallowing handler — the direct-kill fallback below already covers
      // the failure, and a teardown kill failure is advisory only (PIC-65).
      killer.on("error", () => {});
```

**The consumer that expects a synchronous throw.** `src/runtime/subagent-launcher.ts:556-566`:
```ts
    return { ok: true, child: placed.process, placed };
  } catch (spawnError: unknown) { // allow-broad-catch: theta/runtime/subagent-spawn-failed — pi-integration-contract/subagent.md
    // A spawn throw (ENOENT/EPERM/immediate exit) records the operator-triage
    // diagnostic here; the caller additionally routes it through the
    // runtime-defect surface via `routeSubagentSpawnFailure`.
    deps.emitDiagnostic(spawnFailedDiagnostic(spawnError, request, prepared.execPath));
    return { ok: false, reason: "spawn-failed" };
```

**Anchor (quoted verbatim).** `docs/spec_topics/pi-integration-contract/subagent.md:267`: "**Spawn failure** (ENOENT, EPERM, immediate exit) routes as an unanticipated SDK reject does: `theta/runtime/internal-error`, no child to tear down, plus a dedicated `theta/runtime/subagent-spawn-failed` for operator triage."

**Mechanism check (run this session, in a mktemp dir).** A Node v24.16.0 script ran `spawn(process.execPath, ["-e","1"], { cwd: "Z:/definitely/not/here", shell: false, stdio: ["ignore","pipe","pipe"] })` inside `try` with only a `close` listener. Output: `returned; sync threw = false`, then `throw er; // Unhandled 'error' event` / `Error: spawn C:\Program Files\nodejs\node.exe ENOENT`, exit status 1. The spawn did not throw synchronously, and the unlistened `error` event ended the process.

**Searches (run this session).**
- `grep -n 'nodeSpawn(' src/extension/production-subagent-host.ts`: 3 hits (lines 453, 545, 600).
- `grep -c 'on("error"' src/extension/production-subagent-host.ts`: 2 (lines 461, 568). Neither is on the line-600 child.
- `grep -rn "on(\"error\"\|on('error'" src --include=*.ts`: 6 hits. None is in `adaptChild`, `createProductionSpawnFn`, or `src/runtime/subagent-placement.ts` `createPipePlacementBackend` (lines 191-216, which only call `spawn(...)` and forward `onExit`/`kill`).

**Sibling-class argument.** All three sites call the same API (`nodeSpawn` from `node:child_process`, `shell: false`) in the same module. All three face the same failure class: a spawn failure that Node delivers asynchronously on the returned `ChildProcess`'s `error` event (ENOENT/EACCES; per the taskkill comment, "emitted … AFTER `spawn` returns"). The two siblings each handle that event: one fails closed into the `subagent-spawn-failed` route, the other degrades by design. The pipe spawn site leaves it unhandled.

## Why this is a problem
The spec anchor requires every spawn failure, ENOENT named first, to route to `theta/runtime/internal-error` plus `theta/runtime/subagent-spawn-failed`. The `exec` placement meets this through its `error` → `reject` listener. The pipe placement, the default `auto` fallback built at production-composition.ts:1265 (`createPipePlacementBackend(createProductionSpawnFn())`), has no listener. An ENOENT/EACCES spawn failure on that path never enters the launcher's `subagent-spawn-failed` catch, which only sees synchronous throws. The failure instead surfaces as Node's unhandled `error` event, which the taskkill site's own comment describes as "re-raises it as an unhandled exception". So for one failure class, the same module handles it at two spawn sites and leaves it unhandled at the third, and the unhandled site is the one the spec clause covers.

## Suggested direction (non-binding, optional)
Give the pipe-spawned child the same `error` handling its siblings have, and route it into the existing `theta/runtime/subagent-spawn-failed` / `internal-error` path the spec names. That path currently only understands synchronous throws, so either the synchronous `SpawnFn` contract or the pipe adapter needs a way to report an asynchronous spawn failure.

## False-positive check
- **EXST-9 / PIC-73 class check:** not applicable. Neither side is an execution-status sink call or producer hook (EXST-9), and child-process spawn is not an optional UI/entry capability (PIC-73's `OPTIONAL_UI_CAPABILITIES` is `ctx.ui.setWidget`, `pi.appendEntry`, `pi.registerEntryRenderer`, sdk-inventory.ts).
- **allow-broad-catch token check:** the cited catch at subagent-launcher.ts:561 carries `theta/runtime/subagent-spawn-failed — pi-integration-contract/subagent.md`, which is the same clause as the anchor. The taskkill catch at production-subagent-host.ts:464 carries `taskkill spawn failure falls back to direct kill`, which covers only the taskkill site. No token or comment exempts the pipe spawn.
- **Stated-rationale check:** the comments at 580-597 (`createProductionSpawnFn` doc: stdin "ignore", bug 0002) and 478-490 (`adaptChild`: `close` vs `exit`) explain which events are used for *termination*. Neither mentions the `error` event or states that it is left unhandled on purpose. `grep -rln "Unhandled 'error'\|unhandled .error. event\|error\` listener\|'error' listener\|error listener" docs/bugs` found 2 files (0312, 0313), both about the file watcher / chokidar, not subagent spawn. No bug doc rules on this site.
- **Sibling-reality check:** the siblings are live production paths. The exec runner is the `exec` placement's runner (subagent-exec-placement.ts:238 `deps.runner.run(...)`), and the taskkill spawn runs on every Windows teardown kill. The divergent site is live: production-composition.ts:1265 builds the pipe backend from it. `git log -S 'killer.on("error"'` → fda23a4b (RFC 0005). `git log -S 'child.on("error"'` → 70936846 (RFC 0012 exec backend). The pipe spawn has had no listener since the file was introduced.
- **Boundary routing:** not D2 (the path is reachable: a missing `cwd` directory reproduces ENOENT, shown above), not D8, not D4 (the three spawn sites are not copy-paste clones), not tests/.

## Triage
verdict: confirmed — I re-checked every excerpt and search. nodeSpawn is called at 453/545/600, and `on("error"` appears at only 461 (taskkill) and 568 (exec runner). createProductionSpawnFn:598-608 attaches no `error` listener, and adaptChild/NodeChildLike subscribe only to `close`. launchSubagentChild's subagent-spawn-failed catch (subagent-launcher.ts:561) catches synchronous throws only. The pipe backend is live (production-composition.ts:1265). A Node v24 probe I ran (missing cwd) printed `sync threw = false`, then an unhandled 'error' ENOENT crash. The anchor subagent.md:267 pins ENOENT to internal-error + subagent-spawn-failed, which the exec sibling meets through error→reject and the pipe site does not. No pin exempts the pipe site and no duplicate exists (triage: claude-opus-5-5)
