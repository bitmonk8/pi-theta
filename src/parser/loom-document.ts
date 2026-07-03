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

import type { Diagnostic, Position, SourceRange } from "../diagnostics/diagnostic";
import { assembleDiagnostics } from "../diagnostics/diagnostic";
import { lexLoom, type LoomSource, type Token } from "../lexer/lexer";
import type { SystemNoteChannelDeps } from "../extension/system-note-channel";
import {
  parseFrontmatter,
  type ModelReferenceMatcher,
  type ParsedFrontmatter,
} from "./frontmatter";
import { checkReassignment } from "./bindings";
import { checkDocCommentPlacement } from "./descriptions";

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

/**
 * One `schema X { … }` object-body field, as written in source: the field name
 * and its verbatim type-expression RHS. Retained so a typed `@<Schema>` query
 * can resolve the named decl to its declared shape and lower it (QRY-22 /
 * SUBS-1); the `= …` alias and `by … = …` discriminated-union forms carry no
 * object field list.
 */
export interface SchemaFieldSource {
  readonly name: string;
  readonly typeSource: string;
}

/** A `schema` declaration (`SchemaDecl`; schemas.md). */
export interface SchemaDecl extends NodeBase {
  readonly kind: "schema";
  readonly name: string;
  /**
   * The object-body field type sources, present iff the decl is the
   * `schema X { field: Type, … }` object form. Absent for the `= …` alias and
   * `by … = …` discriminated-union forms.
   */
  readonly fields?: readonly SchemaFieldSource[];
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
 * The whole file — not a single expression — is walked into the executable
 * `LoomBody` statement-list AST; the delegated V-slice parse-checkers'
 * diagnostics are aggregated in one pass and sorted `(file, line, col)`.
 */
export function parseLoomDocument(
  source: LoomSource,
  deps: ParseLoomDocumentDeps,
): LoomDocument {
  const file = source.path;
  const text = decodeSource(source.bytes);

  // Separate the optional `---` frontmatter fence from the executable body.
  // A fence-less source is body-only: the load-time "frontmatter is required"
  // obligation is the loader's (V6*), not the whole-file body parser's, and
  // every V19a-T fixture supplies a bare body — so parsing frontmatter only
  // when a fence is present keeps a spurious `missing mode:` diagnostic out of
  // the aggregated set. See notes.md.
  const split = splitFrontmatter(text);

  const frontmatterDiags: Diagnostic[] = [];
  let frontmatter: ParsedFrontmatter | null = null;
  if (split.frontmatterText !== null) {
    // `splitFrontmatter` returns the frontmatter text with the `---` fences
    // stripped, but `parseFrontmatter` re-requires them (its
    // `extractFrontmatterBlock` matches a leading/closing `---` fence). Re-wrap
    // the block in fences so the frontmatter fields (`mode:` / `model:` / …)
    // actually parse; without this every fenced `.loom` yields `frontmatter:
    // null` and a spurious `loom/load/missing-mode`. See notes.md (the
    // frontmatter line numbers are block-relative for a fence at file line 0 —
    // the common case; a fence preceded by blank lines shifts them by the
    // blank-line count, which no current obligation asserts).
    const fm = parseFrontmatter(`---\n${split.frontmatterText}\n---`, {
      file,
      modelMatcher: deps.modelMatcher,
    });
    frontmatter = fm.frontmatter ?? null;
    frontmatterDiags.push(...fm.diagnostics);
  }

  // V1a's newline-continuation lexer is the integration witness for statement
  // joining: its `stmt-sep` tokens mark the boundaries at depth 0, and it
  // swallows the newline at every continuation trigger (open bracket,
  // trailing/leading operator, trailing comma). The parser splits any residual
  // over-joined line by grammar completion — notably the postfix `?`, which
  // the lexer treats as a trailing trigger but which never continues a
  // statement.
  const lex = lexLoom({ path: file, bytes: encodeSource(split.bodyText) }, deps.systemNote);

  const parser = new BodyParser(lex.tokens, file, split.bodyText);
  const body = parser.parseBody();

  // The `///` doc-comment runs are lexed away (the lexer emits no comment
  // tokens), so they are recovered by a line scan over the body text and
  // merged into the statement list in source order; each run's placement is
  // delegated to V5c's `checkDocCommentPlacement` over the following
  // production.
  const docScan = scanDocComments(split.bodyText, file);
  const statements = mergeByLine(body.statements, docScan.nodes);

  const diagnostics = assembleDiagnostics([
    frontmatterDiags,
    lex.diagnostics,
    parser.diagnostics,
    docScan.diagnostics,
  ]);

  return {
    frontmatter,
    body: { statements, tail: body.tail },
    diagnostics,
  };
}

// --------------------------------------------------------------------------
// Source decoding + frontmatter separation
// --------------------------------------------------------------------------

/** Decode validated UTF-8 body bytes (skipping a BOM) and normalise newlines. */
function decodeSource(bytes: Uint8Array): string {
  const hasBom =
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf;
  const body = hasBom ? bytes.subarray(3) : bytes;
  return new TextDecoder("utf-8", { ignoreBOM: true })
    .decode(body)
    .replace(/\r\n?/g, "\n");
}

/** Re-encode a (already-normalised) body string for the lexer's byte input. */
function encodeSource(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * Split a normalised source into its optional leading `---` frontmatter block
 * and the executable body. The frontmatter region is blanked (not removed) in
 * the returned body so body line numbers stay aligned with the original
 * source. Returns `frontmatterText: null` when no leading fence is present.
 */
function splitFrontmatter(text: string): {
  frontmatterText: string | null;
  bodyText: string;
} {
  const lines = text.split("\n");
  let open = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const t = (lines[i] ?? "").trim();
    if (t === "") {
      continue;
    }
    open = t === "---" ? i : -1;
    break;
  }
  if (open < 0) {
    return { frontmatterText: null, bodyText: text };
  }
  let close = -1;
  for (let i = open + 1; i < lines.length; i += 1) {
    if ((lines[i] ?? "").trim() === "---") {
      close = i;
      break;
    }
  }
  if (close < 0) {
    // Unterminated fence: treat the whole file as frontmatter, empty body.
    return {
      frontmatterText: lines.slice(open + 1).join("\n"),
      bodyText: lines.map(() => "").join("\n"),
    };
  }
  const frontmatterText = lines.slice(open + 1, close).join("\n");
  const bodyText = lines.map((l, i) => (i <= close ? "" : l)).join("\n");
  return { frontmatterText, bodyText };
}

// --------------------------------------------------------------------------
// `///` doc-comment line scan
// --------------------------------------------------------------------------

/**
 * Recover `///` doc-comment runs from the body text (the lexer emits no
 * comment tokens) and delegate each run's placement to V5c's
 * `checkDocCommentPlacement` over the following production's leading keyword.
 */
function scanDocComments(
  bodyText: string,
  file: string,
): { nodes: DocComment[]; diagnostics: Diagnostic[] } {
  const lines = bodyText.split("\n");
  const nodes: DocComment[] = [];
  const diagnostics: Diagnostic[] = [];
  const docLine = /^[ \t]*\/\/\/(?!\/)(.*)$/;

  let i = 0;
  while (i < lines.length) {
    const first = docLine.exec(lines[i] ?? "");
    if (first === null) {
      i += 1;
      continue;
    }
    const startLine = i + 1; // 1-indexed
    const content: string[] = [];
    while (i < lines.length) {
      const m = docLine.exec(lines[i] ?? "");
      if (m === null) {
        break;
      }
      content.push(m[1] ?? "");
      i += 1;
    }
    const range: SourceRange = {
      start: { line: startLine, column: 1 },
      end: { line: startLine, column: (lines[startLine - 1] ?? "").length + 1 },
    };
    nodes.push({ kind: "doc-comment", lines: content, range });

    // The anchored production is the next non-blank, non-comment line's leading
    // word. `schema` / `enum` / `fn` are eligible anchors; every other
    // production (`let`, `import`, `export`, expression / control-flow
    // statements) is `loom/parse/doc-comment-misplaced`.
    let production = "";
    for (let j = i; j < lines.length; j += 1) {
      const raw = lines[j] ?? "";
      if (raw.trim() === "" || /^[ \t]*\/\//.test(raw)) {
        continue;
      }
      production = /^[ \t]*([A-Za-z_][A-Za-z0-9_]*)/.exec(raw)?.[1] ?? "other";
      break;
    }
    const anchor =
      production === "schema" || production === "enum" || production === "fn"
        ? production
        : "other";
    const diag = checkDocCommentPlacement(anchor, { file, range });
    if (diag !== undefined) {
      diagnostics.push(diag);
    }
  }
  return { nodes, diagnostics };
}

/** Merge doc-comment nodes into the statement list, ordered by source line. */
function mergeByLine(
  statements: readonly Stmt[],
  docs: readonly DocComment[],
): Stmt[] {
  const merged: Stmt[] = [...statements, ...docs];
  return merged.sort((a, b) => {
    const al = a.range.start.line;
    const bl = b.range.start.line;
    if (al !== bl) {
      return al - bl;
    }
    return a.range.start.column - b.range.start.column;
  });
}

// --------------------------------------------------------------------------
// Recursive-descent body parser
// --------------------------------------------------------------------------

/** Compound-assignment leading operators (`+=`, `-=`, …) lexed as two tokens. */
const COMPOUND_OPS: ReadonlySet<string> = new Set(["+", "-", "*", "/", "%"]);

/** One parsed top-level / block form: its statement node plus tail metadata. */
interface Form {
  readonly stmt: Stmt;
  /** The raw `Expr` when the form is an expression form, else `null`. */
  readonly expr: Expr | null;
  /** `true` when the form began at a logical-line start (after a `stmt-sep`). */
  readonly lineStart: boolean;
}

/** Expression kinds that are never promoted to a lone body tail (actions). */
const CALL_LIKE: ReadonlySet<Expr["kind"]> = new Set([
  "call",
  "invoke",
  "query",
]);

/**
 * A per-invocation recursive-descent parser over the lexer's continuation-joined
 * token stream. Holds only per-parse cursor / diagnostic / binding-scope state
 * (constructor-injected), never module-level mutable state.
 */
class BodyParser {
  private pos = 0;
  /** Declared binding mutability, for the V3b immutable-rebinding delegation. */
  private readonly bindings = new Map<string, boolean>();
  public readonly diagnostics: Diagnostic[] = [];
  /** Binary-operator precedence, lowest tier first (each left-associative). */
  private readonly tiers: readonly (readonly string[])[] = [
    ["||"],
    ["&&"],
    ["==", "!="],
    ["<", "<=", ">", ">="],
    ["+", "-"],
    ["*", "/", "%"],
  ];

