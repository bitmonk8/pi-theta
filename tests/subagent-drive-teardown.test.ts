// RFC-0005 re-base — PIC-9 subagent teardown on the DRIVE seam.
//
// Regression pin for the Decision-6 B1 leak, carried onto the RFC-0005
// child-process drive. On the subagent invocation drive, the per-invocation
// teardown (`binding.teardown`) must run on EVERY exit path — throw / normal /
// returned-`Err` — BEFORE `finishInvocation` (so the `disposeBarrier` still
// settles post-teardown), with `surface()` skipped on the throw path and the
// in-flight throw never masked.
//
// WHAT CHANGED FROM THE IN-PROCESS SUITE. The former part (1) drove the REAL
// `spawnSubagentConversation` over a mocked in-process `createAgentSession` and
// asserted `session.dispose()` / `session.abort()` counters. Under RFC-0005 the
// spawned in-process `AgentSession` is replaced by a child `pi` process, so
// those in-process assertions are retired. The child-process teardown mechanism
// (stdin close → bounded await SHUTDOWN_AWAIT_CAP_MS → process-tree kill;
// disposeBarrier settles on observed child exit; dispose-failure advisory on a
// teardown-step throw) is now covered as a pure seam by
// `runSubagentChildTeardown` in `tests/subagent-isolation.test.ts` (PIC-9). This
// suite retains the DRIVE-seam obligation below, which is MECHANISM-NEUTRAL: it
// asserts that the drive runs `binding.teardown()` on every exit — independent
// of whether teardown disposes an in-process handle or kills a child process.
//
// Spec: pi-integration-contract/subagent.md PIC-9 (child-process lifecycle);
// docs/rfcs/0005-child-process-subagent-sessions.md.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

// --- DRIVE seam: mock the module-level executeBody the drive calls ----------
const executorHook = vi.hoisted(() => ({
  impl: undefined as
    | ((...args: readonly unknown[]) => Promise<unknown>)
    | undefined,
}));
vi.mock("../src/runtime/statement-executor", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/runtime/statement-executor")>();
  return {
    ...actual,
    executeBody: (...args: readonly unknown[]): Promise<unknown> => {
      if (executorHook.impl === undefined) {
        throw new Error("executorHook.impl not set by the test");
      }
      return executorHook.impl(...args);
    },
  };
});

import { composeThetaFixture } from "../src/extension/theta-composition-producer";
import type {
  ConversationBinding,
  ThetaCompositionInput,
  ThetaProducerDeps,
} from "../src/extension/theta-composition-producer";
import type {
  BodyExecution,
  ExecuteBodyDeps,
} from "../src/runtime/statement-executor";
import { makeErr, makeOk, type ThetaValue, type ResultValue } from "../src/runtime/value";
import type { QueryError } from "../src/runtime/query-error";
import { HostFatal, IndexOutOfBoundsPanic } from "../src/runtime/runtime-panics";
import { ToolReturnShapeDefectError } from "../src/runtime/tool-call-off-surface";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaBody } from "../src/parser/theta-document";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";

// --- shared scaffolding ------------------------------------------------------

function emptyBody(): ThetaBody {
  return { statements: [], tail: null } as unknown as ThetaBody;
}

function subagentTheta(): ThetaCompositionInput {
  const frontmatter: ParsedFrontmatter = { mode: "subagent" } as ParsedFrontmatter;
  return {
    slashName: "classify",
    sourcePath: "/theta/classify.theta",
    frontmatter,
    body: emptyBody(),
  } as unknown as ThetaCompositionInput;
}

// =============================================================================
// The DRIVE seam runs the subagent teardown on EVERY exit: throw / normal /
// returned-Err. Mechanism-neutral under RFC-0005 (teardown kills the child
// process rather than disposing an in-process handle).
// =============================================================================

/** A subagent binding double whose surface/teardown/finishInvocation are spied,
 *  and a shared order log proving teardown runs before finishInvocation and
 *  surface is skipped on the throw path. */
interface DriveProbe {
  readonly deps: ThetaProducerDeps;
  readonly log: string[];
  surfaceCalls: number;
  teardownCalls: number;
  finishCalls: number;
  errNote: { thetaName: string; error: QueryError } | undefined;
  panicNote: { framing: string; diagnostic: Diagnostic } | undefined;
  panicNoteCalls: number;
}

