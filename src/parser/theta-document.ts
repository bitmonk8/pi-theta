// V19a / V19a-T — the whole-`.theta`/`.thetalib` program-parser seam.
//
// This module orchestrates the parser seam, delegates body parsing and structural
// checks to sibling modules, and re-exports their seams and the `theta-ast` contract:
// `parseThetaDocument(source, deps)` parses the *entire* `.theta` / `.thetalib`
// file into an executable body statement-list AST — the grammar.md
// §"Block expressions" `ThetaBody ::= Stmt* Expr?` production — alongside the
// parsed frontmatter, and aggregates the whole-file multi-error diagnostic set
// by delegating each top-level statement / declaration to the existing V-slice
// parse-checkers over the real AST (`cka-49`,
// implementation-notes.md §Parser *Contract*).
//
// The body AST this seam produces is the node stream `V19c`'s statement
// executor walks and `V19e`'s composition producer parses; the AST node types
// re-exported here are that cross-leaf contract.
//
// Spec: implementation-notes.md (§Parser *Contract*), grammar.md
// (§"Block expressions", §"fn declarations", §"schema X by <field>",
// §"/// placement", §"Newline continuation"), bindings.md, control-flow.md,
// functions.md, return.md, expressions.md, frontmatter.md, descriptions.md,
// schemas.md, imports.md, invocation.md, diagnostics.md.

import type { Diagnostic, Position, SourceRange } from "../diagnostics/diagnostic";
import { assembleDiagnostics } from "../diagnostics/diagnostic";
import { lexTheta, type LexResult, type ThetaSource, type Token } from "../lexer/lexer";
import { decodeUtf8, normaliseNewlines, validateUtf8Encoding } from "../lexer/encoding";
import {
  checkThetaLibTopLevelForm,
  EXPORT_IN_THETA_CODE,
  EXPORT_IN_THETA_HINT,
  EXPORT_IN_THETA_MESSAGE,
  EXPORT_NOT_TOP_LEVEL_CODE,
  EXPORT_NOT_TOP_LEVEL_HINT,
  EXPORT_NOT_TOP_LEVEL_MESSAGE,
  IMPORT_NOT_TOP_LEVEL_CODE,
  IMPORT_NOT_TOP_LEVEL_HINT,
  IMPORT_NOT_TOP_LEVEL_MESSAGE,
  type ThetaLibTopLevelForm,
} from "./imports";
import {
  parseFrontmatter,
  readParamFieldNames,
  type FrontmatterBodyTypes,
  type FrontmatterBlock,
  type ParsedFrontmatter,
  type ParsedToolLoop,
  type ParsedRespondRepair,
} from "./frontmatter";
import { checkDocCommentPlacement, joinDocComment } from "./descriptions";
import type { EnumValueKind } from "./schema-declarations";
import { parseTypeExpression } from "./type-grammar";
import { collectPatternBinderNames as collectPatternBindings } from "./match-result";
import { checkTypeLayer, letAnnotationToCompatType } from "./type-layer-checks";
import {
  annotationSourceIsNotTypeExpression,
  BUILTIN_VALUE_NAMES,
  reservedKeywordAsIdentifierDiagnostic,
  unresolvedNamedTypeDiagnostic,
  withBuiltinErrorModelNames,
} from "./annotation-validation";
import { resolveQuerySchemas, type QueryPropagation } from "./query-schema-resolve";
import {
  buildBodyTypeSchemas,
  collectUnresolvedNamedTypes,
  type SchemaSlugCollision,
} from "./body-type-lowering";
import {
  splitTopLevel,
  type ParamFieldInput,
} from "./params";
// Bug 0072 (tool-calls.md §"Argument shape"): the parser's lexical call-site
// walk emits the shared arity check's ARITY arm directly (no `argumentSource`,
// so only that arm can fire from this site) instead of re-deriving the
// message/severity locally — the same parser→runtime reuse pattern as
// `checkDiscardedQueryResult` in structural-checks.ts.
import { checkToolCallArguments } from "../runtime/tool-call-static-checks";
// A `@`-query template body is captured verbatim at parse time; its `${…}`
// interpolations are re-lexed here (the same lexer the render path drives) so
// the parse-time whole-document walk can reject the forms expressions.md
// §"Not supported" forbids inside `${…}` (a nested `match` or `@`-query).
// The static-body QRY-6 warning is emitted by BodyParser in body-parser.ts.
import { lexQueryTemplate } from "../render/query-render";
// RFC 0009: the call-site `with` clause's in-process-callee rejection strings
// live beside the other invoke parse diagnostics; the `.thetalib` half of that
// one judgement is emitted here (invocation.md INV-8).
import {
  WITH_CLAUSE_IN_PROCESS_CALLEE_CODE,
  WITH_CLAUSE_IN_PROCESS_CALLEE_HINT,
  withClauseInProcessCalleeMessage,
} from "./invoke-diagnostics";
import { runtimeToolPresentedNames, RUNTIME_TOOL_SIGNATURES, type RuntimeToolName } from "./runtime-tools";
import { thetaDefaultName } from "./callable-set";
import type { CompatType } from "./type-compat";
import type {
  CallExpr,
  InvokeExpr,
  QueryExpr,
  MemberExpr,
  ObjectExpr,
  Expr,
  CallWithClause,
  SubagentSessionConfig,
  FnDecl,
  SchemaFieldSource,
  SchemaDecl,
  EnumDecl,
  DocComment,
  Stmt,
  Block,
  ThetaBody,
  ThetaDocument,
  ParseThetaDocumentDeps,
} from "./theta-ast";
import { BodyParser } from "./body-parser";
import {
  checkParamsDefaultNames,
  checkStructural,
  hoistEnumVariants,
  rangeKey,
  type StructuralRefs,
} from "./structural-checks";

export * from "./theta-ast";
export { BodyParser } from "./body-parser";
export { checkParamsDefaultNames, checkStructural, hoistEnumVariants, rangeKey } from "./structural-checks";
export type { StructuralRefs } from "./structural-checks";

// Shared helpers stay at the document seam; sibling modules call them only
// during parsing, never during module initialisation.
export {
  bareObjectLiteralDiagnostic,
  blockExprMissingTailDiagnostic,
  capitalisedPatternHeadDiagnostic,
  checkQueryAnnotation,
  checkQueryTemplateInterpolations,
  classifyEnumValueToken,
  nullExpr,
  positionToOffset,
  schemaTypeNotExpressionDiagnostic,
};

/**
 * The call-site `with` clause's value expressions on a call/invoke node, in
 * source order (empty when no clause is written). Every expression walker that
 * recurses a call node's `args` recurses these too: a clause value is an
 * ordinary expression position with an argument's exact rules (invocation.md
 * INV-6), so names, types and effects inside it must be judged by the same
 * passes — the alternative is a position the whole checker is blind to.
 */
export function callWithClauseValues(
  expr: CallExpr | InvokeExpr,
): readonly Expr[] {
  return expr.withClause === undefined
    ? []
    : expr.withClause.fields.map((field) => field.value);
}

/**
 * Parse an entire `.theta` / `.thetalib` source into `{ frontmatter, body,
 * diagnostics }`: the whole file — not a single expression — is walked into the
 * executable `ThetaBody` statement-list AST, and the delegated V-slice
 * parse-checkers' diagnostics are aggregated in one pass, sorted `(file, line,
 * col)`, per implementation-notes.md §Parser *Contract* (`cka-49`).
 */
export function parseThetaDocument(
  source: ThetaSource,
  deps: ParseThetaDocumentDeps,
): ThetaDocument {
  const file = source.path;

  // Bug 0410 §Fix option 1 — validate the RAW, pre-decode bytes before
  // `decodeUtf8` runs. `decodeUtf8` uses a non-fatal `TextDecoder` that
  // silently substitutes U+FFFD for invalid sequences, so a gate placed after
  // it (or fed re-encoded text, as the `lexTheta` call below is) can never
  // observe the original invalid byte or its offset. lexical.md §Encoding
  // requires `theta/load/invalid-encoding` naming the zero-based offset of
  // the first invalid byte in the ORIGINAL file content, offset 0 for a
  // non-UTF-8 BOM — both only recoverable from `source.bytes` itself.
  const encodingDiag = validateUtf8Encoding(source.bytes, file, deps.systemNote);
  if (encodingDiag !== undefined) {
    return {
      frontmatter: null,
      body: { statements: [], tail: null },
      diagnostics: [encodingDiag],
      deliveredDiagnostics: [encodingDiag],
    };
  }

  const text = normaliseNewlines(decodeUtf8(source.bytes));

  // Separate the optional `---` frontmatter fence from the executable body.
  // A fence-less source is body-only: the load-time "frontmatter is required"
  // obligation is the loader's (V6*), not the whole-file body parser's, and
  // every V19a-T fixture supplies a bare body — so parsing frontmatter only
  // when a fence is present keeps a spurious `missing mode:` diagnostic out of
  // the aggregated set.
  const split = splitFrontmatter(text);

  // V1a's newline-continuation lexer is the integration witness for statement
  // joining: its `stmt-sep` tokens mark the boundaries at depth 0, and it
  // swallows the newline at every continuation trigger (open bracket,
  // trailing/leading operator, trailing comma). The parser splits any residual
  // over-joined line by grammar completion — notably the postfix `?`, which
  // the lexer treats as a trailing trigger but which never continues a
  // statement.
  //
  // The body is lexed + parsed BEFORE the frontmatter so the whole-file
  // named-type set (body `schema`/`enum` decls + imported symbols) is available
  // to the frontmatter `params:` named-type resolution and the `system:`
  // interpolation field checks, both of which resolve a `NamedType` whole-file
  // (a frontmatter → body forward reference resolves). The body parse does not
  // depend on the frontmatter, so the reorder is behaviour-preserving.
  const lex = lexTheta({ path: file, bytes: encodeSource(split.bodyText) }, deps.systemNote);

  // The `params:` field wire names, extracted from the frontmatter BEFORE the
  // body parse so they seed `BodyParser`'s mutability map as immutable at file
  // scope (bug 0370 §Fix F3 — a `params:` field is a parameter, bindings.md:31,
  // always immutable). The authoritative frontmatter parse below needs the
  // body's `bodyTypes` to resolve `params:` NAMED types, so it cannot run
  // first; this early pass reads only the YAML field KEYS — which no `bodyTypes`
  // resolution touches — via the keys-only `readParamFieldNames` reader, so the
  // full pipeline (with its diagnostics) runs once, in the authoritative parse
  // below.
  const paramFieldNames = new Set<string>();
  if (split.frontmatter !== null) {
    for (const name of readParamFieldNames(split.frontmatter)) {
      if (name !== "_") {
        paramFieldNames.add(name);
      }
    }
  }

  const parser = new BodyParser(lex.tokens, file, split.bodyText, paramFieldNames);
  const body = parser.parseBody();

  const isTemplateLine = templateProseLineSpans(lex.tokens);

  // The `///` doc-comment runs are lexed away (the lexer emits no comment
  // tokens), so they are recovered by a line scan over the body text and
  // merged into the statement list in source order; each run's placement is
  // delegated to V5c's `checkDocCommentPlacement` over the following
  // production. `isTemplateLine` (above) excludes template-interior lines so
  // this recovery never reads rendered prompt prose as a doc comment (bug
  // 0411 §Fix).
  const docScan = scanDocComments(split.bodyText, file, body.statements, isTemplateLine);
  // Attach schema-DECL / enum-DECL / FIELD descriptions to their anchor decls
  // BEFORE the floating `DocComment` nodes are folded back in, so every
  // downstream consumer of `statements` (params loweredSchema, the binder
  // envelope, `lowerQueryResponseSchema`) sees the described decls without a
  // second pass (A1 + B1: docs/bugs/0358-… §Fix).
  const described = attachDocDescriptions(body.statements, docScan.attachments);
  const mergedStatements = mergeByLine(described, docScan.nodes);

  // V13b integration — resolve each INDIRECT typed query's response schema from
  // its surrounding type context (QRY-2) and collect the QRY-4 explicit-schema-
  // mismatch warnings, BEFORE the downstream checkers and producers read
  // `QueryExpr.schema`. Option B (tree-rebuild): the returned body carries the
  // inferred `schema` on each resolvable null-schema query, so
  // `QueryExpr.schema: string` stays the single source of truth. The direct
  // `let x: T = @` fast path was already propagated by `parseLet`, so only
  // null-schema queries at a resolvable sink change here.
  const resolvedQuery = resolveQuerySchemas(
    { statements: mergedStatements, tail: body.tail },
    file,
  );
  const statements = resolvedQuery.body.statements;
  const resolvedTail = resolvedQuery.body.tail;

  const { bodyTypes, diagnostics: bodyTypeDiags } = collectBodyTypes(statements, file);

  const frontmatterDiags: Diagnostic[] = [...bodyTypeDiags];
  let frontmatter: ParsedFrontmatter | null = null;
  // The located `params:` fields (each with its own `range` and verbatim
  // `defaultSource`) and the ranges the frontmatter parse already refused,
  // feeding the `params:`-default name-resolution check below.
  let paramFields: readonly ParamFieldInput[] = [];
  const frontmatterRefusedRanges = new Set<string>();
  if (split.frontmatter !== null) {
    const fm = parseFrontmatter(split.frontmatter, {
      file,
      modelMatcher: deps.modelMatcher,
      bodyTypes,
    });
    frontmatter = fm.frontmatter ?? null;
    paramFields = fm.paramFields;
    for (const d of fm.diagnostics) {
      if (d.severity === "error" && d.range !== undefined) {
        frontmatterRefusedRanges.add(rangeKey(d.range));
      }
    }
    frontmatterDiags.push(...fm.diagnostics);
  }

  const wholeDocumentDiags = runWholeDocumentChecks(
    statements,
    resolvedTail,
    bodyTypes,
    file,
    resolvedQuery.propagations,
    [...lex.diagnostics, ...parser.diagnostics],
    frontmatter,
    paramFields,
    frontmatterRefusedRanges,
  );

  const diagnostics = assembleDiagnostics([
    frontmatterDiags,
    lex.diagnostics,
    parser.diagnostics,
    docScan.diagnostics,
    ...wholeDocumentDiags,
    resolvedQuery.diagnostics,
  ]);

  // RFC 0001 FN-7 — resolve each top-level `subagent fn`'s spawned-session
  // config now that the enclosing frontmatter is parsed: inherit the enclosing
  // theta's config, then apply the `with { … }` clause's per-key overrides. A
  // `.thetalib` helper's inheritance resolves against the calling theta at
  // dispatch (FN-9), so here it carries only its own `with`-clause overrides.
  const configuredStatements = attachSubagentSessionConfigs(statements, frontmatter);

  return {
    frontmatter,
    body: { statements: configuredStatements, tail: resolvedTail },
    diagnostics,
    deliveredDiagnostics: lex.diagnostics,
  };
}

