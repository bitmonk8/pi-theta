// V9f / V9f-T — tool-registration lifetime and visibility.
//
// This module owns the prompt-mode tool-registration cache (PIC-44 cache-hit
// schema byte-equality verification + collision disambiguation), the
// active-set gating window's snapshot/restore protocol (PIC-17 install vector,
// PIC-8 restore-failure protocol, PIC-19 snapshot/swap-install-failure
// protocol), and the materialised `ToolDefinition.label` derivation
// (extension-bootstrap-and-per-theta.md §Per-theta registration — a GOV-22
// un-anchored residue), per
// pi-integration-contract/tool-registration-lifetime.md.
//
// `withActiveSetGate` implements the full PIC-17/PIC-8/PIC-19 protocol
// (snapshot / swap-install / run body / single-re-attempt restore, with a
// setup-side throw routed to `theta/runtime/internal-error`) and is the ONE
// gating window every production caller threads its computed `installVector`
// into (bug 0372 §Fix) — the three shipped snapshot/restore windows
// (the producer query turn, the `driveStreamedUserTurn` follow-up, and the
// prompt→prompt cross-mode `invoke` hop) all call it rather than restoring
// bare. `deriveToolLabel` derives the materialised `ToolDefinition.label`;
// `registerToolInCache` implements the PIC-44 registration cache.

import type { Diagnostic } from "../diagnostics/diagnostic";
import { renderUnderlyingError } from "../diagnostics/placeholder";

// Runtime diagnostics-registry codes this module emits
// (diagnostics/code-registry-runtime.md).
const ACTIVE_SET_RESTORE_FAILED = "theta/runtime/active-set-restore-failed";
const REGISTRATION_CACHE_COLLISION = "theta/runtime/registration-cache-collision";

/** Coerce a caught (post-probe SDK-shape-drift) throw to an `Error`. */
function asError(thrown: unknown): Error {
  return thrown instanceof Error ? thrown : new Error(renderUnderlyingError(thrown));
}

// --- ToolDefinition.label derivation ---------------------------------------

/**
 * Input to the materialised `ToolDefinition.label` derivation
 * (extension-bootstrap-and-per-theta.md §Per-theta registration).
 *
 * `theta-file` carries the theta file's basename (without the `.theta` extension);
 * the label is that basename with interior hyphens preserved and only the
 * leading character capitalised (`code-review` → `"Code-review"`).
 * `typed-query-respond` synthesises the one-shot tool whose label is the fixed
 * literal `"Theta typed-query response"`.
 */
export type ToolLabelInput =
  | { readonly kind: "theta-file"; readonly basename: string }
  | { readonly kind: "typed-query-respond" };

/**
 * Derive the materialised `ToolDefinition.label`.
 *
 * The label rule (fixed `"Theta typed-query response"` literal for the respond
 * kind; leading-capitalised basename with interior hyphens preserved otherwise)
 * is implemented below and locked by the label cases in
 * `tests/tool-registration-lifetime.test.ts`.
 */
export function deriveToolLabel(input: ToolLabelInput): string {
  if (input.kind === "typed-query-respond") {
    return "Theta typed-query response";
  }
  // Interior hyphens preserved; only the leading character capitalised
  // (`code-review` → `Code-review`).
  const { basename } = input;
  return basename.charAt(0).toUpperCase() + basename.slice(1);
}

// --- Active-set gating window (PIC-17 / PIC-8 / PIC-19) ---------------------

/** The narrow `pi` subset the active-set gate touches. */
export interface ActiveSetPi {
  /** Step-1 snapshot of the user session's active tool-name list. */
  getActiveTools(): string[];
  /** Step-2 swap-install / step-4 restore — name lists only. */
  setActiveTools(names: string[]): void;
}

/**
 * The PIC-8(c) advisory note shape: informational
 * (pi-integration-contract/runtime-event-channel.md "Informational notes
 * carry no `details`"), so it carries no `details` field — the structured
 * half of the failure travels separately on the sibling `emitDiagnostic` call.
 */
export interface ActiveSetAdvisoryNote {
  readonly content: string;
  readonly display: boolean;
}

