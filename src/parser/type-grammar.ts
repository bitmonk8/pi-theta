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
//   - `theta/parse/duplicate-inline-field-name` — two or more field-name
//     positions of one inline object body spell the same name; the inline
//     spelling reuses the object-schema `Field` form (grammar.md §"Inline
//     object types") and carries the same field semantics. `ObjectType`
//     spells a closing `}` as well, so an interior that never closes is no
//     inline object type and carries no comparison of its own — the same
//     grammar requirement the empty rule above reads, asked here of the
//     source (`TypeNode.closingBraceSpelled`) rather than of the field loop's
//     own consumption, which a missing type position can spend on that brace.
//     The comparison runs over the positions the interior spells as
//     `Ident ":"`, in source order, and draws one diagnostic per repeated name
//     at its second such position
//     (code-registry-parse.md's row). It reaches only the positions ahead of
//     the interior's FIRST STOP, of which the row states three: an identifier
//     the interior does not follow with a `:`, a completed field it does not
//     follow with a `,`, and a field whose own type carries an interior that
//     never closes. The third shape stops EVERY body enclosing that field as
//     well, at any depth, each of them reading its own field list through the
//     interior that never closes. Names behind a stop are not compared, so a
//     genuine repeat written there draws nothing (code-registry-parse.md's
//     row). Withheld
//     for an object reached through a generic type argument, at every depth
//     beneath it: the walk parses that interior the same way regardless
//     (`TypeNode.fieldNames` holds the repeat there too), so the withholding
//     is a deliberate scope decision rather than a parse-time blind spot —
//     the mechanism that leaves nothing for this rule to name is the
//     LOWERING's generic-argument split (`params.ts`'s `lowerTypeExpr`,
//     through `splitTopLevel`'s default angle-only nesting), which never
//     divides that interior into fields and mints no duplicate `required`
//     there (code-registry-parse.md's row, "Three shapes sit outside this
//     row"). Position-independent, like `empty-schema-body` above.
//
// A caller may select a narrower rule SET than all five checks
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
 *     checks: `theta/parse/empty-schema-body`'s empty-brace-interior rule and
 *     `theta/parse/duplicate-inline-field-name`'s repeated-name rule. The
 *     walk still DESCENDS generic arguments, object field types and union
 *     arms under this selection — a nested `{}` or a nested repeated name is
 *     found at any depth — but withholds `void-in-non-return-position`,
 *     `generic-arity-mismatch` and `result-in-schema-position`, which stay
 *     `"all"`-only.
 *
 * A caller selects `"inline-object-shape"` when its position runs no other
 * type-grammar pass, so importing the other three checks in the same edit
 * would widen that position's emission set beyond the rules being wired (the
 * `invoke<T>` return annotation is exactly this case: it selects this set
 * alone, not the full walk — theta-document.ts's `walkExpr`, `"invoke"`
 * arm). The set is named after the SHAPE its member checks govern rather
 * than after either one rule.
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
  walkType(node, true, position, rules, site, false, diagnostics);
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
      /**
       * `fieldTypes` holds the types that parsed; `fieldNames` holds the names
       * the interior spells at a field-name position as `Ident ":"`, in source
       * order, for every field ahead of the interior's first stop (the three
       * stop shapes below). Each name is pushed by `TypeParser.parseObject` the
       * moment that colon is consumed — before the type is parsed, and whether
       * or not it parses. So the two arrays are NOT index-aligned: a field with
       * a name and no parseable type contributes to `fieldNames` and not to
       * `fieldTypes`.
       *
       * The key `theta/parse/duplicate-inline-field-name` (`walkType`'s
       * `object` arm, below) compares is therefore the SOURCE's field-name
       * positions, which is the only key statable on a malformed interior: the
       * tolerant recovery lets one field's type swallow the next field's
       * tokens, so a key that waited for the type would make the emission
       * depend on which neighbouring text happened to parse. For the shapes bug
       * 0052 §Fix constraint 4 pins — whitespace and a trailing comma, a
       * generic argument's interior, a union arm — this key and what
       * `lowerInlineObject` / `hoistInlineObjectType` build for the same text
       * agree. On a malformed interior they diverge, and that family belongs to
       * bug 0052 §Non-goals (the `as` rename the inline `Field` form does not
       * parse) and bug 0045 §Non-goals (`{ a }`, `{ "a": string }`, `{ a: }`)
       * rather than to this rule. Neither array carries a source range — a
       * field name's own span is bug 0154's open subject, which reuses this
       * retention.
       *
       * THREE STOP SHAPES END THE CONTRIBUTIONS, and the third reaches EVERY
       * ENCLOSING BODY. Two of them break `TypeParser.parseObject`'s loop: an
       * identifier at a field-name position with no `:` behind it, and a
       * completed field with no `,` behind it. The third leaves the loop
       * running and stops the pushes for the rest of the body — a field whose
       * own parsed type carries an interior that never closes
       * (`carriesUnclosedInterior`, read off the field type the moment it
       * parses). That third shape is needed for the same reason the key is the
       * source's: a nested `parseObject` that broke without consuming its own
       * closing `}` leaves the ENCLOSING call resumed at the token it left —
       * still inside the nested interior — where the remaining `Ident ":"`
       * positions are the NESTED body's fields, and that interior's `}` is
       * read as the enclosing body's own. Reporting those as the enclosing
       * body's repeat would name a name no single body spells, so the pushes
       * stop at the field whose type carries the unclosed interior. That
       * field's OWN name is read ahead of its type and stays contributed.
       * `carriesUnclosedInterior` recurses object field types, generic
       * arguments and union arms, which is what makes the stop reach every
       * enclosing body rather than the nearest one: at depth three
       * (`{a: {b: {c: 1, : y, c: 2}, a: 4}, z: 5}`) the middle body closes its
       * own brace and reads its field list through the interior that never
       * closes, so the outer body must stop on it too.
       * code-registry-parse.md's row states all three shapes and
       * the cascade. A genuine repeat written behind any of them is not
       * compared by this rule.
       */
      readonly fieldTypes: TypeNode[];
      readonly fieldNames: string[];
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
       * no other shape. A token-free interior reaches `eatPunct("}")` with the
       * closing brace still unconsumed, so for that shape `braceClosed` and
       * `closingBraceSpelled` below are one fact.
       *
       * `closingBraceSpelled` is the same grammar requirement asked of the
       * SOURCE rather than of the field loop: whether a `}` stands at brace
       * depth 0 ahead of this interior in the token stream
       * (`interiorSpellsClosingBrace`). The two diverge where a field's type
       * position is empty and `parsePrimary`'s tolerant punctuation skip
       * consumes the interior's own `}` looking for a type (`{a: integer, a: }`
       * — `braceClosed` false, `closingBraceSpelled` true), and again where a
       * nested interior's `}` is the only one in the stream (`{a: {}, a: 2` —
       * a `}` was consumed, none of it this interior's, so both are false).
       * `theta/parse/duplicate-inline-field-name` asks the grammar question and
       * reads `closingBraceSpelled`; the empty rule keeps `braceClosed`, which
       * for its token-free interior answers alike.
       */
      readonly interiorHasTokens: boolean;
      readonly braceClosed: boolean;
      readonly closingBraceSpelled: boolean;
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