/** Run the whole-document checker battery in diagnostic order after frontmatter parsing. */
function runWholeDocumentChecks(
  statements: readonly Stmt[],
  resolvedTail: Expr | null,
  bodyTypes: FrontmatterBodyTypes,
  file: string,
  queryPropagations: readonly QueryPropagation[],
  priorDiagnostics: readonly Diagnostic[],
  frontmatter: ParsedFrontmatter | null,
  paramFields: readonly ParamFieldInput[],
  frontmatterRefusedRanges: ReadonlySet<string>,
): readonly Diagnostic[][] {
  // Run the implemented structural (AST-shape) parse-checkers over the whole
  // parsed body (C2a wiring): the delegated V-slice checkers that need only the
  // parse-shape, no type inference (control-flow, `fn` placement/first-class
  // use, `let` initialiser, `mut`-context member/index assignment is emitted
  // inline by the parser, bare `return`, unreachable code, empty object
  // schemas, and the position-sensitive type-grammar checks over declared type
  // sources).
  const structuralDiags = checkStructural(
    { statements, tail: resolvedTail },
    bodyTypes,
    file,
    // bug 0262 §Fix clause (iv)(2): the withhold at every propagating capture
    // is read off QRY-2's own report of which written annotation reached which
    // query, so the two passes cannot disagree about the propagation set.
    queryPropagations,
    // bug 0262 §Fix clause (iv)(3): the artefact-suppression predicate needs
    // both PRIOR passes' error-severity diagnostics — the lexer's own
    // (`single-line-if`) and the body parser's own (`fn-param-list-unclosed`)
    // — rather than one of them alone, since the two measured artefact
    // fixtures each draw a diagnostic from a different one of these two
    // arrays.
    priorDiagnostics,
  );

  // REQ-EXPR-7 (expressions.md §"Identifier resolution"); `checkUnknownIdentifiers`'s
  // own doc comment states the three-way judgement this walk makes, including
  // the value-position refusal `theta/parse/type-as-value`.
  //
  // `collectIdentRoots` itself is UNCHANGED (see its doc comment) — it is
  // called a SECOND time here, over the `schema`/`enum`-free statement list,
  // so `nonDeclarationRoots` holds every name a genuine value-binding source
  // contributes, while `identRoots` (below, and at `checkParamsDefaultNames`'s
  // call) keeps answering that function's own whole-file resolvability
  // question unchanged — reusing one function for both calls is what keeps
  // the two seeds from drifting apart. `typeOnlyNames` is then every declared
  // `schema` / `enum` name `nonDeclarationRoots` does NOT also claim — a name
  // only a declaration introduces and no value-binding source also binds.
  // `bodyTypes.imports` is deliberately excluded from that subtraction's
  // candidates: an imported symbol is resolution arm (3) (expressions.md:48),
  // a genuine value, and it is already inside `nonDeclarationRoots` regardless
  // (an `import` statement is not filtered out of the list below).
  const identRoots = collectIdentRoots(statements, frontmatter);
  const nonDeclarationRoots = collectIdentRoots(
    statements.filter((s) => s.kind !== "schema" && s.kind !== "enum"),
    frontmatter,
  );
  const typeOnlyNames = new Set<string>();
  for (const name of [...bodyTypes.schemas.keys(), ...bodyTypes.enums]) {
    if (!nonDeclarationRoots.has(name)) {
      typeOnlyNames.add(name);
    }
  }
  const unknownIdentDiags = checkUnknownIdentifiers(
    { statements, tail: resolvedTail },
    {
      roots: nonDeclarationRoots,
      typeOnlyNames,
      declaredEnums: bodyTypes.enums,
    },
    file,
  );

  // The `params:` default half's two NAME-resolution side conditions
  // (grammar.md `NamedValueLit`: "head is an enum name in scope, tail a declared
  // variant"). They are tested here rather than inside the default's own
  // is-literal check because that check judges a parsed node the literal
  // sublanguage builds without either identifier's text, and because this is the
  // one position that holds the parsed `params:` fields, the body's hoisted
  // enum-variant sets, and the whole-file identifier roots at once.
  const paramsDefaultNameDiags = checkParamsDefaultNames(
    paramFields,
    hoistEnumVariants(statements),
    identRoots,
    frontmatterRefusedRanges,
    file,
  );

  // The lexical call-site walk — bug 0003 (docs/bugs/0003-tool-arg-shape-rule-
  // not-enforced.md: the surviving RFC 0002 Pi-tool argument SHAPE rule,
  // `theta/parse/tool-arg-not-object-literal`) and bug 0016
  // (docs/bugs/0016-shadowed-tool-name-runtime-dispatch.md: a call of a
  // callable-set name shadowed by a local is erroneous —
  // `theta/parse/shadowed-callable-call` — and the §Object construction
  // bare-object carve-out is Pi-tool-callee-only, so the sole bare-object
  // argument of any OTHER callee is `theta/parse/bare-object-literal`). One
  // walk resolves each callee per expressions.md §"Identifier resolution" and
  // emits all three codes from that single judgement.
  const callSiteLexicalDiags = checkLexicalCallSites(
    { statements, tail: resolvedTail },
    frontmatter,
    file,
  );

  // C-bucket wiring (V20c): run the `type`-phase checkers against the `V20b`
  // per-expression static-type substrate so they fire in production
  // (non-boolean condition, non-array iterand, `?` misuse, array/return LUB,
  // integer narrowing, match-arm mismatch, non-indexable / object-index /
  // array-join, and — bug 0050 — a plain `fn` call's argument types). The
  // `params:` field wire names are the same whole-file local-binder source
  // `checkLexicalCallSites` above reads, so a frontmatter parameter shadows a
  // same-named top-level `fn` exactly as a `let` binding does; the declared
  // type source now rides beside the name in the SAME record, so a `params:`-
  // declared read also carries its declared type into the walk (bug 0192
  // §Fix) — one array of `{ name, typeSource }` records rather than two
  // parallel arrays, so the two channels cannot disagree about which
  // identifier a field binds.
  //
  // NAME-KEYING ADJUDICATION: `wireName` is the body-visible identifier at
  // this `params:` position — four independent sources agree, not merely a
  // convenient pick. (i) frontmatter.ts sets `wireName: name` in the SAME loop
  // iteration that pushes `ParamFieldInput`'s `name` from the same local
  // variable, so the two are byte-identical by construction. (ii)
  // src/extension/production-composition.ts's own comment on its tool-arg /
  // invoke-arg projection: 'wireName is the params: YAML key exactly as
  // written'. (iii) frontmatter-fields-b-and-templates.md §${param} templates:
  // '${param.field} paths use theta-side params names throughout — never an
  // as "WireName" rename target', consistent with the Runtime Value Model
  // invariant that theta code never sees wire names — that rename applies only
  // at the schema-field / inline-object positions (bug 0160), never at
  // `params:`. (iv) `checkLexicalCallSites`'s `rootLocals` above already keys
  // its root scope by `f.wireName` and is the shipped reader that resolves
  // body identifiers, so this is that same key.
  //
  // REJECTED: `paramFields` (`ParamFieldInput`, `name` + `typeSource`) is also
  // in scope here and carries identical values for this position, but it is
  // populated whenever a frontmatter BLOCK exists, whereas `frontmatter` is
  // `null` when the frontmatter does not register — reading it instead would
  // silently widen bug 0050's shadowing set for a document with no registered
  // frontmatter, a behaviour change this report does not claim.
  // RFC 0011 (seam sheet §0 C6): derive the runtime-tool success-type map
  // from `frontmatter.tools` so the type layer can structurally type
  // `let u = context_usage()?` et al. GOV-15 inert: the map is empty for
  // every 1.0.0-clean file (none declares the three names). The second
  // sanctioned `letAnnotationToCompatType` call site (bug 0130 flag F-3;
  // the first is the `let`-annotation arm in type-layer-checks.ts).
  const runtimeToolSuccessTypes = buildRuntimeToolSuccessTypes(
    frontmatter?.tools,
  );
  const typeLayerDiags = checkTypeLayer(
    { statements, tail: resolvedTail },
    file,
    (frontmatter?.params?.fields ?? []).map((f) => ({ name: f.wireName, typeSource: f.type })),
    runtimeToolSuccessTypes,
  );

  // imports.md §"`.thetalib` file rules": a `.thetalib` top level may contain only
  // `import` / `export` / `schema` / `enum` / `fn` declarations; a bare
  // statement, a `let` binding, or a top-level query is
  // `theta/parse/thetalib-top-level-statement`. The check keys off the file's
  // `.thetalib` extension (byte-exact lowercase), so it never fires for a `.theta`
  // (IMP-4).
  const thetalibTopLevelDiags = file.endsWith(".thetalib")
    ? checkThetaLibTopLevel({ statements, tail: resolvedTail }, file)
    : [];

  // RFC 0009 (invocation.md INV-8 default-reject): the `.thetalib` half of the
  // call-site `with` clause's callee classification. A lib body holds no
  // callable set, so the classification is vacuous and every clause-bearing
  // bare-identifier call there is rejected at the library's own parse — keyed on
  // the same `.thetalib` discriminator as the top-level-form check above. The
  // `.theta` half lives in the load pass's classifying loop
  // (`checkInvokeStaticResolution`), which is where the frozen callable set is.
  const thetalibCallWithClauseDiags = file.endsWith(".thetalib")
    ? checkThetaLibCallWithClauses({ statements, tail: resolvedTail }, file)
    : [];

  // Bug 0446 §Fix Option 1 (widening bug 0431's top-level-only `.theta`
  // refusal): a from-bearing `export … from` (non-empty path) is refused at
  // ANY statement depth, in BOTH hosts — a `.theta` export is never
  // importable regardless of nesting, and a `.thetalib` export is legal only
  // at the top level (the same position `thetalibTopLevelDiags` above already
  // keys its own rule on). Bug 0447 §Fix Option 1 widens the SAME recursive
  // walk to a from-bearing `import … from` (non-empty path): nested in EITHER
  // host it is refused with `theta/parse/import-not-top-level`, no host split
  // — a nested import is never resolved or bound in a `.theta` or a
  // `.thetalib` alike, only a top-level import stays legal. One recursive walk
  // drives both statement kinds and both hosts. The ImportDecl / ExportDecl
  // nodes themselves are left untouched so the shape rules
  // (import-missing-from-clause, import-malformed-specifier-list) and the
  // reserved-keyword rule keep firing on the same statement at any depth.
  const statementPlacementDiags = checkStatementPlacement({ statements, tail: resolvedTail }, file);

  return [
    structuralDiags,
    unknownIdentDiags,
    paramsDefaultNameDiags,
    callSiteLexicalDiags,
    typeLayerDiags,
    thetalibTopLevelDiags,
    thetalibCallWithClauseDiags,
    statementPlacementDiags,
  ];
}

/**
 * Attach a resolved `sessionConfig` to every top-level `subagent fn` (RFC 0001
 * FN-7). Non-`fn` statements and ordinary `fn`s pass through unchanged; a
 * `subagent fn` is re-emitted with its inherit-then-`with`-override config so
 * the runtime executor reads a self-contained node.
 */
function attachSubagentSessionConfigs(
  statements: readonly Stmt[],
  frontmatter: ParsedFrontmatter | null,
): readonly Stmt[] {
  return statements.map((stmt) => {
    if (stmt.kind !== "fn" || stmt.subagent !== true) {
      return stmt;
    }
    return { ...stmt, sessionConfig: resolveSubagentSessionConfigAt(stmt, frontmatter) };
  });
}

/**
 * Resolve a `subagent fn`'s spawned-session config (RFC 0001 FN-7 / FN-9):
 * start from the given enclosing frontmatter's inherited `model` / `tools` /
 * `tool_loop` / `respond_repair`, then overwrite each key named in the
 * `with { … }` clause. All five session-config keys take effect (FN-7):
 * `model` / `tools` / `system` plus the two loop budgets `tool_loop` /
 * `respond_repair`.
 *
 * Called from two seams: at parse time (`attachSubagentSessionConfigs`),
 * against the `subagent fn`'s own enclosing theta — a `.thetalib` helper has
 * no frontmatter of its own, so it passes `null` and projects only its
 * `with`-clause overrides here; and, for a `.thetalib` helper dispatched from
 * another theta, again at dispatch time (FN-9) against a DIFFERENT enclosing
 * frontmatter — the CALLING theta's — so the spawned session inherits the
 * caller's config with the same `with { … }` overrides re-applied on top. For
 * an in-file `subagent fn`, the dispatch-time frontmatter is already the one
 * used at parse time, so re-resolving reproduces the parse-time result.
 */
export function resolveSubagentSessionConfigAt(
  fn: FnDecl,
  frontmatter: ParsedFrontmatter | null,
): SubagentSessionConfig {
  const config: {
    model?: string;
    tools?: readonly string[];
    system?: string;
    toolLoop?: ParsedToolLoop;
    respondRepair?: ParsedRespondRepair;
    toolsOverridden?: boolean;
  } = {};
  if (frontmatter?.model !== undefined) {
    config.model = frontmatter.model;
  }
  if (frontmatter?.tools !== undefined) {
    config.tools = frontmatter.tools;
  }
  if (frontmatter?.toolLoop !== undefined) {
    config.toolLoop = frontmatter.toolLoop;
  }
  if (frontmatter?.respondRepair !== undefined) {
    config.respondRepair = frontmatter.respondRepair;
  }
  for (const field of fn.withClause ?? []) {
    if (field.key === "model") {
      const v = stringExprValue(field.value);
      if (v !== undefined) {
        config.model = v;
      }
    } else if (field.key === "tools") {
      config.tools = toolNameList(field.value);
      config.toolsOverridden = true;
    } else if (field.key === "system") {
      const v = stringExprValue(field.value);
      if (v !== undefined) {
        config.system = v;
      }
    } else if (field.key === "tool_loop") {
      const loop = toolLoopValue(field.value);
      if (loop !== undefined) {
        config.toolLoop = loop;
      }
    } else if (field.key === "respond_repair") {
      const repair = respondRepairValue(field.value);
      if (repair !== undefined) {
        config.respondRepair = repair;
      }
    }
  }
  return config;
}

/**
 * The `{ maxRounds }` a `with { tool_loop: { max_rounds: N } }` value expression
 * denotes (RFC 0001 FN-7), mirroring the frontmatter `tool_loop:` block. A
 * non-object / absent `max_rounds` yields `undefined` (the inherited value then
 * stands).
 */
function toolLoopValue(expr: Expr): ParsedToolLoop | undefined {
  const maxRounds = objectFieldNumber(expr, "max_rounds");
  return maxRounds === undefined ? undefined : { maxRounds };
}

/**
 * The `{ attempts }` a `with { respond_repair: { attempts: N } }` value
 * expression denotes (RFC 0001 FN-7), mirroring the frontmatter
 * `respond_repair:` block. A non-object / absent `attempts` yields `undefined`.
 */
function respondRepairValue(expr: Expr): ParsedRespondRepair | undefined {
  const attempts = objectFieldNumber(expr, "attempts");
  return attempts === undefined ? undefined : { attempts };
}

