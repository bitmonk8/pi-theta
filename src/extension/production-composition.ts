// H8a — the production composition root for the shipped extension.
//
// This module is the object graph the per-leaf gates verified only in isolation:
// at `session_start` it constructs the `H3a` runtime root over the real host
// seams (`V8b` `PiFileSystem`, `V8c` `AjvSchemaValidator`, `V8d`
// `WallClock`/`CryptoIdSource`, `V8e` `PiFileWatcher`/`PiTokenEstimator`), runs
// the five-source discovery walk (`V10a` union + `V10b` package source over the
// `V10c` merged settings), parses each discovered `.theta` (`V19a`), and maps it
// to a runnable `H4a` `ThetaFixture` via the `V19e` composition producer. The
// `factory.ts` `session_start` handler registers each returned fixture through
// `pi.registerCommand`, so the shipped extension discovers, registers, and runs
// `.theta` slash commands.
//
// All composition lives here in `src/**`; `extensions/index.ts` stays a thin
// delegating shim. The runtime root is constructed per `session_start`
// invocation (no module-level mutable state) so two extension instances share
// no state.
//
// Spec (narrative): pi-integration-contract/extension-bootstrap-and-per-theta.md,
// pi-integration-contract/registration-steps.md, discovery.md.

import { readFileSync } from "node:fs";
import {
  delimiter as PATH_DELIMITER,
  dirname,
  isAbsolute,
  resolve as resolvePath,
} from "node:path";
import { fileURLToPath } from "node:url";
import {
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  VERSION, // allow-pi-surface: PIC#subagent-launch-contract — Step 0 (d) rung 3: the in-process host SDK version, the only readable peer version on a compiled host binary
} from "@earendil-works/pi-coding-agent";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  normalizeToolSnapshot,
  type HostToolSnapshotEntry,
} from "../seams/host-tool-snapshot";
import { Type } from "typebox";
import {
  hashCallableClosure,
  type ClosureSource,
} from "../runtime/subagent-callable-hash";
import {
  readMarshalledCallableHashes,
  verifyChildCallableHashes,
} from "../runtime/subagent-child-hash-verify";
import {
  createProductionEnvelopeWriter,
  createProductionExecutableHost,
  createProductionParamsFs,
  createProductionSpawnFn,
  readParentEnv,
  readParentPid,
} from "./production-subagent-host";
import {
  detectSubagentRootRegime,
  markedRootRegistrationRefusal,
  type LoadRefusalDiagnostic,
  type RootRegime,
} from "../runtime/subagent-root-regime";
import { serializeErrEnvelope } from "../runtime/subagent-envelope";
import { checkExtensionToolReachability } from "./extension-tool-reachability";
import type { DispatchLadderProbe } from "../runtime/host-loop-dispatch";
import {
  createProductionHostLoopDispatch,
  probeGetToolDefinitionSurface,
  probeHostLoopSurfaces,
} from "./production-host-loop-dispatch";
import {
  PEER_DEP_PACKAGES,
  probeSubagentExecutable,
  type ProbeHost,
} from "./capability-probe";
import {
  parseInboundInvokeDepth,
} from "../runtime/invoke-depth-cycle";
import {
  SUBAGENT_INVOKE_DEPTH_ENV,
  type ExecutableHost,
} from "../runtime/subagent-launcher";
import type { ThetaFixture } from "./factory";
import type { Clock } from "../seams/clock";
import type { FileWatcher } from "../seams/file-watcher";
import { PiFileSystem } from "../seams/pi-file-system";
import { WallClock } from "../seams/wall-clock";
import { CryptoIdSource } from "../seams/crypto-id-source";
import { PiFileWatcher } from "../seams/pi-file-watcher";
import { PiTokenEstimator } from "../seams/pi-token-estimator";
import { AjvSchemaValidator } from "../seams/schema-validator";
import { ProductionCheckpoint } from "../seams/production-checkpoint";
import { createRuntimeRoot, type RuntimeRoot } from "../runtime-root";
import type { FileSystem } from "../seams/file-system";
import {
  renderDiagnosticBatch,
  renderDiagnosticLine,
  type Diagnostic,
} from "../diagnostics/diagnostic";
import type { LoweredSchema, SchemaSlug } from "../seams/schema-validator";
import {
  discoverThetas,
  type DiscoveredTheta,
  type PiOwnedCommand,
} from "../discovery/discovery-walk";
import { discoverPackageThetas } from "../discovery/package-discovery";
import { loadSettings, type ThetaSettings } from "../discovery/settings";
import {
  detectTypedQueryExpression,
  parseThetaDocument,
  type ThetaBody,
} from "../parser/theta-document";
import {
  createPassParseCache,
  parseViaPassCache,
  type PassParseDeps,
} from "./pass-parse-cache";
import { createPassVerdictMemo, type PassVerdictDeps } from "./pass-verdict-memo";
import { checkTypedQueryProviderSupport } from "../binder/provider-error-mapping";
import {
  parseToolsEntry,
  resolveCallableSet,
  type CallableSetDeps,
  type CallableSetSnapshot,
} from "../parser/callable-set";
import { checkCalleeHasErrors } from "../parser/invoke-diagnostics";
import { canonicalForm, schemaSlug, toLoweredJsonValue } from "../parser/schema-lowering";
import { checkInvokePathAtLoad } from "../runtime/invocation";
import {
  buildInvokeGraph,
  checkInvokeStaticResolution,
  type CalleeArity,
} from "./invoke-static-checks";
import {
  checkSubagentFnModelOverrides,
  checkSubagentFnStaticResolution,
  collectSubagentFns,
} from "./subagent-fn-static-checks";
import { checkThetaImports } from "./import-static-checks";
import type { ThetaMode } from "../parser/frontmatter";
import {
  matchAvailableModel,
  resolveBinderModel,
  type BinderModelResolution,
  type StrictCapableProbe,
} from "../binder/binder-model";
import { classifyBinderBypass } from "../binder/binder-envelope";
import {
  createModelReferenceMatcher,
  ThetaRegistry,
  type ParsedTheta,
} from "./reload-wiring";
import {
  SYSTEM_NOTE_CHANNEL,
  SystemNoteChannelHealth,
  emitDiagnosticBatch,
  type RendererGate,
  type SystemNoteChannelDeps,
} from "./system-note-channel";
import { isStaleCtxError } from "./stale-ctx";
import {
  createLoadFailurePreEvalRouter,
  type PreEvalFailureCause,
} from "./load-pre-eval";
import { installHotReload, type HotReloadHandle } from "./hot-reload";
import {
  composeThetaFixture,
  type ThetaCompositionInput,
} from "./theta-composition-producer";
import { createProductionProducerDeps } from "./production-theta-producer";
import { ActiveInvocationRegistry } from "../runtime/active-invocation-registry";
import type { ForwardingSignalSource } from "./session-shutdown";

/** Seam overrides for test injection — the FAKE FileWatcher / Clock the
 * watcher-hot-reload integration test drives through the real composition. */
export interface ComposeSeamOverrides {
  readonly fileWatcher?: FileWatcher;
  readonly clock?: Clock;
  /**
   * Test injection of the Step 0 (f) subagent executable-resolution host
   * (capability-probe.md). Production reads the running process
   * (`createProductionExecutableHost`); a test injects a host whose rungs both
   * fail to witness the load-time registration refusal for subagent-mode thetas.
   */
  readonly subagentExecutableHost?: ExecutableHost;
  /**
   * Bug 0178 element (b): test injection of the load pass's marked-root
   * registration-refusal envelope writer (the same writer `producerDeps`
   * threads to `driveSubagentRootRegime`'s own PIC-59 envelope). Production
   * reads `createProductionEnvelopeWriter()` (the real fd-1 write); a test
   * injects a capturing writer so the refusal envelope is observable without a
   * spawned child process.
   */
  readonly emitResultEnvelope?: (line: string) => void;
}

/**
 * The per-diagnostic toast/stderr router for the H8a helper path, retained on
 * the shipped path only as the note channel's off-channel delivery-failure
 * fallback. Severity-routed:
 *
 *  - error   → transient toast (`ctx.ui.notify`), mirrored to stderr in
 *              headless print / RPC mode;
 *  - warning → headless stderr ONLY. diagnostic-shape.md's
 *              persistent-diagnostics default carries no severity carve-out,
 *              but this router cannot reach the `theta-system-note` channel:
 *              it holds no channel deps, its `UiNotifier` surface is typed
 *              `"error"`-only (and the transient-toast MUST NOT forbids
 *              toasting author-facing diagnostics as a primary sink anyway),
 *              and its fallback instance must stay off-channel so a throwing
 *              `pi.sendMessage` never re-enters the channel (PIC-54). stderr
 *              is the one surface a warning can use here without violating
 *              either constraint.
 */
function makeLoadEmit(ctx: ExtensionContext): (diagnostic: Diagnostic) => void {
  return (diagnostic: Diagnostic): void => {
    if (diagnostic.severity === "error") {
      ctx.ui.notify(diagnostic.message, "error");
    }
    // In headless print / RPC mode there is no UI, so `ctx.ui.notify` resolves to
    // the runner's default no-op and every load/parse diagnostic would vanish: a
    // dropped theta's slash command silently fails to register (the raw
    // `/stem …` text is forwarded to the model as chat, and the run still exits 0
    // — the exact FMC-1 / DISCLI-2 / IMPORTS-3 gap), and a warning's condition
    // (a shadowed theta, a typo'd settings file) has no other observable at all.
    // Mirror the diagnostic to stderr in that case so a `-p` / CI user observes
    // it. stderr (never stdout) is used so the model reply and the
    // `--mode json` event stream on stdout stay uncorrupted. `process.stderr` is
    // not a gated ambient primitive (no-ambient-primitives MEMBER_RULES covers
    // `process.env` / `process.cwd` only), and this write is confined to the
    // no-UI path so the interactive toast surface is unchanged.
    if (!ctx.hasUI) {
      process.stderr.write(`theta: ${renderDiagnosticLine(diagnostic)}\n`);
    }
  };
}

/**
 * The per-pass load-diagnostic sink `runComposePass` emits through. `emit`
 * delivers one diagnostic; `emitGroup` delivers one already-assembled group
 * (one `.theta`'s parse batch, one subsystem scan) so a sink with a batching
 * warning arm keeps a file's warnings inside ONE `theta-system-note`
 * (diagnostic-shape.md multi-error reporting: one `pi.sendMessage` per
 * `.theta`) instead of fanning out one note per warning. Both arms deliver
 * synchronously at the call site — neither buffers across calls — so no
 * warning can rot undelivered when a pass ends (or unwinds mid-way), and a
 * post-pass emit through a retained single-diagnostic handle (the
 * `buildRuntimeRoot` → `AjvSchemaValidator` feed, which outlives the pass)
 * still delivers immediately.
 */
interface LoadDiagnosticSink {
  /** Deliver one diagnostic — equivalent to a group of one. */
  readonly emit: (diagnostic: Diagnostic) => void;
  /**
   * Deliver one assembled group: errors exactly as `emit` per element (in
   * array order); the group's warnings as one batch on a batching sink.
   */
  readonly emitGroup: (diagnostics: readonly Diagnostic[]) => void;
}

/**
 * Lift a per-diagnostic emit into a `LoadDiagnosticSink` for routers with no
 * cross-diagnostic batching surface: `makeLoadEmit`'s toast/stderr router
 * writes one line per diagnostic, so a group is just its members in order.
 */
function sinkOverPerDiagnosticEmit(
  emit: (diagnostic: Diagnostic) => void,
): LoadDiagnosticSink {
  return {
    emit,
    emitGroup: (diagnostics: readonly Diagnostic[]): void => {
      for (const diagnostic of diagnostics) {
        emit(diagnostic);
      }
    },
  };
}

/**
 * Map a load-phase diagnostic's registry code to its pre-evaluation failure
 * cause discriminant (errors-and-results/error-model.md ERR-1…ERR-6/ERR-16).
 * The V4e router shares ONE delivery surface across all seven causes, so the
 * discriminant is carried for caller / reload-integration reuse rather than
 * driving routing (WHY: `routePreEvalFailure` applies the fixed
 * `triggerTurn:false` option uniformly); an honest mapping documents which
 * pre-eval cause each shipped load-path diagnostic realises. ERR-5
 * (binder-arg-binding) and ERR-16 (slash-load `params`) are runtime/slash-load
 * cross-routes, not load-scan diagnostics, so they are not produced here. An
 * unmatched code falls to the ERR-2 lex/parse/type batch (the default
 * load-phase failure family).
 */
export function preEvalCauseOf(code: string): PreEvalFailureCause {
  if (code === "theta/load/host-incompatible") {
    return "capability-probe"; // ERR-1
  }
  if (code === "theta/load/binder-model-unresolved") {
    return "binder-model"; // ERR-4
  }
  if (
    code === "theta/load/extension-tool-unreachable" ||
    code === "theta/load/malformed-tool-entry" ||
    code === "theta/load/malformed-tools-field" ||
    code === "theta/load/unknown-tool" ||
    code === "theta/load/unresolvable-theta-path" ||
    code === "theta/load/prompt-mode-callable" ||
    code === "theta/load/tool-name-collision" ||
    code === "theta/load/invalid-tool-rename" ||
    code === "theta/load/invalid-derived-tool-name" ||
    code === "theta/load/invalid-pi-tool-name" ||
    code === "theta/load/callee-has-errors"
  ) {
    return "tools-resolution"; // ERR-6
  }
  if (code.startsWith("theta/parse/")) {
    return "lex-parse-type"; // ERR-2
  }
  if (code.startsWith("theta/load/")) {
    return "frontmatter"; // ERR-3 (frontmatter / params value rejections)
  }
  return "lex-parse-type"; // ERR-2 default batch
}

/**
 * Construct one runtime root over the real host seams. `overrides` substitutes
 * the `FileWatcher` / `Clock` seams for the watcher-hot-reload integration test
 * (production supplies neither). `cwd` is pinned to the host-reported working
 * directory so the project / global discovery sources resolve against the live
 * session's directory.
 */
function buildRuntimeRoot(
  ctx: ExtensionContext,
  emitDiagnostic: (diagnostic: Diagnostic) => void,
  overrides?: ComposeSeamOverrides,
): RuntimeRoot {
  const clock: Clock = overrides?.clock ?? new WallClock();
  const fileSystem = new PiFileSystem(ctx.cwd);
  const schemaValidator = new AjvSchemaValidator({
    emit: emitDiagnostic,
    // PIC-11 (host-interfaces-services.md:46) keys the per-query validator cache
    // by the lowered document's schema slug and gates a hit on canonical-form
    // byte-equality, so slug and bytes must come from one recipe (bug 0099).
    slugOf: productionSchemaSlugOf,
  });
  return createRuntimeRoot({
    checkpoint: new ProductionCheckpoint(clock),
    schemaValidator,
    clock,
    fileSystem,
    fileWatcher: overrides?.fileWatcher ?? new PiFileWatcher(),
    tokenEstimator: new PiTokenEstimator(),
    idSource: new CryptoIdSource(),
  });
}

/** The result of one discovery + compose pass. */
interface ComposePassResult {
  /** The composed runnable thetas (a superset of the `ThetaFixture` registration shape). */
  readonly thetas: readonly ParsedTheta[];
  /** The active discovery-root union computed for this pass. */
  readonly activeRoots: readonly string[];
  /** The watch-list root union: the file-derived `activeRoots` unioned with the
   *  discovery walk's resolved present-directory union (its four sources:
   *  cli/settings/project/global). The INV-1 containment checks read the
   *  file-derived `activeRoots` local, never this field. */
  readonly watchRoots: readonly string[];
}

/**
 * A standalone discover-and-compose helper: construct the runtime root over
 * the real host seams, run the five-source discovery walk keyed to the host
 * `ctx.cwd`, parse each discovered `.theta`, and compose each into a runnable
 * `ThetaFixture`. The shipped `session_start` path composes through
 * `composeExtensionInstance` below instead (which shares one runtime root and
 * registry across hot-reload passes); this helper is driven directly by tests
 * that want a single discover-and-compose pass with no reload wiring.
 */
export async function discoverAndComposeFixtures(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
): Promise<readonly ThetaFixture[]> {
  const emitDiagnostic = makeLoadEmit(ctx);
  const root = buildRuntimeRoot(ctx, emitDiagnostic);
  // This helper has no `session_shutdown` wiring reading a shared registry
  // (that is the `composeInstance` path), so it composes against a throwaway
  // registry no teardown observes.
  const pass = await runComposePass(
    pi,
    ctx,
    root,
    sinkOverPerDiagnosticEmit(emitDiagnostic),
    new ActiveInvocationRegistry(),
    // No `session_shutdown` wiring on this path (that is the `composeInstance`
    // path), so it composes against a throwaway forwarding sink no teardown
    // observes.
    [],
    undefined,
    undefined,
    // A no-op envelope writer, because this helper owes no envelope. PIC-59's
    // `theta_result` line is the obligation of a process that IS a real
    // spawned subagent child honouring its launch contract, emitted by that
    // child's own load pass; this reload-less helper is not that process, so a
    // pass that is not the child's real load pass must not claim the child's
    // one envelope on its single reserved-key stdout channel. Defaulting here
    // would hand the writer to `createProductionEnvelopeWriter()` — a genuine
    // fd-1 write — from a path the shipped `session_start` composition never
    // takes (it goes through `composeExtensionInstance`, which threads the
    // caller's writer instead).
    (): void => {},
  );
  return pass.thetas;
}

/**
 * One discovery + compose pass against an already-constructed runtime root.
 * Factored out of `discoverAndComposeFixtures` so `composeExtensionInstance`
 * can re-run it on every hot-reload (the "hot-reload re-runs the computation"
 * of discovery-sources.md §"Discovery roots"), with a per-pass diagnostic
 * `sink` (toast/stderr on the helper path; the `theta-system-note` channel on
 * the shipped `session_start` and watcher-time ERR-7 paths alike).
 *
 * `excludeOwnedNames` (registration-steps.md#pic-69) is this extension
 * instance's own-registration LEDGER — every slash name it has EVER passed to
 * `pi.registerCommand` — not the live `ThetaRegistry`'s keys: Pi exposes no
 * `pi.unregisterCommand`, so a name a prior pass registered and a later
 * collision then dropped from the registry is still reported back by
 * `pi.getCommands()` and must still be excluded. Consulted on EVERY pass that
 * reads `pi.getCommands()` for the cross-format collision check — the first
 * `session_start`, every hot-reload, and every supersession/rebind pass alike
 * — so a surviving slash name re-owns (registers again, rebinding the live
 * `/<name>` to this pass's registry) instead of self-colliding against the
 * instance's own prior registration: Pi reports every command an extension
 * registered as `source: "extension"`, indistinguishable from a sibling
 * extension's, so an unfiltered collision check against the raw
 * `pi.getCommands()` snapshot would self-drop every survivor. The exclusion is
 * source-conditioned (`readPiOwnedCommands` below applies it only to a
 * `source: "extension"` entry), so a same-named `"prompt"` / `"skill"` entry
 * still collides. Known limitation, not closed by this or any `source`-keyed
 * scheme: a sibling extension's same-named entry also carries
 * `source: "extension"` and is therefore also excluded, so that one
 * cross-format collision goes undetected. At the very first `session_start`
 * pass the set is empty — theta has not registered anything yet — so no
 * exclusion applies.
 */
