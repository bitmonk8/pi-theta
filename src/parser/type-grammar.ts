// V2a / V2a-T — the type-grammar parser seam.
//
// This module owns the type-expression grammar of grammar.md §"Type grammar"
// and type-system.md: the primitive / named / generic (`array` arity 1,
// `Result` arity 2) / inline-object / union / literal type forms, the
// return-only `void` annotation, and the `array<T>` literal type-sink rule of
// grammar.md §"array<T> literal type-sink rule".
//
// The position-sensitive checks need the surrounding annotation context the
// tokeniser does not carry, so the seam takes an explicit `TypePosition`:
//
//   - `theta/parse/generic-arity-mismatch` — a closed-set generic constructor
//     (`array`/`Result`) applied with the wrong type-argument count; position-
//     independent.
//   - `theta/parse/void-in-non-return-position` — `void` in any `Type` position
//     other than a function/theta return type.
//   - `theta/parse/result-in-schema-position` — a `Result<T, E>` application in a
//     lowered-schema position (a schema field type, a `params:` field type, or
//     any type reachable transitively from those, including `array<T>` element
//     types and union arms).
//   - `theta/parse/empty-schema-body` — an inline object type (`{}`): a brace
//     interior carrying no token AND a consumed closing brace. `ObjectType`
//     spells that `}` (grammar.md §"Type grammar"), so an unterminated `{` is
//     no inline object type and carries no emptiness claim. Otherwise
//     unqualified by position and by nesting depth (grammar.md §"Inline object
//     types"). Shares its message and its construction with the
//     named-declaration case (`schema-declarations.ts`'s
//     `emptySchemaBodyDiagnostic`).
//
// A caller may select a narrower rule SET than all four checks
// (`parseTypeExpression`'s `rules` parameter; see `TypeCheckRules` below).
//
// The `array<T>` literal type-sink rule of grammar.md fires
// `theta/parse/array-no-common-type` when an `[]` / `[expr, ...]` literal has no
// resolving sink and its elements alone cannot determine a common type. The
// sink set is exhaustive (binding annotation, function parameter, surrounding
// constructor field, enclosing array element); the `for x in expr` iterand is
// explicitly NOT a sink.
//
// V2a-T (tests-task) declares these seam shapes and stubs the two checks as
// inert no-ops (no diagnostic produced) so the failing tests compile and red on
// their own primary assertions (the type-expression parser and sink-resolution
// engine are absent). The paired V2a implementation leaf fills them in.

import { type Diagnostic, type SourceRange } from "../diagnostics/diagnostic";
import { emptySchemaBodyDiagnostic } from "./schema-declarations";

/**
 * The annotation position a type expression occupies, which governs the
 * `void` and `Result` position rules of grammar.md §"Type grammar":
 *
 *   - `return`         — a function / theta return type: `void` is admitted here
 *                        and `Result` is admitted (not a lowered-schema site).
 *   - `value`          — a non-schema value position (`let` annotation, `fn`
 *                        parameter type, generic argument outside a lowered
 *                        schema, `invoke<T>` / type ascription, union arm):
 *                        `void` is rejected, `Result` is admitted.
 *   - `schema-feeding` — a lowered-schema position (a schema field type, a
 *                        `params:` field type, or any type transitively
 *                        reachable from those): both `void` and `Result` are
 *                        rejected.
 */
export type TypePosition = "return" | "value" | "schema-feeding";

/** A located site at which a type expression is parsed and checked. */
export interface TypeCheckSite {
  readonly file: string;
  readonly range: SourceRange;
}

