// Phase 5 (DISCO-2) — step-5 watcher / hot-reload production wiring.
//
// This module is the single production caller that ties the previously-unwired
// hot-reload machinery together into the step-5 watcher subsystem
// (registration-steps.md#watcher-hot-reload-registration, package-and-settings.md
// §"Caching and reload" / §"Watcher-time reload failures"):
//
//   - `armWatcherWithTerminalRecovery` (watcher-recovery.ts) arms ONE watcher
//     over the discovery-root union + settings-file paths and surfaces the
//     PIC-55 terminal-recovery `theta/runtime/watcher-terminated` note;
//   - `ReloadDebouncer` (reload-debounce.ts) coalesces a burst of watcher
//     events into a single Clock-driven 250 ms reload and serializes rebuilds
//     across windows (PIC-49);
//   - on each debounced fire the reload re-runs discovery + compose
//     (`rediscover`), swaps the `ThetaRegistry` atomically via `rebuildAndSwap`
//     (PIC-36), re-registers the surviving thetas with pi (`reRegister`), emits
//     the `structuralChangeNote` when the registered theta SET changed, and
//     surfaces a swap-that-throws-before-publish as ERR-7
//     (`theta/runtime/registry-swap-failed`) on the `theta-system-note` channel;
//   - `detach()` tears the watcher down and cancels the pending debounce timer
//     for the `session_shutdown` teardown (registration-steps.md step 4);
//   - on first evidence of a shutdown-less runtime invalidation — a caught
//     host stale-ctx error from the reload-pass entry probe or from inside the
//     pass (bug 0018; session-shutdown-semantics.md PIC-67) — the watcher
//     quiesces permanently (torn-down + detach) and logs through the shared
//     `StaleQuiesceLog` latch; the PIC-55 terminal arm (watcher-recovery.ts)
//     shares the same latch, so the whole extension instance emits at most one
//     `theta hot-reload quiesced:` stderr line. No ERR-7 is attempted through
//     the invalidated channel.
//
// It reimplements none of the above — it only composes them against the live
// `pi` + `ctx` seams threaded from the composition root.

import type { Clock } from "../seams/clock";
import type { FileWatcher } from "../seams/file-watcher";
import { ReloadDebouncer, type RebuildOutcome } from "./reload-debounce";
import { armWatcherWithTerminalRecovery } from "./watcher-recovery";
import {
  ThetaRegistry,
  rebuildAndSwap,
  structuralChangeNote,
  type ParsedTheta,
} from "./reload-wiring";
import {
  emitDiagnosticBatch,
  sendSystemNote,
  type SystemNoteChannelDeps,
} from "./system-note-channel";
import type { Diagnostic } from "../diagnostics/diagnostic";
import { isStaleCtxError, StaleQuiesceLog } from "./stale-ctx";

/** Construction dependencies for the step-5 watcher / hot-reload wiring. */
export interface InstallHotReloadDeps {
  /** The injected `FileWatcher` seam armed over the roots (fake in tests). */
  readonly watcher: FileWatcher;
  /** The injected `Clock` seam the 250 ms debounce is measured against. */
  readonly clock: Clock;
  /** The discovery-root union plus the two settings-file paths to watch. */
  readonly roots: readonly string[];
  /** The live `ThetaRegistry` the reload swaps atomically (PIC-36). */
  readonly registry: ThetaRegistry;
  /**
   * The `theta-system-note` delivery channel. Carries the structural-change note
   * (informational) and the ERR-7 watcher-time reload failures
   * (`triggerTurn:false`, per package-and-settings.md §"Watcher-time reload
   * failures").
   */
  readonly channel: SystemNoteChannelDeps;
  /**
   * Re-run the five-source discovery walk + per-theta compose against the live
   * `ctx`, returning the freshly-composed runnable thetas. Watcher-time
   * load/parse/re-merge diagnostics route onto the `theta-system-note` channel
   * as ERR-7 inside this closure (the caller wires that emit).
   */
  readonly rediscover: () => Promise<readonly ParsedTheta[]>;
  /**
   * Re-register the surviving thetas with pi — the same `session_start`
   * registration step (cross-format collision pass + per-theta
   * `pi.registerCommand`). Sequenced before the atomic publish so a throw here
   * surfaces `theta/runtime/registry-swap-failed` and discards the swap (PIC-36).
   */
  readonly reRegister: (thetas: readonly ParsedTheta[]) => void;
  /** The slash names registered at `session_start` (structural-change baseline). */
  readonly initialNames: Iterable<string>;
  /**
   * Bug 0018 (PIC-67) — the stale-runtime entry probe: touch ONE cheap,
   * side-effect-free guarded host surface (production: the `ctx.cwd` getter)
   * and return normally on a live runtime. On an invalidated runtime the touch
   * throws the host's stale-ctx error — the ONLY staleness signal the host
   * exposes on the shutdown-less bare-`AgentSession.dispose()` path (no
   * `session_shutdown` fires, so `detach()` never ran) — and the reload pass
   * quiesces permanently instead of driving the whole compose pass into the
   * dead surfaces.
   */
  readonly probeRuntime: () => void;
}

