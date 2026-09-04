import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaSource } from "../src/lexer/lexer";
import type {
  SystemNoteChannelDeps,
  SystemNoteSender,
} from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import {
  parseThetaDocument,
  type Block,
  type CallExpr,
  type Expr,
  type FnDecl,
  type LetStmt,
  type ParseThetaDocumentDeps,
  type ReassignStmt,
  type ThetaDocument,
} from "../src/parser/theta-document";

// Bug 0015 regression — after a postfix-`?` line, a keyword-free statement
// carrying a depth-0 ternary is swallowed by the ternary-head scan
// (docs/bugs/0015-postfix-question-swallows-keyword-free-ternary-stmt.md).
//
// Spec: grammar.md §"Statement termination & newline continuation" ("The `?`
// trigger is the **ternary head only**; the postfix error-propagation `?` is
// a complete-expression terminator … and never continues" — a statement
// whose line ends in postfix `?` must terminate at the newline), §"`let`
// form" ("Reassignment is a statement (`=`, `+=`, `-=`, `*=`, `/=`, `%=`)"
// — the swallowed next statement is a legal statement form), §Blocks
// (`ThetaBody ::= Stmt* Expr?` — a bare ternary is a legal block tail, and a
// body with no tail expression has final value literal `null`, which is what
// makes the silent tail loss a semantic change), and §"Expression
// sublanguage" (assignment in expression position is not supported — the
// leaked ternary reading of a reassignment is not a legal parse of ANY
// program, yet it wins over the legal statement segmentation).
//
// The defect, three composing mechanisms (bug doc §Analysis): the lexer
// swallows the newline after ANY trailing `?` (`trailingTriggers`,
// src/lexer/lexer.ts — irreducible there per bug 0005 (b): ternary head and
// postfix `?` are lexically identical up to the newline); the parser's
// `isTernaryHead` scan (src/parser/theta-document.ts) reads forward for a
// depth-0 `:` and proves boundary-crossing ONLY via keywords
// (`STATEMENT_ONLY_KEYWORDS`), so the grammar's keyword-free statement forms
// — reassignment and expression statements — offer the scan no stop token,
// and a depth-0 ternary `:` INSIDE the next statement classifies the
// preceding postfix `?` as a ternary head; `parseTernary` then recovers from
// the missing outer `:` by silently fabricating a `null`-literal alternate.
// For a reassignment the leak fails loudly at the WRONG construct
// (`theta/parse/unsupported-feature: … stray '=' in statement position` on
// the next line, the `reassign` statement gone); for an expression statement
// it is fully silent — zero diagnostics, the postfix `?`'s error propagation
// deleted (no `try` node), the whole next statement absorbed as consequent,
// the theta's final value degraded to `null`.
//
// The regression pins assert the FIXED behaviour of exactly the bug doc's
// Verified-matrix misparsing cells (red at HEAD, for the documented
// reasons); the CONTROL pins hold the matrix's clean cells (control column
// and clean treatment rows) and the legal multi-line / nested ternary forms
// any fix must not disturb.

// --- seam doubles ---------------------------------------------------------

