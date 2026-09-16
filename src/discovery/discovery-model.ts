// Discovery-wide types, diagnostic codes, and the priority / failure-mode /
// slash-name tables shared by discovery-walk.ts's own concerns (per-source
// enumeration, the settings `thetaPaths` sub-walk, the five-source driver)
// and by discovery-collision-resolve.ts's cross-source/format collision
// resolution (PTQ-0333). Split out of discovery-walk.ts as PTQ-0305's Seam 0
// — the leaf every one of those concerns depends on at runtime (collision
// resolution alone reads `PRIORITY` nine times plus five of the codes
// below), so it had to move first: moving any of the others out first would
// have created a host<->module runtime import cycle. This module imports
// nothing from discovery-walk.ts or discovery-collision-resolve.ts.
//
// `DiscoverySource`, `PiOwnedCommand`, `DiscoveryInput`, `DiscoveredTheta`,
// and `DiscoveryResult` were already public before the split (re-exported by
// discovery-walk.ts, unchanged, for its existing src/test importers). Every
// other member here — including `SourcedCandidate` (PTQ-0333: moved here
// rather than left file-private in discovery-walk.ts, so
// discovery-collision-resolve.ts can depend on it without importing from
// discovery-walk.ts, the cycle guard) — was file-private in discovery-walk.ts
// and is exported only because discovery-walk.ts or
// discovery-collision-resolve.ts imports it back.
//
// Spec: discovery.md, discovery/discovery-sources.md (DISC-1…DISC-4), with
// the `theta/load/*` diagnostic codes/messages sourced from
// diagnostics/code-registry-load.md.

import type { Diagnostic, Severity } from "../diagnostics/diagnostic";
import type { FileSystem } from "../seams/file-system";
import type { ThetaSettings } from "./settings";

/** The five discovery sources, in priority order high→low. */
export type DiscoverySource = "cli" | "settings" | "project" | "package" | "global";

/**
 * A Pi-owned slash command already registered when the discovery walk runs.
 * Used by the cross-format collision check: a `.theta` deriving the same slash
 * name as one of these drops (the theta loses asymmetrically), the Pi-owned
 * entry survives.
 */
export interface PiOwnedCommand {
  readonly name: string;
  /** The host-populated `SlashCommandInfo.sourceInfo.path`, rendered as the
   *  `.md`-sibling tail of the `theta/load/cross-format-collision` message
   *  (placeholder-rendering-b.md:57). Absent for a foreign extension command
   *  whose entry carries no host path — the Pi-owned mint then falls back to
   *  the command name. */
  readonly path?: string;
}

/**
 * Inputs to one discovery pass. `cliPaths` is the already-split `--theta` flag
 * (the factory splits the raw flag on `path.delimiter` before calling, so the
 * walk is platform-independent). The merged `settings` carries `thetaPaths`
 * from V10c.
 */
export interface DiscoveryInput {
  readonly fs: FileSystem;
  readonly settings: ThetaSettings;
  readonly cliPaths?: readonly string[];
  readonly piOwnedNames?: readonly PiOwnedCommand[];
  /**
   * V10b: package candidates the composition's own bounded package-discovery
   * walk already resolved (clock/bounds live outside this walk). Pushed into
   * `candidates` as ordinary `package`-source `SourcedCandidate`s so the
   * existing `resolveBySource` → `validateAndRead` → `resolveSlashNames`
   * chain adjudicates them with the other four sources — no new logic.
   */
  readonly packageCandidates?: readonly {
    readonly path: string;
    readonly stem: string;
    readonly descriptorValue: string;
  }[];
  /**
   * Bug 0331: the marked root's winning source path, as the parent resolved
   * it, threaded from the AUTHENTICATED control plane
   * (`detectMarkedRootWinner`). `undefined` outside the subagent-root regime
   * or when the carrier is absent/malformed — the walk then applies today's
   * collision resolution unconditionally. Scoped to `slug` alone: a genuine
   * collision or shadow under any OTHER name is unaffected.
   */
  readonly markedRoot?: { readonly slug: string; readonly winnerPath: string } | undefined;
}

