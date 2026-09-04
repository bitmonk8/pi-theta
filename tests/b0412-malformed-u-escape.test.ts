import { describe, expect, it } from "vitest";
import { lexSrc, hasCode, findCode } from "./helpers/e2e-s1";
import type { LexResult, Token } from "../src/lexer/lexer";

// Bug 0412 — every MALFORMED `\u` FORM (overlong `>6` digits, empty `\u{}`,
// braceless `\u1234`, unclosed `\u{41`) is folded onto
// `theta/parse/invalid-unicode-escape` with the message "value is not a
// Unicode scalar value". That code's registered Trigger
// (code-registry-parse.md §"A recognised `\u{...}` escape whose value exceeds
// U+10FFFF or lies in the UTF-16 surrogate range") does not cover a malformed
// FORM: there is no in-range value to judge, and for `\u{00000041}` the value
// U+0041 IS a scalar. The settled §Fix (option 1) routes the four malformed
// forms to `theta/parse/illegal-escape` with its already-registered template
// `illegal escape sequence: \u` (char = `u`; no new message wording — DIAG-4),
// stops the residue leak into the token `value`, and fixes the second face:
// the consumed hex digits are appended to `raw`, restoring the token `text`
// verbatim-source-slice contract for well-formed and malformed inputs alike.
//
// These witness the specified end state. Cases 1–5 are RED against the current
// tree (the malformed forms still emit invalid-unicode-escape; the well-formed
// slice still drops its digits). Controls 6–8 are GREEN both directions:
// invalid-unicode-escape stays on its registered value trigger (§Non-goals).

const INVALID_UNICODE = "theta/parse/invalid-unicode-escape";
const ILLEGAL_ESCAPE = "theta/parse/illegal-escape";

/** The first `string`-kind token in a lexed stream (the escape under test). */
function firstString(result: LexResult): Token | undefined {
  return result.tokens.find((t) => t.kind === "string");
}

