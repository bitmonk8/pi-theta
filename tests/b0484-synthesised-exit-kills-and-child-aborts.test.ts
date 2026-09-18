// Bug 0484 — a synthesised channel exit (heartbeat silence / pre-envelope
// socket close) used to settle the invocation WITHOUT killing the placed
// child, and the child muted its own heartbeats on one write error and kept
// working headless. Witnesses (docs/bugs/0484, subagent.md §"Launch file and
// result channel", cancellation.md CNCL-4 third trigger):
//
//   parent — a settlement synthesised without an envelope kills the placed
//   child through the backend handle exactly once; the envelope path (Ok AND
//   Err — the §8 linger carve-out) never kills; the adapter's own kill() and
//   a real observed exit do not double-kill;
//
//   child — channel death (write error / observed close before the client's
//   own deliberate close) fires `onDead` exactly once, and the production
//   sweep (`abortInvocationsOnResultChannelDeath`) aborts every active
//   invocation with the pinned CNCL-4 reason, per-entry isolated, stamping
//   no `shutdownReason` (that field routes the session-shutdown clean-cancel
//   note, bug 0073 — wrong vocabulary here).

import { describe, expect, it } from "vitest";
import {
  adaptChannelToChildProcess,
  CHANNEL_CLOSED_SIGNAL,
  connectResultChannel,
  HEARTBEAT_SILENCE_SIGNAL,
  openResultChannel,
  RESULT_CHANNEL_HEARTBEAT_MS,
  RESULT_CHANNEL_SILENCE_BUDGET_MS,
  type ResultChannel,
} from "../src/runtime/subagent-result-channel";
import {
  abortInvocationsOnResultChannelDeath,
  RESULT_CHANNEL_DEATH_CANCEL_MESSAGE,
} from "../src/runtime/cancellation-core";
import type { ActiveInvocationEntry } from "../src/runtime/active-invocation-registry";
import { driveSubagentChild } from "../src/runtime/subagent-json-driver";
import type { ChildExitInfo } from "../src/runtime/subagent-launcher";
import type { PlacedChild } from "../src/runtime/subagent-placement";
import { serializeErrEnvelope } from "../src/runtime/subagent-envelope";
import { FakeClock } from "./helpers/fake-clock";
import {
  envelope,
  fakeClient,
  FakeConnection,
  FakeServer,
  hello,
  NONCE,
  placedWithoutExit,
  TOKEN,
} from "./helpers/result-channel-harness";

const BUDGET = 30_000;

async function openAdapted(placed: PlacedChild): Promise<{
  channel: ResultChannel;
  server: FakeServer;
  clock: FakeClock;
  settled: ChildExitInfo[];
  connect: () => FakeConnection;
}> {
  const server = new FakeServer();
  const clock = new FakeClock();
  const channel = await openResultChannel({ server, clock, token: TOKEN, nonce: NONCE, silenceBudgetMs: BUDGET });
  const settled: ChildExitInfo[] = [];
  adaptChannelToChildProcess(placed, channel).onExit((info) => settled.push(info));
  return {
    channel,
    server,
    clock,
    settled,
    connect: (): FakeConnection => {
      const connection = server.dial();
      connection.push(hello());
      return connection;
    },
  };
}

