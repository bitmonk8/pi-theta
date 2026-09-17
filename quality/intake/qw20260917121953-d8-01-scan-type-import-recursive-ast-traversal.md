---
id: pending
title: scanTypeImport runs a full-AST recursive traversal via ts.forEachChild to inspect top-level ES import declarations
lens: D8
status: intake
verdict: pending
locations:
  - src/extension/inventory-closure-audit.ts:674-688
  - src/extension/inventory-closure-audit.ts:697-711
sites: 2
fix_scope: localized
d8_class: heavier-than-scale
d8_host: src/extension/inventory-closure-audit.ts#runInventoryClosureAudit
wave: qw20260917121953
reported_by: lens-d8-simplification (unity-completions/gemini-3.7-flash)
date: 2026-09-17
---

# scanTypeImport runs a full-AST recursive traversal via ts.forEachChild to inspect top-level ES import declarations

## Observation
In `src/extension/inventory-closure-audit.ts`, `runInventoryClosureAudit` audits each file in the source tree by parsing it into a `ts.SourceFile` and performing multiple sequential AST traversals. Before running `visitRefs` to collect reference and import violations (Pass 3), it defines and executes `scanTypeImport`, a recursive function that traverses the entire AST using `ts.forEachChild` solely to check whether `Type` is named in an import from `typebox`.

## Evidence
Site 1 (`src/extension/inventory-closure-audit.ts:674-688`): `scanTypeImport` runs a full recursive descent across every AST node:
```typescript
    let typeboxTypeIsImported = false;
    const scanTypeImport = (n: ts.Node): void => {
      if (
        ts.isImportDeclaration(n) &&
        ts.isStringLiteral(n.moduleSpecifier) &&
        isTypebox(n.moduleSpecifier.text)
      ) {
        const ic = n.importClause;
        if (ic && ic.namedBindings && ts.isNamedImports(ic.namedBindings)) {
          for (const el of ic.namedBindings.elements) {
            if (!el.propertyName && el.name.text === "Type") typeboxTypeIsImported = true;
          }
        }
      }
      ts.forEachChild(n, scanTypeImport);
    };
    scanTypeImport(sf);
```

Site 2 (`src/extension/inventory-closure-audit.ts:697-711`): Immediately following `scanTypeImport(sf)`, `visitRefs` performs another full recursive AST traversal with `ts.forEachChild`, visiting the exact same `ts.isImportDeclaration` nodes and checking `isTypebox(spec)` and `ic.namedBindings`:
```typescript
    const visitRefs = (n: ts.Node): void => {
      if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
        const spec = n.moduleSpecifier.text;
        const ic = n.importClause;
        if (ic && ic.namedBindings && ts.isNamedImports(ic.namedBindings)) {
          // Bug 0374 §Fix rule (ii)/(iv): a named import is authorised by a marker
          // on EITHER the specifier's own line OR the `import`-keyword line.
          const importKwLine = lineOfPos(n.getStart(sf));
          for (const el of ic.namedBindings.elements) {
            if (el.propertyName) continue; // aliased → family (4), handled in pass 1
            const nm = el.name.text;
            const authLines = [lineOfPos(el.getStart(sf)), importKwLine];
            if (isTypebox(spec)) {
              resolveRef(
                el.getStart(sf),
```

Data-size and cost accounting:
- ES `import` declarations in TypeScript AST are syntactically confined to top-level statements of the module (`sf.statements`, where $N \approx 10\text{--}50$).
- `scanTypeImport` recursively visits every nested node in the syntax tree ($N \approx 500\text{--}10{,}000$ nodes per file across all statements, expressions, arrow functions, and blocks in large audited files such as `production-composition.ts`).
- Furthermore, this extra traversal is executed per file across the entire audited file list (`walked` files), even though Pass 1 (`visitShapes`) and Pass 3 (`visitRefs`) already perform full recursive AST walks that visit and inspect all `ts.isImportDeclaration` nodes.

## Why this is a problem
The recursive algorithm shape (`ts.forEachChild`) is disproportionate to the location of the searched data: descending through whole-tree expression hierarchies to find top-level `import` declarations multiplies AST traversal overhead per audited file. The boolean `typeboxTypeIsImported` only gates member-access checks on `Type` in `visitRefs`, which already walks and inspects all import declarations.

## Suggested direction (non-binding, optional)
Inspect `sf.statements` directly (or record `typeboxTypeIsImported` during `visitShapes` / `visitRefs` import handling) rather than executing an independent recursive `ts.forEachChild` pass over the whole source file.

## False-positive check
- D2 precedent check: `typeboxTypeIsImported` is read at line 772 (`else if (recv === "Type" && typeboxTypeIsImported)`), so the flag is live.
- Spec check: `audit-target-categories.md` establishes the `{ Type }` import and `{ Unsafe }` member-access carve-outs; optimizing how `Type` import presence is detected does not change the audit resolution rules or emitted records.
- Exemption check: The lens exemption list contains no entry for `inventory-closure-audit.ts` (the only D8 exemptions are `discovery-walk.ts#enumerateDirectory` and `production-theta-producer.ts#firstAdmittingArmProperties`).
- Distinct from D9: D9 wave finding `qw20260917121953-d9-02-inventory-audit-seams-b-c.md` addresses function breakdown of `runInventoryClosureAudit` (Seams B/C); this finding specifically targets the heavier-than-scale recursive AST traversal for top-level import inspection.

## Triage
verdict: questionable — accounting verified: both excerpts match verbatim at inventory-closure-audit.ts:674-693 and :697-711; scanTypeImport is a genuinely separate fourth per-file recursive pass (forEachChild at :542 visitShapes, :692 scanTypeImport, :783 visitRefs, plus getChildren collectComments at :807) whose only targets, ImportDeclaration nodes, sit in sf.statements for the audited src/**/*.ts set (grep: zero `declare module` blocks / nested imports in src/), and visitShapes (:365) and visitRefs (:698) already inspect every ImportDeclaration; the flag is live at :773 (sole read), size-scan puts the file at 944 LOC/zone with 0 src / 2 tests importers, quality/exemptions.json carries no row for this host (the two D8 rows are other hosts), and audit-target-categories.md §Target surface categories pins only detection semantics (carrier = the imported `Type` binding), not the traversal shape, so no spec clause is challenged; not a duplicate of PTQ-0350 / qw...-d9-02 (those are D9 pass-bundling breakdowns, different root cause). No measured cost is filed (cf. the enumerateDirectory exemption's re-file bar), and one direction caveat for the human: folding the flag into pre-order visitRefs would be order-sensitive if an import textually follows a `Type.<member>` use, whereas an sf.statements pre-scan is not — the simpler shape is a design decision for a human ruling (triage: claude-fable-5-1)
