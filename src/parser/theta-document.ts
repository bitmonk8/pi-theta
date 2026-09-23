// V19a / V19a-T — the whole-`.theta`/`.thetalib` program-parser seam.
//
// This module orchestrates the parser seam, delegates body parsing, structural
// checks, doc-comment recovery, identifier resolution and the lexical
// call-site walk to sibling modules, and re-exports their seams and the
// `theta-ast` contract:
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
import { inertSystemNoteChannel } from "../extension/system-note-channel";
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
  type ParsedFrontmatter,
  type ParsedToolLoop,
  type ParsedRespondRepair,
} from "./frontmatter";
import type { EnumValueKind } from "./schema-declarations";
import { checkTypeLayer, childExprs, paramsFieldsFromFrontmatter } from "./type-layer-checks";
import { resolveQuerySchemas, type QueryPropagation } from "./query-schema-resolve";
import {
  buildBodyTypeSchemas,
  type SchemaSlugCollision,
} from "./body-type-lowering";
import {
  type ParamFieldInput,
} from "./params";
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
import { thetaDefaultName } from "./callable-set";
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
} from "./structural-checks";
import {
  attachDocDescriptions,
  mergeByLine,
  scanDocComments,
  splitFrontmatter,
  templateProseLineSpans,
} from "./doc-comment-recovery";
import { checkUnknownIdentifiers, collectIdentRoots } from "./ident-resolution";
import { buildRuntimeToolSuccessTypes, checkLexicalCallSites } from "./lexical-call-sites";

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
  checkQueryTemplateInterpolations,
  classifyEnumValueToken,
  nullExpr,
  piToolCallableName,
  positionToOffset,
  schemaTypeNotExpressionDiagnostic,
  toolArgShapeDiagnostic,
  toolCallableName,
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
  // C2a wiring — see `checkStructural`'s own doc block (structural-checks.ts).
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

  // REQ-EXPR-7 (expressions.md §"Identifier resolution") — the seed sets are
  // built by `identifierRootSeeds` below; `checkUnknownIdentifiers`'s own doc
  // comment (ident-resolution.ts) states the three-way judgement the walk
  // makes, including the value-position refusal `theta/parse/type-as-value`.
  const { identRoots, nonDeclarationRoots, typeOnlyNames } = identifierRootSeeds(
    statements,
    frontmatter,
    bodyTypes,
  );
  const unknownIdentDiags = checkUnknownIdentifiers(
    { statements, tail: resolvedTail },
    {
      roots: nonDeclarationRoots,
      typeOnlyNames,
      declaredEnums: bodyTypes.enums,
    },
    file,
  );

  // grammar.md `NamedValueLit`'s two NAME-resolution side conditions — see
  // `checkParamsDefaultNames`' own doc block (structural-checks.ts).
  const paramsDefaultNameDiags = checkParamsDefaultNames(
    paramFields,
    hoistEnumVariants(statements),
    identRoots,
    frontmatterRefusedRanges,
    file,
  );

  // Bugs 0003/0016 — see `checkLexicalCallSites`' own doc block
  // (lexical-call-sites.ts) for the four codes one callee resolution emits.
  const callSiteLexicalDiags = checkLexicalCallSites(
    { statements, tail: resolvedTail },
    frontmatter,
    file,
  );

  // RFC 0011 (seam sheet §0 C6) — see `buildRuntimeToolSuccessTypes`' own doc
  // block (lexical-call-sites.ts).
  const runtimeToolSuccessTypes = buildRuntimeToolSuccessTypes(
    frontmatter?.tools,
  );
  // C-bucket wiring (V20c) — see `checkTypeLayer`'s own doc block
  // (type-layer-checks.ts), including the `wireName` NAME-KEYING ADJUDICATION
  // for the `params:` projection below.
  const typeLayerDiags = checkTypeLayer(
    { statements, tail: resolvedTail },
    file,
    paramsFieldsFromFrontmatter(frontmatter?.params?.fields),
    runtimeToolSuccessTypes,
  );

  // imports.md §"`.thetalib` file rules" — see `checkThetaLibTopLevel`'s own
  // doc block; keyed off the file's `.thetalib` extension (byte-exact
  // lowercase), so it never fires for a `.theta` (IMP-4).
  const thetalibTopLevelDiags = file.endsWith(".thetalib")
    ? checkThetaLibTopLevel({ statements, tail: resolvedTail }, file)
    : [];

  // RFC 0009 (invocation.md INV-8 default-reject) — see
  // `checkThetaLibCallWithClauses`' own doc block; keyed on the same
  // `.thetalib` discriminator as the top-level-form check above.
  const thetalibCallWithClauseDiags = file.endsWith(".thetalib")
    ? checkThetaLibCallWithClauses({ statements, tail: resolvedTail }, file)
    : [];

  // Bugs 0446/0447 §Fix Option 1 — see `checkStatementPlacement`'s own doc
  // block below.
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
 * Build the three identifier seed sets the unknown-identifier walk and the
 * `params:`-default name check read (REQ-EXPR-7, expressions.md §"Identifier
 * resolution").
 *
 * `collectIdentRoots` itself is UNCHANGED (see its doc comment,
 * ident-resolution.ts) — it is called a SECOND time here, over the
 * `schema`/`enum`-free statement list, so `nonDeclarationRoots` holds every
 * name a genuine value-binding source contributes, while `identRoots` (read
 * at `checkParamsDefaultNames`'s call) keeps answering that function's own
 * whole-file resolvability question unchanged — reusing one function for both
 * calls is what keeps the two seeds from drifting apart. `typeOnlyNames` is
 * then every declared `schema` / `enum` name `nonDeclarationRoots` does NOT
 * also claim — a name only a declaration introduces and no value-binding
 * source also binds. `bodyTypes.imports` is deliberately excluded from that
 * subtraction's candidates: an imported symbol is resolution arm (3)
 * (expressions.md:48), a genuine value, and it is already inside
 * `nonDeclarationRoots` regardless (an `import` statement is not filtered out
 * of the filtered list below).
 */
function identifierRootSeeds(
  statements: readonly Stmt[],
  frontmatter: ParsedFrontmatter | null,
  bodyTypes: FrontmatterBodyTypes,
): {
  identRoots: Set<string>;
  nonDeclarationRoots: Set<string>;
  typeOnlyNames: Set<string>;
} {
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
  return { identRoots, nonDeclarationRoots, typeOnlyNames };
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
   * `childExprs`' `call` / `invoke` arm (type-layer-checks.ts).
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
      for (const child of childExprs(e)) {
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
 * channel comes from the one shared factory (`inertSystemNoteChannel`, the
 * PTQ-1237 consolidation) rather than inline per site; it constructs the
 * deps fresh per call, keeping the snippet helpers free of shared state —
 * no module-level mutable channel.
 */
function lexSnippetSource(source: string): LexResult {
  return lexTheta(
    { path: "<interpolation>", bytes: encodeSource(source) },
    inertSystemNoteChannel(),
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
 * `lowerTypeExpr`'s trailing catch-all (params-lowering.ts) carrying a FRAGMENT no
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
  for (const child of childExprs(e)) {
    const found = firstForbiddenInterpolationForm(child);
    if (found !== null) {
      return found;
    }
  }
  return null;
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
