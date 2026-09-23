// RFC 0015 (D3) — the entry channel's run-card surface: the `theta-run` /
// `theta-run-summary` custom-entry types on the PIC-73 entry channel, the
// static D3 renderers, the run-card publisher (start seed, decision-7 gated
// terminal summary over the D2 heat ring), and the dispatch wiring in
// `composeThetaFixture.run` (one card per TOP-LEVEL drive; outcome mapping;
// end-after-finish ordering).
//
// Spec: docs/spec_topics/pi-integration-contract/theta-run-entries.md —
// PIC-75 (the theta-run seed, shared-dead-flag registration, silent-skip
// degrade, static-degradation renderer form) and PIC-76 (the gated
// theta-run-summary payload, RUN_SUMMARY_GATE_MS boundary, profile cap, and
// the closed outcome projection incl. binder short-circuit → "cancelled").
//
// TIER: unit, offline, deterministic, provider-free.

import { afterAll, describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import type { ThetaExtensionDeps } from "../src/extension/factory";
import { composeExtensionInstance } from "../src/extension/production-composition";
import { SUBAGENT_ROOT_ENV_MARKER } from "../src/runtime/subagent-root-regime";
import { FakeFileWatcher } from "./helpers/fake-file-watcher";
import {
  bootComposedHost,
  disposeWorkspace,
  plantThetaWorkspace,
  theta,
} from "./helpers/production-load-harness";
import {
  createEntryChannel,
  createThetaRunEntryRenderer,
  createThetaRunSummaryRenderer,
  THETA_PROGRESS_ENTRY_TYPE,
  THETA_RUN_ENTRY_TYPE,
  THETA_RUN_SUMMARY_ENTRY_TYPE,
  type EntryChannelHandle,
} from "../src/extension/execution-status/entry-channel";
import {
  createRunCardPublisher,
  type RunCardPublisher,
} from "../src/extension/execution-status/run-card";
import { createExecutionStatusBus } from "../src/extension/execution-status/bus";
import {
  RUN_CARD_ARGS_CLAMP_CHARS,
  RUN_SUMMARY_GATE_MS,
  RUN_SUMMARY_PROFILE_MAX_LINES,
  type ThetaRunOutcome,
  type ThetaRunSeed,
  type ThetaRunSummary,
} from "../src/extension/execution-status/types";
import {
  composeThetaFixture,
  type ThetaCompositionInput,
  type ThetaProducerDeps,
} from "../src/extension/theta-composition-producer";
import type { ActiveInvocationTicket } from "../src/runtime/active-invocation-registry";
import { makeErr, makeOk, type ResultValue, type ThetaValue } from "../src/runtime/value";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import type { ThetaBody } from "../src/parser/theta-document";
import { FakeClock } from "./helpers/fake-clock";
import { loadSettings, type ThetaSettings } from "../src/discovery/settings";
import { buildSettings, EMPTY_SETTINGS_FILE } from "./helpers/fake-file-system";
import { byCode } from "./helpers/e2e-s1";
import {
  childCtx,
  driveChildRoot,
  noopPi,
  rootDouble,
  soleEnvelope,
  subagentTheta as regimeSubagentTheta,
} from "./helpers/subagent-fn-child-regime";
import { noopExecutionStatusBus } from "./helpers/execution-status-progress";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";

// ---------------------------------------------------------------------------
// Fakes (mirrors tests/execution-status-entry-channel.test.ts's recording pi).
// ---------------------------------------------------------------------------

function fakePi(options: { readonly appendEntryThrows?: boolean } = {}): {
  pi: ExtensionAPI;
  appendCalls: { customType: string; data: unknown }[];
  registrations: Map<string, unknown>;
} {
  const appendCalls: { customType: string; data: unknown }[] = [];
  const registrations = new Map<string, unknown>();
  const base: Record<string, unknown> = {
    registerEntryRenderer: (type: string, renderer: unknown): void => {
      registrations.set(type, renderer);
    },
    appendEntry: (customType: string, data: unknown): void => {
      if (options.appendEntryThrows === true) {
        throw new Error("appendEntry host seam absent");
      }
      appendCalls.push({ customType, data });
    },
  };
  return { pi: base as unknown as ExtensionAPI, appendCalls, registrations };
}

const SEED: ThetaRunSeed = {
  invocationId: "inv-1",
  theta: "quality-loop",
  argsSummary: "fix the parser",
  startedAtMs: 1_700_000_000_000,
  sourcePath: "/theta/quality-loop.theta",
};

const SUMMARY: ThetaRunSummary = {
  invocationId: "inv-1",
  theta: "quality-loop",
  outcome: "ok",
  elapsedMs: 272_000,
  counters: { checkpoints: 12, loopIters: 38 },
  childrenSpawned: 3,
  heatProfile: [
    { file: "a.theta", line: 142, hits: 14, dwellMs: 131_000, kind: "invoke" },
    { file: "a.theta", line: 9, hits: 40, dwellMs: 1_000, kind: "stmt" },
  ],
};

// ---------------------------------------------------------------------------
// The entry channel's run-card surface.
// ---------------------------------------------------------------------------

describe("D3 — entry channel run-card surface", () => {
  it("registers renderers for BOTH run-card types at factory time (an appended entry is never renderer-less)", () => {
    const { pi, registrations } = fakePi();
    createEntryChannel(pi);
    expect([...registrations.keys()].sort()).toEqual(
      [THETA_PROGRESS_ENTRY_TYPE, THETA_RUN_ENTRY_TYPE, THETA_RUN_SUMMARY_ENTRY_TYPE].sort(),
    );
  });

  it("D5 swap seam: an injected theta-run renderer registers INSTEAD of the static default", () => {
    const { pi, registrations } = fakePi();
    const injected = (): undefined => undefined;
    createEntryChannel(pi, injected);
    expect(registrations.get(THETA_RUN_ENTRY_TYPE)).toBe(injected);
    // The summary renderer is not part of the swap seam.
    expect(registrations.get(THETA_RUN_SUMMARY_ENTRY_TYPE)).not.toBe(injected);
  });

  it("appendRun delivers the seed verbatim under the theta-run type", () => {
    const { pi, appendCalls } = fakePi();
    const channel = createEntryChannel(pi);
    expect(channel.appendRun(SEED)).toBe(true);
    expect(appendCalls).toEqual([{ customType: THETA_RUN_ENTRY_TYPE, data: SEED }]);
  });

  it("appendRunSummary delivers the payload verbatim under the theta-run-summary type", () => {
    const { pi, appendCalls } = fakePi();
    const channel = createEntryChannel(pi);
    expect(channel.appendRunSummary(SUMMARY)).toBe(true);
    expect(appendCalls).toEqual([{ customType: THETA_RUN_SUMMARY_ENTRY_TYPE, data: SUMMARY }]);
  });

  it("first hard append failure marks the channel dead: later run-card appends silently skip (no fallback surface exists)", () => {
    const { pi, appendCalls } = fakePi({ appendEntryThrows: true });
    const channel = createEntryChannel(pi);
    expect(channel.appendRun(SEED)).toBe(false);
    expect(channel.live()).toBe(false);
    expect(channel.appendRunSummary(SUMMARY)).toBe(false);
    expect(appendCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// The static D3 renderers (the RFC degradation form; plain text).
// ---------------------------------------------------------------------------

function renderEntry(
  renderer: (entry: never, options: never, theme: never) => { render(w: number): string[] } | undefined,
  customType: string,
  data: unknown,
): string[] {
  const component = renderer(
    { type: "custom", customType, data, id: "e1", timestamp: 0 } as never,
    { expanded: false } as never,
    {} as never,
  );
  expect(component).toBeDefined();
  return component!.render(200);
}

describe("D3 — static renderers", () => {
  it("theta-run renders the degradation form: name, args summary, started time (through the INJECTED formatter)", () => {
    // The started-time rendering is DI (the D5-seam-consistent injection
    // point): the test pins the row via a deterministic formatter instead of
    // asserting any real timezone.
    const formatted: number[] = [];
    const lines = renderEntry(
      createThetaRunEntryRenderer((ms) => {
        formatted.push(ms);
        return `T+${ms}`;
      }),
      THETA_RUN_ENTRY_TYPE,
      SEED,
    );
    expect(lines).toEqual(["theta /quality-loop fix the parser · started T+1700000000000"]);
    expect(formatted).toEqual([SEED.startedAtMs]);
  });

  it("the DEFAULT started-time formatter renders the host's LOCAL wall clock (the bare HH:MM:SS row carries no timezone marker)", () => {
    const lines = renderEntry(createThetaRunEntryRenderer(), THETA_RUN_ENTRY_TYPE, SEED);
    const local = new Date(SEED.startedAtMs);
    const expected = [local.getHours(), local.getMinutes(), local.getSeconds()]
      .map((part) => String(part).padStart(2, "0"))
      .join(":");
    expect(lines).toEqual([`theta /quality-loop fix the parser · started ${expected}`]);
    // On a non-UTC host this also witnesses the regression direction: the
    // local render must differ from the old UTC slice. (On a UTC host the two
    // coincide by definition, so the guard is conditional, not skipped.)
    if (local.getTimezoneOffset() !== 0) {
      expect(expected).not.toBe(new Date(SEED.startedAtMs).toISOString().slice(11, 19));
    }
  });

  it("theta-run tolerates a malformed payload without throwing", () => {
    const lines = renderEntry(createThetaRunEntryRenderer(), THETA_RUN_ENTRY_TYPE, {
      startedAtMs: "not-a-number",
    });
    expect(lines).toEqual(["theta /?"]);
  });

  it("theta-run-summary renders header + one ramp line per profile row, dwell-proportional", () => {
    const lines = renderEntry(
      createThetaRunSummaryRenderer() as never,
      THETA_RUN_SUMMARY_ENTRY_TYPE,
      SUMMARY,
    );
    expect(lines[0]).toBe(
      "theta /quality-loop ok · 4m32s · cp 12 · iters 38 · 3 children",
    );
    expect(lines).toHaveLength(3);
    // The dominant line fills the ramp; the negligible-dwell line keeps one cell.
    expect(lines[1]).toBe("  ########## a.theta:142 · 2m11s · 14 hits · invoke");
    expect(lines[2]).toBe("  #......... a.theta:9 · 1s · 40 hits · stmt");
  });

  it("theta-run-summary renders the header alone when the profile is omitted", () => {
    const { heatProfile: _dropped, ...withoutProfile } = SUMMARY;
    const lines = renderEntry(
      createThetaRunSummaryRenderer() as never,
      THETA_RUN_SUMMARY_ENTRY_TYPE,
      withoutProfile,
    );
    expect(lines).toHaveLength(1);
  });

  it("both renderers hard-clip at narrow widths without throwing", () => {
    const run = createThetaRunEntryRenderer()(
      { type: "custom", customType: THETA_RUN_ENTRY_TYPE, data: SEED, id: "e", timestamp: 0 } as never,
      { expanded: false } as never,
      {} as never,
    );
    const summary = createThetaRunSummaryRenderer()(
      { type: "custom", customType: THETA_RUN_SUMMARY_ENTRY_TYPE, data: SUMMARY, id: "e", timestamp: 0 } as never,
      { expanded: false } as never,
      {} as never,
    );
    for (const component of [run, summary]) {
      expect(component).toBeDefined();
      for (const line of component!.render(10)) {
        expect(line.length).toBeLessThanOrEqual(10);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// The run-card publisher over a REAL bus (D2 heat ring → decision-7 summary).
// ---------------------------------------------------------------------------

function recordingChannel(): {
  channel: Pick<EntryChannelHandle, "appendRun" | "appendRunSummary">;
  runs: ThetaRunSeed[];
  summaries: ThetaRunSummary[];
} {
  const runs: ThetaRunSeed[] = [];
  const summaries: ThetaRunSummary[] = [];
  return {
    channel: {
      appendRun: (seed): boolean => {
        runs.push(seed);
        return true;
      },
      appendRunSummary: (summary): boolean => {
        summaries.push(summary);
        return true;
      },
    },
    runs,
    summaries,
  };
}

function site(file: string, line: number): { file: string; line: number; column: number } {
  return { file, line, column: 1 };
}

describe("D3 — run-card publisher", () => {
  it("driveStarted appends the exact five-field seed (wall-clock start; whitespace-collapsed clamped args)", () => {
    const clock = new FakeClock({ now: 500, wallEpoch: 1_700_000_000_000 });
    const { channel, runs } = recordingChannel();
    const publisher = createRunCardPublisher({ entryChannel: channel, clock });
    publisher.driveStarted({
      invocationId: "inv-1",
      theta: "quality-loop",
      args: `fix\n  the ${"x".repeat(RUN_CARD_ARGS_CLAMP_CHARS)}`,
      sourcePath: "/theta/quality-loop.theta",
    });
    expect(runs).toHaveLength(1);
    const seed = runs[0]!;
    expect(seed.invocationId).toBe("inv-1");
    expect(seed.theta).toBe("quality-loop");
    expect(seed.startedAtMs).toBe(1_700_000_000_000);
    expect(seed.sourcePath).toBe("/theta/quality-loop.theta");
    expect(seed.argsSummary.startsWith("fix the x")).toBe(true);
    expect(seed.argsSummary).toHaveLength(RUN_CARD_ARGS_CLAMP_CHARS);
    expect(seed.argsSummary.includes("\n")).toBe(false);
  });

  it("omits sourcePath from the seed when the drive has none", () => {
    const clock = new FakeClock();
    const { channel, runs } = recordingChannel();
    const publisher = createRunCardPublisher({ entryChannel: channel, clock });
    publisher.driveStarted({ invocationId: "inv-1", theta: "t", args: "" });
    expect("sourcePath" in runs[0]!).toBe(false);
  });

  it("decision 7: even opted in, a drive shorter than RUN_SUMMARY_GATE_MS appends NO summary", () => {
    const clock = new FakeClock();
    const { channel, summaries } = recordingChannel();
    const publisher = createRunCardPublisher({ entryChannel: channel, clock, runSummaryEnabled: true });
    publisher.driveStarted({ invocationId: "inv-1", theta: "t", args: "" });
    clock.advance(RUN_SUMMARY_GATE_MS - 1);
    publisher.driveEnded("inv-1", "ok");
    expect(summaries).toHaveLength(0);
  });

  it("decision 7 re-ruling 2026-09-23: DEFAULT OFF — without the theta.runSummary opt-in, a drive well past the gate appends NO summary (the theta-run card is untouched)", () => {
    const clock = new FakeClock();
    const bus = createExecutionStatusBus({ clock, sinks: [] });
    const { channel, runs, summaries } = recordingChannel();
    // No `runSummaryEnabled` — the read-site default is off.
    const publisher = createRunCardPublisher({ entryChannel: channel, clock, statusBus: bus });
    bus.invocationStarted("inv-1", "t");
    publisher.driveStarted({ invocationId: "inv-1", theta: "t", args: "" });
    clock.advance(RUN_SUMMARY_GATE_MS * 3);
    bus.invocationEnded("inv-1");
    publisher.driveEnded("inv-1", "ok");
    expect(runs).toHaveLength(1);
    expect(summaries).toHaveLength(0);
    // The unconditional open-map cleanup has its failing-capable witness in
    // the two "unconditional cleanup" tests below — with the summary disabled,
    // a second end here appends nothing regardless of whether the map was
    // cleaned, so no assertion on this publisher can red for that defect.
  });

  it("unconditional cleanup: a sub-gate end deletes the open entry — a repeat end for the same id, now past the gate, finds no run and appends NO summary", () => {
    const clock = new FakeClock();
    const { channel, summaries } = recordingChannel();
    const publisher = createRunCardPublisher({ entryChannel: channel, clock, runSummaryEnabled: true });
    publisher.driveStarted({ invocationId: "inv-1", theta: "t", args: "" });
    clock.advance(RUN_SUMMARY_GATE_MS - 1);
    // Sub-gate end: no summary, but the cleanup MUST run on this return path
    // too — if `open.delete` regressed below the gate (or the enabled check),
    // the entry survives this end …
    publisher.driveEnded("inv-1", "ok");
    expect(summaries).toHaveLength(0);
    // … and this repeat end — same id, elapsed now past the gate — would find
    // the retained entry and append a summary. Zero proves the first end
    // cleaned the map before any summary gate was consulted.
    clock.advance(RUN_SUMMARY_GATE_MS);
    publisher.driveEnded("inv-1", "ok");
    expect(summaries).toHaveLength(0);
  });

  it("unconditional cleanup: a past-gate end appends its summary exactly once — a repeat end for the same id is inert (the entry was deleted, not merely consumed)", () => {
    const clock = new FakeClock();
    const { channel, summaries } = recordingChannel();
    const publisher = createRunCardPublisher({ entryChannel: channel, clock, runSummaryEnabled: true });
    publisher.driveStarted({ invocationId: "inv-1", theta: "t", args: "" });
    clock.advance(RUN_SUMMARY_GATE_MS);
    publisher.driveEnded("inv-1", "ok");
    expect(summaries).toHaveLength(1);
    publisher.driveEnded("inv-1", "ok");
    expect(summaries).toHaveLength(1);
  });

  it("a gated drive appends the summary with counters, cumulative children, and the dwell-sorted heat profile off the lingering node", () => {
    const clock = new FakeClock();
    const bus = createExecutionStatusBus({ clock, sinks: [] });
    const { channel, summaries } = recordingChannel();
    const publisher = createRunCardPublisher({ entryChannel: channel, clock, statusBus: bus, runSummaryEnabled: true });

    bus.invocationStarted("inv-1", "quality-loop");
    publisher.driveStarted({ invocationId: "inv-1", theta: "quality-loop", args: "" });
    // Heat (D7 span dwell): line 5's effect span runs 1000 ms; line 9's span
    // stays open and is closed by node end (200 ms tail + the gate window).
    const settle5 = bus.trace("inv-1", site("a.theta", 5), "tool-call")!;
    clock.advance(1000);
    settle5();
    bus.trace("inv-1", site("a.theta", 9), "query");
    // Counters: one checkpoint, one loop-iter.
    bus.checkpointBefore("inv-1", "loop-iter", site("a.theta", 3));
    // A child bound under inv-1, ended and EVICTED long before drive end —
    // the cumulative count must survive the child node's eviction.
    bus.invocationStarted("c1", "child");
    bus.invocationBound("c1", { mode: "subagent", parentInvocationId: "inv-1" });
    bus.invocationEnded("c1");
    clock.advance(RUN_SUMMARY_GATE_MS); // fires ticks; evicts c1 after its linger
    expect(bus.snapshot().nodes.some((n) => n.invocationId === "c1")).toBe(false);

    clock.advance(200);
    bus.invocationEnded("inv-1"); // closes line 9's open dwell interval
    publisher.driveEnded("inv-1", "err");

    expect(summaries).toHaveLength(1);
    const summary = summaries[0]!;
    expect(summary.theta).toBe("quality-loop");
    expect(summary.outcome).toBe("err");
    expect(summary.elapsedMs).toBe(RUN_SUMMARY_GATE_MS + 1200);
    expect(summary.counters).toEqual({ checkpoints: 1, loopIters: 1 });
    expect(summary.childrenSpawned).toBe(1);
    expect(summary.heatProfile).toEqual([
      { file: "a.theta", line: 5, hits: 1, dwellMs: 1000, kind: "tool-call" },
      { file: "a.theta", line: 9, hits: 1, dwellMs: RUN_SUMMARY_GATE_MS + 200, kind: "query" },
    ].sort((a, b) => b.dwellMs - a.dwellMs));
  });

  it("caps the profile at RUN_SUMMARY_PROFILE_MAX_LINES, keeping the dwell-dominant lines", () => {
    const clock = new FakeClock();
    const bus = createExecutionStatusBus({ clock, sinks: [] });
    const { channel, summaries } = recordingChannel();
    const publisher = createRunCardPublisher({ entryChannel: channel, clock, statusBus: bus, runSummaryEnabled: true });
    bus.invocationStarted("inv-1", "t");
    publisher.driveStarted({ invocationId: "inv-1", theta: "t", args: "" });
    // Lines 1..14: line N's effect span runs N*10 ms (D7 real dwell); line
    // 14's span stays open and the end-path close lands the gate window on it.
    for (let line = 1; line <= 14; line += 1) {
      const settle = bus.trace("inv-1", site("a.theta", line), "tool-call")!;
      clock.advance(line * 10);
      if (line < 14) {
        settle();
      }
    }
    clock.advance(RUN_SUMMARY_GATE_MS);
    bus.invocationEnded("inv-1");
    publisher.driveEnded("inv-1", "ok");
    const profile = summaries[0]!.heatProfile!;
    expect(profile).toHaveLength(RUN_SUMMARY_PROFILE_MAX_LINES);
    // Line 14's open interval closed at node end (gate window), so it dominates;
    // the remaining rows descend by dwell and the smallest lines (1..4) dropped.
    expect(profile[0]!.line).toBe(14);
    const dwell = profile.map((row) => row.dwellMs);
    expect([...dwell].sort((a, b) => b - a)).toEqual(dwell);
    expect(profile.some((row) => row.line <= 4)).toBe(false);
  });

  it("omits the profile (and zeroes the counters) when the bus no longer tracks the node — never fails", () => {
    const clock = new FakeClock();
    const bus = createExecutionStatusBus({ clock, sinks: [] });
    const { channel, summaries } = recordingChannel();
    const publisher = createRunCardPublisher({ entryChannel: channel, clock, statusBus: bus, runSummaryEnabled: true });
    publisher.driveStarted({ invocationId: "ghost", theta: "t", args: "" });
    clock.advance(RUN_SUMMARY_GATE_MS);
    publisher.driveEnded("ghost", "ok");
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.counters).toEqual({ checkpoints: 0, loopIters: 0 });
    expect(summaries[0]!.childrenSpawned).toBe(0);
    expect("heatProfile" in summaries[0]!).toBe(false);
  });

  it("driveEnded without a matching driveStarted appends nothing (a summary never dangles without its card)", () => {
    const clock = new FakeClock();
    const { channel, summaries } = recordingChannel();
    const publisher = createRunCardPublisher({ entryChannel: channel, clock, runSummaryEnabled: true });
    clock.advance(RUN_SUMMARY_GATE_MS);
    publisher.driveEnded("never-started", "ok");
    expect(summaries).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Dispatch wiring: composeThetaFixture.run — one card per TOP-LEVEL drive.
// ---------------------------------------------------------------------------

interface WiringEvent {
  readonly kind: "started" | "ended" | "finish" | "regime-drive";
  readonly invocationId?: string;
  readonly theta?: string;
  readonly args?: string;
  readonly sourcePath?: string;
  readonly outcome?: ThetaRunOutcome;
}

function subagentTheta(): ThetaCompositionInput {
  return {
    slashName: "demo",
    sourcePath: "/theta/demo.theta",
    frontmatter: { mode: "subagent" } as ParsedFrontmatter,
    body: { statements: [], tail: null } as unknown as ThetaBody,
  };
}

function wiringHarness(options: {
  readonly terminal?: ResultValue;
  readonly bound?: boolean;
  readonly spawnThrows?: boolean;
  readonly withTicket?: boolean;
  /** D8: route the dispatch through the child-regime branch instead of the binder+bind path. */
  readonly regime?: { readonly outcome?: ThetaRunOutcome; readonly throws?: boolean };
}): { deps: ThetaProducerDeps; events: WiringEvent[] } {
  const events: WiringEvent[] = [];
  const publisher: RunCardPublisher = {
    driveStarted(info): void {
      events.push({ kind: "started", ...info });
    },
    driveEnded(invocationId, outcome): void {
      events.push({ kind: "ended", invocationId, outcome });
    },
  };
  const deps: ThetaProducerDeps = {
    runBinder: () => Promise.resolve({ bound: options.bound ?? true }),
    bindPromptConversation: () => {
      throw new Error("prompt bind unreached: these fixtures are subagent-mode");
    },
    spawnSubagentConversation: () => {
      if (options.spawnThrows === true) {
        throw new Error("spawn defect");
      }
      return Promise.resolve({
        drivenAgainst: "subagent-private-session" as const,
        drive: () => Promise.resolve(options.terminal ?? makeOk(null)),
      });
    },
    emitTopLevelErrNote: (): void => {},
    emitPanicNote: (): void => {},
    ...(options.regime !== undefined
      ? {
          isSubagentRootFor: (): boolean => true,
          driveSubagentRootRegime: (): Promise<ThetaRunOutcome> => {
            events.push({ kind: "regime-drive" });
            return options.regime!.throws === true
              ? Promise.reject(new Error("host fatal escape"))
              : Promise.resolve(options.regime!.outcome ?? "ok");
          },
        }
      : {}),
    ...(options.withTicket !== false
      ? {
          beginInvocation: (): ActiveInvocationTicket => ({
            invocationId: "inv-77",
            theta: "demo",
            settleDisposeBarrier: (): void => {},
            finish: (): void => {
              events.push({ kind: "finish" });
            },
          }),
        }
      : {}),
    runCard: publisher,
  };
  return { deps, events };
}

async function runFixture(deps: ThetaProducerDeps): Promise<void> {
  const fixture = composeThetaFixture(subagentTheta(), deps);
  await fixture.run("some args", {
    signal: undefined,
    cwd: "/tmp",
  } as unknown as ExtensionCommandContext);
}

describe("D3 — dispatch wiring (composeThetaFixture.run)", () => {
  it("an Ok drive: exactly one driveStarted (id, theta, args, sourcePath) then driveEnded('ok') AFTER finish", async () => {
    const { deps, events } = wiringHarness({ terminal: makeOk("done") });
    await runFixture(deps);
    const started = events.filter((event) => event.kind === "started");
    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({
      invocationId: "inv-77",
      theta: "demo",
      args: "some args",
      sourcePath: "/theta/demo.theta",
    });
    const ended = events.filter((event) => event.kind === "ended");
    expect(ended).toEqual([{ kind: "ended", invocationId: "inv-77", outcome: "ok" }]);
    // The summary reads the bus's settled ring, so the end publication must
    // follow the ticket's finish (which publishes invocationEnded).
    expect(events.findIndex((event) => event.kind === "finish")).toBeLessThan(
      events.indexOf(ended[0]!),
    );
  });

  it("an unhandled top-level Err maps to 'err'", async () => {
    const { deps, events } = wiringHarness({
      terminal: makeErr({ kind: "tool_loop_exhausted", message: "x" } as unknown as ThetaValue),
    });
    await runFixture(deps);
    expect(events.filter((event) => event.kind === "ended")[0]!.outcome).toBe("err");
  });

  it("a terminal Err(CancelledError) maps to 'cancelled'", async () => {
    const { deps, events } = wiringHarness({
      terminal: makeErr({ kind: "cancelled", message: "cancelled" } as unknown as ThetaValue),
    });
    await runFixture(deps);
    expect(events.filter((event) => event.kind === "ended")[0]!.outcome).toBe("cancelled");
  });

  it("a binder short-circuit (body never ran) still closes the card, as 'cancelled'", async () => {
    const { deps, events } = wiringHarness({ bound: false });
    await runFixture(deps);
    expect(events.filter((event) => event.kind === "started")).toHaveLength(1);
    expect(events.filter((event) => event.kind === "ended")[0]!.outcome).toBe("cancelled");
  });

  it("a runtime defect thrown at dispatch maps to 'err' (the framed-note path)", async () => {
    const { deps, events } = wiringHarness({ spawnThrows: true });
    await runFixture(deps);
    expect(events.filter((event) => event.kind === "ended")[0]!.outcome).toBe("err");
  });

  it("no registry ticket (a harness without beginInvocation) means no card at all", async () => {
    const { deps, events } = wiringHarness({ withTicket: false });
    await runFixture(deps);
    expect(events).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// D8 (operator ruling 2026-09-23): the child-regime path draws its own card.
// A VISIBLE child (RFC 0012 §7) is an interactive TUI session whose only
// status surface is the card; the publisher is composed only under
// `ctx.mode === "tui"`, so headless children stay entry-free with no gating
// code on this path.
// ---------------------------------------------------------------------------

describe("D8 — dispatch wiring: the child-regime path draws its own card", () => {
  it.each(["ok", "err", "cancelled"] as const)(
    "a regime drive resolving '%s' appends one started seed, then ended with that outcome AFTER finish",
    async (outcome) => {
      const { deps, events } = wiringHarness({ regime: { outcome } });
      await runFixture(deps);
      const started = events.filter((event) => event.kind === "started");
      expect(started).toHaveLength(1);
      expect(started[0]).toMatchObject({
        invocationId: "inv-77",
        theta: "demo",
        args: "some args",
        sourcePath: "/theta/demo.theta",
      });
      // The card opens BEFORE the drive (a live card while the child runs)…
      expect(events.findIndex((event) => event.kind === "started")).toBeLessThan(
        events.findIndex((event) => event.kind === "regime-drive"),
      );
      const ended = events.filter((event) => event.kind === "ended");
      expect(ended).toEqual([{ kind: "ended", invocationId: "inv-77", outcome }]);
      // …and closes AFTER ticket.finish(): the bus's invocationEnded settles
      // the ring first, the same end-after-finish contract as the top-level path.
      expect(events.findIndex((event) => event.kind === "finish")).toBeLessThan(
        events.indexOf(ended[0]!),
      );
    },
  );

  it("a throw escaping the regime drive (only HostFatal can) still closes the card as 'err' and rethrows", async () => {
    const { deps, events } = wiringHarness({ regime: { throws: true } });
    const fixture = composeThetaFixture(subagentTheta(), deps);
    await expect(
      fixture.run("some args", { signal: undefined, cwd: "/tmp" } as unknown as ExtensionCommandContext),
    ).rejects.toThrow("host fatal escape");
    expect(events.filter((event) => event.kind === "ended")).toEqual([
      { kind: "ended", invocationId: "inv-77", outcome: "err" },
    ]);
  });

  it("no registry ticket means no card on the regime path either — but the drive still runs", async () => {
    const { deps, events } = wiringHarness({ regime: { outcome: "ok" }, withTicket: false });
    await runFixture(deps);
    expect(events).toEqual([{ kind: "regime-drive" }]);
  });
});

// ---------------------------------------------------------------------------
// D8 — the REAL regime drive (subagent-spawn-regime.ts): PIC-76 outcome
// projection off the envelope arms, and the visible child's card-close /
// deferred-shutdown ordering.
// ---------------------------------------------------------------------------

describe("D8 — the real regime drive resolves the PIC-76 outcome projection", () => {
  it("an Ok terminal resolves 'ok' (positive control: one ok envelope)", async () => {
    const drive = await driveChildRoot('"DONE"\n', "/theta/worker.theta");
    expect(soleEnvelope(drive).kind).toBe("ok");
    expect(drive.outcome).toBe("ok");
  });

  it("a returned Err terminal resolves 'err' (one err envelope, propagated)", async () => {
    const drive = await driveChildRoot('Err("boom")\n', "/theta/worker.theta");
    expect(soleEnvelope(drive).kind).toBe("err");
    expect(drive.outcome).toBe("err");
  });

  it("a panic (non-exhaustive match) routes as the internal-error envelope and resolves 'err'", async () => {
    const drive = await driveChildRoot('match 5 { "x" => "a" }\n', "/theta/worker.theta");
    const envelope = soleEnvelope(drive);
    expect(envelope.kind).toBe("err");
    expect(drive.outcome).toBe("err");
  });

  it("a cancelled-kinded Err through the emitErr funnel resolves 'cancelled' (pre-aborted drive: the first loop-iter checkpoint surfaces Err({kind:'cancelled'}))", async () => {
    const abort = new AbortController();
    abort.abort();
    const drive = await driveChildRoot('while true { break }\n"UNREACHED"\n', "/theta/worker.theta", false, abort);
    const envelope = soleEnvelope(drive);
    if (envelope.kind !== "err") {
      throw new Error(`precondition unmet: expected the cancelled err envelope, got ${JSON.stringify(envelope)}`);
    }
    // The projection must read the REAL error kind — not map every Err to "err".
    expect(envelope.error.kind).toBe("cancelled");
    expect(drive.outcome).toBe("cancelled");
  });
});

describe("D8 — visible child: the card's final render lands BEFORE the deferred shutdown fires", () => {
  it("Ok arm: shutdown is REQUESTED during the drive, but finish → driveEnded run in the same synchronous settle continuation, ahead of the deferred shutdown", async () => {
    const events: string[] = [];
    const envelopeLines: string[] = [];
    // Model the host contract the regime relies on (`ctx.shutdown()` defers
    // until the session is idle — which cannot precede this very handler's
    // resolution) as a macrotask: the handler's own continuation chain is all
    // microtasks, so a correct ordering places every card event before it.
    const ctx = childCtx((): void => {
      events.push("shutdown-requested");
      setTimeout(() => events.push("shutdown-fired"), 0);
    });
    const deps = createProductionProducerDeps({
      pi: noopPi(),
      root: rootDouble(),
      modelRegistry: {
        getAvailable: () => [{ id: "claude-test", provider: "anthropic" }],
      } as unknown as ModelRegistry,
      subagentParentEnv: {},
      subagentRootRegime: { active: true, slug: "worker" },
      // RFC 0012 §7: the launch-file presentation is what arms the Ok arm's
      // `#requestVisibleChildShutdown`.
      subagentControlPlane: {
        env: {},
        entry: { kind: "theta" },
        launch: { nonce: "n", presentation: "visible" },
      },
      emitResultEnvelope: (line: string): void => {
        envelopeLines.push(line);
      },
      statusBus: noopExecutionStatusBus({
        invocationEnded: (): void => {
          events.push("bus-invocationEnded");
        },
      }),
      runCard: {
        driveStarted: (): void => {
          events.push("card-started");
        },
        driveEnded: (_invocationId: string, outcome: ThetaRunOutcome): void => {
          events.push(`card-ended:${outcome}`);
        },
      },
    });
    const fixture = composeThetaFixture(regimeSubagentTheta('"DONE"'), deps);
    await fixture.run("", ctx);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(envelopeLines).toHaveLength(1); // positive control: the Ok arm ran
    expect(events).toEqual([
      "card-started",
      "shutdown-requested",
      "bus-invocationEnded",
      "card-ended:ok",
      "shutdown-fired",
    ]);
  });
});

// ---------------------------------------------------------------------------
// D8 — `theta.runSummary` settings validation (decision 7 re-ruling: the
// opt-in key rides the DISC-7 scalar-key surface like every other theta.* key).
// ---------------------------------------------------------------------------

function runSummaryOf(settings: ThetaSettings): unknown {
  return (settings.theta as Record<string, unknown> | undefined)?.["runSummary"];
}

describe("D8 — theta.runSummary settings validation", () => {
  it.each([true, false] as const)("a valid boolean %s survives into ThetaSettings.theta.runSummary", async (value) => {
    const fs = buildSettings({ content: JSON.stringify({ theta: { runSummary: value } }) }, EMPTY_SETTINGS_FILE);
    const { settings, diagnostics } = await loadSettings(fs);
    expect(runSummaryOf(settings)).toBe(value);
    expect(byCode(diagnostics, "theta/load/settings-value-out-of-range")).toHaveLength(0);
  });

  it.each([
    ["a string", '"true"'],
    ["a number", "1"],
    ["null", "null"],
  ] as const)("%s is out of range: one diagnostic naming thetas.runSummary, key treated absent", async (_label, jsonLiteral) => {
    const fs = buildSettings({ content: `{"theta":{"runSummary":${jsonLiteral}}}` }, EMPTY_SETTINGS_FILE);
    const { settings, diagnostics } = await loadSettings(fs);
    const hits = byCode(diagnostics, "theta/load/settings-value-out-of-range");
    expect(hits.find((d) => d.message.includes("thetas.runSummary")), "expected a thetas.runSummary out-of-range diagnostic").toBeDefined();
    expect(runSummaryOf(settings)).toBeUndefined();
  });

  it("absent → absent in the cleaned view (the OFF default is applied at the read site)", async () => {
    const fs = buildSettings(EMPTY_SETTINGS_FILE, EMPTY_SETTINGS_FILE);
    const { settings, diagnostics } = await loadSettings(fs);
    expect(runSummaryOf(settings)).toBeUndefined();
    expect(byCode(diagnostics, "theta/load/settings-value-out-of-range")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Composition-level gate (production-composition.ts): the run-card publisher
// is constructed ONLY in a TUI composition — the RFC's "Modes and degradation"
// surface rule. Driven end to end through the REAL factory + composition root
// over a planted discovery workspace: the registered slash handler is the
// dispatch entry, and `pi.appendEntry` (recorded) is the observable.
// ---------------------------------------------------------------------------

const RUN_ENTRY_TYPES: readonly string[] = [THETA_RUN_ENTRY_TYPE, THETA_RUN_SUMMARY_ENTRY_TYPE];

interface ComposedHost {
  /** Every `pi.appendEntry` call the composition issued, run-card types included. */
  readonly appendCalls: readonly { customType: string; data: unknown }[];
  /** Every PIC-59 envelope line (child-regime positive control). */
  readonly envelopeLines: readonly string[];
  dispatch(name: string, args: string): Promise<unknown>;
}

/**
 * Boot the real factory over the real composition root (`composeInstance` →
 * `composeExtensionInstance`) via the shared `bootComposedHost` scaffold
 * (tests/helpers/production-load-harness.ts), with a recording `appendEntry`,
 * and hand back the registered dispatch surface.
 */
async function composeHost(options: {
  readonly cwd: string;
  readonly mode: "tui" | "print";
  /** Compose as a spawned subagent child marked for this slug (child regime). */
  readonly childRegimeSlug?: string;
}): Promise<ComposedHost> {
  const appendCalls: { customType: string; data: unknown }[] = [];
  const envelopeLines: string[] = [];
  const deps: ThetaExtensionDeps = {
    fixtures: [],
    // The factory threads its own entry channel (built over the recording `pi`
    // above) into the compose pass — forwarding it is what keeps the runCard
    // gate's `entryChannel !== undefined` arm live, so `ctx.mode` alone
    // decides the pair below.
    composeInstance: (composePi, composeCtx, ownRegisteredNames, entryChannel, latchStatusBus) =>
      composeExtensionInstance(composePi, composeCtx, {
        fileWatcher: new FakeFileWatcher(),
        clock: new FakeClock(),
        emitResultEnvelope: (line: string): void => {
          envelopeLines.push(line);
        },
        ...(options.childRegimeSlug !== undefined
          ? {
              subagentControlPlane: {
                env: { [SUBAGENT_ROOT_ENV_MARKER]: options.childRegimeSlug },
                entry: { kind: "theta" as const },
              },
            }
          : {}),
      }, undefined, ownRegisteredNames, entryChannel, latchStatusBus),
  };
  const host = await bootComposedHost({
    cwd: options.cwd,
    mode: options.mode,
    deps,
    piExtras: {
      appendEntry: (customType: string, data: unknown): void => {
        appendCalls.push({ customType, data });
      },
    },
  });
  return { appendCalls, envelopeLines, dispatch: host.dispatch };
}

describe("D3 — composition-level TUI-only gate (production-composition.ts)", () => {
  // A prompt-mode value-tail theta: the drive completes offline (binder
  // bypass — no params; no prompt statement — no live turn). The subagent
  // worker exists ONLY for the child-regime cell, which intercepts its
  // dispatch in-process before any child spawn.
  const workspace = plantThetaWorkspace(
    "theta-run-card-composition-",
    [
      { stem: "demo", text: theta("---", "mode: prompt", "---", '"DONE"') },
      { stem: "worker", text: theta("---", "mode: subagent", "---", '"DONE"') },
    ],
    "{}",
  );

  afterAll(() => {
    disposeWorkspace(workspace);
  });

  it("a TUI composition wires the publisher: dispatching a theta appends exactly one theta-run entry", async () => {
    const host = await composeHost({ cwd: workspace, mode: "tui" });
    await host.dispatch("demo", "fix the parser");
    const runEntries = host.appendCalls.filter((c) => c.customType === THETA_RUN_ENTRY_TYPE);
    expect(runEntries).toHaveLength(1);
    expect(runEntries[0]!.data).toMatchObject({
      theta: "demo",
      argsSummary: "fix the parser",
    });
    // The FakeClock never advances, so the decision-7 gate holds: no summary.
    expect(
      host.appendCalls.filter((c) => c.customType === THETA_RUN_SUMMARY_ENTRY_TYPE),
    ).toHaveLength(0);
  });

  it("a print composition constructs NO publisher: the same dispatch appends zero run-card entries", async () => {
    const host = await composeHost({ cwd: workspace, mode: "print" });
    await host.dispatch("demo", "fix the parser");
    expect(
      host.appendCalls.filter((c) => RUN_ENTRY_TYPES.includes(c.customType)),
    ).toHaveLength(0);
  });

  it("child regime in a TUI composition (RFC 0012 visible child): the marked-root dispatch draws its OWN card — exactly one theta-run entry (operator ruling 2026-09-23)", async () => {
    const host = await composeHost({ cwd: workspace, mode: "tui", childRegimeSlug: "worker" });
    await host.dispatch("worker", "fix it");
    // Positive control — the child regime genuinely ran: exactly one PIC-59
    // result envelope was emitted.
    expect(host.envelopeLines).toHaveLength(1);
    const runEntries = host.appendCalls.filter((c) => c.customType === THETA_RUN_ENTRY_TYPE);
    expect(runEntries).toHaveLength(1);
    expect(runEntries[0]!.data).toMatchObject({ theta: "worker", argsSummary: "fix it" });
    // No summary: the decision-7 gate holds (FakeClock) AND the re-ruled
    // default is off.
    expect(
      host.appendCalls.filter((c) => c.customType === THETA_RUN_SUMMARY_ENTRY_TYPE),
    ).toHaveLength(0);
  });

  it("headless child regime (print composition, the `--mode json -p` launch form): NO publisher is constructed, so the same marked-root dispatch appends zero run-card entries", async () => {
    const host = await composeHost({ cwd: workspace, mode: "print", childRegimeSlug: "worker" });
    await host.dispatch("worker", "");
    expect(host.envelopeLines).toHaveLength(1);
    expect(
      host.appendCalls.filter((c) => RUN_ENTRY_TYPES.includes(c.customType)),
    ).toHaveLength(0);
  });
});
