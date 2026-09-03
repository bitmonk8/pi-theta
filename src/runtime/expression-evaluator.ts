// V3a / V3a-T — the expression-evaluator seam.
//
// This module owns the theta expression interpreter and the one type-phase
// boolean-position check the expression sublanguage needs (expressions.md — the
// EXPR code-keyed obligation area, plus the `theta/parse/non-boolean-condition`
// diagnostic of expressions.md §Truthiness). The interpreter is the bounded
// TypeScript-subset evaluator described in expressions.md §"Supported forms":
//
//   - literals, parenthesised sub-expressions, identifier reads, and `f(args)`
//     calls;
//   - unary `!` / `-`, binary arithmetic `+ - * / %`, comparison `< <= > >=`,
//     equality `== !=`, logical `&& ||`, and the ternary `cond ? a : b`, with
//     the precedence and associativity of expressions.md §"Operator precedence"
//     (highest→lowest: postfix/access, unary, `* / %`, `+ -`, ordering,
//     equality, `&&`, `||`, ternary);
//   - left-to-right evaluation with `&&` / `||` short-circuit and ternary
//     branch selection, so a short-circuited / not-taken operand's observable
//     effect (its calls) does not run (expressions.md §"Evaluation order and
//     short-circuiting");
//   - structural `==` / `!=` via the V2c `valuesEqual` relation — a cross-type
//     pair evaluates `false`, never panicking (expressions.md §Equality);
//   - arithmetic with the `integer ⊑ number` widening (TYPE-2) and the
//     non-panicking div/mod-by-zero disposition: `/` always yields `number`,
//     `n / 0` is `±Infinity`, `0 / 0` and `n % 0` are `NaN`, and no integer
//     overflow or div/mod-by-zero panics (expressions.md §"Other arithmetic");
//   - ordering by signed IEEE-754 value / UTF-16 code unit, with every ordering
//     operator against `NaN` evaluating `false` (expressions.md §"Ordering
//     comparisons").
//
// Boolean position: `&&` / `||` operands, the ternary condition, and the `if` /
// `while` scrutinees accept only `boolean`; theta performs no truthiness
// coercion, so a non-`boolean` there is `theta/parse/non-boolean-condition`, a
// `type`-phase parse diagnostic (expressions.md §Truthiness). `checkBooleanPosition`
// is the per-site checker that reports it, mirroring the V2b per-site checkers.
//
// V3a-T (tests-task) declares the seam — the `EvalHost` collaborator, the
// `evaluateSource` entry point, and the `checkBooleanPosition` type-phase
// checker — and stubs the behaviour-bearing functions inertly so the failing
// tests compile and red on their own primary assertions:
//
//   - `evaluateSource` returns the inert `null` sentinel without parsing,
//     evaluating, or calling the host, so every result-value assertion reds
//     (a precedence result, an equality/ordering/arithmetic value) and the
//     short-circuit observability assertion reds because the must-run operand's
//     call is never recorded;
//   - `checkBooleanPosition` returns no diagnostics, so the
//     `theta/parse/non-boolean-condition` assertion reds on its absent
//     diagnostic.
//
// No test reds on a compile error, a missing fixture, or a harness throw. The
// paired V3a implementation leaf fills these in.

import type { Diagnostic } from "../diagnostics/diagnostic";
import {
  checkCompatible,
  classifyIndexReceiver,
  type CompatSite,
  type CompatType,
  type TypeEnv,
} from "../parser/type-compat";
import { valuesEqual, type ThetaValue } from "./value";

/**
 * The host the expression interpreter resolves names and effects through. Kept
 * out of the evaluator so identifier reads and calls (the observable effects
 * short-circuiting governs) are injected, not ambient.
 *
 *   - `resolveIdentifier` resolves a bare identifier read to its bound value,
 *     in the expressions.md §"Identifier resolution" order (local `let` /
 *     parameter > top-level `fn` > import > callable). The evaluator calls it
 *     only for identifier-read positions.
 *   - `callFunction` performs a call `f(args)` and returns its value. It is the
 *     observable effect short-circuiting and ternary branch selection must
 *     skip: a short-circuited / not-taken call is never invoked.
 */
