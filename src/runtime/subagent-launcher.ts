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
// #subagent-launch-contract, #subagent-tools-allowlist-suppression, PIC-65
// spawn-failure), capability-probe.md Step 0 (f), diagnostics/code-registry-
// load.md (`theta/load/subagent-executable-unresolved`), diagnostics/code-
// registry-runtime.md (`theta/runtime/subagent-spawn-failed`).

import { delimiter as PATH_DELIMITER } from "node:path";
import type { Diagnostic } from "../diagnostics/diagnostic";
import {
  normalizeToolSnapshot,
  type HostToolSnapshotEntry,
} from "../seams/host-tool-snapshot";
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
 * The env var carrying the parent PID to the child, reserved for the RECORDED
 * BUT UNIMPLEMENTED child-side parent-PID watchdog (PIC-65 orphan-prevention
 * class-2 fallback — nothing in `src/` reads it today; the carriage exists so
 * the watchdog can be added without a wire change). This is NOT the
 * invoke-depth counter — that rides `SUBAGENT_INVOKE_DEPTH_ENV` below.
 */
export const SUBAGENT_PARENT_PID_ENV = "PI_THETA_SUBAGENT_PARENT_PID";

/**
 * The OPT-IN child extension-identity pin (#subagent-extension-pin). When this
 * env var names a Pi extension entry directory, `launchSubagentChild` prepends
 * `-ne -e <dir>` to the child argv, so the child loads EXACTLY that theta
 * extension build instead of whatever ambient discovery finds. Production
 * default (var absent): ambient discovery, unchanged. Set by the acceptance
 * harness (tests/live/acceptance/harness.ts), which pins the OUTER `pi -p` process
 * to the working tree's `extensions/` the same way — without the pin the INNER
 * child can silently bind to a stale globally-installed theta build (a
 * parent/child version-skew hazard; bug 0002 defect 2). Because the child
 * inherits the full parent env, the pin propagates to nested children.
 */
export const SUBAGENT_EXTENSION_PIN_ENV = "PI_THETA_SUBAGENT_EXTENSION_PIN";

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
  /** `process.execPath` — the Node/Bun binary (rung 1 spawn) or host binary (rung 2). */
  readonly execPath: string;
  /**
   * The host SDK's own `CONFIG_DIR_NAME` constant (`".pi"` on Pi, `".omp"` on
   * Oh-My-Pi) — the host-identity signal `resolveHostCliDialect` reads. Sourced
   * from the LOADED SDK module rather than from a path or a version number, so
   * it names the host actually serving this process: a filename cannot (both
   * hosts' entry script is `cli.js`) and neither can an on-disk `package.json`
   * (a working tree may have the other host's packages installed as dev deps
   * while running under this one). Absent on a harness host that states no
   * identity, which resolves to the authored Pi dialect.
   */
  readonly configDirName?: string;
  /** Does `path` name an existing file? (rung-1 existence check). */
  fileExists(path: string): boolean;
  /** Is `execPath` a generic runtime (`node` / `bun`)? (rung-1 gate). */
  isGenericRuntime(execPath: string): boolean;
}

/** The resolution verdict: a runnable entry point, or the both-rungs-fail refusal. */
export type ExecutableResolution =
  | { readonly ok: true; readonly rung: 1 | 2; readonly execPath: string; readonly scriptArgs: readonly string[] }
  | { readonly ok: false };

/**
 * Resolve the child host executable via the two-rung ladder. Rung 1: when
 * `argv1` names an existing file, spawn `execPath` with that script. Rung 2:
 * when `argv1` is unusable and `execPath` is not a generic runtime, the host
 * itself is the executable — spawn it directly. There is NO `PATH` fallback;
 * both rungs failing is a closed `{ ok: false }` verdict (fail-closed at load
 * time upstream).
 *
 * Rung 1's existence check carries a load-bearing obligation the ladder cannot
 * discharge itself: `fileExists` MUST answer `false` for a path the CHILD could
 * not open. Inside a compiled host binary `argv1` is a path into the
 * executable's own embedded filesystem (`/$bunfs/root/…/cli.js`), which the
 * running process can stat but no spawned process can read. A `fileExists` that
 * answers `true` there selects rung 1 and spawns
 * `<host-binary> /$bunfs/root/…/cli.js …`, where the embedded path is not an
 * entry script the binary can run but a stray leading POSITIONAL argument — the
 * child starts with that path as its user message instead of the callee. See
 * `createProductionExecutableHost` for the production discharge.
 */
