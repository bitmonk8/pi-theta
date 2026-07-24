// RFC-0005 — subagent child-process launcher seam.
//
// This module owns the child-process launch half of the RFC-0005 subagent
// drive (pi-integration-contract/subagent.md): the executable-resolution
// ladder (#subagent-executable-resolution), argv assembly (#subagent-launch-
// contract), the env marshalling (the live `PI_THETA_SUBAGENT_ROOT` regime
// marker — which subsumed RFC-0005's retired `PI_THETA_SUBAGENT_CHILD` per
// PIC-58 — the parent-PID carriage, and the per-chain invoke-depth carriage per
// invocation.md §INV-4), and the spawn seam. The theta interpreter stays in the
// parent; only the child-`pi` process launch lives here, behind the
// `conversation-drive.ts` drive seam.
//
// Spec: pi-integration-contract/subagent.md (#subagent-executable-resolution,
// #subagent-launch-contract, #subagent-tools-allowlist-suppression, PIC-9
// spawn-failure), capability-probe.md Step 0 (f), diagnostics/code-registry-
// load.md (`theta/load/subagent-executable-unresolved`), diagnostics/code-
// registry-runtime.md (`theta/runtime/subagent-spawn-failed`).

import type { Diagnostic } from "../diagnostics/diagnostic";
import type { InvokeInfraError } from "./query-error";
import { INTERNAL_ERROR_CODE, surfaceUnexpectedThrow } from "./runtime-panics";
import { SUBAGENT_ROOT_ENV_MARKER } from "./subagent-root-regime";

// ---------------------------------------------------------------------------
// Diagnostic codes (owned here; re-audited per Pi bump).
// ---------------------------------------------------------------------------

/**
 * `theta/load/subagent-executable-unresolved` — the load-time fail-closed
 * refusal when neither resolution rung yields a runnable child `pi` entry
 * point (no `PATH` fallback). Emitted by the Step 0 (f) probe, not at first
 * spawn (see `capability-probe.ts`).
 */
export const SUBAGENT_EXECUTABLE_UNRESOLVED_CODE = "theta/load/subagent-executable-unresolved";

/** Registry Message column for `theta/load/subagent-executable-unresolved`. */
export const SUBAGENT_EXECUTABLE_UNRESOLVED_MESSAGE =
  "subagent child executable unresolved: no runnable 'pi' entry point (entry-script and compiled-binary rungs both failed; no PATH fallback)";

/**
 * `theta/runtime/subagent-spawn-failed` — the child `pi` process spawn failed
 * at launch (ENOENT, EPERM, immediate nonzero exit before the RPC stdio was
 * usable). Records the spawn-specific detail; the failure also routes through
 * the runtime-defect surface (`theta/runtime/internal-error`).
 */
export const SUBAGENT_SPAWN_FAILED_CODE = "theta/runtime/subagent-spawn-failed";

/**
 * RFC-0006 (PIC-58): the subagent-root regime marker (`PI_THETA_SUBAGENT_ROOT=<slug>`)
 * SUBSUMES RFC-0005's `PI_THETA_SUBAGENT_CHILD` marker and carries its duties
 * (watcher suppression, no-recursion guard, parent-PID carriage) alongside regime
 * selection. The old boolean child marker is retired — its presence is now
 * expressed by the presence of the root-slug marker. Re-exported from the regime
 * module (single source of truth) so launcher-side consumers resolve it here.
 */
export { SUBAGENT_ROOT_ENV_MARKER };

/**
 * The env var carrying the parent PID to the child, read by the child-side
 * parent-PID watchdog (PIC-9 orphan-prevention class-2 fallback). This is NOT
 * the invoke-depth counter — that rides `SUBAGENT_INVOKE_DEPTH_ENV` below.
 */
export const SUBAGENT_PARENT_PID_ENV = "PI_THETA_SUBAGENT_PARENT_PID";

/**
 * The env var carrying the per-chain `invoke`-depth counter across the child
 * process boundary (invocation.md §INV-4). The parent marshals its current
 * chain depth here at launch; the theta extension loaded inside the child seeds
 * its top-level invoke chain from it, so the depth-32 ceiling continues across
 * process hops. A per-chain counter, not per-process — sibling subagent invokes
 * do not share budget. INV-4 pins no malformed-carriage rule, so an absent or
 * non-integer value seeds a fresh chain at depth 0 (see `parseInboundInvokeDepth`
 * in `invoke-depth-cycle.ts`).
 */