export interface EvalHost {
  resolveIdentifier(name: string): ThetaValue;
  callFunction(name: string, args: readonly ThetaValue[]): ThetaValue;
}

/**
 * Parse and evaluate a single theta expression `source` against `host`, per the
 * expressions.md operator-precedence table, left-to-right short-circuit /
 * ternary evaluation order, structural equality, and the arithmetic / ordering
 * rules. Never panics on div/mod-by-zero (it yields `±Infinity` / `NaN`).
 *
 * V3a-T stubs this as the inert `null` sentinel: it neither parses nor
 * evaluates `source` and never touches `host`, so every value assertion reds on
 * its own primary expectation and the short-circuit must-run assertion reds
 * because the host call is never recorded. The paired V3a leaf implements it.
 */
export function evaluateSource(source: string, host: EvalHost): ThetaValue {
  const tokens = tokenize(source);
  const parser = new ExprParser(tokens);
  const ast = parser.parseProgram();
  return evaluateNode(ast, host);
}

// --- Tokenizer -------------------------------------------------------------
//
// A self-contained tokenizer for the bounded expression grammar of
// expressions.md §"Supported forms": number / string / boolean / null
// literals, identifiers, the call / paren punctuators, and the unary, binary,
// logical, and ternary operators of the §"Operator precedence" table. The
// evaluator owns its own tokenizer rather than coupling to the statement lexer
// so the interpreter seam stays self-contained.

type TokenKind = "number" | "string" | "ident" | "op" | "eof";

interface Token {
  readonly kind: TokenKind;
  readonly text: string;
  /** Pre-computed value for `number` / `string` literals. */
  readonly value?: number | string;
}

/** The multi-character operators, longest first so the scanner is greedy. */
const MULTI_CHAR_OPS = ["<=", ">=", "==", "!=", "&&", "||"] as const;
const SINGLE_CHAR_OPS = "+-*/%<>!?:(),";

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = source.length;

  while (i < n) {
    const c = source[i] as string;

    // Whitespace (including the newline-continuation form — the expression is a
    // single logical line here, so any inter-token whitespace is insignificant).
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i += 1;
      continue;
    }

    // String literal (single- or double-quoted), with the JS escape set the
    // lexer admits restricted to what an expression literal needs.
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      let text = "";
      while (j < n && source[j] !== quote) {
        if (source[j] === "\\" && j + 1 < n) {
          const esc = source[j + 1] as string;
          text += unescape(esc);
          j += 2;
          continue;
        }
        text += source[j];
        j += 1;
      }
      if (j >= n) {
        throw new ExprSyntaxError(`unterminated string literal in '${source}'`);
      }
      tokens.push({ kind: "string", text: source.slice(i, j + 1), value: text });
      i = j + 1;
      continue;
    }

    // Number literal: digits with an optional fractional part. Sign is handled
    // by the unary-`-` production, not the tokenizer.
    if (c >= "0" && c <= "9") {
      let j = i;
      while (j < n && source[j] !== undefined && /[0-9]/.test(source[j] as string)) {
        j += 1;
      }
      if (j < n && source[j] === ".") {
        j += 1;
        while (j < n && /[0-9]/.test(source[j] as string)) {
          j += 1;
        }
      }
      const text = source.slice(i, j);
      tokens.push({ kind: "number", text, value: Number(text) });
      i = j;
      continue;
    }

    // Identifier / keyword: starts with a letter or `_`, continues with word
    // characters.
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_]/.test(source[j] as string)) {
        j += 1;
      }
      tokens.push({ kind: "ident", text: source.slice(i, j) });
      i = j;
      continue;
    }

    // Multi-character operators before single-character ones.
    const two = source.slice(i, i + 2);
    if ((MULTI_CHAR_OPS as readonly string[]).includes(two)) {
      tokens.push({ kind: "op", text: two });
      i += 2;
      continue;
    }
    if (SINGLE_CHAR_OPS.includes(c)) {
      tokens.push({ kind: "op", text: c });
      i += 1;
      continue;
    }

    throw new ExprSyntaxError(`unexpected character '${c}' in '${source}'`);
  }

  tokens.push({ kind: "eof", text: "" });
  return tokens;
}

