import { mkdtempSync, mkdirSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
import { FakeFileWatcher, waitFor } from "./helpers/fake-file-watcher";
import { makeRecordingHarness, type RecordingHarness } from "./helpers/watch-arming-harness";

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

interface Harness extends RecordingHarness<{ readonly diagnostics?: readonly Diagnostic[] }> {
  /** Arm/disarm a `pi.getCommands()` throw (drives the watcher-time swap failure). */
  setGetCommandsThrows(v: boolean): void;
}

function makeHarness(cwd: string): Harness {
  let getCommandsThrows = false;
  const harness = makeRecordingHarness<{ readonly diagnostics?: readonly Diagnostic[] }>(cwd, {
    beforeGetCommands: (): void => {
      if (getCommandsThrows) {
        throw new Error("getCommands boom (watcher-time)");
      }
    },
  });
  return {
    ...harness,
    setGetCommandsThrows: (v) => {
      getCommandsThrows = v;
    },
  };
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

  it("(f) bug 0471: a change to a NON-theta file under a discovery root does not trigger a reload", async () => {
    await harness.fireSessionStart();
    expect(wiring?.registry.get("greet")).toBeDefined();
    const notesBefore = harness.notes.length;

    // Plant a new theta on disk so that IF a reload ran it WOULD register it —
    // this isolates "the filter blocked the reload" from "there was nothing to
    // do". Then fire a watcher event for an unrelated Markdown file under the
    // SAME discovery root (the exact shape that caused bug 0471: writing .md
    // scratch files into .localpi/ triggered a full rescan + warning storm).
    writeFileSync(join(thetaDir, "second.theta"), SECOND_THETA, "utf8");
    writeFileSync(join(thetaDir, "notes.md"), "# scratch\n", "utf8");
    fakeWatcher.emit({ kind: "change", path: join(thetaDir, "notes.md") });
    fakeClock.advance(RELOAD_DEBOUNCE_WINDOW_MS * 4);
    await new Promise((resolve) => setTimeout(resolve, 40));

    // No reload ran: the planted theta was never discovered/registered, and no
    // note (the storm) was emitted for the non-theta change.
    expect(wiring?.registry.get("second")).toBeUndefined();
    expect(harness.commands.has("second")).toBe(false);
    expect(harness.notes.length).toBe(notesBefore);
  });

  it("(g) bug 0471: a change to the project settings.json still triggers a reload", async () => {
    await harness.fireSessionStart();
    expect(wiring?.registry.get("greet")).toBeDefined();

    // Plant a new theta, then fire a watcher event for the PROJECT settings file
    // (the settings-re-merge arm — one of the two non-.theta paths that must
    // still trigger a rebuild). If the reload runs, `second` is discovered.
    writeFileSync(join(thetaDir, "second.theta"), SECOND_THETA, "utf8");
    fakeWatcher.emit({ kind: "change", path: join(workspace, ".pi", "settings.json") });
    fakeClock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await waitFor(
      () => wiring?.registry.get("second") !== undefined,
      "settings-triggered reload to settle",
    );

    expect(wiring?.registry.get("second")).toBeDefined();
    expect(harness.commands.has("second")).toBe(true);
  });

  it("(e): session_shutdown detaches the watcher and cancels the pending debounce timer", async () => {
    await harness.fireSessionStart();
    expect(wiring?.registry.get("greet")).toBeDefined();

    // Plant a new theta and open a debounce window (a timer is now pending), but
    // do NOT cross the boundary yet.
    writeFileSync(join(thetaDir, "second.theta"), SECOND_THETA, "utf8");
    fakeWatcher.emit({ kind: "change", path: join(thetaDir, "second.theta") });

    // Tear down: session_shutdown must detach the watcher and cancel the timer.
    // The wired `session_shutdown` handler is genuinely async (sub-step 4's
    // watcher-detach runs after sub-step 3's bounded await), so the teardown is
    // awaited before the test advances the clock — otherwise the pending
    // debounce timer fires ahead of the detach that cancels it.
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
