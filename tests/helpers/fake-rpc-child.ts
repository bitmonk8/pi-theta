// RFC-0005 test harness — a fake spawned child `pi` speaking the RPC JSONL
// protocol on stdin/stdout.
//
// This is test-support code (Pi never loads it) so it lives under `tests/` and
// is outside the `src/**` mechanical gates: it may use ambient timing and
// `Promise` freely. It simulates the child half of the RFC-0005 subagent drive
// (pi-integration-contract/subagent.md #subagent-drive-mapping):
//
//   - accepts `{"type":"prompt",...}` and `{"type":"abort"}` commands on stdin
//     (parsed as strict JSONL, LF-split);
//   - emits `agent_end { messages, willRetry }` events on stdout, from a
//     scripted per-prompt response queue;
//   - injects failure modes: crash / nonzero exit (`crashWith`), unparseable
//     stdout output (`emitRawLine`), and stdin-EOF-driven exit
//     (`exitOnStdinEof`, on by default — the orphan-prevention presupposition);
//   - records spawn argv / env / cwd (via `makeFakeChildLauncher`) for the
//     launch-contract assertions.
//
// The `FakeRpcChild` implements the planned `SubagentChildProcess` handle from
// `src/runtime/subagent-launcher.ts`, so the launcher / driver / teardown seams
// consume it structurally and the harness stays coherent with the contract.

import type { Message } from "@earendil-works/pi-ai";
import type {
  ChildExitInfo,
  ExecutableHost,
  SpawnFn,
  SubagentChildProcess,
} from "../../src/runtime/subagent-launcher";

/**
 * A fake `ExecutableHost` whose rung-1 entry-script always resolves — so
 * `resolveSubagentExecutable` yields a runnable entry point for tests that drive
 * the real `launchSubagentChild` over `makeFakeChildLauncher`.
 */
export function fakeExecutableHost(): ExecutableHost {
  return {
    argv1: "/theta/entry.js",
    execPath: "/usr/bin/node",
    fileExists: (): boolean => true,
    isGenericRuntime: (): boolean => false,
  };
}

/** An `agent_end` RPC event, the shape PIC-43 extracts from. */
export interface AgentEndWireEvent {
  readonly type: "agent_end";
  readonly messages: readonly Message[];
  readonly willRetry: boolean;
}

/** A parsed inbound RPC command (from the runtime, on stdin). */
export type InboundCommand =
  | { readonly type: "prompt"; readonly message: string }
  | { readonly type: "abort" }
  | { readonly type: string; readonly [k: string]: unknown };

/** The record one `makeFakeChildLauncher` spawn captures. */
export interface SpawnRecord {
  readonly execPath: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Record<string, string | undefined>;
  readonly child: FakeRpcChild;
}

let nextFakePid = 4000;

/**
 * Options for one fake child. `exitOnStdinEof` defaults to `true` — the pinned
 * RPC stdin-EOF exit behaviour underpinning orphan prevention (PIC-9 class-2).
 */
export interface FakeRpcChildOptions {
  /** Exit (code 0) when stdin is closed. Default `true` (the RPC presupposition). */
  readonly exitOnStdinEof?: boolean;
  /** The model the child reports through the `get_state` pre-flight query. */
  readonly resolvedModel?: string;
  /**
   * Suppress the `get_state` / `get_available_models` state reply, modelling a
   * child that never answers the model pre-flight query (state-query failure /
   * missing reply). Default `false`.
   */
  readonly suppressStateReply?: boolean;
}

/**
 * A fake spawned child `pi` process. Drives the RPC JSONL protocol in-memory:
 * the runtime writes commands via `writeStdin`, the harness (or a test) emits
 * events via `emitAgentEnd` / `emitRawLine`, and lifecycle is controlled with
 * `crashWith` / `kill` / `closeStdin`.
 */
export class FakeRpcChild implements SubagentChildProcess {
  readonly pid: number | undefined;

