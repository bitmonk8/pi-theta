// Whole-document structural AST checks, schema graphs, and params-default name checks.

import type { Diagnostic, SourceRange } from "../diagnostics/diagnostic";
import type { FrontmatterBodyTypes } from "./frontmatter";
import { checkLetBinding } from "./bindings";
import { checkBreakStatement, checkContinueStatement } from "./control-flow";
import {
  checkFnPlacement,
  checkFunctionReference,
  checkBareReturn,
  checkUnreachableCode,
} from "./functions";
import {
  checkObjectSchema,
  checkEnumDeclaration,
  checkInlineEnumForm,
  checkVariantAccess,
  checkByClause,
  detectTypeAliasCycles,
  type SchemaDeclSite,
  type SchemaGraphNode,
} from "./schema-declarations";
import { checkDiscriminatedUnion, type DiscriminatorCandidateField, type UnionVariantSchema } from "./discriminated-union-checks";
import { parseTypeExpression } from "./type-grammar";
import { checkObjectLiteralFields } from "./literal-sublanguage";
import { reservedKeywordAsIdentifierDiagnostic, unresolvedNamedTypeDiagnostic, validateTypeAnnotation } from "./annotation-validation";
import type { PropagationCapture, QueryPropagation } from "./query-schema-resolve";
import { collectUnresolvedNamedTypes, isSingleEnclosingBraceGroup } from "./body-type-lowering";
import { isUnspellableTextRefusable, splitTopLevel, type ParamFieldInput } from "./params";
// QRY-19 lives in the runtime discard module (it owns the discarded-query
// discipline shared with the QRY-20 runtime obligation); the parser reuses its
// pure parse-time check rather than re-deriving the diagnostic. Parser→runtime
// type/pure-function imports are an established pattern (system-interpolation,
// type-layer-checks).
import { checkDiscardedQueryResult } from "../runtime/query-discard";
import type {
  NodeBase,
  ObjectExpr,
  PatternNode,
  Expr,
  FnDecl,
  SchemaFieldSource,
  SchemaDecl,
  Stmt,
  Block,
} from "./theta-ast";
import {
  bareObjectLiteralDiagnostic,
  callWithClauseValues,
  checkQueryAnnotation,
  checkQueryTemplateInterpolations,
  parseExpressionSource,
  positionToOffset,
  schemaTypeNotExpressionDiagnostic,
} from "./theta-document";

// --------------------------------------------------------------------------
// Structural (AST-shape) parse checkers (C2a wiring)
// --------------------------------------------------------------------------

/**
 * The whole-file declaration references a structural check resolves against as
 * the walk descends: hoisted top-level `fn` names (for `function-as-value`) and
 * the declared enum-variant sets keyed by enum name (for `unknown-variant`).
 */
interface StructuralRefs {
  readonly fnNames: ReadonlySet<string>;
  readonly enums: ReadonlyMap<string, ReadonlySet<string>>;
  /**
   * Declared object-schema field names keyed by schema name (the
   * `schema X { field: T, … }` object form only). Drives the object-construction
   * checks: a `X { … }` constructor against a known object schema fires
   * `theta/parse/extra-object-field` for an undeclared field and
   * `theta/parse/missing-object-field` for an omitted required field.
   */
  readonly schemas: ReadonlyMap<string, readonly string[]>;
  /**
   * The whole-file type-declaring name universe `collectBodyTypes` builds
   * (`FrontmatterBodyTypes`, frontmatter.ts): every body `schema` name
   * (object or alias/union form) with its object field sources or `undefined`,
   * every body `enum` name, and every symbol a body `import` pulls in. Feeds
   * `checkObjectExpr`'s constructor-name classification when a name misses
   * `schemas` above (bug 0025 §Fix) — deliberately not `collectIdentRoots`,
   * which also folds in `params:` field names, resolved `tools:` callable
   * names, and the stdlib builtins, none of which name a brace-constructible
   * declaration.
   */
  readonly bodyTypes: FrontmatterBodyTypes;
  /**
   * `bodyTypes`'s three name sets (`schemas` keys ∪ `enums` ∪ `imports`)
   * flattened into one `ReadonlySet` (bug 0028 §Fix), computed ONCE in
   * `checkStructural` so it is not rebuilt per node. Feeds
   * `collectUnresolvedNamedTypes` at the six type-expression positions this
   * walk owns: the `@<T>` query annotation, a `schema` body field type (bug
   * 0028 §Fix), and — bug 0262 §Fix — a `let` annotation, an `fn` parameter
   * type, an `fn` return type and an `invoke<T>` ascription. An imported
   * symbol counts as resolved here even though its lowering stays permissive
   * (`MaterializedImport` carries no field bodies) — the name is in scope,
   * which is the only question this set answers.
   */
  readonly typeNames: ReadonlySet<string>;
  /**
   * Which written annotations QRY-2 carried onto a query the author left
   * schema-less (`resolveQuerySchemas`' `propagations` report), indexed by the
   * capture that supplied each. Clause (iv)(2) of bug 0262 §Fix gives the query
   * arm the sole emission for propagated text, so a capture whose own text
   * reached a query withholds its refusal; the propagation set is READ from the
   * pass that performs it rather than re-derived here, because a second
   * traversal of the crossed constructs (a ternary branch, an array-literal
   * element, a `return` operand at depth, a local `fn`'s parameter reached from
   * a call argument) drifts from the first one the moment either moves.
   */
  readonly queryPropagations: PropagationIndex;
  /**
   * Every error-severity diagnostic drawn BEFORE the structural walk runs —
   * the lexer's own pass (`lexTheta`) and the body parser's own pass
   * (`BodyParser.diagnostics`) — threaded read-only into the walk so the four
   * `unresolved-named-type` captures bug 0262 §Fix adds can test whether a
   * capture's own source window already carries a diagnostic naming the real
   * fault (clause (iv)(3)'s artefact-suppression predicate) before adding a
   * second one for text the capture merely absorbed. Two SEPARATE passes,
   * not one: `theta/parse/single-line-if` is a lexer diagnostic and
   * `theta/parse/fn-param-list-unclosed` is a parser diagnostic, and the two
   * measured artefact fixtures (`stringletx`, `number1`) each draw one of
   * each kind, so a set reading only one pass would miss the other's cover.
   */
  readonly priorDiagnostics: readonly Diagnostic[];
}

