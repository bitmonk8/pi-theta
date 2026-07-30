// Bug 0021 — RED offline regression suite, written BEFORE the fix. The
// spec-correct assertions in tests 2 and 3 MUST fail at HEAD (ea5de328); the
// control (test 1) must pass, proving every discriminator is live.
//
// Defect (docs/bugs/0021-double-session-start-leaks-armed-watcher.md): a
// second `session_start` at one extension instance overwrites the factory's
// single-slot hot-reload handle and the four live-teardown slots
// (`src/extension/factory.ts`) with NO detach/drain of the values being
// replaced: the superseded generation's watcher stays ARMED (leaked) and its
// reloads keep publishing into the superseded registry (re-binding live slash
// handlers to it — Pi has no unregister), and one `session_shutdown` tears
// down only the generation the slots name last, so the superseded
// generation's in-flight invocations are never cancelled and its forwarding
// listeners never detached.
//
// Spec encoded by the red assertions:
//  - registration-steps.md#watcher-hot-reload-registration (step 5): the
//    instance arms ONE hot-reload watcher whose teardown handle the
//    `session_shutdown` handler detaches — on EVERY path a repeat start can
//    take (step 3's supersession-pass language makes a repeat delivery a
//    contemplated input, not a host contract violation);
//  - session-shutdown-semantics.md sub-steps 1–5 + PIC-57/PIC-68: one shutdown
//    drains the registry, cancels + reason-stamps the in-flight invocations,
//    closes the watchers, and detaches the forwarding listeners the instance
//    holds — ALL of them, not the latest generation's; and no watcher-driven
//    rebuild survives teardown into the invalidated runtime;
//  - PIC-67's capture-compare shape extended to compose generations: a
//    compose that observes a NEWER compose started during its flight
//    publishes and arms nothing (closes the overlap variant's
//    last-completer-wins inversion).
//
// Pinned post-fix contract (stage 2 implements exactly this; asserted here on
// observables, never internals):
//  1. repeat-start diagnostic: each shutdown-less repeat `session_start`
//     delivery emits exactly ONE `theta-system-note` with the pinned content
//     below and `triggerTurn:false`; a single start emits zero;
//  2. supersede-before-publish: publishing over a previously-published
//     generation detaches that generation's watcher (a later `emit` is a
//     no-op) and DRAINS its registry, so a slash name still bound to it fails
//     safe at dispatch with the arm-(b) note (drain-state.ts
//     `routeDrainStateArm`: `(drained: true, tag: undefined)` → shutting-down);
//  3. one `session_shutdown` reaches EVERY generation: superseded in-flight
//     entries are aborted + `shutdownReason`-stamped and superseded
//     forwarding listeners detached, alongside the latest generation's normal
//     teardown (watcher detached, registry drained);
//  4. overlap: only the NEWEST-STARTED compose publishes and arms; a compose
//     that observed a newer start goes zero-touch — its watcher is NEVER
//     armed, its registry never published, nothing registered by it.
//
// Harness: mirrors tests/watcher-hot-reload-integration.test.ts (the real
// `createThetaExtension` + `composeExtensionInstance` over a mkdtemp temp-dir
// workspace, hand-rolled pi/ctx fakes, fireSessionStart/fireSessionShutdown)
// with the bug-0021 reproduction deltas: ONE shared `FakeClock` across all
// composes, one COUNTING `FakeFileWatcher` subclass PER compose call (so
// arm/detach is observable per generation), the per-compose wirings retained
// in START order, and — test 3 only — a per-call deferred gate ahead of
// `composeExtensionInstance` so compose completion order can be inverted
// against start order.

import { mkdtempSync, mkdirSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  createThetaExtension,
  type ThetaExtensionDeps,
} from "../src/extension/factory";
import {
  composeExtensionInstance,
  type ExtensionInstanceWiring,
} from "../src/extension/production-composition";
import { RELOAD_DEBOUNCE_WINDOW_MS } from "../src/extension/reload-debounce";
import type { ActiveInvocationEntry } from "../src/runtime/active-invocation-registry";
import { FakeClock } from "./helpers/fake-clock";
import { FakeFileWatcher } from "./helpers/fake-file-watcher";
import type {
  FileWatchEvent,
  OnWatchTerminate,
  Unsubscribe,
} from "../src/seams/file-watcher";

