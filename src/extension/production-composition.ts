// H8a — the production composition root for the shipped extension.
//
// This module is the object graph the per-leaf gates verified only in isolation:
// at `session_start` it constructs the `H3a` runtime root over the real host
// seams (`V8b` `PiFileSystem`, `V8c` `AjvSchemaValidator`, `V8d`
// `WallClock`/`CryptoIdSource`, `V8e` `PiFileWatcher`/`PiTokenEstimator`), runs
// the five-source discovery walk (`V10a` union + `V10b` package source over the
// `V10c` merged settings), parses each discovered `.loom` (`V19a`), and maps it
// to a runnable `H4a` `LoomFixture` via the `V19e` composition producer. The
// `factory.ts` `session_start` handler registers each returned fixture through
// `pi.registerCommand`, so the shipped extension discovers, registers, and runs
// `.loom` slash commands.
//
// All composition lives here in `src/**`; `extensions/index.ts` stays a thin
// delegating shim. The runtime root is constructed per `session_start`
// invocation (no module-level mutable state) so two extension instances share
// no state.
//
// Spec (narrative): pi-integration-contract/extension-bootstrap-and-per-loom.md,
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
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { LoomFixture } from "./factory";
import { PiFileSystem } from "../seams/pi-file-system";
import { WallClock } from "../seams/wall-clock";
import { CryptoIdSource } from "../seams/crypto-id-source";
import { PiFileWatcher } from "../seams/pi-file-watcher";
import { PiTokenEstimator } from "../seams/pi-token-estimator";
import { AjvSchemaValidator } from "../seams/schema-validator";
import { ProductionCheckpoint } from "../seams/production-checkpoint";
import { createRuntimeRoot, type RuntimeRoot } from "../runtime-root";
import type { FileSystem } from "../seams/file-system";
import { renderDiagnosticLine, type Diagnostic } from "../diagnostics/diagnostic";
import type { LoweredSchema } from "../seams/schema-validator";
import {
  discoverLooms,
  type DiscoveredLoom,
  type PiOwnedCommand,
} from "../discovery/discovery-walk";
import { discoverPackageLooms } from "../discovery/package-discovery";
import { loadSettings, type LoomSettings } from "../discovery/settings";
import { parseLoomDocument, type LoomBody } from "../parser/loom-document";
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
import { checkLoomImports } from "./import-static-checks";
import type { LoomMode } from "../parser/frontmatter";
import {
  matchAvailableModel,
  resolveBinderModel,
  type StrictCapableProbe,
} from "../binder/binder-model";
import { classifyBinderBypass } from "../binder/binder-envelope";
import { createModelReferenceMatcher } from "./reload-wiring";
import type { SystemNoteChannelDeps } from "./system-note-channel";
import { SYSTEM_NOTE_CHANNEL } from "./system-note-channel";
import {
  composeLoomFixture,
  type LoomCompositionInput,
} from "./loom-composition-producer";
import { createProductionProducerDeps } from "./production-loom-producer";

/**
 * The `session_start` production supplier: construct the runtime root over the
 * real host seams, run the five-source discovery walk keyed to the host
 * `ctx.cwd`, parse each discovered `.loom`, and compose each into a runnable
 * `LoomFixture`. Returned to `factory.ts`, which registers each via
 * `pi.registerCommand`.
 */