/** The numeric literal value of an object-literal field `name`, else `undefined`. */
function objectFieldNumber(expr: Expr, name: string): number | undefined {
  if (expr.kind !== "object") {
    return undefined;
  }
  const field = expr.fields.find((f) => f.name === name);
  if (field === undefined || field.value.kind !== "number") {
    return undefined;
  }
  const parsed = Number(field.value.text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** The literal string value of a `with`-clause value expression, else `undefined`. */
function stringExprValue(expr: Expr): string | undefined {
  return expr.kind === "string" ? expr.value : undefined;
}

/**
 * The tool-name list a `with { tools: […] }` value expression denotes: each
 * array element is a bare identifier (a callable name) or a `.theta`/`.thetalib`
 * path string literal.
 */
function toolNameList(expr: Expr): readonly string[] {
  if (expr.kind !== "array") {
    return [];
  }
  const names: string[] = [];
  for (const el of expr.elements) {
    if (el.kind === "ident") {
      names.push(el.name);
    } else if (el.kind === "string") {
      names.push(el.value);
    }
  }
  return names;
}

/**
 * Map a top-level `.thetalib` statement AST kind to its `ThetaLibTopLevelForm` for the
 * permitted-form check (imports.md §"`.thetalib` file rules"). `import` / `export` /
 * `schema` / `enum` / `fn` are the permitted forms; a `let` binding, a bare
 * query, and any other statement are non-permitted. A `///` doc-comment carries
 * no executable form and is not checked.
 */
function thetalibFormOf(stmt: Stmt): ThetaLibTopLevelForm | null {
  switch (stmt.kind) {
    case "import":
      return "import";
    case "export":
      return "export";
    case "schema":
      return "schema";
    case "enum":
      return "enum";
    case "fn":
      return "fn";
    case "let":
      return "let";
    case "query":
      return "query";
    case "doc-comment":
      return null;
    default:
      return "statement";
  }
}

/**
 * Check a `.thetalib` file's top-level forms, emitting
 * `theta/parse/thetalib-top-level-statement` for every non-permitted top-level form
 * (imports.md §"`.thetalib` file rules"). A trailing tail expression at the top
 * level is a bare statement and is likewise non-permitted.
 */
function checkThetaLibTopLevel(block: Block, file: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const stmt of block.statements) {
    const form = thetalibFormOf(stmt);
    if (form === null) {
      continue;
    }
    const diag = checkThetaLibTopLevelForm(form, { file, range: stmt.range });
    if (diag !== undefined) {
      diagnostics.push(diag);
    }
  }
  if (block.tail !== null) {
    const diag = checkThetaLibTopLevelForm("statement", {
      file,
      range: block.tail.range,
    });
    if (diag !== undefined) {
      diagnostics.push(diag);
    }
  }
  return diagnostics;
}

/**
 * Reject every clause-bearing bare-identifier call in a `.thetalib` body with
 * `theta/parse/with-clause-in-process-callee` (invocation.md INV-8's
 * default-reject arm; code-registry-parse.md row 4) — except a call of one of
 * the library's OWN top-level `subagent fn`s (RFC 0009 Erratum B, RFC 0012
 * §10: a `subagent fn` body is a child process, the clause's third legal
 * surface, and the `subagent` modifier is a declaration-site fact this parse
 * has).
 *
 * A `.thetalib` carries no frontmatter and can therefore never hold a callable
 * set, so the classification INV-8 states over the caller's frozen callable set
 * is VACUOUS here: every OTHER bare-identifier callee is a set MISS by
 * construction and draws the default arm — an imported name included: the lib
 * parse cannot see the declaring library's fn kind, and the load pass's
 * deferred import check walks the importing theta's body only, so a lib-side
 * clause on an imported `subagent fn` stays refused (recorded posture). That
 * is why the lib half is decided at the library's OWN parse rather than in the
 * load pass's classifying loop. `invoke(...)` inside a lib `fn` body is an
 * `InvokeExpr`, never a `CallExpr`, so it stays clause-legal and its mode gate
 * rides the load pass or the runtime arm.
 *
 * Keyed off the same byte-exact lowercase `.thetalib` discriminator
 * `checkThetaLibTopLevel` above uses, over the same statement tree.
 */
function checkThetaLibCallWithClauses(block: Block, file: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  const subagentFns = new Set<string>();
  for (const stmt of block.statements) {
    if (stmt.kind === "fn" && stmt.subagent === true) {
      subagentFns.add(stmt.name);
    }
  }
  for (const call of collectClauseBearingCalls(block)) {
    if (subagentFns.has(call.callee)) {
      continue;
    }
    // `call.withClause` is what `collectClauseBearingCalls` filters on.
    const clause = call.withClause as CallWithClause;
    out.push({
      severity: "error",
      code: WITH_CLAUSE_IN_PROCESS_CALLEE_CODE,
      file,
      // The callee is fine; the CLAUSE is the fault — so the range is the
      // clause's, not the call's (matching the load-pass default arm).
      range: clause.range,
      message: withClauseInProcessCalleeMessage(call.callee),
      hint: WITH_CLAUSE_IN_PROCESS_CALLEE_HINT,
    });
  }
  return out;
}

/**
 * Every `CallExpr` carrying a call-site `with` clause anywhere in `block`'s
 * statement tree. The descent mirrors `walkBlockForStatementPlacement`'s reach
 * below — every `if`/`while`/`for`/`fn` body (a lib's clause-bearing call is
 * necessarily inside an `fn` body, since `theta/parse/thetalib-top-level-statement`
 * forbids the rest), every `par for` body, every block expression, and every
 * `subagent fn` `with`-clause value — and stops at the document body AST for the
 * same reason that walk does (a `query` template's text is re-lexed by a
 * separate throwaway parse).
 */
function collectClauseBearingCalls(block: Block): CallExpr[] {
  const out: CallExpr[] = [];
  walkCallSiteNodes(
    block,
    (node) => {
      if (node.kind === "call" && node.withClause !== undefined) {
        out.push(node);
      }
    },
    { includeFnWithClauseValues: true },
  );
  return out;
}

/**
 * A node kind every call-site walk below visits: `walkCallSiteNodes` calls
 * `visit` once, in source order, for each one it reaches, before descending
 * into its children (a `CallExpr` / `InvokeExpr`'s argument list plus its
 * call-site `with` clause values, RFC 0009; an `ObjectExpr`'s field values; a
 * `MemberExpr`'s target). A `MethodCallExpr` (`target.method(args)`) is
 * deliberately excluded: `method` names a stdlib member, never a
 * callable-set name, so no consumer treats it as a call site — its target
 * and args are still reached, just not visited.
 */
export type CallSiteNode = CallExpr | InvokeExpr | ObjectExpr | MemberExpr;

/**
 * Widens `walkCallSiteNodes` beyond its default reach. Only
 * `collectClauseBearingCalls` above sets `includeFnWithClauseValues`; the
 * `extension-tool-reachability.ts` / `invoke-static-checks.ts` /
 * `subagent-fn-static-checks.ts` call-site walkers leave it unset.
 */
export interface CallSiteWalkOptions {
  /**
   * Also descend into a nested `fn` declaration's own `with { … }`
   * session-config field values (RFC 0001 FN-7) — distinct from a call's own
   * `with` clause, which every walk already reaches through
   * `expressionChildExprs`'s `call` / `invoke` arm.
   */
  readonly includeFnWithClauseValues?: boolean;
}

/**
 * Walk `block`'s whole statement / expression tree — every nested block
 * (`if` / `else` / `while` / `for` / `fn` bodies, and the `par for` /
 * block-expression bodies alike), condition, iterand, `par for` `max`
 * operand, `match` arm and call argument — calling `visit` once for every
 * `call` / `invoke` / `object` / `member` node reached. One traversal shared
 * by `collectClauseBearingCalls` above, `checkExtensionToolReachability`'s
 * code-side-call-name collector (`extension-tool-reachability.ts`),
 * `checkInvokeStaticResolution`'s call-site collector
 * (`invoke-static-checks.ts`), and `checkSubagentFnStaticResolution`'s
 * `subagent fn` self-reference walk (`subagent-fn-static-checks.ts`): a
 * second, independently written walker would drift out of sync as the
 * `Stmt` / `Expr` node shapes evolve (bug 0071); each caller supplies its own
 * `visit` to decide what a reached node contributes. A block-expression body
 * is walked exactly like a statement-level block — a call site inside it is
 * as reachable as one a brace-level up, so skipping it would open a blind
 * spot in every check downstream of the walk. Totality rests on the explicit
 * arms below, never on their `default` cases: a union member reaching a
 * `default` is walked as a leaf and its sub-tree is not visited.
 */
export function walkCallSiteNodes(
  block: Block,
  visit: (node: CallSiteNode) => void,
  options?: CallSiteWalkOptions,
): void {
  walkCallSiteNodesInBlock(block, visit, options ?? {});
}

function walkCallSiteNodesInBlock(
  block: Block,
  visit: (node: CallSiteNode) => void,
  options: CallSiteWalkOptions,
): void {
  for (const stmt of block.statements) {
    walkCallSiteNodesInStmt(stmt, visit, options);
  }
  if (block.tail !== null) {
    walkCallSiteNodesInExpr(block.tail, visit, options);
  }
}

function walkCallSiteNodesInStmt(
  stmt: Stmt,
  visit: (node: CallSiteNode) => void,
  options: CallSiteWalkOptions,
): void {
  switch (stmt.kind) {
    case "let":
      if (stmt.init !== null) {
        walkCallSiteNodesInExpr(stmt.init, visit, options);
      }
      return;
    case "reassign":
      walkCallSiteNodesInExpr(stmt.value, visit, options);
      return;
    case "if":
      walkCallSiteNodesInExpr(stmt.condition, visit, options);
      walkCallSiteNodesInBlock(stmt.then, visit, options);
      if (stmt.otherwise !== null) {
        if ("statements" in stmt.otherwise) {
          walkCallSiteNodesInBlock(stmt.otherwise, visit, options);
        } else {
          walkCallSiteNodesInStmt(stmt.otherwise, visit, options);
        }
      }
      return;
    case "while":
      walkCallSiteNodesInExpr(stmt.condition, visit, options);
      walkCallSiteNodesInBlock(stmt.body, visit, options);
      return;
    case "for":
      walkCallSiteNodesInExpr(stmt.iterand, visit, options);
      walkCallSiteNodesInBlock(stmt.body, visit, options);
      return;
    case "fn":
      walkCallSiteNodesInBlock(stmt.body, visit, options);
      if (options.includeFnWithClauseValues === true) {
        for (const field of stmt.withClause ?? []) {
          walkCallSiteNodesInExpr(field.value, visit, options);
        }
      }
      return;
    case "return":
      if (stmt.operand !== null) {
        walkCallSiteNodesInExpr(stmt.operand, visit, options);
      }
      return;
    case "query":
      walkCallSiteNodesInExpr(stmt.query, visit, options);
      return;
    case "tool-call":
      walkCallSiteNodesInExpr(stmt.call, visit, options);
      return;
    case "invoke":
      walkCallSiteNodesInExpr(stmt.invoke, visit, options);
      return;
    case "expr":
      walkCallSiteNodesInExpr(stmt.expr, visit, options);
      return;
    default:
      // `break` / `continue` / `schema` / `enum` / `import` / `export` /
      // `doc-comment` carry no nested Block or Expr this walk needs to reach.
      return;
  }
}

function walkCallSiteNodesInExpr(
  e: Expr,
  visit: (node: CallSiteNode) => void,
  options: CallSiteWalkOptions,
): void {
  if (e.kind === "call" || e.kind === "invoke" || e.kind === "object" || e.kind === "member") {
    visit(e);
  }
  switch (e.kind) {
    case "par-for":
      walkCallSiteNodesInExpr(e.iterand, visit, options);
      if (e.max !== null) {
        walkCallSiteNodesInExpr(e.max, visit, options);
      }
      walkCallSiteNodesInBlock(e.body, visit, options);
      return;
    case "block":
      walkCallSiteNodesInBlock(e.body, visit, options);
      return;
    default:
      for (const child of expressionChildExprs(e)) {
        walkCallSiteNodesInExpr(child, visit, options);
      }
      return;
  }
}

/**
 * Check a from-bearing `export … from` / `import … from` statement's
 * PLACEMENT at every depth reachable from the document body AST, in both
 * hosts:
 *
 * - `export … from` (bug 0446 §Fix Option 1, widening bug 0431's
 *   top-level-only `.theta` refusal to the same recursive reach a nested
 *   position needs):
 *   - `.theta` host: `theta/parse/export-in-theta` at ANY depth — top level
 *     included — reusing bug 0431's code/message/hint unchanged. A `.theta`
 *     file is never importable regardless of where the statement sits, so
 *     one code covers every depth.
 *   - `.thetalib` host: `theta/parse/export-not-top-level` at a NESTED
 *     position only. A `.thetalib` top-level export stays legal (imports.md
 *     §Re-exports); nothing is emitted there.
 * - `import … from` (bug 0447 §Fix Option 1, the import sibling): a NESTED
 *   position draws `theta/parse/import-not-top-level` in EITHER host — no
 *   host split, unlike the export form. A nested import is never resolved
 *   (its path is never read by the load pass) or bound (its symbols never
 *   enter any scope) in a `.theta` or a `.thetalib` alike. A top-level
 *   import stays legal in both hosts (imports.md §Import statements) —
 *   nothing is emitted there.
 *
 * The descent mirrors the structural walker's own reach (`walkStatement` /
 * `walkBlock` / `walkExpr` above) — every `if`/`while`/`for`/`fn` body, every
 * `par for` body, every `subagent fn` `with`-clause value, and every
 * block-expression an arbitrarily nested expression tree can carry — so a
 * nested `export`/`import` cannot hide one level deeper in the document body
 * AST than this walk looks. Reach stops at the document body AST: a `query`
 * template's text is re-lexed by a separate throwaway parse this walk does
 * not traverse, so a statement hidden in a `${…}` interpolation is not
 * reached here. The from-less forms (`export { X }`, bug 0058's settled
 * ground; a from-less `import` is itself a shape fault,
 * `theta/parse/import-missing-from-clause`) are untouched at every depth —
 * their `path` is empty. Neither the ImportDecl nor the ExportDecl node is
 * otherwise altered, so the shape / reserved-keyword rules that also read
 * them keep firing on the same statement.
 */
function checkStatementPlacement(block: Block, file: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const isThetaLib = file.endsWith(".thetalib");
  walkBlockForStatementPlacement(block, true, file, isThetaLib, diagnostics);
  return diagnostics;
}

function walkBlockForStatementPlacement(
  block: Block,
  topLevel: boolean,
  file: string,
  isThetaLib: boolean,
  out: Diagnostic[],
): void {
  for (const stmt of block.statements) {
    if (stmt.kind === "export" && stmt.path !== "") {
      if (!isThetaLib) {
        out.push({
          severity: "error",
          code: EXPORT_IN_THETA_CODE,
          file,
          range: stmt.range,
          message: EXPORT_IN_THETA_MESSAGE,
          hint: EXPORT_IN_THETA_HINT,
        });
      } else if (!topLevel) {
        out.push({
          severity: "error",
          code: EXPORT_NOT_TOP_LEVEL_CODE,
          file,
          range: stmt.range,
          message: EXPORT_NOT_TOP_LEVEL_MESSAGE,
          hint: EXPORT_NOT_TOP_LEVEL_HINT,
        });
      }
    } else if (stmt.kind === "import" && stmt.path !== "" && !topLevel) {
      out.push({
        severity: "error",
        code: IMPORT_NOT_TOP_LEVEL_CODE,
        file,
        range: stmt.range,
        message: IMPORT_NOT_TOP_LEVEL_MESSAGE,
        hint: IMPORT_NOT_TOP_LEVEL_HINT,
      });
    }
    walkStatementForStatementPlacement(stmt, file, isThetaLib, out);
  }
  if (block.tail !== null) {
    walkExprForStatementPlacement(block.tail, file, isThetaLib, out);
  }
}

function walkStatementForStatementPlacement(
  stmt: Stmt,
  file: string,
  isThetaLib: boolean,
  out: Diagnostic[],
): void {
  switch (stmt.kind) {
    case "let":
      if (stmt.init !== null) {
        walkExprForStatementPlacement(stmt.init, file, isThetaLib, out);
      }
      return;
    case "reassign":
      walkExprForStatementPlacement(stmt.value, file, isThetaLib, out);
      return;
    case "if":
      walkExprForStatementPlacement(stmt.condition, file, isThetaLib, out);
      walkBlockForStatementPlacement(stmt.then, false, file, isThetaLib, out);
      if (stmt.otherwise !== null) {
        if ("statements" in stmt.otherwise) {
          walkBlockForStatementPlacement(stmt.otherwise, false, file, isThetaLib, out);
        } else {
          walkStatementForStatementPlacement(stmt.otherwise, file, isThetaLib, out);
        }
      }
      return;
    case "while":
      walkExprForStatementPlacement(stmt.condition, file, isThetaLib, out);
      walkBlockForStatementPlacement(stmt.body, false, file, isThetaLib, out);
      return;
    case "for":
      walkExprForStatementPlacement(stmt.iterand, file, isThetaLib, out);
      walkBlockForStatementPlacement(stmt.body, false, file, isThetaLib, out);
      return;
    case "fn":
      walkBlockForStatementPlacement(stmt.body, false, file, isThetaLib, out);
      // A `subagent fn`'s `with { … }` field values are nested expression
      // positions on the main document AST, so a from-bearing export hidden
      // in one is inert unless walked here.
      for (const field of stmt.withClause ?? []) {
        walkExprForStatementPlacement(field.value, file, isThetaLib, out);
      }
      return;
    case "return":
      if (stmt.operand !== null) {
        walkExprForStatementPlacement(stmt.operand, file, isThetaLib, out);
      }
      return;
    case "query":
      walkExprForStatementPlacement(stmt.query, file, isThetaLib, out);
      return;
    case "tool-call":
      walkExprForStatementPlacement(stmt.call, file, isThetaLib, out);
      return;
    case "invoke":
      walkExprForStatementPlacement(stmt.invoke, file, isThetaLib, out);
      return;
    case "expr":
      walkExprForStatementPlacement(stmt.expr, file, isThetaLib, out);
      return;
    default:
      // `break` / `continue` / `schema` / `enum` / `import` / `export` /
      // `doc-comment` carry no nested Block or Expr this walk needs to reach.
      return;
  }
}

function walkExprForStatementPlacement(
  e: Expr,
  file: string,
  isThetaLib: boolean,
  out: Diagnostic[],
): void {
  switch (e.kind) {
    case "array":
      for (const el of e.elements) {
        walkExprForStatementPlacement(el, file, isThetaLib, out);
      }
      return;
    case "binary":
      walkExprForStatementPlacement(e.left, file, isThetaLib, out);
      walkExprForStatementPlacement(e.right, file, isThetaLib, out);
      return;
    case "ternary":
      walkExprForStatementPlacement(e.condition, file, isThetaLib, out);
      walkExprForStatementPlacement(e.consequent, file, isThetaLib, out);
      walkExprForStatementPlacement(e.alternate, file, isThetaLib, out);
      return;
    case "try":
      walkExprForStatementPlacement(e.operand, file, isThetaLib, out);
      return;
    case "call":
    case "invoke":
      // RFC 0009: a call-site `with` clause value is an expression position with
      // an argument's exact rules, so it is walked beside the arguments.
      for (const arg of [...e.args, ...callWithClauseValues(e)]) {
        walkExprForStatementPlacement(arg, file, isThetaLib, out);
      }
      return;
    case "member":
      walkExprForStatementPlacement(e.target, file, isThetaLib, out);
      return;
    case "index":
      walkExprForStatementPlacement(e.target, file, isThetaLib, out);
      walkExprForStatementPlacement(e.index, file, isThetaLib, out);
      return;
    case "object":
      for (const field of e.fields) {
        walkExprForStatementPlacement(field.value, file, isThetaLib, out);
      }
      return;
    case "match":
      walkExprForStatementPlacement(e.scrutinee, file, isThetaLib, out);
      for (const arm of e.arms) {
        walkExprForStatementPlacement(arm.body, file, isThetaLib, out);
      }
      return;
    case "result-ctor":
      walkExprForStatementPlacement(e.arg, file, isThetaLib, out);
      return;
    case "method-call":
      walkExprForStatementPlacement(e.target, file, isThetaLib, out);
      for (const arg of e.args) {
        walkExprForStatementPlacement(arg, file, isThetaLib, out);
      }
      return;
    case "par-for":
      walkExprForStatementPlacement(e.iterand, file, isThetaLib, out);
      if (e.max !== null) {
        walkExprForStatementPlacement(e.max, file, isThetaLib, out);
      }
      walkBlockForStatementPlacement(e.body, false, file, isThetaLib, out);
      return;
    case "block":
      walkBlockForStatementPlacement(e.body, false, file, isThetaLib, out);
      return;
    default:
      // ident / number / string / bool / null / query — no nested Block or
      // Expr on this document-body AST for the walk to reach. A `query`
      // template's text is a raw string re-lexed as a separate throwaway
      // parse (`parseInterpolationSource`) that this walk does not traverse;
      // a `${…}` interpolation can admit a `par for` whose body is a
      // statement block, so a statement hidden there is not reached here and
      // is a separate follow-up concern outside bug 0446/0447's seam.
      return;
  }
}

/**
 * Lex an expression snippet (a `${…}` interpolation or `@`-query template
 * source) through the real `lexTheta` under an inert system-note channel.
 * Discarding the channel's delivery is sound here: `lexTheta` returns every
 * diagnostic on `LexResult.diagnostics` (which the snippet callers read or
 * deliberately discard), and a well-formed theta's snippet text already lexed
 * — and already noted — as part of the whole-file body pass. Bug 0255 pinned
 * the V7d design (the channel parameter stays mandatory, and none of these
 * snippet callers may be required to supply a real channel), so the inert
 * channel lives here, in one named place, rather than inline per site. The
 * deps literal is constructed fresh per call, keeping the snippet helpers
 * free of shared state — no module-level mutable channel.
 */
function lexSnippetSource(source: string): LexResult {
  return lexTheta(
    { path: "<interpolation>", bytes: encodeSource(source) },
    {
      pi: { sendMessage: () => {} },
      ui: { notify: () => {} },
      emitDiagnostic: () => {},
    },
  );
}

/**
 * Parse a standalone expression `source` into an `Expr`, reusing the same
 * `parseExpression` entry the body parser drives for a `let` RHS so a caller
 * (e.g. a `@`...`` template's `${…}` interpolation, expressions.md
 * §"Supported forms") honours the full expression sublanguage rather than a
 * dotted-path subset. Returns `null` when the source does not parse as a single
 * expression. Lex diagnostics are discarded here: a well-formed theta's
 * interpolation already lexed as part of the whole-file body, and a malformed
 * one degrades to `null` at the call site (`lexSnippetSource`'s inert channel
 * keeps this helper free of shared state — no module-level mutable channel).
 */
export function parseExpressionSource(source: string): Expr | null {
  const lex = lexSnippetSource(source);
  const parser = new BodyParser(lex.tokens, "<interpolation>", source);
  return parser.parseSingleExpression();
}

/**
 * Parse a `@`...`` template's `${…}` interpolation source, returning the
 * parsed expression (or `null` when it does not parse at all) ALONGSIDE the
 * `BodyParser`'s own parse-phase diagnostics — the settled route for bug 0122:
 * an expression inside an interpolation draws exactly the parse-*parser*-phase
 * diagnostics the same text draws at `let`-RHS level. Same lex seam as
 * `parseExpressionSource` (`lexSnippetSource`: real `lexTheta`, inert
 * channel, the `<interpolation>` path) and the same `BodyParser`
 * construction; the only
 * difference is driving `parseSingleExpressionWithResidue()` so a residue after
 * the expression — not only the expression's own emitters — has a chance to
 * draw a diagnostic before it is discarded. `parseExpressionSource` itself is
 * untouched: its other call sites do not want the residue drain.
 */
function parseInterpolationSource(source: string): {
  readonly expr: Expr | null;
  readonly diagnostics: readonly Diagnostic[];
} {
  const lex = lexSnippetSource(source);
  const parser = new BodyParser(lex.tokens, "<interpolation>", source);
  const expr = parser.parseSingleExpressionWithResidue();
  return { expr, diagnostics: parser.diagnostics };
}

/**
 * Collect the whole-file named-type set the frontmatter `params:` / `system:`
 * value-validations resolve a `NamedType` against: body `schema` declarations
 * (with their object field sources when present), body `enum` declarations, and
 * the symbols pulled in by body `import` declarations. Supplying the names is
 * sufficient to decide `theta/parse/unresolved-named-type`; the schema field
 * sources let the `system:` surface descend `.Ident` steps.
 *
 * Exported (bug 0422 route (a)): the load-phase template-revalidation
 * consumer (`import-static-checks.ts`) calls this over a resolved
 * `.thetalib`'s OWN body statements to build that lib's own named-type set,
 * the input `toSystemParamType` (frontmatter.ts) needs to build a real object
 * shell for an imported schema — the same whole-file collection this module
 * already runs for the IMPORTING theta's own body, reused rather than
 * reimplemented for the imported lib's body.
 */
export function collectBodyTypes(
  statements: readonly Stmt[],
  file: string,
): { readonly bodyTypes: FrontmatterBodyTypes; readonly diagnostics: readonly Diagnostic[] } {
  const schemas = new Map<string, readonly SchemaFieldSource[] | undefined>();
  const enums = new Set<string>();
  const imports = new Set<string>();
  const aliasArms = new Map<string, readonly string[]>();
  const schemaDecls: SchemaDecl[] = [];
  const enumDecls: EnumDecl[] = [];
  const importNames: string[] = [];
  const rangeByName = new Map<string, SourceRange>();
  for (const stmt of statements) {
    if (stmt.kind === "schema") {
      schemas.set(stmt.name, stmt.fields);
      if (stmt.arms !== undefined) {
        aliasArms.set(stmt.name, stmt.arms);
      }
      schemaDecls.push(stmt);
      rangeByName.set(stmt.name, stmt.range);
    } else if (stmt.kind === "enum") {
      enums.add(stmt.name);
      enumDecls.push(stmt);
    } else if (stmt.kind === "import") {
      for (const symbol of stmt.symbols) {
        imports.add(symbol);
        importNames.push(symbol);
      }
    }
  }
  // Lower each named type to the JSON-Schema fragment a `params:` `NamedType`
  // resolves to (BIND-1): schema object bodies and enum wire-value sets lower
  // concretely, and alias/union right-hand sides lower through the same shared
  // lowerer the object form's field types use, arm by arm — so `array<T>` and
  // every other arm shape that lowerer can lower on its own terms lower
  // concretely as a union arm, not only in isolation (a union arm the lowerer
  // genuinely cannot resolve alone — an unresolved name, a non-`array` generic
  // such as `Result<T, E>`, or a literal beside a non-literal arm — still
  // keeps `{}` there, as one `anyOf` variant, never as the whole union) (bug
  // 0033 §Fix widened the alias/union case from the permissive fallback below
  // to a real lowering, seeded in `buildBodyTypeSchemas`' own pass 1); a
  // schema with NEITHER an object body nor alias arms (the head-only /
  // malformed form) and an imported symbol lower permissively to `{}` — the
  // name still resolves, so `theta/parse/unresolved-named-type` does not fire,
  // and the `params:` schema is present (not mis-classified as no-params). A
  // `schema` body field type or an alias/union arm may itself hoist an
  // `__inline_<slug>` fragment now (bug 0039 §Fix), so this pass also carries
  // the document-scoped slug-collision sink through to a registered diagnostic.
  const collisions: SchemaSlugCollision[] = [];
  const lowered = buildBodyTypeSchemas(schemaDecls, enumDecls, collisions);
  for (const decl of schemaDecls) {
    if (!lowered.has(decl.name)) {
      lowered.set(decl.name, {});
    }
  }
  for (const name of importNames) {
    if (!lowered.has(name)) {
      lowered.set(name, {});
    }
  }
  // schema-subset.md §Schema-slug collision posture: a byte-mismatched slug
  // match anywhere in this pass is a load-time refusal, at the offending
  // decl's own range. The message literal is held identical to `parseParams`'s
  // by DIAG-4, not by shared code (`code-registry-load.md:58`; the row and its
  // trigger prose already cover this site — no registry edit).
  const diagnostics: Diagnostic[] = collisions.map((collision): Diagnostic => {
    const message = `schema-slug collision on slug ${collision.slug}: two distinct inline schemas hash alike`;
    const range = rangeByName.get(collision.schemaName);
    // `exactOptionalPropertyTypes` forbids an explicit `undefined` on `range`,
    // so omit the key entirely on the (unreachable in practice, since every
    // collision's `schemaName` is a decl this same pass walked) miss.
    return range === undefined
      ? { severity: "error", code: "theta/load/schema-slug-collision", file, message }
      : { severity: "error", code: "theta/load/schema-slug-collision", file, range, message };
  });
  return { bodyTypes: { schemas, enums, imports, aliasArms, lowered }, diagnostics };
}

// --------------------------------------------------------------------------
// Source encoding + frontmatter separation
// --------------------------------------------------------------------------

/** Re-encode a (already-normalised) body string for the lexer's byte input. */
function encodeSource(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * Split a normalised source into its optional leading `---` frontmatter block
 * and the executable body. The frontmatter region is blanked (not removed) in
 * the returned body so body line numbers stay aligned with the original
 * source. The block carries the fence-stripped YAML text plus the file-line
 * offset of the opening fence, in the `FrontmatterBlock` shape
 * `parseFrontmatter` accepts directly. Returns `frontmatter: null` when no
 * leading fence is present.
 */
function splitFrontmatter(text: string): {
  frontmatter: FrontmatterBlock | null;
  bodyText: string;
} {
  const lines = text.split("\n");
  let open = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const t = (lines[i] ?? "").trim();
    if (t === "") {
      continue;
    }
    open = t === "---" ? i : -1;
    break;
  }
  if (open < 0) {
    return { frontmatter: null, bodyText: text };
  }
  let close = -1;
  for (let i = open + 1; i < lines.length; i += 1) {
    if ((lines[i] ?? "").trim() === "---") {
      close = i;
      break;
    }
  }
  if (close < 0) {
    // FM-4: an opening `---` with no closing `---` is a malformed, unterminated
    // frontmatter fence. frontmatter.md delimits the block with a closing
    // fence; an unclosed block is not a valid frontmatter mapping. Rather than
    // swallow the whole file as frontmatter and silently register a do-nothing
    // empty-body theta (dropping the author's query), yield an EMPTY frontmatter
    // block so `parseFrontmatter` produces `theta/load/missing-mode` and the
    // theta un-registers with author feedback. The closed diagnostics registry
    // (docs/reference/diagnostics.md) has no dedicated unterminated-fence code;
    // missing-mode is the documented "no recognised frontmatter mapping"
    // surface (see `extractFrontmatterBlock` in frontmatter.ts).
    return {
      frontmatter: { yaml: "", lineOffset: open + 1 },
      bodyText: lines.map(() => "").join("\n"),
    };
  }
  const yaml = lines.slice(open + 1, close).join("\n");
  const bodyText = lines.map((l, i) => (i <= close ? "" : l)).join("\n");
  return { frontmatter: { yaml, lineOffset: open + 1 }, bodyText };
}

// --------------------------------------------------------------------------
// `///` doc-comment line scan
// --------------------------------------------------------------------------

/**
 * Classify a `///` run's anchor by RANGE LOOKUP against the already-parsed
 * top-level statement list, per descriptions.md §Placement / grammar.md §`///`
 * placement (five eligible anchors: `schema`, `enum`, schema field, enum
 * variant, `fn`). The verdict is structural — a range containment test —
 * rather than a leading-word sniff, because a field or variant line leads
 * with its own NAME, not a keyword, so no lexical test can place it: `Low,`
 * and `language: string,` carry no shared prefix an eligible-set match could
 * key on, and their only distinguishing fact is that a schema/enum DECLARATION
 * encloses their line.
 *
 * Two passes, in this order, because a declaration HEAD line and a BODY
 * INTERIOR line need different tests and a line can satisfy only one:
 *   1. exact start: `anchorLine` IS a declaration's first line — `schema`,
 *      `enum`, or `fn` (reference/grammar.md:311 `FnDecl ::= SubagentMod?
 *      "fn" …`, so a `subagent fn` head-line still classifies `"fn"`).
 *   2. body interior: `anchorLine` falls strictly inside a schema/enum
 *      declaration's range (after its head, at/before its closing `}`) — a
 *      field row (only when the schema is the object form, `fields` present;
 *      the alias/`by` forms carry no field list to anchor against) or a
 *      variant row.
 * Anything neither pass matches — `let`, `import`, `export`, expression /
 * control-flow statements, or a line past the last statement (EOF) — is
 * `"other"`.
 */
function classifyDocAnchor(
  statements: readonly Stmt[],
  anchorLine: number | undefined,
): string {
  if (anchorLine === undefined) {
    return "other";
  }
  for (const stmt of statements) {
    if (stmt.range.start.line === anchorLine) {
      if (stmt.kind === "schema") return "schema";
      if (stmt.kind === "enum") return "enum";
      if (stmt.kind === "fn") return "fn";
    }
  }
  for (const stmt of statements) {
    if (stmt.range.start.line < anchorLine && anchorLine <= stmt.range.end.line) {
      if (stmt.kind === "schema" && stmt.fields !== undefined) return "field";
      if (stmt.kind === "enum") return "variant";
    }
  }
  return "other";
}

/** Build the doc-comment scan's template-prose predicate, excluding interpolations. */
function templateProseLineSpans(tokens: readonly Token[]): (line: number) => boolean {
  // Bug 0411 §Fix option 1, refined by bug 0420 §Fix option 1 — `scanDocComments`
  // is the one line-oriented pass over the body text with no `@`...`` template
  // guard (lexical.md:24 sentence 1: text inside a query template is rendered
  // prompt, not a comment); the lexer's own `inTemplateProse` and
  // `contextualDiagnostics`'s `inTemplateBody` both already toggle on backtick
  // puncts to skip template interiors, so this scan gets the same toggle over
  // the already-in-scope `tokens`. Backticks are template delimiters and
  // always pair (matching lexer.ts's own toggle) EXCEPT when lexed inside a
  // `${…}` interpolation, where a backtick is ordinary punctuation, not a
  // delimiter (lexer.ts) — so the toggle only fires at interpolation depth 0.
  // Any document containing an unpaired top-level backtick already refused
  // upstream of this call, so on an accepted document every depth-0 backtick
  // token here is a genuine open/close pair, and `templateLineSpans` recovers
  // every template span exactly as 0411 left it.
  //
  // 0411 excluded a template span's lines wholesale, which over-reached into
  // `${…}` interpolation interiors: lexical.md:24 sentence 2 puts interpolation
  // contents in expression position, where the SAME `///` line one production
  // over already draws `doc-comment-misplaced` (grammar.md:204). The walk below
  // additionally tracks interpolation sub-spans — the lexer marks entry with an
  // adjacent `$` `{` punct pair (only ever emitted together, from template
  // prose) and nested `{`/`}` puncts while inside, so a depth counter over
  // those puncts between a template's `${` and its matching `}` recovers each
  // sub-span. `isTemplateLine` then excludes a line iff column-1 sits inside a
  // template span AND NOT inside one of its interpolation sub-spans: prose
  // stays excluded (sentence 1), interpolation interiors are treated as
  // ordinary expression position (sentence 2). A line whose column-1 is prose
  // but that merely CONTAINS a later `${…}` stays excluded — the interpolation
  // sub-span for that occurrence opens at a column > 1 on the same line, so
  // column-1 never falls strictly inside it. `docLine` anchors matches at `^`,
  // so a line with real code before an opening backtick, or after a closing
  // one, is correctly left un-excluded either way.
  const templateLineSpans: { open: Position; close: Position }[] = [];
  const interpSpans: { open: Position; close: Position }[] = [];
  let openBacktick: Position | undefined;
  let interpDepth = 0;
  let interpOpen: Position | undefined;
  let prevTok: Token | undefined;
  for (const tok of tokens) {
    if (tok.kind === "punct" && tok.text === "`" && interpDepth === 0) {
      if (openBacktick === undefined) {
        openBacktick = tok.range.start;
      } else {
        templateLineSpans.push({ open: openBacktick, close: tok.range.start });
        openBacktick = undefined;
      }
    } else if (tok.kind === "punct" && tok.text === "{") {
      if (
        openBacktick !== undefined &&
        interpDepth === 0 &&
        prevTok?.kind === "punct" &&
        prevTok.text === "$"
      ) {
        interpDepth = 1;
        interpOpen = prevTok.range.start;
      } else if (interpDepth > 0) {
        interpDepth += 1;
      }
    } else if (tok.kind === "punct" && tok.text === "}" && interpDepth > 0) {
      interpDepth -= 1;
      if (interpDepth === 0 && interpOpen !== undefined) {
        interpSpans.push({ open: interpOpen, close: tok.range.start });
        interpOpen = undefined;
      }
    }
    prevTok = tok;
  }
  const posBefore = (a: Position, b: Position): boolean =>
    a.line < b.line || (a.line === b.line && a.column < b.column);
  const isTemplateLine = (line: number): boolean => {
    const lineStart: Position = { line, column: 1 };
    const inTemplate = templateLineSpans.some(
      (span) => posBefore(span.open, lineStart) && posBefore(lineStart, span.close),
    );
    if (!inTemplate) {
      return false;
    }
    const inInterp = interpSpans.some(
      (span) => posBefore(span.open, lineStart) && posBefore(lineStart, span.close),
    );
    return !inInterp;
  };

  return isTemplateLine;
}

/**
 * Recover `///` doc-comment runs from the body text (the lexer emits no
 * comment tokens) and delegate each run's placement to V5c's
 * `checkDocCommentPlacement`. The anchor is derived structurally, by range
 * lookup against the already-parsed statement list (`classifyDocAnchor`), not
 * by sniffing the following line's leading word — the leading word cannot
 * distinguish a schema field or enum variant (which lead with their own name)
 * from any other statement.
 *
 * `isTemplateLine` (bug 0411 §Fix) reports whether a 1-indexed line's
 * column-1 position sits inside a `@`...`` query template body; per
 * lexical.md:24 such a line is rendered prompt text, never a comment, so both
 * scans below treat it as an ordinary non-doc, non-anchor line regardless of
 * what it textually looks like.
 */
function scanDocComments(
  bodyText: string,
  file: string,
  statements: readonly Stmt[],
  isTemplateLine: (line: number) => boolean,
): {
  nodes: DocComment[];
  diagnostics: Diagnostic[];
  attachments: DocDescriptionAttachment[];
} {
  const lines = bodyText.split("\n");
  const nodes: DocComment[] = [];
  const diagnostics: Diagnostic[] = [];
  const attachments: DocDescriptionAttachment[] = [];
  const docLine = /^[ \t]*\/\/\/(?!\/)(.*)$/;
  // A `///`-shaped line inside a template body is prompt prose, not a doc
  // comment (lexical.md:24) — never let it seed or extend a run.
  const matchDocLine = (idx: number): RegExpExecArray | null =>
    isTemplateLine(idx + 1) ? null : docLine.exec(lines[idx] ?? "");

  let i = 0;
  while (i < lines.length) {
    const first = matchDocLine(i);
    if (first === null) {
      i += 1;
      continue;
    }
    const startLine = i + 1; // 1-indexed
    const content: string[] = [];
    while (i < lines.length) {
      const m = matchDocLine(i);
      if (m === null) {
        break;
      }
      content.push(m[1] ?? "");
      i += 1;
    }
    const range: SourceRange = {
      start: { line: startLine, column: 1 },
      end: { line: startLine, column: (lines[startLine - 1] ?? "").length + 1 },
    };
    nodes.push({ kind: "doc-comment", lines: content, range });

    // The anchor line is the next non-blank, non-comment line's 1-indexed
    // line number — NOT its leading word (a field or variant line leads with
    // its own name, which the classifier must not read). `undefined` when no
    // such line exists (EOF): `classifyDocAnchor` maps that to "other", so a
    // trailing `///` with no following production stays misplaced. A
    // template-interior line is skipped here too (bug 0411 §Fix): it is
    // rendered prose, not a candidate anchor, exactly like a blank or `//`
    // line.
    let anchorLine: number | undefined;
    for (let j = i; j < lines.length; j += 1) {
      const raw = lines[j] ?? "";
      if (raw.trim() === "" || /^[ \t]*\/\//.test(raw) || isTemplateLine(j + 1)) {
        continue;
      }
      anchorLine = j + 1;
      break;
    }
    const anchor = classifyDocAnchor(statements, anchorLine);
    const diag = checkDocCommentPlacement(anchor, { file, range });
    if (diag !== undefined) {
      diagnostics.push(diag);
    }
    // Every run gets an attachment candidate regardless of anchor kind;
    // `attachDocDescriptions` decides which anchors actually consume it
    // (schema/enum decl and field lines only — A1: variant/fn lines are never
    // read, so their doc text stays AST-only via the floating `DocComment`
    // node above, not this map).
    attachments.push({ anchorLine, description: joinDocComment(content) });
  }
  return { nodes, diagnostics, attachments };
}

/**
 * One `///` run's join result, paired with the 1-indexed source line of the
 * production it anchors to (`undefined` when no such line exists, e.g. a
 * trailing run at EOF). `attachDocDescriptions` consumes these by building an
 * anchorLine→description map and reading it only at the schema/enum-DECL and
 * field lines A1 designates as lowering targets.
 */
interface DocDescriptionAttachment {
  readonly anchorLine: number | undefined;
  readonly description: string;
}

/**
 * Attach `///` descriptions to their anchor declarations by line lookup,
 * BEFORE `mergeByLine` folds the floating `DocComment` nodes back into the
 * statement list. Per the A1 adjudication (docs/bugs/0358-…, §Fix), only
 * schema-DECL, enum-DECL, and schema-FIELD anchors consume a description here;
 * a `fn` head line or an enum variant line is never a key this function reads,
 * so its doc text is never attached (accepted-but-AST-only: it survives only
 * as the floating `DocComment` sibling `mergeByLine` still produces).
 * Statements outside this set (`let`, `import`, `export`, expressions, doc
 * comments themselves) pass through unchanged. Rebuilds by object-spread so
 * every unrelated field/statement is preserved verbatim.
 *
 * Attachment mirrors placement: a `//` or blank line between the trailing
 * `///` run and the anchor does NOT disconnect it (`scanDocComments`'s
 * `anchorLine` scan skips both, 0357's shipped placement behaviour), so a
 * validly-placed run always lowers — never a silent drop. The `//`-terminates
 * rule of `extractDescription` governs run FORMATION (a `//` inside the `///`
 * block breaks the maximal run), which `scanDocComments`'s forward `docLine`
 * scan already enforces.
 */
function attachDocDescriptions(
  statements: readonly Stmt[],
  attachments: readonly DocDescriptionAttachment[],
): Stmt[] {
  const byLine = new Map<number, string>();
  for (const attachment of attachments) {
    if (attachment.anchorLine !== undefined) {
      byLine.set(attachment.anchorLine, attachment.description);
    }
  }
  return statements.map((stmt) => {
    if (stmt.kind === "schema") {
      const description = byLine.get(stmt.range.start.line);
      let fields = stmt.fields;
      let fieldsChanged = false;
      if (stmt.fields !== undefined) {
        // Mirror `classifyDocAnchor`'s precedence so one `///` run reaches one
        // anchor: its exact-start pass (a line that IS the decl head) wins over
        // its body-interior pass (a field row), and a run keyed to a line
        // carrying several fields sits immediately above the FIRST of them.
        // `consumed` records each line whose description a field has already
        // taken, so the same line's text is never re-attached to a later field
        // sharing that line.
        const consumed = new Set<number>();
        const mapped = stmt.fields.map((field) => {
          // A field on the decl head line is NOT a field anchor: that line is
          // the schema-DECL anchor, so a `///` above it lowers into the decl's
          // own `description` (above) and must not leak onto the field.
          if (field.line === undefined || field.line === stmt.range.start.line) {
            return field;
          }
          if (consumed.has(field.line)) {
            return field;
          }
          const fieldDescription = byLine.get(field.line);
          if (fieldDescription === undefined) {
            return field;
          }
          consumed.add(field.line);
          fieldsChanged = true;
          return { ...field, description: fieldDescription };
        });
        if (fieldsChanged) {
          fields = mapped;
        }
      }
      if (description === undefined && !fieldsChanged) {
        return stmt;
      }
      return {
        ...stmt,
        ...(description !== undefined ? { description } : {}),
        ...(fields !== undefined ? { fields } : {}),
      };
    }
    if (stmt.kind === "enum") {
      const description = byLine.get(stmt.range.start.line);
      return description !== undefined ? { ...stmt, description } : stmt;
    }
    return stmt;
  });
}

/** Merge doc-comment nodes into the statement list, ordered by source line. */
function mergeByLine(
  statements: readonly Stmt[],
  docs: readonly DocComment[],
): Stmt[] {
  const merged: Stmt[] = [...statements, ...docs];
  return merged.sort((a, b) => {
    const al = a.range.start.line;
    const bl = b.range.start.line;
    if (al !== bl) {
      return al - bl;
    }
    return a.range.start.column - b.range.start.column;
  });
}

/**
 * Classify an enum-variant explicit `= <literal>` value token into the
 * `checkEnumDeclaration` value shape (kind + text). Only single-token literals
 * (string / number / `true` / `false` / `null`) are recognised; any other token
 * (e.g. a bare identifier) is left uncaptured. A non-string kind is retained so
 * the enum-declaration checker can reject it (schemas.md §Enum declarations).
 */
function classifyEnumValueToken(
  tok: Token,
): { kind: EnumValueKind; text: string } | undefined {
  if (tok.kind === "string") {
    return { kind: "string", text: tok.value ?? tok.text };
  }
  if (tok.kind === "number") {
    return { kind: tok.numericType ?? "integer", text: tok.text };
  }
  if (tok.kind === "keyword" && (tok.text === "true" || tok.text === "false")) {
    return { kind: "boolean", text: tok.text };
  }
  if (tok.kind === "keyword" && tok.text === "null") {
    return { kind: "null", text: tok.text };
  }
  return undefined;
}

/**
 * Convert a 1-indexed `{ line, column }` source position into a 0-based
 * character offset into `text` (newline-normalised to `\n`). Used to slice a
 * `@`...`` query template verbatim between its backtick token bounds.
 */
function positionToOffset(text: string, pos: Position): number {
  let offset = 0;
  let line = 1;
  while (line < pos.line && offset < text.length) {
    if (text[offset] === "\n") {
      line += 1;
    }
    offset += 1;
  }
  return offset + (pos.column - 1);
}

/** A synthetic `null` literal placeholder for a missing operand. */
function nullExpr(range: SourceRange): Expr {
  return { kind: "null", range };
}

// --------------------------------------------------------------------------
// Identifier-resolution parse checker (`theta/parse/unknown-identifier`)
// --------------------------------------------------------------------------

/**
 * Derive the presented callable name for one `tools:` entry, mirroring
 * `callable-set.ts`: a bare Pi-tool name is used verbatim; a `.theta` path
 * contributes its basename (extension stripped, hyphens → underscores); an
 * `as <name>` rename overrides. Used to seed the identifier root scope so a
 * `<name>(args)` callable call is not flagged as unknown.
 *
 * DELIBERATELY wider than `parseToolsEntry`'s closed grammar (bug 0106 §Fix
 * constraint 7): this runs at parse, strictly before `tools:` resolution
 * exists, so it still derives a name for a malformed entry (`parts.length >=
 * 3` rather than `=== 3`, no rejection for two tokens). Delegating to
 * `parseToolsEntry` would make a malformed entry contribute NO name, turning
 * every body reference to it into `theta/parse/unknown-identifier` (plus, for
 * a sole bare-object call, `theta/parse/bare-object-literal`) — trading the
 * one load-time diagnostic that names the actual authoring mistake
 * (`theta/load/malformed-tool-entry`) for parse diagnostics that do not, and
 * making that rejection unreachable for a wider set of spellings than today
 * (an error-severity parse diagnostic drops the theta before `tools:`
 * resolution runs). Keeping a malformed entry's body references parse-clean
 * is what lets the entry reach the closed grammar at load instead of being
 * pre-empted at parse; the false parse-layer messages this leaves for two
 * spellings (`- read bash` + `read("x")`, and + a shadowing local) are
 * recorded in bug 0106, not closed here.
 */
function toolCallableName(entry: string): string {
  const parts = entry.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length >= 3 && parts[1] === "as") {
    return parts[2] ?? "";
  }
  const spec = parts[0] ?? "";
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(spec)) {
    return spec;
  }
  return thetaDefaultName(spec);
}

