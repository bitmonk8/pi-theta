// RFC-0006 test harness — a fake spawned child `pi --mode json -p "/<slug>"`
// process, the successor of `fake-rpc-child.ts`.
//
// Under RFC 0006 the parent no longer drives a remote RPC session: it launches
// the child, awaits the single reserved-key `theta_result` envelope line on the
// child's `--mode json` stdout stream (stray-line tolerant), and maps `ok`/`err`
// to `Ok`/`Err` (pi-integration-contract/subagent.md PIC-59). Cancellation is
// effected by closing the child's parent-held stdin pipe (PIC-63), then the
// bounded-grace process-tree kill of PIC-9.
//
// This harness scripts the child's stdout (stray `--mode json` event lines and
// the terminal envelope line) and its exit behaviour, and records spawn argv /
// env / cwd (via `makeFakeJsonChildLauncher`) for the launch-contract
// assertions. It is test-support code (Pi never loads it), so it lives under
// `tests/` outside the `src/**` mechanical gates.

import type {
  ChildExitInfo,
  ExecutableHost,
  SpawnFn,
  SubagentChildProcess,
} from "../../src/runtime/subagent-launcher";
import {
  serializeErrEnvelope,
  serializeOkEnvelope,
} from "../../src/runtime/subagent-envelope";
import type { QueryError } from "../../src/runtime/query-error";

/**
 * A fake `ExecutableHost` whose rung-1 entry-script always resolves — so
 * `resolveSubagentExecutable` yields a runnable entry point for tests that drive
 * the real `launchSubagentChild` over `makeFakeJsonChildLauncher`.
 */
export function fakeExecutableHost(): ExecutableHost {
  return {
    argv1: "/theta/entry.js",
    execPath: "/usr/bin/node",
    fileExists: (): boolean => true,
    isGenericRuntime: (): boolean => false,
  };
}

/** The record one `makeFakeJsonChildLauncher` spawn captures. */
export interface SpawnRecord {
  readonly execPath: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Record<string, string | undefined>;
  readonly child: FakeJsonChild;
}

let nextFakePid = 5000;

/** Options for one fake json child. `exitOnStdinEof` defaults to `true` (PIC-9 class-2). */
export interface FakeJsonChildOptions {
  /** Exit (code 0) when stdin is closed. Default `true` (the stdin-EOF presupposition). */
  readonly exitOnStdinEof?: boolean;
}

/**
 * A fake spawned child `pi --mode json` process. The runtime subscribes to
 * stdout via `onStdoutLine` and the child emits (a) stray `--mode json` event
 * lines and (b) the single reserved-key `theta_result` envelope line. Lifecycle
 * is controlled with `crashWith` / `kill` / `closeStdin`.
 */
export class FakeJsonChild implements SubagentChildProcess {
  readonly pid: number | undefined;

  /** Raw inbound stdin data the runtime wrote (unused for data under `-p`; PIC-63 close only). */
  readonly stdinWrites: string[] = [];

  #stdoutListeners: ((line: string) => void)[] = [];
  #stderrListeners: ((line: string) => void)[] = [];
  #exitListeners: ((info: ChildExitInfo) => void)[] = [];
  #exited = false;
  #lastExit: ChildExitInfo | undefined;
  #stdinClosed = false;
  #killed = false;

  readonly #exitOnStdinEof: boolean;

  constructor(options: FakeJsonChildOptions = {}) {
    this.pid = nextFakePid++;
    this.#exitOnStdinEof = options.exitOnStdinEof ?? true;
  }

  // --- test-side scripting / injection --------------------------------------

  /** Emit a stray `--mode json` event line (not the reserved key) — the parent ignores it. */
  emitEventLine(event: Record<string, unknown>): void {
    this.#emitLine(JSON.stringify(event));
  }

  /** Emit an arbitrary raw stdout line (e.g. garbage / partial JSON) — the parent ignores it. */
  emitRawLine(line: string): void {
    this.#emitLine(line);
  }

  /** Emit the terminal `Ok` envelope line, then (by default) exit code 0. */
  emitOkEnvelope(value: unknown, thenExit = true): void {
    // The serializer appends a trailing LF; the line pump splits on LF, so strip it.
    this.#emitLine(serializeOkEnvelope(value).replace(/\n$/, ""));
    if (thenExit) {
      this.#fireExit({ code: 0, signal: null });
    }
  }

  /** Emit the terminal `Err` envelope line, then (by default) exit code 0. */
  emitErrEnvelope(error: QueryError, thenExit = true): void {
    this.#emitLine(serializeErrEnvelope(error).replace(/\n$/, ""));
    if (thenExit) {
      this.#fireExit({ code: 0, signal: null });
    }
  }

