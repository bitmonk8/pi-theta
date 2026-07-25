// Bug 0001 / PIC-64 — PROMPT-mode (parent-leg) code-side extension-tool
// dispatch through the production producer.
//
// The resolution snapshot pins a prompt-mode extension-tool entry as the tool's
// NAME + `parameters` schema only — `pi.getAllTools()` strips `execute`, so the
// entry holds no executable (frontmatter-fields-b-and-templates.md §Resolution
// snapshot, *Prompt-mode extension-tool leg*). Its code-side dispatch runs
// through host-loop dispatch in the parent (PIC-64 rung 2), the ladder is
// fail-closed (rung 3), and invocation NEVER re-resolves the registry — the
// pinned name is used for the rest of the run; a pinned handle unusable at call
// time raises a precise `CodeToolError` rather than re-resolving or fabricating
// a value.
//
// This suite drives the REAL producer (`createProductionProducerDeps` +
// `bindPromptConversation` + `executeBody`) over a prompt-mode theta whose
// frozen callable-set snapshot carries the spec-pinned extension entry shape
// ({ toolName, parameters } — no `execute`), with the host-loop dispatch seam
// and the dispatch-ladder probe injected. NO subagent-root regime is supplied:
// the dispatch obligation is mode-independent (parent leg).
//
// Spec: pi-integration-contract/subagent.md PIC-64 (#pic-64, the fail-closed
// rung ladder + the mode-independent host-loop rung),
// frontmatter-fields-b-and-templates.md §Resolution snapshot (prompt-mode
// extension-tool leg; load-time-only resolution), tool-calls.md (`CodeToolError`).

import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import {
  createProductionProducerDeps,
  type PiToolDispatch,
} from "../src/extension/production-theta-producer";
import type {
  ThetaCompositionInput,
  ConversationBindInput,
} from "../src/extension/theta-composition-producer";
import { executeBody } from "../src/runtime/statement-executor";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";
import type { ThetaValue, ResultValue } from "../src/runtime/value";
import type {
  CallExpr,
  Expr,
  ThetaBody,
  ObjectExpr,
} from "../src/parser/theta-document";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import type {
  CallableSetSnapshot,
  ResolvedCallable,
} from "../src/parser/callable-set";
import type { SourceRange } from "../src/diagnostics/diagnostic";
import type {
  DispatchLadderProbe,
  EncodedToolRequest,
  HostToolResult,
} from "../src/runtime/host-loop-dispatch";

// --- AST + double helpers (mirrors callable-set-runtime-enforcement.test.ts) --

function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

function strExpr(value: string): Expr {
  return { kind: "string", value, range: span() };
}

function numExpr(n: number): Expr {
  return { kind: "number", text: String(n), numericType: "integer", range: span() };
}

/** A single object-literal argument `{ ... }` (the tool-call convention). */
function objArg(fields: Readonly<Record<string, Expr>>): ObjectExpr {
  return {
    kind: "object",
    typeName: null,
    fields: Object.entries(fields).map(([name, value]) => ({ name, value })),
    range: span(),
  };
}

function callExpr(callee: string, args: readonly Expr[] = []): CallExpr {
  return { kind: "call", callee, args, range: span() };
}

function body(tail: Expr | null): ThetaBody {
  return { statements: [], tail };
}

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: {
      newInvocationId: () => "inv-1",
      newToolCallId: () => "tc-1",
    },
  } as unknown as RuntimeRoot;
}

function ctxDouble(): ExtensionCommandContext {
  return {} as unknown as ExtensionCommandContext;
}

/**
 * The spec-pinned PROMPT-mode extension-tool snapshot entry: the tool's
 * UNDERLYING name + registered `parameters` schema, and NO `execute` — the
 * public extension API strips it (Resolution snapshot, *Prompt-mode
 * extension-tool leg*: the entry "holds only the tool's name and `parameters`
 * schema").
 */
function extensionToolEntry(toolName: string, parameters: unknown): ResolvedCallable {
  return { kind: "pi-tool", toolDefinition: { toolName, parameters } };
}

