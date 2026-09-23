// The per-query-node `@<T>` annotation check (`checkQueryAnnotation`) and its
// Result-peel satellites, called from the structural walk's `query` arm
// (structural-checks.ts `walkExpr`): the response-part position-rule walk, the
// bug 0203 not-a-type-expression refusal, and the response / error-model
// name-resolution loops (bugs 0028 / 0093 / 0262 / 0273 / 0277 / 0278).

import type { Diagnostic, SourceRange } from "../diagnostics/diagnostic";
import { parseTypeExpression } from "./type-grammar";
import {
  annotationSourceIsNotTypeExpression,
  reservedKeywordAsIdentifierDiagnostic,
  unresolvedNamedTypeDiagnostic,
  withBuiltinErrorModelNames,
} from "./annotation-validation";
import { collectUnresolvedNamedTypes } from "./body-type-lowering";
import { splitTopLevel } from "./params";
import type { QueryExpr } from "./theta-ast";
import type { StructuralRefs } from "./structural-checks";

/**
 * The registered `theta/parse/query-annotation-type-not-expression` refusal
 * (bug 0203 §Fix): an AUTHOR-WRITTEN `@<T>` / bare `@Ident` query ascription
 * whose captured source — `annotationSourceIsNotTypeExpression`
 * (type-layer-checks.ts) — derives from none of `Type`'s six alternatives
 * (grammar.md §Type grammar).
 *
 * A ROW OF ITS OWN rather than a fourth position on
 * `annotationTypeNotExpressionDiagnostic` (annotation-validation.ts), for three reasons.
 * (1) That row's Trigger states its unit as the whole annotation "naming the
 * annotation's own binder"; THIS position has none — a bare `@<T>`…`` query
 * STATEMENT declares nothing at all, so there is no identifier for `<name>` to
 * render. (2) That row's withhold contract (the `?`-scope check, the
 * Result-certainty channel, the callee parameter table, the binding record,
 * the `fn` parameter scope, the `subagent fn` FN-6 return boundary) and its
 * `integer|`-at-the-return-slot capture asymmetry are meaningless, or FALSE,
 * at an ascription: this capture is delimited by its own closing `>`, so
 * `@<Ghost|>` captures `Ghost|` whole and absorbs nothing beyond it.
 * (3) This capture already has a position-specific, placeholder-free sibling
 * at the same site — `theta/parse/empty-query-annotation` (bug 0014), raised
 * a few lines above the walk that reaches this builder — and this row matches
 * its shape rather than the annotation row's `<name>`-bearing one.
 */
function queryAnnotationTypeNotExpressionDiagnostic(
  range: SourceRange,
  file: string,
): Diagnostic {
  return {
    severity: "error",
    code: "theta/parse/query-annotation-type-not-expression",
    file,
    range,
    message:
      "`@<...>` query annotation declares a type that is not a theta type expression",
  };
}

/** A `Result<Ok, Err>` application, captured as its two type arguments. */
const RESULT_APPLICATION = /^Result\s*<([\s\S]*)>$/;

