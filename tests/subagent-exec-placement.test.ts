// RFC-0012 §4 — the `exec` placement backend: an operator-supplied argv
// template places the child. Template validation (closed key set, exactly one
// whole-element `{argv}`), expansion (`{argv}` splices elements — never a
// joined string; `{cwd}` / `{label}` / `{handle}` substitute in place), the
// `when` gate, the handle from the first stdout line, spawn failure on a
// non-zero exit / empty handle / runner rejection / command bound, and the kill
// template. Over a fake runner and the FakeClock; one cell drives the
// production runner against a real `node -e` child (provider-free).

import { describe, expect, it } from "vitest";
import {
  createExecPlacementBackend,
  EXEC_ARGV_PLACEHOLDER,
  EXEC_COMMAND_TIMEOUT_MS,
  expandExecTemplate,
  parseExecPlacementTemplate,
  type ExecCommandResult,
  type ExecCommandRunner,
  type ExecPlacementTemplate,
} from "../src/runtime/subagent-exec-placement";
import { createProductionExecCommandRunner } from "../src/extension/production-subagent-host";
import { SUBAGENT_DISPOSE_BUDGET_MS } from "../src/runtime/subagent-isolation";
import { placeSubagentChild, type SubagentLaunchRequest } from "../src/runtime/subagent-launcher";
import type { SubagentPlacementRequest } from "../src/runtime/subagent-placement";
import { EXEC_PLACEMENT_NAME } from "../src/runtime/subagent-placement";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { FakeClock } from "./helpers/fake-clock";

const TMUX: ExecPlacementTemplate = {
  when: { env: "TMUX" },
  spawn: ["tmux", "new-window", "-d", "-P", "-F", "#{pane_id}", "-c", "{cwd}", "-n", "theta {label}", EXEC_ARGV_PLACEHOLDER],
  kill: ["tmux", "kill-pane", "-t", "{handle}"],
  env: "inherit",
};

function request(overrides?: Partial<SubagentPlacementRequest>): SubagentPlacementRequest {
  return {
    execPath: "/usr/bin/node",
    args: ["/app/pi/cli.js", "--theta", "/roots", "--name", "worker", "/worker"],
    cwd: "/w",
    env: { PATH: "/usr/bin", PI_THETA_SUBAGENT_ROOT: "worker" },
    label: "worker",
    presentation: "visible",
    launchFile: "/tmp/x/launch.json",
    context: { invokeDepth: 0, parallel: false },
    ...overrides,
  };
}

interface RecordedRun {
  argv: readonly string[];
  cwd: string;
  env: Readonly<Record<string, string | undefined>>;
}

function fakeRunner(
  script: (argv: readonly string[]) => ExecCommandResult | Promise<ExecCommandResult>,
): ExecCommandRunner & { runs: RecordedRun[] } {
  const runs: RecordedRun[] = [];
  return {
    runs,
    run: async (argv, options): Promise<ExecCommandResult> => {
      runs.push({ argv, cwd: options.cwd, env: options.env });
      return script(argv);
    },
  };
}

const ok = (stdout: string, stderr = ""): ExecCommandResult => ({ code: 0, signal: null, stdout, stderr });

