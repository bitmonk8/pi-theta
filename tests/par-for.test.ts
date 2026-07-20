import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaSource } from "../src/lexer/lexer";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import {
  parseThetaDocument,
  type ThetaDocument,
  type ThetaBody,
  type Expr,
  type ParseThetaDocumentDeps,
} from "../src/parser/theta-document";
import {
  StaticTypeInferencePass,
  type StaticTypeInferenceDeps,
} from "../src/parser/static-type-inference";
import {
  checkCompatible,
  displayType,
  type CompatType,
  type TypeEnv,
} from "../src/parser/type-compat";
import {
  executeBody,
  type CheckpointDescriptor,
  type ExecuteBodyDeps,
  type StatementEvalHost,
} from "../src/runtime/statement-executor";
import {
  buildEnvironment,
  type LexicalEnvironment,
} from "../src/runtime/lexical-environment";
import type { Checkpoint } from "../src/seams/checkpoint";
import type { OperationResult } from "../src/runtime/cancellation-core";
import type {
  CommittedConversationMutator,
  CommittedSurface,
} from "../src/runtime/terminal-outcomes";
import { isResultValue, type ThetaValue } from "../src/runtime/value";
import type { QueryError } from "../src/runtime/query-error";
import { HostFatal, IndexOutOfBoundsPanic } from "../src/runtime/runtime-panics";

// ===========================================================================
// RFC 0003 (`par for`) — test-first (RED) obligation suite.
// ===========================================================================
//
// Feature spec (normative):
//   - control-flow.md §"Parallel fan-out — `par for`" (anchor #par-for),
//     CTRL-2 (scheduling & width throttle), CTRL-3 (value & ordering),
//     CTRL-4 (body restrictions), CTRL-5 (run-to-completion & cancellation).
//   - grammar.md §Blocks (`ParForExpr` / `MaxClause` / `ParForBody`), §"Contextual
//     keywords" (`par` recognised only before `for`).
//   - errors-and-results.md ERR-20 (anchor #err-20) — the `par for` iteration
//     boundary is a panic-downgrade point.
//   - hard-ceilings.md §"`par for` width throttle" (anchor #par-for-width-throttle),
//     NOCEIL-5 — the throttle is NOT a routing-class ceiling.
//   - diagnostics.md — `theta/parse/par-query-in-body`,
//     `theta/parse/par-shared-mutation`, `theta/parse/par-break-continue`.
//   - RFC: rfcs/0003-parallel-fanout.md.
//
// Discipline: this suite is written BEFORE the implementation. `par for` is
// absent from src/ today, so every test here is expected to be RED for the
// "feature-not-implemented" reason (a `par for` source mis-parses to an
// identifier `par` followed by a plain `for` statement, produces no `par-for`
// AST node, emits none of the three body-restriction diagnostics, and is not
// fanned-out at runtime). The paired implementation stage turns them green.
//
// One test is a deliberate NON-REGRESSION GUARD that is GREEN both now and
// post-implementation (an identifier named `par` used away from `for` must keep
// parsing); it is labelled as such.
//
// All tests drive the real, stable public surfaces only — `parseThetaDocument`
// (never throws; aggregates diagnostics), `StaticTypeInferencePass` (read-only),
// and `executeBody` (the tree-walking driver). No src/ module is modified. Where
// a runtime observation needs a hook the current executor does not yet route
// through (concurrency width, child-diagnostic drain), the test is written
// against the intended observable behaviour and the required hook is documented
// in a comment and in the handoff notes.

// --- Assumed `par for` AST node shape (implementer must honour) ------------
//
// Grammar: `ParForExpr ::= "par" "for" Ident "in" Expr MaxClause? ParForBody`.
// This suite assumes the parser lowers a `par for` to an expression node:
//
//   { kind: "par-for",
//     variable: string,        // the loop `Ident`
//     iterand: Expr,           // the `array<T>` expression after `in`
//     max: Expr | null,        // the `MaxClause` operand, or null when absent
//     body: Block,             // the `ParForBody` (Stmt* Expr?)
//     range: SourceRange }
//
// and that this node is a member of the `Expr` union. Assertions below match on
// `kind === "par-for"` and read `.variable` / `.iterand` / `.max` / `.body`.

// --- parse harness ---------------------------------------------------------

/** A trivially-wired diagnostic sink + resolving `model:` matcher for the parse. */
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

/** Parse a UTF-8 `.theta` source string through the production whole-file parser. */
function parse(src: string, path = "test.theta"): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, makeDeps());
}

/** The set of diagnostic codes the production parse aggregated for `src`. */
function codesOf(src: string): string[] {
  return parse(src).diagnostics.map((d: Diagnostic) => d.code);
}

// --- generic AST search ----------------------------------------------------

interface KindedNode {
  readonly kind: string;
  readonly [key: string]: unknown;
}

/**
 * Collect every AST object of the given `kind` anywhere under `root` (a deep
 * own-enumerable-property walk). Used to locate the assumed `par-for` node
 * regardless of where it sits (let-RHS, expression statement, tail, nested).
 */
function collectByKind(root: unknown, kind: string): KindedNode[] {
  const out: KindedNode[] = [];
  const seen = new Set<unknown>();
  const visit = (node: unknown): void => {
    if (node === null || typeof node !== "object") {
      return;
    }
    if (seen.has(node)) {
      return;
    }
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }
    const obj = node as Record<string, unknown>;
    if (typeof obj.kind === "string" && obj.kind === kind) {
      out.push(obj as KindedNode);
    }
    for (const key of Object.keys(obj)) {
      visit(obj[key]);
    }
  };
  visit(root);
  return out;
}

/** All `par-for` nodes in a parsed body. */
function parForNodes(body: ThetaBody): KindedNode[] {
  return collectByKind(body, "par-for");
}

// ===========================================================================
// LEXER / PARSER — `par` contextual keyword (grammar.md §"Contextual keywords")
// ===========================================================================

describe("RFC-0003 par-for — `par` is a contextual keyword", () => {
  // NON-REGRESSION GUARD (green now AND post-implementation): `par` is not a
  // reserved keyword, so an identifier named `par` used away from `for` keeps
  // parsing. This must not regress when the contextual keyword lands.
  it("grammar#contextual-keywords: an identifier named `par` parses when not before `for` (guard — green now)", () => {
    const codes = codesOf(["let par = 1", "let n = par + 1", "n"].join("\n"));
    expect(
      codes,
      "an identifier named `par` used away from `for` must keep parsing (no reserved-keyword / unknown-identifier error)",
    ).not.toContain("theta/parse/reserved-keyword-as-identifier");
    expect(codes).not.toContain("theta/parse/unknown-identifier");
    expect(codes).toEqual([]);
  });

  it("grammar#contextual-keywords: `par for …` is recognised as the par-for form, not `par` + `for` (RED — feature absent)", () => {
    // Recognised as one construct: no `par` identifier resolution error, and a
    // `par-for` node is produced. Today `par` parses as a free identifier
    // (theta/parse/unknown-identifier) and `for` as a separate statement.
    const doc = parse("par for x in [1, 2, 3] { x }");
    expect(
      doc.diagnostics.map((d) => d.code),
      "`par` immediately before `for` is the contextual keyword, not a free identifier",
    ).not.toContain("theta/parse/unknown-identifier");
    expect(
      parForNodes(doc.body).length,
      "`par for …` lowers to a single `par-for` expression node",
    ).toBeGreaterThan(0);
  });
});

