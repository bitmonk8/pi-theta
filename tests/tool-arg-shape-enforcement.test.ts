import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";
import type { ThetaSource } from "../src/lexer/lexer";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher, ParsedFrontmatter } from "../src/parser/frontmatter";
import {
  parseThetaDocument,
  type CallExpr,
  type Expr,
  type LetStmt,
  type ObjectExpr,
  type ParseThetaDocumentDeps,
  type Stmt,
  type ThetaBody,
  type ToolCallStmt,
} from "../src/parser/theta-document";
import type {
  CallableSetSnapshot,
  ResolvedCallable,
} from "../src/parser/callable-set";
import {
  executeBody,
  type CheckpointDescriptor,
  type ExecuteBodyDeps,
  type StatementEvalHost,
} from "../src/runtime/statement-executor";
import {
  buildEnvironment,
  LexicalEnvironment,
} from "../src/runtime/lexical-environment";
import type { OperationResult } from "../src/runtime/cancellation-core";
import type { Checkpoint, CheckpointSite } from "../src/seams/checkpoint";
import type {
  CommittedConversationMutator,
  CommittedSurface,
} from "../src/runtime/terminal-outcomes";
import type { ThetaValue } from "../src/runtime/value";
import {
  createProductionProducerDeps,
  type PiToolDispatch,
} from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { AgentToolResultEnvelope } from "../src/runtime/tool-call-execute";

// Bug 0003 — whole-object Pi-tool argument dispatches with dropped args instead
// of the documented parse rejection
// (docs/bugs/0003-tool-arg-shape-rule-not-enforced.md).
//
// Spec: grammar.md §"Pi-tool argument grammar" (`ToolArg ::= "{" (ToolField
// ("," ToolField)* ","?)? "}"` — the single positional argument of a Pi-tool
// call is a bare object literal written inline; `read(args)` does not satisfy
// `ToolArg`); diagnostics.md row `theta/parse/tool-arg-not-object-literal`
// (error, parse phase, message `Pi tool '<name>' argument must be written
// inline as a bare object literal { ... }; a let-bound value cannot supply the
// field shape`); code-registry-parse.md same row (the `read(args)` let-bound
// triggering case); RFC 0002 §Proposal ("Shape rule unchanged" — field VALUES
// are full expressions, the argument SHAPE stays an inline bare object
// literal).
//
// The defect (0.12.0): `checkToolCallArguments` (src/runtime/tool-call.ts)
// implements the shape check but has NO src/ caller — `parseThetaDocument`
// never emits `theta/parse/tool-arg-not-object-literal` — and the two runtime
// lowerings silently degrade a non-object first argument to empty params:
//   - `preEvaluateToolArgs` (src/runtime/statement-executor.ts, NOT exported;
//     reached here through its only exported caller, `executeBody`) returns
//     `{ ok: true, args: undefined }` when `expr.args[0].kind !== "object"`;
//   - `lowerToolCallParams` (src/extension/production-theta-producer.ts, NOT
//     exported; reached here through `createProductionProducerDeps` →
//     `bindPromptConversation` → the exported `StatementEvalHost.runEffect`
//     surface with `evaluatedToolArgs === undefined`) returns `{}` when
//     `first.kind !== "object"`.
// The dispatch then proceeds with `{}` — the author's argument object is
// silently dropped and the failure is misattributed to the tool.
//
// FIXED CONTRACT pinned by this file (RED now, GREEN after the fix):
//   (A) parse layer — `parseThetaDocument` emits exactly one
//       `theta/parse/tool-arg-not-object-literal` (severity "error", the exact
//       registered message with the tool name substituted) per Pi-tool call
//       site whose first argument is not an inline bare object literal, with
//       `range` on the offending ARGUMENT expression node (not the whole call,
//       not the statement, not line 1).
//   (B) runtime defect layer — both lowerings treat a non-object FIRST
//       argument (when at least one argument exists) as an internal DEFECT: a
//       thrown Error (to the `theta/runtime/internal-error` surface, like
//       `ThetaFnArityError` / `ToolReturnShapeDefectError`) whose message
//       (1) names the tool, (2) matches /defect|internal/i, and (3) names the
//       non-object(-literal) argument-shape violation
//       (/object.?literal|non-object/i) — instead of silently lowering to
//       `{}` / `args: undefined`. Zero-argument calls and `.theta`-callable
//       calls are NOT defects (see the investigation notes below).
//
// INVESTIGATION NOTES (probed against the current tree, 0.15.0):
//   - Grammar admission: exactly one inline bare object literal per `ToolArg`;
//     multi-arg is `theta/parse/tool-arg-arity` (registered trigger: "more
//     than one positional argument", implemented as `positionalCount > 1` in
//     `checkToolCallArguments`).
//   - ZERO-argument Pi-tool calls (`read()` / `read()?`) are currently
//     ACCEPTED by `parseThetaDocument` with NO diagnostic; the arity check is
//     `> 1` and the registry's arity trigger is "more than one", so zero-arg
//     is not an arity violation. PINNED below as a control: zero-arg stays
//     accepted (no new diagnostic) and the runtime keeps lowering it to `{}`
//     without throwing.
//   - Computed field VALUES are legal per RFC 0002: `read({ path: p })` with a
//     let-bound `p` produces NO diagnostic (control below).
//   - A bare (non-schema) object literal let (`let args = { ... }`) is itself
//     `theta/parse/bare-object-literal` (S4 FIND-S4-6), so the schema-
//     constructor form from the bug doc is the canonical let-bound repro; the
//     plain-object variant is omitted.
//   - Every non-object first-argument shape below was probed to parse cleanly
//     as a call argument today (no pre-existing diagnostic dies earlier):
//     identifier `read(args)`, string literal `read("x")`, call expression
//     `read(mk())` (with `fn mk() { "x" }` — NB `fn mk() { { path: "x" } }`
//     trips the unrelated `theta/parse/bare-object-literal` inside the fn
//     body, so the string-returning fn is used), member access `read(a.b)`.
//     The probed argument-node ranges (1-indexed, end-exclusive columns) are
//     pinned per cell.

