import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import {
  createProductionProducerDeps,
  type CalleeParseOutcome,
  type PiToolDispatch,
} from "../src/extension/production-theta-producer";
import type {
  ThetaCompositionInput,
  ConversationBindInput,
} from "../src/extension/theta-composition-producer";
import { executeBody } from "../src/runtime/statement-executor";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";
import type { AgentToolResultEnvelope } from "../src/runtime/tool-call-execute";
import type { ThetaValue, ResultValue } from "../src/runtime/value";
import type { CallExpr, Expr, ThetaBody } from "../src/parser/theta-document";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import type { SourceRange } from "../src/diagnostics/diagnostic";

// H8b — the live tool-call / invoke resolvers wired into the production
// composition root. These tests prove the shipped `ProductionThetaProducer` no
// longer wires the inert `resolveToolCall` / `resolveInvoke` doubles (which
// fabricated `Ok(null)` / `Ok("")` without executing) but drives the REAL
// runners:
//   - a code-side `<name>(args)` Pi-tool call dispatches the resolved host
//     tool's `execute(...)` and lowers its envelope (V14g) to `Ok(text)`;
//   - an `execute()` throw / unknown host tool surfaces
//     `Err(CodeToolError{cause:"execution"})`, never a fabricated value;
//   - a `.theta`-callable `<name>(args)` call routes to the invoke path, and a
//     callee that cannot be loaded surfaces `Err(InvokeInfraError{cause:
//     "load_failure"})` across the boundary — never `Ok(null)` (FN-5).
//
// The prompt-mode binding is reached synchronously (no live session), so the
// resolver behaviour is `npm test`-assertable off the real
// `createEffectfulStatementHost` + real `runCodeSideToolCall` /
// `runInvokeChild`. The full positive spawn-and-drive typed return crossing a
// live subagent boundary is the opt-in live witness (tests/live).

// --- AST + double helpers --------------------------------------------------

function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

function callExpr(callee: string, args: readonly Expr[] = []): CallExpr {
  return { kind: "call", callee, args, range: span() };
}

/** A bare object-literal expression `{ f0: v0, f1: v1, ... }` — the single
 * positional argument a code-driven Pi-tool call takes. Its evaluated field map
 * is the constructed `params` JSON document ceiling #4 walks. */
function objectExpr(fields: Readonly<Record<string, Expr>>): Expr {
  return {
    kind: "object",
    typeName: null,
    fields: Object.entries(fields).map(([name, value]) => ({ name, value })),
    range: span(),
  };
}

function body(tail: Expr | null): ThetaBody {
  return { statements: [], tail };
}

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

/** A `RuntimeRoot` double exposing only the members the tool/invoke path reads. */
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

interface ProducerOpts {
  readonly resolvePiTool?: (name: string) => PiToolDispatch | undefined;
  // Bug 0293: the seam returns the three-arm `CalleeParseOutcome` verdict, not
  // a bare `ThetaCompositionInput`, so `#driveCallee` can mint `load_failure`
  // vs `parse_failure`; every stub below wraps a success as `{ kind: "ok", input }`.
  readonly parseCallee?: (
    callerPath: string | undefined,
    calleePath: string,
  ) => Promise<CalleeParseOutcome | undefined>;
  /** An `ExtensionAPI` double (default empty). The prompt→prompt attach path
   * reads `getActiveTools`/`setActiveTools`, so a test that drives it supplies
   * stubs. */
  readonly pi?: ExtensionAPI;
}

function producer(opts: ProducerOpts) {
  return createProductionProducerDeps({
    pi: opts.pi ?? ({} as unknown as ExtensionAPI),
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
    ...(opts.resolvePiTool !== undefined ? { resolvePiTool: opts.resolvePiTool } : {}),
    ...(opts.parseCallee !== undefined ? { parseCallee: opts.parseCallee } : {}),
  });
}

/** A `NumberExpr` integer literal. */
function numberExpr(n: number): Expr {
  return { kind: "number", text: String(n), numericType: "integer", range: span() };
}
/** A `StringExpr` literal. */
function stringExpr(value: string): Expr {
  return { kind: "string", value, range: span() };
}
/** `depth` nested `[...]` around a `1` leaf — JSON-document depth `depth+1` (the
 * leaf counts as a level). `nestedArray(5)` → depth 6 trips ceiling #4's
 * depth-≤5 cap; `nestedArray(4)` → depth 5 is at the cap and defers. */
