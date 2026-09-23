// A shared "run the shipped composition root over a fake host, mirroring its
// stderr diagnostic channel" load harness (PTQ-0210), plus the temp
// discovery-workspace plant/dispose lifecycle every caller drives it through
// (PTQ-0312). Also records commands, persistent notes and toasts from the
// factory/session-start path via `makeShippedHarness`.
//
// WHY THIS FILE EXISTS. Several test files independently redeclared the same
// `LoadOutcome` shape and the same `runProductionLoad` function: a fake,
// no-UI `ExtensionAPI` / `ExtensionContext` pair sized to
// `discoverAndComposeFixtures`, a `process.stderr.write` interposition that
// captures `makeLoadEmit`'s rendered diagnostic lines (the load's no-UI
// mirror) around one `discoverAndComposeFixtures` call, and a reshape of the
// result into `{registered, notifications, diagnosticLines}`. The same files
// also independently redeclared the temp-workspace lifecycle WRAPPED around
// that call — `mkdtemp` a project root, `mkdir` its `.pi/theta`, a
// per-fixture write loop, an optional `.pi/settings.json` write, and an
// `afterAll` recursive removal — so `plantThetaWorkspace` / `disposeWorkspace`
// centralise that half too.
//
// TIER: unit, offline, provider-free, deterministic — the same tier as every
// file that imports this module. `discoverAndComposeFixtures` is the real,
// shipped composition-root entry point; nothing about ITS behaviour is
// stubbed, only its `pi` / `ctx` host.

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { createThetaExtension, type ThetaExtensionDeps, type ThetaFixture } from "../../src/extension/factory";
import { composeExtensionInstance, discoverAndComposeFixtures } from "../../src/extension/production-composition";
import type { Diagnostic } from "../../src/diagnostics/diagnostic";
import type { CallableSetSnapshot } from "../../src/parser/callable-set";
import { FakeClock } from "./fake-clock";
import { FakeFileWatcher } from "./fake-file-watcher";

export interface LoadOutcome {
  readonly registered: readonly string[];
  readonly notifications: readonly string[];
  /** `theta: <file>:<line>:<col>: <code>: <message>`, one per diagnostic. */
  readonly diagnosticLines: readonly string[];
  /** The composed fixtures the pass produced (discovery order), for callers that need more than `registered`. */
  readonly fixtures: readonly ThetaFixture[];
}

/** Read the frozen callable-set snapshot threaded onto a registered fixture. */
export function callableSetOf(
  outcome: Pick<LoadOutcome, "fixtures" | "registered" | "notifications">,
  slashName: string,
): CallableSetSnapshot {
  const fixture = outcome.fixtures.find((f) => f.slashName === slashName);
  expect(
    fixture,
    `PRECONDITION: fixture '${slashName}' was not registered. Registered: ` +
      `${JSON.stringify(outcome.registered)}; notified: ` +
      JSON.stringify(outcome.notifications),
  ).toBeDefined();
  const snapshot = (fixture as unknown as { callableSet?: CallableSetSnapshot }).callableSet;
  expect(
    snapshot,
    `PRECONDITION: fixture '${slashName}' carries no callableSet snapshot`,
  ).toBeDefined();
  return snapshot as CallableSetSnapshot;
}

export interface ProductionLoadOptions {
  /** `ctx.modelRegistry.getAvailable()`'s report; default: no available models. */
  readonly availableModels?: readonly unknown[];
  /** `pi.getFlag("theta")`'s report; default: no CLI `--theta` flag. */
  readonly thetaFlag?: string;
  /** `pi.getCommands()`'s report; default: no Pi-owned commands. */
  readonly piOwnedCommands?: readonly { readonly name: string; readonly source: string }[];
  /** `pi.getAllTools()`'s report; default: no registry snapshot method. */
  readonly registryTools?: readonly { readonly name: string }[];
  /** `ctx.hasUI`'s report; default: absent (no UI). */
  readonly hasUI?: boolean;
  /** Observe `pi.sendMessage` at load and later fixture dispatch; default: no-op. */
  readonly sendMessage?: (message: { content?: unknown }) => void;
  /** Extra members merged over the fake `pi` (e.g. RFC 0011 session-control probes); default: none. */
  readonly piExtras?: Readonly<Record<string, unknown>>;
  /** Extra members merged over the fake `ctx` (e.g. RFC 0011 session-control probes); default: none. */
  readonly ctxExtras?: Readonly<Record<string, unknown>>;
}

