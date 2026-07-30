// Bug 0029 — RED offline witness suite, written BEFORE the fix. The
// spec-correct assertions in tests 1 and 2 MUST fail at HEAD (5f0ca9cd,
// 0.39.0); the control (test 3) must pass at HEAD *and* after the fix, proving
// every leak discriminator is live rather than vacuous; test 4 is a post-fix
// guard control (see its classification note below).
//
// Defect (docs/bugs/0029-throwing-supersession-detach-swallowed-watcher-rearmed.md),
// two elements at one call site:
//
//  1. `HotReloadHandle.detach()` (`src/extension/hot-reload.ts:298–307`) runs
//     its ONE fallible step FIRST — `unsub()` at `:303`, in production a
//     `chokidar` `close()` reached through `src/seams/pi-file-watcher.ts:50` —
//     so a synchronous throw skips all three infallible containment steps
//     behind it: `debouncer.cancel()` (`:304`), `tornDown = true` (`:305`),
//     `debouncer.markTornDown()` (`:306`). Those are exactly the two guards
//     the pinned no-superseded-rebuild clause rests on (`runReload`'s
//     `tornDown` short-circuit, `hot-reload.ts:184–186`, and
//     `ReloadDebouncer.#onWindowClosed`'s torn-down guard,
//     `reload-debounce.ts:167–169`), so a debounce window already PENDING at
//     supersession time still drives one full superseded-generation reload
//     pass: rediscover, rebuild, publish into the drained generation-1
//     registry, `pi.registerCommand` against handlers bound to that drained
//     registry, and a `theta-system-note` structural-change note. The same
//     module's `quiesceOnStaleCtx` (`:170–172`) already orders the identical
//     acts containment-first.
//  2. The factory swallows the throw with ZERO evidence
//     (`src/extension/factory.ts:712–724`): the handle slot is cleared before
//     the attempt (`:713`, so the leaked handle is unreachable forever) and the
//     broad catch body is `void e;` (`:723`) — no diagnostic constructed, no
//     system note, no stderr line. The `session_shutdown` teardown routes the
//     IDENTICAL `handle?.detach()` call (`factory.ts` sub-step-4 adapter)
//     through **Per-step isolation**, which emits one
//     `theta/host/session-shutdown-teardown-step-failed`; the supersession
//     path emits nothing.
//
// Spec encoded by the red assertions:
//  - registration-steps.md#repeat-start-supersession (MUST, no carve-out for a
//    throwing detach): the supersession detach closes "that generation's
//    watcher and quiescing its debouncer, so no superseded-generation reload
//    can rebuild or re-register after the supersession" — the same no-rebuild
//    posture PIC-57 pins for shutdown;
//  - PIC-68 premises the teardown's latest-only sub-steps 1/4 on "each
//    superseded generation's registry was already drained and its watcher
//    already detached at supersession time"; a throwing detach falsifies
//    "already detached" and the nulled slot leaves no compensating path;
//  - the spec gap element 2 closes: the supersession detach failure gets the
//    same catch-and-diagnose posture **Per-step isolation** mandates for the
//    identical call on the teardown path (bug 0029 §Fix item 2, triage D1).
//
// Pinned post-fix contract (the fix implements exactly this; asserted here on
// observables, never internals):
//  1. CONTAINMENT-FIRST `detach()` for BOTH callers (triage D2) — the body
//     collapses to `tornDown = true; debouncer.markTornDown(); unsub();`. A
//     throwing unsub then strands only the OS-level watcher handles: a window
//     pending across the supersession boundary feeds a torn-down debouncer, so
//     NO superseded-generation reload runs — generation 1's registry never
//     gains a newly-planted name, no new `pi.registerCommand` fires, and no
//     structural-change note is sent (test 1).
//  2. EVIDENCE AT THE SWALLOW (triage D1) — exactly ONE diagnostic under the
//     new code `theta/host/session-start-supersession-detach-failed` (`W`,
//     `runtime`), routed through `deps.emitDiagnostic` (the seam is wired in
//     production since bug 0023: the default export supplies `sink.emit` from
//     `createBootstrapDiagnosticSink`), with a stable `details.call` and a
//     `details.error` carrying the underlying-error string (test 2).
//  3. The emission MUST NOT abort the superseding pass: generation 2 still
//     publishes, registers, and arms — including when the sink itself throws
//     (the emission is defended by its own `try`/`catch` per
//     diagnostic-emission-isolation.md). Test 2's control arms and test 4.
//
// PROPOSED REGISTRY ROW (this suite's assertions pin it; the implementer mints
// the `docs/spec_topics/diagnostics/code-registry-host.md` row from it — the
// shape mirrors the sibling `theta/host/session-shutdown-teardown-step-failed`
// row at `code-registry-host.md:14`):
//
//   Code:     theta/host/session-start-supersession-detach-failed
//   Sev:      W      Phase: runtime
//   Message:  `session_start supersession detach failed at <call>: <error>`
//             (mirrors the sibling's
//              `session_shutdown teardown step <step> failed at <call>: <error>`)
//   details:  { call: <static call-site label>, error: <underlying-error string> }
//             — `call` is drawn from a closed one-member set,
//               `"hotReloadHandle.detach"` (the sibling's closed-label style;
//               no `step` field: the supersession pass has exactly one
//               fallible sub-step, so a `step` discriminator would carry no
//               information), and `error` is the
//               placeholder-rendering-b.md#underlying-error-coercion string
//               (`.message` when the throw is an object with a string
//               `.message`, else `String(error)`, else `"<unreadable>"`) —
//               the same coercion `session-shutdown-teardown-step-failed`'s
//               `details.error` carries.
//
// Tests in this file:
//  1. RED at HEAD — containment: a throwing seam unsub at supersession with one
//     debounce window PENDING across the boundary must fire no
//     superseded-generation reload pass.
//  2. RED at HEAD — evidence: exactly one supersession-detach diagnostic on the
//     injected `deps.emitDiagnostic` recorder (at HEAD the recorder stays
//     `[]` — nothing is even constructed). Its control arms (generation 2
//     publishes / registers / arms despite the throw) are GREEN at HEAD and
//     MUST stay green: that isolation intent is the bug-0021 fix's and the
//     0029 fix must not regress it.
//  3. GREEN at HEAD and after — the non-throwing control: the IDENTICAL pending
//     window under a normal (non-throwing) seam unsub fires no reload pass and
//     emits no supersession-detach diagnostic. Proves test 1's leak
//     discriminators and test 2's code filter are live, and that test 1's
//     assertion is reachable in the green direction.
//  4. POST-FIX GUARD CONTROL — a THROWING `emitDiagnostic` sink must not abort
//     the superseding pass. Cannot red at HEAD: the emission does not exist
//     yet, so the throwing sink is never reached and the test passes
//     vacuously. It becomes load-bearing the moment element 2 lands (an
//     undefended emission would turn the swallow into an escaping throw), and
//     its red direction is only provable against the fixed tree.
//
// Harness: mirrors tests/double-session-start-supersession.test.ts (the real
// `createThetaExtension` + `composeExtensionInstance` over a mkdtemp temp-dir
// workspace, hand-rolled pi/ctx fakes recording notes and registrations, ONE
// shared `FakeClock`, one per-compose watcher, `fireSessionStart`, an injected
// `deps.emitDiagnostic` recorder) with three bug-0029 deltas:
//  - the per-compose watcher can be made to model the PRODUCTION unsubscribe
//    shape (`pi-file-watcher.ts:44–51`): the first call flips its own `active`
//    guard and THEN throws synchronously (`EMFILE: synthetic chokidar close()
//    failure`), so every later call no-ops on the guard and the failed close is
//    never retried;
//  - the shared clock records every armed timer window, so a test can prove the
//    debounce window really was PENDING at the supersession boundary (without
//    it, test 1's post-fix green would be vacuous);
//  - the leaked-pass probe plants a `.theta` AFTER the supersession, so the
//    superseded pass's rediscovered name set is distinguishable from the live
//    generation's.
//
// Re-derived at HEAD (5f0ca9cd), NOT taken from the bug doc's 0.32.0 §Reproduction:
// with one window pending across the boundary the leaked pass yields
// `gen1 registry keys ["second","third"]` vs `gen2 ["second"]`, new
// `pi.registerCommand` names `["second","third"]`, and a
// `theta watcher: 3 file(s) added or removed…` note, ~20 ms after the window
// closes. The bug doc's recorded `theta/load/cross-format-collision` note no
// longer fires — bug 0024's fix (0.36.0) made the own-registration ledger
// FACTORY-scoped (PIC-69), so it spans generations and the leaked pass no
// longer misreads generation 2's own `/second` as a foreign survivor. Nothing
// in this file asserts that note.

