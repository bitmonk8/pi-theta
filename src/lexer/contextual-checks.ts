// Contextual identifier, keyword, and single-line-body checks over joined lexer tokens.

import { type Diagnostic } from "../diagnostics/diagnostic";
import { type Token } from "./lexer";

export { contextualDiagnostics };

/**
 * The two brace-delimited region shapes the adjacency scans below need to
 * tell apart. A `member` region encloses NAMES — a schema body, an enum body,
 * or an `import` / `export` specifier list
 * (`ImportSpec ::= Ident ("as" Ident)?`, `docs/reference/grammar.md`
 * §"Imports and re-exports"; the wire-rename clause,
 * `docs/spec_topics/schemas.md` `as "WireName"`). A `block` region encloses
 * statements, where the same eight words can be a declarator head or a
 * control header.
 */
type BraceRegion = "member" | "block";

/**
 * Classify the region the `{` at `index` opens, from that brace's own
 * antecedent alone — never from the region enclosing it.
 *
 * A `{` opens a member region when it is the body of `import` / `export` (the
 * token immediately before it, itself at a statement head), or of a `schema` /
 * `enum` DECLARATION (the keyword two back, past the declared NAME, itself at
 * a statement head or behind a statement-heading `export`). The warrant for
 * narrowing the scans is narrow and positional: it is those DECLARATION forms
 * — schema and enum bodies (`docs/reference/schema-subset.md` §"Schema
 * declarations") and the `import` / `export` specifier list
 * (`docs/reference/grammar.md` §"Imports and re-exports") — whose member
 * names bug 0153's parser leaves refuse a reserved spelling at, so the lexer
 * scan there is a duplicate rather than the whole refusal. Two brace shapes
 * spell the same tokens with no such leaf behind them and must stay `block`
 * regions: an inline object type nested in a schema body, which opens after a
 * `:`, and the typed object-literal EXPRESSION `schema T { … }`, which is
 * legal and whose keys no leaf refuses. Classifying either as `member` would
 * silence the only refusal those shapes draw.
 *
 * Each arm therefore requires a whole GRAMMAR PRODUCTION HEAD in DECLARATION
 * position, not a keyword's mere proximity to the brace: `SchemaDecl` /
 * `EnumDecl` spell `"schema" Ident "{"` / `"enum" Ident "{"`, so the token
 * between the keyword and the brace must be an `ident` and the keyword must
 * open a statement; `ImportDecl` / `ExportDecl` are declarations, so their
 * keyword must open a statement too. A `{` whose neighbourhood merely
 * contains one of those four words in some other position — `if (schema) {
 * fn: 1 }`, `let x = import { fn: 1 }`, `let x = [schema T { fn: 1 }]` —
 * belongs to no NAME-bearing declaration, and classifying it as a member
 * region would skip the scans over a region with no parser-leaf backstop
 * behind it.
 *
 * The statement-head requirement is deliberately literal, so a schema or enum
 * declaration written where its keyword does not open a statement — the
 * single-line `{ schema S { fn: 1 } }` form, whose keyword sits directly
 * behind a `{` — classifies as a block region and keeps the scans' full
 * reach, misfire included. That shape stays refused, so the narrowing costs a
 * duplicate diagnostic rather than a refusal.
 */
function classifyBrace(tokens: readonly Token[], index: number): BraceRegion {
  const prev = tokens[index - 1];
  if (
    prev !== undefined &&
    prev.kind === "keyword" &&
    (prev.text === "import" || prev.text === "export") &&
    startsStatement(tokens, index - 1)
  ) {
    return "member";
  }
  const declaredHead = tokens[index - 2];
  if (
    declaredHead !== undefined &&
    declaredHead.kind === "keyword" &&
    (declaredHead.text === "schema" || declaredHead.text === "enum") &&
    prev !== undefined &&
    prev.kind === "ident" &&
    startsDeclaration(tokens, index - 2)
  ) {
    return "member";
  }
  return "block";
}

/**
 * True when the token at `index` opens a statement: nothing precedes it, or a
 * `stmt-sep` does. `ImportDecl` / `ExportDecl` (`docs/reference/grammar.md`
 * §"Imports and re-exports") are declarations, so an `import` / `export`
 * keyword anywhere else — an expression operand, a parenthesised condition —
 * heads no specifier list.
 */
