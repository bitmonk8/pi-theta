// V20c — type-layer diagnostics production wiring.
//
// This module wires the existing `type`-phase checkers (Bucket A: "checkers now
// feedable") to the `V20b` whole-program static-type substrate so they run in
// production. Before this leaf the checkers existed but were never fed a
// per-expression static type in the whole-file parse, so a well-formed-but-ill-
// typed body silently type-checked; this pass walks the parsed `V19a` body,
// asks the `V20b` `StaticTypeInferencePass` for each relevant expression's
// static type (threading a `let`-binding scope so identifier receivers /
// operands resolve), and feeds the checkers, aggregating their diagnostics.
//
// It closes no new spec REQ-ID: each diagnostic is an integration realisation of
// a code-keyed area owned on its original leaf —
//   * `theta/parse/non-boolean-condition` (cka-4, V3a),
//   * `theta/parse/non-array-iterand` (cka-5, V3c),
//   * `theta/parse/question-on-non-result` / `theta/parse/question-outside-result-fn` (V4a),
//   * `theta/parse/array-no-common-type` (V3a), `theta/parse/return-no-common-type` (V3d),
//   * `theta/parse/integer-narrowing` (V2b), `theta/parse/match-arm-type-mismatch` (V4a),
//   * `theta/parse/non-indexable-receiver` (V3a), `theta/parse/non-string-object-index` (V3h),
//   * `theta/parse/non-string-array-join` (V3g),
//   * `theta/parse/mixed-plus-operands` (A5) / `theta/parse/non-orderable-operands`
//     (A6) — the `+` / ordering operand-type checks (expressions.md §"`+`
//     operator", §"Ordering comparisons"),
//   * `theta/parse/unknown-method` (A2) — a member / method access on a built-in
//     receiver type outside the theta 1.0 stdlib surface (expressions.md
//     §"Built-in methods and properties").
//
// A5 / A6 / A2 fire ONLY when the operand / receiver static type is concretely
// resolvable. An operand past the parser's static view (an unresolved
// `NamedType`, a sentinel reference) is left unclassified and deferred to the
// runtime safety net — no `type`-phase diagnostic — mirroring the
// `let-rhs-type-mismatch` "statically resolvable" guard so no valid theta is
// wrongly rejected.
//
// The wiring is constructor-free and holds no module-level mutable state: it
// builds a fresh `V20b` pass, type environment, and binding scope per parse.
//
// Spec (narrative): expressions.md, control-flow.md, functions.md,
// type-system.md, runtime-value-model.md.

import type { Diagnostic } from "../diagnostics/diagnostic";
import type {
  ArrayExpr,
  Block,
  CallExpr,
  Expr,
  FnDecl,
  FnParam,
  IfStmt,
  ObjectFieldNode,
  PatternNode,
  SchemaFieldSource,
  ThetaBody,
  Stmt,
} from "./theta-document";
import { parseExpressionSource } from "./theta-document";
import {
  INTERPOLATED_RESULT_CODE,
  INTERPOLATED_RESULT_MESSAGE,
  lexQueryTemplate,
} from "../render/query-render";
import {
  checkCompatible,
  checkCommonType,
  checkFnArgCompat,
  checkLetRhsCompat,
  checkObjectFieldCompat,
  displayType,
  resolveNamed,
  unfoldAlias,
  type CompatType,
  type NamedDecl,
  type PrimitiveName,
  type TypeEnv,
} from "./type-compat";
import { BOOLEAN_BINARY_OPS, StaticTypeInferencePass } from "./static-type-inference";
import {
  checkBooleanPosition,
  checkIndexReceiver,
} from "../runtime/expression-evaluator";
import { checkForIterand } from "./control-flow";
import { STRING_MEMBERS } from "../runtime/stdlib-string";
import { ARRAY_MEMBERS } from "../runtime/stdlib-array";
import { OBJECT_MEMBERS } from "../runtime/stdlib-object";
import {
  checkMatchArmTypes,
  checkQuestionOperand,
  checkQuestionScope,
  type EnclosingReturnScope,
  type QuestionOperandType,
} from "./match-result";
import { resolveReturnType, type ReturnContribution } from "./functions";
import { checkInvokeReturnType } from "./invoke-diagnostics";
import { checkArrayJoin } from "../runtime/stdlib-array";
import { checkObjectIndex } from "../runtime/stdlib-object";

/** The primitive type names an annotation string can name directly. */
const PRIMITIVE_NAMES: ReadonlySet<string> = new Set([
  "string",
  "number",
  "integer",
  "boolean",
  "null",
]);

/** The four ordering operators (expressions.md §"Ordering comparisons"). */
const ORDERING_OPS: ReadonlySet<string> = new Set(["<", "<=", ">", ">="]);

/**
 * The additive-operand category of a static type, for the `+` (A5) and ordering
 * (A6) operand-type checks:
 *
 *   - `"numeric"` — a `number` / `integer` (prim or literal);
 *   - `"string"`  — a `string` (prim or literal);
 *   - `"other"`   — a concretely-resolvable but non-additive/non-orderable type
 *                   (`boolean`, `null`, an enum/object schema, a union, an
 *                   inline object, or `array<T>`);
 *   - `"unknown"` — statically unresolvable past the parser's view (an
 *                   unresolved `NamedType`): deferred to the runtime safety net.
 */
type OperandCategory = "numeric" | "string" | "other" | "unknown";

function classifyOperand(type: CompatType, env: TypeEnv): OperandCategory {
  switch (type.kind) {
    case "prim":
      if (type.name === "number" || type.name === "integer") {
        return "numeric";
      }
      return type.name === "string" ? "string" : "other";
    case "literal":
      if (type.typesAs === "number" || type.typesAs === "integer") {
        return "numeric";
      }
      return type.typesAs === "string" ? "string" : "other";
    case "array":
    case "object":
    case "union":
      return "other";
    case "named": {
      const decl = resolveNamed(env, type.name);
      if (decl === undefined) {
        return "unknown";
      }
      if (decl.kind === "object-schema") {
        return "other";
      }
      // A transparent alias (TYPE-11): classify its resolved RHS.
      return classifyOperand(decl.rhs, env);
    }
  }
}

/**
 * The built-in receiver classification for the A2 `unknown-method` check. A
 * receiver whose static type resolves to a concrete built-in (`string`,
 * `array`, `object`, or a member-less primitive) is gated against the stdlib
 * surface; a `"unknown"` receiver (an unresolved `NamedType`, a union) is
 * deferred to the runtime safety net.
 */
type BuiltinReceiver =
  | "string"
  | "array"
  | "object"
  | "number"
  | "integer"
  | "boolean"
  | "null"
  | "unknown";

function classifyReceiver(type: CompatType, env: TypeEnv): BuiltinReceiver {
  switch (type.kind) {
    case "prim":
      return type.name;
    case "literal":
      return type.typesAs;
    case "array":
      return "array";
    case "object":
      return "object";
    case "union":
      return "unknown";
    case "named": {
      const decl = resolveNamed(env, type.name);
      if (decl === undefined) {
        return "unknown";
      }
      if (decl.kind === "object-schema") {
        return "object";
      }
      return classifyReceiver(decl.rhs, env);
    }
  }
}

/**
 * The theta 1.0 stdlib member allow-list for a concrete built-in receiver. A
 * member-less receiver (`number` / `integer` / `boolean` / `null`) exposes no
 * members, so any member / method access on it is `theta/parse/unknown-method`.
 */
function builtinMembers(kind: BuiltinReceiver): ReadonlySet<string> {
  switch (kind) {
    case "string":
      return STRING_MEMBERS;
    case "array":
      return ARRAY_MEMBERS;
    case "object":
      return OBJECT_MEMBERS;
    default:
      return EMPTY_MEMBERS;
  }
}

const EMPTY_MEMBERS: ReadonlySet<string> = new Set();

/**
 * The walk context threaded down each block: the enclosing scope a `?` early-
 * returns from, for the `theta/parse/question-outside-result-fn` scope check.
 */
interface WalkCtx {
  readonly returnScope: EnclosingReturnScope;
}

/**
 * One frontmatter `params:` field, as `checkTypeLayer` needs it: the field's
 * body-visible identifier (the `params:` YAML key a body read spells) beside
 * its declared type SOURCE, verbatim (bug 0192 §Fix (a)). ONE record array,
 * not a name array and a type array as two parallel parameters: the name
 * channel (`collectLocalBinderNames`) and the type channel (the seeded root
 * `bindings` map, `paramsFieldBindings`) are then guaranteed to agree on which
 * identifier a field binds, where two parallel parameters could be fed from
 * two different projections and drift out of step silently.
 */
export interface ParamsFieldSource {
  /** The field's body-visible identifier. */
  readonly name: string;
  /** The field's declared type source, verbatim. */
  readonly typeSource: string;
}

/**
 * Run the wired `type`-phase checkers over a parsed `V19a` body, returning the
 * aggregated (unsorted; the caller sorts through `assembleDiagnostics`) type-
 * layer diagnostics. Consumes the `V20b` per-expression static-type lookup.
 *
 * `paramsFields` is the frontmatter `params:` field records — each field's
 * body-visible identifier beside its declared type source
 * (`./theta-document.ts`: `frontmatter?.params?.fields ?? []`, projected from
 * `BypassParamsField`'s `wireName` / `type`), threaded in by explicit
 * dependency injection. Two channels are derived from these same records
 * (bug 0192 §Fix):
 *
 *   - the NAME half feeds `collectLocalBinderNames` exactly as it did before
 *     this parameter carried a type — bug 0050 §Fix's shadowing / callee-
 *     resolution `Set<string>` is unchanged, so a frontmatter parameter still
 *     counts as a local binder too;
 *   - the TYPE half seeds the root `bindings` map the top-level walk starts
 *     from (`paramsFieldBindings`), so a `params:`-declared read carries its
 *     declared `CompatType` into the walk the same way an annotated `fn`
 *     parameter does (`walkFn`).
 *
 * Defaults to `[]` so an existing two-argument caller keeps compiling.
 */
export function checkTypeLayer(
  body: ThetaBody,
  file: string,
  paramsFields: readonly ParamsFieldSource[] = [],
): Diagnostic[] {
  const pass = new StaticTypeInferencePass({ checkCompatible });
  const env = collectTypeEnv(body.statements);
  const fnReturns = collectFnReturnAnnotations(body.statements);
  const fnDecls = collectTopLevelFns(body.statements);
  const importedSymbols = collectImportedSymbols(body.statements);
  const shadowedNames = collectLocalBinderNames(
    body,
    paramsFields.map((f) => f.name),
  );
  // Run the `V20b` read-only whole-program pass in production: it types every
  // statement-level node and validates the substrate composes with the parse.
  pass.infer(body, env);
  const checker = new TypeLayerWalk(
    pass,
    env,
    file,
    fnReturns,
    fnDecls,
    importedSymbols,
    shadowedNames,
  );
  checker.walkBlock(body, paramsFieldBindings(paramsFields), {
    returnScope: { kind: "inferred" },
  });
  return checker.diagnostics;
}

/**
 * Build the whole-file `TypeEnv` from top-level `schema` declarations
 * (bug 0033 §Fix widened this from a two-way to a three-way classification,
 * mirroring `SchemaDecl`'s own AST shape):
 *
 *   - the object form (`SchemaDecl.fields` present) resolves as a nominal
 *     `object-schema` (TYPE-10), carrying its declared field types;
 *   - the alias/union form (`SchemaDecl.arms` present) resolves as a
 *     transparent `alias` (TYPE-11), whose `rhs` is the arms rejoined with
 *     `" | "` and converted through the same `annotationToCompatType` a
 *     `let` annotation gets — a multi-arm union RHS becomes a `union`
 *     `CompatType` whose arms are `named` references to the variants, which
 *     is what makes TYPE-4 (variant-to-union: every `A` of `schema U = A | B`
 *     satisfies `A ⊑ U`) fall out of the EXISTING TYPE-5 union-widening
 *     decision procedure (`decide` in type-compat.ts) composed with this
 *     unfolding, with no new decision-procedure branch;
 *   - the head-only form (neither) keeps the old fallback — a nominal
 *     `object-schema` with no field list, a conservative classification that
 *     never manufactures a spurious `type`-phase reject.
 *
 * An alias that PARTICIPATES IN A CYCLE (`schema X = Y` / `schema Y = X`, the
 * self-reference `schema X = X`, and the legal guarded recursion
 * `schema X = integer | array<X>`) is OMITTED from the env entirely — no entry
 * of any kind. The `⊑` engine's TYPE-11 unfolding (`unfoldAlias` and the four
 * `decide` sites that call it, type-compat.ts) is a total function only over
 * an ACYCLIC alias graph — a cyclic entry makes it loop or recurse forever —
 * and that precondition is made true HERE, at the single construction point
 * every consumer reads, rather than assumed at five consumption points.
 * Termination: `aliasCycleParticipants` removes at least the endpoints of
 * every cycle's back edge, so the alias subgraph the env still carries is
 * acyclic and every walk over it is bounded by its longest chain.
 *
 * OMISSION, not a nominal fallback, is what keeps the guard conservative: an
 * absent name answers `"unknown"` at every `decide` site (type-compat.ts's
 * `resolveNamed`-guarded arms), and `classifyReceiver` / `classifyOperand`
 * defer on it, so a cycle member takes the same silent-and-deferred
 * disposition as any type past the parser's static view and the runtime AJV
 * net remains the only judge. A nominal entry would instead relate by
 * identity alone and REFUSE the load of programs the specification admits:
 * `schema X = integer | array<X>` with `let v: X = 3` is legal under TYPE-11
 * plus TYPE-5 union widening, and a nominal `X` makes that `let` a
 * `theta/parse/let-rhs-type-mismatch`. The cycle's own rejection is
 * unaffected either way — `theta/parse/type-alias-cycle` is emitted by the
 * structural pass (`checkSchemaDeclarationGraph`, theta-document.ts) over the
 * same declarations, whether or not the type layer looks at them, and that
 * pass reports only the pure-alias cycles the language forbids, not the
 * guarded recursion it allows.
 *
 * The constructor-field check (`walkExpr`'s `object` arm, via
 * `TypeLayerWalk.declaredFieldsOf`) skips any declaration whose `TypeEnv`
 * entry is not `object-schema` WITH a field list — an alias/union entry
 * included, since a constructor naming one is rejected upstream
 * (`checkObjectExpr`, bug 0025 §Fix) before this check would matter.
 *
 * Null-prototype (`Object.create(null)`) because a `NamedType` reference
 * carries no case constraint — unlike a declaration position, which
 * `theta/parse/schema-case-mismatch` shields — so a reference may spell an
 * `Object.prototype` own property (`constructor`, `toString`, `valueOf`,
 * `__proto__`, …) verbatim. On an ordinary `{}` a lookup for such a name
 * resolves through the prototype chain to a value that is not a `NamedDecl`,
 * manufacturing a declared type for a name no `schema` statement wrote — a
 * hazard the exported `resolveNamed` (type-compat.ts) also own-key-guards
 * independently at every consumption site, so either defence alone suffices.
 * With no prototype, a declaration literally named `__proto__` becomes an
 * ordinary own property too, instead of replacing the record's prototype.
 */
