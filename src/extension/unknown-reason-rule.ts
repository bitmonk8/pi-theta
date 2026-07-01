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

// Anchor-stable contract surface (PIC-48 (a)/(b)): the two mutually-exclusive
// teardown-handler diagnostic codes, sourced verbatim from
// diagnostics/code-registry-host.md. The pre-init `"<unreadable>"` sentinel and
// the closed-set literals themselves are pinned in `SDK_SURFACE_INVENTORY`
// (PIC-46) and read from the injected snapshot, not restated here.
const REASON_UNKNOWN_CODE = "loom/host/session-shutdown-reason-unknown";
const PINNED_CONSTANT_UNREADABLE_CODE =
  "loom/host/session-shutdown-pinned-constant-unreadable";

/** The pre-init captured-reason sentinel (PIC-45). */
const UNREADABLE = "<unreadable>";

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
 */
export function classifyShutdownReason(
  event: SessionShutdownEventLike,
  inventory: readonly PinnedConstantSnapshotSource[] | undefined,
): ShutdownReasonClassification {
  // Handler-entry pre-inits (PIC-47 carve-out (b)): both variables take their
  // pre-init values before either read runs; the snapshot-failure path leaves
  // them unchanged.
  let capturedEventReason = UNREADABLE;
  let pinnedConstantReadOk = false;

  // --- Read (1): snapshot lookup-and-`literals` read (runs first, PIC-47). ---
  const snapshot = readSnapshotLiterals(inventory);
  if (snapshot.failure !== undefined) {
    // Snapshot-side failure is dominant: the `event.reason` read is never
    // reached, so `capturedEventReason` stays at its pre-init and only
    // `pinned-constant-unreadable` fires (mutual exclusivity, PIC-47).
    return {
      capturedEventReason,
      pinnedConstantReadOk,
      isClosedSetMember: false,
      diagnostic: pinnedConstantUnreadableDiagnostic(snapshot.failure),
    };
  }
  const literals = snapshot.literals;
  pinnedConstantReadOk = true;

  // --- Read (2): `event.reason` read (PIC-47). ---
  let reasonValue: unknown;
  let reasonReadThrew = false;
  try {
    reasonValue = event.reason;
  } catch { // allow-broad-catch: loom/host/session-shutdown-reason-unknown — pi-integration-contract/unknown-reason-rule.md
    // A throwing property-access getter is treated as an unknown reason.
    reasonReadThrew = true;
  }

  if (reasonReadThrew) {
    // Throwing access: observed is the `"<unreadable>"` sentinel (PIC-45).
    return {
      capturedEventReason: UNREADABLE,
      pinnedConstantReadOk,
      isClosedSetMember: false,
      diagnostic: reasonUnknownDiagnostic(UNREADABLE),
    };
  }

  // --- Read (3): set-membership comparison against the snapshot's literals. ---
  if (typeof reasonValue === "string" && literals.includes(reasonValue)) {
    // Closed-set member: capture the literal string; no diagnostic.
    capturedEventReason = reasonValue;
    return {
      capturedEventReason,
      pinnedConstantReadOk,
      isClosedSetMember: true,
    };
  }

  // Unknown reason: capture `String(event.reason)` (defended against a throwing
  // coercion, PIC-45) and fire `reason-unknown`.
  const observed = coerceObserved(reasonValue);
  return {
    capturedEventReason: observed,
    pinnedConstantReadOk,
    isClosedSetMember: false,
    diagnostic: reasonUnknownDiagnostic(observed),
  };
}

/** The outcome of the snapshot lookup-and-`literals` read (PIC-47). */
interface SnapshotReadResult {
  /** The validated closed set on success. */
  readonly literals: readonly string[];
  /** The `details.failure` discriminator on failure, else `undefined`. */
  readonly failure?: string;
}

/**
 * Run the snapshot lookup-and-`literals` read under `try`/`catch`, routing the
 * four spec-owned failure modes to their `details.failure` discriminators
 * (PIC-47): `undefined` inventory or no matching entry → `"missing-entry"`; a
 * throwing per-entry `.kind`/`.path`/`.literals` read → `"throw:<String(error)>"`;
 * a structurally-invalid `literals` field → `"literals-shape-invalid"`.
 */
