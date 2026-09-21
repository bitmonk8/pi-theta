// Per-site TYPE-9 compatibility diagnostics, index-receiver classification,
// and the array/ternary common-type join over the compatibility engine.

import { type Diagnostic, type SourceRange } from "../diagnostics/diagnostic";
import { classifyNamedDecl } from "./named-type-classification";
import {
  checkCompatible,
  displayType,
  resolveNamedRef,
  unfoldAlias,
  widenLiteralTypes,
  type Compatibility,
  type CompatType,
  type PrimitiveName,
  type TypeEnv,
} from "./type-compat";

/** A located site at which a compatibility check reports a parse-time diagnostic. */
export interface CompatSite {
  readonly file: string;
  readonly range: SourceRange;
}

/**
 * How an indexed-access receiver `a` in `a[k]` types statically
 * (expressions.md §"Supported forms"): only `array<T>` and object values are
 * indexable.
 *
 *   - `"array"`     — an `array<T>`, indexable by integer position;
 *   - `"object"`    — an object value (a nominal `object-schema` `NamedType`,
 *                     an alias transparently resolving to one, or an inline
 *                     object type), indexable by `string` theta-side name;
 *   - `"primitive"` — a `string` / `number` / `integer` / `boolean` / `null`
 *                     receiver, which is not indexable
 *                     (`theta/parse/non-indexable-receiver`);
 *   - `"unknown"`   — statically unresolvable past the parser's view (an
 *                     unresolved `NamedType`, a union): deferred to the runtime
 *                     safety net, raising no `type`-phase diagnostic.
 */
export type IndexReceiverKind = "array" | "object" | "primitive" | "unknown";

/**
 * Classify an indexed-access receiver's static type as `array<T>`, an object
 * value, a non-indexable primitive, or statically-unknown. A `NamedType`
 * resolves through `env`: a nominal `object-schema` declaration is an object
 * value, a transparent `alias` is classified by its RHS (TYPE-11), and an
 * unresolved name is `"unknown"` (deferred to the runtime safety net).
 */
export function classifyIndexReceiver(
  type: CompatType,
  env: TypeEnv,
): IndexReceiverKind {
  switch (type.kind) {
    case "array":
      return "array";
    case "object":
      return "object";
    case "prim":
    case "literal":
      return "primitive";
    case "union":
      return "unknown";
    case "named":
      return classifyNamedDecl(
        resolveNamedRef(env, type),
        "object",
        (rhs) => classifyIndexReceiver(rhs, env),
      );
  }
}

/**
 * TYPE-9 — the RHS of a typed binding `let x: T = expr`. Reports
 * `theta/parse/let-rhs-type-mismatch` when the RHS static type is not `⊑` the
 * annotation `T` (both statically resolvable), or `theta/parse/integer-narrowing`
 * when the failure is specifically a `number` RHS under an `integer` annotation
 * (TYPE-2's one-way widening). Returns no diagnostic when the relation holds.
 */
export function checkLetRhsCompat(opts: {
  readonly name: string;
  readonly annotation: CompatType;
  readonly rhs: CompatType;
  readonly env: TypeEnv;
  readonly site: CompatSite;
}): Diagnostic[] {
  const { name, annotation, rhs, env, site } = opts;
  const r = checkCompatible(rhs, annotation, env);
  if (r === "compatible" || r === "unknown") {
    // Compatible, or statically unresolvable — the latter defers to the runtime
    // AJV safety net (type-system.md §"Unresolvable operands").
    return [];
  }
  if (r === "integer-narrowing") {
    // TYPE-2 — a `number` RHS under an `integer` annotation. Message from
    // diagnostics/code-registry-parse.md.
    return [
      {
        severity: "error",
        code: "theta/parse/integer-narrowing",
        file: site.file,
        range: site.range,
        message: "cannot narrow number to integer",
      },
    ];
  }
  // TYPE-9 — incompatible RHS. Message from diagnostics/code-registry-parse.md.
  return [
    {
      severity: "error",
      code: "theta/parse/let-rhs-type-mismatch",
      file: site.file,
      range: site.range,
      message: `let binding '${name}' initialiser type mismatch: expected ${displayType(
        annotation,
      )}, got ${displayType(rhs)}`,
    },
  ];
}

/**
 * TYPE-9 — a plain top-level `fn` argument slot. Reports
 * `theta/parse/fn-arg-type-mismatch` when the argument's static type is not `⊑`
 * the matched parameter's declared type (both statically resolvable). Returns
 * no diagnostic when the relation holds.
 */
