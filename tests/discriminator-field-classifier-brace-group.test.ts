import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import { isSingleEnclosingBraceGroup } from "../src/parser/body-type-lowering";
import { splitTopLevel } from "../src/parser/params";
import {
  checkDiscriminatedUnion,
  type DiscriminatorCandidateField,
  type UnionVariantSchema,
} from "../src/parser/schema-declarations";
import type { SourceRange } from "../src/diagnostics/diagnostic";
import type { SchemaDecl, ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0096 — `classifyDiscriminatorFieldType` guards its nested-object arm with
// a positional brace test, ordered ahead of its own top-level-`|` split, so a
// union whose FIRST and LAST arms are brace groups classifies as one nested
// object instead of a union of arms
// (docs/bugs/0096-discriminator-field-classifier-naive-brace-test.md).
//
// THE DEFECT. A two-ended `s.startsWith("{") && s.endsWith("}")` over the
// trimmed `SchemaFieldSource.typeSource` returns `{ nested: true }` with no
// check that the `{` at index 0 is closed by the `}` at the final index. The
// first arm of `{a: X} | {b: Y}` opens the source and the last arm closes it,
// so the test answers yes and the top-level-`|` split after it — the arm that owes
// such a source `{}` — is never reached. `{a: X} | {b: Y}` is a `Type "|" Type`
// over two `ObjectType` arms (docs/spec_topics/grammar.md:94 over `:101`), and
// a union is not a discriminator candidate: docs/spec_topics/schemas.md:104
// (detection rule 2) requires "a single **string** literal type in every
// variant … not a literal-union", the rule the split implements.
//
// THE FIX THIS FILE PINS. Substitute the exported structural predicate
// `isSingleEnclosingBraceGroup` (`src/parser/body-type-lowering.ts:208`, whose
// own first statement at `:209` IS the naive test) for the naive expression at
// the one site. The brace test keeps running FIRST, so a single enclosing group
// whose interior carries a union (`{ type: "x" | "y" }`) still reports nested.
//
// TWO MASKS, HENCE AN INVARIANCE WITNESS RATHER THAN A RED ONE.
//   UPSTREAM — no source on which the two predicates disagree reaches the
//   classifier at HEAD. `parseType`'s leading-brace arm ends a schema-body
//   field capture at the first balanced group, and the residue `| {b: Y}` is
//   not a field name, so `parseSchemaObjectBody`'s recovery discards the whole
//   field list and the load ends on `theta/parse/empty-schema-body` naming the
//   declaration. That capture is bug 0095's subject
//   (docs/bugs/0095-brace-rooted-union-arm-capture-destroys-context.md) and is
//   a NON-GOAL here.
//   DOWNSTREAM — `nested` is read once, as `anyNested`
//   (`src/parser/schema-declarations.ts:497`), itself read once, in the
//   explicit `by <field>` gate at `:620`. `detectImplicitDiscriminator` filters
//   on `presentInAll && allLiteral` (`:541`), so `{ nested: true }` and `{}`
//   are both dropped and the implicit path's output is identical for the two.
// So items 1–3 below assert composition and byte-invariance: every cell is
// GREEN at HEAD and every cell stays green after the substitution. That is the
// claim — the fix is observably neutral at HEAD by design.
//
// WHAT THIS FILE DOES NOT COVER. §Fix's witness item 4 — the end-to-end
// `parseDoc` cell for `Cat { kind: {a: integer} | {b: string}, … }` under
// `schema Animal by kind = Cat | Dog`, asserting a clean load — belongs to
// whichever change carries bug 0095's widened capture, since that capture is
// what makes the input reachable through `parseDoc` at all. Item 3 below pins
// that cell's CURRENT disposition (`empty-schema-body` naming `Cat`) so the
// carrier of 0095's fix has the before-bytes it is moving.
//
// THE CLASSIFIER STAYS MODULE-PRIVATE. `classifyDiscriminatorFieldType`
// (`src/parser/theta-document.ts`) is not exported and §Fix forbids
// exporting it for a test, so item 1's classification columns are COMPOSED from
// the two exported production units the fix wires together —
// `isSingleEnclosingBraceGroup` and `splitTopLevel` (`src/parser/params.ts:932`)
// — by `classifyWith` below. The classifications of every source reachable
// through `parseDoc` are pinned by item 3 against the shipped load path, and
// the crossing set's classifications by the inherited item 4.
//
// TIER: unit, offline, provider-free, deterministic. Every claim settles inside
// one function call — a predicate over a string, `checkDiscriminatedUnion` over
// a hand-built declaration, or `parseThetaDocument` over a source string. An
// integration or live tier can observe neither of the two things under
// assertion: the answer a pure predicate gives a string, and the exact
// diagnostic bytes a load produces. A provider round-trip would add stochastic
// surface to a contract fully determined at the parse boundary. `parseDoc`
// (tests/helpers/e2e-s1.ts:39) is the shipped load path wrapped in the standard
// inert `parseDeps` double, and is the harness the bug doc's own §Reproduction
// used.
//
// NO SILENT SKIPPING: every registry lookup asserts its row is defined before
// substituting into it, and every `parseDoc` row asserts the declarations it
// found by name, so an absent registry row or a vanished declaration reds by
// naming the unmet precondition rather than by comparing against `undefined`.

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
 * `theta/parse/nested-discriminator` rendered for `field` on `schema`
 * (code-registry-parse.md:98). This is the whole observable surface of the
 * misclassification: the only reader of `anyNested`
 * (src/parser/schema-declarations.ts:620) emits exactly this.
 */
function nestedDiscriminatorLine(field: string, schema: string): string {
  const code = "theta/parse/nested-discriminator";
  return line(
    code,
    messageTemplate(code).replace("<field>", field).replace("<X>", schema),
  );
}

/**
 * `theta/parse/missing-discriminator` rendered for `schema`
 * (code-registry-parse.md:96). The template's own `'by <field>'` remedy clause
 * is left verbatim — only the `<X>` placeholder is a substitution site.
 */
function missingDiscriminatorLine(schema: string): string {
  const code = "theta/parse/missing-discriminator";
  return line(code, messageTemplate(code).replace("<X>", schema));
}

/**
 * `theta/parse/empty-schema-body` rendered for `subject`
 * (code-registry-parse.md:86). The row covers both spellings item 3 observes:
 * a declaration whose field list was discarded (`subject` is the declaration's
 * name) and an empty inline object type in a `Type` position (`subject` is
 * `{}`).
 */
function emptySchemaBodyLine(subject: string): string {
  const code = "theta/parse/empty-schema-body";
  return line(code, messageTemplate(code).replace("<X>", subject));
}

/**
 * `theta/parse/unsupported-feature` rendered for the `<construct>` tail
 * `schema fields must be comma-separated` (code-registry-parse.md:27) — the
 * boundary `parseSchemaObjectBody` raises when a captured field type is
 * directly followed by the start of another field with no intervening `,`.
 * Item 3's one comma-missing row draws this instead of `empty-schema-body`:
 * neither arm of its brace-rooted union is itself an empty inline object, so
 * 0045's rule has no subject on that row.
 */
function commaSeparatedFieldsLine(): string {
  const code = "theta/parse/unsupported-feature";
  return line(
    code,
    messageTemplate(code).replace("<construct>", "schema fields must be comma-separated"),
  );
}

// ===========================================================================
// Item 1 — the predicate pair, and the classification the guarded arm selects.
// ===========================================================================

/** The classification shape the guarded arm produces (schema-declarations.ts:362). */
type FieldClassification = Pick<DiscriminatorCandidateField, "literal" | "nested">;

/** A brace-rootedness test over an already-trimmed type source. */
type BraceGuard = (s: string) => boolean;

/**
 * The two-ended brace test the structural predicate replaces: a `{` at
 * index 0 and a `}` at the last index, with no check that the two are the same
 * group. Two string operations, so a copy is the whole of it — there is no
 * production unit to import for this column, and the substitution's before-side
 * is precisely what this expression answers.
 */
function naiveBraceTest(s: string): boolean {
  return s.startsWith("{") && s.endsWith("}");
}

/**
 * The guarded arm's classification, COMPOSED from the two exported production
 * units the fix wires together, with the brace guard as the only parameter.
 *
 * This exists because `classifyDiscriminatorFieldType`
 * (`src/parser/theta-document.ts`) is module-private and §Fix's own
 * constraint keeps it so: no test-only export is added for it. So this helper
 * is NOT production — it is the two production predicates
 * (`isSingleEnclosingBraceGroup`, `splitTopLevel`) assembled in the production
 * order, with the literal arms mirrored, so that swapping ONE argument moves
 * the before-column to the after-column and nothing else can differ between
 * them. The classifications production actually reaches are pinned end to end
 * by item 3 through `parseDoc`; the crossing set's are pinned by §Fix's witness
 * item 4, inherited by the carrier of bug 0095's widened capture.
 *
 * The split runs with `splitTopLevel`'s DEFAULT `"angle"` nesting, as the
 * production call does: braces are not tracked there, which is why the brace
 * guard must be asked first for `{ type: "x" | "y" }` to keep reporting nested.
 */
function classifyWith(guard: BraceGuard, typeSource: string): FieldClassification {
  const s = typeSource.trim();
  if (guard(s)) {
    return { nested: true };
  }
  if (splitTopLevel(s, "|").length > 1) {
    return {};
  }
  if (
    s.length >= 2 &&
    ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
  ) {
    return { literal: { kind: "string", text: s.slice(1, -1) } };
  }
  if (s === "true" || s === "false") {
    return { literal: { kind: "boolean", text: s } };
  }
  if (s === "null") {
    return { literal: { kind: "null", text: s } };
  }
  if (/^-?\d+\.\d+$/.test(s)) {
    return { literal: { kind: "number", text: s } };
  }
  if (/^-?\d+$/.test(s)) {
    return { literal: { kind: "integer", text: s } };
  }
  return {};
}

/** One row of the predicate table. Classifications are JSON bytes, not shapes. */
interface PredicateRow {
  readonly source: string;
  readonly naive: boolean;
  readonly singleEnclosingBraceGroup: boolean;
  readonly naiveClassification: string;
  readonly structuralClassification: string;
}

/**
 * §Reproduction table A's nine sources plus four further members of the
 * crossing set §Fix enumerates (`{}|{}`, a union whose arms carry interior
 * unions) and of the single-group control set (`{a: {b: integer}}`, a brace
 * inside a string literal).
 */
const PREDICATE_SOURCES: readonly string[] = [
  "{a: integer} | {b: string}",
  "{a: integer}|{b: string}",
  '{ type: "x" | "y" }',
  "{a: integer}",
  "{}",
  '"a" | "b"',
  '"cat"',
  "{a: integer} | {b: string} | integer",
  "integer | {b: string}",
  "{}|{}",
  "{a:string|null}|{b:Cat}",
  "{a: {b: integer}}",
  '{a: "}"}',
];

/** The observed row for one source, both predicates and both classifications. */
function predicateRow(source: string): PredicateRow {
  const s = source.trim();
  return {
    source,
    naive: naiveBraceTest(s),
    singleEnclosingBraceGroup: isSingleEnclosingBraceGroup(s),
    naiveClassification: JSON.stringify(classifyWith(naiveBraceTest, source)),
    structuralClassification: JSON.stringify(
      classifyWith(isSingleEnclosingBraceGroup, source),
    ),
  };
}

const PREDICATE_TABLE: readonly PredicateRow[] = PREDICATE_SOURCES.map(predicateRow);

/** The sources the substitution moves: naive says brace-rooted, structural declines. */
const CROSSING_SET: readonly string[] = [
  "{a: integer} | {b: string}",
  "{a: integer}|{b: string}",
  "{}|{}",
  "{a:string|null}|{b:Cat}",
];

describe("bug 0096 item 1 — the brace predicate pair and the classification it guards", () => {
  it("every source's naive answer, structural answer and both classifications are byte-exact", () => {
    // One `toEqual` over the whole table so a moved cell names its own source
    // rather than surfacing as a count mismatch.
    expect(PREDICATE_TABLE).toEqual([
      {
        source: "{a: integer} | {b: string}",
        naive: true,
        singleEnclosingBraceGroup: false,
        naiveClassification: '{"nested":true}',
        structuralClassification: "{}",
      },
      {
        source: "{a: integer}|{b: string}",
        naive: true,
        singleEnclosingBraceGroup: false,
        naiveClassification: '{"nested":true}',
        structuralClassification: "{}",
      },
      {
        source: '{ type: "x" | "y" }',
        naive: true,
        singleEnclosingBraceGroup: true,
        naiveClassification: '{"nested":true}',
        structuralClassification: '{"nested":true}',
      },
      {
        source: "{a: integer}",
        naive: true,
        singleEnclosingBraceGroup: true,
        naiveClassification: '{"nested":true}',
        structuralClassification: '{"nested":true}',
      },
      {
        source: "{}",
        naive: true,
        singleEnclosingBraceGroup: true,
        naiveClassification: '{"nested":true}',
        structuralClassification: '{"nested":true}',
      },
      {
        source: '"a" | "b"',
        naive: false,
        singleEnclosingBraceGroup: false,
        naiveClassification: "{}",
        structuralClassification: "{}",
      },
      {
        source: '"cat"',
        naive: false,
        singleEnclosingBraceGroup: false,
        naiveClassification: '{"literal":{"kind":"string","text":"cat"}}',
        structuralClassification: '{"literal":{"kind":"string","text":"cat"}}',
      },
      {
        source: "{a: integer} | {b: string} | integer",
        naive: false,
        singleEnclosingBraceGroup: false,
        naiveClassification: "{}",
        structuralClassification: "{}",
      },
      {
        source: "integer | {b: string}",
        naive: false,
        singleEnclosingBraceGroup: false,
        naiveClassification: "{}",
        structuralClassification: "{}",
      },
      {
        source: "{}|{}",
        naive: true,
        singleEnclosingBraceGroup: false,
        naiveClassification: '{"nested":true}',
        structuralClassification: "{}",
      },
      {
        source: "{a:string|null}|{b:Cat}",
        naive: true,
        singleEnclosingBraceGroup: false,
        naiveClassification: '{"nested":true}',
        structuralClassification: "{}",
      },
      {
        source: "{a: {b: integer}}",
        naive: true,
        singleEnclosingBraceGroup: true,
        naiveClassification: '{"nested":true}',
        structuralClassification: '{"nested":true}',
      },
      {
        source: '{a: "}"}',
        naive: true,
        singleEnclosingBraceGroup: true,
        naiveClassification: '{"nested":true}',
        structuralClassification: '{"nested":true}',
      },
    ]);
  });

  it("the substitution is a strict refinement: structural implies naive at every source", () => {
    // `isSingleEnclosingBraceGroup`'s own first statement
    // (src/parser/body-type-lowering.ts:209) is the naive test, so the
    // implication holds by construction. Asserting it is what makes "no source
    // that already reached the `|` split changes route" executable rather than
    // a claim about the predicate's body. The violating rows are collected so a
    // regression names its source.
    const violations = PREDICATE_TABLE.filter(
      (r) => r.singleEnclosingBraceGroup && !r.naive,
    ).map((r) => r.source);
    expect(
      violations,
      "a source the structural predicate accepts and the naive test rejects would make the substitution a WIDENING, not a refinement",
    ).toEqual([]);
  });

  it("the crossing set is exactly the naive-true / structural-false sources", () => {
    const crossing = PREDICATE_TABLE.filter(
      (r) => r.naive && !r.singleEnclosingBraceGroup,
    ).map((r) => r.source);
    expect(crossing).toEqual(CROSSING_SET);
  });

  it("every crossing source moves nested -> neither, and every other source is byte-unchanged", () => {
    // The two halves of §Fix's blast-radius claim, each asserted as a whole
    // list so a member that moved the wrong way names itself.
    const crossingRows = PREDICATE_TABLE.filter((r) => CROSSING_SET.includes(r.source));
    expect(
      crossingRows.map((r) => [r.source, r.naiveClassification, r.structuralClassification]),
    ).toEqual([
      ["{a: integer} | {b: string}", '{"nested":true}', "{}"],
      ["{a: integer}|{b: string}", '{"nested":true}', "{}"],
      ["{}|{}", '{"nested":true}', "{}"],
      ["{a:string|null}|{b:Cat}", '{"nested":true}', "{}"],
    ]);

    const moved = PREDICATE_TABLE.filter(
      (r) =>
        !CROSSING_SET.includes(r.source) &&
        r.naiveClassification !== r.structuralClassification,
    ).map((r) => [r.source, r.naiveClassification, r.structuralClassification]);
    expect(
      moved,
      "a non-crossing source whose classification moved would break §Fix's byte-invariance constraint",
    ).toEqual([]);
  });

  it("a single enclosing brace group keeps reporting nested even when its interior carries a union", () => {
    // The ordering requirement the classifier's doc comment records: the brace
    // guard runs BEFORE the top-level-`|` split. `splitTopLevel`'s default
    // nesting does not track braces, so this source splits into two segments —
    // a fix that reordered the arms would classify it `{}` and stop raising
    // `nested-discriminator` for a genuinely nested discriminator.
    expect(splitTopLevel('{ type: "x" | "y" }', "|")).toEqual(['{ type: "x"', '"y" }']);
    expect(JSON.stringify(classifyWith(isSingleEnclosingBraceGroup, '{ type: "x" | "y" }'))).toBe(
      '{"nested":true}',
    );
  });
});

// ===========================================================================
// Item 2 — the seam, both directions (§Reproduction table E).
// ===========================================================================

/** A throwaway 1:1–1:2 span for the seam calls. */
function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

/** A located site at the throwaway span. */
function site(): { file: string; range: SourceRange } {
  return { file: "test.theta", range: span() };
}

/**
 * `Cat` and `Dog` as `schema Cat { kind: <under test>, name: string }` /
 * `schema Dog { kind: "dog", name: string }` reach
 * `checkDiscriminatedUnion`: `name` is a non-literal field in both variants,
 * `Dog.kind` is a single string literal, and `Cat.kind` carries whichever
 * classification the two predicates produce.
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

/** Every diagnostic the seam raised, rendered `<severity> <code>: <message>`. */
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

describe("bug 0096 item 2 — what each classification costs at the discriminator seam", () => {
  it("the explicit `by kind` path distinguishes the two classifications, and only there", () => {
    // The defect's whole reach, both directions in one cell: the wrong answer
    // refuses the declaration, the right answer raises nothing. `{}` is what
    // `{a: X} | {b: Y}` is owed (grammar.md:94 over `:101`; schemas.md:104),
    // and under it `checkExplicitDiscriminator`'s three gates are all vacuous.
    expect(seamLines({ nested: true }, "kind")).toEqual([
      nestedDiscriminatorLine("kind", "Animal"),
    ]);
    expect(
      seamLines({}, "kind"),
      "a union-typed `by` field is not a discriminator candidate, so no gate fires and the declaration loads clean",
    ).toEqual([]);
  });

  it("the implicit path's output is identical under both classifications", () => {
    // The downstream mask, pinned. `detectImplicitDiscriminator` filters on
    // `presentInAll && allLiteral` (src/parser/schema-declarations.ts:541) and
    // reads no other property of a non-literal field, so both classifications
    // land on the same terminal branch. Pinning the two lists EQUAL to each
    // other, and not merely equal to the expected bytes, is what stops a later
    // change to the implicit path widening the defect's reach unobserved.
    const nested = seamLines({ nested: true }, undefined);
    const neither = seamLines({}, undefined);
    expect(nested).toEqual([missingDiscriminatorLine("Animal")]);
    expect(
      neither,
      "the implicit path must not acquire a dependency on `nested`",
    ).toEqual(nested);
  });
});

// ===========================================================================
// Item 3 — the schema-field position and the end-to-end load, byte-invariant
// (§Reproduction tables B, C row 2, D and G).
// ===========================================================================

/** A `mode: prompt` theta whose body is `decls` followed by a final value. */
function thetaSrc(decls: string): string {
  return `---\nmode: prompt\n---\n${decls}\nlet a = 1\na`;
}

/** One schema declaration's observable field capture. */
interface CapturedSchema {
  readonly name: string;
  readonly fields: readonly { readonly name: string; readonly typeSource: string }[];
}

/** One `parseDoc` row: the rendered diagnostic list and every captured field. */
interface LoadRow {
  readonly label: string;
  readonly diagnostics: readonly string[];
  readonly schemas: readonly CapturedSchema[];
}

/** The declarations a document captured, in source order. */
function capturedSchemas(doc: ThetaDocument): CapturedSchema[] {
  return doc.body.statements
    .filter((s): s is SchemaDecl => s.kind === "schema")
    .map((s) => ({
      name: s.name,
      fields: (s.fields ?? []).map((f) => ({ name: f.name, typeSource: f.typeSource })),
    }));
}

/**
 * Load one fixture through the shipped front end and read back both cells the
 * substitution must not move. The declaration names travel in the row, so a
 * fixture whose declaration vanished reds by naming the absent schema rather
 * than by an empty field list that reads as a legitimate discard.
 */
function loadRow(label: string, source: string, path = "bug0096.theta"): LoadRow {
  const doc = parseDoc(source, path);
  return {
    label,
    diagnostics: doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    schemas: capturedSchemas(doc),
  };
}

/** `Cat` alone, with `kind` typed `kindType`. */
function catOnly(label: string, kindType: string): LoadRow {
  return loadRow(label, thetaSrc(`schema Cat { kind: ${kindType}, name: string }`));
}

/** `Cat` + `Dog` + `schema Animal [by kind] = Cat | Dog`. */
function animalDoc(label: string, kindType: string, by: boolean): LoadRow {
  const head = by ? "schema Animal by kind = Cat | Dog" : "schema Animal = Cat | Dog";
  return loadRow(
    label,
    thetaSrc(
      `schema Cat { kind: ${kindType}, name: string }\nschema Dog { kind: "dog", name: string }\n${head}`,
    ),
  );
}

/** `schema Dog { kind: "dog", name: string }` as captured. */
const DOG_CAPTURED: CapturedSchema = {
  name: "Dog",
  fields: [
    { name: "kind", typeSource: '"dog"' },
    { name: "name", typeSource: "string" },
  ],
};

/** `schema Animal … = Cat | Dog` as captured: a union form carries no fields. */
const ANIMAL_CAPTURED: CapturedSchema = { name: "Animal", fields: [] };

/** `Cat` with `kind` captured as `catKind`, then `Dog` and `Animal`. */
function catDogAnimal(catKind: string): readonly CapturedSchema[] {
  return [
    {
      name: "Cat",
      fields: [
        { name: "kind", typeSource: catKind },
        { name: "name", typeSource: "string" },
      ],
    },
    DOG_CAPTURED,
    ANIMAL_CAPTURED,
  ];
}

describe("bug 0096 item 3 — the schema-field position's dispositions are byte-invariant", () => {
  it("every brace-adjacent field-type spelling keeps its diagnostics and its capture", () => {
    // §Reproduction tables B, G and C row 2. The five union spellings and the
    // two `| null` spellings now keep their field list: `parseType`'s
    // arm-start `{` branch (bug 0095 §Fix) consumes the whole
    // `Type ("|" Type)*` extent instead of stopping at the first balanced
    // group, so the residue that used to defeat the field-name test never
    // forms. The one row with no comma before `name` draws
    // `schema fields must be comma-separated` instead of `empty-schema-body`:
    // neither arm of its union is itself an empty inline object, so 0045's
    // rule has no subject on that row.
    const observed: readonly LoadRow[] = [
      catOnly("B row 1 — two brace-group arms", "{a: integer} | {b: string}"),
      loadRow(
        "B row 1 — the multi-line spelling",
        thetaSrc("schema Cat { kind: {a: integer}\n | {b: string},\n name: string }"),
      ),
      loadRow(
        "B row 1 — no comma before `name`",
        thetaSrc("schema Cat { kind: {a: integer} | {b: string} name: string }"),
      ),
      loadRow(
        "B row 1 — the union field written last",
        thetaSrc("schema Cat { name: string, kind: {a: integer} | {b: string} }"),
      ),
      loadRow(
        "B row 1 — wire-renamed",
        thetaSrc('schema Cat { kind as "Kind": {a: integer} | {b: string}, name: string }'),
      ),
      loadRow(
        "B row 1 — the same declaration in a .thetalib, no frontmatter",
        "schema Cat { kind: {a: integer} | {b: string}, name: string }\n",
        "bug0096.thetalib",
      ),
      catOnly("G row 2 — a trailing `| null` arm", "{a: integer} | null"),
      catOnly("G row 3 — a leading `null |` arm", "null | {a: integer}"),
      catOnly("B — a single enclosing group", '{ type: "x" }'),
      catOnly("B — a single enclosing group with an interior union", '{ type: "x" | "y" }'),
      catOnly("B — a literal union", '"a" | "b"'),
      loadRow(
        "C row 2 — the group closed on the next line",
        thetaSrc("schema Cat { kind: {a: integer\n}, name: string }"),
      ),
      catOnly("C row 4 — a nested group", "{a: {b: integer}}"),
      catOnly("C row 5 — a brace inside a string literal", '{a: "}"}'),
      catOnly("B — an empty inline object type", "{}"),
    ];

    expect(observed).toEqual([
      {
        label: "B row 1 — two brace-group arms",
        diagnostics: [],
        schemas: [
          {
            name: "Cat",
            fields: [
              { name: "kind", typeSource: "{a:integer}|{b:string}" },
              { name: "name", typeSource: "string" },
            ],
          },
        ],
      },
      {
        label: "B row 1 — the multi-line spelling",
        diagnostics: [],
        schemas: [
          {
            name: "Cat",
            fields: [
              { name: "kind", typeSource: "{a:integer}|{b:string}" },
              { name: "name", typeSource: "string" },
            ],
          },
        ],
      },
      {
        label: "B row 1 — no comma before `name`",
        diagnostics: [commaSeparatedFieldsLine()],
        schemas: [
          {
            name: "Cat",
            fields: [
              { name: "kind", typeSource: "{a:integer}|{b:string}" },
              { name: "name", typeSource: "string" },
            ],
          },
        ],
      },
      {
        label: "B row 1 — the union field written last",
        diagnostics: [],
        schemas: [
          {
            name: "Cat",
            fields: [
              { name: "name", typeSource: "string" },
              { name: "kind", typeSource: "{a:integer}|{b:string}" },
            ],
          },
        ],
      },
      {
        label: "B row 1 — wire-renamed",
        diagnostics: [],
        schemas: [
          {
            name: "Cat",
            fields: [
              { name: "kind", typeSource: "{a:integer}|{b:string}" },
              { name: "name", typeSource: "string" },
            ],
          },
        ],
      },
      {
        label: "B row 1 — the same declaration in a .thetalib, no frontmatter",
        diagnostics: [],
        schemas: [
          {
            name: "Cat",
            fields: [
              { name: "kind", typeSource: "{a:integer}|{b:string}" },
              { name: "name", typeSource: "string" },
            ],
          },
        ],
      },
      {
        label: "G row 2 — a trailing `| null` arm",
        diagnostics: [],
        schemas: [
          {
            name: "Cat",
            fields: [
              { name: "kind", typeSource: "{a:integer}|null" },
              { name: "name", typeSource: "string" },
            ],
          },
        ],
      },
      {
        label: "G row 3 — a leading `null |` arm",
        diagnostics: [],
        schemas: [
          {
            name: "Cat",
            fields: [
              { name: "kind", typeSource: "null|{a:integer}" },
              { name: "name", typeSource: "string" },
            ],
          },
        ],
      },
      {
        label: "B — a single enclosing group",
        diagnostics: [],
        schemas: [
          {
            name: "Cat",
            fields: [
              { name: "kind", typeSource: '{type:"x"}' },
              { name: "name", typeSource: "string" },
            ],
          },
        ],
      },
      {
        label: "B — a single enclosing group with an interior union",
        diagnostics: [],
        schemas: [
          {
            name: "Cat",
            fields: [
              { name: "kind", typeSource: '{type:"x"|"y"}' },
              { name: "name", typeSource: "string" },
            ],
          },
        ],
      },
      {
        label: "B — a literal union",
        diagnostics: [],
        schemas: [
          {
            name: "Cat",
            fields: [
              { name: "kind", typeSource: '"a"|"b"' },
              { name: "name", typeSource: "string" },
            ],
          },
        ],
      },
      {
        label: "C row 2 — the group closed on the next line",
        diagnostics: [],
        schemas: [
          {
            name: "Cat",
            fields: [
              { name: "kind", typeSource: "{a:integer}" },
              { name: "name", typeSource: "string" },
            ],
          },
        ],
      },
      {
        label: "C row 4 — a nested group",
        diagnostics: [],
        schemas: [
          {
            name: "Cat",
            fields: [
              { name: "kind", typeSource: "{a:{b:integer}}" },
              { name: "name", typeSource: "string" },
            ],
          },
        ],
      },
      {
        label: "C row 5 — a brace inside a string literal",
        diagnostics: [],
        schemas: [
          {
            name: "Cat",
            fields: [
              { name: "kind", typeSource: '{a:"}"}' },
              { name: "name", typeSource: "string" },
            ],
          },
        ],
      },
      {
        // An empty inline object type in a `Type` position draws
        // `empty-schema-body` naming `{}` — the second half of that row's
        // Trigger (code-registry-parse.md:86), independent of this fix and
        // pinned as it stands, since `{}` is a single enclosing group under
        // both predicates and keeps `{ nested: true }`.
        label: "B — an empty inline object type",
        diagnostics: [emptySchemaBodyLine("{}")],
        schemas: [
          {
            name: "Cat",
            fields: [
              { name: "kind", typeSource: "{}" },
              { name: "name", typeSource: "string" },
            ],
          },
        ],
      },
    ]);
  });

  it("the end-to-end load under `by kind` and under implicit detection is byte-invariant", () => {
    // §Reproduction table D, both dispatch arms. The union row now reaches
    // the classifier: bug 0095 §Fix keeps `Cat`'s field list, so
    // `objectFields` carries `Cat` and `buildUnionVariantSchemas` resolves the
    // union. `classifyDiscriminatorFieldType` classifies
    // `{a:integer}|{b:string}` as `{}` (0096's structural predicate declines
    // to call two brace ARMS one nested object), so `by kind` loads clean and
    // implicit detection falls through to `missing-discriminator` the same
    // way the literal-union row below it already does. These two rows are the
    // first that genuinely feed `classifyDiscriminatorFieldType` a
    // brace-rooted union — §Fix's witness item 4, inherited from bug 0096.
    const observed: readonly LoadRow[] = [
      animalDoc("D — union arms, by kind", "{a: integer} | {b: string}", true),
      animalDoc("D — union arms, implicit", "{a: integer} | {b: string}", false),
      animalDoc("D — single group, by kind", '{ type: "x" }', true),
      animalDoc("D — single group, implicit", '{ type: "x" }', false),
      animalDoc("D — interior union, by kind", '{ type: "x" | "y" }', true),
      animalDoc("D — interior union, implicit", '{ type: "x" | "y" }', false),
      animalDoc("D — literal union, by kind", '"a" | "b"', true),
      animalDoc("D — literal union, implicit", '"a" | "b"', false),
      animalDoc("D — empty group, by kind", "{}", true),
      animalDoc("D — empty group, implicit", "{}", false),
    ];

    expect(observed).toEqual([
      {
        label: "D — union arms, by kind",
        diagnostics: [],
        schemas: catDogAnimal("{a:integer}|{b:string}"),
      },
      {
        label: "D — union arms, implicit",
        diagnostics: [missingDiscriminatorLine("Animal")],
        schemas: catDogAnimal("{a:integer}|{b:string}"),
      },
      {
        label: "D — single group, by kind",
        diagnostics: [nestedDiscriminatorLine("kind", "Animal")],
        schemas: catDogAnimal('{type:"x"}'),
      },
      {
        label: "D — single group, implicit",
        diagnostics: [missingDiscriminatorLine("Animal")],
        schemas: catDogAnimal('{type:"x"}'),
      },
      {
        label: "D — interior union, by kind",
        diagnostics: [nestedDiscriminatorLine("kind", "Animal")],
        schemas: catDogAnimal('{type:"x"|"y"}'),
      },
      {
        label: "D — interior union, implicit",
        diagnostics: [missingDiscriminatorLine("Animal")],
        schemas: catDogAnimal('{type:"x"|"y"}'),
      },
      {
        // The parity control: the literal-union spelling of the same shape
        // loads clean under an explicit `by`, which is the disposition §Fix
        // brings the object-union spelling to once the field survives capture.
        label: "D — literal union, by kind",
        diagnostics: [],
        schemas: catDogAnimal('"a"|"b"'),
      },
      {
        label: "D — literal union, implicit",
        diagnostics: [missingDiscriminatorLine("Animal")],
        schemas: catDogAnimal('"a"|"b"'),
      },
      {
        label: "D — empty group, by kind",
        diagnostics: [emptySchemaBodyLine("{}"), nestedDiscriminatorLine("kind", "Animal")],
        schemas: catDogAnimal("{}"),
      },
      {
        label: "D — empty group, implicit",
        diagnostics: [emptySchemaBodyLine("{}"), missingDiscriminatorLine("Animal")],
        schemas: catDogAnimal("{}"),
      },
    ]);
  });
});
