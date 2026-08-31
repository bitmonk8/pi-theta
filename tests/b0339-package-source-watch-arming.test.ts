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
import { RELOAD_DEBOUNCE_WINDOW_MS } from "../src/extension/reload-debounce";
import type {
  FileWatcher,
  FileWatchEvent,
  OnWatchTerminate,
  Unsubscribe,
} from "../src/seams/file-watcher";
import { FakeClock } from "./helpers/fake-clock";

// Bug 0339 — witness: the package-discovery source (the fifth active-root
// source in discovery-sources.md) must be armed for watching when its
// contributing directory is PRESENT-BUT-EMPTY, on the same terms bug 0310
// armed the walk's four sources. An installed package that ships an empty
// conventional `theta/` directory — or a `pi.theta` glob resolving to an empty
// directory — contributes no found file, so the directory enters neither the
// file-derived `activeRoots` (`dirname(theta.path)` of a found `.theta`) nor
// the walk's four-source `roots` union (the walk defers the package source),
// and `discoverPackageThetas`'s `PackageDiscoveryResult` (`thetas` +
// `diagnostics` only) carries no field from which the composition could arm it.
// The first `.theta` created in that directory then fires no watcher event and
// never registers until an unrelated edit or `/reload`.
//
// The §Fix (SETTLED): `PackageDiscoveryResult` exposes `roots: readonly
// string[]` (the present contributing dirs its walk visited), and
// `runComposePass` (`production-composition.ts`) folds `packageWalk.roots`
// into the same additive `discoveryWatchRoots` `Set` union bug 0310 built —
// forward-slash-canonicalised — while `activeRoots` (INV-1) stays
// byte-unchanged. Constraints keyed in each case below: (1) `activeRoots`
// containment is not widened; (2) the union stays a clean additive `Set` so
// bug 0312's closure extension is not foreclosed; (3) re-arming on a later
// union change stays out of scope; (4) a roots-recording witness asserts the
// present-but-empty package dir is armed plus the file-bearing control.
//
// The shipped-version token the fix lands under is written `0.321.0` throughout
// (lane placeholder).
//
// Cases A–G mirror the harness of `tests/b0310-watch-roots-root-union.test.ts`
// EXACTLY (its `RootsRecordingFileWatcher`, `makeHarness`, `boot`, `norm`,
// `waitFor`, `armedRoots`), booting the shipped composition through
// `createThetaExtension` → `composeExtensionInstance` with the roots-recording
// `FileWatcher` fake and a `FakeClock`. `PiFileSystem(ctx.cwd)` pins `fs.cwd()`
// to the tmp workspace, so `<ws>/node_modules/<pkg>/` is a project package root
// whose `theta/` (or `pi.theta`-globbed) directory is a contributing directory.
//
// Case H drives the end-to-end reload and needs a watcher that can FIRE events
// under CURRENTLY-armed roots ONLY; the roots-recording fake cannot emit, and
// the shipped `FakeFileWatcher` ignores roots entirely (delivering regardless
// of path, which would green the red spuriously). Its own describe block below
// uses a `RecursiveRootFileWatcher` modelling chokidar recursive-root scoping —
// the same seam shape `tests/b0312-out-of-root-thetalib-watch-closure.test.ts`
// relies on — so an event under an UNARMED package dir is a genuine no-op.

const HELLO_THETA = ["---", "mode: prompt", "---", "@`hi`", ""].join("\n");

/** A `package.json` body: valid manifest, optional `pi.theta` descriptor. */
function packageJson(name: string, piTheta?: readonly string[]): string {
  const manifest: Record<string, unknown> = { name, version: "0.0.0" };
  if (piTheta !== undefined) {
    manifest.pi = { theta: piTheta };
  }
  return `${JSON.stringify(manifest)}\n`;
}

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

/**
 * A `FileWatcher` seam double that models real chokidar recursive-root scoping
 * (the mechanism bug 0339's consequence chain rides): `emit(event)` reaches the
 * currently-armed handler ONLY IF `event.path` sits under a currently-armed
 * root, so an event under an UNARMED package directory is a genuine no-op. The
 * roots-recording fake above returns a no-op unsubscribe and cannot emit; the
 * shipped `FakeFileWatcher` delivers to its handler regardless of path — neither
 * models the scoping case H turns on. Mirrors b0312's `RecursiveRootFileWatcher`.
 */
