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
import type { AgentToolResultEnvelope } from "../src/runtime/tool-call-execute";
import { makeOk, type ThetaValue, type ResultValue } from "../src/runtime/value";
import type {
  CallExpr,
  Expr,
  ThetaBody,
  ObjectFieldNode,
  Stmt,
} from "../src/parser/theta-document";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import type { SourceRange } from "../src/diagnostics/diagnostic";

// Core-execution deficiency fix — end-to-end through the REAL production host
// (`createEffectfulStatementHost` + the production `evaluatePureExpression` +
// the real `runInvokeChild` / `runCodeSideToolCall`), driven synchronously via
// the prompt-mode binding (no live session). These pin the previously-broken
// body evaluation: member / index / object-literal pure evaluation, `?`
// dispatch-through + unwrap, and object-literal tool-arg lowering (V14g).

function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

function callExpr(callee: string, args: readonly Expr[] = []): CallExpr {
  return { kind: "call", callee, args, range: span() };
}

function tryExpr(operand: Expr): Expr {
  return { kind: "try", operand, range: span() };
}

function identExpr(name: string): Expr {
  return { kind: "ident", name, range: span() };
}

function memberExpr(target: Expr, field: string): Expr {
  return { kind: "member", target, field, range: span() };
}

function indexExpr(target: Expr, index: Expr): Expr {
  return { kind: "index", target, index, range: span() };
}

function numberExpr(text: string): Expr {
  return { kind: "number", text, numericType: "integer", range: span() };
}

function stringExpr(value: string): Expr {
  return { kind: "string", value, range: span() };
}

function binaryExpr(op: string, left: Expr, right: Expr): Expr {
  return { kind: "binary", op, left, right, range: span() };
}

function objectExpr(typeName: string | null, fields: readonly ObjectFieldNode[]): Expr {
  return { kind: "object", typeName, fields, range: span() };
}

function letStmt(name: string, init: Expr): Stmt {
  return { kind: "let", name, mutable: false, annotation: null, init, range: span() };
}

function body(statements: readonly Stmt[], tail: Expr | null): ThetaBody {
  return { statements, tail };
}

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
  } as unknown as RuntimeRoot;
}

function ctxDouble(): ExtensionCommandContext {
  return {} as unknown as ExtensionCommandContext;
}

interface ProducerOpts {
  readonly resolvePiTool?: (name: string) => PiToolDispatch | undefined;
  readonly parseCallee?: (
    callerPath: string | undefined,
    calleePath: string,
  ) => Promise<ThetaCompositionInput | undefined>;
}

function producer(opts: ProducerOpts) {
  return createProductionProducerDeps({
    // `runBinder` routes the SLSH-1 no-params overflow note through
    // `pi.sendMessage` (theta-system-note channel); a noop stub satisfies it.
    pi: { sendMessage: () => {} } as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
    ...(opts.resolvePiTool !== undefined ? { resolvePiTool: opts.resolvePiTool } : {}),
    ...(opts.parseCallee !== undefined ? { parseCallee: opts.parseCallee } : {}),
  });
}

function promptTheta(thetaBody: ThetaBody, tools?: readonly string[]): ThetaCompositionInput {
  const frontmatter: ParsedFrontmatter = {
    mode: "prompt",
    ...(tools !== undefined ? { tools } : {}),
  };
  return { slashName: "demo", sourcePath: "/theta/demo.theta", frontmatter, body: thetaBody };
}

/**
 * Drive the theta body through the real prompt-mode binding, injecting
 * `paramBindings` as top-level local slots (the same install path the binder
 * threading uses), and return the FN-5 final value.
 */
async function runBody(
  deps: ReturnType<typeof producer>,
  theta: ThetaCompositionInput,
  paramBindings?: ReadonlyMap<string, ThetaValue>,
): Promise<{ readonly outcome: string; readonly value: ThetaValue | undefined }> {
  const bindInput: ConversationBindInput = {
    theta,
    args: "",
    ctx: ctxDouble(),
    ...(paramBindings !== undefined ? { paramBindings } : {}),
  };
  const binding = deps.bindPromptConversation(bindInput);
  const execution = await executeBody(theta.body, binding.executeDeps);
  return { outcome: execution.outcome, value: execution.result.value };
}

// ===========================================================================
// Pure member / index / object evaluation on bound values.
// ===========================================================================

