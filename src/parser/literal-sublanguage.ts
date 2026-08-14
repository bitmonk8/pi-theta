// V2a / V2a-T — the theta literal-sublanguage seam.
//
// This module owns the "is-literal" check of grammar.md §"Theta literal
// sublanguage": the strict subset of the expression grammar admitted at a
// `params:` default RHS. Every literal is a legal theta expression, but only the
// enumerated productions (primitive / named-value `Enum.Variant` / array / bare-
// and named-object literals) are admitted; the parser runs the is-literal check
// after parsing the AST in that position.
//
// RFC 0002 (docs/rfcs/0002-computed-tool-arguments.md) retired the Pi-tool
// argument as a literal-sublanguage position: a Pi-tool call's single bare-object
// argument now admits full Theta expressions for its field values, so
// `theta/parse/tool-arg-not-literal` is no longer emitted (a DIAG-2 code
// removal). The `params:` default arm below is unaffected. The bare-object
// *shape* rule that survives that retirement is enforced by `isBareObjectLiteral`
// (used by the Pi-tool argument check in `../runtime/tool-call.ts`).
//
//   - `theta/parse/default-not-literal` — a `params:` default RHS contains a
//     form outside the literal sublanguage (an operator other than the unary-`-`
//     numeric carve-out, a function/tool call, an identifier reference other
//     than `Enum.Variant`, `${...}` interpolation, or an `@`...`` template).
//   - `theta/parse/missing-object-field` — a bare- or named-object literal omits
//     a declared (required) field of its LHS / variant schema (partial defaults
//     are not supported).
//
// V2a-T (tests-task) declares these seam shapes and stubs both checks as inert
// no-ops (no diagnostic produced) so the failing tests compile and red on their
// own primary assertions (the is-literal check and the full-field-requirement
// check are absent). The paired V2a implementation leaf fills them in.

import { type Diagnostic, type SourceRange } from "../diagnostics/diagnostic";
import { type CompatType, type PrimitiveName } from "./type-compat";

/**
 * Which literal position an expression occupies. RFC 0002 retired the Pi-tool
 * argument position, so `default` (a `params:` frontmatter default RHS →
 * `theta/parse/default-not-literal`) is the sole remaining literal-sublanguage
 * position.
 */
export type LiteralPosition = "default";

/** A located site at which a literal-sublanguage check is run. */
export interface LiteralCheckSite {
  readonly file: string;
  readonly range: SourceRange;
}

/**
 * Run the is-literal check against an expression as written in source at a
 * literal position, returning every diagnostic raised. A form outside the
 * literal sublanguage fires `theta/parse/default-not-literal`; the diagnostic
 * names the offending sub-expression.
 */
export function checkLiteralSublanguage(
  source: string,
  _position: LiteralPosition,
  site: LiteralCheckSite,
): Diagnostic[] {
  const tokens = tokeniseExpr(source);
  const parser = new ExprParser(tokens, source);
  const node = parser.parse();
  if (node === undefined) {
    return [];
  }
  const offending = firstNonLiteral(node, source);
  if (offending === undefined) {
    return [];
  }
  const expr = source.slice(offending.start, offending.end).trim();
  return [
    {
      severity: "error",
      code: "theta/parse/default-not-literal",
      file: site.file,
      range: site.range,
      message: `params default RHS must be a literal-sublanguage form; offending sub-expression: ${expr}`,
    },
  ];
}

/**
 * Whether `source` is written as a bare object literal `{ ... }` at its top
 * level — the surviving *shape* rule for a Pi-tool call's single positional
 * argument (RFC 0002; grammar.md §"Pi-tool argument grammar"). A whole
 * `let`-bound object passed positionally (`read(args)`) parses to a bare
 * identifier, not a `{ ... }` literal, so it does not satisfy `ToolArg`. The
 * field *values* inside the literal are full Theta expressions and are NOT
 * checked here.
 */
export function isBareObjectLiteral(source: string): boolean {
  const tokens = tokeniseExpr(source);
  const parser = new ExprParser(tokens, source);
  const node = parser.parse();
  return node !== undefined && node.kind === "object";
}

