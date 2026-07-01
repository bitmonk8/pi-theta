import { describe, expect, it } from "vitest";
import {
  evictStaleParseCacheEntries,
  type WarpImportEdgeGraph,
} from "../src/extension/cache-eviction";
import type { ParsedCallee } from "../src/runtime/invocation";
import { FakeFileSystem } from "./helpers/fake-file-system";

// V15e-T — failing tests for the paired `V15e` "Hot-reload static-resolution
// cache eviction" implementation.
//
// Spec: implementation-notes.md ("Static-resolution load pass") — the in-process
// re-parse path drops the static-resolution per-pass parse cache entry (V15a)
// for the changed file and every transitive `.warp` importer (V15c) as part of
// the `LoomRegistry` swap (V9b). Path identities are compared in the canonical
// `realpath`-then-forward-slash form per invocation.md §Resolution.
//
// Each test reds on its own primary assertion because the V15e eviction body is
// absent: `evictStaleParseCacheEntries` returns an empty `evicted` list, never
// mutates the cache, and never calls `rebuildImportGraph`. No test reds on a
// compile error, a missing fixture, or a harness throw.

/** A cache entry stub — the eviction only cares about the key, not the payload. */
function callee(path: string): ParsedCallee {
  return { path, invokePaths: [], toolLoomPaths: [] };
}

/** Build a per-pass parse cache keyed by canonical path. */
function cacheOf(...paths: readonly string[]): Map<string, ParsedCallee> {
  return new Map(paths.map((p) => [p, callee(p)]));
}

/** A `FakeFileSystem` whose `realpath` returns each registered file path as-is. */
function fsWith(
  files: Record<string, string>,
  extra: { symlinks?: Record<string, string>; caseInsensitive?: boolean } = {},
): FakeFileSystem {
  return new FakeFileSystem({
    homedir: "/home/u",
    cwd: "/proj",
    files,
    symlinks: extra.symlinks ?? {},
    caseInsensitive: extra.caseInsensitive === true,
  });
}

// --------------------------------------------------------------------------
// (1) Changed file + every transitive `.warp` importer dropped in the swap.
// --------------------------------------------------------------------------

describe("V15e-T — eviction drops the changed file and its transitive .warp importers (implementation-notes.md — Static-resolution load pass)", () => {
  it("implementation-notes.md — Static-resolution load pass: the changed file and every transitive .warp importer are dropped from the per-pass parse cache as part of the LoomRegistry swap", async () => {
    // Import graph (importer → imported): b imports a, c imports b, so the
    // transitive importers of the changed file `a.warp` are {b, c}. `d.warp`
    // imports nothing on that chain and must survive the swap.
    const a = "/proj/lib/a.warp";
    const b = "/proj/lib/b.warp";
    const c = "/proj/lib/c.warp";
    const d = "/proj/lib/d.warp";
    const fs = fsWith({ [a]: "warp", [b]: "warp", [c]: "warp", [d]: "warp" });
    const cache = cacheOf(a, b, c, d);
    const graph: WarpImportEdgeGraph = {
      edges: new Map([
        [b, [a]],
        [c, [b]],
        [d, []],
      ]),
    };

    const result = await evictStaleParseCacheEntries(
      { fs },
      { changedPath: a, cache, rebuildImportGraph: () => graph },
    );

    // The changed file and its transitive importers are dropped; the unrelated
    // file survives, so the next load pass re-parses only the stale entries.
    expect(cache.has(a)).toBe(false);
    expect(cache.has(b)).toBe(false);
    expect(cache.has(c)).toBe(false);
    expect(cache.has(d)).toBe(true);
    expect([...result.evicted].sort()).toEqual([a, b, c].sort());
  });
});

// --------------------------------------------------------------------------
// (2) Non-canonical changed-file path still hits (canonical realpath form).
// --------------------------------------------------------------------------

describe("V15e-T — eviction canonicalises a non-canonical changed-file path (invocation.md §Resolution)", () => {
  it("implementation-notes.md — Static-resolution load pass: a symlink-delivered changed path canonicalises to the realpath-then-forward-slash cache key, so the stale entry is dropped rather than surviving the swap", async () => {
    // The cache is keyed under the canonical `realpath` form; the watcher
    // delivers a symlink path that resolves to that same canonical target.
    const canonical = "/proj/real/lib.warp";
    const symlinkPath = "/proj/link.warp";
    const fs = fsWith(
      { [canonical]: "warp" },
      { symlinks: { [symlinkPath]: canonical } },
    );
    const cache = cacheOf(canonical);
    const graph: WarpImportEdgeGraph = { edges: new Map([[canonical, []]]) };

    const result = await evictStaleParseCacheEntries(
      { fs },
      { changedPath: symlinkPath, cache, rebuildImportGraph: () => graph },
    );

    // Compared in the canonical `realpath`-then-forward-slash form, the
    // non-canonical delivered path matches the cache key and the drop hits.
    expect(cache.has(canonical)).toBe(false);
    expect(result.evicted).toContain(canonical);
  });
});

// --------------------------------------------------------------------------
// (3) Negative-direction under-eviction: the walk runs over the REBUILT
//     post-swap graph, sequenced after the rebuild (ordering pinned).
// --------------------------------------------------------------------------

describe("V15e-T — the eviction walk runs over the rebuilt post-swap import-edge graph (V15c), sequenced after the rebuild", async () => {
  it("implementation-notes.md — Static-resolution load pass: a file that newly imports the changed file is identified as a transitive importer over the rebuilt post-swap graph and its cache entry is dropped, with the rebuild-before-walk ordering pinned", async () => {
    const changed = "/proj/lib/target.warp";
    const newImporter = "/proj/lib/x.warp";
    const fs = fsWith({ [changed]: "warp", [newImporter]: "warp" });
    const cache = cacheOf(changed, newImporter);

    // The PRE-swap graph carries no edge from `x` to the changed file — the
    // edge is newly established by this reload. A pre-swap-graph computation
    // would therefore never identify `x` as an importer (the vacuity guard).
    const preSwapGraph: WarpImportEdgeGraph = { edges: new Map([[newImporter, []]]) };
    expect(preSwapGraph.edges.get(newImporter)).toEqual([]);

    // The POST-swap graph, produced only by the rebuild thunk, carries the new
    // `x → target` edge. The eviction MUST call the thunk and walk its result.
    const postSwapGraph: WarpImportEdgeGraph = {
      edges: new Map([[newImporter, [changed]]]),
    };
    const events: string[] = [];
    const rebuildImportGraph = (): WarpImportEdgeGraph => {
      events.push("rebuild");
      return postSwapGraph;
    };

    const result = await evictStaleParseCacheEntries(
      { fs },
      { changedPath: changed, cache, rebuildImportGraph },
    );

    // Ordering pin: the rebuild ran (the walk had a post-swap graph to read).
    expect(events).toContain("rebuild");
    // The newly-established importer is identified over the rebuilt graph and
    // dropped — reds if the walk read the pre-swap graph (no `x → target` edge).
    expect(result.evicted).toContain(newImporter);
    expect(cache.has(newImporter)).toBe(false);
    // The changed file itself is always dropped.
    expect(cache.has(changed)).toBe(false);
  });
});
