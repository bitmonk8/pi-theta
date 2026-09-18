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

/** A corpus file's bytes, read off the live tree so no cell asserts a snapshot. */
export function corpus(rel: string): string {
  const text = readFileSync(repoFile(rel), "utf8");
  if (text.trim().length === 0) {
    throw new Error(
      `harness: ${rel} read empty, so the section this cell scopes to does not exist — a loud failure, never a vacuous pass`,
    );
  }
  return text;
}

/**
 * The body of a `##`-headed section, heading line included, up to the next
 * `## ` heading. Region-scoped so no cell below can be satisfied by the
 * required token appearing in unrelated prose elsewhere on the page.
 */
export function section(text: string, heading: string, rel: string, region: string): string {
  const start = text.indexOf(`\n${heading}\n`);
  if (start < 0) {
    throw new Error(
      `harness: ${rel} carries no heading ${JSON.stringify(heading)}, so the ${region} region this cell scopes to does not exist`,
    );
  }
  const rest = text.slice(start + 1 + heading.length);
  const end = rest.indexOf("\n## ");
  return heading + (end < 0 ? rest : rest.slice(0, end));
}

/** Whitespace-collapsed, lowercased text — wording and wrapping are the editor's. */
export function flat(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}
