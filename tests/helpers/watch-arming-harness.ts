// Shared session_start-firing extension harness for the watch-arming test
// pair (PTQ-0363), plus factory dispatch, session lifecycle, and structural-note tests.
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
import type { Diagnostic } from "../../src/diagnostics/diagnostic";
import { ActiveInvocationRegistry } from "../../src/runtime/active-invocation-registry";
import { FakeClock } from "./fake-clock";
import { CountingFakeFileWatcher, RootsRecordingFileWatcher, waitFor } from "./fake-file-watcher";

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
    /** Foreign entries appended to the instance's extension-sourced registrations. */
    extraCommands?: readonly { readonly name: string; readonly source: string }[];
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
      [
        ...[...commands.keys()].map((name) => ({ name, source: "extension" })),
        ...(options.extraCommands ?? []),
      ],
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
export interface RecordedNote<Details = unknown> {
  readonly customType: string;
  readonly content: string;
  readonly display: boolean;
  readonly details: Details;
  readonly triggerTurn: unknown;
}

/** The diagnostic and structural payloads inspected by watcher witnesses. */
export interface WatchNoteDetails {
  readonly diagnostics?: readonly Diagnostic[];
  readonly structural?: {
    readonly added: readonly string[];
    readonly removed: readonly string[];
  };
}

export interface RecordingHarness<Details = unknown> extends Harness {
  readonly notes: RecordedNote<Details>[];
  /** Count of `pi.registerCommand` calls: a rebuild-settled signal that does
   *  not require the registered SET to change (a no-op-registry reload still
   *  re-registers every survivor, so the count advances). */
  registrationCount(): number;
}

/** Capture command handlers, notes, and subscriptions for dispatch and reload tests. */
export function makeRecordingHarness<Details = unknown>(
  cwd = "/does/not/matter",
): RecordingHarness<Details> {
  const notes: RecordedNote<Details>[] = [];
  let registrations = 0;
  const harness = makeHarness(cwd, {}, {
    onRegisterCommand: (): void => { registrations += 1; },
    sendMessage: (message, options): void => {
      notes.push({
        customType: message.customType,
        content: message.content,
        display: message.display,
        details: message.details as Details,
        triggerTurn: options.triggerTurn,
      });
    },
  });
  return { ...harness, notes, registrationCount: () => registrations };
}

