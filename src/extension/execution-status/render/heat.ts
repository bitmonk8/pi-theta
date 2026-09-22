// RFC 0015 (D4, decisions 1 + 2) — the exponential heat-α math and the
// 64-step OKLab-blended background LUT. Pure: endpoints arrive as plain RGB
// (D5 acquires them impurely — OSC 11 / theme-SGR parse / polarity
// constants, spike Deviations 1-2); output is ready-to-emit SGR strings so
// the render loop does zero per-frame color math.

import { blendOklabSrgb } from "./oklab";
import { rgbTo256, type Rgb } from "./sgr";

// ---------------------------------------------------------------------------
// Decision 1's single tunable: the 4 s fade window. Everything else derives
// — including τ, fixed at the ratified fade:τ shape of 4 s : 1.3 s
// (exponential decay "reads more organic than linear"), so retuning the
// window rescales the whole curve without changing its shape.
// ---------------------------------------------------------------------------

/** Heat fade window: a line last hit ≥ this long ago renders cold (no heat). */
export const HEAT_FADE_MS = 4000;
/** Exponential decay time constant for `α = exp(-age/τ)`, derived from the
 *  fade window at the decision-1 ratio (1.3/4 → 1300 ms at the 4 s window). */
export const HEAT_TAU_MS = HEAT_FADE_MS * (1.3 / 4);

/** LUT resolution (decision 2): 4 s at the 200 ms tick = 20 frames over 64
 *  steps — visually continuous; index 0 is the cold entry. */
export const HEAT_LUT_SIZE = 64;

/**
 * Heat intensity for a line last hit `ageMs` ago: `exp(-age/τ)`, RESCALED so
 * the window closes exactly — raw `exp(-FADE/τ)` ≈ 0.046 would leave a
 * permanent ~3-step floor tint on every line ever hit, so the curve is
 * shifted/scaled to hit 0 at `HEAT_FADE_MS` while keeping α(0) = 1 and the
 * exponential shape in between. Negative ages (a hit stamped at "now" read on
 * the same tick, or clock granularity) clamp to full heat.
 */
export function heatAlpha(ageMs: number): number {
  if (ageMs <= 0) {
    return 1;
  }
  if (ageMs >= HEAT_FADE_MS) {
    return 0;
  }
  const floor = Math.exp(-HEAT_FADE_MS / HEAT_TAU_MS);
  return (Math.exp(-ageMs / HEAT_TAU_MS) - floor) / (1 - floor);
}

/**
 * Map a line's heat to its LUT index in [0, HEAT_LUT_SIZE): 0 = cold (the
 * empty LUT entry), 63 = full heat. `clamped` is the D2 operator ruling —
 * the current in-flight effect's line renders at FULL heat regardless of
 * age until the effect settles (`HeatSnapshot.clampedLine`).
 */
export function lutIndexFor(ageMs: number, clamped: boolean): number {
  if (clamped) {
    return HEAT_LUT_SIZE - 1;
  }
  return Math.round(heatAlpha(ageMs) * (HEAT_LUT_SIZE - 1));
}

/**
 * The color mode the LUT is built for — the exact signal the host used to
 * bake its own theme roles (`theme.getColorMode()`, spike Q2/Deviation 3).
 */
export type HeatLutColorMode = "truecolor" | "256color";

/**
 * Build the 64-entry background LUT for one `base → hot` ramp, blended in
 * OKLab (decision 2). Entry semantics:
 *
 * - **Entry 0 (α = 0) is the empty string — "emit no background SGR".**
 *   The blend base IS the terminal's own default background; when the OSC 11
 *   query fell back to a polarity constant the base RGB is only an
 *   approximation, and painting it explicitly would tint every cold line
 *   with the approximation error. Emitting nothing renders the true base
 *   exactly, always. D5 therefore skips the bg-SGR-plus-width-padding work
 *   entirely for cold lines (`lut[0] === ""` is the branch signal).
 * - Entries 1..63: `ESC[48;2;R;G;Bm` in truecolor mode; in 256color mode
 *   each blended triple is quantized to `ESC[48;5;Nm` HERE, once at build
 *   (spike Deviation 3: pi-tui does not downsample; decision 2's sanctioned
 *   emit-time degradation), never per frame. Every non-empty entry is an
 *   OPENING sequence only — no terminating reset is baked in: D5 closes each
 *   painted row with `ESC[49m` after width-padding (spike Q4), and a cooled
 *   line resets by full-row re-emission, not by an entry-carried reset.
 *
 * Rebuilt only on theme change / `invalidate()` — zero per-frame color math.
 */
export function buildHeatLut(
  base: Rgb,
  hot: Rgb,
  colorMode: HeatLutColorMode,
): readonly string[] {
  const entries: string[] = [""];
  for (let i = 1; i < HEAT_LUT_SIZE; i++) {
    const rgb = blendOklabSrgb(base, hot, i / (HEAT_LUT_SIZE - 1));
    entries.push(
      colorMode === "truecolor"
        ? `\x1b[48;2;${rgb.r};${rgb.g};${rgb.b}m`
        : `\x1b[48;5;${rgbTo256(rgb)}m`,
    );
  }
  return entries;
}
