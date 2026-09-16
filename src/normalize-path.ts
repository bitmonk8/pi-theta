// Forward-slash path normalisation (Lexical "Path literals" rule).
//
// A pure, dependency-free helper (no imports) shared by four independent call
// sites, each of which needs the identical backslash-to-forward-slash
// rewrite: the discovery-path POSIX helpers (`src/discovery/discovery-path-classify.ts`,
// re-exported from there for `discovery-walk.ts` / `discovery-collision-resolve.ts` /
// `discovery-source-enumerate.ts` / `package-discovery.ts`, PTQ-0342), the
// `.thetalib` import static checks' `fromFile` resolution and
// `CachingThetaLibProbe` precache (`checkThetaImports` in
// `src/extension/import-static-checks.ts`), the invoke static checks' call-
// graph node identity and cache key (`resolveCalleeAbsolute` /
// `buildInvokeGraph` in `src/extension/invoke-static-checks.ts`), and the
// invocation-core seam's canonical path minting (`canonicalizePath` in
// `src/runtime/invocation.ts`). One shared implementation means a correction
// (a doubled leading slash, a UNC `\\server\share` prefix) reaches every call
// site instead of diverging silently between them (PTQ-0342).

/**
 * Forward-slash-normalise a host path: replace every backslash with a
 * forward slash, per the Lexical "Path literals" rule (paths compare in
 * normalised forward-slash form; the `FileSystem` seam reports forward-slash
 * paths).
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
