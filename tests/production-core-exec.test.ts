import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import {
  createProductionProducerDeps,
  type PiToolDispatch,
} from "../src/extension/production-loom-producer";
import type {
  LoomCompositionInput,
  ConversationBindInput,
} from "../src/extension/loom-composition-producer";
import { executeBody } from "../src/runtime/statement-executor";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";
import type { AgentToolResultEnvelope } from "../src/runtime/tool-call-execute";
import { makeOk, type LoomValue, type ResultValue } from "../src/runtime/value";
import type {
  CallExpr,
  Expr,
  LoomBody,
  ObjectFieldNode,
  Stmt,
} from "../src/parser/loom-document";
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

function objectExpr(typeName: string | null, fields: readonly ObjectFieldNode[]): Expr {
  return { kind: "object", typeName, fields, range: span() };
}

function letStmt(name: string, init: Expr): Stmt {
  return { kind: "let", name, mutable: false, annotation: null, init, range: span() };
}

function body(statements: readonly Stmt[], tail: Expr | null): LoomBody {
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
  ) => Promise<LoomCompositionInput | undefined>;
}

function producer(opts: ProducerOpts) {
  return createProductionProducerDeps({
    // `runBinder` routes the SLSH-1 no-params overflow note through
    // `pi.sendMessage` (loom-system-note channel); a noop stub satisfies it.
    pi: { sendMessage: () => {} } as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
    ...(opts.resolvePiTool !== undefined ? { resolvePiTool: opts.resolvePiTool } : {}),
    ...(opts.parseCallee !== undefined ? { parseCallee: opts.parseCallee } : {}),
  });
}

function promptLoom(loomBody: LoomBody, tools?: readonly string[]): LoomCompositionInput {
  const frontmatter: ParsedFrontmatter = {
    mode: "prompt",
    ...(tools !== undefined ? { tools } : {}),
  };
  return { slashName: "demo", sourcePath: "/looms/demo.loom", frontmatter, body: loomBody };
}

/**
 * Drive the loom body through the real prompt-mode binding, injecting
 * `paramBindings` as top-level local slots (the same install path the binder
 * threading uses), and return the FN-5 final value.
 */
async function runBody(
  deps: ReturnType<typeof producer>,
  loom: LoomCompositionInput,
  paramBindings?: ReadonlyMap<string, LoomValue>,
): Promise<{ readonly outcome: string; readonly value: LoomValue | undefined }> {
  const bindInput: ConversationBindInput = {
    loom,
    args: "",
    ctx: ctxDouble(),
    ...(paramBindings !== undefined ? { paramBindings } : {}),
  };
  const binding = deps.bindPromptConversation(bindInput);
  const execution = await executeBody(loom.body, binding.executeDeps);
  return { outcome: execution.outcome, value: execution.result.value };
}

// ===========================================================================
// Pure member / index / object evaluation on bound values.
// ===========================================================================

describe("core-exec — member / index / object-literal pure evaluation (production host)", () => {
  it("member access `s.label` on a bound object yields the field value (not null)", async () => {
    const params = new Map<string, LoomValue>([["s", { label: "positive", confidence: 0.9 }]]);
    const loom = promptLoom(body([], memberExpr(identExpr("s"), "label")));

    const r = await runBody(producer({}), loom, params);

    expect(r.outcome).toBe("success");
    expect(r.value, "s.label reads the bound object's field").toBe("positive");
  });

  it("index access `xs[1]` on a bound array yields the element", async () => {
    const params = new Map<string, LoomValue>([["xs", ["a", "b", "c"]]]);
    const loom = promptLoom(body([], indexExpr(identExpr("xs"), numberExpr("1"))));

    const r = await runBody(producer({}), loom, params);

    expect(r.outcome).toBe("success");
    expect(r.value, "xs[1] reads the second element").toBe("b");
  });

  it("object-literal construction `Point { x, y }` yields the plain field object (schema name not surfaced)", async () => {
    const loom = promptLoom(
      body(
        [],
        objectExpr("Point", [
          { name: "x", value: numberExpr("1") },
          { name: "y", value: numberExpr("2") },
        ]),
      ),
    );

    const r = await runBody(producer({}), loom);

    expect(r.outcome).toBe("success");
    expect(r.value, "the object literal builds a plain field object").toEqual({ x: 1, y: 2 });
  });

  it("member access chained after a let-bound object literal (`let p = Point{..}; p.x`)", async () => {
    const loom = promptLoom(
      body(
        [letStmt("p", objectExpr("Point", [{ name: "x", value: numberExpr("7") }]))],
        memberExpr(identExpr("p"), "x"),
      ),
    );

    const r = await runBody(producer({}), loom);

    expect(r.outcome).toBe("success");
    expect(r.value).toBe(7);
  });
});