/** A frozen callable-set snapshot from `{ callableName -> entry }` pairs. */
function snapshot(
  entries: readonly (readonly [string, ResolvedCallable])[],
): CallableSetSnapshot {
  return Object.freeze({ entries: new Map(entries) });
}

/** A prompt-mode theta carrying a resolved callable-set snapshot. */
function thetaWithSet(tail: Expr, callableSet: CallableSetSnapshot): ThetaCompositionInput {
  const frontmatter: ParsedFrontmatter = { mode: "prompt" };
  return {
    slashName: "demo",
    sourcePath: "/theta/demo.theta",
    frontmatter,
    body: body(tail),
    callableSet,
  };
}

interface ProducerOpts {
  readonly resolvePiTool?: (name: string) => PiToolDispatch | undefined;
  readonly dispatchLadderProbe?: DispatchLadderProbe;
  readonly hostLoopDispatch?: (
    request: EncodedToolRequest,
    signal: AbortSignal,
  ) => Promise<HostToolResult>;
  readonly getAllTools?: () => readonly unknown[];
}

function producer(opts: ProducerOpts) {
  return createProductionProducerDeps({
    pi: {} as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
    // Deliberately NO `subagentRootRegime`: this is the PARENT / prompt leg.
    ...(opts.resolvePiTool !== undefined ? { resolvePiTool: opts.resolvePiTool } : {}),
    ...(opts.dispatchLadderProbe !== undefined
      ? { dispatchLadderProbe: opts.dispatchLadderProbe }
      : {}),
    ...(opts.hostLoopDispatch !== undefined
      ? { hostLoopDispatch: opts.hostLoopDispatch }
      : {}),
    ...(opts.getAllTools !== undefined
      ? { getAllTools: opts.getAllTools as never }
      : {}),
  });
}

async function runBody(
  deps: ReturnType<typeof producer>,
  theta: ThetaCompositionInput,
): Promise<ThetaValue> {
  const bindInput: ConversationBindInput = { theta, args: "", ctx: ctxDouble() };
  const binding = deps.bindPromptConversation(bindInput);
  const execution = await executeBody(theta.body, binding.executeDeps);
  const outer = execution.result;
  if (!outer.present || outer.value === undefined) {
    throw new Error("body produced no final value");
  }
  return outer.value;
}

const FINDING_STORE_SCHEMA = {
  type: "object",
  properties: { op: { type: "string" } },
  required: ["op"],
} as const;

/**
 * A recording host-loop dispatch seam fake resolving with a text result
 * (ok by default; `isError: true` models the host loop reading back a FAILED
 * tool execution — PIC-64 (d): the read-back's `isError` is preserved to code).
 */
function recordingHostLoop(text = "HOST-LOOP-RAN", isError = false): {
  readonly seen: EncodedToolRequest[];
  readonly dispatch: (
    request: EncodedToolRequest,
    signal: AbortSignal,
  ) => Promise<HostToolResult>;
} {
  const seen: EncodedToolRequest[] = [];
  return {
    seen,
    dispatch: (request: EncodedToolRequest): Promise<HostToolResult> => {
      seen.push(request);
      return Promise.resolve({
        content: [{ type: "text", text }],
        isError,
      });
    },
  };
}

const HOST_LOOP_PROBE: DispatchLadderProbe = {
  getToolDefinitionAvailable: false,
  hostLoopAvailable: true,
};

const NO_RUNG_PROBE: DispatchLadderProbe = {
  getToolDefinitionAvailable: false,
  hostLoopAvailable: false,
};

