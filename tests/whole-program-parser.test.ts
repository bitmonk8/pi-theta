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
  type ExportDecl,
  type ForStmt,
  type FnDecl,
  type ImportDecl,
  type LetStmt,
  type LoomDocument,
  type ParseLoomDocumentDeps,
  type ReassignStmt,
} from "../src/parser/loom-document";

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
    // cka-49: trailing-comma trigger — one tool-call statement.
    const { body } = parse(["f(a,", "  b)"].join("\n"));
    expect(body.statements.length).toBe(1);
  });

  it("does NOT continue on the postfix error-propagation ? (ERR-18)", () => {
    // cka-49: postfix `?` is a complete-expression terminator, never a
    // continuation trigger — the two lines are two statements.
    const { body } = parse(["foo()?", "bar()"].join("\n"));
    expect(body.statements.length).toBe(2);
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