export function collectTypeEnv(statements: readonly Stmt[]): TypeEnv {
  const env: Record<string, NamedDecl> = Object.create(null) as Record<string, NamedDecl>;
  const aliasRhs = new Map<string, CompatType>();
  for (const stmt of statements) {
    if (stmt.kind === "schema" && stmt.arms !== undefined) {
      const rhs = annotationToCompatType(stmt.arms.join(" | "));
      if (rhs !== undefined) {
        aliasRhs.set(stmt.name, rhs);
      }
    }
  }
  const cyclic = aliasCycleParticipants(aliasRhs);
  for (const stmt of statements) {
    if (stmt.kind === "schema") {
      if (stmt.arms !== undefined) {
        const rhs = aliasRhs.get(stmt.name);
        if (rhs !== undefined && !cyclic.has(stmt.name)) {
          env[stmt.name] = { kind: "alias", rhs };
        }
        continue;
      }
      const fields = collectSchemaFields(stmt.fields);
      env[stmt.name] = {
        kind: "object-schema",
        ...(fields !== undefined ? { fields } : {}),
      };
    }
  }
  return env;
}

/**
 * The `name` the WITHHELD binder entry carries (`recordWithheldBinders`, the one
 * site that mints it): a spelling no `.theta` source can declare, so a read of a
 * binder this layer cannot type is never judged against a declaration that
 * happens to share the binder's own name.
 *
 * UNSPELLABLE AS A KEY by the grammar, not by convention. A `TypeEnv` key is
 * exactly ONE token's text — `parseSchema` takes the declaration's name with a
 * single `this.advance().text` (./theta-document.ts) and `collectTypeEnv` below
 * keys the env by it — and no token text can equal a ten-character run
 * beginning with `<`: an `ident` / `keyword` is `[A-Za-z_][A-Za-z0-9_]*`, a
 * `punct` is one character or a two-character operator from a fixed table, a
 * `number` is digits and `.`, a `string` token's text is the RAW source slice
 * and therefore begins with its own quote, a `newline` / `stmt-sep` is `\n` and
 * `eof` is empty (../lexer/lexer.ts). `resolveNamed` (./type-compat.ts) consults
 * the env with `Object.hasOwn`, so no prototype name answers for it either, and
 * every `⊑` question about it reaches the unresolvable-name arms. The KEY claim
 * does not cover every NAME: an alias's right-hand side or a direct annotation
 * is a source-text slice, not a token, so it CAN carry this text — harmlessly,
 * since that name still fails every `resolveNamed` lookup and only ever defers.
 *
 * A casing rule would not do this job: lexical.md §"Identifiers" scopes
 * lowercase-first to `let` / `let mut` bindings, function parameters, function
 * names and schema field names, which leaves a `for` / `par for` variable and a
 * `match` pattern binder outside it — and an uppercase binder colliding with a
 * declared schema is exactly how the binder's own spelling was judged
 * nominally.
 */
const WITHHELD_BINDER_TYPE_NAME = "<withheld>";

/**
 * Whether `type` was read, in whole or in part, out of a WITHHELD binder entry —
 * the marker for "this position holds a value this layer cannot type".
 *
 * The judgement sinks that consume a raw scope-map read use it to withhold a
 * verdict, which is the discipline `provableArgType`'s identity channel gives
 * the fn-arg row. Two mechanisms make the sentinel's unresolvability
 * insufficient on its own: `checkForIterand` (./control-flow.ts) rejects EVERY
 * non-`array<T>` iterand, resolvable or not; and `decide` (./type-compat.ts)
 * answers `named ⊑ array<…>` and `named ⊑ { … }` structurally under TYPE-7 /
 * TYPE-8 BEFORE it tests whether the name resolves.
 *
 * Recursive because that structural decision recurses: `[x]` against
 * `array<array<integer>>` rests entirely on `x`. Terminating without an `env`,
 * because no alias is unfolded here: the walk is over the finite type tree the
 * inference pass built, never over the alias graph. A declared alias's
 * right-hand side CAN carry this name — it is a source-text slice, not a
 * token — and leaving it unresolved stays sound regardless, because a twin
 * reached through an alias only ever defers, never trips a false verdict.
 */
function containsWithheldBinderType(type: CompatType): boolean {
  switch (type.kind) {
    case "named":
      return type.name === WITHHELD_BINDER_TYPE_NAME;
    case "array":
      return containsWithheldBinderType(type.element);
    case "union":
      return type.arms.some((arm) => containsWithheldBinderType(arm));
    case "object":
      return type.fields.some((field) => containsWithheldBinderType(field.type));
    case "prim":
    case "literal":
      return false;
  }
}

/**
 * The declared return-type annotation of every top-level `fn` that wrote one,
 * keyed by name (bug 0079 §Fix (a)). This is the static gate's only source for
 * a callee's declared `Result`-ness: `TypeEnv` (type-compat.ts) holds `schema`
 * declarations only, and a `call` node's inferred type is its callee's bare
 * NAME (static-type-inference.ts), never its declared return type — so an
 * annotated `fn`'s `Result<…>` return is otherwise invisible past the call
 * site. Top-level only, mirroring `collectFns` (query-schema-resolve.ts): a
 * nested `fn`'s return annotation is not this gate's concern.
 */
function collectFnReturnAnnotations(statements: readonly Stmt[]): ReadonlyMap<string, string> {
  const fnReturns = new Map<string, string>();
  for (const stmt of statements) {
    if (stmt.kind === "fn" && stmt.returnType !== null) {
      fnReturns.set(stmt.name, stmt.returnType);
    }
  }
  return fnReturns;
}

/**
 * Every top-level `fn` declaration — ordinary and `subagent fn` alike — keyed
 * by name: the callee-resolution table `TypeLayerWalk`'s `checkFnCallArgs`
 * consults, the parse-time counterpart of the runtime's `resolveUserFn`
 * (`../runtime/statement-executor.ts`) hoisted-`fn` arm. A `Map`, read with
 * `Map.get` and an explicit `!== undefined` test — a callee is
 * author-controlled source text, the 0031/0038 null-prototype hazard class,
 * never a plain object and never a truthiness test.
 */
function collectTopLevelFns(statements: readonly Stmt[]): ReadonlyMap<string, FnDecl> {
  const fns = new Map<string, FnDecl>();
  for (const stmt of statements) {
    if (stmt.kind === "fn") {
      fns.set(stmt.name, stmt);
    }
  }
  return fns;
}

/**
 * The LOCAL binding names of every `import` declaration: the `as`-alias where
 * one is written, else the source name — `ImportDecl.symbols` already
 * resolves this. An `export … from` specifier binds no local name
 * (imports.md §"Re-exports") and is excluded, mirroring `collectIdentRoots`'s
 * and `checkLexicalCallSites`'s own import-arm-only reading of
 * expressions.md §"Identifier resolution" arm (3).
 */
function collectImportedSymbols(statements: readonly Stmt[]): ReadonlySet<string> {
  const symbols = new Set<string>();
  for (const stmt of statements) {
    if (stmt.kind === "import") {
      for (const sym of stmt.symbols) {
        symbols.add(sym);
      }
    }
  }
  return symbols;
}

/**
 * A whole-file over-approximation of every name a LOCAL binder can bind,
 * anywhere in `body`: the frontmatter `params:` field wire names
 * (`paramsFieldNames`), every `let` name, every `for` / `par for` loop
 * variable, every `match`-arm pattern binding, and every `fn` parameter name —
 * including an UNANNOTATED one. Recursive over every statement, block and
 * expression the grammar admits, a nested `fn` body included.
 *
 * expressions.md §"Identifier resolution" ranks `local > fn > import >
 * callable`, so a call of a locally bound name is not a user-`fn` call; but
 * `TypeLayerWalk`'s own `bindings` map is still not a complete local view. A
 * frontmatter `params:` field's declared type reaches it now (bug 0192 §Fix
 * seeds the root map from the same records this function's caller derives
 * `paramsFieldNames` from — `paramsFieldBindings`), but it still holds the
 * binder classes this layer cannot type (a match-arm binding, an unannotated
 * `fn` parameter, a loop variable whose iterand is not an `array<T>` — the
 * `array` case carries the iterand's element type, bug 0126 §Fix) as WITHHELD
 * entries rather than as judged types (`recordWithheldBinders`) — so
 * resolution is withheld for any name bound as a local ANYWHERE in the file.
 * Withholding can only suppress an emission, never produce one, the asymmetry
 * this module's header already states.
 */
function collectLocalBinderNames(
  body: ThetaBody,
  paramsFieldNames: readonly string[],
): ReadonlySet<string> {
  const names = new Set<string>(paramsFieldNames);
  walkBlockForLocalBinders(body, names);
  return names;
}

function walkBlockForLocalBinders(block: Block, names: Set<string>): void {
  for (const stmt of block.statements) {
    walkStmtForLocalBinders(stmt, names);
  }
  if (block.tail !== null) {
    walkExprForLocalBinders(block.tail, names);
  }
}

function walkStmtForLocalBinders(stmt: Stmt, names: Set<string>): void {
  switch (stmt.kind) {
    case "let":
      names.add(stmt.name);
      if (stmt.init !== null) {
        walkExprForLocalBinders(stmt.init, names);
      }
      return;
    case "reassign":
      walkExprForLocalBinders(stmt.value, names);
      return;
    case "if":
      walkExprForLocalBinders(stmt.condition, names);
      walkBlockForLocalBinders(stmt.then, names);
      if (stmt.otherwise !== null) {
        if ("statements" in stmt.otherwise) {
          walkBlockForLocalBinders(stmt.otherwise, names);
        } else {
          walkStmtForLocalBinders(stmt.otherwise, names);
        }
      }
      return;
    case "while":
      walkExprForLocalBinders(stmt.condition, names);
      walkBlockForLocalBinders(stmt.body, names);
      return;
    case "for":
      names.add(stmt.variable);
      walkExprForLocalBinders(stmt.iterand, names);
      walkBlockForLocalBinders(stmt.body, names);
      return;
    case "fn":
      for (const p of stmt.params) {
        names.add(p.name);
      }
      walkBlockForLocalBinders(stmt.body, names);
      return;
    case "return":
      if (stmt.operand !== null) {
        walkExprForLocalBinders(stmt.operand, names);
      }
      return;
    case "query":
      walkExprForLocalBinders(stmt.query, names);
      return;
    case "tool-call":
      walkExprForLocalBinders(stmt.call, names);
      return;
    case "invoke":
      walkExprForLocalBinders(stmt.invoke, names);
      return;
    case "expr":
      walkExprForLocalBinders(stmt.expr, names);
      return;
    default:
      // break / continue / schema / enum / import / export / doc-comment —
      // no local binder, no nested expression.
      return;
  }
}

function walkExprForLocalBinders(expr: Expr, names: Set<string>): void {
  switch (expr.kind) {
    case "ternary":
      walkExprForLocalBinders(expr.condition, names);
      walkExprForLocalBinders(expr.consequent, names);
      walkExprForLocalBinders(expr.alternate, names);
      return;
    case "binary":
      walkExprForLocalBinders(expr.left, names);
      walkExprForLocalBinders(expr.right, names);
      return;
    case "try":
      walkExprForLocalBinders(expr.operand, names);
      return;
    case "array":
      for (const el of expr.elements) {
        walkExprForLocalBinders(el, names);
      }
      return;
    case "index":
      walkExprForLocalBinders(expr.target, names);
      walkExprForLocalBinders(expr.index, names);
      return;
    case "member":
      walkExprForLocalBinders(expr.target, names);
      return;
    case "object":
      for (const field of expr.fields) {
        walkExprForLocalBinders(field.value, names);
      }
      return;
    case "match":
      walkExprForLocalBinders(expr.scrutinee, names);
      for (const arm of expr.arms) {
        collectPatternBinderNames(arm.pattern, names);
        walkExprForLocalBinders(arm.body, names);
      }
      return;
    case "result-ctor":
      walkExprForLocalBinders(expr.arg, names);
      return;
    case "method-call":
      walkExprForLocalBinders(expr.target, names);
      for (const arg of expr.args) {
        walkExprForLocalBinders(arg, names);
      }
      return;
    case "call":
    case "invoke":
      for (const arg of expr.args) {
        walkExprForLocalBinders(arg, names);
      }
      return;
    case "par-for":
      names.add(expr.variable);
      walkExprForLocalBinders(expr.iterand, names);
      if (expr.max !== null) {
        walkExprForLocalBinders(expr.max, names);
      }
      walkBlockForLocalBinders(expr.body, names);
      return;
    default:
      // ident / number / string / bool / null — no local binder, no nested
      // expression.
      return;
  }
}

/**
 * Every name a `match` pattern binds, recursively through the constructor /
 * object / array pattern forms. Kept independent of `theta-document.ts`'s own
 * (unexported) `collectPatternBindings`: this fix touches `theta-document.ts`
 * only at the `checkTypeLayer` call site, so that function is not exported to
 * be shared here.
 */