/**
 * Run the shipped composition root's discovery/compose pass over `cwd`
 * through a fake host (no UI by default): `pi.ui.notify` calls are recorded, and
 * `process.stderr.write` is interposed for the call's duration to capture the
 * load's no-UI diagnostic mirror. The handle is restored in a `.finally`, so
 * no assertion runs while the interposition is live.
 */
export async function runProductionLoad(
  cwd: string,
  opts: ProductionLoadOptions = {},
): Promise<LoadOutcome> {
  const notifications: string[] = [];
  const chunks: string[] = [];
  const pi = {
    getFlag: (name: string): string | undefined => (name === "theta" ? opts.thetaFlag : undefined),
    getCommands: (): readonly { name: string; source: string }[] => opts.piOwnedCommands ?? [],
    sendMessage: opts.sendMessage ?? ((): void => {}),
    sendUserMessage: (): void => {},
    registerMessageRenderer: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
    ...(opts.registryTools !== undefined ? { getAllTools: () => opts.registryTools } : {}),
    ...opts.piExtras,
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd,
    hasUI: opts.hasUI,
    modelRegistry: { getAvailable: (): readonly unknown[] => opts.availableModels ?? [] },
    ui: {
      notify: (message: string, _type: "error"): void => {
        notifications.push(message);
      },
    },
    ...opts.ctxExtras,
  } as unknown as ExtensionContext;

  // The stderr mirror is a real production channel (a `-p` / CI operator's only
  // sight of a load diagnostic) written directly rather than through an
  // injectable seam, so interposing on the handle is the only way to read it.
  // The window is one awaited call and the handle is restored on both outcomes,
  // so no assertion below runs while the interposition is live.
  const write = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: unknown): boolean => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(
    pi,
    ctx,
  ).finally(() => {
    process.stderr.write = write;
  });

  return {
    registered: fixtures.map((f) => f.slashName),
    notifications,
    diagnosticLines: chunks
      .join("")
      .split(/\r?\n/)
      .filter((line) => line.length > 0),
    fixtures,
  };
}

/** Bind per-caller readers without capturing an outcome before its load completes. */
export function diagnosticLineReaders(getDiagnosticLines: () => readonly string[]) {
  /** Diagnostic lines the load attributed to one planted `.theta`. */
  function linesFor(stem: string): readonly string[] {
    const attributed = new RegExp(`[\\\\/]${stem}\\.theta[:\\s]`);
    return getDiagnosticLines().filter((line) => attributed.test(line));
  }

  /** Diagnostic lines attributing `code` to one planted `.theta`. */
  function linesForCode(stem: string, code: string): readonly string[] {
    return linesFor(stem).filter((line) => line.includes(code));
  }

  return { linesFor, linesForCode };
}

