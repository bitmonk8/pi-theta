---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: collectImportedSpecifierFacts rescans one resolved library's whole statement list per specifier instead of indexing it once per decl
lens: D8                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending              # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/import-static-checks.ts:264-278
  - src/extension/import-static-checks.ts:1183-1185
  - src/extension/import-static-checks.ts:1203-1205
  - src/extension/import-static-checks.ts:1231-1233
  - src/extension/import-static-checks.ts:1252-1257
  - src/extension/import-static-checks.ts:1161
  - src/extension/import-static-checks.ts:1288-1292
sites: 7                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
d8_class: heavier-than-scale # D8 only: overbuilt | reimplemented | against-grain | heavier-than-scale
d8_host: src/extension/import-static-checks.ts#collectImportedSpecifierFacts # D8 only: the exemption key
wave: qw20260917045205
reported_by: lens-d8-simplification (unity-completions/gemini-3.7-flash)
date: 2026-09-17
---

# collectImportedSpecifierFacts rescans one resolved library's whole statement list per specifier instead of indexing it once per decl

## Observation
Inside `collectImportedSpecifierFacts`'s per-decl loop, the inner `for (const specifier of specifiers)` loop re-scans `parsed.document.body.statements` — the resolved library's whole top-level declaration list, fixed for the entire inner loop of one `import` statement — from scratch on every iteration: three separate `.find()` calls (one each for a matching `schema`, `fn`, `enum`) plus one call into `collectImportedTypeDecls`, which itself rebuilds two more full-array name-indexes internally. The same inner loop already caches a different, structurally identical computation (`collectBodyTypes` via `libBodyTypesByPath`) exactly once per decl instead of once per specifier.

## Evidence
**`collectImportedTypeDecls` rebuilds its own name index from scratch on every call — import-static-checks.ts:264-278:**
```ts
function collectImportedTypeDecls(
  entrySchema: SchemaDecl | undefined,
  entryEnum: EnumDecl | undefined,
  outputName: string,
  libStatements: ThetaBody["statements"],
): { readonly schemas: ReadonlyMap<string, SchemaDecl>; readonly enums: ReadonlyMap<string, EnumDecl> } {
  const schemaByName = new Map<string, SchemaDecl>();
  const enumByName = new Map<string, EnumDecl>();
  for (const stmt of libStatements) {
    if (stmt.kind === "schema") {
      schemaByName.set(stmt.name, stmt);
    } else if (stmt.kind === "enum") {
      enumByName.set(stmt.name, stmt);
    }
  }
```

**Three more full-array `.find()` scans over the same `parsed.document.body.statements`, one each per specifier — import-static-checks.ts:1183-1185, 1203-1205, 1231-1233:**
```ts
      const schemaDecl = parsed.document.body.statements.find(
        (stmt): stmt is SchemaDecl => stmt.kind === "schema" && stmt.name === specifier.source,
      );
```
```ts
      const fnDecl = parsed.document.body.statements.find(
        (stmt): stmt is FnDecl => stmt.kind === "fn" && stmt.name === specifier.source,
      );
```
```ts
      const enumDecl = parsed.document.body.statements.find(
        (stmt): stmt is EnumDecl => stmt.kind === "enum" && stmt.name === specifier.source,
      );
```

**The per-specifier call site feeding `collectImportedTypeDecls` the SAME invariant statement list every time — import-static-checks.ts:1252-1257:**
```ts
      const { schemas: transitiveSchemas, enums: transitiveEnums } = collectImportedTypeDecls(
        schemaDecl,
        enumDecl,
        specifier.local,
        parsed.document.body.statements,
      );
```

**The sibling computation in this SAME inner loop that IS cached once per decl — import-static-checks.ts:1161, 1288-1292:**
```ts
    const libBodyTypesByPath = new Map<string, FrontmatterBodyTypes>();
```
```ts
      if (schemaDecl !== undefined) {
        let libBodyTypes = libBodyTypesByPath.get(resolvedPath);
        if (libBodyTypes === undefined) {
          libBodyTypes = collectBodyTypes(parsed.document.body.statements, resolvedPath).bodyTypes;
          libBodyTypesByPath.set(resolvedPath, libBodyTypes);
        }
```

