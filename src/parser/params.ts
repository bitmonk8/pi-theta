// V6b / V6b-T — the `params:` contract seam.
//
// This module owns the `params:` field contract of
// frontmatter/frontmatter-fields-a.md §params and §Defaults: the type-expression
// RHS (with whole-file forward references to body `schema`/`enum` declarations),
// the literal-sublanguage defaults, the no-non-defaulted-after-defaulted
// ordering rule, and the lowering of `params:` to a single AJV-validatable
// JSON-Schema document, with shared text predicates and splitters delegated to
// type-text-split.ts, the per-field type-expression lowering family to
// params-lowering.ts, and the render-side projection to params-render.ts.
//
// The five behaviour-bearing checks this seam owns:
//
//   - `theta/parse/non-trailing-default` — a non-defaulted param placed after a
//     defaulted param in declaration order; the diagnostic names the first
//     offending non-defaulted field.
//   - `theta/parse/default-not-literal` — a default RHS outside the theta literal
//     sublanguage; delegated to the `V2a` literal-sublanguage check, whose
//     diagnostic names the offending sub-expression.
//   - `theta/parse/unresolved-named-type` — a `params:` RHS `NamedType` that
//     resolves to no body `schema`/`enum` declaration or imported `.thetalib`
//     symbol. Resolution is whole-file, so a frontmatter-to-body forward
//     reference is not itself a failure.
//   - `theta/load/schema-slug-collision` — an `__inline_<slug>` slug match
//     whose retained canonical-form bytes differ (schema-subset.md
//     §Schema-slug collision posture); raised at the field being lowered
//     when the byte check failed.
//   - the lowered schema — the per-theta `params:` object document, validated
//     through AJV (the `V8c` `SchemaValidator` seam) at invocation time.

// The rendered message's field-name interpolation is collapsed through
// `normaliseLiteralValueLineBreaks` so an author-controlled name carrying a
// break cannot forge the diagnostic message's reserved multi-line shapes
// (bug 0384; diagnostic-shape.md single-line-summary rule).
import { normaliseLiteralValueLineBreaks, type Diagnostic, type SourceRange } from "../diagnostics/diagnostic";
import { type LoweredSchema } from "../seams/schema-validator";
import {
  checkLiteralSublanguage,
  defaultLiteralStaticType,
  hasRawNewlineInStringLiteral,
} from "./literal-sublanguage";
import {
  type TypeEnv,
} from "./type-compat";
import { checkParamsDefaultCompat, paramsDeclaredCompatType } from "./type-compat-sites";
import { checkInlineEnumForm } from "./schema-declarations";
import { parseTypeExpression } from "./type-grammar";
import { defineRecordField } from "../runtime/value";
import { hoistNestedDefs } from "./schema-defs";
import { lowerParamsFieldType, type LowerCtx } from "./params-lowering";
import {
  hasUnterminatedStringLiteral,
  isUnspellableTextRefusable,
  splitTopLevel,
} from "./type-text-split";
export {
  isSingleEnclosingBraceGroup,
  isUnspellableTextRefusable,
  splitTopLevel,
  splitTopLevelSegments,
  topLevelColon,
} from "./type-text-split";

/**
 * One `params:` field as written in source, in declaration order.
 *
 *   - `name`          — the param's theta-side identifier.
 *   - `typeSource`    — the right-hand-side type expression verbatim, parsed by
 *                       the theta type grammar (a primitive, a generic, or a
 *                       `NamedType` resolved whole-file against `bodyTypes`).
 *   - `defaultSource` — the default RHS verbatim, present iff the field carries
 *                       a `= <literal>` default; checked against the theta
 *                       literal sublanguage.
 *   - `range`         — the field's located site, for diagnostics.
 *   - `shapeRefused`  — set when the frontmatter seam already refused this
 *                       field's YAML value node (`paramValueCanCarryType`,
 *                       frontmatter.ts): retained so this module can tell a
 *                       node-shape refusal from a text-level one and raise at
 *                       most one `theta/load/params-type-not-expression` per
 *                       field (bug 0059 §Fix constraint 1).
 */