  public constructor(
    private readonly tokens: readonly Token[],
    private readonly file: string,
    /**
     * The raw (newline-normalised) body source the tokens index into. A
     * `@`...`` query template is recovered by slicing this verbatim between the
     * backtick token bounds, so the template preserves the author's exact text
     * (punctuation, interpolation braces, and internal spacing) rather than a
     * lossy space-join of the interior tokens.
     */
    private readonly bodyText: string = "",
  ) {}

  // --- cursor helpers -----------------------------------------------------

  private peek(offset = 0): Token {
    return this.tokens[this.pos + offset] ?? this.eofToken();
  }

  private eofToken(): Token {
    const last = this.tokens[this.tokens.length - 1];
    const end = last?.range.end ?? { line: 1, column: 1 };
    return { kind: "eof", text: "", range: { start: end, end } };
  }

  private advance(): Token {
    const t = this.peek();
    if (t.kind !== "eof") {
      this.pos += 1;
    }
    return t;
  }

  private atEnd(): boolean {
    return this.peek().kind === "eof";
  }

  private isPunct(text: string, offset = 0): boolean {
    const t = this.peek(offset);
    return t.kind === "punct" && t.text === text;
  }

  private isKeyword(text: string, offset = 0): boolean {
    const t = this.peek(offset);
    return t.kind === "keyword" && t.text === text;
  }

