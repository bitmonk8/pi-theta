// V9h / V9h-T — the `session_shutdown` unknown-reason rule: the closed-set
// membership check against the pinned-constant snapshot's `literals` field, the
// fixed snapshot-then-`event.reason` read order under handler-entry `try`/`catch`
// discipline, and the four-arm routing that emits at most one of the two
// mutually-exclusive teardown-handler diagnostics before sub-step 1 runs.
//
// Spec: pi-integration-contract/unknown-reason-rule.md (PIC-45 closed-set
// membership check; PIC-46 constant-source pinning / single-site edit; PIC-47
// handler-internal `try`/`catch` discipline + `pinned-constant-unreadable`
// discriminators; PIC-48 anchor-stable contract surface).
//
// V9h-T (tests-task) declares this seam and stubs the behaviour-bearing
// `classifyShutdownReason` so the failing tests compile and red on their own
// primary assertions; the paired V9h implementation fills it in (and adds the
// `SessionShutdownEvent.reason` `type-union-snapshot` entry to
// `SDK_SURFACE_INVENTORY` per PIC-46).

import type { Diagnostic } from "../diagnostics/diagnostic";

/**
 * The Pi `session_shutdown` event as the unknown-reason rule reads it. `reason`
 * is read exactly once, inside the handler-entry `try`/`catch` (PIC-47), so a
 * throwing property-access getter is treated as an unknown reason rather than
 * escaping the handler.
 */
export interface SessionShutdownEventLike {
  readonly reason: unknown;
}

/**
 * The structural view of one pinned-constants block entry the snapshot lookup
 * scans (PIC-46). The matching entry is
 * `{ kind: "type-union-snapshot", path: "SessionShutdownEvent.reason",
 *    literals: [...] as const }`; the reads are defensive because a hostile
 * getter, frozen-but-mutated import, or wrong-shape entry may throw or carry a
 * structurally-invalid `literals` field (PIC-47).
 */
export interface PinnedConstantSnapshotSource {
  readonly kind: string;
  readonly path?: string;
  readonly literals?: unknown;
}

/**
 * The result of the two pre-sub-step-1 reads (PIC-45/PIC-47): the four-arm
 * routing collapses to the handler-scoped `capturedEventReason` /
 * `pinnedConstantReadOk` seams the *Predicate split* clause consumes, the
 * closed-set membership verdict, and at most one diagnostic to emit before
 * sub-step 1 (the two codes are mutually exclusive).
 */
export interface ShutdownReasonClassification {
  /**
   * The handler-scoped captured reason: a closed-set member when Pi delivered
   * one of the five literals, `String(event.reason)` on the unknown path (or
   * `"<unreadable>"` when that coercion itself throws), `"<unreadable>"` on the
   * throwing-access path, or `"<unreadable>"` (the untouched pre-init) on the
   * snapshot-failure path.
   */
  readonly capturedEventReason: string;
  /** `true` iff the snapshot lookup-and-`literals` read succeeded (PIC-47). */
  readonly pinnedConstantReadOk: boolean;
  /** `true` iff `event.reason` is a member of the snapshot's `literals` set. */
  readonly isClosedSetMember: boolean;
  /**
   * The single pre-sub-step-1 diagnostic to emit, or `undefined` on the clean
   * closed-set-member path. Either `loom/host/session-shutdown-reason-unknown`
   * (unknown / throwing-access `event.reason`) or
   * `loom/host/session-shutdown-pinned-constant-unreadable` (snapshot-read
   * failure) — never both (PIC-47 mutual exclusivity).
   */
  readonly diagnostic?: Diagnostic;
}

/**
 * Run the two pre-sub-step-1 reads in the fixed order — (1) snapshot
 * lookup-and-`literals` read, then (2) `event.reason` read — under the
 * handler-entry `try`/`catch` discipline, and return the four-arm
 * classification (PIC-45/PIC-46/PIC-47/PIC-48).
 *
 * `inventory` is the injected `SDK_SURFACE_INVENTORY` (or `undefined` for the
 * circular-init / live-binding-gap arm that MUST route to `"missing-entry"`
 * before the iteration primitive runs).
 *
 * V9h-T stub: returns the snapshot-failure shape with no diagnostic, so every
 * routing / discriminator / membership test reds on its own primary assertion
 * (the paired V9h fills in the reads, the composite-predicate lookup, the
 * membership check, and the two mutually-exclusive emissions).
 */
export function classifyShutdownReason(
  event: SessionShutdownEventLike,
  inventory: readonly PinnedConstantSnapshotSource[] | undefined,
): ShutdownReasonClassification {
  void event;
  void inventory;
  return {
    capturedEventReason: "<unreadable>",
    pinnedConstantReadOk: false,
    isClosedSetMember: false,
  };
}