function collectPatternBinderNames(pattern: PatternNode, names: Set<string>): void {
  switch (pattern.kind) {
    case "identifier":
      names.add(pattern.name);
      return;
    case "constructor":
      collectPatternBinderNames(pattern.inner, names);
      return;
    case "object":
      for (const f of pattern.fields) {
        collectPatternBinderNames(f.pattern, names);
      }
      return;
    case "array":
      for (const el of pattern.elements) {
        collectPatternBinderNames(el, names);
      }
      return;
    default:
      // wildcard / literal bind nothing.
      return;
  }
}

/**
 * Alias names whose REMOVAL breaks every cycle of the alias-to-alias reference
 * graph — the acyclicity precondition `unfoldAlias` (type-compat.ts) is
 * bounded by. The guarantee is exactly that: the set contains at least the two
 * endpoints of every back edge the DFS below closes, and every cycle in a
 * directed graph carries at least one back edge under any DFS, so no cycle
 * survives the removal. It is NOT the set of every node on every elementary
 * cycle: for `schema A = C | B` / `schema C = A` / `schema B = C` the walk
 * from `A` closes the back edge `C → A` and marks `{A, C}`, leaving `B`
 * unmarked even though `B → C → A → B` is an elementary cycle — that cycle is
 * broken anyway, because `A` and `C` are gone from the env.
 *
 * Edges are the `named` references reachable in an alias's own converted
 * right-hand side (`annotationToCompatType`: union arms, `array<T>` elements,
 * inline-object field types), restricted to names that are themselves aliases:
 * unfolding stops at every other declaration kind, so only alias-to-alias
 * edges can diverge. A chain that merely REACHES a cycle (`schema A = B`,
 * `schema B = C`, `schema C = B`) keeps its transparent entry and unfolds into
 * an omitted member, where the walk stops.
 */
function aliasCycleParticipants(
  aliasRhs: ReadonlyMap<string, CompatType>,
): ReadonlySet<string> {
  const cyclic = new Set<string>();
  const settled = new Set<string>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const visit = (name: string): void => {
    stack.push(name);
    onStack.add(name);
    for (const ref of aliasReferences(aliasRhs.get(name))) {
      if (!aliasRhs.has(ref)) {
        continue;
      }
      if (onStack.has(ref)) {
        // Back-edge: every node from the target up to the current top of the
        // stack lies on the cycle it closes.
        for (const member of stack.slice(stack.indexOf(ref))) {
          cyclic.add(member);
        }
      } else if (!settled.has(ref)) {
        visit(ref);
      }
    }
    onStack.delete(name);
    stack.pop();
    settled.add(name);
  };
  for (const name of aliasRhs.keys()) {
    if (!settled.has(name)) {
      visit(name);
    }
  }
  return cyclic;
}

/** Every `named` reference inside a converted right-hand side, deduped. */
function aliasReferences(rhs: CompatType | undefined): ReadonlySet<string> {
  const names = new Set<string>();
  const walk = (type: CompatType): void => {
    switch (type.kind) {
      case "named":
        names.add(type.name);
        return;
      case "union":
        for (const arm of type.arms) {
          walk(arm);
        }
        return;
      case "array":
        walk(type.element);
        return;
      case "object":
        for (const field of type.fields) {
          walk(field.type);
        }
        return;
      default:
        // prim / literal — no reference to follow.
        return;
    }
  };
  if (rhs !== undefined) {
    walk(rhs);
  }
  return names;
}

/**
 * The declared field-type record for an object-form `schema`'s field list,
 * mapping each `SchemaFieldSource.typeSource` through `annotationToCompatType`
 * — the same conversion a `let` annotation gets, so a schema field and a `let`
 * annotation resolve identically (e.g. both leave an `enum`-typed or
 * literal-union-typed field as an unresolvable `named` reference).
 * `undefined` for the alias / `by … = …` forms, whose declaration carries no
 * object field list (`SchemaDecl.fields` is optional).
 *
 * Null-prototype because a theta field name is unconstrained and may collide
 * with an `Object.prototype` member: on an ordinary `{}` the record would
 * answer a `toString` / `constructor` / `valueOf` lookup through the prototype
 * chain (manufacturing a declared type for an undeclared field), and assigning
 * a field literally named `__proto__` would set the record's prototype instead
 * of creating an own property (losing the declared type). With no prototype,
 * both reads and writes are ordinary own properties.
 */
function collectSchemaFields(
  fields: readonly SchemaFieldSource[] | undefined,
): Readonly<Record<string, CompatType>> | undefined {
  if (fields === undefined) {
    return undefined;
  }
  const out: Record<string, CompatType> = Object.create(null) as Record<string, CompatType>;
  for (const f of fields) {
    const type = annotationToCompatType(f.typeSource);
    if (type !== undefined) {
      out[f.name] = type;
    }
  }
  return out;
}

/**
 * Parse a declared type-annotation source into a `CompatType` for the
 * compatibility checks (the `let`-binding RHS narrowing check and `fn`
 * parameter binding types). Handles the primitive names, top-level unions
 * (`A | B`), and `array<T>`; every other shape (a `NamedType`, an inline object
 * type) resolves to a nominal `named` reference — the same shape the `⊑` engine
 * treats as deferred.
 */
export function annotationToCompatType(src: string): CompatType | undefined {
  const text = src.trim();
  if (text.length === 0) {
    return undefined;
  }
  // Top-level union: split on `|` that is not inside `<…>` brackets.
  const unionArms = splitTopLevelUnion(text);
  if (unionArms.length > 1) {
    const arms = unionArms
      .map((arm) => annotationToCompatType(arm))
      .filter((t): t is CompatType => t !== undefined);
    return arms.length > 0 ? { kind: "union", arms } : undefined;
  }
  const arrayMatch = /^array<(.+)>$/.exec(text);
  if (arrayMatch !== null) {
    const element = annotationToCompatType(arrayMatch[1] ?? "");
    return { kind: "array", element: element ?? { kind: "named", name: "unknown" } };
  }
  if (PRIMITIVE_NAMES.has(text)) {
    return { kind: "prim", name: text as PrimitiveName };
  }
  return { kind: "named", name: text };
}

/**
 * Build the root `bindings` map `checkTypeLayer`'s top-level walk starts from
 * (bug 0192 §Fix): one entry per frontmatter `params:` field, projecting its
 * declared type source onto a `CompatType` through THIS module's own
 * `annotationToCompatType` — the converter `walkFn` seeds an annotated `fn`
 * parameter's scope entry from
 * (`annotationToCompatType(p.type) ?? { kind: "named", name: p.type }`),
 * mirrored here byte-for-byte in shape so the two positions decide identically
 * BY CONSTRUCTION rather than by coincidence over whichever spellings happen
 * to be measured. `paramsDeclaredCompatType` (./type-compat.ts) is
 * deliberately NOT used here: the two converters differ on the
 * `array<T>`-with-declining-element decline path (a nominal-`unknown` element
 * here, `undefined` there), and where they differ the body position follows
 * the `fn`-parameter position — this converter, not that one. A `params:`
 * field always declares a type (unlike a `fn` parameter, which may be
 * unannotated), so every entry is seeded unconditionally — there is no
 * WITHHELD branch to mirror from `walkFn` here.
 *
 * A plain function, not a `TypeLayerWalk` method, so it has no access to
 * `unprovableBindings`: a seeded entry can never be recorded there by
 * construction, which is what keeps a `params:`-declared read a PROOF at the
 * `provableArgType` sink — an author-written annotation IS a declared type,
 * exactly as an annotated `fn` parameter's is (`unprovableBindings`'s own doc
 * comment states the rule this position inherits).
 *
 * Returns a fresh `Map` per call: `TypeLayerWalk.walkBlock` mutates its root
 * argument directly for each top-level `let`, so a shared or cached map would
 * leak bindings across parses.
 */
function paramsFieldBindings(
  fields: readonly ParamsFieldSource[],
): Map<string, CompatType> {
  const bindings = new Map<string, CompatType>();
  for (const field of fields) {
    bindings.set(
      field.name,
      annotationToCompatType(field.typeSource) ?? { kind: "named", name: field.typeSource },
    );
  }
  return bindings;
}

/**
 * Split a type source on top-level `|` (outside any `<…>` bracket depth).
 * Exported so the runtime schema-subset disjointness computation
 * (`../runtime/tool-call.ts` — RFC 0002) reuses this single copy rather than
 * carrying a duplicate; the two must agree on where a top-level union arm begins.
 */