describe("RFC-0012 §4 — parseExecPlacementTemplate", () => {
  it("accepts the tmux recipe from the RFC and defaults `env` to none", () => {
    const parsed = parseExecPlacementTemplate({
      when: { env: "TMUX" },
      spawn: ["tmux", "new-window", "-d", "-P", "-F", "#{pane_id}", "-c", "{cwd}", "-n", "{label}", "{argv}"],
      kill: ["tmux", "kill-pane", "-t", "{handle}"],
    });
    expect(parsed).toEqual({
      ok: true,
      template: {
        when: { env: "TMUX" },
        spawn: ["tmux", "new-window", "-d", "-P", "-F", "#{pane_id}", "-c", "{cwd}", "-n", "{label}", "{argv}"],
        kill: ["tmux", "kill-pane", "-t", "{handle}"],
        env: "none",
      },
    });
  });

  it("accepts a minimal template (spawn only) and `env: inherit`", () => {
    expect(parseExecPlacementTemplate({ spawn: ["wezterm", "cli", "spawn", "--", "{argv}"], env: "inherit" })).toEqual({
      ok: true,
      template: { spawn: ["wezterm", "cli", "spawn", "--", "{argv}"], env: "inherit" },
    });
  });

  it.each([
    ["not an object", 42, "must be an object"],
    ["an array", [], "must be an object"],
    ["unknown key (a typo must not pass as 'no kill template')", { spawn: ["{argv}"], kil: ["x"] }, "unknown key 'kil'"],
    ["spawn missing", { kill: ["x"] }, "`spawn` must be a non-empty array"],
    ["spawn empty", { spawn: [] }, "`spawn` must be a non-empty array"],
    ["spawn with a non-string", { spawn: ["tmux", 1, "{argv}"] }, "`spawn` must be a non-empty array"],
    ["spawn without {argv}", { spawn: ["tmux", "new-window"] }, "exactly one `{argv}` element"],
    ["spawn with two {argv}", { spawn: ["{argv}", "{argv}"] }, "exactly one `{argv}` element"],
    ["{argv} inside a larger string (would join the child argv)", { spawn: ["sh", "-c", "run {argv}"] }, "exactly one `{argv}` element"],
    ["{argv} whole element plus one embedded", { spawn: ["{argv}", "x {argv}"] }, "whole element"],
    ["kill not an array", { spawn: ["{argv}"], kill: "tmux kill-pane" }, "`kill` must be a non-empty array"],
    ["kill empty", { spawn: ["{argv}"], kill: [] }, "`kill` must be a non-empty array"],
    ["when not an object", { spawn: ["{argv}"], when: "TMUX" }, "`when` must be an object"],
    ["when with an empty env name", { spawn: ["{argv}"], when: { env: "" } }, "`when` must be an object"],
    ["when with an extra key", { spawn: ["{argv}"], when: { env: "TMUX", cwd: "x" } }, "`when` must be an object"],
    ["env outside the closed pair", { spawn: ["{argv}"], env: "yes" }, "`env` must be"],
  ])("rejects: %s", (_label, value, reason) => {
    const parsed = parseExecPlacementTemplate(value);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.reason).toContain(reason);
    }
  });
});

describe("RFC-0012 §4 — expandExecTemplate", () => {
  it("{argv} splices execPath + every argv element in place — never a joined string; {cwd}/{label} substitute inside elements", () => {
    const expanded = expandExecTemplate(TMUX.spawn, {
      cwd: "/w/tree 1",
      label: "worker#step",
      argv: ["/usr/bin/node", "/app/pi/cli.js", "--name", "worker#step", "/worker"],
    });
    expect(expanded).toEqual([
      "tmux",
      "new-window",
      "-d",
      "-P",
      "-F",
      "#{pane_id}",
      "-c",
      "/w/tree 1",
      "-n",
      "theta worker#step",
      "/usr/bin/node",
      "/app/pi/cli.js",
      "--name",
      "worker#step",
      "/worker",
    ]);
    expect(expanded.some((element) => element.includes(" /app/pi/cli.js"))).toBe(false);
  });

  it("{handle} substitutes in the kill template; a placeholder with no value supplied stays as written", () => {
    expect(expandExecTemplate(TMUX.kill!, { cwd: "/w", label: "l", handle: "%12" })).toEqual(["tmux", "kill-pane", "-t", "%12"]);
    expect(expandExecTemplate(["-t", "{handle}"], { cwd: "/w", label: "l" })).toEqual(["-t", "{handle}"]);
    expect(expandExecTemplate(["{argv}"], { cwd: "/w", label: "l" })).toEqual(["{argv}"]);
  });
});

