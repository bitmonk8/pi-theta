// Bug 0018 — RED offline regression suite, written BEFORE the fix. The
// spec-correct assertions here MUST fail at HEAD; the control case must pass.
//
// Defect (docs/bugs/0018-hot-reload-stale-ctx-after-session-replacement.md):
// a bare `AgentSession.dispose()` on the host invalidates the extension
// runtime WITHOUT emitting `session_shutdown` first (host
// dist/core/agent-session.js — `this._extensionRunner.invalidate(...)`; all
// *replacement* paths emit `session_shutdown`, the bare dispose does not).
// theta's watcher/debounce wiring closes over the `session_start`-era `pi` /
// `ctx`; nothing marks the debouncer torn-down on a bare invalidate, so the
// debounced reload runs `runComposePass` against the invalidated runtime:
// every guarded `pi.*` / `ctx.*` read throws the host's stale error, the
// ERR-7 `theta/runtime/registry-swap-failed` note (and the earlier
// `theta/load/settings-unreadable` load-diagnostic note) route their delivery
// through the SAME stale captured channel, and the whole failure collapses to
// `console.error("system-note delivery failed: …")` on stderr.
//
// Spec encoded by the red assertions — PIC-57
// (docs/spec_topics/pi-integration-contract/session-shutdown-semantics.md,
// anchor #pic-57): "No watcher-driven registry rebuild may run against an
// invalidated extension runtime" — UNCONDITIONAL (not scoped to teardowns that
// happened to run `session_shutdown`).
//
// Reactive/probe lock (orchestrator ruling on bug 0018, encoded by Case A):
// the host exposes NO non-throwing staleness probe (`staleMessage` is private;
// no `isStale`/`isActive`/`isDisposed`; no event on a bare dispose), so with
// `session_shutdown` never fired the product can learn of the invalidation
// ONLY by touching one guarded surface and catching the stale error. The
// spec-correct Case A observable is therefore EXACTLY the minimal
// deterministic detection set — a single `ctx.cwd` probe touch at reload-pass
// entry (PIC-67's stale-probe posture) — then permanent quiescence (zero
// touches on every later boundary), exactly ONE designed
// `theta hot-reload quiesced:` stderr line across the whole scenario, and
// never a `system-note delivery failed:` cascade. Case C is different:
// `session_shutdown` DID run there, so the factory can know without touching
// and its lock stays strictly zero-touch.
//
// Harness: mirrors tests/watcher-hot-reload-integration.test.ts (real
// `createThetaExtension` + `composeExtensionInstance`, FakeFileWatcher +
// FakeClock seams, temp-dir discovery) but the hand-rolled `pi` / `ctx` fakes
// carry a HOST-FAITHFUL stale switch: `invalidate()` sets the stale message
// and EVERY `pi.*` member / `ctx.*` getter first runs an `assertActive()`
// that throws it — the same shape as the host's
// dist/core/extensions/loader.js `assertActive` (guarding every ExtensionAPI
// member) and dist/core/extensions/runner.js `createContext()` (guarding
// every ctx getter). `HOST_STALE_MESSAGE` below is byte-exact from the
// installed host package (loader.js `invalidate` default / runner.js
// `invalidate(message = …)` / agent-session.js dispose call).
//
// The fakes additionally RECORD each guarded touch made after invalidation
// (`staleTouches`), which is the direct witness for the PIC-57 assertion.

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import { loadSettings } from "../src/discovery/settings";
import { PiFileSystem } from "../src/seams/pi-file-system";
import { FakeClock } from "./helpers/fake-clock";
import { FakeFileWatcher } from "./helpers/fake-file-watcher";

/**
 * The host's stale-ctx error message, byte-exact. Sourced from the installed
 * host package
 * `node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js`
 * (`invalidate` default message; `assertActive` throws
 * `new Error(state.staleMessage)`) — identical text in
 * `dist/core/extensions/runner.js` (`invalidate(message = …)`) and
 * `dist/core/agent-session.js` (the bare-dispose `invalidate(...)` call).
 */
const HOST_STALE_MESSAGE =
  "This extension ctx is stale after session replacement or reload. Do not use a captured pi or command ctx after ctx.newSession(), ctx.fork(), ctx.switchSession(), or ctx.reload(). For newSession, fork, and switchSession, move post-replacement work into withSession and use the ctx passed to withSession. For reload, do not use the old ctx after await ctx.reload().";

/** The PIC-54 terminal-arm stderr prefix (system-note-channel.ts). */
const CASCADE_PREFIX = "system-note delivery failed:";

/**
 * The designed fail-loud-once stderr prefix of the PIC-67 stale-quiesce line
 * (stale-ctx.ts `STALE_QUIESCE_STDERR_PREFIX`). Deliberately a string literal
 * rather than an import: the RED-at-HEAD re-proof runs this file against a
 * tree where the constant does not exist yet, and the red must land on the
 * assertions, never on collection.
 */