  // --- body / block -------------------------------------------------------

  public parseBody(): Block {
    return this.parseForms(() => this.atEnd());
  }

  private parseBlock(): Block {
    // Consumes a `{ ... }` StmtBlock / FnBody.
    if (this.isPunct("{")) {
      this.advance();
    }
    const block = this.parseForms(() => this.isPunct("}") || this.atEnd());
    if (this.isPunct("}")) {
      this.advance();
    }
    return block;
  }

  /** Parse forms until `isEnd`, promoting a trailing tail `Expr` per grammar. */
  private parseForms(isEnd: () => boolean): Block {
    const forms: Form[] = [];
    while (!isEnd()) {
      let sawSep = forms.length === 0;
      while (this.peek().kind === "stmt-sep") {
        this.advance();
        sawSep = true;
      }
      if (isEnd()) {
        break;
      }
      const before = this.pos;
      const form = this.parseForm(sawSep);
      if (form === null) {
        // No progress possible on this token: drop it to guarantee termination.
        if (this.pos === before) {
          this.advance();
        }
        continue;
      }
      forms.push(form);
    }

    // LoomBody ::= Stmt* Expr? — the final form is promoted to the tail iff it
    // is a line-start expression form and is not a lone call/invoke/query
    // action (a lone action stands as a statement per the V19a-T continuation
    // witness `f(a,\n b)` → one statement).
    const last = forms[forms.length - 1];
    if (
      last !== undefined &&
      last.expr !== null &&
      last.lineStart &&
      !(CALL_LIKE.has(last.expr.kind) && forms.length === 1)
    ) {
      return {
        statements: forms.slice(0, -1).map((f) => f.stmt),
        tail: last.expr,
      };
    }
    return { statements: forms.map((f) => f.stmt), tail: null };
  }

