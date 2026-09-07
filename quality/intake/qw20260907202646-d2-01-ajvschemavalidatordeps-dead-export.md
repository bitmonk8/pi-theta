---
id: pending
title: AjvSchemaValidatorDeps is exported from the SchemaValidator seam but every reference to it is inside its own declaring module; no file in src/, extensions/, tools/ or tests/ imports the name
lens: D2
status: intake
verdict: pending
locations:
  - src/seams/schema-validator.ts:328-334
  - src/seams/schema-validator.ts:357
  - src/seams/schema-validator.ts:382
sites: 1
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# AjvSchemaValidatorDeps is exported from the SchemaValidator seam but every reference to it is inside its own declaring module; no file in src/, extensions/, tools/ or tests/ imports the name

## Observation
`AjvSchemaValidatorDeps` is declared with the `export` keyword in
src/seams/schema-validator.ts. Its only two uses in the repository are the
private field annotation and the constructor parameter annotation of
`AjvSchemaValidator`, both in the same file. The seam barrel
src/seams/index.ts re-exports four types from this module and does not list
this one, and no `export *` exists anywhere in src/, extensions/, tools/ or
tests/. All 90 `new AjvSchemaValidator(...)` sites (1 in src/, 89 in tests/)
pass an inline object literal and annotate nothing with the type. Sibling
exported types in the same file behave differently: `SchemaSlug` is imported
by src/extension/production-composition.ts:110 and `SchemaSlugFn` by five test
files, so the module does have cross-file type consumers — just not this one.

## Evidence
src/seams/schema-validator.ts:328-334 — the declaration:

```ts
/** Constructor dependencies for the production `SchemaValidator`. */
export interface AjvSchemaValidatorDeps {
  /** Sink for the per-query cache's `theta/runtime/validator-cache-collision`. */
  readonly emit: (diagnostic: Diagnostic) => void;
  /** Content-addressing function keying the compiled-validator cache. */
  readonly slugOf: SchemaSlugFn;
}
```

src/seams/schema-validator.ts:357 and :382 — the only two references, both
inside the class declared in the same file:

```ts
  readonly #deps: AjvSchemaValidatorDeps;
```

```ts
  constructor(deps: AjvSchemaValidatorDeps) {
```

src/seams/index.ts:7-12 — the seam barrel enumerates its re-exports from this
module explicitly; `AjvSchemaValidatorDeps` is not among them:

```ts
export type {
  SchemaValidator,
  CompiledValidator,
  ValidationError,
  LoweredSchema,
} from "./schema-validator";
```

src/extension/production-composition.ts:387-393 — the single production
construction site builds the deps object inline, naming no type:

```ts
  const schemaValidator = new AjvSchemaValidator({
    emit: emitDiagnostic,
    // PIC-11 (host-interfaces-services.md:46) keys the per-query validator cache
    // by the lowered document's schema slug and gates a hit on canonical-form
    // byte-equality, so slug and bytes must come from one recipe (bug 0099).
    slugOf: productionSchemaSlugOf,
  });
```

Test construction sites do the same, e.g. tests/b0288-prompt-turn-completion-witness.test.ts:421
`return new AjvSchemaValidator({ emit: () => {}, slugOf });` — the exact search
`grep -rn "new AjvSchemaValidator(" src tests` returns 90 hits and none of them
annotates the argument with the exported interface.

Exact search for the identifier —
`grep -rn "AjvSchemaValidatorDeps" src tests tools extensions config docs skills`
— returns 3 hits, all three being the three lines cited above.

## Why this is a problem
This is a dead export in the narrow, mechanical sense: the `export` keyword
reaches nothing. The name is not imported by any file in src/, extensions/,
tools/ or tests/; it is not re-exported by the seam barrel that exists to
publish this module's types; and there is no `export *` through which it could
be reached indirectly. Deadness is not "test-only reachable" here — no test
imports the name either, and the 89 test construction sites use inline object
literals. The type therefore reads as part of the module's published surface
while being an internal annotation only, which is the same shape the wave
already recorded for other type-only exports whose importer set is empty.

## Suggested direction (non-binding, optional)
Either the `export` keyword goes (the interface stays as the in-module
annotation it already is) or a consumer is named — e.g. the seam barrel
publishing it alongside the other four schema-validator types if the intent is
that composition roots annotate their deps object. The fix stage owns the
choice.

## False-positive check
- Identifier search across production and test trees:
  `grep -rn "AjvSchemaValidatorDeps" src tests tools extensions config docs skills`
  → 3 hits, all in src/seams/schema-validator.ts (declaration :329, field
  annotation :357, constructor parameter :382).
- Repo-wide search excluding node_modules/.git/dist/.pi:
  `grep -rn "AjvSchemaValidatorDeps" . --include=*.ts --include=*.js --include=*.md`
  → the same 3 hits plus one line inside
  quality/intake/qw20260907130901-d2-01-schema-validator-stub-narration-stale.md,
  which quotes the constructor as review evidence (not a code reference).
- Substring / partial-name search: `grep -rn "SchemaValidatorDeps" src tests tools extensions`
  → same 3 hits, so no aliased or partially-spelled import exists.
- String-keyed / dynamic access: the symbol is a TypeScript `interface` with no
  runtime representation, so no property-string or computed-access route to it
  exists; the search above covers every textual occurrence.
- Re-export check: `grep -rn "export \*" src tests tools extensions` → 0 hits;
  src/seams/index.ts lists its schema-validator re-exports by name (lines 7-12)
  and omits this one.
- Tests-are-the-only-callers check (which would make it NOT dead): no test
  imports the name; `grep -rn "new AjvSchemaValidator(" src tests` → 90 hits,
  all inline object literals, 1 in src/ and 89 in tests/.
- Sibling-export control: `SchemaSlug` (src/extension/production-composition.ts:110)
  and `SchemaSlugFn` (tests/params-defaults.test.ts:10,
  tests/proto-named-binder-write-sites.test.ts:13,
  tests/proto-named-record-write-sites.test.ts:23,
  tests/proto-named-schema-validator-enforcement.test.ts:8,
  tests/schema-validator-seam.test.ts:5) do have importers, so the empty
  importer set for this one is not an artefact of the search method.
- Git history intent: `git log -S "AjvSchemaValidatorDeps" --oneline` → two
  commits, a2993196 ("V8c-T — SchemaValidator seam (tests)") which introduced
  the declaration, and bd671ad3 (the quality-intake commit that quoted the
  constructor line). No commit ever added an importer.

## Triage