export const SUBAGENT_INVOKE_DEPTH_ENV = "PI_THETA_SUBAGENT_INVOKE_DEPTH";

// ---------------------------------------------------------------------------
// Executable resolution ladder (#subagent-executable-resolution).
// ---------------------------------------------------------------------------

/** The injected host snapshot the resolution ladder reads (ambient-free). */
export interface ExecutableHost {
  /** `process.argv[1]` — the entry-script path (rung 1), or `undefined`. */
  readonly argv1: string | undefined;
  /** `process.execPath` — the Node/Bun binary (rung 1 spawn) or Pi binary (rung 2). */
  readonly execPath: string;
  /** Does `path` name an existing file? (rung-1 existence check). */
  fileExists(path: string): boolean;
  /** Is `execPath` a generic runtime (`node` / `bun`)? (rung-2 gate). */
  isGenericRuntime(execPath: string): boolean;
}

/** The resolution verdict: a runnable entry point, or the both-rungs-fail refusal. */
export type ExecutableResolution =
  | { readonly ok: true; readonly rung: 1 | 2; readonly execPath: string; readonly scriptArgs: readonly string[] }
  | { readonly ok: false };

/**
 * Resolve the child `pi` executable via the two-rung ladder. Rung 1: when
 * `argv1` names an existing file, spawn `execPath` with that script. Rung 2:
 * when `argv1` is unusable and `execPath` is not a generic runtime, spawn
 * `execPath` directly. There is NO `PATH` fallback; both rungs failing is a
 * closed `{ ok: false }` verdict (fail-closed at load time upstream).
 */
export function resolveSubagentExecutable(host: ExecutableHost): ExecutableResolution {
  // Rung 1 — entry-script: `process.argv[1]` names an existing file, so spawn
  // the Node/Bun binary (`execPath`) with that script as its first argument.
  if (host.argv1 !== undefined && host.fileExists(host.argv1)) {
    return { ok: true, rung: 1, execPath: host.execPath, scriptArgs: [host.argv1] };
  }
  // Rung 2 — compiled binary: the entry script is unusable and `execPath` is not
  // a generic runtime, so Pi itself is the executable — spawn it directly.
  if (!host.isGenericRuntime(host.execPath)) {
    return { ok: true, rung: 2, execPath: host.execPath, scriptArgs: [] };
  }
  // Both rungs failed. There is NO `PATH` fallback (a `PATH`-resolved `pi` may be
  // a different version/install, silently violating the pinned wire contract) —
  // the verdict is a closed refusal, handled fail-closed at load time upstream.
  return { ok: false };
}

// ---------------------------------------------------------------------------
// Project-local trust inference (#subagent-isolation-and-trust).
// ---------------------------------------------------------------------------

/**
 * The `pi.getAllTools()` `ToolInfo` subset the trust inference reads: a tool's
 * name and its source scope. Declared locally (rather than importing Pi's
 * `ToolInfo`) as the narrow structural surface this seam consumes; a real
 * `ToolInfo` (`name` + `sourceInfo.scope`) is assignable to it. `scope` is
 * project-local when it is `"project"` (Pi's `SourceScope` is `"user" |
 * "project" | "temporary"`).
 */
export interface ToolSourceScope {
  readonly name: string;
  readonly sourceInfo: { readonly scope: string };
}

/**
 * Project-local trust inference (#subagent-isolation-and-trust). The launcher
 * passes `--approve` **iff** the callable set contains a tool whose
 * `pi.getAllTools()` `sourceInfo` is **project-local** (`sourceInfo.scope ===
 * "project"`) — the parent could only have admitted that tool because the
 * operator already trusted its extension in the parent session, so the child
 * inherits a decision already made — and `--no-approve` otherwise (least
 * privilege): only built-ins / user-scope extension tools, or an empty callable
 * set, yield `--no-approve`. Built-in Pi tools carry no project-local
 * `sourceInfo`; a callable name absent from `allTools` (e.g. a plain built-in)
 * contributes no trust.
 */
