// V20c — type-layer diagnostics production wiring.
//
// This module prepares the type environment and wires `TypeLayerWalk` in
// `./type-layer-walk` to the `V20b` whole-program static-type substrate so
// the existing `type`-phase checkers (Bucket A: "checkers now feedable") run in
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
//   * `theta/parse/non-numeric-arithmetic-operands` (A7) — the spelled (`-` /
//     `*` / `/` / `%`) and unary-`-` arithmetic operand-type check
//     (expressions.md §"Other arithmetic"; bugs 0332 / 0392),
//   * `theta/parse/non-integer-max` — the `par for` `max` operand check
//     (control-flow.md CTRL-2; bug 0324),
//   * `theta/parse/unknown-method` (A2) — a member / method access on a built-in
//     receiver type outside the theta 1.0 stdlib surface (expressions.md
//     §"Built-in methods and properties").
//
// A5 / A6 / A7 / A2 and the `max` check fire ONLY when the operand / receiver
// static type is concretely resolvable. An operand past the parser's static view (an unresolved
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

import type { BypassParamsField } from "../binder/binder-envelope";
import type { Diagnostic, SourceRange } from "../diagnostics/diagnostic";
import { classifyNamedDecl } from "./named-type-classification";
import { containsNamedType } from "./compat-type-traversal";
import type {
  Block,
  Expr,
  FnParam,
  SchemaFieldSource,
  ThetaBody,
  Stmt,
} from "./theta-document";
import { callWithClauseValues } from "./theta-document";
import {
  checkCompatible,
  resolveNamedRef,
  type CompatType,
  type NamedDecl,
  type TypeEnv,
} from "./type-compat";
import { StaticTypeInferencePass } from "./static-type-inference";
import { annotationSourceIsNotTypeExpression } from "./annotation-validation";
export { annotationSourceIsNotTypeExpression } from "./annotation-validation";
import {
  STRING_MEMBERS,
  STRING_MEMBER_SIGNATURES,
} from "../runtime/stdlib-string";
import type { StdlibMemberSignature } from "../runtime/stdlib-signature";
import { ARRAY_MEMBERS, ARRAY_MEMBER_SIGNATURES } from "../runtime/stdlib-array";
import { OBJECT_MEMBERS, OBJECT_MEMBER_SIGNATURES } from "../runtime/stdlib-object";
import type { EnclosingReturnScope } from "./match-result";
import { collectTopLevelFns } from "./functions";
import { annotationToCompatType, paramsFieldBindings } from "./annotation-compat";
export {
  annotationToCompatType,
  letAnnotationToCompatType,
  splitTopLevelUnion,
} from "./annotation-compat";
import { collectLocalBinderNames } from "./local-binders";
export { collectLocalBinderNames } from "./local-binders";
import { TypeLayerWalk } from "./type-layer-walk";
export { TypeLayerWalk } from "./type-layer-walk";

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

/** The four spelled numeric-only arithmetic operators (expressions.md §"Other arithmetic"). */
const ARITHMETIC_OPS: ReadonlySet<string> = new Set(["-", "*", "/", "%"]);

/**
 * The empty sunk-array set `walkExpr` defaults to: no array node reaching this
 * call carries a sink, so its own `case "array"` runs the sink-less check.
 * Shared and readonly-typed rather than allocated per call — an empty
 * `ReadonlySet` carries no per-call state to isolate.
 */
const NO_SUNK_ARRAYS: ReadonlySet<Expr> = new Set();

/**
 * `Ident` (lexical.md: `[A-Za-z_][A-Za-z0-9_]*`) — tests a `FnParam.name`
 * against the shape a well-formed parameter list can only ever hold, so
 * `checkFnCallArgs` (bug 0131 §(c)) can tell a genuine parameter list from one
 * a `fn-param-not-identifier` recovery captured a non-identifier token into.
 */
const FN_PARAM_NAME_IS_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Whether every name in a `fn`'s parameter list is `Ident`-shaped
 * (lexical.md: `[A-Za-z_][A-Za-z0-9_]*$`) — i.e. a genuine parameter list
 * rather than one a `fn-param-not-identifier` recovery (bug 0225) captured a
 * non-identifier token into, whose recorded COUNT the author never wrote.
 * Exported so the compose-layer imported-`fn`-call-argument route (bug 0138,
 * `checkImportedFnCallArgs`, ../extension/invoke-static-checks.ts) shares this
 * withhold with the same-file `checkFnCallArgs` site below rather than
 * re-deriving it — one predicate serves both routes.
 */
