import { describe, expect, it } from "vitest";
import type { PiToolDispatch } from "../src/extension/production-theta-producer";
import type { AgentToolResultEnvelope } from "../src/runtime/tool-call-execute";
import { isResultValue, type ThetaValue, type ResultValue } from "../src/runtime/value";
import type { CallExpr, Expr, MatchExpr, PatternNode } from "../src/parser/theta-document";
import {
  span,
  callExpr,
  tryExpr,
  identExpr,
  memberExpr,
  indexExpr,
  numberExpr,
  strExpr as stringExpr,
  objectExpr,
  binaryExpr,
  letStmt,
  statementBody as body,
  coreExecProducer as producer,
  promptTheta,
  recordingPiToolResolver,
  runCoreBody as runBody,
} from "./helpers/tool-call-dispatch-harness";

// README known-gap "bullet 2" regression — a nested `match` or an effectful
// expression (tool-call / query / invoke / user-`fn` call) used DIRECTLY as an
// object-literal field value or an array element must evaluate to its correct
// value (routed through the async executor `evalExpr`), NOT silently yield
// `null` with a `success` outcome. Drives the REAL production path
// (`createEffectfulStatementHost` + the real `runCodeSideToolCall`), sharing
// the core-execution harness with tests/production-core-exec.test.ts.

function arrayExpr(elements: readonly Expr[]): Expr {
  return { kind: "array", elements, range: span() };
}

function boolExpr(value: boolean): Expr {
  return { kind: "bool", value, range: span() };
}

function ternaryExpr(condition: Expr, consequent: Expr, alternate: Expr): Expr {
  return { kind: "ternary", condition, consequent, alternate, range: span() };
}

function methodCallExpr(target: Expr, method: string, args: readonly Expr[] = []): Expr {
  return { kind: "method-call", target, method, args, range: span() };
}

function okCtor(arg: Expr): Expr {
  return { kind: "result-ctor", ctor: "Ok", arg, range: span() };
}

// `match <scrutinee> { Ok(v) => v, _ => <fallback> }` — a nested control form
// that hits `evaluatePureExpression`'s `default: return null` when it is placed
// (unfixed) in an object-field / array-element position.
function unwrapOrMatch(scrutinee: Expr, fallback: Expr): MatchExpr {
  const okArm: PatternNode = { kind: "constructor", ctor: "Ok", inner: { kind: "identifier", name: "v" } };
  const wildArm: PatternNode = { kind: "wildcard" };
  return {
    kind: "match",
    scrutinee,
    arms: [
      { pattern: okArm, body: identExpr("v") },
      { pattern: wildArm, body: fallback },
    ],
    range: span(),
  };
}

// `match <scrutinee> { <lit> => <body>, …, _ => <fallback> }` — a by-value match
// over literal patterns. Used to prove a resolved NON-Result scrutinee matches
// by value (i.e. it is NOT wrapped in `Ok(...)` by the fix).
function matchLiteral(
  scrutinee: Expr,
  cases: readonly { readonly lit: string | number | boolean | null; readonly body: Expr }[],
  fallback: Expr,
): MatchExpr {
  return {
    kind: "match",
    scrutinee,
    arms: [
      ...cases.map((c) => ({ pattern: { kind: "literal", value: c.lit } as PatternNode, body: c.body })),
      { pattern: { kind: "wildcard" } as PatternNode, body: fallback },
    ],
    range: span(),
  };
}

// A `grep(args)` Pi tool scripted to return `Ok(text)` and record its params.
function okGrep(): { readonly resolvePiTool: (n: string) => PiToolDispatch; readonly received: () => unknown } {
  return recordingPiToolResolver("42 matches");
}

// A `grep(args)` Pi tool whose `execute()` throws → lowered to
// `Err(CodeToolError { cause: "execution" })` (the same failure a tail-position
// call would surface).
function failingGrep(): (n: string) => PiToolDispatch {
  return (name: string): PiToolDispatch => ({
    toolName: name,
    execute: (): Promise<AgentToolResultEnvelope> => {
      return Promise.reject(new Error("tool blew up"));
    },
  });
}

