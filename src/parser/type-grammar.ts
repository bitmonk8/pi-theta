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
//   - `theta/parse/duplicate-inline-field-name` — two or more entries of one
//     inline object interior share a key; the inline spelling reuses the
//     object-schema `Field` form (grammar.md §"Inline object types") and
//     carries the same field semantics. `ObjectType` spells a closing `}` as
//     well, so an interior that never closes is no inline object type and
//     carries no comparison of its own — the same grammar requirement the
//     empty rule above reads, asked here of the source
//     (`TypeNode.closingBraceSpelled`) rather than of the field loop's own
//     consumption. The comparison runs over the entries a brace-and-angle-
//     aware top-level comma split of the interior yields (`splitTopLevel`,
//     `./params`), keyed on each entry's raw pre-colon text (`topLevelColon`,
//     `./params`) after `trim()` — no unquoting, no normalisation, and no
//     stop: this is the same split and the same colon `hoistInlineObjectType`
//     (params.ts) and `lowerInlineObject` (body-type-lowering.ts) key their
//     `properties` and `required` writes on, so the comparison agrees with
//     what is lowered BY CONSTRUCTION. One diagnostic per repeated key, at its
//     second occurrence, in source order (code-registry-parse.md's row).
//     Answers alike for an object reached through a generic type argument, at
//     every depth beneath it: `TypeParser.parseObject` parses that interior
//     brace-aware, exactly as it parses any other object type, so the same
//     repeat is there to name. The LOWERING's generic-argument split
//     (`params.ts`'s `lowerTypeExpr`, through `splitTopLevel`'s default
//     angle-only nesting) never divides that interior into fields and mints
//     no duplicate `required` on the wire from there — that fact bounds the
//     WIRE consequence of a repeated key, not whether this rule judges the
//     source (code-registry-parse.md's row). Position-independent, like
//     `empty-schema-body` above. The retained `fieldNames` / `namesStopped`
//     stay on the node beside this key: they are the theta-side IDENTIFIER
//     list bug 0154's identifier rules rebase onto, which the raw entry text
//     this rule now keys on is not.
//   - `theta/parse/quoted-inline-field-name` — a non-repeating entry of the
//     same split whose key's first character is `"` or `'`: the inline
//     spelling reuses the object-schema `Field` form, and schemas.md's field
//     names are identifiers, which admit no quote character. Shares the
//     duplicate rule's gate (`TypeNode.closingBraceSpelled`) and its
//     comparison key, and answers alike at any depth beneath a generic type
//     argument on the same ground as the duplicate rule; a key that repeats
//     draws the duplicate row alone (bug 0176 §Fix precedence).
//   - `theta/parse/renamed-inline-field-name` (bug 0160) — a non-repeating,
//     non-quoted entry of the same split whose raw text spells
//     `Ident "as" String`, an inline `as "WireName"` rename. `parseObject`'s
//     field loop meets the `as` token where a `:` is required and
//     resynchronises at this entry's next depth-0 `,` before this spelling
//     can be retained as a `Field`, so the position holds a rename
//     the grammar admits but no `Type` position parses; this rule refuses the
//     spelling instead of parsing it, leaving `theta/parse/wire-name-collision`
//     and `theta/parse/redundant-wire-name` declaration-only. Shares the two
//     raw-key rules' gate and key, is subordinate to both of them (a
//     repeating or quote-led key never reaches this test), and renders the
//     THETA-SIDE identifier its pattern captures rather than the raw key —
//     the one rendering that answers alike at every position, token-joined or
//     not.
//   - `theta/parse/binding-case-mismatch` (bug 0154) — an entry of
//     `TypeNode.fieldNames`, the theta-side IDENTIFIER retention, whose first
//     character is neither `_` nor a lowercase letter: the inline field-name
//     position reuses the object-schema `Field` form, so lexical.md's
//     lowercase-first rule reaches it exactly as it reaches an object-schema
//     body's own field name. Excludes a spelling that is a member of the
//     lexer's own `reservedKeywords()` (Disposition A — the reserved-keyword
//     class at this slot stays with its own open report). Shares the empty
//     rule's closing-brace gate, the same gate the two raw-key rules above
//     share: all six rules at this arm answer alike regardless of nesting
//     depth beneath a generic type argument, so a nested `array<{ Ys: string }>`
//     fires exactly as a nested `array<{ a b: string }>` does. Emits before
//     the two raw-key rules above.
//
// A caller may select a narrower rule SET than all eight checks
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
import { reservedKeywords } from "../lexer/lexer";
import { splitTopLevel, topLevelColon } from "./params";
import { emptySchemaBodyDiagnostic } from "./schema-declarations";

/**
 * The reserved-spelling exclusion `walkType`'s `object` arm needs for bug
 * 0154's identifier pass (Disposition A): a keyword-shaped inline field name
 * (`Ok`, `Err`, `Result`, `let`, …) must not draw `binding-case-mismatch`,
 * because `tokeniseType` has no keyword kind at all and would otherwise
 * present every one of them exactly as it presents `Ys`. Derived ONCE at
 * module scope from the lexer's own exported set, the same shape
 * `src/parser/params.ts` and `src/parser/frontmatter.ts` already use for the
 * identical exclusion at their own field-name positions — a module-private
 * immutable derived set, not a mutable global.
 */
