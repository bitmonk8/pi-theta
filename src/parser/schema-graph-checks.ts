// Schema declaration-graph checks (bug 0033 §Fix): object-schema field-type
// checks, alias/union right-hand-side resolution, `by`-clause and
// discriminated-union validation, and whole-graph alias-cycle detection.

import type { Diagnostic, SourceRange } from "../diagnostics/diagnostic";
import {
  checkObjectSchema,
  checkInlineEnumForm,
  checkByClause,
  detectTypeAliasCycles,
  type SchemaDeclSite,
  type SchemaGraphNode,
} from "./schema-declarations";
import { checkDiscriminatedUnion, type DiscriminatorCandidateField, type UnionVariantSchema } from "./discriminated-union-checks";
import { parseTypeExpression } from "./type-grammar";
import { reservedKeywordAsIdentifierDiagnostic, unresolvedNamedTypeDiagnostic } from "./annotation-validation";
import { collectUnresolvedNamedTypes, isSingleEnclosingBraceGroup } from "./body-type-lowering";
import { isUnspellableTextRefusable, splitTopLevel } from "./params";
import type { SchemaFieldSource, SchemaDecl, Stmt } from "./theta-ast";
import { schemaTypeNotExpressionDiagnostic } from "./theta-document";
import { pushDiag, type StructuralRefs } from "./structural-checks";

/**
 * Resolve the names one schema-declaration `Type` capture references and
 * refuse its unspellable fragments, pushing diagnostics into `out` — the
 * shared walk behind both `Type` positions a `schema` declaration carries
 * (an object-form field type and an alias/union right-hand side). Runs
 * `collectUnresolvedNamedTypes` (body-type-lowering.ts) over `source`
 * against `typeNames`, then pushes one reserved-keyword diagnostic per
 * keyword hit and one unresolved-named-type diagnostic per unresolved name,
 * all ranged at the declaration. Text no `Type` production spells reaches
 * `lowerTypeExpr`'s catch-all as `unspellable`; refuse what the shared
 * decline (`isUnspellableTextRefusable`, params.ts) does not admit, one
 * `theta/parse/schema-type-not-expression` per offending fragment, no dedup
 * — under bug 0061 §Fix guard 1: a capture that already drew an
 * error-severity diagnostic in its own walk (a position rule, a reserved
 * keyword, or an unresolved name — everything in `out` at or past
 * `diagStart`) keeps that diagnostic alone, mirroring bug 0059's identical
 * per-field guard in `parseParams` (params.ts). `parseTimeRefused` is the
 * caller's bug 0061 guard-2 flag: true suppresses the unspellable refusal
 * entirely.
 */
function checkSchemaTypeCapture(
  source: string,
  typeNames: ReadonlySet<string>,
  s: SchemaDecl,
  file: string,
  diagStart: number,
  out: Diagnostic[],
  parseTimeRefused = false,
): void {
  const reservedKeywords: string[] = [];
  const unspellable: string[] = [];
  const unresolved = collectUnresolvedNamedTypes(
    source,
    typeNames,
    reservedKeywords,
    unspellable,
  );
  for (const keyword of reservedKeywords) {
    out.push(reservedKeywordAsIdentifierDiagnostic(keyword, s.range, file));
  }
  for (const name of unresolved) {
    out.push(unresolvedNamedTypeDiagnostic(name, s.range, file));
  }
  if (!parseTimeRefused && !out.slice(diagStart).some((d) => d.severity === "error")) {
    unspellable
      .filter(isUnspellableTextRefusable)
      .forEach(() => out.push(schemaTypeNotExpressionDiagnostic(s.name, s.range, file)));
  }
}