/**
 * The pinned repeat-start diagnostic content (post-fix contract 1).
 * Deliberately a string literal rather than a `src/**` import: the
 * RED-at-HEAD run executes against a tree where the diagnostic does not exist
 * yet, and the red must land on the assertions, never on collection.
 */
const REPEAT_START_NOTE =
  "theta: repeat session_start without session_shutdown; superseding prior hot-reload generation";

/** Prefix filter for "zero repeat-start notes" (control) — content-shape agnostic. */
const REPEAT_START_NOTE_PREFIX = "theta: repeat session_start";

/** The drain-state arm-(b) note for `/greet` (drain-state.ts `shuttingDownNote`). */
const GREET_SHUTTING_DOWN_NOTE = "theta /greet: extension shutting down";

const GREET_THETA = ["---", "mode: prompt", "---", "@`hi`", ""].join("\n");
const SECOND_THETA = ["---", "mode: prompt", "---", "@`hi`", ""].join("\n");

/**
 * Bound (real ms) on awaiting a dispatched slash handler. Post-fix the
 * interesting dispatches short-circuit on a drain-state note and settle
 * immediately; PRE-fix a stale-generation dispatch can enter a REAL prompt-mode
 * theta run against the minimal fake command ctx, whose settling this suite
 * must not depend on — the note assertions carry the red either way.
 */
const DISPATCH_SETTLE_CAP_MS = 1200;

/**
 * A per-compose counting watcher: `watchCalls`/`attached` make the step-5
 * arm/detach lifecycle of ONE compose generation observable (the defect is
 * precisely that the superseded generation's arm has no reachable detach).
 */
class CountingFakeFileWatcher extends FakeFileWatcher {
  watchCalls = 0;
  attached = false;

  override watch(
    roots: readonly string[],
    handler: (event: FileWatchEvent) => void,
    onTerminate?: OnWatchTerminate,
  ): Unsubscribe {
    this.watchCalls += 1;
    this.attached = true;
    const unsubscribe = super.watch(roots, handler, onTerminate);
    return () => {
      // Idempotent detach observation (FakeFileWatcher's own unsubscribe
      // already tolerates repeats).
      this.attached = false;
      unsubscribe();
    };
  }
}

/** A recorded `pi.sendMessage` call (the `theta-system-note` channel). */
interface RecordedNote {
  readonly customType: string;
  readonly content: string;
  readonly display: boolean;
  readonly triggerTurn: unknown;
}

/** The registered pi command options shape the dispatch helper invokes against. */
interface RegisteredCommand {
  readonly handler: (args: string, ctx: ExtensionCommandContext) => unknown;
}

interface Harness {
  readonly pi: ExtensionAPI;
  readonly ctx: ExtensionContext;
  readonly commands: Map<string, unknown>;
  /**
   * The SEQUENCE of `pi.registerCommand` names, in call order — the "no new
   * registerCommand calls" witness (a Map alone cannot show a re-register).
   */
  readonly registeredNames: string[];
  readonly notes: RecordedNote[];
  /** Recorded `pi.sendUserMessage` calls (a dispatched theta RUN's observable). */
  readonly userMessages: unknown[][];
  fireSessionStart(): Promise<void>;
  fireSessionShutdown(): Promise<void>;
}

