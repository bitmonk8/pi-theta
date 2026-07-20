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
  const offending = firstNonLiteral(node);
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
 * Pre-order walk returning the first sub-expression outside the literal
 * sublanguage, or `undefined` when the whole expression is a literal. Admitted
 * container literals (array, bare/named object) recurse into their members; an
 * `Enum.Variant` member access (`Ident "." Ident`) and a unary `-` on a numeric
 * literal are admitted carve-outs.
 */
function firstNonLiteral(node: ExprNode): ExprNode | undefined {
  switch (node.kind) {
    case "literal":
      return undefined;
    case "neg":
      // Unary `-` is admitted only on a numeric literal.
      return node.operand.kind === "literal" ? undefined : node;
    case "member":
      // `Enum.Variant` only — the head must be a bare identifier (one level).
      return node.objectIsIdent ? undefined : node;
    case "array":
      for (const el of node.elements) {
        const bad = firstNonLiteral(el);
        if (bad !== undefined) {
          return bad;
        }
      }
      return undefined;
    case "object":
      for (const v of node.fieldValues) {
        const bad = firstNonLiteral(v);
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
