// Resolve the `.thetalib` re-export closure: collect and settle the graph, then
// diagnose unknown symbols and declaring-site collisions in pass order.

import type { Diagnostic, SourceRange } from "../diagnostics/diagnostic";
import {
  IMPORT_NAME_COLLISION_CODE,
  IMPORT_NAME_COLLISION_HINT,
  checkImportUnknownSymbols,
  importNameCollisionMessage,
  loadThetaLibImport,
  type Resolver,
} from "../parser/imports";
import {
  extractThetaLibForms,
  unreadableThetaLibDiagnostic,
  type CachingThetaLibProbe,
  type ParsedThetaLib,
} from "./import-static-checks";

/**
 * One `export { source as exported } from "<specPath>"` specifier, with both
 * ends already resolved: `fromLib` re-exports `exported`, drawing on
 * `sourceLib`'s `source`.
 */
interface ReExportEdge {
  readonly fromLib: string;
  readonly sourceLib: string;
  readonly specPath: string;
  readonly source: string;
  readonly exported: string;
  readonly range: SourceRange;
}

/** The collected re-export edges, declaration seeds and settled provided names. */
interface ReExportGraph {
  readonly libDeclaredNames: Map<string, readonly string[]>;
  readonly reExportEdges: ReExportEdge[];
  readonly provided: Map<string, Set<string>>;
}

/** Collect every walked lib's re-export closure and settle its least fixpoint. */
async function collectReExportGraph(
  walked: Set<string>,
  parseThetaLib: (resolvedPath: string) => Promise<ParsedThetaLib | undefined>,
  probe: CachingThetaLibProbe,
  resolver: Resolver,
  unreadablePaths: Set<string>,
  diagnostics: Diagnostic[],
): Promise<ReExportGraph> {
  /** Each collected lib's own top-level declaration names — the fixpoint's seed. */
  const libDeclaredNames = new Map<string, readonly string[]>();
  const reExportEdges: ReExportEdge[] = [];
  const closedOver = new Set<string>();

  /**
   * Phase 1 — collect the `.thetalib` files reachable from one walked lib
   * over `export … from` edges, with their declaration names and their edges.
   *
   * Resolution happens here and once per `export` STATEMENT, because the path
   * belongs to the statement and not to each of its specifiers: that is what
   * makes `theta/load/unresolvable-thetalib-path` fire once over `stmt.range`,
   * identically to the import loop below ranging it over `decl.range`. The
   * per-path guard also bounds a re-export cycle, so no name is admitted or
   * diagnosed during collection — the answer to "which names does this lib
   * provide" is not knowable until the fixpoint below settles.
   */
  const closeOverReExports = async (resolvedPath: string): Promise<void> => {
    if (closedOver.has(resolvedPath)) {
      return;
    }
    closedOver.add(resolvedPath);
    const parsed = await parseThetaLib(resolvedPath);
    if (parsed === undefined) {
      libDeclaredNames.set(resolvedPath, []);
      return;
    }
    libDeclaredNames.set(
      resolvedPath,
      extractThetaLibForms(parsed.document.body).declarations.map(
        (declaration) => declaration.name,
      ),
    );
    for (const stmt of parsed.document.body.statements) {
      if (stmt.kind !== "export") {
        continue;
      }
      // A path not ending in `.thetalib` is SKIPPED, mirroring the import loop's
      // extension skip below: the parse-time
      // `theta/parse/import-non-thetalib-extension` is already the answer for
      // that spelling (and a from-less export's `path: ""` is the same rule), so
      // this analysis does not double-report it.
      if (!stmt.path.endsWith(".thetalib")) {
        continue;
      }
      await probe.precache(stmt.path, resolvedPath);
      const load = loadThetaLibImport(resolver, stmt.path, resolvedPath, {
        file: resolvedPath,
        range: stmt.range,
      });
      if (!load.registered || load.resolvedPath === undefined) {
        // IMP-1 on the re-export statement's own path, sited on the re-exporting
        // lib. An unresolvable source lib contributes no edge, so the specifiers
        // it names draw no second, unknown-symbol report.
        diagnostics.push(...load.diagnostics);
        continue;
      }
      await closeOverReExports(load.resolvedPath);
      // Bug 0428: the re-export's source edge RESOLVED but its bytes could not
      // be read — IMP-1's "likewise unresolvable" clause at RE-EXPORT depth,
      // sited on this `export … from` statement (the re-exporting lib), matching
      // the resolution-failure push above. Suppress the edge push exactly as
      // that arm's `continue` does: an unreadable source contributes no edge, so
      // the specifiers it names draw no second, unknown-symbol report over the
      // empty declared-name set `closeOverReExports`'s own `parsed === undefined`
      // arm seeds for it. That top-level arm stays silent for `resolvedPath`
      // itself — a read failure reached only as a WALK ROOT (never through a
      // re-export edge) is already reported by the direct-decl loop or the
      // transitive walk that resolved it, so reporting it again here would
      // double-report.
      if (unreadablePaths.has(load.resolvedPath)) {
        diagnostics.push(
          unreadableThetaLibDiagnostic({ file: resolvedPath, range: stmt.range }, stmt.path),
        );
        continue;
      }
      for (const specifier of stmt.specifiers) {
        reExportEdges.push({
          fromLib: resolvedPath,
          sourceLib: load.resolvedPath,
          specPath: stmt.path,
          source: specifier.source,
          exported: specifier.local,
          range: specifier.range,
        });
      }
    }
  };

  /**
   * Phase 2 — the least fixpoint of the collected file set: each lib's resolved
   * export set is its own declaration names plus every re-export whose source lib
   * provides the name it draws on.
   *
   * Iterating to stability rather than recursing down one chain is what makes the
   * result a pure function of the `.thetalib` file set (imports.md §Re-exports):
   * a name that genuinely flows round a cycle is reached on a later round instead
   * of being cut by whichever chain the derivation happened to enter on. The sets
   * only grow, inside the finite universe of names the collected files spell, so
   * the loop terminates.
   */
  const fixReExportedNames = (): Map<string, Set<string>> => {
    const provided = new Map<string, Set<string>>();
    for (const [path, names] of libDeclaredNames) {
      provided.set(path, new Set(names));
    }
    let grew = true;
    while (grew) {
      grew = false;
      for (const edge of reExportEdges) {
        const target = provided.get(edge.fromLib);
        if (target === undefined || target.has(edge.exported)) {
          continue;
        }
        if (provided.get(edge.sourceLib)?.has(edge.source) === true) {
          target.add(edge.exported);
          grew = true;
        }
      }
    }
    return provided;
  };

  for (const resolvedPath of walked) {
    await closeOverReExports(resolvedPath);
  }
  return { libDeclaredNames, reExportEdges, provided: fixReExportedNames() };
}

