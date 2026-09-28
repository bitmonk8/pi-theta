// Shared type-text splitters and predicates for parser consumers.
// Literal-atom recognition lives here with the refusal predicate so this
// module has no import back to params-lowering.ts or body-type-lowering.ts.

/**
 * Whether `s` is a SINGLE enclosing brace group: the `{` at index 0 is closed
 * by the `}` at the final index, with no unmatched close before then (quote
 * contents are skipped so a brace inside a string literal cannot perturb
 * depth). `lowerTypeSource` (body-type-lowering.ts) and `lowerParamsFieldType`
 * (params-lowering.ts) both ask this of the whole source, then of each arm of a union
 * through `lowerBraceGroupUnionArms` (params-lowering.ts) — every caller needs it rather
 * than a naive `startsWith("{") && endsWith("}")`, which also matches
 * `{a: integer} | {b: integer}`: a UNION of two object arms whose first `{`
 * closes at `{a: integer}`, well short of the string's end. Reading that
 * interior as one field list yields the single field `a` of type
 * `integer} | {b: integer` and mints a `properties.a` fragment for a shape the
 * author never wrote at that level — the silently WRONG lowering bug 0039 §Fix
 * constraint 1 forbids ("a shape the lowering cannot derive stays permissive
 * `{}`… permissive is admissible, wrong is not"). Declining the whole source
 * is what lets the union split instead, and on a segment set the split left
 * INTACT (`isBraceBalanced` below is what decides that) every brace-group arm
 * is a genuine `Type` and hoists on its own terms.
 *
 * `lowerQueryResponseSchema` (query-schema-lowering.ts) and
 * `collectUnresolvedNamedTypes` (body-type-lowering.ts) ask the identical
 * question of their own root for the identical reason (bug 0053 §Fix): a root
 * position is one more place a naive prefix/suffix test reads a union of
 * object arms as a single field list. Exporting the one predicate is what
 * keeps a root position and an arm position from answering that question two
 * different ways.
 *
 * The predicate serves callers beyond the type-lowering dispatches: the
 * discriminator-field classifier in `theta-document.ts` asks it for the same
 * reason at a non-lowering position (bug 0096 §Fix). `lowerParamsFieldType`
 * (params-lowering.ts) asks it too, in place of the positional `startsWith("{") &&
 * endsWith("}")` test bug 0039 §Fix's byte-freeze had kept there: bug 0097
 * §Fix is the authority that lifts the freeze for a top-level union of
 * brace-balanced arms, and this predicate paired with
 * `lowerBraceGroupUnionArms` (params-lowering.ts) is what the lifted position now asks. No
 * dispatch or classifier in this codebase still asks the naive two-ended
 * question on its own account — only this predicate's own first statement
 * does, because that statement IS the fast decline every caller relies on.
 *
 * Defined here rather than in `body-type-lowering.ts`, which imports from
 * this module and not the reverse (bug 0039 §Fix's import-direction rule) —
 * the same rule that keeps `hoistInlineObjectType` and
 * `lowerBraceGroupUnionArms` in `params-lowering.ts` too. `body-type-lowering.ts`
 * re-exports this name so its own importers (`theta-document.ts`,
 * `query-schema-lowering.ts`) keep reaching it at the same import path.
 */
export function isSingleEnclosingBraceGroup(s: string): boolean {
  if (!(s.startsWith("{") && s.endsWith("}"))) {
    return false;
  }
  let depth = 0;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i] ?? "";
    if (c === '"' || c === "'") {
      i = skipQuotedRegion(s, i);
    } else if (c === "{") {
      depth += 1;
    } else if (c === "}") {
      depth -= 1;
      if (depth === 0) {
        return i === s.length - 1;
      }
    }
  }
  return false;
}

