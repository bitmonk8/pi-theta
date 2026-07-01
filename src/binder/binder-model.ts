// V11a / V11a-T — Binder-model resolution and the strict-capability probe.
//
// Resolved at loom-load time from a two-step chain (binder-model-and-context.md
// §"Binder model"): the `bind_model:` frontmatter field, then the loom-extension
// setting `looms.binderModel`. There is NO further fallback — the loom's own
// `model:` is never consulted. When neither source resolves and the loom is not
// bypass-eligible, the loom fails to load with `loom/load/binder-model-unresolved`.
//
// The binder-model value is a single free-form string resolved through loom's
// own exact-match resolver over `ctx.modelRegistry.getAvailable()` — the SAME
// shared `ModelReferenceMatcher` instance V6a's `model:` resolution binds, so
// the two paths cannot diverge on the "reference matches no available model"
// condition (host-interfaces-core.md#model-registry-pin). On a resolved model
// the runtime then probes the concrete `Model<Api>` for a duck-typed
// `strictCapable` field, a three-valued check:
//   - `true`      → admit the model (no diagnostic);
//   - `false`     → `loom/load/binder-model-not-strict-capable` (E), refuse;
//   - `undefined` → `loom/load/binder-model-strict-capability-unknown` (W), admit.
//
// A hot reload that recovers a previously-unresolved binder model emits a single
// consolidated informational recovery `loom-system-note` (no `loom/load/*` code)
// (binder-model-and-context.md#binder-model-hot-reload). Per BNDR-11 a
// `looms.binderModel`-only settings edit does NOT re-run resolution or the probe
// for any already-loaded loom — each retains its previously-resolved handle
// until its next load.
//
// Spec: binder/binder-model-and-context.md (§Binder model,
// #strict-capability-requirement, #binder-model-parse-rule, #binder-model-hot-reload,
// BNDR-11), binder.md; diagnostic codes/messages from
// diagnostics/code-registry-load.md.
//
// V11a-T (tests-task) declares these seams and stubs the behaviour-bearing
// functions with inert results so the failing tests compile and red on their own
// primary assertions (the resolution, probe, chain-fallback, recovery-note, and
// BNDR-11 behaviours are absent). The paired V11a implementation leaf fills them
// in.

import type { Diagnostic } from "../diagnostics/diagnostic";
import type {
  ModelReferenceMatcher,
  ParseFrontmatterOptions,
  FrontmatterParseResult,
} from "../parser/frontmatter";
import type { ModelRegistrySurface } from "../extension/reload-wiring";
import type { LoomSettings } from "../discovery/settings";
import { buildRecoveryNote } from "../runtime/runtime-event-channel";
import type { SystemNote } from "../extension/system-note-channel";

// --- diagnostic code + message constants (registry-anchored) ---------------

/** The load-phase code emitted when no binder-model reference resolves. */
export const BINDER_MODEL_UNRESOLVED_CODE = "loom/load/binder-model-unresolved";
/** The load-phase code emitted when the probed model is explicitly not strict-capable. */
export const BINDER_MODEL_NOT_STRICT_CAPABLE_CODE =
  "loom/load/binder-model-not-strict-capable";
/** The load-phase warning code emitted when the strict-capability indicator is absent. */
export const BINDER_MODEL_STRICT_CAPABILITY_UNKNOWN_CODE =
  "loom/load/binder-model-strict-capability-unknown";

/**
 * The stable, location-less message the `loom/load/binder-model-unresolved`
 * diagnostic carries, sourced verbatim from the *Message* column of the load
 * diagnostics registry (diagnostics/code-registry-load.md). Tests source the
 * expected string from the registry rather than this constant, per the
 * *Diagnostic message anchors* rule.
 */
export const BINDER_MODEL_UNRESOLVED_MESSAGE =
  "binder model unresolved: set 'bind_model:' in frontmatter or 'looms.binderModel' in settings";

/**
 * The `loom/load/binder-model-not-strict-capable` message template. `<model>`
 * substitutes the resolved binder-model reference.
 */
export function binderModelNotStrictCapableMessage(model: string): string {
  return `binder model '${model}' is not flagged as strict-structured-output capable`;
}

/**
 * The `loom/load/binder-model-strict-capability-unknown` message template.
 * `<model>` substitutes the resolved binder-model reference.
 */
export function binderModelStrictCapabilityUnknownMessage(model: string): string {
  return `binder model '${model}' strict-capability flag unavailable; load-time check degraded to best-effort`;
}

// --- strict-capability probe surface ---------------------------------------

