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

import {
  delimiter as PATH_DELIMITER,
  dirname,
  isAbsolute,
  resolve as resolvePath,
} from "node:path";
import {
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  hashCallableClosure,
  type ClosureSource,
} from "../runtime/subagent-callable-hash";
import {
  readMarshalledCallableHashes,
  verifyChildCallableHashes,
} from "../runtime/subagent-child-hash-verify";
import {
  createProductionExecutableHost,
  createProductionSpawnFn,
  readParentEnv,
  readParentPid,
} from "./production-subagent-host";
import { probeSubagentExecutable } from "./capability-probe";
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
import type { LoweredSchema } from "../seams/schema-validator";
import {
  discoverThetas,
  type DiscoveredTheta,
  type PiOwnedCommand,
} from "../discovery/discovery-walk";
import { discoverPackageThetas } from "../discovery/package-discovery";
import { loadSettings, type ThetaSettings } from "../discovery/settings";
import { parseThetaDocument, type ThetaBody } from "../parser/theta-document";
import {
  resolveCallableSet,
  type CallableSetDeps,
  type CallableSetSnapshot,
} from "../parser/callable-set";
import { checkCalleeHasErrors } from "../parser/invoke-diagnostics";
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
  type SystemNoteChannelDeps,
} from "./system-note-channel";
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
}

/**
 * The error-severity diagnostic router the shipped load path uses: a transient
 * toast (`ctx.ui.notify`), mirrored to stderr in headless print / RPC mode.
 * See notes.md — full `theta-system-note` routing for discovery diagnostics is
 * deferred (the known load-phase routing gap).
 */
