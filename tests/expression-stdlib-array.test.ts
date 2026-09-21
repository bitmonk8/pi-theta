import { describe, expect, it } from "vitest";
import {
  checkArrayJoin,
  evaluateArrayMember,
} from "../src/runtime/stdlib-array";
import type { CompatType } from "../src/parser/type-compat";
import type { CompatSite } from "../src/parser/type-compat-sites";
import type { ThetaValue } from "../src/runtime/value";

// V3g-T — failing tests for the paired `V3g` "expression stdlib members:
// `array<T>`".
//
// Spec: expressions.md §"Built-in methods and properties" (the EXPR code-keyed
// obligation area — no numbered REQ-IDs), the `array<T>` member table. Each
// theta-1.0 `array<T>` member reproduces its normative behaviour and return
// type:
//
//   - `length` is the element count;
//   - `join(sep)` concatenates `string` elements with `sep`, and a non-`string`
//     element type fires `theta/parse/non-string-array-join` at parse time;
//   - `includes(x)` / `indexOf(x)` use the V2c `valuesEqual` theta structural
//     equality, with `indexOf` returning `-1` when absent;
//   - `slice(start, end?)` follows JS semantics (negative indices count from
//     the end, `end` exclusive, omitted `end` slices to length).
//
// These tests red because the V3g `array<T>` stdlib surface is absent:
// `evaluateArrayMember` returns the inert `null` sentinel (so every member
// value assertion reds on its own expectation) and `checkArrayJoin` returns
// `undefined` (so the `theta/parse/non-string-array-join` firing assertion
// reds). No test reds on a compile error, a missing fixture, or a harness
// throw. (`array<T>.concat`'s LUB element type is owned by `V3f-T`.)

// --- CompatType / CompatSite builders for the `join` precondition ----------

function prim(
  name: "string" | "number" | "integer" | "boolean" | "null",
): CompatType {
  return { kind: "prim", name };
}

const SITE: CompatSite = {
  file: "expr.theta",
  range: {
    start: { line: 1, column: 1 },
    end: { line: 1, column: 2 },
  },
};

// --- expressions.md §"Built-in methods and properties" — `array<T>` --------

// cka-3 / V3g: the EXPR code-keyed obligation area's `array<T>` stdlib facet closes
// on V3g; the member assertions below witness that facet against the shipped
// interpreter.
describe("V3g-T — `array<T>.length` (expressions.md §Built-in methods and properties, EXPR code-keyed area / cka-3)", () => {
  it("EXPR `length`: the element count", () => {
    expect(evaluateArrayMember([1, 2, 3], "length", [])).toBe(3);
    // The empty array is length 0 (distinguishing a count from the inert
    // `null` sentinel, which is neither 3 nor 0).
    expect(evaluateArrayMember([], "length", [])).toBe(0);
  });
});

describe("V3g-T — `array<T>.join` (expressions.md §Built-in methods and properties, EXPR code-keyed area)", () => {
  it("EXPR `join`: concatenates `string` elements with the separator", () => {
    expect(evaluateArrayMember(["a", "b", "c"], "join", [", "])).toBe("a, b, c");
    // A single element yields that element with no separator; an empty array
    // yields the empty string.
    expect(evaluateArrayMember(["x"], "join", [", "])).toBe("x");
    expect(evaluateArrayMember([], "join", [", "])).toBe("");
  });

  it("EXPR `join`: a non-`string` element type fires `theta/parse/non-string-array-join`; a `string` element type raises none", () => {
    // Parse-time precondition: `arr.join(...)` requires a `string` element
    // type (no implicit type conversion in theta 1.0). Message anchored to the
    // diagnostics registry (code-registry-parse.md): the `<element>` placeholder
    // renders the offending element type.
    const fired = checkArrayJoin(prim("integer"), SITE);
    expect(fired?.code).toBe("theta/parse/non-string-array-join");
    expect(fired?.message).toBe(
      "array.join requires a string element type; got array<integer>",
    );
    // A `string` element type is admissible — no diagnostic. Folded into the
    // firing test so the inert `undefined` stub cannot pass it vacuously.
    expect(checkArrayJoin(prim("string"), SITE)).toBeUndefined();
  });
});

describe("V3g-T — `array<T>.includes` (expressions.md §Built-in methods and properties, EXPR code-keyed area)", () => {
  it("EXPR `includes`: membership by theta structural equality", () => {
    // Primitive membership.
    expect(evaluateArrayMember(["a", "b", "c"], "includes", ["b"])).toBe(true);
    expect(evaluateArrayMember(["a", "b", "c"], "includes", ["z"])).toBe(false);
    // Structural (not reference) equality: a fresh, reference-distinct object
    // that is structurally equal to an element is a member.
    const haystack: readonly ThetaValue[] = [{ x: 1 }, { x: 2 }];
    expect(evaluateArrayMember(haystack, "includes", [{ x: 2 }])).toBe(true);
    expect(evaluateArrayMember(haystack, "includes", [{ x: 3 }])).toBe(false);
  });
});

describe("V3g-T — `array<T>.indexOf` (expressions.md §Built-in methods and properties, EXPR code-keyed area)", () => {
  it("EXPR `indexOf`: first index by structural equality, `-1` when absent", () => {
    expect(evaluateArrayMember(["a", "b", "c", "b"], "indexOf", ["b"])).toBe(1);
    // Absent → -1.
    expect(evaluateArrayMember(["a", "b", "c"], "indexOf", ["z"])).toBe(-1);
    // Structural equality finds a reference-distinct but structurally-equal
    // object at its first index.
    const haystack: readonly ThetaValue[] = [{ x: 1 }, { x: 2 }, { x: 2 }];
    expect(evaluateArrayMember(haystack, "indexOf", [{ x: 2 }])).toBe(1);
    expect(evaluateArrayMember(haystack, "indexOf", [{ x: 9 }])).toBe(-1);
  });
});

describe("V3g-T — `array<T>.slice` (expressions.md §Built-in methods and properties, EXPR code-keyed area)", () => {
  it("EXPR `slice`: JS semantics — exclusive `end`", () => {
    // `end` is exclusive: slice(1, 3) of [0,1,2,3,4] is [1,2].
    expect(evaluateArrayMember([0, 1, 2, 3, 4], "slice", [1, 3])).toEqual([
      1, 2,
    ]);
  });

  it("EXPR `slice`: JS semantics — negative indices count from the end", () => {
    // slice(-2) of [0,1,2,3,4] is [3,4]; slice(1, -1) is [1,2,3].
    expect(evaluateArrayMember([0, 1, 2, 3, 4], "slice", [-2])).toEqual([3, 4]);
    expect(evaluateArrayMember([0, 1, 2, 3, 4], "slice", [1, -1])).toEqual([
      1, 2, 3,
    ]);
  });

  it("EXPR `slice`: JS semantics — omitted `end` slices to length", () => {
    expect(evaluateArrayMember([0, 1, 2, 3, 4], "slice", [2])).toEqual([
      2, 3, 4,
    ]);
  });
});
