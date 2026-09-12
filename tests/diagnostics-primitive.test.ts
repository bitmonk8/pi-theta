import { describe, expect, it } from "vitest";
import {
  assembleDiagnostics,
  renderDiagnosticBatch,
  renderDiagnosticLine,
  type Diagnostic,
} from "../src/diagnostics/diagnostic";

// V7a-T — failing tests for the diagnostics primitive (paired V7a impl).
//
// These pin two obligations:
//   * DIAG-1 (diagnostics/diagnostic-shape.md#diag-1): every author-visible
//     diagnostic carries a registry code and renders in the serialised
//     content-line format; a location-less code renders without a span.
//   * Multi-error assembly (implementation-notes.md "Static-resolution load
//     pass"): a file with several parse errors plus transitive `.thetalib` import
//     errors assembles into a single `Diagnostic[]` with no fast-fail and no
//     per-error loss, ordered by `(file, line, col)` across the entry `.theta`
//     and >=2 transitively-imported `.thetalib` modules.
//
// Rendered-message strings are sourced from the *Message* column of the
// diagnostics registry per the *Diagnostic message anchors* rule, with the
// diagnostic code cited inline.

describe("V7a-T — diagnostics primitive", () => {
  // DIAG-1 — a located diagnostic carries its registry code and renders in the
  // full `<file>:<line>:<col>: <code>: <message>` content-line format.
  it("DIAG-1: a located diagnostic renders in the content-line format with its registry code", () => {
    // theta/parse/unterminated-string — Message column: "unterminated string literal".
    const diagnostic: Diagnostic = {
      severity: "error",
      code: "theta/parse/unterminated-string",
      file: "entry.theta",
      range: { start: { line: 3, column: 5 }, end: { line: 3, column: 6 } },
      message: "unterminated string literal",
    };

    expect(renderDiagnosticLine(diagnostic)).toBe(
      "entry.theta:3:5: theta/parse/unterminated-string: unterminated string literal",
    );
  });

  // DIAG-1 — the optional hint continuation renders on its own two-space-indented line.
  it("DIAG-1: a hint renders as an indented continuation line under the content line", () => {
    // theta/parse/illegal-escape — Hint absent; use theta/parse/invalid-path-separator,
    // Message "invalid path separator: backslash in path literal", Hint "Use / separators only."
    const diagnostic: Diagnostic = {
      severity: "error",
      code: "theta/parse/invalid-path-separator",
      file: "entry.theta",
      range: { start: { line: 7, column: 12 }, end: { line: 7, column: 13 } },
      message: "invalid path separator: backslash in path literal",
      hint: "Use / separators only.",
    };

    expect(renderDiagnosticLine(diagnostic)).toBe(
      "entry.theta:7:12: theta/parse/invalid-path-separator: invalid path separator: backslash in path literal\n" +
        "  hint: Use / separators only.",
    );
  });

  // DIAG-1 — a related site appends a code-less `<file>:<line>:<col>: <message>` line.
  it("DIAG-1: a related site renders as an indented code-less location line", () => {
    // theta/parse/wire-name-collision — Message "wire name '<name>' collides with another field on schema '<schema>'".
    const diagnostic: Diagnostic = {
      severity: "error",
      code: "theta/parse/wire-name-collision",
      file: "entry.theta",
      range: { start: { line: 4, column: 3 }, end: { line: 4, column: 8 } },
      message: "wire name 'id' collides with another field on schema 'User'",
      related: [
        {
          file: "entry.theta",
          range: { start: { line: 2, column: 3 }, end: { line: 2, column: 8 } },
          message: "first declaration here",
        },
      ],
    };

    expect(renderDiagnosticLine(diagnostic)).toBe(
      "entry.theta:4:3: theta/parse/wire-name-collision: wire name 'id' collides with another field on schema 'User'\n" +
        "  entry.theta:2:3: first declaration here",
    );
  });

  // DIAG-1 — a location-less code renders without a span (drops the leading
  // `<file>:<line>:<col>:` segment entirely).
  it("DIAG-1: a location-less diagnostic renders without a span", () => {
    // theta/load/missing-source — Message column: "discovery source path does not exist: <descriptor>".
    const diagnostic: Diagnostic = {
      severity: "error",
      code: "theta/load/missing-source",
      message: "discovery source path does not exist: pi.theta[0]",
    };

    expect(renderDiagnosticLine(diagnostic)).toBe(
      "theta/load/missing-source: discovery source path does not exist: pi.theta[0]",
    );
  });

  // DIAG-1 — a file-only code (file present, no token span) drops only the
  // `:<line>:<col>` portion.
  it("DIAG-1: a file-only diagnostic renders with file but no span", () => {
    // theta/load/invalid-encoding — file-only category per the located-site classification.
    const diagnostic: Diagnostic = {
      severity: "error",
      code: "theta/load/invalid-encoding",
      file: "broken.theta",
      message: "invalid UTF-8 encoding at byte offset 12",
    };

    expect(renderDiagnosticLine(diagnostic)).toBe(
      "broken.theta: theta/load/invalid-encoding: invalid UTF-8 encoding at byte offset 12",
    );
  });

  // Multi-error assembly — no fast-fail, no per-error loss, ordered by
  // (file, line, col) across an entry `.theta` and >=2 transitive `.thetalib` modules.
  //
  // cka-44 / V7a: the IMPL code-keyed obligation area (implementation-notes.md
  // §Runtime Static-resolution load pass) closes its cross-file (file, line, col)
  // diagnostic aggregation-order facet on V7a; this assertion witnesses that
  // facet against the shipped `assembleDiagnostics` ordering.
  it("Multi-error assembly: aggregates entry .theta + transitive .thetalib errors into one ordered Diagnostic[] with no loss", () => {
    const located = (
      code: string,
      file: string,
      line: number,
      column: number,
      message: string,
    ): Diagnostic => ({
      severity: "error",
      code,
      file,
      range: {
        start: { line, column },
        end: { line, column: column + 1 },
      },
      message,
    });

    // Entry .theta — two parse errors (out of line order within the group).
    const entryGroup: Diagnostic[] = [
      located(
        "theta/parse/binding-case-mismatch",
        "/proj/entry.theta",
        5,
        1,
        "binding name must start with a lowercase letter or _",
      ),
      located(
        "theta/parse/unterminated-string",
        "/proj/entry.theta",
        2,
        9,
        "unterminated string literal",
      ),
    ];

    // First transitively-imported .thetalib module — two errors incl. a transitive
    // import error.
    const libAGroup: Diagnostic[] = [
      located(
        "theta/parse/import-unknown-symbol",
        "/proj/lib_a.thetalib",
        4,
        3,
        "imported symbol 'foo' is not declared or re-exported by '/proj/lib_b.thetalib'",
      ),
      located(
        "theta/parse/thetalib-top-level-statement",
        "/proj/lib_a.thetalib",
        1,
        1,
        "top-level statement not permitted in .thetalib file; move into a fn body",
      ),
    ];

    // Second transitively-imported .thetalib module — one error.
    const libBGroup: Diagnostic[] = [
      located(
        "theta/parse/illegal-escape",
        "/proj/lib_b.thetalib",
        3,
        7,
        "illegal escape sequence: \\q",
      ),
    ];

    // Supply the groups out of file order to prove the assembly sorts by
    // (file, line, col) regardless of input order — and collects every error
    // with no fast-fail on the first failing file.
    const assembled = assembleDiagnostics([libBGroup, entryGroup, libAGroup]);

    // No per-error loss: all five diagnostics across the three files survive.
    expect(assembled).toHaveLength(5);

    // Ordered by (file, line, col): entry.theta < lib_a.thetalib < lib_b.thetalib
    // lexicographically, then ascending line then column within each file.
    expect(assembled.map((d) => [d.file, d.range?.start.line, d.range?.start.column])).toEqual([
      ["/proj/entry.theta", 2, 9],
      ["/proj/entry.theta", 5, 1],
      ["/proj/lib_a.thetalib", 1, 1],
      ["/proj/lib_a.thetalib", 4, 3],
      ["/proj/lib_b.thetalib", 3, 7],
    ]);

    // The codes ride along in the same order (no code dropped or reordered
    // independently of its location).
    expect(assembled.map((d) => d.code)).toEqual([
      "theta/parse/unterminated-string",
      "theta/parse/binding-case-mismatch",
      "theta/parse/thetalib-top-level-statement",
      "theta/parse/import-unknown-symbol",
      "theta/parse/illegal-escape",
    ]);
  });

  // Multi-error assembly — the rendered batch is one content-line block per
  // diagnostic separated by a single blank line, in the assembled order.
  it("Multi-error assembly: renderDiagnosticBatch emits blank-line-separated blocks in order", () => {
    const batch: Diagnostic[] = [
      {
        severity: "error",
        code: "theta/parse/unterminated-string",
        file: "/proj/entry.theta",
        range: { start: { line: 2, column: 9 }, end: { line: 2, column: 10 } },
        message: "unterminated string literal",
      },
      {
        severity: "error",
        code: "theta/parse/illegal-escape",
        file: "/proj/lib_b.thetalib",
        range: { start: { line: 3, column: 7 }, end: { line: 3, column: 8 } },
        message: "illegal escape sequence: \\q",
      },
    ];

    expect(renderDiagnosticBatch(batch)).toBe(
      "/proj/entry.theta:2:9: theta/parse/unterminated-string: unterminated string literal\n" +
        "\n" +
        "/proj/lib_b.thetalib:3:7: theta/parse/illegal-escape: illegal escape sequence: \\q",
    );
  });
});
