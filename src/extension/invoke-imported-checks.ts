// Bug 0138 / bugs 0429 / 0430 / 0448 — the imported-symbol usage checks
// `checkThetaImports` (import-static-checks.ts) runs ONCE per importing
// theta, after its per-decl loop has resolved each specifier's imported
// symbol against the directly-resolved library:
//
//   - `checkImportedFnCallArgs` (bug 0138) — an imported `.thetalib` `fn`
//     call's argument COUNT (`theta/parse/fn-arity-too-few` / `-too-many`)
//     and per-slot TYPE (`theta/parse/fn-arg-type-mismatch`).
//   - `checkImportedSchemaCtorFields` (bug 0429) — an imported `.thetalib`
//     `schema`'s CONSTRUCTOR field set against its declared fields
//     (`theta/parse/extra-object-field` / `-missing-object-field`).
//   - `checkImportedEnumVariantAccess` (bug 0430) — an imported `.thetalib`
//     `enum`'s VARIANT access against its declared variants
//     (`theta/parse/unknown-variant`).
//   - `checkImportedNonCtorTypeNames` (bug 0448) — a constructor site whose
//     imported head is not brace-constructible: an `enum`, a `fn`, or an
//     alias-form `schema` (`theta/parse/unresolved-named-type`).
//
// No new diagnostic code anywhere in this file: each route reuses an
// existing parse-time diagnostic row a same-file spelling already draws.
// Split out of ../extension/invoke-static-checks.ts as PTQ-0370: that file's
// own entry points (`checkInvokeStaticResolution`,
// `checkThetaCallableCallSurface`) never call any of the four — this file's
// sole caller is `checkThetaImports` (../extension/import-static-checks.ts),
// which imports these five names from here instead. Reuses
// invoke-static-checks.ts's shared call-site walk result
// (`CollectedCallSites`, bug 0071's one-walker lesson) and its
// `collectProvableArgTypes` / `dedupeArgType` value-type machinery, imported
// back from there rather than duplicated here.
//
// Spec: diagnostics/code-registry-parse.md, imports.md §Visibility,
// invocation.md.

import type { Diagnostic } from "../diagnostics/diagnostic";
import type {
  Expr,
  FnDecl,
  FnParam,
  ObjectExpr,
  SchemaFieldSource,
  Stmt,
  ThetaBody,
} from "../parser/theta-document";
import { checkObjectLiteralFields } from "../parser/literal-sublanguage";
import { checkVariantAccess } from "../parser/schema-declarations";
import { checkFnCallArity } from "../parser/invoke-diagnostics";
import { StaticTypeInferencePass } from "../parser/static-type-inference";
import {
  annotationSourceIsNotTypeExpression,
  annotationToCompatType,
  collectEnumNames,
  collectTypeEnv,
  fnParamNamesAreIdentifiers,
} from "../parser/type-layer-checks";
import { checkCompatible, checkFnArgCompat, type TypeEnv } from "../parser/type-compat";
import {
  collectProvableArgTypes,
  dedupeArgType,
  type CollectedCallSites,
} from "./invoke-static-checks";

/**
 * One imported `.thetalib` callee `checkImportedFnCallArgs` may judge: the
 * library's own `FnDecl` (ordinary or `subagent fn`) resolved by SOURCE name
 * in the DIRECTLY-resolved library's own top-level body, plus that body's
 * whole statement list (for `collectTypeEnv` — bug 0072's namespace rule: the
 * EXPECTED side must resolve through the DECLARING library's `TypeEnv`, never
 * the importing file's). Resolution does not follow a re-export chain: a
 * specifier whose source name names no direct top-level declaration in the
 * resolved library (it is provided only through that library's own
 * `export … from`) is absent from this map, which withholds the route for
 * that callee rather than widening resolution to chase the chain — a
 * deferral recorded in the three rows' own *Trigger*s (a call through a
 * re-exported `fn` stays silent, never a false emission), not an attempt to
 * duplicate `materializeChain`'s own
 * chain-following (../extension/import-static-checks.ts) at a second call
 * site.
 */
export interface ImportedFnCallee {
  readonly fn: FnDecl;
  readonly libraryStatements: readonly Stmt[];
}