/**
 * Whether `s`'s own brace depth starts at zero, never goes negative, and ends
 * at zero (quote contents skipped, as above). Asked of EVERY segment of the
 * `|` split before any arm may hoist: a set carrying one unbalanced segment is
 * a set the split SHREDDED, and a shredded set has no arms to dispatch.
 *
 * WHY the question is worth asking. `splitTopLevel(s, "|")` here runs in its
 * angle-only default, which tracks `<…>` and quotes but not `{…}`, so a `|`
 * written INSIDE a brace group reads as an arm separator and cuts the group
 * into pieces: `Cat | {a: integer | {c: Ghost} | boolean}` presents as the
 * four segments `Cat`, `{a: integer`, `{c: Ghost}`, `boolean}`. Two of those
 * are visibly not types — one opens a brace it never closes, the other closes
 * a brace it never opened — and that is what this predicate sees.
 *
 * WHY A BALANCED-LOOKING SEGMENT INSIDE A SHREDDED SET IS STILL NOT A `Type`.
 * `{c: Ghost}` above is balanced and is a single enclosing brace group, yet it
 * is not an arm of this union at all: it is the type of a nested union arm
 * two levels down, inside the field `a` of the group the split destroyed.
 * Hoisting it would mint a `$defs` entry and emit a `$ref` for a shape the
 * author never wrote at THIS level — the silently wrong lowering bug 0039 §Fix
 * constraint 1 forbids — and would descend names the enclosing group's own
 * lowering never reaches, refusing thetas on a trigger that is positionally
 * invisible: `{ a: X | {c: Ghost} } | Cat` shreds into `{ a: X` and
 * `{c: Ghost} }`, neither of them a standalone group, while appending
 * ` | boolean` after the nested group leaves `{c: Ghost}` standing alone as a
 * segment. Where the cuts fall is a function of where the author put the next
 * `|`, not of the type.
 *
 * So a shredded set declines the arm dispatch entirely and the whole source
 * goes to `lowerTypeExpr`, which lowers each segment permissively — the
 * per-segment `anyOf` bug 0033 §Fix residual (ii) records, and the same
 * silence, since `lowerTypeExpr` has no inline-object arm to descend with.
 */
function isBraceBalanced(s: string): boolean {
  let depth = 0;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i] ?? "";
    if (c === '"' || c === "'") {
      i = skipQuotedRegion(s, i);
    } else if (c === "{") {
      depth += 1;
    } else if (c === "}") {
      depth -= 1;
      if (depth < 0) {
        return false;
      }
    }
  }
  return depth === 0;
}

/**
 * Parse a literal-type atom (a quoted string, integer/number, boolean, or
 * `null`) to its JSON value, or `undefined` when the atom is not a literal.
 * Wrapped so a legitimately-`null` literal is distinguishable from "not a
 * literal".
 *
 * Exported, and living here rather than in `body-type-lowering.ts`: that
 * module imports from this one and not the reverse (bug 0039 §Fix), and
 * `lowerLiteralSublanguage` (params-lowering.ts) — the one emission every caller sharing
 * this recogniser eventually reaches, `lowerParamsFieldType` and
 * `lowerTypeSource` (body-type-lowering.ts) among them — needs this
 * recogniser on the side of that boundary either caller can reach (bug 0056
 * §Fix).
 */
export function parseLiteralArm(source: string): { readonly value: unknown } | undefined {
  const s = source.trim();
  if (
    s.length >= 2 &&
    ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
  ) {
    return { value: s.slice(1, -1) };
  }
  if (s === "true") {
    return { value: true };
  }
  if (s === "false") {
    return { value: false };
  }
  if (s === "null") {
    return { value: null };
  }
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    return { value: Number(s) };
  }
  return undefined;
}