const QUIESCE_PREFIX = "theta hot-reload quiesced:";

/**
 * The exact minimal detection set the PIC-67 stale-probe posture permits for
 * Case A: ONE `ctx.cwd` probe touch at reload-pass entry, nothing else.
 */
const EXPECTED_PROBE_TOUCHES = ["ctx.cwd"];

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

interface StaleHarness {
  readonly pi: ExtensionAPI;
  readonly ctx: ExtensionContext;
  readonly commands: Map<string, unknown>;
  readonly notes: RecordedNote[];
  /**
   * Every guarded `pi.*` / `ctx.*` member touched AFTER `invalidate()`, in
   * touch order (each touch also threw `HOST_STALE_MESSAGE`, mirroring the
   * host). Spec-correct expectation: EMPTY wherever the product can know of
   * the teardown without touching (Case C — `session_shutdown` ran; the
   * control B), and EXACTLY the single `ctx.cwd` entry-probe detection touch
   * in Case A (the reactive/probe lock — see the file header).
   */
  readonly staleTouches: string[];
  /**
   * The bare `AgentSession.dispose()` host behaviour: invalidate the runtime
   * WITHOUT emitting `session_shutdown` first. First call wins (host
   * `invalidate` is `staleMessage ??=`-idempotent).
   */
  invalidate(): void;
  fireSessionStart(): Promise<void>;
  fireSessionShutdown(): Promise<void>;
}

function makeStaleHarness(cwd: string): StaleHarness {
  const commands = new Map<string, unknown>();
  const notes: RecordedNote[] = [];
  const subscriptions = new Map<
    string,
    ((event: unknown, ctx: ExtensionContext) => unknown)[]
  >();
  const staleTouches: string[] = [];
  let staleMessage: string | undefined;

  // Host-faithful guard: dist/core/extensions/loader.js `assertActive` — a
  // stale runtime throws the invalidation message from EVERY guarded member.
  const assertActive = (member: string): void => {
    if (staleMessage !== undefined) {
      staleTouches.push(member);
      throw new Error(staleMessage);
    }
  };

  const pi = {
    registerFlag: (): void => {
      assertActive("pi.registerFlag");
    },
    registerMessageRenderer: (): void => {
      assertActive("pi.registerMessageRenderer");
    },
    registerCommand: (name: string, options: unknown): void => {
      assertActive("pi.registerCommand");
      commands.set(name, options);
    },
    on: (
      event: string,
      handler: (e: unknown, c: ExtensionContext) => unknown,
    ): void => {
      assertActive("pi.on");
      const list = subscriptions.get(event) ?? [];
      list.push(handler);
      subscriptions.set(event, list);
    },
    getFlag: (): undefined => {
      assertActive("pi.getFlag");
      return undefined;
    },
    getCommands: (): { name: string; source: string }[] => {
      assertActive("pi.getCommands");
      return [...commands.keys()].map((name) => ({
        name,
        source: "extension",
      }));
    },
    sendMessage: (
      message: {
        customType: string;
        content: string;
        display: boolean;
        details: unknown;
      },
      options: { triggerTurn: unknown },
    ): void => {
      assertActive("pi.sendMessage");
      notes.push({
        customType: message.customType,
        content: message.content,
        display: message.display,
        details: message.details as RecordedNote["details"],
        triggerTurn: options.triggerTurn,
      });
    },
    sendUserMessage: (): void => {
      assertActive("pi.sendUserMessage");
    },
  } as unknown as ExtensionAPI;

  // Host-faithful ctx: dist/core/extensions/runner.js `createContext()` wraps
  // every member in a `runner.assertActive()` GETTER, so even a property READ
  // on a stale ctx throws.
  const ctx = {
    get cwd(): string {
      assertActive("ctx.cwd");
      return cwd;
    },
    get hasUI(): boolean {
      assertActive("ctx.hasUI");
      return false;
    },
    get modelRegistry(): { getAvailable(): readonly unknown[] } {
      assertActive("ctx.modelRegistry");
      return { getAvailable: (): readonly unknown[] => [] };
    },
    get ui(): { notify(message: string, type: string): void } {
      assertActive("ctx.ui");
      return { notify: (): void => {} };
    },
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
    staleTouches,
    invalidate: () => {
      staleMessage ??= HOST_STALE_MESSAGE;
    },
    fireSessionStart: () => fire("session_start"),
    fireSessionShutdown: () => fire("session_shutdown"),
  };
}