/**
 * expressions.md §"Identifier resolution": arm (1) outranks arm (3), so a
 * name bound anywhere in the importing body as a `let`, loop variable,
 * match-arm pattern, `fn` parameter, or frontmatter `params:` field
 * (`collectLocalBinderNames`, ../parser/type-layer-checks.ts) is never an
 * imported-symbol reference at that site, whatever declaration kind the
 * import would otherwise resolve to (an imported `fn` call, or a `schema` /
 * `enum` constructor or member-access target). Each of the four checks below
 * tests its own candidate name against the caller-supplied `shadowedNames`
 * set before judging anything else about the site — one predicate for the
 * one rule, in place of four hand-written copies of the same test.
 */
function isShadowedImportName(name: string, shadowedNames: ReadonlySet<string>): boolean {
  return shadowedNames.has(name);
}

/** Yield named constructor sites not shadowed by local bindings, in walk order. */
function* importedConstructorSites(
  callSites: CollectedCallSites,
  shadowedNames: ReadonlySet<string>,
): Generator<{ ctor: ObjectExpr; typeName: string }> {
  const { objectExprs } = callSites;
  for (const ctor of objectExprs) {
    if (ctor.typeName === null) {
      // A bare `{ … }` object literal names no schema at all; this route
      // judges named constructor sites only.
      continue;
    }
    const typeName = ctor.typeName;
    if (isShadowedImportName(typeName, shadowedNames)) {
      continue;
    }
    yield { ctor, typeName };
  }
}

/**
 * Bug 0138 route 2 — judge an imported-`.thetalib` `fn` call's ARGUMENTS
 * (count and per-slot type) at the COMPOSE layer, where the resolved library
 * already exists as a parsed `ThetaDocument`. No new diagnostic code: the
 * three existing rows carry the route — `theta/parse/fn-arity-too-few` /
 * `-too-many` (bug 0131 arm (3), deferred to this bug by name) and
 * `theta/parse/fn-arg-type-mismatch` (whose *Trigger* already names the
 * imported half). `checkFnCallArgs`'s parse-tier arm 2
 * (../parser/type-layer-checks.ts) still returns on an imported callee — this
 * function is where that route is served, not where it moves.
 *
 * `importedFns` keys by the call-site LOCAL binding name (the `as`-alias
 * where written, else the source name) — the same key `collectImportedSymbols`
 * (../parser/type-layer-checks.ts) uses for the parse-tier `Set`. A call whose
 * callee is not a key withholds, whether because it names a same-file `fn`, a
 * non-`fn` imported symbol (`schema` / `enum`), an unresolved name, or a
 * symbol reached only through a re-export chain (`ImportedFnCallee`'s own
 * deferral, above).
 *
 * Shadowing outranks import resolution (expressions.md §"Identifier
 * resolution" arm (1) over arm (3)): a callee name bound anywhere in the
 * importing body as a `let`, loop variable, match-arm pattern, `fn` parameter
 * or frontmatter `params:` field is never judged here, mirroring
 * `checkFnCallArgs`'s own `shadowedNames` test via the shared
 * `collectLocalBinderNames`.
 *
 * ARITY BEFORE TYPE (invocation.md §Argument arity, the same ordering
 * `checkFnCallArgs` / `checkInvokeCall` apply): a mis-arity call draws the
 * arity row alone via the parser's own, UNCHANGED `checkFnCallArity`. A
 * library `fn` whose parameter list fails `fnParamNamesAreIdentifiers` (bug
 * 0131 §(c) / bug 0225) withholds the ARITY verdict alone for that callee and
 * falls through to the per-argument loop, exactly as `checkFnCallArgs` does on
 * the same-file route: the recorded parameter COUNT is a recovery artefact the
 * author never wrote, while each surviving annotation is still the author's own
 * text and is judged per slot behind that loop's own
 * `annotationSourceIsNotTypeExpression` / `annotationToCompatType` guards.
 *
 * The per-argument TYPE loop's EXPECTED side resolves through a `TypeEnv`
 * built from the callee's OWN library statements (bug 0072's namespace rule)
 * — never the importing file's — so an importer's unrelated same-named
 * `schema` cannot decide a verdict about the library's contract, and a
 * library parameter type the library itself never declares withholds rather
 * than resolving against the wrong file. The ARGUMENT side reuses
 * `collectProvableArgTypes`'s every-member-incompatible SET discipline over
 * the IMPORTING file's own `TypeEnv` / `StaticTypeInferencePass`, unchanged
 * from the invoke / `.theta`-callable routes above, and the parser's own
 * `checkFnArgCompat` emits, also unchanged.
 *
 * `<name>` on every diagnostic this function may push renders `call.callee` —
 * the CALL-SITE spelling, alias included (placeholder-rendering-b.md §"5.
 * Source-derived placeholders": `<name>` is identifier-shaped and taken from
 * the offending source text).
 *
 * DEFERRED, by construction: a call site INSIDE a `.thetalib` body is never
 * reached, because this function walks the IMPORTING THETA's own body only,
 * never a library body — a call inside a library against a symbol THAT
 * library itself imported is therefore out of this route's reach (bug 0138
 * row d3), a fence stated in the registry *Trigger*s this fix amends, not a
 * dropped route.
 */
