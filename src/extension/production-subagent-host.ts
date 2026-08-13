// RFC-0005 — production child-process host for the subagent drive.
//
// This module owns the two production collaborators the subagent launcher seam
// (`src/runtime/subagent-launcher.ts`) consumes against the real OS: the
// `ExecutableHost` snapshot the executable-resolution ladder reads
// (pi-integration-contract/subagent.md #subagent-executable-resolution) and a
// Windows-safe `SpawnFn` that spawns the child `pi` process with `child_process.
// spawn` (no `shell:true`) — stdin already closed (`"ignore"`, bug 0002: pi's
// json/`-p` startup reads any non-TTY stdin to EOF before processing the argv
// prompt, so an open parent-held pipe deadlocks the pair) — adapts its stdio to
// the strict-JSONL, LF-only-split `SubagentChildProcess` surface, and
// process-tree-kills it on teardown (`taskkill /PID <pid> /T /F` on win32,
// `SIGKILL` elsewhere — no POSIX signal on Windows).
//
// The ambient reads localised here (`process.execPath` / `process.argv` /
// `process.platform`, `child_process.spawn`, `node:fs` existence) are NOT on the
// banned-primitive list (`process.env` / `process.cwd` / timers / `Date` are);
// the one `process.env` read (full-environment inheritance is the RFC-0005
// credential mechanism) carries a same-line `allow-ambient` exemption.