async function runComposePass(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  root: RuntimeRoot,
  // Bug 0178 element (b): renamed from `sink` — this is now the CALLER's sink;
  // the pass wraps it in a recording tee (`sink`, below) so every call site
  // inside this function keeps delivering to it unchanged while the tee also
  // captures error-severity diagnostics for `markedRootRegistrationRefusal`.
  outerSink: LoadDiagnosticSink,
  // Decision 6 / Increment B1: the extension-instance-scoped shared registry of
  // in-flight invocations, threaded into every composed theta's producer so the
  // bind choke points register into the SAME instance the factory's
  // `session_shutdown` teardown reads. A reload pass reuses the same instance so
  // re-composed thetas register there too.
  activeInvocations: ActiveInvocationRegistry,
  // Decision 6 / Increment B2 (session-shutdown-semantics.md sub-step 5): the
  // extension-instance-scoped mutable sink of invocation-scoped forwarding
  // listeners, threaded into every composed theta's producer so the bind choke
  // points push into the SAME array the factory's `session_shutdown` sub-step 5
  // detaches. A reload pass reuses the same instance.
  forwardingSignals: ForwardingSignalSource[],
  excludeOwnedNames?: ReadonlySet<string>,
  // Step 0 (f): the executable-resolution host the subagent-executable probe
  // and the producer's launch seam read. Production reads the running process;
  // a test injects a both-rungs-failing host to witness the load refusal.
  passExecutableHost?: ExecutableHost,
  // Bug 0178 element (b): the marked-root registration-refusal envelope
  // writer, hoisted below (beside `subagentRootRegime`) into the SAME
  // `emitResultEnvelope` const `producerDeps` threads to
  // `driveSubagentRootRegime` — one child process, one envelope writer.
  // Production supplies none (the hoist falls back to
  // `createProductionEnvelopeWriter()`); a test injects a capturing writer.
  passEnvelopeWriter?: (line: string) => void,
  // Bug 0023 element 2: this extension instance's renderer gate, threaded onto
  // the parse-time note channel below so a renderer-degraded instance routes
  // its parse diagnostics to `ctx.ui.notify` too. The degrade rule is per
  // INSTANCE, not per channel, so every channel this instance owns must read
  // the same gate; the reload-less `discoverAndComposeFixtures` helper holds no
  // instance and passes none.
  rendererGate?: RendererGate,
): Promise<ComposePassResult> {
  const fileSystem = root.fileSystem;
  const clock = root.clock;
  const subagentExecutableHost = passExecutableHost ?? createProductionExecutableHost();

  // Bug 0178 element (b): a marked-root registration refusal must name the
  // diagnostic that caused it, and the registration loop below is the only
  // place that ever holds both the regime's slug and every diagnostic this
  // pass raises — so error-severity diagnostics are captured HERE, once, into
  // a pass-local array `markedRootRegistrationRefusal` reads after the loop
  // finishes. A recording TEE, not a replacement: every `sink.` call site in
  // the rest of this function keeps delivering to the caller's own
  // `outerSink` exactly as before. `emitGroup` records each member but
  // forwards the group array WHOLE — never fanned out per element, which
  // would break the sink contract's own per-group warning-batching guarantee
  // (`LoadDiagnosticSink`'s doc comment, above).
  const recordedErrorDiagnostics: LoadRefusalDiagnostic[] = [];
  // Recording is a LOAD-pass concern, closed by the refusal lookup below — but
  // the tee itself outlives the pass: `sink.emit` is threaded into
  // `producerDeps` as `emitDiagnostic`, and every composed theta's `run`
  // closure captures that for extension-instance lifetime. The producer's
  // RUNTIME-phase error diagnostics (spawn failures, wire failures,
  // envelope-parse failures, callable-hash refusals) therefore keep arriving
  // at this same sink long after the only reader ran. Unwiring the sink is not
  // the fix — delivery must continue — so the LATCH is what bounds the array:
  // once the refusal is decided, recording stops and the tee is delivery-only.
  let recordingComplete = false;
  const recordErrorSeverity = (diagnostic: Diagnostic): void => {
    if (recordingComplete || diagnostic.severity !== "error") {
      return;
    }
    recordedErrorDiagnostics.push({
      code: diagnostic.code,
      message: diagnostic.message,
      ...(diagnostic.file !== undefined ? { file: diagnostic.file } : {}),
    });
  };
  const sink: LoadDiagnosticSink = {
    emit: (diagnostic: Diagnostic): void => {
      recordErrorSeverity(diagnostic);
      outerSink.emit(diagnostic);
    },
    emitGroup: (diagnostics: readonly Diagnostic[]): void => {
      for (const diagnostic of diagnostics) {
        recordErrorSeverity(diagnostic);
      }
      outerSink.emitGroup(diagnostics);
    },
  };

  // Merged, validated settings (V10c) drive the settings discovery source and
  // the package-walk bounds.
  const settingsResult = await loadSettings(fileSystem);
  sink.emitGroup(settingsResult.diagnostics);
  const settings: ThetaSettings = settingsResult.settings;

  // Discovery walk. CLI `--theta` roots are split on the platform path
  // delimiter (the walk is platform-independent over already-split paths).
  const cliPaths = readThetaFlagPaths(pi);
  const piOwnedNames = readPiOwnedCommands(pi, excludeOwnedNames);
  const walk = await discoverThetas({
    fs: fileSystem,
    settings,
    cliPaths,
    piOwnedNames,
  });
  sink.emitGroup(walk.diagnostics);

  // Package source (V10b, priority 4) — merged in at the composition root: a
  // package theta registers only when its slash name is not already claimed by a
  // higher-priority (CLI / settings / project) or lower-priority (global)
  // discovered theta already resolved by the walk. This is the whole-walk merge
  // point the walk itself defers (discovery-walk.ts "Package … owned by V10b;
  // not plumbed into this walk yet"). See notes.md for the priority-tiebreak
  // simplification.
  const packageWalk = await discoverPackageThetas({
    fs: fileSystem,
    clock,
    settings,
  });
  sink.emitGroup(packageWalk.diagnostics);
  const claimed = new Set(walk.thetas.map((theta) => theta.name));
  const discovered: DiscoveredTheta[] = [...walk.thetas];
  for (const pkg of packageWalk.thetas) {
    if (!claimed.has(pkg.name)) {
      claimed.add(pkg.name);
      discovered.push({ name: pkg.name, path: pkg.path, source: "package" });
    }
  }

  // Parse + compose each discovered theta into a runnable fixture. The
  // model-reference matcher and the note-channel are constructed once and
  // shared across every parse (single source of construction).
  const modelMatcher = createModelReferenceMatcher({
    getAvailable: () => ctx.modelRegistry.getAvailable() as never,
  });
  // The merged `theta.binderModel` setting (chain step 2 of binder-model
  // resolution). Threaded, alongside the shared `modelMatcher`, into every
  // non-bypass theta's load-time binder-model resolution below.
  const settingsBinderModel = settings.theta?.binderModel;
  // The duck-typed strict-capability probe (binder-model-and-context.md
  // #strict-capability-requirement): resolve the reference to a concrete
  // `Model<Api>` and read `strictCapable`. Under the theta 1.0 Pi-SDK pin the
  // field is absent on every model, so this is the universal-W branch and the
  // theta still registers; the probe is short-circuited by `resolveBinderModel`
  // when the reference resolves to no model.
  const probeStrictCapable = (reference: string): StrictCapableProbe | undefined => {
    const model = matchAvailableModel(reference, ctx.modelRegistry.getAvailable());
    return model === undefined ? undefined : (model as unknown as StrictCapableProbe);
  };
  const systemNote = buildSystemNoteDeps(pi, ctx, sink.emit, rendererGate);
  // Bug 0264: one pass-scoped parse cache, created here (never module-level —
  // no global/static/singleton) and carried on `parseDeps` itself so a file
  // reached by more than one walk in THIS pass is parsed once and its lex rows
  // delivered once by construction; a later `composeExtensionInstance` pass
  // (a watcher-triggered reload) gets a fresh cache and re-delivers.
  const parseDeps: PassVerdictDeps = {
    systemNote,
    modelMatcher,
    passParseCache: createPassParseCache(),
    // Bug 0276: one pass-scoped verdict memo, created here (never
    // module-level) beside the parse cache above and carried on the same
    // `parseDeps` object, so `calleeFailsOwnStructuralChecks` judges a shared
    // `tools:` subtree once per pass instead of once per simple path that
    // reaches it (see `pass-verdict-memo.ts` for the key and the
    // cycle-free-verdict soundness argument).
    passVerdictMemo: createPassVerdictMemo(),
  };
  // Bug 0276 §Fix constraint 3: ONE registry-snapshot closure for the LOAD
  // pass, shared by every discovered theta's own walk in the per-file loop
  // below. The closure is stateless — it always forwards to the live
  // `pi.getAllTools?.()` call, so hoisting it changes nothing it returns —
  // but the verdict memo above keys one of its scope dimensions on this
  // function's IDENTITY, so one shared reference is what lets a verdict
  // memoised inside one file's walk be reused by another file's walk in the
  // same pass. SCOPE CONTRACT: load-side reuse spans the pass, because the
  // pass runs to completion synchronously with respect to the registry and
  // the active-root union it was seeded from, and a later pass gets a fresh
  // memo. The drive-time dispatch gate cannot make that claim and therefore
  // builds its own closure per dispatch — see the `parseCallee` closure
  // below.
  const registrySnapshot: GetAllToolsSnapshot = () => pi.getAllTools?.() ?? [];

  // INV-1 (invocation.md §Resolution): the active discovery-root union threaded
  // into the invoke containment check — the parent directory of every discovered
  // theta. Every registrable theta sits inside an active discovery root, so this
  // set is the roots the load-time and runtime containment checks compare
  // against; a callee resolving outside all of them escapes the sandbox.
  const activeRoots = Array.from(
    new Set(discovered.map((theta) => dirname(theta.path))),
  );

  // The watch-list root union (bug 0310): unioned with, not substituted for,
  // `activeRoots` — `activeRoots` already covers package thetas and any
  // glob-subdirectory file whose dirname sits below a settings static-prefix
  // root, neither of which `walk.roots` (the cli/settings/project/global
  // present-directory union) reconstructs on its own. `walk.roots` adds the
  // present-but-empty active roots `activeRoots` drops (a scaffolded
  // `.pi/theta/` with no `.theta` yet) so the watcher is armed over them and
  // the first file created there fires a watcher event. Present-but-empty
  // PACKAGE contributing directories stay out of scope — the bug doc §Summary
  // enumerates only the walk's own four sources — and file-bearing package dirs
  // remain covered via `activeRoots`. Re-arming on a LATER root-union change is
  // separately out of scope per §Fix constraint 3 (the structural-change note is
  // the designed /reload recovery), so this union is computed once per pass.
  //
  // `activeRoots` is `dirname(theta.path)` in host-native form (backslashes on
  // Windows); `walk.roots` is `normalizePath`-forward-slashed. Canonicalise the
  // file-derived copies to the same forward-slash comparison form so one
  // physical directory is one Set member. `activeRoots` itself is untouched —
  // its INV-1 consumers keep the native form.
  const watchRoots = Array.from(
    new Set([...activeRoots.map((r) => r.replace(/\\/g, "/")), ...walk.roots]),
  );

  // RFC-0006 (PIC-58): the subagent-root regime detected once from the process
  // env. Active ONLY inside a spawned subagent child; drives the child-side
  // in-process root drive. PIC-64 host-loop-dispatch rung availability is NOT
  // regime-gated — the probe below reads only the Pi surfaces.
  const subagentRootRegime = detectSubagentRootRegime(readParentEnv());
  // Bug 0178 element (b): hoisted here (not inline in `producerDeps` below) so
  // ONE writer instance serves both `driveSubagentRootRegime`'s own PIC-59
  // envelope and this pass's marked-root registration-refusal envelope
  // (emitted after the registration loop) — a child process has exactly one
  // reserved-key stdout channel (PIC-59) and must never open two independent
  // writers onto it.
  const emitResultEnvelope = passEnvelopeWriter ?? createProductionEnvelopeWriter();

  // PIC-64: the code-side extension-tool dispatch-ladder probe — MODE- and
  // regime-independent (the retired PIC-61 child-only availability invariant is
  // inverted). The probe records a rung available only when it is EXECUTABLE
  // here: the same probe gates the LOAD-time rung-3 refusal and the runtime
  // rung routing, so recording a rung with no dispatcher behind it would
  // register thetas whose every code-side call then fails — registration must
  // never outrun dispatchability (rung 3's register-iff-dispatchable intent).
  //  - rung 1 (`getToolDefinition`): the upstream surface probe
  //    (`probeGetToolDefinitionSurface`) AND a wired rung-1 dispatcher. No
  //    rung-1 dispatcher is implemented at the theta 1.0 Pi-SDK pin (the
  //    surface is requested upstream, so far refused), so the conjunction reads
  //    false even on a host exposing the member, and rung 2 carries dispatch.
  //    When the dispatcher lands, the second conjunct becomes its wiring
  //    presence and `resolveDispatchLadder`'s normative rung-1 preference takes
  //    over automatically, in parent and child alike — no ladder change.
  //  - rung 2 (host-loop dispatch): establishable wherever a real host session
  //    with an agent loop and the required Pi surfaces is present (`typeof`
  //    capability-probe convention, `probeHostLoopSurfaces`) — inside the
  //    subagent-root child AND in the parent against the user's live host
  //    session (prompt mode).
  // Shared between the producer wiring (runtime backstop,
  // `#dispatchExtensionToolViaLadder`) and the LOAD-time reachability refusal
  // below (rung 3), so both read the SAME probe: a theta whose CODE calls an
  // extension tool REGISTERS when an executable rung is establishable — in
  // either mode, in either process — while a no-executable-rung context refuses
  // fail-closed with `theta/load/extension-tool-unreachable`.
  const hostLoopSurfacesPresent = probeHostLoopSurfaces({ pi, ctx });
  // Flips to the rung-1 dispatcher's wiring presence when one exists; `false`
  // is the honest record that no code-side rung-1 dispatch is implemented yet.
  const getToolDefinitionDispatchWired: boolean = false;
  const dispatchLadderProbe: DispatchLadderProbe = {
    getToolDefinitionAvailable:
      probeGetToolDefinitionSurface({ pi }) && getToolDefinitionDispatchWired,
    hostLoopAvailable: hostLoopSurfacesPresent,
  };

  // PIC-64 rung 2: the production host-loop dispatch seam, wired over the live
  // host (`pi` + `ctx` + the runtime `Clock`) whenever the rung is establishable
  // — the parent's live user session and the subagent-root child alike. Absent
  // only where the surfaces are missing (the ladder is fail-closed there).
  const hostLoopDispatch = dispatchLadderProbe.hostLoopAvailable
    ? createProductionHostLoopDispatch({ pi, ctx, clock })
    : undefined;

  const producerDeps = createProductionProducerDeps({
    pi,
    root,
    modelRegistry: ctx.modelRegistry,
    // Decision 6 / Increment B1: share the in-flight-invocation registry so the
    // producer's bind choke points register entries the factory's
    // `session_shutdown` sub-steps 2/3 operate on.
    activeInvocations,
    // Decision 6 / Increment B2: share the forwarding-listener sink so the
    // producer's bind choke points push invocation-scoped forwarding sources the
    // factory's `session_shutdown` sub-step 5 detaches.
    forwardingSignals,
    // Bug 0073: the per-invocation clean-cancel note rides the SAME
    // extension-instance `theta-system-note` channel every other note rides, so
    // it observes this instance's renderer gate and delivery-health latch
    // instead of a freshly-built channel that carries neither.
    systemNoteChannel: systemNote,
    // H8b: resolve a code-side Pi-tool name to its `execute` dispatch over the
    // live host `cwd` / `ctx`.
    resolvePiTool: (name: string) => resolvePiTool(name, ctx),
    // RFC-0005 subagent launch seams (subagent.md #subagent-launch-contract): the
    // Windows-safe child-`pi`-process spawn function, the executable-resolution
    // host snapshot, the inherited parent environment (full inheritance is the
    // credential mechanism), and the parent PID carried on the env marker.
    subagentSpawn: createProductionSpawnFn(),
    subagentExecutableHost,
    subagentParentEnv: readParentEnv(),
    subagentParentPid: readParentPid(),
    // RFC-0006 (PIC-60): the params-channel filesystem seam (0600 temp file for
    // the at/above-threshold channel + the parent `finally` backstop unlink).
    subagentParamsFs: createProductionParamsFs(),
    // RFC-0006 (PIC-58): the subagent-root regime detected from the process env.
    // Active only inside a spawned subagent child; drives the child-side
    // in-process root drive + envelope emission.
    subagentRootRegime,
    // RFC-0006 (PIC-59): the child-side stdout return-envelope writer — the
    // SAME instance hoisted above (bug 0178 element (b)), so the drive's own
    // envelope and the load pass's marked-root registration-refusal envelope
    // share one writer.
    emitResultEnvelope,
    // PIC-64: the code-side extension-tool dispatch ladder probe. Rung 1 is
    // derived above as the upstream surface probe AND a wired rung-1 dispatcher
    // (none exists at the pin, so it reads false and registration cannot outrun
    // dispatchability); rung 2 (host-loop dispatch) is establishable wherever the required
    // Pi surfaces are present — the parent's live user session and the
    // subagent-root child alike — so a theta whose CODE calls an extension tool
    // REGISTERS and routes through host-loop dispatch in BOTH modes; a
    // surfaces-absent context leaves the ladder FAIL-CLOSED
    // (`theta/load/extension-tool-unreachable`). The ladder + host-loop seams
    // are unit-tested (host-loop-dispatch.ts, production-host-loop-dispatch.ts).
    // The same probe drives the LOAD-time reachability refusal (PIC-64 rung 3)
    // in the registration loop below.
    dispatchLadderProbe,
    // PIC-64 rung 2: the wired host-loop dispatch seam. Omitted (not set to
    // `undefined`, per exactOptionalPropertyTypes) only where the surfaces are
    // absent and the ladder is fail-closed.
    ...(hostLoopDispatch !== undefined ? { hostLoopDispatch } : {}),
    // INV-4 (invocation.md §INV-4): when THIS process is a spawned subagent
    // child, its top-level invoke chain seeds from the depth the parent
    // marshalled on the child env (`SUBAGENT_INVOKE_DEPTH_ENV`), so the depth-32
    // ceiling continues across the process hop. A malformed / absent carriage
    // seeds a fresh chain at depth 0 (INV-4 pins no fail-closed rule).
    subagentInboundInvokeDepth: parseInboundInvokeDepth(
      readParentEnv()[SUBAGENT_INVOKE_DEPTH_ENV],
    ),
    // #subagent-isolation-and-trust: `pi.getAllTools()` (name + `sourceInfo.scope`)
    // for the project-local trust inference (`--approve` / `--no-approve`).
    getAllTools: () => pi.getAllTools(),
    // #subagent-theta-callable-hash: the transitive-closure content hash of each
    // `.theta` callable (file + `.thetalib` imports) is captured at LOAD time
    // and stored on the frozen callable-set entry (`attachLoadTimeClosureHashes`
    // in `resolveThetaToolsAtLoad`); the launch marshals that stored value, so
    // the producer needs no spawn-time hash resolver.
    // The runtime-defect / spawn-failure / wire-failure diagnostic sink (the
    // per-diagnostic arm; runtime emits are not per-file scan batches).
    emitDiagnostic: sink.emit,
    // H8b: parse an `invoke` / `.theta`-callable callee against the caller's
    // directory, reusing the shared parser deps. Bug 0276 SCOPE CONTRACT: a
    // FRESH registry-snapshot closure per dispatch, deliberately NOT the
    // hoisted load-pass one above, so gate-side verdict reuse spans exactly
    // one dispatch walk. The two scopes differ because the memo's registry key
    // is this closure's IDENTITY while the closure itself forwards to the live
    // registry — a memo entry filed under a longer-lived closure would keep
    // answering for a registry a drive-time `pi.registerTool` has since
    // changed — and because the memo's byte guard covers only the queried
    // file's own bytes, while a gate-side walk (`activeRoots === undefined`)
    // recurses into files outside every discovery root that no watcher
    // re-composes for. Reuse must therefore not outlive the walk that
    // established the registry and the subtree it was computed against. Inside
    // ONE dispatch the recursion still shares this single reference, so the
    // shared-subtree collapse (§Fix constraint 6, cost profile) holds for the
    // gate's own walk.
    parseCallee: (callerPath, calleePath) =>
      parseCalleeTheta(fileSystem, ctx, callerPath, calleePath, parseDeps, () =>
        pi.getAllTools?.() ?? [],
      ),
    // INV-1 (invocation.md §Resolution): the runtime open-time containment
    // re-check consults the same `realpath` seam and active-root union.
    fileSystem,
    activeRoots,
  });

  // Parse pass: parse every discovered theta into its composition input; a drop
  // surfaces its load/parse diagnostics (FM-3 / DIAG-1) and does not register.
  const parsedInputs: ThetaCompositionInput[] = [];
  for (const theta of discovered) {
    // Bug 0264: pass the pass-scoped `parseDeps` so this discovery parse
    // rides the same pass cache every other walk below does.
    const parsed = await parseDiscoveredTheta(fileSystem, theta, parseDeps);
    if ("dropped" in parsed) {
      // FM-3: surface the load/parse diagnostics that un-registered this theta,
      // as ONE per-file group — errors route per-diagnostic; any warnings
      // co-fired in the same dropped batch deliver as one batched note.
      sink.emitGroup(parsed.dropped);
      continue;
    }
    // Bug 0013 (drop site 3): a theta that REGISTERS can still carry
    // warning-severity parse/frontmatter diagnostics (a warning alone never
    // un-registers). diagnostic-shape.md's persistent-diagnostics default
    // covers them, so forward the document batch as ONE per-file group rather
    // than discarding it with the fixture.
    if (parsed.diagnostics.length > 0) {
      sink.emitGroup(parsed.diagnostics);
    }
    parsedInputs.push(parsed.fixture);
  }

  // INV-4 (invocation.md §Cycle detection): build the per-load-pass
  // static-resolution invoke graph across the parsed thetas once, so the cycle
  // walk below runs per entry against a shared graph.
  const invokeGraph = buildInvokeGraph(parsedInputs);

  // capability-probe.md Step 0 (f): the subagent-executable-resolution probe.
  // Run the executable-resolution ladder ONCE per pass (the host snapshot is
  // constant for the pass — filesystem-existence only, no spawn) and refuse
  // SUBAGENT-MODE theta registration fail-closed when neither rung yields a
  // runnable child `pi` entry point. An unresolvable executable would otherwise
  // fail at first spawn; the probe surfaces it at load with the pinned
  // `theta/load/subagent-executable-unresolved` (no PATH fallback). Prompt-mode
  // thetas never launch a child, so the refusal is scoped to subagent mode per
  // subagent.md #subagent-executable-resolution ("the theta does not register").
  const subagentExecutableProbe = probeSubagentExecutable(subagentExecutableHost);

  const thetas: ParsedTheta[] = [];
  for (const input of parsedInputs) {
    // Step 0 (f): a subagent-mode theta cannot register when the child `pi`
    // executable is unresolvable — refuse fail-closed here rather than at first
    // spawn, emitting the pinned diagnostic once per refused theta.
    if (input.frontmatter.mode === "subagent" && !subagentExecutableProbe.ok) {
      sink.emit(subagentExecutableProbe.diagnostic);
      continue;
    }
    // V20a — resolve the `tools:` callable set against the shipped Pi tool
    // registry at production load time. A `tools:` rejection (unknown Pi tool,
    // prompt-mode `.theta` callee, name collision, invalid `as` rename, or a
    // `.theta` callee carrying its own load/parse errors) un-registers the theta
    // exactly as the isolation-tested `resolveCallableSet` (V6c) and
    // callee-has-errors (V15f) checks decide.
    const toolResult = await resolveThetaToolsAtLoad(
      input,
      fileSystem,
      ctx,
      parseDeps,
      // Bug 0001 (frontmatter-fields-a.md §`tools`): admission resolves against
      // the `pi.getAllTools()` registry snapshot in BOTH modes.
      // Optional-chained: harness `pi` fakes without `getAllTools` yield `[]`.
      // Bug 0276: the hoisted load-pass `registrySnapshot`, not a fresh
      // closure per iteration — a fresh closure here would give every
      // discovered theta's own walk a distinct verdict-memo registry scope,
      // and no walk would ever share a memoised verdict with another file's.
      registrySnapshot,
      // INV-1 (invocation.md §Resolution) / bug 0110: thread the active-root
      // union so an out-of-root `tools:` `.theta` entry is rejected here,
      // strictly before `checkInvokeStaticResolution` runs below — the
      // `continue` a few lines down on any error-severity `tools:` diagnostic
      // makes that ordering structural rather than a placement choice.
      activeRoots,
    );
    sink.emitGroup(toolResult.diagnostics);
    if (toolResult.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      continue;
    }

    // PIC-64 rung 3 (LOAD-time): a theta whose CODE calls a callable-set
    // EXTENSION tool refuses to register when no code-side dispatch rung is
    // available (fail-closed). This is the load-time realisation of rung 3
    // (spec option (a)) — it fires wherever the theta reaches load (parent or
    // spawned child), MODE-INDEPENDENTLY: admission resolves extension tools in
    // both modes, so refusal tracks RUNG AVAILABILITY, never the process regime
    // or the frontmatter mode. A MODEL-facing `@`-query use of the tool holds
    // no code-side call site and is unaffected. The walk covers the ROOT body
    // (incl. local `fn` bodies); a
    // transitive-import code-side extension-tool call cannot arise (an imported
    // `.thetalib` `fn` naming a caller-scoped extension tool fails `.thetalib`
    // parse with `theta/parse/unknown-identifier` and un-registers the importer
    // first), so root-body scope is complete here. The runtime
    // `#dispatchExtensionToolViaLadder` refusal remains a defence-in-depth
    // backstop.
    const reachabilityDiagnostics = checkExtensionToolReachability({
      body: input.body,
      extensionToolNames: toolResult.extensionToolNames ?? new Set<string>(),
      probe: dispatchLadderProbe,
      file: input.sourcePath ?? input.slashName,
    });
    sink.emitGroup(reachabilityDiagnostics);
    if (reachabilityDiagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      continue;
    }

    // INV-3 / INV-4 / INV-1 (invocation.md §Resolution): run the invoke static
    // checks against the resolved callees and the shared invoke graph, over BOTH
    // the `invoke(...)` call surface and the `.theta`-callable call surface
    // (tool-calls.md §"Argument shape" binds INV-3 arity to both by name; bug
    // 0071). An error-severity diagnostic (an arity error, a discovery-root
    // escape, or an invocation cycle) un-registers the theta.
    const invokeDiagnostics = await checkInvokeStaticResolution(input, {
      fs: fileSystem,
      activeRoots,
      graph: invokeGraph,
      resolveCalleeArity: (absolutePath) =>
        resolveCalleeArity(fileSystem, absolutePath, parseDeps),
      // `toolResult` is this theta's already-frozen `tools:` snapshot (resolved
      // above by `resolveThetaToolsAtLoad`); the `.theta`-callable-call arity
      // loop resolves each call's callee against it. Guarded spread (not a bare
      // `callableSet: toolResult.callableSet`): `exactOptionalPropertyTypes`
      // distinguishes an omitted key from one explicitly set to `undefined`.
      ...(toolResult.callableSet !== undefined
        ? { callableSet: toolResult.callableSet }
        : {}),
    });
    sink.emitGroup(invokeDiagnostics);
    if (invokeDiagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      continue;
    }

    // RFC 0001 FN-6: run the `subagent fn` static checks against the parsed
    // body. A `subagent fn` that references itself (or a mutual cycle) is a
    // length-1 `theta/load/invocation-cycle` that un-registers the enclosing
    // theta — the load-time bound on unbounded subagent recursion, mirroring the
    // INV-4 un-registration of a self-cyclic `.theta`. The broken-inline-body
    // half (`theta/load/callee-has-errors`) is surfaced on the drop path in
    // `parseDiscoveredTheta` (a broken body is an error-severity parse
    // diagnostic that already un-registers before reaching here).
    const subagentFnDiagnostics = checkSubagentFnStaticResolution({
      body: input.body,
      file: input.sourcePath ?? input.slashName,
      parseDiagnostics: [],
    });
    sink.emitGroup(subagentFnDiagnostics);
    if (subagentFnDiagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      continue;
    }

    // RFC 0001 FN-7: validate each `subagent fn`'s `with { model }` override at
    // LOAD through the shared `modelMatcher` — the same bar frontmatter `model:`
    // is held to — rather than letting an unresolvable override silently fall
    // back to the inherited session model at runtime. An unresolvable override
    // is `theta/load/model-unresolved` and un-registers the theta.
    const subagentFnModelDiagnostics = checkSubagentFnModelOverrides(
      collectSubagentFns(input.body),
      input.sourcePath ?? input.slashName,
      modelMatcher,
    );
    sink.emitGroup(subagentFnModelDiagnostics);
    if (subagentFnModelDiagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      continue;
    }

    // IMP-1 / IMP-3 / IMP-4 / IMP-5 (imports.md): resolve each `.thetalib` import,
    // parse it, and run the unresolvable-path / unknown-symbol / thetalib-top-level /
    // cycle checks. An error-severity diagnostic un-registers the theta. The
    // resolved exports are materialised into the theta's runtime environment so an
    // imported `fn` is callable (IMP-6) and its query body drives the caller's
    // conversation (IMP-7).
    const importCheck = await checkThetaImports(input, {
      fs: fileSystem,
      parseDeps,
    });
    // Bug 0264: emit only the UNDELIVERED remainder — `importCheck.undelivered`
    // already excludes rows the pass cache saw `lexTheta` deliver for this
    // library earlier in the same pass (route 1). The registration decision
    // below still tests the FULL, unfiltered `importCheck.diagnostics`
    // (§Fix: filtering the decision input would change a registration
    // outcome, which this report does not license).
    sink.emitGroup(importCheck.undelivered);
    if (importCheck.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      continue;
    }

    // Binder-model resolution (binder-model-and-context.md §"Binder model"): a
    // NON-bypass theta's binder model resolves at LOAD time from the two-step
    // chain (`bind_model:` → `theta.binderModel`) over the SAME shared
    // `modelMatcher` the `model:` resolution binds. A non-bypass theta whose
    // chain resolves to no model fails to load with
    // `theta/load/binder-model-unresolved` (E) — the diagnostic surfaces through
    // the load-diagnostic sink and the theta does NOT register. Bypass-eligible thetas
    // (no-params / single-string) skip resolution entirely (they never call the
    // binder). The resolved reference is carried onto the runnable theta so the
    // runtime dispatches the binder OFF-session against it.
    const bypassEligible =
      classifyBinderBypass(input.frontmatter.params?.fields).kind !== "binder";
    // Bug 0178 element (a): the marked root of a spawned subagent child
    // dispatches through `driveSubagentRootRegime` STRICTLY BEFORE
    // `runBinder` whenever `isSubagentRootFor` holds
    // (theta-composition-producer.ts's slash-dispatch `run`:
    // `deps.isSubagentRootFor?.(theta)` gates the regime drive ahead of
    // `deps.runBinder`) — this predicate is that same test, so the exempt set
    // here and the binder-skipping set there are ONE set, held together by
    // that single co-located invariant. A wider exemption (every theta in the
    // child) would rest on the argv contract instead
    // (subagent.md#subagent-launch-contract, one invocation per process) and
    // would register a NESTED `mode: subagent` callee whose OWN dispatch still
    // reaches `runBinder` (`selectSubagentDriver`'s no-recursion guarantee
    // spawns that callee its own child) with no resolved binder model —
    // hitting the `model === undefined` defensive arm `runBinder` itself calls
    // unreachable for a registered non-bypass theta. Skipping resolution here
    // also skips the strict-capability probe (it runs INSIDE
    // `resolveBinderModel`), which is the regime carve-out's own requirement,
    // not an accident: otherwise `theta/load/binder-model-not-strict-capable`
    // becomes the next refusal on the very same path.
    const isMarkedRootTheta =
      subagentRootRegime.active &&
      subagentRootRegime.slug === input.slashName &&
      input.frontmatter.mode === "subagent";
    const binderModelResolution: BinderModelResolution = isMarkedRootTheta
      ? { resolved: true, diagnostics: [] }
      : resolveBinderModel({
          file: input.sourcePath ?? input.slashName,
          ...(input.frontmatter.bindModel !== undefined
            ? { bindModel: input.frontmatter.bindModel }
            : {}),
          ...(settingsBinderModel !== undefined ? { settingsBinderModel } : {}),
          bypassEligible,
          matcher: modelMatcher,
          probeStrictCapable,
        });
    sink.emitGroup(binderModelResolution.diagnostics);
    if (!binderModelResolution.resolved) {
      // A non-bypass theta with no resolvable binder model fails to load.
      continue;
    }

    // Bug 0010 increment C (conversation-drive.md §"Provider compatibility for
    // typed queries"): the LOAD-time typed-query provider gate. A theta that
    // CARRIES a typed query whose frontmatter `model:` load-resolves to an api
    // outside the supported set warns with
    // `theta/load/typed-query-unsupported-provider` — WARNING severity, so the
    // theta STILL REGISTERS (no `continue`; the runtime gate refuses the typed
    // dispatch itself). The diagnostic rides the SAME sink every other
    // load-time warning rides (e.g. the binder-model
    // strict-capability-unknown warning above), and both production sinks
    // deliver warnings (bug 0013): the shipped path routes them onto the
    // `theta-system-note` channel, the helper path mirrors them to headless
    // stderr — so the gate's two-stage design (warn at load, refuse at
    // dispatch) is operator-visible. The composition-level integration cell
    // lives in tests/load-warning-delivery.test.ts (A1).
    const typedQueryProviderWarning = checkThetaTypedQueryProviderSupport({
      file: input.sourcePath ?? input.slashName,
      body: input.body,
      modelReference: input.frontmatter.model,
      resolveModel: (reference) =>
        matchAvailableModel(reference, ctx.modelRegistry.getAvailable()),
    });
    if (typedQueryProviderWarning !== null) {
      sink.emit(typedQueryProviderWarning);
    }

    // Thread the frozen callable-set snapshot resolved above onto the runnable
    // theta so the runtime enforces the per-theta `tools:` set (QTL-2: code-driven
    // calls dispatch only through a held reference; QTL-4: prompt-mode query
    // turns install exactly this set's underlying Pi-tool names as the model's
    // active tools), plus the resolved binder-model reference (absent for a
    // bypass-eligible theta).
    const composedInput: ThetaCompositionInput = {
      ...input,
      ...(importCheck.imports.length > 0 ? { imports: importCheck.imports } : {}),
      ...(toolResult.callableSet !== undefined
        ? { callableSet: toolResult.callableSet }
        : {}),
      ...(binderModelResolution.binderModel !== undefined
        ? { binderModel: binderModelResolution.binderModel }
        : {}),
      // Bug 0328 §Fix: thread the root's own captured closure hash so the
      // producer's marshalling loop can add it to the launch's callable-hash
      // carrier alongside the `tools:` entries.
      ...(toolResult.rootClosureHash !== undefined
        ? { rootClosureHash: toolResult.rootClosureHash }
        : {}),
    };
    // Carry the parsed frontmatter + body onto the runnable theta so the
    // hot-reload rebuild can swap the `ThetaRegistry` with full `ParsedTheta`
    // entries; the registration path reads `slashName` + `description` + `run`.
    // Thread the top-level `description` `composeThetaFixture` computed onto the
    // pushed theta so factory registration passes it to `pi.registerCommand`
    // (REQ-PIC-31; frontmatter-fields-a.md autocomplete). Omitted when the theta
    // declares none. Covers BOTH production paths (composeExtensionInstance and
    // discoverAndComposeFixtures) — both flow through this pass.
    const fixture = composeThetaFixture(composedInput, producerDeps);
    thetas.push({
      ...composedInput,
      ...(fixture.description !== undefined
        ? { description: fixture.description }
        : {}),
      run: fixture.run,
    });
  }
  // RFC-0005 #subagent-theta-callable-hash: when THIS process is a subagent
  // child carrying marshalled `.theta` callable hashes, recompute each
  // callable's transitive-closure hash from the child's OWN discovery and
  // refuse fail-closed on mismatch. One child process serves exactly one
  // subagent-mode invocation, so a refusal recorded during the child's
  // discovery pass refuses that invocation (subagent.md — the child "refuses
  // the invocation on mismatch"). A refused callable is dropped from the
  // child's registration and its `theta/runtime/subagent-callable-hash-mismatch`
  // diagnostic is surfaced.
  const survivors = await refuseDivergedChildCallables(
    thetas,
    fileSystem,
    ctx,
    parseDeps,
    sink.emit,
    subagentRootRegime,
  );
  // Bug 0178 element (b): AFTER `refuseDivergedChildCallables`, not before —
  // the callable-hash verification above can drop the marked root too, so
  // `registeredSlugs` must reflect this pass's FINAL registration outcome.
  // `calleePath` is the marked root's OWN discovered path (not any callee's):
  // `resolveThetaToolsAtLoad` stamps `file: parsed.sourcePath` on every
  // `tools:`-surface diagnostic it raises for a theta, the same value
  // `discovered[].path` holds for that theta, so the lookup below finds the
  // refusal diagnostic the marked root's OWN file drew, if any.
  const registrationRefusal = markedRootRegistrationRefusal({
    regime: subagentRootRegime,
    registeredSlugs: survivors.map((theta) => theta.slashName),
    calleePath: subagentRootRegime.active
      ? discovered.find((theta) => theta.name === subagentRootRegime.slug)?.path
      : undefined,
    refusals: recordedErrorDiagnostics,
  });
  recordingComplete = true;
  if (registrationRefusal !== undefined) {
    // The one PIC-59 envelope line this pass ever owes: the child fell
    // through to the host's ordinary prompt handling with no theta runtime
    // ever entered, so the load pass is the only remaining writer for it.
    emitResultEnvelope(serializeErrEnvelope(registrationRefusal));
  }
  return { thetas: survivors, activeRoots, watchRoots };
}

