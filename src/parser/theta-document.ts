// V19a / V19a-T — the whole-`.theta`/`.thetalib` program-parser seam.
//
// This module owns the parser seam the paired `V19a` implementation leaf fills
// in: `parseThetaDocument(source, deps)` parses the *entire* `.theta` / `.thetalib`
// file into an executable body statement-list AST — the grammar.md
// §"Block expressions" `ThetaBody ::= Stmt* Expr?` production — alongside the
// parsed frontmatter, and aggregates the whole-file multi-error diagnostic set
// by delegating each top-level statement / declaration to the existing V-slice
// parse-checkers over the real AST (`cka-49`,
// implementation-notes.md §Parser *Contract*).
//
// The body AST this seam produces is the node stream `V19c`'s statement
// executor walks and `V19e`'s composition producer parses; the AST node types
// declared here are that cross-leaf contract.
//
// V19a-T (tests-task) declares the AST node shapes and stubs `parseThetaDocument`
// inertly: it returns `{ frontmatter: null, body: { statements: [], tail: null },
// diagnostics: [] }` regardless of input. Every paired V19a-T test therefore
// reds on its own primary assertion — an empty body where a `LetStmt` /
// `IfStmt` / `SchemaDecl` / … node was expected, a missing tail `Expr`, a wrong
// statement count where newline-continuation should have joined (or split) a
// statement, or an empty `diagnostics` array where the delegated checkers should
// have aggregated multiple sorted errors — not on a compile error, a missing
// fixture, or a harness throw. The paired V19a implementation leaf fills the
// parser in.
//
// Spec: implementation-notes.md (§Parser *Contract*), grammar.md
// (§"Block expressions", §"fn declarations", §"schema X by <field>",
// §"/// placement", §"Newline continuation"), bindings.md, control-flow.md,
// functions.md, return.md, expressions.md, frontmatter.md, descriptions.md,
// schemas.md, imports.md, invocation.md, diagnostics.md.

import type { Diagnostic, Position, SourceRange } from "../diagnostics/diagnostic";
import { assembleDiagnostics } from "../diagnostics/diagnostic";
import { firstInvalidUtf8Offset, lexTheta, type ThetaSource, type Token } from "../lexer/lexer";
import { validatePathLiteral } from "../lexer/literals";
import {
  checkImportDanglingAlias,
  checkImportMalformedSpecifierList,
  checkImportMissingFromClause,
  checkImportReservedSynthesisedName,
  checkImportSeparatorDegenerateSpecifierList,
  checkThetaLibTopLevelForm,
  type ImportSpecifier,
  type ThetaLibTopLevelForm,
} from "./imports";
import { emitDiagnosticBatch, type SystemNoteChannelDeps } from "../extension/system-note-channel";
import {
  parseFrontmatter,
  type FrontmatterBodyTypes,
  type ModelReferenceMatcher,
  type ParsedFrontmatter,
  type ParsedToolLoop,
  type ParsedRespondRepair,
} from "./frontmatter";
import {
  checkReassignment,
  checkLetBinding,
  checkAssignmentTarget,
  checkMutModifier,
  checkIncrementDecrement,
} from "./bindings";
import { checkDocCommentPlacement, joinDocComment } from "./descriptions";
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
  checkDiscriminatedUnion,
  detectTypeAliasCycles,
  type EnumValueKind,
  type EnumVariantDecl,
  type ByClauseDecl,
  type DiscriminatedUnionDecl,
  type DiscriminatorCandidateField,
  type SchemaDeclSite,
  type SchemaGraphNode,
  type UnionVariantSchema,
} from "./schema-declarations";
import { parseTypeExpression } from "./type-grammar";
import { checkObjectLiteralFields } from "./literal-sublanguage";
import { annotationSourceIsNotTypeExpression, checkTypeLayer } from "./type-layer-checks";
import {
  resolveQuerySchemas,
  type PropagationCapture,
  type QueryPropagation,
} from "./query-schema-resolve";
import {
  buildBodyTypeSchemas,
  collectUnresolvedNamedTypes,
  isSingleEnclosingBraceGroup,
  type SchemaSlugCollision,
} from "./body-type-lowering";
import {
  isUnspellableTextRefusable,
  splitTopLevel,
  splitTopLevelSegments,
  type ParamFieldInput,
} from "./params";
// QRY-19 lives in the runtime discard module (it owns the discarded-query
// discipline shared with the QRY-20 runtime obligation); the parser reuses its
// pure parse-time check rather than re-deriving the diagnostic. Parser→runtime
// type/pure-function imports are an established pattern (system-interpolation,
// type-layer-checks).
import { checkDiscardedQueryResult } from "../runtime/query-discard";
// Bug 0072 (tool-calls.md §"Argument shape"): the parser's lexical call-site
// walk emits the shared arity check's ARITY arm directly (no `argumentSource`,
// so only that arm can fire from this site) instead of re-deriving the
// message/severity locally — the same parser→runtime reuse pattern as
// `checkDiscardedQueryResult` above.
import { checkToolCallArguments } from "../runtime/tool-call";
// A `@`-query template body is captured verbatim at parse time; its `${…}`
// interpolations are re-lexed here (the same lexer the render path drives) so
// the parse-time whole-document walk can reject the forms expressions.md
// §"Not supported" forbids inside `${…}` (a nested `match` or `@`-query), and
// its static body (the literal segments, `${…}` spans dropped) is projected
// and checked for QRY-6's degenerate-template parse-time warning.
import {
  emptyTemplateWarning,
  lexQueryTemplate,
  queryTemplateStaticBody,
} from "../render/query-render";

// --------------------------------------------------------------------------
// Expression AST (the `Expr` node family; grammar.md §Expression sublanguage)
// --------------------------------------------------------------------------

/** Common fields carried by every AST node: its source span. */
export interface NodeBase {
  readonly range: SourceRange;
}

/** An identifier reference expression. */
export interface IdentExpr extends NodeBase {
  readonly kind: "ident";
  readonly name: string;
}

/** A numeric literal expression. */
export interface NumberExpr extends NodeBase {
  readonly kind: "number";
  readonly text: string;
  readonly numericType: "integer" | "number";
}

/** A string literal expression (decoded value). */
export interface StringExpr extends NodeBase {
  readonly kind: "string";
  readonly value: string;
}

/** A boolean literal expression. */
export interface BoolExpr extends NodeBase {
  readonly kind: "bool";
  readonly value: boolean;
}

/** The `null` literal expression. */
export interface NullExpr extends NodeBase {
  readonly kind: "null";
}

/** An array-construction literal (`[e, ...]`). */
export interface ArrayExpr extends NodeBase {
  readonly kind: "array";
  readonly elements: readonly Expr[];
}

/** A binary-operator expression (`a + b`, `a && b`, …). */
export interface BinaryExpr extends NodeBase {
  readonly kind: "binary";
  readonly op: string;
  readonly left: Expr;
  readonly right: Expr;
  /**
   * Set only on the binary node `parseUnary` mints for unary `-`/`!` (a
   * synthetic `null` left operand). Distinguishes that lowering from an
   * authored binary whose left operand is a literal `null`, which is
   * AST-identical without it — the consumers that special-case unary minus
   * key on this marker, not on `left.kind === "null"`.
   */
  readonly unary?: boolean;
}

/** A ternary-conditional expression (`cond ? a : b`). */
export interface TernaryExpr extends NodeBase {
  readonly kind: "ternary";
  readonly condition: Expr;
  readonly consequent: Expr;
  readonly alternate: Expr;
}

/** A postfix error-propagation expression (`operand?`; ERR-18). */
export interface TryExpr extends NodeBase {
  readonly kind: "try";
  readonly operand: Expr;
}

/** A code-tool call expression `<name>(args)` (tool-calls.md). */
export interface CallExpr extends NodeBase {
  readonly kind: "call";
  readonly callee: string;
  readonly args: readonly Expr[];
}

/** An `invoke(...)` / `invoke<T>(...)` call expression (invocation.md). */
export interface InvokeExpr extends NodeBase {
  readonly kind: "invoke";
  /** The literal callee path (`invoke("./x.theta", ...)`). */
  readonly path: string;
  /**
   * The `invoke<Schema>` return-type annotation text (`"number"`, `"Plan"`, …),
   * or `null` for an untyped `invoke(...)`. Feeds the runtime AJV return-value
   * validation (invocation.md §Typed return; hard-ceilings ceiling #4).
   */
  readonly returnSchema: string | null;
  readonly args: readonly Expr[];
  /**
   * True iff the `<T>` capture did NOT end at its own `>`: the angle-depth
   * loop reached EOF still nested, so whatever the capture holds runs past a
   * fault rather than closing where the author ascribed (bug 0279, clause
   * (iv)(3)'s provenance mark). Absent when no `<T>` was written or the loop
   * closed its own `>`.
   */
  readonly returnSchemaAbsorbed?: boolean;
}

/** An `@`…`` model-query expression (query.md). */
export interface QueryExpr extends NodeBase {
  readonly kind: "query";
  /** The explicit `@<Schema>` annotation, when present. */
  readonly schema: string | null;
  /**
   * Whether `schema` is the ascription the AUTHOR wrote at this query — the
   * `@<T>` or bare `@Ident` form — rather than text a LATER pass propagated
   * onto a query that carried none (bug 0203 §Fix constraint (b)(6)). Two
   * routes write `schema` on a query whose own capture left it `null`:
   * `parseLet`'s direct `let x: T = @`…`` propagation, and `resolveQuerySchemas`'
   * QRY-2 inference; both guard on the query's `schema` already being `null`
   * and rebuild the node by object spread, so the `false` `parseQuery` wrote
   * at the schema-less capture survives the rebuild rather than becoming
   * `true`. The distinction matters because a
   * PROPAGATED annotation's junk text is the `let` binding's, and
   * `theta/parse/annotation-type-not-expression` (bug 0124) already refuses it
   * at the `let` position — a second refusal at the query would double up on
   * one statement. Optional rather than required: six committed test files
   * construct a `kind: "query"` literal directly, and a required field would
   * red their typecheck for no behavioural gain — so `undefined` is reachable
   * only from such a literal, which is why the refusal site tests `=== true`
   * rather than truthiness.
   */
  readonly ascriptionWritten?: boolean;
  /**
   * Whether `schema` arrived by `parseLet`'s DIRECT propagation of a `let`
   * annotation onto this query's own `init` slot (bug 0093 §Fix route 2) —
   * `let x: T = @`…`` or its `?`-wrapped `let x: T = @`…`?` form. One written
   * annotation is otherwise checked at two walk arms: `walkStatement`'s `let`
   * arm walks `s.annotation`, and this query's own arm walks the same text
   * again off `e.schema`, doubling every rule the shared type-grammar walk
   * owns at position `"value"`. This marker lets the query arm withhold its
   * own `parseTypeExpression` pass for exactly that text, leaving the `let`
   * arm's statement-ranged verdict as the one that survives. Optional rather
   * than required, for the same reason as `ascriptionWritten`: test files
   * construct a `kind: "query"` literal directly, so a required field would
   * red their typecheck for no behavioural gain — `undefined` is reachable
   * only from such a literal, which is why the withhold tests `=== true`
   * rather than truthiness. Marks ONLY `parseLet`'s direct propagation, NOT
   * `resolveQuerySchemas`' QRY-2 inference (`fn` return, call argument,
   * constructor field): that route's false `void-in-non-return-position` at
   * an `fn`-return sink is a different, unfiled defect (bug 0093 §Non-goals)
   * and must keep firing, so a marker set by `parseLet` alone must not reach
   * it.
   */
  readonly schemaFromLetAnnotation?: boolean;
  /** The raw template body between the backticks. */
  readonly template: string;
}

/** A postfix member-access expression `target.field` (expressions.md §"Member access"). */
export interface MemberExpr extends NodeBase {
  readonly kind: "member";
  readonly target: Expr;
  readonly field: string;
}

/** A postfix index expression `target[index]` (expressions.md §"Index access"). */
export interface IndexExpr extends NodeBase {
  readonly kind: "index";
  readonly target: Expr;
  readonly index: Expr;
}

/** One `field: value` entry of an object-literal expression. */
export interface ObjectFieldNode {
  readonly name: string;
  readonly value: Expr;
}

/**
 * An object-literal / schema-constructor expression (grammar.md §"Theta literal
 * sublanguage" `BareObjectLit` / `NamedObjectLit`; expressions.md §"Object
 * construction"). `typeName` is the schema constructor name for `Ident { … }`,
 * or `null` for a bare `{ … }` object literal.
 */
export interface ObjectExpr extends NodeBase {
  readonly kind: "object";
  readonly typeName: string | null;
  readonly fields: readonly ObjectFieldNode[];
}

/**
 * One of the six theta 1.0 `match` pattern forms (expressions.md §"Pattern
 * grammar (theta 1.0)"). Mirrors the runtime `Pattern` model of
 * `../runtime/match-result.ts`; the executor maps this parse-shape onto that
 * runtime shape. A literal pattern carries the primitive literal value; an
 * object pattern's `typeName` (the schema constructor name) is retained for
 * diagnostics but ignored by runtime dispatch.
 */
export type PatternNode =
  | { readonly kind: "wildcard" }
  | { readonly kind: "identifier"; readonly name: string }
  | {
      readonly kind: "literal";
      readonly value: string | number | boolean | null;
      /**
       * The lexed numeric spelling (`Token.numericType`, lexer.ts), carried
       * exactly as `BodyParser.parsePrimary`'s number branch (this file)
       * carries it onto `NumberExpr`. Present ONLY for a `"number"` spelling
       * (`1.0`, `1e10`) because that is the one case unrecoverable from
       * `value` alone (a `number`-spelled integral literal parses to an
       * integral JS value, so `Number.isInteger` cannot tell `1.0` from `1`);
       * an absent field means the `"integer"` default, mirroring the
       * expression path's own `t.numericType ?? "integer"` read.
       */
      readonly numericType?: "integer" | "number";
    }
  | { readonly kind: "constructor"; readonly ctor: "Ok" | "Err"; readonly inner: PatternNode }
  | {
      readonly kind: "object";
      readonly typeName: string | null;
      readonly fields: readonly { readonly name: string; readonly pattern: PatternNode }[];
      /**
       * The WHOLE pattern's span — the head token through the closing `}`
       * (or, for the bare `{ … }` form, `{` through `}`). The object variant
       * is the ONLY `PatternNode` shape carrying a range: it is the site
       * `checkPatternObjectFields` (bug 0226 §Fix) reports its field-name and
       * field-type verdicts at, mirroring the constructor position's
       * `theta/parse/extra-object-field`, which likewise names the whole
       * object literal's range rather than a per-field one.
       */
      readonly range: SourceRange;
    }
  | { readonly kind: "array"; readonly elements: readonly PatternNode[] };

/** One `Pattern "=>" ArmBody` arm of a `match` expression. */
export interface MatchArmNode {
  readonly pattern: PatternNode;
  readonly body: Expr;
}

/**
 * A `match` expression (expressions.md §`match` expression): a scrutinee and an
 * ordered arm list, first-matching-arm-wins.
 */
export interface MatchExpr extends NodeBase {
  readonly kind: "match";
  readonly scrutinee: Expr;
  readonly arms: readonly MatchArmNode[];
}

/**
 * A `Result` constructor expression `Ok(arg)` / `Err(arg)` in value position
 * (errors-and-results/error-model.md). A dedicated node — NOT a `call` — so the
 * effectful-statement-host does not misclassify it as a tool-call checkpoint;
 * it evaluates purely to `makeOk` / `makeErr`.
 */
export interface ResultCtorExpr extends NodeBase {
  readonly kind: "result-ctor";
  readonly ctor: "Ok" | "Err";
  readonly arg: Expr;
}

/**
 * A postfix method-call expression `target.method(args)` — the runtime stdlib
 * member surface (expressions.md §"Built-in methods and properties"). A
 * dedicated node — NOT a `call` — so the effectful-statement-host treats it as
 * pure, not a tool-call checkpoint.
 */
export interface MethodCallExpr extends NodeBase {
  readonly kind: "method-call";
  readonly target: Expr;
  readonly method: string;
  readonly args: readonly Expr[];
}

/**
 * A `par for` parallel fan-out expression (RFC 0003; control-flow.md #par-for,
 * grammar.md `ParForExpr`). The value-producing counterpart of the `for`
 * statement: it evaluates its `body` concurrently for each element of `iterand`
 * and collects one `Result` per element in input order
 * (`array<Result<U, QueryError>>`, `U` the body tail type). `max` is the
 * optional `MaxClause` width operand (any integer-typed expression) or `null`.
 * `par` is a contextual keyword recognised only immediately before `for`
 * (grammar.md §"Contextual keywords"); it is not reserved.
 */
export interface ParForExpr extends NodeBase {
  readonly kind: "par-for";
  readonly variable: string;
  readonly iterand: Expr;
  readonly max: Expr | null;
  readonly body: Block;
}

/**
 * An expression-position block (grammar.md §"Block expressions",
 * `BlockExpr ::= "{" Stmt* Expr "}"`): zero or more statements followed by a
 * REQUIRED tail `Expr`, whose value is the block's value. Admitted at exactly
 * the two positions grammar.md:114 names — a `let` / `let mut` initialiser and
 * a `match`-arm body — never in general expression position (bug 0082 §Fix).
 * A parsed block whose `body.tail` is `null` draws
 * `theta/parse/block-expr-missing-tail`; `FnBody` / `StmtBlock`'s implicit
 * `null` tail is a DIFFERENT production (grammar.md :119/:121) and this rule
 * does not apply to it.
 */
export interface BlockExpr extends NodeBase {
  readonly kind: "block";
  readonly body: Block;
}

/**
 * The `Expr` node family. A tail `Expr` of a `ThetaBody` / block, a `let`
 * initialiser, a condition, etc. all use this union.
 */
export type Expr =
  | IdentExpr
  | NumberExpr
  | StringExpr
  | BoolExpr
  | NullExpr
  | ArrayExpr
  | BinaryExpr
  | TernaryExpr
  | TryExpr
  | CallExpr
  | InvokeExpr
  | QueryExpr
  | MemberExpr
  | IndexExpr
  | ObjectExpr
  | MatchExpr
  | ResultCtorExpr
  | MethodCallExpr
  | ParForExpr
  | BlockExpr;

// --------------------------------------------------------------------------
// Statement / declaration AST (the `Stmt` node family; grammar.md)
// --------------------------------------------------------------------------

/** A `let` / `let mut` binding statement (`LetStmt`; bindings.md). */
export interface LetStmt extends NodeBase {
  readonly kind: "let";
  readonly name: string;
  readonly mutable: boolean;
  /** The declared binding annotation, when present (`let x: T = …`). */
  readonly annotation: string | null;
  readonly init: Expr | null;
  /**
   * True iff the annotation capture did NOT end at its own terminator (`=`) —
   * whether it ran past a syntax fault and absorbed the next construct's text,
   * or halted early at a token this position does not derive (bug 0279, clause
   * (iv)(3)'s provenance mark). Absent when the capture ended at `=` or when
   * no annotation was written.
   */
  readonly annotationAbsorbed?: boolean;
}

/** A statement-form reassignment (`x = e`, `x += e`, …; bindings.md). */
export interface ReassignStmt extends NodeBase {
  readonly kind: "reassign";
  readonly target: string;
  readonly op: "=" | "+=" | "-=" | "*=" | "/=" | "%=";
  readonly value: Expr;
  /**
   * True iff `buildReassign` drew `theta/parse/immutable-rebinding` for this
   * target — the `_` discard, or a target `buildReassign`'s file-linear
   * mutability map already knows as immutable. The ident walk reads it as the
   * EXACT signal that the immutability check already fired, so it defers the
   * out-of-scope `unknown-identifier` for exactly those targets and no others
   * (bug 0370 §Fix layer 1's G6-defer). A positional guess over declaration
   * order mis-fired on a redeclared name (`let y` / `let mut y`), where the
   * map recorded the first immutable `y` but `buildReassign` saw the shadowing
   * mutable and drew nothing. Set `true` exactly when `buildReassign` emits
   * `immutable-rebinding` for this target, `false` otherwise — `buildReassign`
   * writes an explicit boolean on every node it builds, so a parser-built
   * `ReassignStmt` never leaves this field absent.
   */
  readonly immutableRebindingEmitted?: boolean;
}

/** A statement-form `if` / `else` (`IfStmt`; control-flow.md). */
export interface IfStmt extends NodeBase {
  readonly kind: "if";
  readonly condition: Expr;
  readonly then: Block;
  /** The `else` arm: a chained `IfStmt`, an `else` `Block`, or none. */
  readonly otherwise: IfStmt | Block | null;
}

/** A statement-form `while` loop (`WhileStmt`; control-flow.md). */
export interface WhileStmt extends NodeBase {
  readonly kind: "while";
  readonly condition: Expr;
  readonly body: Block;
}

/** A statement-form `for … in` loop (`ForStmt`; control-flow.md). */
export interface ForStmt extends NodeBase {
  readonly kind: "for";
  readonly variable: string;
  readonly iterand: Expr;
  readonly body: Block;
}

/** A `break` statement (control-flow.md). */
export interface BreakStmt extends NodeBase {
  readonly kind: "break";
  /**
   * `true` when the `break` is followed by a value operand on the same logical
   * line (`break expr`), which theta 1.0 forbids. Marked at parse time so the
   * structural checker can raise `theta/parse/break-with-value`.
   */
  readonly hasValue?: boolean;
}

/** A `continue` statement (control-flow.md). */
export interface ContinueStmt extends NodeBase {
  readonly kind: "continue";
}

/** A single `fn` parameter (`Ident ":" Type`). */
export interface FnParam {
  readonly name: string;
  readonly type: string;
  /**
   * True iff the type capture did NOT end at its own terminator (`,` or the
   * list's `)`) — whether it ran past a syntax fault and absorbed text past
   * the parameter, or halted early at a token the parameter list does not
   * derive (bug 0279, clause (iv)(3)'s provenance mark). Absent when the
   * capture was empty or ended at its own terminator.
   */
  readonly typeAbsorbed?: boolean;
}

/**
 * One `with { … }` session-config field of a `subagent fn` (RFC 0001; grammar.md
 * `WithField`). `key` is the field name as written; `value` is the raw value
 * expression, validated against the like-named frontmatter field's grammar
 * (FN-7). A key outside the five recognised keys still records here so
 * `withClauseKeys`-style consumers observe it, but also surfaces
 * `theta/load/unknown-frontmatter-field` at parse time.
 */
export interface WithField {
  readonly key: string;
  readonly value: Expr;
}

/**
 * The `with { … }` session-config clause of a `subagent fn` (RFC 0001; grammar.md
 * `WithClause`) — the ordered list of its `WithField`s. Overrides any subset of
 * the five inherited session-config keys (`system`, `model`, `tools`,
 * `tool_loop`, `respond_repair`); an omitted key inherits from the enclosing
 * theta (FN-7).
 */
export type WithClause = readonly WithField[];

/**
 * The resolved session configuration a `subagent fn` call spawns its fresh
 * isolated session under (RFC 0001 FN-7). Computed at document-parse time by
 * merging the enclosing theta's inherited configuration with the `with { … }`
 * clause's per-key overrides. Absent keys inherit; a `.thetalib` helper carries
 * only its `with`-clause overrides (its inheritance resolves against the calling
 * theta at dispatch, FN-9).
 */
export interface SubagentSessionConfig {
  readonly model?: string;
  readonly tools?: readonly string[];
  readonly system?: string;
  /**
   * The spawned session's tool-loop bound (RFC 0001 FN-7 `tool_loop`), inherited
   * from the enclosing theta's `tool_loop:` and overridable by a
   * `with { tool_loop: { max_rounds: N } }` clause. Absent ⇒ the runtime
   * `{ maxRounds: 25 }` default applies.
   */
  readonly toolLoop?: ParsedToolLoop;
  /**
   * The spawned session's respond-repair budget (RFC 0001 FN-7 `respond_repair`),
   * inherited from the enclosing theta's `respond_repair:` and overridable by a
   * `with { respond_repair: { attempts: N } }` clause. Absent ⇒ the runtime
   * `{ attempts: 3 }` default applies.
   */
  readonly respondRepair?: ParsedRespondRepair;
  /**
   * True iff a `with { tools: […] }` clause EXPLICITLY overrode the tool set
   * (RFC 0001 FN-7/FN-9). The production spawn seam then resolves the spawned
   * session's callable set to the named subset of the CALLING theta's callable
   * set; when `false` the spawned session inherits the calling theta's full
   * callable set. `tools` carries the effective names either way (for the FN-7
   * inheritance witness).
   */
  readonly toolsOverridden?: boolean;
}

/** A top-level `fn` declaration (`FnDecl`; functions.md). */
export interface FnDecl extends NodeBase {
  readonly kind: "fn";
  readonly name: string;
  readonly params: readonly FnParam[];
  readonly returnType: string | null;
  /**
   * True iff the return-type capture did NOT end at its own terminator (the
   * body's `{`, or the contextual `with` ident) — whether it ran past a syntax
   * fault and absorbed the next construct's text, or halted early at a token
   * the return slot does not derive (bug 0279, clause (iv)(3)'s provenance
   * mark). Absent when no `:` was written or the capture ended at its own
   * terminator.
   */
  readonly returnTypeAbsorbed?: boolean;
  readonly body: Block;
  /**
   * True iff the declaration carries the `subagent` modifier (RFC 0001 FN-6):
   * each call spawns a fresh isolated subagent session for the body. Absent /
   * `false` on an ordinary `fn`.
   */
  readonly subagent?: boolean;
  /**
   * The parsed `with { … }` session-config clause (RFC 0001 FN-7), or `null`
   * when the `subagent fn` carries none (every key then inherits). Always
   * `null` on an ordinary `fn`.
   */
  readonly withClause?: WithClause | null;
  /**
   * The resolved session configuration a `subagent fn` call spawns under
   * (RFC 0001 FN-7), attached by `parseThetaDocument` after the enclosing
   * frontmatter is parsed (inherit-then-`with`-override). Absent on an ordinary
   * `fn`.
   */
  readonly sessionConfig?: SubagentSessionConfig;
}

/** A `return` statement (return.md). */
export interface ReturnStmt extends NodeBase {
  readonly kind: "return";
  readonly operand: Expr | null;
}

/** A query used in statement position (`@`…`` with no binding). */
export interface QueryStmt extends NodeBase {
  readonly kind: "query";
  readonly query: QueryExpr;
}

/** A code-tool call in statement position (`<name>(args)`). */
export interface ToolCallStmt extends NodeBase {
  readonly kind: "tool-call";
  readonly call: CallExpr;
}

/** An `invoke(...)` call in statement position. */
export interface InvokeStmt extends NodeBase {
  readonly kind: "invoke";
  readonly invoke: InvokeExpr;
}

/** A bare expression statement (its value discarded). */
export interface ExprStmt extends NodeBase {
  readonly kind: "expr";
  readonly expr: Expr;
}

/**
 * One `schema X { … }` object-body field, as written in source: the field name
 * and its verbatim type-expression RHS. Retained so a typed `@<Schema>` query
 * can resolve the named decl to its declared shape and lower it (QRY-22 /
 * SUBS-1); the `= …` alias and `by … = …` discriminated-union forms carry no
 * object field list.
 */
export interface SchemaFieldSource {
  readonly name: string;
  readonly typeSource: string;
  /**
   * The explicit `as "WireName"` rename when present (schemas.md §Wire-name
   * renaming). Absent means the wire name equals the theta-side `name`. Retained
   * so the runtime can apply outbound wire-name translation when an object of
   * this schema is interpolated into a query template (QRY-18).
   */
  readonly wireName?: string;
  /**
   * The field-name token's 1-indexed source line, captured so a `///` run
   * immediately above the field can be anchored to it by line lookup
   * (`attachDocDescriptions`) after the enclosing `SchemaDecl` has already been
   * built. Absent only for a literal `SchemaFieldSource` constructed off-parser
   * (tests), which carries no doc comment to anchor.
   */
  readonly line?: number;
  /**
   * The lowered field description: the `///` run that
   * `scanDocComments`/`classifyDocAnchor` resolve to this field's line via the
   * placement scan, joined byte-for-byte (descriptions.md §Multi-line / §No
   * transformation). Lowering and placement agree by construction — blank and
   * `//` lines between the run and the field name are skipped exactly as the
   * placement scan skips them. Absent when the field carries no doc comment.
   */
  readonly description?: string;
}

/**
 * A `schema` declaration (`SchemaDecl`; schemas.md). Three-way shape (bug
 * 0033 §Fix): the object form (`fields`), the alias/union form (`arms`, with
 * an optional `by` discriminator field), and the head-only form (neither) —
 * a body-less `schema X` head or an unparseable object body / alias
 * right-hand side, which carries its own `theta/parse/empty-schema-body`
 * diagnostic at parse time rather than resolving silently.
 */
