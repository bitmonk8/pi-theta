import { describe, expect, it } from "vitest";
import {
  concatElementType,
  evaluateStringMember,
} from "../src/runtime/stdlib-string";
import type { CompatType } from "../src/parser/type-compat";
import type { LoomValue } from "../src/runtime/value";

// V3f-T — failing tests for the paired `V3f` "expression stdlib members:
// `string`".
//
// Spec: expressions.md §"Built-in methods and properties" (the EXPR code-keyed
// obligation area — no numbered REQ-IDs). Two obligation groups:
//
//   - the five normative `String.replace` reference vectors reproduce exactly,
//     and `array<T>.concat(array<U>)` returns the LUB element type `T ⊔ U`;
//   - each loom-1.0 `string` stdlib member reproduces its normative behaviour
//     and return type: `length` (UTF-16 code-unit count), `toLowerCase()` /
//     `toUpperCase()` / `trim()` (locale-independent transforms), `startsWith`
//     / `endsWith` / `includes` (`boolean`), and `split(sep)` (`array<string>`,
//     empty separator → one string per code unit).
//
// These tests red because the V3f stdlib surface is absent:
// `evaluateStringMember` returns the inert `null` sentinel (so every member
// value assertion reds on its own expectation) and `concatElementType` returns
// the inert `null`-primitive sentinel (so every LUB type assertion reds). No
// test reds on a compile error, a missing fixture, or a harness throw.

// --- CompatType builders for the concat LUB checks -------------------------

function prim(
  name: "string" | "number" | "integer" | "boolean" | "null",
): CompatType {
  return { kind: "prim", name };
}
function union(arms: readonly CompatType[]): CompatType {
  return { kind: "union", arms };
}

// --- expressions.md §"Built-in methods and properties" — `replace` vectors -

describe("V3f-T — `String.replace` reference vectors (expressions.md §Built-in methods and properties, EXPR code-keyed area)", () => {
  // The five normative reference vectors conforming implementations MUST
  // reproduce exactly. Each exercises a distinct clause of the `replace`
  // semantics (all-occurrences, literal `$&` / `$$` / `$n`, empty `from`,
  // left-to-right non-overlapping scan).
  it("EXPR `replace`: vector 1 — all-occurrences + literal `$&` (not the matched substring)", () => {
    // A host `replaceAll` interpreting `$&` would yield "a[X]b[X]c"; loom
    // inserts `$&` literally.
    expect(evaluateStringMember("aXbXc", "replace", ["X", "[$&]"])).toBe(
      "a[$&]b[$&]c",
    );
  });

  it("EXPR `replace`: vector 2 — literal `$$` (not the host `$$`→`$` escape)", () => {
    // A host `$$`→`$` escape would yield "1$$"; loom inserts `$$` literally.
    expect(evaluateStringMember("100", "replace", ["0", "$$"])).toBe("1$$$$");
  });

  it("EXPR `replace`: vector 3 — `$n` inserted literally (no capture-group expansion)", () => {
    expect(evaluateStringMember("a-b", "replace", ["-", "x$1y"])).toBe("ax$1yb");
  });

  it("EXPR `replace`: vector 4 — empty `from` returns the receiver unchanged", () => {
    expect(evaluateStringMember("abc", "replace", ["", "X"])).toBe("abc");
  });

  it("EXPR `replace`: vector 5 — left-to-right, non-overlapping scan", () => {
    // A right-to-left scan would yield "axx"; a rewind-after-replacement policy
    // would yield another shape. Only the mandated scan reproduces "xxa".
    expect(evaluateStringMember("aaaaa", "replace", ["aa", "x"])).toBe("xxa");
  });
});

// --- expressions.md §"Built-in methods and properties" — `concat` LUB ------