/**
 * Build the whole-file identifier root scope: every name visible everywhere in
 * the body regardless of source order — hoisted top-level `fn` names, `schema` /
 * `enum` names, imported symbols, `params:` field names, resolved
 * `tools:` callable names, and the stdlib builtins. Theta-level `let` bindings are
 * NOT roots (they bind sequentially and are accumulated as the walk descends).
 *
 * This one fold is deliberately coarser than either of its two callers' own
 * question, because it answers a THIRD, shared one — "is this name bound at
 * all, anywhere in the file" — and each caller narrows it differently. Bug
 * 0197's `checkParamsDefaultNames` reads this set exactly as built, once, over
 * every statement: its own question is whether a `params:` default's head
 * resolves at all, and a `schema` / `enum` name resolving is the right answer
 * to THAT question. `checkUnknownIdentifiers` asks a finer one —
 * `expressions.md` §"Identifier resolution" states four resolution arms and
 * names no declaration form, so a `schema` / `enum` name is not itself an arm
 * — and reads this set a SECOND time, over a `schema`/`enum`-free statement
 * list, to recover the value-binding sources alone; see its own doc comment
 * for the three-way judgement that produces.
 */
function collectIdentRoots(
  statements: readonly Stmt[],
  frontmatter: ParsedFrontmatter | null,
): Set<string> {
  const roots = new Set<string>(BUILTIN_VALUE_NAMES);
  for (const s of statements) {
    switch (s.kind) {
      case "fn":
      case "schema":
      case "enum":
        roots.add(s.name);
        break;
      case "import":
        // expressions.md §"Identifier resolution" arm (3) is "a symbol
        // imported from a `.thetalib` file" — an `export` specifier creates
        // no local binding (imports.md §"Re-exports"), so it must not seed a
        // name this whole-file scope treats as bound.
        for (const sym of s.symbols) {
          roots.add(sym);
        }
        break;
      default:
        break;
    }
  }
  if (frontmatter !== null) {
    for (const f of frontmatter.params?.fields ?? []) {
      roots.add(f.wireName);
    }
    for (const entry of frontmatter.tools ?? []) {
      const name = toolCallableName(entry);
      if (name.length > 0) {
        roots.add(name);
      }
    }
  }
  return roots;
}