function unescape(esc: string): string {
  switch (esc) {
    case "n":
      return "\n";
    case "t":
      return "\t";
    case "r":
      return "\r";
    case "\\":
      return "\\";
    case '"':
      return '"';
    case "'":
      return "'";
    default:
      return esc;
  }
}

/** A malformed expression source — surfaced to the caller, never swallowed. */
class ExprSyntaxError extends Error {}

// --- AST -------------------------------------------------------------------

type Node =
  | { readonly kind: "lit"; readonly value: ThetaValue }
  | { readonly kind: "ident"; readonly name: string }
  | { readonly kind: "call"; readonly name: string; readonly args: readonly Node[] }
  | { readonly kind: "unary"; readonly op: "!" | "-"; readonly operand: Node }
  | {
      readonly kind: "binary";
      readonly op: "+" | "-" | "*" | "/" | "%" | "<" | "<=" | ">" | ">=" | "==" | "!=";
      readonly left: Node;
      readonly right: Node;
    }
  | { readonly kind: "logical"; readonly op: "&&" | "||"; readonly left: Node; readonly right: Node }
  | { readonly kind: "ternary"; readonly cond: Node; readonly then: Node; readonly otherwise: Node };

// --- Parser ----------------------------------------------------------------
//
// Recursive descent over the expressions.md §"Operator precedence" table
// (highest→lowest): primary/call (level 1), unary `!` / `-` (level 2,
// right-associative), `* / %` (level 3, left), `+ -` (level 4, left), ordering
// `< <= > >=` (level 5, non-associative), equality `== !=` (level 6,
// non-associative), `&&` (level 7, left), `||` (level 8, left), and the ternary
// `?:` (level 9, right-associative).

class ExprParser {
  private pos = 0;

  constructor(private readonly tokens: readonly Token[]) {}

  parseProgram(): Node {
    const node = this.parseTernary();
    if (this.peek().kind !== "eof") {
      throw new ExprSyntaxError(`unexpected trailing token '${this.peek().text}'`);
    }
    return node;
  }

  private peek(): Token {
    return this.tokens[this.pos] as Token;
  }

  private next(): Token {
    const t = this.tokens[this.pos] as Token;
    this.pos += 1;
    return t;
  }

  private isOp(text: string): boolean {
    const t = this.peek();
    return t.kind === "op" && t.text === text;
  }

  private expectOp(text: string): void {
    if (!this.isOp(text)) {
      throw new ExprSyntaxError(`expected '${text}' but found '${this.peek().text}'`);
    }
    this.next();
  }

  // Level 9 — ternary, right-associative.
  private parseTernary(): Node {
    const cond = this.parseOr();
    if (this.isOp("?")) {
      this.next();
      const then = this.parseTernary();
      this.expectOp(":");
      const otherwise = this.parseTernary();
      return { kind: "ternary", cond, then, otherwise };
    }
    return cond;
  }

  // Level 8 — `||`, left-associative.
  private parseOr(): Node {
    let left = this.parseAnd();
    while (this.isOp("||")) {
      this.next();
      const right = this.parseAnd();
      left = { kind: "logical", op: "||", left, right };
    }
    return left;
  }

  // Level 7 — `&&`, left-associative.
  private parseAnd(): Node {
    let left = this.parseEquality();
    while (this.isOp("&&")) {
      this.next();
      const right = this.parseEquality();
      left = { kind: "logical", op: "&&", left, right };
    }
    return left;
  }