describe("RFC-0012 §4 — createExecPlacementBackend", () => {
  it("is named `exec`, visible, and inherits env per the template", () => {
    const inherit = createExecPlacementBackend(TMUX, { runner: fakeRunner(() => ok("%1")), env: {}, clock: new FakeClock() });
    expect(inherit.name).toBe(EXEC_PLACEMENT_NAME);
    expect(inherit.capabilities).toEqual({ visible: true, inheritsEnv: true });
    const none = createExecPlacementBackend({ ...TMUX, env: "none" }, { runner: fakeRunner(() => ok("%1")), env: {}, clock: new FakeClock() });
    expect(none.capabilities).toEqual({ visible: true, inheritsEnv: false });
  });

  it("detect() is the `when` gate over the parent's env view: set and non-empty ⇒ true; unset or empty ⇒ false; no `when` ⇒ always true", () => {
    const deps = { runner: fakeRunner(() => ok("%1")), clock: new FakeClock() };
    expect(createExecPlacementBackend(TMUX, { ...deps, env: { TMUX: "/tmp/tmux-1000/default,1,0" } }).detect()).toBe(true);
    expect(createExecPlacementBackend(TMUX, { ...deps, env: {} }).detect()).toBe(false);
    expect(createExecPlacementBackend(TMUX, { ...deps, env: { TMUX: "" } }).detect()).toBe(false);
    const { when: _dropped, ...noWhen } = TMUX;
    expect(createExecPlacementBackend(noWhen, { ...deps, env: {} }).detect()).toBe(true);
  });

  it("place() runs the expanded spawn template with the child's cwd and composed env; the first stdout line (trimmed) is the handle; observesExit is false", async () => {
    const runner = fakeRunner(() => ok("%7\nsomething tmux also printed\n"));
    const backend = createExecPlacementBackend(TMUX, { runner, env: { TMUX: "x" }, clock: new FakeClock() });
    const placed = await backend.place(request());
    expect(placed.handle).toBe("%7");
    expect(placed.capabilities).toEqual({ observesExit: false, inheritsEnv: true, visible: true });
    expect(placed.process).toBeUndefined();
    expect(runner.runs).toHaveLength(1);
    const run = runner.runs[0]!;
    expect(run.cwd).toBe("/w");
    expect(run.env).toEqual({ PATH: "/usr/bin", PI_THETA_SUBAGENT_ROOT: "worker" });
    expect(run.argv).toEqual([
      "tmux",
      "new-window",
      "-d",
      "-P",
      "-F",
      "#{pane_id}",
      "-c",
      "/w",
      "-n",
      "theta worker",
      "/usr/bin/node",
      "/app/pi/cli.js",
      "--theta",
      "/roots",
      "--name",
      "worker",
      "/worker",
    ]);
    expect(() => placed.onExit(() => {})).not.toThrow();
  });

  it("a non-zero exit is a spawn failure naming the command and the first stderr line", async () => {
    const runner = fakeRunner(() => ({ code: 1, signal: null, stdout: "", stderr: "no server running on /tmp/tmux-1000/default\nmore" }));
    const backend = createExecPlacementBackend(TMUX, { runner, env: { TMUX: "x" }, clock: new FakeClock() });
    await expect(backend.place(request())).rejects.toThrow(
      "exec placement command exited 1: tmux — no server running on /tmp/tmux-1000/default",
    );
  });

  it("a signal exit and an empty handle are spawn failures too", async () => {
    const killed = createExecPlacementBackend(TMUX, {
      runner: fakeRunner(() => ({ code: null, signal: "SIGTERM", stdout: "", stderr: "" })),
      env: {},
      clock: new FakeClock(),
    });
    await expect(killed.place(request())).rejects.toThrow("exited SIGTERM");
    const silent = createExecPlacementBackend(TMUX, { runner: fakeRunner(() => ok("\n\n")), env: {}, clock: new FakeClock() });
    await expect(silent.place(request())).rejects.toThrow("printed no handle");
  });

  it("a runner rejection (launcher executable missing) propagates as the spawn failure", async () => {
    const runner: ExecCommandRunner = {
      run: (): Promise<ExecCommandResult> => Promise.reject(Object.assign(new Error("spawn tmux ENOENT"), { code: "ENOENT" })),
    };
    const backend = createExecPlacementBackend(TMUX, { runner, env: {}, clock: new FakeClock() });
    await expect(backend.place(request())).rejects.toThrow("spawn tmux ENOENT");
  });

  it("a launcher that never returns is aborted at the command bound (the PIC-65 dispose budget by default) and the launch is a spawn failure", async () => {
    expect(EXEC_COMMAND_TIMEOUT_MS).toBe(SUBAGENT_DISPOSE_BUDGET_MS);
    const clock = new FakeClock();
    let aborted = false;
    const runner: ExecCommandRunner = {
      run: (_argv, options): Promise<ExecCommandResult> =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () => {
            aborted = true;
            reject(new Error("aborted by runner"));
          });
        }),
    };
    const backend = createExecPlacementBackend(TMUX, { runner, env: {}, clock });
    const placing = Promise.resolve(backend.place(request()));
    const outcome = placing.then(
      () => "resolved" as const,
      (error: Error) => error.message,
    );
    clock.advance(EXEC_COMMAND_TIMEOUT_MS - 1);
    await Promise.resolve();
    clock.advance(1);
    expect(await outcome).toContain(`did not return within ${EXEC_COMMAND_TIMEOUT_MS}ms: tmux`);
    expect(aborted).toBe(true);
  });

  it("kill() runs the kill template with the handle substituted; a failure is swallowed (advisory); no template ⇒ no run", async () => {
    const runner = fakeRunner((argv) => (argv[1] === "kill-pane" ? { code: 1, signal: null, stdout: "", stderr: "gone" } : ok("%3")));
    const backend = createExecPlacementBackend(TMUX, { runner, env: {}, clock: new FakeClock() });
    const placed = await backend.place(request());
    expect(() => placed.kill()).not.toThrow();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(runner.runs).toHaveLength(2);
    expect(runner.runs[1]!.argv).toEqual(["tmux", "kill-pane", "-t", "%3"]);
    expect(runner.runs[1]!.cwd).toBe("/w");

    const { kill: _noKill, ...withoutKill } = TMUX;
    const quiet = fakeRunner(() => ok("%4"));
    const placedQuiet = await createExecPlacementBackend(withoutKill, { runner: quiet, env: {}, clock: new FakeClock() }).place(request());
    placedQuiet.kill();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(quiet.runs).toHaveLength(1);
  });

  it("through placeSubagentChild: a spawn-failing exec backend yields `spawn-failed` with the theta/runtime/subagent-spawn-failed diagnostic carrying the command's reason", async () => {
    const runner = fakeRunner(() => ({ code: 127, signal: null, stdout: "", stderr: "tmux: command not found" }));
    const backend = createExecPlacementBackend(TMUX, { runner, env: { TMUX: "x" }, clock: new FakeClock() });
    const diagnostics: Diagnostic[] = [];
    const launchRequest: SubagentLaunchRequest = {
      argv: {
        slug: "worker",
        thetaDirs: [],
        systemPrompt: "",
        hostTools: [],
        respondToolNames: [],
        noHostTools: true,
        provider: "anthropic",
        model: "m",
        projectTrust: false,
        presentation: "visible",
        label: "worker",
      },
      cwd: "/w",
      parentEnv: {},
      parentPid: 1,
      invokeDepth: 0,
      host: {
        argv1: "/app/pi/cli.js",
        execPath: "/usr/bin/node",
        fileExists: (): boolean => true,
        isGenericRuntime: (): boolean => false,
      },
    };
    const result = await placeSubagentChild(launchRequest, {
      placement: backend,
      emitDiagnostic: (d) => diagnostics.push(d),
      openWire: async () => ({
        launchFile: "/tmp/l/launch.json",
        adapt: () => {
          throw new Error("never adapted");
        },
        abandon: (): void => {},
      }),
    });
    expect(result).toEqual({ ok: false, reason: "spawn-failed" });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe("theta/runtime/subagent-spawn-failed");
    expect(diagnostics[0]!.message).toContain("exec placement command exited 127: tmux — tmux: command not found");
    // The launcher received the child argv WITH the launch-file flag spliced in.
    expect(runner.runs[0]!.argv).toContain("--theta-launch");
    expect(runner.runs[0]!.argv).toContain("/tmp/l/launch.json");
  });
});

