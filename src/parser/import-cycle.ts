// V15c — `.thetalib` static import-cycle detection.
//
// This module owns the `theta/load/import-cycle` diagnostic: the opaque-id
// import graph type and the DFS cycle detector over it (imports.md §"Cycles").

import type { Diagnostic } from "../diagnostics/diagnostic";
import type { ImportSite } from "./imports";

// ── theta/load/import-cycle ──────────────────────────────────────────────────

export const IMPORT_CYCLE_CODE = "theta/load/import-cycle";

/**
 * `theta/load/import-cycle` message. `stems` is the cycle path as file-path
 * stems (the first stem repeated at the end); rendered as
 * `import cycle: a.thetalib → b.thetalib → a.thetalib` (each stem suffixed `.thetalib`, joined
 * by ` → `), per diagnostics/placeholder-rendering-b.md.
 */
export function importCycleMessage(stems: readonly string[]): string {
  return `import cycle: ${stems.map((s) => `${s}.thetalib`).join(" → ")}`;
}

/**
 * The static `.thetalib` import graph: `edges` maps each node to the nodes it
 * imports. Node ids are OPAQUE to `detectImportCycle` — the caller decides
 * what identifies a `.thetalib` file (bug 0302: the IMP-5 pass keys by
 * resolved path so two files sharing a basename stay distinct nodes);
 * `importCycleMessage` renders the cycle path through the caller-supplied
 * `renderStem`, not through the node id itself.
 */
export interface ThetaLibImportGraph {
  readonly edges: ReadonlyMap<string, readonly string[]>;
}

/**
 * Walk the static `.thetalib` import graph from `entry`, returning
 * `theta/load/import-cycle` with the cycle path printed when a cycle is
 * discovered, and `undefined` for an acyclic graph (imports.md §"Cycles").
 * `renderStem` maps an opaque node id to the stem printed in the message;
 * it defaults to identity so existing stem-keyed callers render
 * byte-identically; the resolved-path-keyed IMP-5 pass (bug 0302) supplies
 * its own.
 */
export function detectImportCycle(
  entry: string,
  graph: ThetaLibImportGraph,
  site: ImportSite,
  renderStem: (node: string) => string = (node) => node,
): Diagnostic | undefined {
  const stack: string[] = [];
  const onStack = new Set<string>();
  const visited = new Set<string>();
  let cyclePath: readonly string[] | undefined;

  const walk = (node: string): void => {
    if (cyclePath !== undefined) {
      return;
    }
    stack.push(node);
    onStack.add(node);
    for (const next of graph.edges.get(node) ?? []) {
      if (onStack.has(next)) {
        // Back-edge: the cycle path runs from `next`'s first appearance on the
        // current stack, with `next` repeated at the end.
        const from = stack.indexOf(next);
        cyclePath = [...stack.slice(from), next];
        return;
      }
      if (!visited.has(next)) {
        walk(next);
        if (cyclePath !== undefined) {
          return;
        }
      }
    }
    stack.pop();
    onStack.delete(node);
    visited.add(node);
  };

  walk(entry);
  if (cyclePath === undefined) {
    return undefined;
  }
  return {
    severity: "error",
    code: IMPORT_CYCLE_CODE,
    file: site.file,
    range: site.range,
    message: importCycleMessage(cyclePath.map(renderStem)),
  };
}
