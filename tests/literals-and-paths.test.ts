import { describe, expect, it } from "vitest";
import { lexTheta, type LexResult, type Token } from "../src/lexer/lexer";
import {
  checkIntegerNarrowing,
  validatePathLiteral,
} from "../src/lexer/literals";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";
import {
  type SystemNoteChannelDeps,
  type SystemNoteDetails,
  type SystemNoteSender,
} from "../src/extension/system-note-channel";

// V1b-T — failing tests for the paired `V1b` "string, number, and path
// literals" implementation.
//
// Spec: lexical.md §"String literals" (the escape table + `\u{...}` scalar
// decode and out-of-range/surrogate rejection), §"Number literals" (the
// integer/number typing, the safe-integer / finite-double range checks, and the
// reserved hex/octal/binary/underscore forms), §"Path literals" and
// §"Extension matching" (forward-slash-only separators and the byte-exact
// lowercase `.theta`/`.thetalib` final segment), and grammar.md.
//
// The string and number behaviours are lexer-surfaced, so they are asserted
// through `lexTheta` and the V7d producer-facing diagnostic-emission seam (a
// recording channel double captures the batched `theta-system-note`
// `details.diagnostics`, never a direct out-of-band `pi.sendMessage`). The path
// and narrowing rules need a parse / type context the tokeniser does not have,
// so they are asserted against the standalone `validatePathLiteral` /
// `checkIntegerNarrowing` seams (src/lexer/literals.ts).
//
// Diagnostic *Message* strings are sourced from the diagnostics registry
// (code-registry-parse.md) per the *Diagnostic message anchors* rule.
//
// These tests red because the V1b escape-decoder / number-range checks /
// path-literal validator / narrowing check are absent: `lexTheta` does not yet
// decode `Token.value`, classify `Token.numericType`, or raise the numeric
// codes, and the two literals.ts seams are inert stubs. Each test reds on its
// own primary assertion (a missing decoded value, a missing numeric type, or an
// absent diagnostic), not on a compile error, missing fixture, or harness throw.

// --- recording channel double (V7d seam) ---------------------------------

interface SeamFixture {
  readonly deps: SystemNoteChannelDeps;
  readonly delivered: Diagnostic[][];
}

