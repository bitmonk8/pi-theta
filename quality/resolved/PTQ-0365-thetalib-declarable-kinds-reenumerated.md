---
id: PTQ-0365
title: The .thetalib top-level declarable-kind set (schema/fn/enum) is independently re-enumerated in four places in import-static-checks.ts
lens: D4                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/import-static-checks.ts:188-195
  - src/extension/import-static-checks.ts:335-341
  - src/extension/import-static-checks.ts:395-421
  - src/extension/import-static-checks.ts:1371-1435
sites: 4                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: parallel           # D4 only: clone | drift | parallel
wave: qw20260915044704
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-15
---

# The .thetalib top-level declarable-kind set (schema/fn/enum) is independently re-enumerated in four places in import-static-checks.ts

## Observation
A `.thetalib`'s only top-level declarable/exportable kinds are `schema`, `fn` and `enum` (`Stmt`'s other members — `let`, `if`, `import`, `export`, etc. — are never treated as declarations by this file). Four separate functions in `import-static-checks.ts` each independently re-test `stmt.kind` against exactly this three-member set to answer four different downstream questions: is this name already declared locally (collision check), is this name exported by the resolved library (IMP-3), what does this specifier materialise to at runtime (IMP-6/7), and which compose-time static check applies to this specifier's usages (bugs 0138/0429/0430/0448). None of the four shares a constant, a helper, or an exhaustive switch over `Stmt` with any of the others.

## Evidence