export function resolveSubagentExecutable(host: ExecutableHost): ExecutableResolution {
  // Rung 1 — entry-script: `argv1` names an existing file, so spawn the
  // Node/Bun binary (`execPath`) with that script as its first argument.
  if (host.argv1 !== undefined && host.fileExists(host.argv1)) {
    return { ok: true, rung: 1, execPath: host.execPath, scriptArgs: [host.argv1] };
  }
  // Rung 2 — compiled binary: the entry script is unusable and `execPath` is not
  // a generic runtime, so the host itself is the executable — spawn it directly.
  if (!host.isGenericRuntime(host.execPath)) {
    return { ok: true, rung: 2, execPath: host.execPath, scriptArgs: [] };
  }
  // Both rungs failed. There is NO `PATH` fallback (a `PATH`-resolved host may be
  // a different version/install, silently violating the pinned wire contract) —
  // the verdict is a closed refusal, handled fail-closed at load time upstream.
  return { ok: false };
}

// ---------------------------------------------------------------------------
// Project-local trust inference (#subagent-isolation-and-trust).
// ---------------------------------------------------------------------------

/**
 * Project-local trust inference (#subagent-isolation-and-trust). The launcher
 * grants the child PROJECT-LOCAL FILE trust **iff** the callable set contains a
 * tool whose host source scope is **project-local** (`"project"`; Pi's
 * `SourceScope` is `"user" | "project" | "temporary"`) — the parent could only
 * have admitted that tool because the operator already trusted its extension in
 * the parent session, so the child inherits a decision already made. Everything
 * else withholds trust (least privilege): built-ins, user-scope extension tools,
 * an empty callable set, a callable name absent from the snapshot, and — on a
 * host whose tool snapshot publishes no source scope at all — every tool.
 *
 * This is trust in project-local FILES, not tool-call approval; the two are
 * separate controls that one host spells with confusingly similar flags. See
 * `HostCliDialect` for why the verdict is not mapped onto the other host's
 * approval flags.
 *
 * `allTools` is the RAW host snapshot (`pi.getAllTools()`), normalised here
 * because the two hosts return different shapes; see
 * `seams/host-tool-snapshot.ts`.
 */
export function inferChildTrust(
  callableNames: readonly string[],
  allTools: readonly HostToolSnapshotEntry[],
): boolean {
  const projectLocal = new Set(
    normalizeToolSnapshot(allTools)
      .filter((tool) => tool.scope === "project")
      .map((tool) => tool.name),
  );
  return callableNames.some((name) => projectLocal.has(name));
}

// ---------------------------------------------------------------------------
// Argv assembly (#subagent-launch-contract).
// ---------------------------------------------------------------------------

/**
 * The host-CLI dialect the child argv is assembled in. The launch contract is
 * INTENT-level: every field below names an intent ("disable ambient extension
 * discovery", "withhold project-local trust") and carries the flags the target
 * host spells it with. Two hosts run a theta today and they do not share a flag
 * vocabulary, so the contract cannot be one hardcoded flag list:
 *
 *   - Pi accepts `-ne`, `--no-prompt-templates`, `--no-themes`,
 *     `--no-context-files`, `--approve` / `--no-approve`.
 *   - Oh-My-Pi has NONE of those spellings, and it REJECTS unknown flags
 *     outright (`Error: unknown flags: …`, exit code 2 before any session
 *     starts) rather than absorbing them into an extension-flag map the way Pi
 *     does. A Pi-spelled argv therefore does not degrade on Oh-My-Pi — it kills
 *     the child, which the parent observes only as an exit-without-envelope.
 *
 * An intent the target host cannot express is an EMPTY flag list, NEVER a
 * substitute drawn from a different control. Oh-My-Pi exposes no
 * prompt-template or theme opt-out and no project-trust flag, so a child there
 * inherits those ambient sources and that default trust posture. The isolation
 * that IS expressible is expressed — Oh-My-Pi's `--no-rules` is an
 * ambient-instruction source Pi has no counterpart for, and belongs to the same
 * intent as `--no-context-files`.
 *
 * On the project-trust pair specifically, resist the obvious-looking mapping.
 * Pi's `--approve` / `--no-approve` is PROJECT-FILE trust, not tool approval:
 * Pi's own argv parser sets `projectTrustOverride` from them, and its help text
 * reads "Trust project-local files for this run" / "Ignore project-local files
 * for this run". Oh-My-Pi's superficially similar `--auto-approve` and
 * `--approval-mode` govern TOOL-CALL approval instead — a different security
 * control with a different blast radius. Mapping the pair onto them would both
 * over-grant (`--auto-approve` sets `tools.approvalMode: yolo`, auto-approving
 * every write and exec, far broader than trusting project-local files) and
 * wrongly restrict (`--approval-mode always-ask` prompts for write/exec, and a
 * headless child has no UI to prompt, so those calls are DENIED — a restriction
 * Pi never imposed). Two unrelated controls that happen to share the word
 * "approve" stay unmapped.
 */
