// V2b / V2b-T — the type-compatibility engine (`⊑`) seam.
//
// This module owns the single normative compatibility relation `T₁ ⊑ T₂` of
// type-system.md §"Type compatibility" (TYPE-1…TYPE-11) and the per-site
// parse-time diagnostics that report a static mismatch (TYPE-9). The relation
// is the structural-cases engine the parser must decide without falling back
// to AJV; the cases it recognises are closed for theta 1.0 (type-system.md
// §"Structural cases the parser must recognise").
//
// The engine operates over a small `CompatType` model — the resolved shape of
// a type expression for compatibility purposes — and a `TypeEnv` that resolves
// `NamedType`s to their declarations. The declaration kind drives the nominal
// vs transparent split:
//
//   - an object schema (`schema X { ... }`) is **nominal** (TYPE-10): it is
//     `⊑`-related only by name identity (reflexivity), variant-to-union
//     membership, and union widening/distribution — never structurally across
//     the inline/named boundary or across two distinct named schemas;
//   - a type-alias schema (`schema X = R`) is **transparent** (TYPE-11): it is
//     replaced by its right-hand side `R` and the check re-evaluated, recursing
//     through nested aliases until a non-alias form is reached. Aliasing an
//     object schema unfolds to that object schema, which re-enters TYPE-10.
//
// V2b implements the decision procedure: `checkCompatible` decides the
// directed relation `T₁ ⊑ T₂` over the `CompatType` model (TYPE-1…TYPE-11) and
// the three per-site checkers report the parse-time mismatch diagnostics
// (TYPE-9). An operand past the parser's static view (an unresolvable `named`
// reference) yields `"unknown"`, at which point the per-site checkers emit no
// diagnostic and the runtime AJV check is the safety net (type-system.md
// §"Unresolvable operands").

import { type Diagnostic, type SourceRange } from "../diagnostics/diagnostic";

/** The JSON-native primitive type names (type-system.md §"Type System"). */
export type PrimitiveName = "string" | "number" | "integer" | "boolean" | "null";

/**
 * The resolved type shape the compatibility engine operates over. This is a
 * compatibility-purpose projection of a parsed type expression, not the full
 * type AST:
 *
 *   - `prim`    — a primitive type (`string`, `number`, `integer`, `boolean`,
 *                 `null`).
 *   - `literal` — a literal type (`"foo"`, `42`, `true`, `null`); `typesAs`
 *                 records the primitive the literal value statically types as
 *                 in expression position, which drives TYPE-3.
 *   - `named`   — a `NamedType` reference, resolved through `TypeEnv`; an
 *                 object-schema declaration is nominal (TYPE-10), an alias
 *                 declaration is transparent (TYPE-11). `withheld` and
 *                 `enumRef` are both provenance, not grammar, and both work
 *                 the same way: each distinguishes the engine's own mint
 *                 (`withheldBinderType()` / `enumVariantType()` below) from an
 *                 author-spelled type slice that happens to carry the same
 *                 name (bug 0143's `withheld` finding, generalised) — the
 *                 corresponding decision keys on the marker, never on `name`
 *                 alone. Only `withheldBinderType()` may set `withheld`, and
 *                 only `enumVariantType()` may set `enumRef` (bug 0191 §Fix
 *                 route 1): a `named` marked `enumRef` names a declared
 *                 `enum`, by spelling, for DISPLAY only — `resolveNamedRef`
 *                 below resolves it to no declaration, whatever a same-file
 *                 `schema` of that spelling holds, so an enum-variant access a
 *                 same-file schema shadows is never adopted as a lookupable
 *                 nominal (bug 0191 §Fix constraint A: a lookupable answer
 *                 there is not inert — it trades one wrong verdict for
 *                 another, docs/bugs/0191-enum-name-shadowed-by-schema-fabricates-member-type.md
 *                 §Reproduction (g)).
 *   - `array`   — `array<T>`, covariant in its `element` (TYPE-7).
 *   - `union`   — `T₁ | T₂ | …`, widening (TYPE-5) and distributive (TYPE-6).
 *   - `object`  — an inline anonymous object type `{ f: T, … }`, field-wise
 *                 with an exact field set (TYPE-8).
 */