/** Check object-schema shape and each field's type with a per-field diagnostic window. */
function checkSchemaFieldTypes(
  s: SchemaDecl,
  refs: StructuralRefs,
  file: string,
  out: Diagnostic[],
): void {
  if (s.fields !== undefined) {
    out.push(
      ...checkObjectSchema(
        {
          name: s.name,
          fields: s.fields.map((f) => ({
            thetaName: f.name,
            ...(f.wireName !== undefined ? { wireName: f.wireName } : {}),
          })),
        },
        { file, range: s.range },
      ),
    );
    for (const f of s.fields) {
      // `fieldDiagStart` bounds the bug 0061 §Fix guard-1 last-resort
      // check below to diagnostics THIS field's own walk raises,
      // mirroring bug 0059's identical per-field guard in `parseParams`
      // (params.ts).
      const fieldDiagStart = out.length;
      // An inline `enum[...]` in a schema field type is `theta/parse/inline-enum`
      // — `enum` is top-level only (schemas.md §Enum declarations).
      pushDiag(
        out,
        checkInlineEnumForm(f.typeSource, { file, range: s.range }),
      );
      out.push(
        ...parseTypeExpression(f.typeSource, "schema-feeding", {
          file,
          range: s.range,
        }),
      );
      // Registry row position 3 — a schema body field type (bug 0028
      // §Fix). `SchemaFieldSource` carries no range of its own, so the
      // diagnostic is ranged at the DECLARATION; this fires whether or
      // not `s.name` is ever referenced by a query annotation, matching
      // the registry row's "resolves to no declaration usable at the
      // position it is written".
      // bug 0061 §Fix, guard 1 only (`parseTimeRefused` stays false): the
      // object body has no parse-time refusal to mirror the alias position's
      // guard 2 (`emitMalformedAliasRhs`) — a field's type is one verbatim
      // capture with no separate malformed-right-hand-side emission.
      checkSchemaTypeCapture(f.typeSource, refs.typeNames, s, file, fieldDiagStart, out);
    }
  }
}

/** Check alias arm types and names, retaining the by-form and diagnostic window for the caller. */
function checkAliasRhs(
  s: SchemaDecl,
  arms: readonly string[],
  objectFields: ReadonlyMap<string, readonly SchemaFieldSource[]>,
  typeNames: ReadonlySet<string>,
  site: SchemaDeclSite,
  out: Diagnostic[],
): { byForm: "union" | "object"; declDiagStart: number } {
  const { file } = site;
  // Per-arm type-source checks. `AliasRhs ::= Type ("|" Type)*` (grammar.md
  // §"schema X by <field>") makes every arm a `Type` position, and a `Type`
  // reached from a `schema` declaration is schema-feeding (schema-subset.md
  // §Lowering Algorithm), so an arm answers to exactly what the object
  // form's field-type position answers to: the inline-`enum[...]` rejection
  // and the position-sensitive type-grammar checks (`void`, generic arity,
  // `Result`). Same order as that pass (`walkStmt`'s `schema` arm), so a
  // multi-code arm renders in the same sequence a field of the same source
  // does. The unit is the ARM rather than the whole right-hand side because
  // the arm is the `Type`; `checkInlineEnumForm` anchors its match at the
  // start of what it is given, so a second-position `enum[...]` arm is
  // rejected here where the joined source would hide it.
  //
  // `declDiagStart` bounds the bug 0061 §Fix guard-1 last-resort check below
  // to diagnostics THIS declaration's own arm walk raises, mirroring bug
  // 0059's identical per-field guard in `parseParams` (params.ts).
  const declDiagStart = out.length;
  for (const arm of arms) {
    pushDiag(out, checkInlineEnumForm(arm, site));
    out.push(...parseTypeExpression(arm, "schema-feeding", site));
  }
  // A `by` clause needs a discriminated union under it: at least two arms
  // (`UnionRhs ::= Type ("|" Type)+`, grammar.md §"schema X by <field>") AND
  // every arm an object schema (bug 0046, settled route — schemas.md
  // §Discriminated unions defines the concept over unions "whose variants are
  // all object schemas"). `schema X by f = Cat` declares one variant, which
  // has no discriminator to select on; `schema X by f = string | integer`
  // declares two variants with no fields to select on — both are the same
  // illegality the object form carries ("object schemas have one variant by
  // definition and the discriminator concept does not apply",
  // schemas.md §Discriminated unions), so all three take the same code
  // through the same construction point, `checkByClause`'s non-`"union"` arm,
  // rather than a second site rendering the same registered Message. An
  // object-schema arm is an inline `ObjectType` (its text opens with `{`), or
  // a bare identifier resolving to a declared OBJECT-form schema — an alias
  // declaration does not qualify, so it takes no hop.
  const byForm =
    arms.length >= 2 && arms.every((arm) => isObjectSchemaArm(arm, objectFields))
      ? "union"
      : "object";
  // Alias RHS name resolution (bug 0033 §Fix): the alias right-hand side is
  // a further `NamedType`-resolution position under
  // `theta/parse/unresolved-named-type`'s registry row. Reuses the same
  // whole-file resolution walk the object-form field-type position already
  // drives (`collectUnresolvedNamedTypes`, body-type-lowering.ts) over the
  // arms rejoined with the same separator `lowerTypeSource` re-splits on.
  // bug 0061 §Fix, guard 2 (`parseTimeRefused`): `emitMalformedAliasRhs`
  // already refused this right-hand side at PARSE time, into a diagnostic
  // array this checker pass cannot see — read off the node flag
  // `finishAliasSchema` recorded (`s.aliasRhsRefused`), so the refusal never
  // cascades onto a right-hand side another row already named.
  checkSchemaTypeCapture(
    arms.join(" | "),
    typeNames,
    s,
    file,
    declDiagStart,
    out,
    s.aliasRhsRefused === true,
  );
  return { byForm, declDiagStart };
}

