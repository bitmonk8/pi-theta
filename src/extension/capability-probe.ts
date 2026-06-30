// V9a / V9a-T — the Step 0 capability probe seam.
//
// This module owns the single load-bearing capability probe the extension
// factory runs at entry, before any factory-time host-binding call, per
// pi-integration-contract/capability-probe.md "Step 0 — Capability probe" and
// host-prerequisites.md. The probe runs five checks in the fixed short-circuit
// order `(a)` Node floor → `(b)` AbortSignal/AbortController shape → `(c)+(d)`
// SDK named members + peer-dep lock-step → `(e)` typebox host-shape, stops at
// the first failure, and yields exactly one `loom/load/host-incompatible`
// failure outcome (or a pass). PIC-3/4/5/6 are the probe-wide invariants.
//
// V9a-T (tests-task) declares this seam and the `FACTORY_PROBABLE_CAPABILITIES`
// constant, both stubbed so the failing tests compile and red on their own
// primary assertions. The paired V9a implementation leaf fills the probe body
// in (Node-floor SemVer comparison, the AbortSignal member-with-kind table, the
// nine factory-probable SDK members, the four-package peer-dep iteration, the
// `Type.Unsafe` check), wired off the same single source-of-truth pinned
// constants the build-time literal-read assertions consume.
//
// The probe is a pure function over an injected host snapshot: it reads no
// ambient primitive (no `process.versions`, no global `AbortSignal`), so the
// `src/**` *No globals, statics, singletons* ambient-primitive ban is honoured
// and the tests drive both conformant and adversarial hosts by construction.

/**
 * The closed `loom/load/host-incompatible` `details.kind` discriminator set
 * (capability-probe.md "On failure: refusal and diagnostic" clause (ii)).
 */
export type HostIncompatibleKind =
  | "node-floor"
  | "abortsignal-shape"
  | "sdk-capability-missing"
  | "peer-dep-out-of-range"
  | "peer-dep-malformed-version"
  | "typebox-shape"
  | "probe-failed";

/** An SDK-capability-inventory item index (inventory-audit-intro.md). */
export type CapabilityId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * The closed five-element list of factory-probable capability identifiers —
 * SDK capability inventory items 1/2/3/4/6 (capability-probe.md Step 0 (c)).
 * This is the importable symbol `V18a`/`V18c` reconcile their factory-probed
 * partition flags against (it is the partition target, not the probe's
 * nine-member iteration target).
 *
 * Tests-task stub: empty so the PIC-5 enumeration test reds for the intended
 * reason. The V9a implementation fills it with `Object.freeze([1, 2, 3, 4, 6])`.
 * `Object.freeze` keeps this module-level constant off the *No globals,
 * statics, singletons* mutable-binding scan (a frozen runtime-immutable list).
 */
export const FACTORY_PROBABLE_CAPABILITIES: readonly CapabilityId[] =
  Object.freeze([]);

/**
 * The injected host snapshot the probe reads. Every value the probe inspects is
 * supplied here rather than read from an ambient primitive, so the probe stays
 * pure and ambient-free, and the tests can construct adversarial hosts.
 */
export interface ProbeHost {
  /** `process.versions.node` — the bare version string (Step 0 (a)). */
  readonly nodeVersion: string;
  /** The global `AbortController` value (Step 0 (b)). */
  readonly abortController: unknown;
  /** The global `AbortSignal` value (Step 0 (b)). */
  readonly abortSignal: unknown;
  /**
   * The Pi SDK namespace whose factory-probable function members are checked
   * by `typeof <path> === "function"` (Step 0 (c)): `registerCommand`,
   * `sendUserMessage`, `registerTool`, `setActiveTools`, `getActiveTools`,
   * `registerMessageRenderer`, `sendMessage`.
   */
  readonly pi: Readonly<Record<string, unknown>>;
  /** The `createAgentSession` named export (Step 0 (c), capability 3). */
  readonly createAgentSession: unknown;
  /** The imported `AgentSession` class (Step 0 (c): `AgentSession.prototype.abort`). */
  readonly agentSession: unknown;
  /** The `typebox` `Type` namespace (Step 0 (e): `Type.Unsafe`). */
  readonly typeboxType: unknown;
  /**
   * Read a lock-step peer package's installed `package.json` `version` (Step 0
   * (d)). Returns the raw version string (which may be valid or malformed
   * SemVer); returns `undefined` for the three no-readable-version conditions
   * (unresolvable / no matching `name` / no own `version` field — routing to the
   * `"<unresolvable>"` observed literal); throws for any other error (routing to
   * `kind: "probe-failed"`).
   */
  readPeerVersion(pkg: string): string | undefined;
}

/**
 * The `loom/load/host-incompatible` `details` payload a failing probe produces
 * (capability-probe.md clause (ii) + "Self-failure").
 */
export interface ProbeFailureDetails {
  readonly kind: HostIncompatibleKind;
  readonly observed: string;
  readonly required: string;
  /** Failing member path for `sdk-capability-missing` (Step 0 (c)). */
  readonly member?: string;
  /** Offending scoped package for the `peer-dep-*` kinds (Step 0 (d)). */
  readonly package?: string;
  /** The check that threw, for `probe-failed` (Step 0 "Self-failure"). */
  readonly step?: string;
  /** The coerced underlying-error string for `probe-failed`. */
  readonly cause?: string;
}

/** The probe outcome: a pass, or a single first-failure refusal. */
export type ProbeOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly details: ProbeFailureDetails };

// Tests-task stub: an off-union sentinel `kind` so BOTH the pass-expecting and
// the per-kind fail-expecting tests red on their own primary assertions (the
// probe body is absent). The double cast is the deliberate stub hack — the V9a
// implementation never produces an off-union kind.
const STUB_UNIMPLEMENTED_KIND = "unimplemented" as unknown as HostIncompatibleKind;

/**
 * Run the Step 0 capability probe over an injected host snapshot. MUST NOT
 * throw (PIC-6): every check is trapped and any throw routes to a
 * `kind: "probe-failed"` outcome. Returns a pass or the first-failure refusal.
 *
 * Tests-task stub: returns a sentinel refusal so the tests red. V9a fills in.
 */
export function runCapabilityProbe(_host: ProbeHost): ProbeOutcome {
  return {
    ok: false,
    details: { kind: STUB_UNIMPLEMENTED_KIND, observed: "", required: "" },
  };
}