/**
 * Whether the interior beginning at `start` spells its own closing `}` — a `}`
 * token standing at brace depth 0 relative to that interior, anywhere ahead of
 * it in `tokens`.
 *
 * This is `ObjectType ::= "{" Field ("," Field)* ","? "}"` asked of the source,
 * which is the question `theta/parse/duplicate-inline-field-name` needs: a `{`
 * the source never closes is no inline object type and holds no field list to
 * compare. `TypeNode.braceClosed` cannot answer it, being whether
 * `TypeParser.parseObject`'s own loop CONSUMED that brace — for a field whose
 * type position is empty, `parsePrimary`'s tolerant punctuation skip consumes
 * the interior's `}` while looking for a type, and the depth-0 requirement here
 * is what keeps a NESTED interior's brace from answering for an enclosing one.
 * The scan is over `tokens`, which no parse step mutates, so it reads the source
 * however far the tolerant recovery has advanced.
 */
function interiorSpellsClosingBrace(tokens: readonly TypeToken[], start: number): boolean {
  let depth = 0;
  for (let i = start; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === undefined || token.kind !== "punct") {
      continue;
    }
    if (token.text === "{") {
      depth += 1;
      continue;
    }
    if (token.text === "}") {
      if (depth === 0) {
        return true;
      }
      depth -= 1;
    }
  }
  return false;
}