  // --- individual forms ---------------------------------------------------

  private parseForm(lineStart: boolean): Form | null {
    const t = this.peek();
    if (t.kind === "keyword") {
      switch (t.text) {
        case "let":
          return this.wrap(this.parseLet(), null, lineStart);
        case "fn":
          return this.wrap(this.parseFn(), null, lineStart);
        case "if":
          return this.wrap(this.parseIf(), null, lineStart);
        case "while":
          return this.wrap(this.parseWhile(), null, lineStart);
        case "for":
          return this.wrap(this.parseFor(), null, lineStart);
        case "break":
          return this.wrap(this.simpleKeyword("break"), null, lineStart);
        case "continue":
          return this.wrap(this.simpleKeyword("continue"), null, lineStart);
        case "return":
          return this.wrap(this.parseReturn(), null, lineStart);
        case "schema":
          return this.wrap(this.parseSchema(), null, lineStart);
        case "enum":
          return this.wrap(this.parseEnum(), null, lineStart);
        case "import":
          return this.wrap(this.parseImportExport("import"), null, lineStart);
        case "export":
          return this.wrap(this.parseImportExport("export"), null, lineStart);
        default:
          break;
      }
    }

    // Statement-form reassignment: `x = e` / `x += e` (ident + assign op).
    if (t.kind === "ident") {
      const reassign = this.tryParseReassign();
      if (reassign !== null) {
        return this.wrap(reassign, null, lineStart);
      }
    }

    // Every remaining form is an expression form; its statement wrapper depends
    // on the expression kind.
    const expr = this.parseExpression();
    if (expr === null) {
      return null;
    }
    return this.wrap(this.exprToStmt(expr), expr, lineStart);
  }

  private wrap(stmt: Stmt, expr: Expr | null, lineStart: boolean): Form {
    return { stmt, expr, lineStart };
  }

  private exprToStmt(expr: Expr): Stmt {
    if (expr.kind === "call") {
      return { kind: "tool-call", call: expr, range: expr.range };
    }
    if (expr.kind === "invoke") {
      return { kind: "invoke", invoke: expr, range: expr.range };
    }
    if (expr.kind === "query") {
      return { kind: "query", query: expr, range: expr.range };
    }
    return { kind: "expr", expr, range: expr.range };
  }

  private simpleKeyword(kind: "break" | "continue"): Stmt {
    const t = this.advance();
    return { kind, range: t.range };
  }

  private parseLet(): Stmt {
    const kw = this.advance(); // `let`
    let mutable = false;
    if (this.isKeyword("mut")) {
      this.advance();
      mutable = true;
    }
    const nameTok = this.advance();
    const name = nameTok.text;
    let annotation: string | null = null;
    if (this.isPunct(":")) {
      this.advance();
      annotation = this.parseType();
    }
    let init: Expr | null = null;
    if (this.isPunct("=")) {
      this.advance();
      init = this.parseExpression();
    }
    // A `let x: T = @`…`` binds a typed query: propagate the declared annotation
    // onto the query so the runtime drives the typed two-phase respond loop and
    // lowers `T` as the response schema (a bare `@`…`` initialiser carries no
    // `@<Schema>` annotation of its own).
    if (
      init !== null &&
      init.kind === "query" &&
      init.schema === null &&
      annotation !== null &&
      annotation.length > 0
    ) {
      init = { ...init, schema: annotation };
    }
    this.bindings.set(name, mutable);
    return {
      kind: "let",
      name,
      mutable,
      annotation,
      init,
      range: spanRange(kw.range, this.prevRange()),
    };
  }

  private tryParseReassign(): Stmt | null {
    const nameTok = this.peek();
    // `x = e` (simple) or `x <op>= e` (compound, `<op>` + `=` as two tokens).
    if (this.isPunct("=", 1)) {
      this.advance(); // name
      this.advance(); // `=`
      const value = this.parseExpression();
      return this.buildReassign(nameTok, "=", value);
    }
    const opTok = this.peek(1);
    if (
      opTok.kind === "punct" &&
      COMPOUND_OPS.has(opTok.text) &&
      this.isPunct("=", 2)
    ) {
      this.advance(); // name
      this.advance(); // op
      this.advance(); // `=`
      const value = this.parseExpression();
      return this.buildReassign(
        nameTok,
        `${opTok.text}=` as ReassignStmt["op"],
        value,
      );
    }
    return null;
  }

