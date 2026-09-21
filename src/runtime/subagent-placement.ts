// RFC-0012 — subagent placement seam.
//
// Placement answers ONE question about a subagent child: WHERE the already-
// assembled launch (executable, argv, cwd, env, label) runs — the parent's own
// process tree (`pipe`, today's behaviour), an operator-supplied command
// (`exec`, `subagent-exec-placement.ts`), or a surface another extension
// drives over the `pi.events` registration protocol (a multiplexer tab). The
// seam is drawn BELOW the launch contract, not around it: a backend never sees
// params, the envelope, closure hashes or theta source, so everything above it
// (argv assembly, `--tools`, trust inference, model marshalling, PIC-59/60/65/
// 66) is byte-identical across placements (subagent.md
// #subagent-launch-contract, *Placement*).
//
// The types here are the published contract a companion backend package
// (`@bitmonk8/pi-theta-herdr`) imports — `@bitmonk8/pi-theta` ships `src/`, so
// the import path is `@bitmonk8/pi-theta/src/runtime/subagent-placement`. The
// registration protocol's `apiVersion` (`subagent-placement-registry.ts`)
// gates shape changes to these types.

import type { ChildExitInfo, SpawnFn, SubagentChildProcess } from "./subagent-child-process";

/** The reserved backend name of the built-in process-tree placement (default). */
export const PIPE_PLACEMENT_NAME = "pipe";
/** The reserved backend name of the operator-template placement (`subagentPlacementExec`). */
export const EXEC_PLACEMENT_NAME = "exec";
/** The reserved selector value meaning "pick a detected backend, else `pipe`". */
export const AUTO_PLACEMENT_NAME = "auto";

/**
 * Names a registered backend may NOT take: the two built-ins and the selector
 * keyword. A registration under one of these is dropped with
 * `theta/load/subagent-placement-invalid`.
 */
export const RESERVED_PLACEMENT_NAMES: readonly string[] = Object.freeze([
  PIPE_PLACEMENT_NAME,
  EXEC_PLACEMENT_NAME,
  AUTO_PLACEMENT_NAME,
]);

/** The backend-name grammar: lowercase, digit or hyphen, 1–32 characters, letter-initial. */
export const PLACEMENT_NAME_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;

/**
 * How the child is presented to a human. `"visible"` selects the interactive
 * TUI argv form (subagent.md #subagent-host-cli-dialect, visible-presentation
 * row) and the child-side visible regime (`ctx.shutdown()` on `Ok`, linger on
 * `Err`); `"headless"` is the `--mode json -p` form. Derived from the selected
 * backend's `visible` capability (§6 *Presentation*), never author-selected.
 */
export type SubagentPlacementPresentation = "headless" | "visible";

/**
 * What the child runs as its process-root invocation (RFC 0012 §10): the root
 * theta's own body (`theta`, today's behaviour) or a named top-level
 * `subagent fn` of that theta (`fn`), whose marshalled positional arguments
 * ride the PIC-60 params channel.
 */
export type SubagentLaunchEntry =
  | { readonly kind: "theta" }
  | { readonly kind: "fn"; readonly name: string };

/** The default entry: the root theta's body. */
export const THETA_LAUNCH_ENTRY: SubagentLaunchEntry = Object.freeze({ kind: "theta" });

/**
 * The assembled launch a backend places. Every field is computed above the
 * seam by `prepareSubagentLaunch` (`subagent-launcher.ts`); a backend reads,
 * never re-derives.
 */