export interface HostCliDialect {
  /** Disable ambient extension discovery (the extension pin's first half). */
  readonly noExtensionDiscovery: readonly string[];
  /** Isolate the child from ambient non-theta instruction sources. */
  readonly ambientIsolation: readonly string[];
  /** Trust project-local files in the child (project-local trust inferred). */
  readonly projectTrust: readonly string[];
  /** Withhold project-local trust from the child (least privilege). */
  readonly noProjectTrust: readonly string[];
}

/** The authored host dialect — Pi (`@earendil-works/pi-coding-agent`). */
export const PI_CLI_DIALECT: HostCliDialect = Object.freeze({
  noExtensionDiscovery: Object.freeze(["-ne"]),
  ambientIsolation: Object.freeze([
    "--no-skills",
    "--no-prompt-templates",
    "--no-themes",
    "--no-context-files",
  ]),
  projectTrust: Object.freeze(["--approve"]),
  noProjectTrust: Object.freeze(["--no-approve"]),
});

/**
 * The Oh-My-Pi host dialect (`@oh-my-pi/pi-coding-agent`, the `omp` binary).
 * Both project-trust arms are EMPTY: the host has no project-trust flag, and the
 * nearest-looking flags govern a different control (see `HostCliDialect`). A
 * child there therefore keeps the host's own default posture toward
 * project-local files, in BOTH trust directions — a documented limitation of
 * running on this host, not a silent substitution.
 */
export const OMP_CLI_DIALECT: HostCliDialect = Object.freeze({
  noExtensionDiscovery: Object.freeze(["--no-extensions"]),
  ambientIsolation: Object.freeze(["--no-skills", "--no-rules"]),
  projectTrust: Object.freeze([]),
  noProjectTrust: Object.freeze([]),
});

/** The host `CONFIG_DIR_NAME` value that identifies an Oh-My-Pi host. */
const OMP_CONFIG_DIR_NAME = ".omp";

/*
 * There is deliberately NO env override for the dialect.
 *
 * An earlier revision honoured a `PI_THETA_HOST_DIALECT` variable as an operator
 * escape hatch. It was removed because it could only ever weaken isolation.
 * Forcing the Pi dialect on Oh-My-Pi kills every child (that host rejects unknown
 * flags), so the "escape" is a denial of service; forcing the Oh-My-Pi dialect on
 * Pi is worse, because Pi ABSORBS unrecognised flags instead of rejecting them, so
 * `--no-extensions` and `--no-rules` become no-ops and the child silently loses
 * every ambient-isolation flag it was supposed to carry — project context files
 * (AGENTS.md / CLAUDE.md from the repository) then enter its prompt, which is
 * exactly the injection channel the isolation set closes.
 *
 * The hatch also bought very little: detection reads the host SDK's own
 * `CONFIG_DIR_NAME` off the LOADED module, so it cannot be fooled by renaming or
 * wrapping a binary, and a wrong answer on Oh-My-Pi fails closed and loudly. And
 * on a host that loads `<cwd>/.env` into the environment, an env-readable switch
 * is repository-writable, which turns an operator hatch into an attacker lever.
 */
/**
 * Resolve the dialect from the host's own `CONFIG_DIR_NAME` constant — read off
 * the LOADED SDK module (see `ExecutableHost.configDirName`), so it names the
 * host actually serving this process. `".omp"` selects the Oh-My-Pi dialect;
 * every other value, and an absent one, selects the authored Pi dialect, so an
 * unrecognised host behaves exactly as it did before this seam existed.
 *
 * The host constant is the ONLY input: see the note above on why there is no env
 * override to weaken it.
 */
export function resolveHostCliDialect(configDirName: string | undefined): HostCliDialect {
  return configDirName === OMP_CONFIG_DIR_NAME ? OMP_CLI_DIALECT : PI_CLI_DIALECT;
}