function grepCall(): CallExpr {
  return callExpr("grep", [
    objectExpr(null, [
      { name: "pattern", value: stringExpr("TODO") },
      { name: "path", value: stringExpr("src") },
    ]),
  ]);
}

// ===========================================================================
// Nested `match` in an object-field / array-element value (no model needed).
// ===========================================================================

describe("bullet-2 — nested `match` as an object-field / array-element value", () => {
  it("object field `{ f: match Ok(1) { Ok(v) => v, _ => 0 } }` evaluates the match (not null)", async () => {
    // let p = { f: match Ok(1) { Ok(v) => v, _ => 0 } }; tail p.f
    const theta = promptTheta(
      body(
        [letStmt("p", objectExpr(null, [{ name: "f", value: unwrapOrMatch(okCtor(numberExpr("1")), numberExpr("0")) }]))],
        memberExpr(identExpr("p"), "f"),
      ),
    );

    const r = await runBody(producer({}), theta);

    expect(r.outcome).toBe("success");
    expect(r.value, "the nested match in the field value evaluated to Ok(1)'s payload, not null").toBe(1);
  });

  it("array element `let a = [ match Ok(2) { Ok(v) => v, _ => 0 } ]; a[0]` evaluates the match (not null)", async () => {
    // let a = [ match Ok(2) { Ok(v) => v, _ => 0 } ]; tail a[0]
    const theta = promptTheta(
      body(
        [letStmt("a", arrayExpr([unwrapOrMatch(okCtor(numberExpr("2")), numberExpr("0"))]))],
        indexExpr(identExpr("a"), numberExpr("0")),
      ),
    );

    const r = await runBody(producer({}), theta);

    expect(r.outcome).toBe("success");
    expect(r.value, "the nested match in the array element evaluated, not null").toBe(2);
  });
});

// ===========================================================================
// Effectful tool-call as an object-field / array-element value.
// ===========================================================================

describe("bullet-2 — effectful tool-call as an object-field / array-element value", () => {
  it("object field `{ hits: grep({...}) }` dispatches the tool and binds its Result (not null)", async () => {
    const tool = okGrep();
    // let o = { hits: grep({ pattern, path }) }; tail o.hits
    const theta = promptTheta(
      body([letStmt("o", objectExpr(null, [{ name: "hits", value: grepCall() }]))], memberExpr(identExpr("o"), "hits")),
      ["grep"],
    );

    const r = await runBody(producer({ resolvePiTool: tool.resolvePiTool }), theta);

    expect(tool.received(), "the tool dispatched with the real lowered params").toEqual({ pattern: "TODO", path: "src" });
    expect(r.outcome).toBe("success");
    expect(isResultValue(r.value as ThetaValue), "the field holds the dispatched tool Result, not null").toBe(true);
    const rv = r.value as ResultValue;
    expect(rv.ok).toBe(true);
    expect((rv as { value: ThetaValue }).value).toBe("42 matches");
  });

  it("array element `let a = [ grep({...}) ]; a[0]` dispatches the tool and binds its Result (not null)", async () => {
    const tool = okGrep();
    // let a = [ grep({ pattern, path }) ]; tail a[0]
    const theta = promptTheta(
      body([letStmt("a", arrayExpr([grepCall()]))], indexExpr(identExpr("a"), numberExpr("0"))),
      ["grep"],
    );

    const r = await runBody(producer({ resolvePiTool: tool.resolvePiTool }), theta);

    expect(r.outcome).toBe("success");
    expect(isResultValue(r.value as ThetaValue), "the element holds the dispatched tool Result, not null").toBe(true);
    expect((r.value as ResultValue).ok).toBe(true);
    expect((r.value as { value: ThetaValue }).value).toBe("42 matches");
  });
});

// ===========================================================================
// A FAILING nested effectful form must propagate the failure — exactly as it
// would in tail position — NOT swallow to `null` with a `success` outcome.
// ===========================================================================