export function checkFnArgCompat(opts: {
  readonly fnName: string;
  readonly index: number;
  readonly paramName: string;
  readonly paramType: CompatType;
  readonly argType: CompatType;
  readonly env: TypeEnv;
  readonly site: CompatSite;
}): Diagnostic[] {
  const { fnName, index, paramName, paramType, argType, env, site } = opts;
  const r = checkCompatible(argType, paramType, env);
  if (r === "compatible" || r === "unknown") {
    return [];
  }
  // TYPE-9 — a plain `fn` argument slot mismatch (a `number⊑integer` narrowing
  // is equally a mismatch here; TYPE-9 routes both through fn-arg-type-mismatch).
  // Message from diagnostics/code-registry-parse.md.
  return [
    {
      severity: "error",
      code: "theta/parse/fn-arg-type-mismatch",
      file: site.file,
      range: site.range,
      message: `fn '${fnName}' argument ${index} ('${paramName}') type mismatch: expected ${displayType(
        paramType,
      )}, got ${displayType(argType)}`,
    },
  ];
}

/**
 * TYPE-9 — a schema-constructor field value against its declared field type
 * (`Schema { field: expr, … }`). Reports `theta/parse/object-field-type-mismatch`
 * when the field value's static type is not `⊑` the schema's declared type for
 * that field (both statically resolvable), or `theta/parse/integer-narrowing`
 * when the failure is specifically a `number` value under an
 * `integer`-declared field (TYPE-2's one-way widening) — the same routing
 * `checkLetRhsCompat` applies at the typed-`let` sink. Returns no diagnostic
 * when the relation holds or is statically unresolvable.
 *
 * `forceIncompatible` decides a `Result` constructor value (`Ok(...)` /
 * `Err(...)`) outright, bypassing `checkCompatible`: every declared field type
 * is lowerable (`theta/parse/result-in-schema-position` makes a `Result`-typed
 * field undeclarable), so a `Result` value is incompatible with whatever the
 * field declares — but a `result-ctor` types as an unresolvable named
 * `Ok`/`Err` (`static-type-inference.ts`), which `checkCompatible` alone
 * answers `"unknown"` for at every sink.
 */
export function checkObjectFieldCompat(opts: {
  readonly schema: string;
  readonly field: string;
  readonly declared: CompatType;
  readonly value: CompatType;
  readonly env: TypeEnv;
  readonly site: CompatSite;
  readonly forceIncompatible?: boolean;
}): Diagnostic[] {
  const { schema, field, declared, value, env, site, forceIncompatible } = opts;
  const r = forceIncompatible === true ? "incompatible" : checkCompatible(value, declared, env);
  if (r === "compatible" || r === "unknown") {
    return [];
  }
  if (r === "integer-narrowing") {
    // TYPE-2 — a `number` value under an `integer`-declared field. Message
    // from diagnostics/code-registry-parse.md.
    return [
      {
        severity: "error",
        code: "theta/parse/integer-narrowing",
        file: site.file,
        range: site.range,
        message: "cannot narrow number to integer",
      },
    ];
  }
  // Incompatible field value. Message from diagnostics/code-registry-parse.md.
  return [
    {
      severity: "error",
      code: "theta/parse/object-field-type-mismatch",
      file: site.file,
      range: site.range,
      message: `field '${field}' on schema '${schema}' type mismatch: expected ${displayType(
        declared,
      )}, got ${displayType(value)}`,
    },
  ];
}

/**
 * TYPE-9 — the array-and-ternary common-type machinery. Given the branch
 * element types (ternary branches or array-literal elements) and an optional
 * in-scope element `sink`:
 *
 *   - with a `sink`: reports `theta/parse/array-element-type-mismatch` at the
 *     first branch whose type is not `⊑` the sink's element type;
 *   - without a `sink`: reports `theta/parse/array-no-common-type` when the
 *     branches share no common type that narrows them.
 *
 * Returns no diagnostic when the branches resolve against the sink (or share a
 * common type).
 */