  private buildReassign(
    nameTok: Token,
    op: ReassignStmt["op"],
    value: Expr | null,
  ): Stmt {
    const target = nameTok.text;
    // Delegate the immutable-rebinding check to V3b over the real binding
    // scope: fire only for a known immutable (`let`, non-`mut`) target;
    // undeclared targets are another leaf's binding-resolution concern.
    const known = this.bindings.get(target);
    if (known === false) {
      const diag = checkReassignment(
        { name: target, mutable: false },
        { file: this.file, range: nameTok.range },
      );
      if (diag !== undefined) {
        this.diagnostics.push(diag);
      }
    }
    return {
      kind: "reassign",
      target,
      op,
      value: value ?? nullExpr(nameTok.range),
      range: spanRange(nameTok.range, this.prevRange()),
    };
  }

  private parseIf(): Stmt {
    const kw = this.advance(); // `if`
    const condition = this.parseExpression() ?? nullExpr(kw.range);
    const then = this.parseBlock();
    let otherwise: IfStmt | Block | null = null;
    // An `else` may follow across an intervening `stmt-sep`.
    const save = this.pos;
    while (this.peek().kind === "stmt-sep") {
      this.advance();
    }
    if (this.isKeyword("else")) {
      this.advance();
      if (this.isKeyword("if")) {
        otherwise = this.parseIf() as IfStmt;
      } else {
        otherwise = this.parseBlock();
      }
    } else {
      this.pos = save;
    }
    return {
      kind: "if",
      condition,
      then,
      otherwise,
      range: spanRange(kw.range, this.prevRange()),
    };
  }

  private parseWhile(): Stmt {
    const kw = this.advance();
    const condition = this.parseExpression() ?? nullExpr(kw.range);
    const body = this.parseBlock();
    return {
      kind: "while",
      condition,
      body,
      range: spanRange(kw.range, this.prevRange()),
    };
  }

  private parseFor(): Stmt {
    const kw = this.advance();
    const variable = this.advance().text;
    if (this.isKeyword("in")) {
      this.advance();
    }
    const iterand = this.parseExpression() ?? nullExpr(kw.range);
    const body = this.parseBlock();
    return {
      kind: "for",
      variable,
      iterand,
      body,
      range: spanRange(kw.range, this.prevRange()),
    };
  }

  private parseFn(): Stmt {
    const kw = this.advance();
    const name = this.advance().text;
    const params: FnParam[] = [];
    if (this.isPunct("(")) {
      this.advance();
      while (!this.isPunct(")") && !this.atEnd()) {
        const pName = this.advance().text;
        let pType = "";
        if (this.isPunct(":")) {
          this.advance();
          pType = this.parseType();
        }
        params.push({ name: pName, type: pType });
        if (this.isPunct(",")) {
          this.advance();
        }
      }
      if (this.isPunct(")")) {
        this.advance();
      }
    }
    let returnType: string | null = null;
    if (this.isPunct(":")) {
      this.advance();
      returnType = this.parseType();
    }
    const body = this.parseBlock();
    return {
      kind: "fn",
      name,
      params,
      returnType,
      body,
      range: spanRange(kw.range, this.prevRange()),
    };
  }

  private parseReturn(): Stmt {
    const kw = this.advance();
    let operand: Expr | null = null;
    const next = this.peek();
    if (
      next.kind !== "stmt-sep" &&
      next.kind !== "eof" &&
      !(next.kind === "punct" && next.text === "}")
    ) {
      operand = this.parseExpression();
    }
    return {
      kind: "return",
      operand,
      range: spanRange(kw.range, this.prevRange()),
    };
  }

  private parseSchema(): Stmt {
    const kw = this.advance();
    const name = this.advance().text;
    // Retain the object-body field sources (`schema X { field: Type, … }`) so a
    // typed `@<Schema>` query can resolve the declared shape and lower it
    // (QRY-22 / SUBS-1). The `= …` alias and `by … = …` forms carry no leading
    // `{`, so they capture no field list and fall through to `skipDeclarationShape`.
    const fields = this.parseSchemaObjectBody();
    const range = spanRange(kw.range, this.prevRange());
    if (fields === null) {
      return { kind: "schema", name, range };
    }
    return { kind: "schema", name, fields, range };
  }

