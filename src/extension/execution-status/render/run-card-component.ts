// RFC 0015 (D7, PTQ-1260 Seam A) — the live run-card component and the
// `theta-run` renderer entry, extracted from the D5 controller closure: seed
// decoding, the per-frame model assembly (`#renderLive`), and the
// degrade-to-static gate. The controller (`run-card-renderer.ts`) injects its
// remaining concerns — the card-state store, the LUT cache, and the static
// fallback — through the small deps record below.
//
// PTQ-1256 (ratified): ONE bus snapshot per render. `#renderLive` builds a
// single `snapshot()` at its top and derives BOTH the node (`.find`) and the
// children filter from it — one consistent object graph, one deep copy per
// frame instead of two. The renderer entry's presence check is the bus's
// constant-cost `tracks(invocationId)` probe, not a third snapshot build.

import type { Component } from "@earendil-works/pi-tui";
import type { Clock } from "../../../seams/clock";
import type { ExecutionStatusBus, ThetaRunSeed } from "../types";
import { RUN_CARD_VIEWPORT_LINES } from "../types";
import type { ThetaRunEntryRenderer } from "../entry-channel";
import { baseFileName } from "./format";
import {
  buildCardLines,
  computeViewportTop,
  followCurrentFile,
  type CardChildRow,
  type CardLinesModel,
  type CardStyle,
  type FollowState,
  type LineHeat,
} from "./card-lines";
import { probeCardTheme, themeFg, SYNTAX_ROLE_TO_THEME, type CardThemeSurface } from "./card-theme";
import { createStyledLineCache, styledLinesFor, type StyledLineCache } from "./styled-lines";

// ---------------------------------------------------------------------------
// Per-card state (spike Deviation 4: OUTSIDE the renderer invocation, keyed
// by invocationId — `CustomEntryComponent.invalidate()` re-invokes the
// renderer, so nothing on the returned component survives). Owned by the
// controller's bounded store; this module only reads/mutates one card's state.
// ---------------------------------------------------------------------------

export interface CardState {
  readonly styledCache: StyledLineCache;
  /** The TOP-LEVEL script's file, latched at the first render that knows it —
   *  the breadcrumb's stable "parent" reference across follow switches. */
  homeFile?: string;
  follow?: FollowState;
  /** Previous viewport top, valid only for `viewTopFile`. */
  viewTop?: number;
  viewTopFile?: string;
}

/** A fresh card state (the controller's store calls this on a miss). */
export function createCardState(): CardState {
  return { styledCache: createStyledLineCache() };
}