function makeHarness(cwd: string): Harness {
  const commands = new Map<string, unknown>();
  const registeredNames: string[] = [];
  const notes: RecordedNote[] = [];
  const userMessages: unknown[][] = [];
  const subscriptions = new Map<
    string,
    ((event: unknown, ctx: ExtensionContext) => unknown)[]
  >();

  const pi = {
    registerFlag: (): void => {},
    registerMessageRenderer: (): void => {},
    registerCommand: (name: string, options: unknown): void => {
      registeredNames.push(name);
      commands.set(name, options);
    },
    on: (event: string, handler: (e: unknown, c: ExtensionContext) => unknown): void => {
      const list = subscriptions.get(event) ?? [];
      list.push(handler);
      subscriptions.set(event, list);
    },
    getFlag: (): undefined => undefined,
    getCommands: (): { name: string; source: string }[] =>
      [...commands.keys()].map((name) => ({ name, source: "extension" })),
    sendMessage: (
      message: { customType: string; content: string; display: boolean; details: unknown },
      options: { triggerTurn: unknown },
    ): void => {
      notes.push({
        customType: message.customType,
        content: message.content,
        display: message.display,
        triggerTurn: options.triggerTurn,
      });
    },
    sendUserMessage: (...args: unknown[]): void => {
      userMessages.push(args);
    },
  } as unknown as ExtensionAPI;

  const ctx = {
    cwd,
    hasUI: false,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: { notify: (): void => {} },
  } as unknown as ExtensionContext;

  const fire = async (event: string, payload: Record<string, unknown>): Promise<void> => {
    for (const handler of subscriptions.get(event) ?? []) {
      await handler(payload, ctx);
    }
  };

  return {
    pi,
    ctx,
    commands,
    registeredNames,
    notes,
    userMessages,
    fireSessionStart: () => fire("session_start", { type: "session_start" }),
    // `reason: "exit"` — an always-tear-down reason, so the V9r session-swap
    // tripwire stays un-armed and cannot confound the post-shutdown dispatch
    // discriminators below.
    fireSessionShutdown: () =>
      fire("session_shutdown", { type: "session_shutdown", reason: "exit" }),
  };
}

/** One booted extension instance with per-compose watcher/wiring capture. */
interface Boot {
  readonly harness: Harness;
  /** The ONE FakeClock shared by every compose (the bug-0021 repro pin). */
  readonly clock: FakeClock;
  /** Per-compose counting watchers, indexed by compose START order. */
  readonly watchers: CountingFakeFileWatcher[];
  /** Per-compose wirings, indexed by compose START order (set at compose settle). */
  readonly wirings: (ExtensionInstanceWiring | undefined)[];
  /** Release the deferred gate parked ahead of compose #index (gated boots only). */
  releaseCompose(index: number): void;
}

