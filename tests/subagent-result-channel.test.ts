// RFC-0012 §3 — the result channel: the wire off stdout for non-`pipe`
// placements. Parent side (`openResultChannel`, `adaptChannelToChildProcess`)
// and child side (`connectResultChannel`) over fake seams and the `FakeClock`;
// no socket, no process. Frames: `hello{token,nonce}` gates the connection,
// reserved-key lines (`theta_result` / `theta_progress`) pass through verbatim
// to the drive, `heartbeat` re-arms the silence budget, `stderr` mirrors crash
// detail. Settlement is synthesised: the envelope frame, the socket close
// (`CHANNEL_CLOSED`), or heartbeat silence (`HEARTBEAT_SILENCE`) — the last two
// mapped by the drive's existing `mapExitWithoutEnvelope` arm, so no new code
// is minted (DIAG-2).

import { describe, expect, it } from "vitest";
import {
  adaptChannelToChildProcess,
  CHANNEL_CLOSED_SIGNAL,
  classifyInboundFrame,
  connectResultChannel,
  HEARTBEAT_SILENCE_SIGNAL,
  openResultChannel,
  RESULT_CHANNEL_HEARTBEAT_MS,
  RESULT_CHANNEL_PRE_HELLO_MAX_BYTES,
  RESULT_CHANNEL_STDERR_LINE_CAP,
  type ChannelClientSeam,
  type ChannelClientSocket,
  type ResultChannel,
} from "../src/runtime/subagent-result-channel";
import { driveSubagentChild } from "../src/runtime/subagent-json-driver";
import type { ChildExitInfo } from "../src/runtime/subagent-launcher";
import type { PlacedChild } from "../src/runtime/subagent-placement";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { FakeClock } from "./helpers/fake-clock";
import {
  envelope,
  fakeClient,
  FakeServer,
  heartbeat,
  hello,
  NONCE,
  placedWithoutExit,
  stderrFrame,
  TOKEN,
} from "./helpers/result-channel-harness";

const BUDGET = 30_000;

async function open(overrides?: { server?: FakeServer; clock?: FakeClock }): Promise<{
  channel: ResultChannel;
  server: FakeServer;
  clock: FakeClock;
  lines: string[];
  stderr: string[];
  settled: ChildExitInfo[];
}> {
  const server = overrides?.server ?? new FakeServer();
  const clock = overrides?.clock ?? new FakeClock();
  const channel = await openResultChannel({ server, clock, token: TOKEN, nonce: NONCE, silenceBudgetMs: BUDGET });
  const lines: string[] = [];
  const stderr: string[] = [];
  const settled: ChildExitInfo[] = [];
  channel.onLine((line) => lines.push(line));
  channel.onStderrLine((line) => stderr.push(line));
  channel.onSettled((info) => settled.push(info));
  return { channel, server, clock, lines, stderr, settled };
}


// ---------------------------------------------------------------------------
// Frames.
// ---------------------------------------------------------------------------

describe("RFC-0012 §3 — inbound frame classification", () => {
  it("a theta_result line and a theta_progress line are reserved-key lines forwarded verbatim", () => {
    expect(classifyInboundFrame(envelope().trimEnd())).toEqual({ kind: "reserved-line", line: envelope().trimEnd() });
    const progress = JSON.stringify({ theta_progress: { v: 1, invocation_id: "x", seq: 1, event: { message: "m" } } });
    expect(classifyInboundFrame(progress)).toEqual({ kind: "reserved-line", line: progress });
  });

  it("control frames decode; a malformed control frame, other JSON and non-JSON are ignored", () => {
    expect(classifyInboundFrame(hello().trimEnd())).toEqual({ kind: "hello", token: TOKEN, nonce: NONCE });
    expect(classifyInboundFrame(heartbeat().trimEnd())).toEqual({ kind: "heartbeat" });
    expect(classifyInboundFrame(stderrFrame("boom").trimEnd())).toEqual({ kind: "stderr", line: "boom" });
    expect(classifyInboundFrame(JSON.stringify({ type: "hello", token: 1 }))).toEqual({ kind: "ignored" });
    expect(classifyInboundFrame(JSON.stringify({ type: "stderr" }))).toEqual({ kind: "ignored" });
    expect(classifyInboundFrame(JSON.stringify({ type: "abort" }))).toEqual({ kind: "ignored" });
    expect(classifyInboundFrame(JSON.stringify({ event: "message_end" }))).toEqual({ kind: "ignored" });
    expect(classifyInboundFrame("not json")).toEqual({ kind: "ignored" });
    expect(classifyInboundFrame("42")).toEqual({ kind: "ignored" });
  });
});

