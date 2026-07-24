// RFC-0006 child-process launch contract (rebased from the RFC-0005 RPC launch).
//
// Covers the launch half the RFC demands (pi-integration-contract/subagent.md
// #subagent-executable-resolution, #subagent-launch-contract (PIC-58),
// #subagent-tools-allowlist-suppression, #subagent-theta-callable-hash; PIC-9
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
import {
  assembleSubagentArgv,
  buildSubagentChildEnv,
  inferChildTrust,
  launchSubagentChild,
  resolveSubagentExecutable,
  routeSubagentSpawnFailure,
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
import type { ToolSourceScope } from "../src/runtime/subagent-launcher";
import { enoentSpawnError, makeFakeJsonChildLauncher } from "./helpers/fake-json-child";

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
      approve: false,
    });

    // --theta <dir> repeated for each discovery root so the child re-discovers
    // the callee.
    expect(argv[0]).toBe("--theta");
    expect(argv[1]).toBe("/w/.pi/theta");
    expect(argv[2]).toBe("--theta");
    expect(argv[3]).toBe("/w/pkg/theta");
    expect(argv).toContain("--mode");
    expect(argv[argv.indexOf("--mode") + 1]).toBe("json");
    // -p "/<slug>" invokes the callee as the child's root slash command.
    expect(argv).toContain("-p");
    expect(argv[argv.indexOf("-p") + 1]).toBe("/code-review");
    expect(argv).toContain("--no-session");
    expect(argv[argv.indexOf("--system-prompt") + 1]).toBe("you are a subagent");
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
      approve: false,
    });
    expect(argv).toContain("--no-tools");
    expect(argv).not.toContain("--tools");
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
      approve: true,
    });
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
      approve: false,
    });
    expect(denying).toContain("--no-approve");
    expect(denying).not.toContain("--approve");
  });
});

// ---------------------------------------------------------------------------
// Project-local trust INFERENCE (feeds the --approve / --no-approve flag).
// ---------------------------------------------------------------------------

/** A `pi.getAllTools()` tool fixture with a given source scope. */
function toolInfo(name: string, scope: string): ToolSourceScope {
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
    // The parent PID rides its own carriage (PIC-9 orphan watchdog) — NOT the
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
      approve: false,
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
    //     envelope to an invoke parent (PIC-9 spawn-failure rule / PIC-41).
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