function makeLoadEmit(ctx: ExtensionContext): (diagnostic: Diagnostic) => void {
  return (diagnostic: Diagnostic): void => {
    if (diagnostic.severity !== "error") {
      return;
    }
    ctx.ui.notify(diagnostic.message, "error");
    // In headless print / RPC mode there is no UI, so `ctx.ui.notify` resolves to
    // the runner's default no-op and every load/parse error that drops a theta
    // would vanish: the slash command silently fails to register, the raw
    // `/stem …` text is forwarded to the model as chat, and the run still exits 0
    // — the user gets no signal their theta is broken (the exact FMC-1 / DISCLI-2 /
    // IMPORTS-3 gap). Mirror the diagnostic to stderr in that case so a `-p` / CI
    // user observes it. stderr (never stdout) is used so the model reply and the
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
function preEvalCauseOf(code: string): PreEvalFailureCause {
  if (code === "theta/load/host-incompatible") {
    return "capability-probe"; // ERR-1
  }
  if (code === "theta/load/binder-model-unresolved") {
    return "binder-model"; // ERR-4
  }
  if (
    code === "theta/load/unknown-tool" ||
    code === "theta/load/tool-name-collision" ||
    code === "theta/load/invalid-tool-rename" ||
    code === "theta/load/prompt-mode-callable" ||
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
    slugOf: (schema: LoweredSchema) => {
      const canonicalBytes = JSON.stringify(schema);
      return { slug: canonicalBytes, canonicalBytes };
    },
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
}

/**
 * The `session_start` production supplier: construct the runtime root over the
 * real host seams, run the five-source discovery walk keyed to the host
 * `ctx.cwd`, parse each discovered `.theta`, and compose each into a runnable
 * `ThetaFixture`. Returned to `factory.ts`, which registers each via
 * `pi.registerCommand`.
 */
export async function discoverAndComposeFixtures(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
): Promise<readonly ThetaFixture[]> {
  const emitDiagnostic = makeLoadEmit(ctx);
  const root = buildRuntimeRoot(ctx, emitDiagnostic);
  // The H8a `discoverFixtures` path has no `session_shutdown` wiring reading a
  // shared registry (that is the `composeInstance` path), so it composes against
  // a throwaway registry no teardown observes.
  const pass = await runComposePass(
    pi,
    ctx,
    root,
    emitDiagnostic,
    new ActiveInvocationRegistry(),
    // No `session_shutdown` wiring on this path (that is the `composeInstance`
    // path), so it composes against a throwaway forwarding sink no teardown
    // observes.
    [],
  );
  return pass.thetas;
}

/**
 * One discovery + compose pass against an already-constructed runtime root.
 * Factored out of `discoverAndComposeFixtures` so `composeExtensionInstance`
 * can re-run it on every hot-reload (the "hot-reload re-runs the computation"
 * of discovery-sources.md §"Discovery roots"), with a per-pass `emitDiagnostic`
 * (load-toast at session_start, ERR-7 note-channel at watcher time).
 *
 * `excludeOwnedNames` names the extension's own previously-registered thetas so
 * a hot-reload pass does NOT drop them as cross-format collisions against
 * themselves: Pi reports theta's own registered commands with `source:
 * "extension"` (indistinguishable from a sibling extension), so re-running the
 * collision check against the raw `pi.getCommands()` snapshot would self-drop
 * every theta on reload. At `session_start` (first load) the set is empty — theta
 * has not registered yet — so no exclusion is needed.
 */
async function runComposePass(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  root: RuntimeRoot,
  emitDiagnostic: (diagnostic: Diagnostic) => void,
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
): Promise<ComposePassResult> {
  const fileSystem = root.fileSystem;
  const clock = root.clock;
  const subagentExecutableHost = passExecutableHost ?? createProductionExecutableHost();

  // Merged, validated settings (V10c) drive the settings discovery source and
  // the package-walk bounds.
  const settingsResult = await loadSettings(fileSystem);
  for (const diagnostic of settingsResult.diagnostics) {
    emitDiagnostic(diagnostic);
  }
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
  for (const diagnostic of walk.diagnostics) {
    emitDiagnostic(diagnostic);
  }

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
  for (const diagnostic of packageWalk.diagnostics) {
    emitDiagnostic(diagnostic);
  }
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
  const systemNote = buildSystemNoteDeps(pi, ctx, emitDiagnostic);
  const parseDeps = { systemNote, modelMatcher };

  // INV-5 (invocation.md §Resolution): the active discovery-root union threaded
  // into the invoke containment check — the parent directory of every discovered
  // theta. Every registrable theta sits inside an active discovery root, so this
  // set is the roots the load-time and runtime containment checks compare
  // against; a callee resolving outside all of them escapes the sandbox.
  const activeRoots = Array.from(
    new Set(discovered.map((theta) => dirname(theta.path))),
  );

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
    // The runtime-defect / spawn-failure / wire-failure diagnostic sink.
    emitDiagnostic,
    // H8b: parse an `invoke` / `.theta`-callable callee against the caller's
    // directory, reusing the shared parser deps.
    parseCallee: (callerPath, calleePath) =>
      parseCalleeTheta(fileSystem, ctx, callerPath, calleePath, parseDeps, () =>
        pi.getAllTools?.() ?? [],
      ),
    // INV-5 (invocation.md INV-1 seam): the runtime open-time containment
    // re-check consults the same `realpath` seam and active-root union.
    fileSystem,
    activeRoots,
  });

  // Parse pass: parse every discovered theta into its composition input; a drop
  // surfaces its load/parse diagnostics (FM-3 / DIAG-1) and does not register.
  const parsedInputs: ThetaCompositionInput[] = [];
  for (const theta of discovered) {
    const parsed = await parseDiscoveredTheta(fileSystem, theta, {
      systemNote,
      modelMatcher,
    });
    if ("dropped" in parsed) {
      // FM-3: surface the load/parse diagnostics that un-registered this theta.
      // `emitDiagnostic` routes only error-severity entries to `ctx.ui.notify`.
      for (const diagnostic of parsed.dropped) {
        emitDiagnostic(diagnostic);
      }
      continue;
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
      emitDiagnostic(subagentExecutableProbe.diagnostic);
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
      // RFC-0005: subagent-mode admission widens to `pi.getAllTools()` names.
      // Optional-chained: harness `pi` fakes without `getAllTools` yield `[]`.
      () => pi.getAllTools?.() ?? [],
    );
    for (const diagnostic of toolResult.diagnostics) {
      emitDiagnostic(diagnostic);
    }
    if (toolResult.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      continue;
    }

    // INV-3 / INV-4 / INV-5: run the invoke static checks against the resolved
    // callees and the shared invoke graph. An error-severity diagnostic (an
    // arity error, a discovery-root escape, or an invocation cycle) un-registers
    // the theta.
    const invokeDiagnostics = await checkInvokeStaticResolution(input, {
      fs: fileSystem,
      activeRoots,
      graph: invokeGraph,
      resolveCalleeArity: (absolutePath) =>
        resolveCalleeArity(fileSystem, absolutePath, parseDeps),
    });
    for (const diagnostic of invokeDiagnostics) {
      emitDiagnostic(diagnostic);
    }
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
    for (const diagnostic of subagentFnDiagnostics) {
      emitDiagnostic(diagnostic);
    }
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
    for (const diagnostic of subagentFnModelDiagnostics) {
      emitDiagnostic(diagnostic);
    }
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
    for (const diagnostic of importCheck.diagnostics) {
      emitDiagnostic(diagnostic);
    }
    if (importCheck.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      continue;
    }

    // Binder-model resolution (binder-model-and-context.md §"Binder model"): a
    // NON-bypass theta's binder model resolves at LOAD time from the two-step
    // chain (`bind_model:` → `theta.binderModel`) over the SAME shared
    // `modelMatcher` the `model:` resolution binds. A non-bypass theta whose
    // chain resolves to no model fails to load with
    // `theta/load/binder-model-unresolved` (E) — the diagnostic surfaces through
    // `emitDiagnostic` and the theta does NOT register. Bypass-eligible thetas
    // (no-params / single-string) skip resolution entirely (they never call the
    // binder). The resolved reference is carried onto the runnable theta so the
    // runtime dispatches the binder OFF-session against it.
    const bypassEligible =
      classifyBinderBypass(input.frontmatter.params?.fields).kind !== "binder";
    const binderModelResolution = resolveBinderModel({
      file: input.sourcePath ?? input.slashName,
      ...(input.frontmatter.bindModel !== undefined
        ? { bindModel: input.frontmatter.bindModel }
        : {}),
      ...(settingsBinderModel !== undefined ? { settingsBinderModel } : {}),
      bypassEligible,
      matcher: modelMatcher,
      probeStrictCapable,
    });
    for (const diagnostic of binderModelResolution.diagnostics) {
      emitDiagnostic(diagnostic);
    }
    if (!binderModelResolution.resolved) {
      // A non-bypass theta with no resolvable binder model fails to load.
      continue;
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
    emitDiagnostic,
  );
  return { thetas: survivors, activeRoots };
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
): Promise<ParsedTheta[]> {
  // Localised ambient read of the child env carrier (exempted, mirroring the
  // factory's `PI_THETA_SUBAGENT_CHILD` marker read).
  const env = process.env; // allow-ambient: process.env — RFC-0005 subagent child hash carrier (subagent.md #subagent-theta-callable-hash)
  const marshalled = readMarshalledCallableHashes(env);
  if (marshalled === undefined) {
    return [...thetas];
  }
  // Precompute the child-discovered closure sources for each marshalled callable
  // name that maps to a discovered theta (by presented-name derivation).
  const byName = new Map<
    string,
    { readonly theta: ParsedTheta; readonly sources: readonly ClosureSource[] }
  >();
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
    if (hit !== undefined) {
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
  const channel = buildSystemNoteDeps(pi, ctx, emitToast);

  // V4e — the load-time pre-evaluation failure router. Each error-severity
  // load-phase diagnostic routes onto the `theta-system-note` channel with the
  // fixed `triggerTurn:false` option, so the shipped LOAD path surfaces load
  // failures on the SAME channel the wired RELOAD path uses (hot-reload.ts),
  // rather than the transient toast (closing notes.md's "known load-phase
  // routing gap"). error-model.md pins that every pre-evaluation failure
  // "surfaces per Diagnostics on the theta-system-note channel, does not fire a
  // new turn (triggerTurn:false)". WHY error-severity only: the eight pre-eval
  // FAILURES are all error-severity; a load-phase warning is not a pre-eval
  // failure and does not surface at load (unchanged). A routed note is
  // best-effort and never aborts `session_start` (the theta is dropped, not the
  // session).
  const preEvalRouter = createLoadFailurePreEvalRouter({ channel });
  const emitLoadNote = (diagnostic: Diagnostic): void => {
    if (diagnostic.severity !== "error") {
      return;
    }
    preEvalRouter.routePreEvalFailure(preEvalCauseOf(diagnostic.code), {
      content: renderDiagnosticBatch([diagnostic]),
      display: true,
      details: { diagnostics: [diagnostic] },
    });
  };

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
  // package-and-settings.md §"Watcher-time reload failures".
  const emitErr7 = emitLoadNote;

  const initial = await runComposePass(
    pi,
    ctx,
    root,
    emitLoadNote,
    activeInvocations,
    forwardingSignals,
    undefined,
    overrides?.subagentExecutableHost,
  );

  // The watched set: the active discovery-root union plus the two settings-file
  // paths (project `.pi/settings.json`, global `~/.pi/agent/settings.json`).
  const roots = [
    ...initial.activeRoots,
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
              new Set(registry.snapshot().keys()),
              overrides?.subagentExecutableHost,
            )
          ).thetas,
        reRegister,
        initialNames: initial.thetas.map((theta) => theta.slashName),
      });
    },
  };
}

