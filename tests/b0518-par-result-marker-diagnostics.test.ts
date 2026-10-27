import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { containsWithheldBinderType } from "../src/parser/compat-type-traversal";
import { StaticTypeInferencePass } from "../src/parser/static-type-inference";
import type { Expr } from "../src/parser/theta-document";
import { checkIterand } from "../src/parser/type-layer-iterand";
import { commonType } from "../src/parser/type-compat-sites";
import {
  checkCompatible, displayType, resolveNamed, resolveNamedRef, unfoldAlias,
  withheldBinderType, type CompatType, type TypeEnv,
} from "../src/parser/type-compat";
import { parseDoc } from "./helpers/e2e-s1";
import { PARSE_REGISTRY_PATH, registryMessageOf } from "./helpers/load-row-harness";
import { readRegistry } from "./helpers/registry-oracle";

// FS-free parser coverage; actual-library registration/runtime remain covered by
// the original production-composition and H9a witnesses. Full diagnostic objects
// preserve valid outer-kind errors, rather than suppressing unavailable payloads.
const registry = readRegistry(["parse"]);
const F = "---\nmode: prompt\n---\n";
const I = 'import { R6 } from "./p6lib.thetalib"\n';
const L = "schema R6 { note: string }\n";
const V = 'let r = R6 { note: "init" }\n';
const P = "par for x in [1] { r.note }";
const W = 'let r = R6 { xs: ["a", "b"], note: "init" }\n';
const result = "Result<unknown, QueryError>";
const localResult = "Result<string, QueryError>";
const integerResult = "Result<integer, QueryError>";
function diagnostic(codeSuffix: string, file: string, line: number, start: number, end: number,
  slots: readonly (readonly [string, string])[], fullMessage: string): Diagnostic {
  const code = `theta/parse/${codeSuffix}`;
  const message = registryMessageOf(registry, PARSE_REGISTRY_PATH, code, slots);
  expect(message).toBe(fullMessage);
  return { severity: "error", code, file, range: { start: { line, column: start }, end: { line, column: end } }, message };
}
const file = "b0518-par-results.theta";
function mismatch(type: string, line: number, end: number, start = 1, path = file) {
  return diagnostic("let-rhs-type-mismatch", path, line, start, end,
    [["<name>", "n"], ["<expected>", "integer"], ["<actual>", type]],
    `let binding 'n' initialiser type mismatch: expected integer, got ${type}`);
}
function join(element: string, end: number, path = file) {
  return diagnostic("non-string-array-join", path, 7, 1, end, [["<element>", element]],
    `array.join requires a string element type; got array<${element}>`);
}
function iterand(type: string, end: number, path = file) {
  return diagnostic("non-array-iterand", path, 7, 10, end, [["<type>", type]],
    `'for' expects array<T> after 'in'; got ${type}`);
}
function assertDiagnostics(actual: readonly Diagnostic[], expected: readonly Diagnostic[], legacy = false) {
  expect(actual).toEqual(expected);
  if (!legacy) expect(JSON.stringify(actual)).not.toContain("<withheld>");
}