export type CompatType =
  | { readonly kind: "prim"; readonly name: PrimitiveName }
  | { readonly kind: "literal"; readonly typesAs: PrimitiveName }
  | {
      readonly kind: "named";
      readonly name: string;
      readonly withheld?: true;
      readonly enumRef?: true;
    }
  | { readonly kind: "array"; readonly element: CompatType }
  | { readonly kind: "union"; readonly arms: readonly CompatType[] }
  | {
      readonly kind: "object";
      readonly fields: readonly { readonly name: string; readonly type: CompatType }[];
    };

/**
 * A `NamedType` declaration, as seen by the compatibility engine:
 *
 *   - `object-schema` — `schema X { ... }`. Nominal (TYPE-10): related only by
 *     name identity, variant-to-union, and union widening/distribution.
 *     `fields` carries the declared field-name → `CompatType` mapping for the
 *     object form (`schema X { f: T, … }`), so a constructor-field check can
 *     resolve `X`'s declared type for a given field; it is absent for the
 *     head-only form (a body-less `schema X` head or an unparseable body),
 *     the one shape `collectTypeEnv` still maps to a field-less
 *     `object-schema` entry — the `= …` alias / `by … = …` forms resolve as
 *     `alias` entries instead, or are omitted when cycle-participating.
 *   - `alias`         — `schema X = R`. Transparent (TYPE-11): replaced by `rhs`
 *     and the check re-evaluated, recursing through nested aliases. The alias
 *     is identified solely by the `=` form, not by what `rhs` resolves to.
 */
export type NamedDecl =
  | {
      readonly kind: "object-schema";
      readonly fields?: Readonly<Record<string, CompatType>>;
    }
  | { readonly kind: "alias"; readonly rhs: CompatType };

/** Resolves a `NamedType` name to its declaration; `undefined` if unresolvable. */
export type TypeEnv = Readonly<Record<string, NamedDecl>>;

/**
 * Resolve a `NamedType` name to its declaration, through an own-key lookup
 * only. A `TypeEnv` is keyed by author-chosen declaration names; on a plain
 * `{}` record, a name that is instead an `Object.prototype` own property
 * (`constructor`, `toString`, `valueOf`, `__proto__`, …) answers through the
 * prototype chain with a value that is not a `NamedDecl`, breaking the
 * `NamedDecl` union invariant the three classifiers' two guards
 * (`decl === undefined`, then `decl.kind === "object-schema"`) are meant to
 * establish before treating `decl.rhs` as a `CompatType`. `Object.hasOwn`
 * makes this hold for a `TypeEnv` value constructed anywhere, independent of
 * whether `env` itself is null-prototyped.
 *
 * A name whose first character is not `A`–`Z` also resolves to nothing.
 * `lexical.md:15` requires PascalCase for a `schema`/`enum`/type-like
 * binding, and the lexer's refusal (`theta/parse/schema-case-mismatch`,
 * src/lexer/lexer.ts:842–849) is a contextual diagnostic, not a parse
 * refusal that drops the node: a refused `SchemaDecl` still reaches
 * `doc.body.statements` and `collectTypeEnv` still writes it into the
 * `TypeEnv`. A name the case rule refuses therefore names no declared type,
 * and answering its own key here would let a refused declaration decide a
 * static check — type-system.md:48's unresolvable-operand deferral is the
 * correct disposition, and code-registry-parse.md:59's "where the RHS type
 * is statically resolvable" qualifier already excludes it. The predicate is
 * re-derived from the name's first character rather than shared, matching
 * the lexer's own type-position test (src/lexer/lexer.ts:833) and the other
 * local re-derivations in this tree (src/parser/frontmatter.ts:898,
 * src/parser/theta-document.ts:2559,3065, src/parser/type-grammar.ts:1087).
 * The fence sits at this read seam, not the write seam (`collectTypeEnv`):
 * bug 0038's witness requires a `schema __proto__` declaration to land as
 * an own key of the record (tests/typeenv-prototype-names.test.ts, cell
 * g2), which a write-seam fence would swallow.
 */