class RecursiveRootFileWatcher implements FileWatcher {
  readonly watchCalls: string[][] = [];
  #handler: ((event: FileWatchEvent) => void) | undefined;
  #roots: readonly string[] = [];

  watch(
    roots: readonly string[],
    handler: (event: FileWatchEvent) => void,
    _onTerminate?: OnWatchTerminate,
  ): Unsubscribe {
    this.watchCalls.push([...roots]);
    this.#handler = handler;
    this.#roots = [...roots];
    return () => {
      // Relinquish only this arming (guarded on handler identity) so a re-arm
      // that installs a fresh handler first is not cleared by a stale unsub.
      if (this.#handler === handler) {
        this.#handler = undefined;
        this.#roots = [];
      }
    };
  }

  /** The roots the watcher is armed over right now (the last `watch()` call's roots). */
  get currentRoots(): readonly string[] {
    return this.#roots;
  }

  /** Deliver an event, honouring recursive-root scoping (an out-of-root path is dropped). */
  emit(event: FileWatchEvent): void {
    if (this.#handler === undefined) {
      return;
    }
    if (this.#underArmedRoot(event.path)) {
      this.#handler(event);
    }
  }

  #underArmedRoot(path: string): boolean {
    const p = norm(path);
    return this.#roots.some((root) => {
      const r = norm(root);
      return p === r || p.startsWith(r.endsWith("/") ? r : `${r}/`);
    });
  }
}

interface Harness {
  readonly pi: ExtensionAPI;
  fireSessionStart(): Promise<void>;
}

/** Mirrors b0310's `makeHarness`: a minimal `ExtensionAPI` recording commands
 *  and event subscriptions; no `--theta` flag is needed here (package roots reach
 *  discovery through `fs.cwd()`, not a flag), so `getFlag` answers `undefined`. */
