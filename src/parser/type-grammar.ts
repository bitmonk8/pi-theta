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
// V2a-T (tests-task) declares these seam shapes and stubs the two checks as
// inert no-ops (no diagnostic produced) so the failing tests compile and red on
// their own primary assertions (the type-expression parser and sink-resolution
// engine are absent). The paired V2a implementation leaf fills them in.

// The rendered message's field-name interpolation is collapsed through
// `normaliseLiteralValueLineBreaks` so an author-controlled name carrying a
// break cannot forge the diagnostic message's reserved multi-line shapes
// (bug 0384; diagnostic-shape.md single-line-summary rule).
import { normaliseLiteralValueLineBreaks, type Diagnostic, type SourceRange } from "../diagnostics/diagnostic";
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
  // Built before the parser runs and handed in by the constructor (explicit
  // dependency injection, no module-level state): `TypeParser.parseObject`
  // (bug 0244, operator adjudication) needs both `site` — a `TypeNode` carries
  // no range of its own, so a keyless-entry refusal raised mid-parse must
  // borrow the enclosing declaration's — and this same array, so its refusal
  // lands ahead of `walkType`'s own diagnostics in emission order.
  const diagnostics: Diagnostic[] = [];
  const parser = new TypeParser(tokens, source, site, diagnostics);
  const node = parser.parse();
  if (node === undefined) {
    return diagnostics;
  }
  walkType(node, true, position, rules, site, diagnostics);
  return diagnostics;
}

/** A type-expression AST node (only what the position checks need to walk). */
type TypeNode =
  | { readonly kind: "prim"; readonly name: string }
  | { readonly kind: "named"; readonly name: string }
  | { readonly kind: "void" }
  | { readonly kind: "literal" }
  /**
   * A CLOSED `[…]` bracket group, consumed whole as one type-argument-sized
   * unit — `enum["a", "b"]`'s tail, or a bare `[integer]`. The group derives
   * from no `Type` alternative at any depth (schemas.md:93, stated with no
   * depth qualifier), so there is nothing on it for `walkType` to judge and
   * it falls to that function's `default` arm like any other leaf. Its whole
   * purpose is structural: consuming it puts the cursor past the group's `]`,
   * which is what stops the group's own interior commas from being read as an
   * ENCLOSING `parseGeneric` argument list's separators (bug 0236).
   */
  | { readonly kind: "bracket-group" }
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
       * outright: a completed field with no `,` behind it. That is the genuine
       * end of the interior whenever the preceding field's type parse left the
       * source's own separator standing, which includes an entry whose TYPE
       * position is empty: `parsePrimary` declines a `,` while a `parseObject`
       * field loop or a `parseGeneric` argument list is open (bug 0237 §Fix
       * route `resync-aware-skip`), so such an entry costs its own type alone
       * and the `,` is still there for `eatPunct(",")` to read. The break fires
       * MID-interior where the source spells no separator between two entries
       * at all (`{a: Zs: string}`), so nothing stands where `eatPunct(",")`
       * looks. The second leaves the loop running and stops
       * the pushes for the rest of the body — a field whose own parsed type carries an
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
       * (`interiorClosingBraceIndex`). The two diverge where the LAST entry's
       * type position is empty and `parsePrimary`'s tolerant punctuation skip
       * consumes the interior's own `}` looking for a type (`{a: integer, a: }`
       * — `braceClosed` false, `closingBraceSpelled` true; bug 0237's decline
       * is of the `,` alone and leaves this class exactly where it was, which
       * is why that source still draws
       * `theta/parse/duplicate-inline-field-name` — measured), and again where
       * a nested interior's `}` is the only one in the stream (`{a: {}, a: 2`
       * — a `}` was consumed, none of it this interior's, so both are false).
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
/**
 * The closed `GenericType` set (grammar.md:99–:100, :107 — "No other
 * identifier is parameterisable"). Exported for `lowerTypeExpr`
 * (`src/parser/params.ts`), which exempts these two constructor keywords
 * from its reserved-head refusal by membership here rather than by name —
 * one closed set read by both places that judge a generic head, rather than
 * a second copy that could drift.
 */