/** The inputs the subagent-drive argv assembly consumes (RFC-0006 json-mode child). */
export interface SubagentArgvInput {
  /**
   * Optional extension-identity pin (#subagent-extension-pin): an extension
   * entry path → `<dialect.noExtensionDiscovery> -e <path>` PREPENDED to the
   * argv, disabling ambient extension discovery in the child. `undefined` (the
   * production default) leaves discovery ambient — both hosts auto-discover a
   * theta install from its `package.json` extension-entry declaration. Derived
   * from `SUBAGENT_EXTENSION_PIN_ENV` by `launchSubagentChild` when not supplied
   * explicitly.
   */
  readonly extensionPinDir?: string;
  /** The callee slug → `-p "/<slug>"` (the child invokes the callee as its root slash command). */
  readonly slug: string;
  /**
   * The theta discovery roots → ONE `--theta` flag, all roots joined with
   * `path.delimiter` (omitted when empty), so the child re-discovers the
   * callee. Never one flag per root — host pi resolves a repeated extension
   * string flag to its last occurrence, silently dropping every earlier root
   * in the child (bug 0008).
   */
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
  /**
   * Project-local trust inference (`inferChildTrust`) → the dialect's
   * `projectTrust` flags iff true, else its `noProjectTrust` flags. Named for
   * the control it governs — trusting the child with PROJECT-LOCAL FILES — and
   * deliberately not "approve": Pi spells this intent `--approve`/`--no-approve`
   * while Oh-My-Pi uses those words for tool-call approval instead, and the
   * shared word is what makes the two easy to conflate.
   */
  readonly projectTrust: boolean;
}

/**
 * RFC-0006 (subagent.md #subagent-launch-contract). Assemble the json-mode child
 * argv (after the executable + entry-script args). The compliant assembly is:
 *   [<no-extension-discovery> -e <pin>] [--theta <dirs>]
 *   --mode json -p "/<slug>" --no-session --system-prompt <sp>
 *   (--tools <csv> | --no-tools) --provider <p> --model <id>
 *   <ambient-isolation> (<approve> | <no-approve>)
 * The angle-bracketed groups come from `dialect` — see `HostCliDialect` for why
 * the launch contract is intent-level rather than a fixed flag list.
 * `--theta` is ONE flag joining every discovery root with `path.delimiter`
 * (the documented discovery CLI-source convention), omitted for an empty root
 * set — never repeated per root (bug 0008: the host collapses a repeated
 * extension string flag to its last occurrence).
 * The child runs the WHOLE callee: interpreter, extension discovery, and its own
 * host agent loop. `--tools` is defence-in-depth only (the child theta enforces
 * its own callable set); `tools: []` maps to `--no-tools` (never re-enables host
 * defaults by omission). Params ride the marshalled channel (PIC-60), the result
 * rides the stdout envelope (PIC-59) — neither is on argv.
 */
export function assembleSubagentArgv(
  input: SubagentArgvInput,
  dialect: HostCliDialect,
): string[] {
  const argv: string[] = [];
  // #subagent-extension-pin (opt-in; bug 0002 defect 2): pin the child to an
  // explicit extension entry — the dialect's no-discovery flag disables ambient
  // discovery, `-e <path>` loads exactly the named build — so a test harness's
  // child binds to the same extension under test as its parent. Absent
  // (production): ambient discovery.
  if (input.extensionPinDir !== undefined) {
    argv.push(...dialect.noExtensionDiscovery, "-e", input.extensionPinDir);
  }
  // ONE `--theta` flag carrying every discovery root joined with
  // `path.delimiter`, so the child re-discovers the callee `.theta` and its
  // `.thetalib` imports (the child owns the interpreter under RFC 0006). Never
  // one flag per root (bug 0008): host pi's argv parser stores extension flags
  // in an unknownFlags Map (dist/cli/args.js) — a repeated string flag resolves
  // to its LAST occurrence, and `pi.getFlag` is `boolean | string | undefined`
  // — so repeated `--theta` silently drops every root but the last in the
  // child. The joined single flag is the documented discovery CLI-source
  // convention (discovery-sources.md) and the form the child-side
  // `readThetaFlagPaths` already splits. An empty root set OMITS the flag —
  // omission is the documented no-CLI-source form, while `--theta ""` is an
  // undocumented argv shape that would merely rely on the reader dropping
  // empty split components.
  if (input.thetaDirs.length > 0) {
    argv.push("--theta", input.thetaDirs.join(PATH_DELIMITER));
  }
  // The system prompt is emitted so that it is read as TEXT, never as a path.
  //
  // Both hosts path-coerce this argument: one calls `existsSync` on the value and
  // reads the file when it exists, the other opens any newline-free value with
  // `Bun.file(value).text()` and falls back to the literal only on a read failure.
  // The value here is the theta's frontmatter `system:` text AFTER `${param}`
  // interpolation, and on the binder path those params are filled from model
  // output — so the coercion would let a value that happens to name a readable
  // file replace the intended prompt with that file's contents, and the child's
  // system prompt is not a channel where surprise content belongs.
  //
  // A leading newline defeats both coercions at once: the newline-bearing value is
  // returned as a literal by the one host, and no existing path can contain a
  // newline, so the other's existence test misses. A leading blank line is
  // semantically inert in a system prompt.
  //
  // The EMPTY prompt is left exactly as-is. Both hosts treat a falsy value as "no
  // CLI system prompt" and fall back to their built-in default, which is what a
  // theta declaring no `system:` wants; prefixing would make it truthy and install
  // a one-blank-line prompt instead, silently discarding that default.
  argv.push(
    "--mode",
    "json",
    "-p",
    `/${input.slug}`,
    "--no-session",
    "--system-prompt",
    input.systemPrompt === "" ? "" : `\n${input.systemPrompt}`,
  );
  // `--no-tools` for the empty callable set (empty ≠ omission — omission would
  // re-enable Pi's default built-ins); otherwise the comma-joined allowlist.
  if (input.emptyCallableSet) {
    argv.push("--no-tools");
  } else {
    argv.push("--tools", input.tools.join(","));
  }
  argv.push("--provider", input.provider, "--model", input.model);
  argv.push(...dialect.ambientIsolation);
  argv.push(...(input.projectTrust ? dialect.projectTrust : dialect.noProjectTrust));
  return argv;
}

