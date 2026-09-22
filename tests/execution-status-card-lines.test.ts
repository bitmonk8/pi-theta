// RFC 0015 (D5) — the PURE run-card line builder (`render/card-lines.ts`):
// sticky-viewport math (middle-third recenter), dwell-damped file following,
// header/breadcrumb/author-row grammar, gutter + current-line marker,
// heat-background padding discipline (pad to width THEN `ESC[49m`; entry 0 =
// no background at all), running-subagent markers/badges (single, lane
// summary, lane-less multi), and the children roster (cap + `+N more`,
// ended-linger rows). All geometry is exercised against a fake `CardStyle`,
// no Theme/TUI anywhere.
//
// TIER: unit, offline, deterministic, provider-free.

import { describe, expect, it } from "vitest";
import {
  buildCardLines,
  computeViewportTop,
  followCurrentFile,
  formatCount,
  CHILD_MARKER_GLYPH,
  CURRENT_LINE_GLYPH,
  RUN_CARD_HEADER_GLYPH,
  type CardChildRow,
  type CardLinesModel,
  type CardStyle,
  type FollowState,
} from "../src/extension/execution-status/render/card-lines";
import {
  RUN_CARD_CHILD_ROSTER_MAX,
  RUN_CARD_FOLLOW_DWELL_MS,
} from "../src/extension/execution-status/types";
import { computeStyledLines } from "../src/extension/execution-status/render/styled-lines";
import type { StyledLine } from "../src/extension/execution-status/render/styled-lines";
import { HEAT_LUT_SIZE } from "../src/extension/execution-status/render/heat";

// A styleless fake: geometry assertions read plain glyphs, not SGRs.
const PLAIN: CardStyle = {
  syntaxFg: () => "",
  accentFg: "",
  mutedFg: "",
};