import { mkdtempSync, mkdirSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
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
import type { TimerHandle } from "../src/seams/clock";
import type {
  FileWatchEvent,
  OnWatchTerminate,
  Unsubscribe,
} from "../src/seams/file-watcher";

/**
 * The new diagnostic code (triage D1 / §Fix item 2). Deliberately a string
 * literal rather than a `src/**` import: the RED-at-HEAD run executes against a
 * tree where the code does not exist yet, and the red must land on the
 * assertions, never on collection.
 */
const SUPERSESSION_DETACH_FAILED_CODE =
  "theta/host/session-start-supersession-detach-failed";

/** The proposed closed `details.call` label for the single fallible sub-step. */
const SUPERSESSION_DETACH_CALL_LABEL = "hotReloadHandle.detach";

/** The synthetic throw the seam unsubscribe raises (models a chokidar `close()` throw). */
const THROWING_UNSUB_MESSAGE = "EMFILE: synthetic chokidar close() failure";

/** The proposed message template, rendered for this suite's throw. */
const SUPERSESSION_DETACH_MESSAGE =
  `session_start supersession detach failed at ${SUPERSESSION_DETACH_CALL_LABEL}: ` +
  THROWING_UNSUB_MESSAGE;

/** Prefix of the watcher structural-change note (`reload-wiring.ts`). */
const STRUCTURAL_NOTE_PREFIX = "theta watcher: ";

const THETA_BODY = ["---", "mode: prompt", "---", "@`hi`", ""].join("\n");

/**
 * Real-ms bound on observing (or refuting) the leaked superseded-generation
 * pass after the pending window closes. The pass does real fs I/O; at HEAD it
 * publishes ~20 ms after the `FakeClock` advance, so the RED path returns fast
 * and only the post-fix GREEN path pays the full bound.
 */
const LEAK_OBSERVATION_BOUND_MS = 1200;

/**
 * A per-compose watcher whose returned `Unsubscribe` models the PRODUCTION
 * adapter shape (`src/seams/pi-file-watcher.ts:44–51`) when `throwOnUnsub` is
 * set: `active` is flipped to `false` (`:49`) BEFORE the fallible step (`:50`,
 * `void watcher.close()`), so a synchronous throw out of that step makes every
 * LATER unsub call a silent no-op on the guard and the failed close is never
 * retried. The seam's handler stays attached on the throwing path — the
 * embedder-supplied-`FileWatcher` shape (PIC-14 is an injectable seam), which
 * is also the strictly weaker precondition for this suite: test 1's leaked pass
 * is driven by the PENDING WINDOW, not by post-throw delivery, so it reproduces
 * on the shipped chokidar path too (where `closed = true` and
 * `removeAllListeners()` have already run when the throw escapes).
 */
class ProductionShapeFakeFileWatcher extends FakeFileWatcher {
  watchCalls = 0;
  attached = false;
  /** Total calls to the returned `Unsubscribe` (guard-suppressed ones included). */
  unsubCalls = 0;
  /** Calls that actually reached the fallible step and threw. */
  unsubThrows = 0;
  throwOnUnsub = false;

  override watch(
    roots: readonly string[],
    handler: (event: FileWatchEvent) => void,
    onTerminate?: OnWatchTerminate,
  ): Unsubscribe {
    this.watchCalls += 1;
    this.attached = true;
    const inner = super.watch(roots, handler, onTerminate);
    let active = true;
    return () => {
      this.unsubCalls += 1;
      // `pi-file-watcher.ts:48–49`: the idempotence guard, flipped ahead of the
      // fallible close.
      if (!active) return;
      active = false;
      if (this.throwOnUnsub) {
        this.unsubThrows += 1;
        throw new Error(THROWING_UNSUB_MESSAGE);
      }
      this.attached = false;
      inner();
    };
  }
}

/**
 * The one shared `FakeClock`, recording every armed timer window so a test can
 * prove the debounce window was PENDING at the supersession boundary. Without
 * that proof test 1's post-fix green would be indistinguishable from a window
 * that was never armed at all.
 */
class RecordingFakeClock extends FakeClock {
  readonly armedWindows: number[] = [];

  override setTimeout(fn: () => void, ms: number): TimerHandle {
    this.armedWindows.push(ms);
    return super.setTimeout(fn, ms);
  }
}

/** A recorded `pi.sendMessage` call (the `theta-system-note` channel). */
interface RecordedNote {
  readonly customType: string;
  readonly content: string;
}

interface Harness {
  readonly pi: ExtensionAPI;
  readonly commands: Map<string, unknown>;
  /** The SEQUENCE of `pi.registerCommand` names, in call order. */
  readonly registeredNames: string[];
  readonly notes: RecordedNote[];
  fireSessionStart(): Promise<void>;
}

function makeHarness(cwd: string): Harness {
  const commands = new Map<string, unknown>();
  const registeredNames: string[] = [];
  const notes: RecordedNote[] = [];
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
    sendMessage: (message: { customType: string; content: string }): void => {
      notes.push({ customType: message.customType, content: message.content });
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
    commands,
    registeredNames,
    notes,
    fireSessionStart: () => fire("session_start", { type: "session_start" }),
  };
}

interface Boot {
  readonly harness: Harness;
  /** The ONE shared, window-recording `FakeClock`. */
  readonly clock: RecordingFakeClock;
  /** Per-compose watchers, indexed by compose START order. */
  readonly watchers: ProductionShapeFakeFileWatcher[];
  /** Per-compose wirings, indexed by compose START order. */
  readonly wirings: (ExtensionInstanceWiring | undefined)[];
  /** Everything the injected `deps.emitDiagnostic` seam received. */
  readonly diagnostics: Diagnostic[];
}

interface BootOptions {
  /**
   * Compose index (START order) whose watcher's `Unsubscribe` throws, or
   * `"none"` for a tree where every detach succeeds. REQUIRED — no default, so
   * a test cannot silently boot a non-throwing tree while asserting on a throw.
   */
  readonly throwingUnsubAt: number | "none";
  /** Make the injected `emitDiagnostic` recorder itself throw (test 4). */
  readonly throwingSink?: boolean;
}

function makeBoot(workspace: string, options: BootOptions): Boot {
  const harness = makeHarness(workspace);
  const clock = new RecordingFakeClock();
  const watchers: ProductionShapeFakeFileWatcher[] = [];
  const wirings: (ExtensionInstanceWiring | undefined)[] = [];
  const diagnostics: Diagnostic[] = [];
  const throwingUnsubAt = options.throwingUnsubAt;

  const deps: ThetaExtensionDeps = {
    fixtures: [],
    // The bug-0023 seam the fix routes its new diagnostic through. Production
    // supplies `sink.emit` here (`factory.ts` default export); the test injects
    // a recorder, exactly like tests/extension-bootstrap-failures.test.ts.
    emitDiagnostic: (d: Diagnostic): void => {
      diagnostics.push(d);
      if (options.throwingSink === true) {
        throw new Error("synthetic emitDiagnostic sink failure");
      }
    },
    // Mirrors the production default export's wiring: forward the
    // own-registration ledger (bug 0024 / PIC-69) as the 5th argument, or the
    // pass under test runs without the ledger.
    composeInstance: async (pi, ctx, ownRegisteredNames) => {
      // One NEW watcher per compose call, indexed by START order (created
      // synchronously at dep entry, before any await): generations are
      // distinguishable only by their per-compose resources.
      const index = watchers.length;
      const watcher = new ProductionShapeFakeFileWatcher();
      watcher.throwOnUnsub = throwingUnsubAt === index;
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

  return { harness, clock, watchers, wirings, diagnostics };
}

/** Loud indexed access (noUncheckedIndexedAccess + fail-loudly on setup faults). */
function watcherAt(b: Boot, index: number): ProductionShapeFakeFileWatcher {
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll `cond` until true or the real-ms bound elapses. Returns whether it
 * became true. Used for the leaked-pass probe so the RED path (leak observed)
 * returns immediately and the GREEN path (post-fix: nothing ever happens) pays
 * a bounded wait instead of a race.
 */
async function becameTrueWithin(cond: () => boolean, boundMs: number): Promise<boolean> {
  const deadline = Date.now() + boundMs;
  for (;;) {
    if (cond()) return true;
    if (Date.now() >= deadline) return false;
    await sleep(5);
  }
}

/** One generation's registry key set, sorted — the publish-observable. */
function registryKeys(b: Boot, index: number): readonly string[] {
  return [...wiringAt(b, index).registry.snapshot().keys()].sort();
}

/** All notes carrying the watcher structural-change prefix. */
function structuralNotes(harness: Harness): readonly RecordedNote[] {
  return harness.notes.filter((n) => n.content.startsWith(STRUCTURAL_NOTE_PREFIX));
}

/** Every recorded diagnostic under the new supersession-detach code. */
function detachFailedDiagnostics(b: Boot): readonly Diagnostic[] {
  return b.diagnostics.filter((d) => d.code === SUPERSESSION_DETACH_FAILED_CODE);
}

/**
 * Boot one instance, arm ONE debounce window on generation 1, then supersede it
 * with a shutdown-less repeat `session_start` — the sequence both witnesses
 * share.
 *
 * Sequence: `session_start` #1 (generation 1 registers `/greet`, arms watcher 1)
 * → one `change` event delivered to generation 1's handler, clock NOT advanced
 * (the window is PENDING) → `greet.theta` unlinked, `second.theta` planted →
 * `session_start` #2 (the supersession: fold, drain, then the fallible
 * `detach()`).
 */
async function bootAndSupersedeWithPendingWindow(
  workspace: string,
  thetaDir: string,
  options: BootOptions,
): Promise<Boot> {
  const b = makeBoot(workspace, options);

  await b.harness.fireSessionStart();
  // Generation 1 is live: `/greet` registered, watcher 1 armed exactly once.
  expect(b.harness.commands.has("greet")).toBe(true);
  expect(watcherAt(b, 0).watchCalls).toBe(1);
  expect(watcherAt(b, 0).attached).toBe(true);

  // Arm ONE debounce window on generation 1 and leave it PENDING: the event is
  // delivered, the shared clock is NOT advanced. This is the state the skipped
  // `debouncer.cancel()` fails to clear.
  const armedBefore = b.clock.armedWindows.length;
  watcherAt(b, 0).emit({ kind: "change", path: join(thetaDir, "greet.theta") });
  // Fail loudly if the harness did not actually arm the window — otherwise a
  // post-fix green would be vacuous (nothing pending to contain).
  expect(
    b.clock.armedWindows.slice(armedBefore),
    "harness precondition: exactly one debounce window armed and PENDING at the boundary",
  ).toStrictEqual([RELOAD_DEBOUNCE_WINDOW_MS]);

  // Generation 2 discovers ONLY `/second`.
  unlinkSync(join(thetaDir, "greet.theta"));
  writeFileSync(join(thetaDir, "second.theta"), THETA_BODY, "utf8");
  await b.harness.fireSessionStart();

  return b;
}

describe("bug 0029 — throwing supersession detach: containment-first detach() and evidence at the swallow", () => {
  let workspace: string;
  let thetaDir: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "theta-bug0029-"));
    thetaDir = join(workspace, ".pi", "theta");
    mkdirSync(thetaDir, { recursive: true });
    writeFileSync(join(thetaDir, "greet.theta"), THETA_BODY, "utf8");
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Test 1 — RED at HEAD: containment-first `detach()`.
  // -------------------------------------------------------------------------

  it("containment (RED at HEAD): a throwing seam unsub at supersession still tears the debouncer down — the window pending across the boundary fires NO superseded-generation reload", async () => {
    const b = await bootAndSupersedeWithPendingWindow(workspace, thetaDir, {
      throwingUnsubAt: 0,
    });

    // Harness preconditions (fail loudly rather than assert vacuously): the
    // detach really did reach the fallible step and really did throw, exactly
    // once, and the failed close was never retried.
    expect(
      watcherAt(b, 0).unsubThrows,
      "harness precondition: the supersession detach's unsub threw exactly once",
    ).toBe(1);
    expect(watcherAt(b, 0).unsubCalls).toBe(1);

    // Controls (GREEN at HEAD, must stay green): the throw did not abort the
    // superseding pass — generation 2 published, registered, and armed, and the
    // outgoing registry was drained by the infallible-first factory steps.
    expect(b.harness.commands.has("second")).toBe(true);
    expect(watcherAt(b, 1).attached).toBe(true);
    expect(wiringAt(b, 1).registry.readDrainState().drained).toBe(false);
    expect(wiringAt(b, 0).registry.readDrainState().drained).toBe(true);

    // Plant a name NO live generation ever discovered, so the superseded pass's
    // rediscovered set is distinguishable from generation 2's.
    writeFileSync(join(thetaDir, "third.theta"), THETA_BODY, "utf8");

    const registeredAtBoundary = b.harness.registeredNames.length;
    const structuralNotesAtBoundary = structuralNotes(b.harness).length;

    // Close the pending window. Post-fix the debouncer is torn down (the
    // containment marks ran BEFORE the throwing unsub), so the window is
    // already cancelled and nothing fires; at HEAD the superseded generation
    // runs one full reload pass ~20 ms later.
    b.clock.advance(RELOAD_DEBOUNCE_WINDOW_MS * 2);
    const leaked = await becameTrueWithin(
      () =>
        wiringAt(b, 0).registry.get("third") !== undefined ||
        b.harness.registeredNames.length > registeredAtBoundary ||
        structuralNotes(b.harness).length > structuralNotesAtBoundary,
      LEAK_OBSERVATION_BOUND_MS,
    );
    // Let a slower leaked pass finish its note delivery before the assertions.
    await sleep(50);

    // (a) The superseded generation must not REBUILD: its drained registry
    // still holds exactly the set IT published, never the rediscovered set
    // (the newly-planted `third` plus the live generation's `second`).
    expect.soft(
      registryKeys(b, 0),
      "(a) the superseded generation's registry must not gain rediscovered names",
    ).toStrictEqual(["greet"]);

    // (b) The superseded generation must not RE-REGISTER: no new
    // `pi.registerCommand` call, and the name it would have captured never
    // reaches the host command surface.
    expect.soft(
      b.harness.registeredNames.slice(registeredAtBoundary),
      "(b) no superseded-generation pi.registerCommand calls after the supersession",
    ).toStrictEqual([]);
    expect.soft(
      b.harness.commands.has("third"),
      "(b) a name only the dead generation rediscovered must never be registered",
    ).toBe(false);

    // (c) …and no `theta-system-note` structural-change note from the dead pass.
    expect.soft(
      structuralNotes(b.harness).length - structuralNotesAtBoundary,
      "(c) the superseded generation must send no structural-change note",
    ).toBe(0);

    // (d) The live generation is untouched by the leak either way.
    expect.soft(
      registryKeys(b, 1),
      "(d) the live generation still owns exactly its own published theta",
    ).toStrictEqual(["second"]);

    // (e) Summarising discriminator — nothing observable happened at all after
    // the window closed.
    expect.soft(
      leaked,
      "(e) no superseded-generation reload activity may be observable after the pending window closes",
    ).toBe(false);
  }, 20000);

  // -------------------------------------------------------------------------
  // Test 2 — RED at HEAD: evidence at the swallow.
  // -------------------------------------------------------------------------

  it("evidence (RED at HEAD): the swallowed supersession detach failure emits exactly one theta/host/session-start-supersession-detach-failed through deps.emitDiagnostic, without aborting the superseding pass", async () => {
    const b = await bootAndSupersedeWithPendingWindow(workspace, thetaDir, {
      throwingUnsubAt: 0,
    });

    // Harness precondition: the detach threw (there IS a failure to evidence).
    expect(
      watcherAt(b, 0).unsubThrows,
      "harness precondition: the supersession detach's unsub threw exactly once",
    ).toBe(1);

    // (a) Exactly ONE diagnostic under the new code. At HEAD the recorder is
    // `[]` — nothing is even constructed (`factory.ts:723` is `void e;`).
    const emitted = detachFailedDiagnostics(b);
    expect.soft(
      emitted,
      "(a) exactly one supersession-detach-failed diagnostic per failing detach",
    ).toHaveLength(1);

    for (const d of emitted) {
      // (b) `W` severity + the closed `details.call` label + the
      // underlying-error string, mirroring the sibling teardown row.
      expect.soft(d.severity, "(b) W severity (registry row)").toBe("warning");
      expect.soft(d.details?.call, "(b) the closed details.call label").toBe(
        SUPERSESSION_DETACH_CALL_LABEL,
      );
      expect.soft(
        d.details?.error,
        "(b) details.error carries the underlying-error string",
      ).toBe(THROWING_UNSUB_MESSAGE);
      // (c) The proposed message template
      // `session_start supersession detach failed at <call>: <error>`. If the
      // implementer mints a different template in the registry row, THIS is the
      // line to reconcile — the substance is pinned by (a)/(b) above.
      expect.soft(d.message, "(c) the proposed registry message template").toBe(
        SUPERSESSION_DETACH_MESSAGE,
      );
    }

    // (d) No OTHER diagnostic rides the seam on this path — the supersession
    // detach failure must not be mislabelled as a bootstrap/compose failure.
    expect.soft(
      b.diagnostics.filter((d) => d.code !== SUPERSESSION_DETACH_FAILED_CODE),
      "(d) no other diagnostic code is emitted on the supersession path",
    ).toStrictEqual([]);

    // (e) Controls (GREEN at HEAD, must stay green): emitting the evidence must
    // not abort the superseding pass — generation 2 published, registered its
    // theta, and armed its watcher; the outgoing registry stayed drained.
    expect.soft(
      b.harness.commands.has("second"),
      "(e) the superseding pass still registered its theta",
    ).toBe(true);
    expect.soft(
      registryKeys(b, 1),
      "(e) the superseding pass still published its registry",
    ).toStrictEqual(["second"]);
    expect.soft(
      watcherAt(b, 1).attached,
      "(e) the superseding pass still armed its watcher",
    ).toBe(true);
    expect.soft(
      wiringAt(b, 1).registry.readDrainState().drained,
      "(e) the live registry is not drained",
    ).toBe(false);
  }, 20000);

  // -------------------------------------------------------------------------
  // Test 3 — control (GREEN at HEAD and after): the discriminators are live.
  // -------------------------------------------------------------------------

  it("control (GREEN at HEAD and after): with a NON-throwing seam unsub the identical pending window fires no reload pass and emits no supersession-detach diagnostic", async () => {
    // `"none"` — every generation's unsubscribe succeeds.
    const b = await bootAndSupersedeWithPendingWindow(workspace, thetaDir, {
      throwingUnsubAt: "none",
    });

    // The detach ran to completion: the watcher detached and nothing threw.
    expect(watcherAt(b, 0).unsubCalls).toBe(1);
    expect(watcherAt(b, 0).unsubThrows).toBe(0);
    expect(watcherAt(b, 0).attached).toBe(false);
    expect(watcherAt(b, 1).attached).toBe(true);

    writeFileSync(join(thetaDir, "third.theta"), THETA_BODY, "utf8");
    const registeredAtBoundary = b.harness.registeredNames.length;
    const structuralNotesAtBoundary = structuralNotes(b.harness).length;

    b.clock.advance(RELOAD_DEBOUNCE_WINDOW_MS * 2);
    const leaked = await becameTrueWithin(
      () =>
        wiringAt(b, 0).registry.get("third") !== undefined ||
        b.harness.registeredNames.length > registeredAtBoundary ||
        structuralNotes(b.harness).length > structuralNotesAtBoundary,
      LEAK_OBSERVATION_BOUND_MS,
    );

    // The containment steps ran (they were never skipped), so the pending
    // window was cancelled: no rebuild, no re-registration, no note. This is
    // the exact post-state test 1 pins for the THROWING path — proving test 1's
    // assertions are reachable in the green direction and are not asserting an
    // impossibility.
    expect(leaked).toBe(false);
    expect(registryKeys(b, 0)).toStrictEqual(["greet"]);
    expect(registryKeys(b, 1)).toStrictEqual(["second"]);
    expect(b.harness.registeredNames.slice(registeredAtBoundary)).toStrictEqual([]);
    expect(structuralNotes(b.harness).length).toBe(structuralNotesAtBoundary);

    // No detach failed, so no evidence is due — the code filter test 2 reds on
    // is live (it does not match on an unrelated diagnostic).
    expect(detachFailedDiagnostics(b)).toStrictEqual([]);
  }, 20000);

  // -------------------------------------------------------------------------
  // Test 4 — POST-FIX GUARD CONTROL (cannot red at HEAD).
  // -------------------------------------------------------------------------

  it("post-fix guard control: a THROWING emitDiagnostic sink must not abort the superseding pass (vacuous at HEAD — no emission exists yet)", async () => {
    // The emission is defended by its own `try`/`catch` per
    // diagnostic-emission-isolation.md, so a hostile sink cannot turn the
    // swallowed detach failure into an escaping throw. At HEAD the sink is
    // never invoked on this path, so this test passes without exercising the
    // guard; the verifier proves its red direction against the fixed tree by
    // removing the defensive wrap.
    const b = await bootAndSupersedeWithPendingWindow(workspace, thetaDir, {
      throwingUnsubAt: 0,
      throwingSink: true,
    });

    // Harness precondition: the detach threw, so post-fix the sink IS reached.
    expect(watcherAt(b, 0).unsubThrows).toBe(1);

    // Start #2 resolved (a throw escaping into the host `session_start`
    // dispatch would have rejected the fire above) and generation 2 is fully
    // live: published, registered, armed.
    expect(b.harness.commands.has("second")).toBe(true);
    expect(registryKeys(b, 1)).toStrictEqual(["second"]);
    expect(watcherAt(b, 1).attached).toBe(true);
    expect(wiringAt(b, 1).registry.readDrainState().drained).toBe(false);
    expect(wiringAt(b, 0).registry.readDrainState().drained).toBe(true);
  }, 20000);
});