export function fnParamNamesAreIdentifiers(params: readonly FnParam[]): boolean {
  return params.every((p) => FN_PARAM_NAME_IS_IDENT.test(p.name));
}

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
    case "named":
      return classifyNamedDecl(
        resolveNamedRef(env, type),
        "other",
        (rhs) => classifyOperand(rhs, env),
      );
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
    case "named":
      return classifyNamedDecl(
        resolveNamedRef(env, type),
        "object",
        (rhs) => classifyReceiver(rhs, env),
      );
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
 * Bug 0315 — the declared signature (arity + per-parameter type descriptors)
 * for a stdlib member on a concrete built-in receiver kind, or `undefined`
 * for a receiver kind with no member surface (`number` / `integer` /
 * `boolean` / `null`) — those never reach the lookup, because
 * `checkMethodCall` only calls this after `builtinMembers(kind).has(e.method)`
 * has already confirmed a known member, and `EMPTY_MEMBERS` above makes that
 * `has` always `false` for those kinds.
 */
function stdlibSignatureFor(
  kind: BuiltinReceiver,
  method: string,
): StdlibMemberSignature | undefined {
  switch (kind) {
    case "string":
      return STRING_MEMBER_SIGNATURES.get(method);
    case "array":
      return ARRAY_MEMBER_SIGNATURES.get(method);
    case "object":
      return OBJECT_MEMBER_SIGNATURES.get(method);
    default:
      return undefined;
  }
}

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
 * Project the frontmatter `params:` fields into {@link ParamsFieldSource}
 * records: `wireName` (the `params:` YAML key exactly as written) becomes
 * `name`, and `type` (the verbatim declared type source — frontmatter.ts's
 * `splitParamValue` sets it unchanged) becomes `typeSource`. The ONE
 * projection the in-file type-layer walk (`theta-document.ts`), the callee
 * arity check (`resolveCalleeArity`), and the callee return-type inference
 * (`resolveCalleeReturnType`) all share, so the consumers cannot silently
 * drift over which identifier carries which declared type.
 */
