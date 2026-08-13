// RFC-0006 child-process launch contract (rebased from the RFC-0005 RPC launch).
//
// Covers the launch half the RFC demands (pi-integration-contract/subagent.md
// #subagent-executable-resolution, #subagent-launch-contract (PIC-58),
// #subagent-tools-allowlist-suppression, #subagent-theta-callable-hash; PIC-65
// spawn failure):
//   - executable-resolution ladder (rung 1 entry-script, rung 2 compiled
//     binary, both-rungs-fail → closed refusal, NO PATH fallback);
//   - json-mode argv assembly (--theta <dirs> --mode json -p "/<slug>"
//     --no-session --system-prompt --tools list, tools:[] → --no-tools,
//     --provider/--model, the four --no-* isolation flags, --approve iff
//     project-local trust else --no-approve);
//   - env: full inheritance + PI_THETA_SUBAGENT_ROOT=<slug> regime marker
//     (subsuming the retired boolean child marker) + parent-PID carriage;
//     child cwd = ctx.cwd;
//   - spawn failure (ENOENT) → spawn-failed + theta/runtime/subagent-spawn-failed;
//   - .theta callable transitive-closure content-hash marshalling + child-side
//     verification (mismatch → theta/runtime/subagent-callable-hash-mismatch).

import { describe, expect, it } from "vitest";
import { delimiter } from "node:path";
import {
  PI_CLI_DIALECT,
  assembleSubagentArgv,
  buildSubagentChildEnv,
  inferChildTrust,
  launchSubagentChild,
  resolveSubagentExecutable,
  routeSubagentSpawnFailure,
  SUBAGENT_EXTENSION_PIN_ENV,
  SUBAGENT_INVOKE_DEPTH_ENV,
  SUBAGENT_PARENT_PID_ENV,
  SUBAGENT_SPAWN_FAILED_CODE,
  SUBAGENT_SPAWN_INTERNAL_ERROR_CODE,
  type ExecutableHost,
  type SubagentLaunchRequest,
} from "../src/runtime/subagent-launcher";
import { SUBAGENT_ROOT_ENV_MARKER } from "../src/runtime/subagent-root-regime";
import {
  hashCallableClosure,
  renderCallableHashMismatchMessage,
  SUBAGENT_CALLABLE_HASH_MISMATCH_CODE,
  verifyCallableHash,
} from "../src/runtime/subagent-callable-hash";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { InvokeInfraError } from "../src/runtime/query-error";
import type { HostToolSnapshotEntry } from "../src/seams/host-tool-snapshot";
import { enoentSpawnError, makeFakeJsonChildLauncher } from "./helpers/fake-json-child";
import {
  createProductionExecutableHost,
  isEmbeddedFsPath,
} from "../src/extension/production-subagent-host";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Executable-resolution ladder.
// ---------------------------------------------------------------------------

function host(overrides: Partial<ExecutableHost>): ExecutableHost {
  return {
    argv1: "/app/pi/dist/index.js",
    execPath: "/usr/bin/node",
    fileExists: (): boolean => true,
    isGenericRuntime: (p): boolean => /(?:^|\/)(?:node|bun)$/.test(p),
    ...overrides,
  };
}