/**
 * Whether one `LowerCtx.unspellable` entry (a text `lowerTypeExpr`'s trailing
 * catch-all lowered permissively) is text the shared refusal owns, rather
 * than traffic the catch-all carries on the grammar's own behalf. Declined —
 * `false` — are exactly the two classes the catch-all is licensed to be
 * silent for: a `LiteralType` atom or union arm (`parseLiteralArm` above
 * recognises it) lowers under its own emission, and any fragment carrying a
 * `{` or `}` anywhere, balanced or not, belongs to the brace frame
 * (`lowerParamsFieldType`'s intercept, `hoistInlineObjectType`, both
 * params-lowering.ts, bugs
 * 0035/0045/0052) rather than to a catch-all refusal — WIDER than
 * "brace-rooted" by operator grant (bug 0059 §Fix, HEAD 948b7814):
 * `splitTopLevel`'s angle-only nesting can hand this arm an UNBALANCED half of
 * a shredded brace group (`array<{x: integer, y: string}>`'s two fragments,
 * `{x: integer` and `y: string}`), and neither half is brace-ROOTED, so a
 * narrower "brace-rooted" test would refuse both.
 *
 * THE EXEMPTION STILL OWNS ONLY BRACE-CARRYING FRAGMENTS. A THIRD OR LATER
 * interior field of a shredded brace group (`array<{a: string, b: integer,
 * c: boolean}>`'s middle shard, `b: integer`) carries neither `{` nor `}`
 * and this predicate alone would still call it refusable — that shard no
 * longer reaches this function from the generic-argument recursion (bug 0204
 * §Fix (b)(3), `classifyGenericArgumentSegments` below, called from
 * `lowerGenericApplication` in params-lowering.ts): it is filtered out before the `unspellable` sink
 * this predicate reads ever collects it, not by widening what this predicate
 * declines. The filter is per SEGMENT of that split, so a WHOLE argument of
 * the same list still arrives here and is still judged
 * (`array<{a: string, b: integer, c: boolean}, ???>` reaches this predicate
 * with `???` and nothing else), while junk the author wrote INSIDE a
 * manufactured shard is under-refused (`array<{a: Cat +, b: integer,
 * c: boolean}>` reaches this predicate with nothing at all) — the class bug
 * 0059's cell d13 already carries.
 *
 * ONE declined predicate for every position that refuses `unspellable` text —
 * `parseParams` (params.ts; the `params:` position, bug 0059 §Fix), the two body-position
 * emitters in `theta-document.ts` (a `schema` object-body field type and a
 * `schema X = …` alias/union arm, bug 0061 §Fix),
 * `annotationSourceIsNotTypeExpression` (type-layer-checks.ts, bug 0124 §Fix,
 * the `let` annotation / `fn` parameter / `fn` return positions), and
 * `walkExpr`'s `"query"` arm (theta-document.ts, bug 0203 §Fix, the `@<T>`
 * query ascription) — so narrowing it here narrows every position's refusal
 * at once, and none of the four keeps a private copy of the check.
 */
export function isUnspellableTextRefusable(text: string): boolean {
  return parseLiteralArm(text) === undefined && !text.includes("{") && !text.includes("}");
}

/**
 * Whether `text` carries a string literal that never closes: a `"` or `'`
 * opens a quoted region (a backslash inside one consumes the character behind
 * it, as `isSingleEnclosingBraceGroup` and `topLevelColon` above both scan)
 * and no matching quote closes it before the text ends. This is the `params:`
 * position's OWN detection (bug 0232 §Fix (b)): the type grammar never reaches
 * a `params:` field's recovered text, so no lexer arm (the
 * `theta/parse/unterminated-string` arm of `scanTokens`, `src/lexer/lexer.ts`)
 * ever sees the unterminated literal the eight lexed positions refuse on
 * sight; this predicate is what stands in for that arm here.
 *
 * Deliberately independent of `isUnspellableTextRefusable`
 * (`isUnspellableTextRefusable`, above): that predicate's brace exemption is
 * unmoved by this fix (bug 0232 §Fix Constraint 2 — `{a: integer`, a
 * genuinely unbalanced BRACE with no unterminated literal, stays admitted),
 * so this is a second, narrower question asked of the field's WHOLE type-half
 * source text rather than of the `unspellable` sink: a nested field
 * (`{q: {a as "w: integer}}`) or a generic argument
 * (`array<{a as "w: integer}>`) never reaches that sink at all
 * (`classifyGenericArgumentSegments`'s arity-1 branch routes it sink-less),
 * but scanning the whole source text finds the open quote regardless of what
 * brace or angle structure surrounds it.
 */
