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
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type {
  FileWatcher,
  FileWatchEvent,
  OnWatchTerminate,
  Unsubscribe,
} from "../src/seams/file-watcher";
import { FakeClock } from "./helpers/fake-clock";

// Bug 0378 — the step-5 watch-root union (`discoveryWatchRoots` in
// `runComposePass`, src/extension/production-composition.ts) used to dedupe its
// members by SEPARATOR-normalised STRING only (`.replace(/\\/g, "/")`), so two
// case-variant spellings of ONE physical directory both survived the Set and
// armed chokidar TWICE. The fix maps each member through `canonicalizePath`
// (`realpath`) so one physical directory is one armed root; this test witnesses
// both the fork defect and the fixed end-state. A settings `thetaPaths` entry `<ws>/Shared` and a `--theta <ws>/shared`
// naming the same physical dir is a legal, warning-only configuration (bug
// 0331: cross-source shadowing, higher tier wins; the FILES inside dedupe), but
// the two ENTRY spellings both enter `walk.roots` (discovery records the
// entry's spelling — `discovery-walk.ts` `normalizePath` swaps separators only),
// survive the string Set, and arm the recursive watcher over the one physical
// dir twice. Every `add`/`unlink` under the dir is then delivered once per
// armed spelling, each event path spelled under its root's own casing, so the
// 0311-fixed note derivation (`added`/`removed` deduped WITHIN role by raw
// event-path string, `hot-reload.ts:341-348`) counts one physical file twice:
// the shipped structural-change note reports `theta watcher: 2 file(s) added or
// removed` and `details.structural.added` lists the same physical file under
// both cased spellings.
//
// Expected (registration-steps.md:22, :36; runtime-event-channel.md
// §details.structural): the armed set is a set of DIRECTORIES, one physical
// directory is one root however each source spelled it, and `<N>` "equals
// `details.structural.added.length + details.structural.removed.length`" with
// the worked example fixing one added file at N=1 — one created file is one
// `added` entry. The §Fix maps each `discoveryWatchRoots` member through the
// corpus's existing `canonicalizePath` (`src/runtime/invocation.ts:142`) with an
// exists-gated fallback, so one physical dir arms once on both filesystem
// regimes; distinct physical dirs keep distinct members.
//
// Cells 1 (armed-set count) and 2 (note count) are RED at the current tree for
// the right reason (two case-variant members survive / the note says "2
// file(s)"); cells 3 (distinct dirs stay distinct) and 4 (identical spelling)
// are GREEN both before and after — regression locks that the fix must not
// disturb.
//
// Harness: mirrors tests/b0312-out-of-root-thetalib-watch-closure.test.ts and
// tests/b0310-watch-roots-root-union.test.ts — the SHIPPED composition
// (`createThetaExtension` → `composeExtensionInstance`) over a real temp-dir
// workspace, a FAKE `Clock` (FakeClock), a FileWatcher seam double that records
// every `watch()` root list, and a `pi.getFlag('theta')` that feeds the
// `--theta` CLI root (b0310's flags plumbing). The seam double additionally
// models real chokidar arming ONE recursive watch per root STRING and fanning
// one event per armed root that case-insensitively equals-or-contains a physical
// dir — the faithful model of two case-variant watches over one physical dir
// each firing with its own prefix (§Reproduction step 2). The event count is
// DERIVED from the armed-root set (never hand-emitted), so the fix — which
// collapses the armed set to one member — changes it.
//
// Every `0.376.0` is the literal placeholder the fix's shipped version fills.

const HELLO_THETA = ["---", "mode: prompt", "---", "@`hi`", ""].join("\n");

/** Normalise a path to the forward-slash, lower-case comparison form (this repo
 *  runs on a case-insensitive Windows host — the regime the bug turns on). */
function norm(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase();
}

/** Forward-slash a path without lower-casing — the spelling form
 *  `discoveryWatchRoots` records and hands chokidar. */