// ===========================================================================
// Parse-layer harness (the makeDeps pattern from
// e2e-s4-never-emitted-diagnostics.test.ts).
// ===========================================================================

const SHAPE_CODE = "theta/parse/tool-arg-not-object-literal";
const ARITY_CODE = "theta/parse/tool-arg-arity";
const FILE = "bug0003.theta";

function makeDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = {
    resolve: (): "resolved" => "resolved",
  };
  return { systemNote, modelMatcher };
}

function diagsOf(src: string): readonly Diagnostic[] {
  const source: ThetaSource = { path: FILE, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, makeDeps()).diagnostics;
}

function withCode(diags: readonly Diagnostic[], code: string): Diagnostic[] {
  return diags.filter((d) => d.code === code);
}

/** The frontmatter prelude — occupies source lines 1–5. */
const FM = "---\nmode: prompt\ntools:\n  - read\n---\n";

/** The exact registered message for a tool `<name>` (diagnostics.md:94). */
function shapeMessage(name: string): string {
  return `Pi tool '${name}' argument must be written inline as a bare object literal { ... }; a let-bound value cannot supply the field shape`;
}

/** A 1-indexed, end-exclusive-column source range literal. */
function range(
  startLine: number,
  startColumn: number,
  endLine: number,
  endColumn: number,
): SourceRange {
  return {
    start: { line: startLine, column: startColumn },
    end: { line: endLine, column: endColumn },
  };
}

/**
 * Assert the single argument-shape diagnostic for one red parse cell: exactly
 * one `theta/parse/tool-arg-not-object-literal`, severity "error", the exact
 * registered message, and the range pinned to the offending ARGUMENT
 * expression node (probed from the AST — see the per-cell line/column notes).
 */