export function checkCommonType(opts: {
  readonly branches: readonly CompatType[];
  readonly sink: CompatType | undefined;
  readonly env: TypeEnv;
  readonly site: CompatSite;
}): Diagnostic[] {
  const { branches, sink, env, site } = opts;

  // With an in-scope sink: each branch must be `⊑` the sink's element type.
  // Report the first branch that fails (skipping statically-unresolvable
  // branches, which the runtime AJV safety net covers).
  if (sink !== undefined) {
    for (let i = 0; i < branches.length; i++) {
      const branch = branches[i] as CompatType;
      const r = checkCompatible(branch, sink, env);
      if (r === "compatible" || r === "unknown") {
        continue;
      }
      // Message from diagnostics/code-registry-parse.md.
      return [
        {
          severity: "error",
          code: "theta/parse/array-element-type-mismatch",
          file: site.file,
          range: site.range,
          message: `array element type mismatch at index ${i}: expected ${displayType(
            sink,
          )}, got ${displayType(branch)}`,
        },
      ];
    }
    return [];
  }

  // Without a sink: the branches need a common type — a branch every other
  // branch is `⊑` (the array/ternary LUB). Fewer than two branches trivially
  // share one.
  if (branches.length < 2 || commonType(branches, env, checkCompatible) !== undefined) {
    return [];
  }
  // Message from diagnostics/code-registry-parse.md.
  return [
    {
      severity: "error",
      code: "theta/parse/array-no-common-type",
      file: site.file,
      range: site.range,
      message:
        "array elements have no common type; annotate the binding with array<A | B> or use a single schema",
    },
  ];
}

/**
 * The `⊑` relation as a constructor-injected parameter: `commonType` below is
 * called from this module's own `checkCommonType`, over `checkCompatible`, and
 * from `StaticTypeInferencePass.#commonType` (`./static-type-inference.ts`),
 * over that pass's injected `V2b` engine. Parameterising the relation, rather
 * than importing `checkCompatible` into the inference pass or re-implementing
 * the LUB there, is what makes the checker and the inference pass compute the
 * same answer for the same candidate set — there is one decision procedure
 * behind both calls, not two that could drift apart.
 */
export type CompatRelation = (sub: CompatType, sup: CompatType, env: TypeEnv) => Compatibility;

/**
 * The array/ternary common type of `branches` under `relate` (the `⊑`
 * relation) — their least upper bound, per expressions.md §"Array
 * construction" rule 2 and type-system.md §"Common-type rules" rule 2.
 * `undefined` means rule 3: no common type exists, the
 * `theta/parse/array-no-common-type` case.
 *
 * Three clauses, in the order the spec states them:
 *
 *   1. a branch `C` that every branch is `⊑` IS the least upper bound —
 *      TYPE-1 identical collapse and TYPE-2 `integer → number` widening. Each
 *      candidate is widened to the primitive it types as ([TYPE-3](../../docs/spec_topics/type-system.md#type-3))
 *      via `widenLiteralTypes` before this domination test, so a `literal`
 *      candidate carries the same absorbing power as the `prim` it types as
 *      rather than less — the LUB a dominating candidate returns is the
 *      WIDENED candidate, which is why the reduced element type is a
 *      primitive rather than a literal. A statically-unresolvable branch does
 *      not block a candidate, so a set holding one collapses onto the
 *      dominating branch rather than being treated as disjoint from it
 *      (type-system.md §"Unresolvable operands");
 *   2. otherwise the branches union, arms VERBATIM in receiver-first (source)
 *      order — the computed type is not a member of the input set (`["a",
 *      null]` → `string | null`). `concatElementType`
 *      (`../runtime/stdlib-string.ts`) computes the same union in the same
 *      order for `array<T>.concat`, and the two are MIRRORED rather than
 *      shared: `concatElementType` treats an `"unknown"` relation as
 *      DISJOINT (it unions), where clause 1 above treats it as NON-BLOCKING
 *      (it collapses onto the dominating branch). Sharing one function would
 *      silently change `array<T>.concat`'s behaviour on an unresolvable
 *      element type, which is out of this fix's scope;
 *   3. EXCEPT — a branch set holding an object branch (an alias-unfolded
 *      inline object, TYPE-8, or a `named` resolving to an object-schema
 *      declaration, TYPE-10) has no common type unless one branch already
 *      dominates: object schemas do not unify implicitly. The gate is on the
 *      branch KINDS, never applied blanket, so a set of arrays, unions or
 *      primitives that merely disagree still unions.
 *
 * An empty `branches` has no least upper bound to compute and answers
 * `undefined` directly: the search below would find no dominating candidate
 * and no object branch either, and fall through to an empty union, which is
 * not a type this function may return.
 */
