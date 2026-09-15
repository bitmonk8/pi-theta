// RFC-0012 §2/§3 — production adapters for the result channel and the wire a
// non-`pipe` placement runs over.
//
// The runtime half (`src/runtime/subagent-result-channel.ts`) is pure over two
// seams; this module binds them to `node:net` on the loopback interface and
// composes the parent-side WIRE `placeSubagentChild` opens before `place()`:
// mint the launch's token and nonce, bind the listener, write the launch file
// (§2) carrying the channel coordinates, and hand back the adapter that turns
// the backend's `PlacedChild` into the `SubagentChildProcess` line source the
// drive consumes. Everything here runs at the composition root; nothing above
// it touches a socket or a file.

import { randomBytes } from "node:crypto";
import { connect as netConnect, createServer } from "node:net";
import type { Clock } from "../seams/clock";
import {
  deleteLaunchFile,
  LAUNCH_FILE_VERSION,
  projectLaunchFileControlPlane,
  writeLaunchFile,
  type LaunchFileFs,
  type SubagentLaunchFileDocument,
} from "../runtime/subagent-launch-file";
import { SUBAGENT_DISPOSE_BUDGET_MS } from "../runtime/subagent-isolation";
import type {
  OpenedSubagentWire,
  PreparedSubagentLaunch,
  SubagentLaunchRequest,
} from "../runtime/subagent-launcher";
import type { PlacedChild } from "../runtime/subagent-placement";
import {
  adaptChannelToChildProcess,
  openResultChannel,
  type ChannelClientSeam,
  type ChannelConnection,
  type ChannelServerSeam,
} from "../runtime/subagent-result-channel";

/** The loopback address both halves bind to; never a routable interface. */
export const RESULT_CHANNEL_HOST = "127.0.0.1";

/**
 * The parent-side listener over `node:net`: an ephemeral port on the loopback
 * interface, each accepted socket adapted to the `ChannelConnection` the
 * channel reads. `setEncoding("utf8")` makes every `data` chunk a string so
 * the runtime half never sees a `Buffer`.
 */
export function createProductionChannelServer(): ChannelServerSeam {
  return {
    listen: (onConnection): Promise<{ readonly port: number; close(): void }> =>
      new Promise((resolve, reject) => {
        const server = createServer((socket) => {
          socket.setEncoding("utf8");
          const connection: ChannelConnection = {
            onData: (listener): void => {
              socket.on("data", (chunk: string | Buffer) => {
                listener(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
              });
            },
            onClose: (listener): void => {
              socket.on("close", () => {
                listener();
              });
            },
            destroy: (): void => {
              socket.destroy();
            },
          };
          // A peer that resets the connection surfaces `error` before `close`;
          // without a listener Node would raise it as an uncaught exception.
          // The channel observes the close that follows, so the error itself
          // carries nothing it needs.
          socket.on("error", () => {});
          onConnection(connection);
        });
        server.on("error", reject);
        server.listen(0, RESULT_CHANNEL_HOST, () => {
          const address = server.address();
          if (address === null || typeof address === "string") {
            server.close();
            reject(new Error("result channel listener bound without a TCP address"));
            return;
          }
          resolve({
            port: address.port,
            close: (): void => {
              server.close();
            },
          });
        });
      }),
  };
}

/**
 * The child-side dialer over `node:net`. Writes issued before the socket
 * connects are queued by Node and flushed on connect, so the hello frame can
 * be written synchronously at `connect()`.
 */
export function createProductionChannelClient(): ChannelClientSeam {
  return {
    connect: (port) => {
      const socket = netConnect({ port, host: RESULT_CHANNEL_HOST });
      socket.setEncoding("utf8");
      let gone = false;
      const errorListeners = new Set<(error: Error) => void>();
      const closeListeners = new Set<() => void>();
      socket.on("error", (error: Error) => {
        gone = true;
        for (const listener of [...errorListeners]) {
          listener(error);
        }
      });
      socket.on("close", () => {
        gone = true;
        for (const listener of [...closeListeners]) {
          listener();
        }
      });
      return {
        write: (line): void => {
          if (gone || socket.destroyed) {
            return;
          }
          socket.write(line);
        },
        end: (): void => {
          if (!socket.destroyed) {
            socket.end();
          }
        },
        onError: (listener): void => {
          errorListeners.add(listener);
        },
        onClose: (listener): void => {
          closeListeners.add(listener);
        },
      };
    },
  };
}

/**
 * Mint one unguessable channel secret (the hello token, the launch nonce):
 * 128 random bits, hex. Not the `IdSource` seam — that seam mints the
 * spec-shaped `invocationId` / `toolCallId` identifiers (PIC-20, canonical
 * UUID form), and these are secrets with no format contract. Injected into
 * `createProductionSubagentWire` so tests pin the launch file over a fixed
 * value.
 */
export function createProductionSecretMint(): () => string {
  return (): string => randomBytes(16).toString("hex");
}

/** The collaborators the production wire composes over. */
export interface ProductionSubagentWireDeps {
  readonly clock: Clock;
  readonly launchFs: LaunchFileFs;
  readonly server: ChannelServerSeam;
  readonly mintSecret: () => string;
  /** Heartbeat-silence budget before a synthesised exit; defaults to the PIC-65 dispose budget. */
  readonly silenceBudgetMs?: number;
}

/**
 * The production `openWire` for `placeSubagentChild`: open the channel, then
 * write the launch file (§2) with the channel's coordinates, the launch's
 * control-plane carriage projected out of the composed env, the presentation
 * and the entry. The channel is opened FIRST because the file carries its
 * port; a launch-file write failure releases the channel before it
 * propagates (the caller maps the throw to `theta/runtime/subagent-spawn-
 * failed`). The launch file is deleted by the child on read; the parent's
 * backstop deletes it on settlement and on `abandon()`.
 */
export function createProductionSubagentWire(
  deps: ProductionSubagentWireDeps,
): (
  prepared: Extract<PreparedSubagentLaunch, { ok: true }>,
  request: SubagentLaunchRequest,
) => Promise<OpenedSubagentWire> {
  return async (prepared, _request): Promise<OpenedSubagentWire> => {
    const token = deps.mintSecret();
    const nonce = deps.mintSecret();
    const channel = await openResultChannel({
      server: deps.server,
      clock: deps.clock,
      token,
      nonce,
      silenceBudgetMs: deps.silenceBudgetMs ?? SUBAGENT_DISPOSE_BUDGET_MS,
    });
    const document: SubagentLaunchFileDocument = {
      v: LAUNCH_FILE_VERSION,
      nonce,
      controlPlane: projectLaunchFileControlPlane(prepared.env),
      channel: { port: channel.port, token },
      presentation: prepared.presentation,
      entry: prepared.entry,
    };
    let launchFile: string;
    try {
      launchFile = writeLaunchFile(document, deps.launchFs);
    } catch (writeError: unknown) { // allow-broad-catch: theta/runtime/subagent-spawn-failed — a launch-file write failure is a spawn failure, pi-integration-contract/subagent.md
      channel.abandon();
      throw writeError;
    }
    const removeLaunchFile = (): void => {
      deleteLaunchFile(launchFile, deps.launchFs);
    };
    return {
      launchFile,
      adapt: (placed: PlacedChild) => {
        // Backstop: a child that never started never consumed the file.
        channel.onSettled(removeLaunchFile);
        return adaptChannelToChildProcess(placed, channel);
      },
      abandon: (): void => {
        channel.abandon();
        removeLaunchFile();
      },
    };
  };
}