export function splitTopLevelUnion(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === "<") {
      depth += 1;
    } else if (c === ">") {
      depth -= 1;
    } else if (c === "|" && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/** Whether a declared return-type source names a `Result<…>` type. */
function isResultAnnotation(src: string): boolean {
  return /^Result\b/.test(src.trim());
}

/**
 * Whether a type NAME spells the GENERIC `Result<…>` form. Deliberately
 * narrower than `isResultAnnotation` above, which reads an author's WRITTEN
 * annotation: this predicate reads a name `static-type-inference.ts` minted,
 * and that mint draws on author-controlled identifiers (an enum variant, an
 * object field, a callee, a schema). `<` cannot occur in an identifier, so
 * demanding it makes the acceptance unambiguous by construction, where the bare
 * `Result` that `isResultAnnotation`'s `\b` admits would not be.
 */
function isResultGenericTypeName(name: string): boolean {
  return /^Result</.test(name.trim());
}

/**
 * A per-parse walk feeding the wired `type`-phase checkers. Holds only per-parse
 * state (the injected pass, the type env, the file, the callee-resolution
 * tables, the accumulated diagnostics) — no module-level mutable state.
 */
class TypeLayerWalk {
  public readonly diagnostics: Diagnostic[] = [];

  /**
   * The type objects recorded for `let` bindings whose initialiser is a
   * `Result` by construction — the bug-0079 §Fix (a) ident provenance channel,
   * keyed by OBJECT IDENTITY (the WHY is at the `let` arm that populates it).
   * `bindLoopElement` is the channel's second writer, and writes only to
   * INHERIT a membership onto the twin it records for an unproven loop variable
   * — never to mint one, so the `let` arm remains the sole judge of what is
   * `Result`-valued. Per-parse instance state, like `diagnostics`.
   */
  private readonly resultBindings = new Set<CompatType>();

  /**
   * The type objects recorded for a binding whose recorded type is an ERASED
   * read rather than a declared one — the bug-0050 §Fix laundered-binding
   * channel. FOUR writers: `walkStmt`'s unannotated `let` arm (the
   * initialiser's own read); the two loop arms — `walkStmt`'s `case "for"` and
   * `walkExpr`'s `case "par-for"` — through the shared `bindLoopElement` (the
   * iterand's element read); and `recordWithheldBinders`, for a binder class
   * this layer cannot type at all (it marks the sentinel it mints). Keyed by
   * OBJECT IDENTITY for the same reason `resultBindings` above is:
   * `bindings.get(name)` returns the exact object the recording arm stored, so
   * identity is the channel back to an erasure a name lookup alone cannot see.
   * `bindLoopElement` is what keeps that exactness true at the two loop arms:
   * `unfoldAlias` (./type-compat.ts) hands back a `TypeEnv` alias's element BY
   * REFERENCE, and `collectTypeEnv`, `collectSchemaFields` and
   * `paramsFieldBindings` each build exactly one such object per alias
   * declaration, per declared schema field, or per `params:` field, for the
   * WHOLE parse — so it marks a fresh twin instead of that borrowed object,
   * keeping the marked object reachable from exactly one scope entry (bug 0194
   * §Fix). `walkFn`'s parameter scope feeds nothing here — an author-written
   * annotation IS a declared type, so it is a proof. `provableArgType`'s
   * `ident` arm withholds on a hit; a false identity hit only withholds, never
   * fabricates an emission. Per-parse instance state, like `diagnostics`.
   */
  private readonly unprovableBindings = new Set<CompatType>();

  /**
   * `fnDecls`, `importedSymbols` and `shadowedNames` are `checkFnCallArgs`'s
   * (bug 0050 §Fix) callee-resolution tables — computed once per parse by
   * `checkTypeLayer` and passed in here, the same explicit-injection shape as
   * the four dependencies above them.
   */
  public constructor(
    private readonly pass: StaticTypeInferencePass,
    private readonly env: TypeEnv,
    private readonly file: string,
    private readonly fnReturns: ReadonlyMap<string, string>,
    private readonly fnDecls: ReadonlyMap<string, FnDecl>,
    private readonly importedSymbols: ReadonlySet<string>,
    private readonly shadowedNames: ReadonlySet<string>,
  ) {}

  /** The static type the `V20b` pass assigns `expr` under the in-scope bindings. */
  private typeOf(expr: Expr, bindings: ReadonlyMap<string, CompatType>): CompatType {
    return this.pass.typeOf(expr, this.env, bindings);
  }

  /**
   * Walk a block's statements (accumulating `let` bindings into `bindings`) then
   * its tail expression. `bindings` is this block's own scope: nested blocks
   * receive a copy so inner `let`s do not leak outward.
   */
  public walkBlock(block: Block, bindings: Map<string, CompatType>, flow: WalkCtx): void {
    for (const stmt of block.statements) {
      this.walkStmt(stmt, bindings, flow);
    }
    if (block.tail !== null) {
      this.walkExpr(block.tail, bindings, flow);
    }
  }

  private walkStmt(stmt: Stmt, bindings: Map<string, CompatType>, flow: WalkCtx): void {
    switch (stmt.kind) {
      case "let": {
        if (stmt.init !== null) {
          const rhsType = this.typeOf(stmt.init, bindings);
          // Resolved once, ahead of both uses below: the initialiser
          // compatibility check and the recorded binding type. An
          // unresolvable source (`annotationToCompatType` → `undefined`)
          // falls back to `rhsType` in both places, so a name the type
          // environment cannot resolve never turns into a hole (bug 0083).
          const annotation =
            stmt.annotation !== null && stmt.annotation.length > 0
              ? annotationToCompatType(stmt.annotation)
              : undefined;
          // A read carrying a WITHHELD binder anywhere inside it supports no
          // verdict here: an annotation of `array<T>` or of an inline object
          // type is decided STRUCTURALLY by `decide` (TYPE-7 / TYPE-8, before
          // its `resolveNamed` arms), so the deferral an unresolvable name earns
          // against a primitive annotation is unavailable against a structural
          // one, and the withheld part can be the whole basis of the answer.
          // The declared type is still RECORDED below — an annotation is the
          // author's own claim about the position, and the runtime AJV net is
          // what judges the value that arrives.
          if (annotation !== undefined && !containsWithheldBinderType(rhsType)) {
            // The typed-binding RHS narrowing / mismatch check (surfaces
            // `theta/parse/integer-narrowing` for a `number → integer` RHS).
            this.diagnostics.push(
              ...checkLetRhsCompat({
                name: stmt.name,
                annotation,
                rhs: rhsType,
                env: this.env,
                site: { file: this.file, range: stmt.range },
              }),
            );
            // A typed array literal is checked against the annotation's
            // element sink here, so the generic (sink-less) array check does
            // not re-flag a validly-annotated union array.
            if (stmt.init.kind === "array" && annotation.kind === "array") {
              this.checkArrayLiteral(stmt.init, annotation.element, bindings);
            }
          }
          // Walk the initialiser for nested checks. A typed array already
          // checked against its element sink above is skipped by the walk.
          this.walkExpr(stmt.init, bindings, flow, this.sinkedArrayOf(stmt, annotation));
          // Record the declared type, not merely the initialiser's inferred
          // one: `checkLetRhsCompat` above has already verified the
          // initialiser against it, so later identifier references seeing the
          // annotation instead admit nothing unchecked (bug 0083).
          //
          // Recorded in its TYPE-11-transparent form, because that IS the
          // declared type: `schema L = array<string>` makes `L` and
          // `array<string>` the same type, and the structural gates reading
          // this map off an identifier (the `for` / `par for` iterand
          // contract, the `array.join` element precondition) test `kind`
          // directly rather than through the alias-unfolding `⊑` engine.
          // `unfoldAlias` leaves an object-schema `named` nominal (TYPE-10)
          // and an unresolvable `named` intact.
          //
          // Whether the initialiser is a PROVEN read of the value type it
          // produces is decided FIRST, while `bindings` still holds the OUTER
          // binding for `stmt.name`: that is the scope the initialiser is
          // evaluated in. The runtime evaluates it and only then defines the
          // binding (`evalExpr(stmt.init, env)` then `env.defineLocal`,
          // ../runtime/statement-executor.ts), so a self-reference inside a
          // shadowing `let`'s initialiser reads the OUTER value — marked in
          // `unprovableBindings` when that outer binding was itself laundered,
          // and a proof when it was not. Deciding it after the `bindings.set`
          // instead would resolve that self-reference to the type object this
          // arm is in the middle of recording, which no marking has reached, and an
          // erased outer binding would launder into a proven record (`let x =
          // 1 + x` over an erased `x`).
          //
          // Only an unannotated `let` is ever marked — the reason is at the
          // marking site below — and `&&` short-circuits, so an annotated one
          // reaches no proof obligation at all.
          const initUnprovable =
            annotation === undefined && this.provableArgType(stmt.init, bindings) === undefined;
          bindings.set(
            stmt.name,
            annotation === undefined ? rhsType : unfoldAlias(annotation, this.env),
          );
          if (annotation === undefined && this.isCertainResultNode(stmt.init)) {
            // Bug 0079 §Fix (a) — remember this binding's `Result`-ness by the
            // IDENTITY of the type object recorded above, never by its name.
            // `CompatType` has no `Result` shape, so a `Result` binding records
            // a `named` reference whose name (`Ok` / `Err` / a callee) an enum
            // variant, a field, or a plain `fn` can spell equally well; the
            // object `#typeExpr` minted for THIS initialiser is unique to it.
            // `#typeExpr`'s `ident` arm returns the very object `bindings`
            // holds, and each nested scope's `new Map(bindings)` copies the
            // same references, so shadowing and scope exit come out right with
            // no name-keyed side table — which would misread the `r` of
            // `let r = 5` / `if c { let r = Ok(1) }` / `${r}` as a `Result`.
            // An annotated binding is excluded because the annotation IS its
            // recorded type: a written `Result<…>` is caught by the generic-name
            // acceptance instead, and any other annotation is the author
            // declaring a non-`Result`.
            this.resultBindings.add(rhsType);
          }
          if (initUnprovable) {
            // The laundered-binding hole (bug 0050 §Fix): `rhsType`, already
            // bound to `stmt.name` above, is the initialiser's own ERASED
            // read when the initialiser itself is unprovable (an unannotated
            // `let x = flag ? 1 : "a"` records `integer` after discarding the
            // `string` arm). A later `g(x)` must not read that recorded type
            // as a proof it never was. An ANNOTATED `let` is excluded because
            // the annotation IS the recorded type and `checkLetRhsCompat`
            // above already judges its initialiser, so it stays a proof.
            this.unprovableBindings.add(rhsType);
          }
        }
        return;
      }
      case "reassign":
        this.walkExpr(stmt.value, bindings, flow);
        return;
      case "if":
        this.checkBoolean(stmt.condition, "if", bindings);
        this.walkExpr(stmt.condition, bindings, flow);
        this.walkBlock(stmt.then, new Map(bindings), flow);
        this.walkOtherwise(stmt.otherwise, bindings, flow);
        return;
      case "while":
        this.checkBoolean(stmt.condition, "while", bindings);
        this.walkExpr(stmt.condition, bindings, flow);
        this.walkBlock(stmt.body, new Map(bindings), flow);
        return;
      case "for": {
        // `checkForIterand` refuses every non-`array<T>` iterand, an
        // unresolvable `named` included (../parser/control-flow.ts), so it is
        // the one row that cannot defer on a withheld read by itself: the
        // verdict is withheld here instead. A `for` body inside another binder's
        // scope reaches this with the enclosing binder's withheld entry.
        const iterandType = this.typeOf(stmt.iterand, bindings);
        const diag = containsWithheldBinderType(iterandType)
          ? undefined
          : checkForIterand(
              { type: iterandType },
              { file: this.file, range: stmt.iterand.range },
              this.env,
            );
        if (diag !== undefined) {
          this.diagnostics.push(diag);
        }
        this.walkExpr(stmt.iterand, bindings, flow);
        const inner = new Map(bindings);
        // control-flow.md §`for` … `in` binds the iteration variable "as a
        // fresh immutable local per iteration", and `executeFor` binds it
        // whatever the element holds (`env.bindIterationVariable`,
        // ../runtime/statement-executor.ts), so the name is recorded in the
        // BODY scope here: leaving it unrecorded lets a body read resolve to a
        // same-named enclosing binding the runtime does not read at that
        // position. The same paragraph gives the iterand the type `array<T>`
        // and the loop variable that same `T` (bug 0126 §Fix), so the record
        // below is the (TYPE-11-unfolded) iterand's element — an alias of
        // `array<T>` supplies the same `T` the concrete array type does,
        // exactly as the admissibility gate above already requires. A
        // non-`array` iterand withholds instead of adopting a nominal: the
        // gate above has already refused it at its own span (or deferred, when
        // the iterand is itself withheld), and a minted unresolvable name
        // would be judged structurally at the sinks that refuse unresolvables
        // — measured, it draws a false `theta/parse/non-array-iterand … got
        // unknown` on `fn h(p) { for x in p { for y in x { } } }`, which loads
        // cleanly. The `unprovableBindings` marking, and the reason an
        // unprovable iterand's element is no proof at a judgement sink, are
        // `bindLoopElement`'s — the one step both loop arms share.
        const unfolded = unfoldAlias(iterandType, this.env);
        if (unfolded.kind === "array") {
          this.bindLoopElement(inner, stmt.variable, unfolded.element, stmt.iterand, bindings);
        } else {
          this.recordWithheldBinders(inner, [stmt.variable]);
        }
        this.walkBlock(stmt.body, inner, flow);
        return;
      }
      case "fn":
        this.walkFn(stmt, bindings);
        return;
      case "return":
        if (stmt.operand !== null) {
          this.walkExpr(stmt.operand, bindings, flow);
        }
        return;
      case "query":
        this.walkExpr(stmt.query, bindings, flow);
        return;
      case "tool-call":
        this.walkExpr(stmt.call, bindings, flow);
        return;
      case "invoke":
        this.walkExpr(stmt.invoke, bindings, flow);
        return;
      case "expr":
        this.walkExpr(stmt.expr, bindings, flow);
        return;
      default:
        // schema / enum / import / export / break / continue / doc-comment —
        // no expression to type-check.
        return;
    }
  }

  private walkOtherwise(
    otherwise: IfStmt | Block | null,
    bindings: Map<string, CompatType>,
    flow: WalkCtx,
  ): void {
    if (otherwise === null) {
      return;
    }
    if ("statements" in otherwise) {
      this.walkBlock(otherwise, new Map(bindings), flow);
    } else {
      this.walkStmt(otherwise, new Map(bindings), flow);
    }
  }

  /**
   * Bind `variable`'s loop-element type into `scope`, and mark it in
   * `unprovableBindings` when `iterand` is not a proof — the one step
   * `walkStmt`'s `case "for"` (`unfolded.kind === "array"` branch) and
   * `walkExpr`'s `case "par-for"` both need, called from both so the marking
   * step cannot drift between the two arms. Bug 0194 §Fix (d) constraint 1:
   * the arms mark through the same `unprovableBindings` set and measurably
   * poison each other in both directions, so this step has no discriminating
   * parameter and must move in lock-step across both call sites in one
   * commit — a shared private helper, not two edits.
   *
   * WHY MARK AT ALL: the loop variable inherits the iterand's erasure. An
   * unprovable iterand (`[flag ? 1 : "a"]` reads `array<integer>` after
   * `commonType` discards the `string` arm) hands `element` a reading no
   * runtime iteration need produce, so a body `g(x)` must not treat that
   * reading as a proof at a judgement sink.
   *
   * IDENTITY IS THE RIGHT CHANNEL FOR A MINTED OBJECT, WRONG FOR A BORROWED
   * ONE. `unprovableBindings`'s only read (`provableArgType`'s `ident` arm)
   * tests `bindings.get(name)` against this set BY OBJECT IDENTITY, which is
   * sound exactly when the tested object belongs to the one scope entry the
   * mark was taken for — `recordWithheldBinders` mints that object fresh, so
   * identity is exact there. `element` here is not minted for this call:
   * `unfoldAlias` (./type-compat.ts) hands back a `TypeEnv` alias's
   * right-hand side BY REFERENCE, and `collectTypeEnv`, `collectSchemaFields`
   * and `paramsFieldBindings` each build exactly ONE `CompatType` — per alias
   * declaration, per declared schema field, per `params:` field — for the
   * WHOLE parse, so a borrowed `element` is the very object every LATER
   * reader of that same alias, field or `params:` binding gets back too.
   * Recording and marking a fresh `{ ...element }` instead, scoped to the one
   * loop this call is for, is what makes true what `unprovableBindings`'s own
   * doc comment asserts — "`bindings.get(name)` returns the exact object the
   * recording arm stored" — because the marked object is now reachable from
   * exactly one scope entry, not from every reader of the declaration it was
   * borrowed from.
   *
   * A SHALLOW copy suffices, and the twin must inherit EVERY channel keyed on
   * the identity of the object it copies — a stand-in that stands in on one
   * such channel and not on another is not a stand-in. This file holds exactly
   * two, both `Set<CompatType>` tested against the top-level object
   * `bindings.get(name)` returns; nested identity is consulted on neither,
   * which is what makes a shallow spread enough:
   *
   *   - `unprovableBindings`, read by `provableArgType`'s `ident` arm. The twin
   *     joins it EXPLICITLY below — this method's whole subject.
   *   - `resultBindings`, read by `interpolationIsResult`'s `ident` arm (bug
   *     0079's `Result`-provenance channel). The unannotated `let` arm is its
   *     only FEED, but the READ tests whatever object `bindings` holds for the
   *     interpolated name, and that object can be the one this method copies:
   *     `commonType`'s dominating-candidate clause (./type-compat.ts, reached
   *     through `StaticTypeInferencePass`'s array-literal element derivation)
   *     returns its candidate BY REFERENCE, so `let r = Ok(1)` / `let xs = [r]`
   *     makes `xs`'s element the very object `resultBindings` recorded for
   *     `r`. A twin that did not inherit that membership would flip the read
   *     false and withhold `theta/parse/interpolated-result` for a `${…}` over
   *     the loop variable. Hence the CARRY below: it inherits the membership
   *     rather than severing it, and because it fires only where the copied
   *     object already carried the provenance it can restore no verdict beyond
   *     that object's own and can add no emission.
   *
   * Every VALUE-channel reader (`containsWithheldBinderType`,
   * `checkCompatible`, `displayType`) reads STRUCTURE, and `{ ...element }`
   * is value-equal to `element` by construction — same `kind`, same nested
   * fields — so no value-channel verdict can move either: the typed-`let` sink
   * (`theta/parse/let-rhs-type-mismatch`) judges a copied element exactly as
   * it judges the original.
   *
   * The copy is CONDITIONAL because marking is. Only an unproven iterand
   * reaches `this.unprovableBindings.add`, so a provable loop still records the
   * very object `unfoldAlias` handed it — no copy, no extra allocation, no
   * channel to inherit, no observable change on a provable path.
   *
   * The direction stays ONE-WAY. `unprovableBindings`'s only read feeds a
   * withholding decision (`checkFnCallArgs` skips its row on a hit), never an
   * emission, so changing WHICH object a mark lands on can only RESTORE a
   * true positive some unrelated binding's mark was suppressing — it cannot
   * fabricate an `E` no reader is owed.
   */
  private bindLoopElement(
    scope: Map<string, CompatType>,
    variable: string,
    element: CompatType,
    iterand: Expr,
    bindings: ReadonlyMap<string, CompatType>,
  ): void {
    const unproven = this.provableArgType(iterand, bindings) === undefined;
    const recorded: CompatType = unproven ? { ...element } : element;
    scope.set(variable, recorded);
    if (unproven) {
      this.unprovableBindings.add(recorded);
      if (this.resultBindings.has(element)) {
        this.resultBindings.add(recorded);
      }
    }
  }

  /**
   * Bind `names` in `scope` as WITHHELD locals — the binder classes this layer
   * cannot type, recorded so a body read STOPS at the scope the runtime binds
   * them in.
   *
   * The runtime installs a `for` variable, a `match` pattern binding and a `fn`
   * parameter in an inner scope unconditionally (`bindIterationVariable`,
   * `evalMatch`'s `armEnv.defineLocal`, `evalUserFnCall`'s `childFnActivation`
   * + per-parameter `defineLocal`, ../runtime/statement-executor.ts), and
   * expressions.md §"Identifier resolution" makes a local shadow everything
   * else lexically. A same-named OUTER record must therefore not stay visible
   * inside the body: judging a read against it judges a binding the position
   * never holds. The name is recorded even though its TYPE is past this layer's
   * static view — a `match` arm's per-arm narrowing and a parameter's
   * cross-call argument are not decidable from this file's text.
   *
   * TWO channels carry the withhold, because two kinds of consumer read this
   * map. The IDENTITY channel is `unprovableBindings`: `provableArgType`'s
   * `ident` arm withholds on the hit instead of proving the record the binder
   * hides, which is the fn-arg row's own discipline. The VALUE channel is the
   * name minted here — `WITHHELD_BINDER_TYPE_NAME`, which no declaration can
   * spell, so every sibling row that reads a type out of this map by VALUE
   * reaches its unresolvable-name arm rather than judging the read against a
   * schema that happens to share the binder's spelling.
   *
   * The sibling rows DO move, in the deferral direction: an in-scope read of
   * one of these binders no longer resolves to a same-named outer record, and
   * where the map previously missed, the minted spelling was judged nominally.
   * Both dispositions become deferrals. The rows whose verdict a withheld read
   * can flip without reaching an unresolvable-name arm withhold it explicitly
   * (`containsWithheldBinderType`); the emission direction is closed — no
   * sibling row reports on a withheld read.
   */
  private recordWithheldBinders(scope: Map<string, CompatType>, names: Iterable<string>): void {
    for (const name of names) {
      const withheld: CompatType = { kind: "named", name: WITHHELD_BINDER_TYPE_NAME };
      scope.set(name, withheld);
      this.unprovableBindings.add(withheld);
    }
  }

  /**
   * The scope a `match` arm's body is evaluated in: `bindings` plus that arm's
   * own pattern bindings, withheld. `evalMatch` evaluates the selected body in
   * `env.child()` with every pattern binding defined
   * (../runtime/statement-executor.ts; an identifier pattern binds the
   * scrutinee whatever its value, ../runtime/match-result.ts), so the walk of
   * an arm body and `provableArgType`'s reduction over arm bodies both resolve
   * it through here — the two disagreeing about which binding an arm body reads
   * is the scope mismatch this exists to close.
   *
   * A pattern binding nothing (a literal or a wildcard) yields `bindings`
   * unchanged, so the common arm copies no map.
   */
  private matchArmScope(
    pattern: PatternNode,
    bindings: ReadonlyMap<string, CompatType>,
  ): ReadonlyMap<string, CompatType> {
    const names = new Set<string>();
    collectPatternBinderNames(pattern, names);
    if (names.size === 0) {
      return bindings;
    }
    const scope = new Map(bindings);
    this.recordWithheldBinders(scope, names);
    return scope;
  }

  private walkFn(fn: FnDecl, bindings: Map<string, CompatType>): void {
    const fnScope = new Map(bindings);
    for (const p of fn.params) {
      if (p.type.length > 0) {
        fnScope.set(p.name, annotationToCompatType(p.type) ?? { kind: "named", name: p.type });
      } else {
        // An unannotated parameter carries no declared type, and it still BINDS
        // its name in the activation scope the body executes in
        // (`evalUserFnCall`). theta 1.0 has no closures, so a same-named
        // enclosing binding is not readable inside the body at all — recording
        // the parameter withheld keeps a body read from resolving to it.
        this.recordWithheldBinders(fnScope, [p.name]);
      }
    }
    // FN-6 (bug 0005 (c)) — a `subagent fn` body is a subagent session whose
    // failure channel is the boundary `Err`: a body `?` sits in the same
    // position as a subagent-mode `.theta` body's top-level `?`, where it is
    // legal. `): T` on a `subagent fn` declares the Ok PAYLOAD `T` (the
    // `invoke<T>` analogue, matching the annotation-less inference), not a
    // plain return type — so the body is a Result scope for the `?` check
    // regardless of annotation, and only a plain `fn`'s annotation gates `?`
    // on Result-compatibility.
    const returnScope: EnclosingReturnScope =
      fn.returnType === null || fn.subagent
        ? { kind: "inferred" }
        : { kind: "annotated", resultCompatible: isResultAnnotation(fn.returnType) };

    // An annotation-less `fn` infers its return type as the LUB of its
    // contributions; contributions sharing no common upper bound surface
    // `theta/parse/return-no-common-type` (owned V3d).
    if (fn.returnType === null) {
      const contributions = this.collectReturnContributions(fn.body, fnScope);
      const resolved = resolveReturnType({
        contributions,
        hasQuestion: this.bodyHasQuestion(fn.body),
        env: this.env,
        site: { file: this.file, range: fn.range },
      });
      if (resolved.kind === "inference-no-common-type") {
        this.diagnostics.push(resolved.diagnostic);
      }
    } else if (fn.subagent) {
      this.checkSubagentReturnAnnotation(fn, fn.returnType, fnScope);
    }

    this.walkBlock(fn.body, fnScope, { returnScope });
  }

  /**
   * Validate an annotated `subagent fn`'s return annotation against the
   * INFERRED Ok payload (bug 0005 (c)). The same FN-3 payload-level inference
   * an annotation-less body gets runs first; the resolved payload is then
   * checked `⊑ annotation` through the existing `invoke<Schema>` typed-return
   * machinery (`checkInvokeReturnType`), reusing
   * `theta/parse/invoke-return-type-mismatch` — FN-6 explicitly equates the
   * subagent-fn boundary with `invoke`, and `): T` is the `invoke<T>`
   * analogue, so the invoke row covers this slot rather than coining a
   * parallel code. Conservative by construction, never a crash and no false
   * positive: a statically-unresolvable payload (a query / unresolved-call
   * tail — a `named` reference past the parser's static view) makes the `⊑`
   * relation answer `"unknown"` and no diagnostic fires (the runtime AJV
   * boundary check is the net); a contribution set with no common upper bound
   * is left to the annotation (FN-3: an explicit annotation bypasses
   * inference) rather than re-flagged as `return-no-common-type`.
   */
  private checkSubagentReturnAnnotation(
    fn: FnDecl,
    returnType: string,
    fnScope: ReadonlyMap<string, CompatType>,
  ): void {
    const annotation = annotationToCompatType(returnType);
    if (annotation === undefined) {
      return;
    }
    const resolved = resolveReturnType({
      contributions: this.collectReturnContributions(fn.body, fnScope),
      hasQuestion: this.bodyHasQuestion(fn.body),
      env: this.env,
      site: { file: this.file, range: fn.range },
    });
    if (resolved.kind !== "inferred") {
      return;
    }
    // A payload inferred from a WITHHELD read is not a payload this layer knows:
    // the boundary check is the same structural relation as the typed-`let`
    // sink's, so the same withhold applies (an unannotated parameter returned
    // from the body is the reachable shape).
    if (containsWithheldBinderType(resolved.inferred.payload)) {
      return;
    }
    this.diagnostics.push(
      ...checkInvokeReturnType({
        callee: fn.name,
        calleeResolvable: true,
        schema: annotation,
        calleeReturn: resolved.inferred.payload,
        env: this.env,
        site: { file: this.file, range: fn.range },
      }),
    );
  }

  /**
   * Collect the return contributions of a `fn` body: every `return` operand and
   * the body's tail expression, each projected to a `plain` or `result`
   * contribution. `?`-bearing and `Result`-constructor operands contribute a
   * `result` (their success payload), everything else a `plain` type.
   */
  private collectReturnContributions(
    block: Block,
    bindings: ReadonlyMap<string, CompatType>,
  ): ReturnContribution[] {
    const out: ReturnContribution[] = [];
    const visitBlock = (b: Block): void => {
      for (const s of b.statements) {
        visitStmt(s);
      }
      if (b.tail !== null) {
        out.push(this.contributionOf(b.tail, bindings));
      }
    };
    const visitStmt = (s: Stmt): void => {
      switch (s.kind) {
        case "return":
          if (s.operand !== null) {
            out.push(this.contributionOf(s.operand, bindings));
          }
          return;
        case "if":
          visitBlock(s.then);
          if (s.otherwise !== null) {
            if ("statements" in s.otherwise) {
              visitBlock(s.otherwise);
            } else {
              visitStmt(s.otherwise);
            }
          }
          return;
        case "while":
          visitBlock(s.body);
          return;
        case "for":
          visitBlock(s.body);
          return;
        default:
          // A nested `fn` owns its own return inference; do not descend into it.
          return;
      }
    };
    visitBlock(block);
    return out;
  }

  private contributionOf(
    expr: Expr,
    bindings: ReadonlyMap<string, CompatType>,
  ): ReturnContribution {
    if (expr.kind === "query" || expr.kind === "try" || expr.kind === "result-ctor") {
      return { kind: "result", payload: this.typeOf(expr, bindings) };
    }
    return { kind: "plain", type: this.typeOf(expr, bindings) };
  }

  /** Whether a `fn` body bears a `?` anywhere (forcing a `Result` return wrap). */
  private bodyHasQuestion(block: Block): boolean {
    let found = false;
    const visitExpr = (e: Expr): void => {
      if (found) {
        return;
      }
      if (e.kind === "try") {
        found = true;
        return;
      }
      for (const child of childExprs(e)) {
        visitExpr(child);
      }
    };
    const visitBlock = (b: Block): void => {
      for (const s of b.statements) {
        for (const e of stmtExprs(s)) {
          visitExpr(e);
        }
        for (const nested of stmtBlocks(s)) {
          visitBlock(nested);
        }
      }
      if (b.tail !== null) {
        visitExpr(b.tail);
      }
    };
    visitBlock(block);
    return found;
  }

  /** The boolean-position check for an `if` / `while` condition. */
  private checkBoolean(
    condition: Expr,
    position: "if" | "while",
    bindings: ReadonlyMap<string, CompatType>,
  ): void {
    this.diagnostics.push(
      ...checkBooleanPosition({
        position,
        operandType: this.typeOf(condition, bindings),
        site: { file: this.file, range: condition.range },
      }),
    );
  }

  private checkArrayLiteral(
    array: ArrayExpr,
    sink: CompatType | undefined,
    bindings: ReadonlyMap<string, CompatType>,
  ): void {
    const branches = array.elements.map((e) => this.typeOf(e, bindings));
    // One branch read out of a WITHHELD binder withholds the whole check: the
    // element sink decides each branch through the same structural TYPE-7 arm
    // that cannot defer on an unresolvable name, and the row reports the FIRST
    // failing branch by index, so there is no per-branch skip to hand the
    // byte-frozen checker instead.
    if (branches.some((branch) => containsWithheldBinderType(branch))) {
      return;
    }
    this.diagnostics.push(
      ...checkCommonType({
        branches,
        sink,
        env: this.env,
        site: { file: this.file, range: array.range },
      }),
    );
  }

  /**
   * The array node already checked against a binding-annotation element sink.
   * `annotation` is the `let` arm's own resolution of `stmt.annotation` — a
   * null or blank annotation source, and one `annotationToCompatType` cannot
   * convert, both arrive as `undefined` and answer `null` here.
   */
  private sinkedArrayOf(stmt: Stmt, annotation: CompatType | undefined): Expr | null {
    if (
      stmt.kind === "let" &&
      stmt.init !== null &&
      stmt.init.kind === "array" &&
      annotation !== undefined &&
      annotation.kind === "array"
    ) {
      return stmt.init;
    }
    return null;
  }

  /**
   * The type-phase field-value check for a schema-constructor field
   * (`Schema { field: expr, … }`, `walkExpr`'s `object` arm). Runs only when
   * `e.typeName` resolves in `this.env` to an object-schema declaration
   * carrying a declared field list — an unresolved or non-constructible name
   * (bug 0025's territory) and an alias-form schema (fieldless by
   * construction) both keep the check silent, and a bare `{ … }` literal
   * (`typeName === null`) has no declaration to resolve at all. Checks run
   * over the intersection of the literal's fields and the declaration's
   * fields: an undeclared field and an omitted declared field keep reporting
   * through `checkObjectExpr`'s presence gates alone
   * (`theta/parse/extra-object-field` / `theta/parse/missing-object-field`),
   * so a mistyped extra field is not double-reported. The walk still recurses
   * into every field value afterwards, exactly as before this check existed.
   */
  private checkObjectFields(
    e: Expr & { kind: "object" },
    bindings: ReadonlyMap<string, CompatType>,
    flow: WalkCtx,
  ): void {
    const typeName = e.typeName;
    const declaredFields = typeName === null ? undefined : this.declaredFieldsOf(typeName);
    for (const field of e.fields) {
      let skipArray: Expr | null = null;
      // Own-key lookup: a theta field name may collide with an
      // `Object.prototype` member (`toString`, `constructor`, …), and the
      // record must never answer through the prototype chain and manufacture a
      // declared type for a field the schema does not declare.
      const declared =
        declaredFields !== undefined && Object.hasOwn(declaredFields, field.name)
          ? declaredFields[field.name]
          : undefined;
      if (typeName !== null && declared !== undefined) {
        skipArray = this.checkObjectField(typeName, field, declared, bindings);
      }
      this.walkExpr(field.value, bindings, flow, skipArray);
    }
  }

  /**
   * `typeName`'s declared field-type record, or `undefined` when it does not
   * resolve in `this.env` to an object-schema declaration carrying one.
   */
  private declaredFieldsOf(
    typeName: string,
  ): Readonly<Record<string, CompatType>> | undefined {
    const decl = resolveNamed(this.env, typeName);
    if (decl === undefined || decl.kind !== "object-schema") {
      return undefined;
    }
    return decl.fields;
  }

  /**
   * One constructor field's value against its declared type. A `result-ctor`
   * value (`Ok(...)` / `Err(...)`) is rejected outright — every declared
   * field type is lowerable (`theta/parse/result-in-schema-position` makes a
   * `Result`-typed field undeclarable), so a `Result` value is incompatible
   * with whatever the field declares even though `checkCompatible` alone
   * answers `"unknown"` for it. Otherwise routes the compatibility outcome
   * the way `checkLetRhsCompat` does. When the value is an array literal and
   * the declared type is `array<T>`, also checks it against the declared
   * element type as a sink (mirroring the typed-`let` arm's `sinkedArrayOf`)
   * and returns the value node so the caller skips the generic sink-less
   * array check on the same node; otherwise returns `null`.
   */
  private checkObjectField(
    schema: string,
    field: ObjectFieldNode,
    declared: CompatType,
    bindings: ReadonlyMap<string, CompatType>,
  ): Expr | null {
    const value = field.value;
    const valueType = this.typeOf(value, bindings);
    // Same withhold discipline as the typed-`let` sink: a field value read out
    // of a WITHHELD binder supports no verdict, and a declared `array<T>` or
    // inline-object field type would be decided structurally.
    if (!containsWithheldBinderType(valueType)) {
      this.diagnostics.push(
        ...checkObjectFieldCompat({
          schema,
          field: field.name,
          declared,
          value: valueType,
          env: this.env,
          site: { file: this.file, range: value.range },
          forceIncompatible: value.kind === "result-ctor",
        }),
      );
    }
    if (value.kind === "array" && declared.kind === "array") {
      this.checkArrayLiteral(value, declared.element, bindings);
      return value;
    }
    return null;
  }

  /**
   * The parse-time counterpart of the runtime's `resolveUserFn`
   * (`../runtime/statement-executor.ts`): decide whether `e`'s callee is a
   * user `fn` this file can judge, and when it is, check each argument the
   * callee declares a parameter type for (TYPE-9,
   * `theta/parse/fn-arg-type-mismatch`). Every arm below either resolves the
   * question and returns, or falls through to the next — never both, so the
   * resolution is total over `e.callee` with no silent fall-through.
   */
  private checkFnCallArgs(e: CallExpr, bindings: ReadonlyMap<string, CompatType>): void {
    if (this.shadowedNames.has(e.callee)) {
      // expressions.md §"Identifier resolution": a local binding (arm 1)
      // outranks a top-level `fn` (arm 2), so a call of a locally-bound name
      // is never a user-`fn` call at this site.
      return;
    }
    if (this.importedSymbols.has(e.callee)) {
      // A documented deferral, not a dropped route: the registry Trigger
      // names a same-file OR imported `.thetalib` function call, but a
      // single-file parse carries no imported `fn`'s parameter types.
      // type-system.md §"Unresolvable operands" defers a check whose operand
      // is past the parser's static view.
      return;
    }
    const fn = this.fnDecls.get(e.callee);
    if (fn === undefined) {
      // A `.theta`-callable call, a Pi-tool call, or an unresolved name —
      // none is a user `fn`, and each has its own owning diagnostic
      // (`tool-arg-type-mismatch`, `invoke-arg-type-mismatch`, or
      // `unknown-identifier`).
      return;
    }
    const matchedCount = Math.min(e.args.length, fn.params.length);
    for (let i = 0; i < matchedCount; i += 1) {
      const p = fn.params[i] as FnParam;
      const paramType = annotationToCompatType(p.type);
      if (paramType === undefined) {
        // An unannotated parameter (`p.type` is the empty string) has no
        // declared type to judge the argument against.
        continue;
      }
      const arg = e.args[i] as Expr;
      const argType = this.provableArgType(arg, bindings);
      if (argType === undefined) {
        // Not a proof of the argument's runtime value type
        // (`provableArgType`) — withholding here can only suppress an
        // emission.
        continue;
      }
      this.diagnostics.push(
        ...checkFnArgCompat({
          fnName: fn.name,
          index: i,
          paramName: p.name,
          paramType,
          argType,
          env: this.env,
          site: { file: this.file, range: arg.range },
        }),
      );
    }
  }

  /**
   * Whether `this.typeOf(expr, bindings)` is a PROOF of `expr`'s runtime value
   * type — `undefined` withholds `checkFnCallArgs`'s judgement rather than
   * trusting an unproven read.
   *
   * `StaticTypeInferencePass.#commonType` reduces a candidate set to one type
   * by two lossy mechanisms: a statically unresolvable candidate never blocks
   * another candidate ("unknown-blessing"), and a set with no common upper
   * bound falls back to `candidates[0]`. Both are reachable at an argument
   * position: `true ? 1 : obj.field` reads `integer` (the unresolvable branch
   * never blocks it), and `true ? A { a: 1 } : B { b: "x" }` reads `A`, rule
   * 3's own fallback. Both erase a sibling arm the runtime can still produce.
   * Emitting on an erased read would refuse a theta whose runtime value the
   * emission misdescribes: bug 0072's landed soundness lesson at the
   * `.theta`-callable argument sink (`collectProvableArgTypes`,
   * `../extension/invoke-static-checks.ts`) applied here at a new sink. That
   * function is an extension-layer answer over the SET of types an expression
   * can take and cannot be imported into this parser-layer module without
   * inverting the dependency direction, so the same discipline is applied
   * in-layer as an EXACTNESS test instead (`isProvenReduction` below).
   *
   * Exhaustive `switch` over the `Expr` union with no `default` arm, so a kind
   * added to the union without an arm here is a compile error rather than a
   * silent verdict.
   */
  private provableArgType(
    expr: Expr,
    bindings: ReadonlyMap<string, CompatType>,
  ): CompatType | undefined {
    switch (expr.kind) {
      case "number":
      case "string":
      case "bool":
      case "null":
        // A literal's read IS its value's type.
        return this.typeOf(expr, bindings);
      case "ternary": {
        const reduced = this.typeOf(expr, bindings);
        return this.isProvenReduction([expr.consequent, expr.alternate], reduced, bindings)
          ? reduced
          : undefined;
      }
      case "match": {
        const reduced = this.typeOf(expr, bindings);
        // Each arm body is proven in THAT ARM's scope, the one the walk uses
        // (`matchArmScope`): a proof taken in the enclosing scope would prove a
        // binding the arm body does not read, which is the false-`E` shape this
        // whole predicate exists to refuse. The reduction itself is read in the
        // enclosing scope, which is sound because every arm shape this function
        // PROVES is either scope-independent (a literal, a boolean-valued
        // operator, a nominal naming the construct that produced the value) or
        // recurses through the `ident` arm, where a read of a withheld binder
        // withholds the whole composite.
        return this.isProvenReduction(
          expr.arms.map((arm) => arm.body),
          reduced,
          bindings,
          expr.arms.map((arm) => this.matchArmScope(arm.pattern, bindings)),
        )
          ? reduced
          : undefined;
      }
      case "array": {
        const reduced = this.typeOf(expr, bindings);
        if (reduced.kind !== "array") {
          // `#typeExpr`'s own `"array"` arm always answers `kind: "array"`;
          // this is the narrowing `reduced.element` below needs, not a
          // reachable branch.
          return undefined;
        }
        // An empty element list satisfies `isProvenReduction`'s `every`
        // vacuously without proving anything about a runtime value.
        return this.isProvenReduction(expr.elements, reduced.element, bindings)
          ? reduced
          : undefined;
      }
      case "binary": {
        // `parseUnary` (./theta-document.ts) models unary `!` / `-` as a
        // binary carrying a synthetic `null` left operand; dispatch in
        // `#typeBinary`'s own order so the two never disagree on shape.
        if (expr.left.kind === "null" && expr.op === "-") {
          // A negation's value type is the OPERATOR's, not the operand's:
          // expressions.md §"Other arithmetic" gives unary `-` `integer` for an
          // `integer` operand and `number` for a `number` one and admits no
          // other result, and the runtime reaches that result by coercion
          // (`evalBinary`: `-(right.value as number)`,
          // ../runtime/statement-executor.ts), so `-"5"` evaluates to the
          // number `-5` while the operand's own proof says `string`. The
          // operand's proof is therefore a proof of the negation only inside
          // the numeric shapes; outside them it names a type the value cannot
          // have, and withholding can only suppress an emission.
          //
          // `classifyOperand` is this module's one numeric test, shared with
          // the A5 `+` and A6 ordering operand checks over the same operator
          // family, so the two cannot drift on which `CompatType` shapes count
          // as numeric — a `prim` `integer` / `number` from an annotation
          // (`annotationToCompatType`), a `literal` typing as either from a
          // numeric literal (`#typeExpr`), or a transparent alias (TYPE-11)
          // unfolding to one of those.
          const operand = this.provableArgType(expr.right, bindings);
          if (operand === undefined || classifyOperand(operand, this.env) !== "numeric") {
            return undefined;
          }
          return operand;
        }
        if ((expr.left.kind === "null" && expr.op === "!") || BOOLEAN_BINARY_OPS.has(expr.op)) {
          // Result-fixed: the value is a boolean whatever the operands
          // evaluate to, so the read is exact even where an operand is not.
          return this.typeOf(expr, bindings);
        }
        // Arithmetic narrows the operands through `#commonType`, the same
        // erasure risk as `ternary` / `match` above.
        const reduced = this.typeOf(expr, bindings);
        if (!this.isProvenReduction([expr.left, expr.right], reduced, bindings)) {
          return undefined;
        }
        // `isProvenReduction` tests the reduction's EXACTNESS, not the
        // operator's ADMISSIBILITY, so a same-typed pair of proven non-numeric
        // operands passes it — and for `-`, `*`, `/`, `%` the result type is
        // fixed by the operator: expressions.md §"Other arithmetic" gives
        // those four `integer` or `number` for every input (NaN included, which
        // is a `number`), and the runtime casts both operands to reach it
        // (`applyBinaryScalar`, ../runtime/statement-executor.ts), so
        // `"a" - "b"` is the number NaN rather than the `string` the reduction
        // names. An operand's own type is not a proof of the expression's value
        // type outside the numeric shapes, and withholding can only suppress an
        // emission.
        //
        // `+` keeps the reduction, because there the reduction IS the result
        // type: expressions.md §"`+` operator" makes a both-`string` pair
        // concatenation and a both-numeric pair addition, and every other
        // pairing fails to load on `theta/parse/mixed-plus-operands`.
        return expr.op === "+" || classifyOperand(reduced, this.env) === "numeric"
          ? reduced
          : undefined;
      }
      case "try":
        // `operand?` propagates the operand's success type: a proof of the
        // operand is a proof of the `try` expression.
        return this.provableArgType(expr.operand, bindings);
      case "ident": {
        // The RECORDED type is the only channel that carries a JUDGED type, so
        // it is read here directly rather than through `typeOf`: `#typeExpr`'s
        // own `ident` arm (./static-type-inference.ts) falls back to
        // `{ kind: "named", name }` MINTED FROM THE IDENTIFIER'S OWN SPELLING
        // for any name the map does not hold, and a name an author chose for a
        // value proves nothing about that value's type — where the spelling
        // collides with a declared schema it resolves and is judged nominally
        // (TYPE-10) against a declaration the read has nothing to do with,
        // which is the false-judgement shape the `member` arm's field-name
        // fallback, the `method-call` arm, and the `call` / `invoke` arms
        // below refuse over the field and callee namespaces. `bindings` is
        // still not a complete local view (a `params:` field reaches it now,
        // by bug 0192 §Fix, but other names legitimately resolve without ever
        // reaching this map): a `tools:`-declared callable name read as a
        // VALUE, for instance, resolves through the lexical layer's own
        // `identRoots` rather than through `bindings` at all — measured, a
        // plain `fn` call passing one as an argument draws no diagnostic here,
        // where the same position over an undeclared name draws
        // `theta/parse/unknown-identifier` instead. So a MISS still means "not
        // recorded", never "no such binding", and the only sound answer is to
        // withhold. The binder classes this layer cannot type are recorded as
        // WITHHELD entries instead of being left to miss
        // (`recordWithheldBinders`), so where an inner binder hides a same-named
        // outer record the hit is that binder's own withheld entry, never the
        // record the runtime does not read there. That entry's own name is
        // unspellable (`WITHHELD_BINDER_TYPE_NAME`), which keeps the nominal
        // collision described above out of the sibling rows that read this map
        // by value rather than by identity. `Map.get` against an explicit
        // `undefined` rather than a truthiness test, because the key is
        // author-controlled source text.
        const recorded = bindings.get(expr.name);
        if (recorded === undefined) {
          return undefined;
        }
        // The laundered-binding hole: an unannotated `let` can record an
        // unprovable initialiser read as the binding's type (`walkStmt`'s
        // `let` arm), and `bindings.get(name)` returns that EXACT object, so
        // identity is the channel back to the erasure a name read alone
        // cannot see.
        return this.unprovableBindings.has(recorded) ? undefined : recorded;
      }
      case "method-call":
        // A read that mints a `named` type out of an author-chosen METHOD
        // name is not a proof of the value's type: `#typeExpr` answers
        // `named <method>` for `xs.length()`, which is not the type of the
        // value the call produces. The adjacent `interpolationIsResult`
        // refuses the same minted names for the same reason — a name an
        // author chose for a field or a method collides freely with a
        // declared schema's name, so reading meaning out of it judges an
        // unrelated namespace.
        //
        // No sound emission is lost by withholding here. A minted name that
        // resolves to nothing declared already defers at `checkCompatible`
        // (`"unknown"`), and one that DOES resolve is judging the declaration
        // that happens to share the spelling rather than the read value.
        return undefined;
      case "member":
        // PROOF iff both hold: the RECEIVER is itself a proven read
        // (`provableArgType(expr.target, bindings)` is defined) AND the read
        // resolves to a DECLARED field type on a resolved object schema —
        // `StaticTypeInferencePass`'s own-key-guarded branch, reached here
        // through `declaredFieldType`. The proven answer IS that declared
        // field type, TYPE-11-unfolded.
        //
        // (1) Why a declared field type is a proof at all. Bug 0136 made a
        // member read's static type the receiver's declared field type, and
        // wrote the rule into expressions.md's Member access bullet: the
        // static result type of `obj.field` is the receiver's declared type
        // for that field, TYPE-11-unfolded. TYPE-9 conditions this sink's
        // obligation on both operands being statically resolvable, and a
        // declared field on a resolved object schema is read straight out of
        // the `TypeEnv` rather than left past the parser's static view.
        //
        // (2) Why the arm's other two outcomes are not proofs. The
        // field-name mint (an absent field, a fields-less declaration, or a
        // declined `typeSource`) is author-chosen and can RESOLVE against an
        // unrelated declaration sharing its spelling — `schema Zzz = integer`
        // beside `p.Zzz` on a `P` that declares no `Zzz` — and
        // expressions.md's Member access bullet assigns an absent
        // theta-side name a RUNTIME `theta/runtime/missing-object-key`
        // panic; judging the mint would refuse at `E` a program whose
        // specified disposition is a panic. The receiver's own `named`, for
        // an unresolvable receiver, is exactly what `checkCompatible`
        // answers `"unknown"` for and defers.
        //
        // (3) Why the RECEIVER's own proof is a further, separate
        // obligation — a soundness requirement this arm cannot ship
        // without, not a preference. An erased receiver launders its
        // erasure through the field lookup: for
        // `let m = flag ? A { s: "x" } : B { s: 1 }`, the ternary is not a
        // proven reduction (`#commonType` rule 3 falls back to
        // `candidates[0]`, discarding the `B` arm), so `m` is recorded in
        // `unprovableBindings` (read here through the `ident` arm's identity
        // check) — and `m.s` then resolves against `A` and answers `string`,
        // while the runtime can hand the callee a `B` whose `s` IS the
        // `integer` the parameter declares. Without this clause that program
        // draws a false
        // `theta/parse/fn-arg-type-mismatch: expected integer, got string`.
        // This is the same species as the `index` arm's own obligation
        // below: "The proof obligation belongs to the target: recur on it
        // the way the `try` arm recurs on its operand"; this arm carries the
        // identical obligation over its RECEIVER. The conservatism this
        // buys: where an erased receiver's candidate schemas happen to
        // declare the same field type, withholding loses a sound emission —
        // but withholding can only ever suppress an emission, never
        // manufacture one, which is the asymmetry the whole predicate is
        // built on.
        return this.provableArgType(expr.target, bindings) === undefined
          ? undefined
          : this.pass.declaredFieldType(expr, this.env, bindings);
      case "call":
      case "invoke":
        // A `named` type minted from an author-chosen CALLEE is not a proof of
        // the call's value type, for the reason the `method-call` arm above
        // already states at the method namespace: `#typeExpr` answers
        // `named <callee>` for `f(x)` and `named <path>` for an `invoke`, and
        // neither names the type of the value the call produces. The operand a
        // sound judgement needs is the callee's declared RETURN type, which
        // the substrate does not carry to this position.
        //
        // No sound emission is lost by withholding. A minted name resolving to
        // nothing declared already defers at `checkCompatible` (`"unknown"`),
        // and the only env a name CAN resolve in here is the schema-only
        // `TypeEnv` (`collectTypeEnv` — `schema` declarations, object form and
        // alias form; enums excluded), whose every entry is uppercase-first by
        // `theta/parse/schema-case-mismatch` while a user `fn` name is
        // lowercase-first by `theta/parse/binding-case-mismatch`. A callee
        // name that resolves is therefore never the callee's own type: it is a
        // schema that merely shares the spelling with a schema-cased callee —
        // a `.thetalib` import, a `.theta`-callable `as` alias, or a name the
        // callable set never had. An `invoke` shares the arm because its
        // minted path is a `.theta` path literal, which either ends in
        // `.theta` (unspellable as a schema name) or draws
        // `theta/parse/invoke-non-theta-extension` — one rule instead of two.
        return undefined;
      case "query":
      case "object":
      case "result-ctor":
      case "par-for":
        // Each is a nominal `named` reference naming the construct that
        // produced the value — a query's `as` schema, a constructed schema, a
        // `Result` constructor, a `par for`'s CTRL-3 element — so
        // `checkCompatible` either resolves the name it was given or answers
        // `"unknown"` and defers.
        return this.typeOf(expr, bindings);
      case "index":
        // `#typeExpr` narrows an index read to the TARGET's ELEMENT type, and
        // that element object is not the object the two recording arms put in
        // `unprovableBindings` — the array type is — so an erased target would
        // launder its erasure through the narrowing, past the identity channel
        // the `ident` arm reads. The proof obligation belongs to the target:
        // recur on it the way the `try` arm recurs on its operand, and take
        // the element narrowing from `typeOf` only once the target is proven.
        return this.provableArgType(expr.target, bindings) === undefined
          ? undefined
          : this.typeOf(expr, bindings);
    }
  }

  /**
   * The exactness test every composite `provableArgType` arm
   * (`ternary` / `match` / `array` / arithmetic `binary`) shares: every member
   * of `arms` must itself be a proven read (`provableArgType` defined) AND
   * relate to `reduced` — the pass's own narrowed answer for the composite —
   * by `checkCompatible(armType, reduced, env) === "compatible"`. An undefined
   * arm, or an `"unknown"` / `"incompatible"` relation, withholds the whole
   * composite: `"unknown"` must withhold rather than pass, because trusting it
   * would be the unknown-blessing mechanism this test exists to refuse. An
   * empty `arms` satisfies `every` vacuously without proving anything about a
   * runtime value, so it withholds too, never trusts.
   *
   * `armScopes`, when supplied, gives arm `i` its OWN scope: a `match` arm's
   * body is evaluated with that arm's pattern bindings installed, so the proof
   * of that body has to be taken there. Every other composite's arms are
   * evaluated in the one enclosing scope and omit it.
   */
  private isProvenReduction(
    arms: readonly Expr[],
    reduced: CompatType,
    bindings: ReadonlyMap<string, CompatType>,
    armScopes?: readonly ReadonlyMap<string, CompatType>[],
  ): boolean {
    if (arms.length === 0) {
      return false;
    }
    return arms.every((arm, index) => {
      const armType = this.provableArgType(arm, armScopes?.[index] ?? bindings);
      return (
        armType !== undefined && checkCompatible(armType, reduced, this.env) === "compatible"
      );
    });
  }

  private walkExpr(
    e: Expr,
    bindings: ReadonlyMap<string, CompatType>,
    flow: WalkCtx,
    skipArray: Expr | null = null,
  ): void {
    switch (e.kind) {
      case "ternary":
        this.diagnostics.push(
          ...checkBooleanPosition({
            position: "ternary-condition",
            operandType: this.typeOf(e.condition, bindings),
            site: { file: this.file, range: e.condition.range },
          }),
        );
        this.walkExpr(e.condition, bindings, flow);
        this.walkExpr(e.consequent, bindings, flow);
        this.walkExpr(e.alternate, bindings, flow);
        return;
      case "binary":
        if (e.op === "&&" || e.op === "||") {
          for (const operand of [e.left, e.right]) {
            this.diagnostics.push(
              ...checkBooleanPosition({
                position: e.op,
                operandType: this.typeOf(operand, bindings),
                site: { file: this.file, range: operand.range },
              }),
            );
          }
        } else if (e.op === "+") {
          this.checkPlusOperands(e, bindings);
        } else if (ORDERING_OPS.has(e.op)) {
          this.checkOrderingOperands(e, bindings);
        }
        this.walkExpr(e.left, bindings, flow);
        this.walkExpr(e.right, bindings, flow);
        return;
      case "try":
        this.checkQuestion(e.operand, e.range, bindings, flow);
        this.walkExpr(e.operand, bindings, flow);
        return;
      case "array":
        if (e !== skipArray) {
          this.checkArrayLiteral(e, undefined, bindings);
        }
        for (const el of e.elements) {
          this.walkExpr(el, bindings, flow);
        }
        return;
      case "index":
        this.checkIndex(e, bindings);
        this.walkExpr(e.target, bindings, flow);
        this.walkExpr(e.index, bindings, flow);
        return;
      case "match":
        this.diagnostics.push(
          ...checkMatchArmTypes({
            armTypes: e.arms.map((arm) => this.typeOf(arm.body, bindings)),
            sink: undefined,
            env: this.env,
            site: { file: this.file, range: e.range },
          }).diagnostics,
        );
        this.walkExpr(e.scrutinee, bindings, flow);
        for (const arm of e.arms) {
          // Each body is walked in ITS OWN arm scope: the runtime installs that
          // arm's pattern bindings before the body runs, so a same-named
          // enclosing record is not what the body reads.
          this.walkExpr(arm.body, this.matchArmScope(arm.pattern, bindings), flow);
        }
        return;
      case "method-call":
        this.checkMethodCall(e, bindings);
        this.walkExpr(e.target, bindings, flow);
        for (const arg of e.args) {
          this.walkExpr(arg, bindings, flow);
        }
        return;
      case "member":
        this.checkMemberAccess(e, bindings);
        this.walkExpr(e.target, bindings, flow);
        return;
      case "call":
        this.checkFnCallArgs(e, bindings);
        for (const arg of e.args) {
          this.walkExpr(arg, bindings, flow);
        }
        return;
      case "invoke":
        // `invoke` shares this arm's label with `call` in the grammar but not
        // in the registry: it carries its own row
        // (`theta/parse/invoke-arg-type-mismatch`) and its own, separately
        // unwired emitter — a different open defect this walk does not fix.
        for (const arg of e.args) {
          this.walkExpr(arg, bindings, flow);
        }
        return;
      case "object":
        this.checkObjectFields(e, bindings, flow);
        return;
      case "result-ctor":
        this.walkExpr(e.arg, bindings, flow);
        return;
      case "par-for": {
        // CTRL-2 / grammar.md: the iterand reuses the `for` contract — a
        // non-`array<T>` iterand is `theta/parse/non-array-iterand`.
        // The `for` arm's withhold, at this row's second call site.
        const rawIterandType = this.typeOf(e.iterand, bindings);
        const iterDiag = containsWithheldBinderType(rawIterandType)
          ? undefined
          : checkForIterand(
              { type: rawIterandType },
              { file: this.file, range: e.iterand.range },
              this.env,
            );
        if (iterDiag !== undefined) {
          this.diagnostics.push(iterDiag);
        }
        this.walkExpr(e.iterand, bindings, flow);
        // The `max` operand is an integer sink: a fractional / `number` operand
        // narrows to the existing `theta/parse/integer-narrowing` diagnostic.
        if (e.max !== null) {
          const r = checkCompatible(
            this.typeOf(e.max, bindings),
            { kind: "prim", name: "integer" },
            this.env,
          );
          if (r === "integer-narrowing") {
            this.diagnostics.push({
              severity: "error",
              code: "theta/parse/integer-narrowing",
              file: this.file,
              range: e.max.range,
              message: "cannot narrow number to integer",
            });
          }
          this.walkExpr(e.max, bindings, flow);
        }
        // Bind the fresh immutable loop variable to the iterand element type so
        // body checks resolve it, then walk the body. TYPE-11: an alias of
        // `array<T>` supplies the same element as `array<T>` itself, so the
        // iterand is unfolded again here, independently of the admissibility
        // gate above — this is its own `kind === "array"` test, over the
        // element rather than the whole iterand.
        const iterandType = unfoldAlias(this.typeOf(e.iterand, bindings), this.env);
        const inner = new Map(bindings);
        const elementType: CompatType =
          iterandType.kind === "array" ? iterandType.element : { kind: "named", name: "unknown" };
        this.bindLoopElement(inner, e.variable, elementType, e.iterand, bindings);
        this.walkBlock(e.body, inner, flow);
        return;
      }
      case "query":
        this.checkQueryInterpolationResults(e, bindings);
        return;
      default:
        // ident / number / string / bool / null — no nested checks.
        return;
    }
  }

  /** The `?` operand-type and enclosing-scope preconditions (owned V4a). */
  private checkQuestion(
    operand: Expr,
    range: Expr["range"],
    bindings: ReadonlyMap<string, CompatType>,
    flow: WalkCtx,
  ): void {
    const site = { file: this.file, range };
    const operandKind = this.questionOperandKind(operand, bindings);
    if (operandKind !== undefined) {
      const diag = checkQuestionOperand(operandKind, site);
      if (diag !== undefined) {
        this.diagnostics.push(diag);
      }
    }
    const scopeDiag = checkQuestionScope(flow.returnScope, site);
    if (scopeDiag !== undefined) {
      this.diagnostics.push(scopeDiag);
    }
  }

  /**
   * Classify a `?` operand for the operand-type check. A query / `Result`-
   * constructor operand is a `Result` (no diagnostic). A statically-concrete
   * non-`Result` type (a primitive, literal, array, union, or inline object
   * type) is a `non-result`. Only a statically-unresolvable operand (a
   * `named` reference — an unresolved call result, a member/index
   * placeholder, and every genuine-`Result` placeholder: `Ok` / `Err` /
   * `Result<…>` / a query result) is left unclassified (`undefined`) so no
   * false positive is raised; the runtime net (`evalTry`'s brand-based guard,
   * bug 0019) rejects a non-`Result` that reaches the unwrap through this
   * arm.
   */
  private questionOperandKind(
    operand: Expr,
    bindings: ReadonlyMap<string, CompatType>,
  ): QuestionOperandType | undefined {
    if (operand.kind === "query" || operand.kind === "result-ctor") {
      return { kind: "result", errIsQueryError: true };
    }
    const type = this.typeOf(operand, bindings);
    switch (type.kind) {
      case "prim":
        return { kind: "non-result", display: type.name };
      case "literal":
        return { kind: "non-result", display: type.typesAs };
      case "array":
        return { kind: "non-result", display: "array" };
      case "union":
      case "object":
        // Non-`Result` by construction — a `Result` types as a `named`
        // placeholder (`Ok` / `Err` / `Result<…>` / a query result), never as
        // a union or an inline object type — so classifying these can never
        // false-positive a genuine `Result` (bug 0019).
        return { kind: "non-result", display: displayType(type) };
      default:
        return undefined;
    }
  }

  /**
   * Bug 0079 §Fix (a) — the QRY-18 `Result<T, E>` interpolation row: a
   * `${…}` interpolation this walk can PROVE `Result`-valued (see
   * {@link interpolationIsResult}) draws `theta/parse/interpolated-result`,
   * located at the enclosing `@`-query's whole range. `QueryTemplatePart`
   * carries no per-interpolation offsets and `QueryExpr` carries only `template` plus
   * the whole `range`, so the enclosing query's range is the only locatable
   * site — the same choice `checkQueryTemplateInterpolations`
   * (theta-document.ts) makes, for the same reason: the verbatim template
   * carries no per-interpolation token span.
   */
  private checkQueryInterpolationResults(
    e: Expr & { kind: "query" },
    bindings: ReadonlyMap<string, CompatType>,
  ): void {
    for (const part of lexQueryTemplate(e.template).parts) {
      if (part.kind !== "interp") {
        continue;
      }
      const parsed = parseExpressionSource(part.exprSource);
      if (parsed === null || parsed.kind === "try") {
        // No parse ⇒ no static type to classify. `?` UNWRAPS, so `${…?}` is
        // never itself the `Result` it consumes — stated here rather than left
        // to the classifier because `static-type-inference.ts`'s `try` arm
        // propagates the operand's type verbatim, making the unwrap invisible
        // to any type read.
        continue;
      }
      if (this.interpolationIsResult(parsed, bindings)) {
        this.diagnostics.push({
          severity: "error",
          code: INTERPOLATED_RESULT_CODE,
          file: this.file,
          range: e.range,
          message: INTERPOLATED_RESULT_MESSAGE,
        });
      }
    }
  }

  /**
   * Whether the interpolated expression `parsed` is a `Result` the static layer
   * can PROVE, classified by where the `Result`-ness comes from rather than by a
   * type name. `CompatType` has no `Result` shape, so a `Result` arrives as a
   * `named` reference — but `static-type-inference.ts` mints `named` references
   * out of author-controlled identifiers too (a member access is `named
   * <field>`, an `Ok`/`Err` constructor is `named "Ok"`/`"Err"`, a call is
   * `named <callee>`), so matching those names reads `Result` meaning into an
   * unrelated namespace: `enum Status { Ok, Bad }` / `${Status.Ok}` is QRY-18's
   * ENUM row, and a `string` field sharing a name with a `Result`-returning `fn`
   * is its object row. Hence three provenances, each unambiguous:
   *
   *   1. the node is a `Result` by construction — an `Ok`/`Err` constructor, or
   *      a call to a `fn` whose written return annotation names one;
   *   2. an identifier whose recorded binding type carries (1)'s provenance
   *      (`resultBindings`, keyed by object identity);
   *   3. a type named in the generic `Result<…>` form — a written annotation, an
   *      annotated `fn` parameter, or a `par for` element (CTRL-3). `<` bars any
   *      identifier from colliding with it.
   *
   * Everything else is left to §Fix (b)'s runtime panic. The asymmetry is the
   * point: an unprovable interpolation degrades to the runtime fallback, whereas
   * a wrong emission refuses a valid theta at load, which is what this module's
   * header and the adjacent `questionOperandKind` (bug 0019) both forbid.
   */
  private interpolationIsResult(
    parsed: Expr,
    bindings: ReadonlyMap<string, CompatType>,
  ): boolean {
    switch (parsed.kind) {
      case "result-ctor":
      case "call":
        return this.isCertainResultNode(parsed);
      case "ident": {
        const type = this.typeOf(parsed, bindings);
        return this.resultBindings.has(type) || this.isResultGenericType(type);
      }
      case "index":
        // CTRL-3 makes a `par for`'s value `array<Result<U, QueryError>>`, so an
        // element read is the one composite whose type names the generic form.
        return this.isResultGenericType(this.typeOf(parsed, bindings));
      default:
        // `binary` / `ternary` / `match` narrow through `#commonType`
        // (static-type-inference.ts), which lets an unresolvable operand type
        // stand in for the whole expression — so a type read on them proves
        // nothing about the expression's own type. Every remaining kind types as
        // a `named` reference built from an author-chosen identifier, which
        // cannot spell the generic form.
        return false;
    }
  }

  /**
   * Whether `e`'s node kind alone makes it a `Result`: an `Ok`/`Err`
   * constructor, or a call to a `fn` whose own WRITTEN return annotation names a
   * `Result`. `this.fnReturns` is the only source for the latter — `TypeEnv`
   * carries schema declarations only, and a `call` types as its callee's bare
   * NAME, so an annotated `Result` return is invisible past the call site.
   */
  private isCertainResultNode(e: Expr): boolean {
    if (e.kind === "result-ctor") {
      return true;
    }
    if (e.kind !== "call") {
      return false;
    }
    const declaredReturn = this.fnReturns.get(e.callee);
    return declaredReturn !== undefined && isResultAnnotation(declaredReturn);
  }

  /**
   * Whether `type` is an unresolvable `named` reference spelling the generic
   * `Result<…>` form. A name `this.env` resolves is a declared schema / enum /
   * alias and is rejected first, so an author's own `Result`-named declaration
   * keeps its own meaning.
   */
  private isResultGenericType(type: CompatType): boolean {
    return (
      type.kind === "named" &&
      resolveNamed(this.env, type.name) === undefined &&
      isResultGenericTypeName(type.name)
    );
  }

  /** The indexed-access receiver / object-index checks (owned V3a / V3h). */
  private checkIndex(
    e: Expr & { kind: "index" },
    bindings: ReadonlyMap<string, CompatType>,
  ): void {
    const receiverType = this.typeOf(e.target, bindings);
    const site = { file: this.file, range: e.range };
    const receiverDiag = checkIndexReceiver({ receiverType, env: this.env, site });
    if (receiverDiag !== undefined) {
      this.diagnostics.push(receiverDiag);
    }
    // The KEY read is judged by `checkObjectIndex`, which requires a `string`
    // and refuses everything else, an unresolvable `named` included
    // (../runtime/stdlib-object.ts) — the `checkForIterand` shape. A key read
    // out of a WITHHELD binder therefore withholds the verdict here: the
    // runtime key may well be the string the receiver wants.
    const indexType = this.typeOf(e.index, bindings);
    const objectDiag = containsWithheldBinderType(indexType)
      ? undefined
      : checkObjectIndex({ receiverType, indexType, env: this.env, site });
    if (objectDiag !== undefined) {
      this.diagnostics.push(objectDiag);
    }
  }

  /**
   * The method-call type-layer checks: the `array.join` element-type
   * precondition (owned V3g) and the A2 `unknown-method` stdlib allow-list
   * (fired only when the receiver's static type is a concrete built-in).
   */
  private checkMethodCall(
    e: Expr & { kind: "method-call" },
    bindings: ReadonlyMap<string, CompatType>,
  ): void {
    const targetType = this.typeOf(e.target, bindings);
    // TYPE-11: an alias of `array<T>` IS `array<T>`, so the `join` element
    // precondition (expressions.md §"array<T>" `join` row) must see it that
    // way. One construction point: `classifyReceiver` below unfolds
    // internally on whatever it is handed, so it is unaffected by receiving
    // this already-unfolded value.
    const unfoldedTarget = unfoldAlias(targetType, this.env);
    if (e.method === "join" && unfoldedTarget.kind === "array") {
      // The ELEMENT is unfolded too, and for the same reason one level down:
      // TYPE-11 makes an alias element the type it names, so the registered
      // trigger — an element type that is not `string` — is a question about
      // the unfolded element, not about the name the author wrote for it.
      // `checkArrayJoin` is a pure element predicate and holds no `TypeEnv`,
      // so applying the transparency is the caller's job. TYPE-10 bounds it:
      // an object-schema `named` element comes back unchanged and stays
      // non-string, as does an unresolvable one.
      //
      // An element read out of a WITHHELD binder withholds this verdict, for
      // the same reason as the iterand and object-key rows: the predicate
      // refuses every non-`string` element including an unresolvable one, so it
      // cannot defer on a withheld read by itself, and the runtime element may
      // be the string the method requires (`[x].join(",")` inside
      // `for x in ["a"] { … }`).
      const joinElement = unfoldAlias(unfoldedTarget.element, this.env);
      const diag = containsWithheldBinderType(joinElement)
        ? undefined
        : checkArrayJoin(joinElement, {
            file: this.file,
            range: e.range,
          });
      if (diag !== undefined) {
        this.diagnostics.push(diag);
      }
    }
    // A2 — a method call on a concrete built-in receiver whose name the theta
    // 1.0 stdlib does not expose. A statically-unresolvable receiver defers to
    // the runtime safety net (no diagnostic).
    const kind = classifyReceiver(unfoldedTarget, this.env);
    if (kind === "unknown") {
      return;
    }
    if (!builtinMembers(kind).has(e.method)) {
      // The RAW `targetType`, not the unfolded copy above: the message names
      // the receiver's declared type, and an alias the author wrote must
      // still read back as itself here, whatever it unfolds to for the
      // checks above.
      this.pushUnknownMethod(e.method, targetType, e.range);
    }
  }

  /**
   * The A2 `unknown-method` check on a bare member (property) access
   * `target.member`. Object *field* access (`obj.field`) is legitimate and is
   * not gated; a member-less primitive (`number` / `integer` / `boolean` /
   * `null`) or a `string` / `array` property outside the stdlib surface is
   * `theta/parse/unknown-method`. A statically-unresolvable receiver defers.
   */
  private checkMemberAccess(
    e: Expr & { kind: "member" },
    bindings: ReadonlyMap<string, CompatType>,
  ): void {
    const receiverType = this.typeOf(e.target, bindings);
    const kind = classifyReceiver(receiverType, this.env);
    if (kind === "unknown" || kind === "object") {
      // Unresolved receiver (defer to runtime) or an object field access
      // (`obj.field` — not a stdlib member surface).
      return;
    }
    if (!builtinMembers(kind).has(e.field)) {
      this.pushUnknownMethod(e.field, receiverType, e.range);
    }
  }

  /** Emit `theta/parse/unknown-method` (message from code-registry-parse.md). */
  private pushUnknownMethod(
    name: string,
    receiverType: CompatType,
    range: Expr["range"],
  ): void {
    this.diagnostics.push({
      severity: "error",
      code: "theta/parse/unknown-method",
      file: this.file,
      range,
      message: `unknown method '${name}' on type ${displayType(receiverType)}`,
    });
  }

  /**
   * A5 — the `+` operand-type check. `+` accepts two numeric operands
   * (addition) or two `string` operands (concatenation); every other concrete
   * pairing is `theta/parse/mixed-plus-operands` (expressions.md §"`+`
   * operator"). Fires only when both operands are statically resolvable.
   */
  private checkPlusOperands(
    e: Expr & { kind: "binary" },
    bindings: ReadonlyMap<string, CompatType>,
  ): void {
    const leftType = this.typeOf(e.left, bindings);
    const rightType = this.typeOf(e.right, bindings);
    const left = classifyOperand(leftType, this.env);
    const right = classifyOperand(rightType, this.env);
    if (left === "unknown" || right === "unknown") {
      return;
    }
    if (
      (left === "numeric" && right === "numeric") ||
      (left === "string" && right === "string")
    ) {
      return;
    }
    this.diagnostics.push({
      severity: "error",
      code: "theta/parse/mixed-plus-operands",
      file: this.file,
      range: e.range,
      message: `'+' has mixed operand types: ${displayType(leftType)} and ${displayType(
        rightType,
      )}`,
    });
  }

  /**
   * A6 — the ordering-operator (`<` / `<=` / `>` / `>=`) operand-type check.
   * Ordering accepts two numeric operands or two `string` operands; every other
   * concrete pairing is `theta/parse/non-orderable-operands` (expressions.md
   * §"Ordering comparisons"). Fires only when both operands are statically
   * resolvable.
   */
  private checkOrderingOperands(
    e: Expr & { kind: "binary" },
    bindings: ReadonlyMap<string, CompatType>,
  ): void {
    const leftType = this.typeOf(e.left, bindings);
    const rightType = this.typeOf(e.right, bindings);
    const left = classifyOperand(leftType, this.env);
    const right = classifyOperand(rightType, this.env);
    if (left === "unknown" || right === "unknown") {
      return;
    }
    if (
      (left === "numeric" && right === "numeric") ||
      (left === "string" && right === "string")
    ) {
      return;
    }
    this.diagnostics.push({
      severity: "error",
      code: "theta/parse/non-orderable-operands",
      file: this.file,
      range: e.range,
      message: `'${e.op}' requires two numeric or two string operands; got ${displayType(
        leftType,
      )} and ${displayType(rightType)}`,
    });
  }
}

/** The direct child expressions of an expression node (for the `?` scan). */
function childExprs(e: Expr): readonly Expr[] {
  switch (e.kind) {
    case "binary":
      return [e.left, e.right];
    case "ternary":
      return [e.condition, e.consequent, e.alternate];
    case "try":
      return [e.operand];
    case "index":
      return [e.target, e.index];
    case "member":
      return [e.target];
    case "array":
      return e.elements;
    case "call":
    case "invoke":
      return e.args;
    case "object":
      return e.fields.map((f) => f.value);
    case "match":
      return [e.scrutinee, ...e.arms.map((arm) => arm.body)];
    case "result-ctor":
      return [e.arg];
    case "method-call":
      return [e.target, ...e.args];
    default:
      return [];
  }
}

/** The direct expressions a statement exposes (for the `?` scan). */
function stmtExprs(s: Stmt): readonly Expr[] {
  switch (s.kind) {
    case "let":
      return s.init !== null ? [s.init] : [];
    case "reassign":
      return [s.value];
    case "if":
    case "while":
      return [s.condition];
    case "for":
      return [s.iterand];
    case "return":
      return s.operand !== null ? [s.operand] : [];
    case "query":
      return [s.query];
    case "tool-call":
      return [s.call];
    case "invoke":
      return [s.invoke];
    case "expr":
      return [s.expr];
    default:
      return [];
  }
}

/** The nested blocks a statement contains (for the `?` scan). */
function stmtBlocks(s: Stmt): readonly Block[] {
  switch (s.kind) {
    case "if": {
      const blocks: Block[] = [s.then];
      if (s.otherwise !== null) {
        if ("statements" in s.otherwise) {
          blocks.push(s.otherwise);
        } else {
          blocks.push(...stmtBlocks(s.otherwise));
        }
      }
      return blocks;
    }
    case "while":
    case "for":
      return [s.body];
    default:
      // A nested `fn` owns its own `?`-scope; do not descend into it here.
      return [];
  }
}