/** The lexical context a structural check consults as the walk descends. */
interface WalkCtx {
  /** Whether the current statements sit inside a `for` / `while` body. */
  readonly inLoop: boolean;
  /** Whether the current statements are the theta's top level (for `fn` placement). */
  readonly topLevel: boolean;
  /** Whether the enclosing `fn` is `void`-annotated (for bare `return`). */
  readonly voidReturn: boolean;
}

/**
 * Hoist the top-level `enum` declarations' variant-name sets, keyed by enum
 * name. Whole-file and declaration-order-independent, matching the resolution
 * rule frontmatter → body forward references already rely on. Read by the body's
 * own structural walk and by the `params:` default check, so the two positions
 * decide `Enum.Variant` against one set rather than two.
 */
function hoistEnumVariants(
  statements: readonly Stmt[],
): ReadonlyMap<string, ReadonlySet<string>> {
  const enums = new Map<string, ReadonlySet<string>>();
  for (const s of statements) {
    if (s.kind === "enum" && s.variants !== undefined) {
      enums.set(s.name, new Set(s.variants));
    }
  }
  return enums;
}

/** A stable key for a source range, for comparing two diagnostics' positions. */
function rangeKey(range: SourceRange): string {
  return `${range.start.line}:${range.start.column}-${range.end.line}:${range.end.column}`;
}

/**
 * Check the NAME-resolution side conditions of a `params:` default's
 * `Enum.Variant` forms (bug 0185 §Fix route 1).
 *
 * `NamedValueLit ::= Ident "." Ident` carries two side conditions in the grammar
 * itself — "head is an enum name in scope, tail a declared variant"
 * (grammar.md) — and the default half's is-literal check cannot test either: the
 * node it judges records only whether the head was a bare identifier, not what
 * the two identifiers spelled. The body tests them (`checkVariantAccess`, from
 * `checkStructural`'s walk, and `checkUnknownIdentifiers`), and
 * frontmatter-fields-a.md §Defaults requires the literal sublanguage to be a
 * SUBSET of the body expression grammar, so the same bytes must draw the same
 * code here. Without this check they draw none, and the unresolvable name
 * reaches the binder's defaults recovery instead, where it aborts the invocation
 * under a runtime panic code whose trigger the author's source does not match.
 *
 * Three arms:
 *
 *   - the head names a declared `enum` and the tail is not one of its variants
 *     — `theta/parse/unknown-variant`, via the body's own `checkVariantAccess`;
 *   - the head resolves to nothing in the whole-file root scope —
 *     `theta/parse/unknown-identifier`, the code the body raises for the same
 *     head;
 *   - the head RESOLVES (a `schema` name, another `params:` field, a `fn` —
 *     every `collectIdentRoots` source but a declared `enum`) and names no
 *     enum — `theta/parse/default-not-literal`.
 *
 * `grammar.md`'s "head is an enum name in scope" is a side condition OF the
 * `NamedValueLit` production, not a separate check on an otherwise-formed
 * `Literal`. A head that resolves to nothing leaves the intended form
 * undetermined, so the second arm stays a NAME question. A head that RESOLVES
 * but names no enum determines the form completely: the RHS is an identifier
 * reference that is not an `Enum.Variant` access, one of the forms
 * `default-not-literal`'s registered *Trigger* already enumerates, so the third
 * arm is a SHAPE question the moment the head is known.
 *
 * The enum arm runs FIRST, so a same-file `schema X` shadowing `enum X`
 * resolves the head against the declared `enum` at this gate, independently of
 * which declaration the type layer's own `member` arm prefers under the same
 * shadow (bug 0191's open subject).
 *
 * All three arms walk only a `params:` default. A member access at a body
 * VALUE position resolves through the body's own walk and the runtime
 * evaluator instead, so that position's disposition (bug 0140's open subject)
 * is unaffected by which of the three arms fires here.
 *
 * The range is the `params:` field's own, so the diagnostic points at the
 * declaration rather than at the top of the file. A field the frontmatter parse
 * has already refused is skipped, keeping the "exactly one diagnostic per
 * offending field" precedence the `params:` default checks hold among
 * themselves.
 */
function checkParamsDefaultNames(
  paramFields: readonly ParamFieldInput[],
  enums: ReadonlyMap<string, ReadonlySet<string>>,
  roots: ReadonlySet<string>,
  refusedRanges: ReadonlySet<string>,
  file: string,
): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const field of paramFields) {
    const defaultSource = field.defaultSource;
    if (defaultSource === undefined || refusedRanges.has(rangeKey(field.range))) {
      continue;
    }
    // The literal sublanguage's own node model discards both identifier texts,
    // so the RHS is re-parsed here through the body expression parser, which
    // retains them. A source that does not parse as one expression carries no
    // resolvable name and is the is-literal check's to refuse.
    const parsed = parseExpressionSource(defaultSource);
    if (parsed === null) {
      continue;
    }
    walkParamsDefaultNames(parsed, enums, roots, { file, range: field.range }, defaultSource, out);
  }
  return out;
}

/**
 * Descend a parsed `params:` default for `Enum.Variant` forms. The descent
 * covers exactly the literal sublanguage's container productions — `ArrayLit`
 * elements and the field values of `BareObjectLit` / `NamedObjectLit` — which
 * are the depths `Enum.Variant` is reachable at. Anything else is outside the
 * production set and is the is-literal check's subject, not this one's.
 *
 * `defaultSource` is the field's default RHS verbatim — the exact string
 * `expr` (and every node reachable from it) was parsed out of by
 * `parseExpressionSource` — so the third `member` arm can render `<expr>` as
 * the offending member access's own byte span (placeholder-rendering-a.md:49)
 * rather than a `<head>.<field>` reconstruction of it.
 */
