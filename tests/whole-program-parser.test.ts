import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { LoomSource } from "../src/lexer/lexer";
import type {
  SystemNoteChannelDeps,
  SystemNoteSender,
} from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import {
  parseLoomDocument,
  type Expr,
  type ExportDecl,
  type ForStmt,
  type FnDecl,
  type ImportDecl,
  type LetStmt,
  type LoomDocument,
  type MatchExpr,
  type ObjectExpr,
  type ParseLoomDocumentDeps,
  type QueryStmt,
  type ReassignStmt,
  type TryExpr,
} from "../src/parser/loom-document";
import {
  DISCARDED_QUERY_RESULT_CODE,
  DISCARDED_QUERY_RESULT_MESSAGE,
} from "../src/runtime/query-discard";

// V19a-T — failing tests for the paired `V19a` whole-program parser.
//
// Spec: implementation-notes.md §Parser *Contract* — the un-anchored
// whole-`.loom`/`.warp`-file parse into the executable `LoomBody ::= Stmt* Expr?`
// body statement-list AST the interpreter walks (`cka-49`), covering every
// top-level statement / declaration kind (grammar.md §"Block expressions",
// §"fn declarations", §"schema X by <field>", §"/// placement",
// §"Newline continuation"), applying V1a's newline-continuation lexer (`cka-1`)
// as an integration witness, and aggregating whole-file multi-error diagnostics
// sorted `(file, line, col)` (diagnostics.md §"Multi-error reporting") by
// delegating to the existing V-slice parse-checkers over the real AST.
//
// `V19a` closes only `cka-49`; the delegated checkers' REQ-IDs / tokens
// (`V3b` immutable-rebinding / BNDS, `V5c` doc-comment placement / DESC, …) are
// exercised here only as integration witnesses of the aggregation and are not
// re-closed.
//
// These tests red because the `V19a` whole-file parser is absent —
// `parseLoomDocument` is an inert stub returning an empty body, no frontmatter,
// and no diagnostics — so each test reds on its own primary assertion (an empty
// body where a node was expected, a missing tail `Expr`, a wrong statement count
// where continuation should have joined / split a statement, or an empty
// `diagnostics` array where the delegated checkers should have aggregated
// sorted errors), not on a compile error, a missing fixture, or a harness throw.

// --- seam doubles ---------------------------------------------------------

