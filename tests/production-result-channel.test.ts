// RFC-0012 §2/§3 — the production result-channel adapters and the wire a
// non-`pipe` placement runs over.
//
// Three tiers, all offline and provider-free:
//   1. `node:net` adapters — a real loopback listener and dialer round-trip the
//      hello + envelope (the one place a real socket is exercised; zero
//      processes, one ephemeral `127.0.0.1` port).
//   2. `createProductionSubagentWire` over fake fs / server / secret mint — the
//      launch file it writes carries the channel coordinates, the projected
//      control plane, the presentation and the entry; `abandon()` and
//      settlement delete it; `adapt()` hands the drive a channel-backed child.
//   3. The composition root — a child whose control plane names a channel
//      writes its envelope to the channel (never fd 1), mirrors its own error
//      diagnostics as `stderr` frames, exposes the client on the wiring; a
//      `pipe` child (no channel) exposes none.
import { resolvingHost } from "./helpers/fake-json-child";
import { makeIdleModelHost } from "./helpers/compose-workspace-harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  createProductionChannelClient,
  createProductionChannelServer,
  createProductionSecretMint,
  createProductionSubagentWire,
  RESULT_CHANNEL_HOST,
} from "../src/extension/production-result-channel";
import {
  composeExtensionInstance,
  type ComposeSeamOverrides,
} from "../src/extension/production-composition";
import {
  adaptChannelToChildProcess,
  connectResultChannel,
  openResultChannel,
  type ChannelConnection,
  type ChannelServerSeam,
  type ResultChannelClient,
} from "../src/runtime/subagent-result-channel";
import { driveSubagentChild } from "../src/runtime/subagent-json-driver";
import { serializeOkEnvelope, THETA_RESULT_KEY } from "../src/runtime/subagent-envelope";
import {
  LAUNCH_FILE_VERSION,
  type LaunchFileFs,
  type SubagentLaunchFileDocument,
} from "../src/runtime/subagent-launch-file";
import {
  SUBAGENT_INVOKE_DEPTH_ENV,
  SUBAGENT_PARENT_PID_ENV,
  type PreparedSubagentLaunch,
  type SubagentLaunchRequest,
} from "../src/runtime/subagent-launcher";
import { SUBAGENT_PARAMS_ENV } from "../src/runtime/subagent-params";
import type { PlacedChild } from "../src/runtime/subagent-placement";
import { SUBAGENT_ROOT_ENV_MARKER } from "../src/runtime/subagent-root-regime";
import { FakeClock } from "./helpers/fake-clock";

// ===========================================================================
// Tier 1 — node:net adapters.
// ===========================================================================

describe("RFC-0012 §3 — node:net adapters over the loopback interface", () => {
  it("the server binds an ephemeral 127.0.0.1 port; the client's hello + envelope settle the parent's drive; the client observes the release", async () => {
    const server = createProductionChannelServer();
    const clock = new FakeClock();
    const channel = await openResultChannel({ server, clock, token: "t", nonce: "n", silenceBudgetMs: 60_000 });
    expect(channel.port).toBeGreaterThan(0);
    expect(RESULT_CHANNEL_HOST).toBe("127.0.0.1");
    const placed: PlacedChild = {
      handle: "h",
      capabilities: { observesExit: false, inheritsEnv: true, visible: true },
      onExit: (): void => {},
      kill: (): void => {},
    };
    const drive = driveSubagentChild({
      child: adaptChannelToChildProcess(placed, channel),
      thetaAbort: new AbortController(),
      calleePath: "/w/callee.theta",
      emitDiagnostic: () => {},
    });
    const client = connectResultChannel({
      client: createProductionChannelClient(),
      clock,
      port: channel.port,
      token: "t",
      nonce: "n",
    });
    client.writeLine(serializeOkEnvelope({ over: "tcp" }, undefined));
    await expect(drive).resolves.toEqual({ ok: true, value: { over: "tcp" } });
    // The parent released on settlement; the client's later writes are no-ops
    // and close is clean.
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    expect(() => {
      client.writeLine("{}");
      client.close();
    }).not.toThrow();
  });

  it("a wrong token over a real socket is dropped: the drive stays unsettled and the socket is closed by the parent", async () => {
    const server = createProductionChannelServer();
    const clock = new FakeClock();
    const channel = await openResultChannel({ server, clock, token: "t", nonce: "n", silenceBudgetMs: 60_000 });
    let settled = false;
    channel.onSettled(() => {
      settled = true;
    });
    const raw = createProductionChannelClient().connect(channel.port);
    const closed = new Promise<void>((resolve) => raw.onClose(resolve));
    raw.write(`${JSON.stringify({ type: "hello", token: "WRONG", nonce: "n" })}\n`);
    raw.write(serializeOkEnvelope(1, undefined));
    await closed;
    expect(settled).toBe(false);
    expect(channel.connected).toBe(false);
    channel.abandon();
  });

  it("a client dialling a port nobody listens on reports the error once and never throws on write", async () => {
    // Bind and immediately close to obtain a port that is free.
    const probe = await createProductionChannelServer().listen(() => {});
    probe.close();
    const raw = createProductionChannelClient().connect(probe.port);
    let errorCount = 0;
    const closed = new Promise<void>((resolve) => raw.onClose(resolve));
    const errored = new Promise<void>((resolve) => raw.onError(() => {
      errorCount += 1;
      resolve();
    }));
    raw.write("hello\n");
    await errored;
    expect(() => raw.write("late\n")).not.toThrow();
    expect(() => raw.end()).not.toThrow();
    await closed;
    expect(errorCount).toBe(1);
  });

  it("the secret mint yields 32 lowercase hex characters and never repeats across a batch", () => {
    const mint = createProductionSecretMint();
    const batch = new Set(Array.from({ length: 64 }, () => mint()));
    expect(batch.size).toBe(64);
    for (const secret of batch) {
      expect(secret).toMatch(/^[0-9a-f]{32}$/);
    }
  });
});

