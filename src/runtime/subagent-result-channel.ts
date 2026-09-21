// RFC-0012 §3 — parent and child result-channel lifecycles for non-`pipe`
// placements; the shared frame protocol lives in subagent-result-frames.ts.
//
// A child a multiplexer places has a TTY for stdout, so PIC-59's stdout
// envelope and PIC-74's progress line have no pipe to ride. Before `place()`
// the parent opens a loopback TCP listener on an ephemeral `127.0.0.1` port and
// records `{ port, token }` in the launch file (§2); the child connects once,
// sends a `hello` frame carrying the token and the launch nonce, and then
// writes the SAME reserved-key lines it writes to fd 1 under `pipe` — as NDJSON
// frames — plus two frames with no stdout equivalent: `heartbeat` (liveness
// when the backend cannot observe exit) and `stderr` (a bounded crash-detail
// mirror). The parent's drive is unchanged in shape: `driveSubagentChild`
// consumes a line source, and under a channel that source is the frame stream
// filtered to reserved-key lines (`adaptChannelToChildProcess`).
//
// Exit is SYNTHESISED when the backend declares `observesExit: false`: the
// invocation settles on the envelope frame, on socket close, or on heartbeat
// silence past `RESULT_CHANNEL_SILENCE_BUDGET_MS` — the last two mapped by the drive's existing
// `mapExitWithoutEnvelope` (no new code, DIAG-2). The token proves a connection
// belongs to this launch; a wrong token, a wrong nonce, a malformed hello or a
// second connection is dropped.
//
// This module is pure over two injected seams (`ChannelServerSeam` parent-side,
// `ChannelClientSeam` child-side) and the runtime `Clock`; the `node:net`
// adapters live in `src/extension/production-result-channel.ts`.

import type { Clock, TimerHandle } from "../seams/clock";
import type { ChildExitInfo, SubagentChildProcess } from "./subagent-launcher";
import type { PlacedChild } from "./subagent-placement";
import {
  CHANNEL_CLOSED_SIGNAL,
  HEARTBEAT_SILENCE_SIGNAL,
  RESULT_CHANNEL_HEARTBEAT_MS,
  RESULT_CHANNEL_PRE_HELLO_MAX_BYTES,
  RESULT_CHANNEL_STDERR_LINE_CAP,
  classifyInboundFrame,
  createLfLineBuffer,
  encodeControlFrame,
} from "./subagent-result-frames";

export * from "./subagent-result-frames";

// ---------------------------------------------------------------------------
// Parent side.
// ---------------------------------------------------------------------------

/** One accepted inbound connection, as the server seam presents it. */
export interface ChannelConnection {
  onData(listener: (chunk: string) => void): void;
  onClose(listener: () => void): void;
  destroy(): void;
}

/** The parent-side listener seam (`node:net` in production; a fake in tests). */
export interface ChannelServerSeam {
  /** Listen on an ephemeral loopback port; resolve with the port once bound. */
  listen(onConnection: (connection: ChannelConnection) => void): Promise<{
    readonly port: number;
    close(): void;
  }>;
}

/** The parent-side channel a launch runs over. */
export interface ResultChannel {
  readonly port: number;
  readonly token: string;
  /** Reserved-key lines the child wrote (the drive's line source). */
  onLine(listener: (line: string) => void): () => void;
  /** Mirrored stderr lines. */
  onStderrLine(listener: (line: string) => void): () => void;
  /**
   * Accepted `heartbeat` frames (RFC 0012 §7): the liveness the execution-
   * status child tap folds when the child's `--mode json` stream is a TTY.
   * Carries no payload; the frame is otherwise dropped.
   */
  onHeartbeat(listener: () => void): () => void;
  /** Synthesised settlement (see module header); replays to a late subscriber. */
  onSettled(listener: (info: ChildExitInfo) => void): void;
  /** Whether the child's hello has been accepted. */
  readonly connected: boolean;
  /**
   * Settle from an exit observed OUTSIDE the channel (a backend with
   * `observesExit: true` whose child never connected) and release the
   * listener. Idempotent; a later frame or close is ignored.
   */
  settle(info: ChildExitInfo): void;
  /**
   * Settle as killed (the cancellation / teardown kill path) and release the
   * listener. Idempotent.
   */
  kill(): void;
  /** Release the listener without settling (placement never happened). */
  abandon(): void;
}

