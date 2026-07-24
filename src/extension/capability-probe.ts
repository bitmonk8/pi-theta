// V9a / V9a-T — the Step 0 capability probe seam.
//
// This module owns the single load-bearing capability probe the extension
// factory runs at entry, before any factory-time host-binding call, per
// pi-integration-contract/capability-probe.md "Step 0 — Capability probe" and
// host-prerequisites.md. The probe runs five checks in the fixed short-circuit
// order `(a)` Node floor → `(b)` AbortSignal/AbortController shape → `(c)+(d)`
// SDK named members + peer-dep lock-step → `(e)` typebox host-shape, stops at
// the first failure, and yields exactly one `theta/load/host-incompatible`
// failure outcome (or a pass). PIC-3/4/5/6 are the probe-wide invariants. The
// probe is wired off a single source-of-truth pinned-constants block the
// build-time literal-read assertions also consume.
//
// RFC-0005 retired capability 3's in-process `createAgentSession` /
// `AgentSession.prototype.abort` `typeof` members (capability-probe.md Step 0
// (c)): capability 3 now contributes no `typeof` member and is verified by the
// Step 0 (f) executable-resolution probe (`probeSubagentExecutable`) instead.
//
// The probe is a pure function over an injected host snapshot: it reads no
// ambient primitive (no `process.versions`, no global `AbortSignal`), so the
// `src/**` *No globals, statics, singletons* ambient-primitive ban is honoured
// and the tests drive both conformant and adversarial hosts by construction.

import semver from "semver";
import type { Diagnostic } from "../diagnostics/diagnostic";
import {
  resolveSubagentExecutable,
  SUBAGENT_EXECUTABLE_UNRESOLVED_CODE,
  SUBAGENT_EXECUTABLE_UNRESOLVED_MESSAGE,
  type ExecutableHost,
} from "../runtime/subagent-launcher";

/**
 * The closed `theta/load/host-incompatible` `details.kind` discriminator set
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
 * The closed four-element list of factory-probable capability identifiers —
 * SDK capability inventory items 1/2/4/6 (capability-probe.md Step 0 (c):
 * "items 1, 2, 4, and 6 (four capabilities, seven function members)"). RFC-0005
 * dropped capability 3 (subagent-mode isolated session) from this set: its
 * former in-process `createAgentSession` `typeof` pin is retired, and it is now
 * verified by the Step 0 (f) executable-resolution probe rather than by the
 * factory-probable `typeof` member loop. This is the importable symbol
 * `V18a`/`V18c` reconcile their factory-probed partition flags against (it is
 * the partition target, not the probe's seven-member iteration target).
 *
 * `Object.freeze` keeps this module-level constant off the *No globals,
 * statics, singletons* mutable-binding scan (a frozen runtime-immutable list).
 */
export const FACTORY_PROBABLE_CAPABILITIES: readonly CapabilityId[] =
  Object.freeze([1, 2, 4, 6]);

/**
 * Cancellation-runtime constant: the bounded wait (milliseconds) the
 * `session_shutdown` teardown awaits in-flight invocation drainage before
 * proceeding. Semantics are owned by `V17a`; the value is sourced from
 * session-shutdown-semantics.md §`session_shutdown` sub-step 3. `V9a` is the
 * single declaration site `V9g`, `V9i`, and `V17a` import (rather than
 * redeclare) and that `V18c`'s build-time literal-read assertion reads.
 */
export const SHUTDOWN_AWAIT_CAP_MS = 2000;

/** The pinned Node floor (capability-probe.md Step 0 (a)). */
const NODE_FLOOR = ">=22.19.0";

/**
 * The Pi-SDK peer-dependency floor (host-prerequisites.md #pi-sdk-pin), the
 * `details.required` for the `peer-dep-*` kinds and the open range Step 0 (d)
 * satisfies each lock-step peer's installed version against. The floor is
 * OPEN (`>=0.80.8`), not a tilde: it admits any host at or above the
 * minimum-API-shape version, so any installed pi-coding-agent >=0.80.8 loads.
 * The open floor deliberately trades the former tilde minor-skew detection for
 * forward compatibility with newer minors, matching the install-time
 * `peerDependencies` contract. The dev/build target (`~0.80.10`) is a separate
 * literal that does not gate runtime load.
 */
