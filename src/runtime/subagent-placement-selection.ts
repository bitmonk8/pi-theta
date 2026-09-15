// RFC-0012 §6 — selection and policy: which backend places a launch.
//
// One operator selector — `theta.subagentPlacement` in `settings.json`
// (either scope), overridden for one run by `PI_THETA_SUBAGENT_PLACEMENT` in
// the parent's environment — names `auto` (the default), `pipe`, `exec`, or a
// registered backend. The selector is an operator knob, deliberately NOT a
// control-plane variable: the launching parent reads it, no child
// authenticates it, and it is inherited so nested launches follow the
// operator's choice.
//
//   - `auto`: the highest-`priority` registered backend whose `detect()` is
//     true (ties by name); else `exec` when a template is configured and its
//     `when` holds; else `pipe`. `auto` never refuses.
//   - An explicit choice that is not selectable — not a registered name, a
//     registered backend whose `detect()` is false, or `exec` with no global
//     template — refuses FAIL-CLOSED: every `mode: subagent` theta and every
//     theta declaring a `subagent fn` refuses to register with
//     `theta/load/subagent-placement-unavailable` (E). No silent degradation
//     to `pipe` — a silently headless child looks like it worked (RFC 0007).
//     An explicit `exec` ignores `when` (§4).
//
// Two per-launch policies sit on top of selection (`createPlacementPolicy`):
// the VISIBLE CAP (`theta.subagentPlacementMaxVisible`, default 8 — while that
// many visible children are live, further launches use `pipe`), and the
// CREDENTIAL GUARD (D6 — a backend that does not pass the environment through
// cannot carry an environment-sourced provider credential, so that child runs
// under `pipe` and one `theta-system-note` says why).

import type { Diagnostic } from "../diagnostics/diagnostic";
import type { ThetaBody } from "../parser/theta-document";
import {
  AUTO_PLACEMENT_NAME,
  EXEC_PLACEMENT_NAME,
  PIPE_PLACEMENT_NAME,
  PLACEMENT_NAME_PATTERN,
  placementInheritsEnv,
  placementIsVisible,
  type PlacedChild,
  type SubagentPlacementBackend,
} from "./subagent-placement";

/** The one-run override of `theta.subagentPlacement` (inherited, unauthenticated, not control plane). */
export const SUBAGENT_PLACEMENT_ENV = "PI_THETA_SUBAGENT_PLACEMENT";
/** `theta.subagentPlacementMaxVisible` default. */
export const DEFAULT_SUBAGENT_PLACEMENT_MAX_VISIBLE = 8;
/** `theta/load/subagent-placement-unavailable` (E). */
export const SUBAGENT_PLACEMENT_UNAVAILABLE_CODE = "theta/load/subagent-placement-unavailable";

/**
 * The effective selector: the environment override when set and non-empty,
 * else the settings value, else `auto`.
 */
export function resolvePlacementSelector(
  settingsValue: string | undefined,
  envValue: string | undefined,
): string {
  const env = envValue?.trim();
  if (env !== undefined && env.length > 0) {
    return env;
  }
  return settingsValue ?? AUTO_PLACEMENT_NAME;
}

/** The inputs one selection reads. */
export interface PlacementSelectionInput {
  readonly selector: string;
  /** The registered backends (validated; `detect()` not yet run). */
  readonly registered: readonly SubagentPlacementBackend[];
  /** The `exec` backend when a global template is configured. */
  readonly exec: SubagentPlacementBackend | undefined;
  readonly pipe: SubagentPlacementBackend;
}

/** The selection verdict; the `ok: false` arm is the unavailable-placement refusal. */
export type PlacementSelection =
  | { readonly ok: true; readonly backend: SubagentPlacementBackend }
  | { readonly ok: false; readonly name: string; readonly reason: string };

