// RFC-0005 — production child-process host for the subagent drive.
//
// This module owns the two production collaborators the subagent launcher seam
// (`src/runtime/subagent-launcher.ts`) consumes against the real OS: the
// `ExecutableHost` snapshot the executable-resolution ladder reads
// (pi-integration-contract/subagent.md #subagent-executable-resolution) and a
// Windows-safe `SpawnFn` that spawns the child `pi` process with `child_process.
// spawn` (no `shell:true`), adapts its stdio to the strict-JSONL,
// LF-only-split `SubagentChildProcess` surface, and process-tree-kills it on
// teardown (`taskkill /PID <pid> /T /F` on win32, `SIGKILL` elsewhere — no POSIX
// signal on Windows).
//
// The ambient reads localised here (`process.execPath` / `process.argv` /
// `process.platform`, `child_process.spawn`, `node:fs` existence) are NOT on the
// banned-primitive list (`process.env` / `process.cwd` / timers / `Date` are);
// the one `process.env` read (full-environment inheritance is the RFC-0005
// credential mechanism) carries a same-line `allow-ambient` exemption.

import { spawn as nodeSpawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import type {
  ChildExitInfo,
  ExecutableHost,
  SpawnFn,
  SubagentChildProcess,
} from "../runtime/subagent-launcher";

/**
 * Build the `ExecutableHost` snapshot from the running process, for the
 * two-rung executable-resolution ladder. `process.argv` / `process.execPath` /
 * `process.platform` are not banned ambient primitives (only `process.env` /
 * `process.cwd` are), so they are read directly here at the composition root.
 */
export function createProductionExecutableHost(): ExecutableHost {
  return {
    argv1: process.argv[1],
    execPath: process.execPath,
    fileExists: (path: string): boolean => existsSync(path), // allow-sync: RFC-0005 executable-resolution ladder — a one-shot probe/spawn-time existence check, not event-loop I/O
    isGenericRuntime: (execPath: string): boolean => {
      // The rung-2 gate: a generic runtime (`node` / `bun`) is not itself Pi, so
      // rung 2 cannot treat `execPath` as the child `pi` binary.
      const name = basename(execPath).toLowerCase().replace(/\.exe$/, "");
      return name === "node" || name === "bun";
    },
  };
}

/**
 * The parent environment inherited by every subagent child (full inheritance is
 * the RFC-0005 credential mechanism — credentials are never marshalled). Sourced
 * once at the composition root.
 */
export function readParentEnv(): Readonly<Record<string, string | undefined>> {
  return process.env; // allow-ambient: process.env — RFC-0005 subagent full-env inheritance
}

/** The parent process id carried to the child (orphan-prevention watchdog / depth counter). */
export function readParentPid(): number {
  return process.pid;
}

/**
 * RFC-0006 (PIC-60). The production params-channel filesystem seam. `writeTempFile`
 * writes the canonical params JSON to a fresh 0600 temp file (owner-only) in a
 * private temp directory and returns its path; `unlink` deletes it (the parent's
 * `finally` backstop); `readFile` is the child-side read of the marshalled path.
 * Windows-safe: `mkdtempSync` + `writeFileSync` with an explicit `mode`, no shell.
 */
export function createProductionParamsFs(): {
  writeTempFile: (contents: string, mode: number) => string;
  unlink: (path: string) => void;
  readFile: (path: string) => string;
} {
  return {
    writeTempFile: (contents: string, mode: number): string => {
      // A per-invocation private directory avoids name collisions under `par for`
      // fan-out; the 0600 file mode keeps the brief on-disk param exposure owner-only.
      const dir = mkdtempSync(join(tmpdir(), "pi-theta-params-")); // allow-sync: RFC-0006 one-shot params temp-file write, not event-loop I/O
      const path = join(dir, "params.json");
      writeFileSync(path, contents, { mode }); // allow-sync: RFC-0006 one-shot params temp-file write
      return path;
    },
    unlink: (path: string): void => {
      // Best-effort backstop delete; the child already deleted on read on the
      // normal path, so a missing file here is expected and non-fatal.
      try {
        unlinkSync(path); // allow-sync: RFC-0006 one-shot params temp-file cleanup
      } catch (unlinkError: unknown) { // allow-broad-catch: PIC-60 temp-file backstop — pi-integration-contract/subagent.md
        void unlinkError;
      }
    },
    readFile: (path: string): string => readFileSync(path, "utf8"), // allow-sync: RFC-0006 one-shot params temp-file read
  };
}

/**
 * RFC-0006 (PIC-59). The production child-side envelope writer: emit the single
 * `theta_result` JSONL line on the child's stdout, alongside the `--mode json`
 * event stream. Same-process write serialisation guarantees the reserved-key
 * line cannot be split mid-write. `process.stdout.write` is not a banned ambient
 * primitive here (it is neither `process.env` / `process.cwd` nor a timer/Date).
 */
export function createProductionEnvelopeWriter(): (line: string) => void {
  return (line: string): void => {
    process.stdout.write(line); // allow-ambient: RFC-0006 PIC-59 child-side return envelope on stdout
  };
}

/** Whether the host is Windows (selects the process-tree kill strategy; no POSIX signals on win32). */
function isWindows(): boolean {
  return process.platform === "win32";
}

/**
 * The minimal Node `ChildProcess` subset this seam drives (adapted by
 * `adaptChild` to the `SubagentChildProcess` handle). LF-only line splitting on
 * stdout/stderr matches the strict-JSONL framing (`docs/rpc.md`).
 */
interface NodeChildLike {
  readonly pid?: number;
  readonly stdin: { write(data: string): void; end(): void; destroy?(): void } | null;
  readonly stdout:
    | { on(event: "data", listener: (chunk: unknown) => void): void; destroy?(): void }
    | null;
  readonly stderr:
    | { on(event: "data", listener: (chunk: unknown) => void): void; destroy?(): void }
    | null;
  // RFC-0006 (PIC-59): the drive's terminal signal is wired off `'close'`, NOT
  // `'exit'`. Node's `'exit'` can fire BEFORE the final stdout chunk — the
  // `theta_result` envelope line — has been delivered, so recording the terminal
  // signal off `'exit'` could mis-map a SUCCESSFUL invocation to
  // exit-without-envelope. `'close'` fires only after every stdio stream has
  // reached EOF, so by the time it fires the envelope line has already been
  // pumped through `onStdoutLine`.
  on(event: "close", listener: (code: number | null, signal: string | null) => void): void;
  kill(signal?: string): void;
}

/**
 * Adapt a Node `ChildProcess` to the `SubagentChildProcess` handle. Exported for
 * the ordering-contract test (`tests/subagent-json-driver.test.ts`) that pins
 * the `'close'`-not-`'exit'` terminal-signal rule against a fake node child;
 * production only reaches it via `createProductionSpawnFn`.
 */
export function adaptChild(child: NodeChildLike): SubagentChildProcess {
  // LF-only line buffers per stream (strict-JSONL framing; a trailing CR is left
  // for the wire parser to trim).
  const makeLinePump = (
    source: { on(event: "data", listener: (chunk: unknown) => void): void } | null,
  ): ((listener: (line: string) => void) => () => void) => {
    let buffer = "";
    const listeners = new Set<(line: string) => void>();
    source?.on("data", (chunk: unknown) => {
      buffer += String(chunk);
      let idx: number;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (line.length === 0) {
          continue;
        }
        // Snapshot: a listener may unsubscribe from within its own callback
        // (a per-query reader detaches on settle), so iterate a copy.
        for (const listener of [...listeners]) {
          listener(line);
        }
      }
    });
    // Return an unsubscribe handle so consumers detach on settle (no O(queries)
    // listener accumulation on a long-lived child).
    return (listener: (line: string) => void): (() => void) => {
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
      };
    };
  };

  const onStdoutLine = makeLinePump(child.stdout);
  const onStderrLine = makeLinePump(child.stderr);

  // RFC-0006 (PIC-59): under `--mode json -p`, the child exits right after
  // emitting its return envelope (one invocation per process), so teardown
  // typically runs AFTER the child already closed. The terminal signal is
  // recorded off the child `'close'` event — which fires only after ALL stdio
  // streams reach EOF — rather than `'exit'`: Node may deliver the final stdout
  // chunk (the `theta_result` envelope line) AFTER `'exit'`, so a `'exit'`-driven
  // terminal signal would race the envelope and mis-map a successful invocation
  // to exit-without-envelope. By `'close'` the envelope has already been pumped
  // through `onStdoutLine`. Record the close once and REPLAY it to a late
  // `onExit` subscriber, so the PIC-9 teardown short-circuits on an
  // already-closed child instead of waiting the full bounded-await budget.
  let exitInfo: ChildExitInfo | undefined;
  const exitListeners = new Set<(info: ChildExitInfo) => void>();
  child.on("close", (code, signal) => {
    exitInfo = { code, signal };
    for (const listener of [...exitListeners]) {
      listener(exitInfo);
    }
  });

  return {
    pid: child.pid,
    writeStdin: (data: string): void => {
      child.stdin?.write(data);
    },
    closeStdin: (): void => {
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
    kill: (): void => {
      const pid = child.pid;
      // PIC-9 teardown-budget precedent: a killed child whose stdout never
      // reaches EOF (e.g. a grandchild inherited the stdout pipe on POSIX) would
      // keep the child `'close'` event from firing and hang the drive. Destroy
      // our end of the stdio pipes on the kill path so they reach EOF and
      // `'close'` fires deterministically — the bounded fallback that keeps a
      // killed child from wedging the drive.
      const destroyPipes = (): void => {
        child.stdin?.destroy?.();
        child.stdout?.destroy?.();
        child.stderr?.destroy?.();
      };
      if (isWindows() && pid !== undefined) {
        // Windows process-tree kill: `taskkill /PID <pid> /T /F` (no shell, no
        // POSIX signal). Best-effort — a failure to spawn taskkill falls back to
        // the direct kill below.
        try {
          const killer = nodeSpawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
            shell: false,
          });
          // An ASYNC spawn error (e.g. taskkill missing / EPERM) is emitted on
          // the child process's `error` event AFTER `spawn` returns; without a
          // handler Node re-raises it as an unhandled exception. Attach a
          // swallowing handler — the direct-kill fallback below already covers
          // the failure, and a teardown kill failure is advisory only (PIC-9).
          killer.on("error", () => {});
          destroyPipes();
          return;
        } catch (killError: unknown) { // allow-broad-catch: taskkill spawn failure falls back to direct kill — pi-integration-contract/subagent.md
          void killError;
        }
      }
      child.kill("SIGKILL");
      destroyPipes();
    },
  };
}

/**
 * The production `SpawnFn` — spawns the child `pi` process with `child_process.
 * spawn` and no shell (Windows-safe argv, no quoting hazard), inheriting the
 * forwarded `cwd` and the assembled child `env`, with `stdio: ["pipe","pipe",
 * "pipe"]` for the RPC stdin/stdout/stderr wire.
 */
export function createProductionSpawnFn(): SpawnFn {
  return (execPath, args, options) => {
    const child = nodeSpawn(execPath, [...args], {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return adaptChild(child as unknown as NodeChildLike);
  };
}