/**
 * The presented callable name a discovered `.theta` maps to (the same
 * derivation `resolveCallableSet` applies to a bare `.theta` path: basename
 * without the `.theta` extension, hyphens replaced by underscores). Used to
 * align the parent-marshalled callable hashes (keyed by presented name) with
 * the child's discovered thetas.
 */
function deriveCallableName(sourcePath: string): string {
  return thetaBasename(sourcePath).replace(/-/g, "_");
}

/**
 * RFC-0005 #subagent-theta-callable-hash child-side verification. Reads the
 * parent-marshalled hashes off the child env, recomputes each marshalled
 * callable's transitive-closure hash from the child-discovered sources, and
 * refuses (drops + emits `theta/runtime/subagent-callable-hash-mismatch`) each
 * callable whose child-recomputed hash does not match — or whose child-side
 * source the child cannot re-resolve (fail-closed). Returns the discovered
 * thetas unchanged when this process is not a subagent child carrying hashes.
 */
async function refuseDivergedChildCallables(
  thetas: readonly ParsedTheta[],
  fs: FileSystem,
  ctx: ExtensionContext,
  parseDeps: Parameters<typeof parseThetaDocument>[1],
  emitDiagnostic: (diagnostic: Diagnostic) => void,
  regime: RootRegime,
): Promise<ParsedTheta[]> {
  // The child env carrier, read through the AUTHENTICATED control-plane view
  // (`readParentEnv`) — the same gate the factory's `PI_THETA_SUBAGENT_ROOT`
  // marker read applies — so a hash map planted in the ambient environment (a
  // repository `.env` a host loads, never a real launcher) can neither throw a
  // parse failure out of the compose pass nor drop discovered callables
  // (subagent.md #subagent-control-plane-authentication). A real child always
  // authenticates: its launcher wrote the parent-pid carriage beside the map.
  const env = readParentEnv();
  const marshalled = readMarshalledCallableHashes(env);
  if (marshalled === undefined) {
    return [...thetas];
  }
  // Bug 0330 §Fix: the parent marshals under the PRESENTED name (the frozen
  // callable-set entry's key, post-`as`/post-hyphen rewrite), so alignment must
  // resolve through that same key space before ever falling back to file
  // derivation. The marked root's own `tools:` is the one place the rename
  // table lives child-side, so this pass reads the root's frozen
  // `callableSet` snapshot rather than re-deriving names from discovered
  // basenames. `theta` on the `byName` hit may be `undefined` when the callee
  // itself was not separately discovered as a root (nothing to drop — bug
  // 0329's territory, not this pass's).
  const byName = new Map<
    string,
    { readonly theta: ParsedTheta | undefined; readonly sources: readonly ClosureSource[] }
  >();
  const markedRoot = regime.active
    ? thetas.find((theta) => theta.slashName === regime.slug)
    : undefined;
  if (markedRoot?.sourcePath !== undefined && markedRoot.callableSet !== undefined) {
    const rootPath = markedRoot.sourcePath;
    for (const [presentedName, resolved] of markedRoot.callableSet.entries) {
      if (
        resolved.kind !== "theta" ||
        !marshalled.has(presentedName) ||
        byName.has(presentedName)
      ) {
        continue;
      }
      const sources = await collectCallableClosureSources(
        fs,
        ctx,
        parseDeps,
        rootPath,
        resolved.calleePath,
      );
      const calleeAbs = isAbsolute(resolved.calleePath)
        ? resolved.calleePath
        : resolvePath(dirname(rootPath), resolved.calleePath);
      const calleeAbsNormalized = calleeAbs.replace(/\\/g, "/");
      const calleeTheta = thetas.find(
        (theta) =>
          theta.sourcePath !== undefined &&
          theta.sourcePath.replace(/\\/g, "/") === calleeAbsNormalized,
      );
      byName.set(presentedName, { theta: calleeTheta, sources });
    }
  }
  // File-derivation fallback: covers the marked root's OWN row (bug 0328 —
  // a root has no entry for itself in its own callable set) and any other
  // marshalled name the snapshot pass above did not resolve.
  for (const theta of thetas) {
    if (theta.sourcePath === undefined) {
      continue;
    }
    const name = deriveCallableName(theta.sourcePath);
    if (!marshalled.has(name) || byName.has(name)) {
      continue;
    }
    const sources = await collectCallableClosureSources(
      fs,
      ctx,
      parseDeps,
      undefined,
      theta.sourcePath,
    );
    byName.set(name, { theta, sources });
  }
  const result = verifyChildCallableHashes({
    env,
    discovery: (name) => byName.get(name)?.sources,
  });
  if (result.refusals.length === 0) {
    return [...thetas];
  }
  const dropped = new Set<ParsedTheta>();
  for (const outcome of result.outcomes) {
    if (outcome.verification.ok) {
      continue;
    }
    emitDiagnostic(outcome.verification.diagnostic);
    const hit = byName.get(outcome.callableName);
    if (hit?.theta !== undefined) {
      dropped.add(hit.theta);
    }
  }
  return thetas.filter((theta) => !dropped.has(theta));
}

/**
 * The extension-instance wiring the shipped factory drives: the initial
 * `session_start` thetas plus the step-5 watcher installer
 * (registration-steps.md#watcher-hot-reload-registration). Threaded from the
 * composition root so the factory can arm ONE watcher over the discovery-root
 * union + settings-file paths and run the debounced rebuild against the live
 * `pi` + `ctx`.
 */
export interface ExtensionInstanceWiring {
  /** The composed runnable thetas registered at `session_start`. */
  readonly thetas: readonly ParsedTheta[];
  /**
   * The live `ThetaRegistry` the hot-reload swaps atomically (PIC-36) — the
   * source of truth for the dispatchable theta SET across reloads (Pi exposes no
   * `pi.unregisterCommand`, so a removed theta is dropped here rather than from
   * Pi's command list).
   */
  readonly registry: ThetaRegistry;
  /**
   * Decision 6 / Increment B1 (active-invocation-registry.md): the live
   * extension-instance-scoped registry of in-flight invocations, shared with
   * every composed theta's producer. Threaded to the factory so its
   * `session_shutdown` teardown reads the SAME instance the bind choke points
   * register into — making sub-step 2 (cancel in-flight) + sub-step 3 (await
   * dispose) operate on REAL entries rather than a fresh empty registry.
   */
  readonly activeInvocations: ActiveInvocationRegistry;
  /**
   * Decision 6 / Increment B2 (session-shutdown-semantics.md sub-step 5): the
   * live extension-instance-scoped sink of invocation-scoped forwarding
   * listeners, shared with every composed theta's producer. Threaded to the
   * factory so its `session_shutdown` sub-step 5 detaches the SAME listeners the
   * bind choke points push — detaching those still attached for an invocation
   * in-flight at shutdown (a normal settle already spliced+detached its own).
   * Exposed as the mutable array (not a `readonly` view) because it is a live
   * sink the producer pushes onto and splices off across the instance lifetime.
   */
  readonly forwardingSignals: ForwardingSignalSource[];
  /**
   * The live `Clock` seam the composition root built once and the step-5
   * watcher / 250 ms debounce measure against. Threaded so the factory's
   * `session_shutdown` teardown reads the SAME clock instance the watcher used
   * (`runSessionShutdown` sub-step 3 bounds its settle-all against it).
   */
  readonly clock: Clock;
  /**
   * Arm the step-5 watcher + debounced hot-reload. `reRegister` is the
   * factory's own `session_start` registration step (collision pass +
   * `pi.registerCommand`), re-run on each reload against the freshly-composed
   * thetas. Returns the `session_shutdown` teardown handle.
   */
  installHotReload(
    reRegister: (thetas: readonly ParsedTheta[]) => void,
  ): HotReloadHandle;
}

/**
 * Compose one extension instance: run the initial discovery + compose pass over
 * a single runtime root, then expose the step-5 watcher installer. The runtime
 * root (its `FileWatcher` + `Clock` seams) is constructed ONCE and retained so
 * the armed watcher and the 250 ms debounce measure against the same seams the
 * initial pass used; each hot-reload re-runs `runComposePass` against that same
 * root (`PiFileSystem` re-reads live disk), routing watcher-time load/parse/
 * re-merge diagnostics onto the `theta-system-note` channel as ERR-7.
 */
