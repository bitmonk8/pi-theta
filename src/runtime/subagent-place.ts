// RFC-0012 — subagent placement integration and spawn-failure dual routing.

import type { Diagnostic } from "../diagnostics/diagnostic";
import { INTERNAL_ERROR_CODE, surfaceUnexpectedThrow } from "./runtime-panics";
import type { SubagentChildProcess } from "./subagent-child-process";
import {
  launchSubagentChild,
  prepareSubagentLaunch,
  spawnFailedDiagnostic,
  type PreparedSubagentLaunch,
  type SubagentLaunchRequest,
  type SubagentLaunchResult,
} from "./subagent-launcher";
import {
  PIPE_PLACEMENT_NAME,
  type PlacedChild,
  type SubagentPlacementBackend,
  type SubagentPlacementRequest,
} from "./subagent-placement";

/** Project a prepared launch onto the backend-facing request shape. */
export function toPlacementRequest(
  prepared: Extract<PreparedSubagentLaunch, { ok: true }>,
  request: SubagentLaunchRequest,
  launchFile: string | undefined,
): SubagentPlacementRequest {
  return {
    execPath: prepared.execPath,
    args: prepared.args,
    cwd: prepared.cwd,
    env: prepared.env,
    label: prepared.label,
    presentation: prepared.presentation,
    launchFile,
    context: { invokeDepth: request.invokeDepth, parallel: request.parallel === true },
  };
}

/**
 * The wire a non-`pipe` placement runs over: the launch file the argv names
 * and the adapter that turns the backend's `PlacedChild` (no process handle —
 * the child's stdout is a TTY) into the `SubagentChildProcess` line source the
 * drive consumes. Opened BEFORE `place()` because the launch file carries the
 * channel's coordinates. Supplied by the result channel
 * (`subagent-result-channel.ts`); injected so the launcher stays free of
 * sockets and files.
 */
export interface OpenedSubagentWire {
  readonly launchFile: string;
  readonly adapt: (placed: PlacedChild) => SubagentChildProcess;
  /** Release the channel and delete the launch file when placement never happens. */
  readonly abandon: () => void;
}

/** The collaborators the general (async) placement path consumes. */
export interface SubagentPlacementDeps {
  readonly placement: SubagentPlacementBackend;
  readonly emitDiagnostic: (diagnostic: Diagnostic) => void;
  /**
   * Open the wire for a non-`pipe` backend. `undefined` (not wired) makes a
   * non-`pipe` placement a `spawn-failed` launch with a diagnostic naming the
   * missing wiring — never a silent `pipe` fallback.
   */
  readonly openWire?: (
    prepared: Extract<PreparedSubagentLaunch, { ok: true }>,
  ) => Promise<OpenedSubagentWire>;
}

/**
 * Place one child for a subagent-mode invocation through a placement backend
 * (RFC 0012 §1): prepare the launch, open the wire for a non-`pipe` backend,
 * call `place()`, and adapt the result to the `SubagentChildProcess` line
 * source `driveSubagentChild` consumes. Under the `pipe` backend this is
 * `launchSubagentChild` with an `await` in front — same argv, same env, same
 * cwd, no launch file. A placement throw or rejection is a spawn failure
 * (`theta/runtime/subagent-spawn-failed`, existing code).
 */
export async function placeSubagentChild(
  request: SubagentLaunchRequest,
  deps: SubagentPlacementDeps,
): Promise<SubagentLaunchResult> {
  const backend = deps.placement;
  // `pipe` places synchronously and needs no wire: keep the two paths one.
  if (backend.name === PIPE_PLACEMENT_NAME) {
    return launchSubagentChild(request, {
      placement: backend,
      emitDiagnostic: deps.emitDiagnostic,
    });
  }
  const prepared = prepareSubagentLaunch(request);
  if (!prepared.ok) {
    return { ok: false, reason: "unresolved" };
  }
  if (deps.openWire === undefined) {
    deps.emitDiagnostic(
      spawnFailedDiagnostic(
        new Error(`placement '${backend.name}' needs the result channel, which is not wired`),
        request,
        prepared.execPath,
      ),
    );
    return { ok: false, reason: "spawn-failed" };
  }
  let wire: OpenedSubagentWire | undefined;
  try {
    wire = await deps.openWire(prepared);
    // The launch file path is on argv: re-prepare with it so the argv the
    // backend receives carries `--theta-launch <path>`.
    const withFile = prepareSubagentLaunch({
      ...request,
      argv: { ...request.argv, launchFile: wire.launchFile },
    });
    if (!withFile.ok) {
      wire.abandon();
      return { ok: false, reason: "unresolved" };
    }
    const placed = await backend.place(toPlacementRequest(withFile, request, wire.launchFile));
    return { ok: true, child: wire.adapt(placed), placed };
  } catch (spawnError: unknown) { // allow-broad-catch: theta/runtime/subagent-spawn-failed — pi-integration-contract/subagent.md
    wire?.abandon();
    deps.emitDiagnostic(spawnFailedDiagnostic(spawnError, request, prepared.execPath));
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
}

/**
 * PIC-65 spawn-failure rule. A child spawn that fails at launch
 * (ENOENT/EPERM/immediate exit) is **dually** routed: `launchSubagentChild`
 * already emits the operator-triage diagnostic `theta/runtime/subagent-spawn-
 * failed`, and this routing additionally surfaces the failure on the
 * invocation-failure surface as an unanticipated SDK reject —
 * `theta/runtime/internal-error`. An `invoke` parent receives its
 * `Err(InvokeInfraError { cause: "internal_error" })` envelope through the
 * boundary catch on the thrown `SubagentSpawnFailedError`, not here. No child
 * was launched, so there is nothing to tear down.
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
}
