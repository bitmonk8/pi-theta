import { describe, expect, it } from "vitest";
import {
  renderArgumentEcho,
  renderEchoValue,
  type EchoType,
} from "../src/render/argument-echo";
import { makeEnumValue } from "../src/runtime/value";

// V11h-T — failing tests for the paired `V11h` "argument echo" implementation.
//
// Spec: binder/defaulting-system-note-echo.md §"Echo policy" (anchor
// #echo-policy): the BNDR-6 reference-rendering table (rows bndr-6a … bndr-6x,
// which the leaf MUST reproduce exactly, composing the V2d canonical number
// renderer for the numeric rows) and the `(default)` echo annotation
// (default-supplied fields are tagged, a binder-supplied value for a defaulted
// field is untagged, per §Defaulting's fill-if-absent rule).
//
// These tests red because the V11h contract is absent: `renderEchoValue` and
// `renderArgumentEcho` are inert stubs returning a sentinel that equals no
// expected rendering (in particular it is NOT `""`, so the BNDR-6a `""` row
// still reds rather than passing vacuously). Each test reds on its own primary
// assertion (the stub sentinel != the pinned observable byte output) — not on a
// compile error, missing fixture, or harness throw.

// --- BNDR-6 — reference renderings (rows bndr-6a … bndr-6x) ----------------

