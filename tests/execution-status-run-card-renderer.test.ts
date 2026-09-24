// RFC 0015 (D5) — the live run-card renderer shell (`run-card-renderer.ts`):
// static degradation (unknown invocation / unusable theme / absent latches),
// the live component's snapshot-driven render, the endpoint ladder + LUT
// (theme-SGR parse, 256color quantization, async OSC 11 rebuild), the EXST-6
// tick-riding sink's animation predicate, the TUI-handle capture through the
// `ctx.ui.setWidget` factory overload, per-card styled-line caching, and the
// bus's D5 cadence extension (ticks continue through the done-flash linger
// while heat is younger than HEAT_FADE_MS).
//
// TIER: unit, offline, deterministic, provider-free.

import { describe, expect, it } from "vitest";
import {
  captureTuiRenderHandle,
  createRunCardController,
  type RunCardController,
  type TuiRenderHandle,
} from "../src/extension/execution-status/run-card-renderer";
import { createExecutionStatusBus } from "../src/extension/execution-status/bus";
import {
  DONE_LINGER_MS,
  STATUS_TICK_MS,
  type ExecutionStatusBus,
  type StatusSink,
  type ThetaRunSeed,
} from "../src/extension/execution-status/types";
import { HEAT_FADE_MS, HEAT_LUT_SIZE } from "../src/extension/execution-status/render/heat";
import { FakeClock } from "./helpers/fake-clock";

// ---------------------------------------------------------------------------
// Fakes.
// ---------------------------------------------------------------------------

const SOURCE_PATH = "/scripts/quality-loop.theta";
const SOURCE_TEXT = ["---", "mode: prompt", "---", "let x = 1", '"DONE"'].join("\n");

const SEED: ThetaRunSeed = {
  invocationId: "inv-1",
  theta: "quality-loop",
  argsSummary: "fix the parser",
  startedAtMs: 1_700_000_000_000,
  sourcePath: SOURCE_PATH,
};

function entryFor(data: unknown): never {
  return { customType: "theta-run", data } as never;
}

/** A duck-typed Theme standing in for the interactive host's (spike Q1). */
function fakeTheme(options: {
  readonly mode?: "truecolor" | "256color";
  readonly accent?: string;
  readonly text?: string;
} = {}): unknown {
  const roles: Record<string, string> = {
    accent: options.accent ?? "\x1b[38;2;10;20;200m",
    text: options.text ?? "\x1b[38;2;220;220;220m",
    muted: "\x1b[38;2;120;120;120m",
    syntaxKeyword: "\x1b[38;2;200;100;0m",
    syntaxVariable: "\x1b[38;2;0;200;100m",
    syntaxNumber: "\x1b[38;2;0;100;200m",
    syntaxString: "\x1b[38;2;100;200;0m",
    syntaxPunctuation: "\x1b[38;2;150;150;150m",
    syntaxComment: "\x1b[38;2;90;90;90m",
  };
  return {
    getFgAnsi: (role: string): string => roles[role] ?? "",
    getColorMode: (): string => options.mode ?? "truecolor",
  };
}

interface Harness {
  readonly bus: ExecutionStatusBus;
  readonly clock: FakeClock;
  readonly controller: RunCardController;
  readonly reads: string[];
}

function harness(options: { readonly sinks?: StatusSink[] } = {}): Harness {
  const clock = new FakeClock();
  const bus = createExecutionStatusBus({ clock, sinks: options.sinks ?? [] });
  const reads: string[] = [];
  const encoder = new TextEncoder();
  const controller = createRunCardController({
    bus: () => bus,
    clock: () => clock,
    readSourceBytes: (path: string): Uint8Array | undefined => {
      reads.push(path);
      if (path === SOURCE_PATH) {
        return encoder.encode(SOURCE_TEXT);
      }
      if (path === "/scripts/fix-cluster.theta") {
        return encoder.encode('"CALLEE"');
      }
      return undefined;
    },
  });
  return { bus, clock, controller, reads };
}