/**
 * The duck-typed strict-capability probe target
 * (binder-model-and-context.md#strict-capability-requirement): the runtime reads
 * `(model as { strictCapable?: boolean }).strictCapable`. Under the loom 1.0
 * Pi-SDK pin the field is absent (`undefined`), so production is the universal-W
 * branch.
 */
export interface StrictCapableProbe {
  readonly strictCapable?: boolean;
}

// --- single-loom binder-model resolution ------------------------------------

/** Inputs to binder-model resolution for a single loom load. */
export interface BinderModelResolutionInput {
  /** The source file path, for located diagnostics. */
  readonly file: string;
  /** The frontmatter `bind_model:` reference (chain step 1), when present. */
  readonly bindModel?: string;
  /** The merged `looms.binderModel` setting (chain step 2), when present. */
  readonly settingsBinderModel?: string;
  /**
   * Bypass-eligible looms (no-params / single-string bypass) never call the
   * binder, so they skip both resolution and the probe entirely.
   */
  readonly bypassEligible: boolean;
  /**
   * The shared exact-match model-reference matcher — the SAME instance V6a's
   * `model:` resolution binds (single-source-of-construction, instance identity).
   */
  readonly matcher: ModelReferenceMatcher;
  /**
   * Probe the concrete resolved `Model<Api>` for the duck-typed `strictCapable`
   * field. Returns `undefined` when the reference resolves to no model (the probe
   * is short-circuited by the caller in that case).
   */
  readonly probeStrictCapable: (reference: string) => StrictCapableProbe | undefined;
}

