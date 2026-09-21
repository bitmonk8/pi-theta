// RFC-0012 §1 — the subagent placement seam.
//
// The seam separates WHERE a child runs from WHAT it receives and returns.
// These cells pin the two properties the RFC makes load-bearing:
//   (1) the `pipe` backend is today's launch, byte for byte — the spawn record
//       `placeSubagentChild` produces through `createPipePlacementBackend`
//       equals the record `launchSubagentChild` produced through the raw
//       `SpawnFn` shorthand, for a theta entry;
//   (2) everything a backend receives is assembled ABOVE the seam (argv, env,
//       cwd, label, presentation, launch file, entry) and a backend that
//       cannot supply a process handle is served through the injected wire,
//       never through a silent `pipe` fallback.
// Plus the structural validation the registration protocol applies (§5) and
// the two argv forms (§7).

import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import {
  assembleSubagentArgv,
  launchSubagentChild,
  placeSubagentChild,
  prepareSubagentLaunch,
  PI_CLI_DIALECT,
  SUBAGENT_CONTROL_PLANE_ENV_KEYS,
  SUBAGENT_LAUNCH_ENTRY_ENV,
  SUBAGENT_LAUNCH_FLAG,
  type ExecutableHost,
  type SubagentChildProcess,
  type SubagentLaunchRequest,
} from "../src/runtime/subagent-launcher";
import {
  createPipePlacementBackend,
  isPipePlacement,
  placementInheritsEnv,
  placementIsVisible,
  RESERVED_PLACEMENT_NAMES,
  validatePlacementBackend,
  type PlacedChild,
  type SubagentPlacementBackend,
  type SubagentPlacementRequest,
} from "../src/runtime/subagent-placement";
import { SUBAGENT_ROOT_WINNER_ENV } from "../src/runtime/subagent-root-regime";
import { makeFakeJsonChildLauncher } from "./helpers/fake-json-child";

function host(overrides?: Partial<ExecutableHost>): ExecutableHost {
  return {
    argv1: "/app/pi/dist/cli.js",
    execPath: "/usr/bin/node",
    fileExists: (): boolean => true,
    isGenericRuntime: (p: string): boolean => p.endsWith("node"),
    ...overrides,
  };
}

function request(overrides?: Partial<SubagentLaunchRequest>): SubagentLaunchRequest {
  return {
    argv: {
      slug: "child",
      thetaDirs: ["/work/project/.pi/theta"],
      systemPrompt: "you are a subagent",
      hostTools: ["read"],
      respondToolNames: [],
      noHostTools: false,
      provider: "anthropic",
      model: "claude-sonnet",
      projectTrust: false,
    },
    cwd: "/work/project",
    parentEnv: { PATH: "/usr/bin", ANTHROPIC_API_KEY: "sk-xxx" },
    controlPlaneEnv: { [SUBAGENT_ROOT_WINNER_ENV]: "/work/project/.pi/theta/child.theta" },
    parentPid: 999,
    invokeDepth: 3,
    host: host(),
    ...overrides,
  };
}

const noDiag = (): void => {};