describe("b0412 — malformed \\u escape FORMS route to illegal-escape, not invalid-unicode-escape", () => {
  // Each malformed form must flip from invalid-unicode-escape to illegal-escape
  // with the registered `illegal escape sequence: \u` message. Observed now:
  // code = theta/parse/invalid-unicode-escape for all four.
  const malformed: ReadonlyArray<{ label: string; src: string }> = [
    { label: "overlong `\\u{00000041}` (>6 hex digits)", src: 'let s = "\\u{00000041}"\n' },
    { label: "empty `\\u{}` (zero hex digits)", src: 'let s = "\\u{}"\n' },
    { label: "braceless `\\u1234` (missing `{`)", src: 'let s = "\\u1234"\n' },
    { label: "unclosed `\\u{41` (missing `}`, quote terminates)", src: 'let s = "\\u{41"\n' },
  ];

  for (const { label, src } of malformed) {
    it(`${label} draws illegal-escape, not invalid-unicode-escape`, () => {
      const result = lexSrc(src);
      expect(
        hasCode(result.diagnostics, ILLEGAL_ESCAPE),
        `${label}: a malformed \\u FORM has no in-form value to judge, so the settled fix routes it to ${ILLEGAL_ESCAPE} (currently it draws ${INVALID_UNICODE})`,
      ).toBe(true);
      expect(
        hasCode(result.diagnostics, INVALID_UNICODE),
        `${label}: ${INVALID_UNICODE} must stay on its registered out-of-range/surrogate value trigger and must NOT fire for a malformed form`,
      ).toBe(false);
      const d = findCode(result.diagnostics, ILLEGAL_ESCAPE);
      expect(
        d?.message,
        `${label}: illegal-escape reuses the registered template with char = u (no new wording — DIAG-4)`,
      ).toBe("illegal escape sequence: \\u");
    });
  }

  it("overlong `\\u{00000041}` does not leak the unconsumed residue into the token value", () => {
    // Root cause: the 6-digit cap stops mid-form, so the 7th+ digits and the
    // `}` re-enter the string loop as ordinary content. Observed value now: "41}".
    const result = lexSrc('let s = "\\u{00000041}"\n');
    const tok = firstString(result);
    expect(tok, "a string token is lexed for the overlong escape").toBeDefined();
    expect(
      tok?.value ?? "",
      'the fix consumes the whole bracketed run, so no residue like "41}" leaks into the decoded value',
    ).not.toContain("41}");
  });

  it("braceless `\\u1234` does not leak the unconsumed residue into the token value", () => {
    // Observed value now: "1234" — the braceless digits re-enter as content.
    const result = lexSrc('let s = "\\u1234"\n');
    const tok = firstString(result);
    expect(tok, "a string token is lexed for the braceless escape").toBeDefined();
    expect(
      tok?.value ?? "",
      'the fix stops the residue leak, so the braceless digits "1234" do not appear in the decoded value',
    ).not.toContain("1234");
  });

  it("second face: a WELL-FORMED `\\u{41}` keeps its hex digits in the verbatim `text` slice", () => {
    // `hex += advance()` never appends to `raw`, so the token `text` drops the
    // digits even on the conformant path. Observed text now: "\u{}" (digits gone).
    // The fix appends the consumed digits to `raw`, restoring the verbatim slice.
    const result = lexSrc('let s = "\\u{41}"\n');
    const tok = firstString(result);
    expect(tok, "a string token is lexed for the well-formed escape").toBeDefined();
    expect(
      tok?.text,
      "the token `text` is the verbatim source slice (lexer.ts contract); currently the hex digits are dropped, yielding \"\\u{}\"",
    ).toBe('"\\u{41}"');
    // The well-formed decode itself is a Non-goal — conformant both directions.
    expect(
      tok?.value,
      "a well-formed \\u{41} still decodes to U+0041 (LATIN CAPITAL LETTER A)",
    ).toBe("A");
    expect(
      hasCode(result.diagnostics, INVALID_UNICODE) || hasCode(result.diagnostics, ILLEGAL_ESCAPE),
      "a well-formed \\u{41} raises no escape diagnostic",
    ).toBe(false);
  });

  // --- Controls: invalid-unicode-escape kept on its registered value trigger.
  it("control: `\\u{110000}` (> U+10FFFF) stays on invalid-unicode-escape", () => {
    const result = lexSrc('let s = "\\u{110000}"\n');
    expect(
      hasCode(result.diagnostics, INVALID_UNICODE),
      "an out-of-range value is exactly the invalid-unicode-escape trigger",
    ).toBe(true);
    expect(
      hasCode(result.diagnostics, ILLEGAL_ESCAPE),
      "an out-of-range VALUE is not a malformed FORM, so illegal-escape must not fire",
    ).toBe(false);
    expect(
      findCode(result.diagnostics, INVALID_UNICODE)?.message,
      "the registered invalid-unicode-escape message is unchanged for the value trigger",
    ).toBe("invalid Unicode escape: value is not a Unicode scalar value");
  });

  it("control: `\\u{D800}` (UTF-16 surrogate) stays on invalid-unicode-escape", () => {
    const result = lexSrc('let s = "\\u{D800}"\n');
    expect(
      hasCode(result.diagnostics, INVALID_UNICODE),
      "a surrogate value is exactly the invalid-unicode-escape trigger",
    ).toBe(true);
    expect(
      hasCode(result.diagnostics, ILLEGAL_ESCAPE),
      "a surrogate VALUE is not a malformed FORM, so illegal-escape must not fire",
    ).toBe(false);
  });

  it("control: well-formed `\\u{41}` decodes to \"A\" with no error diagnostic", () => {
    // The happy path stays intact under the fix (§Non-goals: well-formed decode).
    const result = lexSrc('let s = "\\u{41}"\n');
    const tok = firstString(result);
    expect(tok?.value, "well-formed \\u{41} decodes to U+0041").toBe("A");
    expect(
      result.diagnostics.filter((diag) => diag.severity === "error").length,
      "a well-formed escape produces no error-severity diagnostic",
    ).toBe(0);
  });
});