function hasUnterminatedStringLiteral(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i] ?? "";
    if (c === '"' || c === "'") {
      i = skipQuotedRegion(text, i);
      if (i >= text.length) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Skip a `"`/`'` quoted region: given the index of the OPENING quote in
 * `text`, return the index of its closing quote, or `text.length` when the
 * literal never closes. A backslash inside the region consumes the character
 * behind it, so an escaped quote does not close the literal. This is the ONE
 * copy of the quote/escape rule the quote-aware scanners share —
 * `isSingleEnclosingBraceGroup`, `isBraceBalanced`,
 * `hasUnterminatedStringLiteral`, `topLevelColon` and
 * `findCutBracketGroupText` here, `splitParamValue`
 * (./frontmatter-params) and `braceGroupCarriesUnmatchedCloseToken`
 * (./annotation-validation) — so all of them agree on what a quoted region
 * is by construction rather than by seven mirrored loops. A caller resumes
 * its own scan at the returned index: its loop increment steps past the
 * closing quote, or past the end when the region is unterminated.
 */
export function skipQuotedRegion(text: string, openIndex: number): number {
  const quote = text[openIndex];
  for (let i = openIndex + 1; i < text.length; i += 1) {
    const c = text[i];
    if (c === "\\" && i + 1 < text.length) {
      i += 1;
    } else if (c === quote) {
      return i;
    }
  }
  return text.length;
}

/**
 * Find the top-level `:` in a `field: Type` entry, respecting `<>`/`{}`
 * nesting and honouring `"`/`'` string escapes: a backslash inside a quoted
 * region consumes the character behind it rather than being tested against
 * the closing quote. This scan and `splitTopLevelSegments` (below) must
 * agree on where a quoted region ends, because the raw key the three
 * inline raw-key rules compare and the property name both lowerers mint
 * are both derived from the entry text this function's colon divides in
 * two (bug 0229).
 *
 * Nesting is a TYPED opener stack, not a bare depth counter: `>` closes only
 * an open `<`, `}` only an open `{`, `)` only an open `(`. A close token whose
 * innermost open frame is of another kind, or whose stack is empty, is
 * INERT — it neither opens nor closes a level, so a stray `>` inside an open
 * `{…}` cannot cancel that brace (bug 0238 §Fix: the typed rule is what
 * closes the nested case a bare `Math.max(0, depth - 1)` floor leaves
 * unrepaired).
 */
export function topLevelColon(entry: string): number {
  const open: string[] = [];
  for (let i = 0; i < entry.length; i += 1) {
    const c = entry[i] ?? "";
    if (c === '"' || c === "'") {
      i = skipQuotedRegion(entry, i);
    } else if (c === "<" || c === "{" || c === "(") {
      open.push(c);
    } else if (c === ">" || c === "}" || c === ")") {
      const top = open[open.length - 1];
      if ((c === ">" && top === "<") || (c === "}" && top === "{") || (c === ")" && top === "(")) {
        open.pop();
      }
    } else if (c === ":" && open.length === 0) {
      return i;
    }
  }
  return -1;
}

/**
 * Which bracket pairs `splitTopLevel` counts as nesting.
 *
 *   - `"angle"` — `<…>` alone. The union-arm splits and `lowerTypeExpr`'s own
 *     GENERIC ARGUMENT split use this, and widening either would change which
 *     fragments they lower: `array<{a: string, b: integer}>` would present as one
 *     argument and take the `array` arm, emitting a fragment that asserts
 *     arrayness while dropping the element shape, and `{a: 1 | 2}` would stop
 *     splitting into arms at all. The GENERIC ARGUMENT split can still cut a
 *     `{…}`/`[…]` group the author wrote as one unit — the segment count and
 *     every lowered byte are exactly what this mode always produced — but the
 *     pieces of such a cut are no longer JUDGED: bug 0204 §Fix (b)(3) marks
 *     each segment whole-in-the-source or not
 *     (`classifyGenericArgumentSegments`, below, with `withoutUnspellableSink`
 *     beside `lowerGenericArgument` in params-lowering.ts) and recurses only the pieces
 *     under a `LowerCtx` carrying no `unspellable` sink, so a piece can never
 *     reach `isUnspellableTextRefusable`'s decline while a whole argument
 *     beside it still can.
 *   - `"angle-and-brace"` — `<…>` and `{…}`. This is what the `Type` grammar
 *     requires wherever a comma separates items whose own `Type` may be an
 *     `ObjectType`: grammar.md §"Type grammar" makes `ObjectType` a `Type` and
 *     §"Inline object types" admits it "in any `Type` position", recursively.
 *     Two lists need it. A `GenericType` ARGUMENT list —
 *     `Result<{a: string, b: integer}, QueryError>` has exactly two arguments and
 *     its first carries a comma, so an angle-only split yields three parts and
 *     disagrees with the parser that computes
 *     `theta/parse/generic-arity-mismatch`. And the inline-object FIELD LIST,
 *     where a nested `ObjectType` is a single field's type: `hoistInlineObjectType`
 *     (params-lowering.ts) splits it for every type position that hoists, and
 *     `lowerInlineObject` (body-type-lowering.ts) splits it for the annotation
 *     root it lowers in place. `hoistInlineObjectType`'s comment records what an
 *     angle-only split mints there.
 */
export type TypeSplitNesting = "angle" | "angle-and-brace";

/**
 * Split a type expression on a top-level `separator` into every trimmed
 * segment, in source order, respecting `nesting` bracket depth and `"`/`'`
 * string literals so nested generics, inline object types and literal arms
 * are not split mid-token. Segments are returned INCLUDING the empty ones —
 * a leading, trailing or doubled `separator` yields an empty string at that
 * position rather than silently disappearing. `splitTopLevel` (below) is
 * this function's non-empty filter, and the split is factored this way
 * because one caller needs to tell "one well-formed arm" apart from "an arm
 * position the author left empty": `AliasRhs ::= Type ("|" Type)*` treats
 * `schema X = Cat |` and `schema X = Cat` differently even though both
 * filter down to the one arm `Cat` (bug 0042 §Fix — the malformed-alias-rhs
 * check compares this function's segment count against `splitTopLevel`'s arm
 * count, so the two functions' contracts have to be read together).
 */
export function splitTopLevelSegments(
  source: string,
  separator: string,
  nesting: TypeSplitNesting = "angle",
): string[] {
  const parts: string[] = [];
  const tracksBraces = nesting === "angle-and-brace";
  // A TYPED opener stack, not a bare depth counter (bug 0238 §Fix): `>` closes
  // only an open `<`, `}` (under `"angle-and-brace"`) only an open `{`. A
  // close token whose innermost open frame is of the other kind, or whose
  // stack is empty, is INERT — it neither opens nor closes a level, so a
  // stray `>` inside an open `{…}` does not cancel that brace and the
  // separator behind an unmatched close token stays top-level.
  const open: string[] = [];
  let quote: string | undefined;
  let current = "";
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i] ?? "";
    if (quote !== undefined) {
      current += c;
      if (c === "\\" && i + 1 < source.length) {
        current += source[i + 1] ?? "";
        i += 1;
      } else if (c === quote) {
        quote = undefined;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      current += c;
      continue;
    }
    if (c === "<" || (tracksBraces && c === "{")) {
      open.push(c);
      current += c;
      continue;
    }
    if (c === ">" || (tracksBraces && c === "}")) {
      const top = open[open.length - 1];
      if ((c === ">" && top === "<") || (c === "}" && top === "{")) {
        open.pop();
      }
      current += c;
      continue;
    }
    if (open.length === 0 && c === separator) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += c;
  }
  parts.push(current.trim());
  return parts;
}