/**
 * The rule SET `parseTypeExpression` applies:
 *
 *   - `"all"` (the default) — every check the seam owns, gated by `position`
 *     as documented on `walkType`.
 *   - `"inline-object-shape"` — the checks that constrain the SHAPE of an
 *     inline object type, independent of position and of the other three
 *     checks: today, exactly `theta/parse/empty-schema-body`'s
 *     empty-brace-interior rule. The walk still DESCENDS generic arguments,
 *     object field types and union arms under this selection — a nested `{}`
 *     is found at any depth — but withholds `void-in-non-return-position`,
 *     `generic-arity-mismatch` and `result-in-schema-position`, which stay
 *     `"all"`-only.
 *
 * A caller selects `"inline-object-shape"` when its position runs no other
 * type-grammar pass, so importing the other three checks in the same edit
 * would widen that position's emission set beyond the one rule being wired
 * (the `invoke<T>` return annotation is exactly this case: it selects this
 * rule alone, not the full walk — theta-document.ts's `walkExpr`, `"invoke"`
 * arm). The set is named after the SHAPE its member checks govern rather than
 * after any one rule, so a later fix adding a further inline-object-shape
 * check (the grammar's `ObjectType` clause also governs a repeated field
 * name within one inline object, a distinct rule from this one) widens this
 * same set and reuses the calls already selecting it, instead of adding a
 * parallel selector and a parallel call site.
 */
export type TypeCheckRules = "all" | "inline-object-shape";

/**
 * Parse a single type expression as written in source and apply the
 * position-sensitive type-grammar checks, returning every diagnostic raised
 * (in source order). The closed `GenericType` arity check
 * (`theta/parse/generic-arity-mismatch`) is position-independent; the
 * `theta/parse/void-in-non-return-position` and `theta/parse/result-in-schema-position`
 * checks consult `position`. `rules` (default `"all"`) narrows which checks
 * run — see `TypeCheckRules`.
 */
export function parseTypeExpression(
  source: string,
  position: TypePosition,
  site: TypeCheckSite,
  rules: TypeCheckRules = "all",
): Diagnostic[] {
  const tokens = tokeniseType(source);
  const parser = new TypeParser(tokens);
  const node = parser.parse();
  if (node === undefined) {
    return [];
  }
  const diagnostics: Diagnostic[] = [];
  walkType(node, true, position, rules, site, diagnostics);
  return diagnostics;
}

/** A type-expression AST node (only what the position checks need to walk). */
type TypeNode =
  | { readonly kind: "prim"; readonly name: string }
  | { readonly kind: "named"; readonly name: string }
  | { readonly kind: "void" }
  | { readonly kind: "literal" }
  | { readonly kind: "generic"; readonly ctor: string; readonly args: TypeNode[] }
  | {
      readonly kind: "object";
      readonly fieldTypes: TypeNode[];
      /**
       * The two halves of the empty-inline-object key. It is `fieldTypes.length
       * === 0` on neither half, and emptiness alone on neither:
       *
       *   - `interiorHasTokens` — whether the brace interior carried any token,
       *     read off the token immediately after `{`, before the field loop can
       *     consume it. The loop's tolerant recovery (a non-`ident` field name
       *     is skipped, a missing `:` breaks the loop) also yields an empty
       *     `fieldTypes` for a malformed-but-non-empty interior (`{ a }`,
       *     `{ "a": string }`, `{ a: }`), which the rule must not take with it.
       *   - `braceClosed` — whether a closing `}` was consumed.
       *     `ObjectType ::= "{" Field ("," Field)* ","? "}"` requires it, so an
       *     unterminated `{` (`{`, `array<{`, `null | {`) spells no inline
       *     object type at all, even though this tolerant parser still hands
       *     back an object node for it. Such a source has no empty `{}` in it
       *     for the diagnostic's message to name.
       *
       * The rule fires for a token-free interior WITH a closing brace, and for
       * no other shape.
       */
      readonly interiorHasTokens: boolean;
      readonly braceClosed: boolean;
    }
  | { readonly kind: "union"; readonly arms: TypeNode[] };

interface TypeToken {
  readonly kind: "ident" | "str" | "num" | "punct";
  readonly text: string;
}