function startsStatement(tokens: readonly Token[], index: number): boolean {
  const before = tokens[index - 1];
  return before === undefined || before.kind === "stmt-sep";
}

/**
 * True when the declarator keyword at `index` stands in DECLARATION position:
 * it opens a statement itself, or an `export` that opens a statement precedes
 * it. The `export` clause is what keeps `export schema S { … }` /
 * `export enum E { … }` classified by their declaration head rather than by
 * the re-export spelling they share a keyword with.
 */
function startsDeclaration(tokens: readonly Token[], index: number): boolean {
  if (startsStatement(tokens, index)) {
    return true;
  }
  const before = tokens[index - 1];
  return (
    before !== undefined &&
    before.kind === "keyword" &&
    before.text === "export" &&
    startsStatement(tokens, index - 1)
  );
}

/**
 * True when the keyword at `index` occupies a NAME slot rather than a
 * declarator head or a control header.
 *
 * Two slots put one of the eight words the scans below key on where a name
 * belongs, and the parser leaves already refuse a reserved spelling there
 * (bug 0153 §Fix): inside a member region (`classifyBrace`), the head of a
 * member — after the opening `{`, after a `,` between members, after the `as`
 * of an import/export alias, or after a stray statement separator that
 * `collapseContinuations` only emits inside a member region when an unmatched
 * `)` / `]` has already driven its bracket-depth counter back to zero inside
 * the still-open `{` (group (M) — every well-formed member region stays at
 * depth > 0 for its whole body, so `collapseContinuations` swallows every
 * ordinary newline between members and no stmt-sep clause is reachable
 * there); and inside a block region, the iteration variable of `for` / `par
 * for`
 * (`ForStmt ::= "for" Ident "in" Expr StmtBlock`, `docs/reference/grammar.md`
 * §"Blocks"), past the
 * `mut` recovery spelling the parser leaves also own. A member's TYPE
 * position (the token after `:`) is deliberately not a name slot: the scans
 * must keep enforcing there for bug 0044's witness to hold.
 */
function isNameSlot(tokens: readonly Token[], index: number, regions: readonly BraceRegion[]): boolean {
  const prev = tokens[index - 1];
  if (prev === undefined) {
    return false;
  }
  if (regions[regions.length - 1] === "member") {
    return (
      prev.kind === "stmt-sep" ||
      (prev.kind === "punct" && (prev.text === "{" || prev.text === ",")) ||
      (prev.kind === "keyword" && prev.text === "as")
    );
  }
  // A key position inside a non-member brace region (an inline object type's
  // field or an object-literal constructor's field, neither of which
  // `classifyBrace` marks `member`) is also a name slot (bug 0249): the
  // parser leaf at that position now refuses a reserved spelling itself, so
  // the lexer's `single-line-if` scan must not draw a second, wrongly-Triggered
  // diagnostic there. The `:` requirement is the necessary width — a
  // colon-less head (an enum variant, an import/export specifier) is not this
  // slot and must keep drawing the control-header scan.
  if (
    regions.length > 0 &&
    (prev.kind === "stmt-sep" || (prev.kind === "punct" && (prev.text === "{" || prev.text === ",")))
  ) {
    const next = tokens[index + 1];
    if (next !== undefined && next.kind === "punct" && next.text === ":") {
      return true;
    }
  }
  if (prev.kind !== "keyword") {
    return false;
  }
  if (prev.text === "for") {
    return true;
  }
  const beforeMut = tokens[index - 2];
  return (
    prev.text === "mut" && beforeMut !== undefined && beforeMut.kind === "keyword" && beforeMut.text === "for"
  );
}

/**
 * Run the parser-enforced identifier rules the lexer core owns at
 * declarator-name and control-header positions: reserved-keyword-as-identifier
 * and the first-letter case rules at `let` / `let mut` / `fn` (binding) and
 * `schema` / `enum` (type) name positions, and the single-line-body rule for
 * `if` / `for` / `while` / `fn` headers whose logical line carries no `{`.
 *
 * A brace-region stack (`classifyBrace`) tells a member's NAME slot apart from
 * a declarator head or a control header sharing the same spelling
 * (`isNameSlot`); at a NAME slot both the declarator arms and the
 * single-line-body scan skip the token, since the parser leaves already
 * refuse a reserved spelling there. Scope note: full identifier-position
 * coverage (every reserved word in every identifier slot) is a parser-leaf
 * obligation; the lexer core enforces the positions its closed Tests
 * obligations name, plus the name-slot discrimination those positions need to
 * avoid a second, wrongly-ranged diagnostic beside the parser leaf's correct
 * one. See notes.md.
 */