function nestedArray(depth: number): Expr {
  let e: Expr = numberExpr(1);
  for (let i = 0; i < depth; i += 1) {
    e = { kind: "array", elements: [e], range: span() };
  }
  return e;
}
/** An `invoke<returnSchema>("path", ...positional)` expression. args[0] is the
 * callee-path literal per the parser convention; args[1..] are positional. */
function invokeExpr(
  path: string,
  returnSchema: string | null,
  positional: readonly Expr[] = [],
): Expr {
  return {
    kind: "invoke",
    path,
    returnSchema,
    args: [stringExpr(path), ...positional],
    range: span(),
  };
}

function promptTheta(tail: Expr, tools?: readonly string[]): ThetaCompositionInput {
  const frontmatter: ParsedFrontmatter = {
    mode: "prompt",
    ...(tools !== undefined ? { tools } : {}),
  };
  return { slashName: "demo", sourcePath: "/theta/demo.theta", frontmatter, body: body(tail) };
}

/**
 * Drive the theta body through the real prompt-mode binding and return the tail
 * expression's produced value (the call/invoke `ResultValue`). The body succeeds
 * on every path here (a failed call produces an `Err` *value*, not a failed
 * body), so the outer execution result is always `Ok(<tail value>)`.
 */
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

// ===========================================================================
// Real-host tool-call wiring — cka-13 / cka-46 integration witness (V14*).
// ===========================================================================

describe("H8b — real-host code-side tool-call wiring", () => {
  it("a code-side `<name>(args)` Pi-tool call dispatches the resolved host tool's execute and lowers its envelope to Ok(text)", async () => {
    let dispatched = false;
    const resolvePiTool = (name: string): PiToolDispatch | undefined => ({
      toolName: name,
      execute: (): Promise<AgentToolResultEnvelope> => {
        dispatched = true;
        return Promise.resolve({ content: [{ type: "text", text: "tool-out" }] });
      },
    });

    const inner = (await runBody(
      producer({ resolvePiTool }),
      promptTheta(callExpr("emit")),
    )) as ResultValue;

    expect(dispatched, "the real code-side tool-call path dispatched the host tool").toBe(true);
    expect(inner.ok, "a cleanly-resolving tool call lowers to Ok(...)").toBe(true);
    expect(
      (inner as { readonly ok: true; readonly value: unknown }).value,
      "the lowered value is the tool's joined text — NOT a fabricated Ok(null)/Ok('')",
    ).toBe("tool-out");
  });

  it("an execute() throw surfaces Err(CodeToolError{cause:'execution'}), never a fabricated Ok", async () => {
    const resolvePiTool = (name: string): PiToolDispatch => ({
      toolName: name,
      execute: (): Promise<AgentToolResultEnvelope> =>
        Promise.reject(new Error("tool blew up")),
    });

    const inner = (await runBody(
      producer({ resolvePiTool }),
      promptTheta(callExpr("emit")),
    )) as ResultValue;
    expect(inner.ok, "a failed tool call surfaces Err, never Ok").toBe(false);
    const err = (inner as { readonly ok: false; readonly error: { readonly cause?: string } }).error;
    expect(err.cause, "the execute() throw lowers to CodeToolError cause 'execution'").toBe(
      "execution",
    );
  });

  it("an unresolved host tool name surfaces Err(execution) rather than fabricating a value", async () => {
    // No `resolvePiTool` collaborator: the code-side call names no resolvable
    // host tool, so the dispatch throws and lowers to the execution Err.
    const inner = (await runBody(
      producer({}),
      promptTheta(callExpr("no_such_tool")),
    )) as ResultValue;
    expect(inner.ok, "an unresolved host tool surfaces Err, never Ok('')").toBe(false);
  });
});

// ===========================================================================
// Real-host invoke wiring — FN-5 failure surfacing (V15*).
// ===========================================================================

