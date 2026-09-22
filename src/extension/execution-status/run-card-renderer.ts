// RFC 0015 (D5) — the LIVE `theta-run` entry renderer, its EXST-6 tick rider,
// and the TUI-handle capture. This is the impure shell over the D4 render
// substrate and the D2 bus snapshot: it acquires the Theme (per render call),
// the Clock/bus (lazy factory latches), the source bytes (filesystem seam),
// and the TUI handle (composition capture), reduces them to the pure
// `CardLinesModel`, and delegates all geometry to `card-lines.ts`.
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
// renderer; the per-file styled-line cache therefore lives HERE, on card
// state keyed by invocationId, per spike Deviation 4). When the predicate
// goes false the bus's tick machinery itself goes quiet and the final render
// is static.
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
  InvocationNodeSnapshot,
  StatusSink,
  ThetaRunSeed,
} from "./types";
import { MAX_TRACKED_INVOCATIONS, RUN_CARD_VIEWPORT_LINES } from "./types";
import {
  createThetaRunEntryRenderer,
  type ThetaRunEntryRenderer,
} from "./entry-channel";
import { baseFileName } from "./render/format";
import {
  buildCardLines,
  computeViewportTop,
  followCurrentFile,
  type CardChildRow,
  type CardLinesModel,
  type CardStyle,
  type FollowState,
  type LineHeat,
} from "./render/card-lines";
import { buildHeatLut, HEAT_FADE_MS, type HeatLutColorMode } from "./render/heat";
import { resolveHeatEndpoints } from "./render/endpoint-ladder";
import { parseSgrColor, type Rgb } from "./render/sgr";
import {
  createStyledLineCache,
  styledLinesFor,
  type StyledLineCache,
  type SyntaxRole,
} from "./render/styled-lines";

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
  readonly bus: () => Pick<ExecutionStatusBus, "snapshot"> | undefined;
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

// ---------------------------------------------------------------------------
// Theme duck-typing (the renderer's `theme` parameter is `unknown` on the
// D3 seam type; the real host hands the interactive `Theme`).
// ---------------------------------------------------------------------------

interface CardThemeSurface {
  getFgAnsi(color: string): string;
  getColorMode(): string;
}

function probeCardTheme(theme: unknown): CardThemeSurface | undefined {
  const candidate = theme as Partial<CardThemeSurface> | undefined;
  if (
    typeof candidate?.getFgAnsi !== "function" ||
    typeof candidate.getColorMode !== "function"
  ) {
    return undefined;
  }
  return candidate as CardThemeSurface;
}

/** Guarded theme fg read: a throwing/absent role yields "" (unstyled). */
function themeFg(theme: CardThemeSurface, role: string): string {
  try {
    const sgr = theme.getFgAnsi(role);
    return typeof sgr === "string" ? sgr : "";
  } catch { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
    return "";
  }
}

/**
 * SyntaxRole → theme fg role. Code roles map onto the host's `syntax*`
 * family 1:1 where one exists (`ident` → `syntaxVariable` — the lexer does
 * not distinguish function idents, and variable is the common case);
 * `trivia` — comments, whitespace, template prose — maps to `syntaxComment`
 * (whitespace carries no glyphs, so fg-coloring it is inert; prose reading
 * as comment-muted is the intended de-emphasis).
 */
const SYNTAX_ROLE_TO_THEME: Readonly<Record<SyntaxRole, string>> = Object.freeze({
  keyword: "syntaxKeyword",
  ident: "syntaxVariable",
  number: "syntaxNumber",
  string: "syntaxString",
  punct: "syntaxPunctuation",
  trivia: "syntaxComment",
});

// ---------------------------------------------------------------------------
// Per-card state (spike Deviation 4: OUTSIDE the renderer invocation, keyed
// by invocationId — `CustomEntryComponent.invalidate()` re-invokes the
// renderer, so nothing on the returned component survives).
// ---------------------------------------------------------------------------

interface CardState {
  readonly styledCache: StyledLineCache;
  /** The TOP-LEVEL script's file, latched at the first render that knows it —
   *  the breadcrumb's stable "parent" reference across follow switches. */
  homeFile?: string;
  follow?: FollowState;
  /** Previous viewport top, valid only for `viewTopFile`. */
  viewTop?: number;
  viewTopFile?: string;
}

