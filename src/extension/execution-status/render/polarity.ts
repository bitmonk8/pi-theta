// RFC 0015 (D4, spike Deviation 2) — the pure legs of the blend-base
// fallback ladder. The theme has no `defaultBg` role; the blend base comes
// from the terminal (OSC 11, acquired by D5). When that query times out or
// returns nothing, D5 falls back to polarity: colorScheme query, else the
// luminance of the theme's `text` fg triple (light text ⇒ dark background),
// selecting one of the polarity constants below. This module holds the pure
// pieces: the luminance function, the classifiers, and the constants.

import type { Rgb } from "./sgr";

/** Which side of the light/dark divide a terminal background sits on. */
export type BackgroundPolarity = "dark" | "light";

/**
 * WCAG 2.x relative luminance (the 0.03928-knee variant) — deliberately the
 * SAME formula and coefficients as coding-agent's own
 * `getRgbColorLuminance` (`dist/modes/interactive/theme/theme.js`), so the
 * card classifies polarity exactly as the host does.
 */
export function relativeLuminance(c: Rgb): number {
  const toLinear = (channel: number): number => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * toLinear(c.r) + 0.7152 * toLinear(c.g) + 0.0722 * toLinear(c.b);
}

/** Luminance ≥ 0.5 ⇒ light — the host's `getThemeForRgbColor` threshold. */
export function isLightBackground(bg: Rgb): boolean {
  return relativeLuminance(bg) >= 0.5;
}

/**
 * Fallback-ladder final leg: infer background polarity from the theme's
 * `text` FOREGROUND triple (recoverable via the Q1 SGR parse even when the
 * background is not) — light text implies a dark background and vice versa.
 */
export function polarityFromTextFg(textFg: Rgb): BackgroundPolarity {
  return relativeLuminance(textFg) >= 0.5 ? "dark" : "light";
}

// ---------------------------------------------------------------------------
// Polarity constants (spike Deviation 2's "polarity constant" leg, and the
// "hot endpoint derived or card constant" ruling: D5 prefers a hot endpoint
// derived from the theme's accent/error fg triple; these are the card
// constants used when no theme triple is recoverable).
// ---------------------------------------------------------------------------

/** Base for dark terminals: a common near-black default (#1e1e1e). */
export const DARK_POLARITY_BASE: Rgb = Object.freeze({ r: 0x1e, g: 0x1e, b: 0x1e });
/** Hot for dark terminals: a mid-intensity ember (#b04a00) — reads as heat
 *  behind light text without drowning glyph contrast at full α. */
export const DARK_POLARITY_HOT: Rgb = Object.freeze({ r: 0xb0, g: 0x4a, b: 0x00 });
/** Base for light terminals: plain white (#ffffff). */
export const LIGHT_POLARITY_BASE: Rgb = Object.freeze({ r: 0xff, g: 0xff, b: 0xff });
/** Hot for light terminals: a pale ember (#ffb380) — a visible warm tint
 *  that keeps dark text legible at full α. */
export const LIGHT_POLARITY_HOT: Rgb = Object.freeze({ r: 0xff, g: 0xb3, b: 0x80 });

/** The base/hot endpoint pair a heat LUT is built from. */
export interface HeatEndpoints {
  readonly base: Rgb;
  readonly hot: Rgb;
}

/** Select the constant endpoint pair for a polarity (the ladder's last rung). */
export function defaultHeatEndpoints(polarity: BackgroundPolarity): HeatEndpoints {
  return polarity === "dark"
    ? { base: DARK_POLARITY_BASE, hot: DARK_POLARITY_HOT }
    : { base: LIGHT_POLARITY_BASE, hot: LIGHT_POLARITY_HOT };
}