/**
 * The per-parse walk state `checkUnknownIdentifiers` threads through
 * `walkIdentBlock` / `walkIdentStmt` / `walkIdentExpr` in place of a bare
 * `ReadonlySet<string>` root scope (mirrors the sibling `CallSiteWalkContext`
 * / `walkCtx` convention the lexical call-site walk below uses, for the same
 * naming reason: a parameter literally named `ctx` collides with the
 * pi-integration-contract inventory audit's canonical-carrier convention for
 * that spelling). `roots` alone answers "does this name resolve at all" — the
 * question `collectIdentRoots` was built for, and the one
 * `checkParamsDefaultNames` still asks against its OWN, byte-unchanged call to
 * that function. This walk needs a second question for a name `roots` does
 * not itself resolve: is it declared as a `schema` / `enum` and nothing else?
 * `typeOnlyNames` and `declaredEnums` answer exactly that, without touching
 * `collectIdentRoots` or its first call.
 */
interface IdentWalkContext {
  /**
   * Every name a genuine value-binding source contributes: `collectIdentRoots`
   * run over the statement list with `schema` / `enum` declarations filtered
   * OUT, so a `fn`, an imported symbol, a `params:` field, a resolved
   * `tools:` callable, and the stdlib builtins all still seed scope exactly
   * as before, and a name only a `schema` or `enum` declares does not.
   */
  readonly roots: ReadonlySet<string>;
  /**
   * Every `schema` / `enum` name this file declares that `roots` does NOT
   * also claim — a name a declaration introduces and no value-binding source
   * also binds. `bodyTypes.imports` is deliberately excluded from the
   * candidates this set is built from: an imported symbol is resolution arm
   * (3) (expressions.md:48), a genuine value, not a type-only name.
   */
  readonly typeOnlyNames: ReadonlySet<string>;
  /**
   * Declared `enum` names (`bodyTypes.enums`), read only by the `member` arm
   * below. `Enum.Variant` access is licensed at the same identifier-
   * resolution site a bare value read would use (expressions.md:22), so the
   * licence has to except the receiver there rather than by leaving the
   * enum's name in `roots` — which would also silence a bare `enum` name used
   * as a value. A declared SCHEMA receiver has no bare-member form to license
   * and keeps firing.
   */
  readonly declaredEnums: ReadonlySet<string>;
}

/**
 * The syntactic position `emitUnknownIdentifier` found a bare identifier at.
 * Read only for a name in `IdentWalkContext.typeOnlyNames` — every other name
 * is refused, or not, exactly as before this type existed, at every site.
 */
type IdentSite = "value" | "call" | "discarded";

/**
 * Resolve every identifier the walk reaches against three possibilities, not
 * the plain in-scope / not-in-scope test this pass answered before. A name in
 * `walkCtx.roots` — a `params:` field, a `let` binding, a top-level `fn`, an
 * imported symbol, a resolved `tools:` callable, or a stdlib builtin, each a
 * resolution arm `expressions.md` §"Identifier resolution" states (`:46–49`)
 * — is silent. A name that is NOT one of those arms but IS a declared
 * `schema` or `enum` (`walkCtx.typeOnlyNames`) is `theta/parse/type-as-value`
 * at a VALUE position — a declaration introduces a named type
 * (`schemas.md:3`) and matches no arm, the same ground FN-1
 * (`functions.md:20`) already refuses a bare `fn` name on — silent at a
 * DISCARDED expression-statement position (the no-op-statement class bug
 * 0033 / bug 0042 pinned), and `theta/parse/unknown-identifier` at a CALL
 * position: `:44` scopes the four-arm list to call position by its own
 * sentence, and a declaration fails it there exactly as an undeclared name
 * does. Every other name — resolving to no arm and no declaration — is
 * `theta/parse/unknown-identifier` regardless of position (`:51`).
 *
 * Scope is tracked block-locally: `let` bindings accumulate in declaration
 * order, nested blocks inherit a copy, and a `fn` body sees only the
 * whole-file roots plus its own parameters (theta 1.0 has no closures). Only
 * names the walk actually reaches in an identifier / call-callee /
 * member-or-method receiver position are checked; schema-constructor names,
 * member field names, method names, object keys, and `${…}` template
 * interpolations are not identifier-resolution sites here.
 */
function checkUnknownIdentifiers(
  body: Block,
  walkCtx: IdentWalkContext,
  file: string,
): Diagnostic[] {
  const out: Diagnostic[] = [];
  walkIdentBlock(body, new Set(walkCtx.roots), walkCtx, file, out);
  return out;
}

/**
 * The sink every identifier-resolution judgement in this walk funnels
 * through, so the three-way rule `checkUnknownIdentifiers`'s doc comment
 * states is decided in exactly one place. The scope-shadow test runs FIRST
 * and is unconditional: a `let`, a parameter, a `for` / `match` binder, a
 * `params:` field, or a callable-set entry sharing the declaration's spelling
 * is already IN `scope` by the time its own reads are walked, so it wins over
 * the declaration wherever it is in scope, whatever the name is ALSO declared
 * as (bug 0126 group (d); bug 0050's u9b / u9c / u13 rows) — this is why the
 * test is unchanged from before this code existed. Past it, `site` matters
 * only for a name in `walkCtx.typeOnlyNames`: `"value"` refuses it,
 * `"discarded"` leaves it silent, and `"call"` falls through unchanged to the
 * push below.
 */
function emitUnknownIdentifier(
  name: string,
  range: SourceRange,
  scope: ReadonlySet<string>,
  walkCtx: IdentWalkContext,
  file: string,
  out: Diagnostic[],
  site: IdentSite = "value",
): void {
  if (name.length === 0 || name === "_" || scope.has(name)) {
    return;
  }
  if (walkCtx.typeOnlyNames.has(name)) {
    if (site === "discarded") {
      return;
    }
    if (site === "value") {
      out.push({
        severity: "error",
        code: "theta/parse/type-as-value",
        file,
        range,
        message: `type '${name}' used as a value; a schema or enum declaration names a type, not a value`,
      });
      return;
    }
  }
  out.push({
    severity: "error",
    code: "theta/parse/unknown-identifier",
    file,
    range,
    message: `unknown identifier '${name}'`,
  });
}

/**
 * Refuse a reassignment TARGET that resolves against no value binding (bug 0370
 * §Fix F6). A write target is NOT a value read: unlike `emitUnknownIdentifier`'s
 * `"value"` site, a type-only `schema` / `enum` name here resolves to no value
 * binding to write, so it is `unknown-identifier`, never the read-position
 * `type-as-value` (which stays firing for genuine RHS reads through the
 * read-oriented emitter). `_` is the discard context, refused at `buildReassign`
 * as `immutable-rebinding`, so the target arm stays silent for it.
 */
function emitReassignTargetUnknown(
  target: string,
  range: SourceRange,
  file: string,
  out: Diagnostic[],
): void {
  if (target.length === 0 || target === "_") {
    return;
  }
  out.push({
    severity: "error",
    code: "theta/parse/unknown-identifier",
    file,
    range,
    message: `unknown identifier '${target}'`,
  });
}

function walkIdentBlock(
  block: Block,
  scope: Set<string>,
  walkCtx: IdentWalkContext,
  file: string,
  out: Diagnostic[],
): void {
  for (const s of block.statements) {
    walkIdentStmt(s, scope, walkCtx, file, out);
  }
  if (block.tail !== null) {
    walkIdentExpr(block.tail, scope, walkCtx, file, out);
  }
}

function walkIdentStmt(
  s: Stmt,
  scope: Set<string>,
  walkCtx: IdentWalkContext,
  file: string,
  out: Diagnostic[],
): void {
  switch (s.kind) {
    case "let":
      if (s.init !== null) {
        walkIdentExpr(s.init, scope, walkCtx, file, out);
      }
      if (s.name !== "_") {
        scope.add(s.name);
      }
      return;
    case "reassign": {
      walkIdentExpr(s.value, scope, walkCtx, file, out);
      // The TARGET resolves against the same scope reads use (bug 0370 §Fix
      // layer 1): an in-scope target (a `let`, a parameter, a `for` / `par for`
      // / `match` binder, or a `params:` field already added to `scope`) is
      // silent here — `buildReassign` handled its immutability, if any. An
      // out-of-scope target `buildReassign` already refused as immutable carries
      // `immutableRebindingEmitted`, the EXACT signal that the immutability
      // check fired (G6); the walk defers to it rather than ALSO drawing
      // `unknown-identifier`. A write `buildReassign` drew nothing on — an
      // order-reversed write to a later `let` (F2), or a redeclared name whose
      // shadowing `let mut` made `buildReassign` see a mutable target — has the
      // flag unset, so the walk refuses it. Every other out-of-scope or
      // undeclared target is genuinely unresolvable.
      if (!scope.has(s.target) && !s.immutableRebindingEmitted) {
        emitReassignTargetUnknown(s.target, s.range, file, out);
      }
      return;
    }
    case "if": {
      walkIdentExpr(s.condition, scope, walkCtx, file, out);
      walkIdentBlock(s.then, new Set(scope), walkCtx, file, out);
      if (s.otherwise !== null) {
        if ("statements" in s.otherwise) {
          walkIdentBlock(s.otherwise, new Set(scope), walkCtx, file, out);
        } else {
          walkIdentStmt(s.otherwise, new Set(scope), walkCtx, file, out);
        }
      }
      return;
    }
    case "while":
      walkIdentExpr(s.condition, scope, walkCtx, file, out);
      walkIdentBlock(s.body, new Set(scope), walkCtx, file, out);
      return;
    case "for": {
      walkIdentExpr(s.iterand, scope, walkCtx, file, out);
      const inner = new Set(scope);
      inner.add(s.variable);
      walkIdentBlock(s.body, inner, walkCtx, file, out);
      return;
    }
    case "fn": {
      // A `fn` body is closure-free: it sees only the whole-file roots plus its
      // own parameters, NOT the enclosing theta-level `let` bindings.
      const fnScope = new Set(walkCtx.roots);
      for (const p of s.params) {
        fnScope.add(p.name);
      }
      walkIdentBlock(s.body, fnScope, walkCtx, file, out);
      return;
    }
    case "return":
      if (s.operand !== null) {
        walkIdentExpr(s.operand, scope, walkCtx, file, out);
      }
      return;
    case "query":
      walkIdentExpr(s.query, scope, walkCtx, file, out);
      return;
    case "tool-call":
      walkIdentExpr(s.call, scope, walkCtx, file, out);
      return;
    case "invoke":
      walkIdentExpr(s.invoke, scope, walkCtx, file, out);
      return;
    case "expr":
      // A DISCARDED expression statement — the no-op-statement class bug 0033
      // / bug 0042 pinned silent for a bare declared name; an undeclared name
      // at the same position is unaffected and still resolves to nothing
      // (the walk's own contrast row over this same class).
      walkIdentExpr(s.expr, scope, walkCtx, file, out, "discarded");
      return;
    default:
      // schema / enum / import / export / break / continue / doc-comment carry
      // no identifier-resolution sites.
      return;
  }
}

