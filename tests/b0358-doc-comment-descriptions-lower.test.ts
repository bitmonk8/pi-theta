import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { discoverAndComposeFixtures } from "../src/extension/production-composition";
import { canonicalHash, toLoweredJsonValue } from "../src/parser/schema-lowering";
import { parseDoc, errors } from "./helpers/e2e-s1";

// Bug 0358 — the placement-accepted `///` anchors (object/alias/by-form
// `schema`, `enum`) parse clean but their descriptions lower NOWHERE: every
// `$defs` fragment ships with no `description:` key, with zero diagnostics
// (docs/bugs/0358-doc-comment-descriptions-never-lower.md). The join/strip/lower
// seam (`joinDocComment`/`extractDescription`/`lowerDescription`,
// src/parser/descriptions.ts) ships as dead exports no production path calls.
//
// These tests witness the LOWERED BYTES off `frontmatter.params.loweredSchema`
// (the AJV document the binder envelope embeds and the respond-tool schema is
// cut from), per the bug's §Fix constraint 5 ("witness on lowered bytes, not
// seam functions"). They encode §Expected behaviour, not current behaviour.
//
// ADJUDICATION (binding — the fix is A1 + B1 + C, from the premeasure STOP in
// .pi/tmp/fixes/0358-report.md, adjudicated by the parent):
//   A1 — schema-DECL / FIELD / enum-DECL `///` LOWER into the schema's
//        `description` slot; variant `///` and fn `///` are accepted-but-AST-only
//        and lower NOWHERE (the flat enum wire shape
//        `{type:"string",enum:[…]}` has no per-value description slot; the fn
//        carve-out is grammar.md:195, "A `///` description on a `fn` lowers
//        nowhere").
//   B1 — descriptions ENTER the canonical hash: a described schema-DECL fragment
//        hashes differently from its `///`-stripped twin; a variant-`///`
//        difference leaves the lowered fragment (and its hash) identical.
//   C  — the schema-subset keyword vocabulary gains `description` as emitted
//        annotation-metadata (spec-side, not witnessed here).
//
// Descriptions join byte-for-byte with the multi-line dedent
// (descriptions.md:36 §Multi-line, :38 §No transformation): the §Reproduction
// `Req` description is exactly `"line one\n  indented second line\n\nline after
// blank"`.
//
// Per-row RED/GREEN expectation is stated in each cell's comment. At the fork
// (e0586b1c, v0.356.0) the lowering rows (1–6, 8a, 10 schema) are RED because
// no `description` key is emitted anywhere; the control rows (7, 8b, 9, 10
// registration) are GREEN in both eras.

// --- offline readers ---------------------------------------------------------

type Fragment = Record<string, unknown>;

/**
 * Parse a fixture and return its lowered params schema. A fixture that fails to
 * parse clean, or lowers no params schema, is an unmet precondition and FAILS
 * LOUDLY naming the fixture — never an early return that would report success
 * over nothing verified (CLAUDE.md §Testing: no silent skipping).
 */
function loweredSchemaOf(src: string, path: string): Fragment {
  const doc = parseDoc(src, path);
  const errorCodes = errors(doc.diagnostics).map((d) => d.code);
  if (errorCodes.length > 0) {
    throw new Error(
      `unmet precondition: fixture ${path} must parse clean for its lowered ` +
        `bytes to be an honest witness; errors ${JSON.stringify(errorCodes)}`,
    );
  }
  const schema = doc.frontmatter?.params?.loweredSchema;
  if (schema === undefined) {
    throw new Error(
      `unmet precondition: fixture ${path} must lower a params schema for the ` +
        `description slot to be reachable; loweredSchema absent`,
    );
  }
  return schema as Fragment;
}

/** Resolve one `$defs.<name>` fragment, failing loudly when absent. */
function defOf(schema: Fragment, name: string): Fragment {
  const defs = schema["$defs"] as Record<string, Fragment> | undefined;
  const fragment = defs?.[name];
  if (fragment === undefined) {
    throw new Error(`unmet precondition: lowered schema has no $def \`${name}\``);
  }
  return fragment;
}

