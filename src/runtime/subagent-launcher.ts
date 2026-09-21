// RFC-0006 — subagent child-process launcher seam.
//
// This module owns the child-process launch half of the RFC-0006 subagent
// drive (pi-integration-contract/subagent.md): the executable-resolution
// ladder (#subagent-executable-resolution), launch preparation using argv assembly
// from `subagent-argv.ts`, and env marshalling (the live `PI_THETA_SUBAGENT_ROOT` regime
// marker — which subsumed RFC-0005's retired `PI_THETA_SUBAGENT_CHILD` per
// PIC-58 — the parent-PID carriage, and the per-chain invoke-depth carriage per
// invocation.md §INV-4), and the synchronous spawn seam. Placement and failure
// routing live in `subagent-place.ts`; child-process contracts live in
// `subagent-child-process.ts`. This module re-exports those launch surfaces.
// The child owns the whole callee
// (interpreter, extension discovery, and its own host agent loop); only the
// child-`pi` process launch lives here, driven from the producer's subagent
// path (`production-theta-producer.ts`) and settled by the `--mode json` event
// line drive (`subagent-json-driver.ts`).
//
// Spec: pi-integration-contract/subagent.md (#subagent-executable-resolution,
// #subagent-launch-contract, #subagent-tools-allowlist-suppression, PIC-65
// spawn-failure), capability-probe.md Step 0 (f), diagnostics/code-registry-
// load.md (`theta/load/subagent-executable-unresolved`), diagnostics/code-
// registry-runtime.md (`theta/runtime/subagent-spawn-failed`).

import { resolve as resolvePath } from "node:path";
import type { Diagnostic } from "../diagnostics/diagnostic";
import {
  normalizeToolSnapshot,
  type HostToolSnapshotEntry,
} from "../seams/host-tool-snapshot";
import { assembleSubagentArgv, resolveHostCliDialect, type SubagentArgvInput } from "./subagent-argv";
import type { SpawnFn, SubagentChildProcess } from "./subagent-child-process";
import { toPlacementRequest } from "./subagent-place";
import { SUBAGENT_CALLABLE_HASHES_ENV } from "./subagent-callable-hash";
import { SUBAGENT_PARAMS_ENV, SUBAGENT_PARAMS_FILE_ENV } from "./subagent-params";
import {
  createPipePlacementBackend,
  THETA_LAUNCH_ENTRY,
  type PlacedChild,
  type SubagentLaunchEntry,
  type SubagentPlacementBackend,
  type SubagentPlacementPresentation,
} from "./subagent-placement";
import { SUBAGENT_ROOT_ENV_MARKER, SUBAGENT_ROOT_WINNER_ENV } from "./subagent-root-regime";

export * from "./subagent-argv";
export * from "./subagent-child-process";
export * from "./subagent-place";
export { spawnFailedDiagnostic };

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
 * at launch (ENOENT, EPERM, immediate nonzero exit before its stdout line
 * stream was usable). Records the spawn-specific detail; the failure also routes through
 * the runtime-defect surface (`theta/runtime/internal-error`).
 */
export const SUBAGENT_SPAWN_FAILED_CODE = "theta/runtime/subagent-spawn-failed";

// RFC-0006 (PIC-58): the subagent-root regime marker (`PI_THETA_SUBAGENT_ROOT=<slug>`,
// `SUBAGENT_ROOT_ENV_MARKER` in `subagent-root-regime.ts`, the single source of
// truth) SUBSUMES RFC-0005's `PI_THETA_SUBAGENT_CHILD` marker and carries its
// duties (watcher suppression, no-recursion guard, parent-PID carriage)
// alongside regime selection. The old boolean child marker is retired — its
// presence is now expressed by the presence of the root-slug marker.