function recordingDeps(): {
  deps: ParseLoomDocumentDeps;
  delivered: Diagnostic[][];
} {
  const delivered: Diagnostic[][] = [];
  const pi: SystemNoteSender = {
    sendMessage: (message): void => {
      if ("diagnostics" in message.details) {
        delivered.push([...message.details.diagnostics]);
      }
    },
  };
  const systemNote: SystemNoteChannelDeps = {
    pi,
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  // A trivially-resolving `model:` matcher — the frontmatter model hook is not
  // under test here.
  const modelMatcher: ModelReferenceMatcher = {
    resolve: (): "resolved" => "resolved",
  };
  return { deps: { systemNote, modelMatcher }, delivered };
}

/** Parse a UTF-8 `.loom` source string into a {@link LoomDocument}. */
function parse(src: string, path = "test.loom"): LoomDocument {
  const { deps } = recordingDeps();
  const source: LoomSource = {
    path,
    bytes: new TextEncoder().encode(src),
  };
  return parseLoomDocument(source, deps);
}

// --------------------------------------------------------------------------
// cka-49 — whole-file body-AST production
// --------------------------------------------------------------------------

describe("cka-49: whole-file parse into the LoomBody statement-list AST", () => {
  it("parses the entire file — not a single expression — into { frontmatter, body, diagnostics }", () => {
    // cka-49 (implementation-notes.md §Parser *Contract*): the whole `.loom`
    // file, every top-level form, is walked into the executable body.
    const doc = parse(
      ["let a = 1", "let b = 2", "let c = 3"].join("\n"),
    );

    expect(doc).toHaveProperty("frontmatter");
    expect(doc).toHaveProperty("body");
    expect(doc).toHaveProperty("diagnostics");

    // Reds on the stub's empty body: every top-level statement of the file is
    // present in the body statement-list, not just the first form.
    expect(doc.body.statements.length).toBeGreaterThanOrEqual(3);
  });

  it("captures the optional trailing tail Expr (LoomBody = Stmt* Expr?)", () => {
    // cka-49: the final expression of the file is the body's tail `Expr`.
    const doc = parse(["let a = 1", "a + 1"].join("\n"));
    expect(doc.body.tail).not.toBeNull();
    expect(doc.body.tail?.kind).toBe("binary");
  });

  it("leaves the tail null when the last form is a statement", () => {
    // cka-49: an annotation-less body whose last form is a statement has no
    // tail `Expr` (grammar.md §"Block expressions").
    const doc = parse(["let a = 1", "let b = 2"].join("\n"));
    expect(doc.body.tail).toBeNull();
    expect(doc.body.statements.length).toBeGreaterThanOrEqual(2);
  });
});

// --------------------------------------------------------------------------
// cka-49 — statement-kind coverage
// --------------------------------------------------------------------------

describe("cka-49: statement-kind coverage", () => {
  // A representative program exercising every statement kind the LoomBody
  // admits; break / continue sit inside a loop and return inside a fn body per
  // their placement rules.
  const program = [
    "fn greet(name: string): string {",
    "  return name",
    "}",
    "",
    "let mut count = 0",
    "let total = 10",
    "count += 1",
    "count = 5",
    "",
    "if count > 0 {",
    "  count += 1",
    "} else {",
    "  count = 0",
    "}",
    "",
    "while count < total {",
    "  count += 1",
    "}",
    "",
    "for item in [1, 2, 3] {",
    "  break",
    "  continue",
    "}",
    "",
    "count",
    "greet(\"world\")",
    "invoke(\"./child.loom\", count)",
    "@`Summarise the count.`",
    "count + total",
  ].join("\n");

  it("parses let / let mut into LetStmt nodes", () => {
    // cka-49 (bindings.md `LetStmt`).
    const { body } = parse(program);
    const lets = body.statements.filter(
      (s): s is LetStmt => s.kind === "let",
    );
    expect(lets.some((s) => s.mutable)).toBe(true);
    expect(lets.some((s) => !s.mutable)).toBe(true);
  });

  it("parses statement-form reassignment including += into ReassignStmt nodes", () => {
    // cka-49 (bindings.md — statement-form reassignment).
    const { body } = parse(program);
    const reassigns = body.statements.filter(
      (s): s is ReassignStmt => s.kind === "reassign",
    );
    expect(reassigns.some((s) => s.op === "=")).toBe(true);
    expect(reassigns.some((s) => s.op === "+=")).toBe(true);
  });

  it("parses if / else into an IfStmt node with an else arm", () => {
    // cka-49 (control-flow.md `IfStmt`).
    const { body } = parse(program);
    const ifStmt = body.statements.find((s) => s.kind === "if");
    expect(ifStmt).toBeDefined();
    expect(ifStmt?.kind === "if" ? ifStmt.otherwise : null).not.toBeNull();
  });

  it("parses while into a WhileStmt node", () => {
    // cka-49 (control-flow.md `WhileStmt`).
    const { body } = parse(program);
    expect(body.statements.some((s) => s.kind === "while")).toBe(true);
  });

  it("parses for … in into a ForStmt node with break / continue in its body", () => {
    // cka-49 (control-flow.md `ForStmt`, break / continue).
    const { body } = parse(program);
    const forStmt = body.statements.find(
      (s): s is ForStmt => s.kind === "for",
    );
    expect(forStmt).toBeDefined();
    expect(forStmt?.body.statements.some((s) => s.kind === "break")).toBe(true);
    expect(forStmt?.body.statements.some((s) => s.kind === "continue")).toBe(
      true,
    );
  });

  it("parses a top-level fn into an FnDecl node carrying a return in its body", () => {
    // cka-49 (functions.md `FnDecl`, return.md).
    const { body } = parse(program);
    const fn = body.statements.find((s): s is FnDecl => s.kind === "fn");
    expect(fn).toBeDefined();
    expect(fn?.body.statements.some((s) => s.kind === "return")).toBe(true);
  });

  it("parses an @…` query statement into a QueryStmt node", () => {
    // cka-49 (query.md — statement-position query).
    const { body } = parse(program);
    expect(body.statements.some((s) => s.kind === "query")).toBe(true);
  });

  it("parses a code-tool call <name>(args) into a ToolCallStmt node", () => {
    // cka-49 (tool-calls.md — code-side tool call).
    const { body } = parse(program);
    expect(body.statements.some((s) => s.kind === "tool-call")).toBe(true);
  });

  it("parses invoke(...) into an InvokeStmt node", () => {
    // cka-49 (invocation.md — invoke call).
    const { body } = parse(program);
    expect(body.statements.some((s) => s.kind === "invoke")).toBe(true);
  });

  it("parses a bare expression statement into an ExprStmt node", () => {
    // cka-49 (grammar.md — bare expression statement in non-tail position).
    const { body } = parse(program);
    expect(body.statements.some((s) => s.kind === "expr")).toBe(true);
  });
});

// --------------------------------------------------------------------------
// cka-49 — declaration-kind coverage
// --------------------------------------------------------------------------

describe("cka-49: declaration-kind coverage", () => {
  const decls = [
    "/// A point in the plane.",
    "schema Point { x: integer, y: integer }",
    "",
    "enum Color { Red, Green }",
    "",
    "import { helper } from \"./lib.warp\"",
    "export { helper } from \"./lib.warp\"",
  ].join("\n");

  it("parses schema into a SchemaDecl node", () => {
    // cka-49 (schemas.md `SchemaDecl`).
    const { body } = parse(decls);
    expect(body.statements.some((s) => s.kind === "schema")).toBe(true);
  });

  it("parses enum into an EnumDecl node", () => {
    // cka-49 (schemas.md `EnumDecl`).
    const { body } = parse(decls);
    expect(body.statements.some((s) => s.kind === "enum")).toBe(true);
  });

  it("parses import / export … from into ImportDecl / ExportDecl nodes", () => {
    // cka-49 (imports.md import / export forms).
    const { body } = parse(decls);
    const imp = body.statements.find(
      (s): s is ImportDecl => s.kind === "import",
    );
    const exp = body.statements.find(
      (s): s is ExportDecl => s.kind === "export",
    );
    expect(imp?.path).toBe("./lib.warp");
    expect(exp?.path).toBe("./lib.warp");
  });

  it("parses a /// doc-comment run into a DocComment node", () => {
    // cka-49 (descriptions.md `DocComment`).
    const { body } = parse(decls);
    expect(body.statements.some((s) => s.kind === "doc-comment")).toBe(true);
  });
});

// --------------------------------------------------------------------------
// cka-49 — newline continuation (grammar.md §"Newline continuation")
// --------------------------------------------------------------------------

describe("cka-49: newline continuation triggers (V1a cka-1 integration witness)", () => {
  it("continues across a newline on an unmatched open bracket", () => {
    // cka-49: `[` open trigger — one statement across three lines.
    const { body } = parse(["let xs = [", "  1, 2, 3", "]"].join("\n"));
    expect(body.statements.length).toBe(1);
  });

  it("continues across a newline on a trailing binary operator", () => {
    // cka-49: trailing-operator trigger — one `let` whose init is a binary expr.
    const { body } = parse(["let x = a +", "  b"].join("\n"));
    expect(body.statements.length).toBe(1);
    const let_ = body.statements.find((s): s is LetStmt => s.kind === "let");
    expect(let_?.init?.kind).toBe("binary");
  });

  it("continues across a newline on a leading binary operator", () => {
    // cka-49: leading-operator trigger — one statement.
    const { body } = parse(["let x = a", "  + b"].join("\n"));
    expect(body.statements.length).toBe(1);
  });

  it("continues across a newline on a trailing comma inside an open group", () => {
    // cka-49: trailing-comma trigger — the multi-line call arguments group into
    // ONE form (the continuation witness, orthogonal to tail promotion). That
    // one bare-call form is the body's tail `Expr` — its value is the body's
    // final value (functions.md FN-5), so it is promoted to `tail` with no
    // residual statement, not left as a discarded action statement. The
    // lexer-level grouping witness is `lexer-core.test.ts` (`statementGroups`
    // length 1); here the parser confirms the joined line is a SINGLE form.
    const { body } = parse(["f(a,", "  b)"].join("\n"));
    expect(body.statements.length).toBe(0);
    expect(body.tail?.kind).toBe("call");
  });

  it("does NOT continue on the postfix error-propagation ? (ERR-18)", () => {
    // cka-49 / grammar.md §"Newline continuation": postfix `?` is a
    // complete-expression terminator — it closes its statement and never joins
    // the following line into one continued statement. `foo()?` is its own
    // statement (a `try`); the trailing `bar()` is the body's tail `Expr` (the
    // last expression is the body's value). The two forms stay SEPARATE — the
    // `?` did not swallow the statement boundary into a single joined statement.
    const { body } = parse(["foo()?", "bar()"].join("\n"));
    expect(body.statements.length).toBe(1);
    // `foo()?` is an expression statement wrapping the `try` (a `?`-terminated
    // form is not a lone call/invoke/query action statement).
    const stmt0 = body.statements[0];
    expect(stmt0?.kind).toBe("expr");
    expect(stmt0 && "expr" in stmt0 ? stmt0.expr.kind : null).toBe("try");
    expect(body.tail?.kind).toBe("call");
  });

  it("does not break a held continuation across blank lines", () => {
    // cka-49: blank lines inside a held continuation do not close the statement.
    const { body } = parse(["let x =", "", "  foo"].join("\n"));
    expect(body.statements.length).toBe(1);
  });
});

// --------------------------------------------------------------------------
// cka-49 — whole-file multi-error diagnostic aggregation
// --------------------------------------------------------------------------

describe("cka-49: whole-file multi-error aggregation (no fast-fail, sorted)", () => {
  // Two independent immutable-rebinding errors (V3b `checkReassignment`,
  // `loom/parse/immutable-rebinding`) plus a misplaced `///` (V5c
  // `checkDocCommentPlacement`, `loom/parse/doc-comment-misplaced`) — each a
  // parse-time check delegated over the real AST.
  const multiError = [
    "let x = 1",
    "let y = 2",
    "x = 10",
    "y = 20",
    "/// stray doc",
    "let z = 3",
  ].join("\n");

  it("emits every independent statement error in one pass (no fast-fail)", () => {
    // cka-49: the whole-file parse aggregates every delegated checker's
    // diagnostic rather than stopping at the first.
    const { diagnostics } = parse(multiError);
    expect(diagnostics.length).toBeGreaterThanOrEqual(2);
    expect(
      diagnostics.some((d) => d.code === "loom/parse/immutable-rebinding"),
    ).toBe(true);
    expect(
      diagnostics.some((d) => d.code === "loom/parse/doc-comment-misplaced"),
    ).toBe(true);
  });

  it("sorts the aggregated diagnostics by (file, line, col)", () => {
    // cka-49 (diagnostics.md §"Multi-error reporting").
    const { diagnostics } = parse(multiError);
    expect(diagnostics.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < diagnostics.length; i++) {
      const prev = diagnostics[i - 1]!;
      const cur = diagnostics[i]!;
      const key = (d: Diagnostic): [string, number, number] => [
        d.file ?? "",
        d.range?.start.line ?? 0,
        d.range?.start.column ?? 0,
      ];
      const [pf, pl, pc] = key(prev);
      const [cf, cl, cc] = key(cur);
      const ordered =
        pf < cf || (pf === cf && (pl < cl || (pl === cl && pc <= cc)));
      expect(ordered).toBe(true);
    }
  });
});

// --------------------------------------------------------------------------
// Core-execution deficiency fix — body-grammar productions for `match`, object
// literals, and postfix member / index access (grammar.md §"Loom literal
// sublanguage" `BareObjectLit`/`NamedObjectLit`, expressions.md §`match`
// expression / §"Member access" / §"Index access").
// --------------------------------------------------------------------------

describe("core-exec: postfix member access `.field` in the body grammar", () => {
  it("parses `s.label` into a member node over an ident target", () => {
    const doc = parse(["let s = obj", "s.label"].join("\n"));
    const tail = doc.body.tail;
    expect(tail?.kind).toBe("member");
    if (tail?.kind === "member") {
      expect(tail.field).toBe("label");
      expect(tail.target.kind).toBe("ident");
    }
  });

  it("chains member access `a.b.c` left-to-right", () => {
    const doc = parse(["a.b.c"].join("\n"));
    const tail = doc.body.tail;
    // ((a.b).c)
    expect(tail?.kind).toBe("member");
    if (tail?.kind === "member") {
      expect(tail.field).toBe("c");
      expect(tail.target.kind).toBe("member");
    }
  });
});

describe("core-exec: postfix index access `[i]` in the body grammar", () => {
  it("parses `xs[0]` into an index node", () => {
    const doc = parse(["let xs = arr", "xs[0]"].join("\n"));
    const tail = doc.body.tail;
    expect(tail?.kind).toBe("index");
    if (tail?.kind === "index") {
      expect(tail.target.kind).toBe("ident");
      expect(tail.index.kind).toBe("number");
    }
  });
});

describe("core-exec: object-literal expressions (no more silent token-skip)", () => {
  it("parses a bare object literal in call args `grep({ pattern: \"TODO\", path: \"src\" })`", () => {
    // Previously the leading `{` in parseArgs was silently advanced past with no
    // diagnostic; now it parses into an ObjectExpr argument.
    const doc = parse(['let hits = grep({ pattern: "TODO", path: "src" })'].join("\n"));
    const let_ = doc.body.statements.find((s): s is LetStmt => s.kind === "let");
    const call = let_?.init as Expr | null;
    expect(call?.kind === "call" ? call.args[0]?.kind : undefined).toBe("object");
    if (call?.kind === "call" && call.args[0]?.kind === "object") {
      const obj = call.args[0];
      expect(obj.typeName).toBeNull();
      expect(obj.fields.map((f) => f.name)).toEqual(["pattern", "path"]);
    }
  });

  it("parses a named object literal / schema constructor `Triage { category: \"question\", urgent: false }`", () => {
    const doc = parse(['let t = Triage { category: "question", urgent: false }'].join("\n"));
    const let_ = doc.body.statements.find((s): s is LetStmt => s.kind === "let");
    const init = let_?.init as ObjectExpr | undefined;
    expect(init?.kind).toBe("object");
    expect(init?.typeName).toBe("Triage");
    expect(init?.fields.map((f) => f.name)).toEqual(["category", "urgent"]);
  });

  it("does NOT read an `if <ident> {` header brace as a named object literal", () => {
    // Brace-suppression: the `{` opens the block, so the condition is the bare
    // ident and the `if` parses as a control-flow statement, not a match on an
    // object literal that swallows the block.
    const doc = parse(["if ready {", "  x = 1", "}"].join("\n"));
    expect(doc.body.statements.some((s) => s.kind === "if")).toBe(true);
  });
});

describe("core-exec: `match` expression in the body grammar", () => {
  const src = [
    "let outcome = match r {",
    '  Ok(t) => t,',
    '  Err(QueryError { kind: "validation", cause: "schema_validation" }) => fallback,',
    "  Err(_) => other,",
    "}",
  ].join("\n");

  it("parses `match <scrutinee> { arm, … }` into a MatchExpr with its arms", () => {
    const doc = parse(src);
    const let_ = doc.body.statements.find((s): s is LetStmt => s.kind === "let");
    const m = let_?.init as MatchExpr | undefined;
    expect(m?.kind).toBe("match");
    expect(m?.scrutinee.kind).toBe("ident");
    expect(m?.arms.length).toBe(3);
  });

  it("captures the six pattern forms — constructor over an object pattern, wildcard-in-Err, identifier binding", () => {
    const doc = parse(src);
    const let_ = doc.body.statements.find((s): s is LetStmt => s.kind === "let");
    const m = let_?.init as MatchExpr;
    // Arm 0: Ok(t) — constructor over an identifier binding.
    expect(m.arms[0]?.pattern.kind).toBe("constructor");
    const arm0 = m.arms[0]?.pattern;
    if (arm0?.kind === "constructor") {
      expect(arm0.ctor).toBe("Ok");
      expect(arm0.inner.kind).toBe("identifier");
    }
    // Arm 1: Err(QueryError { … }) — constructor over an object pattern.
    const arm1 = m.arms[1]?.pattern;
    if (arm1?.kind === "constructor") {
      expect(arm1.ctor).toBe("Err");
      expect(arm1.inner.kind).toBe("object");
      if (arm1.inner.kind === "object") {
        expect(arm1.inner.fields.map((f) => f.name)).toEqual(["kind", "cause"]);
        expect(arm1.inner.fields[0]?.pattern).toEqual({
          kind: "literal",
          value: "validation",
        });
      }
    }
    // Arm 2: Err(_) — constructor over a wildcard.
    const arm2 = m.arms[2]?.pattern;
    if (arm2?.kind === "constructor") {
      expect(arm2.inner.kind).toBe("wildcard");
    }
  });

  it("parses a typed-query scrutinee whose arms brace does not read as an object literal", () => {
    const doc = parse(
      [
        "let outcome = match @<Triage>`Triage: ${m}` {",
        "  Ok(t) => t,",
        "  Err(_) => fallback,",
        "}",
      ].join("\n"),
    );
    const let_ = doc.body.statements.find((s): s is LetStmt => s.kind === "let");
    const m = let_?.init as MatchExpr;
    expect(m.kind).toBe("match");
    expect(m.scrutinee.kind).toBe("query");
    expect(m.arms.length).toBe(2);
  });
});

describe("core-exec: postfix `?` still terminates and composes with access", () => {
  it("wraps a `.field` chain result under `?` correctly (foo()?.bar order)", () => {
    const doc = parse(["let s = sentiment(text)?"].join("\n"));
    const let_ = doc.body.statements.find((s): s is LetStmt => s.kind === "let");
    const init = let_?.init as TryExpr | undefined;
    expect(init?.kind).toBe("try");
    expect(init?.operand.kind).toBe("call");
  });
});

// --------------------------------------------------------------------------
// QRY-19 — discarded-query-result parse error, wired through checkStructural
// --------------------------------------------------------------------------

describe("QRY-19: bare `@`...`` expression-statement fires loom/parse/discarded-query-result", () => {
  const discards = (doc: LoomDocument): readonly Diagnostic[] =>
    doc.diagnostics.filter((d) => d.code === DISCARDED_QUERY_RESULT_CODE);

  it("a bare non-tail `@`...`` statement fires the error at the query's location", () => {
    // query-escapes-stringification.md#qry-19: the bare expression-statement
    // position drops the must-use `Result`. A trailing `let` keeps the query in
    // NON-tail statement position (parseForms only promotes a trailing
    // line-start EXPRESSION form to the tail), so it parses as a `QueryStmt`.
    const doc = parse(
      ["@`Summarise the discussion above.`", "let x = 1"].join("\n"),
    );
    const stmt = doc.body.statements.find(
      (s): s is QueryStmt => s.kind === "query",
    );
    expect(stmt).toBeDefined();

    const hits = discards(doc);
    expect(hits).toHaveLength(1);
    const diag = hits[0]!;
    expect(diag.severity).toBe("error");
    expect(diag.code).toBe(DISCARDED_QUERY_RESULT_CODE);
    // Message anchored to the registry (code-registry-parse.md), NOT the prose.
    expect(diag.message).toBe(DISCARDED_QUERY_RESULT_MESSAGE);
    expect(diag.file).toBe("test.loom");
    // Located at the `QueryStmt` node (the bare query on line 1, column 1).
    expect(diag.range).toEqual(stmt!.range);
    expect(diag.range?.start.line).toBe(1);
    expect(diag.range?.start.column).toBe(1);
  });

  it("a `let _ = @`...`` explicit discard does NOT fire (negative pin)", () => {
    // QRY-19 accepts the `let _ =` discard: the `Result` is acknowledged at the
    // call site. It parses as a `LetStmt` (name `_`), never a `QueryStmt`.
    const doc = parse(["let _ = @`Summarise.`", "let x = 1"].join("\n"));
    expect(doc.body.statements.some((s) => s.kind === "query")).toBe(false);
    expect(discards(doc)).toHaveLength(0);
  });

  it("a `?`-propagated bare `@`...``? does NOT fire (negative pin)", () => {
    // The `?`-propagate form acknowledges the `Result` (early-return); it parses
    // as an `ExprStmt` wrapping a `try`, never a `QueryStmt`.
    const doc = parse(["@`Summarise.`?", "let x = 1"].join("\n"));
    expect(doc.body.statements.some((s) => s.kind === "query")).toBe(false);
    expect(discards(doc)).toHaveLength(0);
  });

  it("a query USED in an expression (match scrutinee / binding) does NOT fire (negative pin)", () => {
    // A query bound (`let r = @`...``) or consumed as a `match` scrutinee is not
    // a discarded result — the value is used at the call site.
    const bound = parse(["let r = @`Summarise.`", "let x = 1"].join("\n"));
    expect(discards(bound)).toHaveLength(0);

    const scrutinee = parse(
      [
        "let outcome = match @`Summarise.` {",
        "  Ok(t) => t,",
        "  Err(_) => \"e\",",
        "}",
      ].join("\n"),
    );
    expect(discards(scrutinee)).toHaveLength(0);
  });

  it("a trailing bare `@`...`` (the void/final-value tail) does NOT fire (negative pin)", () => {
    // A trailing line-start query is promoted to the body tail (FN-5 final value
    // / void-tail discard, QRY-20 territory), not a bare expression-statement,
    // so QRY-19 must not fire.
    const doc = parse(["let x = 1", "@`Summarise.`"].join("\n"));
    expect(doc.body.tail?.kind).toBe("query");
    expect(doc.body.statements.some((s) => s.kind === "query")).toBe(false);
    expect(discards(doc)).toHaveLength(0);
  });
});
