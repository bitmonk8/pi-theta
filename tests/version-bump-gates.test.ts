import { describe, expect, it } from "vitest";
import { SDK_SURFACE_INVENTORY } from "../src/extension/sdk-inventory";
import {
  PROVIDER_SEED_FIELD_TABLE,
  SESSION_SHUTDOWN_REASON_SNAPSHOT,
  apiCoverageFailures,
  capabilityCountCoEditFailures,
  enginesNodeEqualityFailures,
  peerDependencyPinFailures,
  reasonSnapshotConsistencyFailures,
  seedFieldFixtureFailures,
  strictCapabilityProbeFailures,
  surfaceInventoryPresenceFailures,
} from "../src/extension/version-bump-gates";

// V18c-T — failing tests for the paired V18c Pi version-bump static gates.
//
// Spec: pi-integration-contract/version-bump-intro.md, version-bump-step2.md,
// version-bump-step2b.md, version-bump-steps-3-4.md, version-bump-triggers.md,
// provider-error-mapping.md, host-prerequisites.md (#pic-34).
//
// Each gate is a pure function over injected operands, so every test drives BOTH
// the conformant (green-direction) and the drifted (red-direction) fixture. The
// V18c-T stubs return an inert sentinel result in every case, so BOTH directions
// red on their own primary assertion because the reconciliation is absent — the
// paired V18c fills each gate body in and turns these green.
//
// The one numbered REQ-ID V18c closes (per coverage-matrix.md) is PIC-34, cited
// inline in the peerDependencies test. The remaining gates realise named
// version-bump procedure steps (2(a)/2(b)/3/6/7) rather than numbered REQ-IDs;
// each test names its step inline.

/** Read a `SDK_SURFACE_INVENTORY` operand-row payload field. */
function inventoryPayload(id: string): Readonly<Record<string, unknown>> {
  const entry = SDK_SURFACE_INVENTORY.find((e) => e.id === id);
  if (entry === undefined) {
    throw new Error(`SDK_SURFACE_INVENTORY has no '${id}' row`);
  }
  if (entry.payload === undefined) {
    throw new Error(`SDK_SURFACE_INVENTORY row '${id}' carries no payload`);
  }
  return entry.payload;
}

/** The set of presence-checkable surface ids (the namespace-resolving kinds). */
const PRESENCE_CHECKABLE_IDS: readonly string[] = SDK_SURFACE_INVENTORY.filter(
  (e) =>
    e.kind === "namespace-function" ||
    e.kind === "pi-member" ||
    e.kind === "ctx-member" ||
    e.kind === "peer-named-import",
).map((e) => e.id);

describe("version-bump gate — step 2(a) positive surface-inventory presence", () => {
  it("step 2(a): reds unless every presence-checkable SDK_SURFACE_INVENTORY member is present on the pinned SDK", () => {
    // Conformant SDK: every presence-checkable id is present → no failures.
    const conformant = { presentIds: new Set(PRESENCE_CHECKABLE_IDS) };
    expect(surfaceInventoryPresenceFailures(conformant)).toEqual([]);

    // Adversarial SDK: a capability member removed/renamed upstream → that id
    // surfaces as a presence failure (version-bump-step2.md #bump-step-2-positive).
    const dropped = "pi.registerCommand";
    const adversarial = {
      presentIds: new Set(
        PRESENCE_CHECKABLE_IDS.filter((id) => id !== dropped),
      ),
    };
    expect(surfaceInventoryPresenceFailures(adversarial)).toContain(dropped);
  });
});

describe("version-bump gate — step 2(b) capability count co-edit", () => {
  it("step 2(b): reds when CAPABILITY_OBLIGATIONS cardinality diverges from the pinned literal (capability added/removed)", () => {
    // Matched: length 7 against the pinned literal 7 → no failures.
    expect(capabilityCountCoEditFailures(7, 7)).toEqual([]);
    // A capability added (8 vs 7) without co-editing the literal → red.
    expect(capabilityCountCoEditFailures(8, 7).length).toBeGreaterThan(0);
    // A capability removed (6 vs 7) without co-editing the literal → red.
    expect(capabilityCountCoEditFailures(6, 7).length).toBeGreaterThan(0);
  });
});

describe("version-bump gate — step 3 engines.node three-way equality", () => {
  it("step 3: reds when the live upstream floor moves while operands (i) and (ii) stay pinned", () => {
    // Operand (ii) is the in-repo pinned floor in the pi-engines-node row.
    const inventoryPinned = inventoryPayload("pi-engines-node").literal as string;
    const loomLiteral = ">=22.19.0"; // operand (i): package.json#engines.node
    expect(inventoryPinned).toBe(">=22.19.0");

    // Equal triple (i === ii === iii) → no failures.
    expect(
      enginesNodeEqualityFailures(loomLiteral, inventoryPinned, ">=22.19.0"),
    ).toEqual([]);

    // Operand (iii), the only live read, moves upstream while (i)/(ii) stay
    // pinned → red (version-bump-steps-3-4.md step 3).
    expect(
      enginesNodeEqualityFailures(loomLiteral, inventoryPinned, ">=24.0.0")
        .length,
    ).toBeGreaterThan(0);
  });
});