/** One booted extension instance over the stale-capable harness. */
interface Boot {
  readonly harness: StaleHarness;
  readonly fakeWatcher: FakeFileWatcher;
  readonly fakeClock: FakeClock;
  /**
   * Every diagnostic the factory constructed and routed through the
   * `ThetaExtensionDeps.emitDiagnostic` seam, in construction order. Bug-0022
   * witness: production wires that seam to a delivering bootstrap sink, so
   * every construct becomes a delivery attempt, and this recorder is the only
   * way to observe "zero diagnostics constructed" — the spec-correct posture
   * wherever the factory can know of the teardown without touching (PIC-67:
   * the delivery channel is dead, clause (c) forbids the attempt, so nothing
   * may be built for it either).
   */
  readonly diagnostics: Diagnostic[];
  wiring(): ExtensionInstanceWiring | undefined;
  /** Case C / bug-0022 seam: true once the gated compose has parked at its gate. */
  composeParked(): boolean;
  /** Case C / bug-0022 seam: release the parked compose so `session_start` completes. */
  releaseCompose(): void;
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
 * Bounded wait for a world-identifying observable, returning QUIETLY on
 * timeout: at HEAD the reload dies loudly within a few ms (the cascade
 * appears and we return early); post-fix the quiesce line is the early-exit
 * observable (callers pass the disjunction), so green runs skip most of the
 * bound. A caller whose post-fix world is zero-observable (Case C) still
 * elapses the full bound. This keeps the settle deterministic in both worlds
 * without asserting inside the wait.
 */
async function settleBounded(
  observed: () => boolean,
  ms = 700,
): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (observed()) {
      // Let the remaining synchronous tail + microtasks of the failing reload
      // finish before the caller asserts.
      for (let i = 0; i < 8; i++) {
        await Promise.resolve();
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("bug 0018 — watcher hot-reload vs bare runtime invalidation (no session_shutdown)", () => {
  let workspace: string;
  let thetaDir: string;
  let stderrCalls: unknown[][];
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "theta-bug0018-"));
    thetaDir = join(workspace, ".pi", "theta");
    mkdirSync(thetaDir, { recursive: true });
    writeFileSync(join(thetaDir, "greet.theta"), GREET_THETA, "utf8");
    // A MALFORMED project settings file, planted so the reload pass has a
    // deterministic workspace-local load-diagnostic batch to deliver. What this
    // cell guards is the DELIVERY of such a batch through a stale channel, not
    // which diagnostic it carries, so the batch must exist by construction.
    // It used to arrive by ABSENCE — an absent settings file raised
    // `theta/load/settings-unreadable` — but absence is now correctly silent
    // (both settings files are optional), which would leave this cell asserting
    // that an empty cascade stays empty: vacuously green, with the bug-0018
    // delivery path no longer exercised at all. Malformed JSON keeps a real
    // batch on the channel and, unlike absence, does not depend on the runner's
    // machine-dependent global settings file.
    writeFileSync(join(workspace, ".pi", "settings.json"), "{", "utf8");
    stderrCalls = [];
    errorSpy = vi.spyOn(console, "error").mockImplementation(
      (...args: unknown[]) => {
        stderrCalls.push(args);
      },
    );
  });

  afterEach(() => {
    errorSpy.mockRestore();
    rmSync(workspace, { recursive: true, force: true });
  });

  /**
   * The PIC-54 terminal-arm stderr cascades observed so far — the defect's
   * only user-visible surface at HEAD. Optionally filtered to lines mentioning
   * `containing`.
   */
  function cascades(containing?: string): string[] {
    return stderrCalls
      .map((args) => args[0])
      .filter(
        (first): first is string =>
          typeof first === "string" && first.startsWith(CASCADE_PREFIX),
      )
      .filter(
        (line) => containing === undefined || line.includes(containing),
      );
  }

  /** The designed PIC-67 stale-quiesce stderr lines (fail-loud-once witness). */
  function quiesceLines(): string[] {
    return stderrCalls
      .map((args) => args[0])
      .filter(
        (first): first is string =>
          typeof first === "string" && first.startsWith(QUIESCE_PREFIX),
      );
  }

  function boot(
    options: { gateCompose?: boolean; gateBeforeCompose?: boolean } = {},
  ): Boot {
    const harness = makeStaleHarness(workspace);
    const fakeWatcher = new FakeFileWatcher();
    const fakeClock = new FakeClock();
    const diagnostics: Diagnostic[] = [];
    let wiring: ExtensionInstanceWiring | undefined;
    let parked = false;
    let release: () => void = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const deps: ThetaExtensionDeps = {
      fixtures: [],
      // Bug 0022 witness: record every diagnostic the factory routes through
      // the seam production wires to its delivering sink — see
      // Boot.diagnostics.
      emitDiagnostic: (d) => {
        diagnostics.push(d);
      },
      composeInstance: async (pi, ctx) => {
        if (options.gateBeforeCompose === true) {
          // Bug 0022 variant-2 seam: park BEFORE the real compose starts, so
          // a `session_shutdown` + `invalidate()` can land at the compose's
          // FIRST await. The resumed compose then dies on its first guarded
          // read (`ctx.cwd` in buildRuntimeRoot) and the throw funnels into
          // the factory's compose-supplier catch arm.
          parked = true;
          await gate;
        }
        const composed = await composeExtensionInstance(pi, ctx, {
          fileWatcher: fakeWatcher,
          clock: fakeClock,
        });
        wiring = composed;
        if (options.gateCompose === true) {
          // Case C seam: hold the factory's `session_start` handler in flight
          // (compose finished, wiring not yet returned) so a `session_shutdown`
          // can be consumed BEFORE the factory publishes `liveRegistry` / arms
          // the watcher.
          parked = true;
          await gate;
        }
        return composed;
      },
    };
    createThetaExtension(deps)(harness.pi);

    return {
      harness,
      fakeWatcher,
      fakeClock,
      diagnostics,
      wiring: () => wiring,
      composeParked: () => parked,
      releaseCompose: () => release(),
    };
  }