describe("V3f-T — `array<T>.concat` LUB element type (expressions.md §Built-in methods and properties, EXPR code-keyed area)", () => {
  it("EXPR `concat`: `integer ⊔ number = number`, in both call directions", () => {
    // `array<integer>.concat(array<number>)` widens to `array<number>`.
    expect(concatElementType(prim("integer"), prim("number"), {})).toEqual(
      prim("number"),
    );
    // The LUB is symmetric: `array<number>.concat(array<integer>)` also widens.
    expect(concatElementType(prim("number"), prim("integer"), {})).toEqual(
      prim("number"),
    );
  });

  it("EXPR `concat`: identical element types collapse (TYPE-1)", () => {
    expect(concatElementType(prim("string"), prim("string"), {})).toEqual(
      prim("string"),
    );
  });

  it("EXPR `concat`: disjoint element types union to `T | U` (receiver-first)", () => {
    // `array<integer>.concat(array<string>)` types as `array<integer | string>`.
    expect(concatElementType(prim("integer"), prim("string"), {})).toEqual(
      union([prim("integer"), prim("string")]),
    );
  });
});

// --- expressions.md §"Built-in methods and properties" — `string` members --

describe("V3f-T — `string` stdlib members (expressions.md §Built-in methods and properties, EXPR code-keyed area)", () => {
  it("EXPR `length`: the UTF-16 code-unit count (no grapheme / code-point segmentation)", () => {
    // "💩" is U+1F4A9 — one code point, but two UTF-16 code units. `length`
    // counts code units, so "a💩" is 3 (distinguishing it from a code-point
    // count of 2).
    expect(evaluateStringMember("a💩", "length", [])).toBe(3);
  });

  it("EXPR `toLowerCase`: locale-independent lower-casing", () => {
    expect(evaluateStringMember("HÉLLO", "toLowerCase", [])).toBe("héllo");
  });

  it("EXPR `toUpperCase`: locale-independent upper-casing (full-case `ß`→`SS`)", () => {
    expect(evaluateStringMember("hello", "toUpperCase", [])).toBe("HELLO");
    // The full-case `ß`→`SS` mapping pins `String.prototype.toUpperCase`
    // semantics (locale-independent, length-changing).
    expect(evaluateStringMember("ß", "toUpperCase", [])).toBe("SS");
  });

  it("EXPR `trim`: strips Unicode whitespace from both ends", () => {
    // U+00A0 (NBSP) is Unicode whitespace and is stripped from both ends.
    expect(evaluateStringMember("\u00A0 \thi\n \u00A0", "trim", [])).toBe("hi");
  });

  it("EXPR `startsWith`: returns `boolean` with JS semantics", () => {
    const yes = evaluateStringMember("hello", "startsWith", ["he"]);
    const no = evaluateStringMember("hello", "startsWith", ["lo"]);
    expect(typeof yes).toBe("boolean");
    expect(yes).toBe(true);
    expect(no).toBe(false);
  });

  it("EXPR `endsWith`: returns `boolean` with JS semantics", () => {
    const yes = evaluateStringMember("hello", "endsWith", ["lo"]);
    const no = evaluateStringMember("hello", "endsWith", ["he"]);
    expect(typeof yes).toBe("boolean");
    expect(yes).toBe(true);
    expect(no).toBe(false);
  });

  it("EXPR `includes`: returns `boolean` with JS semantics", () => {
    const yes = evaluateStringMember("hello", "includes", ["ell"]);
    const no = evaluateStringMember("hello", "includes", ["z"]);
    expect(typeof yes).toBe("boolean");
    expect(yes).toBe(true);
    expect(no).toBe(false);
  });

  it("EXPR `split`: literal separator returns `array<string>`", () => {
    expect(evaluateStringMember("a,b,c", "split", [","])).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("EXPR `split`: the empty separator decomposes into one string per UTF-16 code unit", () => {
    // Plain ASCII: one string per character.
    expect(evaluateStringMember("abc", "split", [""])).toEqual(["a", "b", "c"]);
    // A surrogate pair decomposes into its two lone-surrogate code-unit strings
    // (one string per code unit, not per code point), so "a💩" → 3 elements.
    const parts = evaluateStringMember("a💩", "split", [""]) as readonly LoomValue[];
    expect(parts).toEqual(["a", "\ud83d", "\udca9"]);
  });
});