/** An expression AST node; `start`/`end` are char offsets into the source. */
type ExprNode = { readonly start: number; readonly end: number } & (
  | { readonly kind: "literal" } // string / number / boolean / null
  | { readonly kind: "neg"; readonly operand: ExprNode } // unary `-`
  | { readonly kind: "unary-other" } // any other unary (e.g. `!`)
  | { readonly kind: "ident" }
  | { readonly kind: "member"; readonly objectIsIdent: boolean } // `a.b`
  | { readonly kind: "call" }
  | { readonly kind: "index" }
  | { readonly kind: "binary" }
  | { readonly kind: "ternary" }
  | { readonly kind: "template" } // backtick / `${...}` interpolation
  | { readonly kind: "query" } // `@`...`` query template
  | { readonly kind: "array"; readonly elements: ExprNode[] }
  | { readonly kind: "object"; readonly fieldValues: ExprNode[] }
  | { readonly kind: "unknown" }
);

interface ExprToken {
  readonly kind: "str" | "num" | "ident" | "punct" | "template" | "query";
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

function tokeniseExpr(source: string): ExprToken[] {
  const tokens: ExprToken[] = [];
  const n = source.length;
  let i = 0;
  const isDigit = (c: string): boolean => c >= "0" && c <= "9";
  const isIdentStart = (c: string): boolean =>
    (c >= "A" && c <= "Z") || (c >= "a" && c <= "z") || c === "_";
  const isIdentPart = (c: string): boolean => isIdentStart(c) || isDigit(c);
  const twoChar = new Set(["==", "!=", "<=", ">=", "&&", "||"]);
  while (i < n) {
    const c = source[i] ?? "";
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i += 1;
      continue;
    }
    if (c === '"' || c === "'") {
      const start = i;
      const quote = c;
      i += 1;
      while (i < n && source[i] !== quote) {
        if (source[i] === "\\" && i + 1 < n) {
          i += 1;
        }
        i += 1;
      }
      if (i < n) {
        i += 1;
      }
      tokens.push({ kind: "str", text: source.slice(start, i), start, end: i });
      continue;
    }
    if (c === "`") {
      // A backtick template literal (`${...}` interpolation lives here).
      const start = i;
      i += 1;
      while (i < n && source[i] !== "`") {
        i += 1;
      }
      if (i < n) {
        i += 1;
      }
      tokens.push({ kind: "template", text: source.slice(start, i), start, end: i });
      continue;
    }
    if (c === "@") {
      // An `@`...`` query template. Consume the following backtick block too.
      const start = i;
      i += 1;
      // Optional `<T>` schema annotation.
      if (source[i] === "<") {
        while (i < n && source[i] !== ">") {
          i += 1;
        }
        if (i < n) {
          i += 1;
        }
      }
      if (source[i] === "`") {
        i += 1;
        while (i < n && source[i] !== "`") {
          i += 1;
        }
        if (i < n) {
          i += 1;
        }
      }
      tokens.push({ kind: "query", text: source.slice(start, i), start, end: i });
      continue;
    }
    if (c === "$" && source[i + 1] === "{") {
      // A bare `${...}` interpolation outside a string — a template form.
      const start = i;
      i += 2;
      let depth = 1;
      while (i < n && depth > 0) {
        if (source[i] === "{") {
          depth += 1;
        } else if (source[i] === "}") {
          depth -= 1;
        }
        i += 1;
      }
      tokens.push({ kind: "template", text: source.slice(start, i), start, end: i });
      continue;
    }
    if (isDigit(c)) {
      const start = i;
      while (
        i < n &&
        (isDigit(source[i] ?? "") || source[i] === "." || source[i] === "e" || source[i] === "E")
      ) {
        i += 1;
      }
      tokens.push({ kind: "num", text: source.slice(start, i), start, end: i });
      continue;
    }
    if (isIdentStart(c)) {
      const start = i;
      while (i < n && isIdentPart(source[i] ?? "")) {
        i += 1;
      }
      tokens.push({ kind: "ident", text: source.slice(start, i), start, end: i });
      continue;
    }
    const pair = source.slice(i, i + 2);
    if (twoChar.has(pair)) {
      tokens.push({ kind: "punct", text: pair, start: i, end: i + 2 });
      i += 2;
      continue;
    }
    tokens.push({ kind: "punct", text: c, start: i, end: i + 1 });
    i += 1;
  }
  return tokens;
}

/** Binary operator precedence (higher binds tighter); 0 = not a binary op. */
const BINARY_PRECEDENCE: Readonly<Record<string, number>> = Object.freeze({
  "||": 1,
  "&&": 2,
  "==": 3,
  "!=": 3,
  "<": 4,
  "<=": 4,
  ">": 4,
  ">=": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
  "%": 6,
});

