// RFC 0015 (D4, decision 2) — sRGB ↔ OKLab conversion and the perceptual
// blend the heat LUT is built from. A naive sRGB lerp goes muddy mid-ramp
// (the RFC's stated reason for decision 2); interpolating in OKLab keeps the
// ramp perceptually even.
//
// Formulas and constants are Björn Ottosson's published OKLab reference
// implementation ("A perceptual color space for image processing",
// https://bottosson.github.io/posts/oklab/ — the `linear_srgb_to_oklab` /
// `oklab_to_linear_srgb` listings), combined with the standard IEC 61966-2-1
// sRGB transfer function. Pure math — no rendering dependency.

import type { Rgb } from "./sgr";

/** An OKLab coordinate: L = perceptual lightness, a/b = chroma axes. */
export interface Oklab {
  readonly L: number;
  readonly a: number;
  readonly b: number;
}

// IEC 61966-2-1 sRGB transfer function (gamma), both directions.
function srgbChannelToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearChannelToSrgb(linear: number): number {
  const c = linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;
  // Clamp before rounding: blends between in-gamut endpoints stay in gamut
  // mathematically, but cube-root round-trips can land epsilon outside.
  return Math.min(255, Math.max(0, Math.round(c * 255)));
}

/** sRGB (8-bit channels) → OKLab, per Ottosson's `linear_srgb_to_oklab`. */
export function srgbToOklab(c: Rgb): Oklab {
  const r = srgbChannelToLinear(c.r);
  const g = srgbChannelToLinear(c.g);
  const b = srgbChannelToLinear(c.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/** OKLab → sRGB (8-bit channels, clamped), per Ottosson's `oklab_to_linear_srgb`. */
export function oklabToSrgb(c: Oklab): Rgb {
  const l = (c.L + 0.3963377774 * c.a + 0.2158037573 * c.b) ** 3;
  const m = (c.L - 0.1055613458 * c.a - 0.0638541728 * c.b) ** 3;
  const s = (c.L - 0.0894841775 * c.a - 1.291485548 * c.b) ** 3;
  return {
    r: linearChannelToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: linearChannelToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: linearChannelToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  };
}

/**
 * Blend `base → hot` at position `t` ∈ [0, 1] by linear interpolation in
 * OKLab (decision 2's blend model), returned as sRGB. `t` is clamped —
 * extrapolation would leave the ramp's perceptual contract.
 */
export function blendOklabSrgb(base: Rgb, hot: Rgb, t: number): Rgb {
  const clamped = Math.min(1, Math.max(0, t));
  const a = srgbToOklab(base);
  const b = srgbToOklab(hot);
  return oklabToSrgb({
    L: a.L + (b.L - a.L) * clamped,
    a: a.a + (b.a - a.a) * clamped,
    b: a.b + (b.b - a.b) * clamped,
  });
}
