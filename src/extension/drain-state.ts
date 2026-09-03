// V9m / V9m-T — `ThetaRegistry` drain-state contract: the closed two-arm
// slash-dispatch routing, the `session_shutdown` handler-entry short-circuit
// predicate, the read-failure fail-safe at both `readDrainState` call sites,
// and the superseded-entry dispatch sub-case of arm (a).
//
// Spec: pi-integration-contract/drain-state-contract.md (PIC-29/30/31/32),
// pi-integration-contract/registration-steps.md (#superseded-entry-dispatch).
//
// V9m-T (tests-task) declares these seams and stubs the behaviour-bearing
// functions so the failing tests compile and red on their own primary
// assertions; the paired V9m implementation fills them in.

import type {
  DrainStateSnapshot,
  ThetaRegistry,
  ParsedTheta,
} from "./reload-wiring";

/**
 * The closed two-arm drain-state dispatch enumeration (PIC-29): (a) dispatch,
 * (b) the shutting-down note. PIC-30 forbids a third arm.
 */
export type DispatchArm = "dispatch" | "shutting-down";

// --- fixed system-note templates (verbatim, sourced from the spec prose) ---

/** Arm-(b) system note (drain-state-contract.md *Methods* arm (b)). */
export function shuttingDownNote(name: string): string {
  return `theta /${name}: extension shutting down`;
}

/**
 * The fixed superseded-entry system note
 * (registration-steps.md#superseded-entry-dispatch).
 */
export function supersededNote(name: string): string {
  return `theta /${name}: superseded; /reload to refresh`;
}

/**
 * Map a `(drained, tag)` snapshot onto the closed two-arm enumeration
 * (PIC-29). The four tuples map: `(false, undefined)` → (a) `"dispatch"`;
 * `(false|true, "shutting-down")` and `(true, undefined)` → (b)
 * `"shutting-down"`. The arms are mutually exclusive and exhaust the tuple
 * state space; no third arm (PIC-30).
 *
 * The mapping keys on the tuple per PIC-29's closed two-arm map: arm (b)
 * `"shutting-down"` fires on the tag `"shutting-down"` or on
 * `(true, undefined)`; arm (a) `"dispatch"` is the steady-state residue
 * `(false, undefined)`. There is no third arm (PIC-30).
 */
export function routeDrainStateArm(snapshot: DrainStateSnapshot): DispatchArm {
  if (snapshot.tag === "shutting-down" || snapshot.drained) {
    return "shutting-down";
  }
  return "dispatch";
}

/**
 * The `session_shutdown` handler-entry short-circuit predicate (PIC-29): the
 * disjunction `snapshot.drained === true || snapshot.tag !== undefined`, read
 * once at handler entry. Idempotent and uniform across drain-state tags; fires
 * on every tuple except the steady-state `(false, undefined)`. The runtime
 * introduces no third boolean drain-state field and no arm-specific gate
 * (PIC-30).
 *
 */
export function shouldShortCircuitShutdown(snapshot: DrainStateSnapshot): boolean {
  return snapshot.drained === true || snapshot.tag !== undefined;
}

/**
 * The `session_shutdown` handler-entry `readDrainState` read with its per-call
 * `try`/`catch` fail-safe (PIC-31): on a successful read the short-circuit
 * predicate {@link shouldShortCircuitShutdown} is evaluated; on a read-side
 * throw the catch arm treats the read as the steady-state tuple
 * `(false, undefined)` — equivalently, as if the predicate had NOT fired — so
 * the handler proceeds into the full five-sub-step teardown rather than
 * stranding resources.
 *
 */
export function evalShutdownShortCircuitWithReadFailover(
  read: () => DrainStateSnapshot,
): boolean {
  // PIC-31 read-failure fail-safe: on a read-side throw treat the read as the
  // steady-state tuple `(false, undefined)` — equivalently, as if the predicate
  // had NOT fired — so the handler proceeds into the full five-sub-step teardown
  // rather than short-circuiting and stranding every resource it must release.
  // The read may throw an arbitrary shape, so the catch is broad.
  let snapshot: DrainStateSnapshot;
  try {
    snapshot = read();
  } catch (readError: unknown) { // allow-broad-catch: PIC-31 — pi-integration-contract/drain-state-contract.md
    void readError;
    return false;
  }
  return shouldShortCircuitShutdown(snapshot);
}

/** The outcome of a slash dispatch: dispatch the theta, or return a system note. */
export type SlashDispatchOutcome =
  | { readonly kind: "dispatch"; readonly theta: ParsedTheta }
  | { readonly kind: "note"; readonly content: string };

/**
 * Resolve a `/<name>` dispatch through the drain-state contract: route the
 * snapshot through the two-arm enumeration, then — on arm (a) — look the slash
 * name up in the registry entry table. A hit dispatches the theta; a miss returns
 * the fixed superseded note (registration-steps.md#superseded-entry-dispatch), a
 * sub-case of arm (a) that introduces no third `readDrainState` arm.
 *
 */
export function resolveSlashDispatch(
  name: string,
  snapshot: DrainStateSnapshot,
  registry: ThetaRegistry,
): SlashDispatchOutcome {
  const arm = routeDrainStateArm(snapshot);
  if (arm === "shutting-down") {
    return { kind: "note", content: shuttingDownNote(name) };
  }
  // Arm (a) dispatch: look the slash name up in the registry entry table. A hit
  // dispatches the theta; a miss (a dropped, superseded entry) returns the fixed
  // superseded note — a sub-case of arm (a), not a third arm (PIC-30).
  const theta = registry.get(name);
  if (theta === undefined) {
    return { kind: "note", content: supersededNote(name) };
  }
  return { kind: "dispatch", theta };
}

/**
 * The slash-command call-site consumer: read `readDrainState` under the PIC-31
 * per-call `try`/`catch`, then resolve the outcome through `resolveSlashDispatch`.
 * On a read-side throw the conservative fail-safe is arm (b): return the
 * shutting-down system note rather than dispatch the theta (PIC-31 slash-command
 * clause — distinct from `session_shutdown` step (I), which treats a throw as the
 * steady-state tuple). The read may throw an arbitrary shape, so the catch is
 * broad.
 */
export function resolveSlashDispatchWithReadFailover(
  name: string,
  read: () => DrainStateSnapshot,
  registry: ThetaRegistry,
): SlashDispatchOutcome {
  let snapshot: DrainStateSnapshot;
  try {
    snapshot = read();
  } catch (readError: unknown) { // allow-broad-catch: PIC-31 — pi-integration-contract/drain-state-contract.md
    void readError;
    return { kind: "note", content: shuttingDownNote(name) };
  }
  return resolveSlashDispatch(name, snapshot, registry);
}