export async function composeExtensionInstance(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  overrides?: ComposeSeamOverrides,
  rendererGate?: RendererGate,
  // Bug 0024 (registration-steps.md#pic-69): the LIVE own-registration ledger
  // owned by the factory closure (`factory.ts`) — an alias, not a snapshot, so
  // every pass this call arms (the initial pass below AND every later
  // hot-reload rediscover pass) reads whatever names are registered as of
  // THAT pass, including ones this same call's own initial pass or a prior
  // generation registered. A caller that omits it (one constructing no
  // factory, and so holding no ledger) supplies no own-name exclusion to the
  // initial pass — `undefined` states exactly that, and PIC-69 keys the
  // exclusion on ledger membership, so inventing a substitute set from
  // `pi.getCommands()` would exclude a foreign extension's command this
  // instance never registered and disable theta-vs-foreign collision
  // detection. The hot-reload rediscover pass keeps the registry-snapshot
  // carve-out below in that case.
  ownRegisteredNames?: ReadonlySet<string>,
): Promise<ExtensionInstanceWiring> {
  // The transient toast + stderr emit. Retained ONLY as the `theta-system-note`
  // channel's own delivery-failure fallback: it MUST stay off-channel so a
  // throwing `pi.sendMessage` does not re-enter the channel (the PIC-54
  // terminal arm of the System-notes fallback chain).
  const emitToast = makeLoadEmit(ctx);

  // The `theta-system-note` delivery channel: carries the informational
  // structural-change note, the LOAD-phase pre-evaluation failures
  // (ERR-1…ERR-6/ERR-16), and the watcher-time reload failures (ERR-7) — all
  // `triggerTurn:false`. Its fallback emit is the off-channel toast.
  // `rendererGate` (bug 0023 element 2) threads the SAME instance the factory
  // degrades on a `pi.registerMessageRenderer` failure, so the degrade branch
  // below reads live state instead of a permanently-absent gate.
  const channel = buildSystemNoteDeps(pi, ctx, emitToast, rendererGate);

  // V4e — the load-time pre-evaluation failure router. Each error-severity
  // load-phase diagnostic routes onto the `theta-system-note` channel with the
  // fixed `triggerTurn:false` option, so the shipped LOAD path surfaces load
  // failures on the SAME channel the wired RELOAD path uses (hot-reload.ts),
  // rather than the transient toast (closing notes.md's "known load-phase
  // routing gap"). error-model.md pins that every pre-evaluation failure
  // "surfaces per Diagnostics on the theta-system-note channel, does not fire a
  // new turn (triggerTurn:false)". Severity split (bug 0013): the eight
  // pre-eval FAILURES are all error-severity, so ERRORS route per-diagnostic
  // through the pre-eval router; a load-phase WARNING is not a pre-eval
  // failure (the V4e router's cause mapping is error-shaped), but
  // diagnostic-shape.md's persistent-diagnostics default carries no severity
  // carve-out, so a group's warnings deliver DIRECTLY onto the same
  // `theta-system-note` channel as ONE `emitDiagnosticBatch` note per emitted
  // group (content: the rendered batch; display:true; details.diagnostics;
  // triggerTurn:false) — one file's warnings never fan out one note per
  // warning (the multi-error one-`sendMessage`-per-`.theta` rule). A routed
  // note is best-effort and never aborts `session_start` (the theta is
  // dropped, not the session).
  const preEvalRouter = createLoadFailurePreEvalRouter({ channel });
  const emitLoadNoteGroup = (diagnostics: readonly Diagnostic[]): void => {
    for (const diagnostic of diagnostics) {
      if (diagnostic.severity !== "error") {
        continue;
      }
      preEvalRouter.routePreEvalFailure(preEvalCauseOf(diagnostic.code), {
        content: renderDiagnosticBatch([diagnostic]),
        display: true,
        details: { diagnostics: [diagnostic] },
      });
    }
    const warnings = diagnostics.filter(
      (diagnostic) => diagnostic.severity === "warning",
    );
    if (warnings.length > 0) {
      emitDiagnosticBatch(warnings, channel);
    }
  };
  const emitLoadNote = (diagnostic: Diagnostic): void => {
    emitLoadNoteGroup([diagnostic]);
  };
  const loadSink: LoadDiagnosticSink = {
    emit: emitLoadNote,
    emitGroup: emitLoadNoteGroup,
  };

  // The single-diagnostic handle outlives the pass (the `AjvSchemaValidator`
  // seam retains it); its warning arm delivers immediately — nothing buffers —
  // so a post-pass emit cannot rot (schema-validator constructs error-only
  // diagnostics today, so no live warning arrives here at the pin).
  const root = buildRuntimeRoot(ctx, emitLoadNote, overrides);

  // Decision 6 / Increment B1 (active-invocation-registry.md): ONE
  // extension-instance-scoped registry of in-flight invocations, constructed
  // beside `root` and shared with (a) every composed theta's producer via
  // `runComposePass` and (b) the factory's `session_shutdown` teardown via the
  // returned wiring — so sub-steps 2/3 operate on the SAME entries the bind
  // choke points register. Reused across hot-reload passes.
  const activeInvocations = new ActiveInvocationRegistry();

  // Decision 6 / Increment B2 (session-shutdown-semantics.md sub-step 5): ONE
  // extension-instance-scoped sink of invocation-scoped forwarding listeners,
  // constructed beside `activeInvocations` and shared with (a) every composed
  // theta's producer via `runComposePass` and (b) the factory's
  // `session_shutdown` teardown via the returned wiring — so sub-step 5 detaches
  // the SAME listeners the bind choke points push. Reused across hot-reload
  // passes.
  const forwardingSignals: ForwardingSignalSource[] = [];

  // Watcher-time re-compose diagnostics (re-parse / re-merge failures) reuse the
  // same channel routing as the initial load pass, so load and reload surface
  // load-phase failures identically (the ERR-7 `theta/runtime/registry-swap-failed`
  // failure proper is emitted separately inside hot-reload.ts).
  // package-and-settings.md §"Watcher-time reload failures". Reusing the same
  // sink means watcher-time re-compose delivers WARNINGS identically too — a
  // re-scan re-emits with no dedup (diagnostic-shape.md re-scan rule).
  const emitErr7 = loadSink;

  const initial = await runComposePass(
    pi,
    ctx,
    root,
    loadSink,
    activeInvocations,
    forwardingSignals,
    ownRegisteredNames,
    overrides?.subagentExecutableHost,
    overrides?.emitResultEnvelope,
    rendererGate,
  );

  // The watched set: `watchRoots` (the file-derived active-root union unioned
  // with the discovery walk's resolved four-source (cli/settings/project/global) present-directory union;
  // production-composition.ts's own `watchRoots` computation) plus the two
  // settings-file paths (project `<config-dir>/settings.json` and global
  // `<global-agent-dir>/settings.json`, both resolved against the running host —
  // `.pi` on Pi, `.omp` on Oh-My-Pi, and a relocated global directory under
  // either). `watchRoots` rather than `activeRoots` so a present-but-empty
  // active root (a scaffolded `.pi/theta/`) is armed: the first `.theta`
  // created there must still fire a watcher event (bug 0310).
  const roots = [
    ...initial.watchRoots,
    ...settingsFilePaths(ctx, root.fileSystem),
  ];

  // The live `ThetaRegistry` the reload swaps atomically (PIC-36), seeded with
  // the initial registered thetas.
  const registry = new ThetaRegistry(
    initial.thetas.map((theta) => [theta.slashName, theta] as const),
  );

  return {
    thetas: initial.thetas,
    registry,
    activeInvocations,
    forwardingSignals,
    clock: root.clock,
    installHotReload(reRegister): HotReloadHandle {
      return installHotReload({
        watcher: root.fileWatcher,
        clock: root.clock,
        roots,
        registry,
        channel,
        rediscover: async () =>
          (
            await runComposePass(
              pi,
              ctx,
              root,
              emitErr7,
              activeInvocations,
              forwardingSignals,
              // Bug 0024 (registration-steps.md#pic-69): prefer the factory's
              // live ledger — it also excludes a name a PRIOR generation
              // registered and this reload's own registry never held. Absent a
              // ledger, the live registry's keys are the widest own-name
              // evidence this call holds: every one of them reached
              // `pi.registerCommand` through the initial pass or an earlier
              // reload of this same call.
              ownRegisteredNames ?? new Set(registry.snapshot().keys()),
              overrides?.subagentExecutableHost,
              overrides?.emitResultEnvelope,
              rendererGate,
            )
          ).thetas,
        reRegister,
        initialNames: initial.thetas.map((theta) => theta.slashName),
        // Bug 0018 (PIC-67) stale-runtime entry probe: read the `ctx.cwd`
        // getter — side-effect-free on a live ctx, and the cheapest guarded
        // surface this wiring already holds. On a runtime invalidated WITHOUT
        // `session_shutdown` (bare `AgentSession.dispose()` — the one host path
        // that never runs the step-4 teardown, so `detach()` never marked the
        // debouncer torn-down) the read throws the host stale-ctx error and the
        // reload pass quiesces before touching any other surface.
        probeRuntime: () => {
          void ctx.cwd;
        },
      });
    },
  };
}

/**
 * The two settings-file paths the watcher covers: the project
 * `<config-dir>/settings.json` (relative to `ctx.cwd`, with the config-dir name
 * from the `FileSystem` seam) and the global `<globalAgentDir>/settings.json`.
 * Both track the running host, and both MUST agree with `loadSettings`, which
 * resolves the same two files the same way — a watcher pointed at a path the
 * loader never reads would leave a live edit of the real global settings file
 * undetected until the next session.
 *
 * The global arm takes the host's OWN resolved global agent directory rather
 * than `<homedir>/<config-dir>/agent`, because Pi relocates it via
 * `PI_CODING_AGENT_DIR` and Oh-My-Pi via an active profile or `PI_CONFIG_DIR`.
 * Per package-and-settings.md §"Settings file reads".
 */
function settingsFilePaths(
  ctx: ExtensionContext,
  fileSystem: FileSystem,
): readonly string[] {
  return [
    resolvePath(ctx.cwd, fileSystem.configDirName(), "settings.json"),
    resolvePath(fileSystem.globalAgentDir(), "settings.json"),
  ];
}

/**
 * Bug 0010 increment C — the LOAD-pass typed-query provider-gate wiring
 * (conversation-drive.md §"Provider compatibility for typed queries"): compose
 * the body walk (`detectTypedQueryExpression`), the frontmatter `model:`
 * resolution (injected, `matchAvailableModel`-bound in production), and the
 * existing `checkTypedQueryProviderSupport` emitter. Returns the
 * `theta/load/typed-query-unsupported-provider` WARNING, or `null` when:
 *
 *  - the theta declares no `model:` (the session model is unknown at load; the
 *    runtime gate still covers the `ctx.model` fallback);
 *  - the reference resolves to no available model (an unresolvable `model:` is
 *    already the binder-model machinery's concern — nothing to classify);
 *  - the body carries no typed query;
 *  - the resolved api is inside `TYPED_QUERY_SUPPORTED_PROVIDER_APIS` (the
 *    emitter's own supported-set check).
 *
 * The theta registers either way — the diagnostic is warning-severity.
 */
export function checkThetaTypedQueryProviderSupport(input: {
  readonly file: string;
  readonly body: ThetaBody;
  readonly modelReference: string | undefined;
  readonly resolveModel: (
    reference: string,
  ) => { readonly api: string } | undefined;
}): Diagnostic | null {
  if (input.modelReference === undefined) {
    return null;
  }
  const model = input.resolveModel(input.modelReference);
  if (model === undefined) {
    return null;
  }
  if (!detectTypedQueryExpression(input.body)) {
    return null;
  }
  return checkTypedQueryProviderSupport({
    file: input.file,
    hasTypedQuery: true,
    api: String(model.api),
    modelReference: input.modelReference,
  });
}

/**
 * INV-3 arity support: parse a callee `.theta` at `absolutePath` and report its
 * `params:` arity counts — the total field count and the count of fields that
 * are neither defaulted nor optional (the minimum required arity). Returns
 * `undefined` when the callee is unreadable / unparseable (not statically
 * resolvable), so the arity check is skipped and the runtime AJV net applies.
 */
async function resolveCalleeArity(
  fs: FileSystem,
  absolutePath: string,
  deps: PassParseDeps,
): Promise<CalleeArity | undefined> {
  const bytes = await fs.readBytes(absolutePath).then(
    (value) => value,
    () => undefined,
  );
  if (bytes === undefined) {
    return undefined;
  }
  // Bug 0264: route through the pass-scoped cache — this callee may already
  // have been parsed this pass (a discovered theta, or another `.theta`-callable
  // arity check reaching the same file).
  const document = parseViaPassCache({ path: absolutePath, bytes }, deps);
  if (document.frontmatter === null || hasLoadParseError(document.diagnostics)) {
    return undefined;
  }
  const fields = document.frontmatter.params?.fields ?? [];
  const requiredCount = fields.filter(
    (field) => !field.hasDefault && field.optional !== true,
  ).length;
  return {
    requiredCount,
    totalCount: fields.length,
    // Bug 0072 / bug 0137: both per-argument type-mismatch checks
    // (`theta/parse/tool-arg-type-mismatch`, `theta/parse/invoke-arg-type-mismatch`;
    // tool-calls.md §"Argument shape", invocation.md §"Argument binding") need
    // each `params:` field's verbatim declared type AND name, positionally —
    // `field.type` / `field.wireName` ARE that verbatim source
    // (frontmatter.ts's `splitParamValue` sets `type` unchanged; `wireName` is
    // the `params:` YAML key exactly as written, `BypassParamsField`).
    fields: fields.map((field) => ({ typeSource: field.type, name: field.wireName })),
  };
}

/**
 * A file-head located range used for the load-path `tools:`-resolution
 * diagnostics whose obligation carries no finer source span through the shipped
 * discovery seam (the parsed frontmatter does not retain a per-`tools:`-entry
 * range). The range is not asserted by any V20a obligation — the tests anchor on
 * the diagnostic code and its registry *Message* string — so a file-head span is
 * a faithful load-path locator. See notes.md.
 */
const TOOLS_DIAGNOSTIC_RANGE = {
  start: { line: 1, column: 1 },
  end: { line: 1, column: 1 },
} as const;

/** A pre-parsed `.theta` callee, resolved once per load pass for the tools scan. */
interface CalleeParse {
  /**
   * Whether the `.theta` path resolved to a readable file. `false` only when the
   * path resolves to no file (drives `theta/load/unresolvable-theta-path`); a file
   * that exists but fails to parse is `fileExists: true` with `hasErrors: true`
   * (drives `theta/load/callee-has-errors`) — the spec's deliberate split between
   * "resolves to no file" and "exists but failed its own structural checks".
   * Also `true` on an escaping entry (see `escape` below): the path read
   * successfully and is rejected on containment, not on resolvability, so
   * `resolveThetaCallee` must resolve it rather than separately reporting
   * `theta/load/unresolvable-theta-path` for the same callee.
   */
  readonly fileExists: boolean;
  /**
   * The callee's declared `mode:` (gates `theta/load/prompt-mode-callable`).
   * Falls back to `subagent` for a file that exists but carries no parseable
   * frontmatter, so the callee-has-errors rejection — not a spurious
   * prompt-mode/unresolvable diagnostic — is the sole rejection for that callee.
   * Also `subagent` (neutral) on an escaping entry, for the same reason.
   */
  readonly mode: ThetaMode;
  /**
   * Whether the callee carries its own error-severity load/parse diagnostics.
   * Neutrally `false` on an escaping entry: its bytes are never parsed, so this
   * rule has no subject there (bug 0110 §Fix constraint 1).
   */
  readonly hasErrors: boolean;
  /**
   * INV-1 (invocation.md §Resolution) / bug 0110: present iff the entry's
   * resolved path failed the discovery-root containment check
   * (`checkInvokePathAtLoad`). The callee's own bytes are never read once this
   * is set, so `mode` / `hasErrors` above stay at their neutral defaults.
   */
  readonly escape?: Diagnostic;
  /**
   * Bug 0111 / INV-1: one diagnostic per escaping entry of THIS callee's OWN
   * `tools:` list, judged against the callee's own directory the same way a
   * discovered theta's entries are judged against its directory. Only
   * populated for a callee that passed its own containment check (`escape` is
   * absent) and whose bytes parsed to non-null frontmatter — an escaping or
   * unreadable callee's contents are never read (§Fix constraint 2). Absent
   * (not empty) when the callee declares no `tools:` or none of its entries
   * escape.
   */
  readonly nestedToolsEscapes?: readonly Diagnostic[];
}

/** The outcome of resolving a discovered theta's `tools:` callable set at load. */
interface ThetaToolsResolution {
  /** Every load-time diagnostic; error-severity entries un-register the theta. */
  readonly diagnostics: readonly Diagnostic[];
  /**
   * The frozen callable-set snapshot the runtime enforces against. Present
   * whenever the theta registers (an EMPTY frozen snapshot for a theta with no
   * `tools:` — the empty callable set the runtime treats as "no `<name>(...)`
   * callables"); absent only when a `tools:` rejection un-registered the theta.
   */
  readonly callableSet?: CallableSetSnapshot;
  /**
   * PIC-64: the presented callable names (post-`as` rename) in the resolved
   * callable set that are EXTENSION tools (admitted via the mode-independent
   * `pi.getAllTools()` registry-snapshot admission, not host built-ins, not
   * `.theta` callees). The LOAD-time code-side reachability refusal reads this
   * to decide which code-side calls need a dispatch rung. Absent / empty when
   * the theta declares no extension-tool callable.
   */
  readonly extensionToolNames?: ReadonlySet<string>;
  /**
   * The launched ROOT callee's own transitive-closure content hash, captured
   * at load (`captureRootClosureHash`) and threaded through unchanged from
   * both return sites (INCLUDING the no-`tools:` early return — bug 0328's
   * second half is that a `tools:`-less callee cleared the carrier entirely).
   * Captured for EVERY theta with a readable on-disk source — ANY theta can be
   * launched as a child root, a subagent-mode theta by slash/`invoke(...)`, or
   * a prompt-mode theta when a subagent caller invokes it — but marshalled
   * ONLY on the subagent-launch path.
   */
  readonly rootClosureHash?: { readonly name: string; readonly hash: string };
}

/** The empty frozen callable set for a theta that declares no `tools:`. */
const EMPTY_CALLABLE_SET: CallableSetSnapshot = Object.freeze({
  entries: new Map(),
});

/**
 * V20a — resolve a discovered theta's `tools:` callable set at production load
 * time, returning every load-time diagnostic (error-severity entries
 * un-register the theta) together with the frozen resolution snapshot the
 * runtime enforces against (QTL-2 / QTL-4). Pre-parses each distinct `.theta`
 * callee once so the synchronous `resolveThetaCallee` lookup `resolveCallableSet`
 * drives can read a resolved parse, and so the V15f callee-has-errors check and
 * the INV-1 containment check (bug 0110) can inspect it.
 */