**Site 1 — `collectTopLevelNames` (applied to the IMPORTING theta's own body, for the name-collision arm), import-static-checks.ts:188-195:**
```ts
function collectTopLevelNames(body: ThetaBody): string[] {
  const names: string[] = [];
  for (const stmt of body.statements) {
    if (stmt.kind === "schema" || stmt.kind === "enum" || stmt.kind === "fn") {
      names.push(stmt.name);
    }
  }
  return names;
```

**Site 2 — `extractThetaLibForms` (applied to a RESOLVED LIBRARY's body, feeding IMP-3's export set via `computeThetaLibExports`), import-static-checks.ts:335-341:**
```ts
function extractThetaLibForms(body: ThetaBody): ThetaLibModuleForms {
  const declarations: ThetaLibDeclaration[] = [];
  const reExports: ReExportSpecifier[] = [];
  const plainImports: ImportSpecifier[] = [];
  for (const stmt of body.statements) {
    if (stmt.kind === "schema" || stmt.kind === "enum" || stmt.kind === "fn") {
      declarations.push({ kind: stmt.kind, name: stmt.name });
```

**Site 3 — `materializeSymbol` (applied to a resolved library's body, called from `materializeChain`'s direct arm, feeding IMP-6/7's runtime binding), import-static-checks.ts:395-421 (fn-arm body abridged):**
```ts
  for (const stmt of body.statements) {
    if (stmt.kind === "fn" && stmt.name === source) {
      ...
      return { name: local, kind: "fn", fn };
    }
    if (stmt.kind === "schema" && stmt.name === source) {
      return { name: local, kind: "schema" };
    }
    if (stmt.kind === "enum" && stmt.name === source) {
      return {
        name: local,
        kind: "enum",
        variants: stmt.variants ?? [],
        ...(stmt.variantValues !== undefined ? { values: stmt.variantValues } : {}),
```

**Site 4 — the per-specifier classification loop inside `checkThetaImports` (applied to the same resolved library's body as Site 3, populating `importedSchemas`/`importedFns`/`importedEnums`/`importedNonCtorNames` for the four `checkImported*` compose-time checks), import-static-checks.ts:1371-1435 (the three `.find` calls, core excerpt):**
```ts
      const schemaDecl = parsed.document.body.statements.find(
        (stmt): stmt is SchemaDecl => stmt.kind === "schema" && stmt.name === specifier.source,
      );
      const fnDecl = parsed.document.body.statements.find(
        (stmt): stmt is FnDecl => stmt.kind === "fn" && stmt.name === specifier.source,
      );
      const enumDecl = parsed.document.body.statements.find(
        (stmt): stmt is EnumDecl => stmt.kind === "enum" && stmt.name === specifier.source,
      );
```

**Diff verdict: not clone-shaped (no clone-map group id — the four differ enough in surrounding control structure — single OR-condition loop, per-kind if-chain-with-early-return, three separate `.find` calls — that a token-window scanner would not pair them), but load-bearing parallel: all four independently assert "the declarable-kind universe is exactly {schema, fn, enum}."** Sites 1 and 2 use the identical boolean shape (`stmt.kind === "schema" || stmt.kind === "enum" || stmt.kind === "fn"`) but feed different output shapes (`string[]` of names vs `{kind, name}[]` declarations) over different bodies (importer vs library). Site 3 tests the same three kinds one `if` at a time with an early return per kind. Site 4 re-derives the same three kinds as three independent `.find()` scans over the SAME statement array Site 3 also scans (via `materializeChain`, called moments later in the same per-specifier loop iteration, for the same `specifier.source` name) — the same input, resolved twice by unrelated code shapes.

## Why this is a problem
None of the four sites shares a constant, a single shared enumerator, or an exhaustive `switch` over `Stmt` with `never`-checked exhaustiveness (unlike, e.g., `collectProvableArgTypes` in the sibling `invoke-static-checks.ts`, whose own doc comment states its switch "is exhaustive over the `Expr` union with no `default` arm: a kind added to the union without an arm here is a compile error"). A `Stmt.kind` string-literal test (`stmt.kind === "schema"`) never forces a compile error when `Stmt` grows a new member — TypeScript narrows the existing arms correctly but raises nothing when a new arm is missing from an ad hoc if-chain or `.find()` predicate. If the language ever grows a fourth top-level declarable/importable `.thetalib` kind:
- Site 1 (`collectTopLevelNames`) would not recognise a same-named local declaration of the new kind, silently under-enforcing imports.md's name-collision rule for it.
- Site 2 (`extractThetaLibForms`) would not add it to `computeThetaLibExports`'s declaration list, so a legitimately-declared symbol of the new kind would draw a false `theta/parse/import-unknown-symbol` on import.
- Site 3 (`materializeSymbol`) would not materialise it, so an import that (once Site 2 is fixed) resolves cleanly at IMP-3 would still bind nothing at runtime — a silently inert import.
- Site 4 (the classification loop) would build no `importedXxx` entry for it, so every one of the four `checkImported*` compose-time checks in `invoke-static-checks.ts` would stay silent on its misuse.

Today all four agree — 3 of 3 kinds recognised at every site — but that agreement is coincidental across four independent codings, not structural. `extractThetaLibForms`'s `declarations: ThetaLibDeclaration[]` (Site 2) already computes a `{kind, name}[]` list that is a strict superset of what Sites 1, 3 and 4 each separately re-derive by their own walk over the same three kind names.

## Suggested direction (non-binding, optional)
A shared source of truth (hypothesis): a single named constant or helper enumerating the three declarable kinds (or reusing `extractThetaLibForms`'s already-computed `declarations` list as the one place that walks `body.statements` for this purpose), that the other three sites read from instead of repeating the kind test — named as an observation of the one site that already computes the full answer, not a design.

## False-positive check
- All four sites re-read verbatim immediately before filing at the cited line ranges.
- Liveness: `collectTopLevelNames` is called from `checkThetaImports` (`const localTopLevelNames = collectTopLevelNames(input.body);`); `extractThetaLibForms` is called from both `closeOverReExports` and the main per-decl loop; `materializeSymbol` is called from `materializeChain`'s direct arm (import-static-checks.ts:1148, `const direct = materializeSymbol(source, local, resolvedPath, body, callingFrontmatter);`), itself called from the main per-specifier loop and from `buildModuleScope`; the classification loop is inline inside `checkThetaImports`, this file's sole exported entry point. All four are live production code (none is a dead copy — D2's territory).
- Not tests/: all four citations are in `src/extension/import-static-checks.ts`.
- Not generated: no `@generated`/`DO NOT EDIT` marker in the file.
- Not a spec-repeated normative vector table: imports.md does not itself repeat a "declarable kinds" table in more than one place; this is four independent pieces of imperative code, not a spec-mandated repetition.
- Distinguished from PTQ-0081 (resolved/fixed): that finding was a narrower, now-fixed claim about two BYTE-IDENTICAL `schema`-only `.find()` predicates (`schemaDecl` and a since-removed `directSchema`) inside the SAME loop iteration; re-verified the current code no longer has a second `directSchema` binding (the `if (schemaDecl !== undefined)` block at the file's bug-0422 site now reads the existing `schemaDecl`, confirming that fix landed). This filing's four sites are a different code shape (one single-OR-condition loop x2, one if-chain, three `.find()` calls) spanning fn/schema/enum together, not a repeat of the fixed schema-only duplicate.
- Duplicate-finding check: grepped `quality/issues` + `quality/resolved` + `quality/intake` for `collectTopLevelNames`, `extractThetaLibForms`, `materializeSymbol`, `schemaDecl.*fnDecl`, `declarable` — only PTQ-0081 (above, distinguished) surfaces; PTQ-0334 (D9, `checkThetaImports` phase count) and PTQ-0319 (D8, the four `checkImported*` routes' redundant body walk, already fixed) touch adjacent code but neither names this four-site kind-enumeration duplication.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — all 4 sites (188-195/335-341/395-421/1371-1435) reproduce verbatim with no shared constant/exhaustive switch (grep confirms), the `collectProvableArgTypes` exhaustiveness quote is exact, PTQ-0081/0334/0319/0325 are correctly distinguished as different root causes, and clone-scan finds no group (consistent with the filing's own claim); D4 parallel accounting verified caps at questionable, not confirmed — the shared source of truth is a human design ruling (triage: claude-opus-5)
verdict: confirmed — RATIFIED (human, 2026-09-15): one named source of truth for the .thetalib declarable-kind set. imports.md #permitted-top-level-forms names the permitted top-level forms (import, export, schema, enum, fn); the declarable/exportable subset is {schema, enum, fn}. Add, module-private in import-static-checks.ts (all four sites live there; do not add an import edge for this), a union type ThetaLibDeclaration = SchemaDecl | FnDecl | EnumDecl and a type guard isThetaLibDeclaration(stmt): stmt is ThetaLibDeclaration whose doc comment cites the spec anchor. Sites 1 and 2 (collectTopLevelNames, extractThetaLibForms) call the guard instead of the three-way OR. Sites 3 and 4 (materializeSymbol; the per-specifier loop — after Seam C it lives inside collectImportedSpecifierFacts, follow it there) keep their control flow (their per-kind lookups are the behaviour) but are tied to the union at the type level — e.g. a satisfies Record<ThetaLibDeclaration['kind'], …> ledger in the PTQ-0292 style — so a fourth declarable kind fails tsc at all four sites. Identical behaviour and diagnostics; tests unchanged. Fix surface is import-static-checks.ts — runs after its D9 lane.
