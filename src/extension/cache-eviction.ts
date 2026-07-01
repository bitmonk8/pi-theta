// V15e / V15e-T — hot-reload static-resolution cache eviction.
//
// This module owns the in-process hot-reload re-parse path's cache-eviction
// step (implementation-notes.md "Static-resolution load pass"): on a
// `LoomRegistry` swap triggered by a watched-file change (V9b), drop the
// static-resolution per-pass parse cache entry (V15a) for the changed file and
// for every file that transitively imports it across the `.warp` import-edge
// graph (V15c), so the next load pass re-parses them rather than reusing stale
// entries.
//
// The three path identities a drop must match on — the watcher-delivered
// changed-file path (V9b), the static-resolution per-pass parse cache key
// (V15a), and the `.warp` import-edge-graph node identity (V15c) — are compared
// in the single canonical `realpath`-then-forward-slash path form defined under
// invocation.md §Resolution (reused, not restated), so a non-canonical
// changed-file path (symlink, case-variant on a case-insensitive host, `.`/`..`
// segments, or relative-vs-absolute mismatch) canonicalises to the form the
// cache was keyed under and the drop hits rather than silently missing.
//
// The eviction walk runs over the *rebuilt post-swap* import-edge graph,
// sequenced after the graph rebuild and not before: a reload that newly
// establishes a transitive `.warp` import edge to the changed file must
// identify the new importer, which a pre-swap-graph computation could not.
//
// V15e-T (tests-task) declares the seam shapes and stubs the behaviour-bearing
// function inertly so the failing tests compile and red on their own primary
// assertions:
//   - `evictStaleParseCacheEntries` returns an empty `evicted` list, never
//     mutates the passed cache, and never invokes `rebuildImportGraph`, so
//     the "changed file + transitive importer dropped" assertion reds (the
//     cache still holds every entry), the non-canonical-path assertion reds
//     (the canonical entry survives), and the newly-established-edge /
//     ordering assertion reds (the new importer is neither evicted nor is the
//     rebuild thunk called).
// No test reds on a compile error, a missing fixture, or a harness throw. The
// paired V15e implementation leaf fills this in.
//
// Spec: implementation-notes.md ("Static-resolution load pass"),
// invocation.md (§Resolution), imports.md.

import type { FileSystem } from "../seams/file-system";
import type { ParsedCallee } from "../runtime/invocation";

/**
 * A `.warp` import-edge graph keyed in the canonical
 * `realpath`-then-forward-slash path form (V15c node identity, invocation.md
 * §Resolution): each importer's canonical path maps to the canonical paths it
 * directly imports. The eviction reverse-walks these edges from the changed
 * file to find its transitive importers.
 */
export interface WarpImportEdgeGraph {
  readonly edges: ReadonlyMap<string, readonly string[]>;
}

/** Host dependencies the eviction needs: only `realpath` (for canonicalisation). */
export interface CacheEvictionDeps {
  readonly fs: Pick<FileSystem, "realpath">;
}

/** Inputs to one eviction pass, run as part of the `LoomRegistry` swap. */
export interface CacheEvictionInput {
  /**
   * The watcher-delivered changed-file path (V9b). MAY be non-canonical (a
   * symlink, a case-variant, `.`/`..` segments, or relative); the eviction
   * canonicalises it to the `realpath`-then-forward-slash form before matching.
   */
  readonly changedPath: string;
  /**
   * The live static-resolution per-pass parse cache (V15a), keyed by canonical
   * path. Stale entries are dropped in place as part of the swap.
   */
  readonly cache: Map<string, ParsedCallee>;
  /**
   * Rebuild the post-swap `.warp` import-edge graph. The eviction MUST call
   * this and walk over its result — sequenced *after* the rebuild — so a reload
   * that newly establishes an import edge to the changed file identifies the
   * new importer (a pre-swap graph would miss it).
   */
  readonly rebuildImportGraph: () => WarpImportEdgeGraph;
}

/** The outcome of one eviction pass. */
export interface CacheEvictionResult {
  /**
   * The canonical paths whose cache entries were dropped — the changed file
   * plus every transitive `.warp` importer of it over the rebuilt post-swap
   * graph.
   */
  readonly evicted: readonly string[];
}

/**
 * Drop the static-resolution per-pass parse cache entry for the changed file
 * and for every file that transitively imports it across the rebuilt post-swap
 * `.warp` import-edge graph, matching all three path identities in the
 * canonical `realpath`-then-forward-slash form.
 *
 * V15e-T stub: inert. Returns an empty `evicted` list, never mutates `cache`,
 * and never invokes `rebuildImportGraph`, so every V15e assertion reds on its
 * own primary assertion (the paired V15e leaf fills this in).
 */
export async function evictStaleParseCacheEntries(
  deps: CacheEvictionDeps,
  input: CacheEvictionInput,
): Promise<CacheEvictionResult> {
  // Inert stub (V15e-T): touch neither the cache nor the rebuild thunk. Kept
  // async so the paired V15e implementation can `await deps.fs.realpath(...)`
  // without a signature change.
  void deps;
  void input;
  return { evicted: [] };
}