// ===========================================================================
// Tier 2 — the wire.
// ===========================================================================

interface FakeLaunchFs extends LaunchFileFs {
  readonly files: Map<string, string>;
  readonly dirs: Set<string>;
}

function fakeLaunchFs(options?: { failWrite?: boolean }): FakeLaunchFs {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  let n = 0;
  return {
    files,
    dirs,
    mkdtemp: (prefix): string => {
      n += 1;
      const dir = `/tmp/${prefix}${n}`;
      dirs.add(dir);
      return dir;
    },
    writeFile: (path, contents): void => {
      if (options?.failWrite) {
        throw Object.assign(new Error("EACCES: launch dir"), { code: "EACCES" });
      }
      files.set(path, contents);
    },
    readFile: (path): string => {
      const c = files.get(path);
      if (c === undefined) throw new Error("ENOENT");
      return c;
    },
    unlink: (path): void => {
      if (!files.delete(path)) throw new Error("ENOENT");
    },
    rmdir: (path): void => {
      if (!dirs.delete(path)) throw new Error("ENOENT");
    },
    ownerUid: (): undefined => undefined,
    currentUid: (): undefined => undefined,
  };
}

class FakeWireServer implements ChannelServerSeam {
  closed = false;
  connect: ((connection: ChannelConnection) => void) | undefined;
  listen(onConnection: (connection: ChannelConnection) => void): Promise<{ readonly port: number; close(): void }> {
    this.connect = onConnection;
    return Promise.resolve({
      port: 45000,
      close: (): void => {
        this.closed = true;
      },
    });
  }
}

function preparedLaunch(): Extract<PreparedSubagentLaunch, { ok: true }> {
  return {
    ok: true,
    execPath: "/usr/bin/node",
    args: ["/app/pi/cli.js", "--mode", "json"],
    cwd: "/w",
    env: {
      PATH: "/usr/bin",
      ANTHROPIC_API_KEY: "never-in-the-file",
      [SUBAGENT_ROOT_ENV_MARKER]: "worker",
      [SUBAGENT_PARENT_PID_ENV]: "77",
      [SUBAGENT_INVOKE_DEPTH_ENV]: "1",
      [SUBAGENT_PARAMS_ENV]: '{"n":1}',
    },
    label: "worker",
    presentation: "visible",
    entry: { kind: "fn", name: "step" },
  };
}

const REQUEST = {} as unknown as SubagentLaunchRequest;

