import { describe, expect, it } from "vitest";
import { checkLiteralSublanguage } from "../src/parser/literal-sublanguage";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";
import { parseDoc, codes, hasCode, errors } from "./helpers/e2e-s1";

// e2e S1 — grammar coverage gap-fill (GRAM area).
//
// Covers REQ-GRAM rows the existing suite leaves UNCOVERED per the coverage map:
//   - REQ-GRAM-2  PrimitiveLit admits `-NUMBER`; NamedValueLit is Enum.Variant (:132)
//   - REQ-GRAM-16 FnDecl param lists are parenthesised; trailing comma admitted;
//                 FnParam is `Ident ":" Type` (:146)
// Spec: docs/spec_topics/grammar.md. Offline-unit (M1).

const span: SourceRange = {
  start: { line: 1, column: 1 },
  end: { line: 1, column: 2 },
};
const site = { file: "test.theta", range: span };

describe("REQ-GRAM-2 — the literal sublanguage admits unary-minus numerics and Enum.Variant", () => {
  it("`-5` (unary minus on a numeric literal) is a literal (no default-not-literal)", () => {
    const diags = checkLiteralSublanguage("-5", site);
    expect(
      hasCode(diags, "theta/parse/default-not-literal"),
      `codes: ${codes(diags).join(",")}`,
    ).toBe(false);
  });

  it("`Enum.Variant` member access is a literal (no default-not-literal)", () => {
    const diags = checkLiteralSublanguage("Severity.High", site);
    expect(
      hasCode(diags, "theta/parse/default-not-literal"),
      `codes: ${codes(diags).join(",")}`,
    ).toBe(false);
  });

  it("a deeper member access (not Enum.Variant) is still rejected", () => {
    // `a.b.c` is more than one `.` hop — outside the NamedValueLit carve-out.
    const diags = checkLiteralSublanguage("a.b.c", site);
    expect(
      hasCode(diags, "theta/parse/default-not-literal"),
      `codes: ${codes(diags).join(",")}`,
    ).toBe(true);
  });
});

describe("REQ-GRAM-16 — FnDecl parameter lists are always parenthesised", () => {
  it("an unparenthesised `fn f x { ... }` is rejected", () => {
    const doc = parseDoc(["fn f x {", "  x", "}"].join("\n"));
    expect(
      errors(doc.diagnostics).length,
      `expected a parse error; got codes ${codes(doc.diagnostics).join(",")}`,
    ).toBeGreaterThan(0);
  });

  it("a parenthesised param list with a trailing comma parses without error", () => {
    const doc = parseDoc(["fn f(a: integer,) {", "  a", "}"].join("\n"));
    // No structural parse error about the parameter list / trailing comma.
    expect(
      hasCode(doc.diagnostics, "theta/parse/nested-fn"),
      "trailing comma must not be misparsed",
    ).toBe(false);
    const fnErrs = errors(doc.diagnostics);
    expect(
      fnErrs.length,
      `a valid trailing-comma param list should not error; got ${codes(doc.diagnostics).join(",")}`,
    ).toBe(0);
  });

  it("a well-formed `fn f(a: integer) { a }` parses without error", () => {
    const doc = parseDoc(["fn f(a: integer) {", "  a", "}"].join("\n"));
    expect(
      errors(doc.diagnostics).length,
      `got ${codes(doc.diagnostics).join(",")}`,
    ).toBe(0);
  });
});