/** Tokenise a type expression. Whitespace-separated; brackets and `|`/`,` punct. */
function tokeniseType(source: string): TypeToken[] {
  const tokens: TypeToken[] = [];
  const n = source.length;
  let i = 0;
  const isDigit = (c: string): boolean => c >= "0" && c <= "9";
  const isIdentStart = (c: string): boolean =>
    (c >= "A" && c <= "Z") || (c >= "a" && c <= "z") || c === "_";
  const isIdentPart = (c: string): boolean => isIdentStart(c) || isDigit(c);
  while (i < n) {
    const c = source[i] ?? "";
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i += 1;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      let text = c;
      i += 1;
      while (i < n && source[i] !== quote) {
        if (source[i] === "\\" && i + 1 < n) {
          text += source[i] ?? "";
          i += 1;
        }
        text += source[i] ?? "";
        i += 1;
      }
      if (i < n) {
        text += source[i] ?? "";
        i += 1;
      }
      tokens.push({ kind: "str", text });
      continue;
    }
    if (isDigit(c)) {
      let text = "";
      while (i < n && (isDigit(source[i] ?? "") || source[i] === ".")) {
        text += source[i] ?? "";
        i += 1;
      }
      tokens.push({ kind: "num", text });
      continue;
    }
    if (isIdentStart(c)) {
      let text = "";
      while (i < n && isIdentPart(source[i] ?? "")) {
        text += source[i] ?? "";
        i += 1;
      }
      tokens.push({ kind: "ident", text });
      continue;
    }
    tokens.push({ kind: "punct", text: c });
    i += 1;
  }
  return tokens;
}

const PRIMITIVE_TYPES = new Set(["string", "number", "integer", "boolean", "null"]);
const GENERIC_ARITY: Readonly<Record<string, number>> = Object.freeze({
  array: 1,
  Result: 2,
});

/** A tolerant recursive-descent parser for the type grammar. */
class TypeParser {
  private pos = 0;
  constructor(private readonly tokens: readonly TypeToken[]) {}

  private peek(): TypeToken | undefined {
    return this.tokens[this.pos];
  }

  private next(): TypeToken | undefined {
    const t = this.tokens[this.pos];
    this.pos += 1;
    return t;
  }

  private eatPunct(text: string): boolean {
    const t = this.peek();
    if (t !== undefined && t.kind === "punct" && t.text === text) {
      this.pos += 1;
      return true;
    }
    return false;
  }

  parse(): TypeNode | undefined {
    const node = this.parseUnion();
    return node;
  }

  private parseUnion(): TypeNode | undefined {
    const first = this.parsePrimary();
    if (first === undefined) {
      return undefined;
    }
    const arms: TypeNode[] = [first];
    while (this.eatPunct("|")) {
      const arm = this.parsePrimary();
      if (arm === undefined) {
        break;
      }
      arms.push(arm);
    }
    return arms.length === 1 ? first : { kind: "union", arms };
  }

  private parsePrimary(): TypeNode | undefined {
    const t = this.peek();
    if (t === undefined) {
      return undefined;
    }
    if (t.kind === "str" || t.kind === "num") {
      this.next();
      return { kind: "literal" };
    }
    if (t.kind === "punct") {
      if (t.text === "-") {
        this.next();
        const num = this.peek();
        if (num !== undefined && num.kind === "num") {
          this.next();
        }
        return { kind: "literal" };
      }
      if (t.text === "{") {
        return this.parseObject();
      }
      // Unexpected punctuation: skip it to stay tolerant.
      this.next();
      return this.parsePrimary();
    }
    // ident
    const name = t.text;
    this.next();
    if (name === "void") {
      return { kind: "void" };
    }
    if (name === "true" || name === "false") {
      return { kind: "literal" };
    }
    if (name in GENERIC_ARITY && this.peek()?.text === "<") {
      return this.parseGeneric(name);
    }
    // A generic head used without `<...>`, or any non-generic head with a
    // following `<`, is still parsed as an application so the arity check
    // fires (e.g. `array` arity computed from however many args appear).
    if (this.peek()?.text === "<") {
      return this.parseGeneric(name);
    }
    if (PRIMITIVE_TYPES.has(name)) {
      return { kind: "prim", name };
    }
    return { kind: "named", name };
  }

  private parseGeneric(ctor: string): TypeNode {
    this.eatPunct("<");
    const args: TypeNode[] = [];
    if (this.peek()?.text !== ">") {
      const first = this.parseUnion();
      if (first !== undefined) {
        args.push(first);
      }
      while (this.eatPunct(",")) {
        const arg = this.parseUnion();
        if (arg !== undefined) {
          args.push(arg);
        }
      }
    }
    this.eatPunct(">");
    return { kind: "generic", ctor, args };
  }