export function inferChildTrust(
  callableNames: readonly string[],
  allTools: readonly ToolSourceScope[],
): boolean {
  // The parent could only have admitted a project-local tool because the operator
  // already trusted its extension in the parent session, so the child inherits a
  // decision already made. A callable name absent from `allTools` (a plain
  // built-in) or resolving to a non-project scope contributes no trust.
  const projectLocal = new Set(
    allTools
      .filter((tool) => tool.sourceInfo.scope === "project")
      .map((tool) => tool.name),
  );
  return callableNames.some((name) => projectLocal.has(name));
}

// ---------------------------------------------------------------------------
// Argv assembly (#subagent-launch-contract).
// ---------------------------------------------------------------------------

/** The inputs the subagent-drive argv assembly consumes (RFC-0006 json-mode child). */
export interface SubagentArgvInput {
  /** The callee slug → `-p "/<slug>"` (the child invokes the callee as its root slash command). */
  readonly slug: string;
  /** The theta discovery roots → `--theta <dir>` (repeated), so the child re-discovers the callee. */
  readonly thetaDirs: readonly string[];
  /** Resolved-and-interpolated frontmatter `system:` → `--system-prompt`. */
  readonly systemPrompt: string;
  /** The theta's callable set → `--tools <name1,name2,…>` (defence-in-depth, PIC-58). */
  readonly tools: readonly string[];
  /** `true` when the callable set is empty → `--no-tools` (empty ≠ omission). */
  readonly emptyCallableSet: boolean;
  /** Resolved model provider → `--provider <p>`. */
  readonly provider: string;
  /** Resolved model id → `--model <id>`. */
  readonly model: string;
  /** Project-local trust inference → `--approve` iff true, else `--no-approve`. */
  readonly approve: boolean;
}

/**
 * RFC-0006 (subagent.md #subagent-launch-contract). Assemble the json-mode child
 * argv (after the executable + entry-script args). The compliant assembly is:
 *   --theta <dir>… --mode json -p "/<slug>" --no-session --system-prompt <sp>
 *   (--tools <csv> | --no-tools) --provider <p> --model <id>
 *   --no-skills --no-prompt-templates --no-themes --no-context-files
 *   (--approve | --no-approve)
 * The child runs the WHOLE callee: interpreter, extension discovery, and its own
 * host agent loop. `--tools` is defence-in-depth only (the child theta enforces
 * its own callable set); `tools: []` maps to `--no-tools` (never re-enables Pi
 * defaults by omission). Params ride the marshalled channel (PIC-60), the result
 * rides the stdout envelope (PIC-59) — neither is on argv.
 */
export function assembleSubagentArgv(input: SubagentArgvInput): string[] {
  const argv: string[] = [];
  // `--theta <dir>` (repeated) so the child re-discovers the callee `.theta` and
  // its `.thetalib` imports (the child owns the interpreter under RFC 0006).
  for (const dir of input.thetaDirs) {
    argv.push("--theta", dir);
  }
  argv.push(
    "--mode",
    "json",
    "-p",
    `/${input.slug}`,
    "--no-session",
    "--system-prompt",
    input.systemPrompt,
  );
  // `--no-tools` for the empty callable set (empty ≠ omission — omission would
  // re-enable Pi's default built-ins); otherwise the comma-joined allowlist.
  if (input.emptyCallableSet) {
    argv.push("--no-tools");
  } else {
    argv.push("--tools", input.tools.join(","));
  }
  argv.push("--provider", input.provider, "--model", input.model);
  argv.push(
    "--no-skills",
    "--no-prompt-templates",
    "--no-themes",
    "--no-context-files",
  );
  argv.push(input.approve ? "--approve" : "--no-approve");
  return argv;
}

// ---------------------------------------------------------------------------
// Child env (#subagent-launch-contract env marker + parent-PID carriage).
// ---------------------------------------------------------------------------

/**
 * Build the child environment: full inheritance of the parent env plus the
 * per-chain invoke-depth carriage (`invokeDepth` — the parent's CURRENT chain
 * depth, so the child continues the depth-32 ceiling across the process hop per
 * invocation.md §INV-4), the parent-PID carriage (for the PIC-9 orphan-prevention
 * watchdog), and — when `rootSlug` is supplied — the PIC-58 subagent-root regime
 * marker (`PI_THETA_SUBAGENT_ROOT=<slug>`), which subsumes RFC-0005's boolean
 * child marker and carries watcher suppression + no-recursion + regime selection.
 * Credentials are never marshalled — full inheritance is the mechanism.
 */
