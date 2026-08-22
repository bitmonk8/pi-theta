import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import {
  checkDiscriminatedUnion,
  type DiscriminatorCandidateField,
  type UnionVariantSchema,
} from "../src/parser/schema-declarations";
import type { SourceRange } from "../src/diagnostics/diagnostic";
import type { SchemaDecl, ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0128 — an explicit `by <field>` clause whose named field RESOLVES in
// every variant but whose type is not a single literal loads with zero
// diagnostics, while the identical variants without the clause are refused
// `theta/parse/missing-discriminator`
// (docs/bugs/0128-non-literal-by-field-loads-silently.md).
//
// THE DEFECT, AT HEAD BEFORE THIS FIX. `checkExplicitDiscriminator`
// (`src/parser/schema-declarations.ts:609`) resolved the author's theta-side
// name per variant and then tested three gates, all of which presuppose a
// literal: `evaluation.anyNested`, `allLiteral && !allString && …` and
// `allLiteral && allString && firstDuplicateValue !== undefined`. For this
// class `presentInAll` is true (`evaluateOccurrences`, `:504`), `anyNested` is
// false (`:505`) and `allLiteral` is false (`:510`) — no occurrence carries a
// literal — so every one of the three pre-fix gates declined and the function
// returned `[]`. No gate tested `allLiteral` on its own; the fix adds exactly
// that gate (`:669`), placed after `anyNested` (`:636`) and before the
// non-string gate (`:675`).
//
// THE SETTLED DISPOSITION THIS FILE ENCODES (bug 0128 §Expected behaviour,
// Reading A; §Fix (b) candidate 1). Detection rule 2
// (docs/spec_topics/schemas.md, §Discriminated unions — "a single **string**
// literal type in every variant … not a literal-union") binds a field a `by`
// clause names, so the declaration is REFUSED, under a newly minted registered
// code `theta/parse/non-literal-discriminator` (severity E, phase parse) whose
// normative *Message* is
//   `discriminator '<field>' on <X> must be a single string-literal type in
//    every variant`.
// The gate fires on `presentInAll && !allLiteral`, placed AFTER the `anyNested`
// gate, so the four neighbouring dispositions are byte-unchanged: an ABSENT
// field stays silent (bug 0046 class 1, `presentInAll === false`), a nested
// occurrence keeps `theta/parse/nested-discriminator`, a non-string literal
// keeps `theta/parse/non-string-discriminator`, a duplicate literal keeps
// `theta/parse/duplicate-discriminator-value`, and the implicit (no-clause)
// path keeps `theta/parse/missing-discriminator` everywhere it fires today.
//
// WHY THIS FILE IS RED AT HEAD, AND FOR WHAT. Two reasons, both intended and
// both cleared by the fix:
//   1. Every cell that asserts the new code observes NO diagnostic at all —
//      the missing gate. The code list is asserted BEFORE the message list in
//      each cell precisely so the red reads "expected
//      [theta/parse/non-literal-discriminator], observed []" rather than a
//      registry lookup failure.
//   2. The registry row does not exist yet. DIAG-4
//      (docs/spec_topics/diagnostics/diagnostic-shape.md) makes the *Message*
//      column normative, so every expected message here is read through
//      `parseRegistry` / `registryMessage` and never copied as prose; the
//      dedicated registry cell below reds by naming the page that must carry
//      the row. The row lands with the fix, in the same commit as the gate
//      (DIAG-2: the registry is closed, an addition is a spec change).
//
// TIER: unit, offline, provider-free, deterministic. Every claim settles inside
// one `parseDoc` call over a source string or one `checkDiscriminatedUnion`
// call over a hand-built declaration, which is the harness bug 0128
// §Reproduction itself used. An integration tier cannot observe the thing under
// assertion more sharply — the exact diagnostic bytes a load produces are fixed
// at the parse boundary — and a live tier would add a stochastic provider
// round-trip to a contract that never reaches a provider (the lowered schema
// carries no discriminator marker: docs/spec_topics/schema-subset.md, Lowering
// Algorithm step 6). `parseDoc` (tests/helpers/e2e-s1.ts:39) is the shipped
// `parseThetaDocument` wrapped in the standard inert `parseDeps` double.
//
// NO SILENT SKIPPING. Every registry lookup asserts its row is defined before
// substituting into it; every `parseDoc` row carries the declaration names it
// captured, and each table cell asserts those names first, so a fixture whose
// declaration vanished (a lexer or capture regression) reds by naming the
// absent schema instead of passing on an empty diagnostic list that reads as a
// clean load. The class-2 cell additionally asserts its own reachability
// precondition (bug 0095's widened schema-field capture, landed in 0.74.0)
// before asserting any disposition.

// ===========================================================================
// The diagnostic oracle — the registry's *Message* column (DIAG-4).
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(
  [
    "code-registry-parse.md",
    "code-registry-load.md",
    "code-registry-runtime.md",
    "code-registry-host.md",
  ]
    .map((page) =>
      readFileSync(
        fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
        "utf8",
      ),
    )
    .join("\n"),
) as RegistryRow[];

/** The code this report mints (bug 0128 §Fix (b) candidate 1). */
const NON_LITERAL = "theta/parse/non-literal-discriminator";

/**
 * The registry row's normative *Message* template for `code`. Definedness is
 * asserted here so a missing or renamed row reds by naming the registry page
 * rather than by a bare `undefined` comparison downstream.
 */
function messageTemplate(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-parse.md must carry the Message row for ${code}`,
  ).toBeDefined();
  return template as string;
}

/** One rendered diagnostic line, `<severity> <code>: <message>`. */
function line(code: string, message: string): string {
  return `error ${code}: ${message}`;
}

/**
 * `theta/parse/non-literal-discriminator` rendered for `field` on `schema`.
 * Both placeholders are already members of the closed placeholder surface —
 * `<field>` is category 5 and `<X>` category 7
 * (docs/spec_topics/diagnostics/placeholder-rendering-b.md) — so the code adds
 * no rendering category.
 */
function nonLiteralDiscriminatorLine(field: string, schema: string): string {
  return line(
    NON_LITERAL,
    messageTemplate(NON_LITERAL).replace("<field>", field).replace("<X>", schema),
  );
}

/** `theta/parse/missing-discriminator` rendered for `schema` — the no-clause column. */
function missingDiscriminatorLine(schema: string): string {
  const code = "theta/parse/missing-discriminator";
  return line(code, messageTemplate(code).replace("<X>", schema));
}

/** `theta/parse/nested-discriminator` rendered for `field` on `schema` (control A11/A12/B4). */
function nestedDiscriminatorLine(field: string, schema: string): string {
  const code = "theta/parse/nested-discriminator";
  return line(code, messageTemplate(code).replace("<field>", field).replace("<X>", schema));
}

/** `theta/parse/non-string-discriminator` rendered for `field` on `schema` (control A14). */
function nonStringDiscriminatorLine(field: string, schema: string, kind: string): string {
  const code = "theta/parse/non-string-discriminator";
  return line(
    code,
    messageTemplate(code)
      .replace("<field>", field)
      .replace("<X>", schema)
      .replace("<kind>", kind),
  );
}

// ===========================================================================
// The load harness.
// ===========================================================================

/** One schema declaration's observable field capture. */
interface CapturedSchema {
  readonly name: string;
  readonly fields: readonly { readonly name: string; readonly typeSource: string }[];
}

/** One `parseDoc` row: its codes, its rendered lines, and what it captured. */
interface LoadRow {
  readonly label: string;
  readonly codes: readonly string[];
  readonly lines: readonly string[];
  readonly schemas: readonly CapturedSchema[];
}

/** The schema declarations a document captured, in source order. */
function capturedSchemas(doc: ThetaDocument): CapturedSchema[] {
  return doc.body.statements
    .filter((s): s is SchemaDecl => s.kind === "schema")
    .map((s) => ({
      name: s.name,
      fields: (s.fields ?? []).map((f) => ({ name: f.name, typeSource: f.typeSource })),
    }));
}

function loadRow(label: string, source: string, path = "bug0128.theta"): LoadRow {
  const doc = parseDoc(source, path);
  return {
    label,
    codes: doc.diagnostics.map((d) => d.code),
    lines: doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    schemas: capturedSchemas(doc),
  };
}

/** A `mode: prompt` theta whose body is `decls` followed by a final value. */
function thetaSrc(decls: string): string {
  return `---\nmode: prompt\n---\n${decls}\nlet a = 1\na`;
}

/** The declarations under test: `Cat`, `Dog`, and `schema Animal [by kind] = Cat | Dog`. */
interface AnimalFixture {
  readonly catKind: string;
  readonly dogKind?: string;
  /** Prefix declarations (an `enum` for the `kind: K` row). */
  readonly prelude?: string;
  /** The full `schema Animal …` head, when the row needs a third arm or `by name`. */
  readonly head?: string;
  readonly by: boolean;
}

function animalSource(f: AnimalFixture): string {
  const head =
    f.head ?? (f.by ? "schema Animal by kind = Cat | Dog" : "schema Animal = Cat | Dog");
  return thetaSrc(
    `${f.prelude ?? ""}schema Cat { kind: ${f.catKind}, name: string }\n` +
      `schema Dog { kind: ${f.dogKind ?? '"dog"'}, name: string }\n${head}`,
  );
}

function animalRow(label: string, f: AnimalFixture): LoadRow {
  return loadRow(label, animalSource(f));
}

/**
 * Assert every row captured exactly the declarations it names, before any
 * disposition is read off it. A vanished declaration produces zero diagnostics
 * on some paths, which is indistinguishable from a clean load unless the
 * capture is asserted separately — this is the precondition, failing loudly.
 */
function expectDeclared(
  rows: readonly LoadRow[],
  names: readonly string[],
): void {
  const mismatched = rows
    .filter((r) => JSON.stringify(r.schemas.map((s) => s.name)) !== JSON.stringify(names))
    .map((r) => [r.label, r.schemas.map((s) => s.name)]);
  expect(
    mismatched,
    `precondition: every fixture must capture exactly the declarations ${JSON.stringify(names)}; a row listed here lost a declaration upstream of the discriminator checkers, so its diagnostic list says nothing about this bug`,
  ).toEqual([]);
}

// ===========================================================================
// Class 1 — the field resolves in every variant and is not a single literal.
// §Reproduction table A1–A10, under the clause and without it.
// ===========================================================================

/** The ten class-1 rows, by their §Reproduction labels. */
const CLASS_1: readonly { readonly label: string; readonly fixture: Omit<AnimalFixture, "by"> }[] =
  [
    { label: "A1 — a literal union in one variant", fixture: { catKind: '"a" | "b"' } },
    {
      label: "A2 — a literal union in both variants",
      fixture: { catKind: '"a" | "b"', dogKind: '"c" | "d"' },
    },
    { label: "A3 — a bare `string` in one variant", fixture: { catKind: "string" } },
    {
      label: "A4 — a bare `string` in both variants",
      fixture: { catKind: "string", dogKind: "string" },
    },
    {
      label: "A5 — a declared `enum` name in both variants",
      fixture: { catKind: "K", dogKind: "K", prelude: "enum K { A, B }\n" },
    },
    {
      label: "A6 — `integer` in both variants",
      fixture: { catKind: "integer", dogKind: "integer" },
    },
    {
      label: "A7 — `array<string>` in both variants",
      fixture: { catKind: "array<string>", dogKind: "array<string>" },
    },
    {
      label: "A9 — a literal union with a `null` arm",
      fixture: { catKind: '"cat" | null' },
    },
  ];

/** A8 — the same class over three arms, so the refusal is not arity-bound. */
function a8Row(by: boolean): LoadRow {
  const head = by
    ? "schema Animal by kind = Cat | Dog | Fish"
    : "schema Animal = Cat | Dog | Fish";
  return loadRow(
    "A8 — a three-arm union",
    thetaSrc(
      `schema Cat { kind: "a" | "b", name: string }\n` +
        `schema Dog { kind: "dog", name: string }\n` +
        `schema Fish { kind: "fish", name: string }\n${head}`,
    ),
  );
}

/**
 * A10 — the wire-renamed spelling. `by kind` names the THETA-SIDE identifier
 * (docs/spec_topics/schemas.md, §Wire-name renaming: the explicit form "accepts
 * the theta-side name — the only name visible in code"), which
 * `thetaNamedFieldInVariant` (`src/parser/schema-declarations.ts:432`)
 * implements, so the rename must not change which field resolves nor what the
 * gate then says about its type.
 */
function a10Row(by: boolean): LoadRow {
  const head = by ? "schema Animal by kind = Cat | Dog" : "schema Animal = Cat | Dog";
  return loadRow(
    'A10 — `kind as "Kind"` in both variants',
    thetaSrc(
      `schema Cat { kind as "Kind": "a" | "b", name: string }\n` +
        `schema Dog { kind as "Kind": "dog", name: string }\n${head}`,
    ),
  );
}

describe("bug 0128 class 1 — an explicit `by` over a resolved non-literal field is refused", () => {
  it("every class-1 spelling draws exactly one `non-literal-discriminator` under `by kind`", () => {
    // The defect, in one table. Each row's variants are two declared
    // object-form schemas, `kind` resolves in every one of them, and its type
    // is not a single literal — the state `evaluateOccurrences` records as
    // `presentInAll && !allLiteral && !anyNested`
    // (src/parser/schema-declarations.ts:504–510) and for which
    // `checkExplicitDiscriminator` has no gate. Measured at HEAD: every row is
    // `[]`.
    const observed: readonly LoadRow[] = [
      ...CLASS_1.map((r) => animalRow(r.label, { ...r.fixture, by: true })),
      a8Row(true),
      a10Row(true),
    ];
    expectDeclared(observed.slice(0, CLASS_1.length), ["Cat", "Dog", "Animal"]);
    expectDeclared([observed[CLASS_1.length] as LoadRow], ["Cat", "Dog", "Fish", "Animal"]);
    expectDeclared([observed[CLASS_1.length + 1] as LoadRow], ["Cat", "Dog", "Animal"]);

    // Codes first, so the red reads as the missing gate rather than as the
    // absent registry row (which the registry cell below owns).
    expect(observed.map((r) => [r.label, r.codes])).toEqual(
      observed.map((r) => [r.label, [NON_LITERAL]]),
    );

    // Then the normative bytes, sourced from the registry (DIAG-4).
    const expectedLine = nonLiteralDiscriminatorLine("kind", "Animal");
    expect(observed.map((r) => [r.label, r.lines])).toEqual(
      observed.map((r) => [r.label, [expectedLine]]),
    );
  });

  it("the same variants without the clause keep `missing-discriminator`, byte-unchanged", () => {
    // The suppression column, and the invariant the fix must not disturb: the
    // implicit path's candidate filter is `presentInAll && allLiteral`
    // (src/parser/schema-declarations.ts:554), so a resolved non-literal field
    // is filtered out and the terminal branch answers
    // `theta/parse/missing-discriminator` (`:599`). Green at HEAD; it is the
    // rejection the clause removes, and the fix adds nothing to this path.
    const observed: readonly LoadRow[] = [
      ...CLASS_1.map((r) => animalRow(r.label, { ...r.fixture, by: false })),
      a8Row(false),
      a10Row(false),
    ];
    expectDeclared(observed.slice(0, CLASS_1.length), ["Cat", "Dog", "Animal"]);
    expectDeclared([observed[CLASS_1.length] as LoadRow], ["Cat", "Dog", "Fish", "Animal"]);
    expectDeclared([observed[CLASS_1.length + 1] as LoadRow], ["Cat", "Dog", "Animal"]);

    expect(observed.map((r) => [r.label, r.codes])).toEqual(
      observed.map((r) => [r.label, ["theta/parse/missing-discriminator"]]),
    );
    const expectedLine = missingDiscriminatorLine("Animal");
    expect(observed.map((r) => [r.label, r.lines])).toEqual(
      observed.map((r) => [r.label, [expectedLine]]),
    );
  });

  it("the `.thetalib` spelling of a class-1 row draws the same code", () => {
    // Declarations are permitted top-level forms in a `.thetalib`, so the same
    // three declarations reach the same checkers with no frontmatter and no
    // trailing `let`. The pair fixes that the disposition is a property of the
    // declaration graph, not of the document kind.
    const withClause = loadRow(
      "thetalib — `by kind` over a literal union",
      `schema Cat { kind: "a" | "b", name: string }\n` +
        `schema Dog { kind: "dog", name: string }\n` +
        `schema Animal by kind = Cat | Dog\n`,
      "bug0128.thetalib",
    );
    const withoutClause = loadRow(
      "thetalib — the same variants, no clause",
      `schema Cat { kind: "a" | "b", name: string }\n` +
        `schema Dog { kind: "dog", name: string }\n` +
        `schema Animal = Cat | Dog\n`,
      "bug0128.thetalib",
    );
    expectDeclared([withClause, withoutClause], ["Cat", "Dog", "Animal"]);

    expect(withClause.codes).toEqual([NON_LITERAL]);
    expect(withoutClause.codes).toEqual(["theta/parse/missing-discriminator"]);
    expect(withClause.lines).toEqual([nonLiteralDiscriminatorLine("kind", "Animal")]);
    expect(withoutClause.lines).toEqual([missingDiscriminatorLine("Animal")]);
  });

  it("F1 — `by name` over a `string` field is refused even though `kind` is a valid discriminator", () => {
    // The row that rules out §Fix (b) candidate 3 (widening
    // `missing-discriminator`'s Trigger): here a shared single-literal
    // discriminator field DOES exist (`kind: "cat"` / `kind: "dog"`), so that
    // code's Message — "<X> is a union of object schemas with no shared
    // single-literal discriminator field" — would be false of the input, and
    // its remedy clause instructs the author to do what they already did. The
    // new code names the field the author actually chose.
    const row = loadRow(
      "F1 — `by name` while `kind` is a valid discriminator",
      thetaSrc(
        `schema Cat { kind: "cat", name: string }\n` +
          `schema Dog { kind: "dog", name: string }\n` +
          `schema Animal by name = Cat | Dog`,
      ),
    );
    expectDeclared([row], ["Cat", "Dog", "Animal"]);
    expect(row.codes).toEqual([NON_LITERAL]);
    expect(row.lines).toEqual([nonLiteralDiscriminatorLine("name", "Animal")]);
  });
});

// ===========================================================================
// The controls A11–A14 — what the fix must NOT move.
// ===========================================================================

describe("bug 0128 controls — the four neighbouring dispositions stay byte-identical", () => {
  it("A11/A12 keep `nested-discriminator`, A13 stays clean, A14 keeps `non-string-discriminator`", () => {
    // The new gate is placed AFTER the `anyNested` gate
    // (src/parser/schema-declarations.ts:636), which is why A11 and A12 keep
    // their present code. A12 is the boundary: `anyNested` is a `.some`
    // (`:505`), so ONE nested occurrence refuses a declaration whose other
    // occurrence is a literal union — a member of class 1 on its own. That
    // asymmetry is bug 0046 §Fix constraint 2's subject and a NON-GOAL here;
    // this cell pins the boundary where it stands so a later `.every` there
    // cannot move A12 into the new code unobserved.
    const a11 = animalRow("A11 — nested in both variants", {
      catKind: '{ type: "x" }',
      dogKind: '{ type: "y" }',
      by: true,
    });
    const a12 = animalRow("A12 — nested in one variant, a literal union in the other", {
      catKind: '{ type: "x" }',
      dogKind: '"a" | "b"',
      by: true,
    });
    const a12NoClause = animalRow("A12' — the same variants, no clause", {
      catKind: '{ type: "x" }',
      dogKind: '"a" | "b"',
      by: false,
    });
    const a13 = animalRow("A13 — a unique string literal per variant", {
      catKind: '"cat"',
      by: true,
    });
    const a14 = animalRow("A14 — an integer literal per variant", {
      catKind: "1",
      dogKind: "2",
      by: true,
    });
    const rows = [a11, a12, a12NoClause, a13, a14];
    expectDeclared(rows, ["Cat", "Dog", "Animal"]);

    expect(rows.map((r) => [r.label, r.codes])).toEqual([
      [a11.label, ["theta/parse/nested-discriminator"]],
      [a12.label, ["theta/parse/nested-discriminator"]],
      [a12NoClause.label, ["theta/parse/missing-discriminator"]],
      [a13.label, []],
      [a14.label, ["theta/parse/non-string-discriminator"]],
    ]);
    expect(rows.map((r) => [r.label, r.lines])).toEqual([
      [a11.label, [nestedDiscriminatorLine("kind", "Animal")]],
      [a12.label, [nestedDiscriminatorLine("kind", "Animal")]],
      [a12NoClause.label, [missingDiscriminatorLine("Animal")]],
      [a13.label, []],
      [a14.label, [nonStringDiscriminatorLine("kind", "Animal", "integer")]],
    ]);
  });

  it("the clean control A13's lowering is untouched by the refusal", () => {
    // docs/spec_topics/schema-subset.md, Lowering Algorithm step 6: detection
    // is a parse-time sanity check and the lowered schema carries no
    // discriminator marker. So a gate added in the checker must move no lowered
    // byte, and A13 — the one class-adjacent row that stays clean — is where
    // that is observable end to end: a `params:` document whose single field is
    // `a: Animal`, read as `$defs`.
    const doc = parseDoc(
      `---\nmode: prompt\nparams:\n  a: Animal\n---\n` +
        `schema Cat { kind: "cat", name: string }\n` +
        `schema Dog { kind: "dog", name: string }\n` +
        `schema Animal by kind = Cat | Dog\nlet b = 1\nb`,
      "bug0128-lowering.theta",
    );
    expect(doc.diagnostics.map((d) => d.code)).toEqual([]);
    const lowered = doc.frontmatter?.params?.loweredSchema;
    expect(
      lowered,
      "precondition: the `params:` block must lower, or there is no lowered document to compare",
    ).toBeDefined();
    expect(JSON.stringify(lowered)).toBe(
      '{"type":"object","properties":{"a":{"$ref":"#/$defs/Animal"}},"required":["a"],' +
        '"additionalProperties":false,"$defs":{' +
        '"Animal":{"anyOf":[{"$ref":"#/$defs/Cat"},{"$ref":"#/$defs/Dog"}]},' +
        '"Cat":{"type":"object","properties":{"kind":{"const":"cat"},"name":{"type":"string"}},' +
        '"required":["kind","name"],"additionalProperties":false},' +
        '"Dog":{"type":"object","properties":{"kind":{"const":"dog"},"name":{"type":"string"}},' +
        '"required":["kind","name"],"additionalProperties":false}}}',
    );
  });
});

// ===========================================================================
// The captured field types, so no row's classification is in doubt.
// §Reproduction's capture table.
// ===========================================================================

describe("bug 0128 — the captured `typeSource` per field spelling", () => {
  it("every field spelling under test captures the source the classifier reads", () => {
    // `parseType` joins token texts with no separator, and
    // `classifyDiscriminatorFieldType`
    // (src/parser/theta-document.ts:6866) reads exactly this string. Pinning
    // the capture beside the dispositions is what stops a later capture change
    // moving a row into or out of the class unobserved: a row could go green
    // for the wrong reason if its field silently stopped being captured as the
    // type the row claims.
    const observed = [
      '"a" | "b"',
      "string",
      "K",
      "integer",
      "array<string>",
      '"cat" | null',
      '{ type: "x" }',
      "{a: integer} | {b: string}",
    ].map((kindType) => {
      const prelude = kindType === "K" ? "enum K { A, B }\n" : "";
      const row = loadRow(
        `capture — kind: ${kindType}`,
        thetaSrc(`${prelude}schema Cat { kind: ${kindType}, name: string }`),
      );
      return [kindType, row.schemas.map((s) => s.fields.map((f) => [f.name, f.typeSource]))];
    });

    expect(observed).toEqual([
      ['"a" | "b"', [[["kind", '"a"|"b"'], ["name", "string"]]]],
      ["string", [[["kind", "string"], ["name", "string"]]]],
      ["K", [[["kind", "K"], ["name", "string"]]]],
      ["integer", [[["kind", "integer"], ["name", "string"]]]],
      ["array<string>", [[["kind", "array<string>"], ["name", "string"]]]],
      ['"cat" | null', [[["kind", '"cat"|null'], ["name", "string"]]]],
      // Since bug 0228's fix an inline object's brace group is a raw slice of
      // the author's own source bytes at a `schema` body field too, so the
      // captured `typeSource` keeps the author's inter-token spacing instead
      // of joining it away.
      ['{ type: "x" }', [[["kind", '{ type: "x" }'], ["name", "string"]]]],
      // The eighth row is the one that moved since bug 0128 was filed: it
      // captured NOTHING at 0.73.0 (bug 0095's destroyed field list), and bug
      // 0095's fix made the capture span the whole `Type ("|" Type)*` extent.
      // That is exactly what makes class 2 below reachable at HEAD. Since bug
      // 0228's fix each brace-group arm additionally keeps the author's own
      // spacing rather than a lossy join.
      [
        "{a: integer} | {b: string}",
        [[["kind", "{a: integer}|{b: string}"], ["name", "string"]]],
      ],
    ]);
  });
});

// ===========================================================================
// Class 2 — a brace-rooted union-typed field, reachable since bug 0095 landed.
// §Reproduction table B1–B5.
// ===========================================================================

describe("bug 0128 class 2 — a brace-rooted union-typed `by` field is the same class", () => {
  it("B1–B3 and B5 draw the new code, and B4 keeps `nested-discriminator`", () => {
    // `{a: X} | {b: Y}` is a `Type "|" Type` over two `ObjectType` arms
    // (docs/spec_topics/grammar.md, §Inline object types), never one nested
    // object, so bug 0096's structural brace guard classifies it `{}` — the
    // same classification `"a" | "b"` already carries. Class 2 therefore
    // converges on class 1 rather than on `nested-discriminator`, which B4
    // keeps as the single-enclosing-group control.
    const b1 = animalRow("B1 — two brace-group arms", {
      catKind: "{a: integer} | {b: string}",
      by: true,
    });
    const b2 = animalRow("B2 — a brace group and a string literal", {
      catKind: '{ type: "x" } | "cat"',
      by: true,
    });
    const b3 = animalRow("B3 — a brace group and a `null` arm", {
      catKind: "{a: integer} | null",
      by: true,
    });
    const b4 = animalRow("B4 — a single enclosing group in both variants", {
      catKind: '{ type: "x" }',
      dogKind: '{ type: "y" }',
      by: true,
    });
    const b5 = animalRow("B5 — the literal-union parity row", {
      catKind: '"a" | "b"',
      by: true,
    });
    const b1NoClause = animalRow("B1' — the same variants, no clause", {
      catKind: "{a: integer} | {b: string}",
      by: false,
    });
    const rows = [b1, b2, b3, b4, b5, b1NoClause];
    expectDeclared(rows, ["Cat", "Dog", "Animal"]);

    // The reachability precondition, asserted rather than assumed: bug 0095's
    // widened schema-field capture (0.74.0) is what lets a brace-rooted union
    // reach the classifier at all. Before it, these rows drew
    // `theta/parse/empty-schema-body` naming `Cat` and captured no fields, and
    // any assertion below would have been scoring the wrong defect.
    expect(
      b1.schemas[0]?.fields.map((f) => [f.name, f.typeSource]),
      "precondition: bug 0095's widened capture must keep `Cat`'s field list, or class 2 never reaches the discriminator checkers",
    ).toEqual([
      // Since bug 0228's fix each brace-group arm is a raw slice of the
      // author's own source bytes, keeping the inter-token space instead of
      // joining it away.
      ["kind", "{a: integer}|{b: string}"],
      ["name", "string"],
    ]);

    expect(rows.map((r) => [r.label, r.codes])).toEqual([
      [b1.label, [NON_LITERAL]],
      [b2.label, [NON_LITERAL]],
      [b3.label, [NON_LITERAL]],
      [b4.label, ["theta/parse/nested-discriminator"]],
      [b5.label, [NON_LITERAL]],
      [b1NoClause.label, ["theta/parse/missing-discriminator"]],
    ]);
    const newLine = nonLiteralDiscriminatorLine("kind", "Animal");
    expect(rows.map((r) => [r.label, r.lines])).toEqual([
      [b1.label, [newLine]],
      [b2.label, [newLine]],
      [b3.label, [newLine]],
      [b4.label, [nestedDiscriminatorLine("kind", "Animal")]],
      [b5.label, [newLine]],
      [b1NoClause.label, [missingDiscriminatorLine("Animal")]],
    ]);
  });
});

// ===========================================================================
// The seam — `checkDiscriminatedUnion`, and the non-goal boundary.
// ===========================================================================

/** A throwaway 1:1–1:2 span for the seam calls. */
function site(): { file: string; range: SourceRange } {
  const range: SourceRange = {
    start: { line: 1, column: 1 },
    end: { line: 1, column: 2 },
  };
  return { file: "bug0128.theta", range };
}

/** The classification shape the classifier produces (schema-declarations.ts:368). */
type FieldClassification = Pick<DiscriminatorCandidateField, "literal" | "nested">;

/**
 * `Cat` and `Dog` as the seam sees them: `Dog.kind` is a single string literal,
 * `name` is a non-literal field in both, and `Cat.kind` carries whichever
 * classification the row is about.
 */
function animalVariants(catKind: FieldClassification): readonly UnionVariantSchema[] {
  return [
    { name: "Cat", fields: [{ name: "kind", ...catKind }, { name: "name" }] },
    {
      name: "Dog",
      fields: [
        { name: "kind", literal: { kind: "string", text: "dog" } },
        { name: "name" },
      ],
    },
  ];
}

function seamLines(catKind: FieldClassification, by: string | undefined): string[] {
  const decl = {
    name: "Animal",
    ...(by !== undefined ? { by } : {}),
    variants: animalVariants(catKind),
  };
  return checkDiscriminatedUnion(decl, site()).map(
    (d) => `${d.severity} ${d.code}: ${d.message}`,
  );
}

function seamCodes(catKind: FieldClassification, by: string | undefined): string[] {
  const decl = {
    name: "Animal",
    ...(by !== undefined ? { by } : {}),
    variants: animalVariants(catKind),
  };
  return checkDiscriminatedUnion(decl, site()).map((d) => d.code);
}

describe("bug 0128 seam — `checkDiscriminatedUnion` on a `{}`-classified field", () => {
  it("a resolved `{}`-classified field under `by kind` draws the new code", () => {
    // The sharpest row in the file: `{}` is the classification every class-1
    // and class-2 field type carries, and the whole disposition is one call.
    // `classifyDiscriminatorFieldType` stays module-private (bug 0096 §Fix
    // forbids a test-only export), so the seam is entered with the
    // classification hand-built, which is what the sibling witness
    // (tests/discriminator-field-classifier-brace-group.test.ts) does too.
    expect(seamCodes({}, "kind")).toEqual([NON_LITERAL]);
    expect(seamLines({}, "kind")).toEqual([nonLiteralDiscriminatorLine("kind", "Animal")]);
  });

  it("an ABSENT `by` field still returns no diagnostic — the bug 0046 boundary", () => {
    // The non-goal, pinned so the fix cannot over-reach into it. The new gate
    // fires on `presentInAll && !allLiteral`
    // (src/parser/schema-declarations.ts:504–510); an explicit `by` naming a
    // field no variant declares has `presentInAll === false` and is bug 0046
    // class 1, whose disposition is undecided and is NOT settled here. A gate
    // written on `!allLiteral` alone would collapse the two classes and red
    // this cell.
    expect(
      seamCodes({}, "colour"),
      "an explicit `by` naming no theta-side field of any variant is bug 0046 class 1 and stays silent",
    ).toEqual([]);
    expect(seamLines({}, "colour")).toEqual([]);
  });

  it("the implicit path is unchanged for the same variants", () => {
    // The clause is the only thing that changes: with no `by`, the same
    // declaration takes `detectImplicitDiscriminator`
    // (src/parser/schema-declarations.ts:548) and its filter drops the
    // non-literal field, so `missing-discriminator` answers. The fix adds no
    // dependency to this path.
    expect(seamCodes({}, undefined)).toEqual(["theta/parse/missing-discriminator"]);
    expect(seamLines({}, undefined)).toEqual([missingDiscriminatorLine("Animal")]);
  });
});

// ===========================================================================
// DIAG-4 — the registry row the fix mints.
// ===========================================================================

describe("bug 0128 registry — the minted code's row", () => {
  it("the parse registry carries the `non-literal-discriminator` row with its normative Message", () => {
    // DIAG-2: the registry is closed, so a new code is a spec change landing in
    // the same commit as its emission site. This cell is the only one that reds
    // on the row's ABSENCE rather than on the missing gate, and it names the
    // page that must carry it. The Message is asserted here — the only place
    // prose appears in this file — because a row that existed with different
    // bytes would otherwise make every message assertion above vacuously
    // agree with whatever the registry says.
    expect(messageTemplate(NON_LITERAL)).toBe(
      "discriminator '<field>' on <X> must be a single string-literal type in every variant",
    );
  });
});