  private parseObject(): TypeNode {
    this.eatPunct("{");
    // Captured off the token immediately after `{`, before the field loop
    // below can advance `pos` — see `TypeNode`'s doc comment for why the
    // empty-inline-object key is this flag paired with `braceClosed`, and not
    // `fieldTypes.length === 0`.
    const interiorHasTokens = this.peek() !== undefined && this.peek()?.text !== "}";
    const fieldTypes: TypeNode[] = [];
    while (this.peek() !== undefined && this.peek()?.text !== "}") {
      // FieldName `:` Type — skip the field name and the colon, parse the type.
      const fieldName = this.peek();
      if (fieldName !== undefined && fieldName.kind === "ident") {
        this.next();
      } else {
        this.next();
        continue;
      }
      if (!this.eatPunct(":")) {
        // Malformed field; stop to stay tolerant.
        break;
      }
      const fieldType = this.parseUnion();
      if (fieldType !== undefined) {
        fieldTypes.push(fieldType);
      }
      // Optional `as "WireName"` rename — skip if present.
      if (this.peek()?.kind === "ident" && this.peek()?.text === "as") {
        this.next();
        if (this.peek()?.kind === "str") {
          this.next();
        }
      }
      if (!this.eatPunct(",")) {
        break;
      }
    }
    const braceClosed = this.eatPunct("}");
    return { kind: "object", fieldTypes, interiorHasTokens, braceClosed };
  }
}

/**
 * Walk a type AST in source order, applying the checks `rules` selects
 * (`TypeCheckRules`; `"all"` runs every check below, gated by `position`
 * where noted):
 *
 *   - `theta/parse/void-in-non-return-position` — `void` anywhere other than the
 *     top-level return-type annotation in a `return` position. A `void` nested
 *     in a generic argument, an inline-object field, or a union arm is never
 *     the top-level return type and always fires. `"all"`-only.
 *   - `theta/parse/generic-arity-mismatch` — a closed-set generic constructor
 *     applied with a type-argument count other than its declared arity.
 *     `"all"`-only.
 *   - `theta/parse/result-in-schema-position` — a `Result` application anywhere
 *     within a `schema-feeding` type (the whole tree is lowered-schema
 *     reachable, including `array<T>` element types and union arms).
 *     `"all"`-only.
 *   - `theta/parse/empty-schema-body` — an inline object type whose brace
 *     interior carries no token AND whose closing `}` was consumed
 *     (`TypeNode.interiorHasTokens` false, `TypeNode.braceClosed` true). Runs
 *     under EVERY `rules` value — it is the one check `"inline-object-shape"`
 *     admits — and is unqualified by `position` or by `isRoot`. An
 *     unterminated `{` fails the second half and stays silent: `ObjectType`
 *     requires the closing brace, so there is no inline object type there to
 *     call empty.
 *
 * Every `rules` value still descends generic arguments, object field types
 * and union arms, so a nested empty inline object is found at any depth
 * regardless of which of the other three checks are withheld.
 */
