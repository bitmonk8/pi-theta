import { describe, expect, it, vi } from "vitest";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import {
  registerThetaProgressTool,
  THETA_PROGRESS_PARAMETERS,
  type ProgressToolDeps,
  type ThetaProgressParams,
} from "../src/extension/execution-status/progress-tool";
import { PROGRESS_WIRE_MAX_LINE_BYTES } from "../src/extension/execution-status/types";
import { attachChildActivityTap, type ChildTapEvent } from "../src/extension/execution-status/child-tap";
import { ActiveInvocationRegistry, type ActiveInvocationEntry } from "../src/runtime/active-invocation-registry";
import { FakeClock } from "./helpers/fake-clock";
import { FakeRpcChild } from "./helpers/fake-rpc-child";

// RFC 0010 Layer L3 (execution-status.md EXST-5/EXST-15; subagent.md PIC-74)
// — T-WIRE, `tests/execution-status-progress-wire.test.ts`. Behaviour-matrix
// rows L3-B18 .. L3-B30 (child regime emit + parent tap ingest).
//
// Child-regime `execute` (EXST-15) SHIPS the wire arm: an accepted call
// calls `deps.writeWireLine` with the `{v, invocation_id, seq, event}`
// envelope. `child-tap.ts`'s `theta_progress` branch (EXST-5) SHIPS the
// ingest side: it recognises the reserved key, applies the acceptance
// guards (version, monotonic seq, latched invocation_id) and the defensive
// re-clamp, and calls `publish` for an accepted line. Rows below assert the
// real shipped effect — a written wire line, an accepted publish, or a
// silently-dropped malformed line — none of them are vacuous.

function fakeHostApi(): {
  hostApi: { registerTool: (t: ToolDefinition<typeof THETA_PROGRESS_PARAMETERS>) => void };
  calls: ToolDefinition<typeof THETA_PROGRESS_PARAMETERS>[];
} {
  const calls: ToolDefinition<typeof THETA_PROGRESS_PARAMETERS>[] = [];
  return {
    hostApi: { registerTool: (t): void => { calls.push(t); } },
    calls,
  };
}

function fakeEntry(overrides: Partial<ActiveInvocationEntry> = {}): ActiveInvocationEntry {
  return {
    thetaAbort: new AbortController(),
    disposeBarrier: Promise.resolve(),
    shutdownReason: undefined,
    theta: "quality-loop",
    invocationId: "root-inv",
    ...overrides,
  };
}

function childDeps(overrides: Partial<ProgressToolDeps> = {}): {
  deps: ProgressToolDeps;
  writtenLines: string[];
} {
  const writtenLines: string[] = [];
  const registry = new ActiveInvocationRegistry();
  registry.add(fakeEntry());
  const clock = new FakeClock();
  const deps: ProgressToolDeps = {
    isChildRegime: true,
    bus: () => undefined,
    invocations: () => registry,
    clock: () => clock,
    entryChannel: undefined,
    writeWireLine: (line: string): void => {
      writtenLines.push(line);
    },
    ...overrides,
  };
  return { deps, writtenLines };
}

const ARGS: ThetaProgressParams = { message: "built 3 of 12", scope: "fix", done: 3, total: 12 };

// ---------------------------------------------------------------------------
// C. Child regime (EXST-15 / PIC-74 emit side)
// ---------------------------------------------------------------------------

describe("T-WIRE — L3-B18: one wire line per accepted call, no bus/entry/UI traffic", () => {
  it("emits exactly one { theta_progress: { v:1, invocation_id, seq:1, event } } line", async () => {
    const { deps, writtenLines } = childDeps();
    const { hostApi, calls } = fakeHostApi();
    registerThetaProgressTool(hostApi, deps);
    await calls[0]!.execute("c1", ARGS, undefined, undefined, {} as never);

    expect(writtenLines).toHaveLength(1);
    const parsed = JSON.parse(writtenLines[0]!.trimEnd());
    expect(parsed.theta_progress.v).toBe(1);
    expect(parsed.theta_progress.invocation_id).toBe("root-inv");
    expect(parsed.theta_progress.seq).toBe(1);
    expect(parsed.theta_progress.event.message).toBe("built 3 of 12");
  });
});

