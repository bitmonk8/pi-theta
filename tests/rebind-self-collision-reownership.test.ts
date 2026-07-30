// Bug 0024 — RED offline witness suite, written BEFORE the fix. All six tests
// are classified against the pin. The spec-correct assertions in tests 1, 2
// and 4 MUST fail at HEAD (1d516897), as must arm (c) of test 6 — the rebind
// pass re-owning its OWN `/second`, a surviving name that self-collides at the
// pin exactly like tests 1 and 2's `/greet`. The two controls (tests 3 and 5)
// and the other four arms of test 6 — (a)/(b)/(d)/(e), the foreign-entry drop
// arms — must pass at HEAD *and* after the fix, proving every discriminator is
// live and that the fix does not over-reach.
//
// Defect (docs/bugs/0024-rebind-self-collision-drops-surviving-names.md): the
// `session_start` compose pass calls `runComposePass` with
// `excludeOwnedNames = undefined` (`src/extension/production-composition.ts`),
// so `readPiOwnedCommands` folds the extension instance's OWN prior
// `pi.registerCommand` registrations — Pi reports every command an extension
// registered as `source: "extension"` — into the cross-format collision source
// set. On any re-bind of the same instance (a shutdown-less supersession or a
// start-after-shutdown rebind) every slash name whose `.theta` STILL resolves
// is therefore dropped as a foreign collision: no second `pi.registerCommand`
// is issued, an error-severity `theta/load/cross-format-collision` note
// misdescribes the cause ("Pi-owned command '<name>' survives"), and the live
// `/<name>` stays bound to the superseded, DRAINED registry — so a dispatch on
// a running session answers `theta /<name>: extension shutting down` until the
// operator runs `/reload`.
//
// Spec encoded by the red assertions (both clauses landed by this bug's step-1
// spec amendment to `docs/spec_topics/pi-integration-contract/registration-steps.md`):
//  - #pic-69 (own-registration exclusion): on EVERY pass that consults
//    `pi.getCommands()` for the cross-format collision check — first start,
//    hot-reload, supersession, rebind — the instance MUST exclude from the
//    collision source set every entry that BOTH carries `source: "extension"`
//    AND bears a name this instance itself passed to `pi.registerCommand`.
//    Two sub-clauses this suite discriminates separately:
//      * the exclusion is conditioned on `source`, NEVER on the name alone —
//        a genuine `"prompt"` / `"skill"` entry of the same name still drops
//        the theta (test 3, and arm (a) of test 4 on the hot-reload pass);
//      * the excluded set is the instance's registration LEDGER (every name
//        ever passed to `pi.registerCommand`), not the live `ThetaRegistry`'s
//        keys, since Pi exposes no `pi.unregisterCommand` and still reports a
//        name a later pass dropped from the registry (test 4);
//  - #surviving-name-re-ownership: a name whose `.theta` still resolves in the
//    re-bind pass is RE-OWNED — a SECOND `pi.registerCommand` rebinds
//    `/<name>` to the new generation's drain-gated handler over the new
//    generation's `ThetaRegistry`, and NO collision diagnostic is emitted for
//    it (tests 1 and 2). A name whose `.theta` no longer resolves is NOT
//    re-registered: its handler stays bound to the superseded drained registry
//    and keeps failing safe on arm (b) with the `"theta /<name>: extension
//    shutting down"` note, exactly as #repeat-start-supersession pins (test 5).
//
// Tests in this file:
//  1. RED at HEAD — Trigger A, start-after-shutdown rebind, `greet.theta` KEPT.
//  2. RED at HEAD — Trigger B, shutdown-less repeat start, `greet.theta` KEPT
//     (plus the bug-0021 repeat-start note, which must still fire exactly once).
//  3. GREEN at HEAD and after — source-conditioning negative control: a
//     genuine `source: "prompt"` entry named `greet` still drops the
//     re-discovered theta and still emits the collision diagnostic.
//  4. RED at HEAD — the ledger discriminator (D3): `/greet` registered by
//     generation 1, dropped from the LIVE registry by a hot-reload collision,
//     then re-owned across a re-bind.
//  5. GREEN at HEAD and after — removed-name control: a deleted `.theta` is
//     not re-registered and keeps answering the arm-(b) shutting-down note.
//  6. MIXED at HEAD — the ledger-MEMBERSHIP control (the other half of D3): a
//     FOREIGN `source: "extension"` entry — a sibling extension's command this
//     instance never passed to `pi.registerCommand` — is not in the ledger, so
//     it still drops the theta of that name and still emits the collision
//     diagnostic, on the FIRST `session_start` pass and again across a
//     re-bind. Those drop arms — (a)/(b) on the first pass, (d)/(e) across the
//     re-bind — are GREEN at HEAD and after; arm (c), the re-ownership of this
//     instance's own surviving `/second` across that same re-bind, is RED at
//     HEAD (1d516897). Red against any exclusion keyed on the `"extension"` source
//     alone (e.g. one derived from the current `pi.getCommands()` snapshot),
//     which would swallow the sibling's entry and disable theta-vs-foreign
//     collision detection outright.
//
// Harness: mirrors tests/double-session-start-supersession.test.ts (the real
// `createThetaExtension` + `composeExtensionInstance` over a mkdtemp temp-dir
// workspace, hand-rolled pi/ctx fakes, ONE shared `FakeClock`, one COUNTING
// `FakeFileWatcher` per compose, `fireSessionStart`/`fireSessionShutdown`,
// `dispatchRegistered`, `waitFor`) with ONE bug-0024 delta: `pi.getCommands()`
// returns the extension-sourced registered names PLUS an injectable
// `extraCommands` list of entries carrying an arbitrary `source`, so a test can
// plant and remove a genuine Pi-owned `"prompt"` entry between deliveries. The
// hot-reload pass of test 4 is driven the way
// tests/watcher-hot-reload-integration.test.ts drives it: a `FakeFileWatcher`
// emit plus a `FakeClock` advance across `RELOAD_DEBOUNCE_WINDOW_MS`.