  // Level 6 — `== !=`, non-associative (a single operator, no chaining).
  private parseEquality(): Node {
    const left = this.parseComparison();
    if (this.isOp("==") || this.isOp("!=")) {
      const op = this.next().text as "==" | "!=";
      const right = this.parseComparison();
      return { kind: "binary", op, left, right };
    }
    return left;
  }

  // Level 5 — `< <= > >=`, non-associative (a single operator, no chaining).
  private parseComparison(): Node {
    const left = this.parseAdditive();
    if (this.isOp("<") || this.isOp("<=") || this.isOp(">") || this.isOp(">=")) {
      const op = this.next().text as "<" | "<=" | ">" | ">=";
      const right = this.parseAdditive();
      return { kind: "binary", op, left, right };
    }
    return left;
  }

  // Level 4 — `+ -`, left-associative.
  private parseAdditive(): Node {
    let left = this.parseMultiplicative();
    while (this.isOp("+") || this.isOp("-")) {
      const op = this.next().text as "+" | "-";
      const right = this.parseMultiplicative();
      left = { kind: "binary", op, left, right };
    }
    return left;
  }

  // Level 3 — `* / %`, left-associative.
  private parseMultiplicative(): Node {
    let left = this.parseUnary();
    while (this.isOp("*") || this.isOp("/") || this.isOp("%")) {
      const op = this.next().text as "*" | "/" | "%";
      const right = this.parseUnary();
      left = { kind: "binary", op, left, right };
    }
    return left;
  }

  // Level 2 — unary `!` / `-`, right-associative.
  private parseUnary(): Node {
    if (this.isOp("!") || this.isOp("-")) {
      const op = this.next().text as "!" | "-";
      const operand = this.parseUnary();
      return { kind: "unary", op, operand };
    }
    return this.parsePrimary();
  }

  // Level 1 — literals, identifiers, calls, and parenthesised sub-expressions.
  private parsePrimary(): Node {
    const t = this.peek();

    if (t.kind === "number") {
      this.next();
      return { kind: "lit", value: t.value as number };
    }
    if (t.kind === "string") {
      this.next();
      return { kind: "lit", value: t.value as string };
    }
    if (t.kind === "op" && t.text === "(") {
      this.next();
      const inner = this.parseTernary();
      this.expectOp(")");
      return inner;
    }
    if (t.kind === "ident") {
      this.next();
      if (t.text === "true") {
        return { kind: "lit", value: true };
      }
      if (t.text === "false") {
        return { kind: "lit", value: false };
      }
      if (t.text === "null") {
        return { kind: "lit", value: null };
      }
      // A call `name(args)` vs a bare identifier read.
      if (this.isOp("(")) {
        this.next();
        const args: Node[] = [];
        if (!this.isOp(")")) {
          args.push(this.parseTernary());
          while (this.isOp(",")) {
            this.next();
            args.push(this.parseTernary());
          }
        }
        this.expectOp(")");
        return { kind: "call", name: t.text, args };
      }
      return { kind: "ident", name: t.text };
    }

    throw new ExprSyntaxError(`unexpected token '${t.text}'`);
  }
}

// --- Evaluator -------------------------------------------------------------
//
// Left-to-right evaluation with `&&` / `||` short-circuit and ternary
// branch-selection, so a short-circuited or not-taken operand's call is never
// invoked (expressions.md §"Evaluation order and short-circuiting"). Equality
// routes through the V2c structural relation; arithmetic and ordering use the
// host's native IEEE-754 semantics, so div/mod-by-zero yields `±Infinity` /
// `NaN` and ordering against `NaN` yields `false`, neither panicking
// (expressions.md §"Other arithmetic" / §"Ordering comparisons").

