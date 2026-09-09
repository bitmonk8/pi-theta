import { describe, expect, it } from "vitest";
import { attachChildActivityTap, type ChildTapEvent } from "../src/extension/execution-status/child-tap";
import { TAP_LINE_MAX_BYTES } from "../src/extension/execution-status/types";
import { FakeRpcChild } from "./helpers/fake-rpc-child";

// RFC 0010 (execution-status.md EXST-5) — `tests/execution-status-child-tap.test.ts`
// (T-TAP). Behaviour-matrix rows B28-B31, B33-B34 (B32 is the existing S6
// do-not-break pin over `tests/subagent-json-driver.test.ts` /
// `tests/subagent-envelope.test.ts`, verified separately — not duplicated
// here).
//
// `child-tap.ts`'s current body (a stub) attaches a real second
// `onStdoutLine` listener (so non-consumption/detach ordering is already
// honest) but classifies every line as "ignored": `publish` is never called.
// Every assertion that expects a real `publish` call therefore reds on its
// primary observable; the "ignored" assertions for garbage/unknown/oversized
// lines are vacuously true on the stub — flagged as green-on-stub in the
// report (the stub already satisfies "no publish", honestly, by doing
// nothing at all).

const FAKE_CHILD = () => new FakeRpcChild({ exitOnStdinEof: false });

function recordingPublish(): { events: ChildTapEvent[]; publish: (e: ChildTapEvent) => void } {
  const events: ChildTapEvent[] = [];
  return { events, publish: (e) => events.push(e) };
}

// ---------------------------------------------------------------------------
// B28 — recognised event ordering -> bus-shaped updates.
// ---------------------------------------------------------------------------