describe("H8b — `.theta`-callable routing surfaces Err on a load failure (FN-5)", () => {
  it("a `.theta`-callable `<name>(args)` call whose callee cannot be loaded surfaces Err(InvokeInfraError{cause:'load_failure'}), never Ok(null)", async () => {
    let parseAttempted = false;
    // The callee resolves to `./sentiment.theta` (the callable-set entry) but
    // fails to load, so the invoke path surfaces the load-failure Err.
    const parseCallee = (
      _callerPath: string | undefined,
      _calleePath: string,
    ): Promise<CalleeParseOutcome | undefined> => {
      parseAttempted = true;
      return Promise.resolve(undefined);
    };

    const theta = promptTheta(callExpr("sentiment"), ["./sentiment.theta"]);
    const inner = (await runBody(producer({ parseCallee }), theta)) as ResultValue;

    expect(parseAttempted, "a `.theta`-callable call routes to the invoke spawn-and-drive path").toBe(
      true,
    );
    expect(inner.ok, "a callee load failure surfaces Err, never a fabricated Ok(null)").toBe(false);
    const err = (inner as { readonly ok: false; readonly error: { readonly cause?: string; readonly kind?: string } }).error;
    expect(err.kind, "the load failure is an InvokeInfraError").toBe("invoke_infra");
    expect(err.cause, "with cause 'load_failure'").toBe("load_failure");
  });
});

// ===========================================================================
// Ceiling #4 (JSON-document depth ≤5) on the two `invoke` boundaries
// (hard-ceilings/ceilings-3-and-4.md#ceiling-4-table; CIO-3 depth-before-AJV).
// Proves invoke-ceiling-depth.ts is WIRED into the production invoke path.
// ===========================================================================

