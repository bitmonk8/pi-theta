// Bug 0519: observe the options actually handed to Node while still creating
// REAL OS processes. The spy delegates unchanged to node:child_process.spawn;
// neither child execution nor the production adapter/driver is faked.
//
// Linux cannot show a Windows console. These cells pin Node's windowsHide
// input (the portable regression oracle requested by the report), not conhost
// visibility. A Windows desktop/console-allocation probe is not provided here.
// The win32-only taskkill arm needs separate platform-branch isolation.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProductionExecCommandRunner } from "../src/extension/production-subagent-host";
import {
  CHILD_MODEL_ID,
  CHILD_MODEL_PROVIDER,
  dropScratchDir,
  requireRealSubagentPathsFor,
  runDrivenSubagentFixtureCell,
} from "./helpers/real-subagent-spawn";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, spawn: vi.fn(actual.spawn) };
});

const requirePaths = requireRealSubagentPathsFor(
  "bug 0519 needs the pinned real pi CLI and this worktree's extension; never skip",
);

beforeEach(() => {
  vi.mocked(spawn).mockClear();
});

async function driveHealthyRealChild(): Promise<void> {
  requirePaths();
  await runDrivenSubagentFixtureCell({
    tmpPrefix: "pi-theta-b0519-child-",
    fixtures: {},
    rootSource: '---\nmode: subagent\n---\n"B0519 CHILD OK"\n',
    provider: CHILD_MODEL_PROVIDER,
    model: CHILD_MODEL_ID,
    watchdogMs: 20_000,
    body: async ({ result, killedByWatchdog, diagnostics, exitPromise }) => {
      expect(killedByWatchdog, "healthy real child must not need a watchdog kill").toBe(false);
      expect(result, `real child result; diagnostics=${JSON.stringify(diagnostics)}`).toEqual({
        ok: true,
        value: "B0519 CHILD OK",
      });
      expect(await exitPromise, "real child must self-exit after its envelope").toEqual({
        code: 0,
        signal: null,
      });
    },
  });
  const calls = vi.mocked(spawn).mock.calls.filter(([command]) => command === process.execPath);
  expect(calls, "exactly one real production subagent launch").toHaveLength(1);
  expect(calls[0]![2]).toMatchObject({ shell: false, stdio: ["ignore", "pipe", "pipe"] });
}

async function driveHealthyExecCommand(): Promise<void> {
  const cwd = mkdtempSync(join(tmpdir(), "pi-theta-b0519-exec-"));
  const argument = "an argument with spaces & shell metacharacters";
  try {
    const result = await createProductionExecCommandRunner().run(
      [process.execPath, "-e", [
        'process.stdin.on("data", () => { throw new Error("unexpected stdin"); });',
        'process.stdin.on("end", () => {',
        'process.stdout.write(JSON.stringify([process.cwd(), process.env.B0519_MARKER, process.argv[1]]));',
        'process.stderr.write("B0519 STDERR");',
        '});',
        'process.stdin.resume();',
      ].join("\n"), argument],
      { cwd, env: { ...process.env, B0519_MARKER: "B0519 EXEC OK" }, signal: AbortSignal.timeout(10_000) },
    );
    expect(result, "real exec command preserves cwd/env/argv and receives stdin EOF").toEqual({
      code: 0,
      signal: null,
      stdout: JSON.stringify([cwd, "B0519 EXEC OK", argument]),
      stderr: "B0519 STDERR",
    });
    expect(vi.mocked(spawn).mock.calls, "exactly one real production exec command").toHaveLength(1);
    expect(vi.mocked(spawn).mock.calls[0]![2]).toMatchObject({
      cwd,
      env: expect.objectContaining({ B0519_MARKER: "B0519 EXEC OK" }),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } finally {
    dropScratchDir(cwd);
  }
}

describe("bug 0519 — real production spawn options", () => {
  it("healthy control: real subagent emits its value and exits normally", driveHealthyRealChild, 30_000);

  it("real subagent child requires windowsHide", async () => {
    await driveHealthyRealChild();
    const call = vi.mocked(spawn).mock.calls.find(([command]) => command === process.execPath)!;
    expect(call[2]?.windowsHide, "bug 0519: real subagent child requires windowsHide=true").toBe(true);
  }, 30_000);

  it("healthy control: real exec command preserves the launch contract", driveHealthyExecCommand, 15_000);

  it("exec template command requires windowsHide", async () => {
    await driveHealthyExecCommand();
    expect(
      vi.mocked(spawn).mock.calls[0]![2]?.windowsHide,
      "bug 0519: exec template command requires windowsHide=true",
    ).toBe(true);
  }, 15_000);
});