function walkIdentExpr(
  e: Expr,
  scope: Set<string>,
  walkCtx: IdentWalkContext,
  file: string,
  out: Diagnostic[],
  site: IdentSite = "value",
): void {
  switch (e.kind) {
    case "ident":
      emitUnknownIdentifier(e.name, e.range, scope, walkCtx, file, out, site);
      return;
    case "call":
      // The callee is a bare identifier in CALL position (expressions.md:44);
      // a name in `typeOnlyNames` still falls through to `unknown-identifier`
      // here — the value-position refusal is a different sentence
      // (imports.md:50) for a different position.
      emitUnknownIdentifier(e.callee, e.range, scope, walkCtx, file, out, "call");
      // RFC 0009: identifiers inside a call-site `with` clause value resolve as
      // an argument's do.
      for (const arg of [...e.args, ...callWithClauseValues(e)]) {
        walkIdentExpr(arg, scope, walkCtx, file, out);
      }
      return;
    case "binary":
      walkIdentExpr(e.left, scope, walkCtx, file, out);
      walkIdentExpr(e.right, scope, walkCtx, file, out);
      return;
    case "ternary":
      walkIdentExpr(e.condition, scope, walkCtx, file, out);
      walkIdentExpr(e.consequent, scope, walkCtx, file, out);
      walkIdentExpr(e.alternate, scope, walkCtx, file, out);
      return;
    case "try":
      walkIdentExpr(e.operand, scope, walkCtx, file, out);
      return;
    case "invoke":
      // The callee path is a string literal, not an identifier.
      for (const arg of [...e.args, ...callWithClauseValues(e)]) {
        walkIdentExpr(arg, scope, walkCtx, file, out);
      }
      return;
    case "member":
      // The receiver is an identifier-resolution site; the `.field` name is
      // not. A receiver naming a declared ENUM is `Enum.Variant` access
      // (expressions.md:22), licensed here ahead of the walk; a declared
      // SCHEMA receiver has no such licensed bare-member form and keeps
      // firing.
      if (e.target.kind === "ident" && walkCtx.declaredEnums.has(e.target.name)) {
        return;
      }
      walkIdentExpr(e.target, scope, walkCtx, file, out);
      return;
    case "index":
      walkIdentExpr(e.target, scope, walkCtx, file, out);
      walkIdentExpr(e.index, scope, walkCtx, file, out);
      return;
    case "method-call":
      // The receiver is a resolution site; the method name is A2's concern.
      walkIdentExpr(e.target, scope, walkCtx, file, out);
      for (const arg of e.args) {
        walkIdentExpr(arg, scope, walkCtx, file, out);
      }
      return;
    case "object":
      // The constructor / object keys are not value-position identifiers.
      for (const field of e.fields) {
        walkIdentExpr(field.value, scope, walkCtx, file, out);
      }
      return;
    case "array":
      for (const el of e.elements) {
        walkIdentExpr(el, scope, walkCtx, file, out);
      }
      return;
    case "result-ctor":
      walkIdentExpr(e.arg, scope, walkCtx, file, out);
      return;
    case "match":
      walkIdentExpr(e.scrutinee, scope, walkCtx, file, out);
      for (const arm of e.arms) {
        const armScope = new Set(scope);
        collectPatternBindings(arm.pattern, armScope);
        walkIdentExpr(arm.body, armScope, walkCtx, file, out);
      }
      return;
    case "par-for": {
      // The body inherits a COPY of the enclosing scope, not `walkCtx.roots`:
      // CTRL-4 (control-flow.md:76) states outer bindings and the loop
      // variable are both readable inside a `par for` body, so the `fn`
      // arm's whole-file reseeding above is not the model here. Traversal
      // order (iterand, then `max`, then body) mirrors `walkCallSiteExpr`'s
      // `case "par-for"` and `walkExpr`'s `case "par-for"`.
      walkIdentExpr(e.iterand, scope, walkCtx, file, out);
      if (e.max !== null) {
        walkIdentExpr(e.max, scope, walkCtx, file, out);
      }
      const inner = new Set(scope);
      inner.add(e.variable);
      walkIdentBlock(e.body, inner, walkCtx, file, out);
      return;
    }
    case "block":
      // A CHILD scope (bug 0082 §Fix): a name the block's own `let`s
      // bind must not leak to the read that follows the block — mirrors the
      // `if` / `while` / `par-for` arms above, which likewise walk their body
      // over a COPY of `scope`.
      walkIdentBlock(e.body, new Set(scope), walkCtx, file, out);
      return;
    default:
      // number / string / bool / null / query — no identifier sites.
      return;
  }
}

// --------------------------------------------------------------------------
// Lexical call-site rules — bug 0003 (Pi-tool argument shape) + bug 0016
// (shadowed callable callee; the lexical bare-object carve-out)
// (theta/parse/tool-arg-not-object-literal, theta/parse/shadowed-callable-call,
// theta/parse/bare-object-literal; grammar.md §"Pi-tool argument grammar";
// expressions.md §"Identifier resolution" / §"Object construction";
// code-registry-parse.md)
// --------------------------------------------------------------------------

/**
 * Derive the presented callable name for one `tools:` entry ONLY when the
 * entry is a Pi tool — a bare-identifier spec, the same shape test
 * `callable-set.ts`'s `resolveEntry` classifies entries by — applying the
 * `as <name>` rename. Returns `undefined` for a `.theta`-path entry: those
 * resolve to `.theta`-callables, whose calls route through the invoke
 * trampoline and lower their own whole-value argument (`sentiment(text)` is
 * legal), so the `ToolArg` shape rule below never applies to them. Companion
 * to `toolCallableName`, which derives the name for EVERY entry kind (the
 * unknown-identifier root scope and the shadowed-callable check below need
 * both kinds).
 *
 * DELIBERATELY wider than `parseToolsEntry`'s closed grammar, for the same
 * reason `toolCallableName` states in full (bug 0106 §Fix constraint 7): this
 * runs at parse, before any `tools:` resolution, and still admits a malformed
 * entry (`parts.length >= 3` rather than `=== 3`). Delegating ONLY this
 * function (leaving `toolCallableName` un-delegated) was measured and
 * rejected: it restores the grammar rejection for a bare-object call like
 * `read("x")` but loses it for the sole-bare-object-argument call, the
 * commonest shape — no net reachability gain, a loss on the common case.
 * Keeping both tolerant is what lets a malformed entry's body reach the
 * load-time rejection uncontested.
 */
function piToolCallableName(entry: string): string | undefined {
  const parts = entry.trim().split(/\s+/).filter((p) => p.length > 0);
  const spec = parts[0] ?? "";
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(spec)) {
    return undefined;
  }
  return parts.length >= 3 && parts[1] === "as" ? parts[2] : spec;
}

/**
 * The exact registered diagnostic for one violating call site
 * (docs/reference/diagnostics.md `theta/parse/tool-arg-not-object-literal`
 * row; DIAG-4 message emitted character-for-character). Byte-identical —
 * code, severity, message template, hint — to the emission inside
 * `checkToolCallArguments` (../runtime/tool-call.ts), which documents the
 * rule's arity→shape→type ordering; drift between the two is a defect. The
 * `range` targets the offending ARGUMENT expression node, so the author's
 * editor lands on the value to inline rather than on the call or statement.
 */
function toolArgShapeDiagnostic(
  toolName: string,
  argRange: SourceRange,
  file: string,
): Diagnostic {
  return {
    severity: "error",
    code: "theta/parse/tool-arg-not-object-literal",
    file,
    range: argRange,
    message: `Pi tool '${toolName}' argument must be written inline as a bare object literal { ... }; a let-bound value cannot supply the field shape`,
    hint: "Inline the fields at the call site: read({ path: expr, ... }).",
  };
}

/**
 * The registered `theta/parse/bare-object-literal` rejection (expressions.md
 * §"Object construction"; code-registry-parse.md). Shared by the TWO emission
 * sites so the message can never drift from the normative registry row
 * (DIAG-4): `checkObjectExpr` (the structural walk — every position outside
 * the direct-call-argument carve-out) and `walkCallSiteExpr` (the lexical walk
 * — every direct bare-object argument of a call whose callee is not lexically
 * an unshadowed Pi tool; bug 0016 part B, bug 0072). A Pi-tool callee's own
 * DIRECT arguments are outside this code at every position: a multi-argument
 * call is `theta/parse/tool-arg-arity` and a lone non-object argument is
 * `theta/parse/tool-arg-not-object-literal`.
 */
function bareObjectLiteralDiagnostic(range: SourceRange, file: string): Diagnostic {
  return {
    severity: "error",
    code: "theta/parse/bare-object-literal",
    file,
    range,
    message:
      "bare object literal not permitted in this position; name the schema (Schema { ... })",
  };
}

/**
 * The registered `theta/parse/block-expr-missing-tail` rejection (bug 0082
 * §Fix item 4; code-registry-parse.md, adjacent to
 * `theta/parse/statement-in-arm-body`): a `BlockExpr` at one of the two
 * admitted expression-position block sites (grammar.md:118
 * `BlockExpr ::= "{" Stmt* Expr "}"`) whose parsed body carries no tail
 * expression. `range` spans the block's own `{`…`}`.
 */
function blockExprMissingTailDiagnostic(range: SourceRange, file: string): Diagnostic {
  return {
    severity: "error",
    code: "theta/parse/block-expr-missing-tail",
    file,
    range,
    message: "block expression must end in a tail expression",
  };
}

/**
 * The registered `theta/parse/capitalised-pattern-head` refusal
 * (code-registry-parse.md, bug 0141 §Fix route 1 half 1): a bare `match`
 * pattern head that is an `ident` token starting A–Z that heads none of the
 * admitted pattern productions: it is not the `Ok(p)` / `Err(p)` constructor
 * spelling and it is not followed by `{`, so it names none of the six
 * pattern-table productions
 * (expressions.md's "Pattern grammar" table). `expressions.md`'s
 * disambiguation sentence assigns the binding reading to a lowercase
 * identifier only; this builder renders the refusal for the capitalised one.
 * Same severity/range/file construction as `reservedKeywordAsIdentifierDiagnostic`
 * above, the sibling builder for the reserved-keyword half.
 */
function capitalisedPatternHeadDiagnostic(
  name: string,
  range: SourceRange,
  file: string,
): Diagnostic {
  return {
    severity: "error",
    code: "theta/parse/capitalised-pattern-head",
    file,
    range,
    message: `capitalised pattern head '${name}' names no pattern production`,
  };
}

/**
 * The registered `theta/parse/schema-type-not-expression` refusal (bug 0061
 * §Fix): a `schema` object-body field type, or an arm of a `schema X = …` /
 * `schema X by f = …` alias/union declaration, whose text reaches
 * `lowerTypeExpr`'s trailing catch-all (params.ts) carrying a FRAGMENT no
 * `Type` production spells. `<X>` renders the DECLARATION's identifier, the
 * same category-7 slot `unresolvedNamedTypeDiagnostic`'s sibling rows use for
 * `<name>` — `SchemaFieldSource` and an arm string carry no range or name of
 * their own — so two offending fragments in one declaration render IDENTICAL
 * text: the count rule made visible, not a duplicate. Held identical to the
 * registry row's Message by DIAG-4 rather than by shared code, matching
 * `unresolvedNamedTypeDiagnostic` above.
 */