/** A tolerant recursive-descent / precedence-climbing expression parser. */
class ExprParser {
  private pos = 0;
  constructor(
    private readonly tokens: readonly ExprToken[],
    private readonly source: string,
  ) {}

  private peek(): ExprToken | undefined {
    return this.tokens[this.pos];
  }

  private next(): ExprToken | undefined {
    const t = this.tokens[this.pos];
    this.pos += 1;
    return t;
  }

  private spanFrom(start: number): number {
    const prev = this.tokens[this.pos - 1];
    return prev !== undefined ? prev.end : start;
  }

  parse(): ExprNode | undefined {
    if (this.peek() === undefined) {
      return undefined;
    }
    return this.parseTernary();
  }

  private parseTernary(): ExprNode {
    const cond = this.parseBinary(1);
    const t = this.peek();
    if (t !== undefined && t.kind === "punct" && t.text === "?") {
      this.next();
      this.parseTernary(); // then-branch
      const colon = this.peek();
      if (colon !== undefined && colon.kind === "punct" && colon.text === ":") {
        this.next();
        this.parseTernary(); // else-branch
      }
      return { kind: "ternary", start: cond.start, end: this.spanFrom(cond.start) };
    }
    return cond;
  }

  private parseBinary(minPrec: number): ExprNode {
    let left = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (t === undefined || t.kind !== "punct") {
        break;
      }
      const prec = BINARY_PRECEDENCE[t.text];
      if (prec === undefined || prec < minPrec) {
        break;
      }
      this.next();
      this.parseBinary(prec + 1);
      left = { kind: "binary", start: left.start, end: this.spanFrom(left.start) };
    }
    return left;
  }

  private parseUnary(): ExprNode {
    const t = this.peek();
    if (t !== undefined && t.kind === "punct" && (t.text === "-" || t.text === "!")) {
      const start = t.start;
      this.next();
      const operand = this.parseUnary();
      if (t.text === "-") {
        return { kind: "neg", operand, start, end: operand.end };
      }
      return { kind: "unary-other", start, end: operand.end };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): ExprNode {
    let node = this.parsePrimary();
    for (;;) {
      const t = this.peek();
      if (t === undefined || t.kind !== "punct") {
        break;
      }
      if (t.text === ".") {
        this.next();
        this.next(); // the property name
        const objectIsIdent = node.kind === "ident";
        node = {
          kind: "member",
          objectIsIdent,
          start: node.start,
          end: this.spanFrom(node.start),
        };
        continue;
      }
      if (t.text === "(") {
        this.skipBracketed("(", ")");
        node = { kind: "call", start: node.start, end: this.spanFrom(node.start) };
        continue;
      }
      if (t.text === "[") {
        this.skipBracketed("[", "]");
        node = { kind: "index", start: node.start, end: this.spanFrom(node.start) };
        continue;
      }
      break;
    }
    return node;
  }

  private skipBracketed(open: string, close: string): void {
    if (this.peek()?.text !== open) {
      return;
    }
    this.next();
    let depth = 1;
    while (depth > 0) {
      const t = this.next();
      if (t === undefined) {
        break;
      }
      if (t.kind === "punct" && t.text === open) {
        depth += 1;
      } else if (t.kind === "punct" && t.text === close) {
        depth -= 1;
      }
    }
  }

  private parsePrimary(): ExprNode {
    const t = this.peek();
    if (t === undefined) {
      const end = this.source.length;
      return { kind: "unknown", start: end, end };
    }
    if (t.kind === "str" || t.kind === "num") {
      this.next();
      return { kind: "literal", start: t.start, end: t.end };
    }
    if (t.kind === "template") {
      this.next();
      return { kind: "template", start: t.start, end: t.end };
    }
    if (t.kind === "query") {
      this.next();
      return { kind: "query", start: t.start, end: t.end };
    }
    if (t.kind === "ident") {
      this.next();
      if (t.text === "true" || t.text === "false" || t.text === "null") {
        return { kind: "literal", start: t.start, end: t.end };
      }
      // `Ident { ... }` — a named-object literal.
      if (this.peek()?.text === "{") {
        const obj = this.parseObjectBody(t.start);
        return obj;
      }
      return { kind: "ident", start: t.start, end: t.end };
    }
    if (t.kind === "punct") {
      if (t.text === "(") {
        this.next();
        const inner = this.parseTernary();
        if (this.peek()?.text === ")") {
          this.next();
        }
        return inner;
      }
      if (t.text === "[") {
        return this.parseArray(t.start);
      }
      if (t.text === "{") {
        return this.parseObjectBody(t.start);
      }
    }
    // Unexpected token: consume and report unknown.
    this.next();
    return { kind: "unknown", start: t.start, end: t.end };
  }

  private parseArray(start: number): ExprNode {
    this.next(); // `[`
    const elements: ExprNode[] = [];
    while (this.peek() !== undefined && this.peek()?.text !== "]") {
      elements.push(this.parseTernary());
      if (this.peek()?.text === ",") {
        this.next();
      } else {
        break;
      }
    }
    if (this.peek()?.text === "]") {
      this.next();
    }
    return { kind: "array", elements, start, end: this.spanFrom(start) };
  }

  private parseObjectBody(start: number): ExprNode {
    this.next(); // `{`
    const fieldValues: ExprNode[] = [];
    while (this.peek() !== undefined && this.peek()?.text !== "}") {
      // FieldName `:` value.
      const key = this.peek();
      if (key !== undefined && key.kind === "ident") {
        this.next();
      } else {
        this.next();
        continue;
      }
      if (this.peek()?.text === ":") {
        this.next();
        fieldValues.push(this.parseTernary());
      }
      if (this.peek()?.text === ",") {
        this.next();
      } else {
        break;
      }
    }
    if (this.peek()?.text === "}") {
      this.next();
    }
    return { kind: "object", fieldValues, start, end: this.spanFrom(start) };
  }
}