/** Bind the two-channel positive control and callee-declaration guards to one workspace. */
export function invokeArgPreconditions(
  control: {
    readonly code: string;
    readonly callerStem: string;
    readonly callerLabel: string;
    readonly invocation: string;
    readonly expectedMessage: () => string;
  },
  notifications: () => readonly string[],
  { linesFor, linesForCode }: ReturnType<typeof diagnosticLineReaders>,
) {
  /**
   * The shared positive control for every absence cell: THIS workspace and THIS
   * load produced the invoke row at least once, on both channels an absence is
   * read on. Without it an absence assertion passes while the row is unreachable
   * and nothing is being measured.
   */
  function assertRowSurfaceLive(): void {
    expect(
      notifications(),
      `unmet precondition: ${control.code} never surfaced for the ${control.callerLabel} ` +
        `(\`${control.invocation}\` at a \`params: x: string\` callee), so this ` +
        "workspace produces no instance of the row and no ABSENCE below measures " +
        "anything. Notified: " + JSON.stringify(notifications()),
    ).toContain(control.expectedMessage());
    expect(
      linesForCode(control.callerStem, control.code).length,
      `unmet precondition: no diagnostic line attributes ${control.code} to the ${control.callerLabel}, so ` +
        "the per-caller channel every absence cell below reads is not carrying the row " +
        "and cannot witness its absence for one caller. Lines for that caller: " +
        JSON.stringify(linesFor(control.callerStem)),
    ).toBeGreaterThan(0);
  }

  /**
   * A callee's declared param type must be declarable before a cell over it means
   * anything: a `params:` RHS the grammar refuses draws its own `theta/parse/*`
   * row, which would un-register the callee's caller for an unrelated reason.
   */
  function assertParamTypeDeclarable(calleeStem: string, paramType: string): void {
    expect(
      linesFor(calleeStem).filter((line) => line.includes("theta/parse/")),
      `unmet precondition: the callee declaring \`params: x: ${paramType}\` drew a parse ` +
        "diagnostic, so this param type is not declarable and the cell over it is " +
        "measuring a rejected declaration rather than an argument mismatch",
    ).toEqual([]);
  }

  return { assertRowSurfaceLive, assertParamTypeDeclarable };
}

/** Guard per-caller diagnostic attribution against planted stems shadowing one another. */
export function assertNoStemIsASuffix(stems: readonly string[]): void {
  for (const stem of stems) {
    const shadowed = stems.filter((other) => other !== stem && other.endsWith(stem));
    expect(
      shadowed,
      `harness: planted stem '${stem}' is a suffix of ${JSON.stringify(shadowed)}, so ` +
        "per-caller diagnostic attribution below is ambiguous",
    ).toEqual([]);
  }
}

export function theta(...lines: readonly string[]): string {
  return lines.join("\n") + "\n";
}

/** A `mode: subagent` caller with no `tools:` — the `invoke(...)` literal surface. */
export function invokeCaller(...body: readonly string[]): string {
  return theta("---", "mode: subagent", "---", ...body, "@`hi`");
}

/** A `mode: subagent` caller resolving one callable entry — the callable surface. */
export function callableCaller(entry: string, ...body: readonly string[]): string {
  return theta("---", "mode: subagent", "tools:", `  - ${entry}`, "---", ...body, "@`hi`");
}

/** Write one `.theta` fixture into an existing directory. */
export function plantThetaFile(dir: string, stem: string, text: string): void {
  writeFileSync(join(dir, `${stem}.theta`), text, "utf8");
}

/** One fixture `plantThetaWorkspace` writes under a workspace's `.pi/theta/`. */
export interface PlantedThetaFile {
  readonly stem: string;
  readonly text: string;
  /** File extension, sans dot; default `"theta"`. */
  readonly ext?: string;
}

/**
 * Plant a temp project discovery workspace: `mkdtemp` a directory named for
 * `dirPrefix` under the OS temp root, create its `.pi/theta/` subdirectory,
 * write one file per fixture (`<stem>.<ext ?? "theta">`), and — when given —
 * write `settingsJson` to `.pi/settings.json`. Returns the workspace root, to
 * pass to `runProductionLoad` and, once the caller is done, `disposeWorkspace`.
 */
