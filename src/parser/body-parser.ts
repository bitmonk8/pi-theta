// Recursive-descent body parsing and token lookahead for the theta document seam.

import type { Diagnostic, SourceRange } from "../diagnostics/diagnostic";
import type { Token } from "../lexer/lexer";
import { validatePathLiteral } from "../lexer/literals";
import { isTypeLikeName } from "../lexer/name-case";
import {
  checkImportDanglingAlias,
  checkImportMalformedSpecifierList,
  checkImportMissingFromClause,
  checkImportReservedSynthesisedName,
  checkImportSeparatorDegenerateSpecifierList,
  type ImportSpecifier,
} from "./imports";
import {
  checkReassignment,
  checkAssignmentTarget,
  checkMutModifier,
  checkIncrementDecrement,
} from "./bindings";
import { checkObjectSchema, type EnumValueKind, type EnumVariantDecl } from "./schema-declarations";
import { collectPatternBinderNames as collectPatternBindings } from "./match-result";
import { parseObjectPatternFields } from "./object-pattern-fields";
import { parseDelimitedExprs } from "./expr-list";
import { BUILTIN_VALUE_NAMES, reservedKeywordAsIdentifierDiagnostic, unresolvedNamedTypeDiagnostic } from "./annotation-validation";
import { splitTopLevelSegments } from "./params";
import { emitParForBodyDiagnostics } from "./par-for-body-checks";
import { checkLoopVariableAndConsumeIn } from "./loop-variable-recovery";
// A `@`-query template body is captured verbatim at parse time; its static body
// (the literal segments, `${…}` spans dropped) is projected and checked for
// QRY-6's degenerate-template parse-time warning. The interpolation checks
// remain at the document seam.
import { emptyTemplateWarning, queryTemplateStaticBody } from "../render/query-render";
import type {
  ObjectFieldNode,
  PatternNode,
  MatchArmNode,
  Expr,
  ReassignStmt,
  IfStmt,
  FnParam,
  WithField,
  CallWithField,
  CallWithClause,
  SchemaFieldSource,
  ImportDecl,
  ExportDecl,
  Stmt,
  Block,
} from "./theta-ast";
import {
  blockExprMissingTailDiagnostic,
  capitalisedPatternHeadDiagnostic,
  classifyEnumValueToken,
  nullExpr,
  positionToOffset,
} from "./theta-document";

// --------------------------------------------------------------------------
// Recursive-descent body parser
// --------------------------------------------------------------------------

/** Compound-assignment leading operators (`+=`, `-=`, …) lexed as two tokens. */
const COMPOUND_OPS: ReadonlySet<string> = new Set(["+", "-", "*", "/", "%"]);

/**
 * The five recognised `subagent fn` `with { … }` session-config keys (RFC 0001
 * FN-7; grammar.md `WithKey`). Each mirrors a like-named frontmatter field; a
 * key outside this set surfaces `theta/load/unknown-frontmatter-field`.
 */
const WITH_CLAUSE_KEYS: ReadonlySet<string> = new Set([
  "system",
  "model",
  "tools",
  "tool_loop",
  "respond_repair",
]);

/** Reserved keywords that can begin an expression (used in ternary-head lookahead). */
const EXPRESSION_KEYWORDS: ReadonlySet<string> = new Set([
  "match",
  "true",
  "false",
  "null",
  "Ok",
  "Err",
  "invoke",
]);

/** Punctuation that can begin an expression (used in ternary-head lookahead). */
const EXPRESSION_LEAD_PUNCT: ReadonlySet<string> = new Set([
  "(",
  "[",
  "{",
  "-",
  "!",
  "@",
  "`",
]);

/**
 * Keywords that can never occur at bracket depth 0 inside a ternary
 * consequent/alternate expression — the statement/declaration heads. Meeting
 * one in the `isTernaryHead` forward scan proves the scan has crossed a
 * statement boundary whose newline the lexer's trailing-`?` continuation
 * swallowed, so the `?` under test is the postfix error-propagation terminator
 * (grammar.md §"Statement termination & newline continuation" — "the `?`
 * trigger is the ternary head only"; bug 0005 (b)).
 *
 * Why the set is closed: theta has no statement expressions — `let` / `if` /
 * `else` / `while` / `return` / `break` / `continue` and the declaration heads
 * `fn` / `schema` / `enum` / `import` / `export` occur only in statement
 * position, and the two block-expression forms (a `match`-arm block body and a
 * `par for` body) put their statements behind a `{` that raises the bracket
 * depth first, so none of these keywords can sit at depth 0 mid-expression.
 * Deliberately EXCLUDED: `for` and `in` — `par for x in xs { … }` is an
 * expression (grammar.md §Blocks, theta 1.1) and `par` lexes as a contextual
 * ident, so both sit at depth 0 in a legal consequent (`c ? par for x in xs
 * { x } : y`); `match` and the other `EXPRESSION_KEYWORDS`, which head
 * expressions; and the type keywords (`string` … `array`, `Result`, `void`),
 * which sit at depth 0 inside an `invoke<…>` generic annotation because the
 * scan does not depth-track `<`/`>`.
 */
const STATEMENT_ONLY_KEYWORDS: ReadonlySet<string> = new Set([
  "fn",
  "let",
  "if",
  "else",
  "while",
  "return",
  "schema",
  "enum",
  "import",
  "export",
  "break",
  "continue",
]);

/**
 * Keywords that end an alias/union right-hand side met at an ARM-TOKEN
 * BOUNDARY — the position where `AliasRhs ::= Type ("|" Type)*`
 * (grammar.md §"schema X by <field>") requires a `Type` to start, i.e. before
 * the first arm or straight after a top-level `|`. Every member heads a form —
 * a statement (`parseForm`'s keyword switch) or, for the last four, an
 * expression statement — and none can begin a `Type` (grammar.md §"Type
 * grammar"), so meeting one where an arm must start proves the right-hand
 * side already ended and the lexer swallowed the boundary newline behind a
 * trailing `=` / `>` continuation trigger (lexer.ts `trailingTriggers`;
 * grammar.md §"Newline continuation").
 *
 * `match`, `invoke`, `Ok` and `Err` are the expression-statement heads among
 * the reserved keywords (lexer.ts `reservedKeywords`). None is a type name:
 * the type grammar spells the Result type `Result<T, E>`, and has no `match`
 * or `invoke` form at all, so each is exactly as impossible at an arm start as
 * `let` is. The three remaining non-type keywords a statement can open with —
 * `true`, `false`, `null` — are DELIBERATELY absent: they are `LiteralType`
 * atoms (grammar.md §"Type grammar"), so `schema X = true | null` is a
 * right-hand side and stopping on them would truncate it.
 *
 * `enum` heads a statement too and is DELIBERATELY absent: `parseType`
 * captures the rejected inline form `enum["a", "b"]` whole, and
 * `checkSchemaDeclarationGraph`'s per-arm pass then fires
 * `theta/parse/inline-enum` over that captured arm through
 * `checkInlineEnumForm` — the same rejection the object form's field-type
 * position raises. An arm-position stop would strand the source for the
 * statement loop instead, which is neither the capture the check needs nor a
 * shape the statement loop can read. Distinct from `STATEMENT_ONLY_KEYWORDS`
 * above, which answers a different question (what proves the `isTernaryHead`
 * scan crossed a statement boundary) and is tuned to it — it carries `else`,
 * omits `for`, and carries the `enum` this set must not.
 */
const ALIAS_ARM_STOP_KEYWORDS: ReadonlySet<string> = new Set([
  "let",
  "fn",
  "if",
  "while",
  "for",
  "break",
  "continue",
  "return",
  "schema",
  "import",
  "export",
  "match",
  "invoke",
  "Ok",
  "Err",
]);

/**
 * Punctuation that ends an alias/union right-hand side met at an ARM-TOKEN
 * BOUNDARY — where `AliasRhs ::= Type ("|" Type)*` requires an arm to START
 * (before the first arm, or straight after a top-level `|`) or where one has
 * been COMPLETED. No member can begin or continue a `Type`: the type
 * grammar's forms are the named / primitive / literal atoms, the `<…>` generic
 * application and the `{…}` inline object (grammar.md §"Type grammar"), so
 * there is no parenthesised or bracket-headed `Type`, and neither `@` nor a
 * template backtick occurs in it at all. Every member DOES head a punct-led
 * expression statement (`EXPRESSION_LEAD_PUNCT`): a query, a template, a
 * parenthesised expression, an array literal. Meeting one at a boundary
 * therefore proves the right-hand side already ended and the lexer swallowed
 * the boundary newline behind a trailing `=` / `>` continuation trigger
 * (lexer.ts `trailingTriggers`) — the keyword case's argument, one token class
 * along, and without it the whole following statement is absorbed into the arm
 * source with no diagnostic at all.
 *
 * `{` is absent because an inline `ObjectType` IS a `Type` in any `Type`
 * position, and `-` is absent because its stop is scoped to one boundary, not
 * both: no `Type` begins with `-` either (`LiteralType ::= STRING | NUMBER |
 * BOOLEAN | NULL`, grammar.md §"Type grammar" — the `"-" NUMBER` alternative
 * belongs to the value sublanguage's `PrimitiveLit`), so an arm-start `-`
 * opens no legal arm and is CAPTURED there instead of stopping the scan:
 * `schema X = -1` keeps the junk arm `"-"` rather than falling to the
 * shapeless-RHS `empty-schema-body` path. Whether that right-hand side is a
 * well-formed `AliasRhs` is a question answered from the DECLARATION's own
 * extent, not from this capture — `finishAliasSchema` checks the two against
 * each other once the capture returns (bug 0042 §Fix), and this stop set is
 * unchanged by that check. A `-` straight after a COMPLETED arm is a different position
 * entirely — no `Type` continues with it, and it heads a unary-negation
 * expression statement — so `parseType` stops on it through its own
 * completed-arm-only test rather than through this set, whose members stop at
 * BOTH boundaries. `!` is a member: it is the unary-not head of an expression
 * statement (`EXPRESSION_LEAD_PUNCT`) and the type grammar has no `!`
 * anywhere, so it can neither start nor continue a `Type` — the same argument
 * as `(` and `[`, and unlike `-` it holds at an arm start too. The `[` of the rejected
 * inline `enum["a", "b"]` form is at no boundary — it follows the bare `enum`
 * keyword, which completes no arm — so that form is still captured whole for
 * `checkInlineEnumForm`.
 */
const ALIAS_ARM_STOP_PUNCT: ReadonlySet<string> = new Set(["@", "`", "(", "[", "!"]);

/**
 * Whether a token stopping an alias/union right-hand-side capture is residue
 * the author wrote, rather than one of the structural closers `parseType`
 * also breaks on — `,`, `)`, `{`, `}`, `=`. Each of those is excluded for one
 * of two reasons. It closes an ENCLOSING construct, where a report would be a
 * false positive: `fn f(): integer { schema X = integer }` is a legal program
 * whose body-closing `}` sits on the declaration's own line, and it is the
 * case this exclusion exists to protect. Or the statement loop already draws
 * its own diagnostic at that boundary — `unsupported-feature`'s
 * `stray '<t>' in statement position` for a top-level `,` / `)` / `}` / `=`,
 * `bare-object-literal` for a `{` — so a second code here would add nothing
 * an author can act on and must not double up.
 *
 * A residue head is a value-ish atom
 * (`ident` / `keyword` / `string` / `number`) or a punct that heads a
 * punct-led statement (`ALIAS_ARM_STOP_PUNCT`) or a unary-negation `-` — the
 * same token kinds `parseType`'s own stops fire on, read back at the
 * cursor rather than at the token before it (`finishAliasSchema`, bug 0042
 * §Fix).
 */
function isAliasResidueHead(t: Token): boolean {
  switch (t.kind) {
    case "ident":
    case "keyword":
    case "string":
    case "number":
      return true;
    case "punct":
      return ALIAS_ARM_STOP_PUNCT.has(t.text) || t.text === "-";
    default:
      return false;
  }
}

/** Whether a token can begin an expression (a ternary consequent). */
function canStartExpression(t: Token): boolean {
  switch (t.kind) {
    case "number":
    case "string":
    case "ident":
      return true;
    case "keyword":
      return EXPRESSION_KEYWORDS.has(t.text);
    case "punct":
      return EXPRESSION_LEAD_PUNCT.has(t.text);
    default:
      return false;
  }
}

/**
 * Whether a schema field's captured `typeSource` text ends a `Type` atom
 * (grammar.md:90–:95), rather than stopping mid-token on trailing punctuation
 * `parseType`'s depth-0 stop set has no entry for (`.`, `-`, and similarly).
 * `parseType`'s `stopAtFieldBoundary` arm stops the capture in front of the
 * next value-ish token without asking whether the token BEHIND the cursor
 * could end a `Type`; when it could not, the boundary the arm reports was
 * manufactured by the capture stopping inside one field's text, not written
 * by the author as the start of a further `Field` (bug 0285 §Fix). An empty
 * capture ends no atom. The closers `>` `)` `]` `}` and a string-literal
 * quote can end a `Type` atom (a generic application, a call, an inline
 * object/array, or a string-literal type); every other trailing character is
 * punctuation no `Type` production ends on.
 */
function typeSourceEndsAtom(typeSource: string): boolean {
  if (typeSource.length === 0) {
    return false;
  }
  const last = typeSource[typeSource.length - 1] ?? "";
  if (/[A-Za-z0-9_]/.test(last)) {
    return true;
  }
  return last === ">" || last === ")" || last === "]" || last === "}" || last === '"' || last === "'";
}

/**
 * Canonicalise a parsed `{ ... }` body for the ONE position that requires a
 * structural tail (`BlockExpr`, bug 0082 §Fix): promote a trailing bare
 * `ExprStmt` to `Block.tail` when `parseForms` left `tail: null`.
 *
 * WHY THIS IS NEEDED, NOT COSMETIC. Newline continuation swallows every
 * `stmt-sep` at bracket depth > 0 (lexer.ts `collapseContinuations`), so
 * inside ANY `{ ... }` — a `BlockExpr` included — only the FIRST statement in
 * source order (or one immediately following a postfix `?` / a nested `}`)
 * ever sees `lineStart: true`; every later line-start expression form reaches
 * `parseForms`'s tail-promotion test with `lineStart: false` and is recorded
 * as an ordinary `ExprStmt` instead. `executeBlock`
 * (../runtime/statement-executor.ts) already treats a trailing bare `expr`
 * statement as tail-EQUIVALENT for VALUE purposes (its own doc comment states
 * the rule); this function makes that equivalence STRUCTURAL for `BlockExpr`
 * specifically, so `Block.tail` genuinely carries the block's value node
 * (grammar.md:118) rather than leaving grammar.md's REQUIRED tail to a
 * runtime fallback that this position's `theta/parse/block-expr-missing-tail`
 * check would otherwise misfire against.
 *
 * Scoped to the returned `BlockExpr.body` alone: `parseBlock`'s other callers
 * (`FnBody` / `StmtBlock` / `ThetaBody`) admit an implicit `null` tail by
 * design (grammar.md :119/:121) and are untouched — this function is never
 * called on their result.
 */
function promoteTrailingExprToTail(block: Block): Block {
  if (block.tail !== null) {
    return block;
  }
  const last = block.statements[block.statements.length - 1];
  if (last === undefined || last.kind !== "expr") {
    return block;
  }
  return { statements: block.statements.slice(0, -1), tail: last.expr };
}

/** One parsed top-level / block form: its statement node plus tail metadata. */
interface Form {
  readonly stmt: Stmt;
  /** The raw `Expr` when the form is an expression form, else `null`. */
  readonly expr: Expr | null;
  /** `true` when the form began at a logical-line start (after a `stmt-sep`). */
  readonly lineStart: boolean;
}

/**
 * A per-invocation recursive-descent parser over the lexer's continuation-joined
 * token stream. Holds only per-parse cursor / diagnostic / binding-scope state
 * (constructor-injected), never module-level mutable state.
 */
