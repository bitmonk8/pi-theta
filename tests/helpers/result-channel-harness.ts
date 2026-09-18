// Shared fakes for the RFC-0012 §3 result-channel tests: the parent-side
// server/connection pair, the child-side socket/client pair, the placed-child
// double with a kill counter, and the frame literals. Extracted from
// tests/subagent-result-channel.test.ts when the bug-0484 witnesses arrived
// (two files, one harness — quality lens D7).

import {
  encodeControlFrame,
  type ChannelClientSeam,
  type ChannelClientSocket,
  type ChannelConnection,
  type ChannelServerSeam,
} from "../../src/runtime/subagent-result-channel";
import type { PlacedChild } from "../../src/runtime/subagent-placement";
import { serializeOkEnvelope } from "../../src/runtime/subagent-envelope";

export class FakeConnection implements ChannelConnection {
  destroyed = false;
  #data: ((chunk: string) => void) | undefined;
  #close: (() => void) | undefined;
  onData(listener: (chunk: string) => void): void {
    this.#data = listener;
  }
  onClose(listener: () => void): void {
    this.#close = listener;
  }
  destroy(): void {
    this.destroyed = true;
  }
  /** The peer writes raw bytes (possibly several frames, possibly a partial one). */
  push(chunk: string): void {
    this.#data?.(chunk);
  }
  /** The peer closed its end. */
  close(): void {
    this.#close?.();
  }
}

export class FakeServer implements ChannelServerSeam {
  closed = false;
  #onConnection: ((connection: ChannelConnection) => void) | undefined;
  readonly port: number;
  constructor(port = 40001) {
    this.port = port;
  }
  listen(onConnection: (connection: ChannelConnection) => void): Promise<{ readonly port: number; close(): void }> {
    this.#onConnection = onConnection;
    return Promise.resolve({
      port: this.port,
      close: (): void => {
        this.closed = true;
      },
    });
  }
  /** A new dialer arrives. */
  dial(): FakeConnection {
    const connection = new FakeConnection();
    this.#onConnection?.(connection);
    return connection;
  }
}

export class FakeSocket implements ChannelClientSocket {
  readonly written: string[] = [];
  ended = false;
  #error: ((error: Error) => void) | undefined;
  #close: (() => void) | undefined;
  write(line: string): void {
    this.written.push(line);
  }
  end(): void {
    this.ended = true;
  }
  onError(listener: (error: Error) => void): void {
    this.#error = listener;
  }
  onClose(listener: () => void): void {
    this.#close = listener;
  }
  fail(): void {
    this.#error?.(new Error("ECONNREFUSED"));
  }
  peerClosed(): void {
    this.#close?.();
  }
}

export function fakeClient(): { seam: ChannelClientSeam; sockets: FakeSocket[]; ports: number[] } {
  const sockets: FakeSocket[] = [];
  const ports: number[] = [];
  return {
    sockets,
    ports,
    seam: {
      connect: (port): ChannelClientSocket => {
        ports.push(port);
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
    },
  };
}

export const TOKEN = "tok-0123";
export const NONCE = "nonce-4567";

export const hello = (token = TOKEN, nonce = NONCE): string =>
  encodeControlFrame({ type: "hello", token, nonce });
export const heartbeat = (): string => encodeControlFrame({ type: "heartbeat" });
export const stderrFrame = (line: string): string => encodeControlFrame({ type: "stderr", line });
export const envelope = (value: unknown = 42): string => serializeOkEnvelope(value, undefined);

/** A placed child whose backend cannot observe exit, with a kill counter. */
export function placedWithoutExit(): PlacedChild & { killed: number } {
  const placed = {
    handle: "pane-7",
    capabilities: { observesExit: false, inheritsEnv: true, visible: true },
    killed: 0,
    onExit: (): void => {},
    kill: (): void => {
      placed.killed += 1;
    },
  };
  return placed;
}
