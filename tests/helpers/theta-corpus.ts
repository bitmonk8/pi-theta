// A shared "discover the committed `.theta` / `.thetalib` corpus" reader for
// the many independent per-bug GOV-15 corpus-census sweeps (PTQ-0226).
//
// WHY THIS FILE EXISTS. The same "shell out to `git ls-files -- '*.theta'
// '*.thetalib'`, turn stdout into a trimmed non-empty path list, fail loudly if
// `git` is unavailable or the corpus is empty" sequence was independently
// reauthored across 15+ test files, in two families that differ only
// cosmetically (`execFileSync` + newline-split, and `spawnSync -z` +
// NUL-split). This module centralises that DISCOVERY step only — mirroring
// how `tests/helpers/corpus-reader.ts` centralises the analogous single-file
// doc/spec-corpus read (PTQ-0208) — so each file's own per-bug
// offender-matching / census-count logic over the returned list stays local.
//
// TIER: unit, offline, deterministic (given a stable git index) — the same
// tier as every file that imports this module. The subprocess is a read-only
// `git ls-files` over the working checkout, never a network or provider call.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** The repository root, resolved from this module's own location (never the process cwd). */
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

/**
 * The committed `.theta` / `.thetalib` corpus: every path `git ls-files --
 * '*.theta' '*.thetalib'` lists at the repository root, NUL-delimited (so a
 * path carrying a literal newline cannot split into two entries), trimmed,
 * with empty entries dropped, and sorted for a deterministic read (`git
 * ls-files` already lists in tree order; the sort is a belt, not new
 * behaviour).
 *
 * NO SILENT SKIPPING: an unavailable `git` (or a non-zero exit) makes
 * `execFileSync` throw, deliberately uncaught here, so a caller fails naming
 * the real subprocess error; an EMPTY result throws naming the unmet
 * precondition explicitly. Both are loud harness failures, never a skip — the
 * returned list is a GOV-15 census's only corpus to range over, so silently
 * returning nothing would read as a vacuous pass.
 */
export function committedThetaSources(): readonly string[] {
  const listed = execFileSync("git", ["ls-files", "-z", "--", "*.theta", "*.thetalib"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const files = listed
    .split("\0")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .sort();
  if (files.length === 0) {
    throw new Error(
      "harness: `git ls-files -- '*.theta' '*.thetalib'` listed no file, so the GOV-15 corpus " +
        "census measured nothing — a harness failure, never a skip",
    );
  }
  return files;
}
