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
//     the `structuralChangeNote` keyed on the debounce window's netted
//     `.theta`/`.thetalib` add/unlink PATHS (registration-steps.md §Structural
//     changes; PIC-38 both-arrays no-dedup — a path unlinked+added in one
//     window counts in both `added` and `removed`), with absolute paths as the
//     payload (runtime-event-channel.md), and surfaces a
//     swap-that-throws-before-publish as ERR-7
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
import type { FileWatcher, FileWatchEvent } from "../seams/file-watcher";
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
   * Bug 0312 (Option 1, docs/bugs/0312-out-of-root-thetalib-edits-invisible-
   * stale-imports.md): the freshly-computed watch set for the most recently
   * completed reload pass — read AFTER `rediscover` resolves, so it reflects
   * that pass's `.thetalib` import closure. OPTIONAL and ADDITIVE: `rediscover`'s
   * own signature does not change (many test constructors depend on it), so
   * this is a separate channel the caller wires from the same pass. Omitted,
   * the single-armed-watcher invariant holds exactly as before (arm once,
   * never re-arm) — the shipped behaviour for every constructor that has not
   * adopted the widened closure scope yet.
   */
  readonly currentWatchRoots?: () => readonly string[];
  /**
   * Re-register the surviving thetas with pi — the same `session_start`
   * registration step (cross-format collision pass + per-theta
   * `pi.registerCommand`). Sequenced before the atomic publish so a throw here
   * surfaces `theta/runtime/registry-swap-failed` and discards the swap (PIC-36).
   */
  readonly reRegister: (thetas: readonly ParsedTheta[]) => void;
  /**
   * The slash names registered at `session_start`. Retained because three call
   * sites still supply it and dropping it from the interface would red their
   * object literals: `production-composition.ts`,
   * `tests/hot-reload-stale-quiesce-arms.test.ts`, and
   * `tests/supersession-inflight-rebuild-quiesce.test.ts`. Bug 0311 moved the
   * structural-note basis off the registered-name set onto the debounce-window
   * event batch, so this field is no longer read here.
   */
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
   * Mark the debouncer torn-down (PIC-57) BEFORE tearing the watcher down —
   * the containment-first order `quiesceOnStaleCtx` uses for the identical
   * acts (bug 0029): a throwing unsub then strands only the OS-level watcher
   * handles, because any event a still-attached watcher goes on delivering
   * reaches a debouncer that is already torn down and starts no rebuild.
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
 * A `.theta` / `.thetalib` source path: the structural-change note is scoped
 * to these two extensions (registration-steps.md §Structural changes) — other
 * watched paths (the settings files) never contribute to `added`/`removed`.
 * Open-coded `endsWith`, matching the extension-check idiom used throughout
 * this codebase (e.g. production-composition.ts's format dispatch); no shared
 * classifier exists.
 */
function isThetaSourcePath(path: string): boolean {
  return path.endsWith(".theta") || path.endsWith(".thetalib");
}

/**
 * Bug 0312: whether two watch-root lists name the SAME set of paths,
 * order-independent — `currentWatchRoots` recomputes its array fresh each
 * pass, so array identity or element order is never the right comparison for
 * "did the armed set actually change".
 */
function sameRootSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const set = new Set(a);
  return b.every((root) => set.has(root));
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

  // Bug 0312 (F2): PIC-55 terminal-signal latch. A terminal signal is TERMINAL
  // — registration-steps.md PIC-55 leaves the watcher torn down rather than
  // re-armed "until the operator reloads", and the runtime has already emitted
  // the persistent `theta/runtime/watcher-terminated` note announcing that
  // halt. The terminal recovery path (watcher-recovery.ts `onTerminate`) does
  // NOT mark the debouncer torn-down (by design — the registry stays live), so
  // a debounce window pending at termination still fires `runReload`; without
  // this latch a pass whose closure differs from the armed set would re-arm and
  // silently resume hot-reload after telling the operator it was halted. The
  // wrapper below DECORATES (not replaces) `deps.watcher`: it sets the latch
  // BEFORE delegating to the real `onTerminate`, so the recovery arm tears down
  // the same seam it always did while the re-arm branch reads a truthful latch.
  let terminated = false;
  const terminalLatchWatcher: FileWatcher = {
    watch: (roots, handler, onTerminate) =>
      deps.watcher.watch(roots, handler, (termination) => {
        terminated = true;
        onTerminate?.(termination);
      }),
  };

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

  const runReload = async (batch: readonly FileWatchEvent[]): Promise<RebuildOutcome> => {
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

      // Structural-change note (PIC-37/38): keyed on the debounce window's
      // netted `.theta`/`.thetalib` add/unlink PATHS, not on any registered-
      // name diff — a content edit that changes whether a file composes
      // (parse breaks/fixes) adds or removes no file, so it draws no note; a
      // same-window unlink+add of one path draws the note with N=2. Dedup is
      // WITHIN role only (a `Set` per role) — PIC-38 forbids dedup ACROSS
      // roles, so a path unlinked+added in one window appears in BOTH arrays.
      const added = [...new Set(
        batch.filter((event) => event.kind === "add" && isThetaSourcePath(event.path))
          .map((event) => event.path),
      )];
      const removed = [...new Set(
        batch.filter((event) => event.kind === "unlink" && isThetaSourcePath(event.path))
          .map((event) => event.path),
      )];
      const note = structuralChangeNote(added, removed);
      if (note !== undefined) {
        sendSystemNote(note, deps.channel);
      }

      // Bug 0312 (Option 1): re-arm the ONE watcher when this published pass's
      // `.thetalib` import closure changed the watch set — widened by a new
      // out-of-root import, or narrowed by its removal. `currentWatchRoots` is
      // read AFTER `rebuildAndSwap` publishes, so it reflects the set that just
      // went live, and only on a genuine publish (a discarded swap changes
      // nothing to re-arm onto). Absent the optional dep, behaviour is
      // unchanged: arm once at install time, never again.
      //
      // Gated on `!tornDown` (F1): both teardown paths (session_shutdown
      // sub-step 4 and supersession) can flip `tornDown` DURING the awaits
      // above; an abandoned in-flight rebuild whose closure changed must NOT
      // arm a fresh watcher that nothing tears down (the `unsub()` on the
      // stale arm is an idempotent no-op after `detach()`), mirroring the
      // PIC-57 posture the entry guard, `markTornDown()`, and
      // `quiesceOnStaleCtx` all share. Gated on `!terminated` (F2): a PIC-55
      // terminal signal governs — the watcher stays torn-down-until-`/reload`,
      // never resurrected by a pending debounce window's re-arm.
      if (!tornDown && !terminated && deps.currentWatchRoots !== undefined) {
        const freshRoots = deps.currentWatchRoots();
        if (!sameRootSet(armedRoots, freshRoots)) {
          // Teardown-then-arm (not a supplementary watcher): the single-
          // armed-watcher invariant (registration-steps.md step 5) is
          // preserved by re-arming the one subscription, not by holding two.
          // The debouncer is REUSED across the swap (bug 0311: an in-flight
          // debounce batch must not be lost to a fresh instance), and `unsub`
          // is updated in place so `detach()` / `quiesceOnStaleCtx()` always
          // tear down the CURRENTLY-armed subscription.
          unsub();
          armedRoots = freshRoots;
          unsub = armWatcherWithTerminalRecovery({
            watcher: terminalLatchWatcher,
            roots: freshRoots,
            onChange: (event) => debouncer.onWatcherEvent(event),
            registry: deps.registry,
            channel: deps.channel,
            staleLog,
          });
        }
      }
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

  // Bug 0312: the currently-armed root set, mutated in place by the re-arm
  // branch above so a later publish's comparison is against what is ACTUALLY
  // armed right now, not the install-time set.
  let armedRoots: readonly string[] = deps.roots;

  // Arm ONE watcher over the union of discovery roots + settings-file paths
  // (plus, per bug 0312, any resolved out-of-root `.thetalib` closure dirs
  // `deps.roots` already carries at install time). Each change feeds the
  // debouncer (drop-and-reschedule coalescing); the terminal-recovery posture
  // is wired onto the seam's `onTerminate` channel. `unsub` is mutable
  // (bug 0312): a later re-arm replaces both the subscription and this
  // reference so every caller of `unsub()` tears down the CURRENT arming.
  let unsub = armWatcherWithTerminalRecovery({
    watcher: terminalLatchWatcher,
    roots: deps.roots,
    onChange: (event) => debouncer.onWatcherEvent(event),
    registry: deps.registry,
    channel: deps.channel,
    staleLog,
  });

  return {
    detach(): void {
      // Containment-first (bug 0029): mark torn-down BEFORE the one fallible
      // step, the order `quiesceOnStaleCtx` above already uses for the
      // identical acts. A throwing `unsub()` then strands only the OS-level
      // watcher handles — any event a still-attached watcher goes on
      // delivering feeds a debouncer already torn down, so `runReload`'s
      // `tornDown` guard and `ReloadDebouncer`'s own window guard both hold
      // and no rebuild can start from it. One containment order for the
      // module, not an outlier; `markTornDown()` already cancels the pending
      // timer, so no separate `debouncer.cancel()` call is needed here.
      tornDown = true;
      debouncer.markTornDown();
      unsub();
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