function recordingDeps(): {
  deps: ParseThetaDocumentDeps;
  delivered: Diagnostic[][];
} {
  const delivered: Diagnostic[][] = [];
  const pi: SystemNoteSender = {
    sendMessage: (message): void => {
      if ("diagnostics" in message.details!) {
        delivered.push([...message.details!.diagnostics]);
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

/** Parse a UTF-8 `.theta` source string into a {@link ThetaDocument}. */
function parse(src: string, path = "test.theta"): ThetaDocument {
  const { deps } = recordingDeps();
  const source: ThetaSource = {
    path,
    bytes: new TextEncoder().encode(src),
  };
  return parseThetaDocument(source, deps);
}

// --- assertion helpers ----------------------------------------------------

/** `code: message` render of the document's diagnostics, for diff-friendly emptiness assertions. */
function diagnosticLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.code}: ${d.message}`);
}

/**
 * A block's trailing expression under the parser's dual encoding: the
 * promoted `tail`, or the final `ExprStmt`'s expression. The two encodings
 * are runtime-equivalent by design (see the bug-0006 regression file /
 * src/runtime/statement-executor.ts), and which one the parser picks differs
 * between top level (tail promotion fires on a line-start final form) and a
 * braced body (the block-internal `stmt-sep` is swallowed). Asserting through
 * this helper keeps the tests pinned to what bug 0015 is about — the ternary
 * is a STANDALONE trailing statement, not consequent material for the
 * preceding postfix `?` — without over-pinning which encoding the parser
 * picks.
 */
function trailingExpr(block: Block): Expr | null {
  if (block.tail !== null) {
    return block.tail;
  }
  const last = block.statements[block.statements.length - 1];
  return last !== undefined && last.kind === "expr" ? last.expr : null;
}

/**
 * Statement kinds with the dual-encoded trailing expression normalised away:
 * when the block has no promoted `tail` and its final statement is an
 * `ExprStmt`, that final statement is the trailing expression's other
 * encoding (see {@link trailingExpr}) and is dropped, so shape assertions
 * stay invariant to which encoding the parser picks.
 */
function stmtKindsBeforeTail(block: Block): string[] {
  const kinds = block.statements.map((s) => s.kind);
  return block.tail === null && kinds[kinds.length - 1] === "expr"
    ? kinds.slice(0, -1)
    : kinds;
}

/** The `let` statements of a block, in order. */
function letsOf(block: Block): LetStmt[] {
  return block.statements.filter((s): s is LetStmt => s.kind === "let");
}

/** The `reassign` statements of a block, in order. */
function reassignsOf(block: Block): ReassignStmt[] {
  return block.statements.filter(
    (s): s is ReassignStmt => s.kind === "reassign",
  );
}

/** The single `FnDecl` of the parsed document. */
function onlyFn(doc: ThetaDocument): FnDecl {
  const fn = doc.body.statements.find((s): s is FnDecl => s.kind === "fn");
  expect(fn, "the fn declaration parses into the body").toBeDefined();
  return fn as FnDecl;
}

/**
 * Pin that the postfix-`?` statement boundary held: `name`'s initialiser is
 * the postfix error-propagation form — a `try` node over the `@`-query — and
 * NOT a fabricated ternary absorbing the next statement.
 */
function expectTryInit(block: Block, name: string): void {
  const binding = letsOf(block).find((l) => l.name === name);
  expect(
    binding?.init?.kind,
    `\`${name}\`'s initialiser is the postfix-\`?\` \`try\` form, not a ternary over the swallowed next statement`,
  ).toBe("try");
  if (binding?.init?.kind === "try") {
    expect(binding.init.operand.kind).toBe("query");
  }
}

// --------------------------------------------------------------------------
// Regression pins — matrix misparsing cells, loud (reassignment) half
// --------------------------------------------------------------------------

describe("bug 0015 regression — reassignment with a ternary RHS after a postfix-`?` line", () => {
  // Bug doc reproduction (1): a `reassign` statement whose RHS carries a
  // depth-0 ternary, on the line after a postfix-`?` statement.
  const reassignTernaryRhs = [
    "let mut x = 0",
    "let c = true",
    "let a = 1",
    "let b = 2",
    "let y = @`ping`?",
    "x = c ? a : b",
  ].join("\n");

  it("(a) reproduction (1): zero diagnostics — no stray '=' at the wrong construct", () => {
    // grammar.md §"`let` form": the reassignment is a legal statement, and
    // §"Statement termination & newline continuation" terminates `y`'s
    // statement at the postfix `?`. The leaked parse instead consumed the
    // reassignment TARGET as ternary consequent and tripped over the `=`
    // (illegal in expression position, §"Expression sublanguage"):
    // `6:3 theta/parse/unsupported-feature: unsupported syntactic feature:
    // stray '=' in statement position`. The fixed parse is diagnostic-free,
    // matching the matrix control cell (identical source minus the `?`).
    const doc = parse(reassignTernaryRhs);
    expect(diagnosticLines(doc)).toEqual([]);
  });

  it("(a) reproduction (1): the reassign statement survives and `y` binds the try form", () => {
    // Fixed shape (matrix row 1's control shape plus the `try` init): five
    // `let`s then the `reassign` — at HEAD the `reassign` is GONE (swallowed
    // into `y`'s initialiser as `` @`ping` ? x : null ``, the postfix `?`'s
    // error propagation deleted) and `c ? a : b` is left over as a stray
    // expression statement.
    const doc = parse(reassignTernaryRhs);
    expect(stmtKindsBeforeTail(doc.body)).toEqual([
      "let",
      "let",
      "let",
      "let",
      "let",
      "reassign",
    ]);
    expectTryInit(doc.body, "y");

    const [reassign] = reassignsOf(doc.body);
    expect(reassign?.target).toBe("x");
    expect(reassign?.op).toBe("=");
    expect(reassign?.value.kind, "the ternary belongs to the reassign RHS").toBe(
      "ternary",
    );
  });

  it("(b) compound operator `x += c ? a : b` — same boundary, same fixed shape", () => {
    // Matrix row 2: "x += c ? a : b (compound) | misparse, loud — same
    // shape | clean (reassign)". The compound `+=` fails identically at
    // HEAD, so the fixed pin is identical up to the operator.
    const doc = parse(
      [
        "let mut x = 0",
        "let c = true",
        "let a = 1",
        "let b = 2",
        "let y = @`ping`?",
        "x += c ? a : b",
      ].join("\n"),
    );
    expect(diagnosticLines(doc)).toEqual([]);
    expect(stmtKindsBeforeTail(doc.body)).toEqual([
      "let",
      "let",
      "let",
      "let",
      "let",
      "reassign",
    ]);
    expectTryInit(doc.body, "y");

    const [reassign] = reassignsOf(doc.body);
    expect(reassign?.target).toBe("x");
    expect(reassign?.op).toBe("+=");
    expect(reassign?.value.kind).toBe("ternary");
  });
});

// --------------------------------------------------------------------------
// Regression pins — matrix misparsing cells, silent (expression-statement)
// half. These cells parse with ZERO diagnostics at HEAD too — the silence IS
// the defect — so the regression signal is the AST shape, not diagnostics
// (same situation as the bug-0006 file's silent variant (iii)).
// --------------------------------------------------------------------------

describe("bug 0015 regression — expression statement with a depth-0 ternary after a postfix-`?` line (silent cells)", () => {
  it("(c) reproduction (2): a bare ternary tail after the postfix-`?` line is a standalone tail, and `y` binds the try form", () => {
    // grammar.md §Blocks: `c ? 1 : 2` is a legal tail `Expr`. At HEAD the
    // document parses with zero diagnostics but MEANS a different program:
    // `y`'s initialiser lands as `` @`ping` ? (c ? 1 : 2) : null `` (no
    // `try` node — the `Err` propagation is deleted), the tail vanishes, and
    // the theta's final value degrades to literal `null` (§Blocks: a body
    // with no tail has final value `null`).
    const doc = parse(
      ["let c = true", "let y = @`ping`?", "c ? 1 : 2"].join("\n"),
    );
    expect(diagnosticLines(doc)).toEqual([]);
    expectTryInit(doc.body, "y");
    expect(stmtKindsBeforeTail(doc.body)).toEqual(["let", "let"]);

    const tail = trailingExpr(doc.body);
    expect(tail?.kind, "the ternary is the block tail, not swallowed").toBe(
      "ternary",
    );
    if (tail?.kind === "ternary") {
      expect(tail.condition.kind).toBe("ident");
    }
  });

  it("(d) call-headed ternary statement `g() ? 1 : 2` — same silent swallow, same fixed shape", () => {
    // Matrix row: "g() ? 1 : 2 (call-headed ternary stmt) | misparse,
    // silent — zero diagnostics; stmt swallowed; y init
    // `` @`ping` ? (g() ? 1 : 2) : null ``; tail lost | clean (tail
    // ternary)". `g` is declared so the pin exercises only the boundary
    // (no unknown-identifier noise); it returns boolean so the ternary
    // condition is well-typed.
    const doc = parse(
      [
        "fn g(): boolean {",
        "  true",
        "}",
        "let y = @`ping`?",
        "g() ? 1 : 2",
      ].join("\n"),
    );
    expect(diagnosticLines(doc)).toEqual([]);
    expectTryInit(doc.body, "y");
    expect(stmtKindsBeforeTail(doc.body)).toEqual(["fn", "let"]);

    const tail = trailingExpr(doc.body);
    expect(tail?.kind).toBe("ternary");
    if (tail?.kind === "ternary") {
      expect(tail.condition.kind, "the call heads the ternary condition").toBe(
        "call",
      );
    }
  });

  it("(e) blank-line variant: a blank line before the ternary does not protect — same fixed shape", () => {
    // Matrix row: "blank line, then c ? 1 : 2 | misparse, silent — blank
    // line does not protect | —". grammar.md: continuation crosses blank
    // lines (same as bug 0005 (b)), so the fix must stop the leak at the
    // postfix `?` itself, not rely on the blank line as a boundary.
    const doc = parse(
      ["let c = true", "let y = @`ping`?", "", "c ? 1 : 2"].join("\n"),
    );
    expect(diagnosticLines(doc)).toEqual([]);
    expectTryInit(doc.body, "y");
    expect(stmtKindsBeforeTail(doc.body)).toEqual(["let", "let"]);
    expect(trailingExpr(doc.body)?.kind).toBe("ternary");
  });

  it("(f) reproduction (3), mid-body: the expr statement is not deleted — [let, let, expr, let] plus tail `z`", () => {
    // Matrix row: "c ? 1 : 2 mid-body, then let z = 3 / z | misparse,
    // silent — the expr statement deleted; rest parses | clean ([let, let,
    // expr, let])". At HEAD the `expr` statement vanishes into `y`'s
    // initialiser (`[let, let, let]`) and the rest of the program parses
    // normally around the deletion — silent statement deletion. The trailing
    // `z` is asserted through the dual-encoding helpers (tail OR final
    // ExprStmt; see trailingExpr) so the pin holds under either encoding.
    const doc = parse(
      [
        "let c = true",
        "let y = @`ping`?",
        "c ? 1 : 2",
        "let z = 3",
        "z",
      ].join("\n"),
    );
    expect(diagnosticLines(doc)).toEqual([]);
    expectTryInit(doc.body, "y");
    expect(stmtKindsBeforeTail(doc.body)).toEqual([
      "let",
      "let",
      "expr",
      "let",
    ]);

    // The mid-body expression statement (index 2 is stable under either
    // tail encoding) is the ternary — present, not swallowed.
    const mid = doc.body.statements[2];
    expect(mid?.kind).toBe("expr");
    if (mid?.kind === "expr") {
      expect(mid.expr.kind).toBe("ternary");
    }

    const tail = trailingExpr(doc.body);
    expect(tail?.kind).toBe("ident");
    if (tail?.kind === "ident") {
      expect(tail.name).toBe("z");
    }
  });
});

// --------------------------------------------------------------------------
// Regression pin — braced-body widening (bug doc, paragraph after the
// matrix): inside a braced body no `stmt-sep` exists at bracket depth > 0
// (the bug-0006 lexer mechanism), so the scan crosses ANY run of
// keyword-free statements until the body's closing `}` — the
// boundary-sharing statement need not carry the ternary itself.
// --------------------------------------------------------------------------

describe("bug 0015 regression — braced-body widening: the deciding `:` sits two statements past the boundary", () => {
  // A `subagent fn` hosts the body: its body is a Result scope for the
  // postfix `?` regardless of annotation (functions.md FN-6; pinned by the
  // bug-0005 regression file's control (7)), so the pin exercises ONLY the
  // statement-boundary defect — a plain `fn` would add an unrelated
  // question-outside-result-fn diagnostic.
  const bracedBody = [
    "subagent fn f() {",
    "  let mut x = 0",
    "  let c = true",
    "  let y = @`ping`?",
    "  x = 1",
    "  c ? 2 : 3",
    "}",
  ].join("\n");

  it("(g) fn-body: after the postfix-`?` line, `x = 1` then `c ? 2 : 3` parse as reassign + trailing ternary, zero diagnostics", () => {
    // At HEAD this misparses loudly (stray '=', `reassign` gone) even though
    // `x = 1` carries NO ternary: with no `stmt-sep` inside the braces the
    // scan reads through the reassignment into the NEXT statement's ternary
    // `:` at depth 0. Fixed shape: the boundary holds at the postfix `?`,
    // the reassign survives, and the ternary is the body's trailing
    // expression.
    const doc = parse(bracedBody);
    expect(diagnosticLines(doc)).toEqual([]);

    const fn = onlyFn(doc);
    expect(stmtKindsBeforeTail(fn.body)).toEqual([
      "let",
      "let",
      "let",
      "reassign",
    ]);
    expectTryInit(fn.body, "y");

    const [reassign] = reassignsOf(fn.body);
    expect(reassign?.target).toBe("x");
    expect(reassign?.op).toBe("=");
    expect(reassign?.value.kind).toBe("number");

    expect(trailingExpr(fn.body)?.kind).toBe("ternary");
  });
});

// --------------------------------------------------------------------------
// Controls — the matrix control column: every treatment minus the trailing
// `?`. Green at HEAD (verified matrix, control column) and must stay green:
// they pin the shapes the fix has to converge the treatment cells onto.
// --------------------------------------------------------------------------

describe("bug 0015 regression — controls: the same programs minus the trailing `?` parse clean", () => {
  it("(h) reproduction (1) control: reassign with ternary RHS after a plain query line", () => {
    // Matrix row 1, control cell: "clean (reassign)".
    const doc = parse(
      [
        "let mut x = 0",
        "let c = true",
        "let a = 1",
        "let b = 2",
        "let y = @`ping`",
        "x = c ? a : b",
      ].join("\n"),
    );
    expect(diagnosticLines(doc)).toEqual([]);
    expect(stmtKindsBeforeTail(doc.body)).toEqual([
      "let",
      "let",
      "let",
      "let",
      "let",
      "reassign",
    ]);
    // Without the `?` the initialiser is the bare query — no try wrapper.
    const y = letsOf(doc.body).find((l) => l.name === "y");
    expect(y?.init?.kind).toBe("query");
    expect(reassignsOf(doc.body)[0]?.value.kind).toBe("ternary");
  });

  it("(h) compound control: `x += c ? a : b` after a plain query line", () => {
    // Matrix row 2, control cell: "clean (reassign)".
    const doc = parse(
      [
        "let mut x = 0",
        "let c = true",
        "let a = 1",
        "let b = 2",
        "let y = @`ping`",
        "x += c ? a : b",
      ].join("\n"),
    );
    expect(diagnosticLines(doc)).toEqual([]);
    const [reassign] = reassignsOf(doc.body);
    expect(reassign?.op).toBe("+=");
    expect(reassign?.value.kind).toBe("ternary");
  });

  it("(h) reproduction (2) control: bare ternary tail after a plain query line", () => {
    // Matrix row "c ? 1 : 2 (bare ternary tail)", control cell: "clean
    // (tail ternary)".
    const doc = parse(
      ["let c = true", "let y = @`ping`", "c ? 1 : 2"].join("\n"),
    );
    expect(diagnosticLines(doc)).toEqual([]);
    expect(stmtKindsBeforeTail(doc.body)).toEqual(["let", "let"]);
    expect(trailingExpr(doc.body)?.kind).toBe("ternary");
  });

  it("(h) call-headed control: `g() ? 1 : 2` after a plain query line", () => {
    // Matrix row "g() ? 1 : 2 (call-headed ternary stmt)", control cell:
    // "clean (tail ternary)".
    const doc = parse(
      [
        "fn g(): boolean {",
        "  true",
        "}",
        "let y = @`ping`",
        "g() ? 1 : 2",
      ].join("\n"),
    );
    expect(diagnosticLines(doc)).toEqual([]);
    const tail = trailingExpr(doc.body);
    expect(tail?.kind).toBe("ternary");
    if (tail?.kind === "ternary") {
      expect(tail.condition.kind).toBe("call");
    }
  });

  it("(h) reproduction (3) control: mid-body ternary statement — [let, let, expr, let] plus tail `z`", () => {
    // Matrix row "c ? 1 : 2 mid-body…", control cell: "clean ([let, let,
    // expr, let])" — the shape the treatment pin (f) must converge onto.
    const doc = parse(
      [
        "let c = true",
        "let y = @`ping`",
        "c ? 1 : 2",
        "let z = 3",
        "z",
      ].join("\n"),
    );
    expect(diagnosticLines(doc)).toEqual([]);
    expect(stmtKindsBeforeTail(doc.body)).toEqual([
      "let",
      "let",
      "expr",
      "let",
    ]);
    const tail = trailingExpr(doc.body);
    expect(tail?.kind).toBe("ident");
    if (tail?.kind === "ident") {
      expect(tail.name).toBe("z");
    }
  });

  it("(h) braced-body control: reassign then ternary in a fn body after a plain query line", () => {
    // The (g) program minus the `?` — the shape the braced-body treatment
    // must converge onto.
    const doc = parse(
      [
        "subagent fn f() {",
        "  let mut x = 0",
        "  let c = true",
        "  let y = @`ping`",
        "  x = 1",
        "  c ? 2 : 3",
        "}",
      ].join("\n"),
    );
    expect(diagnosticLines(doc)).toEqual([]);

    const fn = onlyFn(doc);
    expect(stmtKindsBeforeTail(fn.body)).toEqual([
      "let",
      "let",
      "let",
      "reassign",
    ]);
    expect(trailingExpr(fn.body)?.kind).toBe("ternary");
  });

  it("(h) call-statement control: `f(c ? 1 : 2)` after a plain query line", () => {
    // Matrix row "f(c ? 1 : 2) (call stmt, ternary argument)", control
    // cell: "clean" — the (k) program minus the `?`.
    const doc = parse(
      [
        "fn f(v: number): number {",
        "  v",
        "}",
        "let c = true",
        "let y = @`ping`",
        "f(c ? 1 : 2)",
      ].join("\n"),
    );
    expect(diagnosticLines(doc)).toEqual([]);

    // Same call-statement dual encoding as the (k) treatment pin: promoted
    // tail ("call" Expr) or trailing `tool-call` statement.
    const tail = doc.body.tail;
    const last = doc.body.statements[doc.body.statements.length - 1];
    const call: CallExpr | null =
      tail !== null && tail.kind === "call"
        ? tail
        : last !== undefined && last.kind === "tool-call"
          ? last.call
          : null;
    expect(call?.callee).toBe("f");
    expect(call?.args[0]?.kind).toBe("ternary");
  });

  it('(h) match control: `match v { 1 => "one", _ => "other" }` after a plain query line', () => {
    // Matrix row "match v { 1 => \"one\", _ => \"other\" }", control cell:
    // "clean" — the (l) program minus the `?`.
    const doc = parse(
      [
        "let v = 1",
        "let y = @`ping`",
        'match v { 1 => "one", _ => "other" }',
      ].join("\n"),
    );
    expect(diagnosticLines(doc)).toEqual([]);

    const tail = trailingExpr(doc.body);
    expect(tail?.kind).toBe("match");
    if (tail?.kind === "match") {
      expect(tail.arms.length).toBe(2);
    }
  });
});

// --------------------------------------------------------------------------
// Controls — clean TREATMENT rows: postfix-`?` lines whose next statement
// carries no depth-0 `:`, so the bounded scan answers "postfix" today. Green
// at HEAD (verified matrix); pinned so a fix cannot overshoot and break the
// correctly-segmented neighbours.
// --------------------------------------------------------------------------

describe("bug 0015 regression — controls: keyword-free next statements WITHOUT a depth-0 `:` keep parsing after a postfix-`?` line", () => {
  it("(i) `x = a` (reassign, no ternary): boundary holds — no depth-0 `:` before the next real separator", () => {
    // Matrix row: "x = a (reassign, no ternary) | clean — no depth-0 ':'
    // before the next real boundary (stmt-sep/eof), scan answers postfix".
    const doc = parse(
      ["let mut x = 0", "let a = 1", "let y = @`ping`?", "x = a"].join("\n"),
    );
    expect(diagnosticLines(doc)).toEqual([]);
    expect(stmtKindsBeforeTail(doc.body)).toEqual([
      "let",
      "let",
      "let",
      "reassign",
    ]);
    expectTryInit(doc.body, "y");
    const [reassign] = reassignsOf(doc.body);
    expect(reassign?.target).toBe("x");
    expect(reassign?.value.kind).toBe("ident");
  });

  it("(j) `x = (c ? 1 : 2)` (parenthesised ternary): the `:` at depth 1 does not leak", () => {
    // Matrix row: "x = (c ? 1 : 2) (ternary parenthesised) | clean — ':' at
    // depth 1" — the scan's bracket-depth tracking already protects
    // bracketed ternaries.
    const doc = parse(
      [
        "let mut x = 0",
        "let c = true",
        "let y = @`ping`?",
        "x = (c ? 1 : 2)",
      ].join("\n"),
    );
    expect(diagnosticLines(doc)).toEqual([]);
    expectTryInit(doc.body, "y");
    const [reassign] = reassignsOf(doc.body);
    expect(reassign?.target).toBe("x");
    // Parentheses group only (no paren AST node) — the RHS lands as the
    // ternary itself.
    expect(reassign?.value.kind).toBe("ternary");
  });

  it("(k) `f(c ? 1 : 2)` (call statement, ternary argument): the `:` at depth 1 does not leak", () => {
    // Matrix row: "f(c ? 1 : 2) (call stmt, ternary argument) | clean — ':'
    // at depth 1 | clean". `f` is declared so the pin carries no
    // unknown-identifier noise.
    const doc = parse(
      [
        "fn f(v: number): number {",
        "  v",
        "}",
        "let c = true",
        "let y = @`ping`?",
        "f(c ? 1 : 2)",
      ].join("\n"),
    );
    expect(diagnosticLines(doc)).toEqual([]);
    expectTryInit(doc.body, "y");

    // The trailing call lands either as the promoted tail (a "call" Expr) or
    // as a `tool-call` statement — the call-statement analogue of the
    // trailingExpr dual encoding.
    const tail = doc.body.tail;
    const last = doc.body.statements[doc.body.statements.length - 1];
    const call: CallExpr | null =
      tail !== null && tail.kind === "call"
        ? tail
        : last !== undefined && last.kind === "tool-call"
          ? last.call
          : null;
    expect(call?.callee).toBe("f");
    expect(
      call?.args[0]?.kind,
      "the ternary stays inside the call's argument list",
    ).toBe("ternary");
  });

  it("(l) `match v { … }` after a postfix-`?` line: an expression-heading keyword with no depth-0 `:` parses clean", () => {
    // Matrix row: "match v { 1 => \"one\", _ => \"other\" } | clean — match
    // heads an expression but carries no depth-0 ':' | clean" (every `:`
    // source inside sits behind the `{` bracket).
    const doc = parse(
      [
        "let v = 1",
        "let y = @`ping`?",
        'match v { 1 => "one", _ => "other" }',
      ].join("\n"),
    );
    expect(diagnosticLines(doc)).toEqual([]);
    expectTryInit(doc.body, "y");

    const tail = trailingExpr(doc.body);
    expect(tail?.kind).toBe("match");
    if (tail?.kind === "match") {
      expect(tail.arms.length).toBe(2);
    }
  });
});

// --------------------------------------------------------------------------
// Controls — the legal multi-line and nested ternary forms. The bug doc's
// closing requirement: "Real multi-line ternaries — the trailing-`?` form …
// and the leading-`?` form … parse correctly today and must keep working
// under any fix"; Option 1 additionally names the nested-consequent form as
// a reading any scan rework must preserve.
// --------------------------------------------------------------------------

describe("bug 0015 regression — controls: real ternary continuation and nesting forms keep parsing", () => {
  it("(m) trailing-`?` multi-line ternary: `let z = c ?` ␤ `1 :` ␤ `2` is ONE ternary statement", () => {
    // grammar.md §"Statement termination & newline continuation": a trailing
    // `?` AS TERNARY HEAD is a documented continuation trigger — the exact
    // form the postfix `?` is lexically identical to, and the reason the
    // boundary must be restored in the parser rather than the lexer.
    const doc = parse(["let c = true", "let z = c ?", "  1 :", "  2"].join("\n"));
    expect(diagnosticLines(doc)).toEqual([]);
    expect(stmtKindsBeforeTail(doc.body)).toEqual(["let", "let"]);

    const z = letsOf(doc.body).find((l) => l.name === "z");
    expect(z?.init?.kind).toBe("ternary");
    if (z?.init?.kind === "ternary") {
      expect(z.init.consequent.kind).toBe("number");
      expect(z.init.alternate.kind).toBe("number");
    }
  });

  it("(n) leading-`?` multi-line ternary: `let z = c` ␤ `? 1` ␤ `: 2` is ONE ternary statement", () => {
    // grammar.md continuation-trigger table: a LEADING `?` / `:` on the next
    // non-blank line continues the previous statement — the alternative
    // multi-line ternary spelling the bug doc verifies as parsing today.
    const doc = parse(
      ["let c = true", "let z = c", "  ? 1", "  : 2"].join("\n"),
    );
    expect(diagnosticLines(doc)).toEqual([]);
    expect(stmtKindsBeforeTail(doc.body)).toEqual(["let", "let"]);

    const z = letsOf(doc.body).find((l) => l.name === "z");
    expect(z?.init?.kind).toBe("ternary");
  });

  it("(o) nested-consequent ternary `c ? d ? 1 : 2 : 3` keeps its ternary-in-ternary reading", () => {
    // Bug doc §Options (1): the recommended `?`/`:` pairing rework must keep
    // the nested-consequent reading — the inner `d ? 1 : 2` is the outer
    // ternary's consequent and `3` its alternate.
    const doc = parse(
      [
        "let c = true",
        "let d = false",
        "let z = c ? d ? 1 : 2 : 3",
      ].join("\n"),
    );
    expect(diagnosticLines(doc)).toEqual([]);

    const z = letsOf(doc.body).find((l) => l.name === "z");
    expect(z?.init?.kind).toBe("ternary");
    if (z?.init?.kind === "ternary") {
      expect(z.init.condition.kind).toBe("ident");
      expect(z.init.consequent.kind, "the inner ternary is the consequent").toBe(
        "ternary",
      );
      expect(z.init.alternate.kind).toBe("number");
    }
  });
});

// --------------------------------------------------------------------------
// Defensive net — the fix's co-factor in parseTernary. isTernaryHead's
// token-level scan can commit to a head whose pairing `:` the consequent
// PARSE never reaches (the scan and the parse walk the same tokens by
// different rules); the missing-`:` branch then emits instead of silently
// fabricating a `null` alternate — the mechanism that made bug 0015's
// swallowed cells parse clean. The branch is reachable from plain malformed
// source (no boundary leak needed), so its emit is pinned here.
// --------------------------------------------------------------------------

describe("bug 0015 defensive net — a committed ternary head whose consequent parse stops short of the pairing `:` emits loudly", () => {
  it("(p) juxtaposed consequent expressions `c ? 1 2 : b`: the missing-`:` emit fires", () => {
    // `b` is declared so the pin carries no unknown-identifier noise. The
    // scan walks token-wise over `1 2` to the depth-0 `:` and commits to a
    // ternary head, but the consequent parse stops at `1` (juxtaposition is
    // not an operator), leaving the cursor at `2` — scan prediction and
    // consequent parse diverge, and parseTernary emits at the `?`. The
    // leftover `: b` then trips the pre-existing stray-`:`
    // statement-position diagnostic — a documented follow-on of the same
    // malformed source, tolerated (not pinned) here via `toContain` so this
    // pin holds exactly the ternary emit and survives follow-on rewording.
    const doc = parse(
      ["let c = true", "let b = 9", "let z = c ? 1 2 : b"].join("\n"),
    );
    expect(diagnosticLines(doc)).toContain(
      "theta/parse/unsupported-feature: unsupported syntactic feature: ternary '?' without ':' after its consequent",
    );
  });
});