/** Collaborators `openResultChannel` consumes. */
export interface OpenResultChannelDeps {
  readonly server: ChannelServerSeam;
  readonly clock: Clock;
  /** The hello token the launch file carries. */
  readonly token: string;
  /** The launch nonce the launch file carries; the hello must echo it. */
  readonly nonce: string;
  /** Silence budget before a synthesised `HEARTBEAT_SILENCE` exit; production passes `RESULT_CHANNEL_SILENCE_BUDGET_MS` (decoupled from the dispose budget, bug 0484). */
  readonly silenceBudgetMs: number;
}

/**
 * Open the parent-side channel: bind the listener, gate the first connection
 * on a well-formed hello carrying this launch's token AND nonce, forward
 * reserved-key lines and stderr frames, and synthesise settlement. The silence
 * timer is armed at open (a child that never connects must not hang the
 * drive) and re-armed on every accepted frame.
 */
export async function openResultChannel(deps: OpenResultChannelDeps): Promise<ResultChannel> {
  const lineListeners = new Set<(line: string) => void>();
  const stderrListeners = new Set<(line: string) => void>();
  const heartbeatListeners = new Set<() => void>();
  const settledListeners = new Set<(info: ChildExitInfo) => void>();
  let settled: ChildExitInfo | undefined;
  let accepted: ChannelConnection | undefined;
  let connected = false;
  let silenceTimer: TimerHandle | undefined;
  let server: { readonly port: number; close(): void } | undefined;
  let released = false;

  const release = (): void => {
    if (released) {
      return;
    }
    released = true;
    if (silenceTimer !== undefined) {
      deps.clock.clearTimeout(silenceTimer);
      silenceTimer = undefined;
    }
    accepted?.destroy();
    server?.close();
  };

  const settle = (info: ChildExitInfo): void => {
    if (settled !== undefined) {
      return;
    }
    settled = info;
    release();
    for (const listener of [...settledListeners]) {
      listener(info);
    }
  };

  const armSilence = (): void => {
    if (settled !== undefined || released) {
      return;
    }
    if (silenceTimer !== undefined) {
      deps.clock.clearTimeout(silenceTimer);
    }
    silenceTimer = deps.clock.setTimeout(() => {
      silenceTimer = undefined;
      settle({ code: null, signal: HEARTBEAT_SILENCE_SIGNAL });
    }, deps.silenceBudgetMs);
  };

  const onConnection = (connection: ChannelConnection): void => {
    // One launch, one connection: a second dialer — a replayed launch file, a
    // stray local process — is dropped without reading it.
    if (accepted !== undefined || settled !== undefined || released) {
      connection.destroy();
      return;
    }
    let helloSeen = false;
    const buffer = createLfLineBuffer();
    let dropped = false;
    // A dropped dialer frees the slot: a stray local process that connected
    // first must not lock the real child out (the token gate, not the slot,
    // is what keeps a stranger from being accepted).
    const drop = (): void => {
      dropped = true;
      connection.destroy();
      if (accepted === connection) {
        accepted = undefined;
      }
    };
    accepted = connection;
    connection.onData((chunk) => {
      if (dropped || settled !== undefined) {
        return;
      }
      const bufferedLength = buffer.append(chunk);
      if (!helloSeen && bufferedLength > RESULT_CHANNEL_PRE_HELLO_MAX_BYTES) {
        drop();
        return;
      }
      for (const line of buffer.lines()) {
        const frame = classifyInboundFrame(line);
        if (!helloSeen) {
          // The FIRST line must be the hello, and it must name this launch.
          if (frame.kind !== "hello" || frame.token !== deps.token || frame.nonce !== deps.nonce) {
            drop();
            return;
          }
          helloSeen = true;
          connected = true;
          armSilence();
          continue;
        }
        armSilence();
        switch (frame.kind) {
          case "envelope-line":
            for (const listener of [...lineListeners]) {
              listener(frame.line);
            }
            // The result arrived: the invocation is settled whatever the
            // child does next (a visible child lingers on `Err` by design,
            // §8 — that is not a budget breach and it is not killed).
            settle({ code: 0, signal: null });
            return;
          case "progress-line":
            for (const listener of [...lineListeners]) {
              listener(frame.line);
            }
            break;
          case "stderr":
            for (const listener of [...stderrListeners]) {
              listener(frame.line);
            }
            break;
          case "heartbeat":
            for (const listener of [...heartbeatListeners]) {
              listener();
            }
            break;
          case "hello":
          case "ignored":
            break;
        }
      }
    });
    connection.onClose(() => {
      if (dropped || accepted !== connection) {
        return;
      }
      // The accepted child went away without an envelope: crash-shaped.
      settle({ code: null, signal: CHANNEL_CLOSED_SIGNAL });
    });
  };

  server = await deps.server.listen(onConnection);
  armSilence();

  return {
    port: server.port,
    token: deps.token,
    get connected(): boolean {
      return connected;
    },
    onLine: (listener): (() => void) => {
      lineListeners.add(listener);
      return (): void => {
        lineListeners.delete(listener);
      };
    },
    onStderrLine: (listener): (() => void) => {
      stderrListeners.add(listener);
      return (): void => {
        stderrListeners.delete(listener);
      };
    },
    onHeartbeat: (listener): (() => void) => {
      heartbeatListeners.add(listener);
      return (): void => {
        heartbeatListeners.delete(listener);
      };
    },
    onSettled: (listener): void => {
      if (settled !== undefined) {
        const info = settled;
        queueMicrotask(() => listener(info));
        return;
      }
      settledListeners.add(listener);
    },
    settle,
    kill: (): void => {
      settle({ code: null, signal: "SIGKILL" });
    },
    abandon: release,
  };
}