// ===========================================================================
// `?` dispatch-through + unwrap end-to-end (loom-callable + tool call).
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
    const loom = promptLoom(body([letStmt("hits", tryExpr(grep))], identExpr("hits")), ["grep"]);

    const r = await runBody(producer({ resolvePiTool }), loom);

    expect(
      received,
      "V14g: the object-literal arg lowered to the real JSON params object (no longer {})",
    ).toEqual({ pattern: "TODO", path: "src" });
    expect(r.outcome, "the body succeeds — `?` unwrapped the tool's Ok(text)").toBe("success");
    expect(r.value, "`?` bound the unwrapped tool text, not null").toBe("42 matches");
  });

  // NOTE: the SUCCESSFUL `.loom`-callable invoke path (`sentiment(text)?`)
  // spawns a real isolated `AgentSession`, which needs a resolved model — only
  // feasible in the opt-in live suite (tests/live). The `?` dispatch-through +
  // unwrap over an invoke `Ok` value is covered synchronously against a host
  // double in tests/statement-executor.test.ts; the invoke-path routing + FN-5
  // failure surfacing is covered in tests/production-live-resolvers.test.ts.
});

// ===========================================================================
// Gap-2 (code-driven) — a RENAMED / HYPHENATED `.loom`-callable `<name>(args)`
// call classifies as loom-callable and resolves the callee path from the frozen
// snapshot (shared with the model-driven adapter), NOT a basename re-derivation.
// A `parseCallee` returning `undefined` surfaces Err(load_failure) WITHOUT
// spawning a session, so the routing + resolved calleePath are asserted
// synchronously (the successful spawn path needs the live suite).
// ===========================================================================

describe("core-exec — code-driven renamed/hyphenated `.loom` callee resolves (Gap-2)", () => {
  function loomWithCallable(
    loomBody: LoomBody,
    presentedName: string,
    calleePath: string,
  ): LoomCompositionInput {
    const entries = new Map([
      [
        presentedName,
        { kind: "loom" as const, mode: "subagent" as const, calleePath, callee: undefined },
      ],
    ]);
    const frontmatter = {
      mode: "prompt",
      tools: [calleePath === `./${presentedName}.loom` ? calleePath : `${calleePath} as ${presentedName}`],
    } as unknown as ParsedFrontmatter;
    return {
      slashName: "demo",
      sourcePath: "/looms/demo.loom",
      frontmatter,
      body: loomBody,
      callableSet: { entries },
    } as unknown as LoomCompositionInput;
  }

  async function driveCallAndCapture(
    presentedName: string,
    calleePath: string,
  ): Promise<{ readonly calls: string[]; readonly value: LoomValue | undefined }> {
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
    const loom = loomWithCallable(body([], call), presentedName, calleePath);
    const r = await runBody(deps, loom);
    return { calls, value: r.value };
  }

  it("a RENAMED call `foo({...})` resolves to `./c.loom` via the invoke path", async () => {
    const { calls, value } = await driveCallAndCapture("foo", "./c.loom");
    // Routed to the invoke path (loom-callable), reopening the REAL callee path.
    expect(calls, "parseCallee saw the renamed callee's real path").toContain("./c.loom");
    expect(calls).not.toContain("./foo.loom");
    // FN-5: the callee's top-level Result flows back (an Err(load_failure) here,
    // proving invoke routing rather than a Pi-tool execute mis-dispatch).
    expect((value as { ok?: boolean }).ok).toBe(false);
    expect((value as { error?: { cause?: string } }).error?.cause).toBe("load_failure");
  });

  it("a HYPHENATED call `my_tool({...})` resolves to `./my-tool.loom` via the invoke path", async () => {
    const { calls, value } = await driveCallAndCapture("my_tool", "./my-tool.loom");
    expect(calls, "parseCallee saw the hyphenated callee's real path").toContain("./my-tool.loom");
    expect(calls).not.toContain("./my_tool.loom");
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
    const loom = promptLoom(body([], identExpr("text")));
    const frontmatter = {
      ...loom.frontmatter,
      params: {
        fields: [{ wireName: "text", type: "string", hasDefault: false }],
        loweredSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
        defaultedFields: [],
      },
    } as unknown as ParsedFrontmatter;
    const withParams: LoomCompositionInput = { ...loom, frontmatter };

    const result = await deps.runBinder({ loom: withParams, args: "  hello world  ", ctx: ctxDouble() });

    expect(result.bound, "a single-string-bypass loom binds without a binder/LLM call").toBe(true);
    expect(result.args, "the sole string param is the trimmed slash text").toEqual({
      text: "hello world",
    });
  });

  it("a binder-supplied param reaches body scope so a param identifier resolves (not null)", async () => {
    const params = new Map<string, LoomValue>([["text", "hello world"]]);
    const loom = promptLoom(body([], identExpr("text")));

    const r = await runBody(producer({}), loom, params);

    expect(r.outcome).toBe("success");
    expect(r.value, "the top-level param reaches body scope").toBe("hello world");
  });

  it("a loom with no params binds with an empty args object (no slots)", async () => {
    const deps = producer({});
    const loom = promptLoom(body([], null));

    const result = await deps.runBinder({ loom, args: "anything", ctx: ctxDouble() });

    expect(result.bound).toBe(true);
    expect(result.args, "no params → empty bound args").toEqual({});
  });
});

// Reference `makeOk` so the Result-shape import is exercised by the type-check.
void makeOk;
void (undefined as unknown as ResultValue);
