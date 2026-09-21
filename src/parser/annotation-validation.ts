// Shared validation and diagnostics for declared type-annotation captures.

import type { Diagnostic, Position, SourceRange } from "../diagnostics/diagnostic";
import { collectUnresolvedNamedTypes } from "./body-type-lowering";
import { isSingleEnclosingBraceGroup, isUnspellableTextRefusable } from "./params";
import { parseTypeExpression, type TypeCheckRules, type TypePosition } from "./type-grammar";

/** Position-specific checks and capture provenance for an annotation. */
interface AnnotationValidationSite {
  readonly position: TypePosition;
  readonly rules?: TypeCheckRules;
  /** Absent for invoke<T>, which does not run the not-a-type-expression check. */
  readonly name?: string;
  readonly range: SourceRange;
  readonly propagated?: () => boolean;
  readonly absorbed: boolean | undefined;
  readonly absorptionWindow: () => SourceRange;
}

/**
 * Validate one capture, then resolve its names unless its own diagnostics,
 * query propagation, or absorbed-source cover withhold resolution. Deferred
 * propagation/window reads preserve the original short-circuit order.
 */
export function validateTypeAnnotation(
  source: string,
  site: AnnotationValidationSite,
  refs: {
    readonly typeNames: ReadonlySet<string>;
    readonly priorDiagnostics: readonly Diagnostic[];
  },
  file: string,
  out: Diagnostic[],
): void {
  const { range } = site;
  const annotationDiagStart = out.length;
  out.push(...parseTypeExpression(source, site.position, { file, range }, site.rules));
  // bug 0124 §Fix, guard 1 (bug 0061's landed guard 1, PER-ANNOTATION
  // window): an annotation whose own walk above already drew an
  // error-severity diagnostic keeps that diagnostic ALONE.
  if (
    !out.slice(annotationDiagStart).some((d) => d.severity === "error") &&
    site.name !== undefined &&
    annotationSourceIsNotTypeExpression(source)
  ) {
    out.push(annotationTypeNotExpressionDiagnostic(site.name, range, file));
  }
  if (
    !(site.propagated?.() ?? false) &&
    !out.slice(annotationDiagStart).some((d) => d.severity === "error") &&
    !(
      (site.absorbed ?? false) &&
      captureWindowAlreadyRefused(
        refs.priorDiagnostics,
        out,
        site.absorptionWindow(),
        range,
      )
    )
  ) {
    const reservedKeywords: string[] = [];
    const unresolved = collectUnresolvedNamedTypes(
      source,
      withBuiltinErrorModelNames(refs.typeNames),
      reservedKeywords,
    );
    for (const keyword of reservedKeywords) {
      out.push(reservedKeywordAsIdentifierDiagnostic(keyword, range, file));
    }
    for (const name of unresolved) {
      out.push(unresolvedNamedTypeDiagnostic(name, range, file));
    }
  }
}

/**
 * Type / value names the theta 1.0 stdlib exposes bare (so they never read as an
 * unknown identifier). Primitive / generic type names never legally appear in
 * value position, but folding them in keeps the check false-positive-free if
 * one is written where the walk sees an identifier. `QueryError` / `Result` are
 * the error-model names an author may reference.
 */
export const BUILTIN_VALUE_NAMES: ReadonlySet<string> = new Set([
  "string",
  "number",
  "integer",
  "boolean",
  "null",
  "void",
  "array",
  "Result",
  "QueryError",
]);

