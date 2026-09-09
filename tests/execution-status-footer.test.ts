import { describe, expect, it } from "vitest";
import {
  createFooterSink,
  renderFooterLine,
  renderWorkingMessage,
  type FooterUi,
} from "../src/extension/execution-status/footer-sink";
import { FOOTER_CLAMP_CHARS } from "../src/extension/execution-status/types";
import type {
  ExecutionStatusSnapshot,
  InvocationNodeSnapshot,
} from "../src/extension/execution-status/types";

// RFC 0010 (execution-status.md EXST-8/EXST-10) — `tests/execution-status-footer.test.ts`
// (T-FTR). Behaviour-matrix rows B35-B40, B43 (par. 5.1 worked examples,
// FOOTER_CLAMP_CHARS, setStatus/setWorkingMessage call discipline).
//
// `footer-sink.ts`'s current bodies (stubs) return `undefined` from both pure
// renderers unconditionally and never call either renderer from `render()`;
// only `clear()` is real. Every worked-example / string assertion below reds
// on the missing rendered string, not on a throw or setup failure.

/** Minimal node builder — only the fields a given assertion needs are set. */
function node(overrides: Partial<InvocationNodeSnapshot> & Pick<InvocationNodeSnapshot, "invocationId" | "theta" | "startedAtMs">): InvocationNodeSnapshot {
  return {
    counters: { checkpoints: 0, loopIters: 0 },
    ...overrides,
  };
}

function snapshotOf(nodes: readonly InvocationNodeSnapshot[], untracked = 0): ExecutionStatusSnapshot {
  return { nodes, untracked };
}

// ---------------------------------------------------------------------------
// B35/B36 — the par. 5.1 worked example: single node, tool-call effect, an
// open lane set, a tapped child's lastToolName.
// ---------------------------------------------------------------------------

const QUALITY_LOOP_NODE: InvocationNodeSnapshot = node({
  invocationId: "inv-quality-loop",
  theta: "quality-loop",
  mode: "prompt",
  startedAtMs: 0, // 14m before nowMs=840000
  currentEffect: {
    kind: "tool-call",
    site: { file: "quality-loop.theta", line: 214, column: 1 },
    sinceMs: 840000 - 128000, // age = 2m8s
  },
  counters: { checkpoints: 3, loopIters: 0 },
  lanes: {
    total: 6,
    width: 3,
    queued: 1,
    done: 2,
    err: 0,
    running: [
      { index: 0, startedAtMs: 700000 },
      { index: 1, startedAtMs: 705000 },
      { index: 2, startedAtMs: 710000 },
    ],
  },
  childActivity: {
    turns: 7,
    toolExecs: 3,
    lastToolName: "bash",
    lastEventAtMs: 838000,
  },
});

describe("T-FTR — B35/B36: renderFooterLine worked example (par. 5.1)", () => {
  it("B35: names verbosity — full grammar incl. tool-name kids suffix", () => {
    const s = snapshotOf([QUALITY_LOOP_NODE]);
    const line = renderFooterLine(s, "names", 840000);
    expect(line).toBe(
      "θ /quality-loop 14m · tool-call quality-loop:214 (2m8s) · lanes 3▶ 2✓ 1… · bash",
    );
  });

  it("B36: counts verbosity — identical minus the tool-name suffix", () => {
    const s = snapshotOf([QUALITY_LOOP_NODE]);
    const line = renderFooterLine(s, "counts", 840000);
    expect(line).toBe("θ /quality-loop 14m · tool-call quality-loop:214 (2m8s) · lanes 3▶ 2✓ 1…");
  });
});

// ---------------------------------------------------------------------------
// B37 — a started-but-unbound binder-phase node.
// ---------------------------------------------------------------------------

describe("T-FTR — B37: binder-phase node (started, unbound)", () => {
  it("renders the binder-call effect with no mode/lanes/children", () => {
    const fixClusterNode: InvocationNodeSnapshot = node({
      invocationId: "inv-fix-cluster",
      theta: "fix-cluster",
      startedAtMs: 0, // 37s before nowMs=37000
      currentEffect: {
        kind: "binder-call",
        site: { file: "fix-cluster.theta", line: 1, column: 1 },
        sinceMs: 37000 - 2000, // age = 2s
      },
    });
    const s = snapshotOf([fixClusterNode]);
    const line = renderFooterLine(s, "names", 37000);
    expect(line).toBe("θ /fix-cluster 37s · binder-call fix-cluster:1 (2s)");
  });
});

// ---------------------------------------------------------------------------
// B38 — multiple top-level nodes: oldest rendered + "(+k more)"; clamp.
// ---------------------------------------------------------------------------

