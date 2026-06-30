// V9m / V9m-T — `LoomRegistry` drain-state contract: the closed three-arm
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
  LoomRegistry,
  ParsedLoom,
} from "./reload-wiring";

/**
 * The closed three-arm drain-state dispatch enumeration (PIC-29): (a) dispatch,
 * (b) the shutting-down note, (c) the degraded-needs-reload note. PIC-30 forbids
 * a fourth arm.
 */
export type DispatchArm = "dispatch" | "shutting-down" | "degraded-needs-reload";

// --- fixed system-note templates (verbatim, sourced from the spec prose) ---

/** Arm-(b) system note (drain-state-contract.md *Methods* arm (b)). */
export function shuttingDownNote(name: string): string {
  return `loom /${name}: extension shutting down`;
}

/**
 * Arm-(c) system note (drain-state-contract.md *Methods* arm (c); also the
 * PIC-31 slash-site read-failure fail-safe note).
 */
export function degradedNote(name: string): string {
  return `loom /${name}: extension degraded; /reload to recover`;
}

/**
 * The fixed superseded-entry system note
 * (registration-steps.md#superseded-entry-dispatch).
 */
export function supersededNote(name: string): string {
  return `loom /${name}: superseded; /reload to refresh`;
}

/**
 * Map a `(drained, tag)` snapshot onto the closed three-arm enumeration
 * (PIC-29). The six tuples map: `(false, undefined)` → (a) `"dispatch"`;
 * `(false|true, "shutting-down")` and `(true, undefined)` → (b)
 * `"shutting-down"`; `(false|true, "degraded-needs-reload")` → (c)
 * `"degraded-needs-reload"`. The arms are mutually exclusive and exhaust the
 * tuple state space; no fourth arm (PIC-30).
 *
 * The mapping keys on the tuple per PIC-29's closed three-arm map: arm (c)
 * `"degraded-needs-reload"` fires whenever the tag is `"degraded-needs-reload"`
 * (regardless of `drained`); arm (b) `"shutting-down"` fires on the tag
 * `"shutting-down"` or on `(true, undefined)`; arm (a) `"dispatch"` is the
 * steady-state residue `(false, undefined)`. There is no fourth arm (PIC-30).
 */
export function routeDrainStateArm(snapshot: DrainStateSnapshot): DispatchArm {
  if (snapshot.tag === "degraded-needs-reload") {
    return "degraded-needs-reload";
  }
  if (snapshot.tag === "shutting-down" || snapshot.drained) {
    return "shutting-down";
  }
  return "dispatch";
}

/**
 * The `session_shutdown` handler-entry short-circuit predicate (PIC-29): the
 * disjunction `snapshot.drained === true || snapshot.tag !== undefined`, read
 * once at handler entry. Idempotent and uniform across the two tag arms; fires
 * on every tuple except the steady-state `(false, undefined)`. The runtime
 * introduces no third boolean drain-state field and no arm-specific gate
 * (PIC-30).
 *
 */
export function shouldShortCircuitShutdown(snapshot: DrainStateSnapshot): boolean {
  return snapshot.drained === true || snapshot.tag !== undefined;
}

/**
 * The slash-command-site `readDrainState` read with its per-call `try`/`catch`
 * fail-safe (PIC-31): on a successful read the snapshot routes through
 * {@link routeDrainStateArm}; on a read-side throw the catch arm routes to arm
 * (c) (`"degraded-needs-reload"`) — the conservative operator action (`/reload`)
 * is correct on every non-dispatch arm.
 *
 */
export function routeSlashDispatchWithReadFailover(
  read: () => DrainStateSnapshot,
): DispatchArm {
  // PIC-31 read-failure fail-safe: the read may throw an arbitrary shape (a
  // frozen-but-mutated import, a Proxy getter trap, OOM during snapshot
  // construction, or any other read-side throw), so the catch is broad and
  // routes to arm (c) — the `/reload` operator action is correct on every
  // non-dispatch arm, the only safe choice when the arm cannot be determined.
  let snapshot: DrainStateSnapshot;
  try {
    snapshot = read();
  } catch (readError: unknown) { // allow-broad-catch: PIC-31 — pi-integration-contract/drain-state-contract.md
    void readError;
    return "degraded-needs-reload";
  }
  return routeDrainStateArm(snapshot);
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

/** The outcome of a slash dispatch: dispatch the loom, or return a system note. */
export type SlashDispatchOutcome =
  | { readonly kind: "dispatch"; readonly loom: ParsedLoom }
  | { readonly kind: "note"; readonly content: string };

/**
 * Resolve a `/<name>` dispatch through the drain-state contract: route the
 * snapshot through the three-arm enumeration, then — on arm (a) — look the slash
 * name up in the registry entry table. A hit dispatches the loom; a miss returns
 * the fixed superseded note (registration-steps.md#superseded-entry-dispatch), a
 * sub-case of arm (a) that introduces no fourth `readDrainState` arm.
 *
 */
export function resolveSlashDispatch(
  name: string,
  snapshot: DrainStateSnapshot,
  registry: LoomRegistry,
): SlashDispatchOutcome {
  const arm = routeDrainStateArm(snapshot);
  if (arm === "shutting-down") {
    return { kind: "note", content: shuttingDownNote(name) };
  }
  if (arm === "degraded-needs-reload") {
    return { kind: "note", content: degradedNote(name) };
  }
  // Arm (a) dispatch: look the slash name up in the registry entry table. A hit
  // dispatches the loom; a miss (a dropped, superseded entry) returns the fixed
  // superseded note — a sub-case of arm (a), not a fourth arm (PIC-30).
  const loom = registry.get(name);
  if (loom === undefined) {
    return { kind: "note", content: supersededNote(name) };
  }
  return { kind: "dispatch", loom };
}