describe("bullet-2 — a failing nested effectful form propagates (does not swallow to null)", () => {
  it("`[ grep({...})? ]` propagates the tool Err identically to `grep({...})?` in tail position", async () => {
    // Baseline: the same `?`-wrapped failing tool-call in tail position.
    const tailTheta = promptTheta(body([], tryExpr(grepCall())), ["grep"]);
    const tail = await runBody(producer({ resolvePiTool: failingGrep() }), tailTheta);

    // Nested: the SAME form as the sole element of an array literal.
    const nestedTheta = promptTheta(body([], arrayExpr([tryExpr(grepCall())])), ["grep"]);
    const nested = await runBody(producer({ resolvePiTool: failingGrep() }), nestedTheta);

    expect(tail.outcome, "tail-position `?` over a failing tool-call fails").toBe("fail");
    expect(nested.outcome, "the nested-position form propagates the SAME failure, not success/null").toBe(
      tail.outcome,
    );
    // Pre-fix, the array element hit `evaluatePureExpression`'s `default: null`,
    // so the body succeeded with `[null]`. Post-fix it propagates the Err.
    expect(nested.value, "a failing nested effect does not yield a bound null value").not.toBe(null);
  });
});

// ===========================================================================
// Residual closure (verify-bullet2.md item 5): a control/effect form nested in
// an INLINE composite consumed DIRECTLY by a pure operator (no intervening
// `let`). Pre-fix these hit `evaluatePureExpression`'s `default: return null`
// (silent `null`, or a coerced derivative such as `"nullx"`); post-fix the
// operator node is decomposed on the async executor so the nested form runs.
// ===========================================================================

