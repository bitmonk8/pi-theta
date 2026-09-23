// Position-sensitive diagnostic rule walker over parsed type expressions.

// The rendered message's field-name interpolation is collapsed through
// `normaliseLiteralValueLineBreaks` so an author-controlled name carrying a
// break cannot forge the diagnostic message's reserved multi-line shapes
// (bug 0384; diagnostic-shape.md single-line-summary rule).
import { normaliseLiteralValueLineBreaks, type Diagnostic } from "../diagnostics/diagnostic";
import { reservedKeywords } from "../lexer/lexer";
import { isTypeLikeName } from "../lexer/name-case";
import { splitTopLevel, topLevelColon } from "./params";
import { emptySchemaBodyDiagnostic } from "./schema-declarations";
import type { TypeNode, TypePosition, TypeCheckRules, TypeCheckSite } from "./type-grammar";

/**
 * The reserved-spelling exclusion `walkType`'s `object` arm needs for bug
 * 0154's identifier pass (Disposition A): a keyword-shaped inline field name
 * (`Ok`, `Err`, `Result`, `let`, …) must not draw `binding-case-mismatch`,
 * because `tokeniseType` has no keyword kind at all and would otherwise
 * present every one of them exactly as it presents `Ys`. Derived ONCE at
 * module scope from the lexer's own exported set, the same shape
 * `src/parser/params-lowering.ts` and `src/parser/frontmatter.ts` already use for the
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
 * The closed `GenericType` set (grammar.md:99–:100, :107 — "No other
 * identifier is parameterisable"). Exported for `lowerTypeExpr`
 * (`src/parser/params-lowering.ts`), which exempts these two constructor keywords
 * from its reserved-head refusal by membership here rather than by name —
 * one closed set read by both places that judge a generic head, rather than
 * a second copy that could drift.
 */
export const GENERIC_ARITY: Readonly<Record<string, number>> = Object.freeze({
  array: 1,
  Result: 2,
});

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
 *     under EVERY `rules` value — one of the checks `"inline-object-shape"`
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
 *     a keyword-shaped inline field name draws
 *     `theta/parse/reserved-keyword-as-identifier` at this same arm instead of
 *     this rule — bug 0249). `fieldNames` is NOT the same key
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
 *     of the checks `"inline-object-shape"` admits — and is
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
 *     value — one of the checks `"inline-object-shape"` admits.
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
 *     source rename clause is judged. Runs under EVERY `rules` value — one
 *     of the checks `"inline-object-shape"` admits.
 *
 * Every `rules` value still descends generic arguments, object field types
 * and union arms, so a nested empty inline object, a nested ill-cased name, a
 * nested repeated field name, a nested quoted field name, or a nested
 * rename-bearing field name is found at any depth regardless of which of the
 * three `"all"`-only checks are withheld. The rules at the `object` arm
 * below judge the SOURCE key at every depth and through every generic
 * argument alike — the LOWERING never dividing a generic argument's interior
 * into fields (`params-lowering.ts`'s `lowerTypeExpr`) bounds the WIRE consequence a
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
      // the same object-arm rules as any other subtree.
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
        // `rules`, being one of the checks `"inline-object-shape"` admits.
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
          if (isTypeLikeName(name)) {
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
        checkInlineFieldKeys(node.interiorSource, site, out);
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

/** Check a closed inline object's raw keys in duplicate, quoted, renamed, identifier precedence. */
function checkInlineFieldKeys(
  interiorSource: string,
  site: TypeCheckSite,
  out: Diagnostic[],
): void {
  const keys = inlineObjectFieldKeys(interiorSource);
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

export { walkType };