  /**
   * The shared bug-0018 reproduction: boot, open a debounce window, then
   * invalidate the runtime WITHOUT `session_shutdown` (the bare
   * `AgentSession.dispose()` host path) and cross the debounce boundary.
   * Returns the post-invalidate baselines the assertions compare against.
   */
  async function driveBareInvalidateReload(
    b: Boot,
  ): Promise<{ notesBefore: number }> {
    await b.harness.fireSessionStart();

    // Control: the boot registered `/greet` and armed the watcher.
    expect(b.harness.commands.has("greet")).toBe(true);
    expect(b.wiring()?.registry.get("greet")).toBeDefined();

    // Plant a new theta so a rebuild that DID run to a publish would be
    // visible in the registry (proves quiescence, not merely a discard).
    writeFileSync(join(thetaDir, "second.theta"), SECOND_THETA, "utf8");

    // A watcher event opens the debounce window (timer pending on FakeClock).
    b.fakeWatcher.emit({
      kind: "change",
      path: join(thetaDir, "second.theta"),
    });

    // Bare dispose: invalidate WITHOUT session_shutdown. Nothing has torn the
    // watcher down and nothing marked the debouncer torn-down.
    b.harness.invalidate();
    const notesBefore = b.harness.notes.length;
    expect(b.harness.staleTouches).toStrictEqual([]);

    // Cross the debounce boundary. At HEAD the reload now runs against the
    // invalidated runtime; its terminal observable is the ERR-7 stderr
    // cascade. Post-fix the designed quiesce line appears instead — either
    // observable ends the bounded wait early (green runs skip the full bound).
    b.fakeClock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await settleBounded(
      () =>
        cascades(REGISTRY_SWAP_FAILED_CODE).length > 0 ||
        quiesceLines().length > 0,
    );
    return { notesBefore };
  }

  // -------------------------------------------------------------------------
  // Case A — RED at HEAD: spec-correct behaviour after a bare invalidate.
  // -------------------------------------------------------------------------

  it("PIC-57/PIC-67 (RED at HEAD): a debounced reload after a bare invalidate detects staleness with exactly one entry-probe touch, quiesces permanently, and fail-louds exactly once", async () => {
    const b = boot();
    await driveBareInvalidateReload(b);

    // Invariant (green at HEAD and post-fix): the swap never published — the
    // planted theta must not have entered the live registry either way.
    expect(
      b.wiring()?.registry.get("second"),
      "a reload against an invalidated runtime must never publish",
    ).toBeUndefined();

    // Reactive/probe lock (see file header): with no `session_shutdown` and no
    // non-throwing host probe, ONE guarded touch is the minimal deterministic
    // detection — the reload-pass entry probe reads `ctx.cwd`, catches the
    // stale error, and quiesces before any other surface is reached. EXACT
    // array, not a bound: any second touch means the pass ran on.
    // At HEAD this FAILS: runReload passes its tornDown guard (nothing set
    // it), runComposePass reads pi.getFlag / delivers notes via
    // pi.sendMessage / ctx.ui — seven stale touches, none of them the probe.
    expect(
      b.harness.staleTouches,
      "PIC-67: exactly the single ctx.cwd entry-probe detection touch — nothing else may touch the invalidated runtime",
    ).toStrictEqual(EXPECTED_PROBE_TOUCHES);

    // Permanent-quiesce witness: a SECOND watcher event and a second debounce
    // boundary add ZERO further touches (the first boundary marked the
    // debouncer torn-down and detached the watcher).
    b.fakeWatcher.emit({
      kind: "change",
      path: join(thetaDir, "second.theta"),
    });
    b.fakeClock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(
      b.harness.staleTouches,
      "PIC-67: the quiesce is permanent — a later boundary performs no touch at all (not even another probe)",
    ).toStrictEqual(EXPECTED_PROBE_TOUCHES);

    // Fail-loud-once: exactly ONE designed stderr line across the WHOLE
    // scenario including the second boundary — present (the operator gets one
    // signal) and once (no cascade). At HEAD this FAILS: zero designed lines
    // exist (the defect surfaces only as `system-note delivery failed:`
    // cascades, asserted absent by the sibling tests).
    expect(
      quiesceLines(),
      "PIC-67: exactly one designed stale-quiesce stderr line for the whole scenario",
    ).toHaveLength(1);
  });

