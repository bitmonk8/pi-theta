// Bug 0490 witness — a top-level drive that ENDS leaves its run card's last
// PAINTED frame in the running form (`⟳` header, `▶` on the final effect
// line): the run-card sink requests repaints only while heat fades, the bus
// evicts the ended node after DONE_LINGER_MS, and the eviction tick calls the
// sink's `clear()` — a no-op — so no repaint ever replaces the live frame.
// With an Ok prompt-mode outcome (no note by the success-side null-policy)
// and the run summary default-off, that frozen frame is the operator's only
// surface: a completed drive is indistinguishable from a wedged one.
//
// TIER: unit, offline, deterministic, provider-free.

import { describe, expect, it } from "vitest";
import { createRunCardController } from "../src/extension/execution-status/run-card-renderer";
import { createExecutionStatusBus } from "../src/extension/execution-status/bus";
import {
  DONE_LINGER_MS,
  STATUS_TICK_MS,
  type ExecutionStatusBus,
  type ThetaRunSeed,
} from "../src/extension/execution-status/types";
import { HEAT_FADE_MS } from "../src/extension/execution-status/render/heat";
import { FakeClock } from "./helpers/fake-clock";

const SOURCE_PATH = "/scripts/bench.theta";
const SOURCE_TEXT = ["---", "mode: prompt", "---", "let v = judge()?", '"DONE"'].join("\n");
const SEED: ThetaRunSeed = {
  invocationId: "inv-1",
  theta: "bench",
  argsSummary: "",
  startedAtMs: 1_700_000_000_000,
  sourcePath: SOURCE_PATH,
};

