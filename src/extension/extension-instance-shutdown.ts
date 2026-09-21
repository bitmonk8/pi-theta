// Extension-instance session_shutdown handler over the factory's live lifecycle slots.

import type { SessionShutdownEvent } from "@earendil-works/pi-coding-agent";
import type { Diagnostic } from "../diagnostics/diagnostic";
import { ActiveInvocationRegistry } from "../runtime/active-invocation-registry";
import type {
  PlacementRegistry,
  PlacementRegistrationBinding,
} from "../runtime/subagent-placement-registry";
import type { ResultChannelClient } from "../runtime/subagent-result-channel";
import type { Clock } from "../seams/clock";
import { evalShutdownShortCircuitWithReadFailover } from "./drain-state";
import type { ExecutionStatusBus } from "./execution-status/types";
import type { ThetaExtensionDeps } from "./factory-deps";
import type { HotReloadHandle } from "./hot-reload";
import type { ThetaRegistry } from "./reload-wiring";
import { SDK_SURFACE_INVENTORY } from "./sdk-inventory";
import {
  runSessionShutdown,
  type ForwardingSignalSource,
  type SessionShutdownDeps,
} from "./session-shutdown";

/**
 * Bug 0021 (PIC-68): the teardown-reach residue of one superseded compose
 * generation. A repeat `session_start`'s supersede-before-publish step detaches
 * the outgoing generation's watcher and drains its registry immediately, but
 * its in-flight invocation registry and forwarding-signal list must stay
 * reachable so ONE later `session_shutdown` can cancel + reason-stamp the
 * invocations (sub-steps 2/3) and detach the listeners (sub-step 5) across
 * every generation the instance ever published — not only the latest.
 */
export interface SupersededGeneration {
  readonly activeInvocations: ActiveInvocationRegistry | undefined;
  readonly forwardingSignals: ForwardingSignalSource[] | undefined;
}

/**
 * Live view of one factory instance's lifecycle state. Mutable slots are
 * accessor-backed by the factory so teardown reads and clears the same bindings
 * that compose and slash dispatch use, without snapshotting a generation.
 */
export interface ExtensionInstanceState {
  hotReloadHandle: HotReloadHandle | undefined;
  readonly liveRegistry: ThetaRegistry | undefined;
  readonly liveClock: Clock | undefined;
  liveActiveInvocations: ActiveInvocationRegistry | undefined;
  liveForwardingSignals: ForwardingSignalSource[] | undefined;
  shutdownEventsObserved: number;
  liveStatusBus: ExecutionStatusBus | undefined;
  liveResultChannel: ResultChannelClient | undefined;
  readonly supersededGenerations: SupersededGeneration[];
  readonly placementBinding: PlacementRegistrationBinding;
  readonly placementRegistry: PlacementRegistry;
}

/**
 * `session_shutdown` (step 4) — run the five-sub-step teardown
 * (session-shutdown-semantics.md): sub-step 1 (drain + init drain-state
 * tag) on the latest registry, sub-steps 2/3 over the MERGED in-flight
 * invocation registry, sub-step 4 (watcher-close + debounce-cancel) via
 * the captured teardown handle, and sub-step 5 over the MERGED
 * forwarding-signal list. Bug 0021 (PIC-68) — teardown reach across
 * generations: the merged inputs span every generation the instance has
 * published (the supersession fold plus the latest), so one shutdown's
 * reach stays complete even after shutdown-less repeat `session_start`
 * deliveries; sub-steps 1/4 operate on the latest generation only because
 * the superseded generations were already drained/detached at
 * supersession time. The whole handler body stays wrapped in the
 * never-throw factory boundary so a throw surfaces one diagnostic rather
 * than propagating into the host teardown. `runSessionShutdown` is async
 * and the host awaits a returned promise (`emitSessionShutdownEvent` →
 * `await handler(...)`), so the handler returns it inside the try to
 * preserve await-ordering.
 */