/** Construction dependencies for the active-set gating window. */
export interface ActiveSetGateDeps {
  /** The `pi.getActiveTools` / `pi.setActiveTools` snapshot/restore surface. */
  readonly pi: ActiveSetPi;
  /** The bare theta name substituted into `/<name>` in the PIC-8 note template. */
  readonly thetaName: string;
  /**
   * The exact step-2 install vector: `[...thetaCallableSetNames, respondToolName?]`.
   * The step-1 snapshot is deliberately NOT unioned into this set, so the
   * "ambient tools are deliberately not inherited" invariant holds.
   */
  readonly installVector: readonly string[];
  /** Submit a constructed `Diagnostic` through the standard diagnostics channel. */
  readonly emitDiagnostic: (diagnostic: Diagnostic) => void;
  /** Deliver a `theta-system-note` (the PIC-8 `display: true` advisory). */
  readonly emitSystemNote: (note: ActiveSetAdvisoryNote) => void;
  /**
   * Route a setup-side (step-1/step-2) failure onto the
   * `theta/runtime/internal-error` runtime-defect channel (PIC-19); the routing
   * owner is capability-probe's Post-probe SDK-shape drift.
   */
  readonly routeInternalError: (error: Error) => void;
}

/**
 * Gate query visibility via the active-set: snapshot (step 1), swap-install the
 * `installVector` (step 2), run `body` (step 3), restore the snapshot (step 4)
 * with the PIC-8 single-re-attempt protocol, routing step-1/step-2 setup
 * failures to `internal-error` per PIC-19. Propagates the original body
 * error/result unmasked. Every production shipped snapshot/restore window
 * calls this function (bug 0372 §Fix) — there is exactly one implementation of
 * the protocol.
 */
export async function withActiveSetGate<T>(
  deps: ActiveSetGateDeps,
  body: () => Promise<T>,
): Promise<T> {
  const { pi, installVector } = deps;

  // Step 1 — snapshot the user session's active set. A throw here is a
  // setup-side (PIC-19) failure: no active-set change has committed, so no
  // restore is owed; route it to `theta/runtime/internal-error` and propagate.
  let snapshot: string[];
  try {
    snapshot = pi.getActiveTools();
  } catch (snapshotError: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
    deps.routeInternalError(asError(snapshotError));
    throw snapshotError;
  }

  // Step 2 — swap-install the exact install vector (the snapshot is held only
  // for the step-4 restore and is deliberately NOT unioned in). A throw here is
  // also setup-side (PIC-19): the install left uncommitted, no restore is owed.
  try {
    pi.setActiveTools([...installVector]);
  } catch (installError: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
    deps.routeInternalError(asError(installError));
    throw installError;
  }

  // Step 3 — issue the query. Step 4 restore runs in `finally` so cancellation,
  // panic, and provider exceptions all preserve the invariant; the restore
  // never masks the inner error the `finally` is protecting (PIC-8(d)).
  try {
    return await body();
  } finally {
    restoreActiveSet(deps, snapshot);
  }
}

/**
 * Step-4 restore with the PIC-8 single-re-attempt protocol: restore the
 * snapshot; on a throw, re-attempt exactly once with the same snapshot; on a
 * second failure, emit `theta/runtime/active-set-restore-failed` (E) plus a
 * `display: true` advisory note. The restore failure is swallowed here so the
 * original error the `finally` protects propagates unmasked.
 */
function restoreActiveSet(deps: ActiveSetGateDeps, snapshot: string[]): void {
  try {
    deps.pi.setActiveTools([...snapshot]);
    return;
  } catch (firstError: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
    void firstError;
  }

  // PIC-8(a): re-attempt the restore exactly once with the same snapshot. The
  // retry MUST NOT chain back into `pi.setActiveTools` beyond this single try.
  try {
    deps.pi.setActiveTools([...snapshot]);
    return;
  } catch (secondError: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
    // PIC-8(b): emit `theta/runtime/active-set-restore-failed` (E). `message`
    // carries the underlying restore error; `hint` lists the snapshot tool
    // names so an operator can manually restore via `/tools`.
    deps.emitDiagnostic({
      severity: "error",
      code: ACTIVE_SET_RESTORE_FAILED,
      message: `failed to restore tool active-set after /${deps.thetaName}: ${renderUnderlyingError(secondError)}`,
      hint: snapshot.join(", "),
    });
    // PIC-8(c): a `display: true` note carrying the verbatim template — only
    // `<name>` is substituted; every other character ships verbatim. The
    // note is informational and carries no `details` — the structured half
    // (code, severity, message, hint) already travels on the `emitDiagnostic`
    // call above, so no `details` key is fabricated here.
    deps.emitSystemNote({
      content: `theta: failed to restore tool active-set after /${deps.thetaName}; the user session may have unexpected tools active. Run /reload to reset.`,
      display: true,
    });
  }
}

// --- Prompt-mode registration cache (PIC-44) -------------------------------