async function resolveThetaToolsAtLoad(
  parsed: ThetaCompositionInput,
  fs: FileSystem,
  ctx: ExtensionContext,
  parseDeps: Parameters<typeof parseThetaDocument>[1],
  // frontmatter-fields-a.md §`tools` (bug 0001 amendment): the
  // `pi.getAllTools()` registry snapshot the MODE-INDEPENDENT admission reads.
  // Absent on harness paths (built-in admission only).
  getAllTools?: GetAllToolsSnapshot,
  // INV-1 (invocation.md §Resolution) / bug 0110, widened by bug 0111: the
  // active discovery-root union threaded by the discovered-theta compose pass
  // (call site below in this file), which judges BOTH an entry's own resolved
  // path AND — for a `.theta` `tools:` entry — that callee's own `tools:`
  // `.theta` entries (`parseCalleeForTools`'s `nestedToolsEscapes`). `undefined`
  // on the nested-callee dispatch parse (`parseCalleeTheta`'s call site below
  // in this file): sound for a callee reached through a `tools:` entry, because
  // that callee's own nested entries were already judged at the caller's load;
  // the residual uncovered case is a callee reached by an `invoke(...)`
  // literal, for which the runtime open-time re-check
  // (`#recheckCalleeContainment`) remains the containment backstop.
  activeRoots?: readonly string[],
): Promise<ThetaToolsResolution> {
  // Captured BEFORE the no-`tools:` early return: bug 0328's defect is that a
  // `tools:`-less subagent theta cleared the whole hash carrier, so its own
  // launched bytes were never validated against anything. The root's own
  // closure hash is independent of whether it declares `tools:`.
  const rootClosureHash = await captureRootClosureHash(parsed, fs, ctx, parseDeps);
  const rootClosureSpread =
    rootClosureHash !== undefined ? { rootClosureHash } : {};

  const toolsList = parsed.frontmatter.tools;
  if (
    toolsList === undefined ||
    toolsList.length === 0 ||
    parsed.sourcePath === undefined
  ) {
    // No `tools:` → the empty callable set (no `<name>(...)` callables). Attach
    // the empty frozen snapshot so the runtime enforces "no ambient tools"
    // rather than falling back to the producer-wide resolver.
    return { diagnostics: [], callableSet: EMPTY_CALLABLE_SET, ...rootClosureSpread };
  }
  const callerDir = dirname(parsed.sourcePath);
  const diagnostics: Diagnostic[] = [];

  // Pre-parse each distinct `.theta` callee once, keyed by the spec as written.
  //
  // Bug 0106 §Fix (b), second placement: gate on `parseToolsEntry` BEFORE
  // calling `toolsEntrySpec`. A malformed token sequence is not an entry of
  // either admitted kind (frontmatter-fields-a.md:88), so it references no
  // callee — `theta/load/callee-has-errors`' *Trigger*, "a `tools:` `.theta`
  // entry" (code-registry-load.md:41), presupposes a subject this input does
  // not have. Without the gate the cache still resolved, read and parsed the
  // entry's first token, so a malformed entry naming an existing erroneous
  // callee co-fired `callee-has-errors` alongside the grammar's own
  // `theta/load/malformed-tool-entry` rejection — one authoring mistake, two
  // error-severity diagnostics, when the entry's own disposition is already
  // the grammar rejection (code-registry-load.md:25, "one malformed entry
  // un-registers the whole theta"). The same narrowing also reaches the
  // INV-1 escape loop below over this same cache (`nestedToolsEscapes`, bug
  // 0110/0111): `theta/load/invoke-path-escape`'s *Trigger* (code-registry-
  // load.md:35) names "a `tools:` `.theta` entry" as one of its two admitted
  // subjects, and a malformed token sequence is no entry of either admitted
  // kind, so it is not that subject either.
  const calleeCache = new Map<string, CalleeParse>();
  for (const entry of toolsList) {
    if (parseToolsEntry(entry.trim()).kind !== "ok") {
      continue;
    }
    const spec = toolsEntrySpec(entry);
    if (spec.length > 0 && !isBareToolName(spec) && !calleeCache.has(spec)) {
      calleeCache.set(
        spec,
        await parseCalleeForTools(fs, ctx, callerDir, spec, parseDeps, getAllTools, activeRoots),
      );
    }
  }

  // INV-1 / bug 0110, widened by bug 0111: an entry whose resolved path
  // escapes every active discovery root is rejected on its path alone, before
  // any rule derived from the callee's contents runs — pushed FIRST, ahead of
  // the V15f callee-has-errors loop below, so a callable the spec says was
  // never created cannot also draw a content-derived diagnostic (tool-calls.md
  // §"Argument shape": "the callable is not created"; §Fix constraint 1). The
  // same loop also drains a passed-containment callee's OWN escaping `tools:`
  // entries (`nestedToolsEscapes`), located at THIS caller's file exactly like
  // a depth-0 escape: bug 0111's headline is that the identical entry shape
  // must draw the identical report whichever depth names it. Located exactly
  // as the other `tools:`-surface diagnostics below are (a file-head span; the
  // parsed frontmatter carries no finer per-entry range).
  for (const callee of calleeCache.values()) {
    if (callee.escape !== undefined) {
      diagnostics.push({
        ...callee.escape,
        file: parsed.sourcePath,
        range: TOOLS_DIAGNOSTIC_RANGE,
      });
    }
    for (const nestedEscape of callee.nestedToolsEscapes ?? []) {
      diagnostics.push({
        ...nestedEscape,
        file: parsed.sourcePath,
        range: TOOLS_DIAGNOSTIC_RANGE,
      });
    }
  }

  // callee-has-errors (V15f): a readable, parseable `.theta` callee that carries
  // its own error-severity load/parse diagnostics rejects the parent at load
  // time (`tools:` surface → error severity). An escaped entry is skipped
  // explicitly (not merely by its neutral `hasErrors: false`): its bytes were
  // never parsed, so this rule has no subject there (§Fix constraint 1).
  for (const [spec, callee] of calleeCache) {
    if (callee.escape === undefined && callee.fileExists && callee.hasErrors) {
      diagnostics.push(
        ...checkCalleeHasErrors({
          calleePath: spec,
          surface: "tools",
          hasErrors: true,
          relatedSites: [],
          site: { file: parsed.sourcePath, range: TOOLS_DIAGNOSTIC_RANGE },
        }),
      );
    }
  }

  const deps: CallableSetDeps = {
    resolvePiTool: (name) => {
      const builtin = resolvePiTool(name, ctx);
      if (builtin !== undefined) {
        // Built-in Pi tools resolve in both modes (unchanged in prompt mode).
        return { kind: "pi-tool", toolDefinition: builtin };
      }
      // frontmatter-fields-a.md §`tools` (bug 0001): registry-snapshot
      // admission is MODE-INDEPENDENT — an extension-supplied tool present in
      // `pi.getAllTools()` is admitted to the allowlist in prompt and subagent
      // mode alike (schema carried for the RFC-0002 disjointness check; the
      // launch-path trust inference reads its own fresh `pi.getAllTools()`
      // snapshot at spawn, never this entry). A name that is neither a
      // built-in, a `getAllTools()` name, nor a discovered `.theta` callable
      // still fails load with `theta/load/unknown-tool`.
      const extension = resolveRegistryExtensionTool(name, getAllTools);
      if (extension !== undefined) {
        return { kind: "pi-tool", toolDefinition: extension };
      }
      return undefined;
    },
    resolveThetaCallee: (thetaPath) => {
      const callee = calleeCache.get(thetaPath);
      if (callee === undefined || !callee.fileExists) {
        return undefined;
      }
      // Retain the callee path literal on the snapshot (SUBAG-2 / Gap-2): the
      // runtime resolves the callee by presented name from the frozen entry
      // rather than re-deriving it from the basename, which would drop the
      // hyphen→underscore + `as` rewrites and silently omit the callable.
      return { kind: "theta", mode: callee.mode, callee: undefined, calleePath: thetaPath };
    },
    reservedNames: collectReservedNames(parsed.body),
  };

  const result = resolveCallableSet({
    file: parsed.sourcePath,
    tools: { kind: "list", items: toolsList },
    deps,
  });
  diagnostics.push(...result.diagnostics);
  // A callee-has-errors rejection above sets an error diagnostic without an
  // error inside `resolveCallableSet`; the theta registers iff no error-severity
  // diagnostic was raised on either path.
  const registered = !diagnostics.some((d) => d.severity === "error");
  if (!registered) {
    return { diagnostics };
  }
  const baseSet = result.callableSet ?? EMPTY_CALLABLE_SET;
  // RFC-0005 #subagent-theta-callable-hash: capture each `.theta` callable's
  // transitive-closure content hash NOW, at load, from the on-disk bytes read
  // this pass, and store it on the frozen snapshot entry. The subagent launch
  // marshals this STORED value (never a fresh spawn-time re-read), so a file
  // edit between parent load and child spawn is detected as divergence.
  const callableSet = await attachLoadTimeClosureHashes(
    baseSet,
    fs,
    ctx,
    parseDeps,
    parsed.sourcePath,
  );
  return {
    diagnostics,
    callableSet,
    extensionToolNames: collectExtensionToolNames(callableSet, ctx),
    ...rootClosureSpread,
  };
}

/**
 * Capture the LAUNCHED ROOT callee's own transitive-closure content hash at
 * load, reusing the same machinery `attachLoadTimeClosureHashes` applies to
 * each `tools:` entry (`resolveCallableClosureHash`), keyed under the
 * child-derivable name (`deriveCallableName`) so the producer's marshalling
 * loop can add it to the same `PI_THETA_SUBAGENT_CALLABLE_HASHES` map.
 *
 * The hash is captured for EVERY theta with a readable on-disk source, because
 * ANY theta can be launched as a child root: a subagent-mode theta whenever it
 * is dispatched by slash or `invoke(...)`, and a prompt-mode theta when a
 * SUBAGENT-mode caller invokes it (the caller runs the prompt callee inside a
 * spawned child `pi` process, not in-process — see the producer's
 * `#driveCallee` and invocation.md). Gating capture on `mode: subagent` here
 * would leave that spawned prompt callee's root unhashed, so the child could
 * execute a diverged root undetected. The captured value is marshalled ONLY on
 * the subagent-launch path (`spawnSubagentConversation` reads
 * `theta.rootClosureHash`); a prompt-mode theta dispatched normally, in-process
 * by slash or prompt, never marshals it, so in-process dispatch is unaffected.
 *
 * An in-memory fixture has no on-disk root to re-read, so a theta with no
 * `sourcePath` captures nothing. The `.thetalib`s reached via the root's OWN
 * callable-set `.theta` entries are already covered by those entries' per-entry
 * `closureHash` (`attachLoadTimeClosureHashes`); folding them in again here
 * would hash the same bytes under two different keys for no added coverage.
 */
async function captureRootClosureHash(
  parsed: ThetaCompositionInput,
  fs: FileSystem,
  ctx: ExtensionContext,
  parseDeps: Parameters<typeof parseThetaDocument>[1],
): Promise<{ readonly name: string; readonly hash: string } | undefined> {
  if (parsed.sourcePath === undefined) {
    return undefined;
  }
  const hash = await resolveCallableClosureHash(fs, ctx, parseDeps, undefined, parsed.sourcePath);
  return hash === undefined ? undefined : { name: deriveCallableName(parsed.sourcePath), hash };
}

/**
 * PIC-64: the presented callable names in `snapshot` that resolved to
 * EXTENSION tools rather than host built-ins. A `pi-tool` callable is an
 * extension tool exactly when its underlying name is not a host built-in
 * (`resolvePiTool` returns `undefined`): it can only have been admitted via the
 * mode-independent `pi.getAllTools()` registry-snapshot admission, and holds no
 * built-in `execute`, so a code-side call to it needs a PIC-64 dispatch rung.
 * `.theta` callees are excluded (they spawn their own child per PIC-58, never
 * host-loop dispatch).
 */
function collectExtensionToolNames(
  snapshot: CallableSetSnapshot,
  ctx: ExtensionContext,
): ReadonlySet<string> {
  const names = new Set<string>();
  for (const [presented, resolved] of snapshot.entries) {
    if (resolved.kind !== "pi-tool") {
      continue;
    }
    const underlying =
      (resolved.toolDefinition as { readonly toolName?: string } | undefined)?.toolName ??
      presented;
    if (resolvePiTool(underlying, ctx) === undefined) {
      names.add(presented);
    }
  }
  return names;
}

/**
 * RFC-0005 #subagent-theta-callable-hash: fill each `.theta`-callable snapshot
 * entry's `closureHash` from the transitive-closure content read at LOAD time.
 * Returns the original frozen snapshot unchanged when it holds no `.theta`
 * callable whose closure root is readable (a Pi-tool-only / empty set marshals
 * no hash). Capturing here — rather than at spawn — is what makes the
 * load-to-spawn divergence detectable: the child recomputes from its own disk
 * bytes and refuses on mismatch against this frozen value.
 */
async function attachLoadTimeClosureHashes(
  snapshot: CallableSetSnapshot,
  fs: FileSystem,
  ctx: ExtensionContext,
  parseDeps: Parameters<typeof parseThetaDocument>[1],
  callerPath: string | undefined,
): Promise<CallableSetSnapshot> {
  let mutated = false;
  const entries = new Map(snapshot.entries);
  for (const [name, entry] of entries) {
    if (entry.kind !== "theta") {
      continue;
    }
    const closureHash = await resolveCallableClosureHash(
      fs,
      ctx,
      parseDeps,
      callerPath,
      entry.calleePath,
    );
    if (closureHash !== undefined) {
      entries.set(name, { ...entry, closureHash });
      mutated = true;
    }
  }
  return mutated ? Object.freeze({ entries }) : snapshot;
}

/**
 * Extract one `tools:` entry's callable spec (the token before an optional
 * `as <name>` rename). A PURE first-token projection — it applies no grammar
 * decision itself and returns `parts[0]` for any token count, malformed input
 * included. Grammar-free by design: EVERY caller gates on `parseToolsEntry`
 * before calling this function (bug 0248 §Fix (a)/(b)), so a malformed token
 * sequence never reaches this projection at either depth — the pre-parse
 * callee-cache loop in `resolveThetaToolsAtLoad` (above) and
 * `checkNestedToolsContainment` (below) share the one gate. A reader must not
 * take this function's tolerance for a lock-step gap; the gate, not this
 * projection, decides what a malformed entry means.
 */
function toolsEntrySpec(entry: string): string {
  const parts = entry.trim().split(/\s+/).filter((p) => p.length > 0);
  return parts[0] ?? "";
}

/**
 * Whether a `tools:` spec is a bare Pi-tool name (identifier-shaped, no path
 * separator or `.theta` extension) rather than a `.theta` path literal — the same
 * routing `resolveCallableSet` applies internally.
 */
function isBareToolName(spec: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(spec);
}

/**
 * Pre-parse one `.theta` callee for the tools scan: resolve it against the
 * caller's directory, read it, check its resolved path's discovery-root
 * containment (INV-1 / bug 0110), and — for a contained entry — parse it and
 * report declared mode, whether it carries its own error-severity load/parse
 * diagnostics, and (bug 0111) the containment verdicts of the callee's OWN
 * `tools:` `.theta` entries, judged against the callee's own directory. An
 * unreadable path is `fileExists: false` (drives
 * `theta/load/unresolvable-theta-path` through `resolveCallableSet`); an
 * escaping path is reported via `escape` with neutral `mode` / `hasErrors`
 * (its bytes are never parsed — see `CalleeParse.escape`), and its OWN
 * `tools:` is therefore never inspected either.
 */
async function parseCalleeForTools(
  fs: FileSystem,
  ctx: ExtensionContext,
  callerDir: string,
  spec: string,
  deps: PassParseDeps,
  getAllTools: GetAllToolsSnapshot | undefined,
  activeRoots?: readonly string[],
): Promise<CalleeParse> {
  const absolute = isAbsolute(spec) ? spec : resolvePath(callerDir, spec);
  const bytes = await fs.readBytes(absolute).then(
    (value) => value,
    () => undefined,
  );
  if (bytes === undefined) {
    return { fileExists: false, mode: "subagent", hasErrors: false };
  }

  // INV-1 (invocation.md §Resolution) / bug 0110: the same `realpath` +
  // discovery-root containment check the `invoke(...)` surface runs
  // (`checkInvokeStaticResolution`), so a `tools:` entry cannot mint a
  // callable the sandbox boundary is meant to refuse. Judged AFTER the read
  // above (a non-existent path keeps its `unresolvable-theta-path`
  // disposition) and BEFORE `parseThetaDocument` below, so an escaping
  // entry's own bytes are never parsed and no rule derived from its contents
  // can name it (tool-calls.md §"Argument shape" — "the callable is not
  // created"; §Fix constraint 1). `activeRoots` is `undefined` on the
  // nested-callee dispatch parse (`parseCalleeTheta`'s call site, below in
  // this file) — the discovered-theta pass is the only caller that threads
  // the active-root union, and bug 0111 judges a `tools:`-reached callee's own
  // nested entries only inside this same gate, below.
  if (activeRoots !== undefined) {
    // A `realpath` rejection (e.g. a root removed by a concurrent watch
    // event) is handled by the same rejection-to-`undefined` idiom the
    // `readBytes` call above and the `invoke(...)` loop
    // (`invoke-static-checks.ts`) use, never a broad `catch`: the entry is
    // left unjudgeable here rather than guessed at, and falls through to its
    // pre-fix disposition below — the runtime open-time re-check
    // (`#recheckCalleeContainment`) remains its backstop.
    const containment = await checkInvokePathAtLoad({
      deps: { fs },
      resolvedPath: absolute,
      literalPath: spec,
      activeRoots,
    }).then(
      (value) => value,
      () => undefined,
    );
    if (containment?.kind === "escape") {
      // Neutral `mode`/`hasErrors` so neither `theta/load/prompt-mode-callable`
      // nor `theta/load/callee-has-errors` can co-fire against a callee whose
      // contents were never read; `fileExists: true` so `resolveThetaCallee`
      // resolves the entry instead of separately rejecting it as
      // `theta/load/unresolvable-theta-path`.
      return {
        fileExists: true,
        mode: "subagent",
        hasErrors: false,
        escape: containment.diagnostic,
      };
    }
  }

  // Bug 0264: this callee may already be parsed this pass — the discovery
  // walk, or another `tools:` entry naming the same `.theta`.
  const document = parseViaPassCache({ path: absolute, bytes }, deps);
  if (document.frontmatter === null) {
    // The file exists but produced no parseable frontmatter — an existing callee
    // that failed its own structural checks (callee-has-errors), not a path that
    // resolves to no file (unresolvable-theta-path).
    return { fileExists: true, mode: "subagent", hasErrors: true };
  }
  const nestedToolsEscapes = await checkNestedToolsContainment(
    fs,
    absolute,
    document.frontmatter.tools,
    activeRoots,
  );
  // Bug 0267: the callee's own parse document alone is not its registration
  // verdict — `checkThetaImports` and the callee's own `tools:` resolution
  // both run AFTER the callee's parse in that callee's own `runComposePass`
  // iteration, and a `tools:` scan reaching this file through the CALLER never
  // otherwise sees either. Widen the same predicate the V15f loop already
  // consumes rather than adding a second refusal path.
  const failsPostParseChecks = await calleeFailsOwnStructuralChecks(
    fs,
    ctx,
    deps,
    absolute,
    document.frontmatter,
    document.body,
    getAllTools,
    activeRoots,
    new Set([absolute]),
    bytes,
  );
  return {
    fileExists: true,
    mode: document.frontmatter.mode,
    hasErrors: hasLoadParseError(document.diagnostics) || failsPostParseChecks,
    ...(nestedToolsEscapes !== undefined ? { nestedToolsEscapes } : {}),
  };
}