describe("bullet-2 residual — control/effect under a pure operator on an inline composite", () => {
  it("index over an inline array holding a `match`: `[ match Ok(7){...} ][0]` evaluates (not null)", async () => {
    const theta = promptTheta(
      body([], indexExpr(arrayExpr([unwrapOrMatch(okCtor(numberExpr("7")), numberExpr("0"))]), numberExpr("0"))),
    );
    const r = await runBody(producer({}), theta);
    expect(r.outcome).toBe("success");
    expect(r.value, "the nested match under an inline-array index evaluated, not null").toBe(7);
  });

  it("member over an inline object holding a `match`: `{ f: match Ok(8){...} }.f` evaluates (not null)", async () => {
    const theta = promptTheta(
      body([], memberExpr(objectExpr(null, [{ name: "f", value: unwrapOrMatch(okCtor(numberExpr("8")), numberExpr("0")) }]), "f")),
    );
    const r = await runBody(producer({}), theta);
    expect(r.outcome).toBe("success");
    expect(r.value, "the nested match under an inline-object member evaluated, not null").toBe(8);
  });

  it("index over an inline array holding an effect: `[ grep() ][0]` dispatches the tool (not null)", async () => {
    const tool = okGrep();
    const theta = promptTheta(body([], indexExpr(arrayExpr([grepCall()]), numberExpr("0"))), ["grep"]);
    const r = await runBody(producer({ resolvePiTool: tool.resolvePiTool }), theta);
    expect(tool.received(), "the tool dispatched with the real lowered params").toEqual({ pattern: "TODO", path: "src" });
    expect(r.outcome).toBe("success");
    expect(isResultValue(r.value as ThetaValue), "the index holds the dispatched tool Result, not null").toBe(true);
    expect((r.value as { value: ThetaValue }).value).toBe("42 matches");
  });

  it("member over an inline object holding an effect: `{ hits: grep() }.hits` dispatches (not null)", async () => {
    const tool = okGrep();
    const theta = promptTheta(
      body([], memberExpr(objectExpr(null, [{ name: "hits", value: grepCall() }]), "hits")),
      ["grep"],
    );
    const r = await runBody(producer({ resolvePiTool: tool.resolvePiTool }), theta);
    expect(tool.received()).toEqual({ pattern: "TODO", path: "src" });
    expect(r.outcome).toBe("success");
    expect(isResultValue(r.value as ThetaValue), "the member holds the dispatched tool Result, not null").toBe(true);
    expect((r.value as { value: ThetaValue }).value).toBe("42 matches");
  });

  it("binary `+` over an index over an inline array: does not coerce a silent null to `\"nullx\"`", async () => {
    // `[ match Ok("hi") { Ok(v)=>v, _=>"" } ][0] + "!"` — pre-fix the index was a
    // silent `null` coerced to `"null!"`; post-fix it is `"hi!"`.
    const indexed = indexExpr(arrayExpr([unwrapOrMatch(okCtor(stringExpr("hi")), stringExpr(""))]), numberExpr("0"));
    const theta = promptTheta(body([], binaryExpr("+", indexed, stringExpr("!"))));
    const r = await runBody(producer({}), theta);
    expect(r.outcome).toBe("success");
    expect(r.value, "binary `+` operated on the evaluated control value, not a coerced null").toBe("hi!");
  });

  it("ternary returns the taken branch's evaluated value: `true ? [ match Ok(9){...} ][0] : 0` -> 9", async () => {
    const indexed = indexExpr(arrayExpr([unwrapOrMatch(okCtor(numberExpr("9")), numberExpr("0"))]), numberExpr("0"));
    const theta = promptTheta(body([], ternaryExpr(boolExpr(true), indexed, numberExpr("0"))));
    const r = await runBody(producer({}), theta);
    expect(r.outcome).toBe("success");
    expect(r.value).toBe(9);
  });

  it("ternary does NOT dispatch an effect in the not-taken branch: `false ? [ grep() ][0] : 5` -> 5, no dispatch", async () => {
    const tool = okGrep();
    const indexed = indexExpr(arrayExpr([grepCall()]), numberExpr("0"));
    const theta = promptTheta(body([], ternaryExpr(boolExpr(false), indexed, numberExpr("5"))), ["grep"]);
    const r = await runBody(producer({ resolvePiTool: tool.resolvePiTool }), theta);
    expect(r.outcome).toBe("success");
    expect(r.value).toBe(5);
    expect(tool.received(), "the not-taken branch's effect must NOT dispatch").toBeUndefined();
  });

  it("`&&` short-circuits: `false && ([ grep() ].length > 0)` -> false, no dispatch", async () => {
    const tool = okGrep();
    const rhs = binaryExpr(">", methodCallExpr(arrayExpr([grepCall()]), "length"), numberExpr("0"));
    const theta = promptTheta(body([], binaryExpr("&&", boolExpr(false), rhs)), ["grep"]);
    const r = await runBody(producer({ resolvePiTool: tool.resolvePiTool }), theta);
    expect(r.outcome).toBe("success");
    expect(r.value).toBe(false);
    expect(tool.received(), "the short-circuited right operand's effect must NOT dispatch").toBeUndefined();
  });

  it("method-call over an inline array holding an effect: `[ grep() ].length` dispatches -> 1", async () => {
    const tool = okGrep();
    const theta = promptTheta(body([], methodCallExpr(arrayExpr([grepCall()]), "length")), ["grep"]);
    const r = await runBody(producer({ resolvePiTool: tool.resolvePiTool }), theta);
    expect(tool.received(), "the receiver's effect dispatched").toEqual({ pattern: "TODO", path: "src" });
    expect(r.outcome).toBe("success");
    expect(r.value).toBe(1);
  });

  it("result-ctor over a `match`: `Ok(match Ok(5){...})` evaluates the arg (not Ok(null))", async () => {
    const theta = promptTheta(body([], okCtor(unwrapOrMatch(okCtor(numberExpr("5")), numberExpr("0")))));
    const r = await runBody(producer({}), theta);
    expect(r.outcome).toBe("success");
    expect(isResultValue(r.value as ThetaValue)).toBe(true);
    expect((r.value as { value: ThetaValue }).value).toBe(5);
  });
});

