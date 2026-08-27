import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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
import type {
  FileWatcher,
  FileWatchEvent,
  OnWatchTerminate,
  Unsubscribe,
} from "../src/seams/file-watcher";
import { FakeClock } from "./helpers/fake-clock";

// Bug 0310 — witness: the armed watch set must be the resolved discovery-root
// union over the walk's four sources (cli/settings/project/global; roots present
// at scan time), NOT the dirnames of the
// `.theta` files discovery FOUND. `activeRoots` is derived from found files
// (`Array.from(new Set(discovered.map((theta) => dirname(theta.path))))`,
// production-composition.ts:634), and the watch list unions exactly that subset
// with the two settings-file paths (production-composition.ts:1416). A
// present-but-EMPTY active root — a scaffolded `<ws>/.pi/theta/` with no thetas
// yet — contributes no found file, so it is never armed. §Fix constraint 1
// requires the watch list to consume the resolved root union (unioned with the
// file-derived set), and §Fix constraint 4 names this roots-recording witness:
// the empty-`.pi/theta` case plus the zero-theta case.
//
// Both cases assert the SPECIFIED behaviour (the present-but-empty project root
// IS armed), so each reds today and goes green once the fix lands. Mirrors the
// fake-pi + shipped-composition harness of
// `tests/watcher-hot-reload-integration.test.ts`, swapping in a FileWatcher
// fake that records the `roots` argument to `watch()`.

const HELLO_THETA = ["---", "mode: prompt", "---", "@`hi`", ""].join("\n");

/** FileWatcher seam fake whose only job is to record each `watch()` root list. */
class RootsRecordingFileWatcher implements FileWatcher {
  readonly watchCalls: readonly string[][] = [];

  watch(
    roots: readonly string[],
    _handler: (event: FileWatchEvent) => void,
    _onTerminate?: OnWatchTerminate,
  ): Unsubscribe {
    (this.watchCalls as string[][]).push([...roots]);
    return () => {};
  }
}

interface Harness {
  readonly pi: ExtensionAPI;
  fireSessionStart(): Promise<void>;
}

/**
 * `flags` parameterises `pi.getFlag`: the `--theta` root reaches discovery only
 * through `getFlag('theta')` (`readThetaFlagPaths`, production-composition.ts),
 * so Case A must return its contributed directory here — the existing
 * integration-test helper hardcodes `undefined` and cannot express it.
 */
function makeHarness(cwd: string, flags: Readonly<Record<string, string>>): Harness {
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

/** Normalise a path for the cross-platform contain check (this repo runs on Windows). */
function norm(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase();
}

/** Poll a real-timer-bounded condition (session_start arming settles synchronously through the fire, but the fs reads it awaits are genuinely async). */
async function waitFor(cond: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 400; i++) {
    if (cond()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timeout waiting for ${label}`);
}

/** The single root list the watcher was armed over, or a loud failure naming the unmet precondition. */
function armedRoots(watcher: RootsRecordingFileWatcher): readonly string[] {
  if (watcher.watchCalls.length === 0) {
    throw new Error(
      "precondition unmet: session_start armed no watcher (watch() was never called)",
    );
  }
  if (watcher.watchCalls.length > 1) {
    throw new Error(
      `precondition unmet: expected exactly one watch() arming, saw ${watcher.watchCalls.length}`,
    );
  }
  // Guarded above (length is exactly 1), but `noUncheckedIndexedAccess` widens
  // the element type, so the loud fallback keeps the return non-optional.
  const only = watcher.watchCalls[0];
  if (only === undefined) {
    throw new Error("precondition unmet: recorded watch() root list was undefined");
  }
  return only;
}

describe("Bug 0310 — armed watch set is the discovery-root union, not the found-file dirnames", () => {
  let workspace: string;
  let fakeWatcher: RootsRecordingFileWatcher;
  let wiring: ExtensionInstanceWiring | undefined;

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  /** Boot the shipped composition with the roots-recording watcher and the given flags. */
  async function boot(flags: Readonly<Record<string, string>>): Promise<void> {
    fakeWatcher = new RootsRecordingFileWatcher();
    wiring = undefined;
    const harness = makeHarness(workspace, flags);
    const deps: ThetaExtensionDeps = {
      fixtures: [],
      composeInstance: async (pi, ctx) => {
        wiring = await composeExtensionInstance(pi, ctx, {
          fileWatcher: fakeWatcher,
          clock: new FakeClock(),
        });
        return wiring;
      },
    };
    createThetaExtension(deps)(harness.pi);
    await harness.fireSessionStart();
    await waitFor(() => fakeWatcher.watchCalls.length > 0, "watcher to arm");
  }

  it("Case A: an EMPTY <ws>/.pi/theta is armed even when the only theta comes via --theta", async () => {
    // Empty scaffolded project root present; the sole theta is contributed by a
    // separate `--theta` directory. Today `activeRoots` is the dirname of the
    // found file (`<ws>/more`) only, so the present-but-empty `<ws>/.pi/theta`
    // is dropped from the watch set (bug 0310 §Reproduction step 2 observed
    // `[<ws>/more, <ws>/.pi/settings.json, ~/.pi/agent/settings.json]`).
    workspace = mkdtempSync(join(tmpdir(), "b0310-caseA-"));
    const projectRoot = join(workspace, ".pi", "theta");
    mkdirSync(projectRoot, { recursive: true });
    const thetaDir = join(workspace, "more");
    mkdirSync(thetaDir, { recursive: true });
    writeFileSync(join(thetaDir, "hello.theta"), HELLO_THETA, "utf8");

    await boot({ theta: thetaDir });

    // Precondition: the contributed theta was actually discovered (else the red
    // would be for an empty-discovery reason, not the root-union defect).
    expect(wiring?.registry.get("hello")).toBeDefined();

    const armed = armedRoots(fakeWatcher).map(norm);
    // §Fix constraint 1: the resolved root union includes `<ws>/.pi/theta`
    // (present at scan time, an active root per discovery-sources.md), so it
    // must be armed regardless of whether it currently holds a `.theta`.
    expect(armed).toContain(norm(projectRoot));
  });

  it("Case B: an EMPTY <ws>/.pi/theta is armed even when zero thetas exist anywhere", async () => {
    // No thetas anywhere, no `--theta` flag; only the empty scaffolded project
    // root exists. Today the watch set is the two settings files only (bug 0310
    // §Reproduction step 3 variant).
    workspace = mkdtempSync(join(tmpdir(), "b0310-caseB-"));
    const projectRoot = join(workspace, ".pi", "theta");
    mkdirSync(projectRoot, { recursive: true });

    await boot({});

    // Precondition: a zero-theta session composes with an empty registry.
    expect(wiring?.registry.get("hello")).toBeUndefined();

    const armed = armedRoots(fakeWatcher).map(norm);
    // §Fix constraint 1: the present-but-empty project root is a member of the
    // resolved root union and owes coverage — the first `.theta` created there
    // must produce a watcher event and the structural-change note.
    expect(armed).toContain(norm(projectRoot));
  });
});