  /**
   * Capture a `schema X { field: Type, … }` object body's field sources. Returns
   * `null` (and consumes nothing) when the decl is not the leading-`{` object
   * form (an `= …` alias or `by … = …` discriminated-union), leaving
   * `skipDeclarationShape` to consume it. A field name is an `ident` / `keyword`
   * token followed by `:` and a type expression; a body whose first non-sep
   * token is not a plain `ident: Type` field is skipped as a balanced brace group
   * and yields `null` (no field list retained).
   */
  private parseSchemaObjectBody(): SchemaFieldSource[] | null {
    if (!(this.peek().kind === "punct" && this.peek().text === "{")) {
      return null;
    }
    this.advance(); // opening `{`
    const fields: SchemaFieldSource[] = [];
    for (;;) {
      while (this.peek().kind === "stmt-sep") {
        this.advance();
      }
      if (this.atEnd()) {
        break;
      }
      if (this.isPunct("}")) {
        this.advance();
        break;
      }
      const nameTok = this.peek();
      const isFieldName = nameTok.kind === "ident" || nameTok.kind === "keyword";
      if (!isFieldName) {
        // Not a plain `ident: Type` field list (a set-of / discriminated shape):
        // consume the balance of the brace group and retain no field list.
        this.skipBraceRemainder();
        return null;
      }
      this.advance();
      if (!this.isPunct(":")) {
        this.skipBraceRemainder();
        return null;
      }
      this.advance(); // `:`
      const typeSource = this.parseType();
      fields.push({ name: nameTok.text, typeSource });
      if (this.isPunct(",")) {
        this.advance();
      }
    }
    return fields;
  }

  /** Consume tokens up to and including the `}` closing the current brace group. */
  private skipBraceRemainder(): void {
    let depth = 1;
    while (!this.atEnd() && depth > 0) {
      const t = this.advance();
      if (t.kind === "punct" && t.text === "{") {
        depth += 1;
      } else if (t.kind === "punct" && t.text === "}") {
        depth -= 1;
      }
    }
  }

  private parseEnum(): Stmt {
    const kw = this.advance();
    const name = this.advance().text;
    this.skipDeclarationShape();
    return { kind: "enum", name, range: spanRange(kw.range, this.prevRange()) };
  }

  /** Skip a schema/enum shape (`{ ... }` block or `= …` / `by … = …` tail). */
  private skipDeclarationShape(): void {
    // Consume up to the shape's opening `{` (past any `by field =` / `=` head).
    while (!this.atEnd()) {
      if (this.isPunct("{")) {
        this.skipBraces();
        return;
      }
      const t = this.peek();
      if (t.kind === "stmt-sep") {
        return; // an `=`-form declaration closes at the newline
      }
      this.advance();
    }
  }

  private skipBraces(): void {
    // Precondition: current token is `{`.
    let depth = 0;
    do {
      const t = this.advance();
      if (t.kind === "punct" && t.text === "{") {
        depth += 1;
      } else if (t.kind === "punct" && t.text === "}") {
        depth -= 1;
      } else if (t.kind === "eof") {
        return;
      }
    } while (depth > 0);
  }

  private parseImportExport(kind: "import" | "export"): Stmt {
    const kw = this.advance();
    const symbols: string[] = [];
    if (this.isPunct("{")) {
      this.advance();
      while (!this.isPunct("}") && !this.atEnd()) {
        const t = this.peek();
        if (t.kind === "ident" || t.kind === "keyword") {
          symbols.push(t.text);
          this.advance();
        } else if (t.kind === "punct" && t.text === ",") {
          this.advance();
        } else {
          this.advance();
        }
      }
      if (this.isPunct("}")) {
        this.advance();
      }
    }
    if (this.isKeyword("from")) {
      this.advance();
    }
    let path = "";
    const pathTok = this.peek();
    if (pathTok.kind === "string") {
      path = pathTok.value ?? pathTok.text;
      this.advance();
    }
    return {
      kind,
      path,
      symbols,
      range: spanRange(kw.range, this.prevRange()),
    } as ImportDecl | ExportDecl;
  }