export function resolveNamed(env: TypeEnv, name: string): NamedDecl | undefined {
  const first = name[0] ?? "";
  if (!(first >= "A" && first <= "Z")) {
    return undefined;
  }
  return Object.hasOwn(env, name) ? env[name] : undefined;
}

/**
 * Resolve a `named` `CompatType`'s own reference to its declaration, honouring
 * the `enumRef` provenance marker (bug 0191 §Fix route 1): a `named` minted by
 * `enumVariantType()` below resolves to NO declaration, unconditionally,
 * whatever a same-file `schema` spelled like the enum holds in `env`. Every
 * other `named` — `enumRef` absent — resolves exactly as `resolveNamed` above
 * answers for its `name`.
 *
 * This is the ONE seam that must see the marker: every resolution site whose
 * argument is a `named` `CompatType`'s OWN name (as opposed to a bare
 * annotation-spelled string, which `resolveNamed` still serves directly —
 * `declaredFieldsOf`, ./type-layer-checks.ts) reads through here instead, so a
 * marked enum-variant reference stays unresolvable everywhere the unmarked
 * shadowing schema would otherwise answer: `unfoldAlias` and `decide`'s
 * TYPE-7 / TYPE-8 / TYPE-10 arms below, `classifyIndexReceiver` and
 * `isObjectBranch` in this module, and `classifyOperand` / `classifyReceiver`
 * / `isResultGenericType` in ./type-layer-checks.ts.
 */
export function resolveNamedRef(
  env: TypeEnv,
  type: { readonly name: string; readonly enumRef?: true },
): NamedDecl | undefined {
  return type.enumRef === true ? undefined : resolveNamed(env, type.name);
}

/**
 * The outcome of a directed compatibility check `sub ⊑ sup`:
 *
 *   - `"compatible"`        — the relation holds.
 *   - `"incompatible"`      — a static mismatch (`sub ⋢ sup`), both operands
 *                             statically resolvable.
 *   - `"integer-narrowing"` — a static mismatch specifically because a `number`
 *                             appears where an `integer` is expected; the
 *                             `integer → number` widening is one-way (TYPE-2),
 *                             and the reverse is the `theta/parse/integer-narrowing`
 *                             case.
 *   - `"unknown"`           — the V2b-T stub sentinel. The paired V2b engine
 *                             never returns this; it exists only so every
 *                             relation test reds on its own primary assertion
 *                             (no expected outcome equals `"unknown"`).
 */
export type Compatibility =
  | "compatible"
  | "incompatible"
  | "integer-narrowing"
  | "unknown";

/**
 * Decide the directed compatibility relation `sub ⊑ sup` over the resolved
 * `CompatType` model, per type-system.md §"Type compatibility" TYPE-1…TYPE-11.
 * `env` resolves `NamedType`s to their declarations (nominal object schema vs
 * transparent alias).
 *
 * V2b-T stubs this as an inert sentinel returning `"unknown"`; the paired V2b
 * implementation leaf computes the relation.
 */
export function checkCompatible(
  sub: CompatType,
  sup: CompatType,
  env: TypeEnv,
): Compatibility {
  return decide(unfoldAlias(sub, env), unfoldAlias(sup, env), env);
}

/**
 * TYPE-11 — transparently unfold a `named` type whose declaration is a type-alias
 * schema (`schema X = R`) to its right-hand side, recursing through nested aliases
 * until a non-alias form is reached. A `named` that resolves to an object schema stays
 * `named` (nominal, TYPE-10); an unresolvable `named` (past the parser's static view)
 * stays `named` so the relation reports `"unknown"` and the runtime AJV safety net
 * applies. Callers reach for this directly; the classifiers unfold inline instead.
 */
