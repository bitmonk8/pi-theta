---
id: PTQ-1123
title: thetalib import resolve loop duplicated in module-scope and transitive-declaration passes
lens: D4
status: fixed
verdict: confirmed
locations:
  - src/extension/import-static-checks.ts:1604-1618
  - src/extension/import-static-checks.ts:1774-1788
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# thetalib import resolve loop duplicated in module-scope and transitive-declaration passes

## Observation
In `src/extension/import-static-checks.ts`, two separate functions contain the same `.thetalib` import discovery and resolution loop. `buildModuleScope` (line 1587) walks a lib's own `body.statements` to materialise its imports into a `ModuleScope`. `checkTransitiveLibDeclarations` (line 1732) walks each reached lib's `parsedLib.document.body.statements` to run the `checkImportUnknownSymbols` diagnostic over that lib's own imports. Both loops filter statements with `stmt.kind !== "import" || !stmt.path.endsWith(".thetalib")`, call `resolveAndParseThetaLibReference` with the same seam arguments, and continue on `undefined`. The resolution call itself was already extracted to `src/extension/thetalib-load-parse.ts` (PTQ-0381), but the surrounding import-discovery loop remains duplicated.

## Evidence
Location 1 — `buildModuleScope`'s import walk:
```typescript
src/extension/import-static-checks.ts:1604-1618
    for (const stmt of body.statements) {
      if (stmt.kind !== "import" || !stmt.path.endsWith(".thetalib")) {
        continue;
      }
      const resolved = await resolveAndParseThetaLibReference(
        stmt.path,
        stmt.range,
        resolvedPath,
        probe,
        resolver,
        parseThetaLib,
      );
      if (resolved === undefined) {
        continue;
      }
```

Location 2 — `checkTransitiveLibDeclarations`'s import walk:
```typescript
src/extension/import-static-checks.ts:1774-1788
    for (const stmt of parsedLib.document.body.statements) {
      if (stmt.kind !== "import" || !stmt.path.endsWith(".thetalib")) {
        continue;
      }
      const resolved = await resolveAndParseThetaLibReference(
        stmt.path,
        stmt.range,
        libResolvedPath,
        probe,
        resolver,
        parseThetaLib,
      );
      if (resolved === undefined) {
        continue;
      }
```

Diff verdict: renamed-only. The only differences are the collection iterated (`body.statements` vs `parsedLib.document.body.statements`), the owner path variable (`resolvedPath` vs `libResolvedPath`), and the trailing consumer code (`materializeChain` vs `checkImportUnknownSymbols`). The import-discovery and resolution skeleton is otherwise identical. Clone-map group id: G078.

## Why this is a problem
The duplicated block is load-bearing, not incidental. It encodes the contract for what counts as a resolvable `.thetalib` import statement: the `kind === "import"` test, the `.thetalib` suffix test, and the `resolveAndParseThetaLibReference` invocation sequence. If that contract changes — for example, to support a different extension, a new import-statement shape, or a different precache/parse sequence — both copies must change in lockstep. Today they agree only because they were copy-pasted; the file already recognised the duplication of the inner `resolveAndParseThetaLibReference` call and extracted it, which shows the duplication of the surrounding loop is residual rather than intentional design variance.

## Suggested direction (non-binding, optional)
The natural shared home is `src/extension/thetalib-load-parse.ts`, which already owns the extracted resolution helper. A helper that iterates a body's `.thetalib` imports and yields resolved `{ stmt, resolvedPath, parsed }` tuples could replace both loops, leaving each caller to apply its own per-specifier logic.

## False-positive check
- Re-verified both spans at the cited line numbers in the working tree; both loops are live and executed on every compose pass.
- Searched `src/extension/import-static-checks.ts` for `resolveAndParseThetaLibReference`: only these two import-walk call sites plus the re-export-chain call in `materializeChain` (line 1689) use it. The re-export loop has a different filter (`exported !== source || !reExport.fromPath.endsWith(".thetalib")`) and is not part of the mechanical clone group G078.
- Not tests/ or generated code; both copies are production sources under `src/`.
- Not a spec-normative vector table; this is implementation logic for import discovery.
- No matching already-filed PTQ topic covers this residual loop duplication (PTQ-0381 extracted the inner resolution call only).

## Triage
verdict: confirmed — both excerpts reproduce verbatim at 1604-1618/1774-1788; independently re-ran `node tools/quality/clone-scan.mjs map --files <manifest>` and it reports G078 (61 tokens, renamed-only(1)) spanning exactly those two ranges; grep confirms `resolveAndParseThetaLibReference` has exactly 3 call sites in the file (:1608/:1689/:1778) with :1689's re-export filter correctly excluded; both hosts live (`buildModuleScope` called from `materializeChain` :1682, `checkTransitiveLibDeclarations` from :2025); not a dedupe of resolved PTQ-0381 — that filing explicitly scoped itself to the inner precache→load→parse ritual, left each caller its own loop by design, and the fixer landed exactly that, so the surviving import-walk skeleton (filter + resolve call + undefined guard) is a distinct residual; anchor is mechanical, not taste — the hand-written `stmt.kind !== "import"` filter is repeated in the same function that already calls the file's own `collectImports` helper (:233, used at :1812) for the identical selection, showing the idiom is hand-copied rather than a deliberate variance; D4 clone in production src/, accurate → confirmed, fix is a mechanical dedupe (triage: claude-fable-5-1)
