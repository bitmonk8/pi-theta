// V9b / V9b-T — registration steps and reload-wiring seams.
//
// This module owns the load-pass and watcher-time wiring named in the V9b leaf:
//   - the `LoomRegistry` (a `Map<slashName, parsedLoom>`) and the
//     build-aside-then-publish registry swap (PIC-36);
//   - the `session_start` cross-format collision pass over the
//     `pi.getCommands()` snapshot, treated read-only-by-convention (PIC-39);
//   - the structural-change `loom-system-note` decision (PIC-37 empty-window
//     suppression / PIC-38 same-window-rename emission);
//   - the test-only `ReloadFailureInjector` failure-injection seam (registry-
//     swap and `.loom`/`.warp` re-parse arms; the settings-re-merge arm is
//     contributed by V10d against this same interface);
//   - the model-reference-matcher production wiring point: loom's own
//     exact-match resolver over `ctx.modelRegistry.getAvailable()`, injected
//     into the V6a frontmatter parser seam.
//
// V9b-T (tests-task) declares the seam shapes and stubs the behaviour-bearing
// functions so the failing tests compile and red on their own primary
// assertions. The paired V9b implementation leaf fills these in.
//
// Spec: pi-integration-contract/registration-steps.md (PIC-36/37/38/39),
// pi-integration-contract/host-interfaces-core.md (model-registry surface),
// implementation-notes.md.

import type { SlashCommandInfo } from "@earendil-works/pi-coding-agent";
import type { Diagnostic } from "../diagnostics/diagnostic";
import type { SystemNote } from "./system-note-channel";
import type {
  ModelMatchOutcome,
  ModelReferenceMatcher,
  ParseFrontmatterOptions,
  FrontmatterParseResult,
} from "../parser/frontmatter";

// --- LoomRegistry + build-aside-then-publish swap (PIC-36) ---

/** One registered loom keyed by its slash name in the `LoomRegistry`. */
export interface ParsedLoom {
  /** The slash-command name this loom registers under. */
  readonly slashName: string;
}

/**
 * The internal mutable registry (`Map<slashName, parsedLoom>`) the slash
 * handler closes over. The swap installs a staged map in a single synchronous
 * publish step; in-flight reads see the pre-swap snapshot (registration-steps.md
 * **In-flight invocation rule**).
 */
export class LoomRegistry {
  #published: Map<string, ParsedLoom>;

  constructor(initial?: Iterable<readonly [string, ParsedLoom]>) {
    this.#published = new Map(initial);
  }

  /** Look up the currently-published entry for `slashName`. */
  get(slashName: string): ParsedLoom | undefined {
    return this.#published.get(slashName);
  }

