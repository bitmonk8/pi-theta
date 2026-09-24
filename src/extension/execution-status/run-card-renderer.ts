// RFC 0015 (D5/D7) — the run-card CONTROLLER: the impure shell composing the
// live `theta-run` renderer (render/run-card-component.ts), the bounded
// per-invocation card-state store, the heat-LUT cache
// (render/heat-lut-cache.ts), the EXST-6 tick rider, and the TUI-handle
// capture. D7's PTQ-1260 decomposition split the former single closure along
// its concern seams: the component/renderer (Seam A) and the LUT cache
// (Seam B) live in their own modules behind explicit deps records, and the
// animation predicate (Seam C) is the module-level pure `animationOwed`
// below — what remains here is the store, the TUI/OSC-11 wiring, and the
// controller surface factory.ts composes.
//
// Injection: `createEntryChannel(pi, controller.renderer)` swaps this renderer
// in for D3's static compact form (the D3→D5 seam); the channel's
// registration/degrade discipline is untouched by the swap.
//
// Animation (RFC §Animation): NO new timer machinery. `controller.sink` is an
// execution-status `StatusSink` riding the EXST-6 coalesced 200 ms tick; while
// (a) any heat entry is younger than `HEAT_FADE_MS` or (b) any child is
// running, it calls `tui.requestRender()`. That alone re-renders the card:
// pi's chat container re-invokes every child Component's `render(width)` on a
// TUI render pass (pi-tui `Container.render` holds no line cache), and the
// live card component reads bus state at render time — so no
// `CustomEntryComponent.invalidate()` reach-in is needed (that host method is
// reserved for expand-toggles and host-side invalidation, which re-invoke the
// renderer; the per-file styled-line cache therefore lives on the card-state
// store here, keyed by invocationId, per spike Deviation 4). A third
// trigger owns the FINAL frame (bug 0490, theta-run-entries.md
// #pic-75-eviction-repaint): when the predicate goes false the SINK goes
// quiet (the bus may keep ticking for a running node) and nothing repaints
// the card on its own, so the sink requests one repaint when a
// node it saw departs (evicted after its linger), whenever the bus clears
// it, and on the first render after a clear (evictions following an `off`
// window) — that repaint is what puts the static degradation on screen.
//
// Blend-base acquisition (spike Deviation 2, recorded design): the verified
// OSC 11 path is pi-tui's `TUI.queryTerminalBackgroundColor({timeoutMs})`,
// which needs the TUI handle no `src/` code passively receives. The handle is
// captured at composition time via the `(tui, theme)` FACTORY overload of
// `ctx.ui.setWidget` — a zero-line component registered under a private key
// and removed again in the same call (`captureTuiRenderHandle`), so no
// lasting widget exists and the D6 retirement of the widget SINK is
// untouched. The capture only ever runs in the TUI composition; everywhere
// else the ladder falls through (theme `text`-fg luminance → polarity
// constants). Rendering NEVER blocks on the async query: the LUT is built
// from the fallback endpoints immediately and rebuilt (plus one
// `requestRender`) when the query resolves.

import { readFileSync } from "node:fs";
import type { Component } from "@earendil-works/pi-tui";
import type { Clock } from "../../seams/clock";
import type {
  ExecutionStatusBus,
  ExecutionStatusSnapshot,
  StatusSink,
} from "./types";
import { MAX_TRACKED_INVOCATIONS } from "./types";
import {
  createThetaRunEntryRenderer,
  type ThetaRunEntryRenderer,
} from "./entry-channel";
import { HEAT_FADE_MS } from "./render/heat";
import { createHeatLutCache } from "./render/heat-lut-cache";
import {
  createCardState,
  createRunCardRenderer,
  type CardState,
} from "./render/run-card-component";

/** OSC 11 query budget: generous for a slow terminal, never render-blocking. */
const OSC11_QUERY_TIMEOUT_MS = 1500;

/**
 * The narrow TUI surface the card touches — structural, so no `TUI` import
 * joins the peer-named-import inventory. `requestRender` is the tick's whole
 * output; `queryTerminalBackgroundColor` is the optional OSC 11 leg
 * (`pi-tui/dist/tui.d.ts:256`, spike Deviation 2's verified path).
 */
export interface TuiRenderHandle {
  requestRender(): void;
  queryTerminalBackgroundColor?(options: {
    timeoutMs: number;
  }): Promise<{ r: number; g: number; b: number } | undefined>;
}

/** The widget surface the capture probes (the FACTORY overload's shape). */
interface TuiCaptureUi {
  setWidget?: (key: string, content: unknown) => void;
}