describe("bullet-2 residual — a failing effect under a pure operator propagates (does not swallow to null)", () => {
  // Baseline terminal outcome: the same `?`-wrapped failing tool-call in tail
  // position. Every inline-operator shape below must match it exactly.
  async function tailBaseline(): Promise<string> {
    const tailTheta = promptTheta(body([], tryExpr(grepCall())), ["grep"]);
    return (await runBody(producer({ resolvePiTool: failingGrep() }), tailTheta)).outcome;
  }

  async function nestedOutcome(tail: Expr): Promise<{ readonly outcome: string; readonly value: ThetaValue | undefined }> {
    return runBody(producer({ resolvePiTool: failingGrep() }), promptTheta(body([], tail), ["grep"]));
  }

  it("index `[ grep()? ][0]`, member `{ f: grep()? }.f`, binary, ternary, method-call, result-ctor all fail identically", async () => {
    const baseline = await tailBaseline();
    expect(baseline, "tail-position `?` over a failing tool-call fails").toBe("fail");

    const indexShape = indexExpr(arrayExpr([tryExpr(grepCall())]), numberExpr("0"));
    const memberShape = memberExpr(objectExpr(null, [{ name: "f", value: tryExpr(grepCall()) }]), "f");
    const binaryShape = binaryExpr("+", indexExpr(arrayExpr([tryExpr(grepCall())]), numberExpr("0")), numberExpr("1"));
    const ternaryShape = ternaryExpr(boolExpr(true), indexExpr(arrayExpr([tryExpr(grepCall())]), numberExpr("0")), numberExpr("0"));
    const methodShape = methodCallExpr(arrayExpr([tryExpr(grepCall())]), "length");
    const ctorShape = okCtor(tryExpr(grepCall()));

    for (const [label, shape] of [
      ["index", indexShape],
      ["member", memberShape],
      ["binary", binaryShape],
      ["ternary", ternaryShape],
      ["method-call", methodShape],
      ["result-ctor", ctorShape],
    ] as const) {
      const r = await nestedOutcome(shape);
      expect(r.outcome, `${label}: a failing nested effect propagates the SAME failure, not success/null`).toBe(baseline);
      expect(r.value, `${label}: a failing nested effect does not yield a bound null value`).not.toBe(null);
    }
  });
});

// ===========================================================================
// FINAL RESIDUAL CLOSURE (evalAsResult): an operator expression that is itself
// the `?`-operand or `match`-scrutinee, with no intervening `let`. Pre-fix these
// bypassed the async executor (`evalAsResult`'s delegate predicate excluded the
// pure-operator kinds), fell to the sync pure host, and either silently yielded
// a `null` scrutinee (→ wildcard arm, wrong `success` value) or threw a raw
// `TypeError` on `null.ok` (→ `theta/runtime/internal-error` abort). Post-fix the
// operator node routes through `evalExpr` RAW (no `asResultValue` wrap) so the
// nested effect dispatches and the TRUE value reaches `evaluateMatch` /
// `evaluateQuestion`.
// ===========================================================================