import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  unlinkSync,
  existsSync,
} from "node:fs";
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
import { FakeClock } from "./helpers/fake-clock";
import { FakeFileWatcher } from "./helpers/fake-file-watcher";
import type {
  FileWatchEvent,
  OnWatchTerminate,
  Unsubscribe,
} from "../src/seams/file-watcher";

/**
 * The `theta/load/cross-format-collision` code as it appears in a rendered
 * system note (`formatDiagnostic`: `<code>: <message>`). Deliberately a string
 * literal rather than a `src/**` import — the code constant is module-private
 * to `src/discovery/discovery-walk.ts`, and the suite asserts on the OPERATOR
 * observable (note content), not on an internal.
 */
const COLLISION_CODE = "theta/load/cross-format-collision";

/** The pinned bug-0021 repeat-start diagnostic content (registration-steps.md step 5). */
const REPEAT_START_NOTE =
  "theta: repeat session_start without session_shutdown; superseding prior hot-reload generation";

/** Prefix filter for repeat-start notes — content-shape agnostic. */
const REPEAT_START_NOTE_PREFIX = "theta: repeat session_start";

/** The drain-state arm-(b) note for `/greet` (drain-state.ts `shuttingDownNote`). */
const GREET_SHUTTING_DOWN_NOTE = "theta /greet: extension shutting down";

const GREET_THETA = ["---", "mode: prompt", "---", "@`hi`", ""].join("\n");
const SECOND_THETA = ["---", "mode: prompt", "---", "@`yo`", ""].join("\n");

/**
 * Bound (real ms) on awaiting a dispatched slash handler. A re-owned `/greet`
 * enters a REAL prompt-mode run against the minimal fake command ctx, whose
 * settling this suite must not depend on — the note assertions carry the
 * discrimination either way.
 */
const DISPATCH_SETTLE_CAP_MS = 1200;