export function buildSubagentChildEnv(
  parentEnv: Readonly<Record<string, string | undefined>>,
  parentPid: number,
  invokeDepth: number,
  rootSlug?: string,
): Record<string, string | undefined> {
  // Full inheritance is the credential mechanism (credentials are never
  // marshalled). The parent PID is the PIC-9 orphan-prevention watchdog input;
  // the invoke depth is the wire-level INV-4 counter the child seeds its chain
  // from (these are two DISTINCT carriages — the PID is not the depth counter).
  // The PIC-58 root marker (when set) subsumes the old child marker: it selects
  // the subagent-root regime and suppresses the child's own file watcher.
  return {
    ...parentEnv,
    ...(rootSlug !== undefined ? { [SUBAGENT_ROOT_ENV_MARKER]: rootSlug } : {}),
    [SUBAGENT_PARENT_PID_ENV]: String(parentPid),
    [SUBAGENT_INVOKE_DEPTH_ENV]: String(invokeDepth),
  };
}

// ---------------------------------------------------------------------------
// Spawn seam.
// ---------------------------------------------------------------------------

/** The child exit info the teardown / crash paths observe. */
export interface ChildExitInfo {
  readonly code: number | null;
  readonly signal: string | null;
}

/**
 * The minimal spawned-child handle the subagent drive consumes. A fake process
 * launcher implements this for the PIC-22 / teardown / wire tests; the
 * production spawn adapts a Node `ChildProcess`.
 */
export interface SubagentChildProcess {
  /** The OS process id, or `undefined` if the spawn has not assigned one. */
  readonly pid: number | undefined;
  /** Write a command line to the child's stdin (RPC JSONL, LF-terminated). */
  writeStdin(data: string): void;
  /** Close the child's stdin pipe (graceful shutdown trigger; stdin-EOF). */
  closeStdin(): void;
  /**
   * Subscribe to LF-split stdout lines (strict-JSONL RPC events). Returns an
   * unsubscribe handle so a per-query reader detaches its listener on settle —
   * a long-lived child driving many queries must not accumulate O(queries)
   * stdout listeners.
   */
  onStdoutLine(listener: (line: string) => void): () => void;
  /**
   * Subscribe to LF-split stderr lines (crash-detail capture). Returns an
   * unsubscribe handle (same non-accumulation obligation as `onStdoutLine`).
   */
  onStderrLine(listener: (line: string) => void): () => void;
  /** Subscribe to child exit (observed exit settles the dispose barrier). */
  onExit(listener: (info: ChildExitInfo) => void): void;
  /** Process-tree kill (Windows-safe; no POSIX-signal dependence). */
  kill(): void;
}

/** The spawn function the launcher drives (injected; fake in tests). */
export type SpawnFn = (
  execPath: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly env: Record<string, string | undefined> },
) => SubagentChildProcess;

/** The full launch request the drive seam hands the launcher. */
export interface SubagentLaunchRequest {
  readonly argv: SubagentArgvInput;
  readonly cwd: string;
  readonly parentEnv: Readonly<Record<string, string | undefined>>;
  readonly parentPid: number;
  /** The parent's CURRENT per-chain invoke depth, marshalled to the child (INV-4). */
  readonly invokeDepth: number;
  readonly host: ExecutableHost;
}

/** The launcher's collaborators. */
export interface SubagentLaunchDeps {
  readonly spawn: SpawnFn;
  readonly emitDiagnostic: (diagnostic: Diagnostic) => void;
}

/** The launch outcome. */
export type SubagentLaunchResult =
  | { readonly ok: true; readonly child: SubagentChildProcess }
  | { readonly ok: false; readonly reason: "unresolved" | "spawn-failed" };

/**
 * Launch one child `pi` process for a subagent-mode invocation: resolve the
 * executable, assemble argv, build the marked child env, and spawn with the
 * forwarded `cwd`. On a spawn throw (ENOENT/EPERM/immediate exit) emit
 * `theta/runtime/subagent-spawn-failed` and return the `spawn-failed` reason
 * (the caller additionally routes it through `theta/runtime/internal-error`).
 */