const PI_SDK_PIN_RANGE = ">=0.80.8";

/**
 * The four lock-step `@earendil-works/*` peer-dep packages, in the fixed
 * normative iteration order (capability-probe.md Step 0 (d)). Frozen to stay
 * off the *No globals, statics, singletons* mutable-binding scan.
 */
const PEER_DEP_PACKAGES: readonly string[] = Object.freeze([
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-tui",
]);

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
 * The `theta/load/host-incompatible` `details` payload a failing probe produces
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

/** The `details.step` label naming which check threw (Step 0 "Self-failure"). */
type ProbeStep =
  | "node-floor"
  | "abortsignal-shape"
  | "sdk-capability-missing"
  | "peer-dep-version"
  | "typebox-shape";

/**
 * Read a property off a value that may be a function (a constructor such as
 * `AbortController`) or an ordinary object, returning `undefined` for a
 * non-indexable holder. A hostile getter that throws propagates to the
 * enclosing step's `try`/`catch`, routing to `kind: "probe-failed"` (PIC-6).
 */
function readProp(holder: unknown, key: string): unknown {
  if (holder === null || (typeof holder !== "object" && typeof holder !== "function")) {
    return undefined;
  }
  return (holder as Record<string, unknown>)[key];
}

/**
 * The `in`-operator prototype-property check (Step 0 (b), `prototype-property`
 * members). `in` against a non-object holder throws `TypeError`; the spec
 * routes that to `kind: "probe-failed"` ("in-operator evaluation against a
 * null prototype"), so the throw propagates to the step's `try`/`catch`.
 */
function hasMember(holder: unknown, key: string): boolean {
  if (holder === null || (typeof holder !== "object" && typeof holder !== "function")) {
    throw new TypeError(`cannot evaluate '${key}' in non-object prototype`);
  }
  return key in holder;
}

/**
 * Coerce a caught thrown value to its underlying string per the diagnostics
 * underlying-error coercion (placeholder-rendering-b.md #underlying-error-
 * coercion): an object with a string `.message` yields that message; otherwise
 * `String(v)`, or the literal `<unreadable>` when either the `.message` access
 * or the `String(v)` coercion itself throws (PIC-6 — a hostile getter MUST NOT
 * escape the probe).
 */
function coerceCause(v: unknown): string {
  try {
    if (typeof v === "object" && v !== null) {
      const message = (v as Record<string, unknown>).message;
      if (typeof message === "string") {
        return message;
      }
    }
  } catch (e: unknown) { // allow-broad-catch: PIC-6 — pi-integration-contract/capability-probe.md
    void e;
  }
  try {
    return String(v);
  } catch (e: unknown) { // allow-broad-catch: PIC-6 — pi-integration-contract/capability-probe.md
    void e;
    return "<unreadable>";
  }
}

/** Build the self-failure (`probe-failed`) outcome for a step that threw. */
function probeFailed(step: ProbeStep, cause: string, pkg?: string): ProbeOutcome {
  return {
    ok: false,
    details: {
      kind: "probe-failed",
      observed: "<unreadable>",
      required: "<unreadable>",
      step,
      ...(pkg === undefined ? {} : { package: pkg }),
      cause,
    },
  };
}

/**
 * Run the Step 0 capability probe over an injected host snapshot. MUST NOT
 * throw (PIC-6): every check is trapped and any throw routes to a
 * `kind: "probe-failed"` outcome. Runs the five checks in the fixed
 * short-circuit order `(a)` → `(b)` → `(c)+(d)` → `(e)`, stopping at the first
 * failure, and returns a pass or that first-failure refusal. The probe is
 * `typeof`-/`in`-only and never constructs or invokes a member it checks
 * (PIC-3/PIC-4).
 */