describe("PIC-64 rung 2 — prompt-mode (parent-leg) code-side extension-tool dispatch routes through the host-loop seam", () => {
  it("a code-side call to a snapshot extension tool dispatches through hostLoopDispatch with the VERBATIM request and lowers the result to Ok(text)", async () => {
    const hostLoop = recordingHostLoop();
    const set = snapshot([
      ["finding_store", extensionToolEntry("finding_store", FINDING_STORE_SCHEMA)],
    ]);
    const theta = thetaWithSet(
      callExpr("finding_store", [objArg({ op: strExpr("write") })]),
      set,
    );

    const inner = (await runBody(
      producer({ dispatchLadderProbe: HOST_LOOP_PROBE, hostLoopDispatch: hostLoop.dispatch }),
      theta,
    )) as ResultValue;

    // The seam received exactly one request, carrying the code-supplied
    // arguments verbatim and the UNDERLYING tool name.
    expect(hostLoop.seen).toEqual([
      { toolName: "finding_store", args: { op: "write" } },
    ]);
    // The host-loop result flows back as the tool's Ok value.
    expect(inner.ok, "the host-loop result lowers to Ok, never an Err/TypeError").toBe(true);
    expect((inner as { readonly ok: true; readonly value: unknown }).value).toBe(
      "HOST-LOOP-RAN",
    );
  });

  it("nested argument structures reach the seam verbatim (deep-equal)", async () => {
    const hostLoop = recordingHostLoop();
    const set = snapshot([
      ["finding_store", extensionToolEntry("finding_store", FINDING_STORE_SCHEMA)],
    ]);
    const theta = thetaWithSet(
      callExpr("finding_store", [
        objArg({
          op: strExpr("write"),
          n: numExpr(7),
          nested: objArg({ deep: strExpr("x"), m: numExpr(2) }),
        }),
      ]),
      set,
    );

    await runBody(
      producer({ dispatchLadderProbe: HOST_LOOP_PROBE, hostLoopDispatch: hostLoop.dispatch }),
      theta,
    );

    expect(hostLoop.seen).toHaveLength(1);
    expect(hostLoop.seen[0]?.args).toEqual({
      op: "write",
      n: 7,
      nested: { deep: "x", m: 2 },
    });
  });

  it("an isError: true host-loop result lowers to Err(CodeToolError { cause: 'execution' }) carrying the host text — never a fabricated Ok", async () => {
    // tool-calls.md pins the `execution` cause as "tool's `execute()` threw OR
    // returned `isError: true`", and that a code-side call lowers an
    // `{ content, isError: true }` return to `Err(CodeToolError { cause:
    // "execution" })`; PIC-64 (d) pins the host-loop read-back's `isError` is
    // "preserved to code". A host result flagged isError must therefore surface
    // as the precise execution Err — lowering it to Ok(text) would fabricate a
    // success from a failed tool.
    const hostLoop = recordingHostLoop("HOST-FAILED", true);
    const set = snapshot([
      ["finding_store", extensionToolEntry("finding_store", FINDING_STORE_SCHEMA)],
    ]);
    const theta = thetaWithSet(
      callExpr("finding_store", [objArg({ op: strExpr("write") })]),
      set,
    );

    const inner = (await runBody(
      producer({ dispatchLadderProbe: HOST_LOOP_PROBE, hostLoopDispatch: hostLoop.dispatch }),
      theta,
    )) as ResultValue;

    // The dispatch DID reach the seam, exactly once.
    expect(hostLoop.seen).toHaveLength(1);
    expect(
      inner.ok,
      "an isError: true host result must lower to Err — never a fabricated Ok",
    ).toBe(false);
    const err = (
      inner as {
        readonly ok: false;
        readonly error: {
          readonly kind?: string;
          readonly cause?: string;
          readonly message?: string;
        };
      }
    ).error;
    expect(err.kind, "the precise CodeToolError carrier").toBe("code_tool");
    expect(err.cause, "isError: true routes to the `execution` cause").toBe("execution");
    expect(
      err.message,
      "the failed tool's own text is carried on the Err, not discarded",
    ).toContain("HOST-FAILED");
  });

  it("an `as`-renamed extension tool dispatches under its UNDERLYING registered name (the name the host session executes)", async () => {
    const hostLoop = recordingHostLoop();
    // Snapshot keyed by the post-rename presented name `store`; the entry pins
    // the underlying `finding_store`.
    const set = snapshot([
      ["store", extensionToolEntry("finding_store", FINDING_STORE_SCHEMA)],
    ]);
    const theta = thetaWithSet(callExpr("store", [objArg({ op: strExpr("read") })]), set);

    const inner = (await runBody(
      producer({ dispatchLadderProbe: HOST_LOOP_PROBE, hostLoopDispatch: hostLoop.dispatch }),
      theta,
    )) as ResultValue;

    expect(inner.ok).toBe(true);
    // The dispatched request names the UNDERLYING tool — the only name the
    // host registry/active set knows (collectExtensionToolNames-equivalent
    // classification keys on the underlying name, not the presented one).
    expect(hostLoop.seen[0]?.toolName).toBe("finding_store");
  });
});