export function plantThetaWorkspace(
  dirPrefix: string,
  fixtures: readonly PlantedThetaFile[],
  settingsJson?: string,
): string {
  const workspaceDir = mkdtempSync(join(tmpdir(), dirPrefix));
  try {
    const projectThetaDir = join(workspaceDir, ".pi", "theta");
    mkdirSync(projectThetaDir, { recursive: true });
    for (const fixture of fixtures) {
      writeFileSync(
        join(projectThetaDir, `${fixture.stem}.${fixture.ext ?? "theta"}`),
        fixture.text,
        "utf8",
      );
    }
    if (settingsJson !== undefined) {
      writeFileSync(join(workspaceDir, ".pi", "settings.json"), settingsJson, "utf8");
    }
    return workspaceDir;
  } catch (error) {
    // The caller cannot dispose a workspace that failed before it was returned.
    disposeWorkspace(workspaceDir);
    throw error;
  }
}

/**
 * Recursively remove a workspace `plantThetaWorkspace` created; a no-op when
 * `workspaceDir` is `undefined` (a `beforeAll` that never assigned it).
 */
export function disposeWorkspace(workspaceDir: string | undefined): void {
  if (workspaceDir !== undefined) {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
}

/** The registered / notified sets, rendered for an assertion message. */
export function observedLoad(outcome: Pick<LoadOutcome, "registered" | "notifications">): string {
  return (
    ` Registered: ${JSON.stringify(outcome.registered)}` +
    ` Notified: ${JSON.stringify(outcome.notifications)}`
  );
}

/** Load one planted workspace before the suite and dispose it after all cells. */
export function productionLoadSuite(
  dirPrefix: string,
  fixtures: readonly PlantedThetaFile[],
  options: ProductionLoadOptions = {},
) {
  let outcome: LoadOutcome;
  let workspaceDir: string;

  beforeAll(async () => {
    // A minimal valid settings file pins the fixture's settings read to a known
    // value. An ABSENT settings file is silent (package-and-settings.md
    // §Failure modes), so the plant is hermeticity, not noise suppression.
    workspaceDir = plantThetaWorkspace(dirPrefix, fixtures, "{}");
    outcome = await runProductionLoad(workspaceDir, options);
  });

  afterAll(() => {
    disposeWorkspace(workspaceDir);
  });

  return {
    get outcome(): LoadOutcome { return outcome; },
    observed: (): string => observedLoad(outcome),
  };
}

/**
 * Load one planted workspace PER ROW (`<dirPrefix><stem>-` each) before the
 * suite, dispose them all after, and expose fail-loudly per-stem accessors
 * over the `stem -> LoadOutcome` map the loads filled.
 */
export function productionLoadRowsSuite(
  dirPrefix: string,
  rows: readonly PlantedThetaFile[],
) {
  const outcomes = new Map<string, LoadOutcome>();
  const workspaces: string[] = [];

  beforeAll(async () => {
    for (const row of rows) {
      // An absent settings file is silent; "{}" pins the fixture's settings read.
      const workspaceDir = plantThetaWorkspace(`${dirPrefix}${row.stem}-`, [row], "{}");
      workspaces.push(workspaceDir);
      outcomes.set(row.stem, await runProductionLoad(workspaceDir));
    }
  });

  afterAll(() => {
    for (const dir of workspaces) {
      disposeWorkspace(dir);
    }
  });

  /** One row's load outcome, or a loud failure naming the row. */
  function outcomeOf(stem: string): LoadOutcome {
    const found = outcomes.get(stem);
    if (found === undefined) {
      throw new Error(
        `no production-load outcome for '${stem}': the planted workspace was never loaded, ` +
          `so no assertion below it witnesses anything. Loaded: ${JSON.stringify([...outcomes.keys()])}`,
      );
    }
    return found;
  }

  /** A row's registered / notified sets, rendered for an assertion message. */
  function observed(stem: string): string {
    return observedLoad(outcomeOf(stem));
  }

  return { outcomeOf, observed };
}

/** Compose a single planted theta and return the runnable count, always disposing it. */
export async function composedRunnableCount(fileName: string, src: string, dirPrefix: string): Promise<number> {
  const workspace = plantThetaWorkspace(dirPrefix, [{ stem: fileName, text: src }], "{}");
  try {
    const pi = {
      getFlag: (): undefined => undefined,
      getCommands: (): unknown[] => [],
      sendMessage: (): void => {},
      registerCommand: (): void => {},
      registerMessageRenderer: (): void => {},
      registerFlag: (): void => {},
      on: (): void => {},
    } as unknown as ExtensionAPI;
    const ctx = {
      cwd: workspace,
      hasUI: false,
      modelRegistry: { getAvailable: (): readonly unknown[] => [] },
      ui: { notify: (): void => {} },
    } as unknown as ExtensionContext;
    return (await discoverAndComposeFixtures(pi, ctx)).length;
  } finally {
    disposeWorkspace(workspace);
  }
}

/** A clean control theta — registers, no diagnostics. */
export const GOOD_THETA = ["---", "mode: prompt", "tools: read", "---", "@`hi`", ""].join(
  "\n",
);
// A load FAILURE: `tools:` names a Pi tool absent from the threaded registry →
// `theta/load/unknown-tool` (an error-severity ERR-6 pre-eval failure). The theta
// is dropped (un-registered); the failure MUST route onto the note channel.
export const BAD_THETA = [
  "---",
  "mode: prompt",
  "tools: totally_unknown_xyz",
  "---",
  "@`hi`",
  "",
].join("\n");

/** A helper-path context with no available models and a recording toast sink. */
export function makeHelperCtx(
  cwd: string,
  hasUI: boolean,
  recorder: { readonly notifications: { message: string; type: string }[] },
): ExtensionContext {
  return {
    cwd,
    hasUI,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string, type: string): void => {
        recorder.notifications.push({ message, type });
      },
    },
  } as unknown as ExtensionContext;
}