const SITE_L4 = { file: SOURCE_PATH, line: 4, column: 1 };
const SITE_L5 = { file: SOURCE_PATH, line: 5, column: 1 };

/** Start a tracked drive and heat line 4 (a `"stmt"` publication). */
function startDrive(h: Harness): void {
  h.bus.invocationStarted("inv-1", "quality-loop");
  h.bus.trace("inv-1", SITE_L4, "stmt");
}

/** Strip every SGR so assertions read visible text only. */
function visible(line: string): string {
  // eslint-disable-next-line no-control-regex
  return line.replace(/\x1b\[[0-9;]*m/g, "");
}

function renderLines(h: Harness, theme: unknown = fakeTheme(), width = 80): string[] {
  const component = h.controller.renderer(entryFor(SEED), { expanded: false }, theme);
  expect(component).toBeDefined();
  return component!.render(width);
}

// ---------------------------------------------------------------------------
// Degradation (RFC "Modes and degradation").
// ---------------------------------------------------------------------------

describe("D5 — static degradation", () => {
  it("bus does not know the invocation → the D3 static compact form", () => {
    const h = harness();
    const component = h.controller.renderer(entryFor(SEED), { expanded: false }, fakeTheme());
    const lines = component!.render(80);
    expect(lines).toHaveLength(1);
    expect(visible(lines[0]!)).toMatch(/^theta \/quality-loop fix the parser · started /);
  });

  it("no usable theme (missing getFgAnsi/getColorMode) → the static form", () => {
    const h = harness();
    startDrive(h);
    const component = h.controller.renderer(entryFor(SEED), { expanded: false }, {});
    expect(visible(component!.render(80)[0]!)).toMatch(/^theta \/quality-loop/);
  });

  it("a malformed payload never throws (PIC-21 analogue)", () => {
    const h = harness();
    expect(() => h.controller.renderer(entryFor(42), { expanded: false }, fakeTheme())).not.toThrow();
    expect(() =>
      h.controller.renderer(entryFor({ theta: 7 }), { expanded: false }, fakeTheme()),
    ).not.toThrow();
  });

  it("a LIVE component degrades in place when the bus evicts the node mid-life", () => {
    const h = harness();
    startDrive(h);
    const component = h.controller.renderer(entryFor(SEED), { expanded: false }, fakeTheme());
    expect(visible(component!.render(80)[0]!)).toMatch(/^⟳ \/quality-loop/);
    h.bus.invocationEnded("inv-1");
    h.clock.advance(DONE_LINGER_MS + STATUS_TICK_MS * 2); // linger expires → evicted
    expect(h.bus.snapshot().nodes).toHaveLength(0);
    expect(visible(component!.render(80)[0]!)).toMatch(/^theta \/quality-loop/);
  });
});

// ---------------------------------------------------------------------------
// The live card.
// ---------------------------------------------------------------------------

describe("D5 — live card render", () => {
  it("renders the live header, gutter viewport with the ▶ current line, and full heat on the fresh line", () => {
    const h = harness();
    startDrive(h);
    const lines = renderLines(h);
    expect(visible(lines[0]!)).toMatch(/^⟳ \/quality-loop · 0s · cp 0 · iters 0 · 0 children$/);
    const current = lines.find((line) => visible(line).includes("▶"))!;
    expect(visible(current)).toContain("4 ▶ let x = 1");
    // Fresh hit (age 0) → LUT index 63 → a truecolor bg SGR, padded, closed.
    expect(current).toMatch(/^\x1b\[48;2;/);
    expect(current).toContain("\x1b[49m");
  });

  it("the fade LOWERS the LUT index as the clock advances (same drive, later render)", () => {
    const h = harness();
    startDrive(h);
    const hot = renderLines(h).find((line) => visible(line).includes("▶"))!;
    h.clock.advance(HEAT_FADE_MS / 2);
    const mid = renderLines(h).find((line) => visible(line).includes("▶"))!;
    expect(mid.startsWith("\x1b[48;2;")).toBe(true);
    expect(mid.slice(0, 24)).not.toBe(hot.slice(0, 24)); // different blend step
    h.clock.advance(HEAT_FADE_MS); // beyond the window entirely
    const cold = renderLines(h).find((line) => visible(line).includes("▶"))!;
    expect(cold).not.toContain("\x1b[48;");
  });

  it("OPERATOR RULING: a clamped in-flight effect's line holds FULL heat across any age; the fade starts at ITS settle (D7)", () => {
    const h = harness();
    startDrive(h);
    const settle = h.bus.trace("inv-1", SITE_L5, "tool-call")!; // span → clamp on line 5
    const before = renderLines(h).find((line) => visible(line).includes("▶"))!;
    h.clock.advance(HEAT_FADE_MS * 3); // far past the fade window
    const after = renderLines(h).find((line) => visible(line).includes("▶"))!;
    expect(visible(after)).toContain("5 ▶");
    // Identical full-heat background prefix before and after the wait.
    expect(after.slice(0, 24)).toBe(before.slice(0, 24));
    // D7: the settle releases the clamp and the fade starts NOW — still hot
    // (age 0) immediately after, cold once the window passes.
    settle();
    const atSettle = renderLines(h).find((line) => visible(line).includes("5"))!;
    expect(atSettle.startsWith("\x1b[48;2;")).toBe(true);
    h.clock.advance(HEAT_FADE_MS + 1);
    const faded = renderLines(h).find((line) => visible(line).includes('"DONE"'))!;
    expect(faded).not.toContain("\x1b[48;");
  });

  it("D7 (operator ruling generalised): EVERY in-flight effect line renders full-heat concurrently — the par-for 3-lanes-1-hot-line defect", () => {
    const h = harness();
    startDrive(h);
    // Two lanes blocked on effects on different lines of the same file.
    h.bus.trace("inv-1", SITE_L4, "invoke");
    const settle5 = h.bus.trace("inv-1", SITE_L5, "tool-call")!;
    h.clock.advance(HEAT_FADE_MS * 3); // far past the fade window — both clamped
    const lines = renderLines(h);
    const row4 = lines.find((line) => visible(line).includes("let x = 1"))!;
    const row5 = lines.find((line) => visible(line).includes('"DONE"'))!;
    // Both hot at the identical full-heat LUT entry (the leading bg SGR); ▶
    // sits on the NEWEST in-flight dispatch (line 5).
    expect(row4.startsWith("\x1b[48;2;")).toBe(true);
    const hotBg = row4.slice(0, row4.indexOf("m") + 1);
    expect(row5.startsWith(hotBg)).toBe(true);
    expect(visible(row5)).toContain("5 ▶");
    expect(visible(row4)).not.toContain("▶");
    // Line 5 settles: its line fades from now while line 4 stays clamped.
    settle5();
    h.clock.advance(HEAT_FADE_MS + 1);
    const after = renderLines(h);
    const row4After = after.find((line) => visible(line).includes("let x = 1"))!;
    const row5After = after.find((line) => visible(line).includes('"DONE"'))!;
    expect(row4After.startsWith("\x1b[48;2;")).toBe(true);
    expect(row5After).not.toContain("\x1b[48;");
  });

  it("PTQ-1256: one bus snapshot per live render — and the renderer entry's presence gate is the tracks() probe, not a snapshot build", () => {
    const h = harness();
    startDrive(h);
    let snapshots = 0;
    let probes = 0;
    const countingBus = {
      snapshot: (): ReturnType<ExecutionStatusBus["snapshot"]> => {
        snapshots += 1;
        return h.bus.snapshot();
      },
      tracks: (id: string): boolean => {
        probes += 1;
        return h.bus.tracks(id);
      },
    };
    const controller = createRunCardController({
      bus: () => countingBus,
      clock: () => h.clock,
      readSourceBytes: (): Uint8Array | undefined => undefined,
    });
    const component = controller.renderer(entryFor(SEED), { expanded: false }, fakeTheme());
    expect(component).toBeDefined();
    expect(snapshots).toBe(0); // the entry gate built NO snapshot
    expect(probes).toBe(1);
    component!.render(80);
    expect(snapshots).toBe(1); // node + children derive from the ONE build
    component!.render(80);
    expect(snapshots).toBe(2); // still exactly one per frame
  });

  it("D7: a subagent-fn child bound with the spawn-path launchSite gets the ⑂ gutter marker and the roster [line N] cross-ref", () => {
    const h = harness();
    startDrive(h);
    h.bus.invocationStarted("child-1", "review-lens");
    // No invoke-kind trace ever published — the spawn-path carriage is the
    // only source for fn fan-out (the parallel-review-lenses case).
    h.bus.invocationBound("child-1", {
      mode: "subagent-fn",
      parentInvocationId: "inv-1",
      launchSite: SITE_L5,
    });
    const lines = renderLines(h, fakeTheme(), 100).map(visible);
    const launchRow = lines.find((line) => line.includes('"DONE"'))!;
    expect(launchRow).toContain("⑂");
    expect(lines.some((line) => line.includes("⑂ review-lens") && line.includes("[line 5]"))).toBe(
      true,
    );
  });

  it("the styled-line cache lexes each file once per card across renderer re-invocations (spike Deviation 4)", () => {
    const h = harness();
    startDrive(h);
    renderLines(h);
    renderLines(h); // invalidate() path: the renderer is re-invoked
    renderLines(h);
    expect(h.reads.filter((path) => path === SOURCE_PATH)).toHaveLength(1);
  });

  it("children render markers + roster from the snapshot's child nodes", () => {
    const h = harness();
    startDrive(h);
    h.bus.trace("inv-1", SITE_L5, "invoke"); // launch-site source (D2)
    h.bus.invocationStarted("child-1", "fix-cluster");
    h.bus.invocationBound("child-1", { mode: "subagent", parentInvocationId: "inv-1" });
    h.bus.childEvent("child-1", { type: "turn_start" });
    h.bus.childEvent("child-1", { type: "tool_execution_start", toolName: "bash" });
    const lines = renderLines(h, fakeTheme(), 100).map(visible);
    expect(lines[0]).toContain("1 children");
    const launchRow = lines.find((line) => line.includes("5 ▶"))!;
    expect(launchRow.trimEnd()).toMatch(/⑂ 0s · 1 turn · bash$/);
    expect(lines.some((line) => line.includes("children:"))).toBe(true);
    expect(lines.some((line) => line.includes("⑂ fix-cluster") && line.includes("[line 5]"))).toBe(
      true,
    );
  });

  it("decision 6: the viewport follows a nested callee's file after the dwell, with breadcrumb, and returns", () => {
    const h = harness();
    startDrive(h);
    const calleeSite = { file: "/scripts/fix-cluster.theta", line: 1, column: 1 };
    h.bus.trace("inv-1", calleeSite, "stmt");
    renderLines(h); // callee file observed; dwell starts
    let lines = renderLines(h).map(visible);
    expect(lines.some((line) => line.includes("▸"))).toBe(false); // still damped
    h.clock.advance(600); // > RUN_CARD_FOLLOW_DWELL_MS
    h.bus.trace("inv-1", calleeSite, "stmt"); // keep the heat fresh in the callee
    lines = renderLines(h).map(visible);
    expect(lines[1]).toBe("/quality-loop ▸ /fix-cluster");
    expect(lines.some((line) => line.includes('"CALLEE"'))).toBe(true);
    // Return: sites back in the home file re-accumulate the dwell.
    h.bus.trace("inv-1", SITE_L4, "stmt");
    renderLines(h);
    h.clock.advance(600);
    h.bus.trace("inv-1", SITE_L4, "stmt");
    lines = renderLines(h).map(visible);
    expect(lines.some((line) => line.includes("▸"))).toBe(false);
    expect(lines.some((line) => line.includes("let x = 1"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Endpoint ladder + LUT.
// ---------------------------------------------------------------------------

describe("D5 — endpoint ladder + LUT", () => {
  it("full heat blends to the theme accent triple (hot endpoint derived from the theme)", () => {
    const h = harness();
    startDrive(h);
    const hot = renderLines(h, fakeTheme({ accent: "\x1b[38;2;10;20;200m" })).find((line) =>
      visible(line).includes("▶"),
    )!;
    // LUT index 63 = the hot endpoint exactly.
    expect(hot.startsWith("\x1b[48;2;10;20;200m")).toBe(true);
  });

  it("256color mode quantizes the LUT to 48;5;N at build (spike Deviation 3)", () => {
    const h = harness();
    startDrive(h);
    const hot = renderLines(h, fakeTheme({ mode: "256color" })).find((line) =>
      visible(line).includes("▶"),
    )!;
    expect(hot).toMatch(/^\x1b\[48;5;\d+m/);
    expect(hot).not.toContain("48;2;");
  });

  it("the async OSC 11 result rebuilds the LUT over the true base and requests one repaint — rendering never blocked on it", async () => {
    const h = harness();
    startDrive(h);
    h.clock.advance(HEAT_FADE_MS / 2); // a MID-ramp index (base-dependent blend)
    const beforeOsc = renderLines(h).find((line) => visible(line).includes("▶"))!;
    expect(beforeOsc.startsWith("\x1b[48;2;")).toBe(true); // fallback base already live

    let renders = 0;
    h.controller.attachTui({
      requestRender: (): void => {
        renders += 1;
      },
      queryTerminalBackgroundColor: (): Promise<{ r: number; g: number; b: number } | undefined> =>
        Promise.resolve({ r: 250, g: 250, b: 250 }),
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(renders).toBe(1); // the resolve triggered exactly one repaint request
    const afterOsc = renderLines(h).find((line) => visible(line).includes("▶"))!;
    // Same age, same hot endpoint, DIFFERENT base → a different mid-ramp blend.
    expect(afterOsc.slice(0, 24)).not.toBe(beforeOsc.slice(0, 24));
  });

  it("a rejecting OSC 11 query leaves the fallback ladder in effect silently", async () => {
    const h = harness();
    startDrive(h);
    let renders = 0;
    h.controller.attachTui({
      requestRender: (): void => {
        renders += 1;
      },
      queryTerminalBackgroundColor: (): Promise<never> => Promise.reject(new Error("no OSC 11")),
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(renders).toBe(0);
    expect(renderLines(h).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// The EXST-6 tick rider.
// ---------------------------------------------------------------------------

describe("D5 — tick sink (rides the EXST-6 cadence)", () => {
  function tui(): { handle: TuiRenderHandle; count: () => number } {
    let renders = 0;
    return {
      handle: { requestRender: (): void => void (renders += 1) },
      count: () => renders,
    };
  }

  it("fresh heat → requestRender; stale heat + no running child → none; no handle → none", () => {
    const h = harness();
    startDrive(h);
    const now = h.clock.now();
    const snapshot = h.bus.snapshot();

    // No handle attached yet: nothing happens.
    expect(() => h.controller.sink.render(snapshot, "tree", "names", now)).not.toThrow();

    const t = tui();
    h.controller.attachTui(t.handle);
    h.controller.sink.render(snapshot, "tree", "names", now);
    expect(t.count()).toBe(1); // heat age 0 < HEAT_FADE_MS

    // End the node, then read PAST the fade window: predicate goes false.
    h.bus.invocationEnded("inv-1");
    const later = now + HEAT_FADE_MS + 1;
    h.controller.sink.render(h.bus.snapshot(), "tree", "names", later);
    expect(t.count()).toBe(1);
  });

  it("a running child keeps the predicate true even with stale heat", () => {
    const h = harness();
    startDrive(h);
    h.bus.invocationStarted("child-1", "worker");
    h.bus.invocationBound("child-1", { mode: "subagent", parentInvocationId: "inv-1" });
    const t = tui();
    h.controller.attachTui(t.handle);
    h.controller.sink.render(h.bus.snapshot(), "tree", "names", h.clock.now() + HEAT_FADE_MS * 5);
    expect(t.count()).toBe(1);
  });

  it("id is 'run-card' and clear() never throws (nothing pinned; its bug-0490 eviction repaint is witnessed in b0490-*.test.ts)", () => {
    const h = harness();
    expect(h.controller.sink.id).toBe("run-card");
    expect(() => h.controller.sink.clear()).not.toThrow();
  });

  it("BUS CADENCE (D2 residual 5 closed): ticks continue through the done-flash linger while heat is fading", () => {
    const clock = new FakeClock();
    const renders: number[] = [];
    const sink: StatusSink = {
      id: "run-card",
      render: (_snapshot, _view, _verbosity, nowMs): void => void renders.push(nowMs),
      clear: (): void => {},
    };
    const bus = createExecutionStatusBus({ clock, sinks: [sink] });
    bus.invocationStarted("inv-1", "quality-loop");
    bus.trace("inv-1", SITE_L4, "stmt");
    clock.advance(STATUS_TICK_MS); // first render
    bus.invocationEnded("inv-1"); // clamp-clear refreshed lastHitMs to NOW
    const atEnd = renders.length;
    // Through the whole linger the heat is younger than HEAT_FADE_MS, so the
    // coalesced tick keeps firing (one per interval) with zero publications.
    const lingerTicks = Math.floor(DONE_LINGER_MS / STATUS_TICK_MS);
    for (let i = 0; i < lingerTicks; i++) {
      clock.advance(STATUS_TICK_MS);
    }
    expect(renders.length).toBeGreaterThanOrEqual(atEnd + lingerTicks - 1);
    // After eviction the bus goes quiet again.
    clock.advance(STATUS_TICK_MS * 2);
    const settled = renders.length;
    clock.advance(10_000);
    expect(renders.length).toBe(settled);
  });
});

// ---------------------------------------------------------------------------
// The TUI-handle capture.
// ---------------------------------------------------------------------------

describe("D5 — captureTuiRenderHandle (ctx.ui.setWidget factory overload)", () => {
  it("captures the handle through the factory overload and removes the widget in the same call", () => {
    const calls: { key: string; content: unknown }[] = [];
    const fakeTui = {
      requestRender: (): void => {},
      queryTerminalBackgroundColor: (): Promise<undefined> => Promise.resolve(undefined),
    };
    const ui = {
      setWidget: (key: string, content: unknown): void => {
        calls.push({ key, content });
        if (typeof content === "function") {
          const component = (content as (tui: unknown) => { render(w: number): string[] })(fakeTui);
          // The capture component renders ZERO lines (never a visible widget).
          expect(component.render(80)).toEqual([]);
        }
      },
    };
    const handle = captureTuiRenderHandle(ui);
    expect(handle).toBeDefined();
    expect(typeof handle!.queryTerminalBackgroundColor).toBe("function");
    expect(calls).toHaveLength(2);
    expect(calls[0]!.key).toBe(calls[1]!.key);
    expect(calls[1]!.content).toBeUndefined(); // removed in the same call
  });

  it("degrades silently: absent setWidget, a throwing host, or a factory never invoked (non-TUI)", () => {
    expect(captureTuiRenderHandle(undefined)).toBeUndefined();
    expect(captureTuiRenderHandle({})).toBeUndefined();
    expect(
      captureTuiRenderHandle({
        setWidget: (): void => {
          throw new Error("host boom");
        },
      }),
    ).toBeUndefined();
    // The runner no-op: setWidget exists but never invokes the factory.
    expect(captureTuiRenderHandle({ setWidget: (): void => {} })).toBeUndefined();
  });
});