describe("V11h-T — BNDR-6 reference renderings (defaulting-system-note-echo.md, anchor #bndr-6)", () => {
  const str: EchoType = { kind: "string" };

  it("BNDR-6a: the empty string renders quoted as `\"\"`", () => {
    // bndr-6a: `""` (string) renders as `""`.
    expect(renderEchoValue("", str)).toBe('""');
  });

  it("BNDR-6b: an all-unquoted-predicate string renders unquoted", () => {
    // bndr-6b: `"plain_id-1.2"` (string) renders as `plain_id-1.2`.
    expect(renderEchoValue("plain_id-1.2", str)).toBe("plain_id-1.2");
  });

  it("BNDR-6c: a string containing a space is quoted", () => {
    // bndr-6c: `"has space"` (string) renders as `"has space"`.
    expect(renderEchoValue("has space", str)).toBe('"has space"');
  });

  it("BNDR-6d: a string with an out-of-set ASCII punctuation char is quoted", () => {
    // bndr-6d: `"key=value"` (string) renders as `"key=value"` (`=` is outside
    // the unquoted `[A-Za-z0-9_.-]` set).
    expect(renderEchoValue("key=value", str)).toBe('"key=value"');
  });

  it("BNDR-6e: a quoted string escapes only `\"` and `\\`", () => {
    // bndr-6e: `with "quote" and \slash` (string) renders as
    // `"with \"quote\" and \\slash"` — each `"` → `\"`, each `\` → `\\`.
    expect(renderEchoValue('with "quote" and \\slash', str)).toBe(
      '"with \\"quote\\" and \\\\slash"',
    );
  });

  it("BNDR-6f: a string with a non-ASCII letter is quoted", () => {
    // bndr-6f: `"café"` (string) renders as `"café"` (`é` is outside the
    // unquoted set, forcing quoting; only `"`/`\` are escaped).
    expect(renderEchoValue("café", str)).toBe('"café"');
  });

  it("BNDR-6g: an object renders its first field's value with the `, …` marker", () => {
    // bndr-6g: `Cat { name: "Whiskers", color: "red" }` (schema declares `name`
    // first) renders as `{Whiskers, …}`.
    const catType: EchoType = {
      kind: "object",
      fields: [
        { name: "name", type: str },
        { name: "color", type: str },
      ],
    };
    expect(
      renderEchoValue({ name: "Whiskers", color: "red" }, catType),
    ).toBe("{Whiskers, …}");
  });

  it("BNDR-6h: a discriminated-union variant renders the discriminator first", () => {
    // bndr-6h: `Cat { name: "Whiskers" }` (variant of `Animal = Cat | Dog`;
    // `Cat` declares `kind` before `name`, `kind: "cat"` supplied implicitly)
    // renders as `{cat, …}` — the discriminator is the first declared field.
    const catVariant: EchoType = {
      kind: "object",
      fields: [
        { name: "kind", type: str },
        { name: "name", type: str },
      ],
    };
    expect(
      renderEchoValue({ kind: "cat", name: "Whiskers" }, catVariant),
    ).toBe("{cat, …}");
  });

  it("BNDR-6i: a single-field object still carries the fixed `, …` marker", () => {
    // bndr-6i: `Cat { name: "Whiskers" }` (schema declares only `name`) renders
    // as `{Whiskers, …}` — the `, …` is fixed text, not an elided-field hint.
    const catOne: EchoType = {
      kind: "object",
      fields: [{ name: "name", type: str }],
    };
    expect(renderEchoValue({ name: "Whiskers" }, catOne)).toBe("{Whiskers, …}");
  });

  it("BNDR-6j: an inline anonymous object resolves its first field leftmost", () => {
    // bndr-6j: `{ name: "Whiskers", color: "red" }` (inline
    // `{ name: string, color: string }`) renders as `{Whiskers, …}`.
    const inlineObj: EchoType = {
      kind: "object",
      fields: [
        { name: "name", type: str },
        { name: "color", type: str },
      ],
    };
    expect(
      renderEchoValue({ name: "Whiskers", color: "red" }, inlineObj),
    ).toBe("{Whiskers, …}");
  });

  it("BNDR-6k: an object whose first field is an array renders the array by its own rule", () => {
    // bndr-6k: `Tagged { tags: ["a", "b c"], name: "x" }` (schema declares
    // `tags` first) renders as `{[a, "b c"], …}`.
    const taggedType: EchoType = {
      kind: "object",
      fields: [
        { name: "tags", type: { kind: "array", element: str } },
        { name: "name", type: str },
      ],
    };
    expect(
      renderEchoValue({ tags: ["a", "b c"], name: "x" }, taggedType),
    ).toBe('{[a, "b c"], …}');
  });

  it("BNDR-6l: an object whose first field is an object nests the `{…, …}` form", () => {
    // bndr-6l: `Outer { pet: Cat { name: "Whiskers", color: "red" }, label: "x" }`
    // (schema declares `pet` first; `Cat` declares `name` first) renders as
    // `{{Whiskers, …}, …}`.
    const catType: EchoType = {
      kind: "object",
      fields: [
        { name: "name", type: str },
        { name: "color", type: str },
      ],
    };
    const outerType: EchoType = {
      kind: "object",
      fields: [
        { name: "pet", type: catType },
        { name: "label", type: str },
      ],
    };
    expect(
      renderEchoValue(
        { pet: { name: "Whiskers", color: "red" }, label: "x" },
        outerType,
      ),
    ).toBe("{{Whiskers, …}, …}");
  });

  it("BNDR-6m: an empty array renders as `[]`", () => {
    // bndr-6m: `[]` (array) renders as `[]`.
    expect(renderEchoValue([], { kind: "array", element: str })).toBe("[]");
  });

  it("BNDR-6n: a short array renders in full with per-element quoting", () => {
    // bndr-6n: `["a", "b c"]` (array) renders as `[a, "b c"]` — each element
    // quoted by the same predicate as a top-level string.
    expect(renderEchoValue(["a", "b c"], { kind: "array", element: str })).toBe(
      '[a, "b c"]',
    );
  });

  it("BNDR-6o: an integer renders as canonical base-10 (composes V2d)", () => {
    // bndr-6o: `42` (integer) renders as `42` (BNDR-4 via the shared V2d
    // canonical number renderer).
    expect(renderEchoValue(42, { kind: "integer" })).toBe("42");
  });

  it("BNDR-6p: `-0` renders as `0`", () => {
    // bndr-6p: `-0` (integer or number) renders as `0`.
    expect(renderEchoValue(-0, { kind: "integer" })).toBe("0");
    expect(renderEchoValue(-0, { kind: "number" })).toBe("0");
  });

  it("BNDR-6q: a non-integral number renders shortest fixed-point (composes V2d)", () => {
    // bndr-6q: `3.14` (number) renders as `3.14` (BNDR-5 via the shared V2d
    // canonical number renderer).
    expect(renderEchoValue(3.14, { kind: "number" })).toBe("3.14");
  });

  it("BNDR-6r: a large-magnitude number is expanded to full fixed-point", () => {
    // bndr-6r: `1e21` (number) renders as `1000000000000000000000` — no
    // scientific notation (the forbidden `String(n)` large-magnitude switch).
    expect(renderEchoValue(1e21, { kind: "number" })).toBe(
      "1000000000000000000000",
    );
  });

  it("BNDR-6s: a small-magnitude number is expanded to full fixed-point", () => {
    // bndr-6s: `1e-8` (number) renders as `0.00000001` — no scientific notation
    // (the forbidden `String(n)` small-magnitude switch).
    expect(renderEchoValue(1e-8, { kind: "number" })).toBe("0.00000001");
  });

  it("BNDR-6t: `true` renders as the lowercase literal", () => {
    // bndr-6t: `true` (boolean) renders as `true`.
    expect(renderEchoValue(true, { kind: "boolean" })).toBe("true");
  });

  it("BNDR-6u: `false` renders as the lowercase literal", () => {
    // bndr-6u: `false` (boolean) renders as `false`.
    expect(renderEchoValue(false, { kind: "boolean" })).toBe("false");
  });

  it("BNDR-6v: `null` renders as the lowercase literal", () => {
    // bndr-6v: `null` (null) renders as `null`.
    expect(renderEchoValue(null, { kind: "null" })).toBe("null");
  });

  it("BNDR-6w: an enum whose wire string is unquoted-predicate renders unquoted", () => {
    // bndr-6w: `Severity.High` (enum, RHS `"High"`) renders as `High` — the
    // underlying wire string through the string quote predicate.
    expect(renderEchoValue(makeEnumValue("Severity", "High"), { kind: "enum" })).toBe(
      "High",
    );
  });

  it("BNDR-6x: an enum whose wire string contains a space is quoted", () => {
    // bndr-6x: `Severity.NeedsReview` (enum, RHS `"needs review"`) renders as
    // `"needs review"` — the underlying wire string through the quote predicate.
    expect(
      renderEchoValue(makeEnumValue("Severity", "needs review"), { kind: "enum" }),
    ).toBe('"needs review"');
  });
});