/** The structural-change notes emitted since `from` (content-keyed). */
export function structuralNotesSince(
  harness: RecordingHarness<WatchNoteDetails>,
  from: number,
): RecordedNote<WatchNoteDetails>[] {
  return harness.notes
    .slice(from)
    .filter((note) => note.content.startsWith("theta watcher:"));
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

// Per-generation compose capture for the repeat-start and rebind witnesses.

/**
 * The pinned repeat-start diagnostic content (post-fix contract 1).
 * Deliberately a string literal rather than a `src/**` import: the
 * RED-at-HEAD run executes against a tree where the diagnostic does not exist
 * yet, and the red must land on the assertions, never on collection.
 */
export const REPEAT_START_NOTE =
  "theta: repeat session_start without session_shutdown; superseding prior hot-reload generation";

/** Prefix filter for "zero repeat-start notes" (control) — content-shape agnostic. */
const REPEAT_START_NOTE_PREFIX = "theta: repeat session_start";

/** The drain-state arm-(b) note for `/greet` (drain-state.ts `shuttingDownNote`). */
const GREET_SHUTTING_DOWN_NOTE = "theta /greet: extension shutting down";

/**
 * Bound (real ms) on awaiting a dispatched slash handler. Post-fix the
 * interesting dispatches short-circuit on a drain-state note and settle
 * immediately; PRE-fix a stale-generation dispatch can enter a REAL prompt-mode
 * theta run against the minimal fake command ctx, whose settling this suite
 * must not depend on — the note assertions carry the red either way.
 */
const DISPATCH_SETTLE_CAP_MS = 1200;

/** The message fields observed by the repeat-start and rebind suites. */
export type SupersessionNote = Pick<RecordedNote, "customType" | "content" | "display" | "triggerTurn">;

export interface SupersessionHarness extends Omit<Harness, "fireSessionShutdown"> {
  /** Registration call order, including re-registrations of a surviving name. */
  readonly registeredNames: string[];
  readonly notes: SupersessionNote[];
  /** Optional recording of a dispatched theta run's provider-turn request. */
  readonly userMessages: unknown[][];
  /**
   * Bug-0024 delta: extra `pi.getCommands()` entries carrying an ARBITRARY
   * `source`, planted and removed by a test between deliveries. `getCommands`
   * returns the extension-sourced registered names (what Pi reports back for
   * this instance's own registrations) concatenated with these, so a test can
   * model a genuine Pi-owned `"prompt"` template appearing under a name the
   * instance already registered.
   */
  readonly extraCommands: { readonly name: string; readonly source: string }[];
  fireSessionShutdown(): Promise<void>;
}

/** Record registrations and notes while retaining the host's own-command ledger. */
export function makeSupersessionHarness(cwd: string, recordUserMessages = false): SupersessionHarness {
  const registeredNames: string[] = [];
  const notes: SupersessionNote[] = [];
  const userMessages: unknown[][] = [];
  const extraCommands: { readonly name: string; readonly source: string }[] = [];
  const harness = makeHarness(cwd, {}, {
    extraCommands,
    onRegisterCommand: (name): void => {
      registeredNames.push(name);
    },
    sendMessage: (message, options): void => {
      notes.push({
        customType: message.customType,
        content: message.content,
        display: message.display,
        triggerTurn: options.triggerTurn,
      });
    },
    sendUserMessage: (...args: unknown[]): void => {
      if (recordUserMessages) userMessages.push(args);
    },
  });
  return {
    ...harness,
    registeredNames,
    notes,
    userMessages,
    extraCommands,
    // `reason: "exit"` always tears down without arming the session-swap tripwire.
    fireSessionShutdown: () => harness.fireSessionShutdown("exit"),
  };
}

/** One booted extension instance with per-compose watcher/wiring capture. */
export interface SupersessionBoot {
  readonly harness: SupersessionHarness;
  /** The ONE FakeClock shared by every compose (the bug-0021 repro pin). */
  readonly clock: FakeClock;
  /** Per-compose counting watchers, indexed by compose START order. */
  readonly watchers: CountingFakeFileWatcher[];
  /** Per-compose wirings, indexed by compose START order (set at compose settle). */
  readonly wirings: (ExtensionInstanceWiring | undefined)[];
  /** Release the deferred gate parked ahead of compose #index (gated boots only). */
  releaseCompose(index: number): void;
}

/** Wire the real factory with per-compose resources and an optional overlap gate. */
export function makeSupersessionBoot(
  workspace: string,
  options: { gateComposes?: boolean; recordUserMessages?: boolean } = {},
): SupersessionBoot {
  const harness = makeSupersessionHarness(workspace, options.recordUserMessages);
  const clock = new FakeClock();
  const watchers: CountingFakeFileWatcher[] = [];
  const wirings: (ExtensionInstanceWiring | undefined)[] = [];
  const releases: (() => void)[] = [];

  const deps: ThetaExtensionDeps = {
    fixtures: [],
    // The double must mirror the production default export's wiring
    // (src/extension/factory.ts) — forwarding the own-registration ledger as
    // the 5th argument — or the pass under test runs without the ledger.
    composeInstance: async (pi, ctx, ownRegisteredNames) => {
      // One NEW counting watcher per compose call, indexed by START order
      // (created synchronously at dep entry, before any await): generations
      // are distinguishable only by their per-compose resources, which is the
      // whole point of the bug.
      const index = watchers.length;
      const watcher = new CountingFakeFileWatcher();
      watchers.push(watcher);
      if (options.gateComposes === true) {
        // Overlap seam (test 3): park BEFORE the real compose runs so the
        // test can invert completion order against start order — the bug
        // report's last-completer-wins variant.
        await new Promise<void>((resolve) => {
          releases[index] = resolve;
        });
      }
      const wiring = await composeExtensionInstance(
        pi,
        ctx,
        { fileWatcher: watcher, clock },
        undefined,
        ownRegisteredNames,
      );
      wirings[index] = wiring;
      return wiring;
    },
  };
  createThetaExtension(deps)(harness.pi);

  return {
    harness,
    clock,
    watchers,
    wirings,
    releaseCompose: (index) => {
      const release = releases[index];
      if (release === undefined) {
        // No silent skipping (AGENTS.md): an unparked compose is a harness defect.
        throw new Error(`compose #${index + 1} never parked at its gate`);
      }
      release();
    },
  };
}

/** Loud indexed access (noUncheckedIndexedAccess + fail-loudly on setup faults). */
export function watcherAt<T>(b: { readonly watchers: readonly T[] }, index: number): T {
  const watcher = b.watchers[index];
  if (watcher === undefined) {
    throw new Error(`compose #${index + 1} never created its watcher`);
  }
  return watcher;
}

/** Read a settled compose wiring, failing loudly if the compose never resolved. */
export function wiringAt(b: { readonly wirings: readonly (ExtensionInstanceWiring | undefined)[] }, index: number): ExtensionInstanceWiring {
  const wiring = b.wirings[index];
  if (wiring === undefined) {
    throw new Error(`compose #${index + 1} never resolved its wiring`);
  }
  return wiring;
}

/**
 * Invoke the pi-registered handler for `/<name>` and await its settling,
 * bounded by `DISPATCH_SETTLE_CAP_MS` (see the constant's rationale). The
 * returned outcome is asserted only where the contract pins it; the
 * drain-state NOTE recorded (or not) on the harness is the real discriminator.
 */
export async function dispatchRegistered(
  harness: Pick<Harness, "commands">,
  name: string,
): Promise<"resolved" | "rejected" | "timed-out"> {
  const options = harness.commands.get(name) as RegisteredCommand | undefined;
  if (options === undefined) {
    // No silent skipping (AGENTS.md): a missing registration is a setup fault.
    throw new Error(`no command registered for /${name}`);
  }
  const settled = Promise.resolve(
    options.handler("", {} as unknown as ExtensionCommandContext),
  ).then(
    () => "resolved" as const,
    () => "rejected" as const,
  );
  return Promise.race([
    settled,
    new Promise<"timed-out">((resolve) =>
      setTimeout(() => resolve("timed-out"), DISPATCH_SETTLE_CAP_MS),
    ),
  ]);
}

/** All notes carrying the pinned repeat-start diagnostic prefix. */
export function repeatStartNotes<T extends { readonly content: string }>(harness: { readonly notes: readonly T[] }): readonly T[] {
  return harness.notes.filter((n) => n.content.startsWith(REPEAT_START_NOTE_PREFIX));
}

/** All arm-(b) shutting-down notes for `/greet`. */
export function greetShuttingDownNotes<T extends { readonly content: string }>(harness: { readonly notes: readonly T[] }): readonly T[] {
  return harness.notes.filter((n) => n.content === GREET_SHUTTING_DOWN_NOTE);
}