export interface ParamFieldInput {
  readonly name: string;
  readonly typeSource: string;
  readonly defaultSource?: string;
  readonly range: SourceRange;
  readonly shapeRefused?: boolean;
}

/**
 * A body-level named type the `params:` RHS may resolve against — a `schema` or
 * `enum` declaration, or a symbol imported from a `.thetalib` module. Resolution is
 * whole-file, so the declaration order relative to the frontmatter does not
 * matter; a forward reference resolves identically to a backward one.
 *
 * `lowered` is the JSON-Schema fragment the named type contributes as a `$defs`
 * entry, so a resolved `NamedType` lowers to a `{ "$ref": "#/$defs/<name>" }`
 * against it.
 */
export interface BodyTypeDeclaration {
  readonly name: string;
  readonly lowered: Record<string, unknown>;
}

/** A located site for a `params:` parse. */
export interface ParamsParseSite {
  readonly file: string;
}

/**
 * The outcome of parsing a `params:` block: every diagnostic raised in source
 * order, plus the lowered AJV-validatable schema document — present iff the
 * block raised no `error`-severity diagnostic, absent otherwise (`parseParams`
 * enumerates the codes this seam raises at `error` severity).
 */
export interface ParamsParseResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly loweredSchema?: LoweredSchema;
}

/**
 * Parse a `params:` block against the field contract of
 * frontmatter/frontmatter-fields-a.md §params and §Defaults, returning every
 * diagnostic raised (in source order) and the lowered AJV-validatable schema.
 * Every diagnostic below is raised at `error` severity, and `loweredSchema` is
 * present iff none of them fired:
 *
 *   - `theta/parse/void-in-non-return-position`,
 *     `theta/parse/result-in-schema-position`, and
 *     `theta/parse/generic-arity-mismatch` — a field's type RHS parsed at the
 *     schema-feeding position (`parseTypeExpression`, type-grammar.ts);
 *   - `theta/parse/reserved-keyword-as-identifier` — a reserved keyword
 *     (lexical.md §Reserved keywords) written where a field's type RHS reads
 *     a `NamedType`;
 *   - `theta/parse/unresolved-named-type` — a RHS `NamedType` resolving to no
 *     `bodyTypes` entry (whole-file resolution, so forward references resolve);
 *   - `theta/parse/inline-enum` — a field's recovered type text spells an
 *     inline `enum[...]` at its own top level, under the same anchored
 *     recogniser (`checkInlineEnumForm`) the two `schema` positions ask, and
 *     under the same two gates as the row below (`shapeRefused` unset, no
 *     other error-severity diagnostic from this field's own pass);
 *   - `theta/load/params-type-not-expression` — a field's recovered type text
 *     spells no `Type` production (bug 0059 §Fix): the field's own value node
 *     already passed the frontmatter seam's shape gate
 *     (`ParamFieldInput.shapeRefused` unset), the text is not what
 *     `parseLiteralArm` recognises or brace-carrying, the text does not match
 *     the inline-enum recogniser above (which takes precedence, so the two
 *     never both fire for one field), and the field carries no other
 *     error-severity diagnostic from this same pass;
 *   - `theta/load/schema-slug-collision` — an `__inline_<slug>` slug match
 *     whose retained canonical-form bytes differ (schema-subset.md §Schema-slug
 *     collision posture);
 *   - `theta/parse/non-trailing-default` — a non-defaulted field after a
 *     defaulted field (the diagnostic names the first offending field);
 *   - `theta/parse/default-not-literal` — a default RHS outside the literal
 *     sublanguage (the diagnostic names the offending sub-expression);
 *   - `loweredSchema` — the per-theta object schema (non-defaulted fields
 *     `required`, named types lowered to in-document `$ref`s against a `$defs`
 *     table holding the transitive closure — see `hoistNestedDefs`), validated
 *     through the `V8c` AJV `SchemaValidator` at invocation time.
 */
