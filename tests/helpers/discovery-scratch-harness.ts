// A shared "drive `discoverThetas` over a real, per-test scratch `PiFileSystem`
// root" harness (PTQ-0255).
//
// WHY THIS FILE EXISTS. tests/b0363-file-entry-stem-judged-on-entry-spelling.test.ts
// and tests/b0364-healthy-junction-ancestor-misclassifies-missing.test.ts each
// independently redeclared the same `THETA_BODY` fixture body, the same
// `posix` / `json` helpers, and the same `sp` / `underScratch` / `runWalk` trio
// that assembles a `DiscoveryInput` over a `PiFileSystem` rooted at the
// per-test scratch directory and drives the real `discoverThetas`. This module
// centralises the pieces that were byte-for-byte identical across those files.
// Each file keeps its own `scratchDir`/`scratchPosix` state and its own
// per-test directory-tree setup (a plain subdirectory for one file, a
// junction/symlink tree for the other) — `makeScratchOps` binds `sp` /
// `underScratch` / `runWalk` to that state by reading it fresh on every call,
// so a file's own `beforeEach` remains the one place that mutates it.
//
// TIER: unit, offline, deterministic, provider-free — the same tier as every
// file that imports this module. `runWalk` drives the real, shipped
// `discoverThetas` (`src/discovery/discovery-walk.ts`) over the real,
// production `PiFileSystem` (`src/seams/pi-file-system.ts`); nothing here is
// stubbed.

import {
  discoverThetas,
  type DiscoveredTheta,
  type DiscoveryInput,
} from "../../src/discovery/discovery-walk";
import type { ThetaSettings } from "../../src/discovery/settings";
import type { Diagnostic } from "../../src/diagnostics/diagnostic";
import { PiFileSystem } from "../../src/seams/pi-file-system";

/** A body that reads far enough to register — discovery validates the slash
 *  name and file readability only, never the mode block, so a prompt-mode body
 *  suffices to exercise the discovery name/diagnostic these files assert on. */
export const THETA_BODY = "mode: prompt\n---\n";

/** Forward-slash form for reference/compare (Node fs accepts `/` on Windows and
 *  the walk normalises to `/`; a drive-letter path stays absolute). PiFileSystem
 *  reports forward-slash paths, so the `.file` field is the forward-slash
 *  junction/real spelling. */
export function posix(path: string): string {
  return path.replace(/\\/g, "/");
}

/** `JSON.stringify`, named for the assertion-message call sites that read it. */
export const json = (value: unknown): string => JSON.stringify(value);

/** The `discoverThetas` result, filtered to nothing by the walker itself — each
 *  caller filters `thetas` / `diagnostics` to its own scratch root via its own
 *  `underScratch`. */
export interface WalkResult {
  readonly thetas: readonly DiscoveredTheta[];
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * `sp` / `underScratch` / `runWalk`, bound to a per-test scratch root read
 * fresh on every call through `getScratchPosix` — a plain closure over the
 * caller's own mutable `scratchPosix` variable (refreshed by the caller's own
 * `beforeEach`), not a copied value, is what makes these track a new root
 * every test.
 */
export function makeScratchOps(getScratchPosix: () => string): {
  /** A forward-slash absolute path under the scratch root. */
  readonly sp: (...parts: string[]) => string;
  /** True when `path` lies under the per-test scratch root (case-insensitive:
   *  the host may report the temp prefix in a different case than `tmpdir()`
   *  did). */
  readonly underScratch: (path: string) => boolean;
  /**
   * Drive `discoverThetas` over the real scratch root with the production
   * `PiFileSystem` whose cwd is the scratch root (so the project conventional
   * root is `<scratch>/.pi/theta`, absent → silent). Only the explicit
   * references the caller passes reach the scratch files.
   */
  readonly runWalk: (extra: {
    settings?: ThetaSettings;
    cliPaths?: readonly string[];
  }) => Promise<WalkResult>;
} {
  const sp = (...parts: string[]): string => [getScratchPosix(), ...parts].join("/");

  const underScratch = (path: string): boolean =>
    posix(path).toLowerCase().startsWith(getScratchPosix().toLowerCase());

  const runWalk = async (extra: {
    settings?: ThetaSettings;
    cliPaths?: readonly string[];
  }): Promise<WalkResult> => {
    const fs = new PiFileSystem(getScratchPosix());
    const inputObj: DiscoveryInput = {
      fs,
      settings: extra.settings ?? {},
      ...(extra.cliPaths !== undefined ? { cliPaths: extra.cliPaths } : {}),
    };
    const { thetas, diagnostics } = await discoverThetas(inputObj);
    return { thetas, diagnostics };
  };

  return { sp, underScratch, runWalk };
}
