// Shared session_start-firing extension harness for the watch-arming test
// pair (PTQ-0363), plus factory dispatch and session lifecycle wiring tests.
//
// WHY THIS FILE EXISTS. tests/b0310-watch-roots-root-union.test.ts and
// tests/b0339-package-source-watch-arming.test.ts each independently
// redeclared the same `Harness` interface, `makeHarness` function (a minimal
// `ExtensionAPI`/`ExtensionContext` double that records registered commands
// and event subscriptions and can fire `session_start`), and `boot` sequence
// (wire `makeHarness`'s `pi` through `createThetaExtension` /
// `composeExtensionInstance` with a `RootsRecordingFileWatcher`/`FakeClock`
// pair, fire `session_start`, then wait for the watcher to arm) —
// b0339's own doc comment already stated its `makeHarness` "Mirrors b0310's".
// PTQ-0236 already extracted this same file pair's OTHER shared quartet
// (`RootsRecordingFileWatcher`/`norm`/`waitFor`/`armedRoots`) into
// `fake-file-watcher.ts`; this module extracts the residual
// `Harness`/`makeHarness`/`boot` trio that extraction did not reach.
//
// TIER: unit, offline, deterministic, provider-free — the same tier as every
// file that imports this module.

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  SessionShutdownEvent,
} from "@earendil-works/pi-coding-agent";
import {
  createThetaExtension,
  type ThetaExtensionDeps,
} from "../../src/extension/factory";
import {
  composeExtensionInstance,
  type ExtensionInstanceWiring,
} from "../../src/extension/production-composition";
import type { ParsedTheta, ThetaRegistry } from "../../src/extension/reload-wiring";
import { ActiveInvocationRegistry } from "../../src/runtime/active-invocation-registry";
import { FakeClock } from "./fake-clock";
import { RootsRecordingFileWatcher, waitFor } from "./fake-file-watcher";

export interface Harness {
  readonly pi: ExtensionAPI;
  readonly ctx: ExtensionContext;
  readonly commands: Map<string, unknown>;
  readonly subscriptions: Map<
    string,
    ((event: unknown, ctx: ExtensionContext) => unknown)[]
  >;
  fireSessionStart(): Promise<void>;
  /** Also accepts the legacy `exit` reason pinned by the supersession witnesses. */
  fireSessionShutdown(reason: SessionShutdownEvent["reason"] | "exit"): Promise<void>;
}

/**
 * A minimal `ExtensionAPI` recording commands and event subscriptions, plus a
 * matching `ExtensionContext`, able to fire `session_start`. `flags`
 * parameterises `pi.getFlag`: the `--theta` root reaches discovery only
 * through `getFlag('theta')` (`readThetaFlagPaths`,
 * production-composition.ts), so a caller whose scenario needs a `--theta`
 * flag supplies it; a caller with no such need (e.g. package-root discovery,
 * which reaches through `fs.cwd()` instead) omits it and every `getFlag`
 * answers `undefined`. `sendUserMessage: false` preserves the smaller
 * factory-wiring double that has no provider-turn member. Optional callbacks
 * retain each caller's command/message recording shape, including raw objects.
 */
export function makeHarness(
  cwd = "/does/not/matter",
  flags: Readonly<Record<string, string>> = {},
  options: {
    onRegisterCommand?: (name: string, options: unknown) => void;
    sendMessage?: (
      message: { customType: string; content: string; display: boolean; details: unknown },
      options: { triggerTurn: unknown },
    ) => void;
    sendUserMessage?: boolean | ((...args: unknown[]) => void);
  } = {},
): Harness {
  const commands = new Map<string, unknown>();
  const subscriptions = new Map<
    string,
    ((event: unknown, ctx: ExtensionContext) => unknown)[]
  >();

  const pi = {
    registerFlag: (): void => {},
    registerMessageRenderer: (): void => {},
    registerCommand: (name: string, commandOptions: unknown): void => {
      options.onRegisterCommand?.(name, commandOptions);
      commands.set(name, commandOptions);
    },
    on: (event: string, handler: (e: unknown, c: ExtensionContext) => unknown): void => {
      const list = subscriptions.get(event) ?? [];
      list.push(handler);
      subscriptions.set(event, list);
    },
    getFlag: (name: string): string | undefined => flags[name],
    getCommands: (): { name: string; source: string }[] =>
      [...commands.keys()].map((name) => ({ name, source: "extension" })),
    sendMessage: options.sendMessage ?? ((): void => {}),
    ...(options.sendUserMessage === false ? {} : {
      sendUserMessage: typeof options.sendUserMessage === "function"
        ? options.sendUserMessage
        : (): void => {},
    }),
  } as unknown as ExtensionAPI;

  const ctx = {
    cwd,
    hasUI: false,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: { notify: (): void => {} },
  } as unknown as ExtensionContext;

  const fire = async (event: string, payload: unknown): Promise<void> => {
    for (const handler of subscriptions.get(event) ?? []) {
      await handler(payload, ctx);
    }
  };

  return {
    pi,
    ctx,
    commands,
    subscriptions,
    fireSessionStart: () => fire("session_start", { type: "session_start" }),
    fireSessionShutdown: (reason) =>
      fire("session_shutdown", { type: "session_shutdown", reason }),
  };
}

