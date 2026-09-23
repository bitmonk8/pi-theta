// V2b / V2b-T — the type-compatibility engine (`⊑`) seam.
//
// This module owns the single normative compatibility relation `T₁ ⊑ T₂` of
// type-system.md §"Type compatibility" (TYPE-1…TYPE-11), re-exporting the
// per-site diagnostics and common-type join from ./type-compat-sites.ts.
// The relation is the structural-cases engine the parser must decide without falling back
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
// the per-site checkers (`checkLetRhsCompat`, `checkFnArgCompat`,
// `checkObjectFieldCompat`, `checkCommonType`, `checkParamsDefaultCompat`,
// `checkReassignRhsCompat` in ./type-compat-sites.ts) report the parse-time mismatch diagnostics
// (TYPE-9). An operand past the parser's static view (an unresolvable `named`
// reference) yields `"unknown"`, at which point the per-site checkers emit no
// diagnostic and the runtime AJV check is the safety net (type-system.md
// §"Unresolvable operands").

import { isTypeLikeName } from "../lexer/name-case";

export {
  checkCommonType,
  checkFnArgCompat,
  checkLetRhsCompat,
  checkObjectFieldCompat,
  checkParamsDefaultCompat,
  checkReassignRhsCompat,
  classifyIndexReceiver,
  commonType,
  paramsDeclaredCompatType,
  type CompatRelation,
  type CompatSite,
  type IndexReceiverKind,
} from "./type-compat-sites";

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
 * `NamedDecl` union invariant the named-type classifier's two guards
 * (`decl === undefined`, then `decl.kind === "object-schema"`) are meant to
 * establish before treating `decl.rhs` as a `CompatType`. `Object.hasOwn`
 * makes this hold for a `TypeEnv` value constructed anywhere, independent of
 * whether `env` itself is null-prototyped.
 *
 * A name whose first character is not `A`–`Z` also resolves to nothing.
 * `lexical.md:15` requires PascalCase for a `schema`/`enum`/type-like
 * binding, and the lexer's refusal (`theta/parse/schema-case-mismatch`,
 * `contextualDiagnostics` in src/lexer/lexer.ts) is a contextual diagnostic,
 * not a parse refusal that drops the node: a refused `SchemaDecl` still
 * reaches `doc.body.statements` and `collectTypeEnv` still writes it into the
 * `TypeEnv`. A name the case rule refuses therefore names no declared type,
 * and answering its own key here would let a refused declaration decide a
 * static check — type-system.md §"Unresolvable operands" is the correct
 * disposition, and the `theta/parse/let-rhs-type-mismatch` registry row's
 * "where the RHS type is statically resolvable" qualifier
 * (code-registry-parse.md) already excludes it. The predicate is the shared
 * `isTypeLikeName` guard (src/lexer/name-case.ts) — the same one the lexer's
 * type-position test (`contextualDiagnostics`, src/lexer/contextual-checks.ts)
 * and the other enforcement sites (`extractParsedParams`,
 * src/parser/frontmatter-params.ts; `parseFnParamList` and
 * `parseSchemaObjectBody`, src/parser/body-parser.ts; `walkType`,
 * src/parser/type-walk.ts) ask.
 * The fence sits at this read seam, not the write seam (`collectTypeEnv`):
 * bug 0038's witness requires a `schema __proto__` declaration to land as
 * an own key of the record (tests/typeenv-prototype-names.test.ts, cell
 * g2), which a write-seam fence would swallow.
 */
export function resolveNamed(env: TypeEnv, name: string): NamedDecl | undefined {
  if (!isTypeLikeName(name)) {
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
 * `isObjectBranch` in ./type-compat-sites.ts, `classifyOperand` / `classifyReceiver`
 * / `isResultGenericType` in ./type-layer-checks.ts, and
 * `checkStdlibMethodCall`'s array-argument deferral in
 * ./stdlib-arg-diagnostics.ts.
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
 *   - `"unknown"`           — an operand past the parser's static view (an
 *                             unresolvable `named` reference on either side):
 *                             no verdict, so the per-site checkers emit no
 *                             diagnostic and the runtime AJV check is the
 *                             safety net (type-system.md §"Unresolvable
 *                             operands").
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
 * transparent alias). Both sides are alias-unfolded first (`unfoldAlias`,
 * TYPE-11); `decide` then walks the TYPE-1…TYPE-10 arms.
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
 * applies. Callers reach for this directly; the classifiers use `classifyNamedDecl` instead.
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
  // below — TYPE-10's cross-form rule (type-system.md #type-10): an inline-object
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
 * The founding caller is the type layer's unannotated-`let` arm, which records
 * what an initialiser EXPRESSION types as; the LUB-side callers (`commonType`
 * in type-compat-sites.ts, functions.ts, match-result.ts, static-type-inference.ts) widen their
 * candidates through the same seam. Recording the unwidened literal makes the
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
 * treats an unresolvable `named "Color"` (deferred, type-system.md
 * §"Unresolvable operands"), never as the shadowing schema's own nominal
 * (§Fix constraint A).
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