export async function discoverAndComposeFixtures(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
): Promise<readonly LoomFixture[]> {
  // Diagnostics surfaced during discovery / parse route through a transient
  // toast (`ctx.ui.notify`) for errors; the load-phase note-channel wiring is
  // best-effort at the composition root (the opt-in live acceptance suite does
  // not assert them). See notes.md — full `loom-system-note` routing for
  // discovery diagnostics is deferred.
  const emitDiagnostic = (diagnostic: Diagnostic): void => {
    if (diagnostic.severity !== "error") {
      return;
    }
    ctx.ui.notify(diagnostic.message, "error");
    // In headless print / RPC mode there is no UI, so `ctx.ui.notify` resolves to
    // the runner's default no-op and every load/parse error that drops a loom
    // would vanish: the slash command silently fails to register, the raw
    // `/stem …` text is forwarded to the model as chat, and the run still exits 0
    // — the user gets no signal their loom is broken (the exact FMC-1 / DISCLI-2 /
    // IMPORTS-3 gap). Mirror the diagnostic to stderr in that case so a `-p` / CI
    // user observes it. stderr (never stdout) is used so the model reply and the
    // `--mode json` event stream on stdout stay uncorrupted. `process.stderr` is
    // not a gated ambient primitive (no-ambient-primitives MEMBER_RULES covers
    // `process.env` / `process.cwd` only), and this write is confined to the
    // no-UI path so the interactive toast surface is unchanged.
    if (!ctx.hasUI) {
      process.stderr.write(`loom: ${renderDiagnosticLine(diagnostic)}\n`);
    }
  };

  // Host seams — one runtime root per `session_start` invocation, `cwd` pinned
  // to the host-reported working directory so the project / global discovery
  // sources resolve against the live session's directory.
  const fileSystem = new PiFileSystem(ctx.cwd);
  const clock = new WallClock();
  const schemaValidator = new AjvSchemaValidator({
    emit: emitDiagnostic,
    slugOf: (schema: LoweredSchema) => {
      const canonicalBytes = JSON.stringify(schema);
      return { slug: canonicalBytes, canonicalBytes };
    },
  });
  const root: RuntimeRoot = createRuntimeRoot({
    checkpoint: new ProductionCheckpoint(clock),
    schemaValidator,
    clock,
    fileSystem,
    fileWatcher: new PiFileWatcher(),
    tokenEstimator: new PiTokenEstimator(),
    idSource: new CryptoIdSource(),
  });

  // Merged, validated settings (V10c) drive the settings discovery source and
  // the package-walk bounds.
  const settingsResult = await loadSettings(fileSystem);
  for (const diagnostic of settingsResult.diagnostics) {
    emitDiagnostic(diagnostic);
  }
  const settings: LoomSettings = settingsResult.settings;

  // Discovery walk. CLI `--loom` roots are split on the platform path
  // delimiter (the walk is platform-independent over already-split paths).
  const cliPaths = readLoomFlagPaths(pi);
  const piOwnedNames = readPiOwnedCommands(pi);
  const walk = await discoverLooms({
    fs: fileSystem,
    settings,
    cliPaths,
    piOwnedNames,
  });
  for (const diagnostic of walk.diagnostics) {
    emitDiagnostic(diagnostic);
  }

  // Package source (V10b, priority 4) — merged in at the composition root: a
  // package loom registers only when its slash name is not already claimed by a
  // higher-priority (CLI / settings / project) or lower-priority (global)
  // discovered loom already resolved by the walk. This is the whole-walk merge
  // point the walk itself defers (discovery-walk.ts "Package … owned by V10b;
  // not plumbed into this walk yet"). See notes.md for the priority-tiebreak
  // simplification.
  const packageWalk = await discoverPackageLooms({
    fs: fileSystem,
    clock,
    settings,
  });
  for (const diagnostic of packageWalk.diagnostics) {
    emitDiagnostic(diagnostic);
  }
  const claimed = new Set(walk.looms.map((loom) => loom.name));
  const discovered: DiscoveredLoom[] = [...walk.looms];
  for (const pkg of packageWalk.looms) {
    if (!claimed.has(pkg.name)) {
      claimed.add(pkg.name);
      discovered.push({ name: pkg.name, path: pkg.path, source: "package" });
    }
  }

  // Parse + compose each discovered loom into a runnable fixture. The
  // model-reference matcher and the note-channel are constructed once and
  // shared across every parse (single source of construction).
  const modelMatcher = createModelReferenceMatcher({
    getAvailable: () => ctx.modelRegistry.getAvailable() as never,
  });
  // The merged `looms.binderModel` setting (chain step 2 of binder-model
  // resolution). Threaded, alongside the shared `modelMatcher`, into every
  // non-bypass loom's load-time binder-model resolution below.
  const settingsBinderModel = settings.looms?.binderModel;
  // The duck-typed strict-capability probe (binder-model-and-context.md
  // #strict-capability-requirement): resolve the reference to a concrete
  // `Model<Api>` and read `strictCapable`. Under the loom 1.0 Pi-SDK pin the
  // field is absent on every model, so this is the universal-W branch and the
  // loom still registers; the probe is short-circuited by `resolveBinderModel`
  // when the reference resolves to no model.
  const probeStrictCapable = (reference: string): StrictCapableProbe | undefined => {
    const model = matchAvailableModel(reference, ctx.modelRegistry.getAvailable());
    return model === undefined ? undefined : (model as unknown as StrictCapableProbe);
  };
  const systemNote = buildSystemNoteDeps(pi, ctx, emitDiagnostic);
  const parseDeps = { systemNote, modelMatcher };

  // INV-5 (invocation.md §Resolution): the active discovery-root union threaded
  // into the invoke containment check — the parent directory of every discovered
  // loom. Every registrable loom sits inside an active discovery root, so this
  // set is the roots the load-time and runtime containment checks compare
  // against; a callee resolving outside all of them escapes the sandbox.
  const activeRoots = Array.from(
    new Set(discovered.map((loom) => dirname(loom.path))),
  );

  const producerDeps = createProductionProducerDeps({
    pi,
    root,
    modelRegistry: ctx.modelRegistry,
    // H8b: resolve a code-side Pi-tool name to its `execute` dispatch over the
    // live host `cwd` / `ctx`.
    resolvePiTool: (name: string) => resolvePiTool(name, ctx),
    // SUBAG-2: lower a subagent loom's callable-set Pi-tool name to its full pi
    // `ToolDefinition`, so the spawn installs it as a `customTools` entry the
    // subagent model may call (subagent.md rule 1). The `cwd` is forwarded per
    // invocation from the spawn site (`ctx.cwd`).
    // The runtime value is the full pi `ToolDefinition` from the built-in
    // factory; `builtinToolDefinition`'s static return type is deliberately
    // narrowed to the loom-load-bearing `execute`-only shape, so widen it back
    // for the spawn's `customTools` channel.
    resolvePiToolDefinition: (name: string, cwd: string) =>
      builtinToolDefinition(name, cwd) as unknown as ToolDefinition | undefined,
    // H8b: parse an `invoke` / `.loom`-callable callee against the caller's
    // directory, reusing the shared parser deps.
    parseCallee: (callerPath, calleePath) =>
      parseCalleeLoom(fileSystem, ctx, callerPath, calleePath, parseDeps),
    // INV-5 (invocation.md INV-1 seam): the runtime open-time containment
    // re-check consults the same `realpath` seam and active-root union.
    fileSystem,
    activeRoots,
  });

  // Parse pass: parse every discovered loom into its composition input; a drop
  // surfaces its load/parse diagnostics (FM-3 / DIAG-1) and does not register.
  const parsedInputs: LoomCompositionInput[] = [];
  for (const loom of discovered) {
    const parsed = await parseDiscoveredLoom(fileSystem, loom, {
      systemNote,
      modelMatcher,
    });
    if ("dropped" in parsed) {
      // FM-3: surface the load/parse diagnostics that un-registered this loom.
      // `emitDiagnostic` routes only error-severity entries to `ctx.ui.notify`.
      for (const diagnostic of parsed.dropped) {
        emitDiagnostic(diagnostic);
      }
      continue;
    }
    parsedInputs.push(parsed.fixture);
  }

  // INV-4 (invocation.md §Cycle detection): build the per-load-pass
  // static-resolution invoke graph across the parsed looms once, so the cycle
  // walk below runs per entry against a shared graph.
  const invokeGraph = buildInvokeGraph(parsedInputs);

  const fixtures: LoomFixture[] = [];
  for (const input of parsedInputs) {
    // V20a — resolve the `tools:` callable set against the shipped Pi tool
    // registry at production load time. A `tools:` rejection (unknown Pi tool,
    // prompt-mode `.loom` callee, name collision, invalid `as` rename, or a
    // `.loom` callee carrying its own load/parse errors) un-registers the loom
    // exactly as the isolation-tested `resolveCallableSet` (V6c) and
    // callee-has-errors (V15f) checks decide.
    const toolResult = await resolveLoomToolsAtLoad(
      input,
      fileSystem,
      ctx,
      parseDeps,
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
    // the loom.
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

    // IMP-1 / IMP-3 / IMP-4 / IMP-5 (imports.md): resolve each `.warp` import,
    // parse it, and run the unresolvable-path / unknown-symbol / warp-top-level /
    // cycle checks. An error-severity diagnostic un-registers the loom. The
    // resolved exports are materialised into the loom's runtime environment so an
    // imported `fn` is callable (IMP-6) and its query body drives the caller's
    // conversation (IMP-7).
    const importCheck = await checkLoomImports(input, {
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
    // NON-bypass loom's binder model resolves at LOAD time from the two-step
    // chain (`bind_model:` → `looms.binderModel`) over the SAME shared
    // `modelMatcher` the `model:` resolution binds. A non-bypass loom whose
    // chain resolves to no model fails to load with
    // `loom/load/binder-model-unresolved` (E) — the diagnostic surfaces through
    // `emitDiagnostic` and the loom does NOT register. Bypass-eligible looms
    // (no-params / single-string) skip resolution entirely (they never call the
    // binder). The resolved reference is carried onto the runnable loom so the
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
      // A non-bypass loom with no resolvable binder model fails to load.
      continue;
    }

    // Thread the frozen callable-set snapshot resolved above onto the runnable
    // loom so the runtime enforces the per-loom `tools:` set (QTL-2: code-driven
    // calls dispatch only through a held reference; QTL-4: prompt-mode query
    // turns install exactly this set's underlying Pi-tool names as the model's
    // active tools), plus the resolved binder-model reference (absent for a
    // bypass-eligible loom).
    const composedInput: LoomCompositionInput = {
      ...input,
      ...(importCheck.imports.length > 0 ? { imports: importCheck.imports } : {}),
      ...(toolResult.callableSet !== undefined
        ? { callableSet: toolResult.callableSet }
        : {}),
      ...(binderModelResolution.binderModel !== undefined
        ? { binderModel: binderModelResolution.binderModel }
        : {}),
    };
    fixtures.push(composeLoomFixture(composedInput, producerDeps));
  }
  return fixtures;
}

/**
 * INV-3 arity support: parse a callee `.loom` at `absolutePath` and report its
 * `params:` arity counts — the total field count and the count of fields that
 * are neither defaulted nor optional (the minimum required arity). Returns
 * `undefined` when the callee is unreadable / unparseable (not statically
 * resolvable), so the arity check is skipped and the runtime AJV net applies.
 */
async function resolveCalleeArity(
  fs: FileSystem,
  absolutePath: string,
  deps: Parameters<typeof parseLoomDocument>[1],
): Promise<CalleeArity | undefined> {
  const bytes = await fs.readBytes(absolutePath).then(
    (value) => value,
    () => undefined,
  );
  if (bytes === undefined) {
    return undefined;
  }
  const document = parseLoomDocument({ path: absolutePath, bytes }, deps);
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

/** A pre-parsed `.loom` callee, resolved once per load pass for the tools scan. */
interface CalleeParse {
  /**
   * Whether the `.loom` path resolved to a readable file. `false` only when the
   * path resolves to no file (drives `loom/load/unresolvable-loom-path`); a file
   * that exists but fails to parse is `fileExists: true` with `hasErrors: true`
   * (drives `loom/load/callee-has-errors`) — the spec's deliberate split between
   * "resolves to no file" and "exists but failed its own structural checks".
   */
  readonly fileExists: boolean;
  /**
   * The callee's declared `mode:` (gates `loom/load/prompt-mode-callable`).
   * Falls back to `subagent` for a file that exists but carries no parseable
   * frontmatter, so the callee-has-errors rejection — not a spurious
   * prompt-mode/unresolvable diagnostic — is the sole rejection for that callee.
   */
  readonly mode: LoomMode;
  /** Whether the callee carries its own error-severity load/parse diagnostics. */
  readonly hasErrors: boolean;
}

/** The outcome of resolving a discovered loom's `tools:` callable set at load. */
interface LoomToolsResolution {
  /** Every load-time diagnostic; error-severity entries un-register the loom. */
  readonly diagnostics: readonly Diagnostic[];
  /**
   * The frozen callable-set snapshot the runtime enforces against. Present
   * whenever the loom registers (an EMPTY frozen snapshot for a loom with no
   * `tools:` — the empty callable set the runtime treats as "no `<name>(...)`
   * callables"); absent only when a `tools:` rejection un-registered the loom.
   */
  readonly callableSet?: CallableSetSnapshot;
}

/** The empty frozen callable set for a loom that declares no `tools:`. */
const EMPTY_CALLABLE_SET: CallableSetSnapshot = Object.freeze({
  entries: new Map(),
});

/**
 * V20a — resolve a discovered loom's `tools:` callable set at production load
 * time, returning every load-time diagnostic (error-severity entries
 * un-register the loom) together with the frozen resolution snapshot the
 * runtime enforces against (QTL-2 / QTL-4). Pre-parses each distinct `.loom`
 * callee once so the synchronous `resolveLoomCallee` lookup `resolveCallableSet`
 * drives can read a resolved parse, and so the V15f callee-has-errors check can
 * inspect it.
 */
async function resolveLoomToolsAtLoad(
  parsed: LoomCompositionInput,
  fs: FileSystem,
  ctx: ExtensionContext,
  parseDeps: Parameters<typeof parseLoomDocument>[1],
): Promise<LoomToolsResolution> {
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

  // Pre-parse each distinct `.loom` callee once, keyed by the spec as written.
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

  // callee-has-errors (V15f): a readable, parseable `.loom` callee that carries
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
      const resolved = resolvePiTool(name, ctx);
      return resolved === undefined
        ? undefined
        : { kind: "pi-tool", toolDefinition: resolved };
    },
    resolveLoomCallee: (loomPath) => {
      const callee = calleeCache.get(loomPath);
      if (callee === undefined || !callee.fileExists) {
        return undefined;
      }
      return { kind: "loom", mode: callee.mode, callee: undefined };
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
  // error inside `resolveCallableSet`; the loom registers iff no error-severity
  // diagnostic was raised on either path.
  const registered = !diagnostics.some((d) => d.severity === "error");
  return {
    diagnostics,
    ...(registered
      ? { callableSet: result.callableSet ?? EMPTY_CALLABLE_SET }
      : {}),
  };
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
 * separator or `.loom` extension) rather than a `.loom` path literal — the same
 * routing `resolveCallableSet` applies internally.
 */
function isBareToolName(spec: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(spec);
}

/**
 * Pre-parse one `.loom` callee for the tools scan: resolve it against the
 * caller's directory, read + parse it, and report readability, declared mode,
 * and whether it carries its own error-severity load/parse diagnostics. An
 * unreadable / frontmatter-less callee is `readable: false` (drives
 * `loom/load/unresolvable-loom-path` through `resolveCallableSet`).
 */
async function parseCalleeForTools(
  fs: FileSystem,
  callerDir: string,
  spec: string,
  deps: Parameters<typeof parseLoomDocument>[1],
): Promise<CalleeParse> {
  const absolute = isAbsolute(spec) ? spec : resolvePath(callerDir, spec);
  const bytes = await fs.readBytes(absolute).then(
    (value) => value,
    () => undefined,
  );
  if (bytes === undefined) {
    return { fileExists: false, mode: "subagent", hasErrors: false };
  }
  const document = parseLoomDocument({ path: absolute, bytes }, deps);
  if (document.frontmatter === null) {
    // The file exists but produced no parseable frontmatter — an existing callee
    // that failed its own structural checks (callee-has-errors), not a path that
    // resolves to no file (unresolvable-loom-path).
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
 * `tools:` entries: the loom's top-level `fn` declarations and imported symbols
 * (frontmatter-fields-a.md §`tools` — the top-level arm of
 * `loom/load/tool-name-collision`).
 */
function collectReservedNames(body: LoomBody): ReadonlySet<string> {
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

/** The loom-load-bearing shape of a host tool definition's `execute` member. */
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
 * `ToolDefinition` whose `execute(...)` loom drives directly for a code-side
 * `<name>(args)` call (host-interfaces-core.md §"Tool execution from loom code").
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
 * H8b: resolve a code-side Pi-tool name to its `execute` dispatch. Returns
 * `undefined` for a name that is not a known host built-in, so the code-side
 * path surfaces the unknown-tool execution `Err` rather than fabricating a
 * value. The synthesised `execute` invokes the host tool with a `loom-direct:`
 * tool-call id and maps its `AgentToolResult` to loom's `content`-only envelope.
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
async function parseCalleeLoom(
  fs: FileSystem,
  ctx: ExtensionContext,
  callerPath: string | undefined,
  calleePath: string,
  deps: Parameters<typeof parseLoomDocument>[1],
): Promise<LoomCompositionInput | undefined> {
  const baseDir = callerPath !== undefined ? dirname(callerPath) : ctx.cwd;
  const absolute = isAbsolute(calleePath) ? calleePath : resolvePath(baseDir, calleePath);
  const bytes = await fs.readBytes(absolute).then(
    (value) => value,
    () => undefined,
  );
  if (bytes === undefined) {
    return undefined;
  }
  const document = parseLoomDocument({ path: absolute, bytes }, deps);
  if (document.frontmatter === null || hasLoadParseError(document.diagnostics)) {
    return undefined;
  }
  const input: LoomCompositionInput = {
    slashName: loomBasename(absolute),
    sourcePath: absolute,
    frontmatter: document.frontmatter,
    body: document.body,
  };
  // Resolve and attach the callee's OWN frozen `tools:` callable set so an
  // invoked child enforces its callable set at runtime exactly like a discovered
  // loom (QTL-2 residual): without a snapshot the runtime falls back to the
  // unrestricted producer-wide resolver, letting a child with no/narrow `tools:`
  // reach ambient host tools (bash / read / …) from code. A no-`tools:` child
  // resolves to the frozen EMPTY snapshot, so it has no code callables.
  const toolResult = await resolveLoomToolsAtLoad(input, fs, ctx, deps);
  return { ...input, callableSet: toolResult.callableSet ?? EMPTY_CALLABLE_SET };
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
      (diagnostic.code.startsWith("loom/load/") ||
        diagnostic.code.startsWith("loom/parse/")),
  );
}

/** The `.loom` basename (minus extension) of a path, for the callee slash name. */
function loomBasename(path: string): string {
  const base = path.slice(path.replace(/\\/g, "/").lastIndexOf("/") + 1);
  return base.endsWith(".loom") ? base.slice(0, -".loom".length) : base;
}

/**
 * The outcome of parsing one discovered `.loom`: either a runnable composition
 * input, or a drop carrying the load/parse diagnostics that caused the drop so
 * the caller can surface them (FM-3 / DIAG-1).
 */
type ParsedDiscoveredLoom =
  | { readonly fixture: LoomCompositionInput }
  | { readonly dropped: readonly Diagnostic[] };

/** Read + parse one discovered `.loom` into its `V19a` frontmatter + body AST. */
async function parseDiscoveredLoom(
  fs: FileSystem,
  loom: DiscoveredLoom,
  deps: Parameters<typeof parseLoomDocument>[1],
): Promise<ParsedDiscoveredLoom> {
  const bytes = await fs.readBytes(loom.path).then(
    (value) => value,
    () => undefined,
  );
  if (bytes === undefined) {
    return { dropped: [] };
  }
  const document = parseLoomDocument({ path: loom.path, bytes }, deps);
  if (document.frontmatter === null || hasLoadParseError(document.diagnostics)) {
    // A well-formed `.loom` carries `mode:` frontmatter and produces no
    // error-severity load/parse diagnostic; a frontmatter-less file cannot be
    // composed into a runnable fixture, and a loom that produced an
    // error-severity `loom/load/*` / `loom/parse/*` diagnostic (an invalid
    // frontmatter value, an unresolved param named type, a `system:`
    // interpolation error, …) must not register (warnings still register).
    //
    // FM-3: return the load-phase diagnostics so the caller emits them. DIAG-1
    // requires every author-visible drop to carry its registry code/message;
    // previously these were computed here and silently discarded, so a `mode:`
    // typo made the command vanish with no feedback. (The `tools:`-resolution
    // diagnostics are emitted separately by `resolveLoomToolsAtLoad` and are
    // not part of `document.diagnostics`, so this does not double-emit them.)
    return { dropped: document.diagnostics };
  }
  return {
    fixture: {
      slashName: loom.name,
      sourcePath: loom.path,
      frontmatter: document.frontmatter,
      body: document.body,
    },
  };
}

/**
 * Split the `--loom` CLI flag value into discovery-source paths.
 *
 * A single `--loom A` arrives as a string; a repeated `--loom A --loom B`
 * arrives as an ARRAY of strings (DISCLI-1). Treat repetition additively:
 * flatten every string occurrence, split each on the platform PATH_DELIMITER,
 * trim, drop empties, and return the de-duplicated union. Previously a repeated
 * flag (array) failed the `typeof raw !== "string"` guard and silently
 * discarded every user-supplied path, so neither dir's looms registered.
 */
function readLoomFlagPaths(pi: ExtensionAPI): readonly string[] {
  const raw: unknown = pi.getFlag("loom");
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
function readPiOwnedCommands(pi: ExtensionAPI): readonly PiOwnedCommand[] {
  const owned: PiOwnedCommand[] = [];
  for (const command of pi.getCommands()) {
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