  /** Consume a type expression, joining its tokens until a delimiter. */
  private parseType(): string {
    const parts: string[] = [];
    let depth = 0;
    // A leading `{` introduces an inline object type (`let x: { a: T, … }`):
    // consume the balanced brace group verbatim so the annotation carries the
    // whole object shape rather than terminating at the opening brace. Only a
    // *leading* brace is treated this way, so a `fn` return type followed by a
    // `{ body }` block is unaffected.
    if (this.peek().kind === "punct" && this.peek().text === "{") {
      let braceDepth = 0;
      while (!this.atEnd()) {
        const t = this.peek();
        if (t.kind === "stmt-sep") {
          break;
        }
        if (t.kind === "punct" && t.text === "{") {
          braceDepth += 1;
        } else if (t.kind === "punct" && t.text === "}") {
          braceDepth -= 1;
        }
        parts.push(t.text);
        this.advance();
        if (braceDepth === 0) {
          break;
        }
      }
      return parts.join("");
    }
    while (!this.atEnd()) {
      const t = this.peek();
      if (t.kind === "stmt-sep") {
        break;
      }
      if (
        depth === 0 &&
        t.kind === "punct" &&
        (t.text === "," ||
          t.text === ")" ||
          t.text === "{" ||
          t.text === "}" ||
          t.text === "=")
      ) {
        break;
      }
      if (t.kind === "punct" && (t.text === "<" || t.text === "(")) {
        depth += 1;
      } else if (t.kind === "punct" && (t.text === ">" || t.text === ")")) {
        depth -= 1;
      }
      parts.push(t.text);
      this.advance();
    }
    return parts.join("");
  }

  // --- expression sublanguage --------------------------------------------

  private parseExpression(): Expr | null {
    return this.parseTernary();
  }

  private parseTernary(): Expr | null {
    const condition = this.parseBinary(0);
    if (condition === null) {
      return null;
    }
    if (this.isPunct("?")) {
      // Distinguish the ternary head from the postfix error-propagation `?`,
      // which the binary/postfix layer has already consumed onto its operand.
      const q = this.advance();
      const consequent = this.parseTernary() ?? nullExpr(q.range);
      if (this.isPunct(":")) {
        this.advance();
      }
      const alternate = this.parseTernary() ?? nullExpr(q.range);
      return {
        kind: "ternary",
        condition,
        consequent,
        alternate,
        range: spanRange(condition.range, alternate.range),
      };
    }
    return condition;
  }

  private parseBinary(tier: number): Expr | null {
    if (tier >= this.tiers.length) {
      return this.parseUnary();
    }
    let left = this.parseBinary(tier + 1);
    if (left === null) {
      return null;
    }
    const ops = this.tiers[tier] ?? [];
    for (;;) {
      const t = this.peek();
      if (t.kind !== "punct" || !ops.includes(t.text)) {
        break;
      }
      this.advance();
      const right = this.parseBinary(tier + 1);
      if (right === null) {
        break;
      }
      left = {
        kind: "binary",
        op: t.text,
        left,
        right,
        range: spanRange(left.range, right.range),
      };
    }
    return left;
  }

