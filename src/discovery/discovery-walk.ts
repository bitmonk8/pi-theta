// V10a / V10a-T — the five-source discovery walk, source priority, per-source
// failure modes, `~/` home expansion, slash-name validity, and the
// cross-source-shadow / cross-format-collision resolution (the loom always
// loses, asymmetrically).
//
// This module owns the discovery union over the CLI, Settings, Project,
// Packages, and Global sources, mapping each discovered `*.loom` file to its
// slash name (the filename stem, taken verbatim) and emitting the load-phase
// diagnostics the failure-modes table and collision rules mandate.
//
// V10a-T (tests-task) declares the seam shape and stubs `discoverLooms` with an
// inert result (no looms, no diagnostics) so the failing tests compile and red
// on their own primary assertions — the discovery walk is absent, not throwing.
// The paired V10a implementation leaf fills this in (and extends `DiscoveryInput`
// with the package-source plumbing V10b owns).
//
// Spec: discovery.md, discovery/discovery-sources.md (DISC-1…DISC-4), with the
// `loom/load/*` diagnostic codes/messages sourced from
// diagnostics/code-registry-load.md.

import type { Diagnostic } from "../diagnostics/diagnostic";
import type { FileSystem } from "../seams/file-system";
import type { LoomSettings } from "./settings";

/** The five discovery sources, in priority order high→low. */
export type DiscoverySource = "cli" | "settings" | "project" | "package" | "global";

/**
 * A Pi-owned slash command already registered when the discovery walk runs.
 * Used by the cross-format collision check: a `.loom` deriving the same slash
 * name as one of these drops (the loom loses asymmetrically), the Pi-owned
 * entry survives.
 */
export interface PiOwnedCommand {
  readonly name: string;
  readonly source: "prompt" | "skill" | "extension";
}

/**
 * Inputs to one discovery pass. `cliPaths` is the already-split `--loom` flag
 * (the factory splits the raw flag on `path.delimiter` before calling, so the
 * walk is platform-independent). The merged `settings` carries `loomPaths`
 * from V10c.
 */
export interface DiscoveryInput {
  readonly fs: FileSystem;
  readonly settings: LoomSettings;
  readonly cliPaths?: readonly string[];
  readonly piOwnedNames?: readonly PiOwnedCommand[];
}

/** One discovered, registrable loom: its slash name, absolute path, and source. */
export interface DiscoveredLoom {
  readonly name: string;
  readonly path: string;
  readonly source: DiscoverySource;
}

/** The outcome of one discovery pass. */
export interface DiscoveryResult {
  readonly looms: readonly DiscoveredLoom[];
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Walk the five discovery sources, resolve priority and collisions, and return
 * the registrable looms plus the load-phase diagnostics.
 *
 * V10a-T stub: returns an inert empty result so the failing tests red on their
 * own primary assertions (no loom discovered, no diagnostic emitted); V10a
 * implements the walk.
 */
export async function discoverLooms(input: DiscoveryInput): Promise<DiscoveryResult> {
  void input;
  return { looms: [], diagnostics: [] };
}
