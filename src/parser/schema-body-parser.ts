// Schema & enum declaration recognition for the body parser: the `schema X …`
// object / alias / `by`-discriminated forms and the `enum X { … }` variant
// list, with their parse-time diagnostics and declaration-shape recovery.
// Driven by `BodyParser` (body-parser.ts) over a narrow parser-core interface
// (its cursor methods + `parseType`); the alias-arm stop sets and `spanRange`
// live here and are imported back by the body parser.

import type { Diagnostic, SourceRange } from "../diagnostics/diagnostic";
import type { Token } from "../lexer/lexer";
import { isTypeLikeName } from "../lexer/name-case";
import { checkObjectSchema, type EnumValueKind, type EnumVariantDecl } from "./schema-declarations";
import { reservedKeywordAsIdentifierDiagnostic } from "./annotation-validation";
import { splitTopLevelSegments } from "./params";
import type { SchemaFieldSource, Stmt } from "./theta-ast";
import { classifyEnumValueToken } from "./theta-document";

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
 * (body-parser.ts), which answers a different question (what proves the `isTernaryHead`
 * scan crossed a statement boundary) and is tuned to it — it carries `else`,
 * omits `for`, and carries the `enum` this set must not.
 */
export const ALIAS_ARM_STOP_KEYWORDS: ReadonlySet<string> = new Set([
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
export const ALIAS_ARM_STOP_PUNCT: ReadonlySet<string> = new Set(["@", "`", "(", "[", "!"]);

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

/** Build a range spanning from `start`'s start to `end`'s end. */
export function spanRange(start: SourceRange, end: SourceRange): SourceRange {
  return { start: start.start, end: end.end };
}

/**
 * The body parser's core that the schema & enum recognizers drive: its token
 * cursor, the per-parse diagnostics sink and file, and `parseType`.
 */
export interface SchemaParserCore {
  getPos(): number;
  readonly diagnostics: Diagnostic[];
  readonly file: string;
  peek(offset?: number): Token;
  advance(): Token;
  atEnd(): boolean;
  isPunct(text: string, offset?: number): boolean;
  isKeyword(text: string, offset?: number): boolean;
  prevRange(): SourceRange;
  unmatchedCloseBraces(from: number, to: number): number;
  parseType(stopAtFieldBoundary?: boolean, stopAtWithClause?: boolean, aliasArmBoundary?: boolean): string;
}

/**
 * The schema & enum declaration sub-parser. Holds no state of its own: every
 * cursor read and diagnostic push is delegated to the owning `BodyParser`'s
 * core, so the recognizers below read exactly as they did as its methods.
 */
export class SchemaBodyParser {
  public constructor(private readonly core: SchemaParserCore) {}

  // --- parser-core delegation ---------------------------------------------

  private get pos(): number {
    return this.core.getPos();
  }

  private get diagnostics(): Diagnostic[] {
    return this.core.diagnostics;
  }

  private get file(): string {
    return this.core.file;
  }

  private peek(offset = 0): Token {
    return this.core.peek(offset);
  }

  private advance(): Token {
    return this.core.advance();
  }

  private atEnd(): boolean {
    return this.core.atEnd();
  }

  private isPunct(text: string, offset = 0): boolean {
    return this.core.isPunct(text, offset);
  }

  private isKeyword(text: string, offset = 0): boolean {
    return this.core.isKeyword(text, offset);
  }

  private prevRange(): SourceRange {
    return this.core.prevRange();
  }

  private unmatchedCloseBraces(from: number, to: number): number {
    return this.core.unmatchedCloseBraces(from, to);
  }

  private parseType(
    stopAtFieldBoundary = false,
    stopAtWithClause = false,
    aliasArmBoundary = false,
  ): string {
    return this.core.parseType(stopAtFieldBoundary, stopAtWithClause, aliasArmBoundary);
  }

  // --- schema & enum declarations -----------------------------------------

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
  public parseSchema(): Stmt {
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

  public parseEnum(): Stmt {
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
}