describe("RFC-0012 §1 — the `pipe` backend is today's launch, byte for byte", () => {
  it("placeSubagentChild over createPipePlacementBackend(spawn) records the same execPath / args / cwd / env as launchSubagentChild over the raw spawn shorthand", async () => {
    const viaShorthand = makeFakeJsonChildLauncher();
    const viaSeam = makeFakeJsonChildLauncher();

    const direct = launchSubagentChild(request(), { spawn: viaShorthand.spawn, emitDiagnostic: noDiag });
    const placed = await placeSubagentChild(request(), {
      placement: createPipePlacementBackend(viaSeam.spawn),
      emitDiagnostic: noDiag,
    });

    expect(direct.ok).toBe(true);
    expect(placed.ok).toBe(true);
    expect(viaShorthand.spawns).toHaveLength(1);
    expect(viaSeam.spawns).toHaveLength(1);
    const a = viaShorthand.spawns[0]!;
    const b = viaSeam.spawns[0]!;
    expect(b.execPath).toBe(a.execPath);
    expect(b.args).toEqual(a.args);
    expect(b.cwd).toBe(a.cwd);
    expect(b.env).toEqual(a.env);
    // No launch file under `pipe`: the argv carries no `--theta-launch`.
    expect(b.args).not.toContain(`--${SUBAGENT_LAUNCH_FLAG}`);
  });

  it("the placed child under `pipe` carries the process handle, observes exit, inherits env, and is not visible", async () => {
    const launcher = makeFakeJsonChildLauncher();
    const placed = await placeSubagentChild(request(), {
      placement: createPipePlacementBackend(launcher.spawn),
      emitDiagnostic: noDiag,
    });
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    expect(placed.placed.process).toBe(placed.child);
    expect(placed.placed.capabilities).toEqual({ observesExit: true, inheritsEnv: true, visible: false });
    expect(placed.placed.handle).toBe("child");
  });

  it("a theta entry writes NO entry env key — a `.theta` callee's env is unchanged by the RFC", () => {
    const prepared = prepareSubagentLaunch(request());
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.env[SUBAGENT_LAUNCH_ENTRY_ENV]).toBeUndefined();
    expect(prepared.entry).toEqual({ kind: "theta" });
    expect(prepared.presentation).toBe("headless");
    expect(prepared.label).toBe("child");
  });

  it("a fn entry rides the env control plane under `pipe` as JSON, inside the scrubbed per-launch set (§10)", () => {
    const prepared = prepareSubagentLaunch(
      request({ entry: { kind: "fn", name: "step" }, label: "child#step" }),
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.env[SUBAGENT_LAUNCH_ENTRY_ENV]).toBe(JSON.stringify({ kind: "fn", name: "step" }));
    expect(prepared.label).toBe("child#step");
    expect(SUBAGENT_CONTROL_PLANE_ENV_KEYS).toContain(SUBAGENT_LAUNCH_ENTRY_ENV);
    // A stale inherited entry is scrubbed like every other per-launch carrier
    // (bug 0474's rule extended to the new key).
    const inherited = prepareSubagentLaunch(
      request({ parentEnv: { [SUBAGENT_LAUNCH_ENTRY_ENV]: '{"kind":"fn","name":"stale"}' } }),
    );
    expect(inherited.ok).toBe(true);
    if (!inherited.ok) return;
    expect(inherited.env[SUBAGENT_LAUNCH_ENTRY_ENV]).toBeUndefined();
  });

  it("isPipePlacement recognises the built-in by its reserved name", () => {
    const pipe = createPipePlacementBackend(makeFakeJsonChildLauncher().spawn);
    expect(isPipePlacement(pipe)).toBe(true);
    expect(pipe.detect()).toBe(true);
    expect(placementIsVisible(pipe)).toBe(false);
    expect(placementInheritsEnv(pipe)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// A non-`pipe` backend: the request it receives, and the wire it needs.
// ---------------------------------------------------------------------------

function fakeChildProcess(): SubagentChildProcess {
  return {
    closeStdin: (): void => {},
    onStdoutLine: (): (() => void) => (): void => {},
    onStderrLine: (): (() => void) => (): void => {},
    onExit: (): void => {},
    kill: (): void => {},
  };
}

function fakePaneBackend(record: SubagentPlacementRequest[]): SubagentPlacementBackend {
  return {
    name: "fakepane",
    priority: 10,
    capabilities: { visible: true, inheritsEnv: true },
    detect: (): boolean => true,
    place: async (req): Promise<PlacedChild> => {
      record.push(req);
      return {
        handle: "pane:7",
        capabilities: { observesExit: false, inheritsEnv: true, visible: true },
        onExit: (): void => {},
        kill: (): void => {},
      };
    },
  };
}

describe("RFC-0012 §1 — a non-`pipe` backend receives the assembled launch and runs over the injected wire", () => {
  it("without a wired result channel a non-`pipe` placement is a spawn failure naming the wiring — never a silent `pipe` fallback", async () => {
    const emitted: Diagnostic[] = [];
    const placements: SubagentPlacementRequest[] = [];
    const result = await placeSubagentChild(request(), {
      placement: fakePaneBackend(placements),
      emitDiagnostic: (d): void => {
        emitted.push(d);
      },
    });
    expect(result).toEqual({ ok: false, reason: "spawn-failed" });
    expect(placements).toHaveLength(0);
    expect(emitted.map((d) => d.code)).toEqual(["theta/runtime/subagent-spawn-failed"]);
    expect(emitted[0]!.message).toContain("result channel");
  });

  it("with a wire: the launch file is opened BEFORE place(), its path rides argv as --theta-launch, and the backend sees label / visible presentation / launch file / context", async () => {
    const placements: SubagentPlacementRequest[] = [];
    const wireCalls: string[] = [];
    const adapted = fakeChildProcess();
    let abandoned = 0;
    const result = await placeSubagentChild(
      request({
        argv: { ...request().argv, presentation: "visible", label: "child·1a2b" },
        label: "child·1a2b",
        parallel: true,
      }),
      {
        placement: fakePaneBackend(placements),
        emitDiagnostic: noDiag,
        openWire: async (prepared) => {
          wireCalls.push(`opened:${prepared.presentation}`);
          return {
            launchFile: "/tmp/pi-theta-launch-x/launch.json",
            adapt: (): SubagentChildProcess => adapted,
            abandon: (): void => {
              abandoned += 1;
            },
          };
        },
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.child).toBe(adapted);
    expect(result.placed.handle).toBe("pane:7");
    expect(wireCalls).toEqual(["opened:visible"]);
    expect(abandoned).toBe(0);
    expect(placements).toHaveLength(1);
    const req = placements[0]!;
    expect(req.label).toBe("child·1a2b");
    expect(req.presentation).toBe("visible");
    expect(req.launchFile).toBe("/tmp/pi-theta-launch-x/launch.json");
    expect(req.context).toEqual({ invokeDepth: 3, parallel: true });
    expect(req.cwd).toBe("/work/project");
    const flagIdx = req.args.indexOf(`--${SUBAGENT_LAUNCH_FLAG}`);
    expect(flagIdx).toBeGreaterThan(-1);
    expect(req.args[flagIdx + 1]).toBe("/tmp/pi-theta-launch-x/launch.json");
    // The env a backend receives is the composed child env (control plane
    // included) — a backend that inherits env passes it through untouched.
    expect(req.env[SUBAGENT_ROOT_WINNER_ENV]).toBe("/work/project/.pi/theta/child.theta");
  });

  it("a place() rejection abandons the wire and is a spawn failure with the backend's reason in the message", async () => {
    const emitted: Diagnostic[] = [];
    let abandoned = 0;
    const result = await placeSubagentChild(request(), {
      placement: {
        name: "broken",
        priority: 1,
        detect: (): boolean => true,
        place: (): Promise<PlacedChild> => Promise.reject(new Error("pane server refused")),
      },
      emitDiagnostic: (d): void => {
        emitted.push(d);
      },
      openWire: async () => ({
        launchFile: "/tmp/x/launch.json",
        adapt: (): SubagentChildProcess => fakeChildProcess(),
        abandon: (): void => {
          abandoned += 1;
        },
      }),
    });
    expect(result).toEqual({ ok: false, reason: "spawn-failed" });
    expect(abandoned).toBe(1);
    expect(emitted[0]!.code).toBe("theta/runtime/subagent-spawn-failed");
    expect(emitted[0]!.message).toContain("pane server refused");
  });

  it("an unresolvable executable is the `unresolved` verdict before any wire is opened", async () => {
    let opened = 0;
    const result = await placeSubagentChild(
      request({ host: host({ argv1: undefined, execPath: "/usr/bin/node" }) }),
      {
        placement: fakePaneBackend([]),
        emitDiagnostic: noDiag,
        openWire: async () => {
          opened += 1;
          return {
            launchFile: "/tmp/x/launch.json",
            adapt: (): SubagentChildProcess => fakeChildProcess(),
            abandon: (): void => {},
          };
        },
      },
    );
    expect(result).toEqual({ ok: false, reason: "unresolved" });
    expect(opened).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// §7 — the two argv forms.
// ---------------------------------------------------------------------------

describe("RFC-0012 §7 — headless vs visible argv forms", () => {
  const base = {
    slug: "worker",
    thetaDirs: ["/roots/a"],
    systemPrompt: "sys",
    hostTools: ["read"],
    respondToolNames: [],
    noHostTools: false,
    provider: "anthropic",
    model: "m",
    projectTrust: false,
  };

  it("the headless form is the print form and is what an absent presentation selects", () => {
    const argv = assembleSubagentArgv(base, PI_CLI_DIALECT);
    expect(argv).toEqual(assembleSubagentArgv({ ...base, presentation: "headless" }, PI_CLI_DIALECT));
    expect(argv.slice(argv.indexOf("--mode"), argv.indexOf("--mode") + 5)).toEqual([
      "--mode",
      "json",
      "-p",
      "/worker",
      "--no-session",
    ]);
    expect(argv).not.toContain("--name");
  });

  it("the visible form drops --mode json / -p, titles the session with --name, keeps --no-session, and trails the bare slug as the LAST argv element (no `--` separator: the pin's parser has none)", () => {
    const argv = assembleSubagentArgv(
      { ...base, presentation: "visible", label: "worker·9f" },
      PI_CLI_DIALECT,
    );
    expect(argv).not.toContain("--mode");
    expect(argv).not.toContain("-p");
    expect(argv).not.toContain("--");
    expect(argv[argv.indexOf("--name") + 1]).toBe("worker·9f");
    expect(argv).toContain("--no-session");
    expect(argv[argv.length - 1]).toBe("/worker");
    // Every element before the trailing slug is a flag or a flag's value, so
    // the host's parser cannot read the slug as an unknown flag's value.
    expect(argv[argv.length - 2]).toBe("--no-approve");
  });

  it("the visible form omits --no-session when the backend persists the session (`persistSession`)", () => {
    const argv = assembleSubagentArgv(
      { ...base, presentation: "visible", label: "w", persistSession: true },
      PI_CLI_DIALECT,
    );
    expect(argv).not.toContain("--no-session");
    // The headless form ignores the knob: `--no-session` is part of the pinned
    // print form (the transcript is ephemeral by contract).
    const headless = assembleSubagentArgv({ ...base, persistSession: true }, PI_CLI_DIALECT);
    expect(headless).toContain("--no-session");
  });

  it("--theta-launch <path> is appended after --theta and before the mode group when a launch file is named", () => {
    const argv = assembleSubagentArgv({ ...base, launchFile: "/tmp/l/launch.json" }, PI_CLI_DIALECT);
    const idx = argv.indexOf(`--${SUBAGENT_LAUNCH_FLAG}`);
    expect(idx).toBeGreaterThan(argv.indexOf("--theta"));
    expect(idx).toBeLessThan(argv.indexOf("--mode"));
    expect(argv[idx + 1]).toBe("/tmp/l/launch.json");
  });
});

// ---------------------------------------------------------------------------
// §5 — structural validation of an offered backend.
// ---------------------------------------------------------------------------

describe("RFC-0012 §5 — validatePlacementBackend", () => {
  const valid = {
    name: "herdr",
    priority: 100,
    detect: (): boolean => false,
    place: (): Promise<PlacedChild> => Promise.reject(new Error("unused")),
  };

  it("accepts a well-formed backend and returns it typed", () => {
    const verdict = validatePlacementBackend(valid);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.backend.name).toBe("herdr");
  });

  it.each([
    [null, "<unnamed>", "not an object"],
    [{ ...valid, name: "Herdr" }, "Herdr", "^[a-z][a-z0-9-]{0,31}$"],
    [{ ...valid, name: "1x" }, "1x", "^[a-z][a-z0-9-]{0,31}$"],
    [{ ...valid, name: "a".repeat(33) }, "a".repeat(33), "^[a-z][a-z0-9-]{0,31}$"],
    [{ ...valid, name: 7 }, "<unnamed>", "^[a-z][a-z0-9-]{0,31}$"],
    [{ ...valid, priority: Number.NaN }, "herdr", "finite number"],
    [{ ...valid, priority: "1" }, "herdr", "finite number"],
    [{ ...valid, detect: true }, "herdr", "detect must be a function"],
    [{ ...valid, place: undefined }, "herdr", "place must be a function"],
  ] as const)("rejects %j naming '%s' with reason containing '%s'", (candidate, name, reason) => {
    const verdict = validatePlacementBackend(candidate);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.name).toBe(name);
      expect(verdict.reason).toContain(reason);
    }
  });

  it("refuses every reserved name (pipe / exec / auto)", () => {
    expect(RESERVED_PLACEMENT_NAMES).toEqual(["pipe", "exec", "auto"]);
    for (const name of RESERVED_PLACEMENT_NAMES) {
      const verdict = validatePlacementBackend({ ...valid, name });
      expect(verdict.ok).toBe(false);
      if (!verdict.ok) expect(verdict.reason).toContain("reserved");
    }
  });

  it("does not invoke detect() or place() while validating", () => {
    let invoked = 0;
    const verdict = validatePlacementBackend({
      ...valid,
      detect: (): boolean => {
        invoked += 1;
        return true;
      },
      place: (): Promise<PlacedChild> => {
        invoked += 1;
        return Promise.reject(new Error("unused"));
      },
    });
    expect(verdict.ok).toBe(true);
    expect(invoked).toBe(0);
  });
});