function expectShapeDiagnostic(
  diags: readonly Diagnostic[],
  toolName: string,
  argRange: SourceRange,
): void {
  const shape = withCode(diags, SHAPE_CODE);
  expect(
    shape,
    `PRIMARY (bug 0003): parseThetaDocument must emit exactly one ${SHAPE_CODE} for a non-object-literal Pi-tool argument`,
  ).toHaveLength(1);
  const d = shape[0]!;
  expect(d.severity, "the registered severity is error").toBe("error");
  expect(d.message, "the exact registered message with the tool name substituted").toBe(
    shapeMessage(toolName),
  );
  expect(d.file).toBe(FILE);
  // The range targets the offending ARGUMENT expression node — not the whole
  // call, not the whole statement, and not line 1.
  expect(d.range, "the diagnostic range is the argument expression node's range").toEqual(argRange);
}

describe("bug 0003 (A) parse layer — theta/parse/tool-arg-not-object-literal fires from parseThetaDocument", () => {
  it("RED (i): the bug-doc repro — a schema-constructor let-bound object passed whole in `let res = read(args)?`", () => {
    // Source lines: 1–5 FM, 6 schema, 7 let args, 8 the call, 9 tail.
    // `let res = read(args)?` — `args` ident node spans 8:16–8:20 (probed).
    const src =
      FM +
      'schema Args { path: string }\n' +
      'let args = Args { path: "x" }\n' +
      "let res = read(args)?\n" +
      "res";
    const diags = diagsOf(src);
    expectShapeDiagnostic(diags, "read", range(8, 16, 8, 20));
    // Precision guard: the rejection is the shape code alone, not an error
    // cascade (this source parses with zero diagnostics on the current tree).
    expect(
      diags.filter((d) => d.severity === "error" && d.code !== SHAPE_CODE),
      "no other error-severity diagnostic accompanies the shape rejection",
    ).toEqual([]);
  });

  it("RED (v-a): the same let-bound identifier in bare statement position `read(args)?`", () => {
    // Line 8 is `read(args)?` — `args` ident node spans 8:6–8:10.
    const src =
      FM +
      'schema Args { path: string }\n' +
      'let args = Args { path: "x" }\n' +
      "read(args)?";
    expectShapeDiagnostic(diagsOf(src), "read", range(8, 6, 8, 10));
  });

  it('RED (v-b): a string-literal first argument `read("x")?`', () => {
    // Line 6 is `let res = read("x")?` — the `"x"` string node spans 6:16–6:19
    // (probed; parses cleanly as a call argument today).
    const src = FM + 'let res = read("x")?\nres';
    expectShapeDiagnostic(diagsOf(src), "read", range(6, 16, 6, 19));
  });

  it("RED (v-c): a call-expression first argument `read(mk())?`", () => {
    // Line 6 `fn mk() { "x" }`, line 7 `let res = read(mk())?` — the `mk()`
    // call node spans 7:16–7:20 (probed; a string-returning fn body is used
    // because a bare `{ ... }` fn tail trips the unrelated
    // theta/parse/bare-object-literal).
    const src = FM + 'fn mk() { "x" }\nlet res = read(mk())?\nres';
    expectShapeDiagnostic(diagsOf(src), "read", range(7, 16, 7, 20));
  });

  it("RED (v-d): a member-access first argument `read(a.b)?`", () => {
    // Lines 6–8 declare schemas + `let a`, line 9 `let res = read(a.b)?` —
    // the `a.b` member node spans 9:16–9:19 (probed).
    const src =
      FM +
      "schema Inner { path: string }\n" +
      "schema Outer { b: Inner }\n" +
      'let a = Outer { b: Inner { path: "x" } }\n' +
      "let res = read(a.b)?\n" +
      "res";
    expectShapeDiagnostic(diagsOf(src), "read", range(9, 16, 9, 19));
  });

  it('RED (v-e): a NAMED schema-constructor first argument `read(Args { path: "x" })?`', () => {
    // Lines 1–5 FM, 6 schema, 7 `let res = read(Args { path: "x" })?` — the
    // `Args { path: "x" }` ctor node spans 7:16–7:34 (probed). `ToolArg` is a
    // BARE object literal: a named schema constructor is an object node with
    // `typeName !== null`, the walk's otherwise-untested conjunct.
    const src =
      FM +
      'schema Args { path: string }\n' +
      'let res = read(Args { path: "x" })?\n' +
      "res";
    const diags = diagsOf(src);
    expectShapeDiagnostic(diags, "read", range(7, 16, 7, 34));
    // Precision guard: the schema is declared and the ctor fields match, so
    // the ctor itself is otherwise legal — the shape code fires alone, not as
    // part of an error cascade.
    expect(
      diags.filter((d) => d.severity === "error" && d.code !== SHAPE_CODE),
      "no other error-severity diagnostic accompanies the shape rejection",
    ).toEqual([]);
  });
});