export interface SubagentPlacementRequest {
  /** The executable the ladder resolved (`resolveSubagentExecutable`). */
  readonly execPath: string;
  /** The full child argv after the executable (entry-script arg included). */
  readonly args: readonly string[];
  /** The child working directory (the per-call `with { cwd }` value or `ctx.cwd`). */
  readonly cwd: string;
  /**
   * The composed child environment (`buildSubagentChildEnv`). A backend that
   * cannot pass an environment (`inheritsEnv: false`) ignores it; the control
   * plane then travels on the launch file alone.
   */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** `"<slug>#<id>"`, or `"<slug>#<fn>#<id>"` for a fn entry (`<id>` = first eight hex chars of the invocation id) — tab titles / `--name`. */
  readonly label: string;
  /** The presentation the argv was assembled for (§6 / §7). */
  readonly presentation: SubagentPlacementPresentation;
  /**
   * The parent-private launch file path (§2) when one was written — every
   * non-`pipe` placement; `undefined` under `pipe`, whose control plane rides
   * the env. The backend passes it through untouched (it is already on argv).
   */
  readonly launchFile: string | undefined;
  /** Launch context a backend may use for grouping / titling; never semantics. */
  readonly context: {
    readonly invokeDepth: number;
    readonly parallel: boolean;
  };
}

/** What a backend can and cannot observe or promise about the child it placed. */
export interface PlacedChildCapabilities {
  /**
   * `true` when `onExit` fires on the real process exit (the child is in the
   * parent's process tree). `false` ⇒ the launcher synthesises settlement from
   * the result channel (envelope frame, socket close, heartbeat silence).
   */
  readonly observesExit: boolean;
  /**
   * `true` when the child receives `request.env`. `false` (a multiplexer that
   * spawns from its own server environment) ⇒ credentials must come from disk;
   * the launcher's credential guard (§6, D6) falls back to `pipe` when the
   * provider's credential is environment-sourced.
   */
  readonly inheritsEnv: boolean;
  /** `true` when a human can see and attach to the child (drives `presentation`). */
  readonly visible: boolean;
  /**
   * `true` asks the launcher to OMIT `--no-session` so the operator can
   * `/resume` the child's session afterwards. Theta semantics are unchanged —
   * the parent never reads the child's session.
   */
  readonly persistSession?: boolean;
}

/** The handle a backend returns for a placed child. */
export interface PlacedChild {
  /** Opaque: a pid, a pane id, a window id. Display and kill target only. */
  readonly handle: string;
  readonly capabilities: PlacedChildCapabilities;
  /**
   * Subscribe to the child's exit. A backend with `observesExit: false` MUST
   * still accept the call (as a no-op); the launcher never relies on it there.
   */
  onExit(listener: (info: ChildExitInfo) => void): void;
  /** Kill the child: `pane.close`, `kill-pane`, a process-tree kill. */
  kill(): void;
  /**
   * Present ONLY on the `pipe` backend: the parent-held process handle whose
   * stdout carries the envelope and whose stderr carries crash detail. A
   * non-`pipe` backend never sets it — its child's stdout is a TTY, and the
   * result channel (`subagent-result-channel.ts`) is the wire instead.
   */
  readonly process?: SubagentChildProcess;
}

/**
 * A placement backend. Built-ins (`pipe`, `exec`) are constructed in-process;
 * every other backend registers over `pi.events`
 * (`subagent-placement-registry.ts`).
 */
export interface SubagentPlacementBackend {
  /** `PLACEMENT_NAME_PATTERN`; the `RESERVED_PLACEMENT_NAMES` are refused on registration. */
  readonly name: string;
  /** `auto` selection order among DETECTED backends: higher first, ties by name. */
  readonly priority: number;
  /**
   * The capabilities the backend can state BEFORE placing a child — the two
   * the launcher must know ahead of `place()`: `visible` selects the argv
   * presentation (§6 *Presentation*, §7), and `inheritsEnv: false` engages
   * the credential guard (§6, D6). `observesExit` is a per-child fact the
   * returned `PlacedChild` states. Absent members default to the `pipe`
   * answers (`visible: false`, `inheritsEnv: true`).
   */
  readonly capabilities?: Readonly<Pick<PlacedChildCapabilities, "visible" | "inheritsEnv" | "persistSession">>;
  /** Cheap, synchronous, environment-marker based. MUST NOT spawn anything. */
  detect(): boolean;
  /** Put the assembled launch somewhere and return its handle. */
  place(request: SubagentPlacementRequest): PlacedChild | Promise<PlacedChild>;
}

