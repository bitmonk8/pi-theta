import { describe, expect, it } from "vitest";
import { loadExtension } from "./harness/index";
import type { LoomFixture } from "../src/extension/factory";
import {
  ACCEPTANCE_SURFACES,
  type AcceptanceSurface,
  type StaticGateReRun,
  runtimeEvidenceAcceptanceFailures,
  verifyRevertSequence,
} from "../src/extension/version-bump-acceptance";
import {
  SESSION_SHUTDOWN_REASON_SNAPSHOT,
  enginesNodeEqualityFailures,
  peerDependencyPinFailures,
  reasonSnapshotConsistencyFailures,
} from "../src/extension/version-bump-gates";

// V18d-T — failing tests for the paired V18d Pi version-bump runtime-evidence
// acceptance gate and revert path.
//
// Spec: pi-integration-contract/version-bump-intro.md, version-bump-triggers.md,
// host-prerequisites.md.
//
// V18d closes the code-keyed obligation area `cka-19` (coverage-matrix.md): the
// `version-bump-triggers.md` runtime-evidence acceptance-gate MUST (output (c))
// and the merge-blocking MUST that a bump whose runtime-evidence run is red MUST
// NOT be merged at the candidate pin. `cka-19` is cited inline in each test.
//
// Both seams under test are stubbed inert by V18d-T, so each test reds on its own
// primary assertion because the composition is UNWIRED — not because any H4a
// harness double or V18c static-gate double is missing (those doubles are real:
// the H4a harness loads here and the V18c gate functions produce real results).
// The paired V18d implementation fills the seam bodies in and turns these green.

// --- restored-prior-pin operands (the loom 1.0 Pi-SDK pin, per V18c-T) -------

const PRIOR_ENGINES_FLOOR = ">=22.19.0";
const PRIOR_PEER_DEP_PIN = "~0.75.5";
const PRIOR_REASON_UNION: readonly string[] = [
  "quit",
  "reload",
  "new",
  "resume",
  "fork",
];

/** A conformant `peerDependencies` block pinned to the prior pin. */
function priorPeerDependencies(): Readonly<Record<string, string>> {
  return {
    "@earendil-works/pi-coding-agent": PRIOR_PEER_DEP_PIN,
    "@earendil-works/pi-agent-core": PRIOR_PEER_DEP_PIN,
    "@earendil-works/pi-ai": PRIOR_PEER_DEP_PIN,
    "@earendil-works/pi-tui": PRIOR_PEER_DEP_PIN,
    typebox: "*",
  };
}

/**
 * Re-run the `V18c` static build-time gates (consumed as doubles — their
 * definitions stay owned by `V18c` / `V18c-T`) against the supplied operands,
 * shaped as the `StaticGateReRun` list `verifyRevertSequence` consumes.
 */
function reRunV18cStaticGates(operands: {
  readonly loomEnginesLiteral: string;
  readonly inventoryEnginesPinned: string;
  readonly liveUpstreamEngines: string;
  readonly peerDependencies: Readonly<Record<string, string>>;
  readonly peerDepPin: string;
  readonly snapshotLiterals: readonly string[];
  readonly sdkReasonUnion: readonly string[];
}): readonly StaticGateReRun[] {
  return [
    {
      gate: "engines.node three-way equality",
      failures: enginesNodeEqualityFailures(
        operands.loomEnginesLiteral,
        operands.inventoryEnginesPinned,
        operands.liveUpstreamEngines,
      ),
    },
    {
      gate: "peerDependencies literal-read",
      failures: peerDependencyPinFailures(
        operands.peerDependencies,
        operands.peerDepPin,
      ),
    },
    {
      gate: "session-shutdown reason-snapshot consistency",
      failures: reasonSnapshotConsistencyFailures(
        operands.snapshotLiterals,
        operands.sdkReasonUnion,
      ),
    },
  ];
}

// --- runtime-evidence acceptance gate (output (c)) --------------------------