/**
 * The registered `theta/parse/unresolved-named-type` rejection. Its trigger
 * (code-registry-parse.md) covers the full `NamedType`-reference position set
 * (bug 0262 §Fix, the FULL widening): the `params:` right-hand side, the
 * `@<T>` query annotation, a `schema` body field type, the right-hand side of
 * a `schema X = ...` alias/union declaration (bug 0033 §Fix), an
 * object-constructor name, a `match` object-pattern head, a `let` annotation,
 * an `fn` parameter type, an `fn` return type, and an `invoke<Type>`
 * ascription (grammar.md §Type grammar) — plus every generic argument, union
 * arm, `Result` argument and inline object field nested inside one of those.
 * `let x: Nope = 1` and `fn f(x: Nope): number { 1 }` refuse this code exactly
 * as `schema S { f: Nope }` always has.
 *
 * NINE of the ten reference positions emit through this builder.
 * `checkObjectExpr` (theta-document.ts; the object-constructor name), the `"schema"` case
 * of `walkStatement` plus its `"let"`, `"fn"`-parameter and `"fn"`-return
 * reads (in theta-document.ts — a `schema` body field type, a `let` annotation, an `fn`
 * parameter type and an `fn` return type), `walkExpr`'s `"query"` case (the
 * `@<T>` annotation) and its `"invoke"` case (the `invoke<T>` ascription), and
 * `checkSchemaDeclarationGraph` (the alias/union right-hand side) — eight
 * positions resolving names through `collectUnresolvedNamedTypes`
 * (body-type-lowering.ts). The ninth, `parsePattern`'s `match` object-pattern
 * head, resolves through `patternHeadTypeNames` instead: it references a
 * DECLARATION rather than a type expression, so it needs no lowering pass
 * (bug 0221 §Fix). The `@<T>` position reaches this builder only for
 * `Ident`-shaped text (grammar.md `NamedType ::= Ident`) that resolves to no
 * declaration: text that is not an `Ident` is refused ahead of this
 * resolution, by `theta/parse/query-annotation-type-not-expression` (bug 0203
 * §Fix), so this builder never sees it for that position. The tenth, the
 * `params:` RHS, emits the row's message from its own site (`parseParams`,
 * params.ts): params.ts is UPSTREAM of this module in the import graph (this
 * module imports its source predicates), so that site cannot reach this
 * builder without a cycle, and the two message literals are held identical to
 * the registry row by DIAG-4 rather than by sharing code.
 *
 * The RESOLUTION behind the four positions that carry a TYPE EXPRESSION is one
 * arm. A brace-rooted type source hoists under `__inline_<slug>`
 * (schema-subset.md:73) through `hoistInlineObjectType` (params.ts), which
 * walks the field list to `topLevelColon` and resolves each field's type
 * through the caller's own `lowerCtx` (bug 0039 §Fix). The `params:`
 * right-hand side reaches that arm through `lowerParamsFieldType`
 * (params.ts); the `@<T>` annotation, a `schema` body field type and the
 * alias/union right-hand side reach it through `lowerTypeSource`
 * (body-type-lowering.ts), which `collectUnresolvedNamedTypes` and the
 * `schema`-body lowering both run on. The fifth position, the
 * object-constructor name, resolves a NAME rather than a type expression, so
 * no inline object can nest under it. The annotation root is the one position
 * that ALSO lowers a fragment in place rather than hoisting it —
 * `lowerInlineObject`'s fragment is its document root — and that function's
 * interior `,` split nests brace depth exactly as the shared arm's does, so no
 * position reads a nested `ObjectType`'s comma as a FIELD-LIST separator.
 *
 * WHAT BOUNDS THE DESCENT IS THE ROUTE, NOT THE DEPTH. A name lands in
 * `lowerCtx.unresolved` from any nesting of inline-object FIELDS, because each
 * field's type re-enters the same arm — `{a: {x: {y: Tirage}}}` raises at all
 * four positions — and from any brace-group ARM of a top-level union, because
 * all four routes ask `lowerBraceGroupUnionArms` (params.ts) before falling
 * through to `lowerTypeExpr` and it hoists each brace-group arm of an intact
 * segment set on that arm's own terms (bug 0097 §Fix, which gave the `params:`
 * position the same dispatch its three siblings run): `{a: {x: Tirage} | Cat}`
 * raises for BOTH names at all four positions. The descent stops wherever the
 * route leaves that arm for `lowerTypeExpr`'s own recursion, which has no
 * inline-object arm and drops a brace-rooted source on its trailing catch-all.
 * Two shapes leave it, and each is a permissive silence rather than a wrong
 * fragment:
 *
 *   - a brace group inside a GENERIC ARGUMENT. `{a: array<{x: Tirage}>}`
 *     raises no unresolved-named-type at any position: `lowerTypeExpr`
 *     recurses an argument
 *     through itself, and the argument split stays angle-only — not because
 *     widening it would disagree with `theta/parse/generic-arity-mismatch`;
 *     measured, angle-only is the mode that DISAGREES with that parser (an
 *     angle-only split counts three arguments where `parseGeneric` counts
 *     one). `TypeSplitNesting`'s own doc (params.ts) states the relation
 *     correctly. The reason angle-only stands is the honesty one below: a
 *     brace-under-generic argument that widened would present as one
 *     argument and lower `{"type":"array","items":{}}`, asserting arrayness
 *     while dropping the element shape the source spells — bug 0204 keeps
 *     those bytes.
 *   - a brace group whose OWN interior `|` sits beside another arm.
 *     `{ a: Tirage | null } | Cat` raises none anywhere either: the angle-only
 *     `|` split SHREDS the group into `{ a: Tirage` and `null }`, and
 *     `lowerBraceGroupUnionArms` declines the arm dispatch for any segment set
 *     carrying a shard like those — at every position alike, since it is the
 *     one dispatch all four routes ask — handing the whole source to
 *     `lowerTypeExpr`, which has no inline-object arm to descend with. The
 *     decline holds even when one shard is itself a balanced brace group —
 *     `Cat | {a: integer | {c: Ghost} | boolean}` leaves `{c: Ghost}` standing
 *     as a segment, a NESTED arm inside the destroyed group rather than an arm
 *     of this union, so `Ghost` raises nowhere (bug 0033 §Fix residual (ii);
 *     `SchemaDecl.arms`' own caveat records the same split from the capture
 *     side, and `isBraceBalanced` (params.ts, module-private) states why a
 *     balanced shard is no exception).
 *
 * `splitTopLevel`'s `"angle"` default keeps that permissive outcome HONEST for
 * a brace-under-generic shape instead of papering over it. With brace depth
 * also tracked, `array<{a: string, b: integer}>` would present as one argument
 * and lower to `{"type":"array","items":{}}` — a fragment asserting arrayness
 * while dropping the element shape the author wrote, so a payload of arbitrary
 * elements would validate as though checked against it. Under angle depth alone
 * the same text splits into two arguments, the `array` arm does not match, and
 * the form lowers to `{}`, which asserts nothing — matching the fact that
 * nothing about the shape was derived. `queryResponseAnnotation` (theta-document.ts) is the
 * one caller needing `"angle-and-brace"`: it lowers nothing itself and wants to
 * agree with the parser computing `theta/parse/generic-arity-mismatch` about
 * the ARGUMENT COUNT. That agreement holds for a brace-carried argument (both
 * count `ObjectType` as one unit) but not for a `[…]` bracket group
 * (bug 0236): this split stays bracket-blind by the same angle-only-plus-brace
 * design that keeps it derivable-shape-only, so it still counts a bracket
 * group's own interior comma as an argument boundary where `TypeParser` (fixed
 * for that construct, `type-grammar.ts`) now does not. See
 * `queryResponseAnnotation`'s own doc block for what that residual
 * disagreement is observed as.
 */