/**
 * Whether a `neg` node's OPERAND is itself a numeric literal — the only
 * operand the unary-`-` carve-out admits (grammar.md §"Theta literal
 * sublanguage": `PrimitiveLit ::= … | "-" NUMBER`; §"Forbidden inside a
 * literal": "Operators other than the unary `-` carve-out for numeric
 * literals"). SHARED by `firstNonLiteral`'s `neg` arm and
 * `primitiveLiteralType`'s `neg` arm so the is-literal check and the compat
 * reader can never disagree: an operand this declines is refused by the
 * first and typed by neither.
 */
function isNumericLiteralOperand(operand: ExprNode, source: string): boolean {
  if (operand.kind !== "literal") {
    return false;
  }
  const primitive = literalPrimitiveOf(source.slice(operand.start, operand.end));
  return primitive === "integer" || primitive === "number";
}

/**
 * Pre-order walk returning the first sub-expression outside the literal
 * sublanguage, or `undefined` when the whole expression is a literal. Admitted
 * container literals (array, bare/named object) recurse into their members; an
 * `Enum.Variant` member access (`Ident "." Ident`) and a unary `-` on a NUMERIC
 * literal are admitted carve-outs — `source` lets the `neg` arm read the
 * operand's own span through `isNumericLiteralOperand`.
 */
function firstNonLiteral(node: ExprNode, source: string): ExprNode | undefined {
  switch (node.kind) {
    case "literal":
      return undefined;
    case "neg":
      // The carve-out is numeric only, so a string, boolean or `null`
      // operand is refused as the `neg` node itself — its own span is what
      // the diagnostic interpolates. Shared with `primitiveLiteralType`'s
      // `neg` arm via `isNumericLiteralOperand`: the two readers of this
      // position move together.
      return isNumericLiteralOperand(node.operand, source) ? undefined : node;
    case "member":
      // `Enum.Variant` only — the head must be a bare identifier (one level).
      return node.objectIsIdent ? undefined : node;
    case "array":
      for (const el of node.elements) {
        const bad = firstNonLiteral(el, source);
        if (bad !== undefined) {
          return bad;
        }
      }
      return undefined;
    case "object":
      for (const v of node.fieldValues) {
        const bad = firstNonLiteral(v, source);
        if (bad !== undefined) {
          return bad;
        }
      }
      return undefined;
    default:
      // ident, call, index, binary, ternary, template, query, unary-other,
      // unknown — all outside the literal sublanguage.
      return node;
  }
}

/**
 * The declared shape of the LHS / variant schema a constructor literal targets:
 * its name (for the diagnostic message) and the set of declared (required)
 * field names. Discriminator fields in discriminated-union-variant constructors
 * are supplied by the variant schema and are not listed here.
 */
export interface ObjectSchemaSpec {
  readonly name: string;
  readonly fields: readonly string[];
}

/**
 * Check that a bare- or named-object literal supplies every declared field of
 * its schema. A field declared by `schema` but absent from `presentFields`
 * fires `theta/parse/missing-object-field` (partial defaults are not supported);
 * field order is free. Returns one diagnostic per omitted field, in declared
 * order.
 *
 * V2a-T stubs this as an inert no-op (returns no diagnostics); the paired V2a
 * implementation leaf computes the omitted-field set.
 */