// ---------------------------------------------------------------------------
// Parent side — the hello gate.
// ---------------------------------------------------------------------------

describe("RFC-0012 §3 — the hello gate", () => {
  it("a well-formed hello with this launch's token AND nonce is accepted; reserved lines then reach the drive", async () => {
    const { channel, server, lines } = await open();
    expect(channel.port).toBe(40001);
    expect(channel.token).toBe(TOKEN);
    expect(channel.connected).toBe(false);
    const child = server.dial();
    child.push(hello());
    expect(channel.connected).toBe(true);
    expect(child.destroyed).toBe(false);
    const progress = `${JSON.stringify({ theta_progress: { v: 1 } })}\n`;
    child.push(progress);
    expect(lines).toEqual([progress.trimEnd()]);
  });

  it("a wrong token drops the connection before any other line is read", async () => {
    const { channel, server, lines } = await open();
    const stranger = server.dial();
    stranger.push(hello("wrong-token"));
    stranger.push(envelope());
    expect(stranger.destroyed).toBe(true);
    expect(channel.connected).toBe(false);
    expect(lines).toEqual([]);
  });

  it("a wrong nonce (a replayed launch file) drops the connection", async () => {
    const { channel, server } = await open();
    const replay = server.dial();
    replay.push(hello(TOKEN, "stale-nonce"));
    expect(replay.destroyed).toBe(true);
    expect(channel.connected).toBe(false);
  });

  it("a first line that is not a hello — even a valid envelope — drops the connection", async () => {
    const { channel, server, lines, settled } = await open();
    const eager = server.dial();
    eager.push(envelope());
    expect(eager.destroyed).toBe(true);
    expect(channel.connected).toBe(false);
    expect(lines).toEqual([]);
    expect(settled).toEqual([]);
  });

  it("a dropped dialer frees the slot: the real child still connects afterwards", async () => {
    const { channel, server } = await open();
    const stranger = server.dial();
    stranger.push("garbage\n");
    expect(stranger.destroyed).toBe(true);
    const child = server.dial();
    child.push(hello());
    expect(child.destroyed).toBe(false);
    expect(channel.connected).toBe(true);
  });

  it("a SECOND connection while one is accepted is destroyed unread", async () => {
    const { channel, server, lines } = await open();
    const child = server.dial();
    child.push(hello());
    const second = server.dial();
    expect(second.destroyed).toBe(true);
    second.push(hello());
    second.push(envelope());
    expect(lines).toEqual([]);
    expect(channel.connected).toBe(true);
  });

  it("a pre-hello stream past the byte cap is dropped unread; after the hello there is no cap (pipe parity)", async () => {
    const { channel, server, lines, settled } = await open();
    const flooder = server.dial();
    flooder.push("x".repeat(RESULT_CHANNEL_PRE_HELLO_MAX_BYTES + 1));
    expect(flooder.destroyed).toBe(true);
    const child = server.dial();
    child.push(hello());
    const big = envelope("y".repeat(RESULT_CHANNEL_PRE_HELLO_MAX_BYTES * 4));
    child.push(big);
    expect(child.destroyed).toBe(true); // released by settlement, not dropped
    expect(lines).toEqual([big.trimEnd()]);
    expect(settled).toEqual([{ code: 0, signal: null }]);
    expect(channel.connected).toBe(true);
  });

  it("frames split across chunks and several frames in one chunk are reassembled on LF", async () => {
    const { server, lines, stderr } = await open();
    const child = server.dial();
    const first = hello();
    child.push(first.slice(0, 5));
    child.push(first.slice(5));
    const progress = `${JSON.stringify({ theta_progress: { v: 1 } })}\n`;
    child.push(`${stderrFrame("a")}${progress}${stderrFrame("b")}`);
    expect(stderr).toEqual(["a", "b"]);
    expect(lines).toEqual([progress.trimEnd()]);
  });
});