  /** Parsed inbound commands the runtime wrote to stdin, in order. */
  readonly commands: InboundCommand[] = [];
  /** Raw inbound stdin lines (including any that fail to parse). */
  readonly rawStdin: string[] = [];

  #stdoutListeners: ((line: string) => void)[] = [];
  #stderrListeners: ((line: string) => void)[] = [];
  #exitListeners: ((info: ChildExitInfo) => void)[] = [];
  #exited = false;
  #stdinClosed = false;
  #killed = false;
  #stdinBuffer = "";

  /** Scripted `agent_end` events, one entry consumed per `prompt` command. */
  #scriptedResponses: AgentEndWireEvent[] = [];
  readonly #exitOnStdinEof: boolean;
  readonly #resolvedModel: string;
  readonly #suppressStateReply: boolean;

  constructor(options: FakeRpcChildOptions = {}) {
    this.pid = nextFakePid++;
    this.#exitOnStdinEof = options.exitOnStdinEof ?? true;
    this.#resolvedModel = options.resolvedModel ?? "claude-test";
    this.#suppressStateReply = options.suppressStateReply ?? false;
  }

  // --- test-side scripting / injection --------------------------------------

  /** Queue the `agent_end` event the next `prompt` command should produce. */
  scriptAgentEnd(messages: readonly Message[], willRetry = false): this {
    this.#scriptedResponses.push({ type: "agent_end", messages, willRetry });
    return this;
  }

  /** Emit an `agent_end` event on stdout now (strict JSONL frame). */
  emitAgentEnd(messages: readonly Message[], willRetry = false): void {
    this.#emitLine(JSON.stringify({ type: "agent_end", messages, willRetry }));
  }

  /** Emit an arbitrary raw stdout line (use to inject unparseable wire output). */
  emitRawLine(line: string): void {
    this.#emitLine(line);
  }

  /** Emit a well-formed non-terminal event (e.g. a state reply) on stdout. */
  emitEvent(event: Record<string, unknown>): void {
    this.#emitLine(JSON.stringify(event));
  }