/**
 * The env var carrying the parent PID to the child. Its live reader is the
 * control-plane authentication gate (`authenticateControlPlane`,
 * `production-subagent-host.ts`): the child compares it against its real
 * `ppid` and drops every control-plane carriage on a mismatch. It is also the
 * input reserved for the RECORDED BUT UNIMPLEMENTED child-side parent-PID
 * watchdog (PIC-65 orphan-prevention class-2 fallback). This is NOT the
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

/**
 * RFC-0012 §10: the env var carrying the launch ENTRY under `pipe` placement —
 * the JSON form of a `SubagentLaunchEntry` (`{"kind":"fn","name":"<fn>"}`).
 * Written ONLY for a fn entry (a theta entry is the absent default, so a
 * `.theta` callee's env is byte-identical to the pre-RFC launch); read by the
 * child's regime detection beside the root marker and authenticated by the
 * same ppid gate. Under a non-`pipe` placement the entry rides the launch file
 * instead (`subagent-launch-file.ts`).
 */
export const SUBAGENT_LAUNCH_ENTRY_ENV = "PI_THETA_SUBAGENT_ENTRY";

/**
 * RFC-0012 §2: the registered CLI flag (`--theta-launch <path>`, the `--theta`
 * flag's sibling; `pi.registerFlag` in the factory body, `pi.getFlag` in the
 * child) that names the parent-private launch file to a child a non-`pipe`
 * placement spawned. Written by the parent launcher only, never by an
 * operator.
 */
export const SUBAGENT_LAUNCH_FLAG = "theta-launch";

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
// Child env (#subagent-launch-contract env marker + parent-PID carriage).
// ---------------------------------------------------------------------------

/**
 * The `PI_THETA_*` control-plane variables — the ones that steer a theta
 * process's behaviour rather than merely being passed along. Each is normally
 * written by a pi-theta parent at spawn and read by the child it spawned:
 *
 *   - the extension pin becomes `-e <path>`, i.e. "load this file as an extension";
 *   - the root marker puts the process into subagent-root regime (watcher
 *     suppression, in-process root drive, a machine envelope on fd 1);
 *   - the marked-root winner path (bug 0331) steers the child's collision
 *     resolution to the parent's own source-priority outcome, for the marked
 *     root's slug alone;
 *   - the params carriers supply the callee's arguments and BYPASS the binder;
 *   - the invoke depth seeds the recursion ceiling;
 *   - the callable-hash map is the load-to-spawn tamper check;
 *   - the launch entry (RFC 0012 §10) names the `subagent fn` the child runs
 *     instead of the root theta's body;
 *   - the parent-pid carriage authenticates all of the above
 *     (`authenticateControlPlane`, `production-subagent-host.ts`).
 *
 * The list lives HERE, beside the keys this module owns and at the site
 * that WRITES the child control plane, so the writer and the child-side reader
 * (`authenticateControlPlane`, which imports it) cannot drift apart; the
 * extension layer consumes it in the existing extension→runtime direction.
 */
export const SUBAGENT_CONTROL_PLANE_ENV_KEYS: readonly string[] = Object.freeze([
  SUBAGENT_EXTENSION_PIN_ENV,
  SUBAGENT_ROOT_ENV_MARKER,
  SUBAGENT_ROOT_WINNER_ENV,
  SUBAGENT_PARAMS_ENV,
  SUBAGENT_PARAMS_FILE_ENV,
  SUBAGENT_INVOKE_DEPTH_ENV,
  SUBAGENT_CALLABLE_HASHES_ENV,
  SUBAGENT_PARENT_PID_ENV,
  // RFC-0012 §10: the fn entry under `pipe` — per-launch, scrubbed and
  // authenticated like the params carriers it travels beside.
  SUBAGENT_LAUNCH_ENTRY_ENV,
]);

/**
 * The control-plane keys that are PER-LAUNCH — re-derived by every launch and
 * therefore scrubbed out of the inherited environment before this launch's own
 * values are applied (bug 0474). The set is the control plane above MINUS the
 * extension pin, which is deliberately heritable down the process tree
 * (#subagent-extension-pin: a harness pins the top of the chain once and every
 * nesting level must keep loading that build).
 *
 * WHY a scrub and not the authentication gate: the gate answers "did a real
 * parent write this?", and for a leaked value the honest answer is YES — the
 * launcher writes the true parent pid beside whatever its own environment
 * happened to carry, so the child authenticates a control plane that belongs to
 * a DIFFERENT invocation (a foreign hash map, a foreign params file) and
 * refuses fail-closed. Composition, not authentication, is the fix: the child's
 * control plane is built from THIS launch alone.
 */