const RESERVED_KEYWORDS: ReadonlySet<string> = reservedKeywords();

/**
 * The raw-key shape `theta/parse/renamed-inline-field-name` refuses (bug
 * 0160): `Ident "as" (String)` — the inline `Field` form's rename clause,
 * spelled BEFORE the entry's own top-level `:` the way `schemas.md:23` fixes
 * it, never after it (the post-type spelling `parseObject`'s own `as` skip
 * matches is a different, undefined form; 0160 §Non-goals). Anchored at both
 * ends against `inlineObjectFieldKeys`' trimmed entry text, so it accepts no
 * leading or trailing token beyond what `trim()` already removed. Matches
 * both spellings one raw key can arrive as — the token-joined text ten of the
 * eleven `Type` positions reconstruct (`a as "w"` → `aas"w"`) and the
 * `params:` position's untouched YAML scalar (`a as "w"`) — and yields the
 * SAME capture, the theta-side identifier, from both: group 1 is greedy only
 * up to the first `as` a trailing wire name can follow, which is the only
 * split either spelling admits. Module-scoped and derived once, like
 * `RESERVED_KEYWORDS` above: a regex literal carries no mutable state, so
 * this is not the global CLAUDE.md forbids.
 *
 * The wire-name literal alternatives admit the escape `lexical.md`'s
 * string-literal grammar admits: `\.` inside either quote character, so an
 * escaped quote in the wire name (bug 0229) reaches this row instead of
 * defeating the colon scan that finds the entry in the first place. The
 * alternatives still cannot span an UNESCAPED quote, so a second `as` clause
 * after the first wire name closes — `{a as "w" as "x": integer}` (bug
 * 0160's cell g23) — stays outside this row: the first `"w"` ends the
 * alternative and the trailing ` as "x"` fails the end anchor.
 */
const INLINE_FIELD_RENAME =
  /^([A-Za-z_][A-Za-z0-9_]*?)\s*as\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')$/;

/**
 * The `Ident` production a raw inline field-name key must match
 * (`lexical.md:13`), asked of the whole trimmed key rather than of its first
 * character alone: `theta/parse/inline-field-name-not-identifier` refuses a
 * key this test declines, once the three keys ahead of it in precedence —
 * repeating, quote-led, rename-shaped — have declined it first.
 */