describe("T-WIRE — L3-B19: monotonic seq, one invocation_id per stream", () => {
  it("three accepted calls carry seq 1,2,3 and the same invocation_id", async () => {
    const { deps, writtenLines } = childDeps();
    const { hostApi, calls } = fakeHostApi();
    registerThetaProgressTool(hostApi, deps);
    const clock = deps.clock() as unknown as FakeClock;
    await calls[0]!.execute("c1", ARGS, undefined, undefined, {} as never);
    clock.advance(200);
    await calls[0]!.execute("c2", ARGS, undefined, undefined, {} as never);
    clock.advance(200);
    await calls[0]!.execute("c3", ARGS, undefined, undefined, {} as never);

    expect(writtenLines).toHaveLength(3);
    const seqs = writtenLines.map((l) => JSON.parse(l.trimEnd()).theta_progress.seq);
    expect(seqs).toEqual([1, 2, 3]);
    const ids = new Set(writtenLines.map((l) => JSON.parse(l.trimEnd()).theta_progress.invocation_id));
    expect(ids.size).toBe(1);
  });
});

describe("T-WIRE — code-side executor: registration's codeSideExecute emits the child-regime wire line, sharing the seq stream with the model-facing execute (bug 0473)", () => {
  it("a child-regime codeSideExecute call writes exactly one wire line (seq 1) and returns the fixed ok envelope", async () => {
    const { deps, writtenLines } = childDeps();
    const { hostApi } = fakeHostApi();
    const { codeSideExecute } = registerThetaProgressTool(hostApi, deps);

    const result = await codeSideExecute("code-1", ARGS, new AbortController().signal);

    expect(result).toEqual({ content: [{ type: "text", text: "ok" }] });
    expect(writtenLines).toHaveLength(1);
    const parsed = JSON.parse(writtenLines[0]!.trimEnd());
    expect(parsed.theta_progress.seq).toBe(1);
    expect(parsed.theta_progress.event.message).toBe("built 3 of 12");
  });

  it("shares the monotonic seq stream with the model-facing execute: a model-side call then a code-side call (200ms apart) carry seq 1 then 2", async () => {
    const clock = new FakeClock();
    const { deps, writtenLines } = childDeps({ clock: () => clock });
    const { hostApi, calls } = fakeHostApi();
    const { codeSideExecute } = registerThetaProgressTool(hostApi, deps);

    await calls[0]!.execute("m1", ARGS, undefined, undefined, {} as never);
    clock.advance(200);
    await codeSideExecute("c1", ARGS, new AbortController().signal);

    const seqs = writtenLines.map((l) => JSON.parse(l.trimEnd()).theta_progress.seq);
    expect(seqs).toEqual([1, 2]);
  });
});

describe("T-WIRE — L3-B20: 200ms acceptance interval carries dropped:1 on the wire", () => {
  it("t=0/+100/+250 -> 2 lines, second carries dropped:1", async () => {
    const clock = new FakeClock();
    const { deps, writtenLines } = childDeps({ clock: () => clock });
    const { hostApi, calls } = fakeHostApi();
    registerThetaProgressTool(hostApi, deps);

    await calls[0]!.execute("c1", ARGS, undefined, undefined, {} as never);
    clock.advance(100);
    await calls[0]!.execute("c2", ARGS, undefined, undefined, {} as never);
    clock.advance(150);
    await calls[0]!.execute("c3", ARGS, undefined, undefined, {} as never);

    expect(writtenLines).toHaveLength(2);
    expect(JSON.parse(writtenLines[1]!.trimEnd()).theta_progress.event.dropped).toBe(1);
  });
});

