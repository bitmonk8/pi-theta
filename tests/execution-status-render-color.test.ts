// RFC 0015 (docs/rfcs/0015-theta-run-card.md decisions 1-2, D4) —
// `tests/execution-status-render-color.test.ts` (T-RCOLOR). The pure color
// substrate: SGR parsing + xterm-256 palette (spike Deviation 1's endpoint
// recovery and Deviation 3's build-time quantization), sRGB ↔ OKLab
// conversion against Ottosson's published reference values, the 64-step heat
// LUT, the exponential heat-α math, and the polarity fallback helpers
// (spike Deviation 2). No TUI, no theme object — plain strings and RGB.

import { describe, expect, it } from "vitest";
import {
  ansi256ToRgb,
  parseSgrColor,
  rgbTo256,
  type Rgb,
} from "../src/extension/execution-status/render/sgr";
import {
  blendOklabSrgb,
  oklabToSrgb,
  srgbToOklab,
} from "../src/extension/execution-status/render/oklab";
import {
  HEAT_FADE_MS,
  HEAT_LUT_SIZE,
  HEAT_TAU_MS,
  buildHeatLut,
  heatAlpha,
  lutIndexFor,
} from "../src/extension/execution-status/render/heat";
import {
  DARK_POLARITY_BASE,
  DARK_POLARITY_HOT,
  LIGHT_POLARITY_BASE,
  LIGHT_POLARITY_HOT,
  defaultHeatEndpoints,
  isLightBackground,
  polarityFromTextFg,
  relativeLuminance,
} from "../src/extension/execution-status/render/polarity";

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };

describe("SGR parsing (spike Deviation 1 — endpoint recovery)", () => {
  it("parses a truecolor fg SGR to its exact triple", () => {
    expect(parseSgrColor("\x1b[38;2;58;134;255m")).toEqual({ r: 58, g: 134, b: 255 });
  });

  it("parses the spike's bg witness: #2a2d3a → 48;2;42;45;58 round-trip", () => {
    expect(parseSgrColor("\x1b[48;2;42;45;58m")).toEqual({ r: 42, g: 45, b: 58 });
  });

  it("parses 256-color SGRs through the xterm palette", () => {
    // 17 = cube (0,0,1) → #00005f (the spike's 256color customMessageBg).
    expect(parseSgrColor("\x1b[48;5;17m")).toEqual({ r: 0, g: 0, b: 0x5f });
    expect(parseSgrColor("\x1b[38;5;196m")).toEqual({ r: 255, g: 0, b: 0 });
  });

  it("returns undefined for non-color and malformed SGRs", () => {
    // Default-color resets — the theme emits these for the "" color value.
    expect(parseSgrColor("\x1b[39m")).toBeUndefined();
    expect(parseSgrColor("\x1b[49m")).toBeUndefined();
    // Attribute codes, empty input, garbage, missing terminator.
    expect(parseSgrColor("\x1b[1m")).toBeUndefined();
    expect(parseSgrColor("")).toBeUndefined();
    expect(parseSgrColor("48;2;1;2;3")).toBeUndefined();
    expect(parseSgrColor("\x1b[48;2;1;2;3")).toBeUndefined();
    // Wrong arity / out-of-range channels.
    expect(parseSgrColor("\x1b[38;2;1;2m")).toBeUndefined();
    expect(parseSgrColor("\x1b[38;2;1;2;3;4m")).toBeUndefined();
    expect(parseSgrColor("\x1b[38;2;256;0;0m")).toBeUndefined();
    expect(parseSgrColor("\x1b[38;5;256m")).toBeUndefined();
    expect(parseSgrColor("\x1b[38;5;1;2m")).toBeUndefined();
  });

  it("maps the basic-16, cube, and grayscale palette regions faithfully", () => {
    expect(ansi256ToRgb(0)).toEqual(BLACK);
    expect(ansi256ToRgb(1)).toEqual({ r: 0x80, g: 0, b: 0 });
    expect(ansi256ToRgb(7)).toEqual({ r: 0xc0, g: 0xc0, b: 0xc0 });
    expect(ansi256ToRgb(9)).toEqual({ r: 255, g: 0, b: 0 });
    expect(ansi256ToRgb(15)).toEqual(WHITE);
    // Cube: index = 16 + 36r + 6g + b over levels [0,95,135,175,215,255].
    expect(ansi256ToRgb(16)).toEqual(BLACK);
    expect(ansi256ToRgb(231)).toEqual(WHITE);
    expect(ansi256ToRgb(60)).toEqual({ r: 95, g: 95, b: 135 });
    // Grayscale ramp 232-255: 8 + 10n.
    expect(ansi256ToRgb(232)).toEqual({ r: 8, g: 8, b: 8 });
    expect(ansi256ToRgb(255)).toEqual({ r: 238, g: 238, b: 238 });
    // Out of range → undefined, never an invented color.
    expect(ansi256ToRgb(-1)).toBeUndefined();
    expect(ansi256ToRgb(256)).toBeUndefined();
    expect(ansi256ToRgb(1.5)).toBeUndefined();
  });

  it("quantizes RGB to xterm-256 like the host's rgbTo256 (pinned values)", () => {
    expect(rgbTo256({ r: 255, g: 0, b: 0 })).toBe(196); // saturated → cube
    expect(rgbTo256({ r: 128, g: 128, b: 128 })).toBe(244); // neutral → gray ramp
    expect(rgbTo256(WHITE)).toBe(231); // exact cube hit beats gray
    expect(rgbTo256(BLACK)).toBe(16);
  });

  it("round-trips every cube and grayscale index through rgbTo256", () => {
    for (let index = 16; index <= 255; index++) {
      const rgb = ansi256ToRgb(index);
      expect(rgb).toBeDefined();
      expect(rgbTo256(rgb as Rgb)).toBe(index);
    }
  });
});

