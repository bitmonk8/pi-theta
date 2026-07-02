// V19a / V19a-T — the whole-`.loom`/`.warp` program-parser seam.
//
// This module owns the parser seam the paired `V19a` implementation leaf fills
// in: `parseLoomDocument(source, deps)` parses the *entire* `.loom` / `.warp`
// file into an executable body statement-list AST — the grammar.md
// §"Block expressions" `LoomBody ::= Stmt* Expr?` production — alongside the
// parsed frontmatter, and aggregates the whole-file multi-error diagnostic set
// by delegating each top-level statement / declaration to the existing V-slice
// parse-checkers over the real AST (`cka-49`,
// implementation-notes.md §Parser *Contract*).
//
// The body AST this seam produces is the node stream `V19c`'s statement
// executor walks and `V19e`'s composition producer parses; the AST node types
// declared here are that cross-leaf contract.
//
// V19a-T (tests-task) declares the AST node shapes and stubs `parseLoomDocument`
// inertly: it returns `{ frontmatter: null, body: { statements: [], tail: null },
// diagnostics: [] }` regardless of input. Every paired V19a-T test therefore
// reds on its own primary assertion — an empty body where a `LetStmt` /
// `IfStmt` / `SchemaDecl` / … node was expected, a missing tail `Expr`, a wrong
// statement count where newline-continuation should have joined (or split) a
// statement, or an empty `diagnostics` array where the delegated checkers should
// have aggregated multiple sorted errors — not on a compile error, a missing
// fixture, or a harness throw. The paired V19a implementation leaf fills the
// parser in.
//
// Spec: implementation-notes.md (§Parser *Contract*), grammar.md
// (§"Block expressions", §"fn declarations", §"schema X by <field>",
// §"/// placement", §"Newline continuation"), bindings.md, control-flow.md,
// functions.md, return.md, expressions.md, frontmatter.md, descriptions.md,
// schemas.md, imports.md, invocation.md, diagnostics.md.

import type { Diagnostic, SourceRange } from "../diagnostics/diagnostic";
import type { LoomSource } from "../lexer/lexer";
import type { SystemNoteChannelDeps } from "../extension/system-note-channel";
import type {
  ModelReferenceMatcher,
  ParsedFrontmatter,
} from "./frontmatter";

// --------------------------------------------------------------------------
// Expression AST (the `Expr` node family; grammar.md §Expression sublanguage)
// --------------------------------------------------------------------------

/** Common fields carried by every AST node: its source span. */
export interface NodeBase {
  readonly range: SourceRange;
}

/** An identifier reference expression. */
export interface IdentExpr extends NodeBase {
  readonly kind: "ident";
  readonly name: string;
}

/** A numeric literal expression. */
export interface NumberExpr extends NodeBase {
  readonly kind: "number";
  readonly text: string;
  readonly numericType: "integer" | "number";
}

/** A string literal expression (decoded value). */
export interface StringExpr extends NodeBase {
  readonly kind: "string";
  readonly value: string;
}

/** A boolean literal expression. */
export interface BoolExpr extends NodeBase {
  readonly kind: "bool";
  readonly value: boolean;
}

/** The `null` literal expression. */
export interface NullExpr extends NodeBase {
  readonly kind: "null";
}

/** An array-construction literal (`[e, ...]`). */
export interface ArrayExpr extends NodeBase {
  readonly kind: "array";
  readonly elements: readonly Expr[];
}

/** A binary-operator expression (`a + b`, `a && b`, …). */
export interface BinaryExpr extends NodeBase {
  readonly kind: "binary";
  readonly op: string;
  readonly left: Expr;
  readonly right: Expr;
}

/** A ternary-conditional expression (`cond ? a : b`). */
export interface TernaryExpr extends NodeBase {
  readonly kind: "ternary";
  readonly condition: Expr;
  readonly consequent: Expr;
  readonly alternate: Expr;
}

/** A postfix error-propagation expression (`operand?`; ERR-18). */
export interface TryExpr extends NodeBase {
  readonly kind: "try";
  readonly operand: Expr;
}

