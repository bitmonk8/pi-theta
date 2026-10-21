// Library invoke coverage is a declaring-module closure, not a call graph or
// a scan of the parse cache (invocation.md #library-invoke-static-coverage).
import type { Diagnostic } from "../diagnostics/diagnostic";
import { normalizePath } from "../normalize-path";
import type { MaterializedImport, ModuleScope } from "../runtime/lexical-environment";
import type { ThetaCompositionInput } from "./theta-composition-producer";

/** Materialisation already canonicalises residences through FileSystem.realpath. */
export function collectLibraryInvokeScopes(input: ThetaCompositionInput): readonly ModuleScope[] {
  const scopes: ModuleScope[] = [];
  // A supplied declaring document must not be checked twice as its own import.
  const visited = new Set(input.sourcePath === undefined ? [] : [normalizePath(input.sourcePath)]);
  const visit = (imports: readonly MaterializedImport[]): void => {
    for (const binding of imports) {
      if (binding.kind !== "fn" || binding.moduleScope === undefined) continue;
      const scope = binding.moduleScope;
      const identity = normalizePath(scope.residence);
      if (visited.has(identity)) continue;
      visited.add(identity);
      scopes.push(scope);
      visit(scope.imports);
    }
  };
  visit(input.imports ?? []);
  return scopes;
}

/**
 * Display accounting only: each importer still checks its complete closure and
 * decides from ALL rows. New checker rows have fresh object identities, unlike
 * parse-cache diagnostics, so shared library sites need value-based accounting.
 * Keep multiplicity within a batch (e.g. multiple mistyped slots), and leave
 * direct-site rows and location-less cycle heads untouched. Fresh per load pass.
 */
export function createLibraryInvokeDiagnosticClaim(): (
  input: ThetaCompositionInput, rows: readonly Diagnostic[],
) => readonly Diagnostic[] {
  const delivered = new Map<string, number>();
  return (input, rows) => {
    const files = new Set(collectLibraryInvokeScopes(input).map(scope => scope.residence));
    const batchCounts = new Map<string, number>();
    return rows.filter(row => {
      if (row.file === undefined || !files.has(row.file)) return true;
      const key = JSON.stringify(row);
      const count = (batchCounts.get(key) ?? 0) + 1;
      batchCounts.set(key, count);
      if (count <= (delivered.get(key) ?? 0)) return false;
      delivered.set(key, count);
      return true;
    });
  };
}