function walkParamsDefaultNames(
  expr: Expr,
  enums: ReadonlyMap<string, ReadonlySet<string>>,
  roots: ReadonlySet<string>,
  site: SchemaDeclSite,
  defaultSource: string,
  out: Diagnostic[],
): void {
  switch (expr.kind) {
    case "array":
      for (const element of expr.elements) {
        walkParamsDefaultNames(element, enums, roots, site, defaultSource, out);
      }
      return;
    case "object":
      for (const field of expr.fields) {
        walkParamsDefaultNames(field.value, enums, roots, site, defaultSource, out);
      }
      return;
    case "member": {
      if (expr.target.kind !== "ident") {
        return;
      }
      const head = expr.target.name;
      const variants = enums.get(head);
      if (variants !== undefined) {
        const diagnostic = checkVariantAccess(
          { enumName: head, variant: expr.field, knownVariants: [...variants] },
          site,
        );
        if (diagnostic !== undefined) {
          out.push(diagnostic);
        }
        return;
      }
      if (!roots.has(head)) {
        out.push({
          severity: "error",
          code: "theta/parse/unknown-identifier",
          file: site.file,
          range: site.range,
          message: `unknown identifier '${head}'`,
        });
        return;
      }
      // The head RESOLVES and names no enum, so `grammar.md`'s "head is an
      // enum name in scope" side condition on `NamedValueLit` fails: the RHS
      // derives no arm of `Literal` and is an identifier reference that is not
      // an `Enum.Variant` access, one of the forms this code's registered
      // *Trigger* already enumerates. `<expr>` is sliced from `defaultSource`
      // by offset, not reassembled from `head` and `expr.field`, so an access
      // written with internal whitespace (`Box . sev`) renders that whitespace
      // back.
      const offendingSpan = defaultSource.slice(
        positionToOffset(defaultSource, expr.range.start),
        positionToOffset(defaultSource, expr.range.end),
      );
      out.push({
        severity: "error",
        code: "theta/parse/default-not-literal",
        file: site.file,
        range: site.range,
        message: `params default RHS must be a literal-sublanguage form; offending sub-expression: ${offendingSpan}`,
      });
      return;
    }
    default:
      return;
  }
}

/**
 * The propagating captures, keyed by capture identity. Null-prototyped: the key
 * is composed from a capture kind and a source range, and every read is
 * own-key-guarded (`propagatedToQuery`), so no `Object.prototype` name can
 * answer for a capture no propagation wrote.
 */
type PropagationIndex = Readonly<Record<string, true>>;

/**
 * The index key for one capture. The capture's own declaration range is the
 * identity: two distinct declarations cannot share a range, and a parameter is
 * further distinguished by its position in the list, so a `fn` with one
 * propagating parameter withholds at that parameter alone.
 */
function propagationKey(capture: PropagationCapture): string {
  const position = capture.kind === "fn-param" ? `#${capture.paramIndex}` : "";
  return `${capture.kind}${position}@${rangeKey(capture.range)}`;
}

/** Index QRY-2's propagation report by capture identity. */
function indexQueryPropagations(
  propagations: readonly QueryPropagation[],
): PropagationIndex {
  const index: Record<string, true> = Object.create(null) as Record<string, true>;
  for (const propagation of propagations) {
    index[propagationKey(propagation.capture)] = true;
  }
  return index;
}

/**
 * Clause (iv)(2)'s withhold: did the annotation written at this capture reach a
 * query the author left schema-less? The query arm is the sole emitter for
 * propagated text, so a capture that answers `true` withholds its own refusal
 * and the one written annotation draws one diagnostic.
 */
function propagatedToQuery(refs: StructuralRefs, capture: PropagationCapture): boolean {
  const key = propagationKey(capture);
  return Object.hasOwn(refs.queryPropagations, key);
}

/**
 * The window a declared-type capture can plausibly have ABSORBED debris from:
 * the construct's own start up to the first node that follows the capture in
 * source. Everything from that node onwards is a different subject — an `fn`
 * body, a `let` initialiser, an `invoke` argument list — so a fault ranged
 * there is a second, independent author mistake and must not withdraw the
 * capture's name refusal. When the following node is absent (a body the parser
 * never recovered, an initialiser-less `let`, an argument-less `invoke`) the
 * whole construct stands as the window, which is the conservative reading.
 */
function captureAbsorptionWindow(
  construct: SourceRange,
  firstNodeAfterCapture: NodeBase | null | undefined,
): SourceRange {
  return firstNodeAfterCapture === null || firstNodeAfterCapture === undefined
    ? construct
    : { start: construct.start, end: firstNodeAfterCapture.range.start };
}

/**
 * The window an `fn`'s PARAMETER-type and RETURN-type captures are absorbed
 * from: the declaration's header, from the `fn` keyword up to the first node
 * of its body. A `Block` carries no range of its own, so the header's end is
 * read off the first body statement (or, for a statement-less body, its tail).
 */
function fnHeaderWindow(s: FnDecl): SourceRange {
  return captureAbsorptionWindow(s.range, s.body.statements[0] ?? s.body.tail);
}

