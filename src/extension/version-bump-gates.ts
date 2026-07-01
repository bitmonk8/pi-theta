// V18c / V18c-T — the Pi version-bump static build-time gates.
//
// This module owns the mechanical build-time gates the contributor
// version-bump checklist relies on (pi-integration-contract/version-bump-*.md).
// Each gate is a PURE function over injected operands so the tests can drive
// both the conformant (green) and the drifted (red) direction by construction,
// and no gate reads an ambient primitive or the live SDK directly — the paired
// `V18c` implementation wires the live reads (the installed
// `@earendil-works/pi-coding-agent` `package.json`, the loom `package.json`,
// the imported SDK namespace, the pinned pi-ai `Api` snapshot) into these seams.
//
// The gates, keyed to their spec steps:
//   • `surfaceInventoryPresenceFailures` — step 2(a) positive surface-inventory
//     literal-read: every presence-checkable `SDK_SURFACE_INVENTORY` member is
//     present on the pinned SDK (version-bump-step2.md #bump-step-2-positive).
//   • `capabilityCountCoEditFailures` — step 2(b) promote/co-edit: the
//     `CAPABILITY_OBLIGATIONS.length === 7` count-equality gate that fires when
//     a capability is added/removed (version-bump-step2b.md #bump-step-2b-promote).
//   • `enginesNodeEqualityFailures` — step 3 `engines.node` three-way equality
//     across (i) the loom `package.json#engines.node` literal, (ii) the in-repo
//     `pi-engines-node` pinned floor, and (iii) the live upstream floor
//     (version-bump-steps-3-4.md step 3). Operand (iii) is the only live read.
//   • `peerDependencyPinFailures` — step 4 `peerDependencies` literal-read:
//     the four `@earendil-works/*` entries byte-equal the Pi-SDK pin literal and
//     `typebox` is `"*"` (version-bump-steps-3-4.md step 4, host-prerequisites
//     #pic-34).
//   • `reasonSnapshotConsistencyFailures` — step 2(a) literal-array consistency
//     on the `SessionShutdownEvent['reason']` closed-set snapshot: non-empty,
//     distinct, and bidirectionally equal to the SDK union (a widen or a narrow
//     both redden), the runtime companion of the
//     `loom/typecheck/session-shutdown-reason-snapshot` brand-string type-equality
//     assertion (version-bump-triggers.md step 5 trigger (ii)).
//   • `apiCoverageFailures` + `seedFieldFixtureFailures` — step 6 provider
//     seed-field gates: every pi-ai `Api` literal-union value is a seed-field
//     table row key, and each supported provider's seed field is unchanged
//     (provider-error-mapping.md #provider-seed-field-mapping, version-bump-triggers
//     step 6).
//   • `strictCapabilityProbeFailures` — step 7 strict-capability probe, both
//     spec-defined arms: the rename-detection arm (an indicator present under a
//     name other than the probed `strictCapable`) and the absence-under-the-probed
//     name arm (a `strictCapable` member present under the probed name), consuming
//     the `strict-capability-probe` row's `probedName` payload from
//     `SDK_SURFACE_INVENTORY` (version-bump-triggers.md step 7,
//     inventory-audit-intro.md #strict-capability-absence-under-probed-name).
//
// V18c-T (this tests-task) declares every gate seam and stubs each with an inert
// sentinel result — never the real reconciliation — so the paired failing tests
// compile and red on their own primary assertions in BOTH the conformant and the
// drifted direction. The paired `V18c` implementation leaf fills the gate bodies
// in. The pinned data constants below are real (the tests reference them), but no
// gate consults the pinned SDK yet.

import { SDK_SURFACE_INVENTORY } from "./sdk-inventory";

// --- pinned data constants (real; V18c-owned) -------------------------------

/**
 * The `SessionShutdownEvent['reason']` closed-set snapshot entry
 * (version-bump-triggers.md step 5 grouping (ii)). `path` names the SDK type
 * whose reason union is snapshotted; `literals` is the pinned closed set the
 * runtime Unknown-reason rule reads and the step-2(a) literal-array consistency
 * check reconciles against the SDK union. At the loom 1.0 Pi-SDK pin the union
 * is `"quit" | "reload" | "new" | "resume" | "fork"` (session-model-and-appendix
 * SM-2). `Object.freeze` keeps it off the *No globals, statics, singletons*
 * mutable-binding scan (a frozen runtime-immutable snapshot).
 */