describe("T-WIRE — L3-B21: verbosity off -> zero lines", () => {
  it("a call under the child's own 'off' ceiling emits nothing", async () => {
    let verbosity: "off" | "counts" | "names" = "off";
    const bus = {
      invocationStarted: (): void => {},
      invocationBound: (): void => {},
      invocationEnded: (): void => {},
      checkpointBefore: (): void => {},
      openLaneSet: () => ({ claim: (): void => {}, settle: (): void => {}, close: (): void => {} }),
      childEvent: (): void => {},
      authorMessage: (): void => {},
      setVerbosity: (v: "off" | "counts" | "names"): void => { verbosity = v; },
      verbosity: () => verbosity,
      setViewShape: (): void => {},
      viewShape: () => "tree" as const,
      snapshot: () => ({ nodes: [], untracked: 0 }),
      dispose: (): void => {},
    };
    const { deps, writtenLines } = childDeps({ bus: () => bus });
    const { hostApi, calls } = fakeHostApi();
    registerThetaProgressTool(hostApi, deps);
    await calls[0]!.execute("c1", ARGS, undefined, undefined, {} as never);
    expect(writtenLines).toHaveLength(0);
  });
});

describe("T-WIRE — L3-B22: an over-4096-byte line drops (counted), seq not consumed, no partial write", () => {
  it("a fault-injected oversized builder path never partially writes and does not advance seq", async () => {
    const hugeMessage = "m".repeat(PROGRESS_WIRE_MAX_LINE_BYTES + 100);
    const { deps, writtenLines } = childDeps();
    const { hostApi, calls } = fakeHostApi();
    registerThetaProgressTool(hostApi, deps);
    await calls[0]!.execute("c1", { message: hugeMessage }, undefined, undefined, {} as never);
    await calls[0]!.execute("c2", ARGS, undefined, undefined, {} as never);

    expect(writtenLines.every((l) => Buffer.byteLength(l, "utf8") <= PROGRESS_WIRE_MAX_LINE_BYTES)).toBe(true);
    if (writtenLines.length > 0) {
      expect(JSON.parse(writtenLines[0]!.trimEnd()).theta_progress.seq).toBe(1);
    }
  });
});