export function unfoldAlias(type: CompatType, env: TypeEnv): CompatType {
  let current = type;
  // Bounded by the alias chain length, because the `TypeEnv` carries no cyclic
  // alias: `collectTypeEnv` (type-layer-checks.ts) OMITS a cycle-participating
  // declaration from the env, and an absent name is not an alias, so the walk
  // ends there and the question answers `"unknown"`. The guarantee is the
  // env's construction site, not the `theta/parse/type-alias-cycle`
  // diagnostic — that rejection is reported alongside this pass, not before
  // it, so it gates nothing here.
  while (current.kind === "named") {
    const decl = resolveNamedRef(env, current);
    if (decl === undefined || decl.kind !== "alias") {
      return current;
    }
    current = decl.rhs;
  }
  return current;
}

/**
 * The directed decision procedure over alias-unfolded operands. Implements
 * TYPE-1…TYPE-10 (TYPE-11 transparency is applied by `unfoldAlias` before and
 * during recursion). Returns `"unknown"` when an operand is an unresolvable
 * `named` reference past the parser's static view.
 */
function decide(sub: CompatType, sup: CompatType, env: TypeEnv): Compatibility {
  // TYPE-6 — union-distributive on the left: `T₁ | T₂ ⊑ T₃` iff each arm is.
  if (sub.kind === "union") {
    let sawUnknown = false;
    for (const arm of sub.arms) {
      const r = decide(unfoldAlias(arm, env), sup, env);
      if (r === "unknown") {
        sawUnknown = true;
      } else if (r !== "compatible") {
        return "incompatible";
      }
    }
    return sawUnknown ? "unknown" : "compatible";
  }

  // TYPE-5 — union-widening on the right: `T ⊑ T | U` iff `T ⊑` some arm.
  if (sup.kind === "union") {
    let sawUnknown = false;
    for (const arm of sup.arms) {
      const r = decide(sub, unfoldAlias(arm, env), env);
      if (r === "compatible") {
        return "compatible";
      }
      if (r === "unknown") {
        sawUnknown = true;
      }
    }
    return sawUnknown ? "unknown" : "incompatible";
  }

  // TYPE-7 — element-wise covariance on arrays: `array<T₁> ⊑ array<T₂>` iff
  // `T₁ ⊑ T₂`. This sup-side test runs ahead of the sub-side
  // unresolvable-`named` escape below, so a `named` sub past the parser's
  // static view must defer here too — otherwise its verdict comes from the
  // sink's KIND alone, never from any fact about the value. The skip is
  // unconditional on the sink's kind and hands the question to the runtime
  // AJV net (type-system.md §"Unresolvable operands"), the same posture
  // `unfoldAlias`'s own design note states for this module.
  if (sup.kind === "array") {
    if (sub.kind === "named" && resolveNamedRef(env, sub) === undefined) {
      return "unknown";
    }
    if (sub.kind !== "array") {
      return "incompatible";
    }
    return decide(unfoldAlias(sub.element, env), unfoldAlias(sup.element, env), env);
  }

  // TYPE-8 — field-wise on inline object types with an exact field set
  // (`additionalProperties:false` ⇒ no excess-property widening), field order
  // irrelevant. Never crosses the inline/named boundary (TYPE-10). Same
  // reasoning as the TYPE-7 array arm above: no expression in theta types AS
  // an inline object type (`static-type-inference.ts`'s `#typeExpr` has no
  // `object` arm), so a `call` / `invoke` / `query` / bare-object-literal
  // initialiser under an inline-object annotation is always this sup's `named`
  // sub, past the parser's static view. Without this escape every such
  // initialiser would be refused on the sink's KIND alone — never on any fact
  // about the value — which would refuse the committed corpus fixture
  // tests/live/acceptance/fixtures/acc-typed-inline.theta and engage GOV-15
  // (docs/spec_topics/governance/source-language-stability.md:5) in the
  // refusing direction. Hands the question to the runtime AJV net instead
  // (type-system.md §"Unresolvable operands"). A RESOLVABLE `named` sub (a
  // schema ctor) still falls through to the `sub.kind !== "object"` refusal
  // below — TYPE-10's cross-form rule (type-system.md:52): an inline-object
  // sup is never `⊑` structurally from a named schema, resolvable or not.
  if (sup.kind === "object") {
    if (sub.kind === "named" && resolveNamedRef(env, sub) === undefined) {
      return "unknown";
    }
    if (sub.kind !== "object") {
      return "incompatible";
    }
    if (sub.fields.length !== sup.fields.length) {
      return "incompatible";
    }
    let sawUnknown = false;
    for (const supField of sup.fields) {
      const subField = sub.fields.find((f) => f.name === supField.name);
      if (subField === undefined) {
        return "incompatible";
      }
      const r = decide(
        unfoldAlias(subField.type, env),
        unfoldAlias(supField.type, env),
        env,
      );
      if (r === "unknown") {
        sawUnknown = true;
      } else if (r !== "compatible") {
        return "incompatible";
      }
    }
    return sawUnknown ? "unknown" : "compatible";
  }

  // TYPE-10 — object-schema named types are nominal: a `named` (resolved to an
  // object schema, since aliases are unfolded) is `⊑` only the same named
  // schema by name identity (TYPE-1). It never relates structurally to an
  // inline object or to a distinct named schema.
  if (sup.kind === "named") {
    if (resolveNamedRef(env, sup) === undefined) {
      return "unknown";
    }
    if (sub.kind === "named") {
      if (resolveNamedRef(env, sub) === undefined) {
        return "unknown";
      }
      return sub.name === sup.name ? "compatible" : "incompatible";
    }
    return "incompatible";
  }

  // A `named` sub against a non-named, non-union sup: nominal, never structural.
  if (sub.kind === "named") {
    return resolveNamedRef(env, sub) === undefined ? "unknown" : "incompatible";
  }

  // TYPE-2 / TYPE-3 — primitive and literal-to-primitive against a primitive
  // target. A literal types as its `typesAs` primitive in expression position.
  if (sup.kind === "prim") {
    if (sub.kind === "prim") {
      return decidePrimitive(sub.name, sup.name);
    }
    if (sub.kind === "literal") {
      return decidePrimitive(sub.typesAs, sup.name);
    }
    return "incompatible";
  }

  // TYPE-1 reflexivity for a literal target: a literal is `⊑` a literal that
  // types as the same primitive.
  if (sup.kind === "literal") {
    if (sub.kind === "literal") {
      return decidePrimitive(sub.typesAs, sup.typesAs);
    }
    return "incompatible";
  }

  return "incompatible";
}