export function paramsFieldsFromFrontmatter(
  fields: readonly BypassParamsField[] | undefined,
): readonly ParamsFieldSource[] {
  return (fields ?? []).map((field) => ({ name: field.wireName, typeSource: field.type }));
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
 * C-bucket wiring (V20c): the whole-document battery
 * (`runWholeDocumentChecks`, theta-document.ts) runs this pass against the
 * `V20b` per-expression static-type substrate so the `type`-phase checkers
 * fire in production (non-boolean condition, non-array iterand, `?` misuse,
 * array/return LUB, integer narrowing, match-arm mismatch, non-indexable /
 * object-index / array-join, and — bug 0050 — a plain `fn` call's argument
 * types). The `params:` field wire names are the same whole-file local-binder
 * source `checkLexicalCallSites` reads, so a frontmatter parameter shadows a
 * same-named top-level `fn` exactly as a `let` binding does.
 *
 * NAME-KEYING ADJUDICATION: `wireName` is the body-visible identifier at the
 * battery's `params:` projection — four independent sources agree, not merely
 * a convenient pick. (i) frontmatter.ts sets `wireName: name` in the SAME loop
 * iteration that pushes `ParamFieldInput`'s `name` from the same local
 * variable, so the two are byte-identical by construction. (ii)
 * src/extension/production-composition.ts's own comment on its tool-arg /
 * invoke-arg projection: 'wireName is the params: YAML key exactly as
 * written'. (iii) frontmatter-fields-b-and-templates.md §${param} templates:
 * '${param.field} paths use theta-side params names throughout — never an
 * as "WireName" rename target', consistent with the Runtime Value Model
 * invariant that theta code never sees wire names — that rename applies only
 * at the schema-field / inline-object positions (bug 0160), never at
 * `params:`. (iv) `checkLexicalCallSites`'s `rootLocals` already keys its
 * root scope by `f.wireName` and is the shipped reader that resolves body
 * identifiers, so this is that same key.
 *
 * REJECTED: `paramFields` (`ParamFieldInput`, `name` + `typeSource`) is also
 * in scope at the battery's call and carries identical values for that
 * position, but it is populated whenever a frontmatter BLOCK exists, whereas
 * `frontmatter` is `null` when the frontmatter does not register — reading it
 * instead would silently widen bug 0050's shadowing set for a document with
 * no registered frontmatter, a behaviour change bug 0192's report does not
 * claim.
 */
/**
 * Build the `V20b` pass / `TypeEnv` / `TypeLayerWalk` triple `checkTypeLayer`
 * and `inferCalleeReturnPayload` both need, so the two callers construct the
 * checker identically rather than by two independently-maintained copies
 * drifting apart. `runtimeToolSuccessTypes` is `checkTypeLayer`'s own RFC 0011
 * seam; `inferCalleeReturnPayload` has no analogous input and omits it.
 */
function buildTypeLayerWalk(
  body: ThetaBody,
  file: string,
  paramsFields: readonly ParamsFieldSource[],
  runtimeToolSuccessTypes?: ReadonlyMap<string, CompatType>,
): { readonly checker: TypeLayerWalk } {
  const pass = new StaticTypeInferencePass({
    checkCompatible,
    enumNames: collectEnumNames(body.statements),
    ...(runtimeToolSuccessTypes !== undefined ? { runtimeToolSuccessTypes } : {}),
  });
  const env = collectTypeEnv(body.statements);
  const fnReturns = collectFnReturnAnnotations(body.statements);
  const fnDecls = collectTopLevelFns(body.statements);
  const importedSymbols = collectImportedSymbols(body.statements);
  const shadowedNames = collectLocalBinderNames(
    body,
    paramsFields.map((f) => f.name),
  );
  const checker = new TypeLayerWalk(
    pass,
    env,
    file,
    fnReturns,
    fnDecls,
    importedSymbols,
    shadowedNames,
  );
  return { checker };
}

export function checkTypeLayer(
  body: ThetaBody,
  file: string,
  paramsFields: readonly ParamsFieldSource[],
  // RFC 0011 (seam sheet §0 C6): structural return-type flow for declared
  // runtime tools. GOV-15 inert: absent / empty for every 1.0.0-clean file.
  runtimeToolSuccessTypes?: ReadonlyMap<string, CompatType>,
): Diagnostic[] {
  const { checker } = buildTypeLayerWalk(body, file, paramsFields, runtimeToolSuccessTypes);
  checker.walkBlock(body, paramsFieldBindings(paramsFields), {
    returnScope: { kind: "inferred" },
  });
  return checker.diagnostics;
}

/**
 * Infer a whole-`.theta` callee's final-value payload — the same inference
 * `checkSubagentReturnAnnotation` runs for an in-file `subagent fn`'s tail —
 * for the cross-file `invoke<Schema>` return-type leg
 * (invocation.md §"Typed return" / the Empty-tail callee compatibility
 * clause; bug 0473). Returns `undefined` when the payload is not decidable
 * without callee-namespace resolution.
 *
 * The compatibility relation `T_calleeReturn ⊑ Schema` the caller runs
 * afterwards is decided in the CALLER's `TypeEnv`, because `Schema` is the
 * caller's own annotation — but a `named` node inside the inferred payload
 * names a declaration in the CALLEE's namespace, which the caller's `TypeEnv`
 * cannot resolve. Deciding it there anyway risks a false positive: a
 * same-spelled but unrelated caller-side declaration (a homonym) would answer
 * for a name it does not actually denote. So a payload containing ANY `named`
 * node is deferred here (`undefined`) rather than risk that — leaving it to
 * the runtime AJV net, exactly as `checkInvokeReturnType` already defers a
 * non-statically-resolvable operand. What remains decidable without any
 * callee-namespace lookup — primitives, literals (including the FN-4
 * empty-tail `null`), and their structural (`array`/`union`/`object`)
 * compositions — is exactly the set this check covers.
 */
export function inferCalleeReturnPayload(
  body: ThetaBody,
  file: string,
  paramsFields: readonly ParamsFieldSource[],
): CompatType | undefined {
  const { checker } = buildTypeLayerWalk(body, file, paramsFields);
  const payload = checker.inferFinalValuePayload(body, paramsFieldBindings(paramsFields));
  if (payload === undefined || containsNamedType(payload)) {
    return undefined;
  }
  return payload;
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
 * The whole file's declared `enum` names (bug 0191 §Fix route 1), collected
 * over the same `statements` `collectTypeEnv` and `checkStructural`
 * (../parser/theta-document.ts) already walk. Threaded into
 * `StaticTypeInferencePass` so its member-access arm (`#memberType`,
 * ./static-type-inference.ts) can recognise an `Enum.Variant` receiver AHEAD
 * of the `TypeEnv` schema lookup — an enum name never entered `TypeEnv` itself
 * (bug 0038 residual (iii), a deliberate §Non-goal this report does not
 * reopen), so this is a second, narrower record next to it, not a widening of
 * it.
 *
 * Deliberately NOT a `TypeEnv`-shaped record: the one consumer needs only
 * membership, never a declaration to resolve through, and a same-file
 * `enum X` / `schema X` pair (legal, lexical.md:18) would otherwise force a
 * choice about which of the two collections owns the key `X`.
 */
export function collectEnumNames(statements: readonly Stmt[]): ReadonlySet<string> {
  const names = new Set<string>();
  for (const stmt of statements) {
    if (stmt.kind === "enum") {
      names.add(stmt.name);
    }
  }
  return names;
}

/**
 * A dummy `SourceRange` for `inferFinalValuePayload`'s `resolveReturnType`
 * call: that call's `site` is read only by a no-common-type diagnostic this
 * whole-body inference path discards (it returns the resolved payload, never
 * `resolveReturnType`'s own diagnostics), so no real range exists to supply.
 * A function (not a module-level object literal): conventions.md's "no
 * globals/statics" rule bans a shared mutable module-level object, and the
 * H2a architectural gate (`tools/arch-checks/no-module-level-mutable.js`)
 * enforces it mechanically on the initializer shape, so a fresh literal per
 * call is the allowed form.
 */
function placeholderSiteRange(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } };
}