export const GENERIC_ARITY: Readonly<Record<string, number>> = Object.freeze({
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
 * `TypeParser.parseObject`'s own loop CONSUMED that brace — for a LAST entry
 * whose type position is empty, `parsePrimary`'s tolerant punctuation skip
 * consumes the interior's `}` while looking for a type (`{a: integer, a: }`;
 * `TypeNode`'s doc comment states the divergence), and the depth-0 requirement
 * here is what keeps a NESTED interior's brace from answering for an enclosing
 * one.
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
  // How many `,`-reading constructs — `parseObject` field loops and
  // `parseGeneric` argument lists, which separate their entries alike — are
  // OPEN at the position `parsePrimary` is reading. Ownership of a `,` is a
  // property of the enclosing parse state, not of the text: the same text is a
  // stray token wherever no such construct is mid-read, and a stray token's
  // only recovery has always been the skip-and-recurse arm. One counter
  // suffices because a `,` is owned identically by either construct, and only
  // the `,` is declined. Instance state rather than a parameter thread because
  // every intervening frame (`parseUnion`'s arm loop, a nested `parsePrimary`)
  // would otherwise have to carry a value it does not use.
  private openCommaReadingConstructs = 0;
  // `source` is held beside `tokens` so `parseObject` can slice
  // `TypeNode.interiorSource` directly off this string, quoting and
  // inter-token whitespace intact relative to it — the author's own source
  // bytes for a brace-group interior since bug 0228, and otherwise whatever
  // text the caller threaded through.
  constructor(
    private readonly tokens: readonly TypeToken[],
    private readonly source: string,
    // Bug 0244 (operator adjudication): the enclosing declaration's site and
    // the caller's diagnostics array, both explicit constructor dependencies
    // so `parseObject`'s discard arms can raise the keyless-entry refusal
    // where it happens rather than threading it back out through `parse()`'s
    // return value.
    private readonly site: TypeCheckSite,
    private readonly diagnostics: Diagnostic[],
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
    const node = this.parsePrimaryHead();
    if (node === undefined) {
      return undefined;
    }
    // A `[…]` group standing directly BEHIND the primary just produced is the
    // same carrier one token further right: `enum["a", "b"]`'s head is an
    // `Ident`, so the ident arm below already returned before the `[` is
    // reached, and without this the cursor would sit on `[` for `parseGeneric`'s
    // loop to trip over. The group derives from no `Type` alternative either
    // way (schemas.md:93), so it is consumed and dropped rather than attached
    // to the node it trails.
    while (this.closedBracketGroupEnd() >= 0) {
      this.consumeClosedBracketGroup();
    }
    return node;
  }

  /**
   * The token index one past a bracket group's closing `]`, when the cursor
   * stands on the group's opening `[` and the source goes on to close it —
   * `-1` when the cursor is not on `[` or the group never closes.
   *
   * The frame stack mirrors `findCutBracketGroupText`'s (`./params`, bug
   * 0217's recovery of the same construct's source text on the lowering side)
   * rather than a bare bracket counter, so a `{…}` written inside the group
   * cannot close it. Requiring the matching `]` is bug 0217's own
   * requirement restated on the parse side: an UNCLOSED group's extent is
   * unknowable to any scan, so nothing is consumed for it and the cursor
   * keeps the tolerant skip-and-recurse recovery this parser already has
   * (`code-registry-parse.md`'s `theta/parse/schema-type-not-expression` row;
   * bug 0236 §Non-goals, "An UNCLOSED bracket group").
   */
  private closedBracketGroupEnd(): number {
    const opener = this.peek();
    if (opener === undefined || opener.kind !== "punct" || opener.text !== "[") {
      return -1;
    }
    const frames: string[] = [];
    for (let i = this.pos; i < this.tokens.length; i += 1) {
      const token = this.tokens[i];
      if (token === undefined || token.kind !== "punct") {
        continue;
      }
      if (token.text === "[" || token.text === "{") {
        frames.push(token.text);
        continue;
      }
      if (token.text === "]" || token.text === "}") {
        const frame = frames.pop();
        if (frames.length === 0) {
          return frame === "[" && token.text === "]" ? i + 1 : -1;
        }
      }
    }
    return -1;
  }

  /** Advance the cursor past a closed bracket group standing at it. */
  private consumeClosedBracketGroup(): void {
    this.pos = this.closedBracketGroupEnd();
  }

  private parsePrimaryHead(): TypeNode | undefined {
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
      // A closed bracket group standing AS the primary itself (`enum["a"]`'s
      // bare form has no head to trail, and a comma-free carrier like
      // `[integer]` is a primary in its own right) is consumed whole here, one
      // unit of source, rather than one token at a time by the tolerant skip
      // below: that skip never leaves the group, so its interior commas would
      // otherwise be read as an ENCLOSING `parseGeneric` argument list's own
      // separators, truncating that list at the group (bug 0236).
      if (t.text === "[" && this.closedBracketGroupEnd() >= 0) {
        this.consumeClosedBracketGroup();
        return { kind: "bracket-group" };
      }
      // An entry SEPARATOR is the ENCLOSING construct's own text while that
      // construct is mid-read: an open `parseObject` field loop reads the
      // entry-separating `,`, and an open `parseGeneric` argument list reads
      // the argument-separating `,`. Yielding no type leaves that `,` for its
      // owner instead of spending it here, which is why an entry whose type
      // position is empty no longer costs the interior its separator and no
      // longer reads the NEXT entry's name as its own type (bug 0237 §Fix
      // route `resync-aware-skip`). With no such construct open nothing is
      // waiting for the token, so it stays a stray one and keeps the
      // skip-and-recurse recovery below, the only recovery it has — which is
      // what keeps `,void` as a whole annotation with no construct around it
      // (`let r = @<,void>`) drawing
      // `theta/parse/void-in-non-return-position`, measured identical before
      // and after.
      //
      // Only the `,` is declined. A `}` or `>` at a type position is the
      // empty-type-at-the-LAST-entry class, which bug 0237 §Reproduction (a)
      // row a4 and §(g) rows g2–g3 measure as already refused identically to
      // their controls and which its §Fix (c) forbids moving; declining it
      // would also cost a genuinely stray closer the skip-and-recurse recovery
      // that is its only one, losing the diagnostic the recursion goes on to
      // draw (`array<{a: >void}>` keeps `void-in-non-return-position`).
      if (t.text === "," && this.openCommaReadingConstructs > 0) {
        return undefined;
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
      // Open across the whole argument list, so `parsePrimary` declines
      // exactly the argument-separating `,` this list is still going to read.
      this.openCommaReadingConstructs += 1;
      try {
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
      } finally {
        this.openCommaReadingConstructs -= 1;
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
    // recovery can consume this interior's `}` from a LAST entry's empty type
    // position (`TypeNode`'s doc comment states the divergence), so wherever
    // `pos` ends up is no answer to it.
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
    // Bug 0244 (operator adjudication): the SOURCE entry the loop is currently
    // reading, and the buffered refusals for entries this interior has already
    // discarded. `entryStart` is the token index the CURRENT entry began at;
    // `entryRefused` latches once this entry has already drawn its one
    // refusal and is reset only when an entry SEPARATOR is consumed (a
    // genuine `,` between two source entries), so a later entry the author
    // did write is free to draw its own. `pending` buffers rather than pushes
    // to `this.diagnostics` directly: the refusal must be withheld when the
    // interior never closes, which keeps bug 0232's unterminated-literal class
    // unflipped (the flush below reads the same `closingBraceToken !==
    // undefined` gate the empty-schema and raw-key rules read).
    let entryStart = this.pos;
    let entryRefused = false;
    const pending: Diagnostic[] = [];
    // Bug 0257 (operator adjudication) — SL2/SL3/SL4/SL5's own state, additive
    // to bug 0244's above and cleared on the same events. `pendingSlotIndex` is
    // the `pending` index of the most recently opened empty entry slot's own
    // buffered line, valid only until the IMMEDIATELY following entry has been
    // judged (cleared once a `Field` derives, once a genuine entry separator is
    // crossed, or once that judgement has run) — the window SL5's adjacency
    // collapse is scoped to. `emptySlotBodyPushed` guards SL3's per-interior
    // cap: `theta/parse/empty-schema-body` reads "'{}' has no fields", which
    // cannot be true twice of one interior, so a second comma-only slot before
    // any `Field` derives buffers nothing further.
    let pendingSlotIndex: number | undefined;
    let emptySlotBodyPushed = false;
    // Open across the whole field loop, so `parsePrimary` declines exactly the
    // entry-separating `,` this loop is still going to read.
    this.openCommaReadingConstructs += 1;
    try {
      while (this.peek() !== undefined && this.peek()?.text !== "}") {
        // FieldName `:` Type — hold the name token until the colon behind it is
        // consumed, which is the whole of the retention key (`TypeNode`'s doc
        // comment states it).
        const fieldName = this.peek();
        if (fieldName !== undefined && fieldName.kind === "ident") {
          this.next();
        } else {
          // Bug 0244 (operator adjudication): a field-name position holding a
          // non-`ident` token discards the whole entry the same way the
          // colon-gate failure below does. Refuse it here, before `this.next()`
          // carries it away, scoped by `entryQualifiesForRefusal` to a KEYLESS
          // entry with no stray close token (0238's tolerant class) and no
          // top-level `:` (0252's and the tolerant skip's business elsewhere).
          if (fieldName?.text === ",") {
            // Bug 0257 (operator adjudication): the comma OPENS an empty entry
            // slot — spelling no `Field` at all — exactly when NO token has
            // been consumed for the current entry yet (`this.pos ===
            // entryStart`): a doubled, leading or post-trailing comma
            // (`ObjectType ::= "{" Field ("," Field)* ","? "}"`,
            // grammar.md:101). A comma reached with `this.pos` past
            // `entryStart` is instead the ORDINARY separator ending an entry
            // this arm has already been discarding one token at a time — a
            // stray-close-carrying keyless entry (0238's carve-out, `{b >,
            // m: integer}`) or colon-present junk (0252's) — and draws
            // nothing new: that entry's own disposition was already decided
            // when its first token was read, and a slot requires that no
            // token stood there at all.
            if (this.pos === entryStart) {
              // A `Field` already derived earlier in this interior sends the
              // slot to `malformed-schema-field` (one line per slot, bug
              // 0129's count-consequence law); no `Field` derived yet sends
              // it to `empty-schema-body`, buffered at most ONCE per interior
              // since "'{}' has no fields" cannot be true twice of one
              // interior. No grammar-legal spelling reaches this branch: a
              // well-formed entry's trailing comma is consumed by this loop's
              // own `eatPunct(",")` below, and the loop then exits on `}` —
              // so `{a: integer,}` / `{a: integer, }` never reach here.
              if (fieldTypes.length > 0) {
                pending.push(this.discardedEntryRefusal());
                pendingSlotIndex = pending.length - 1;
              } else if (!emptySlotBodyPushed) {
                pending.push(emptySchemaBodyDiagnostic("{}", this.site));
                emptySlotBodyPushed = true;
                pendingSlotIndex = pending.length - 1;
              }
            } else {
              pendingSlotIndex = undefined;
            }
            // The taint lifts (the entry behind this comma is one the author
            // did write) and the refusal latch resets so that entry can draw
            // its own line, whether this comma opened a slot or merely ended
            // an entry this arm already judged.
            entryStart = this.pos + 1;
            entryRefused = false;
          } else if (!entryRefused && this.entryQualifiesForRefusal(entryStart, interiorStart)) {
            // Bug 0257 SL5 — adjacency collapse: the entry immediately behind
            // an empty slot is itself keyless, so ITS refusal replaces the
            // slot's buffered line rather than adding a second
            // (code-registry-parse.md:104's count law; §Reproduction (c)
            // c1–c3 stay at one line).
            if (pendingSlotIndex !== undefined) {
              pending.pop();
              pendingSlotIndex = undefined;
            }
            pending.push(this.discardedEntryRefusal());
            entryRefused = true;
          } else {
            // Not a slot-opening comma, and this entry does not qualify for
            // 0244's refusal (a colon-present entry, or a stray-close-
            // carrying keyless entry) — the adjacency window for any pending
            // slot has passed with nothing to collapse into.
            pendingSlotIndex = undefined;
          }
          entryTainted = fieldName?.text !== ",";
          this.next();
          continue;
        }
        if (!this.eatPunct(":")) {
          // Bug 0244 (operator adjudication): the colon-gate failure is the
          // other discard arm, refused under the same scoping before the
          // resync below carries the entry away.
          if (!entryRefused && this.entryQualifiesForRefusal(entryStart, interiorStart)) {
            // Bug 0257 SL5 — the same adjacency collapse as the non-`ident`
            // arm's, for the ident-with-no-colon shape (`{,void}`, `{a:
            // integer,,zs}`): this entry's own refusal replaces an
            // immediately preceding empty slot's buffered line.
            if (pendingSlotIndex !== undefined) {
              pending.pop();
              pendingSlotIndex = undefined;
            }
            pending.push(this.discardedEntryRefusal());
            entryRefused = true;
          } else {
            pendingSlotIndex = undefined;
          }
          // A malformed entry accounts for itself and for nothing else
          // (code-registry-parse.md:101's count-consequence sentence, scoped to
          // "that field"): resynchronise at this interior's next depth-0 `,`
          // instead of ending the loop, so every entry behind this one still
          // reaches `fieldNames` / `fieldTypes` and every check those arrays
          // feed. `entryTainted` is cleared because the skip already consumed
          // the whole abandoned entry — there is no residue left for the latch
          // to guard — and the entry the skip lands on is one the author did
          // write.
          const crossedSeparator = this.skipMalformedEntry();
          if (crossedSeparator) {
            entryStart = this.pos;
            entryRefused = false;
            // Bug 0257: a genuine entry separator was crossed, so whatever
            // slot preceded this point is no longer adjacent to anything.
            pendingSlotIndex = undefined;
          }
          entryTainted = false;
          continue;
        }
        // The interior has now spelled `Ident ":"` at a field-name position, so
        // the name is retained ahead of its type: `parsePrimary`'s tolerant
        // punctuation skip can still consume tokens beyond this field where the
        // source spells no separator between two entries (`{a: Zs: string}`),
        // and a name the author wrote must not vanish because a neighbour's
        // text was eaten.
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
          // Bug 0257: a `Field` derived, so any earlier empty slot is no
          // longer the immediately adjacent one — nothing left to collapse
          // into this field.
          pendingSlotIndex = undefined;
        }
        // Optional `as "WireName"` rename — skip if present.
        if (this.peek()?.kind === "ident" && this.peek()?.text === "as") {
          this.next();
          if (this.peek()?.kind === "str") {
            this.next();
          }
        }
        if (!this.eatPunct(",")) {
          // Bug 0256 (operator ruling: OPTION 1 — resync-and-tolerate). A
          // missing entry separator does not end the loop: it resyncs
          // depth-aware to this interior's next top-level `,`, reusing
          // `skipMalformedEntry`'s bug-0238 typed-opener-stack machinery and
          // its `next()` hang-trap fallback — the same resync the
          // colon-gate-failure arm above runs. The STRANDING entry itself
          // (a colon-present junk tail like `a: b c`) draws NO line here: bug 0252's landed decline and bug
          // 0244's adjudication clauses 2 and 4 keep that class's
          // disposition unmoved (a3 parity), so this arm only resyncs and
          // never refuses. Crossing the separator proves the loop moved on
          // to an entry the author actually wrote, so the per-entry state
          // resets exactly as it does at the ordinary separator read below;
          // once resumed, 0244's own refusal fires on whatever it finds
          // there, including a keyless entry standing behind the junk tail.
          // A bare stop at a depth-0 `}` or `>` with nothing left to cross
          // leaves that token unconsumed for `parseObject`'s own
          // `eatPunct("}")` or the enclosing `parseGeneric` to read — the
          // boundary this loop stops at, never a `next()` past a close
          // token — so the loop still breaks there. Termination:
          // `skipMalformedEntry` either consumes at least the `,` it returns
          // `true` for, or runs out of tokens / stops on an unconsumed `}` /
          // `>` (bug 0238's clamp against a no-progress spin), so this arm
          // cannot spin on a stranding entry.
          const crossedSeparator = this.skipMalformedEntry();
          if (!crossedSeparator) {
            break;
          }
          entryTainted = false;
          entryStart = this.pos;
          entryRefused = false;
          pendingSlotIndex = undefined;
          continue;
        }
        entryTainted = false;
        entryStart = this.pos;
        entryRefused = false;
        // Bug 0257: the loop's own genuine `,` was consumed, so any earlier
        // empty slot is no longer adjacent to what follows.
        pendingSlotIndex = undefined;
      }
    } finally {
      this.openCommaReadingConstructs -= 1;
    }
    const braceClosed = this.eatPunct("}");
    const closingBraceIndex = interiorClosingBraceIndex(this.tokens, interiorStart);
    const closingBraceToken = closingBraceIndex >= 0 ? this.tokens[closingBraceIndex] : undefined;
    // Bug 0244 (operator adjudication): the buffered refusals flush only when
    // this interior's own closing `}` is spelled — the same grammar gate the
    // empty-schema and raw-key rules read off `closingBraceSpelled` below —
    // which keeps bug 0232's unterminated-literal class and the unclosed-
    // interior class unflipped: an interior that never closes pushes no
    // refusal onto `this.diagnostics` at all.
    if (closingBraceToken !== undefined) {
      this.diagnostics.push(...pending);
    }
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
   * raw-key view agree for an interior whose brackets are balanced, merely
   * unclosed, or carrying a close token with no matching opener. Both this
   * skip and `splitTopLevelSegments` (./params) treat such an unmatched close
   * token as INERT — tracked with a TYPED opener stack rather than a bare
   * depth counter, so a close token whose innermost open frame is of another
   * kind (or none) neither opens nor closes a level for either scan (bug
   * 0238 §Fix). The two inventories of one interior therefore agree.
   *
   * Stops WITHOUT consuming a depth-0 `}` or `>` whose stack is empty: the
   * interior's own closing brace must remain for `parseObject`'s
   * `eatPunct("}")` to read, and a generic argument's `>` must remain for
   * `parseGeneric` to read. Consuming either here would hand the enclosing
   * parse a token it still needs.
   *
   * Returns whether an entry SEPARATOR (a depth-0 `,`) was crossed — bug 0244
   * (operator adjudication) resets `parseObject`'s `entryRefused` latch on
   * that boundary and not on a bare stop at `}` / `>`, since only crossing a
   * separator proves the loop has moved on to an entry the author actually
   * wrote.
   */
  private skipMalformedEntry(): boolean {
    const open: string[] = [];
    while (this.peek() !== undefined) {
      const text = this.peek()?.text;
      if (open.length === 0 && text === ",") {
        this.next();
        return true;
      }
      if (open.length === 0 && (text === "}" || text === ">")) {
        return false;
      }
      if (text === "{" || text === "<") {
        open.push(text);
      } else if (text === "}" || text === ">") {
        const top = open[open.length - 1];
        if ((text === "}" && top === "{") || (text === ">" && top === "<")) {
          open.pop();
        }
      }
      this.next();
    }
    return false;
  }

  /**
   * Bug 0244 (operator adjudication)'s discarded-entry refusal: one
   * `theta/parse/malformed-schema-field` line, sharing the declaration
   * position's registered row and message text
   * (`theta-document.ts`'s `recoverMalformedSchemaField`, the sibling
   * emission this arm mirrors) rather than importing the test-only
   * `registryMessage` helper (`tools/code-registry`), which exists for a test
   * to assert against the registry and is not a runtime dependency.
   *
   * The range is the enclosing declaration's site (`this.site`), not the
   * offending token's: a `TypeNode` carries no range of its own, the same gap
   * `theta/parse/schema-type-not-expression` already crosses the same way
   * (`theta-document.ts`'s `schemaTypeNotExpressionDiagnostic`, which renders
   * the declaration's own identifier for the same structural reason).
   */
  private discardedEntryRefusal(): Diagnostic {
    return {
      severity: "error",
      code: "theta/parse/malformed-schema-field",
      file: this.site.file,
      range: this.site.range,
      message:
        "malformed schema field; each field is 'name: Type' or 'name as \"WireName\": Type'",
    };
  }

  /**
   * Bug 0244 (operator adjudication)'s scoping predicate, applied at the two
   * discard arms of `parseObject`'s field loop: an entry qualifies for the
   * refusal above exactly when it is KEYLESS — spells no top-level `:`, the
   * same depth-0 boundary rule `inlineObjectFieldKeys` / `topLevelColon` /
   * `splitTopLevel(…, "angle-and-brace")` use — AND carries no STRAY CLOSE
   * TOKEN of bug 0238's typed-opener-stack class (a `}` or `>` whose innermost
   * open frame, tracked from this entry's own start, is of another kind or
   * absent). An entry that spells a top-level `:` (colon-present — `{: x}` is
   * colon-present too, whatever its pre-colon text trims to) is out of this
   * fix's reach regardless of its text: that is bug 0252's business at the
   * annotation recogniser, or the tolerant skip elsewhere. A stray-close-
   * carrying keyless entry keeps bug 0238's silent tolerant registration —
   * the entry drops as that fix's own §Fix promises — so nothing is drawn
   * here for it, and whatever position-specific disposition 0238 or 0252
   * already settled for that class is not displaced by a second diagnostic.
   */
  private entryQualifiesForRefusal(entryStart: number, interiorStart: number): boolean {
    const { hasColon, hasStrayClose } = this.classifyEntry(entryStart, interiorStart);
    return !hasColon && !hasStrayClose;
  }

  /**
   * Scans `[entryStart, closingBraceIndex)` — EXCLUDING the interior's own
   * real closing `}` — for the same reason `interiorSource` (`TypeNode`'s doc
   * comment) is sliced off the same bound: within that span every `}` or `>`
   * this scan meets is inside the text `interiorSource`-keyed consumers
   * (`inlineObjectFieldKeys`, `splitTopLevelSegments`, `topLevelColon`) would
   * see too, so a genuinely stray token and this interior's own terminator
   * are never confused for one another — `{void}`'s lone entry never reaches
   * its own `}` inside this scan and is not misclassified as stray-close-
   * carrying.
   *
   * TWO STACKS, because the repository runs TWO scans over one interior and
   * they disagree about parens deliberately — this scan must mirror BOTH or
   * its inventory of an interior stops agreeing with the raw-key split's
   * (bug 0159's by-construction agreement, bug 0238 §Fix):
   *
   *   - `colonOpen` mirrors `topLevelColon` (`src/parser/params.ts`), the
   *     function that decides whether this same entry text contributes a key
   *     to `inlineObjectFieldKeys` and a property to the two lowerers. ONE
   *     typed opener stack carrying `(` beside `<` and `{`; a close token
   *     pops only when it matches the current top and is otherwise INERT; a
   *     `:` is top-level only when that stack is EMPTY. A separate paren
   *     counter cannot express this, because it cannot see a `<` stacked
   *     above an open `(` and so treats a CROSSED sequence's inert `)`
   *     (`( < ) > : x`) as closing the paren, reading a `:` as top-level that
   *     `topLevelColon` reads as nested — the keyed consumers would then mint
   *     no property while this scan withheld the refusal, and an interior of
   *     nothing but such entries would lower the permissive `{}`.
   *   - `boundaryOpen` mirrors `splitTopLevelSegments(…, ",",
   *     "angle-and-brace")` (`src/parser/params.ts`) and
   *     `skipMalformedEntry` (above): a BRACE-AND-ANGLE-only typed stack in
   *     which parens are wholly transparent — `(` and `)` neither push nor
   *     pop nor mark anything. A `,` ends the entry only when that stack is
   *     empty, so `{(a, b)}` is two entries here exactly as it is for the raw
   *     key split, while `{({a, b})}` is one. The same stack defines bug
   *     0238's STRAY CLOSE class: a `}` or `>` whose innermost BRACE/ANGLE
   *     frame is of another kind or absent.
   *
   * An unmatched `)` is therefore never a stray close token, exactly as it is
   * never one for the split, which keeps bug 0238's stray-close class defined
   * by `}` and `>` alone.
   */
  private classifyEntry(
    entryStart: number,
    interiorStart: number,
  ): { hasColon: boolean; hasStrayClose: boolean } {
    const closingBraceIndex = interiorClosingBraceIndex(this.tokens, interiorStart);
    const end = closingBraceIndex >= 0 ? closingBraceIndex : this.tokens.length;
    const colonOpen: string[] = [];
    const boundaryOpen: string[] = [];
    let hasStrayClose = false;
    for (let i = entryStart; i < end; i += 1) {
      const token = this.tokens[i];
      if (token === undefined) {
        break;
      }
      if (boundaryOpen.length === 0 && token.text === ",") {
        break;
      }
      if (colonOpen.length === 0 && token.kind === "punct" && token.text === ":") {
        return { hasColon: true, hasStrayClose };
      }
      if (token.text === "(") {
        colonOpen.push(token.text);
        continue;
      }
      if (token.text === ")") {
        if (colonOpen[colonOpen.length - 1] === "(") {
          colonOpen.pop();
        }
        continue;
      }
      if (token.text === "{" || token.text === "<") {
        colonOpen.push(token.text);
        boundaryOpen.push(token.text);
        continue;
      }
      if (token.text === "}" || token.text === ">") {
        const colonTop = colonOpen[colonOpen.length - 1];
        if ((token.text === "}" && colonTop === "{") || (token.text === ">" && colonTop === "<")) {
          colonOpen.pop();
        }
        const boundaryTop = boundaryOpen[boundaryOpen.length - 1];
        if (
          (token.text === "}" && boundaryTop === "{") ||
          (token.text === ">" && boundaryTop === "<")
        ) {
          boundaryOpen.pop();
        } else {
          hasStrayClose = true;
        }
      }
    }
    return { hasColon: false, hasStrayClose };
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
            // The exclusion above (Disposition A, docs/bugs/0154) keeps this
            // pass from drawing `binding-case-mismatch` on `Ok` / `Err` /
            // `Result` — but a reserved spelling still occupies an identifier
            // position (lexical.md:20), so it draws the reserved-keyword
            // refusal instead of falling through with none at all
            // (docs/bugs/0249). Ranged on `site.range`, the same
            // declaration-ranged site every other rule at this arm uses.
            // `reservedKeywordAsIdentifierDiagnostic` is `theta-document.ts`
            // private and that module already imports this one
            // (`parseTypeExpression`), so the shared shape is reproduced
            // in-line rather than introduced as a circular import; the
            // severity/code/message construction matches the builder
            // byte-for-byte (DIAG-4).
            out.push({
              severity: "error",
              code: "theta/parse/reserved-keyword-as-identifier",
              file: site.file,
              range: site.range,
              message: `reserved keyword '${name}' cannot be used as an identifier`,
            });
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
      // the tolerant recovery can spend this interior's `}` on a LAST entry's
      // missing type position (`TypeNode`'s doc comment), which would leave
      // `braceClosed` false for a brace the source does spell.
      // A generic type argument's interior draws the same gate: `TypeParser.parseObject` parses it
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
              message: `duplicate field name '${normaliseLiteralValueLineBreaks(key)}' within one inline object type`,
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
              message: `quoted field name '${normaliseLiteralValueLineBreaks(key)}' within one inline object type; field names are identifiers`,
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
              message: `field name '${normaliseLiteralValueLineBreaks(key)}' within one inline object type is not an identifier`,
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

