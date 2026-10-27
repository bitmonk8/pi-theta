import { describe, expect, it } from "vitest";
import { parseThetaDocument } from "../src/parser/theta-document";
import { parseDeps } from "./helpers/e2e-s1";

// Source bytes -> production document parser/type-layer/diagnostics. This tier
// does not read a library or exercise host registration: the companion H9a test
// covers real on-disk imports, discovery and command registration in pi -p.
const SCHEMA = "schema R6 { xs: array<string>, ran: boolean, note: string }";
const IMPORT = 'import { R6 } from "./p6lib.thetalib"';
const VALUE = 'let r = R6 { xs: ["a", "b"], ran: false, note: "init" }';
const NON_ARRAY = "theta/parse/non-array-iterand";
function parse(body: string) {
  const doc = parseThetaDocument({ path: "b0518.theta", bytes: new TextEncoder().encode(
    "---\nmode: prompt\n---\n" + body + "\n",
  ) }, parseDeps());
  expect(doc.frontmatter, "B0518 valid fixture frontmatter").not.toBeNull();
  return doc.diagnostics.map(d => ({ code: d.code, severity: d.severity, message: d.message }));
}
function assertClean(actual: ReturnType<typeof parse>) {
  expect(actual, "B0518 imported array member must not be refused as receiver R6").toEqual([]);
}

for (const loop of ["for", "par for"]) {
  describe(`B0518 ${loop} source-to-diagnostics`, () => {
    const tail = `${loop} x in r.xs { let seen = x }\n1`;
    it("witness: imported array member is accepted", () => {
      const actual = parse(`${IMPORT}\n${VALUE}\n${tail}`);
      expect(actual.filter(d => d.code !== NON_ARRAY), "no unrelated diagnostic may serve as the witness").toEqual([]);
      expect(JSON.stringify(actual), "internal withheld marker never leaks").not.toContain("<withheld>");
      assertClean(actual);
    });
    it("healthy control: identical same-file schema and loop", () => {
      assertClean(parse(`${SCHEMA}\n${VALUE}\n${tail}`));
    });
    it("healthy control: imported two-step workaround", () => {
      assertClean(parse(`${IMPORT}\n${VALUE}\nlet mut xs2: array<string> = []\nxs2 = r.xs\n${loop} x in xs2 { let seen = x }\n1`));
    });
    it("red-direction control: the clean oracle rejects a genuinely non-array local member", () => {
      const actual = parse(`${SCHEMA}\n${VALUE}\n${loop} x in r.note { let seen = x }\n1`);
      expect(actual).toEqual([{
        code: NON_ARRAY, severity: "error",
        message: "'for' expects array<T> after 'in'; got string",
      }]);
      expect(() => assertClean(actual)).toThrow(/B0518 imported array member must not be refused as receiver R6/);
    });
  });
}

describe("B0518 established compatibility controls", () => {
  it("local string member still refuses an integer annotation", () => {
    expect(parse(`${SCHEMA}\n${VALUE}\nlet n: integer = r.note`).map(d => d.code)).toEqual([
      "theta/parse/let-rhs-type-mismatch",
    ]);
  });
  it("genuinely undeclared receiver still reports unknown identifier", () => {
    expect(parse("for x in missing.xs { let seen = x }\n1").map(d => d.code)).toContain("theta/parse/unknown-identifier");
  });
});