/**
 * The part of a `QueryExpr.schema` that is the RESPONSE schema — the whole
 * annotation, except that a `Result<T, E>` application yields `T`.
 *
 * WHY: `QueryExpr.schema` is not always something the author wrote at the
 * `@<T>` position. `parseLet` propagates a `let` annotation verbatim onto a
 * bare-query initialiser, and a query's declared value type is
 * `Result<T, QueryError>` (QRY-1) — so `let r: Result<string, QueryError> =
 * @`…`` arrives here as the full `Result<…>` text. Its `E` side is a builtin
 * observed only by theta code and never lowered to a JSON Schema fragment
 * (grammar.md §"Generic-application constructors"). `Result` is admitted
 * there by the grammar and is never itself resolved as a `NamedType` atom
 * (`lowerTypeExpr`'s generic-application arm reads a `ctor` name
 * structurally, never through the identifier-resolution arm), and bug 0262
 * §Fix clause (iv)(2) withholds the `let` capture's own resolution of this
 * SAME propagated text, leaving this arm its sole emitter. What this peel
 * protects is the BUILTIN `QueryError`, by the same builtin error-model
 * admission the `let`, `fn` parameter, `fn` return, `invoke<Type>` and
 * `Result<T, E>` error-side captures carry (`withBuiltinErrorModelNames`) —
 * not the argument slot: the
 * `"query"` arm resolves names in `args[1]` beside the response part it reads
 * from this function (bug 0273 §Fix), so an undeclared head written there is
 * still refused. The `T` side — the shape the response is validated against
 * — is still checked, so a typo in `let r: Result<Tirage, QueryError> =
 * @`…`` is still refused.
 *
 * `undefined` means "this annotation has no response part to check": a `Result`
 * application whose argument count is not 2 draws
 * `theta/parse/generic-arity-mismatch` from the `"query"` arm's own `else`
 * branch (`walkExpr`, structural-checks.ts — bug 0278 §Fix), which re-parses the WHOLE
 * annotation and keeps only that one diagnostic, rather than from this peel;
 * which argument would have been `T` is not determinable. Descending the
 * malformed text as `T` instead would name `QueryError` — the builtin this
 * peel exists to protect — plus every stray argument, as unresolved beside
 * the real arity error.
 *
 * The argument split tracks BRACE depth as well as angle depth
 * (`"angle-and-brace"`): `ObjectType` is a `Type` in every position
 * (grammar.md §"Inline object types"), so an ok side such as
 * `{a: string, b: integer}` carries a top-level-looking comma that is not an
 * argument boundary. Splitting on angle depth alone made the peel disagree
 * with the parser that computes the arity diagnostic — it saw three arguments
 * where the grammar sees two, took this function's non-arity-2 path, and left
 * the whole `Result<…>` text to be descended.
 *
 * This split tracks NEITHER `[…]` bracket depth, and bug 0204 §Fix (b)(3)
 * keeps it that way on stated grounds (`./params`'s `lowerTypeExpr` stays
 * angle-only for the same reason) — so for a bracket-group argument
 * (`Result<enum["a", "b"], string>`) this peel still counts the group's own
 * interior comma as an argument boundary: three segments, where `TypeParser`
 * (fixed for that construct, bug 0236) now counts two. `queryResponseAnnotation`
 * returns `undefined` on any non-2 count, so that spelling takes the same
 * non-arity-2 path it did before — `Result`'s arity goes unreported at the
 * query annotation for it, same as any other non-2 count this function
 * declines. The peel is not made to re-agree for this construct; the earlier
 * bracket-blind agreement claim above this function is corrected to name the
 * residual instead.
 */
function queryResponseAnnotation(schema: string): string | undefined {
  const application = RESULT_APPLICATION.exec(schema.trim());
  if (application === null) {
    return schema;
  }
  const args = splitTopLevel(application[1] ?? "", ",", "angle-and-brace");
  return args.length === 2 ? args[0] : undefined;
}

/**
 * The `E` side of the same `Result<T, E>` application `queryResponseAnnotation`
 * peels `T` from — its sibling, not its replacement (bug 0273 §Fix).
 * `queryResponseAnnotation`'s return value and signature are untouched by this
 * function's existence: the response-schema reads, the position-rule walk and
 * the `annotationSourceIsNotTypeExpression` refusal keep consuming `T` alone,
 * and this is the ONLY thing that also looks at `args[1]`.
 *
 * `undefined` means "this annotation has no `E` argument to resolve": either
 * `schema` is not a `Result` application at all (a bare response schema with
 * no error side ever written), or it is one whose argument count is not 2, in
 * which case the `"query"` arm's `else` branch reports
 * `theta/parse/generic-arity-mismatch` from the whole annotation (bug 0278
 * §Fix; see `queryResponseAnnotation`'s doc block, above) and which argument
 * would have been `E` remains, like `T`, not determinable — same as
 * `queryResponseAnnotation`'s own non-arity-2 declination.
 */
function queryErrorModelAnnotation(schema: string): string | undefined {
  const application = RESULT_APPLICATION.exec(schema.trim());
  if (application === null) {
    return undefined;
  }
  const args = splitTopLevel(application[1] ?? "", ",", "angle-and-brace");
  return args.length === 2 ? args[1] : undefined;
}

