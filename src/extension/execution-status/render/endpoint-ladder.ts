// RFC 0015 (D5, spike Deviation 2) — the pure endpoint-selection ladder for
// the heat LUT. The theme has no `defaultBg` role and no heat role, so the
// blend BASE comes from the terminal itself when the impure shell managed an
// OSC 11 query, else from a polarity constant (polarity inferred from the
// theme's `text` fg triple — light text ⇒ dark background); the HOT endpoint
// is derived from the theme's `accent` fg triple, else the polarity constant.
// This module only SELECTS over already-acquired inputs; acquisition (the
// TUI-handle query, the theme-SGR parses) is `run-card-renderer.ts`'s.

import type { Rgb } from "./sgr";
import {
  DARK_POLARITY_BASE,
  DARK_POLARITY_HOT,
  LIGHT_POLARITY_BASE,
  LIGHT_POLARITY_HOT,
  isLightBackground,
  polarityFromTextFg,
  type BackgroundPolarity,
  type HeatEndpoints,
} from "./polarity";

/** The already-acquired ladder inputs (each `undefined` when unrecoverable). */
export interface EndpointLadderInputs {
  /** The terminal's own default background (OSC 11 via the TUI handle). */
  readonly terminalBg?: Rgb;
  /** The theme `text` fg triple (Q1 SGR parse) — the polarity witness. */
  readonly themeTextFg?: Rgb;
  /** The theme `accent` fg triple (Q1 SGR parse) — the derived hot endpoint. */
  readonly themeAccentFg?: Rgb;
}

/**
 * Resolve the blend endpoints down the spike-Deviation-2 ladder:
 * base = OSC 11 → polarity constant (polarity from the text-fg luminance,
 * defaulting dark — the common terminal case); hot = accent triple →
 * polarity constant. Pure and total: some pair always results, so rendering
 * never blocks on the async terminal query (the shell rebuilds the LUT when
 * the query later resolves).
 */
export function resolveHeatEndpoints(inputs: EndpointLadderInputs): HeatEndpoints {
  const polarity: BackgroundPolarity =
    inputs.terminalBg !== undefined
      ? // The strongest witness: classify the REAL background directly.
        isLightBackground(inputs.terminalBg)
        ? "light"
        : "dark"
      : inputs.themeTextFg !== undefined
        ? polarityFromTextFg(inputs.themeTextFg)
        : "dark";
  const base =
    inputs.terminalBg ?? (polarity === "dark" ? DARK_POLARITY_BASE : LIGHT_POLARITY_BASE);
  const hot =
    inputs.themeAccentFg ?? (polarity === "dark" ? DARK_POLARITY_HOT : LIGHT_POLARITY_HOT);
  return { base, hot };
}