describe("RFC-0012 §4 — the production command runner (real child, no shell)", () => {
  it("collects stdout/stderr whole and settles on close with the exit code; the argv reaches the command as separate elements", async () => {
    const runner = createProductionExecCommandRunner();
    const result = await runner.run(
      [
        process.execPath,
        "-e",
        "process.stdout.write(JSON.stringify(process.argv.slice(1)) + '\\n'); process.stderr.write('warned'); process.exit(3);",
        "a b",
        "{argv}",
      ],
      { cwd: process.cwd(), env: { PATH: process.env["PATH"] }, signal: new AbortController().signal },
    );
    expect(result.code).toBe(3);
    expect(result.signal).toBeNull();
    expect(JSON.parse(result.stdout.trim())).toEqual(["a b", "{argv}"]);
    expect(result.stderr).toBe("warned");
  });

  it("a missing launcher executable rejects with the OS error", async () => {
    const runner = createProductionExecCommandRunner();
    await expect(
      runner.run(["definitely-not-a-real-launcher-xyz", "--x"], {
        cwd: process.cwd(),
        env: { PATH: process.env["PATH"] },
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/ENOENT/);
  });

  it("an abort kills the running command and rejects", async () => {
    const runner = createProductionExecCommandRunner();
    const abort = new AbortController();
    const running = runner.run([process.execPath, "-e", "setInterval(() => {}, 1000);"], {
      cwd: process.cwd(),
      env: { PATH: process.env["PATH"] },
      signal: abort.signal,
    });
    setTimeout(() => abort.abort(), 50);
    await expect(running).rejects.toThrow("exec placement command aborted");
  });
});
