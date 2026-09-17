// Shared session_start-firing extension harness for the watch-arming test
// pair (PTQ-0363).
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
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  createThetaExtension,
  type ThetaExtensionDeps,
} from "../../src/extension/factory";
import {
  composeExtensionInstance,
  type ExtensionInstanceWiring,
} from "../../src/extension/production-composition";
import { FakeClock } from "./fake-clock";
import { RootsRecordingFileWatcher, waitFor } from "./fake-file-watcher";

export interface Harness {
  readonly pi: ExtensionAPI;
  fireSessionStart(): Promise<void>;
}

/**
 * A minimal `ExtensionAPI` recording commands and event subscriptions, plus a
 * matching `ExtensionContext`, able to fire `session_start`. `flags`
 * parameterises `pi.getFlag`: the `--theta` root reaches discovery only
 * through `getFlag('theta')` (`readThetaFlagPaths`,
 * production-composition.ts), so a caller whose scenario needs a `--theta`
 * flag supplies it; a caller with no such need (e.g. package-root discovery,
 * which reaches through `fs.cwd()` instead) omits it and every `getFlag`
 * answers `undefined`.
 */
export function makeHarness(
  cwd: string,
  flags: Readonly<Record<string, string>> = {},
): Harness {
  const commands = new Map<string, unknown>();
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
    on: (event: string, handler: (e: unknown, c: ExtensionContext) => unknown): void => {
      const list = subscriptions.get(event) ?? [];
      list.push(handler);
      subscriptions.set(event, list);
    },
    getFlag: (name: string): string | undefined => flags[name],
    getCommands: (): { name: string; source: string }[] =>
      [...commands.keys()].map((name) => ({ name, source: "extension" })),
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
  } as unknown as ExtensionAPI;

  const ctx = {
    cwd,
    hasUI: false,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: { notify: (): void => {} },
  } as unknown as ExtensionContext;

  const fire = async (event: string): Promise<void> => {
    for (const handler of subscriptions.get(event) ?? []) {
      await handler({ type: event }, ctx);
    }
  };

  return { pi, fireSessionStart: () => fire("session_start") };
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