describe("bug 0484 — a synthesised settlement kills the placed child", () => {
  it("heartbeat silence expiry kills exactly once, atomically with the HEARTBEAT_SILENCE settlement", async () => {
    const placed = placedWithoutExit();
    const { clock, settled, connect } = await openAdapted(placed);
    connect();
    clock.advance(BUDGET - 1);
    expect(placed.killed).toBe(0);
    clock.advance(1);
    expect(placed.killed).toBe(1);
    expect(settled).toEqual([{ code: null, signal: HEARTBEAT_SILENCE_SIGNAL }]);
    clock.advance(BUDGET * 2);
    expect(placed.killed).toBe(1);
  });

  it("a child that never connects is killed at the budget measured from open", async () => {
    const placed = placedWithoutExit();
    const { clock } = await openAdapted(placed);
    clock.advance(BUDGET);
    expect(placed.killed).toBe(1);
  });

  it("a pre-envelope socket close kills exactly once with the CHANNEL_CLOSED settlement", async () => {
    const placed = placedWithoutExit();
    const { settled, connect } = await openAdapted(placed);
    const connection = connect();
    connection.close();
    expect(placed.killed).toBe(1);
    expect(settled).toEqual([{ code: null, signal: CHANNEL_CLOSED_SIGNAL }]);
    connection.close();
    expect(placed.killed).toBe(1);
  });

  it("the Ok envelope never kills — the settled child is not an abandonment", async () => {
    const placed = placedWithoutExit();
    const { settled, connect } = await openAdapted(placed);
    connect().push(envelope("done"));
    expect(settled).toEqual([{ code: 0, signal: null }]);
    expect(placed.killed).toBe(0);
  });

  it("the Err envelope never kills — the §8 linger carve-out applies exactly to a delivered envelope", async () => {
    const placed = placedWithoutExit();
    const { settled, connect } = await openAdapted(placed);
    connect().push(serializeErrEnvelope({ kind: "callee_error", message: "boom" } as never, undefined));
    expect(settled).toEqual([{ code: 0, signal: null }]);
    expect(placed.killed).toBe(0);
  });

  it("the adapter's own kill() does not double-kill through the synthesised-exit hook", async () => {
    const placed = placedWithoutExit();
    const server = new FakeServer();
    const clock = new FakeClock();
    const channel = await openResultChannel({ server, clock, token: TOKEN, nonce: NONCE, silenceBudgetMs: BUDGET });
    const child = adaptChannelToChildProcess(placed, channel);
    child.kill();
    expect(placed.killed).toBe(1);
  });

  it("a real exit observed by the backend (never-connected child) does not kill — the child already exited", async () => {
    let fireExit: ((info: ChildExitInfo) => void) | undefined;
    let killed = 0;
    const placed: PlacedChild = {
      handle: "h",
      capabilities: { observesExit: true, inheritsEnv: false, visible: false },
      onExit: (listener): void => {
        fireExit = listener;
      },
      kill: (): void => {
        killed += 1;
      },
    };
    const server = new FakeServer();
    const channel = await openResultChannel({
      server,
      clock: new FakeClock(),
      token: TOKEN,
      nonce: NONCE,
      silenceBudgetMs: BUDGET,
    });
    const exits: ChildExitInfo[] = [];
    adaptChannelToChildProcess(placed, channel).onExit((info) => exits.push(info));
    fireExit?.({ code: 3, signal: null });
    expect(exits).toEqual([{ code: 3, signal: null }]);
    expect(killed).toBe(0);
  });

  it("an adapter constructed after the channel already settled synthesised still kills (late replay)", async () => {
    const placed = placedWithoutExit();
    const server = new FakeServer();
    const clock = new FakeClock();
    const channel = await openResultChannel({ server, clock, token: TOKEN, nonce: NONCE, silenceBudgetMs: BUDGET });
    clock.advance(BUDGET);
    adaptChannelToChildProcess(placed, channel);
    await Promise.resolve();
    expect(placed.killed).toBe(1);
  });

  it("a throwing backend kill() is trapped (PIC-66 kill-throw rule) and the settlement still reaches the drive", async () => {
    const placed: PlacedChild = {
      handle: "h",
      capabilities: { observesExit: false, inheritsEnv: false, visible: true },
      onExit: (): void => {},
      kill: (): void => {
        throw new Error("pane already gone");
      },
    };
    const server = new FakeServer();
    const clock = new FakeClock();
    const channel = await openResultChannel({ server, clock, token: TOKEN, nonce: NONCE, silenceBudgetMs: BUDGET });
    const exits: ChildExitInfo[] = [];
    adaptChannelToChildProcess(placed, channel).onExit((info) => exits.push(info));
    expect(() => clock.advance(BUDGET)).not.toThrow();
    expect(exits).toEqual([{ code: null, signal: HEARTBEAT_SILENCE_SIGNAL }]);
  });

  it("drive-level: the crash-shape Err vocabulary is unchanged while the child is killed", async () => {
    const placed = placedWithoutExit();
    const server = new FakeServer();
    const clock = new FakeClock();
    const channel = await openResultChannel({ server, clock, token: TOKEN, nonce: NONCE, silenceBudgetMs: BUDGET });
    const drive = driveSubagentChild({
      child: adaptChannelToChildProcess(placed, channel),
      thetaAbort: new AbortController(),
      calleePath: "/w/callee.theta",
      emitDiagnostic: () => {},
    });
    clock.advance(BUDGET);
    const outcome = await drive;
    expect(outcome.ok).toBe(false);
    expect(JSON.stringify(outcome)).toContain(HEARTBEAT_SILENCE_SIGNAL);
    expect(placed.killed).toBe(1);
  });
});