/**
 * The whole-file schema-declaration graph checks beside `checkObjectSchema` /
 * `checkEnumDeclaration` above (bug 0033 §Fix, "Checker wiring"): resolve each
 * alias/union right-hand side's names, run `checkByClause` per `by`-carrying
 * decl, run `checkDiscriminatedUnion` per union decl whose arms ALL resolve to
 * declared object schemas, and run `detectTypeAliasCycles` ONCE over the
 * whole top-level declaration graph.
 */
function checkSchemaDeclarationGraph(
  statements: readonly Stmt[],
  typeNames: ReadonlySet<string>,
  file: string,
): Diagnostic[] {
  const out: Diagnostic[] = [];
  // The object-form field lists, by name — the resolved-declaration input
  // `checkDiscriminatedUnion`'s variants are built from. Kept local (rather
  // than reusing `StructuralRefs.schemas`, which carries field NAMES only) so
  // the full `SchemaFieldSource` — typeSource AND wireName — survives to
  // `discriminatorCandidateFields`.
  const objectFields = new Map<string, readonly SchemaFieldSource[]>();
  const graphNodes: SchemaGraphNode[] = [];
  // Per-declaration ranges, so each cycle's diagnostic lands on a declaration
  // that is IN that cycle rather than on the graph-wide anchor below.
  const nodeSites = new Map<string, SourceRange>();
  let firstAliasStmt: SchemaDecl | undefined;
  for (const s of statements) {
    if (s.kind !== "schema") {
      continue;
    }
    if (s.fields !== undefined) {
      objectFields.set(s.name, s.fields);
      graphNodes.push({
        name: s.name,
        kind: "object",
        references: identifierShapedReferences(s.fields.map((f) => f.typeSource)),
      });
      nodeSites.set(s.name, s.range);
    } else if (s.arms !== undefined) {
      graphNodes.push({ name: s.name, kind: "alias", references: identifierShapedReferences(s.arms) });
      nodeSites.set(s.name, s.range);
      if (firstAliasStmt === undefined) {
        firstAliasStmt = s;
      }
    }
  }

  for (const s of statements) {
    if (s.kind !== "schema") {
      continue;
    }
    const site = { file, range: s.range };
    if (s.fields !== undefined) {
      // The object form's by-on-object-schema illegality (grammar.md §"schema
      // X by <field>"): `finishObjectSchema` retains the clause specifically
      // so it reaches this check rather than being discarded.
      if (s.by !== undefined) {
        pushDiag(out, checkByClause({ name: s.name, form: "object", field: s.by }, site));
      }
      continue;
    }
    if (s.arms === undefined) {
      continue;
    }
    const { byForm, declDiagStart } = checkAliasRhs(s, s.arms, objectFields, typeNames, site, out);
    if (s.by !== undefined) {
      // Withheld when the arm walk above already pushed an error-severity
      // diagnostic (an unresolved name, a reserved keyword, unspellable text):
      // that fault is the more specific one, so `schema X by f = Ghost | Dog`
      // keeps `theta/parse/unresolved-named-type` alone rather than drawing a
      // second diagnostic for the same written mistake (bug 0046, settled
      // route). `declDiagStart` bounds the check to THIS declaration's own
      // arm walk, mirroring the identical guard the alias-unspellable pass
      // above uses for the same reason.
      const armWalkHadError = out.slice(declDiagStart).some((d) => d.severity === "error");
      if (!armWalkHadError) {
        pushDiag(out, checkByClause({ name: s.name, form: byForm, field: s.by }, site));
      }
    }
    const variants = buildUnionVariantSchemas(s.arms, objectFields);
    if (variants !== undefined) {
      out.push(
        ...checkDiscriminatedUnion(
          { name: s.name, ...(s.by !== undefined ? { by: s.by } : {}), variants },
          site,
        ),
      );
    }
  }

  if (firstAliasStmt !== undefined) {
    // Detection runs once over the whole graph (dedup is keyed by cycle
    // signature inside `detectTypeAliasCycles`, so a per-decl call would
    // either miss cross-links or re-run the same DFS redundantly). Each cycle
    // is anchored per-cycle through `nodeSites`: without it every cycle in the
    // file reports at the first alias/union declaration, which is routinely a
    // declaration that participates in no cycle at all. The whole-graph site
    // stays as the fallback for a cycle node carrying no range.
    out.push(
      ...detectTypeAliasCycles(
        graphNodes,
        { file, range: firstAliasStmt.range },
        nodeSites,
      ),
    );
  }
  return out;
}

