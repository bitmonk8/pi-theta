// Oracle-only negative controls supplement (not replace) the real frontend,
// production-composition and host witnesses. Each legacy old/wrong answer must
// fail exact equality against the actual production frontend observation.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDoc } from "./helpers/e2e-s1";
const P = "---\nmode: prompt\n---\n";
const letError = (name: string, wanted: string, actual: string) =>
  `error theta/parse/let-rhs-type-mismatch: let binding '${name}' initialiser type mismatch: expected ${wanted}, got ${actual}`;
const nonArray = (type: string) => `error theta/parse/non-array-iterand: 'for' expects array<T> after 'in'; got ${type}`;
const method = "error theta/parse/unknown-method: unknown method 'frobnicate' on type string";
const arrayError = "error theta/parse/array-no-common-type: array elements have no common type; annotate the binding with array<A | B> or use a single schema";
const cells: readonly { name: string; source: string; after: readonly string[]; before: readonly string[] }[] = [
  { name: "g2 alias", source: 'schema L = array<string>\nfn g(): L { ["a"] }\nlet y = g()[0]\ny.frobnicate()', after: [method], before: [] },
  { name: "g3 concrete", source: 'fn g(): array<string> { ["a"] }\nlet y = g()[0]\ny.frobnicate()', after: [method], before: [] },
  { name: "f1 admission", source: 'fn g(): array<string> { ["a"] }\nfor y in g() { y }\n1', after: [], before: [nonArray("g")] },
  { name: "d4", source: 'fn f(): integer { 1 }\nlet r: {a: integer} = f()', after: [letError("r", "{ a: integer }", "integer")], before: [] },
  { name: "g4", source: 'fn f(): integer { 1 }\nlet o: {a: integer} = f()\nfor v in o { let q = 1 }',
    after: [letError("o", "{ a: integer }", "integer"), nonArray("{ a: integer }")], before: [nonArray("{ a: integer }")] },
  { name: "g5", source: 'fn f(): integer { 1 }\nlet o: {a: integer} = f()\nlet z = [o, 1]',
    after: [letError("o", "{ a: integer }", "integer"), arrayError], before: [arrayError] },
  { name: "g6.2", source: 'fn f(): integer { 1 }\nlet x: array<{a: integer}> = [f()]',
    after: [letError("x", "array<{ a: integer }>", "array<integer>"), "error theta/parse/array-element-type-mismatch: array element type mismatch at index 0: expected { a: integer }, got integer"], before: [] },
  { name: "r2a", source: 'schema S { n: number }\nfn f(): string { "s" }\nlet s = S { n: f() }\ns',
    after: ["error theta/parse/object-field-type-mismatch: field 'n' on schema 'S' type mismatch: expected number, got string"], before: [] },
  { name: "r2b previously masked", source: 'fn f(): string { "s" }\nlet n: number = f()\nn', after: [letError("n", "number", "string")], before: [] },
  { name: "b1", source: 'fn index(): integer { 1 }\nfor y in index() { y }\n1', after: [nonArray("integer")], before: [nonArray("index")] },
  { name: "e7 known refusal", source: 'fn f2(): string { return "z" }\nlet v: { x: string } = f2()\nv', after: [letError("v", "{ x: string }", "string")], before: [] },
];
describe("B0513 authorized legacy oracle rejecting directions", () => {
  for (const cell of cells) {
    it(`${cell.name}: exact full observation rejects the historical old/wrong result`, () => {
      const doc = parseDoc(P + cell.source);
      const actual = doc.diagnostics.map(d => `${d.severity} ${d.code}: ${d.message}`);
      const assertExact = (expected: readonly string[]) => expect(actual, `B0513 ${cell.name} exact oracle`).toEqual(expected);
      assertExact(cell.after);
      expect(() => assertExact(cell.before)).toThrow(/exact oracle/);
    });
  }
  it("approved grammar gates reject the old count and the blanket Result promise", () => {
    const reference = readFileSync("docs/reference/grammar.md", "utf8");
    const count = reference.trimEnd().split("\n").length;
    expect(count).toBe(778);
    expect(() => expect(count, "B0516 exact reference count").toBe(772)).toThrow(/exact reference count/);
    expect(() => expect(count, "B0513 exact reference count").toBe(765)).toThrow(/exact reference count/);
    expect(() => expect(count, "B0513 exact reference count").toBe(762)).toThrow(/exact reference count/);
    const text = readFileSync("docs/spec_topics/grammar.md", "utf8");
    expect(text).toContain("the clause binds to the call and `?` then applies to the call's value under its own [operand-type precondition](./expressions.md#err-18), without the clause establishing a `Result` type;");
    expect(() => expect(text, "B0513 no unconditional Result promise").toMatch(/the clause binds to the call and `\?` then applies to the call's `Result`/)).toThrow(/no unconditional Result promise/);
  });
});