const UNRESOLVED_NAMED_TYPE_CODE = "theta/parse/unresolved-named-type";

export function unresolvedNamedTypeDiagnostic(
  name: string,
  range: SourceRange,
  file: string,
): Diagnostic {
  return {
    severity: "error",
    code: UNRESOLVED_NAMED_TYPE_CODE,
    file,
    range,
    message: `unresolved named type '${name}'`,
  };
}

/**
 * The registered `theta/parse/reserved-keyword-as-identifier` rejection
 * (code-registry-parse.md:21) for a reserved spelling `collectUnresolvedNamedTypes`
 * finds where a `NamedType` is read: `NamedType ::= Ident` (grammar.md:98) is
 * an identifier position, so the row's existing trigger already covers it —
 * this builder renders the same registered Message the lexer's own
 * declarator-name check (lexer.ts) emits from a second site, held identical by
 * DIAG-4 rather than by shared code (bug 0044 §Fix). Same severity/range/file
 * construction as `unresolvedNamedTypeDiagnostic` above, the sibling sink's
 * builder.
 */
export function reservedKeywordAsIdentifierDiagnostic(
  keyword: string,
  range: SourceRange,
  file: string,
): Diagnostic {
  return {
    severity: "error",
    code: "theta/parse/reserved-keyword-as-identifier",
    file,
    range,
    message: `reserved keyword '${keyword}' cannot be used as an identifier`,
  };
}