export function launchSubagentChild(
  request: SubagentLaunchRequest,
  deps: SubagentLaunchDeps,
): SubagentLaunchResult {
  const resolution = resolveSubagentExecutable(request.host);
  if (!resolution.ok) {
    // Both rungs failed at launch time. Load-time probing (capability-probe.ts
    // Step 0 (f)) normally catches this fail-closed before registration.
    return { ok: false, reason: "unresolved" };
  }
  const argv = [...resolution.scriptArgs, ...assembleSubagentArgv(request.argv)];
  // PIC-58: the root-regime marker carries the callee slug, subsuming the old
  // child marker (watcher suppression + no-recursion + regime selection).
  const env = buildSubagentChildEnv(
    request.parentEnv,
    request.parentPid,
    request.invokeDepth,
    request.argv.slug,
  );
  try {
    const child = deps.spawn(resolution.execPath, argv, { cwd: request.cwd, env });
    return { ok: true, child };
  } catch (spawnError: unknown) { // allow-broad-catch: theta/runtime/subagent-spawn-failed — pi-integration-contract/subagent.md
    // A spawn throw (ENOENT/EPERM/immediate exit) records the operator-triage
    // diagnostic here; the caller additionally routes it through the
    // runtime-defect surface via `routeSubagentSpawnFailure`.
    const message = spawnError instanceof Error ? spawnError.message : String(spawnError);
    deps.emitDiagnostic({
      severity: "error",
      code: SUBAGENT_SPAWN_FAILED_CODE,
      message: `subagent child spawn failed: ${message}`,
      hint: resolution.execPath,
    });
    return { ok: false, reason: "spawn-failed" };
  }
}

// ---------------------------------------------------------------------------
// Spawn-failure dual routing (PIC-9 spawn-failure rule / PIC-41).
// ---------------------------------------------------------------------------

/** `theta/runtime/internal-error` — the invocation-failure surface a spawn failure routes through. */
export { INTERNAL_ERROR_CODE as SUBAGENT_SPAWN_INTERNAL_ERROR_CODE };

/** Collaborators the spawn-failure routing drives. */
export interface SpawnFailureRoutingDeps {
  /** Runtime-defect sink for the `theta/runtime/internal-error` diagnostic. */
  readonly emitDiagnostic: (diagnostic: Diagnostic) => void;
  /** `invoke`-parent sink; absent at a top-level slash/prompt surface. */
  readonly emitInvokeInfra?: (error: InvokeInfraError) => void;
}

/**
 * PIC-9 spawn-failure rule (with PIC-41). A child spawn that fails at launch
 * (ENOENT/EPERM/immediate exit) is **dually** routed: `launchSubagentChild`
 * already emits the operator-triage diagnostic `theta/runtime/subagent-spawn-
 * failed`, and this routing additionally surfaces the failure on the
 * invocation-failure surface as an unanticipated SDK reject —
 * `theta/runtime/internal-error`, plus `Err(InvokeInfraError { kind:
 * "invoke_infra", cause: "internal_error", ... })` to an `invoke` parent. The
 * parent invocation observes the `internal-error` routing (slash-command system
 * note / `invoke`-parent envelope); no child was launched, so there is nothing
 * to tear down.
 */
export function routeSubagentSpawnFailure(
  error: unknown,
  calleePath: string,
  deps: SpawnFailureRoutingDeps,
): void {
  // Classify the throw through the runtime-defect surface — a spawn failure is an
  // unanticipated SDK reject, routed exactly as one. The launch failure is not
  // tied to a source token, so a synthetic zero-width origin range is used.
  const diagnostic = surfaceUnexpectedThrow(error, {
    file: calleePath,
    range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
  });
  if (diagnostic !== undefined) {
    deps.emitDiagnostic(diagnostic);
  }
  // At an `invoke` parent, additionally surface the `invoke_infra` envelope.
  if (deps.emitInvokeInfra !== undefined) {
    const message = error instanceof Error ? error.message : String(error);
    deps.emitInvokeInfra({
      kind: "invoke_infra",
      message: `internal error: ${message}`,
      callee_path: calleePath,
      cause: "internal_error",
    });
  }
}