function contextualDiagnostics(tokens: readonly Token[], file: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const controlHeads = new Set(["if", "for", "while", "fn"]);

  const checkName = (index: number, kind: "binding" | "type"): void => {
    const name = tokens[index];
    if (name === undefined) {
      return;
    }
    if (name.kind === "keyword") {
      diagnostics.push({
        severity: "error",
        code: "theta/parse/reserved-keyword-as-identifier",
        file,
        range: name.range,
        message: `reserved keyword '${name.text}' cannot be used as an identifier`,
      });
      return;
    }
    if (name.kind !== "ident") {
      return;
    }
    const first = name.text[0] ?? "";
    const isUpper = first >= "A" && first <= "Z";
    if (kind === "binding" && isUpper) {
      diagnostics.push({
        severity: "error",
        code: "theta/parse/binding-case-mismatch",
        file,
        range: name.range,
        message: "binding name must start with a lowercase letter or _",
      });
    } else if (kind === "type" && !isUpper) {
      diagnostics.push({
        severity: "error",
        code: "theta/parse/schema-case-mismatch",
        file,
        range: name.range,
        message: "schema name must start with an uppercase letter",
      });
    }
  };

  // A `@`…`` query template body is prose, not code: the parser recovers it by
  // slicing raw source between the backtick token bounds (see BodyParser), so the
  // interior tokens are vestigial. Control-header words (`if` / `for` / …) and
  // declarator keywords (`let` / `fn` / `schema` / `enum`) occurring as prose
  // inside a template MUST NOT trigger the single-line-body or name-case rules
  // (grammar.md §Comments: "Text inside a `@`…`` query template is not a
  // comment" — nor is it code). Backticks are template delimiters and always
  // pair, so a toggle tracks the template body; `${…}` interpolations sit inside
  // it and legitimately carry no control-header/declarator statement, so
  // suppressing the whole region is safe.
  let inTemplateBody = false;
  const braceRegions: BraceRegion[] = [];
  for (let k = 0; k < tokens.length; k += 1) {
    const t = tokens[k];
    if (t === undefined) {
      continue;
    }
    if (t.kind === "punct" && t.text === "`") {
      inTemplateBody = !inTemplateBody;
      continue;
    }
    if (!inTemplateBody && t.kind === "punct" && t.text === "{") {
      braceRegions.push(classifyBrace(tokens, k));
      continue;
    }
    if (!inTemplateBody && t.kind === "punct" && t.text === "}") {
      braceRegions.pop();
      continue;
    }
    if (inTemplateBody || t.kind !== "keyword") {
      continue;
    }
    if (isNameSlot(tokens, k, braceRegions)) {
      continue;
    }
    if (t.text === "let") {
      let nameIdx = k + 1;
      const after = tokens[nameIdx];
      if (after !== undefined && after.kind === "keyword" && after.text === "mut") {
        nameIdx += 1;
      }
      checkName(nameIdx, "binding");
    } else if (t.text === "fn") {
      checkName(k + 1, "binding");
    } else if (t.text === "schema" || t.text === "enum") {
      checkName(k + 1, "type");
    }

    if (controlHeads.has(t.text)) {
      let m = k + 1;
      let braced = false;
      while (m < tokens.length) {
        const body = tokens[m];
        if (body === undefined || body.kind === "stmt-sep" || body.kind === "eof") {
          break;
        }
        if (body.kind === "punct" && body.text === "{") {
          braced = true;
          break;
        }
        m += 1;
      }
      if (!braced) {
        diagnostics.push({
          severity: "error",
          code: "theta/parse/single-line-if",
          file,
          range: t.range,
          message: "single-line body not permitted; wrap in { ... }",
        });
      }
    }
  }

  return diagnostics;
}