export function checkObjectLiteralFields(
  schema: ObjectSchemaSpec,
  presentFields: readonly string[],
  site: LiteralCheckSite,
): Diagnostic[] {
  const present = new Set(presentFields);
  const diagnostics: Diagnostic[] = [];
  for (const field of schema.fields) {
    if (!present.has(field)) {
      diagnostics.push({
        severity: "error",
        code: "theta/parse/missing-object-field",
        file: site.file,
        range: site.range,
        message: `missing field '${field}' on schema '${schema.name}'`,
      });
    }
  }
  return diagnostics;
}

/**
 * Whether `source` — a `params:` default RHS — carries a raw `\n` inside a
 * string-literal SPAN (single- or double-quoted), the predicate
 * `theta/parse/literal-newline-in-string` refuses in body code: the lexer's
 * own string scan (`../lexer/lexer.ts`) terminates a quoted span on the same
 * byte (`text[i] !== "\n"`), because a regular string is single-line only
 * (lexical.md §String literals). Bug 0102 — the `params:` default RHS is a
 * strict subset of the same expression grammar, so this position refuses what
 * body code refuses.
 *
 * The subject is `tokeniseExpr`'s own `str` tokens, read only, because that
 * tokeniser already decides where a string span begins and ends at this
 * position and two answers cannot disagree:
 *
 *   - A `str` token's `text` is the raw source slice over the whole span, so a
 *     break ANYWHERE inside it is present — including one sitting immediately
 *     after a backslash. lexical.md §String literals gives the escape table
 *     and makes a backslash before any other character
 *     `theta/parse/illegal-escape`, so a backslash before a line terminator
 *     forms no escape unit and the terminator is raw.
 *   - Backtick templates, `@`...`` query templates and bare `${...}`
 *     interpolations are single opaque tokens there, so a quote inside one
 *     opens no span. Each of those forms is outside the literal sublanguage on
 *     its own terms and draws `theta/parse/default-not-literal`
 *     (frontmatter-fields-a.md §Defaults); a break inside one is not a literal
 *     newline in a string literal, and asserting one would put this code's
 *     emission set past its registry Trigger.
 *
 * The predicate is the SPAN, not the presence of a break anywhere in `source`:
 * a break that is inter-token whitespace inside an `ArrayLit` or an object
 * literal, or the two-character `\n` escape, is untouched, which is what keeps
 * a grammar-admitted multi-line form (bug 0041's round-1 adjudication) out of
 * the refused set. `source` is otherwise unconstrained —
 * this is a diagnostic predicate, not a parse, so a malformed span (an opening
 * quote with no match) still terminates: `tokeniseExpr` runs such a span to
 * end of text and pushes it as one `str` token.
 *
 * `tokeniseExpr` is CALLED, never edited: it is shared with
 * `isBareObjectLiteral`, whose only caller (`../runtime/tool-call.ts`) reads a
 * verdict on an unrelated position and needs the scanner byte-stable.
 */
export function hasRawNewlineInStringLiteral(source: string): boolean {
  return tokeniseExpr(source).some((token) => token.kind === "str" && token.text.includes("\n"));
}

/**
 * The static type of a `params:` default RHS, as the compatibility relation
 * `⊑` sees it (type-system.md §"Type compatibility"), or `undefined` when this
 * position cannot decide it.
 *
 * WHY it lives here: this module already owns the one tokeniser and parser that
 * decide what the default RHS *is* at this position, and a second reader of the
 * same bytes could disagree with the is-literal verdict `checkLiteralSublanguage`
 * renders one call earlier. The node shape is therefore shared and the primitive
 * a `literal` node types as is read back off its own source span.
 *
 * The decided set is exactly two shapes, the ones the
 * `theta/parse/params-default-type-mismatch` registry Trigger enumerates
 * (diagnostics/code-registry-parse.md): a primitive literal — `string` /
 * `number` / `boolean` / `null`, a unary-`-` numeric literal included — and a
 * FLAT array literal every element of which is such a literal, all typing as
 * one primitive.
 *
 * `undefined` is the deliberate deferral, not a failure: it covers every form
 * whose static type this position does not establish — an `Enum.Variant` or a
 * schema-constructor default, a bare object literal (whose schema comes from the
 * param's declared type, frontmatter-fields-a.md §Defaults), an empty,
 * heterogeneous or NESTED array literal, and any source outside the literal
 * sublanguage (already refused by `checkLiteralSublanguage`) or spelling no
 * expression at all. The relation reports `"unknown"` for an undecidable
 * operand and its sinks emit nothing, so deferring here and deferring there
 * agree.
 *
 * WHY the decided set stops at the flat case: that Trigger is the emission set
 * the registered code is licensed for (GOV-15 admits a code addition exactly on
 * the inputs the row names), so deciding a shape the row does not name would
 * put the emission past its own Trigger — and the deferral the row's own
 * closing sentence prescribes is not a hole: the post-default-merge AJV hook
 * (binder/defaulting-system-note-echo.md, enforcement point #4) validates the
 * merged value at invocation. A recursive reading also cannot report itself
 * honestly: an element type taken from one element is not a type the rest of
 * the list need share, so `[[1], ["x"]]` under `array<array<string>>` would
 * render an `<actual>` of `array<array<integer>>` that no reader could relate
 * to the bytes.
 */