/**
 * Turn a placed child with no process handle plus its channel into the
 * `SubagentChildProcess` line source the drive, the cancellation forward, the
 * teardown and the child tap all consume unchanged. `onExit` is the real
 * exit when the backend observes it, else the channel's synthesised
 * settlement; `kill()` kills through the backend AND settles the channel so
 * the drive's cancellation short-circuit fires deterministically (PIC-66).
 * The drive itself retains the last stderr line for the crash-detail hint
 * (`driveSubagentChild`), so nothing is buffered here.
 *
 * Bug 0484: a settlement synthesised WITHOUT an envelope — heartbeat silence
 * or a pre-envelope socket close — is an abandonment, not an exit: the child
 * behind it is typically still a RUNNING worker (an orphaned fixer kept
 * editing a discarded worktree for 40 minutes; another degenerated into a
 * 100%-core spin). The adapter therefore kills the placed child through the
 * backend handle atomically with such a settlement — subscribed FIRST, so
 * the kill runs inside the same synchronous `settle()` that releases the
 * drive, and the late-subscription microtask replay covers an adapter
 * constructed after the channel already settled. The discrimination is by
 * pseudo-signal: an envelope settlement (`{code: 0, signal: null}` — Ok AND
 * Err, the §8 linger carve-out), the adapter's own `kill()` (`SIGKILL`,
 * `placed.kill()` already ran), and a real observed exit (the child already
 * exited) never re-kill. Spec: subagent.md §"Launch file and result channel"
 * — an invocation that settles without an envelope leaves no live child.
 */