export const SUBAGENT_PER_LAUNCH_CONTROL_PLANE_ENV_KEYS: readonly string[] = Object.freeze(
  SUBAGENT_CONTROL_PLANE_ENV_KEYS.filter((key) => key !== SUBAGENT_EXTENSION_PIN_ENV),
);

/**
 * Build the child environment: full inheritance of the parent env — MINUS the
 * per-launch control plane (see `SUBAGENT_PER_LAUNCH_CONTROL_PLANE_ENV_KEYS`) —
 * plus this launch's own control-plane carriage: the optional `controlPlane`
 * patch (the params carriers, the callable-hash map and the marked-root winner
 * path the caller marshalled for THIS invocation), the per-chain invoke-depth
 * carriage (`invokeDepth` — the parent's CURRENT chain depth, so the child
 * continues the depth-32 ceiling across the process hop per invocation.md
 * §INV-4), the parent-PID carriage (the control-plane authentication key — see
 * `SUBAGENT_PARENT_PID_ENV`), and — when `rootSlug` is supplied — the PIC-58
 * subagent-root regime marker (`PI_THETA_SUBAGENT_ROOT=<slug>`), which subsumes
 * RFC-0005's boolean child marker and carries watcher suppression +
 * no-recursion + regime selection. Credentials are never marshalled — full
 * inheritance is the mechanism.
 */