/**
 * Decide compatibility between two primitive type names (TYPE-1 reflexivity,
 * TYPE-2 one-way `integer ⊑ number` widening, and the reverse
 * `number ⊑ integer` `integer-narrowing` case).
 */
function decidePrimitive(sub: PrimitiveName, sup: PrimitiveName): Compatibility {
  if (sub === sup) {
    return "compatible";
  }
  if (sub === "integer" && sup === "number") {
    return "compatible";
  }
  if (sub === "number" && sup === "integer") {
    return "integer-narrowing";
  }
  return "incompatible";
}

/**
 * Widen every literal type inside `type` to the primitive it types as
 * ([TYPE-3](../../docs/spec_topics/type-system.md#type-3): a literal types as
 * that primitive in expression position), recursing through `array`, `union`
 * and inline-`object` structure. `named` types are returned untouched — an
 * alias's right-hand side is the declaration's, not this value's, and TYPE-10
 * nominality must not be disturbed.
 *
 * The caller is the type layer's unannotated-`let` arm, which records what an
 * initialiser EXPRESSION types as. Recording the unwidened literal makes the
 * binding a target no primitive-typed value satisfies: `decide`'s literal
 * target arm relates a literal target only to a literal source, so `let mut a
 * = ""` refuses a `string` RHS and renders both sides `string` (bug 0341).
 *
 * Structurally shared: a `type` holding no literal is returned BY REFERENCE,
 * so the caller's identity-keyed side channels (`resultBindings`,
 * `unprovableBindings` in type-layer-checks.ts) see the object they saw
 * before this function existed.
 */