function seam(): SeamFixture {
  const delivered: Diagnostic[][] = [];
  const pi: SystemNoteSender = {
    sendMessage: (message): void => {
      const details: SystemNoteDetails = message.details!;
      if ("diagnostics" in details) {
        delivered.push([...details.diagnostics]);
      }
    },
  };
  const deps: SystemNoteChannelDeps = {
    pi,
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  return { deps, delivered };
}

/** Lex a UTF-8 string source; return the lex result and the seam fixture. */
function lex(src: string): { result: LexResult; fixture: SeamFixture } {
  const fixture = seam();
  const result = lexTheta(
    { path: "test.theta", bytes: new TextEncoder().encode(src) },
    fixture.deps,
  );
  return { result, fixture };
}

/** Every diagnostic the lexer delivered through the V7d seam, flattened. */
function deliveredDiagnostics(fixture: SeamFixture): Diagnostic[] {
  return fixture.delivered.flat();
}

/** The first delivered diagnostic carrying `code`, if any. */
function deliveredCode(fixture: SeamFixture, code: string): Diagnostic | undefined {
  return deliveredDiagnostics(fixture).find((d) => d.code === code);
}

/** The first `string`-kind token in a lexed stream, if any. */
function firstString(tokens: readonly Token[]): Token | undefined {
  return tokens.find((t) => t.kind === "string");
}

/** A throwaway 1:1–1:2 span for the parse-context seam calls. */
function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

// --- §"String literals" — escape table + \u{...} decode (LEX, cka-1) ------

describe("V1b-T — string escape decoding (LEX code-keyed area)", () => {
  it('lexical.md §"String literals": a recognised \\u{...} escape decodes to the correct Unicode scalar value', () => {
    // U+1F600 GRINNING FACE — a recognised \u{...} escape decodes to that scalar.
    const { result } = lex('"\\u{1F600}"');
    const tok = firstString(result.tokens);
    expect(tok, "a string token is lexed").toBeDefined();
    expect(tok?.value).toBe("\u{1F600}");
  });

  it('lexical.md §"String literals": the simple escape table (\\n, \\t, \\", \\\\) decodes to its characters', () => {
    const { result } = lex('"a\\nb\\t\\"\\\\"');
    const tok = firstString(result.tokens);
    expect(tok, "a string token is lexed").toBeDefined();
    // Decoded value: a, newline, b, tab, double-quote, backslash.
    expect(tok?.value).toBe('a\nb\t"\\');
  });
});

// --- §"String literals" — theta/parse/illegal-escape ----------------------

describe("V1b-T — illegal escape sequences", () => {
  it("theta/parse/illegal-escape: a backslash followed by an unrecognised character fires (via V7d seam)", () => {
    // \x is not in the escape table (\\\", \\', \\\\, \\n, \\t, \\r, \\u{...}).
    const { fixture } = lex('"bad\\xescape"');
    const d = deliveredCode(fixture, "theta/parse/illegal-escape");
    expect(d, "theta/parse/illegal-escape").toBeDefined();
    // Message template `illegal escape sequence: \\<char>` from code-registry-parse.md.
    expect(d?.message).toBe("illegal escape sequence: \\x");
  });
});

// --- §"String literals" — theta/parse/invalid-unicode-escape --------------

describe("V1b-T — invalid Unicode escapes", () => {
  it("theta/parse/invalid-unicode-escape: a \\u{...} value above U+10FFFF fires (via V7d seam)", () => {
    const { fixture } = lex('"\\u{110000}"');
    const d = deliveredCode(fixture, "theta/parse/invalid-unicode-escape");
    expect(d, "theta/parse/invalid-unicode-escape (out of range)").toBeDefined();
    expect(d?.message).toBe(
      "invalid Unicode escape: value is not a Unicode scalar value",
    );
  });

  it("theta/parse/invalid-unicode-escape: a \\u{...} value naming a UTF-16 surrogate fires (via V7d seam)", () => {
    // U+D800 is the low end of the surrogate range D800–DFFF.
    const { fixture } = lex('"\\u{D800}"');
    const d = deliveredCode(fixture, "theta/parse/invalid-unicode-escape");
    expect(d, "theta/parse/invalid-unicode-escape (surrogate)").toBeDefined();
    expect(d?.message).toBe(
      "invalid Unicode escape: value is not a Unicode scalar value",
    );
  });
});

// --- §"Number literals" — range / type violations ------------------------

describe("V1b-T — numeric range and type violations", () => {
  it("theta/parse/integer-literal-out-of-range: an integer literal above 2^53-1 fires (via V7d seam)", () => {
    // 12345678901234567890 > 2^53 - 1 (9007199254740991), judged per-token.
    const { fixture } = lex("12345678901234567890");
    const d = deliveredCode(fixture, "theta/parse/integer-literal-out-of-range");
    expect(d, "theta/parse/integer-literal-out-of-range").toBeDefined();
    expect(d?.message).toBe("integer literal exceeds the safe-integer range");
  });

  it("theta/parse/number-literal-not-finite: a number literal parsing to Infinity fires (via V7d seam)", () => {
    // 1e400 overflows IEEE-754 double to Infinity.
    const { fixture } = lex("1e400");
    const d = deliveredCode(fixture, "theta/parse/number-literal-not-finite");
    expect(d, "theta/parse/number-literal-not-finite").toBeDefined();
    expect(d?.message).toBe("number literal is not a finite IEEE-754 double");
  });

  it('lexical.md §"Number literals": a fractional/exponent literal is typed number, an integer literal is typed integer', () => {
    const frac = firstNumber(lex("3.14").result.tokens);
    expect(frac, "a number token is lexed").toBeDefined();
    expect(frac?.numericType).toBe("number");

    const int = firstNumber(lex("42").result.tokens);
    expect(int, "a number token is lexed").toBeDefined();
    expect(int?.numericType).toBe("integer");
  });

  it("theta/parse/integer-narrowing: a number value reaching an integer position fires; integer→number widening does not", () => {
    // number used where integer is expected — the reverse of the one-way
    // integer→number widening (lexical.md §"Number literals").
    const narrow = checkIntegerNarrowing("number", "integer", {
      file: "test.theta",
      range: span(),
    });
    expect(narrow, "theta/parse/integer-narrowing").toBeDefined();
    expect(narrow?.code).toBe("theta/parse/integer-narrowing");
    expect(narrow?.message).toBe("cannot narrow number to integer");

    // integer widens implicitly to number — no diagnostic.
    const widen = checkIntegerNarrowing("integer", "number", {
      file: "test.theta",
      range: span(),
    });
    expect(widen, "integer→number widening is permitted").toBeUndefined();
  });
});

// --- §"Number literals" — reserved hex/octal/binary/underscore forms ------

describe("V1b-T — reserved numeric forms (theta/parse/unsupported-feature)", () => {
  const reserved: ReadonlyArray<readonly [string, string]> = [
    ["hexadecimal", "0xFF"],
    ["octal", "0o17"],
    ["binary", "0b101"],
    ["underscore separator", "1_000"],
  ];
  for (const [label, src] of reserved) {
    it(`theta/parse/unsupported-feature: a ${label} numeric form (${src}) fires (via V7d seam)`, () => {
      const { fixture } = lex(src);
      const d = deliveredCode(fixture, "theta/parse/unsupported-feature");
      expect(d, `theta/parse/unsupported-feature for ${src}`).toBeDefined();
    });
  }
});

// --- §"Path literals" / §"Extension matching" ----------------------------

describe("V1b-T — path-literal validation", () => {
  it("theta/parse/invalid-path-separator: a backslash path separator fires at the offending span", () => {
    const diags = validatePathLiteral(
      { value: "lib\\mod.theta", range: span() },
      "invoke",
      "test.theta",
    );
    const d = diags.find((x) => x.code === "theta/parse/invalid-path-separator");
    expect(d, "theta/parse/invalid-path-separator").toBeDefined();
    expect(d?.message).toBe(
      "invalid path separator: backslash in path literal",
    );
    expect(d?.range, "the diagnostic is located at the offending span").toBeDefined();
  });

  it("theta/parse/invoke-non-theta-extension: a .THETA invoke path is rejected byte-exact (cross-OS)", () => {
    // .THETA is not byte-exact lowercase .theta, so it is rejected identically on
    // case-sensitive and case-insensitive hosts (lexical.md §"Extension matching").
    const diags = validatePathLiteral(
      { value: "./mod.THETA", range: span() },
      "invoke",
      "test.theta",
    );
    const d = diags.find(
      (x) => x.code === "theta/parse/invoke-non-theta-extension",
    );
    expect(d, "theta/parse/invoke-non-theta-extension").toBeDefined();
    expect(d?.message).toBe("invoke path './mod.THETA' does not end in .theta");
  });
});

/** The first `number`-kind token in a lexed stream, if any. */
function firstNumber(tokens: readonly Token[]): Token | undefined {
  return tokens.find((t) => t.kind === "number");
}