// ===========================================================================
// PARSER — `par for` is a value-producing EXPRESSION (grammar.md §Blocks)
// ===========================================================================

describe("RFC-0003 par-for — parses as a value-producing expression", () => {
  it("grammar#blocks: `par for` is admissible as the RHS of a `let` (RED — feature absent)", () => {
    const doc = parse("let reviews = par for f in [1, 2, 3] { f }\nreviews");
    const lets = collectByKind(doc.body, "let");
    const withParForInit = lets.filter(
      (s) =>
        s.init !== null &&
        typeof s.init === "object" &&
        (s.init as KindedNode).kind === "par-for",
    );
    expect(
      withParForInit.length,
      "a `par for` expression is the initialiser of `let reviews = par for …`",
    ).toBe(1);
  });

  it("grammar#blocks: `par for` stands alone as a discarded-value expression statement (RED — feature absent)", () => {
    const doc = parse("par for f in [1, 2, 3] { f }");
    const exprStmts = collectByKind(doc.body, "expr");
    const parForStmts = exprStmts.filter(
      (s) =>
        typeof s.expr === "object" &&
        (s.expr as KindedNode).kind === "par-for",
    );
    expect(
      parForStmts.length,
      "a standalone `par for` is legal as an expression statement (value discarded)",
    ).toBe(1);
  });

  it("grammar#blocks: the `par-for` node carries the loop variable, iterand and body (RED — feature absent)", () => {
    const doc = parse("let r = par for item in [10, 20] { item }\nr");
    const [node] = parForNodes(doc.body);
    expect(node, "a `par-for` node is produced").toBeDefined();
    expect(node?.variable, "the loop `Ident` is captured").toBe("item");
    expect(
      (node?.iterand as KindedNode | undefined)?.kind,
      "the iterand expression after `in` is captured (an array literal here)",
    ).toBe("array");
    expect(
      (node?.body as { statements?: unknown; tail?: unknown } | undefined) !==
        undefined,
      "the ParForBody block is captured",
    ).toBe(true);
  });
});

// ===========================================================================
// PARSER — `max` clause (grammar.md `MaxClause ::= "max" Expr`)
// ===========================================================================

describe("RFC-0003 par-for — `max` clause", () => {
  it("grammar#MaxClause: `max <literal>` parses; the node records a max operand (RED — feature absent)", () => {
    const doc = parse("let r = par for f in [1, 2, 3] max 8 { f }\nr");
    const [node] = parForNodes(doc.body);
    expect(node, "a `par-for` node with a `max` clause is produced").toBeDefined();
    expect(node?.max, "the `max` operand is captured (not null)").not.toBeNull();
    expect(node?.max, "the `max` operand is present").toBeDefined();
  });

  it("grammar#MaxClause / RFC-0003: `max` accepts a non-literal integer expression `max n + 1` (RED — feature absent)", () => {
    // RFC 0003 inherits RFC 0002's posture: `max` admits any integer-typed
    // expression, not only a literal.
    const doc = parse(
      ["let n = 4", "let r = par for f in [1, 2, 3] max n + 1 { f }", "r"].join(
        "\n",
      ),
    );
    const [node] = parForNodes(doc.body);
    expect(node, "a `par-for` node with a computed `max` is produced").toBeDefined();
    expect(
      (node?.max as KindedNode | undefined)?.kind,
      "a non-literal `max` operand parses as its expression (a binary `+` here)",
    ).toBe("binary");
  });

  it("CTRL-2 / grammar#MaxClause: a non-integer `max` operand routes to the integer-narrowing diagnostic (RED — feature absent)", () => {
    // control-flow.md CTRL-2 / grammar.md §Loops: a `number`-typed `max` operand
    // triggers `theta/parse/integer-narrowing`, as in any integer position.
    const codes = codesOf("let r = par for f in [1, 2, 3] max 2.5 { f }\nr");
    expect(
      codes,
      "a fractional `max` operand narrows to the existing integer-narrowing diagnostic",
    ).toContain("theta/parse/integer-narrowing");
  });
});

// ===========================================================================
// PARSER — iterand contract + body-restriction diagnostics (CTRL-4)
// ===========================================================================

describe("RFC-0003 par-for — iterand contract (reused from `for`)", () => {
  it("grammar#non-array-iterand: a non-array `par for` iterand is theta/parse/non-array-iterand (RED — feature absent)", () => {
    // `par for` reuses the `for` iterand contract unchanged (control-flow.md
    // §par-for): a non-array iterand is theta/parse/non-array-iterand, and it is
    // NOT a free-identifier `par` (no unknown-identifier for `par`).
    const codes = codesOf("let r = par for f in 5 { f }\nr");
    expect(codes, "a non-array `par for` iterand fires non-array-iterand").toContain(
      "theta/parse/non-array-iterand",
    );
    expect(
      codes,
      "`par` before `for` is the contextual keyword, not a free identifier",
    ).not.toContain("theta/parse/unknown-identifier");
  });
});

describe("RFC-0003 par-for — body restrictions (CTRL-4)", () => {
  it("theta/parse/par-query-in-body: an `@`-query against the enclosing conversation in the body (RED — feature absent)", () => {
    // CTRL-4: a conversation is a linear transcript; concurrent `@` queries have
    // no defined interleaving, so a body `@`…`` is a parse error.
    const codes = codesOf(
      ["let r = par for f in [1, 2, 3] {", "  @`Summarise ${f}.`?", "}", "r"].join(
        "\n",
      ),
    );
    expect(codes).toContain("theta/parse/par-query-in-body");
  });

  it("theta/parse/par-shared-mutation: assignment to an outer `let mut` inside the body (RED — feature absent)", () => {
    // CTRL-4: outer bindings are readable, but assignment to a `let mut`
    // declared outside the body is a parse error.
    const codes = codesOf(
      [
        "let mut total = 0",
        "let r = par for f in [1, 2, 3] {",
        "  total = total + f",
        "  f",
        "}",
        "r",
      ].join("\n"),
    );
    expect(codes).toContain("theta/parse/par-shared-mutation");
  });

  it("theta/parse/par-break-continue: `break` inside the body (RED — feature absent)", () => {
    // CTRL-4: `break` / `continue` have no defined meaning under concurrent
    // scheduling.
    const codes = codesOf(
      ["par for f in [1, 2, 3] {", "  break", "}"].join("\n"),
    );
    expect(codes).toContain("theta/parse/par-break-continue");
  });

  it("theta/parse/par-break-continue: `continue` inside the body (RED — feature absent)", () => {
    const codes = codesOf(
      ["par for f in [1, 2, 3] {", "  continue", "}"].join("\n"),
    );
    expect(codes).toContain("theta/parse/par-break-continue");
  });
});