class BodyParser {
  private pos = 0;
  /**
   * When set, `parsePrimary` does NOT treat a leading `{` (bare object literal)
   * or an `Ident {` (named object literal) as an object-literal expression, so
   * an `if` / `while` / `for` header's `{` reads as the block opener, not an
   * object literal. It is cleared inside a bracketed group (`(...)`, `[...]`,
   * call args, object-field values, match arms) so an object literal nested
   * inside a condition still parses.
   */
  private suppressBrace = false;
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
  /**
   * Tier indices into `tiers` whose operators are non-associative and reject
   * chaining (equality `== !=` and comparison `< <= > >=`), per
   * expressions.md §"Operator precedence".
   */
  private readonly nonAssociativeTiers: ReadonlySet<number> = new Set([2, 3]);

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
    private readonly bodyText: string,
    /**
     * The frontmatter `params:` field wire names. A theta's `params:` fields ARE
     * its parameters (bindings.md:31 "Function parameters"), an always-immutable
     * context, and they are whole-file-visible — so they seed `this.bindings` as
     * immutable at file scope before any body statement parses, and
     * `buildReassign` draws `immutable-rebinding` for a write to one exactly as
     * for an immutable top-level `let` (bug 0370 §Fix F3). A body `let` of the
     * same name overwrites the seed file-linearly, so a shadowing `let mut`
     * write stays writable.
     */
    paramFieldNames: ReadonlySet<string> = new Set(),
  ) {
    for (const name of paramFieldNames) {
      this.bindings.set(name, false);
    }
  }

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

  /**
   * How many punct `)` tokens the half-open span `[from, to)` consumed beyond
   * its own punct `(` tokens — i.e. how many closers it swallowed that were not
   * its own. Only `punct` tokens count, so a `)` character inside a string or
   * template token's text is excluded by construction.
   */
  private unmatchedCloseParens(from: number, to: number): number {
    let net = 0;
    for (let i = from; i < to; i += 1) {
      const t = this.tokens[i];
      if (t?.kind !== "punct") {
        continue;
      }
      if (t.text === "(") {
        net -= 1;
      } else if (t.text === ")") {
        net += 1;
      }
    }
    return net;
  }

  /**
   * How many punct `}` tokens the half-open span `[from, to)` consumed beyond
   * its own punct `{` tokens — the `unmatchedCloseParens` sibling for
   * `parseSchemaObjectBody`'s own withhold (bug 0245 §Fix): a field-TYPE
   * capture that swallowed the enclosing object body's own `}` took a closer
   * that was not its own, under the same unfloored `<`/`>` depth counter in
   * `parseType`. Only `punct` tokens count, so a `}` character inside a string
   * or template token's text is excluded by construction.
   */
  private unmatchedCloseBraces(from: number, to: number): number {
    let net = 0;
    for (let i = from; i < to; i += 1) {
      const t = this.tokens[i];
      if (t?.kind !== "punct") {
        continue;
      }
      if (t.text === "{") {
        net -= 1;
      } else if (t.text === "}") {
        net += 1;
      }
    }
    return net;
  }

  // --- body / block -------------------------------------------------------

  public parseBody(): Block {
    return this.parseForms(() => this.atEnd());
  }

  private parseBlock(): Block {
    // Consumes a `{ ... }` StmtBlock / FnBody. `parseBlock` is the single
    // production for EVERY non-top-level block (if/else/while/for/fn-body/
    // match-arm block-exprs); the top-level document parses through
    // `parseBody` → `parseForms` directly and never calls `parseBlock`, so
    // this snapshot/restore cannot touch top-level file-linear behaviour.
    // Local bindings shadow lexically, the same as Rust or TypeScript
    // (expressions.md:51): a name `let`-declared inside this block must stop
    // shadowing once the block's `}` closes, so the outer same-named entry
    // (if any) is exactly as it was before the block. `this.bindings` is
    // otherwise a flat, file-linear map with no such boundary; a block-scoped
    // `let`/`let mut` would permanently overwrite an outer entry of the same
    // name for the rest of the file, producing a false — or falsely absent —
    // `theta/parse/immutable-rebinding` on a later write to the outer binding
    // (bug 0386). Snapshotting and restoring the whole map around the block
    // body closes that leak without reassigning the `readonly` field.
    const savedBindings = new Map(this.bindings);
    if (this.isPunct("{")) {
      this.advance();
    }
    try {
      const block = this.parseForms(() => this.isPunct("}") || this.atEnd());
      if (this.isPunct("}")) {
        this.advance();
      }
      return block;
    } finally {
      this.bindings.clear();
      for (const [n, m] of savedBindings) {
        this.bindings.set(n, m);
      }
    }
  }

  /** Parse forms until `isEnd`, promoting a trailing tail `Expr` per grammar. */
  private parseForms(isEnd: () => boolean): Block {
    const forms: Form[] = [];
    // The postfix error-propagation `?` is a complete-expression terminator that
    // always closes its statement and never triggers newline continuation
    // (grammar.md §"Newline continuation" — "The `?` trigger is the ternary head
    // only"). The lexer, unable to distinguish a postfix `?` from a ternary-head
    // `?`, swallows the following `stmt-sep`; so a form whose final token is a
    // postfix `?` forces the NEXT form to start a new logical line, restoring
    // its `lineStart` (and hence its tail-`Expr` promotion eligibility).
    let forcedLineStart = false;
    while (!isEnd()) {
      let sawSep = forms.length === 0 || forcedLineStart;
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
        // No progress possible on this token: it starts no legal statement or
        // expression form. A stray punctuation token in statement position (a
        // trailing `;`, a stray non-grammar char) is not part of the grammar
        // (lexical.md §"Statement terminators": semicolons are not part of the
        // grammar) — surface a parse error rather than silently dropping it, then
        // drop it to guarantee termination.
        if (this.pos === before) {
          const stray = this.peek();
          if (stray.kind === "punct") {
            this.diagnostics.push({
              severity: "error",
              code: "theta/parse/unsupported-feature",
              file: this.file,
              range: stray.range,
              message: `unsupported syntactic feature: stray '${stray.text}' in statement position`,
            });
          }
          this.advance();
        }
        continue;
      }
      forms.push(form);
      const lastTok = this.tokens[this.pos - 1];
      // A postfix `?` and a block-closing `}` both terminate their statement and
      // never continue onto the next line: the `stmt-sep` after each is not
      // surfaced as a form boundary here (the lexer swallows the postfix-`?`
      // separator; a block-terminated statement leaves the next form with no
      // consumed `stmt-sep`), so restore `lineStart` for the NEXT form to keep
      // its tail-`Expr` promotion eligibility. Without the `}` arm, a trailing
      // expression after an `if`/`while`/`for`/`fn` block
      // (`fn s(n){ if …{…}\n n + s(n - 1) }`) would lose its FN-5 tail promotion
      // and its value would be dropped.
      forcedLineStart =
        lastTok !== undefined &&
        lastTok.kind === "punct" &&
        (lastTok.text === "?" || lastTok.text === "}");
    }

    // ThetaBody ::= Stmt* Expr? — the final form is promoted to the tail iff it
    // is a line-start expression form. Its value is the body's final value
    // (functions.md FN-5: a fn/theta body's value is its tail expression),
    // including a lone or trailing call/invoke/query — `fn f(n){ g(n) }` MUST
    // return `g(n)` (FN-5), so a bare-call tail is the final value, not a
    // discarded action. The V19a-T continuation witness `f(a,\n b)` is about
    // grouping the multi-line call arguments into ONE form (a lexer concern),
    // orthogonal to whether that one form's value is the body's tail.
    const last = forms[forms.length - 1];
    if (last !== undefined && last.expr !== null && last.lineStart) {
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
    // `subagent fn` — `subagent` is a contextual keyword (grammar.md
    // §"Contextual keywords") recognised only immediately before a `fn`; a
    // nested occurrence still lowers to a `fn` node so the placement walk fires
    // `theta/parse/nested-fn` (FN-1/FN-6). Everywhere else `subagent` is an
    // ordinary identifier and falls through to the ident / expression paths.
    if (t.kind === "ident" && t.text === "subagent" && this.isKeyword("fn", 1)) {
      this.advance(); // `subagent`
      return this.wrap(this.parseFn(true), null, lineStart);
    }
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
    // A member / index expression at statement head followed by an assignment
    // operator is `obj.field = …` / `arr[i] = …` — theta 1.0 mutability is
    // binding-level only (bindings.md §Mutability is binding-level only). Detect
    // it here (the AST carries no member/index reassignment form) and consume
    // the RHS so the assignment does not mis-parse into stray forms.
    if (expr.kind === "member" || expr.kind === "index") {
      const isSimple = this.isPunct("=") && !this.isPunct("=", 1);
      const opTok = this.peek();
      const isCompound =
        opTok.kind === "punct" &&
        COMPOUND_OPS.has(opTok.text) &&
        this.isPunct("=", 1);
      if (isSimple || isCompound) {
        this.advance(); // operator (`=`, or the `<op>` of `<op>=`)
        if (isCompound) {
          this.advance(); // the `=` of a compound `<op>=`
        }
        const diag = checkAssignmentTarget(
          { kind: expr.kind },
          { file: this.file, range: expr.range },
        );
        if (diag !== undefined) {
          this.diagnostics.push(diag);
        }
        this.parseExpression(); // consume + discard the RHS
        return this.wrap(
          { kind: "expr", expr, range: expr.range },
          null,
          lineStart,
        );
      }
    }
    // A `par for` in statement position is a discarded-value expression
    // statement (grammar.md §Blocks): it is NOT promoted to the body tail, so
    // its value is discarded (`tailExpr = null`). It is recorded as an
    // `ExprStmt`, so a standalone `par for` reads as an expression statement
    // rather than a bare tail node whose value would flow on as the body tail.
    const tailExpr = expr.kind === "par-for" ? null : expr;
    return this.wrap(this.exprToStmt(expr), tailExpr, lineStart);
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
    if (kind === "break") {
      // A value operand on the same logical line (`break expr`) is forbidden in
      // theta 1.0. Peek (do not consume) so the residual expression still parses
      // as its own statement; the structural checker reads `hasValue`.
      const next = this.peek();
      const hasValue =
        next.kind !== "stmt-sep" &&
        next.kind !== "eof" &&
        !(next.kind === "punct" && next.text === "}");
      return { kind, hasValue, range: t.range };
    }
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
    if (mutable && name === "_") {
      // `_` is a discard binding and cannot be reassigned, so `mut` is
      // meaningless on it (bindings.md §"Immutable contexts").
      this.diagnostics.push({
        severity: "error",
        code: "theta/parse/mut-on-discard",
        file: this.file,
        range: nameTok.range,
        message: "'mut' is not permitted on discard binding '_'",
      });
    }
    let annotation: string | null = null;
    // Absent iff the capture ended at its own terminator (`=`); present, it
    // stopped somewhere else — past a syntax fault, holding the next
    // construct's text, or early at a token this position does not derive —
    // and clause (iv)(3) (bug 0279) withholds only on that mark, not on the
    // range of whichever diagnostic happens to cover it.
    let annotationAbsorbed = false;
    if (this.isPunct(":")) {
      this.advance();
      annotation = this.parseType();
      annotationAbsorbed = !this.isPunct("=");
    }
    let init: Expr | null = null;
    if (this.isPunct("=")) {
      this.advance();
      init = this.parseExpressionAtBlockSite();
    }
    // A `let x: T = @`…`` (or its `?`-propagating form `let x: T = @`…`?`) binds
    // a typed query: propagate the declared annotation onto the query so the
    // runtime drives the typed two-phase respond loop and lowers `T` as the
    // response schema (a bare `@`…`` initialiser carries no `@<Schema>`
    // annotation of its own). The `?`-wrapped form is `try(query)`, so the
    // annotation propagates onto the try's inner query operand.
    if (init !== null && annotation !== null && annotation.length > 0) {
      if (init.kind === "query" && init.schema === null) {
        init = { ...init, schema: annotation, schemaFromLetAnnotation: true };
      } else if (
        init.kind === "try" &&
        init.operand.kind === "query" &&
        init.operand.schema === null
      ) {
        init = {
          ...init,
          operand: { ...init.operand, schema: annotation, schemaFromLetAnnotation: true },
        };
      }
    }
    this.bindings.set(name, mutable);
    return {
      kind: "let",
      name,
      mutable,
      annotation,
      init,
      ...(annotationAbsorbed ? { annotationAbsorbed: true } : {}),
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
    // The EXACT signal the ident walk reads to defer its out-of-scope
    // `unknown-identifier`: set true in precisely the two branches below that
    // push `theta/parse/immutable-rebinding`, so the walk suppresses a spurious
    // second refusal for exactly those targets (bug 0370 §Fix layer 1's
    // G6-defer), never for a name this pass drew nothing on.
    let immutableRebindingEmitted = false;
    if (target === "_") {
      // `_` is the discard binding and cannot be reassigned (bindings.md:34,
      // an immutable context). The ident walk's own `_` exemption stays silent,
      // so this is the single emission for a `_` target (bug 0370 §Fix F4).
      this.diagnostics.push({
        severity: "error",
        code: "theta/parse/immutable-rebinding",
        file: this.file,
        range: nameTok.range,
        message: "cannot reassign immutable binding '_'",
      });
      immutableRebindingEmitted = true;
    } else {
      // Delegate the immutable-rebinding check to V3b over the real binding
      // scope: fire only for a known immutable (`let`, non-`mut`) target — a
      // top-level `let`, a save/restore-scoped parameter / `for` / `par for` /
      // `match` binder, or a whole-file `params:` field seed (bug 0370 §Fix
      // F1/F3); undeclared targets are the ident walk's concern.
      const known = this.bindings.get(target);
      if (known === false) {
        const diag = checkReassignment(
          { name: target, mutable: false },
          { file: this.file, range: nameTok.range },
        );
        if (diag !== undefined) {
          this.diagnostics.push(diag);
          immutableRebindingEmitted = true;
        }
      }
    }
    return {
      kind: "reassign",
      target,
      op,
      value: value ?? nullExpr(nameTok.range),
      range: spanRange(nameTok.range, this.prevRange()),
      immutableRebindingEmitted,
    };
  }

  /**
   * Record `names` as immutable (`this.bindings.set(name, false)`) for the
   * duration of `body` and restore the map to its EXACT prior state
   * afterward — a parameter, `for` variable, or `match` binder is an
   * always-immutable context (bindings.md §"Immutable contexts"), and
   * `buildReassign`'s flat mutability map has to see that for the scope `body`
   * parses, without leaking the entry file-linearly onto an unrelated
   * top-level binding of the same name once `body` returns (bug 0370 §Fix
   * layer 1). Restore replays each name's PRIOR entry (present or absent),
   * rather than a fixed `true`, so a same-named outer binding's own
   * mutability survives a nested parameter/loop/pattern shadow unchanged.
   */
  private withImmutableBindings<T>(names: readonly string[], body: () => T): T {
    const saved: Array<readonly [string, boolean | undefined]> = names.map(
      (name) => [name, this.bindings.get(name)] as const,
    );
    for (const name of names) {
      this.bindings.set(name, false);
    }
    try {
      return body();
    } finally {
      for (const [name, prior] of saved) {
        if (prior === undefined) {
          this.bindings.delete(name);
        } else {
          this.bindings.set(name, prior);
        }
      }
    }
  }

  /**
   * Parse a control-flow header expression (an `if` / `while` condition or a
   * `for` iterand) with object-literal brace-suppression active so the trailing
   * `{` opens the block rather than reading as an object literal.
   */
  private parseHeaderExpression(): Expr | null {
    const save = this.suppressBrace;
    this.suppressBrace = true;
    try {
      const inner = this.parseExpression();
      this.consumeTrailingAssignment();
      return inner;
    } finally {
      this.suppressBrace = save;
    }
  }

  private parseIf(): Stmt {
    const kw = this.advance(); // `if`
    const condition = this.parseHeaderExpression() ?? nullExpr(kw.range);
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
    const condition = this.parseHeaderExpression() ?? nullExpr(kw.range);
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
    let mutConsumed = false;
    if (this.isKeyword("mut")) {
      // A `mut` modifier on a `for` iteration variable is an always-immutable
      // context (bindings.md §Immutable contexts).
      mutConsumed = true;
      const mutTok = this.advance();
      const diag = checkMutModifier(
        { position: "for-var" },
        { file: this.file, range: mutTok.range },
      );
      if (diag !== undefined) {
        this.diagnostics.push(diag);
      }
    }
    const variableTok = this.peek();
    const variable = this.advance().text;
    // `ForStmt ::= "for" Ident "in" Expr StmtBlock` (grammar.md) makes the
    // loop variable a reserved-keyword-checked `Ident` terminal, guarded
    // against the `mut`-consumption recovery artefact (bug 0153 §Fix — rule
    // and rationale on `checkLoopVariableAndConsumeIn`,
    // loop-variable-recovery.ts).
    checkLoopVariableAndConsumeIn(
      this.diagnostics,
      this.file,
      variableTok,
      mutConsumed,
      () => this.isKeyword("in"),
      () => this.advance(),
    );
    const iterand = this.parseHeaderExpression() ?? nullExpr(kw.range);
    // The loop variable is an always-immutable context (bindings.md §"Immutable
    // contexts"); scope it to the body's parse only so a reassignment to it
    // draws `immutable-rebinding` (bug 0370 §Fix layer 1) without leaking onto
    // an unrelated same-named binding once the loop's own scope ends.
    const body = this.withImmutableBindings([variable], () => this.parseBlock());
    return {
      kind: "for",
      variable,
      iterand,
      body,
      range: spanRange(kw.range, this.prevRange()),
    };
  }

  private parseFn(subagent = false): Stmt {
    const kw = this.advance();
    const name = this.advance().text;
    let params: FnParam[] = [];
    // Grammar: `FnDecl` parameter lists are always parenthesised (`fn f()`,
    // never `fn f`). A missing `(` after the fn name is a parse error — without
    // it a bare `fn f x { … }` silently parses `x` as the fn name's trailing
    // junk and accepts a malformed declaration.
    if (!this.isPunct("(")) {
      this.diagnostics.push({
        severity: "error",
        code: "theta/parse/unsupported-feature",
        file: this.file,
        range: this.peek().range,
        message:
          "unsupported syntactic feature: fn parameter list must be parenthesised",
      });
    }
    if (this.isPunct("(")) {
      const openTok = this.advance();
      params = this.parseFnParamList(openTok);
    }
    let returnType: string | null = null;
    // Absent iff no `:` was written, or the capture ended at its own
    // terminator (the body's `{`, or the contextual `with` ident); present, it
    // stopped somewhere else — past a syntax fault, holding the next
    // construct's text, or early at a token the return slot does not derive
    // (bug 0279, clause (iv)(3)'s provenance mark).
    let returnTypeAbsorbed = false;
    if (this.isPunct(":")) {
      this.advance();
      // The return slot terminates at a depth-0 `with`: grammar.md §"`fn`
      // declarations" places `(":" ReturnType)?` and `WithClause?` as
      // consecutive optional slots, and `with` is contextual (lexes as an
      // ident), so without the stop the type parser consumed it — `): string
      // with { … }` yielded the concatenated annotation `stringwith` and took
      // the with-braces as the fn BODY (bug 0005 (a)).
      returnType = this.parseType(false, true);
      returnTypeAbsorbed = !(
        this.isPunct("{") ||
        (this.peek().kind === "ident" && this.peek().text === "with")
      );
    }
    // `WithClause?` — `with` is a contextual keyword (grammar.md §"Contextual
    // keywords") admitted only here, between a `subagent fn`'s signature and its
    // body block. It is only meaningful on a `subagent fn`; on an ordinary `fn`
    // a `with` before the body is left to fall through (it is not consumed).
    let withClause: WithField[] | null = null;
    if (
      subagent &&
      this.peek().kind === "ident" &&
      this.peek().text === "with" &&
      this.isPunct("{", 1)
    ) {
      withClause = this.parseWithClause();
    }
    // Each parameter is an always-immutable context (bindings.md §"Immutable
    // contexts"); scope the record to the body's parse only so a reassignment
    // to a parameter draws `immutable-rebinding` (bug 0370 §Fix layer 1)
    // without leaking onto an unrelated same-named binding once the fn body's
    // own scope ends.
    const body = this.withImmutableBindings(params.map((p) => p.name), () =>
      this.parseBlock(),
    );
    return {
      kind: "fn",
      name,
      params,
      returnType,
      body,
      subagent,
      withClause,
      ...(returnTypeAbsorbed ? { returnTypeAbsorbed: true } : {}),
      range: spanRange(kw.range, this.prevRange()),
    };
  }

  /** Parse an opened fn parameter list and emit its capture/closing diagnostics. */
  private parseFnParamList(openTok: Token): FnParam[] {
    const params: FnParam[] = [];
    // The closing `)` is a required terminal of `FnDecl`, and nothing else in
    // this function asks whether it arrived: the loop below exits on `)` OR on
    // EOF and the epilogue's `)` consume is conditional, so the two exits are
    // indistinguishable. The lexer removes the other boundary that would have
    // stopped the list — an unmatched `(` suppresses every following
    // `stmt-sep` (grammar.md §"Newline continuation", the open-bracket
    // trigger), so the rest of the file joins the parameter list.
    let unclosed = false;
    // A parameter TYPE capture that consumed MORE punct `)` tokens than punct
    // `(` tokens took a closer that was not its own — the list's, under the
    // unfloored `<` / `>` depth counter in `parseType` (bug 0124
    // §Reproduction (e)). Reporting the list as unclosed would then name a
    // token that IS present, so the verdict is withheld and the capture-level
    // rows keep the input. The withhold covers the recovery below as well as
    // the verdict: such an input keeps the parameters, the statement
    // absorption and the diagnostics it had before.
    let closeParenAbsorbed = false;
    // The first parameter-name-position token whose `kind` derives from no
    // `Ident` (a `punct`, `number`, `string` or `template` token). Recorded
    // rather than reported at the point of capture: only the epilogue knows
    // whether the list closed on its own `)` or on one spent elsewhere, and
    // the two settled exits (a body-open `{`, EOF) already carry the correct
    // verdict under `fn-param-list-unclosed` on their own.
    let refusedTok: Token | null = null;
    // `atParamStart` is true only where the author could have written a
    // parameter name. `mut`'s modifier check below can leave the loop
    // re-entering on a recovery artefact instead: consuming `mut` shifts
    // the annotation `:` into the name slot, then the type token into the
    // slot after that. The keyword-reserved check below must not fire on
    // either shifted token, or `fn h(mut: string)` gains a second
    // diagnostic and no longer keeps `mut-on-immutable-context` alone (bug
    // 0148 §Fix (d)).
    let atParamStart = true;
    while (!this.isPunct(")") && !this.atEnd()) {
      // A block-open `{` derives from no `FnParam` position, and a `)` before
      // it would already have exited the loop — so the list is unclosed and
      // the brace is the author's body. Break with the cursor ON it, so
      // `parseBlock` below takes it as the `FnBody` the author wrote instead
      // of recording it (and the body's own tokens) as parameters.
      if (this.isPunct("{") && !closeParenAbsorbed) {
        unclosed = true;
        break;
      }
      let mutConsumed = false;
      if (this.isKeyword("mut")) {
        // A `mut` modifier on a function parameter is an always-immutable
        // context (bindings.md §Immutable contexts).
        mutConsumed = true;
        const mutTok = this.advance();
        const diag = checkMutModifier(
          { position: "fn-param" },
          { file: this.file, range: mutTok.range },
        );
        if (diag !== undefined) {
          this.diagnostics.push(diag);
        }
      }
      const pTok = this.advance();
      // `FnParam ::= Ident (":" Type)?` (grammar.md) derives an `Ident` at this
      // position, and `Ident` is `[A-Za-z_][A-Za-z0-9_]*` (lexical.md) — a
      // `punct`, `number`, `string` or `template` token here is not a
      // shorter or malformed identifier, it is a different production
      // entirely. Recorded, not reported: a `mut` consume in this same
      // iteration shifts the annotation `:` into this slot as a recovery
      // artefact, and that shift must not gain a second diagnostic beside
      // `mut-on-immutable-context` (bug 0148 §Fix (d)), so the shifted token
      // is exempt for this one iteration only.
      if (
        refusedTok === null &&
        !mutConsumed &&
        pTok.kind !== "ident" &&
        pTok.kind !== "keyword"
      ) {
        refusedTok = pTok;
      }
      // lexical.md's reserved-keyword rule carries no position list of its
      // own — unlike the lowercase-first rule below — so a `fn` parameter
      // name is inside its scope (bug 0148 §Fix). A reserved spelling
      // already lexes as `kind: "keyword"` (lexer.ts, `reserved.has(value)
      // ? "keyword" : "ident"`) — the same classification `checkName`'s
      // keyword-first arm reads — so this check needs no second
      // reserved-word list. Reading that classification directly is what
      // keeps the contextual keywords `subagent` / `with` / `par` silent
      // here: they lex as `ident` and fall to the case arm below.
      if (pTok.kind === "keyword" && atParamStart) {
        this.diagnostics.push({
          severity: "error",
          code: "theta/parse/reserved-keyword-as-identifier",
          file: this.file,
          range: pTok.range,
          message: `reserved keyword '${pTok.text}' cannot be used as an identifier`,
        });
      } else if (pTok.kind === "ident") {
        // lexical.md §Identifiers requires lowercase-first for a `fn`
        // parameter name, and code-registry-parse.md's binding-case-mismatch
        // row already names the parameter position in its Trigger. The
        // predicate is the shared `isTypeLikeName` guard (lexer/name-case),
        // the same one `checkName`'s binding arm asks, so the rule keeps one
        // implementation across every position it is enforced at.
        if (isTypeLikeName(pTok.text)) {
          this.diagnostics.push({
            severity: "error",
            code: "theta/parse/binding-case-mismatch",
            file: this.file,
            range: pTok.range,
            message: "binding name must start with a lowercase letter or _",
          });
        }
      }
      let pType = "";
      // Absent iff the capture is empty (no `:` written) or ended at its own
      // terminator (`,` or the list's `)`); present, it stopped somewhere
      // else — past a syntax fault, holding text beyond the parameter, or
      // early at a token the list does not derive — which clause (iv)(3)
      // (bug 0279) reads as the withhold's trigger instead of the coverers'
      // geometry.
      let typeAbsorbed = false;
      if (this.isPunct(":")) {
        this.advance();
        const typeStart = this.pos;
        pType = this.parseType();
        if (this.unmatchedCloseParens(typeStart, this.pos) > 0) {
          closeParenAbsorbed = true;
        }
        typeAbsorbed = pType.length > 0 && !this.isPunct(",") && !this.isPunct(")");
      }
      params.push({
        name: pTok.text,
        type: pType,
        ...(typeAbsorbed ? { typeAbsorbed: true } : {}),
      });
      if (this.isPunct(",")) {
        this.advance();
        atParamStart = true;
      } else {
        atParamStart = false;
      }
    }
    if (this.isPunct(")")) {
      this.advance();
      // The list closed, so `fn-param-list-unclosed` is silent here and says
      // nothing false: the closer this arm consumed may be the one the
      // author wrote for a statement the loop swallowed as parameters,
      // rather than for the list itself. Withheld under the same
      // absorbed-closer condition as the unclosed verdict — a capture that
      // took the list's own `)` already has its disposition decided by that
      // rule, and this arm must not add a second, conflicting one.
      if (refusedTok !== null && !closeParenAbsorbed) {
        this.diagnostics.push({
          severity: "error",
          code: "theta/parse/fn-param-not-identifier",
          file: this.file,
          range: refusedTok.range,
          message: "fn parameter name must be an identifier",
        });
      }
    } else {
      unclosed = true;
    }
    if (unclosed && !closeParenAbsorbed) {
      this.diagnostics.push({
        severity: "error",
        code: "theta/parse/fn-param-list-unclosed",
        file: this.file,
        range: openTok.range,
        message: "fn parameter list is not closed by ')'",
      });
    }
    return params;
  }

  /**
   * Parse a `subagent fn`'s `with { WithField ("," WithField)* }` session-config
   * clause (RFC 0001 FN-7; grammar.md `WithClause`). The cursor is on the `with`
   * identifier. Each `WithField` is `WithKey ":" WithValue`; the five recognised
   * keys are `system` / `model` / `tools` / `tool_loop` / `respond_repair`, and a
   * key outside them surfaces the frontmatter forward-compat warning
   * `theta/load/unknown-frontmatter-field` (FN-7 reuses the frontmatter field's
   * own diagnostics rather than coining a parallel code). Each value parses as an
   * ordinary expression against the like-named frontmatter field's shape.
   */
  private parseWithClause(): WithField[] {
    this.advance(); // `with`
    const fields: WithField[] = [];
    if (this.isPunct("{")) {
      this.advance();
      while (!this.isPunct("}") && !this.atEnd()) {
        const keyTok = this.advance();
        const key = keyTok.text;
        if (this.isPunct(":")) {
          this.advance();
        }
        const value = this.parseExpression() ?? nullExpr(keyTok.range);
        if (!WITH_CLAUSE_KEYS.has(key)) {
          this.diagnostics.push({
            severity: "warning",
            code: "theta/load/unknown-frontmatter-field",
            file: this.file,
            range: keyTok.range,
            message: `unknown 'with' session-config key '${key}'; expected one of system, model, tools, tool_loop, respond_repair`,
          });
        }
        fields.push({ key, value });
        if (this.isPunct(",")) {
          this.advance();
        }
      }
      if (this.isPunct("}")) {
        this.advance();
      }
    }
    return fields;
  }

  /**
   * Parse a CALL-SITE `with "{" CallWithField ("," CallWithField)* ","? "}"`
   * options clause (grammar.md `#call-site-with-clause`; invocation.md
   * `#options-surface`). The cursor is on the `with` identifier.
   *
   * Deliberately forked from `parseWithClause` rather than reusing it,
   * because the two clauses differ in all three grammar-pinned dimensions: the
   * key set is the closed per-call options set (`cwd` in theta 1.3), an unknown
   * key is the parse ERROR `theta/parse/with-clause-unknown-key` rather than
   * the declaration-site's forward-compatible frontmatter warning, and each
   * value is a FULL expression parsed with brace-suppression cleared
   * (`parseBracketedExpression`, as a call argument is) rather than a
   * frontmatter-shaped literal. The recovery envelope mirrors
   * `parseWithClause`: the `:` is optional, `,` separates, and a missing `}` at
   * EOF is tolerated.
   */
  private parseCallWithClause(): CallWithClause {
    const withTok = this.advance(); // `with`
    const fields: CallWithField[] = [];
    if (this.isPunct("{")) {
      this.advance();
      while (!this.isPunct("}") && !this.atEnd()) {
        const keyTok = this.advance();
        const key = keyTok.text;
        if (this.isPunct(":")) {
          this.advance();
        }
        const value = this.parseBracketedExpression() ?? nullExpr(keyTok.range);
        // The closed set has one member in theta 1.3, so it is compared
        // directly; a `CALL_WITH_CLAUSE_KEYS` constant lands with key 2. NOT
        // `WITH_CLAUSE_KEYS` — different clause, different severity.
        if (key !== "cwd") {
          this.diagnostics.push({
            severity: "error",
            code: "theta/parse/with-clause-unknown-key",
            file: this.file,
            range: keyTok.range,
            message: `unknown key '${key}' in call-site with clause`,
            hint: "theta 1.3 call-site options admit `cwd` only.",
          });
        }
        fields.push({ key, keyRange: keyTok.range, value });
        if (this.isPunct(",")) {
          this.advance();
        }
      }
      if (this.isPunct("}")) {
        this.advance();
      }
    }
    return { fields, range: spanRange(withTok.range, this.prevRange()) };
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

  /**
   * Dispatch on the token after the name (bug 0033 §Fix): `{` is the object
   * form (`finishObjectSchema`, byte-unchanged behaviour), `=` is the
   * alias/union form (`finishAliasSchema`), `by` is the explicit-discriminator
   * head (consume the field identifier, then require `{` or `=` — either
   * finisher, so a `by` clause on an object body still reaches
   * `checkByClause` rather than being discarded), and anything else is a
   * body-less `schema X` head. Every recovery path — the malformed-`by` head,
   * the shapeless alias RHS inside `finishAliasSchema`, and the head-only
   * case here — converges on `emitEmptySchemaBody`: replacing the old `null`
   * fallthrough removes the mechanism that made these forms silent, so the
   * fix decides what they are (no separate report is filed for them). No
   * token of a declaration shape survives into the statement loop: the
   * malformed-`by` and shapeless-RHS paths recover via `skipDeclarationShape`
   * (now live, with `skipBraces` consuming a brace-shaped residue), and the
   * object form's own `skipBraceRemainder` already consumes a malformed body
   * whole.
   *
   * The invariant is about the SHAPE, and the declaration's OWN extent is a
   * separate question from what a severed token does once it sits outside
   * that extent. `schema X = Cat Cat` is `AliasRhs` = one `Type` followed by
   * text the grammar gives the declaration no way to hold, so the
   * field-boundary stop ends the arm at the second `Cat` and it still reaches
   * the statement loop as its own expression statement — the general
   * same-line statement permissiveness every pair of statements shares
   * (`42 43` loads clean the same way), untouched and out of scope here.
   * There it keeps the language's ordinary disposition for that statement:
   * silent when the name resolves (a bare declared-name expression statement
   * is a no-op wherever it is written), `theta/parse/unknown-identifier` when
   * it does not. What `finishAliasSchema` checks is upstream of that
   * statement: whether the right-hand side it captured is itself an
   * `AliasRhs` at all, reported once per malformed declaration (bug 0042
   * §Fix) before the severed token is ever parsed, and anchored wherever the
   * defect is visible — the declaration's own range for an empty arm
   * position, which the split consumes leaving no token to point at, and the
   * residue token itself for same-line residue.
   */
  private parseSchema(): Stmt {
    const kw = this.advance();
    const name = this.advance().text;
    if (this.isPunct("{")) {
      return this.finishObjectSchema(kw, name, undefined);
    }
    if (this.isPunct("=")) {
      this.advance(); // `=`
      return this.finishAliasSchema(kw, name, undefined);
    }
    if (this.isKeyword("by")) {
      this.advance(); // `by`
      const byField = this.parseByField();
      if (byField !== undefined) {
        if (this.isPunct("{")) {
          return this.finishObjectSchema(kw, name, byField);
        }
        if (this.isPunct("=")) {
          this.advance(); // `=`
          return this.finishAliasSchema(kw, name, byField);
        }
      }
      // No coherent shape follows `by` (a missing field identifier, or
      // neither `{` nor `=` after it): recover to the same disposition as a
      // shapeless head.
      this.skipDeclarationShape();
      const range = spanRange(kw.range, this.prevRange());
      this.emitEmptySchemaBody(name, range);
      return { kind: "schema", name, range };
    }
    // Headless `schema X` — no shape at all (bug 0033 §Fix: "A body-less
    // `schema X` head must gain a disposition"). Consume nothing further: the
    // next token is a stmt-sep or the start of the next statement, so the
    // ordinary statement loop continues unaffected.
    const range = spanRange(kw.range, this.prevRange());
    this.emitEmptySchemaBody(name, range);
    return { kind: "schema", name, range };
  }

  /**
   * The `{ ... }` object-body form, retaining an explicit `by <field>` clause
   * when present (`schema X by f { ... }` — illegal, but the clause must
   * reach `checkByClause`, not be discarded: grammar.md §"schema X by
   * <field>"). `parseSchemaObjectBody`'s own recovery
   * (`recoverMalformedSchemaField`) always consumes a malformed body's
   * remainder in full, and returns `null` only when the capture stopped
   * before any field was pushed — the empty-object-body clause and the
   * mis-shaped-first-token clause of `theta/parse/empty-schema-body`'s
   * *Trigger* (code-registry-parse.md) both describe exactly that input, and
   * the row's *Message* ("has no fields") is true of it, so `null` keeps the
   * declaration on this disposition. A captured prefix means the row's
   * *Trigger* does not describe the input at all — the shape yielded a
   * field — so `parseSchemaObjectBody` returns that prefix instead and the
   * offending token draws its own diagnostic there.
   */
  private finishObjectSchema(kw: Token, name: string, by: string | undefined): Stmt {
    const fields = this.parseSchemaObjectBody();
    const range = spanRange(kw.range, this.prevRange());
    if (fields === null) {
      this.emitEmptySchemaBody(name, range);
      return { kind: "schema", name, range };
    }
    return { kind: "schema", name, fields, ...(by !== undefined ? { by } : {}), range };
  }

  /**
   * The `= AliasRhs` / `by f = UnionRhs` arm list (grammar.md §"schema X by
   * <field>"): one `parseType` capture over the whole right-hand side, split
   * into per-arm Type sources on the top-level `|` — the same split
   * `lowerTypeSource` (body-type-lowering.ts) re-applies to the rejoined arms
   * at lowering, so the two agree on arm granularity by construction.
   *
   * The capture runs in the object form's field-boundary mode PLUS the
   * alias-arm mode, and needs both. `>` and `=` are trailing newline-
   * continuation triggers (lexer.ts `trailingTriggers`), so the `stmt-sep`
   * that would otherwise end the right-hand side is absent after
   * `schema IntList = array<integer>` and after a bare `schema X =`, and the
   * next statement's tokens sit directly ahead of the cursor:
   *
   *   - field-boundary mode ends the capture at the value-ish token that
   *     follows a completed arm with no intervening `|`, which is what keeps
   *     `array<integer>` from growing into `array<integer>leta` (or, with the
   *     declaration last, from silently absorbing the body's tail expression);
   *   - alias-arm mode ends it at an `ALIAS_ARM_STOP_KEYWORDS` head where an
   *     arm must start, which field-boundary mode cannot see — its rule needs
   *     a completed atom behind it, and after `schema X =` there is none, so
   *     the `let` of the next line would join as the first arm's first token.
   */
  private finishAliasSchema(kw: Token, name: string, by: string | undefined): Stmt {
    const rhsSource = this.parseType(true, false, true);
    // One split, read two ways (bug 0042 §Fix): `segments` is every top-level
    // `|`-delimited slice INCLUDING the empty ones, and `arms` is its
    // non-empty filter — the same arm list `lowerTypeSource` re-derives from
    // the rejoined arms, so the arm granularity downstream sees is unchanged
    // by construction. A mismatch between the two counts is an empty arm
    // position the split silently dropped.
    const segments = splitTopLevelSegments(rhsSource, "|");
    const arms = segments.filter((segment) => segment.length > 0);
    if (arms.length === 0) {
      // A shapeless `schema X =` (nothing a `Type` can start with ahead of the
      // cursor) yields no fields: no more specific registered code fits a
      // bodyless alias right-hand side, so the empty-schema-body disposition
      // applies here too. Recovery then consumes any residue of the abandoned
      // shape — a no-op when the cursor already sits at the `stmt-sep` or at
      // the following statement's head, which is the shape both stops above
      // leave behind.
      this.skipDeclarationShape();
      const range = spanRange(kw.range, this.prevRange());
      this.emitEmptySchemaBody(name, range);
      return { kind: "schema", name, range };
    }
    const range = spanRange(kw.range, this.prevRange());
    const aliasRhsRefused = this.emitMalformedAliasRhs(name, range, segments, arms);
    return {
      kind: "schema",
      name,
      arms,
      ...(by !== undefined ? { by } : {}),
      ...(aliasRhsRefused ? { aliasRhsRefused: true } : {}),
      range,
    };
  }

  /**
   * `theta/parse/malformed-alias-rhs` (bug 0042 §Fix) for a right-hand side
   * that captured at least one arm but is still not an
   * `AliasRhs ::= Type ("|" Type)*`. At most one diagnostic, in two shapes:
   *
   *   - EMPTY ARM POSITION, checked first — `segments.length` exceeds
   *     `arms.length` whenever a top-level `|` had no `Type` on one of its
   *     sides (`splitTopLevelSegments` keeps the blank slice that
   *     `finishAliasSchema`'s non-empty filter drops). Checked first because
   *     it can coincide with same-line residue: the lexer emits `||` as ONE
   *     token, so `schema X = Cat || Cat` is both an empty arm position (an
   *     empty segment on each side of the doubled `|`) and, read the other
   *     way, a same-line residue (the second `Cat`) — and an empty arm
   *     position leaves no token of its own to point at, so the
   *     declaration's own range is the only anchor either shape can use here.
   *   - SAME-LINE RESIDUE otherwise — the token now at the cursor is one
   *     `parseType`'s own stops fire on (`isAliasResidueHead`) and it begins
   *     on the same source line as the declaration's last consumed token: the
   *     newline that would otherwise separate a following statement was never
   *     there to swallow, so this is text on the DECLARATION's own line
   *     rather than the next statement (a token on the NEXT line is not
   *     residue — grammar.md §"Newline continuation" already closes the
   *     statement there). Anchored at that token, mirroring the object body's
   *     own boundary-token emission (`parseSchemaObjectBody`'s comma rule).
   *
   * A right-hand side with no arms at all took the `empty-schema-body` path
   * above and never reaches here.
   *
   * Returns whether a diagnostic fired, so `finishAliasSchema` can record the
   * refusal on the returned decl node (bug 0061 §Fix guard 2): this method
   * pushes into `this.diagnostics`, a PARSE-time array the checker pass
   * (`checkSchemaDeclarationGraph`) never sees, so a node-level flag is the
   * only channel that lets that later pass skip refusing the same
   * right-hand side's arm text a second time under a different code.
   */
  private emitMalformedAliasRhs(
    name: string,
    declRange: SourceRange,
    segments: readonly string[],
    arms: readonly string[],
  ): boolean {
    const message = `'${name}' has a malformed right-hand side; write a single type, or arms separated by single '|', and nothing else on the declaration's line`;
    if (segments.length !== arms.length) {
      this.diagnostics.push({
        severity: "error",
        code: "theta/parse/malformed-alias-rhs",
        file: this.file,
        range: declRange,
        message,
      });
      return true;
    }
    const cursor = this.peek();
    if (!isAliasResidueHead(cursor) || cursor.range.start.line !== this.prevRange().end.line) {
      return false;
    }
    this.diagnostics.push({
      severity: "error",
      code: "theta/parse/malformed-alias-rhs",
      file: this.file,
      range: cursor.range,
      message,
    });
    return true;
  }

  /**
   * The `by`-clause field identifier (an `ident` / `keyword` token,
   * consistent with a schema field name). `undefined` (consuming nothing)
   * when the token after `by` is not one — a malformed clause the caller
   * recovers from.
   */
  private parseByField(): string | undefined {
    const t = this.peek();
    if (t.kind !== "ident" && t.kind !== "keyword") {
      return undefined;
    }
    this.advance();
    return t.text;
  }

  /**
   * `theta/parse/empty-schema-body` for a declaration whose shape yields no
   * fields — a body-less head, an unparseable object body, or a shapeless
   * alias/`by` right-hand side (bug 0033 §Fix). Reuses `checkObjectSchema`'s
   * own zero-fields branch (schema-declarations.ts, already imported here)
   * rather than a second copy of the message, so the parser-time and
   * checker-time emissions of this code can never drift apart.
   */
  private emitEmptySchemaBody(name: string, range: SourceRange): void {
    this.diagnostics.push(
      ...checkObjectSchema({ name, fields: [] }, { file: this.file, range }),
    );
  }

  /**
   * Capture a `schema X { field: Type, … }` object body's field sources,
   * starting at the opening `{` that `parseSchema`'s dispatch has already
   * confirmed at the cursor. A field name is an
   * `ident` / `keyword` token followed by `:` and a type expression. Three
   * shapes cannot derive a `Field` at the current token: the token where a
   * field name belongs is neither `ident` nor `keyword`; an `as` rename's
   * wire-name token is not a `string`; or a field name is not followed by
   * `:`. Each hands its offending token to `recoverMalformedSchemaField`,
   * which consumes the balance of the brace group and either returns the
   * fields already captured (a `theta/parse/malformed-schema-field`
   * diagnostic names the offending token) or, when nothing was captured yet,
   * returns `null` so the caller keeps the declaration-subject disposition
   * that input's Trigger clause already covers.
   *
   * A fourth exit — `atEnd()` reached between fields, with no `}` ahead — is
   * `SchemaShape ::= "{" Field ("," Field)* ","? "}"`'s closing terminal never
   * arriving (bug 0245 §Fix). `theta/parse/schema-body-unclosed` fires there,
   * ranged on the body's own opening `{` (mirroring `fn-param-list-unclosed`'s
   * `openTok`), under two guards: an EMPTY captured prefix keeps
   * `theta/parse/empty-schema-body` ALONE — its Trigger already describes that
   * input, and this row says nothing about the missing `}`; and a field-TYPE
   * capture that swallowed an unmatched `}` withholds the verdict, since the
   * closer was spent inside the type rather than omitted (the
   * `fn-param-list-unclosed` absorbed-`)` withhold, mirrored here for `{`/`}`
   * via `unmatchedCloseBraces`). A truncation inside the last field's own
   * type position (`b:` at EOF) withholds nothing: the absent `}` is a fault
   * independent of the type's own, so both codes are named — the pairing `fn
   * f(a:` at EOF already draws, where `theta/parse/fn-param-list-unclosed`
   * fires beside the parameter's own refusal.
   */
  private parseSchemaObjectBody(): SchemaFieldSource[] | null {
    const openTok = this.advance(); // opening `{`
    const fields: SchemaFieldSource[] = [];
    // Sticky for the whole body, mirroring `closeParenAbsorbed`: once a field
    // type has swallowed one of the body's own `}` characters, the withhold
    // applies regardless of which later exit the loop takes.
    let closeBraceAbsorbed = false;
    for (;;) {
      while (this.peek().kind === "stmt-sep") {
        this.advance();
      }
      if (this.atEnd()) {
        if (fields.length > 0 && !closeBraceAbsorbed) {
          this.diagnostics.push({
            severity: "error",
            code: "theta/parse/schema-body-unclosed",
            file: this.file,
            range: openTok.range,
            message: "schema object body is not closed by '}'",
          });
        }
        break;
      }
      if (this.isPunct("}")) {
        this.advance();
        break;
      }
      const nameTok = this.peek();
      const isFieldName = nameTok.kind === "ident" || nameTok.kind === "keyword";
      if (!isFieldName) {
        // Not a plain `ident: Type` field list (a set-of / discriminated
        // shape): the token itself is what fails to derive a `Field`, so it
        // is the offending token this iteration names.
        return this.recoverMalformedSchemaField(fields, nameTok.range);
      }
      this.advance();
      // An optional `as "WireName"` rename sits between the field identifier and
      // its type (schemas.md §Wire-name renaming). Capture it so the runtime can
      // apply outbound wire-name translation on interpolation (QRY-18).
      let wireName: string | undefined;
      if (
        (this.peek().kind === "ident" || this.peek().kind === "keyword") &&
        this.peek().text === "as"
      ) {
        this.advance(); // `as`
        const wireTok = this.peek();
        if (wireTok.kind !== "string") {
          // A non-string wire name is what fails to derive; the field
          // identifier that precedes it is not the offending token.
          return this.recoverMalformedSchemaField(fields, wireTok.range);
        }
        this.advance();
        wireName = wireTok.value ?? wireTok.text;
      }
      if (!this.isPunct(":")) {
        // The token standing where `:` should be can be a construct the
        // author wrote correctly (e.g. the body's closing `}`), so the
        // offending token is the field name itself — the field that carries
        // no type — not whatever token happens to sit at the cursor.
        return this.recoverMalformedSchemaField(fields, nameTok.range);
      }
      this.advance(); // `:`
      // lexical.md §Identifiers requires lowercase-first for a schema field
      // name, and code-registry-parse.md's binding-case-mismatch row already
      // names the field-name position in its Trigger, so this brings the
      // implementation onto a set the registry already claims rather than
      // widening it. Past the last recovery arm on purpose: every earlier arm
      // in this loop returns `null` and discards the field outright, so the
      // diagnostic belongs to a field name THIS iteration is about to push —
      // one no earlier arm of THIS iteration discarded.
      // Any earlier placement lets the comma-recovery arm below re-enter the
      // loop and read a discarded TYPE token as the next field's name,
      // drawing the code on a field that is never declared. Those recovery
      // arms are bug 0133's subject and none of its rows move: the guard
      // below runs only on a field name that reaches the push, never on one
      // an earlier arm discards. Two arms, keyed on `nameTok.kind`, split the
      // position between two rules: a `keyword` token (deliberately admitted
      // as a field name by `isFieldName` above) claims the reserved spelling
      // under lexical.md §Reserved words / code-registry-parse.md:21, and an
      // `ident` token is judged on its first letter under lexical.md
      // §Identifiers / code-registry-parse.md:19. The two subjects are
      // disjoint by construction, so the case arm never sees a reserved
      // spelling. The case predicate is the shared `isTypeLikeName` guard
      // (lexer/name-case) — the same one `checkName` and the `fn` parameter
      // check (bug 0139) ask — so the rule keeps one implementation across
      // every position it is enforced at.
      if (nameTok.kind === "keyword") {
        // lexical.md:20 reserves all 32 spellings from identifier position
        // with no scope list, and code-registry-parse.md:21's Trigger names
        // no position either: "the field identifier" (schemas.md:23) is an
        // identifier position this fix closes. Ranged on the field-name
        // token itself, which (unlike `SchemaFieldSource`'s TYPE slot, bug
        // 0044's family, row n3) HAS a range to use. Reusing
        // `reservedKeywordAsIdentifierDiagnostic` (bug 0044's builder) keeps
        // the rendered Message identical across every NAME- and TYPE-slot
        // caller. The keyword arm sits beside the case arm below rather than
        // inside it, mirroring `parseFn`'s parameter-name check
        // (`pTok.kind === "keyword"` ahead of `pTok.kind === "ident"`), since
        // the case arm's `ident` guard already excludes reserved spellings.
        this.diagnostics.push(
          reservedKeywordAsIdentifierDiagnostic(nameTok.text, nameTok.range, this.file),
        );
      } else if (nameTok.kind === "ident") {
        if (isTypeLikeName(nameTok.text)) {
          this.diagnostics.push({
            severity: "error",
            code: "theta/parse/binding-case-mismatch",
            file: this.file,
            range: nameTok.range,
            message: "binding name must start with a lowercase letter or _",
          });
        }
      }
      const typeStart = this.pos;
      const typeSource = this.parseType(true);
      if (this.unmatchedCloseBraces(typeStart, this.pos) > 0) {
        closeBraceAbsorbed = true;
      }
      fields.push({
        name: nameTok.text,
        typeSource,
        line: nameTok.range.start.line,
        ...(wireName !== undefined ? { wireName } : {}),
      });
      // Grammar (`SchemaShape ::= "{" Field ("," Field)* ","? "}"`): fields are
      // comma-separated. Because a newline inside the schema brace body is
      // swallowed as a continuation (no `stmt-sep`), a comma-missing field body
      // otherwise coalesces two fields into one malformed field with no
      // diagnostic (silent data-shape corruption). Require the separator: when a
      // field is directly followed by the start of another field (an
      // ident/keyword name token) with no intervening comma, surface a parse
      // error against that boundary token, then continue parsing so the dropped
      // field is NOT lost.
      if (this.isPunct(",")) {
        this.advance();
      } else {
        const boundary = this.peek();
        // A boundary token is only a genuine field start when the PRECEDING
        // type capture actually ended a `Type` atom (bug 0285 §Fix); when it
        // did not, `parseType` stopped inside the field's own text and this
        // token is not a separator position the author omitted.
        const startsNextField =
          (boundary.kind === "ident" || boundary.kind === "keyword") &&
          typeSourceEndsAtom(typeSource);
        if (startsNextField) {
          this.diagnostics.push({
            severity: "error",
            code: "theta/parse/unsupported-feature",
            file: this.file,
            range: boundary.range,
            message:
              "unsupported syntactic feature: schema fields must be comma-separated",
          });
        }
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

  /**
   * `parseSchemaObjectBody`'s single recovery point for the three shapes at
   * which no further `Field` can derive (bug 0133 §Fix (a)): a token where a
   * field name belongs that is neither `ident` nor `keyword`; an `as`
   * rename's wire-name token that is not a `string`; or a field name not
   * followed by `:`. Containment is unchanged — `skipBraceRemainder` still
   * consumes the balance of the brace group (or the rest of the file on an
   * unbalanced body, a deliberate unfixed residual) — but the fields already
   * captured are retained (bug 0133 §Fix (a)2), not discarded with it.
   *
   * An EMPTY captured prefix keeps `null`: `SchemaShape ::= "{" Field (","
   * Field)* ","? "}"` (grammar.md) is a sequence, and when no element of it
   * derived, `theta/parse/empty-schema-body`'s Trigger (empty body / first
   * token not a field / no shape) already describes the input and its
   * Message ("has no fields") is true of it — `finishObjectSchema` keeps that
   * disposition. Otherwise the prefix DOES derive one or more `Field`s, so
   * that Trigger no longer describes the input: one
   * `theta/parse/malformed-schema-field` diagnostic is anchored at the
   * offending token, and the captured prefix is returned so the
   * declaration's other checks (`by-on-object-schema`, the wire-name checks,
   * the field-type walk, the constructor field-set checks) run against what
   * the author wrote.
   */
  private recoverMalformedSchemaField(
    fields: readonly SchemaFieldSource[],
    offending: SourceRange,
  ): SchemaFieldSource[] | null {
    this.skipBraceRemainder();
    if (fields.length === 0) {
      return null;
    }
    this.diagnostics.push({
      severity: "error",
      code: "theta/parse/malformed-schema-field",
      file: this.file,
      range: offending,
      message:
        "malformed schema field; each field is 'name: Type' or 'name as \"WireName\": Type'",
    });
    return [...fields];
  }

  private parseEnum(): Stmt {
    const kw = this.advance();
    const name = this.advance().text;
    const { names, values, variantDecls } = this.parseEnumVariants();
    const hasValues = Object.keys(values).length > 0;
    return {
      kind: "enum",
      name,
      variants: names,
      ...(hasValues ? { variantValues: values } : {}),
      variantDecls,
      range: spanRange(kw.range, this.prevRange()),
    };
  }

  /**
   * Capture the variants of an `enum X { A, B = "b", … }` body in source order
   * so the runtime can register the enum for `Enum.Variant` resolution: the
   * leading identifier is the variant name, and an explicit `= <string-literal>`
   * value (schemas.md §Enum declarations — "Explicit values override that
   * mapping") is captured as that variant's wire value. A non-string explicit
   * value is not captured (the name stands as the wire value; the strictness
   * diagnostic is a separate check). A non-brace enum shape yields no variants.
   *
   * A second exit — `atEnd()` reached with `depth > 0`, no closing `}` ahead —
   * is schemas.md §Enum declarations' closing terminal never arriving (bug
   * 0259 §Fix). `theta/parse/enum-body-unclosed` fires there, ranged on the
   * body's own opening `{` (mirroring `schema-body-unclosed`'s `openTok`),
   * under one guard: an EMPTY captured prefix keeps `theta/parse/empty-enum-body`
   * ALONE, since that row's Trigger already covers it. No withhold applies —
   * the `}` arm is the only place a `}` punct token is consumed and it always
   * decrements `depth`, and a `}` carried inside a string token is never
   * counted by these punct-only depth arms, so every closer the loop could
   * have absorbed instead was one the author wrote for the body itself. The
   * captured names, values and variant decls are returned unchanged either
   * way, so the emission joins a variant's own refusal rather than replacing
   * it.
   */
  private parseEnumVariants(): {
    readonly names: readonly string[];
    readonly values: Readonly<Record<string, string>>;
    readonly variantDecls: readonly EnumVariantDecl[];
  } {
    // Advance to the opening `{`; a non-brace enum shape carries no variants.
    while (!this.atEnd() && !this.isPunct("{")) {
      if (this.peek().kind === "stmt-sep") {
        return { names: [], values: {}, variantDecls: [] };
      }
      this.advance();
    }
    if (!this.isPunct("{")) {
      return { names: [], values: {}, variantDecls: [] };
    }
    const openTok = this.advance(); // `{`
    const names: string[] = [];
    const values: Record<string, string> = {};
    // The full per-variant decls (name + explicit-value kind/text) in source
    // order, feeding `checkEnumDeclaration`. Non-string explicit values ARE
    // retained here (unlike `values`) so they can be rejected.
    const variantDecls: {
      name: string;
      value?: { kind: EnumValueKind; text: string };
    }[] = [];
    // The most recently captured variant decl, so a following `= "wire"` binds
    // to it; cleared at each `,` so an inter-variant `=` cannot mis-bind.
    let currentName: string | null = null;
    let currentDecl: { name: string; value?: { kind: EnumValueKind; text: string } } | null = null;
    let expectName = true;
    let depth = 1;
    while (!this.atEnd() && depth > 0) {
      const t = this.peek();
      if (t.kind === "punct" && t.text === "{") {
        depth += 1;
        this.advance();
        continue;
      }
      if (t.kind === "punct" && t.text === "}") {
        depth -= 1;
        this.advance();
        continue;
      }
      if (depth === 1 && expectName && (t.kind === "ident" || t.kind === "keyword")) {
        // "Variant names are PascalCase identifiers" (schemas.md:78) makes the
        // variant name an identifier position; lexical.md:20 reserves all 32
        // spellings from it with no scope list, and this admits `keyword`
        // deliberately so a keyword-spelled variant CAN be captured (it is the
        // input the rule refuses) rather than mis-parsed as something else.
        if (t.kind === "keyword") {
          this.diagnostics.push(
            reservedKeywordAsIdentifierDiagnostic(t.text, t.range, this.file),
          );
        }
        names.push(t.text);
        currentName = t.text;
        currentDecl = { name: t.text };
        variantDecls.push(currentDecl);
        expectName = false;
        this.advance();
        continue;
      }
      if (depth === 1 && currentName !== null && t.kind === "punct" && t.text === "=") {
        // An explicit `= <value>` for the current variant. Only a string literal
        // becomes the wire value; a non-string literal is retained on the
        // variant decl (kind + text) so `checkEnumDeclaration` can reject it
        // (schemas.md §Enum declarations — string values only).
        this.advance(); // `=`
        const valueTok = this.peek();
        const captured = classifyEnumValueToken(valueTok);
        if (captured !== undefined) {
          if (currentDecl !== null) {
            currentDecl.value = captured;
          }
          if (captured.kind === "string") {
            values[currentName] = captured.text;
          }
          this.advance();
        }
        continue;
      }
      if (depth === 1 && t.kind === "punct" && t.text === ",") {
        currentName = null;
        currentDecl = null;
        expectName = true;
        this.advance();
        continue;
      }
      // Any other in-variant token: skip; the next comma re-arms name capture.
      this.advance();
    }
    if (depth > 0 && names.length > 0) {
      this.diagnostics.push({
        severity: "error",
        code: "theta/parse/enum-body-unclosed",
        file: this.file,
        range: openTok.range,
        message: "enum variant list is not closed by '}'",
      });
    }
    return { names, values, variantDecls };
  }

  /**
   * Recovery for a malformed schema/enum shape (`{ ... }` block or
   * `= …` / `by … = …` tail) that `parseSchema` has already given up on:
   * consume up to the shape's opening `{` (past any `by field =` / `=` head),
   * or to the closing `}` when one is found, so no token of the abandoned
   * shape survives into the statement loop. Called from `parseSchema`'s
   * recovery paths (bug 0033 §Fix): the malformed-`by` head and a shapeless
   * alias right-hand side.
   *
   * The scan stops at a following statement's head as well as at the newline,
   * because the newline is not always there to stop it: a malformed head ends
   * on a trailing continuation trigger (`schema X by =`, `schema X =`) often
   * enough that the lexer has swallowed the boundary, and recovery from a
   * declaration must not consume the declaration AFTER it. Both statement-head
   * sets stop it, for the one reason: `ALIAS_ARM_STOP_KEYWORDS` for the
   * keyword-led forms, `ALIAS_ARM_STOP_PUNCT` for the punct-led ones (a query,
   * a template, a parenthesised expression, an array literal, a unary-not),
   * which `parseType` refuses to capture for the same reason.
   */
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
      if (t.kind === "keyword" && ALIAS_ARM_STOP_KEYWORDS.has(t.text)) {
        return; // the swallowed newline's statement head stands in for it
      }
      if (t.kind === "punct" && ALIAS_ARM_STOP_PUNCT.has(t.text)) {
        return; // ditto, for a statement whose head is punctuation
      }
      this.advance();
    }
  }

  /** Consume a balanced `{ ... }` group; `skipDeclarationShape`'s sole caller (bug 0033 §Fix). */
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
    const { specifiers, symbols, hasBraces, hasSeparatorDegeneracy, anyDanglingAlias } =
      this.parseImportSpecifierList();
    const hasFromKeyword = this.isKeyword("from");
    if (hasFromKeyword) {
      this.advance();
    }
    let path = "";
    const pathTok = this.peek();
    let hasPathLiteral = false;
    if (pathTok.kind === "string") {
      hasPathLiteral = true;
      path = pathTok.value ?? pathTok.text;
      // imports.md §"Path resolution": an `import` / `export … from` path
      // literal must end in a byte-exact lowercase `.thetalib` and use forward-slash
      // separators; a `.theta` path (or any non-`.thetalib` variant) is
      // `theta/parse/import-non-thetalib-extension`. Validate the literal as written
      // at parse time so a wrong-extension import un-registers the theta (IMP-2).
      this.diagnostics.push(
        ...validatePathLiteral(
          { value: path, range: pathTok.range },
          "import",
          this.file,
        ),
      );
      this.advance();
    }
    const range = spanRange(kw.range, this.prevRange());
    // imports.md §"Re-exports": the `from` clause is part of both the
    // `ImportDecl` and `ExportDecl` production. A specifier list this parser
    // otherwise accepts with no `from` keyword, or with one carrying no path
    // literal, is refused here — one diagnostic for the STATEMENT, ranged over
    // it like the node below, not one per specifier (bug 0040's per-specifier
    // reserved-name check above answers a different question and keeps firing
    // on the same input; the two co-emit).
    const missingFromClause = checkImportMissingFromClause(hasFromKeyword, hasPathLiteral, {
      file: this.file,
      range,
    });
    if (missingFromClause !== undefined) {
      this.diagnostics.push(missingFromClause);
    }
    // bug 0100: an absent or zero-specifier list is a STATEMENT-level fact
    // distinct from the trailing-clause check above — GATED on a well-formed
    // `from` clause so the no-`from` bare-keyword / empty-list spellings keep
    // emitting only `checkImportMissingFromClause`'s code (its registry
    // Trigger already claims them; co-emitting here would widen that Trigger
    // and move 0058's whole-list witnesses).
    const malformedSpecifierList = checkImportMalformedSpecifierList(
      hasBraces,
      specifiers.length,
      hasFromKeyword,
      hasPathLiteral,
      { file: this.file, range },
    );
    if (malformedSpecifierList !== undefined) {
      this.diagnostics.push(malformedSpecifierList);
    }
    // bug 0211: a separator-degenerate list — a missing `,` between two
    // specifiers, a stray `,`, or a discarded catch-all token — is a THIRD
    // STATEMENT-level fact under the same code, alongside the absent/empty
    // list above. Same gate as that arm (bug 0211 §Fix constraint 3; registry
    // disposition at `code-registry-parse.md:127`'s statement-arm gate), and
    // suppressed on an empty recovered list or a dangling `as` so the three
    // arms of this code partition and at most one statement-ranged
    // diagnostic fires (bug 0211 §Fix constraint 2, carried in
    // `code-registry-parse.md:127`'s partition sentence) —
    // `specifierCount === 0` already excludes this arm from ever co-firing
    // with the one above.
    const separatorDegenerateSpecifierList = checkImportSeparatorDegenerateSpecifierList(
      hasSeparatorDegeneracy,
      specifiers.length,
      anyDanglingAlias,
      hasFromKeyword,
      hasPathLiteral,
      { file: this.file, range },
    );
    if (separatorDegenerateSpecifierList !== undefined) {
      this.diagnostics.push(separatorDegenerateSpecifierList);
    }
    return {
      kind,
      path,
      symbols,
      specifiers,
      range,
    } as ImportDecl | ExportDecl;
  }

  /** Parse the shared import/export specifier list and retain its verdict flags. */
  private parseImportSpecifierList(): {
    specifiers: ImportSpecifier[];
    symbols: string[];
    hasBraces: boolean;
    hasSeparatorDegeneracy: boolean;
    anyDanglingAlias: boolean;
  } {
    // Each specifier is `Source` or `Source as Local` (imports.md §"Unknown
    // imported symbol" / §"Re-exports"): the `as` keyword rebinds the imported
    // symbol to a local alias. `symbols` carries the LOCAL name (alias when
    // present) so downstream named-type / reserved-name consumers see the name
    // actually bound; `specifiers` retains the `{ source, local }` mapping the
    // import / re-export checks need (source drives unknown-symbol resolution,
    // local drives name-collision).
    const specifiers: ImportSpecifier[] = [];
    const symbols: string[] = [];
    let hasBraces = false;
    // bug 0211: `ImportDecl` / `ExportDecl` spell the list as `"{" ImportSpec
    // ("," ImportSpec)* ","? "}"` (imports.md §"Re-exports") — a `,` BETWEEN
    // two specifiers, never before the first and never doubled. `sawSpecifier`
    // / `separatorSeen` track the two half-states a conforming list
    // alternates through (specifier, then separator, then specifier, …) so
    // the loop below can tell a missing or stray `,` from a written one;
    // `hasSeparatorDegeneracy` is STICKY for the statement because the
    // registry disposition (bug 0211 §Fix constraint 2; granularity carried
    // in `docs/spec_topics/diagnostics/code-registry-parse.md:127`'s
    // partition sentence) is one diagnostic per statement, not per offending
    // position. Declared outside the brace block: with no
    // braces at all these stay at their initial values, which is correct —
    // that shape is `checkImportMalformedSpecifierList`'s own subject.
    let sawSpecifier = false;
    let separatorSeen = false;
    let hasSeparatorDegeneracy = false;
    let anyDanglingAlias = false;
    if (this.isPunct("{")) {
      hasBraces = true;
      this.advance();
      while (!this.isPunct("}") && !this.atEnd()) {
        const t = this.peek();
        const isSymbolToken =
          (t.kind === "ident" || t.kind === "keyword") && t.text !== "as";
        if (isSymbolToken) {
          // A specifier token with a specifier already pending and no `,`
          // consumed since it is the missing-separator shape: `{ a b }`
          // re-enters here with no separator between `a` and `b`.
          if (sawSpecifier && !separatorSeen) {
            hasSeparatorDegeneracy = true;
          }
          // `ImportSpec ::= Ident ("as" Ident)?` (grammar.md:36): the SOURCE
          // name is the first `Ident` terminal. `isSymbolToken` above admits
          // `keyword` deliberately (a keyword-spelled source is the input
          // lexical.md:20 refuses, not one the grammar rejects), and
          // `isSymbolToken` already excludes the spelling `as` — the token
          // that draws `theta/parse/import-malformed-specifier-list` (bugs
          // 0100/0211) instead, a disjoint subject this emission must not
          // reach.
          if (t.kind === "keyword") {
            this.diagnostics.push(
              reservedKeywordAsIdentifierDiagnostic(t.text, t.range, this.file),
            );
          }
          const source = t.text;
          const sourceRange = t.range;
          this.advance();
          let local = source;
          let endRange = sourceRange;
          let aliasConsumedWithNoAlias = false;
          // `Source as Local`: the `as` keyword rebinds to the trailing alias.
          if (this.isKeyword("as")) {
            this.advance(); // `as`
            const aliasTok = this.peek();
            if (
              (aliasTok.kind === "ident" || aliasTok.kind === "keyword") &&
              aliasTok.text !== "as"
            ) {
              // The second `Ident` terminal of `ImportSpec`'s optional
              // `("as" Ident)?` clause — the ALIAS slot, fully live (row L8):
              // `a` resolves and the local binding becomes the reserved
              // spelling. Same predicate and same builder as the SOURCE slot
              // above; `aliasTok.text !== "as"` above already excludes the
              // `as` spelling from reaching here.
              if (aliasTok.kind === "keyword") {
                this.diagnostics.push(
                  reservedKeywordAsIdentifierDiagnostic(
                    aliasTok.text,
                    aliasTok.range,
                    this.file,
                  ),
                );
              }
              local = aliasTok.text;
              endRange = aliasTok.range;
              this.advance();
            } else {
              aliasConsumedWithNoAlias = true;
            }
          }
          const specifierRange = spanRange(sourceRange, endRange);
          specifiers.push({
            source,
            local,
            range: specifierRange,
          });
          symbols.push(local);
          // A pushed specifier closes the missing-separator window and opens a
          // fresh one for the next token; `anyDanglingAlias` stays sticky for
          // the whole list so the new separator-degeneracy arm below can defer
          // to `checkImportDanglingAlias`'s own subject (bug 0211 §Fix
          // constraint 2, carried in `code-registry-parse.md:127`'s
          // partition sentence).
          sawSpecifier = true;
          separatorSeen = false;
          anyDanglingAlias = anyDanglingAlias || aliasConsumedWithNoAlias;
          // bug 0100: a dangling `as` — consumed with no alias token after it —
          // is a specifier neither `ImportSpec` nor `ExportSpec` admits
          // (imports.md §"Re-exports"). Emitted straight onto
          // `this.diagnostics`, exactly like the reserved-name check below, so
          // `parseThetaDocument` alone witnesses it.
          const danglingAlias = checkImportDanglingAlias(aliasConsumedWithNoAlias, {
            file: this.file,
            range: specifierRange,
          });
          if (danglingAlias !== undefined) {
            this.diagnostics.push(danglingAlias);
          }
          // Reserve the four synthesised-name forms against the LOCAL binding
          // here, at parse time, rather than only where the `.thetalib` load
          // pass checks a specifier (import-static-checks.ts): that pass sees
          // only a specifier whose lib RESOLVED AND PARSED, so a check placed
          // there alone would miss an unresolvable import and leave the
          // refusal partial. Emitting straight onto `this.diagnostics` here —
          // exactly as `validatePathLiteral` does below for the path literal —
          // makes `parseThetaDocument` alone witness it, with no `.thetalib`
          // resolution required, and covers `export { … } from` re-exports
          // too (this function parses both kinds; bug 0040 §Fix Half A).
          const reserved = checkImportReservedSynthesisedName(local, {
            file: this.file,
            range: specifierRange,
          });
          if (reserved !== undefined) {
            this.diagnostics.push(reserved);
          }
        } else if (t.kind === "punct" && t.text === ",") {
          // A `,` with no specifier before it, or with a `,` already pending
          // since the last specifier, is the stray-separator shape: `{ , a }`,
          // `{ a, , b }`. `","?` (imports.md §"Re-exports") admits exactly one
          // trailing comma, so the first `,` after a specifier is never stray.
          if (!sawSpecifier || separatorSeen) {
            hasSeparatorDegeneracy = true;
          }
          this.advance();
          separatorSeen = true;
        } else {
          // The catch-all: a token `ImportSpec` / `ExportSpec` never admits
          // (`42`, `"x"`, `:`, a second `as`) is discarded rather than
          // reported, which is itself the production violation (bug 0211).
          hasSeparatorDegeneracy = true;
          this.advance();
        }
      }
      if (this.isPunct("}")) {
        this.advance();
      }
    }
    return { specifiers, symbols, hasBraces, hasSeparatorDegeneracy, anyDanglingAlias };
  }

  /**
   * Consume a type expression, joining its tokens until a delimiter — outside
   * any inline `ObjectType` brace group, where no separator survives between
   * two tokens (bug 0228). At an
   * arm start — the scan's first token, or the token straight after a
   * depth-0 `|` (`atArmStart`) — a `{` opens an inline `ObjectType` arm:
   * consumed as a balanced group (`consumeInlineObjectType`), whose own
   * interior is a raw slice of the author's source bytes rather than a join,
   * and then CONTINUED past, so `{ a: string } | Cat` captures as one two-arm
   * `Type`.
   * `ObjectType` is a `Type` in any `Type` position (grammar.md §"Type
   * grammar", §"Inline object types"; type-system.md, which states the same
   * grammar applies at every type-annotation position), so the rule is
   * POSITION-GENERAL: a schema field, a `let` annotation, an `fn` parameter
   * or return type, and the `schema X = …` / `schema X by f = …` right-hand
   * side all consume the same `Type ("|" Type)*` extent. A `{` that reaches
   * the scan with `atArmStart` false has a COMPLETED, non-unioned arm
   * already behind it, so it is not a further arm: it falls through to the
   * depth-0 stop set below (`,` `)` `{` `}` `=`) the same way any other
   * post-arm `{` does, which is what still ends an `fn` return-type capture
   * at its `FnBody` block (`fn f(): {a: integer} { 1 }`) rather than
   * swallowing the body as one more arm.
   *
   * When `stopAtFieldBoundary` is set (schema-object-body field types), the scan also
   * stops at a depth-0 field boundary: a value-ish token (ident/keyword/string/
   * number) that directly follows a completed type atom with no intervening `|`
   * union operator marks the start of the next `Field`, so the current field's
   * type does not greedily swallow it. This is what lets a comma-missing schema
   * body still recover both fields (see `parseSchemaObjectBody`). When
   * `stopAtWithClause` is set (the `fn` return-type slot only, so `let`
   * annotations and schema-field types are untouched), the scan also stops at a
   * depth-0 `with` ident — the contextual keyword opening a `WithClause`
   * (grammar.md §"Contextual keywords", §"`fn` declarations"; bug 0005 (a)).
   *
   * When `aliasArmBoundary` is set (the `schema X = …` / `schema X by f = …`
   * right-hand side only), the scan additionally recognises three ARM-TOKEN
   * BOUNDARIES of `AliasRhs ::= Type ("|" Type)*` that no other caller needs,
   * because only this caller's `Type` slot is delimiter-less at the end: a
   * declaration's trailing `=` / `>` continuation can swallow the newline
   * that ends its logical line, where every other caller's slot is bounded by
   * its own delimiter (`)`, `,`, `}`, `=`, or the return slot's `with` /
   * body-block stop) instead. Before the first arm and straight after a
   * depth-0 `|`, an `ALIAS_ARM_STOP_KEYWORDS` head ENDS the capture. At the
   * same arm-start boundaries AND straight after a COMPLETED arm, an
   * `ALIAS_ARM_STOP_PUNCT` head ends the capture too: every member of that
   * set is a punct-led statement head that no `Type` can start or continue
   * with, so meeting one proves the same swallowed boundary newline the
   * keyword stop proves. `-` ends the capture at the COMPLETED-arm boundary
   * alone; at an arm start it is captured — no `Type` begins with `-`, so
   * the arm is ill-formed either way, and the captured `"-"` is what
   * `finishAliasSchema` checks a malformed-right-hand-side disposition
   * against once this scan returns (bug 0042 §Fix), from the declaration's
   * own extent rather than from this capture.
   */
  private parseType(
    stopAtFieldBoundary = false,
    stopAtWithClause = false,
    aliasArmBoundary = false,
  ): string {
    const parts: string[] = [];
    let depth = 0;
    // Whether the tokens consumed so far END a Type atom, so a following
    // `ALIAS_ARM_STOP_PUNCT` head begins the next STATEMENT rather than
    // continuing this arm. Only consulted in `aliasArmBoundary` mode.
    let armComplete = false;
    while (!this.atEnd()) {
      const t = this.peek();
      if (t.kind === "stmt-sep") {
        break;
      }
      const atArmStart = parts.length === 0 || parts[parts.length - 1] === "|";
      if (
        aliasArmBoundary &&
        depth === 0 &&
        (atArmStart || armComplete) &&
        t.kind === "punct" &&
        ALIAS_ARM_STOP_PUNCT.has(t.text)
      ) {
        break;
      }
      // `-` stops after a COMPLETED arm only, never at an arm start: at a start
      // no legal `Type` begins with `-` (grammar.md `LiteralType` has no
      // unary-minus alternative); it is captured there so the ill-formed `= -1`
      // family keeps the junk arm `"-"` rather than emptying the right-hand
      // side — whether that arm is REPORTED is `finishAliasSchema`'s question,
      // answered from the declaration's own extent (bug 0042 §Fix). After a
      // finished arm no `Type`
      // continues with it and it heads the unary-negation expression statement
      // on the line whose boundary newline the trailing `=` / `>` continuation
      // swallowed.
      if (
        aliasArmBoundary &&
        depth === 0 &&
        armComplete &&
        !atArmStart &&
        t.kind === "punct" &&
        t.text === "-"
      ) {
        break;
      }
      if (depth === 0 && atArmStart) {
        if (aliasArmBoundary && t.kind === "keyword" && ALIAS_ARM_STOP_KEYWORDS.has(t.text)) {
          break;
        }
        if (t.kind === "punct" && t.text === "{") {
          // No `stopAtAngleClose` at this arm-start site: nothing here encloses
          // the arm in a `<…>` capture, so a `>` inside the brace group (e.g.
          // `{a: integer>}`) is ordinary content the group must keep consuming
          // (bug 0130 cell e7, the regression this omission guards).
          this.consumeInlineObjectType(parts);
          armComplete = true;
          continue;
        }
      }
      // A `{` reached at depth > 0 (e.g. `array<{a: integer}>`) still opens an
      // inline `ObjectType` arm; route it through the same balanced-group
      // consumer so its interior is a raw slice rather than the outer join.
      // `stopAtAngleClose` bounds the group at the enclosing `<…>`'s own `>`,
      // since depth > 0 here only happens inside one.
      if (depth > 0 && t.kind === "punct" && t.text === "{") {
        this.consumeInlineObjectType(parts, true);
        continue;
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
      if (
        stopAtWithClause &&
        depth === 0 &&
        t.kind === "ident" &&
        t.text === "with"
      ) {
        // A `fn` return-type slot never consumes a depth-0 `with`: it is the
        // contextual keyword opening the `WithClause` between the annotation
        // and the body block (bug 0005 (a); grammar.md §"`fn` declarations").
        // At depth > 0 (e.g. `array<with>`) an ident spelled `with` is ordinary
        // type material and still joins.
        break;
      }
      if (stopAtFieldBoundary && depth === 0 && parts.length > 0) {
        const isValueTok =
          t.kind === "ident" ||
          t.kind === "keyword" ||
          t.kind === "string" ||
          t.kind === "number";
        const prevText = parts[parts.length - 1];
        if (isValueTok && prevText !== "|") {
          break;
        }
      }
      if (t.kind === "punct" && (t.text === "<" || t.text === "(" || t.text === "[")) {
        // Track `[` depth too so an inline `enum["a", "b"]` form is captured
        // whole (its interior comma must not terminate the type source),
        // reaching `checkInlineEnumForm` for `theta/parse/inline-enum` rather
        // than truncating the field to `enum["a"` and discarding the field list.
        depth += 1;
      } else if (t.kind === "punct" && (t.text === ">" || t.text === ")" || t.text === "]")) {
        depth -= 1;
      }
      parts.push(t.text);
      this.advance();
      // The token consumed above completes an arm when it leaves the scan at
      // depth 0 — a closed `<…>` / `[…]` group, or an atom. The bare `enum`
      // keyword is the one exception: it completes nothing on its own, so its
      // `[` is mid-arm rather than at a boundary and joins, which is what keeps
      // the rejected inline `enum["a", "b"]` form captured whole for
      // `checkInlineEnumForm`.
      armComplete = depth === 0 && !(t.kind === "keyword" && t.text === "enum");
    }
    return parts.join("");
  }

  /**
   * Consume a balanced `{ … }` group token-by-token — stopping early at a
   * `stmt-sep` so an unclosed brace cannot run the scan past its statement —
   * and push exactly ONE part: the raw `this.bodyText` slice from the `{`
   * token's start to the last consumed token's end (`positionToOffset`), the
   * same raw-slice treatment the query template already gets for its own
   * lossy, space-joined capture (`parseQuery`'s `rawTemplate`, below). Falls back to the joined
   * token texts when `this.bodyText` is empty (no body source threaded
   * through), so an interior's field-name spelling reaches every rule and
   * lowerer as the author wrote it rather than with its inter-token
   * whitespace deleted (bug 0228).
   *
   * `stopAtAngleClose` is set only at the three angle-context call sites
   * (`parseType` at depth > 0, `parseQuery`'s `@<T>` loop, `parseInvoke`'s
   * `invoke<T>` loop): the scan then tracks its OWN `<`/`>` nesting and stops,
   * without consuming, at a `>` met at its own angle-depth 0 while the brace
   * group is still unclosed — that `>` closes the ENCLOSING capture, not this
   * group (`@<Ghost{>` must not swallow the template past its `>`). An
   * interior `<…>` pair (`{a: array<x>}`) sits at angle-depth 1 and does not
   * trip the bound, so the group still closes normally on its own `}`. Left
   * unset at the arm-start call inside `parseType` (`depth === 0` above),
   * where no enclosing `<…>` bounds the arm, so a `>` inside the group is
   * ordinary content (bug 0130 cell e7).
   * Precondition: the current token is `{`.
   */
  private consumeInlineObjectType(parts: string[], stopAtAngleClose = false): void {
    const startTok = this.peek();
    let braceDepth = 0;
    let angleDepth = 0;
    let lastTok: Token | null = null;
    const consumedTexts: string[] = [];
    while (!this.atEnd()) {
      const t = this.peek();
      if (t.kind === "stmt-sep") {
        break;
      }
      if (
        stopAtAngleClose &&
        t.kind === "punct" &&
        t.text === ">" &&
        angleDepth === 0 &&
        braceDepth > 0
      ) {
        break;
      }
      if (t.kind === "punct" && t.text === "{") {
        braceDepth += 1;
      } else if (t.kind === "punct" && t.text === "}") {
        braceDepth -= 1;
      } else if (stopAtAngleClose && t.kind === "punct" && t.text === "<") {
        angleDepth += 1;
      } else if (stopAtAngleClose && t.kind === "punct" && t.text === ">") {
        angleDepth -= 1;
      }
      lastTok = t;
      consumedTexts.push(t.text);
      this.advance();
      if (braceDepth === 0) {
        break;
      }
    }
    if (lastTok === null) {
      return;
    }
    const raw =
      this.bodyText.length > 0
        ? this.bodyText.slice(
            positionToOffset(this.bodyText, startTok.range.start),
            positionToOffset(this.bodyText, lastTok.range.end),
          )
        : null;
    parts.push(raw !== null ? raw : consumedTexts.join(""));
  }

  // --- expression sublanguage --------------------------------------------

  private parseExpression(): Expr | null {
    return this.parseTernary();
  }

  /**
   * Parse an `Expr` at one of grammar.md:114's two expression-position block
   * sites (a `let` / `let mut` initialiser, a `match`-arm body) — the ONLY
   * positions a bare `{` reads as a `BlockExpr` rather than an object literal
   * (bug 0082 §Fix). Every other expression position calls `parseExpression`
   * directly and is unaffected: a `{` reached through `parsePrimary` from any
   * other call graph still parses as today's `ObjectExpr`
   * (`theta/parse/bare-object-literal` unchanged, DIAG-4).
   */
  private parseExpressionAtBlockSite(): Expr | null {
    if (this.isPunct("{") && this.looksLikeBlockAtBlockSite()) {
      return this.parseBlockExprNode();
    }
    return this.parseExpression();
  }

  /**
   * The disambiguation predicate bug 0082 §Fix settles for the two
   * expression-position block sites: the braces read as an OBJECT LITERAL iff
   * the token immediately after `{` is `}` (the empty-object reading) or an
   * ident/string token immediately followed by `:` (a field-list reading);
   * otherwise they read as a BLOCK. Mirrors `parseObjectLiteral`'s own field-name
   * token test (ident or string) so the two readings agree on what a field name
   * looks like.
   */
  private looksLikeBlockAtBlockSite(): boolean {
    const after = this.peek(1);
    if (after.kind === "punct" && after.text === "}") {
      return false;
    }
    if ((after.kind === "ident" || after.kind === "string") && this.isPunct(":", 2)) {
      return false;
    }
    return true;
  }

  /**
   * Parse a `BlockExpr` — the current token is its opening `{`. Reuses
   * `parseBlock`'s `Stmt* Expr?` reader (the same `{ ... }` statement-list
   * parse `FnBody` / `StmtBlock` drive), then enforces grammar.md:118's
   * TAIL-REQUIRED rule this position adds on top of it: a block whose parsed
   * `Block.tail` is `null` draws `theta/parse/block-expr-missing-tail`, never
   * the implicit `null` `FnBody` / `StmtBlock` admit (bug 0082 §Fix, third
   * constraint).
   */
  private parseBlockExprNode(): Expr {
    const startTok = this.peek(); // `{`, not yet consumed
    const body = promoteTrailingExprToTail(this.parseBlock());
    const range = spanRange(startTok.range, this.prevRange());
    if (body.tail === null) {
      this.diagnostics.push(blockExprMissingTailDiagnostic(range, this.file));
    }
    return { kind: "block", body, range };
  }

  /**
   * Parse the token stream as a single expression — the same `parseExpression`
   * entry the `let` RHS drives, exposed so a `@`...`` template's `${…}`
   * interpolation body honours the full expression sublanguage
   * (expressions.md §"Supported forms").
   */
  public parseSingleExpression(): Expr | null {
    return this.parseExpression();
  }

  /**
   * Parse one expression, then drain any residue through the SAME `parseForms`
   * statement loop the whole-file body drives (`this.diagnostics` is the sink
   * either way), rather than a bespoke "first unconsumed token" scan. Parity
   * with the `let`-RHS position is by CONSTRUCTION under that choice: a
   * residue that itself heads a legal statement (`c - -`, `typeof 1`) stays
   * silent exactly as it does at `let`-RHS level, while a residue headed by a
   * stray punct draws the identical `stray '<t>' in statement position` row
   * the statement loop already emits above. A bespoke scan has no such parity
   * guarantee and would red bug 0084's `${c - -}` control by inventing a
   * diagnostic the `let`-RHS position never draws.
   */
  public parseSingleExpressionWithResidue(): Expr | null {
    const expr = this.parseExpression();
    if (!this.atEnd()) {
      this.parseForms(() => this.atEnd());
    }
    return expr;
  }

  /**
   * Whether the `?` at the cursor is a ternary head rather than the postfix
   * error-propagation `?`. A ternary head's `?` is immediately followed by an
   * expression-starting token and, at the same bracket depth, a `:` that
   * pairs with it before the statement terminates; a postfix `?` is followed
   * by a statement boundary, a closing bracket, or a statement keyword.
   * Distinguishing by the pairing `:` keeps `foo()?` (postfix, `try`)
   * separate from `c ? a : b` (ternary), even across the lexer's swallowed
   * continuation newline after a trailing `?`.
   *
   * The lexer cannot make this call: a ternary head at line end and a postfix
   * `?` at line end are lexically identical up to the newline, so `?` must stay
   * a trailing continuation trigger and the boundary is restored here. The scan
   * therefore stops — answering postfix — at a depth-0 statement-only keyword
   * (`STATEMENT_ONLY_KEYWORDS`): with the separator swallowed, the scan would
   * otherwise read into the NEXT declaration, whose depth-0 `:` (a `subagent fn
   * f(...): T` return annotation, the param parens having closed) masquerades
   * as the ternary's `:` — `subagent` then parses as the consequent and the
   * modifier is dropped (bug 0005 (b)).
   *
   * The keyword stop protects only keyword-headed next statements; a
   * keyword-free next statement (a reassignment or an expression statement)
   * offers no stop token, so the scan additionally PAIRS depth-0 `?`s: a
   * depth-0 `?` whose next token can start an expression opens a nested
   * ternary head, and each depth-0 `:` pairs with the innermost open nested
   * head first — only a `:` with no nested head open belongs to the `?` under
   * test. Without pairing, the next statement's own ternary `:` (`x = c ? a :
   * b`, or a bare `c ? 1 : 2` tail) classified the preceding postfix `?` as a
   * ternary head and swallowed the whole statement (bug 0015). Pairing keeps
   * the nested-consequent reading of `c ? d ? 1 : 2 : 3` (the first `:` pairs
   * with `d`'s head, the second with `c`'s). Accepted residual (bug 0015
   * §Options 1): an inner postfix `?` directly followed by an expression-lead
   * token inside a real ternary arm (e.g. `c ?` ␤ `f()? - 1 : b`) is
   * miscounted as a nested head and the real ternary misread as postfix — the
   * irreducible head/postfix ambiguity class bug 0005 (b) named, narrowed to
   * that corner.
   */
  private isTernaryHead(): boolean {
    if (!canStartExpression(this.peek(1))) {
      return false;
    }
    let depth = 0;
    let openNestedHeads = 0;
    for (let i = 1; ; i += 1) {
      const t = this.peek(i);
      if (t.kind === "eof" || t.kind === "stmt-sep") {
        return false;
      }
      if (
        t.kind === "keyword" &&
        depth === 0 &&
        STATEMENT_ONLY_KEYWORDS.has(t.text)
      ) {
        // Statement material can never be ternary-consequent material at
        // depth 0 (see STATEMENT_ONLY_KEYWORDS): the swallowed boundary has
        // been crossed, so the `?` is the postfix terminator (bug 0005 (b);
        // grammar.md §"Statement termination & newline continuation").
        return false;
      }
      if (t.kind === "punct") {
        const x = t.text;
        if (x === "(" || x === "[" || x === "{") {
          depth += 1;
        } else if (x === ")" || x === "]" || x === "}") {
          if (depth === 0) {
            return false;
          }
          depth -= 1;
        } else if (x === "?" && depth === 0) {
          // A depth-0 `?` reading as a ternary head itself (its next token
          // starts an expression) opens a nested head whose own `:` must not
          // pair with the `?` under test (bug 0015). A `?` behind brackets is
          // already invisible via the depth guard, same as the `:` arm.
          if (canStartExpression(this.peek(i + 1))) {
            openNestedHeads += 1;
          }
        } else if (x === ":" && depth === 0) {
          if (openNestedHeads === 0) {
            return true;
          }
          // Pairs with the innermost open nested head, not the `?` under
          // test — keep scanning for a `:` of our own.
          openNestedHeads -= 1;
        }
      }
    }
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
      } else {
        // isTernaryHead's token-level scan committed to a head on a pairing
        // depth-0 `:` ahead, but the actual consequent PARSE stopped short
        // of it — this branch fires whenever the scan's pairing prediction
        // and the consequent parse diverge. Ordinarily that is malformed
        // consequent material (e.g. juxtaposed expressions `c ? 1 2 : b`:
        // the scan walks token-wise over `2` to the pairing `:`, the parse
        // stops at `1`); and should a statement-boundary leak of the
        // bug-0015 family reappear, it fires there too — silently
        // fabricating the `null` alternate is what made the swallowed
        // expression-statement cells parse clean while meaning a different
        // program (bug 0015), so emit loudly instead. Reuses the closed
        // registry's unsupported-feature code (DIAG-2: the registry is
        // closed; a new code is a spec change).
        this.diagnostics.push({
          severity: "error",
          code: "theta/parse/unsupported-feature",
          file: this.file,
          range: q.range,
          message:
            "unsupported syntactic feature: ternary '?' without ':' after its consequent",
        });
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
    // Comparison and equality operators are non-associative and do not chain:
    // `a < b < c` (and `a == b == c`) is `theta/parse/comparison-chaining`
    // (expressions.md §"Operator precedence"). Every other tier is
    // left-associative.
    const nonAssociative = this.nonAssociativeTiers.has(tier);
    let matched = false;
    for (;;) {
      const t = this.peek();
      if (t.kind !== "punct" || !ops.includes(t.text)) {
        break;
      }
      if (nonAssociative && matched) {
        this.diagnostics.push({
          severity: "error",
          code: "theta/parse/comparison-chaining",
          file: this.file,
          range: t.range,
          message: "comparison operators do not chain; use &&",
        });
        break;
      }
      this.advance();
      const right = this.parseBinary(tier + 1);
      if (right === null) {
        break;
      }
      matched = true;
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

  /**
   * The increment/decrement operator at the cursor, or `undefined` for
   * anything else. Narrows the token's plain `string` text to the
   * `IncrementDecrementOp.op` literal union so no call site casts past the
   * check.
   */
  private incrementDecrementOp(): "++" | "--" | undefined {
    const t = this.peek();
    if (t.kind !== "punct") {
      return undefined;
    }
    if (t.text === "++") {
      return "++";
    }
    if (t.text === "--") {
      return "--";
    }
    return undefined;
  }

  private parseUnary(): Expr | null {
    const incDecOp = this.incrementDecrementOp();
    if (incDecOp !== undefined) {
      const op = this.advance();
      // `++` / `--` are rejected, not lowered (bindings.md §"Increment /
      // decrement"): the operator carries no AST node of its own, so the
      // operand alone survives once the diagnostic is filed.
      this.diagnostics.push(
        checkIncrementDecrement({ op: incDecOp }, { file: this.file, range: op.range }),
      );
      const operand = this.parsePostfix();
      if (operand === null) {
        return null;
      }
      return operand;
    }
    if (this.isPunct("-") || this.isPunct("!")) {
      const op = this.advance();
      const operand = this.parsePostfix();
      if (operand === null) {
        return null;
      }
      // Model unary as a binary with a synthetic `null` left so the AST union
      // stays closed; theta 1.0 tests exercise no unary form directly.
      return {
        kind: "binary",
        op: op.text,
        left: nullExpr(op.range),
        right: operand,
        range: spanRange(op.range, operand.range),
        unary: true,
      };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Expr | null {
    let expr = this.parsePrimary();
    if (expr === null) {
      return null;
    }
    // grammar.md `#call-site-with-clause`: the call-site `with` clause attaches
    // immediately after the call's closing `)`, BEFORE any other postfix
    // operator — so it is recognised exactly once, here, on the bare call node
    // `parsePrimary` just produced, and never inside the postfix loop below
    // (there it would attach to post-postfix nodes such as `f(a)?.b`, and in
    // `f(a) with { cwd: t }?` the `?` must apply to the clause-bearing call's
    // Result instead). This is `with`'s second contextual-keyword recognition
    // position (grammar.md §"Contextual keywords"): only on a `call`/`invoke`
    // node, only the ident `with`, only when the next token is `{`; everywhere
    // else `with` stays an ordinary identifier.
    if (
      (expr.kind === "call" || expr.kind === "invoke") &&
      this.peek().kind === "ident" &&
      this.peek().text === "with" &&
      this.isPunct("{", 1)
    ) {
      const clause = this.parseCallWithClause();
      expr = {
        ...expr,
        withClause: clause,
        range: spanRange(expr.range, this.prevRange()),
      };
    }
    for (;;) {
      if (this.isPunct("?")) {
        // Postfix error-propagation `?` vs ternary head `cond ? a : b`. A `?`
        // followed by an expression and a depth-0 `:` that PAIRS with it
        // (innermost-first pairing of depth-0 `?`s — see isTernaryHead) is a
        // ternary head: leave it unconsumed so `parseTernary` builds the
        // ternary. Otherwise it is the postfix error-propagation terminator
        // (grammar.md §"Newline continuation" — "the `?` trigger is the
        // ternary head only").
        if (this.isTernaryHead()) {
          break;
        }
        const q = this.advance();
        expr = {
          kind: "try",
          operand: expr,
          range: spanRange(expr.range, q.range),
        };
        continue;
      }
      if (this.isPunct(".")) {
        // Member access `target.field` (expressions.md §"Member access").
        this.advance();
        const nameTok = this.advance();
        expr = {
          kind: "member",
          target: expr,
          field: nameTok.text,
          range: spanRange(expr.range, nameTok.range),
        };
        continue;
      }
      if (this.isPunct("[")) {
        // Index access `target[index]` (expressions.md §"Index access"). The
        // index sub-expression parses inside the brackets, so a nested object
        // literal there is not brace-suppressed.
        //
        // The `[` must open on the same line as the receiver's end: a leading
        // `[` is no continuation trigger (grammar.md §"Statement termination &
        // newline continuation"), so a `[` that begins a line begins a new
        // statement. Inside a block the lexer's open-bracket continuation has
        // already swallowed the newline (no `stmt-sep` survives at bracket
        // depth > 0), so the boundary is restored here — leave the `[` for the
        // caller's statement loop rather than gluing a next-line array literal
        // onto this expression as index access (bug 0006). Token ranges keep
        // line/column through continuation collapsing, so the comparison sees
        // the source lines.
        if (this.peek().range.start.line !== expr.range.end.line) {
          break;
        }
        this.advance();
        const indexExpr: Expr = this.parseBracketedExpression() ?? nullExpr(expr.range);
        if (this.isPunct("]")) {
          this.advance();
        }
        expr = {
          kind: "index",
          target: expr,
          index: indexExpr,
          range: spanRange(expr.range, this.prevRange()),
        };
        continue;
      }
      if (this.isPunct("(") && expr.kind === "member") {
        // Method call `target.method(args)` (expressions.md §"Built-in methods
        // and properties"): fold the just-produced `member` and its argument
        // list into a dedicated `method-call` node so the runtime dispatches
        // the stdlib member instead of reading the bare field value.
        const args = this.parseArgs();
        expr = {
          kind: "method-call",
          target: expr.target,
          method: expr.field,
          args,
          range: spanRange(expr.range, this.prevRange()),
        };
        continue;
      }
      const incDecOp = this.incrementDecrementOp();
      if (incDecOp !== undefined) {
        // Postfix `++` / `--`: rejected in place like the prefix arm, and
        // consumed here rather than left for the statement loop — that is
        // what keeps it out of the stray-punctuation recovery below.
        const op = this.advance();
        this.diagnostics.push(
          checkIncrementDecrement({ op: incDecOp }, { file: this.file, range: op.range }),
        );
        continue;
      }
      break;
    }
    return expr;
  }

  /**
   * Parse an expression inside a bracketed group (`(...)`, `[...]`, call args,
   * object-field value, match arm) with object-literal brace-suppression
   * cleared, so a nested object literal parses even inside a control-flow
   * header expression.
   */
  private parseBracketedExpression(): Expr | null {
    const save = this.suppressBrace;
    this.suppressBrace = false;
    try {
      const inner = this.parseExpression();
      this.consumeTrailingAssignment();
      return inner;
    } finally {
      this.suppressBrace = save;
    }
  }

  private parsePrimary(): Expr | null {
    const t = this.peek();
    // `par for` — `par` is a contextual keyword recognised only immediately
    // before `for` (grammar.md §"Contextual keywords"); everywhere else `par`
    // is a normal identifier and falls through to the ident path below.
    if (t.kind === "ident" && t.text === "par" && this.isKeyword("for", 1)) {
      return this.parseParFor();
    }
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
      if (t.text === "match") {
        return this.parseMatch();
      }
      // `Ok(arg)` / `Err(arg)` Result constructors in value position
      // (errors-and-results/error-model.md). Only when followed by `(` — a
      // bare `Ok` / `Err` is not a first-class value, so it falls through to
      // the keyword-in-value-position `null` path, mirroring the other
      // reserved keywords that reach here.
      if ((t.text === "Ok" || t.text === "Err") && this.isPunct("(", 1)) {
        this.advance(); // `Ok` / `Err`
        const args = this.parseArgs();
        const arg = args[0] ?? nullExpr(t.range);
        return {
          kind: "result-ctor",
          ctor: t.text,
          arg,
          range: spanRange(t.range, this.prevRange()),
        };
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
      // Named object literal / schema constructor `Ident { field: expr, … }`
      // (grammar.md `NamedObjectLit`), unless brace-suppression is active (a
      // control-flow header, where the `{` opens the block).
      if (this.isPunct("{") && !this.suppressBrace) {
        return this.parseObjectLiteral(t.text, t.range);
      }
      return { kind: "ident", name: t.text, range: t.range };
    }
    if (t.kind === "punct") {
      if (t.text === "(") {
        this.advance();
        const inner = this.parseBracketedExpression();
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
      if (t.text === "`") {
        // A backtick template with no leading `@` — a QUERY template in value
        // position. expressions.md §"Not supported" admits query templates only
        // `@`-prefixed, at statement / `let`-RHS level; a bare backtick used as a
        // value (a match-arm body, a value-position `let` RHS) is rejected.
        return this.parseBareTemplate();
      }
      // Bare object literal `{ field: expr, … }` (grammar.md `BareObjectLit`),
      // unless brace-suppression is active (a control-flow header block opener).
      if (t.text === "{" && !this.suppressBrace) {
        return this.parseObjectLiteral(null, t.range);
      }
    }
    return null;
  }

  /**
   * Parse an object-literal / schema-constructor body `{ field: expr, … }` — the
   * opening `{` is the current token. `typeName` is the constructor name for a
   * `NamedObjectLit`, or `null` for a `BareObjectLit`. Field values parse inside
   * the braces, so a nested object literal is not brace-suppressed. A malformed
   * field is skipped defensively (matching the array / arg recovery), never
   * silently swallowing the whole literal.
   */
  private parseObjectLiteral(typeName: string | null, startRange: SourceRange): Expr {
    this.advance(); // `{`
    const save = this.suppressBrace;
    this.suppressBrace = false;
    const fields: ObjectFieldNode[] = [];
    while (!this.isPunct("}") && !this.atEnd()) {
      const nameTok = this.peek();
      if (nameTok.kind !== "ident" && nameTok.kind !== "string" && nameTok.kind !== "keyword") {
        // Not a field name: drop the token to guarantee progress.
        this.advance();
        continue;
      }
      this.advance();
      if (nameTok.kind === "keyword") {
        // lexical.md:20 reserves all 32 spellings from identifier position, and
        // `FieldEntry ::= Ident ":" Literal` (grammar.md:599) admits an `Ident`,
        // which a reserved spelling is not. Admitting the token as the field
        // NAME (rather than dropping it, as the arm above still does for a
        // punct/number/etc. head) is what keeps it on `fields` for
        // `checkObjectExpr`'s `present` list, so the field-set checks see the
        // key instead of re-reading its value as the next field's name.
        this.diagnostics.push(
          reservedKeywordAsIdentifierDiagnostic(nameTok.text, nameTok.range, this.file),
        );
      }
      if (this.isPunct(":")) {
        this.advance();
      }
      const value = this.parseExpression() ?? nullExpr(nameTok.range);
      fields.push({ name: nameTok.text, value });
      if (this.isPunct(",")) {
        this.advance();
      }
    }
    if (this.isPunct("}")) {
      this.advance();
    }
    this.suppressBrace = save;
    return {
      kind: "object",
      typeName,
      fields,
      range: spanRange(startRange, this.prevRange()),
    };
  }

  /**
   * Parse a `match <scrutinee> { Pattern "=>" ArmBody, … }` expression
   * (expressions.md §`match` expression). The scrutinee parses with
   * brace-suppression active so the arms `{` is not read as an object literal.
   */
  private parseMatch(): Expr {
    const kw = this.advance(); // `match`
    const scrutinee = this.parseHeaderExpression() ?? nullExpr(kw.range);
    const arms: MatchArmNode[] = [];
    if (this.isPunct("{")) {
      this.advance();
      const save = this.suppressBrace;
      this.suppressBrace = false;
      while (!this.isPunct("}") && !this.atEnd()) {
        while (this.peek().kind === "stmt-sep") {
          this.advance();
        }
        if (this.isPunct("}") || this.atEnd()) {
          break;
        }
        const before = this.pos;
        const pattern = this.parsePattern();
        // A guarded arm `Pattern if cond => …` is not supported in theta 1.0
        // (expressions.md §"Pattern grammar"). Consume and discard the guard
        // condition so the `=>` arrow still parses.
        if (this.isKeyword("if")) {
          const ifTok = this.advance();
          this.diagnostics.push({
            severity: "error",
            code: "theta/parse/match-guard-not-supported",
            file: this.file,
            range: ifTok.range,
            message: "match guards are not supported in theta 1.0",
          });
          this.parseExpression(); // consume + discard the guard condition
        }
        // Consume the `=>` arm arrow (lexed as two punct tokens `=` `>`).
        if (this.isPunct("=") && this.isPunct(">", 1)) {
          this.advance();
          this.advance();
        }
        // The arm body is an expression, not a bare statement (grammar.md
        // §"match arm body"). Every name the pattern binds is an
        // always-immutable context (bindings.md §"Immutable contexts"); scope
        // the record to the arm body's parse only (bug 0370 §Fix layer 1) so a
        // reassignment to a binder draws `immutable-rebinding` without leaking
        // onto an unrelated same-named binding once the arm's own scope ends.
        const boundNames = new Set<string>();
        collectPatternBindings(pattern, boundNames);
        const body = this.withImmutableBindings([...boundNames], () => {
          const consumedStmt = this.tryConsumeArmBodyStatement();
          return consumedStmt
            ? nullExpr(kw.range)
            : (this.parseExpressionAtBlockSite() ?? nullExpr(kw.range));
        });
        arms.push({ pattern, body });
        if (this.isPunct(",")) {
          this.advance();
        }
        if (this.pos === before) {
          // No progress (a malformed arm): drop a token to guarantee termination.
          this.advance();
        }
      }
      this.suppressBrace = save;
      if (this.isPunct("}")) {
        this.advance();
      }
    }
    return {
      kind: "match",
      scrutinee,
      arms,
      range: spanRange(kw.range, this.prevRange()),
    };
  }

  /**
   * If the cursor begins a bare statement in `match`-arm-body position
   * (a leading `if` / `for` / `while` / `let` / `break` / `continue` /
   * `return` keyword, or a bare assignment), emit
   * `theta/parse/statement-in-arm-body`, consume the statement, and return
   * true; otherwise return false. Arm bodies are expressions; statements are
   * wrapped in a block expression `{ ... }` (grammar.md §"match arm body").
   */
  private tryConsumeArmBodyStatement(): boolean {
    const t = this.peek();
    const stmtKeyword =
      t.kind === "keyword" &&
      (t.text === "if" ||
        t.text === "for" ||
        t.text === "while" ||
        t.text === "let" ||
        t.text === "break" ||
        t.text === "continue" ||
        t.text === "return");
    const next = this.peek(1);
    const assignHead =
      t.kind === "ident" &&
      ((this.isPunct("=", 1) && !this.isPunct("=", 2)) ||
        (next.kind === "punct" &&
          COMPOUND_OPS.has(next.text) &&
          this.isPunct("=", 2)));
    if (!stmtKeyword && !assignHead) {
      return false;
    }
    this.diagnostics.push({
      severity: "error",
      code: "theta/parse/statement-in-arm-body",
      file: this.file,
      range: t.range,
      message:
        "match arm body must be an expression; wrap statements in a block expression { ... }",
    });
    if (stmtKeyword) {
      switch (t.text) {
        case "if":
          this.parseIf();
          break;
        case "while":
          this.parseWhile();
          break;
        case "for":
          this.parseFor();
          break;
        case "let":
          this.parseLet();
          break;
        case "return":
          this.parseReturn();
          break;
        default:
          this.simpleKeyword(t.text === "break" ? "break" : "continue");
          break;
      }
    } else {
      this.tryParseReassign();
    }
    return true;
  }

  /**
   * If the cursor begins a rest pattern (`...rest`, lexed as three `.` puncts
   * optionally followed by a binding name), emit
   * `theta/parse/rest-pattern-not-supported`, consume it, and return true; rest
   * patterns are not in theta 1.0 (expressions.md §"Pattern grammar").
   */
  private tryConsumeRestPattern(): boolean {
    if (
      !(this.isPunct(".") && this.isPunct(".", 1) && this.isPunct(".", 2))
    ) {
      return false;
    }
    const dotTok = this.peek();
    this.advance();
    this.advance();
    this.advance();
    if (this.peek().kind === "ident") {
      this.advance();
    }
    this.diagnostics.push({
      severity: "error",
      code: "theta/parse/rest-pattern-not-supported",
      file: this.file,
      range: dotTok.range,
      message: "rest patterns are not supported in theta 1.0",
    });
    return true;
  }

  /**
   * Assignment is statement-only; used in expression position it is
   * `theta/parse/assignment-as-expression` (bindings.md §"Reassignment is a
   * statement"). If a simple `=` (not `==`) or compound-assign operator trails
   * the just-parsed value expression, emit the diagnostic and consume the RHS
   * so the surrounding parse recovers.
   */
  private consumeTrailingAssignment(): void {
    const simple = this.isPunct("=") && !this.isPunct("=", 1);
    const opTok = this.peek();
    const compound =
      opTok.kind === "punct" &&
      COMPOUND_OPS.has(opTok.text) &&
      this.isPunct("=", 1);
    if (!simple && !compound) {
      return;
    }
    this.diagnostics.push({
      severity: "error",
      code: "theta/parse/assignment-as-expression",
      file: this.file,
      range: opTok.range,
      message: "assignment is not an expression",
    });
    if (simple) {
      this.advance(); // `=`
    } else {
      this.advance(); // op
      this.advance(); // `=`
    }
    this.parseExpression(); // consume + discard the RHS
  }

  /** Cursor operations used by the shared typed/bare object-pattern field parser. */
  private readonly objectPatternCursor = {
    advance: () => this.advance(),
    peek: () => this.peek(),
    isPunct: (text: string) => this.isPunct(text),
    atEnd: () => this.atEnd(),
    tryConsumeRestPattern: () => this.tryConsumeRestPattern(),
    parsePattern: () => this.parsePattern(),
  };

  /**
   * Parse one `match` pattern (expressions.md §"Pattern grammar (theta 1.0)"):
   * wildcard `_`, `Ok(p)` / `Err(p)` constructors, a named/bare object pattern
   * `Ident { field: p, … }`, an array pattern `[p, …]`, a literal
   * (`"s"` / `42` / `true` / `null`), or an identifier binding.
   */
  private parsePattern(): PatternNode {
    if (this.tryConsumeRestPattern()) {
      return { kind: "wildcard" };
    }
    if (this.isKeyword("mut")) {
      // A `mut` modifier on a `match` pattern binding is an always-immutable
      // context (bindings.md §Immutable contexts).
      const mutTok = this.advance();
      const diag = checkMutModifier(
        { position: "match-bind" },
        { file: this.file, range: mutTok.range },
      );
      if (diag !== undefined) {
        this.diagnostics.push(diag);
      }
    }
    const t = this.peek();
    if (t.kind === "number") {
      this.advance();
      // Bug 0234: carry the token's lexed spelling so a pattern-position
      // narrowing verdict can be judged by SOURCE spelling (lexical.md
      // §"Number literals") rather than by the parsed value's shape. Only a
      // "number" spelling is set: an absent field reads as "integer" by
      // construction (mirroring `BodyParser.parsePrimary`'s own
      // `t.numericType ?? "integer"` read, this file), and a "number"-spelled
      // integral literal (`1.0`) is the one case `Number.isInteger(value)`
      // cannot recover.
      const numericType = t.numericType ?? "integer";
      return numericType === "number"
        ? { kind: "literal", value: Number(t.text), numericType }
        : { kind: "literal", value: Number(t.text) };
    }
    if (t.kind === "string") {
      this.advance();
      return { kind: "literal", value: t.value ?? t.text };
    }
    if (t.kind === "punct" && t.text === "[") {
      this.advance();
      const elements: PatternNode[] = [];
      while (!this.isPunct("]") && !this.atEnd()) {
        elements.push(this.parsePattern());
        if (this.isPunct(",")) {
          this.advance();
        }
      }
      if (this.isPunct("]")) {
        this.advance();
      }
      return { kind: "array", elements };
    }
    if (t.kind === "keyword" && t.text === "true") {
      this.advance();
      return { kind: "literal", value: true };
    }
    if (t.kind === "keyword" && t.text === "false") {
      this.advance();
      return { kind: "literal", value: false };
    }
    if (t.kind === "keyword" && t.text === "null") {
      this.advance();
      return { kind: "literal", value: null };
    }
    if (t.kind === "ident" || t.kind === "keyword") {
      this.advance();
      // `Ok(p)` / `Err(p)` result constructor patterns.
      if ((t.text === "Ok" || t.text === "Err") && this.isPunct("(")) {
        this.advance();
        const inner = this.isPunct(")") ? ({ kind: "wildcard" } as PatternNode) : this.parsePattern();
        if (this.isPunct(")")) {
          this.advance();
        }
        return { kind: "constructor", ctor: t.text, inner };
      }
      // `Ident { field: p, … }` object / schema pattern. Unlike the `Ok(`/`Err(`
      // constructor arm above, this arm's gate is the following `{` alone —
      // no spelling restriction — so without a guard here one character of
      // lookahead decides whether `lexical.md:20`'s reserved-word sentence is
      // enforced at pattern-head position (bug 0141's refusal at the tail arm's
      // `reservedKeywordAsIdentifierDiagnostic` emission below is never reached,
      // since that arm sits below this one). The node is still built from
      // `t.text` below: the refusal is carried by the diagnostic alone, so the
      // field binders still reach `collectPatternBindings`'s arm-body scope.
      if (this.isPunct("{")) {
        if (t.kind === "keyword") {
          this.diagnostics.push(reservedKeywordAsIdentifierDiagnostic(t.text, t.range, this.file));
        } else if (!this.patternHeadTypeNames().has(t.text)) {
          // A pattern head REFERENCES a declaration (lexical.md:18: it "refers
          // to an existing schema, enum, or constructor in scope"), the same
          // reading the value-position sibling `checkObjectExpr` already
          // enforces for a constructor name (code-registry-parse.md:102). An
          // `ident`-kind head absent from the whole-file universe resolves to
          // nothing, so it is refused with the SAME code the value position
          // draws at the same spelling (bug 0221) — `else if`, not a second
          // `if`, so a `keyword`-kind head keeps bug 0219's code ALONE.
          this.diagnostics.push(unresolvedNamedTypeDiagnostic(t.text, t.range, this.file));
        }
        const fields = parseObjectPatternFields(this.objectPatternCursor);
        return { kind: "object", typeName: t.text, fields, range: spanRange(t.range, this.prevRange()) };
      }
      // A bare `_` wildcard, else an identifier binding pattern.
      if (t.text === "_") {
        return { kind: "wildcard" };
      }
      // Reserved before case (bug 0141 §Fix route 1 half 2): a reserved
      // spelling is refused whatever its case, so `Ok` / `Err` / `Result`
      // draw exactly this one code and never also the capitalised-head one.
      if (t.kind === "keyword") {
        this.diagnostics.push(reservedKeywordAsIdentifierDiagnostic(t.text, t.range, this.file));
      } else if (/^[A-Z]/.test(t.text)) {
        // A capitalised bare head names none of the admitted pattern
        // productions (expressions.md's disambiguation sentence assigns the
        // binding reading to a LOWERCASE identifier only); refused here,
        // after the `(`/`{`-gated constructor and object arms above, so
        // those two real productions are unaffected (bug 0141 §Fix route 1).
        this.diagnostics.push(capitalisedPatternHeadDiagnostic(t.text, t.range, this.file));
      }
      // The node stays an identifier pattern in both refusal cases: the
      // refusal is carried by the error-severity diagnostic alone (which
      // `hasLoadParseError` turns into a registration denial), not by the
      // AST shape. Returning a wildcard here would drop the name from
      // `collectPatternBindings`, and an arm-body read of it would then draw
      // a second, spurious `theta/parse/unknown-identifier` (bug 0141 §Fix
      // route 1, "Emission detail" item 4).
      return { kind: "identifier", name: t.text };
    }
    // A bare object pattern `{ field: p, … }`.
    if (t.kind === "punct" && t.text === "{") {
      const fields = parseObjectPatternFields(this.objectPatternCursor);
      return { kind: "object", typeName: null, fields, range: spanRange(t.range, this.prevRange()) };
    }
    // A pattern-position `++` / `--` (bug 0123 §Fix route (a)). Row `:34`'s
    // *Trigger* ("`++` or `--` operator used.") carries no position
    // qualifier, unlike the neighbouring rows that scope themselves to
    // "expression position" or enumerate `match` pattern binding — so this is
    // implementation conformance, not a Trigger change. Consuming the
    // operator here leaves no token behind for `parseMatch`'s `=>` test to
    // misread, which is what would otherwise manufacture a phantom arm
    // carrying `statement-in-arm-body` and `match-arm-type-mismatch`.
    // Recursing into `parsePattern` for the operand (rather than discarding
    // it) keeps the pattern's arity honest — `[--y]` stays one slot,
    // `{ a: --y }` stays one field — and preserves bug 0141's capitalised-head
    // refusal on the operand. A bare `--` has no operand: recursing there
    // would consume the `=` of the arrow and reproduce the same cascade, so
    // that case returns a wildcard instead. Progress is guaranteed either way,
    // since the operator token is always consumed first.
    const incDecOp = this.incrementDecrementOp();
    if (incDecOp !== undefined) {
      const opTok = this.advance();
      this.diagnostics.push(
        checkIncrementDecrement({ op: incDecOp }, { file: this.file, range: opTok.range }),
      );
      const next = this.peek();
      const nextBeginsPattern =
        next.kind === "number" ||
        next.kind === "string" ||
        next.kind === "ident" ||
        next.kind === "keyword" ||
        (next.kind === "punct" && (next.text === "[" || next.text === "{"));
      if (nextBeginsPattern) {
        return this.parsePattern();
      }
      return { kind: "wildcard" };
    }
    // Unrecognised: consume one token and treat as a wildcard to keep progress.
    this.advance();
    return { kind: "wildcard" };
  }

  /**
   * Memoised result of {@link patternHeadTypeNames}, computed at most once per
   * parse: the token list is fixed for the file's whole parse, so re-scanning
   * it on every `match` arm the way `parsePattern` recurses through arms and
   * depths would be a per-head rescan of the same answer.
   */
  private patternHeadTypeNamesMemo: ReadonlySet<string> | undefined;

  /**
   * The whole-file pattern-head universe (bug 0221 §Fix): every name an
   * object-pattern head may resolve against, scanned from `this.tokens` ONCE
   * rather than from the statement list `collectIdentRoots` reads, because
   * `parsePattern` runs DURING the parse and the statement list does not
   * exist yet at that point (`parsePattern` takes no arguments and reads no
   * parser state beyond the token cursor — bug 0221 §Fix (a)).
   *
   * Seeded from `BUILTIN_VALUE_NAMES` (a pattern head REFERENCES a
   * declaration rather than constructing one, so the builtin error-model
   * names the value position refuses — `QueryError`, measured against
   * `docs/spec_topics/expressions.md:171`'s own example head and the three
   * committed `Err(QueryError { … })` examples — resolve here); then every
   * identifier following a `schema` / `enum` token; then every specifier name
   * of every `import` / `export` statement, scanned forward from the keyword
   * to the first `string` (the `from "path"` clause) or `eof` token, adding
   * every `ident`- or `keyword`-kind token in between (an `as`, a `from`, or a
   * reserved specifier spelling included).
   *
   * DELIBERATELY PERMISSIVE. Over-collecting a name here can only make the
   * check SILENT on it, never make it misfire on a name that should resolve —
   * the same one-directional risk the pre-fix behaviour already carried for
   * every name (bug 0221 §Non-goals: an enum head and an imported head
   * defer). A tighter universe would need to parse each `import`/`export`
   * specifier list and each `schema`/`enum` declaration properly, which is
   * exactly the parse this scan runs ahead of and must not depend on.
   */
  private patternHeadTypeNames(): ReadonlySet<string> {
    if (this.patternHeadTypeNamesMemo !== undefined) {
      return this.patternHeadTypeNamesMemo;
    }
    const names = new Set<string>(BUILTIN_VALUE_NAMES);
    for (let i = 0; i < this.tokens.length; i += 1) {
      const tok = this.tokens[i];
      if (tok === undefined || tok.kind !== "keyword") {
        continue;
      }
      if (tok.text === "schema" || tok.text === "enum") {
        const nameTok = this.tokens[i + 1];
        if (nameTok !== undefined) {
          names.add(nameTok.text);
        }
        continue;
      }
      if (tok.text === "import" || tok.text === "export") {
        for (let j = i + 1; j < this.tokens.length; j += 1) {
          const specTok = this.tokens[j];
          if (specTok === undefined || specTok.kind === "string" || specTok.kind === "eof") {
            break;
          }
          if (specTok.kind === "ident" || specTok.kind === "keyword") {
            names.add(specTok.text);
          }
        }
      }
    }
    this.patternHeadTypeNamesMemo = names;
    return names;
  }

  /**
   * Parse a `par for <Ident> in <Expr> [max <Expr>] <Block>` fan-out expression
   * (RFC 0003; grammar.md `ParForExpr`). The cursor is on the `par` identifier.
   * The iterand and the optional `max` operand parse with object-literal
   * brace-suppression active so the trailing `{` opens the body block rather
   * than reading as a bare object literal; `max` is a contextual keyword here
   * (an ordinary identifier lexeme) recognised only between the iterand and the
   * body. After the body parses, the four body-restriction diagnostics
   * (`par-query-in-body` / `par-shared-mutation` / `par-break-continue` /
   * `par-return-in-body`, control-flow.md CTRL-4) are emitted over the parsed
   * body.
   */
  private parseParFor(): Expr {
    const parTok = this.advance(); // `par`
    this.advance(); // `for`
    let mutConsumed = false;
    if (this.isKeyword("mut")) {
      // A `mut` modifier on the loop variable is an always-immutable context
      // (bindings.md §Immutable contexts), same as plain `for`.
      mutConsumed = true;
      const mutTok = this.advance();
      const diag = checkMutModifier(
        { position: "for-var" },
        { file: this.file, range: mutTok.range },
      );
      if (diag !== undefined) {
        this.diagnostics.push(diag);
      }
    }
    const variableTok = this.peek();
    const variable = this.advance().text;
    // `ParForExpr ::= "par" "for" Ident "in" Expr MaxClause? ParForBody`
    // (grammar.md) makes this the second `Ident` terminal position `parseFor`
    // above serves the first of; same rule, same recovery-artefact guard (bug
    // 0153 §Fix — rule and rationale on `checkLoopVariableAndConsumeIn`,
    // loop-variable-recovery.ts).
    checkLoopVariableAndConsumeIn(
      this.diagnostics,
      this.file,
      variableTok,
      mutConsumed,
      () => this.isKeyword("in"),
      () => this.advance(),
    );
    // Snapshot the outer mutable bindings before the body's own `let`s are
    // recorded, so a body reassignment to an outer `let mut` is detectable.
    const outerMutables = new Set<string>();
    for (const [name, mutable] of this.bindings) {
      if (mutable) {
        outerMutables.add(name);
      }
    }
    const save = this.suppressBrace;
    this.suppressBrace = true;
    let iterand: Expr;
    let max: Expr | null = null;
    try {
      iterand = this.parseExpression() ?? nullExpr(parTok.range);
      // `MaxClause ::= "max" Expr` — `max` is a contextual keyword (a bare
      // identifier lexeme) admitted only here, between the iterand and the body.
      if (this.peek().kind === "ident" && this.peek().text === "max") {
        this.advance(); // `max`
        max = this.parseExpression();
      }
    } finally {
      this.suppressBrace = save;
    }
    // The loop variable is an always-immutable context (bindings.md §"Immutable
    // contexts") — a `par for` variable is a `for` iteration variable
    // (bindings.md:32) — so scope it to the body parse exactly as `parseFor`
    // does, so a write to it draws `immutable-rebinding` (bug 0370 §Fix layer 1;
    // F1) instead of silently reaching the runtime belt.
    const body = this.withImmutableBindings([variable], () => this.parseBlock());
    emitParForBodyDiagnostics(
      { diagnostics: this.diagnostics, file: this.file },
      body,
      outerMutables,
      variable,
    );
    return {
      kind: "par-for",
      variable,
      iterand,
      max,
      body,
      range: spanRange(parTok.range, this.prevRange()),
    };
  }

  private parseInvoke(): Expr {
    const kw = this.advance(); // `invoke`
    // Capture an optional `<T>` return-type annotation (invocation.md §Typed
    // return): its text is threaded onto the AST so the runtime can AJV-validate
    // the callee's returned value against it (the parse-time type check is
    // separate; the runtime check is the safety net — hard-ceilings ceiling #4).
    let returnSchema: string | null = null;
    // Absent iff no `<T>` was written, or the angle-depth loop closed its own
    // `>` before EOF; present, the loop exhausted the source at depth > 0, so
    // the capture did not end at its own `>` (bug 0279, clause (iv)(3)'s
    // provenance mark).
    let returnSchemaAbsorbed = false;
    if (this.isPunct("<")) {
      this.advance(); // `<`
      let depth = 1;
      const parts: string[] = [];
      while (depth > 0 && !this.atEnd()) {
        const t = this.peek();
        if (t.kind === "punct" && t.text === "<") {
          depth += 1;
        } else if (t.kind === "punct" && t.text === ">") {
          depth -= 1;
          if (depth === 0) {
            this.advance();
            break;
          }
        } else if (t.kind === "punct" && t.text === "{") {
          // An inline `ObjectType` arm inside `invoke<T>`: route it through
          // the same balanced-group consumer as `parseType`, angle-bounded so
          // an unclosed brace cannot run past this annotation's own `>`
          // (bug 0228).
          this.consumeInlineObjectType(parts, true);
          continue;
        }
        parts.push(t.text);
        this.advance();
      }
      const annotation = parts.join("").trim();
      returnSchema = annotation.length > 0 ? annotation : null;
      returnSchemaAbsorbed = depth > 0;
    }
    const args = this.parseArgs();
    const first = args[0];
    const path = first !== undefined && first.kind === "string" ? first.value : "";
    // INV-1 / INV-2 (invocation.md §Resolution; lexical.md §"Path literals" /
    // §"Extension matching"): the callee path is a string literal — validate its
    // byte-exact-lowercase `.theta` suffix and forward-slash-only rule at parse
    // time. Per invocation.md §Resolution (the string-literal requirement), a
    // non-literal (runtime-computed) path is not supported in theta 1.0, so
    // surface it as a parse error rather than degrading to a silent empty-path
    // no-op at runtime. (The private ordinal formerly cited here predates the
    // spec's own INV-8, which now pins the clause mode gate — bug 0112 class.)
    if (first !== undefined) {
      if (first.kind === "string") {
        this.diagnostics.push(
          ...validatePathLiteral(
            { value: first.value, range: first.range },
            "invoke",
            this.file,
          ),
        );
      } else {
        this.diagnostics.push({
          severity: "error",
          code: "theta/parse/unsupported-feature",
          file: this.file,
          range: first.range,
          message:
            "unsupported syntactic feature: dynamic invoke path (runtime-computed)",
        });
      }
    }
    return {
      kind: "invoke",
      path,
      returnSchema,
      args,
      ...(returnSchemaAbsorbed ? { returnSchemaAbsorbed: true } : {}),
      range: spanRange(kw.range, this.prevRange()),
    };
  }

  /** The cursor `parseDelimitedExprs` drives (expr-list.ts). */
  private readonly exprListCursor = {
    advance: () => this.advance(),
    isPunct: (text: string) => this.isPunct(text),
    atEnd: () => this.atEnd(),
    parseExpression: () => this.parseExpression(),
    getSuppressBrace: () => this.suppressBrace,
    setSuppressBrace: (value: boolean) => {
      this.suppressBrace = value;
    },
  };

  private parseArgs(): Expr[] {
    if (!this.isPunct("(")) {
      return [];
    }
    this.advance(); // `(`
    return parseDelimitedExprs(this.exprListCursor, ")");
  }

  private parseArray(): Expr {
    const open = this.advance(); // `[`
    const elements = parseDelimitedExprs(this.exprListCursor, "]");
    return {
      kind: "array",
      elements,
      range: spanRange(open.range, this.prevRange()),
    };
  }

  /**
   * Parse (and reject) a backtick template used in value position with no
   * leading `@`. Query templates are `@`-prefixed and admitted only at
   * statement / `let`-RHS level (expressions.md §"Not supported"), so a bare
   * `` `..${..}` `` value is `theta/parse/unsupported-feature`. The whole
   * template is consumed — up to the matching closing backtick — so a `${…}`
   * interpolation brace is never re-read as a bare object literal (which would
   * mis-emit `theta/parse/bare-object-literal`); an inert `null` node keeps
   * downstream typing stable.
   */
  private parseBareTemplate(): Expr {
    const open = this.advance(); // opening backtick
    // Consume the whole template up to its matching closing backtick, tracking
    // `${…}` interpolation brace depth so a backtick nested inside an
    // interpolation (`` `a${@`x`}` ``) does not prematurely close the template
    // and leave trailing tokens to be re-parsed into a spurious secondary
    // diagnostic.
    let braceDepth = 0;
    while (!this.atEnd()) {
      if (braceDepth === 0 && this.isPunct("`")) {
        break;
      }
      if (this.isPunct("{")) {
        braceDepth += 1;
      } else if (this.isPunct("}") && braceDepth > 0) {
        braceDepth -= 1;
      }
      this.advance();
    }
    if (this.isPunct("`")) {
      this.advance(); // closing backtick
    }
    const range = spanRange(open.range, this.prevRange());
    this.diagnostics.push({
      severity: "error",
      code: "theta/parse/unsupported-feature",
      file: this.file,
      range,
      message:
        "unsupported syntactic feature: backtick template in value position (query templates must be @-prefixed)",
    });
    return nullExpr(range);
  }

  private parseQuery(): Expr {
    const at = this.advance(); // `@`
    let schema: string | null = null;
    // An optional `@<Schema>` annotation precedes the backtick template
    // (query-forms.md QRY-3). The annotation is a type expression between angle
    // brackets — a named schema (`@<Triage>`), a primitive (`@<integer>`), or a
    // nested generic (`@<array<Foo>>`) — its tokens joined with no separator,
    // except an inline `ObjectType` brace group's interior, sliced raw from
    // the author's source bytes (bug 0228).
    if (this.isPunct("<")) {
      this.advance(); // `<`
      const parts: string[] = [];
      let depth = 1;
      while (depth > 0 && !this.atEnd()) {
        if (this.isPunct("<")) {
          depth += 1;
        } else if (this.isPunct(">")) {
          depth -= 1;
          if (depth === 0) {
            this.advance();
            break;
          }
        } else if (this.isPunct("{")) {
          // An inline `ObjectType` arm inside `@<T>`: route it through the
          // same balanced-group consumer as `parseType`, angle-bounded so an
          // unclosed brace cannot run past this annotation's own `>` (the
          // `@<Ghost{>` ghost bound, bug 0228).
          this.consumeInlineObjectType(parts, true);
          continue;
        }
        parts.push(this.advance().text);
      }
      schema = parts.join("").trim();
      // Bug 0014: the type grammar derives no empty `Type` (grammar.md §Type
      // grammar; type-system.md applies the same grammar to the `@<T>`
      // annotation position), so an interior that trims to empty — `@<>`,
      // `@<  >`, tab/newline-only, or an unterminated `@<` at EOF — is not an
      // ascription. Accepted silently, the minted `""` is the sole input
      // `lowerQueryResponseSchema` cannot lower, and the runtime would bind
      // the response with no validation on the degraded fused arm (QRY-22).
      // Reject here — the one place the empty capture is manufactured (the
      // bare `@Ident` arm below never mints an empty annotation, and
      // `parseInvoke` normalises its empty capture to untyped `null`). The
      // node still carries the minted `""` so the AST reflects the source;
      // load refuses error thetas, and the lowering's `undefined` contract
      // stays as defence in depth.
      if (schema.length === 0) {
        this.diagnostics.push({
          severity: "error",
          code: "theta/parse/empty-query-annotation",
          file: this.file,
          range: spanRange(at.range, this.prevRange()),
          message:
            "`@<>` query annotation is empty; write `@<Schema>` or drop the annotation for an untyped query",
        });
      }
    } else if (!this.isPunct("`")) {
      // A bare `@Schema` (no angle brackets) annotation.
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
    // QRY-6's Trigger presupposes a template the author WROTE and CLOSED; an
    // error-recovery capture (an over-run `@<Ghost` annotation at EOF, or an
    // unterminated `` @` `` with no closing backtick) mints this same node
    // shape with an empty `template` for text the author never wrote as a
    // template body at all, so the check is gated on both tick tokens being
    // present rather than on the template text.
    if (openTick !== null && closeTick !== null) {
      const warning = emptyTemplateWarning(
        queryTemplateStaticBody(rawTemplate),
        spanRange(openTick.range, closeTick.range),
      );
      if (warning !== undefined) {
        this.diagnostics.push({ ...warning, file: this.file });
      }
    }
    return {
      kind: "query",
      schema,
      ascriptionWritten: schema !== null,
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


export { BodyParser };
