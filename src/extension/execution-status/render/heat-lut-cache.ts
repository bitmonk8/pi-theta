// RFC 0015 (D7, PTQ-1260 Seam B) — the heat-LUT cache extracted from the run
// card controller: the OKLab background LUT keyed on color mode + resolved
// endpoints, rebuilt only when either changes (theme swap, OSC 11 resolve) —
// zero per-frame color math (the D4/D5 budget). Instance state behind a
// factory, injected explicitly — no module-level binding.

import { buildHeatLut, type HeatLutColorMode } from "./heat";
import { resolveHeatEndpoints } from "./endpoint-ladder";
import { parseSgrColor, type Rgb } from "./sgr";
import { themeFg, type CardThemeSurface } from "./card-theme";

export interface HeatLutCache {
  /** The LUT for the current endpoints, rebuilt only on a key change. */
  ensureLut(theme: CardThemeSurface): readonly string[];
  /**
   * Latch the OSC 11 terminal background (the true blend base) and invalidate
   * the cached LUT so the next `ensureLut` rebuilds over it.
   */
  setTerminalBg(rgb: Rgb): void;
}

export function createHeatLutCache(): HeatLutCache {
  let terminalBg: Rgb | undefined;
  // The LUT and the endpoint key it was built for (rebuild on theme/OSC change).
  let lut: readonly string[] | undefined;
  let lutKey: string | undefined;

  return {
    ensureLut(theme: CardThemeSurface): readonly string[] {
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
    },
    setTerminalBg(rgb: Rgb): void {
      terminalBg = rgb;
      lut = undefined; // next ensureLut rebuilds over the true base
    },
  };
}