/** Defensive seed read (PIC-21 analogue: a malformed payload never throws). */
export function readSeed(data: unknown): ThetaRunSeed | undefined {
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

/** The concerns the controller injects (its store, LUT cache, and fallback). */
export interface RunCardComponentDeps {
  /** Lazy latch: the LIVE extension-instance bus (published at compose). */
  readonly bus: () => Pick<ExecutionStatusBus, "snapshot" | "tracks"> | undefined;
  /** Lazy latch: the instance `Clock` (PIC-12; published at compose). */
  readonly clock: () => Clock | undefined;
  /** Source bytes for the viewport (production: `productionReadSourceBytes`). */
  readonly readSourceBytes: (path: string) => Uint8Array | undefined;
  /** The controller's bounded per-invocation card-state store. */
  readonly cardStateFor: (invocationId: string) => CardState;
  /** The controller's heat-LUT cache (Seam B). */
  readonly ensureLut: (theme: CardThemeSurface) => readonly string[];
  /** The D3 static compact renderer every degradation path lands on. */
  readonly staticFallback: ThetaRunEntryRenderer;
}

/**
 * The live run-card component (module-private; constructed only by the
 * renderer entry below). `render(width)` recomputes from the CURRENT bus
 * snapshot and clock, so the tick's `requestRender()` alone animates it. It
 * degrades in place — node evicted mid-life → static compact form — and is
 * internally guarded: a render throw would unwind pi-tui's render loop
 * (`CustomEntryComponent` guards only the renderer INVOCATION), so any defect
 * degrades to the static form instead (PIC-21 analogue).
 */
class RunCardComponent implements Component {
  readonly #deps: RunCardComponentDeps;
  readonly #seed: ThetaRunSeed;
  readonly #expanded: boolean;
  readonly #theme: CardThemeSurface;
  readonly #rawEntry: { customType: string; data: unknown };
  readonly #rawTheme: unknown;

  constructor(
    deps: RunCardComponentDeps,
    seed: ThetaRunSeed,
    expanded: boolean,
    theme: CardThemeSurface,
    rawEntry: { customType: string; data: unknown },
    rawTheme: unknown,
  ) {
    this.#deps = deps;
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
    const component = this.#deps.staticFallback(
      this.#rawEntry as never,
      { expanded: this.#expanded },
      this.#rawTheme,
    );
    return component?.render(width) ?? [];
  }

  #renderLive(width: number): string[] {
    const clock = this.#deps.clock();
    // PTQ-1256: the frame's ONE snapshot — node and children both derive
    // from it below (one consistent object graph, one deep copy per frame).
    const snapshot = this.#deps.bus()?.snapshot();
    const node = snapshot?.nodes.find(
      (candidate) => candidate.invocationId === this.#seed.invocationId,
    );
    if (clock === undefined || snapshot === undefined || node === undefined || width <= 0) {
      // Bus evicted the node (drive over) / latches gone: static compact form.
      return this.#renderStatic(width);
    }
    const now = clock.now();
    const state = this.#deps.cardStateFor(this.#seed.invocationId);

    // Current site (D7 set-shaped clamp): the NEWEST in-flight effect wins —
    // `clampedLines` orders each site at its newest open span's position
    // (a re-dispatch on an already-clamped line moves the site to the end),
    // so its last element is the most recent dispatch (the ▶ anchor while
    // several lanes hold older clamps); else the ring's MRU entry (newest
    // trace hit).
    const heat = node.heat;
    const newestClamp =
      heat?.clampedLines !== undefined
        ? heat.clampedLines[heat.clampedLines.length - 1]
        : undefined;
    const mru = heat !== undefined ? heat.entries[heat.entries.length - 1] : undefined;
    const currentSite =
      newestClamp ?? (mru !== undefined ? { file: mru.file, line: mru.line } : undefined);

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
      const bytes = cached === undefined ? this.#deps.readSourceBytes(displayedFile) : undefined;
      if (cached !== undefined || bytes !== undefined) {
        const styled =
          cached ??
          styledLinesFor(state.styledCache, {
            path: displayedFile,
            bytes: bytes!,
          });
        // D7 operator ruling (generalised): EVERY in-flight effect site's
        // line clamps to full heat until ITS settle — concurrently-blocked
        // par-for lanes all render hot. Clamped lines missing from the ring
        // (a tight loop evicted the entry mid-span) still render: the clamp
        // set is authoritative for in-flight-ness, the ring only for ages.
        const clampedHere = new Set<number>();
        if (heat?.clampedLines !== undefined) {
          for (const site of heat.clampedLines) {
            if (site.file === displayedFile) {
              clampedHere.add(site.line);
            }
          }
        }
        const heatByLine = new Map<number, LineHeat>();
        if (heat !== undefined) {
          for (const entry of heat.entries) {
            if (entry.file !== displayedFile) {
              continue;
            }
            heatByLine.set(entry.line, {
              ageMs: now - entry.lastHitMs,
              clamped: clampedHere.has(entry.line),
            });
          }
        }
        for (const line of clampedHere) {
          if (!heatByLine.has(line)) {
            heatByLine.set(line, { ageMs: 0, clamped: true });
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
          lut: this.#deps.ensureLut(this.#theme),
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

/**
 * Build the live `theta-run` renderer over `deps`: the entry closure decodes
 * the seed, probes the theme, gates on the bus's presence probe, and
 * constructs a `RunCardComponent` — degrading to the static form otherwise.
 */
export function createRunCardRenderer(deps: RunCardComponentDeps): ThetaRunEntryRenderer {
  return (entry, options, theme) => {
    try {
      const seed = readSeed(entry.data);
      const cardTheme = probeCardTheme(theme);
      // PTQ-1256: the presence gate is a constant-cost Map probe on the bus —
      // never a full snapshot build discarded after one `.find`.
      const tracked = seed !== undefined && deps.bus()?.tracks(seed.invocationId) === true;
      if (seed === undefined || cardTheme === undefined || !tracked || deps.clock() === undefined) {
        // RFC "Modes and degradation": bus does not know the invocation
        // (ended+evicted, restart) or no usable theme → the D3 static form.
        return deps.staticFallback(entry, options, theme);
      }
      return new RunCardComponent(
        deps,
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
}