export interface SchemaDecl extends NodeBase {
  readonly kind: "schema";
  readonly name: string;
  /**
   * The object-body field type sources, present iff the decl is the
   * `schema X { field: Type, … }` object form. Absent for the `= …` alias /
   * `by … = …` union form and for the head-only form.
   */
  readonly fields?: readonly SchemaFieldSource[];
  /**
   * The alias/union right-hand side: one Type source per top-level `|`-
   * separated arm (`schema X = A | B`; grammar.md §"schema X by <field>"
   * `AliasRhs` / `UnionRhs`), present iff the decl is that form. Captured by
   * `parseType` in its field-boundary mode (as the object form's field types
   * are) plus its alias-arm mode — one capture over the whole right-hand side,
   * split on the top-level `|`, the same split `lowerTypeSource`
   * (body-type-lowering.ts) re-applies at lowering. Absent for the object form
   * and for the head-only form.
   *
   * CAVEAT — what "top-level" means to the split. `splitTopLevel` (params.ts)
   * runs in its default `"angle"` nesting, which tracks `<…>` and quotes but
   * NOT braces, so a `|` written INSIDE an inline-object arm reads as an arm
   * separator: `schema X = { a: string | null } | Cat` yields the three
   * segments `{a:string`, `null}`, `Cat` rather than two arms. That input is
   * legal (an `ObjectType` field's `Type` may be a union), so for it `arms` is
   * per-`|`-SEGMENT rather than per-`Type`. The two consumers agree by
   * construction — lowering re-splits the rejoined arms the same way — so the
   * family loads clean either way, and what it LOWERS to turns on whether the
   * rejoin closes the brace group:
   *
   *   - ONE brace group and nothing else (`schema X = { a: string | null }`,
   *     the two segments `{a:string` and `null}`): the rejoin IS a single
   *     enclosing brace group, so `lowerTypeSource` dispatches it whole and
   *     the segmentation leaves no trace — one hoisted
   *     `{"$ref": "#/$defs/__inline_<slug>"}` over a fragment carrying
   *     `a: {"type": ["string", "null"]}`. Bug 0039 §Fix part B moved those
   *     BYTES; the typo variant `{ a: Tirage | null }` raised
   *     `unresolved named type 'Tirage'` before it too, on the walker's own
   *     brace dispatch — the rejoin reads as a field list whose `a` carries
   *     `Tirage | null` into `lowerTypeExpr`'s union, which sinks an
   *     unresolved arm.
   *   - The brace group BESIDE another arm (`… | Cat` above): the split
   *     SHREDDED the group, leaving segments that open or close a brace they
   *     do not match, so `lowerTypeSource` declines the arm dispatch for the
   *     whole segment set — nothing hoists and the union lowers PER SEGMENT,
   *     `anyOf: [{}, {}, {"$ref": "#/$defs/Cat"}]`. A name inside the shredded
   *     group resolves against nothing and raises nothing — bug 0033 §Fix
   *     residual (ii), untouched by bug 0039. The decline covers a shard that
   *     is itself balanced: `Cat | {a: integer | {c: Ghost} | boolean}` leaves
   *     `{c: Ghost}` standing as a segment, and that shard is a NESTED arm
   *     inside the destroyed group rather than an arm of this union.
   *
   * An arm carrying no interior `|` is not in this family and is captured
   * per-`Type`: `schema X = { a: string } | Cat` is two arms, and each lowers
   * on its own — the brace arm hoists its own `$ref` (bug 0039 §Fix, "Existing
   * pins that move by design"). Group (j)'s j3 in
   * tests/schema-alias-union-decl.test.ts pins the arm COUNT and the clean
   * load for that shape, and deliberately puts no byte pin on the arm.
   */
  readonly arms?: readonly string[];
  /**
   * The explicit `by <field>` discriminator identifier, present iff the
   * author wrote a `by` clause — on the union form (`schema X by f = A | B`,
   * legal) or on the object form (`schema X by f { ... }`,
   * `theta/parse/by-on-object-schema`; grammar.md §"schema X by <field>").
   * Retained on the object form specifically so `checkByClause` sees the
   * clause rather than it being silently discarded.
   */
  readonly by?: string;
  /**
   * Set when `emitMalformedAliasRhs` already refused this declaration's
   * right-hand side at PARSE time (bug 0042 §Fix), into `this.diagnostics` —
   * a DIFFERENT array from the one `checkSchemaDeclarationGraph` (the checker
   * pass) builds. That pass's own same-scope guard reads only its own array,
   * so it cannot see a parse-time refusal by inspecting diagnostics alone; a
   * node-level flag is the one channel that carries the fact forward (bug
   * 0061 §Fix guard 2). A declaration carrying this flag draws no
   * `theta/parse/schema-type-not-expression` for its arm text, keeping
   * `malformed-alias-rhs` its only report.
   */
  readonly aliasRhsRefused?: true;
  /**
   * The lowered schema-DECL description: the `///` run that
   * `scanDocComments`/`classifyDocAnchor` resolve to the `schema` keyword via
   * the placement scan, joined byte-for-byte (descriptions.md §Multi-line / §No
   * transformation; grammar.md:195 for the alias form). Lowering and placement
   * agree by construction — blank and `//` lines between the run and the
   * keyword are skipped exactly as the placement scan skips them. Absent when
   * the declaration carries no doc comment.
   */
  readonly description?: string;
}

/** An `enum` declaration (`EnumDecl`; schemas.md). */
export interface EnumDecl extends NodeBase {
  readonly kind: "enum";
  readonly name: string;
  /**
   * The declared variant names in source order, captured so the runtime can
   * register the enum and resolve `Enum.Variant` access to a first-class enum
   * value (runtime-value-model.md, enum row). Absent for a non-`{ … }` enum
   * shape the body parser could not read.
   */
  readonly variants?: readonly string[];
  /**
   * Explicit `= "..."` wire values keyed by variant name (schemas.md §Enum
   * declarations — "Explicit values override that mapping"). A variant absent
   * here uses its name verbatim as the wire value. Only string-literal values
   * are captured; a non-string explicit value is left for enum-declaration
   * validation and does not override the name.
   */
  readonly variantValues?: Readonly<Record<string, string>>;
  /**
   * The full variant declarations in source order (name + explicit-value kind
   * and text), captured so the parse pipeline can run `checkEnumDeclaration`
   * (schemas.md §Enum declarations): empty body, non-string values, duplicate
   * variant names. Unlike `variantValues` (string wire values only) this
   * retains non-string explicit values so they can be rejected. Absent for a
   * non-`{ … }` enum shape the body parser could not read.
   */
  readonly variantDecls?: readonly EnumVariantDecl[];
  /**
   * The lowered enum-DECL description: the `///` run that
   * `scanDocComments`/`classifyDocAnchor` resolve to the `enum` keyword via the
   * placement scan, joined byte-for-byte (descriptions.md §Multi-line / §No
   * transformation); blank and `//` lines between the run and the keyword are
   * skipped exactly as the placement scan skips them. A per-variant `///` is
   * accepted-but-AST-only (A1: the flat enum wire shape has no per-value
   * description slot) and never reaches this field. Absent when the
   * declaration carries no doc comment.
   */
  readonly description?: string;
}

/** An `import … from` declaration (imports.md). */
export interface ImportDecl extends NodeBase {
  readonly kind: "import";
  readonly path: string;
  /**
   * The LOCAL binding names — the `as` alias where present, else the source name
   * (imports.md §Visibility). Downstream named-type / reserved-name consumers key
   * off the local name a `{ A as B }` specifier binds (`B`), not the raw tokens.
   */
  readonly symbols: readonly string[];
  /** The `{ source as local }` specifiers, carrying the `as`-alias mapping. */
  readonly specifiers: readonly ImportSpecifier[];
}

/** An `export … from` declaration (imports.md). */
export interface ExportDecl extends NodeBase {
  readonly kind: "export";
  readonly path: string;
  /** The downstream-visible names — the `as` alias where present, else the source. */
  readonly symbols: readonly string[];
  /** The `{ source as exported }` re-export specifiers, carrying the `as`-alias mapping. */
  readonly specifiers: readonly ImportSpecifier[];
}

/** A `///` doc-comment run (`DocComment`; descriptions.md). */
export interface DocComment extends NodeBase {
  readonly kind: "doc-comment";
  readonly lines: readonly string[];
}

/**
 * The `Stmt` node family: every top-level statement and declaration kind a
 * `ThetaBody` admits.
 */
export type Stmt =
  | LetStmt
  | ReassignStmt
  | IfStmt
  | WhileStmt
  | ForStmt
  | BreakStmt
  | ContinueStmt
  | FnDecl
  | ReturnStmt
  | QueryStmt
  | ToolCallStmt
  | InvokeStmt
  | ExprStmt
  | SchemaDecl
  | EnumDecl
  | ImportDecl
  | ExportDecl
  | DocComment;

/**
 * A statement-list block (`ThetaBody ::= Stmt* Expr?` and the `StmtBlock`
 * production alike): zero or more statements plus an optional tail `Expr`.
 */
export interface Block {
  readonly statements: readonly Stmt[];
  readonly tail: Expr | null;
}

/** The `ThetaBody` top-level of a `.theta` / `.thetalib` file. */
export type ThetaBody = Block;

/** The result of a whole-file parse. */
export interface ThetaDocument {
  /** The parsed frontmatter, or `null` when the file carries none. */
  readonly frontmatter: ParsedFrontmatter | null;
  /** The whole-file body statement-list AST the interpreter walks. */
  readonly body: ThetaBody;
  /**
   * Every diagnostic aggregated across the whole file in one pass, sorted
   * `(file, line, col)` per diagnostics.md §"Multi-error reporting" — with
   * one fast-fail exception: the invalid-encoding refusal arm (lexical.md
   * §Encoding) short-circuits before the aggregation pass runs.
   */
  readonly diagnostics: readonly Diagnostic[];
  /**
   * The {@link diagnostics} subset already delivered through the V7d seam —
   * by `lexTheta`, or (on the invalid-UTF-8 refusal arm) by the pre-decode
   * encoding gate (bug 0410) — same `Diagnostic` objects, unmapped by
   * `assembleDiagnostics` (bug 0255) — a re-delivering caller must exclude
   * this subset by object identity, not by code prefix, to avoid
   * double-delivery.
   */
  readonly deliveredDiagnostics: readonly Diagnostic[];
}

/** Construction dependencies the whole-file parser consumes. */
export interface ParseThetaDocumentDeps {
  /** The V7d producer-facing diagnostic-emission channel. */
  readonly systemNote: SystemNoteChannelDeps;
  /** The `model:` reference matcher the frontmatter parse consults (V6a). */
  readonly modelMatcher: ModelReferenceMatcher;
}

/**
 * Parse an entire `.theta` / `.thetalib` source into `{ frontmatter, body,
 * diagnostics }`: the whole file — not a single expression — is walked into the
 * executable `ThetaBody` statement-list AST, and the delegated V-slice
 * parse-checkers' diagnostics are aggregated in one pass, sorted `(file, line,
 * col)`, per implementation-notes.md §Parser *Contract* (`cka-49`).
 *
 * The whole file — not a single expression — is walked into the executable
 * `ThetaBody` statement-list AST; the delegated V-slice parse-checkers'
 * diagnostics are aggregated in one pass and sorted `(file, line, col)`.
 */