describe("RFC-0012 §2/§3 — createProductionSubagentWire", () => {
  it("opens the channel first, then writes the launch file carrying its coordinates, the projected control plane (control-plane keys only), the presentation, the entry and a distinct nonce/token", async () => {
    const fs = fakeLaunchFs();
    const server = new FakeWireServer();
    let k = 0;
    const secrets = ["token-a", "nonce-b"];
    const openWire = createProductionSubagentWire({
      clock: new FakeClock(),
      launchFs: fs,
      server,
      mintSecret: (): string => secrets[k++]!,
    });
    const wire = await openWire(preparedLaunch(), REQUEST);
    expect(wire.launchFile).toBe("/tmp/pi-theta-launch-1/launch.json");
    const document = JSON.parse(fs.files.get(wire.launchFile)!) as SubagentLaunchFileDocument;
    expect(document).toEqual({
      v: LAUNCH_FILE_VERSION,
      nonce: "nonce-b",
      controlPlane: {
        [SUBAGENT_ROOT_ENV_MARKER]: "worker",
        [SUBAGENT_PARENT_PID_ENV]: "77",
        [SUBAGENT_INVOKE_DEPTH_ENV]: "1",
        [SUBAGENT_PARAMS_ENV]: '{"n":1}',
      },
      channel: { port: 45000, token: "token-a" },
      presentation: "visible",
      entry: { kind: "fn", name: "step" },
    });
    expect(JSON.stringify(document)).not.toContain("never-in-the-file");
    wire.abandon();
    expect(fs.files.size).toBe(0);
    expect(fs.dirs.size).toBe(0);
    expect(server.closed).toBe(true);
  });

  it("a launch-file write failure releases the channel and propagates (the caller maps it to spawn-failed)", async () => {
    const server = new FakeWireServer();
    const openWire = createProductionSubagentWire({
      clock: new FakeClock(),
      launchFs: fakeLaunchFs({ failWrite: true }),
      server,
      mintSecret: createProductionSecretMint(),
    });
    await expect(openWire(preparedLaunch(), REQUEST)).rejects.toThrow("EACCES");
    expect(server.closed).toBe(true);
  });

  it("adapt() yields a channel-backed child whose settlement deletes the launch file (backstop for a child that never read it)", async () => {
    const fs = fakeLaunchFs();
    const server = new FakeWireServer();
    const clock = new FakeClock();
    const openWire = createProductionSubagentWire({
      clock,
      launchFs: fs,
      server,
      mintSecret: createProductionSecretMint(),
      silenceBudgetMs: 1000,
    });
    const wire = await openWire(preparedLaunch(), REQUEST);
    expect(fs.files.size).toBe(1);
    const placed: PlacedChild = {
      handle: "pane",
      capabilities: { observesExit: false, inheritsEnv: false, visible: true },
      onExit: (): void => {},
      kill: (): void => {},
    };
    const child = wire.adapt(placed);
    const exits: unknown[] = [];
    child.onExit((info) => exits.push(info));
    clock.advance(1000);
    expect(exits).toEqual([{ code: null, signal: "HEARTBEAT_SILENCE" }]);
    expect(fs.files.size).toBe(0);
  });

  it("the default silence budget is the PIC-65 dispose budget (30 s)", async () => {
    const clock = new FakeClock();
    const openWire = createProductionSubagentWire({
      clock,
      launchFs: fakeLaunchFs(),
      server: new FakeWireServer(),
      mintSecret: createProductionSecretMint(),
    });
    const wire = await openWire(preparedLaunch(), REQUEST);
    const child = wire.adapt({
      handle: "h",
      capabilities: { observesExit: false, inheritsEnv: true, visible: true },
      onExit: (): void => {},
      kill: (): void => {},
    });
    const exits: unknown[] = [];
    child.onExit((info) => exits.push(info));
    clock.advance(29_999);
    expect(exits).toEqual([]);
    clock.advance(1);
    expect(exits).toHaveLength(1);
  });
});

// ===========================================================================
// Tier 3 — the composition root.
// ===========================================================================

const MISSING_CALLEE_ENTRY = "./no-such-callee.theta";

let workspaceDir: string;

beforeAll(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-rfc0012-channel-compose-"));
  const dir = join(workspaceDir, ".pi", "theta");
  mkdirSync(dir, { recursive: true });
  // A marked root that REFUSES to register (unresolvable `tools:` path) — the
  // one load-pass path that writes an envelope without a drive (bug 0178 (b)).
  writeFileSync(
    join(dir, "refused.theta"),
    ["---", "mode: subagent", "tools:", `  - ${MISSING_CALLEE_ENTRY}`, "---", '"x"', ""].join("\n"),
    "utf8",
  );
  writeFileSync(join(dir, "clean.theta"), ["---", "mode: subagent", "---", '"ok"', ""].join("\n"), "utf8");
});