/**
 * The registered `theta/parse/annotation-type-not-expression` refusal (bug
 * 0124 §Fix): a `let` annotation, an `fn` parameter type, or an `fn` return
 * type whose captured source — `annotationSourceIsNotTypeExpression`
 * (type-layer-checks.ts) — derives from none of `Type`'s six alternatives
 * (grammar.md:90–:95). Sibling to `schemaTypeNotExpressionDiagnostic` (theta-document.ts),
 * with one difference in what `<name>` renders: THIS position always has a
 * binder of its own — the `let` binding name, the `fn` parameter name, or the
 * `fn` name — so the message names THAT identifier rather than the enclosing
 * declaration's, unlike the schema position's field-less `SchemaFieldSource`
 * and arm string, which carry no name to render and fall back to `<X>`, the
 * declaration's own.
 */
function annotationTypeNotExpressionDiagnostic(
  name: string,
  range: SourceRange,
  file: string,
): Diagnostic {
  return {
    severity: "error",
    code: "theta/parse/annotation-type-not-expression",
    file,
    range,
    message: `'${name}' declares a type that is not a theta type expression`,
  };
}

/**
 * The declared-name universe a bug 0262 §Fix capture resolves against:
 * `typeNames` widened with the builtin error-model names the pattern-head
 * position already admits (`patternHeadTypeNames`'s own seed,
 * `BUILTIN_VALUE_NAMES` above — clause (iv)(1)). Reusing that constant rather
 * than a literal at each call site is what keeps the admission one fact
 * instead of one per capture: an APPLIED `Result` is never tested as an atom
 * (`lowerTypeExpr`'s generic-application arm reads a `ctor` name structurally,
 * never through the identifier-resolution arm), so admitting it here is inert
 * for that spelling; an UNAPPLIED `Result` reaches the atom arm instead and is
 * the reserved-keyword class `theta/parse/reserved-keyword-as-identifier`
 * reports at every capture (bug 0277 §Fix route (a)) — `QueryError` is the
 * only name these captures ever resolve as a `NamedType`.
 */
export function withBuiltinErrorModelNames(typeNames: ReadonlySet<string>): ReadonlySet<string> {
  return new Set([...typeNames, ...BUILTIN_VALUE_NAMES]);
}

/** Is `a` strictly before `b` in (line, column) order? */
function positionBefore(a: Position, b: Position): boolean {
  return a.line < b.line || (a.line === b.line && a.column < b.column);
}

