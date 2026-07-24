// One-note proof (production-wired) — a top-level tool-return-shape defect
// surfaces EXACTLY ONE `theta-system-note`.
//
// Regression pin for the double-emit defect: a top-level `<name>(args)` code-side
// tool call whose resolved envelope is malformed is a `return-shape-defect` that
// (a) touches the production tool-lowering sink at the REAL lowering seam
// (`runCodeSideToolCall` → `routeToolReturnShape` → `sink.diagnostic`) and then
// (b) throws the `ToolReturnShapeDefectError` carrier, which unwinds to
// `composeThetaFixture.run`'s top-level catch and is framed as ONE
// `theta /<name> aborted with internal error: <msg>` panic note (error-model.md
// §"Runtime panics"). The carrier — NOT the sink — is the single operator
// surface: the production code-side lowering sink is `noopSink()`, so the sink
// touch delivers NO note. This test drives the malformed return through the REAL
// production producer (`createProductionProducerDeps`) with a spy
// `pi.sendMessage`, so if the lowering sink were re-wired to an
// independently-delivering sink (the reverted 1c1a1d70 `runtimeDefectSink`) the
// operator would observe TWO notes and this test would red.
//
// The in-memory drive-teardown probe mocked `executeBody`, so it never exercised
// the real tool-lowering seam — this file closes that gap by letting the REAL
// executor + REAL host + REAL `runCodeSideToolCall` run against a fake host tool
// whose `execute()` resolves a non-conforming envelope (the sanctioned
// deterministic staging at the `runCodeSideToolCall`/dispatch seam — no model
// turn is needed because a bare tail `<name>(args)` is a code-side statement).
//
// Spec: pi-integration-contract/errors-and-results/error-model.md §"Runtime
// panics"; runtime-event-channel.md §"system-note-details-shapes" (group B);
// host-interfaces-core.md §"Tool execution from theta code".

import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";

// RFC-0005 re-base: the subagent bind spawns a child `pi` process, so this suite
// drives the REAL `launchSubagentChild` over a fake process launcher
// (`makeFakeChildLauncher`) rather than the retired in-process `createAgentSession`
// mock. `executeBody` is DELIBERATELY NOT mocked — the whole point is to exercise
// the real code-side tool-lowering seam (`runCodeSideToolCall`) from the subagent
// body, which runs PARENT-side regardless of the child.
import {
  fakeExecutableHost,
  makeFakeChildLauncher,
} from "./helpers/fake-rpc-child";

import {
  createProductionProducerDeps,
  type PiToolDispatch,
} from "../src/extension/production-theta-producer";
import { composeThetaFixture } from "../src/extension/theta-composition-producer";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import type { AgentToolResultEnvelope } from "../src/runtime/tool-call-execute";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint, CheckpointKind, CheckpointSite } from "../src/seams/checkpoint";
import type { CallExpr, ThetaBody } from "../src/parser/theta-document";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import type { SourceRange } from "../src/diagnostics/diagnostic";

const SYSTEM_NOTE_CHANNEL = "theta-system-note";

// --- scaffolding -------------------------------------------------------------

class RecordingCheckpoint implements Checkpoint {
  before(_kind: CheckpointKind, _site: CheckpointSite): Promise<void> {
    return Promise.resolve();
  }
}

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: new RecordingCheckpoint(),
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    // The model pre-flight (`queryChildResolvedModel`) + child teardown time on
    // the injected `Clock`; wire the ambient timers so the seams resolve.
    clock: {
      wallNow: () => 0,
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    },
  } as unknown as RuntimeRoot;
}

function span(): SourceRange {
  return { start: { line: 3, column: 5 }, end: { line: 3, column: 12 } };
}

/** A body whose sole tail is a code-side `<callee>()` tool call. */
function toolCallBody(callee: string): ThetaBody {
  const call: CallExpr = { kind: "call", callee, args: [], range: span() };
  return { statements: [], tail: call } as unknown as ThetaBody;
}

/** A subagent-mode theta (no `params:`, so the binder binds trivially, no
 *  overflow note on empty args) whose body is a single code-side tool call. */
function subagentToolTheta(callee: string): ThetaCompositionInput {
  const frontmatter: ParsedFrontmatter = { mode: "subagent" } as ParsedFrontmatter;
  return {
    slashName: "classify",
    sourcePath: "/theta/classify.theta",
    frontmatter,
    body: toolCallBody(callee),
  } as unknown as ThetaCompositionInput;
}

function driveCtx(): ExtensionCommandContext {
  return {
    // A resolved `Model`-like handle (the subagent launch reads `.id`/`.provider`);
    // the fake child reports the matching resolved model so the PIC-40 pre-flight
    // passes on the inherited-model path.
    model: { id: "claude-test", provider: "anthropic" },
    cwd: "/tmp",
    signal: undefined,
  } as unknown as ExtensionCommandContext;
}

/** A fake host tool whose `execute()` resolves the given (possibly malformed)
 *  envelope, and records that the REAL dispatch seam reached it. */