describe("ceiling #4 on invoke boundaries (invoke-ceiling-depth.ts wired)", () => {
  it("a depth-6 `invoke(...)` params argument surfaces Err(InvokeInfraError{cause:'validation'}) before the callee loads", async () => {
    let parseAttempted = false;
    const parseCallee = (): Promise<CalleeParseOutcome | undefined> => {
      parseAttempted = true;
      return Promise.resolve(undefined);
    };
    // A depth-6 positional arg (5 nested arrays + leaf) trips the params-boundary
    // depth walk at invoke entry — before the callee is even parsed.
    const inner = (await runBody(
      producer({ parseCallee }),
      promptTheta(invokeExpr("./child.theta", null, [nestedArray(5)])),
    )) as ResultValue;

    expect(inner.ok, "a depth-6 params argument surfaces Err, never binds silently").toBe(false);
    const err = (inner as { readonly ok: false; readonly error: { readonly kind?: string; readonly cause?: string } }).error;
    expect(err.kind, "the params-depth breach is an InvokeInfraError").toBe("invoke_infra");
    expect(err.cause, "with cause 'validation' (the input boundary)").toBe("validation");
    expect(parseAttempted, "the depth check fires before the callee load (CIO-3 / params boundary)").toBe(false);
  });

  it("a depth-5 `invoke(...)` params argument is within the cap and defers past the depth walk", async () => {
    // A depth-5 arg (4 nested arrays + leaf) is at the cap; the callee then loads
    // (and here fails to load, surfacing the load_failure Err) — proving the
    // depth walk did NOT false-trip a within-cap argument.
    const inner = (await runBody(
      producer({ parseCallee: () => Promise.resolve(undefined) }),
      promptTheta(invokeExpr("./child.theta", null, [nestedArray(4)])),
    )) as ResultValue;
    expect(inner.ok).toBe(false);
    const err = (inner as { readonly ok: false; readonly error: { readonly cause?: string } }).error;
    expect(err.cause, "a within-cap arg defers past ceiling #4 to the callee load").toBe("load_failure");
  });

  it("a depth-6 `invoke<T>` return value surfaces Err(InvokeInfraError{cause:'return_validation'}) before AJV", async () => {
    // The callee is a prompt-mode theta whose body tail is a depth-6 value; a
    // prompt caller invoking it attaches (no live model needed for a query-free
    // body). Its Ok(depth-6) payload trips the return-boundary depth walk before
    // the AJV schema is consulted.
    const calleeTheta: ThetaCompositionInput = {
      slashName: "child",
      sourcePath: "/theta/child.theta",
      frontmatter: { mode: "prompt" },
      body: body(nestedArray(5)),
    };
    const piDouble = {
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI;
    const inner = (await runBody(
      producer({ pi: piDouble, parseCallee: () => Promise.resolve({ kind: "ok", input: calleeTheta }) }),
      promptTheta(invokeExpr("./child.theta", "Deep")),
    )) as ResultValue;

    expect(inner.ok, "a depth-6 typed return surfaces Err, never binds silently").toBe(false);
    const err = (inner as { readonly ok: false; readonly error: { readonly kind?: string; readonly cause?: string } }).error;
    expect(err.kind, "the return-depth breach is an InvokeInfraError").toBe("invoke_infra");
    expect(err.cause, "with cause 'return_validation' (the return boundary)").toBe("return_validation");
  });
});

// ===========================================================================
// Ceiling #4 (JSON-document depth ≤5) on the code-driven `<name>(args)` tool-call
// argument boundary (hard-ceilings/ceilings-3-and-4.md#ceiling-4-table, the
// code-driven tool-call args row; schema-subset.md §Depth Enforcement point #3;
// CIO-3 depth-before-AJV). Proves enforceCodeToolArgDepth (tool-call.ts) is
// WIRED into the production code-side tool-call path — the code-driven analogue
// of the invoke-boundary wiring above. Mirror-symmetric: differs only in the
// carrier (CodeToolError vs InvokeInfraError) per the per-boundary table.
// ===========================================================================

describe("ceiling #4 on code-driven tool-call args (enforceCodeToolArgDepth wired)", () => {
  it("a depth-6 `<name>(args)` argument surfaces Err(CodeToolError{cause:'validation'}) BEFORE the tool executes", async () => {
    let dispatched = false;
    const resolvePiTool = (name: string): PiToolDispatch => ({
      toolName: name,
      execute: (): Promise<AgentToolResultEnvelope> => {
        dispatched = true;
        return Promise.resolve({ content: [{ type: "text", text: "tool-out" }] });
      },
    });
    // params `{ deep: [[[[1]]]] }`: object(1) → deep value array(2) → (3) → (4)
    // → (5) → leaf 1(6) = JSON-document depth 6, one past the cap.
    const inner = (await runBody(
      producer({ resolvePiTool }),
      promptTheta(callExpr("emit", [objectExpr({ deep: nestedArray(4) })])),
    )) as ResultValue;

    expect(dispatched, "the tool's execute() is NEVER called on a depth-6 argument").toBe(false);
    expect(inner.ok, "a depth-6 tool-call argument surfaces Err, never binds silently").toBe(false);
    const err = (inner as { readonly ok: false; readonly error: { readonly kind?: string; readonly cause?: string } }).error;
    expect(err.kind, "the arg-depth breach is a CodeToolError").toBe("code_tool");
    expect(err.cause, "with cause 'validation' (the code-driven tool-call args row)").toBe("validation");
  });

  it("a depth-5 `<name>(args)` argument is within the cap and the tool runs", async () => {
    let dispatched = false;
    const resolvePiTool = (name: string): PiToolDispatch => ({
      toolName: name,
      execute: (): Promise<AgentToolResultEnvelope> => {
        dispatched = true;
        return Promise.resolve({ content: [{ type: "text", text: "tool-out" }] });
      },
    });
    // params `{ deep: [[[1]]] }`: object(1) → array(2) → (3) → (4) → leaf 1(5) =
    // depth 5, exactly at the cap — the walk defers and the tool dispatches.
    const inner = (await runBody(
      producer({ resolvePiTool }),
      promptTheta(callExpr("emit", [objectExpr({ deep: nestedArray(3) })])),
    )) as ResultValue;

    expect(dispatched, "a within-cap argument defers past ceiling #4 and the tool runs").toBe(true);
    expect(inner.ok, "a within-cap tool call lowers to Ok(...)").toBe(true);
    expect(
      (inner as { readonly ok: true; readonly value: unknown }).value,
      "the lowered value is the tool's joined text",
    ).toBe("tool-out");
  });

  it("a wrapper object of shallow args each within the cap is NOT false-tripped", async () => {
    let dispatched = false;
    const resolvePiTool = (name: string): PiToolDispatch => ({
      toolName: name,
      execute: (): Promise<AgentToolResultEnvelope> => {
        dispatched = true;
        return Promise.resolve({ content: [{ type: "text", text: "tool-out" }] });
      },
    });
    // params `{ a: [1], b: [1], c: 1 }`: depth is the MAX over fields, not their
    // sum — object(1) → array(2) → leaf 1(3) = depth 3. Several shallow sibling
    // fields do not accumulate, and the walk runs over `params` (not an array
    // wrapper `[params]`, which would add a spurious level), so a legitimate
    // multi-field argument is not rejected.
    const inner = (await runBody(
      producer({ resolvePiTool }),
      promptTheta(
        callExpr("emit", [
          objectExpr({ a: nestedArray(1), b: nestedArray(1), c: numberExpr(1) }),
        ]),
      ),
    )) as ResultValue;

    expect(dispatched, "a wrapper of shallow within-cap args is not false-tripped; the tool runs").toBe(true);
    expect(inner.ok, "the multi-field within-cap tool call lowers to Ok(...)").toBe(true);
  });
});