/** Check a query annotation's response and error-model parts in diagnostic order. */
export function checkQueryAnnotation(
  e: QueryExpr,
  refs: StructuralRefs,
  file: string,
  out: Diagnostic[],
): void {
  // Registry row position 2 — the `@<T>` query annotation (bug 0028
  // §Fix). This one site also covers the DIRECT-LET (`let r: T = @`…``)
  // and the QRY-2 INFERRED forms: `parseLet`'s direct propagation and
  // `resolveQuerySchemas` both write the resolved annotation into
  // `QueryExpr.schema` BEFORE this structural walk runs, so every route
  // to a schema-bearing query converges on this one check. The empty
  // annotation (`e.schema === ""`) is skipped — bug 0014's
  // `theta/parse/empty-query-annotation` already owns that interior, and
  // a second diagnostic here would double up. Because a propagated `let`
  // annotation may be the query's `Result<T, QueryError>` value type
  // rather than a response schema, only the response part is checked
  // (`queryResponseAnnotation`).
  if (e.schema !== null && e.schema.trim().length > 0) {
    const responseAnnotation = queryResponseAnnotation(e.schema);
    if (responseAnnotation !== undefined) {
      // `@<Schema>` is a type ASCRIPTION (query-forms.md:44, :57), and
      // `TypePosition`'s closed classification (type-grammar.ts) puts an
      // ascription in `"value"`, not `"schema-feeding"`: `void` is
      // rejected there and `Result` remains admitted (grammar.md §Type
      // grammar), and `result-in-schema-position` (code-registry-parse.md
      // :60) does not name this position — `"schema-feeding"` here would
      // widen that row's trigger, which bug 0044 §Fix Blast-radius
      // forbids.
      // Bug 0093 §Fix route 2: a `let x: T = @`…`` (or its `?`-wrapped
      // form) propagation puts the SAME annotation text here that
      // `walkStatement`'s `let` arm already walked at the statement's own
      // range (`parseTypeExpression(s.annotation, "value", …)`, which
      // runs and pushes FIRST since the statement's diagnostics precede
      // its initialiser walk). Re-walking it here would double every rule
      // this shared type-grammar pass owns at position `"value"` —
      // `empty-schema-body`, `generic-arity-mismatch`,
      // `void-in-non-return-position` today, and any rule later added to
      // `walkType` or `"inline-object-shape"` — for one written
      // occurrence. Withholding only this call, not the arm, keeps the
      // surviving line at the statement's (wider) range and leaves
      // `TypePosition` at `"value"` unchanged; it does not reach the
      // `annotationSourceIsNotTypeExpression` refusal below (that refusal
      // already gates on `ascriptionWritten === true`, which propagated
      // text never sets) or the name-resolution loops after it, which
      // still run for the propagated text (this arm is `Ghost`'s SOLE
      // emitter — bug 0093 §Reproduction).
      const positionRuleDiagnostics =
        e.schemaFromLetAnnotation === true
          ? []
          : parseTypeExpression(responseAnnotation, "value", {
              file,
              range: e.range,
            });
      out.push(...positionRuleDiagnostics);
      // Bug 0203 §Fix (b)(5): an annotation whose own position-rule walk
      // just drew an error-severity diagnostic (`void`, a generic-arity
      // mismatch, an empty inline object, a duplicate inline field name)
      // keeps that diagnostic ALONE — this refusal judges the SAME text a
      // second time and would double up on one statement if it fired
      // beside a verdict that text already earned. §Fix (b)(6): fire only
      // for an ascription the AUTHOR wrote (`ascriptionWritten === true`)
      // — a PROPAGATED `let` annotation's junk is the `let` binding's own
      // text and is refused there instead, by
      // `theta/parse/annotation-type-not-expression` (bug 0124).
      if (
        e.ascriptionWritten === true &&
        !positionRuleDiagnostics.some((d) => d.severity === "error") &&
        annotationSourceIsNotTypeExpression(responseAnnotation)
      ) {
        out.push(queryAnnotationTypeNotExpressionDiagnostic(e.range, file));
        // The refusal is the annotation's WHOLE disposition (bug 0203
        // §Fix): text that derives from no `Type` is neither a name nor a
        // reserved keyword, so the loops below — which resolve `Ident`s
        // this refused text is not — do not also run.
        return;
      }
      const annotationReservedKeywords: string[] = [];
      const annotationUnresolved = collectUnresolvedNamedTypes(
        responseAnnotation,
        refs.typeNames,
        annotationReservedKeywords,
      );
      for (const keyword of annotationReservedKeywords) {
        out.push(reservedKeywordAsIdentifierDiagnostic(keyword, e.range, file));
      }
      for (const name of annotationUnresolved) {
        out.push(unresolvedNamedTypeDiagnostic(name, e.range, file));
      }
      // Bug 0273 §Fix: the `E` side of the same `Result<T, E>` application,
      // resolved beside the response part above rather than instead of it.
      // This runs for the propagated route too (clause (iv)(2)'s withhold
      // above gates only `parseTypeExpression`, not this loop) because the
      // query arm is the propagated text's sole emitter — withholding this
      // as well would leave the `E` head unrefused everywhere. Bug 0277
      // §Fix route (a): the sink is rendered directly, exactly as the
      // response part above and the four already-unfiltered captures do —
      // no `Type` production derives an unapplied `Result` / `array` /
      // `Ok` / `Err`, so nothing at this capture withholds the class.
      const errorModelAnnotation = queryErrorModelAnnotation(e.schema);
      if (errorModelAnnotation !== undefined) {
        const errorModelReservedKeywords: string[] = [];
        const errorModelUnresolved = collectUnresolvedNamedTypes(
          errorModelAnnotation,
          withBuiltinErrorModelNames(refs.typeNames),
          errorModelReservedKeywords,
        );
        // The two argument slots are two `collectUnresolvedNamedTypes`
        // calls, and that function dedupes only within a single call, so a
        // keyword spelled in BOTH slots of one annotation would otherwise
        // draw two byte-identical lines at one range. Filtered against the
        // response part's own hits above (`annotationReservedKeywords`),
        // mirroring the name loop's own per-annotation seen-set below.
        const reportedKeywordForThisAnnotation = new Set(annotationReservedKeywords);
        for (const keyword of errorModelReservedKeywords) {
          if (reportedKeywordForThisAnnotation.has(keyword)) {
            continue;
          }
          out.push(reservedKeywordAsIdentifierDiagnostic(keyword, e.range, file));
        }
        // One written name draws one diagnostic. The two argument slots
        // are two `collectUnresolvedNamedTypes` calls and that function
        // dedupes only within a single call, so a head spelled in BOTH
        // slots of one annotation would otherwise draw two byte-identical
        // lines at one range where every other capture of the same text
        // draws one. The unit is the one written annotation: names already
        // reported for a DIFFERENT annotation or statement are not
        // suppressed here.
        const reportedForThisAnnotation = new Set(annotationUnresolved);
        for (const name of errorModelUnresolved) {
          if (reportedForThisAnnotation.has(name)) {
            continue;
          }
          out.push(unresolvedNamedTypeDiagnostic(name, e.range, file));
        }
      }
    } else if (e.schemaFromLetAnnotation !== true) {
      // Bug 0278 §Fix: `queryResponseAnnotation` declined this text because
      // it is a `Result` application whose argument count is not 2 — the
      // ONLY reason it returns `undefined` (its own doc block, above). The
      // arity mint lives in `walkType`'s `"generic"` arm
      // (`type-grammar.ts`), reachable only through `parseTypeExpression`,
      // which this capture otherwise never calls for a non-arity-2
      // application. Feed it the WHOLE annotation (not the peeled,
      // undefined response part) so that mint fires for an author-written
      // `@<T>` exactly as it already does for the four full-walk
      // positions and for `array<Ghost, string>` at this same position.
      // Withheld under the SAME `e.schemaFromLetAnnotation === true` guard
      // the response-part call above carries (bug 0093 §Fix route 2): a
      // propagated `let x: Result<T> = @`…`` annotation is walked by
      // `walkStatement`'s `let` arm already, at the statement's own range,
      // so calling this here too would double the line (§Fix constraint 2).
      const wholeAnnotationDiagnostics = parseTypeExpression(e.schema, "value", {
        file,
        range: e.range,
      });
      // Reduced to the arity verdict alone, at this call site rather than
      // in `walkType`: the arm that mints `generic-arity-mismatch` also
      // unconditionally descends the application's own arguments and
      // applies `void-in-non-return-position` / `empty-schema-body` there
      // (e.g. `Result<void>`, `Result<{}>`) — diagnostics this bug's own
      // §Fix constraint 1 forbids alongside the arity line, because the
      // peel could not say which argument was meant to be `T` and
      // descending it names the wrong fault. `.find` also keeps a nested
      // wrong-arity application (a `Result` argument inside this one) from
      // adding a second arity line beside the outer one: only the
      // FIRST — outermost — arity diagnostic in source order survives.
      const arityDiagnostic = wholeAnnotationDiagnostics.find(
        (d) => d.code === "theta/parse/generic-arity-mismatch",
      );
      if (arityDiagnostic !== undefined) {
        out.push(arityDiagnostic);
      }
    }
  }
}