export function parseParams(
  fields: readonly ParamFieldInput[],
  bodyTypes: readonly BodyTypeDeclaration[],
  site: ParamsParseSite,
): ParamsParseResult {
  const diagnostics: Diagnostic[] = [];

  // Whole-file named-type resolution: the `params:` RHS resolves against every
  // body declaration regardless of source order, so a frontmatter-to-body
  // forward reference resolves identically to a backward one.
  const bodyTypeMap = new Map<string, Record<string, unknown>>(
    bodyTypes.map((decl) => [decl.name, decl.lowered] as const),
  );

  // Lower each field's type RHS, collecting the resolved `$defs` and any
  // unresolved `NamedType` names in source order.
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  const defs: Record<string, Record<string, unknown>> = {};
  // The `__inline_<slug>` dedup table is BLOCK-shared (it is `defs` itself), so
  // its retained canonical bytes and its collision sink are block-shared too:
  // schema-subset.md §Schema-slug collision posture mandates the byte-equality
  // check on every slug match across the whole lowering pass, not per field.
  // Both retentions share ONE scope with `defs` here, so
  // `hoistInlineObjectType`'s cross-scope re-registration never fires at this
  // position.
  const inlineCanonical = new Map<string, string>();
  const inlineFragments = new Map<string, Record<string, unknown>>();
  const slugCollisions: string[] = [];
  const collisionSites: { readonly slug: string; readonly range: SourceRange }[] = [];
  // Fields whose type half drew a type-half refusal below — either
  // `theta/parse/inline-enum` or `theta/load/params-type-not-expression` — so
  // the default-literal loop further down (bug 0059 §Fix's guard extension)
  // can tell which fields to leave unchecked.
  const typeRefused = new Set<ParamFieldInput>();
  for (const field of fields) {
    // `fieldDiagStart` bounds the last-resort guard below to diagnostics THIS
    // field's own pass raised; `unspellable` is this field's private view of
    // `lowerTypeExpr`'s catch-all (bug 0059 §Fix) — a fresh array per field so
    // one field's junk text can never be blamed on another's range.
    const fieldDiagStart = diagnostics.length;
    const unspellable: string[] = [];
    const lowerCtx: LowerCtx = {
      bodyTypeMap,
      defs,
      unresolved: [],
      reservedKeywords: [],
      unspellable,
      inlineCanonical,
      inlineFragments,
      slugCollisions,
    };
    // A `params:` field type is a lowered-schema position
    // (code-registry-parse.md's `theta/parse/void-in-non-return-position` and
    // `theta/parse/result-in-schema-position` rows), wired here as the schema-body field
    // position already is: `void`, a schema-feeding `Result`, and a
    // generic-arity mismatch all draw their registered row ahead of either
    // sink below, matching that position's own order (bug 0044 §Fix).
    diagnostics.push(
      ...parseTypeExpression(field.typeSource, "schema-feeding", {
        file: site.file,
        range: field.range,
      }),
    );
    // A `params:` field name is author-controlled; see `defineRecordField`'s
    // doc-comment for why the lowered node must be defined, not assigned.
    defineRecordField(properties, field.name, lowerParamsFieldType(field.typeSource, lowerCtx));
    // The sink is append-only and shared, so every slug appended during THIS
    // field's lowering is attributable to THIS field's range — which is the
    // range the collision diagnostic must carry, the site being lowered when the
    // check failed.
    for (const slug of slugCollisions.slice(collisionSites.length)) {
      collisionSites.push({ slug, range: field.range });
    }
    // Reserved-keyword spellings drain before unresolved names: `NamedType ::=
    // Ident` bars a keyword from ever reaching `lowerCtx.unresolved`, so the
    // two sinks never name the same spelling, and this is the order every
    // other caller of this pair now uses.
    for (const keyword of lowerCtx.reservedKeywords ?? []) {
      diagnostics.push({
        severity: "error",
        code: "theta/parse/reserved-keyword-as-identifier",
        file: site.file,
        range: field.range,
        message: `reserved keyword '${keyword}' cannot be used as an identifier`,
      });
    }
    for (const name of lowerCtx.unresolved) {
      diagnostics.push({
        severity: "error",
        code: "theta/parse/unresolved-named-type",
        file: site.file,
        range: field.range,
        message: `unresolved named type '${name}'`,
      });
    }
    // bug 0059 §Fix constraint 3, factored into the shared
    // `isUnspellableTextRefusable` predicate (below) so this position and bug
    // 0061's two body-position emitters (theta-document.ts) decline the
    // identical class rather than each keeping its own copy: narrowing the
    // predicate narrows every position's refusal at once.
    const refusable = unspellable.filter(isUnspellableTextRefusable);
    // bug 0232 §Fix (b): a field whose type-half source carries a string
    // literal that never closes derives from no `Type` production
    // (lexical.md:26), the same claim the eight lexed positions settle via
    // the lexer. `params:` reaches no lexer, so this predicate is asked of
    // the field's WHOLE recovered text directly rather than of the
    // `unspellable` sink: `hasUnterminatedStringLiteral` covers the nested
    // and generic spellings the sink never collects (see its doc comment),
    // and `isUnspellableTextRefusable`'s own brace exemption stays untouched
    // so the genuinely-unbalanced-brace boundary (Constraint 2) does not move.
    const unterminatedLiteral = hasUnterminatedStringLiteral(field.typeSource);
    // An inline `enum[...]` written at the field's OWN top level is the same
    // authored mistake the two `schema` positions answer with
    // `theta/parse/inline-enum` (bug 0162 §Fix route (a)), so this position
    // reuses that row's exported recogniser over the same unit those
    // positions hand it — the field's whole recovered type text, anchored —
    // instead of re-spelling a second predicate for one registry row.
    // Anchored means top level only: `enum[...]` nested inside a generic
    // argument or an inline object field keeps
    // `theta/load/params-type-not-expression` (bug 0217 §Fix (b)(2)), exactly
    // as the schema positions keep `theta/parse/schema-type-not-expression`
    // for the same nesting.
    const inlineEnum = checkInlineEnumForm(field.typeSource, {
      file: site.file,
      range: field.range,
    });
    // §Fix constraint 1 ("exactly one diagnostic per offending field"), two
    // guards. `field.shapeRefused` is set at the frontmatter seam when the
    // value NODE was already refused (`paramValueCanCarryType`,
    // frontmatter.ts): its ordering comment on the `paramsShapeDiags` push
    // settles which survives — "a field whose RHS spells no type expression
    // is reported as such, not by whatever the lowering makes of its
    // recovered bytes." The same-iteration check is the last-resort guard: a
    // field that already drew its own registered refusal this iteration
    // (such as `void-in-non-return-position`, `result-in-schema-position`,
    // `generic-arity-mismatch`, or the unresolved-named-type loop just above)
    // keeps that diagnostic alone.
    if (
      (inlineEnum !== undefined || refusable.length > 0 || unterminatedLiteral) &&
      field.shapeRefused !== true &&
      !diagnostics.slice(fieldDiagStart).some((d) => d.severity === "error")
    ) {
      typeRefused.add(field);
      // One diagnostic per offending field (bug 0162 §Fix constraint 3): where
      // both would answer, the registered inline-enum row wins and the
      // generic text refusal stands down, matching the two `schema`
      // positions' own precedence over their nested-spelling last resort.
      diagnostics.push(
        inlineEnum ?? {
          severity: "error",
          code: "theta/load/params-type-not-expression",
          file: site.file,
          range: field.range,
          message: `'params:' field '${normaliseLiteralValueLineBreaks(field.name)}' right-hand side is not a theta type expression`,
        },
      );
    }
    if (field.defaultSource === undefined) {
      required.push(field.name);
    }
  }

  // A slug match whose retained canonical bytes DIFFER is a schema-slug
  // collision: `lowerParamsFieldType` has already refused to merge the two
  // fragments, and this is the registered load-time report of that refusal. The
  // error severity withholds the lowered schema below, which is the registry
  // row's "The file is not registered" posture (code-registry-load.md).
  for (const collision of collisionSites) {
    diagnostics.push({
      severity: "error",
      code: "theta/load/schema-slug-collision",
      file: site.file,
      range: collision.range,
      message: `schema-slug collision on slug ${collision.slug}: two distinct inline schemas hash alike`,
    });
  }
  diagnostics.push(...checkTrailingDefaults(fields, site));
  diagnostics.push(...checkParamsDefaults(fields, typeRefused, site));
  // The block lowers to an AJV-validatable document only when it lowered
  // cleanly: an unresolved named type, an ordering error, or a non-literal
  // default leaves the lowered schema absent.
  const hasError = diagnostics.some((d) => d.severity === "error");
  if (hasError) {
    return { diagnostics };
  }

  const loweredSchema: Record<string, unknown> = {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
  const hoistedDefs = hoistNestedDefs(defs);
  if (Object.keys(hoistedDefs).length > 0) {
    loweredSchema["$defs"] = hoistedDefs;
  }
  return { diagnostics, loweredSchema: loweredSchema as LoweredSchema };
}

/** Check declaration-order defaults, reporting only the first offending field. */
function checkTrailingDefaults(
  fields: readonly ParamFieldInput[],
  site: ParamsParseSite,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  // No non-defaulted field may follow a defaulted field in declaration order;
  // the diagnostic names the FIRST offending non-defaulted field. Fired once.
  let seenDefault = false;
  for (const field of fields) {
    if (field.defaultSource !== undefined) {
      seenDefault = true;
      continue;
    }
    if (seenDefault) {
      diagnostics.push({
        severity: "error",
        code: "theta/parse/non-trailing-default",
        file: site.file,
        range: field.range,
        message: `non-defaulted param '${normaliseLiteralValueLineBreaks(field.name)}' follows a defaulted param; defaulted params must be trailing`,
      });
      break;
    }
  }
  return diagnostics;
}

/** Check each admitted field's default form and declared-type compatibility. */
function checkParamsDefaults(
  fields: readonly ParamFieldInput[],
  typeRefused: ReadonlySet<ParamFieldInput>,
  site: ParamsParseSite,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  // Each default RHS must be a Theta literal-sublanguage form; the is-literal
  // check (V2a) names the offending sub-expression in its diagnostic. A raw
  // line terminator inside a string-literal SPAN is refused separately, under
  // the same code the lexer already raises for the identical bytes in body
  // code (bug 0102): the is-literal check's own tokeniser treats such a break
  // as string content, so without this second test the position would
  // silently bind a value shorter than the one its recorded source and the
  // rendered binder prompt both denote. One diagnostic per offending FIELD,
  // not per string literal and not per break; the predicate is the span, so a
  // break that is inter-token whitespace (an `ArrayLit` spanning lines) or the
  // two-character `\n` escape is untouched.
  // The `params:` position resolves a declared `NamedType` against the body's
  // own declarations, but only their LOWERED JSON Schema reaches this function —
  // never the `CompatType` declarations the `⊑` relation resolves names
  // through. The environment handed to the compatibility check is therefore
  // empty, and every named, aliased, inline-object or literal declared type
  // answers `"unknown"` and defers to the invocation-time AJV check, exactly as
  // an unresolvable operand does at every other sink (type-system.md
  // §"Unresolvable operands"). The primitive, union-of-primitive and `array<T>`
  // declared types — the ones this position can decide — are decided.
  const defaultCompatEnv: TypeEnv = Object.create(null) as TypeEnv;
  for (const field of fields) {
    // Guard-extension precedence (operator grant, HEAD 948b7814; bug 0059
    // §Fix): the type-half refusal survives ALONE, so an offending field
    // draws exactly one diagnostic — the same reasoning as the ordering
    // comment on the `paramsShapeDiags` push in `parseFrontmatter`
    // (frontmatter.ts): a field whose type half spells no type expression is
    // reported as such, not by whatever its default half's literal check
    // makes of the same field's recovered bytes. The cross-field
    // `non-trailing-default` ordering check above reads `field.defaultSource`
    // alone across every field, not this field's own type disposition, and
    // is untouched.
    if (field.defaultSource === undefined || typeRefused.has(field)) {
      continue;
    }
    // §Fix (a): the violated production is the DECLARATION form, not a form
    // the sublanguage's own production set derives — frontmatter-fields-a.md:60
    // writes it `field: type = literal` and has no arm without a `literal`, so
    // an empty or whitespace-only default RHS is refused at the declaration
    // position rather than inside the is-literal check below, which judges a
    // parsed NODE and never reaches one for empty text (the `node === undefined`
    // return in literal-sublanguage.ts). This sits BEHIND the bug-0059 guard
    // above, so a field whose type half was already refused still draws exactly
    // one diagnostic (the third of the `theta/load/params-type-not-expression`
    // row's three precedence rules, code-registry-load.md), and it
    // `continue`s so the raw-newline check, the is-literal check and the compat
    // check below never judge a field that carries no literal at all — the same
    // one-diagnostic-per-offending-field precedence those rules already keep
    // among themselves. The predicate re-trims rather than testing
    // `.length === 0` directly: the registered Trigger names an "empty or
    // whitespace-only" right-hand side, so this tests that property itself
    // rather than relying on `splitParamValue`'s own normalisation to keep
    // producing it.
    if (field.defaultSource.trim().length === 0) {
      diagnostics.push({
        severity: "error",
        code: "theta/parse/default-without-literal",
        file: site.file,
        range: field.range,
        message: `params default for '${normaliseLiteralValueLineBreaks(field.name)}' is empty; '=' must be followed by a literal-sublanguage form`,
      });
      continue;
    }
    const defaultDiagStart = diagnostics.length;
    if (hasRawNewlineInStringLiteral(field.defaultSource)) {
      diagnostics.push({
        severity: "error",
        code: "theta/parse/literal-newline-in-string",
        file: site.file,
        range: field.range,
        message: "literal newline in string literal",
      });
    }
    // lexical.md §String literals: a string literal that never closes spells no
    // `STRING`, and grammar.md §Theta literal sublanguage makes that position's
    // RHS a strict subset of the same expression grammar — a subset admits
    // nothing the superset refuses. `hasUnterminatedStringLiteral` (bug 0232's
    // predicate) is reused unchanged; its existing caller over the field's type
    // half is untouched, and this is a second, independent call over the default
    // half, the position bug 0232's guard does not reach. Gated on the same
    // `defaultDiagStart` slice test the compat guard below uses, so exactly one
    // diagnostic fires per offending field: bug 0102's raw-newline verdict above
    // keeps priority when both would otherwise fire, and `continue` stops bug
    // 0163's compat pair from judging a declared type against a value type
    // derived from bytes that spell no literal at all. Bug 0232's normative
    // unbalanced-BRACE boundary and the unmatched-BRACKET row stay admitted
    // here too: this predicate is string closure, not container balance.
    if (
      diagnostics.slice(defaultDiagStart).every((d) => d.severity !== "error") &&
      hasUnterminatedStringLiteral(field.defaultSource)
    ) {
      diagnostics.push({
        severity: "error",
        code: "theta/parse/unterminated-string",
        file: site.file,
        range: field.range,
        message: "unterminated string literal",
      });
      continue;
    }
    diagnostics.push(
      ...checkLiteralSublanguage(field.defaultSource, {
        file: site.file,
        range: field.range,
      }),
    );
    // frontmatter-fields-a.md §Defaults: the default literal's static type must
    // be compatible with the param's declared type. The two halves
    // `splitParamValue` separated are paired here, at the one position that
    // holds both. Same "exactly one diagnostic per offending field" precedence
    // as the guards above: a default this field's own form rules already refused
    // keeps that diagnostic alone rather than being judged a second time on
    // whatever type its refused bytes make.
    if (diagnostics.slice(defaultDiagStart).some((d) => d.severity === "error")) {
      continue;
    }
    const declared = paramsDeclaredCompatType(field.typeSource, (source) =>
      splitTopLevel(source, "|", "angle"),
    );
    const value = defaultLiteralStaticType(field.defaultSource);
    if (declared === undefined || value === undefined) {
      continue;
    }
    diagnostics.push(
      ...checkParamsDefaultCompat({
        param: field.name,
        declared,
        value,
        env: defaultCompatEnv,
        site: { file: site.file, range: field.range },
      }),
    );
  }
  return diagnostics;
}

export {
  classifyGenericArgumentSegments,
  findCutBracketGroupText,
  hoistInlineObjectType,
  lowerBraceGroupUnionArms,
  lowerLiteralSublanguage,
  lowerParamsFieldType,
  lowerTypeExpr,
  type ClassifiedArgumentSegment,
  type LowerCtx,
} from "./params-lowering";
export { projectRenderedParamType } from "./params-render";