function readSnapshotLiterals(
  inventory: readonly PinnedConstantSnapshotSource[] | undefined,
): SnapshotReadResult {
  // The circular-init / live-binding gap MUST be guarded before the iteration
  // primitive so it routes to `"missing-entry"`, not a `"throw:TypeError…"`.
  if (inventory === undefined) {
    return { literals: [], failure: "missing-entry" };
  }
  try {
    let match: PinnedConstantSnapshotSource | undefined;
    for (const entry of inventory) {
      // Composite predicate: both clauses (PIC-46). A per-entry `.kind`/`.path`
      // getter that throws propagates to the catch arm as a `"throw:"` value.
      if (
        entry.kind === "type-union-snapshot" &&
        entry.path === "SessionShutdownEvent.reason"
      ) {
        match = entry;
        break;
      }
    }
    if (match === undefined) {
      // No matching entry, or a defensive kind-mismatch at the matching path.
      return { literals: [], failure: "missing-entry" };
    }
    // A throwing `.literals` getter propagates to the catch arm.
    const raw = match.literals;
    if (!isValidClosedSet(raw)) {
      return { literals: [], failure: "literals-shape-invalid" };
    }
    return { literals: raw };
  } catch (error: unknown) { // allow-broad-catch: loom/host/session-shutdown-pinned-constant-unreadable — pi-integration-contract/unknown-reason-rule.md
    return { literals: [], failure: throwDiscriminator(error) };
  }
}

/**
 * The four `"literals-shape-invalid"` sub-cases (PIC-47): not an array; a
 * non-string element; the empty array; or an array of strings containing the
 * empty string.
 */
function isValidClosedSet(raw: unknown): raw is readonly string[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return false;
  }
  return raw.every((element) => typeof element === "string" && element !== "");
}

/**
 * `String(event.reason)` for the `details.observed` payload, defended against a
 * throwing `toString`/`Symbol.toPrimitive` — on such a throw the observed value
 * falls back to the bare `"<unreadable>"` sentinel (no `"throw:"` prefix to
 * preserve here, unlike the `details.failure` discriminator) (PIC-45).
 */
function coerceObserved(reasonValue: unknown): string {
  try {
    // Pinned to `String(...)` (not a template literal, which re-introduces the
    // symbol-throw bug `String()` avoids).
    return String(reasonValue);
  } catch { // allow-broad-catch: loom/host/session-shutdown-reason-unknown — pi-integration-contract/unknown-reason-rule.md
    return UNREADABLE;
  }
}

// The `"throw:<String(error)>"` discriminator grammar (PIC-47 / PIC-48 (d)):
// the payload is truncated to at most 256 UTF-16 code units, control characters
// are escaped, and a throwing `String(error)` falls back to `"throw:<unreadable>"`.
const THROW_PREFIX = "throw:";
const MAX_PAYLOAD_CODE_UNITS = 256;

function throwDiscriminator(error: unknown): string {
  let coerced: string;
  try {
    coerced = String(error);
  } catch { // allow-broad-catch: loom/host/session-shutdown-pinned-constant-unreadable — pi-integration-contract/unknown-reason-rule.md
    // The `"throw:"` prefix is preserved so operator dedup on `startsWith`
    // continues to bucket coercion-failure rows under the throw discriminator.
    return `${THROW_PREFIX}${UNREADABLE}`;
  }
  // Truncate first (before escaping), so the post-prefix payload is at most 256
  // UTF-16 code units regardless of escape expansion.
  const truncated = coerced.slice(0, MAX_PAYLOAD_CODE_UNITS);
  return `${THROW_PREFIX}${escapeControlCharacters(truncated)}`;
}

/**
 * Escape control characters per the pinned escape classes: `\n`/`\r`/`\t` become
 * the two-character literal escapes; every other code point in U+0000–U+001F and
 * U+007F–U+009F becomes the six-character `\uXXXX` escape with exactly four
 * lowercase zero-padded hex digits; all other characters pass through unchanged.
 */
function escapeControlCharacters(payload: string): string {
  let out = "";
  for (let i = 0; i < payload.length; i++) {
    const char = payload[i];
    const code = payload.charCodeAt(i);
    if (char === "\n") {
      out += "\\n";
    } else if (char === "\r") {
      out += "\\r";
    } else if (char === "\t") {
      out += "\\t";
    } else if (
      (code >= 0x00 && code <= 0x1f) ||
      (code >= 0x7f && code <= 0x9f)
    ) {
      out += `\\u${code.toString(16).padStart(4, "0")}`;
    } else {
      out += char;
    }
  }
  return out;
}

/** The `reason-unknown` (W) diagnostic, emitted before sub-step 1 (PIC-45). */
function reasonUnknownDiagnostic(observed: string): Diagnostic {
  return {
    severity: "warning",
    code: REASON_UNKNOWN_CODE,
    message: `session_shutdown event.reason outside closed set: ${observed}`,
    details: { observed },
  };
}

/** The `pinned-constant-unreadable` (W) diagnostic (PIC-47). */
function pinnedConstantUnreadableDiagnostic(failure: string): Diagnostic {
  return {
    severity: "warning",
    code: PINNED_CONSTANT_UNREADABLE_CODE,
    message: `session_shutdown pinned-constant read failed: ${failure}`,
    details: { failure },
  };
}