// ===========================================================================
// PARSER — both enclosing modes admit `par for` (CTRL-4)
// ===========================================================================

describe("RFC-0003 par-for — legal in prompt- and subagent-mode thetas (CTRL-4)", () => {
  const withFrontmatter = (mode: string, bodySrc: string): string =>
    ["---", `mode: ${mode}`, "---", bodySrc].join("\n");

  it("CTRL-4: a prompt-mode theta may contain `par for` (RED — feature absent)", () => {
    const doc = parse(
      withFrontmatter("prompt", "let r = par for f in [1, 2, 3] { f }\nr"),
    );
    expect(
      parForNodes(doc.body).length,
      "iteration isolation severs the body↔conversation link, so `par for` is legal in prompt mode",
    ).toBeGreaterThan(0);
    expect(doc.diagnostics.map((d) => d.code)).not.toContain(
      "theta/parse/par-query-in-body",
    );
  });

  it("CTRL-4: a subagent-mode theta may contain `par for` (RED — feature absent)", () => {
    const doc = parse(
      withFrontmatter("subagent", "let r = par for f in [1, 2, 3] { f }\nr"),
    );
    expect(
      parForNodes(doc.body).length,
      "`par for` is legal in subagent mode too — isolation is independent of the enclosing mode",
    ).toBeGreaterThan(0);
  });
});

// ===========================================================================
// PARSER — nesting is legal (CTRL-2: throttle is per-loop)
// ===========================================================================

describe("RFC-0003 par-for — nesting is legal (CTRL-2)", () => {
  it("CTRL-2: `par for` inside `par for` parses to a nested `par-for` node (RED — feature absent)", () => {
    const doc = parse(
      [
        "let grid = par for row in [1, 2] {",
        "  par for col in [3, 4] { col }",
        "}",
        "grid",
      ].join("\n"),
    );
    const nodes = parForNodes(doc.body);
    expect(
      nodes.length,
      "both the outer and inner `par for` lower to `par-for` nodes (nesting is legal; throttle is per-loop)",
    ).toBeGreaterThanOrEqual(2);
  });
});

// ===========================================================================
// TYPE SYSTEM — CTRL-3: value type is `array<Result<U, QueryError>>`
// ===========================================================================

const EMPTY_TYPE_ENV: TypeEnv = {};

function makeInferencePass(): StaticTypeInferencePass {
  const deps: StaticTypeInferenceDeps = { checkCompatible };
  return new StaticTypeInferencePass(deps);
}

describe("RFC-0003 par-for — static type is array<Result<U, QueryError>> (CTRL-3)", () => {
  it("CTRL-3: the inferred type of a `par for` over array<T> is an array (RED — feature absent)", () => {
    // The body tail type is `U` (here `integer`), so the value is
    // `array<Result<integer, QueryError>>`. This suite asserts the outer `array`
    // shape as the stable, representation-independent surface; the element being
    // `Result<U, QueryError>` is documented (below) and reported as an
    // assumption the implementer must honour in the CompatType model.
    const doc = parse("let r = par for f in [1, 2, 3] { f }\nr");
    const nodes = parForNodes(doc.body);
    expect(
      nodes.length,
      "a `par-for` node must exist for the inference pass to type it",
    ).toBeGreaterThan(0);

    const pass = makeInferencePass();
    const node = nodes[0] as unknown as Expr;
    const inferred: CompatType = pass.typeOf(node, EMPTY_TYPE_ENV);
    expect(inferred, "the pass assigns a static type to the `par-for` node").toBeDefined();
    expect(
      inferred.kind,
      "CTRL-3: the value of a `par for` is an `array<…>` (collected per-element results)",
    ).toBe("array");

    // Documented element expectation (CTRL-3): the array element type is
    // `Result<U, QueryError>`. `displayType` currently has no `Result` case, so
    // whether this renders as `Result<…>` depends on the implementer's chosen
    // CompatType representation; this is reported as an assumption in the notes.
    const rendered = displayType(inferred);
    expect(
      rendered.startsWith("array<"),
      `CTRL-3: rendered as an array type (got '${rendered}')`,
    ).toBe(true);
  });
});

// ===========================================================================
// RUNTIME harness — drive `executeBody` over real `par for` source
// ===========================================================================
//
// These tests parse a real `par for` source, then execute the parsed body
// through the tree-walking driver `executeBody`. Today the source mis-parses to
// a free identifier `par` plus a plain `for` statement, so the body's tail is
// not a `par-for` expression and `executeBody` yields the literal `null` final
// value (never the ordered `array<Result<…>>`); every runtime assertion below
// reds on that absence. Post-implementation the executor fans the parsed
// `par-for` out through the effect host and yields the ordered array.
//
// REQUIRED RUNTIME HOOK (documented for the implementer): the executor must
// evaluate a `par-for` expression by scheduling one body-evaluation per input
// element, routing each iteration's checkpointed effect (invoke / call / query)
// through `StatementEvalHost.runEffect`, concurrently up to `min(max, 64)`
// in-flight, collecting one `Result` per element into an input-index-ordered
// `array<Result<T, QueryError>>`. The instrumentation below (an in-flight peak
// counter, a completion-order log, and a per-index child-diagnostic recorder)
// observes that behaviour through `runEffect`; it stays inert until the executor
// routes `par-for` iterations through the host.

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

class NoopMutator implements CommittedConversationMutator {
  truncate(): void {}
  rewrite(): void {}
  replace(): void {}
  remove(): void {}
  injectCompensatingTurn(_surface: CommittedSurface): void {}
}

/** Await `n` microtask turns — deterministic scheduling advance for the tests. */
async function tick(n: number): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
}

/** An `Ok(value)` operation result (the effect succeeded). */
function ok(value: ThetaValue): OperationResult {
  return { ok: true, value };
}

/** An `Err(error)` operation result (a non-cancel failure). */
function errResult(error: QueryError): OperationResult {
  return { ok: false, error };
}

/**
 * A `StatementEvalHost` for `par for` bodies. It evaluates the bounded pure
 * expression forms a fan-out body needs (literals / loop-var identifier / array
 * / binary / member / index) against the REAL per-iteration environment, and
 * treats `invoke` / `call` / `query` as checkpointed effects routed through
 * `runEffect`. It records concurrency (in-flight peak), completion order, and
 * per-iteration child diagnostics so the fan-out contract is observable.
 */