/**
 * Whether `node`'s subtree carries an inline object interior that never closes:
 * an `object` node with `braceClosed === false`, at `node` itself or beneath it
 * through object field types, generic arguments and union arms.
 *
 * `TypeParser.parseObject` reads this off each field type it parses to decide
 * whether the enclosing body may keep contributing field names. A nested
 * interior that never closes leaves the enclosing loop resumed inside that
 * interior, reading its leftover `Ident ":"` positions as the enclosing body's
 * own fields, so the names past that field belong to no body the source spells.
 * The recursion is what carries the stop out to EVERY enclosing body rather
 * than the nearest one: a body that closes its own brace may itself read its
 * field list through an interior that never closes further down
 * (`{a: {b: {c: 1, : y, c: 2}, a: 4}, z: 5}`).
 */
function carriesUnclosedInterior(node: TypeNode): boolean {
  switch (node.kind) {
    case "object":
      return !node.braceClosed || node.fieldTypes.some(carriesUnclosedInterior);
    case "generic":
      return node.args.some(carriesUnclosedInterior);
    case "union":
      return node.arms.some(carriesUnclosedInterior);
    default:
      return false;
  }
}

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
    // Held before the field loop advances `pos`, because the grammar's
    // closing-brace requirement is a question about the SOURCE and the tolerant
    // recovery can consume this interior's `}` from a field's type position
    // (`TypeNode`'s doc comment states the divergence).
    const interiorStart = this.pos;
    // Captured off the token immediately after `{`, before the field loop
    // below can advance `pos` — see `TypeNode`'s doc comment for why the
    // empty-inline-object key is this flag paired with `braceClosed`, and not
    // `fieldTypes.length === 0`.
    const interiorHasTokens = this.peek() !== undefined && this.peek()?.text !== "}";
    const fieldTypes: TypeNode[] = [];
    const fieldNames: string[] = [];
    // Set by a field type carrying an interior that never closes: from that
    // field on, this loop is reading tokens of the nested interior, so the
    // `Ident ":"` positions it still sees are that body's fields and not this
    // one's. `TypeNode`'s doc comment states why a name this body never spells
    // must not enter its comparison.
    let namesStopped = false;
    while (this.peek() !== undefined && this.peek()?.text !== "}") {
      // FieldName `:` Type — hold the name token until the colon behind it is
      // consumed, which is the whole of the retention key (`TypeNode`'s doc
      // comment states it).
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
      // The interior has now spelled `Ident ":"` at a field-name position, so
      // the name is retained ahead of its type: `parsePrimary`'s tolerant
      // punctuation skip can consume the FOLLOWING field's tokens as this
      // field's type, and a name the author wrote must not vanish because a
      // neighbour's text was eaten.
      if (!namesStopped) {
        fieldNames.push(fieldName.text);
      }
      const fieldType = this.parseUnion();
      if (fieldType !== undefined) {
        fieldTypes.push(fieldType);
        // Read after the push above, so the suspect field's own name — spelled
        // ahead of the interior that never closes — stays contributed, and only
        // the names behind it stop.
        namesStopped = namesStopped || carriesUnclosedInterior(fieldType);
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
    return {
      kind: "object",
      fieldTypes,
      fieldNames,
      interiorHasTokens,
      braceClosed,
      closingBraceSpelled: interiorSpellsClosingBrace(this.tokens, interiorStart),
    };
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
 *     under EVERY `rules` value — one of the two checks `"inline-object-shape"`
 *     admits — and is unqualified by `position`, by `isRoot`, or by
 *     `insideGenericArgument`: an empty `array<{}>` argument still fires. An
 *     unterminated `{` fails the second half and stays silent: `ObjectType`
 *     requires the closing brace, so there is no inline object type there to
 *     call empty.
 *   - `theta/parse/duplicate-inline-field-name` — two entries of
 *     `TypeNode.fieldNames` hold the same text, i.e. two of the field-name
 *     positions the interior spells as `Ident ":"` spell one name, AND the
 *     source spells the interior's closing `}`
 *     (`TypeNode.closingBraceSpelled`, the grammar requirement the empty rule
 *     above reads off `braceClosed`): `ObjectType` spells that brace, so an
 *     unterminated `{` is no inline object type and holds no field list for
 *     this rule to compare. `TypeNode.fieldNames` carries the names ahead of
 *     the interior's first stop only — an identifier with no `:` behind it, a
 *     completed field with no `,` behind it, or a field whose own type carries
 *     an interior that never closes, the last stopping every body enclosing
 *     that field as well, at any depth (the object variant's doc comment
 *     states all three shapes, the cascade, and why the key is the source's
 *     rather than the lowering's). One diagnostic per repeated name, at its
 *     second occurrence, in source order — `seen` tracks a
 *     name's first occurrence and `reported` its emission, both `Set`s, so a
 *     third occurrence draws no second line. Runs under EVERY `rules`
 *     value — the other check `"inline-object-shape"` admits — and is
 *     unqualified by `position` or by `isRoot`, but WITHHELD when
 *     `insideGenericArgument`: a generic type argument's interior is never
 *     divided into fields, so no duplicate `required` is ever minted there
 *     for this rule to name (code-registry-parse.md's row, "Three shapes sit
 *     outside this row").
 *
 * Every `rules` value still descends generic arguments, object field types
 * and union arms, so a nested empty inline object or a nested repeated field
 * name is found at any depth regardless of which of the other three checks
 * are withheld. Descending a generic argument's `args` sets
 * `insideGenericArgument` for that argument and everything beneath it; the
 * object and union arms propagate the flag unchanged when they descend their
 * own field types and arms.
 */
function walkType(
  node: TypeNode,
  isRoot: boolean,
  position: TypePosition,
  rules: TypeCheckRules,
  site: TypeCheckSite,
  insideGenericArgument: boolean,
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
      // Every type argument of a generic constructor carries the
      // duplicate-inline-field-name carve-out for its whole subtree — set
      // unconditionally here, since descending into ANY generic argument
      // (re-)establishes it regardless of the incoming flag.
      for (const arg of node.args) {
        walkType(arg, false, position, rules, site, true, out);
      }
      return;
    }
    case "object": {
      if (!node.interiorHasTokens) {
        // Nothing to descend — a token-free interior leaves `fieldTypes` empty
        // whether or not the brace closed. The closing brace is the second
        // half of the key (see `TypeNode`); the check itself runs regardless of
        // `rules`, being one of the two checks `"inline-object-shape"` admits.
        if (node.braceClosed) {
          out.push(emptySchemaBodyDiagnostic("{}", site));
        }
        return;
      }
      // `theta/parse/duplicate-inline-field-name` stands on two gates. The
      // closing brace is the grammar's own: `ObjectType` spells it, so an
      // interior the source never closes holds no field list to compare — the
      // same requirement the empty rule reads above, asked of the source
      // because the tolerant recovery can spend this interior's `}` on a
      // missing type position (`TypeNode`'s doc comment). The generic-argument
      // gate is a deliberate scope decision rather than a parse-time blind
      // spot: `node.fieldNames` still
      // holds the repeat there, because `TypeParser.parseObject` parses a
      // generic argument's interior exactly as it parses any other object
      // type — brace-aware, not angle-only. What leaves nothing for this rule
      // to name instead is the LOWERING's own generic-argument handling
      // (`params.ts`'s `lowerTypeExpr`, through `splitTopLevel`'s default
      // angle-only nesting): it never divides that interior into fields, so no
      // duplicate `required` is ever minted there for this rule to see
      // (code-registry-parse.md's row, "Three shapes sit outside this row";
      // bug 0052 §Non-goals). `seen` / `reported` are `Set`s, never a plain
      // object, so an author-chosen field name can never collide with an
      // object's own prototype keys.
      if (!insideGenericArgument && node.closingBraceSpelled) {
        const seen = new Set<string>();
        const reported = new Set<string>();
        for (const name of node.fieldNames) {
          if (!seen.has(name)) {
            seen.add(name);
            continue;
          }
          if (reported.has(name)) {
            continue;
          }
          reported.add(name);
          out.push({
            severity: "error",
            code: "theta/parse/duplicate-inline-field-name",
            file: site.file,
            range: site.range,
            message: `duplicate field name '${name}' within one inline object type`,
          });
        }
      }
      for (const fieldType of node.fieldTypes) {
        walkType(fieldType, false, position, rules, site, insideGenericArgument, out);
      }
      return;
    }
    case "union": {
      for (const arm of node.arms) {
        walkType(arm, false, position, rules, site, insideGenericArgument, out);
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