function visible(line: string): string {
  // eslint-disable-next-line no-control-regex
  return line.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * A TUI stand-in: every `requestRender` repaints the card component (what
 * pi-tui does on a render request), so `lastFrame()` is what the operator
 * sees once the bus goes quiet.
 */
function paintedHarness(): {
  bus: ExecutionStatusBus;
  clock: FakeClock;
  lastFrame: () => string[];
  paints: () => number;
  /** An incidental pi-tui repaint (keypress, new message) — not sink-requested. */
  repaint: () => string[];
} {
  const clock = new FakeClock();
  let bus: ExecutionStatusBus | undefined;
  const encoder = new TextEncoder();
  const controller = createRunCardController({
    bus: () => bus,
    clock: () => clock,
    readSourceBytes: (path) => (path === SOURCE_PATH ? encoder.encode(SOURCE_TEXT) : undefined),
  });
  bus = createExecutionStatusBus({ clock, sinks: [controller.sink] });
  const theme = {
    getFgAnsi: (): string => "\x1b[38;2;200;200;200m",
    getColorMode: (): string => "truecolor",
  };
  // The card component is created once, when pi-tui first renders the entry.
  bus.invocationStarted("inv-1", "bench");
  const component = controller.renderer(
    { customType: "theta-run", data: SEED } as never,
    { expanded: false },
    theme,
  )!;
  let frame = component.render(80);
  let paints = 0;
  controller.attachTui({
    requestRender: (): void => {
      paints += 1;
      frame = component.render(80);
    },
  });
  return {
    bus,
    clock,
    lastFrame: () => frame,
    paints: () => paints,
    repaint: () => (frame = component.render(80)),
  };
}

describe("bug 0490 — a completed drive's run card must not freeze in the running form", () => {
  it("after the drive ends and the bus goes quiet, the last painted frame no longer reads as running", () => {
    const h = paintedHarness();
    // The final effect: the invoke line clamps in flight, then settles.
    h.bus.trace("inv-1", { file: SOURCE_PATH, line: 4, column: 1 }, "stmt");
    h.clock.advance(STATUS_TICK_MS * 3);
    expect(visible(h.lastFrame()[0]!)).toMatch(/^⟳ \/bench/); // running: correct
    h.bus.invocationEnded("inv-1");
    // Well past the linger and the fade: the bus is idle, nothing repaints.
    h.clock.advance(DONE_LINGER_MS + HEAT_FADE_MS + STATUS_TICK_MS * 10);
    h.clock.advance(60_000);
    expect(h.bus.snapshot().nodes).toHaveLength(0);
    const frame = h.lastFrame().map(visible);
    expect(frame[0]).not.toMatch(/^⟳/);
    // The RFC 0015 / PIC-75 static degradation actually reached the screen.
    expect(frame).toHaveLength(1);
    expect(frame[0]).toMatch(/^theta \/bench · started /);
  });

  it("eviction while ANOTHER drive keeps the bus ticking (render arm, not clear arm) still repaints the ended card", () => {
    const h = paintedHarness();
    h.bus.trace("inv-1", { file: SOURCE_PATH, line: 4, column: 1 }, "stmt");
    // A second top-level drive stays running with stale heat and no
    // children: `animationOwed` is false for it, so only the eviction can
    // request the repaint.
    h.bus.invocationStarted("inv-2", "other");
    h.clock.advance(STATUS_TICK_MS * 3);
    h.bus.invocationEnded("inv-1");
    h.clock.advance(DONE_LINGER_MS + HEAT_FADE_MS + STATUS_TICK_MS * 10);
    expect(h.bus.snapshot().nodes.map((n) => n.invocationId)).toEqual(["inv-2"]);
    expect(h.lastFrame().map(visible)[0]).toMatch(/^theta \/bench · started /);
  });

  it("no departure, no extra repaint: a TICKING bus whose only node is a stale-heat running drive requests nothing", () => {
    const h = paintedHarness();
    h.bus.trace("inv-1", { file: SOURCE_PATH, line: 4, column: 1 }, "stmt");
    // Past the fade: the running node keeps the bus ticking every
    // STATUS_TICK_MS (#hasRunningWork), but nothing departs and no heat is
    // fresh, so the sink owes no repaint on any of those ticks.
    h.clock.advance(HEAT_FADE_MS + STATUS_TICK_MS * 5);
    const settled = h.paints();
    h.clock.advance(60_000);
    expect(h.bus.snapshot().nodes).toHaveLength(1);
    expect(h.paints()).toBe(settled);
  });

  it("names → off → drive ends → names: the eviction after the round trip still repaints the static form", () => {
    const h = paintedHarness();
    h.bus.trace("inv-1", { file: SOURCE_PATH, line: 4, column: 1 }, "stmt");
    h.clock.advance(STATUS_TICK_MS * 3);
    h.bus.setVerbosity("off");
    h.bus.invocationEnded("inv-1");
    h.clock.advance(DONE_LINGER_MS + HEAT_FADE_MS);
    h.bus.setVerbosity("names");
    h.clock.advance(STATUS_TICK_MS * 10);
    expect(h.bus.snapshot().nodes).toHaveLength(0);
    expect(h.lastFrame().map(visible)[0]).toMatch(/^theta \/bench · started /);
  });

  it("two drives, names → off → inv-1 ends → names: the eviction arriving through render() (inv-2 still tracked) repaints", () => {
    const h = paintedHarness();
    h.bus.trace("inv-1", { file: SOURCE_PATH, line: 4, column: 1 }, "stmt");
    h.bus.invocationStarted("inv-2", "other");
    h.clock.advance(STATUS_TICK_MS * 3);
    h.bus.setVerbosity("off");
    h.bus.invocationEnded("inv-1");
    h.clock.advance(DONE_LINGER_MS + HEAT_FADE_MS);
    h.bus.setVerbosity("names");
    h.clock.advance(60_000);
    expect(h.bus.snapshot().nodes.map((n) => n.invocationId)).toEqual(["inv-2"]);
    expect(h.lastFrame().map(visible)[0]).toMatch(/^theta \/bench · started /);
  });

  it("a drive the sink never saw (no tick before off; traced and ended during off) repaints static once verbosity returns", () => {
    const h = paintedHarness();
    h.bus.invocationStarted("inv-2", "other");
    h.bus.setVerbosity("off");
    // inv-1 (the harness card) already started; it traces and ends entirely
    // inside the off window.
    h.bus.trace("inv-1", { file: SOURCE_PATH, line: 4, column: 1 }, "stmt");
    h.bus.invocationEnded("inv-1");
    h.clock.advance(DONE_LINGER_MS + HEAT_FADE_MS);
    h.bus.setVerbosity("names");
    h.clock.advance(60_000);
    expect(h.lastFrame().map(visible)[0]).toMatch(/^theta \/bench · started /);
  });

  it("under theta.progress off (no ticks, node never swept) an incidental repaint of an ended drive draws the static form", () => {
    const h = paintedHarness();
    h.bus.trace("inv-1", { file: SOURCE_PATH, line: 4, column: 1 }, "stmt");
    h.bus.setVerbosity("off");
    h.bus.invocationEnded("inv-1");
    h.clock.advance(60_000);
    expect(h.bus.tracks("inv-1")).toBe(true); // never swept under off
    expect(h.repaint().map(visible)[0]).toMatch(/^theta \/bench · started /);
  });

  it("an ended drive INSIDE its linger still renders live (the done-flash fade is preserved)", () => {
    const h = paintedHarness();
    h.bus.trace("inv-1", { file: SOURCE_PATH, line: 4, column: 1 }, "stmt");
    h.bus.setVerbosity("off"); // freeze the sweep so the node stays put
    h.bus.invocationEnded("inv-1");
    h.clock.advance(DONE_LINGER_MS - 1);
    expect(h.repaint().map(visible)[0]).toMatch(/^⟳ \/bench/);
  });
});