describe("bullet-2 final residual — control/effect operator expr as the `match`-scrutinee / `?`-operand", () => {
  it("`match [grep()][0] { Ok(v)=>v, _=>0 }` dispatches the effect and matches its Result payload", async () => {
    const tool = okGrep();
    const scrutinee = indexExpr(arrayExpr([grepCall()]), numberExpr("0"));
    const theta = promptTheta(body([], unwrapOrMatch(scrutinee, numberExpr("0"))), ["grep"]);
    const r = await runBody(producer({ resolvePiTool: tool.resolvePiTool }), theta);
    expect(tool.received(), "the scrutinee's nested effect dispatched (not silent-null → wildcard arm)").toEqual({
      pattern: "TODO",
      path: "src",
    });
    expect(r.outcome).toBe("success");
    expect(r.value, "the Ok(v) arm bound the dispatched payload, not the wildcard fallback").toBe("42 matches");
  });

  it("`[grep()][0]?` dispatches the effect and unwraps its Ok payload", async () => {
    const tool = okGrep();
    const operand = tryExpr(indexExpr(arrayExpr([grepCall()]), numberExpr("0")));
    const theta = promptTheta(body([], operand), ["grep"]);
    const r = await runBody(producer({ resolvePiTool: tool.resolvePiTool }), theta);
    expect(tool.received(), "the `?`-operand's nested effect dispatched (not silent-null → TypeError)").toEqual({
      pattern: "TODO",
      path: "src",
    });
    expect(r.outcome).toBe("success");
    expect(r.value, "`?` unwrapped the dispatched Ok payload").toBe("42 matches");
  });

  it("`match { f: grep() }.f { Ok(v)=>v, _=>0 }` (member scrutinee) dispatches and matches", async () => {
    const tool = okGrep();
    const scrutinee = memberExpr(objectExpr(null, [{ name: "f", value: grepCall() }]), "f");
    const theta = promptTheta(body([], unwrapOrMatch(scrutinee, numberExpr("0"))), ["grep"]);
    const r = await runBody(producer({ resolvePiTool: tool.resolvePiTool }), theta);
    expect(tool.received()).toEqual({ pattern: "TODO", path: "src" });
    expect(r.outcome).toBe("success");
    expect(r.value).toBe("42 matches");
  });

  it("`(true ? [grep()][0] : Ok(\"\"))?` (ternary operand) unwraps the taken branch's dispatched Result", async () => {
    const tool = okGrep();
    const taken = indexExpr(arrayExpr([grepCall()]), numberExpr("0"));
    const operand = tryExpr(ternaryExpr(boolExpr(true), taken, okCtor(stringExpr(""))));
    const theta = promptTheta(body([], operand), ["grep"]);
    const r = await runBody(producer({ resolvePiTool: tool.resolvePiTool }), theta);
    expect(tool.received()).toEqual({ pattern: "TODO", path: "src" });
    expect(r.outcome).toBe("success");
    expect(r.value).toBe("42 matches");
  });

  it("`Ok(grep())?` (result-ctor operand) unwraps the outer Ok to the dispatched inner Result", async () => {
    const tool = okGrep();
    const operand = tryExpr(okCtor(grepCall()));
    const theta = promptTheta(body([], operand), ["grep"]);
    const r = await runBody(producer({ resolvePiTool: tool.resolvePiTool }), theta);
    expect(tool.received()).toEqual({ pattern: "TODO", path: "src" });
    expect(r.outcome).toBe("success");
    // `Ok(grep())` = Ok(Ok("42 matches")); `?` unwraps the outer Ok to the inner Result.
    expect(isResultValue(r.value as ThetaValue), "`?` unwrapped to the inner dispatched Result").toBe(true);
    expect((r.value as ResultValue).ok).toBe(true);
    expect((r.value as { value: ThetaValue }).value).toBe("42 matches");
  });
});

describe("bullet-2 final residual — a NON-Result `match`-scrutinee still matches by-value (no Ok-wrapping regression)", () => {
  it("`match [1][0] { 1 => 100, _ => 0 }` (index scrutinee) matches the literal `1`, not `Ok(1)`", async () => {
    const scrutinee = indexExpr(arrayExpr([numberExpr("1")]), numberExpr("0"));
    const theta = promptTheta(body([], matchLiteral(scrutinee, [{ lit: 1, body: numberExpr("100") }], numberExpr("0"))));
    const r = await runBody(producer({}), theta);
    expect(r.outcome).toBe("success");
    expect(r.value, "the resolved scrutinee 1 matched the literal arm (would be wildcard if wrapped in Ok(1))").toBe(
      100,
    );
  });

  it('`match ("a"+"b") { "ab" => 200, _ => 0 }` (binary scrutinee) matches the literal string, not `Ok("ab")`', async () => {
    const scrutinee = binaryExpr("+", stringExpr("a"), stringExpr("b"));
    const theta = promptTheta(body([], matchLiteral(scrutinee, [{ lit: "ab", body: numberExpr("200") }], numberExpr("0"))));
    const r = await runBody(producer({}), theta);
    expect(r.outcome).toBe("success");
    expect(r.value).toBe(200);
  });

  it("`match [grep()].length { 1 => 300, _ => 0 }` (method-call scrutinee) dispatches, matches the number 1", async () => {
    const tool = okGrep();
    const scrutinee = methodCallExpr(arrayExpr([grepCall()]), "length");
    const theta = promptTheta(body([], matchLiteral(scrutinee, [{ lit: 1, body: numberExpr("300") }], numberExpr("0"))), [
      "grep",
    ]);
    const r = await runBody(producer({ resolvePiTool: tool.resolvePiTool }), theta);
    expect(tool.received(), "the method-call receiver's effect dispatched").toEqual({ pattern: "TODO", path: "src" });
    expect(r.outcome).toBe("success");
    expect(r.value, "the resolved length 1 matched by value, not Ok-wrapped").toBe(300);
  });
});