const INLINE_FIELD_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

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
 *   - `"inline-object-shape"` — the checks that run at an inline object
 *     type's own arm independent of position and of the other three
 *     `"all"`-only checks: `theta/parse/empty-schema-body`'s
 *     empty-brace-interior rule, `theta/parse/binding-case-mismatch`'s
 *     lowercase-first identifier rule over the field name (bug 0154),
 *     `theta/parse/duplicate-inline-field-name`'s repeated-name rule,
 *     `theta/parse/quoted-inline-field-name`'s non-identifier-key rule, and
 *     `theta/parse/renamed-inline-field-name`'s (bug 0160) rename-clause
 *     refusal. The walk still DESCENDS generic arguments, object field types and union
 *     arms under this selection — a nested `{}`, a nested ill-cased name, a
 *     nested repeated name, or a nested quoted name is found at any depth —
 *     but withholds `void-in-non-return-position`, `generic-arity-mismatch`
 *     and `result-in-schema-position`, which stay `"all"`-only.
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
  const parser = new TypeParser(tokens, source);
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
      /**
       * `fieldTypes` holds the types that parsed; `fieldNames` holds the names
       * the interior spells at a field-name position as `Ident ":"`, in source
       * order, for every field ahead of the interior's first stop (the two
       * stop shapes below) and not excluded by either per-entry exclusion
       * further down. Each name is pushed by `TypeParser.parseObject` the
       * moment that colon is consumed — before the type is parsed, and whether
       * or not it parses. So the two arrays are NOT index-aligned: a field with
       * a name and no parseable type contributes to `fieldNames` and not to
       * `fieldTypes`.
       *
       * `fieldNames` is NOT `theta/parse/duplicate-inline-field-name`'s key.
       * That rule (`walkType`'s `object` arm, below) compares the entries
       * `interiorSource` (below) splits into — the same tokenisation
       * `hoistInlineObjectType` (params.ts) and `lowerInlineObject`
       * (body-type-lowering.ts) key their `properties` / `required` writes on,
       * so the rule agrees with what is lowered BY CONSTRUCTION rather than by
       * fixture (bug 0159 §Fix route (a)). `fieldNames` is the theta-side
       * IDENTIFIER list bug 0154's lowercase-first and reserved-keyword rules
       * rebase onto: those rules ask whether a name is a well-formed
       * identifier, a question asked of a TOKEN, not of the raw, unnormalised
       * entry text `interiorSource` yields — which is why the retention stays
       * beside a comparison keyed on different text. Neither array carries a
       * source range — a field name's own span is bug 0154's open subject,
       * which reuses this retention.
       *
       * TWO STOP SHAPES END THE CONTRIBUTIONS TO `fieldNames` for every entry
       * from that point on, reaching every enclosing body from the second; the
       * cascade bears only on this identifier list, not on the duplicate-key
       * comparison above. The first breaks `TypeParser.parseObject`'s loop
       * outright: a completed field with no `,` behind it. This is the genuine
       * end of the interior only when the preceding field's type parse did not
       * itself consume the separator; an entry whose TYPE position is empty is
       * the shape where `parsePrimary`'s tolerant punctuation skip swallows
       * that `,`, and this break then fires mid-interior instead. The second
       * leaves the loop running and stops the pushes
       * for the rest of the body — a field whose own parsed type carries an
       * interior that never closes (`carriesUnclosedInterior`, read off the
       * field type the moment it parses). `carriesUnclosedInterior` recurses
       * object field types, generic arguments and union arms, which is what
       * carries the stop to every enclosing body rather than the nearest one.
       *
       * TWO exclusions are per-entry rather than a stop, and both lift at the
       * following entry rather than silencing every entry from that point on
       * (bug 0231 §Fix route 1). The first: an entry whose field-name position
       * holds a token outside `Ident`'s alphabet (`lexical.md` §Identifiers)
       * DID spell a name — the whole raw key — so the ASCII tail that
       * `TypeParser.parseObject`'s tolerant skip lands on next is not that
       * name; it is excluded from this entry's contribution alone. Such an
       * entry is `theta/parse/inline-field-name-not-identifier`'s subject
       * instead (bug 0227 §Fix route 2), so its residue must not also reach
       * this list for bug 0154's identifier pass to judge under a name the
       * author never wrote.
       *
       * The second: an entry whose field-name position IS an `ident` but has
       * no `:` behind it — a malformed entry `TypeParser.parseObject` resyncs
       * past by skipping to this interior's next depth-0 `,` (bug 0231 §Fix
       * route 1). No name was ever consumed for this entry (the `ident` was
       * read, but the retention push sits behind the colon it never met), so
       * there is no residue to exclude; the entry contributes nothing,
       * and the entry behind it — one the author did write — keeps its own
       * name and type in full.
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
       *     is skipped, a missing `:` resynchronises at the next depth-0 `,`)
       *     also yields an empty `fieldTypes` for a malformed-but-non-empty
       *     interior with no such `,` to resynchronise on (`{ a }`,
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
       * (`interiorClosingBraceIndex`). The two diverge where a field's type
       * position is empty and `parsePrimary`'s tolerant punctuation skip
       * consumes the interior's own `}` looking for a type (`{a: integer, a: }`
       * — `braceClosed` false, `closingBraceSpelled` true), and again where a
       * nested interior's `}` is the only one in the stream (`{a: {}, a: 2` —
       * a `}` was consumed, none of it this interior's, so both are false).
       * `theta/parse/duplicate-inline-field-name` asks the grammar question and
       * reads `closingBraceSpelled`; the empty rule keeps `braceClosed`, which
       * for its token-free interior answers alike.
       *
       * `interiorSource` is the raw text between this node's own `{` and the
       * depth-0 `}` `interiorClosingBraceIndex` finds, sliced off
       * `TypeToken.start` offsets rather than reconstructed from token texts —
       * the empty string when `closingBraceSpelled` is false, since a `{` the
       * source never closes spells no interior to slice. Quoting and
       * inter-token whitespace survive verbatim relative to the string this
       * node was tokenised from, exactly as `splitTopLevel` / `topLevelColon`
       * would see them if handed that string directly. Since bug 0228 an
       * inline object's brace group is itself a raw slice of the author's own
       * source bytes at every `Type` position (`theta-document.ts`'s
       * `consumeInlineObjectType`), so for a brace-group interior that string
       * is the author's spelling. `theta/parse/duplicate-inline-field-name` derives its comparison key
       * from this field alone (`inlineObjectFieldKeys`, below):
       * `splitTopLevel(interiorSource, ",", "angle-and-brace")` (`./params`),
       * keyed on each entry's raw pre-colon text (`topLevelColon`, `./params`)
       * after `trim()` — no unquoting, no normalisation.
       */
      readonly interiorHasTokens: boolean;
      readonly braceClosed: boolean;
      readonly closingBraceSpelled: boolean;
      readonly interiorSource: string;
    }
  | { readonly kind: "union"; readonly arms: TypeNode[] };

/**
 * `start` is the offset of the token's first character in the tokenised
 * source string — recorded so `TypeParser.parseObject` can slice
 * `TypeNode.interiorSource` directly off that string rather than
 * reconstructing it from token texts, which would drop the interior's
 * whitespace and quoting relative to that string. Since bug 0228 an inline
 * object's brace group is itself a raw slice of the author's own source
 * bytes at every `Type` position, so for a brace-group interior the string
 * tokenised here already is the author's spelling; outside a brace group the
 * string can still be a lossy join, and this slice is verbatim relative to
 * whatever string it was handed either way.
 */