/**
 * The identifier-shaped Type sources among `typeSources`, deduped — the
 * `SchemaGraphNode.references` input `detectTypeAliasCycles` needs ("the
 * named schemas the node's right-hand side refers to"). Splitting each source
 * on the top-level `|` first surfaces a union arm's named reference
 * (schemas.md §Recursion — `spouse: Person | null` is self-recursion via
 * union); a generic (`array<T>`), inline object, or literal arm is not itself
 * identifier-shaped and contributes no reference here. A primitive name
 * (`string`, …) matches the same bare-identifier shape as a `NamedType` and is
 * not filtered out here — harmlessly: `detectTypeAliasCycles`' own DFS treats
 * any reference absent from its node map as a dangling reference and no-ops on
 * it ("not this checker's concern").
 */
function identifierShapedReferences(typeSources: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const source of typeSources) {
    for (const arm of splitTopLevel(source, "|")) {
      const trimmed = arm.trim();
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) {
        seen.add(trimmed);
      }
    }
  }
  return [...seen];
}

/**
 * Is `arm` an object schema for the `by`-clause admission cut (bug 0046,
 * settled route)? Two shapes qualify: an inline `ObjectType` (its trimmed text
 * opens with `{` — schemas.md §Discriminated unions defines a discriminated
 * union over unions "whose variants are all object schemas", and an inline
 * object type is one), or a bare identifier resolving to a declared
 * OBJECT-form schema in `objectFields`. An identifier resolving to an ALIAS
 * declaration (`schema Y = string`) is not an object schema at the point of
 * use — deliberately no hop — and neither is one resolving to nothing or to an
 * `enum`, since neither populates `objectFields`.
 */
function isObjectSchemaArm(
  arm: string,
  objectFields: ReadonlyMap<string, readonly SchemaFieldSource[]>,
): boolean {
  const trimmed = arm.trim();
  if (trimmed.startsWith("{")) {
    return true;
  }
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed) && objectFields.has(trimmed);
}

/**
 * `UnionVariantSchema` per arm of a `schema X = A | B` union, or `undefined`
 * when the union does not qualify for discriminator checks (bug 0033 §Fix
 * scopes `checkDiscriminatedUnion` to unions "whose arms ALL resolve to
 * declared OBJECT schemas"): fewer than two arms (a single-arm alias is
 * skipped outright — schemas.md §Discriminated unions describes the concept
 * for 2+ variants), or any arm that is not a bare identifier or does not
 * resolve to a declared object-form schema (a primitive/literal/mixed union,
 * or a name resolving to no declaration or to an alias/head-only decl).
 */
function buildUnionVariantSchemas(
  arms: readonly string[],
  objectFields: ReadonlyMap<string, readonly SchemaFieldSource[]>,
): UnionVariantSchema[] | undefined {
  if (arms.length < 2) {
    return undefined;
  }
  const variants: UnionVariantSchema[] = [];
  for (const arm of arms) {
    const trimmed = arm.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) {
      return undefined;
    }
    const fields = objectFields.get(trimmed);
    if (fields === undefined) {
      return undefined;
    }
    variants.push({ name: trimmed, fields: discriminatorCandidateFields(fields) });
  }
  return variants;
}

