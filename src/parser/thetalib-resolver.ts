// V15c — `.thetalib` relative-path resolution and the `Resolver` seam (IMP-1).
//
// This module owns relative `.thetalib`-only resolution through the named
// `Resolver` seam: the seam itself, the directory probe, the single theta 1.0.0
// implementation (`RelativeThetaLibResolver`), the load-pipeline entry
// (`loadThetaLibImport`), and the `theta/load/unresolvable-thetalib-path`
// diagnostic. Resolution follows imports.md, including the IMP-1 resolver
// failure contract.

import { posix } from "node:path";
import type { Diagnostic } from "../diagnostics/diagnostic";
import type { ImportSite } from "./imports";

// ── theta/load/unresolvable-thetalib-path + the Resolver seam (IMP-1) ─────────────

export const UNRESOLVABLE_THETALIB_PATH_CODE = "theta/load/unresolvable-thetalib-path";
export const UNRESOLVABLE_THETALIB_PATH_HINT =
  "Use a relative `./` or `../` path ending in `.thetalib` that points at an existing, readable file.";

/** `theta/load/unresolvable-thetalib-path` message (`<path>` as written). */
export function unresolvableThetaLibPathMessage(path: string): string {
  return `cannot resolve .thetalib import '${path}'`;
}

/**
 * The exception a `Resolver` throws to signal an unresolvable spec (IMP-1). The
 * load pipeline treats a throw from `resolve` as a resolution failure.
 */
export class UnresolvableThetaLibPathError extends Error {
  constructor(spec: string) {
    super(unresolvableThetaLibPathMessage(spec));
    this.name = "UnresolvableThetaLibPathError";
  }
}

/**
 * Import-path resolution seam (imports.md §"Resolver interface"). theta 1.0.0
 * ships exactly one implementation (`RelativeThetaLibResolver`); the seam is what
 * lets the deferred package-style / project-rooted extensions land by
 * registering additional implementations rather than rewriting import sites.
 */
export interface Resolver {
  /** Resolve `spec` against `fromFile`'s directory; throw to signal unresolvable (IMP-1). */
  resolve(spec: string, fromFile: string): string;
}

/**
 * A byte-for-byte directory probe the relative resolver enumerates to satisfy
 * the byte-exact final-segment match rule (IMP-1). Enumerating the resolved
 * parent directory once is what lets the resolver reject a case-variant entry
 * (`Personas.thetalib` for a `personas.thetalib` literal) on a case-insensitive host,
 * which a single `exists` / `readText` could not.
 */
export interface ThetaLibDirectoryProbe {
  /** Entry names in `dir`, byte-for-byte as `FileSystem.readdir` returns them; throws if `dir` is unreadable. */
  entries(dir: string): readonly string[];
  /** Whether the byte-exact entry `dir`/`name` is readable (`EACCES` / `EPERM` / broken symlink → `false`). */
  entryReadable(dir: string, name: string): boolean;
  /**
   * The canonical (`realpath`, forward-slash) form of `resolvedPath`, precached
   * exactly like {@link entries}. The resolver's `posix.join` string is a
   * FILE-SYSTEM SPELLING, not a file identity — on a case-insensitive host two
   * spellings of one physical file join to two different strings. The probe
   * supplies the on-disk-cased identity it precached (the sync counterpart of
   * `canonicalizePath`), so `resolve`'s return is the identity every
   * downstream key (declaring-enum tag, re-export collision site, cycle node,
   * parse cache) compares under.
   */
  canonicalize(resolvedPath: string): string;
}

/**
 * The single theta 1.0.0 `Resolver`: a relative-path resolver that joins `spec`
 * against the directory of `fromFile` and requires the `.thetalib` extension.
 * Non-relative specs (`@scope/pkg`, `/theta/...`), a missing byte-exact
 * final-segment directory entry, and a byte-exact-but-unreadable entry are all
 * unresolvable and throw `UnresolvableThetaLibPathError` (IMP-1).
 */
