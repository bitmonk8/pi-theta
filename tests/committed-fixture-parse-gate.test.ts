// H7b — Committed `.theta` / `.thetalib` fixture parse gate (horizontal
// infrastructure gate).
//
// Convention: AGENTS.md §"No silent skipping" (committed-corpus gate), and the
// H7a integration-acceptance fixture obligation. Closes no spec REQ-ID.
//
// This gate closes the coverage gap the H6a manual real-host smoke surfaced
// (notes.md 2026-07-02): the H7a in-process double models the composed pipeline
// but never lexes/parses the committed fixture text, so an invalid fixture (the
// original `acceptance.theta` used `#` comments, which theta does not recognise —
// theta comments are `//` / `///`) shipped green until it was driven against a
// real host. Here every `.theta` and `.thetalib` the git index tracks is run
// through the real lexer/parser (`lexTheta` -> `parseThetaDocument`) and MUST
// yield zero load/parse diagnostics. A seeded-invalid `.theta` fixture and a
// runtime-materialised invalid `.thetalib` each confirm the gate reddens on a
// malformed file.

import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { lexTheta, type ThetaSource } from "../src/lexer/lexer";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
} from "../src/parser/theta-document";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type {
  SystemNoteChannelDeps,
  SystemNoteSender,
} from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";

// Derived from this module's own file location, not the process cwd: the
// corpus this gate scores must be a function of the commit, not of wherever
// the test runner happens to be launched from. Ambient reads are otherwise
// unrestricted in test code (the ambient-primitive ban is scoped to
// `src/**`).
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

/** The seeded-invalid fixture, excluded from the shipped set by its directory. */
const SEEDED_INVALID = "tests/fixtures/h7b-invalid/malformed.theta";

// The seeded-invalid fixture's sole file is intentionally malformed and is
// asserted separately below, never in the shipped set. A directory prefix,
// not the single filename, so a second fixture seeded in the same directory
// does not silently join the corpus.
const SEEDED_INVALID_DIR = "tests/fixtures/h7b-invalid/";

/**
 * The committed corpus this gate scores, per extension: `git ls-files
 * '*.theta' '*.thetalib'`, less the seeded-invalid directory
 * (`SEEDED_INVALID_DIR`). An exact count is what makes a shrunken corpus fail
 * loudly naming the unmet precondition (`AGENTS.md:60`) rather than passing
 * over fewer files.
 */
const EXPECTED_SHIPPED_THETA = 31;
const EXPECTED_SHIPPED_THETALIB = 2;

/**
 * Every committed theta source the repository ships, as repo-relative
 * POSIX-separated paths, the seeded-invalid directory excluded.
 *
 * The corpus is the git index, not the working tree: a committed fixture is
 * exactly what a fresh clone contains, so an untracked scratch `.theta` and a
 * gitignored `.pi/theta/*.theta` are both never members. `git ls-files`
 * already emits repo-relative POSIX paths, so no separator remapping is
 * needed. `-z` NUL-separates the output so a path byte containing a newline
 * cannot split into two corpus entries.
 */
function discoverShippedFixtures(): string[] {
  const result = spawnSync(
    "git",
    ["ls-files", "-z", "--", "*.theta", "*.thetalib"],
    { cwd: REPO_ROOT, encoding: "utf8" },
  );
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      "H7b's corpus is the git index (`git ls-files '*.theta' '*.thetalib'`), " +
        "not the working tree: the unmet precondition is a working `git` " +
        "executable plus a repository checkout at the test root. " +
        `status=${String(result.status)} ` +
        `error=${result.error?.message ?? "none"} ` +
        `stderr=${result.stderr}`,
    );
  }
  return result.stdout
    .split("\0")
    .filter((p) => p.length > 0)
    .filter((p) => !p.startsWith(SEEDED_INVALID_DIR))
    .sort();
}