class ParForHost implements StatementEvalHost {
  inFlight = 0;
  peakInFlight = 0;
  readonly started: ThetaValue[] = [];
  readonly completed: ThetaValue[] = [];
  /** Child diagnostics recorded per iteration, in the order the executor drains them. */
  readonly drainedDiagnostics: Array<{ index: number; key: string }> = [];

  /** Per-first-argument-value effect outcome override (keyed by String(arg0)). */
  readonly results = new Map<string, OperationResult>();
  /** Per-first-argument-value microtask delay before the effect resolves. */
  readonly delays = new Map<string, number>();
  /** First-argument values whose effect throws a real `ThetaPanic` (one of the six closed panic sources → cause:"panic"). */
  readonly panics = new Set<string>();
  /** First-argument values whose effect throws an UNEXPECTED plain `Error` (runtime defect, not a panic source → cause:"internal_error"). */
  readonly defects = new Set<string>();
  /** First-argument values whose effect throws an uncatchable `HostFatal` (NOCEIL-3 → must propagate, never downgraded). */
  readonly hostFatals = new Set<string>();
  /** An optional gate every effect awaits before resolving (concurrency probe). */
  gate: Promise<void> | null = null;

  evaluatePure(expr: Expr, env: LexicalEnvironment): ThetaValue {
    return this.#eval(expr, env);
  }

  checkpointFor(expr: Expr): CheckpointDescriptor | null {
    if (expr.kind === "call" || expr.kind === "query" || expr.kind === "invoke") {
      return { kind: "tool-call", site: { file: "test.theta", line: 1, column: 1 } };
    }
    return null;
  }

  async runEffect(
    expr: Expr,
    env: LexicalEnvironment,
    _evaluatedToolArgs?: Record<string, ThetaValue>,
  ): Promise<OperationResult> {
    // The executor passes pre-evaluated tool-args as a field-keyed object (or
    // `undefined` for `invoke`), so the payload is derived from the effect
    // expression's first argument evaluated against the per-iteration env — the
    // loop-variable binding — which is available both under the current
    // mis-parse (a plain `for` binds it) and post-implementation.
    const payload = this.#payloadOf(expr, env);
    const key = String(payload ?? null);
    this.started.push(payload ?? null);
    this.inFlight += 1;
    this.peakInFlight = Math.max(this.peakInFlight, this.inFlight);
    try {
      if (this.gate !== null) {
        await this.gate;
      }
      await tick(this.delays.get(key) ?? 0);
      if (this.panics.has(key)) {
        // A genuine runtime panic inside the iteration: one of the six closed
        // panic sources, modelled as a real `ThetaPanic` subclass. ERR-20
        // downgrades it to that element's Err(invoke_infra, cause:"panic"); it
        // must not abort the theta.
        throw new IndexOutOfBoundsPanic(`theta panic in iteration ${key}`);
      }
      if (this.defects.has(key)) {
        // An UNEXPECTED interpreter throw (a runtime defect, NOT one of the six
        // panic sources). ERR-20 downgrades it to that element's
        // Err(invoke_infra, cause:"internal_error") — not "panic".
        throw new Error(`unexpected interpreter throw in iteration ${key}`);
      }
      if (this.hostFatals.has(key)) {
        // An uncatchable host fatal (NOCEIL-3). It must propagate unwrapped out
        // of the loop — never downgraded to an Err element.
        throw new HostFatal(`host fatal in iteration ${key}`);
      }
      return this.results.get(key) ?? ok(payload ?? null);
    } finally {
      this.inFlight -= 1;
      this.completed.push(payload ?? null);
    }
  }

  /**
   * The effect payload: the first *data* argument expression evaluated against
   * env. An `InvokeExpr`'s `args[0]` is the callee path literal (data arguments
   * are `args.slice(1)`), whereas a `CallExpr`'s `args[0]` is already the first
   * data argument — so the first data argument is `args[1]` for `invoke` and
   * `args[0]` for `call`. (Harness fix: the earlier form read `args[0]` for
   * both, which yielded the constant callee path for every `invoke` iteration
   * rather than the per-iteration loop element.)
   */
  #payloadOf(expr: Expr, env: LexicalEnvironment): ThetaValue {
    if (expr.kind === "invoke") {
      const first = expr.args[1];
      return first === undefined ? null : this.#eval(first, env);
    }
    if (expr.kind === "call") {
      const first = expr.args[0];
      return first === undefined ? null : this.#eval(first, env);
    }
    return null;
  }

  #eval(expr: Expr, env: LexicalEnvironment): ThetaValue {
    switch (expr.kind) {
      case "number":
        return Number(expr.text);
      case "string":
        return expr.value;
      case "bool":
        return expr.value;
      case "null":
        return null;
      case "ident": {
        const r = env.resolve(expr.name);
        return "value" in r ? ((r.value ?? null) as ThetaValue) : null;
      }
      case "array":
        return expr.elements.map((e) => this.#eval(e, env));
      case "binary": {
        const l = this.#eval(expr.left, env);
        const rr = this.#eval(expr.right, env);
        if (expr.op === "+") {
          return (l as number) + (rr as number);
        }
        return null;
      }
      case "index": {
        const target = this.#eval(expr.target, env);
        const idx = this.#eval(expr.index, env);
        if (Array.isArray(target)) {
          const arr = target as readonly ThetaValue[];
          if (typeof idx === "number" && (idx < 0 || idx >= arr.length)) {
            // An out-of-bounds index is a genuine runtime panic source, modelled
            // as a real `IndexOutOfBoundsPanic`; inside a `par for` body it is
            // downgraded per ERR-20 to Err(invoke_infra, cause:"panic").
            throw new IndexOutOfBoundsPanic(
              `index out of bounds: ${idx} not in 0..${arr.length}`,
            );
          }
          return arr[idx as number] ?? null;
        }
        return null;
      }
      default:
        return null;
    }
  }
}

function execDeps(
  body: ThetaBody,
  host: StatementEvalHost,
  signal?: AbortSignal,
): ExecuteBodyDeps {
  return {
    env: buildEnvironment({ body }),
    host,
    checkpoint: NOOP_CHECKPOINT,
    signal: signal ?? new AbortController().signal,
    mutator: new NoopMutator(),
    mode: "prompt",
    file: "test.theta",
  };
}

/** Parse `src` and return its body (for execution). */
function bodyOf(src: string): ThetaBody {
  return parse(src).body;
}

/** Assert `value` is a runtime `array<Result<…>>` and return it, else fail. */
function asResultArray(value: ThetaValue, why: string): readonly ThetaValue[] {
  expect(Array.isArray(value), why).toBe(true);
  const arr = value as readonly ThetaValue[];
  for (const el of arr) {
    expect(isResultValue(el), `${why}: each element is a Result value`).toBe(true);
  }
  return arr;
}

// ===========================================================================
// RUNTIME — CTRL-3: input-index ordering regardless of completion order
// ===========================================================================

