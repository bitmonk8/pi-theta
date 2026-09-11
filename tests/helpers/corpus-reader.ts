// A shared "read a committed corpus file, fail loud on absence" harness for the
// spec-surface oracle test files (`b0117`, `b0265`, and further siblings that
// mirror the same pattern forward — see each file's own comments).
//
// WHY THIS FILE EXISTS. `repoFile` / `readCorpus` / `linesOf` were redefined,
// byte-for-byte apart from the bug number named inside the thrown message, in
// several `b02xx`/`b04xx` spec-gate test files (PTQ-0208). The read is
// deliberately loud rather than skip-on-absence: the corpus file IS the
// oracle's only source, so a missing or empty read must fail the harness
// rather than let a cell pass vacuously.
//
// TIER: unit, offline, deterministic, provider-free — the same tier as every
// file that imports this module.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** A repo-relative path (e.g. `docs/spec_topics/foo.md`), resolved to an absolute path. */
export const repoFile = (rel: string): string =>
  fileURLToPath(new URL(`../../${rel}`, import.meta.url));

/**
 * Read a corpus file. A missing or empty file is a HARNESS failure that names
 * the unmet precondition and throws — never a skip, never an early return —
 * because the file is the calling oracle's only source and a degraded read
 * would report success while verifying nothing. `owner` names, in the calling
 * file's own words, why this corpus file is that oracle's sole source.
 */
export function readCorpus(rel: string, owner: string): string {
  let text: string;
  try {
    text = readFileSync(repoFile(rel), "utf8");
  } catch (cause) {
    throw new Error(
      `harness precondition unmet: ${rel} is unreadable, and it is ${owner} — a missing corpus file is a loud failure, never a skip (${String(cause)})`,
    );
  }
  if (text.trim() === "") {
    throw new Error(`harness precondition unmet: ${rel} is empty; nothing to score`);
  }
  return text;
}

/** Split a corpus file's text into its lines, tolerant of either line ending. */
export const linesOf = (text: string): readonly string[] => text.split(/\r?\n/);