function fakeTool(
  name: string,
  resolved: unknown,
  counter: { dispatched: number },
): PiToolDispatch {
  return {
    toolName: name,
    execute(): Promise<AgentToolResultEnvelope> {
      counter.dispatched += 1;
      return Promise.resolve(resolved as AgentToolResultEnvelope);
    },
  };
}

interface Harness {
  readonly notes: Array<{ customType: unknown; content: unknown; details: unknown }>;
  readonly dispatched: { dispatched: number };
  readonly launcher: ReturnType<typeof makeFakeChildLauncher>;
  run(): Promise<void>;
}

/** Assemble the REAL production producer over a spy `pi.sendMessage`, with a
 *  `resolvePiTool` collaborator that resolves `broken`/`good` to a fake tool
 *  whose `execute()` returns `resolved`. The theta carries no `callableSet`, so
 *  `#resolvePiToolForTheta` falls back to this collaborator (production-parity
 *  for an in-memory fixture). */
function makeHarness(callee: string, resolved: unknown): Harness {
  const notes: Array<{ customType: unknown; content: unknown; details: unknown }> = [];
  const dispatched = { dispatched: 0 };
  const pi = {
    sendMessage: (message: { customType?: unknown; content?: unknown; details?: unknown }): void => {
      notes.push({
        customType: message.customType,
        content: message.content,
        details: message.details,
      });
    },
  } as unknown as ExtensionAPI;

  const launcher = makeFakeChildLauncher();
  const deps = createProductionProducerDeps({
    pi,
    root: rootDouble(),
    modelRegistry: {
      getApiKeyAndHeaders: () => Promise.resolve({ ok: false }),
    } as unknown as ModelRegistry,
    resolvePiTool: (name: string): PiToolDispatch | undefined =>
      name === callee ? fakeTool(name, resolved, dispatched) : undefined,
    subagentSpawn: launcher.spawn,
    subagentExecutableHost: fakeExecutableHost(),
    subagentParentEnv: {},
    subagentParentPid: 4242,
  });

  const fixture = composeThetaFixture(subagentToolTheta(callee), deps);
  return {
    notes,
    dispatched,
    launcher,
    run: () => fixture.run("", driveCtx()),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("one-note proof (production-wired) — a top-level tool-return-shape defect surfaces EXACTLY ONE theta-system-note", () => {
  it("a malformed resolved envelope through the REAL tool-lowering seam surfaces exactly ONE framed panic note, and NO second (sink) note", async () => {
    // A non-object envelope is a `resolved-not-object` return-shape defect: the
    // real `runCodeSideToolCall` seam builds the `theta/runtime/internal-error`
    // diagnostic, touches the production lowering sink (`noopSink`, no delivery),
    // and throws the `ToolReturnShapeDefectError` carrier.
    const h = makeHarness("broken", 42);

    await expect(h.run()).resolves.toBeUndefined();

    // The malformed return genuinely reached the REAL dispatch seam (so the sink
    // WAS on the executed path and would have fired a second note if wired).
    expect(h.dispatched.dispatched, "the fake tool's execute() was dispatched").toBe(1);
    // The subagent child was torn down on teardown (PIC-9: stdin-EOF exit),
    // leak-free, NOT masking the in-flight defect.
    expect(h.launcher.spawns).toHaveLength(1);
    expect(h.launcher.spawns[0]!.child.exited).toBe(true);

    // EXACTLY ONE note on the `theta-system-note` channel — the framed panic note.
    // If the lowering sink still delivered its own group-B note (the reverted
    // 1c1a1d70 `runtimeDefectSink`), this would be 2.
    expect(h.notes).toHaveLength(1);
    const note = h.notes[0];
    if (note === undefined) throw new Error("expected exactly one note");
    expect(note.customType).toBe(SYSTEM_NOTE_CHANNEL);
    // The framing carries the BARE message (the `internal error: ` prefix stripped),
    // NOT the raw `renderDiagnosticBatch([d])` a sink note would carry.
    expect(note.content).toBe(
      "theta /classify aborted with internal error: tool broken returned a non-conforming result envelope",
    );
    // Group-B diagnostics shape, carrying the single return-shape diagnostic.
    const details = note.details as { diagnostics?: ReadonlyArray<{ code?: string; details?: { kind?: string } }> };
    expect(details.diagnostics).toHaveLength(1);
    expect(details.diagnostics?.[0]?.code).toBe("theta/runtime/internal-error");
    expect(details.diagnostics?.[0]?.details?.kind).toBe("tool-return-shape");
  });

  it("a conforming resolved envelope through the same REAL seam emits NO note (no over-emission)", async () => {
    const h = makeHarness("good", { content: [{ type: "text", text: "ok" }] });

    await expect(h.run()).resolves.toBeUndefined();

    // The conforming tool genuinely ran through the real seam...
    expect(h.dispatched.dispatched, "the conforming tool's execute() was dispatched").toBe(1);
    expect(h.launcher.spawns[0]!.child.exited).toBe(true);
    // ...and lowered to a value with NO operator note (neither a sink note nor a
    // panic note): the hot path is byte-identical to the prior `noopSink()`.
    expect(h.notes).toEqual([]);
  });
});
