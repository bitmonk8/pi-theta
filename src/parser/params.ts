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
import { checkLiteralSublanguage, hasRawNewlineInStringLiteral } from "./literal-sublanguage";
import { isReservedSynthesisedName } from "./synthesised-names";
import {
  canonicalForm,
  lowerUnion,
  schemaSlug,
  type LoweredJsonValue,
  type LoweredObjectEntry,
  type LoweredPrimitiveType,
  type LoweredUnionArm,
} from "./schema-lowering";
import { parseTypeExpression } from "./type-grammar";

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
 *   - `theta/load/params-type-not-expression` — a field's recovered type text
 *     spells no `Type` production (bug 0059 §Fix): the field's own value node
 *     already passed the frontmatter seam's shape gate
 *     (`ParamFieldInput.shapeRefused` unset), the text is not what
 *     `parseLiteralArm` recognises or brace-carrying, and the field carries no
 *     other error-severity diagnostic from this same pass;
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
  // Fields whose type half drew `theta/load/params-type-not-expression` below,
  // so the default-literal loop further down (bug 0059 §Fix's guard
  // extension) can tell which fields to leave unchecked.
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
    properties[field.name] = lowerParamsFieldType(field.typeSource, lowerCtx);
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
    // bug 0059 §Fix constraint 3: decline this field's `unspellable` entries
    // down to what the catch-all is NOT licensed to carry. `parseLiteralArm`
    // (0056's recogniser) declines a `LiteralType` atom; the brace check
    // declines every text carrying a brace, WIDER than "brace-rooted" by
    // operator grant (HEAD 948b7814) — "the brace frame
    // (`lowerParamsFieldType`'s intercept, `hoistInlineObjectType`, bugs
    // 0035/0045/0052) owns every text carrying a brace; this refusal owns
    // brace-free text." Necessity: `splitTopLevel` defaults to angle-only
    // nesting, so `array<{x: integer, y: string}>` hands this arm the two
    // UNBALANCED fragments `{x: integer` and `y: string}` — neither
    // brace-ROOTED, both brace-CARRYING — and a narrower "brace-rooted" test
    // would refuse both.
    const refusable = unspellable.filter(
      (text) => parseLiteralArm(text) === undefined && !text.includes("{") && !text.includes("}"),
    );
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
      refusable.length > 0 &&
      field.shapeRefused !== true &&
      !diagnostics.slice(fieldDiagStart).some((d) => d.severity === "error")
    ) {
      typeRefused.add(field);
      diagnostics.push({
        severity: "error",
        code: "theta/load/params-type-not-expression",
        file: site.file,
        range: field.range,
        message: `'params:' field '${field.name}' right-hand side is not a theta type expression`,
      });
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
    if (hasRawNewlineInStringLiteral(field.defaultSource)) {
      diagnostics.push({
        severity: "error",
        code: "theta/parse/literal-newline-in-string",
        file: site.file,
        range: field.range,
        message: "literal newline in string literal",
      });
    }
    diagnostics.push(
      ...checkLiteralSublanguage(field.defaultSource, "default", {
        file: site.file,
        range: field.range,
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
   * each of the four callers renders an entry as
   * `theta/parse/reserved-keyword-as-identifier`.
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
   * atoms and brace-carrying survivors of this arm's legitimate traffic (a
   * mixed union's literal arm; a brace-rooted type nested in a generic
   * argument or a union arm) and turns what remains into
   * `theta/load/params-type-not-expression` at the field being lowered.
   *
   * OPTIONAL for the same reason `slugCollisions` is: a caller threading no
   * sink collects nothing and the catch-all stays exactly as permissive as it
   * always was. `lowerTypeSource` (body-type-lowering.ts) builds its own
   * `LowerCtx` without this key, so the `schema`-body field, the alias
   * right-hand side, and the `@<T>` annotation reach this same catch-all and
   * keep byte-identical lowered documents and diagnostic sequences (bug 0059
   * §Fix constraint 2).
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
 *     spelling on a second sink, which each of the four callers renders as
 *     `theta/parse/reserved-keyword-as-identifier` (bug 0044 §Fix);
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
 * brace-rooted: `lowerParamsFieldType` (below) intercepts that shape first and
 * hoists it, calling this function only for what is left over (bug 0035). A
 * brace-rooted type nested inside a generic argument or a union arm still
 * arrives here unintercepted, so this function's own handling of that shape —
 * the trailing catch-all — is unchanged.
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
    const loweredArms: LoweredUnionArm[] = arms.map((arm) => {
      const lowered = lowerTypeExpr(arm, lowerCtx);
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
    const args = splitTopLevel(s.slice(lt + 1, s.length - 1), ",");
    if (ctor === "array" && args.length === 1) {
      const first = args[0] ?? "";
      return { type: "array", items: lowerTypeExpr(first, lowerCtx) };
    }
    // Any other generic (e.g. `Result<T, E>`, which has no lowered-schema form):
    // resolve nested named types best-effort, lower permissively.
    for (const arg of args) {
      lowerTypeExpr(arg, lowerCtx);
    }
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
    // makes (lexer.ts:665). `IDENTIFIER` below does not make it, so a
    // reserved spelling has to be dispositioned here, before it can reach —
    // and always miss — the resolution map below (bug 0044 §Fix).
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
    // (code-registry-parse.md:21), rendered by each of the four callers from
    // this sink.
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
  // `parseParams` is this sink's one reader (bug 0059 §Fix): it declines the
  // literal and brace-carrying survivors of this arm's legitimate traffic and
  // raises the text-level refusal at the field being lowered for what remains.
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
    const colon = topLevelColon(entry);
    if (colon < 0) {
      continue;
    }
    const fieldName = entry.slice(0, colon).trim();
    const fieldType = entry.slice(colon + 1).trim();
    if (fieldName.length === 0 || fieldType.length === 0) {
      continue;
    }
    properties[fieldName] = lowerFieldType(fieldType, lowerCtx);
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
  const lowered = toLoweredJsonValue(fragment);
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
 * Parse a literal-type atom (a quoted string, integer/number, boolean, or
 * `null`) to its JSON value, or `undefined` when the atom is not a literal.
 * Wrapped so a legitimately-`null` literal is distinguishable from "not a
 * literal".
 *
 * Exported, and living here rather than in `body-type-lowering.ts`: that
 * module imports from this one and not the reverse (bug 0039 §Fix), and
 * `lowerLiteralSublanguage` (below) — the one emission both
 * `lowerParamsFieldType` and `lowerTypeSource` (body-type-lowering.ts) call —
 * needs this recogniser on the side of that boundary either caller can reach
 * (bug 0056 §Fix).
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
 * Lower a type source's literal sublanguage — a quoted string (either quote
 * form), `true`, `false`, `null`, or a signed integer/decimal, alone or in a
 * `|`-separated union of them (`splitTopLevel`) — to schema-subset.md's
 * literal emission, or `undefined` when `source` is not (wholly) that
 * sublanguage: a union carrying any non-literal arm declines whole, matching
 * `parseLiteralArm`'s own per-arm decline (bug 0043 §Non-goals; bug 0056
 * §Non-goals — a mixed union's literal arm stays permissive at
 * `lowerTypeExpr`, everywhere).
 *
 * The one emission `lowerParamsFieldType` (below) and `lowerTypeSource`
 * (body-type-lowering.ts) both call, so the `params:` position agrees with
 * the other three type-annotation positions on a literal source's bytes by
 * construction (bug 0056 §Fix) rather than by two call sites kept in sync by
 * hand. More than one arm returns the union form only when EVERY arm is
 * accepted — one declined arm declines the whole union; exactly one arm
 * returns schema-subset.md:79's `const` when accepted, and declines
 * otherwise. The union form's KEY ORDER is CONTRACTUAL, not cosmetic: `type`
 * first when every value is a string (schema-subset.md:80), the bare `enum`
 * otherwise (`:81` scopes SUBS-1's own primitive-union rule away from
 * `LiteralType` arms) — `respondSchemaSlug`
 * (src/runtime/typed-query-validation.ts) and the `__inline_<slug>` mint both
 * hash `JSON.stringify` of this fragment, so the order is what collapses a
 * string-literal union declared at two positions onto one slug (bug 0055
 * §Fix; bug 0056 §Fix *Ordering*). The ternary is bug 0055's landed one,
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
 * constraint 1), returning its `const` / `enum` fragment on a match; a
 * decline falls through to intercepting a brace-rooted inline object type
 * (`{a: Triage, b: integer}`) before it can reach `lowerTypeExpr`'s
 * catch-all: `parseParams`'s per-field loop calls this instead of
 * `lowerTypeExpr` directly (bug 0035), so a name inside the object resolves
 * through the same `lowerCtx` — landing in `lowerCtx.unresolved` for the
 * caller's diagnostic loop, or in `lowerCtx.defs` as a hoisted `$ref`
 * target — exactly as every OTHER type position now does too (bug 0039
 * §Fix).
 *
 * The hoist itself is `hoistInlineObjectType`, shared with `lowerTypeSource`
 * (body-type-lowering.ts). Bug 0039 §Fix froze this function's bytes
 * byte-for-byte; bug 0056 §Fix is the authority that lifts that freeze for a
 * source that is wholly what `parseLiteralArm` recognises, at any depth.
 * Every other source keeps its frozen bytes: this function still recurses
 * into ITSELF for a nested brace-rooted field type, exactly as before, which
 * is what makes the lifted check apply at every depth for free.
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
  if (!(s.startsWith("{") && s.endsWith("}"))) {
    return lowerTypeExpr(s, lowerCtx);
  }
  return hoistInlineObjectType(s, lowerCtx, lowerParamsFieldType);
}

/**
 * Convert a lowered-schema JSON value (as `lowerParamsFieldType` builds it —
 * nested objects, arrays, strings, booleans) to the `LoweredJsonValue` the
 * canonical-hash recipe (`schemaSlug`) requires. Total over that domain: an
 * integer-valued number renders `"integer"`, any other number `"number"` — a
 * `params:` inline object field carrying an integer or decimal literal
 * (`p: '{m: 42}'`) reaches this arm through `lowerLiteralSublanguage`'s
 * `const` emission (bug 0056 §Fix), so the number-kind split is EXERCISED by
 * a reachable input, not defensive against a shape no caller produces. Object
 * entries are walked in insertion order; `canonicalForm` sorts them by
 * Unicode code point before hashing.
 */
function toLoweredJsonValue(value: unknown): LoweredJsonValue {
  if (typeof value === "string") {
    return { kind: "string", value };
  }
  if (typeof value === "boolean") {
    return { kind: "boolean", value };
  }
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { kind: "integer", value }
      : { kind: "number", value };
  }
  if (value === null) {
    return { kind: "null" };
  }
  if (Array.isArray(value)) {
    return { kind: "array", items: value.map(toLoweredJsonValue) };
  }
  const entries: LoweredObjectEntry[] = Object.entries(
    value as Record<string, unknown>,
  ).map(([key, entryValue]) => ({ key, value: toLoweredJsonValue(entryValue) }));
  return { kind: "object", entries };
}

/** Find the top-level `:` in a `field: Type` entry, respecting `<>`/`{}` nesting. */
export function topLevelColon(entry: string): number {
  let depth = 0;
  let quote: string | undefined;
  for (let i = 0; i < entry.length; i += 1) {
    const c = entry[i] ?? "";
    if (quote !== undefined) {
      if (c === quote) {
        quote = undefined;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
    } else if (c === "<" || c === "{" || c === "(") {
      depth += 1;
    } else if (c === ">" || c === "}" || c === ")") {
      depth -= 1;
    } else if (c === ":" && depth === 0) {
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
 *     splitting into arms at all.
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
  let depth = 0;
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
      depth += 1;
      current += c;
      continue;
    }
    if (c === ">" || (tracksBraces && c === "}")) {
      depth -= 1;
      current += c;
      continue;
    }
    if (depth === 0 && c === separator) {
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