function makeDriveProbe(surfaceReturn: ResultValue): DriveProbe {
  const state = {
    log: [] as string[],
    surfaceCalls: 0,
    teardownCalls: 0,
    finishCalls: 0,
    errNote: undefined as { thetaName: string; error: QueryError } | undefined,
    panicNote: undefined as { framing: string; diagnostic: Diagnostic } | undefined,
    panicNoteCalls: 0,
  };
  const binding: ConversationBinding = {
    drivenAgainst: "subagent-private-session",
    executeDeps: {} as unknown as ExecuteBodyDeps,
    surface: (): ResultValue => {
      state.surfaceCalls += 1;
      state.log.push("surface");
      return surfaceReturn;
    },
    teardown: (): void => {
      state.teardownCalls += 1;
      state.log.push("teardown");
    },
    finishInvocation: (): void => {
      state.finishCalls += 1;
      state.log.push("finish");
    },
  };
  const deps: ThetaProducerDeps = {
    runBinder: (): Promise<{ bound: true }> => Promise.resolve({ bound: true }),
    bindPromptConversation: (): ConversationBinding => binding,
    spawnSubagentConversation: (): Promise<ConversationBinding> =>
      Promise.resolve(binding),
    emitTopLevelErrNote: (thetaName: string, error: QueryError): void => {
      state.errNote = { thetaName, error };
    },
    emitPanicNote: (framing: string, diagnostic: Diagnostic): void => {
      state.panicNoteCalls += 1;
      state.panicNote = { framing, diagnostic };
    },
  };
  return {
    deps,
    get log() {
      return state.log;
    },
    get surfaceCalls() {
      return state.surfaceCalls;
    },
    get teardownCalls() {
      return state.teardownCalls;
    },
    get finishCalls() {
      return state.finishCalls;
    },
    get errNote() {
      return state.errNote;
    },
    get panicNote() {
      return state.panicNote;
    },
    get panicNoteCalls() {
      return state.panicNoteCalls;
    },
  };
}

function driveCtx(): ExtensionCommandContext {
  return { signal: undefined, cwd: "/tmp" } as unknown as ExtensionCommandContext;
}

/** A genuine runtime defect standing in for a `ToolReturnShapeDefectError` /
 *  `ThetaPanic` unwinding the body past `surface`. */
class InjectedBodyDefect extends Error {}

afterEach(() => {
  executorHook.impl = undefined;
});

