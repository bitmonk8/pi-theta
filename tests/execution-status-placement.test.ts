// RFC-0012 §7 — the execution-status degradation under a visible placement
// (execution-status.md EXST-5): the `placement` field (`live in <backend>
// <handle>`, clamped at ingest, dropped on a lingering / unknown node), the
// heartbeat frame as the liveness source (the tap subscribes to a
// channel-adapted child's `onHeartbeat`; the bus folds it as activity with no
// counters), and the compact-reference rendering on the node header.

import { describe, expect, it } from "vitest";
import { createExecutionStatusBus } from "../src/extension/execution-status/bus";
import { attachChildActivityTap } from "../src/extension/execution-status/child-tap";
import { renderNodeHeader } from "../src/extension/execution-status/footer-sink";
import { NAME_CLAMP_CHARS, type ChildTapEvent } from "../src/extension/execution-status/types";
import type { SubagentChildProcess } from "../src/runtime/subagent-launcher";
import { FakeClock } from "./helpers/fake-clock";

function channelChild(): {
  child: SubagentChildProcess;
  beat: () => void;
  line: (text: string) => void;
  heartbeatListeners: () => number;
} {
  const lineListeners = new Set<(line: string) => void>();
  const heartbeatListeners = new Set<() => void>();
  const child: SubagentChildProcess = {
    closeStdin: (): void => {},
    onStdoutLine: (listener): (() => void) => {
      lineListeners.add(listener);
      return (): void => {
        lineListeners.delete(listener);
      };
    },
    onStderrLine: (): (() => void) => (): void => {},
    onHeartbeat: (listener): (() => void) => {
      heartbeatListeners.add(listener);
      return (): void => {
        heartbeatListeners.delete(listener);
      };
    },
    onExit: (): void => {},
    kill: (): void => {},
  };
  return {
    child,
    beat: (): void => {
      for (const l of [...heartbeatListeners]) l();
    },
    line: (text): void => {
      for (const l of [...lineListeners]) l(text);
    },
    heartbeatListeners: (): number => heartbeatListeners.size,
  };
}

describe("RFC-0012 §7 — the child tap folds channel heartbeats", () => {
  it("a channel-adapted child's heartbeat publishes { type: 'heartbeat' }; detach releases BOTH subscriptions", () => {
    const { child, beat, line, heartbeatListeners } = channelChild();
    const events: ChildTapEvent[] = [];
    const detach = attachChildActivityTap(child, (e) => events.push(e));
    beat();
    line(JSON.stringify({ type: "turn_start" }));
    beat();
    expect(events).toEqual([{ type: "heartbeat" }, { type: "turn_start" }, { type: "heartbeat" }]);
    expect(heartbeatListeners()).toBe(1);
    detach();
    expect(heartbeatListeners()).toBe(0);
    beat();
    expect(events).toHaveLength(3);
  });

  it("a `pipe` child (no onHeartbeat surface) attaches exactly as before", () => {
    const { child, line } = channelChild();
    const pipeChild: SubagentChildProcess = { ...child };
    delete (pipeChild as { onHeartbeat?: unknown }).onHeartbeat;
    const events: ChildTapEvent[] = [];
    const detach = attachChildActivityTap(pipeChild, (e) => events.push(e));
    line(JSON.stringify({ type: "agent_end" }));
    expect(events).toEqual([{ type: "agent_end" }]);
    detach();
  });
});

describe("RFC-0012 §7 — the bus: placement field and heartbeat liveness", () => {
  it("invocationPlaced records `live in <backend> <handle>` on a bound node and the snapshot carries it; a pipe child has none", () => {
    const clock = new FakeClock();
    const bus = createExecutionStatusBus({ clock, sinks: [] });
    bus.invocationStarted("i1", "worker");
    bus.invocationBound("i1", { mode: "subagent" });
    bus.invocationStarted("i2", "other");
    bus.invocationBound("i2", { mode: "subagent" });
    bus.invocationPlaced("i1", { backend: "herdr", handle: "pane-7" });
    const nodes = bus.snapshot().nodes;
    expect(nodes.find((n) => n.invocationId === "i1")?.placement).toBe("live in herdr pane-7");
    expect(nodes.find((n) => n.invocationId === "i2")?.placement).toBeUndefined();
    bus.dispose();
  });

  it("both halves are clamped at ingest (EXST-7); an unknown or already-ended node is ignored (never invented)", () => {
    const clock = new FakeClock();
    const bus = createExecutionStatusBus({ clock, sinks: [] });
    bus.invocationStarted("i1", "worker");
    bus.invocationBound("i1", { mode: "subagent" });
    bus.invocationPlaced("i1", { backend: "b".repeat(NAME_CLAMP_CHARS + 10), handle: "h".repeat(NAME_CLAMP_CHARS + 10) });
    expect(bus.snapshot().nodes[0]?.placement).toBe(
      `live in ${"b".repeat(NAME_CLAMP_CHARS)} ${"h".repeat(NAME_CLAMP_CHARS)}`,
    );
    bus.invocationPlaced("ghost", { backend: "herdr", handle: "x" });
    expect(bus.snapshot().nodes).toHaveLength(1);
    bus.invocationStarted("i2", "w2");
    bus.invocationEnded("i2");
    bus.invocationPlaced("i2", { backend: "herdr", handle: "x" });
    expect(bus.snapshot().nodes.find((n) => n.invocationId === "i2")?.placement).toBeUndefined();
    bus.dispose();
  });

  it("a heartbeat event marks the child seen and advances lastEventAtMs without moving turns / toolExecs", () => {
    const clock = new FakeClock({ now: 1000 });
    const bus = createExecutionStatusBus({ clock, sinks: [] });
    bus.invocationStarted("i1", "worker");
    bus.invocationBound("i1", { mode: "subagent" });
    expect(bus.snapshot().nodes[0]?.childActivity).toBeUndefined();
    clock.advance(500);
    bus.childEvent("i1", { type: "heartbeat" });
    const activity = bus.snapshot().nodes[0]?.childActivity;
    expect(activity).toEqual({ turns: 0, toolExecs: 0, lastEventAtMs: 1500 });
    bus.dispose();
  });
});

describe("RFC-0012 §7 — the compact-reference rendering", () => {
  it("renderNodeHeader appends the placement to the head segment; an ended node renders `done` only", () => {
    const clock = new FakeClock({ now: 0 });
    const bus = createExecutionStatusBus({ clock, sinks: [] });
    bus.invocationStarted("i1", "worker");
    bus.invocationBound("i1", { mode: "subagent" });
    bus.invocationPlaced("i1", { backend: "herdr", handle: "pane-7" });
    clock.advance(3000);
    const node = bus.snapshot().nodes[0]!;
    expect(renderNodeHeader(node, 3000)).toBe("θ /worker 3s · live in herdr pane-7");
    bus.invocationEnded("i1");
    expect(renderNodeHeader(bus.snapshot().nodes[0]!, 3000)).toBe("θ /worker done");
    bus.dispose();
  });
});