describe("bug 0003 (A) parse layer — controls (green now, green after)", () => {
  it("CONTROL (ii): a local `fn` call with a variable argument gets NO tool-arg diagnostic (`myfn` is not in tools:)", () => {
    const src =
      FM +
      'schema Args { path: string }\n' +
      "fn myfn(x) { x }\n" +
      'let args = Args { path: "x" }\n' +
      "let res = myfn(args)\n" +
      "res";
    const diags = diagsOf(src);
    expect(withCode(diags, SHAPE_CODE), "a plain fn call is not a Pi-tool call site").toEqual([]);
    expect(
      diags.filter((d) => d.severity === "error"),
      "the local-fn call parses without any error",
    ).toEqual([]);
  });

  it("CONTROL (iii-a): an inline bare object literal `read({ path: \"x\" })?` is the accepted shape", () => {
    const diags = diagsOf(FM + 'let res = read({ path: "x" })?\nres');
    expect(withCode(diags, SHAPE_CODE)).toEqual([]);
    expect(diags.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("CONTROL (iii-b): RFC 0002 computed field values — `read({ path: p })` with a let-bound `p` stays accepted", () => {
    const diags = diagsOf(FM + 'let p = "x"\nlet res = read({ path: p })?\nres');
    expect(
      withCode(diags, SHAPE_CODE),
      "the shape rule constrains the argument, not its field values (RFC 0002 §Proposal)",
    ).toEqual([]);
    expect(diags.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("CONTROL (iv): zero-argument Pi-tool calls stay accepted — `read()?` and bare `read()`", () => {
    // Finding (iv): zero-arg is currently accepted by parseThetaDocument with
    // NO diagnostic. The arity check is `positionalCount > 1` (registry
    // trigger: "more than one positional argument"), and the shape rule only
    // constrains an argument that EXISTS. Pinned: no new diagnostic may appear
    // for zero-arg call sites when enforcement lands.
    for (const body of ["let res = read()?\nres", "read()"]) {
      const diags = diagsOf(FM + body);
      expect(withCode(diags, SHAPE_CODE), `no shape diagnostic for: ${body}`).toEqual([]);
      expect(withCode(diags, ARITY_CODE), `no arity diagnostic for: ${body}`).toEqual([]);
      expect(
        diags.filter((d) => d.severity === "error"),
        `zero-arg call parses clean: ${body}`,
      ).toEqual([]);
    }
  });
});

// ===========================================================================
// Runtime defect layer — synthetic-AST helpers (the statement-executor.test.ts
// construction pattern).
// ===========================================================================

function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

function stringExpr(value: string): Expr {
  return { kind: "string", value, range: span() };
}

function identExpr(name: string): Expr {
  return { kind: "ident", name, range: span() };
}

function objectExpr(fields: readonly { name: string; value: Expr }[]): ObjectExpr {
  return { kind: "object", typeName: null, fields, range: span() };
}

function callExpr(callee: string, args: readonly Expr[] = []): CallExpr {
  return { kind: "call", callee, args, range: span() };
}

function toolCallStmt(callee: string, args: readonly Expr[] = []): ToolCallStmt {
  return { kind: "tool-call", call: callExpr(callee, args), range: span() };
}

function letStmt(name: string, init: Expr): LetStmt {
  return { kind: "let", name, mutable: false, annotation: null, init, range: span() };
}

function body(statements: readonly Stmt[], tail: Expr | null = null): ThetaBody {
  return { statements, tail };
}

/**
 * Assert one runtime-defect rejection (the bug 0003 fixed contract, layer B):
 * the promise must reject with an Error whose message names the tool, names
 * the defect (/defect|internal/i), and names the non-object(-literal) shape
 * violation. The PRIMARY red assertion is the rejection itself — on the
 * current tree both lowerings silently degrade and the promise resolves.
 */
async function expectShapeDefectRejection(p: Promise<unknown>, toolName: string): Promise<void> {
  await expect(
    p,
    "PRIMARY (bug 0003): a non-object first argument reaching the runtime lowering must throw as an internal defect, not silently lower to {} / undefined",
  ).rejects.toThrow(/defect|internal/i);
  await expect(p, "the defect message names the offending tool").rejects.toThrow(
    new RegExp(toolName),
  );
  await expect(p, "the defect message names the non-object-literal shape violation").rejects.toThrow(
    /object.?literal|non-object/i,
  );
}

// --- Executor-level harness (preEvaluateToolArgs via exported executeBody) --

const SITE: CheckpointSite = { file: FILE, line: 1, column: 1 };

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

class NoopMutator implements CommittedConversationMutator {
  truncate(_surfaceId: string): void {}
  rewrite(_surfaceId: string): void {}
  replace(_surfaceId: string): void {}
  remove(_surfaceId: string): void {}
  injectCompensatingTurn(_surface: CommittedSurface): void {}
}

/**
 * A recording `StatementEvalHost` double (the ClassifyingHost pattern from
 * statement-executor.test.ts): records each dispatched callee and the
 * `evaluatedToolArgs` its `runEffect` was handed, classifies callees by a
 * configured map (default `pi-tool`), and evaluates the bounded pure forms the
 * cells need (string / number / ident / object).
 */
class RecordingShapeHost implements StatementEvalHost {
  readonly dispatched: string[] = [];
  readonly argsSeen: (Record<string, ThetaValue> | undefined)[] = [];
  readonly #kinds: ReadonlyMap<string, "pi-tool" | "theta-callable">;

  constructor(kinds: ReadonlyMap<string, "pi-tool" | "theta-callable"> = new Map()) {
    this.#kinds = kinds;
  }

  evaluatePure(expr: Expr, env: LexicalEnvironment): ThetaValue {
    switch (expr.kind) {
      case "string":
        return expr.value;
      case "number":
        return Number(expr.text);
      case "ident": {
        const r = env.resolve(expr.name);
        return r.arm === "local" ? r.value ?? null : null;
      }
      case "object": {
        const obj: Record<string, ThetaValue> = {};
        for (const field of expr.fields) {
          obj[field.name] = this.evaluatePure(field.value, env);
        }
        return obj;
      }
      default:
        return null;
    }
  }

  checkpointFor(expr: Expr): CheckpointDescriptor | null {
    if (expr.kind === "call" || expr.kind === "query" || expr.kind === "invoke") {
      return { kind: "tool-call", site: SITE };
    }
    return null;
  }

  classifyCall(expr: CallExpr): "pi-tool" | "theta-callable" {
    return this.#kinds.get(expr.callee) ?? "pi-tool";
  }

  runEffect(
    expr: Expr,
    _env: LexicalEnvironment,
    evaluatedToolArgs?: Record<string, ThetaValue>,
  ): Promise<OperationResult> {
    if (expr.kind === "call") {
      this.dispatched.push(expr.callee);
      this.argsSeen.push(evaluatedToolArgs);
    }
    return Promise.resolve({ ok: true, value: null });
  }
}

function executorDeps(host: StatementEvalHost): ExecuteBodyDeps {
  return {
    env: buildEnvironment({ body: { statements: [], tail: null } }),
    host,
    checkpoint: NOOP_CHECKPOINT,
    signal: new AbortController().signal,
    mutator: new NoopMutator(),
    mode: "prompt",
    file: FILE,
  };
}

describe("bug 0003 (B) runtime defect layer — preEvaluateToolArgs (via its exported caller executeBody)", () => {
  // `preEvaluateToolArgs` is module-private in src/runtime/statement-executor.ts
  // (not exported); its only exported reach is `executeBody`, which routes every
  // checkpointed call expression through it before `runEffect`.

  it("RED (vi): a Pi-tool call with an identifier first argument is an internal defect, not `args: undefined`", async () => {
    const host = new RecordingShapeHost();
    // The bug-doc runtime shape: an object-VALUED binding passed whole. The
    // lowering keys on the argument NODE KIND ("ident", not "object"), so the
    // bound value is genuinely an object here — exactly the arg-dropping case.
    const program = body([
      letStmt("args", objectExpr([{ name: "path", value: stringExpr("x") }])),
      toolCallStmt("read", [identExpr("args")]),
    ]);

    await expectShapeDefectRejection(executeBody(program, executorDeps(host)), "read");
    // The defect throw pre-empts dispatch: the tool must never be handed the
    // silently-degraded `undefined` args (current tree: dispatched with
    // `argsSeen === [undefined]`).
    expect(host.dispatched, "the outer tool call must not dispatch").toEqual([]);
  });

  it("CONTROL (viii-a): an inline object-literal argument still pre-evaluates and threads concrete args", async () => {
    const host = new RecordingShapeHost();
    const program = body([
      toolCallStmt("store", [objectExpr([{ name: "path", value: stringExpr("x") }])]),
    ]);

    const r = await executeBody(program, executorDeps(host));

    expect(r.outcome).toBe("success");
    expect(host.dispatched).toEqual(["store"]);
    expect(host.argsSeen, "the pre-evaluated field object reaches runEffect").toEqual([
      { path: "x" },
    ]);
  });

  it("CONTROL (viii-b): a ZERO-argument Pi-tool call must NOT throw (parse admits `read()` — finding iv)", async () => {
    const host = new RecordingShapeHost();
    const program = body([toolCallStmt("read", [])]);

    const r = await executeBody(program, executorDeps(host));

    expect(r.outcome, "zero-arg dispatch stays legal").toBe("success");
    expect(host.dispatched).toEqual(["read"]);
    expect(host.argsSeen, "no pre-evaluated args for a zero-arg call").toEqual([undefined]);
  });

  it("CONTROL (viii-e): a `.theta`-callable call with an identifier argument is NOT a defect (invoke path lowers its own args)", async () => {
    // The RFC 0002 / Finding #3 skip: a `.theta`-callable call routes through
    // the invoke trampoline, which re-lowers its argument itself — `summarise(x)`
    // with a whole bound value is legal for a `.theta` callee (the ToolArg shape
    // rule is Pi-tool-only). The defect check must sit AFTER the theta-callable
    // skip, so this call still dispatches with `evaluatedToolArgs === undefined`.
    const host = new RecordingShapeHost(new Map([["summarise", "theta-callable"]]));
    const program = body([
      letStmt("x", stringExpr("v")),
      toolCallStmt("summarise", [identExpr("x")]),
    ]);

    const r = await executeBody(program, executorDeps(host));

    expect(r.outcome, "a .theta-callable whole-value argument stays legal").toBe("success");
    expect(host.dispatched).toEqual(["summarise"]);
    expect(host.argsSeen).toEqual([undefined]);
  });
});

// --- Producer-level harness (lowerToolCallParams via the exported
// createProductionProducerDeps → bindPromptConversation → StatementEvalHost
// surface, the callable-set-runtime-enforcement.test.ts pattern) -------------

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

function producer() {
  return createProductionProducerDeps({
    pi: {} as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
  });
}

/** A recording `pi-tool` snapshot entry capturing every dispatched params object. */
function recordingPiTool(toolName: string): {
  readonly entry: ResolvedCallable;
  readonly params: unknown[];
} {
  const params: unknown[] = [];
  const dispatch: PiToolDispatch = {
    toolName,
    execute: (_id: string, p: unknown): Promise<AgentToolResultEnvelope> => {
      params.push(p);
      return Promise.resolve({ content: [{ type: "text", text: `${toolName}-out` }] });
    },
  };
  return { entry: { kind: "pi-tool", toolDefinition: dispatch }, params };
}

function snapshot(
  entries: readonly (readonly [string, ResolvedCallable])[],
): CallableSetSnapshot {
  return Object.freeze({ entries: new Map(entries) });
}

/** A prompt-mode theta over a callable-set snapshot. */
function thetaWithSet(programBody: ThetaBody, callableSet: CallableSetSnapshot): ThetaCompositionInput {
  const frontmatter: ParsedFrontmatter = { mode: "prompt" };
  return {
    slashName: "bug0003",
    sourcePath: "/theta/bug0003.theta",
    frontmatter,
    body: programBody,
    callableSet,
  };
}

function bind(theta: ThetaCompositionInput) {
  const bindInput: ConversationBindInput = { theta, args: "", ctx: ctxDouble() };
  return producer().bindPromptConversation(bindInput);
}

describe("bug 0003 (B) runtime defect layer — lowerToolCallParams (via the exported bindPromptConversation host surface)", () => {
  // `lowerToolCallParams` is module-private in
  // src/extension/production-theta-producer.ts (not exported). Its smallest
  // exported reach is `createProductionProducerDeps(...).bindPromptConversation`
  // → `binding.executeDeps.host.runEffect(expr, env, undefined)`: calling the
  // host's `runEffect` DIRECTLY with `evaluatedToolArgs === undefined` bypasses
  // the executor's `preEvaluateToolArgs`, so the ordinary-path
  // `evaluatedToolArgs ?? lowerToolCallParams(expr, env)` lowering is isolated.

  it("RED (vii): a non-object first argument on the ordinary lowering path is an internal defect, not `{}`", async () => {
    const read = recordingPiTool("read");
    const binding = bind(thetaWithSet(body([]), snapshot([["read", read.entry]])));
    const expr = callExpr("read", [identExpr("args")]);

    const p = binding.executeDeps.host.runEffect(expr, binding.executeDeps.env, undefined);

    await expectShapeDefectRejection(p, "read");
    // Current tree: the tool EXECUTED with the silently-degraded `{}` params.
    // The fixed contract: the defect throw pre-empts dispatch entirely.
    expect(read.params, "the tool must never execute with degraded {} params").toEqual([]);
  });

  it("RED (vii-integration): the full bug-repro body — `let args = {...}` then `read(args)` — rejects instead of dispatching {}", async () => {
    // The end-to-end runtime witness of the bug doc's live repro (parse layer
    // bypassed via synthetic AST): on the current tree the body completes and
    // the tool executes with `{}` — the author's argument object silently
    // dropped. After the fix, EITHER lowering (executor pre-evaluation or the
    // ordinary producer path) must fail loudly as a defect before dispatch.
    const read = recordingPiTool("read");
    const program = body(
      [letStmt("args", objectExpr([{ name: "path", value: stringExpr("x") }]))],
      callExpr("read", [identExpr("args")]),
    );
    const binding = bind(thetaWithSet(program, snapshot([["read", read.entry]])));

    await expectShapeDefectRejection(executeBody(program, binding.executeDeps), "read");
    expect(read.params, "the tool must never execute with degraded {} params").toEqual([]);
  });

  it("CONTROL (viii-c): an object-literal argument still lowers its fields to the params object", async () => {
    const read = recordingPiTool("read");
    const binding = bind(thetaWithSet(body([]), snapshot([["read", read.entry]])));
    const expr = callExpr("read", [objectExpr([{ name: "path", value: stringExpr("x") }])]);

    const r = await binding.executeDeps.host.runEffect(expr, binding.executeDeps.env, undefined);

    expect(r.ok, "the object-literal call dispatches cleanly").toBe(true);
    expect(read.params, "the lowered field values are the params object").toEqual([
      { path: "x" },
    ]);
  });

  it("CONTROL (viii-d): a ZERO-argument call still lowers to empty params (parse admits `read()` — finding iv)", async () => {
    const read = recordingPiTool("read");
    const binding = bind(thetaWithSet(body([]), snapshot([["read", read.entry]])));

    const r = await binding.executeDeps.host.runEffect(
      callExpr("read", []),
      binding.executeDeps.env,
      undefined,
    );

    expect(r.ok, "zero-arg dispatch stays legal").toBe(true);
    expect(read.params, "a zero-arg call lowers to {} — this must NOT become a defect").toEqual([{}]);
  });
});