describe("PIC-64 rung 3 — a code-side call with NO code-side rung raises a precise CodeToolError (never a fabricated value, never a silent no-op)", () => {
  it("no rung available → Err(kind code_tool); no value is produced", async () => {
    const set = snapshot([
      ["finding_store", extensionToolEntry("finding_store", FINDING_STORE_SCHEMA)],
    ]);
    const theta = thetaWithSet(
      callExpr("finding_store", [objArg({ op: strExpr("write") })]),
      set,
    );

    const inner = (await runBody(
      // The tool resolved ONLY at the model-facing rung: admitted (in the
      // snapshot) but no code-side dispatch rung established.
      producer({ dispatchLadderProbe: NO_RUNG_PROBE }),
      theta,
    )) as ResultValue;

    expect(
      inner.ok,
      "a code-side call whose tool has no code-side rung must surface Err — never Ok",
    ).toBe(false);
    const err = (
      inner as {
        readonly ok: false;
        readonly error: { readonly kind?: string; readonly message?: string };
      }
    ).error;
    expect(err.kind, "the precise CodeToolError carrier").toBe("code_tool");
    // PRECISION pin: PIC-64 rung 3 requires the refusal to NAME the tool (the
    // `renderExtensionToolUnreachableMessage` renderer: "extension tool
    // '<name>' is unreachable from theta code: …"). An accidental
    // `TypeError: tool.execute is not a function` from dispatching the
    // execute-less snapshot entry also lowers to kind code_tool but names no
    // tool — this assertion is what distinguishes the wired ladder from that
    // accident.
    expect(
      err.message,
      "the rung-3 CodeToolError must name the unreachable tool",
    ).toContain("finding_store");
  });

  it("a pinned handle unusable at call time (the seam rejects) → Err(kind code_tool), and NO re-resolution occurs", async () => {
    let resolverCalls = 0;
    const set = snapshot([
      ["finding_store", extensionToolEntry("finding_store", FINDING_STORE_SCHEMA)],
    ]);
    const theta = thetaWithSet(
      callExpr("finding_store", [objArg({ op: strExpr("write") })]),
      set,
    );

    const inner = (await runBody(
      producer({
        dispatchLadderProbe: HOST_LOOP_PROBE,
        hostLoopDispatch: (): Promise<HostToolResult> =>
          Promise.reject(new Error("pinned handle unusable at call time")),
        // A resolver spy: the runtime must NOT fall back to re-resolving the
        // registry when the pinned handle fails (Resolution snapshot: "the
        // runtime never re-queries Pi's tool registry by name during execution").
        resolvePiTool: (): PiToolDispatch | undefined => {
          resolverCalls += 1;
          return undefined;
        },
      }),
      theta,
    )) as ResultValue;

    expect(inner.ok, "an unusable pinned handle surfaces Err, never a fabricated value").toBe(
      false,
    );
    const err = (
      inner as {
        readonly ok: false;
        readonly error: { readonly kind?: string; readonly message?: string };
      }
    ).error;
    expect(err.kind).toBe("code_tool");
    // PRECISION pin: the Resolution snapshot requires "a pinned handle found
    // unusable at call time raises a precise `CodeToolError`" — precise means
    // it carries the call-time failure itself. The dispatch-path rejection
    // lowers through the V14g execute-throw lowering, whose `message` is the
    // thrown value coerced to the underlying-error string (tool-calls.md
    // `cause: "execution"`), so the seam rejection's own message MUST survive
    // into the Err. Today's accidental `TypeError: tool.execute is not a
    // function` (the seam is never consulted) does not contain it.
    expect(
      err.message,
      "the CodeToolError must identify the unusable pinned handle via the seam rejection's message",
    ).toContain("pinned handle unusable at call time");
    expect(
      resolverCalls,
      "invocation must not re-resolve: the snapshot-carrying theta never consults the producer-wide resolver",
    ).toBe(0);
  });
});