describe("RFC-0005 — executable-resolution ladder", () => {
  it("rung 1: when argv[1] names an existing file, spawn execPath (the Node/Bun binary) with that script", () => {
    const resolution = resolveSubagentExecutable(
      host({ argv1: "/app/pi/dist/index.js", fileExists: (p): boolean => p === "/app/pi/dist/index.js" }),
    );
    expect(resolution.ok).toBe(true);
    if (resolution.ok) {
      expect(resolution.rung).toBe(1);
      expect(resolution.execPath).toBe("/usr/bin/node");
      expect(resolution.scriptArgs).toEqual(["/app/pi/dist/index.js"]);
    }
  });

  it("rung 2: when argv[1] is unusable and execPath is a non-generic Pi binary, spawn execPath directly", () => {
    const resolution = resolveSubagentExecutable(
      host({ argv1: undefined, execPath: "/opt/pi/pi", fileExists: (): boolean => false }),
    );
    expect(resolution.ok).toBe(true);
    if (resolution.ok) {
      expect(resolution.rung).toBe(2);
      expect(resolution.execPath).toBe("/opt/pi/pi");
      expect(resolution.scriptArgs).toEqual([]);
    }
  });

  it("both rungs fail (argv[1] unusable AND execPath is a generic runtime) → closed refusal, NO PATH fallback", () => {
    const resolution = resolveSubagentExecutable(
      host({ argv1: undefined, execPath: "/usr/bin/node", fileExists: (): boolean => false }),
    );
    // Fail-closed: neither rung yields a runnable entry point, and there is no
    // PATH-resolved `pi` fallback.
    expect(resolution.ok).toBe(false);
  });

  it("rung 1 requires actual existence — a missing argv[1] file does not resolve to rung 1", () => {
    const resolution = resolveSubagentExecutable(
      host({ argv1: "/app/pi/dist/index.js", execPath: "/opt/pi/pi", fileExists: (): boolean => false }),
    );
    // The missing entry script falls through to the rung-2 compiled binary.
    expect(resolution.ok).toBe(true);
    if (resolution.ok) {
      expect(resolution.rung).toBe(2);
    }
  });
});

// ---------------------------------------------------------------------------
// Rung-1 embedded-filesystem rejection (subagent.md #subagent-executable-resolution
// rung 1: the existence check MUST answer false for a path inside a compiled
// binary's own embedded filesystem).
// ---------------------------------------------------------------------------

