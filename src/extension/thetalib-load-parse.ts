// The shared `.thetalib` reference resolve-load-parse ritual (PTQ-0381),
// extracted out of three byte-identical copies inside `import-static-
// checks.ts` (`buildModuleScope`'s per-import loop, `materializeChain`'s
// re-export-chain loop, and the post-walk `parseCache` loop). That module is
// already past the D9 justify-band LOC threshold, so this helper lives in
// this sibling module instead of growing it further; `import-static-
// checks.ts` imports it back like any other caller.

import type { SourceRange } from "../diagnostics/diagnostic";
import { loadThetaLibImport, type Resolver } from "../parser/imports";
import type { ImportDecl, ThetaBody } from "../parser/theta-document";
import type { CachingThetaLibProbe, ParsedThetaLib } from "./import-static-checks";

/**
 * Resolve and parse one `.thetalib` reference — an `import` statement's path
 * or a re-export's `fromPath` — through imports.md's `.thetalib` path-
 * resolution step: `probe.precache` it, `loadThetaLibImport` it, then
 * `parseThetaLib` the resolved path. `undefined` on either failure, silently
 * — matching the three call sites this factors, none of which pushes a
 * diagnostic on failure (the caller's own filter/`continue` around the call
 * decides what, if anything, that means for it); a caller that needs a
 * diagnostic on failure does not use this helper.
 */
export async function resolveAndParseThetaLibReference(
  path: string,
  range: SourceRange,
  ownerResolvedPath: string,
  probe: CachingThetaLibProbe,
  resolver: Resolver,
  parseThetaLib: (resolvedPath: string) => Promise<ParsedThetaLib | undefined>,
): Promise<{ resolvedPath: string; parsed: ParsedThetaLib } | undefined> {
  await probe.precache(path, ownerResolvedPath);
  const load = loadThetaLibImport(resolver, path, ownerResolvedPath, {
    file: ownerResolvedPath,
    range,
  });
  if (!load.registered || load.resolvedPath === undefined) {
    return undefined;
  }
  const parsed = await parseThetaLib(load.resolvedPath);
  if (parsed === undefined) {
    return undefined;
  }
  return { resolvedPath: load.resolvedPath, parsed };
}

/**
 * Yield resolved top-level `.thetalib` imports in source order, skipping failed
 * references. Resolve each only when requested so the caller's per-import work
 * finishes before the next reference is loaded.
 */
export async function* resolveThetaLibImports(
  body: ThetaBody,
  ownerResolvedPath: string,
  probe: CachingThetaLibProbe,
  resolver: Resolver,
  parseThetaLib: (resolvedPath: string) => Promise<ParsedThetaLib | undefined>,
): AsyncGenerator<{
  stmt: ImportDecl;
  resolved: { resolvedPath: string; parsed: ParsedThetaLib };
}> {
  for (const stmt of body.statements) {
    if (stmt.kind !== "import" || !stmt.path.endsWith(".thetalib")) {
      continue;
    }
    const resolved = await resolveAndParseThetaLibReference(
      stmt.path,
      stmt.range,
      ownerResolvedPath,
      probe,
      resolver,
      parseThetaLib,
    );
    if (resolved === undefined) {
      continue;
    }
    yield { stmt, resolved };
  }
}