export class RelativeThetaLibResolver implements Resolver {
  constructor(private readonly probe: ThetaLibDirectoryProbe) {}

  resolve(spec: string, fromFile: string): string {
    // Only relative `./` / `../` specs are in scope for theta 1.0; a
    // package-style (`@scope/pkg`) or project-rooted (`/theta/...`) spec is
    // unresolvable and signalled by throwing (IMP-1).
    if (!spec.startsWith("./") && !spec.startsWith("../")) {
      throw new UnresolvableThetaLibPathError(spec);
    }
    // The relative resolver requires the `.thetalib` extension (byte-exact
    // lowercase); a non-`.thetalib` spec is unresolvable through this resolver.
    if (!spec.endsWith(".thetalib")) {
      throw new UnresolvableThetaLibPathError(spec);
    }

    // Join the spec against the importing file's directory, then match the
    // final segment byte-for-byte against the resolved parent directory's
    // entries — enumerating once via the probe rather than a single
    // `exists`/`readText`, so a case-variant entry (`Personas.thetalib` for a
    // `personas.thetalib` literal) rejects on a case-insensitive host (IMP-1).
    const resolved = posix.join(posix.dirname(fromFile), spec);
    const parent = posix.dirname(resolved);
    const finalSegment = posix.basename(resolved);

    // `entries` throws (unreadable parent directory) → unresolvable, and the
    // throw is the resolution-failure signal, so it propagates unchanged.
    const names = this.probe.entries(parent);
    if (!names.includes(finalSegment)) {
      throw new UnresolvableThetaLibPathError(spec);
    }
    if (!this.probe.entryReadable(parent, finalSegment)) {
      throw new UnresolvableThetaLibPathError(spec);
    }
    // Canonicalise once at the resolver boundary (bug 0361): IMP-1's
    // byte-exact FINAL-segment match already ran above, so a case-variant
    // final segment is still rejected — this only folds a case-variant
    // DIRECTORY segment (`../LIBS/` for on-disk `libs/`) to the on-disk
    // spelling, so every downstream key compares under one identity. Identity
    // on a case-sensitive host (`realpath.native` preserves byte identity).
    return this.probe.canonicalize(resolved);
  }
}

/** The outcome of running an `import` spec through the load pipeline (IMP-1). */
export interface ThetaLibImportLoad {
  /** The resolved `.thetalib` path — present only when resolution succeeded. */
  readonly resolvedPath?: string;
  /** Whether the importing file is registered (a resolution failure does not register it). */
  readonly registered: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Run an `import` spec through the load pipeline (IMP-1): call
 * `resolver.resolve` and, on an `UnresolvableThetaLibPathError` throw, emit
 * `theta/load/unresolvable-thetalib-path` against the importing file and do NOT
 * register it; on success, register the file and carry the resolved path.
 */
export function loadThetaLibImport(
  resolver: Resolver,
  spec: string,
  fromFile: string,
  site: ImportSite,
): ThetaLibImportLoad {
  let resolvedPath: string;
  try {
    resolvedPath = resolver.resolve(spec, fromFile);
  } catch (resolveError: unknown) { // allow-broad-catch: theta/load/unresolvable-thetalib-path — spec_topics/imports.md (IMP-1: the load pipeline treats *any* throw from `resolve` as a resolution failure)
    // IMP-1 mandates treating a throw from `resolve` as a resolution failure —
    // any throw, not only `UnresolvableThetaLibPathError` — so this does not
    // rethrow. The diagnostic renders the spec path as written (`<path>`), not
    // the thrown error's message.
    void resolveError;
    return {
      registered: false,
      diagnostics: [
        {
          severity: "error",
          code: UNRESOLVABLE_THETALIB_PATH_CODE,
          file: site.file,
          range: site.range,
          message: unresolvableThetaLibPathMessage(spec),
          hint: UNRESOLVABLE_THETALIB_PATH_HINT,
        },
      ],
    };
  }
  return { resolvedPath, registered: true, diagnostics: [] };
}