// ---------------------------------------------------------------------------
// Parent side — synthesised settlement.
// ---------------------------------------------------------------------------

describe("RFC-0012 §3 — synthesised settlement", () => {
  it("the envelope frame settles {code:0, signal:null}, releases the listener, and a later frame or close is ignored", async () => {
    const { channel, server, lines, settled } = await open();
    const child = server.dial();
    child.push(hello());
    child.push(envelope(7));
    expect(settled).toEqual([{ code: 0, signal: null }]);
    expect(server.closed).toBe(true);
    expect(child.destroyed).toBe(true);
    child.push(envelope(8));
    child.close();
    expect(settled).toHaveLength(1);
    expect(lines).toHaveLength(1);
    channel.kill();
    expect(settled).toHaveLength(1);
  });

  it("socket close after the hello without an envelope settles with the CHANNEL_CLOSED pseudo-signal", async () => {
    const { server, settled } = await open();
    const child = server.dial();
    child.push(hello());
    child.close();
    expect(settled).toEqual([{ code: null, signal: CHANNEL_CLOSED_SIGNAL }]);
  });

  it("a dropped dialer's close does not settle the channel", async () => {
    const { server, settled } = await open();
    const stranger = server.dial();
    stranger.push(hello("nope"));
    stranger.close();
    expect(settled).toEqual([]);
  });

  it("heartbeat silence past the budget settles HEARTBEAT_SILENCE; every accepted frame re-arms the budget", async () => {
    const { server, clock, settled } = await open();
    const child = server.dial();
    child.push(hello());
    clock.advance(BUDGET - 1);
    child.push(heartbeat());
    clock.advance(BUDGET - 1);
    expect(settled).toEqual([]);
    child.push(stderrFrame("still here"));
    clock.advance(BUDGET - 1);
    expect(settled).toEqual([]);
    clock.advance(1);
    expect(settled).toEqual([{ code: null, signal: HEARTBEAT_SILENCE_SIGNAL }]);
    expect(server.closed).toBe(true);
  });

  it("a child that never connects settles HEARTBEAT_SILENCE at the budget measured from open (the drive never hangs)", async () => {
    const { clock, settled, server } = await open();
    clock.advance(BUDGET - 1);
    expect(settled).toEqual([]);
    clock.advance(1);
    expect(settled).toEqual([{ code: null, signal: HEARTBEAT_SILENCE_SIGNAL }]);
    expect(server.closed).toBe(true);
    // A late dialer is refused.
    const late = server.dial();
    expect(late.destroyed).toBe(true);
  });

  it("kill() settles SIGKILL and releases; settle(info) reports an externally observed exit; both idempotent", async () => {
    const a = await open();
    a.channel.kill();
    a.channel.kill();
    expect(a.settled).toEqual([{ code: null, signal: "SIGKILL" }]);
    expect(a.server.closed).toBe(true);
    const b = await open();
    b.channel.settle({ code: 3, signal: null });
    b.channel.kill();
    expect(b.settled).toEqual([{ code: 3, signal: null }]);
  });

  it("abandon() releases the listener WITHOUT settling", async () => {
    const { channel, server, settled, clock } = await open();
    channel.abandon();
    expect(server.closed).toBe(true);
    clock.advance(BUDGET * 2);
    expect(settled).toEqual([]);
  });

  it("onSettled replays to a late subscriber on a microtask", async () => {
    const { channel, server } = await open();
    const child = server.dial();
    child.push(hello());
    child.push(envelope());
    const late: ChildExitInfo[] = [];
    channel.onSettled((info) => late.push(info));
    expect(late).toEqual([]);
    await Promise.resolve();
    expect(late).toEqual([{ code: 0, signal: null }]);
  });

  it("onLine / onStderrLine return detach handles", async () => {
    const { channel, server } = await open();
    const seen: string[] = [];
    const detach = channel.onLine((line) => seen.push(line));
    const child = server.dial();
    child.push(hello());
    detach();
    child.push(`${JSON.stringify({ theta_progress: { v: 1 } })}\n`);
    expect(seen).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The adapter: the drive consumes a channel-backed child unchanged.
// ---------------------------------------------------------------------------

describe("RFC-0012 §7 — heartbeat frames surface as liveness", () => {
  it("onHeartbeat fires once per accepted heartbeat frame, never before the hello, and unsubscribes; the adapter exposes it as the child's onHeartbeat", async () => {
    const { channel, server } = await open();
    let direct = 0;
    let adapted = 0;
    const unsubscribe = channel.onHeartbeat(() => {
      direct += 1;
    });
    const child = adaptChannelToChildProcess(placedWithoutExit(), channel);
    child.onHeartbeat?.(() => {
      adapted += 1;
    });
    const peer = server.dial();
    // A heartbeat ahead of the hello is not a hello: the dialer is dropped.
    const stranger = server.dial();
    stranger.push(heartbeat());
    expect(direct).toBe(0);
    peer.push(hello());
    peer.push(heartbeat());
    peer.push(stderrFrame("noise"));
    peer.push(heartbeat());
    expect(direct).toBe(2);
    expect(adapted).toBe(2);
    unsubscribe();
    peer.push(heartbeat());
    expect(direct).toBe(2);
    expect(adapted).toBe(3);
  });
});

describe("RFC-0012 §3 — adaptChannelToChildProcess feeds driveSubagentChild unchanged", () => {
  it("an envelope over the channel is the drive's Ok — the same parse the stdout pipe gets", async () => {
    const { channel, server } = await open();
    const child = adaptChannelToChildProcess(placedWithoutExit(), channel);
    const diagnostics: Diagnostic[] = [];
    const result = driveSubagentChild({
      child,
      thetaAbort: new AbortController(),
      calleePath: "/w/callee.theta",
      emitDiagnostic: (d) => diagnostics.push(d),
    });
    const peer = server.dial();
    peer.push(hello());
    peer.push(envelope({ answer: 42 }));
    await expect(result).resolves.toEqual({ ok: true, value: { answer: 42 } });
    expect(diagnostics).toEqual([]);
  });

  it("socket close without an envelope is the drive's fail-closed exit-without-envelope arm, with the last mirrored stderr line as the crash hint", async () => {
    const { channel, server } = await open();
    const child = adaptChannelToChildProcess(placedWithoutExit(), channel);
    const diagnostics: Diagnostic[] = [];
    const result = driveSubagentChild({
      child,
      thetaAbort: new AbortController(),
      calleePath: "/w/callee.theta",
      emitDiagnostic: (d) => diagnostics.push(d),
    });
    const peer = server.dial();
    peer.push(hello());
    peer.push(stderrFrame("first"));
    peer.push(stderrFrame("TypeError: boom"));
    peer.close();
    const settled = await result;
    expect(settled.ok).toBe(false);
    if (settled.ok) {
      return;
    }
    expect((settled.error as { cause?: string }).cause).toBe("internal_error");
    expect(settled.source).toBe("boundary-minted");
    const crashed = diagnostics.find((d) => d.code === "theta/runtime/subagent-child-crashed");
    expect(crashed?.hint).toBe("TypeError: boom");
    expect(crashed?.message).toContain(CHANNEL_CLOSED_SIGNAL);
    expect(diagnostics.some((d) => d.code === "theta/runtime/subagent-exit-without-envelope")).toBe(true);
  });

  it("heartbeat silence maps through the same arm, naming HEARTBEAT_SILENCE", async () => {
    const { channel, server, clock } = await open();
    const child = adaptChannelToChildProcess(placedWithoutExit(), channel);
    const diagnostics: Diagnostic[] = [];
    const result = driveSubagentChild({
      child,
      thetaAbort: new AbortController(),
      calleePath: "/w/callee.theta",
      emitDiagnostic: (d) => diagnostics.push(d),
    });
    server.dial().push(hello());
    clock.advance(BUDGET);
    const settled = await result;
    expect(settled.ok).toBe(false);
    expect(diagnostics.find((d) => d.code === "theta/runtime/subagent-child-crashed")?.message).toContain(
      HEARTBEAT_SILENCE_SIGNAL,
    );
  });

  it("kill() kills through the backend AND settles the channel, so an aborted drive short-circuits to Err(cancelled) deterministically (PIC-66)", async () => {
    const { channel, server } = await open();
    const placed = placedWithoutExit();
    const child = adaptChannelToChildProcess(placed, channel);
    const thetaAbort = new AbortController();
    const result = driveSubagentChild({
      child,
      thetaAbort,
      calleePath: "/w/callee.theta",
      emitDiagnostic: () => {},
    });
    server.dial().push(hello());
    thetaAbort.abort();
    child.kill();
    expect(placed.killed).toBe(1);
    expect(server.closed).toBe(true);
    const settled = await result;
    expect(settled.ok).toBe(false);
    if (!settled.ok) {
      expect((settled.error as { kind?: string }).kind).toBe("cancelled");
    }
  });

  it("kill() still settles the channel when the backend's kill throws", async () => {
    const { channel, settled } = await open();
    const placed: PlacedChild = {
      handle: "h",
      capabilities: { observesExit: false, inheritsEnv: true, visible: true },
      onExit: (): void => {},
      kill: (): void => {
        throw new Error("pane.close failed");
      },
    };
    const child = adaptChannelToChildProcess(placed, channel);
    expect(() => child.kill()).toThrow("pane.close failed");
    expect(settled).toEqual([{ code: null, signal: "SIGKILL" }]);
  });

  it("closeStdin is an idempotent no-op (no stdin exists to release)", async () => {
    const { channel } = await open();
    const child = adaptChannelToChildProcess(placedWithoutExit(), channel);
    expect(() => {
      child.closeStdin();
      child.closeStdin();
    }).not.toThrow();
  });

  describe("a backend that observes exit", () => {
    function placedObservingExit(): PlacedChild & { fireExit: (info: ChildExitInfo) => void } {
      let exitListener: ((info: ChildExitInfo) => void) | undefined;
      return {
        handle: "pid-9",
        capabilities: { observesExit: true, inheritsEnv: false, visible: true },
        onExit: (listener): void => {
          exitListener = listener;
        },
        kill: (): void => {},
        fireExit: (info): void => {
          exitListener?.(info);
        },
      };
    }

    it("a connected child's observed exit is reported only once the channel settles — the envelope frame in flight is not lost", async () => {
      const { channel, server } = await open();
      const placed = placedObservingExit();
      const child = adaptChannelToChildProcess(placed, channel);
      const exits: ChildExitInfo[] = [];
      const lines: string[] = [];
      child.onExit((info) => exits.push(info));
      child.onStdoutLine((line) => lines.push(line));
      const peer = server.dial();
      peer.push(hello());
      placed.fireExit({ code: 0, signal: null });
      expect(exits).toEqual([]);
      peer.push(envelope(1));
      expect(lines).toHaveLength(1);
      expect(exits).toEqual([{ code: 0, signal: null }]);
    });

    it("a connected child's crash exit carries the REAL exit info after the socket closes", async () => {
      const { channel, server } = await open();
      const placed = placedObservingExit();
      const child = adaptChannelToChildProcess(placed, channel);
      const exits: ChildExitInfo[] = [];
      child.onExit((info) => exits.push(info));
      const peer = server.dial();
      peer.push(hello());
      placed.fireExit({ code: 1, signal: null });
      expect(exits).toEqual([]);
      peer.close();
      expect(exits).toEqual([{ code: 1, signal: null }]);
    });

    it("a child that never connected reports its observed exit at once and releases the listener", async () => {
      const { channel, server, settled } = await open();
      const placed = placedObservingExit();
      const child = adaptChannelToChildProcess(placed, channel);
      const exits: ChildExitInfo[] = [];
      child.onExit((info) => exits.push(info));
      placed.fireExit({ code: 2, signal: null });
      expect(exits).toEqual([{ code: 2, signal: null }]);
      expect(settled).toEqual([{ code: 2, signal: null }]);
      expect(server.closed).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Child side.
// ---------------------------------------------------------------------------



describe("RFC-0012 §3 — connectResultChannel (child side)", () => {
  it("dials the port, writes the hello FIRST with token and nonce, then heartbeats every period on the Clock", () => {
    const client = fakeClient();
    const clock = new FakeClock();
    connectResultChannel({ client: client.seam, clock, port: 40001, token: TOKEN, nonce: NONCE });
    expect(client.ports).toEqual([40001]);
    const socket = client.sockets[0]!;
    expect(socket.written).toEqual([hello()]);
    clock.advance(RESULT_CHANNEL_HEARTBEAT_MS - 1);
    expect(socket.written).toHaveLength(1);
    clock.advance(1);
    expect(socket.written).toEqual([hello(), heartbeat()]);
    clock.advance(RESULT_CHANNEL_HEARTBEAT_MS * 2);
    expect(socket.written).toEqual([hello(), heartbeat(), heartbeat(), heartbeat()]);
  });

  it("writeLine terminates a reserved-key line with exactly one LF; stderr frames are encoded and truncated to the line cap", () => {
    const client = fakeClient();
    const channel = connectResultChannel({ client: client.seam, clock: new FakeClock(), port: 1, token: TOKEN, nonce: NONCE });
    const socket = client.sockets[0]!;
    const line = envelope(1);
    channel.writeLine(line);
    channel.writeLine(line.trimEnd());
    expect(socket.written.slice(1)).toEqual([line, line]);
    channel.stderr("x".repeat(RESULT_CHANNEL_STDERR_LINE_CAP + 10));
    const frame = JSON.parse(socket.written[3]!.trimEnd()) as { type: string; line: string };
    expect(frame.type).toBe("stderr");
    expect(frame.line).toHaveLength(RESULT_CHANNEL_STDERR_LINE_CAP);
  });

  it("close() stops the heartbeat and ends the socket; later writes are no-ops; close is idempotent", () => {
    const client = fakeClient();
    const clock = new FakeClock();
    const channel = connectResultChannel({ client: client.seam, clock, port: 1, token: TOKEN, nonce: NONCE });
    const socket = client.sockets[0]!;
    channel.close();
    channel.close();
    expect(socket.ended).toBe(true);
    clock.advance(RESULT_CHANNEL_HEARTBEAT_MS * 3);
    channel.writeLine(envelope());
    channel.stderr("late");
    expect(socket.written).toEqual([hello()]);
  });

  it("a connection error (the parent is gone) stops the heartbeat and turns writes into no-ops — never a throw", () => {
    const client = fakeClient();
    const clock = new FakeClock();
    const channel = connectResultChannel({ client: client.seam, clock, port: 1, token: TOKEN, nonce: NONCE });
    const socket = client.sockets[0]!;
    socket.fail();
    clock.advance(RESULT_CHANNEL_HEARTBEAT_MS * 3);
    expect(() => channel.writeLine(envelope())).not.toThrow();
    expect(socket.written).toEqual([hello()]);
  });

  it("the peer closing (the parent settled and released) stops the heartbeat — a lingering Err child does not heartbeat into a dead socket", () => {
    const client = fakeClient();
    const clock = new FakeClock();
    connectResultChannel({ client: client.seam, clock, port: 1, token: TOKEN, nonce: NONCE });
    const socket = client.sockets[0]!;
    clock.advance(RESULT_CHANNEL_HEARTBEAT_MS);
    expect(socket.written).toHaveLength(2);
    socket.peerClosed();
    clock.advance(RESULT_CHANNEL_HEARTBEAT_MS * 5);
    expect(socket.written).toHaveLength(2);
  });

  it("round trip over the fakes: what the child writes is what the parent's drive settles on", async () => {
    const { channel: parent, server } = await open();
    const peer = server.dial();
    const client: ChannelClientSeam = {
      connect: (): ChannelClientSocket => ({
        write: (line): void => peer.push(line),
        end: (): void => peer.close(),
        onError: (): void => {},
        onClose: (): void => {},
      }),
    };
    const drive = driveSubagentChild({
      child: adaptChannelToChildProcess(placedWithoutExit(), parent),
      thetaAbort: new AbortController(),
      calleePath: "/w/callee.theta",
      emitDiagnostic: () => {},
    });
    const child = connectResultChannel({ client, clock: new FakeClock(), port: parent.port, token: TOKEN, nonce: NONCE });
    child.writeLine(envelope("done"));
    child.close();
    await expect(drive).resolves.toEqual({ ok: true, value: "done" });
  });
});