/**
 * `splitTopLevelSegments`'s non-empty filter — the split every pre-existing
 * caller wants (a generic's argument list, a union's arm list, an inline
 * object's field list), where a blank arm position carries no information
 * and is dropped rather than surfaced as an empty string. Empty segments are
 * dropped, so `splitTopLevel("")` is `[]` and a dangling separator
 * (`splitTopLevel("Cat|", "|")` is `["Cat"]`) reads as one arm, not one arm
 * plus a blank. A caller that must distinguish those two inputs reads
 * `splitTopLevelSegments` instead.
 */
export function splitTopLevel(
  source: string,
  separator: string,
  nesting: TypeSplitNesting = "angle",
): string[] {
  return splitTopLevelSegments(source, separator, nesting).filter(
    (segment) => segment.length > 0,
  );
}

export { isBraceBalanced, hasUnterminatedStringLiteral };

/** One segment of a generic argument list, with whether the SOURCE spells it. */
export interface ClassifiedArgumentSegment {
  /** The trimmed segment text — byte-identical to `splitTopLevel`'s entry. */
  readonly text: string;
  /** Whole in the source: both delimiting commas at group depth 0, and balanced. */
  readonly whole: boolean;
}

/**
 * `lowerTypeExpr`'s generic-argument list, cut exactly where its angle-only
 * `splitTopLevel` cuts it, with each segment marked whole-in-the-source or not
 * (bug 0204 §Fix (b)(3)). A segment is WHOLE iff every comma boundary that
 * delimits it sat at `{…}`/`[…]` depth 0 — the start and end of the interior
 * count as such boundaries — and the segment's own groups balance. Anything
 * else is a piece the split cut out of a group the author wrote as one unit,
 * and only those pieces recurse without the refusal sink.
 *
 * `array<{a: string, b: integer, c: boolean}, ???>`'s interior is why the
 * decision is per SEGMENT and not per list: three of its four segments are
 * pieces of the cut `{…}` group, and the fourth, `???`, is a whole argument
 * the source spells and keeps its judgement.
 *
 * The scan reproduces `splitTopLevelSegments`' `"angle"` idiom byte for byte —
 * in that mode the split's stack holds only `<`, so its length is the same
 * floored angle depth this scan counts, the same quote/escape handling, the
 * same trim, and `splitTopLevel`'s non-empty filter — so `text` in order equals
 * `splitTopLevel(interior, ",")` and the classification indexes that array
 * directly. It adds one counter the split does not keep, `{}`/`[]` depth, and
 * changes no cut point: widening the split itself is §Fix (b)(1), whose cost
 * is landed lowered bytes (bug 0164's `d6`/`d7` pin the unwidened shape as
 * deliberate), and sharing bug 0124's position-level decline over the whole
 * captured source is §Fix (b)(2), which drops TRUE refusals
 * (`{a: array<Cat +>}` and its siblings) that carry both a brace and an angle
 * bracket. Classifying leaves the split, its segment count and every lowered
 * byte untouched; only a manufactured piece's access to the refusal sink
 * changes.
 */