export function widenLiteralTypes(type: CompatType): CompatType {
  switch (type.kind) {
    case "literal":
      return { kind: "prim", name: type.typesAs };
    case "array": {
      const element = widenLiteralTypes(type.element);
      return element === type.element ? type : { kind: "array", element };
    }
    case "union": {
      const arms = type.arms.map(widenLiteralTypes);
      return arms.every((arm, i) => arm === type.arms[i]) ? type : { kind: "union", arms };
    }
    case "object": {
      const fields = type.fields.map((f) => {
        const widened = widenLiteralTypes(f.type);
        return widened === f.type ? f : { name: f.name, type: widened };
      });
      return fields.every((field, i) => field === type.fields[i]) ? type : { kind: "object", fields };
    }
    case "prim":
    case "named":
      return type;
  }
}

/**
 * Render a `CompatType` to the display name the per-site mismatch messages
 * interpolate (the `<expected>` / `<actual>` fields of the
 * diagnostics/code-registry-parse.md *Message* strings).
 */
export function displayType(type: CompatType): string {
  switch (type.kind) {
    case "prim":
      return type.name;
    case "literal":
      return type.typesAs;
    case "named":
      return type.name;
    case "array":
      return `array<${displayType(type.element)}>`;
    case "union":
      return type.arms.map(displayType).join(" | ");
    case "object":
      return `{ ${type.fields.map((f) => `${f.name}: ${displayType(f.type)}`).join(", ")} }`;
  }
}

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
    case "named": {
      const decl = resolveNamedRef(env, type);
      if (decl === undefined) {
        return "unknown";
      }
      if (decl.kind === "object-schema") {
        return "object";
      }
      // A transparent alias: classify its resolved RHS (TYPE-11).
      return classifyIndexReceiver(decl.rhs, env);
    }
  }
}

/**
 * TYPE-9 — the RHS of a typed binding `let x: T = expr`. Reports
 * `theta/parse/let-rhs-type-mismatch` when the RHS static type is not `⊑` the
 * annotation `T` (both statically resolvable), or `theta/parse/integer-narrowing`
 * when the failure is specifically a `number` RHS under an `integer` annotation
 * (TYPE-2's one-way widening). Returns no diagnostic when the relation holds.
 *
 * V2b-T stubs this inert (no diagnostics); the paired V2b leaf fills it in.
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
 *
 * V2b-T stubs this inert (no diagnostics); the paired V2b leaf fills it in.
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
 * common type). V2b-T stubs this inert (no diagnostics); the paired V2b leaf
 * fills it in.
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
 *      TYPE-1 identical collapse and TYPE-2 `integer → number` widening. A
 *      statically-unresolvable branch does not block a candidate, so a set
 *      holding one collapses onto the dominating branch rather than being
 *      treated as disjoint from it (type-system.md §"Unresolvable operands");
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
  const dominating = branches.find((candidate) =>
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

/**
 * The `name` the WITHHELD binder entry carries (`recordWithheldBinders`,
 * ./type-layer-checks.ts, and `StaticTypeInferencePass`'s own arm-scope build,
 * ./static-type-inference.ts — bug 0145 §Fix (a) route 1 gave the inference
 * pass its own minting site, so this is no longer the one place that mints it,
 * only the lowest module both import): a spelling no `.theta` source can
 * declare, so a read of a binder this layer cannot type is never judged
 * against a declaration that happens to share the binder's own name.
 *
 * UNSPELLABLE AS A KEY by the grammar, not by convention. A `TypeEnv` key is
 * exactly ONE token's text — `parseSchema` takes the declaration's name with a
 * single `this.advance().text` (./theta-document.ts) and `collectTypeEnv`
 * (./type-layer-checks.ts) keys the env by it — and no token text can equal a
 * ten-character run beginning with `<`: an `ident` / `keyword` is
 * `[A-Za-z_][A-Za-z0-9_]*`, a `punct` is one character or a two-character
 * operator from a fixed table, a `number` is digits and `.`, a `string`
 * token's text is the RAW source slice and therefore begins with its own
 * quote, a `newline` / `stmt-sep` is `\n` and `eof` is empty
 * (../lexer/lexer.ts). `resolveNamed` (above) consults the env with
 * `Object.hasOwn`, so no prototype name answers for it either, and every `⊑`
 * question about it reaches the unresolvable-name arms. The KEY claim does not
 * cover every NAME: an alias's right-hand side or a direct annotation is a
 * source-text slice, not a token, so it CAN carry this text. Bug 0143
 * measured what that costs: the string is author-reachable in principle, so a
 * predicate keyed on the string alone cannot tell the engine's own mint from
 * an author's `<withheld>` annotation. The withhold decision therefore no
 * longer rests on this string at all — it rests on the `withheld` marker on
 * `CompatType`'s `named` arm (above), which only `withheldBinderType()` sets.
 * The string survives only as the RENDERED spelling (`displayType`).
 *
 * A casing rule would not do this job: lexical.md §"Identifiers" scopes
 * lowercase-first to `let` / `let mut` bindings, function parameters, function
 * names and schema field names, which leaves a `for` / `par for` variable and a
 * `match` pattern binder outside it — and an uppercase binder colliding with a
 * declared schema is exactly how the binder's own spelling was judged
 * nominally.
 *
 * Home: this is the lowest module both `type-layer-checks.ts` and
 * `static-type-inference.ts` import (the latter never imports the former,
 * bug 0145 §Fix's layering adjudication), so a shared constant lives here
 * rather than being duplicated at each mint site.
 */
