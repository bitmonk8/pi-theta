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
import { expect } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createThetaExtension, type ThetaExtensionDeps, type ThetaFixture } from "../../src/extension/factory";
import { composeExtensionInstance, discoverAndComposeFixtures } from "../../src/extension/production-composition";
import type { Diagnostic } from "../../src/diagnostics/diagnostic";
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

export interface ProductionLoadOptions {
  /** `ctx.modelRegistry.getAvailable()`'s report; default: no available models. */
  readonly availableModels?: readonly unknown[];
  /** `pi.getFlag("theta")`'s report; default: no CLI `--theta` flag. */
  readonly thetaFlag?: string;
  /** `pi.getCommands()`'s report; default: no Pi-owned commands. */
  readonly piOwnedCommands?: readonly { readonly name: string; readonly source: string }[];
}

/**
 * Run the shipped composition root's discovery/compose pass over `cwd`
 * through a fake, no-UI host: `pi.ui.notify` calls are recorded, and
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
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd,
    modelRegistry: { getAvailable: (): readonly unknown[] => opts.availableModels ?? [] },
    ui: {
      notify: (message: string, _type: "error"): void => {
        notifications.push(message);
      },
    },
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