/** A dispatch-time ctx sized to the prompt bind's session reads (empty session). */
export function composeDispatchCtx(): ExtensionCommandContext {
  return {
    model: { id: "claude-test", provider: "anthropic" },
    cwd: "/tmp",
    signal: undefined,
    sessionManager: {
      getEntries: () => [],
      getLeafId: () => undefined,
      getBranch: () => [],
    },
  } as unknown as ExtensionCommandContext;
}

/** A booted composition's registered dispatch surface. */
export interface ComposedHostHandle {
  dispatch(name: string, args: string): Promise<unknown>;
}

/**
 * Boot the real factory over the caller's `deps` (each suite keeps its own
 * `composeInstance` forwarding) against a recording `pi` whose entry surfaces
 * are PRESENT (so the entry channel is live and only the `ctx.mode` gate
 * decides mode-dependent wiring), fire `session_start` with the given
 * `ctx.mode`, and hand back the registered dispatch surface. `piExtras` /
 * `ctxExtras` merge over the base doubles for the members a specific suite
 * records or stubs.
 */
export async function bootComposedHost(options: {
  readonly cwd: string;
  readonly mode: "tui" | "print";
  readonly deps: ThetaExtensionDeps;
  readonly piExtras?: Record<string, unknown>;
  readonly ctxExtras?: Record<string, unknown>;
}): Promise<ComposedHostHandle> {
  const commands = new Map<
    string,
    { handler: (args: string, ctx: ExtensionCommandContext) => Promise<unknown> | unknown }
  >();
  const sessionStartHandlers: ((event: unknown, ctx: ExtensionContext) => unknown)[] = [];
  const pi = {
    registerFlag: (): void => {},
    registerMessageRenderer: (): void => {},
    registerEntryRenderer: (): void => {},
    appendEntry: (): void => {},
    registerCommand: (name: string, commandOptions: unknown): void => {
      commands.set(name, commandOptions as { handler: never });
    },
    on: (event: string, handler: (e: unknown, c: ExtensionContext) => unknown): void => {
      if (event === "session_start") {
        sessionStartHandlers.push(handler);
      }
    },
    getFlag: (): undefined => undefined,
    getCommands: (): { name: string; source: string }[] =>
      [...commands.keys()].map((name) => ({ name, source: "extension" })),
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
    ...options.piExtras,
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd: options.cwd,
    mode: options.mode,
    hasUI: options.mode === "tui",
    modelRegistry: {
      getAvailable: (): readonly unknown[] => [{ id: "claude-test", provider: "anthropic" }],
    },
    ui: { notify: (): void => {} },
    ...options.ctxExtras,
  } as unknown as ExtensionContext;
  createThetaExtension(options.deps)(pi);
  for (const handler of sessionStartHandlers) {
    await handler({ type: "session_start" }, ctx);
  }
  return {
    dispatch: async (name, args): Promise<unknown> => {
      const command = commands.get(name);
      if (command === undefined) {
        // No silent skipping: an unregistered fixture is a harness fault.
        throw new Error(
          `precondition unmet: /${name} never registered (registered: ${[...commands.keys()].join(", ")})`,
        );
      }
      return command.handler(args, composeDispatchCtx());
    },
  };
}