  it("bug 0018 (RED at HEAD): the reload's load-diagnostic delivery must not collapse to a stderr cascade on the stale captured channel", async () => {
    const b = boot();
    await driveBareInvalidateReload(b);

    // The reload pass re-reads settings; the workspace's planted MALFORMED
    // `.pi/settings.json` makes the pass emit the
    // `theta/load/settings-invalid-json` warning batch. Spec-correct delivery
    // resolves a LIVE surface (or the whole pass quiesces per PIC-57); it must
    // never die on the captured stale channel and fall through to the PIC-54
    // terminal `console.error("system-note delivery failed: …")`.
    // At HEAD this FAILS: pi.sendMessage throws stale, ctx.ui throws stale,
    // the off-channel fallback throws stale, and the cascade lands on stderr.
    //
    // The batch must be non-empty for this assertion to mean anything, so the
    // fixture is proven to be a PRODUCER first. It is proven through a direct
    // settings read rather than through `b.notes`, because notes only record
    // deliveries that SUCCEEDED and this scenario deliberately breaks delivery —
    // an empty `notes` is the expected state here, so it can witness nothing.
    const settingsProbe = await loadSettings(new PiFileSystem(workspace));
    expect(
      settingsProbe.diagnostics.map((d) => d.code),
      "precondition: the planted malformed settings file must be a real load-diagnostic producer",
    ).toContain("theta/load/settings-invalid-json");
    expect(
      cascades("theta/load/settings-invalid-json"),
      "load-diagnostic (settings-invalid-json) delivery must not die on the stale captured channel",
    ).toStrictEqual([]);
  });

  it("bug 0018 (RED at HEAD): ERR-7 registry-swap-failed must not collapse to a stderr cascade on the stale captured channel", async () => {
    const b = boot();
    await driveBareInvalidateReload(b);

    // Per package-and-settings.md §"Watcher-time reload failures" a genuine
    // watcher-time rebuild failure surfaces ERR-7 on the `theta-system-note`
    // channel — which presupposes a live delivery surface. Post-invalidate
    // the spec-correct behaviour is quiescence (PIC-57: no rebuild at all,
    // hence no ERR-7) or a delivery that resolved a live surface; never the
    // PIC-54 terminal stderr cascade.
    // At HEAD this FAILS: the rebuild runs, dies on pi.getFlag, emitErr7
    // routes through the same stale channel, and
    // "system-note delivery failed: theta/runtime/registry-swap-failed: …"
    // lands on stderr.
    expect(
      cascades(REGISTRY_SWAP_FAILED_CODE),
      "ERR-7 must surface on the theta-system-note channel or not at all — never as a stderr cascade",
    ).toStrictEqual([]);
  });