function fwd(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
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

/**
 * A `FileWatcher` seam double that models real chokidar arming ONE recursive
 * watch per root STRING (chokidar keys its per-directory watchers by path
 * string, so two case-variant spellings are two independent watches —
 * `pi-file-watcher.ts:114`, and §Actual). It:
 *
 *  - records every `watch(roots, …)` arming's roots (`watchCalls`) and exposes
 *    the currently-armed set (`currentRoots`), exactly like b0312's
 *    `RecursiveRootFileWatcher` / b0310's `RootsRecordingFileWatcher`;
 *  - `deliver(kind, physicalDir, filename)` fans out ONE event to the armed
 *    handler PER currently-armed root that case-insensitively equals-or-contains
 *    `physicalDir`, each event's `path` spelled UNDER THAT ROOT's own casing
 *    (`root + '/' + filename`) — the faithful model of two case-variant watches
 *    over one physical dir each firing with its own prefix. The event count is
 *    derived from the armed-root set, so collapsing that set to one member (the
 *    fix) collapses the fan-out to one event.
 *
 * The settings-file paths every arm carries (`<config-dir>/settings.json`, the
 * global agent `settings.json`) are files, not ancestors of a discovery dir, so
 * the equals-or-contains test never matches them.
 */
class CaseVariantFanoutFileWatcher implements FileWatcher {
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
      if (this.#handler === handler) {
        this.#handler = undefined;
        this.#roots = [];
      }
    };
  }

  /** The roots the watcher is armed over right now (the last `watch()` call). */
  get currentRoots(): readonly string[] {
    return this.#roots;
  }

  /** The count of currently-armed roots that case-insensitively equal-or-contain
   *  `physicalDir` — the number of chokidar watches firing for one file under it. */
  armedMatchCount(physicalDir: string): number {
    return this.#roots.filter((root) => this.#covers(root, physicalDir)).length;
  }

  /** Fan one `kind` event per armed root covering `physicalDir`, each path under
   *  that root's own casing. Fails loudly (never a silent skip — AGENTS.md) when
   *  no armed root covers the dir: an unmet precondition names itself. */
  deliver(kind: "add" | "unlink", physicalDir: string, filename: string): void {
    if (this.#handler === undefined) {
      throw new Error("deliver() called with no armed watcher");
    }
    const matching = this.#roots.filter((root) => this.#covers(root, physicalDir));
    if (matching.length === 0) {
      throw new Error(
        `precondition unmet: no armed root covers physical dir ${physicalDir}`,
      );
    }
    for (const root of matching) {
      this.#handler({ kind, path: `${fwd(root)}/${filename}` });
    }
  }

  /** `root` case-insensitively equals `dir`, or is an ancestor directory of it. */
  #covers(root: string, dir: string): boolean {
    const r = norm(root);
    const d = norm(dir);
    return d === r || d.startsWith(r.endsWith("/") ? r : `${r}/`);
  }
}

interface Harness {
  readonly pi: ExtensionAPI;
  readonly notes: RecordedNote[];
  fireSessionStart(): Promise<void>;
}

/** fake-pi harness combining b0310's `getFlag(flags)` plumbing (the `--theta`
 *  CLI root reaches discovery only through `getFlag('theta')`) with b0311/b0312's
 *  `sendMessage` note recorder (the `theta-system-note` channel). */
function makeHarness(cwd: string, flags: Readonly<Record<string, string>>): Harness {
  const commands = new Map<string, unknown>();
  const notes: RecordedNote[] = [];
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

  return { pi, notes, fireSessionStart: () => fire("session_start") };
}

/** Poll a real-timer-bounded condition; throw loudly on timeout naming the
 *  unmet precondition (the b0311/b0312 loud-fail idiom — never an early return
 *  or skip). */
