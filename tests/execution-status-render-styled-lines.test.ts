// RFC 0015 (docs/rfcs/0015-theta-run-card.md §"Syntax highlighting", D4) —
// `tests/execution-status-render-styled-lines.test.ts` (T-RSTYLE). The
// lexer-token → styled-line mapper and its caller-owned per-file cache:
// spike Q3's gap-recovery mechanics (comments are gaps; comment-only lines
// emit zero tokens; stmt-sep spans lines and claims nothing; trailing
// comments are the unclaimed tail), the every-character-claimed-exactly-once
// partition invariant, newline/BOM normalization alignment, tabs, template
// prose, and the lex-once cache contract (spike Deviation 4).

import { describe, expect, it } from "vitest";
import type { Token } from "../src/lexer/lexer";
import {
  computeStyledLines,
  createStyledLineCache,
  styledLinesFor,
  type StyledLine,
  type SyntaxRole,
} from "../src/extension/execution-status/render/styled-lines";

const encoder = new TextEncoder();

function sourceOf(text: string, path = "card.theta"): { path: string; bytes: Uint8Array } {
  return { path, bytes: encoder.encode(text) };
}

function styled(text: string): readonly StyledLine[] {
  return styledLinesFor(createStyledLineCache(), sourceOf(text));
}

function lineText(line: StyledLine): string {
  return line.spans.map((s) => s.text).join("");
}

function roles(line: StyledLine): ReadonlyArray<[SyntaxRole, string]> {
  return line.spans.map((s) => [s.role, s.text]);
}

/** The spike's Q3 probe source, verbatim. */
const SPIKE_SOURCE =
  "// leading line comment\n" +
  "let x = 1 // trailing comment\n" +
  "/// doc-style comment\n" +
  "let y = x + 2\n";

describe("gap recovery (spike Q3)", () => {
  it("styles a plain statement line as alternating code and trivia spans", () => {
    const lines = styled("let x = 1\n");
    expect(roles(lines[0] as StyledLine)).toEqual([
      ["keyword", "let"],
      ["trivia", " "],
      ["ident", "x"],
      ["trivia", " "],
      ["punct", "="],
      ["trivia", " "],
      ["number", "1"],
    ]);
  });

  it("recovers a trailing comment as the line's unclaimed tail", () => {
    const lines = styled(SPIKE_SOURCE);
    const line2 = roles(lines[1] as StyledLine);
    expect(line2[line2.length - 1]).toEqual(["trivia", " // trailing comment"]);
    // The code prefix is still token-accurate.
    expect(line2[0]).toEqual(["keyword", "let"]);
    expect(line2[6]).toEqual(["number", "1"]);
  });

  it("styles comment-only lines (zero tokens) as one whole-line trivia span", () => {
    const lines = styled(SPIKE_SOURCE);
    expect(roles(lines[0] as StyledLine)).toEqual([["trivia", "// leading line comment"]]);
    expect(roles(lines[2] as StyledLine)).toEqual([["trivia", "/// doc-style comment"]]);
  });

  it("stmt-sep tokens (which can span line boundaries) claim nothing visible", () => {
    const lines = styled(SPIKE_SOURCE);
    // No span anywhere carries a "\n" — the newline is structure, not text.
    for (const line of lines) {
      for (const span of line.spans) {
        expect(span.text).not.toContain("\n");
      }
    }
    expect(roles(lines[3] as StyledLine)).toEqual([
      ["keyword", "let"],
      ["trivia", " "],
      ["ident", "y"],
      ["trivia", " "],
      ["punct", "="],
      ["trivia", " "],
      ["ident", "x"],
      ["trivia", " "],
      ["punct", "+"],
      ["trivia", " "],
      ["number", "2"],
    ]);
  });

  it("a comment-only source (zero tokens overall) degrades to all-trivia", () => {
    const lines = styled("// one\n// two\n");
    expect(roles(lines[0] as StyledLine)).toEqual([["trivia", "// one"]]);
    expect(roles(lines[1] as StyledLine)).toEqual([["trivia", "// two"]]);
  });

  it("blank lines and an empty source produce empty span arrays", () => {
    const lines = styled("let x = 1\n\nlet y = 2");
    expect((lines[1] as StyledLine).spans).toEqual([]);
    expect(styled("")[0]?.spans).toEqual([]);
  });
});