function evaluateNode(node: Node, host: EvalHost): ThetaValue {
  switch (node.kind) {
    case "lit":
      return node.value;
    case "ident":
      return host.resolveIdentifier(node.name);
    case "call": {
      // Arguments evaluate left-to-right before the call (expressions.md
      // §"Evaluation order and short-circuiting").
      const args = node.args.map((arg) => evaluateNode(arg, host));
      return host.callFunction(node.name, args);
    }
    case "unary": {
      const operand = evaluateNode(node.operand, host);
      if (node.op === "!") {
        return !(operand as boolean);
      }
      // Unary `-` on a numeric operand; the `integer ⊑ number` widening keeps
      // the JS double representation either way.
      return -(operand as number);
    }
    case "logical":
      return evaluateLogical(node, host);
    case "ternary": {
      // Evaluate the condition, then only the taken branch — the not-taken
      // branch's call does not run.
      const cond = evaluateNode(node.cond, host);
      return cond === true ? evaluateNode(node.then, host) : evaluateNode(node.otherwise, host);
    }
    case "binary":
      return evaluateBinary(node, host);
  }
}

function evaluateLogical(
  node: { readonly op: "&&" | "||"; readonly left: Node; readonly right: Node },
  host: EvalHost,
): ThetaValue {
  const left = evaluateNode(node.left, host) as boolean;
  if (node.op === "&&") {
    // `&&` evaluates the right operand only when the left is `true`; both
    // operands are `boolean`, so the result is the right value or `false`.
    return left === true ? (evaluateNode(node.right, host) as boolean) : false;
  }
  // `||` evaluates the right operand only when the left is `false`.
  return left === false ? (evaluateNode(node.right, host) as boolean) : true;
}

function evaluateBinary(
  node: {
    readonly op: "+" | "-" | "*" | "/" | "%" | "<" | "<=" | ">" | ">=" | "==" | "!=";
    readonly left: Node;
    readonly right: Node;
  },
  host: EvalHost,
): ThetaValue {
  // Operands evaluate left-to-right (expressions.md §"Evaluation order").
  const a = evaluateNode(node.left, host);
  const b = evaluateNode(node.right, host);

  switch (node.op) {
    case "==":
      // Structural equality via the V2c relation; a cross-type pair is `false`,
      // never a panic (expressions.md §Equality).
      return valuesEqual(a, b);
    case "!=":
      return !valuesEqual(a, b);
    case "+":
      // `+` is concatenation on two `string` operands, addition otherwise. The
      // `integer ⊑ number` widening is implicit in the JS double type.
      if (typeof a === "string" && typeof b === "string") {
        return a + b;
      }
      return (a as number) + (b as number);
    case "-":
      return (a as number) - (b as number);
    case "*":
      return (a as number) * (b as number);
    case "/":
      // `/` always produces `number`; `n / 0` is `±Infinity`, `0 / 0` is `NaN`,
      // neither panicking (expressions.md §"Other arithmetic").
      return (a as number) / (b as number);
    case "%":
      // Modulo by zero is `NaN`, not a panic (expressions.md §"Other arithmetic").
      return (a as number) % (b as number);
    case "<":
    case "<=":
    case ">":
    case ">=":
      // Numeric (signed IEEE-754) or string (UTF-16 code-unit) ordering. Any
      // ordering against `NaN` is `false` — the host comparison operators
      // already yield `false` for every `NaN` pairing (expressions.md
      // §"Ordering comparisons").
      return compareOrdered(node.op, a, b);
  }
}

function compareOrdered(
  op: "<" | "<=" | ">" | ">=",
  a: ThetaValue,
  b: ThetaValue,
): boolean {
  // Both operands are either numeric or string by the parse-time orderable
  // check; the host relational operators carry the signed-numeric / code-unit
  // ordering and the `NaN`-unordered (`false`) disposition directly.
  const x = a as number | string;
  const y = b as number | string;
  switch (op) {
    case "<":
      return x < y;
    case "<=":
      return x <= y;
    case ">":
      return x > y;
    case ">=":
      return x >= y;
  }
}

