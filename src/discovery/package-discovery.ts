// V10b / V10b-T — Package discovery (bounded walk).
//
// The loom extension owns package discovery end-to-end (Pi has no `pi.looms`
// slot): it walks the five installed-package roots itself — project `.pi/npm/`,
// project `.pi/git/<host>/<path>/`, project-local `node_modules/`, global
// `~/.pi/agent/npm/`, and global `~/.pi/agent/git/<host>/<path>/` — inspects
// each candidate package's `package.json`, and resolves either its `pi.looms`
// manifest array (minimatch globs with the fixed `!`/`+`/`-` override order) or
// the conventional `looms/` fallback directory. The walk is bounded: it stops
// after `looms.scanPackagesMaxFiles` `package.json` reads or
// `looms.scanPackagesTimeoutMs` wall-clock milliseconds (whichever fires first,
// file-count consulted before time on a tie), each candidate read is bounded by
// a per-read deadline `max(200, floor(scanPackagesTimeoutMs / 10))` armed
// through the injected `Clock.setTimeout` seam, and the whole walk is skipped
// when `looms.scanPackages` is `false`.
//
// V10b-T (tests-task) declares the seam shape and stubs `discoverPackageLooms`
// with an inert result (no looms, no diagnostics) so the failing tests compile
// and red on their own primary assertions — the walk is absent, not throwing.
// The paired V10b implementation leaf fills this in and wires it into the
// priority-4 Package source of `discoverLooms`.
//
// Spec: discovery/package-and-settings.md (DISC-5 `pi.looms` shape + minimatch
// override order, DISC-6 bounded walk + per-read deadline), with the
// `loom/load/*` diagnostic codes/messages sourced from
// diagnostics/code-registry-load.md.

import type { Diagnostic } from "../diagnostics/diagnostic";
import type { FileSystem } from "../seams/file-system";
import type { Clock } from "../seams/clock";
import type { LoomSettings } from "./settings";

/**
 * Inputs to one package-discovery walk. The bounds (`scanPackages`,
 * `scanPackagesMaxFiles`, `scanPackagesTimeoutMs`) are read from the merged
 * `settings.looms` view V10c produces — the walk applies its built-in defaults
 * (`true` / `2000` / `2000`) only when the merged view omits a key, so an
 * operator override flows through to the walk rather than being overridden by a
 * hardcoded constant. The `Clock` seam times the walk and arms the per-read
 * deadline so the `FakeClock` test seam can drive both deterministically.
 */
export interface PackageDiscoveryInput {
  readonly fs: FileSystem;
  readonly clock: Clock;
  readonly settings: LoomSettings;
}

/** One package-discovered, registrable loom: its slash name, absolute path, and source. */
export interface PackageDiscoveredLoom {
  readonly name: string;
  readonly path: string;
  readonly source: "package";
}

/** The outcome of one package-discovery walk. */
export interface PackageDiscoveryResult {
  readonly looms: readonly PackageDiscoveredLoom[];
  readonly diagnostics: readonly Diagnostic[];
}

/** Built-in bound defaults (DISC-6 upper bounds, not target performance). */
export const DEFAULT_SCAN_PACKAGES = true;
export const DEFAULT_SCAN_PACKAGES_MAX_FILES = 2000;
export const DEFAULT_SCAN_PACKAGES_TIMEOUT_MS = 2000;

/**
 * Walk the five installed-package roots, resolve each candidate package's
 * `pi.looms` manifest (or `looms/` fallback), and return the registrable looms
 * plus the load-phase diagnostics, subject to the DISC-6 file-count / wall-clock
 * bounds and the per-read deadline.
 *
 * V10b-T stub: inert (no looms, no diagnostics) so the failing tests red on
 * their own primary assertions — the walk body is absent, not throwing.
 */
export async function discoverPackageLooms(
  input: PackageDiscoveryInput,
): Promise<PackageDiscoveryResult> {
  void input;
  return { looms: [], diagnostics: [] };
}