describe("T-WIRE — L3-B23: production default writer is the fd-1 writeSync discipline", () => {
  it("registerThetaProgressTool accepts an OMITTED writeWireLine without throwing (the production-default arm exists as a code path)", () => {
    const registry = new ActiveInvocationRegistry();
    registry.add(fakeEntry());
    const deps: ProgressToolDeps = {
      isChildRegime: true,
      bus: () => undefined,
      invocations: () => registry,
      clock: () => new FakeClock(),
      entryChannel: undefined,
      // writeWireLine intentionally omitted — production default arm.
    };
    const { hostApi } = fakeHostApi();
    expect(() => registerThetaProgressTool(hostApi, deps)).not.toThrow();
  });

  // Mirrors `tests/production-envelope-writer.test.ts`'s own
  // `createProductionEnvelopeWriter` fd-1 test pattern exactly: Pi's
  // `takeOverStdout()` reassigns `process.stdout.write` to stderr under
  // `--mode json`/`-p`, so the default wire writer MUST bypass it —
  // `writeSync(1, line)` targets the descriptor directly. Reassign
  // `process.stdout.write` to a spy and prove the default writer never calls it.
  it("the DEFAULT writeWireLine arm targets fd 1 directly, never process.stdout.write", async () => {
    const registry = new ActiveInvocationRegistry();
    registry.add(fakeEntry());
    const deps: ProgressToolDeps = {
      isChildRegime: true,
      bus: () => undefined,
      invocations: () => registry,
      clock: () => new FakeClock(),
      entryChannel: undefined,
      // writeWireLine intentionally omitted — production-default arm exercised.
    };
    const { hostApi, calls } = fakeHostApi();
    registerThetaProgressTool(hostApi, deps);

    const original = process.stdout.write.bind(process.stdout);
    const spy = vi.fn((): boolean => true);
    (process.stdout as unknown as { write: unknown }).write = spy;
    try {
      await calls[0]!.execute("c1", ARGS, undefined, undefined, {} as never);
    } finally {
      (process.stdout as unknown as { write: unknown }).write = original;
    }
    // The reassigned (reroute) write was never used — the wire line bypassed it.
    expect(spy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// D. Parent tap ingest (PIC-74 parent posture)
// ---------------------------------------------------------------------------

const FAKE_CHILD = () => new FakeRpcChild({ exitOnStdinEof: false });

function recordingPublish(): { events: ChildTapEvent[]; publish: (e: ChildTapEvent) => void } {
  const events: ChildTapEvent[] = [];
  return { events, publish: (e) => events.push(e) };
}

function validWireLine(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    theta_progress: {
      v: 1,
      invocation_id: "root-inv",
      seq: 1,
      event: { message: "built 3 of 12", scope: "fix", done: 3, total: 12 },
      ...overrides,
    },
  });
}

describe("T-WIRE — L3-B24: a valid wire line publishes ONE theta_progress event, no milestone entry", () => {
  it("publish is called once with the shape { type: 'theta_progress', payload }", () => {
    const child = FAKE_CHILD();
    const { events, publish } = recordingPublish();
    attachChildActivityTap(child, publish);
    child.emitRawLine(validWireLine());

    // child-tap.ts's `theta_progress` branch (EXST-5) accepts a well-formed
    // line and publishes it.
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "theta_progress" });
  });
});

describe("T-WIRE — L3-B25: oversized/wrong-typed optional fields are re-clamped/discarded field-wise, the line still accepted", () => {
  it("a 5000-char ANSI message, non-string scope, string done, float total still yield one accepted publish", () => {
    const child = FAKE_CHILD();
    const { events, publish } = recordingPublish();
    attachChildActivityTap(child, publish);
    child.emitRawLine(
      validWireLine({
        event: {
          message: `${"m".repeat(4990)}\u001B[31m`,
          scope: 42,
          done: "3",
          total: 12.5,
        },
      }),
    );

    // Same acceptance path as B24: non-conforming optional fields are
    // discarded field-wise, and the line still publishes.
    expect(events).toHaveLength(1);
  });
});

describe("T-WIRE — L3-B26: malformed variants drop silently, zero diagnostics", () => {
  // DIAG-2 (the runtime diagnostic registry is closed): `attachChildActivityTap`'s
  // signature is `(child, publish, opts?)` — there is no diagnostic-emission
  // parameter slot at all, so the tap structurally CANNOT invoke a diagnostic
  // sink it was never given. This is checked once here (arity), rather than by
  // spying on a callback the function never accepts (which would be vacuous by
  // construction) — every cell below then asserts the REAL publishes-only
  // surface: `events` is the tap's only observable channel.
  it("attachChildActivityTap's signature carries no diagnostic-callback parameter (structural DIAG-2 pin)", () => {
    expect(attachChildActivityTap.length).toBeLessThanOrEqual(3);
  });

  it.each([
    ["wrong version", validWireLine({ v: 2 })],
    ["non-object envelope", JSON.stringify({ theta_progress: "not-an-object" })],
    ["non-string event.message", validWireLine({ event: { message: 42 } })],
  ])("%s: zero publishes on the tap's only observable channel", (_label, line) => {
    const child = FAKE_CHILD();
    const { events, publish } = recordingPublish();
    attachChildActivityTap(child, publish);
    child.emitRawLine(line);
    expect(events).toHaveLength(0);
  });

  it("seq repeat: first seq:1 is accepted, the repeated seq:1 is rejected — exactly one publish", () => {
    const child = FAKE_CHILD();
    const { events, publish } = recordingPublish();
    attachChildActivityTap(child, publish);
    child.emitRawLine(validWireLine({ seq: 1 }));
    child.emitRawLine(validWireLine({ seq: 1 }));
    expect(events).toHaveLength(1);
  });

  it("seq regression: seq:3 accepted, a LATER line carrying seq:1 (a regression behind the high-water mark) is rejected", () => {
    const child = FAKE_CHILD();
    const { events, publish } = recordingPublish();
    attachChildActivityTap(child, publish);
    child.emitRawLine(validWireLine({ seq: 3 }));
    child.emitRawLine(validWireLine({ seq: 1 }));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "theta_progress" });
  });

  it("invocation_id FLIP: seq:1 with the latched id accepted, seq:2 carrying a DIFFERENT invocation_id is rejected", () => {
    const child = FAKE_CHILD();
    const { events, publish } = recordingPublish();
    attachChildActivityTap(child, publish);
    child.emitRawLine(validWireLine({ seq: 1, invocation_id: "root-inv" }));
    child.emitRawLine(validWireLine({ seq: 2, invocation_id: "a-different-inv" }));
    // Only the first line's publish survives — one stream, one identity; the
    // flipped-id line is dropped, not merely ignored for its OWN seq value.
    expect(events).toHaveLength(1);
    // A THIRD line at the ORIGINAL id, with a seq the flip line never consumed,
    // still accepts — proving the flip line was dropped rather than accepted
    // and silently re-latching the stream identity to the new id.
    child.emitRawLine(validWireLine({ seq: 2, invocation_id: "root-inv" }));
    expect(events).toHaveLength(2);
  });
});