async function waitFor(cond: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 400; i++) {
    if (cond()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timeout waiting for ${label}`);
}

/** The structural-change notes recorded since `from` (content-keyed). */
function structuralNotesSince(harness: Harness, from: number): RecordedNote[] {
  return harness.notes
    .slice(from)
    .filter((note) => note.content.startsWith("theta watcher:"));
}

describe("Bug 0378 — the watch-root union must key on physical-directory identity, not case-variant spelling", () => {
  let workspace: string;
  let fakeWatcher: CaseVariantFanoutFileWatcher;
  let fakeClock: FakeClock;
  let harness: Harness;
  let wiring: ExtensionInstanceWiring | undefined;

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  /** Boot the shipped composition over the fan-out watcher + fake clock, with
   *  the given `--theta` flag. */
  async function boot(flags: Readonly<Record<string, string>>): Promise<void> {
    fakeWatcher = new CaseVariantFanoutFileWatcher();
    fakeClock = new FakeClock();
    harness = makeHarness(workspace, flags);
    wiring = undefined;
    const deps: ThetaExtensionDeps = {
      fixtures: [],
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
    await waitFor(
      () => fakeWatcher.watchCalls.length > 0,
      "session_start to arm the watcher",
    );
  }

  /** Write `<ws>/.pi/settings.json` with the given absolute `thetaPaths` entries
   *  (forward-slashed so JSON needs no backslash escaping; absolute entries are
   *  used as-is — settings.ts:56). */
  function writeSettings(thetaPaths: readonly string[]): void {
    const settingsPath = join(workspace, ".pi", "settings.json");
    mkdirSync(join(workspace, ".pi"), { recursive: true });
    writeFileSync(
      settingsPath,
      JSON.stringify({ thetaPaths: thetaPaths.map((p) => fwd(p)) }),
      "utf8",
    );
  }

  // ===========================================================================
  // Cell 1 — ARMED-SET (§Reproduction step 1). A case-variant config names one
  // physical dir from two sources with different casing; the armed set must
  // carry exactly ONE member for that physical dir. RED at the fork: two
  // spellings (`shared` + `Shared`) survive the string-keyed union.
  // ===========================================================================
  it("(1): a legal settings/`--theta` pair naming one physical dir with different casing arms that dir exactly once", async () => {
    workspace = mkdtempSync(join(tmpdir(), "b0378-cell1-"));
    // Physical dir on disk is `<ws>/shared` (lower-case); it holds a valid theta.
    const physicalDir = join(workspace, "shared");
    mkdirSync(physicalDir, { recursive: true });
    writeFileSync(join(physicalDir, "hello.theta"), HELLO_THETA, "utf8");
    // Settings names the SAME physical dir with a DIFFERENT spelling (`Shared`).
    writeSettings([join(workspace, "Shared")]);
    // CLI `--theta` names it lower-case (matching the on-disk spelling).
    await boot({ theta: physicalDir });

    // Precondition: the theta registers (the files dedupe via the cross-source
    // shadow — bug 0331), so a red below is the armed-set defect, not an
    // empty-discovery artifact.
    expect(wiring?.registry.get("hello")).toBeDefined();

    // The count of armed roots that case-insensitively match the physical dir.
    // Do NOT collapse via a lower-cased `.toContain` — that would hide the
    // duplicate; count the case-insensitive matches and assert exactly one.
    const matchCount = fakeWatcher.armedMatchCount(physicalDir);

    // RED at 0.376.0's fork: `matchCount` is 2 — both `shared` (cli/disk) and
    // `Shared` (settings) survive the separator-only Set. GREEN after: the
    // canonical-identity dedup collapses them to one member.
    expect(matchCount).toBe(1);
  });

  // ===========================================================================
  // Cell 2 — NOTE-COUNT (§Reproduction step 3). One physical `.theta` created
  // under the double-armed dir fans one `add` per armed spelling; the shipped
  // debounce + note path must render ONE structural note counting ONE file.
  // RED at the fork: two events survive the within-role string dedup, so the
  // note says "2 file(s)" and `added` carries the file under both spellings.
  // ===========================================================================
  it("(2): one physical `.theta` add under the double-armed dir draws ONE structural note counting ONE file", async () => {
    workspace = mkdtempSync(join(tmpdir(), "b0378-cell2-"));
    const physicalDir = join(workspace, "shared");
    mkdirSync(physicalDir, { recursive: true });
    writeFileSync(join(physicalDir, "hello.theta"), HELLO_THETA, "utf8");
    writeSettings([join(workspace, "Shared")]);
    await boot({ theta: physicalDir });
    expect(wiring?.registry.get("hello")).toBeDefined();

    // The armed-set count is asserted by cell 1 (2 at the fork, 1 after the
    // fix). Cell 2 witnesses the DOWNSTREAM note: `deliver` fans one `add` per
    // armed matching root, so at the fork the double-armed dir yields two events
    // (note "2 file(s)") and after the fix the single-armed dir yields one (note
    // "1 file(s)"). No double-arm precondition guard here — the fix collapses the
    // armed set, so requiring 2 members would make this cell unsatisfiable
    // post-fix (the bug 0378 fix arms at the union build, not the note layer).
    const notesBefore = harness.notes.length;
    // Create ONE physical file, then fan its `add` over the armed spellings.
    writeFileSync(join(physicalDir, "brand-new.theta"), HELLO_THETA, "utf8");
    fakeWatcher.deliver("add", physicalDir, "brand-new.theta");
    fakeClock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await waitFor(
      () => structuralNotesSince(harness, notesBefore).length > 0,
      "the debounce window to emit the structural note",
    );

    const structural = structuralNotesSince(harness, notesBefore);
    // Exactly one structural note for the window.
    expect(structural).toHaveLength(1);
    const note = structural[0]!;
    expect(note.customType).toBe("theta-system-note");
    // RED at 0.376.0's fork: content says "2 file(s)" — the two cased spellings of
    // one physical file are two `added` members. GREEN after: one physical add
    // is one entry, so N=1.
    expect(note.content).toBe(
      "theta watcher: 1 file(s) added or removed; run /reload to refresh the slash command list",
    );
    expect(note.details.structural?.added).toHaveLength(1);
  });

  // ===========================================================================
  // Cell 3 — CONTROL: distinct physical dirs stay distinct. GREEN before AND
  // after — a regression lock proving the fix does not collapse two genuinely
  // different directories into one armed member.
  // ===========================================================================
  it("(3): two DIFFERENT physical dirs each arm exactly once and both survive the union", async () => {
    workspace = mkdtempSync(join(tmpdir(), "b0378-cell3-"));
    const dirOne = join(workspace, "one");
    const dirTwo = join(workspace, "two");
    mkdirSync(dirOne, { recursive: true });
    mkdirSync(dirTwo, { recursive: true });
    writeFileSync(join(dirOne, "hello.theta"), HELLO_THETA, "utf8");
    writeFileSync(join(dirTwo, "hi.theta"), HELLO_THETA, "utf8");
    writeSettings([dirOne]);
    await boot({ theta: dirTwo });

    // Both thetas register (distinct physical dirs, distinct names).
    expect(wiring?.registry.get("hello")).toBeDefined();
    expect(wiring?.registry.get("hi")).toBeDefined();

    // Each physical dir arms exactly once, and both are present — 2 distinct
    // discovery members. GREEN in both tree states.
    expect(fakeWatcher.armedMatchCount(dirOne)).toBe(1);
    expect(fakeWatcher.armedMatchCount(dirTwo)).toBe(1);
    const discoveryMembers = fakeWatcher.currentRoots.filter(
      (root) => norm(root) === norm(dirOne) || norm(root) === norm(dirTwo),
    );
    expect(discoveryMembers).toHaveLength(2);
  });

  // ===========================================================================
  // Cell 4 — CONTROL: single-spelling config (settings and `--theta` name the
  // dir with the IDENTICAL spelling). GREEN before AND after — byte-identical
  // behaviour: one armed member and one physical add ⇒ "1 file(s)".
  // ===========================================================================
  it("(4): an identical-spelling settings/`--theta` pair arms once and reports one file for one add", async () => {
    workspace = mkdtempSync(join(tmpdir(), "b0378-cell4-"));
    const physicalDir = join(workspace, "shared");
    mkdirSync(physicalDir, { recursive: true });
    writeFileSync(join(physicalDir, "hello.theta"), HELLO_THETA, "utf8");
    // IDENTICAL spelling from both sources — the string Set already collapses it.
    writeSettings([physicalDir]);
    await boot({ theta: physicalDir });
    expect(wiring?.registry.get("hello")).toBeDefined();

    // Exactly one armed member for the physical dir. GREEN in both tree states.
    expect(fakeWatcher.armedMatchCount(physicalDir)).toBe(1);

    const notesBefore = harness.notes.length;
    writeFileSync(join(physicalDir, "brand-new.theta"), HELLO_THETA, "utf8");
    fakeWatcher.deliver("add", physicalDir, "brand-new.theta");
    fakeClock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await waitFor(
      () => structuralNotesSince(harness, notesBefore).length > 0,
      "the debounce window to emit the structural note",
    );

    const structural = structuralNotesSince(harness, notesBefore);
    expect(structural).toHaveLength(1);
    const note = structural[0]!;
    expect(note.content).toBe(
      "theta watcher: 1 file(s) added or removed; run /reload to refresh the slash command list",
    );
    expect(note.details.structural?.added).toHaveLength(1);
  });
});