/**
 * Clause (iv)(3)'s artefact-suppression predicate: does an error-severity
 * diagnostic ALREADY drawn — either in a pass that ran before the structural
 * walk (`prior`) or earlier in the structural walk itself, including this same
 * capture's own type-grammar pass (`own`) — overlap the CAPTURE WINDOW
 * `window`? An `unresolved-named-type` row drawn by THIS walk is not such
 * evidence and is filtered out of `own`: it names a head at some enclosing
 * capture and says nothing about the window of a capture nested inside it, so
 * counting it would let one refusal swallow a second written mistake — the
 * opposite of the one-diagnostic-per-written-mistake reading the clause states.
 * Every other row, including this row's emissions from a PRIOR pass, still
 * counts. Overlap is position-precise, not line-precise, and honours the
 * exclusive `end` of a `SourceRange`: the windows are what bounds the clause
 * to capture debris. A same-line fault OUTSIDE the window (a stray token past
 * the end of a `let` statement) and a body-interior fault outside an `fn`
 * header (a lexer error several lines into the body) are independent author
 * mistakes, and each keeps its own diagnostic beside the name refusal rather
 * than swallowing it. A diagnostic carrying no range cannot overlap anything
 * and is skipped, never treated as a wildcard cover.
 *
 * `own`'s overlap test is further narrowed to CONTAINMENT in `construct`, the
 * construct whose capture is being judged (bug 0272 §Fix route (b)). A row
 * ranged over an ENCLOSING declaration — an `fn` whose own header annotation is
 * refused carries the whole declaration's range, body included
 * (`annotationTypeNotExpressionDiagnostic`) — overlaps every capture window
 * nested in that body without saying anything about a head the author wrote
 * there, so counting it as cover would swallow that second written mistake. A
 * row ranged over the capture's OWN construct still passes this predicate's
 * geometry test, whichever code it carries and whichever of that construct's
 * captures earned it. `prior` stays unnarrowed: it is evidence from an earlier
 * pass, never this walk's own enclosing-declaration refusal.
 *
 * Geometry alone cannot tell a coverer that is cover FOR THIS CAPTURE from one
 * that merely shares its construct: a range wide enough to contain the
 * capture's window is exactly as wide when the text inside it is debris the
 * capture absorbed (`Gone--`) and when it is a sibling head the author wrote
 * elsewhere in the same header (`q: Gone`, a nested `fn`'s own parameter) —
 * bug 0279. Every caller therefore gates this predicate's result behind the
 * capture's own provenance mark (`annotationAbsorbed`, `typeAbsorbed`,
 * `returnTypeAbsorbed`, `returnSchemaAbsorbed`): a coverer is a verdict on the
 * capture only when the capture itself did NOT end at its own terminator —
 * whether it ran past a syntax fault and absorbed the following construct's
 * text, or halted at a token its position does not derive. A capture that DID
 * end at its own terminator holds text the author spelled there, and no
 * coverer silences it.
 */
function captureWindowAlreadyRefused(
  prior: readonly Diagnostic[],
  own: readonly Diagnostic[],
  window: SourceRange,
  construct: SourceRange,
): boolean {
  const overlaps = (d: Diagnostic): boolean =>
    d.severity === "error" &&
    d.range !== undefined &&
    positionBefore(d.range.start, window.end) &&
    positionBefore(window.start, d.range.end);
  const containedInConstruct = (d: Diagnostic): boolean =>
    d.range !== undefined &&
    !positionBefore(d.range.start, construct.start) &&
    !positionBefore(construct.end, d.range.end);
  return (
    prior.some(overlaps) ||
    own.some(
      (d) => d.code !== UNRESOLVED_NAMED_TYPE_CODE && overlaps(d) && containedInConstruct(d),
    )
  );
}

/**
 * The empty declared-name set `annotationSourceIsNotTypeExpression` below asks
 * the sink to resolve against. Every identifier-shaped atom in a recognised
 * source is therefore UNRESOLVED by construction — but `lowerTypeExpr`'s
 * `IDENTIFIER` arm (./params) returns on any resolution outcome before it
 * ever reaches its trailing catch-all, so no name can land in `unspellable`
 * regardless of what this set holds, and `Cat` / `Ghost` / `thisisnotatype`
 * are unaffected by it.
 */
const NO_DECLARED_TYPE_NAMES: ReadonlySet<string> = new Set();