// --- Echo `(default)` annotation (§Echo policy / §Defaulting) --------------

describe("V11h-T — echo `(default)` annotation (defaulting-system-note-echo.md, anchor #echo-policy)", () => {
  it("Echo annotation: a field that took its declared default is tagged `(default)`", () => {
    // #echo-policy: `focus_areas=[] (default)` — the tag fires only when the
    // field took its declared default (default-supplied, per §Defaulting's
    // fill-if-absent rule).
    const line = renderArgumentEcho({
      loomName: "demo",
      params: [
        {
          name: "focus_areas",
          value: [],
          type: { kind: "array", element: { kind: "string" } },
          tookDefault: true,
        },
      ],
    });
    expect(line).toBe("Running /demo: focus_areas=[] (default)");
  });

  it("Echo annotation: a binder-supplied value for a defaulted field is rendered untagged", () => {
    // #echo-policy / §Defaulting: a binder-supplied value for a defaulted field
    // is rendered untagged — no `(default)` marker (fill-if-absent preserved the
    // binder value, so it is NOT default-supplied).
    const line = renderArgumentEcho({
      loomName: "demo",
      params: [
        {
          name: "focus_areas",
          value: ["async"],
          type: { kind: "array", element: { kind: "string" } },
          tookDefault: false,
        },
      ],
    });
    expect(line).toBe("Running /demo: focus_areas=[async]");
  });
});