export function checkImportedFnCallArgs(
  importingBody: ThetaBody,
  importingFile: string,
  shadowedNames: ReadonlySet<string>,
  callSites: CollectedCallSites,
  importedFns: ReadonlyMap<string, ImportedFnCallee>,
): Diagnostic[] {
  if (importedFns.size === 0) {
    return [];
  }
  const diagnostics: Diagnostic[] = [];
  const { callExprs } = callSites;
  const importerEnv = collectTypeEnv(importingBody.statements);
  const importerPass = new StaticTypeInferencePass({
    checkCompatible,
    enumNames: collectEnumNames(importingBody.statements),
  });
  // One `TypeEnv` per resolved library body, cached by statement-list
  // identity so two calls of the same imported `fn` do not rebuild the
  // DECLARING library's env twice; the cache key is the library body
  // reference `ImportedFnCallee.libraryStatements` carries, which is stable
  // across every call this route judges against the same callee.
  const libraryEnvCache = new Map<readonly Stmt[], TypeEnv>();
  const libraryEnvFor = (statements: readonly Stmt[]): TypeEnv => {
    const cached = libraryEnvCache.get(statements);
    if (cached !== undefined) {
      return cached;
    }
    const env = collectTypeEnv(statements);
    libraryEnvCache.set(statements, env);
    return env;
  };

  for (const call of callExprs) {
    if (isShadowedImportName(call.callee, shadowedNames)) {
      continue;
    }
    const callee = importedFns.get(call.callee);
    if (callee === undefined) {
      // Not an imported `fn` this route reaches: a same-file `fn`, a
      // non-`fn` imported symbol, an unresolved name, or a re-export-chain
      // callee `ImportedFnCallee`'s own doc comment defers on.
      continue;
    }
    const site = { file: importingFile, range: call.range };
    // Bug 0131 §(c) / bug 0225: a junk parameter table's recorded COUNT is a
    // recovery artefact the author never wrote, so the ARITY verdict alone is
    // withheld — the annotation half is the author's own text and stays judged
    // per slot below, which is the same partition `checkFnCallArgs` applies on
    // the same-file route (../parser/type-layer-checks.ts).
    if (fnParamNamesAreIdentifiers(callee.fn.params)) {
      const arityDiags = checkFnCallArity({
        name: call.callee,
        requiredCount: callee.fn.params.length,
        providedCount: call.args.length,
        site,
      });
      if (arityDiags.length > 0) {
        // Arity BEFORE type (invocation.md §Argument arity): a mis-arity call
        // draws the arity row alone and never reaches the per-argument loop.
        diagnostics.push(...arityDiags);
        continue;
      }
    }
    const libraryEnv = libraryEnvFor(callee.libraryStatements);
    const matchedCount = Math.min(call.args.length, callee.fn.params.length);
    for (let i = 0; i < matchedCount; i += 1) {
      const param = callee.fn.params[i] as FnParam;
      if (param.type.length > 0 && annotationSourceIsNotTypeExpression(param.type)) {
        // The library's own parameter annotation derives from none of
        // `Type`'s six alternatives — treated as absent rather than as an
        // opaque nominal reading of the junk text, mirroring
        // `checkFnCallArgs`'s identical guard on the same-file route.
        continue;
      }
      const paramType = annotationToCompatType(param.type);
      if (paramType === undefined) {
        // An unannotated library parameter has no declared type to judge
        // against (type-system.md §"Absent operands").
        continue;
      }
      const argExpr = call.args[i] as Expr;
      const argTypes = collectProvableArgTypes(argExpr, importerEnv, importerPass);
      if (argTypes === undefined) {
        // A value-contributing position past the parser's static view defers
        // to no runtime AJV net (this position registers none) — see this
        // file's `collectProvableArgTypes` doc comment.
        continue;
      }
      const everyMemberRefused = argTypes.every((argType) => {
        const verdict = checkCompatible(argType, paramType, libraryEnv);
        return verdict !== "compatible" && verdict !== "unknown";
      });
      if (!everyMemberRefused) {
        // One arm the library's parameter type accepts — or answers
        // `"unknown"` for — means the argument may well type-check, so the
        // slot withholds. Every OTHER verdict is a refusal at parity with the
        // row's own emitter: `checkFnArgCompat` (../parser/type-compat.ts)
        // routes a `number ⊑ integer` narrowing through
        // `fn-arg-type-mismatch` too, so a set of narrowings must reach it
        // here rather than be filtered out as "not incompatible" — the invoke
        // and `.theta`-callable routes can defer such a set to a runtime AJV
        // load of the callee's `params:` schema, and this position registers
        // no such net.
        continue;
      }
      diagnostics.push(
        ...checkFnArgCompat({
          fnName: call.callee,
          index: i,
          paramName: param.name,
          paramType,
          argType: dedupeArgType(argTypes),
          env: libraryEnv,
          site: { file: importingFile, range: argExpr.range },
        }),
      );
    }
  }
  return diagnostics;
}