export function adaptChannelToChildProcess(
  placed: PlacedChild,
  channel: ResultChannel,
): SubagentChildProcess {
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
  return {
    closeStdin: (): void => {},
    onStdoutLine: (listener): (() => void) => channel.onLine(listener),
    onStderrLine: (listener): (() => void) => channel.onStderrLine(listener),
    onHeartbeat: (listener): (() => void) => channel.onHeartbeat(listener),
    onExit: (listener): void => {
      if (!placed.capabilities.observesExit) {
        channel.onSettled(listener);
        return;
      }
      placed.onExit((info) => {
        // The `'exit'`-before-final-chunk race `adaptChild` closes with
        // `'close'` exists here too: a backend may observe the exit before the
        // envelope frame has been read off the socket. A connected child's exit
        // is therefore reported only once its channel settles (the OS closes the
        // socket after the last frame, in order); the REAL exit info is what
        // the listener receives. A child that never connected has no frames
        // in flight: report at once and release the listener.
        if (channel.connected) {
          channel.onSettled(() => listener(info));
          return;
        }
        channel.settle(info);
        listener(info);
      });
    },
    kill: (): void => {
      try {
        placed.kill();
      } finally {
        channel.kill();
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Child side.
// ---------------------------------------------------------------------------

/** The child-side dialer's socket, as the client seam presents it. */
export interface ChannelClientSocket {
  /** Buffered until connected; a no-op after the socket errored or closed. */
  write(line: string): void;
  end(): void;
  /** A connection failure or a write failure (the parent went away). */
  onError(listener: (error: Error) => void): void;
  /** The peer closed the socket (the parent settled and released the channel). */
  onClose(listener: () => void): void;
}

/** The child-side dialer seam (`node:net` in production; a fake in tests). */
export interface ChannelClientSeam {
  /**
   * Dial `127.0.0.1:port`. An error or close stops the heartbeat and turns
   * every later write into a no-op rather than a throw — but channel death is
   * NOT tolerated-and-continued: `connectResultChannel` reports it through
   * `onDead` so the child aborts its own invocation (bug 0484).
   */
  connect(port: number): ChannelClientSocket;
}

/** The child-side handle the envelope writer, progress emitter and shutdown consume. */
export interface ResultChannelClient {
  /** Write one reserved-key line (`theta_result` / `theta_progress`, newline-terminated or not). */
  writeLine(line: string): void;
  /** Mirror one stderr line (bounded parent-side). */
  stderr(line: string): void;
  /** Stop the heartbeat and close the socket (after the envelope, on shutdown). */
  close(): void;
}

/**
 * Dial the parent's channel, send the hello (token + nonce), and start the
 * heartbeat. Pure over the client seam and the `Clock`.
 */
export function connectResultChannel(input: {
  readonly client: ChannelClientSeam;
  readonly clock: Clock;
  readonly port: number;
  readonly token: string;
  readonly nonce: string;
  readonly heartbeatMs?: number;
  /**
   * Channel death — a socket error or an observed close BEFORE the client's
   * own deliberate `close()`. Fatal to the child's invocation (bug 0484,
   * subagent.md §"Launch file and result channel"): the supervisor is lost,
   * the envelope has nowhere to go, so side effects must stop — the
   * production wiring sweeps the active-invocation registry with the CNCL-4
   * `"theta cancelled by result-channel death"` reason. Fires at most once,
   * and never after the client's own deliberate `close()`. NOTE: in
   * production the child does not close first — the parent's ordinary
   * post-settlement release closes the socket — so onDead fires on
   * essentially every channel-placed completion (the §8 Err linger
   * included); what keeps that safe is the sweep side, which tolerates a
   * completed invocation (envelope already delivered; a late abort of a
   * still-registered entry inside the teardown await is a no-op of
   * consequence). Any future logic in this callback must stay
   * completion-safe.
   */
  readonly onDead?: () => void;
}): ResultChannelClient {
  const socket = input.client.connect(input.port);
  let closed = false;
  let heartbeat: TimerHandle | undefined;
  const stop = (): void => {
    closed = true;
    if (heartbeat !== undefined) {
      input.clock.clearTimeout(heartbeat);
      heartbeat = undefined;
    }
  };
  // The parent is gone, refused, or settled and released before this child's
  // own close: stop heartbeating (later writes are no-ops — never a throw)
  // and report the death exactly once so the invocation aborts fail-closed
  // instead of continuing headless (bug 0484's mute-and-continue defect).
  let deadReported = false;
  const die = (): void => {
    const deliberate = closed;
    stop();
    if (!deliberate && !deadReported) {
      deadReported = true;
      input.onDead?.();
    }
  };
  socket.onError(die);
  socket.onClose(die);
  socket.write(encodeControlFrame({ type: "hello", token: input.token, nonce: input.nonce }));
  const period = input.heartbeatMs ?? RESULT_CHANNEL_HEARTBEAT_MS;
  const scheduleHeartbeat = (): void => {
    if (closed) {
      return;
    }
    heartbeat = input.clock.setTimeout(() => {
      if (closed) {
        return;
      }
      socket.write(encodeControlFrame({ type: "heartbeat" }));
      scheduleHeartbeat();
    }, period);
  };
  scheduleHeartbeat();
  return {
    writeLine: (line): void => {
      if (closed) {
        return;
      }
      socket.write(line.endsWith("\n") ? line : `${line}\n`);
    },
    stderr: (line): void => {
      if (closed) {
        return;
      }
      const bounded =
        line.length > RESULT_CHANNEL_STDERR_LINE_CAP ? line.slice(0, RESULT_CHANNEL_STDERR_LINE_CAP) : line;
      socket.write(encodeControlFrame({ type: "stderr", line: bounded }));
    },
    close: (): void => {
      if (closed) {
        return;
      }
      stop();
      socket.end();
    },
  };
}