describe("partition invariant — every character claimed exactly once", () => {
  // A corpus spanning the awkward shapes: comments, tabs, strings with
  // escapes, template prose across lines, continuations (swallowed
  // newlines), and mixed indentation.
  const CORPUS =
    "// header comment\n" +
    "let s = \"a\\tb \\u{1F600} 'q'\" // str\n" +
    "\tlet tabbed\t= 42\n" +
    "let q = @`\n" +
    "prose // not a comment /* nor block */\n" +
    "${s} tail prose\n" +
    "`\n" +
    "let sum = 1 +\n" +
    "  2\n" +
    "/// doc\n";

  it("concatenating spans reconstructs every normalized line verbatim", () => {
    const lines = styled(CORPUS);
    const expected = CORPUS.split("\n");
    expect(lines).toHaveLength(expected.length);
    lines.forEach((line, i) => {
      expect(lineText(line)).toBe(expected[i]);
    });
  });

  it("spans are non-empty and roles alternate out of trivia correctly", () => {
    for (const line of styled(CORPUS)) {
      for (const span of line.spans) {
        expect(span.text.length).toBeGreaterThan(0);
      }
      // No two ADJACENT trivia spans: gaps coalesce into one span.
      for (let i = 1; i < line.spans.length; i++) {
        if (line.spans[i]?.role === "trivia") {
          expect(line.spans[i - 1]?.role).not.toBe("trivia");
        }
      }
    }
  });

  it("string tokens keep the verbatim source slice, escapes unexpanded", () => {
    const lines = styled(CORPUS);
    const stringSpan = (lines[1] as StyledLine).spans.find((s) => s.role === "string");
    expect(stringSpan?.text).toBe("\"a\\tb \\u{1F600} 'q'\"");
  });

  it("tabs are ordinary single-column characters (claims still align)", () => {
    const lines = styled(CORPUS);
    expect(roles(lines[2] as StyledLine)).toEqual([
      ["trivia", "\t"],
      ["keyword", "let"],
      ["trivia", " "],
      ["ident", "tabbed"],
      ["trivia", "\t"],
      ["punct", "="],
      ["trivia", " "],
      ["number", "42"],
    ]);
  });

  it("template prose lines are trivia; delimiters and ${…} stay code", () => {
    const lines = styled(CORPUS);
    // Interior prose line: zero tokens, one trivia span (incl. the fake
    // comment markers, which are NOT comments inside template prose).
    expect(roles(lines[4] as StyledLine)).toEqual([
      ["trivia", "prose // not a comment /* nor block */"],
    ]);
    // Interpolation line: `${`, the ident, `}` are code; the tail is prose.
    expect(roles(lines[5] as StyledLine)).toEqual([
      ["punct", "$"],
      ["punct", "{"],
      ["ident", "s"],
      ["punct", "}"],
      ["trivia", " tail prose"],
    ]);
    // Closing backtick line.
    expect(roles(lines[6] as StyledLine)).toEqual([["punct", "`"]]);
  });

  it("a continuation's swallowed newline leaves both lines correctly claimed", () => {
    const lines = styled(CORPUS);
    expect(roles(lines[7] as StyledLine).at(-1)).toEqual(["punct", "+"]);
    expect(roles(lines[8] as StyledLine)).toEqual([
      ["trivia", "  "],
      ["number", "2"],
    ]);
  });
});

describe("normalization alignment (the lexer's own normalized text)", () => {
  it("CRLF sources style the LF-normalized lines with no stray \\r", () => {
    const lines = styledLinesFor(
      createStyledLineCache(),
      sourceOf("let x = 1\r\nlet y = 2\r\n"),
    );
    expect(lineText(lines[0] as StyledLine)).toBe("let x = 1");
    expect(lineText(lines[1] as StyledLine)).toBe("let y = 2");
    for (const line of lines) {
      expect(lineText(line)).not.toContain("\r");
    }
  });

  it("a leading BOM is skipped exactly as the lexer skips it", () => {
    const lines = styledLinesFor(
      createStyledLineCache(),
      sourceOf("\uFEFFlet x = 1\n"),
    );
    // Columns align: the first token claims from column 1 of the BOM-less text.
    expect(roles(lines[0] as StyledLine)[0]).toEqual(["keyword", "let"]);
    expect(lineText(lines[0] as StyledLine)).toBe("let x = 1");
  });
});

describe("per-file cache (spike Deviation 4 — caller-owned, lex once)", () => {
  it("returns the identical array on a second call for the same path", () => {
    const cache = createStyledLineCache();
    const first = styledLinesFor(cache, sourceOf("let x = 1\n"));
    const second = styledLinesFor(cache, sourceOf("let x = 1\n"));
    expect(second).toBe(first);
  });

  it("ignores changed bytes for a cached path (source immutable for the run)", () => {
    const cache = createStyledLineCache();
    const first = styledLinesFor(cache, sourceOf("let x = 1\n"));
    const second = styledLinesFor(cache, sourceOf("let CHANGED = 2\n"));
    expect(second).toBe(first);
    expect(lineText((second as readonly StyledLine[])[0] as StyledLine)).toBe("let x = 1");
  });

  it("keys per file: a second path lexes independently into the same cache", () => {
    const cache = createStyledLineCache();
    styledLinesFor(cache, sourceOf("let x = 1\n", "a.theta"));
    const other = styledLinesFor(cache, sourceOf("let y = 2\n", "b.thetalib"));
    expect(cache.size).toBe(2);
    expect(lineText(other[0] as StyledLine)).toBe("let y = 2");
  });

  it("the cache is caller-owned: clearing it forces a fresh lex", () => {
    const cache = createStyledLineCache();
    const first = styledLinesFor(cache, sourceOf("let x = 1\n"));
    cache.clear();
    const second = styledLinesFor(cache, sourceOf("let x = 1\n"));
    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });
});

describe("defensive shapes", () => {
  it("throws on overlapping token claims (lexer never emits them)", () => {
    const overlapping: Token[] = [
      {
        kind: "keyword",
        text: "let",
        range: { start: { line: 1, column: 1 }, end: { line: 1, column: 4 } },
      },
      {
        kind: "ident",
        text: "e",
        range: { start: { line: 1, column: 2 }, end: { line: 1, column: 3 } },
      },
    ];
    expect(() => computeStyledLines("let", overlapping)).toThrow(
      /overlapping token ranges/,
    );
  });

  it("a source that fails to lex (zero tokens) degrades to all-trivia lines", () => {
    // A block comment aborts the scan after its diagnostic; the mapper must
    // still return renderable lines rather than refuse the card.
    const lines = styled("/* block */\nlet x = 1\n");
    expect(roles(lines[0] as StyledLine)).toEqual([["trivia", "/* block */"]]);
    expect(lineText(lines[1] as StyledLine)).toBe("let x = 1");
  });
});