## Why this is a problem
`parsed` (hence `parsed.document.body.statements`) and `resolvedPath` are fixed once per `decl`, before the inner `for (const specifier of specifiers)` loop runs, and do not vary across that loop's iterations — only `specifier.source`/`specifier.local` do. For a decl naming S specifiers against a library of N top-level statements (`import { A, B, C } from "./types.thetalib"`, an ordinary, spec-legal multi-specifier form), the cost of resolving each specifier's own declaration is a fresh O(N) scan repeated for EVERY specifier (three scans inline, plus `collectImportedTypeDecls`'s own two-map O(N) rebuild) — O(S·N) total — where indexing the N statements by name once per decl and then doing O(1) lookups per specifier would cost O(N+S). The same function already applies exactly that once-per-decl amortisation to a structurally identical case three lines away (`libBodyTypesByPath`, guarding `collectBodyTypes` over the same `(parsed.document.body.statements, resolvedPath)` pair) — a prior D8 finding on this exact call (`PTQ-0331`, see below) was ratified and fixed by adding that one cache, but the sibling per-specifier lookups this filing cites were not brought under it.

## Suggested direction (non-binding, optional)
Unproven hypothesis: build one `Map<string, SchemaDecl | FnDecl | EnumDecl>` (or three separate by-kind maps) from `parsed.document.body.statements` once per decl — the same place `libBodyTypesByPath` is declared (line 1161) — and have the per-specifier loop look up `specifier.source` in it instead of calling `.find()` three times and re-deriving `collectImportedTypeDecls`'s own `schemaByName`/`enumByName` maps on every iteration; `collectImportedTypeDecls` itself could accept the pre-built maps instead of `libStatements` when called from this loop.

## False-positive check
Confirmed `resolvedPath`/`parsed` are decl-scoped (assigned once per outer-loop iteration, above the inner specifier loop) and never reassigned inside it, by reading the full per-decl loop body (~lines 1130-1300) rather than one excerpt in isolation. Read `quality/resolved/PTQ-0331-collect-body-types-per-specifier-recompute.md` in full: it targeted exactly ONE call (`collectBodyTypes`, now cached via `libBodyTypesByPath`, verified present in current code at the cited lines) and was RATIFIED and fixed — this filing is a distinct claim about the sibling `schemaDecl`/`fnDecl`/`enumDecl` `.find()` calls and `collectImportedTypeDecls`'s own internal index rebuild, none of which PTQ-0331's fix touched (its own evidence section explicitly scoped itself to the single `collectBodyTypes` call site and noted the `schemaDecl` re-find as a separate, specifier-dependent question it was not claiming about). Grepped `collectImportedTypeDecls(` in this file: one call site (the one cited), confirming the redundancy is temporal (repeated across loop iterations) rather than several independently-written call sites. Checked the D8 exemption list — neither entry (`discovery-walk.ts#enumerateDirectory`, `production-theta-producer.ts#firstAdmittingArmProperties`) is this host. No `docs/spec_topics/` clause requires re-deriving the library's per-specifier lookup once per specifier — imports.md's `("," ImportSpec)*` grammar and schema-subset.md's "transitively imported" language are both silent on whether the underlying scan may be shared — so no `challenges_spec` applies.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — accounting verified: all 7 citations match current code byte-for-byte (collectImportedTypeDecls 264-278, the schemaDecl/fnDecl/enumDecl .find()s at 1183/1203/1231, the call site at 1252-1257, libBodyTypesByPath at 1161/1288-1292), all within one function (collectImportedSpecifierFacts, 966-1316) whose resolvedPath/parsed are decl-scoped and unchanged across the specifier loop; collectImportedTypeDecls( has exactly one call site (grep-confirmed); imports.md's `("," ImportSpec)*` grammar makes S>1 specifiers per decl ordinary and legal; distinct from PTQ-0081 (fixed — a single-iteration double-find of schemaDecl, already deduped, unrelated to per-specifier rescanning), PTQ-0331 (fixed — collectBodyTypes only; its own text explicitly punted on the schemaDecl refind as "a separate, specifier-dependent question it was not claiming about"), and PTQ-0365 (fixed — kind-set completeness typing via a satisfies ledger, not caching cost); no D8 exemption on this host. D8 caps an accurate accounting at questionable — hoisting the per-decl-invariant lookup into an index is a human design call, never confirmed (triage: claude-opus-5)