/** A code-tool call expression `<name>(args)` (tool-calls.md). */
export interface CallExpr extends NodeBase {
  readonly kind: "call";
  readonly callee: string;
  readonly args: readonly Expr[];
}

/** An `invoke(...)` / `invoke<T>(...)` call expression (invocation.md). */
export interface InvokeExpr extends NodeBase {
  readonly kind: "invoke";
  /** The literal callee path (`invoke("./x.loom", ...)`). */
  readonly path: string;
  readonly args: readonly Expr[];
}

/** An `@`…`` model-query expression (query.md). */
export interface QueryExpr extends NodeBase {
  readonly kind: "query";
  /** The explicit `@<Schema>` annotation, when present. */
  readonly schema: string | null;
  /** The raw template body between the backticks. */
  readonly template: string;
}

/**
 * The `Expr` node family. A tail `Expr` of a `LoomBody` / block, a `let`
 * initialiser, a condition, etc. all use this union.
 */
export type Expr =
  | IdentExpr
  | NumberExpr
  | StringExpr
  | BoolExpr
  | NullExpr
  | ArrayExpr
  | BinaryExpr
  | TernaryExpr
  | TryExpr
  | CallExpr
  | InvokeExpr
  | QueryExpr;

// --------------------------------------------------------------------------
// Statement / declaration AST (the `Stmt` node family; grammar.md)
// --------------------------------------------------------------------------

/** A `let` / `let mut` binding statement (`LetStmt`; bindings.md). */
export interface LetStmt extends NodeBase {
  readonly kind: "let";
  readonly name: string;
  readonly mutable: boolean;
  /** The declared binding annotation, when present (`let x: T = …`). */
  readonly annotation: string | null;
  readonly init: Expr | null;
}

/** A statement-form reassignment (`x = e`, `x += e`, …; bindings.md). */
export interface ReassignStmt extends NodeBase {
  readonly kind: "reassign";
  readonly target: string;
  readonly op: "=" | "+=" | "-=" | "*=" | "/=" | "%=";
  readonly value: Expr;
}

/** A statement-form `if` / `else` (`IfStmt`; control-flow.md). */
export interface IfStmt extends NodeBase {
  readonly kind: "if";
  readonly condition: Expr;
  readonly then: Block;
  /** The `else` arm: a chained `IfStmt`, an `else` `Block`, or none. */
  readonly otherwise: IfStmt | Block | null;
}

/** A statement-form `while` loop (`WhileStmt`; control-flow.md). */
export interface WhileStmt extends NodeBase {
  readonly kind: "while";
  readonly condition: Expr;
  readonly body: Block;
}

/** A statement-form `for … in` loop (`ForStmt`; control-flow.md). */
export interface ForStmt extends NodeBase {
  readonly kind: "for";
  readonly variable: string;
  readonly iterand: Expr;
  readonly body: Block;
}

/** A `break` statement (control-flow.md). */
export interface BreakStmt extends NodeBase {
  readonly kind: "break";
}

/** A `continue` statement (control-flow.md). */
export interface ContinueStmt extends NodeBase {
  readonly kind: "continue";
}

/** A single `fn` parameter (`Ident ":" Type`). */
export interface FnParam {
  readonly name: string;
  readonly type: string;
}

/** A top-level `fn` declaration (`FnDecl`; functions.md). */
export interface FnDecl extends NodeBase {
  readonly kind: "fn";
  readonly name: string;
  readonly params: readonly FnParam[];
  readonly returnType: string | null;
  readonly body: Block;
}

/** A `return` statement (return.md). */
export interface ReturnStmt extends NodeBase {
  readonly kind: "return";
  readonly operand: Expr | null;
}

/** A query used in statement position (`@`…`` with no binding). */
export interface QueryStmt extends NodeBase {
  readonly kind: "query";
  readonly query: QueryExpr;
}