describe("T-FTR — B38: multiple top-level nodes and FOOTER_CLAMP_CHARS", () => {
  it("renders the oldest top-level node with a (+2 more) tail", () => {
    const a = node({ invocationId: "a", theta: "a", startedAtMs: 0 }); // 5s old
    const b = node({ invocationId: "b", theta: "b", startedAtMs: 1000 });
    const c = node({ invocationId: "c", theta: "c", startedAtMs: 2000 });
    const s = snapshotOf([a, b, c]);
    const line = renderFooterLine(s, "names", 5000);
    expect(line).toBe("θ /a 5s (+2 more)");
  });

  it("clamps a pathologically long rendered line to FOOTER_CLAMP_CHARS with a trailing ellipsis", () => {
    const longTheta = "x".repeat(500);
    const s = snapshotOf([node({ invocationId: "long", theta: longTheta, startedAtMs: 0 })]);
    const line = renderFooterLine(s, "names", 0);
    expect(line).toBeDefined();
    expect(line!.length).toBeLessThanOrEqual(FOOTER_CLAMP_CHARS);
    expect(line!.endsWith("…")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// B40 — renderWorkingMessage: query-checkpoint gate.
// ---------------------------------------------------------------------------

describe("T-FTR — B40: renderWorkingMessage query-checkpoint gate", () => {
  it("returns the working message while a prompt-mode node's currentEffect.kind is 'query'", () => {
    const queryingNode = node({
      invocationId: "inv-x",
      theta: "x",
      mode: "prompt",
      startedAtMs: 0,
      currentEffect: {
        kind: "query",
        site: { file: "x.theta", line: 1, column: 1 },
        sinceMs: 0,
      },
    });
    const s = snapshotOf([queryingNode]);
    expect(renderWorkingMessage(s, 5000)).toBe("θ /x 5s");
  });

  it("returns undefined once the next effect is a non-query checkpoint", () => {
    const toolCallNode = node({
      invocationId: "inv-x",
      theta: "x",
      mode: "prompt",
      startedAtMs: 0,
      currentEffect: {
        kind: "tool-call",
        site: { file: "x.theta", line: 1, column: 1 },
        sinceMs: 5000,
      },
    });
    const s = snapshotOf([toolCallNode]);
    expect(renderWorkingMessage(s, 6000)).toBeUndefined();
  });

  it("never sets a working message for a subagent-mode node's query effect", () => {
    const subagentQuerying = node({
      invocationId: "inv-y",
      theta: "y",
      mode: "subagent",
      startedAtMs: 0,
      currentEffect: {
        kind: "query",
        site: { file: "y.theta", line: 1, column: 1 },
        sinceMs: 0,
      },
    });
    const s = snapshotOf([subagentQuerying]);
    expect(renderWorkingMessage(s, 5000)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// B39/B43 — sink render/clear call discipline.
// ---------------------------------------------------------------------------

function recordingFooterUi(): { ui: FooterUi; statusCalls: (string | undefined)[]; workingCalls: (string | undefined)[] } {
  const statusCalls: (string | undefined)[] = [];
  const workingCalls: (string | undefined)[] = [];
  return {
    ui: {
      setStatus: (_key, text): void => {
        statusCalls.push(text);
      },
      setWorkingMessage: (message?): void => {
        workingCalls.push(message);
      },
    },
    statusCalls,
    workingCalls,
  };
}

describe("T-FTR — B39: last node evicted -> sink clears setStatus", () => {
  it("clear() calls setStatus('theta', undefined)", () => {
    const { ui, statusCalls } = recordingFooterUi();
    const sink = createFooterSink(ui);
    sink.clear();
    expect(statusCalls).toEqual([undefined]);
  });
});

describe("T-FTR — B43: view 'off' clears the footer too", () => {
  it("render() with view 'off' produces no live status text (sink render is a no-op stub; this reds once real render() calls renderFooterLine and observes the view gate)", () => {
    const { ui, statusCalls } = recordingFooterUi();
    const sink = createFooterSink(ui);
    sink.render(snapshotOf([QUALITY_LOOP_NODE]), "off", "names", 840000);
    // Per the seam sheet, an "off" view still folds state but EXST-10's
    // verbosity gate (not view) governs whether the bus ticks at all; this
    // sink-level assertion pins that a "tree"-shaped render call with live
    // content actually reaches setStatus with the rendered line.
    sink.render(snapshotOf([QUALITY_LOOP_NODE]), "tree", "names", 840000);
    expect(statusCalls).toContain(
      "θ /quality-loop 14m · tool-call quality-loop:214 (2m8s) · lanes 3▶ 2✓ 1… · bash",
    );
  });
});