/** A recorded `pi.sendMessage` call (the `theta-system-note` channel). */
export interface RecordedNote {
  readonly customType: string;
  readonly content: string;
  readonly display: boolean;
  readonly details: { readonly diagnostics?: readonly Diagnostic[] } | undefined;
  readonly triggerTurn: unknown;
}

export interface ShippedHarness {
  readonly pi: ExtensionAPI;
  readonly commands: Map<string, unknown>;
  readonly notes: RecordedNote[];
  readonly notifications: string[];
  fireSessionStart(): Promise<void>;
}

/** Boot the real factory/composition with command, note and toast recorders. */
export function makeShippedHarness(
  cwd: string,
  availableModels: readonly unknown[] = [],
): ShippedHarness {
  const commands = new Map<string, unknown>();
  const notes: RecordedNote[] = [];
  const notifications: string[] = [];
  const subscriptions = new Map<
    string,
    ((event: unknown, ctx: ExtensionContext) => unknown)[]
  >();

  const pi = {
    registerFlag: (): void => {},
    registerMessageRenderer: (): void => {},
    registerCommand: (name: string, options: unknown): void => {
      commands.set(name, options);
    },
    on: (
      event: string,
      handler: (e: unknown, c: ExtensionContext) => unknown,
    ): void => {
      const list = subscriptions.get(event) ?? [];
      list.push(handler);
      subscriptions.set(event, list);
    },
    getFlag: (): undefined => undefined,
    getCommands: (): { name: string; source: string }[] =>
      [...commands.keys()].map((name) => ({ name, source: "extension" })),
    sendMessage: (
      message: {
        customType: string;
        content: string;
        display: boolean;
        details: unknown;
      },
      options: { triggerTurn: unknown },
    ): void => {
      notes.push({
        customType: message.customType,
        content: message.content,
        display: message.display,
        details: message.details as RecordedNote["details"],
        triggerTurn: options.triggerTurn,
      });
    },
    sendUserMessage: (): void => {},
  } as unknown as ExtensionAPI;

  const ctx = {
    cwd,
    hasUI: false,
    modelRegistry: { getAvailable: (): readonly unknown[] => [...availableModels] },
    // A recording toast so a regression back to the toast surface is observable.
    ui: {
      notify: (message: string, _type: "error"): void => {
        notifications.push(message);
      },
    },
  } as unknown as ExtensionContext;

  const deps: ThetaExtensionDeps = {
    fixtures: [],
    composeInstance: (composePi, composeCtx) =>
      composeExtensionInstance(composePi, composeCtx, {
        fileWatcher: new FakeFileWatcher(),
        clock: new FakeClock(),
      }),
  };
  createThetaExtension(deps)(pi);

  return {
    pi,
    commands,
    notes,
    notifications,
    fireSessionStart: async () => {
      for (const handler of subscriptions.get("session_start") ?? []) {
        await handler({ type: "session_start" }, ctx);
      }
    },
  };
}
