// Whole-document structural AST checks: the statement/expression walk and its
// orchestration (`checkStructural`). Schema-graph checks live in
// schema-graph-checks.ts; params-default name checks in params-default-names.ts.

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
import { checkEnumDeclaration, checkVariantAccess } from "./schema-declarations";
import { checkSchemaDeclarationGraph, checkSchemaFieldTypes } from "./schema-graph-checks";
import { checkObjectLiteralFields } from "./literal-sublanguage";
import { unresolvedNamedTypeDiagnostic, validateTypeAnnotation } from "./annotation-validation";
import type { PropagationCapture, QueryPropagation } from "./query-schema-resolve";
import { collectUnresolvedNamedTypes } from "./body-type-lowering";
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
  Stmt,
  Block,
} from "./theta-ast";
import {
  bareObjectLiteralDiagnostic,
  callWithClauseValues,
  checkQueryTemplateInterpolations,
} from "./theta-document";
import { checkQueryAnnotation } from "./query-annotation-check";

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

export { checkStructural, hoistEnumVariants, pushDiag, rangeKey };
export { checkParamsDefaultNames } from "./params-default-names";
export type { StructuralRefs };