/**
 * Bug 0429 §Fix Option 1 — judge an imported-`.thetalib` `schema`'s
 * CONSTRUCTOR field set at the COMPOSE layer, mirroring
 * `checkImportedFnCallArgs` above exactly. Parse defers on an imported
 * constructor name (the `imports.has(e.typeName)` arm,
 * ../parser/theta-document.ts `checkObjectExpr` — the FS-free parser holds no
 * library body), so this is where that route is SERVED, not where it moves.
 * No new diagnostic code: the two rows `checkObjectExpr` already emits for a
 * same-file constructor carry the route — `theta/parse/extra-object-field`
 * (pushed inline, mirroring `checkObjectExpr`'s own inline push) and
 * `theta/parse/missing-object-field` (reusing `checkObjectLiteralFields`,
 * ../parser/literal-sublanguage.ts, exactly as `checkObjectExpr` does).
 *
 * `importedSchemas` keys by the CONSTRUCTOR-SITE local binding name (the
 * `as`-alias where written, else the source name) — the same key
 * `importedFns` above uses — and its value is the directly-resolved
 * library's own `SchemaDecl.fields`. A DIRECT top-level declaration only
 * (bug 0138's `ImportedFnCallee` restriction, mirrored): a schema reached
 * only through a re-export chain is absent from the map, so this route
 * withholds a verdict for it rather than duplicating `materializeChain`'s own
 * chain-follow at a second call site.
 *
 * Shadowing outranks import resolution (expressions.md §"Identifier
 * resolution" arm (1) over arm (3)): a constructor name bound anywhere in the
 * importing body as a `let`, loop variable, match-arm pattern, `fn`
 * parameter, or frontmatter `params:` field is never judged here, the same
 * `shadowedNames` test (`collectLocalBinderNames`) `checkImportedFnCallArgs`
 * applies to call sites.
 *
 * `<schema>` on every diagnostic renders the CONSTRUCTOR-SITE spelling (the
 * local/alias name written at the `Ident { … }` site), matching
 * `checkObjectExpr`'s same-file rendering and `checkImportedFnCallArgs`'s
 * `<name>` convention (placeholder-rendering-b.md §"5. Source-derived
 * placeholders").
 *
 * DEFERRED, by construction: an `ObjectExpr` INSIDE a `.thetalib` body is
 * never reached, because `callSites` is collected from the IMPORTING THETA's
 * own body only, never a library body — the same fence `checkImportedFnCallArgs`
 * states for call sites.
 */
export function checkImportedSchemaCtorFields(
  importingFile: string,
  shadowedNames: ReadonlySet<string>,
  callSites: CollectedCallSites,
  importedSchemas: ReadonlyMap<string, readonly SchemaFieldSource[]>,
): Diagnostic[] {
  if (importedSchemas.size === 0) {
    return [];
  }
  const diagnostics: Diagnostic[] = [];
  for (const { ctor, typeName } of importedConstructorSites(callSites, shadowedNames)) {
    const declaredFields = importedSchemas.get(typeName);
    if (declaredFields === undefined) {
      // Not an imported schema this route reaches: a same-file schema, a
      // non-`schema` imported symbol, an unresolved name, or a re-export-
      // chain schema `importedSchemas`' own doc comment (above) defers on.
      continue;
    }
    const declaredNames = declaredFields.map((field) => field.name);
    const declaredSet = new Set(declaredNames);
    const present = ctor.fields.map((field) => field.name);
    for (const field of present) {
      if (!declaredSet.has(field)) {
        diagnostics.push({
          severity: "error",
          code: "theta/parse/extra-object-field",
          file: importingFile,
          range: ctor.range,
          message: `extra field '${field}' on schema '${typeName}'`,
        });
      }
    }
    diagnostics.push(
      ...checkObjectLiteralFields(
        { name: typeName, fields: declaredNames },
        present,
        { file: importingFile, range: ctor.range },
      ),
    );
  }
  return diagnostics;
}