/** Diagnose distinct declaring sites only after unknown re-exports have been reported. */
function diagnoseReExportSiteCollisions(graph: ReExportGraph, diagnostics: Diagnostic[]): void {
  const { libDeclaredNames, reExportEdges } = graph;

  /**
   * Bug 0334: the terminal declaring site `(lib, name)` reaches over the
   * re-export graph, keyed as `` `${lib}\u0000${name}` `` rather than as a
   * `(lib, name)` pair: that pair IS the collision key, and one string carries
   * it through `Set` value-equality. A name that is this lib's OWN declaration resolves to itself; a
   * name reached only through `export … from` edges follows the first edge
   * whose `exported` matches, recursing on its source. `visited` bounds a
   * re-export cycle exactly as `materializeChain`'s own visited set does, so a
   * cyclic chain contributes no site rather than looping — a name that never
   * reaches a real declaration cannot collide with anything.
   */
  const resolveDeclaringSite = (
    lib: string,
    name: string,
    visited: Set<string>,
  ): string | undefined => {
    const key = `${lib}\u0000${name}`;
    if (visited.has(key)) {
      return undefined;
    }
    visited.add(key);
    if (libDeclaredNames.get(lib)?.includes(name) === true) {
      return key;
    }
    for (const edge of reExportEdges) {
      if (edge.fromLib !== lib || edge.exported !== name) {
        continue;
      }
      const site = resolveDeclaringSite(edge.sourceLib, edge.source, visited);
      if (site !== undefined) {
        return site;
      }
    }
    return undefined;
  };

  /**
   * Bug 0334: a re-exporting lib's resolved export set that receives one name
   * from two edges resolving to DIFFERENT declaring sites is the same
   * ambiguity `checkImportNameCollisions` refuses across an importing theta's
   * own specifiers (imports.md §"Name collisions") — reached here one hop
   * removed, through the re-export closure `fixReExportedNames` already
   * dedups to a bare name set. Grouping by declaring site (not by
   * `sourceLib`) is what keeps the diamond (two paths to ONE declaration)
   * exempt: both its edges resolve to the same key, so the "differs" test
   * never fires. Each edge resolves against a FRESH `visited` set — one
   * edge's cycle bound must not starve a sibling edge's resolution — and an
   * edge that resolves to no site at all is skipped, since an unresolved name
   * is `diagnoseReExports`'s unknown-symbol subject, never a collision
   * partner. One diagnostic per colliding group, sited on the second
   * (differing) edge, mirrors `checkImportNameCollisions`' one-report-per-
   * collision shape.
   */
  const diagnoseReExportCollisions = (): void => {
    const groups = new Map<string, Map<string, ReExportEdge[]>>();
    for (const edge of reExportEdges) {
      let byName = groups.get(edge.fromLib);
      if (byName === undefined) {
        byName = new Map<string, ReExportEdge[]>();
        groups.set(edge.fromLib, byName);
      }
      const edges = byName.get(edge.exported) ?? [];
      edges.push(edge);
      byName.set(edge.exported, edges);
    }
    for (const [fromLib, byName] of groups.entries()) {
      for (const [exported, edges] of byName.entries()) {
        if (edges.length < 2) {
          continue;
        }
        // A name the re-exporting lib declares itself is bound from that own
        // declaration (materializeChain resolves direct-first), so its
        // re-export edges are inert and cannot collide. Diagnosing them would
        // fire on the re-export-shadows-own-declaration seam that this bug
        // leaves deferred (§Non-goals bullet 3).
        if (libDeclaredNames.get(fromLib)?.includes(exported) === true) {
          continue;
        }
        let firstSite: string | undefined;
        for (const edge of edges) {
          const site = resolveDeclaringSite(edge.sourceLib, edge.source, new Set<string>());
          if (site === undefined) {
            continue;
          }
          if (firstSite === undefined) {
            firstSite = site;
            continue;
          }
          if (site !== firstSite) {
            diagnostics.push({
              severity: "error",
              code: IMPORT_NAME_COLLISION_CODE,
              file: edge.fromLib,
              range: edge.range,
              message: importNameCollisionMessage(edge.exported),
              hint: IMPORT_NAME_COLLISION_HINT,
            });
            break;
          }
        }
      }
    }
  };

  diagnoseReExportCollisions();
}