export function defaultLiteralStaticType(source: string): CompatType | undefined {
  const tokens = tokeniseExpr(source);
  const parser = new ExprParser(tokens, source);
  const node = parser.parse();
  if (node === undefined) {
    return undefined;
  }
  const primitive = primitiveLiteralType(node, source);
  if (primitive !== undefined) {
    return primitive;
  }
  return node.kind === "array" ? flatArrayStaticType(node.elements, source) : undefined;
}

/**
 * The `CompatType` of one PRIMITIVE literal node, read off its own source span.
 * A `neg` node types as its operand, and only when `isNumericLiteralOperand`
 * admits that operand — the same predicate `firstNonLiteral`'s `neg` arm
 * applies, so this reader can never assign a type to a form the is-literal
 * check refuses: `-1` types as `1` does, while `-true` and `-[1]` — both
 * refused by `checkLiteralSublanguage` — type as nothing. Container literals
 * are not primitives and answer `undefined` here.
 */
function primitiveLiteralType(
  node: ExprNode,
  source: string,
): { readonly kind: "literal"; readonly typesAs: PrimitiveName } | undefined {
  if (node.kind === "neg") {
    return isNumericLiteralOperand(node.operand, source)
      ? primitiveLiteralType(node.operand, source)
      : undefined;
  }
  if (node.kind === "literal") {
    return { kind: "literal", typesAs: literalPrimitiveOf(source.slice(node.start, node.end)) };
  }
  return undefined;
}

/**
 * The element type of a FLAT homogeneous array literal: every element is a
 * primitive literal and they all type as the same primitive. Anything else —
 * an empty list (no element type is named), a mixed list (more than one is
 * named), a nested array literal, an object / `Enum.Variant` / non-literal
 * element — defers, because it is outside the shape the Trigger decides.
 *
 * Sameness is the ELEMENT's own primitive, which keeps `integer` and `number`
 * distinct: `array<integer> = [1.5]` stays decidable as `array<number>` and
 * draws `theta/parse/integer-narrowing` through TYPE-7's element-wise
 * covariance, the direction frontmatter-fields-a.md §Defaults names by code.
 * Reconciling `[1, 1.5]` into one element type instead would need the
 * array/ternary common-type machinery, which is the type layer's and not this
 * position's.
 */
function flatArrayStaticType(
  elements: readonly ExprNode[],
  source: string,
): CompatType | undefined {
  const first = elements[0];
  if (first === undefined) {
    return undefined;
  }
  const element = primitiveLiteralType(first, source);
  if (element === undefined) {
    return undefined;
  }
  for (const other of elements.slice(1)) {
    const type = primitiveLiteralType(other, source);
    if (type === undefined || type.typesAs !== element.typesAs) {
      return undefined;
    }
  }
  return { kind: "array", element };
}

/**
 * Which primitive a `literal` node's own source span types as (TYPE-3). The
 * span is exactly one `str`, `num`, or `true`/`false`/`null` token, so the
 * leading byte decides every case but the numeric split: a numeric literal
 * types as `integer` only when it spells no fractional or exponent part, which
 * is the `integer ⊑ number` direction TYPE-2 makes one-way.
 */
function literalPrimitiveOf(span: string): PrimitiveName {
  const text = span.trim();
  const head = text[0] ?? "";
  if (head === '"' || head === "'") {
    return "string";
  }
  if (text === "true" || text === "false") {
    return "boolean";
  }
  if (text === "null") {
    return "null";
  }
  return /^[0-9]+$/.test(text) ? "integer" : "number";
}