describe("B0518 parallel member-origin diagnostic rendering", () => {
  const cases: readonly [string, string, () => Diagnostic[], boolean?][] = [
    ["A direct imported typed let", I + V + `let n: integer = ${P}\n`, () => [mismatch(`array<${result}>`, 6, 45)]],
    ["B bound imported join", I + V + `let values = ${P}\nvalues.join(\",\")\n`, () => [join(result, 17)]],
    ["C bound imported typed let", I + V + `let values = ${P}\nlet n: integer = values\n`, () => [mismatch(`array<${result}>`, 7, 24)]],
    ["D indexed Result stays non-array", I + V + `let values = ${P}\nfor y in values[0] { let seen = y }\n1\n`, () => [iterand(result, 19)]],
    ["E nested known array payload", I + V + "let n: integer = par for x in [1] { [r.note] }\n", () => [mismatch("array<Result<array<unknown>, QueryError>>", 6, 47)]],
    ["F local typed-let precision", L + V + `let n: integer = ${P}\n`, () => [mismatch(`array<${localResult}>`, 6, 45)]],
    ["G local join precision", L + V + `let values = ${P}\nvalues.join(\",\")\n`, () => [join(localResult, 17)]],
    ["H healthy imported result", I + V + `let values = ${P}\nvalues\n`, () => []],
    ["J determined integer", "let n: integer = par for x in [1] { x }\n", () => [mismatch(`array<${integerResult}>`, 4, 40)]],
    ["K absent tail is null", "let n: integer = par for x in [1] { let seen = x }\n", () => [mismatch("array<Result<null, QueryError>>", 4, 51)]],
    ["M legacy direct binder is unchanged", "fn f(p) { let n: integer = par for x in [1] { p }\n1 }\n1\n", () => [mismatch("array<Result<<withheld>, QueryError>>", 4, 50, 11)], true],
  ];
  for (const [name, body, expected, legacy] of cases) {
    it(name, () => {
      const doc = parseDoc(F + body, file);
      expect(doc.frontmatter).not.toBeNull();
      assertDiagnostics(doc.diagnostics, expected(), legacy);
    });
  }
  const originalFile = "review-b0518.theta";
  const originals: readonly [string, string, () => Diagnostic[]][] = [
    ["O1 original imported iterand bound typed sink", "let xs = par for x in r.xs { r.note }\nlet n: integer = xs\n", () => [mismatch(`array<${result}>`, 7, 20, 1, originalFile)]],
    ["O2 original indexed Result", "let xs = par for x in r.xs { r.note }\nfor x in xs[0] { let y = x }\n1\n", () => [iterand(result, 15, originalFile)]],
    ["O3 original join", "let xs = par for x in r.xs { r.note }\nxs.join(\",\")\n", () => [join(result, 13, originalFile)]],
    ["O4 original direct typed sink", "let n: integer = par for x in r.xs { r.note }\n", () => [mismatch(`array<${result}>`, 6, 46, 1, originalFile)]],
    ["O5 recursive withheld typed-let guard", "let n: integer = [r.note]\n", () => []],
    ["O6 determined tail with imported prefix", "let n: integer = par for x in [1] { x }\n", () => [mismatch(`array<${integerResult}>`, 6, 40, 1, originalFile)]],
  ];
  for (const [name, body, expected] of originals) {
    it(name, () => {
      const doc = parseDoc(F + I + W + body, originalFile);
      expect(doc.frontmatter).not.toBeNull();
      assertDiagnostics(doc.diagnostics, expected());
    });
  }
  it("the complete-list oracle rejects the original marker-bearing diagnostic", () => {
    const expected = [mismatch(`array<${result}>`, 6, 45)];
    const captured: Diagnostic[] = [{ severity: "error", code: "theta/parse/let-rhs-type-mismatch", file,
      range: { start: { line: 6, column: 1 }, end: { line: 6, column: 45 } },
      message: "let binding 'n' initialiser type mismatch: expected integer, got array<Result<<withheld>, QueryError>>" }];
    expect(() => assertDiagnostics(captured, expected)).toThrow();
  });
});

function inference() {
  return new StaticTypeInferencePass({ checkCompatible, enumNames: new Set(), fnCallReturnTypes: new Map() });
}
function parsedInitialiser(body: string, name: string): Expr {
  const doc = parseDoc(F + body, "b0518-construction.theta");
  expect(doc.frontmatter).not.toBeNull();
  expect(doc.diagnostics).toEqual([]);
  const statement = doc.body?.statements.find(s => s.kind === "let" && s.name === name);
  if (statement?.kind !== "let" || statement.init === null) throw new Error(`missing parsed initialiser: ${name}`);
  return statement.init;
}
function inferredMember() {
  const node = parsedInitialiser(I + V + "let leaf = r.note\nleaf\n", "leaf");
  expect(node.kind).toBe("member");
  const pass = inference();
  const bindings = new Map<string, CompatType>([["r", { kind: "named", name: "R6" }]]);
  expect(pass.collectProvableArgTypes(node, {})).toBeUndefined();
  if (node.kind !== "member") throw new Error("expected real member node");
  expect(pass.declaredFieldType(node, {}, bindings)).toBeUndefined();
  return pass.typeOf(node, {}, bindings);
}
const site = { file: "b0518-origin-unit.theta", range: {
  start: { line: 1, column: 1 }, end: { line: 1, column: 2 },
} };
function strictIterand(type: CompatType, env: TypeEnv = {}) {
  const diagnostics: Diagnostic[] = [];
  checkIterand(type, site, env, diagnostics);
  return diagnostics;
}