  /** Crash / nonzero-exit injection WITHOUT an envelope: fire exit with a code + optional stderr. */
  crashWith(code: number | null, signal: string | null = null, stderrLine?: string): void {
    if (stderrLine !== undefined) {
      for (const l of this.#stderrListeners) l(stderrLine);
    }
    this.#fireExit({ code, signal });
  }

  get exited(): boolean {
    return this.#exited;
  }
  get stdinClosed(): boolean {
    return this.#stdinClosed;
  }
  get killed(): boolean {
    return this.#killed;
  }
  /** Count of live stdout listeners (for the no-accumulation lens). */
  get stdoutListenerCount(): number {
    return this.#stdoutListeners.length;
  }

  // --- SubagentChildProcess surface -----------------------------------------

  writeStdin(data: string): void {
    if (this.#stdinClosed) {
      throw new Error("write after stdin EOF");
    }
    this.stdinWrites.push(data);
  }

  closeStdin(): void {
    if (this.#stdinClosed) return;
    this.#stdinClosed = true;
    if (this.#exitOnStdinEof && !this.#exited) {
      // The pinned stdin-EOF exit behaviour (orphan-prevention / PIC-63 grace).
      this.#fireExit({ code: 0, signal: null });
    }
  }

  onStdoutLine(listener: (line: string) => void): () => void {
    this.#stdoutListeners.push(listener);
    return (): void => {
      const idx = this.#stdoutListeners.indexOf(listener);
      if (idx !== -1) this.#stdoutListeners.splice(idx, 1);
    };
  }

  onStderrLine(listener: (line: string) => void): () => void {
    this.#stderrListeners.push(listener);
    return (): void => {
      const idx = this.#stderrListeners.indexOf(listener);
      if (idx !== -1) this.#stderrListeners.splice(idx, 1);
    };
  }

  onExit(listener: (info: ChildExitInfo) => void): void {
    // Replay a prior exit to a late subscriber (the RFC-0006 teardown subscribes
    // AFTER the child exited on envelope emission), mirroring the production
    // adapter, so teardown short-circuits instead of waiting the bounded budget.
    if (this.#exited && this.#lastExit !== undefined) {
      const info = this.#lastExit;
      queueMicrotask(() => listener(info));
      return;
    }
    this.#exitListeners.push(listener);
  }

  kill(): void {
    if (this.#exited) return;
    this.#killed = true;
    this.#fireExit({ code: null, signal: "SIGKILL" });
  }

  // --- internals ------------------------------------------------------------

  #emitLine(line: string): void {
    // Snapshot: a listener may detach from within its own callback (a settled
    // drive detaches on settle).
    for (const l of [...this.#stdoutListeners]) l(line);
  }

  #fireExit(info: ChildExitInfo): void {
    if (this.#exited) return;
    this.#exited = true;
    this.#lastExit = info;
    for (const l of this.#exitListeners) l(info);
  }
}

/** A fake `SpawnFn` plus the list of spawn records it captured. */
export interface FakeJsonChildLauncher {
  readonly spawn: SpawnFn;
  readonly spawns: SpawnRecord[];
  /** Configure the next child(s) the launcher produces. */
  configureNext(options: FakeJsonChildOptions): void;
  /** Make the next spawn throw `error` (spawn-failure injection, e.g. ENOENT). */
  failNextSpawn(error: Error): void;
}

/**
 * Build a fake json-child launcher that records every spawn's `execPath` /
 * `args` / `cwd` / `env` and returns a `FakeJsonChild`. Supports spawn-failure
 * injection (`failNextSpawn`) for the ENOENT / EMFILE path.
 */
export function makeFakeJsonChildLauncher(): FakeJsonChildLauncher {
  const spawns: SpawnRecord[] = [];
  let nextOptions: FakeJsonChildOptions = {};
  let nextSpawnError: Error | undefined;

  const spawn: SpawnFn = (execPath, args, options) => {
    if (nextSpawnError !== undefined) {
      const err = nextSpawnError;
      nextSpawnError = undefined;
      throw err;
    }
    const child = new FakeJsonChild(nextOptions);
    nextOptions = {};
    spawns.push({
      execPath,
      args: [...args],
      cwd: options.cwd,
      env: { ...options.env },
      child,
    });
    return child;
  };

  return {
    spawn,
    spawns,
    configureNext(options: FakeJsonChildOptions): void {
      nextOptions = options;
    },
    failNextSpawn(error: Error): void {
      nextSpawnError = error;
    },
  };
}

/** An ENOENT-shaped error for the spawn-failure (executable-missing) path. */
export function enoentSpawnError(execPath: string): Error {
  const err = new Error(`spawn ${execPath} ENOENT`) as Error & { code?: string };
  err.code = "ENOENT";
  return err;
}

/** An EMFILE-shaped error for the spawn-time resource-exhaustion path (PIC-22 fan-out). */
export function emfileSpawnError(): Error {
  const err = new Error("spawn EMFILE") as Error & { code?: string };
  err.code = "EMFILE";
  return err;
}
