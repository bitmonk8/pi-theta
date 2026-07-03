// H7b — Committed `.loom` fixture parse gate (horizontal infrastructure gate).
//
// Convention: conventions.md §"Per-phase TDD ritual" (test-corpus hygiene), and
// the H7a integration-acceptance fixture obligation. Closes no spec REQ-ID.
//
// This gate closes the coverage gap the H6a manual real-host smoke surfaced
// (notes.md 2026-07-02): the H7a in-process double models the composed pipeline
// but never lexes/parses the committed fixture text, so an invalid fixture (the
// original `acceptance.loom` used `#` comments, which loom does not recognise —
// loom comments are `//` / `///`) shipped green until it was driven against a
// real host. Here every committed `.loom` the repository ships is run through
// the real lexer/parser (`lexLoom` -> `parseLoomDocument`) and MUST yield zero
// load/parse diagnostics. A seeded-invalid fixture confirms the gate reddens on
// a malformed `.loom`.

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, posix, sep } from "node:path";
import { lexLoom, type LoomSource } from "../src/lexer/lexer";
import {
  parseLoomDocument,
  type ParseLoomDocumentDeps,
} from "../src/parser/loom-document";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type {
  SystemNoteChannelDeps,
  SystemNoteSender,
} from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";

// The repo root is the vitest cwd; ambient reads are unrestricted in test code
// (the ambient-primitive ban is scoped to `src/**`).
const REPO_ROOT = process.cwd();

// Directories the shipped-fixture walk never descends into: build/vendor trees
// and the seeded-invalid directory (whose sole file is intentionally malformed
// and is asserted separately below, never in the shipped set).
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "coverage",
  "h7b-invalid",
]);

/** The seeded-invalid fixture, excluded from the shipped set by its directory. */
const SEEDED_INVALID = "tests/fixtures/h7b-invalid/malformed.loom";

/** Recursively collect every `.loom` file under `dir`, skipping SKIP_DIRS. */
function walkLoomFiles(dir: string, acc: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walkLoomFiles(join(dir, entry.name), acc);
    } else if (entry.isFile() && entry.name.endsWith(".loom")) {
      acc.push(join(dir, entry.name));
    }
  }
  return acc;
}

/**
 * Every committed `.loom` fixture the repository ships, as repo-relative
 * POSIX-separated paths, the seeded-invalid directory excluded by the walk.
 */
function discoverShippedFixtures(): string[] {
  const abs = walkLoomFiles(REPO_ROOT, []);
  return abs
    .map((p) => p.slice(REPO_ROOT.length + 1).split(sep).join(posix.sep))
    .sort();
}

/** Trivially-resolving seam doubles — no `pi.sendMessage`, no model lookup. */
function makeDeps(): ParseLoomDocumentDeps {
  const pi: SystemNoteSender = { sendMessage: (): void => {} };
  const systemNote: SystemNoteChannelDeps = {
    pi,
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = {
    resolve: (): "resolved" => "resolved",
  };
  return { systemNote, modelMatcher };
}

/**
 * Run a `.loom` file through the real lexer then the real whole-file parser and
 * return the union of load/parse diagnostics both surface.
 */
function loadParseDiagnostics(relPath: string): Diagnostic[] {
  const bytes = new Uint8Array(readFileSync(join(REPO_ROOT, relPath)));
  const source: LoomSource = { path: relPath, bytes };
  const deps = makeDeps();
  const lex = lexLoom(source, deps.systemNote);
  const doc = parseLoomDocument(source, deps);
  return [...lex.diagnostics, ...doc.diagnostics].filter(
    (d) =>
      d.code.startsWith("loom/load/") || d.code.startsWith("loom/parse/"),
  );
}

const shippedFixtures = discoverShippedFixtures();

describe("H7b: committed .loom fixtures parse with zero load/parse diagnostics", () => {
  // Guard against a vacuous pass: the walk MUST find the fixtures the leaf names
  // at minimum, so a broken discovery cannot silently green the gate.
  it("discovers the committed fixtures the repository ships", () => {
    expect(shippedFixtures.length).toBeGreaterThan(0);
    expect(shippedFixtures).toContain("tests/fixtures/h7a/acceptance.loom");
    expect(
      shippedFixtures.some((p) => /^\.pi\/looms\/.*\.loom$/.test(p)),
    ).toBe(true);
    // The seeded-invalid fixture is never part of the shipped set.
    expect(shippedFixtures).not.toContain(SEEDED_INVALID);
  });

  it.each(shippedFixtures)(
    "%s parses cleanly through lexLoom -> parseLoomDocument",
    (relPath) => {
      const diagnostics = loadParseDiagnostics(relPath);
      expect(diagnostics).toEqual([]);
    },
  );
});

describe("H7b: the gate reddens on a malformed committed fixture", () => {
  it("the seeded-invalid fixture yields load/parse diagnostics", () => {
    const diagnostics = loadParseDiagnostics(SEEDED_INVALID);
    // Reproduces the H7a `#`-comment defect: the `#` line lexes the `schema`
    // keyword ahead of a lowercase word -> loom/parse/schema-case-mismatch.
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.map((d) => d.code)).toContain(
      "loom/parse/schema-case-mismatch",
    );
  });
});