// ---------------------------------------------------------------------------
// Child env (#subagent-launch-contract env marker + parent-PID carriage).
// ---------------------------------------------------------------------------

/**
 * Build the child environment: full inheritance of the parent env plus the
 * per-chain invoke-depth carriage (`invokeDepth` — the parent's CURRENT chain
 * depth, so the child continues the depth-32 ceiling across the process hop per
 * invocation.md §INV-4), the parent-PID carriage (reserved for the PIC-65
 * orphan-prevention watchdog, unimplemented), and — when `rootSlug` is supplied
 * — the PIC-58 subagent-root regime marker (`PI_THETA_SUBAGENT_ROOT=<slug>`),
 * which subsumes RFC-0005's boolean child marker and carries watcher
 * suppression + no-recursion + regime selection. Credentials are never
 * marshalled — full inheritance is the mechanism.
 */
export function buildSubagentChildEnv(
  parentEnv: Readonly<Record<string, string | undefined>>,
  parentPid: number,
  invokeDepth: number,
  rootSlug?: string,
): Record<string, string | undefined> {
  // Full inheritance is the credential mechanism (credentials are never
  // marshalled). The parent PID is the (unimplemented) PIC-65 orphan-prevention
  // watchdog input; the invoke depth is the wire-level INV-4 counter the child
  // seeds its chain from (two DISTINCT carriages — the PID is not the depth).
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
  /**
   * Release any parent-held stdin handle. A structural no-op under the
   * production spawn config — the child's stdin is spawned closed (bug 0002:
   * pi's `-p` startup gates on stdin EOF, so an open pipe deadlocks the pair;
   * EOF was never an exit signal). Retained on the surface so teardown can
   * release a live stdin on non-production children; MUST be an idempotent
   * no-op when there is nothing to close.
   */
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
  /** Kill the child: process-tree kill (taskkill) on win32; direct `SIGKILL` elsewhere. */
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
 * executable, assemble argv (honouring the opt-in extension pin,
 * #subagent-extension-pin), build the marked child env, and spawn with the
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
  // #subagent-extension-pin: an explicit argv-input pin wins; otherwise the
  // opt-in env knob (set by a test harness on the parent, inherited by every
  // nesting level) supplies it. Absent both — the production default — the
  // child argv carries no `-ne`/`-e` and extension discovery stays ambient.
  const envPin = request.parentEnv[SUBAGENT_EXTENSION_PIN_ENV]?.trim();
  const pin =
    request.argv.extensionPinDir ??
    (envPin !== undefined && envPin.length > 0 ? envPin : undefined);
  const argvInput: SubagentArgvInput =
    pin === undefined ? request.argv : { ...request.argv, extensionPinDir: pin };
  // The dialect describes the CLI that will parse this argv. It comes from the
  // host's own `CONFIG_DIR_NAME` on the injected executable host, so a wrapped or
  // renamed host binary cannot mislead it, and no env var can override it.
  const dialect = resolveHostCliDialect(request.host.configDirName);
  const argv = [...resolution.scriptArgs, ...assembleSubagentArgv(argvInput, dialect)];
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
// Spawn-failure dual routing (PIC-65 spawn-failure rule).
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
 * PIC-65 spawn-failure rule. A child spawn that fails at launch
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