describe("PIC-64 — routing follows the RESOLVED rung: rung 1 recorded without a rung-1 dispatcher refuses precisely", () => {
  it("a probe recording get-tool-definition (a harness-only shape today) yields Err(code_tool) naming the tool and the unserved rung — host-loop is NOT silently substituted", async () => {
    // The composition root derives rung-1 availability as the upstream surface
    // probe AND a wired rung-1 dispatcher, and no rung-1 dispatcher exists at
    // the pin — so this probe shape (rung 1 recorded available) is
    // constructible only by a harness. The ladder's normative preference still
    // resolves rung 1; the dispatch site must honour that choice by refusing
    // precisely rather than rerouting through host-loop — routing through a
    // rung the ladder did not choose is exactly the drift bug 0001's Finding 2
    // exposed (registration outrunning dispatchability).
    const hostLoop = recordingHostLoop();
    const set = snapshot([
      ["finding_store", extensionToolEntry("finding_store", FINDING_STORE_SCHEMA)],
    ]);
    const theta = thetaWithSet(
      callExpr("finding_store", [objArg({ op: strExpr("write") })]),
      set,
    );

    const inner = (await runBody(
      producer({
        dispatchLadderProbe: { getToolDefinitionAvailable: true, hostLoopAvailable: true },
        hostLoopDispatch: hostLoop.dispatch,
      }),
      theta,
    )) as ResultValue;

    expect(inner.ok, "no rung-1 dispatcher exists — the call must surface Err").toBe(false);
    const err = (
      inner as {
        readonly ok: false;
        readonly error: { readonly kind?: string; readonly message?: string };
      }
    ).error;
    expect(err.kind, "the precise CodeToolError carrier").toBe("code_tool");
    expect(
      err.message,
      "the refusal names the tool (fail-closed, never a fabricated value)",
    ).toContain("finding_store");
    expect(err.message, "the refusal names the unserved rung").toContain("get-tool-definition");
    expect(
      hostLoop.seen,
      "host-loop is a DIFFERENT rung than the ladder chose — never silently substituted",
    ).toHaveLength(0);
  });
});

describe("Resolution snapshot — load-time-only resolution: invocation does NOT re-resolve", () => {
  it("two invocations dispatch twice through the pinned entry; the registry resolvers are consulted ZERO times at invocation", async () => {
    const hostLoop = recordingHostLoop();
    let resolverCalls = 0;
    let getAllToolsCalls = 0;
    const set = snapshot([
      ["finding_store", extensionToolEntry("finding_store", FINDING_STORE_SCHEMA)],
    ]);
    const deps = producer({
      dispatchLadderProbe: HOST_LOOP_PROBE,
      hostLoopDispatch: hostLoop.dispatch,
      resolvePiTool: (): PiToolDispatch | undefined => {
        resolverCalls += 1;
        return undefined;
      },
      getAllTools: (): readonly unknown[] => {
        getAllToolsCalls += 1;
        return [];
      },
    });

    // Invocation 1 and invocation 2 against the SAME frozen snapshot (the
    // load-time resolution artifact).
    for (let i = 0; i < 2; i += 1) {
      const theta = thetaWithSet(
        callExpr("finding_store", [objArg({ op: strExpr("write") })]),
        set,
      );
      const inner = (await runBody(deps, theta)) as ResultValue;
      expect(inner.ok, `invocation ${i + 1} dispatches through the pinned entry`).toBe(true);
    }

    expect(hostLoop.seen).toHaveLength(2);
    expect(
      resolverCalls,
      "the producer-wide registry resolver is never consulted for a snapshot-held name",
    ).toBe(0);
    expect(
      getAllToolsCalls,
      "the pi.getAllTools() registry snapshot is a LOAD-time read; invocation never re-reads it",
    ).toBe(0);
  });
});
