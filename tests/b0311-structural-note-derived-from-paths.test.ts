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
import { RELOAD_DEBOUNCE_WINDOW_MS } from "../src/extension/reload-debounce";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { FakeClock } from "./helpers/fake-clock";
import { FakeFileWatcher } from "./helpers/fake-file-watcher";

// Bug 0311 — the structural-change `theta-system-note` must derive from the
// debounce-window observed add/unlink PATHS for `.theta` / `.thetalib` files,
// not from the post-rebuild registered-NAME set diff. The spec fixes both the
// emission condition (registration-steps.md §Structural changes, anchor
// `#structural-changes-no-unregister`: "per-`.theta`-file content edits are
// not" structural; PIC-38 same-window remove+add emits with N=2) and the
// payload (runtime-event-channel.md, the `details.structural` bullet: `added`
// and `removed` "carry absolute file paths from the debounce-window batch").
//
// These cells are RED at HEAD: `runReload` (`src/extension/hot-reload.ts`)
// keys the note on `nextNames` vs `currentNames`, a registration-outcome basis
// that over-emits on a parse-breaking content edit, under-emits on a
// same-window unlink+add of one path, and ships slash names where the wire
// contract pins absolute paths. Each cell asserts the SPEC'd behaviour and
// reds on its own assertion, matching the bug document's §Reproduction /
// §Expected symptom.
//
// Harness: the `tests/watcher-hot-reload-integration.test.ts` pattern —
// the SHIPPED composition (`composeExtensionInstance`) through the real factory
// (`createThetaExtension`) with a FAKE `FileWatcher` + FAKE `Clock`. A real
// temp-dir workspace backs discovery; the fake watcher fires `onChange`; the
// fake clock crosses the 250 ms debounce boundary. This replicate adds a
// `pi.registerCommand` invocation counter so a rebuild that does NOT change the
// registry (witness B) is still observable as settled.

const GREET_THETA = ["---", "mode: prompt", "---", "@`hi`", ""].join("\n");
const SECOND_THETA = ["---", "mode: prompt", "---", "@`yo`", ""].join("\n");
// A body that fails to parse: `let` with no initialiser. On reload greet drops
// (its parse failed) while its file path is unchanged — no file added/removed.
const GREET_THETA_BROKEN = ["---", "mode: prompt", "---", "let = = =", ""].join("\n");
// The exact parse code the broken body yields at HEAD (read off the compose
// pass): the parse diagnostic that co-emits with — and, post-fix, INSTEAD of —
// the false structural note.
const PARSE_CODE = "theta/parse/let-without-initialiser";

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
  readonly ctx: ExtensionContext;
  readonly commands: Map<string, unknown>;
  readonly notes: RecordedNote[];
  /** Count of `pi.registerCommand` calls: a rebuild-settled signal that does
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
    ctx,
    commands,
    notes,
    registrationCount: () => registrations,
    fireSessionStart: () => fire("session_start"),
  };
}

/** Poll a real-timer-bounded condition (awaits the genuinely-async fs reads);
 *  throws loudly on timeout naming the unmet precondition — the loud-fail
 *  pattern the integration harness uses, never an early return / skip. */
