// V6b / V6b-T — the `params:` contract seam.
//
// This module owns the `params:` field contract of
// frontmatter/frontmatter-fields-a.md §params and §Defaults: the type-expression
// RHS (with whole-file forward references to body `schema`/`enum` declarations),
// the literal-sublanguage defaults, the no-non-defaulted-after-defaulted
// ordering rule, and the lowering of `params:` to a single AJV-validatable
// JSON-Schema document.
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
//
// V6b-T (tests-task) declares these seam shapes and stubs `parseParams` as an
// inert pass (no diagnostics, no lowered schema) so the failing tests compile
// and red on their own primary assertions (the `params:` contract is absent).
// The paired V6b implementation leaf fills it in.

import { type Diagnostic, type SourceRange } from "../diagnostics/diagnostic";
import { reservedKeywords } from "../lexer/lexer";
import { type LoweredSchema } from "../seams/schema-validator";
import {
  checkLiteralSublanguage,
  defaultLiteralStaticType,
  hasRawNewlineInStringLiteral,
} from "./literal-sublanguage";
import {
  checkParamsDefaultCompat,
  paramsDeclaredCompatType,
  type TypeEnv,
} from "./type-compat";
import { isReservedSynthesisedName } from "./synthesised-names";
import {
  canonicalForm,
  lowerUnion,
  schemaSlug,
  toLoweredJsonValue,
  type LoweredJsonValue,
  type LoweredPrimitiveType,
  type LoweredUnionArm,
} from "./schema-lowering";
import { checkInlineEnumForm } from "./schema-declarations";
import { parseTypeExpression } from "./type-grammar";
import { defineRecordField } from "../runtime/value";

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
 *
 * V6b-T stubs this as an inert pass (no diagnostics, no lowered schema); the
 * paired V6b implementation leaf computes the ordering check, the default-literal
 * delegation, the whole-file named-type resolution, and the lowering.
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
    // (code-registry-parse.md:59, :60), wired here as the schema-body field
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
          message: `'params:' field '${field.name}' right-hand side is not a theta type expression`,
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
        message: `non-defaulted param '${field.name}' follows a defaulted param; defaulted params must be trailing`,
      });
      break;
    }
  }

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
    // one diagnostic (code-registry-load.md:19's third precedence rule), and it
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
        message: `params default for '${field.name}' is empty; '=' must be followed by a literal-sublanguage form`,
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
      ...checkLiteralSublanguage(field.defaultSource, "default", {
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

/**
 * Lift every nested `$defs` entry a registered fragment carries up to the
 * `params:` document's OWN top level, stripping the nested copy on the way.
 *
 * WHY: `lowerTypeExpr` mints ROOT-ABSOLUTE `{ "$ref": "#/$defs/<name>" }`
 * pointers, which JSON Schema resolves against the document root and nowhere
 * else, but it registers only the names a `params:` field references DIRECTLY.
 * A name reached only THROUGH another name — `params: { p: Person }` where
 * `Person.pets: array<Animal>` — arrives inside `Person`'s own fragment-local
 * `$defs`, at `#/$defs/Person/$defs/Animal`, which no pointer can name: AJV
 * refuses the whole document with `can't resolve reference #/$defs/Animal`
 * when the binder compiles the envelope it is hoisted into
 * (binder-envelope.ts lifts this `$defs` verbatim to the envelope root). The
 * annotation path performs the same lift (`pruneDocumentDefs`,
 * query-schema-lowering.ts); this is the `params:` sibling of it, minus the
 * reachability prune (a `params:` fragment is registered only when a ref to
 * it is minted, so every hoisted name is reachable by construction).
 *
 * The queue walk is keyed by def NAME with first-wins dedup, and that name set
 * doubles as the cycle/termination guard: a self- or mutually-recursive schema
 * closure names itself, so re-queuing the same name must terminate rather than
 * recurse forever. Fragments are never mutated — a hoisted-from body sheds its
 * `$defs` through a shallow clone, because the same fragment object is aliased
 * at several positions in one document (the body-type map's own entry and
 * every closure carrying it).
 */
function hoistNestedDefs(
  defs: Readonly<Record<string, Record<string, unknown>>>,
): Record<string, Record<string, unknown>> {
  const hoisted: Record<string, Record<string, unknown>> = {};
  const queue: [string, Record<string, unknown>][] = Object.entries(defs);
  while (queue.length > 0) {
    const [name, body] = queue.shift() as [string, Record<string, unknown>];
    if (hoisted[name] !== undefined) {
      continue;
    }
    const nested = body["$defs"];
    if (nested === undefined || nested === null || typeof nested !== "object") {
      hoisted[name] = body;
      continue;
    }
    queue.push(...Object.entries(nested as Record<string, Record<string, unknown>>));
    const stripped: Record<string, unknown> = { ...body };
    delete stripped["$defs"];
    hoisted[name] = stripped;
  }
  return hoisted;
}

/** The lowering context threaded through a single field's type expression. */
export interface LowerCtx {
  readonly bodyTypeMap: ReadonlyMap<string, Record<string, unknown>>;
  /** Resolved named types, collected as `$defs` entries (shared across fields). */
  readonly defs: Record<string, Record<string, unknown>>;
  /** `NamedType` names this field references that resolve to no declaration. */
  readonly unresolved: string[];
  /**
   * Reserved-keyword spellings (lexical.md §Reserved keywords) this field's
   * type source used where a `NamedType` was read. `NamedType ::= Ident`
   * (grammar.md:98) bars a reserved spelling from ever being one, so this sink
   * and `unresolved` never name the same spelling. Like `unresolved`, the
   * caller owns the array's lifetime and this module never reads it back:
   * four callers render every hit as
   * `theta/parse/reserved-keyword-as-identifier`, and five more filter hits
   * through `admittedReservedKeywords` first, withholding `Result` and
   * `array`, which head a `GenericType`, and `Result`'s own value
   * constructors `Ok` and `Err` beside them.
   *
   * OPTIONAL because a caller threading no sink collects nothing and the
   * lowering stays permissive (`{}`) regardless — matching every other sink
   * here.
   */
  readonly reservedKeywords?: string[];
  /**
   * The canonical-form bytes of each `__inline_<slug>` fragment already minted
   * through this context, keyed by the bare 16-hex slug. schema-subset.md
   * §Schema-slug collision posture requires a slug-keyed dedup table to store
   * the bytes ALONGSIDE the keyed artefact, so a slug match is settled by a
   * byte comparison rather than a re-serialisation.
   *
   * OPTIONAL because a call site that mints no `__inline_` entry has no bytes
   * to retain and no check to run, and the field must not force either on it.
   */
  readonly inlineCanonical?: Map<string, string>;
  /**
   * The fragment behind each slug `inlineCanonical` retains bytes for, under
   * the same bare-slug key.
   *
   * THE RETENTION IS SPLIT ACROSS TWO MAPS because the two halves answer
   * different obligations, and only the first is the posture's. §Schema-slug
   * collision posture asks for the canonical BYTES to sit beside the keyed
   * artefact so the match check is a comparison and not a re-serialisation —
   * `inlineCanonical` alone is that, and its shape is the posture's shape. The
   * fragment retention exists for one mechanical reason instead: a scope whose
   * own `defs` does not hold the `$defs` entry must re-register the WINNING
   * fragment before it may emit a `$ref` naming it, or the enclosing `$defs`
   * closure dangles. Merging them into one record of pairs would present a
   * mechanism the posture does not ask for as though it were the posture's
   * own. Both maps are written at ONE site and read at ONE site, adjacent to
   * each other in `hoistInlineObjectType`, so they cannot drift apart.
   *
   * OPTIONAL independently of `inlineCanonical`: absent, "already minted" is
   * decided by THIS scope's `defs` alone and no re-registration can fire —
   * which is what a caller whose retention and `defs` share one scope needs
   * (`parseParams`), and all a caller threading no sink at all gets.
   */
  readonly inlineFragments?: Map<string, Record<string, unknown>>;
  /**
   * Sink for the bare slugs whose byte-equality check FAILED, appended in
   * lowering order. Like `unresolved`, the caller owns the array's lifetime and
   * this module never reads it back: `parseParams` turns each entry into
   * `theta/load/schema-slug-collision` at the field it was lowering. Absent, the
   * check has nowhere to report and the retention is still first-wins.
   */
  readonly slugCollisions?: string[];
  /**
   * Text `lowerTypeExpr`'s trailing catch-all lowered permissively rather
   * than through a `PrimitiveType`, `NamedType`, or `GenericType` arm,
   * appended in lowering order (bug 0059 §Fix). Like `unresolved` and
   * `slugCollisions`, the caller owns the array's lifetime and this module
   * never reads it back: `parseParams` declines the recognised `LiteralType`
   * atoms and brace-carrying survivors of this arm's legitimate traffic (an
   * ALL-literal union's arms reached from a generic argument, bug 0164's
   * face — a mixed union's own literal arm no longer arrives here, bug 0184
   * §Fix; a brace-rooted type nested in a generic argument or a union arm)
   * and turns what remains into
   * `theta/load/params-type-not-expression` at the field being lowered.
   * `checkSchemaDeclarationGraph` and `walkStatement`'s `schema` arm
   * (theta-document.ts) read this same sink for the two body positions,
   * declining through the identical shared predicate
   * (`isUnspellableTextRefusable`, above) and turning what remains into
   * `theta/parse/schema-type-not-expression` (bug 0061 §Fix).
   *
   * OPTIONAL for the same reason `slugCollisions` is: a caller threading no
   * sink collects nothing and the catch-all stays exactly as permissive as it
   * always was. `lowerTypeSource` (body-type-lowering.ts) accepts this key as
   * its own trailing optional parameter, threaded only at the two body
   * positions (bug 0061 §Fix); the `@<T>` annotation's own
   * `collectUnresolvedNamedTypes` call threads none, so that position alone
   * keeps byte-identical lowered documents and diagnostic sequences (§Fix
   * constraint 2) — the `value` and `return` positions never reach
   * `lowerTypeSource` at all.
   */
  readonly unspellable?: string[];
}

const PRIMITIVE_TYPES = new Set<LoweredPrimitiveType>([
  "string",
  "number",
  "integer",
  "boolean",
  "null",
]);

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * The reserved-keyword spellings `lowerTypeExpr`'s atom section classifies
 * before the `IDENTIFIER` / `NamedType` test below would otherwise consume
 * them, read from the lexer's own set (`reservedKeywords()`, lexer.ts) rather
 * than restated here as a second source of truth. A `Set`, not a plain object
 * keyed by author text — a record keyed by arbitrary source spellings needs a
 * null prototype and an own-key guard to be indexed safely by author input,
 * which a `Set.has` call needs neither of. Immutable module-level data, not
 * mutable cross-invocation state, matching `PRIMITIVE_TYPES` above and
 * `PERMITTED_SUBSET_KEYWORDS` (schema-subset-gate.ts).
 */
const RESERVED_KEYWORDS: ReadonlySet<string> = reservedKeywords();

/**
 * Lower a single `params:` type expression to its JSON-Schema fragment,
 * resolving every `NamedType` whole-file against `lowerCtx.bodyTypeMap`:
 *
 *   - a union `A | B` lowers per SUBS-1 (`{ "type": [...] }` all-primitive,
 *     else `{ "anyOf": [...] }`) — split BEFORE the generic-application test
 *     below, so a union whose last arm is itself a generic application splits
 *     into arms rather than being consumed whole as one generic (bug 0043
 *     §Fix);
 *   - `array<T>` lowers to `{ "type": "array", "items": <lowered T> }`;
 *   - a primitive (`string`/`number`/`integer`/`boolean`/`null`) lowers to
 *     `{ "type": <name> }`;
 *   - a reserved-keyword spelling (lexical.md §Reserved keywords) is never a
 *     `NamedType` (`NamedType ::= Ident`, grammar.md:98, and a reserved
 *     spelling cannot be an `Ident`): `true` / `false` lower their
 *     `LiteralType` fragment (`{ "const": true }` / `{ "const": false }`,
 *     matching what `parseLiteralArm` (below) already returns for the same
 *     atom at the top level); `void` lowers `{}` and records
 *     nothing (its own registered row, `void-in-non-return-position`, is the
 *     rejection); every other reserved spelling lowers `{}` and records the
 *     spelling on a second sink: four callers render every hit as
 *     `theta/parse/reserved-keyword-as-identifier` (bug 0044 §Fix); five more
 *     first filter hits through `admittedReservedKeywords`, which withholds
 *     the two `GenericType` heads `Result` and `array` and the two `Result`
 *     value constructors `Ok` and `Err`, and render the remainder the same
 *     way (bug 0274 §Fix route (a));
 *   - an identifier-shaped atom that is NEITHER a primitive NOR a reserved
 *     keyword is a genuine `NamedType`: it resolves against the body
 *     declarations, lowering to an in-document `{ "$ref": "#/$defs/<name>" }`
 *     (and registering the resolved fragment under `$defs`), or — when it
 *     resolves to no declaration — records the name for the
 *     `theta/parse/unresolved-named-type` diagnostic and lowers permissively;
 *     a RESOLVED name matching one of schema-subset.md §Synthesised names
 *     (`:108`)'s four reserved forms lowers permissively and registers
 *     nothing under `$defs` (bug 0040 §Fix Half A) — that namespace belongs
 *     to `hoistInlineObjectType`'s mint, not to this whole-file resolution —
 *     while a reserved-form name that resolves to no declaration takes the
 *     `theta/parse/unresolved-named-type` route above, which the reservation
 *     exempts nothing from.
 *
 * Literal-type and inline-object lowering beyond this subset is owned by the
 * schema-subset lowering leaves, not this seam; an unrecognised form lowers
 * permissively (`{}`) while still resolving any `NamedType` it nests.
 *
 * A `params:` field's own right-hand side never reaches this function
 * brace-rooted, nor as an arm of a union whose `|` segments are ALL
 * brace-balanced with at least one of them itself a single enclosing brace
 * group: `lowerParamsFieldType` (below) intercepts the first shape by
 * hoisting the whole source, and the second through
 * `lowerBraceGroupUnionArms` (below, bug 0097 §Fix), which hoists each
 * brace-group arm of that union and lowers every OTHER arm of it through this
 * function — calling this function on the WHOLE source only for what is left
 * over (bug 0035). A brace-rooted type nested inside a generic argument still
 * arrives here unintercepted, and so does every arm of a union carrying NO
 * brace-group arm at all, or whose segment set a nested `|` has shredded (bug
 * 0039 §Fix constraint 1: a shape the lowering cannot derive stays
 * permissive) — so this function's own handling of those two shapes, the
 * trailing catch-all, is unchanged.
 */
export function lowerTypeExpr(source: string, lowerCtx: LowerCtx): Record<string, unknown> {
  const s = source.trim();

  // Union: lower each arm and combine per SUBS-1. THIS RUNS BEFORE THE
  // GENERIC-APPLICATION TEST BELOW (bug 0043 §Fix): that test is positional,
  // not structural — a `<` anywhere past index 0 plus the source ENDING in
  // `>` — so a union whose LAST arm ends in `>` (an `array<T>` arm, or any
  // other generic application) satisfies it on the union's OWN trailing `>`
  // and would otherwise be consumed whole as one generic application,
  // discarding every arm, including the primitive ones (SUBS-1,
  // schema-subset.md:81).
  const arms = splitTopLevel(s, "|");
  if (arms.length > 1) {
    const mixedArmSet = isMixedLiteralArmSet(arms);
    const loweredArms: LoweredUnionArm[] = arms.map((arm) => {
      const lowered =
        (mixedArmSet ? lowerLiteralUnionArm(arm) : undefined) ?? lowerTypeExpr(arm, lowerCtx);
      const type = lowered["type"];
      if (
        Object.keys(lowered).length === 1 &&
        typeof type === "string" &&
        PRIMITIVE_TYPES.has(type as LoweredPrimitiveType)
      ) {
        return { kind: "primitive", type: type as LoweredPrimitiveType };
      }
      return { kind: "non-primitive", lowered };
    });
    return { ...lowerUnion(loweredArms) };
  }

  // Generic application: `ctor<args>`.
  const lt = s.indexOf("<");
  if (lt > 0 && s.endsWith(">")) {
    const ctor = s.slice(0, lt).trim();
    const interior = s.slice(lt + 1, s.length - 1);
    const args = splitTopLevel(interior, ",");
    // Bug 0204 §Fix (b)(3): `args`' SEGMENT COUNT and every lowered byte stay
    // exactly what the angle-only `splitTopLevel` above produces — widening
    // that split is §Fix (b)(1), whose cost is landed lowered bytes. What
    // changes is which `LowerCtx` each SEGMENT recurses under, decided per
    // segment and never for the list as a whole:
    // `classifyGenericArgumentSegments` (below) reproduces this same split's
    // cut points and marks the segments that are not whole in the source, and
    // only those recurse without `unspellable`, so a fragment the split
    // manufactured can never reach `isUnspellableTextRefusable` while a whole
    // argument of the same list keeps its judgement.
    const segments = classifyGenericArgumentSegments(interior);
    // A segment index the classification does not cover cannot arise — the
    // scan reproduces this split's cut points, trim and non-empty filter — and
    // judging is the direction that adds no silent suppression if it ever did.
    const ctxFor = (index: number): LowerCtx =>
      segments[index]?.whole === false ? withoutUnspellableSink(lowerCtx) : lowerCtx;
    if (ctor === "array" && args.length === 1) {
      const first = args[0] ?? "";
      return { type: "array", items: lowerGenericArgument(first, ctxFor(0)) };
    }
    // Any other generic (e.g. `Result<T, E>`, which has no lowered-schema form):
    // resolve nested named types best-effort, lower permissively.
    const beforeLoop = lowerCtx.unspellable?.length ?? 0;
    for (const [index, arg] of args.entries()) {
      lowerGenericArgument(arg, ctxFor(index));
    }
    // Bug 0217 §Fix (b)(2): a segment this split cut out of a `[…]` group
    // derives from no `Type` alternative (schemas.md:93, grammar.md:90–:102)
    // and is illegal for the same reason the bare spelling is — but every
    // piece of that group has recursed sink-less (`ctxFor`, above), so
    // nothing above this line can ever refuse it. Push the group the author
    // actually wrote, once, as a last resort: only when this list's own
    // recursion earned NO REFUSAL of its own — measured through the shared
    // decline, not the sink's length — so a whole segment beside the group
    // (`???`, `Cat +`) keeps owning the construct's one refusal (§Fix (c)(2))
    // instead of gaining a second for the group beside it.
    pushCutBracketGroupAsLastResort(interior, lowerCtx, beforeLoop);
    return {};
  }

  // Atom.
  if (PRIMITIVE_TYPES.has(s as LoweredPrimitiveType)) {
    return { type: s };
  }
  if (RESERVED_KEYWORDS.has(s)) {
    // `NamedType ::= Ident` (grammar.md:98) and lexical.md §Reserved keywords
    // bars every one of these 32 spellings from identifier position — the
    // split the lexer's own `keyword` / `ident` token-kind tagging already
    // makes (`scanTokens`, `src/lexer/lexer.ts`). `IDENTIFIER` below does not
    // make it, so a reserved spelling has to be dispositioned here, before it
    // can reach — and always miss — the resolution map below (bug 0044 §Fix).
    if (s === "true" || s === "false") {
      // `LiteralType ::= ... BOOLEAN ...` (grammar.md:102): a `Type` atom,
      // not a `NamedType`, matching what `parseLiteralArm` (below) already
      // returns for the same atom at the top level.
      return { const: s === "true" };
    }
    if (s === "void") {
      // The position's own registered row, `void-in-non-return-position`, is
      // the rejection (wired at every position through `parseTypeExpression`);
      // recording it as an unresolved name too would misname a real error.
      return {};
    }
    // Every other reserved spelling is not a `NamedType`, so it is not a
    // resolution failure either: the registered disposition for a keyword
    // written where an identifier is read is `reserved-keyword-as-identifier`
    // (code-registry-parse.md:21). Nine callers read this sink: four render
    // every entry directly; five more (bug 0274 §Fix route (a)) render only
    // the entries `admittedReservedKeywords` does not withhold, since a
    // `GenericType` head and a `Result` value constructor are admitted
    // spellings at those five sites.
    lowerCtx.reservedKeywords?.push(s);
    return {};
  }
  if (IDENTIFIER.test(s)) {
    // An identifier-shaped atom that survives the reserved-keyword
    // classification above is a genuine `NamedType`: resolve whole-file.
    const resolved = lowerCtx.bodyTypeMap.get(s);
    if (resolved === undefined) {
      lowerCtx.unresolved.push(s);
      return {};
    }
    // The synthesised namespace (schema-subset.md:108) is owned by the mint
    // path (`hoistInlineObjectType`), never by this whole-file resolution arm:
    // claiming the key here would let an author-controlled fragment alias a
    // mint this arm does not own (bug 0040 §Fix Half A, arm 2). Lowering
    // permissively instead of registering a `$ref` keeps every OTHER field's
    // `$ref` into that key resolvable against the mint's own fragment rather
    // than dangling or being silently overwritten.
    //
    // THE TEST SITS AFTER RESOLUTION because the reservation exempts no name
    // from `theta/parse/unresolved-named-type`: a reserved-form name bound by
    // nothing is unresolvable input like any other and belongs in the sink
    // above, whose registry row (code-registry-parse.md) triggers on any
    // `NamedType` resolving to no declaration usable at the position it is
    // written. Reaching HERE therefore means the name RESOLVES, and every
    // builder of a `bodyTypeMap` keys it only by body `schema`/`enum`
    // declaration names and `import`-specifier local bindings — positions that
    // both refuse a reserved-form name (the casing rule at a declaration,
    // fixture E / group (d); `theta/parse/import-reserved-synthesised-name` at
    // a specifier, imports.ts). So this arm raises nothing of its own and such
    // a document keeps exactly the one diagnostic its introducing position
    // gives it.
    if (isReservedSynthesisedName(s)) {
      return {};
    }
    lowerCtx.defs[s] = resolved;
    return { $ref: `#/$defs/${s}` };
  }
  // A literal-type atom (string/number literal) or any other form: lower
  // permissively; literal lowering is owned by the schema-subset leaves.
  // The sink's readers — `parseParams` (`params:`, bug 0059 §Fix),
  // `checkSchemaDeclarationGraph` and `walkStatement`'s `schema` arm
  // (theta-document.ts, bug 0061 §Fix), `annotationSourceIsNotTypeExpression`
  // (type-layer-checks.ts, bug 0124 §Fix, over a `let` annotation, an `fn`
  // parameter type and an `fn` return type), and `walkExpr`'s `"query"` arm
  // (theta-document.ts, bug 0203 §Fix, over an author-written `@<T>` / bare
  // `@Ident` query ascription) — decline the literal and brace-carrying
  // survivors of this arm's legitimate traffic through the shared
  // `isUnspellableTextRefusable` predicate and raise the text-level refusal at
  // their own position for what remains.
  lowerCtx.unspellable?.push(s);
  return {};
}

/**
 * Classify one ALREADY-LOWERED union arm for `lowerUnion` (SUBS-1,
 * schema-subset.md §Lowering Algorithm step 3): a fragment whose ONLY key is a
 * `type` naming a primitive is the one shape admitted into the multi-type-array
 * form, and every other fragment is `non-primitive` and forces `anyOf`.
 *
 * Exported because `lowerTypeSource` (body-type-lowering.ts) dispatches a
 * union's arms one at a time — an inline-object arm hoists where the others go
 * to `lowerTypeExpr` (bug 0039 §Fix part B) — and must then reach the SAME
 * verdict `lowerTypeExpr`'s own union branch reaches for the same fragment.
 * Two classifications that disagreed would lower one source to
 * `{"type": [...]}` at one type position and `{"anyOf": [...]}` at another,
 * against type-system.md's one-grammar-everywhere rule. `PRIMITIVE_TYPES` is
 * the single set both read.
 */
export function classifyLoweredUnionArm(lowered: Record<string, unknown>): LoweredUnionArm {
  const type = lowered["type"];
  if (
    Object.keys(lowered).length === 1 &&
    typeof type === "string" &&
    PRIMITIVE_TYPES.has(type as LoweredPrimitiveType)
  ) {
    return { kind: "primitive", type: type as LoweredPrimitiveType };
  }
  return { kind: "non-primitive", lowered };
}

/**
 * Whether a union's arm set carries AT LEAST ONE arm the literal recogniser
 * declines — the gate on the per-arm literal consult below.
 *
 * An arm set that is WHOLLY literal is already owned, as a whole source, by
 * `lowerLiteralSublanguage`: schema-subset.md:80's `{"type":"string","enum":
 * […]}` for the all-string case and its bare-`enum` sibling otherwise, neither
 * of which an arm-by-arm `anyOf` reproduces. Consulting per arm would shadow
 * that emission with `{"anyOf":[{"const":"x"},{"const":"y"}]}` — a third
 * value no step-3 row states — wherever an all-literal union reached
 * `lowerTypeExpr` rather than one of the whole-source callers. That reach
 * used to be the generic-argument recursion; bug 0164 §Fix consults the
 * sublanguage AT THE ARGUMENT (`lowerGenericArgument`, below), before it can
 * recurse there, so an all-literal generic argument now reaches the
 * whole-source emission through that re-routed recursion and never reaches
 * this function's own union split at all. The gate on the per-arm consult
 * stays regardless: it is what keeps a per-ARM consult from shadowing the
 * whole-source emission on the day some other caller hands this function an
 * all-literal set directly.
 */
function isMixedLiteralArmSet(arms: readonly string[]): boolean {
  return arms.some((arm) => parseLiteralArm(arm) === undefined);
}

/**
 * Lower ONE arm of a mixed union through the literal sublanguage — a single
 * accepted atom's schema-subset.md:79 `{"const": <value>}` — or `undefined`
 * when the arm is not the sublanguage's and the caller must lower it exactly
 * as it does every other arm (bug 0184 §Fix).
 *
 * THE PRIMITIVE TEST COMES FIRST, mirroring the order in which `lowerTypeExpr`'s
 * own atom section reads an atom. `null` is BOTH a `PrimitiveType`
 * (grammar.md:97) and a `LiteralType` (`:102`), and SUBS-1
 * (schema-subset.md:81) counts it as a primitive by name — the nullability
 * idiom is that rule's own reference vector, so `Sev | null` keeps
 * `{"type":"null"}` at its arm and `string | null` keeps the collapsed
 * `{"type":["string","null"]}` instead of being widened into an `anyOf` of
 * `{"const":null}` (bug 0184 §Fix constraint 5). Every other primitive
 * spelling is declined by the recogniser anyway; testing the set rather than
 * `null` alone keeps the two readings ordered rather than enumerated.
 */
function lowerLiteralUnionArm(arm: string): Record<string, unknown> | undefined {
  const s = arm.trim();
  if (PRIMITIVE_TYPES.has(s as LoweredPrimitiveType)) {
    return undefined;
  }
  return lowerLiteralSublanguage(s);
}

/**
 * Consult the literal sublanguage for a generic type ARGUMENT before
 * recursing it through `lowerTypeExpr`, so `array<"x">` and `array<"x" |
 * "y">` reach schema-subset.md's `const` / enum emission exactly as every
 * other type-annotation position does, instead of the trailing catch-all
 * (bug 0164 §Fix, route (i)).
 *
 * AT THE ARGUMENT, NOT AT THE HEAD OF `lowerTypeExpr`. The rejected
 * placement — a consult at the top of this function, before the union split
 * — would run on every recursion, including the per-arm union recursion
 * `isMixedLiteralArmSet` gates (above): an all-literal arm set would then be
 * consulted per arm too, wherever a union is written directly rather than
 * through a generic argument, re-opening bug 0184 §Fix's own disposition (an
 * all-literal set stays a WHOLE-SOURCE emission, never a per-arm `anyOf`) as
 * a side effect of a report that does not touch it. Consulting only here
 * reaches exactly the shape this report measures and leaves every other
 * recursion — the union split included — untouched.
 *
 * SHARED BY BOTH GENERIC-ARGUMENT CALL SITES: the arity-1 `array` argument,
 * whose result becomes `items`, and the best-effort loop over every other
 * constructor's arguments. The loop's own return is always discarded — it is
 * a name-resolution walk over an unlowerable generic (`Result<T, E>`), never
 * an emission — so consulting here changes which literal arms and named
 * types the walk RESOLVES (registering a `$ref`, recording an `unresolved`
 * name) and never what it returns.
 *
 * `null` needs no special case anywhere: `lowerLiteralSublanguage` accepts it
 * (`parseLiteralArm` treats `null` as a `LiteralType`) and this consult runs
 * BEFORE `lowerTypeExpr`'s own `PRIMITIVE_TYPES` atom arm ever sees the
 * argument, so `array<null>` reaches `{"const":null}` structurally — the same
 * means bug 0056 §Fix constraint 2 used to move every other position off the
 * primitive `{"type":"null"}` reading.
 */
function lowerGenericArgument(arg: string, lowerCtx: LowerCtx): Record<string, unknown> {
  return lowerLiteralSublanguage(arg) ?? lowerTypeExpr(arg, lowerCtx);
}

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
 * A `LowerCtx` copy carrying no `unspellable` sink — every other member's
 * identity (`unresolved`, `reservedKeywords`, `defs`, `bodyTypeMap`,
 * `inlineFragments`, etc.) is untouched, so name resolution and the
 * `$defs` mint proceed exactly as they do under the caller's own context
 * (bug 0204 §Fix (b)(3): only the refusal-sink field is what a
 * split-manufactured shard must never reach). `unspellable` is `LowerCtx`'s
 * one optional array member a caller may thread or omit (see its own doc,
 * above); omitting it here is that same contract, not a new one.
 */
function withoutUnspellableSink(lowerCtx: LowerCtx): LowerCtx {
  const { unspellable: _unspellable, ...rest } = lowerCtx;
  return rest;
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
 * (`pushCutBracketGroupAsLastResort`, below) names the illegal spelling
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
  let quote: string | undefined;
  let found: { readonly start: number; readonly end: number } | undefined;
  for (let i = 0; i < interior.length; i += 1) {
    const c = interior[i] ?? "";
    if (quote !== undefined) {
      if (c === "\\" && i + 1 < interior.length) {
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

/**
 * Bug 0217 §Fix (b)(2), LAST RESORT: push `interior`'s cut bracket group
 * (`findCutBracketGroupText`, above) into `lowerCtx.unspellable` iff the
 * argument recursion the caller has run earned NO REFUSAL there —
 * `beforeLength` is the sink's length snapshotted before that recursion ran,
 * so `slice(beforeLength)` is exactly what that recursion contributed.
 *
 * The unit of "already earned" is what the SHARED DECLINE admits
 * (`isUnspellableTextRefusable`, below), not what the sink holds: the
 * property being preserved is one refusal per construct (§Fix (c)(2)) — a
 * segment beside the group that already earned a refusal keeps owning it
 * (`array<enum["a", "b"], ???>`, bug 0204 cell l2; `array<enum["a", "b"],
 * Cat +>`) — and a construct is refused only where every position's own
 * emission consults that predicate. A raw length test would count an entry
 * the decline REJECTS (any brace-carrying whole argument, e.g.
 * `pair<{a: string}, enum["x", "y"]>`'s `{a: string}`) as a contribution and
 * suppress the group's refusal while the sibling earned none, which is bug
 * 0217's own symptom surviving beside the fix.
 *
 * The suppression is otherwise an authorized under-refusal of bug 0204
 * residual 2's own class (a segment's own recursion can itself under-refuse
 * junk it carries, e.g. `array<{a: Cat +, b: integer, c: boolean}>`'s
 * `Cat +`) applied here to the group text instead: stated in this comment
 * rather than discovered by a reviewer.
 *
 * Called from the ONE generic-arm return point that can carry a cut group —
 * the best-effort loop over every other constructor's arguments. The arity-1
 * `array` branch above cannot: a cut bracket group forces TWO OR MORE
 * segments, because the split cuts at exactly the angle-depth-0 commas this
 * helper's group must enclose, and such a comma leaves the group's `[` behind
 * it and its matching `]` ahead of it, so both sides are non-empty and
 * survive `splitTopLevel`'s non-empty filter — `args.length === 1` and a cut
 * bracket group are mutually exclusive.
 *
 * A no-op when `lowerCtx.unspellable` is absent (the sink is `LowerCtx`'s one
 * optional array member; a caller threading none gets no push, matching every
 * other reader of it).
 */
function pushCutBracketGroupAsLastResort(
  interior: string,
  lowerCtx: LowerCtx,
  beforeLength: number,
): void {
  if (
    lowerCtx.unspellable === undefined ||
    lowerCtx.unspellable.slice(beforeLength).some(isUnspellableTextRefusable)
  ) {
    return;
  }
  const group = findCutBracketGroupText(interior);
  if (group !== undefined) {
    lowerCtx.unspellable.push(group);
  }
}

/** One accepted `field: Type` entry of an inline object's interior. */
interface InlineObjectEntry {
  readonly fieldName: string;
  readonly fieldType: string;
}

/**
 * Classify one already-top-level-split inline-object entry as its
 * `{fieldName, fieldType}` pair, or `undefined` for exactly the shapes
 * `hoistInlineObjectType` (below) has always `continue`d over: no top-level
 * `:` (bug 0238's tolerated junk segment, `topLevelColon` returning `-1`), or
 * a colon whose name or type half trims empty. `hoistInlineObjectType` and
 * `projectRenderedParamType` (bug 0251 §Fix, below `lowerParamsFieldType`)
 * both call this rather than each keeping its own copy of the accept/reject
 * decision, so the rendered `Parameters:` line can never drop a different
 * entry set than the schema the same group lowers to.
 */
function classifyInlineObjectEntry(entry: string): InlineObjectEntry | undefined {
  const colon = topLevelColon(entry);
  if (colon < 0) {
    return undefined;
  }
  const fieldName = entry.slice(0, colon).trim();
  const fieldType = entry.slice(colon + 1).trim();
  if (fieldName.length === 0 || fieldType.length === 0) {
    return undefined;
  }
  return { fieldName, fieldType };
}

/**
 * Hoist a brace-rooted type source (`{a: Triage, b: integer}`) into a `$ref`
 * against a freshly-minted `__inline_<slug>` entry in `lowerCtx.defs` — the
 * mechanism `lowerParamsFieldType` (below) has owned since bug 0035, now
 * shared with `lowerTypeSource` (body-type-lowering.ts) so the `@<T>`
 * annotation, a `schema` body field type and the alias/union right-hand side
 * hoist an inline object exactly as the `params:` position does (bug 0039
 * §Fix part B). `body-type-lowering.ts` imports from this module and not the
 * reverse, so the shared arm lives here rather than there.
 *
 * THE INTERIOR SPLIT NESTS BRACE DEPTH. The interior of a brace-rooted type is
 * an inline-object FIELD LIST whose per-field `Type` is recursive
 * (grammar.md:109), so a nested `ObjectType` is ONE field's type and the comma
 * inside it is not an outer separator — hence `"angle-and-brace"`. Splitting on
 * angle depth alone reads `{a: Triage, b: {x: integer, y: string}}` as the three
 * entries `a: Triage`, `b: {x: integer`, `y: string}`: a fragment carrying a
 * permissive `b`, a PHANTOM top-level `y`, and a three-name `required` — AJV
 * then rejects the author's own payload and accepts the phantom shape instead.
 * `topLevelColon` needs no change: it already tracks brace depth, so a nested
 * object's own `:` never splits the enclosing entry.
 *
 * `lowerFieldType` is the caller's OWN recursion for a field's `Type`. Both
 * callers now check the SAME literal sublanguage first
 * (`lowerLiteralSublanguage`), so that asymmetry is gone — but each still
 * passes ITSELF here, not a bare call to the shared check, because a
 * declined literal still has to reach the rest of that position's OWN
 * dispatch, which the shared check performs none of.
 * `lowerParamsFieldType` passes itself, so its own pre-brace call to
 * `lowerLiteralSublanguage` runs again for a nested brace-rooted field
 * exactly as for a top-level one (the MIXED fixture). `lowerTypeSource`
 * passes an inner helper for the same reason: its own brace-group and
 * shredded-union dispatches sit AFTER its literal check too, and only
 * recursing back into `lowerTypeSource` itself — never `lowerTypeExpr`,
 * which owns no literal check — reaches them at every depth (bug 0056 §Fix,
 * discharging bug 0039 §Fix's "the literal sublanguage must not regress"
 * constraint by sharing the sublanguage itself rather than by convention).
 *
 * A zero-field body — `{}`, or an interior of only whitespace — returns the
 * permissive `{}` with no hoist and no diagnostic. grammar.md:109's rule now
 * refuses an empty inline object at parse time, at every position and every
 * nesting depth (bug 0045 §Fix), so a loading document never reaches this arm
 * with an empty body; it stays unreachable defence in depth for a caller that
 * lowers a source string directly, bypassing the parse gate.
 */
export function hoistInlineObjectType(
  source: string,
  lowerCtx: LowerCtx,
  lowerFieldType: (fieldSource: string, fieldCtx: LowerCtx) => Record<string, unknown>,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const entry of splitTopLevel(source.slice(1, -1), ",", "angle-and-brace")) {
    const classified = classifyInlineObjectEntry(entry);
    if (classified === undefined) {
      continue;
    }
    const { fieldName, fieldType } = classified;
    // An inline object field name is author-controlled; see
    // `defineRecordField`'s doc-comment for why this must define, not assign.
    defineRecordField(properties, fieldName, lowerFieldType(fieldType, lowerCtx));
    required.push(fieldName);
  }
  if (required.length === 0) {
    return {};
  }

  const fragment: Record<string, unknown> = {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
  // Content-addressed, so two fields declaring inline types that LOWER ALIKE
  // share one `$defs` entry. The slug is a 64-bit truncation of SHA-256, so a
  // slug match is only evidence of fragment identity until the bytes are
  // compared: schema-subset.md §Schema-slug collision posture mandates that
  // comparison on every `__inline_<slug>` match and requires the bytes to be
  // RETAINED beside the entry, so the check is a byte comparison rather than a
  // re-serialisation. `canonicalForm` is called here rather than the bytes being
  // reconstructed from `schemaSlug`'s internals, which keeps the hash recipe
  // (§Canonical schema hash steps 2–4) owned by schema-lowering.ts.
  const lowered: LoweredJsonValue = toLoweredJsonValue(fragment);
  const canonical = canonicalForm(lowered);
  const slug = schemaSlug(lowered);
  const defName = `__inline_${slug}`;
  const retainedBytes = lowerCtx.inlineCanonical?.get(slug);
  const retainedFragment = lowerCtx.inlineFragments?.get(slug);
  // ALREADY MINTED means either scope says so — this call's `defs`, or the
  // fragment retention. The two are not always one scope: `buildBodyTypeSchemas`
  // (body-type-lowering.ts) shares one retention across a document while giving
  // each schema decl its own `defs`. Consulting `defs` alone would let a second
  // decl minting a slug the first already minted skip the byte comparison,
  // record no collision, and overwrite the retention last-wins — the silent
  // aliasing schema-subset.md §Schema-slug collision posture forbids. A caller
  // that threads no fragment retention keeps the single-scope reading, `defs`
  // alone.
  if (lowerCtx.defs[defName] !== undefined || retainedFragment !== undefined) {
    if (retainedBytes !== undefined && retainedBytes !== canonical) {
      // Differing bytes: refuse to merge and report the slug. The caller raises
      // the registered `theta/load/schema-slug-collision`, whose message literal
      // is held identical to `dedupInlineSchemas`'s (schema-lowering.ts) by
      // DIAG-4 rather than by shared code — that function applies the same
      // posture to a post-hoc fragment LIST and has no production caller today,
      // while this site needs the decision AT MINT TIME because the `$ref` it
      // returns must name whichever fragment is retained.
      lowerCtx.slugCollisions?.push(slug);
    }
    if (retainedFragment !== undefined && lowerCtx.defs[defName] === undefined) {
      // The RETAINED fragment, never the one built above: first-wins holds
      // across scopes, and the `$ref` returned below has to name a def that
      // exists in THIS scope or the enclosing `$defs` closure dangles (AJV
      // refuses a dangling `$ref` with `MissingRefError`).
      lowerCtx.defs[defName] = retainedFragment;
    }
    // FIRST WINS either way — the retention posture `dedupInlineSchemas` applies:
    // byte-equal fragments are the silent dedup case (schema-subset.md step 2),
    // and a colliding one must not displace the fragment an earlier field's
    // `$ref` already names. schema-subset.md:108 reserves the four
    // synthesised-name forms against author names (bug 0040 §Fix Half A): the
    // import-specifier check (imports.ts) refuses a binding shaped like this
    // key, and `lowerTypeExpr`'s `IDENTIFIER` arm (above) never writes one, so
    // an author-declared fragment cannot reach `defs[defName]` under this exact
    // key any more. An entry carrying no retained bytes is therefore a
    // CROSS-SCOPE mint, not an author declaration: a caller that shares this
    // `defs` object across `hoistInlineObjectType` calls without also sharing
    // THIS call's `inlineCanonical` / `inlineFragments` retention mints the
    // same slug twice with nothing to compare — the slug-vs-slug surface bug
    // 0054 owns.
    return { $ref: `#/$defs/${defName}` };
  }
  lowerCtx.defs[defName] = fragment;
  lowerCtx.inlineCanonical?.set(slug, canonical);
  lowerCtx.inlineFragments?.set(slug, fragment);
  return { $ref: `#/$defs/${defName}` };
}

/**
 * Whether `s` is a SINGLE enclosing brace group: the `{` at index 0 is closed
 * by the `}` at the final index, with no unmatched close before then (quote
 * contents are skipped so a brace inside a string literal cannot perturb
 * depth). `lowerTypeSource` (body-type-lowering.ts) and `lowerParamsFieldType`
 * (below) both ask this of the whole source, then of each arm of a union
 * through `lowerBraceGroupUnionArms` (below) — every caller needs it rather
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
 * (below) asks it too, in place of the positional `startsWith("{") &&
 * endsWith("}")` test bug 0039 §Fix's byte-freeze had kept there: bug 0097
 * §Fix is the authority that lifts the freeze for a top-level union of
 * brace-balanced arms, and this predicate paired with
 * `lowerBraceGroupUnionArms` (below) is what the lifted position now asks. No
 * dispatch or classifier in this codebase still asks the naive two-ended
 * question on its own account — only this predicate's own first statement
 * does, because that statement IS the fast decline every caller relies on.
 *
 * Defined here rather than in `body-type-lowering.ts`, which imports from
 * this module and not the reverse (bug 0039 §Fix's import-direction rule) —
 * the same rule that keeps `hoistInlineObjectType` (above) and
 * `lowerBraceGroupUnionArms` (below) here too. `body-type-lowering.ts`
 * re-exports this name so its own importers (`theta-document.ts`,
 * `query-schema-lowering.ts`) keep reaching it at the same import path.
 */
export function isSingleEnclosingBraceGroup(s: string): boolean {
  if (!(s.startsWith("{") && s.endsWith("}"))) {
    return false;
  }
  let depth = 0;
  let quote: string | undefined;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i] ?? "";
    if (quote !== undefined) {
      if (c === "\\" && i + 1 < s.length) {
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
    if (c === "{") {
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
  let quote: string | undefined;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i] ?? "";
    if (quote !== undefined) {
      if (c === "\\" && i + 1 < s.length) {
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
    if (c === "{") {
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
 * The per-arm union dispatch `lowerTypeSource` (body-type-lowering.ts) and
 * `lowerParamsFieldType` (above) both reach once their caller has declined
 * `isSingleEnclosingBraceGroup(source)` on the whole source: re-split
 * `source` on `|` and, when every segment is brace-balanced (`isBraceBalanced`
 * above) and at least one segment is itself a single enclosing brace group,
 * hoist that arm through `hoistInlineObjectType` (`lowerFieldType` recursing
 * for its own fields) and lower every other arm through `lowerTypeExpr`,
 * combining the results by `lowerUnion` per SUBS-1 — so
 * `{a: integer} | {b: integer}` hoists BOTH arms rather than being misread as
 * one inline field list. `undefined` is returned when the guard declines, so
 * the caller falls through to its own `lowerTypeExpr(source, lowerCtx)`
 * exactly as if this function had never been asked (bug 0097 §Fix, which
 * gives the `params:` position this dispatch for the first time and moves it
 * here, beside `isSingleEnclosingBraceGroup` and `isBraceBalanced`, because
 * `body-type-lowering.ts` imports from this module and not the reverse).
 *
 * THE GUARD DECLINES ON TWO GROUNDS, and only the SHREDDED one is
 * behavioural. A union with NO brace-group arm — `arms.some
 * (isSingleEnclosingBraceGroup)` false — is the same union `lowerTypeExpr`'s
 * own per-arm split (above, ahead of its generic-application test since bug
 * 0043 §Fix) already produces correctly, so declining it moves no bytes; the
 * decline keeps this function's contract narrow — hoist an arm or defer,
 * never re-implement the primitive union path. A union whose segment set is
 * SHREDDED — the angle-only `|` split cut through a brace group, so at least
 * one segment fails `isBraceBalanced` — is declined because a shredded
 * segment is a piece of a `Type`, not a `Type` (`isBraceBalanced`'s own doc
 * comment states why a balanced-looking piece inside a shredded set is still
 * not an arm). Arm ORDER is source order, and the SUBS-1 combination is
 * `lowerUnion`'s, so an arm that is not an inline object lowers through the
 * same call `lowerTypeExpr`'s own union branch would have made on it.
 *
 * CALLING THIS UNCONDITIONALLY, WITHOUT A CALLER FIRST CHECKING
 * `isSingleEnclosingBraceGroup(source)`, WOULD BE SAFE, though neither caller
 * does so. The two guards are provably disjoint: the arm guard forces brace
 * depth to 0 at every `|` cut (a segment, a separator and any whitespace
 * between them carry no depth of their own, and a quoted region is skipped by
 * the split and by both predicates alike), while a single enclosing brace
 * group holds depth at 1 or more everywhere strictly inside it — so a source
 * satisfying the second could satisfy the first only by carrying a single
 * segment, which `arms.length > 1` above already excludes. `{a: string |
 * null}` is that pair made concrete: it IS one brace group, and the
 * angle-only split cuts its interior union into `{a: string` and `null}`,
 * both unbalanced, which is what the arm guard refuses regardless of whether
 * the whole-source check ran first. Both callers ask the whole-source
 * question first anyway, because it leaves this function reasoning only
 * about sources that are not one brace group — not because skipping it would
 * change an answer.
 */
export function lowerBraceGroupUnionArms(
  source: string,
  lowerCtx: LowerCtx,
  lowerFieldType: (fieldSource: string, fieldCtx: LowerCtx) => Record<string, unknown>,
): Record<string, unknown> | undefined {
  const arms = splitTopLevel(source, "|");
  if (
    !(
      arms.length > 1 &&
      arms.every((arm) => isBraceBalanced(arm)) &&
      arms.some((arm) => isSingleEnclosingBraceGroup(arm))
    )
  ) {
    return undefined;
  }
  const mixedArmSet = isMixedLiteralArmSet(arms);
  const loweredArms = arms.map((arm) =>
    classifyLoweredUnionArm(
      isSingleEnclosingBraceGroup(arm)
        ? hoistInlineObjectType(arm, lowerCtx, lowerFieldType)
        : ((mixedArmSet ? lowerLiteralUnionArm(arm) : undefined) ??
          lowerTypeExpr(arm, lowerCtx)),
    ),
  );
  return { ...lowerUnion(loweredArms) };
}

/**
 * Parse a literal-type atom (a quoted string, integer/number, boolean, or
 * `null`) to its JSON value, or `undefined` when the atom is not a literal.
 * Wrapped so a legitimately-`null` literal is distinguishable from "not a
 * literal".
 *
 * Exported, and living here rather than in `body-type-lowering.ts`: that
 * module imports from this one and not the reverse (bug 0039 §Fix), and
 * `lowerLiteralSublanguage` (below) — the one emission every caller sharing
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
 * (`lowerParamsFieldType`'s intercept, `hoistInlineObjectType`, bugs
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
 * §Fix (b)(3), `classifyGenericArgumentSegments` below
 * `lowerGenericArgument`): it is filtered out before the `unspellable` sink
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
 * `parseParams` below (`params:`, bug 0059 §Fix), the two body-position
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
export function hasUnterminatedStringLiteral(text: string): boolean {
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
    }
  }
  return quote !== undefined;
}

/**
 * Lower a type source's literal sublanguage — a quoted string (either quote
 * form), `true`, `false`, `null`, or a signed integer/decimal, alone or in a
 * `|`-separated union of them (`splitTopLevel`) — to schema-subset.md's
 * literal emission, or `undefined` when `source` is not (wholly) that
 * sublanguage: a union carrying any non-literal arm declines whole, matching
 * `parseLiteralArm`'s own per-arm decline (bug 0043 §Non-goals; bug 0056
 * §Non-goals — a mixed union still declines WHOLE here, unchanged). The
 * literal ARM no longer stays permissive "everywhere": bug 0184 §Fix gates
 * `lowerTypeExpr`'s own union-arm recursion, and `lowerBraceGroupUnionArms`'s
 * non-brace-arm one, on this same recogniser, so a MIXED arm set's own
 * literal arm reaches schema-subset.md:79's `const` there, while an
 * ALL-literal set still lowers whole through this function, unshadowed (bug
 * 0184 §Fix constraint 2).
 *
 * The one emission FOUR call sites now share, not two: `lowerParamsFieldType`
 * (below) and `lowerTypeSource` (body-type-lowering.ts) each call it at the
 * TOP of a type source, so the `params:` position agrees with the other
 * three type-annotation positions on a literal source's bytes by
 * construction (bug 0056 §Fix) rather than by two call sites kept in sync by
 * hand; `lowerLiteralUnionArm` (above) calls it per MIXED-union ARM (bug 0184
 * §Fix); `lowerGenericArgument` (above) calls it per generic ARGUMENT (bug
 * 0164 §Fix). More than one arm returns the union form only when EVERY arm is
 * accepted — one declined arm declines the whole union; exactly one arm
 * returns schema-subset.md:79's `const` when accepted, and declines
 * otherwise. The union form's KEY ORDER is CONTRACTUAL, not cosmetic: `type`
 * first when every value is a string (schema-subset.md:80), the bare `enum`
 * otherwise per SUBS-3 (schema-subset.md:80, the anchor `#subs-3`). That
 * order is contractual as EMITTED BYTES — the bytes
 * schema-subset.md:80 spells, and the bytes the model is shown — but it is not
 * slug-bearing: every mint hashes the canonical form, whose keys are code-point
 * sorted, so `type`-first and `enum`-first collapse onto one slug (bug 0055 §Fix;
 * bug 0056 §Fix *Ordering*; bug 0099 §Fix route A). The ternary is bug 0055's landed one,
 * moved here verbatim rather than re-spelled.
 */
export function lowerLiteralSublanguage(source: string): Record<string, unknown> | undefined {
  const arms = splitTopLevel(source, "|");
  if (arms.length > 1) {
    const literals = arms.map(parseLiteralArm);
    if (literals.every((lit) => lit !== undefined)) {
      const values = literals.map((lit) => (lit as { readonly value: unknown }).value);
      return values.every((v) => typeof v === "string")
        ? { type: "string", enum: values }
        : { enum: values };
    }
    return undefined;
  }
  const lit = parseLiteralArm(source);
  return lit !== undefined ? { const: lit.value } : undefined;
}

/**
 * Lower a single `params:` field's type expression. Checks the literal
 * sublanguage first (`lowerLiteralSublanguage` above, bug 0056 §Fix
 * constraint 1), returning its `const` / `enum` fragment on a match. A
 * decline reaches the structural brace test bug 0097 §Fix installs — a
 * structural question, not the positional `startsWith("{") && endsWith("}")`
 * one: a source
 * that IS a single enclosing brace group (`isSingleEnclosingBraceGroup`,
 * above) hoists through `hoistInlineObjectType` before it can reach
 * `lowerTypeExpr`'s catch-all — `parseParams`'s per-field loop calls this
 * instead of `lowerTypeExpr` directly (bug 0035), so a name inside the object
 * resolves through the same `lowerCtx`, landing in `lowerCtx.unresolved` for
 * the caller's diagnostic loop or in `lowerCtx.defs` as a hoisted `$ref`
 * target — exactly as every other type position now does too (bug 0039
 * §Fix).
 *
 * A source that is NOT one brace group but IS a top-level union whose `|`
 * segments are all brace-balanced, with at least one segment itself a single
 * enclosing brace group, takes `lowerBraceGroupUnionArms` (above): each
 * brace-group arm hoists on its own terms and every other arm lowers through
 * `lowerTypeExpr`, combined by `lowerUnion` per SUBS-1 — so
 * `{a: integer} | {b: integer}` hoists BOTH arms rather than being misread as
 * the single-field list a positional test would read from the first arm's
 * opening brace and the last arm's closing one. Everything else — a
 * brace-free union, a shredded segment set (`isBraceBalanced` declines), a
 * malformed brace-suffixed source — falls through to `lowerTypeExpr`
 * unchanged.
 *
 * The hoist itself is `hoistInlineObjectType`, shared with `lowerTypeSource`
 * (body-type-lowering.ts). Bug 0039 §Fix froze this function's bytes
 * byte-for-byte; bug 0056 §Fix lifted that freeze for a source that is wholly
 * what `parseLiteralArm` recognises, at any depth; bug 0097 §Fix lifts it
 * again for a top-level union carrying a brace-balanced arm.
 *
 * WHAT THE ROUTE GUARANTEES, AND WHERE BYTE IDENTITY STOPS. THE ROUTE is
 * invariant for every single enclosing brace group: `hoistInlineObjectType`
 * over the whole source, this function as the per-field recursion. That is also
 * what makes each lifted check apply at every depth without a second
 * implementation, since a nested brace-rooted field type re-enters HERE,
 * reached through the hoist or through a union arm's own hoist alike. BYTE and
 * slug identity is the narrower claim, because a group's slug hashes its
 * FIELDS' fragments: a group whose field types all sit outside bug 0097 §Fix's
 * moved class holds its bytes and its name (`p: "{a: integer, b: string}"`
 * mints `__inline_9b890568745f5ea5`;
 * `p: "{a: integer, b: {x: integer, y: string}}"` mints
 * `__inline_dd69af402813aa7d` over `__inline_c319be1cd4ab5f98`, the two names
 * a `schema` body field mints for that text). A group carrying a moved-class
 * FIELD type lands on the name that class produces everywhere:
 * `p: "{m: {a: integer} | {b: integer}}"` mints `__inline_e6cf18116192f591`
 * over the arm fragments `__inline_df817b794ef788ce` and
 * `__inline_8cc8cb1e7074a3af` — the name a `schema X = {m: …}` alias
 * right-hand side and a `schema S { f: {m: …} }` body field mint for the same
 * text, and the name an `@<T>` root mints for it one nesting down. That
 * convergence is §Fix constraint 3's one-source-text-one-name rule, which is
 * what makes schema-subset.md `:73`'s dedup mechanical.
 */
export function lowerParamsFieldType(
  source: string,
  lowerCtx: LowerCtx,
): Record<string, unknown> {
  const s = source.trim();
  const literal = lowerLiteralSublanguage(s);
  if (literal !== undefined) {
    return literal;
  }
  if (isSingleEnclosingBraceGroup(s)) {
    return hoistInlineObjectType(s, lowerCtx, lowerParamsFieldType);
  }
  const armUnion = lowerBraceGroupUnionArms(s, lowerCtx, lowerParamsFieldType);
  if (armUnion !== undefined) {
    return armUnion;
  }
  return lowerTypeExpr(s, lowerCtx);
}

/**
 * Project one brace group's rendered text to what `hoistInlineObjectType`
 * kept: reuse `classifyInlineObjectEntry`'s accept/reject decision entry by
 * entry, drop a rejected entry, and recurse the projection into an accepted
 * entry's own field type (a nested inline object can carry the same tolerated
 * junk one level down). Returns the `group` argument itself — the author's own
 * bytes, never a reconstruction — whenever no entry was dropped and no nested
 * field type projected differently.
 *
 * ZERO ACCEPTED ENTRIES returns the group VERBATIM rather than the permissive
 * `{}` `hoistInlineObjectType` itself would emit for it: an empty schema
 * encodes nothing and forbids nothing (`additionalProperties` is never set),
 * so there is no lowered contract for the rendered text to contradict, and
 * bug 0251 §Fix only reconciles a rendering against a contract that exists.
 *
 * REBUILDING WITH `", "` IS ONLY EVER REACHED ON A GROUP THAT ACTUALLY LOST A
 * SEGMENT (`changed`), which is why the reconstruction can never perturb a
 * well-formed declaration's bytes: a group whose every entry survives
 * classification and whose every field type projects unchanged returns
 * `group` itself, untouched.
 */
function projectBraceGroup(group: string): string {
  const interior = group.slice(1, -1);
  const entries = splitTopLevel(interior, ",", "angle-and-brace");
  const kept: string[] = [];
  let changed = false;
  for (const entry of entries) {
    const classified = classifyInlineObjectEntry(entry);
    if (classified === undefined) {
      changed = true;
      continue;
    }
    const { fieldName, fieldType } = classified;
    const projectedFieldType = projectRenderedParamType(fieldType);
    if (projectedFieldType !== fieldType) {
      kept.push(`${fieldName}: ${projectedFieldType}`);
      changed = true;
    } else {
      // `entry` is already `splitTopLevel`'s trimmed segment text — identical
      // to re-emitting `${fieldName}: ${fieldType}` byte for byte, kept as the
      // ORIGINAL text rather than reassembled so an entry this loop never had
      // to touch never risks a whitespace or quoting difference from the
      // author's own bytes.
      kept.push(entry);
    }
  }
  if (kept.length === 0 || !changed) {
    return group;
  }
  return `{${kept.join(", ")}}`;
}

/**
 * Project a `params:` field's declared surface type to what the field's
 * lowering (`lowerParamsFieldType`, above) actually encoded, for the binder
 * system prompt's `Parameters:` line (bug 0251 §Fix). Byte-identical to
 * `source` unless the lowering discarded a top-level inline-object segment
 * somewhere inside it — a well-formed declared type is therefore unaffected,
 * matching §Fix's identity-on-well-formed-input constraint.
 *
 * MIRRORS `lowerParamsFieldType`'s OWN DISPATCH ORDER, because a rendering
 * that asked a different question of the same source could accept an entry
 * the lowering rejected (or the reverse), which is the exact divergence this
 * fix closes:
 *
 *   1. the literal sublanguage (`lowerLiteralSublanguage`) on the trimmed
 *      source — a literal type hoists nothing, so it renders verbatim;
 *   2. a single enclosing brace group — project it (`projectBraceGroup`);
 *   3. `lowerBraceGroupUnionArms`'s own guard, reproduced exactly (`arms =
 *      splitTopLevel(s, "|")`, `arms.length > 1 && arms.every(isBraceBalanced)
 *      && arms.some(isSingleEnclosingBraceGroup)`) — project only the arms
 *      that are themselves a single enclosing brace group; every other arm
 *      lowers through `lowerTypeExpr`, which hoists nothing, so it is left
 *      untouched here too;
 *   4. otherwise verbatim.
 *
 * ROUTE 4 DOES NOT DESCEND INTO A GENERIC ARGUMENT ON PURPOSE.
 * `array<{a: integer, b > c, m: integer}>` lowers through `lowerTypeExpr`'s
 * generic-application arm, which never calls `hoistInlineObjectType` on its
 * argument and lowers the whole application permissively (`{}`) instead — the
 * interior is not hoisted AT ALL, tolerated segment and declared fields both.
 * Projecting the interior here would drop `b > c` from a rendering whose
 * matching schema is `{}`, encoding a property set the schema never asked
 * for and making the two diverge in the OTHER direction from the one this
 * fix closes. `array<...>` is therefore route 4's fallback, identical to
 * every other shape this dispatch does not recognise.
 */
export function projectRenderedParamType(source: string): string {
  const s = source.trim();
  if (lowerLiteralSublanguage(s) !== undefined) {
    return source;
  }
  if (isSingleEnclosingBraceGroup(s)) {
    const projected = projectBraceGroup(s);
    return projected === s ? source : projected;
  }
  const arms = splitTopLevel(s, "|");
  if (
    arms.length > 1 &&
    arms.every((arm) => isBraceBalanced(arm)) &&
    arms.some((arm) => isSingleEnclosingBraceGroup(arm))
  ) {
    let changed = false;
    const projectedArms = arms.map((arm) => {
      if (!isSingleEnclosingBraceGroup(arm)) {
        return arm;
      }
      const projected = projectBraceGroup(arm);
      if (projected !== arm) {
        changed = true;
      }
      return projected;
    });
    return changed ? projectedArms.join(" | ") : source;
  }
  return source;
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
  let quote: string | undefined;
  for (let i = 0; i < entry.length; i += 1) {
    const c = entry[i] ?? "";
    if (quote !== undefined) {
      if (c === "\\" && i + 1 < entry.length) {
        i += 1;
      } else if (c === quote) {
        quote = undefined;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
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
 *     (`classifyGenericArgumentSegments`, `withoutUnspellableSink`, both
 *     defined below `lowerGenericArgument`) and recurses only the pieces
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
 *     (above) splits it for every type position that hoists, and
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
