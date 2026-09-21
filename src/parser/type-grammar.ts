// V2a / V2a-T — the type-grammar parser seam.
//
// This module parses the type-expression grammar of grammar.md §"Type grammar"
// and type-system.md: the primitive / named / generic (`array` arity 1,
// `Result` arity 2) / inline-object / union / literal type forms, the
// return-only `void` annotation, and the `array<T>` literal type-sink rule of
// grammar.md §"array<T> literal type-sink rule". It delegates AST diagnostic
// checks to type-walk.ts.
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
//   - `theta/parse/malformed-schema-field` — a discarded keyless inline-object
//     entry meeting `TypeParser.entryQualifiesForRefusal`, or an illegal empty
//     entry slot after a derived field; buffered by `TypeParser.parseObject`
//     until the interior closes (bugs 0244 / 0257).
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
//   - `theta/parse/inline-field-name-not-identifier` (bug 0228) — a raw field
//     key that fails the `Ident` production after the duplicate, quoted and
//     renamed checks decline it. Shares their closing-brace gate and raw key.
//   - `theta/parse/binding-case-mismatch` (bug 0154) — an entry of
//     `TypeNode.fieldNames`, the theta-side IDENTIFIER retention, whose first
//     character is neither `_` nor a lowercase letter: the inline field-name
//     position reuses the object-schema `Field` form, so lexical.md's
//     lowercase-first rule reaches it exactly as it reaches an object-schema
//     body's own field name. Excludes a spelling that is a member of the
//     lexer's own `reservedKeywords()` (Disposition A — a reserved-keyword
//     spelling at this slot draws `theta/parse/reserved-keyword-as-identifier`
//     instead, bug 0249). Shares the empty
//     rule's closing-brace gate, the same gate the two raw-key rules above
//     share: every rule at this arm answers alike regardless of nesting
//     depth beneath a generic type argument, so a nested `array<{ Ys: string }>`
//     fires exactly as a nested `array<{ a b: string }>` does. Emits before
//     the two raw-key rules above.
//   - `theta/parse/reserved-keyword-as-identifier` (bug 0249) — a retained
//     inline field name in the lexer's `reservedKeywords()` set. Checked
//     before `binding-case-mismatch`, under the same closing-brace gate.
//
// A caller may select a narrower rule SET than the full walk
// (`parseTypeExpression`'s `rules` parameter; see `TypeCheckRules` below).

import type { Diagnostic, SourceRange } from "../diagnostics/diagnostic";
import { emptySchemaBodyDiagnostic } from "./schema-declarations";
import { walkType } from "./type-walk";

export { GENERIC_ARITY, walkType } from "./type-walk";

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
 *     lowercase-first identifier rule over the field name (bug 0154) and
 *     `theta/parse/reserved-keyword-as-identifier`'s keyword-spelling refusal
 *     beside it (bug 0249), `theta/parse/duplicate-inline-field-name`'s
 *     repeated-name rule, `theta/parse/quoted-inline-field-name`'s
 *     quote-led-key rule, `theta/parse/renamed-inline-field-name`'s (bug 0160)
 *     rename-clause refusal, and `theta/parse/inline-field-name-not-identifier`'s
 *     (bug 0228) non-identifier-key rule. The walk still DESCENDS generic arguments, object field types and union
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
export type TypeNode =
  /**
   * A primitive or declared-name head (`string`, `integer`, `Cat`, …) standing
   * alone: an opaque leaf carrying no payload, since no position check reads
   * the spelling — it falls to `walkType`'s `default` arm like `literal`.
   */
  | { readonly kind: "named" }
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
    // Any head with a following `<` — a closed-set generic constructor or not
    // — is parsed as an application so the arity check fires (e.g. `array`
    // arity computed from however many args appear); `walkType` reads
    // `GENERIC_ARITY` to decide which heads it judges.
    if (this.peek()?.text === "<") {
      return this.parseGeneric(name);
    }
    return { kind: "named" };
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
    // to bug 0244's above and cleared on the same events. `pendingSlotOpen`
    // records that the most recently opened empty entry slot's own buffered
    // line is the tail of `pending` (so SL5's collapse below `pop()`s it),
    // valid only until the IMMEDIATELY following entry has been judged
    // (cleared once a `Field` derives, once a genuine entry separator is
    // crossed, or once that judgement has run) — the window SL5's adjacency
    // collapse is scoped to. `emptySlotBodyPushed` guards SL3's per-interior
    // cap: `theta/parse/empty-schema-body` reads "'{}' has no fields", which
    // cannot be true twice of one interior, so a second comma-only slot before
    // any `Field` derives buffers nothing further.
    let pendingSlotOpen = false;
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
                pendingSlotOpen = true;
              } else if (!emptySlotBodyPushed) {
                pending.push(emptySchemaBodyDiagnostic("{}", this.site));
                emptySlotBodyPushed = true;
                pendingSlotOpen = true;
              }
            } else {
              pendingSlotOpen = false;
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
            // (`theta/parse/malformed-schema-field`'s registry row states the
            // replacement; §Reproduction (c) c1–c3 stay at one line).
            if (pendingSlotOpen) {
              pending.pop();
              pendingSlotOpen = false;
            }
            pending.push(this.discardedEntryRefusal());
            entryRefused = true;
          } else {
            // Not a slot-opening comma, and this entry does not qualify for
            // 0244's refusal (a colon-present entry, or a stray-close-
            // carrying keyless entry) — the adjacency window for any pending
            // slot has passed with nothing to collapse into.
            pendingSlotOpen = false;
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
            if (pendingSlotOpen) {
              pending.pop();
              pendingSlotOpen = false;
            }
            pending.push(this.discardedEntryRefusal());
            entryRefused = true;
          } else {
            pendingSlotOpen = false;
          }
          // A malformed entry accounts for itself and for nothing else (bug
          // 0129's count-consequence law, stated in
          // `theta/parse/inline-field-name-not-identifier`'s registry row and
          // scoped to "that field"): resynchronise at this interior's next depth-0 `,`
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
            pendingSlotOpen = false;
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
          pendingSlotOpen = false;
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
          pendingSlotOpen = false;
          continue;
        }
        entryTainted = false;
        entryStart = this.pos;
        entryRefused = false;
        // Bug 0257: the loop's own genuine `,` was consumed, so any earlier
        // empty slot is no longer adjacent to what follows.
        pendingSlotOpen = false;
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