/**
 * Bug 0267/0270/0271: whether `calleePath`'s ALREADY-PARSED document fails
 * checks that run after its own `parseThetaDocument` inside `runComposePass` —
 * checks invisible to `parseCalleeForTools`'s own `hasErrors`
 * (`hasLoadParseError(document.diagnostics)` above) because they are not part
 * of the parse document. THREE conditions (§Fix constraint 4 — the routes
 * reachable from a `tools:` scan at THIS point, not the full post-parse gate
 * set):
 *
 *   (i)   the callee's own `.thetalib` import resolution errors
 *         (`checkThetaImports`) — a malformed library, an unresolvable import
 *         path (IMP-1), or an unknown imported symbol. Observed with
 *         `claimDelivery: false` at every depth this predicate recurses to:
 *         this walk is never the callee's own `runComposePass` iteration and
 *         must not consume the pass-scoped delivered-set bug 0264's dedup
 *         introduced, or the callee's real iteration would find its rows
 *         already claimed and emit nothing on the channel — a note-count
 *         regression bug 0264's witness
 *         (`tests/thetalib-reparse-walk-single-delivery.test.ts`) locks. The
 *         recursive call at (iii) below reaches this same check on the
 *         grandchild with the same `claimDelivery: false`, so no depth ever
 *         claims delivery here.
 *   (ii)  the callee's OWN `tools:` resolution errors — `theta/load/unknown-tool`,
 *         bug 0270's `theta/load/unresolvable-theta-path`, and bug 0280's
 *         `theta/load/prompt-mode-callable` (the stub reports the callee's own
 *         recorded declared `mode`, so `resolveEntry` raises this code at
 *         every depth exactly as it does at depth 1), and nothing else. Bug
 *         0248's landed lockstep test
 *         (`tests/tools-entry-grammar-derivations-lockstep.test.ts`, cells D3/D5)
 *         settled that an entry-grammar rejection
 *         (`theta/load/malformed-tool-entry`, and by the same reasoning
 *         `invalid-tool-rename` / `invalid-derived-tool-name` /
 *         `invalid-pi-tool-name` / `tool-name-collision`) raised INSIDE
 *         `resolveCallableSet` is not `theta/load/callee-has-errors`'s subject:
 *         that code's Trigger presupposes a callee that failed its OWN parse
 *         or structural checks, and an entry-grammar rejection is neither.
 *         `theta/load/unknown-tool` and `theta/load/unresolvable-theta-path`
 *         are different: `resolveEntry` raises the former only for an entry
 *         that survived the grammar and named a Pi-tool callable this walk
 *         cannot resolve, and the latter only for a `.theta` entry
 *         `deps.resolveThetaCallee` itself reports unresolvable. Return filter
 *         is an explicit PER-ROUTE code list, never a general `registered`
 *         verdict and never an entry-grammar code (bug 0248 D3/D5 stay out).
 *   (iii) bug 0271 — a `.theta` entry in the callee's OWN `tools:` names a
 *         GRANDCHILD that itself fails its own structural checks, judged by a
 *         RECURSIVE call to this same predicate. Mirrors `parseCalleeForTools`'s
 *         own `hasErrors` composition
 *         (`hasLoadParseError(document.diagnostics) || failsPostParseChecks`)
 *         exactly: a grandchild spec fails when its parse via the pass cache
 *         yields `frontmatter === null`, OR `hasLoadParseError(diagnostics)`,
 *         OR this predicate recurses over it and answers `true` — one rule,
 *         composed by induction at every depth, rather than re-derived per
 *         level. Bug 0275 §Fix widens the admitted recursive verdict to the
 *         DEEP form `recursive.fails || recursive.ownEscapes`: a grandchild
 *         whose own `tools:` entry escapes now fails its own structural
 *         checks as seen by its caller, exactly as a grandchild that fails
 *         any other own-structural-check does.
 *
 * ROUTE ADJUDICATION (§Fix constraint 3). Two candidates: (a) chain on the
 * child's own V15f verdict, computed once per file during that file's own
 * `runComposePass` iteration; (b) an explicit bounded depth walk inside this
 * predicate. (a) is REJECTED: the pass keeps no cross-iteration verdict store,
 * and a grandparent's `runComposePass` iteration may precede the child's, so
 * reading the child's verdict would need a fixpoint or a second pass, making
 * the outcome depend on discovery ORDER. (b), taken here, is order-free — it
 * re-derives the grandchild's own verdict inline, and because it re-enters the
 * SAME predicate at every depth it composes by induction, exactly the
 * "one rule at every depth" property route (a) was wanted for, without the
 * ordering hazard.
 *
 * TERMINATION (§Fix constraint 2, a hard bound stated here, not implied by a
 * fixture set): an explicit VISITED SET of resolved absolute paths is threaded
 * through the recursion, seeded at both call sites (`parseCalleeForTools` and
 * `parseCalleeTheta`'s dispatch gate, below) with the callee's OWN absolute
 * path. A grandchild spec whose resolved absolute path is already in the set
 * is WITHHOLD (c) below — never a manufactured failure — so a `tools:` cycle
 * (A names B, B names A) terminates the first time the walk returns to a path
 * already on its own recursion stack, however many members the cycle has.
 *
 * WITHHOLDS — conditions this predicate deliberately does not turn into a
 * failure, at any depth:
 *   (a) an ESCAPING entry in a recursed-into file's own `tools:` — its bytes
 *       are NEVER parsed; the `continue` stays exactly where it was, because
 *       skipping the PARSE (the containment boundary and the termination
 *       bound) is correct at every depth and untouched by bug 0275 §Fix.
 *       What changed is that the branch is no longer a bare skip: taking it
 *       sets `ownEscapes` on THIS frame's return (bug 0275 §Fix constraint 1),
 *       an admitted refusal INPUT rather than a discarded fact. The withhold
 *       buys different things at different depths:
 *       - at recursion level 1 (the entry belongs to the CALLER's immediate
 *         callee) `ownEscapes` is still WITHHELD from `fails` at that same
 *         frame — {@link calleeFailsOwnStructuralChecks}, the boolean entry
 *         point, returns the SHALLOW `fails` and never folds in the frame's
 *         own `ownEscapes` — because the caller's own
 *         `checkNestedToolsContainment` already relocates that same entry's
 *         escape verdict onto the caller's file under
 *         `theta/load/invoke-path-escape`; admitting `ownEscapes` there too
 *         would draw a second row at that same file for one condition (bug
 *         0270 cells (D)/(D2)/(D3), bug 0271 cells (ESC)/(ESC2), bug 0275
 *         cell (C));
 *       - one level deeper, `ownEscapes` IS admitted: the recursive call site
 *         below folds it into `grandchildFails` as `recursive.fails ||
 *         recursive.ownEscapes` — the DEEP verdict — so a grandchild whose
 *         own entry escapes now fails its own structural checks as its
 *         caller's caller sees it. No relocation reaches that far
 *         (`checkNestedToolsContainment` is one level in, by construction),
 *         so the recursion is the only mechanism that can carry the verdict
 *         there, and bug 0275 is exactly that carriage. It is no longer a
 *         GAP at that depth: RELOCATION owns the entry owner's immediate
 *         caller (depth 1, `theta/load/invoke-path-escape`); the RECURSION
 *         owns every caller above it (`theta/load/callee-has-errors`,
 *         composing by induction through the deep verdict).
 *       Withheld from `fails` at recursion level 0 (this frame) rather than
 *       admitted directly because the condition is path-shaped — judged from
 *       the resolved path without reading the entry's contents — which is
 *       `checkNestedToolsContainment`'s surface, not this predicate's, and
 *       bug 0271 §Fix constraint 8 gives this report no authority over the
 *       bug 0248 cells that pin that helper's caller-side outcomes; carrying
 *       it out as a SEPARATE component (`ownEscapes`) rather than admitting
 *       it into `fails` directly is what lets the one caller who must not see
 *       it (the entry owner's immediate caller) omit it while every caller
 *       above admits it, with no second predicate and no depth parameter.
 *       Judging escape needs the caller's `activeRoots`, available at
 *       `parseCalleeForTools` and `undefined` at `parseCalleeTheta`'s dispatch
 *       gate (bug 0275 §Fix constraint 5): that gate never computes a
 *       containment component at all — `activeRoots` is `undefined` there by
 *       construction, so the `if (activeRoots !== undefined)` guard below
 *       never runs, no `ownEscapes` is ever set on that call path, and no
 *       `checkInvokePathAtLoad` probe fires. This is a recorded WITHHOLD of
 *       its own, not a residual gap: the runtime open-time re-check
 *       (`#recheckCalleeContainment`) remains that path's containment
 *       backstop, and synthesising an `activeRoots` union for the dispatch
 *       gate to widen it is out of this report's scope. What is unchanged at
 *       that gate is the ABSENCE of any containment judgement, not the reach
 *       of the parse, which now goes one level deeper there exactly as it
 *       does at load time. Order: read, then judge containment, then parse —
 *       the same order `parseCalleeForTools` runs at depth 1 — so an
 *       escaping spec's bytes never reach `parseViaPassCache`.
 *   (b) none — the declared-mode route is ADMITTED, not withheld (bug 0280;
 *       route (ii) above): the pre-resolution probe below records each
 *       readable-and-parsed spec's declared `mode`, keyed exactly as
 *       `readable` is, and the stub returns it instead of a constant.
 *       `resolveEntry` (`callable-set.ts:422`) is the one implementation that
 *       raises `theta/load/prompt-mode-callable`, so this frame raises the
 *       same code the depth-1 path raises — one code site, every depth, no
 *       divergence between depths (bug 0248's class). A declared mode is a
 *       pure function of the callee's own bytes, exactly like `ownEscapes`
 *       below, so it needs no memo dimension and no taint component (bug
 *       0276 §Fix constraint 3).
 *   (c) a member already in the visited set (the termination bound above) —
 *       not a failure, a WITHHOLD: over-refusing a cycle member would be a
 *       false refusal this predicate must never manufacture.
 *   (d) any entry the entry-grammar gate skipped before this walk runs (bug
 *       0248 cells (D3)/(D5) stay out) — an entry-grammar rejection is not
 *       `callee-has-errors`'s subject, exactly as it is not at depth 1.
 *
 * Returns the verdict triple `{ fails, ownEscapes, consultedVisited }`; every
 * diagnostic this walk produces, at every depth, is discarded (no
 * `deps.emitDiagnostic?.(…)` call belongs here). The bare boolean the two call
 * sites see is `calleeFailsOwnStructuralChecks`'s, three functions down, which
 * returns this triple's shallow `fails` alone. The callee's
 * OWN rows are emitted by the callee's own `runComposePass` iteration; the
 * CALLER's row is the existing V15f `theta/load/callee-has-errors` push in
 * `resolveThetaToolsAtLoad`, reached because this helper's input widened.
 * `parseViaPassCache` at every recursion depth only reads a document's already
 * -computed diagnostics — it never calls `claimUndelivered`, so no depth ever
 * claims a delivered diagnostic the owning file's own iteration still needs
 * (bug 0264's note-count witness, verified unchanged). The SAME helper is
 * called at `parseCalleeTheta`'s dispatch gate (§Fix constraint 5), so one
 * predicate serves both sites and every depth beneath them.
 *
 * Bug 0276 §Fix (route (a), a per-pass cycle-free verdict memo,
 * `pass-verdict-memo.ts`): this predicate is split into three layers so a
 * verdict can be reused across branches WITHOUT ever reusing one computed
 * under withhold (c) above — the one branch-dependent input.
 *   - {@link calleeFailsOwnStructuralChecksBody} is the walk above, returning
 *     `{ fails, ownEscapes, consultedVisited }` (bug 0275 §Fix widened this
 *     from the `{ fails, consultedVisited }` pair bug 0276 shipped):
 *     `ownEscapes` is true iff at least one `.theta` entry of THIS frame's own
 *     `tools:` list was judged `escape` by `checkInvokePathAtLoad` — withhold
 *     (a) taken at THIS frame, never at a deeper one (a deeper frame's own
 *     escape is carried in ITS OWN `ownEscapes`, folded into `fails` one level
 *     up through the deep verdict, never re-surfaced here). `consultedVisited`
 *     is unchanged: true iff THIS frame took withhold (c) for any entry, OR
 *     any recursive child (reached through
 *     {@link calleeFailsOwnStructuralChecksWithTaint}, not this function
 *     directly) reported `consultedVisited: true`. `ownEscapes` carries no
 *     taint of its own — it is a pure function of THIS frame's own `tools:`
 *     list and `activeRoots`, never of which branch reached this frame — so
 *     it needs no taint tracking beside `consultedVisited`'s.
 *   - {@link calleeFailsOwnStructuralChecksWithTaint} is the thin per-frame
 *     wrapper: it consults `deps.passVerdictMemo` for `(getAllTools,
 *     activeRoots, calleeAbsolutePath)` byte-guarded by `bytes`; a HIT
 *     returns `{ fails, ownEscapes, consultedVisited: false }` without running
 *     the body at all — a hit contributes no visited-set consultation of its
 *     own, by construction. A MISS runs the body and, only when the body
 *     reports `consultedVisited === false`, writes BOTH `fails` and
 *     `ownEscapes` back as one pair (bug 0275 §Fix constraint 2: the memo KEY
 *     is unchanged — no depth dimension is added — because both components
 *     are pure functions of the same inputs the key already carries; see
 *     `pass-verdict-memo.ts`'s module doc-comment for why that is what keeps
 *     bug 0276's taint rule, §Fix constraint 4, unchanged). This is the
 *     function the recursive call at withhold (c)'s sibling site below now
 *     calls, so a memo hit deep in one branch can short-circuit the rest of
 *     that branch's own recursion.
 *   - `calleeFailsOwnStructuralChecks` (below) is the boolean-returning entry
 *     point `parseCalleeForTools` and `parseCalleeTheta`'s dispatch gate
 *     call, taking the callee's `bytes` too (both call sites already hold
 *     them) so the memo can byte-guard at the top of the recursion exactly as
 *     it does at every depth beneath it. It keeps returning the SHALLOW
 *     `fails` — `ownEscapes` is discarded at the entry point, never folded
 *     in — which is what makes bug 0275 §Fix constraint 2 hold with no
 *     special case: at the caller's immediate callee the relocation already
 *     covers that entry, and the recursion's own deep-verdict folding (one
 *     level further in, inside {@link calleeFailsOwnStructuralChecksBody}'s
 *     loop) is what reaches every caller above it.
 *
 * SOUNDNESS (why memoising an untainted verdict is safe — the full argument
 * lives in `pass-verdict-memo.ts`'s module doc-comment): an untainted verdict
 * for file X means no frame beneath X's own walk consulted the visited set,
 * so X's whole reachable set was judged with no branch skipped. If a LATER
 * query reached X from a different branch and that branch's own ancestor A
 * were also reachable from X, X would reach A and A would reach X (the later
 * branch's edge into X), so X would reach X — and X's own untainted walk,
 * seeded with X in `visited`, would have hit X and been tainted. Contradiction.
 * An untainted verdict is therefore a function of X's bytes and its
 * acyclic-from-X subtree alone: path-independent, hence memoisable, and
 * serving it can never introduce or elide a withhold-(c) hit that a full
 * recomputation would not also have produced. The argument composes by
 * induction over memo hits consulted inside another frame's own untainted
 * computation, because a hit itself contributes `consultedVisited: false`.
 */
async function calleeFailsOwnStructuralChecksBody(
  fs: FileSystem,
  ctx: ExtensionContext,
  deps: PassParseDeps,
  calleeAbsolutePath: string,
  frontmatter: ThetaCompositionInput["frontmatter"],
  body: ThetaBody,
  getAllTools: GetAllToolsSnapshot | undefined,
  activeRoots: readonly string[] | undefined,
  visited: ReadonlySet<string>,
): Promise<{ fails: boolean; ownEscapes: boolean; consultedVisited: boolean }> {
  const calleeInput: ThetaCompositionInput = {
    slashName: thetaBasename(calleeAbsolutePath),
    sourcePath: calleeAbsolutePath,
    frontmatter,
    body,
  };
  const importCheck = await checkThetaImports(calleeInput, {
    fs,
    parseDeps: deps,
    claimDelivery: false,
  });
  if (importCheck.diagnostics.some((d) => d.severity === "error")) {
    // Bug 0275 §Fix constraint 1: the early returns carry `ownEscapes: false`
    // — an import-error frame never reached its own `tools:` loop, so it
    // never took withhold (a) for any entry of its own.
    return { fails: true, ownEscapes: false, consultedVisited: false };
  }

  const toolsList = frontmatter.tools;
  if (toolsList === undefined || toolsList.length === 0) {
    return { fails: false, ownEscapes: false, consultedVisited: false };
  }

  // Bug 0276 §Fix constraint 4: true iff THIS frame took withhold (c) for any
  // entry, or a recursive child reported it took (or inherited) one — the
  // taint that gates whether this frame's own verdict may be memoised.
  let consultedVisited = false;

  // Bug 0270 pre-resolution / bug 0271 recursive judgement, ONE loop, ONE read
  // per spec: probe each of the callee's OWN `.theta` entries for
  // existence/readability BEFORE `resolveCallableSet` runs, keyed by the spec
  // AS WRITTEN — the same key `resolveThetaCallee` below is called with —
  // resolved against the CALLEE's directory exactly as
  // `checkNestedToolsContainment` resolves the same callee's entries. A spec
  // that fails `parseToolsEntry`, is empty, or is a bare Pi-tool name is
  // skipped exactly like the depth-0 cache loop and `checkNestedToolsContainment`
  // skip it — it names no `.theta` path, so it is never a candidate for either
  // map below. The bytes bug 0270's probe reads are the SAME bytes bug 0271's
  // judgement parses; no second `fs.readBytes` call is made for a spec this
  // loop already read.
  const calleeDir = dirname(calleeAbsolutePath);
  const readable = new Map<string, boolean>();
  // Bug 0280 §Fix route (a): each readable-and-parsed spec's declared
  // frontmatter `mode`, keyed exactly as `readable` is (the spec AS
  // WRITTEN) — the SAME `document` this loop already produces for
  // `grandchildFails`, no second `fs.readBytes` and no reordering of
  // read/containment/parse. A spec that escapes containment (withhold (a))
  // or is unreadable is never entered here, so the stub below keeps its
  // neutral `mode: "subagent"` default for those — the non-co-fire cell in
  // `tests/nested-tools-entry-containment.test.ts`: mode is judged from
  // CONTENT, and content is never reached for a spec containment or
  // readability already refused.
  const declaredMode = new Map<string, ThetaMode>();
  const grandchildFails = new Map<string, boolean>();
  // Bug 0275 §Fix constraint 1: true iff at least one of THIS frame's own
  // `tools:` entries was judged `escape` below (withhold (a) taken at THIS
  // frame). Discarded by the boolean entry point
  // (`calleeFailsOwnStructuralChecks`) so the entry owner's immediate caller
  // draws no second row for the entry the relocation already covers; admitted
  // one level further up, through the recursive call's `recursive.ownEscapes`
  // fold below, so every caller above that immediate one sees it.
  let ownEscapes = false;
  for (const entry of toolsList) {
    if (parseToolsEntry(entry.trim()).kind !== "ok") {
      continue;
    }
    const spec = toolsEntrySpec(entry);
    if (spec.length === 0 || isBareToolName(spec) || readable.has(spec)) {
      continue;
    }
    const nestedAbsolute = isAbsolute(spec) ? spec : resolvePath(calleeDir, spec);
    // Rejection-to-`undefined`, the house idiom `parseCalleeForTools` and
    // `checkNestedToolsContainment` both use for a probe read — never a broad
    // `catch`.
    const bytes = await fs.readBytes(nestedAbsolute).then(
      (value) => value,
      () => undefined,
    );
    readable.set(spec, bytes !== undefined);
    if (bytes === undefined) {
      // Unreadable: bug 0270's route owns this spec
      // (`theta/load/unresolvable-theta-path`, via the stub below) — there is
      // no document to judge, so this loop has no further business with it.
      continue;
    }

    // WITHHOLD (c) — termination bound: a resolved absolute path already on
    // this walk's own recursion stack closes a `tools:` cycle here rather than
    // recursing again. The read above still stands (bug 0270's route is
    // unaffected); only the recursive structural judgement is bounded. This is
    // the predicate's one branch-dependent input (bug 0276 §Fix), so taking
    // this branch taints this frame's verdict against memoisation.
    if (visited.has(nestedAbsolute)) {
      consultedVisited = true;
      continue;
    }

    // WITHHOLD (a) — an ESCAPING grandchild's bytes must never be parsed.
    // `activeRoots` is `undefined` at `parseCalleeTheta`'s dispatch gate, so no
    // containment judgement runs there, at this depth or any deeper one —
    // exactly the depth-1 disposition already documented at that call site.
    if (activeRoots !== undefined) {
      const containment = await checkInvokePathAtLoad({
        deps: { fs },
        resolvedPath: nestedAbsolute,
        literalPath: spec,
        activeRoots,
      }).then(
        (value) => value,
        () => undefined,
      );
      if (containment?.kind === "escape") {
        // Bug 0275 §Fix constraint 1: an escaping entry's bytes are still
        // never parsed — the `continue` is unchanged — but this frame's own
        // withhold (a) is now an admitted refusal INPUT rather than a
        // discarded fact, carried separately from `fails` so the one caller
        // who must not see it (this file's own immediate caller) can still
        // omit it (see the doc-comment above).
        ownEscapes = true;
        continue;
      }
    }

    // Read, then containment, then parse — the same order `parseCalleeForTools`
    // runs at depth 1 — so an escaping spec never reaches this line.
    const document = parseViaPassCache({ path: nestedAbsolute, bytes }, deps);
    if (document.frontmatter !== null) {
      // Bug 0280 §Fix route (a): recorded whenever frontmatter parsed, exactly
      // as `parseCalleeForTools` reads `document.frontmatter.mode` regardless
      // of a later `hasLoadParseError` — mode is a property of the
      // frontmatter, not of whether the body also carries a load error.
      declaredMode.set(spec, document.frontmatter.mode);
    }
    if (document.frontmatter === null || hasLoadParseError(document.diagnostics)) {
      grandchildFails.set(spec, true);
      continue;
    }
    // Admitted route (iii): the same predicate, one level deeper, through the
    // memo-consulting wrapper (bug 0276 §Fix) rather than this function
    // directly — a memo hit here can short-circuit the rest of this branch's
    // own recursion. The grandchild's declared mode is read above and handed
    // to the stub below (bug 0280 §Fix); this recursive call still judges
    // only the grandchild's OWN structural checks, not its mode — mode is
    // this frame's own `tools:` concern, raised by `resolveEntry` against
    // THIS frame's file, not folded into `recursive.fails`.
    const recursive = await calleeFailsOwnStructuralChecksWithTaint(
      fs,
      ctx,
      deps,
      nestedAbsolute,
      document.frontmatter,
      document.body,
      getAllTools,
      activeRoots,
      new Set([...visited, nestedAbsolute]),
      bytes,
    );
    // Bug 0275 §Fix: the DEEP verdict — a grandchild whose OWN `tools:`
    // entry escapes fails its own structural checks as seen by THIS frame,
    // exactly as a grandchild that fails any other own-structural-check
    // does. No relocation reaches this deep, so admitting it here is the
    // only mechanism that carries the verdict this far.
    grandchildFails.set(spec, recursive.fails || recursive.ownEscapes);
    consultedVisited = consultedVisited || recursive.consultedVisited;
  }

  const stubDeps: CallableSetDeps = {
    resolvePiTool: (name) => {
      const builtin = resolvePiTool(name, ctx);
      if (builtin !== undefined) {
        return { kind: "pi-tool", toolDefinition: builtin };
      }
      const extension = resolveRegistryExtensionTool(name, getAllTools);
      if (extension !== undefined) {
        return { kind: "pi-tool", toolDefinition: extension };
      }
      return undefined;
    },
    // `undefined` ONLY for a spec the pre-resolution probe above recorded
    // unreadable — the one condition `resolveEntry`'s `resolved === undefined`
    // arm needs to raise `theta/load/unresolvable-theta-path` against the
    // callee. Every other spec's `mode` comes from `declaredMode` when the
    // probe above parsed the spec's frontmatter (bug 0280 §Fix route (a));
    // `"subagent"` remains the default for a spec `declaredMode` never
    // entered — an escaping spec (withhold (a)) or one whose grandchild
    // verdict is otherwise carried through `grandchildFails` instead of the
    // stub's shape (`tests/nested-tools-entry-containment.test.ts:729–743`
    // needs that default to stay neutral for the escape arm).
    resolveThetaCallee: (thetaPath) =>
      readable.get(thetaPath) === false
        ? undefined
        : {
            kind: "theta",
            mode: declaredMode.get(thetaPath) ?? "subagent",
            callee: undefined,
            calleePath: thetaPath,
          },
    reservedNames: collectReservedNames(body),
  };
  const result = resolveCallableSet({
    file: calleeAbsolutePath,
    tools: { kind: "list", items: toolsList },
    deps: stubDeps,
  });
  // Explicit per-route code list (see the doc-comment above): row 4
  // (`theta/load/unknown-tool`), bug 0270's route
  // (`theta/load/unresolvable-theta-path`), and bug 0280's route
  // (`theta/load/prompt-mode-callable`, raised by `resolveEntry` now that the
  // stub above reports a real mode) — OR'd with bug 0271's recursive
  // judgement of the callee's own `tools:` entries — never a general
  // `registered` verdict, and never an entry-grammar code (bug 0248 D3/D5 stay
  // out).
  const fails =
    result.diagnostics.some(
      (d) =>
        d.severity === "error" &&
        (d.code === "theta/load/unknown-tool" ||
          d.code === "theta/load/unresolvable-theta-path" ||
          d.code === "theta/load/prompt-mode-callable"),
    ) || [...grandchildFails.values()].some((f) => f);
  return { fails, ownEscapes, consultedVisited };
}

/**
 * Bug 0276 §Fix: the thin per-frame memo wrapper — see
 * {@link calleeFailsOwnStructuralChecksBody}'s doc-comment for the split and
 * the soundness argument. Consults `deps.passVerdictMemo` (when present) for
 * `(getAllTools, activeRoots, calleeAbsolutePath)` byte-guarded by `bytes`;
 * on a HIT, returns the memoised `{ fails, ownEscapes }` pair (bug 0275
 * §Fix widened the memo entry from a bare `fails` boolean to the pair) with
 * `consultedVisited: false` without recomputing anything. On a MISS, runs
 * the body and, only when the body itself reports `consultedVisited ===
 * false`, writes the fresh `{ fails, ownEscapes }` pair back — a verdict
 * computed under withhold (c) anywhere beneath it is never stored.
 */
async function calleeFailsOwnStructuralChecksWithTaint(
  fs: FileSystem,
  ctx: ExtensionContext,
  deps: PassVerdictDeps,
  calleeAbsolutePath: string,
  frontmatter: ThetaCompositionInput["frontmatter"],
  body: ThetaBody,
  getAllTools: GetAllToolsSnapshot | undefined,
  activeRoots: readonly string[] | undefined,
  visited: ReadonlySet<string>,
  bytes: Uint8Array,
): Promise<{ fails: boolean; ownEscapes: boolean; consultedVisited: boolean }> {
  const memo = deps.passVerdictMemo;
  if (memo !== undefined) {
    const hit = memo.read(getAllTools, activeRoots, calleeAbsolutePath, bytes);
    if (hit !== undefined) {
      return { fails: hit.fails, ownEscapes: hit.ownEscapes, consultedVisited: false };
    }
  }
  const result = await calleeFailsOwnStructuralChecksBody(
    fs,
    ctx,
    deps,
    calleeAbsolutePath,
    frontmatter,
    body,
    getAllTools,
    activeRoots,
    visited,
  );
  if (memo !== undefined && !result.consultedVisited) {
    memo.write(getAllTools, activeRoots, calleeAbsolutePath, bytes, {
      fails: result.fails,
      ownEscapes: result.ownEscapes,
    });
  }
  return result;
}

