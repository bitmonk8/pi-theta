import { mkdtempSync, mkdirSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
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
import { REGISTRY_SWAP_FAILED_CODE } from "../src/extension/reload-wiring";
import { RELOAD_DEBOUNCE_WINDOW_MS } from "../src/extension/reload-debounce";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { FakeClock } from "./helpers/fake-clock";
import { FakeFileWatcher } from "./helpers/fake-file-watcher";

// Phase 5 (DISCO-2) — deterministic watcher / hot-reload integration.
//
// Boots the SHIPPED composition (`composeExtensionInstance`) through the real
// extension factory (`createThetaExtension`) with a FAKE `FileWatcher` seam and a
// FAKE, controllable `Clock` injected via the composition's test-only seam
// overrides. NO real chokidar and NO real timers back the watcher / debounce:
// discovery reads a real temp-dir workspace (the same on-disk drive the V20g
// conformance suite uses), the fake watcher fires the `onChange` event, and the
// fake clock crosses the 250 ms debounce boundary.
//
// Asserts the step-5 obligations DISCO-2 found unwired
// (registration-steps.md#watcher-hot-reload-registration,
// package-and-settings.md §"Caching and reload" / §"Watcher-time reload
// failures"):
//   (a) a debounced onChange re-runs discovery + swaps the registry;
//   (b) a newly-planted `.theta` becomes registered, a removed one is dropped
//       from the swapped `ThetaRegistry`;
//   (c) `structuralChangeNote` is emitted on a registered-set change;
//   (d) a rebuild failure surfaces ERR-7 (`theta/runtime/registry-swap-failed`)
//       on the `theta-system-note` channel, leaving the prior registry live;
//   (e) `session_shutdown` detaches the watcher and cancels the pending timer.

const GREET_THETA = ["---", "mode: prompt", "---", "@`hi`", ""].join("\n");
const SECOND_THETA = ["---", "mode: prompt", "---", "@`yo`", ""].join("\n");

/** A recorded `pi.sendMessage` call (the `theta-system-note` channel). */
interface RecordedNote {
  readonly customType: string;
  readonly content: string;
  readonly display: boolean;
  readonly details: { readonly diagnostics?: readonly Diagnostic[] };
  readonly triggerTurn: unknown;
}

interface Harness {
  readonly pi: ExtensionAPI;
  readonly ctx: ExtensionContext;
  readonly commands: Map<string, unknown>;
  readonly notes: RecordedNote[];
  readonly subscriptions: Map<
    string,
    ((event: unknown, ctx: ExtensionContext) => unknown)[]
  >;
  /** Arm/disarm a `pi.getCommands()` throw (drives the watcher-time swap failure). */
  setGetCommandsThrows(v: boolean): void;
  fireSessionStart(): Promise<void>;
  fireSessionShutdown(): Promise<void>;
}

function makeHarness(cwd: string): Harness {
  const commands = new Map<string, unknown>();
  const notes: RecordedNote[] = [];
  const subscriptions = new Map<
    string,
    ((event: unknown, ctx: ExtensionContext) => unknown)[]
  >();
  let getCommandsThrows = false;

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
    getFlag: (): undefined => undefined,
    getCommands: (): { name: string; source: string }[] => {
      if (getCommandsThrows) {
        throw new Error("getCommands boom (watcher-time)");
      }
      return [...commands.keys()].map((name) => ({ name, source: "extension" }));
    },
    sendMessage: (
      message: { customType: string; content: string; display: boolean; details: unknown },
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
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: { notify: (): void => {} },
  } as unknown as ExtensionContext;

  const fire = async (event: string): Promise<void> => {
    for (const handler of subscriptions.get(event) ?? []) {
      await handler({ type: event }, ctx);
    }
  };

  return {
    pi,
    ctx,
    commands,
    notes,
    subscriptions,
    setGetCommandsThrows: (v) => {
      getCommandsThrows = v;
    },
    fireSessionStart: () => fire("session_start"),
    // The wired `session_shutdown` handler is genuinely async (sub-step 4's
    // watcher-detach runs after sub-step 3's bounded await), so the teardown is
    // awaited before the test advances the clock — otherwise the pending
    // debounce timer fires ahead of the detach that cancels it.
    fireSessionShutdown: () => fire("session_shutdown"),
  };
}

/** Poll a real-timer-bounded condition (awaits the genuinely-async fs reads). */
async function waitFor(cond: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 400; i++) {
    if (cond()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timeout waiting for ${label}`);
}

describe("Phase 5 (DISCO-2) — watcher / hot-reload wired through the shipped composition", () => {
  let workspace: string;
  let thetaDir: string;
  let harness: Harness;
  let fakeWatcher: FakeFileWatcher;
  let fakeClock: FakeClock;
  let wiring: ExtensionInstanceWiring | undefined;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "theta-disco2-"));
    thetaDir = join(workspace, ".pi", "theta");
    mkdirSync(thetaDir, { recursive: true });
    writeFileSync(join(thetaDir, "greet.theta"), GREET_THETA, "utf8");

    harness = makeHarness(workspace);
    fakeWatcher = new FakeFileWatcher();
    fakeClock = new FakeClock();
    wiring = undefined;

    const deps: ThetaExtensionDeps = {
      fixtures: [],
      composeInstance: async (pi, ctx) => {
        wiring = await composeExtensionInstance(pi, ctx, {
          fileWatcher: fakeWatcher,
          clock: fakeClock,
        });
        return wiring;
      },
    };
    createThetaExtension(deps)(harness.pi);
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  /** Fire one debounced watcher reload and wait for it to settle. */
  async function fireReloadAndSettle(settled: () => boolean): Promise<void> {
    fakeWatcher.emit({ kind: "change", path: join(thetaDir, "greet.theta") });
    fakeClock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await waitFor(settled, "reload to settle");
  }

  it("(a)+(b): a debounced onChange re-runs discovery, swaps the registry, and registers a newly-planted .theta", async () => {
    await harness.fireSessionStart();

    // Initial boot: `/greet` registered, the watcher was armed exactly once.
    expect(harness.commands.has("greet")).toBe(true);
    expect(wiring).toBeDefined();
    expect(wiring?.registry.get("greet")).toBeDefined();
    expect(harness.commands.has("second")).toBe(false);

    // Plant a new theta on disk, then fire a debounced watcher event.
    writeFileSync(join(thetaDir, "second.theta"), SECOND_THETA, "utf8");
    await fireReloadAndSettle(() => wiring?.registry.get("second") !== undefined);

    // (a) discovery re-ran (only re-discovery could surface the new file) and
    // (b) the new theta is now in the swapped registry AND re-registered with pi.
    expect(wiring?.registry.get("second")).toBeDefined();
    expect(wiring?.registry.get("greet")).toBeDefined();
    expect(harness.commands.has("second")).toBe(true);
  });

  it("(b)+(c): removing a .theta drops it from the swapped registry and emits the structural-change note", async () => {
    await harness.fireSessionStart();
    expect(wiring?.registry.get("greet")).toBeDefined();
    const notesBefore = harness.notes.length;

    // Remove the theta on disk, then fire a debounced watcher event. A REAL
    // removal delivers `{kind:"unlink"}` (not the shared helper's `change`), so
    // the emitted event carries the removal the structural-note count is
    // defined over (registration-steps.md §Structural changes — the netted
    // add/unlink paths; bug 0311 §Fix constraint 4, fixed in v0.314.0). The
    // unlink nets removed=[<abs path to greet.theta>] under the path basis, so
    // N=1 and this cell's byte-pinned content assertion is unchanged.
    unlinkSync(join(thetaDir, "greet.theta"));
    fakeWatcher.emit({ kind: "unlink", path: join(thetaDir, "greet.theta") });
    fakeClock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await waitFor(
      () => wiring?.registry.get("greet") === undefined,
      "reload to settle",
    );

    // (b) the removed theta is dropped from the swapped registry.
    expect(wiring?.registry.get("greet")).toBeUndefined();

    // (c) a structural-change note fired on the set change (1 removed).
    const structural = harness.notes
      .slice(notesBefore)
      .find((n) => n.content.startsWith("theta watcher:"));
    expect(structural).toBeDefined();
    expect(structural?.content).toBe(
      "theta watcher: 1 file(s) added or removed; run /reload to refresh the slash command list",
    );
    expect(structural?.customType).toBe("theta-system-note");
    expect(structural?.triggerTurn).toBe(false);
  });

  it("(d): a watcher-time rebuild failure surfaces ERR-7 (registry-swap-failed) on the note channel and keeps the prior registry live", async () => {
    await harness.fireSessionStart();
    expect(wiring?.registry.get("greet")).toBeDefined();
    const notesBefore = harness.notes.length;

    // Arm a watcher-time failure in the re-parse/compose pass: `pi.getCommands()`
    // throws during the reload's re-discovery, so the staged build throws before
    // publish (PIC-36). Plant a new theta so a *successful* reload would have
    // changed the set — proving the discard, not a no-op.
    writeFileSync(join(thetaDir, "second.theta"), SECOND_THETA, "utf8");
    harness.setGetCommandsThrows(true);

    fakeWatcher.emit({ kind: "change", path: join(thetaDir, "second.theta") });
    fakeClock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await waitFor(
      () =>
        harness.notes
          .slice(notesBefore)
          .some((n) =>
            (n.details.diagnostics ?? []).some(
              (d) => d.code === REGISTRY_SWAP_FAILED_CODE,
            ),
          ),
      "ERR-7 registry-swap-failed note",
    );

    // ERR-7 routed onto the `theta-system-note` channel with triggerTurn:false.
    const err7 = harness.notes
      .slice(notesBefore)
      .find((n) =>
        (n.details.diagnostics ?? []).some(
          (d) => d.code === REGISTRY_SWAP_FAILED_CODE,
        ),
      );
    expect(err7).toBeDefined();
    expect(err7?.customType).toBe("theta-system-note");
    expect(err7?.triggerTurn).toBe(false);

    // The prior registry stays live: the discarded swap did not publish the new
    // theta, and the pre-existing `/greet` still resolves.
    expect(wiring?.registry.get("greet")).toBeDefined();
    expect(wiring?.registry.get("second")).toBeUndefined();
  });

  it("(e): session_shutdown detaches the watcher and cancels the pending debounce timer", async () => {
    await harness.fireSessionStart();
    expect(wiring?.registry.get("greet")).toBeDefined();

    // Plant a new theta and open a debounce window (a timer is now pending), but
    // do NOT cross the boundary yet.
    writeFileSync(join(thetaDir, "second.theta"), SECOND_THETA, "utf8");
    fakeWatcher.emit({ kind: "change", path: join(thetaDir, "second.theta") });

    // Tear down: session_shutdown must detach the watcher and cancel the timer.
    await harness.fireSessionShutdown();

    // Crossing the boundary now fires nothing (the pending timer was cancelled),
    // and a post-teardown watcher event no longer reaches the debouncer.
    fakeClock.advance(RELOAD_DEBOUNCE_WINDOW_MS * 4);
    fakeWatcher.emit({ kind: "change", path: join(thetaDir, "second.theta") });
    fakeClock.advance(RELOAD_DEBOUNCE_WINDOW_MS * 4);
    await new Promise((resolve) => setTimeout(resolve, 40));

    // No reload ran: the new theta never entered the registry and was never
    // registered with pi.
    expect(wiring?.registry.get("second")).toBeUndefined();
    expect(harness.commands.has("second")).toBe(false);
  });
});