/** A code-tool call in statement position (`<name>(args)`). */
export interface ToolCallStmt extends NodeBase {
  readonly kind: "tool-call";
  readonly call: CallExpr;
}

/** An `invoke(...)` call in statement position. */
export interface InvokeStmt extends NodeBase {
  readonly kind: "invoke";
  readonly invoke: InvokeExpr;
}

/** A bare expression statement (its value discarded). */
export interface ExprStmt extends NodeBase {
  readonly kind: "expr";
  readonly expr: Expr;
}

/** A `schema` declaration (`SchemaDecl`; schemas.md). */
export interface SchemaDecl extends NodeBase {
  readonly kind: "schema";
  readonly name: string;
}

/** An `enum` declaration (`EnumDecl`; schemas.md). */
export interface EnumDecl extends NodeBase {
  readonly kind: "enum";
  readonly name: string;
}

/** An `import … from` declaration (imports.md). */
export interface ImportDecl extends NodeBase {
  readonly kind: "import";
  readonly path: string;
  readonly symbols: readonly string[];
}

/** An `export … from` declaration (imports.md). */
export interface ExportDecl extends NodeBase {
  readonly kind: "export";
  readonly path: string;
  readonly symbols: readonly string[];
}

/** A `///` doc-comment run (`DocComment`; descriptions.md). */
export interface DocComment extends NodeBase {
  readonly kind: "doc-comment";
  readonly lines: readonly string[];
}

/**
 * The `Stmt` node family: every top-level statement and declaration kind a
 * `LoomBody` admits.
 */
export type Stmt =
  | LetStmt
  | ReassignStmt
  | IfStmt
  | WhileStmt
  | ForStmt
  | BreakStmt
  | ContinueStmt
  | FnDecl
  | ReturnStmt
  | QueryStmt
  | ToolCallStmt
  | InvokeStmt
  | ExprStmt
  | SchemaDecl
  | EnumDecl
  | ImportDecl
  | ExportDecl
  | DocComment;

/**
 * A statement-list block (`LoomBody ::= Stmt* Expr?` and the `StmtBlock`
 * production alike): zero or more statements plus an optional tail `Expr`.
 */
export interface Block {
  readonly statements: readonly Stmt[];
  readonly tail: Expr | null;
}

/** The `LoomBody` top-level of a `.loom` / `.warp` file. */
export type LoomBody = Block;

/** The result of a whole-file parse. */
export interface LoomDocument {
  /** The parsed frontmatter, or `null` when the file carries none. */
  readonly frontmatter: ParsedFrontmatter | null;
  /** The whole-file body statement-list AST the interpreter walks. */
  readonly body: LoomBody;
  /**
   * Every diagnostic aggregated across the whole file in one pass (no
   * fast-fail), sorted `(file, line, col)` per
   * diagnostics.md §"Multi-error reporting".
   */
  readonly diagnostics: readonly Diagnostic[];
}

/** Construction dependencies the whole-file parser consumes. */
export interface ParseLoomDocumentDeps {
  /** The V7d producer-facing diagnostic-emission channel. */
  readonly systemNote: SystemNoteChannelDeps;
  /** The `model:` reference matcher the frontmatter parse consults (V6a). */
  readonly modelMatcher: ModelReferenceMatcher;
}

/**
 * Parse an entire `.loom` / `.warp` source into `{ frontmatter, body,
 * diagnostics }`: the whole file — not a single expression — is walked into the
 * executable `LoomBody` statement-list AST, and the delegated V-slice
 * parse-checkers' diagnostics are aggregated in one pass, sorted `(file, line,
 * col)`, per implementation-notes.md §Parser *Contract* (`cka-49`).
 *
 * V19a-T stubs this inert: it always returns an empty body, no frontmatter, and
 * no diagnostics. The paired V19a implementation leaf fills it in.
 */
export function parseLoomDocument(
  _source: LoomSource,
  _deps: ParseLoomDocumentDeps,
): LoomDocument {
  return {
    frontmatter: null,
    body: { statements: [], tail: null },
    diagnostics: [],
  };
}
