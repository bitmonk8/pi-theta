import { mkdtempSync, mkdirSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
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
import {
  installHotReload,
  type HotReloadHandle,
} from "../src/extension/hot-reload";
import { ThetaRegistry, type ParsedTheta } from "../src/extension/reload-wiring";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type {
  FileWatcher,
  FileWatchEvent,
  OnWatchTerminate,
  Unsubscribe,
} from "../src/seams/file-watcher";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { FakeClock } from "./helpers/fake-clock";

// Bug 0312 — a `.thetalib` imported via a parent-relative path
// (`../lib/x.thetalib`, the second example imports.md:19 blesses) resolves one
// level ABOVE the importing theta's discovery root, so it sits outside every
// armed watch root. Editing it fires no chokidar event, so the importer keeps
// dispatching the stale materialised import — silently in prompt mode, and as a
// tamper-shaped `subagent-callable-hash-mismatch` in subagent mode (the
// load-time closure hash was frozen over the OLD lib bytes). registration-
// steps.md:26 makes a `.thetalib` edit a first-class hot-reload input ("On a
// chokidar event for an existing theta or `.thetalib` file … re-parses just the
// changed file plus every transitive `.thetalib` importer reached through the
// import graph"), and nothing scopes that promise to libs that happen to sit
// under a discovery root — but the shipped watch set is the discovery-root union
// plus the two settings files only (`watchRoots` in `runComposePass`,
// src/extension/production-composition.ts), never the import closure.
//
// Parent adjudication (the doc's §Fix left the disposition undecided; it is now
// decided) — Option 1, WATCH THE RESOLVED IMPORT CLOSURE. The union watcher's
// arming set gains each transitively-resolved `.thetalib`'s parent directory.
// The ONE watcher (registration-steps.md:22, the single-armed-watcher
// invariant) is RE-ARMED when a reload pass changes the closure — teardown the
// old subscription, arm the new roots, preserving the shared bug-0311 debouncer
// across re-arms — and `armWatcherWithTerminalRecovery`
// (src/extension/watcher-recovery.ts) is reused as-is for the re-armed watcher.
// A closure directory already nested under an armed root is EXCLUDED (chokidar
// watches recursively), so an in-root lib causes no re-arm churn.
//
// Observables (offline, deterministic — no live model): the armed `roots`
// argument to `watch()` (a re-arm is a SECOND `watchCalls` entry), the
// `theta-system-note` channel (`pi.sendMessage`), and
// `wiring.registry.get(name)?.rootClosureHash?.hash` — the load-captured
// transitive-closure hash (`ParsedTheta.rootClosureHash`,
// src/extension/reload-wiring.ts; bug 0328) that folds the imported lib bytes
// in, so a rebuild over fresh lib bytes moves it. The intended fix surfaces
// `checkThetaImports`'s already-walked resolved-lib set
// (src/extension/import-static-checks.ts) into the compose pass so
// `installHotReload` (src/extension/hot-reload.ts) can union the closure dirs
// into its watch roots and re-arm on change.
//
// Harness: mirrors tests/b0311-structural-note-derived-from-paths.test.ts — the
// SHIPPED composition (`composeExtensionInstance`) through the real factory
// (`createThetaExtension`), a real temp-dir workspace under `.pi/theta`, a FAKE
// `Clock` (FakeClock), and a TEST-LOCAL `FileWatcher` that models real chokidar
// recursive-root scoping (see `RecursiveRootFileWatcher` below) so an unwatched
// lib edit is a genuine no-op and the reds are correct-reason. The shipped
// FakeFileWatcher records no roots and does not filter; b0310's recorder cannot
// emit or re-arm — neither models the scoping this bug turns on.
//
// Every `0.315.0` is the literal placeholder the fix's shipped version fills.

/** Normalise a path for the cross-platform containment check (this repo runs on Windows). */
function norm(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase();
}

/**
 * A `FileWatcher` seam double that models real chokidar recursive-root scoping,
 * which the shipped `FakeFileWatcher` (no root filter, no root record) and
 * b0310's `RootsRecordingFileWatcher` (records roots but returns a no-op unsub
 * and cannot emit) both omit:
 *
 *  - it records EVERY `watch(roots, …)` arming's roots (`watchCalls`), so a
 *    re-arm — teardown-then-fresh-`watch()` — shows a SECOND entry, the
 *    observable Option 1's single-watcher re-arm is read through;
 *  - `emit(event)` delivers to the CURRENTLY-armed handler ONLY IF `event.path`
 *    sits under one of the CURRENTLY-armed roots (recursive containment,
 *    path-normalised), so an edit outside every armed root is a genuine no-op —
 *    the mechanism bug 0312 §Reproduction step 2 rides;
 *  - the returned `Unsubscribe` is idempotent and relinquishes only its OWN
 *    arming (guarded on handler identity), so a re-arm that installs the fresh
 *    handler before the old unsub runs does not strand the new subscription
 *    (mirrors FakeFileWatcher's active-flag teardown guard).
 */
class RecursiveRootFileWatcher implements FileWatcher {
  readonly watchCalls: string[][] = [];
  #handler: ((event: FileWatchEvent) => void) | undefined;
  #onTerminate: OnWatchTerminate | undefined;
  #roots: readonly string[] = [];
  // Bug 0312 (F1/F2 blocker cells): count of armings that have not yet
  // relinquished their subscription. A re-arm that tears down its own prior
  // arming first nets to 1; a re-arm onto an ALREADY-torn-down watcher (the F1
  // strand) leaves a live subscription nothing will ever tear down. Additive —
  // cells 1–5 never read it.
  #live = 0;

  watch(
    roots: readonly string[],
    handler: (event: FileWatchEvent) => void,
    onTerminate?: OnWatchTerminate,
  ): Unsubscribe {
    this.watchCalls.push([...roots]);
    this.#handler = handler;
    // Bug 0312 (F2 cell): retain the currently-armed terminal callback so a test
    // can drive the PIC-55 stopped-delivering signal (`terminate()` below).
    // Cells 1–5 ignore it, matching the prior `_onTerminate` no-op.
    this.#onTerminate = onTerminate;
    this.#roots = [...roots];
    this.#live += 1;
    return () => {
      // Relinquish only if this arming is still installed — a re-arm that armed
      // the fresh handler first must not have the stale unsub clear it.
      if (this.#handler === handler) {
        this.#handler = undefined;
        this.#onTerminate = undefined;
        this.#roots = [];
        this.#live -= 1;
      }
    };
  }

  /** The roots the watcher is armed over right now (the last `watch()` call's roots). */
  get currentRoots(): readonly string[] {
    return this.#roots;
  }

  /** Bug 0312 (F1/F2 cells): armings that have not relinquished — the strand count. */
  get liveSubscriptions(): number {
    return this.#live;
  }

  /** Bug 0312 (F2 cell): drive the PIC-55 terminal (stopped-delivering) signal
   *  onto the currently-armed watcher. Fails loudly if nothing is armed (an
   *  unmet precondition names itself — AGENTS.md — never a silent no-op). */
  terminate(): void {
    const onTerminate = this.#onTerminate;
    if (onTerminate === undefined) {
      throw new Error("terminate() called with no armed watcher onTerminate");
    }
    onTerminate({ roots: this.#roots });
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

/** A recorded `pi.sendMessage` call (the `theta-system-note` channel). */
interface RecordedNote {
  readonly customType: string;
  readonly content: string;
  readonly display: boolean;
  readonly details: {
    readonly diagnostics?: readonly Diagnostic[];
    readonly structural?: {
      readonly added: readonly string[];
      readonly removed: readonly string[];
    };
  };
  readonly triggerTurn: unknown;
}

interface Harness {
  readonly pi: ExtensionAPI;
  readonly notes: RecordedNote[];
  /** Count of `pi.registerCommand` calls — a rebuild-settled signal that does
   *  not require the registered SET to change (a no-op-registry reload still
   *  re-registers every survivor, so the count advances). */
  registrationCount(): number;
  fireSessionStart(): Promise<void>;
}

function makeHarness(cwd: string): Harness {
  const commands = new Map<string, unknown>();
  const notes: RecordedNote[] = [];
  const subscriptions = new Map<
    string,
    ((event: unknown, ctx: ExtensionContext) => unknown)[]
  >();
  let registrations = 0;

  const pi = {
    registerFlag: (): void => {},
    registerMessageRenderer: (): void => {},
    registerCommand: (name: string, options: unknown): void => {
      registrations += 1;
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
    notes,
    registrationCount: () => registrations,
    fireSessionStart: () => fire("session_start"),
  };
}

/** Poll a real-timer-bounded condition; throw loudly on timeout naming the
 *  unmet precondition (the b0311 loud-fail idiom — never an early return/skip).
 *  Used where a rebuild fires in BOTH tree states (an IN-ROOT edit), so the
 *  settle itself is not the witness. */
async function waitFor(cond: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 400; i++) {
    if (cond()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timeout waiting for ${label}`);
}

/** Best-effort bounded poll of the observable, then RETURN (never throw) so the
 *  following `expect` is the witness. Used where the reload the fix would run is
 *  a no-op today (an OUT-OF-ROOT edit): pre-fix the observable never moves and
 *  the poll runs to its bound, so the `expect` reds on the stale value; post-fix
 *  the poll exits as soon as the rebuild lands. Event-driven, not a bare sleep. */
async function settle(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (cond()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** The structural-change notes recorded since `from` (content-keyed). */
function structuralNotesSince(harness: Harness, from: number): RecordedNote[] {
  return harness.notes
    .slice(from)
    .filter((note) => note.content.startsWith("theta watcher:"));
}

/**
 * A direct `installHotReload` rig for the F1/F2 BLOCKER cells (bug 0312 round-1
 * review). Cells 1–5 drive the SHIPPED composition end-to-end; the two blockers
 * are re-arm-branch guards that only fire when a teardown or a PIC-55 terminal
 * signal lands DURING an in-flight, closure-changing rebuild — an interleave the
 * full composition cannot schedule deterministically. This rig gives that
 * timing control by parking `rediscover` on a deferred and holding the real
 * `HotReloadHandle`, over the SAME `RecursiveRootFileWatcher` and `FakeClock`
 * the other cells use. `currentWatchRoots` always returns `rootsB` ≠ the armed
 * `rootsA`, so the re-arm branch's `sameRootSet` check is false and it WOULD
 * re-arm unless a guard (F1 `!tornDown`, F2 `!terminated`) blocks it.
 */
interface DirectRig {
  readonly handle: HotReloadHandle;
  readonly watcher: RecursiveRootFileWatcher;
  readonly clock: FakeClock;
  readonly notes: string[];
  rediscoverEntered(): boolean;
  releaseRediscover(): void;
}

function installDirectRig(
  rootsA: readonly string[],
  rootsB: readonly string[],
): DirectRig {
  const watcher = new RecursiveRootFileWatcher();
  const clock = new FakeClock();
  const notes: string[] = [];
  const channel: SystemNoteChannelDeps = {
    pi: {
      sendMessage: (message: { content: string }): void => {
        notes.push(message.content);
      },
    } as unknown as SystemNoteChannelDeps["pi"],
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const registry = new ThetaRegistry([]);
  const NOOP_RUN = async (): Promise<void> => {};
  const rebuilt: readonly ParsedTheta[] = [
    {
      slashName: "importer",
      frontmatter: { mode: "prompt" as const },
      body: { statements: [], tail: null },
      run: NOOP_RUN,
    } as unknown as ParsedTheta,
  ];
  let entered = false;
  let release: (() => void) | undefined;
  const handle = installHotReload({
    watcher,
    clock,
    roots: rootsA,
    registry,
    channel,
    rediscover: async (): Promise<readonly ParsedTheta[]> => {
      entered = true;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return rebuilt;
    },
    currentWatchRoots: () => rootsB,
    reRegister: (): void => {},
    initialNames: [],
    probeRuntime: (): void => {},
  });
  return {
    handle,
    watcher,
    clock,
    notes,
    rediscoverEntered: () => entered,
    releaseRediscover: (): void => {
      if (release === undefined) {
        // No silent skipping (AGENTS.md): an unparked rebuild is a rig defect.
        throw new Error("rediscover was never entered/parked");
      }
      release();
    },
  };
}

describe("Bug 0312 — the armed watch set must cover the resolved out-of-root `.thetalib` import closure", () => {
  let workspace: string;
  let fakeWatcher: RecursiveRootFileWatcher;
  let fakeClock: FakeClock;
  let harness: Harness;
  let wiring: ExtensionInstanceWiring | undefined;

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  /** Boot the shipped composition over the recursive-root watcher + fake clock. */
  async function boot(): Promise<void> {
    fakeWatcher = new RecursiveRootFileWatcher();
    fakeClock = new FakeClock();
    harness = makeHarness(workspace);
    wiring = undefined;
    const deps: ThetaExtensionDeps = {
      fixtures: [],
      // Forward the factory's PIC-69 own-registration ledger into the
      // composition root exactly as the shipped factory does, so a theta a
      // reload pass drops and re-adds does not self-collide against its own
      // surviving `pi.getCommands()` entry (registration-steps.md:16).
      composeInstance: async (pi, ctx, ownRegisteredNames) => {
        wiring = await composeExtensionInstance(
          pi,
          ctx,
          { fileWatcher: fakeWatcher, clock: fakeClock },
          undefined,
          ownRegisteredNames,
        );
        return wiring;
      },
    };
    createThetaExtension(deps)(harness.pi);
    await harness.fireSessionStart();
    await waitFor(() => fakeWatcher.watchCalls.length > 0, "session_start to arm the watcher");
  }

  // ===========================================================================
  // Cell 1 — §Reproduction: the out-of-root lib dir is not armed (PRIMARY red),
  // and an edit to it is invisible (freshness, green only once armed).
  // ===========================================================================
  it("(1): the resolved `../lib/*.thetalib` parent directory is in the armed watch roots, and editing the lib rebuilds the importer", async () => {
    // The importer `uses.theta` (in the `.pi/theta` discovery root) imports
    // `../lib/helpers.thetalib`, which resolves to `<ws>/.pi/lib/helpers.thetalib`
    // — one level above that root (imports.md:19's second, blessed form).
    workspace = mkdtempSync(join(tmpdir(), "b0312-cell1-"));
    const thetaDir = join(workspace, ".pi", "theta");
    const libDir = join(workspace, ".pi", "lib");
    mkdirSync(thetaDir, { recursive: true });
    mkdirSync(libDir, { recursive: true });
    const libPath = join(libDir, "helpers.thetalib");
    writeFileSync(libPath, "fn shout(s: string): string { s }\n", "utf8");
    writeFileSync(
      join(thetaDir, "uses.theta"),
      '---\nmode: prompt\n---\nimport { shout } from "../lib/helpers.thetalib"\n@`hi ${shout("x")}`\n',
      "utf8",
    );

    await boot();

    // Precondition: the `../` import is legal and registers (else the red would
    // be an empty-discovery artifact, not the watch-scope defect).
    expect(wiring?.registry.get("uses")).toBeDefined();
    // Precondition: boot arms exactly once — the fix's initial arm already
    // carries the closure dirs; a re-arm at boot would confound the count.
    expect(fakeWatcher.watchCalls.length).toBe(1);

    // PRIMARY (RED at 0.315.0, GREEN after): the resolved lib's parent directory
    // is in the armed roots. Today `watchRoots` is the discovery-root union plus
    // the two settings files, so `<ws>/.pi/lib` is absent.
    const armed = fakeWatcher.currentRoots.map(norm);
    expect(armed).toContain(norm(libDir));

    // END-TO-END freshness (correct-reason via the root-scoping watcher). The
    // closure hash covers the imported lib bytes (ParsedTheta.rootClosureHash,
    // src/extension/reload-wiring.ts), so a rebuild over fresh bytes moves it.
    const before = wiring?.registry.get("uses")?.rootClosureHash?.hash;
    // Precondition: the boot closure hash is defined (fail loudly if the field
    // is absent — the observable would otherwise be vacuous).
    expect(before).toBeDefined();

    // Overwrite the lib so `shout` differs, then fire a `change` for its path.
    // At 0.315.0 the lib is unwatched, so this emit is a no-op (no rebuild); the
    // hash stays `before` and the `expect` below reds. After the fix the lib is
    // armed, the emit delivers, and the debounced rebuild re-reads it.
    writeFileSync(libPath, 'fn shout(s: string): string { "CHANGED" }\n', "utf8");
    fakeWatcher.emit({ kind: "change", path: libPath });
    fakeClock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await settle(() => wiring?.registry.get("uses")?.rootClosureHash?.hash !== before);
    expect(wiring?.registry.get("uses")?.rootClosureHash?.hash).not.toBe(before);
  });

  // ===========================================================================
  // Cell 2 — closure-change re-arm. A content edit to the importer that ADDS an
  // out-of-root import must re-arm the ONE watcher onto the widened closure;
  // removing it must shrink the armed set back.
  // ===========================================================================
  it("(2): adding an out-of-root import re-arms the watcher onto the new lib dir; removing it shrinks the armed set", async () => {
    workspace = mkdtempSync(join(tmpdir(), "b0312-cell2-"));
    const thetaDir = join(workspace, ".pi", "theta");
    const lib2Dir = join(workspace, ".pi", "lib2");
    mkdirSync(thetaDir, { recursive: true });
    mkdirSync(lib2Dir, { recursive: true });
    // The lib exists at boot; the importer does NOT yet import it (so boot arms
    // a closure with no out-of-root dir — a clean baseline).
    writeFileSync(join(lib2Dir, "other.thetalib"), "fn foo(s: string): string { s }\n", "utf8");
    const importerPath = join(thetaDir, "importer.theta");
    writeFileSync(importerPath, "---\nmode: prompt\n---\n@`hi`\n", "utf8");

    await boot();
    expect(wiring?.registry.get("importer")).toBeDefined();
    expect(fakeWatcher.watchCalls.length).toBe(1);

    // ADD the out-of-root import via a content edit to the importer (which lives
    // in the watched `.pi/theta` root, so its own `change` always delivers).
    writeFileSync(
      importerPath,
      '---\nmode: prompt\n---\nimport { foo } from "../lib2/other.thetalib"\n@`hi ${foo("x")}`\n',
      "utf8",
    );
    let registrationsBefore = harness.registrationCount();
    fakeWatcher.emit({ kind: "change", path: importerPath });
    fakeClock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    // The rebuild settles in BOTH tree states (the importer is in-root), so this
    // wait is a precondition, not the witness.
    await waitFor(
      () => harness.registrationCount() > registrationsBefore,
      "the add-import rebuild to re-register",
    );

    // RED at 0.315.0: no re-arm logic exists, so `watchCalls` is still length 1.
    // GREEN after: the reload's widened closure re-arms the ONE watcher, so a
    // SECOND arming is recorded and it covers the new lib dir.
    expect(fakeWatcher.watchCalls.length).toBe(2);
    expect(fakeWatcher.currentRoots.map(norm)).toContain(norm(lib2Dir));

    // MIRROR — removal disposition (settled: SHRINK). Removing the import drops
    // the lib from the closure; the re-arm drops `<ws>/.pi/lib2` from the armed
    // set. Rationale: a chokidar arm holds OS handles and delivers events for
    // its whole subtree, so keeping a watch on a directory no longer in any
    // theta's closure would both leak handles and deliver spurious rebuilds for
    // an unrelated tree — the armed set tracks the current closure exactly. This
    // leg is reachable only after the fix (the test reds above at 0.315.0).
    writeFileSync(importerPath, "---\nmode: prompt\n---\n@`hi`\n", "utf8");
    registrationsBefore = harness.registrationCount();
    fakeWatcher.emit({ kind: "change", path: importerPath });
    fakeClock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await waitFor(
      () => harness.registrationCount() > registrationsBefore,
      "the remove-import rebuild to re-register",
    );
    expect(fakeWatcher.watchCalls.length).toBe(3);
    expect(fakeWatcher.currentRoots.map(norm)).not.toContain(norm(lib2Dir));
  });

  // ===========================================================================
  // Cell 3 — in-root lib regression lock. A lib UNDER a watched root is covered
  // incidentally (recursive watching) and must stay so, WITHOUT re-arm churn.
  // This cell is GREEN both before and after the fix (see the per-assertion
  // annotations) — it is a regression lock, not a red witness.
  // ===========================================================================
  it("(3): an in-root `./lib/*.thetalib` still reloads on edit and causes NO re-arm churn", async () => {
    workspace = mkdtempSync(join(tmpdir(), "b0312-cell3-"));
    const thetaDir = join(workspace, ".pi", "theta");
    const inRootLibDir = join(thetaDir, "lib");
    mkdirSync(inRootLibDir, { recursive: true });
    // The lib sits UNDER `.pi/theta`, so the closure ⊆ the armed roots.
    const libPath = join(inRootLibDir, "helper.thetalib");
    writeFileSync(libPath, "fn shout(s: string): string { s }\n", "utf8");
    writeFileSync(
      join(thetaDir, "inroot.theta"),
      '---\nmode: prompt\n---\nimport { shout } from "./lib/helper.thetalib"\n@`hi ${shout("x")}`\n',
      "utf8",
    );

    await boot();
    expect(wiring?.registry.get("inroot")).toBeDefined();
    expect(fakeWatcher.watchCalls.length).toBe(1);

    // PRE-EXISTING GREEN (both tree states): the in-root lib is covered by the
    // recursive directory watch, so its `change` delivers and rebuilds — the
    // closure hash moves over fresh bytes.
    const before = wiring?.registry.get("inroot")?.rootClosureHash?.hash;
    expect(before).toBeDefined();
    writeFileSync(libPath, 'fn shout(s: string): string { "CHANGED" }\n', "utf8");
    fakeWatcher.emit({ kind: "change", path: libPath });
    fakeClock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await waitFor(
      () => wiring?.registry.get("inroot")?.rootClosureHash?.hash !== before,
      "the in-root lib edit to rebuild the importer",
    );
    expect(wiring?.registry.get("inroot")?.rootClosureHash?.hash).not.toBe(before);

    // FIX-LOCKING (trivially green at 0.315.0 — no re-arm exists yet — but locks
    // the fix's exclusion clause): a closure dir already nested under an armed
    // root is EXCLUDED from the union, so the reload adds no new root and does
    // not re-arm. `watchCalls` stays length 1 across the rebuild above.
    expect(fakeWatcher.watchCalls.length).toBe(1);
  });

  // ===========================================================================
  // Cell 4 — bug 0311 note discipline under a newly-watched lib. A content edit
  // to a lib is not structural; an unlink of a WATCHED `.thetalib` is (a
  // `.thetalib` is a source path — `isThetaSourcePath`, src/extension/hot-
  // reload.ts). registration-steps.md:36 §Structural changes / PIC-38.
  // ===========================================================================
  it("(4a): a lib CONTENT change draws NO structural note (content edits are not structural)", async () => {
    // GREEN both tree states — a companion note-discipline lock, not a red
    // witness. At 0.315.0 the out-of-root lib is unwatched, so the emit is a
    // no-op (no note). After the fix the lib is watched and the emit delivers,
    // but a `change` event contributes to neither `added` nor `removed`
    // (registration-steps.md:36 keys the note on add/unlink paths), so still no
    // note.
    workspace = mkdtempSync(join(tmpdir(), "b0312-cell4a-"));
    const thetaDir = join(workspace, ".pi", "theta");
    const libDir = join(workspace, ".pi", "lib");
    mkdirSync(thetaDir, { recursive: true });
    mkdirSync(libDir, { recursive: true });
    const libPath = join(libDir, "helpers.thetalib");
    writeFileSync(libPath, "fn shout(s: string): string { s }\n", "utf8");
    writeFileSync(
      join(thetaDir, "uses.theta"),
      '---\nmode: prompt\n---\nimport { shout } from "../lib/helpers.thetalib"\n@`hi ${shout("x")}`\n',
      "utf8",
    );

    await boot();
    expect(wiring?.registry.get("uses")).toBeDefined();
    const notesBefore = harness.notes.length;
    const registrationsBefore = harness.registrationCount();

    writeFileSync(libPath, 'fn shout(s: string): string { "CHANGED" }\n', "utf8");
    fakeWatcher.emit({ kind: "change", path: libPath });
    fakeClock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    // Give a post-fix rebuild room to land before asserting the absence of a
    // note; at 0.315.0 there is no rebuild, so the poll runs to its bound.
    await settle(() => harness.registrationCount() > registrationsBefore);

    expect(structuralNotesSince(harness, notesBefore)).toEqual([]);
  });

  it("(4b): an unlink of a WATCHED out-of-root `.thetalib` draws ONE structural note carrying its absolute path in `removed`", async () => {
    // RED at 0.315.0: the out-of-root lib is unwatched, so the unlink emit is a
    // no-op — no note. After the fix the lib is armed, the unlink delivers, the
    // importer's import goes unresolvable and it drops, and the reload emits the
    // N=1 structural note carrying the absolute lib path in `removed`
    // (registration-steps.md:36; a `.thetalib` is a source path).
    workspace = mkdtempSync(join(tmpdir(), "b0312-cell4b-"));
    const thetaDir = join(workspace, ".pi", "theta");
    const libDir = join(workspace, ".pi", "lib");
    mkdirSync(thetaDir, { recursive: true });
    mkdirSync(libDir, { recursive: true });
    const libPath = join(libDir, "helpers.thetalib");
    writeFileSync(libPath, "fn shout(s: string): string { s }\n", "utf8");
    writeFileSync(
      join(thetaDir, "uses.theta"),
      '---\nmode: prompt\n---\nimport { shout } from "../lib/helpers.thetalib"\n@`hi ${shout("x")}`\n',
      "utf8",
    );

    await boot();
    expect(wiring?.registry.get("uses")).toBeDefined();
    const notesBefore = harness.notes.length;

    unlinkSync(libPath);
    fakeWatcher.emit({ kind: "unlink", path: libPath });
    fakeClock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await settle(() => structuralNotesSince(harness, notesBefore).length > 0);

    const structural = structuralNotesSince(harness, notesBefore);
    expect(structural).toHaveLength(1);
    const note = structural[0]!;
    expect(note.content).toBe(
      "theta watcher: 1 file(s) added or removed; run /reload to refresh the slash command list",
    );
    expect(note.customType).toBe("theta-system-note");
    expect(note.triggerTurn).toBe(false);
    expect(note.details.structural).toEqual({ added: [], removed: [libPath] });
  });

  // ===========================================================================
  // Cell 5 — subagent-half closure-hash freshness (composition level, no child
  // spawn). A subagent-mode importer's frozen closure hash must be re-captured
  // from fresh lib bytes on a lib edit, so an ordinary edit stops presenting as
  // the tamper-shaped `subagent-callable-hash-mismatch`.
  // ===========================================================================
  it("(5): editing an out-of-root lib re-captures a subagent-mode importer's rootClosureHash from fresh bytes", async () => {
    workspace = mkdtempSync(join(tmpdir(), "b0312-cell5-"));
    const thetaDir = join(workspace, ".pi", "theta");
    const libDir = join(workspace, ".pi", "lib");
    mkdirSync(thetaDir, { recursive: true });
    mkdirSync(libDir, { recursive: true });
    const libPath = join(libDir, "x.thetalib");
    writeFileSync(libPath, "fn shout(s: string): string { s }\n", "utf8");
    // `mode: subagent` — the doc's subagent half. The closure hash is the value
    // marshalled to the child (bug 0328); a stale value is what the child reads
    // as a tamper-shaped mismatch for an ordinary edit.
    writeFileSync(
      join(thetaDir, "sub.theta"),
      '---\nmode: subagent\n---\nimport { shout } from "../lib/x.thetalib"\n@`hi ${shout("x")}`\n',
      "utf8",
    );

    await boot();
    expect(wiring?.registry.get("sub")).toBeDefined();

    // H1 = the boot closure hash (precondition: defined).
    const h1 = wiring?.registry.get("sub")?.rootClosureHash?.hash;
    expect(h1).toBeDefined();

    // Edit the lib and fire its `change`. RED at 0.315.0: the lib is unwatched, so
    // the emit is a no-op and the frozen hash stays H1 — the ordinary edit that
    // the child would refuse. GREEN after: the armed lib delivers, the rebuild
    // re-captures the closure hash from fresh bytes, so H2 != H1.
    writeFileSync(libPath, 'fn shout(s: string): string { "CHANGED" }\n', "utf8");
    fakeWatcher.emit({ kind: "change", path: libPath });
    fakeClock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await settle(() => wiring?.registry.get("sub")?.rootClosureHash?.hash !== h1);
    expect(wiring?.registry.get("sub")?.rootClosureHash?.hash).not.toBe(h1);
  });

  // ===========================================================================
  // Cell F1 (BLOCKER, round-1 review) — a teardown that flips `tornDown` DURING
  // an in-flight, closure-changing rebuild must NOT arm a second watcher. Both
  // teardown paths (session_shutdown sub-step 4 detach/markTornDown;
  // supersession markTornDown+detach) can flip `tornDown` while `runReload`
  // awaits `rediscover`, past its entry guard. Pre-fix the re-arm branch had no
  // `!tornDown` re-check, so an abandoned rebuild whose closure changed called
  // `unsub()` (an idempotent no-op after `detach()`) and armed a FRESH watcher
  // nothing ever tears down — stranding chokidar handles / yielding two live
  // watchers, the exact thing step 4 prevents.
  // ===========================================================================
  it("(F1): a teardown during an in-flight closure-changing rebuild must not arm a second (stranded) watcher", async () => {
    // The direct rig touches no disk; a temp dir only satisfies afterEach.
    workspace = mkdtempSync(join(tmpdir(), "b0312-f1-"));
    const thetaDir = join(workspace, ".pi", "theta");
    const libDir = join(workspace, ".pi", "lib");
    const rig = installDirectRig([thetaDir], [thetaDir, libDir]);

    // Boot arm: exactly one live subscription.
    expect(rig.watcher.watchCalls.length).toBe(1);
    expect(rig.watcher.liveSubscriptions).toBe(1);

    // Put a rebuild IN FLIGHT (parked inside `rediscover`), past `runReload`'s
    // torn-down entry guard.
    rig.watcher.emit({ kind: "change", path: join(thetaDir, "importer.theta") });
    rig.clock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await waitFor(() => rig.rediscoverEntered(), "the rebuild to enter rediscover");

    // Teardown lands DURING the await: `detach()` tears the armed watcher down
    // and flips `tornDown`.
    rig.handle.detach();
    expect(rig.watcher.liveSubscriptions).toBe(0);

    // Release the parked rebuild: it publishes, then reaches the re-arm branch
    // with a CHANGED closure (rootsB ≠ the armed rootsA).
    rig.releaseRediscover();
    await rig.handle.whenIdle?.();

    // RED before F1 (re-arm fires: `watchCalls` advances to 2 and a fresh live
    // subscription nothing tears down is stranded). GREEN after: the `!tornDown`
    // guard blocks the re-arm — no second arming, no strand.
    expect(rig.watcher.watchCalls.length).toBe(1);
    expect(rig.watcher.liveSubscriptions).toBe(0);
  });

  // ===========================================================================
  // Cell F2 (BLOCKER, round-1 review) — after a PIC-55 terminal (stopped-
  // delivering) signal the watcher is left torn-down-until-`/reload`
  // (registration-steps.md#pic-55), and the persistent
  // `theta/runtime/watcher-terminated` note has already told the operator so.
  // The terminal path does NOT mark the debouncer torn-down (the registry stays
  // live), so a debounce window pending at termination still fires `runReload`;
  // pre-fix, if that pass's closure differed the re-arm branch RESURRECTED the
  // watcher, silently resuming hot-reload after announcing it halted.
  // ===========================================================================
  it("(F2): after a terminal signal, a pending closure-changing rebuild must not resurrect the torn-down watcher", async () => {
    workspace = mkdtempSync(join(tmpdir(), "b0312-f2-"));
    const thetaDir = join(workspace, ".pi", "theta");
    const libDir = join(workspace, ".pi", "lib");
    const rig = installDirectRig([thetaDir], [thetaDir, libDir]);

    expect(rig.watcher.watchCalls.length).toBe(1);
    expect(rig.watcher.liveSubscriptions).toBe(1);

    // Put a rebuild in flight, then drive the terminal signal while it is
    // parked. The terminal path tears the watcher down and emits the persistent
    // note, but leaves the debouncer live, so the pending rebuild still fires.
    rig.watcher.emit({ kind: "change", path: join(thetaDir, "importer.theta") });
    rig.clock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await waitFor(() => rig.rediscoverEntered(), "the rebuild to enter rediscover");

    rig.watcher.terminate();
    expect(rig.watcher.liveSubscriptions).toBe(0);
    // Precondition (fail loudly): the terminal path actually ran — the
    // persistent watcher-terminated note is on the channel.
    expect(rig.notes.some((content) => content.includes("watcher terminated"))).toBe(true);

    // Release the parked rebuild: it publishes, then reaches the re-arm branch
    // with a CHANGED closure.
    rig.releaseRediscover();
    await rig.handle.whenIdle?.();

    // RED before F2 (the re-arm resurrects the watcher: `watchCalls` advances to
    // 2, a live subscription returns, silently resuming hot-reload after the
    // terminal note). GREEN after: the `!terminated` guard holds the watcher
    // torn-down-until-`/reload`.
    expect(rig.watcher.watchCalls.length).toBe(1);
    expect(rig.watcher.liveSubscriptions).toBe(0);
  });
});