/** `auto` order: higher `priority` first, ties broken by name. */
export function orderForAuto(
  registered: readonly SubagentPlacementBackend[],
): SubagentPlacementBackend[] {
  return [...registered].sort((a, b) => {
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
}

/**
 * A backend's `detect()`, defended: a third-party backend that throws counts
 * as not detected (and the throw's message is the explicit-selection reason).
 */
function detects(backend: SubagentPlacementBackend): { readonly detected: boolean; readonly error?: string } {
  try {
    return { detected: backend.detect() === true };
  } catch (detectError: unknown) { // allow-broad-catch: RFC-0012 §6 — a registered backend's detect() throw is "not detected", pi-integration-contract/subagent.md
    return {
      detected: false,
      error: detectError instanceof Error ? detectError.message : String(detectError),
    };
  }
}

/** Select the backend for the selector (§6). Pure; runs `detect()` only. */
export function selectPlacement(input: PlacementSelectionInput): PlacementSelection {
  const { selector } = input;
  if (selector === AUTO_PLACEMENT_NAME) {
    for (const backend of orderForAuto(input.registered)) {
      if (detects(backend).detected) {
        return { ok: true, backend };
      }
    }
    if (input.exec !== undefined && detects(input.exec).detected) {
      return { ok: true, backend: input.exec };
    }
    return { ok: true, backend: input.pipe };
  }
  if (selector === PIPE_PLACEMENT_NAME) {
    return { ok: true, backend: input.pipe };
  }
  if (selector === EXEC_PLACEMENT_NAME) {
    // Explicit `exec` ignores `when` (§4): the operator asked for the template.
    if (input.exec === undefined) {
      return {
        ok: false,
        name: selector,
        reason: "no `theta.subagentPlacementExec` template in the global settings file",
      };
    }
    return { ok: true, backend: input.exec };
  }
  if (!PLACEMENT_NAME_PATTERN.test(selector)) {
    return { ok: false, name: selector, reason: "not a valid placement name" };
  }
  const named = input.registered.find((backend) => backend.name === selector);
  if (named === undefined) {
    return { ok: false, name: selector, reason: "no registered backend has this name" };
  }
  const verdict = detects(named);
  if (!verdict.detected) {
    return {
      ok: false,
      name: selector,
      reason:
        verdict.error !== undefined
          ? `the backend's detect() threw: ${verdict.error}`
          : "the backend is not detected in this environment",
    };
  }
  return { ok: true, backend: named };
}

/** Render the `theta/load/subagent-placement-unavailable` row (registry Message, DIAG-4). */
export function placementUnavailableDiagnostic(
  selection: Extract<PlacementSelection, { ok: false }>,
  file: string,
): Diagnostic {
  return {
    severity: "error",
    code: SUBAGENT_PLACEMENT_UNAVAILABLE_CODE,
    file,
    message: `subagent placement '${selection.name}' is unavailable: ${selection.reason}`,
    hint:
      "Set `theta.subagentPlacement` to `auto`, `pipe`, or a backend that is loaded and detected; for `exec`, add the template to the global settings file.",
  };
}

/**
 * Whether a theta's registration is gated on placement availability (§6): a
 * `mode: subagent` theta (launched as a child) or one declaring a top-level
 * `subagent fn` (each call launches a child, §10). Prompt-mode thetas that
 * merely call `.theta` callables or `invoke(...)` are not gated here — their
 * callee refuses in its own right, and a runtime launch under an unavailable
 * placement is a spawn failure naming the reason.
 */
export function thetaLaunchesChildren(theta: {
  readonly frontmatter: { readonly mode?: string };
  readonly body: ThetaBody;
}): boolean {
  if (theta.frontmatter.mode === "subagent") {
    return true;
  }
  return theta.body.statements.some(
    (stmt) => stmt.kind === "fn" && (stmt as { readonly subagent?: boolean }).subagent === true,
  );
}

/**
 * A backend standing in for an unavailable explicit selection at LAUNCH time
 * (the load-time refusal covers registration; a launch that still happens —
 * an `invoke(...)` of a callee parsed at runtime — fails at `place()` with the
 * same reason, mapped to `theta/runtime/subagent-spawn-failed`). Never a
 * silent `pipe`.
 */
export function createUnavailablePlacementBackend(
  selection: Extract<PlacementSelection, { ok: false }>,
): SubagentPlacementBackend {
  return {
    name: selection.name,
    priority: Number.NEGATIVE_INFINITY,
    detect: (): boolean => false,
    place: (): PlacedChild => {
      throw new Error(`subagent placement '${selection.name}' is unavailable: ${selection.reason}`);
    },
  };
}

// ---------------------------------------------------------------------------
// Per-launch policy: visible cap + credential guard.
// ---------------------------------------------------------------------------

/** What the producer holds for one launch: the backend and the slot release. */
export interface PlacementLease {
  readonly backend: SubagentPlacementBackend;
  /** Release the visible slot this launch held (idempotent; a no-op for a `pipe` launch). */
  release(): void;
}

/** The narrow `AuthStatus` view the credential guard reads (`ctx.modelRegistry.getProviderAuthStatus`). */
export interface ProviderAuthStatusLike {
  readonly source?: string;
}

/** Collaborators the policy consumes. */
export interface PlacementPolicyDeps {
  /** Run selection now (registered set and `detect()` are re-read per launch). */
  readonly select: () => PlacementSelection;
  readonly pipe: SubagentPlacementBackend;
  readonly maxVisible: number;
  /**
   * `ctx.modelRegistry.getProviderAuthStatus(provider)` when the host exposes
   * it; `undefined` (member absent, or a `source`-less `AuthStatus`) leaves the
   * guard inert — the documented caveat, no note.
   */
  readonly providerAuthStatus?: (provider: string) => ProviderAuthStatusLike | undefined;
  /** Deliver one `theta-system-note` (the credential-guard template). */
  readonly emitSystemNote: (content: string) => void;
}

/** The system-note template the credential guard emits (runtime-event-channel.md). */
export function credentialGuardNote(name: string, provider: string, callee: string): string {
  return `theta: placement '${name}' does not carry environment credentials for ${provider}; running ${callee} headless`;
}

/**
 * Build the per-launch resolver: selection, then the visible cap, then the
 * credential guard. The guard's note is emitted once per (backend, provider)
 * per policy instance — a fan-out of many children under one backend says it
 * once, not once per child.
 */
export function createPlacementPolicy(
  deps: PlacementPolicyDeps,
): (context: { readonly provider: string; readonly callee: string }) => PlacementLease {
  let liveVisible = 0;
  const noted = new Set<string>();
  const noSlot: PlacementLease["release"] = (): void => {};
  return ({ provider, callee }): PlacementLease => {
    const selection = deps.select();
    if (!selection.ok) {
      return { backend: createUnavailablePlacementBackend(selection), release: noSlot };
    }
    const backend = selection.backend;
    if (!placementIsVisible(backend) && placementInheritsEnv(backend)) {
      return { backend, release: noSlot };
    }
    // Visible cap (§6): the N+1th concurrent visible launch is headless.
    if (placementIsVisible(backend) && liveVisible >= deps.maxVisible) {
      return { backend: deps.pipe, release: noSlot };
    }
    // Credential guard (D6): an environment-sourced credential never reaches a
    // child the backend spawns from another environment.
    if (!placementInheritsEnv(backend)) {
      const source = readAuthSource(deps.providerAuthStatus, provider);
      if (source === "environment") {
        const key = `${backend.name}\u0000${provider}`;
        if (!noted.has(key)) {
          noted.add(key);
          deps.emitSystemNote(credentialGuardNote(backend.name, provider, callee));
        }
        return { backend: deps.pipe, release: noSlot };
      }
    }
    if (!placementIsVisible(backend)) {
      return { backend, release: noSlot };
    }
    liveVisible += 1;
    let released = false;
    return {
      backend,
      release: (): void => {
        if (released) {
          return;
        }
        released = true;
        liveVisible -= 1;
      },
    };
  };
}

function readAuthSource(
  read: ((provider: string) => ProviderAuthStatusLike | undefined) | undefined,
  provider: string,
): string | undefined {
  if (read === undefined) {
    return undefined;
  }
  try {
    return read(provider)?.source;
  } catch (readError: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
    void readError;
    return undefined;
  }
}