  it("bug 0018 (RED at HEAD): after a bare invalidate the watcher path must either quiesce or deliver a failure signal on the theta-system-note channel", async () => {
    const b = boot();
    const { notesBefore } = await driveBareInvalidateReload(b);

    // The bug report's regression-lock phrasing: "drives a reload after a
    // session replacement and asserts either quiescence or a delivered
    // ERR-7". Disjunctive so EITHER fix shape satisfies it: quiescence — at
    // most the single PIC-67 entry-probe detection touch (the reactive/probe
    // lock in the file header: a bare-disposed session exposes no way to learn
    // staleness without one guarded touch) and nothing else — or a failure
    // note actually DELIVERED on the designed channel.
    // At HEAD this FAILS: the rebuild touched seven stale surfaces (well
    // beyond the detection probe — not quiescent) AND no note was delivered
    // (the channel is dead).
    const quiesced =
      b.harness.staleTouches.length === 0 ||
      (b.harness.staleTouches.length === 1 &&
        b.harness.staleTouches[0] === "ctx.cwd");
    const delivered = b.harness.notes.length > notesBefore;
    expect(
      quiesced || delivered,
      "post-invalidate the watcher path must quiesce or deliver a failure signal on the theta-system-note channel (it did neither)",
    ).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Case B — GREEN at HEAD (control): session_shutdown BEFORE the invalidate.
  // -------------------------------------------------------------------------

  it("control (GREEN at HEAD): session_shutdown before the invalidate detaches the watcher — no rebuild, no stale touch, no cascade", async () => {
    const b = boot();
    await b.harness.fireSessionStart();
    expect(b.harness.commands.has("greet")).toBe(true);
    expect(b.wiring()?.registry.get("greet")).toBeDefined();

    // Same setup as Case A: planted theta + an open debounce window.
    writeFileSync(join(thetaDir, "second.theta"), SECOND_THETA, "utf8");
    b.fakeWatcher.emit({
      kind: "change",
      path: join(thetaDir, "second.theta"),
    });

    // The host REPLACEMENT paths (newSession/switchSession/fork/reload/quit)
    // emit session_shutdown BEFORE invalidating: the PIC-57 teardown detaches
    // the watcher, cancels the pending debounce timer, and marks the
    // debouncer torn-down.
    await b.harness.fireSessionShutdown();
    b.harness.invalidate();
    const notesBefore = b.harness.notes.length;

    // Cross the boundary and fire a post-teardown event: nothing may run.
    b.fakeClock.advance(RELOAD_DEBOUNCE_WINDOW_MS * 4);
    b.fakeWatcher.emit({
      kind: "change",
      path: join(thetaDir, "second.theta"),
    });
    b.fakeClock.advance(RELOAD_DEBOUNCE_WINDOW_MS * 4);
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(b.harness.staleTouches).toStrictEqual([]);
    expect(cascades()).toStrictEqual([]);
    expect(b.harness.notes.length).toBe(notesBefore);
    expect(b.wiring()?.registry.get("second")).toBeUndefined();
    expect(b.harness.commands.has("second")).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Case C — RED at HEAD: the arm-after-teardown race. session_shutdown is
  // consumed while the async session_start compose is still in flight
  // (factory.ts session_shutdown handler: the lazy `liveRegistry` read sees
  // `undefined` and no-ops); compose completes AFTER the invalidate and
  // `installHotReload` arms a watcher nothing will ever detach.
  // -------------------------------------------------------------------------

  it("PIC-57 arm-after-teardown race (RED at HEAD): a watcher armed by a compose that outlived session_shutdown must not rebuild against the invalidated runtime", async () => {
    const b = boot({ gateCompose: true });

    // session_start's compose parks in flight (compose finished, wiring not
    // yet returned to the factory — liveRegistry still unpublished).
    const startPending = b.harness.fireSessionStart();
    await waitFor(() => b.composeParked(), "compose to park at the gate");

    // The replacement's session_shutdown arrives NOW: the factory handler
    // reads liveRegistry === undefined and no-ops — nothing is torn down.
    await b.harness.fireSessionShutdown();

    // The host invalidates the runtime, then the parked compose resumes: the
    // factory publishes the wiring and arms the step-5 watcher post-teardown.
    b.harness.invalidate();
    b.releaseCompose();
    await startPending;

    // No baseline reset: from the consumed shutdown on, the WHOLE late tail
    // AND the watcher-driven phase must stay zero-touch and stderr-silent
    // (the bug-0022 describe below carries the fine-grained per-arm locks).
    const notesBefore = b.harness.notes.length;

    // A watcher event + the debounce boundary: PIC-57 says this must not
    // drive a rebuild against the invalidated runtime — yet nothing detached
    // the watcher and nothing marked the debouncer torn-down.
    b.fakeWatcher.emit({
      kind: "change",
      path: join(thetaDir, "greet.theta"),
    });
    b.fakeClock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
    await settleBounded(() => cascades(REGISTRY_SWAP_FAILED_CODE).length > 0);

    // At HEAD this FAILS exactly like Case A: the armed watcher's reload runs
    // against the invalidated runtime and cascades to stderr.
    expect(
      b.harness.staleTouches,
      "PIC-57: a watcher armed after a consumed session_shutdown must not rebuild against the invalidated runtime",
    ).toStrictEqual([]);
    expect(
      cascades(),
      "no stderr cascade from the arm-after-teardown watcher",
    ).toStrictEqual([]);
    expect(
      b.harness.notes.length,
      "no note can deliver through the dead captured channel; quiescence is the only spec-correct shape here",
    ).toBe(notesBefore);
  });

  // -------------------------------------------------------------------------
  // Bug 0022 — the OTHER arm of the same race: the late-completing
  // session_start compose TAIL (docs/bugs/0022-late-compose-tail-registration-
  // on-invalidated-runtime.md). The 0018 fix placed the PIC-67 generation
  // check immediately before `installHotReload` — the LAST step of the
  // continuation — so everything between compose-settle and the check still
  // runs against the invalidated runtime: the four `live*` publishes, the
  // full `registerFixtures` pass (whose first action touches the invalidated
  // `pi.getCommands`), and on the catch arm the `registerFixtures(deps.fixtures)`
  // fallback. PIC-67 (session-shutdown-semantics.md#pic-67, last sentence)
  // pins zero guarded touches wherever the runtime can know of the teardown
  // WITHOUT touching — and the factory CAN know here: it snapshots
  // `shutdownEventsObserved` at compose start and holds the same evidence
  // before `registerFixtures` that it consults before the arming.
  // -------------------------------------------------------------------------

  describe("bug 0022 — late session_start compose tail vs consumed session_shutdown (PIC-67)", () => {
    /**
     * The shared bug-0022 interleaving (both gate placements): park the
     * compose in flight, consume a `session_shutdown` (the factory handler's
     * lazy `liveRegistry` read sees `undefined` and no-ops the teardown, but
     * the PIC-67 counter records the delivery — from here on the factory can
     * know of the teardown without touching), invalidate the runtime (the
     * host replacement order), then release the compose and let the whole
     * `session_start` handler settle. Returns the note-count baseline the
     * invariants compare against.
     */
    async function driveShutdownDuringParkedCompose(
      b: Boot,
    ): Promise<{ notesBefore: number }> {
      const startPending = b.harness.fireSessionStart();
      await waitFor(() => b.composeParked(), "compose to park at the gate");
      await b.harness.fireSessionShutdown();
      b.harness.invalidate();
      const notesBefore = b.harness.notes.length;
      // Control (green both worlds): while the compose is parked nothing has
      // touched the invalidated runtime — every touch recorded after this
      // point belongs to the released compose/tail under test.
      expect(
        b.harness.staleTouches,
        "control: no guarded touch may precede the compose release",
      ).toStrictEqual([]);
      b.releaseCompose();
      await startPending;
      return { notesBefore };
    }

    // --- Variant 1 — the whole late tail after a SUCCESSFUL compose (the
    // Case C interleaving, observed from the release instead of post-arm) ---

    it("bug 0022 / PIC-67 variant 1 (RED at HEAD): the late compose tail after a consumed session_shutdown performs zero guarded touches", async () => {
      const b = boot({ gateCompose: true });
      const { notesBefore } = await driveShutdownDuringParkedCompose(b);

      // PIC-67's requirement sentence: zero guarded touches wherever the
      // runtime can know of the teardown without touching. The factory holds
      // the `shutdownEventsObserved` evidence BEFORE `registerFixtures`, so
      // from the consumed shutdown on, NOTHING may touch. At HEAD this FAILS
      // with ["pi.getCommands"]: the continuation runs the `registerFixtures`
      // collision-pass read (factory.ts registerFixtures) before the
      // generation check, which guards only the arming.
      expect(
        b.harness.staleTouches,
        "PIC-67: the late compose tail must perform zero guarded touches after a consumed session_shutdown",
      ).toStrictEqual([]);

      // Invariants (green both worlds): the collision-pass throw precedes
      // every `pi.registerCommand`, so nothing registers either way; no note
      // can deliver through the dead captured channel; and nothing may land
      // on stderr — neither the PIC-54 cascade nor the PIC-67 quiesce line
      // (the shutdown ran: knowing without touching has nothing to report).
      expect(
        b.harness.commands.size,
        "no slash command may register into the outgoing session",
      ).toBe(0);
      expect(
        b.harness.notes.length,
        "no note may be delivered post-invalidate",
      ).toBe(notesBefore);
      expect(
        cascades(),
        "no stderr cascade from the late tail",
      ).toStrictEqual([]);
      expect(
        quiesceLines(),
        "no quiesce stderr line: the factory knew of the teardown without touching",
      ).toStrictEqual([]);
    });

    it("bug 0022 / PIC-67 variant 1 (RED at HEAD): the late tail constructs zero diagnostics for the dead, unwired channel", async () => {
      const b = boot({ gateCompose: true });
      await driveShutdownDuringParkedCompose(b);

      // The tail's swallowed stale throw is converted into a
      // `theta/load/extension-bootstrap-failed` diagnostic that a wired
      // emitter could not deliver — the System-notes chain rides the same
      // invalidated runtime, and PIC-67 clause (c) forbids the delivery
      // attempt. Spec-correct posture: knowing of the teardown, construct
      // NOTHING. At HEAD this FAILS with one diagnostic carrying
      // `details.capability: "pi.getCommands"`.
      expect(
        b.diagnostics,
        "zero diagnostics may be constructed by the late tail after a consumed session_shutdown",
      ).toStrictEqual([]);
    });

    it("bug 0022 / PIC-67 variant 1 (RED at HEAD): the late tail must not publish the dead generation's live* resources — a second session_shutdown finds nothing to tear down", async () => {
      const b = boot({ gateCompose: true });
      await driveShutdownDuringParkedCompose(b);

      // The live*-publish witness. The factory's `session_shutdown` handler
      // reads `liveRegistry` LAZILY: if the late tail published the dead
      // generation's wiring (HEAD behaviour), this second shutdown runs the
      // full five-sub-step teardown against it and flips its drain state to
      // `{ drained: true, tag: "shutting-down" }`; if the fix suppressed the
      // publish, the handler sees `undefined` and no-ops, leaving the
      // registry at its factory-state `{ drained: false }`. The teardown over
      // an empty invocation registry settles without FakeClock advancement
      // (the Case B control proves the pattern), so this await is
      // deterministic in both worlds.
      await b.harness.fireSessionShutdown();

      const wiring = b.wiring();
      expect(
        wiring,
        "harness control: the gated compose resolved, so the harness captured the wiring regardless of what the factory did with it",
      ).toBeDefined();
      expect(
        wiring!.registry.readDrainState().drained,
        "PIC-67: the dead generation's registry must never be published for a later teardown to find — its drain state must stay at the factory value",
      ).toBe(false);
      expect(
        b.harness.staleTouches,
        "the second shutdown must find nothing to tear down and touch nothing",
      ).toStrictEqual([]);
    });

    it("bug 0022 variant 1 control (GREEN at HEAD): the 0018-fixed arming suppression holds — a watcher boundary after the settled tail adds zero further touches", async () => {
      const b = boot({ gateCompose: true });
      await driveShutdownDuringParkedCompose(b);

      // The 0018-fixed arm: the generation check DID suppress
      // `installHotReload`, so no watcher is armed and a change event + the
      // debounce boundary + a real-timer settle must add nothing — relative
      // to whatever the tail itself touched (at HEAD the tail's own
      // ["pi.getCommands"]; post-fix []). Snapshot-based so this control is
      // green in BOTH worlds: it pins that stage 2's tail fix must not
      // regress the arming suppression.
      const touchesAfterTail = [...b.harness.staleTouches];
      b.fakeWatcher.emit({
        kind: "change",
        path: join(thetaDir, "greet.theta"),
      });
      b.fakeClock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(
        b.harness.staleTouches,
        "the suppressed arming must stay suppressed: a watcher boundary adds zero further touches",
      ).toStrictEqual(touchesAfterTail);
      expect(
        quiesceLines(),
        "no quiesce line: nothing was armed, so nothing quiesces",
      ).toStrictEqual([]);
    });

    // --- Variant 2 — the invalidation lands BEFORE the compose's guarded
    // reads (gate ahead of composeExtensionInstance): the compose dies on its
    // first guarded read and the throw funnels into the factory catch arm ---

    it("bug 0022 / PIC-67 variant 2 (RED at HEAD): after a mid-compose shutdown the catch arm adds no guarded touch beyond the compose's own death-read", async () => {
      const b = boot({ gateBeforeCompose: true });
      const { notesBefore } = await driveShutdownDuringParkedCompose(b);

      // The compose was already in flight when the shutdown landed, so its
      // own guarded death-read is unavoidable — the existing reactive path:
      // released, it dies on `buildRuntimeRoot`'s `ctx.cwd` read and the
      // throw funnels into the compose-supplier catch arm. The zero-touch
      // obligation covers the factory TAIL: once the compose settles the
      // factory can know of the teardown without touching, so the catch arm
      // must add NOTHING — exactly ["ctx.cwd"], deliberately not []. At HEAD
      // this FAILS with ["ctx.cwd", "pi.getCommands"]: the catch-arm fallback
      // `registerFixtures(deps.fixtures)` performs one more guarded touch for
      // a fixture list that is empty in production.
      expect(
        b.harness.staleTouches,
        "PIC-67: exactly the compose pass's own in-flight death-read — the catch arm must add no touch after the compose settles",
      ).toStrictEqual(["ctx.cwd"]);

      // Invariants (green both worlds): the compose never resolved, so no
      // wiring may exist; nothing registers; nothing delivers; stderr stays
      // empty on both designed prefixes.
      expect(
        b.wiring(),
        "the compose died before resolving — no wiring may be captured",
      ).toBeUndefined();
      expect(
        b.harness.commands.size,
        "no slash command may register into the outgoing session",
      ).toBe(0);
      expect(
        b.harness.notes.length,
        "no note may be delivered post-invalidate",
      ).toBe(notesBefore);
      expect(
        cascades(),
        "no stderr cascade from the catch arm",
      ).toStrictEqual([]);
      expect(
        quiesceLines(),
        "no quiesce stderr line: the factory knew of the teardown without touching",
      ).toStrictEqual([]);
    });

    it("bug 0022 / PIC-67 variant 2 (RED at HEAD): the catch arm constructs zero diagnostics for the mid-compose death", async () => {
      const b = boot({ gateBeforeCompose: true });
      await driveShutdownDuringParkedCompose(b);

      // The catch arm has two constructions to suppress, neither of which a
      // wired emitter could deliver: the compose-supplier catch's
      // `theta/load/extension-compose-failed` for the `ctx.cwd` stale death,
      // then a second `theta/load/extension-bootstrap-failed` labelled
      // `pi.getCommands` from the fallback `registerFixtures`'s collision pass.
      // Spec-correct: the factory knows of the teardown the moment the
      // compose settles; it must construct NOTHING (the channel is dead and
      // PIC-67 clause (c) forbids the delivery attempt).
      expect(
        b.diagnostics,
        "zero diagnostics may be constructed once the compose settles on a known-torn-down runtime",
      ).toStrictEqual([]);
    });
  });
});