describe("RFC-0005 PIC-9 — the DRIVE seam runs the subagent teardown on every exit", () => {
  it("(throw path) executeBody THROWS -> teardown runs once BEFORE finish, surface is skipped, and the defect is framed as ONE internal-error panic-note", async () => {
    const probe = makeDriveProbe(makeOk("unused"));
    executorHook.impl = (): Promise<unknown> =>
      Promise.reject(new InjectedBodyDefect("tool-return-shape defect"));

    const fixture = composeThetaFixture(subagentTheta(), probe.deps);

    await expect(fixture.run("", driveCtx())).resolves.toBeUndefined();

    expect(probe.surfaceCalls).toBe(0);
    expect(probe.teardownCalls).toBe(1);
    expect(probe.finishCalls).toBe(1);
    expect(probe.log).toEqual(["teardown", "finish"]);

    expect(probe.panicNoteCalls).toBe(1);
    expect(probe.panicNote?.framing).toBe(
      "theta /classify aborted with internal error: tool-return-shape defect",
    );
    expect(probe.panicNote?.diagnostic.code).toBe("theta/runtime/internal-error");
    expect(probe.errNote).toBeUndefined();
  });

  it("(top-level ThetaPanic) executeBody THROWS a ThetaPanic -> run() resolves; ONE panic-note framed `theta /<name> aborted: <message>`", async () => {
    const probe = makeDriveProbe(makeOk("unused"));
    const panic = new IndexOutOfBoundsPanic("index out of bounds: 5 not in 0..3");
    executorHook.impl = (): Promise<unknown> => Promise.reject(panic);

    const fixture = composeThetaFixture(subagentTheta(), probe.deps);
    await expect(fixture.run("", driveCtx())).resolves.toBeUndefined();

    expect(probe.teardownCalls).toBe(1);
    expect(probe.finishCalls).toBe(1);
    expect(probe.panicNoteCalls).toBe(1);
    expect(probe.panicNote?.framing).toBe(
      "theta /classify aborted: index out of bounds: 5 not in 0..3",
    );
    expect(probe.panicNote?.diagnostic.code).toBe("theta/runtime/index-out-of-bounds");
    expect(probe.panicNote?.diagnostic.message).toBe("index out of bounds: 5 not in 0..3");
  });

  it("(top-level ToolReturnShapeDefectError) -> run() resolves; ONE internal-error panic-note carrying the defect's own precise-site diagnostic", async () => {
    const probe = makeDriveProbe(makeOk("unused"));
    const diagnostic: Diagnostic = {
      severity: "error",
      code: "theta/runtime/internal-error",
      file: "/theta/classify.theta",
      range: { start: { line: 4, column: 2 }, end: { line: 4, column: 9 } },
      message: "internal error: tool grep returned a non-conforming result envelope",
      details: { kind: "tool-return-shape", tool_name: "grep", shape_check: "content-not-iterable" },
    };
    executorHook.impl = (): Promise<unknown> =>
      Promise.reject(new ToolReturnShapeDefectError(diagnostic));

    const fixture = composeThetaFixture(subagentTheta(), probe.deps);
    await expect(fixture.run("", driveCtx())).resolves.toBeUndefined();

    expect(probe.teardownCalls).toBe(1);
    expect(probe.finishCalls).toBe(1);
    expect(probe.panicNoteCalls).toBe(1);
    expect(probe.panicNote?.framing).toBe(
      "theta /classify aborted with internal error: tool grep returned a non-conforming result envelope",
    );
    expect(probe.panicNote?.diagnostic).toBe(diagnostic);
  });

  it("(top-level RangeError) a catchable generic allocation throw -> run() resolves; ONE internal-error panic-note", async () => {
    const probe = makeDriveProbe(makeOk("unused"));
    executorHook.impl = (): Promise<unknown> =>
      Promise.reject(new RangeError("Invalid string length"));

    const fixture = composeThetaFixture(subagentTheta(), probe.deps);
    await expect(fixture.run("", driveCtx())).resolves.toBeUndefined();

    expect(probe.panicNoteCalls).toBe(1);
    expect(probe.panicNote?.framing).toBe(
      "theta /classify aborted with internal error: Invalid string length",
    );
    expect(probe.panicNote?.diagnostic.code).toBe("theta/runtime/internal-error");
  });

  it("(HostFatal) a host-fatal throw is the ONLY thing that propagates -> run() STILL rejects (re-raised, fail-fast NOCEIL-3); no panic-note", async () => {
    const probe = makeDriveProbe(makeOk("unused"));
    const fatal = new HostFatal("heap OOM");
    executorHook.impl = (): Promise<unknown> => Promise.reject(fatal);

    const fixture = composeThetaFixture(subagentTheta(), probe.deps);
    await expect(fixture.run("", driveCtx())).rejects.toBe(fatal);

    expect(probe.teardownCalls).toBe(1);
    expect(probe.finishCalls).toBe(1);
    expect(probe.panicNoteCalls).toBe(0);
    expect(probe.panicNote).toBeUndefined();
  });

  it("(normal path) a successful completion surfaces the value and tears down exactly once", async () => {
    const probe = makeDriveProbe(makeOk("final answer"));
    executorHook.impl = (): Promise<unknown> =>
      Promise.resolve({ outcome: "success", result: { value: "final answer" } } as unknown as BodyExecution);

    const fixture = composeThetaFixture(subagentTheta(), probe.deps);
    await fixture.run("", driveCtx());

    expect(probe.surfaceCalls).toBe(1);
    expect(probe.teardownCalls).toBe(1);
    expect(probe.finishCalls).toBe(1);
    expect(probe.log).toEqual(["surface", "teardown", "finish"]);
    expect(probe.errNote).toBeUndefined();
    expect(probe.panicNoteCalls).toBe(0);
  });

  it("(returned-Err path) a surfaced Err tears down exactly once and still emits the top-level err-note", async () => {
    const qerror = { kind: "transport" } as unknown as QueryError;
    const probe = makeDriveProbe(makeErr(qerror as unknown as ThetaValue));
    executorHook.impl = (): Promise<unknown> =>
      Promise.resolve({ outcome: "fail", error: null } as unknown as BodyExecution);

    const fixture = composeThetaFixture(subagentTheta(), probe.deps);
    await fixture.run("", driveCtx());

    expect(probe.surfaceCalls).toBe(1);
    expect(probe.teardownCalls).toBe(1);
    expect(probe.finishCalls).toBe(1);
    expect(probe.errNote?.thetaName).toBe("classify");
    expect(probe.panicNoteCalls).toBe(0);
  });
});
