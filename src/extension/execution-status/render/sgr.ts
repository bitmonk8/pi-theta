// RFC 0015 (D4) — SGR color parsing and the xterm-256 palette mapping, pure.
//
// The interactive Theme exposes no raw hex (spike Deviation 1): every color is
// lowered to a pre-baked SGR at Theme construction. The card therefore
// recovers RGB endpoints by parsing the SGRs `theme.getFgAnsi`/`getBgAnsi`
// return — `38;2;R;G;B` / `48;2;R;G;B` exact in truecolor mode, `38;5;N` /
// `48;5;N` via the xterm-256 palette in 256color mode. Both palette
// directions here are faithful clones of coding-agent's own theme module
// (`dist/modes/interactive/theme/theme.js`: `ansi256ToHex`, `rgbTo256`) so
// the card's quantization/recovery agrees byte-for-byte with how the host
// baked its theme roles. No pi-tui / pi-coding-agent import — plain strings
// and numbers in, RGB out; D5 does the impure theme acquisition.

/** A 24-bit color triple, each channel an integer in [0, 255]. */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

// The 6x6x6 color-cube channel values (xterm indices 16-231) and the
// 24-step grayscale ramp (indices 232-255) — the standard xterm palette,
// identical to the host theme module's CUBE_VALUES / GRAY_VALUES.
const CUBE_VALUES: readonly number[] = Object.freeze([0, 95, 135, 175, 215, 255]);
const GRAY_VALUES: readonly number[] = Object.freeze(
  Array.from({ length: 24 }, (_, i) => 8 + i * 10),
);

// Indices 0-15: the standard basic palette, cloned from the host's
// `ansi256ToHex` table (approximate common terminal values — the actual
// rendering is terminal-defined, but this is the mapping the host itself
// uses when it recovers hex from a 256-index).
const BASIC_16: readonly Rgb[] = Object.freeze([
  { r: 0x00, g: 0x00, b: 0x00 },
  { r: 0x80, g: 0x00, b: 0x00 },
  { r: 0x00, g: 0x80, b: 0x00 },
  { r: 0x80, g: 0x80, b: 0x00 },
  { r: 0x00, g: 0x00, b: 0x80 },
  { r: 0x80, g: 0x00, b: 0x80 },
  { r: 0x00, g: 0x80, b: 0x80 },
  { r: 0xc0, g: 0xc0, b: 0xc0 },
  { r: 0x80, g: 0x80, b: 0x80 },
  { r: 0xff, g: 0x00, b: 0x00 },
  { r: 0x00, g: 0xff, b: 0x00 },
  { r: 0xff, g: 0xff, b: 0x00 },
  { r: 0x00, g: 0x00, b: 0xff },
  { r: 0xff, g: 0x00, b: 0xff },
  { r: 0x00, g: 0xff, b: 0xff },
  { r: 0xff, g: 0xff, b: 0xff },
]);

/**
 * xterm-256 index → RGB (the host's `ansi256ToHex` mapping, as a triple).
 * `undefined` for a non-integer or out-of-range index — the SGR parser
 * treats that as "not a recoverable color" rather than inventing one.
 */
export function ansi256ToRgb(index: number): Rgb | undefined {
  if (!Number.isInteger(index) || index < 0 || index > 255) {
    return undefined;
  }
  if (index < 16) {
    return BASIC_16[index];
  }
  if (index < 232) {
    const cubeIndex = index - 16;
    const toChannel = (n: number): number => (n === 0 ? 0 : 55 + n * 40);
    return {
      r: toChannel(Math.floor(cubeIndex / 36)),
      g: toChannel(Math.floor((cubeIndex % 36) / 6)),
      b: toChannel(cubeIndex % 6),
    };
  }
  const gray = 8 + (index - 232) * 10;
  return { r: gray, g: gray, b: gray };
}

// Weighted Euclidean distance (human eye is more sensitive to green) —
// the host's `colorDistance`, cloned so quantization ties break identically.
function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114;
}

function findClosest(values: readonly number[], value: number): number {
  let minDist = Infinity;
  let minIdx = 0;
  for (let i = 0; i < values.length; i++) {
    const dist = Math.abs(value - (values[i] ?? 0));
    if (dist < minDist) {
      minDist = dist;
      minIdx = i;
    }
  }
  return minIdx;
}

/**
 * RGB → nearest xterm-256 index — a faithful clone of the host theme
 * module's `rgbTo256` (spike Deviation 3): nearest 6x6x6 cube entry, with
 * the grayscale ramp winning only when the color is nearly neutral
 * (channel spread < 10) AND the gray is strictly closer. Used ONCE at LUT
 * build when the color mode is 256color — never per frame.
 */
export function rgbTo256(c: Rgb): number {
  const { r, g, b } = c;
  const rIdx = findClosest(CUBE_VALUES, r);
  const gIdx = findClosest(CUBE_VALUES, g);
  const bIdx = findClosest(CUBE_VALUES, b);
  const cubeIndex = 16 + 36 * rIdx + 6 * gIdx + bIdx;
  const cubeDist = colorDistance(
    r, g, b,
    CUBE_VALUES[rIdx] ?? 0, CUBE_VALUES[gIdx] ?? 0, CUBE_VALUES[bIdx] ?? 0,
  );
  const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  const grayIdx = findClosest(GRAY_VALUES, gray);
  const grayValue = GRAY_VALUES[grayIdx] ?? 0;
  const grayDist = colorDistance(r, g, b, grayValue, grayValue, grayValue);
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  if (spread < 10 && grayDist < cubeDist) {
    return 232 + grayIdx;
  }
  return cubeIndex;
}

function parseChannel(part: string | undefined): number | undefined {
  if (part === undefined || !/^\d{1,3}$/.test(part)) {
    return undefined;
  }
  const value = Number(part);
  return value <= 255 ? value : undefined;
}

/**
 * Parse a bare color SGR (fg or bg) into its RGB triple:
 * `ESC[38;2;R;G;Bm` / `ESC[48;2;R;G;Bm` recover the exact 24-bit triple;
 * `ESC[38;5;Nm` / `ESC[48;5;Nm` recover the xterm-palette triple for N.
 * Anything else — default-color resets (`39`/`49`), attribute codes,
 * malformed or out-of-range parameters — returns `undefined`, which the
 * D5 fallback ladder treats as "endpoint not recoverable from the theme".
 */
export function parseSgrColor(sgr: string): Rgb | undefined {
  const match = /^\x1b\[([0-9;]+)m$/.exec(sgr);
  if (match === null || match[1] === undefined) {
    return undefined;
  }
  const parts = match[1].split(";");
  if (parts[0] !== "38" && parts[0] !== "48") {
    return undefined;
  }
  if (parts[1] === "2" && parts.length === 5) {
    const r = parseChannel(parts[2]);
    const g = parseChannel(parts[3]);
    const b = parseChannel(parts[4]);
    if (r === undefined || g === undefined || b === undefined) {
      return undefined;
    }
    return { r, g, b };
  }
  if (parts[1] === "5" && parts.length === 3) {
    const index = parseChannel(parts[2]);
    return index === undefined ? undefined : ansi256ToRgb(index);
  }
  return undefined;
}