export function createRunCardController(deps: RunCardControllerDeps): RunCardController {
  // Instance state — no module-level binding. The card map is bounded like the
  // publisher's open-run map: a defect path that never ends a drive must not
  // grow it unboundedly.
  const cards = new Map<string, CardState>();
  const staticFallback = createThetaRunEntryRenderer();
  let tui: TuiRenderHandle | undefined;
  let terminalBg: Rgb | undefined;
  // The LUT and the endpoint key it was built for (rebuild on theme/OSC change).
  let lut: readonly string[] | undefined;
  let lutKey: string | undefined;

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
    const fresh: CardState = { styledCache: createStyledLineCache() };
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

  function ensureLut(theme: CardThemeSurface): readonly string[] {
    const colorModeRaw = ((): string => {
      try {
        return theme.getColorMode();
      } catch { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
        return "truecolor";
      }
    })();
    const colorMode: HeatLutColorMode =
      colorModeRaw === "256color" ? "256color" : "truecolor";
    const endpoints = resolveHeatEndpoints({
      ...(terminalBg !== undefined ? { terminalBg } : {}),
      ...(((): { themeTextFg?: Rgb } => {
        const parsed = parseSgrColor(themeFg(theme, "text"));
        return parsed !== undefined ? { themeTextFg: parsed } : {};
      })()),
      ...(((): { themeAccentFg?: Rgb } => {
        const parsed = parseSgrColor(themeFg(theme, "accent"));
        return parsed !== undefined ? { themeAccentFg: parsed } : {};
      })()),
    });
    const key = `${colorMode}|${endpoints.base.r},${endpoints.base.g},${endpoints.base.b}|${endpoints.hot.r},${endpoints.hot.g},${endpoints.hot.b}`;
    if (lut === undefined || lutKey !== key) {
      lut = buildHeatLut(endpoints.base, endpoints.hot, colorMode);
      lutKey = key;
    }
    return lut;
  }

  /** Defensive seed read (PIC-21 analogue: a malformed payload never throws). */
  function readSeed(data: unknown): ThetaRunSeed | undefined {
    const record = data as Partial<Record<keyof ThetaRunSeed, unknown>> | undefined;
    if (
      typeof record?.invocationId !== "string" ||
      typeof record.theta !== "string" ||
      typeof record.startedAtMs !== "number"
    ) {
      return undefined;
    }
    return {
      invocationId: record.invocationId,
      theta: record.theta,
      argsSummary: typeof record.argsSummary === "string" ? record.argsSummary : "",
      startedAtMs: record.startedAtMs,
      ...(typeof record.sourcePath === "string" ? { sourcePath: record.sourcePath } : {}),
    };
  }

  function nodeFor(invocationId: string): InvocationNodeSnapshot | undefined {
    const snapshot = deps.bus()?.snapshot();
    return snapshot?.nodes.find((node) => node.invocationId === invocationId);
  }

  /**
   * The live card component: `render(width)` recomputes from the CURRENT bus
   * snapshot and clock, so the tick's `requestRender()` alone animates it. It
   * degrades in place — node evicted mid-life → static compact form — and is
   * internally guarded: a render throw would unwind pi-tui's render loop
   * (`CustomEntryComponent` guards only the renderer INVOCATION), so any
   * defect degrades to the static form instead (PIC-21 analogue).
   */
  class RunCardComponent implements Component {
    readonly #seed: ThetaRunSeed;
    readonly #expanded: boolean;
    readonly #theme: CardThemeSurface;
    readonly #rawEntry: { customType: string; data: unknown };
    readonly #rawTheme: unknown;

    constructor(
      seed: ThetaRunSeed,
      expanded: boolean,
      theme: CardThemeSurface,
      rawEntry: { customType: string; data: unknown },
      rawTheme: unknown,
    ) {
      this.#seed = seed;
      this.#expanded = expanded;
      this.#theme = theme;
      this.#rawEntry = rawEntry;
      this.#rawTheme = rawTheme;
    }

    render(width: number): string[] {
      try {
        return this.#renderLive(width);
      } catch { // allow-broad-catch: PIC-21 analogue — a render defect degrades to the static form, never unwinds pi-tui's render loop
        return this.#renderStatic(width);
      }
    }

    invalidate(): void {}

    #renderStatic(width: number): string[] {
      const component = staticFallback(
        this.#rawEntry as never,
        { expanded: this.#expanded },
        this.#rawTheme,
      );
      return component?.render(width) ?? [];
    }

    #renderLive(width: number): string[] {
      const clock = deps.clock();
      const node = nodeFor(this.#seed.invocationId);
      if (clock === undefined || node === undefined || width <= 0) {
        // Bus evicted the node (drive over) / latches gone: static compact form.
        return this.#renderStatic(width);
      }
      const now = clock.now();
      const snapshot = deps.bus()!.snapshot();
      const state = cardStateFor(this.#seed.invocationId);

      // Current site: the operator-ruled clamp wins (the in-flight effect IS
      // the current statement); else the ring's MRU entry (newest trace hit).
      const heat = node.heat;
      const mru = heat !== undefined ? heat.entries[heat.entries.length - 1] : undefined;
      const currentSite =
        heat?.clampedLine ?? (mru !== undefined ? { file: mru.file, line: mru.line } : undefined);

      // Dwell-damped file following (decision 6). The home file is latched
      // once (seed sourcePath, else the first observed site) so the
      // breadcrumb's parent reference stays stable across follow switches.
      if (state.homeFile === undefined) {
        const first = this.#seed.sourcePath ?? currentSite?.file;
        if (first !== undefined) {
          state.homeFile = first;
        }
      }
      const homeFile = state.homeFile;
      if (state.follow === undefined && homeFile !== undefined) {
        state.follow = { displayedFile: homeFile };
      }
      if (state.follow !== undefined) {
        followCurrentFile(state.follow, currentSite?.file, now);
      }
      const displayedFile = state.follow?.displayedFile;

      const style: CardStyle = {
        syntaxFg: (role) => themeFg(this.#theme, SYNTAX_ROLE_TO_THEME[role]),
        accentFg: themeFg(this.#theme, "accent"),
        mutedFg: themeFg(this.#theme, "muted"),
      };

      const children = snapshot.nodes.filter(
        (candidate) => candidate.parentInvocationId === node.invocationId,
      );
      const childRows: CardChildRow[] = children.map((child) => ({
        name: child.theta,
        ...(child.authorMessage?.scope !== undefined
          ? { scope: child.authorMessage.scope }
          : {}),
        startedAtMs: child.startedAtMs,
        ...(child.endedAtMs !== undefined ? { endedAtMs: child.endedAtMs } : {}),
        ...(child.childActivity !== undefined
          ? {
              activity: {
                turns: child.childActivity.turns,
                toolExecs: child.childActivity.toolExecs,
                ...(child.childActivity.lastToolName !== undefined
                  ? { lastToolName: child.childActivity.lastToolName }
                  : {}),
              },
            }
          : {}),
        ...(child.placement !== undefined ? { placement: child.placement } : {}),
        ...(child.launchSite !== undefined && child.launchSite.file === displayedFile
          ? { launchLine: child.launchSite.line }
          : {}),
      }));

      // Viewport: styled lines for the displayed file (lexed once per file per
      // card — spike Deviation 4's cache placement), heat ages per line.
      let viewport: CardLinesModel["viewport"];
      if (displayedFile !== undefined) {
        // Bytes are read only on a cache miss: the source is immutable for a
        // run (the lex-once contract), so a per-frame disk read would be pure
        // waste — and the cache is what survives renderer re-invocations
        // (spike Deviation 4).
        const cached = state.styledCache.get(displayedFile);
        const bytes = cached === undefined ? deps.readSourceBytes(displayedFile) : undefined;
        if (cached !== undefined || bytes !== undefined) {
          const styled =
            cached ??
            styledLinesFor(state.styledCache, {
              path: displayedFile,
              bytes: bytes!,
            });
          const heatByLine = new Map<number, LineHeat>();
          if (heat !== undefined) {
            for (const entry of heat.entries) {
              if (entry.file !== displayedFile) {
                continue;
              }
              const clamped =
                heat.clampedLine !== undefined &&
                heat.clampedLine.file === entry.file &&
                heat.clampedLine.line === entry.line;
              heatByLine.set(entry.line, { ageMs: now - entry.lastHitMs, clamped });
            }
          }
          const currentLine =
            currentSite !== undefined && currentSite.file === displayedFile
              ? currentSite.line
              : undefined;
          const height = this.#expanded
            ? styled.length
            : Math.min(RUN_CARD_VIEWPORT_LINES, styled.length);
          const prevTop = state.viewTopFile === displayedFile ? state.viewTop : undefined;
          const top = computeViewportTop(currentLine, styled.length, height, prevTop);
          state.viewTop = top;
          state.viewTopFile = displayedFile;
          viewport = {
            lines: styled,
            top,
            height,
            ...(currentLine !== undefined ? { currentLine } : {}),
            heatByLine,
            lut: ensureLut(this.#theme),
          };
        }
      }

      const model: CardLinesModel = {
        theta: this.#seed.theta,
        startedAtMs: node.startedAtMs,
        nowMs: now,
        counters: node.counters,
        activeChildren: children.filter((child) => child.endedAtMs === undefined).length,
        ...(node.authorMessage !== undefined ? { authorMessage: node.authorMessage } : {}),
        ...(displayedFile !== undefined &&
        homeFile !== undefined &&
        displayedFile !== homeFile
          ? { breadcrumb: { parent: this.#seed.theta, callee: baseFileName(displayedFile) } }
          : {}),
        ...(viewport !== undefined ? { viewport } : {}),
        children: childRows,
        ...(node.lanes !== undefined ? { lanes: node.lanes } : {}),
      };
      return buildCardLines(model, width, style);
    }
  }

  const renderer: ThetaRunEntryRenderer = (entry, options, theme) => {
    try {
      const seed = readSeed(entry.data);
      const cardTheme = probeCardTheme(theme);
      const node = seed !== undefined ? nodeFor(seed.invocationId) : undefined;
      if (seed === undefined || cardTheme === undefined || node === undefined || deps.clock() === undefined) {
        // RFC "Modes and degradation": bus does not know the invocation
        // (ended+evicted, restart) or no usable theme → the D3 static form.
        return staticFallback(entry, options, theme);
      }
      return new RunCardComponent(
        seed,
        options.expanded === true,
        cardTheme,
        { customType: entry.customType, data: entry.data },
        theme,
      );
    } catch { // allow-broad-catch: PIC-21 analogue — a renderer must never throw on a malformed payload
      return undefined;
    }
  };

  /** RFC §Animation predicate: fresh heat (< HEAT_FADE_MS, or a clamped
   *  in-flight effect) or a running child owes the card another frame. */
  function animationOwed(snapshot: ExecutionStatusSnapshot, nowMs: number): boolean {
    for (const node of snapshot.nodes) {
      if (node.parentInvocationId !== undefined && node.endedAtMs === undefined) {
        return true; // a running child (its badge/roster ages advance)
      }
      const heat = node.heat;
      if (heat === undefined) {
        continue;
      }
      if (heat.clampedLine !== undefined) {
        return true; // full-heat clamp holds until settle (operator ruling)
      }
      for (const entry of heat.entries) {
        if (nowMs - entry.lastHitMs < HEAT_FADE_MS) {
          return true;
        }
      }
    }
    return false;
  }

  const sink: StatusSink = {
    id: "run-card",
    render(snapshot, _view, _verbosity, nowMs): void {
      if (tui === undefined) {
        return;
      }
      if (animationOwed(snapshot, nowMs)) {
        requestRender();
      }
    },
    clear(): void {
      // Nothing pinned: the card is a transcript entry, not a footer/widget
      // surface — an idle bus simply stops requesting renders.
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
              terminalBg = { r: rgb.r, g: rgb.g, b: rgb.b };
              lut = undefined; // next render rebuilds over the true base
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