function schemaTypeNotExpressionDiagnostic(
  declName: string,
  range: SourceRange,
  file: string,
): Diagnostic {
  return {
    severity: "error",
    code: "theta/parse/schema-type-not-expression",
    file,
    range,
    message: `'${declName}' declares a type that is not a theta type expression`,
  };
}

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
 * branch (`walkExpr`, this file — bug 0278 §Fix), which re-parses the WHOLE
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
function checkQueryAnnotation(
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

/**
 * One arm-1 local binder tracked by the lexical call-site walk (bug 0016):
 * which construct bound the name, and the 1-indexed source line of that
 * construct where the AST carries one. `line` is absent only for `params:`
 * fields — frontmatter fields carry no body source range — so the rendered
 * binder phrase degrades from e.g. "let binding at line 6" to "params: field".
 * A `FnParam` and a `match` pattern carry no ranges of their own, so those
 * binders borrow the nearest enclosing node's start line: the `fn`
 * declaration (its parameter list sits on the declaration line) and the arm
 * BODY expression (an arm's body starts on the arm's own line, immediately
 * after `=>`).
 */
interface LocalBinder {
  readonly kind: "let" | "fn-param" | "for" | "par-for" | "match" | "params-field";
  readonly line?: number;
}

/** Render a `LocalBinder` for the shadowed-callable-call message's `<binder>` placeholder. */
function binderPhrase(binder: LocalBinder): string {
  const noun: Record<LocalBinder["kind"], string> = {
    "let": "let binding",
    "fn-param": "fn parameter",
    "for": "for variable",
    "par-for": "par for variable",
    "match": "match binding",
    "params-field": "params: field",
  };
  const kindText = noun[binder.kind];
  return binder.line === undefined ? kindText : `${kindText} at line ${binder.line}`;
}

/**
 * The exact registered diagnostic for one call of a locally shadowed
 * callable-set name (bug 0016; code-registry-parse.md
 * `theta/parse/shadowed-callable-call` row; DIAG-4 message emitted
 * character-for-character with `<name>` / `<binder>` substituted). The `range`
 * targets the CALL node: `CallExpr` carries no separate callee-identifier
 * span, and the call node's start IS the callee's first character, so the
 * author's editor lands on the offending callee. The hint renders the
 * registry row's Hint column verbatim, backticks included — the
 * `immutable-rebinding` / `redundant-wire-name` emitter convention (only the
 * Message column is DIAG-4-normative; keeping the Hint byte-identical too
 * means neither can drift).
 */
function shadowedCallableCallDiagnostic(
  callee: string,
  binder: LocalBinder,
  callRange: SourceRange,
  file: string,
): Diagnostic {
  return {
    severity: "error",
    code: "theta/parse/shadowed-callable-call",
    file,
    range: callRange,
    message: `call of '${callee}' resolves to the local ${binderPhrase(binder)} that shadows the callable-set entry '${callee}'; locals are not callable`,
    hint: "Rename the local binding, or give the `tools:` entry a distinct name with `as`.",
  };
}

/** Check callee resolution and direct-argument legality before descending a call. */
function checkCallSiteCall(
  e: CallExpr,
  localBinder: LocalBinder | undefined,
  insideParFor: boolean,
  walkCtx: CallSiteWalkContext,
): void {
  // (1) Bug 0016: a call of a locally shadowed callable-set name is
  // erroneous — arm 1 wins the resolution, and a local never holds a
  // callable.
  if (localBinder !== undefined && walkCtx.callables.has(e.callee)) {
    walkCtx.out.push(
      shadowedCallableCallDiagnostic(e.callee, localBinder, e.range, walkCtx.file),
    );
  }
  // RFC 0011 (seam sheet §5.1): the callee resolves to a runtime tool iff
  // the presented name is in the map AND no higher-precedence arm captures
  // it (local / fn / import wins; a shadowed name keeps `shadowed-callable-call`
  // ALONE — never the isolated-body code).
  const resolvesToRuntimeTool =
    walkCtx.runtimeTools.has(e.callee) &&
    localBinder === undefined &&
    !walkCtx.fnImportDecls.has(e.callee);
  // RFC 0011 §5.3 / §0 C4: a runtime tool called inside a `par for` body
  // addresses the enclosing conversation and is not available there.
  // Emitted AFTER the shadow check (a shadowed name keeps its own verdict)
  // and only when the callee resolves to a runtime tool.
  if (resolvesToRuntimeTool && insideParFor) {
    walkCtx.out.push({
      severity: "error",
      code: "theta/parse/session-tool-in-isolated-body",
      file: walkCtx.file,
      range: e.range,
      // DIAG-4: exact Message template from the registry row.
      message: `'${e.callee}' addresses the enclosing conversation and is not available inside a par for body`,
    });
  }
  // The callee is lexically the Pi tool iff no higher-precedence arm
  // (local / fn / import) captures the name AND it is NOT a runtime tool
  // (RFC 0011: runtime tools admit positional typed arguments, so the
  // Pi-tool object-literal shape rule does not apply to them).
  const resolvesToPiTool =
    walkCtx.piTools.has(e.callee) &&
    !resolvesToRuntimeTool &&
    localBinder === undefined &&
    !walkCtx.fnImportDecls.has(e.callee);
  if (resolvesToPiTool) {
    if (e.args.length > 1) {
      // (2) Bug 0072: a Pi tool takes a single object argument
      // (tool-calls.md §"Argument shape"); a multi-argument call is
      // `theta/parse/tool-arg-arity` regardless of the argument shapes.
      // No `argumentSource` is supplied, so only the shared check's ARITY
      // arm can fire from this site; ranged on the CALL node, not on one
      // argument — the mistake is the argument LIST, and the registry
      // row's repair ("merge the arguments") is at the call.
      walkCtx.out.push(
        ...checkToolCallArguments({
          toolName: e.callee,
          calleeKind: "pi-tool",
          positionalCount: e.args.length,
          file: walkCtx.file,
          range: e.range,
        }),
      );
    } else {
      // (3) Bug 0003: `ToolArg` is a BARE inline object literal — any
      // non-object node (identifier, string, call, member, …) and a
      // NAMED schema-constructor (`typeName !== null`) both fail the
      // shape. Disjoint from (2) by construction: arity owns `> 1`
      // (handled above), this owns `<= 1`, so the two codes never co-fire
      // at one call site — the reconciliation bug 0072 §Fix (parse half,
      // option 1) requires of this walk.
      const first = e.args[0];
      if (first !== undefined && !(first.kind === "object" && first.typeName === null)) {
        walkCtx.out.push(toolArgShapeDiagnostic(e.callee, first.range, walkCtx.file));
      }
    }
  } else if (!resolvesToRuntimeTool) {
    // (4) Bug 0016 part B; bug 0072: the §Object construction carve-out
    // admits a bare-object argument ONLY under a
    // (lexically) Pi-tool callee, at EVERY direct argument position — a
    // Pi-tool callee's own direct arguments are already owned by (2) /
    // (3) above, so this arm only ever reaches a non-Pi-tool callee,
    // where every direct bare-object argument is the ordinary rejection.
    // The structural walk suppresses exactly these positions
    // (callee-blind), so this is the single emission site for them.
    for (const arg of e.args) {
      if (arg.kind === "object" && arg.typeName === null) {
        walkCtx.out.push(bareObjectLiteralDiagnostic(arg.range, walkCtx.file));
      }
    }
  }
}

/**
 * RFC 0011 (seam sheet §0 C6): build the runtime-tool success-type map
 * (`presented name → CompatType`) from the frontmatter `tools:` list.
 * Each declared runtime tool's `successTypeSource` (from `RUNTIME_TOOL_SIGNATURES`)
 * is converted once through `letAnnotationToCompatType` — the second sanctioned
 * TYPE-8 object-arm mint site (bug 0130 flag F-3). GOV-15 inert: the returned
 * map is empty when the `tools:` list declares no runtime tool.
 */
function buildRuntimeToolSuccessTypes(
  tools: readonly string[] | undefined,
): ReadonlyMap<string, CompatType> {
  const presented = runtimeToolPresentedNames(tools);
  if (presented.size === 0) {
    return presented as unknown as ReadonlyMap<string, CompatType>;
  }
  const out = new Map<string, CompatType>();
  for (const [name, canonical] of presented) {
    const sig = RUNTIME_TOOL_SIGNATURES.get(canonical);
    if (sig === undefined) {
      continue;
    }
    const type = letAnnotationToCompatType(sig.successTypeSource);
    if (type !== undefined) {
      out.set(name, type);
    }
  }
  return out;
}

/**
 * The per-file invariants of the lexical call-site walk, threaded explicitly
 * through the walkers (no module state) alongside the per-scope `locals` map.
 */
interface CallSiteWalkContext {
  /**
   * The arm-1 binders visible everywhere in the body regardless of source
   * order: `params:` fields, which materialise as root-environment locals at
   * runtime (`buildBoundEnvironment` defines them via `defineLocal`), so a
   * call of a params-shadowed name resolves to the local. Each `fn` body's
   * scope restarts from this map — theta 1.0 has no closures.
   */
  readonly rootLocals: ReadonlyMap<string, LocalBinder>;
  /**
   * Whole-file names on resolution arms (2)–(3): top-level `fn` declarations
   * and imported symbols. A call of such a name is a legal user-fn /
   * import call, NOT a shadowed-callable-call site (a `tools:` collision with
   * these names is separately load-rejected via
   * `theta/load/tool-name-collision`), and its callee is not lexically a Pi
   * tool, so the carve-out and the shape rule both stand down. `schema` /
   * `enum` names are deliberately NOT here: they are not call-position
   * resolution arms (expressions.md §"Identifier resolution" ranks
   * local > fn > import > callable only), so a callee colliding with one
   * still resolves to the callable-set entry and keeps the tool's rules.
   */
  readonly fnImportDecls: ReadonlySet<string>;
  /** The Pi-tool subset of the callable set (bare-identifier `tools:` entries, post-`as`). */
  readonly piTools: ReadonlySet<string>;
  /** EVERY callable-set name — Pi tools AND `.theta` callables — post-rename. */
  readonly callables: ReadonlySet<string>;
  /**
   * RFC 0011 (seam sheet §5.1 / §0 C4): declared runtime tools, keyed by
   * PRESENTED (post-rename) name, valued by canonical name. Drives (a) the
   * lexical exemption from the Pi-tool object-literal shape rule (positional
   * typed arguments are the admitted spelling for runtime tools), and (b) the
   * `insideParFor`-gated `theta/parse/session-tool-in-isolated-body` check.
   * GOV-15 inert: empty for every 1.0.0-clean file.
   */
  readonly runtimeTools: ReadonlyMap<string, RuntimeToolName>;
  readonly file: string;
  readonly out: Diagnostic[];
}

/**
 * The whole-body lexical call-site walk. It resolves every `<name>(args)`
 * callee against the expressions.md §"Identifier resolution" first-match order
 * — tracking scopes exactly as `checkUnknownIdentifiers` does (whole-file
 * declarations visible everywhere; `let` bindings shadow from their binding
 * statement onward; `for` / `par for` variables, `match`-arm pattern bindings,
 * and `fn` parameters shadow inside their scopes; an `fn` body sees only the
 * whole-file declarations plus its own parameters — theta 1.0 has no
 * closures) — and emits four registered codes from that single resolution
 * judgement:
 *
 *   1. `theta/parse/shadowed-callable-call` (bug 0016,
 *      docs/bugs/0016-shadowed-tool-name-runtime-dispatch.md) for a call whose
 *      callee resolves to an arm-1 LOCAL while colliding with a callable-set
 *      name (Pi tool or `.theta` callable alike): locals are never callable
 *      (functions are not first-class), so the call site is erroneous — and
 *      before this gate existed the runtime executed the callable at a site
 *      that does not denote it (silently, for the object-literal and zero-arg
 *      forms). Binding the name without calling it stays legal: only CALL
 *      position emits.
 *   2. `theta/parse/tool-arg-arity` (bug 0072,
 *      docs/bugs/0072-tool-arg-checks-dead-and-no-runtime-net.md) for a call
 *      whose callee resolves to a Pi tool and carries MORE THAN ONE positional
 *      argument — tool-calls.md §"Argument shape": "A multi-argument form
 *      (`read({...}, {...})`) is `theta/parse/tool-arg-arity` regardless of
 *      the argument shapes." Emitted through `checkToolCallArguments`
 *      (../runtime/tool-call.ts) with no `argumentSource` supplied, so only
 *      its ARITY arm can fire from this call site; ranged on the CALL node,
 *      not on one argument — the mistake is the argument LIST, and the repair
 *      ("merge the arguments") is at the call.
 *   3. `theta/parse/tool-arg-not-object-literal` (bug 0003,
 *      docs/bugs/0003-tool-arg-shape-rule-not-enforced.md) for a call whose
 *      callee resolves to a Pi tool and carries EXACTLY ONE positional
 *      argument that is not an inline bare object literal — the surviving RFC
 *      0002 shape rule (grammar.md §"Pi-tool argument grammar": field VALUES
 *      are full expressions, the argument SHAPE is one inline `{ ... }`).
 *      Disjoint from (2) by construction — arity owns `> 1` arguments, this
 *      owns `=== 1` — so the two codes can never co-fire at one call site.
 *      Unchanged for unshadowed callees; a locally shadowed callee is not the
 *      tool, so the shape rule stands down there (the callee rejection above
 *      owns the site), and an fn/import-shadowed callee is a user-fn call.
 *      Emission mirrors the SHAPE arm of `checkToolCallArguments`
 *      (../runtime/tool-call.ts) rather than calling it for this arm too:
 *      that arm is gated on an `argumentSource` this walk never supplies (it
 *      owns AST nodes, not source text), so it is structurally unreachable
 *      from here — this walk keeps its own AST-based shape test instead,
 *      holding the message / severity / hint byte-identical to it (DIAG-4).
 *      Zero-argument calls are legal (`read()` lowers to `{}`).
 *   4. `theta/parse/bare-object-literal` (bug 0016 part B; bug 0072) for EVERY
 *      DIRECT bare-object argument of a call whose callee is NOT (lexically)
 *      an unshadowed Pi tool: expressions.md
 *      §"Object construction" scopes the carve-out to Pi-tool callees only —
 *      `f({ ... })` for a user `fn`, a `let`-bound name, a `.theta` callable,
 *      or a shadowed tool name is outside it, at every direct argument
 *      position, not only a sole one. The structural walk (`walkExpr`
 *      `case "call"`) suppresses the check for every direct-call-argument
 *      position UNCONDITIONALLY (position-based, callee-blind), so the two
 *      sites partition the emission (never double-emitting for one node):
 *      this lexical walk owns the callee-sensitive judgement for all of
 *      them, and both build the diagnostic through `bareObjectLiteralDiagnostic`
 *      so the message cannot drift. A Pi-tool callee's own direct arguments
 *      are already owned by (2) or (3) above, so this arm only ever fires
 *      under a non-Pi-tool callee.
 *
 * The walk REPORTS on shadowed names (bug 0016 superseded the earlier
 * under-reporting contract, whose runtime back-stop was loud only for
 * non-object argument nodes); the runtime lowerings still back-stop a gate
 * gap with `ShadowedCalleeDispatchDefectError` / `PiToolArgShapeDefectError`
 * (../runtime/tool-call.ts) — belts behind this gate, not substitutes for it.
 * The walk runs even with an empty callable set: emission (4) is
 * callee-sensitive, not tool-dependent, so `f({ ... })` in a tools-less theta
 * or a `.thetalib` is still rejected.
 */
function checkLexicalCallSites(
  body: Block,
  frontmatter: ParsedFrontmatter | null,
  file: string,
): Diagnostic[] {
  const piTools = new Set<string>();
  const callables = new Set<string>();
  for (const entry of frontmatter?.tools ?? []) {
    const piName = piToolCallableName(entry);
    if (piName !== undefined && piName.length > 0) {
      piTools.add(piName);
    }
    const presented = toolCallableName(entry);
    if (presented.length > 0) {
      callables.add(presented);
    }
  }

  const fnImportDecls = new Set<string>();
  for (const s of body.statements) {
    switch (s.kind) {
      case "fn":
        fnImportDecls.add(s.name);
        break;
      case "import":
        // expressions.md §"Identifier resolution" arm (3) is the import arm
        // only — an `export` specifier binds nothing (imports.md
        // §"Re-exports"), so it must not make a call site read as a known
        // fn/import callee.
        for (const sym of s.symbols) {
          fnImportDecls.add(sym);
        }
        break;
      default:
        break;
    }
  }

  const rootLocals = new Map<string, LocalBinder>();
  for (const f of frontmatter?.params?.fields ?? []) {
    rootLocals.set(f.wireName, { kind: "params-field" });
  }

  // RFC 0011 (seam sheet §5.1): derive the presented-name → canonical-name
  // map for runtime tools, so the walk can (a) exempt them from the Pi-tool
  // object-literal shape check and (b) emit the isolated-body diagnostic.
  const runtimeTools = runtimeToolPresentedNames(frontmatter?.tools);

  const walkCtx: CallSiteWalkContext = {
    rootLocals,
    fnImportDecls,
    piTools,
    callables,
    runtimeTools,
    file,
    out: [],
  };
  walkCallSiteBlock(body, new Map(rootLocals), false, walkCtx);
  return walkCtx.out;
}

function walkCallSiteBlock(
  block: Block,
  locals: Map<string, LocalBinder>,
  insideParFor: boolean,
  walkCtx: CallSiteWalkContext,
): void {
  for (const s of block.statements) {
    walkCallSiteStmt(s, locals, insideParFor, walkCtx);
  }
  if (block.tail !== null) {
    walkCallSiteExpr(block.tail, locals, insideParFor, walkCtx);
  }
}

function walkCallSiteStmt(
  s: Stmt,
  locals: Map<string, LocalBinder>,
  insideParFor: boolean,
  walkCtx: CallSiteWalkContext,
): void {
  switch (s.kind) {
    case "let":
      // The initialiser is evaluated BEFORE the name binds, so a tool call in
      // it still resolves to the tool; the binding shadows from here onward.
      if (s.init !== null) {
        walkCallSiteExpr(s.init, locals, insideParFor, walkCtx);
      }
      if (s.name !== "_") {
        locals.set(s.name, { kind: "let", line: s.range.start.line });
      }
      return;
    case "reassign":
      walkCallSiteExpr(s.value, locals, insideParFor, walkCtx);
      return;
    case "if": {
      walkCallSiteExpr(s.condition, locals, insideParFor, walkCtx);
      walkCallSiteBlock(s.then, new Map(locals), insideParFor, walkCtx);
      if (s.otherwise !== null) {
        if ("statements" in s.otherwise) {
          walkCallSiteBlock(s.otherwise, new Map(locals), insideParFor, walkCtx);
        } else {
          walkCallSiteStmt(s.otherwise, new Map(locals), insideParFor, walkCtx);
        }
      }
      return;
    }
    case "while":
      walkCallSiteExpr(s.condition, locals, insideParFor, walkCtx);
      walkCallSiteBlock(s.body, new Map(locals), insideParFor, walkCtx);
      return;
    case "for": {
      walkCallSiteExpr(s.iterand, locals, insideParFor, walkCtx);
      const inner = new Map(locals);
      inner.set(s.variable, { kind: "for", line: s.range.start.line });
      walkCallSiteBlock(s.body, inner, insideParFor, walkCtx);
      return;
    }
    case "fn": {
      // Closure-free (`walkIdentStmt` precedent): an `fn` body sees only the
      // whole-file declarations plus its own parameters, so a tool call inside
      // a helper body is still a tool call — `fn helper() { read(args) }`
      // fires — while `fn f(read) { read(x) }` is parameter-shadowed. A
      // `FnParam` carries no range of its own; the declaration's start line
      // locates the parameter list.
      // RFC 0011 (seam sheet §0 C4): an `fn` body resets `insideParFor` to
      // false — a plain `fn` called from outside the body is admitted, and
      // `fn` nested inside a `par for` body is `theta/parse/nested-fn` (FN-1)
      // so the reset is parse-error tolerance only.
      const fnLocals = new Map(walkCtx.rootLocals);
      for (const p of s.params) {
        fnLocals.set(p.name, { kind: "fn-param", line: s.range.start.line });
      }
      walkCallSiteBlock(s.body, fnLocals, false, walkCtx);
      return;
    }
    case "return":
      if (s.operand !== null) {
        walkCallSiteExpr(s.operand, locals, insideParFor, walkCtx);
      }
      return;
    case "query":
      walkCallSiteExpr(s.query, locals, insideParFor, walkCtx);
      return;
    case "tool-call":
      walkCallSiteExpr(s.call, locals, insideParFor, walkCtx);
      return;
    case "invoke":
      walkCallSiteExpr(s.invoke, locals, insideParFor, walkCtx);
      return;
    case "expr":
      walkCallSiteExpr(s.expr, locals, insideParFor, walkCtx);
      return;
    default:
      // schema / enum / import / export / break / continue / doc-comment carry
      // no call sites (fn / import names were pre-collected as whole-file
      // declarations; schema / enum names are not resolution arms).
      return;
  }
}

function walkCallSiteExpr(
  e: Expr,
  locals: Map<string, LocalBinder>,
  insideParFor: boolean,
  walkCtx: CallSiteWalkContext,
): void {
  switch (e.kind) {
    case "call": {
      const localBinder = locals.get(e.callee);
      checkCallSiteCall(e, localBinder, insideParFor, walkCtx);
      // RFC 0009: the clause values are recursed as arguments are (the direct
      // bare-object carve-out above is about the ARGUMENT list only — a clause
      // value holds no `ToolArg` position).
      for (const arg of [...e.args, ...callWithClauseValues(e)]) {
        walkCallSiteExpr(arg, locals, insideParFor, walkCtx);
      }
      return;
    }
    case "binary":
      walkCallSiteExpr(e.left, locals, insideParFor, walkCtx);
      walkCallSiteExpr(e.right, locals, insideParFor, walkCtx);
      return;
    case "ternary":
      walkCallSiteExpr(e.condition, locals, insideParFor, walkCtx);
      walkCallSiteExpr(e.consequent, locals, insideParFor, walkCtx);
      walkCallSiteExpr(e.alternate, locals, insideParFor, walkCtx);
      return;
    case "try":
      walkCallSiteExpr(e.operand, locals, insideParFor, walkCtx);
      return;
    case "invoke":
      for (const arg of [...e.args, ...callWithClauseValues(e)]) {
        walkCallSiteExpr(arg, locals, insideParFor, walkCtx);
      }
      return;
    case "member":
      walkCallSiteExpr(e.target, locals, insideParFor, walkCtx);
      return;
    case "index":
      walkCallSiteExpr(e.target, locals, insideParFor, walkCtx);
      walkCallSiteExpr(e.index, locals, insideParFor, walkCtx);
      return;
    case "method-call":
      walkCallSiteExpr(e.target, locals, insideParFor, walkCtx);
      for (const arg of e.args) {
        walkCallSiteExpr(arg, locals, insideParFor, walkCtx);
      }
      return;
    case "object":
      // RFC 0002: field VALUES are full expressions — a nested call inside a
      // legal `{ ... }` argument is itself checked. Bare-object legality in
      // non-call-argument positions stays the structural walk's concern.
      for (const field of e.fields) {
        walkCallSiteExpr(field.value, locals, insideParFor, walkCtx);
      }
      return;
    case "array":
      for (const el of e.elements) {
        walkCallSiteExpr(el, locals, insideParFor, walkCtx);
      }
      return;
    case "result-ctor":
      walkCallSiteExpr(e.arg, locals, insideParFor, walkCtx);
      return;
    case "match":
      walkCallSiteExpr(e.scrutinee, locals, insideParFor, walkCtx);
      for (const arm of e.arms) {
        // A pattern node carries no range; the arm's BODY starts on the arm's
        // own line, so its start line locates the binding for the message.
        const bound = new Set<string>();
        collectPatternBindings(arm.pattern, bound);
        const armLocals = new Map(locals);
        for (const name of bound) {
          armLocals.set(name, { kind: "match", line: arm.body.range.start.line });
        }
        walkCallSiteExpr(arm.body, armLocals, insideParFor, walkCtx);
      }
      return;
    case "par-for": {
      // Reached explicitly (unlike the ident walk, which predates RFC 0003):
      // a `par for` body is a call-site-bearing block and its per-iteration
      // variable shadows.
      // RFC 0011 (seam sheet §0 C4): the body descends with `insideParFor`
      // true; the iterand and max stay under the caller's flag.
      walkCallSiteExpr(e.iterand, locals, insideParFor, walkCtx);
      if (e.max !== null) {
        walkCallSiteExpr(e.max, locals, insideParFor, walkCtx);
      }
      const inner = new Map(locals);
      inner.set(e.variable, { kind: "par-for", line: e.range.start.line });
      walkCallSiteBlock(e.body, inner, true, walkCtx);
      return;
    }
    case "block":
      // A CHILD scope, mirroring `walkIdentExpr`'s `case "block"` above: a
      // call site inside the block still resolves against the enclosing
      // locals, but a name the block's own `let`s bind must not survive past
      // it.
      walkCallSiteBlock(e.body, new Map(locals), insideParFor, walkCtx);
      return;
    default:
      // number / string / bool / null / ident / query — no call sites (a
      // query's `${…}` interpolations live in its raw template text, not as
      // AST children).
      return;
  }
}

/**
 * Reject the interpolation forms expressions.md §"Not supported" forbids
 * inside a `@`-query `${…}`, and — the settled route for bug 0122 — surface
 * every OTHER parse-*parser*-phase diagnostic the same interpolation source
 * would draw at `let`-RHS level, relocated to the enclosing `@`-query's range
 * (`file` = this walk's `file` parameter, `range` = `e.range`).
 * `QueryTemplatePart` carries no per-interpolation offsets (bug 0079's
 * constraint), so the enclosing query's range is the only locatable site; two
 * interpolations in one template therefore draw two diagnostics at the SAME
 * range, one per offence, never collapsed into one.
 *
 * Leading-offence precedence, load-bearing: the forbidden-form / forbidden-
 * token check below runs FIRST. When it fires for a part, that one diagnostic
 * is the ONLY thing pushed for that part and the parser's own collected
 * diagnostics for it are dropped (`continue`) — this is what keeps `match` and
 * a nested `@`-query at exactly one interpolation-attributed diagnostic each
 * (mirrors bug 0175's landed ordering rule for the sibling position).
 *
 * The unparsable arm (`expr === null`) is UNCHANGED from before this fix: run
 * the token scan, push its diagnostic if it fires, and otherwise push NOTHING
 * and `continue`. The drain can still collect on this path — `${= 1}` parses
 * to `null` and drains the whole statement loop's
 * `theta/parse/unsupported-feature` verdict for the stray `=` — but the
 * `continue` deliberately drops whatever was collected so the unparsable
 * arm's disposition stays byte-identical to its pre-fix disposition (route
 * settlement), leaving the token scan as this arm's sole reporter. A STATED
 * parity exception to the one-sentence rule, not an empty set (bug doc §Fix
 * (a): "what happens to an interpolation that does not parse" must be
 * stated).
 */
function checkQueryTemplateInterpolations(
  e: QueryExpr,
  file: string,
  out: Diagnostic[],
): void {
  for (const part of lexQueryTemplate(e.template).parts) {
    if (part.kind !== "interp") {
      continue;
    }
    const { expr: parsed, diagnostics: collected } = parseInterpolationSource(part.exprSource);
    if (parsed === null) {
      // A malformed interpolation must still not silently smuggle a forbidden
      // `match` / nested `@`-query past the AST walk (which is unavailable when
      // the source does not parse). Both are reserved forms — `match` a
      // keyword, `@` a punct — so a token-level scan cannot false-positive on
      // string-literal contents; flag it rather than skipping.
      const tokenForbidden = firstForbiddenInterpolationToken(part.exprSource);
      if (tokenForbidden !== null) {
        out.push({
          severity: "error",
          code: "theta/parse/unsupported-feature",
          file,
          range: e.range,
          message:
            "unsupported syntactic feature: " +
            tokenForbidden +
            " inside ${...} interpolation",
        });
      }
      continue;
    }
    const forbidden = firstForbiddenInterpolationForm(parsed);
    if (forbidden !== null) {
      out.push({
        severity: "error",
        code: "theta/parse/unsupported-feature",
        file,
        range: e.range,
        message:
          "unsupported syntactic feature: " +
          forbidden +
          " inside ${...} interpolation",
      });
      continue;
    }
    for (const d of collected) {
      out.push({ ...d, file, range: e.range });
    }
  }
}

/**
 * A forbidden interpolation construct detected at the TOKEN level, for the
 * malformed-interpolation path where `parseInterpolationSource` returns a
 * `null` `expr` and the AST walk is unavailable. `match` is a reserved keyword and `@` a punct, so
 * a token match is unambiguous (never a string-literal false positive). Returns
 * `"match"` / `"@-query template"` for the first such token, else `null`.
 */
function firstForbiddenInterpolationToken(source: string): string | null {
  const lex = lexSnippetSource(source);
  for (const t of lex.tokens) {
    if (t.kind === "keyword" && t.text === "match") {
      return "match";
    }
    if (t.kind === "punct" && t.text === "@") {
      return "@-query template";
    }
  }
  return null;
}

/**
 * The construct name of the first `match` or nested `@`-query node in `e`'s
 * subtree (`"match"` / `"@-query template"`), or `null` when none is present.
 * Walks the child expressions so a `match` / `@`-query buried in a larger
 * interpolation expression (`${1 + match … }`) is still caught.
 */
function firstForbiddenInterpolationForm(e: Expr): string | null {
  if (e.kind === "match") {
    return "match";
  }
  if (e.kind === "query") {
    return "@-query template";
  }
  for (const child of expressionChildExprs(e)) {
    const found = firstForbiddenInterpolationForm(child);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

/**
 * The direct child expressions of `e` (for the interpolation-form scan and the
 * `.thetalib` clause collector above). A call/invoke node's call-site `with`
 * clause values are children exactly as its arguments are (RFC 0009: the
 * positional restrictions inside a clause value are an argument's), so every
 * consumer of this accessor judges them.
 */
function expressionChildExprs(e: Expr): readonly Expr[] {
  switch (e.kind) {
    case "binary":
      return [e.left, e.right];
    case "ternary":
      return [e.condition, e.consequent, e.alternate];
    case "try":
      return [e.operand];
    case "call":
    case "invoke":
      return [...e.args, ...callWithClauseValues(e)];
    case "member":
      return [e.target];
    case "index":
      return [e.target, e.index];
    case "object":
      return e.fields.map((f) => f.value);
    case "match":
      return [e.scrutinee, ...e.arms.map((arm) => arm.body)];
    case "result-ctor":
      return [e.arg];
    case "method-call":
      return [e.target, ...e.args];
    case "array":
      return e.elements;
    default:
      return [];
  }
}

// --------------------------------------------------------------------------
// Typed-query detection walk (bug 0010 increment C — the load-time provider
// gate's `hasTypedQuery` input)
// --------------------------------------------------------------------------

/**
 * Whether the parsed body contains at least one TYPED query expression — a
 * `QueryExpr` whose `schema` is non-null (an explicit `@<Schema>` ascription, a
 * direct-let propagation, or the post-parse QRY-2 inference; all three land on
 * `QueryExpr.schema` before the body reaches load-time consumers).
 *
 * WHY (bug 0010, conversation-drive.md §"Provider compatibility for typed
 * queries"): the load-time `theta/load/typed-query-unsupported-provider`
 * warning fires only when the theta CARRIES a typed query, so the check needs a
 * TOTAL walk over every expression-bearing position — top-level statements and
 * the body tail, `let` initializers, `fn` / `subagent fn` bodies, match arms,
 * and nested control flow. A missed nesting is a silent false negative (the
 * warning never fires for that theta), so the walk is exhaustive over the
 * `Stmt` / `Expr` unions in the `walkCallSiteStmt` / `walkCallSiteExpr` house
 * style.
 */
export function detectTypedQueryExpression(body: ThetaBody): boolean {
  return typedQueryInBlock(body);
}

function typedQueryInBlock(block: Block): boolean {
  for (const stmt of block.statements) {
    if (typedQueryInStmt(stmt)) {
      return true;
    }
  }
  return block.tail !== null && typedQueryInExpr(block.tail);
}

function typedQueryInStmt(stmt: Stmt): boolean {
  switch (stmt.kind) {
    case "let":
      return stmt.init !== null && typedQueryInExpr(stmt.init);
    case "reassign":
      return typedQueryInExpr(stmt.value);
    case "if":
      return (
        typedQueryInExpr(stmt.condition) ||
        typedQueryInBlock(stmt.then) ||
        (stmt.otherwise !== null &&
          ("statements" in stmt.otherwise
            ? typedQueryInBlock(stmt.otherwise)
            : typedQueryInStmt(stmt.otherwise)))
      );
    case "while":
      return typedQueryInExpr(stmt.condition) || typedQueryInBlock(stmt.body);
    case "for":
      return typedQueryInExpr(stmt.iterand) || typedQueryInBlock(stmt.body);
    case "fn":
      // An ordinary `fn` AND a `subagent fn` alike: their bodies' queries run
      // typed dispatches at call time, so both count as "contains".
      return typedQueryInBlock(stmt.body);
    case "return":
      return stmt.operand !== null && typedQueryInExpr(stmt.operand);
    case "query":
      return typedQueryInExpr(stmt.query);
    case "tool-call":
      return typedQueryInExpr(stmt.call);
    case "invoke":
      return typedQueryInExpr(stmt.invoke);
    case "expr":
      return typedQueryInExpr(stmt.expr);
    case "break":
    case "continue":
    case "schema":
    case "enum":
    case "import":
    case "export":
    case "doc-comment":
      // No expression positions (a query cannot occur inside these).
      return false;
  }
}

function typedQueryInExpr(expr: Expr): boolean {
  switch (expr.kind) {
    case "query":
      // The detection point: a non-null schema (explicit, propagated, or
      // inferred) makes the query typed. A query's `${…}` interpolations live
      // in its raw template text, not as AST children, so there is nothing to
      // descend into.
      return expr.schema !== null;
    case "binary":
      return typedQueryInExpr(expr.left) || typedQueryInExpr(expr.right);
    case "ternary":
      return (
        typedQueryInExpr(expr.condition) ||
        typedQueryInExpr(expr.consequent) ||
        typedQueryInExpr(expr.alternate)
      );
    case "try":
      return typedQueryInExpr(expr.operand);
    case "call":
    case "invoke":
      // RFC 0009: a typed query inside a call-site `with` clause value counts
      // exactly as one inside an argument.
      return [...expr.args, ...callWithClauseValues(expr)].some(typedQueryInExpr);
    case "member":
      return typedQueryInExpr(expr.target);
    case "index":
      return typedQueryInExpr(expr.target) || typedQueryInExpr(expr.index);
    case "object":
      return expr.fields.some((field) => typedQueryInExpr(field.value));
    case "array":
      return expr.elements.some(typedQueryInExpr);
    case "match":
      return (
        typedQueryInExpr(expr.scrutinee) ||
        expr.arms.some((arm) => typedQueryInExpr(arm.body))
      );
    case "result-ctor":
      return typedQueryInExpr(expr.arg);
    case "method-call":
      return typedQueryInExpr(expr.target) || expr.args.some(typedQueryInExpr);
    case "par-for":
      return (
        typedQueryInExpr(expr.iterand) ||
        (expr.max !== null && typedQueryInExpr(expr.max)) ||
        typedQueryInBlock(expr.body)
      );
    case "block":
      // grammar.md:118's tail is required, but a parse rejection does not stop
      // this walk from running over the rejected AST — `typedQueryInBlock`
      // itself is `tail !== null`-guarded, so a tail-less block contributes
      // nothing here rather than throwing.
      return typedQueryInBlock(expr.body);
    case "ident":
    case "number":
    case "string":
    case "bool":
    case "null":
      // Leaves: no child expressions.
      return false;
  }
}

// --------------------------------------------------------------------------
// Session typed-query enumeration walk (bug 0488 — the launch-time respond-
// tool-allowlist seam)
// --------------------------------------------------------------------------

/**
 * Every typed `QueryExpr` (`schema !== null`) that the SESSION driving `body`
 * will itself dispatch, in source order.
 *
 * WHY this walk exists separately from `detectTypedQueryExpression` (bug
 * 0488, not a rename): that walk answers "does this theta contain a typed
 * query anywhere", for a load-time provider-compatibility warning, so it
 * deliberately DESCENDS a `subagent fn` body too — the warning must still
 * fire for a typed query that only a spawned child ever runs. This walk
 * instead answers "which respond-tool names must THIS session's own launch
 * carry on its `--tools` allowlist", so it must STOP at a `subagent fn`
 * boundary (FN-7): a `subagent fn` body is driven by the CHILD session that
 * fn's own launch spawns, not by the session walking the enclosing body, and
 * that child computes its own respond names from the same walk applied to
 * its own body. Descending here would smuggle a callee's respond names onto
 * the caller's allowlist (and vice versa never happens — the caller's names
 * are never needed by the callee). An ordinary `fn` body IS descended: it
 * runs inline in the same session that reaches its call, exactly as
 * `detectTypedQueryExpression` treats it.
 *
 * Exhaustive over the same `Stmt` / `Expr` positions as `typedQueryInStmt` /
 * `typedQueryInExpr` — a missed nesting here is a silent gap in the launch
 * allowlist, not merely a missed warning.
 */
export function collectSessionTypedQueries(body: ThetaBody): QueryExpr[] {
  const collected: QueryExpr[] = [];
  collectSessionTypedQueriesInBlock(body, collected);
  return collected;
}

function collectSessionTypedQueriesInBlock(block: Block, out: QueryExpr[]): void {
  for (const stmt of block.statements) {
    collectSessionTypedQueriesInStmt(stmt, out);
  }
  if (block.tail !== null) {
    collectSessionTypedQueriesInExpr(block.tail, out);
  }
}

function collectSessionTypedQueriesInStmt(stmt: Stmt, out: QueryExpr[]): void {
  switch (stmt.kind) {
    case "let":
      if (stmt.init !== null) {
        collectSessionTypedQueriesInExpr(stmt.init, out);
      }
      return;
    case "reassign":
      collectSessionTypedQueriesInExpr(stmt.value, out);
      return;
    case "if":
      collectSessionTypedQueriesInExpr(stmt.condition, out);
      collectSessionTypedQueriesInBlock(stmt.then, out);
      if (stmt.otherwise !== null) {
        if ("statements" in stmt.otherwise) {
          collectSessionTypedQueriesInBlock(stmt.otherwise, out);
        } else {
          collectSessionTypedQueriesInStmt(stmt.otherwise, out);
        }
      }
      return;
    case "while":
      collectSessionTypedQueriesInExpr(stmt.condition, out);
      collectSessionTypedQueriesInBlock(stmt.body, out);
      return;
    case "for":
      collectSessionTypedQueriesInExpr(stmt.iterand, out);
      collectSessionTypedQueriesInBlock(stmt.body, out);
      return;
    case "fn":
      // FN-7 boundary: a `subagent fn` body is driven by ITS OWN launch's
      // session, not by the session walking the enclosing body — do not
      // descend. An ordinary `fn` body runs inline here, so it IS descended.
      if (!stmt.subagent) {
        collectSessionTypedQueriesInBlock(stmt.body, out);
      }
      return;
    case "return":
      if (stmt.operand !== null) {
        collectSessionTypedQueriesInExpr(stmt.operand, out);
      }
      return;
    case "query":
      collectSessionTypedQueriesInExpr(stmt.query, out);
      return;
    case "tool-call":
      collectSessionTypedQueriesInExpr(stmt.call, out);
      return;
    case "invoke":
      collectSessionTypedQueriesInExpr(stmt.invoke, out);
      return;
    case "expr":
      collectSessionTypedQueriesInExpr(stmt.expr, out);
      return;
    case "break":
    case "continue":
    case "schema":
    case "enum":
    case "import":
    case "export":
    case "doc-comment":
      // No expression positions (a query cannot occur inside these).
      return;
    default: {
      // Compile-time exhaustiveness backstop: a future `Stmt` union member
      // trips a `tsc` error here rather than being silently dropped from the
      // launch allowlist (the silent gap this collector's header warns of).
      const _exhaustive: never = stmt;
      return void _exhaustive;
    }
  }
}

function collectSessionTypedQueriesInExpr(expr: Expr, out: QueryExpr[]): void {
  switch (expr.kind) {
    case "query":
      if (expr.schema !== null) {
        out.push(expr);
      }
      return;
    case "binary":
      collectSessionTypedQueriesInExpr(expr.left, out);
      collectSessionTypedQueriesInExpr(expr.right, out);
      return;
    case "ternary":
      collectSessionTypedQueriesInExpr(expr.condition, out);
      collectSessionTypedQueriesInExpr(expr.consequent, out);
      collectSessionTypedQueriesInExpr(expr.alternate, out);
      return;
    case "try":
      collectSessionTypedQueriesInExpr(expr.operand, out);
      return;
    case "call":
    case "invoke":
      // RFC 0009: a typed query inside a call-site `with` clause value counts
      // exactly as one inside an argument.
      for (const child of [...expr.args, ...callWithClauseValues(expr)]) {
        collectSessionTypedQueriesInExpr(child, out);
      }
      return;
    case "member":
      collectSessionTypedQueriesInExpr(expr.target, out);
      return;
    case "index":
      collectSessionTypedQueriesInExpr(expr.target, out);
      collectSessionTypedQueriesInExpr(expr.index, out);
      return;
    case "object":
      for (const field of expr.fields) {
        collectSessionTypedQueriesInExpr(field.value, out);
      }
      return;
    case "array":
      for (const element of expr.elements) {
        collectSessionTypedQueriesInExpr(element, out);
      }
      return;
    case "match":
      collectSessionTypedQueriesInExpr(expr.scrutinee, out);
      for (const arm of expr.arms) {
        collectSessionTypedQueriesInExpr(arm.body, out);
      }
      return;
    case "result-ctor":
      collectSessionTypedQueriesInExpr(expr.arg, out);
      return;
    case "method-call":
      collectSessionTypedQueriesInExpr(expr.target, out);
      for (const arg of expr.args) {
        collectSessionTypedQueriesInExpr(arg, out);
      }
      return;
    case "par-for":
      collectSessionTypedQueriesInExpr(expr.iterand, out);
      if (expr.max !== null) {
        collectSessionTypedQueriesInExpr(expr.max, out);
      }
      collectSessionTypedQueriesInBlock(expr.body, out);
      return;
    case "block":
      // grammar.md:118's tail is required, but a parse rejection does not stop
      // this walk from running over the rejected AST — `collectSessionTypedQueriesInBlock`
      // itself is `tail !== null`-guarded, so a tail-less block contributes
      // nothing here rather than throwing.
      collectSessionTypedQueriesInBlock(expr.body, out);
      return;
    case "ident":
    case "number":
    case "string":
    case "bool":
    case "null":
      // Leaves: no child expressions.
      return;
    default: {
      // Compile-time exhaustiveness backstop: a future `Expr` union member
      // trips a `tsc` error here rather than being silently dropped from the
      // launch allowlist (the silent gap this collector's header warns of).
      const _exhaustive: never = expr;
      return void _exhaustive;
    }
  }
}