function walkType(
  node: TypeNode,
  isRoot: boolean,
  position: TypePosition,
  rules: TypeCheckRules,
  site: TypeCheckSite,
  out: Diagnostic[],
): void {
  switch (node.kind) {
    case "void": {
      if (rules !== "all") {
        return;
      }
      const admitted = position === "return" && isRoot;
      if (!admitted) {
        out.push({
          severity: "error",
          code: "theta/parse/void-in-non-return-position",
          file: site.file,
          range: site.range,
          message: "'void' is only permitted as a function or theta return type",
          hint: "`void` is a return-only annotation; use a value type (or `null`) in this position.",
        });
      }
      return;
    }
    case "generic": {
      if (rules === "all") {
        const expected = GENERIC_ARITY[node.ctor];
        if (expected !== undefined && node.args.length !== expected) {
          out.push({
            severity: "error",
            code: "theta/parse/generic-arity-mismatch",
            file: site.file,
            range: site.range,
            message: `generic type '${node.ctor}' expects ${expected} type argument(s); got ${node.args.length}`,
          });
        }
        if (position === "schema-feeding" && node.ctor === "Result") {
          out.push({
            severity: "error",
            code: "theta/parse/result-in-schema-position",
            file: site.file,
            range: site.range,
            message:
              "'Result' has no lowered-schema form and is not permitted in a schema-feeding position",
            hint: "`Result` has no lowered-schema form; use it only in `fn` / `let` / `invoke` positions, and feed the schema position a lowerable type.",
          });
        }
      }
      for (const arg of node.args) {
        walkType(arg, false, position, rules, site, out);
      }
      return;
    }
    case "object": {
      if (!node.interiorHasTokens) {
        // Nothing to descend — a token-free interior leaves `fieldTypes` empty
        // whether or not the brace closed. The closing brace is the second
        // half of the key (see `TypeNode`); the check itself runs regardless of
        // `rules`, being the one `"inline-object-shape"` admits.
        if (node.braceClosed) {
          out.push(emptySchemaBodyDiagnostic("{}", site));
        }
        return;
      }
      for (const fieldType of node.fieldTypes) {
        walkType(fieldType, false, position, rules, site, out);
      }
      return;
    }
    case "union": {
      for (const arm of node.arms) {
        walkType(arm, false, position, rules, site, out);
      }
      return;
    }
    default:
      return;
  }
}

/**
 * The surrounding context of an `[]` / `[expr, ...]` array literal, selecting
 * whether a *type sink* is available (grammar.md §"array<T> literal type-sink
 * rule"). The sink set is exhaustive:
 *
 *   - `binding-annotation`  — `let xs: array<T> = ...`.
 *   - `fn-param`            — a function parameter type at a call site.
 *   - `constructor-field`   — a surrounding constructor field's declared type.
 *   - `array-element`       — the element type of an enclosing array-typed sink
 *                             (recursive descent).
 *   - `for-iterand`         — the iterand of `for x in expr`. NOT a sink: `for`
 *                             cannot supply `T` to `[]`.
 *   - `none`                — no surrounding sink (e.g. `let xs = []`).
 */
export type ArraySinkContext =
  | "binding-annotation"
  | "fn-param"
  | "constructor-field"
  | "array-element"
  | "for-iterand"
  | "none";

/** A located site at which an array literal's element type is resolved. */
export interface ArrayLiteralSite {
  readonly file: string;
  readonly range: SourceRange;
}

/**
 * Resolve an array literal's element type against its surrounding sink.
 * Returns `theta/parse/array-no-common-type` when the literal's elements alone
 * cannot determine a common type (an empty literal, or heterogeneous elements
 * with no shared type) and the surrounding `context` supplies no sink — the
 * `for-iterand` and `none` contexts both leave the literal unsunk, so an `[]`
 * in either fires. A real sink (`binding-annotation`, `fn-param`,
 * `constructor-field`, `array-element`) returns `undefined`.
 *
 * V2a-T stubs this as an inert no-op (returns `undefined`); the paired V2a
 * implementation leaf computes the element LUB and the sink resolution.
 */
export function checkArrayCommonType(
  context: ArraySinkContext,
  elementTypes: readonly string[],
  site: ArrayLiteralSite,
): Diagnostic | undefined {
  // A real sink supplies the element type directly; the literal resolves.
  // The exhaustive sink set is binding-annotation / fn-param /
  // constructor-field / array-element. The `for` iterand is explicitly NOT a
  // sink, and `none` is the no-surrounding-sink case (`let xs = []`).
  const isSink =
    context === "binding-annotation" ||
    context === "fn-param" ||
    context === "constructor-field" ||
    context === "array-element";
  if (isSink) {
    return undefined;
  }
  // Unsunk: the elements alone must determine a common type. An empty literal
  // (no elements) has none; heterogeneous elements (more than one distinct
  // type) have none. A single shared element type is self-sufficient.
  const distinct = new Set(elementTypes);
  if (distinct.size === 1) {
    return undefined;
  }
  return {
    severity: "error",
    code: "theta/parse/array-no-common-type",
    file: site.file,
    range: site.range,
    message:
      "array elements have no common type; annotate the binding with array<A | B> or use a single schema",
    hint: "Annotate the binding with `array<A | B>` or use a single schema.",
  };
}