export function commonType(
  branches: readonly CompatType[],
  env: TypeEnv,
  relate: CompatRelation,
): CompatType | undefined {
  if (branches.length === 0) {
    return undefined;
  }
  // Widen each candidate to the primitive it types as (TYPE-3) before the
  // domination test: an unwidened `literal` candidate carries less absorbing
  // power than the `prim` it types as, so a `literal number` candidate could
  // not absorb a `prim integer` branch even though `integer ⊑ number` holds
  // (TYPE-2) — bug 0344. `widenLiteralTypes` returns a non-literal candidate
  // by reference, so this changes nothing for an already-`prim` candidate.
  // The dominating branch returned is the WIDENED candidate, so the LUB is a
  // primitive rather than a literal.
  const dominating = branches
    .map((candidate) => widenLiteralTypes(candidate))
    .find((candidate) =>
      branches.every((branch) => {
        const r = relate(branch, candidate, env);
        return r === "compatible" || r === "unknown";
      }),
    );
  if (dominating !== undefined) {
    return dominating;
  }
  if (branches.some((branch) => isObjectBranch(branch, env))) {
    return undefined;
  }
  return { kind: "union", arms: branches };
}

/**
 * Whether `branch` is one of the object shapes rule 3 excludes from implicit
 * unification: an alias-unfolded inline object type (TYPE-8), or a `named`
 * type resolving to an object-schema declaration (TYPE-10). Aliases are
 * unfolded first (TYPE-11), so an alias of an object schema counts as the
 * object schema it is transparent with. An unresolvable `named` is never an
 * object branch — it is past the parser's static view, and a set holding one
 * never reaches this gate anyway, because clause 1 above already treats an
 * unresolvable branch as dominating whatever it is compared against.
 *
 * A branch whose alias-unfolded kind is `union` — a value statically typed
 * through a discriminated-union alias (`schema Animal = Cat | Dog`) — is
 * therefore never an object branch either: TYPE-11 already replaced it with the
 * union its declaration names, and neither disjunct above tests a `union` kind.
 * A set holding one takes rule 2's union clause, not this gate. Recorded as the
 * disposition rather than an oversight: the author already declared the union,
 * TYPE-11 makes the alias transparent ahead of this test, and the settled route
 * gates on branch KIND, which `union` is not.
 */
function isObjectBranch(branch: CompatType, env: TypeEnv): boolean {
  const unfolded = unfoldAlias(branch, env);
  return (
    unfolded.kind === "object" ||
    (unfolded.kind === "named" && resolveNamedRef(env, unfolded)?.kind === "object-schema")
  );
}

// --- the `params:` default position (frontmatter-fields-a.md §Defaults) ------

/** The five `PrimitiveType` spellings, as the `Type` grammar admits them. */
const PRIMITIVE_TYPE_NAMES: ReadonlySet<string> = new Set<PrimitiveName>([
  "string",
  "number",
  "integer",
  "boolean",
  "null",
]);

/**
 * Project a `params:` field's declared type SOURCE onto the `CompatType` model,
 * for the compatibility check at the field's own default (§Defaults). Handles
 * the primitive names, top-level unions (`A | B`), and `array<T>`; every other
 * spelling — a `NamedType`, an alias, an inline object type, a literal type —
 * becomes a nominal `named` reference, which the relation answers `"unknown"`
 * for against an empty environment and the sink therefore defers on.
 *
 * `splitUnion` is the caller's top-level-`|` splitter, injected rather than
 * imported: the `params:` parser sits BELOW the type layer in this package's
 * module graph (the type layer reads whole parsed documents, which are parsed
 * in part by the `params:` parser), so the frontmatter position cannot reach
 * the type layer's own splitter without inverting that layering. One splitter
 * is threaded in instead of a second one being written here, so both positions
 * agree on where a union arm begins.
 */
export function paramsDeclaredCompatType(
  typeSource: string,
  splitUnion: (source: string) => string[],
): CompatType | undefined {
  const text = typeSource.trim();
  if (text.length === 0) {
    return undefined;
  }
  const arms = splitUnion(text);
  if (arms.length > 1) {
    const armTypes: CompatType[] = [];
    for (const arm of arms) {
      const armType = paramsDeclaredCompatType(arm, splitUnion);
      if (armType === undefined) {
        // One undecidable arm makes the whole union undecidable: dropping it
        // would silently narrow the declared type and refuse a default the
        // dropped arm admits.
        return undefined;
      }
      armTypes.push(armType);
    }
    return { kind: "union", arms: armTypes };
  }
  const arrayMatch = /^array<(.+)>$/.exec(text);
  if (arrayMatch !== null) {
    const element = paramsDeclaredCompatType(arrayMatch[1] ?? "", splitUnion);
    return element === undefined ? undefined : { kind: "array", element };
  }
  if (PRIMITIVE_TYPE_NAMES.has(text)) {
    return { kind: "prim", name: text as PrimitiveName };
  }
  return { kind: "named", name: text };
}