/** The private, immediately-removed capture key (never a visible widget). */
const TUI_CAPTURE_WIDGET_KEY = "theta-run-card-tui-capture";

/**
 * Capture the TUI handle through the `(tui, theme)` factory overload of
 * `ctx.ui.setWidget`: the factory runs synchronously in a TUI host (handing
 * over `this.ui`), returns a zero-line component, and the widget is removed
 * again in the same call — no lasting widget, no visible output. In a
 * non-TUI host `setWidget` is the runner no-op (the factory never runs) and
 * the capture returns `undefined`, which is the ladder's fall-through signal.
 * PIC-73 posture throughout: `typeof`-probed, per-call guarded, silent.
 */
export function captureTuiRenderHandle(ui: unknown): TuiRenderHandle | undefined {
  const surface = ui as TuiCaptureUi | undefined;
  if (typeof surface?.setWidget !== "function") {
    return undefined;
  }
  let captured: unknown;
  try {
    surface.setWidget(TUI_CAPTURE_WIDGET_KEY, (tui: unknown): Component => {
      captured = tui;
      return { render: (): string[] => [], invalidate: (): void => {} };
    });
    surface.setWidget(TUI_CAPTURE_WIDGET_KEY, undefined);
  } catch { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
    return undefined;
  }
  const handle = captured as Partial<TuiRenderHandle> | undefined;
  if (typeof handle?.requestRender !== "function") {
    return undefined;
  }
  return {
    requestRender: (): void => handle.requestRender!(),
    ...(typeof handle.queryTerminalBackgroundColor === "function"
      ? {
          queryTerminalBackgroundColor: (options: {
            timeoutMs: number;
          }): Promise<{ r: number; g: number; b: number } | undefined> =>
            handle.queryTerminalBackgroundColor!(options),
        }
      : {}),
  };
}

/**
 * Production source-bytes read for the viewport (the card shows the script
 * text the running program was lexed from; `styledLinesFor` caches per file,
 * so each path is read at most once per card). A filesystem error — missing
 * file, permissions, a directory — degrades to "no viewport" rather than a
 * throwing render; only a non-fs throw (no `code`) propagates as a defect.
 */
export function productionReadSourceBytes(path: string): Uint8Array | undefined {
  try {
    // The read is once-per-file-per-card (the styled-line cache fronts it) and
    // theta sources are small; a render-path async read would force the whole
    // Component.render chain async, which pi-tui does not model.
    return readFileSync(path); // allow-sync: once-per-card small-file read behind the styled-line cache; Component.render is synchronous by host contract
  } catch (error: unknown) { // allow-broad-catch: pi-sdk-boundary — narrow re-throw below: only fs errno errors (string `code`) degrade to no-viewport; every other throw propagates
    if (
      error instanceof Error &&
      typeof (error as NodeJS.ErrnoException).code === "string"
    ) {
      return undefined;
    }
    throw error;
  }
}

export interface RunCardControllerDeps {
  /** Lazy latch: the LIVE extension-instance bus (published at compose). */
  readonly bus: () => Pick<ExecutionStatusBus, "snapshot" | "tracks"> | undefined;
  /** Lazy latch: the instance `Clock` (PIC-12; published at compose). */
  readonly clock: () => Clock | undefined;
  /** Source bytes for the viewport (production: `productionReadSourceBytes`). */
  readonly readSourceBytes: (path: string) => Uint8Array | undefined;
}

export interface RunCardController {
  /** The live `theta-run` renderer — inject via `createEntryChannel`'s seam. */
  readonly renderer: ThetaRunEntryRenderer;
  /** The EXST-6 tick rider (push into the bus's sink list, TUI only). */
  readonly sink: StatusSink;
  /** Latch the composition-captured TUI handle (idempotent, first wins). */
  attachTui(handle: TuiRenderHandle): void;
}

/**
 * RFC §Animation predicate (PTQ-1260 Seam C: module-level and pure — it reads
 * only its parameters and `HEAT_FADE_MS`): fresh heat (< `HEAT_FADE_MS`, or
 * any in-flight effect span holding its line clamped — the D7 set) or a
 * running child owes the card another frame.
 */
export function animationOwed(snapshot: ExecutionStatusSnapshot, nowMs: number): boolean {
  for (const node of snapshot.nodes) {
    if (node.parentInvocationId !== undefined && node.endedAtMs === undefined) {
      return true; // a running child (its badge/roster ages advance)
    }
    const heat = node.heat;
    if (heat === undefined) {
      continue;
    }
    if (heat.clampedLines !== undefined) {
      return true; // full-heat clamps hold until each span's settle (D7 ruling)
    }
    for (const entry of heat.entries) {
      if (nowMs - entry.lastHitMs < HEAT_FADE_MS) {
        return true;
      }
    }
  }
  return false;
}