/** The outcome of resolving a single loom's binder model. */
export interface BinderModelResolution {
  /**
   * Whether the loom's binder model resolved (and, when resolved, passed or
   * warned through the strict-capability probe). `false` when the chain resolves
   * to no model, or when the probe observed `false`.
   */
  readonly resolved: boolean;
  /** The resolved binder-model reference, present iff `resolved` is `true`. */
  readonly binderModel?: string;
  /** Every diagnostic raised during resolution + probe, in order. */
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Resolve a single loom's binder model via the two-step chain
 * (`bind_model:` → `looms.binderModel`) over the shared matcher, then run the
 * three-valued `strictCapable` probe. Bypass-eligible looms skip both checks.
 */
export function resolveBinderModel(
  input: BinderModelResolutionInput,
): BinderModelResolution {
  // V11a-T stub: inert. The paired V11a implementation performs the two-step
  // resolution, the short-circuited strict-capability probe, and the diagnostic
  // emission. Returning an unresolved, diagnostic-free result reds each behaviour
  // test on its own primary assertion (absent code / absent resolution) rather
  // than on a harness throw.
  void input;
  return { resolved: false, diagnostics: [] };
}

// --- hot-reload recovery note -----------------------------------------------

/** One previously binder-model-unresolved loom, re-evaluated on a settings change. */
export interface PreviouslyUnresolvedLoom {
  /** The loom's final derived slash name (no leading `/`). */
  readonly slashName: string;
  /** The re-evaluation inputs for this loom under the changed setting. */
  readonly resolution: BinderModelResolutionInput;
}

/**
 * Compute the consolidated binder-model hot-reload recovery `loom-system-note`
 * (binder-model-and-context.md#binder-model-hot-reload). Re-runs binder-model
 * resolution alone (no other load-pass step) for each previously-unresolved
 * loom; those that now resolve are listed in `recovery.looms` in ascending
 * Unicode code-point order. Returns `null` when none re-resolve (the note MUST
 * NOT be emitted when `recovery.looms.length === 0`).
 */
export function computeBinderModelRecoveryNote(
  previouslyUnresolved: readonly PreviouslyUnresolvedLoom[],
): SystemNote | null {
  // V11a-T stub: inert. The paired V11a implementation re-runs resolution and,
  // when at least one loom re-resolves, builds the verbatim recovery note via
  // `buildRecoveryNote`. Returning `null` unconditionally reds the recovery test
  // on its primary assertion (a note is expected) rather than on a harness throw.
  void previouslyUnresolved;
  void buildRecoveryNote;
  return null;
}

/**
 * Render the consolidated recovery-note `content` from the ascending-ordered
 * recovered slash names, per the fixed substitution rule
 * (binder-model-and-context.md#binder-model-hot-reload): only `<N>` (base-10
 * `looms.length`) and `<names>` (each prefixed `/`, comma-and-space joined) are
 * substituted; every other character — including the literal `loom(s)` token,
 * the literal `looms.binderModel` key, and the literal `/reload` command — ships
 * verbatim.
 */
export function renderBinderModelRecoveryContent(
  looms: readonly string[],
): string {
  const n = looms.length;
  const names = looms.map((name) => `/${name}`).join(", ");
  return `loom watcher: looms.binderModel changed; ${n} previously-failed loom(s) now resolve a binder model; run /reload to retry: ${names}`;
}

// --- BNDR-11: settings-only edit reconciliation -----------------------------

/** An already-loaded loom carrying its previously-resolved binder-model handle. */
export interface LoadedLoom {
  /** The loom's slash name. */
  readonly slashName: string;
  /**
   * The previously-resolved binder-model handle (the resolved reference), or
   * `undefined` for a loom whose load did not resolve a binder model.
   */
  readonly binderModelHandle: string | undefined;
}

/** Dependencies for a `looms.binderModel`-only settings-edit reconciliation. */
export interface BinderModelSettingsEditDeps {
  /**
   * The binder-model resolver. Per BNDR-11 this MUST NOT be invoked for any
   * already-loaded loom on a settings-only edit; it is present so a test can
   * assert it was never called.
   */
  readonly resolve: (input: BinderModelResolutionInput) => BinderModelResolution;
}

/**
 * Reconcile a `looms.binderModel`-only settings edit against the already-loaded
 * looms (BNDR-11). The edit MUST NOT re-run binder-model resolution or the
 * `strictCapable` probe for any already-loaded loom — each retains its
 * previously-resolved binder-model handle until its next load. Returns the
 * unchanged loaded-loom set.
 */
export function reconcileBinderModelSettingsEdit(
  loadedLooms: readonly LoadedLoom[],
  deps: BinderModelSettingsEditDeps,
): readonly LoadedLoom[] {
  // V11a-T stub: inert. The paired V11a implementation returns the loaded looms
  // untouched WITHOUT invoking `deps.resolve` (BNDR-11 suppression). Returning an
  // empty set reds the retention assertion on its primary check (handles are not
  // retained) rather than on a harness throw.
  void loadedLooms;
  void deps;
  return [];
}

// --- load-pass cross-resolution wiring (single shared matcher) --------------

/** Construction dependencies for the load-pass binder-model resolution wiring. */
export interface BinderModelLoadPassDeps {
  /** The model registry surface the single shared matcher is constructed over. */
  readonly modelRegistry: ModelRegistrySurface;
  /** The V6a frontmatter parser seam (its `model:` resolution binds the matcher). */
  readonly parse: (options: ParseFrontmatterOptions) => FrontmatterParseResult;
  /** The binder-model resolver (its resolution binds the SAME matcher instance). */
  readonly resolveBinderModel: (
    input: BinderModelResolutionInput,
  ) => BinderModelResolution;
  /** The merged loom-extension settings (supplies `looms.binderModel`). */
  readonly settings: LoomSettings;
  /** The strict-capability probe over the resolved concrete model. */
  readonly probeStrictCapable: (reference: string) => StrictCapableProbe | undefined;
}

/** One `.loom` file processed in the binder-model load pass. */
export interface BinderModelLoadPassFile {
  /** The source file path, for located diagnostics. */
  readonly file: string;
  /** The loom's frontmatter `bind_model:` reference, when present. */
  readonly bindModel?: string;
  /** Whether the loom is bypass-eligible. */
  readonly bypassEligible: boolean;
}

/** The per-file result of the binder-model load pass. */
export interface BinderModelLoadPassResult {
  readonly file: string;
  readonly parse: FrontmatterParseResult;
  readonly binderModel: BinderModelResolution;
}

/**
 * The load pass: construct the model-reference matcher ONCE over
 * `modelRegistry.getAvailable()` and thread that single instance into BOTH V6a's
 * `parse({ modelMatcher })` (the `model:` resolution) and each loom's
 * `resolveBinderModel({ matcher })` (the binder-model resolution), so the two
 * resolution paths bind the same instance (single-source-of-construction,
 * instance identity) and cannot diverge on the "reference matches no available
 * model" condition.
 */
export function loadPassResolveBinderModels(
  files: readonly BinderModelLoadPassFile[],
  deps: BinderModelLoadPassDeps,
): readonly BinderModelLoadPassResult[] {
  // V11a-T stub: inert. The paired V11a implementation constructs the matcher
  // once via `createModelReferenceMatcher(deps.modelRegistry)` and injects that
  // one instance into every `parse` and `resolveBinderModel` call. Returning an
  // empty set (no `parse` / `resolveBinderModel` calls made) reds the instance-
  // identity test on its primary assertion (the shared matcher never reaches
  // either path) rather than on a harness throw.
  void files;
  void deps;
  return [];
}