function makeBoot(workspace: string, options: { gateComposes?: boolean } = {}): Boot {
  const harness = makeHarness(workspace);
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
function watcherAt(b: Boot, index: number): CountingFakeFileWatcher {
  const watcher = b.watchers[index];
  if (watcher === undefined) {
    throw new Error(`compose #${index + 1} never created its watcher`);
  }
  return watcher;
}

function wiringAt(b: Boot, index: number): ExtensionInstanceWiring {
  const wiring = b.wirings[index];
  if (wiring === undefined) {
    throw new Error(`compose #${index + 1} never resolved its wiring`);
  }
  return wiring;
}

/** Poll a real-timer-bounded condition (the compose path does real fs I/O). */
async function waitFor(cond: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 400; i++) {
    if (cond()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timeout waiting for ${label}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Invoke the pi-registered handler for `/<name>` and await its settling,
 * bounded by `DISPATCH_SETTLE_CAP_MS` (see the constant's rationale). The
 * returned outcome is asserted only where the contract pins it; the
 * drain-state NOTE recorded (or not) on the harness is the real discriminator.
 */
async function dispatchRegistered(
  harness: Harness,
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
function repeatStartNotes(harness: Harness): readonly RecordedNote[] {
  return harness.notes.filter((n) => n.content.startsWith(REPEAT_START_NOTE_PREFIX));
}

/** All arm-(b) shutting-down notes for `/greet`. */
function greetShuttingDownNotes(harness: Harness): readonly RecordedNote[] {
  return harness.notes.filter((n) => n.content === GREET_SHUTTING_DOWN_NOTE);
}

describe("bug 0021 — double session_start supersession (registration-steps.md step 5, PIC-57/PIC-67/PIC-68)", () => {
  let workspace: string;
  let thetaDir: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "theta-bug0021-"));
    thetaDir = join(workspace, ".pi", "theta");
    mkdirSync(thetaDir, { recursive: true });
    writeFileSync(join(thetaDir, "greet.theta"), GREET_THETA, "utf8");
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Test 1 — control (GREEN at HEAD): proves the discriminators are live.
  // -------------------------------------------------------------------------

  it("control (GREEN at HEAD): a single start arms one watcher, emits no repeat-start note; shutdown detaches it and a post-shutdown /greet dispatch fails safe with the shutting-down note", async () => {
    const b = makeBoot(workspace);
    await b.harness.fireSessionStart();

    // One start: `/greet` registered, exactly ONE watcher created and armed once.
    expect(b.harness.commands.has("greet")).toBe(true);
    expect(b.watchers).toHaveLength(1);
    expect(watcherAt(b, 0).watchCalls).toBe(1);
    expect(watcherAt(b, 0).attached).toBe(true);

    // Contract 1's negative arm: a single start emits ZERO repeat-start notes.
    expect(repeatStartNotes(b.harness)).toStrictEqual([]);

    // Step-4 teardown detaches the one armed watcher (the step-5 contract the
    // repeat-start path must also honour).
    await b.harness.fireSessionShutdown();
    expect(watcherAt(b, 0).attached).toBe(false);

    // The arm-(b) discriminator is live: dispatching the still-registered
    // `/greet` after shutdown short-circuits on the drained registry with the
    // shutting-down note (drain-state.ts routeDrainStateArm) — no theta run.
    const outcome = await dispatchRegistered(b.harness, "greet");
    const shuttingDown = greetShuttingDownNotes(b.harness);
    expect(shuttingDown).toHaveLength(1);
    expect(shuttingDown[0]?.customType).toBe("theta-system-note");
    expect(shuttingDown[0]?.triggerTurn).toBe(false);
    expect(outcome).toBe("resolved");
  });

  // -------------------------------------------------------------------------
  // Test 2 — sequential double start (RED at HEAD): supersede-before-publish
  // plus full-teardown reach.
  // -------------------------------------------------------------------------

  it("sequential double start (RED at HEAD): a shutdown-less repeat session_start supersedes the prior generation — one diagnostic, detach+drain at publish, and one shutdown reaches every generation", async () => {
    const b = makeBoot(workspace);

    // Generation 1: normal boot, watcher 1 armed, `/greet` bound to wiring 1.
    await b.harness.fireSessionStart();
    expect(b.harness.commands.has("greet")).toBe(true);
    expect(watcherAt(b, 0).attached).toBe(true);

    // Model generation-1 live state at the repeat start: one in-flight
    // invocation entry (active-invocation-registry.md five-field shape) and
    // one attached forwarding listener (session-shutdown.md sub-step 5) —
    // exactly what a mid-invocation repeat start would strand at HEAD.
    let forwardingDetachCalls = 0;
    wiringAt(b, 0).forwardingSignals.push({
      label: "ctx.signal.removeEventListener",
      removeEventListener: () => {
        forwardingDetachCalls += 1;
      },
    });
    const fakeEntry: ActiveInvocationEntry = {
      thetaAbort: new AbortController(),
      disposeBarrier: Promise.resolve(),
      shutdownReason: undefined,
      theta: "greet",
      invocationId: "00000000-0000-4000-8000-000000000000",
    };
    wiringAt(b, 0).activeInvocations.add(fakeEntry);

    // Generation 2 discovers ONLY `/second`: `/greet` is deleted from disk, so
    // the second pass never re-registers it and the pi-registered `/greet`
    // handler stays bound to generation 1's registry — mirroring production,
    // where Pi has no unregister.
    unlinkSync(join(thetaDir, "greet.theta"));
    writeFileSync(join(thetaDir, "second.theta"), SECOND_THETA, "utf8");
    await b.harness.fireSessionStart();

    // (a) Exactly one repeat-start diagnostic on the theta-system-note channel.
    const repeats = repeatStartNotes(b.harness);
    expect.soft(
      repeats,
      "(a) exactly one repeat-start diagnostic per shutdown-less repeat delivery",
    ).toHaveLength(1);
    for (const note of repeats) {
      expect.soft(note.content, "(a) pinned diagnostic content").toBe(REPEAT_START_NOTE);
      expect.soft(note.customType, "(a) theta-system-note channel").toBe("theta-system-note");
      expect.soft(note.triggerTurn, "(a) triggerTurn:false").toBe(false);
    }

    // (b) Supersede-before-publish: generation 1's watcher was DETACHED the
    // moment generation 2 published; generation 2's is armed. Each generation
    // armed exactly once.
    expect(b.watchers).toHaveLength(2);
    expect.soft(
      watcherAt(b, 0).attached,
      "(b) superseded generation's watcher detached at supersession",
    ).toBe(false);
    expect.soft(watcherAt(b, 1).attached, "(b) new generation's watcher armed").toBe(true);
    expect.soft(watcherAt(b, 0).watchCalls, "(b) generation 1 armed exactly once").toBe(1);
    expect.soft(watcherAt(b, 1).watchCalls, "(b) generation 2 armed exactly once").toBe(1);

    // (c) The outgoing registry is drained at supersession; the live one is not.
    expect.soft(
      wiringAt(b, 0).registry.readDrainState().drained,
      "(c) superseded generation's registry drained at supersession",
    ).toBe(true);
    expect.soft(
      wiringAt(b, 1).registry.readDrainState().drained,
      "(c) live generation's registry not drained",
    ).toBe(false);

    // (d) Generation 2's registration pass ran.
    expect(b.harness.commands.has("second")).toBe(true);

    // (e) A superseded-generation reload can never publish: a watcher-1 change
    // event across the debounce boundary must be a no-op (post-fix the watcher
    // is detached; at HEAD it rebuilds and re-registers against the superseded
    // registry — the bug report's registry-divergence step).
    const registeredBeforeLeakProbe = b.harness.registeredNames.length;
    watcherAt(b, 0).emit({ kind: "change", path: join(thetaDir, "second.theta") });
    b.clock.advance(RELOAD_DEBOUNCE_WINDOW_MS * 2);
    await sleep(50);
    expect.soft(
      wiringAt(b, 0).registry.get("second"),
      "(e) superseded generation's reload must not publish into its registry",
    ).toBeUndefined();
    expect.soft(
      b.harness.registeredNames.length,
      "(e) superseded generation's reload must not re-register live commands",
    ).toBe(registeredBeforeLeakProbe);

    // (f) Stale-bound dispatch fails safe: `/greet` is still bound to
    // generation 1's (now drained) registry, so dispatch takes arm (b) —
    // the shutting-down note, never a theta run (contract 2).
    const userMessagesBeforeDispatch = b.harness.userMessages.length;
    const outcome = await dispatchRegistered(b.harness, "greet");
    const shuttingDown = greetShuttingDownNotes(b.harness);
    expect.soft(
      shuttingDown,
      "(f) stale-bound /greet dispatch fails safe with the arm-(b) shutting-down note",
    ).toHaveLength(1);
    for (const note of shuttingDown) {
      expect.soft(note.customType, "(f) theta-system-note channel").toBe("theta-system-note");
      expect.soft(note.triggerTurn, "(f) triggerTurn:false").toBe(false);
    }
    expect.soft(outcome, "(f) the fail-safe dispatch resolves").toBe("resolved");
    expect.soft(
      b.harness.userMessages.length,
      "(f) no theta run was triggered (no user message sent)",
    ).toBe(userMessagesBeforeDispatch);

    // (g) ONE session_shutdown reaches EVERY generation (contract 3): the
    // latest generation's normal teardown PLUS the superseded generation's
    // in-flight entry cancelled + stamped and its forwarding listener detached.
    await b.harness.fireSessionShutdown();
    expect.soft(watcherAt(b, 1).attached, "(g) latest watcher detached by shutdown").toBe(false);
    expect.soft(
      wiringAt(b, 1).registry.readDrainState().drained,
      "(g) latest registry drained by shutdown",
    ).toBe(true);
    expect.soft(
      fakeEntry.thetaAbort.signal.aborted,
      "(g) superseded generation's in-flight invocation aborted by the one shutdown",
    ).toBe(true);
    expect.soft(
      typeof fakeEntry.shutdownReason,
      "(g) superseded generation's in-flight entry reason-stamped",
    ).toBe("string");
    expect.soft(
      forwardingDetachCalls,
      "(g) superseded generation's forwarding listener detached by the one shutdown",
    ).toBe(1);

    // (h) Post-shutdown, the superseded generation stays quiescent: another
    // watcher-1 boundary publishes/registers nothing, and a repeat `/greet`
    // dispatch yields the shutting-down note again (PIC-57: no watcher-driven
    // rebuild survives teardown).
    const registeredBeforePostShutdownProbe = b.harness.registeredNames.length;
    const shuttingDownBeforeRepeat = greetShuttingDownNotes(b.harness).length;
    watcherAt(b, 0).emit({ kind: "change", path: join(thetaDir, "second.theta") });
    b.clock.advance(RELOAD_DEBOUNCE_WINDOW_MS * 2);
    await sleep(50);
    expect.soft(
      wiringAt(b, 0).registry.get("second"),
      "(h) post-shutdown the superseded registry must stay unpublished",
    ).toBeUndefined();
    expect.soft(
      b.harness.registeredNames.length,
      "(h) post-shutdown no further registerCommand calls",
    ).toBe(registeredBeforePostShutdownProbe);
    const repeatOutcome = await dispatchRegistered(b.harness, "greet");
    expect.soft(repeatOutcome, "(h) the repeat fail-safe dispatch resolves").toBe("resolved");
    expect.soft(
      greetShuttingDownNotes(b.harness).length - shuttingDownBeforeRepeat,
      "(h) a repeat /greet dispatch yields the shutting-down note again",
    ).toBe(1);
  }, 15000);

  // -------------------------------------------------------------------------
  // Test 3 — overlap variant (RED at HEAD): two composes in flight; pre-fix
  // the LAST completer wins the slots regardless of start order.
  // -------------------------------------------------------------------------

  it("overlap variant (RED at HEAD): only the newest-started compose publishes and arms; the superseded-in-flight compose goes zero-touch, and one shutdown detaches the newest watcher", async () => {
    const b = makeBoot(workspace, { gateComposes: true });

    // Two session_start deliveries, neither compose completed yet: compose #1
    // parks at gate 1, compose #2 at gate 2.
    const p1 = b.harness.fireSessionStart();
    await waitFor(() => b.watchers.length === 1, "compose #1 to park at its gate");
    const p2 = b.harness.fireSessionStart();
    await waitFor(() => b.watchers.length === 2, "compose #2 to park at its gate");

    // Invert completion order against start order: the NEWEST-started compose
    // (#2) completes FIRST and publishes/arms; the older compose (#1)
    // completes LAST — pre-fix the last completer overwrites the slots.
    b.releaseCompose(1);
    await p2;
    b.releaseCompose(0);
    await p1;

    // (a) Exactly one repeat-start diagnostic (delivery #2 was shutdown-less);
    // the zero-touch superseded compose adds none.
    const repeats = repeatStartNotes(b.harness);
    expect.soft(
      repeats,
      "(a) exactly one repeat-start diagnostic across the overlapping starts",
    ).toHaveLength(1);
    for (const note of repeats) {
      expect.soft(note.content, "(a) pinned diagnostic content").toBe(REPEAT_START_NOTE);
      expect.soft(note.customType, "(a) theta-system-note channel").toBe("theta-system-note");
      expect.soft(note.triggerTurn, "(a) triggerTurn:false").toBe(false);
    }

    // (b) Only the newest-started compose armed. A compose that observed a
    // newer compose started during its flight goes ZERO-touch: `watch()` is
    // NEVER called on its watcher (contract 4) — pre-fix the last completer
    // arms it, so this is the overlap red at HEAD.
    expect(b.watchers).toHaveLength(2);
    expect.soft(watcherAt(b, 1).watchCalls, "(b) newest compose armed exactly once").toBe(1);
    expect.soft(watcherAt(b, 1).attached, "(b) newest compose's watcher stays armed").toBe(true);
    expect.soft(
      watcherAt(b, 0).watchCalls,
      "(b) superseded-in-flight compose must NEVER arm its watcher",
    ).toBe(0);
    expect.soft(
      watcherAt(b, 0).attached,
      "(b) superseded-in-flight compose's watcher not attached",
    ).toBe(false);
    expect.soft(
      b.harness.registeredNames.filter((name) => name === "greet"),
      "(b) /greet registered exactly once — the zero-touch compose registers nothing",
    ).toHaveLength(1);

    // (c) Generation 2 is LIVE: `/greet` is registered and dispatching it does
    // not hit the shutting-down arm.
    expect(b.harness.commands.has("greet")).toBe(true);
    const shuttingDownBeforeDispatch = greetShuttingDownNotes(b.harness).length;
    await dispatchRegistered(b.harness, "greet");
    expect.soft(
      greetShuttingDownNotes(b.harness).length - shuttingDownBeforeDispatch,
      "(c) dispatching /greet must not produce a shutting-down note — generation 2 is live",
    ).toBe(0);
    // The live dispatch entered a real prompt-mode run against the fake
    // command ctx; let its invocation entry settle so the shutdown below
    // cannot park sub-step 3 on an in-flight disposeBarrier.
    await waitFor(
      () =>
        b.wirings.every(
          (wiring) => wiring === undefined || wiring.activeInvocations.size() === 0,
        ),
      "the /greet dispatch's invocation entry to settle",
    );

    // (d) ONE shutdown tears down the generation that actually armed: the
    // NEWEST watcher detaches and the NEWEST registry drains — pre-fix the
    // teardown lands on the last completer (#1) and the newest generation
    // leaks armed with its registry undrained. The never-published wiring
    // stays at its factory drain state (the zero-touch posture).
    await b.harness.fireSessionShutdown();
    expect.soft(
      watcherAt(b, 1).attached,
      "(d) the one shutdown must detach the newest (armed) watcher",
    ).toBe(false);
    expect.soft(
      wiringAt(b, 1).registry.readDrainState().drained,
      "(d) the one shutdown must drain the newest (published) registry",
    ).toBe(true);
    expect.soft(
      wiringAt(b, 0).registry.readDrainState().drained,
      "(d) the never-published registry stays untouched (zero-touch posture)",
    ).toBe(false);
  }, 15000);

  // -------------------------------------------------------------------------
  // Test 4 — start-after-shutdown control: a rebind after a COMPLETED
  // shutdown is a legitimate re-arm, not a shutdown-less repeat
  // (registration-steps.md#repeat-start-supersession: "a start-after-shutdown
  // rebind emits none and supersedes nothing"). Locks the per-delivery
  // predicate: the note keys on "zero shutdowns consumed since the previous
  // start", never on a cumulative starts-vs-shutdowns imbalance.
  // -------------------------------------------------------------------------

  it("start-after-shutdown control: a rebind after a completed shutdown emits ZERO repeat-start notes, arms a fresh watcher for the rebind generation, and a second shutdown detaches it", async () => {
    const b = makeBoot(workspace);

    // Generation 1: normal boot (watcher 1 armed), then a COMPLETED shutdown
    // — watcher detached and the factory's fold inputs consumed.
    await b.harness.fireSessionStart();
    await b.harness.fireSessionShutdown();
    expect(watcherAt(b, 0).attached).toBe(false);

    // Generation 2: the rebind delivery. A shutdown landed between the two
    // starts, so this pass's supersession step is a structural no-op (the
    // shutdown handler already cleared the fold inputs) and the fresh watcher
    // arms normally.
    await b.harness.fireSessionStart();

    // ZERO repeat-start notes across the WHOLE sequence — the per-delivery
    // rule; a cumulative imbalance predicate would misfire here forever after
    // any earlier supersession.
    expect(repeatStartNotes(b.harness)).toStrictEqual([]);

    // The rebind pass ran to its tail and armed a FRESH watcher exactly
    // once; generation 1's stays detached (no re-arm, no re-detach).
    // `/greet` remains pi-registered from generation 1 (Pi has no
    // unregister) and the rebind pass RE-OWNS it: per
    // registration-steps.md#pic-69 the collision source set excludes every
    // entry that carries `source: "extension"` and bears a name this instance
    // itself passed to `pi.registerCommand`, so generation 1's own `/greet`
    // is not a cross-format collision against the re-discovered greet.theta.
    // Per registration-steps.md#surviving-name-re-ownership a name whose
    // `.theta` still resolves in the rebind pass therefore registers AGAIN,
    // rebinding the live `/greet` to the new generation's drain-gated handler
    // — the registeredNames SEQUENCE witnesses exactly two (a Map alone
    // could not). Bug 0024 owns this clause and its own witness suite
    // (tests/rebind-self-collision-reownership.test.ts); the length-2
    // expectation below was red at 1d516897 and is closed by the bug-0024
    // fix landing alongside that suite.
    expect(b.harness.commands.has("greet")).toBe(true);
    expect(
      b.harness.registeredNames.filter((name) => name === "greet"),
    ).toHaveLength(2);
    expect(b.watchers).toHaveLength(2);
    expect(watcherAt(b, 1).attached).toBe(true);
    expect(watcherAt(b, 1).watchCalls).toBe(1);
    expect(watcherAt(b, 0).attached).toBe(false);
    expect(watcherAt(b, 0).watchCalls).toBe(1);

    // No double-teardown blow-ups: a second session_shutdown tears down
    // generation 2 normally — its watcher detaches — with generation 1
    // already consumed by the first shutdown.
    await b.harness.fireSessionShutdown();
    expect(watcherAt(b, 1).attached).toBe(false);
  }, 15000);
});