interface TypeToken {
  readonly kind: "ident" | "str" | "num" | "punct";
  readonly text: string;
  readonly start: number;
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
      const start = i;
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
      tokens.push({ kind: "str", text, start });
      continue;
    }
    if (isDigit(c)) {
      const start = i;
      let text = "";
      while (i < n && (isDigit(source[i] ?? "") || source[i] === ".")) {
        text += source[i] ?? "";
        i += 1;
      }
      tokens.push({ kind: "num", text, start });
      continue;
    }
    if (isIdentStart(c)) {
      const start = i;
      let text = "";
      while (i < n && isIdentPart(source[i] ?? "")) {
        text += source[i] ?? "";
        i += 1;
      }
      tokens.push({ kind: "ident", text, start });
      continue;
    }
    tokens.push({ kind: "punct", text: c, start: i });
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
 * The TOKEN INDEX of the interior beginning at `start`'s own closing `}` — a
 * `}` token standing at brace depth 0 relative to that interior, anywhere
 * ahead of it in `tokens` — or `-1` when no such token exists.
 *
 * This is `ObjectType ::= "{" Field ("," Field)* ","? "}"` asked of the source,
 * which is the question `theta/parse/duplicate-inline-field-name` needs: a `{`
 * the source never closes is no inline object type and holds no interior to
 * compare. `TypeNode.braceClosed` cannot answer it, being whether
 * `TypeParser.parseObject`'s own loop CONSUMED that brace — for a field whose
 * type position is empty, `parsePrimary`'s tolerant punctuation skip consumes
 * the interior's `}` while looking for a type, and the depth-0 requirement here
 * is what keeps a NESTED interior's brace from answering for an enclosing one.
 * The scan is over `tokens`, which no parse step mutates, so it reads the source
 * however far the tolerant recovery has advanced. `TypeParser.parseObject`
 * reads the index twice: `closingBraceSpelled` is whether it is `>= 0`, and the
 * found token's own `start` is the far end of the slice `TypeNode.interiorSource`
 * reads off the source string.
 */
function interiorClosingBraceIndex(tokens: readonly TypeToken[], start: number): number {
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
        return i;
      }
      depth -= 1;
    }
  }
  return -1;
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
 *
 * The field names this stop guards feed only `fieldNames` — bug 0154's
 * identifier retention. `theta/parse/duplicate-inline-field-name` reads
 * `TypeNode.interiorSource` instead (bug 0159 §Fix route (a)), computed by
 * `interiorClosingBraceIndex`'s own independent scan from each object node's
 * own interior start; that scan balances nested braces on `tokens` alone, so
 * it is immune to wherever this parser's shared `pos` ends up after a nested
 * `parseObject` call breaks early.
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
  // `source` is held beside `tokens` so `parseObject` can slice
  // `TypeNode.interiorSource` directly off this string, quoting and
  // inter-token whitespace intact relative to it — the author's own source
  // bytes for a brace-group interior since bug 0228, and otherwise whatever
  // text the caller threaded through.
  constructor(
    private readonly tokens: readonly TypeToken[],
    private readonly source: string,
  ) {}

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
    // Captured before `eatPunct("{")` consumes it: one past its own `start`
    // is the source offset `interiorSource` (below) slices from.
    const openBrace = this.peek();
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
    // one's. `fieldNames` feeds only bug 0154's identifier retention
    // (`TypeNode`'s doc comment states why it stays), so this latch still
    // guards that list even though `theta/parse/duplicate-inline-field-name`
    // reads `interiorSource` instead.
    let namesStopped = false;
    // Set when the CURRENT entry's field-name position was occupied by a
    // non-`ident` token (a name outside `Ident`'s alphabet, `lexical.md`
    // §Identifiers). The ASCII tail this loop then reads at the next position
    // is not text the author wrote as a field name, so it must not reach
    // `fieldNames` for bug 0154's identifier pass to judge — that name is
    // `theta/parse/inline-field-name-not-identifier`'s subject instead.
    // Cleared once the entry-separating `,` is consumed, since only the
    // tainted entry's own residue is affected. A skipped `,` at a field-name
    // position closes an EMPTY entry rather than opening one, so the taint
    // lifts there too — otherwise the following entry's own field name, which
    // the author did write, would be suppressed.
    let entryTainted = false;
    while (this.peek() !== undefined && this.peek()?.text !== "}") {
      // FieldName `:` Type — hold the name token until the colon behind it is
      // consumed, which is the whole of the retention key (`TypeNode`'s doc
      // comment states it).
      const fieldName = this.peek();
      if (fieldName !== undefined && fieldName.kind === "ident") {
        this.next();
      } else {
        entryTainted = fieldName?.text !== ",";
        this.next();
        continue;
      }
      if (!this.eatPunct(":")) {
        // A malformed entry accounts for itself and for nothing else
        // (code-registry-parse.md:101's count-consequence sentence, scoped to
        // "that field"): resynchronise at this interior's next depth-0 `,`
        // instead of ending the loop, so every entry behind this one still
        // reaches `fieldNames` / `fieldTypes` and every check those arrays
        // feed. `entryTainted` is cleared because the skip already consumed
        // the whole abandoned entry — there is no residue left for the latch
        // to guard — and the entry the skip lands on is one the author did
        // write.
        this.skipMalformedEntry();
        entryTainted = false;
        continue;
      }
      // The interior has now spelled `Ident ":"` at a field-name position, so
      // the name is retained ahead of its type: `parsePrimary`'s tolerant
      // punctuation skip can consume the FOLLOWING field's tokens as this
      // field's type, and a name the author wrote must not vanish because a
      // neighbour's text was eaten.
      if (!namesStopped && !entryTainted) {
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
      entryTainted = false;
    }
    const braceClosed = this.eatPunct("}");
    const closingBraceIndex = interiorClosingBraceIndex(this.tokens, interiorStart);
    const closingBraceToken = closingBraceIndex >= 0 ? this.tokens[closingBraceIndex] : undefined;
    // The text between this node's own `{` and the depth-0 `}`
    // `closingBraceToken` names, in `this.source` — empty when the interior
    // never closes, since there is then no such span to slice (`TypeNode`'s
    // doc comment). Sliced off `TypeToken.start` offsets rather than
    // reconstructed from token texts, so the bytes are exactly what
    // `splitTopLevel` / `topLevelColon` would see if handed `this.source`
    // directly — quoting and inter-token whitespace intact relative to
    // `this.source`, which since bug 0228 is itself the author's own source
    // bytes for a brace-group interior at every `Type` position.
    const interiorSource =
      closingBraceToken !== undefined
        ? this.source.slice((openBrace?.start ?? 0) + 1, closingBraceToken.start)
        : "";
    return {
      kind: "object",
      fieldTypes,
      fieldNames,
      interiorHasTokens,
      braceClosed,
      closingBraceSpelled: closingBraceToken !== undefined,
      interiorSource,
    };
  }

  /**
   * Resynchronises `parseObject`'s field loop at a malformed entry's next
   * depth-0 `,`, so the entry behind it is read rather than discarded (bug
   * 0231). Nesting-aware for the same reason `splitTopLevel(interiorSource,
   * ",", "angle-and-brace")` (./params) is: the boundary this skip
   * resynchronises on must be the SAME boundary `inlineObjectFieldKeys`
   * splits `interiorSource` on, so the loop's view of the interior and the
   * raw-key view agree for an interior whose brackets are balanced or merely
   * unclosed. The two diverge on a stray CLOSE token at depth 0: this skip
   * clamps (a depth-0 `}`/`>` returns without decrementing, below), while
   * `splitTopLevelSegments` (./params) underflows on the same token, after
   * which no later comma reads as top-level there. On that class the loop's
   * field inventory and the raw-key inventory can differ.
   *
   * Stops WITHOUT consuming a depth-0 `}` or `>`: the interior's own closing
   * brace must remain for `parseObject`'s `eatPunct("}")` to read, and a
   * generic argument's `>` must remain for `parseGeneric` to read. Consuming
   * either here would hand the enclosing parse a token it still needs.
   */
  private skipMalformedEntry(): void {
    let depth = 0;
    while (this.peek() !== undefined) {
      const text = this.peek()?.text;
      if (depth === 0 && text === ",") {
        this.next();
        return;
      }
      if (depth === 0 && (text === "}" || text === ">")) {
        return;
      }
      if (text === "{" || text === "<") {
        depth += 1;
      } else if (text === "}" || text === ">") {
        depth -= 1;
      }
      this.next();
    }
  }
}