/** The result of `bootWatchArming`: the composed wiring (`undefined` only if
 *  the compose callback never ran) and the roots-recording watcher it armed. */
export interface WatchArmingBoot {
  readonly wiring: ExtensionInstanceWiring | undefined;
  readonly fakeWatcher: RootsRecordingFileWatcher;
}

/**
 * Boot the shipped composition (`createThetaExtension` →
 * `composeExtensionInstance`) at `workspace` with a fresh
 * `RootsRecordingFileWatcher` and `FakeClock` unless supplied in `options`,
 * over the harness `makeHarness` builds (passing `flags` through), fire
 * `session_start`, and wait for the watcher to arm. An event-capable watcher
 * with the same `watchCalls` shape can be supplied for reload witnesses,
 * along with the clock they advance (b0339 Case H, PTQ-0438).
 */
export async function bootWatchArming(
  workspace: string,
  flags: Readonly<Record<string, string>> = {},
  options: {
    readonly fileWatcher?: RootsRecordingFileWatcher;
    readonly clock?: FakeClock;
    readonly waitLabel?: string;
  } = {},
): Promise<WatchArmingBoot> {
  const fakeWatcher = options.fileWatcher ?? new RootsRecordingFileWatcher();
  const harness = makeHarness(workspace, flags);
  let wiring: ExtensionInstanceWiring | undefined;
  const deps: ThetaExtensionDeps = {
    fixtures: [],
    composeInstance: async (pi, ctx) => {
      wiring = await composeExtensionInstance(pi, ctx, {
        fileWatcher: fakeWatcher,
        clock: options.clock ?? new FakeClock(),
      });
      return wiring;
    },
  };
  createThetaExtension(deps)(harness.pi);
  await harness.fireSessionStart();
  await waitFor(() => fakeWatcher.watchCalls.length > 0, options.waitLabel ?? "watcher to arm");
  return { wiring, fakeWatcher };
}

/**
 * A minimal `ParsedTheta`. Factory dispatch reads `slashName` and `run`;
 * `frontmatter` and `body` carry inert placeholders.
 */
export function makeTheta(
  slashName: string,
  run: (args: string, ctx: ExtensionCommandContext) => Promise<void> = async (): Promise<void> => {},
): ParsedTheta {
  return {
    slashName,
    frontmatter: { mode: "prompt" } as unknown as ParsedTheta["frontmatter"],
    body: { statements: [] } as unknown as ParsedTheta["body"],
    run,
  };
}

/** A recorded `pi.sendMessage` call, including its delivery option. */
export interface RecordedNote {
  readonly customType: string;
  readonly content: string;
  readonly display: boolean;
  readonly details: unknown;
  readonly triggerTurn: unknown;
}

export interface RecordingHarness extends Harness {
  readonly notes: RecordedNote[];
}

/** Capture command handlers, notes, and subscriptions for factory dispatch tests. */
export function makeRecordingHarness(): RecordingHarness {
  const notes: RecordedNote[] = [];
  const harness = makeHarness("/does/not/matter", {}, {
    sendMessage: (message, options): void => {
      notes.push({
        customType: message.customType,
        content: message.content,
        display: message.display,
        details: message.details,
        triggerTurn: options.triggerTurn,
      });
    },
  });
  return { ...harness, notes };
}

/** The registered pi command options shape the dispatch helpers invoke against. */
export interface RegisteredCommand {
  readonly handler: (args: string, ctx: ExtensionCommandContext) => unknown;
}

/** Invoke the captured pi handler for `name`, failing loudly if registration is missing. */
export async function invoke(harness: Pick<Harness, "commands">, name: string, args = ""): Promise<void> {
  const options = harness.commands.get(name) as RegisteredCommand | undefined;
  if (options === undefined) {
    throw new Error(`no command registered for /${name}`);
  }
  await options.handler(args, {} as unknown as ExtensionCommandContext);
}

/** The `theta-system-note` entries recorded so far. */
export function thetaNotes(harness: RecordingHarness): readonly RecordedNote[] {
  return harness.notes.filter((n) => n.customType === "theta-system-note");
}

/**
 * Boot the real factory with a controlled registry and no-op hot reload, then
 * fire `session_start` so each theta has its registered drain-gated handler.
 * Tripwire witnesses may supply the fail-fast terminator seam.
 */
export async function bootRegistryHarness(
  registry: ThetaRegistry,
  thetas: readonly ParsedTheta[],
  options: Pick<ThetaExtensionDeps, "terminator"> = {},
): Promise<RecordingHarness> {
  const harness = makeRecordingHarness();
  const deps: ThetaExtensionDeps = {
    fixtures: [],
    ...options,
    composeInstance: async (): Promise<ExtensionInstanceWiring> => ({
      thetas,
      registry,
      activeInvocations: new ActiveInvocationRegistry(),
      forwardingSignals: [],
      clock: new FakeClock(),
      installHotReload: () => ({ detach: (): void => {} }),
    }),
  };
  createThetaExtension(deps)(harness.pi);
  await harness.fireSessionStart();
  return harness;
}