/**
 * The declared return-type annotation of every top-level `fn` that wrote one,
 * keyed by name (bug 0079 §Fix (a)). This is the static gate's only source for
 * a callee's declared `Result`-ness: `TypeEnv` (type-compat.ts) holds `schema`
 * declarations only, and a `call` node's inferred type is its callee's bare
 * NAME (static-type-inference.ts), never its declared return type — so an
 * annotated `fn`'s `Result<…>` return is otherwise invisible past the call
 * site. Top-level only, mirroring `collectTopLevelFns` (functions.ts): a
 * nested `fn`'s return annotation is not this gate's concern.
 *
 * An annotation deriving from none of `Type`'s six alternatives is OMITTED —
 * the invariant bug 0124 §Fix (f)(1) rests on is established HERE, at the point
 * the value enters this layer, so a refused annotation is structurally absent
 * to every present and future reader of this table instead of each reader
 * having to re-test the text. The distinction matters because the table's text
 * is read by PREFIX (`isResultAnnotation`'s `/^Result\b/`, whose `\b` matches
 * between a word character and punctuation), so a present `Result--` entry
 * would GRANT `Result`-ness to a `fn` returning a plain string and draw a
 * `theta/parse/interpolated-result` no author earned. Withholding here loses
 * nothing a well-formed annotation would have earned: a well-formed annotation
 * is never refused, and the refused theta does not register either way.
 */
function collectFnReturnAnnotations(statements: readonly Stmt[]): ReadonlyMap<string, string> {
  const fnReturns = new Map<string, string>();
  for (const stmt of statements) {
    if (
      stmt.kind === "fn" &&
      stmt.returnType !== null &&
      !annotationSourceIsNotTypeExpression(stmt.returnType)
    ) {
      fnReturns.set(stmt.name, stmt.returnType);
    }
  }
  return fnReturns;
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
      // RFC 0009: a `?` inside a call-site `with` clause value is scanned as one
      // inside an argument is.
      return [...e.args, ...callWithClauseValues(e)];
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

export {
  ARITHMETIC_OPS,
  NO_SUNK_ARRAYS,
  ORDERING_OPS,
  PRIMITIVE_NAMES,
  builtinMembers,
  childExprs,
  classifyOperand,
  classifyReceiver,
  placeholderSiteRange,
  stdlibSignatureFor,
  stmtBlocks,
  stmtExprs,
  type WalkCtx,
};