/**
 * A `params:` field's declared default literal against the field's declared
 * type (frontmatter-fields-a.md §Defaults: "The default literal's static type
 * must be compatible with the param's declared type per Type System — Type
 * compatibility"). Reports `theta/parse/params-default-type-mismatch` when the
 * default's static type is not `⊑` the declared type (both statically
 * resolvable), or `theta/parse/integer-narrowing` when the failure is
 * specifically a `number` default under an `integer`-declared param (TYPE-2's
 * one-way widening) — the routing §Defaults names by code, and the same routing
 * `checkLetRhsCompat` and `checkObjectFieldCompat` apply at their own sinks.
 * Returns no diagnostic when the relation holds or is statically unresolvable.
 */
export function checkParamsDefaultCompat(opts: {
  readonly param: string;
  readonly declared: CompatType;
  readonly value: CompatType;
  readonly env: TypeEnv;
  readonly site: CompatSite;
}): Diagnostic[] {
  const { param, declared, value, env, site } = opts;
  const r = checkCompatible(value, declared, env);
  if (r === "compatible" || r === "unknown") {
    return [];
  }
  if (r === "integer-narrowing") {
    // TYPE-2 — a `number` default under an `integer`-declared param. Message
    // from diagnostics/code-registry-parse.md.
    return [
      {
        severity: "error",
        code: "theta/parse/integer-narrowing",
        file: site.file,
        range: site.range,
        message: "cannot narrow number to integer",
      },
    ];
  }
  // Incompatible default. Message from diagnostics/code-registry-parse.md.
  return [
    {
      severity: "error",
      code: "theta/parse/params-default-type-mismatch",
      file: site.file,
      range: site.range,
      message: `param '${param}' default type mismatch: expected ${displayType(
        declared,
      )}, got ${displayType(value)}`,
    },
  ];
}

/**
 * TYPE-9 — the RHS of a reassignment statement (`x = e`, and the five compound
 * forms `+=`, `-=`, `*=`, `/=`, `%=`; bindings.md §Reassignment), judged
 * against the TARGET binding's declared-or-inferred type. `bindings.md`'s
 * `#reassignment-binding-type` adjudication (bug 0090) is why `declared` is
 * fixed at the binding's recorded type rather than re-derived from the write:
 * a reassignment does not change what a binding's later references resolve
 * to, so the RHS is judged against that unchanged type, not against itself.
 * Reports `theta/parse/reassign-rhs-type-mismatch` when the RHS static type is
 * not `⊑` the target's type (both statically resolvable), or
 * `theta/parse/integer-narrowing` when the failure is specifically a `number`
 * RHS under an `integer` target (TYPE-2's one-way widening) — the ALREADY-
 * REGISTERED row `checkLetRhsCompat` and `checkParamsDefaultCompat` route the
 * same narrowing outcome to, since it is not position-scoped (bug 0115 §Fix
 * (c)). Returns no diagnostic when the relation holds or is statically
 * unresolvable.
 */
export function checkReassignRhsCompat(opts: {
  readonly name: string;
  readonly declared: CompatType;
  readonly value: CompatType;
  readonly env: TypeEnv;
  readonly site: CompatSite;
}): Diagnostic[] {
  const { name, declared, value, env, site } = opts;
  const r = checkCompatible(value, declared, env);
  if (r === "compatible" || r === "unknown") {
    return [];
  }
  if (r === "integer-narrowing") {
    // TYPE-2 — a `number` RHS under an `integer`-typed target. Message from
    // diagnostics/code-registry-parse.md.
    return [
      {
        severity: "error",
        code: "theta/parse/integer-narrowing",
        file: site.file,
        range: site.range,
        message: "cannot narrow number to integer",
      },
    ];
  }
  // Incompatible reassignment RHS. Message from diagnostics/code-registry-parse.md.
  return [
    {
      severity: "error",
      code: "theta/parse/reassign-rhs-type-mismatch",
      file: site.file,
      range: site.range,
      message: `reassignment of '${name}' type mismatch: expected ${displayType(
        declared,
      )}, got ${displayType(value)}`,
    },
  ];
}