/**
 * Bug 0430 §Fix Option 1 — judge an imported-`.thetalib` `enum`'s VARIANT
 * ACCESS at the COMPOSE layer, mirroring `checkImportedSchemaCtorFields`
 * above exactly. Parse defers on an imported member access (the body walk's
 * `member` arm, ../parser/theta-document.ts, whose `refs.enums.get` answers
 * from `hoistEnumVariants` over same-file `enum` statements only — the
 * FS-free parser holds no library variant set), so this is where that route
 * is SERVED, not where it moves. No new diagnostic code: reuses the EXISTING
 * `theta/parse/unknown-variant` row via the parser's own, UNCHANGED
 * `checkVariantAccess` (../parser/schema-declarations.ts) — the same
 * code+message the same-file `member` arm emits (bug 0185's binding
 * code-identity adjudication: declared-enum head + undeclared tail is
 * `theta/parse/unknown-variant`, no new code, no registry row edited).
 *
 * `importedEnums` keys by the MEMBER-TARGET local binding name (the `as`-alias
 * where written, else the source name) — the same key `importedSchemas` above
 * uses — and its value is the directly-resolved library's own `EnumDecl`
 * variant list. A DIRECT top-level declaration only (bug 0138's
 * `ImportedFnCallee` restriction, mirrored): an enum reached only through a
 * re-export chain is absent from the map, so this route withholds a verdict
 * for it rather than duplicating `materializeChain`'s own chain-follow at a
 * second call site.
 *
 * Shadowing outranks import resolution (expressions.md §"Identifier
 * resolution" arm (1) over arm (3)): a member-target name bound anywhere in
 * the importing body as a `let`, loop variable, match-arm pattern, `fn`
 * parameter, or frontmatter `params:` field is never judged here, the same
 * `shadowedNames` test (`collectLocalBinderNames`) `checkImportedSchemaCtorFields`
 * applies to constructor sites.
 *
 * `<enum>` on every diagnostic renders the MEMBER-TARGET spelling (the
 * local/alias name written at the `Ident.Variant` site), matching the
 * same-file `member` arm's rendering and `checkImportedSchemaCtorFields`'s
 * `<schema>` convention (placeholder-rendering-b.md §"5. Source-derived
 * placeholders").
 *
 * DEFERRED, by construction: a `MemberExpr` INSIDE a `.thetalib` body is
 * never reached, because `callSites` is collected from the IMPORTING THETA's
 * own body only, never a library body — the same fence `checkImportedSchemaCtorFields`
 * states for constructor sites.
 */
export function checkImportedEnumVariantAccess(
  importingFile: string,
  shadowedNames: ReadonlySet<string>,
  callSites: CollectedCallSites,
  importedEnums: ReadonlyMap<string, readonly string[]>,
): Diagnostic[] {
  if (importedEnums.size === 0) {
    return [];
  }
  const diagnostics: Diagnostic[] = [];
  const { memberExprs } = callSites;
  for (const access of memberExprs) {
    if (access.target.kind !== "ident") {
      // Only a bare `Ident.field` denotes a possible imported-enum variant
      // access; a member off any other expression shape names no import
      // binding at all.
      continue;
    }
    const enumName = access.target.name;
    if (isShadowedImportName(enumName, shadowedNames)) {
      continue;
    }
    const knownVariants = importedEnums.get(enumName);
    if (knownVariants === undefined) {
      // Not an imported enum this route reaches: a same-file enum, a
      // non-`enum` imported symbol, an unresolved name, or a re-export-chain
      // enum `importedEnums`' own doc comment (above) defers on.
      continue;
    }
    const diagnostic = checkVariantAccess(
      { enumName, variant: access.field, knownVariants },
      { file: importingFile, range: access.range },
    );
    if (diagnostic !== undefined) {
      diagnostics.push(diagnostic);
    }
  }
  return diagnostics;
}