/**
 * The boolean positions of expressions.md §Truthiness: the `if` / `while`
 * scrutinees, the ternary condition, the `&&` / `||` operands, and the unary
 * `!` operand. Each accepts only `boolean`; a non-`boolean` there is
 * `theta/parse/non-boolean-condition`.
 */
export type BooleanPosition = "if" | "while" | "ternary-condition" | "&&" | "||" | "!";

/**
 * The type-phase boolean-position check. Reports
 * `theta/parse/non-boolean-condition` for any of the six `BooleanPosition`
 * values above (`if` / `while` / ternary condition, `&&` / `||` operand, or
 * the unary `!` operand) whose static type is other than `boolean` — theta
 * performs no truthiness coercion (expressions.md §Truthiness). Returns no
 * diagnostic for a `boolean`-typed operand.
 *
 * V3a-T stubs this inert (no diagnostics); the paired V3a leaf fills it in.
 */
export function checkBooleanPosition(opts: {
  readonly position: BooleanPosition;
  readonly operandType: CompatType;
  readonly site: CompatSite;
}): Diagnostic[] {
  const { operandType, site } = opts;

  // Only `boolean` is admissible in boolean position; theta performs no
  // truthiness coercion. Routed through the V2b `⊑` relation against `boolean`:
  // a `boolean` (or a boolean literal) is `compatible`; a statically
  // unresolvable operand is `unknown` and deferred to the bug 0369 runtime
  // belt (`BooleanPositionKindDefectError`, statement-executor.ts /
  // production-theta-producer.ts) (it raises nothing here); anything else
  // fires the diagnostic.
  const booleanType: CompatType = { kind: "prim", name: "boolean" };
  const r = checkCompatible(operandType, booleanType, {});
  if (r === "compatible" || r === "unknown") {
    return [];
  }

  // Message from diagnostics/code-registry-parse.md (`theta/parse/non-boolean-condition`).
  return [
    {
      severity: "error",
      code: "theta/parse/non-boolean-condition",
      file: site.file,
      range: site.range,
      message: `condition must be boolean; got ${displayCompatType(operandType)}`,
    },
  ];
}

/**
 * The type-phase indexed-access receiver check (expressions.md §"Supported
 * forms"). Reports `theta/parse/non-indexable-receiver` when the receiver `a` of
 * an `a[k]` index expression is neither `array<T>` nor an object value — e.g.
 * `s[i]` on a `string`. Returns no diagnostic for an `array<T>` or object
 * receiver, or a statically-unresolvable one (deferred to the runtime safety
 * net).
 */
export function checkIndexReceiver(opts: {
  readonly receiverType: CompatType;
  readonly env: TypeEnv;
  readonly site: CompatSite;
}): Diagnostic | undefined {
  const { receiverType, env, site } = opts;
  if (classifyIndexReceiver(receiverType, env) !== "primitive") {
    return undefined;
  }
  // Message from diagnostics/code-registry-parse.md (`theta/parse/non-indexable-receiver`).
  return {
    severity: "error",
    code: "theta/parse/non-indexable-receiver",
    file: site.file,
    range: site.range,
    message: `indexed access requires an array<T> or object receiver; got ${displayCompatType(
      receiverType,
    )}`,
  };
}

/**
 * Render a `CompatType` to the display name the `theta/parse/non-boolean-condition`
 * *Message* string interpolates (`condition must be boolean; got <type>`).
 */
function displayCompatType(type: CompatType): string {
  switch (type.kind) {
    case "prim":
      return type.name;
    case "literal":
      return type.typesAs;
    case "named":
      return type.name;
    case "array":
      return `array<${displayCompatType(type.element)}>`;
    case "union":
      return type.arms.map(displayCompatType).join(" | ");
    case "object":
      return `{ ${type.fields
        .map((f) => `${f.name}: ${displayCompatType(f.type)}`)
        .join(", ")} }`;
  }
}