describe("core-exec — member / index / object-literal pure evaluation (production host)", () => {
  it("member access `s.label` on a bound object yields the field value (not null)", async () => {
    const params = new Map<string, ThetaValue>([["s", { label: "positive", confidence: 0.9 }]]);
    const theta = promptTheta(body([], memberExpr(identExpr("s"), "label")));

    const r = await runBody(producer({}), theta, params);

    expect(r.outcome).toBe("success");
    expect(r.value, "s.label reads the bound object's field").toBe("positive");
  });

  it("index access `xs[1]` on a bound array yields the element", async () => {
    const params = new Map<string, ThetaValue>([["xs", ["a", "b", "c"]]]);
    const theta = promptTheta(body([], indexExpr(identExpr("xs"), numberExpr("1"))));

    const r = await runBody(producer({}), theta, params);

    expect(r.outcome).toBe("success");
    expect(r.value, "xs[1] reads the second element").toBe("b");
  });

  it("object-literal construction `Point { x, y }` yields the plain field object (schema name not surfaced)", async () => {
    const theta = promptTheta(
      body(
        [],
        objectExpr("Point", [
          { name: "x", value: numberExpr("1") },
          { name: "y", value: numberExpr("2") },
        ]),
      ),
    );

    const r = await runBody(producer({}), theta);

    expect(r.outcome).toBe("success");
    expect(r.value, "the object literal builds a plain field object").toEqual({ x: 1, y: 2 });
  });

  it("member access chained after a let-bound object literal (`let p = Point{..}; p.x`)", async () => {
    const theta = promptTheta(
      body(
        [letStmt("p", objectExpr("Point", [{ name: "x", value: numberExpr("7") }]))],
        memberExpr(identExpr("p"), "x"),
      ),
    );

    const r = await runBody(producer({}), theta);

    expect(r.outcome).toBe("success");
    expect(r.value).toBe(7);
  });
});

// ===========================================================================
// `?` dispatch-through + unwrap end-to-end (theta-callable + tool call).
// ===========================================================================

describe("core-exec — `?` unwrap over a real dispatched effect", () => {
  it("`let hits = grep({...})?` dispatches the Pi tool with real params and `?` unwraps Ok(text)", async () => {
    let received: unknown;
    const resolvePiTool = (name: string): PiToolDispatch => ({
      toolName: name,
      execute: (_id, params): Promise<AgentToolResultEnvelope> => {
        received = params;
        return Promise.resolve({ content: [{ type: "text", text: "42 matches" }] });
      },
    });
    // let hits = grep({ pattern: "TODO", path: "src" })?   then tail `hits`
    const grep = callExpr("grep", [
      objectExpr(null, [
        { name: "pattern", value: stringExpr("TODO") },
        { name: "path", value: stringExpr("src") },
      ]),
    ]);
    const theta = promptTheta(body([letStmt("hits", tryExpr(grep))], identExpr("hits")), ["grep"]);

    const r = await runBody(producer({ resolvePiTool }), theta);

    expect(
      received,
      "V14g: the object-literal arg lowered to the real JSON params object (no longer {})",
    ).toEqual({ pattern: "TODO", path: "src" });
    expect(r.outcome, "the body succeeds — `?` unwrapped the tool's Ok(text)").toBe("success");
    expect(r.value, "`?` bound the unwrapped tool text, not null").toBe("42 matches");
  });

  // NOTE: the SUCCESSFUL `.theta`-callable invoke path (`sentiment(text)?`)
  // spawns a real isolated `AgentSession`, which needs a resolved model — only
  // feasible in the opt-in live suite (tests/live). The `?` dispatch-through +
  // unwrap over an invoke `Ok` value is covered synchronously against a host
  // double in tests/statement-executor.test.ts; the invoke-path routing + FN-5
  // failure surfacing is covered in tests/production-live-resolvers.test.ts.
});

// ===========================================================================
// Gap-2 (code-driven) — a RENAMED / HYPHENATED `.theta`-callable `<name>(args)`
// call classifies as theta-callable and resolves the callee path from the frozen
// snapshot (shared with the model-driven adapter), NOT a basename re-derivation.
// A `parseCallee` returning `undefined` surfaces Err(load_failure) WITHOUT
// spawning a session, so the routing + resolved calleePath are asserted
// synchronously (the successful spawn path needs the live suite).
// ===========================================================================