/**
 * `DiscriminatorCandidateField` per field of a resolved object-schema variant
 * (schemas.md §Discriminated unions), mirroring how
 * tests/disc-unions-recursion.test.ts hand-builds the same shape: a field's
 * typeSource classifies as a single literal (kind + decoded text), a nested
 * inline-object type, an empty inline object (`{}`), or neither.
 */
function discriminatorCandidateFields(
  fields: readonly SchemaFieldSource[],
): DiscriminatorCandidateField[] {
  return fields.map((f) => ({
    name: f.name,
    ...(f.wireName !== undefined ? { wireName: f.wireName } : {}),
    ...classifyDiscriminatorFieldType(f.typeSource),
  }));
}

/**
 * Classify a field's captured type source (`SchemaFieldSource.typeSource`, the
 * only representation a field retains past parsing) for discriminator
 * detection: a quoted string / integer / number / boolean / `null` SINGLE
 * literal (the `const` shape a discriminator value must be), a single enclosing
 * brace group with a token inside (a nested discriminator value,
 * `theta/parse/nested-discriminator`), an empty inline object (`{}`, already
 * refused by `theta/parse/empty-schema-body`), or neither (never a candidate).
 * The empty-object interior test spells `tokeniseType`'s whitespace set rather
 * than using `trim()`'s wider Unicode one, so its emptiness judgement stays
 * coextensive with `walkType`'s — any other interior byte is a token there too.
 *
 * The nested-object arm's guard is `isSingleEnclosingBraceGroup`
 * (body-type-lowering.ts), not a two-ended `startsWith("{") &&
 * endsWith("}")` test. The two-ended form is POSITIONAL: a top-level union
 * whose FIRST and LAST arms are brace groups satisfies it too, since the first
 * arm opens the source and the last arm closes it. Under it, `{a: X} | {b: Y}`
 * would report as one nested object, when it is a `Type "|" Type` over two
 * `ObjectType` arms (grammar.md:94, :101) and so no discriminator candidate at
 * all (bug 0096 §Fix). The substitution is a conservative refinement — the
 * predicate's own first statement IS the naive test, so it implies it, and no
 * source that already reached the `|` split below changes route.
 *
 * A LITERAL UNION is not a literal. schemas.md §Discriminated unions,
 * detection rule 2, requires the field to "be a single string literal type in
 * every variant (one literal value per variant; NOT a literal-union)", so
 * `kind: "a" | "b"` is no candidate at all. The top-level-`|` test runs before
 * the literal tests because the quote tests are ENDPOINT tests: without it
 * `"a" | "b"` starts and ends with `"` and would classify as one string
 * literal whose text is the interior byte run `a" | "b`. It runs after the
 * inline-object test so a nested type whose own interior carries a union
 * (`{ type: "x" | "y" }`) still reports as nested. `splitTopLevel` tracks
 * string literals, so a `|` INSIDE one (`kind: "a|b"`) does not split and the
 * field stays a single literal.
 */
function classifyDiscriminatorFieldType(
  typeSource: string,
): Pick<DiscriminatorCandidateField, "literal" | "nested" | "emptyObject"> {
  const s = typeSource.trim();
  if (isSingleEnclosingBraceGroup(s)) {
    return /^[ \t\n\r]*$/.test(s.slice(1, -1)) ? { emptyObject: true } : { nested: true };
  }
  if (splitTopLevel(s, "|").length > 1) {
    return {};
  }
  if (
    s.length >= 2 &&
    ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
  ) {
    return { literal: { kind: "string", text: s.slice(1, -1) } };
  }
  if (s === "true" || s === "false") {
    return { literal: { kind: "boolean", text: s } };
  }
  if (s === "null") {
    return { literal: { kind: "null", text: s } };
  }
  if (/^-?\d+\.\d+$/.test(s)) {
    return { literal: { kind: "number", text: s } };
  }
  if (/^-?\d+$/.test(s)) {
    return { literal: { kind: "integer", text: s } };
  }
  return {};
}

export { checkSchemaDeclarationGraph, checkSchemaFieldTypes };