describe("V18d runtime-evidence acceptance gate (cka-19, output (c))", () => {
  it("cka-19: the H4a end-to-end harness is the driver of the acceptance run", async () => {
    // The gate is composed on top of the H4a harness double — it is driven
    // against a feature-free harness, not an integrated `.loom`. Loading and
    // dispatching a no-op through the harness witnesses that the harness the
    // acceptance run consumes is present and driveable at the bumped pin.
    let ran = false;
    const noop: LoomFixture = {
      slashName: "accept-noop",
      run: async () => {
        ran = true;
      },
    };
    const loaded = loadExtension({ fixtures: [noop] });
    expect(loaded.double.commands.has("accept-noop")).toBe(true);
    await loaded.dispatch("accept-noop", "");
    expect(ran).toBe(true);
  });

  it("cka-19: a full H4a harness run driving all six surfaces with passing assertions satisfies acceptance", () => {
    const fullGreenRun = {
      harnessDriven: true,
      surfacesExercised: new Set<AcceptanceSurface>(ACCEPTANCE_SURFACES),
      allAssertionsPassed: true,
    };
    expect(
      runtimeEvidenceAcceptanceFailures(fullGreenRun, { green: true }),
    ).toEqual([]);
  });

  it("cka-19: a green surface-inventory run alone does NOT satisfy acceptance", () => {
    // Output (a) green, but the H4a harness runtime-evidence run (output (c))
    // was never driven — acceptance MUST still red, because the build-time
    // surface-inventory assertions alone do not exercise the loom against the
    // bumped SDK at runtime (version-bump-triggers.md output (c)).
    const inventoryGreenNoHarnessRun = {
      harnessDriven: false,
      surfacesExercised: new Set<AcceptanceSurface>(),
      allAssertionsPassed: false,
    };
    expect(
      runtimeEvidenceAcceptanceFailures(inventoryGreenNoHarnessRun, {
        green: true,
      }).length,
    ).toBeGreaterThan(0);
  });

  it("cka-19: a harness run missing one of the six surfaces does NOT satisfy acceptance", () => {
    // The `.loom` is selected solely by the six-surface coverage requirement;
    // dropping `cancellation` leaves acceptance unsatisfied even with green
    // assertions and a green surface inventory.
    const missingSurface = {
      harnessDriven: true,
      surfacesExercised: new Set<AcceptanceSurface>(
        ACCEPTANCE_SURFACES.filter((s) => s !== "cancellation"),
      ),
      allAssertionsPassed: true,
    };
    expect(
      runtimeEvidenceAcceptanceFailures(missingSurface, { green: true }).length,
    ).toBeGreaterThan(0);
  });
});

// --- revert / rollback verification -----------------------------------------

describe("V18d revert / rollback verification (cka-19, merge-blocking MUST)", () => {
  it("cka-19: pinned reason snapshot equals the loom 1.0 SDK reason union (prior-pin operand)", () => {
    // Anchors the restored-prior-pin snapshot operand the revert re-runs against.
    expect(SESSION_SHUTDOWN_REASON_SNAPSHOT.literals).toEqual(PRIOR_REASON_UNION);
  });

  it("cka-19: complete revert — every re-run V18c static gate green ⇒ the revert is observed complete", () => {
    // Every operand restored to the prior pin ⇒ all re-run V18c gates green.
    const reRuns = reRunV18cStaticGates({
      loomEnginesLiteral: PRIOR_ENGINES_FLOOR,
      inventoryEnginesPinned: PRIOR_ENGINES_FLOOR,
      liveUpstreamEngines: PRIOR_ENGINES_FLOOR,
      peerDependencies: priorPeerDependencies(),
      peerDepPin: PRIOR_PEER_DEP_PIN,
      snapshotLiterals: PRIOR_REASON_UNION,
      sdkReasonUnion: PRIOR_REASON_UNION,
    });
    // Sanity: the V18c gate doubles all report green on the restored prior pin.
    expect(reRuns.every((r) => r.failures.length === 0)).toBe(true);

    // On a red runtime-evidence run, restoring step 4's pin edit and re-running
    // the green V18c gates ⇒ the revert is complete.
    const verdict = verifyRevertSequence(true, reRuns);
    expect(verdict.reverted).toBe(true);
    expect(verdict.widenRequired).toEqual([]);
  });

  it("cka-19: incomplete revert — a co-edited operand left at its candidate value reddens a re-run gate ⇒ the revert MUST be widened", () => {
    // The `engines.node` literal is left at the candidate floor while the rest
    // is restored — a co-edited operand not swept by the revert. The re-run
    // engines.node gate reddens, so the revert is incomplete and MUST be widened.
    const CANDIDATE_ENGINES_FLOOR = ">=24.0.0";
    const reRuns = reRunV18cStaticGates({
      loomEnginesLiteral: CANDIDATE_ENGINES_FLOOR,
      inventoryEnginesPinned: PRIOR_ENGINES_FLOOR,
      liveUpstreamEngines: PRIOR_ENGINES_FLOOR,
      peerDependencies: priorPeerDependencies(),
      peerDepPin: PRIOR_PEER_DEP_PIN,
      snapshotLiterals: PRIOR_REASON_UNION,
      sdkReasonUnion: PRIOR_REASON_UNION,
    });
    // Sanity: at least one V18c gate double stayed red on the candidate-left operand.
    expect(reRuns.some((r) => r.failures.length > 0)).toBe(true);

    const verdict = verifyRevertSequence(true, reRuns);
    expect(verdict.reverted).toBe(false);
    expect(verdict.widenRequired.length).toBeGreaterThan(0);
  });
});