/** One discovered, registrable theta: its slash name, absolute path, and source. */
export interface DiscoveredTheta {
  readonly name: string;
  readonly path: string;
  readonly source: DiscoverySource;
}

/** The outcome of one discovery pass. */
export interface DiscoveryResult {
  readonly thetas: readonly DiscoveredTheta[];
  readonly diagnostics: readonly Diagnostic[];
  /** The resolved discovery-root union over the walk's own four sources
   *  (cli/settings/project/global): directories that exist at
   *  scan time, regardless of whether they
   *  currently hold a `.theta`. Distinct from `thetas`' dirnames, which drop
   *  any present-but-empty root. */
  readonly roots: readonly string[];
}

/** A raw candidate together with its owning source (for case-collision and
 *  cross-source/format collision resolution). */
export interface SourcedCandidate {
  readonly path: string;
  readonly stem: string;
  readonly source: DiscoverySource;
  readonly sourceLabel: string;
  /** The descriptor VALUE per placeholder-rendering-b.md §5: the source's own
   *  configuration text verbatim (the `--theta` operand, the settings entry,
   *  the package name) or, for the two conventional-root sources with no
   *  operator-typed text, the root's resolved directory path (0268
   *  forward-slashed). Rendered at the cross-source-shadow/collision mint
   *  sites via `renderDescriptor`, never read for candidate identity or
   *  ordering. */
  readonly descriptorValue: string;
}

// --------------------------------------------------------------------------
// Diagnostic codes (sourced from diagnostics/code-registry-load.md).
// --------------------------------------------------------------------------

export const MISSING_SOURCE = "theta/load/missing-source";
export const UNREADABLE_SOURCE = "theta/load/unreadable-source";
export const WRONG_TYPE_SOURCE = "theta/load/wrong-type-source";
export const UNREADABLE_FILE = "theta/load/unreadable";
export const CASE_COLLISION = "theta/load/case-collision";
export const NON_CANONICAL_EXTENSION = "theta/load/non-canonical-extension";
export const INVALID_SLASH_NAME = "theta/load/invalid-slash-name";
export const CROSS_SOURCE_SHADOW = "theta/load/cross-source-shadow";
export const CROSS_FORMAT_COLLISION = "theta/load/cross-format-collision";
export const INVALID_EXTENSION = "theta/load/invalid-extension";

/** Accepted slash-name (filename stem) shape, per DISC-3 Filename validity. */
export const SLASH_NAME = /^[a-z0-9][a-z0-9_-]*$/;

/** Source priority high→low; smaller number wins. Package (4) is V10b's. */
export const PRIORITY: Record<DiscoverySource, number> = {
  cli: 1,
  settings: 2,
  project: 3,
  package: 4,
  global: 5,
} as const;

/** Per-source failure-mode severities (DISC-2 table). `null` = silent. */
export interface FailureModes {
  readonly missing: Severity | null;
  readonly unreadable: Severity;
  readonly wrongType: Severity;
}

export const CONVENTIONAL_MODES: FailureModes = {
  missing: null,
  unreadable: "warning",
  wrongType: "warning",
} as const;
export const SETTINGS_MODES: FailureModes = {
  missing: "error",
  unreadable: "warning",
  wrongType: "error",
} as const;
export const CLI_MODES: FailureModes = {
  missing: "error",
  unreadable: "error",
  wrongType: "error",
} as const;

/** Per-source failure-mode severities, keyed directly off `DiscoverySource`
 *  the same way `PRIORITY` already is. `enumerateDirectory` / `resolveEntry`
 *  / `collectFromEntries` derive `modes` from `source` through this lookup
 *  instead of threading it alongside `source` as a second, independently
 *  suppliable parameter — the two never varied independently at any call
 *  site (PTQ-0366). `package` is excluded from the key type: its candidates
 *  are pushed directly as `SourcedCandidate`s and never reach those three
 *  functions, so there is no row to give it. */
export const MODES_BY_SOURCE: Record<Exclude<DiscoverySource, "package">, FailureModes> = {
  cli: CLI_MODES,
  settings: SETTINGS_MODES,
  project: CONVENTIONAL_MODES,
  global: CONVENTIONAL_MODES,
} as const;
