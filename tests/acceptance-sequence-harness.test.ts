// Offline checks for the shared H9a sequence: real scratch files, recorded host drives.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { driveAcceptanceSequence } from "./helpers/acceptance-sequence-harness";
import { requireLiveHost, spawnPiPrint } from "./live/acceptance/harness";

vi.mock("./live/acceptance/harness", () => ({
  requireLiveHost: vi.fn(),
  spawnPiPrint: vi.fn(),
}));

let serial = 0;
let slug: string;
let created: string[];
const files = { "control.theta": "control", "sub/util.thetalib": "library" };
const drives = [
  { label: "control", slashInvocation: "/control", expected: "1041", message: () => "control observable" },
  { label: "diamond", slashInvocation: "/diamond", expected: "206", message: () => "diamond observable" },
  { label: "probe", slashInvocation: "/probe", expected: "REFUSED", unexpected: "LOADED", message: () => "probe observable" },
];

function scratchPaths(): string[] {
  return readdirSync(tmpdir())
    .filter((name) => name.startsWith(`theta-${slug}-`))
    .map((name) => join(tmpdir(), name));
}

beforeEach(() => {
  vi.resetAllMocks();
  slug = `sequence-test-${process.pid}-${serial++}`;
  created = [];
  vi.mocked(requireLiveHost).mockResolvedValue({ modelId: "test-model" });
  vi.mocked(spawnPiPrint).mockImplementation(async ({ thetaDir, cwd, slashInvocation }) => {
    expect(requireLiveHost).toHaveBeenCalledOnce();
    expect(existsSync(cwd)).toBe(true);
    for (const [name, source] of Object.entries(files)) {
      expect(readFileSync(join(thetaDir!, name), "utf8")).toBe(source);
    }
    created = scratchPaths();
    expect(created).toHaveLength(4);
    const drive = drives.find((entry) => entry.slashInvocation === slashInvocation)!;
    return { exitCode: 0, stdout: drive.expected, stderr: "" };
  });
});

afterEach(() => {
  const remaining = scratchPaths();
  try {
    expect(remaining, "the discovery root and all cwds must be removed").toEqual([]);
    for (const path of created) expect(existsSync(path)).toBe(false);
  } finally {
    for (const path of remaining) rmSync(path, { recursive: true, force: true });
  }
});

describe("driveAcceptanceSequence", () => {
  it("plants nested fixtures, drives both controls before the probe in distinct cwds, and tears down", async () => {
    await driveAcceptanceSequence({ slug, files, drives });
    const calls = vi.mocked(spawnPiPrint).mock.calls.map(([options]) => options);
    expect(calls.map((call) => call.slashInvocation)).toEqual(["/control", "/diamond", "/probe"]);
    expect(new Set(calls.map((call) => call.thetaDir)).size).toBe(1);
    expect(new Set(calls.map((call) => call.cwd)).size).toBe(3);
    expect(created).toHaveLength(4);
  });

  it.each([
    { at: 0, exitCode: 1, stdout: "1041", message: "control: expected a no-error exit" },
    { at: 0, exitCode: 0, stdout: "", message: "control observable" },
    { at: 1, exitCode: 0, stdout: "", message: "diamond observable" },
    { at: 2, exitCode: 0, stdout: "LOADED", message: "probe observable" },
    { at: 2, exitCode: 0, stdout: "REFUSED LOADED", message: "probe: the Ok arm must not fire" },
  ])("rejects a bad observable at drive $at ($message), stops, and tears down", async ({ at, exitCode, stdout, message }) => {
    const good = vi.mocked(spawnPiPrint).getMockImplementation()!;
    vi.mocked(spawnPiPrint).mockImplementation(async (options) => {
      const result = await good(options);
      return vi.mocked(spawnPiPrint).mock.calls.length === at + 1
        ? { exitCode, stdout, stderr: "fixture failure" }
        : result;
    });
    await expect(driveAcceptanceSequence({ slug, files, drives })).rejects.toThrow(message);
    expect(spawnPiPrint).toHaveBeenCalledTimes(at + 1);
  });

  it("tears down every directory when a spawn rejects", async () => {
    const good = vi.mocked(spawnPiPrint).getMockImplementation()!;
    vi.mocked(spawnPiPrint).mockImplementation(async (options) => {
      await good(options);
      throw new Error("spawn failed");
    });
    await expect(driveAcceptanceSequence({ slug, files, drives })).rejects.toThrow("spawn failed");
    expect(spawnPiPrint).toHaveBeenCalledOnce();
  });

  it("propagates a missing-host failure before creating directories or spawning", async () => {
    vi.mocked(requireLiveHost).mockRejectedValue(new Error("live-host precondition unmet"));
    await expect(driveAcceptanceSequence({ slug, files, drives })).rejects.toThrow("live-host precondition unmet");
    expect(spawnPiPrint).not.toHaveBeenCalled();
  });
});