export function runCapabilityProbe(host: ProbeHost): ProbeOutcome {
  // ── (a) Node floor ───────────────────────────────────────────────────────
  try {
    const nodeVersion = host.nodeVersion;
    if (semver.valid(nodeVersion) === null) {
      // Not a syntactically valid SemVer string → probe-failed, not node-floor.
      return probeFailed(
        "node-floor",
        `process.versions.node is not a valid SemVer string: ${String(nodeVersion)}`,
      );
    }
    if (!semver.satisfies(nodeVersion, NODE_FLOOR, { includePrerelease: true })) {
      return {
        ok: false,
        details: { kind: "node-floor", observed: nodeVersion, required: NODE_FLOOR },
      };
    }
  } catch (e: unknown) { // allow-broad-catch: PIC-6 — pi-integration-contract/capability-probe.md
    return probeFailed("node-floor", coerceCause(e));
  }

  // ── (b) AbortSignal / AbortController shape ───────────────────────────────
  try {
    const abortController = host.abortController;
    const abortSignal = host.abortSignal;
    // `typeof`-checked members, in the table's listed order (constructors,
    // prototype-methods, static-methods) — short-circuit at the first.
    const typeofMembers: ReadonlyArray<readonly [string, () => unknown]> = [
      ["AbortController", () => abortController],
      ["AbortSignal", () => abortSignal],
      ["AbortController.prototype.abort", () =>
        readProp(readProp(abortController, "prototype"), "abort")],
      ["AbortSignal.any", () => readProp(abortSignal, "any")],
      ["AbortSignal.timeout", () => readProp(abortSignal, "timeout")],
      ["AbortSignal.prototype.throwIfAborted", () =>
        readProp(readProp(abortSignal, "prototype"), "throwIfAborted")],
      ["AbortSignal.prototype.addEventListener", () =>
        readProp(readProp(abortSignal, "prototype"), "addEventListener")],
    ];
    for (const [, get] of typeofMembers) {
      const observed = typeof get();
      if (observed !== "function") {
        return {
          ok: false,
          details: { kind: "abortsignal-shape", observed, required: "function" },
        };
      }
    }
    // `prototype-property` members (accessor properties whose getters throw off
    // the prototype) → `in`-based, never a value read (PIC-3).
    const abortSignalProto = readProp(abortSignal, "prototype");
    for (const name of ["aborted", "reason"]) {
      if (!hasMember(abortSignalProto, name)) {
        return {
          ok: false,
          details: { kind: "abortsignal-shape", observed: "absent", required: "present" },
        };
      }
    }
  } catch (e: unknown) { // allow-broad-catch: PIC-6 — pi-integration-contract/capability-probe.md
    return probeFailed("abortsignal-shape", coerceCause(e));
  }

  // ── (c) Factory-probable SDK capabilities (seven function members) ────────
  // RFC-0005 (capability-probe.md Step 0 (c)): capability 3's former in-process
  // `createAgentSession` / `AgentSession.prototype.abort` members are retired;
  // capability 3 is verified by the Step 0 (f) executable-resolution probe.
  try {
    const pi = host.pi;
    const sdkMembers: ReadonlyArray<readonly [string, () => unknown]> = [
      ["pi.registerCommand", () => readProp(pi, "registerCommand")],
      ["pi.sendUserMessage", () => readProp(pi, "sendUserMessage")],
      ["pi.registerTool", () => readProp(pi, "registerTool")],
      ["pi.setActiveTools", () => readProp(pi, "setActiveTools")],
      ["pi.getActiveTools", () => readProp(pi, "getActiveTools")],
      ["pi.registerMessageRenderer", () => readProp(pi, "registerMessageRenderer")],
      ["pi.sendMessage", () => readProp(pi, "sendMessage")],
    ];
    for (const [member, get] of sdkMembers) {
      const observed = typeof get();
      if (observed !== "function") {
        return {
          ok: false,
          details: {
            kind: "sdk-capability-missing",
            observed,
            required: "function",
            member,
          },
        };
      }
    }
  } catch (e: unknown) { // allow-broad-catch: PIC-6 — pi-integration-contract/capability-probe.md
    return probeFailed("sdk-capability-missing", coerceCause(e));
  }

  // ── (d) Peer-dep version (lock-step, four packages) ───────────────────────
  for (const pkg of PEER_DEP_PACKAGES) {
    let version: string | undefined;
    try {
      version = host.readPeerVersion(pkg);
    } catch (e: unknown) { // allow-broad-catch: PIC-6 — pi-integration-contract/capability-probe.md
      // Any throw outside the four installation-observable conditions routes to
      // probe-failed with the offending package named (Step 0 "Self-failure").
      return probeFailed("peer-dep-version", coerceCause(e), pkg);
    }
    if (version === undefined) {
      // Conditions (1)–(3): no readable `version` string was obtained.
      return {
        ok: false,
        details: {
          kind: "peer-dep-malformed-version",
          observed: "<unresolvable>",
          required: PI_SDK_PIN_RANGE,
          package: pkg,
        },
      };
    }
    if (semver.valid(version) === null) {
      // Condition (4): present-but-invalid SemVer string (rendered host-derived).
      return {
        ok: false,
        details: {
          kind: "peer-dep-malformed-version",
          observed: version,
          required: PI_SDK_PIN_RANGE,
          package: pkg,
        },
      };
    }
    if (!semver.satisfies(version, PI_SDK_PIN_RANGE)) {
      return {
        ok: false,
        details: {
          kind: "peer-dep-out-of-range",
          observed: version,
          required: PI_SDK_PIN_RANGE,
          package: pkg,
        },
      };
    }
  }

  // ── (e) typebox host-shape ────────────────────────────────────────────────
  try {
    const observed = typeof readProp(host.typeboxType, "Unsafe");
    if (observed !== "function") {
      return {
        ok: false,
        details: { kind: "typebox-shape", observed, required: "function" },
      };
    }
  } catch (e: unknown) { // allow-broad-catch: PIC-6 — pi-integration-contract/capability-probe.md
    return probeFailed("typebox-shape", coerceCause(e));
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Step 0 (f) — subagent-executable resolution (capability-3 replacement).
// ---------------------------------------------------------------------------

/** The Step 0 (f) probe outcome: a runnable child entry point, or the fail-closed refusal. */
export type SubagentExecutableProbeOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly diagnostic: Diagnostic };

/**
 * Step 0 (f). Run the [executable-resolution ladder](subagent.md) and assert a
 * runnable child `pi` entry point (the capability-3 replacement for the retired
 * in-process `createAgentSession` / `ResourceLoader` / `SessionManager.inMemory`
 * `typeof` pins). Filesystem-existence only — no spawn, no version handshake. If
 * neither rung yields a runnable entry point, the theta fails registration
 * fail-closed with `theta/load/subagent-executable-unresolved` (its OWN precise
 * code, not `theta/load/host-incompatible`). There is NO `PATH` fallback.
 */
export function probeSubagentExecutable(host: ExecutableHost): SubagentExecutableProbeOutcome {
  // Filesystem-existence only — no spawn, no version handshake. Run the ladder;
  // a runnable entry point on either rung passes.
  const resolution = resolveSubagentExecutable(host);
  if (resolution.ok) {
    return { ok: true };
  }
  // Neither rung yields a runnable child `pi` entry point — fail-closed under the
  // probe's OWN precise code (not `theta/load/host-incompatible`). No PATH fallback.
  return {
    ok: false,
    diagnostic: {
      severity: "error",
      code: SUBAGENT_EXECUTABLE_UNRESOLVED_CODE,
      message: SUBAGENT_EXECUTABLE_UNRESOLVED_MESSAGE,
    },
  };
}