function makeHarness(cwd: string): Harness {
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
    getFlag: (): string | undefined => undefined,
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

/** Poll a real-timer-bounded condition; throw loudly on timeout naming the unmet
 *  precondition (b0310's idiom — never an early return or skip). */
async function waitFor(cond: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 400; i++) {
    if (cond()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timeout waiting for ${label}`);
}

/** Best-effort bounded poll of the observable, then RETURN (never throw) so the
 *  following `expect` is the witness. Used in case H where the reload the fix
 *  would run is a no-op today: pre-fix the observable never moves and the poll
 *  runs to its bound, so the `expect` reds; post-fix the poll exits as soon as
 *  the reload lands. Event-driven, not a bare sleep. */
async function settle(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (cond()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
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

describe("Bug 0339 — the package source's present-but-empty contributing directory is armed for watching", () => {
  let workspace: string;
  let fakeWatcher: RootsRecordingFileWatcher;
  let wiring: ExtensionInstanceWiring | undefined;

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  /** Boot the shipped composition with the roots-recording watcher + fake clock. */
  async function boot(): Promise<void> {
    fakeWatcher = new RootsRecordingFileWatcher();
    wiring = undefined;
    const harness = makeHarness(workspace);
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

  it("Case A: a present-but-EMPTY conventional package theta/ directory is armed", async () => {
    // §Fix constraint 4 witness (RED at 0.321.0, GREEN after). A project package
    // ships a valid `package.json` (no `pi.theta`) and an EMPTY conventional
    // `theta/` directory — a contributing directory present per
    // discovery-sources.md, with no `.theta` yet. It yields no found file, so
    // it is in neither `activeRoots` nor `walk.roots` and is unarmed today. The
    // empty `<ws>/.pi/theta` (a non-package active root) is the post-0310
    // control: it IS armed, proving arming itself works.
    workspace = mkdtempSync(join(tmpdir(), "b0339-caseA-"));
    mkdirSync(join(workspace, ".pi", "theta"), { recursive: true });
    const pkgThetaDir = join(workspace, "node_modules", "pkg-x", "theta");
    mkdirSync(pkgThetaDir, { recursive: true });
    writeFileSync(
      join(workspace, "node_modules", "pkg-x", "package.json"),
      packageJson("pkg-x"),
      "utf8",
    );

    await boot();

    // Precondition (fail loudly): the session composed. The empty package dir
    // contributes no theta, so a red here is the arming defect, not a compose
    // failure or an empty-discovery artifact.
    expect(wiring).toBeDefined();

    const armed = armedRoots(fakeWatcher).map(norm);
    expect(armed).toContain(norm(pkgThetaDir));
  });

  it("Case B: a pi.theta glob resolving to a present-but-EMPTY directory is armed", async () => {
    // §Fix constraint 4 witness (RED at 0.321.0, GREEN after). The manifest's
    // `pi.theta` glob `extra` resolves to a present-but-EMPTY `<pkg>/extra`
    // directory — a contributing directory reached through a `pi.theta` glob
    // (discovery-sources.md). It yields no found file and is unarmed today, on
    // the same basis as Case A's conventional fallback.
    workspace = mkdtempSync(join(tmpdir(), "b0339-caseB-"));
    mkdirSync(join(workspace, ".pi", "theta"), { recursive: true });
    const globDir = join(workspace, "node_modules", "pkg-y", "extra");
    mkdirSync(globDir, { recursive: true });
    writeFileSync(
      join(workspace, "node_modules", "pkg-y", "package.json"),
      packageJson("pkg-y", ["extra"]),
      "utf8",
    );

    await boot();

    expect(wiring).toBeDefined();

    const armed = armedRoots(fakeWatcher).map(norm);
    expect(armed).toContain(norm(globDir));
  });

  it("Case C (control): a file-bearing package theta/ directory is armed and its theta registers", async () => {
    // GREEN fence at 0.321.0 and after. A package directory holding a discovered
    // `.theta` is armed TODAY via `activeRoots` (`dirname(theta.path)`); the fix
    // must leave that coverage intact. The gap bug 0339 closes is confined to
    // the present-but-empty case.
    workspace = mkdtempSync(join(tmpdir(), "b0339-caseC-"));
    mkdirSync(join(workspace, ".pi", "theta"), { recursive: true });
    const pkgThetaDir = join(workspace, "node_modules", "pkg-z", "theta");
    mkdirSync(pkgThetaDir, { recursive: true });
    writeFileSync(
      join(workspace, "node_modules", "pkg-z", "package.json"),
      packageJson("pkg-z"),
      "utf8",
    );
    writeFileSync(join(pkgThetaDir, "pkgtheta.theta"), HELLO_THETA, "utf8");

    await boot();

    // The file-bearing package theta registered (fences the discovery path).
    expect(wiring?.registry.get("pkgtheta")).toBeDefined();

    const armed = armedRoots(fakeWatcher).map(norm);
    expect(armed).toContain(norm(pkgThetaDir));
  });

  it("Case D: an absent (nonexistent) contributing directory is NOT in the armed set", async () => {
    // GREEN fence at 0.321.0 and after. A package with a valid `package.json`, no
    // `theta/` directory, and no `pi.theta` contributes no PRESENT directory.
    // The membership condition is PRESENCE (§Fix step 1), so the nonexistent
    // `<pkg>/theta` must stay out of the armed set both before and after — the
    // fix arms present dirs, not speculative ones.
    workspace = mkdtempSync(join(tmpdir(), "b0339-caseD-"));
    mkdirSync(join(workspace, ".pi", "theta"), { recursive: true });
    mkdirSync(join(workspace, "node_modules", "pkg-d"), { recursive: true });
    writeFileSync(
      join(workspace, "node_modules", "pkg-d", "package.json"),
      packageJson("pkg-d"),
      "utf8",
    );
    const absentDir = join(workspace, "node_modules", "pkg-d", "theta");

    await boot();

    expect(wiring).toBeDefined();

    const armed = armedRoots(fakeWatcher).map(norm);
    expect(armed).not.toContain(norm(absentDir));
  });

  it("Case E: a dir reachable via both activeRoots and the package walk is ONE armed member", async () => {
    // GREEN fence at 0.321.0 and after (§Fix constraint 2: a clean additive `Set`
    // union). A file-bearing package `theta/` sits in `activeRoots` today; the
    // fix also surfaces it as a `packageWalk.roots` member. The two bases must
    // canonicalise to ONE physical directory, so the count of its occurrences in
    // the recorded roots stays exactly 1 — today (from `activeRoots` alone) and
    // after the fold (deduped by the `Set`). No double-arm.
    workspace = mkdtempSync(join(tmpdir(), "b0339-caseE-"));
    mkdirSync(join(workspace, ".pi", "theta"), { recursive: true });
    const pkgThetaDir = join(workspace, "node_modules", "pkg-e", "theta");
    mkdirSync(pkgThetaDir, { recursive: true });
    writeFileSync(
      join(workspace, "node_modules", "pkg-e", "package.json"),
      packageJson("pkg-e"),
      "utf8",
    );
    writeFileSync(join(pkgThetaDir, "dup.theta"), HELLO_THETA, "utf8");

    await boot();

    expect(wiring?.registry.get("dup")).toBeDefined();

    const armed = armedRoots(fakeWatcher).map(norm);
    const occurrences = armed.filter((r) => r === norm(pkgThetaDir)).length;
    expect(occurrences).toBe(1);
  });

  it("Case F (INV-1 fence): the empty package theta/ dir is NOT added to activeRoots", async () => {
    // GREEN fence at 0.321.0 and after (§Fix constraint 1: `activeRoots`
    // containment is not widened). The empty package directory joins
    // `watchRoots` only; `activeRoots` — the INV-1 invocation-containment basis
    // — stays byte-unchanged and must NOT gain the empty package dir. A file
    // bearing package dir would already be in `activeRoots` via its theta's
    // dirname; the empty one must not be.
    workspace = mkdtempSync(join(tmpdir(), "b0339-caseF-"));
    mkdirSync(join(workspace, ".pi", "theta"), { recursive: true });
    const emptyPkgThetaDir = join(workspace, "node_modules", "pkg-f", "theta");
    mkdirSync(emptyPkgThetaDir, { recursive: true });
    writeFileSync(
      join(workspace, "node_modules", "pkg-f", "package.json"),
      packageJson("pkg-f"),
      "utf8",
    );

    await boot();

    expect(wiring).toBeDefined();

    // Loud precondition: the `?? []` fallback below would make the
    // non-containment check pass vacuously if `activeRoots` forwarding were
    // ever dropped from the wiring, so assert its presence first — absence
    // must fail loudly, not silently green, matching this file's
    // fail-loudly convention.
    expect(wiring?.activeRoots).toBeDefined();

    const active = (wiring?.activeRoots ?? []).map(norm);
    expect(active).not.toContain(norm(emptyPkgThetaDir));
  });

  it("Case G: the package fold is additive over a 0312-shaped composition — package dir, closure dir, and walk root all armed", async () => {
    // Additive-union witness (§Fix constraint 2). Three armed members coexist
    // with no displacement:
    //   - the empty package `theta/` dir — RED at 0.321.0, GREEN after (bug 0339);
    //   - the out-of-root `.thetalib` closure dir — GREEN in this tree (bug 0312
    //     already folds `importClosureDirs` into `watchRoots`);
    //   - the file-bearing project walk root `<ws>/.pi/theta` — GREEN always.
    // The package-dir assertion is first, so the correct-reason red is bug
    // 0339's own. The fold sits on the same additive `Set` base 0312 extends, so
    // adding the package dir displaces neither the closure dir nor the walk root.
    workspace = mkdtempSync(join(tmpdir(), "b0339-caseG-"));
    const projectThetaDir = join(workspace, ".pi", "theta");
    const libDir = join(workspace, ".pi", "lib");
    mkdirSync(projectThetaDir, { recursive: true });
    mkdirSync(libDir, { recursive: true });
    writeFileSync(join(libDir, "helpers.thetalib"), "fn shout(s: string): string { s }\n", "utf8");
    writeFileSync(
      join(projectThetaDir, "uses.theta"),
      '---\nmode: prompt\n---\nimport { shout } from "../lib/helpers.thetalib"\n@`hi ${shout("x")}`\n',
      "utf8",
    );
    const pkgThetaDir = join(workspace, "node_modules", "pkg-g", "theta");
    mkdirSync(pkgThetaDir, { recursive: true });
    writeFileSync(
      join(workspace, "node_modules", "pkg-g", "package.json"),
      packageJson("pkg-g"),
      "utf8",
    );

    await boot();

    // Precondition (fail loudly): the out-of-root import resolved and the
    // importer registered, so a red below is the arming defect, not a broken
    // import graph.
    expect(wiring?.registry.get("uses")).toBeDefined();

    const armed = armedRoots(fakeWatcher).map(norm);
    // Bug 0339 witness first (RED at 0.321.0).
    expect(armed).toContain(norm(pkgThetaDir));
    // No displacement: 0312's closure dir and the walk root remain armed.
    expect(armed).toContain(norm(libDir));
    expect(armed).toContain(norm(projectThetaDir));
  });
});

describe("Bug 0339 — end-to-end: the first .theta in an armed empty package dir registers on reload", () => {
  let workspace: string;
  let fakeWatcher: RecursiveRootFileWatcher;
  let fakeClock: FakeClock;
  let wiring: ExtensionInstanceWiring | undefined;

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  /** Boot the shipped composition over the recursive-root watcher + fake clock. */
  async function boot(): Promise<void> {
    fakeWatcher = new RecursiveRootFileWatcher();
    fakeClock = new FakeClock();
    wiring = undefined;
    const harness = makeHarness(workspace);
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
    await harness.fireSessionStart();
    await waitFor(() => fakeWatcher.watchCalls.length > 0, "session_start to arm the watcher");
  }

  it("Case H: a .theta created in a present-but-empty package dir fires a reload and registers", async () => {
    // End-to-end consequence-chain witness (RED at 0.321.0, GREEN after). The
    // package ships an EMPTY `theta/` at boot. A `.theta` created there must fire
    // a watcher event that crosses the reload debounce and registers the new
    // theta — the designed structural-change observable (§Fix step 1 arms the
    // dir; §Fix constraint 3 leaves this per-pass, the debounced reload being
    // the recovery). The assertion is the ARRIVAL of the registration, not the
    // structural-note payload wording (bug 0311's subject).
    //
    // Correct-reason red: the `RecursiveRootFileWatcher` drops an event whose
    // path is not under a currently-armed root. Pre-fix the empty package dir is
    // unarmed, so the create event is a no-op — no reload, no registration.
    // Post-fix the dir is armed, the event delivers, and the debounced reload
    // rediscovers and registers the new theta.
    workspace = mkdtempSync(join(tmpdir(), "b0339-caseH-"));
    mkdirSync(join(workspace, ".pi", "theta"), { recursive: true });
    const pkgThetaDir = join(workspace, "node_modules", "pkg-h", "theta");
    mkdirSync(pkgThetaDir, { recursive: true });
    writeFileSync(
      join(workspace, "node_modules", "pkg-h", "package.json"),
      packageJson("pkg-h"),
      "utf8",
    );

    await boot();

    // Precondition (fail loudly): boot composed and the not-yet-created theta is
    // absent, so the green after the fix is the reload registering it, not a
    // pre-existing registration.
    expect(wiring).toBeDefined();
    expect(wiring?.registry.get("fresh")).toBeUndefined();

    // Create the first `.theta` in the package dir, then fire its create event
    // and cross the debounce window.
    const freshPath = join(pkgThetaDir, "fresh.theta");
    writeFileSync(freshPath, HELLO_THETA, "utf8");
    fakeWatcher.emit({ kind: "add", path: freshPath });
    fakeClock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await settle(() => wiring?.registry.get("fresh") !== undefined);

    expect(wiring?.registry.get("fresh")).toBeDefined();
  });
});
