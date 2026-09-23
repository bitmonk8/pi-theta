import {
  callExpr,
  identExpr,
  numberExpr,
  objectExpr,
  recordingPiToolResolver,
  span,
} from "./helpers/tool-call-dispatch-harness";
import { SEAM_NOOP_CHECKPOINT as NOOP_CHECKPOINT } from "./helpers/invoke-seam-scaffold";
import { rootWith } from "./helpers/fixture-dispatch-harness";
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
import { makeOk, type ThetaValue } from "../src/runtime/value";
import type {
  Block,
  Expr,
  FnDecl,
  ThetaBody,
  MatchArmNode,
  MatchExpr,
  PatternNode,
  ResultCtorExpr,
  Stmt,
} from "../src/parser/theta-document";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";

// V20e-T — Pure/async evaluator unification (tests).
//
// The producer's `evaluatePureExpression` is a PARTIAL evaluator parallel to the
// V19c statement-executor: its `match`/effect cases fall to a `default: return
// null`. A control form (a nested `match`) or an effectful expression in a pure
// sub-expression position — e.g. a `match` arm body, which `evalMatch` evaluates
// via `deps.host.evaluatePure(arm.body, …)` — therefore returns the inert `null`
// safety net instead of being routed through the real executor.
//
// These tests drive the REAL production dispatch (the prompt-mode binding +
// `executeBody`, exactly as the shipped host does) and RED today because those
// pure-position forms hit the partial evaluator's `default: return null` rather
// than the V19c executor. The paired V20e implementation retires that safety net
// and makes the single executor the one evaluation path.

function stringExpr(value: string): Expr {
  return { kind: "string", value, range: span() };
}

function resultCtorExpr(ctor: "Ok" | "Err", arg: Expr): ResultCtorExpr {
  return { kind: "result-ctor", ctor, arg, range: span() };
}

function matchArm(pattern: PatternNode, body: Expr): MatchArmNode {
  return { pattern, body };
}

function matchExpr(scrutinee: Expr, arms: readonly MatchArmNode[]): MatchExpr {
  return { kind: "match", scrutinee, arms, range: span() };
}

function block(statements: readonly Stmt[], tail: Expr | null): Block {
  return { statements, tail };
}

function fnDecl(name: string, params: FnDecl["params"], fnBody: Block): FnDecl {
  return { kind: "fn", name, params, returnType: null, body: fnBody, range: span() };
}

function body(statements: readonly Stmt[], tail: Expr | null): ThetaBody {
  return { statements, tail };
}

function ctxDouble(): ExtensionCommandContext {
  return {} as unknown as ExtensionCommandContext;
}

interface ProducerOpts {
  readonly resolvePiTool?: (name: string) => PiToolDispatch | undefined;
}

function producer(opts: ProducerOpts) {
  return createProductionProducerDeps({
    pi: {} as unknown as ExtensionAPI,
    root: rootWith(NOOP_CHECKPOINT),
    modelRegistry: {} as unknown as ModelRegistry,
    ...(opts.resolvePiTool !== undefined ? { resolvePiTool: opts.resolvePiTool } : {}),
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
 * Drive the theta body through the REAL prompt-mode binding (the production host
 * + `executeBody`) and return the FN-5 terminal outcome + final value.
 */
async function runBody(
  deps: ReturnType<typeof producer>,
  theta: ThetaCompositionInput,
): Promise<{ readonly outcome: string; readonly value: ThetaValue | undefined }> {
  const bindInput: ConversationBindInput = { theta, args: "", ctx: ctxDouble() };
  const binding = deps.bindPromptConversation(bindInput);
  const execution = await executeBody(theta.body, binding.executeDeps);
  return { outcome: execution.outcome, value: execution.result.value };
}

// ===========================================================================
// Bullet 1 — a nested `match` in a `match` arm body evaluates to the arm's
// result through the production dispatch (not `null`).
// ===========================================================================

describe("V20e-T pure/async unification — nested match in a match arm body", () => {
  it("a nested `match` in a `match` arm body evaluates to the arm's result, not null", async () => {
    // match Ok(1) {
    //   Ok(x) => match x { 1 => "one", _ => "other" }
    // }
    const inner = matchExpr(identExpr("x"), [
      matchArm({ kind: "literal", value: 1 }, stringExpr("one")),
      matchArm({ kind: "wildcard" }, stringExpr("other")),
    ]);
    const outer = matchExpr(resultCtorExpr("Ok", numberExpr("1")), [
      matchArm(
        { kind: "constructor", ctor: "Ok", inner: { kind: "identifier", name: "x" } },
        inner,
      ),
    ]);
    const theta = promptTheta(body([], outer));

    const r = await runBody(producer({}), theta);

    expect(r.outcome).toBe("success");
    // Reds today: the outer arm body is a nested `match`, evaluated through the
    // partial pure evaluator's `default: return null` rather than the executor's
    // real `match` dispatch, so the arm's result is lost and the body yields
    // `null` instead of the inner arm's `"one"`.
    expect(r.value, "the nested match resolves to the inner arm's result through the executor").toBe(
      "one",
    );
  });
});

// ===========================================================================
// Bullet 2 — an effectful expression (here a user-`fn` call whose body dispatches
// an effect) nested in a pure sub-expression position resolves through the V19c
// executor rather than the partial evaluator's `null` safety net.
// ===========================================================================

describe("V20e-T pure/async unification — effectful expression in a pure sub-expression position", () => {
  it("a user-`fn` call whose body dispatches an effect, in a match arm body, resolves through the executor (not null)", async () => {
    // fn search(): Result { grep({ pattern: "TODO", path: "src" }) }
    // match Ok(1) { _ => search() }
    const grep = callExpr("grep", [
      objectExpr(null, [
        { name: "pattern", value: stringExpr("TODO") },
        { name: "path", value: stringExpr("src") },
      ]),
    ]);
    const search = fnDecl("search", [], block([], grep));
    const outer = matchExpr(resultCtorExpr("Ok", numberExpr("1")), [
      matchArm({ kind: "wildcard" }, callExpr("search")),
    ]);
    const theta = promptTheta(body([search, { kind: "expr", expr: outer, range: span() }], null), [
      "grep",
    ]);

    const { resolvePiTool, received } = recordingPiToolResolver("42 matches");

    const r = await runBody(producer({ resolvePiTool }), theta);

    // Reds today: the arm body `search()` is a user-`fn` call in a pure
    // sub-expression position, so `evaluatePure` runs it synchronously through
    // the partial `evaluatePureFnCall`, whose effectful `grep(...)` body reaches
    // the `default: return null` safety net — the effect never dispatches, so
    // `received` stays `undefined` and the arm yields `null`.
    expect(r.outcome).toBe("success");
    expect(
      received(),
      "the effectful fn body dispatched the real tool through the executor",
    ).toEqual({ pattern: "TODO", path: "src" });
    expect(
      r.value,
      "the effectful user-`fn` call resolves to the dispatched effect's Ok(text), not the null safety net",
    ).toEqual(makeOk("42 matches"));
  });
});
