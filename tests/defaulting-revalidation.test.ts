import { describe, expect, it } from "vitest";
import { fillDefaultsAndRevalidate } from "../src/binder/defaulting";
import { spyValidator } from "./helpers/spy-validator";

// V11g-T — failing tests for the paired `V11g` "fill-if-absent defaulting and
// post-merge AJV validation" implementation.
//
// Spec: binder/defaulting-system-note-echo.md §Defaulting
// (anchor #post-default-merge-ajv-validation). The obligation is the
// coverage-matrix code-keyed area `cka-40` (un-anchored; GOV-22 residue) — the
// fill-if-absent default-fill (absent wire names take their declared defaults; a
// present wire name is preserved unchanged) and the post-default-merge AJV
// validation MUST (`SchemaValidator.validate()` re-validates the merged `args`
// against the lowered `params` schema after defaults are filled).
//
// These tests red because the V11g contract is absent: `fillDefaultsAndRevalidate`
// is an inert stub returning an empty merged-args object, no default-supplied
// fields, and an unconditional `ok` verdict that never consults the validator.
// Each test reds on its own primary assertion (an absent default not filled, a
// present value not preserved, the validator never invoked on the merged args)
// — not on a compile error, missing fixture, or harness throw.

describe("V11g-T — fill-if-absent defaulting + post-default-merge AJV validation (cka-40)", () => {
  it("cka-40: an absent wire name takes its declared default in the merged args", () => {
    // The binder omitted the defaulted field (the relaxed `ok` arm permits it);
    // fill-if-absent fills the declared default.
    const { validator } = spyValidator({ ok: true });
    const r = fillDefaultsAndRevalidate({
      binderArgs: {},
      defaults: [{ wireName: "focus_areas", defaultValue: [] }],
      validator,
    });
    expect(r.args["focus_areas"], "an absent wire name takes its declared default").toStrictEqual([]);
    expect(
      r.defaultedWireNames,
      "a field that took its declared default is reported as default-supplied",
    ).toContain("focus_areas");
  });

  it("cka-40: a present wire name is preserved unchanged (no default applied)", () => {
    // The binder supplied a value for the defaulted field; fill-if-absent leaves
    // it unchanged and does NOT tag it default-supplied.
    const { validator } = spyValidator({ ok: true });
    const r = fillDefaultsAndRevalidate({
      binderArgs: { focus_areas: ["error handling"] },
      defaults: [{ wireName: "focus_areas", defaultValue: [] }],
      validator,
    });
    expect(
      r.args["focus_areas"],
      "a present wire name preserves the binder-supplied value unchanged",
    ).toStrictEqual(["error handling"]);
    expect(
      r.defaultedWireNames,
      "a binder-supplied value for a defaulted field is not reported as default-supplied",
    ).not.toContain("focus_areas");
  });

  it("cka-40: SchemaValidator.validate() re-validates the merged args after defaults are filled", () => {
    // A defaulted field is absent (filled by fill-if-absent); the post-default-merge
    // validation must run against the MERGED args, so the validator sees the filled
    // default, and its verdict is surfaced.
    const { validator, calls } = spyValidator({ ok: false, errors: [] });
    const r = fillDefaultsAndRevalidate({
      binderArgs: { language: "TypeScript" },
      defaults: [{ wireName: "focus_areas", defaultValue: [] }],
      validator,
    });
    expect(
      calls.length,
      "the post-default-merge validation calls SchemaValidator.validate() exactly once",
    ).toBe(1);
    expect(
      calls[0],
      "re-validation runs against the merged args (default filled in), not the raw binder args",
    ).toStrictEqual({ language: "TypeScript", focus_areas: [] });
    expect(
      r.validation.ok,
      "the merged-args validation verdict is surfaced on the result",
    ).toBe(false);
  });
});