describe("RFC-0003 par-for — results are input-index ordered (CTRL-3)", () => {
  it("CTRL-3: the result array is input-index ordered even when iterations complete in reverse (RED — feature absent)", async () => {
    const host = new ParForHost();
    // Higher indices resolve FIRST (fewer microtask delays), so completion order
    // is the reverse of input order; the collected array must still be input
    // ordered.
    host.delays.set("0", 6);
    host.delays.set("1", 4);
    host.delays.set("2", 2);
    host.delays.set("3", 0);

    const body = bodyOf(
      "par for i in [0, 1, 2, 3] { invoke(\"./child.theta\", i) }",
    );
    const exec = await executeBody(body, execDeps(body, host));

    expect(exec.result.present, "the fan-out yields a final value").toBe(true);
    const arr = asResultArray(
      exec.result.value as ThetaValue,
      "CTRL-3: `par for` yields array<Result<…>>",
    );
    expect(arr.length, "one Result per input element").toBe(4);
    expect(
      arr.map((el) => (el as { ok: boolean; value: ThetaValue }).value),
      "CTRL-3: element i corresponds to input element i, regardless of completion order",
    ).toEqual([0, 1, 2, 3]);
  });
});

// ===========================================================================
// RUNTIME — CTRL-1 reuse: iterand snapshot + fresh immutable loop var
// ===========================================================================

describe("RFC-0003 par-for — iterand snapshot & fresh loop var (CTRL-1 reuse)", () => {
  it("CTRL-1: every snapshotted input element is dispatched exactly once (RED — feature absent)", async () => {
    const host = new ParForHost();
    const body = bodyOf(
      "par for x in [10, 20, 30] { invoke(\"./child.theta\", x) }",
    );
    const exec = await executeBody(body, execDeps(body, host));

    const arr = asResultArray(
      exec.result.value as ThetaValue,
      "CTRL-1: the iterand snapshot is fanned out",
    );
    expect(arr.length, "one iteration per snapshot element").toBe(3);
    expect(
      [...host.started].sort((a, b) => Number(a) - Number(b)),
      "CTRL-1: each fresh loop-var binding carries its own snapshot element, dispatched once",
    ).toEqual([10, 20, 30]);
  });
});

// ===========================================================================
// RUNTIME — CTRL-2: concurrency width cap (max) and default throttle
// ===========================================================================

describe("RFC-0003 par-for — concurrency width cap (CTRL-2)", () => {
  it("CTRL-2: `max n` bounds in-flight iterations to at most n (RED — feature absent)", async () => {
    const host = new ParForHost();
    // Hold every effect open on a gate so the peak in-flight count is the
    // scheduling width the executor admits.
    let release!: () => void;
    host.gate = new Promise<void>((res) => {
      release = res;
    });

    const body = bodyOf(
      "par for f in [0, 1, 2, 3, 4, 5, 6, 7] max 3 { invoke(\"./child.theta\", f) }",
    );
    const execPromise = executeBody(body, execDeps(body, host));
    // Let the scheduler admit its initial batch.
    await tick(20);

    const peakWhileGated = host.peakInFlight;
    release();
    await execPromise;

    expect(
      host.completed.length,
      "CTRL-2: all 8 iterations run to completion (excess queues, then starts)",
    ).toBe(8);
    expect(
      peakWhileGated,
      "CTRL-2: `max 3` admits at most 3 iterations in flight at once",
    ).toBeLessThanOrEqual(3);
    expect(
      peakWhileGated,
      "CTRL-2: the fan-out is actually concurrent (more than one in flight)",
    ).toBeGreaterThan(1);
  });

  it("CTRL-2: without `max`, fan-out is bounded by the default width throttle of 64 (RED — feature absent)", async () => {
    const host = new ParForHost();
    let release!: () => void;
    host.gate = new Promise<void>((res) => {
      release = res;
    });

    // 130 elements, no `max`: excess over the 64 throttle queues.
    const inputs = Array.from({ length: 130 }, (_, i) => i).join(", ");
    const body = bodyOf(
      `par for f in [${inputs}] { invoke("./child.theta", f) }`,
    );
    const execPromise = executeBody(body, execDeps(body, host));
    await tick(50);

    const peakWhileGated = host.peakInFlight;
    release();
    await execPromise;

    expect(
      host.completed.length,
      "CTRL-2: all 130 iterations run to completion (excess queues 64-at-a-time)",
    ).toBe(130);
    expect(
      peakWhileGated,
      "CTRL-2 / #par-for-width-throttle: the default throttle bounds in-flight to 64",
    ).toBeLessThanOrEqual(64);
    expect(
      peakWhileGated,
      "CTRL-2: the fan-out is concurrent up to the throttle (well above 1)",
    ).toBeGreaterThan(1);
  });

  it("CTRL-2: a `max` above the throttle clamps down to 64 (RED — feature absent)", async () => {
    const host = new ParForHost();
    let release!: () => void;
    host.gate = new Promise<void>((res) => {
      release = res;
    });

    const inputs = Array.from({ length: 130 }, (_, i) => i).join(", ");
    const body = bodyOf(
      `par for f in [${inputs}] max 1000 { invoke("./child.theta", f) }`,
    );
    const execPromise = executeBody(body, execDeps(body, host));
    await tick(50);

    const peakWhileGated = host.peakInFlight;
    release();
    await execPromise;

    expect(
      peakWhileGated,
      "CTRL-2: a `max` exceeding the throttle clamps to the 64 throttle (not the 130 elements, not the requested 1000)",
    ).toBeLessThanOrEqual(64);
    expect(
      peakWhileGated,
      "CTRL-2: the fan-out is actually concurrent (well above 1) — proving the clamp is to 64, not down to sequential",
    ).toBeGreaterThan(1);
  });
});

// ===========================================================================
// RUNTIME — CTRL-5: run-to-completion; per-element Err isolation
// ===========================================================================

describe("RFC-0003 par-for — run-to-completion & per-element Err (CTRL-5)", () => {
  it("CTRL-5: one iteration's `Err` does not cancel siblings; it becomes that element's value (RED — feature absent)", async () => {
    const host = new ParForHost();
    const failure: QueryError = {
      kind: "validation",
      cause: "schema_validation",
      message: "bad element",
      attempts: 0,
      validation_errors: [],
      raw_response: null,
    };
    host.results.set("1", errResult(failure));

    const body = bodyOf(
      "par for f in [0, 1, 2] { invoke(\"./child.theta\", f) }",
    );
    const exec = await executeBody(body, execDeps(body, host));

    const arr = asResultArray(
      exec.result.value as ThetaValue,
      "CTRL-5: `par for` yields a full array even with a failing element",
    );
    expect(arr.length, "all siblings run to completion").toBe(3);

    const el1 = arr[1] as { ok: boolean; error?: QueryError };
    expect(el1.ok, "CTRL-5: element 1 is an Err").toBe(false);
    expect(el1.error?.kind, "CTRL-5: element 1 carries its own QueryError").toBe(
      "validation",
    );
    expect(
      (arr[0] as { ok: boolean }).ok && (arr[2] as { ok: boolean }).ok,
      "CTRL-5: siblings 0 and 2 still complete successfully",
    ).toBe(true);
  });
});