/**
 * The comparison key `theta/parse/duplicate-inline-field-name` AND
 * `theta/parse/quoted-inline-field-name` (`walkType`'s `object` arm, below)
 * run over: every entry a brace-and-angle-aware top-level comma split of
 * `interiorSource` yields
 * (`splitTopLevel(interiorSource, ",", "angle-and-brace")`, `./params`),
 * keyed on that entry's own raw text before its own top-level `:`
 * (`topLevelColon`, `./params`) after `trim()` — no unquoting, no
 * normalisation. This is the SAME split and the SAME colon
 * `hoistInlineObjectType` (params.ts) and `lowerInlineObject`
 * (body-type-lowering.ts) key their `properties` and `required` writes on,
 * which is the whole point of route (a) (bug 0159 §Fix): the comparison then
 * agrees with what is minted BY CONSTRUCTION, not by fixture.
 *
 * An entry with no top-level `:` contributes no key, and so does an entry
 * whose pre-colon text trims to empty (`{: x, : y}`). An entry whose TYPE
 * position is empty still KEEPS its key (`{a: integer, a: }` repeats `a`) —
 * unlike the two lowerers above, which additionally skip an entry whose
 * post-colon text is empty; this rule's key is the SOURCE's field-name
 * positions, not the lowered artefact's, and a name the author wrote at two
 * such positions is a repeat whether or not either position parses a type.
 */