describe("core-exec — code-driven renamed/hyphenated `.theta` callee resolves (Gap-2)", () => {
  function thetaWithCallable(
    thetaBody: ThetaBody,
    presentedName: string,
    calleePath: string,
  ): ThetaCompositionInput {
    const entries = new Map([
      [
        presentedName,
        { kind: "theta" as const, mode: "subagent" as const, calleePath, callee: undefined },
      ],
    ]);
    const frontmatter = {
      mode: "prompt",
      tools: [calleePath === `./${presentedName}.theta` ? calleePath : `${calleePath} as ${presentedName}`],
    } as unknown as ParsedFrontmatter;
    return {
      slashName: "demo",
      sourcePath: "/theta/demo.theta",
      frontmatter,
      body: thetaBody,
      callableSet: { entries },
    } as unknown as ThetaCompositionInput;
  }

  async function driveCallAndCapture(
    presentedName: string,
    calleePath: string,
  ): Promise<{ readonly calls: string[]; readonly value: ThetaValue | undefined }> {
    const calls: string[] = [];
    const deps = producer({
      parseCallee: (_caller, path) => {
        calls.push(path);
        // Callee "could not be loaded" → Err(InvokeInfraError{load_failure}); the
        // call still resolved THROUGH the invoke path (never the Pi-tool path).
        return Promise.resolve(undefined);
      },
    });
    const call = callExpr(presentedName, [objectExpr(null, [{ name: "a", value: stringExpr("A") }])]);
    const theta = thetaWithCallable(body([], call), presentedName, calleePath);
    const r = await runBody(deps, theta);
    return { calls, value: r.value };
  }

  it("a RENAMED call `foo({...})` resolves to `./c.theta` via the invoke path", async () => {
    const { calls, value } = await driveCallAndCapture("foo", "./c.theta");
    // Routed to the invoke path (theta-callable), reopening the REAL callee path.
    expect(calls, "parseCallee saw the renamed callee's real path").toContain("./c.theta");
    expect(calls).not.toContain("./foo.theta");
    // FN-5: the callee's top-level Result flows back (an Err(load_failure) here,
    // proving invoke routing rather than a Pi-tool execute mis-dispatch).
    expect((value as { ok?: boolean }).ok).toBe(false);
    expect((value as { error?: { cause?: string } }).error?.cause).toBe("load_failure");
  });

  it("a HYPHENATED call `my_tool({...})` resolves to `./my-tool.theta` via the invoke path", async () => {
    const { calls, value } = await driveCallAndCapture("my_tool", "./my-tool.theta");
    expect(calls, "parseCallee saw the hyphenated callee's real path").toContain("./my-tool.theta");
    expect(calls).not.toContain("./my_tool.theta");
    expect((value as { ok?: boolean }).ok).toBe(false);
    expect((value as { error?: { cause?: string } }).error?.cause).toBe("load_failure");
  });
});

// ===========================================================================
// Top-level `params:` reach body scope (binder → executor-env threading).
// ===========================================================================

describe("core-exec — top-level params reach body scope (single-string bypass)", () => {
  it("runBinder single-string bypass returns args threaded from the raw slash text", async () => {
    const deps = producer({});
    const theta = promptTheta(body([], identExpr("text")));
    const frontmatter = {
      ...theta.frontmatter,
      params: {
        fields: [{ wireName: "text", type: "string", hasDefault: false }],
        loweredSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
        defaultedFields: [],
      },
    } as unknown as ParsedFrontmatter;
    const withParams: ThetaCompositionInput = { ...theta, frontmatter };

    const result = await deps.runBinder({ theta: withParams, args: "  hello world  ", ctx: ctxDouble() });

    expect(result.bound, "a single-string-bypass theta binds without a binder/LLM call").toBe(true);
    expect(result.args, "the sole string param is the trimmed slash text").toEqual({
      text: "hello world",
    });
  });

  it("a binder-supplied param reaches body scope so a param identifier resolves (not null)", async () => {
    const params = new Map<string, ThetaValue>([["text", "hello world"]]);
    const theta = promptTheta(body([], identExpr("text")));

    const r = await runBody(producer({}), theta, params);

    expect(r.outcome).toBe("success");
    expect(r.value, "the top-level param reaches body scope").toBe("hello world");
  });

  it("a theta with no params binds with an empty args object (no slots)", async () => {
    const deps = producer({});
    const theta = promptTheta(body([], null));

    const result = await deps.runBinder({ theta, args: "anything", ctx: ctxDouble() });

    expect(result.bound).toBe(true);
    expect(result.args, "no params → empty bound args").toEqual({});
  });
});