export const SESSION_SHUTDOWN_REASON_SNAPSHOT: {
  readonly path: string;
  readonly literals: readonly string[];
} = Object.freeze({
  path: "SessionShutdownEvent.reason",
  literals: Object.freeze(["quit", "reload", "new", "resume", "fork"]),
});

/**
 * The provider seed-field table (provider-error-mapping.md
 * #provider-seed-field-mapping), keyed on the resolved binder model's `Api`
 * value. A provider that carries a fixed seed maps to its request-payload field
 * name; a provider with no seed field maps to the literal `"omitted"`. The row
 * keys are the coverage domain the `Api`-coverage gate asserts every pi-ai `Api`
 * literal-union value appears in. `Object.freeze` keeps it off the mutable-binding
 * scan.
 */
export const PROVIDER_SEED_FIELD_TABLE: Readonly<Record<string, string>> =
  Object.freeze({
    "openai-completions": "seed",
    mistral: "random_seed",
    "anthropic-messages": "omitted",
    "amazon-bedrock": "omitted",
  });

// --- step 2(a): positive surface-inventory presence -------------------------

/**
 * The pinned-SDK surface snapshot the presence gate reads: the set of surface
 * ids observed present on the imported `@earendil-works/pi-coding-agent`
 * namespace (and its lock-step siblings / typebox). The paired `V18c` builds this
 * from the live import; the tests construct conformant and adversarial snapshots.
 */
export interface PinnedSdkSurface {
  readonly presentIds: ReadonlySet<string>;
}

/**
 * Step 2(a) positive direction: return the ids of every presence-checkable
 * `SDK_SURFACE_INVENTORY` member absent from the pinned SDK. A capability
 * removed or renamed upstream surfaces here. Non-`namespace-function` operand
 * rows (`engines-pin` / `peer-dep-range` / `strict-capability-probe` /
 * `api-coverage`) are pinned literals, not SDK members, so they are not
 * presence-checked.
 *
 * V18c-T stub: performs no presence diff (returns no failures), so the
 * adversarial direction — which expects the dropped id — reds on its detection
 * assertion because the reconciliation is absent. The paired `V18c` fills it in.
 */
export function surfaceInventoryPresenceFailures(
  sdk: PinnedSdkSurface,
): readonly string[] {
  void sdk;
  void SDK_SURFACE_INVENTORY;
  return [];
}

// --- step 2(b): capability count-equality co-edit ---------------------------

/**
 * Step 2(b) promote/co-edit: return a non-empty failure list when the
 * `CAPABILITY_OBLIGATIONS` cardinality diverges from the pinned integer literal
 * (`7` at loom 1.0). Adding or removing a capability without co-editing the
 * literal in the same edit reddens this gate.
 *
 * V18c-T stub: performs no count check (returns no failures), so the added
 * (8 vs 7) and removed (6 vs 7) directions red on their detection assertion.
 * The paired `V18c` fills it in.
 */
export function capabilityCountCoEditFailures(
  obligationsLength: number,
  pinnedCount: number,
): readonly string[] {
  void obligationsLength;
  void pinnedCount;
  return [];
}

// --- step 3: engines.node three-way equality --------------------------------

/**
 * Step 3 `engines.node` three-way equality: return a non-empty failure list
 * unless the three operands are equal — (i) the loom `package.json#engines.node`
 * literal, (ii) the in-repo `pi-engines-node` pinned floor, (iii) the live
 * upstream floor read from the installed `@earendil-works/pi-coding-agent`
 * `package.json`. Operand (iii) is the only live read, so an upstream floor move
 * (iii differs while i and ii stay pinned) reddens.
 *
 * V18c-T stub: performs no equality check (returns no failures), so the
 * upstream-moved direction reds on its detection assertion.
 */
export function enginesNodeEqualityFailures(
  loomLiteral: string,
  inventoryPinned: string,
  liveUpstream: string,
): readonly string[] {
  void loomLiteral;
  void inventoryPinned;
  void liveUpstream;
  return [];
}

// --- step 4: peerDependencies literal-read ----------------------------------

/**
 * Step 4 `peerDependencies` literal-read: return a non-empty failure list unless
 * all four `@earendil-works/*` entries are byte-equal to the Pi-SDK pin literal
 * AND `typebox` is exactly `"*"`. Any one of the four diverging from the pin, or a
 * `typebox` entry other than `"*"`, reddens (the "joint move" property).
 *
 * V18c-T stub: performs no literal-read (returns no failures), so the
 * one-diverging and bad-typebox directions red on their detection assertion.
 */
