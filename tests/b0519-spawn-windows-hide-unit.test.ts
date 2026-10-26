// Bug 0519: isolated production spawn-policy coverage, including the win32-only
// taskkill branch. These are unit tests with synthetic children, NOT evidence
// of OS execution or Windows console visibility. The separate real-spawn test
// covers actual child/exec execution without replacing the process primitive.
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  adaptChild,
  createProductionExecCommandRunner,
  createProductionSpawnFn,
} from "../src/extension/production-subagent-host";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;

class FakeChild extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly kill = vi.fn();

  readonly pid?: number;

  constructor(pid?: number) {
    super();
    if (pid !== undefined) this.pid = pid;
  }
}

function setPlatform(platform: "win32" | "linux"): void {
  Object.defineProperty(process, "platform", { ...originalPlatform, value: platform });
}

function returnChild(child: FakeChild): void {
  vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcess);
}

function expectDestroyed(child: FakeChild): void {
  expect([child.stdin.destroyed, child.stdout.destroyed, child.stderr.destroyed]).toEqual([true, true, true]);
}

beforeEach(() => {
  vi.mocked(spawn).mockReset();
});

afterEach(() => {
  Object.defineProperty(process, "platform", originalPlatform);
});

function launchChildWithContractChecks(): SpawnOptions {
  const child = new FakeChild();
  returnChild(child);
  const env = { B0519_UNIT: "child" };
  const args = ["entry with spaces.js", "argument & not a shell"];
  const handle = createProductionSpawnFn()("node-for-test", args, { cwd: "/unit-cwd", env });
  expect(spawn).toHaveBeenCalledTimes(1);
  const call = vi.mocked(spawn).mock.calls[0]!;
  expect(call[0]).toBe("node-for-test");
  expect(call[1]).toEqual(args);
  expect(call[1]).not.toBe(args);
  expect(call[2]).toMatchObject({ cwd: "/unit-cwd", env, shell: false, stdio: ["ignore", "pipe", "pipe"] });
  expect(call[2]?.env).toBe(env);
  const lines: string[] = [];
  const exits: unknown[] = [];
  handle.onStdoutLine((line) => lines.push(line));
  handle.onExit((info) => exits.push(info));
  child.stdout.emit("data", "unit value\n");
  child.emit("close", 0, null);
  expect(lines).toEqual(["unit value"]);
  expect(exits).toEqual([{ code: 0, signal: null }]);
  return call[2]!;
}

async function runExecWithContractChecks(): Promise<SpawnOptions> {
  const child = new FakeChild();
  returnChild(child);
  const env = { B0519_UNIT: "exec" };
  const pending = createProductionExecCommandRunner().run(
    ["exec-for-test", "argument & not a shell"],
    { cwd: "/unit-cwd", env, signal: new AbortController().signal },
  );
  expect(spawn).toHaveBeenCalledTimes(1);
  const call = vi.mocked(spawn).mock.calls[0]!;
  expect(call[0]).toBe("exec-for-test");
  expect(call[1]).toEqual(["argument & not a shell"]);
  expect(call[2]).toMatchObject({ cwd: "/unit-cwd", env, shell: false, stdio: ["ignore", "pipe", "pipe"] });
  expect(call[2]?.env).not.toBe(env);
  child.stdout.emit("data", "unit stdout");
  child.stderr.emit("data", "unit stderr");
  child.emit("close", 0, null);
  await expect(pending).resolves.toEqual({ code: 0, signal: null, stdout: "unit stdout", stderr: "unit stderr" });
  return call[2]!;
}

function killWindowsChildWithContractChecks(): SpawnOptions {
  setPlatform("win32");
  const child = new FakeChild(24680);
  const killer = new FakeChild();
  returnChild(killer);
  adaptChild(child).kill();
  expect(spawn).toHaveBeenCalledTimes(1);
  const call = vi.mocked(spawn).mock.calls[0]!;
  expect(call[0]).toBe("taskkill");
  expect(call[1]).toEqual(["/PID", "24680", "/T", "/F"]);
  expect(call[2]).toMatchObject({ shell: false });
  expect(child.kill).not.toHaveBeenCalled();
  expectDestroyed(child);
  expect(killer.listenerCount("error")).toBe(1);
  expect(() => killer.emit("error", new Error("synthetic asynchronous taskkill error"))).not.toThrow();
  return call[2]!;
}

describe.each(["win32", "linux"] as const)("bug 0519 — spawn policy on %s", (platform) => {
  beforeEach(() => setPlatform(platform));

  it("healthy control: SpawnFn preserves argv, cwd, env, stdio and adaptation", () => {
    launchChildWithContractChecks();
  });

  it("SpawnFn requires windowsHide", () => {
    const options = launchChildWithContractChecks();
    expect(options.windowsHide, "bug 0519 unit: SpawnFn requires windowsHide=true").toBe(true);
  });

  it("healthy control: exec preserves argv, cwd, env, stdio and result", async () => {
    await runExecWithContractChecks();
  });

  it("exec runner requires windowsHide", async () => {
    const options = await runExecWithContractChecks();
    expect(options.windowsHide, "bug 0519 unit: exec runner requires windowsHide=true").toBe(true);
  });
});

describe("bug 0519 — taskkill spawn policy", () => {
  it("healthy control: Windows kill keeps tree argv, no shell, pipe destruction and error handler", () => {
    killWindowsChildWithContractChecks();
  });

  it("taskkill requires windowsHide", () => {
    const options = killWindowsChildWithContractChecks();
    expect(options.windowsHide, "bug 0519 unit: taskkill requires windowsHide=true").toBe(true);
  });

  it.each([
    { platform: "linux" as const, pid: 24680 },
    { platform: "win32" as const, pid: undefined },
  ])("healthy control: $platform pid=$pid uses direct SIGKILL without spawning", ({ platform, pid }) => {
    setPlatform(platform);
    const child = new FakeChild(pid);
    adaptChild(child).kill();
    expect(spawn).not.toHaveBeenCalled();
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    expectDestroyed(child);
  });

  it("healthy control: synchronous taskkill spawn failure preserves direct kill fallback", () => {
    setPlatform("win32");
    const child = new FakeChild(12345);
    vi.mocked(spawn).mockImplementation(() => { throw new Error("synthetic spawn failure"); });
    expect(() => adaptChild(child).kill()).not.toThrow();
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    expectDestroyed(child);
  });

  it("healthy control: exec abort reaches Windows tree kill and rejects with the existing message", async () => {
    setPlatform("win32");
    const child = new FakeChild(12345);
    const killer = new FakeChild();
    vi.mocked(spawn)
      .mockReturnValueOnce(child as unknown as ChildProcess)
      .mockReturnValueOnce(killer as unknown as ChildProcess);
    const abort = new AbortController();
    const pending = createProductionExecCommandRunner().run(["exec-for-test"], {
      cwd: "/unit-cwd", env: {}, signal: abort.signal,
    });
    abort.abort();
    await expect(pending).rejects.toThrow("exec placement command aborted: exec-for-test");
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(vi.mocked(spawn).mock.calls[1]).toEqual([
      "taskkill", ["/PID", "12345", "/T", "/F"], expect.objectContaining({ shell: false }),
    ]);
    expectDestroyed(child);
    expect(child.kill).not.toHaveBeenCalled();
    child.emit("close", null, "SIGKILL");
  });
});