/**
 * The re-export chain fixpoint (imports.md §Re-exports), split out of
 * `checkThetaImports` into its own top-level function so the module header's
 * three ordered phases (collect, settle, diagnose — the last in two steps)
 * share one home instead of the caller's:
 * `closeOverReExports` collects the `export … from` closure of every
 * `.thetalib` `walked` reaches, `fixReExportedNames` settles the least
 * fixpoint of the collected file set, and `diagnoseReExports` /
 * `diagnoseReExportCollisions` diagnose an unresolvable re-exported name and a
 * same-name collision resolving to two different declaring sites over that
 * settled result. Takes as explicit parameters exactly what those phases read
 * from `checkThetaImports`'s scope before this split; this phase's own
 * fixpoint state (`libDeclaredNames` / `reExportEdges`) stays internal to it,
 * since nothing outside this phase reads it. Returns the diagnostics the
 * phases push, in the SAME order they pushed before this split (walk every
 * `walked` path first, settle the fixpoint, THEN diagnose unresolved
 * re-exports, THEN diagnose collisions) — the caller appends them to its own
 * set unchanged.
 */
export async function resolveReExportClosure(
  walked: Set<string>,
  parseThetaLib: (resolvedPath: string) => Promise<ParsedThetaLib | undefined>,
  probe: CachingThetaLibProbe,
  resolver: Resolver,
  unreadablePaths: Set<string>,
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const graph = await collectReExportGraph(
    walked, parseThetaLib, probe, resolver, unreadablePaths, diagnostics,
  );
  const { reExportEdges, provided } = graph;

  /**
   * Phase 3 — one `theta/parse/import-unknown-symbol` per re-export whose source
   * name the settled fixpoint shows nothing provides, sited on the re-exporting
   * lib and ranged over the specifier (that code names one symbol).
   */
  const diagnoseReExports = (provided: Map<string, Set<string>>): void => {
    for (const edge of reExportEdges) {
      const sourceExports = provided.get(edge.sourceLib) ?? new Set<string>();
      if (sourceExports.has(edge.source)) {
        continue;
      }
      diagnostics.push(
        ...checkImportUnknownSymbols(
          edge.fromLib,
          edge.specPath,
          [{ source: edge.source, local: edge.exported, range: edge.range }],
          [...sourceExports],
        ),
      );
    }
  };

  diagnoseReExports(provided);
  diagnoseReExportSiteCollisions(graph, diagnostics);

  return diagnostics;
}