/**
 * A per-compose counting watcher: `attached` makes the step-5 arm/detach
 * lifecycle of ONE compose generation observable, and holding the instance per
 * generation is what lets test 4 drive generation 1's hot-reload pass.
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

/** One `pi.getCommands()` entry (the fake's `SlashCommandInfo` shape). */
interface FakeCommandInfo {
  readonly name: string;
  readonly source: string;
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
   * The SEQUENCE of `pi.registerCommand` names, in call order — the
   * re-ownership witness (a Map alone cannot show a re-register).
   */
  readonly registeredNames: string[];
  readonly notes: RecordedNote[];
  /**
   * Bug-0024 delta: extra `pi.getCommands()` entries carrying an ARBITRARY
   * `source`, planted and removed by a test between deliveries. `getCommands`
   * returns the extension-sourced registered names (what Pi reports back for
   * this instance's own registrations) concatenated with these, so a test can
   * model a genuine Pi-owned `"prompt"` template appearing under a name the
   * instance already registered.
   */
  readonly extraCommands: FakeCommandInfo[];
  fireSessionStart(): Promise<void>;
  fireSessionShutdown(): Promise<void>;
}

function makeHarness(cwd: string): Harness {
  const commands = new Map<string, unknown>();
  const registeredNames: string[] = [];
  const notes: RecordedNote[] = [];
  const extraCommands: FakeCommandInfo[] = [];
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
    // Faithful to the host at the pin (`dist/core/agent-session.js:1826–1833`):
    // every command an extension registered comes back as `source: "extension"`,
    // indistinguishable from a sibling extension's — which is exactly why
    // PIC-69's exclusion has to key on the instance's own ledger.
    getCommands: (): FakeCommandInfo[] => [
      ...[...commands.keys()].map((name) => ({ name, source: "extension" })),
      ...extraCommands,
    ],
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
    sendUserMessage: (): void => {},
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
    extraCommands,
    fireSessionStart: () => fire("session_start", { type: "session_start" }),
    // `reason: "exit"` — an always-tear-down reason, so the V9r session-swap
    // tripwire stays un-armed and cannot confound the post-rebind dispatch
    // discriminators below.
    fireSessionShutdown: () =>
      fire("session_shutdown", { type: "session_shutdown", reason: "exit" }),
  };
}

/** One booted extension instance with per-compose watcher/wiring capture. */
interface Boot {
  readonly harness: Harness;
  /** The ONE FakeClock shared by every compose (drives the debounce boundary). */
  readonly clock: FakeClock;
  /** Per-compose counting watchers, indexed by compose START order. */
  readonly watchers: CountingFakeFileWatcher[];
  /** Per-compose wirings, indexed by compose START order (set at compose settle). */
  readonly wirings: (ExtensionInstanceWiring | undefined)[];
}