async function waitFor(cond: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 400; i++) {
    if (cond()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timeout waiting for ${label}`);
}

/** The structural-change notes emitted since `from` (content-keyed). */
function structuralNotesSince(harness: Harness, from: number): RecordedNote[] {
  return harness.notes
    .slice(from)
    .filter((note) => note.content.startsWith("theta watcher:"));
}

describe("Bug 0311 — structural note derives from watcher paths, not the name-set diff", () => {
  let workspace: string;
  let thetaDir: string;
  let harness: Harness;
  let fakeWatcher: FakeFileWatcher;
  let fakeClock: FakeClock;
  let wiring: ExtensionInstanceWiring | undefined;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "theta-b0311-"));
    thetaDir = join(workspace, ".pi", "theta");
    mkdirSync(thetaDir, { recursive: true });
    writeFileSync(join(thetaDir, "greet.theta"), GREET_THETA, "utf8");

    harness = makeHarness(workspace);
    fakeWatcher = new FakeFileWatcher();
    fakeClock = new FakeClock();
    wiring = undefined;

    const deps: ThetaExtensionDeps = {
      fixtures: [],
      // Forward the factory's PIC-69 own-registration ledger
      // (registration-steps.md#pic-69) into the composition root, exactly as
      // the shipped factory does (`createProductionExtension`). Without it a
      // theta dropped by a content-drop pass (A) self-collides on the next
      // pass against its own surviving `pi.getCommands()` entry
      // (`theta/load/cross-format-collision`) and never re-registers, so the
      // A2 restore direction could not reach its assertion.
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
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it("(A): a parse-breaking content edit emits NO structural note, isolates the sibling, and still surfaces the parse diagnostic", async () => {
    // Both greet + second valid at boot. A per-`.theta`-file content edit is
    // NOT a structural change (registration-steps.md §Structural changes: "per-
    // `.theta`-file content edits are not"): breaking greet's parse must not
    // draw a "file(s) added or removed" note, because no file was added or
    // removed — the co-emitted parse rows are the correct signal, and the note
    // prescribes `/reload`, which does nothing for a parse error.
    writeFileSync(join(thetaDir, "second.theta"), SECOND_THETA, "utf8");
    await harness.fireSessionStart();
    expect(wiring?.registry.get("greet")).toBeDefined();
    expect(wiring?.registry.get("second")).toBeDefined();
    const notesBefore = harness.notes.length;

    // Overwrite greet with a parse-breaking body (same path, no add/remove),
    // fire one `change`, cross the debounce boundary, wait for greet to drop.
    writeFileSync(join(thetaDir, "greet.theta"), GREET_THETA_BROKEN, "utf8");
    fakeWatcher.emit({ kind: "change", path: join(thetaDir, "greet.theta") });
    fakeClock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await waitFor(() => wiring?.registry.get("greet") === undefined, "greet to drop on parse failure");

    // No structural note fired in the window (RED at HEAD: the name-set diff
    // sees greet leave the registered set and emits a false N=1 note with
    // `removed: ["greet"]`).
    expect(structuralNotesSince(harness, notesBefore)).toEqual([]);

    // Sibling isolation: second survives the pass untouched.
    expect(wiring?.registry.get("second")).toBeDefined();

    // The parse diagnostic still surfaces (this is the correct signal, and it
    // survives the fix): a note whose `details.diagnostics` carries the parse
    // code for greet's broken body.
    const parseNote = harness.notes
      .slice(notesBefore)
      .find((note) =>
        (note.details.diagnostics ?? []).some((d) => d.code === PARSE_CODE),
      );
    expect(parseNote).toBeDefined();
  });

  it("(A2): restoring the bytes of a parse-broken theta emits NO structural note", async () => {
    // The mirror direction of (A): a content edit that fixes greet's parse back
    // re-enters the name set but adds no file, so it must draw no note.
    writeFileSync(join(thetaDir, "second.theta"), SECOND_THETA, "utf8");
    await harness.fireSessionStart();

    // Break greet first and let it drop.
    writeFileSync(join(thetaDir, "greet.theta"), GREET_THETA_BROKEN, "utf8");
    fakeWatcher.emit({ kind: "change", path: join(thetaDir, "greet.theta") });
    fakeClock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await waitFor(() => wiring?.registry.get("greet") === undefined, "greet to drop on parse failure");

    // Now restore greet's valid bytes; the window that re-registers it is the
    // one under assertion.
    const notesBefore = harness.notes.length;
    writeFileSync(join(thetaDir, "greet.theta"), GREET_THETA, "utf8");
    fakeWatcher.emit({ kind: "change", path: join(thetaDir, "greet.theta") });
    fakeClock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await waitFor(() => wiring?.registry.get("greet") !== undefined, "greet to re-register on restore");

    // No structural note fired (RED at HEAD: the name-set diff sees greet
    // re-enter the set and emits a false N=1 note with `added: ["greet"]`).
    expect(structuralNotesSince(harness, notesBefore)).toEqual([]);
  });

  it("(B): a same-window unlink+add of one present path emits ONE note with N=2 (PIC-38)", async () => {
    // greet is present on disk and stays present — no content or existence
    // change. A same-window `removed` of path P then `added` of path P (the
    // editor save-via-rename burst) has `added.length + removed.length === 2`
    // and MUST emit the note (registration-steps.md PIC-38). The name-set diff
    // nets zero and emits nothing (RED at HEAD).
    await harness.fireSessionStart();
    expect(wiring?.registry.get("greet")).toBeDefined();
    const notesBefore = harness.notes.length;
    const registrationsBefore = harness.registrationCount();
    const greetPath = join(thetaDir, "greet.theta");

    // Do NOT touch disk: greet stays present, so the rebuild leaves the
    // registry unchanged. The rebuild-settled signal is the re-registration
    // count advancing (a no-op-registry reload still re-registers survivors).
    fakeWatcher.emit({ kind: "unlink", path: greetPath });
    fakeWatcher.emit({ kind: "add", path: greetPath });
    fakeClock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await waitFor(
      () => harness.registrationCount() > registrationsBefore,
      "the same-window rebuild to re-register",
    );

    // EXACTLY ONE structural note, N=2, with the SAME absolute path in both
    // arrays (no cross-role dedup — the arrays are disjoint by role).
    const structural = structuralNotesSince(harness, notesBefore);
    expect(structural).toHaveLength(1);
    const note = structural[0]!;
    expect(note.content).toBe(
      "theta watcher: 2 file(s) added or removed; run /reload to refresh the slash command list",
    );
    expect(note.customType).toBe("theta-system-note");
    expect(note.triggerTurn).toBe(false);
    expect(note.details.structural).toEqual({
      added: [greetPath],
      removed: [greetPath],
    });
  });

  it("(real-unlink payload): a real unlink emits N=1 carrying the ABSOLUTE PATH, not the slash name", async () => {
    // A real removal of greet's file: N=1 under both bases (the name-diff and
    // the path-diff agree on the count), so this cell pins the PAYLOAD the
    // integration (b)+(c) cell does not assert — `details.structural` carries
    // an absolute file path (runtime-event-channel.md, the `details.structural`
    // bullet), not the slash name the name-set basis ships (RED at HEAD).
    await harness.fireSessionStart();
    expect(wiring?.registry.get("greet")).toBeDefined();
    const notesBefore = harness.notes.length;
    const greetPath = join(thetaDir, "greet.theta");

    unlinkSync(greetPath);
    fakeWatcher.emit({ kind: "unlink", path: greetPath });
    fakeClock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await waitFor(() => wiring?.registry.get("greet") === undefined, "greet to drop on unlink");

    const structural = structuralNotesSince(harness, notesBefore);
    expect(structural).toHaveLength(1);
    const note = structural[0]!;
    expect(note.content).toBe(
      "theta watcher: 1 file(s) added or removed; run /reload to refresh the slash command list",
    );
    expect(note.details.structural).toEqual({ added: [], removed: [greetPath] });
  });
});