  /** Crash / nonzero-exit injection: fire exit with a code and optional stderr. */
  crashWith(code: number | null, signal: string | null = null, stderrLine?: string): void {
    if (stderrLine !== undefined) {
      for (const l of this.#stderrListeners) l(stderrLine);
    }
    this.#fireExit({ code, signal });
  }

  /** Whether the child has exited (observed by teardown / crash paths). */
  get exited(): boolean {
    return this.#exited;
  }

  /** Whether stdin was closed (graceful-shutdown trigger). */
  get stdinClosed(): boolean {
    return this.#stdinClosed;
  }

  /** Whether the child was process-tree killed. */
  get killed(): boolean {
    return this.#killed;
  }

  /** The model this child reports through the pre-flight state query. */
  get resolvedModel(): string {
    return this.#resolvedModel;
  }

  /** Whether this child suppresses its model pre-flight state reply. */
  get suppressStateReply(): boolean {
    return this.#suppressStateReply;
  }

  // --- SubagentChildProcess surface -----------------------------------------

  writeStdin(data: string): void {
    if (this.#stdinClosed) {
      throw new Error("write after stdin EOF");
    }
    this.#stdinBuffer += data;
    // Strict JSONL, LF-only splitting.
    let idx: number;
    while ((idx = this.#stdinBuffer.indexOf("\n")) >= 0) {
      const line = this.#stdinBuffer.slice(0, idx);
      this.#stdinBuffer = this.#stdinBuffer.slice(idx + 1);
      if (line.length === 0) continue;
      this.rawStdin.push(line);
      this.#handleCommandLine(line);
    }
  }

  closeStdin(): void {
    if (this.#stdinClosed) return;
    this.#stdinClosed = true;
    if (this.#exitOnStdinEof && !this.#exited) {
      // The pinned RPC stdin-EOF exit behaviour (orphan-prevention class-2).
      this.#fireExit({ code: 0, signal: null });
    }
  }

  onStdoutLine(listener: (line: string) => void): () => void {
    this.#stdoutListeners.push(listener);
    return (): void => {
      const idx = this.#stdoutListeners.indexOf(listener);
      if (idx !== -1) {
        this.#stdoutListeners.splice(idx, 1);
      }
    };
  }

  onStderrLine(listener: (line: string) => void): () => void {
    this.#stderrListeners.push(listener);
    return (): void => {
      const idx = this.#stderrListeners.indexOf(listener);
      if (idx !== -1) {
        this.#stderrListeners.splice(idx, 1);
      }
    };
  }

  onExit(listener: (info: ChildExitInfo) => void): void {
    this.#exitListeners.push(listener);
  }

  kill(): void {
    if (this.#exited) return;
    this.#killed = true;
    this.#fireExit({ code: null, signal: "SIGKILL" });
  }

  // --- internals ------------------------------------------------------------

  #handleCommandLine(line: string): void {
    let parsed: InboundCommand;
    try {
      parsed = JSON.parse(line) as InboundCommand;
    } catch {
      // A malformed command from the runtime is recorded but not acted on.
      return;
    }
    this.commands.push(parsed);
    if (parsed.type === "get_state" || parsed.type === "get_available_models") {
      // Model pre-flight state query. A child that suppresses its reply models a
      // state-query failure / missing reply (the runtime's bounded wait then
      // fails the invocation). Otherwise reply on the next microtask with the
      // resolved-model reference in the docs/rpc.md `get_state` response shape.
      if (!this.#suppressStateReply) {
        const command = parsed.type;
        void Promise.resolve().then(() => {
          if (!this.#exited) {
            this.emitEvent({
              type: "response",
              command,
              success: true,
              data: { model: { id: this.#resolvedModel } },
            });
          }
        });
      }
      return;
    }
    if (parsed.type === "prompt") {
      const scripted = this.#scriptedResponses.shift();
      if (scripted !== undefined) {
        // Deliver the scripted terminal event on the next microtask, so the
        // runtime's stream reader is observably asynchronous.
        void Promise.resolve().then(() => {
          if (!this.#exited) {
            this.emitAgentEnd(scripted.messages, scripted.willRetry);
          }
        });
      }
    }
  }

  /** Count of live stdout listeners (test-visible, for the no-accumulation lens). */
  get stdoutListenerCount(): number {
    return this.#stdoutListeners.length;
  }

  #emitLine(line: string): void {
    // Snapshot: a listener may detach from within its own callback.
    for (const l of [...this.#stdoutListeners]) l(line);
  }

  #fireExit(info: ChildExitInfo): void {
    if (this.#exited) return;
    this.#exited = true;
    for (const l of this.#exitListeners) l(info);
  }
}

/** A fake `SpawnFn` plus the list of spawn records it captured. */
export interface FakeChildLauncher {
  readonly spawn: SpawnFn;
  readonly spawns: SpawnRecord[];
  /** Configure the next child(s) the launcher produces. */
  configureNext(options: FakeRpcChildOptions): void;
  /** Make the next spawn throw `error` (spawn-failure injection, e.g. ENOENT). */
  failNextSpawn(error: Error): void;
}

/**
 * Build a fake child launcher that records every spawn's `execPath` / `args` /
 * `cwd` / `env` and returns a `FakeRpcChild`. Supports spawn-failure injection
 * (`failNextSpawn`) for the ENOENT path.
 */
export function makeFakeChildLauncher(): FakeChildLauncher {
  const spawns: SpawnRecord[] = [];
  let nextOptions: FakeRpcChildOptions = {};
  let nextSpawnError: Error | undefined;

  const spawn: SpawnFn = (execPath, args, options) => {
    if (nextSpawnError !== undefined) {
      const err = nextSpawnError;
      nextSpawnError = undefined;
      throw err;
    }
    const child = new FakeRpcChild(nextOptions);
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
    configureNext(options: FakeRpcChildOptions): void {
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