/** The lowered fragment of one object field, failing loudly when absent. */
function fieldOf(objectFragment: Fragment, field: string): Fragment {
  const properties = objectFragment["properties"] as
    | Record<string, Fragment>
    | undefined;
  const property = properties?.[field];
  if (property === undefined) {
    throw new Error(`unmet precondition: object fragment has no property \`${field}\``);
  }
  return property;
}

/** True iff any `description` key occurs anywhere in the value (deep scan). */
function hasDescriptionKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasDescriptionKey);
  }
  if (value !== null && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (key === "description") {
        return true;
      }
      if (hasDescriptionKey(nested)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Plant one `.theta` under a fresh temp `.pi/theta/` workspace and return the
 * count of runnables `discoverAndComposeFixtures` composes (the registration
 * outcome). Mirrors tests/b0357-doc-comment-field-variant-anchors.test.ts's rig; the
 * inert `pi`/`ctx` doubles and empty-settings plant are the same. `finally`
 * (never `catch`) guarantees teardown.
 */
async function composedRunnableCount(fileName: string, src: string): Promise<number> {
  const workspace = mkdtempSync(join(tmpdir(), "b0358-reg-"));
  try {
    mkdirSync(join(workspace, ".pi", "theta"), { recursive: true });
    writeFileSync(join(workspace, ".pi", "theta", `${fileName}.theta`), src, "utf8");
    writeFileSync(join(workspace, ".pi", "settings.json"), "{}", "utf8");
    const pi = {
      getFlag: (): undefined => undefined,
      getCommands: (): unknown[] => [],
      sendMessage: (): void => {},
      registerCommand: (): void => {},
      registerMessageRenderer: (): void => {},
      registerFlag: (): void => {},
      on: (): void => {},
    } as unknown as ExtensionAPI;
    const ctx = {
      cwd: workspace,
      hasUI: false,
      modelRegistry: { getAvailable: (): readonly unknown[] => [] },
      ui: { notify: (): void => {} },
    } as unknown as ExtensionContext;
    return (await discoverAndComposeFixtures(pi, ctx)).length;
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

// --- fixtures ----------------------------------------------------------------

// The schema + enum described theta driving rows 1, 2, 3, 6. `severity:
// Severity` makes the enum reachable through `params: { req: ReviewRequest }`.
// Otherwise parse-clean (verified via the probe deleted before commit), so an
// exact-value assertion is honest.
const DESCRIBED = `---
mode: prompt
params:
  req: ReviewRequest
---
/// A user submitting a code review request
schema ReviewRequest {
  /// The programming language the code is written in
  language: string,
  severity: Severity,
}

/// Severity classification for a single review finding
enum Severity {
  /// Trivial issues; no immediate action needed
  Low,
  /// Requires attention soon
  Medium,
  /// Immediate action required
  High,
}
let x = 1
x
`;

// Alias-form schema-DECL (grammar.md:195: the alias form "lowers as the
// description of the named type wherever it surfaces in JSON Schema output").
const ALIAS_DESCRIBED = `---
mode: prompt
params:
  choice: Choice
---
/// pick one of the two options
schema Choice = "a" | "b"
let x = 1
x
`;

// The bug §Reproduction multi-line fixture: join + common-leading-whitespace
// dedent + blank line (descriptions.md:36/:38).
const MULTILINE = `---
mode: prompt
params:
  req: Req
---
/// line one
///   indented second line
///
/// line after blank
schema Req {
  language: string,
}
let x = 1
x
`;

// fn `///` control: an accepted-but-AST-only anchor (grammar.md:195). The
// undocumented `Plain` schema carries no `///`, so no description lowers in
// either era; the fn's doc text must reach the lowered schema nowhere.
const FN_CONTROL = `---
mode: prompt
params:
  req: Plain
---
/// human-facing note for a helper that lowers nowhere
fn rate(a: integer): integer { a }

schema Plain {
  language: string,
}
let x = 1
x
`;

// B1 canonical-hash rows. HASH_WITH and HASH_WITHOUT differ ONLY by the
// schema-DECL `///`; the fragment (and its hash) must diverge once descriptions
// lower.
const HASH_WITH = `---
mode: prompt
params:
  req: ReviewRequest
---
/// A user submitting a code review request
schema ReviewRequest {
  language: string,
}
let x = 1
x
`;
const HASH_WITHOUT = `---
mode: prompt
params:
  req: ReviewRequest
---
schema ReviewRequest {
  language: string,
}
let x = 1
x
`;

// VAR_WITH and VAR_WITHOUT differ ONLY by a VARIANT `///`; under A1 the flat
// enum wire shape gains no per-value slot, so the fragment (and its hash) is
// identical in both eras.
const VAR_WITH = `---
mode: prompt
params:
  h: Holder
---
schema Holder {
  s: Sev,
}
enum Sev {
  /// trivial issues; no action needed
  Low,
  High,
}
let x = 1
x
`;
const VAR_WITHOUT = `---
mode: prompt
params:
  h: Holder
---
schema Holder {
  s: Sev,
}
enum Sev {
  Low,
  High,
}
let x = 1
x
`;

// A `///`-free theta: no `description` key may appear anywhere, in either era.
const CLEAN = `---
mode: prompt
params:
  h: Holder
---
schema Holder {
  language: string,
  s: Sev,
}
enum Sev {
  Low,
  High,
}
let x = 1
x
`;

// Row 10 — a no-params described prompt theta (SLSH-1 binder bypass, no
// binder-model requirement) for the registration witness, plus a params-bearing
// twin carrying the identical `///`-documented schema so the lowered bytes are
// offline-visible through the identical parse route the rig runs.
const REGISTER_DESCRIBED = `---
mode: prompt
---
/// A user submitting a code review request
schema ReviewRequest {
  language: string,
}

@\`hi\`
`;
const REGISTER_PARAMS_TWIN = `---
mode: prompt
params:
  req: ReviewRequest
---
/// A user submitting a code review request
schema ReviewRequest {
  language: string,
}
let x = 1
x
`;

// R4 — field `///` on an `array<string>` property and on a named-type (`$ref`)
// property (the flagship example's `focus_areas: array<string>` and
// `author: Author`). The description must land BESIDE the `items`/`$ref` — at
// the property level — not swallow the type node.
const FIELD_COMPOSITE = `---
mode: prompt
params:
  req: Flagship
---
schema Author {
  name: string,
}
schema Flagship {
  /// The areas the review should focus on
  focus_areas: array<string>,
  /// The author of the request
  author: Author,
}
let x = 1
x
`;

// F2 regression A — a single-line object schema `schema A { x: string }` with a
// decl-level `///`. The decl head line IS field `x`'s line; the decl `///` must
// lower to $defs.A.description ONLY, never leaking onto property `x`. RED before
// the F2 fix (the leak attaches the decl text to `x` too), GREEN after.
const DECL_SINGLE_LINE = `---
mode: prompt
params:
  a: A
---
/// The A schema decl
schema A { x: string }
let y = 1
y
`;

// F2 regression B — a `///` above two fields sharing one source line
// (`x: string, y: integer,`). One run reaches ONE anchor: the FIRST field `x`;
// `y`, sharing the line, carries no description. RED before the F2 fix (both
// fields pull the same run), GREEN after.
const SHARED_FIELD_LINE = `---
mode: prompt
params:
  b: B
---
schema B {
  /// shared run above two fields
  x: string, y: integer,
}
let z = 1
z
`;

// ===========================================================================
// Row 1 — schema-DECL description lowers (object form).
// RED at fork ($defs.ReviewRequest.description undefined). GREEN after.
// ===========================================================================
describe("bug 0358 row 1 — schema-DECL description lowers", () => {
  it("RED: $defs.ReviewRequest carries the object-form schema description", () => {
    const schema = loweredSchemaOf(DESCRIBED, "b0358-row1.theta");
    expect(
      defOf(schema, "ReviewRequest")["description"],
      "the schema-DECL `///` must lower to $defs.ReviewRequest.description",
    ).toBe("A user submitting a code review request");
  });
});

// ===========================================================================
// Row 2 — FIELD description lowers.
// RED at fork (properties.language.description undefined). GREEN after.
// ===========================================================================
describe("bug 0358 row 2 — FIELD description lowers", () => {
  it("RED: $defs.ReviewRequest.properties.language carries the field description", () => {
    const schema = loweredSchemaOf(DESCRIBED, "b0358-row2.theta");
    expect(
      fieldOf(defOf(schema, "ReviewRequest"), "language")["description"],
      "the field `///` must lower to the property's description",
    ).toBe("The programming language the code is written in");
  });
});

// ===========================================================================
// Row 3 — enum-DECL description lowers.
// RED at fork ($defs.Severity.description undefined). GREEN after.
// ===========================================================================
describe("bug 0358 row 3 — enum-DECL description lowers", () => {
  it("RED: $defs.Severity carries the enum-DECL description", () => {
    const schema = loweredSchemaOf(DESCRIBED, "b0358-row3.theta");
    expect(
      defOf(schema, "Severity")["description"],
      "the enum-DECL `///` must lower to $defs.Severity.description",
    ).toBe("Severity classification for a single review finding");
  });
});

// ===========================================================================
// Row 4 — alias-form schema-DECL lowers (grammar.md:195).
// RED at fork ($defs.Choice has no description key). GREEN after.
// ===========================================================================
describe("bug 0358 row 4 — alias-form schema-DECL description lowers", () => {
  it("RED: $defs.Choice is the flat enum shape PLUS the description", () => {
    const schema = loweredSchemaOf(ALIAS_DESCRIBED, "b0358-row4.theta");
    expect(defOf(schema, "Choice")).toEqual({
      type: "string",
      enum: ["a", "b"],
      description: "pick one of the two options",
    });
  });
});

// ===========================================================================
// Row 5 — multi-line join + dedent + blank line (bug §Reproduction / §Expected;
// descriptions.md:36 §Multi-line, :38 §No transformation).
// RED at fork ($defs.Req.description undefined). GREEN after.
// ===========================================================================
describe("bug 0358 row 5 — multi-line description joins byte-for-byte", () => {
  it("RED: $defs.Req.description is the joined, dedented, blank-line string", () => {
    const schema = loweredSchemaOf(MULTILINE, "b0358-row5.theta");
    expect(defOf(schema, "Req")["description"]).toBe(
      "line one\n  indented second line\n\nline after blank",
    );
  });
});

// ===========================================================================
// Row 6 — A1 variant honesty: the Severity enum carries the enum-DECL
// description and stays the FLAT wire shape — no `anyOf`, no `oneOf`, no
// per-variant `const`/`description` carrier despite per-variant `///`.
// The description key is RED at fork; the flat-shape / no-carrier part is a
// stability assertion true in both eras. GREEN after.
// ===========================================================================
describe("bug 0358 row 6 — A1: enum lowers flat, enum-DECL description only", () => {
  it("RED (description) / stable (flat shape): $defs.Severity is exactly the flat enum + enum-DECL description", () => {
    const schema = loweredSchemaOf(DESCRIBED, "b0358-row6.theta");
    // Deep-equal to the exact flat object proves BOTH halves at once: the
    // enum-DECL description is present (RED at fork) AND no `anyOf`/`oneOf`/
    // per-variant carrier was introduced for the three variant `///` (A1).
    expect(defOf(schema, "Severity")).toEqual({
      type: "string",
      enum: ["Low", "Medium", "High"],
      description: "Severity classification for a single review finding",
    });
  });
});

// ===========================================================================
// Row 7 — fn AST-only control (grammar.md:195). GREEN both directions.
// ===========================================================================
describe("bug 0358 row 7 — fn `///` lowers nowhere (control)", () => {
  it("CONTROL: a fn `///` parses clean and contributes no schema description", () => {
    const doc = parseDoc(FN_CONTROL, "b0358-row7.theta");
    expect(
      errors(doc.diagnostics).map((d) => d.code),
      "the fn `///` control must parse clean",
    ).toEqual([]);
    const schema = doc.frontmatter?.params?.loweredSchema as Fragment | undefined;
    if (schema === undefined) {
      throw new Error("unmet precondition: the fn control must lower a params schema");
    }
    // fn descriptions lower NOWHERE: no description key, and the fn's doc text
    // reaches the lowered schema nowhere. Green in both eras.
    expect(hasDescriptionKey(schema)).toBe(false);
    expect(JSON.stringify(schema)).not.toContain("human-facing note");
  });
});

// ===========================================================================
// Row 8a — B1: a schema-DECL `///` present-vs-absent → hash DIFFERS.
// RED at fork (identical: description never lowers). GREEN after.
// ===========================================================================
describe("bug 0358 row 8a — B1: schema-DECL description enters the canonical hash", () => {
  it("RED: the described fragment hashes differently from its `///`-stripped twin", () => {
    const withHash = canonicalHash(
      toLoweredJsonValue(defOf(loweredSchemaOf(HASH_WITH, "b0358-row8a-with.theta"), "ReviewRequest")),
    );
    const withoutHash = canonicalHash(
      toLoweredJsonValue(
        defOf(loweredSchemaOf(HASH_WITHOUT, "b0358-row8a-without.theta"), "ReviewRequest"),
      ),
    );
    expect(
      withHash,
      "a lowered description is hashed content; the described fragment must not collide with the stripped one",
    ).not.toBe(withoutHash);
  });
});

// ===========================================================================
// Row 8b — B1 stability: a VARIANT `///` present-vs-absent → hash IDENTICAL.
// GREEN both directions (A1: variant `///` lowers nowhere).
// ===========================================================================
describe("bug 0358 row 8b — B1: a variant `///` does not move the enum hash", () => {
  it("CONTROL: the enum fragment (and its hash) is identical with and without the variant `///`", () => {
    const withFrag = defOf(loweredSchemaOf(VAR_WITH, "b0358-row8b-with.theta"), "Sev");
    const withoutFrag = defOf(loweredSchemaOf(VAR_WITHOUT, "b0358-row8b-without.theta"), "Sev");
    expect(withFrag).toEqual(withoutFrag);
    expect(canonicalHash(toLoweredJsonValue(withFrag))).toBe(
      canonicalHash(toLoweredJsonValue(withoutFrag)),
    );
  });
});

// ===========================================================================
// Row 9 — byte-identity control: a `///`-free theta lowers no description key.
// GREEN both directions.
// ===========================================================================
describe("bug 0358 row 9 — a `///`-free theta lowers no description key", () => {
  it("CONTROL: no `description` key occurs anywhere in the lowered schema", () => {
    const schema = loweredSchemaOf(CLEAN, "b0358-row9.theta");
    expect(
      hasDescriptionKey(schema),
      "a theta with no `///` must lower a description-free schema in both eras",
    ).toBe(false);
  });
});

// ===========================================================================
// Row 10 — registration end-to-end via the composition rig.
//   (a) a described theta REGISTERS (runnable count 1). GREEN both directions
//       (registration is parse-clean after bug 0357; the description is a wiring
//       gap, not a load blocker).
//   (b) the identical parse route (parseDoc, which discoverAndComposeFixtures
//       calls internally) exposes the lowered description on a params-bearing
//       twin. RED at fork, GREEN after.
// NOTE: the true end-to-end witness — that the REGISTERED ThetaFixture's lowered
// schema carries the description — is the LIVE cell, owed separately (the
// offline ThetaFixture does not expose the lowered params schema for a no-params
// theta, so (a)+(b) are the honest offline decomposition; NOT a weakening).
// ===========================================================================
describe("bug 0358 row 10 — a described theta registers and lowers its description", () => {
  it("CONTROL (a): a described theta composes one runnable", async () => {
    expect(
      await composedRunnableCount("b0358-registered", REGISTER_DESCRIBED),
      "a `///`-documented theta must register (the description is a wiring gap, not a load blocker)",
    ).toBe(1);
  });

  it("RED (b): the identical parse route lowers the schema-DECL description", () => {
    const schema = loweredSchemaOf(REGISTER_PARAMS_TWIN, "b0358-row10.theta");
    expect(defOf(schema, "ReviewRequest")["description"]).toBe(
      "A user submitting a code review request",
    );
  });
});

// ===========================================================================
// Row 11 (R4) — a field `///` on a composite property (array / named-type ref)
// lowers BESIDE the `items`/`$ref`, at the property level. RED at fork, GREEN
// after.
// ===========================================================================
describe("bug 0358 row 11 — field description lowers beside array items / $ref", () => {
  it("RED: focus_areas keeps its array shape AND carries the field description", () => {
    const schema = loweredSchemaOf(FIELD_COMPOSITE, "b0358-row11.theta");
    const focusAreas = fieldOf(defOf(schema, "Flagship"), "focus_areas");
    expect(
      focusAreas["description"],
      "the field `///` must lower to the array property's own description",
    ).toBe("The areas the review should focus on");
    // The type node survives beside the description — the description is added
    // to the property VALUE, it does not replace the array shape.
    expect(focusAreas["type"]).toBe("array");
    expect(focusAreas["items"]).toEqual({ type: "string" });
  });

  it("RED: author keeps its $ref AND carries the field description", () => {
    const schema = loweredSchemaOf(FIELD_COMPOSITE, "b0358-row11.theta");
    const author = fieldOf(defOf(schema, "Flagship"), "author");
    expect(
      author["description"],
      "the field `///` must lower beside the named-type $ref",
    ).toBe("The author of the request");
    expect(author["$ref"]).toBe("#/$defs/Author");
  });
});

// ===========================================================================
// Row 12 (F2 regression A) — a single-line schema's decl `///` lowers to the
// DECL only, never leaking onto a field sharing the head line. RED before the
// F2 fix, GREEN after.
// ===========================================================================
describe("bug 0358 row 12 — decl `///` on a single-line schema does not leak onto its field", () => {
  it("F2: $defs.A carries the decl description and property x carries NONE", () => {
    const schema = loweredSchemaOf(DECL_SINGLE_LINE, "b0358-row12.theta");
    expect(
      defOf(schema, "A")["description"],
      "the decl `///` must lower to the schema-DECL description",
    ).toBe("The A schema decl");
    expect(
      fieldOf(defOf(schema, "A"), "x")["description"],
      "the decl `///` must NOT leak onto a field sharing the decl head line",
    ).toBeUndefined();
  });
});

// ===========================================================================
// Row 13 (F2 regression B) — a `///` above two fields on one source line
// attaches to the FIRST field only. RED before the F2 fix, GREEN after.
// ===========================================================================
describe("bug 0358 row 13 — a shared-line `///` attaches to the first field only", () => {
  it("F2: property x carries the run, property y (same line) carries NONE", () => {
    const schema = loweredSchemaOf(SHARED_FIELD_LINE, "b0358-row13.theta");
    expect(
      fieldOf(defOf(schema, "B"), "x")["description"],
      "the run sits immediately above the first field on the shared line",
    ).toBe("shared run above two fields");
    expect(
      fieldOf(defOf(schema, "B"), "y")["description"],
      "a second field sharing the source line must not re-consume the run",
    ).toBeUndefined();
  });
});
