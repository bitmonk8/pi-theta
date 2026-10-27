import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { parseDoc } from "./helpers/e2e-s1";
import { PARSE_REGISTRY_PATH, registryMessageOf } from "./helpers/load-row-harness";
import { readRegistry } from "./helpers/registry-oracle";

const registry = readRegistry(["parse"]);
const file = "review-nonparallel.theta";
const prefix = "---\nmode: prompt\n---\n";
const imported = 'import { R6 } from "./p6lib.thetalib"\n';
const local = "schema R6 { note: string }\n";
const value = 'let r = R6 { note: "init" }\n';
// No parallel expressions: N1 exercises the separate boolean renderer, N2–N4
// canonical display. These are real synchronous parser tests, not FS loaders.
describe("B0518 nonparallel member-origin diagnostics", () => {
  for (const [origin, declaration, element] of [["imported", imported, "unknown"], ["local", local, "string"]] as const) {
    const type = `array<${element}>`;
    const cases: readonly [string, string, string, number, number, readonly (readonly [string, string])[], string][] = [
      ["N1 condition", "if [r.note] { let seen = 1 }\n1\n", "non-boolean-condition", 4, 12,
        [["<type>", type]], `condition must be boolean; got ${type}`],
      ["N2 mixed plus", "let n = [r.note] + 1\nn\n", "mixed-plus-operands", 9, 21,
        [["<left>", type], ["<right>", "integer"]], `'+' has mixed operand types: ${type} and integer`],
      ["N3 ordering", "let n = [r.note] < 1\nn\n", "non-orderable-operands", 9, 21,
        [["<op>", "<"], ["<left>", type], ["<right>", "integer"]], `'<' requires two numeric or two string operands; got ${type} and integer`],
      ["N4 unknown method", "[r.note].frobnicate()\n", "unknown-method", 1, 22,
        [["<method>", "frobnicate"], ["<type>", type]], `unknown method 'frobnicate' on type ${type}`],
    ];
    for (const [name, body, suffix, start, end, slots, full] of cases) {
      it(`${origin} ${name}`, () => {
        const doc = parseDoc(prefix + declaration + value + body, file);
        expect(doc.frontmatter).not.toBeNull();
        const code = `theta/parse/${suffix}`;
        const message = registryMessageOf(registry, PARSE_REGISTRY_PATH, code, slots);
        expect(message).toBe(full);
        const expected: Diagnostic[] = [{ severity: "error", code, file,
          range: { start: { line: 6, column: start }, end: { line: 6, column: end } }, message }];
        expect(doc.diagnostics).toEqual(expected);
        expect(JSON.stringify(doc.diagnostics)).not.toContain("<withheld>");
      });
    }
    it(`${origin} healthy member read`, () => {
      const doc = parseDoc(prefix + declaration + value + "r.note\n", file);
      expect(doc.frontmatter).not.toBeNull();
      expect(doc.diagnostics).toEqual([]);
      expect(JSON.stringify(doc.diagnostics)).not.toContain("<withheld>");
    });
  }
});