export function buildSubagentChildEnv(
  parentEnv: Readonly<Record<string, string | undefined>>,
  parentPid: number,
  invokeDepth: number,
  rootSlug?: string,
  controlPlane?: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> {
  // Full inheritance is the credential mechanism (credentials are never
  // marshalled) — but inheritance stops at the control plane (bug 0474,
  // subagent.md #subagent-launch-contract): a launching process frequently
  // carries a control plane of its own (it is itself a subagent child, or a
  // harness/wrapper session whose environment holds one), and those values name
  // a DIFFERENT invocation's params, hashes and marked root. The child's
  // parent-pid gate cannot catch that — this launcher writes the real pid, so
  // the leak authenticates — so the stale carriers are removed here and every
  // per-launch value is re-derived below.
  const inherited: Record<string, string | undefined> = { ...parentEnv };
  for (const key of SUBAGENT_PER_LAUNCH_CONTROL_PLANE_ENV_KEYS) {
    delete inherited[key];
  }
  // The parent PID is the child's control-plane authentication key (and the
  // reserved, unimplemented PIC-65 watchdog input); the invoke depth is the
  // wire-level INV-4 counter the child seeds its chain from (two DISTINCT
  // carriages — the PID is not the depth).
  // The PIC-58 root marker (when set) subsumes the old child marker: it selects
  // the subagent-root regime and suppresses the child's own file watcher.
  return {
    ...inherited,
    ...(controlPlane ?? {}),
    ...(rootSlug !== undefined ? { [SUBAGENT_ROOT_ENV_MARKER]: rootSlug } : {}),
    [SUBAGENT_PARENT_PID_ENV]: String(parentPid),
    [SUBAGENT_INVOKE_DEPTH_ENV]: String(invokeDepth),
  };
}

// ---------------------------------------------------------------------------
// Spawn seam.
// ---------------------------------------------------------------------------

/** The full launch request the drive seam hands the launcher. */
export interface SubagentLaunchRequest {
  readonly argv: SubagentArgvInput;
  readonly cwd: string;
  readonly parentEnv: Readonly<Record<string, string | undefined>>;
  /**
   * THIS launch's own control-plane carriage (marshalled params carriers,
   * callable-hash map, marked-root winner path). Kept separate from `parentEnv`
   * because the launcher scrubs the per-launch control plane out of the
   * inherited environment (bug 0474): a value layered into `parentEnv` would be
   * indistinguishable from a stale inherited one and would be scrubbed with it.
   */
  readonly controlPlaneEnv?: Readonly<Record<string, string | undefined>>;
  readonly parentPid: number;
  /** The parent's CURRENT per-chain invoke depth, marshalled to the child (INV-4). */
  readonly invokeDepth: number;
  readonly host: ExecutableHost;
  /**
   * RFC-0012 §10: what the child runs as its process-root invocation — the
   * root theta's body (the default) or a named `subagent fn` of it. A fn entry
   * rides `SUBAGENT_LAUNCH_ENTRY_ENV` under `pipe` and the launch file under
   * every other placement.
   */
  readonly entry?: SubagentLaunchEntry;
  /**
   * RFC-0012 §1: the display label a backend titles the child with. The
   * production producer supplies `"<slug>#<id>"` (or `"<slug>#<fn>#<id>"`
   * for a fn entry), `<id>` being the first eight hex characters of the
   * invocation id. Defaults to the bare slug when a direct caller passes
   * none.
   */
  readonly label?: string;
  /** RFC-0012 §1: whether this launch is one of a `par for` fan-out (backend grouping hint only). */
  readonly parallel?: boolean;
}

/**
 * The launcher's collaborators. Exactly one of the two launch seams is
 * supplied: `placement` — a placement backend (RFC 0012 §1), the general
 * form — or `spawn`, the shorthand for `pipe` placement over that spawn
 * function (`createPipePlacementBackend(spawn)`), which is what every launch
 * was before the seam existed.
 */
export type SubagentLaunchDeps =
  | {
      readonly placement: SubagentPlacementBackend;
      readonly spawn?: undefined;
      readonly emitDiagnostic: (diagnostic: Diagnostic) => void;
    }
  | {
      readonly spawn: SpawnFn;
      readonly placement?: undefined;
      readonly emitDiagnostic: (diagnostic: Diagnostic) => void;
    };

/** The launch outcome. */
export type SubagentLaunchResult =
  | { readonly ok: true; readonly child: SubagentChildProcess; readonly placed: PlacedChild }
  | { readonly ok: false; readonly reason: "unresolved" | "spawn-failed" };

/**
 * The assembled launch, before placement: everything `placeSubagentChild`
 * hands a backend except the launch file (which the caller writes between
 * preparation and placement, because its contents include result-channel
 * coordinates only the caller holds).
 */
export type PreparedSubagentLaunch =
  | {
      readonly ok: true;
      readonly execPath: string;
      readonly args: readonly string[];
      readonly cwd: string;
      readonly env: Record<string, string | undefined>;
      readonly label: string;
      readonly presentation: SubagentPlacementPresentation;
      readonly entry: SubagentLaunchEntry;
    }
  | { readonly ok: false; readonly reason: "unresolved" };

/**
 * Resolve the executable, assemble argv (honouring the opt-in extension pin,
 * #subagent-extension-pin, and the presentation / launch-file inputs on
 * `request.argv`), and build the marked child env. Pure and synchronous — the
 * half of a launch that is identical for every placement. Returns the
 * `unresolved` verdict when both executable rungs fail (load-time probing
 * normally catches this before registration).
 */
export function prepareSubagentLaunch(request: SubagentLaunchRequest): PreparedSubagentLaunch {
  const resolution = resolveSubagentExecutable(request.host);
  if (!resolution.ok) {
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
  const entry = request.entry ?? THETA_LAUNCH_ENTRY;
  // RFC-0012 §10: a fn entry rides the env control plane under `pipe` (the
  // one new key inside the scrubbed per-launch set); a theta entry writes
  // nothing, so a `.theta` callee's env is byte-identical to the pre-RFC form.
  // A non-`pipe` placement additionally carries the entry on the launch file
  // (the child's read prefers the file when argv names one).
  const entryEnv: Record<string, string | undefined> =
    entry.kind === "fn" ? { [SUBAGENT_LAUNCH_ENTRY_ENV]: JSON.stringify(entry) } : {};
  // PIC-58: the root-regime marker carries the callee slug, subsuming the old
  // child marker (watcher suppression + no-recursion + regime selection).
  const env = buildSubagentChildEnv(
    request.parentEnv,
    request.parentPid,
    request.invokeDepth,
    request.argv.slug,
    { ...(request.controlPlaneEnv ?? {}), ...entryEnv },
  );
  return {
    ok: true,
    execPath: resolution.execPath,
    args: argv,
    cwd: request.cwd,
    env,
    label: request.label ?? request.argv.slug,
    presentation: request.argv.presentation ?? "headless",
    entry,
  };
}

/**
 * Render the `theta/runtime/subagent-spawn-failed` diagnostic for a throw at
 * placement time (ENOENT / EPERM / immediate exit / a backend's own refusal).
 * Shared by the synchronous `pipe` launcher and the async placement path so
 * both emit one row shape.
 */
function spawnFailedDiagnostic(
  spawnError: unknown,
  request: SubagentLaunchRequest,
  execPath: string,
): Diagnostic {
  const raw = spawnError instanceof Error ? spawnError.message : String(spawnError);
  // INV-7 (invocation.md): a spawn failure MUST be diagnosable naming the
  // offending working directory — the per-call `with { cwd }` clause makes a
  // bad cwd a first-class authoring mistake, and Node's ENOENT names the
  // EXECUTABLE, not the cwd. Enrich the `<error.message>` slot when the OS
  // error does not already carry the directory: slot CONTENT, not a template
  // change, so DIAG-4's pinned `subagent child spawn failed: <error.message>`
  // Message holds and the hint stays the attempted executable. Unconditional
  // on clause presence — the launcher cannot know, and a default-cwd failure
  // gains the same diagnosability. Existence is never pre-checked (INV-7):
  // the OS error at spawn is the authoritative verdict.
  const attemptedCwd = resolvePath(request.cwd);
  const message = raw.includes(request.cwd) ? raw : `${raw} (cwd: ${attemptedCwd})`;
  return {
    severity: "error",
    code: SUBAGENT_SPAWN_FAILED_CODE,
    message: `subagent child spawn failed: ${message}`,
    hint: execPath,
  };
}

/**
 * Launch one child `pi` process for a subagent-mode invocation under `pipe`
 * placement, synchronously: resolve the executable, assemble argv, build the
 * marked child env, and spawn with the forwarded `cwd`. On a spawn throw
 * (ENOENT/EPERM/immediate exit) emit `theta/runtime/subagent-spawn-failed` and
 * return the `spawn-failed` reason (the caller additionally routes it through
 * `theta/runtime/internal-error`).
 *
 * This is the `pipe` specialisation of `placeSubagentChild`: byte-identical
 * spawn arguments, no launch file, no result channel. It stays synchronous
 * because `SpawnFn` is, and the PIC-22 / teardown / wire tests drive it
 * directly. `deps.placement` is accepted for symmetry but MUST be a
 * synchronous pipe-shaped backend (one whose `place` returns a `process`);
 * any other backend belongs to `placeSubagentChild`.
 */
export function launchSubagentChild(
  request: SubagentLaunchRequest,
  deps: SubagentLaunchDeps,
): SubagentLaunchResult {
  const prepared = prepareSubagentLaunch(request);
  if (!prepared.ok) {
    // Both rungs failed at launch time. Load-time probing (capability-probe.ts
    // Step 0 (f)) normally catches this fail-closed before registration.
    return { ok: false, reason: "unresolved" };
  }
  const backend =
    deps.placement !== undefined ? deps.placement : createPipePlacementBackend(deps.spawn);
  try {
    const placed = backend.place(toPlacementRequest(prepared, request, undefined));
    if (placed instanceof Promise || placed.process === undefined) {
      throw new Error(
        `placement '${backend.name}' is not a synchronous pipe-shaped backend; use placeSubagentChild`,
      );
    }
    return { ok: true, child: placed.process, placed };
  } catch (spawnError: unknown) { // allow-broad-catch: theta/runtime/subagent-spawn-failed — pi-integration-contract/subagent.md
    // A spawn throw (ENOENT/EPERM/immediate exit) records the operator-triage
    // diagnostic here; the caller additionally routes it through the
    // runtime-defect surface via `routeSubagentSpawnFailure`.
    deps.emitDiagnostic(spawnFailedDiagnostic(spawnError, request, prepared.execPath));
    return { ok: false, reason: "spawn-failed" };
  }
}
