// V9b / V9b-T — registration steps and reload-wiring seams.
//
// This module owns the load-pass and watcher-time wiring named in the V9b leaf:
//   - the `ThetaRegistry` (a `Map<slashName, parsedTheta>`) and the
//     build-aside-then-publish registry swap (PIC-36);
//   - the `session_start` cross-format collision pass over the
//     `pi.getCommands()` snapshot, treated read-only-by-convention (PIC-39);
//   - the structural-change `theta-system-note` decision (PIC-37 empty-window
//     suppression / PIC-38 same-window-rename emission);
//   - the test-only `ReloadFailureInjector` failure-injection seam (registry-
//     swap and `.theta`/`.thetalib` re-parse arms; the settings-re-merge arm is
//     contributed by V10d against this same interface);
//   - the model-reference-matcher production wiring point: theta's own
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

import type {
  SlashCommandInfo,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import type { Diagnostic } from "../diagnostics/diagnostic";
import type { SystemNote } from "./system-note-channel";
import type { ThetaBody } from "../parser/theta-document";
import type { CallableSetSnapshot } from "../parser/callable-set";
import type { MaterializedImport } from "../runtime/lexical-environment";
import type {
  ModelMatchOutcome,
  ModelReferenceMatcher,
  ParseFrontmatterOptions,
  FrontmatterParseResult,
  ParsedFrontmatter,
} from "../parser/frontmatter";

// --- ThetaRegistry + build-aside-then-publish swap (PIC-36) ---

/**
 * One registered theta keyed by its slash name in the `ThetaRegistry`.
 *
 * `V19e` widens this seam from the original `{ slashName }` to carry the `V19a`
 * parsed frontmatter + whole-file body AST plus the per-theta runnable `run` the
 * `V19e` composition producer builds. This is the Class-2 cross-leaf seam
 * `H8a`'s `session_start` registration consumes: it reads `slashName` + `run`
 * to register the slash command and retains `frontmatter` / `body` for the
 * reload rebuild pass.
 */
export interface ParsedTheta {
  /** The slash-command name this theta registers under. */
  readonly slashName: string;
  /**
   * The theta's source file path, when discovered from disk. Carried so the
   * `H8b` invoke resolver can resolve a relative `.theta`-callable / `invoke`
   * path against the calling theta's directory. Absent for in-memory fixtures.
   */
  readonly sourcePath?: string;
  /** The `V19a` parsed frontmatter (`mode:` / `model:` / `tool_loop` / …). */
  readonly frontmatter: ParsedFrontmatter;
  /** The `V19a` whole-file body statement-list AST the interpreter walks. */
  readonly body: ThetaBody;
  /**
   * The `.thetalib` symbols this theta imports, resolved + materialised at load time
   * (imports.md §Visibility): an imported `fn` becomes callable and an imported
   * `schema` / `enum` registers. Absent when the theta declares no `import`.
   */
  readonly imports?: readonly MaterializedImport[];
  /**
   * The frozen `tools:` callable-set resolution snapshot resolved at load time
   * (`resolveCallableSet`), threaded onto the runnable theta so the runtime
   * enforces the per-theta callable set: a code-driven `<name>(...)` call
   * dispatches only through a held reference in this snapshot, and prompt-mode
   * query turns install exactly this set's underlying Pi-tool names as the
   * model's active tools. Absent → the runtime falls back to the producer-wide
   * resolver (in-memory fixtures) rather than the frozen set.
   */
  readonly callableSet?: CallableSetSnapshot;
  /**
   * The LAUNCHED ROOT callee's own transitive-closure content hash, captured
   * at load (root `.theta` + every `.thetalib` it transitively
   * imports/re-exports), keyed under the child-derivable name
   * (`deriveCallableName`) so the subagent launch marshals it in the same
   * callable-hash map as the `tools:` entries and the child refuses the
   * invocation when its own re-read of the root diverges
   * (subagent.md #subagent-theta-callable-hash). Captured for EVERY theta with
   * a readable on-disk source — ANY theta can be launched as a child root, a
   * subagent-mode theta by slash/`invoke(...)`, or a prompt-mode theta when a
   * subagent caller invokes it — but marshalled ONLY on the subagent-launch
   * path. The `.thetalib`s reached via the root's callable-set `.theta`
   * ENTRIES are covered by those entries' own per-entry `closureHash`, not
   * folded in here.
   */
  readonly rootClosureHash?: { readonly name: string; readonly hash: string };
  /**
   * The binder-model reference resolved at load time from the two-step chain
   * (`bind_model:` → `theta.binderModel`) via `resolveBinderModel`
   * (binder-model-and-context.md §"Binder model"). Present for a registered
   * non-bypass theta whose binder model resolved (a non-bypass theta with no
   * resolvable binder model fails to load and never reaches here); absent for a
   * bypass-eligible theta (no-params / single-string), which never calls the
   * binder. THIRD CASE — absent for the marked root theta of a spawned subagent
   * child, which IS a registered non-bypass theta that reaches here with no
   * binder model: `runComposePass` (`production-composition.ts`) skips
   * resolution for it under the subagent-root regime
   * (binder-model-and-context.md §"Binder model", the subagent-root exemption),
   * because its dispatch never reaches the binder at all — the slash `run` in
   * `theta-composition-producer.ts` gates `driveSubagentRootRegime` on
   * `isSubagentRootFor` ahead of `runBinder`. The runtime binder dispatch
   * resolves this reference to a concrete `Model<Api>` via the model registry
   * and drives the binder OFF-session against it.
   */
  readonly binderModel?: string;
  /**
   * The per-theta runnable the `V19e` composition producer composes: it runs the
   * binder (when applicable) and then drives `V19d`'s effectful executor against
   * the mode's conversation. `H8a`'s `session_start` handler registers this as
   * the slash-command `handler`.
   */
  readonly run: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
}

// --- drain-state contract types (drain-state-contract.md) ---

/**
 * The single-literal `drainStateTag` value set the `ThetaRegistry` maintains.
 * The unset runtime state (`undefined`) is an implementation-side artefact of
 * the **Per-step isolation** swallow rule rather than a second literal value
 * (drain-state-contract.md *Fields* (2)).
 */
export type DrainStateTag = "shutting-down";

/**
 * The snapshot `ThetaRegistry.readDrainState()` returns — the two drain-state
 * fields as a tuple. The public key is the shorter `tag`; the internal field is
 * `drainStateTag` (drain-state-contract.md *Methods*).
 */
export interface DrainStateSnapshot {
  readonly drained: boolean;
  readonly tag: DrainStateTag | undefined;
}

// --- session-swap fail-fast tripwire (V9r; session-only-degraded-state.md) ---

/**
 * The closed session-only `event.reason` half of the `session_shutdown`
 * partition (`{"new","resume","fork"}`, host-prerequisites clause (d)) — the
 * reasons that arm the session-swap fail-fast tripwire. `V9r` owns the arming
 * predicate; the reason literal that armed the tripwire is carried on the
 * `ThetaRegistry` so the trip-site diagnostic can report it.
 */
export type SessionOnlyReason = "new" | "resume" | "fork";

/**
 * The private per-extension-instance tripwire snapshot
 * `ThetaRegistry.readSessionSwapTornDown()` returns (session-only-degraded-state.md
 * *Session-swap fail-fast tripwire*). This is NOT part of the public
 * `readDrainState` surface — it is neither drain-state field and adds no
 * `readDrainState` arm.
 */
export interface SessionSwapTripwireState {
  /** `true` once a session-only `session_shutdown` teardown armed the tripwire. */
  readonly armed: boolean;
  /** The session-only reason that armed it, or `undefined` while unarmed. */
  readonly reason: SessionOnlyReason | undefined;
}

/**
 * The internal mutable registry (`Map<slashName, parsedTheta>`) the slash
 * handler closes over. The swap installs a staged map in a single synchronous
 * publish step; in-flight reads see the pre-swap snapshot (registration-steps.md
 * **In-flight invocation rule**).
 */
export class ThetaRegistry {
  #published: Map<string, ParsedTheta>;

  constructor(initial?: Iterable<readonly [string, ParsedTheta]>) {
    this.#published = new Map(initial);
  }

  /** Look up the currently-published entry for `slashName`. */
  get(slashName: string): ParsedTheta | undefined {
    return this.#published.get(slashName);
  }

  /** The currently-published snapshot (read-only view). */
  snapshot(): ReadonlyMap<string, ParsedTheta> {
    return new Map(this.#published);
  }

  /** Install a staged map as the new published snapshot (single synchronous write). */
  publish(staged: ReadonlyMap<string, ParsedTheta>): void {
    this.#published = new Map(staged);
  }

  // --- drain-state contract (PIC-29/30/31/32, drain-state-contract.md) ---
  //
  // The `ThetaRegistry` carries exactly two drain-related fields — a boolean
  // `drained` flag and the `drainStateTag` field — mediated through the closed
  // three-method call surface below; no third boolean drain-state field and no
  // fourth drain-state method are added (PIC-30, *Non-normative editorial
  // convention*). V9m-T declares the surface and the two backing fields; the
  // paired V9m implementation fills in the two writers. `readDrainState` is
  // the single read API the slash handler and the `session_shutdown` handler
  // consult.

  /** The drain flag, `false` at factory construction; flipped once by `drain()`. */
  #drained = false;
  /** The drain-state tag, `undefined` at factory construction. */
  #drainStateTag: DrainStateTag | undefined = undefined;

  // --- session-swap fail-fast tripwire (V9r) ---
  //
  // A private per-extension-instance boolean the `session_shutdown` handler
  // arms after a session-only teardown, plus the armed reason for the trip-site
  // diagnostic. NOT part of the public `readDrainState` snapshot surface (it is
  // neither drain-state field and adds no `readDrainState` arm). The writer and
  // reader are trivial field accessors (like `drain`/`readDrainState`); the
  // behaviour under test in `V9r` is the arming *decision* (only on session-only
  // reasons, from the teardown handler) and the trip-site guard, both owned by
  // `session-swap-tripwire.ts`.
  /** The tripwire flag, `false` at factory construction; armed idempotently. */
  #sessionSwapTornDown = false;
  /** The session-only reason that armed the tripwire, `undefined` while unarmed. */
  #sessionSwapReason: SessionOnlyReason | undefined = undefined;

  /**
   * `ThetaRegistry.drain(): void` — sets `drained = true` (PIC-32).
   *
   * V9m-T stub: a no-op leaving the field at its factory value, so the PIC-32
   * test reds on its primary assertion (the paired V9m sets the flag).
   */
  drain(): void {
    this.#drained = true;
  }

  /**
   * `ThetaRegistry.initDrainStateTag(): void` — sets `drainStateTag =
   * "shutting-down"` iff `drainStateTag === undefined` (a no-op once the tag is
   * set).
   *
   * V9m-T stub: a no-op (the paired V9m sets the tag).
   */
  initDrainStateTag(): void {
    if (this.#drainStateTag === undefined) {
      this.#drainStateTag = "shutting-down";
    }
  }

  /**
   * `ThetaRegistry.armSessionSwapTornDown(reason): void` — sets
   * `sessionSwapTornDown = true` and records the arming session-only reason,
   * written idempotently so a permitted multi-`session_shutdown` delivery to one
   * instance re-arms harmlessly (host-prerequisites clause (b)). A trivial field
   * writer (the arming *decision* lives in `session-swap-tripwire.ts`).
   */
  armSessionSwapTornDown(reason: SessionOnlyReason): void {
    this.#sessionSwapTornDown = true;
    this.#sessionSwapReason = reason;
  }

  /**
   * `ThetaRegistry.readSessionSwapTornDown()` — returns the private tripwire
   * snapshot the trip-site guard consults. A trivial field read, distinct from
   * `readDrainState` (this flag is not part of that public surface).
   */
  readSessionSwapTornDown(): SessionSwapTripwireState {
    return { armed: this.#sessionSwapTornDown, reason: this.#sessionSwapReason };
  }

  /**
   * `ThetaRegistry.readDrainState()` — returns a snapshot of the two drain-state
   * fields. The single read API consulted at the slash-handler and
   * `session_shutdown` handler-entry call sites (PIC-29/PIC-31). This reader is
   * a trivial field read and is implemented here; the V9m behaviour under test
   * is the two writers above and the routing in `drain-state.ts`.
   */
  readDrainState(): DrainStateSnapshot {
    return { drained: this.#drained, tag: this.#drainStateTag };
  }
}

/** The diagnostics-registry code a failed registry swap surfaces (PIC-36). */
export const REGISTRY_SWAP_FAILED_CODE = "theta/runtime/registry-swap-failed";

/**
 * The diagnostics-registry code the watcher-time settings-re-merge arm re-
 * produces (V10d). Per package-and-settings.md §"Watcher-time reload failures"
 * the re-merge arm re-emits a load-phase `theta/load/settings-*` diagnostic (a
 * re-merge of a changed settings file that fails to re-parse), not the
 * registry-swap arm's `theta/runtime/registry-swap-failed` — this is the
 * "re-parse / re-merge diagnostic" arm V4g distinguishes from the swap arm.
 */
export const SETTINGS_REMERGE_FAILED_CODE = "theta/load/settings-invalid-json";

/** Construction dependencies for the registry-swap and failure-injection seams. */
export interface RegistrySwapDeps {
  /** The live registry whose entries the swap publishes. */
  readonly registry: ThetaRegistry;
  /** Submit a constructed `Diagnostic` through the standard diagnostics channel. */
  readonly emitDiagnostic: (diagnostic: Diagnostic) => void;
}

/**
 * Rebuild the affected entries aside and, only after every staged step
 * succeeds, publish them atomically (PIC-36). `build` produces the staged map;
 * a throw out of it (or any staged re-parse / recompile / re-register step it
 * performs) discards the staging set, leaves the prior `ThetaRegistry` snapshot
 * live, and surfaces a single `theta/runtime/registry-swap-failed` diagnostic.
 * Returns `true` when the staged map was published, `false` on a discarded
 * (failed) swap.
 */
export function rebuildAndSwap(
  changedPath: string,
  build: () => ReadonlyMap<string, ParsedTheta>,
  deps: RegistrySwapDeps,
): boolean {
  // Build aside: run every staged step before touching the live registry. A
  // throw out of any staged step (parse, AJV recompile, `pi.registerTool`)
  // discards the staging set, leaves the prior snapshot live, and surfaces one
  // `theta/runtime/registry-swap-failed` diagnostic (PIC-36). The throw shape is
  // arbitrary across the staged steps, so the catch is the spec-mandated
  // rebuild-failure trap keyed to the diagnostics-registry code it emits.
  let staged: ReadonlyMap<string, ParsedTheta>;
  try {
    staged = build();
  } catch (rebuildError: unknown) { // allow-broad-catch: theta/runtime/registry-swap-failed — pi-integration-contract/registration-steps.md
    emitRegistrySwapFailed(changedPath, rebuildError, deps);
    return false;
  }
  // Publish: single synchronous write installing the staged map.
  deps.registry.publish(staged);
  return true;
}

/**
 * Construct and emit the single `theta/runtime/registry-swap-failed` diagnostic
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
  | "theta-thetalib-reparse"
  | "settings-remerge";

/**
 * The single declaration site of the test-only failure-injection interface for
 * the whole watcher-time reload failure-injection seam. A caller supplies a
 * synthetic failure for one arm and the seam routes it onto the
 * `theta-system-note` surfacing path without standing up a live watcher. V9b
 * wires the `registry-swap` and `theta-thetalib-reparse` arms; V10d contributes the
 * `settings-remerge` arm against this same interface.
 */
export interface ReloadFailureInjector {
  injectReloadFailure(arm: ReloadFailureArm, error: Error): void;
}

/**
 * Construct the failure injector wired to the registry-swap / re-parse arms
 * (both surface `theta/runtime/registry-swap-failed`).
 */
export function createReloadFailureInjector(
  deps: RegistrySwapDeps,
): ReloadFailureInjector {
  return {
    injectReloadFailure(arm: ReloadFailureArm, error: Error): void {
      // V9b wires the two watcher-time arms it owns onto the registry-swap-
      // failed surfacing path: a registry-swap failure and a `.theta`/`.thetalib`
      // re-parse failure both surface `theta/runtime/registry-swap-failed`.
      if (arm === "registry-swap" || arm === "theta-thetalib-reparse") {
        emitRegistrySwapFailed(`<injected:${arm}>`, error, deps);
        return;
      }
      // V10d's contribution: the settings-re-merge arm re-produces a load-phase
      // `theta/load/settings-*` diagnostic on the same watcher-time surfacing
      // path (package-and-settings.md §"Watcher-time reload failures" — the
      // re-parse/re-merge diagnostic arm, distinct from the swap arm's
      // `theta/runtime/registry-swap-failed`). V4g routes this pre-eval onto the
      // `theta-system-note` channel with `triggerTurn:false`.
      if (arm === "settings-remerge") {
        deps.emitDiagnostic({
          severity: "error",
          code: SETTINGS_REMERGE_FAILED_CODE,
          message: `settings re-merge failed: <injected:${arm}>`,
          hint: error.message,
        });
      }
    },
  };
}

// --- session_start cross-format collision pass (PIC-39) ---

/** The theta 1.0 cross-format collision source set (registration-steps.md). */
const COLLISION_SOURCE_SET: ReadonlySet<string> = new Set([
  "prompt",
  "extension",
  "skill",
]);

/** The outcome of the collision pass: surviving and dropped pending thetas. */
export interface CollisionPassResult {
  readonly survivors: readonly ParsedTheta[];
  readonly dropped: readonly ParsedTheta[];
}

/**
 * Drop each pending theta whose slash name collides with an existing command
 * whose `source` is in the collision source set. A single forward pass that
 * treats the `pi.getCommands()` snapshot as read-only by convention (PIC-39):
 * it never mutates `existingCommands`.
 */
export function dropCollidingThetas(
  pending: readonly ParsedTheta[],
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
  const survivors: ParsedTheta[] = [];
  const dropped: ParsedTheta[] = [];
  for (const theta of pending) {
    if (collidingNames.has(theta.slashName)) {
      dropped.push(theta);
    } else {
      survivors.push(theta);
    }
  }
  return { survivors, dropped };
}

// --- structural-change theta-system-note (PIC-37 / PIC-38) ---

/**
 * Decide whether a closed debounce window emits the structural-change
 * `theta-system-note`. Returns `undefined` when
 * `added.length + removed.length === 0` (empty-window suppression, PIC-37);
 * otherwise returns the note whose `content` is
 * `theta watcher: <N> file(s) added or removed; run /reload to refresh the slash command list`
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
    content: `theta watcher: ${count} file(s) added or removed; run /reload to refresh the slash command list`,
    display: true,
    details: { structural: { added, removed } },
  };
}

// --- model-reference-matcher production wiring point ---

/**
 * The narrow `ctx.modelRegistry.getAvailable()` surface theta's exact-match
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
 * Construct theta's own exact-match model-reference resolver over
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

/** A single `.theta` source to parse in the load pass. */
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
 * `theta/load/model-unresolved` resolution binds that instance (single-source-
 * of-construction, instance identity).
 */
export function loadPassParse(
  files: readonly LoadPassFile[],
  deps: LoadPassDeps,
): readonly FrontmatterParseResult[] {
  // Single source of construction: build the matcher once over
  // `modelRegistry.getAvailable()`, then inject that one instance into every
  // parse call so V6a's `theta/load/model-unresolved` resolution binds it
  // (instance identity, not equivalence-of-outcome).
  const modelMatcher = createModelReferenceMatcher(deps.modelRegistry);
  return files.map((f) => deps.parse({ file: f.file, modelMatcher }));
}