/** Trivially-resolving seam doubles — no `pi.sendMessage`, no model lookup. */
function makeDeps(): ParseThetaDocumentDeps {
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
 * Run one theta source's bytes through the real lexer then the real whole-file
 * parser and return the union of load/parse diagnostics both surface. `path`
 * carries the source's real extension because the parser keys its `.thetalib`
 * dispatch off that string (`src/parser/theta-document.ts:911`).
 */
function loadParseDiagnosticsOf(path: string, bytes: Uint8Array): Diagnostic[] {
  const source: ThetaSource = { path, bytes };
  const deps = makeDeps();
  const lex = lexTheta(source, deps.systemNote);
  const doc = parseThetaDocument(source, deps);
  return [...lex.diagnostics, ...doc.diagnostics].filter(
    (d) =>
      d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/"),
  );
}

/**
 * Read a committed theta source of either extension by its repo-relative path, then
 * run it through the real lexer and the real whole-file parser, returning the union
 * of load/parse diagnostics both surface.
 */
function loadParseDiagnostics(relPath: string): Diagnostic[] {
  const bytes = new Uint8Array(readFileSync(join(REPO_ROOT, relPath)));
  return loadParseDiagnosticsOf(relPath, bytes);
}

const shippedFixtures = discoverShippedFixtures();

describe("H7b: committed theta sources parse with zero load/parse diagnostics", () => {
  // Guard against a vacuous pass: discovery MUST yield exactly the committed
  // corpus of both extensions, so a broken walk cannot silently green the gate.
  it("discovers the committed fixtures the repository ships", () => {
    expect(
      {
        theta: shippedFixtures.filter((p) => p.endsWith(".theta")).length,
        thetalib: shippedFixtures.filter((p) => p.endsWith(".thetalib")).length,
      },
      "the corpus is every committed theta source of BOTH extensions " +
        "(`git ls-files '*.theta' '*.thetalib'`), less the seeded-invalid " +
        "directory. Adding or removing a committed theta source is deliberate: " +
        "bump EXPECTED_SHIPPED_THETA / EXPECTED_SHIPPED_THETALIB in this file " +
        "in the SAME commit that adds or removes the file.",
    ).toEqual({
      theta: EXPECTED_SHIPPED_THETA,
      thetalib: EXPECTED_SHIPPED_THETALIB,
    });
    expect(shippedFixtures).toContain("tests/fixtures/h7a/acceptance.theta");
    expect(shippedFixtures).toContain("docs/examples/personas.thetalib");
    expect(shippedFixtures).toContain(
      "tests/live/acceptance/fixtures/acc-lib.thetalib",
    );
    // The seeded-invalid fixture is never part of the shipped set.
    expect(shippedFixtures).not.toContain(SEEDED_INVALID);
    expect(
      shippedFixtures.filter((p) => p.startsWith(".pi/")),
      "`.gitignore:26` ignores `.pi/`, so a corpus member under it is " +
        "untracked: the gate would then score local working-tree state no " +
        "commit records, and would red on a fresh clone for no fixture defect.",
    ).toEqual([]);
  });

  it.each(shippedFixtures)(
    "%s parses cleanly through lexTheta -> parseThetaDocument",
    (relPath) => {
      const diagnostics = loadParseDiagnostics(relPath);
      expect(diagnostics).toEqual([]);
    },
  );
});

/**
 * A top-level `let` binding, which `docs/spec_topics/imports.md:13` excludes
 * from the five forms a `.thetalib` top level may contain, so the parser owes
 * `theta/parse/thetalib-top-level-statement`
 * (`docs/spec_topics/diagnostics/code-registry-parse.md:113`). It is held as
 * text and materialised under a temporary directory rather than committed
 * beside `SEEDED_INVALID`, because the working-tree census at
 * `tests/params-scalar-nontype-text-refusal.test.ts:1253` requires every
 * committed `.thetalib` to load with zero diagnostics.
 */
const MALFORMED_THETALIB = "let reviewer_count = 3\n";

describe("H7b: the gate reddens on a malformed theta source", () => {
  it("the seeded-invalid fixture yields load/parse diagnostics", () => {
    const diagnostics = loadParseDiagnostics(SEEDED_INVALID);
    // Reproduces the H7a `#`-comment defect: the `#` line lexes the `schema`
    // keyword ahead of a lowercase word -> theta/parse/schema-case-mismatch.
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.map((d) => d.code)).toContain(
      "theta/parse/schema-case-mismatch",
    );
  });

  // The `.thetalib` counterpart of the cell above: an assertion that cannot red
  // is worthless (`AGENTS.md:126`), so the extension the corpus covers gets its
  // own red-proof. The bytes go to disk and back so the proof covers the reader
  // the shipped cells use, not an in-memory shortcut.
  it("a malformed .thetalib yields load/parse diagnostics", () => {
    const dir = mkdtempSync(join(tmpdir(), "theta-bug0132-"));
    try {
      const libPath = join(dir, "malformed.thetalib");
      writeFileSync(libPath, MALFORMED_THETALIB, "utf8");
      const diagnostics = loadParseDiagnosticsOf(
        libPath,
        new Uint8Array(readFileSync(libPath)),
      );
      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics.map((d) => d.code)).toContain(
        "theta/parse/thetalib-top-level-statement",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
