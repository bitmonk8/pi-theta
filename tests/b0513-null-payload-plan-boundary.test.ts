// Characterizes the existing LUB boundary behind B0513's owner-authorized
// summary-oracle correction. No production answer is mocked; this does not
// replace the production adapter witness or its archived pre-fix evidence.
import { describe, expect, it } from "vitest";
import { resolveReturnType } from "../src/parser/functions";
import { checkCompatible, type CompatType } from "../src/parser/type-compat";

const literalNull: CompatType = { kind: "literal", typesAs: "null" };
const primitiveNull: CompatType = { kind: "prim", name: "null" };
const range = { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };

describe("B0513 approved-plan boundary: existing FN-3 null representation", () => {
  it("widens a lone literal-null return contribution, independent of call typing", () => {
    expect(resolveReturnType({
      contributions: [{ kind: "plain", type: literalNull }], hasQuestion: false,
      env: {}, site: { file: "b0513-null-boundary.theta", range },
    })).toEqual({ kind: "inferred", inferred: { payload: primitiveNull, wrapped: false } });
  });

  it("preserves literal null for the distinct empty-contribution path", () => {
    expect(resolveReturnType({
      contributions: [], hasQuestion: false, env: {},
      site: { file: "b0513-null-boundary.theta", range },
    })).toEqual({ kind: "inferred", inferred: { payload: literalNull, wrapped: false } });
  });

  it("does not assume literal and primitive representations are interchangeable at every sink", () => {
    expect(checkCompatible(literalNull, primitiveNull, {})).toBe("compatible");
    expect(checkCompatible(primitiveNull, literalNull, {})).toBe("incompatible");
  });

  it("the corrected exact summary oracle rejects the recorded pre-fix undefined and other wrong shapes", () => {
    // red-1.json records undefined at the void-call adapter before the fix.
    // This checks the assertion's red direction, NOT a new pre-fix execution.
    // The complete adapter witness separately measures the production result.
    for (const observed of [
      undefined,
      { kind: "named", name: "g" },
      { kind: "prim", name: "string" },
      { kind: "prim", name: "void" },
      literalNull,
    ]) {
      expect(() => expect(observed, "B0513 unit: void call payload must be null")
        .toEqual({ kind: "prim", name: "null" }))
        .toThrowError(/B0513 unit: void call payload must be null/);
    }
  });
});