describe("OKLab conversion (Ottosson reference values)", () => {
  // Published sRGB→OKLab values from bottosson.github.io/posts/oklab/.
  const cases: ReadonlyArray<{ rgb: Rgb; L: number; a: number; b: number }> = [
    { rgb: WHITE, L: 1.0, a: 0.0, b: 0.0 },
    { rgb: BLACK, L: 0.0, a: 0.0, b: 0.0 },
    { rgb: { r: 255, g: 0, b: 0 }, L: 0.62796, a: 0.22486, b: 0.12585 },
    { rgb: { r: 0, g: 255, b: 0 }, L: 0.86644, a: -0.23389, b: 0.1795 },
    { rgb: { r: 0, g: 0, b: 255 }, L: 0.45201, a: -0.03246, b: -0.31153 },
  ];

  it("matches the published reference triples within 1e-4", () => {
    for (const c of cases) {
      const lab = srgbToOklab(c.rgb);
      expect(Math.abs(lab.L - c.L)).toBeLessThan(1e-4);
      expect(Math.abs(lab.a - c.a)).toBeLessThan(1e-4);
      expect(Math.abs(lab.b - c.b)).toBeLessThan(1e-4);
    }
  });

  it("round-trips sRGB → OKLab → sRGB within ±1 per channel", () => {
    const samples: Rgb[] = [
      WHITE, BLACK,
      { r: 42, g: 45, b: 58 },
      { r: 176, g: 74, b: 0 },
      { r: 58, g: 134, b: 255 },
      { r: 30, g: 30, b: 30 },
      { r: 255, g: 179, b: 128 },
      { r: 1, g: 2, b: 3 },
      { r: 200, g: 100, b: 50 },
    ];
    for (const s of samples) {
      const back = oklabToSrgb(srgbToOklab(s));
      expect(Math.abs(back.r - s.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.g - s.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.b - s.b)).toBeLessThanOrEqual(1);
    }
  });

  it("blend endpoints reproduce base and hot (±1) and t is clamped", () => {
    const base: Rgb = { r: 30, g: 30, b: 30 };
    const hot: Rgb = { r: 176, g: 74, b: 0 };
    for (const [t, expected] of [[0, base], [1, hot], [-5, base], [2, hot]] as const) {
      const blended = blendOklabSrgb(base, hot, t);
      expect(Math.abs(blended.r - expected.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(blended.g - expected.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(blended.b - expected.b)).toBeLessThanOrEqual(1);
    }
  });

  it("blend lightness is monotone in t (the OKLab-ramp property)", () => {
    const base: Rgb = { r: 30, g: 30, b: 30 };
    const hot: Rgb = { r: 255, g: 179, b: 128 };
    let previous = srgbToOklab(blendOklabSrgb(base, hot, 0)).L;
    for (let i = 1; i <= 20; i++) {
      const current = srgbToOklab(blendOklabSrgb(base, hot, i / 20)).L;
      // Non-strict: 8-bit rounding can plateau adjacent steps.
      expect(current).toBeGreaterThanOrEqual(previous - 1e-3);
      previous = current;
    }
  });
});

describe("heat-α math (decision 1: 4 s window, exponential τ ≈ 1.3 s)", () => {
  it("pins the tunable pair", () => {
    expect(HEAT_FADE_MS).toBe(4000);
    expect(HEAT_TAU_MS).toBe(1300);
    expect(HEAT_LUT_SIZE).toBe(64);
  });

  it("α(0) = 1, α(FADE) = 0, negative age clamps to full heat", () => {
    expect(heatAlpha(0)).toBe(1);
    expect(heatAlpha(HEAT_FADE_MS)).toBe(0);
    expect(heatAlpha(HEAT_FADE_MS + 1)).toBe(0);
    expect(heatAlpha(-5)).toBe(1);
  });

  it("keeps the exponential shape between the rescaled endpoints", () => {
    // At age = τ the rescaled curve sits at (e⁻¹ - floor) / (1 - floor).
    const floor = Math.exp(-HEAT_FADE_MS / HEAT_TAU_MS);
    const expected = (Math.exp(-1) - floor) / (1 - floor);
    expect(Math.abs(heatAlpha(HEAT_TAU_MS) - expected)).toBeLessThan(1e-9);
  });

  it("α is monotone non-increasing over the window", () => {
    let previous = heatAlpha(0);
    for (let age = 100; age <= HEAT_FADE_MS + 500; age += 100) {
      const current = heatAlpha(age);
      expect(current).toBeLessThanOrEqual(previous);
      expect(current).toBeGreaterThanOrEqual(0);
      expect(current).toBeLessThanOrEqual(1);
      previous = current;
    }
  });

  it("lutIndexFor maps ages into [0, 63], monotone, closing at the window", () => {
    expect(lutIndexFor(0, false)).toBe(HEAT_LUT_SIZE - 1);
    expect(lutIndexFor(HEAT_FADE_MS, false)).toBe(0);
    expect(lutIndexFor(HEAT_FADE_MS * 10, false)).toBe(0);
    let previous = lutIndexFor(0, false);
    for (let age = 50; age <= HEAT_FADE_MS; age += 50) {
      const index = lutIndexFor(age, false);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(HEAT_LUT_SIZE);
      expect(index).toBeLessThanOrEqual(previous);
      previous = index;
    }
  });

  it("a clamped line renders at full heat regardless of age (D2 ruling)", () => {
    expect(lutIndexFor(0, true)).toBe(HEAT_LUT_SIZE - 1);
    expect(lutIndexFor(HEAT_FADE_MS + 60_000, true)).toBe(HEAT_LUT_SIZE - 1);
  });
});

describe("heat LUT builder (decision 2 + spike Deviation 3)", () => {
  const base: Rgb = { r: 30, g: 30, b: 30 };
  const hot: Rgb = { r: 176, g: 74, b: 0 };

  it("truecolor: 64 entries, cold entry empty, hot entry ≈ hot endpoint", () => {
    const lut = buildHeatLut(base, hot, "truecolor");
    expect(lut).toHaveLength(HEAT_LUT_SIZE);
    // α = 0 emits NO background: the base is the terminal's own default —
    // painting an approximated base would tint every cold line.
    expect(lut[0]).toBe("");
    for (let i = 1; i < HEAT_LUT_SIZE; i++) {
      expect(lut[i]).toMatch(/^\x1b\[48;2;\d{1,3};\d{1,3};\d{1,3}m$/);
    }
    const top = parseSgrColor(lut[HEAT_LUT_SIZE - 1] ?? "");
    expect(top).toBeDefined();
    expect(Math.abs((top as Rgb).r - hot.r)).toBeLessThanOrEqual(1);
    expect(Math.abs((top as Rgb).g - hot.g)).toBeLessThanOrEqual(1);
    expect(Math.abs((top as Rgb).b - hot.b)).toBeLessThanOrEqual(1);
  });

  it("truecolor: OKLab lightness is monotone along the LUT", () => {
    const lut = buildHeatLut(base, hot, "truecolor");
    let previous = srgbToOklab(parseSgrColor(lut[1] ?? "") as Rgb).L;
    for (let i = 2; i < HEAT_LUT_SIZE; i++) {
      const current = srgbToOklab(parseSgrColor(lut[i] ?? "") as Rgb).L;
      expect(current).toBeGreaterThanOrEqual(previous - 1e-3);
      previous = current;
    }
  });

  it("256color: quantized ONCE at build to the same triples as truecolor", () => {
    const lut256 = buildHeatLut(base, hot, "256color");
    const lutTrue = buildHeatLut(base, hot, "truecolor");
    expect(lut256).toHaveLength(HEAT_LUT_SIZE);
    expect(lut256[0]).toBe("");
    for (let i = 1; i < HEAT_LUT_SIZE; i++) {
      const entry = lut256[i] ?? "";
      const match = /^\x1b\[48;5;(\d{1,3})m$/.exec(entry);
      expect(match).not.toBeNull();
      const index = Number(match?.[1]);
      expect(index).toBeGreaterThanOrEqual(16);
      expect(index).toBeLessThanOrEqual(255);
      // The 256 entry IS the truecolor entry's triple through rgbTo256.
      expect(index).toBe(rgbTo256(parseSgrColor(lutTrue[i] ?? "") as Rgb));
    }
  });

  it("spike-witness endpoints build a valid ramp from a parsed theme bg", () => {
    // #2a2d3a recovered from the theme's 48;2;42;45;58 SGR as the hot probe.
    const themeBase = parseSgrColor("\x1b[48;2;42;45;58m") as Rgb;
    const lut = buildHeatLut(themeBase, hot, "truecolor");
    expect(parseSgrColor(lut[1] ?? "")).toBeDefined();
    expect(lut[0]).toBe("");
  });
});

describe("polarity helpers (spike Deviation 2 — fallback ladder)", () => {
  it("relative luminance matches the host's WCAG formula", () => {
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 6);
    expect(relativeLuminance(BLACK)).toBeCloseTo(0, 6);
    expect(relativeLuminance({ r: 128, g: 128, b: 128 })).toBeCloseTo(0.2158, 3);
  });

  it("classifies backgrounds at the host's ≥ 0.5 threshold", () => {
    expect(isLightBackground(WHITE)).toBe(true);
    expect(isLightBackground(BLACK)).toBe(false);
    expect(isLightBackground({ r: 30, g: 30, b: 30 })).toBe(false);
    expect(isLightBackground({ r: 42, g: 45, b: 58 })).toBe(false);
  });

  it("infers polarity from the theme text fg (light text ⇒ dark bg)", () => {
    expect(polarityFromTextFg({ r: 212, g: 212, b: 212 })).toBe("dark");
    expect(polarityFromTextFg({ r: 51, g: 51, b: 51 })).toBe("light");
  });

  it("polarity constants are internally consistent", () => {
    expect(defaultHeatEndpoints("dark")).toEqual({
      base: DARK_POLARITY_BASE,
      hot: DARK_POLARITY_HOT,
    });
    expect(defaultHeatEndpoints("light")).toEqual({
      base: LIGHT_POLARITY_BASE,
      hot: LIGHT_POLARITY_HOT,
    });
    // Each base sits on its own polarity's side of the threshold, and each
    // hot endpoint is visibly distinct from its base.
    expect(isLightBackground(DARK_POLARITY_BASE)).toBe(false);
    expect(isLightBackground(LIGHT_POLARITY_BASE)).toBe(true);
    expect(DARK_POLARITY_HOT).not.toEqual(DARK_POLARITY_BASE);
    expect(LIGHT_POLARITY_HOT).not.toEqual(LIGHT_POLARITY_BASE);
  });
});
