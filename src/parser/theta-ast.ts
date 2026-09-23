// Whole-document AST node types and parser contracts shared by parser consumers.

import type { Diagnostic, SourceRange } from "../diagnostics/diagnostic";
import type { SystemNoteChannelDeps } from "../extension/system-note-channel";
import type {
  ModelReferenceMatcher,
  ParsedFrontmatter,
  ParsedToolLoop,
  ParsedRespondRepair,
} from "./frontmatter";
import type { ImportSpecifier } from "./imports";
import type { EnumVariantDecl } from "./schema-declarations";

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
  /**
   * The call-site `with { cwd: … }` options clause (grammar.md
   * `#call-site-with-clause`), absent when unwritten. Optional for the same
   * reason `QueryExpr.ascriptionWritten` is: committed tests
   * construct `kind: "call"` literals directly, and a required field would red
   * their typecheck for zero behavioural gain.
   */
  readonly withClause?: CallWithClause;
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
  /**
   * The call-site `with { cwd: … }` options clause (grammar.md
   * `#call-site-with-clause`), absent when unwritten — `invoke(...)` is the
   * second of the clause's two legal surfaces (invocation.md INV-8). Optional
   * for the same directly-constructed-literal reason as `CallExpr.withClause`.
   */
  readonly withClause?: CallWithClause;
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
   * one statement. Optional rather than required: committed test files
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
 * One field of a CALL-SITE `with { … }` options clause (grammar.md
 * `#call-site-with-clause` `CallWithField`). Deliberately distinct from the
 * declaration-site `WithField` — the grammar's "the two productions do
 * not share nonterminals" rule mirrored in the AST: the value here is a FULL
 * expression evaluated at call time (invocation.md INV-6), not a
 * frontmatter-shaped literal, and a key outside the closed set is a parse
 * ERROR (`theta/parse/with-clause-unknown-key`) rather than the
 * declaration-site's forward-compatible frontmatter warning.
 */
export interface CallWithField {
  /** The field key as written (closed set `{cwd}` in theta 1.3; judged at parse). */
  readonly key: string;
  /** The key token's range — the unknown-key diagnostic's anchor. */
  readonly keyRange: SourceRange;
  /** The value expression (full expression grammar; brace-suppression cleared). */
  readonly value: Expr;
}

/**
 * A call-site `with { cwd: Expr }` options clause (grammar.md
 * `#call-site-with-clause`; invocation.md `#options-surface`).
 */
export interface CallWithClause {
  readonly fields: readonly CallWithField[];
  /** Spans the `with` keyword through the closing `}`. */
  readonly range: SourceRange;
}

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
   * CAVEAT — what "top-level" means to the split. `splitTopLevel` (type-text-split.ts)
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
   * transformation; grammar.md:204 for the alias form). Lowering and placement
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
   * value (runtime-value-model.md, enum row). `parseEnum` always writes it —
   * empty (`[]`) for a non-`{ … }` enum shape the body parser could not read;
   * absent only on a hand-built literal that omits it.
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
   * retains non-string explicit values so they can be rejected. `parseEnum`
   * always writes it — empty (`[]`) for a non-`{ … }` enum shape the body
   * parser could not read; absent only on a hand-built literal that omits it.
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