function inlineObjectFieldKeys(interiorSource: string): string[] {
  const keys: string[] = [];
  for (const entry of splitTopLevel(interiorSource, ",", "angle-and-brace")) {
    const colon = topLevelColon(entry);
    if (colon < 0) {
      continue;
    }
    const key = entry.slice(0, colon).trim();
    if (key.length === 0) {
      continue;
    }
    keys.push(key);
  }
  return keys;
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
 *     under EVERY `rules` value — one of the five checks `"inline-object-shape"`
 *     admits — and is unqualified by `position`, by `isRoot`, or by nesting
 *     depth beneath a generic argument: an empty `array<{}>` argument still
 *     fires. An
 *     unterminated `{` fails the second half and stays silent: `ObjectType`
 *     requires the closing brace, so there is no inline object type there to
 *     call empty.
 *   - `theta/parse/binding-case-mismatch` (bug 0154) — an entry of
 *     `TypeNode.fieldNames`, the theta-side IDENTIFIER retention, whose first
 *     character is neither `_` nor a lowercase letter, excluding a spelling
 *     that is a member of the lexer's own `reservedKeywords()` (Disposition A:
 *     a keyword-shaped inline field name stays with the reserved-keyword
 *     class's own open report, not this one). `fieldNames` is NOT the same key
 *     `duplicate-inline-field-name` / `quoted-inline-field-name` below read —
 *     those key on `TypeNode.interiorSource`'s raw, unnormalised entry text,
 *     deliberately not an identifier, while this rule needs identifier TOKENS.
 *     Runs under EVERY `rules` value, gated ONLY on `TypeNode.closingBraceSpelled`
 *     (the same grammar requirement the empty rule above reads, and the one
 *     the two raw-key rules below share): every rule at this arm judges the
 *     SOURCE key regardless of nesting depth beneath a generic argument — the
 *     LOWERING never dividing that interior into fields (`params.ts`'s
 *     `lowerTypeExpr`) bounds the WIRE consequence a key has, not whether the
 *     source spelling is judged — so `array<{ Ys: string }>` fires. Emits
 *     BEFORE the two raw-key rules below
 *     so `{ Ys: string, Ys: string }` reads as two `binding-case-mismatch`
 *     lines then one `duplicate-inline-field-name` line, in emission order
 *     (`assembleDiagnostics`' stable sort cannot separate same-range
 *     diagnostics by column).
 *   - `theta/parse/duplicate-inline-field-name` — two entries of the split
 *     `inlineObjectFieldKeys` derives from `TypeNode.interiorSource` share a
 *     key — the raw text before that entry's own top-level `:`, after
 *     `trim()`, with no unquoting and no normalisation — AND the source
 *     spells the interior's closing `}` (`TypeNode.closingBraceSpelled`, the
 *     grammar requirement the empty rule above reads off `braceClosed`):
 *     `ObjectType` spells that brace, so an unterminated `{` is no inline
 *     object type and holds no interior for this rule to compare. The split
 *     is `splitTopLevel(interiorSource, ",", "angle-and-brace")` (`./params`)
 *     and the colon is `topLevelColon` (`./params`) — the SAME functions
 *     `hoistInlineObjectType` (params.ts) and `lowerInlineObject`
 *     (body-type-lowering.ts) key their `properties` and `required` writes
 *     on, so this rule's answer agrees with what is lowered BY CONSTRUCTION
 *     (bug 0159 §Fix route (a)). There is no stop: every entry the split
 *     yields is compared, regardless of what any other entry in the same or
 *     an enclosing interior spells. One diagnostic per repeated key, at its
 *     second occurrence, in source order — `seen` tracks a key's first
 *     occurrence and `reported` its emission, both `Set`s, so a third
 *     occurrence draws no second line. Runs under EVERY `rules` value — one
 *     of the five checks `"inline-object-shape"` admits — and is
 *     unqualified by `position`, by `isRoot`, or by nesting depth beneath a
 *     generic type argument: a generic argument's interior is never divided
 *     into fields at the LOWERING, so no duplicate `required` is ever minted
 *     on the WIRE from there (code-registry-parse.md's row, "Two shapes sit
 *     outside this row") — but the source key still repeats, and this rule
 *     judges the source, not the lowered artefact. `TypeNode.fieldNames` —
 *     not this rule's key — stays on the node for bug 0154's identifier
 *     rules, which need identifier tokens rather than this rule's raw entry
 *     text.
 *   - `theta/parse/quoted-inline-field-name` — a non-repeating entry of the
 *     same `inlineObjectFieldKeys` split whose key's first character is `"`
 *     or `'`. The inline field-name slot reuses the object-schema `Field`
 *     form (grammar.md §"Inline object types"), and `schemas.md`'s field
 *     names are identifiers — an identifier admits no quote character
 *     (`lexical.md`) — so the declaration spelling of the same text is
 *     already refused (`checkObjectSchema`, schema-declarations.ts); this
 *     rule brings the inline position into agreement with it. Shares the
 *     duplicate rule's gate above (`closingBraceSpelled`) and its comparison
 *     key, and answers alike at any depth beneath a generic type argument on
 *     the same ground as the duplicate rule: the LOWERING never divides that
 *     interior into fields, which bounds what reaches the wire, not what
 *     this rule judges. A key that REPEATS is the duplicate rule's subject
 *     alone: this rule fires only for a key occurring exactly once, so
 *     `{"a": string, "a": integer}` draws one `duplicate-inline-field-name`
 *     line and no second line from this rule. Runs under EVERY `rules`
 *     value — one of the five checks `"inline-object-shape"` admits.
 *   - `theta/parse/renamed-inline-field-name` (bug 0160) — a non-repeating,
 *     non-quote-led entry of the same `inlineObjectFieldKeys` split whose raw
 *     text matches `Ident "as" (String)` — an inline `as "WireName"` rename
 *     (`schemas.md:23` fixes the clause's position between the field
 *     identifier and its type). `TypeParser.parseObject`'s field loop meets
 *     the `as` token where a `:` is required and resynchronises at this
 *     entry's next depth-0 `,` before that spelling is ever retained as a
 *     `Field`, so no `Type` position parses the rename
 *     `grammar.md`'s inline-object section names, and neither
 *     `theta/parse/wire-name-collision` nor
 *     `theta/parse/redundant-wire-name` — the two codes that sentence assigns
 *     — can ever fire there. This rule refuses the spelling instead of
 *     teaching `parseObject` to parse it: at ten of the eleven `Type`
 *     positions the surrounding document rebuilds the type source by joining
 *     lexer tokens with no separator, so a fix keyed on `parseObject`'s own
 *     tokens would answer only at the one position that does not
 *     token-join (`params:`) — a position-DEPENDENT rule, against
 *     `type-system.md`'s one-grammar-in-every-position invariant — and the
 *     token-joined text (`a as "w"` → `aas"w"`) has already lost the
 *     `theta`-side/wire-side boundary the rename exists to express, so
 *     recovering wire-name SEMANTICS from it needs a change to the type-source
 *     capture that is out of this rule's scope. Shares both raw-key
 *     neighbours' gate above (`closingBraceSpelled`) and their comparison
 *     key, and is subordinate to both: a key that repeats is the duplicate
 *     rule's alone, and a key whose first character is a quote is the quoted
 *     rule's alone, so this test never reaches either. The pattern is written
 *     to match BOTH spellings a raw key can arrive as and yield the SAME
 *     capture — the theta-side identifier — from either, which is what lets
 *     one rule answer alike at every position; that identifier is also
 *     exactly what `<field>` renders (category 5, identifier-shaped,
 *     `placeholder-rendering-b.md`), so unlike its two raw-key neighbours —
 *     whose subject IS the raw, unnormalised entry text — this row needs no
 *     row-scoped exception of its own either. This row answers alike at any
 *     depth beneath a generic type argument for the same reason its
 *     neighbours do: the LOWERING never divides that interior into fields,
 *     which bounds what a rename would reach on the wire, not whether the
 *     source rename clause is judged. Runs under EVERY `rules` value — the
 *     fifth check `"inline-object-shape"` admits.
 *
 * Every `rules` value still descends generic arguments, object field types
 * and union arms, so a nested empty inline object, a nested ill-cased name, a
 * nested repeated field name, a nested quoted field name, or a nested
 * rename-bearing field name is found at any depth regardless of which of the
 * three `"all"`-only checks are withheld. The six rules at the `object` arm
 * below judge the SOURCE key at every depth and through every generic
 * argument alike — the LOWERING never dividing a generic argument's interior
 * into fields (`params.ts`'s `lowerTypeExpr`) bounds the WIRE consequence a
 * key has, not whether the source spelling is judged — so `walkType` carries
 * no flag distinguishing a generic argument's subtree from any other.
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
      // A generic type argument's interior is one more `ObjectType`
      // interior: nothing narrows `rules` or `position` for it, so it draws
      // the same six object-arm rules as any other subtree.
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
        // `rules`, being one of the five checks `"inline-object-shape"` admits.
        if (node.braceClosed) {
          out.push(emptySchemaBodyDiagnostic("{}", site));
        }
        return;
      }
      // Bug 0154's identifier pass — the lowercase-first rule (lexical.md) over
      // `TypeNode.fieldNames`, the theta-side IDENTIFIER retention (not the raw
      // entry text the two rules below key on). Gated ONLY on the grammar's own
      // closing-brace requirement (`ObjectType` spells `}`) — the same gate the
      // two raw-key rules below share, so this pass and they answer alike at
      // any depth beneath a generic argument: the LOWERING never dividing that
      // interior into fields (a fact about the lowered artefact) bounds what
      // reaches the wire from there, not whether the source's field-name
      // position is judged, and it exists at any depth, so `array<{ Ys: string }>`
      // must still fire. Emits BEFORE the raw-key rules below so the settled
      // order holds: a
      // declaration-ranged diagnostic cannot be separated from another at the
      // same range by column, so `assembleDiagnostics`' stable sort keeps
      // emission order, and the identifier pass over `fieldNames` is read first.
      // A reserved-keyword-shaped name is excluded by set membership
      // (`RESERVED_KEYWORDS`, above) rather than left to an identifier-shape
      // guard alone — `tokeniseType` has no keyword kind, so `Ok` / `Err` /
      // `Result` present as plain `ident` text exactly as `Ys` does, and without
      // the exclusion this pass would draw the wrong code on them (Disposition
      // A, docs/bugs/0154).
      if (node.closingBraceSpelled) {
        for (const name of node.fieldNames) {
          if (RESERVED_KEYWORDS.has(name)) {
            continue;
          }
          const first = name.charAt(0);
          const isUpper = first >= "A" && first <= "Z";
          if (isUpper) {
            out.push({
              severity: "error",
              code: "theta/parse/binding-case-mismatch",
              file: site.file,
              range: site.range,
              message: "binding name must start with a lowercase letter or _",
            });
          }
        }
      }
      // `theta/parse/duplicate-inline-field-name` stands on one gate: the
      // grammar's own closing brace. `ObjectType` spells it, so an interior
      // the source never closes holds no interior to compare — the same
      // requirement the empty rule reads above, asked of the source because
      // the tolerant recovery can spend this interior's `}` on a missing type
      // position (`TypeNode`'s doc comment). A generic type argument's
      // interior draws the same gate: `TypeParser.parseObject` parses it
      // exactly as it parses any other object type — brace-aware, not
      // angle-only — so `interiorSource` holds the repeat there just as it
      // does anywhere else, and this rule names it. The LOWERING's own
      // generic-argument handling (`params.ts`'s `lowerTypeExpr`, through
      // `splitTopLevel`'s default angle-only nesting) never divides that
      // interior into fields, so no duplicate `required` is ever minted on
      // the WIRE from there (code-registry-parse.md's row, "Two shapes sit
      // outside this row"; bug 0052 §Non-goals) — that fact bounds the wire
      // consequence of a repeated key, not whether this rule judges the
      // source. `seen` / `reported` are `Set`s, never a plain object, so an
      // author-chosen key can never collide with an object's own prototype
      // keys.
      if (node.closingBraceSpelled) {
        const keys = inlineObjectFieldKeys(node.interiorSource);
        // A key that repeats within this interior is `duplicate-inline-field-name`'s
        // subject alone (bug 0176 §Fix precedence): counting occurrences up front,
        // rather than deciding key-by-key as the loop below runs, is what lets a
        // key's FIRST occurrence know it will repeat and withhold the quoted-name
        // row for it, matching the SECOND occurrence's suppression.
        const occurrences = new Map<string, number>();
        for (const key of keys) {
          occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
        }
        const seen = new Set<string>();
        const reported = new Set<string>();
        for (const key of keys) {
          if ((occurrences.get(key) ?? 0) > 1) {
            if (!seen.has(key)) {
              seen.add(key);
              continue;
            }
            if (reported.has(key)) {
              continue;
            }
            reported.add(key);
            out.push({
              severity: "error",
              code: "theta/parse/duplicate-inline-field-name",
              file: site.file,
              range: site.range,
              message: `duplicate field name '${key}' within one inline object type`,
            });
            continue;
          }
          // A non-repeating key whose first character is a quote is not an
          // identifier (`schemas.md:17` fixes a field name there; `lexical.md:13`'s
          // identifier production admits no quote character), so the raw entry text
          // that survived `topLevelColon` unquoted is exactly the spelling to name.
          // `a as "w"`'s key (`aas"w"` token-joined, `a as "w"` at `params:`) starts
          // with a letter and is left untouched by this test; it falls through to the
          // rename test below instead.
          const firstChar = key.charAt(0);
          if (firstChar === '"' || firstChar === "'") {
            out.push({
              severity: "error",
              code: "theta/parse/quoted-inline-field-name",
              file: site.file,
              range: site.range,
              message: `quoted field name '${key}' within one inline object type; field names are identifiers`,
            });
            continue;
          }
          // `theta/parse/renamed-inline-field-name` (bug 0160) — the raw key spells
          // an `Ident "as" String` rename (`INLINE_FIELD_RENAME`, above). This site
          // is the raw-key loop rather than `TypeParser.parseObject`'s field-name
          // token test, on purpose: at ten of the eleven `Type` positions the
          // document reconstructs the type source by joining lexer tokens with no
          // separator, so a parse-level fix keyed on `parseObject`'s own tokens
          // would fire ONLY at the one position that does not token-join
          // (`params:`) — a position-dependent rule, against
          // `type-system.md`'s one-grammar-everywhere invariant — and the
          // mangled text `aas"w"` at the other ten has already lost the `theta`/
          // `wire` boundary the rename exists to express, so wire-name SEMANTICS
          // are unrecoverable there without changing the token-join capture,
          // which is out of this fix's scope (0160 §Fix (a), route 2 v. route 1).
          // The regex is written to match both spellings and yield the SAME
          // capture — the theta-side identifier — from either, which is what lets
          // one rule answer alike at every position. That identifier is also
          // exactly what `<field>` renders: it is category 5, identifier-shaped
          // (`placeholder-rendering-b.md`), so this row needs no row-scoped
          // exception beside its two raw-key neighbours' — their subject is the
          // raw, unnormalised entry text, and this row's subject never is. This
          // row answers alike at any depth beneath a generic argument for the
          // same reason its neighbours do (not 0154's identifier-pass reason):
          // its subject is the raw key the LOWERING mints as a property name,
          // and a generic argument's interior is never divided into fields, so
          // no such key ever reaches the wire from there — which bounds the
          // wire consequence, not whether the source rename clause is judged.
          const renamed = INLINE_FIELD_RENAME.exec(key);
          if (renamed !== null) {
            out.push({
              severity: "error",
              code: "theta/parse/renamed-inline-field-name",
              file: site.file,
              range: site.range,
              message: `wire-name rename on field '${renamed[1]}' within one inline object type`,
            });
            continue;
          }
          // `theta/parse/inline-field-name-not-identifier` (bug 0228) — fourth
          // and last in this loop's precedence: a key that reaches here has
          // already declined the repeat, quote-led and rename tests above, so
          // this is a key whose raw text is not an `Ident`
          // (`schemas.md:17` fixes a field name as an identifier;
          // `lexical.md:13` gives `Ident` as `[A-Za-z_][A-Za-z0-9_]*`, which
          // admits no space). A sibling refusal to
          // `theta/parse/fn-param-not-identifier` (bug 0225), asked of a raw
          // inline field-name key rather than of a parameter binding: the
          // TYPE this entry declares may be well-formed (bound E3 of bug
          // 0228's witness pins that this row does not widen the
          // `*-type-not-expression` rows), so the message names the key, not
          // the type.
          if (!INLINE_FIELD_IDENT.test(key)) {
            out.push({
              severity: "error",
              code: "theta/parse/inline-field-name-not-identifier",
              file: site.file,
              range: site.range,
              message: `field name '${key}' within one inline object type is not an identifier`,
            });
          }
        }
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