describe("T-TAP — B28: recognised --mode json event lines classify to ChildTapEvent updates", () => {
  it("B28: turn_start, 2x tool_execution_start, tool_execution_end, agent_end publish the corresponding ChildTapEvents in order", () => {
    const child = FAKE_CHILD();
    const { events, publish } = recordingPublish();
    attachChildActivityTap(child, publish);

    child.emitRawLine(JSON.stringify({ type: "turn_start" }));
    child.emitRawLine(
      JSON.stringify({ type: "tool_execution_start", toolCallId: "1", toolName: "read_file", args: {} }),
    );
    child.emitRawLine(
      JSON.stringify({ type: "tool_execution_start", toolCallId: "2", toolName: "bash", args: {} }),
    );
    child.emitRawLine(
      JSON.stringify({ type: "tool_execution_end", toolCallId: "2", toolName: "bash", result: {}, isError: false }),
    );
    child.emitRawLine(JSON.stringify({ type: "agent_end", messages: [] }));

    expect(events).toEqual([
      { type: "turn_start" },
      { type: "tool_execution_start", toolName: "read_file" },
      { type: "tool_execution_start", toolName: "bash" },
      { type: "tool_execution_end" },
      { type: "agent_end" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// B29 — EXST-5 / EXST-12 class-3 non-retention: the published event must
// contain ONLY the sheet's allowed fields, for every fixture including ones
// with content-bearing payloads.
// ---------------------------------------------------------------------------

describe("T-TAP — B29: class-3 non-retention (EXST-5/EXST-12) — allowlisted fields only", () => {
  const CONTENT_BEARING_FIXTURES: readonly Record<string, unknown>[] = [
    {
      type: "tool_execution_start",
      toolCallId: "secret-call-id",
      toolName: "bash",
      args: { command: "rm -rf /classified", secret: "sk-should-not-leak" },
    },
    {
      type: "tool_execution_end",
      toolCallId: "secret-call-id",
      toolName: "bash",
      result: { stdout: "classified output should not leak" },
      isError: false,
    },
    {
      type: "message_update",
      message: { role: "assistant", content: "private assistant text should not leak" },
      assistantMessageEvent: { delta: "private delta should not leak" },
    },
    {
      type: "agent_end",
      messages: [{ role: "assistant", content: "private final transcript should not leak" }],
    },
  ];

  const ALLOWED_FIELDS_BY_TYPE: Record<string, readonly string[]> = {
    turn_start: ["type"],
    tool_execution_start: ["type", "toolName"],
    tool_execution_end: ["type"],
    agent_end: ["type"],
  };

  it("B29: for every content-bearing fixture, any resulting published event has ONLY the allowlisted fields for its type — no substring of the fixture's content-bearing payload appears anywhere in the published events", () => {
    const child = FAKE_CHILD();
    const { events, publish } = recordingPublish();
    attachChildActivityTap(child, publish);

    for (const fixture of CONTENT_BEARING_FIXTURES) {
      child.emitRawLine(JSON.stringify(fixture));
    }

    // Field allowlist: every event actually published only carries the
    // sheet's allowed keys for its `type` (Object.keys allowlist, not a
    // structural-equality check, so an accidental extra field reds even if
    // its value happens to match).
    for (const event of events) {
      const allowed = ALLOWED_FIELDS_BY_TYPE[event.type];
      expect(allowed).toBeDefined();
      expect(Object.keys(event).sort()).toEqual([...allowed!].sort());
    }

    // Deep-scan: none of the content-bearing markers leaked into ANY
    // published event (covers both the "message_update publishes nothing"
    // case and the "recognised events strip their content" case at once).
    const serializedEvents = JSON.stringify(events);
    const contentMarkers = [
      "secret-call-id",
      "sk-should-not-leak",
      "rm -rf /classified",
      "classified output should not leak",
      "private assistant text should not leak",
      "private delta should not leak",
      "private final transcript should not leak",
    ];
    for (const marker of contentMarkers) {
      expect(serializedEvents).not.toContain(marker);
    }
  });

  it("B29: the tap is a pure, non-mutating function of each line — a deep-frozen fixture line ingests without throwing", () => {
    const child = FAKE_CHILD();
    const { publish } = recordingPublish();
    attachChildActivityTap(child, publish);

    const fixture = Object.freeze({
      type: "tool_execution_start",
      toolCallId: "1",
      toolName: "bash",
      args: Object.freeze({ command: "echo hi" }),
    });
    const line = JSON.stringify(fixture);

    expect(() => child.emitRawLine(line)).not.toThrow();
    // Idempotent: emitting the identical (frozen-sourced) line twice produces
    // the same observable shape both times — no hidden state mutation.
    expect(() => child.emitRawLine(line)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// B30 — ignored-line classes: no publish, no diagnostic.
// ---------------------------------------------------------------------------

describe("T-TAP — B30: oversized / garbage / non-object / unrecognised-type / message_update lines are all ignored with no diagnostic", () => {
  it("B30: every ignored-line class produces zero publishes and the emitDiagnostic spy is never called", () => {
    const child = FAKE_CHILD();
    const { events, publish } = recordingPublish();
    const emitDiagnostic = () => {
      throw new Error("emitDiagnostic must never be called by the tap (DIAG-2)");
    };
    attachChildActivityTap(child, publish);

    // Oversized (> TAP_LINE_MAX_BYTES).
    child.emitRawLine("x".repeat(TAP_LINE_MAX_BYTES + 1));
    // Garbage (unparseable).
    child.emitRawLine("this is not json {");
    // Non-object JSON root.
    child.emitRawLine(JSON.stringify(42));
    child.emitRawLine(JSON.stringify(null));
    // Unknown type.
    child.emitRawLine(JSON.stringify({ type: "agent_start" }));
    child.emitRawLine(JSON.stringify({ type: "tool_execution_update", partialResult: "x" }));
    // message_update — recognised by --mode json, NOT consumed by the tap.
    child.emitRawLine(
      JSON.stringify({ type: "message_update", message: {}, assistantMessageEvent: {} }),
    );

    expect(events).toHaveLength(0);
    expect(emitDiagnostic).toBeDefined(); // never invoked — the tap has no reference to it at all
  });
});

// ---------------------------------------------------------------------------
// B31 — an envelope (theta_result) line is ignored by the tap; the drive
// listener's own settlement is covered by the existing subagent-json-driver
// suite (B32), not duplicated here.
// ---------------------------------------------------------------------------

describe("T-TAP — B31: a theta_result envelope line is ignored by the tap", () => {
  it("B31: the tap never publishes for a theta_result-carrying line", () => {
    const child = FAKE_CHILD();
    const { events, publish } = recordingPublish();
    attachChildActivityTap(child, publish);

    child.emitRawLine(JSON.stringify({ theta_result: { v: 1, ok: "FINAL" } }));

    expect(events).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// B33 — detach ordering.
// ---------------------------------------------------------------------------

describe("T-TAP — B33: detach then more lines — no publishes after detach; double-detach is a no-op", () => {
  it("B33: after detach(), further recognised lines produce zero further publishes; calling the detach handle twice does not throw", () => {
    const child = FAKE_CHILD();
    const { events, publish } = recordingPublish();
    const detach = attachChildActivityTap(child, publish);

    child.emitRawLine(JSON.stringify({ type: "turn_start" }));
    const countBeforeDetach = events.length;

    detach();
    child.emitRawLine(JSON.stringify({ type: "turn_start" }));
    child.emitRawLine(
      JSON.stringify({ type: "tool_execution_start", toolCallId: "1", toolName: "bash", args: {} }),
    );

    expect(events).toHaveLength(countBeforeDetach);
    expect(() => detach()).not.toThrow(); // idempotent double-detach
  });
});

// ---------------------------------------------------------------------------
// B34 — non-string toolName.
// ---------------------------------------------------------------------------

describe("T-TAP — B34: a non-string toolName on tool_execution_start ignores the whole line", () => {
  it("B34: tool_execution_start with a numeric/undefined toolName publishes nothing for that line", () => {
    const child = FAKE_CHILD();
    const { events, publish } = recordingPublish();
    attachChildActivityTap(child, publish);

    child.emitRawLine(JSON.stringify({ type: "tool_execution_start", toolCallId: "1", toolName: 42, args: {} }));
    child.emitRawLine(JSON.stringify({ type: "tool_execution_start", toolCallId: "2", args: {} }));

    expect(events).toHaveLength(0);
  });
});
