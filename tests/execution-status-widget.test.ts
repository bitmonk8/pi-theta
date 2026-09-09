import { describe, expect, it } from "vitest";
import {
  createWidgetSink,
  renderStatusTree,
  type WidgetUi,
} from "../src/extension/execution-status/widget-sink";
import { WIDGET_HEIGHT_LINES } from "../src/extension/execution-status/types";
import type {
  ExecutionStatusSnapshot,
  InvocationNodeSnapshot,
} from "../src/extension/execution-status/types";

// RFC 0010 (execution-status.md EXST-8/EXST-11) — `tests/execution-status-widget.test.ts`
// (T-WDG). Behaviour-matrix rows B41-B44 (par. 5.2 render algorithm, worked
// example, 6-line budget + overflow, width clipping, counts-verbosity lane
// rows).
//
// `widget-sink.ts`'s current bodies (stubs) return `[]` from
// `renderStatusTree` unconditionally and never call it from `render()`; only
// `clear()` is real. Every line-content assertion below reds on the missing
// lines, not on a throw.

function node(overrides: Partial<InvocationNodeSnapshot> & Pick<InvocationNodeSnapshot, "invocationId" | "theta" | "startedAtMs">): InvocationNodeSnapshot {
  return { counters: { checkpoints: 0, loopIters: 0 }, ...overrides };
}

function snapshotOf(nodes: readonly InvocationNodeSnapshot[], untracked = 0): ExecutionStatusSnapshot {
  return { nodes, untracked };
}

// ---------------------------------------------------------------------------
// B41 — the par. 5.2 worked example, width 100, names, tree.
// ---------------------------------------------------------------------------

describe("T-WDG — B41: renderStatusTree worked example (par. 5.2)", () => {
  it("renders the exact 6-line worked example byte-for-byte", () => {
    const root = node({
      invocationId: "root",
      theta: "quality-loop",
      mode: "prompt",
      startedAtMs: 0,
      currentEffect: {
        kind: "tool-call",
        site: { file: "quality-loop.theta", line: 214, column: 1 },
        sinceMs: 840000 - 128000,
      },
      counters: { checkpoints: 3, loopIters: 0 },
      lanes: {
        total: 12,
        width: 4,
        queued: 2,
        done: 2,
        err: 1,
        running: [
          { index: 3, startedAtMs: 700000 },
          { index: 5, startedAtMs: 795000 },
          { index: 6, startedAtMs: 827000 },
        ],
      },
    });
    const lensDCruft = node({
      invocationId: "child-3",
      theta: "lens_d2_cruft",
      mode: "subagent",
      parentInvocationId: "root",
      startedAtMs: 700000,
      childActivity: { turns: 7, toolExecs: 1, lastToolName: "bash", lastEventAtMs: 838000 },
    });
    const fixCluster1 = node({
      invocationId: "child-5",
      theta: "fix-cluster",
      mode: "subagent",
      parentInvocationId: "root",
      startedAtMs: 795000,
      childActivity: { turns: 2, toolExecs: 1, lastToolName: "read_file", lastEventAtMs: 838500 },
    });
    const fixCluster2 = node({
      invocationId: "child-6",
      theta: "fix-cluster",
      mode: "subagent",
      parentInvocationId: "root",
      startedAtMs: 827000,
      childActivity: { turns: 1, toolExecs: 0, lastEventAtMs: 838900 },
    });
    const s = snapshotOf([root, lensDCruft, fixCluster1, fixCluster2], 1);

    const lines = renderStatusTree(s, "names", 100, 840000);
    expect(lines).toEqual([
      "θ /quality-loop 14m · tool-call quality-loop:214 (2m8s)",
      "  par for 7/12 · 3▶ 2✓ 1✗ · w4",
      "    #3 ▶ lens_d2_cruft t7 bash 2m20s",
      "    #5 ▶ fix-cluster t2 read_file 45s",
      "    #6 ▶ fix-cluster t1 13s",
      "… +1 more",
    ]);
  });
});

// ---------------------------------------------------------------------------
// B42 — 6-line budget + overflow at multiple widths.
// ---------------------------------------------------------------------------

describe("T-WDG — B42: 6-line budget with '… +<n> more' overflow, width clipping", () => {
  it("9 top-level candidate lines collapse to 5 real lines + one overflow line", () => {
    const nodes = Array.from({ length: 9 }, (_, i) =>
      node({ invocationId: `n${i}`, theta: `theta${i}`, startedAtMs: i * 1000 }),
    );
    const s = snapshotOf(nodes);
    const lines = renderStatusTree(s, "names", 80, 9000);
    expect(lines).toHaveLength(WIDGET_HEIGHT_LINES);
    expect(lines[5]).toBe("… +4 more");
  });

  it("every line is clamped to the supplied width across {40, 80, 120}", () => {
    const nodes = [node({ invocationId: "n", theta: "x".repeat(200), startedAtMs: 0 })];
    const s = snapshotOf(nodes);
    for (const width of [40, 80, 120]) {
      const lines = renderStatusTree(s, "names", width, 0);
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(width);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// B43 — view gate: min/off clears the widget (sink-level).
// ---------------------------------------------------------------------------

function recordingWidgetUi(): { ui: WidgetUi; calls: (string[] | undefined)[] } {
  const calls: (string[] | undefined)[] = [];
  return {
    ui: {
      setWidget: (_key, content): void => {
        calls.push(content);
      },
    },
    calls,
  };
}

describe("T-WDG — B43: view min/off clears the widget", () => {
  it("clear() calls setWidget('theta', undefined)", () => {
    const { ui, calls } = recordingWidgetUi();
    const sink = createWidgetSink(ui);
    sink.clear();
    expect(calls).toEqual([undefined]);
  });

  it("render() under view 'tree' with live nodes reaches setWidget with the rendered lines", () => {
    const { ui, calls } = recordingWidgetUi();
    const sink = createWidgetSink(ui);
    const nodes = [node({ invocationId: "n", theta: "x", startedAtMs: 0 })];
    sink.render(snapshotOf(nodes), "tree", "names", 0);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[calls.length - 1]).not.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// B44 — counts verbosity omits the lane row's tool name.
// ---------------------------------------------------------------------------

describe("T-WDG — B44: counts verbosity omits lane-row tool name", () => {
  it("renders '#3 ▶ lens_d2_cruft t7 2m14s' with no tool-name token", () => {
    const root = node({
      invocationId: "root",
      theta: "quality-loop",
      startedAtMs: 0,
      lanes: {
        total: 1,
        width: 1,
        queued: 0,
        done: 0,
        err: 0,
        running: [{ index: 3, startedAtMs: 700000 }],
      },
    });
    const lensDCruft = node({
      invocationId: "child-3",
      theta: "lens_d2_cruft",
      parentInvocationId: "root",
      startedAtMs: 700000,
      childActivity: { turns: 7, toolExecs: 1, lastToolName: "bash", lastEventAtMs: 838000 },
    });
    const s = snapshotOf([root, lensDCruft]);
    const lines = renderStatusTree(s, "counts", 100, 840000);
    expect(lines).toContain("    #3 ▶ lens_d2_cruft t7 2m20s");
  });
});