describe("bullet-2 final residual — short-circuit / not-taken branch does NOT dispatch in scrutinee/operand position", () => {
  it("`match (false ? [grep()][0] : Ok(\"x\")) { Ok(v)=>v, _=>0 }` takes the untaken-effect-free branch, no dispatch", async () => {
    const tool = okGrep();
    const scrutinee = ternaryExpr(boolExpr(false), indexExpr(arrayExpr([grepCall()]), numberExpr("0")), okCtor(stringExpr("x")));
    const theta = promptTheta(body([], unwrapOrMatch(scrutinee, numberExpr("0"))), ["grep"]);
    const r = await runBody(producer({ resolvePiTool: tool.resolvePiTool }), theta);
    expect(r.outcome).toBe("success");
    expect(r.value).toBe("x");
    expect(tool.received(), "the not-taken ternary branch's effect must NOT dispatch").toBeUndefined();
  });

  it("`match (false && ([grep()].length > 0)) { false => 42, _ => 0 }` short-circuits: no dispatch, matches `false`", async () => {
    const tool = okGrep();
    const rhs = binaryExpr(">", methodCallExpr(arrayExpr([grepCall()]), "length"), numberExpr("0"));
    const scrutinee = binaryExpr("&&", boolExpr(false), rhs);
    const theta = promptTheta(body([], matchLiteral(scrutinee, [{ lit: false, body: numberExpr("42") }], numberExpr("0"))), [
      "grep",
    ]);
    const r = await runBody(producer({ resolvePiTool: tool.resolvePiTool }), theta);
    expect(r.outcome).toBe("success");
    expect(r.value, "the resolved scrutinee false matched by value (not Ok-wrapped)").toBe(42);
    expect(tool.received(), "the short-circuited `&&` right operand's effect must NOT dispatch").toBeUndefined();
  });
});

describe("bullet-2 final residual — a failing effect under a `?`-operand / `match`-scrutinee propagates (not internal-error, not silent-null)", () => {
  async function tailBaseline(): Promise<string> {
    const tailTheta = promptTheta(body([], tryExpr(grepCall())), ["grep"]);
    return (await runBody(producer({ resolvePiTool: failingGrep() }), tailTheta)).outcome;
  }

  it("`[grep()][0]?` over a failing tool-call propagates the SAME failure as tail position (no `internal-error`, no silent null)", async () => {
    const baseline = await tailBaseline();
    expect(baseline, "tail-position `?` over a failing tool-call fails").toBe("fail");
    const operand = tryExpr(indexExpr(arrayExpr([grepCall()]), numberExpr("0")));
    const theta = promptTheta(body([], operand), ["grep"]);
    const r = await runBody(producer({ resolvePiTool: failingGrep() }), theta);
    expect(r.outcome, "the operator `?`-operand propagates the failure, not a silent-null internal-error").toBe(baseline);
    expect(r.value, "a failing nested effect under `?` does not yield a bound null value").not.toBe(null);
  });
});
