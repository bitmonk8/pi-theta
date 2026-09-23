// V6b — the `params:` type-expression lowering family.
//
// This module owns the lowering of a single `params:` field's type-expression
// RHS to its JSON-Schema fragment (`lowerParamsFieldType` and the family
// beneath it): union splitting per SUBS-1, generic applications, literal-type
// atoms and the literal sublanguage, inline-object hoisting to `__inline_<slug>`
// `$defs` entries, and the `LowerCtx` sinks the callers drain into diagnostics.
// The `params:` block parse itself lives in params.ts (which calls
// `lowerParamsFieldType` per field), and the render-side projection of a
// field's declared type lives in params-render.ts.
import { reservedKeywords } from "../lexer/lexer";
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
import { GENERIC_ARITY } from "./type-grammar";
import { defineRecordField } from "../runtime/value";
import {
  isBraceBalanced,
  isSingleEnclosingBraceGroup,
  isUnspellableTextRefusable,
  parseLiteralArm,
  skipQuotedRegion,
  splitTopLevel,
  topLevelColon,
} from "./type-text-split";
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
   * caller owns the array's lifetime and this module never reads it back: all
   * nine callers render every hit as `theta/parse/reserved-keyword-as-identifier`
   * (bug 0277 §Fix route (a) — no `Type` production derives an unapplied
   * `Result` / `array` / `Ok` / `Err`, so no capture withholds the class).
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
 *     spelling on a second sink: all nine callers render every hit as
 *     `theta/parse/reserved-keyword-as-identifier` (bug 0044 §Fix; bug 0277
 *     §Fix route (a) removed the five-caller withhold bug 0274 §Fix route
 *     (a) had scoped here, since no `Type` production derives an unapplied
 *     `Result` / `array` / `Ok` / `Err` for it to protect);
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

  const generic = lowerGenericApplication(s, lowerCtx);
  if (generic !== undefined) {
    return generic;
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
    // (code-registry-parse.md:21). Nine callers read this sink and all nine
    // render every entry (bug 0277 §Fix route (a)): no `Type` production
    // derives an unapplied `Result` / `array` / `Ok` / `Err`, so the class is
    // reported at every capture alike, exactly as it already was at the four
    // callers this sink's other five once withheld it from.
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

/** Lower a generic application, or decline without effects when s is not one. */
function lowerGenericApplication(
  s: string,
  lowerCtx: LowerCtx,
): Record<string, unknown> | undefined {
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
    if (RESERVED_KEYWORDS.has(ctor) && !(ctor in GENERIC_ARITY)) {
      // Bug 0281 §Fix route (a): a reserved spelling that is not one of the
      // two constructor keywords is never an `Ident`, so it is no `NamedType`
      // and heads no `GenericType` either (grammar.md:98, :99–:100) — writing
      // an argument list after it does not make it one. The head itself is
      // the refusal, routed onto the sink its own BARE spelling already draws
      // (bugs 0262 and 0277's one-reading-one-spelling conclusion), so the
      // applied and unapplied spellings of one reserved word converge on one
      // diagnostic instead of the applied one lowering silently. The two
      // constructor keywords are exempted by the closed-set test rather than
      // by name, and heads inside that set never reach here.
      lowerCtx.reservedKeywords?.push(ctor);
      return {};
    }
    if (!(ctor in GENERIC_ARITY) && IDENTIFIER.test(ctor)) {
      // Bug 0282 §Fix route (a), closed-set width: `GenericType` is a closed
      // set of two productions, each spelling its own head (grammar.md:99–:100),
      // and "No other identifier is parameterisable" (grammar.md:107) — an
      // `Ident`-shaped head outside `GENERIC_ARITY` is not a candidate
      // constructor name at any arity, applied or not. `NamedType ::= Ident`
      // (grammar.md:98) is the only production such a head could otherwise
      // read as, so the refusal converges on the row the BARE spelling of the
      // same identifier already draws (`theta/parse/unresolved-named-type`,
      // code-registry-parse.md), and the
      // `Message` names the head rather than the argument list beside it —
      // which is why the identifier-shape test gates the push rather than a
      // membership test alone: this row's *Message* fills `<name>` with a name,
      // not with an application. The early `return` gives the construct its one
      // refusal (`unresolved-named-type`'s own registered cover rule: a
      // refusal already drawn over the construct covers whichever other code
      // it might otherwise carry) instead of falling through to the permissive
      // catch-all below, which would additionally walk the arguments and let a
      // discarded head coexist with a nested refusal of its own. This gate
      // sits AFTER bug 0281's reserved-head gate (above) and AFTER the `array`
      // arity-1 branch, and BEFORE the permissive catch-all: ordering it beside
      // — not merging it into — 0281's narrower gate keeps a reserved spelling
      // (`Ok<integer>`, `Err<string>`) drawing `reserved-keyword-as-identifier`
      // and a closed-set head (`Result<integer>`) drawing
      // `generic-arity-mismatch` / staying clean, both unmoved by this row.
      lowerCtx.unresolved.push(ctor);
      return {};
    }
    if (!(ctor in GENERIC_ARITY) && !RESERVED_KEYWORDS.has(ctor) && !IDENTIFIER.test(ctor)) {
      // Bug 0284 §Fix: a head that fails `IDENTIFIER` is no `Ident`, so it is
      // no `NamedType` either (grammar.md's `NamedType` production) and heads
      // no `GenericType` — the closed set just above tests `Ident`-shape
      // alone (grammar.md's `GenericType` alternatives, closed by its own
      // "no other identifier is parameterisable" clause). It derives from no
      // `Type` alternative, applied or bare, so it belongs to the not-
      // expression family the bare spelling already draws
      // (`frontmatter-fields-a.md`'s `params:` prose, and `grammar.md`'s
      // identical rule for the body captures), not to bug 0282's gate one
      // line above, whose row names an identifier. Pushing the HEAD TEXT
      // (`ctor`) rather than the whole application (`s`) keeps the push
      // brace-free by construction — `ctor` is the slice preceding this arm's
      // own `<` — so the shared decline `isUnspellableTextRefusable` never
      // exempts it on account of a brace carried by the ARGUMENTS
      // (`p: 'a b<{x: integer}>'` refuses); pushing the whole application
      // would let that same brace exempt it and leave the spelling silent.
      // This gate sits AFTER bug 0281's and bug 0282's (both above) and
      // BEFORE the permissive catch-all (below), so a reserved or closed-set
      // or identifier-shaped head is unmoved, and the early `return` gives the
      // construct its one refusal instead of falling through to also walk the
      // arguments.
      // The `!RESERVED_KEYWORDS.has(ctor)` conjunct transcribes §Fix's three-
      // part condition verbatim and is deliberately redundant: every reserved
      // spelling is `Ident`-shaped, so `!IDENTIFIER.test(ctor)` already
      // excludes them and the conjunct can never decide this branch.
      // The push-and-return is conditional on the sink being PRESENT because
      // the refusal this gate exists to draw IS the not-expression one: a
      // recursion carrying no such sink (bug 0204's `withoutUnspellableSink`
      // path for a segment the angle-only split manufactured) cannot draw it,
      // and returning there would discard the argument walk below along with
      // the `unresolved` refusals that sink-less path deliberately KEEPS.
      // Falling through instead leaves this gate purely additive — it adds a
      // refusal at every capture that has the sink, and removes none.
      if (lowerCtx.unspellable !== undefined) {
        lowerCtx.unspellable.push(ctor);
        return {};
      }
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
  return undefined;
}

/**
 * Classify one ALREADY-LOWERED union arm for `lowerUnion` (SUBS-1,
 * schema-subset.md §Lowering Algorithm step 3): a fragment whose ONLY key is a
 * `type` naming a primitive is the one shape admitted into the multi-type-array
 * form, and every other fragment is `non-primitive` and forces `anyOf`.
 *
 * Both type positions reach this classification through the one shared arm
 * dispatch, `lowerBraceGroupUnionArms` (below; bug 0097 §Fix): `lowerTypeSource`
 * (body-type-lowering.ts) and `lowerParamsFieldType` each hand it a union whose
 * inline-object arms hoist where the others go to `lowerTypeExpr` (bug 0039
 * §Fix part B), so every arm reaches the SAME verdict `lowerTypeExpr`'s own
 * union branch reaches for the same fragment. Two classifications that
 * disagreed would lower one source to `{"type": [...]}` at one type position
 * and `{"anyOf": [...]}` at another, against type-system.md's
 * one-grammar-everywhere rule. `PRIMITIVE_TYPES` is the single set both read.
 */
function classifyLoweredUnionArm(lowered: Record<string, unknown>): LoweredUnionArm {
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
export interface InlineObjectEntry {
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
export function classifyInlineObjectEntry(entry: string): InlineObjectEntry | undefined {
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