/** The teardown handle the `session_shutdown` handler holds. */
export interface HotReloadHandle {
  /**
   * Tear the watcher down, cancel any pending debounce timer, and mark the
   * debouncer torn-down (PIC-57) so no new watcher-driven rebuild starts.
   */
  detach(): void;
  /**
   * PIC-57: mark the hot-reload debouncer torn-down without awaiting quiesce
   * (sub-step 4 (a)). Idempotent; also performed by `detach()`. Optional so
   * lightweight test doubles that only exercise `detach()` need not supply it.
   */
  markTornDown?(): void;
  /**
   * PIC-57: resolve once any already-in-flight watcher rebuild has quiesced
   * (sub-step 4 (b)). Optional for the same reason as `markTornDown`.
   */
  whenIdle?(): Promise<void>;
}

/**
 * Arm the step-5 watcher over the discovery-root union + settings-file paths,
 * wire a debounced reload onto its change stream, and return the teardown
 * handle. A synthetic changed-path label identifies the reload in the
 * registry-swap-failed diagnostic (the watcher coalesces a whole burst, so no
 * single path is authoritative).
 */
export function installHotReload(deps: InstallHotReloadDeps): HotReloadHandle {
  const RELOAD_CHANGED_PATH = "theta watcher";

  // The set of currently-registered slash names, updated after each successful
  // reload so the next window's structural-change decision compares against the
  // live registered set.
  let currentNames = new Set<string>(deps.initialNames);

  // ERR-7 emit: a watcher-time rebuild failure routes onto the
  // `theta-system-note` channel (`triggerTurn:false`) rather than a toast, per
  // package-and-settings.md §"Watcher-time reload failures".
  const emitErr7 = (diagnostic: Diagnostic): void => {
    emitDiagnosticBatch([diagnostic], deps.channel);
  };

  // PIC-57 torn-down flag: set by `markTornDown()` / `detach()` so a rebuild
  // that would otherwise start after teardown early-returns before touching the
  // (about-to-be-invalidated) `ctx` / `pi.*` surface. The debouncer itself also
  // suppresses new rebuilds once torn-down; this guard is the in-closure defence
  // for `runReload` per PIC-57.
  let tornDown = false;

  // Bug 0018 (PIC-67) fail-loud-once latch, shared with the PIC-55 terminal
  // arm (watcher-recovery.ts): whichever evidence site observes the stale
  // runtime first logs the single designed line; the other stays silent (a
  // stale terminal signal can precede a still-pending debounce boundary's
  // probe quiesce). Within THIS module the latch is defensive — the entry
  // tornDown guard, PIC-49 single-flight, and markTornDown clearing the
  // deferred re-arm make a second `quiesceOnStaleCtx` call structurally
  // unreachable.
  const staleLog = new StaleQuiesceLog();

  /**
   * Bug 0018 (PIC-67) — permanent quiesce on evidence of a shutdown-less
   * runtime invalidation (a caught host stale-ctx error): tear the watcher
   * down, mark the debouncer torn-down (PIC-57 — no further watcher-driven
   * rebuild can start), and emit exactly ONE designed stderr line. The ERR-7
   * emit is deliberately NOT attempted: the `theta-system-note` channel rides
   * the same invalidated runtime, so quiescence is the only reachable posture
   * — no valid delivery surface remains. The stderr line routes through the
   * shared `staleLog` latch (one line per extension instance across this arm
   * and the PIC-55 terminal arm). `unsub` / `debouncer` are assigned below at
   * install time, strictly before any reload can run.
   */
  const quiesceOnStaleCtx = (): void => {
    tornDown = true;
    debouncer.markTornDown();
    unsub();
    staleLog.log(
      "extension runtime invalidated without session_shutdown (bare " +
        "AgentSession.dispose()); watcher detached, hot reload halted for " +
        "this extension instance (bug 0018, PIC-67)",
    );
  };

  const runReload = async (): Promise<RebuildOutcome> => {
    // PIC-57: a rebuild must not run against an invalidated runtime — once
    // torn-down, no-op (no rediscover / rebuildAndSwap) and release the guard
    // via the discard outcome.
    if (tornDown) {
      return "discarded";
    }
    // Bug 0018 (PIC-67) entry probe: one deliberate guarded touch. The host
    // emits NO event and exposes NO non-throwing probe when a bare
    // `AgentSession.dispose()` invalidates the runtime, so this single touch is
    // the minimal deterministic detection; on the stale throw the pass quiesces
    // before any compose-pass surface (settings emit, `pi.getFlag`,
    // `pi.getCommands`, note delivery) is reached.
    try {
      deps.probeRuntime();
    } catch (probeError: unknown) { // allow-broad-catch: PIC-67 — session-shutdown-semantics.md#pic-67
      if (!isStaleCtxError(probeError)) {
        throw probeError;
      }
      quiesceOnStaleCtx();
      return "discarded";
    }
    // Re-run discovery + compose (the "hot-reload re-runs the computation" of
    // discovery-sources.md §"Discovery roots"). A throw out of the re-parse /
    // re-merge / re-compose pass (a `pi.registerTool` step, an AJV recompile,
    // an invalid settings re-merge, …) is captured and re-thrown from inside the
    // staged build below, so it surfaces uniformly as the ERR-7
    // `theta/runtime/registry-swap-failed` (PIC-36) rather than an unhandled
    // rejection.
    let thetas: readonly ParsedTheta[] | undefined;
    let discoverError: unknown;
    try {
      thetas = await deps.rediscover();
    } catch (rediscoverError: unknown) { // allow-broad-catch: theta/runtime/registry-swap-failed — package-and-settings.md
      // Bug 0018 (PIC-67) belt-and-braces: invalidation can land mid-flight,
      // after the entry probe passed — a guarded touch inside the rediscover
      // pass (or the stale-dead channel's rethrow) then surfaces here. Quiesce
      // instead of routing ERR-7 into the dead channel.
      if (isStaleCtxError(rediscoverError)) {
        quiesceOnStaleCtx();
        return "discarded";
      }
      discoverError = rediscoverError;
    }

    // Build-aside-then-publish (PIC-36): re-register with pi (the
    // `pi.registerTool`-equivalent step, sequenced before publish) inside the
    // staged build, then hand `rebuildAndSwap` the staged map. A captured
    // rediscover throw, or a throw out of re-registration, discards the swap and
    // surfaces ERR-7 (`theta/runtime/registry-swap-failed`); the prior registry
    // stays live. Bug 0018 (PIC-67): the stale-ctx escapes this catch can see
    // are note deliveries — the ERR-7 emit rethrowing off the stale channel, or
    // the structural note's own delivery — and both quiesce on this arm.
    // `reRegister` is NOT such an escape: the factory's `registerFixtures`
    // catches its own `pi.getCommands` / per-theta `pi.registerCommand` throws
    // internally (factory.ts), so a mid-flight invalidation that trips only
    // those swallowed arms lets a content-only swap publish against the dead
    // runtime — the next boundary's entry probe is the backstop that quiesces
    // that window. Anything unrecognised rethrows (the debouncer logs the
    // dropped rejection reason — reload-debounce.ts).
    try {
      const published = rebuildAndSwap(
        RELOAD_CHANGED_PATH,
        () => {
          if (discoverError !== undefined) {
            throw discoverError;
          }
          const staged = thetas as readonly ParsedTheta[];
          deps.reRegister(staged);
          return new Map(staged.map((theta) => [theta.slashName, theta] as const));
        },
        { registry: deps.registry, emitDiagnostic: emitErr7 },
      );
      if (!published) {
        // Discarded swap: no structural note, no baseline update — the registered
        // set is unchanged. The PIC-49 guard releases on this discard outcome.
        return "discarded";
      }

      // Structural-change note (PIC-37/38): emit only when the registered theta
      // SET changed (files added or removed), comparing against the last
      // successfully-registered set. Content edits that leave the set unchanged
      // produce an empty added/removed pair and no note.
      const nextNames = new Set(
        (thetas as readonly ParsedTheta[]).map((theta) => theta.slashName),
      );
      const added = [...nextNames].filter((name) => !currentNames.has(name));
      const removed = [...currentNames].filter((name) => !nextNames.has(name));
      const note = structuralChangeNote(added, removed);
      if (note !== undefined) {
        sendSystemNote(note, deps.channel);
      }
      currentNames = nextNames;
      return "published";
    } catch (swapError: unknown) { // allow-broad-catch: PIC-67 — session-shutdown-semantics.md#pic-67
      if (!isStaleCtxError(swapError)) {
        throw swapError;
      }
      quiesceOnStaleCtx();
      return "discarded";
    }
  };

  const debouncer = new ReloadDebouncer({ clock: deps.clock, rebuild: runReload });

  // Arm ONE watcher over the union of discovery roots + settings-file paths.
  // Each change feeds the debouncer (drop-and-reschedule coalescing); the
  // terminal-recovery posture is wired onto the seam's `onTerminate` channel.
  const unsub = armWatcherWithTerminalRecovery({
    watcher: deps.watcher,
    roots: deps.roots,
    onChange: () => debouncer.onWatcherEvent(),
    registry: deps.registry,
    channel: deps.channel,
    staleLog,
  });

  return {
    detach(): void {
      // Sub-step-4 teardown order: tear the watcher down, then cancel the
      // pending debounce timer and mark the debouncer torn-down (PIC-57) so a
      // window that closed during teardown does not run a rebuild against the
      // about-to-be-invalidated runtime.
      unsub();
      debouncer.cancel();
      tornDown = true;
      debouncer.markTornDown();
    },
    markTornDown(): void {
      // PIC-57 sub-step 4 (a): suppress new rebuilds without awaiting quiesce.
      tornDown = true;
      debouncer.markTornDown();
    },
    whenIdle(): Promise<void> {
      // PIC-57 sub-step 4 (b): let an already-in-flight rebuild quiesce.
      return debouncer.whenIdle();
    },
  };
}