  private parseUnary(): Expr | null {
    if (this.isPunct("-") || this.isPunct("!")) {
      const op = this.advance();
      const operand = this.parsePostfix();
      if (operand === null) {
        return null;
      }
      // Model unary as a binary with a synthetic `null` left so the AST union
      // stays closed; loom 1.0 tests exercise no unary form directly.
      return {
        kind: "binary",
        op: op.text,
        left: nullExpr(op.range),
        right: operand,
        range: spanRange(op.range, operand.range),
      };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Expr | null {
    let expr = this.parsePrimary();
    if (expr === null) {
      return null;
    }
    for (;;) {
      if (this.isPunct("?")) {
        // Postfix error-propagation `?`: a complete-expression terminator. Fold
        // it only when it is not a ternary head — a following `:` is impossible
        // here because a bare `?` immediately after an operand is postfix.
        const q = this.advance();
        expr = {
          kind: "try",
          operand: expr,
          range: spanRange(expr.range, q.range),
        };
        continue;
      }
      break;
    }
    return expr;
  }

  private parsePrimary(): Expr | null {
    const t = this.peek();
    if (t.kind === "number") {
      this.advance();
      return {
        kind: "number",
        text: t.text,
        numericType: t.numericType ?? "integer",
        range: t.range,
      };
    }
    if (t.kind === "string") {
      this.advance();
      return { kind: "string", value: t.value ?? t.text, range: t.range };
    }
    if (t.kind === "keyword") {
      if (t.text === "true" || t.text === "false") {
        this.advance();
        return { kind: "bool", value: t.text === "true", range: t.range };
      }
      if (t.text === "null") {
        this.advance();
        return { kind: "null", range: t.range };
      }
      if (t.text === "invoke") {
        return this.parseInvoke();
      }
    }
    if (t.kind === "ident") {
      this.advance();
      if (this.isPunct("(")) {
        const args = this.parseArgs();
        return {
          kind: "call",
          callee: t.text,
          args,
          range: spanRange(t.range, this.prevRange()),
        };
      }
      return { kind: "ident", name: t.text, range: t.range };
    }
    if (t.kind === "punct") {
      if (t.text === "(") {
        this.advance();
        const inner = this.parseExpression();
        if (this.isPunct(")")) {
          this.advance();
        }
        return inner;
      }
      if (t.text === "[") {
        return this.parseArray();
      }
      if (t.text === "@") {
        return this.parseQuery();
      }
    }
    return null;
  }

  private parseInvoke(): Expr {
    const kw = this.advance(); // `invoke`
    // Skip an optional `<T>` type argument.
    if (this.isPunct("<")) {
      let depth = 0;
      do {
        const t = this.advance();
        if (t.kind === "punct" && t.text === "<") depth += 1;
        else if (t.kind === "punct" && t.text === ">") depth -= 1;
        else if (t.kind === "eof") break;
      } while (depth > 0);
    }
    const args = this.parseArgs();
    const first = args[0];
    const path = first !== undefined && first.kind === "string" ? first.value : "";
    return {
      kind: "invoke",
      path,
      args,
      range: spanRange(kw.range, this.prevRange()),
    };
  }

  private parseArgs(): Expr[] {
    const args: Expr[] = [];
    if (!this.isPunct("(")) {
      return args;
    }
    this.advance(); // `(`
    while (!this.isPunct(")") && !this.atEnd()) {
      const arg = this.parseExpression();
      if (arg === null) {
        this.advance();
        continue;
      }
      args.push(arg);
      if (this.isPunct(",")) {
        this.advance();
      }
    }
    if (this.isPunct(")")) {
      this.advance();
    }
    return args;
  }

  private parseArray(): Expr {
    const open = this.advance(); // `[`
    const elements: Expr[] = [];
    while (!this.isPunct("]") && !this.atEnd()) {
      const el = this.parseExpression();
      if (el === null) {
        this.advance();
        continue;
      }
      elements.push(el);
      if (this.isPunct(",")) {
        this.advance();
      }
    }
    if (this.isPunct("]")) {
      this.advance();
    }
    return {
      kind: "array",
      elements,
      range: spanRange(open.range, this.prevRange()),
    };
  }

  private parseQuery(): Expr {
    const at = this.advance(); // `@`
    let schema: string | null = null;
    // An optional `@<Schema>` annotation precedes the backtick template.
    if (!this.isPunct("`")) {
      const ann = this.peek();
      if (ann.kind === "ident" || ann.kind === "keyword") {
        schema = ann.text;
        this.advance();
      }
    }
    const parts: string[] = [];
    let openTick: Token | null = null;
    let closeTick: Token | null = null;
    if (this.isPunct("`")) {
      openTick = this.advance(); // opening backtick
      while (!this.isPunct("`") && !this.atEnd()) {
        parts.push(this.advance().text);
      }
      if (this.isPunct("`")) {
        closeTick = this.advance(); // closing backtick
      }
    }
    // Recover the verbatim template between the backticks from the raw body
    // source (the tokens are a lossy, space-joined view — they collapse the
    // author's spacing and drop interpolation braces). Fall back to the
    // space-joined tokens only when the raw slice is unavailable (no closing
    // backtick, or no body source threaded through).
    const rawTemplate =
      openTick !== null && closeTick !== null && this.bodyText.length > 0
        ? this.bodyText.slice(
            positionToOffset(this.bodyText, openTick.range.end),
            positionToOffset(this.bodyText, closeTick.range.start),
          )
        : parts.join(" ");
    return {
      kind: "query",
      schema,
      template: rawTemplate,
      range: spanRange(at.range, this.prevRange()),
    };
  }

  private prevRange(): SourceRange {
    const prev = this.tokens[this.pos - 1];
    return prev?.range ?? this.peek().range;
  }
}

/** Build a range spanning from `start`'s start to `end`'s end. */
function spanRange(start: SourceRange, end: SourceRange): SourceRange {
  return { start: start.start, end: end.end };
}

/**
 * Convert a 1-indexed `{ line, column }` source position into a 0-based
 * character offset into `text` (newline-normalised to `\n`). Used to slice a
 * `@`...`` query template verbatim between its backtick token bounds.
 */
function positionToOffset(text: string, pos: Position): number {
  let offset = 0;
  let line = 1;
  while (line < pos.line && offset < text.length) {
    if (text[offset] === "\n") {
      line += 1;
    }
    offset += 1;
  }
  return offset + (pos.column - 1);
}

/** A synthetic `null` literal placeholder for a missing operand. */
function nullExpr(range: SourceRange): Expr {
  return { kind: "null", range };
}