/**
 * Whether a kind-matched scan of `text` finds a close token that closes
 * nothing, or closes a kind its nearest unclosed opener did not open — a
 * token no `Type` production derives (grammar.md `Type`).
 *
 * Only ever called on a group nothing in this traversal cuts (see THE SHRED
 * DECLINE on `annotationSourceIsNotTypeExpression` below), so an unmatched
 * close token the scan finds is the author's own text and never an artefact
 * of a split. The quoted-region handling mirrors `isSingleEnclosingBraceGroup`
 * (./params) — the predicate deciding the caller's single-enclosing test — so
 * the two agree on what a quoted region is by construction rather than by
 * coincidence over whichever spellings happen to be measured.
 */
function braceGroupCarriesUnmatchedCloseToken(text: string): boolean {
  const stack: string[] = [];
  let quote: string | undefined;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i] ?? "";
    if (quote !== undefined) {
      if (c === "\\" && i + 1 < text.length) {
        i += 1;
      } else if (c === quote) {
        quote = undefined;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === "<" || c === "{") {
      stack.push(c);
      continue;
    }
    if (c === ">" || c === "}") {
      const opener = c === ">" ? "<" : "{";
      if (stack.length === 0 || stack[stack.length - 1] !== opener) {
        return true;
      }
      stack.pop();
    }
  }
  return false;
}