/** Validate parameter and return captures with their propagation and header windows. */
function validateFnAnnotations(
  s: FnDecl,
  refs: StructuralRefs,
  file: string,
  out: Diagnostic[],
): void {
  for (const [paramIndex, p] of s.params.entries()) {
    if (p.type.length > 0) {
      // bug 0262 §Fix: reference r2, reaching r7 and r9's interiors (a
      // union arm, an inline object field) through the same walk. A
      // parameter IS a propagating capture: QRY-2's call-argument sink
      // carries a local `fn`'s parameter annotation onto a schema-less
      // query written as that argument, and clause (iv)(2) states its rule
      // as a property of propagated TEXT, so the withhold reaches here as
      // it reaches the other two propagating captures. Guard-1 withholds as
      // elsewhere; clause (iv)(3), gated on `p.typeAbsorbed`, withholds only
      // when THIS parameter's own capture did not end at its own `,` or `)`
      // inside the DECLARATION HEADER window — a sibling parameter's own
      // head is not debris merely because it shares that header (bug 0279).
      validateTypeAnnotation(p.type, {
        position: "value",
        name: p.name,
        range: s.range,
        propagated: () => propagatedToQuery(refs, {
          kind: "fn-param",
          range: s.range,
          paramIndex,
        }),
        absorbed: p.typeAbsorbed,
        absorptionWindow: () => fnHeaderWindow(s),
      }, refs, file, out);
    }
  }
  if (s.returnType !== null && s.returnType.length > 0) {
    // bug 0262 §Fix: reference r3, reaching r8's interior (a `Result`
    // argument) through the same walk. Clause (iv)(2)'s `fn`-return ->
    // query half withholds when this SAME declared return type has
    // already propagated onto ANY query at a return position of the body —
    // the tail or a `return` operand (`walkExpr`'s `"query"` arm is that
    // text's sole emitter there); guard-1 withholds as at the other three
    // captures. Clause (iv)(3), gated on `s.returnTypeAbsorbed`, withholds
    // only when the return capture itself did not end at its own `{` (or
    // `with`) inside the DECLARATION HEADER window — a fault in the body
    // interior is a different capture's own mistake, not one this capture
    // was stopped by (bug 0279).
    validateTypeAnnotation(s.returnType, {
      position: "return",
      name: s.name,
      range: s.range,
      propagated: () => propagatedToQuery(refs, { kind: "fn-return", range: s.range }),
      absorbed: s.returnTypeAbsorbed,
      absorptionWindow: () => fnHeaderWindow(s),
    }, refs, file, out);
  }
}

/**
 * Run the implemented structural (AST-shape) parse-checkers over the whole-file
 * body and aggregate their diagnostics. These are shape-level well-formedness
 * checks that need no type inference: loop-context (`break` / `continue`), `fn`
 * placement and first-class use, `let` initialiser presence, bare `return`,
 * unreachable code, empty object schemas, and the position-sensitive
 * type-grammar checks over declared type sources. (`mut`-context and member /
 * index assignment are emitted inline by the parser, where the source tokens
 * are still in hand.)
 */
function checkStructural(
  body: Block,
  bodyTypes: FrontmatterBodyTypes,
  file: string,
  queryPropagations: readonly QueryPropagation[],
  priorDiagnostics: readonly Diagnostic[],
): Diagnostic[] {
  const out: Diagnostic[] = [];
  // Hoisted top-level `fn` names, so a bare reference to one in value position
  // is `theta/parse/function-as-value` (functions.md FN-1).
  const fnNames = new Set<string>();
  // Hoisted top-level `enum` declarations, so a `Enum.Variant` member access to
  // a variant the enum does not declare is `theta/parse/unknown-variant`
  // (schemas.md §Variant access). `hoistEnumVariants` is shared with the
  // `params:` default check (`checkParamsDefaultNames`, run later in the same
  // `parseThetaDocument` pass) so the body walk and the frontmatter default
  // walk decide `Enum.Variant` against one set rather than two.
  const enums = hoistEnumVariants(body.statements);
  // Declared object-schema field name sets, so an object constructor against a
  // known object schema can be validated (extra / missing field).
  const schemas = new Map<string, readonly string[]>();
  for (const s of body.statements) {
    if (s.kind === "fn") {
      fnNames.add(s.name);
    } else if (s.kind === "schema" && s.fields !== undefined) {
      schemas.set(s.name, s.fields.map((f) => f.name));
    }
  }
  // The whole-file `NamedType` resolution set (bug 0028 §Fix), flattened ONCE
  // here rather than per-node: every body `schema` name (object or alias/union
  // form), every body `enum` name, and every symbol a body `import` pulls in.
  const typeNames = new Set<string>([
    ...bodyTypes.schemas.keys(),
    ...bodyTypes.enums,
    ...bodyTypes.imports,
  ]);
  const refs: StructuralRefs = {
    fnNames,
    enums,
    schemas,
    bodyTypes,
    typeNames,
    queryPropagations: indexQueryPropagations(queryPropagations),
    priorDiagnostics,
  };
  walkStatements(
    body.statements,
    { inLoop: false, topLevel: true, voidReturn: false },
    refs,
    file,
    out,
  );
  if (body.tail !== null) {
    walkExpr(
      body.tail,
      { inLoop: false, topLevel: true, voidReturn: false },
      refs,
      file,
      out,
    );
  }
  // The alias/union declaration-graph checks (bug 0033 §Fix): scoped to
  // TOP-LEVEL declarations only, mirroring `collectBodyTypes` (the lowering
  // and `NamedType`-resolution set is top-level-only; a block-nested schema
  // decl brands nothing at runtime either — `LexicalEnvironment`'s `schemas`
  // registry is root-only, src/runtime/lexical-environment.ts).
  out.push(...checkSchemaDeclarationGraph(body.statements, typeNames, file));
  return out;
}

