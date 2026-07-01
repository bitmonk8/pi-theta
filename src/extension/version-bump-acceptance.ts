// V18d / V18d-T — the Pi version-bump runtime-evidence acceptance gate and the
// revert / rollback verification (pi-integration-contract/version-bump-*.md).
//
// The version-bump procedure's output (c) is *green end-to-end runtime evidence
// at the new pin*: an integrated `.loom` exercised through the `H4a` end-to-end
// harness against the bumped Pi-SDK pin, driving all six surfaces (typed query,
// tool loop, invoke, schema validation, binder, cancellation). The
// build-time surface-inventory assertions of output (a) alone DO NOT satisfy
// this gate (`version-bump-triggers.md` output (c); the un-anchored
// runtime-evidence acceptance-gate MUST, coverage-matrix.md `cka-19`). A bump
// whose runtime-evidence run is red MUST NOT be merged at the candidate pin —
// the merge-blocking MUST this module's revert path binds.
//
// Both seams are PURE functions over injected operands so the paired failing
// tests can drive the conformant (green) and the drifted (red) direction by
// construction, and neither reads an ambient primitive or the live SDK / harness
// directly — the paired `V18d` implementation wires the live `H4a` harness run
// and the re-run `V18c` static gates into these seams.
//
// V18d-T (this tests-task) declares both seams and stubs each with an inert
// sentinel result — never the real composition — so the paired failing tests
// compile and red on their own primary assertions. The paired `V18d`
// implementation leaf fills the bodies in.

// --- runtime-evidence acceptance gate (output (c)) --------------------------

/**
 * The six integrated surfaces the runtime-evidence acceptance run MUST drive
 * through the `H4a` end-to-end harness against the bumped pin, per
 * `version-bump-triggers.md` output (c). The `.loom` the gate runs is selected
 * solely by this six-surface coverage requirement.
 */
export type AcceptanceSurface =
  | "typed-query"
  | "tool-loop"
  | "invoke"
  | "schema-validation"
  | "binder"
  | "cancellation";

/** The six-surface coverage requirement (output (c)). */
export const ACCEPTANCE_SURFACES: readonly AcceptanceSurface[] = Object.freeze([
  "typed-query",
  "tool-loop",
  "invoke",
  "schema-validation",
  "binder",
  "cancellation",
]);

/**
 * The outcome of the `H4a` end-to-end harness run against the bumped pin.
 * `harnessDriven` witnesses that the acceptance run went through the `H4a`
 * harness at all (a green surface-inventory run alone leaves this `false`);
 * `surfacesExercised` is the subset of `ACCEPTANCE_SURFACES` the run drove;
 * `allAssertionsPassed` is the run's aggregate assertion verdict.
 */
export interface HarnessRunOutcome {
  readonly harnessDriven: boolean;
  readonly surfacesExercised: ReadonlySet<AcceptanceSurface>;
  readonly allAssertionsPassed: boolean;
}

/** The build-time surface-inventory verdict (output (a)). */
export interface SurfaceInventoryOutcome {
  readonly green: boolean;
}

/**
 * Runtime-evidence acceptance gate (`version-bump-triggers.md` output (c);
 * `cka-19`): return a non-empty failure list unless acceptance is satisfied.
 * Acceptance requires the `H4a` end-to-end harness to have been driven against
 * the bumped pin with all six `ACCEPTANCE_SURFACES` exercised and every
 * assertion passing — a green surface-inventory run alone (output (a)) does NOT
 * satisfy this gate, so a `harnessDriven === false` outcome reddens even when
 * the surface inventory is green. A missing surface or a failed harness
 * assertion also reddens.
 *
 * V18d-T stub: performs no acceptance composition (returns no failures), so the
 * "surface-inventory green alone" and "surface missing" directions red on their
 * detection assertion because the gate is unwired. The paired `V18d` fills it
 * in.
 */
export function runtimeEvidenceAcceptanceFailures(
  harnessRun: HarnessRunOutcome,
  surfaceInventory: SurfaceInventoryOutcome,
): readonly string[] {
  // Reference the operands so the seam signature is load-bearing; the stub
  // deliberately performs no composition (see the doc comment above).
  void harnessRun;
  void surfaceInventory;
  return [];
}

// --- revert / rollback verification -----------------------------------------

/**
 * One re-run of a `V18c` static build-time gate against the restored prior pin.
 * `gate` names which static gate (its `V18c`-owned definition is not redefined
 * here; it is consumed as a double); `failures` is that gate's failure list on
 * the restored-prior-pin operands (empty when the gate reports green).
 */
export interface StaticGateReRun {
  readonly gate: string;
  readonly failures: readonly string[];
}

/**
 * The verdict of verifying the revert sequence.
 * `reverted` is `true` only when step 4's pin edit is restored AND every re-run
 * `V18c` static gate reports green (the complete-revert signal). `widenRequired`
 * names the re-run gates that stayed red — a co-edited operand (a
 * capability-probe constant, the `engines.node` literal, or the reason-snapshot
 * entry) left at its candidate value — so the revert MUST be widened to restore
 * that operand in the same commit (the incomplete-revert signal).
 */
export interface RevertVerification {
  readonly reverted: boolean;
  readonly widenRequired: readonly string[];
}

/**
 * Revert / rollback verification for the merge-blocking MUST of
 * `version-bump-triggers.md` (`cka-19`): a bump whose runtime-evidence run is
 * red MUST NOT be merged at the candidate pin. On a red runtime-evidence run
 * (`runtimeEvidenceRed === true`) the revert restores step 4's pin edit and
 * re-runs `V18c`'s static build-time gates against the restored prior pin. The
 * revert is observed complete only when every re-run gate reports green; a
 * co-edited operand left at its candidate value reddens at least one re-run gate
 * and the revert MUST be widened to restore that operand.
 *
 * V18d-T stub: performs no revert composition (returns the inert
 * `{ reverted: false, widenRequired: [] }` sentinel), so the complete-revert
 * direction reds on its `reverted === true` assertion and the incomplete-revert
 * direction reds on its non-empty `widenRequired` assertion — both because the
 * verification is unwired, not because any gate double is missing. The paired
 * `V18d` fills it in.
 */
export function verifyRevertSequence(
  runtimeEvidenceRed: boolean,
  staticGateReRuns: readonly StaticGateReRun[],
): RevertVerification {
  // Reference the operands so the seam signature is load-bearing; the stub
  // deliberately performs no composition (see the doc comment above).
  void runtimeEvidenceRed;
  void staticGateReRuns;
  return { reverted: false, widenRequired: [] };
}