// ===========================================================================
// RUNTIME — ERR-20: per-iteration panic downgrade
// ===========================================================================

describe("RFC-0003 par-for — per-iteration panic downgrade (ERR-20)", () => {
  it("ERR-20: a panic inside one iteration becomes that element's Err(invoke_infra, panic); siblings complete (RED — feature absent)", async () => {
    const host = new ParForHost();
    host.panics.add("1"); // iteration for input `1` panics.

    const body = bodyOf(
      "par for f in [0, 1, 2] { invoke(\"./child.theta\", f) }",
    );

    let threw = false;
    let exec: Awaited<ReturnType<typeof executeBody>> | undefined;
    try {
      exec = await executeBody(body, execDeps(body, host));
    } catch {
      threw = true;
    }
    expect(
      threw,
      "ERR-20: a per-iteration panic must NOT abort the theta (the iteration boundary is a panic-downgrade point)",
    ).toBe(false);

    const arr = asResultArray(
      exec?.result.value as ThetaValue,
      "ERR-20: the loop still yields a full array<Result<…>>",
    );
    expect(arr.length, "ERR-20: siblings run to completion, full array yielded").toBe(3);

    const el1 = arr[1] as { ok: boolean; error?: QueryError };
    expect(el1.ok, "ERR-20: the panicking element is an Err").toBe(false);
    expect(el1.error?.kind, "ERR-20: kind is 'invoke_infra'").toBe("invoke_infra");
    expect(
      (el1.error as { cause?: string } | undefined)?.cause,
      "ERR-20: a genuine ThetaPanic downgrades with cause 'panic'",
    ).toBe("panic");
    expect(
      (el1.error as { message?: string } | undefined)?.message,
      "ERR-20: the downgrade carries the thrown panic's message",
    ).toBe("theta panic in iteration 1");
  });

  it("ERR-20: an UNEXPECTED throw (runtime defect, not a panic source) downgrades to that element's Err(invoke_infra, cause:'internal_error')", async () => {
    // Mirrors the invoke boundary (`runInvokeChild`): a thrown value that is NOT
    // a `ThetaPanic` is an interpreter defect routed to the parent as
    // Err(invoke_infra, cause:"internal_error") — NOT "panic". This locks in the
    // fix for the collapse defect where every throw became cause:"panic".
    const host = new ParForHost();
    host.defects.add("1"); // iteration for input `1` throws a plain Error.

    const body = bodyOf(
      "par for f in [0, 1, 2] { invoke(\"./child.theta\", f) }",
    );

    let threw = false;
    let exec: Awaited<ReturnType<typeof executeBody>> | undefined;
    try {
      exec = await executeBody(body, execDeps(body, host));
    } catch {
      threw = true;
    }
    expect(
      threw,
      "ERR-20: an unexpected iteration throw must NOT abort the theta (it is downgraded)",
    ).toBe(false);

    const arr = asResultArray(
      exec?.result.value as ThetaValue,
      "ERR-20: the loop still yields a full array<Result<…>>",
    );
    expect(arr.length, "ERR-20: siblings run to completion, full array yielded").toBe(3);

    const el1 = arr[1] as { ok: boolean; error?: QueryError };
    expect(el1.ok, "ERR-20: the defecting element is an Err").toBe(false);
    expect(el1.error?.kind, "ERR-20: kind is 'invoke_infra'").toBe("invoke_infra");
    expect(
      (el1.error as { cause?: string } | undefined)?.cause,
      "ERR-20: a non-panic (defect) throw downgrades with cause 'internal_error', NOT 'panic'",
    ).toBe("internal_error");
    expect(
      (el1.error as { message?: string } | undefined)?.message,
      "ERR-20: the internal_error downgrade carries the thrown error's message",
    ).toBe("unexpected interpreter throw in iteration 1");
    // Siblings are ordinary Ok values.
    expect((arr[0] as { ok: boolean }).ok, "ERR-20: sibling 0 completes Ok").toBe(true);
    expect((arr[2] as { ok: boolean }).ok, "ERR-20: sibling 2 completes Ok").toBe(true);
  });

  it("ERR-20/NOCEIL-3: a HostFatal thrown in an iteration is NOT downgraded — it propagates unwrapped", async () => {
    // NOCEIL-3 (hard-ceilings.md): an uncatchable host fatal terminates the
    // process; the iteration boundary must rethrow it (as the invoke boundary
    // does), never collapse it into an Err element. Modelled via the `HostFatal`
    // marker so the carve-out is testable without a production V8 OOM.
    const host = new ParForHost();
    host.hostFatals.add("1"); // iteration for input `1` raises a host fatal.

    const body = bodyOf(
      "par for f in [0, 1, 2] { invoke(\"./child.theta\", f) }",
    );

    let thrown: unknown;
    let exec: Awaited<ReturnType<typeof executeBody>> | undefined;
    try {
      exec = await executeBody(body, execDeps(body, host));
    } catch (e) {
      thrown = e;
    }
    expect(
      exec,
      "ERR-20/NOCEIL-3: a HostFatal must NOT be downgraded to a value/Err element",
    ).toBeUndefined();
    expect(
      thrown instanceof HostFatal,
      "ERR-20/NOCEIL-3: the HostFatal propagates unwrapped out of the loop",
    ).toBe(true);
  });

  it("ERR-20: a pure-computation panic (no invoke) downgrades with callee_path = enclosing .theta path (RED — feature absent)", async () => {
    // ERR-20: for the no-invoke case there is no callee to name, so the
    // InvokeInfraError's required `callee_path` is the path of the `.theta` file
    // containing the `par for` body (the enclosing source file — here
    // "enclosing.theta").
    const host = new ParForHost();
    const src = "par for x in [0, 1] { let a = [7]\n a[9] }";
    const body = parse(src, "enclosing.theta").body;

    let threw = false;
    let exec: Awaited<ReturnType<typeof executeBody>> | undefined;
    try {
      exec = await executeBody(body, {
        ...execDeps(body, host),
        file: "enclosing.theta",
      });
    } catch {
      threw = true;
    }
    expect(
      threw,
      "ERR-20: a pure-computation panic in a no-invoke body is downgraded, not thrown out of the theta",
    ).toBe(false);

    const arr = asResultArray(
      exec?.result.value as ThetaValue,
      "ERR-20: the no-invoke panic case still yields a full array",
    );
    expect(arr.length, "ERR-20: one Result per element").toBe(2);
    for (const el of arr) {
      const e = el as { ok: boolean; error?: QueryError };
      expect(e.ok, "ERR-20: an out-of-bounds index panics per element").toBe(false);
      expect(e.error?.kind, "ERR-20: kind is 'invoke_infra'").toBe("invoke_infra");
      expect(
        (e.error as { cause?: string } | undefined)?.cause,
        "ERR-20: cause is 'panic'",
      ).toBe("panic");
      expect(
        (e.error as { callee_path?: string } | undefined)?.callee_path,
        "ERR-20: no-invoke callee_path is the enclosing .theta source path",
      ).toBe("enclosing.theta");
    }
  });
});