export const WITHHELD_BINDER_TYPE_NAME = "<withheld>";

/**
 * Mint the engine's withheld-binder `CompatType` — the ONLY admitted mint of a
 * withheld binder entry (bug 0143 §Fix (b) route 1). Both mint sites
 * (`recordWithheldBinders`, ./type-layer-checks.ts, and `#matchArmScope`,
 * ./static-type-inference.ts) route through this factory rather than
 * constructing the object literal themselves, so the `withheld: true` marker
 * cannot be forgotten at one of them while `containsWithheldBinderType`
 * (./type-layer-checks.ts) tests it at both. No other call site may construct
 * a `named` `CompatType` with `withheld: true` set.
 */
export function withheldBinderType(): CompatType {
  return { kind: "named", name: WITHHELD_BINDER_TYPE_NAME, withheld: true };
}

/**
 * Mint the engine's enum-variant `CompatType` — the ONLY admitted mint of the
 * `enumRef` marker (bug 0191 §Fix route 1, the companion decision to bug
 * 0143's `withheld` marker). `enumName` becomes the DISPLAY spelling
 * (`displayType` renders `type.name` verbatim, unchanged for this arm), but
 * `resolveNamedRef` above answers `undefined` for a marked reference
 * unconditionally, so the value never resolves to whatever a same-file
 * `schema` spelled like the enum holds — `Color.Red` under
 * `enum Color { Red }` beside `schema Color { a: string }` types as this
 * mint, named `"Color"`, and every `⊑` consumer treats it exactly as it
 * treats an unresolvable `named "Color"` (deferred, `type-system.md:48`),
 * never as the shadowing schema's own nominal (§Fix constraint A).
 *
 * `static-type-inference.ts`'s `#memberType` is the sole caller: it mints this
 * when the member access has the variant-access SHAPE — an ident target naming
 * a declared `enum` and binding no local — ahead of the `TypeEnv` schema
 * lookup, mirroring the runtime's own predicate (`evalExpr`'s `case "member"`
 * tests `expr.target.kind === "ident"` and a non-`"local"` resolution before
 * calling `env.resolveEnumVariant`, ../runtime/statement-executor.ts). No
 * other call site may construct a `named` `CompatType` with `enumRef: true`
 * set.
 */
export function enumVariantType(enumName: string): CompatType {
  return { kind: "named", name: enumName, enumRef: true };
}