/** Whether a backend places children a human can see (drives the visible argv form). */
export function placementIsVisible(backend: SubagentPlacementBackend): boolean {
  return backend.capabilities?.visible === true;
}

/** Whether a backend passes the composed environment through to the child (default `true`). */
export function placementInheritsEnv(backend: SubagentPlacementBackend): boolean {
  return backend.capabilities?.inheritsEnv !== false;
}

/**
 * The `pipe` backend: today's launch, verbatim. `place()` calls the injected
 * `SpawnFn` with exactly the arguments `launchSubagentChild` passed before the
 * seam existed and returns the process handle as the placed child; the result
 * rides stdout, the control plane rides the env, the child authenticates by
 * ppid. Always detected; the lowest possible priority so any registered
 * backend that detects wins `auto`.
 */
export function createPipePlacementBackend(spawn: SpawnFn): SubagentPlacementBackend {
  return {
    name: PIPE_PLACEMENT_NAME,
    priority: Number.NEGATIVE_INFINITY,
    capabilities: { visible: false, inheritsEnv: true },
    detect: (): boolean => true,
    place: (request: SubagentPlacementRequest): PlacedChild => {
      // The env is spread into a fresh mutable record because `SpawnFn`'s
      // option type is the mutable `Record` the production spawn adapter has
      // always taken; the request's frozen view is the seam's own.
      const child = spawn(request.execPath, request.args, {
        cwd: request.cwd,
        env: { ...request.env },
      });
      return {
        // A `SubagentChildProcess` carries no pid on its surface (the adapter
        // hides the Node child); the handle is display-only, so the label
        // stands in for it.
        handle: request.label,
        capabilities: { observesExit: true, inheritsEnv: true, visible: false },
        onExit: (listener): void => {
          child.onExit(listener);
        },
        kill: (): void => {
          child.kill();
        },
        process: child,
      };
    },
  };
}

/** Whether `backend` is the built-in `pipe` placement (the stdout-wire path). */
export function isPipePlacement(backend: SubagentPlacementBackend): boolean {
  return backend.name === PIPE_PLACEMENT_NAME;
}

/** The structural verdict `validatePlacementBackend` returns. */
export type PlacementBackendValidation =
  | { readonly ok: true; readonly backend: SubagentPlacementBackend }
  | { readonly ok: false; readonly name: string; readonly reason: string };

/**
 * Structurally validate an object offered as a placement backend (§5): the
 * name grammar and reservation, a finite `priority`, `detect` / `place`
 * functions. Nothing is invoked — `detect()` runs at selection time, never at
 * registration. A failing candidate is reported with the name it claimed (or
 * `<unnamed>`) so the `theta/load/subagent-placement-invalid` message can name
 * it.
 */
export function validatePlacementBackend(candidate: unknown): PlacementBackendValidation {
  if (typeof candidate !== "object" || candidate === null) {
    return { ok: false, name: "<unnamed>", reason: "backend is not an object" };
  }
  const record = candidate as Record<string, unknown>;
  const rawName = record["name"];
  const name = typeof rawName === "string" ? rawName : "<unnamed>";
  if (typeof rawName !== "string" || !PLACEMENT_NAME_PATTERN.test(rawName)) {
    return { ok: false, name, reason: "name must match ^[a-z][a-z0-9-]{0,31}$" };
  }
  if (RESERVED_PLACEMENT_NAMES.includes(rawName)) {
    return { ok: false, name, reason: `name '${rawName}' is reserved` };
  }
  const priority = record["priority"];
  if (typeof priority !== "number" || !Number.isFinite(priority)) {
    return { ok: false, name, reason: "priority must be a finite number" };
  }
  if (typeof record["detect"] !== "function") {
    return { ok: false, name, reason: "detect must be a function" };
  }
  if (typeof record["place"] !== "function") {
    return { ok: false, name, reason: "place must be a function" };
  }
  return { ok: true, backend: candidate as SubagentPlacementBackend };
}