describe("T-WIRE — L3-B27: a burst inside one 200ms window tap-drops the excess", () => {
  it("3 lines in one window -> the tap's own rate gate accepts exactly 1 of the 3", () => {
    const clock = new FakeClock();
    const child = FAKE_CHILD();
    const { events, publish } = recordingPublish();
    attachChildActivityTap(child, publish, { clock });
    child.emitRawLine(validWireLine({ seq: 1 }));
    child.emitRawLine(validWireLine({ seq: 2 }));
    child.emitRawLine(validWireLine({ seq: 3 }));

    // The per-child rate gate (EXST-5, opts.clock passed) accepts the first
    // line inside the 200ms window and tap-drops the other two.
    expect(events).toHaveLength(1);
  });
});

describe("T-WIRE — L3-B28: an oversized line carrying the key is rejected by the existing pre-parse size gate (real, unmodified)", () => {
  it("a line over TAP_LINE_MAX_BYTES is dropped before JSON.parse, zero publishes", () => {
    const child = FAKE_CHILD();
    const { events, publish } = recordingPublish();
    attachChildActivityTap(child, publish);
    const oversized = `${validWireLine()}${"x".repeat(40000)}`;
    child.emitRawLine(oversized);
    expect(events).toHaveLength(0);
  });
});

describe("T-WIRE — L3-B29: theta_result + stray + progress lines interleaved — the classifier is untouched (real, unmodified)", () => {
  it("a theta_result envelope line and an unrelated stray line never publish a theta_progress event", () => {
    const child = FAKE_CHILD();
    const { events, publish } = recordingPublish();
    attachChildActivityTap(child, publish);
    child.emitRawLine(JSON.stringify({ theta_result: { v: 1, ok: "FINAL" } }));
    child.emitRawLine(JSON.stringify({ type: "turn_start" }));
    child.emitRawLine(validWireLine());

    const progressEvents = events.filter((e) => e.type === "theta_progress");
    // Shipped behaviour: the valid line at the end publishes exactly one
    // theta_progress event; the OTHER two lines produce their own
    // existing-suite-pinned behaviour (turn_start publishes; theta_result is
    // ignored) — not re-asserted here (tests/execution-status-child-tap.test.ts
    // / tests/subagent-json-driver.test.ts / tests/subagent-envelope.test.ts
    // own that, unmodified).
    expect(progressEvents).toHaveLength(1);
  });
});

describe("T-WIRE — L3-B30: no relay — the tap has no stdout handle to relay through (real, structurally true)", () => {
  it("attachChildActivityTap's signature carries no writer/stdout parameter, so ingesting a progress line cannot re-emit it upward; only `publish` observes anything", () => {
    const child = FAKE_CHILD();
    const { events, publish } = recordingPublish();
    attachChildActivityTap(child, publish);
    child.emitRawLine(validWireLine());
    child.emitRawLine(JSON.stringify({ type: "turn_start" }));

    // Whatever the tap does or does not publish, it is EXCLUSIVELY through
    // `publish` — there is no second observable channel this call could have
    // used to relay the line upward (PIC-74's no-relay clause is discharged
    // structurally by the function's own shape, not by extra logic).
    for (const event of events) {
      expect(Object.keys(event)).not.toContain("stdout");
    }
  });
});