describe("rung 1 — embedded-filesystem paths are rejected (isEmbeddedFsPath + the production fileExists)", () => {
  it("isEmbeddedFsPath recognises every spelled form of the embedded root", () => {
    // Under a compiled host binary `process.argv[1]` is a path the running
    // process can stat and no spawned child can open — `fileExists` answering
    // true selects rung 1 and hands the child that path as a stray positional
    // argument. The predicate is pinned directly because the composed
    // `fileExists` cannot witness it outside a compiled binary: `existsSync`
    // answers false for these paths on an ordinary runner either way.
    const embedded = [
      "/$bunfs/root/cli.js", // POSIX
      "\\$bunfs\\root\\cli.js", // backslash spelling
      "B:\\~BUN\\root\\cli.js", // Windows drive form
      "b:/~bun/root/cli.js", // case-insensitive, forward slashes
      "%7EBUN/root/cli.js", // URL-encoded root, bare
      "file:///$bunfs/root/cli.js", // URL form, POSIX
      "file:///B:/~BUN/root/cli.js", // URL form with a drive letter
    ];
    for (const path of embedded) {
      expect(isEmbeddedFsPath(path), path).toBe(true);
    }
  });

  it("isEmbeddedFsPath is ANCHORED: a path merely containing a marker is not embedded", () => {
    // The anchor is load-bearing: substring matching would reject a legitimate
    // install under `~BUNDLE`, and a wrong rejection falls through to a closed
    // refusal that disables every subagent invocation.
    const real = [
      "/home/x/~BUNDLE/cli.js",
      "C:\\Users\\pi\\~BUNDLE\\cli.js",
      "/opt/apps/$bunfs-lookalike/cli.js",
      "/tmp/%7EBUNsuffix/cli.js",
      "C:\\Users\\pi\\dist\\cli.js",
    ];
    for (const path of real) {
      expect(isEmbeddedFsPath(path), path).toBe(false);
    }
  });

  it("the production fileExists composes the predicate ahead of the disk probe — and still answers true for a real file under a marker-CONTAINING directory", () => {
    const { fileExists } = createProductionExecutableHost();
    const dir = mkdtempSync(join(tmpdir(), "theta-embedded-fs-"));
    try {
      const plain = join(dir, "cli.js");
      writeFileSync(plain, "// entry", "utf8");
      expect(fileExists(plain)).toBe(true);

      const bundleDir = join(dir, "~BUNDLE");
      mkdirSync(bundleDir, { recursive: true });
      const underBundle = join(bundleDir, "cli.js");
      writeFileSync(underBundle, "// entry", "utf8");
      expect(fileExists(underBundle)).toBe(true);

      // An embedded path is refused regardless of the disk — on the compiled
      // binary this fix targets, the disk probe would have answered TRUE.
      expect(fileExists("/$bunfs/root/cli.js")).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("an embedded argv1 falls through rung 1 to rung 2 on a modelled compiled-binary host (stat answers true)", () => {
    // The compiled-binary host this fix targets: the embedded entry path IS
    // statable by the running process (`existsSync` true — modelled here by
    // answering true for everything the predicate does not reject), and the
    // executable is the host binary itself, not a generic runtime.
    const resolution = resolveSubagentExecutable(
      host({
        argv1: "/$bunfs/root/cli.js",
        execPath: "/opt/pi/pi",
        fileExists: (path: string): boolean => !isEmbeddedFsPath(path),
      }),
    );
    expect(resolution.ok).toBe(true);
    if (resolution.ok) {
      expect(resolution.rung).toBe(2);
      expect(resolution.execPath).toBe("/opt/pi/pi");
      expect(resolution.scriptArgs).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// Argv assembly.
// ---------------------------------------------------------------------------

describe("RFC-0006 — json-mode argv assembly", () => {
  it("assembles the pinned flag set: --theta <dirs> --mode json -p \"/<slug>\" --no-session --system-prompt --tools <csv> --provider --model + the four --no-* isolation flags", () => {
    const argv = assembleSubagentArgv({
      slug: "code-review",
      thetaDirs: ["/w/.pi/theta", "/w/pkg/theta"],
      systemPrompt: "you are a subagent",
      tools: ["read", "finding_store"],
      emptyCallableSet: false,
      provider: "anthropic",
      model: "claude-sonnet",
      projectTrust: false,
    }, PI_CLI_DIALECT);

    // ONE --theta flag, all discovery roots joined with path.delimiter, so the
    // child re-discovers the callee (bug 0008: host pi resolves a repeated
    // extension string flag to its LAST occurrence, silently dropping every
    // earlier root in the child).
    expect(argv.filter((arg) => arg === "--theta")).toHaveLength(1);
    expect(argv[0]).toBe("--theta");
    expect(argv[1]).toBe(`/w/.pi/theta${delimiter}/w/pkg/theta`);
    expect(argv).toContain("--mode");
    expect(argv[argv.indexOf("--mode") + 1]).toBe("json");
    // -p "/<slug>" invokes the callee as the child's root slash command.
    expect(argv).toContain("-p");
    expect(argv[argv.indexOf("-p") + 1]).toBe("/code-review");
    expect(argv).toContain("--no-session");
    // Newline-PREFIXED on purpose (SPAWN-04): both hosts path-coerce this value
    // and would read a file it names, so a leading newline forces it to be taken
    // as text. The prompt itself must survive the prefix intact.
    expect(argv[argv.indexOf("--system-prompt") + 1]).toBe("\nyou are a subagent");
    // --tools carries the callable-set names as a comma-joined allowlist
    // (defence-in-depth; the child theta enforces its own callable set).
    expect(argv).toContain("--tools");
    expect(argv[argv.indexOf("--tools") + 1]).toBe("read,finding_store");
    expect(argv).not.toContain("--no-tools");
    // The retired RPC mode is never assembled.
    expect(argv).not.toContain("rpc");
    expect(argv[argv.indexOf("--provider") + 1]).toBe("anthropic");
    expect(argv[argv.indexOf("--model") + 1]).toBe("claude-sonnet");
    expect(argv).toContain("--no-skills");
    expect(argv).toContain("--no-prompt-templates");
    expect(argv).toContain("--no-themes");
    expect(argv).toContain("--no-context-files");
  });

  it("empty callable set → --no-tools (empty ≠ omission); never re-enables Pi's default built-ins", () => {
    const argv = assembleSubagentArgv({
      slug: "s",
      thetaDirs: [],
      systemPrompt: "sp",
      tools: [],
      emptyCallableSet: true,
      provider: "anthropic",
      model: "claude-sonnet",
      projectTrust: false,
    }, PI_CLI_DIALECT);
    expect(argv).toContain("--no-tools");
    expect(argv).not.toContain("--tools");
  });

  it("production default: no extension pin → the argv carries NO -ne / -e (ambient extension discovery)", () => {
    const argv = assembleSubagentArgv({
      slug: "s",
      thetaDirs: ["/w/.pi/theta"],
      systemPrompt: "sp",
      tools: [],
      emptyCallableSet: true,
      provider: "anthropic",
      model: "m",
      projectTrust: false,
    }, PI_CLI_DIALECT);
    // #subagent-extension-pin: ambient discovery is the production default —
    // the pin is strictly opt-in, so the default argv is unchanged.
    expect(argv).not.toContain("-ne");
    expect(argv).not.toContain("-e");
  });

  it("#subagent-extension-pin: an explicit extensionPinDir PREPENDS -ne -e <dir> (child binds to exactly that build)", () => {
    const argv = assembleSubagentArgv({
      extensionPinDir: "/repo/extensions",
      slug: "s",
      thetaDirs: ["/w/.pi/theta"],
      systemPrompt: "sp",
      tools: [],
      emptyCallableSet: true,
      provider: "anthropic",
      model: "m",
      projectTrust: false,
    }, PI_CLI_DIALECT);
    // `-ne` disables ambient discovery; `-e <dir>` loads exactly the pinned
    // build — mirroring how the acceptance harness pins the OUTER process
    // (bug 0002 defect 2: an unpinned child can bind to a stale ambient build).
    expect(argv.slice(0, 3)).toEqual(["-ne", "-e", "/repo/extensions"]);
  });

  it("--approve iff project-local trust is inferred, else --no-approve (least privilege)", () => {
    const approving = assembleSubagentArgv({
      slug: "s",
      thetaDirs: [],
      systemPrompt: "sp",
      tools: ["projectLocalTool"],
      emptyCallableSet: false,
      provider: "anthropic",
      model: "m",
      projectTrust: true,
    }, PI_CLI_DIALECT);
    expect(approving).toContain("--approve");
    expect(approving).not.toContain("--no-approve");

    const denying = assembleSubagentArgv({
      slug: "s",
      thetaDirs: [],
      systemPrompt: "sp",
      tools: ["read"],
      emptyCallableSet: false,
      provider: "anthropic",
      model: "m",
      projectTrust: false,
    }, PI_CLI_DIALECT);
    expect(denying).toContain("--no-approve");
    expect(denying).not.toContain("--approve");
  });
});

// ---------------------------------------------------------------------------
// Project-local trust INFERENCE (feeds the --approve / --no-approve flag).
// ---------------------------------------------------------------------------

/** A `pi.getAllTools()` tool fixture with a given source scope. */
function toolInfo(name: string, scope: string): HostToolSnapshotEntry {
  return { name, sourceInfo: { scope } };
}

describe("RFC-0005 — project-local trust inference (#subagent-isolation-and-trust)", () => {
  it("a project-local tool in the callable set infers trust → --approve", () => {
    // The operator already trusted this project-local extension in the parent
    // session (that is the only way its tool was admitted), so the child inherits
    // a decision already made.
    const allTools = [toolInfo("projectLocalTool", "project"), toolInfo("read", "user")];
    expect(inferChildTrust(["projectLocalTool"], allTools)).toBe(true);
  });

  it("only built-in / user-scope extension tools infer no trust → --no-approve (least privilege)", () => {
    // A built-in Pi tool carries no project-local sourceInfo (its name is absent
    // from getAllTools' project-scoped set); a user-scope extension tool is not
    // project-local. Neither admits the child to --approve.
    const allTools = [toolInfo("lint", "user")];
    expect(inferChildTrust(["read", "lint"], allTools)).toBe(false);
  });

  it("an empty callable set infers no trust → --no-approve", () => {
    expect(inferChildTrust([], [toolInfo("projectLocalTool", "project")])).toBe(false);
  });

  it("a bare-string host snapshot (no published source scope) infers no trust → the assembled argv carries --no-approve", () => {
    // Oh-My-Pi's `pi.getAllTools()` returns bare tool NAMES, so no tool can be
    // shown project-local. Reading `sourceInfo.scope` off a string used to throw
    // `TypeError` (re-wrapped as InvokeInfraError{internal_error}); the seam
    // (`seams/host-tool-snapshot.ts`) decodes it to a name-only entry, and the
    // launch contract's end of that is least privilege on the wire.
    const allTools: readonly HostToolSnapshotEntry[] = ["read", "projectLocalTool"];
    const projectTrust = inferChildTrust(["projectLocalTool"], allTools);
    expect(projectTrust).toBe(false);

    const argv = assembleSubagentArgv({
      slug: "s",
      thetaDirs: [],
      systemPrompt: "sp",
      tools: ["projectLocalTool"],
      emptyCallableSet: false,
      provider: "anthropic",
      model: "m",
      projectTrust,
    }, PI_CLI_DIALECT);
    expect(argv).toContain("--no-approve");
    expect(argv).not.toContain("--approve");
  });
});

// ---------------------------------------------------------------------------
// Child env.
// ---------------------------------------------------------------------------

describe("RFC-0006 — child env", () => {
  it("inherits the full parent env AND adds the PI_THETA_SUBAGENT_ROOT=<slug> regime marker plus the parent-PID and invoke-depth carriages", () => {
    const parentEnv = { PATH: "/usr/bin", ANTHROPIC_API_KEY: "sk-xxx", HOME: "/home/u" };
    const env = buildSubagentChildEnv(parentEnv, 12345, 7, "code-review");

    // Full inheritance (credentials are never re-marshalled — they ride the env).
    expect(env.PATH).toBe("/usr/bin");
    expect(env.ANTHROPIC_API_KEY).toBe("sk-xxx");
    expect(env.HOME).toBe("/home/u");
    // PIC-58: the root-regime marker carries the callee slug and subsumes the
    // retired boolean child marker (watcher suppression + no-recursion + regime).
    expect(env[SUBAGENT_ROOT_ENV_MARKER]).toBe("code-review");
    // The parent PID rides its own carriage (the recorded-but-unimplemented
    // PIC-65 orphan watchdog input) — NOT the
    // depth counter.
    expect(env[SUBAGENT_PARENT_PID_ENV]).toBe("12345");
    // INV-4: the per-chain invoke depth crosses on its OWN dedicated carriage,
    // distinct from the parent-PID carriage.
    expect(env[SUBAGENT_INVOKE_DEPTH_ENV]).toBe("7");
  });

  it("omits the root marker when no slug is supplied (the marker names the callee)", () => {
    expect(buildSubagentChildEnv({}, 1, 0)[SUBAGENT_ROOT_ENV_MARKER]).toBeUndefined();
  });

  it("INV-4: the invoke-depth carriage marshals the parent's CURRENT chain depth (0 at top level)", () => {
    expect(buildSubagentChildEnv({}, 1, 0)[SUBAGENT_INVOKE_DEPTH_ENV]).toBe("0");
    expect(buildSubagentChildEnv({}, 1, 31)[SUBAGENT_INVOKE_DEPTH_ENV]).toBe("31");
  });
});

// ---------------------------------------------------------------------------
// Launch: argv/env/cwd recording + spawn failure.
// ---------------------------------------------------------------------------

function launchRequest(overrides?: Partial<SubagentLaunchRequest>): SubagentLaunchRequest {
  return {
    argv: {
      slug: "child",
      thetaDirs: ["/work/project/.pi/theta"],
      systemPrompt: "you are a subagent",
      tools: ["read"],
      emptyCallableSet: false,
      provider: "anthropic",
      model: "claude-sonnet",
      projectTrust: false,
    },
    cwd: "/work/project",
    parentEnv: { PATH: "/usr/bin", ANTHROPIC_API_KEY: "sk-xxx" },
    parentPid: 999,
    invokeDepth: 3,
    host: host({ argv1: "/app/pi/dist/index.js", fileExists: (): boolean => true }),
    ...overrides,
  };
}

describe("RFC-0006 — launchSubagentChild records argv/env/cwd", () => {
  it("spawns the resolved executable with the assembled argv, the marked env, and ctx.cwd as the child cwd", () => {
    const launcher = makeFakeJsonChildLauncher();
    const emitted: Diagnostic[] = [];

    const result = launchSubagentChild(launchRequest(), {
      spawn: launcher.spawn,
      emitDiagnostic: (d): void => {
        emitted.push(d);
      },
    });

    expect(result.ok).toBe(true);
    expect(launcher.spawns).toHaveLength(1);
    const record = launcher.spawns[0]!;

    // Resolved executable is the Node binary (rung 1), never the model id.
    expect(record.execPath).toBe("/usr/bin/node");
    // The full pinned argv rode through (entry-script arg then the flag set).
    expect(record.args).toContain("/app/pi/dist/index.js");
    expect(record.args).toContain("--mode");
    expect(record.args[record.args.indexOf("--mode") + 1]).toBe("json");
    expect(record.args).toContain("--no-session");
    expect(record.args).toContain("--tools");
    // The root-regime marker carries the callee slug (PIC-58), subsuming the
    // retired boolean child marker.
    expect(record.env[SUBAGENT_ROOT_ENV_MARKER]).toBe("child");
    expect(record.env[SUBAGENT_PARENT_PID_ENV]).toBe("999");
    // INV-4: the launch marshals the current chain depth on the child env.
    expect(record.env[SUBAGENT_INVOKE_DEPTH_ENV]).toBe("3");
    expect(record.env.ANTHROPIC_API_KEY).toBe("sk-xxx");
    // The child runs in the forwarded ctx.cwd.
    expect(record.cwd).toBe("/work/project");
  });

  it("#subagent-extension-pin: the opt-in env knob on the parent env pins the child argv (-ne -e <dir>)", () => {
    const launcher = makeFakeJsonChildLauncher();
    const result = launchSubagentChild(
      launchRequest({
        parentEnv: { PATH: "/usr/bin", [SUBAGENT_EXTENSION_PIN_ENV]: "/repo/extensions" },
      }),
      { spawn: launcher.spawn, emitDiagnostic: (): void => {} },
    );
    expect(result.ok).toBe(true);
    const record = launcher.spawns[0]!;
    // The knob (set by the acceptance harness; inherited by nested children via
    // full env inheritance) makes the launcher pin the child to the same
    // extension build as the process under test.
    const neIndex = record.args.indexOf("-ne");
    expect(neIndex).toBeGreaterThanOrEqual(0);
    expect(record.args[neIndex + 1]).toBe("-e");
    expect(record.args[neIndex + 2]).toBe("/repo/extensions");
    // The knob itself rides into the child env (full inheritance), so a nested
    // child launched from inside this child is pinned identically.
    expect(record.env[SUBAGENT_EXTENSION_PIN_ENV]).toBe("/repo/extensions");
  });

  it("#subagent-extension-pin: the env knob value is trimmed — surrounding whitespace never rides into -e", () => {
    const launcher = makeFakeJsonChildLauncher();
    launchSubagentChild(
      launchRequest({
        parentEnv: { PATH: "/usr/bin", [SUBAGENT_EXTENSION_PIN_ENV]: "  /repo/extensions  " },
      }),
      { spawn: launcher.spawn, emitDiagnostic: (): void => {} },
    );
    const record = launcher.spawns[0]!;
    const neIndex = record.args.indexOf("-ne");
    expect(neIndex).toBeGreaterThanOrEqual(0);
    expect(record.args[neIndex + 1]).toBe("-e");
    expect(record.args[neIndex + 2]).toBe("/repo/extensions");
  });

  it("#subagent-extension-pin: knob absent → no -ne / -e on the spawned argv (production default unchanged)", () => {
    const launcher = makeFakeJsonChildLauncher();
    launchSubagentChild(launchRequest(), { spawn: launcher.spawn, emitDiagnostic: (): void => {} });
    const record = launcher.spawns[0]!;
    expect(record.args).not.toContain("-ne");
    expect(record.args).not.toContain("-e");
  });

  it("spawn failure (ENOENT) → { ok: false, reason: 'spawn-failed' } AND emits theta/runtime/subagent-spawn-failed", () => {
    const launcher = makeFakeJsonChildLauncher();
    launcher.failNextSpawn(enoentSpawnError("/usr/bin/node"));
    const emitted: Diagnostic[] = [];

    const result = launchSubagentChild(launchRequest(), {
      spawn: launcher.spawn,
      emitDiagnostic: (d): void => {
        emitted.push(d);
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("spawn-failed");
    }
    // The spawn-specific diagnostic records the failure for operator triage.
    expect(emitted.map((d) => d.code)).toContain(SUBAGENT_SPAWN_FAILED_CODE);
  });

  it("spawn failure is DUALLY routed: operator-triage subagent-spawn-failed AND the invocation-failure internal-error surface (+ invoke_infra envelope)", () => {
    const launcher = makeFakeJsonChildLauncher();
    const spawnError = enoentSpawnError("/usr/bin/node");
    launcher.failNextSpawn(spawnError);
    const emitted: Diagnostic[] = [];
    const emit = (d: Diagnostic): void => {
      emitted.push(d);
    };

    // (1) The launcher records the operator-triage diagnostic.
    launchSubagentChild(launchRequest(), { spawn: launcher.spawn, emitDiagnostic: emit });

    // (2) The caller additionally routes the failure through the invocation-
    //     failure surface: theta/runtime/internal-error, plus the invoke_infra
    //     envelope to an invoke parent (PIC-65 spawn-failure rule).
    let envelope: InvokeInfraError | undefined;
    routeSubagentSpawnFailure(spawnError, "/theta/child.theta", {
      emitDiagnostic: emit,
      emitInvokeInfra: (e): void => {
        envelope = e;
      },
    });

    const codes = emitted.map((d) => d.code);
    expect(codes).toContain(SUBAGENT_SPAWN_FAILED_CODE);
    expect(codes).toContain(SUBAGENT_SPAWN_INTERNAL_ERROR_CODE);
    expect(envelope?.kind).toBe("invoke_infra");
    expect(envelope?.cause).toBe("internal_error");
    expect(envelope?.callee_path).toBe("/theta/child.theta");
  });
});

// ---------------------------------------------------------------------------
// .theta callable transitive-closure content-hash marshalling + verification.
// ---------------------------------------------------------------------------

describe("RFC-0005 — .theta callable content-hash marshalling + child-side verification", () => {
  it("the transitive-closure hash changes when the root file content changes", () => {
    const before = hashCallableClosure([
      { path: "child.theta", content: "@ do the thing" },
      { path: "lib.thetalib", content: "fn helper() = 1" },
    ]);
    const after = hashCallableClosure([
      { path: "child.theta", content: "@ do a DIFFERENT thing" },
      { path: "lib.thetalib", content: "fn helper() = 1" },
    ]);
    expect(after).not.toBe(before);
  });

  it("the transitive-closure hash changes when an imported .thetalib content changes (import edit ≡ root edit)", () => {
    const before = hashCallableClosure([
      { path: "child.theta", content: "@ do the thing" },
      { path: "lib.thetalib", content: "fn helper() = 1" },
    ]);
    const after = hashCallableClosure([
      { path: "child.theta", content: "@ do the thing" },
      { path: "lib.thetalib", content: "fn helper() = 2" },
    ]);
    expect(after).not.toBe(before);
  });

  it("the transitive-closure hash is independent of the closure member order (the closure is a set)", () => {
    const a = hashCallableClosure([
      { path: "child.theta", content: "root" },
      { path: "lib.thetalib", content: "lib" },
    ]);
    const b = hashCallableClosure([
      { path: "lib.thetalib", content: "lib" },
      { path: "child.theta", content: "root" },
    ]);
    expect(a).toBe(b);
  });

  it("child-side verification refuses the invocation on hash mismatch with theta/runtime/subagent-callable-hash-mismatch", () => {
    const verification = verifyCallableHash("child", "sha256:parent-hash", "sha256:child-hash");
    expect(verification.ok).toBe(false);
    if (!verification.ok) {
      expect(verification.diagnostic.code).toBe(SUBAGENT_CALLABLE_HASH_MISMATCH_CODE);
      expect(verification.diagnostic.message).toBe(renderCallableHashMismatchMessage("child"));
    }
  });

  it("child-side verification accepts a matching hash", () => {
    const verification = verifyCallableHash("child", "sha256:same", "sha256:same");
    expect(verification.ok).toBe(true);
  });
});