/**
 * Bug 0276 §Fix constraint 6: the boolean-returning entry point
 * `parseCalleeForTools` and `parseCalleeTheta`'s dispatch gate call, taking
 * the callee's already-read `bytes` so
 * {@link calleeFailsOwnStructuralChecksWithTaint} can byte-guard the memo at
 * the top of the recursion exactly as it does at every depth beneath it.
 * Bug 0275 §Fix constraint 3: returns the SHALLOW `fails` only — the pair's
 * `ownEscapes` component is discarded here, never folded in. This is what
 * makes §Fix constraint 2 hold with no special case: at the caller's
 * immediate callee the caller's own `checkNestedToolsContainment` already
 * relocates that same entry's escape row onto the caller's file, so the
 * caller must not ALSO draw `theta/load/callee-has-errors` for it; one level
 * deeper no relocation reaches the caller, and the DEEP verdict
 * (`calleeFailsOwnStructuralChecksBody`'s `recursive.fails ||
 * recursive.ownEscapes` fold) is what the recursion consumes instead.
 * RELOCATION owns the entry owner's immediate caller (depth 1,
 * `theta/load/invoke-path-escape`); the RECURSION owns every caller above it
 * (`theta/load/callee-has-errors`).
 */
async function calleeFailsOwnStructuralChecks(
  fs: FileSystem,
  ctx: ExtensionContext,
  deps: PassVerdictDeps,
  calleeAbsolutePath: string,
  frontmatter: ThetaCompositionInput["frontmatter"],
  body: ThetaBody,
  getAllTools: GetAllToolsSnapshot | undefined,
  activeRoots: readonly string[] | undefined,
  visited: ReadonlySet<string>,
  bytes: Uint8Array,
): Promise<boolean> {
  const { fails } = await calleeFailsOwnStructuralChecksWithTaint(
    fs,
    ctx,
    deps,
    calleeAbsolutePath,
    frontmatter,
    body,
    getAllTools,
    activeRoots,
    visited,
    bytes,
  );
  return fails;
}

/**
 * Bug 0111 / INV-1, one level in: judge a `tools:`-reached callee's OWN
 * `tools:` `.theta` entries for discovery-root containment, resolved against
 * the CALLEE's directory (`calleeAbsolutePath`'s `dirname`) exactly as
 * `parseCalleeForTools` resolves its own spec. Reached only for a callee that
 * already passed its own containment check and whose bytes parsed to
 * non-null frontmatter (`parseCalleeForTools` above) — an escaping or
 * unreadable callee's contents are never read (§Fix constraint 2). A
 * malformed entry is gated on `parseToolsEntry` before the loop body runs
 * (bug 0248 §Fix (a)); bare Pi-tool names and empty specs are routed away
 * next, exactly like the depth-0 loop in `resolveThetaToolsAtLoad`. A full
 * callable-set resolution is deliberately not run here — only the path-shaped
 * rule this report's Fix scopes to — so no content-derived diagnostic can be
 * produced for an entry this function does not otherwise inspect. An entry
 * whose own read fails is skipped before the containment judgement (bug 0270
 * §Fix constraint 6). `undefined` when the callee declares no `tools:`, or
 * `activeRoots` is `undefined` (the nested-callee dispatch parse), or none of
 * its entries escape.
 */
async function checkNestedToolsContainment(
  fs: FileSystem,
  calleeAbsolutePath: string,
  calleeTools: readonly string[] | undefined,
  activeRoots: readonly string[] | undefined,
): Promise<readonly Diagnostic[] | undefined> {
  if (activeRoots === undefined || calleeTools === undefined || calleeTools.length === 0) {
    return undefined;
  }
  const calleeDir = dirname(calleeAbsolutePath);
  const escapes: Diagnostic[] = [];
  const judged = new Set<string>();
  for (const entry of calleeTools) {
    // Bug 0248 §Fix (a): gate on `parseToolsEntry` BEFORE `toolsEntrySpec`,
    // the same three lines in the same position as the depth-0 cache loop in
    // `resolveThetaToolsAtLoad` above. `theta/load/invoke-path-escape`'s
    // *Trigger* (code-registry-load.md:35) names "a `tools:` `.theta` entry"
    // as its admitted subject, and a malformed token sequence is not an entry
    // of either admitted kind (frontmatter-fields-a.md:88) at either depth —
    // bug 0111 ruled the *Trigger* names the entry kind, not the entry's
    // depth, so the same subject test governs this loop and the depth-0 one.
    // The callee still draws `theta/load/malformed-tool-entry` on its own
    // file when it is discovered in its own right, so no input loses its
    // refusal — this gate only stops the caller from ALSO refusing it under
    // the wrong *Trigger*.
    if (parseToolsEntry(entry.trim()).kind !== "ok") {
      continue;
    }
    const spec = toolsEntrySpec(entry);
    if (spec.length === 0 || isBareToolName(spec) || judged.has(spec)) {
      continue;
    }
    judged.add(spec);
    const nestedAbsolute = isAbsolute(spec) ? spec : resolvePath(calleeDir, spec);
    // Read BEFORE judging containment, the same order the depth-0 loop in
    // `parseCalleeForTools` runs, so the identical entry shape draws the
    // identical single report at both depths (bug 0111's headline): an entry
    // that exists and `realpath`s but cannot be READ (a directory named
    // `<name>.theta` rejects `EISDIR`) is the subject of
    // `theta/load/unresolvable-theta-path`, whose *Trigger* names a path that
    // "does not exist or is not readable" (code-registry-load.md), so it is
    // that route's row and not an escape row. Bytes are discarded, never
    // parsed — the non-recursion bound is untouched. Rejection-to-`undefined`,
    // the same idiom `parseCalleeForTools` uses for its own entry above —
    // never a broad `catch`.
    const nestedBytes = await fs.readBytes(nestedAbsolute).then(
      (value) => value,
      () => undefined,
    );
    if (nestedBytes === undefined) {
      continue;
    }
    const containment = await checkInvokePathAtLoad({
      deps: { fs },
      resolvedPath: nestedAbsolute,
      literalPath: spec,
      activeRoots,
    }).then(
      (value) => value,
      () => undefined,
    );
    if (containment?.kind === "escape") {
      escapes.push(containment.diagnostic);
    }
  }
  return escapes.length > 0 ? escapes : undefined;
}

/**
 * The names a callable-set entry must not collide with beyond the other
 * `tools:` entries: the theta's top-level `fn` declarations and imported symbols
 * (frontmatter-fields-a.md §`tools` — the top-level arm of
 * `theta/load/tool-name-collision`).
 */
function collectReservedNames(body: ThetaBody): ReadonlySet<string> {
  const names = new Set<string>();
  for (const statement of body.statements) {
    if (statement.kind === "fn") {
      names.add(statement.name);
    } else if (statement.kind === "import") {
      for (const symbol of statement.symbols) {
        names.add(symbol);
      }
    }
  }
  return names;
}

/** The theta-load-bearing shape of a host tool definition's `execute` member. */
type HostToolExecute = (
  toolCallId: string,
  params: never,
  signal: AbortSignal | undefined,
  onUpdate: undefined,
  ctx: ExtensionContext,
) => Promise<{ readonly content: readonly { readonly type: string }[] }>;

/**
 * H8b: construct the host built-in tool definition for `name` over `cwd`, or
 * `undefined` when the name is not a known host built-in. Each returns a
 * `ToolDefinition` whose `execute(...)` theta drives directly for a code-side
 * `<name>(args)` call (host-interfaces-core.md §"Tool execution from theta code").
 * A switch (not a module-level lookup object) keeps the composition root free of
 * module-level mutable state.
 */
function builtinToolDefinition(
  name: string,
  cwd: string,
): { execute: HostToolExecute; parameters?: unknown } | undefined {
  switch (name) {
    case "grep":
      return createGrepToolDefinition(cwd);
    case "read":
      return createReadToolDefinition(cwd);
    case "find":
      return createFindToolDefinition(cwd);
    case "ls":
      return createLsToolDefinition(cwd);
    case "bash":
      return createBashToolDefinition(cwd);
    case "edit":
      return createEditToolDefinition(cwd);
    case "write":
      return createWriteToolDefinition(cwd);
    default:
      return undefined;
  }
}

/**
 * Accessor for the RAW `pi.getAllTools()` snapshot the registry admission
 * reads. The entry shape is host-dependent (`ToolInfo[]` on Pi, `string[]` on
 * Oh-My-Pi), so the resolver normalises through `seams/host-tool-snapshot.ts`
 * rather than reading members off the raw entries.
 */
type GetAllToolsSnapshot = () => readonly HostToolSnapshotEntry[];

/**
 * The load-time resolved shape a `pi-tool` callable-set entry carries.
 * `execute` is present for host built-ins only; an extension entry is
 * execute-less by construction (the public extension API strips `execute`) and
 * dispatches through the PIC-64 ladder instead.
 */
interface PiToolLoadEntry {
  readonly toolName: string;
  /** The tool's registered input schema (RFC-0002 disjointness check reads it). */
  readonly parameters?: unknown;
  execute?: (id: string, params: unknown, signal: AbortSignal) => Promise<{ readonly content: readonly { readonly type: string }[] }>;
}

/**
 * frontmatter-fields-a.md §`tools` / §Resolution snapshot (bug 0001): resolve a
 * `tools:` name against the extension-registered tool set (`pi.getAllTools()`)
 * — MODE-INDEPENDENTLY (prompt and subagent alike). A name present there is
 * admitted to the frozen callable set as a `pi-tool` entry carrying exactly
 * the §Resolution-snapshot shape ("holds only the tool's name and `parameters`
 * schema"): (a) the underlying `toolName` — the PIC-17 install-vector / PIC-64
 * dispatch name, and the name the subagent launch contract emits in the
 * child's `--tools` allowlist — and (b) the tool's registered `parameters`
 * schema, so the RFC-0002 computed-argument disjointness check and the model
 * tool spec can see it. The entry holds NO `execute` — the public extension
 * API strips it — so code-side dispatch routes through the PIC-64 ladder
 * (host-loop dispatch today) rather than a direct execute handle; and the
 * launch-path trust inference (`inferChildTrust`,
 * #subagent-isolation-and-trust) reads a fresh `pi.getAllTools()` snapshot at
 * spawn, never this pinned entry.
 */
function resolveRegistryExtensionTool(
  name: string,
  getAllTools: GetAllToolsSnapshot | undefined,
): PiToolLoadEntry | undefined {
  const info = normalizeToolSnapshot(getAllTools?.() ?? []).find(
    (tool) => tool.name === name,
  );
  if (info === undefined) {
    return undefined;
  }
  // A host that publishes bare names supplies no schema; the field stays absent
  // (never `undefined`-as-a-value) so the RFC-0002 disjointness check reads
  // "schema unknown" rather than "schema is undefined".
  return {
    toolName: name,
    ...(info.parameters === undefined ? {} : { parameters: info.parameters }),
  };
}

/**
 * H8b: resolve a code-side Pi-tool name to its `execute` dispatch. Returns
 * `undefined` for a name that is not a known host built-in, so the code-side
 * path surfaces the unknown-tool execution `Err` rather than fabricating a
 * value. The synthesised `execute` invokes the host tool with a `theta-direct:`
 * tool-call id and maps its `AgentToolResult` to theta's `content`-only envelope.
 */
function resolvePiTool(
  name: string,
  ctx: ExtensionContext,
): {
  readonly toolName: string;
  readonly parameters?: unknown;
  execute: (id: string, params: unknown, signal: AbortSignal) => Promise<{ readonly content: readonly { readonly type: string }[] }>;
} | undefined {
  const definition = builtinToolDefinition(name, ctx.cwd);
  if (definition === undefined) {
    return undefined;
  }
  return {
    toolName: name,
    // Bug 0072: the snapshot entry carries the tool's registered input schema
    // for a host BUILT-IN, as `resolveRegistryExtensionTool` below carries it
    // for an extension tool — frontmatter-fields-a.md §`tools` binds every
    // resolved entry to it, and the pre-dispatch AJV check
    // (`#resolvePiToolForTheta` → `PiToolDispatch.parameters`) reads it from
    // there.
    parameters: definition.parameters,
    execute: async (id, params, signal) => {
      const result = await definition.execute(id, params as never, signal, undefined, ctx);
      return { content: result.content };
    },
  };
}

/**
 * H8b: resolve a callee path against the caller's directory (or `cwd` for an
 * in-memory caller) and parse it into a runnable composition input. Returns
 * `undefined` when the callee is missing / unparseable, so the invoke resolver
 * surfaces the `load_failure` `Err`.
 */
async function parseCalleeTheta(
  fs: FileSystem,
  ctx: ExtensionContext,
  callerPath: string | undefined,
  calleePath: string,
  deps: PassParseDeps,
  // Bug 0001 (frontmatter-fields-a.md §`tools`): the callee's own `tools:`
  // resolves against the `pi.getAllTools()` registry snapshot mode-independently,
  // exactly like a discovered theta.
  getAllTools?: GetAllToolsSnapshot,
): Promise<ThetaCompositionInput | undefined> {
  const baseDir = callerPath !== undefined ? dirname(callerPath) : ctx.cwd;
  const absolute = isAbsolute(calleePath) ? calleePath : resolvePath(baseDir, calleePath);
  const bytes = await fs.readBytes(absolute).then(
    (value) => value,
    () => undefined,
  );
  if (bytes === undefined) {
    return undefined;
  }
  // Bug 0264: this callee's own dispatch parse may re-reach a path already
  // parsed this pass (e.g. a callee named by two `invoke(...)` call sites).
  const document = parseViaPassCache({ path: absolute, bytes }, deps);
  if (document.frontmatter === null || hasLoadParseError(document.diagnostics)) {
    return undefined;
  }
  // Bug 0267 §Fix constraint 3: the SAME predicate as `parseCalleeForTools`'s
  // widened `hasErrors`, applied at this dispatch gate too, so a load-time
  // registration and this drive-time re-check cannot diverge in opposite
  // directions over the same callee.
  if (
    await calleeFailsOwnStructuralChecks(
      fs,
      ctx,
      deps,
      absolute,
      document.frontmatter,
      document.body,
      getAllTools,
      undefined,
      new Set([absolute]),
      bytes,
    )
  ) {
    return undefined;
  }
  const input: ThetaCompositionInput = {
    slashName: thetaBasename(absolute),
    sourcePath: absolute,
    frontmatter: document.frontmatter,
    body: document.body,
  };
  // Resolve and attach the callee's OWN frozen `tools:` callable set so an
  // invoked child enforces its callable set at runtime exactly like a discovered
  // theta (QTL-2 residual): without a snapshot the runtime falls back to the
  // unrestricted producer-wide resolver, letting a child with no/narrow `tools:`
  // reach ambient host tools (bash / read / …) from code. A no-`tools:` child
  // resolves to the frozen EMPTY snapshot, so it has no code callables.
  //
  // No `activeRoots` argument (INV-1 / bug 0110): this is the dispatch parse
  // of a callee reached by an `invoke(...)` literal — correct, not a gap, for
  // a callee reached through a `tools:` entry, whose own nested `tools:`
  // entries were already judged at the caller's load
  // (`resolveThetaToolsAtLoad`'s `nestedToolsEscapes`, bug 0111). The residual
  // this omission leaves open is a callee reached by an `invoke(...)` literal:
  // for that surface the runtime open-time re-check
  // (`#recheckCalleeContainment` in `production-theta-producer.ts`, mirroring
  // its own `activeRoots === undefined` early return) is the containment
  // backstop — an omitted union, not an empty one, is what turns the load-time
  // check off here.
  const toolResult = await resolveThetaToolsAtLoad(input, fs, ctx, deps, getAllTools);
  return {
    ...input,
    callableSet: toolResult.callableSet ?? EMPTY_CALLABLE_SET,
    // Bug 0328 §Fix: an invoke/`.theta`-callable dispatch to a subagent callee
    // launches THAT callee as the root of its own child, so its captured
    // closure hash threads through this dispatch parse exactly as it does the
    // discovered-theta compose pass above.
    ...(toolResult.rootClosureHash !== undefined
      ? { rootClosureHash: toolResult.rootClosureHash }
      : {}),
  };
}

/**
 * RFC-0005 #subagent-theta-callable-hash: compute the transitive-closure content
 * hash of a `.theta` callable (the root file plus every `.thetalib` it
 * transitively imports/re-exports), recorded at load and marshalled to the child
 * so the child can refuse the invocation on mismatch. Resolves the callee path
 * against the caller's directory (or `cwd` for an in-memory caller), reads each
 * closure member's exact on-disk content, and delegates to `hashCallableClosure`
 * (order-independent, content-only). Returns `undefined` when the root file
 * cannot be read (the caller then marshals no hash for it).
 */
async function resolveCallableClosureHash(
  fs: FileSystem,
  ctx: ExtensionContext,
  deps: Parameters<typeof parseThetaDocument>[1],
  callerPath: string | undefined,
  calleePath: string,
): Promise<string | undefined> {
  const sources = await collectCallableClosureSources(fs, ctx, deps, callerPath, calleePath);
  return sources.length === 0 ? undefined : hashCallableClosure(sources);
}

/**
 * RFC-0005 #subagent-theta-callable-hash: collect a `.theta` callable's
 * transitive-closure sources (the root file plus every `.thetalib` it
 * transitively imports/re-exports), each carrying its exact on-disk content.
 * The parent hashes these at load (`resolveCallableClosureHash`); the child
 * recomputes them from its OWN discovery for the content-hash verification
 * (`verifyChildCallableHashes`). Returns `[]` when the root file cannot be read.
 */
async function collectCallableClosureSources(
  fs: FileSystem,
  ctx: ExtensionContext,
  deps: PassParseDeps,
  callerPath: string | undefined,
  calleePath: string,
): Promise<readonly ClosureSource[]> {
  const baseDir = callerPath !== undefined ? dirname(callerPath) : ctx.cwd;
  const rootAbs = isAbsolute(calleePath) ? calleePath : resolvePath(baseDir, calleePath);
  const sources: ClosureSource[] = [];
  const seen = new Set<string>();
  const decoder = new TextDecoder();
  const visit = async (absPath: string): Promise<void> => {
    if (seen.has(absPath)) {
      return;
    }
    seen.add(absPath);
    const bytes = await fs.readBytes(absPath).then(
      (value) => value,
      () => undefined,
    );
    if (bytes === undefined) {
      return;
    }
    sources.push({ path: absPath, content: decoder.decode(bytes) });
    // Bug 0264: this closure walk re-parses each member on its own
    // (doc-comment above); route through the pass cache so a member already
    // parsed this pass — by the discovery walk, an importer, or another
    // closure walk — is not re-parsed and does not re-trigger `lexTheta`'s emit.
    const document = parseViaPassCache({ path: absPath, bytes }, deps);
    for (const statement of document.body.statements) {
      // Invariant: `statement.path` is `""` only for a statement already
      // refused at parse time (`theta/parse/import-missing-from-clause`,
      // imports.md §"Re-exports"; bug 0058 §Fix constraint 3), but that is
      // not the only route: an empty path literal is refused separately, by
      // the extension check. This walk re-parses each closure member on its own
      // and never reads `document.diagnostics`, so a refused statement's
      // empty path can still reach here; it resolves to the containing
      // directory, which `readBytes` below fails, and the walk already drops
      // it with no source added and no recursion — recorded as the input
      // class this branch now sees, not a guard it needs to add.
      if (statement.kind === "import" || statement.kind === "export") {
        const importAbs = isAbsolute(statement.path)
          ? statement.path
          : resolvePath(dirname(absPath), statement.path);
        await visit(importAbs);
      }
    }
  };
  await visit(rootAbs);
  return sources;
}

/**
 * Whether any aggregated diagnostic is an error-severity load / parse diagnostic
 * that must block registration (the frontmatter value-validations, the `params:`
 * named-type / ordering / default-literal checks, and the `system:` checks all
 * surface here). Warnings never block registration.
 */
function hasLoadParseError(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some(
    (diagnostic) =>
      diagnostic.severity === "error" &&
      (diagnostic.code.startsWith("theta/load/") ||
        diagnostic.code.startsWith("theta/parse/")),
  );
}

/** The `.theta` basename (minus extension) of a path, for the callee slash name. */
function thetaBasename(path: string): string {
  const base = path.slice(path.replace(/\\/g, "/").lastIndexOf("/") + 1);
  return base.endsWith(".theta") ? base.slice(0, -".theta".length) : base;
}

/**
 * The outcome of parsing one discovered `.theta`: either a runnable composition
 * input together with the document's surviving diagnostics, or a drop carrying
 * the load/parse diagnostics that caused the drop, so the caller can surface
 * BOTH outcomes' batches (FM-3 / DIAG-1). The registering arm's `diagnostics`
 * are warning-severity by construction — an error-severity load/parse
 * diagnostic takes the dropped arm — and must be forwarded, not discarded: a
 * warning alone never un-registers a theta, so this arm is the ONLY route by
 * which a registering theta's parse/frontmatter warnings reach a sink
 * (bug 0013 drop site 3).
 */
type ParsedDiscoveredTheta =
  | {
      readonly fixture: ThetaCompositionInput;
      readonly diagnostics: readonly Diagnostic[];
    }
  | { readonly dropped: readonly Diagnostic[] };