function makeBoot(workspace: string): Boot {
  const harness = makeHarness(workspace);
  const clock = new FakeClock();
  const watchers: CountingFakeFileWatcher[] = [];
  const wirings: (ExtensionInstanceWiring | undefined)[] = [];

  const deps: ThetaExtensionDeps = {
    fixtures: [],
    // The double must mirror the production default export's wiring
    // (src/extension/factory.ts) — forwarding the own-registration ledger as
    // the 5th argument — or the pass under test runs without the ledger.
    composeInstance: async (pi, ctx, ownRegisteredNames) => {
      // One NEW counting watcher per compose call, indexed by START order
      // (created synchronously at dep entry, before any await): generations are
      // distinguishable only by their per-compose resources.
      const index = watchers.length;
      const watcher = new CountingFakeFileWatcher();
      watchers.push(watcher);
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

  return { harness, clock, watchers, wirings };
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

/**
 * Invoke the pi-registered handler for `/<name>` and await its settling,
 * bounded by `DISPATCH_SETTLE_CAP_MS`. The recorded NOTES are the
 * discriminator; the returned outcome is asserted only where the contract
 * pins it.
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

/**
 * Let any LIVE dispatch (a re-owned `/greet` enters a real prompt-mode run)
 * drain out of every generation's in-flight registry before the test ends. A
 * fail-safe short-circuit dispatch registers no entry, so this settles
 * immediately on the arm-(b) path.
 */
async function settleInvocations(b: Boot): Promise<void> {
  await waitFor(
    () =>
      b.wirings.every(
        (wiring) => wiring === undefined || wiring.activeInvocations.size() === 0,
      ),
    "the dispatched invocation entries to settle",
  );
}

/** All notes carrying a `theta/load/cross-format-collision` diagnostic. */
function collisionNotes(harness: Harness, since = 0): readonly RecordedNote[] {
  return harness.notes.slice(since).filter((n) => n.content.includes(COLLISION_CODE));
}

/** All notes carrying the pinned repeat-start diagnostic prefix. */
function repeatStartNotes(harness: Harness): readonly RecordedNote[] {
  return harness.notes.filter((n) => n.content.startsWith(REPEAT_START_NOTE_PREFIX));
}

/** All arm-(b) shutting-down notes for `/greet`. */
function greetShuttingDownNotes(harness: Harness): readonly RecordedNote[] {
  return harness.notes.filter((n) => n.content === GREET_SHUTTING_DOWN_NOTE);
}

/** Fail loudly (never skip) if the surviving-name precondition is not on disk. */
function assertThetaOnDisk(thetaDir: string, file: string): void {
  if (!existsSync(join(thetaDir, file))) {
    throw new Error(
      `precondition: ${file} must still be on disk for the surviving-name re-bind pass`,
    );
  }
}

describe("bug 0024 — re-bind self-collision (registration-steps.md PIC-69 + #surviving-name-re-ownership)", () => {
  let workspace: string;
  let thetaDir: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "theta-bug0024-"));
    thetaDir = join(workspace, ".pi", "theta");
    mkdirSync(thetaDir, { recursive: true });
    writeFileSync(join(thetaDir, "greet.theta"), GREET_THETA, "utf8");
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Test 1 — Trigger A (RED at HEAD): start-after-shutdown rebind, the
  // surviving `.theta` kept on disk.
  // -------------------------------------------------------------------------

  it("Trigger A (RED at HEAD): a start-after-shutdown rebind RE-OWNS the surviving /greet — a second registerCommand, no collision diagnostic, and no shutting-down note at dispatch", async () => {
    const b = makeBoot(workspace);

    // Generation 1: normal boot registers `/greet` exactly once.
    await b.harness.fireSessionStart();
    expect(b.harness.commands.has("greet")).toBe(true);
    expect(b.harness.registeredNames.filter((name) => name === "greet")).toHaveLength(1);

    // A COMPLETED shutdown drains generation 1's registry (Pi keeps the
    // `/greet` registration — there is no `pi.unregisterCommand`).
    await b.harness.fireSessionShutdown();

    // The surviving-name precondition: `greet.theta` is still on disk, so the
    // rebind pass's discovery re-resolves it.
    assertThetaOnDisk(thetaDir, "greet.theta");
    await b.harness.fireSessionStart();

    // (a) #surviving-name-re-ownership: the rebind pass re-registers the
    // surviving name, rebinding the live `/greet` to the new generation's
    // drain-gated handler. At HEAD `excludeOwnedNames` is `undefined` on this
    // pass, generation 1's own `source: "extension"` entry reads as a foreign
    // collision, and the SEQUENCE stays at one.
    expect.soft(
      b.harness.registeredNames.filter((name) => name === "greet"),
      "(a) the rebind pass re-owns the surviving /greet: a SECOND registerCommand call",
    ).toHaveLength(2);

    // (b) PIC-69: an own prior registration is not a collision, so no
    // `theta/load/cross-format-collision` diagnostic is emitted for it (the
    // one at HEAD misdescribes its own cause — "Pi-owned command 'greet'
    // survives").
    expect.soft(
      collisionNotes(b.harness).map((note) => note.content),
      "(b) zero theta/load/cross-format-collision notes for a re-owned name",
    ).toStrictEqual([]);

    // (c) The operator-visible consequence: dispatching the re-owned `/greet`
    // on this LIVE session runs against generation 2's undrained registry —
    // arm (a) — never the arm-(b) `extension shutting down` note.
    const shuttingDownBefore = greetShuttingDownNotes(b.harness).length;
    await dispatchRegistered(b.harness, "greet");
    expect.soft(
      greetShuttingDownNotes(b.harness).length - shuttingDownBefore,
      "(c) a post-rebind /greet dispatch must NOT answer 'theta /greet: extension shutting down'",
    ).toBe(0);

    await settleInvocations(b);
  }, 15000);

  // -------------------------------------------------------------------------
  // Test 2 — Trigger B (RED at HEAD): shutdown-less repeat start
  // (#repeat-start-supersession), the surviving `.theta` kept on disk.
  // -------------------------------------------------------------------------

  it("Trigger B (RED at HEAD): a shutdown-less repeat session_start RE-OWNS the surviving /greet — second registerCommand, no collision diagnostic, no shutting-down note — and still emits exactly one repeat-start note", async () => {
    const b = makeBoot(workspace);

    await b.harness.fireSessionStart();
    expect(b.harness.commands.has("greet")).toBe(true);
    expect(b.harness.registeredNames.filter((name) => name === "greet")).toHaveLength(1);

    // No intervening `session_shutdown`: this delivery is the bug-0021
    // supersession pass, which drains the outgoing generation's registry.
    assertThetaOnDisk(thetaDir, "greet.theta");
    await b.harness.fireSessionStart();

    // (a) #surviving-name-re-ownership on the supersession pass.
    expect.soft(
      b.harness.registeredNames.filter((name) => name === "greet"),
      "(a) the supersession pass re-owns the surviving /greet: a SECOND registerCommand call",
    ).toHaveLength(2);

    // (b) No collision diagnostic for the re-owned name.
    expect.soft(
      collisionNotes(b.harness).map((note) => note.content),
      "(b) zero theta/load/cross-format-collision notes for a re-owned name",
    ).toStrictEqual([]);

    // (c) The re-owned `/greet` dispatches against generation 2's undrained
    // registry — the supersession's drain of generation 1 no longer reaches it
    // because the name was re-bound.
    const shuttingDownBefore = greetShuttingDownNotes(b.harness).length;
    await dispatchRegistered(b.harness, "greet");
    expect.soft(
      greetShuttingDownNotes(b.harness).length - shuttingDownBefore,
      "(c) a post-supersession /greet dispatch must NOT answer 'theta /greet: extension shutting down'",
    ).toBe(0);

    // (d) UNCHANGED by this fix (bug 0021, registration-steps.md step 5): the
    // shutdown-less repeat delivery still emits exactly ONE pinned
    // repeat-start note. Re-ownership must not perturb it.
    const repeats = repeatStartNotes(b.harness);
    expect.soft(
      repeats,
      "(d) exactly one repeat-start note per shutdown-less repeat delivery (unchanged)",
    ).toHaveLength(1);
    for (const note of repeats) {
      expect.soft(note.content, "(d) pinned repeat-start content").toBe(REPEAT_START_NOTE);
      expect.soft(note.customType, "(d) theta-system-note channel").toBe("theta-system-note");
      expect.soft(note.triggerTurn, "(d) triggerTurn:false").toBe(false);
    }

    await settleInvocations(b);
  }, 15000);

  // -------------------------------------------------------------------------
  // Test 3 — negative control (GREEN at HEAD and after): PIC-69's exclusion is
  // SOURCE-CONDITIONED, never name-only. A genuine Pi-owned `"prompt"` entry
  // of the same name still wins the cross-format collision.
  // -------------------------------------------------------------------------

  it("source-conditioning control (GREEN at HEAD and after): a genuine source:\"prompt\" entry named greet still drops the re-discovered theta and still emits the collision diagnostic", async () => {
    const b = makeBoot(workspace);

    await b.harness.fireSessionStart();
    expect(b.harness.registeredNames.filter((name) => name === "greet")).toHaveLength(1);
    await b.harness.fireSessionShutdown();

    // Plant a genuine Pi-owned prompt template named `greet` BETWEEN the two
    // deliveries — the "newly-appeared `.md` template" case step 3 pins. This
    // entry carries `source: "prompt"`, so PIC-69's exclusion (conditioned on
    // `source: "extension"` AND own-ledger membership) MUST NOT hide it.
    b.harness.extraCommands.push({ name: "greet", source: "prompt" });

    assertThetaOnDisk(thetaDir, "greet.theta");
    const notesBeforeRebind = b.harness.notes.length;
    await b.harness.fireSessionStart();

    // The re-discovered greet.theta still DROPS: no second registerCommand.
    expect(
      b.harness.registeredNames.filter((name) => name === "greet"),
      "a genuine prompt-sourced collision still drops the theta — no re-ownership",
    ).toHaveLength(1);

    // ...and the collision diagnostic IS emitted, on the note channel.
    const collisions = collisionNotes(b.harness, notesBeforeRebind);
    expect(
      collisions.length,
      "the prompt-vs-theta collision still emits theta/load/cross-format-collision",
    ).toBeGreaterThanOrEqual(1);
    expect(collisions.some((note) => note.content.includes("slash name 'greet'"))).toBe(true);
    expect(collisions[0]?.customType).toBe("theta-system-note");

    // The dropped name stays bound to the superseded drained registry and
    // fails safe on arm (b) — the drop's dispatch contract is unchanged.
    const shuttingDownBefore = greetShuttingDownNotes(b.harness).length;
    const outcome = await dispatchRegistered(b.harness, "greet");
    expect(greetShuttingDownNotes(b.harness).length - shuttingDownBefore).toBe(1);
    expect(outcome).toBe("resolved");
  }, 15000);

  // -------------------------------------------------------------------------
  // Test 4 — the D3 LEDGER discriminator (RED at HEAD): a name registered by
  // generation 1 and later dropped from the LIVE registry by a hot-reload
  // collision is still one of "our own names" at the next re-bind, because Pi
  // still holds the registration (no `pi.unregisterCommand`).
  //
  // This test FAILS if the own-name set is `liveRegistry.snapshot().keys()`
  // instead of the instance's registration LEDGER: after the reload drop,
  // `greet` is absent from the live registry, so a snapshot-keyed exclusion
  // would not exclude Pi's surviving `{name:"greet", source:"extension"}`
  // entry, the rebind would self-collide again, and assertion (b) below would
  // stay red. PIC-69 pins the ledger explicitly for exactly this case.
  // -------------------------------------------------------------------------

  it("ledger discriminator (RED at HEAD): a name dropped from the live registry by a hot-reload collision is still re-owned across a re-bind — the own-name set is the registration LEDGER, not the live registry's keys", async () => {
    const b = makeBoot(workspace);

    // Generation 1: `/greet` registered and live in the registry.
    await b.harness.fireSessionStart();
    expect(b.harness.registeredNames.filter((name) => name === "greet")).toHaveLength(1);
    expect(wiringAt(b, 0).registry.get("greet")).toBeDefined();

    // Plant a genuine Pi-owned prompt template named `greet` (a settings
    // reload / extension activation in production), plus a second theta on
    // disk. `second.theta` never collides, so its swap is the settle
    // observable in BOTH worlds — `greet`'s fate is exactly what is measured.
    b.harness.extraCommands.push({ name: "greet", source: "prompt" });
    writeFileSync(join(thetaDir, "second.theta"), SECOND_THETA, "utf8");

    // Drive generation 1's hot-reload pass the way
    // tests/watcher-hot-reload-integration.test.ts does: watcher emit + a
    // FakeClock advance across the debounce boundary.
    watcherAt(b, 0).emit({ kind: "change", path: join(thetaDir, "second.theta") });
    b.clock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await waitFor(
      () => wiringAt(b, 0).registry.get("second") !== undefined,
      "the hot-reload swap to publish /second",
    );

    // (a) PIC-69's source condition on the HOT-RELOAD pass: the planted
    // `source: "prompt"` entry is NOT excluded, so the reload drops `greet`
    // from the live registry. At HEAD the reload's exclusion set is
    // `new Set(registry.snapshot().keys())` tested BEFORE the source filter
    // (`readPiOwnedCommands`), so the name-keyed skip hides the prompt entry
    // and `greet` survives — this arm is red at HEAD for the same PIC-69
    // clause, and it is the state assertion (b) needs.
    expect.soft(
      wiringAt(b, 0).registry.get("greet"),
      "(a) the hot-reload pass drops /greet against a genuine source:'prompt' entry (source-conditioned exclusion)",
    ).toBeUndefined();

    // The prompt template goes away again. `greet` is now a name Pi STILL
    // reports back from this instance (no unregister) that the LIVE registry
    // no longer contains — the exact gap between the two candidate own-name
    // sets (D3 option A vs option B).
    b.harness.extraCommands.length = 0;

    const registeredBeforeRebind = b.harness.registeredNames.length;
    const notesBeforeRebind = b.harness.notes.length;
    assertThetaOnDisk(thetaDir, "greet.theta");
    await b.harness.fireSessionStart();
    const registeredByRebind = b.harness.registeredNames.slice(registeredBeforeRebind);

    // (b) The ledger clause: `greet` was passed to `pi.registerCommand` by
    // generation 1, so the re-bind pass excludes Pi's surviving
    // `source: "extension"` entry for it and RE-OWNS the name. The slice is
    // taken from the rebind delivery only — the reload's own `reRegister`
    // cannot satisfy this assertion.
    expect.soft(
      registeredByRebind,
      "(b) the re-bind pass re-owns /greet from the registration LEDGER (not the live registry's keys)",
    ).toContain("greet");

    // (c) ...and no collision diagnostic is emitted by that rebind pass.
    expect.soft(
      collisionNotes(b.harness, notesBeforeRebind).map((note) => note.content),
      "(c) the re-bind pass emits zero cross-format-collision notes once the prompt entry is gone",
    ).toStrictEqual([]);
  }, 15000);

  // -------------------------------------------------------------------------
  // Test 5 — removed-name control (GREEN at HEAD and after): D4 — the drain
  // stays. A name whose `.theta` no longer resolves is NOT re-registered and
  // keeps the spec-pinned arm-(b) note (#repeat-start-supersession).
  // -------------------------------------------------------------------------

  it("removed-name control (GREEN at HEAD and after): a .theta deleted before the re-bind is not re-registered and a post-rebind dispatch still answers the arm-(b) shutting-down note", async () => {
    const b = makeBoot(workspace);

    await b.harness.fireSessionStart();
    expect(b.harness.registeredNames.filter((name) => name === "greet")).toHaveLength(1);
    await b.harness.fireSessionShutdown();

    // `greet.theta` is GONE before the rebind; `second.theta` appears, so the
    // rebind pass provably ran a real registration pass (a vacuous "nothing
    // happened" cannot pass this test).
    unlinkSync(join(thetaDir, "greet.theta"));
    writeFileSync(join(thetaDir, "second.theta"), SECOND_THETA, "utf8");
    await b.harness.fireSessionStart();

    expect(b.harness.commands.has("second"), "the rebind pass registered /second").toBe(true);
    expect(
      b.harness.registeredNames.filter((name) => name === "greet"),
      "a name whose .theta no longer resolves is NOT re-registered",
    ).toHaveLength(1);

    // Its handler is still bound to the superseded, drained registry: arm (b).
    const shuttingDownBefore = greetShuttingDownNotes(b.harness).length;
    const outcome = await dispatchRegistered(b.harness, "greet");
    const shuttingDown = greetShuttingDownNotes(b.harness);
    expect(shuttingDown.length - shuttingDownBefore).toBe(1);
    expect(shuttingDown[0]?.customType).toBe("theta-system-note");
    expect(shuttingDown[0]?.triggerTurn).toBe(false);
    expect(outcome).toBe("resolved");
  }, 15000);

  // -------------------------------------------------------------------------
  // Test 6 — the ledger-MEMBERSHIP control. PIC-69 excludes an entry that
  // carries `source: "extension"` AND bears a name THIS INSTANCE passed to
  // `pi.registerCommand`; the two conditions are conjunctive. A sibling
  // extension's command satisfies only the first, so it stays in the collision
  // source set and the theta of that name still loses asymmetrically — on the
  // first `session_start` pass, where the ledger is empty, and again on every
  // later pass, where the ledger holds only this instance's own names.
  //
  // This test FAILS if the own-name set is derived from the `pi.getCommands()`
  // snapshot ("every name currently reported as `source: \"extension\"`")
  // rather than from the ledger: the sibling's entry would then be excluded
  // too, `greet` would register alongside it, and arms (a)/(b)/(d) below would
  // go red. PIC-69's accepted sibling-indistinguishability limitation is
  // narrow — it reaches only a name the instance ALSO registered — and does
  // not license blanket suppression.
  // -------------------------------------------------------------------------

  it("ledger-membership control: a FOREIGN source:\"extension\" entry this instance never registered still drops the theta and still emits the collision diagnostic — on the first session_start and again across a re-bind", async () => {
    const b = makeBoot(workspace);

    // A sibling extension's command, planted BEFORE the first delivery: it
    // carries the same `source: "extension"` Pi reports for this instance's
    // own registrations, but `greet` never reaches this instance's
    // `pi.registerCommand`, so it is absent from the ledger.
    b.harness.extraCommands.push({ name: "greet", source: "extension" });
    // A never-colliding survivor: each pass provably ran a real registration
    // pass, so a vacuous "nothing happened" cannot satisfy the drop arms.
    writeFileSync(join(thetaDir, "second.theta"), SECOND_THETA, "utf8");

    await b.harness.fireSessionStart();

    expect(
      b.harness.commands.has("second"),
      "precondition: the first pass ran a real registration pass",
    ).toBe(true);

    // (a) FIRST `session_start` pass — the ledger is empty here, so nothing is
    // excluded and the foreign entry wins the cross-format collision.
    expect.soft(
      b.harness.registeredNames.filter((name) => name === "greet"),
      "(a) a foreign extension-sourced /greet drops the theta on the first pass",
    ).toHaveLength(0);
    expect.soft(b.harness.commands.has("greet")).toBe(false);

    // (b) ...and the drop is reported on the note channel.
    const firstPassCollisions = collisionNotes(b.harness);
    expect.soft(
      firstPassCollisions.some((note) => note.content.includes("slash name 'greet'")),
      "(b) the first pass emits theta/load/cross-format-collision for /greet",
    ).toBe(true);
    expect.soft(firstPassCollisions[0]?.customType).toBe("theta-system-note");

    // Re-bind (start-after-shutdown, Trigger A): both `.theta` files are still
    // on disk and the sibling's command is still reported by Pi.
    await b.harness.fireSessionShutdown();
    assertThetaOnDisk(thetaDir, "greet.theta");
    assertThetaOnDisk(thetaDir, "second.theta");
    const registeredBeforeRebind = b.harness.registeredNames.length;
    const notesBeforeRebind = b.harness.notes.length;
    await b.harness.fireSessionStart();
    const registeredByRebind = b.harness.registeredNames.slice(registeredBeforeRebind);

    // (c) The ledger now holds `second` (this instance registered it) but never
    // `greet`, so the rebind pass re-owns the former and still drops the
    // latter — the two halves of PIC-69's conjunction, measured in one pass.
    expect.soft(
      registeredByRebind,
      "(c) the rebind pass ran a real registration pass and re-owned its own /second",
    ).toContain("second");
    expect.soft(
      registeredByRebind,
      "(d) the foreign extension-sourced /greet still drops across the re-bind",
    ).not.toContain("greet");
    expect.soft(b.harness.commands.has("greet")).toBe(false);

    // (e) ...and the rebind pass reports that drop too.
    expect.soft(
      collisionNotes(b.harness, notesBeforeRebind).some((note) =>
        note.content.includes("slash name 'greet'"),
      ),
      "(e) the rebind pass emits theta/load/cross-format-collision for /greet",
    ).toBe(true);
  }, 15000);
});
