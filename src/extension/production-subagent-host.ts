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
import { existsSync } from "node:fs";
import { basename } from "node:path";
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

/** Whether the host is Windows (selects the process-tree kill strategy; no POSIX signals on win32). */
function isWindows(): boolean {
  return process.platform === "win32";
}

/**
 * Adapt a Node `ChildProcess` (or the minimal subset this seam drives) to the
 * `SubagentChildProcess` handle. LF-only line splitting on stdout/stderr matches
 * the strict-JSONL RPC framing (`docs/rpc.md`).
 */
interface NodeChildLike {
  readonly pid?: number;
  readonly stdin: { write(data: string): void; end(): void } | null;
  readonly stdout: { on(event: "data", listener: (chunk: unknown) => void): void } | null;
  readonly stderr: { on(event: "data", listener: (chunk: unknown) => void): void } | null;
  on(event: "exit", listener: (code: number | null, signal: string | null) => void): void;
  kill(signal?: string): void;
}

function adaptChild(child: NodeChildLike): SubagentChildProcess {
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
      child.on("exit", (code, signal) => listener({ code, signal }));
    },
    kill: (): void => {
      const pid = child.pid;
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
          return;
        } catch (killError: unknown) { // allow-broad-catch: taskkill spawn failure falls back to direct kill — pi-integration-contract/subagent.md
          void killError;
        }
      }
      child.kill("SIGKILL");
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