afterAll(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
});

function fakeHost(): { pi: ExtensionAPI; ctx: ExtensionContext } {
  return makeIdleModelHost(workspaceDir, true);
}

function fakeChannelClient(): ResultChannelClient & { lines: string[]; mirrored: string[]; closed: number } {
  const client = {
    lines: [] as string[],
    mirrored: [] as string[],
    closed: 0,
    writeLine: (line: string): void => {
      client.lines.push(line);
    },
    stderr: (line: string): void => {
      client.mirrored.push(line);
    },
    close: (): void => {
      client.closed += 1;
    },
  };
  return client;
}

describe("RFC-0012 §3 — the composition root routes the child's envelope to its result channel", () => {
  it("a child whose control plane names a channel writes the marked-root refusal envelope to the channel, mirrors the refusal diagnostic as a stderr frame, and exposes the client on the wiring", async () => {
    const { pi, ctx } = fakeHost();
    const client = fakeChannelClient();
    const overrides: ComposeSeamOverrides = {
      subagentExecutableHost: resolvingHost(),
      subagentControlPlane: {
        env: {
          PATH: "/usr/bin",
          [SUBAGENT_ROOT_ENV_MARKER]: "refused",
          [SUBAGENT_PARENT_PID_ENV]: "1",
        },
        entry: { kind: "theta" },
        launch: { nonce: "n", presentation: "visible", channel: { port: 45000, token: "t" } },
      },
      subagentResultChannel: client,
    };
    const wiring = await composeExtensionInstance(pi, ctx, overrides);
    expect(wiring.resultChannel).toBe(client);
    expect(wiring.thetas.map((t) => t.slashName)).not.toContain("refused");
    expect(client.lines).toHaveLength(1);
    const envelope = JSON.parse(client.lines[0]!) as Record<string, Record<string, unknown>>;
    const err = envelope[THETA_RESULT_KEY]?.["err"] as Record<string, unknown> | undefined;
    expect(err?.["kind"]).toBe("invoke_infra");
    expect(err?.["cause"]).toBe("load_failure");
    expect(client.mirrored.some((line) => line.startsWith("theta/load/unresolvable-theta-path: "))).toBe(true);
    expect(client.closed).toBe(0);
  });

  it("an explicit emitResultEnvelope override still wins over the channel (the test seam is authoritative)", async () => {
    const { pi, ctx } = fakeHost();
    const client = fakeChannelClient();
    const captured: string[] = [];
    const wiring = await composeExtensionInstance(pi, ctx, {
      subagentExecutableHost: resolvingHost(),
      subagentControlPlane: {
        env: { [SUBAGENT_ROOT_ENV_MARKER]: "refused", [SUBAGENT_PARENT_PID_ENV]: "1" },
        entry: { kind: "theta" },
        launch: { nonce: "n", presentation: "headless", channel: { port: 45000, token: "t" } },
      },
      subagentResultChannel: client,
      emitResultEnvelope: (line): void => {
        captured.push(line);
      },
    });
    expect(wiring.resultChannel).toBe(client);
    expect(captured).toHaveLength(1);
    expect(client.lines).toEqual([]);
  });

  it("a pipe child (no channel on its control plane) exposes no result channel and dials nothing", async () => {
    const { pi, ctx } = fakeHost();
    const wiring = await composeExtensionInstance(pi, ctx, {
      subagentExecutableHost: resolvingHost(),
      subagentControlPlane: {
        env: { [SUBAGENT_ROOT_ENV_MARKER]: "clean", [SUBAGENT_PARENT_PID_ENV]: "1" },
        entry: { kind: "theta" },
      },
      emitResultEnvelope: (): void => {},
    });
    expect(wiring.resultChannel).toBeUndefined();
    expect(wiring.thetas.map((t) => t.slashName)).toContain("clean");
  });

  it("a parent process (no regime) exposes no result channel", async () => {
    const { pi, ctx } = fakeHost();
    const wiring = await composeExtensionInstance(pi, ctx, {
      subagentExecutableHost: resolvingHost(),
      subagentControlPlane: { env: {}, entry: { kind: "theta" } },
      emitResultEnvelope: (): void => {},
    });
    expect(wiring.resultChannel).toBeUndefined();
  });
});