/** Strip every SGR so assertions read visible text only. */
function visible(line: string): string {
  // eslint-disable-next-line no-control-regex
  return line.replace(/\x1b\[[0-9;]*m/g, "");
}

/** N plain styled lines `line 1` … `line N` (one trivia span each). */
function plainLines(n: number): StyledLine[] {
  return Array.from({ length: n }, (_, i) => ({
    spans: [{ text: `line ${i + 1}`, role: "trivia" as const }],
  }));
}

/** A LUT whose entry 0 is "" and whose hot entries carry a recognizable bg. */
function fakeLut(): string[] {
  const lut = [""];
  for (let i = 1; i < HEAT_LUT_SIZE; i++) {
    lut.push(`\x1b[48;2;${i};0;0m`);
  }
  return lut;
}

function baseModel(overrides: Partial<CardLinesModel> = {}): CardLinesModel {
  return {
    theta: "quality-loop",
    startedAtMs: 0,
    nowMs: 272_000,
    counters: { checkpoints: 1234, loopIters: 38 },
    activeChildren: 3,
    children: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Viewport math.
// ---------------------------------------------------------------------------

describe("D5 — sticky viewport (decision 3)", () => {
  it("a document shorter than the window pins top to 1", () => {
    expect(computeViewportTop(10, 20, 24, undefined)).toBe(1);
  });

  it("first render centers the current line", () => {
    // current 100 in a 300-line doc, height 24 → top = 100 - 12 = 88.
    expect(computeViewportTop(100, 300, 24, undefined)).toBe(88);
  });

  it("keeps the previous top while the current line stays in the middle third", () => {
    const top = computeViewportTop(100, 300, 24, undefined); // 88
    // Middle third of [88, 111]: rows 96..102 keep the window.
    expect(computeViewportTop(101, 300, 24, top)).toBe(top);
    expect(computeViewportTop(96, 300, 24, top)).toBe(top);
  });

  it("recenters once the current line leaves the middle third", () => {
    const top = computeViewportTop(100, 300, 24, undefined); // 88
    // Row 108 is inside the window but outside the middle third → recenter.
    expect(computeViewportTop(108, 300, 24, top)).toBe(108 - 12);
    // A jump outside the window entirely also recenters.
    expect(computeViewportTop(200, 300, 24, top)).toBe(188);
  });

  it("clamps at the document edges", () => {
    expect(computeViewportTop(1, 300, 24, undefined)).toBe(1);
    expect(computeViewportTop(300, 300, 24, undefined)).toBe(300 - 24 + 1);
  });

  it("no current line: holds the previous window (clamped), else 1", () => {
    expect(computeViewportTop(undefined, 300, 24, 88)).toBe(88);
    expect(computeViewportTop(undefined, 300, 24, undefined)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Dwell-damped file following (decision 6).
// ---------------------------------------------------------------------------

describe("D5 — dwell-damped file following (decision 6)", () => {
  it("switches only after the dwell elapses, and returns symmetrically", () => {
    const state: FollowState = { displayedFile: "/a.theta" };
    followCurrentFile(state, "/b.theta", 1000);
    expect(state.displayedFile).toBe("/a.theta"); // dwell pending
    followCurrentFile(state, "/b.theta", 1000 + RUN_CARD_FOLLOW_DWELL_MS - 1);
    expect(state.displayedFile).toBe("/a.theta");
    followCurrentFile(state, "/b.theta", 1000 + RUN_CARD_FOLLOW_DWELL_MS);
    expect(state.displayedFile).toBe("/b.theta"); // switched
    // Return on completion: parent-file sites re-accumulate the same dwell.
    followCurrentFile(state, "/a.theta", 2000);
    expect(state.displayedFile).toBe("/b.theta");
    followCurrentFile(state, "/a.theta", 2000 + RUN_CARD_FOLLOW_DWELL_MS);
    expect(state.displayedFile).toBe("/a.theta");
  });

  it("a tight call loop (site bouncing back before the dwell) never switches", () => {
    const state: FollowState = { displayedFile: "/a.theta" };
    for (let t = 0; t < 5000; t += 100) {
      followCurrentFile(state, t % 200 === 0 ? "/b.theta" : "/a.theta", t);
    }
    expect(state.displayedFile).toBe("/a.theta");
  });

  it("a candidate change restarts the dwell", () => {
    const state: FollowState = { displayedFile: "/a.theta" };
    followCurrentFile(state, "/b.theta", 0);
    followCurrentFile(state, "/c.theta", 400);
    followCurrentFile(state, "/c.theta", 400 + RUN_CARD_FOLLOW_DWELL_MS - 1);
    expect(state.displayedFile).toBe("/a.theta");
    followCurrentFile(state, "/c.theta", 400 + RUN_CARD_FOLLOW_DWELL_MS);
    expect(state.displayedFile).toBe("/c.theta");
  });
});

// ---------------------------------------------------------------------------
// Header / author row / breadcrumb.
// ---------------------------------------------------------------------------

describe("D5 — header, author row, breadcrumb", () => {
  it("renders the RFC header grammar with compact counters", () => {
    const lines = buildCardLines(baseModel(), 120, PLAIN);
    expect(visible(lines[0]!)).toBe(
      `${RUN_CARD_HEADER_GLYPH} /quality-loop · 4m32s · cp 1.2k · iters 38 · 3 children`,
    );
  });

  it("formatCount: plain under 1000, one-decimal k to 10k, rounded k above", () => {
    expect(formatCount(999)).toBe("999");
    expect(formatCount(1234)).toBe("1.2k");
    expect(formatCount(38_000)).toBe("38k");
    expect(formatCount(-1)).toBe("0");
  });

  it("the newest theta_progress payload renders as a row under the header", () => {
    const lines = buildCardLines(
      baseModel({ authorMessage: { message: "cluster 3/9", scope: "fix" } }),
      120,
      PLAIN,
    );
    expect(visible(lines[1]!)).toContain("✎ cluster 3/9");
  });

  it("a nested-invoke breadcrumb renders `/parent ▸ /callee`; none renders without one", () => {
    const withCrumb = buildCardLines(
      baseModel({ breadcrumb: { parent: "quality-loop", callee: "fix-cluster" } }),
      120,
      PLAIN,
    );
    expect(visible(withCrumb[1]!)).toBe("/quality-loop ▸ /fix-cluster");
    const without = buildCardLines(baseModel(), 120, PLAIN);
    expect(without.some((line) => visible(line).includes("▸"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Viewport rows: gutter, heat padding, markers, badges.
// ---------------------------------------------------------------------------

describe("D5 — viewport rows", () => {
  const WIDTH = 60;

  function viewportModel(overrides: Partial<CardLinesModel> = {}): CardLinesModel {
    return baseModel({
      viewport: {
        lines: plainLines(30),
        top: 1,
        height: 5,
        currentLine: 3,
        heatByLine: new Map([
          [2, { ageMs: 0, clamped: false }], // full heat
          [3, { ageMs: 100_000, clamped: true }], // ancient but CLAMPED → full heat
        ]),
        lut: fakeLut(),
      },
      ...overrides,
    });
  }

  it("draws height rows with right-aligned gutter numbers and the ▶ current marker", () => {
    const lines = buildCardLines(viewportModel(), WIDTH, PLAIN);
    const rows = lines.slice(1, 6).map(visible);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toBe("   1   line 1");
    expect(rows[2]!.trimEnd()).toBe(`   3 ${CURRENT_LINE_GLYPH} line 3`);
  });

  it("heat rows pad to the render width, then close the bg with ESC[49m (spike Q4)", () => {
    const lines = buildCardLines(viewportModel(), WIDTH, PLAIN);
    const hot = lines[2]!; // viewport line 2 (age 0)
    expect(hot.startsWith(`\x1b[48;2;${HEAT_LUT_SIZE - 1};0;0m`)).toBe(true);
    expect(hot).toContain("\x1b[49m");
    // Everything before the 49m close is padded to exactly WIDTH visible chars.
    const beforeClose = hot.slice(0, hot.indexOf("\x1b[49m"));
    expect(visible(beforeClose)).toHaveLength(WIDTH);
  });

  it("OPERATOR RULING: a clamped line renders at FULL heat regardless of age", () => {
    const lines = buildCardLines(viewportModel(), WIDTH, PLAIN);
    const clamped = lines[3]!; // viewport line 3, ageMs 100000 but clamped
    expect(clamped.startsWith(`\x1b[48;2;${HEAT_LUT_SIZE - 1};0;0m`)).toBe(true);
  });

  it("a cold line emits NO background SGR and no width padding", () => {
    const lines = buildCardLines(viewportModel(), WIDTH, PLAIN);
    const cold = lines[1]!; // viewport line 1: no heat entry → lut[0] = ""
    expect(cold).not.toContain("\x1b[48;");
    expect(cold).not.toContain("\x1b[49m");
    expect(visible(cold).length).toBeLessThan(WIDTH);
  });

  it("a running child's launch line gets the ⑂ gutter marker and a right-aligned live badge", () => {
    const child: CardChildRow = {
      name: "fix-cluster",
      startedAtMs: 141_000, // 131s before nowMs → 2m11s
      activity: { turns: 14, toolExecs: 41, lastToolName: "bash" },
      launchLine: 2,
    };
    const lines = buildCardLines(viewportModel({ children: [child] }), WIDTH, PLAIN);
    const row = visible(lines[2]!);
    expect(row).toContain(`${CHILD_MARKER_GLYPH} `);
    expect(row.trimEnd().endsWith(`${CHILD_MARKER_GLYPH} 2m11s · 14 turns · bash`)).toBe(true);
    // Right-aligned: the badge's last character sits at the render width.
    expect(row.trimEnd()).toHaveLength(WIDTH);
  });

  it("par-for lanes over subagents render the lane-summary badge form", () => {
    const children: CardChildRow[] = [1, 2, 3, 4].map((i) => ({
      name: `worker-${i}`,
      startedAtMs: 0,
      launchLine: 2,
    }));
    const lines = buildCardLines(
      viewportModel({
        children,
        lanes: {
          total: 6,
          width: 4,
          queued: 0,
          done: 2,
          err: 0,
          running: [1, 2, 3, 4].map((index) => ({ index, startedAtMs: 0 })),
        },
      }),
      80,
      PLAIN,
    );
    expect(visible(lines[2]!)).toContain(`${CHILD_MARKER_GLYPH} 4/6 lanes · 2 done · 0 err`);
  });

  it("a lane-less multi-child launch line renders the running count", () => {
    const children: CardChildRow[] = [1, 2].map((i) => ({
      name: `w${i}`,
      startedAtMs: 0,
      launchLine: 2,
    }));
    const lines = buildCardLines(viewportModel({ children }), WIDTH, PLAIN);
    expect(visible(lines[2]!)).toContain(`${CHILD_MARKER_GLYPH} 2 running`);
  });

  it("an ENDED child's launch line carries no marker or badge", () => {
    const child: CardChildRow = {
      name: "fix-cluster",
      startedAtMs: 0,
      endedAtMs: 100,
      launchLine: 2,
    };
    const lines = buildCardLines(viewportModel({ children: [child] }), WIDTH, PLAIN);
    // The viewport row shows no marker; the roster still lists the child.
    expect(visible(lines[2]!)).not.toContain(CHILD_MARKER_GLYPH);
  });

  it("expanded: the viewport renders the full script", () => {
    const model = baseModel({
      viewport: {
        lines: plainLines(30),
        top: 1,
        height: 30,
        heatByLine: new Map(),
        lut: fakeLut(),
      },
    });
    const lines = buildCardLines(model, WIDTH, PLAIN);
    // Header + 30 source rows.
    expect(lines).toHaveLength(31);
    expect(visible(lines[30]!)).toContain("line 30");
  });

  it("syntax-highlighted spans re-concatenate to the source text inside the gutter row", () => {
    // Real lexer-shaped styled lines through computeStyledLines: text + roles.
    const source = "let x = 1 // note";
    const styled = computeStyledLines(source, [
      { kind: "keyword", text: "let", range: { start: { line: 1, column: 1 }, end: { line: 1, column: 4 } } },
      { kind: "ident", text: "x", range: { start: { line: 1, column: 5 }, end: { line: 1, column: 6 } } },
      { kind: "punct", text: "=", range: { start: { line: 1, column: 7 }, end: { line: 1, column: 8 } } },
      { kind: "number", text: "1", range: { start: { line: 1, column: 9 }, end: { line: 1, column: 10 } } },
    ] as never);
    const model = baseModel({
      viewport: {
        lines: styled,
        top: 1,
        height: 1,
        heatByLine: new Map(),
        lut: fakeLut(),
      },
    });
    const lines = buildCardLines(model, 80, PLAIN);
    expect(visible(lines[1]!)).toBe("  1   let x = 1 // note");
  });
});

// ---------------------------------------------------------------------------
// Children roster.
// ---------------------------------------------------------------------------

describe("D5 — children roster", () => {
  it("one row per child in insertion order: glyph, name + scope tag, elapsed, activity, [line N]", () => {
    const children: CardChildRow[] = [
      {
        name: "fix-cluster",
        scope: "src__parser",
        startedAtMs: 141_000,
        activity: { turns: 14, toolExecs: 41, lastToolName: "bash" },
        launchLine: 142,
      },
      {
        name: "review-fix",
        startedAtMs: 260_000,
        activity: { turns: 1, toolExecs: 3, lastToolName: "read" },
      },
    ];
    const lines = buildCardLines(baseModel({ children }), 120, PLAIN).map(visible);
    expect(lines[1]).toBe("  children:");
    expect(lines[2]).toBe(
      `    ${CHILD_MARKER_GLYPH} fix-cluster (src__parser)   2m11s  14 turns · 41 tools · bash   [line 142]`,
    );
    expect(lines[3]).toBe(`    ${CHILD_MARKER_GLYPH} review-fix   12s  1 turn · 3 tools · read`);
  });

  it("a placed child renders its `live in <placement>` reference instead of activity", () => {
    const lines = buildCardLines(
      baseModel({
        children: [{ name: "w", startedAtMs: 0, placement: "live in tmux %12" }],
      }),
      120,
      PLAIN,
    ).map(visible);
    expect(lines[2]).toContain("live in tmux %12");
  });

  it("an ended child lingers with the done glyph and its frozen elapsed", () => {
    const lines = buildCardLines(
      baseModel({ children: [{ name: "w", startedAtMs: 0, endedAtMs: 30_000 }] }),
      120,
      PLAIN,
    ).map(visible);
    expect(lines[2]).toBe("    ✓ w   30s  done");
  });

  it(`caps the roster at ${RUN_CARD_CHILD_ROSTER_MAX} rows + '+N more'`, () => {
    const children: CardChildRow[] = Array.from({ length: 11 }, (_, i) => ({
      name: `w${i}`,
      startedAtMs: 0,
    }));
    const lines = buildCardLines(baseModel({ children }), 120, PLAIN).map(visible);
    // "children:" + 8 rows + "+3 more".
    expect(lines).toHaveLength(1 + 1 + RUN_CARD_CHILD_ROSTER_MAX + 1);
    expect(lines[lines.length - 1]).toBe("    +3 more");
  });

  it("no children → no roster section at all", () => {
    const lines = buildCardLines(baseModel(), 120, PLAIN).map(visible);
    expect(lines).toHaveLength(1);
  });
});