// ===========================================================================
// RUNTIME — CTRL-5: cancellation
// ===========================================================================

describe("RFC-0003 par-for — cancellation (CTRL-5)", () => {
  // CTRL-5 distinguishes TWO cancellation forms (see control-flow.md #ctrl-5 and
  // the RFC's Cancellation bullet, clarified alongside this suite):
  //   (a)/(b) WHOLE-THETA cancellation — the enclosing theta's `AbortSignal`
  //           fires — is a terminal `Cancelled` outcome: NO final value flows
  //           (`present === false`), consistent with FN-5 and the terminal-
  //           outcome trichotomy; the partial array is NOT a top-level value.
  //   (c)     PER-ELEMENT cancellation — a child cancelled within the
  //           run-to-completion model (enclosing signal NOT fired) — becomes
  //           that element's `Err(cancelled)` value in the collected array.

  it("CTRL-5 (whole-theta, pre-abort): a signal already aborted at loop entry starts no iteration and yields a terminal Cancelled outcome with no final value (RED — feature absent)", async () => {
    const host = new ParForHost();
    const controller = new AbortController();
    controller.abort(); // enclosing theta already cancelled at loop entry.

    const body = bodyOf(
      "let r = par for f in [0, 1, 2, 3] { invoke(\"./child.theta\", f) }\nr",
    );
    // This cancellation contract is about the `par for` form, so the source must
    // lower to a `par-for` node for the assertions below to mean anything (RED
    // today — the form mis-parses to `par` + a plain `for` statement).
    expect(
      parForNodes(body).length,
      "the source must lower to a `par-for` for the whole-theta cancellation contract to apply",
    ).toBeGreaterThan(0);

    const exec = await executeBody(body, execDeps(body, host, controller.signal));

    expect(
      host.started.length,
      "CTRL-5 whole-theta cancellation: not-yet-started iterations do not start (none start under a pre-aborted signal)",
    ).toBe(0);
    expect(
      exec.outcome,
      "CTRL-5 whole-theta cancellation: the terminal outcome is Cancelled",
    ).toBe("cancel");
    expect(
      exec.result.present,
      "CTRL-5 / FN-5: no final value flows under whole-theta cancellation (the partial array is NOT surfaced as a top-level value)",
    ).toBe(false);
  });

  it("CTRL-5 (whole-theta, in-flight abort): aborting after a concurrent batch has started cancels in-flight iterations, starts no queued iteration, and yields a terminal Cancelled outcome with no final value (RED — feature absent)", async () => {
    const host = new ParForHost();
    const controller = new AbortController();
    // Hold every effect open on a gate so a concurrent batch is genuinely in
    // flight (not merely not-yet-started) at the moment the abort lands.
    let release!: () => void;
    host.gate = new Promise<void>((res) => {
      release = res;
    });

    const body = bodyOf(
      "let r = par for f in [0, 1, 2, 3, 4, 5, 6, 7] max 3 { invoke(\"./child.theta\", f) }\nr",
    );
    const execPromise = executeBody(
      body,
      execDeps(body, host, controller.signal),
    );
    // Let the scheduler admit its first gated batch (`max 3`).
    await tick(20);
    const startedWhileInFlight = host.started.length;
    const peakWhileInFlight = host.peakInFlight;

    controller.abort(); // whole-theta cancellation, mid-flight.
    release();
    const exec = await execPromise;

    expect(
      peakWhileInFlight,
      "CTRL-5: the abort lands with a concurrent batch actually in flight (more than one iteration running)",
    ).toBeGreaterThan(1);
    expect(
      startedWhileInFlight,
      "CTRL-5: at least the first gated batch had started before the abort (in-flight cancellation is exercised, not only not-yet-started)",
    ).toBeGreaterThanOrEqual(1);
    expect(
      host.started.length,
      "CTRL-5 whole-theta cancellation: queued (not-yet-started) iterations do not start once the signal fires",
    ).toBeLessThan(8);
    expect(
      exec.outcome,
      "CTRL-5 whole-theta cancellation: the terminal outcome is Cancelled",
    ).toBe("cancel");
    expect(
      exec.result.present,
      "CTRL-5 / FN-5: no final value flows under whole-theta cancellation",
    ).toBe(false);
  });

  it("CTRL-5 (per-element): a child cancelled within the run-to-completion model becomes that element's Err(cancelled); siblings complete and the loop outcome is Success (RED — feature absent)", async () => {
    const host = new ParForHost();
    const cancelled: QueryError = { kind: "cancelled", message: "cancelled" };
    host.results.set("1", errResult(cancelled)); // element 1's child is cancelled.

    // The enclosing theta's signal is NOT aborted — this is per-element, not
    // whole-theta, cancellation, so the loop runs to completion.
    const body = bodyOf(
      "par for f in [0, 1, 2] { invoke(\"./child.theta\", f) }",
    );
    const exec = await executeBody(body, execDeps(body, host));

    expect(
      exec.outcome,
      "CTRL-5 per-element: with no whole-theta abort the loop runs to completion (Success outcome)",
    ).toBe("success");
    const arr = asResultArray(
      exec.result.value as ThetaValue,
      "CTRL-5 per-element: the loop yields a full array even with a cancelled element",
    );
    expect(arr.length, "all siblings run to completion").toBe(3);

    const el1 = arr[1] as { ok: boolean; error?: QueryError };
    expect(el1.ok, "CTRL-5 per-element: element 1 is an Err").toBe(false);
    expect(
      el1.error?.kind,
      "CTRL-5 per-element: a cancelled iteration carries the CancelledError envelope as its element value (kind 'cancelled')",
    ).toBe("cancelled");
    expect(
      (arr[0] as { ok: boolean }).ok && (arr[2] as { ok: boolean }).ok,
      "CTRL-5 per-element: cancelling one child does not cancel its siblings",
    ).toBe(true);
  });
});

// ===========================================================================
// RUNTIME — CTRL-3: child-diagnostic drain grouped by input index
// ===========================================================================