export function handleSessionShutdown(
  event: SessionShutdownEvent,
  state: ExtensionInstanceState,
  deps: ThetaExtensionDeps,
  bootstrapFailedDiagnostic: (
    capability: "pi.on",
    caught: unknown,
    extra: { readonly event: "session_shutdown" },
  ) => Diagnostic,
): Promise<void> | undefined {
  // Bug 0018 (PIC-67), arming check subsumed by bug 0022's
  // compose-settle gate: record the delivery before anything can throw
  // or short-circuit, so an in-flight `session_start` compose observes
  // it at its compose-settle boundary even when the lazy reads below
  // no-op this teardown.
  state.shutdownEventsObserved += 1;
  try {
    // Read the live resources LAZILY (the subscription fires before compose
    // runs). No live registry/clock means compose never ran / failed —
    // there is nothing wired to tear down, so no-op safely.
    const registry = state.liveRegistry;
    const clock = state.liveClock;
    if (registry === undefined || clock === undefined) {
      return;
    }

    // Handler-entry short-circuit (spec steps I+II, PIC-31 idempotence):
    // read the live drain state under the read-failover. A prior
    // `session_shutdown` left the tag set, so a re-delivery short-circuits
    // here (host-prerequisites clause (b)); a `readDrainState` throw fails
    // OPEN (returns `false`) → proceed to the full five-sub-step teardown.
    if (
      evalShutdownShortCircuitWithReadFailover(() =>
        registry.readDrainState(),
      )
    ) {
      return;
    }

    // Bug 0021 (PIC-68): capture the teardown handle at the lazy-read
    // point and build BOTH sub-step-4 adapters below over the captured
    // local — the mutable slot is cleared before `runSessionShutdown`'s
    // awaited sequence reaches sub-step 4, so an adapter reading the
    // slot at call time would observe `undefined` and skip the detach.
    const handle = state.hotReloadHandle;

    // Bug 0021 (PIC-68) — teardown reach across generations: sub-steps
    // 2/3 consume ONE merged handler-local `ActiveInvocationRegistry`
    // (the superseded generations' entries in supersession order, then
    // the latest generation's) and sub-step 5 consumes the concatenated
    // forwarding-signal lists in the same order. Entries are shared
    // references, so the reason-stamp/abort and the listener detach
    // reach the real objects; the merged containers are handler-local
    // and discarded with this teardown.
    const mergedActiveInvocations = new ActiveInvocationRegistry();
    const mergedForwardingSignals: ForwardingSignalSource[] = [];
    for (const generation of state.supersededGenerations) {
      for (const entry of generation.activeInvocations?.snapshot() ?? []) {
        mergedActiveInvocations.add(entry);
      }
      mergedForwardingSignals.push(...(generation.forwardingSignals ?? []));
    }
    for (const entry of state.liveActiveInvocations?.snapshot() ?? []) {
      mergedActiveInvocations.add(entry);
    }
    mergedForwardingSignals.push(...(state.liveForwardingSignals ?? []));

    const shutdownDeps: SessionShutdownDeps = {
      registry,
      // Increment B1, widened by bug 0021: the merged registry above, so
      // sub-step 2 (cancel in-flight) + sub-step 3 (await dispose)
      // operate on the REAL entries of every published generation. Empty
      // when nothing is in flight, keeping that path an instant no-op.
      activeInvocations: mergedActiveInvocations,
      clock,
      // ClosableWatcher ADAPTER — documented spec-vs-impl drift: the spec
      // deps model TWO watchers (`discoveryWatcher` + `settingsWatcher`)
      // plus a raw `clock.clearTimeout(debounceHandle)`; production runs
      // ONE union `FileWatcher` + a `ReloadDebouncer` behind
      // `HotReloadHandle.detach()` (which applies the torn-down mark —
      // itself cancelling the pending debounce — and then the unsub —
      // hot-reload.ts). So sub-step 4's
      // watcher-close + debounce-cancel are BOTH delegated to `detach()`
      // here; `settingsWatcher` is a no-op (the single union watcher
      // already covers the settings paths, detached by this adapter) and
      // `debounceHandle` is `undefined` (the debounce is cancelled inside
      // `detach()`, not via a raw `TimerHandle`). The adapter reconciles
      // the two shapes.
      discoveryWatcher: {
        close: (): void => {
          handle?.detach();
        },
      },
      settingsWatcher: { close: (): void => {} },
      debounceHandle: undefined,
      // PIC-57 sub-step 4: quiesce the REAL hot-reload debouncer through
      // the same `HotReloadHandle` the watcher-close adapter detaches.
      // `markTornDown()` suppresses new watcher rebuilds; `whenIdle()`
      // lets an already-in-flight rebuild complete against the still-live
      // ctx before the handler returns and Pi invalidates the runtime.
      // Both members are optional on `HotReloadHandle`, so a lightweight
      // handle that only supplies `detach()` degrades to a no-op quiesce.
      debouncer:
        handle !== undefined
          ? {
              markTornDown: (): void => {
                handle.markTornDown?.();
              },
              whenIdle: (): Promise<void> =>
                handle.whenIdle?.() ?? Promise.resolve(),
            }
          : undefined,
      // Increment B2, widened by bug 0021: the merged forwarding-signal
      // list above, so sub-step 5 detaches the listeners still attached
      // for an invocation in-flight at shutdown under ANY published
      // generation. Empty when nothing was ever pushed, keeping that
      // path an instant no-op.
      forwardingSignals: mergedForwardingSignals,
      // PIC-46: the single injected copy of the closed-set snapshot
      // (`SessionShutdownEvent.reason`'s `type-union-snapshot` row); the
      // unknown-reason rule reads it, no separate copy lives here.
      inventory: SDK_SURFACE_INVENTORY,
      sink: {
        emit: (line: unknown): void => {
          console.error(line);
        },
        serialise: (d: Diagnostic): string => JSON.stringify(d),
      },
    };

    // Bug 0021 (PIC-68): consume the per-generation state synchronously,
    // before the awaited teardown runs — the deps above already hold
    // every reference the five sub-steps need. A later
    // start-after-shutdown supersession is then a structural no-op
    // (nothing left to fold, drain idempotent, no handle to detach), so
    // no generation can be torn down twice. `liveRegistry`/`liveClock`
    // are KEPT so the host-prerequisites clause-(b) re-delivery
    // short-circuit above still runs through the drain-state read as
    // pinned.
    state.hotReloadHandle = undefined;
    state.liveActiveInvocations = undefined;
    state.liveForwardingSignals = undefined;
    // EXST-2: the bus is torn down with the instance, so a fresh
    // `/reload` instance starts with a fresh bus and every sink
    // un-degraded. `dispose()` is idempotent and never throws.
    state.liveStatusBus?.dispose();
    state.liveStatusBus = undefined;
    state.supersededGenerations.length = 0;
    // RFC-0012 §3: the child's result channel closes AFTER the five
    // sub-steps have run — sub-step 3 awaits the in-flight invocation
    // whose envelope rides it — so the last frame is on the wire before
    // the socket ends. Consumed here so a re-delivery finds nothing.
    const resultChannel = state.liveResultChannel;
    state.liveResultChannel = undefined;
    // RFC-0012 §5: release the offer subscription and forget the
    // registered backends — a repeat `session_start` re-discovers into a
    // fresh set, and no handler of this instance outlives it on the bus.
    state.placementBinding.unsubscribe();
    state.placementRegistry.clear();

    // The classifier reads `event.reason` in its own `try` (PIC-47), so
    // this call must not pre-read the property: a throwing getter has to
    // route to `session-shutdown-reason-unknown`, not to this `catch`'s
    // `extension-bootstrap-failed`. `event` (a `SessionShutdownEvent`)
    // satisfies `SessionShutdownEventLike` structurally, so it is passed
    // through unread.
    return runSessionShutdown(event, shutdownDeps).finally(() => {
      resultChannel?.close();
    });
  } catch (e: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
    deps.emitDiagnostic?.(
      bootstrapFailedDiagnostic("pi.on", e, { event: "session_shutdown" }),
    );
    return;
  }
}