/** Push a checker's optional diagnostic result, dropping `undefined`. */
function pushDiag(out: Diagnostic[], diag: Diagnostic | undefined): void {
  if (diag !== undefined) {
    out.push(diag);
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
      const fieldReservedKeywords: string[] = [];
      const fieldUnspellable: string[] = [];
      const fieldUnresolved = collectUnresolvedNamedTypes(
        f.typeSource,
        refs.typeNames,
        fieldReservedKeywords,
        fieldUnspellable,
      );
      for (const keyword of fieldReservedKeywords) {
        out.push(reservedKeywordAsIdentifierDiagnostic(keyword, s.range, file));
      }
      for (const name of fieldUnresolved) {
        out.push(unresolvedNamedTypeDiagnostic(name, s.range, file));
      }
      // bug 0061 §Fix, guard 1 only: the object body has no parse-time
      // refusal to mirror the alias position's guard 2
      // (`emitMalformedAliasRhs`) — a field's type is one verbatim capture
      // with no separate malformed-right-hand-side emission. A field that
      // already drew an error-severity diagnostic in its own walk above
      // (a position rule, a reserved keyword, or an unresolved name)
      // keeps that diagnostic alone; otherwise refuse what the shared
      // decline (`isUnspellableTextRefusable`, params.ts) does not admit,
      // one diagnostic per offending fragment, no dedup.
      if (!out.slice(fieldDiagStart).some((d) => d.severity === "error")) {
        fieldUnspellable
          .filter(isUnspellableTextRefusable)
          .forEach(() => out.push(schemaTypeNotExpressionDiagnostic(s.name, s.range, file)));
      }
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
  const aliasReservedKeywords: string[] = [];
  const aliasUnspellable: string[] = [];
  const aliasUnresolved = collectUnresolvedNamedTypes(
    arms.join(" | "),
    typeNames,
    aliasReservedKeywords,
    aliasUnspellable,
  );
  for (const keyword of aliasReservedKeywords) {
    out.push(reservedKeywordAsIdentifierDiagnostic(keyword, s.range, file));
  }
  for (const name of aliasUnresolved) {
    out.push(unresolvedNamedTypeDiagnostic(name, s.range, file));
  }
  // bug 0061 §Fix: text no `Type` production spells reaches
  // `lowerTypeExpr`'s catch-all as `aliasUnspellable`
  // (`collectUnresolvedNamedTypes`, body-type-lowering.ts); refuse what the
  // shared decline (`isUnspellableTextRefusable`, type-text-split.ts) does not admit,
  // one diagnostic per offending fragment, no dedup. Guard 1 — this
  // declaration already drew an error-severity diagnostic in its own arm
  // walk above (a position rule, a reserved keyword, or an unresolved
  // name) — keeps that diagnostic alone. Guard 2 — `emitMalformedAliasRhs`
  // already refused this right-hand side at PARSE time, into a diagnostic
  // array this checker pass cannot see — is read off the node flag
  // `finishAliasSchema` recorded (`s.aliasRhsRefused`), so the refusal never
  // cascades onto a right-hand side another row already named.
  if (
    s.aliasRhsRefused !== true &&
    !out.slice(declDiagStart).some((d) => d.severity === "error")
  ) {
    aliasUnspellable
      .filter(isUnspellableTextRefusable)
      .forEach(() => out.push(schemaTypeNotExpressionDiagnostic(s.name, s.range, file)));
  }
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

function walkStatements(
  statements: readonly Stmt[],
  scope: WalkCtx,
  refs: StructuralRefs,
  file: string,
  out: Diagnostic[],
): void {
  // RET-3 — the first statement after a `return` in the same block is
  // unreachable (a warning).
  let returnedAt = -1;
  for (let i = 0; i < statements.length; i += 1) {
    const s = statements[i];
    if (s === undefined) {
      continue;
    }
    if (returnedAt >= 0 && i === returnedAt + 1) {
      pushDiag(
        out,
        checkUnreachableCode(
          { hasCodeAfterReturn: true },
          { file, range: s.range },
        ),
      );
    }
    walkStatement(s, scope, refs, file, out);
    if (s.kind === "return") {
      returnedAt = i;
    }
  }
}

function walkBlock(
  block: Block,
  scope: WalkCtx,
  refs: StructuralRefs,
  file: string,
  out: Diagnostic[],
): void {
  walkStatements(block.statements, scope, refs, file, out);
  if (block.tail !== null) {
    walkExpr(block.tail, scope, refs, file, out);
  }
}

function walkStatement(
  s: Stmt,
  scope: WalkCtx,
  refs: StructuralRefs,
  file: string,
  out: Diagnostic[],
): void {
  switch (s.kind) {
    case "let": {
      pushDiag(
        out,
        checkLetBinding(
          { name: s.name, mutable: s.mutable, hasInitialiser: s.init !== null },
          { file, range: s.range },
        ),
      );
      if (s.annotation !== null && s.annotation.length > 0) {
        // bug 0262 §Fix: the `let` annotation is a further `NamedType`-
        // resolution position — reference r1 of the reference-position table,
        // reaching r4 and r6's interiors (a generic argument, a union arm)
        // through the same `collectUnresolvedNamedTypes` walk the five already-
        // wired captures use. Withheld under three conditions: clause (iv)(2)
        // when this same text is ALSO propagating onto a bare-query
        // initialiser (the `@<T>` arm is that text's sole emitter, bug 0093);
        // the landed guard-1 shape when this capture's own walk already
        // drew an error (including the not-a-type-expression push); and clause
        // (iv)(3), gated on `s.annotationAbsorbed`, when the
        // capture did not end at its own `=` terminator and its source window
        // is already covered by an error-severity diagnostic naming the real
        // fault — a capture stopped by that fault, not a name the author wrote
        // (bug 0279).
        // The `let` capture's window runs from the statement's start to the
        // initialiser's start (the whole statement when there is none): the
        // initialiser is a different subject, so a fault inside it — or past
        // the statement's end, a stray token on the same line — is a second,
        // independent author mistake and keeps its own diagnostic beside this
        // one.
        validateTypeAnnotation(s.annotation, {
          position: "value",
          name: s.name,
          range: s.range,
          propagated: () => propagatedToQuery(refs, { kind: "let", range: s.range }),
          absorbed: s.annotationAbsorbed,
          absorptionWindow: () => captureAbsorptionWindow(s.range, s.init),
        }, refs, file, out);
      }
      if (s.init !== null) {
        walkExpr(s.init, scope, refs, file, out);
      }
      return;
    }
    case "reassign":
      walkExpr(s.value, scope, refs, file, out);
      return;
    case "if": {
      walkExpr(s.condition, scope, refs, file, out);
      walkBlock(s.then, { ...scope, topLevel: false }, refs, file, out);
      if (s.otherwise !== null) {
        if ("statements" in s.otherwise) {
          walkBlock(s.otherwise, { ...scope, topLevel: false }, refs, file, out);
        } else {
          walkStatement(
            s.otherwise,
            { ...scope, topLevel: false },
            refs,
            file,
            out,
          );
        }
      }
      return;
    }
    case "while":
      walkExpr(s.condition, scope, refs, file, out);
      walkBlock(
        s.body,
        { ...scope, inLoop: true, topLevel: false },
        refs,
        file,
        out,
      );
      return;
    case "for":
      walkExpr(s.iterand, scope, refs, file, out);
      walkBlock(
        s.body,
        { ...scope, inLoop: true, topLevel: false },
        refs,
        file,
        out,
      );
      return;
    case "break":
      pushDiag(
        out,
        checkBreakStatement(
          { insideLoop: scope.inLoop, hasValue: s.hasValue ?? false },
          { file, range: s.range },
        ),
      );
      return;
    case "continue":
      pushDiag(
        out,
        checkContinueStatement(
          { insideLoop: scope.inLoop },
          { file, range: s.range },
        ),
      );
      return;
    case "fn": {
      pushDiag(
        out,
        checkFnPlacement({ nested: !scope.topLevel }, { file, range: s.range }),
      );
      validateFnAnnotations(s, refs, file, out);
      walkBlock(
        s.body,
        { inLoop: false, topLevel: false, voidReturn: s.returnType === "void" },
        refs,
        file,
        out,
      );
      return;
    }
    case "return":
      if (s.operand === null) {
        pushDiag(
          out,
          checkBareReturn(
            { returnTypeIsVoid: scope.voidReturn },
            { file, range: s.range },
          ),
        );
      } else {
        walkExpr(s.operand, scope, refs, file, out);
      }
      return;
    case "query":
      // QRY-19 (query-escapes-stringification.md#qry-19): a bare `@`...`` in
      // expression-statement position drops the must-use `Result` without
      // acknowledgement. A `QueryStmt` is produced only for a NON-tail bare
      // query — `parseForms` promotes a trailing line-start query to the
      // body/void tail (the accepted void-tail discard, QRY-20 territory), and
      // the `?`-propagate / `let _ =`-discard / `let x = …` binding forms parse
      // to `try` / `let` nodes — so its disposition is always
      // `bare-expr-statement`, the sole QRY-19 trigger.
      pushDiag(
        out,
        checkDiscardedQueryResult({
          isQuery: true,
          disposition: "bare-expr-statement",
          file,
          range: s.range,
        }),
      );
      walkExpr(s.query, scope, refs, file, out);
      return;
    case "tool-call":
      walkExpr(s.call, scope, refs, file, out);
      return;
    case "invoke":
      walkExpr(s.invoke, scope, refs, file, out);
      return;
    case "expr":
      walkExpr(s.expr, scope, refs, file, out);
      return;
    case "schema": {
      checkSchemaFieldTypes(s, refs, file, out);
      return;
    }
    case "enum": {
      // Enum-declaration well-formedness (schemas.md §Enum declarations): empty
      // body, non-string explicit values, duplicate variant names. The
      // `variantDecls` retain non-string explicit values (unlike the runtime
      // `variantValues`) so they are rejected here.
      if (s.variantDecls !== undefined) {
        out.push(
          ...checkEnumDeclaration(
            { name: s.name, variants: s.variantDecls },
            { file, range: s.range },
          ),
        );
      }
      return;
    }
    default:
      return;
  }
}

/**
 * Validate an object-construction expression (expressions.md §"Object
 * construction"). A bare `{ field: expr }` (no schema name) in expression
 * position outside the two documented carve-outs (`params:` defaults; a direct
 * argument of a Pi-tool call) is `theta/parse/bare-object-literal`; the caller
 * passes `bareAllowed` for the carve-out positions. A named constructor
 * `Schema { … }` against a declared object schema fires
 * `theta/parse/extra-object-field` for a field the schema does not declare and
 * `theta/parse/missing-object-field` for an omitted required field (every
 * declared field is required — schemas.md; no `field?:` shorthand). A name
 * `refs.schemas` misses is not necessarily undeclared: it is classified
 * against the whole-file type-declaring universe (`refs.bodyTypes`) before the
 * checker gives up on the shape — a symbol imported from a `.thetalib` defers
 * whatever its kind, because the importer's parse holds neither its field
 * bodies nor its kind; an `enum`, a `schema` declared without an object body,
 * or a name resolving to no declaration at all is
 * `theta/parse/unresolved-named-type` (bug 0025 §Fix).
 */
function checkObjectExpr(
  e: ObjectExpr,
  refs: StructuralRefs,
  file: string,
  out: Diagnostic[],
  bareAllowed: boolean,
): void {
  if (e.typeName === null) {
    if (!bareAllowed) {
      // Shared builder (bug 0016 part B): the lexical call-site walk emits the
      // same code for the sole-call-argument position this walk suppresses, so
      // both sites must render the identical registered message.
      out.push(bareObjectLiteralDiagnostic(e.range, file));
    }
    return;
  }
  const declared = refs.schemas.get(e.typeName);
  if (declared === undefined) {
    // Not a same-file object-form `schema`: classify the name against the
    // whole-file type-declaring universe instead of guessing (bug 0025 §Fix,
    // "Classification"). `refs.bodyTypes`, not `refs.enums` above — that map
    // exists for `Enum.Variant` member-access resolution, a different concern
    // this walk must not couple to constructor-name resolution.
    const { imports, enums, schemas: bodySchemas } = refs.bodyTypes;
    if (imports.has(e.typeName)) {
      // `collectBodyTypes`'s `imports` set is name-only: the importer's parse
      // holds neither the symbol's field bodies nor its kind, so whether the
      // name is even brace-constructible is undecidable here. The sole
      // genuinely undecidable class — defer, since the field-set checks below
      // have no shape to run against.
      return;
    }
    if (enums.has(e.typeName)) {
      // A declared `enum` is not brace-constructible under any reading of
      // expressions.md §"Object construction" — a discriminated union
      // constructs via the variant schema name, never the enum name.
      out.push(unresolvedNamedTypeDiagnostic(e.typeName, e.range, file));
      return;
    }
    if (bodySchemas.has(e.typeName)) {
      // Present in the whole-file schema set but missing from `refs.schemas`
      // above means `fields === undefined`: the alias/union form (`arms`
      // carries its right-hand side instead — bug 0033 §Fix) or the
      // head-only form. Either way the declaration has no object body and
      // nothing to brace-construct, so a `schema Animal = Cat | Dog`
      // constructor fires here even though `Animal` itself parses cleanly.
      out.push(unresolvedNamedTypeDiagnostic(e.typeName, e.range, file));
      return;
    }
    // No body `schema` of either form, no body `enum`, no imported symbol:
    // resolves to no declaration at all.
    out.push(unresolvedNamedTypeDiagnostic(e.typeName, e.range, file));
    return;
  }
  const declaredSet = new Set(declared);
  const present = e.fields.map((f) => f.name);
  for (const field of present) {
    if (!declaredSet.has(field)) {
      out.push({
        severity: "error",
        code: "theta/parse/extra-object-field",
        file,
        range: e.range,
        message: `extra field '${field}' on schema '${e.typeName}'`,
      });
    }
  }
  out.push(
    ...checkObjectLiteralFields(
      { name: e.typeName, fields: declared },
      present,
      { file, range: e.range },
    ),
  );
}

/**
 * The declared field-name set a `match` object-pattern head resolves to, for
 * `checkPatternObjectFields`'s field-name check (bug 0226 §Fix). Mirrors
 * `checkObjectExpr`'s constructor-position classification
 * over the SAME three sources — `StructuralRefs.schemas` first, then the
 * whole-file `bodyTypes` universe — but with one deliberate divergence at the
 * alias/union branch: the constructor position refuses an alias/union name
 * outright (`theta/parse/unresolved-named-type`, since it carries no
 * brace-constructible requirement), while a pattern head admits that same
 * name (bug 0221's registered pattern-head clause on that code) and so needs
 * a FIELD SET to judge its listed fields against — `undefined` here means
 * DEFER (no same-file object body to check against: an imported symbol, an
 * `enum`, a builtin, or no declaration at all), and an empty set means the
 * declaration IS same-file but carries no fields (a same-file alias/union or a
 * head-only `schema`), so every listed field is reported as unsatisfiable
 * (row A5's settled disposition).
 */
function resolvePatternDeclaredFieldSet(
  typeName: string,
  refs: StructuralRefs,
): ReadonlySet<string> | undefined {
  const declared = refs.schemas.get(typeName);
  if (declared !== undefined) {
    return new Set(declared);
  }
  const { imports, enums, schemas: bodySchemas } = refs.bodyTypes;
  if (!imports.has(typeName) && !enums.has(typeName) && bodySchemas.has(typeName)) {
    return new Set();
  }
  return undefined;
}

/**
 * The field-NAME half of bug 0226 §Fix: a `match` object-pattern head that
 * resolves to a same-file declaration has its LISTED field names checked
 * against that declaration, with the verdict `checkObjectExpr` (above) already
 * applies at the constructor position — `theta/parse/extra-object-field`,
 * reported at the whole PATTERN's range (the object `PatternNode`'s new
 * `range` field), since no per-field range exists. Recurses into object field
 * sub-patterns, array elements and constructor inners so a nested head (bug
 * 0226 row A6) is reached too; wildcard, identifier and literal sub-patterns
 * bind or match nothing and are no-ops. `theta/parse/missing-object-field` is
 * deliberately NOT emitted here: a pattern lists a SUBSET of the declared
 * fields by design (expressions.md:171, "unlisted fields are ignored"), so an
 * omitted declared field stays legal at a pattern head (§Non-goals, cell b2).
 */
function checkPatternObjectFields(
  pattern: PatternNode,
  refs: StructuralRefs,
  file: string,
  out: Diagnostic[],
): void {
  switch (pattern.kind) {
    case "wildcard":
    case "identifier":
    case "literal":
      return;
    case "constructor":
      checkPatternObjectFields(pattern.inner, refs, file, out);
      return;
    case "array":
      for (const element of pattern.elements) {
        checkPatternObjectFields(element, refs, file, out);
      }
      return;
    case "object": {
      if (pattern.typeName !== null) {
        const declaredSet = resolvePatternDeclaredFieldSet(pattern.typeName, refs);
        if (declaredSet !== undefined) {
          for (const field of pattern.fields) {
            if (!declaredSet.has(field.name)) {
              out.push({
                severity: "error",
                code: "theta/parse/extra-object-field",
                file,
                range: pattern.range,
                message: `extra field '${field.name}' on schema '${pattern.typeName}'`,
              });
            }
          }
        }
      }
      for (const field of pattern.fields) {
        checkPatternObjectFields(field.pattern, refs, file, out);
      }
      return;
    }
  }
}

function walkExpr(
  e: Expr,
  scope: WalkCtx,
  refs: StructuralRefs,
  file: string,
  out: Diagnostic[],
  bareObjectAllowed = false,
): void {
  switch (e.kind) {
    case "ident":
      if (refs.fnNames.has(e.name)) {
        pushDiag(
          out,
          checkFunctionReference(
            { name: e.name, position: "value" },
            { file, range: e.range },
          ),
        );
      }
      return;
    case "binary":
      walkExpr(e.left, scope, refs, file, out);
      walkExpr(e.right, scope, refs, file, out);
      return;
    case "ternary":
      walkExpr(e.condition, scope, refs, file, out);
      walkExpr(e.consequent, scope, refs, file, out);
      walkExpr(e.alternate, scope, refs, file, out);
      return;
    case "try":
      walkExpr(e.operand, scope, refs, file, out);
      return;
    case "call":
      // Direct-call-argument position: this walk suppresses the bare-object
      // check here UNCONDITIONALLY, for EVERY direct argument (expressions.md
      // §"Object construction" carve-out 2; bug 0072), and the lexical
      // call-site walk (`walkCallSiteExpr`, bug 0016 part B) owns the emission
      // for all of them, because the
      // §Object construction carve-out is CALLEE- and ARITY-sensitive — it
      // admits a bare `{ … }` argument only when the callee lexically
      // resolves to a Pi tool, and a Pi-tool callee's own multi-argument call
      // draws `theta/parse/tool-arg-arity` instead — and this structural walk
      // carries neither the frontmatter tool set nor any scope tracking.
      // Splitting by POSITION keeps each code emitted exactly once per node
      // (the two walks partition the positions); the alternative —
      // threading the tool set and a full shadow model into every structural
      // walker — would duplicate the lexical walk's scope machinery here.
      // Nested fields, and a bare object at any NON-direct position (e.g.
      // inside an array argument), are still validated.
      for (const arg of e.args) {
        const directBareObject = arg.kind === "object" && arg.typeName === null;
        walkExpr(arg, scope, refs, file, out, directBareObject);
      }
      // A `with { … }` clause value is an ordinary expression position judged by
      // an argument's exact rules (invocation.md INV-6), so it is walked here
      // like the sibling `invoke` arm does. The direct-argument bare-object
      // carve-out above does NOT extend to it: the §Object construction carve-out
      // is keyed to a Pi-tool callee's direct arguments, and a clause value is
      // never one — so it is walked with `bareObjectAllowed` at its default false.
      for (const value of callWithClauseValues(e)) {
        walkExpr(value, scope, refs, file, out);
      }
      return;
    case "invoke":
      // The `<T>` return-type annotation sits ahead of the argument list in
      // source (`invoke<T>(args)`), so its diagnostics push before the
      // argument walk's, matching every other wired position's source-order
      // emission. `"value"`: `TypePosition`'s own doc comment (type-grammar.ts)
      // classifies `invoke<T>` there, as it does `@<T>`. `"inline-object-shape"`:
      // this position runs no other position-rule pass, so selecting the full
      // walk would newly fire `generic-arity-mismatch`, `void-in-non-return-
      // position` and `result-in-schema-position` here — a different subject
      // than the rules this call wires (bug 0045 §Fix; §Non-goals). It DOES run
      // a name-resolution pass (bug 0262 §Fix, reference r5, reaching no
      // interior of its own since `invoke<T>` admits no generic/union/inline-
      // object shape at this position): withheld under the landed guard-1
      // shape when the position-rule pass above already drew an error, and
      // under clause (iv)(3), gated on `e.returnSchemaAbsorbed`, when the
      // `<T>` capture's angle-depth loop reached EOF still nested — so the
      // capture did not end at its own `>` — and its source window is already
      // covered by an error-severity diagnostic naming the real fault
      // (bug 0279).
      if (e.returnSchema !== null && e.returnSchema.trim().length > 0) {
        validateTypeAnnotation(e.returnSchema, {
          position: "value",
          rules: "inline-object-shape",
          range: e.range,
          absorbed: e.returnSchemaAbsorbed,
          absorptionWindow: () => captureAbsorptionWindow(e.range, e.args[0]),
        }, refs, file, out);
      }
      for (const arg of [...e.args, ...callWithClauseValues(e)]) {
        walkExpr(arg, scope, refs, file, out);
      }
      return;
    case "member": {
      // A `Enum.Variant` member access (target is a bare enum name) to a variant
      // the enum does not declare is `theta/parse/unknown-variant` at parse time
      // (schemas.md §Variant access).
      if (e.target.kind === "ident") {
        const variants = refs.enums.get(e.target.name);
        if (variants !== undefined) {
          pushDiag(
            out,
            checkVariantAccess(
              {
                enumName: e.target.name,
                variant: e.field,
                knownVariants: [...variants],
              },
              { file, range: e.range },
            ),
          );
        }
      }
      walkExpr(e.target, scope, refs, file, out);
      return;
    }
    case "index":
      walkExpr(e.target, scope, refs, file, out);
      walkExpr(e.index, scope, refs, file, out);
      return;
    case "object":
      checkObjectExpr(e, refs, file, out, bareObjectAllowed);
      for (const field of e.fields) {
        walkExpr(field.value, scope, refs, file, out);
      }
      return;
    case "match":
      walkExpr(e.scrutinee, scope, refs, file, out);
      for (const arm of e.arms) {
        // The field-NAME half (bug 0226 §Fix) runs against the head's
        // declaration before the body is walked, so a refused head's arm
        // still reaches its binder scope below without a diagnostic-order
        // dependency on the body's own checks.
        checkPatternObjectFields(arm.pattern, refs, file, out);
        walkExpr(arm.body, scope, refs, file, out);
      }
      return;
    case "result-ctor":
      walkExpr(e.arg, scope, refs, file, out);
      return;
    case "method-call":
      walkExpr(e.target, scope, refs, file, out);
      for (const arg of e.args) {
        walkExpr(arg, scope, refs, file, out);
      }
      return;
    case "array":
      for (const el of e.elements) {
        walkExpr(el, scope, refs, file, out);
      }
      return;
    case "query":
      // A `@`-query's `${…}` interpolations are captured verbatim, so a `match`
      // or nested `@`-query inside one is invisible to the whole-document walk
      // above; re-lex and inspect them here so the forms expressions.md §"Not
      // supported" forbids inside `${…}` are rejected at load time.
      checkQueryTemplateInterpolations(e, file, out);
      checkQueryAnnotation(e, refs, file, out);
      return;
    case "par-for":
      // `break` / `continue` in a `par for` body are already rejected by
      // CTRL-4 (`theta/parse/par-break-continue`); marking the body
      // `inLoop: true` here keeps `checkBreakStatement` /
      // `checkContinueStatement` from ALSO drawing their generic
      // outside-a-loop diagnostic for the same statement.
      walkExpr(e.iterand, scope, refs, file, out);
      if (e.max !== null) {
        walkExpr(e.max, scope, refs, file, out);
      }
      walkBlock(e.body, { ...scope, inLoop: true, topLevel: false }, refs, file, out);
      return;
    case "block":
      // Descend into the block's own body so a diagnostic raised by a nested
      // statement or its tail still surfaces (bug 0082 §Fix) — the
      // block is not a loop, so only `topLevel` is cleared, mirroring the
      // `if`/`while` arms above.
      walkBlock(e.body, { ...scope, topLevel: false }, refs, file, out);
      return;
    default:
      // number / string / bool / null — no nested expressions.
      return;
  }
}

export { checkParamsDefaultNames, checkStructural, hoistEnumVariants, rangeKey };
export type { StructuralRefs };