export function parseThetaDocument(
  source: ThetaSource,
  deps: ParseThetaDocumentDeps,
): ThetaDocument {
  const file = source.path;

  // Bug 0410 §Fix option 1 — validate the RAW, pre-decode bytes before
  // `decodeSource` runs. `decodeSource` uses a non-fatal `TextDecoder` that
  // silently substitutes U+FFFD for invalid sequences, so a gate placed after
  // it (or fed re-encoded text, as the `lexTheta` call below is) can never
  // observe the original invalid byte or its offset. lexical.md §Encoding
  // requires `theta/load/invalid-encoding` naming the zero-based offset of
  // the first invalid byte in the ORIGINAL file content, offset 0 for a
  // non-UTF-8 BOM — both only recoverable from `source.bytes` itself.
  const invalidOffset = firstInvalidUtf8Offset(source.bytes);
  if (invalidOffset >= 0) {
    const encodingDiag: Diagnostic = {
      severity: "error",
      code: "theta/load/invalid-encoding",
      file,
      message: `invalid UTF-8 encoding at byte offset ${invalidOffset}`,
    };
    emitDiagnosticBatch([encodingDiag], deps.systemNote);
    return {
      frontmatter: null,
      body: { statements: [], tail: null },
      diagnostics: [encodingDiag],
      deliveredDiagnostics: [encodingDiag],
    };
  }

  const text = decodeSource(source.bytes);

  // Separate the optional `---` frontmatter fence from the executable body.
  // A fence-less source is body-only: the load-time "frontmatter is required"
  // obligation is the loader's (V6*), not the whole-file body parser's, and
  // every V19a-T fixture supplies a bare body — so parsing frontmatter only
  // when a fence is present keeps a spurious `missing mode:` diagnostic out of
  // the aggregated set. See notes.md.
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
  // resolution touches — and its own diagnostics are discarded (the parse below
  // is the authoritative one).
  const paramFieldNames = new Set<string>();
  if (split.frontmatterText !== null) {
    const earlyFm = parseFrontmatter(`---\n${split.frontmatterText}\n---`, {
      file,
      modelMatcher: deps.modelMatcher,
    });
    for (const f of earlyFm.paramFields) {
      if (f.name !== "_") {
        paramFieldNames.add(f.name);
      }
    }
  }

  const parser = new BodyParser(lex.tokens, file, split.bodyText, paramFieldNames);
  const body = parser.parseBody();

  // Bug 0411 §Fix option 1, refined by bug 0420 §Fix option 1 — `scanDocComments`
  // is the one line-oriented pass over the body text with no `@`...`` template
  // guard (lexical.md:24 sentence 1: text inside a query template is rendered
  // prompt, not a comment); the lexer's own `inTemplateProse` and
  // `contextualDiagnostics`'s `inTemplateBody` both already toggle on backtick
  // puncts to skip template interiors, so this scan gets the same toggle over
  // the already-in-scope `lex.tokens`. Backticks are template delimiters and
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
  let prevTok: (typeof lex.tokens)[number] | undefined;
  for (const tok of lex.tokens) {
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
  if (split.frontmatterText !== null) {
    // `splitFrontmatter` returns the frontmatter text with the `---` fences
    // stripped, but `parseFrontmatter` re-requires them (its
    // `extractFrontmatterBlock` matches a leading/closing `---` fence). Re-wrap
    // the block in fences so the frontmatter fields (`mode:` / `model:` / …)
    // actually parse; without this every fenced `.theta` yields `frontmatter:
    // null` and a spurious `theta/load/missing-mode`. See notes.md (the
    // frontmatter line numbers are block-relative for a fence at file line 0 —
    // the common case; a fence preceded by blank lines shifts them by the
    // blank-line count, which no current obligation asserts).
    const fm = parseFrontmatter(`---\n${split.frontmatterText}\n---`, {
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
    resolvedQuery.propagations,
    // bug 0262 §Fix clause (iv)(3): the artefact-suppression predicate needs
    // both PRIOR passes' error-severity diagnostics — the lexer's own
    // (`single-line-if`) and the body parser's own (`fn-param-list-unclosed`)
    // — rather than one of them alone, since the two measured artefact
    // fixtures each draw a diagnostic from a different one of these two
    // arrays.
    [...lex.diagnostics, ...parser.diagnostics],
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
  const typeLayerDiags = checkTypeLayer(
    { statements, tail: resolvedTail },
    file,
    (frontmatter?.params?.fields ?? []).map((f) => ({ name: f.wireName, typeSource: f.type })),
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

  const diagnostics = assembleDiagnostics([
    frontmatterDiags,
    lex.diagnostics,
    parser.diagnostics,
    docScan.diagnostics,
    structuralDiags,
    unknownIdentDiags,
    paramsDefaultNameDiags,
    callSiteLexicalDiags,
    typeLayerDiags,
    thetalibTopLevelDiags,
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
    return { ...stmt, sessionConfig: resolveSubagentSessionConfig(stmt, frontmatter) };
  });
}

/**
 * Resolve a `subagent fn`'s spawned-session config: start from the enclosing
 * theta's inherited `model` / `tools` / `tool_loop` / `respond_repair` (FN-7
 * default), then overwrite each key named in the `with { … }` clause. All five
 * session-config keys take effect (FN-7): `model` / `tools` / `system` plus the
 * two loop budgets `tool_loop` / `respond_repair`. A `.thetalib` helper carries
 * a `null` frontmatter here, so it projects only its own `with`-clause overrides
 * — its inheritance resolves against the CALLING theta at dispatch (FN-9,
 * `resolveSubagentSessionConfigAt`).
 */
function resolveSubagentSessionConfig(
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
 * Re-resolve a `subagent fn`'s session config against a DIFFERENT enclosing
 * frontmatter than the one it was parsed under (RFC 0001 FN-9). A `.thetalib`
 * helper has no frontmatter of its own, so its `model` / `tools` /
 * `tool_loop` / `respond_repair` inheritance resolves against the CALLING
 * theta's frontmatter at dispatch time; its `with { … }` overrides still apply
 * on top. For an in-file `subagent fn` (parse-time frontmatter already the
 * enclosing theta's) this is identical to the parse-time resolution.
 */
export function resolveSubagentSessionConfigAt(
  fn: FnDecl,
  callingFrontmatter: ParsedFrontmatter | null,
): SubagentSessionConfig {
  return resolveSubagentSessionConfig(fn, callingFrontmatter);
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
 * Parse a standalone expression `source` into an `Expr`, reusing the same
 * `parseExpression` entry the body parser drives for a `let` RHS so a caller
 * (e.g. a `@`...`` template's `${…}` interpolation, expressions.md
 * §"Supported forms") honours the full expression sublanguage rather than a
 * dotted-path subset. Returns `null` when the source does not parse as a single
 * expression. Lex diagnostics are discarded here: a well-formed theta's
 * interpolation already lexed as part of the whole-file body, and a malformed
 * one degrades to `null` at the call site (the inline no-op channel keeps this
 * helper free of shared state — no module-level mutable channel).
 */
export function parseExpressionSource(source: string): Expr | null {
  const lex = lexTheta(
    { path: "<interpolation>", bytes: encodeSource(source) },
    {
      pi: { sendMessage: () => {} },
      ui: { notify: () => {} },
      emitDiagnostic: () => {},
    },
  );
  const parser = new BodyParser(lex.tokens, "<interpolation>", source);
  return parser.parseSingleExpression();
}

/**
 * Parse a `@`...`` template's `${…}` interpolation source, returning the
 * parsed expression (or `null` when it does not parse at all) ALONGSIDE the
 * `BodyParser`'s own parse-phase diagnostics — the settled route for bug 0122:
 * an expression inside an interpolation draws exactly the parse-*parser*-phase
 * diagnostics the same text draws at `let`-RHS level. Same lex seam as
 * `parseExpressionSource` (real `lexTheta`, inline no-op channel, the
 * `<interpolation>` path) and the same `BodyParser` construction; the only
 * difference is driving `parseSingleExpressionWithResidue()` so a residue after
 * the expression — not only the expression's own emitters — has a chance to
 * draw a diagnostic before it is discarded. `parseExpressionSource` itself is
 * untouched: its other four call sites do not want the residue drain.
 */
function parseInterpolationSource(source: string): {
  readonly expr: Expr | null;
  readonly diagnostics: readonly Diagnostic[];
} {
  const lex = lexTheta(
    { path: "<interpolation>", bytes: encodeSource(source) },
    {
      pi: { sendMessage: () => {} },
      ui: { notify: () => {} },
      emitDiagnostic: () => {},
    },
  );
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
 */
function collectBodyTypes(
  statements: readonly Stmt[],
  file: string,
): { readonly bodyTypes: FrontmatterBodyTypes; readonly diagnostics: readonly Diagnostic[] } {
  const schemas = new Map<string, readonly SchemaFieldSource[] | undefined>();
  const enums = new Set<string>();
  const imports = new Set<string>();
  const schemaDecls: SchemaDecl[] = [];
  const enumDecls: EnumDecl[] = [];
  const importNames: string[] = [];
  const rangeByName = new Map<string, SourceRange>();
  for (const stmt of statements) {
    if (stmt.kind === "schema") {
      schemas.set(stmt.name, stmt.fields);
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
  return { bodyTypes: { schemas, enums, imports, lowered }, diagnostics };
}

// --------------------------------------------------------------------------
// Source decoding + frontmatter separation
// --------------------------------------------------------------------------

/** Decode validated UTF-8 body bytes (skipping a BOM) and normalise newlines. */
function decodeSource(bytes: Uint8Array): string {
  const hasBom =
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf;
  const body = hasBom ? bytes.subarray(3) : bytes;
  return new TextDecoder("utf-8", { ignoreBOM: true })
    .decode(body)
    .replace(/\r\n?/g, "\n");
}

/** Re-encode a (already-normalised) body string for the lexer's byte input. */
function encodeSource(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * Split a normalised source into its optional leading `---` frontmatter block
 * and the executable body. The frontmatter region is blanked (not removed) in
 * the returned body so body line numbers stay aligned with the original
 * source. Returns `frontmatterText: null` when no leading fence is present.
 */
function splitFrontmatter(text: string): {
  frontmatterText: string | null;
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
    return { frontmatterText: null, bodyText: text };
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
      frontmatterText: "",
      bodyText: lines.map(() => "").join("\n"),
    };
  }
  const frontmatterText = lines.slice(open + 1, close).join("\n");
  const bodyText = lines.map((l, i) => (i <= close ? "" : l)).join("\n");
  return { frontmatterText, bodyText };
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

// --------------------------------------------------------------------------
// Recursive-descent body parser
// --------------------------------------------------------------------------

/** Compound-assignment leading operators (`+=`, `-=`, …) lexed as two tokens. */
const COMPOUND_OPS: ReadonlySet<string> = new Set(["+", "-", "*", "/", "%"]);

/**
 * The five recognised `subagent fn` `with { … }` session-config keys (RFC 0001
 * FN-7; grammar.md `WithKey`). Each mirrors a like-named frontmatter field; a
 * key outside this set surfaces `theta/load/unknown-frontmatter-field`.
 */
const WITH_CLAUSE_KEYS: ReadonlySet<string> = new Set([
  "system",
  "model",
  "tools",
  "tool_loop",
  "respond_repair",
]);

/** Reserved keywords that can begin an expression (used in ternary-head lookahead). */
const EXPRESSION_KEYWORDS: ReadonlySet<string> = new Set([
  "match",
  "true",
  "false",
  "null",
  "Ok",
  "Err",
  "invoke",
]);

/** Punctuation that can begin an expression (used in ternary-head lookahead). */
const EXPRESSION_LEAD_PUNCT: ReadonlySet<string> = new Set([
  "(",
  "[",
  "{",
  "-",
  "!",
  "@",
  "`",
]);

/**
 * Keywords that can never occur at bracket depth 0 inside a ternary
 * consequent/alternate expression — the statement/declaration heads. Meeting
 * one in the `isTernaryHead` forward scan proves the scan has crossed a
 * statement boundary whose newline the lexer's trailing-`?` continuation
 * swallowed, so the `?` under test is the postfix error-propagation terminator
 * (grammar.md §"Statement termination & newline continuation" — "the `?`
 * trigger is the ternary head only"; bug 0005 (b)).
 *
 * Why the set is closed: theta has no statement expressions — `let` / `if` /
 * `else` / `while` / `return` / `break` / `continue` and the declaration heads
 * `fn` / `schema` / `enum` / `import` / `export` occur only in statement
 * position, and the two block-expression forms (a `match`-arm block body and a
 * `par for` body) put their statements behind a `{` that raises the bracket
 * depth first, so none of these keywords can sit at depth 0 mid-expression.
 * Deliberately EXCLUDED: `for` and `in` — `par for x in xs { … }` is an
 * expression (grammar.md §Blocks, theta 1.1) and `par` lexes as a contextual
 * ident, so both sit at depth 0 in a legal consequent (`c ? par for x in xs
 * { x } : y`); `match` and the other `EXPRESSION_KEYWORDS`, which head
 * expressions; and the type keywords (`string` … `array`, `Result`, `void`),
 * which sit at depth 0 inside an `invoke<…>` generic annotation because the
 * scan does not depth-track `<`/`>`.
 */
const STATEMENT_ONLY_KEYWORDS: ReadonlySet<string> = new Set([
  "fn",
  "let",
  "if",
  "else",
  "while",
  "return",
  "schema",
  "enum",
  "import",
  "export",
  "break",
  "continue",
]);

/**
 * Keywords that end an alias/union right-hand side met at an ARM-TOKEN
 * BOUNDARY — the position where `AliasRhs ::= Type ("|" Type)*`
 * (grammar.md §"schema X by <field>") requires a `Type` to start, i.e. before
 * the first arm or straight after a top-level `|`. Every member heads a form —
 * a statement (`parseForm`'s keyword switch) or, for the last four, an
 * expression statement — and none can begin a `Type` (grammar.md §"Type
 * grammar"), so meeting one where an arm must start proves the right-hand
 * side already ended and the lexer swallowed the boundary newline behind a
 * trailing `=` / `>` continuation trigger (lexer.ts `trailingTriggers`;
 * grammar.md §"Newline continuation").
 *
 * `match`, `invoke`, `Ok` and `Err` are the expression-statement heads among
 * the reserved keywords (lexer.ts `reservedKeywords`). None is a type name:
 * the type grammar spells the Result type `Result<T, E>`, and has no `match`
 * or `invoke` form at all, so each is exactly as impossible at an arm start as
 * `let` is. The three remaining non-type keywords a statement can open with —
 * `true`, `false`, `null` — are DELIBERATELY absent: they are `LiteralType`
 * atoms (grammar.md §"Type grammar"), so `schema X = true | null` is a
 * right-hand side and stopping on them would truncate it.
 *
 * `enum` heads a statement too and is DELIBERATELY absent: `parseType`
 * captures the rejected inline form `enum["a", "b"]` whole, and
 * `checkSchemaDeclarationGraph`'s per-arm pass then fires
 * `theta/parse/inline-enum` over that captured arm through
 * `checkInlineEnumForm` — the same rejection the object form's field-type
 * position raises. An arm-position stop would strand the source for the
 * statement loop instead, which is neither the capture the check needs nor a
 * shape the statement loop can read. Distinct from `STATEMENT_ONLY_KEYWORDS`
 * above, which answers a different question (what proves the `isTernaryHead`
 * scan crossed a statement boundary) and is tuned to it — it carries `else`,
 * omits `for`, and carries the `enum` this set must not.
 */
const ALIAS_ARM_STOP_KEYWORDS: ReadonlySet<string> = new Set([
  "let",
  "fn",
  "if",
  "while",
  "for",
  "break",
  "continue",
  "return",
  "schema",
  "import",
  "export",
  "match",
  "invoke",
  "Ok",
  "Err",
]);

/**
 * Punctuation that ends an alias/union right-hand side met at an ARM-TOKEN
 * BOUNDARY — where `AliasRhs ::= Type ("|" Type)*` requires an arm to START
 * (before the first arm, or straight after a top-level `|`) or where one has
 * been COMPLETED. No member can begin or continue a `Type`: the type
 * grammar's forms are the named / primitive / literal atoms, the `<…>` generic
 * application and the `{…}` inline object (grammar.md §"Type grammar"), so
 * there is no parenthesised or bracket-headed `Type`, and neither `@` nor a
 * template backtick occurs in it at all. Every member DOES head a punct-led
 * expression statement (`EXPRESSION_LEAD_PUNCT`): a query, a template, a
 * parenthesised expression, an array literal. Meeting one at a boundary
 * therefore proves the right-hand side already ended and the lexer swallowed
 * the boundary newline behind a trailing `=` / `>` continuation trigger
 * (lexer.ts `trailingTriggers`) — the keyword case's argument, one token class
 * along, and without it the whole following statement is absorbed into the arm
 * source with no diagnostic at all.
 *
 * `{` is absent because an inline `ObjectType` IS a `Type` in any `Type`
 * position, and `-` is absent because its stop is scoped to one boundary, not
 * both: no `Type` begins with `-` either (`LiteralType ::= STRING | NUMBER |
 * BOOLEAN | NULL`, grammar.md §"Type grammar" — the `"-" NUMBER` alternative
 * belongs to the value sublanguage's `PrimitiveLit`), so an arm-start `-`
 * opens no legal arm and is CAPTURED there instead of stopping the scan:
 * `schema X = -1` keeps the junk arm `"-"` rather than falling to the
 * shapeless-RHS `empty-schema-body` path. Whether that right-hand side is a
 * well-formed `AliasRhs` is a question answered from the DECLARATION's own
 * extent, not from this capture — `finishAliasSchema` checks the two against
 * each other once the capture returns (bug 0042 §Fix), and this stop set is
 * unchanged by that check. A `-` straight after a COMPLETED arm is a different position
 * entirely — no `Type` continues with it, and it heads a unary-negation
 * expression statement — so `parseType` stops on it through its own
 * completed-arm-only test rather than through this set, whose members stop at
 * BOTH boundaries. `!` is a member: it is the unary-not head of an expression
 * statement (`EXPRESSION_LEAD_PUNCT`) and the type grammar has no `!`
 * anywhere, so it can neither start nor continue a `Type` — the same argument
 * as `(` and `[`, and unlike `-` it holds at an arm start too. The `[` of the rejected
 * inline `enum["a", "b"]` form is at no boundary — it follows the bare `enum`
 * keyword, which completes no arm — so that form is still captured whole for
 * `checkInlineEnumForm`.
 */
const ALIAS_ARM_STOP_PUNCT: ReadonlySet<string> = new Set(["@", "`", "(", "[", "!"]);

/**
 * Whether a token stopping an alias/union right-hand-side capture is residue
 * the author wrote, rather than one of the structural closers `parseType`
 * also breaks on — `,`, `)`, `{`, `}`, `=`. Each of those is excluded for one
 * of two reasons. It closes an ENCLOSING construct, where a report would be a
 * false positive: `fn f(): integer { schema X = integer }` is a legal program
 * whose body-closing `}` sits on the declaration's own line, and it is the
 * case this exclusion exists to protect. Or the statement loop already draws
 * its own diagnostic at that boundary — `unsupported-feature`'s
 * `stray '<t>' in statement position` for a top-level `,` / `)` / `}` / `=`,
 * `bare-object-literal` for a `{` — so a second code here would add nothing
 * an author can act on and must not double up.
 *
 * A residue head is a value-ish atom
 * (`ident` / `keyword` / `string` / `number`) or a punct that heads a
 * punct-led statement (`ALIAS_ARM_STOP_PUNCT`) or a unary-negation `-` — the
 * same token kinds `parseType`'s own stops fire on, read back at the
 * cursor rather than at the token before it (`finishAliasSchema`, bug 0042
 * §Fix).
 */
function isAliasResidueHead(t: Token): boolean {
  switch (t.kind) {
    case "ident":
    case "keyword":
    case "string":
    case "number":
      return true;
    case "punct":
      return ALIAS_ARM_STOP_PUNCT.has(t.text) || t.text === "-";
    default:
      return false;
  }
}

/** Whether a token can begin an expression (a ternary consequent). */
function canStartExpression(t: Token): boolean {
  switch (t.kind) {
    case "number":
    case "string":
    case "ident":
      return true;
    case "keyword":
      return EXPRESSION_KEYWORDS.has(t.text);
    case "punct":
      return EXPRESSION_LEAD_PUNCT.has(t.text);
    default:
      return false;
  }
}

/**
 * Whether a schema field's captured `typeSource` text ends a `Type` atom
 * (grammar.md:90–:95), rather than stopping mid-token on trailing punctuation
 * `parseType`'s depth-0 stop set has no entry for (`.`, `-`, and similarly).
 * `parseType`'s `stopAtFieldBoundary` arm stops the capture in front of the
 * next value-ish token without asking whether the token BEHIND the cursor
 * could end a `Type`; when it could not, the boundary the arm reports was
 * manufactured by the capture stopping inside one field's text, not written
 * by the author as the start of a further `Field` (bug 0285 §Fix). An empty
 * capture ends no atom. The closers `>` `)` `]` `}` and a string-literal
 * quote can end a `Type` atom (a generic application, a call, an inline
 * object/array, or a string-literal type); every other trailing character is
 * punctuation no `Type` production ends on.
 */
function typeSourceEndsAtom(typeSource: string): boolean {
  if (typeSource.length === 0) {
    return false;
  }
  const last = typeSource[typeSource.length - 1] ?? "";
  if (/[A-Za-z0-9_]/.test(last)) {
    return true;
  }
  return last === ">" || last === ")" || last === "]" || last === "}" || last === '"' || last === "'";
}

/**
 * Canonicalise a parsed `{ ... }` body for the ONE position that requires a
 * structural tail (`BlockExpr`, bug 0082 §Fix): promote a trailing bare
 * `ExprStmt` to `Block.tail` when `parseForms` left `tail: null`.
 *
 * WHY THIS IS NEEDED, NOT COSMETIC. Newline continuation swallows every
 * `stmt-sep` at bracket depth > 0 (lexer.ts `collapseContinuations`), so
 * inside ANY `{ ... }` — a `BlockExpr` included — only the FIRST statement in
 * source order (or one immediately following a postfix `?` / a nested `}`)
 * ever sees `lineStart: true`; every later line-start expression form reaches
 * `parseForms`'s tail-promotion test with `lineStart: false` and is recorded
 * as an ordinary `ExprStmt` instead. `executeBlock`
 * (../runtime/statement-executor.ts) already treats a trailing bare `expr`
 * statement as tail-EQUIVALENT for VALUE purposes (its own doc comment states
 * the rule); this function makes that equivalence STRUCTURAL for `BlockExpr`
 * specifically, so `Block.tail` genuinely carries the block's value node
 * (grammar.md:118) rather than leaving grammar.md's REQUIRED tail to a
 * runtime fallback that this position's `theta/parse/block-expr-missing-tail`
 * check would otherwise misfire against.
 *
 * Scoped to the returned `BlockExpr.body` alone: `parseBlock`'s other callers
 * (`FnBody` / `StmtBlock` / `ThetaBody`) admit an implicit `null` tail by
 * design (grammar.md :119/:121) and are untouched — this function is never
 * called on their result.
 */
function promoteTrailingExprToTail(block: Block): Block {
  if (block.tail !== null) {
    return block;
  }
  const last = block.statements[block.statements.length - 1];
  if (last === undefined || last.kind !== "expr") {
    return block;
  }
  return { statements: block.statements.slice(0, -1), tail: last.expr };
}

/** One parsed top-level / block form: its statement node plus tail metadata. */
interface Form {
  readonly stmt: Stmt;
  /** The raw `Expr` when the form is an expression form, else `null`. */
  readonly expr: Expr | null;
  /** `true` when the form began at a logical-line start (after a `stmt-sep`). */
  readonly lineStart: boolean;
}

/**
 * A per-invocation recursive-descent parser over the lexer's continuation-joined
 * token stream. Holds only per-parse cursor / diagnostic / binding-scope state
 * (constructor-injected), never module-level mutable state.
 */
class BodyParser {
  private pos = 0;
  /**
   * When set, `parsePrimary` does NOT treat a leading `{` (bare object literal)
   * or an `Ident {` (named object literal) as an object-literal expression, so
   * an `if` / `while` / `for` header's `{` reads as the block opener, not an
   * object literal. It is cleared inside a bracketed group (`(...)`, `[...]`,
   * call args, object-field values, match arms) so an object literal nested
   * inside a condition still parses.
   */
  private suppressBrace = false;
  /** Declared binding mutability, for the V3b immutable-rebinding delegation. */
  private readonly bindings = new Map<string, boolean>();
  public readonly diagnostics: Diagnostic[] = [];
  /** Binary-operator precedence, lowest tier first (each left-associative). */
  private readonly tiers: readonly (readonly string[])[] = [
    ["||"],
    ["&&"],
    ["==", "!="],
    ["<", "<=", ">", ">="],
    ["+", "-"],
    ["*", "/", "%"],
  ];
  /**
   * Tier indices into `tiers` whose operators are non-associative and reject
   * chaining (equality `== !=` and comparison `< <= > >=`), per
   * expressions.md §"Operator precedence".
   */
  private readonly nonAssociativeTiers: ReadonlySet<number> = new Set([2, 3]);

  public constructor(
    private readonly tokens: readonly Token[],
    private readonly file: string,
    /**
     * The raw (newline-normalised) body source the tokens index into. A
     * `@`...`` query template is recovered by slicing this verbatim between the
     * backtick token bounds, so the template preserves the author's exact text
     * (punctuation, interpolation braces, and internal spacing) rather than a
     * lossy space-join of the interior tokens.
     */
    private readonly bodyText: string = "",
    /**
     * The frontmatter `params:` field wire names. A theta's `params:` fields ARE
     * its parameters (bindings.md:31 "Function parameters"), an always-immutable
     * context, and they are whole-file-visible — so they seed `this.bindings` as
     * immutable at file scope before any body statement parses, and
     * `buildReassign` draws `immutable-rebinding` for a write to one exactly as
     * for an immutable top-level `let` (bug 0370 §Fix F3). A body `let` of the
     * same name overwrites the seed file-linearly, so a shadowing `let mut`
     * write stays writable.
     */
    paramFieldNames: ReadonlySet<string> = new Set(),
  ) {
    for (const name of paramFieldNames) {
      this.bindings.set(name, false);
    }
  }

  // --- cursor helpers -----------------------------------------------------

  private peek(offset = 0): Token {
    return this.tokens[this.pos + offset] ?? this.eofToken();
  }

  private eofToken(): Token {
    const last = this.tokens[this.tokens.length - 1];
    const end = last?.range.end ?? { line: 1, column: 1 };
    return { kind: "eof", text: "", range: { start: end, end } };
  }

  private advance(): Token {
    const t = this.peek();
    if (t.kind !== "eof") {
      this.pos += 1;
    }
    return t;
  }

  private atEnd(): boolean {
    return this.peek().kind === "eof";
  }

  private isPunct(text: string, offset = 0): boolean {
    const t = this.peek(offset);
    return t.kind === "punct" && t.text === text;
  }

  private isKeyword(text: string, offset = 0): boolean {
    const t = this.peek(offset);
    return t.kind === "keyword" && t.text === text;
  }

  /**
   * How many punct `)` tokens the half-open span `[from, to)` consumed beyond
   * its own punct `(` tokens — i.e. how many closers it swallowed that were not
   * its own. Only `punct` tokens count, so a `)` character inside a string or
   * template token's text is excluded by construction.
   */
  private unmatchedCloseParens(from: number, to: number): number {
    let net = 0;
    for (let i = from; i < to; i += 1) {
      const t = this.tokens[i];
      if (t?.kind !== "punct") {
        continue;
      }
      if (t.text === "(") {
        net -= 1;
      } else if (t.text === ")") {
        net += 1;
      }
    }
    return net;
  }

  /**
   * How many punct `}` tokens the half-open span `[from, to)` consumed beyond
   * its own punct `{` tokens — the `unmatchedCloseParens` sibling for
   * `parseSchemaObjectBody`'s own withhold (bug 0245 §Fix): a field-TYPE
   * capture that swallowed the enclosing object body's own `}` took a closer
   * that was not its own, under the same unfloored `<`/`>` depth counter in
   * `parseType`. Only `punct` tokens count, so a `}` character inside a string
   * or template token's text is excluded by construction.
   */
  private unmatchedCloseBraces(from: number, to: number): number {
    let net = 0;
    for (let i = from; i < to; i += 1) {
      const t = this.tokens[i];
      if (t?.kind !== "punct") {
        continue;
      }
      if (t.text === "{") {
        net -= 1;
      } else if (t.text === "}") {
        net += 1;
      }
    }
    return net;
  }

  // --- body / block -------------------------------------------------------

  public parseBody(): Block {
    return this.parseForms(() => this.atEnd());
  }

  private parseBlock(): Block {
    // Consumes a `{ ... }` StmtBlock / FnBody. `parseBlock` is the single
    // production for EVERY non-top-level block (if/else/while/for/fn-body/
    // match-arm block-exprs); the top-level document parses through
    // `parseBody` → `parseForms` directly and never calls `parseBlock`, so
    // this snapshot/restore cannot touch top-level file-linear behaviour.
    // Local bindings shadow lexically, the same as Rust or TypeScript
    // (expressions.md:51): a name `let`-declared inside this block must stop
    // shadowing once the block's `}` closes, so the outer same-named entry
    // (if any) is exactly as it was before the block. `this.bindings` is
    // otherwise a flat, file-linear map with no such boundary; a block-scoped
    // `let`/`let mut` would permanently overwrite an outer entry of the same
    // name for the rest of the file, producing a false — or falsely absent —
    // `theta/parse/immutable-rebinding` on a later write to the outer binding
    // (bug 0386). Snapshotting and restoring the whole map around the block
    // body closes that leak without reassigning the `readonly` field.
    const savedBindings = new Map(this.bindings);
    if (this.isPunct("{")) {
      this.advance();
    }
    try {
      const block = this.parseForms(() => this.isPunct("}") || this.atEnd());
      if (this.isPunct("}")) {
        this.advance();
      }
      return block;
    } finally {
      this.bindings.clear();
      for (const [n, m] of savedBindings) {
        this.bindings.set(n, m);
      }
    }
  }

  /** Parse forms until `isEnd`, promoting a trailing tail `Expr` per grammar. */
  private parseForms(isEnd: () => boolean): Block {
    const forms: Form[] = [];
    // The postfix error-propagation `?` is a complete-expression terminator that
    // always closes its statement and never triggers newline continuation
    // (grammar.md §"Newline continuation" — "The `?` trigger is the ternary head
    // only"). The lexer, unable to distinguish a postfix `?` from a ternary-head
    // `?`, swallows the following `stmt-sep`; so a form whose final token is a
    // postfix `?` forces the NEXT form to start a new logical line, restoring
    // its `lineStart` (and hence its tail-`Expr` promotion eligibility).
    let forcedLineStart = false;
    while (!isEnd()) {
      let sawSep = forms.length === 0 || forcedLineStart;
      while (this.peek().kind === "stmt-sep") {
        this.advance();
        sawSep = true;
      }
      if (isEnd()) {
        break;
      }
      const before = this.pos;
      const form = this.parseForm(sawSep);
      if (form === null) {
        // No progress possible on this token: it starts no legal statement or
        // expression form. A stray punctuation token in statement position (a
        // trailing `;`, a stray non-grammar char) is not part of the grammar
        // (lexical.md §"Statement terminators": semicolons are not part of the
        // grammar) — surface a parse error rather than silently dropping it, then
        // drop it to guarantee termination.
        if (this.pos === before) {
          const stray = this.peek();
          if (stray.kind === "punct") {
            this.diagnostics.push({
              severity: "error",
              code: "theta/parse/unsupported-feature",
              file: this.file,
              range: stray.range,
              message: `unsupported syntactic feature: stray '${stray.text}' in statement position`,
            });
          }
          this.advance();
        }
        continue;
      }
      forms.push(form);
      const lastTok = this.tokens[this.pos - 1];
      // A postfix `?` and a block-closing `}` both terminate their statement and
      // never continue onto the next line: the `stmt-sep` after each is not
      // surfaced as a form boundary here (the lexer swallows the postfix-`?`
      // separator; a block-terminated statement leaves the next form with no
      // consumed `stmt-sep`), so restore `lineStart` for the NEXT form to keep
      // its tail-`Expr` promotion eligibility. Without the `}` arm, a trailing
      // expression after an `if`/`while`/`for`/`fn` block
      // (`fn s(n){ if …{…}\n n + s(n - 1) }`) would lose its FN-5 tail promotion
      // and its value would be dropped.
      forcedLineStart =
        lastTok !== undefined &&
        lastTok.kind === "punct" &&
        (lastTok.text === "?" || lastTok.text === "}");
    }

    // ThetaBody ::= Stmt* Expr? — the final form is promoted to the tail iff it
    // is a line-start expression form. Its value is the body's final value
    // (functions.md FN-5: a fn/theta body's value is its tail expression),
    // including a lone or trailing call/invoke/query — `fn f(n){ g(n) }` MUST
    // return `g(n)` (FN-5), so a bare-call tail is the final value, not a
    // discarded action. The V19a-T continuation witness `f(a,\n b)` is about
    // grouping the multi-line call arguments into ONE form (a lexer concern),
    // orthogonal to whether that one form's value is the body's tail.
    const last = forms[forms.length - 1];
    if (last !== undefined && last.expr !== null && last.lineStart) {
      return {
        statements: forms.slice(0, -1).map((f) => f.stmt),
        tail: last.expr,
      };
    }
    return { statements: forms.map((f) => f.stmt), tail: null };
  }

  // --- individual forms ---------------------------------------------------

  private parseForm(lineStart: boolean): Form | null {
    const t = this.peek();
    // `subagent fn` — `subagent` is a contextual keyword (grammar.md
    // §"Contextual keywords") recognised only immediately before a `fn`; a
    // nested occurrence still lowers to a `fn` node so the placement walk fires
    // `theta/parse/nested-fn` (FN-1/FN-6). Everywhere else `subagent` is an
    // ordinary identifier and falls through to the ident / expression paths.
    if (t.kind === "ident" && t.text === "subagent" && this.isKeyword("fn", 1)) {
      this.advance(); // `subagent`
      return this.wrap(this.parseFn(true), null, lineStart);
    }
    if (t.kind === "keyword") {
      switch (t.text) {
        case "let":
          return this.wrap(this.parseLet(), null, lineStart);
        case "fn":
          return this.wrap(this.parseFn(), null, lineStart);
        case "if":
          return this.wrap(this.parseIf(), null, lineStart);
        case "while":
          return this.wrap(this.parseWhile(), null, lineStart);
        case "for":
          return this.wrap(this.parseFor(), null, lineStart);
        case "break":
          return this.wrap(this.simpleKeyword("break"), null, lineStart);
        case "continue":
          return this.wrap(this.simpleKeyword("continue"), null, lineStart);
        case "return":
          return this.wrap(this.parseReturn(), null, lineStart);
        case "schema":
          return this.wrap(this.parseSchema(), null, lineStart);
        case "enum":
          return this.wrap(this.parseEnum(), null, lineStart);
        case "import":
          return this.wrap(this.parseImportExport("import"), null, lineStart);
        case "export":
          return this.wrap(this.parseImportExport("export"), null, lineStart);
        default:
          break;
      }
    }

    // Statement-form reassignment: `x = e` / `x += e` (ident + assign op).
    if (t.kind === "ident") {
      const reassign = this.tryParseReassign();
      if (reassign !== null) {
        return this.wrap(reassign, null, lineStart);
      }
    }

    // Every remaining form is an expression form; its statement wrapper depends
    // on the expression kind.
    const expr = this.parseExpression();
    if (expr === null) {
      return null;
    }
    // A member / index expression at statement head followed by an assignment
    // operator is `obj.field = …` / `arr[i] = …` — theta 1.0 mutability is
    // binding-level only (bindings.md §Mutability is binding-level only). Detect
    // it here (the AST carries no member/index reassignment form) and consume
    // the RHS so the assignment does not mis-parse into stray forms.
    if (expr.kind === "member" || expr.kind === "index") {
      const isSimple = this.isPunct("=") && !this.isPunct("=", 1);
      const opTok = this.peek();
      const isCompound =
        opTok.kind === "punct" &&
        COMPOUND_OPS.has(opTok.text) &&
        this.isPunct("=", 1);
      if (isSimple || isCompound) {
        this.advance(); // operator (`=`, or the `<op>` of `<op>=`)
        if (isCompound) {
          this.advance(); // the `=` of a compound `<op>=`
        }
        const diag = checkAssignmentTarget(
          { kind: expr.kind },
          { file: this.file, range: expr.range },
        );
        if (diag !== undefined) {
          this.diagnostics.push(diag);
        }
        this.parseExpression(); // consume + discard the RHS
        return this.wrap(
          { kind: "expr", expr, range: expr.range },
          null,
          lineStart,
        );
      }
    }
    // A `par for` in statement position is a discarded-value expression
    // statement (grammar.md §Blocks): it is NOT promoted to the body tail, so
    // its value is discarded (`tailExpr = null`). It is recorded as an
    // `ExprStmt`, so a standalone `par for` reads as an expression statement
    // rather than a bare tail node whose value would flow on as the body tail.
    const tailExpr = expr.kind === "par-for" ? null : expr;
    return this.wrap(this.exprToStmt(expr), tailExpr, lineStart);
  }

  private wrap(stmt: Stmt, expr: Expr | null, lineStart: boolean): Form {
    return { stmt, expr, lineStart };
  }

  private exprToStmt(expr: Expr): Stmt {
    if (expr.kind === "call") {
      return { kind: "tool-call", call: expr, range: expr.range };
    }
    if (expr.kind === "invoke") {
      return { kind: "invoke", invoke: expr, range: expr.range };
    }
    if (expr.kind === "query") {
      return { kind: "query", query: expr, range: expr.range };
    }
    return { kind: "expr", expr, range: expr.range };
  }

  private simpleKeyword(kind: "break" | "continue"): Stmt {
    const t = this.advance();
    if (kind === "break") {
      // A value operand on the same logical line (`break expr`) is forbidden in
      // theta 1.0. Peek (do not consume) so the residual expression still parses
      // as its own statement; the structural checker reads `hasValue`.
      const next = this.peek();
      const hasValue =
        next.kind !== "stmt-sep" &&
        next.kind !== "eof" &&
        !(next.kind === "punct" && next.text === "}");
      return { kind, hasValue, range: t.range };
    }
    return { kind, range: t.range };
  }

  private parseLet(): Stmt {
    const kw = this.advance(); // `let`
    let mutable = false;
    if (this.isKeyword("mut")) {
      this.advance();
      mutable = true;
    }
    const nameTok = this.advance();
    const name = nameTok.text;
    if (mutable && name === "_") {
      // `_` is a discard binding and cannot be reassigned, so `mut` is
      // meaningless on it (bindings.md §"Immutable contexts").
      this.diagnostics.push({
        severity: "error",
        code: "theta/parse/mut-on-discard",
        file: this.file,
        range: nameTok.range,
        message: "'mut' is not permitted on discard binding '_'",
      });
    }
    let annotation: string | null = null;
    // Absent iff the capture ended at its own terminator (`=`); present, it
    // stopped somewhere else — past a syntax fault, holding the next
    // construct's text, or early at a token this position does not derive —
    // and clause (iv)(3) (bug 0279) withholds only on that mark, not on the
    // range of whichever diagnostic happens to cover it.
    let annotationAbsorbed = false;
    if (this.isPunct(":")) {
      this.advance();
      annotation = this.parseType();
      annotationAbsorbed = !this.isPunct("=");
    }
    let init: Expr | null = null;
    if (this.isPunct("=")) {
      this.advance();
      init = this.parseExpressionAtBlockSite();
    }
    // A `let x: T = @`…`` (or its `?`-propagating form `let x: T = @`…`?`) binds
    // a typed query: propagate the declared annotation onto the query so the
    // runtime drives the typed two-phase respond loop and lowers `T` as the
    // response schema (a bare `@`…`` initialiser carries no `@<Schema>`
    // annotation of its own). The `?`-wrapped form is `try(query)`, so the
    // annotation propagates onto the try's inner query operand.
    if (init !== null && annotation !== null && annotation.length > 0) {
      if (init.kind === "query" && init.schema === null) {
        init = { ...init, schema: annotation, schemaFromLetAnnotation: true };
      } else if (
        init.kind === "try" &&
        init.operand.kind === "query" &&
        init.operand.schema === null
      ) {
        init = {
          ...init,
          operand: { ...init.operand, schema: annotation, schemaFromLetAnnotation: true },
        };
      }
    }
    this.bindings.set(name, mutable);
    return {
      kind: "let",
      name,
      mutable,
      annotation,
      init,
      ...(annotationAbsorbed ? { annotationAbsorbed: true } : {}),
      range: spanRange(kw.range, this.prevRange()),
    };
  }

  private tryParseReassign(): Stmt | null {
    const nameTok = this.peek();
    // `x = e` (simple) or `x <op>= e` (compound, `<op>` + `=` as two tokens).
    if (this.isPunct("=", 1)) {
      this.advance(); // name
      this.advance(); // `=`
      const value = this.parseExpression();
      return this.buildReassign(nameTok, "=", value);
    }
    const opTok = this.peek(1);
    if (
      opTok.kind === "punct" &&
      COMPOUND_OPS.has(opTok.text) &&
      this.isPunct("=", 2)
    ) {
      this.advance(); // name
      this.advance(); // op
      this.advance(); // `=`
      const value = this.parseExpression();
      return this.buildReassign(
        nameTok,
        `${opTok.text}=` as ReassignStmt["op"],
        value,
      );
    }
    return null;
  }

  private buildReassign(
    nameTok: Token,
    op: ReassignStmt["op"],
    value: Expr | null,
  ): Stmt {
    const target = nameTok.text;
    // The EXACT signal the ident walk reads to defer its out-of-scope
    // `unknown-identifier`: set true in precisely the two branches below that
    // push `theta/parse/immutable-rebinding`, so the walk suppresses a spurious
    // second refusal for exactly those targets (bug 0370 §Fix layer 1's
    // G6-defer), never for a name this pass drew nothing on.
    let immutableRebindingEmitted = false;
    if (target === "_") {
      // `_` is the discard binding and cannot be reassigned (bindings.md:34,
      // an immutable context). The ident walk's own `_` exemption stays silent,
      // so this is the single emission for a `_` target (bug 0370 §Fix F4).
      this.diagnostics.push({
        severity: "error",
        code: "theta/parse/immutable-rebinding",
        file: this.file,
        range: nameTok.range,
        message: "cannot reassign immutable binding '_'",
      });
      immutableRebindingEmitted = true;
    } else {
      // Delegate the immutable-rebinding check to V3b over the real binding
      // scope: fire only for a known immutable (`let`, non-`mut`) target — a
      // top-level `let`, a save/restore-scoped parameter / `for` / `par for` /
      // `match` binder, or a whole-file `params:` field seed (bug 0370 §Fix
      // F1/F3); undeclared targets are the ident walk's concern.
      const known = this.bindings.get(target);
      if (known === false) {
        const diag = checkReassignment(
          { name: target, mutable: false },
          { file: this.file, range: nameTok.range },
        );
        if (diag !== undefined) {
          this.diagnostics.push(diag);
          immutableRebindingEmitted = true;
        }
      }
    }
    return {
      kind: "reassign",
      target,
      op,
      value: value ?? nullExpr(nameTok.range),
      range: spanRange(nameTok.range, this.prevRange()),
      immutableRebindingEmitted,
    };
  }

  /**
   * Record `names` as immutable (`this.bindings.set(name, false)`) for the
   * duration of `body` and restore the map to its EXACT prior state
   * afterward — a parameter, `for` variable, or `match` binder is an
   * always-immutable context (bindings.md §"Immutable contexts"), and
   * `buildReassign`'s flat mutability map has to see that for the scope `body`
   * parses, without leaking the entry file-linearly onto an unrelated
   * top-level binding of the same name once `body` returns (bug 0370 §Fix
   * layer 1). Restore replays each name's PRIOR entry (present or absent),
   * rather than a fixed `true`, so a same-named outer binding's own
   * mutability survives a nested parameter/loop/pattern shadow unchanged.
   */
  private withImmutableBindings<T>(names: readonly string[], body: () => T): T {
    const saved: Array<readonly [string, boolean | undefined]> = names.map(
      (name) => [name, this.bindings.get(name)] as const,
    );
    for (const name of names) {
      this.bindings.set(name, false);
    }
    try {
      return body();
    } finally {
      for (const [name, prior] of saved) {
        if (prior === undefined) {
          this.bindings.delete(name);
        } else {
          this.bindings.set(name, prior);
        }
      }
    }
  }

  /**
   * Parse a control-flow header expression (an `if` / `while` condition or a
   * `for` iterand) with object-literal brace-suppression active so the trailing
   * `{` opens the block rather than reading as an object literal.
   */
  private parseHeaderExpression(): Expr | null {
    const save = this.suppressBrace;
    this.suppressBrace = true;
    try {
      const inner = this.parseExpression();
      this.consumeTrailingAssignment();
      return inner;
    } finally {
      this.suppressBrace = save;
    }
  }

  private parseIf(): Stmt {
    const kw = this.advance(); // `if`
    const condition = this.parseHeaderExpression() ?? nullExpr(kw.range);
    const then = this.parseBlock();
    let otherwise: IfStmt | Block | null = null;
    // An `else` may follow across an intervening `stmt-sep`.
    const save = this.pos;
    while (this.peek().kind === "stmt-sep") {
      this.advance();
    }
    if (this.isKeyword("else")) {
      this.advance();
      if (this.isKeyword("if")) {
        otherwise = this.parseIf() as IfStmt;
      } else {
        otherwise = this.parseBlock();
      }
    } else {
      this.pos = save;
    }
    return {
      kind: "if",
      condition,
      then,
      otherwise,
      range: spanRange(kw.range, this.prevRange()),
    };
  }

  private parseWhile(): Stmt {
    const kw = this.advance();
    const condition = this.parseHeaderExpression() ?? nullExpr(kw.range);
    const body = this.parseBlock();
    return {
      kind: "while",
      condition,
      body,
      range: spanRange(kw.range, this.prevRange()),
    };
  }

  private parseFor(): Stmt {
    const kw = this.advance();
    let mutConsumed = false;
    if (this.isKeyword("mut")) {
      // A `mut` modifier on a `for` iteration variable is an always-immutable
      // context (bindings.md §Immutable contexts).
      mutConsumed = true;
      const mutTok = this.advance();
      const diag = checkMutModifier(
        { position: "for-var" },
        { file: this.file, range: mutTok.range },
      );
      if (diag !== undefined) {
        this.diagnostics.push(diag);
      }
    }
    const variableTok = this.peek();
    const variable = this.advance().text;
    // lexical.md:20 reserves all 32 spellings from identifier position with no
    // scope list, and code-registry-parse.md:21's Trigger names no position
    // either: `ForStmt ::= "for" Ident "in" Expr StmtBlock` (grammar.md) makes
    // the loop variable an `Ident` terminal the lexer's adjacency dispatch
    // cannot reach (it keys on `let`/`fn`/`schema`/`enum` tokens, never on
    // this production). Guarded against the same recovery artefact bug 0148's
    // `atParamStart` guards for `fn` parameters: `mutConsumed` true with the
    // captured token reading `in` means no variable was written at all — the
    // `mut` modifier's own consumption left `in` occupying this slot, and that
    // artefact must not gain a second diagnostic beside
    // `mut-on-immutable-context`. The discriminator between that artefact and a
    // genuine iteration variable spelled `in` behind a `mut` (`for mut in in
    // xs`) is the FOLLOWING token: the artefact's next token is the iterand
    // (`xs`), while a genuine variable is followed by the grammar's own `in`
    // keyword, so only the artefact is suppressed. The lexer's own adjacency
    // diagnostic is left standing beside this one where the variable is itself `let`/`fn`/
    // `schema`/`enum` (misfire face, bug 0153 §Fix (c) route (i)): narrowing
    // the lexer to suppress it would drift bugs 0051/0135's citations there,
    // and requiring the following token to be `ident`-kind (route (iii)) is
    // refuted by `let let = 1` firing correctly.
    const mutRecoveryArtefact =
      mutConsumed && variableTok.text === "in" && !this.isKeyword("in");
    if (variableTok.kind === "keyword" && !mutRecoveryArtefact) {
      this.diagnostics.push(
        reservedKeywordAsIdentifierDiagnostic(variableTok.text, variableTok.range, this.file),
      );
    }
    if (this.isKeyword("in")) {
      this.advance();
    }
    const iterand = this.parseHeaderExpression() ?? nullExpr(kw.range);
    // The loop variable is an always-immutable context (bindings.md §"Immutable
    // contexts"); scope it to the body's parse only so a reassignment to it
    // draws `immutable-rebinding` (bug 0370 §Fix layer 1) without leaking onto
    // an unrelated same-named binding once the loop's own scope ends.
    const body = this.withImmutableBindings([variable], () => this.parseBlock());
    return {
      kind: "for",
      variable,
      iterand,
      body,
      range: spanRange(kw.range, this.prevRange()),
    };
  }

  private parseFn(subagent = false): Stmt {
    const kw = this.advance();
    const name = this.advance().text;
    const params: FnParam[] = [];
    // Grammar: `FnDecl` parameter lists are always parenthesised (`fn f()`,
    // never `fn f`). A missing `(` after the fn name is a parse error — without
    // it a bare `fn f x { … }` silently parses `x` as the fn name's trailing
    // junk and accepts a malformed declaration.
    if (!this.isPunct("(")) {
      this.diagnostics.push({
        severity: "error",
        code: "theta/parse/unsupported-feature",
        file: this.file,
        range: this.peek().range,
        message:
          "unsupported syntactic feature: fn parameter list must be parenthesised",
      });
    }
    if (this.isPunct("(")) {
      const openTok = this.advance();
      // The closing `)` is a required terminal of `FnDecl`, and nothing else in
      // this function asks whether it arrived: the loop below exits on `)` OR on
      // EOF and the epilogue's `)` consume is conditional, so the two exits are
      // indistinguishable. The lexer removes the other boundary that would have
      // stopped the list — an unmatched `(` suppresses every following
      // `stmt-sep` (grammar.md §"Newline continuation", the open-bracket
      // trigger), so the rest of the file joins the parameter list.
      let unclosed = false;
      // A parameter TYPE capture that consumed MORE punct `)` tokens than punct
      // `(` tokens took a closer that was not its own — the list's, under the
      // unfloored `<` / `>` depth counter in `parseType` (bug 0124
      // §Reproduction (e)). Reporting the list as unclosed would then name a
      // token that IS present, so the verdict is withheld and the capture-level
      // rows keep the input. The withhold covers the recovery below as well as
      // the verdict: such an input keeps the parameters, the statement
      // absorption and the diagnostics it had before.
      let closeParenAbsorbed = false;
      // The first parameter-name-position token whose `kind` derives from no
      // `Ident` (a `punct`, `number`, `string` or `template` token). Recorded
      // rather than reported at the point of capture: only the epilogue knows
      // whether the list closed on its own `)` or on one spent elsewhere, and
      // the two settled exits (a body-open `{`, EOF) already carry the correct
      // verdict under `fn-param-list-unclosed` on their own.
      let refusedTok: Token | null = null;
      // `atParamStart` is true only where the author could have written a
      // parameter name. `mut`'s modifier check below can leave the loop
      // re-entering on a recovery artefact instead: consuming `mut` shifts
      // the annotation `:` into the name slot, then the type token into the
      // slot after that. The keyword-reserved check below must not fire on
      // either shifted token, or `fn h(mut: string)` gains a second
      // diagnostic and no longer keeps `mut-on-immutable-context` alone (bug
      // 0148 §Fix (d)).
      let atParamStart = true;
      while (!this.isPunct(")") && !this.atEnd()) {
        // A block-open `{` derives from no `FnParam` position, and a `)` before
        // it would already have exited the loop — so the list is unclosed and
        // the brace is the author's body. Break with the cursor ON it, so
        // `parseBlock` below takes it as the `FnBody` the author wrote instead
        // of recording it (and the body's own tokens) as parameters.
        if (this.isPunct("{") && !closeParenAbsorbed) {
          unclosed = true;
          break;
        }
        let mutConsumed = false;
        if (this.isKeyword("mut")) {
          // A `mut` modifier on a function parameter is an always-immutable
          // context (bindings.md §Immutable contexts).
          mutConsumed = true;
          const mutTok = this.advance();
          const diag = checkMutModifier(
            { position: "fn-param" },
            { file: this.file, range: mutTok.range },
          );
          if (diag !== undefined) {
            this.diagnostics.push(diag);
          }
        }
        const pTok = this.advance();
        // `FnParam ::= Ident ":" Type` (grammar.md) derives an `Ident` at this
        // position, and `Ident` is `[A-Za-z_][A-Za-z0-9_]*` (lexical.md) — a
        // `punct`, `number`, `string` or `template` token here is not a
        // shorter or malformed identifier, it is a different production
        // entirely. Recorded, not reported: a `mut` consume in this same
        // iteration shifts the annotation `:` into this slot as a recovery
        // artefact, and that shift must not gain a second diagnostic beside
        // `mut-on-immutable-context` (bug 0148 §Fix (d)), so the shifted token
        // is exempt for this one iteration only.
        if (
          refusedTok === null &&
          !mutConsumed &&
          pTok.kind !== "ident" &&
          pTok.kind !== "keyword"
        ) {
          refusedTok = pTok;
        }
        // lexical.md's reserved-keyword rule carries no position list of its
        // own — unlike the lowercase-first rule below — so a `fn` parameter
        // name is inside its scope (bug 0148 §Fix). A reserved spelling
        // already lexes as `kind: "keyword"` (lexer.ts, `reserved.has(value)
        // ? "keyword" : "ident"`) — the same classification `checkName`'s
        // keyword-first arm reads — so this check needs no second
        // reserved-word list. Reading that classification directly is what
        // keeps the contextual keywords `subagent` / `with` / `par` silent
        // here: they lex as `ident` and fall to the case arm below.
        if (pTok.kind === "keyword" && atParamStart) {
          this.diagnostics.push({
            severity: "error",
            code: "theta/parse/reserved-keyword-as-identifier",
            file: this.file,
            range: pTok.range,
            message: `reserved keyword '${pTok.text}' cannot be used as an identifier`,
          });
        } else if (pTok.kind === "ident") {
          // lexical.md §Identifiers requires lowercase-first for a `fn`
          // parameter name, and code-registry-parse.md's binding-case-mismatch
          // row already names the parameter position in its Trigger. The
          // predicate and the `ident` guard mirror `checkName`'s binding arm
          // (lexer.ts) so the rule keeps one spelling across every position it
          // is enforced at.
          const first = pTok.text[0] ?? "";
          const isUpper = first >= "A" && first <= "Z";
          if (isUpper) {
            this.diagnostics.push({
              severity: "error",
              code: "theta/parse/binding-case-mismatch",
              file: this.file,
              range: pTok.range,
              message: "binding name must start with a lowercase letter or _",
            });
          }
        }
        let pType = "";
        // Absent iff the capture is empty (no `:` written) or ended at its own
        // terminator (`,` or the list's `)`); present, it stopped somewhere
        // else — past a syntax fault, holding text beyond the parameter, or
        // early at a token the list does not derive — which clause (iv)(3)
        // (bug 0279) reads as the withhold's trigger instead of the coverers'
        // geometry.
        let typeAbsorbed = false;
        if (this.isPunct(":")) {
          this.advance();
          const typeStart = this.pos;
          pType = this.parseType();
          if (this.unmatchedCloseParens(typeStart, this.pos) > 0) {
            closeParenAbsorbed = true;
          }
          typeAbsorbed = pType.length > 0 && !this.isPunct(",") && !this.isPunct(")");
        }
        params.push({
          name: pTok.text,
          type: pType,
          ...(typeAbsorbed ? { typeAbsorbed: true } : {}),
        });
        if (this.isPunct(",")) {
          this.advance();
          atParamStart = true;
        } else {
          atParamStart = false;
        }
      }
      if (this.isPunct(")")) {
        this.advance();
        // The list closed, so `fn-param-list-unclosed` is silent here and says
        // nothing false: the closer this arm consumed may be the one the
        // author wrote for a statement the loop swallowed as parameters,
        // rather than for the list itself. Withheld under the same
        // absorbed-closer condition as the unclosed verdict — a capture that
        // took the list's own `)` already has its disposition decided by that
        // rule, and this arm must not add a second, conflicting one.
        if (refusedTok !== null && !closeParenAbsorbed) {
          this.diagnostics.push({
            severity: "error",
            code: "theta/parse/fn-param-not-identifier",
            file: this.file,
            range: refusedTok.range,
            message: "fn parameter name must be an identifier",
          });
        }
      } else {
        unclosed = true;
      }
      if (unclosed && !closeParenAbsorbed) {
        this.diagnostics.push({
          severity: "error",
          code: "theta/parse/fn-param-list-unclosed",
          file: this.file,
          range: openTok.range,
          message: "fn parameter list is not closed by ')'",
        });
      }
    }
    let returnType: string | null = null;
    // Absent iff no `:` was written, or the capture ended at its own
    // terminator (the body's `{`, or the contextual `with` ident); present, it
    // stopped somewhere else — past a syntax fault, holding the next
    // construct's text, or early at a token the return slot does not derive
    // (bug 0279, clause (iv)(3)'s provenance mark).
    let returnTypeAbsorbed = false;
    if (this.isPunct(":")) {
      this.advance();
      // The return slot terminates at a depth-0 `with`: grammar.md §"`fn`
      // declarations" places `(":" ReturnType)?` and `WithClause?` as
      // consecutive optional slots, and `with` is contextual (lexes as an
      // ident), so without the stop the type parser consumed it — `): string
      // with { … }` yielded the concatenated annotation `stringwith` and took
      // the with-braces as the fn BODY (bug 0005 (a)).
      returnType = this.parseType(false, true);
      returnTypeAbsorbed = !(
        this.isPunct("{") ||
        (this.peek().kind === "ident" && this.peek().text === "with")
      );
    }
    // `WithClause?` — `with` is a contextual keyword (grammar.md §"Contextual
    // keywords") admitted only here, between a `subagent fn`'s signature and its
    // body block. It is only meaningful on a `subagent fn`; on an ordinary `fn`
    // a `with` before the body is left to fall through (it is not consumed).
    let withClause: WithField[] | null = null;
    if (
      subagent &&
      this.peek().kind === "ident" &&
      this.peek().text === "with" &&
      this.isPunct("{", 1)
    ) {
      withClause = this.parseWithClause();
    }
    // Each parameter is an always-immutable context (bindings.md §"Immutable
    // contexts"); scope the record to the body's parse only so a reassignment
    // to a parameter draws `immutable-rebinding` (bug 0370 §Fix layer 1)
    // without leaking onto an unrelated same-named binding once the fn body's
    // own scope ends.
    const body = this.withImmutableBindings(params.map((p) => p.name), () =>
      this.parseBlock(),
    );
    return {
      kind: "fn",
      name,
      params,
      returnType,
      body,
      subagent,
      withClause,
      ...(returnTypeAbsorbed ? { returnTypeAbsorbed: true } : {}),
      range: spanRange(kw.range, this.prevRange()),
    };
  }

  /**
   * Parse a `subagent fn`'s `with { WithField ("," WithField)* }` session-config
   * clause (RFC 0001 FN-7; grammar.md `WithClause`). The cursor is on the `with`
   * identifier. Each `WithField` is `WithKey ":" WithValue`; the five recognised
   * keys are `system` / `model` / `tools` / `tool_loop` / `respond_repair`, and a
   * key outside them surfaces the frontmatter forward-compat warning
   * `theta/load/unknown-frontmatter-field` (FN-7 reuses the frontmatter field's
   * own diagnostics rather than coining a parallel code). Each value parses as an
   * ordinary expression against the like-named frontmatter field's shape.
   */
  private parseWithClause(): WithField[] {
    this.advance(); // `with`
    const fields: WithField[] = [];
    if (this.isPunct("{")) {
      this.advance();
      while (!this.isPunct("}") && !this.atEnd()) {
        const keyTok = this.advance();
        const key = keyTok.text;
        if (this.isPunct(":")) {
          this.advance();
        }
        const value = this.parseExpression() ?? nullExpr(keyTok.range);
        if (!WITH_CLAUSE_KEYS.has(key)) {
          this.diagnostics.push({
            severity: "warning",
            code: "theta/load/unknown-frontmatter-field",
            file: this.file,
            range: keyTok.range,
            message: `unknown 'with' session-config key '${key}'; expected one of system, model, tools, tool_loop, respond_repair`,
          });
        }
        fields.push({ key, value });
        if (this.isPunct(",")) {
          this.advance();
        }
      }
      if (this.isPunct("}")) {
        this.advance();
      }
    }
    return fields;
  }

  private parseReturn(): Stmt {
    const kw = this.advance();
    let operand: Expr | null = null;
    const next = this.peek();
    if (
      next.kind !== "stmt-sep" &&
      next.kind !== "eof" &&
      !(next.kind === "punct" && next.text === "}")
    ) {
      operand = this.parseExpression();
    }
    return {
      kind: "return",
      operand,
      range: spanRange(kw.range, this.prevRange()),
    };
  }

  /**
   * Dispatch on the token after the name (bug 0033 §Fix): `{` is the object
   * form (`finishObjectSchema`, byte-unchanged behaviour), `=` is the
   * alias/union form (`finishAliasSchema`), `by` is the explicit-discriminator
   * head (consume the field identifier, then require `{` or `=` — either
   * finisher, so a `by` clause on an object body still reaches
   * `checkByClause` rather than being discarded), and anything else is a
   * body-less `schema X` head. Every recovery path — the malformed-`by` head,
   * the shapeless alias RHS inside `finishAliasSchema`, and the head-only
   * case here — converges on `emitEmptySchemaBody`: replacing the old `null`
   * fallthrough removes the mechanism that made these forms silent, so the
   * fix decides what they are (no separate report is filed for them). No
   * token of a declaration shape survives into the statement loop: the
   * malformed-`by` and shapeless-RHS paths recover via `skipDeclarationShape`
   * (now live, with `skipBraces` consuming a brace-shaped residue), and the
   * object form's own `skipBraceRemainder` already consumes a malformed body
   * whole.
   *
   * The invariant is about the SHAPE, and the declaration's OWN extent is a
   * separate question from what a severed token does once it sits outside
   * that extent. `schema X = Cat Cat` is `AliasRhs` = one `Type` followed by
   * text the grammar gives the declaration no way to hold, so the
   * field-boundary stop ends the arm at the second `Cat` and it still reaches
   * the statement loop as its own expression statement — the general
   * same-line statement permissiveness every pair of statements shares
   * (`42 43` loads clean the same way), untouched and out of scope here.
   * There it keeps the language's ordinary disposition for that statement:
   * silent when the name resolves (a bare declared-name expression statement
   * is a no-op wherever it is written), `theta/parse/unknown-identifier` when
   * it does not. What `finishAliasSchema` checks is upstream of that
   * statement: whether the right-hand side it captured is itself an
   * `AliasRhs` at all, reported once per malformed declaration (bug 0042
   * §Fix) before the severed token is ever parsed, and anchored wherever the
   * defect is visible — the declaration's own range for an empty arm
   * position, which the split consumes leaving no token to point at, and the
   * residue token itself for same-line residue.
   */
  private parseSchema(): Stmt {
    const kw = this.advance();
    const name = this.advance().text;
    if (this.isPunct("{")) {
      return this.finishObjectSchema(kw, name, undefined);
    }
    if (this.isPunct("=")) {
      this.advance(); // `=`
      return this.finishAliasSchema(kw, name, undefined);
    }
    if (this.isKeyword("by")) {
      this.advance(); // `by`
      const byField = this.parseByField();
      if (byField !== undefined) {
        if (this.isPunct("{")) {
          return this.finishObjectSchema(kw, name, byField);
        }
        if (this.isPunct("=")) {
          this.advance(); // `=`
          return this.finishAliasSchema(kw, name, byField);
        }
      }
      // No coherent shape follows `by` (a missing field identifier, or
      // neither `{` nor `=` after it): recover to the same disposition as a
      // shapeless head.
      this.skipDeclarationShape();
      const range = spanRange(kw.range, this.prevRange());
      this.emitEmptySchemaBody(name, range);
      return { kind: "schema", name, range };
    }
    // Headless `schema X` — no shape at all (bug 0033 §Fix: "A body-less
    // `schema X` head must gain a disposition"). Consume nothing further: the
    // next token is a stmt-sep or the start of the next statement, so the
    // ordinary statement loop continues unaffected.
    const range = spanRange(kw.range, this.prevRange());
    this.emitEmptySchemaBody(name, range);
    return { kind: "schema", name, range };
  }

  /**
   * The `{ ... }` object-body form, retaining an explicit `by <field>` clause
   * when present (`schema X by f { ... }` — illegal, but the clause must
   * reach `checkByClause`, not be discarded: grammar.md §"schema X by
   * <field>"). `parseSchemaObjectBody`'s own recovery
   * (`recoverMalformedSchemaField`) always consumes a malformed body's
   * remainder in full, and returns `null` only when the capture stopped
   * before any field was pushed — the empty-object-body clause and the
   * mis-shaped-first-token clause of `theta/parse/empty-schema-body`'s
   * *Trigger* (code-registry-parse.md) both describe exactly that input, and
   * the row's *Message* ("has no fields") is true of it, so `null` keeps the
   * declaration on this disposition. A captured prefix means the row's
   * *Trigger* does not describe the input at all — the shape yielded a
   * field — so `parseSchemaObjectBody` returns that prefix instead and the
   * offending token draws its own diagnostic there.
   */
  private finishObjectSchema(kw: Token, name: string, by: string | undefined): Stmt {
    const fields = this.parseSchemaObjectBody();
    const range = spanRange(kw.range, this.prevRange());
    if (fields === null) {
      this.emitEmptySchemaBody(name, range);
      return { kind: "schema", name, range };
    }
    return { kind: "schema", name, fields, ...(by !== undefined ? { by } : {}), range };
  }

  /**
   * The `= AliasRhs` / `by f = UnionRhs` arm list (grammar.md §"schema X by
   * <field>"): one `parseType` capture over the whole right-hand side, split
   * into per-arm Type sources on the top-level `|` — the same split
   * `lowerTypeSource` (body-type-lowering.ts) re-applies to the rejoined arms
   * at lowering, so the two agree on arm granularity by construction.
   *
   * The capture runs in the object form's field-boundary mode PLUS the
   * alias-arm mode, and needs both. `>` and `=` are trailing newline-
   * continuation triggers (lexer.ts `trailingTriggers`), so the `stmt-sep`
   * that would otherwise end the right-hand side is absent after
   * `schema IntList = array<integer>` and after a bare `schema X =`, and the
   * next statement's tokens sit directly ahead of the cursor:
   *
   *   - field-boundary mode ends the capture at the value-ish token that
   *     follows a completed arm with no intervening `|`, which is what keeps
   *     `array<integer>` from growing into `array<integer>leta` (or, with the
   *     declaration last, from silently absorbing the body's tail expression);
   *   - alias-arm mode ends it at an `ALIAS_ARM_STOP_KEYWORDS` head where an
   *     arm must start, which field-boundary mode cannot see — its rule needs
   *     a completed atom behind it, and after `schema X =` there is none, so
   *     the `let` of the next line would join as the first arm's first token.
   */
  private finishAliasSchema(kw: Token, name: string, by: string | undefined): Stmt {
    const rhsSource = this.parseType(true, false, true);
    // One split, read two ways (bug 0042 §Fix): `segments` is every top-level
    // `|`-delimited slice INCLUDING the empty ones, and `arms` is its
    // non-empty filter — the same arm list `lowerTypeSource` re-derives from
    // the rejoined arms, so the arm granularity downstream sees is unchanged
    // by construction. A mismatch between the two counts is an empty arm
    // position the split silently dropped.
    const segments = splitTopLevelSegments(rhsSource, "|");
    const arms = segments.filter((segment) => segment.length > 0);
    if (arms.length === 0) {
      // A shapeless `schema X =` (nothing a `Type` can start with ahead of the
      // cursor) yields no fields: no more specific registered code fits a
      // bodyless alias right-hand side, so the empty-schema-body disposition
      // applies here too. Recovery then consumes any residue of the abandoned
      // shape — a no-op when the cursor already sits at the `stmt-sep` or at
      // the following statement's head, which is the shape both stops above
      // leave behind.
      this.skipDeclarationShape();
      const range = spanRange(kw.range, this.prevRange());
      this.emitEmptySchemaBody(name, range);
      return { kind: "schema", name, range };
    }
    const range = spanRange(kw.range, this.prevRange());
    const aliasRhsRefused = this.emitMalformedAliasRhs(name, range, segments, arms);
    return {
      kind: "schema",
      name,
      arms,
      ...(by !== undefined ? { by } : {}),
      ...(aliasRhsRefused ? { aliasRhsRefused: true } : {}),
      range,
    };
  }

  /**
   * `theta/parse/malformed-alias-rhs` (bug 0042 §Fix) for a right-hand side
   * that captured at least one arm but is still not an
   * `AliasRhs ::= Type ("|" Type)*`. At most one diagnostic, in two shapes:
   *
   *   - EMPTY ARM POSITION, checked first — `segments.length` exceeds
   *     `arms.length` whenever a top-level `|` had no `Type` on one of its
   *     sides (`splitTopLevelSegments` keeps the blank slice that
   *     `finishAliasSchema`'s non-empty filter drops). Checked first because
   *     it can coincide with same-line residue: the lexer emits `||` as ONE
   *     token, so `schema X = Cat || Cat` is both an empty arm position (an
   *     empty segment on each side of the doubled `|`) and, read the other
   *     way, a same-line residue (the second `Cat`) — and an empty arm
   *     position leaves no token of its own to point at, so the
   *     declaration's own range is the only anchor either shape can use here.
   *   - SAME-LINE RESIDUE otherwise — the token now at the cursor is one
   *     `parseType`'s own stops fire on (`isAliasResidueHead`) and it begins
   *     on the same source line as the declaration's last consumed token: the
   *     newline that would otherwise separate a following statement was never
   *     there to swallow, so this is text on the DECLARATION's own line
   *     rather than the next statement (a token on the NEXT line is not
   *     residue — grammar.md §"Newline continuation" already closes the
   *     statement there). Anchored at that token, mirroring the object body's
   *     own boundary-token emission (`parseSchemaObjectBody`'s comma rule).
   *
   * A right-hand side with no arms at all took the `empty-schema-body` path
   * above and never reaches here.
   *
   * Returns whether a diagnostic fired, so `finishAliasSchema` can record the
   * refusal on the returned decl node (bug 0061 §Fix guard 2): this method
   * pushes into `this.diagnostics`, a PARSE-time array the checker pass
   * (`checkSchemaDeclarationGraph`) never sees, so a node-level flag is the
   * only channel that lets that later pass skip refusing the same
   * right-hand side's arm text a second time under a different code.
   */
  private emitMalformedAliasRhs(
    name: string,
    declRange: SourceRange,
    segments: readonly string[],
    arms: readonly string[],
  ): boolean {
    const message = `'${name}' has a malformed right-hand side; write a single type, or arms separated by single '|', and nothing else on the declaration's line`;
    if (segments.length !== arms.length) {
      this.diagnostics.push({
        severity: "error",
        code: "theta/parse/malformed-alias-rhs",
        file: this.file,
        range: declRange,
        message,
      });
      return true;
    }
    const cursor = this.peek();
    if (!isAliasResidueHead(cursor) || cursor.range.start.line !== this.prevRange().end.line) {
      return false;
    }
    this.diagnostics.push({
      severity: "error",
      code: "theta/parse/malformed-alias-rhs",
      file: this.file,
      range: cursor.range,
      message,
    });
    return true;
  }

  /**
   * The `by`-clause field identifier (an `ident` / `keyword` token,
   * consistent with a schema field name). `undefined` (consuming nothing)
   * when the token after `by` is not one — a malformed clause the caller
   * recovers from.
   */
  private parseByField(): string | undefined {
    const t = this.peek();
    if (t.kind !== "ident" && t.kind !== "keyword") {
      return undefined;
    }
    this.advance();
    return t.text;
  }

  /**
   * `theta/parse/empty-schema-body` for a declaration whose shape yields no
   * fields — a body-less head, an unparseable object body, or a shapeless
   * alias/`by` right-hand side (bug 0033 §Fix). Reuses `checkObjectSchema`'s
   * own zero-fields branch (schema-declarations.ts, already imported here)
   * rather than a second copy of the message, so the parser-time and
   * checker-time emissions of this code can never drift apart.
   */
  private emitEmptySchemaBody(name: string, range: SourceRange): void {
    this.diagnostics.push(
      ...checkObjectSchema({ name, fields: [] }, { file: this.file, range }),
    );
  }

  /**
   * Capture a `schema X { field: Type, … }` object body's field sources.
   * Returns `null` (and consumes nothing) when the next token is not `{` —
   * unreachable from `parseSchema`'s dispatch, which calls this only after
   * confirming `{`, so this guard is defensive only. A field name is an
   * `ident` / `keyword` token followed by `:` and a type expression. Three
   * shapes cannot derive a `Field` at the current token: the token where a
   * field name belongs is neither `ident` nor `keyword`; an `as` rename's
   * wire-name token is not a `string`; or a field name is not followed by
   * `:`. Each hands its offending token to `recoverMalformedSchemaField`,
   * which consumes the balance of the brace group and either returns the
   * fields already captured (a `theta/parse/malformed-schema-field`
   * diagnostic names the offending token) or, when nothing was captured yet,
   * returns `null` so the caller keeps the declaration-subject disposition
   * that input's Trigger clause already covers.
   *
   * A fourth exit — `atEnd()` reached between fields, with no `}` ahead — is
   * `SchemaShape ::= "{" Field ("," Field)* ","? "}"`'s closing terminal never
   * arriving (bug 0245 §Fix). `theta/parse/schema-body-unclosed` fires there,
   * ranged on the body's own opening `{` (mirroring `fn-param-list-unclosed`'s
   * `openTok`), under two guards: an EMPTY captured prefix keeps
   * `theta/parse/empty-schema-body` ALONE — its Trigger already describes that
   * input, and this row says nothing about the missing `}`; and a field-TYPE
   * capture that swallowed an unmatched `}` withholds the verdict, since the
   * closer was spent inside the type rather than omitted (the
   * `fn-param-list-unclosed` absorbed-`)` withhold, mirrored here for `{`/`}`
   * via `unmatchedCloseBraces`). A truncation inside the last field's own
   * type position (`b:` at EOF) withholds nothing: the absent `}` is a fault
   * independent of the type's own, so both codes are named — the pairing `fn
   * f(a:` at EOF already draws, where `theta/parse/fn-param-list-unclosed`
   * fires beside the parameter's own refusal.
   */
  private parseSchemaObjectBody(): SchemaFieldSource[] | null {
    if (!(this.peek().kind === "punct" && this.peek().text === "{")) {
      return null;
    }
    const openTok = this.advance(); // opening `{`
    const fields: SchemaFieldSource[] = [];
    // Sticky for the whole body, mirroring `closeParenAbsorbed`: once a field
    // type has swallowed one of the body's own `}` characters, the withhold
    // applies regardless of which later exit the loop takes.
    let closeBraceAbsorbed = false;
    for (;;) {
      while (this.peek().kind === "stmt-sep") {
        this.advance();
      }
      if (this.atEnd()) {
        if (fields.length > 0 && !closeBraceAbsorbed) {
          this.diagnostics.push({
            severity: "error",
            code: "theta/parse/schema-body-unclosed",
            file: this.file,
            range: openTok.range,
            message: "schema object body is not closed by '}'",
          });
        }
        break;
      }
      if (this.isPunct("}")) {
        this.advance();
        break;
      }
      const nameTok = this.peek();
      const isFieldName = nameTok.kind === "ident" || nameTok.kind === "keyword";
      if (!isFieldName) {
        // Not a plain `ident: Type` field list (a set-of / discriminated
        // shape): the token itself is what fails to derive a `Field`, so it
        // is the offending token this iteration names.
        return this.recoverMalformedSchemaField(fields, nameTok.range);
      }
      this.advance();
      // An optional `as "WireName"` rename sits between the field identifier and
      // its type (schemas.md §Wire-name renaming). Capture it so the runtime can
      // apply outbound wire-name translation on interpolation (QRY-18).
      let wireName: string | undefined;
      if (
        (this.peek().kind === "ident" || this.peek().kind === "keyword") &&
        this.peek().text === "as"
      ) {
        this.advance(); // `as`
        const wireTok = this.peek();
        if (wireTok.kind !== "string") {
          // A non-string wire name is what fails to derive; the field
          // identifier that precedes it is not the offending token.
          return this.recoverMalformedSchemaField(fields, wireTok.range);
        }
        this.advance();
        wireName = wireTok.value ?? wireTok.text;
      }
      if (!this.isPunct(":")) {
        // The token standing where `:` should be can be a construct the
        // author wrote correctly (e.g. the body's closing `}`), so the
        // offending token is the field name itself — the field that carries
        // no type — not whatever token happens to sit at the cursor.
        return this.recoverMalformedSchemaField(fields, nameTok.range);
      }
      this.advance(); // `:`
      // lexical.md §Identifiers requires lowercase-first for a schema field
      // name, and code-registry-parse.md's binding-case-mismatch row already
      // names the field-name position in its Trigger, so this brings the
      // implementation onto a set the registry already claims rather than
      // widening it. Past the last recovery arm on purpose: every earlier arm
      // in this loop returns `null` and discards the field outright, so the
      // diagnostic belongs to a field name THIS iteration is about to push —
      // one no earlier arm of THIS iteration discarded.
      // Any earlier placement lets the comma-recovery arm below re-enter the
      // loop and read a discarded TYPE token as the next field's name,
      // drawing the code on a field that is never declared. Those recovery
      // arms are bug 0133's subject and none of its rows move: the guard
      // below runs only on a field name that reaches the push, never on one
      // an earlier arm discards. Two arms, keyed on `nameTok.kind`, split the
      // position between two rules: a `keyword` token (deliberately admitted
      // as a field name by `isFieldName` above) claims the reserved spelling
      // under lexical.md §Reserved words / code-registry-parse.md:21, and an
      // `ident` token is judged on its first letter under lexical.md
      // §Identifiers / code-registry-parse.md:19. The two subjects are
      // disjoint by construction, so the case arm never sees a reserved
      // spelling. The case predicate mirrors `checkName`'s own two-comparison
      // form (lexer.ts) — the same one the `fn` parameter check (bug 0139)
      // already reuses — so the rule keeps one spelling across every
      // position it is enforced at.
      if (nameTok.kind === "keyword") {
        // lexical.md:20 reserves all 32 spellings from identifier position
        // with no scope list, and code-registry-parse.md:21's Trigger names
        // no position either: "the field identifier" (schemas.md:23) is an
        // identifier position this fix closes. Ranged on the field-name
        // token itself, which (unlike `SchemaFieldSource`'s TYPE slot, bug
        // 0044's family, row n3) HAS a range to use. Reusing
        // `reservedKeywordAsIdentifierDiagnostic` (bug 0044's builder) keeps
        // the rendered Message identical across every NAME- and TYPE-slot
        // caller. The keyword arm sits beside the case arm below rather than
        // inside it, mirroring `parseFn`'s parameter-name check
        // (`pTok.kind === "keyword"` ahead of `pTok.kind === "ident"`), since
        // the case arm's `ident` guard already excludes reserved spellings.
        this.diagnostics.push(
          reservedKeywordAsIdentifierDiagnostic(nameTok.text, nameTok.range, this.file),
        );
      } else if (nameTok.kind === "ident") {
        const first = nameTok.text[0] ?? "";
        const isUpper = first >= "A" && first <= "Z";
        if (isUpper) {
          this.diagnostics.push({
            severity: "error",
            code: "theta/parse/binding-case-mismatch",
            file: this.file,
            range: nameTok.range,
            message: "binding name must start with a lowercase letter or _",
          });
        }
      }
      const typeStart = this.pos;
      const typeSource = this.parseType(true);
      if (this.unmatchedCloseBraces(typeStart, this.pos) > 0) {
        closeBraceAbsorbed = true;
      }
      fields.push({
        name: nameTok.text,
        typeSource,
        line: nameTok.range.start.line,
        ...(wireName !== undefined ? { wireName } : {}),
      });
      // Grammar (`SchemaShape ::= "{" Field ("," Field)* ","? "}"`): fields are
      // comma-separated. Because a newline inside the schema brace body is
      // swallowed as a continuation (no `stmt-sep`), a comma-missing field body
      // otherwise coalesces two fields into one malformed field with no
      // diagnostic (silent data-shape corruption). Require the separator: when a
      // field is directly followed by the start of another field (an
      // ident/keyword name token) with no intervening comma, surface a parse
      // error against that boundary token, then continue parsing so the dropped
      // field is NOT lost.
      if (this.isPunct(",")) {
        this.advance();
      } else {
        const boundary = this.peek();
        // A boundary token is only a genuine field start when the PRECEDING
        // type capture actually ended a `Type` atom (bug 0285 §Fix); when it
        // did not, `parseType` stopped inside the field's own text and this
        // token is not a separator position the author omitted.
        const startsNextField =
          (boundary.kind === "ident" || boundary.kind === "keyword") &&
          typeSourceEndsAtom(typeSource);
        if (startsNextField) {
          this.diagnostics.push({
            severity: "error",
            code: "theta/parse/unsupported-feature",
            file: this.file,
            range: boundary.range,
            message:
              "unsupported syntactic feature: schema fields must be comma-separated",
          });
        }
      }
    }
    return fields;
  }

  /** Consume tokens up to and including the `}` closing the current brace group. */
  private skipBraceRemainder(): void {
    let depth = 1;
    while (!this.atEnd() && depth > 0) {
      const t = this.advance();
      if (t.kind === "punct" && t.text === "{") {
        depth += 1;
      } else if (t.kind === "punct" && t.text === "}") {
        depth -= 1;
      }
    }
  }

  /**
   * `parseSchemaObjectBody`'s single recovery point for the three shapes at
   * which no further `Field` can derive (bug 0133 §Fix (a)): a token where a
   * field name belongs that is neither `ident` nor `keyword`; an `as`
   * rename's wire-name token that is not a `string`; or a field name not
   * followed by `:`. Containment is unchanged — `skipBraceRemainder` still
   * consumes the balance of the brace group (or the rest of the file on an
   * unbalanced body, a deliberate unfixed residual) — but the fields already
   * captured are retained (bug 0133 §Fix (a)2), not discarded with it.
   *
   * An EMPTY captured prefix keeps `null`: `SchemaShape ::= "{" Field (","
   * Field)* ","? "}"` (grammar.md) is a sequence, and when no element of it
   * derived, `theta/parse/empty-schema-body`'s Trigger (empty body / first
   * token not a field / no shape) already describes the input and its
   * Message ("has no fields") is true of it — `finishObjectSchema` keeps that
   * disposition. Otherwise the prefix DOES derive one or more `Field`s, so
   * that Trigger no longer describes the input: one
   * `theta/parse/malformed-schema-field` diagnostic is anchored at the
   * offending token, and the captured prefix is returned so the
   * declaration's other checks (`by-on-object-schema`, the wire-name checks,
   * the field-type walk, the constructor field-set checks) run against what
   * the author wrote.
   */
  private recoverMalformedSchemaField(
    fields: readonly SchemaFieldSource[],
    offending: SourceRange,
  ): SchemaFieldSource[] | null {
    this.skipBraceRemainder();
    if (fields.length === 0) {
      return null;
    }
    this.diagnostics.push({
      severity: "error",
      code: "theta/parse/malformed-schema-field",
      file: this.file,
      range: offending,
      message:
        "malformed schema field; each field is 'name: Type' or 'name as \"WireName\": Type'",
    });
    return [...fields];
  }

  private parseEnum(): Stmt {
    const kw = this.advance();
    const name = this.advance().text;
    const { names, values, variantDecls } = this.parseEnumVariants();
    const hasValues = Object.keys(values).length > 0;
    return {
      kind: "enum",
      name,
      variants: names,
      ...(hasValues ? { variantValues: values } : {}),
      variantDecls,
      range: spanRange(kw.range, this.prevRange()),
    };
  }

  /**
   * Capture the variants of an `enum X { A, B = "b", … }` body in source order
   * so the runtime can register the enum for `Enum.Variant` resolution: the
   * leading identifier is the variant name, and an explicit `= <string-literal>`
   * value (schemas.md §Enum declarations — "Explicit values override that
   * mapping") is captured as that variant's wire value. A non-string explicit
   * value is not captured (the name stands as the wire value; the strictness
   * diagnostic is a separate check). A non-brace enum shape yields no variants.
   *
   * A second exit — `atEnd()` reached with `depth > 0`, no closing `}` ahead —
   * is schemas.md §Enum declarations' closing terminal never arriving (bug
   * 0259 §Fix). `theta/parse/enum-body-unclosed` fires there, ranged on the
   * body's own opening `{` (mirroring `schema-body-unclosed`'s `openTok`),
   * under one guard: an EMPTY captured prefix keeps `theta/parse/empty-enum-body`
   * ALONE, since that row's Trigger already covers it. No withhold applies —
   * the `}` arm is the only place a `}` punct token is consumed and it always
   * decrements `depth`, and a `}` carried inside a string token is never
   * counted by these punct-only depth arms, so every closer the loop could
   * have absorbed instead was one the author wrote for the body itself. The
   * captured names, values and variant decls are returned unchanged either
   * way, so the emission joins a variant's own refusal rather than replacing
   * it.
   */
  private parseEnumVariants(): {
    readonly names: readonly string[];
    readonly values: Readonly<Record<string, string>>;
    readonly variantDecls: readonly EnumVariantDecl[];
  } {
    // Advance to the opening `{`; a non-brace enum shape carries no variants.
    while (!this.atEnd() && !this.isPunct("{")) {
      if (this.peek().kind === "stmt-sep") {
        return { names: [], values: {}, variantDecls: [] };
      }
      this.advance();
    }
    if (!this.isPunct("{")) {
      return { names: [], values: {}, variantDecls: [] };
    }
    const openTok = this.advance(); // `{`
    const names: string[] = [];
    const values: Record<string, string> = {};
    // The full per-variant decls (name + explicit-value kind/text) in source
    // order, feeding `checkEnumDeclaration`. Non-string explicit values ARE
    // retained here (unlike `values`) so they can be rejected.
    const variantDecls: {
      name: string;
      value?: { kind: EnumValueKind; text: string };
    }[] = [];
    // The most recently captured variant decl, so a following `= "wire"` binds
    // to it; cleared at each `,` so an inter-variant `=` cannot mis-bind.
    let currentName: string | null = null;
    let currentDecl: { name: string; value?: { kind: EnumValueKind; text: string } } | null = null;
    let expectName = true;
    let depth = 1;
    while (!this.atEnd() && depth > 0) {
      const t = this.peek();
      if (t.kind === "punct" && t.text === "{") {
        depth += 1;
        this.advance();
        continue;
      }
      if (t.kind === "punct" && t.text === "}") {
        depth -= 1;
        this.advance();
        continue;
      }
      if (depth === 1 && expectName && (t.kind === "ident" || t.kind === "keyword")) {
        // "Variant names are PascalCase identifiers" (schemas.md:78) makes the
        // variant name an identifier position; lexical.md:20 reserves all 32
        // spellings from it with no scope list, and this admits `keyword`
        // deliberately so a keyword-spelled variant CAN be captured (it is the
        // input the rule refuses) rather than mis-parsed as something else.
        if (t.kind === "keyword") {
          this.diagnostics.push(
            reservedKeywordAsIdentifierDiagnostic(t.text, t.range, this.file),
          );
        }
        names.push(t.text);
        currentName = t.text;
        currentDecl = { name: t.text };
        variantDecls.push(currentDecl);
        expectName = false;
        this.advance();
        continue;
      }
      if (depth === 1 && currentName !== null && t.kind === "punct" && t.text === "=") {
        // An explicit `= <value>` for the current variant. Only a string literal
        // becomes the wire value; a non-string literal is retained on the
        // variant decl (kind + text) so `checkEnumDeclaration` can reject it
        // (schemas.md §Enum declarations — string values only).
        this.advance(); // `=`
        const valueTok = this.peek();
        const captured = classifyEnumValueToken(valueTok);
        if (captured !== undefined) {
          if (currentDecl !== null) {
            currentDecl.value = captured;
          }
          if (captured.kind === "string" && currentName !== null) {
            values[currentName] = captured.text;
          }
          this.advance();
        }
        continue;
      }
      if (depth === 1 && t.kind === "punct" && t.text === ",") {
        currentName = null;
        currentDecl = null;
        expectName = true;
        this.advance();
        continue;
      }
      // Any other in-variant token: skip; the next comma re-arms name capture.
      this.advance();
    }
    if (depth > 0 && names.length > 0) {
      this.diagnostics.push({
        severity: "error",
        code: "theta/parse/enum-body-unclosed",
        file: this.file,
        range: openTok.range,
        message: "enum variant list is not closed by '}'",
      });
    }
    return { names, values, variantDecls };
  }

  /**
   * Recovery for a malformed schema/enum shape (`{ ... }` block or
   * `= …` / `by … = …` tail) that `parseSchema` has already given up on:
   * consume up to the shape's opening `{` (past any `by field =` / `=` head),
   * or to the closing `}` when one is found, so no token of the abandoned
   * shape survives into the statement loop. Called from `parseSchema`'s
   * recovery paths (bug 0033 §Fix): the malformed-`by` head and a shapeless
   * alias right-hand side.
   *
   * The scan stops at a following statement's head as well as at the newline,
   * because the newline is not always there to stop it: a malformed head ends
   * on a trailing continuation trigger (`schema X by =`, `schema X =`) often
   * enough that the lexer has swallowed the boundary, and recovery from a
   * declaration must not consume the declaration AFTER it. Both statement-head
   * sets stop it, for the one reason: `ALIAS_ARM_STOP_KEYWORDS` for the
   * keyword-led forms, `ALIAS_ARM_STOP_PUNCT` for the punct-led ones (a query,
   * a template, a parenthesised expression, an array literal, a unary-not),
   * which `parseType` refuses to capture for the same reason.
   */
  private skipDeclarationShape(): void {
    // Consume up to the shape's opening `{` (past any `by field =` / `=` head).
    while (!this.atEnd()) {
      if (this.isPunct("{")) {
        this.skipBraces();
        return;
      }
      const t = this.peek();
      if (t.kind === "stmt-sep") {
        return; // an `=`-form declaration closes at the newline
      }
      if (t.kind === "keyword" && ALIAS_ARM_STOP_KEYWORDS.has(t.text)) {
        return; // the swallowed newline's statement head stands in for it
      }
      if (t.kind === "punct" && ALIAS_ARM_STOP_PUNCT.has(t.text)) {
        return; // ditto, for a statement whose head is punctuation
      }
      this.advance();
    }
  }

  /** Consume a balanced `{ ... }` group; `skipDeclarationShape`'s sole caller (bug 0033 §Fix). */
  private skipBraces(): void {
    // Precondition: current token is `{`.
    let depth = 0;
    do {
      const t = this.advance();
      if (t.kind === "punct" && t.text === "{") {
        depth += 1;
      } else if (t.kind === "punct" && t.text === "}") {
        depth -= 1;
      } else if (t.kind === "eof") {
        return;
      }
    } while (depth > 0);
  }

  private parseImportExport(kind: "import" | "export"): Stmt {
    const kw = this.advance();
    // Each specifier is `Source` or `Source as Local` (imports.md §"Unknown
    // imported symbol" / §"Re-exports"): the `as` keyword rebinds the imported
    // symbol to a local alias. `symbols` carries the LOCAL name (alias when
    // present) so downstream named-type / reserved-name consumers see the name
    // actually bound; `specifiers` retains the `{ source, local }` mapping the
    // import / re-export checks need (source drives unknown-symbol resolution,
    // local drives name-collision).
    const specifiers: ImportSpecifier[] = [];
    const symbols: string[] = [];
    let hasBraces = false;
    // bug 0211: `ImportDecl` / `ExportDecl` spell the list as `"{" ImportSpec
    // ("," ImportSpec)* ","? "}"` (imports.md §"Re-exports") — a `,` BETWEEN
    // two specifiers, never before the first and never doubled. `sawSpecifier`
    // / `separatorSeen` track the two half-states a conforming list
    // alternates through (specifier, then separator, then specifier, …) so
    // the loop below can tell a missing or stray `,` from a written one;
    // `hasSeparatorDegeneracy` is STICKY for the statement because the
    // registry disposition (bug 0211 §Fix constraint 2; granularity carried
    // in `docs/spec_topics/diagnostics/code-registry-parse.md:127`'s
    // partition sentence) is one diagnostic per statement, not per offending
    // position. Declared outside the brace block: with no
    // braces at all these stay at their initial values, which is correct —
    // that shape is `checkImportMalformedSpecifierList`'s own subject.
    let sawSpecifier = false;
    let separatorSeen = false;
    let hasSeparatorDegeneracy = false;
    let anyDanglingAlias = false;
    if (this.isPunct("{")) {
      hasBraces = true;
      this.advance();
      while (!this.isPunct("}") && !this.atEnd()) {
        const t = this.peek();
        const isSymbolToken =
          (t.kind === "ident" || t.kind === "keyword") && t.text !== "as";
        if (isSymbolToken) {
          // A specifier token with a specifier already pending and no `,`
          // consumed since it is the missing-separator shape: `{ a b }`
          // re-enters here with no separator between `a` and `b`.
          if (sawSpecifier && !separatorSeen) {
            hasSeparatorDegeneracy = true;
          }
          // `ImportSpec ::= Ident ("as" Ident)?` (grammar.md:36): the SOURCE
          // name is the first `Ident` terminal. `isSymbolToken` above admits
          // `keyword` deliberately (a keyword-spelled source is the input
          // lexical.md:20 refuses, not one the grammar rejects), and
          // `isSymbolToken` already excludes the spelling `as` — the token
          // that draws `theta/parse/import-malformed-specifier-list` (bugs
          // 0100/0211) instead, a disjoint subject this emission must not
          // reach.
          if (t.kind === "keyword") {
            this.diagnostics.push(
              reservedKeywordAsIdentifierDiagnostic(t.text, t.range, this.file),
            );
          }
          const source = t.text;
          const sourceRange = t.range;
          this.advance();
          let local = source;
          let endRange = sourceRange;
          let aliasConsumedWithNoAlias = false;
          // `Source as Local`: the `as` keyword rebinds to the trailing alias.
          if (this.isKeyword("as")) {
            this.advance(); // `as`
            const aliasTok = this.peek();
            if (
              (aliasTok.kind === "ident" || aliasTok.kind === "keyword") &&
              aliasTok.text !== "as"
            ) {
              // The second `Ident` terminal of `ImportSpec`'s optional
              // `("as" Ident)?` clause — the ALIAS slot, fully live (row L8):
              // `a` resolves and the local binding becomes the reserved
              // spelling. Same predicate and same builder as the SOURCE slot
              // above; `aliasTok.text !== "as"` above already excludes the
              // `as` spelling from reaching here.
              if (aliasTok.kind === "keyword") {
                this.diagnostics.push(
                  reservedKeywordAsIdentifierDiagnostic(
                    aliasTok.text,
                    aliasTok.range,
                    this.file,
                  ),
                );
              }
              local = aliasTok.text;
              endRange = aliasTok.range;
              this.advance();
            } else {
              aliasConsumedWithNoAlias = true;
            }
          }
          const specifierRange = spanRange(sourceRange, endRange);
          specifiers.push({
            source,
            local,
            range: specifierRange,
          });
          symbols.push(local);
          // A pushed specifier closes the missing-separator window and opens a
          // fresh one for the next token; `anyDanglingAlias` stays sticky for
          // the whole list so the new separator-degeneracy arm below can defer
          // to `checkImportDanglingAlias`'s own subject (bug 0211 §Fix
          // constraint 2, carried in `code-registry-parse.md:127`'s
          // partition sentence).
          sawSpecifier = true;
          separatorSeen = false;
          anyDanglingAlias = anyDanglingAlias || aliasConsumedWithNoAlias;
          // bug 0100: a dangling `as` — consumed with no alias token after it —
          // is a specifier neither `ImportSpec` nor `ExportSpec` admits
          // (imports.md §"Re-exports"). Emitted straight onto
          // `this.diagnostics`, exactly like the reserved-name check below, so
          // `parseThetaDocument` alone witnesses it.
          const danglingAlias = checkImportDanglingAlias(aliasConsumedWithNoAlias, {
            file: this.file,
            range: specifierRange,
          });
          if (danglingAlias !== undefined) {
            this.diagnostics.push(danglingAlias);
          }
          // Reserve the four synthesised-name forms against the LOCAL binding
          // here, at parse time, rather than only where the `.thetalib` load
          // pass checks a specifier (import-static-checks.ts): that pass sees
          // only a specifier whose lib RESOLVED AND PARSED, so a check placed
          // there alone would miss an unresolvable import and leave the
          // refusal partial. Emitting straight onto `this.diagnostics` here —
          // exactly as `validatePathLiteral` does below for the path literal —
          // makes `parseThetaDocument` alone witness it, with no `.thetalib`
          // resolution required, and covers `export { … } from` re-exports
          // too (this function parses both kinds; bug 0040 §Fix Half A).
          const reserved = checkImportReservedSynthesisedName(local, {
            file: this.file,
            range: specifierRange,
          });
          if (reserved !== undefined) {
            this.diagnostics.push(reserved);
          }
        } else if (t.kind === "punct" && t.text === ",") {
          // A `,` with no specifier before it, or with a `,` already pending
          // since the last specifier, is the stray-separator shape: `{ , a }`,
          // `{ a, , b }`. `","?` (imports.md §"Re-exports") admits exactly one
          // trailing comma, so the first `,` after a specifier is never stray.
          if (!sawSpecifier || separatorSeen) {
            hasSeparatorDegeneracy = true;
          }
          this.advance();
          separatorSeen = true;
        } else {
          // The catch-all: a token `ImportSpec` / `ExportSpec` never admits
          // (`42`, `"x"`, `:`, a second `as`) is discarded rather than
          // reported, which is itself the production violation (bug 0211).
          hasSeparatorDegeneracy = true;
          this.advance();
        }
      }
      if (this.isPunct("}")) {
        this.advance();
      }
    }
    const hasFromKeyword = this.isKeyword("from");
    if (hasFromKeyword) {
      this.advance();
    }
    let path = "";
    const pathTok = this.peek();
    let hasPathLiteral = false;
    if (pathTok.kind === "string") {
      hasPathLiteral = true;
      path = pathTok.value ?? pathTok.text;
      // imports.md §"Path resolution": an `import` / `export … from` path
      // literal must end in a byte-exact lowercase `.thetalib` and use forward-slash
      // separators; a `.theta` path (or any non-`.thetalib` variant) is
      // `theta/parse/import-non-thetalib-extension`. Validate the literal as written
      // at parse time so a wrong-extension import un-registers the theta (IMP-2).
      this.diagnostics.push(
        ...validatePathLiteral(
          { value: path, range: pathTok.range },
          "import",
          this.file,
        ),
      );
      this.advance();
    }
    const range = spanRange(kw.range, this.prevRange());
    // imports.md §"Re-exports": the `from` clause is part of both the
    // `ImportDecl` and `ExportDecl` production. A specifier list this parser
    // otherwise accepts with no `from` keyword, or with one carrying no path
    // literal, is refused here — one diagnostic for the STATEMENT, ranged over
    // it like the node below, not one per specifier (bug 0040's per-specifier
    // reserved-name check above answers a different question and keeps firing
    // on the same input; the two co-emit).
    const missingFromClause = checkImportMissingFromClause(hasFromKeyword, hasPathLiteral, {
      file: this.file,
      range,
    });
    if (missingFromClause !== undefined) {
      this.diagnostics.push(missingFromClause);
    }
    // bug 0100: an absent or zero-specifier list is a STATEMENT-level fact
    // distinct from the trailing-clause check above — GATED on a well-formed
    // `from` clause so the no-`from` bare-keyword / empty-list spellings keep
    // emitting only `checkImportMissingFromClause`'s code (its registry
    // Trigger already claims them; co-emitting here would widen that Trigger
    // and move 0058's whole-list witnesses).
    const malformedSpecifierList = checkImportMalformedSpecifierList(
      hasBraces,
      specifiers.length,
      hasFromKeyword,
      hasPathLiteral,
      { file: this.file, range },
    );
    if (malformedSpecifierList !== undefined) {
      this.diagnostics.push(malformedSpecifierList);
    }
    // bug 0211: a separator-degenerate list — a missing `,` between two
    // specifiers, a stray `,`, or a discarded catch-all token — is a THIRD
    // STATEMENT-level fact under the same code, alongside the absent/empty
    // list above. Same gate as that arm (bug 0211 §Fix constraint 3; registry
    // disposition at `code-registry-parse.md:127`'s statement-arm gate), and
    // suppressed on an empty recovered list or a dangling `as` so the three
    // arms of this code partition and at most one statement-ranged
    // diagnostic fires (bug 0211 §Fix constraint 2, carried in
    // `code-registry-parse.md:127`'s partition sentence) —
    // `specifierCount === 0` already excludes this arm from ever co-firing
    // with the one above.
    const separatorDegenerateSpecifierList = checkImportSeparatorDegenerateSpecifierList(
      hasSeparatorDegeneracy,
      specifiers.length,
      anyDanglingAlias,
      hasFromKeyword,
      hasPathLiteral,
      { file: this.file, range },
    );
    if (separatorDegenerateSpecifierList !== undefined) {
      this.diagnostics.push(separatorDegenerateSpecifierList);
    }
    return {
      kind,
      path,
      symbols,
      specifiers,
      range,
    } as ImportDecl | ExportDecl;
  }

  /**
   * Consume a type expression, joining its tokens until a delimiter — outside
   * any inline `ObjectType` brace group, where no separator survives between
   * two tokens (bug 0228). At an
   * arm start — the scan's first token, or the token straight after a
   * depth-0 `|` (`atArmStart`) — a `{` opens an inline `ObjectType` arm:
   * consumed as a balanced group (`consumeInlineObjectType`), whose own
   * interior is a raw slice of the author's source bytes rather than a join,
   * and then CONTINUED past, so `{ a: string } | Cat` captures as one two-arm
   * `Type`.
   * `ObjectType` is a `Type` in any `Type` position (grammar.md §"Type
   * grammar", §"Inline object types"; type-system.md, which states the same
   * grammar applies at every type-annotation position), so the rule is
   * POSITION-GENERAL: a schema field, a `let` annotation, an `fn` parameter
   * or return type, and the `schema X = …` / `schema X by f = …` right-hand
   * side all consume the same `Type ("|" Type)*` extent. A `{` that reaches
   * the scan with `atArmStart` false has a COMPLETED, non-unioned arm
   * already behind it, so it is not a further arm: it falls through to the
   * depth-0 stop set below (`,` `)` `{` `}` `=`) the same way any other
   * post-arm `{` does, which is what still ends an `fn` return-type capture
   * at its `FnBody` block (`fn f(): {a: integer} { 1 }`) rather than
   * swallowing the body as one more arm.
   *
   * When `stopAtFieldBoundary` is set (schema-object-body field types), the scan also
   * stops at a depth-0 field boundary: a value-ish token (ident/keyword/string/
   * number) that directly follows a completed type atom with no intervening `|`
   * union operator marks the start of the next `Field`, so the current field's
   * type does not greedily swallow it. This is what lets a comma-missing schema
   * body still recover both fields (see `parseSchemaObjectBody`). When
   * `stopAtWithClause` is set (the `fn` return-type slot only, so `let`
   * annotations and schema-field types are untouched), the scan also stops at a
   * depth-0 `with` ident — the contextual keyword opening a `WithClause`
   * (grammar.md §"Contextual keywords", §"`fn` declarations"; bug 0005 (a)).
   *
   * When `aliasArmBoundary` is set (the `schema X = …` / `schema X by f = …`
   * right-hand side only), the scan additionally recognises three ARM-TOKEN
   * BOUNDARIES of `AliasRhs ::= Type ("|" Type)*` that no other caller needs,
   * because only this caller's `Type` slot is delimiter-less at the end: a
   * declaration's trailing `=` / `>` continuation can swallow the newline
   * that ends its logical line, where every other caller's slot is bounded by
   * its own delimiter (`)`, `,`, `}`, `=`, or the return slot's `with` /
   * body-block stop) instead. Before the first arm and straight after a
   * depth-0 `|`, an `ALIAS_ARM_STOP_KEYWORDS` head ENDS the capture. At the
   * same arm-start boundaries AND straight after a COMPLETED arm, an
   * `ALIAS_ARM_STOP_PUNCT` head ends the capture too: every member of that
   * set is a punct-led statement head that no `Type` can start or continue
   * with, so meeting one proves the same swallowed boundary newline the
   * keyword stop proves. `-` ends the capture at the COMPLETED-arm boundary
   * alone; at an arm start it is captured — no `Type` begins with `-`, so
   * the arm is ill-formed either way, and the captured `"-"` is what
   * `finishAliasSchema` checks a malformed-right-hand-side disposition
   * against once this scan returns (bug 0042 §Fix), from the declaration's
   * own extent rather than from this capture.
   */
  private parseType(
    stopAtFieldBoundary = false,
    stopAtWithClause = false,
    aliasArmBoundary = false,
  ): string {
    const parts: string[] = [];
    let depth = 0;
    // Whether the tokens consumed so far END a Type atom, so a following
    // `ALIAS_ARM_STOP_PUNCT` head begins the next STATEMENT rather than
    // continuing this arm. Only consulted in `aliasArmBoundary` mode.
    let armComplete = false;
    while (!this.atEnd()) {
      const t = this.peek();
      if (t.kind === "stmt-sep") {
        break;
      }
      const atArmStart = parts.length === 0 || parts[parts.length - 1] === "|";
      if (
        aliasArmBoundary &&
        depth === 0 &&
        (atArmStart || armComplete) &&
        t.kind === "punct" &&
        ALIAS_ARM_STOP_PUNCT.has(t.text)
      ) {
        break;
      }
      // `-` stops after a COMPLETED arm only, never at an arm start: at a start
      // no legal `Type` begins with `-` (grammar.md `LiteralType` has no
      // unary-minus alternative); it is captured there so the ill-formed `= -1`
      // family keeps the junk arm `"-"` rather than emptying the right-hand
      // side — whether that arm is REPORTED is `finishAliasSchema`'s question,
      // answered from the declaration's own extent (bug 0042 §Fix). After a
      // finished arm no `Type`
      // continues with it and it heads the unary-negation expression statement
      // on the line whose boundary newline the trailing `=` / `>` continuation
      // swallowed.
      if (
        aliasArmBoundary &&
        depth === 0 &&
        armComplete &&
        !atArmStart &&
        t.kind === "punct" &&
        t.text === "-"
      ) {
        break;
      }
      if (depth === 0 && atArmStart) {
        if (aliasArmBoundary && t.kind === "keyword" && ALIAS_ARM_STOP_KEYWORDS.has(t.text)) {
          break;
        }
        if (t.kind === "punct" && t.text === "{") {
          // No `stopAtAngleClose` at this arm-start site: nothing here encloses
          // the arm in a `<…>` capture, so a `>` inside the brace group (e.g.
          // `{a: integer>}`) is ordinary content the group must keep consuming
          // (bug 0130 cell e7, the regression this omission guards).
          this.consumeInlineObjectType(parts);
          armComplete = true;
          continue;
        }
      }
      // A `{` reached at depth > 0 (e.g. `array<{a: integer}>`) still opens an
      // inline `ObjectType` arm; route it through the same balanced-group
      // consumer so its interior is a raw slice rather than the outer join.
      // `stopAtAngleClose` bounds the group at the enclosing `<…>`'s own `>`,
      // since depth > 0 here only happens inside one.
      if (depth > 0 && t.kind === "punct" && t.text === "{") {
        this.consumeInlineObjectType(parts, true);
        continue;
      }
      if (
        depth === 0 &&
        t.kind === "punct" &&
        (t.text === "," ||
          t.text === ")" ||
          t.text === "{" ||
          t.text === "}" ||
          t.text === "=")
      ) {
        break;
      }
      if (
        stopAtWithClause &&
        depth === 0 &&
        t.kind === "ident" &&
        t.text === "with"
      ) {
        // A `fn` return-type slot never consumes a depth-0 `with`: it is the
        // contextual keyword opening the `WithClause` between the annotation
        // and the body block (bug 0005 (a); grammar.md §"`fn` declarations").
        // At depth > 0 (e.g. `array<with>`) an ident spelled `with` is ordinary
        // type material and still joins.
        break;
      }
      if (stopAtFieldBoundary && depth === 0 && parts.length > 0) {
        const isValueTok =
          t.kind === "ident" ||
          t.kind === "keyword" ||
          t.kind === "string" ||
          t.kind === "number";
        const prevText = parts[parts.length - 1];
        if (isValueTok && prevText !== "|") {
          break;
        }
      }
      if (t.kind === "punct" && (t.text === "<" || t.text === "(" || t.text === "[")) {
        // Track `[` depth too so an inline `enum["a", "b"]` form is captured
        // whole (its interior comma must not terminate the type source),
        // reaching `checkInlineEnumForm` for `theta/parse/inline-enum` rather
        // than truncating the field to `enum["a"` and discarding the field list.
        depth += 1;
      } else if (t.kind === "punct" && (t.text === ">" || t.text === ")" || t.text === "]")) {
        depth -= 1;
      }
      parts.push(t.text);
      this.advance();
      // The token consumed above completes an arm when it leaves the scan at
      // depth 0 — a closed `<…>` / `[…]` group, or an atom. The bare `enum`
      // keyword is the one exception: it completes nothing on its own, so its
      // `[` is mid-arm rather than at a boundary and joins, which is what keeps
      // the rejected inline `enum["a", "b"]` form captured whole for
      // `checkInlineEnumForm`.
      armComplete = depth === 0 && !(t.kind === "keyword" && t.text === "enum");
    }
    return parts.join("");
  }

  /**
   * Consume a balanced `{ … }` group token-by-token — stopping early at a
   * `stmt-sep` so an unclosed brace cannot run the scan past its statement —
   * and push exactly ONE part: the raw `this.bodyText` slice from the `{`
   * token's start to the last consumed token's end (`positionToOffset`), the
   * same raw-slice treatment the query template already gets for its own
   * lossy, space-joined capture (`parseQuery`'s `rawTemplate`, below). Falls back to the joined
   * token texts when `this.bodyText` is empty (no body source threaded
   * through), so an interior's field-name spelling reaches every rule and
   * lowerer as the author wrote it rather than with its inter-token
   * whitespace deleted (bug 0228).
   *
   * `stopAtAngleClose` is set only at the three angle-context call sites
   * (`parseType` at depth > 0, `parseQuery`'s `@<T>` loop, `parseInvoke`'s
   * `invoke<T>` loop): the scan then tracks its OWN `<`/`>` nesting and stops,
   * without consuming, at a `>` met at its own angle-depth 0 while the brace
   * group is still unclosed — that `>` closes the ENCLOSING capture, not this
   * group (`@<Ghost{>` must not swallow the template past its `>`). An
   * interior `<…>` pair (`{a: array<x>}`) sits at angle-depth 1 and does not
   * trip the bound, so the group still closes normally on its own `}`. Left
   * unset at the arm-start call inside `parseType` (`depth === 0` above),
   * where no enclosing `<…>` bounds the arm, so a `>` inside the group is
   * ordinary content (bug 0130 cell e7).
   * Precondition: the current token is `{`.
   */
  private consumeInlineObjectType(parts: string[], stopAtAngleClose = false): void {
    const startTok = this.peek();
    let braceDepth = 0;
    let angleDepth = 0;
    let lastTok: Token | null = null;
    const consumedTexts: string[] = [];
    while (!this.atEnd()) {
      const t = this.peek();
      if (t.kind === "stmt-sep") {
        break;
      }
      if (
        stopAtAngleClose &&
        t.kind === "punct" &&
        t.text === ">" &&
        angleDepth === 0 &&
        braceDepth > 0
      ) {
        break;
      }
      if (t.kind === "punct" && t.text === "{") {
        braceDepth += 1;
      } else if (t.kind === "punct" && t.text === "}") {
        braceDepth -= 1;
      } else if (stopAtAngleClose && t.kind === "punct" && t.text === "<") {
        angleDepth += 1;
      } else if (stopAtAngleClose && t.kind === "punct" && t.text === ">") {
        angleDepth -= 1;
      }
      lastTok = t;
      consumedTexts.push(t.text);
      this.advance();
      if (braceDepth === 0) {
        break;
      }
    }
    if (lastTok === null) {
      return;
    }
    const raw =
      this.bodyText.length > 0
        ? this.bodyText.slice(
            positionToOffset(this.bodyText, startTok.range.start),
            positionToOffset(this.bodyText, lastTok.range.end),
          )
        : null;
    parts.push(raw !== null ? raw : consumedTexts.join(""));
  }

  // --- expression sublanguage --------------------------------------------

  private parseExpression(): Expr | null {
    return this.parseTernary();
  }

  /**
   * Parse an `Expr` at one of grammar.md:114's two expression-position block
   * sites (a `let` / `let mut` initialiser, a `match`-arm body) — the ONLY
   * positions a bare `{` reads as a `BlockExpr` rather than an object literal
   * (bug 0082 §Fix). Every other expression position calls `parseExpression`
   * directly and is unaffected: a `{` reached through `parsePrimary` from any
   * other call graph still parses as today's `ObjectExpr`
   * (`theta/parse/bare-object-literal` unchanged, DIAG-4).
   */
  private parseExpressionAtBlockSite(): Expr | null {
    if (this.isPunct("{") && this.looksLikeBlockAtBlockSite()) {
      return this.parseBlockExprNode();
    }
    return this.parseExpression();
  }

  /**
   * The disambiguation predicate bug 0082 §Fix settles for the two
   * expression-position block sites: the braces read as an OBJECT LITERAL iff
   * the token immediately after `{` is `}` (the empty-object reading) or an
   * ident/string token immediately followed by `:` (a field-list reading);
   * otherwise they read as a BLOCK. Mirrors `parseObjectLiteral`'s own field-name
   * token test (ident or string) so the two readings agree on what a field name
   * looks like.
   */
  private looksLikeBlockAtBlockSite(): boolean {
    const after = this.peek(1);
    if (after.kind === "punct" && after.text === "}") {
      return false;
    }
    if ((after.kind === "ident" || after.kind === "string") && this.isPunct(":", 2)) {
      return false;
    }
    return true;
  }

  /**
   * Parse a `BlockExpr` — the current token is its opening `{`. Reuses
   * `parseBlock`'s `Stmt* Expr?` reader (the same `{ ... }` statement-list
   * parse `FnBody` / `StmtBlock` drive), then enforces grammar.md:118's
   * TAIL-REQUIRED rule this position adds on top of it: a block whose parsed
   * `Block.tail` is `null` draws `theta/parse/block-expr-missing-tail`, never
   * the implicit `null` `FnBody` / `StmtBlock` admit (bug 0082 §Fix, third
   * constraint).
   */
  private parseBlockExprNode(): Expr {
    const startTok = this.peek(); // `{`, not yet consumed
    const body = promoteTrailingExprToTail(this.parseBlock());
    const range = spanRange(startTok.range, this.prevRange());
    if (body.tail === null) {
      this.diagnostics.push(blockExprMissingTailDiagnostic(range, this.file));
    }
    return { kind: "block", body, range };
  }

  /**
   * Parse the token stream as a single expression — the same `parseExpression`
   * entry the `let` RHS drives, exposed so a `@`...`` template's `${…}`
   * interpolation body honours the full expression sublanguage
   * (expressions.md §"Supported forms").
   */
  public parseSingleExpression(): Expr | null {
    return this.parseExpression();
  }

  /**
   * Parse one expression, then drain any residue through the SAME `parseForms`
   * statement loop the whole-file body drives (`this.diagnostics` is the sink
   * either way), rather than a bespoke "first unconsumed token" scan. Parity
   * with the `let`-RHS position is by CONSTRUCTION under that choice: a
   * residue that itself heads a legal statement (`c - -`, `typeof 1`) stays
   * silent exactly as it does at `let`-RHS level, while a residue headed by a
   * stray punct draws the identical `stray '<t>' in statement position` row
   * the statement loop already emits above. A bespoke scan has no such parity
   * guarantee and would red bug 0084's `${c - -}` control by inventing a
   * diagnostic the `let`-RHS position never draws.
   */
  public parseSingleExpressionWithResidue(): Expr | null {
    const expr = this.parseExpression();
    if (!this.atEnd()) {
      this.parseForms(() => this.atEnd());
    }
    return expr;
  }

  /**
   * Whether the `?` at the cursor is a ternary head rather than the postfix
   * error-propagation `?`. A ternary head's `?` is immediately followed by an
   * expression-starting token and, at the same bracket depth, a `:` that
   * pairs with it before the statement terminates; a postfix `?` is followed
   * by a statement boundary, a closing bracket, or a statement keyword.
   * Distinguishing by the pairing `:` keeps `foo()?` (postfix, `try`)
   * separate from `c ? a : b` (ternary), even across the lexer's swallowed
   * continuation newline after a trailing `?`.
   *
   * The lexer cannot make this call: a ternary head at line end and a postfix
   * `?` at line end are lexically identical up to the newline, so `?` must stay
   * a trailing continuation trigger and the boundary is restored here. The scan
   * therefore stops — answering postfix — at a depth-0 statement-only keyword
   * (`STATEMENT_ONLY_KEYWORDS`): with the separator swallowed, the scan would
   * otherwise read into the NEXT declaration, whose depth-0 `:` (a `subagent fn
   * f(...): T` return annotation, the param parens having closed) masquerades
   * as the ternary's `:` — `subagent` then parses as the consequent and the
   * modifier is dropped (bug 0005 (b)).
   *
   * The keyword stop protects only keyword-headed next statements; a
   * keyword-free next statement (a reassignment or an expression statement)
   * offers no stop token, so the scan additionally PAIRS depth-0 `?`s: a
   * depth-0 `?` whose next token can start an expression opens a nested
   * ternary head, and each depth-0 `:` pairs with the innermost open nested
   * head first — only a `:` with no nested head open belongs to the `?` under
   * test. Without pairing, the next statement's own ternary `:` (`x = c ? a :
   * b`, or a bare `c ? 1 : 2` tail) classified the preceding postfix `?` as a
   * ternary head and swallowed the whole statement (bug 0015). Pairing keeps
   * the nested-consequent reading of `c ? d ? 1 : 2 : 3` (the first `:` pairs
   * with `d`'s head, the second with `c`'s). Accepted residual (bug 0015
   * §Options 1): an inner postfix `?` directly followed by an expression-lead
   * token inside a real ternary arm (e.g. `c ?` ␤ `f()? - 1 : b`) is
   * miscounted as a nested head and the real ternary misread as postfix — the
   * irreducible head/postfix ambiguity class bug 0005 (b) named, narrowed to
   * that corner.
   */
  private isTernaryHead(): boolean {
    if (!canStartExpression(this.peek(1))) {
      return false;
    }
    let depth = 0;
    let openNestedHeads = 0;
    for (let i = 1; ; i += 1) {
      const t = this.peek(i);
      if (t.kind === "eof" || t.kind === "stmt-sep") {
        return false;
      }
      if (
        t.kind === "keyword" &&
        depth === 0 &&
        STATEMENT_ONLY_KEYWORDS.has(t.text)
      ) {
        // Statement material can never be ternary-consequent material at
        // depth 0 (see STATEMENT_ONLY_KEYWORDS): the swallowed boundary has
        // been crossed, so the `?` is the postfix terminator (bug 0005 (b);
        // grammar.md §"Statement termination & newline continuation").
        return false;
      }
      if (t.kind === "punct") {
        const x = t.text;
        if (x === "(" || x === "[" || x === "{") {
          depth += 1;
        } else if (x === ")" || x === "]" || x === "}") {
          if (depth === 0) {
            return false;
          }
          depth -= 1;
        } else if (x === "?" && depth === 0) {
          // A depth-0 `?` reading as a ternary head itself (its next token
          // starts an expression) opens a nested head whose own `:` must not
          // pair with the `?` under test (bug 0015). A `?` behind brackets is
          // already invisible via the depth guard, same as the `:` arm.
          if (canStartExpression(this.peek(i + 1))) {
            openNestedHeads += 1;
          }
        } else if (x === ":" && depth === 0) {
          if (openNestedHeads === 0) {
            return true;
          }
          // Pairs with the innermost open nested head, not the `?` under
          // test — keep scanning for a `:` of our own.
          openNestedHeads -= 1;
        }
      }
    }
  }

  private parseTernary(): Expr | null {
    const condition = this.parseBinary(0);
    if (condition === null) {
      return null;
    }
    if (this.isPunct("?")) {
      // Distinguish the ternary head from the postfix error-propagation `?`,
      // which the binary/postfix layer has already consumed onto its operand.
      const q = this.advance();
      const consequent = this.parseTernary() ?? nullExpr(q.range);
      if (this.isPunct(":")) {
        this.advance();
      } else {
        // isTernaryHead's token-level scan committed to a head on a pairing
        // depth-0 `:` ahead, but the actual consequent PARSE stopped short
        // of it — this branch fires whenever the scan's pairing prediction
        // and the consequent parse diverge. Ordinarily that is malformed
        // consequent material (e.g. juxtaposed expressions `c ? 1 2 : b`:
        // the scan walks token-wise over `2` to the pairing `:`, the parse
        // stops at `1`); and should a statement-boundary leak of the
        // bug-0015 family reappear, it fires there too — silently
        // fabricating the `null` alternate is what made the swallowed
        // expression-statement cells parse clean while meaning a different
        // program (bug 0015), so emit loudly instead. Reuses the closed
        // registry's unsupported-feature code (DIAG-2: the registry is
        // closed; a new code is a spec change).
        this.diagnostics.push({
          severity: "error",
          code: "theta/parse/unsupported-feature",
          file: this.file,
          range: q.range,
          message:
            "unsupported syntactic feature: ternary '?' without ':' after its consequent",
        });
      }
      const alternate = this.parseTernary() ?? nullExpr(q.range);
      return {
        kind: "ternary",
        condition,
        consequent,
        alternate,
        range: spanRange(condition.range, alternate.range),
      };
    }
    return condition;
  }

  private parseBinary(tier: number): Expr | null {
    if (tier >= this.tiers.length) {
      return this.parseUnary();
    }
    let left = this.parseBinary(tier + 1);
    if (left === null) {
      return null;
    }
    const ops = this.tiers[tier] ?? [];
    // Comparison and equality operators are non-associative and do not chain:
    // `a < b < c` (and `a == b == c`) is `theta/parse/comparison-chaining`
    // (expressions.md §"Operator precedence"). Every other tier is
    // left-associative.
    const nonAssociative = this.nonAssociativeTiers.has(tier);
    let matched = false;
    for (;;) {
      const t = this.peek();
      if (t.kind !== "punct" || !ops.includes(t.text)) {
        break;
      }
      if (nonAssociative && matched) {
        this.diagnostics.push({
          severity: "error",
          code: "theta/parse/comparison-chaining",
          file: this.file,
          range: t.range,
          message: "comparison operators do not chain; use &&",
        });
        break;
      }
      this.advance();
      const right = this.parseBinary(tier + 1);
      if (right === null) {
        break;
      }
      matched = true;
      left = {
        kind: "binary",
        op: t.text,
        left,
        right,
        range: spanRange(left.range, right.range),
      };
    }
    return left;
  }

  /**
   * The increment/decrement operator at the cursor, or `undefined` for
   * anything else. Narrows the token's plain `string` text to the
   * `IncrementDecrementOp.op` literal union so neither call site casts past
   * the check.
   */
  private incrementDecrementOp(): "++" | "--" | undefined {
    const t = this.peek();
    if (t.kind !== "punct") {
      return undefined;
    }
    if (t.text === "++") {
      return "++";
    }
    if (t.text === "--") {
      return "--";
    }
    return undefined;
  }

  private parseUnary(): Expr | null {
    const incDecOp = this.incrementDecrementOp();
    if (incDecOp !== undefined) {
      const op = this.advance();
      // `++` / `--` are rejected, not lowered (bindings.md §"Increment /
      // decrement"): the operator carries no AST node of its own, so the
      // operand alone survives once the diagnostic is filed.
      const diag = checkIncrementDecrement(
        { op: incDecOp },
        { file: this.file, range: op.range },
      );
      if (diag !== undefined) {
        this.diagnostics.push(diag);
      }
      const operand = this.parsePostfix();
      if (operand === null) {
        return null;
      }
      return operand;
    }
    if (this.isPunct("-") || this.isPunct("!")) {
      const op = this.advance();
      const operand = this.parsePostfix();
      if (operand === null) {
        return null;
      }
      // Model unary as a binary with a synthetic `null` left so the AST union
      // stays closed; theta 1.0 tests exercise no unary form directly.
      return {
        kind: "binary",
        op: op.text,
        left: nullExpr(op.range),
        right: operand,
        range: spanRange(op.range, operand.range),
        unary: true,
      };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Expr | null {
    let expr = this.parsePrimary();
    if (expr === null) {
      return null;
    }
    for (;;) {
      if (this.isPunct("?")) {
        // Postfix error-propagation `?` vs ternary head `cond ? a : b`. A `?`
        // followed by an expression and a depth-0 `:` that PAIRS with it
        // (innermost-first pairing of depth-0 `?`s — see isTernaryHead) is a
        // ternary head: leave it unconsumed so `parseTernary` builds the
        // ternary. Otherwise it is the postfix error-propagation terminator
        // (grammar.md §"Newline continuation" — "the `?` trigger is the
        // ternary head only").
        if (this.isTernaryHead()) {
          break;
        }
        const q = this.advance();
        expr = {
          kind: "try",
          operand: expr,
          range: spanRange(expr.range, q.range),
        };
        continue;
      }
      if (this.isPunct(".")) {
        // Member access `target.field` (expressions.md §"Member access").
        this.advance();
        const nameTok = this.advance();
        expr = {
          kind: "member",
          target: expr,
          field: nameTok.text,
          range: spanRange(expr.range, nameTok.range),
        };
        continue;
      }
      if (this.isPunct("[")) {
        // Index access `target[index]` (expressions.md §"Index access"). The
        // index sub-expression parses inside the brackets, so a nested object
        // literal there is not brace-suppressed.
        //
        // The `[` must open on the same line as the receiver's end: a leading
        // `[` is no continuation trigger (grammar.md §"Statement termination &
        // newline continuation"), so a `[` that begins a line begins a new
        // statement. Inside a block the lexer's open-bracket continuation has
        // already swallowed the newline (no `stmt-sep` survives at bracket
        // depth > 0), so the boundary is restored here — leave the `[` for the
        // caller's statement loop rather than gluing a next-line array literal
        // onto this expression as index access (bug 0006). Token ranges keep
        // line/column through continuation collapsing, so the comparison sees
        // the source lines.
        if (this.peek().range.start.line !== expr.range.end.line) {
          break;
        }
        this.advance();
        const indexExpr: Expr = this.parseBracketedExpression() ?? nullExpr(expr.range);
        if (this.isPunct("]")) {
          this.advance();
        }
        expr = {
          kind: "index",
          target: expr,
          index: indexExpr,
          range: spanRange(expr.range, this.prevRange()),
        };
        continue;
      }
      if (this.isPunct("(") && expr.kind === "member") {
        // Method call `target.method(args)` (expressions.md §"Built-in methods
        // and properties"): fold the just-produced `member` and its argument
        // list into a dedicated `method-call` node so the runtime dispatches
        // the stdlib member instead of reading the bare field value.
        const args = this.parseArgs();
        expr = {
          kind: "method-call",
          target: expr.target,
          method: expr.field,
          args,
          range: spanRange(expr.range, this.prevRange()),
        };
        continue;
      }
      const incDecOp = this.incrementDecrementOp();
      if (incDecOp !== undefined) {
        // Postfix `++` / `--`: rejected in place like the prefix arm, and
        // consumed here rather than left for the statement loop — that is
        // what keeps it out of the stray-punctuation recovery below.
        const op = this.advance();
        const diag = checkIncrementDecrement(
          { op: incDecOp },
          { file: this.file, range: op.range },
        );
        if (diag !== undefined) {
          this.diagnostics.push(diag);
        }
        continue;
      }
      break;
    }
    return expr;
  }

  /**
   * Parse an expression inside a bracketed group (`(...)`, `[...]`, call args,
   * object-field value, match arm) with object-literal brace-suppression
   * cleared, so a nested object literal parses even inside a control-flow
   * header expression.
   */
  private parseBracketedExpression(): Expr | null {
    const save = this.suppressBrace;
    this.suppressBrace = false;
    try {
      const inner = this.parseExpression();
      this.consumeTrailingAssignment();
      return inner;
    } finally {
      this.suppressBrace = save;
    }
  }

  private parsePrimary(): Expr | null {
    const t = this.peek();
    // `par for` — `par` is a contextual keyword recognised only immediately
    // before `for` (grammar.md §"Contextual keywords"); everywhere else `par`
    // is a normal identifier and falls through to the ident path below.
    if (t.kind === "ident" && t.text === "par" && this.isKeyword("for", 1)) {
      return this.parseParFor();
    }
    if (t.kind === "number") {
      this.advance();
      return {
        kind: "number",
        text: t.text,
        numericType: t.numericType ?? "integer",
        range: t.range,
      };
    }
    if (t.kind === "string") {
      this.advance();
      return { kind: "string", value: t.value ?? t.text, range: t.range };
    }
    if (t.kind === "keyword") {
      if (t.text === "true" || t.text === "false") {
        this.advance();
        return { kind: "bool", value: t.text === "true", range: t.range };
      }
      if (t.text === "null") {
        this.advance();
        return { kind: "null", range: t.range };
      }
      if (t.text === "invoke") {
        return this.parseInvoke();
      }
      if (t.text === "match") {
        return this.parseMatch();
      }
      // `Ok(arg)` / `Err(arg)` Result constructors in value position
      // (errors-and-results/error-model.md). Only when followed by `(` — a
      // bare `Ok` / `Err` is not a first-class value, so it falls through to
      // the keyword-in-value-position `null` path, mirroring the other
      // reserved keywords that reach here.
      if ((t.text === "Ok" || t.text === "Err") && this.isPunct("(", 1)) {
        this.advance(); // `Ok` / `Err`
        const args = this.parseArgs();
        const arg = args[0] ?? nullExpr(t.range);
        return {
          kind: "result-ctor",
          ctor: t.text,
          arg,
          range: spanRange(t.range, this.prevRange()),
        };
      }
    }
    if (t.kind === "ident") {
      this.advance();
      if (this.isPunct("(")) {
        const args = this.parseArgs();
        return {
          kind: "call",
          callee: t.text,
          args,
          range: spanRange(t.range, this.prevRange()),
        };
      }
      // Named object literal / schema constructor `Ident { field: expr, … }`
      // (grammar.md `NamedObjectLit`), unless brace-suppression is active (a
      // control-flow header, where the `{` opens the block).
      if (this.isPunct("{") && !this.suppressBrace) {
        return this.parseObjectLiteral(t.text, t.range);
      }
      return { kind: "ident", name: t.text, range: t.range };
    }
    if (t.kind === "punct") {
      if (t.text === "(") {
        this.advance();
        const inner = this.parseBracketedExpression();
        if (this.isPunct(")")) {
          this.advance();
        }
        return inner;
      }
      if (t.text === "[") {
        return this.parseArray();
      }
      if (t.text === "@") {
        return this.parseQuery();
      }
      if (t.text === "`") {
        // A backtick template with no leading `@` — a QUERY template in value
        // position. expressions.md §"Not supported" admits query templates only
        // `@`-prefixed, at statement / `let`-RHS level; a bare backtick used as a
        // value (a match-arm body, a value-position `let` RHS) is rejected.
        return this.parseBareTemplate();
      }
      // Bare object literal `{ field: expr, … }` (grammar.md `BareObjectLit`),
      // unless brace-suppression is active (a control-flow header block opener).
      if (t.text === "{" && !this.suppressBrace) {
        return this.parseObjectLiteral(null, t.range);
      }
    }
    return null;
  }

  /**
   * Parse an object-literal / schema-constructor body `{ field: expr, … }` — the
   * opening `{` is the current token. `typeName` is the constructor name for a
   * `NamedObjectLit`, or `null` for a `BareObjectLit`. Field values parse inside
   * the braces, so a nested object literal is not brace-suppressed. A malformed
   * field is skipped defensively (matching the array / arg recovery), never
   * silently swallowing the whole literal.
   */
  private parseObjectLiteral(typeName: string | null, startRange: SourceRange): Expr {
    this.advance(); // `{`
    const save = this.suppressBrace;
    this.suppressBrace = false;
    const fields: ObjectFieldNode[] = [];
    while (!this.isPunct("}") && !this.atEnd()) {
      const nameTok = this.peek();
      if (nameTok.kind !== "ident" && nameTok.kind !== "string" && nameTok.kind !== "keyword") {
        // Not a field name: drop the token to guarantee progress.
        this.advance();
        continue;
      }
      this.advance();
      if (nameTok.kind === "keyword") {
        // lexical.md:20 reserves all 32 spellings from identifier position, and
        // `FieldEntry ::= Ident ":" Literal` (grammar.md:599) admits an `Ident`,
        // which a reserved spelling is not. Admitting the token as the field
        // NAME (rather than dropping it, as the arm above still does for a
        // punct/number/etc. head) is what keeps it on `fields` for
        // `checkObjectExpr`'s `present` list, so the field-set checks see the
        // key instead of re-reading its value as the next field's name.
        this.diagnostics.push(
          reservedKeywordAsIdentifierDiagnostic(nameTok.text, nameTok.range, this.file),
        );
      }
      if (this.isPunct(":")) {
        this.advance();
      }
      const value = this.parseExpression() ?? nullExpr(nameTok.range);
      fields.push({ name: nameTok.text, value });
      if (this.isPunct(",")) {
        this.advance();
      }
    }
    if (this.isPunct("}")) {
      this.advance();
    }
    this.suppressBrace = save;
    return {
      kind: "object",
      typeName,
      fields,
      range: spanRange(startRange, this.prevRange()),
    };
  }

  /**
   * Parse a `match <scrutinee> { Pattern "=>" ArmBody, … }` expression
   * (expressions.md §`match` expression). The scrutinee parses with
   * brace-suppression active so the arms `{` is not read as an object literal.
   */
  private parseMatch(): Expr {
    const kw = this.advance(); // `match`
    const scrutinee = this.parseHeaderExpression() ?? nullExpr(kw.range);
    const arms: MatchArmNode[] = [];
    if (this.isPunct("{")) {
      this.advance();
      const save = this.suppressBrace;
      this.suppressBrace = false;
      while (!this.isPunct("}") && !this.atEnd()) {
        while (this.peek().kind === "stmt-sep") {
          this.advance();
        }
        if (this.isPunct("}") || this.atEnd()) {
          break;
        }
        const before = this.pos;
        const pattern = this.parsePattern();
        // A guarded arm `Pattern if cond => …` is not supported in theta 1.0
        // (expressions.md §"Pattern grammar"). Consume and discard the guard
        // condition so the `=>` arrow still parses.
        if (this.isKeyword("if")) {
          const ifTok = this.advance();
          this.diagnostics.push({
            severity: "error",
            code: "theta/parse/match-guard-not-supported",
            file: this.file,
            range: ifTok.range,
            message: "match guards are not supported in theta 1.0",
          });
          this.parseExpression(); // consume + discard the guard condition
        }
        // Consume the `=>` arm arrow (lexed as two punct tokens `=` `>`).
        if (this.isPunct("=") && this.isPunct(">", 1)) {
          this.advance();
          this.advance();
        }
        // The arm body is an expression, not a bare statement (grammar.md
        // §"match arm body"). Every name the pattern binds is an
        // always-immutable context (bindings.md §"Immutable contexts"); scope
        // the record to the arm body's parse only (bug 0370 §Fix layer 1) so a
        // reassignment to a binder draws `immutable-rebinding` without leaking
        // onto an unrelated same-named binding once the arm's own scope ends.
        const boundNames = new Set<string>();
        collectPatternBindings(pattern, boundNames);
        const body = this.withImmutableBindings([...boundNames], () => {
          const consumedStmt = this.tryConsumeArmBodyStatement();
          return consumedStmt
            ? nullExpr(kw.range)
            : (this.parseExpressionAtBlockSite() ?? nullExpr(kw.range));
        });
        arms.push({ pattern, body });
        if (this.isPunct(",")) {
          this.advance();
        }
        if (this.pos === before) {
          // No progress (a malformed arm): drop a token to guarantee termination.
          this.advance();
        }
      }
      this.suppressBrace = save;
      if (this.isPunct("}")) {
        this.advance();
      }
    }
    return {
      kind: "match",
      scrutinee,
      arms,
      range: spanRange(kw.range, this.prevRange()),
    };
  }

  /**
   * Parse one `match` pattern (expressions.md §"Pattern grammar (theta 1.0)"):
   * wildcard `_`, `Ok(p)` / `Err(p)` constructors, a named/bare object pattern
   * `Ident { field: p, … }`, an array pattern `[p, …]`, a literal
   * (`"s"` / `42` / `true` / `null`), or an identifier binding.
   */
  /**
   * If the cursor begins a bare statement in `match`-arm-body position
   * (a leading `if` / `for` / `while` / `let` / `break` / `continue` /
   * `return` keyword, or a bare assignment), emit
   * `theta/parse/statement-in-arm-body`, consume the statement, and return
   * true; otherwise return false. Arm bodies are expressions; statements are
   * wrapped in a block expression `{ ... }` (grammar.md §"match arm body").
   */
  private tryConsumeArmBodyStatement(): boolean {
    const t = this.peek();
    const stmtKeyword =
      t.kind === "keyword" &&
      (t.text === "if" ||
        t.text === "for" ||
        t.text === "while" ||
        t.text === "let" ||
        t.text === "break" ||
        t.text === "continue" ||
        t.text === "return");
    const next = this.peek(1);
    const assignHead =
      t.kind === "ident" &&
      ((this.isPunct("=", 1) && !this.isPunct("=", 2)) ||
        (next.kind === "punct" &&
          COMPOUND_OPS.has(next.text) &&
          this.isPunct("=", 2)));
    if (!stmtKeyword && !assignHead) {
      return false;
    }
    this.diagnostics.push({
      severity: "error",
      code: "theta/parse/statement-in-arm-body",
      file: this.file,
      range: t.range,
      message:
        "match arm body must be an expression; wrap statements in a block expression { ... }",
    });
    if (stmtKeyword) {
      switch (t.text) {
        case "if":
          this.parseIf();
          break;
        case "while":
          this.parseWhile();
          break;
        case "for":
          this.parseFor();
          break;
        case "let":
          this.parseLet();
          break;
        case "return":
          this.parseReturn();
          break;
        default:
          this.simpleKeyword(t.text === "break" ? "break" : "continue");
          break;
      }
    } else {
      this.tryParseReassign();
    }
    return true;
  }

  /**
   * If the cursor begins a rest pattern (`...rest`, lexed as three `.` puncts
   * optionally followed by a binding name), emit
   * `theta/parse/rest-pattern-not-supported`, consume it, and return true; rest
   * patterns are not in theta 1.0 (expressions.md §"Pattern grammar").
   */
  private tryConsumeRestPattern(): boolean {
    if (
      !(this.isPunct(".") && this.isPunct(".", 1) && this.isPunct(".", 2))
    ) {
      return false;
    }
    const dotTok = this.peek();
    this.advance();
    this.advance();
    this.advance();
    if (this.peek().kind === "ident") {
      this.advance();
    }
    this.diagnostics.push({
      severity: "error",
      code: "theta/parse/rest-pattern-not-supported",
      file: this.file,
      range: dotTok.range,
      message: "rest patterns are not supported in theta 1.0",
    });
    return true;
  }

  /**
   * Assignment is statement-only; used in expression position it is
   * `theta/parse/assignment-as-expression` (bindings.md §"Reassignment is a
   * statement"). If a simple `=` (not `==`) or compound-assign operator trails
   * the just-parsed value expression, emit the diagnostic and consume the RHS
   * so the surrounding parse recovers.
   */
  private consumeTrailingAssignment(): void {
    const simple = this.isPunct("=") && !this.isPunct("=", 1);
    const opTok = this.peek();
    const compound =
      opTok.kind === "punct" &&
      COMPOUND_OPS.has(opTok.text) &&
      this.isPunct("=", 1);
    if (!simple && !compound) {
      return;
    }
    this.diagnostics.push({
      severity: "error",
      code: "theta/parse/assignment-as-expression",
      file: this.file,
      range: opTok.range,
      message: "assignment is not an expression",
    });
    if (simple) {
      this.advance(); // `=`
    } else {
      this.advance(); // op
      this.advance(); // `=`
    }
    this.parseExpression(); // consume + discard the RHS
  }

  private parsePattern(): PatternNode {
    if (this.tryConsumeRestPattern()) {
      return { kind: "wildcard" };
    }
    if (this.isKeyword("mut")) {
      // A `mut` modifier on a `match` pattern binding is an always-immutable
      // context (bindings.md §Immutable contexts).
      const mutTok = this.advance();
      const diag = checkMutModifier(
        { position: "match-bind" },
        { file: this.file, range: mutTok.range },
      );
      if (diag !== undefined) {
        this.diagnostics.push(diag);
      }
    }
    const t = this.peek();
    if (t.kind === "number") {
      this.advance();
      // Bug 0234: carry the token's lexed spelling so a pattern-position
      // narrowing verdict can be judged by SOURCE spelling (lexical.md
      // §"Number literals") rather than by the parsed value's shape. Only a
      // "number" spelling is set: an absent field reads as "integer" by
      // construction (mirroring `BodyParser.parsePrimary`'s own
      // `t.numericType ?? "integer"` read, this file), and a "number"-spelled
      // integral literal (`1.0`) is the one case `Number.isInteger(value)`
      // cannot recover.
      const numericType = t.numericType ?? "integer";
      return numericType === "number"
        ? { kind: "literal", value: Number(t.text), numericType }
        : { kind: "literal", value: Number(t.text) };
    }
    if (t.kind === "string") {
      this.advance();
      return { kind: "literal", value: t.value ?? t.text };
    }
    if (t.kind === "punct" && t.text === "[") {
      this.advance();
      const elements: PatternNode[] = [];
      while (!this.isPunct("]") && !this.atEnd()) {
        elements.push(this.parsePattern());
        if (this.isPunct(",")) {
          this.advance();
        }
      }
      if (this.isPunct("]")) {
        this.advance();
      }
      return { kind: "array", elements };
    }
    if (t.kind === "keyword" && t.text === "true") {
      this.advance();
      return { kind: "literal", value: true };
    }
    if (t.kind === "keyword" && t.text === "false") {
      this.advance();
      return { kind: "literal", value: false };
    }
    if (t.kind === "keyword" && t.text === "null") {
      this.advance();
      return { kind: "literal", value: null };
    }
    if (t.kind === "ident" || t.kind === "keyword") {
      this.advance();
      // `Ok(p)` / `Err(p)` result constructor patterns.
      if ((t.text === "Ok" || t.text === "Err") && this.isPunct("(")) {
        this.advance();
        const inner = this.isPunct(")") ? ({ kind: "wildcard" } as PatternNode) : this.parsePattern();
        if (this.isPunct(")")) {
          this.advance();
        }
        return { kind: "constructor", ctor: t.text, inner };
      }
      // `Ident { field: p, … }` object / schema pattern. Unlike the `Ok(`/`Err(`
      // constructor arm above, this arm's gate is the following `{` alone —
      // no spelling restriction — so without a guard here one character of
      // lookahead decides whether `lexical.md:20`'s reserved-word sentence is
      // enforced at pattern-head position (bug 0141's refusal at the tail arm's
      // `reservedKeywordAsIdentifierDiagnostic` emission below is never reached,
      // since that arm sits below this one). The node is still built from
      // `t.text` below: the refusal is carried by the diagnostic alone, so the
      // field binders still reach `collectPatternBindings`'s arm-body scope.
      if (this.isPunct("{")) {
        if (t.kind === "keyword") {
          this.diagnostics.push(reservedKeywordAsIdentifierDiagnostic(t.text, t.range, this.file));
        } else if (!this.patternHeadTypeNames().has(t.text)) {
          // A pattern head REFERENCES a declaration (lexical.md:18: it "refers
          // to an existing schema, enum, or constructor in scope"), the same
          // reading the value-position sibling `checkObjectExpr` already
          // enforces for a constructor name (code-registry-parse.md:102). An
          // `ident`-kind head absent from the whole-file universe resolves to
          // nothing, so it is refused with the SAME code the value position
          // draws at the same spelling (bug 0221) — `else if`, not a second
          // `if`, so a `keyword`-kind head keeps bug 0219's code ALONE.
          this.diagnostics.push(unresolvedNamedTypeDiagnostic(t.text, t.range, this.file));
        }
        this.advance();
        const fields: { readonly name: string; readonly pattern: PatternNode }[] = [];
        while (!this.isPunct("}") && !this.atEnd()) {
          if (this.tryConsumeRestPattern()) {
            if (this.isPunct(",")) {
              this.advance();
            }
            continue;
          }
          const nameTok = this.peek();
          if (nameTok.kind !== "ident" && nameTok.kind !== "string") {
            this.advance();
            continue;
          }
          this.advance();
          let fieldPattern: PatternNode;
          if (this.isPunct(":")) {
            this.advance();
            fieldPattern = this.parsePattern();
          } else {
            // `{ field }` sugars `{ field: field }` (grammar.md §Pattern
            // grammar): a colon-less field binds the field value to a
            // same-named identifier, never a wildcard on the next token.
            fieldPattern = { kind: "identifier", name: nameTok.text };
          }
          fields.push({ name: nameTok.text, pattern: fieldPattern });
          if (this.isPunct(",")) {
            this.advance();
          }
        }
        if (this.isPunct("}")) {
          this.advance();
        }
        return { kind: "object", typeName: t.text, fields, range: spanRange(t.range, this.prevRange()) };
      }
      // A bare `_` wildcard, else an identifier binding pattern.
      if (t.text === "_") {
        return { kind: "wildcard" };
      }
      // Reserved before case (bug 0141 §Fix route 1 half 2): a reserved
      // spelling is refused whatever its case, so `Ok` / `Err` / `Result`
      // draw exactly this one code and never also the capitalised-head one.
      if (t.kind === "keyword") {
        this.diagnostics.push(reservedKeywordAsIdentifierDiagnostic(t.text, t.range, this.file));
      } else if (/^[A-Z]/.test(t.text)) {
        // A capitalised bare head names none of the admitted pattern
        // productions (expressions.md's disambiguation sentence assigns the
        // binding reading to a LOWERCASE identifier only); refused here,
        // after the `(`/`{`-gated constructor and object arms above, so
        // those two real productions are unaffected (bug 0141 §Fix route 1).
        this.diagnostics.push(capitalisedPatternHeadDiagnostic(t.text, t.range, this.file));
      }
      // The node stays an identifier pattern in both refusal cases: the
      // refusal is carried by the error-severity diagnostic alone (which
      // `hasLoadParseError` turns into a registration denial), not by the
      // AST shape. Returning a wildcard here would drop the name from
      // `collectPatternBindings`, and an arm-body read of it would then draw
      // a second, spurious `theta/parse/unknown-identifier` (bug 0141 §Fix
      // route 1, "Emission detail" item 4).
      return { kind: "identifier", name: t.text };
    }
    // A bare object pattern `{ field: p, … }`.
    if (t.kind === "punct" && t.text === "{") {
      this.advance();
      const fields: { readonly name: string; readonly pattern: PatternNode }[] = [];
      while (!this.isPunct("}") && !this.atEnd()) {
        if (this.tryConsumeRestPattern()) {
          if (this.isPunct(",")) {
            this.advance();
          }
          continue;
        }
        const nameTok = this.peek();
        if (nameTok.kind !== "ident" && nameTok.kind !== "string") {
          this.advance();
          continue;
        }
        this.advance();
        let fieldPattern: PatternNode;
        if (this.isPunct(":")) {
          this.advance();
          fieldPattern = this.parsePattern();
        } else {
          // `{ field }` sugars `{ field: field }` (grammar.md §Pattern
          // grammar): a colon-less field binds the field value to a
          // same-named identifier, never a wildcard on the next token.
          fieldPattern = { kind: "identifier", name: nameTok.text };
        }
        fields.push({ name: nameTok.text, pattern: fieldPattern });
        if (this.isPunct(",")) {
          this.advance();
        }
      }
      if (this.isPunct("}")) {
        this.advance();
      }
      return { kind: "object", typeName: null, fields, range: spanRange(t.range, this.prevRange()) };
    }
    // A pattern-position `++` / `--` (bug 0123 §Fix route (a)). Row `:34`'s
    // *Trigger* ("`++` or `--` operator used.") carries no position
    // qualifier, unlike the neighbouring rows that scope themselves to
    // "expression position" or enumerate `match` pattern binding — so this is
    // implementation conformance, not a Trigger change. Consuming the
    // operator here leaves no token behind for `parseMatch`'s `=>` test to
    // misread, which is what would otherwise manufacture a phantom arm
    // carrying `statement-in-arm-body` and `match-arm-type-mismatch`.
    // Recursing into `parsePattern` for the operand (rather than discarding
    // it) keeps the pattern's arity honest — `[--y]` stays one slot,
    // `{ a: --y }` stays one field — and preserves bug 0141's capitalised-head
    // refusal on the operand. A bare `--` has no operand: recursing there
    // would consume the `=` of the arrow and reproduce the same cascade, so
    // that case returns a wildcard instead. Progress is guaranteed either way,
    // since the operator token is always consumed first.
    const incDecOp = this.incrementDecrementOp();
    if (incDecOp !== undefined) {
      const opTok = this.advance();
      const diag = checkIncrementDecrement(
        { op: incDecOp },
        { file: this.file, range: opTok.range },
      );
      if (diag !== undefined) {
        this.diagnostics.push(diag);
      }
      const next = this.peek();
      const nextBeginsPattern =
        next.kind === "number" ||
        next.kind === "string" ||
        next.kind === "ident" ||
        next.kind === "keyword" ||
        (next.kind === "punct" && (next.text === "[" || next.text === "{"));
      if (nextBeginsPattern) {
        return this.parsePattern();
      }
      return { kind: "wildcard" };
    }
    // Unrecognised: consume one token and treat as a wildcard to keep progress.
    this.advance();
    return { kind: "wildcard" };
  }

  /**
   * Memoised result of {@link patternHeadTypeNames}, computed at most once per
   * parse: the token list is fixed for the file's whole parse, so re-scanning
   * it on every `match` arm the way `parsePattern` recurses through arms and
   * depths would be a per-head rescan of the same answer.
   */
  private patternHeadTypeNamesMemo: ReadonlySet<string> | undefined;

  /**
   * The whole-file pattern-head universe (bug 0221 §Fix): every name an
   * object-pattern head may resolve against, scanned from `this.tokens` ONCE
   * rather than from the statement list `collectIdentRoots` reads, because
   * `parsePattern` runs DURING the parse and the statement list does not
   * exist yet at that point (`parsePattern` takes no arguments and reads no
   * parser state beyond the token cursor — bug 0221 §Fix (a)).
   *
   * Seeded from `BUILTIN_VALUE_NAMES` (a pattern head REFERENCES a
   * declaration rather than constructing one, so the builtin error-model
   * names the value position refuses — `QueryError`, measured against
   * `docs/spec_topics/expressions.md:171`'s own example head and the three
   * committed `Err(QueryError { … })` examples — resolve here); then every
   * identifier following a `schema` / `enum` token; then every specifier name
   * of every `import` / `export` statement, scanned forward from the keyword
   * to the first `string` (the `from "path"` clause) or `eof` token, adding
   * every `ident`- or `keyword`-kind token in between (an `as`, a `from`, or a
   * reserved specifier spelling included).
   *
   * DELIBERATELY PERMISSIVE. Over-collecting a name here can only make the
   * check SILENT on it, never make it misfire on a name that should resolve —
   * the same one-directional risk the pre-fix behaviour already carried for
   * every name (bug 0221 §Non-goals: an enum head and an imported head
   * defer). A tighter universe would need to parse each `import`/`export`
   * specifier list and each `schema`/`enum` declaration properly, which is
   * exactly the parse this scan runs ahead of and must not depend on.
   */
  private patternHeadTypeNames(): ReadonlySet<string> {
    if (this.patternHeadTypeNamesMemo !== undefined) {
      return this.patternHeadTypeNamesMemo;
    }
    const names = new Set<string>(BUILTIN_VALUE_NAMES);
    for (let i = 0; i < this.tokens.length; i += 1) {
      const tok = this.tokens[i];
      if (tok === undefined || tok.kind !== "keyword") {
        continue;
      }
      if (tok.text === "schema" || tok.text === "enum") {
        const nameTok = this.tokens[i + 1];
        if (nameTok !== undefined) {
          names.add(nameTok.text);
        }
        continue;
      }
      if (tok.text === "import" || tok.text === "export") {
        for (let j = i + 1; j < this.tokens.length; j += 1) {
          const specTok = this.tokens[j];
          if (specTok === undefined || specTok.kind === "string" || specTok.kind === "eof") {
            break;
          }
          if (specTok.kind === "ident" || specTok.kind === "keyword") {
            names.add(specTok.text);
          }
        }
      }
    }
    this.patternHeadTypeNamesMemo = names;
    return names;
  }

  /**
   * Parse a `par for <Ident> in <Expr> [max <Expr>] <Block>` fan-out expression
   * (RFC 0003; grammar.md `ParForExpr`). The cursor is on the `par` identifier.
   * The iterand and the optional `max` operand parse with object-literal
   * brace-suppression active so the trailing `{` opens the body block rather
   * than reading as a bare object literal; `max` is a contextual keyword here
   * (an ordinary identifier lexeme) recognised only between the iterand and the
   * body. After the body parses, the four body-restriction diagnostics
   * (`par-query-in-body` / `par-shared-mutation` / `par-break-continue` /
   * `par-return-in-body`, control-flow.md CTRL-4) are emitted over the parsed
   * body.
   */
  private parseParFor(): Expr {
    const parTok = this.advance(); // `par`
    this.advance(); // `for`
    let mutConsumed = false;
    if (this.isKeyword("mut")) {
      // A `mut` modifier on the loop variable is an always-immutable context
      // (bindings.md §Immutable contexts), same as plain `for`.
      mutConsumed = true;
      const mutTok = this.advance();
      const diag = checkMutModifier(
        { position: "for-var" },
        { file: this.file, range: mutTok.range },
      );
      if (diag !== undefined) {
        this.diagnostics.push(diag);
      }
    }
    const variableTok = this.peek();
    const variable = this.advance().text;
    // `ParForExpr ::= "par" "for" Ident "in" Expr MaxClause? ParForBody`
    // (grammar.md) makes this the second `Ident` terminal position `parseFor`
    // above serves the first of; same rule, same recovery-artefact guard (bug
    // 0153 §Fix, see `parseFor`'s comment on the same shape). The artefact is
    // discriminated from a genuine iteration variable spelled `in` behind a
    // `mut` by the FOLLOWING token: the artefact is followed by the iterand,
    // the genuine variable by the grammar's own `in` keyword.
    const mutRecoveryArtefact =
      mutConsumed && variableTok.text === "in" && !this.isKeyword("in");
    if (variableTok.kind === "keyword" && !mutRecoveryArtefact) {
      this.diagnostics.push(
        reservedKeywordAsIdentifierDiagnostic(variableTok.text, variableTok.range, this.file),
      );
    }
    if (this.isKeyword("in")) {
      this.advance();
    }
    // Snapshot the outer mutable bindings before the body's own `let`s are
    // recorded, so a body reassignment to an outer `let mut` is detectable.
    const outerMutables = new Set<string>();
    for (const [name, mutable] of this.bindings) {
      if (mutable) {
        outerMutables.add(name);
      }
    }
    const save = this.suppressBrace;
    this.suppressBrace = true;
    let iterand: Expr;
    let max: Expr | null = null;
    try {
      iterand = this.parseExpression() ?? nullExpr(parTok.range);
      // `MaxClause ::= "max" Expr` — `max` is a contextual keyword (a bare
      // identifier lexeme) admitted only here, between the iterand and the body.
      if (this.peek().kind === "ident" && this.peek().text === "max") {
        this.advance(); // `max`
        max = this.parseExpression();
      }
    } finally {
      this.suppressBrace = save;
    }
    // The loop variable is an always-immutable context (bindings.md §"Immutable
    // contexts") — a `par for` variable is a `for` iteration variable
    // (bindings.md:32) — so scope it to the body parse exactly as `parseFor`
    // does, so a write to it draws `immutable-rebinding` (bug 0370 §Fix layer 1;
    // F1) instead of silently reaching the runtime belt.
    const body = this.withImmutableBindings([variable], () => this.parseBlock());
    this.emitParForBodyDiagnostics(body, outerMutables, variable);
    return {
      kind: "par-for",
      variable,
      iterand,
      max,
      body,
      range: spanRange(parTok.range, this.prevRange()),
    };
  }

  /**
   * Emit the CTRL-4 body-restriction diagnostics over a parsed `par for` body:
   *   - an `@`-query against the enclosing conversation → `par-query-in-body`;
   *   - a reassignment to an outer `let mut` binding → `par-shared-mutation`;
   *   - a `break` / `continue` targeting the `par for` → `par-break-continue`;
   *   - a `return` statement, at any body depth → `par-return-in-body`.
   * A nested `par for` emits its own diagnostics during its own parse, so this
   * walk does not descend into a nested `par-for` body (only its iterand / max,
   * which evaluate in this body's scope).
   */
  private emitParForBodyDiagnostics(
    body: Block,
    outerMutables: ReadonlySet<string>,
    loopVariable: string,
  ): void {
    const bodyLocals = new Set<string>();
    // The loop variable is a fresh per-iteration binding local to the body, not
    // the outer mutable it may shadow: a write to it is a write to that fresh
    // immutable binding (drawing `immutable-rebinding`, bug 0370 §Fix F1), never
    // a `par-shared-mutation` against the shadowed outer slot. Counting it as a
    // body-local keeps the shared-mutation scan from double-coding a
    // loop-variable write that shadows an outer `let mut` of the same name.
    if (loopVariable !== "_") {
      bodyLocals.add(loopVariable);
    }
    this.scanParForBlock(body, outerMutables, bodyLocals, 0);
  }

  private scanParForBlock(
    block: Block,
    outerMutables: ReadonlySet<string>,
    bodyLocals: Set<string>,
    loopDepth: number,
  ): void {
    for (const s of block.statements) {
      this.scanParForStmt(s, outerMutables, bodyLocals, loopDepth);
    }
    if (block.tail !== null) {
      this.scanParForExpr(block.tail, outerMutables, bodyLocals, loopDepth);
    }
  }

  private scanParForStmt(
    s: Stmt,
    outerMutables: ReadonlySet<string>,
    bodyLocals: Set<string>,
    loopDepth: number,
  ): void {
    switch (s.kind) {
      case "let":
        if (s.init !== null) {
          this.scanParForExpr(s.init, outerMutables, bodyLocals, loopDepth);
        }
        if (s.name !== "_") {
          bodyLocals.add(s.name);
        }
        return;
      case "reassign":
        if (outerMutables.has(s.target) && !bodyLocals.has(s.target)) {
          this.diagnostics.push({
            severity: "error",
            code: "theta/parse/par-shared-mutation",
            file: this.file,
            range: s.range,
            message: `cannot assign to outer binding '${s.target}' from inside a 'par for' body`,
          });
        }
        this.scanParForExpr(s.value, outerMutables, bodyLocals, loopDepth);
        return;
      case "break":
      case "continue":
        // Legal only when it targets a plain `for` / `while` nested inside the
        // body; a `break` / `continue` targeting the `par for` itself has no
        // defined meaning under concurrent scheduling (CTRL-4).
        if (loopDepth === 0) {
          this.diagnostics.push({
            severity: "error",
            code: "theta/parse/par-break-continue",
            file: this.file,
            range: s.range,
            message: `'${s.kind}' is not permitted inside a 'par for' body`,
          });
        }
        return;
      case "if":
        this.scanParForExpr(s.condition, outerMutables, bodyLocals, loopDepth);
        // The `then` block runs in a child scope at runtime (`executeIf` ->
        // `env.child()`), so a COPY of `bodyLocals` keeps a `let` declared
        // inside it from masking a sibling statement's shared-mutation
        // refusal once the block ends (mirrors the block-expression arm
        // below).
        this.scanParForBlock(s.then, outerMutables, new Set(bodyLocals), loopDepth);
        if (s.otherwise !== null) {
          if ("statements" in s.otherwise) {
            // Same child-scope reasoning as `then`: an `else` block's `let`s
            // must not leak into statements after the `if`.
            this.scanParForBlock(s.otherwise, outerMutables, new Set(bodyLocals), loopDepth);
          } else {
            this.scanParForStmt(s.otherwise, outerMutables, bodyLocals, loopDepth);
          }
        }
        return;
      case "while":
        this.scanParForExpr(s.condition, outerMutables, bodyLocals, loopDepth);
        // The loop body runs in a child scope per iteration, so copy
        // `bodyLocals` for the same reason as the `if` arms above.
        this.scanParForBlock(s.body, outerMutables, new Set(bodyLocals), loopDepth + 1);
        return;
      case "for":
        this.scanParForExpr(s.iterand, outerMutables, bodyLocals, loopDepth);
        // The loop body runs in a child scope per iteration, so copy
        // `bodyLocals` for the same reason as the `if` arms above.
        this.scanParForBlock(s.body, outerMutables, new Set(bodyLocals), loopDepth + 1);
        return;
      case "query":
        this.diagnostics.push({
          severity: "error",
          code: "theta/parse/par-query-in-body",
          file: this.file,
          range: s.range,
          message:
            "`@` query against the enclosing conversation is not permitted inside a 'par for' body",
        });
        return;
      case "tool-call":
        this.scanParForExpr(s.call, outerMutables, bodyLocals, loopDepth);
        return;
      case "invoke":
        this.scanParForExpr(s.invoke, outerMutables, bodyLocals, loopDepth);
        return;
      case "expr":
        this.scanParForExpr(s.expr, outerMutables, bodyLocals, loopDepth);
        return;
      case "return":
        // Refused at EVERY depth, unlike `break` / `continue` above: those stay
        // inside the loop they target when nested (depth > 0 admits them), but
        // a `return` inside a nested plain `for` / `while` crosses that inner
        // loop's boundary (the runtime propagates it outward) and is only
        // consumed at the `par for` boundary — so `loopDepth` is not consulted
        // here. Emitted before the operand walk so a query nested in the
        // operand still draws its own `par-query-in-body` refusal below.
        this.diagnostics.push({
          severity: "error",
          code: "theta/parse/par-return-in-body",
          file: this.file,
          range: s.range,
          message: "'return' is not permitted inside a 'par for' body",
        });
        if (s.operand !== null) {
          this.scanParForExpr(s.operand, outerMutables, bodyLocals, loopDepth);
        }
        return;
      default:
        // fn / schema / enum / import / export / doc-comment carry no
        // enclosing-conversation body restriction to check.
        return;
    }
  }

  private scanParForExpr(
    e: Expr,
    outerMutables: ReadonlySet<string>,
    bodyLocals: Set<string>,
    loopDepth: number,
  ): void {
    switch (e.kind) {
      case "block":
        // A block expression carries a whole statement list, so the CTRL-4
        // body restrictions have to reach inside it. It is not a loop, so
        // `loopDepth` is unchanged and a `break` / `continue` in it still
        // targets the `par for`. Its `let`s bind in a child scope (the runtime
        // evaluates the body in `env.child()`), so a COPY of `bodyLocals`
        // keeps them from masking a sibling's shared-mutation refusal.
        this.scanParForBlock(e.body, outerMutables, new Set(bodyLocals), loopDepth);
        return;
      case "query":
        this.diagnostics.push({
          severity: "error",
          code: "theta/parse/par-query-in-body",
          file: this.file,
          range: e.range,
          message:
            "`@` query against the enclosing conversation is not permitted inside a 'par for' body",
        });
        return;
      case "par-for":
        // A nested `par for` emits its own body diagnostics; its iterand / max
        // evaluate in THIS body's scope, so scan those but not its body.
        this.scanParForExpr(e.iterand, outerMutables, bodyLocals, loopDepth);
        if (e.max !== null) {
          this.scanParForExpr(e.max, outerMutables, bodyLocals, loopDepth);
        }
        return;
      case "try":
        this.scanParForExpr(e.operand, outerMutables, bodyLocals, loopDepth);
        return;
      case "binary":
        this.scanParForExpr(e.left, outerMutables, bodyLocals, loopDepth);
        this.scanParForExpr(e.right, outerMutables, bodyLocals, loopDepth);
        return;
      case "ternary":
        this.scanParForExpr(e.condition, outerMutables, bodyLocals, loopDepth);
        this.scanParForExpr(e.consequent, outerMutables, bodyLocals, loopDepth);
        this.scanParForExpr(e.alternate, outerMutables, bodyLocals, loopDepth);
        return;
      case "call":
      case "invoke":
        for (const arg of e.args) {
          this.scanParForExpr(arg, outerMutables, bodyLocals, loopDepth);
        }
        return;
      case "member":
        this.scanParForExpr(e.target, outerMutables, bodyLocals, loopDepth);
        return;
      case "index":
        this.scanParForExpr(e.target, outerMutables, bodyLocals, loopDepth);
        this.scanParForExpr(e.index, outerMutables, bodyLocals, loopDepth);
        return;
      case "method-call":
        this.scanParForExpr(e.target, outerMutables, bodyLocals, loopDepth);
        for (const arg of e.args) {
          this.scanParForExpr(arg, outerMutables, bodyLocals, loopDepth);
        }
        return;
      case "object":
        for (const field of e.fields) {
          this.scanParForExpr(field.value, outerMutables, bodyLocals, loopDepth);
        }
        return;
      case "array":
        for (const el of e.elements) {
          this.scanParForExpr(el, outerMutables, bodyLocals, loopDepth);
        }
        return;
      case "result-ctor":
        this.scanParForExpr(e.arg, outerMutables, bodyLocals, loopDepth);
        return;
      case "match":
        this.scanParForExpr(e.scrutinee, outerMutables, bodyLocals, loopDepth);
        for (const arm of e.arms) {
          this.scanParForExpr(arm.body, outerMutables, bodyLocals, loopDepth);
        }
        return;
      default:
        // ident / number / string / bool / null — no query / nested par-for.
        return;
    }
  }

  private parseInvoke(): Expr {
    const kw = this.advance(); // `invoke`
    // Capture an optional `<T>` return-type annotation (invocation.md §Typed
    // return): its text is threaded onto the AST so the runtime can AJV-validate
    // the callee's returned value against it (the parse-time type check is
    // separate; the runtime check is the safety net — hard-ceilings ceiling #4).
    let returnSchema: string | null = null;
    // Absent iff no `<T>` was written, or the angle-depth loop closed its own
    // `>` before EOF; present, the loop exhausted the source at depth > 0, so
    // the capture did not end at its own `>` (bug 0279, clause (iv)(3)'s
    // provenance mark).
    let returnSchemaAbsorbed = false;
    if (this.isPunct("<")) {
      this.advance(); // `<`
      let depth = 1;
      const parts: string[] = [];
      while (depth > 0 && !this.atEnd()) {
        const t = this.peek();
        if (t.kind === "punct" && t.text === "<") {
          depth += 1;
        } else if (t.kind === "punct" && t.text === ">") {
          depth -= 1;
          if (depth === 0) {
            this.advance();
            break;
          }
        } else if (t.kind === "punct" && t.text === "{") {
          // An inline `ObjectType` arm inside `invoke<T>`: route it through
          // the same balanced-group consumer as `parseType`, angle-bounded so
          // an unclosed brace cannot run past this annotation's own `>`
          // (bug 0228).
          this.consumeInlineObjectType(parts, true);
          continue;
        }
        parts.push(t.text);
        this.advance();
      }
      const annotation = parts.join("").trim();
      returnSchema = annotation.length > 0 ? annotation : null;
      returnSchemaAbsorbed = depth > 0;
    }
    const args = this.parseArgs();
    const first = args[0];
    const path = first !== undefined && first.kind === "string" ? first.value : "";
    // INV-1 / INV-2 (invocation.md §Resolution; lexical.md §"Path literals" /
    // §"Extension matching"): the callee path is a string literal — validate its
    // byte-exact-lowercase `.theta` suffix and forward-slash-only rule at parse
    // time. INV-8: a non-literal (runtime-computed) path is not supported in
    // theta 1.0, so surface it as a parse error rather than degrading to a silent
    // empty-path no-op at runtime.
    if (first !== undefined) {
      if (first.kind === "string") {
        this.diagnostics.push(
          ...validatePathLiteral(
            { value: first.value, range: first.range },
            "invoke",
            this.file,
          ),
        );
      } else {
        this.diagnostics.push({
          severity: "error",
          code: "theta/parse/unsupported-feature",
          file: this.file,
          range: first.range,
          message:
            "unsupported syntactic feature: dynamic invoke path (runtime-computed)",
        });
      }
    }
    return {
      kind: "invoke",
      path,
      returnSchema,
      args,
      ...(returnSchemaAbsorbed ? { returnSchemaAbsorbed: true } : {}),
      range: spanRange(kw.range, this.prevRange()),
    };
  }

  private parseArgs(): Expr[] {
    const args: Expr[] = [];
    if (!this.isPunct("(")) {
      return args;
    }
    this.advance(); // `(`
    const saveArgs = this.suppressBrace;
    this.suppressBrace = false;
    while (!this.isPunct(")") && !this.atEnd()) {
      const arg = this.parseExpression();
      if (arg === null) {
        this.advance();
        continue;
      }
      args.push(arg);
      if (this.isPunct(",")) {
        this.advance();
      }
    }
    this.suppressBrace = saveArgs;
    if (this.isPunct(")")) {
      this.advance();
    }
    return args;
  }

  private parseArray(): Expr {
    const open = this.advance(); // `[`
    const saveArr = this.suppressBrace;
    this.suppressBrace = false;
    const elements: Expr[] = [];
    while (!this.isPunct("]") && !this.atEnd()) {
      const el = this.parseExpression();
      if (el === null) {
        this.advance();
        continue;
      }
      elements.push(el);
      if (this.isPunct(",")) {
        this.advance();
      }
    }
    this.suppressBrace = saveArr;
    if (this.isPunct("]")) {
      this.advance();
    }
    return {
      kind: "array",
      elements,
      range: spanRange(open.range, this.prevRange()),
    };
  }

  /**
   * Parse (and reject) a backtick template used in value position with no
   * leading `@`. Query templates are `@`-prefixed and admitted only at
   * statement / `let`-RHS level (expressions.md §"Not supported"), so a bare
   * `` `..${..}` `` value is `theta/parse/unsupported-feature`. The whole
   * template is consumed — up to the matching closing backtick — so a `${…}`
   * interpolation brace is never re-read as a bare object literal (which would
   * mis-emit `theta/parse/bare-object-literal`); an inert `null` node keeps
   * downstream typing stable.
   */
  private parseBareTemplate(): Expr {
    const open = this.advance(); // opening backtick
    // Consume the whole template up to its matching closing backtick, tracking
    // `${…}` interpolation brace depth so a backtick nested inside an
    // interpolation (`` `a${@`x`}` ``) does not prematurely close the template
    // and leave trailing tokens to be re-parsed into a spurious secondary
    // diagnostic.
    let braceDepth = 0;
    while (!this.atEnd()) {
      if (braceDepth === 0 && this.isPunct("`")) {
        break;
      }
      if (this.isPunct("{")) {
        braceDepth += 1;
      } else if (this.isPunct("}") && braceDepth > 0) {
        braceDepth -= 1;
      }
      this.advance();
    }
    if (this.isPunct("`")) {
      this.advance(); // closing backtick
    }
    const range = spanRange(open.range, this.prevRange());
    this.diagnostics.push({
      severity: "error",
      code: "theta/parse/unsupported-feature",
      file: this.file,
      range,
      message:
        "unsupported syntactic feature: backtick template in value position (query templates must be @-prefixed)",
    });
    return nullExpr(range);
  }

  private parseQuery(): Expr {
    const at = this.advance(); // `@`
    let schema: string | null = null;
    // An optional `@<Schema>` annotation precedes the backtick template
    // (query-forms.md QRY-3). The annotation is a type expression between angle
    // brackets — a named schema (`@<Triage>`), a primitive (`@<integer>`), or a
    // nested generic (`@<array<Foo>>`) — its tokens joined with no separator,
    // except an inline `ObjectType` brace group's interior, sliced raw from
    // the author's source bytes (bug 0228).
    if (this.isPunct("<")) {
      this.advance(); // `<`
      const parts: string[] = [];
      let depth = 1;
      while (depth > 0 && !this.atEnd()) {
        if (this.isPunct("<")) {
          depth += 1;
        } else if (this.isPunct(">")) {
          depth -= 1;
          if (depth === 0) {
            this.advance();
            break;
          }
        } else if (this.isPunct("{")) {
          // An inline `ObjectType` arm inside `@<T>`: route it through the
          // same balanced-group consumer as `parseType`, angle-bounded so an
          // unclosed brace cannot run past this annotation's own `>` (the
          // `@<Ghost{>` ghost bound, bug 0228).
          this.consumeInlineObjectType(parts, true);
          continue;
        }
        parts.push(this.advance().text);
      }
      schema = parts.join("").trim();
      // Bug 0014: the type grammar derives no empty `Type` (grammar.md §Type
      // grammar; type-system.md applies the same grammar to the `@<T>`
      // annotation position), so an interior that trims to empty — `@<>`,
      // `@<  >`, tab/newline-only, or an unterminated `@<` at EOF — is not an
      // ascription. Accepted silently, the minted `""` is the sole input
      // `lowerQueryResponseSchema` cannot lower, and the runtime would bind
      // the response with no validation on the degraded fused arm (QRY-22).
      // Reject here — the one place the empty capture is manufactured (the
      // bare `@Ident` arm below never mints an empty annotation, and
      // `parseInvoke` normalises its empty capture to untyped `null`). The
      // node still carries the minted `""` so the AST reflects the source;
      // load refuses error thetas, and the lowering's `undefined` contract
      // stays as defence in depth.
      if (schema.length === 0) {
        this.diagnostics.push({
          severity: "error",
          code: "theta/parse/empty-query-annotation",
          file: this.file,
          range: spanRange(at.range, this.prevRange()),
          message:
            "`@<>` query annotation is empty; write `@<Schema>` or drop the annotation for an untyped query",
        });
      }
    } else if (!this.isPunct("`")) {
      // A bare `@Schema` (no angle brackets) annotation.
      const ann = this.peek();
      if (ann.kind === "ident" || ann.kind === "keyword") {
        schema = ann.text;
        this.advance();
      }
    }
    const parts: string[] = [];
    let openTick: Token | null = null;
    let closeTick: Token | null = null;
    if (this.isPunct("`")) {
      openTick = this.advance(); // opening backtick
      while (!this.isPunct("`") && !this.atEnd()) {
        parts.push(this.advance().text);
      }
      if (this.isPunct("`")) {
        closeTick = this.advance(); // closing backtick
      }
    }
    // Recover the verbatim template between the backticks from the raw body
    // source (the tokens are a lossy, space-joined view — they collapse the
    // author's spacing and drop interpolation braces). Fall back to the
    // space-joined tokens only when the raw slice is unavailable (no closing
    // backtick, or no body source threaded through).
    const rawTemplate =
      openTick !== null && closeTick !== null && this.bodyText.length > 0
        ? this.bodyText.slice(
            positionToOffset(this.bodyText, openTick.range.end),
            positionToOffset(this.bodyText, closeTick.range.start),
          )
        : parts.join(" ");
    // QRY-6's Trigger presupposes a template the author WROTE and CLOSED; an
    // error-recovery capture (an over-run `@<Ghost` annotation at EOF, or an
    // unterminated `` @` `` with no closing backtick) mints this same node
    // shape with an empty `template` for text the author never wrote as a
    // template body at all, so the check is gated on both tick tokens being
    // present rather than on the template text.
    if (openTick !== null && closeTick !== null) {
      const warning = emptyTemplateWarning(
        queryTemplateStaticBody(rawTemplate),
        spanRange(openTick.range, closeTick.range),
      );
      if (warning !== undefined) {
        this.diagnostics.push({ ...warning, file: this.file });
      }
    }
    return {
      kind: "query",
      schema,
      ascriptionWritten: schema !== null,
      template: rawTemplate,
      range: spanRange(at.range, this.prevRange()),
    };
  }

  private prevRange(): SourceRange {
    const prev = this.tokens[this.pos - 1];
    return prev?.range ?? this.peek().range;
  }
}

/** Build a range spanning from `start`'s start to `end`'s end. */
function spanRange(start: SourceRange, end: SourceRange): SourceRange {
  return { start: start.start, end: end.end };
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
 * Type / value names the theta 1.0 stdlib exposes bare (so they never read as an
 * unknown identifier). Primitive / generic type names never legally appear in
 * value position, but folding them in keeps the check false-positive-free if
 * one is written where the walk sees an identifier. `QueryError` / `Result` are
 * the error-model names an author may reference.
 */
const BUILTIN_VALUE_NAMES: ReadonlySet<string> = new Set([
  "string",
  "number",
  "integer",
  "boolean",
  "null",
  "void",
  "array",
  "Result",
  "QueryError",
]);

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
  const basename = spec.slice(spec.lastIndexOf("/") + 1);
  const stem = basename.endsWith(".theta")
    ? basename.slice(0, -".theta".length)
    : basename;
  return stem.replace(/-/g, "_");
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

/** Collect every name a `match` pattern binds into `into` (arm-body scope). */
function collectPatternBindings(p: PatternNode, into: Set<string>): void {
  switch (p.kind) {
    case "identifier":
      into.add(p.name);
      return;
    case "constructor":
      collectPatternBindings(p.inner, into);
      return;
    case "object":
      for (const f of p.fields) {
        collectPatternBindings(f.pattern, into);
      }
      return;
    case "array":
      for (const el of p.elements) {
        collectPatternBindings(el, into);
      }
      return;
    default:
      // wildcard / literal bind nothing.
      return;
  }
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
      for (const arg of e.args) {
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
      for (const arg of e.args) {
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
 * The registered `theta/parse/unresolved-named-type` rejection. Its trigger
 * (code-registry-parse.md) covers the full `NamedType`-reference position set
 * (bug 0262 §Fix, the FULL widening): the `params:` right-hand side, the
 * `@<T>` query annotation, a `schema` body field type, the right-hand side of
 * a `schema X = ...` alias/union declaration (bug 0033 §Fix), an
 * object-constructor name, a `match` object-pattern head, a `let` annotation,
 * an `fn` parameter type, an `fn` return type, and an `invoke<Type>`
 * ascription (grammar.md §Type grammar) — plus every generic argument, union
 * arm, `Result` argument and inline object field nested inside one of those.
 * `let x: Nope = 1` and `fn f(x: Nope): number { 1 }` refuse this code exactly
 * as `schema S { f: Nope }` always has.
 *
 * NINE of the ten reference positions emit through this builder.
 * `checkObjectExpr` below (the object-constructor name), the `"schema"` case
 * of `walkStatement` plus its `"let"`, `"fn"`-parameter and `"fn"`-return
 * reads (all below — a `schema` body field type, a `let` annotation, an `fn`
 * parameter type and an `fn` return type), `walkExpr`'s `"query"` case (the
 * `@<T>` annotation) and its `"invoke"` case (the `invoke<T>` ascription), and
 * `checkSchemaDeclarationGraph` (the alias/union right-hand side) — eight
 * positions resolving names through `collectUnresolvedNamedTypes`
 * (body-type-lowering.ts). The ninth, `parsePattern`'s `match` object-pattern
 * head, resolves through `patternHeadTypeNames` instead: it references a
 * DECLARATION rather than a type expression, so it needs no lowering pass
 * (bug 0221 §Fix). The `@<T>` position reaches this builder only for
 * `Ident`-shaped text (grammar.md `NamedType ::= Ident`) that resolves to no
 * declaration: text that is not an `Ident` is refused ahead of this
 * resolution, by `theta/parse/query-annotation-type-not-expression` (bug 0203
 * §Fix), so this builder never sees it for that position. The tenth, the
 * `params:` RHS, emits the row's message from its own site (`parseParams`,
 * params.ts): params.ts is UPSTREAM of this module in the import graph (this
 * module imports `splitTopLevel` from it), so that site cannot reach this
 * builder without a cycle, and the two message literals are held identical to
 * the registry row by DIAG-4 rather than by sharing code.
 *
 * The RESOLUTION behind the four positions that carry a TYPE EXPRESSION is one
 * arm. A brace-rooted type source hoists under `__inline_<slug>`
 * (schema-subset.md:73) through `hoistInlineObjectType` (params.ts), which
 * walks the field list to `topLevelColon` and resolves each field's type
 * through the caller's own `lowerCtx` (bug 0039 §Fix). The `params:`
 * right-hand side reaches that arm through `lowerParamsFieldType`
 * (params.ts); the `@<T>` annotation, a `schema` body field type and the
 * alias/union right-hand side reach it through `lowerTypeSource`
 * (body-type-lowering.ts), which `collectUnresolvedNamedTypes` and the
 * `schema`-body lowering both run on. The fifth position, the
 * object-constructor name, resolves a NAME rather than a type expression, so
 * no inline object can nest under it. The annotation root is the one position
 * that ALSO lowers a fragment in place rather than hoisting it —
 * `lowerInlineObject`'s fragment is its document root — and that function's
 * interior `,` split nests brace depth exactly as the shared arm's does, so no
 * position reads a nested `ObjectType`'s comma as a FIELD-LIST separator.
 *
 * WHAT BOUNDS THE DESCENT IS THE ROUTE, NOT THE DEPTH. A name lands in
 * `lowerCtx.unresolved` from any nesting of inline-object FIELDS, because each
 * field's type re-enters the same arm — `{a: {x: {y: Tirage}}}` raises at all
 * four positions — and from any brace-group ARM of a top-level union, because
 * all four routes ask `lowerBraceGroupUnionArms` (params.ts) before falling
 * through to `lowerTypeExpr` and it hoists each brace-group arm of an intact
 * segment set on that arm's own terms (bug 0097 §Fix, which gave the `params:`
 * position the same dispatch its three siblings run): `{a: {x: Tirage} | Cat}`
 * raises for BOTH names at all four positions. The descent stops wherever the
 * route leaves that arm for `lowerTypeExpr`'s own recursion, which has no
 * inline-object arm and drops a brace-rooted source on its trailing catch-all.
 * Two shapes leave it, and each is a permissive silence rather than a wrong
 * fragment:
 *
 *   - a brace group inside a GENERIC ARGUMENT. `{a: array<{x: Tirage}>}`
 *     raises no unresolved-named-type at any position: `lowerTypeExpr`
 *     recurses an argument
 *     through itself, and the argument split stays angle-only — not because
 *     widening it would disagree with `theta/parse/generic-arity-mismatch`;
 *     measured, angle-only is the mode that DISAGREES with that parser (an
 *     angle-only split counts three arguments where `parseGeneric` counts
 *     one). `TypeSplitNesting`'s own doc (params.ts) states the relation
 *     correctly. The reason angle-only stands is the honesty one below: a
 *     brace-under-generic argument that widened would present as one
 *     argument and lower `{"type":"array","items":{}}`, asserting arrayness
 *     while dropping the element shape the source spells — bug 0204 keeps
 *     those bytes.
 *   - a brace group whose OWN interior `|` sits beside another arm.
 *     `{ a: Tirage | null } | Cat` raises none anywhere either: the angle-only
 *     `|` split SHREDS the group into `{ a: Tirage` and `null }`, and
 *     `lowerBraceGroupUnionArms` declines the arm dispatch for any segment set
 *     carrying a shard like those — at every position alike, since it is the
 *     one dispatch all four routes ask — handing the whole source to
 *     `lowerTypeExpr`, which has no inline-object arm to descend with. The
 *     decline holds even when one shard is itself a balanced brace group —
 *     `Cat | {a: integer | {c: Ghost} | boolean}` leaves `{c: Ghost}` standing
 *     as a segment, a NESTED arm inside the destroyed group rather than an arm
 *     of this union, so `Ghost` raises nowhere (bug 0033 §Fix residual (ii);
 *     `SchemaDecl.arms`' own caveat records the same split from the capture
 *     side, and `isBraceBalanced` (params.ts, module-private) states why a
 *     balanced shard is no exception).
 *
 * `splitTopLevel`'s `"angle"` default keeps that permissive outcome HONEST for
 * a brace-under-generic shape instead of papering over it. With brace depth
 * also tracked, `array<{a: string, b: integer}>` would present as one argument
 * and lower to `{"type":"array","items":{}}` — a fragment asserting arrayness
 * while dropping the element shape the author wrote, so a payload of arbitrary
 * elements would validate as though checked against it. Under angle depth alone
 * the same text splits into two arguments, the `array` arm does not match, and
 * the form lowers to `{}`, which asserts nothing — matching the fact that
 * nothing about the shape was derived. `queryResponseAnnotation` below is the
 * one caller needing `"angle-and-brace"`: it lowers nothing itself and wants to
 * agree with the parser computing `theta/parse/generic-arity-mismatch` about
 * the ARGUMENT COUNT. That agreement holds for a brace-carried argument (both
 * count `ObjectType` as one unit) but not for a `[…]` bracket group
 * (bug 0236): this split stays bracket-blind by the same angle-only-plus-brace
 * design that keeps it derivable-shape-only, so it still counts a bracket
 * group's own interior comma as an argument boundary where `TypeParser` (fixed
 * for that construct, `type-grammar.ts`) now does not. See
 * `queryResponseAnnotation`'s own doc block for what that residual
 * disagreement is observed as.
 */
const UNRESOLVED_NAMED_TYPE_CODE = "theta/parse/unresolved-named-type";

function unresolvedNamedTypeDiagnostic(
  name: string,
  range: SourceRange,
  file: string,
): Diagnostic {
  return {
    severity: "error",
    code: UNRESOLVED_NAMED_TYPE_CODE,
    file,
    range,
    message: `unresolved named type '${name}'`,
  };
}

/**
 * The registered `theta/parse/reserved-keyword-as-identifier` rejection
 * (code-registry-parse.md:21) for a reserved spelling `collectUnresolvedNamedTypes`
 * finds where a `NamedType` is read: `NamedType ::= Ident` (grammar.md:98) is
 * an identifier position, so the row's existing trigger already covers it —
 * this builder renders the same registered Message the lexer's own
 * declarator-name check (lexer.ts) emits from a second site, held identical by
 * DIAG-4 rather than by shared code (bug 0044 §Fix). Same severity/range/file
 * construction as `unresolvedNamedTypeDiagnostic` above, the sibling sink's
 * builder.
 */
function reservedKeywordAsIdentifierDiagnostic(
  keyword: string,
  range: SourceRange,
  file: string,
): Diagnostic {
  return {
    severity: "error",
    code: "theta/parse/reserved-keyword-as-identifier",
    file,
    range,
    message: `reserved keyword '${keyword}' cannot be used as an identifier`,
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
 * The registered `theta/parse/annotation-type-not-expression` refusal (bug
 * 0124 §Fix): a `let` annotation, an `fn` parameter type, or an `fn` return
 * type whose captured source — `annotationSourceIsNotTypeExpression`
 * (type-layer-checks.ts) — derives from none of `Type`'s six alternatives
 * (grammar.md:90–:95). Sibling to `schemaTypeNotExpressionDiagnostic` above,
 * with one difference in what `<name>` renders: THIS position always has a
 * binder of its own — the `let` binding name, the `fn` parameter name, or the
 * `fn` name — so the message names THAT identifier rather than the enclosing
 * declaration's, unlike the schema position's field-less `SchemaFieldSource`
 * and arm string, which carry no name to render and fall back to `<X>`, the
 * declaration's own.
 */
function annotationTypeNotExpressionDiagnostic(
  name: string,
  range: SourceRange,
  file: string,
): Diagnostic {
  return {
    severity: "error",
    code: "theta/parse/annotation-type-not-expression",
    file,
    range,
    message: `'${name}' declares a type that is not a theta type expression`,
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
 * `annotationTypeNotExpressionDiagnostic` above, for three reasons.
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
 * admission the `let`, `fn` parameter, `fn` return and `invoke<Type>`
 * captures carry (`withBuiltinErrorModelNames`) — not the argument slot: the
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

  const walkCtx: CallSiteWalkContext = {
    rootLocals,
    fnImportDecls,
    piTools,
    callables,
    file,
    out: [],
  };
  walkCallSiteBlock(body, new Map(rootLocals), walkCtx);
  return walkCtx.out;
}

function walkCallSiteBlock(
  block: Block,
  locals: Map<string, LocalBinder>,
  walkCtx: CallSiteWalkContext,
): void {
  for (const s of block.statements) {
    walkCallSiteStmt(s, locals, walkCtx);
  }
  if (block.tail !== null) {
    walkCallSiteExpr(block.tail, locals, walkCtx);
  }
}

function walkCallSiteStmt(
  s: Stmt,
  locals: Map<string, LocalBinder>,
  walkCtx: CallSiteWalkContext,
): void {
  switch (s.kind) {
    case "let":
      // The initialiser is evaluated BEFORE the name binds, so a tool call in
      // it still resolves to the tool; the binding shadows from here onward.
      if (s.init !== null) {
        walkCallSiteExpr(s.init, locals, walkCtx);
      }
      if (s.name !== "_") {
        locals.set(s.name, { kind: "let", line: s.range.start.line });
      }
      return;
    case "reassign":
      walkCallSiteExpr(s.value, locals, walkCtx);
      return;
    case "if": {
      walkCallSiteExpr(s.condition, locals, walkCtx);
      walkCallSiteBlock(s.then, new Map(locals), walkCtx);
      if (s.otherwise !== null) {
        if ("statements" in s.otherwise) {
          walkCallSiteBlock(s.otherwise, new Map(locals), walkCtx);
        } else {
          walkCallSiteStmt(s.otherwise, new Map(locals), walkCtx);
        }
      }
      return;
    }
    case "while":
      walkCallSiteExpr(s.condition, locals, walkCtx);
      walkCallSiteBlock(s.body, new Map(locals), walkCtx);
      return;
    case "for": {
      walkCallSiteExpr(s.iterand, locals, walkCtx);
      const inner = new Map(locals);
      inner.set(s.variable, { kind: "for", line: s.range.start.line });
      walkCallSiteBlock(s.body, inner, walkCtx);
      return;
    }
    case "fn": {
      // Closure-free (`walkIdentStmt` precedent): an `fn` body sees only the
      // whole-file declarations plus its own parameters, so a tool call inside
      // a helper body is still a tool call — `fn helper() { read(args) }`
      // fires — while `fn f(read) { read(x) }` is parameter-shadowed. A
      // `FnParam` carries no range of its own; the declaration's start line
      // locates the parameter list.
      const fnLocals = new Map(walkCtx.rootLocals);
      for (const p of s.params) {
        fnLocals.set(p.name, { kind: "fn-param", line: s.range.start.line });
      }
      walkCallSiteBlock(s.body, fnLocals, walkCtx);
      return;
    }
    case "return":
      if (s.operand !== null) {
        walkCallSiteExpr(s.operand, locals, walkCtx);
      }
      return;
    case "query":
      walkCallSiteExpr(s.query, locals, walkCtx);
      return;
    case "tool-call":
      walkCallSiteExpr(s.call, locals, walkCtx);
      return;
    case "invoke":
      walkCallSiteExpr(s.invoke, locals, walkCtx);
      return;
    case "expr":
      walkCallSiteExpr(s.expr, locals, walkCtx);
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
  walkCtx: CallSiteWalkContext,
): void {
  switch (e.kind) {
    case "call": {
      const localBinder = locals.get(e.callee);
      // (1) Bug 0016: a call of a locally shadowed callable-set name is
      // erroneous — arm 1 wins the resolution, and a local never holds a
      // callable.
      if (localBinder !== undefined && walkCtx.callables.has(e.callee)) {
        walkCtx.out.push(
          shadowedCallableCallDiagnostic(e.callee, localBinder, e.range, walkCtx.file),
        );
      }
      // The callee is lexically the Pi tool iff no higher-precedence arm
      // (local / fn / import) captures the name.
      const resolvesToPiTool =
        walkCtx.piTools.has(e.callee) &&
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
      } else {
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
      for (const arg of e.args) {
        walkCallSiteExpr(arg, locals, walkCtx);
      }
      return;
    }
    case "binary":
      walkCallSiteExpr(e.left, locals, walkCtx);
      walkCallSiteExpr(e.right, locals, walkCtx);
      return;
    case "ternary":
      walkCallSiteExpr(e.condition, locals, walkCtx);
      walkCallSiteExpr(e.consequent, locals, walkCtx);
      walkCallSiteExpr(e.alternate, locals, walkCtx);
      return;
    case "try":
      walkCallSiteExpr(e.operand, locals, walkCtx);
      return;
    case "invoke":
      for (const arg of e.args) {
        walkCallSiteExpr(arg, locals, walkCtx);
      }
      return;
    case "member":
      walkCallSiteExpr(e.target, locals, walkCtx);
      return;
    case "index":
      walkCallSiteExpr(e.target, locals, walkCtx);
      walkCallSiteExpr(e.index, locals, walkCtx);
      return;
    case "method-call":
      walkCallSiteExpr(e.target, locals, walkCtx);
      for (const arg of e.args) {
        walkCallSiteExpr(arg, locals, walkCtx);
      }
      return;
    case "object":
      // RFC 0002: field VALUES are full expressions — a nested call inside a
      // legal `{ ... }` argument is itself checked. Bare-object legality in
      // non-call-argument positions stays the structural walk's concern.
      for (const field of e.fields) {
        walkCallSiteExpr(field.value, locals, walkCtx);
      }
      return;
    case "array":
      for (const el of e.elements) {
        walkCallSiteExpr(el, locals, walkCtx);
      }
      return;
    case "result-ctor":
      walkCallSiteExpr(e.arg, locals, walkCtx);
      return;
    case "match":
      walkCallSiteExpr(e.scrutinee, locals, walkCtx);
      for (const arm of e.arms) {
        // A pattern node carries no range; the arm's BODY starts on the arm's
        // own line, so its start line locates the binding for the message.
        const bound = new Set<string>();
        collectPatternBindings(arm.pattern, bound);
        const armLocals = new Map(locals);
        for (const name of bound) {
          armLocals.set(name, { kind: "match", line: arm.body.range.start.line });
        }
        walkCallSiteExpr(arm.body, armLocals, walkCtx);
      }
      return;
    case "par-for": {
      // Reached explicitly (unlike the ident walk, which predates RFC 0003):
      // a `par for` body is a call-site-bearing block and its per-iteration
      // variable shadows.
      walkCallSiteExpr(e.iterand, locals, walkCtx);
      if (e.max !== null) {
        walkCallSiteExpr(e.max, locals, walkCtx);
      }
      const inner = new Map(locals);
      inner.set(e.variable, { kind: "par-for", line: e.range.start.line });
      walkCallSiteBlock(e.body, inner, walkCtx);
      return;
    }
    case "block":
      // A CHILD scope, mirroring `walkIdentExpr`'s `case "block"` above: a
      // call site inside the block still resolves against the enclosing
      // locals, but a name the block's own `let`s bind must not survive past
      // it.
      walkCallSiteBlock(e.body, new Map(locals), walkCtx);
      return;
    default:
      // number / string / bool / null / ident / query — no call sites (a
      // query's `${…}` interpolations live in its raw template text, not as
      // AST children).
      return;
  }
}

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
   * (`FrontmatterBodyTypes`, frontmatter.ts:228–243): every body `schema` name
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
 * The declared-name universe a bug 0262 §Fix capture resolves against:
 * `typeNames` widened with the builtin error-model names the pattern-head
 * position already admits (`patternHeadTypeNames`'s own seed,
 * `BUILTIN_VALUE_NAMES` above — clause (iv)(1)). Reusing that constant rather
 * than a literal at each of the four call sites is what keeps the admission
 * one fact instead of four: an APPLIED `Result` is never tested as an atom
 * (`lowerTypeExpr`'s generic-application arm reads a `ctor` name structurally,
 * never through the identifier-resolution arm), so admitting it here is inert
 * for that spelling; an UNAPPLIED `Result` reaches the atom arm instead and is
 * the reserved-keyword class `theta/parse/reserved-keyword-as-identifier`
 * reports at every capture (bug 0277 §Fix route (a)) — `QueryError` is the
 * only name the four new captures ever resolve as a `NamedType`.
 */
function withBuiltinErrorModelNames(typeNames: ReadonlySet<string>): ReadonlySet<string> {
  return new Set([...typeNames, ...BUILTIN_VALUE_NAMES]);
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

/** Is `a` strictly before `b` in (line, column) order? */
function positionBefore(a: Position, b: Position): boolean {
  return a.line < b.line || (a.line === b.line && a.column < b.column);
}

/**
 * Clause (iv)(3)'s artefact-suppression predicate: does an error-severity
 * diagnostic ALREADY drawn — either in a pass that ran before the structural
 * walk (`prior`) or earlier in the structural walk itself, including this same
 * capture's own type-grammar pass (`own`) — overlap the CAPTURE WINDOW
 * `window`? An `unresolved-named-type` row drawn by THIS walk is not such
 * evidence and is filtered out of `own`: it names a head at some enclosing
 * capture and says nothing about the window of a capture nested inside it, so
 * counting it would let one refusal swallow a second written mistake — the
 * opposite of the one-diagnostic-per-written-mistake reading the clause states.
 * Every other row, including this row's emissions from a PRIOR pass, still
 * counts. Overlap is position-precise, not line-precise, and honours the
 * exclusive `end` of a `SourceRange`: the windows are what bounds the clause
 * to capture debris. A same-line fault OUTSIDE the window (a stray token past
 * the end of a `let` statement) and a body-interior fault outside an `fn`
 * header (a lexer error several lines into the body) are independent author
 * mistakes, and each keeps its own diagnostic beside the name refusal rather
 * than swallowing it. A diagnostic carrying no range cannot overlap anything
 * and is skipped, never treated as a wildcard cover.
 *
 * `own`'s overlap test is further narrowed to CONTAINMENT in `construct`, the
 * construct whose capture is being judged (bug 0272 §Fix route (b)). A row
 * ranged over an ENCLOSING declaration — an `fn` whose own header annotation is
 * refused carries the whole declaration's range, body included
 * (`annotationTypeNotExpressionDiagnostic`) — overlaps every capture window
 * nested in that body without saying anything about a head the author wrote
 * there, so counting it as cover would swallow that second written mistake. A
 * row ranged over the capture's OWN construct still passes this predicate's
 * geometry test, whichever code it carries and whichever of that construct's
 * captures earned it. `prior` stays unnarrowed: it is evidence from an earlier
 * pass, never this walk's own enclosing-declaration refusal.
 *
 * Geometry alone cannot tell a coverer that is cover FOR THIS CAPTURE from one
 * that merely shares its construct: a range wide enough to contain the
 * capture's window is exactly as wide when the text inside it is debris the
 * capture absorbed (`Gone--`) and when it is a sibling head the author wrote
 * elsewhere in the same header (`q: Gone`, a nested `fn`'s own parameter) —
 * bug 0279. Every caller therefore gates this predicate's result behind the
 * capture's own provenance mark (`annotationAbsorbed`, `typeAbsorbed`,
 * `returnTypeAbsorbed`, `returnSchemaAbsorbed`): a coverer is a verdict on the
 * capture only when the capture itself did NOT end at its own terminator —
 * whether it ran past a syntax fault and absorbed the following construct's
 * text, or halted at a token its position does not derive. A capture that DID
 * end at its own terminator holds text the author spelled there, and no
 * coverer silences it.
 */
function captureWindowAlreadyRefused(
  prior: readonly Diagnostic[],
  own: readonly Diagnostic[],
  window: SourceRange,
  construct: SourceRange,
): boolean {
  const overlaps = (d: Diagnostic): boolean =>
    d.severity === "error" &&
    d.range !== undefined &&
    positionBefore(d.range.start, window.end) &&
    positionBefore(window.start, d.range.end);
  const containedInConstruct = (d: Diagnostic): boolean =>
    d.range !== undefined &&
    !positionBefore(d.range.start, construct.start) &&
    !positionBefore(construct.end, d.range.end);
  return (
    prior.some(overlaps) ||
    own.some(
      (d) => d.code !== UNRESOLVED_NAMED_TYPE_CODE && overlaps(d) && containedInConstruct(d),
    )
  );
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
  // decl brands nothing at runtime either —
  // src/runtime/lexical-environment.ts:383–389).
  out.push(...checkSchemaDeclarationGraph(body.statements, typeNames, file));
  return out;
}

/** Push a checker's optional diagnostic result, dropping `undefined`. */
function pushDiag(out: Diagnostic[], diag: Diagnostic | undefined): void {
  if (diag !== undefined) {
    out.push(diag);
  }
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
    for (const arm of s.arms) {
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
      s.arms.length >= 2 && s.arms.every((arm) => isObjectSchemaArm(arm, objectFields))
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
      s.arms.join(" | "),
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
    // shared decline (`isUnspellableTextRefusable`, params.ts) does not admit,
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
        const annotationDiagStart = out.length;
        out.push(
          ...parseTypeExpression(s.annotation, "value", { file, range: s.range }),
        );
        // bug 0124 §Fix, guard 1 (bug 0061's landed guard 1, PER-ANNOTATION
        // window): an annotation whose own walk above already drew an
        // error-severity diagnostic keeps that diagnostic ALONE.
        if (
          !out.slice(annotationDiagStart).some((d) => d.severity === "error") &&
          annotationSourceIsNotTypeExpression(s.annotation)
        ) {
          out.push(annotationTypeNotExpressionDiagnostic(s.name, s.range, file));
        }
        // bug 0262 §Fix: the `let` annotation is a further `NamedType`-
        // resolution position — reference r1 of the reference-position table,
        // reaching r4 and r6's interiors (a generic argument, a union arm)
        // through the same `collectUnresolvedNamedTypes` walk the five already-
        // wired captures use. Withheld under three conditions: clause (iv)(2)
        // when this same text is ALSO propagating onto a bare-query
        // initialiser (the `@<T>` arm is that text's sole emitter, bug 0093);
        // the landed guard-1 shape when this capture's own walk above already
        // drew an error (including the not-a-type-expression push immediately
        // above); and clause (iv)(3), gated on `s.annotationAbsorbed`, when the
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
        if (
          !propagatedToQuery(refs, { kind: "let", range: s.range }) &&
          !out.slice(annotationDiagStart).some((d) => d.severity === "error") &&
          !(
            (s.annotationAbsorbed ?? false) &&
            captureWindowAlreadyRefused(
              refs.priorDiagnostics,
              out,
              captureAbsorptionWindow(s.range, s.init),
              s.range,
            )
          )
        ) {
          const letReservedKeywords: string[] = [];
          const letUnresolved = collectUnresolvedNamedTypes(
            s.annotation,
            withBuiltinErrorModelNames(refs.typeNames),
            letReservedKeywords,
          );
          for (const keyword of letReservedKeywords) {
            out.push(reservedKeywordAsIdentifierDiagnostic(keyword, s.range, file));
          }
          for (const name of letUnresolved) {
            out.push(unresolvedNamedTypeDiagnostic(name, s.range, file));
          }
        }
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
      for (const [paramIndex, p] of s.params.entries()) {
        if (p.type.length > 0) {
          const paramDiagStart = out.length;
          out.push(
            ...parseTypeExpression(p.type, "value", { file, range: s.range }),
          );
          // bug 0124 §Fix, guard 1: this PARAMETER's own walk above, not the
          // parameter list's collectively.
          if (
            !out.slice(paramDiagStart).some((d) => d.severity === "error") &&
            annotationSourceIsNotTypeExpression(p.type)
          ) {
            out.push(annotationTypeNotExpressionDiagnostic(p.name, s.range, file));
          }
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
          if (
            !propagatedToQuery(refs, {
              kind: "fn-param",
              range: s.range,
              paramIndex,
            }) &&
            !out.slice(paramDiagStart).some((d) => d.severity === "error") &&
            !(
              (p.typeAbsorbed ?? false) &&
              captureWindowAlreadyRefused(refs.priorDiagnostics, out, fnHeaderWindow(s), s.range)
            )
          ) {
            const paramReservedKeywords: string[] = [];
            const paramUnresolved = collectUnresolvedNamedTypes(
              p.type,
              withBuiltinErrorModelNames(refs.typeNames),
              paramReservedKeywords,
            );
            for (const keyword of paramReservedKeywords) {
              out.push(reservedKeywordAsIdentifierDiagnostic(keyword, s.range, file));
            }
            for (const name of paramUnresolved) {
              out.push(unresolvedNamedTypeDiagnostic(name, s.range, file));
            }
          }
        }
      }
      if (s.returnType !== null && s.returnType.length > 0) {
        const returnDiagStart = out.length;
        out.push(
          ...parseTypeExpression(s.returnType, "return", {
            file,
            range: s.range,
          }),
        );
        // bug 0124 §Fix, guard 1: the return slot's own walk above.
        if (
          !out.slice(returnDiagStart).some((d) => d.severity === "error") &&
          annotationSourceIsNotTypeExpression(s.returnType)
        ) {
          out.push(annotationTypeNotExpressionDiagnostic(s.name, s.range, file));
        }
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
        if (
          !propagatedToQuery(refs, { kind: "fn-return", range: s.range }) &&
          !out.slice(returnDiagStart).some((d) => d.severity === "error") &&
          !(
            (s.returnTypeAbsorbed ?? false) &&
            captureWindowAlreadyRefused(refs.priorDiagnostics, out, fnHeaderWindow(s), s.range)
          )
        ) {
          const returnReservedKeywords: string[] = [];
          const returnUnresolved = collectUnresolvedNamedTypes(
            s.returnType,
            withBuiltinErrorModelNames(refs.typeNames),
            returnReservedKeywords,
          );
          for (const keyword of returnReservedKeywords) {
            out.push(reservedKeywordAsIdentifierDiagnostic(keyword, s.range, file));
          }
          for (const name of returnUnresolved) {
            out.push(unresolvedNamedTypeDiagnostic(name, s.range, file));
          }
        }
      }
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
 * `checkObjectExpr`'s constructor-position classification (`:8342–:8375`)
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
        const invokeDiagStart = out.length;
        out.push(
          ...parseTypeExpression(
            e.returnSchema,
            "value",
            { file, range: e.range },
            "inline-object-shape",
          ),
        );
        if (
          !out.slice(invokeDiagStart).some((d) => d.severity === "error") &&
          !(
            (e.returnSchemaAbsorbed ?? false) &&
            captureWindowAlreadyRefused(
              refs.priorDiagnostics,
              out,
              captureAbsorptionWindow(e.range, e.args[0]),
              e.range,
            )
          )
        ) {
          const invokeReservedKeywords: string[] = [];
          const invokeUnresolved = collectUnresolvedNamedTypes(
            e.returnSchema,
            withBuiltinErrorModelNames(refs.typeNames),
            invokeReservedKeywords,
          );
          for (const keyword of invokeReservedKeywords) {
            out.push(reservedKeywordAsIdentifierDiagnostic(keyword, e.range, file));
          }
          for (const name of invokeUnresolved) {
            out.push(unresolvedNamedTypeDiagnostic(name, e.range, file));
          }
        }
      }
      for (const arg of e.args) {
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
 * malformed-interpolation path where `parseExpressionSource` returns `null` and
 * the AST walk is unavailable. `match` is a reserved keyword and `@` a punct, so
 * a token match is unambiguous (never a string-literal false positive). Returns
 * `"match"` / `"@-query template"` for the first such token, else `null`.
 */
function firstForbiddenInterpolationToken(source: string): string | null {
  const lex = lexTheta(
    { path: "<interpolation>", bytes: encodeSource(source) },
    {
      pi: { sendMessage: () => {} },
      ui: { notify: () => {} },
      emitDiagnostic: () => {},
    },
  );
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
  for (const child of interpolationChildExprs(e)) {
    const found = firstForbiddenInterpolationForm(child);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

/** The direct child expressions of `e` (for the interpolation-form scan). */
function interpolationChildExprs(e: Expr): readonly Expr[] {
  switch (e.kind) {
    case "binary":
      return [e.left, e.right];
    case "ternary":
      return [e.condition, e.consequent, e.alternate];
    case "try":
      return [e.operand];
    case "call":
    case "invoke":
      return e.args;
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
      return expr.args.some(typedQueryInExpr);
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