// ===========================================================================
// RFC 0002 (docs/rfcs/0002-computed-tool-arguments.md) — computed field values
// in Pi-tool arguments, exercised end-to-end through the real production host.
//
// Behavior 1 (runtime): a computed field-value expression evaluates at call time
// and lowers to the concrete argument the tool receives — the exact RFC example
// `read({ path: base + "/findings/" + id + ".md" })`.
// Behavior 5 (runtime): field-value expressions evaluate left-to-right in source
// order before dispatch; an early-returning `?` inside a field expression aborts
// the call and the tool is NOT dispatched.
// ===========================================================================

describe("RFC 0002 — computed Pi-tool field values (runtime dispatch semantics)", () => {
  it("behavior 1: the RFC example `read({ path: base + \"/findings/\" + id + \".md\" })` dispatches the computed path", async () => {
    let received: unknown;
    const resolvePiTool = (name: string): PiToolDispatch => ({
      toolName: name,
      execute: (_id, params): Promise<AgentToolResultEnvelope> => {
        received = params;
        return Promise.resolve({ content: [{ type: "text", text: "contents" }] });
      },
    });
    // let body = read({ path: base + "/findings/" + id + ".md" })?  ; tail `body`
    const pathExpr = binaryExpr(
      "+",
      binaryExpr(
        "+",
        binaryExpr("+", identExpr("base"), stringExpr("/findings/")),
        identExpr("id"),
      ),
      stringExpr(".md"),
    );
    const read = callExpr("read", [objectExpr(null, [{ name: "path", value: pathExpr }])]);
    const theta = promptTheta(body([letStmt("body", tryExpr(read))], identExpr("body")), ["read"]);
    const params = new Map<string, ThetaValue>([
      ["base", "src"],
      ["id", "42"],
    ]);

    const r = await runBody(producer({ resolvePiTool }), theta, params);

    expect(
      received,
      "the computed field value lowered to the concatenated path string",
    ).toEqual({ path: "src/findings/42.md" });
    expect(r.outcome).toBe("success");
    expect(r.value, "`?` unwrapped the tool's Ok(text)").toBe("contents");
  });

  it("behavior 5: field-value expressions evaluate left-to-right, then the outer tool dispatches", async () => {
    const order: string[] = [];
    const resolvePiTool = (name: string): PiToolDispatch => ({
      toolName: name,
      execute: (_id, _params): Promise<AgentToolResultEnvelope> => {
        order.push(name);
        return Promise.resolve({ content: [{ type: "text", text: name }] });
      },
    });
    // sink({ a: first({})?, b: second({})?, c: third({})? })
    const field = (name: string): Expr => tryExpr(callExpr(name, [objectExpr(null, [])]));
    const sink = callExpr("sink", [
      objectExpr(null, [
        { name: "a", value: field("first") },
        { name: "b", value: field("second") },
        { name: "c", value: field("third") },
      ]),
    ]);
    const theta = promptTheta(body([], tryExpr(sink)), ["first", "second", "third", "sink"]);

    await runBody(producer({ resolvePiTool }), theta);

    expect(
      order,
      "field values dispatch left-to-right in source order, then the outer tool",
    ).toEqual(["first", "second", "third", "sink"]);
  });

  it("behavior 5: an early-returning `?` inside a field expression aborts the call — the tool is not dispatched", async () => {
    const calls: string[] = [];
    const resolvePiTool = (name: string): PiToolDispatch => ({
      toolName: name,
      execute: (_id, _params): Promise<AgentToolResultEnvelope> => {
        calls.push(name);
        // `probe` fails at dispatch (an `execute()` throw lowers to
        // Err(CodeToolError { cause: "execution" })), so the `?` on its
        // field-value use early-returns before `sink` is dispatched.
        if (name === "probe") {
          return Promise.reject(new Error("boom"));
        }
        return Promise.resolve({ content: [{ type: "text", text: "ok" }] });
      },
    });
    // sink({ x: probe({})? })
    const sink = callExpr("sink", [
      objectExpr(null, [{ name: "x", value: tryExpr(callExpr("probe", [objectExpr(null, [])])) }]),
    ]);
    const theta = promptTheta(body([], sink), ["probe", "sink"]);

    const r = await runBody(producer({ resolvePiTool }), theta);

    expect(calls, "the aborting field expression was evaluated (probe dispatched)").toContain("probe");
    expect(
      calls,
      "the tool is not dispatched when a field `?` early-returns",
    ).not.toContain("sink");
    expect(r.outcome, "the body fails via the propagated `?`").not.toBe("success");
  });
});

// Reference `makeOk` so the Result-shape import is exercised by the type-check.
void makeOk;
void (undefined as unknown as ResultValue);