describe("RFC-0003 par-for — diagnostics drain grouped by input index (CTRL-3)", () => {
  // ---- Chosen diagnostics-drain seam (F1) --------------------------------
  //
  // The executor's `StatementEvalHost` / `ExecuteBodyDeps` surface exposes NO
  // diagnostic drain today, and child (invoke) diagnostics do NOT flow through
  // `executeBody` at all — they are routed by the composition layer's
  // `emitDiagnostic` sink / `theta-system-note` runtime-event channel
  // (production-composition.ts / runtime-event-channel.ts), which the executor
  // never sees. There is therefore no existing executor-level surface to target
  // (option (a) is unavailable), so CTRL-3's "child diagnostics aggregate …
  // grouped by input index, then (file,line,col)" requires a NEW, minimal seam
  // on the effect boundary the executor already drives. Two additive implementer
  // obligations (documented here and in the handoff notes):
  //
  //   (A) TRANSPORT — a `par for` iteration's effect result MAY carry the child
  //       session's diagnostics on an additive `childDiagnostics` field of the
  //       `OperationResult` returned by `runEffect`. The executor collects them
  //       tagged by input index.
  //   (B) SINK — `StatementEvalHost` gains
  //         `drainChildDiagnostics(index: number, diagnostics: readonly Diagnostic[]): void`
  //       and, at the `par for` join (after all iterations settle), the executor
  //       MUST call it once per input index in ASCENDING index order, each call
  //       carrying that iteration's diagnostics in the existing (file, line, col)
  //       order — turning the nondeterministic completion order into the
  //       deterministic (input-index, then (file,line,col)) drain order.
  //
  // The test targets (B) as the observable and drives (A) through the double. It
  // reds feature-absent today: base `StatementEvalHost` has no
  // `drainChildDiagnostics`, and `par for` is not fanned out, so the recorder is
  // never fed. A correct implementation of (A)+(B) turns it green.

  type ChildDiagResult = OperationResult & {
    readonly childDiagnostics?: readonly Diagnostic[];
  };

  interface ParForDiagnosticSink extends StatementEvalHost {
    drainChildDiagnostics(
      index: number,
      diagnostics: readonly Diagnostic[],
    ): void;
  }

  /** A child diagnostic located at `child.theta:<line>:1` (fixes (file,line,col)). */
  function childDiag(line: number, code: string): Diagnostic {
    return {
      severity: "warning",
      code,
      file: "child.theta",
      range: { start: { line, column: 1 }, end: { line, column: 2 } },
      message: `child diagnostic @${line}`,
    };
  }

  class DrainRecordingHost extends ParForHost implements ParForDiagnosticSink {
    /** Seeded per-input-index child diagnostics (already in (file,line,col) order). */
    readonly childDiagnostics = new Map<number, readonly Diagnostic[]>();
    /** The drain calls the executor made, in call order (obligation (B)). */
    readonly drained: Array<{ index: number; diags: readonly Diagnostic[] }> = [];

    drainChildDiagnostics(
      index: number,
      diagnostics: readonly Diagnostic[],
    ): void {
      this.drained.push({ index, diags: diagnostics });
    }

    override async runEffect(
      expr: Expr,
      env: LexicalEnvironment,
      args?: Record<string, ThetaValue>,
    ): Promise<ChildDiagResult> {
      // Obligation (A): attach the iteration's child diagnostics to the effect
      // result. The element value equals the input index in this test, so the
      // result value keys the seed.
      const base = await super.runEffect(expr, env, args);
      const index = Number((base as { value?: ThetaValue }).value);
      const diags = this.childDiagnostics.get(index);
      return diags === undefined
        ? base
        : ({ ...base, childDiagnostics: diags } as ChildDiagResult);
    }
  }

  it("CTRL-3: child diagnostics drain grouped by input index, then (file,line,col), regardless of completion order (RED — feature absent)", async () => {
    const host = new DrainRecordingHost();
    // Each iteration emits two child diagnostics, in (file,line,col) order.
    host.childDiagnostics.set(0, [childDiag(1, "a"), childDiag(2, "b")]);
    host.childDiagnostics.set(1, [childDiag(11, "a"), childDiag(12, "b")]);
    host.childDiagnostics.set(2, [childDiag(21, "a"), childDiag(22, "b")]);
    // Completion order is the REVERSE of input order (index 2 finishes first),
    // so a naive completion-order drain would NOT be input-index ordered — the
    // executor must reorder to input index.
    host.delays.set("0", 6);
    host.delays.set("1", 4);
    host.delays.set("2", 2);

    const body = bodyOf(
      "par for f in [0, 1, 2] { invoke(\"./child.theta\", f) }",
    );
    await executeBody(body, execDeps(body, host));

    expect(
      host.drained.length,
      "CTRL-3: the executor drains child diagnostics through the ordered `drainChildDiagnostics` sink",
    ).toBeGreaterThan(0);

    // (1) Grouped by input index: the drain-call indices are non-decreasing
    // (not completion order, which is 2,1,0).
    const indices = host.drained.map((d) => d.index);
    expect(
      indices,
      "CTRL-3: child diagnostics are grouped by input index (ascending), not by completion order",
    ).toEqual([...indices].sort((a, b) => a - b));

    // (2) Then by (file,line,col): flattening the drained diagnostics yields a
    // sequence ordered by (input index, then line) — here strictly ascending
    // lines 1,2,11,12,21,22 — even though iterations completed 2,1,0.
    const lines = host.drained.flatMap((d) =>
      d.diags.map((g) => g.range?.start.line ?? 0),
    );
    expect(
      lines,
      "CTRL-3: within each input index the existing (file,line,col) order is preserved",
    ).toEqual([...lines].sort((a, b) => a - b));
    expect(
      lines,
      "CTRL-3: every seeded child diagnostic is drained exactly once",
    ).toHaveLength(6);
  });
});

// ===========================================================================
// HARD CEILINGS — width throttle is NOT a routing-class breach (NOCEIL-5);
// depth-32 invoke ceiling still applies per iteration
// ===========================================================================

describe("RFC-0003 par-for — width throttle is not a ceiling breach (NOCEIL-5)", () => {
  it("#par-for-width-throttle: exceeding 64 in-flight queues rather than breaching — no panic/Err from width (RED — feature absent)", async () => {
    const host = new ParForHost();
    // 200 elements, no `max`, all succeed: exceeding the 64 throttle must queue
    // and run to completion, NOT surface a routing-class ceiling breach.
    const inputs = Array.from({ length: 200 }, (_, i) => i).join(", ");
    const body = bodyOf(
      `par for f in [${inputs}] { invoke("./child.theta", f) }`,
    );

    let threw = false;
    let exec: Awaited<ReturnType<typeof executeBody>> | undefined;
    try {
      exec = await executeBody(body, execDeps(body, host));
    } catch {
      threw = true;
    }
    expect(
      threw,
      "NOCEIL-5: exceeding the width throttle must not throw a ceiling breach",
    ).toBe(false);

    const arr = asResultArray(
      exec?.result.value as ThetaValue,
      "NOCEIL-5: a wide `par for` runs to completion 64-at-a-time",
    );
    expect(arr.length, "NOCEIL-5: all 200 iterations complete (excess queued)").toBe(
      200,
    );
    expect(
      arr.every((el) => (el as { ok: boolean }).ok),
      "NOCEIL-5: no element is an Err purely from exceeding the width throttle",
    ).toBe(true);
  });
});