import { spawn as nodeSpawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent"; // allow-pi-surface: PIC#subagent-launch-contract — the host-identity signal selecting the child-argv flag dialect
import type {
  ChildExitInfo,
  ExecutableHost,
  SpawnFn,
  SubagentChildProcess,
} from "../runtime/subagent-launcher";
import {
  SUBAGENT_EXTENSION_PIN_ENV,
  SUBAGENT_INVOKE_DEPTH_ENV,
  SUBAGENT_PARENT_PID_ENV,
} from "../runtime/subagent-launcher";
import { SUBAGENT_ROOT_ENV_MARKER } from "../runtime/subagent-root-regime";
import { SUBAGENT_CALLABLE_HASHES_ENV } from "../runtime/subagent-callable-hash";
import {
  SUBAGENT_PARAMS_ENV,
  SUBAGENT_PARAMS_FILE_ENV,
} from "../runtime/subagent-params";

/**
 * Matches a path that lives inside a compiled binary's OWN embedded filesystem —
 * the single-file-executable virtual root Bun mounts. Such a path can be
 * `stat`ed by the running process and opened by NOBODY else, so it can never be a
 * child's entry script.
 *
 * The marker vocabulary is the host's own (`isBunBinary` in the host's config
 * module tests `$bunfs`, `~BUN`, and the URL-encoded `%7EBUN`), but it is ANCHORED
 * to the virtual ROOT rather than matched as a bare substring anywhere in the
 * path. Substring matching also rejected legitimate real paths that merely
 * contain a marker — an installation under a directory named `~BUNDLE`, say —
 * and a wrong rejection here is not harmless: it falls through to rung 2 and, under
 * a generic runtime, to a closed refusal that disables every subagent invocation.
 * The failure direction is safe but the failure is total, so the test is kept as
 * tight as the real forms allow: `/$bunfs/…` (POSIX), `<drive>:\~BUN\…` (Windows),
 * and either spelling of the encoded root when the value arrived as a URL.
 */
const EMBEDDED_FS_ROOT =
  /^(?:[\\/]|[A-Za-z]:[\\/]|file:\/\/[\\/]?)?(?:\$bunfs|~BUN|%7EBUN)[\\/]/i;

/**
 * Build the `ExecutableHost` snapshot from the running process, for the
 * two-rung executable-resolution ladder and the child-argv dialect. `process.argv`
 * / `process.execPath` / `process.platform` are not banned ambient primitives
 * (only `process.env` / `process.cwd` are), so they are read directly here at the
 * composition root.
 */
export function createProductionExecutableHost(): ExecutableHost {
  return {
    argv1: process.argv[1],
    execPath: process.execPath,
    // The host's own config-directory constant, read off the LOADED SDK module:
    // the child-argv dialect's host-identity signal (`resolveHostCliDialect`).
    //
    // A STATIC NAMED import, so a host build that does not publish this constant
    // fails to LINK rather than degrading — the extension does not load and emits
    // no theta diagnostic. That makes it a hard host requirement (a version
    // floor), not a soft capability. A namespace read would tolerate absence, but
    // this repo's inventory-closure audit classifies a namespace import of a peer
    // package as a non-exemptible family-(4) violation, deliberately, to keep the
    // consumed host surface a closed set; widening that classification is a
    // change to the compliance gate itself and belongs in its own change, not
    // here. `ExecutableHost.configDirName` stays OPTIONAL for the harness hosts
    // that legitimately state no identity.
    configDirName: CONFIG_DIR_NAME,
    fileExists: (path: string): boolean => {
      // Discharges the rung-1 obligation `resolveSubagentExecutable` documents:
      // the question is "could a CHILD open this?", not "can this process stat
      // it?". Under a compiled host binary `process.argv[1]` is a path inside the
      // executable's embedded filesystem, which `existsSync` reports as present
      // — answering `true` would select rung 1 and hand the child that path as a
      // stray positional argument instead of an entry script.
      if (EMBEDDED_FS_ROOT.test(path)) {
        return false;
      }
      return existsSync(path); // allow-sync: RFC-0005 executable-resolution ladder — a one-shot probe/spawn-time existence check, not event-loop I/O
    },
    isGenericRuntime: (execPath: string): boolean => {
      // The rung-2 gate: a generic runtime (`node` / `bun`) is not itself a host
      // CLI, so rung 2 cannot treat `execPath` as the child host binary.
      const name = basename(execPath).toLowerCase().replace(/\.exe$/, "");
      return name === "node" || name === "bun";
    },
  };
}

/**
 * The `PI_THETA_*` control-plane variables — the ones that steer THIS process's
 * behaviour rather than merely being passed along. Each is normally written by a
 * pi-theta parent at spawn and read by the child it spawned:
 *
 *   - the extension pin becomes `-e <path>`, i.e. "load this file as an extension";
 *   - the root marker puts the process into subagent-root regime (watcher
 *     suppression, in-process root drive, a machine envelope on fd 1);
 *   - the params carriers supply the callee's arguments and BYPASS the binder;
 *   - the invoke depth seeds the recursion ceiling;
 *   - the callable-hash map is the load-to-spawn tamper check.
 */
const CONTROL_PLANE_ENV_KEYS: readonly string[] = Object.freeze([
  SUBAGENT_EXTENSION_PIN_ENV,
  SUBAGENT_ROOT_ENV_MARKER,
  SUBAGENT_PARAMS_ENV,
  SUBAGENT_PARAMS_FILE_ENV,
  SUBAGENT_INVOKE_DEPTH_ENV,
  SUBAGENT_CALLABLE_HASHES_ENV,
  SUBAGENT_PARENT_PID_ENV,
]);

/**
 * The parent environment inherited by every subagent child (full inheritance is
 * the RFC-0005 credential mechanism — credentials are never marshalled), with the
 * control plane above ACCEPTED ONLY FROM A REAL PI-THETA PARENT.
 *
 * Those variables were designed on the assumption that only a pi-theta parent
 * writes them — the root marker is documented as "set ONLY by the parent launcher
 * and never authorable from a `.theta` file". That assumption holds for a `.theta`
 * file but not for the process environment on every host: a host may populate the
 * environment from files found in the working directory (Oh-My-Pi loads `<cwd>/.env`
 * before any provider lookup, and `PI_THETA_*` names match its key shape and are
 * normally unset). The environment is therefore not a channel this extension can
 * treat as parent-authored, and the variables it carries are load-bearing: they
 * select the process regime, supply callee arguments with the binder bypassed, and
 * name a file to load as an extension.
 *
 * The carriage is authenticated rather than trusted. A genuine child always carries
 * its launcher's pid, and that launcher IS its parent process, so
 * `PI_THETA_SUBAGENT_PARENT_PID` must equal this process's real `ppid` — a
 * per-run, externally-assigned value that a file written ahead of time cannot
 * state. On a mismatch (including the ordinary top-level case, where no launcher
 * wrote anything) the whole control plane is dropped and every value is re-derived
 * per launch, which is what the launcher already does: `buildSubagentChildEnv`
 * spreads its own markers LAST, so dropping an inherited value cannot disturb a
 * real spawn.
 *
 * This narrows the channel rather than closing it: a `ppid` is a small integer, so
 * a writer able to observe the live process tree could still match it. What it
 * removes is the write-a-file-and-wait case.
 */
export function readParentEnv(): Readonly<Record<string, string | undefined>> {
  return authenticateControlPlane(
    process.env, // allow-ambient: process.env — RFC-0005 subagent full-env inheritance
    process.ppid, // allow-ambient: process.ppid — the control-plane carriage check
  );
}

/**
 * Drop the control-plane variables unless `env` carries the pid of the process
 * that actually launched this one. Exported so the check is testable against a
 * planted environment without spawning anything.
 */
export function authenticateControlPlane(
  env: Readonly<Record<string, string | undefined>>,
  parentPid: number,
): Readonly<Record<string, string | undefined>> {
  if (env[SUBAGENT_PARENT_PID_ENV] === String(parentPid)) {
    return env;
  }
  const authenticated: Record<string, string | undefined> = { ...env };
  for (const key of CONTROL_PLANE_ENV_KEYS) {
    delete authenticated[key];
  }
  return authenticated;
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
 * `theta_result` JSONL line on the child's stdout (fd 1), alongside the
 * `--mode json` event stream.
 *
 * WHY fd 1 directly (not `process.stdout.write`): in `--mode json` / `-p` / rpc
 * Pi calls `takeOverStdout()` (core/output-guard.js, from main.js) at startup,
 * which REASSIGNS `process.stdout.write` to route to STDERR so stray extension
 * stdout cannot corrupt the event channel. Extension code loads AFTER that
 * takeover, so a `process.stdout.write(line)` here would land on stderr and the
 * envelope would NEVER reach the parent's stdout scan (the child's fd-1 pipe the
 * parent's `onStdoutLine` reader pumps) — a latent 0.9.0 bug the RFC-0006
 * prototype exposed. `fs.writeSync(1, line)` writes the file descriptor directly,
 * bypassing the reassignment, and is one atomic syscall per complete newline-
 * terminated line (so it cannot be split mid-write, nor split Pi's own async
 * fd-1 event writes) and Windows-safe (fd 1 is a valid handle on win32). Pi's own
 * event writer reaches fd 1 through its captured raw bind; both target the same
 * descriptor in the same process.
 *
 * `writeToFd` is injected (default: the real fd-1 write) so a test can pin the
 * mechanism over a fake without touching the real descriptor.
 */
export function createProductionEnvelopeWriter(
  writeToFd: (line: string) => void = defaultStdoutFdWrite,
): (line: string) => void {
  return (line: string): void => {
    writeToFd(line);
  };
}

/** The default fd-1 envelope write (see `createProductionEnvelopeWriter`'s WHY). */
function defaultStdoutFdWrite(line: string): void {
  writeSync(1, line); // allow-sync: RFC-0006 PIC-59 one-shot return-envelope write to fd 1, not event-loop I/O
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
  readonly stdin: { end(): void; destroy?(): void } | null;
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
  // `onExit` subscriber, so the PIC-65 teardown short-circuits on an
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
    kill: (): void => {
      const pid = child.pid;
      // PIC-65 teardown-budget precedent: a killed child whose stdout never
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
          // the failure, and a teardown kill failure is advisory only (PIC-65).
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
 * forwarded `cwd` and the assembled child `env`, with `stdio: ["ignore","pipe",
 * "pipe"]`: stdout/stderr are the parent-read wire, and stdin is ALREADY CLOSED
 * at spawn.
 *
 * WHY stdin "ignore" (bug 0002): pi's `main()` awaits `readPipedStdin()` — a
 * read of any non-TTY stdin to EOF — for every mode except `rpc`, BEFORE the
 * `-p` argv prompt is even assembled. A child spawned with a parent-held
 * `"pipe"` stdin that nothing writes to or closes therefore never STARTS: the
 * parent awaits the `theta_result` envelope, the child awaits stdin EOF —
 * deadlock on every uncancelled run. `"ignore"` gives the child an
 * already-closed stdin so it runs immediately — the same treatment the acceptance harness applies to the outer
 * `pi -p` process it spawns (tests/live/acceptance/harness.ts). The child needs no
 * stdin input: params ride PIC-60's env/temp-file channel, and cancellation is
 * the PIC-66 kill.
 */
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
