import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaSource } from "../src/lexer/lexer";
import { parseThetaDocument } from "../src/parser/theta-document";
import { parseDeps as makeDeps } from "./helpers/e2e-s1";

// S4 e2e campaign — witnesses for the ten registry diagnostic codes that the
// shipped tree previously NEVER emitted. Each was a theta-defect: the closed
// registry (DIAG-1/2) mandated the code and its trigger, but the implementation
// could not produce it. Findings FIND-S4-1..10, see
// findings/s4-errors-diagnostics-findings.md.
//
// Phase-D src fixes (FIX-1 parser structural, FIX-2 type layer, FIX-3
// frontmatter advisory) closed all ten. Per D7 these witnesses have been
// reconciled from `it.fails` (defect-recording) to plain `it(...)` — they are
// now permanent POSITIVE gates asserting each code fires on its documented
// trigger. Do not weaken these back to `it.fails`.

function codesOf(src: string): string[] {
  const source: ThetaSource = {
    path: "test.theta",
    bytes: new TextEncoder().encode(src),
  };
  return parseThetaDocument(source, makeDeps()).diagnostics.map(
    (d: Diagnostic) => d.code,
  );
}

describe("S4 — control: the offline pipeline DOES emit code-level diagnostics", () => {
  it("a known parse error fires (proves the harness observes code, not literal text)", () => {
    expect(codesOf("let x =")).toContain("theta/parse/let-without-initialiser");
  });
});

describe("S4 — registry codes now emitted (permanent positive gates, D7-reconciled)", () => {
  // FIND-S4-1 — REQ-DIAG-69 / REQ-EXPR-23. code-registry-parse.md:59.
  it("theta/parse/unknown-identifier — undefined identifier in value position", () => {
    expect(codesOf("let x = doesNotExist")).toContain("theta/parse/unknown-identifier");
  });

  // FIND-S4-2 — REQ-DIAG-70 / REQ-EXPR-23 ("parse error, not a runtime failure").
  it("theta/parse/unknown-method — method not on the built-in list", () => {
    expect(codesOf('let x = "hi".frobnicate()')).toContain("theta/parse/unknown-method");
  });

  // FIND-S4-3 — REQ-DIAG-46. code-registry-parse.md:36.
  it("theta/parse/mixed-plus-operands — '+' on number and string", () => {
    expect(codesOf('let x = 1 + "a"')).toContain("theta/parse/mixed-plus-operands");
  });

  // FIND-S4-4 — REQ-DIAG-47. code-registry-parse.md:37.
  it("theta/parse/non-orderable-operands — '<' on two booleans", () => {
    expect(codesOf("let x = true < false")).toContain("theta/parse/non-orderable-operands");
  });

  // FIND-S4-5 — REQ-DIAG-54. code-registry-parse.md:44.
  it("theta/parse/extra-object-field — constructor lists an undeclared field", () => {
    expect(codesOf('schema S { a: string }\nlet x = S { a: "h", b: 2 }')).toContain(
      "theta/parse/extra-object-field",
    );
  });

  // FIND-S4-6 — REQ-DIAG-56. code-registry-parse.md:46.
  it("theta/parse/bare-object-literal — bare {…} in expression position", () => {
    expect(codesOf("let x = { a: 1 }")).toContain("theta/parse/bare-object-literal");
  });

  // FIND-S4-7 — REQ-DIAG-113. code-registry-parse.md:103.
  it("theta/parse/bind-echo-on-bypass — bind_echo:true on single-string bypass", () => {
    expect(
      codesOf("---\nmode: prompt\nparams:\n  q: string\nbind_echo: true\n---\nhi"),
    ).toContain("theta/parse/bind-echo-on-bypass");
  });

  // FIND-S4-8 — REQ-DIAG-131. code-registry-load.md:17.
  it("theta/load/bind-echo-without-params — bind_echo:true on a no-params theta", () => {
    expect(codesOf("---\nmode: prompt\nbind_echo: true\n---\nhi")).toContain(
      "theta/load/bind-echo-without-params",
    );
  });

  // FIND-S4-9 — REQ-DIAG-146. code-registry-load.md:32.
  it("theta/load/argument-hint-not-displayed — argument-hint without description", () => {
    expect(codesOf("---\nmode: prompt\nargument-hint: foo\n---\nhi")).toContain(
      "theta/load/argument-hint-not-displayed",
    );
  });

  // FIND-S4-10 — REQ-DIAG-127 / REQ-FRNT-23. code-registry-load.md:13.
  it("theta/load/deferred-frontmatter-field — a reserved/deferred frontmatter field", () => {
    // binder_temperature is enumerated in the Cluster-4 deferred appendix as a
    // deferred-frontmatter-field warning (spec-requirements.md:1264).
    expect(codesOf("---\nmode: prompt\nbinder_temperature: 0.5\n---\nhi")).toContain(
      "theta/load/deferred-frontmatter-field",
    );
  });
});

describe("S4 — FIND-S4-10 reserved-field routing (D7-reconciled)", () => {
  // FIX-3 added a deferred/reserved-field set to src/parser/frontmatter.ts, so a
  // reserved key (binder_temperature) now routes to the spec-correct
  // theta/load/deferred-frontmatter-field and NO LONGER falls through to the
  // generic unknown-frontmatter-field.
  it("binder_temperature now yields theta/load/deferred-frontmatter-field (correct code)", () => {
    const codes = codesOf("---\nmode: prompt\nbinder_temperature: 0.5\n---\nhi");
    expect(codes).toContain("theta/load/deferred-frontmatter-field");
    expect(codes).not.toContain("theta/load/unknown-frontmatter-field");
  });
});