/**
 * The two settings-file paths the watcher covers: the project
 * `.pi/settings.json` (relative to `ctx.cwd`) and the global
 * `~/.pi/agent/settings.json` (home expanded via the `FileSystem` seam), per
 * package-and-settings.md §"Settings file reads".
 */
function settingsFilePaths(
  ctx: ExtensionContext,
  fileSystem: FileSystem,
): readonly string[] {
  return [
    resolvePath(ctx.cwd, ".pi", "settings.json"),
    resolvePath(fileSystem.homedir(), ".pi", "agent", "settings.json"),
  ];
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
  deps: Parameters<typeof parseThetaDocument>[1],
): Promise<CalleeArity | undefined> {
  const bytes = await fs.readBytes(absolutePath).then(
    (value) => value,
    () => undefined,
  );
  if (bytes === undefined) {
    return undefined;
  }
  const document = parseThetaDocument({ path: absolutePath, bytes }, deps);
  if (document.frontmatter === null || hasLoadParseError(document.diagnostics)) {
    return undefined;
  }
  const fields = document.frontmatter.params?.fields ?? [];
  const requiredCount = fields.filter(
    (field) => !field.hasDefault && field.optional !== true,
  ).length;
  return { requiredCount, totalCount: fields.length };
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
   */
  readonly fileExists: boolean;
  /**
   * The callee's declared `mode:` (gates `theta/load/prompt-mode-callable`).
   * Falls back to `subagent` for a file that exists but carries no parseable
   * frontmatter, so the callee-has-errors rejection — not a spurious
   * prompt-mode/unresolvable diagnostic — is the sole rejection for that callee.
   */
  readonly mode: ThetaMode;
  /** Whether the callee carries its own error-severity load/parse diagnostics. */
  readonly hasErrors: boolean;
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
 * drives can read a resolved parse, and so the V15f callee-has-errors check can
 * inspect it.
 */
async function resolveThetaToolsAtLoad(
  parsed: ThetaCompositionInput,
  fs: FileSystem,
  ctx: ExtensionContext,
  parseDeps: Parameters<typeof parseThetaDocument>[1],
  // RFC-0005 (subagent.md #subagent-launch-contract; tool-registration-lifetime.md):
  // the `pi.getAllTools()` snapshot the subagent-mode admission widening reads.
  // Absent on harness paths / prompt-mode-only callers (built-in admission only).
  getAllTools?: GetAllToolsSnapshot,
): Promise<ThetaToolsResolution> {
  // RFC-0005: the widening is subagent-mode-only. Prompt-mode admission is left
  // exactly as it was (built-ins only), so an extension-tool name in a
  // prompt-mode theta still fails load with `theta/load/unknown-tool`.
  const mode = parsed.frontmatter.mode;
  const toolsList = parsed.frontmatter.tools;
  if (
    toolsList === undefined ||
    toolsList.length === 0 ||
    parsed.sourcePath === undefined
  ) {
    // No `tools:` → the empty callable set (no `<name>(...)` callables). Attach
    // the empty frozen snapshot so the runtime enforces "no ambient tools"
    // rather than falling back to the producer-wide resolver.
    return { diagnostics: [], callableSet: EMPTY_CALLABLE_SET };
  }
  const callerDir = dirname(parsed.sourcePath);
  const diagnostics: Diagnostic[] = [];

  // Pre-parse each distinct `.theta` callee once, keyed by the spec as written.
  const calleeCache = new Map<string, CalleeParse>();
  for (const entry of toolsList) {
    const spec = toolsEntrySpec(entry);
    if (spec.length > 0 && !isBareToolName(spec) && !calleeCache.has(spec)) {
      calleeCache.set(
        spec,
        await parseCalleeForTools(fs, callerDir, spec, parseDeps),
      );
    }
  }

  // callee-has-errors (V15f): a readable, parseable `.theta` callee that carries
  // its own error-severity load/parse diagnostics rejects the parent at load
  // time (`tools:` surface → error severity).
  for (const [spec, callee] of calleeCache) {
    if (callee.fileExists && callee.hasErrors) {
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
      // RFC-0005: subagent-mode admission widens to `pi.getAllTools()` names — an
      // extension-supplied tool that appears there is admitted to the allowlist
      // (schema carried for the RFC-0002 disjointness check; `sourceInfo` feeds
      // `inferChildTrust` on the launch path). A name that is neither a
      // built-in, a `getAllTools()` name, nor a discovered `.theta` callable
      // still fails load with `theta/load/unknown-tool`.
      if (mode === "subagent") {
        const extension = resolveSubagentExtensionTool(name, getAllTools);
        if (extension !== undefined) {
          return { kind: "pi-tool", toolDefinition: extension };
        }
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
  return { diagnostics, callableSet };
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
 * `as <name>` rename). Mirrors the callable-set per-entry grammar
 * (`<spec> ('as' <name>)?`).
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
 * caller's directory, read + parse it, and report readability, declared mode,
 * and whether it carries its own error-severity load/parse diagnostics. An
 * unreadable / frontmatter-less callee is `readable: false` (drives
 * `theta/load/unresolvable-theta-path` through `resolveCallableSet`).
 */
async function parseCalleeForTools(
  fs: FileSystem,
  callerDir: string,
  spec: string,
  deps: Parameters<typeof parseThetaDocument>[1],
): Promise<CalleeParse> {
  const absolute = isAbsolute(spec) ? spec : resolvePath(callerDir, spec);
  const bytes = await fs.readBytes(absolute).then(
    (value) => value,
    () => undefined,
  );
  if (bytes === undefined) {
    return { fileExists: false, mode: "subagent", hasErrors: false };
  }
  const document = parseThetaDocument({ path: absolute, bytes }, deps);
  if (document.frontmatter === null) {
    // The file exists but produced no parseable frontmatter — an existing callee
    // that failed its own structural checks (callee-has-errors), not a path that
    // resolves to no file (unresolvable-theta-path).
    return { fileExists: true, mode: "subagent", hasErrors: true };
  }
  return {
    fileExists: true,
    mode: document.frontmatter.mode,
    hasErrors: hasLoadParseError(document.diagnostics),
  };
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
): { execute: HostToolExecute } | undefined {
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
 * RFC-0005: the `pi.getAllTools()` `ToolInfo` subset subagent-mode load-time
 * admission reads (name + registered `parameters` schema + source scope). A
 * real Pi `ToolInfo` is structurally assignable to it.
 */
interface AdmissibleToolInfo {
  readonly name: string;
  readonly parameters?: unknown;
  readonly sourceInfo?: { readonly scope?: string };
}

/** Accessor for the `pi.getAllTools()` snapshot the subagent-mode widening reads. */
type GetAllToolsSnapshot = () => readonly AdmissibleToolInfo[];

/** The load-time resolved shape a `pi-tool` callable-set entry carries. */
interface PiToolLoadEntry {
  readonly toolName: string;
  /** The tool's registered input schema (RFC-0002 disjointness check reads it). */
  readonly parameters?: unknown;
  execute: (id: string, params: unknown, signal: AbortSignal) => Promise<{ readonly content: readonly { readonly type: string }[] }>;
}

/**
 * RFC-0005 (subagent.md #subagent-launch-contract; tool-registration-lifetime.md):
 * resolve a subagent-mode `tools:` name against the child-reachable extension
 * tool set (`pi.getAllTools()`). A name present there is admitted to the frozen
 * callable set as a `pi-tool` entry carrying (a) the underlying `toolName` — so
 * the launch contract emits it in the child's `--tools` allowlist and
 * `inferChildTrust` reads its `sourceInfo` — and (b) the tool's registered
 * `parameters` schema, so the RFC-0002 computed-argument disjointness check can
 * see it. No executable definition crosses the process boundary: the child
 * registers the tool natively at startup and the model reaches it there, so the
 * parent holds no usable `execute` (code-side extension-tool dispatch is
 * RFC-0006's job); the `execute` here rejects rather than silently fall through.
 */
function resolveSubagentExtensionTool(
  name: string,
  getAllTools: GetAllToolsSnapshot | undefined,
): PiToolLoadEntry | undefined {
  const info = (getAllTools?.() ?? []).find((tool) => tool.name === name);
  if (info === undefined) {
    return undefined;
  }
  return {
    toolName: name,
    parameters: info.parameters,
    execute: (): Promise<never> =>
      Promise.reject(
        new Error(
          `extension tool '${name}' has no parent-side execute in subagent mode; ` +
            "the subagent's model reaches it in the child (code-side dispatch is RFC-0006)",
        ),
      ),
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
): { readonly toolName: string; execute: (id: string, params: unknown, signal: AbortSignal) => Promise<{ readonly content: readonly { readonly type: string }[] }> } | undefined {
  const definition = builtinToolDefinition(name, ctx.cwd);
  if (definition === undefined) {
    return undefined;
  }
  return {
    toolName: name,
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
  deps: Parameters<typeof parseThetaDocument>[1],
  // RFC-0005: subagent-mode admission of the callee's own `tools:` widens to
  // `pi.getAllTools()` names, exactly like a discovered theta.
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
  const document = parseThetaDocument({ path: absolute, bytes }, deps);
  if (document.frontmatter === null || hasLoadParseError(document.diagnostics)) {
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
  const toolResult = await resolveThetaToolsAtLoad(input, fs, ctx, deps, getAllTools);
  return { ...input, callableSet: toolResult.callableSet ?? EMPTY_CALLABLE_SET };
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
  deps: Parameters<typeof parseThetaDocument>[1],
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
    const document = parseThetaDocument({ path: absPath, bytes }, deps);
    for (const statement of document.body.statements) {
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
 * input, or a drop carrying the load/parse diagnostics that caused the drop so
 * the caller can surface them (FM-3 / DIAG-1).
 */
type ParsedDiscoveredTheta =
  | { readonly fixture: ThetaCompositionInput }
  | { readonly dropped: readonly Diagnostic[] };

/** Read + parse one discovered `.theta` into its `V19a` frontmatter + body AST. */
async function parseDiscoveredTheta(
  fs: FileSystem,
  theta: DiscoveredTheta,
  deps: Parameters<typeof parseThetaDocument>[1],
): Promise<ParsedDiscoveredTheta> {
  const bytes = await fs.readBytes(theta.path).then(
    (value) => value,
    () => undefined,
  );
  if (bytes === undefined) {
    return { dropped: [] };
  }
  const document = parseThetaDocument({ path: theta.path, bytes }, deps);
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
    return { dropped: [...document.diagnostics, ...subagentFnFraming] };
  }
  return {
    fixture: {
      slashName: theta.name,
      sourcePath: theta.path,
      frontmatter: document.frontmatter,
      body: document.body,
    },
  };
}

/**
 * Split the `--theta` CLI flag value into discovery-source paths.
 *
 * A single `--theta A` arrives as a string; a repeated `--theta A --theta B`
 * arrives as an ARRAY of strings (DISCLI-1). Treat repetition additively:
 * flatten every string occurrence, split each on the platform PATH_DELIMITER,
 * trim, drop empties, and return the de-duplicated union. Previously a repeated
 * flag (array) failed the `typeof raw !== "string"` guard and silently
 * discarded every user-supplied path, so neither dir's thetas registered.
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
    // Skip the extension's own previously-registered thetas on a hot-reload pass
    // so they are not dropped as collisions against themselves (they carry
    // `source: "extension"`, like a sibling extension's command).
    if (excludeOwnedNames?.has(command.name) === true) {
      continue;
    }
    if (
      command.source === "prompt" ||
      command.source === "skill" ||
      command.source === "extension"
    ) {
      owned.push({ name: command.name, source: command.source });
    }
  }
  return owned;
}

/** Adapt the host `pi` / `ctx` surface to the `V19a` parser note-channel deps. */
function buildSystemNoteDeps(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  emitDiagnostic: (diagnostic: Diagnostic) => void,
): SystemNoteChannelDeps {
  return {
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
  };
}