  /** The currently-published snapshot (read-only view). */
  snapshot(): ReadonlyMap<string, ParsedLoom> {
    return new Map(this.#published);
  }

  /** Install a staged map as the new published snapshot (single synchronous write). */
  publish(staged: ReadonlyMap<string, ParsedLoom>): void {
    this.#published = new Map(staged);
  }
}

/** The diagnostics-registry code a failed registry swap surfaces (PIC-36). */
export const REGISTRY_SWAP_FAILED_CODE = "loom/runtime/registry-swap-failed";

/** Construction dependencies for the registry-swap and failure-injection seams. */
export interface RegistrySwapDeps {
  /** The live registry whose entries the swap publishes. */
  readonly registry: LoomRegistry;
  /** Submit a constructed `Diagnostic` through the standard diagnostics channel. */
  readonly emitDiagnostic: (diagnostic: Diagnostic) => void;
}

/**
 * Rebuild the affected entries aside and, only after every staged step
 * succeeds, publish them atomically (PIC-36). `build` produces the staged map;
 * a throw out of it (or any staged re-parse / recompile / re-register step it
 * performs) discards the staging set, leaves the prior `LoomRegistry` snapshot
 * live, and surfaces a single `loom/runtime/registry-swap-failed` diagnostic.
 * Returns `true` when the staged map was published, `false` on a discarded
 * (failed) swap.
 */
export function rebuildAndSwap(
  changedPath: string,
  build: () => ReadonlyMap<string, ParsedLoom>,
  deps: RegistrySwapDeps,
): boolean {
  // Build aside: run every staged step before touching the live registry. A
  // throw out of any staged step (parse, AJV recompile, `pi.registerTool`)
  // discards the staging set, leaves the prior snapshot live, and surfaces one
  // `loom/runtime/registry-swap-failed` diagnostic (PIC-36). The throw shape is
  // arbitrary across the staged steps, so the catch is the spec-mandated
  // rebuild-failure trap keyed to the diagnostics-registry code it emits.
  let staged: ReadonlyMap<string, ParsedLoom>;
  try {
    staged = build();
  } catch (rebuildError: unknown) { // allow-broad-catch: loom/runtime/registry-swap-failed — pi-integration-contract/registration-steps.md
    emitRegistrySwapFailed(changedPath, rebuildError, deps);
    return false;
  }
  // Publish: single synchronous write installing the staged map.
  deps.registry.publish(staged);
  return true;
}

/**
 * Construct and emit the single `loom/runtime/registry-swap-failed` diagnostic
 * for a discarded swap (PIC-36). `message` names the failing path; `hint`
 * carries the underlying error's message (diagnostics/code-registry-runtime.md).
 */
function emitRegistrySwapFailed(
  changedPath: string,
  rebuildError: unknown,
  deps: RegistrySwapDeps,
): void {
  deps.emitDiagnostic({
    severity: "error",
    code: REGISTRY_SWAP_FAILED_CODE,
    message: `registry swap failed: ${changedPath}`,
    hint: rebuildError instanceof Error ? rebuildError.message : String(rebuildError),
  });
}

// --- Test-only reload failure-injection seam ---

/** The watcher-time reload failure-injection arms (registration-steps.md). */
export type ReloadFailureArm =
  | "registry-swap"
  | "loom-warp-reparse"
  | "settings-remerge";

/**
 * The single declaration site of the test-only failure-injection interface for
 * the whole watcher-time reload failure-injection seam. A caller supplies a
 * synthetic failure for one arm and the seam routes it onto the
 * `loom-system-note` surfacing path without standing up a live watcher. V9b
 * wires the `registry-swap` and `loom-warp-reparse` arms; V10d contributes the
 * `settings-remerge` arm against this same interface.
 */
export interface ReloadFailureInjector {
  injectReloadFailure(arm: ReloadFailureArm, error: Error): void;
}

/**
 * Construct the failure injector wired to the registry-swap / re-parse arms
 * (both surface `loom/runtime/registry-swap-failed`).
 */
export function createReloadFailureInjector(
  deps: RegistrySwapDeps,
): ReloadFailureInjector {
  return {
    injectReloadFailure(arm: ReloadFailureArm, error: Error): void {
      // V9b wires the two watcher-time arms it owns onto the registry-swap-
      // failed surfacing path: a registry-swap failure and a `.loom`/`.warp`
      // re-parse failure both surface `loom/runtime/registry-swap-failed`. The
      // `settings-remerge` arm is contributed by V10d against this interface.
      if (arm === "registry-swap" || arm === "loom-warp-reparse") {
        emitRegistrySwapFailed(`<injected:${arm}>`, error, deps);
      }
    },
  };
}

// --- session_start cross-format collision pass (PIC-39) ---

/** The loom 1.0 cross-format collision source set (registration-steps.md). */
const COLLISION_SOURCE_SET: ReadonlySet<string> = new Set([
  "prompt",
  "extension",
  "skill",
]);

/** The outcome of the collision pass: surviving and dropped pending looms. */
export interface CollisionPassResult {
  readonly survivors: readonly ParsedLoom[];
  readonly dropped: readonly ParsedLoom[];
}

/**
 * Drop each pending loom whose slash name collides with an existing command
 * whose `source` is in the collision source set. A single forward pass that
 * treats the `pi.getCommands()` snapshot as read-only by convention (PIC-39):
 * it never mutates `existingCommands`.
 */
export function dropCollidingLooms(
  pending: readonly ParsedLoom[],
  existingCommands: readonly SlashCommandInfo[],
): CollisionPassResult {
  // Read-only forward pass: collect the names of existing commands whose
  // `source` is in the collision source set, reading `existingCommands` without
  // mutating it (PIC-39 read-only-by-convention).
  const collidingNames = new Set<string>();
  for (const cmd of existingCommands) {
    if (COLLISION_SOURCE_SET.has(cmd.source)) {
      collidingNames.add(cmd.name);
    }
  }
  const survivors: ParsedLoom[] = [];
  const dropped: ParsedLoom[] = [];
  for (const loom of pending) {
    if (collidingNames.has(loom.slashName)) {
      dropped.push(loom);
    } else {
      survivors.push(loom);
    }
  }
  return { survivors, dropped };
}

// --- structural-change loom-system-note (PIC-37 / PIC-38) ---

/**
 * Decide whether a closed debounce window emits the structural-change
 * `loom-system-note`. Returns `undefined` when
 * `added.length + removed.length === 0` (empty-window suppression, PIC-37);
 * otherwise returns the note whose `content` is
 * `loom watcher: <N> file(s) added or removed; run /reload to refresh the slash command list`
 * with `display: true` and `details.structural` carrying the two arrays
 * (PIC-38).
 */
export function structuralChangeNote(
  added: readonly string[],
  removed: readonly string[],
): SystemNote | undefined {
  // Empty-window suppression (PIC-37): no resolved add/remove path → no note.
  const count = added.length + removed.length;
  if (count === 0) {
    return undefined;
  }
  // Fixed template (PIC-38 / Structural changes): only `<N>` is substituted —
  // the literal `file(s)` and trailing `/reload` clause ship verbatim. `<N>` is
  // base-10 with no separator/leading-zero/sign and equals added+removed length
  // (a same-window rename counts twice; the arrays are not deduplicated).
  return {
    content: `loom watcher: ${count} file(s) added or removed; run /reload to refresh the slash command list`,
    display: true,
    details: { structural: { added, removed } },
  };
}

// --- model-reference-matcher production wiring point ---

/**
 * The narrow `ctx.modelRegistry.getAvailable()` surface loom's exact-match
 * resolver runs over (host-interfaces-core.md#model-registry-pin). A live
 * `ModelRegistry` is structurally assignable here.
 */
export interface AvailableModel {
  /** Model identity — matched against a bare `modelId` and the `modelId` half of `provider/modelId`. */
  readonly id: string;
  /** The short provider-id form (e.g. `anthropic`) — the `provider` half compares against this. */
  readonly provider: string;
  /** The api-shaped value (e.g. `anthropic-messages`) — NOT matched against. */
  readonly api: string;
}

/** The model-enumeration surface (`ctx.modelRegistry.getAvailable()`). */
export interface ModelRegistrySurface {
  getAvailable(): readonly AvailableModel[];
}

/**
 * Construct loom's own exact-match model-reference resolver over
 * `registry.getAvailable()`: a bare `modelId` matches each model's `id`; a
 * `provider/modelId` reference matches `provider` (the short provider-id form,
 * not the api-shaped `api`) plus `id`. A bare `modelId` matching across more
 * than one provider is `"ambiguous"`; anything matching no available model is
 * `"no-match"` (binder-model-and-context.md#binder-model-parse-rule).
 */
export function createModelReferenceMatcher(
  registry: ModelRegistrySurface,
): ModelReferenceMatcher {
  return {
    resolve(reference: unknown): ModelMatchOutcome {
      // A non-string reference matches no available model (no-match).
      if (typeof reference !== "string") {
        return "no-match";
      }
      const available = registry.getAvailable();
      const slash = reference.indexOf("/");
      if (slash >= 0) {
        // `provider/modelId`: the provider half compares against the short
        // provider-id `Model<Api>.provider` (NOT the api-shaped `.api`) and the
        // modelId half against `Model<Api>.id`.
        const provider = reference.slice(0, slash);
        const modelId = reference.slice(slash + 1);
        const matches = available.filter(
          (m) => m.provider === provider && m.id === modelId,
        );
        return outcomeOf(matches.length);
      }
      // A bare `modelId` matches each model's `Model<Api>.id`; a match across
      // more than one provider is ambiguous (resolves to no model).
      const matches = available.filter((m) => m.id === reference);
      return outcomeOf(matches.length);
    },
  };
}

/** Map a match count onto the resolution outcome: 1 → resolved, >1 → ambiguous, 0 → no-match. */
function outcomeOf(count: number): ModelMatchOutcome {
  if (count === 1) {
    return "resolved";
  }
  if (count > 1) {
    return "ambiguous";
  }
  return "no-match";
}

/** A single `.loom` source to parse in the load pass. */
export interface LoadPassFile {
  /** The source file path, for located diagnostics. */
  readonly file: string;
}

/** Construction dependencies for the load-pass model-matcher wiring. */
export interface LoadPassDeps {
  /** The model registry surface the matcher is constructed over. */
  readonly modelRegistry: ModelRegistrySurface;
  /** The V6a frontmatter parser seam the matcher is injected into. */
  readonly parse: (options: ParseFrontmatterOptions) => FrontmatterParseResult;
}

/**
 * The load pass: construct the model-reference matcher ONCE over
 * `modelRegistry.getAvailable()` and inject that single instance into every
 * `parse({ file, modelMatcher })` call, so V6a's load-time
 * `loom/load/model-unresolved` resolution binds that instance (single-source-
 * of-construction, instance identity).
 */
export function loadPassParse(
  files: readonly LoadPassFile[],
  deps: LoadPassDeps,
): readonly FrontmatterParseResult[] {
  // Single source of construction: build the matcher once over
  // `modelRegistry.getAvailable()`, then inject that one instance into every
  // parse call so V6a's `loom/load/model-unresolved` resolution binds it
  // (instance identity, not equivalence-of-outcome).
  const modelMatcher = createModelReferenceMatcher(deps.modelRegistry);
  return files.map((f) => deps.parse({ file: f.file, modelMatcher }));
}