export function classifyGenericArgumentSegments(interior: string): ClassifiedArgumentSegment[] {
  const segments: ClassifiedArgumentSegment[] = [];
  let angle = 0;
  let group = 0;
  let quote: string | undefined;
  let current = "";
  // The interior's start is a boundary at group depth 0 by construction.
  let leftBoundaryWhole = true;
  let segmentGroup = 0;
  let segmentUnbalanced = false;
  const push = (rightBoundaryWhole: boolean): void => {
    const text = current.trim();
    if (text.length > 0) {
      segments.push({
        text,
        whole:
          leftBoundaryWhole && rightBoundaryWhole && segmentGroup === 0 && !segmentUnbalanced,
      });
    }
    current = "";
    segmentGroup = 0;
    segmentUnbalanced = false;
    leftBoundaryWhole = rightBoundaryWhole;
  };
  for (let i = 0; i < interior.length; i += 1) {
    const c = interior[i] ?? "";
    if (quote !== undefined) {
      current += c;
      if (c === "\\" && i + 1 < interior.length) {
        current += interior[i + 1] ?? "";
        i += 1;
      } else if (c === quote) {
        quote = undefined;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
    } else if (c === "<") {
      angle += 1;
    } else if (c === ">") {
      // Floored, not decremented: a stray `>` with no open `<` must not cancel
      // an enclosing `{`/`[` group, and this scan is angle-only, so the floor
      // and bug 0238's typed opener-stack rule coincide here (§Fix
      // constraint 3 — this scan reproduces `splitTopLevelSegments`' `"angle"`
      // idiom byte for byte).
      angle = Math.max(0, angle - 1);
    } else if (c === "{" || c === "[") {
      group += 1;
      segmentGroup += 1;
    } else if (c === "}" || c === "]") {
      group -= 1;
      segmentGroup -= 1;
      if (segmentGroup < 0) {
        segmentUnbalanced = true;
      }
    } else if (c === "," && angle === 0) {
      push(group === 0);
      continue;
    }
    current += c;
  }
  // The interior's end is a boundary at group depth 0 whenever the whole
  // interior balances; an unbalanced tail is itself a piece, not an argument.
  push(group === 0);
  return segments;
}

/**
 * For a generic-argument-list `interior`, the source text of the innermost
 * `[…]` group that the angle-only comma split (`splitTopLevel`,
 * `classifyGenericArgumentSegments`, above) CUTS — the group enclosing a cut
 * comma (angle depth 0, `{}`/`[]` group depth ≥ 1) whose innermost currently
 * open group is bracket-rooted — extended LEFT over the immediately
 * preceding identifier run and through the matching `]`, or `undefined` when
 * the split cuts no such group (bug 0217 §Fix (b)(2)).
 *
 * A `{…}` group is `ObjectType` (grammar.md:101, :109) — one of `Type`'s six
 * alternatives (grammar.md:90–:102) — so a cut `{…}` group is exactly what
 * bug 0204's per-segment suppression protects and this helper never returns
 * it: only a group whose innermost open frame at the cut is `[` is a
 * candidate, because `enum[…]` and every other `[…]` spelling derive from
 * none of `Type`'s six alternatives at any depth (schemas.md:93, stated with
 * no depth qualifier). `array<{a: enum["a", "b"]}>`'s interior is why the
 * frame stack — not a bare brace/bracket depth counter — is what decides it:
 * the comma inside `enum["a", "b"]` sits under an OPEN `{` too, but the
 * innermost open frame at that comma is the `[`, so this returns the `enum`
 * spelling and never the enclosing derivable object.
 *
 * The scan reproduces `classifyGenericArgumentSegments`' idiom byte for byte
 * — the same angle counter, the same `{}`/`[]` depth tracking, the same
 * quote/escape handling — so the cut point this finds is the SAME cut point
 * that scan already marks non-whole. This is a sibling read of that scan, not
 * a second splitter: it never changes `splitTopLevel`'s cut points or
 * `classifyGenericArgumentSegments`' `text`/`whole` vectors (bug 0204 cell
 * l3's lock, restated over bug 0217's interiors in
 * tests/nested-inline-enum-generic-argument-refusal.test.ts group (a)).
 *
 * The returned text is the construct the AUTHOR wrote, not the bracket pair
 * alone — `enum["a", "b"]`, never the bare `["a", "b"]` and never either
 * manufactured piece (`enum["a`, `"b"]`) — so the sink entry a caller pushes
 * (`pushCutBracketGroupAsLastResort`, ./params-lowering) names the illegal spelling
 * itself, matching what the bare `enum["a", "b"]` already carries into this
 * same sink at depth 0.
 *
 * When more than one bracket group is cut (nested brackets), the innermost
 * one is returned by construction: its closing bracket is reached, and its
 * frame popped, before any enclosing bracket frame's own closing bracket is,
 * so the first frame recorded here is already the innermost.
 *
 * The matching `]` is REQUIRED: a group the source never closes
 * (`array<enum["a", "b">`) leaves its frame open at the end of the scan, no
 * frame is ever recorded, and this returns `undefined` — so such an input
 * draws whatever the positions' other rows draw for it and nothing from this
 * helper. That is an AUTHORIZED under-refusal, stated here rather than left
 * to be discovered: the returned text is the construct the author wrote, and
 * there is no such construct to name when its extent is unknown — an
 * unclosed group's end could be any byte to the interior's end. §Fix names
 * two routes for a CUT, CLOSED bracket group and neither addresses malformed
 * bracket nesting, so an unclosed group stays outside bug 0217's reach and
 * with the positions' own capture-level rows (measured: the alias arm refuses
 * it, the `schema` field type and `params:` admit it, and the `let` position
 * draws its own `let-without-initialiser` — fence cell (h1) in
 * tests/nested-inline-enum-generic-argument-refusal.test.ts).
 */
export function findCutBracketGroupText(interior: string): string | undefined {
  interface BracketFrame {
    readonly opener: "{" | "[";
    readonly start: number;
    cut: boolean;
  }
  const stack: BracketFrame[] = [];
  let angle = 0;
  let found: { readonly start: number; readonly end: number } | undefined;
  for (let i = 0; i < interior.length; i += 1) {
    const c = interior[i] ?? "";
    if (c === '"' || c === "'") {
      i = skipQuotedRegion(interior, i);
    } else if (c === "<") {
      angle += 1;
    } else if (c === ">") {
      // Floored for the same reason as `classifyGenericArgumentSegments`,
      // above, whose idiom this scan reproduces byte for byte (bug 0238 §Fix
      // constraint 3): angle-only, so the floor is the typed rule here.
      angle = Math.max(0, angle - 1);
    } else if (c === "{" || c === "[") {
      stack.push({ opener: c, start: i, cut: false });
    } else if (c === "}" || c === "]") {
      const frame = stack.pop();
      if (frame !== undefined && frame.cut && frame.opener === "[" && found === undefined) {
        found = { start: frame.start, end: i };
      }
    } else if (c === "," && angle === 0 && stack.length > 0) {
      const top = stack[stack.length - 1];
      if (top !== undefined && top.opener === "[") {
        top.cut = true;
      }
    }
  }
  if (found === undefined) {
    return undefined;
  }
  let left = found.start;
  while (left > 0 && /[A-Za-z0-9_]/.test(interior[left - 1] ?? "")) {
    left -= 1;
  }
  return interior.slice(left, found.end + 1);
}