describe("B0518 closed factory modes and construction provenance", () => {
  const integer: CompatType = { kind: "prim", name: "integer" };
  const string: CompatType = { kind: "prim", name: "string" };
  const hostileEnv: TypeEnv = { unknown: { kind: "alias", rhs: integer } };
  it("preserves exact binder values and mints the literal safe member carrier", () => {
    expect(withheldBinderType()).toEqual({ kind: "named", name: "<withheld>", withheld: true });
    expect(withheldBinderType("binder")).toEqual({ kind: "named", name: "<withheld>", withheld: true });
    expect(withheldBinderType("unavailable-member")).toEqual({ kind: "named", name: "unknown", withheld: true });
    expect(inferredMember()).toEqual({ kind: "named", name: "unknown", withheld: true });
  });
  for (const origin of ["binder", "unavailable-member"] as const) {
    it(`${origin}: recursive/copy marker, resolution and compatibility remain unchanged`, () => {
      const leaf = withheldBinderType(origin);
      if (leaf.kind !== "named") throw new Error("factory must return named");
      for (const env of [{}, hostileEnv]) {
        expect(resolveNamed(env, leaf.name)).toBeUndefined();
        expect(resolveNamedRef(env, leaf)).toBeUndefined();
        expect(unfoldAlias(leaf, env)).toEqual(leaf);
        const sinks: CompatType[] = [integer, { kind: "array", element: string },
          { kind: "object", fields: [{ name: "a", type: integer }] }];
        for (const sink of sinks) expect(checkCompatible(leaf, sink, env)).toBe("unknown");
        const composites: CompatType[] = [leaf, { ...leaf }, { kind: "array", element: { ...leaf } },
          { kind: "union", arms: [string, { ...leaf }] },
          { kind: "object", fields: [{ name: "known", type: integer }, { name: "missing", type: { ...leaf } }] }];
        for (const type of composites) {
          expect(containsWithheldBinderType(type)).toBe(true);
          expect(strictIterand(type, env)).toEqual([]);
        }
      }
    });
  }
  it("preserves known recursive payload structure at real parsed Result construction", () => {
    const leaf = inferredMember();
    const par = parsedInitialiser("let inputs = [1]\nlet values = par for x in inputs { x }\nvalues\n", "values");
    if (par.kind !== "par-for") throw new Error("expected let-bound par-for");
    expect(par.body.tail?.kind).toBe("ident");
    const cases: readonly [CompatType, string, boolean][] = [
      [leaf, "unknown", true],
      [{ kind: "array", element: leaf }, "array<unknown>", true],
      [{ kind: "union", arms: [string, leaf] }, "string | unknown", true],
      [{ kind: "object", fields: [{ name: "known", type: integer }, { name: "missing", type: leaf }] }, "{ known: integer, missing: unknown }", true],
      [withheldBinderType(), "<withheld>", true],
      [{ kind: "named", name: "<withheld>" }, "<withheld>", false],
      [{ kind: "named", name: "unknown" }, "unknown", false],
      [{ kind: "named", name: "Missing" }, "Missing", false],
    ];
    for (const [payload, display, marked] of cases) {
      const array: CompatType = { kind: "array", element: payload };
      const bindings = new Map([["inputs", array]]);
      const before = structuredClone({ payload, array, bindings, par });
      const type = inference().typeOf(par, {}, bindings);
      const name = `Result<${display}, QueryError>`;
      expect(type).toEqual({ kind: "array", element: { kind: "named", name } });
      expect(displayType(type)).toBe(`array<${name}>`);
      expect(containsWithheldBinderType(type)).toBe(false);
      expect(containsWithheldBinderType(payload)).toBe(marked);
      expect({ payload, array, bindings, par }).toEqual(before);
    }
  });
  for (const name of ["<withheld>", "unknown", "Missing"]) {
    it(`strict unmarked ${name} is not laundered by its spelling`, () => {
      const type: CompatType = { kind: "named", name };
      expect(containsWithheldBinderType(type)).toBe(false);
      expect(strictIterand(type)).toEqual([diagnostic("non-array-iterand", site.file, 1, 1, 2,
        [["<type>", name]], `'for' expects array<T> after 'in'; got ${name}`)]);
    });
  }
  it("commonType and inference keep the first dominating candidate in both orders", () => {
    const member = inferredMember();
    const binder = withheldBinderType();
    const array = parsedInitialiser("let a = 1\nlet b = 2\nlet reduced = [a, b]\nreduced\n", "reduced");
    for (const pair of [[member, binder], [binder, member], [member, integer], [integer, member]]) {
      for (const env of [{}, hostileEnv]) {
        const before = structuredClone(pair);
        expect(commonType(pair, env, checkCompatible)).toEqual(pair[0]);
        const bindings = new Map([["a", pair[0]!], ["b", pair[1]!]]);
        expect(inference().typeOf(array, env, bindings)).toEqual({ kind: "array", element: pair[0] });
        expect(pair).toEqual(before);
        expect(containsWithheldBinderType(pair[0]!)).toBe(pair[0]!.kind !== "prim");
      }
    }
  });
});