/**
 * Whether `src` — a captured `let` annotation, `fn` parameter type, `fn`
 * return type, or (bug 0203 §Fix) an author-written `@<T>` / bare `@Ident`
 * query ascription — derives from none of `Type`'s six alternatives
 * (grammar.md:90–:95), so no verdict on it is honest at the positions bug
 * 0124 and bug 0203 own (a `schema` field type and a `schema X = …` alias arm
 * are bug 0061's; a `params:` scalar is bug 0059's).
 *
 * THE ABSENCE INVARIANT, stated here once and relied on by type-layer-checks.ts
 * (bug 0124 §Fix (f)(1)): a refused annotation is ABSENT to every consumer of
 * the declared type it stands in for, and that absence is established at the
 * point the text ENTERS the type layer rather than re-tested at each reader. The
 * entry points are exactly that layer's derived carriers of a declared type —
 * the `fnReturns` build (`collectFnReturnAnnotations`), the `fnScope` seed
 * (`walkFn`'s parameter loop) and the `let` arm's binding record — plus
 * `walkFn`'s own `EnclosingReturnScope` computation and the two boundary
 * readers that consult an annotation directly without a carrier in between
 * (`checkSubagentReturnAnnotation`, `checkFnCallArgs`). Seeding the carriers
 * absent is what makes the property hold for readers NOT YET WRITTEN: a
 * reader of a carrier inherits the absence from the carrier and cannot
 * reintroduce a verdict by omitting a guard, whereas a per-reader guard holds
 * only for the readers someone remembered to visit. Withholding costs no
 * legitimate emission — a well-formed annotation is never refused, and a
 * refused one blocks registration either way — and the direction is the
 * withhold machinery's own: a withheld read DEFERS, it never reports. The
 * observable consequences are enumerated once, in the registry row's Trigger.
 *
 * Reuses bug 0059's / 0061's landed sink rather than a private copy of the
 * type-grammar judgement: `collectUnresolvedNamedTypes` (./body-type-lowering)
 * threads its fourth optional out-parameter `unspellable` against the empty
 * declared set above, and the collected text is filtered through the ONE
 * shared decline `isUnspellableTextRefusable` (./params) — so narrowing that
 * decline narrows this refusal along with bug 0059's and bug 0061's landed
 * ones, rather than drifting against a second copy of the same judgement.
 *
 * The empty source declines defensively: the annotation call sites already
 * guard on `length > 0`, so this only protects a future caller that omits
 * that guard (bug 0124 §Fix constraint 3 — the empty annotation is a separate
 * answer this function does not give).
 *
 * THE SHRED DECLINE — mandatory for the `[`/`]` half, and narrowed for the
 * brace-and-angle half to the shape that can actually shred (bug 0252 §Fix
 * route (a)). `splitTopLevel`'s generic-argument and union splits (./params)
 * never track bracket depth, so a source combining a brace group with an
 * angle bracket COULD hand the sink a SHARD of a group the author wrote as
 * one unit: `Result<{a: string, b: integer, c: boolean}, QueryError>` used
 * to shred to `["{a: string", "b: integer", "c: boolean}"]`, with the
 * brace-free middle shard refusable entirely on its own. Declining any
 * source carrying a `[` or `]` before the sink ever runs is what keeps that
 * class of shard from reaching judgement — without it this recogniser
 * falsely refuses a LEGAL annotation and reds bug 0028's witness
 * (tests/unresolved-annotation-lowering.test.ts, RESULT-LET-BRACE).
 *
 * The brace-and-angle half declined on the same bare presence, but the
 * SHARD property those splits threaten is a group the split CUTS, and only
 * two shapes put a brace group where either split reaches it: nested inside
 * a `GenericType` argument list, or standing beside a top-level `|` in a
 * union. A brace group that is neither — a SINGLE ENCLOSING brace group,
 * `isSingleEnclosingBraceGroup` (./params, the same predicate the shared
 * sink's own brace-group entry decides membership with, so the two agree by
 * construction) — sits at neither split's cut point: the author wrote it as
 * one unit, and no traversal here divides it into pieces. Nothing about
 * bracket depth needs protecting there, so a KIND-MATCHED scan of that
 * group's interior — `<`/`{` pushed, `>`/`}` checked against the top of that
 * same stack, a quoted region skipped exactly as `isSingleEnclosingBraceGroup`
 * skips one — replaces the blanket admission: a close token the scan finds
 * closing nothing, or closing a kind its own nearest unclosed opener did not
 * open, derives from no `Type` production (grammar.md `Type`) and is refused
 * directly, without ever reaching the refusable-text sink below. A brace
 * group that IS nested in a generic argument or beside a top-level `|` keeps
 * the decline exactly as bug 0124 landed it, since that is the one shape
 * either split can still cut.
 *
 * POST-BUG-0204, THE DECLINE'S REMAINING (non-single-enclosing) REACH IS
 * NARROWER THAN THE PARAGRAPH ABOVE STATES ON ITS OWN, measured (not
 * reasoned) by neutralising both declines in a scratch copy of this function
 * and comparing the pre-0204 and post-0204 traversal: the GENERIC-ARGUMENT
 * half of the hazard — the `Result<{...}, QueryError>` example above, and
 * `array<{a: string, b: integer, c: boolean}>` — now yields an EMPTY
 * refusable set with the decline removed, where the identical probe against
 * the pre-0204 traversal yielded `["b: integer"]`: `lowerTypeExpr`'s
 * generic-application arm (params.ts, bug 0204 §Fix (b)(3)) already stops a
 * shard the split cuts from a `{...}`/`[...]` group before it can reach the
 * sink this decline guards, so this decline no longer has that half of the
 * hazard to protect against for a text that is not a single enclosing brace
 * group. The UNION-split half (a brace group whose own top-level `|` a
 * union split can shred) is untouched by bug 0204's fix, and is exactly the
 * reason a non-single-enclosing brace-and-angle text still declines: the
 * kind-matched scan above only ever runs on a group nothing here can cut.
 */
export function annotationSourceIsNotTypeExpression(src: string): boolean {
  const text = src.trim();
  if (text.length === 0) {
    return false;
  }
  if (text.includes("[") || text.includes("]")) {
    return false;
  }
  const hasBrace = text.includes("{") || text.includes("}");
  const hasAngle = text.includes("<") || text.includes(">");
  if (hasBrace && hasAngle) {
    if (!isSingleEnclosingBraceGroup(text)) {
      return false;
    }
    if (braceGroupCarriesUnmatchedCloseToken(text)) {
      return true;
    }
  }
  const unspellable: string[] = [];
  collectUnresolvedNamedTypes(text, NO_DECLARED_TYPE_NAMES, undefined, unspellable);
  return unspellable.some(isUnspellableTextRefusable);
}