describe("version-bump gate — step 4 peerDependencies literal-read (PIC-34)", () => {
  it("PIC-34: reds unless all four @earendil-works/* entries byte-equal the Pi-SDK pin and typebox is '*'", () => {
    // The pin literal is operand of the peer-dep-range inventory row.
    const pin = inventoryPayload("peer-dep-range").range as string;
    expect(pin).toBe("~0.75.5");

    // Conformant peerDependencies: all four aligned to the pin, typebox '*'.
    const conformant = {
      "@earendil-works/pi-coding-agent": pin,
      "@earendil-works/pi-agent-core": pin,
      "@earendil-works/pi-ai": pin,
      "@earendil-works/pi-tui": pin,
      typebox: "*",
    };
    expect(peerDependencyPinFailures(conformant, pin)).toEqual([]);

    // One of the four diverging from the pin → red (the joint-move property the
    // widen-on-bump procedure requires, host-prerequisites.md #pic-34, PIC-34).
    const diverged = { ...conformant, "@earendil-works/pi-ai": "~0.76.0" };
    expect(peerDependencyPinFailures(diverged, pin).length).toBeGreaterThan(0);

    // typebox other than '*' → red.
    const badTypebox = { ...conformant, typebox: "^0.34.0" };
    expect(peerDependencyPinFailures(badTypebox, pin).length).toBeGreaterThan(0);
  });
});

describe("version-bump gate — step 2(a) reason-snapshot literal-array consistency", () => {
  const union = ["quit", "reload", "new", "resume", "fork"];

  it("step 2(a)/step 5 trigger (ii): the pinned snapshot literals match the SDK reason union bidirectionally; a widen or narrow reds", () => {
    // The pinned snapshot is well-formed data (non-empty, distinct) and matches
    // the loom 1.0 SDK reason union.
    expect(SESSION_SHUTDOWN_REASON_SNAPSHOT.literals).toEqual(union);

    // Consistent (snapshot set === union set) → no failures.
    expect(
      reasonSnapshotConsistencyFailures(
        SESSION_SHUTDOWN_REASON_SNAPSHOT.literals,
        union,
      ),
    ).toEqual([]);

    // Widen: the SDK union gains a member absent from the pinned snapshot → red.
    expect(
      reasonSnapshotConsistencyFailures([...union], [...union, "switch"]).length,
    ).toBeGreaterThan(0);

    // Narrow: the pinned snapshot carries a member absent from the SDK union → red.
    expect(
      reasonSnapshotConsistencyFailures([...union, "stale"], [...union]).length,
    ).toBeGreaterThan(0);

    // Empty snapshot → red (the non-empty predicate).
    expect(
      reasonSnapshotConsistencyFailures([], [...union]).length,
    ).toBeGreaterThan(0);

    // Duplicate members in the snapshot → red (the distinct predicate).
    expect(
      reasonSnapshotConsistencyFailures(["quit", "quit"], ["quit"]).length,
    ).toBeGreaterThan(0);
  });
});

describe("version-bump gate — step 6 provider seed-field Api-coverage", () => {
  it("step 6: reds when a pi-ai Api literal-union value is absent from the seed-field table row keys", () => {
    const tableKeys = Object.keys(PROVIDER_SEED_FIELD_TABLE);
    const apiSnapshot = inventoryPayload("api-coverage")
      .apiUnionSnapshot as readonly string[];

    // Every pinned Api value is a seed-field table row key → no failures.
    expect(apiCoverageFailures(apiSnapshot, tableKeys)).toEqual([]);

    // A new/unlisted Api value not present as a row key → red, naming the value
    // (provider-error-mapping.md #provider-seed-field-mapping).
    const withNewApi = [...apiSnapshot, "google-generative-ai"];
    expect(apiCoverageFailures(withNewApi, tableKeys)).toContain(
      "google-generative-ai",
    );
  });

  it("step 6: per-provider seed-field fixture reds when a supported provider's seed field is renamed or moved across the supporting/omitted sets", () => {
    // Observed table identical to the pinned table → no failures.
    expect(
      seedFieldFixtureFailures(
        PROVIDER_SEED_FIELD_TABLE,
        PROVIDER_SEED_FIELD_TABLE,
      ),
    ).toEqual([]);

    // A supported provider's seed field renamed (mistral: random_seed → seed) → red.
    const renamed = { ...PROVIDER_SEED_FIELD_TABLE, mistral: "seed" };
    expect(
      seedFieldFixtureFailures(PROVIDER_SEED_FIELD_TABLE, renamed).length,
    ).toBeGreaterThan(0);

    // A provider moved from the omitted set into the supporting set → red.
    const moved = {
      ...PROVIDER_SEED_FIELD_TABLE,
      "anthropic-messages": "seed",
    };
    expect(
      seedFieldFixtureFailures(PROVIDER_SEED_FIELD_TABLE, moved).length,
    ).toBeGreaterThan(0);
  });
});

describe("version-bump gate — step 7 strict-capability probe (both arms)", () => {
  const probedName = inventoryPayload("strict-capability-probe")
    .probedName as string;

  it("step 7 rename-detection arm: reds when an indicator is present under a name other than the probed strictCapable", () => {
    // The gate consumes the probed name from the strict-capability-probe row.
    expect(probedName).toBe("strictCapable");
    // Indicator present under a different name, absent under the probed name.
    const members = ["id", "provider", "api", "strictStructuredOutput"];
    const failures = strictCapabilityProbeFailures(probedName, members);
    expect(failures.some((f) => f.arm === "rename-detection")).toBe(true);

    // Conformant Model<Api> — neither the indicator nor the probed name present
    // (the loom 1.0 absence pin holds) → no failures.
    expect(
      strictCapabilityProbeFailures(probedName, ["id", "provider", "api"]),
    ).toEqual([]);
  });

  it("step 7 absence-under-probed-name arm: reds when a strictCapable member is present under the probed name", () => {
    // The probed name IS present on the Model<Api> — the absence pin is violated
    // (inventory-audit-intro.md #strict-capability-absence-under-probed-name).
    const members = ["id", "provider", "api", "strictCapable"];
    const failures = strictCapabilityProbeFailures(probedName, members);
    expect(failures.some((f) => f.arm === "absence-under-probed-name")).toBe(
      true,
    );
  });
});