export function createRunCardController(deps: RunCardControllerDeps): RunCardController {
  // Instance state — no module-level binding. The card map is bounded like the
  // publisher's open-run map: a defect path that never ends a drive must not
  // grow it unboundedly.
  const cards = new Map<string, CardState>();
  const staticFallback = createThetaRunEntryRenderer();
  const lutCache = createHeatLutCache();
  let tui: TuiRenderHandle | undefined;

  function cardStateFor(invocationId: string): CardState {
    const existing = cards.get(invocationId);
    if (existing !== undefined) {
      return existing;
    }
    while (cards.size >= MAX_TRACKED_INVOCATIONS) {
      const oldest = cards.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      cards.delete(oldest);
    }
    const fresh = createCardState();
    cards.set(invocationId, fresh);
    return fresh;
  }

  /** Guarded render request; a throwing handle is dropped (EXST-8 posture). */
  function requestRender(): void {
    if (tui === undefined) {
      return;
    }
    try {
      tui.requestRender();
    } catch { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
      tui = undefined;
    }
  }

  const renderer = createRunCardRenderer({
    bus: deps.bus,
    clock: deps.clock,
    readSourceBytes: deps.readSourceBytes,
    cardStateFor,
    ensureLut: (theme) => lutCache.ensureLut(theme),
    staticFallback,
  });

  // Bug 0490: the ids the previous sink call saw. A node leaving the bus
  // (linger expired → evicted) owes ONE repaint so its card's static
  // degradation reaches the screen — without it the last painted frame is
  // the live form (`⟳`, `▶` on the final effect line) indefinitely, and a
  // completed drive reads as a wedged one.
  let seenIds = new Set<string>();
  // Set by every `clear()`: the ids it drops are no longer comparable, and
  // nodes that start and end while the bus is `off` are never seen at all,
  // so the next `render()` repaints unconditionally once — an eviction that
  // arrives through `render()` (other nodes still tracked) after an `off`
  // window is otherwise invisible to the departure check.
  let repaintOnNextRender = false;

  const sink: StatusSink = {
    id: "run-card",
    render(snapshot, _view, _verbosity, nowMs): void {
      const ids = new Set(snapshot.nodes.map((node) => node.invocationId));
      let departed = repaintOnNextRender;
      repaintOnNextRender = false;
      if (!departed) {
        for (const id of seenIds) {
          if (!ids.has(id)) {
            departed = true;
            break;
          }
        }
      }
      seenIds = ids;
      if (tui === undefined) {
        return;
      }
      if (departed || animationOwed(snapshot, nowMs)) {
        requestRender();
      }
    },
    clear(): void {
      // Nothing pinned: the card is a transcript entry, not a footer/widget
      // surface. The bus clears on an empty-snapshot tick (after the last
      // eviction, or any dirty mark with no node present), on verbosity
      // dropping to `off`, and on dispose; each owes one repaint (bug 0490),
      // unconditional on what this sink last saw — the `off` clear resets
      // `seenIds`, and a later eviction clear must still repaint. No storm:
      // an empty bus schedules no ticks, so clears are bounded by
      // publications and verbosity changes.
      seenIds = new Set();
      repaintOnNextRender = true;
      requestRender();
    },
  };

  return {
    renderer,
    sink,
    attachTui(handle: TuiRenderHandle): void {
      if (tui !== undefined) {
        return; // first capture wins (one handle per extension instance)
      }
      tui = handle;
      // Fire the OSC 11 query once, fire-and-forget: rendering proceeds on
      // the fallback endpoints; a resolved background rebuilds the LUT and
      // requests one repaint. A rejecting/absent query leaves the fallback.
      try {
        const pending = handle.queryTerminalBackgroundColor?.({
          timeoutMs: OSC11_QUERY_TIMEOUT_MS,
        });
        pending?.then(
          (rgb): void => {
            if (
              rgb !== undefined &&
              typeof rgb.r === "number" &&
              typeof rgb.g === "number" &&
              typeof rgb.b === "number"
            ) {
              lutCache.setTerminalBg({ r: rgb.r, g: rgb.g, b: rgb.b });
              requestRender();
            }
          },
          (): void => {
            // Query failed: the polarity fallback already in effect stands.
          },
        );
      } catch { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
        // A throwing query surface degrades to the fallback ladder silently.
      }
    },
  };
}