/**
 * Bug 0448 §Fix Option 1 — judge an imported-`.thetalib` constructor site
 * whose head resolves to a NON-brace-constructible declaration at the COMPOSE
 * layer, mirroring `checkImportedSchemaCtorFields` above exactly. Parse
 * defers on an imported constructor name (the `imports.has(e.typeName)` arm,
 * ../parser/theta-document.ts `checkObjectExpr` — the FS-free parser holds no
 * library body, so whether the name is even brace-constructible is
 * undecidable there), so this is where that route is SERVED, not where it
 * moves. No new diagnostic code: reuses the EXISTING
 * `theta/parse/unresolved-named-type` row the same-file spelling of an `enum`
 * / fn / alias-form-`schema` constructor already draws
 * (../parser/theta-document.ts `checkObjectExpr`: an `enum` head via its
 * `enums.has` arm, an alias/head-only `schema` head via its `bodySchemas.has`
 * arm, and a `fn` head via the NO-DECLARATION fall-through arm — "resolves to
 * no declaration at all", since a `fn` name is in none of `refs.schemas`,
 * `imports`, `enums`, or `bodySchemas`), with the byte-identical message
 * template (`unresolved named type '<name>'`).
 *
 * `importedNonCtorNames` holds the CONSTRUCTOR-SITE local binding names (the
 * `as`-alias where written, else the source name) — the same key
 * `importedSchemas` / `importedEnums` above use — of every imported binding
 * whose directly-resolved library declaration is one of exactly the three
 * shapes bug 0448 §Fix judges: an `enum`, a `fn`, or an alias/head-only
 * `schema` (declared without an object body). None of the three is
 * brace-constructible (expressions.md §"Object construction";
 * `code-registry-parse.md`'s `theta/parse/unresolved-named-type` row, the
 * object-constructor clause), and all three draw the same diagnostic, so
 * membership alone decides the verdict — a fields-BEARING object-form
 * `schema` is the disjoint, already-judged class `importedSchemas` /
 * `checkImportedSchemaCtorFields` own. A DIRECT top-level declaration only
 * (bug 0138's `ImportedFnCallee` restriction, mirrored): a declaration reached
 * only through a re-export chain is absent from the set, so this route
 * withholds a verdict for it rather than duplicating `materializeChain`'s own
 * chain-follow at a second call site.
 *
 * Shadowing outranks import resolution (expressions.md §"Identifier
 * resolution" arm (1) over arm (3)): a constructor name bound anywhere in the
 * importing body as a `let`, loop variable, match-arm pattern, `fn`
 * parameter, or frontmatter `params:` field is never judged here, the same
 * `shadowedNames` test (`collectLocalBinderNames`) `checkImportedSchemaCtorFields`
 * applies to constructor sites.
 *
 * `<name>` on every diagnostic renders the CONSTRUCTOR-SITE spelling (the
 * local/alias name written at the `Ident { … }` site), matching
 * `checkObjectExpr`'s same-file rendering and `checkImportedSchemaCtorFields`'s
 * `<schema>` convention (placeholder-rendering-b.md §"5. Source-derived
 * placeholders").
 *
 * DEFERRED, by construction: an `ObjectExpr` INSIDE a `.thetalib` body is
 * never reached, because `callSites` is collected from the IMPORTING THETA's
 * own body only, never a library body — the same fence `checkImportedSchemaCtorFields`
 * states for its own constructor sites. A fields-BEARING object-form
 * `schema` constructor stays silent here too — it is not in
 * `importedNonCtorNames` at all (bug 0429's already-judged class, disjoint
 * from this one).
 */
export function checkImportedNonCtorTypeNames(
  importingFile: string,
  shadowedNames: ReadonlySet<string>,
  callSites: CollectedCallSites,
  importedNonCtorNames: ReadonlySet<string>,
): Diagnostic[] {
  if (importedNonCtorNames.size === 0) {
    return [];
  }
  const diagnostics: Diagnostic[] = [];
  for (const { ctor, typeName } of importedConstructorSites(callSites, shadowedNames)) {
    if (!importedNonCtorNames.has(typeName)) {
      // Not a non-brace-constructible imported binding this route reaches: a
      // same-file declaration, an imported OBJECT-form schema (0429's class),
      // an unresolved name, or a re-export-chain declaration this set's own
      // doc comment (above) defers on.
      continue;
    }
    diagnostics.push({
      severity: "error",
      code: "theta/parse/unresolved-named-type",
      file: importingFile,
      range: ctor.range,
      message: `unresolved named type '${typeName}'`,
    });
  }
  return diagnostics;
}