export function peerDependencyPinFailures(
  peerDependencies: Readonly<Record<string, string>>,
  pinLiteral: string,
): readonly string[] {
  void peerDependencies;
  void pinLiteral;
  return [];
}

// --- step 2(a): reason-snapshot literal-array consistency -------------------

/**
 * Step 2(a) literal-array consistency on the `SessionShutdownEvent['reason']`
 * snapshot (version-bump-triggers.md step 5 trigger (ii)): return a non-empty
 * failure list unless the snapshot `literals` field is a non-empty array of
 * distinct strings whose set is bidirectionally equal to the SDK reason union —
 * a widen (a union member absent from the snapshot) or a narrow (a snapshot
 * member absent from the union) both redden. This is the runtime companion of
 * the `loom/typecheck/session-shutdown-reason-snapshot` brand-string
 * type-equality assertion.
 *
 * V18c-T stub: performs no consistency check (returns no failures), so the
 * widen, narrow, empty, and duplicate directions red on their detection
 * assertion.
 */
export function reasonSnapshotConsistencyFailures(
  snapshotLiterals: readonly string[],
  sdkReasonUnion: readonly string[],
): readonly string[] {
  void snapshotLiterals;
  void sdkReasonUnion;
  return [];
}

// --- step 6: provider seed-field Api-coverage + fixture ---------------------

/**
 * Step 6 `Api`-coverage: return the pi-ai `Api` literal-union values that are
 * absent from the seed-field table's row keys — the spec's named trigger of a
 * new/unlisted `Api`. Every enumerated `Api` value MUST be a table row key.
 *
 * V18c-T stub: performs no coverage check (returns no failures), so the
 * new-unlisted-Api direction reds on its detection assertion.
 */
export function apiCoverageFailures(
  apiUnionSnapshot: readonly string[],
  seedFieldTableKeys: readonly string[],
): readonly string[] {
  void apiUnionSnapshot;
  void seedFieldTableKeys;
  return [];
}

/**
 * Step 6 per-provider seed-field fixture: return a non-empty failure list when a
 * supported provider's seed field is renamed, retyped, or moved between the
 * supporting and non-supporting (`"omitted"`) sets relative to the pinned table.
 *
 * V18c-T stub: performs no fixture comparison (returns no failures), so the
 * renamed-field and moved-across-sets directions red on their detection
 * assertion.
 */
export function seedFieldFixtureFailures(
  pinnedTable: Readonly<Record<string, string>>,
  observedTable: Readonly<Record<string, string>>,
): readonly string[] {
  void pinnedTable;
  void observedTable;
  return [];
}

// --- step 7: strict-capability probe (both arms) ----------------------------

/** Which spec-defined arm of the strict-capability probe gate fired. */
export type StrictCapabilityArm =
  | "rename-detection"
  | "absence-under-probed-name";

/** One strict-capability probe failure: the arm and the offending member name. */
export interface StrictCapabilityProbeFailure {
  readonly arm: StrictCapabilityArm;
  readonly member: string;
}

/**
 * Step 7 strict-capability probe, both spec-defined arms
 * (version-bump-triggers.md step 7; inventory-audit-intro.md
 * #strict-capability-absence-under-probed-name):
 *   • rename-detection — a reachable `Model<Api>` declaration exposes a
 *     strict-capability indicator under a name OTHER than the probed
 *     `strictCapable` (indicator present on the namespace, absent under the
 *     probed name);
 *   • absence-under-probed-name — a reachable `Model<Api>` declaration exposes a
 *     `strictCapable` member under the probed name (the loom 1.0 absence pin is
 *     violated).
 *
 * The gate consumes `probedName` from the `strict-capability-probe`
 * `SDK_SURFACE_INVENTORY` row payload; `modelMembers` is the reachable
 * `Model<Api>` member-name set.
 *
 * V18c-T stub: detects neither arm (returns no failures), so both the
 * rename-detection and absence-under-probed-name negative fixtures red on their
 * arm-detection assertion because the reconciliation is absent. The paired
 * `V18c` fills it in.
 */
export function strictCapabilityProbeFailures(
  probedName: string,
  modelMembers: readonly string[],
): readonly StrictCapabilityProbeFailure[] {
  void probedName;
  void modelMembers;
  return [];
}