/** Read + parse one discovered `.theta` into its `V19a` frontmatter + body AST. */
async function parseDiscoveredTheta(
  fs: FileSystem,
  theta: DiscoveredTheta,
  deps: PassParseDeps,
): Promise<ParsedDiscoveredTheta> {
  const bytes = await fs.readBytes(theta.path).then(
    (value) => value,
    () => undefined,
  );
  if (bytes === undefined) {
    return { dropped: [] };
  }
  // Bug 0264: this is the discovery parse; when a `tools:` callee walk (or an
  // importer) reaches the SAME file first this pass, the cache returns that
  // parse instead of re-triggering `lexTheta`'s emit.
  const document = parseViaPassCache({ path: theta.path, bytes }, deps);
  if (document.frontmatter === null || hasLoadParseError(document.diagnostics)) {
    // A well-formed `.theta` carries `mode:` frontmatter and produces no
    // error-severity load/parse diagnostic; a frontmatter-less file cannot be
    // composed into a runnable fixture, and a theta that produced an
    // error-severity `theta/load/*` / `theta/parse/*` diagnostic (an invalid
    // frontmatter value, an unresolved param named type, a `system:`
    // interpolation error, …) must not register (warnings still register).
    //
    // FM-3: return the load-phase diagnostics so the caller emits them. DIAG-1
    // requires every author-visible drop to carry its registry code/message;
    // previously these were computed here and silently discarded, so a `mode:`
    // typo made the command vanish with no feedback. (The `tools:`-resolution
    // diagnostics are emitted separately by `resolveThetaToolsAtLoad` and are
    // not part of `document.diagnostics`, so this does not double-emit them.)
    //
    // RFC 0001 FN-6: when the error-severity diagnostic falls inside a
    // `subagent fn`'s inline body, ADD the `theta/load/callee-has-errors`
    // framing that names the FUNCTION (a broken `subagent fn` body is a
    // callee-with-errors, just an inline one). Only meaningful once frontmatter
    // parsed (a frontmatter-less file has no walkable top-level `subagent fn`).
    const subagentFnFraming =
      document.frontmatter === null
        ? []
        : checkSubagentFnStaticResolution({
            body: document.body,
            file: theta.path,
            parseDiagnostics: document.diagnostics,
          });
    // Bug 0255: `lexTheta` already delivered `document.deliveredDiagnostics`
    // through the V7d seam (`src/lexer/lexer.ts:131`/`:109`) before this parse
    // ran; re-delivering them here (`:808`'s `sink.emitGroup`) would double-
    // deliver every lex row. Exclude by object identity (a `Set`, not a code-
    // prefix test — `theta/parse/*` spans both the lex and parse phases, so a
    // prefix cannot tell them apart). `subagentFnFraming` is computed here, not
    // by the lexer, so it is never in `deliveredDiagnostics` and always ships.
    const delivered = new Set<Diagnostic>(document.deliveredDiagnostics);
    const undeliveredDocumentDiagnostics = document.diagnostics.filter(
      (diagnostic) => !delivered.has(diagnostic),
    );
    return { dropped: [...undeliveredDocumentDiagnostics, ...subagentFnFraming] };
  }
  return {
    fixture: {
      slashName: theta.name,
      sourcePath: theta.path,
      frontmatter: document.frontmatter,
      body: document.body,
    },
    // The registering path's document batch (warning-severity by the gate
    // above); the caller forwards it into the load-diagnostic sink as one
    // per-file group. No `deliveredDiagnostics` filter needed here: every
    // lexer-surfaced code is error-severity (bug 0255 §Affected), so any row
    // in `document.deliveredDiagnostics` would have tripped `hasLoadParseError`
    // above and taken the dropped arm instead — this arm's `document.diagnostics`
    // can only hold warning-severity rows the lexer never produces.
    diagnostics: document.diagnostics,
  };
}

/**
 * Split the `--theta` CLI flag value into discovery-source paths.
 *
 * Against the pinned host at most ONE string arrives here: pi's argv parser
 * stores extension flags in an unknownFlags Map (dist/cli/args.js), so a
 * repeated flag resolves to its LAST occurrence, and `pi.getFlag` is declared
 * `boolean | string | undefined` (dist/core/extensions/types.d.ts) — no array
 * can ever be delivered. Multi-root carriage is the single
 * `path.delimiter`-joined value (the discovery CLI-source convention; the
 * bug-0008 launcher fix emits exactly that form): each occurrence is split on
 * the platform PATH_DELIMITER, trimmed, empties dropped, and the de-duplicated
 * union returned. The array branch is therefore unreachable against the pinned
 * host and is KEPT deliberately as fail-safe hardening: were a future host to
 * surface repeated extension flags as an array, the pre-hardening
 * `typeof raw !== "string"` guard would have silently discarded EVERY
 * user-supplied path — the exact silent-root-loss class bug 0008 is about — so
 * the additive branch stays as cheap insurance.
 */
function readThetaFlagPaths(pi: ExtensionAPI): readonly string[] {
  const raw: unknown = pi.getFlag("theta");
  const occurrences: string[] = Array.isArray(raw)
    ? raw.filter((entry): entry is string => typeof entry === "string")
    : typeof raw === "string"
      ? [raw]
      : [];
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const occurrence of occurrences) {
    for (const entry of occurrence.split(PATH_DELIMITER)) {
      const trimmed = entry.trim();
      if (trimmed.length > 0 && !seen.has(trimmed)) {
        seen.add(trimmed);
        paths.push(trimmed);
      }
    }
  }
  return paths;
}

/**
 * The Pi-owned commands the cross-format collision check consults: the current
 * command snapshot filtered to the collision source set (`prompt` / `skill` /
 * `extension`). Read read-only-by-convention (PIC-39).
 */
function readPiOwnedCommands(
  pi: ExtensionAPI,
  excludeOwnedNames?: ReadonlySet<string>,
): readonly PiOwnedCommand[] {
  const owned: PiOwnedCommand[] = [];
  for (const command of pi.getCommands()) {
    if (
      command.source !== "prompt" &&
      command.source !== "skill" &&
      command.source !== "extension"
    ) {
      continue;
    }
    // PIC-69: the exclusion MUST be source-conditioned, never name-only —
    // gated here (after the source-membership test above) on
    // `source === "extension"` so only an entry indistinguishable from this
    // instance's own registration (Pi reports every extension's registered
    // command this way) is ever excluded. A `"prompt"` / `"skill"` entry of a
    // name this instance also registered still lands in the collision set, so
    // the source gate is tested FIRST: a name-only membership test would
    // silently swallow that genuine `prompt`/`skill` collision as well.
    if (command.source === "extension" && excludeOwnedNames?.has(command.name) === true) {
      continue;
    }
    owned.push({ name: command.name, source: command.source });
  }
  return owned;
}

/**
 * Adapt the host `pi` / `ctx` surface to the `V19a` parser note-channel deps.
 * `rendererGate` (bug 0023 element 2) is threaded onto the returned
 * `SystemNoteChannelDeps.rendererGate` so `system-note-channel.ts`'s degrade
 * branch reads this extension instance's live gate state instead of a
 * permanently-absent gate.
 */
function buildSystemNoteDeps(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  emitDiagnostic: (diagnostic: Diagnostic) => void,
  rendererGate?: RendererGate,
): SystemNoteChannelDeps {
  // Bug 0018 (PIC-67): one mutable delivery-health latch per channel instance
  // (stale-dead + fail-loud-once), closure-scoped — no module-level state.
  const health = new SystemNoteChannelHealth();
  return {
    health,
    pi: {
      sendMessage: (message, _options) => {
        pi.sendMessage(
          {
            customType: SYSTEM_NOTE_CHANNEL,
            content: message.content,
            display: message.display,
            details: message.details,
          },
          { triggerTurn: false },
        );
      },
    },
    ui: {
      notify: (message: string, type: "error") => ctx.ui.notify(message, type),
    },
    emitDiagnostic,
    ...(rendererGate !== undefined ? { rendererGate } : {}),
  };
}

// ---------------------------------------------------------------------------
// Bug 0023 — the production step-0 `ProbeHost` and the two-tier bootstrap-
// diagnostic sink.
// ---------------------------------------------------------------------------

/**
 * Build the step-0 `ProbeHost` (capability-probe.md) from the running
 * process, the injected `pi` handle, and the installed lock-step peers. The
 * `pi` member is the SAME object reference the factory was handed — not a
 * copy — so the probe inspects the host's real namespace rather than a
 * synthetic stand-in.
 */
export function createProductionProbeHost(pi: ExtensionAPI): ProbeHost {
  // This module's own directory is the walk's starting point (below):
  // `import.meta.url` is exempt from the ambient-primitive ban (the ban
  // covers `process.env` / `process.cwd` / timers / `Date.now`, not
  // `import.meta` or `process.versions`).
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return {
    nodeVersion: process.versions.node,
    abortController: AbortController,
    abortSignal: AbortSignal,
    pi: pi as unknown as Readonly<Record<string, unknown>>,
    typeboxType: Type,
    readPeerVersion: (pkg: string) =>
      readPeerVersion(pkg, moduleDir, VERSION),
  };
}

/**
 * The lock-step peer scope the extension is authored against. Every name in
 * `PEER_DEP_PACKAGES` (capability-probe.md Step 0 (d)) carries this scope.
 */
const AUTHORED_PEER_SCOPE = "@earendil-works/";

/**
 * Host scopes that publish the same four lock-step pi packages, in probe
 * order. A Pi host installs the authored `@earendil-works/*` scope; an
 * Oh-My-Pi host serves the identical surface under `@oh-my-pi/*` and remaps
 * `@earendil-works/*` imports onto it at load time, so a `package.json` under
 * the authored scope may not exist there at all. Probing both scopes is what
 * lets one build satisfy Step 0 (d) on either host. Frozen to stay off the
 * *No globals, statics, singletons* mutable-binding scan.
 */
const PEER_SCOPE_ALIASES: readonly string[] = Object.freeze([
  AUTHORED_PEER_SCOPE,
  "@oh-my-pi/",
]);

/**
 * The `readPeerVersion` mechanic (capability-probe.md Step 0 (d) /
 * `#step-0-d-recommended-recipe`) — load-bearing, not a simplification
 * candidate.
 *
 * The doc's own recommended recipe (`createRequire(import.meta.url).resolve(
 * "<pkg>")` + parent walk) is UNUSABLE here for two independent reasons.
 * First, it throws `ERR_PACKAGE_PATH_NOT_EXPORTED` against three of the four
 * pinned `@earendil-works/*` peers: their `"."` export publishes only `types`
 * and `import` conditions, leaving the CJS resolver no `require` condition to
 * match, and that throw is outside Step 0 (d)'s four closed conditions, so a
 * bare recipe routes those peers to `kind: "probe-failed"` and the shipped
 * extension would refuse to load on every host. Second, on an Oh-My-Pi host
 * the pi package specifiers are served by an ASYNCHRONOUS `Bun.plugin`
 * resolver; a synchronous `require.resolve` (or `import.meta.resolve`) cannot
 * drain the microtask queue that resolver awaits, so the call DEADLOCKS the
 * whole factory before any diagnostic can be emitted. Every rung below is
 * therefore a plain filesystem read or an already-evaluated in-process value —
 * no host resolver is entered.
 *
 * The doc permits "any `exports`-independent mechanic". This three-rung ladder
 * reproduces the four installation-observable conditions:
 *
 *   - Rung 1 walks `node_modules` ancestor directories from this module's own
 *     directory looking for `<authored scope><pkg>/package.json`. A plain file
 *     read consults no `exports` field, so an ESM-only peer answers here.
 *   - Rung 2 repeats that walk for every other known host scope
 *     (`PEER_SCOPE_ALIASES`), which is how an Oh-My-Pi source / npm install
 *     answers when the authored scope is absent from disk.
 *   - Rung 3 falls back to the host SDK's own in-process `VERSION` export.
 *     Both hosts export it from the coding-agent package root. This is the only
 *     readable answer on a COMPILED host binary, where the pi packages are
 *     bundled into the executable and no `package.json` exists on disk at all;
 *     it is also the most truthful answer available, since it is read off the
 *     very module instance the extension was linked against rather than off a
 *     sibling tree that may not be the one in use.
 *
 * First success wins; a resolved candidate whose `name` does not match the
 * candidate's own scoped spelling keeps walking rather than answering
 * "unresolvable" prematurely.
 *
 * Exported — rather than reached only through `createProductionProbeHost` —
 * because `moduleDir` and `hostSdkVersion` are the ladder's only ambient inputs,
 * so a caller supplying a planted tree and a chosen host version witnesses each
 * of the four installation-observable conditions, the rung-3 fallback, and the
 * throw-rather-than-answer arm that routes a genuine read/parse failure to
 * `kind: "probe-failed"`, directly at this seam. `hostSdkVersion` is a parameter
 * rather than a module-scope read for exactly that reason: a hardcoded import
 * would make rung 3 unconditional and the "unresolvable" condition unobservable.
 */
export function readPeerVersion(
  pkg: string,
  moduleDir: string,
  hostSdkVersion?: string,
): string | undefined {
  for (const scope of PEER_SCOPE_ALIASES) {
    // Re-spell the authored-scope peer under `scope`. A name outside the
    // authored scope is never rewritten, so a caller-supplied package that is
    // not one of the four pinned peers passes through untouched.
    const scoped =
      scope === AUTHORED_PEER_SCOPE || !pkg.startsWith(AUTHORED_PEER_SCOPE)
        ? pkg
        : `${scope}${pkg.slice(AUTHORED_PEER_SCOPE.length)}`;
    for (const candidate of peerPackageJsonCandidates(scoped, moduleDir)) {
      const parsed = readCandidatePackageJson(candidate);
      if (parsed === undefined) {
        continue; // no file at this candidate — keep walking.
      }
      if (parsed.name !== scoped) {
        continue; // a different package's package.json — keep walking.
      }
      // Conditions (2)/(3) collapse into the same `undefined` answer as
      // "unresolvable": a located `package.json` with no own (string) `version`
      // field is exactly as unreadable as no candidate at all.
      if (typeof parsed.version === "string") {
        return parsed.version;
      }
    }
  }
  // Rung 3 — the in-process host SDK version, for a PINNED lock-step peer only.
  // One host serves all four, so its single `VERSION` answers for each. The
  // membership test against the fixed four-name list (capability-probe.md
  // Step 0 (d): "the route is confined to the four pinned peers") is what keeps
  // this rung from swallowing condition (1): any other package — including an
  // authored-scope name outside the list — is still genuinely unresolvable, and
  // answering it with the host's own version would report a satisfied floor for
  // something that is not installed at all.
  if (!PEER_DEP_PACKAGES.includes(pkg)) {
    return undefined;
  }
  return hostSdkVersion;
}

/**
 * The ordered candidate `package.json` paths for `pkg`: the `node_modules`
 * ancestor walk from `moduleDir` up to the filesystem root. Filesystem-only by
 * design — see `readPeerVersion` for why no host resolver may be entered here.
 */
function peerPackageJsonCandidates(pkg: string, moduleDir: string): readonly string[] {
  const candidates: string[] = [];
  let dir = moduleDir;
  for (;;) {
    candidates.push(resolvePath(dir, "node_modules", pkg, "package.json"));
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return candidates;
}

/**
 * Read and parse one candidate `package.json` path. `undefined` when the path
 * does not exist (the ladder's next candidate is tried); any other read/parse
 * failure (`EACCES`, malformed JSON, a non-object root) propagates so
 * `runCapabilityProbe`'s Step 0 (d) loop routes it to `kind: "probe-failed"`
 * per capability-probe.md's Self-failure clause — `readPeerVersion` itself
 * never swallows a genuine read error.
 */
function readCandidatePackageJson(candidatePath: string): Record<string, unknown> | undefined {
  let raw: string;
  try {
    raw = readFileSync(candidatePath, "utf8"); // allow-sync: capability-probe step-0(d) peer-version read at factory-entry construction, before any async wiring
  } catch (readError: unknown) { // allow-broad-catch: theta/load/host-incompatible — pi-integration-contract/capability-probe.md#step-0-d-recommended-recipe
    if (readError instanceof Error && (readError as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw readError;
  }
  const parsed: unknown = JSON.parse(raw);
  if (parsed === null || typeof parsed !== "object") {
    throw new Error(`peer package.json at '${candidatePath}' did not parse to a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

/**
 * The production bootstrap-diagnostic sink (bug 0023, two-tier). Tier 1 (no
 * `ctx` latched — factory-time and any pre-`session_start` emission) delivers
 * through the partial `pi.sendMessage` → `console.error` chain, the
 * `ctx.ui.notify` rung being unreachable before any `ExtensionContext` exists.
 * Tier 2 (a `ctx` has been latched) delivers through the full
 * `sendSystemNote` → `ctx.ui.notify` → `console.error` chain via
 * `emitDiagnosticBatch` over channel deps built ONCE per latched `ctx`, so the
 * `SystemNoteChannelHealth` stale-dead and fail-loud-once latches persist
 * across every emission on that ctx. A repeat `session_start` re-latches with
 * fresh channel deps (a fresh `ctx` warrants a fresh health latch).
 */
export interface BootstrapDiagnosticSink {
  /** The `ThetaExtensionDeps.emitDiagnostic` seam. */
  readonly emit: (diagnostic: Diagnostic) => void;
  /** The `ThetaExtensionDeps.latchSessionContext` seam. */
  readonly latchSessionContext: (ctx: ExtensionContext) => void;
}

export function createBootstrapDiagnosticSink(
  pi: ExtensionAPI,
  rendererGate: RendererGate,
): BootstrapDiagnosticSink {
  // The tier-2 latch: `undefined` until `latchSessionContext` fills it, then
  // held for the rest of this extension instance's life (or until a repeat
  // `session_start` re-latches). Closure-scoped — no module-level state.
  let latched: { readonly channelDeps: SystemNoteChannelDeps } | undefined;

  return {
    emit: (diagnostic: Diagnostic): void => {
      if (latched === undefined) {
        emitBootstrapTier1(pi, rendererGate, diagnostic);
        return;
      }
      emitBootstrapTier2(latched.channelDeps, diagnostic);
    },
    latchSessionContext: (ctx: ExtensionContext): void => {
      latched = {
        channelDeps: buildSystemNoteDeps(pi, ctx, makeLoadEmit(ctx), rendererGate),
      };
    },
  };
}

/**
 * Tier 1 (bug 0023 D1): no `ctx` exists yet, so the `ctx.ui.notify` rung is
 * unreachable. `rendererGate.available()` selects the transcript arm; a
 * `pi.sendMessage` throw `isStaleCtxError` delivers nothing (PIC-67 clause
 * (c) — the runtime is invalidated and no surface of it can deliver); a
 * degraded gate or any other throw falls to the terminal `console.error`.
 */
function emitBootstrapTier1(
  pi: ExtensionAPI,
  rendererGate: RendererGate,
  diagnostic: Diagnostic,
): void {
  if (rendererGate.available()) {
    try {
      pi.sendMessage(
        {
          customType: SYSTEM_NOTE_CHANNEL,
          content: renderDiagnosticBatch([diagnostic]),
          display: true,
          details: { diagnostics: [diagnostic] },
        },
        { triggerTurn: false },
      );
      return;
    } catch (sendError: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
      if (isStaleCtxError(sendError)) {
        return;
      }
      // Non-stale throw — fall through to the terminal console.error below.
    }
  }
  emitBootstrapTerminal(diagnostic);
}

/**
 * Tier 2 (bug 0023 D1): a `ctx` has been latched, so `sendSystemNote`'s full
 * chain (owned by system-note-channel.ts) applies via `emitDiagnosticBatch`.
 * `isStaleCtxError` escaping it delivers nothing (PIC-67 clause (c)); any
 * other throw falls to the terminal `console.error`.
 */
function emitBootstrapTier2(
  channelDeps: SystemNoteChannelDeps,
  diagnostic: Diagnostic,
): void {
  try {
    emitDiagnosticBatch([diagnostic], channelDeps);
  } catch (e: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
    if (isStaleCtxError(e)) {
      return;
    }
    emitBootstrapTerminal(diagnostic);
  }
}

/**
 * The wrapped terminal `console.error` both tiers share: itself wrapped so a
 * throwing console (closed stdio, fd exhaustion) cannot escape.
 */
function emitBootstrapTerminal(diagnostic: Diagnostic): void {
  try {
    console.error(`theta: ${renderDiagnosticLine(diagnostic)}`);
  } catch (consoleError: unknown) { // allow-broad-catch: PIC-54 — runtime-event-channel.md#pic-54
    void consoleError;
  }
}

/**
 * PIC-11 (host-interfaces-services.md:46) keys the per-query validator cache
 * by the schema slug of the lowered per-query schema document, per the
 * canonical schema hash (schema-subset.md §Canonical schema hash). Exported
 * (not an inline closure) so the byte comparison the seam performs — the
 * 64-bit-collision arm at src/seams/schema-validator.ts:126-136 — is a
 * property of THIS function under test, not of a source-text pattern over the
 * module that happens to contain it.
 */
export function productionSchemaSlugOf(schema: LoweredSchema): SchemaSlug {
  // The argument is FOREIGN: the pre-dispatch AJV safety net drives this over
  // `PiToolDispatch.parameters` from the host tool registry, admitted behind
  // only an object/non-null/non-array guard. Round-tripping it through the
  // serialiser whose semantics the canonical form is defined against resolves
  // the JSON data model BY CONSTRUCTION rather than by a second
  // implementation of it: `toJSON` is invoked, boxed `Number`/`String`/
  // `Boolean` are unwrapped, array holes and non-finite numbers become `null`,
  // `undefined`/function/symbol properties are omitted, and a circular
  // structure or a `bigint` is refused with a `TypeError` — every one of them
  // exactly as the serialisation this recipe replaced resolved it, which is
  // what keeps a host schema's slug from moving for any shape a cached
  // artefact or a replayed provider payload can carry
  // (schema-subset.md:94). Hand-rolling those rules inside the hash function
  // would be the divergent second implementation the recipe exists to remove.
  // The refusals propagate untouched: a circular structure or a `bigint`
  // throws a `TypeError` from `JSON.stringify` before parsing is reached; a
  // root whose `toJSON` yields no JSON document at all (`JSON.stringify`
  // returning `undefined`) throws a `SyntaxError` from `JSON.parse(undefined)`
  // instead. Both are LOUD failures, and neither is worse than the
  // serialisation this replaced, which silently keyed the cache on the string
  // `undefined`, collapsing every such schema onto one validator.
  const document: unknown = JSON.parse(JSON.stringify(schema));
  // The internal callers (`respondSchemaSlug`, the binder envelope slug, the
  // PIC-44 stored bytes) hand the bridge lowering-constructed plain objects,
  // so they are deliberately left without this round trip: it would be cost
  // against no defect.
  const value = toLoweredJsonValue(document);
  return { slug: schemaSlug(value), canonicalBytes: canonicalForm(value) };
}