describe("bug 0484 — the child treats channel death as fatal", () => {
  it("a socket write error fires onDead exactly once (error then close still once) and stops the heartbeat", () => {
    const client = fakeClient();
    const clock = new FakeClock();
    let dead = 0;
    connectResultChannel({
      client: client.seam,
      clock,
      port: 1,
      token: TOKEN,
      nonce: NONCE,
      onDead: (): void => {
        dead += 1;
      },
    });
    const socket = client.sockets[0]!;
    socket.fail();
    expect(dead).toBe(1);
    socket.peerClosed();
    expect(dead).toBe(1);
    clock.advance(RESULT_CHANNEL_HEARTBEAT_MS * 3);
    expect(socket.written).toEqual([hello()]);
  });

  it("an observed close before the client's own close fires onDead", () => {
    const client = fakeClient();
    let dead = 0;
    connectResultChannel({
      client: client.seam,
      clock: new FakeClock(),
      port: 1,
      token: TOKEN,
      nonce: NONCE,
      onDead: (): void => {
        dead += 1;
      },
    });
    client.sockets[0]!.peerClosed();
    expect(dead).toBe(1);
  });

  it("the client's own deliberate close() is not a death — the post-envelope shutdown stays silent", () => {
    const client = fakeClient();
    let dead = 0;
    const channel = connectResultChannel({
      client: client.seam,
      clock: new FakeClock(),
      port: 1,
      token: TOKEN,
      nonce: NONCE,
      onDead: (): void => {
        dead += 1;
      },
    });
    channel.close();
    client.sockets[0]!.peerClosed();
    expect(dead).toBe(0);
  });

  it("onDead is optional — the seam without it keeps the old no-throw posture", () => {
    const client = fakeClient();
    connectResultChannel({ client: client.seam, clock: new FakeClock(), port: 1, token: TOKEN, nonce: NONCE });
    expect(() => client.sockets[0]!.fail()).not.toThrow();
  });
});

describe("bug 0484 — the channel-death sweep over active invocations", () => {
  function entry(theta: string): ActiveInvocationEntry {
    return {
      thetaAbort: new AbortController(),
      disposeBarrier: Promise.resolve(),
      shutdownReason: undefined,
      theta,
      invocationId: `${theta}-id`,
    };
  }

  it("aborts every entry with the pinned CNCL-4 reason and stamps no shutdownReason", () => {
    const a = entry("a");
    const b = entry("b");
    abortInvocationsOnResultChannelDeath([a, b]);
    for (const swept of [a, b]) {
      expect(swept.thetaAbort.signal.aborted).toBe(true);
      expect((swept.thetaAbort.signal.reason as Error).message).toBe(RESULT_CHANNEL_DEATH_CANCEL_MESSAGE);
      expect(swept.shutdownReason).toBeUndefined();
    }
    expect(RESULT_CHANNEL_DEATH_CANCEL_MESSAGE).toBe("theta cancelled by result-channel death");
  });

  it("per-entry isolation: a throwing abort does not stop the sweep", () => {
    const throwing = entry("boom");
    Object.defineProperty(throwing.thetaAbort, "abort", {
      value: (): never => {
        throw new Error("defective controller");
      },
    });
    const after = entry("after");
    expect(() => abortInvocationsOnResultChannelDeath([throwing, after])).not.toThrow();
    expect(after.thetaAbort.signal.aborted).toBe(true);
  });

  it("the silence budget is decoupled: 120 s (12 missed 10 s beats), not the 30 s dispose budget", () => {
    expect(RESULT_CHANNEL_SILENCE_BUDGET_MS).toBe(120_000);
    expect(RESULT_CHANNEL_SILENCE_BUDGET_MS).toBe(12 * RESULT_CHANNEL_HEARTBEAT_MS);
  });
});