/** A lowered tool's content-addressed registration-cache entry. */
export type RegistrationEntry =
  | {
      readonly kind: "callee";
      /** Schema slug of the lowered `parameters` (64-bit SHA-256 truncation). */
      readonly slug: string;
      /** Canonical-form schema bytes, stored for the byte-equality check. */
      readonly canonicalFormBytes: string;
      /** The post-rename callee name spliced into the content-addressed name. */
      readonly postRenameName: string;
    }
  | {
      readonly kind: "respond";
      readonly slug: string;
      readonly canonicalFormBytes: string;
    };

/**
 * The extension-scoped registration cache: `Map<schemaSlug, …>`. Stores the
 * canonical-form bytes alongside the registered name so the PIC-44 equality
 * check is a byte comparison, not a re-serialisation, and a per-slug counter
 * for collision disambiguation (`n` starts at 2 on the first collision).
 */
export interface RegistrationCacheRecord {
  readonly registeredName: string;
  readonly canonicalFormBytes: string;
  /** Next disambiguation counter for this slug (starts at 2). */
  nextCounter: number;
}

export type RegistrationCache = Map<string, RegistrationCacheRecord>;

/** Construction dependencies for the prompt-mode registration cache. */
export interface RegistrationCacheDeps {
  /** The `pi.registerTool` mutation (the only registry mutation Pi exposes). */
  readonly registerTool: (name: string) => void;
  /** Submit a constructed `Diagnostic` (the PIC-44 collision diagnostic). */
  readonly emitDiagnostic: (diagnostic: Diagnostic) => void;
}

/** Construct an empty registration cache. */
export function createRegistrationCache(): RegistrationCache {
  return new Map();
}

/**
 * Register a lowered tool through the prompt-mode cache, returning the
 * registered name. On first encounter of a unique slug, registers once with the
 * content-addressed name. On a cache hit, verifies byte-equality of the cached
 * canonical-form bytes against the new entry's (PIC-44): byte-equal reuses the
 * registration; a byte-mismatch fires `theta/runtime/registration-cache-collision`,
 * refuses to dedup, and registers under a disambiguated per-slug-counter name.
 *
 * This cache is implemented below and locked by the cache-collision / reuse
 * cases in `tests/tool-registration-lifetime.test.ts`.
 */
export function registerToolInCache(
  cache: RegistrationCache,
  entry: RegistrationEntry,
  deps: RegistrationCacheDeps,
): string {
  const baseName = contentAddressedName(entry);
  const existing = cache.get(entry.slug);

  // First encounter of a unique slug: register once under the content-addressed
  // name and store the canonical-form bytes alongside it for the PIC-44
  // byte-equality check on later hits.
  if (existing === undefined) {
    cache.set(entry.slug, {
      registeredName: baseName,
      canonicalFormBytes: entry.canonicalFormBytes,
      nextCounter: 2,
    });
    deps.registerTool(baseName);
    return baseName;
  }

  // Cache hit (PIC-44): verify byte-equality of the cached canonical-form bytes
  // against the new entry's before reusing the registration. Byte-equal reuses
  // the existing registration with no re-register and no collision.
  if (existing.canonicalFormBytes === entry.canonicalFormBytes) {
    return existing.registeredName;
  }

  // Byte-mismatch: a slug collision between two distinct lowered schemas. Fire
  // `theta/runtime/registration-cache-collision`, refuse to dedup, and register
  // under a disambiguated per-slug-counter name (`n` starts at 2).
  const n = existing.nextCounter;
  existing.nextCounter = n + 1;
  const disambiguated = contentAddressedName(entry, n);
  deps.emitDiagnostic({
    severity: "error",
    code: REGISTRATION_CACHE_COLLISION,
    message: `tool-registration cache collision on slug ${entry.slug}: ${existing.registeredName} vs ${disambiguated}`,
    // Both lowered-schema canonical-form bytes are carried in full in `hint`,
    // not in the byte-exact Message template.
    hint: `cached: ${existing.canonicalFormBytes}\nnew: ${entry.canonicalFormBytes}`,
  });
  deps.registerTool(disambiguated);
  return disambiguated;
}

/**
 * The content-addressed registration name for a lowered tool. With no counter,
 * the base name; with a per-slug disambiguation counter `n`, the collision form
 * (`__theta_callee_<slug>_<n>__<post-rename-name>` / `__theta_respond_<slug>_<n>`).
 */
function contentAddressedName(entry: RegistrationEntry, n?: number): string {
  const counter = n === undefined ? "" : `_${n}`;
  return entry.kind === "callee"
    ? `__theta_callee_${entry.slug}${counter}__${entry.postRenameName}`
    : `__theta_respond_${entry.slug}${counter}`;
}
